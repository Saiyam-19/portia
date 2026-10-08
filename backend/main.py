import logging
import os
import json
from datetime import datetime, timezone
from pathlib import Path
import uvicorn

from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name(".env"))

from langchain_core.messages import HumanMessage, AIMessage, ToolMessage

from logging_config import setup_logging
from auth import get_current_user
from agent import stream_response
from database import get_db
from models import CHAT_MODELS, ModelChoice, ModelConfigurationError, model_settings

load_dotenv()
setup_logging()

log = logging.getLogger(__name__)

ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",")]
ALLOWED_ORIGIN_REGEX = os.environ.get("ALLOWED_ORIGIN_REGEX", "")

app = FastAPI(title="Plisto API", version="0.1.0")


@app.get("/health")
async def health():
    """Liveness only; does not imply working credentials or inference."""
    return {"status": "ok"}


@app.get("/ready")
async def readiness():
    missing = [name for name in ("SUPABASE_URL", "SUPABASE_SECRET_KEY") if not os.getenv(name)]
    try:
        for model_choice in CHAT_MODELS:
            model_settings("main", model_choice)
    except ModelConfigurationError:
        missing.append("Chat model configuration is unavailable.")
    if missing:
        return JSONResponse(status_code=503, content={"status": "not_configured", "missing": missing})
    return {"status": "configured", "note": "Credentials present; upstream connectivity not tested."}

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    log.exception("Unhandled error %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=ALLOWED_ORIGIN_REGEX or None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Models ───────────────────────────────────────────────────────────────────

class StreamRequest(BaseModel):
    message: str
    model: ModelChoice = "model-1"

class FormResponseRequest(BaseModel):
    tool_call_id: str
    model: ModelChoice = "model-1"
    data: dict[str, str] = {}
    note: str = ""
    cancelled: bool = False


# ── Helpers ──────────────────────────────────────────────────────────────────

def _load_lc_messages(db, conversation_id: str):
    rows = (
        db.table("messages")
        .select("role, content, tool_calls, tool_call_id")
        .eq("conversation_id", conversation_id)
        .order("created_at")
        .execute()
    ).data
    msgs = []
    for m in rows:
        if m["role"] == "user":
            msgs.append(HumanMessage(content=m["content"]))
        elif m["role"] == "assistant":
            if m.get("tool_calls"):
                msgs.append(AIMessage(content=m["content"] or "", tool_calls=m["tool_calls"]))
            else:
                msgs.append(AIMessage(content=m["content"]))
        elif m["role"] == "tool":
            msgs.append(ToolMessage(content=m["content"], tool_call_id=m["tool_call_id"]))
    return msgs


def _sse_stream(db, conversation_id: str, lc_messages, *, model_choice: ModelChoice = "model-1", title_update: str | None = None):
    """Return a StreamingResponse that runs the agent and saves all messages."""

    async def generator():
        full_response = ""
        has_form_card = False
        try:
            async for event in stream_response(lc_messages, model_choice):
                if event["type"] == "text":
                    full_response += event["text"]
                    yield f"data: {json.dumps({'text': event['text']})}\n\n"

                elif event["type"] == "tool_start":
                    log.info("Tool start  conv=%s tool=%s label=%r", conversation_id, event["tool"], event["label"])
                    yield f"data: {json.dumps({'tool_start': event['tool'], 'label': event['label']})}\n\n"

                elif event["type"] == "tool_end":
                    log.info("Tool end    conv=%s tool=%s", conversation_id, event["tool"])
                    yield f"data: {json.dumps({'tool_end': event['tool']})}\n\n"

                elif event["type"] == "card":
                    has_form_card = True
                    log.info("Form card   conv=%s tool_call_id=%s", conversation_id, event["tool_call_id"])
                    yield f"data: {json.dumps({'card': {'tool_call_id': event['tool_call_id'], **event['data']}})}\n\n"

                elif event["type"] == "ai_with_tools":
                    db.table("messages").insert({
                        "conversation_id": conversation_id,
                        "role": "assistant",
                        "content": event["content"],
                        "tool_calls": event["tool_calls"],
                    }).execute()

                elif event["type"] == "tool_result":
                    db.table("messages").insert({
                        "conversation_id": conversation_id,
                        "role": "tool",
                        "content": event["content"],
                        "tool_call_id": event["tool_call_id"],
                    }).execute()

            # Save final text response (skip if form card — preamble already in ai_with_tools)
            if full_response and not has_form_card:
                db.table("messages").insert({
                    "conversation_id": conversation_id,
                    "role": "assistant",
                    "content": full_response,
                }).execute()

            now = datetime.now(timezone.utc).isoformat()
            update: dict = {"updated_at": now}
            if title_update:
                update["title"] = title_update
            db.table("conversations").update(update).eq("id", conversation_id).execute()

            log.info("Stream done conv=%s chars=%d form_card=%s", conversation_id, len(full_response), has_form_card)
            yield f"data: {json.dumps({'done': True})}\n\n"

        except ModelConfigurationError:
            log.exception("Model configuration error conv=%s", conversation_id)
            yield f"data: {json.dumps({'error': 'The selected model is unavailable. Please try again later.'})}\n\n"
        except TimeoutError:
            yield f"data: {json.dumps({'error': 'The request timed out. Please try one port at a time.'})}\n\n"
        except Exception:
            log.exception("Stream error conv=%s", conversation_id)
            yield f"data: {json.dumps({'error': 'Something went wrong. Please try again.'})}\n\n"

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


def _verify_conversation(db, conversation_id: str, user_id: str):
    conv = (
        db.table("conversations")
        .select("id")
        .eq("id", conversation_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not conv.data:
        raise HTTPException(status_code=404, detail="Conversation not found")


# ── Conversations ─────────────────────────────────────────────────────────────

@app.post("/conversations", status_code=201)
async def create_conversation(user: dict = Depends(get_current_user)):
    db = get_db()
    result = db.table("conversations").insert({
        "user_id": user["sub"],
        "title": "New Conversation",
    }).execute()
    log.info("Created conversation %s for user %s", result.data[0]["id"], user["sub"])
    return result.data[0]


@app.get("/conversations")
async def list_conversations(user: dict = Depends(get_current_user)):
    db = get_db()
    result = (
        db.table("conversations")
        .select("id, title, updated_at")
        .eq("user_id", user["sub"])
        .order("updated_at", desc=True)
        .execute()
    )
    return result.data


@app.get("/conversations/{conversation_id}/messages")
async def get_messages(conversation_id: str, user: dict = Depends(get_current_user)):
    db = get_db()
    _verify_conversation(db, conversation_id, user["sub"])

    all_rows = (
        db.table("messages")
        .select("id, role, content, tool_calls, tool_call_id, created_at")
        .eq("conversation_id", conversation_id)
        .order("created_at")
        .execute()
    ).data

    # Build lookup: tool_call_id → tool row (for form response lookup)
    tool_responses = {
        m["tool_call_id"]: m
        for m in all_rows
        if m["role"] == "tool" and m.get("tool_call_id")
    }

    result = []
    for m in all_rows:
        if m["role"] == "user":
            result.append({"id": m["id"], "role": "user", "content": m["content"], "created_at": m["created_at"]})

        elif m["role"] == "assistant" and not m.get("tool_calls"):
            result.append({"id": m["id"], "role": "assistant", "content": m["content"], "created_at": m["created_at"]})

        elif m["role"] == "assistant" and m.get("tool_calls"):
            ask = next((tc for tc in m["tool_calls"] if tc["name"] == "ask_user_input"), None)
            if ask:
                resp = tool_responses.get(ask["id"])
                result.append({
                    "id": m["id"],
                    "role": "assistant",
                    "content": m["content"],
                    "form_card": {
                        "tool_call_id": ask["id"],
                        "title": ask["args"].get("title", ""),
                        "fields": ask["args"].get("fields", []),
                        "response": {
                            "content": resp["content"],
                            "cancelled": resp["content"].startswith("Cancelled"),
                        } if resp else None,
                    },
                    "created_at": m["created_at"],
                })
            # Non-form tool-call rows (get_vessel, consult_port_agent, etc.) are excluded from
            # the chat display — they're internal scaffolding; only the final text message matters.

    return result


# ── Streaming ─────────────────────────────────────────────────────────────────

@app.post("/conversations/{conversation_id}/stream")
async def stream_message(
    conversation_id: str,
    request: StreamRequest,
    user: dict = Depends(get_current_user),
):
    db = get_db()
    _verify_conversation(db, conversation_id, user["sub"])

    is_first = len(db.table("messages").select("id").eq("conversation_id", conversation_id).execute().data) == 0

    db.table("messages").insert({
        "conversation_id": conversation_id,
        "role": "user",
        "content": request.message,
    }).execute()

    lc_messages = _load_lc_messages(db, conversation_id)
    log.info("Stream start conv=%s message=%r", conversation_id, request.message[:120])

    title_update = (request.message[:60] + ("…" if len(request.message) > 60 else "")) if is_first else None
    return _sse_stream(db, conversation_id, lc_messages, model_choice=request.model, title_update=title_update)


@app.post("/conversations/{conversation_id}/form_response")
async def form_response(
    conversation_id: str,
    request: FormResponseRequest,
    user: dict = Depends(get_current_user),
):
    db = get_db()
    _verify_conversation(db, conversation_id, user["sub"])

    if request.cancelled:
        parts = ["Cancelled."]
    else:
        parts = [f"{k}: {v}" for k, v in request.data.items() if v.strip()]
    if request.note.strip():
        parts.append(f"\nNote: {request.note.strip()}")
    content = "\n".join(parts)

    db.table("messages").insert({
        "conversation_id": conversation_id,
        "role": "tool",
        "content": content,
        "tool_call_id": request.tool_call_id,
    }).execute()

    lc_messages = _load_lc_messages(db, conversation_id)
    log.info("Form response conv=%s tool_call_id=%s cancelled=%s", conversation_id, request.tool_call_id, request.cancelled)

    return _sse_stream(db, conversation_id, lc_messages, model_choice=request.model)


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8080, reload=True)
