# Architecture and API

## Request flow

1. Next.js authenticates users through Supabase. Protected dashboard routes require a session.
2. The browser calls FastAPI with its Supabase bearer token and a public model alias.
3. FastAPI verifies the signed token and conversation ownership, persists the input, and reconstructs conversation history.
4. The main LangGraph agent can consult a port specialist, request vessel information, or ask for structured user input.
5. Port specialists receive the bundled documents for the exact supported port slug and use the bounded Decimal calculator for arithmetic.
6. FastAPI streams text, tool progress, or a form card using server-sent events and saves messages for later reloads.

Supabase's backend secret can bypass RLS, so API ownership checks remain essential in addition to the database policies.

## Model boundary

Clients send `model-1` or `model-2`; omitted selections default to `model-1`. The Pydantic request schemas reject other values. Provider IDs live in `backend/models.py` and do not enter the frontend bundle.

Main agents are cached by selection; specialists are cached by port slug and selection. LangGraph request configuration carries the selection to specialists, preventing concurrent requests from sharing mutable global model state.

The selection is stored per conversation in browser local storage, not in the database. Another browser/device starts with Model 1. Response prompts request neutral model naming, but that instruction is not an absolute guarantee against model self-identification.

## API

All conversation endpoints require `Authorization: Bearer <Supabase access token>`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Process liveness |
| `GET` | `/ready` | Required configuration presence; no upstream connectivity check |
| `POST` | `/conversations` | Create a conversation for the current user |
| `GET` | `/conversations` | List the current user's conversations |
| `GET` | `/conversations/{id}/messages` | Read display history and form state |
| `POST` | `/conversations/{id}/stream` | Save a user question and stream the agent response |
| `POST` | `/conversations/{id}/form_response` | Save a structured reply and resume the agent |

Question body:

```json
{"message":"Which ports are supported?","model":"model-1"}
```

Form body:

```json
{
  "tool_call_id": "the-id-from-the-form-card",
  "model": "model-2",
  "data": {"vessel_name": "Example vessel"},
  "note": "",
  "cancelled": false
}
```

Streaming responses use `text/event-stream`, with JSON in each `data:` event. The UI handles `text`, `tool_start`, `tool_end`, `card`, `done`, and `error` fields. Configuration and unexpected provider errors return generic user-facing messages.

## Data and constraints

- `conversations` belongs to a user; `messages` belongs to a conversation. Tool calls/results preserve agent context while display history filters internal scaffolding.
- A form card pauses the current stream; submitting or cancelling it calls the form-response endpoint.
- Agent runs have a 240-second overall timeout and 12-step recursion limits. OpenRouter model calls have a 60-second timeout with no automatic retry; output tokens default to 4,096.
- Calculator execution is a restricted arithmetic evaluator, not arbitrary Python execution.
- Tariffs are static files loaded into specialist prompts. There is no document upload, retrieval index, automatic refresh, or organization document access layer.
- Source documents, tax assumptions, exchange rates, and applicable dates still require review. Passing arithmetic tests does not validate tariff interpretation.
