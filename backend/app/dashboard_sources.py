"""Pulls raw glucose readings out of an MCP server for the Übersicht, even though we don't know
that server's tool names/output shape ahead of time (unlike the direct Nightscout API, which has
one fixed, well-known JSON shape -- see nightscout.py). Two focused LLM calls do what a hand-written
per-server parser would otherwise need one of for each MCP server:

  1. Tool-calling (reusing the same machinery as chat, scoped to just this one server's tools) to
     actually fetch the data for the requested window.
  2. A second, narrow extraction call asking the model to turn whatever the tool returned into a
     fixed `[{"t": epochMillis, "v": mgPerDl}]` shape -- deliberately a *second* call rather than
     asking for both tool-calling and structured output in one prompt, since "pick the right tool"
     and "reformat this JSON blob" are both easier for a model to get right in isolation.

Once we have that list, it feeds into nightscout.py's existing NightscoutEntry/compute_metrics --
same deterministic TIR/hypo/hyper formulas regardless of which server the readings came from.

Step 2 (the extraction call) is skipped whenever `_try_deterministic_parse` can confidently
recognize the raw tool output as an already-plain JSON array of readings -- see that function's
docstring. This is the direct answer to "kann man nicht schon serverseitig etwas berechnen, bevor
man das an das LLM schickt": yes, whenever the shape is one we recognize.
"""
from __future__ import annotations

import json
import time
from datetime import datetime, timezone

from . import llm_providers, mcp_client, nightscout, tools

_MAX_FETCH_ITERATIONS = 3
_MAX_EXTRACTION_ATTEMPTS = 2
_EXTRACTION_SYSTEM_PROMPT = (
    "Du wandelst Rohdaten aus einem Diabetes-Datenwerkzeug in ein festes JSON-Format um. "
    "Antworte AUSSCHLIESSLICH mit einem JSON-Array, keine Erklärungen, kein Markdown, keine Code-Fences."
)

_GLUCOSE_KEYS = ("glucose_mgdl", "sgv", "glucosevalue", "bloodglucose", "glucose", "value", "bg", "mgdl")
_TIMESTAMP_KEYS = ("timestamp", "datetime", "recordedat", "measuredat", "date", "time", "t")
_LIST_WRAPPER_KEYS = ("entries", "data", "results", "readings", "values", "records", "items")


def _find_key(item: dict, candidates: tuple[str, ...]) -> str | None:
    lower_map = {str(k).lower(): k for k in item.keys()}
    for cand in candidates:
        if cand in lower_map:
            return lower_map[cand]
    return None


def _parse_timestamp_ms(raw: object) -> int | None:
    if isinstance(raw, bool):
        return None
    if isinstance(raw, (int, float)):
        if raw > 10**12:
            return int(raw)
        if raw > 10**9:
            return int(raw * 1000)
        return None
    if isinstance(raw, str):
        text = raw.strip()
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        try:
            dt = datetime.fromisoformat(text)
        except ValueError:
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp() * 1000)
    return None


def _parse_glucose_mgdl(raw: object) -> float | None:
    try:
        value = float(raw)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    if value <= 0:
        return None
    # Below ~40 is implausible for a live mg/dL CGM reading but a perfectly normal mmol/L one --
    # same heuristic the LLM extraction prompt is told to apply.
    if value < 40:
        value *= 18.0182
    return value


def _try_deterministic_parse(raw_tool_result: str) -> list[nightscout.NightscoutEntry] | None:
    """Server-side fast path, tried before ever calling the LLM: many MCP tools already return a
    plain JSON array of glucose readings with predictable field names (see the real Nightscout-MCP
    shape this was written against: `[{"glucose_mgdl": 194, "timestamp": "...Z", "direction":
    "Flat"}]`). When the shape is confidently recognized, this skips the LLM extraction call
    entirely -- roughly one whole LLM round-trip saved per fetch. Returns None (not []) whenever
    the shape isn't confidently recognized, so the caller falls back to the LLM extraction path
    instead of silently losing data."""
    try:
        data = json.loads(raw_tool_result)
    except (json.JSONDecodeError, ValueError):
        return None
    if isinstance(data, dict):
        for key in _LIST_WRAPPER_KEYS:
            if isinstance(data.get(key), list):
                data = data[key]
                break
    if not isinstance(data, list) or not data or not all(isinstance(item, dict) for item in data):
        return None

    glucose_key = _find_key(data[0], _GLUCOSE_KEYS)
    timestamp_key = _find_key(data[0], _TIMESTAMP_KEYS)
    if glucose_key is None or timestamp_key is None:
        return None

    entries = []
    for item in data:
        v = _parse_glucose_mgdl(item.get(glucose_key))
        t = _parse_timestamp_ms(item.get(timestamp_key))
        if v is not None and t is not None:
            entries.append(nightscout.NightscoutEntry(v, t, str(item.get("direction") or "")))

    # A handful of stray malformed rows is fine, but if the field-name guess was wrong for most of
    # the list, don't trust a mostly-empty result -- fall back to the LLM instead.
    if len(entries) < max(1, int(len(data) * 0.8)):
        return None
    return entries


async def fetch_glucose_entries(server: dict, settings: dict, from_millis: int, to_millis: int) -> list[nightscout.NightscoutEntry] | None:
    """Returns None (not an empty list) whenever anything about the extraction failed/was
    inconclusive, so the caller can tell "genuinely no readings in range" apart from "couldn't
    read this source" and exclude the latter from the combined result instead of skewing it."""
    provider_type = settings.get("llmProviderType")
    if not provider_type:
        return None
    try:
        resolved = await tools.resolve_server_auth(server)
        available = await mcp_client.list_tools(resolved)
    except Exception:  # noqa: BLE001
        return None
    if not available:
        return None

    tool_schemas = [{"name": t.name, "description": t.description, "inputSchema": t.input_schema} for t in available]
    from_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(from_millis / 1000))
    to_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(to_millis / 1000))

    conversation = [{
        "role": "user",
        "content": (
            f"Rufe das passende Werkzeug auf, um alle einzelnen Blutzucker-Sensormesswerte (CGM, in mg/dL) "
            f"zwischen {from_iso} und {to_iso} (UTC) von diesem Server abzurufen. Bevorzuge, falls verfügbar, "
            f"ein Werkzeug für rohe/einzelne Messwerte statt eines nur aggregierten Tages-Durchschnitts."
        ),
    }]
    system_prompt = "Du rufst gezielt genau ein passendes Werkzeug auf, um Blutzuckerdaten abzurufen."
    raw_tool_result: str | None = None

    try:
        for _ in range(_MAX_FETCH_ITERATIONS):
            result = await llm_providers.chat(
                provider_type, settings, system_prompt, conversation, purpose="CHAT", tools=tool_schemas,
            )
            if not result.tool_calls:
                break
            conversation.append({"role": "assistant", "tool_calls": result.tool_calls, "content": result.text})
            for tc in result.tool_calls:
                raw_tool_result = await mcp_client.call_tool(resolved, tc["name"], tc["arguments"])
                conversation.append({"role": "tool", "tool_call_id": tc["id"], "name": tc["name"], "content": raw_tool_result})
    except Exception:  # noqa: BLE001 -- network/timeout errors from the MCP call must exclude
        # this source, not crash the whole /api/dashboard request for every source.
        return None

    if raw_tool_result is None:
        return None

    deterministic = _try_deterministic_parse(raw_tool_result)
    if deterministic is not None:
        return deterministic

    extraction_prompt = (
        "Rohdaten-Ausgabe eines Diabetes-Datenwerkzeugs:\n\n"
        f"{raw_tool_result[:12000]}\n\n"
        "Extrahiere ALLE enthaltenen Blutzucker-Einzelmesswerte (nicht Aggregate/Durchschnitte, falls "
        "Einzelwerte vorhanden sind) als JSON-Array im exakten Format "
        '[{"t": <Unix-Zeitstempel in Millisekunden>, "v": <Wert in mg/dL als Zahl>}, ...]. '
        "Falls Werte in mmol/L vorliegen, rechne sie in mg/dL um (× 18.0182). "
        "Falls keine verwertbaren Messwerte enthalten sind, antworte mit []."
    )

    entries = None
    for _ in range(_MAX_EXTRACTION_ATTEMPTS):
        entries = await _try_extract(provider_type, settings, extraction_prompt)
        if entries is not None:
            break
    return entries


async def _try_extract(provider_type: str, settings: dict, extraction_prompt: str) -> list[nightscout.NightscoutEntry] | None:
    """One attempt at the extraction call + parse. Isolated so `fetch_glucose_entries` can retry
    it a couple of times -- a single malformed-JSON response from the model shouldn't sink the
    whole source when trying again usually succeeds."""
    try:
        extraction = await llm_providers.chat(
            provider_type, settings, _EXTRACTION_SYSTEM_PROMPT,
            [{"role": "user", "content": extraction_prompt}], purpose="ANALYSIS",
        )
    except Exception:  # noqa: BLE001
        return None

    text = extraction.text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:]
    try:
        data = json.loads(text)
    except (json.JSONDecodeError, ValueError):
        return None
    if not isinstance(data, list):
        return None

    entries = []
    for item in data:
        try:
            entries.append(nightscout.NightscoutEntry(float(item["v"]), int(item["t"]), ""))
        except (KeyError, TypeError, ValueError):
            continue
    return entries
