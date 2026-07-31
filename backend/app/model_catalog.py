"""Ported from the Android app's `LlmProviderType.kt` / `ModelCatalog.kt` -- same provider ids,
base URLs and per-provider model catalogs, so both clients offer identical choices.
"""
from __future__ import annotations

from dataclasses import dataclass

AUTO_MODEL_ID = "auto"

DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1"
DEFAULT_CLAUDE_BASE_URL = "https://api.anthropic.com/v1"
DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1"

PROVIDER_LABELS = {
    "GEMINI": "Google Gemini API",
    "CLAUDE": "Anthropic Claude API",
    "OPENAI": "OpenAI API / OpenRouter",
    "DEEPSEEK": "DeepSeek API (empfohlen)",
}


@dataclass(frozen=True)
class ModelOption:
    id: str
    label: str
    price_tier: str


_GEMINI = [
    ModelOption("gemini-3.5-flash-lite", "Gemini 3.5 Flash Lite (schnell, Standard)", "€"),
    ModelOption("gemini-3.6-flash", "Gemini 3.6 Flash (Flaggschiff)", "€€"),
]
_CLAUDE = [
    ModelOption("claude-3-5-haiku-latest", "Claude 3.5 Haiku (schnell)", "€"),
    ModelOption("claude-3-5-sonnet-latest", "Claude 3.5 Sonnet (Allrounder)", "€€"),
    ModelOption("claude-3-opus-latest", "Claude 3 Opus (Tiefenanalyse)", "€€€"),
]
_OPENAI = [
    ModelOption("deepseek/deepseek-v4-flash", "DeepSeek v4 Flash (schnell, empfohlen)", "€"),
    ModelOption("google/gemini-3.5-flash-lite", "Gemini 3.5 Flash Lite", "€"),
    ModelOption("openrouter/auto-beta", "OpenRouter Auto (dynamisch)", "€"),
]
_DEEPSEEK = [
    ModelOption("deepseek-v4-flash", "DeepSeek V4 Flash (schnell, empfohlen)", "€"),
    ModelOption("deepseek-v4-pro", "DeepSeek V4 Pro (Flaggschiff, Tiefenanalyse)", "€€"),
]
_CATALOG: dict[str, list[ModelOption]] = {
    "GEMINI": _GEMINI,
    "CLAUDE": _CLAUDE,
    "OPENAI": _OPENAI,
    "DEEPSEEK": _DEEPSEEK,
}


def options_for(provider_type: str) -> list[ModelOption]:
    return _CATALOG.get(provider_type, [])


def is_known_model(provider_type: str, model_id: str) -> bool:
    """Whether `model_id` is one of this provider's curated catalog entries. A manually entered
    model id (see "Manuelle Eingabe" in LlmConfigPage.tsx) is deliberately NOT rejected for being
    unknown here -- provider catalogs move faster than this list, and OpenAI-compatible endpoints
    (OpenRouter, Ollama, ...) serve arbitrary model ids. Whether such a model actually works is
    settled by really calling it, see llm_providers.test_connection."""
    return any(m.id == model_id for m in options_for(provider_type))


def resolve(provider_type: str, selection: str, purpose: str = "CHAT") -> str:
    """`purpose` is "CHAT" (fast/light model) or "ANALYSIS" (flagship model) -- mirrors
    `ModelCatalog.resolve`'s per-purpose "Automatisch" pick."""
    if selection != AUTO_MODEL_ID:
        return selection
    options = options_for(provider_type)
    if not options:
        return selection
    return options[0].id if purpose == "CHAT" else options[-1].id
