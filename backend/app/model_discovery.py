"""Live model/price discovery from the providers' own APIs.

Two independent jobs, both explicitly triggered by the admin (never automatically on a request
path -- these are extra network round trips to third parties):

1. **Prices** (Einstellungen -> Logging -> Token & Kosten): OpenRouter's public model list is the
   only usable source. It carries per-token prices for the models it proxies -- which includes
   Anthropic, OpenAI, Google and DeepSeek models -- and needs no API key. The vendors' own
   endpoints deliberately do NOT serve prices: OpenAI's `/v1/models`, Anthropic's `/v1/models`,
   Gemini's `models?key=` and DeepSeek's `/models` all return ids/metadata only. So price fetching
   goes through OpenRouter regardless of which provider is configured, and a model OpenRouter
   doesn't carry stays without a price rather than getting a guessed one.

2. **Model lists** (Einstellungen -> LLM-Konfiguration): each provider's own endpoint, with that
   provider's key, so the picker can follow new model releases without a GlucoSphere-Web release.
   The raw lists are long and full of non-chat entries (embeddings, TTS, image, moderation), so
   `pick_relevant` narrows them to at most 4 -- ordered fast-first/flagship-last, the same
   convention `model_catalog.resolve` relies on for "Automatisch".
"""
from __future__ import annotations

import re
import time
from typing import Any

import httpx

from . import model_catalog as catalog

_TIMEOUT = httpx.Timeout(30.0, connect=10.0)

OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models"
GEMINI_MODELS_URL = "https://generativelanguage.googleapis.com/v1beta/models"

# Everything the price table and the picker are priced/quoted in -- OpenRouter publishes USD.
PRICE_CURRENCY = "USD"


class DiscoveryError(RuntimeError):
    pass


# ---------------------------------------------------------------------------
# Prices (OpenRouter)
# ---------------------------------------------------------------------------

async def fetch_openrouter_prices() -> dict[str, dict[str, float]]:
    """{openrouter_model_id: {"input": <USD per 1M prompt tokens>, "output": <per 1M completion>}}.
    OpenRouter reports per-TOKEN prices as strings; free models legitimately report "0"."""
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(OPENROUTER_MODELS_URL)
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPError as exc:
        raise DiscoveryError(f"OpenRouter-Preisliste nicht erreichbar: {exc}") from exc
    except ValueError as exc:
        raise DiscoveryError(f"OpenRouter-Preisliste unlesbar: {exc}") from exc

    prices: dict[str, dict[str, float]] = {}
    for entry in data.get("data") or []:
        model_id = entry.get("id")
        pricing = entry.get("pricing") or {}
        if not model_id:
            continue
        try:
            prompt_price = float(pricing.get("prompt", "0") or 0)
            completion_price = float(pricing.get("completion", "0") or 0)
        except (TypeError, ValueError):
            continue
        prices[model_id] = {"input": prompt_price * 1_000_000, "output": completion_price * 1_000_000}
    if not prices:
        raise DiscoveryError("OpenRouter lieferte keine Preisdaten.")
    return prices


# The OpenRouter namespace each of our provider types maps to. OPENAI is the odd one out: that
# setting is also what people point at OpenRouter itself (or a local Ollama), so its stored model
# id may already be fully namespaced ("deepseek/deepseek-v4-flash") -- the exact-id candidate below
# covers that case before the namespace guess is tried.
_OPENROUTER_NAMESPACE = {
    "GEMINI": "google",
    "CLAUDE": "anthropic",
    "OPENAI": "openai",
    "DEEPSEEK": "deepseek",
}


# Release/alias suffixes the vendors append but OpenRouter does not carry, stripped one at a time
# (checked live against both catalogs): "-latest", "-preview", a date stamp ("-20251001",
# "-2025-05-06") or a bare month-day ("-05-06", as in gemini-2.5-pro-preview-05-06).
_ALIAS_SUFFIX = re.compile(r"-(latest|preview|\d{8}|\d{4}-\d{2}-\d{2}|\d{2}-\d{2})$")


def _price_candidates(provider_type: str, model: str) -> list[str]:
    """Ordered OpenRouter ids to try for one of our provider/model pairs, most specific first."""
    model = model.strip()
    candidates = [model]
    namespace = _OPENROUTER_NAMESPACE.get(provider_type)
    if not namespace or "/" in model:
        return candidates
    variants = [model]
    # Peel alias suffixes progressively: "gemini-2.5-pro-preview-05-06" -> "...-preview" -> "...-pro".
    current = model
    while True:
        stripped = _ALIAS_SUFFIX.sub("", current)
        if stripped == current:
            break
        variants.append(stripped)
        current = stripped
    # Vendors write versions with dashes where OpenRouter writes dots
    # ("claude-haiku-4-5" -> "anthropic/claude-haiku-4.5").
    for variant in list(variants):
        dotted = re.sub(r"(?<=\d)-(?=\d)", ".", variant)
        if dotted not in variants:
            variants.append(dotted)
    candidates.extend(f"{namespace}/{v}" for v in variants)
    return candidates


def match_price(provider_type: str, model: str, prices: dict[str, dict[str, float]]) -> dict[str, float] | None:
    """Resolves one provider/model pair against the OpenRouter price list, or None if it isn't
    carried there (a model too new, too old, or simply not proxied by OpenRouter -- then it keeps
    no price rather than a wrong one)."""
    candidates = _price_candidates(provider_type, model)
    for candidate in candidates:
        if candidate in prices:
            return prices[candidate]
    # OpenRouter sometimes pins a revision the vendor id doesn't carry ("gemini-2.0-flash" vs
    # "google/gemini-2.0-flash-001") -- take the shortest such id, i.e. the most canonical one.
    # ":batch"/":free" style variants are skipped: different endpoint, different price.
    for candidate in candidates:
        if "/" not in candidate:
            continue
        extended = sorted((m for m in prices if m.startswith(f"{candidate}-") and ":" not in m), key=len)
        if extended:
            return prices[extended[0]]
    # Last resort: the bare model name in any namespace -- that is how a DeepSeek model configured
    # through OpenRouter, or vice versa, still finds its price.
    bare = model.split("/")[-1].strip().lower()
    if bare:
        for model_id, price in prices.items():
            if model_id.split("/")[-1].lower() == bare:
                return price
    return None


# ---------------------------------------------------------------------------
# Model lists (each provider's own API)
# ---------------------------------------------------------------------------

async def _get_json(url: str, headers: dict[str, str], provider_label: str) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code in (401, 403):
                raise DiscoveryError(f"{provider_label}: API-Key abgelehnt ({resp.status_code}).")
            resp.raise_for_status()
            return resp.json()
    except DiscoveryError:
        raise
    except httpx.HTTPError as exc:
        raise DiscoveryError(f"{provider_label}: Modell-Liste nicht abrufbar ({exc}).") from exc
    except ValueError as exc:
        raise DiscoveryError(f"{provider_label}: Antwort unlesbar ({exc}).") from exc


async def fetch_model_ids(provider_type: str, settings: dict) -> list[str]:
    """Raw, unfiltered model ids straight from the provider -- narrowing happens in pick_relevant."""
    if provider_type == "OPENAI":
        key = settings.get("openAiApiKey", "")
        if not key:
            raise DiscoveryError("Kein API-Key hinterlegt.")
        base = settings.get("openAiBaseUrl") or catalog.DEFAULT_OPENAI_BASE_URL
        data = await _get_json(f"{base.rstrip('/')}/models", {"Authorization": f"Bearer {key}"}, "OpenAI/OpenRouter")
        return [m["id"] for m in data.get("data") or [] if m.get("id")]
    if provider_type == "CLAUDE":
        key = settings.get("claudeApiKey", "")
        if not key:
            raise DiscoveryError("Kein API-Key hinterlegt.")
        base = settings.get("claudeBaseUrl") or catalog.DEFAULT_CLAUDE_BASE_URL
        data = await _get_json(
            f"{base.rstrip('/')}/models",
            {"x-api-key": key, "anthropic-version": "2023-06-01"},
            "Anthropic Claude",
        )
        return [m["id"] for m in data.get("data") or [] if m.get("id")]
    if provider_type == "GEMINI":
        key = settings.get("geminiApiKey", "")
        if not key:
            raise DiscoveryError("Kein API-Key hinterlegt.")
        data = await _get_json(f"{GEMINI_MODELS_URL}?key={key}&pageSize=200", {}, "Google Gemini")
        return [
            m["name"].split("/", 1)[-1]
            for m in data.get("models") or []
            # Only models that can actually answer a chat request -- the same list also carries
            # embedding-only and media models, which would just clutter the picker.
            if m.get("name") and "generateContent" in (m.get("supportedGenerationMethods") or [])
        ]
    if provider_type == "DEEPSEEK":
        key = settings.get("deepseekApiKey", "")
        if not key:
            raise DiscoveryError("Kein API-Key hinterlegt.")
        base = catalog.DEFAULT_DEEPSEEK_BASE_URL.rstrip("/")
        # DeepSeek's /models sits at the API root, not under /v1 -- and it does require the key.
        data = await _get_json(f"{base.removesuffix('/v1')}/models", {"Authorization": f"Bearer {key}"}, "DeepSeek")
        return [m["id"] for m in data.get("data") or [] if m.get("id")]
    raise DiscoveryError(f"Unbekannter Provider: {provider_type}")


# Non-chat models every one of these catalogs mixes in. Substring match on the id, lowercased.
_EXCLUDE_MARKERS = (
    "embed", "embedding", "tts", "whisper", "audio", "speech", "transcribe", "realtime",
    "image", "imagen", "dall-e", "veo", "vision-only", "moderation", "guard", "rerank",
    "aqa", "gemma", "learnlm", "codestral", "davinci", "babbage", "instruct-beta",
    "search-preview", "computer-use", "-edit", "-tuning",
)
# "Fast/cheap" vs "flagship" markers -- the ordering contract for `resolve`: with "Automatisch",
# CHAT takes the first entry (fast) and ANALYSIS the last (flagship). See model_catalog.resolve.
_FAST_MARKERS = ("flash-lite", "flash", "mini", "haiku", "lite", "small", "turbo", "nano")
_FLAGSHIP_MARKERS = ("opus", "sonnet", "pro", "ultra", "large", "reasoner", "max")
# The cheapest tier every vendor ships ("…-flash-lite", "…-lite", "…-nano"). Always worth one slot:
# it is what "Automatisch" picks for chat, it is the entry a cost-conscious setup actually wants,
# and by pure version ranking it loses to the pricier plain "flash"/"mini" of the same generation.
_LITE_MARKERS = ("flash-lite", "lite", "nano")


def _has_marker(model_id: str, markers: tuple[str, ...]) -> bool:
    """Marker match on whole id segments, NOT raw substrings: "gemini" contains "mini", so a plain
    `in` test classified every single Gemini model as a fast/cheap one and left the flagship bucket
    permanently empty (which is how gemini-*-pro and gemini-*-flash-lite both fell out of the
    picker). Ids are split on any non-alphanumeric separator, so multi-word markers like
    "flash-lite" still match "gemini-3.1-flash-lite"."""
    tokens = " ".join(t for t in re.split(r"[^a-z0-9]+", model_id.lower()) if t)
    haystack = f" {tokens} "
    return any(
        f" {' '.join(t for t in re.split(r'[^a-z0-9]+', marker.lower()) if t)} " in haystack
        for marker in markers
    )


# Release/alias suffixes that say nothing about *which* model this is: an alias word, a packaging
# variant of the same model (a latency-priced "-fast", a context-size "-16k", a tool-specialized
# "-customtools"), or a date stamp in any of the shapes these catalogs use ("-20251001", "-0613",
# "-2025-05-06", "-05-06"). Stripped repeatedly, so "gemini-2.5-pro-preview-05-06" reduces all the
# way to "gemini-2.5-pro" and collapses onto the plain entry.
#
# Capability words that DO identify a different model (-pro, -mini, -nano, -flash, -haiku, …) are
# deliberately absent: "gpt-5.6-luna-pro" must not collapse onto "gpt-5.6-luna".
_VARIANT_SUFFIX = re.compile(
    r"-(latest|preview|exp|fast|customtools|thinking|online|\d+k"
    r"|\d{4}-\d{2}-\d{2}|\d{2}-\d{2}|\d{8}|\d{6}|\d{4})$"
)


def _canonical_base(model_id: str) -> str:
    current = model_id
    while True:
        stripped = _VARIANT_SUFFIX.sub("", current)
        if stripped == current or not stripped:
            return current
        current = stripped


def _version_score(model_id: str) -> float:
    """Highest version-looking number in the id ("gemini-3.5-flash" -> 3.5), so newer models sort
    ahead of older ones without hard-coding any release order. Date stamps are stripped first, not
    just filtered by size -- "gpt-3.5-turbo-0613" would otherwise score 613 and beat every actually
    current model (live-observed against the real OpenAI catalog)."""
    numbers = [float(n) for n in re.findall(r"\d+(?:\.\d+)?", _canonical_base(model_id).replace("-", "."))]
    # Parameter counts and leftover stamps ("70b", "20250114") are not version numbers.
    numbers = [n for n in numbers if n < 100]
    return max(numbers) if numbers else 0.0


MAX_RELEVANT_MODELS = 4


def pick_relevant(model_ids: list[str], limit: int = MAX_RELEVANT_MODELS) -> list[str]:
    """At most `limit` chat-capable models, ordered fast-first then flagship-last.

    Deliberately a heuristic, not a curated list -- the whole point is that it keeps working for
    models that did not exist when this shipped. Anything it gets wrong is still reachable through
    "Manuelle Eingabe" in the LLM config, which accepts any model id."""
    usable = [m for m in model_ids if not any(marker in m.lower() for marker in _EXCLUDE_MARKERS)]
    if not usable:
        return []
    # Deduplicate alias pairs ("claude-x-latest" next to "claude-x-20250101", "deepseek-v4-flash"
    # next to "deepseek-v4-flash-0731") -- keep the shorter, more stable-looking id.
    by_base: dict[str, str] = {}
    for model_id in sorted(usable, key=len):
        by_base.setdefault(_canonical_base(model_id), model_id)
    usable = list(by_base.values())

    def rank(model_id: str) -> tuple[float, int, str]:
        # Newest first; on a tie the plainest id wins, so "claude-opus-5" is preferred over a
        # priced-up variant like "claude-opus-5-fast".
        return (-_version_score(model_id), len(model_id), model_id)

    fast = sorted([m for m in usable if _has_marker(m, _FAST_MARKERS)], key=rank)
    flagship = sorted([m for m in usable if _has_marker(m, _FLAGSHIP_MARKERS) and m not in fast], key=rank)
    rest = sorted([m for m in usable if m not in fast and m not in flagship], key=rank)

    # Guarantee the cheapest tier a slot: without this, two same-generation fast models (e.g.
    # gemini-3.6-flash and gemini-3.6-pro-flash) can fill the fast half and push the newest
    # "…-flash-lite" out entirely -- exactly the model most setups want as the everyday default.
    lite = [m for m in fast if _has_marker(m, _LITE_MARKERS)]
    if lite:
        newest_lite = lite[0]  # `fast` is already version-sorted
        fast = [newest_lite] + [m for m in fast if m != newest_lite]

    half = max(1, limit // 2)
    picked_fast = fast[:half]
    # Reversed: the whole list reads cheap -> capable, and the LAST entry is the best-ranked
    # flagship, which is what "Automatisch" hands the dashboard analysis.
    picked_flagship = list(reversed(flagship[: limit - len(picked_fast)]))
    result = picked_fast + picked_flagship
    for model_id in rest:
        if len(result) >= limit:
            break
        # Insert unclassifiable models between fast and flagship -- they are neither, and the
        # ordering contract only cares about the first and last entry.
        result.insert(len(picked_fast), model_id)
    return result[:limit]


def price_tier(price: dict[str, float] | None) -> str:
    """The €/€€/€€€ hint the picker shows, derived from the output price per 1M tokens (the side
    that dominates a chat bill here). Empty when no price is known."""
    if not price:
        return ""
    output = price.get("output", 0.0)
    if output <= 0:
        return ""
    if output < 2:
        return "€"
    if output < 15:
        return "€€"
    return "€€€"


async def build_live_catalog(provider_type: str, settings: dict) -> dict[str, Any]:
    """{"models": [{"id", "label", "priceTier"}], "fetchedAt": ms} for one provider -- the shape
    cached in settings["providerModelCache"] and merged into GET /api/providers."""
    model_ids = pick_relevant(await fetch_model_ids(provider_type, settings))
    try:
        prices = await fetch_openrouter_prices()
    except DiscoveryError:
        # Prices are a nice-to-have here; a model list without €-hints is still a useful refresh.
        prices = {}
    return {
        "models": [
            {
                "id": model_id,
                "label": model_id,
                "priceTier": price_tier(match_price(provider_type, model_id, prices)),
            }
            for model_id in model_ids
        ],
        "fetchedAt": int(time.time() * 1000),
    }
