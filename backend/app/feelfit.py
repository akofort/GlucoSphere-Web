"""FeelFit smart-scale (body composition) direct API client -- native integration, same idea as
nightscout.py: credentials are entered directly in GlucoSphere-Web's own settings instead of
needing a separate self-hosted MCP server process to sit in front of it.

The wire protocol (endpoints, request shape, RSA-encrypted password login) was reverse-engineered
and published by the open-source tecnologicachile/mcp-feelfit project (stdio-only Python MCP
server); this module re-implements the same protocol natively here, using the `cryptography`
package already a dependency of this project (see backup.py) instead of adding pycryptodome.
The RSA public key below is FeelFit's own client-side key, baked into their Android app for any
client to use to reach their API -- not a user secret.
"""
from __future__ import annotations

import base64
import time
import urllib.parse
from dataclasses import dataclass
from typing import Any

import httpx
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.serialization import load_pem_public_key

_BASE_URL = "https://feelfit.qnclouds.com/api/v4"
_PUBLIC_KEY_PEM = b"""-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC+25I2upukpfQ7rIaaTZtVE744
u2zV+HaagrUhDOTq8fMVf9yFQvEZh2/HKxFudUxP0dXUa8F6X4XmWumHdQnum3zm
Jr04fz2b2WCcN0ta/rbF2nYAnMVAk2OJVZAMudOiMWhcxV1nNJiKgTNNr13de0EQ
IiOL2CUBzu+HmIfUbQIDAQAB
-----END PUBLIC KEY-----"""

_DEFAULT_PARAMS = {
    "app_revision": "4.16.0",
    "html_version": "14.16.0",
    "cellphone_type": "samsung SM-T510",
    "system_type": "11_30",
    "zone": "UTC",
    "area_code": "DE",
    "locale": "de",
    "app_id": "Feelfit",
    "platform": "android",
}
_COMMON_HEADERS = {
    "Accept-Encoding": "gzip",
    "Connection": "Keep-Alive",
    "Host": "feelfit.qnclouds.com",
    "User-Agent": "okhttp/4.9.1",
}
_TIMEOUT = httpx.Timeout(15.0, connect=10.0)

# Module-level session cache -- avoids a fresh login on every single tool call within the token's
# lifetime. Single-account by design (one shared `settings` blob, like Nightscout's own URL/secret
# fields) -- re-logs in automatically if the configured email changes.
_session: dict[str, Any] = {"email": None, "token": None, "expires_at": 0.0, "user_id": None}


def _encrypt_password(password: str) -> str:
    public_key = load_pem_public_key(_PUBLIC_KEY_PEM)
    encrypted = public_key.encrypt(password.encode("utf-8"), padding.PKCS1v15())
    return base64.b64encode(encrypted).decode("utf-8")


def _build_url(path: str, extra: dict[str, str] | None = None) -> str:
    params = dict(_DEFAULT_PARAMS)
    if extra:
        params.update(extra)
    return f"{_BASE_URL}{path}?{urllib.parse.urlencode(params)}"


async def _login(email: str, password: str) -> None:
    encrypted_pw = _encrypt_password(password)
    url = _build_url("/users/sign_in")
    headers = {**_COMMON_HEADERS, "Authorization": "Bearer", "Content-Type": "application/json;charset=UTF-8"}
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(url, headers=headers, json={"email": email, "password": encrypted_pw})
    if resp.status_code >= 400:
        raise RuntimeError(f"FeelFit-Login fehlgeschlagen: HTTP {resp.status_code}")
    result = resp.json()
    if str(result.get("code")) not in ("200", "0"):
        raise RuntimeError(f"FeelFit-Login fehlgeschlagen: {result.get('msg', result)}")
    data = result.get("data", {})
    token_info = data.get("token_info", {})
    token = token_info.get("token")
    if not token:
        raise RuntimeError("FeelFit-Login: keine Token-Antwort erhalten.")
    _session["email"] = email
    _session["token"] = token
    _session["expires_at"] = time.time() + float(token_info.get("remaining_time", 0) or 0)
    _session["user_id"] = str(data.get("user_info", {}).get("user_id", ""))


async def _ensure_session(email: str, password: str) -> None:
    if _session["email"] == email and _session["token"] and time.time() < _session["expires_at"] - 60:
        return
    await _login(email, password)


async def _get(email: str, password: str, path: str, extra: dict[str, str] | None = None) -> dict[str, Any]:
    await _ensure_session(email, password)

    async def _do_request() -> httpx.Response:
        headers = {**_COMMON_HEADERS, "Authorization": f"Bearer {_session['token']}"}
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            return await client.get(_build_url(path, extra), headers=headers)

    resp = await _do_request()
    if resp.status_code == 401:
        # Token may have been invalidated server-side -- one retry after a fresh login.
        await _login(email, password)
        resp = await _do_request()
    if resp.status_code >= 400:
        raise RuntimeError(f"FeelFit-API-Fehler: HTTP {resp.status_code}")
    result = resp.json()
    return result.get("data", result) if isinstance(result, dict) else result


@dataclass
class BodyMeasurement:
    date_millis: int
    weight_kg: float | None
    body_fat_percent: float | None
    bmi: float | None
    muscle_kg: float | None
    bone_kg: float | None
    water_percent: float | None
    visceral_fat: float | None
    bmr_kcal: float | None
    body_age: float | None


def _as_float(m: dict[str, Any], key: str) -> float | None:
    v = m.get(key)
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def _as_millis(raw: Any) -> int:
    """The upstream field is an undocumented Unix timestamp -- normalizes both a plain-seconds and
    an already-milliseconds value instead of assuming one, same heuristic used for MCP-sourced
    glucose timestamps in dashboard_sources.py."""
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return 0
    return int(value) if value > 10**12 else int(value * 1000)


def _parse_measurement(m: dict[str, Any]) -> BodyMeasurement:
    return BodyMeasurement(
        date_millis=_as_millis(m.get("time_stamp")),
        weight_kg=_as_float(m, "weight"),
        body_fat_percent=_as_float(m, "bodyfat"),
        bmi=_as_float(m, "bmi"),
        muscle_kg=_as_float(m, "muscle"),
        bone_kg=_as_float(m, "bone"),
        water_percent=_as_float(m, "water"),
        visceral_fat=_as_float(m, "visfat"),
        bmr_kcal=_as_float(m, "bmr"),
        body_age=_as_float(m, "bodyage"),
    )


async def fetch_measurements(email: str, password: str) -> list[BodyMeasurement]:
    data = await _get(email, password, "/measurements/list_measurement", {
        "user_id": _session.get("user_id") or "", "last_updated_at": "0", "last_measurement_id": "0",
    })
    raw = data.get("measurements", []) if isinstance(data, dict) else []
    measurements = [_parse_measurement(m) for m in raw if m.get("weight") is not None]
    measurements.sort(key=lambda m: m.date_millis)
    return measurements


async def test_connection(email: str, password: str) -> tuple[bool, str]:
    try:
        await _login(email, password)
        measurements = await fetch_measurements(email, password)
        return True, f"Verbindung erfolgreich -- {len(measurements)} Messungen gefunden."
    except Exception as exc:  # noqa: BLE001 -- surfaced to the user as a plain message
        return False, str(exc)
