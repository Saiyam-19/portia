"""Explicit model selection; the default can never route to a paid endpoint."""
import os

from dotenv import load_dotenv
from pathlib import Path
from typing import Literal

load_dotenv(Path(__file__).with_name(".env"))

ModelChoice = Literal["model-1", "model-2"]
# Private mapping: clients send only the public aliases.
CHAT_MODELS = {
    "model-1": "openai/gpt-6.1-sol",
    "model-2": "anthropic/claude-opus-5.5",
}


class ModelConfigurationError(ValueError):
    pass


def model_settings(role: str, model_choice: ModelChoice | None = None) -> dict:
    if model_choice is not None and model_choice not in CHAT_MODELS:
        raise ModelConfigurationError("Invalid model selection.")
    provider = "openrouter" if model_choice else os.getenv("LLM_PROVIDER", "openrouter").lower()
    if provider not in {"openrouter", "anthropic"}:
        raise ModelConfigurationError("LLM_PROVIDER must be openrouter or anthropic.")
    paid = os.getenv("LLM_ALLOW_PAID", "false").lower() == "true"
    default = "inclusionai/ling-3.0-flash-sante:free" if provider == "openrouter" else "claude-sonnet-4-6"
    model = CHAT_MODELS[model_choice] if model_choice else os.getenv(f"{role.upper()}_MODEL", default)
    if not paid and (provider != "openrouter" or not (model.endswith(":free") or model == "openrouter/free")):
        raise ModelConfigurationError("Paid models require explicit LLM_ALLOW_PAID=true.")
    key_name = "OPENROUTER_API_KEY" if provider == "openrouter" else "ANTHROPIC_API_KEY"
    if not os.getenv(key_name):
        raise ModelConfigurationError(f"Configure {key_name} on the backend to enable chat.")
    return {"provider": provider, "model": model, "paid": paid, "key_name": key_name}


def create_chat_model(role: str, *, streaming: bool, model_choice: ModelChoice | None = None):
    settings = model_settings(role, model_choice)
    common = dict(
        model=settings["model"],
        streaming=streaming,
        max_tokens=int(os.getenv("LLM_MAX_TOKENS", "4096")),
        tags=[f"{role}_model"],
    )
    if settings["provider"] == "anthropic":
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(**common, timeout=60, max_retries=1)

    from langchain_openrouter import ChatOpenRouter
    routing = {"require_parameters": True, "data_collection": "deny", "zdr": True}
    if not settings["paid"]:
        routing["max_price"] = {"prompt": 0, "completion": 0, "request": 0}
    # OpenRouter's SDK measures timeout in milliseconds; Anthropic uses seconds.
    return ChatOpenRouter(
        **common, timeout=60_000, max_retries=0,
        reasoning={"effort": "low"}, openrouter_provider=routing,
    )
