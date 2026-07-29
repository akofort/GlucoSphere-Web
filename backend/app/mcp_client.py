"""MCP client -- supports the transports actually found among the MCP servers already running on
192.168.1.110 at implementation time (probed live against `docker ps`'s server list):

  - STREAMABLE_HTTP: the current MCP spec (2025-03-26) -- single POST endpoint, response is
    either a plain JSON body or one `text/event-stream` SSE event carrying the JSON-RPC response,
    with an optional `Mcp-Session-Id` response header from `initialize` that must be echoed back
    on subsequent requests in the same session. Confirmed live against `tplink-omada-mcp` (:8006).
  - SSE: the older (pre-2025-03-26, still common) two-endpoint transport -- a GET `/sse` stream
    whose first event (`event: endpoint`) gives the real POST path (with a session id baked in);
    every request/response after that goes: POST to that path, response arrives asynchronously as
    a `message` event on the *same* still-open SSE stream. Confirmed live against `feelfit-mcp`
    (:8004) and `google-fit-mcp` (:8002) -- the latter turned out flaky (~50% of calls got
    `RemoteProtocolError: Server disconnected` on the POST), which is why this transport retries,
    see `_sse_session_call_with_retries`.
  - OPENAPI: not MCP at all -- a REST/OpenAPI proxy in front of an MCP server (`mcpo`,
    github.com/open-webui/mcpo). Each OpenAPI path is one tool; calling it is a plain POST with a
    JSON request body. Confirmed live against `omni-endo-ai` served via `mcpo` (:8007).

A server's `transport` field (see `db.py`'s `mcp_servers` table) picks which of the three is used;
"Verbindung testen" in the UI is what actually determines it works, not a guess baked into config.
"""
from __future__ import annotations

import asyncio
import json as json_module
from dataclasses import dataclass

import httpx

_TIMEOUT = httpx.Timeout(30.0, connect=10.0)
_PROTOCOL_VERSION = "2025-03-26"
_CLIENT_INFO = {"name": "glucosphere-web", "version": "0.1.0"}


class McpClientError(RuntimeError):
    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


@dataclass
class McpTool:
    name: str
    description: str
    input_schema: dict


def _auth_headers(auth_method: str, token: str) -> dict[str, str]:
    if not token:
        return {}
    if auth_method == "BEARER_TOKEN":
        return {"Authorization": f"Bearer {token}"}
    if auth_method == "API_SECRET_HEADER":
        return {"api-secret": token}
    return {}


def _parse_sse_event_data(text: str) -> str | None:
    """Extracts the `data:` payload from the first complete SSE event in `text` (possibly
    multi-line `data:` per the spec, joined with `\n`)."""
    data_lines = []
    for line in text.splitlines():
        if line.startswith("data:"):
            data_lines.append(line[5:].lstrip())
        elif line == "" and data_lines:
            break
    return "\n".join(data_lines) if data_lines else None


# ---------------------------------------------------------------------------
# STREAMABLE_HTTP
# ---------------------------------------------------------------------------

async def _streamable_http_call(url: str, headers: dict, payload: dict, session_id: str | None) -> tuple[dict, str | None]:
    req_headers = {
        **headers,
        "content-type": "application/json",
        "accept": "application/json, text/event-stream",
    }
    if session_id:
        req_headers["Mcp-Session-Id"] = session_id
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(url, json=payload, headers=req_headers)
    if resp.status_code >= 400:
        raise McpClientError(f"HTTP {resp.status_code}: {resp.text[:300]}", status_code=resp.status_code)
    new_session_id = resp.headers.get("mcp-session-id", session_id)
    content_type = resp.headers.get("content-type", "")
    if "text/event-stream" in content_type:
        raw = _parse_sse_event_data(resp.text)
        if raw is None:
            raise McpClientError("Leere SSE-Antwort vom MCP-Server.")
        data = json_module.loads(raw)
    else:
        data = resp.json()
    if "error" in data:
        raise McpClientError(f"MCP-Fehler: {data['error'].get('message', data['error'])}")
    return data.get("result", {}), new_session_id


async def _streamable_http_session_call(url: str, headers: dict, method: str, params: dict) -> dict:
    """One full initialize -> `method` round-trip (a fresh session per call -- simple and
    correct, at the cost of one extra request; MCP servers are expected to handle `initialize`
    cheaply, and per-turn tool-call volume here is low)."""
    init_result, session_id = await _streamable_http_call(
        url, headers,
        {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
            "protocolVersion": _PROTOCOL_VERSION, "capabilities": {}, "clientInfo": _CLIENT_INFO,
        }},
        None,
    )
    # Fire-and-forget notification (no response expected/awaited) -- some servers require it
    # before accepting further requests in the session.
    try:
        req_headers = {**headers, "content-type": "application/json", "accept": "application/json, text/event-stream"}
        if session_id:
            req_headers["Mcp-Session-Id"] = session_id
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            await client.post(url, json={"jsonrpc": "2.0", "method": "notifications/initialized"}, headers=req_headers)
    except httpx.HTTPError:
        pass
    result, _ = await _streamable_http_call(
        url, headers, {"jsonrpc": "2.0", "id": 2, "method": method, "params": params}, session_id,
    )
    return result


# ---------------------------------------------------------------------------
# SSE (legacy)
# ---------------------------------------------------------------------------

async def _sse_session_call(url: str, headers: dict, method: str, params: dict) -> dict:
    base = url.rstrip("/")
    sse_url = base if base.endswith("/sse") else f"{base}/sse"
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        async with client.stream("GET", sse_url, headers={**headers, "accept": "text/event-stream"}) as resp:
            if resp.status_code >= 400:
                raise McpClientError(f"SSE-Verbindung fehlgeschlagen: HTTP {resp.status_code}", status_code=resp.status_code)
            endpoint_path: str | None = None
            request_id = 1
            async for raw_event in _iter_sse_events(resp):
                event_type, data = raw_event
                if event_type == "endpoint" and endpoint_path is None:
                    endpoint_path = data
                    post_url = endpoint_path if endpoint_path.startswith("http") else f"{_origin(base)}{endpoint_path}"
                    init_payload = {"jsonrpc": "2.0", "id": request_id, "method": "initialize", "params": {
                        "protocolVersion": _PROTOCOL_VERSION, "capabilities": {}, "clientInfo": _CLIENT_INFO,
                    }}
                    async with httpx.AsyncClient(timeout=_TIMEOUT) as post_client:
                        await post_client.post(post_url, json=init_payload, headers={**headers, "content-type": "application/json"})
                    continue
                if event_type == "message" and endpoint_path is not None:
                    parsed = json_module.loads(data)
                    if parsed.get("id") == request_id and "result" in parsed:
                        if request_id == 1:
                            # initialize acknowledged -- now send the real request
                            request_id = 2
                            post_url = endpoint_path if endpoint_path.startswith("http") else f"{_origin(base)}{endpoint_path}"
                            payload = {"jsonrpc": "2.0", "id": request_id, "method": method, "params": params}
                            async with httpx.AsyncClient(timeout=_TIMEOUT) as post_client:
                                await post_client.post(post_url, json=payload, headers={**headers, "content-type": "application/json"})
                            continue
                        return parsed["result"]
                    if parsed.get("id") == request_id and "error" in parsed:
                        raise McpClientError(f"MCP-Fehler: {parsed['error'].get('message', parsed['error'])}")
    raise McpClientError("SSE-Stream endete ohne Antwort.")


def _origin(url: str) -> str:
    parts = httpx.URL(url)
    return f"{parts.scheme}://{parts.netloc.decode()}"


async def _iter_sse_events(response: httpx.Response):
    event_type = "message"
    data_lines: list[str] = []
    async for line in response.aiter_lines():
        if line.startswith("event:"):
            event_type = line[6:].strip()
        elif line.startswith("data:"):
            data_lines.append(line[5:].lstrip())
        elif line == "":
            if data_lines:
                yield event_type, "\n".join(data_lines)
            event_type = "message"
            data_lines = []


# ---------------------------------------------------------------------------
# OPENAPI (mcpo proxy)
# ---------------------------------------------------------------------------

async def _openapi_spec(url: str, headers: dict) -> dict:
    base = url.rstrip("/")
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(f"{base}/openapi.json", headers=headers)
    if resp.status_code >= 400:
        raise McpClientError(f"HTTP {resp.status_code} beim Laden von openapi.json", status_code=resp.status_code)
    return resp.json()


async def _openapi_list_tools(url: str, headers: dict) -> list[McpTool]:
    spec = await _openapi_spec(url, headers)
    tools = []
    for path, methods in spec.get("paths", {}).items():
        op = methods.get("post") or next(iter(methods.values()), None)
        if not op:
            continue
        schema = {"type": "object", "properties": {}}
        body = op.get("requestBody", {}).get("content", {}).get("application/json", {}).get("schema")
        if body:
            schema = _resolve_openapi_schema(body, spec)
        tools.append(McpTool(
            name=path.lstrip("/"),
            description=op.get("description") or op.get("summary") or "",
            input_schema=schema,
        ))
    return tools


def _resolve_openapi_schema(schema: dict, spec: dict) -> dict:
    ref = schema.get("$ref")
    if ref and ref.startswith("#/"):
        node = spec
        for part in ref[2:].split("/"):
            node = node.get(part, {})
        return node
    return schema


async def _openapi_call_tool(url: str, headers: dict, name: str, arguments: dict) -> str:
    base = url.rstrip("/")
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(f"{base}/{name}", json=arguments, headers={**headers, "content-type": "application/json"})
    if resp.status_code >= 400:
        raise McpClientError(f"HTTP {resp.status_code}: {resp.text[:500]}", status_code=resp.status_code)
    try:
        return json_module.dumps(resp.json(), ensure_ascii=False)
    except ValueError:
        return resp.text


# ---------------------------------------------------------------------------
# Public interface
# ---------------------------------------------------------------------------

def _mcp_result_to_text(result: dict) -> str:
    content = result.get("content")
    if isinstance(content, list):
        return "\n".join(block.get("text", "") for block in content if block.get("type") == "text") or json_module.dumps(result, ensure_ascii=False)
    return json_module.dumps(result, ensure_ascii=False)


_SSE_RETRY_ATTEMPTS = 5
_SSE_RETRY_DELAY_SECONDS = 0.4


async def _sse_session_call_with_retries(url: str, headers: dict, method: str, params: dict) -> dict:
    """The legacy SSE transport's two-connection handshake (GET stream + a separate POST to the
    endpoint it hands back) turns out to be genuinely flaky against at least one real server on
    192.168.1.110 (`google-fit-mcp`) -- observed live, ~50% of calls fail with
    `httpx.RemoteProtocolError: Server disconnected without sending a response` on the POST, and
    the same call reliably succeeds on retry. Looks like a server-side timing sensitivity around
    how quickly the POST has to land after the SSE stream opens, not a bug in this client (a
    STREAMABLE_HTTP or OPENAPI server never showed this). Retrying is the pragmatic fix -- a fresh
    SSE connection + POST pair is cheap and this error is specifically the kind retries are for."""
    last_error: Exception | None = None
    for attempt in range(_SSE_RETRY_ATTEMPTS):
        try:
            return await _sse_session_call(url, headers, method, params)
        except (httpx.RemoteProtocolError, httpx.ReadError, httpx.ConnectError) as exc:
            last_error = exc
            if attempt < _SSE_RETRY_ATTEMPTS - 1:
                await asyncio.sleep(_SSE_RETRY_DELAY_SECONDS)
    raise McpClientError(f"SSE-Verbindung nach {_SSE_RETRY_ATTEMPTS} Versuchen fehlgeschlagen: {last_error}")


async def list_tools(server: dict) -> list[McpTool]:
    headers = _auth_headers(server["authMethod"], server.get("token", ""))
    transport = server.get("transport", "STREAMABLE_HTTP")
    if transport == "OPENAPI":
        return await _openapi_list_tools(server["url"], headers)
    if transport == "SSE":
        result = await _sse_session_call_with_retries(server["url"], headers, "tools/list", {})
    else:
        result = await _streamable_http_session_call(server["url"], headers, "tools/list", {})
    return [
        McpTool(t["name"], t.get("description", ""), t.get("inputSchema") or {"type": "object", "properties": {}})
        for t in result.get("tools", [])
    ]


async def call_tool(server: dict, name: str, arguments: dict) -> str:
    headers = _auth_headers(server["authMethod"], server.get("token", ""))
    transport = server.get("transport", "STREAMABLE_HTTP")
    if transport == "OPENAPI":
        return await _openapi_call_tool(server["url"], headers, name, arguments)
    params = {"name": name, "arguments": arguments}
    if transport == "SSE":
        result = await _sse_session_call_with_retries(server["url"], headers, "tools/call", params)
    else:
        result = await _streamable_http_session_call(server["url"], headers, "tools/call", params)
    return _mcp_result_to_text(result)


async def test_connection(server: dict) -> tuple[bool, str]:
    try:
        tools = await list_tools(server)
        names = ", ".join(t.name for t in tools[:5])
        suffix = f" ({names}{', …' if len(tools) > 5 else ''})" if tools else ""
        return True, f"Verbindung erfolgreich -- {len(tools)} Tool(s) gefunden{suffix}."
    except McpClientError as exc:
        return False, str(exc)
    except httpx.HTTPError as exc:
        return False, f"Netzwerkfehler: {exc}"
