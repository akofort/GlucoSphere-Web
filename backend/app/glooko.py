"""Glooko direct client -- native port of rilhia/omni-endo-ai-mcp's auth/data-fetching logic
(https://github.com/rilhia/omni-endo-ai-mcp, src/glooko.js + src/analytics.js), ported to
httpx/async rather than vendored verbatim, same reverse-engineering discipline as the other native
integrations in this project (fetch the real, maintained client source, port the logic natively).

Glooko aggregates data from many insulin pump brands -- this client is deliberately vendor-
agnostic: it never names a specific pump brand anywhere (code, tool description, or the data it
hands to the chat model), only generic terms ("Insulinpumpe" / "Basal-/Bolus-System").

Auth flow (confirmed against the reference implementation's real, working login flow):
1. GET /users/sign_in?id=login_form with redirect handling disabled, to read the region-specific
   login host from the Location header.
2. GET that regional login page, scrape the Rails CSRF token out of the HTML
   (`name="csrf-token" content="..."`).
3. POST email/password + CSRF token to the same URL. The resulting dashboard HTML embeds both the
   patient id (`window.patient = "..."`) and the API base URL (`apiUrl: '...'`).

Data fetch: GET {apiBase}/api/v3/graph/data?patient=...&startDate=<ISO>&endDate=<ISO>&series[]=...
-- bolus events live under response.series.deliveredBolus, daily basal/bolus/total insulin under
response.series.dailyInsulinTotals (both confirmed field names from the reference implementation,
NOT top-level fields and not the same name as the series[] param that requests them).
"""
from __future__ import annotations

import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import httpx

_BASE_DOMAIN = "https://my.glooko.com"
_TIMEOUT = httpx.Timeout(20.0, connect=10.0)
_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0"
# Same series list the reference implementation requests -- deliberately includes a couple of
# series we don't otherwise use (this app already has CGM via Nightscout/Dexcom/LibreLinkUp/
# Google Health) rather than guessing which subset still triggers the dailyInsulinTotals block.
_SERIES = [
    "deliveredBolus", "totalInsulinPerDay",
    "basalBarAutomated", "basalBarAutomatedSuspend", "basalBarAutomatedMax",
    "setSiteChange",
]


class GlookoError(RuntimeError):
    pass


def _iso(millis: int) -> str:
    return datetime.fromtimestamp(millis / 1000, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


async def _login(email: str, password: str) -> tuple[httpx.AsyncClient, str, str]:
    """Returns (client, patient_id, data_url). Caller owns closing the client."""
    client = httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=False)
    try:
        resp = await client.get(f"{_BASE_DOMAIN}/users/sign_in", params={"id": "login_form", "locale": "en-GB"})
        regional_login_url = resp.headers.get("location") or f"{_BASE_DOMAIN}/users/sign_in"
        if regional_login_url.startswith("/"):
            regional_login_url = _BASE_DOMAIN + regional_login_url

        regional_page = await client.get(regional_login_url)
        token_match = re.search(r'name="csrf-token" content="([^"]+)"', regional_page.text)
        if not token_match:
            raise GlookoError("Anmeldung fehlgeschlagen: Sicherheits-Token nicht gefunden (Login-Seite evtl. geändert).")

        auth_resp = await client.post(
            regional_login_url,
            data={
                "authenticity_token": token_match.group(1),
                "user[email]": email,
                "user[password]": password,
                "commit": "Log In",
            },
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": _USER_AGENT,
                "Referer": regional_login_url,
            },
            follow_redirects=True,
        )
        dashboard_html = auth_resp.text

        patient_match = re.search(r'window\.patient\s*=\s*"([^"]+)"', dashboard_html)
        if not patient_match:
            raise GlookoError("Anmeldung fehlgeschlagen: Benutzername oder Passwort falsch.")

        api_match = re.search(r"apiUrl:\s*'([^']+)'", dashboard_html)
        if api_match:
            api_base = api_match.group(1)
        else:
            final_host = httpx.URL(str(auth_resp.url)).host
            api_base = f"https://{final_host.replace('my.glooko', 'api.glooko')}"

        return client, patient_match.group(1), f"{api_base}/api/v3/graph/data"
    except httpx.HTTPError as exc:
        await client.aclose()
        raise GlookoError(f"Anmeldung fehlgeschlagen: {exc}") from exc
    except GlookoError:
        await client.aclose()
        raise


@dataclass
class BolusEvent:
    date_millis: int
    delivered_units: float | None
    programmed_units: float | None
    is_manual: bool
    carbs_g: float | None


@dataclass
class DailyInsulinTotal:
    date_millis: int
    basal_units: float | None
    bolus_units: float | None
    total_units: float | None


async def fetch_pump_data(
    email: str, password: str, from_millis: int, to_millis: int,
) -> tuple[list[BolusEvent], list[DailyInsulinTotal]]:
    client, patient_id, data_url = await _login(email, password)
    try:
        params = [("patient", patient_id), ("startDate", _iso(from_millis)), ("endDate", _iso(to_millis)),
                   ("locale", "en-GB"), ("insulinTooltips", "true"), ("filterBgReadings", "true"),
                   ("splitByDay", "false")] + [("series[]", s) for s in _SERIES]
        resp = await client.get(data_url, params=params, headers={"Accept": "application/json", "X-Requested-With": "XMLHttpRequest"})
        if resp.status_code == 401:
            raise GlookoError("Sitzung abgelaufen -- bitte erneut testen.")
        if resp.status_code >= 400:
            raise GlookoError(f"Glooko-API-Fehler: HTTP {resp.status_code}: {resp.text[:300]}")
        data = resp.json()
    except httpx.HTTPError as exc:
        raise GlookoError(f"Glooko-Datenabruf fehlgeschlagen: {exc}") from exc
    finally:
        await client.aclose()

    series = (data.get("series") or {}) if isinstance(data, dict) else {}

    boluses: list[BolusEvent] = []
    for b in series.get("deliveredBolus") or []:
        x = b.get("x")
        if x is None:
            continue
        boluses.append(BolusEvent(
            date_millis=int(float(x) * 1000),
            delivered_units=_num_or_none(b.get("insulinDelivered")),
            programmed_units=_num_or_none(b.get("insulinProgrammed")),
            is_manual=bool(b.get("isManual")),
            carbs_g=_num_or_none(b.get("carbsInput")),
        ))
    boluses.sort(key=lambda e: e.date_millis)

    daily: list[DailyInsulinTotal] = []
    for key, rec in (series.get("dailyInsulinTotals") or {}).items():
        try:
            day_epoch = int(key)
        except (TypeError, ValueError):
            continue
        daily.append(DailyInsulinTotal(
            date_millis=day_epoch * 1000,
            basal_units=_num_or_none(rec.get("basalUnitsPerDay")),
            bolus_units=_num_or_none(rec.get("bolusUnitsPerDay")),
            total_units=_num_or_none(rec.get("totalInsulinPerDay")),
        ))
    daily.sort(key=lambda d: d.date_millis)

    return boluses, daily


def _num_or_none(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


async def test_connection(email: str, password: str) -> tuple[bool, str]:
    if not email or not password:
        return False, "Benutzername und Passwort erforderlich."
    try:
        now = int(time.time() * 1000)
        boluses, daily = await fetch_pump_data(email, password, now - 7 * 24 * 60 * 60 * 1000, now)
    except GlookoError as exc:
        return False, str(exc)
    return True, f"Verbindung erfolgreich -- {len(boluses)} Bolusgaben, {len(daily)} Tage mit Insulin-Tagessumme in den letzten 7 Tagen gefunden."
