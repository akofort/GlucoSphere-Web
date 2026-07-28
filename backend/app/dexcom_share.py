"""Dexcom Share API direct client -- the cloud API behind the Dexcom Follow app. Native
integration, same idea as Nightscout/FeelFit: username+password entered directly in
GlucoSphere-Web's own settings instead of needing a separate MCP server.

Protocol reverse-engineered and maintained by the open-source pydexcom project (used by
Home Assistant and many others); re-implemented here in this project's own async/httpx style
(not vendored) rather than adding a new synchronous `requests`-based dependency.
"""
from __future__ import annotations

import re
import time
from dataclasses import dataclass
from typing import Any

import httpx

_APPLICATION_ID_US = "d89443d2-327c-4a6f-89e5-496bbb0317db"
_BASE_URLS = {
    "US": "https://share2.dexcom.com/ShareWebServices/Services/",
    "OUS": "https://shareous1.dexcom.com/ShareWebServices/Services/",
}
_AUTHENTICATE_ENDPOINT = "General/AuthenticatePublisherAccount"
_LOGIN_ID_ENDPOINT = "General/LoginPublisherAccountById"
_GLUCOSE_READINGS_ENDPOINT = "Publisher/ReadPublisherLatestGlucoseValues"
_HEADERS = {"Accept-Encoding": "application/json"}
_DEFAULT_UUID = "00000000-0000-0000-0000-000000000000"
_TIMEOUT = httpx.Timeout(15.0, connect=10.0)

_TREND_ARROWS = {
    "None": "-", "DoubleUp": "⇈", "SingleUp": "↑", "FortyFiveUp": "↗", "Flat": "→",
    "FortyFiveDown": "↘", "SingleDown": "↓", "DoubleDown": "⇊", "NotComputable": "?", "RateOutOfRange": "-",
}

_DATE_RE = re.compile(r"Date\((?P<ts>\d+)(?P<tz>[+-]\d{4})\)")


class DexcomShareError(RuntimeError):
    pass


def trend_arrow_for(direction: str) -> str:
    return _TREND_ARROWS.get(direction, "-")


async def _post(base_url: str, endpoint: str, json_body: dict[str, Any]) -> Any:
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(f"{base_url}{endpoint}", headers=_HEADERS, json=json_body)
    try:
        data = resp.json()
    except ValueError:
        data = None
    if resp.status_code >= 400:
        message = (data or {}).get("Message") if isinstance(data, dict) else None
        raise DexcomShareError(f"Dexcom-Share-Fehler: {message or f'HTTP {resp.status_code}'}")
    return data


async def _get_session_id(base_url: str, username: str, password: str) -> str:
    account_id = await _post(base_url, _AUTHENTICATE_ENDPOINT, {
        "accountName": username, "password": password, "applicationId": _APPLICATION_ID_US,
    })
    if not account_id or account_id == _DEFAULT_UUID:
        raise DexcomShareError("Dexcom-Anmeldung fehlgeschlagen -- Benutzername/Passwort prüfen.")
    session_id = await _post(base_url, _LOGIN_ID_ENDPOINT, {
        "accountId": account_id, "password": password, "applicationId": _APPLICATION_ID_US,
    })
    if not session_id or session_id == _DEFAULT_UUID:
        raise DexcomShareError("Dexcom-Anmeldung fehlgeschlagen -- keine gültige Sitzung erhalten.")
    return session_id


@dataclass
class DexcomReading:
    date_millis: int
    mg_dl: float
    trend: str


def _parse_dexcom_date(raw: str) -> int:
    match = _DATE_RE.match(raw)
    if not match:
        return 0
    return int(match.group("ts"))


async def fetch_readings(username: str, password: str, region: str, minutes: int = 1440, max_count: int = 288) -> list[DexcomReading]:
    base_url = _BASE_URLS.get(region, _BASE_URLS["US"])
    session_id = await _get_session_id(base_url, username, password)
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(
            f"{base_url}{_GLUCOSE_READINGS_ENDPOINT}", headers=_HEADERS,
            params={"sessionId": session_id, "minutes": min(minutes, 1440), "maxCount": min(max_count, 288)},
            json={},
        )
    if resp.status_code >= 400:
        raise DexcomShareError(f"Dexcom-Share-Fehler beim Abruf der Werte: HTTP {resp.status_code}")
    try:
        data = resp.json()
    except ValueError as exc:
        raise DexcomShareError("Dexcom-Share-Fehler: unerwartete Antwort (kein JSON).") from exc
    if not isinstance(data, list):
        return []
    readings = []
    for item in data:
        try:
            readings.append(DexcomReading(
                date_millis=_parse_dexcom_date(item["DT"]),
                mg_dl=float(item["Value"]),
                trend=str(item.get("Trend", "None")),
            ))
        except (KeyError, TypeError, ValueError):
            continue
    readings.sort(key=lambda r: r.date_millis)
    return readings


async def test_connection(username: str, password: str, region: str) -> tuple[bool, str]:
    try:
        readings = await fetch_readings(username, password, region, minutes=180, max_count=36)
        return True, f"Verbindung erfolgreich -- {len(readings)} Werte in den letzten 3h gefunden."
    except Exception as exc:  # noqa: BLE001
        return False, str(exc)
