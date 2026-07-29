"""Cloud LLM provider clients -- request/response shapes ported from the Android app's
`GeminiApiProvider.kt` / `ClaudeApiProvider.kt` / `OpenAiApiProvider.kt` (`domain/llm/`). Local
model (LiteRT/Gemma) is intentionally NOT ported (see README "Known limitations": cloud providers
only). Tool-calling (MCP) is implemented separately in `tools.py`/`mcp_client.py`.
"""
from __future__ import annotations

from dataclasses import dataclass

import httpx

from . import model_catalog as catalog

_TIMEOUT = httpx.Timeout(60.0, connect=10.0)


class ProviderError(RuntimeError):
    pass


@dataclass
class ChatResult:
    text: str
    model: str
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    # Native tool/function calls the model wants to make, normalized across providers --
    # {"id": str, "name": str, "arguments": dict}. Empty unless `tools` was passed to `chat()`.
    tool_calls: list[dict] | None = None


def _resolved_model(provider_type: str, model_selection: str, purpose: str) -> str:
    return catalog.resolve(provider_type, model_selection or catalog.AUTO_MODEL_ID, purpose)


# Gemini's function-calling "parameters" schema is a restricted subset of JSON Schema, not the
# full thing -- it rejects unrecognized keywords outright with an HTTP 400 covering the WHOLE
# request (not just the offending tool). A blocklist doesn't hold up here: the first live failure
# was `additionalProperties` (a Nightscout-MCP tool), stripping just that revealed a *second*
# rejected keyword (`exclusiveMinimum`, a different MCP tool) on the very next request. An
# allowlist of Gemini's actually-documented Schema fields is the only approach that doesn't keep
# breaking on the next MCP server with a different schema style.
_GEMINI_SUPPORTED_SCHEMA_KEYS = {
    "type", "format", "description", "nullable", "enum", "items", "properties", "required",
    "minItems", "maxItems", "minLength", "maxLength", "minProperties", "maxProperties",
    "pattern", "example", "anyOf", "propertyOrdering",
}


def _sanitize_schema_for_gemini(schema: object) -> object:
    """Recursively keeps only Gemini-supported JSON Schema keywords. `properties` and `items` are
    handled structurally (their values are nested schemas to recurse into, not values to filter
    against the keyword allowlist) -- a flat "filter every dict's keys against the allowlist"
    approach would incorrectly strip property *names* too, since e.g. "date_from" is obviously not
    itself a schema keyword."""
    if not isinstance(schema, dict):
        return schema
    result: dict[str, object] = {}
    for key, value in schema.items():
        if key == "properties" and isinstance(value, dict):
            result[key] = {prop_name: _sanitize_schema_for_gemini(prop_schema) for prop_name, prop_schema in value.items()}
        elif key == "items":
            result[key] = _sanitize_schema_for_gemini(value)
        elif key == "anyOf" and isinstance(value, list):
            result[key] = [_sanitize_schema_for_gemini(item) for item in value]
        elif key in _GEMINI_SUPPORTED_SCHEMA_KEYS:
            result[key] = value
    return result


def _to_gemini_tools(tools: list[dict]) -> list[dict]:
    return [{"functionDeclarations": [
        {
            "name": t["name"],
            "description": t.get("description", ""),
            "parameters": _sanitize_schema_for_gemini(t.get("inputSchema") or {"type": "object", "properties": {}}),
        }
        for t in tools
    ]}]


async def _chat_gemini(api_key: str, model: str, system_prompt: str, messages: list[dict], tools: list[dict] | None) -> ChatResult:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    contents = []
    for m in messages:
        role = "model" if m["role"] == "assistant" else "user"
        if m.get("tool_calls"):
            # Gemini's newer "thinking" models require the `thoughtSignature` from their own
            # functionCall response to be echoed back on the next turn -- observed live: without
            # it, a second tool-calling turn 400s with "missing a thought_signature in
            # functionCall parts". Harmless no-op for models that don't use it (field just absent).
            parts = []
            for tc in m["tool_calls"]:
                part: dict = {"functionCall": {"name": tc["name"], "args": tc["arguments"]}}
                if tc.get("geminiThoughtSignature"):
                    part["thoughtSignature"] = tc["geminiThoughtSignature"]
                parts.append(part)
        elif m["role"] == "tool":
            parts = [{"functionResponse": {"name": m["name"], "response": {"result": m["content"]}}}]
            role = "user"
        else:
            parts = [{"text": m["content"]}]
        contents.append({"role": role, "parts": parts})
    body: dict = {"systemInstruction": {"parts": [{"text": system_prompt}]}, "contents": contents}
    if tools:
        body["tools"] = _to_gemini_tools(tools)
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(url, params={"key": api_key}, json=body)
    if resp.status_code >= 400:
        raise ProviderError(f"Gemini HTTP {resp.status_code}: {resp.text[:500]}")
    data = resp.json()
    try:
        parts = data["candidates"][0]["content"]["parts"]
    except (KeyError, IndexError) as exc:
        raise ProviderError(f"Gemini: unerwartete Antwortstruktur ({exc})") from exc
    text = "".join(p.get("text", "") for p in parts if "text" in p)
    tool_calls = []
    for p in parts:
        if "functionCall" not in p:
            continue
        tc = {"id": p["functionCall"]["name"], "name": p["functionCall"]["name"], "arguments": p["functionCall"].get("args", {})}
        if p.get("thoughtSignature"):
            tc["geminiThoughtSignature"] = p["thoughtSignature"]
        tool_calls.append(tc)
    usage = data.get("usageMetadata", {})
    return ChatResult(text, model, usage.get("promptTokenCount"), usage.get("candidatesTokenCount"), tool_calls or None)


def _to_anthropic_tools(tools: list[dict]) -> list[dict]:
    return [
        {"name": t["name"], "description": t.get("description", ""), "input_schema": t.get("inputSchema") or {"type": "object", "properties": {}}}
        for t in tools
    ]


async def _chat_anthropic(api_key: str, base_url: str, model: str, system_prompt: str, messages: list[dict], tools: list[dict] | None) -> ChatResult:
    url = f"{base_url.rstrip('/')}/messages"
    anthropic_messages = []
    for m in messages:
        if m.get("tool_calls"):
            anthropic_messages.append({"role": "assistant", "content": [
                {"type": "tool_use", "id": tc["id"], "name": tc["name"], "input": tc["arguments"]} for tc in m["tool_calls"]
            ]})
        elif m["role"] == "tool":
            anthropic_messages.append({"role": "user", "content": [
                {"type": "tool_result", "tool_use_id": m["tool_call_id"], "content": m["content"]}
            ]})
        else:
            anthropic_messages.append({"role": m["role"], "content": m["content"]})
    body: dict = {"model": model, "max_tokens": 4096, "system": system_prompt, "messages": anthropic_messages}
    if tools:
        body["tools"] = _to_anthropic_tools(tools)
    headers = {"x-api-key": api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"}
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(url, json=body, headers=headers)
    if resp.status_code >= 400:
        raise ProviderError(f"Anthropic HTTP {resp.status_code}: {resp.text[:500]}")
    data = resp.json()
    try:
        blocks = data["content"]
    except KeyError as exc:
        raise ProviderError(f"Anthropic: unerwartete Antwortstruktur ({exc})") from exc
    text = "".join(b.get("text", "") for b in blocks if b.get("type") == "text")
    tool_calls = [
        {"id": b["id"], "name": b["name"], "arguments": b.get("input", {})} for b in blocks if b.get("type") == "tool_use"
    ]
    usage = data.get("usage", {})
    return ChatResult(text, model, usage.get("input_tokens"), usage.get("output_tokens"), tool_calls or None)


def _to_openai_tools(tools: list[dict]) -> list[dict]:
    return [
        {"type": "function", "function": {
            "name": t["name"], "description": t.get("description", ""),
            "parameters": t.get("inputSchema") or {"type": "object", "properties": {}},
        }}
        for t in tools
    ]


async def _chat_openai_compatible(api_key: str, base_url: str, model: str, system_prompt: str, messages: list[dict], tools: list[dict] | None) -> ChatResult:
    url = f"{base_url.rstrip('/')}/chat/completions"
    openai_messages = [{"role": "system", "content": system_prompt}]
    for m in messages:
        if m.get("tool_calls"):
            openai_messages.append({"role": "assistant", "content": None, "tool_calls": [
                {"id": tc["id"], "type": "function", "function": {"name": tc["name"], "arguments": _json_dumps(tc["arguments"])}}
                for tc in m["tool_calls"]
            ]})
        elif m["role"] == "tool":
            openai_messages.append({"role": "tool", "tool_call_id": m["tool_call_id"], "content": m["content"]})
        else:
            openai_messages.append({"role": m["role"], "content": m["content"]})
    body: dict = {"model": model, "messages": openai_messages}
    if tools:
        body["tools"] = _to_openai_tools(tools)
    headers = {"Authorization": f"Bearer {api_key}", "content-type": "application/json"}
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(url, json=body, headers=headers)
    if resp.status_code >= 400:
        raise ProviderError(f"HTTP {resp.status_code}: {resp.text[:500]}")
    data = resp.json()
    try:
        message = data["choices"][0]["message"]
    except (KeyError, IndexError) as exc:
        raise ProviderError(f"Unerwartete Antwortstruktur ({exc})") from exc
    tool_calls = [
        {"id": tc["id"], "name": tc["function"]["name"], "arguments": _json_loads(tc["function"]["arguments"])}
        for tc in (message.get("tool_calls") or [])
    ]
    usage = data.get("usage", {})
    return ChatResult(message.get("content") or "", model, usage.get("prompt_tokens"), usage.get("completion_tokens"), tool_calls or None)


def _json_dumps(obj) -> str:
    import json
    return json.dumps(obj)


def _json_loads(text: str) -> dict:
    import json
    try:
        return json.loads(text)
    except (json.JSONDecodeError, TypeError):
        return {}


async def chat(
    provider_type: str,
    settings: dict,
    system_prompt: str,
    messages: list[dict],
    purpose: str = "CHAT",
    tools: list[dict] | None = None,
) -> ChatResult:
    """`messages` is a list of chat turns, oldest first. Each is either
    `{"role": "user"|"assistant", "content": str}`, an assistant turn with `{"role": "assistant",
    "tool_calls": [...]}` (from a previous `ChatResult.tool_calls`), or a tool-result turn
    `{"role": "tool", "tool_call_id": str, "name": str, "content": str}`."""
    if provider_type == "GEMINI":
        model = _resolved_model(provider_type, settings.get("geminiModel", ""), purpose)
        return await _chat_gemini(settings["geminiApiKey"], model, system_prompt, messages, tools)
    if provider_type == "CLAUDE":
        model = _resolved_model(provider_type, settings.get("claudeModel", ""), purpose)
        return await _chat_anthropic(
            settings["claudeApiKey"], settings.get("claudeBaseUrl") or catalog.DEFAULT_CLAUDE_BASE_URL,
            model, system_prompt, messages, tools,
        )
    if provider_type == "OPENAI":
        model = _resolved_model(provider_type, settings.get("openAiModel", ""), purpose)
        return await _chat_openai_compatible(
            settings["openAiApiKey"], settings.get("openAiBaseUrl") or catalog.DEFAULT_OPENAI_BASE_URL,
            model, system_prompt, messages, tools,
        )
    if provider_type == "DEEPSEEK":
        model = _resolved_model(provider_type, settings.get("deepseekModel", ""), purpose)
        return await _chat_openai_compatible(
            settings["deepseekApiKey"], catalog.DEFAULT_DEEPSEEK_BASE_URL, model, system_prompt, messages, tools,
        )
    raise ProviderError(f"Unbekannter oder nicht unterstützter Provider: {provider_type}")


async def test_connection(provider_type: str, settings: dict) -> tuple[bool, str]:
    try:
        result = await chat(
            provider_type, settings,
            system_prompt="Antworte nur mit dem einzelnen Wort OK.",
            messages=[{"role": "user", "content": "Testverbindung -- antworte mit OK."}],
        )
        return True, result.text.strip()[:200] or "Verbindung erfolgreich."
    except ProviderError as exc:
        return False, str(exc)
    except httpx.HTTPError as exc:
        return False, f"Netzwerkfehler: {exc}"
