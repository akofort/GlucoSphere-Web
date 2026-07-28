"""OAuth2 Authorization Code + PKCE flow for MCP servers that require it (e.g. Withings -- the
concrete case that prompted this: its MCP/API access sits behind a standard OAuth2 app you
register yourself on the Withings developer portal, no dynamic client registration or MCP-level
auth discovery involved). Manual endpoint/client entry only, no RFC8414 discovery -- see README.
"""
from __future__ import annotations

import base64
import hashlib
import secrets
import time
from urllib.parse import urlencode

import httpx

from . import db

_TIMEOUT = httpx.Timeout(30.0, connect=10.0)
_TOKEN_REFRESH_MARGIN_SECONDS = 60


class OAuthError(RuntimeError):
    pass


def _pkce_pair() -> tuple[str, str]:
    verifier = base64.urlsafe_b64encode(secrets.token_bytes(40)).decode().rstrip("=")
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    return verifier, challenge


def build_authorize_url(server: dict, redirect_uri: str) -> str:
    if not server.get("oauthAuthEndpoint") or not server.get("oauthClientId"):
        raise OAuthError("OAuth2 ist für diesen Server nicht konfiguriert (Client-ID/Authorization-Endpoint fehlen).")
    state = secrets.token_urlsafe(24)
    verifier, challenge = _pkce_pair()
    db.set_mcp_oauth_pending(server["id"], state, verifier, redirect_uri)
    params = {
        "response_type": "code",
        "client_id": server["oauthClientId"],
        "redirect_uri": redirect_uri,
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    }
    if server.get("oauthScope"):
        params["scope"] = server["oauthScope"]
    separator = "&" if "?" in server["oauthAuthEndpoint"] else "?"
    return f"{server['oauthAuthEndpoint']}{separator}{urlencode(params)}"


async def exchange_code(server: dict, code: str, redirect_uri: str) -> None:
    body = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri,
        "client_id": server["oauthClientId"],
        "client_secret": server.get("oauthClientSecret", ""),
        "code_verifier": server["oauthPkceVerifier"],
    }
    # A few providers (confirmed: Withings) implement their token endpoint as one more
    # `action`-dispatched call on their general API rather than a dedicated OAuth2 endpoint --
    # not standard OAuth2, but harmless to include as an extra form field for providers that
    # don't need it.
    if server.get("oauthTokenAction"):
        body["action"] = server["oauthTokenAction"]
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(server["oauthTokenEndpoint"], data=body, headers={"Accept": "application/json"})
    _raise_for_non_json_status(resp, "Token-Austausch")
    data = _parse_token_response(resp)
    _store_tokens(server["id"], data)


async def refresh_access_token(server: dict) -> str:
    if not server.get("oauthRefreshToken"):
        raise OAuthError("Kein Refresh-Token vorhanden -- bitte erneut mit dem Provider anmelden.")
    body = {
        "grant_type": "refresh_token",
        "refresh_token": server["oauthRefreshToken"],
        "client_id": server["oauthClientId"],
        "client_secret": server.get("oauthClientSecret", ""),
    }
    if server.get("oauthTokenAction"):
        body["action"] = server["oauthTokenAction"]
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(server["oauthTokenEndpoint"], data=body, headers={"Accept": "application/json"})
    _raise_for_non_json_status(resp, "Token-Erneuerung")
    data = _parse_token_response(resp)
    _store_tokens(server["id"], data, fallback_refresh_token=server["oauthRefreshToken"])
    return data["access_token"]


def _raise_for_non_json_status(resp: httpx.Response, action_label: str) -> None:
    if resp.status_code >= 400:
        raise OAuthError(f"{action_label} fehlgeschlagen: HTTP {resp.status_code}: {resp.text[:300]}")
    if resp.status_code in (301, 302, 303, 307, 308):
        # httpx does not follow redirects by default -- a redirect here almost always means the
        # token endpoint URL itself is wrong/outdated (observed live: an old Withings endpoint
        # 302-redirecting to their docs homepage), not a real API response, so this deserves a
        # clearer message than the generic "response wasn't JSON" one from _parse_token_response.
        location = resp.headers.get("location", "?")
        raise OAuthError(f"{action_label} fehlgeschlagen: Token-Endpoint leitet weiter (HTTP {resp.status_code} -> {location}) -- URL vermutlich falsch/veraltet.")


def _parse_token_response(resp: httpx.Response) -> dict:
    try:
        data = resp.json()
    except ValueError as exc:
        raise OAuthError(f"Unerwartete Token-Antwort (kein JSON): {resp.text[:300]}") from exc
    # A few providers (confirmed: Withings) wrap the actual token fields in a `{"status": 0,
    # "body": {...}}` envelope instead of returning them at the top level like standard OAuth2 --
    # observed live: `{'status': 0, 'body': {'access_token': ..., 'refresh_token': ...}}`.
    if isinstance(data, dict) and "access_token" not in data and isinstance(data.get("body"), dict):
        return data["body"]
    return data


def _store_tokens(server_id: str, data: dict, fallback_refresh_token: str = "") -> None:
    access_token = data.get("access_token")
    if not access_token:
        raise OAuthError(f"Token-Antwort ohne access_token: {data}")
    refresh_token = data.get("refresh_token") or fallback_refresh_token
    expires_in = data.get("expires_in")
    expires_at = int(time.time()) + int(expires_in) if expires_in else 0
    db.set_mcp_oauth_tokens(server_id, access_token, refresh_token, expires_at)


async def get_valid_access_token(server_id: str) -> str:
    """Returns a usable access token for `server_id`, refreshing first if it's expired (or about
    to expire) and a refresh token is available. Used by tools.py/mcp_client.py right before a
    call -- OAuth2 auth then behaves exactly like a manually entered bearer token from the
    caller's point of view."""
    server = db.get_mcp_server_raw(server_id)
    if server is None:
        raise OAuthError("Server nicht gefunden.")
    if not server.get("oauthAccessToken"):
        raise OAuthError("Nicht angemeldet -- bitte zuerst 'Login mit Provider' ausführen.")
    expires_at = server.get("oauthExpiresAt") or 0
    if expires_at and expires_at - _TOKEN_REFRESH_MARGIN_SECONDS < int(time.time()):
        return await refresh_access_token(server)
    return server["oauthAccessToken"]
