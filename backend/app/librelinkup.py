"""LibreLinkUp API direct client (Abbott FreeStyle Libre). Native integration, same idea as
Nightscout/FeelFit/Dexcom Share: username+password entered directly in GlucoSphere-Web's own
settings instead of needing a separate MCP server.

Protocol reverse-engineered and maintained by several open-source projects (this project's own
implementation was cross-checked against robberwick/pylibrelinkup); re-implemented here in this
project's own async/httpx style rather than vendoring a pydantic-based client.
"""
from __future__ import annotations

import hashlib
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import httpx

_API_URLS = {
    "US": "https://api.libreview.io", "EU": "https://api-eu.libreview.io", "EU2": "https://api-eu2.libreview.io",
    "AE": "https://api-ae.libreview.io", "AP": "https://api-ap.libreview.io", "AU": "https://api-au.libreview.io",
    "CA": "https://api-ca.libreview.io", "DE": "https://api-de.libreview.io", "FR": "https://api-fr.libreview.io",
    "JP": "https://api-jp.libreview.io", "LA": "https://api-la.libreview.io", "RU": "https://api.libreview.ru",
}
_HEADERS = {
    "accept-encoding": "gzip", "cache-control": "no-cache", "connection": "Keep-Alive",
    "content-type": "application/json", "product": "llu.android", "version": "4.16.0",
}
_TIMEOUT = httpx.Timeout(15.0, connect=10.0)


class LibreLinkUpError(RuntimeError):
    pass


def _auth_headers(token: str | None, account_id_hash: str | None) -> dict[str, str]:
    headers = dict(_HEADERS)
    if token:
        headers["authorization"] = f"Bearer {token}"
    if account_id_hash:
        headers["account-id"] = account_id_hash
    return headers


async def _login(api_url: str, email: str, password: str) -> tuple[str, str, str]:
    """Returns (token, account_id_hash, resolved_api_url) -- following a region redirect once if
    LibreView reports the account belongs to a different regional host."""
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(f"{api_url}/llu/auth/login", headers=_auth_headers(None, None), json={"email": email, "password": password})
    if resp.status_code >= 400:
        raise LibreLinkUpError(f"LibreLinkUp-Login fehlgeschlagen: HTTP {resp.status_code}")
    body = resp.json()
    data = body.get("data", {})
    if data.get("redirect"):
        region = str(data.get("region", "")).upper()
        redirected_url = _API_URLS.get(region)
        if not redirected_url:
            raise LibreLinkUpError(f"LibreLinkUp-Login: unbekannte Ziel-Region '{region}'.")
        return await _login(redirected_url, email, password)
    step_type = (data.get("step") or {}).get("type")
    if step_type in ("tou", "pp", "verifyEmail"):
        raise LibreLinkUpError(
            "LibreLinkUp-Login erfordert eine ausstehende Bestätigung (Nutzungsbedingungen/"
            "Datenschutz/E-Mail-Verifizierung) -- bitte einmal in der LibreLinkUp-App/-Website anmelden."
        )
    token = ((data.get("authTicket") or {}).get("token"))
    user_id = (data.get("user") or {}).get("id")
    if not token or not user_id:
        raise LibreLinkUpError("LibreLinkUp-Login fehlgeschlagen -- Email/Passwort prüfen.")
    account_id_hash = hashlib.sha256(str(user_id).encode()).hexdigest()
    return token, account_id_hash, api_url


async def _get_patients(api_url: str, token: str, account_id_hash: str) -> list[dict[str, Any]]:
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(f"{api_url}/llu/connections", headers=_auth_headers(token, account_id_hash))
    if resp.status_code >= 400:
        raise LibreLinkUpError(f"LibreLinkUp-Fehler beim Abruf der Patienten: HTTP {resp.status_code}")
    return resp.json().get("data", [])


async def _get_graph(api_url: str, token: str, account_id_hash: str, patient_id: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(f"{api_url}/llu/connections/{patient_id}/graph", headers=_auth_headers(token, account_id_hash))
    if resp.status_code >= 400:
        raise LibreLinkUpError(f"LibreLinkUp-Fehler beim Abruf der Messwerte: HTTP {resp.status_code}")
    return resp.json().get("data", {})


@dataclass
class LibreReading:
    date_millis: int
    mg_dl: float


def _parse_factory_timestamp(raw: str) -> int:
    # Format per the API: "MM/DD/YYYY HH:MM:SS AM/PM", always UTC (FactoryTimestamp specifically).
    dt = datetime.strptime(raw, "%m/%d/%Y %I:%M:%S %p").replace(tzinfo=timezone.utc)
    return int(dt.timestamp() * 1000)


async def fetch_readings(email: str, password: str, region: str) -> list[LibreReading]:
    api_url = _API_URLS.get(region, _API_URLS["US"])
    token, account_id_hash, api_url = await _login(api_url, email, password)
    patients = await _get_patients(api_url, token, account_id_hash)
    if not patients:
        raise LibreLinkUpError("Kein verbundener LibreLinkUp-Patient gefunden -- in der LibreLinkUp-App eine Freigabe einrichten.")
    patient_id = patients[0]["patientId"]
    graph = await _get_graph(api_url, token, account_id_hash, patient_id)
    raw_history = graph.get("graphData", [])
    readings = []
    for item in raw_history:
        try:
            readings.append(LibreReading(
                date_millis=_parse_factory_timestamp(item["FactoryTimestamp"]),
                mg_dl=float(item.get("ValueInMgPerDl") or item["Value"]),
            ))
        except (KeyError, TypeError, ValueError):
            continue
    readings.sort(key=lambda r: r.date_millis)
    return readings


async def test_connection(email: str, password: str, region: str) -> tuple[bool, str]:
    try:
        readings = await fetch_readings(email, password, region)
        return True, f"Verbindung erfolgreich -- {len(readings)} Werte gefunden (letzte ~12h)."
    except Exception as exc:  # noqa: BLE001
        return False, str(exc)
