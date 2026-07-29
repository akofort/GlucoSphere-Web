"""Withings Public REST API (https://developer.withings.com) direct client -- native OAuth2
(Authorization Code + PKCE) integration for body measurements, daily activity, sleep, and
workouts, alongside Nightscout's/Google Health's own direct-API integrations (see
google_health.py for the identical OAuth2 shape this mirrors -- same PKCE flow, same
settings-blob token storage, same `save_tokens` callback pattern for tools.py to persist a
refreshed token).

Withings' OAuth2 quirks (confirmed via oauth.py's own generic MCP-server OAuth2 path, which was
originally written against a user-configured Withings MCP server -- see its module docstring):
the token endpoint wraps its response in a `{"status": 0, "body": {...}}` envelope instead of
returning fields at the top level, needs an extra `action=requesttoken` form field alongside the
standard OAuth2 params, and throttles rapid refresh calls with a `{"wait_seconds": N}` body rather
than a normal OAuth2 error. Access tokens can also be invalidated well before their reported
expiry (see WithingsError's doc comment) -- callers should retry once with a forced refresh on a
401, same as tools.py's `_execute_withings` already does.

Activity/sleep/workouts (added after the initial weight/body-fat integration, to also cover
Withings smartwatches -- ScanWatch, Move, etc. -- not just the smart scales the first version
targeted) were implemented from Withings' public API reference, not live-tested end to end: the
account this was developed against has no Withings smartwatch/activity tracker, so these calls
have only been confirmed to succeed and parse without error against real (empty) data, not
verified against a real populated response. Widening the scope (see SCOPE below) means any
account that already completed the Withings login before this was added must log in again --
the old token's grant doesn't retroactively cover the new scopes.
"""
from __future__ import annotations

import base64
import hashlib
import secrets
import time
import urllib.parse
from dataclasses import dataclass
from typing import Any, Awaitable, Callable

import httpx

AUTH_ENDPOINT = "https://account.withings.com/oauth2_user/authorize2"
TOKEN_ENDPOINT = "https://wbsapi.withings.net/v2/oauth2"
MEASURE_ENDPOINT = "https://wbsapi.withings.net/v2/measure"
SLEEP_ENDPOINT = "https://wbsapi.withings.net/v2/sleep"
# user.metrics: body measures (weight/fat, via /measure getmeas). user.activity: daily activity
# summaries + workouts (via /measure getactivity/getworkouts). user.sleepevents: sleep summaries
# (via /sleep getsummary). Withings' own docs use comma-separated scopes, not OAuth2's more usual
# space-separated list -- a real, confirmed quirk, not a typo.
SCOPE = "user.metrics,user.activity,user.sleepevents"
_TIMEOUT = httpx.Timeout(15.0, connect=10.0)

# Withings "meastype" codes (https://developer.withings.com/api-reference -> Measure -> getmeas).
_MEASTYPE_WEIGHT = 1
_MEASTYPE_FAT_RATIO = 6


class WithingsError(RuntimeError):
    """`status_code` is Withings' own app-level `status` field from the JSON body (NOT the HTTP
    status -- Withings returns HTTP 200 even for an API-level error like an invalid token), set
    wherever that field indicates failure. Lets callers retry-once-with-forced-refresh specifically
    on a 401 (see get_valid_access_token's `force_refresh` and this module's docstring: Withings
    can invalidate an access token well before its own reported `expires_in` elapses -- confirmed
    live, a token still ~3h from its cached expiry was already rejected as invalid)."""

    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


def pkce_pair() -> tuple[str, str]:
    verifier = base64.urlsafe_b64encode(secrets.token_bytes(40)).decode().rstrip("=")
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    return verifier, challenge


def build_authorize_url(client_id: str, redirect_uri: str, state: str, code_challenge: str) -> str:
    if not client_id:
        raise WithingsError("Withings ist nicht konfiguriert (Client-ID fehlt).")
    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": SCOPE,
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
    }
    return f"{AUTH_ENDPOINT}?{urllib.parse.urlencode(params)}"


def _parse_token_response(resp: httpx.Response) -> dict[str, Any]:
    try:
        data = resp.json()
    except ValueError as exc:
        raise WithingsError(f"Unerwartete Token-Antwort (kein JSON): {resp.text[:300]}") from exc
    body = data.get("body") if isinstance(data, dict) else None
    if not isinstance(body, dict):
        raise WithingsError(f"Unerwartete Token-Antwort: {data}")
    if "access_token" not in body:
        if isinstance(body.get("wait_seconds"), (int, float)):
            raise WithingsError(f"Withings drosselt Token-Anfragen -- bitte {int(body['wait_seconds'])}s warten und erneut versuchen.")
        raise WithingsError(f"Token-Antwort ohne access_token: {body}")
    return body


async def exchange_code(client_id: str, client_secret: str, code: str, redirect_uri: str, code_verifier: str) -> dict[str, Any]:
    body = {
        "action": "requesttoken",
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri,
        "client_id": client_id,
        "client_secret": client_secret,
        "code_verifier": code_verifier,
    }
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(TOKEN_ENDPOINT, data=body, headers={"Accept": "application/json"})
    if resp.status_code >= 400:
        raise WithingsError(f"Withings-Token-Austausch fehlgeschlagen: HTTP {resp.status_code}: {resp.text[:300]}")
    return _parse_token_response(resp)


async def refresh_access_token(client_id: str, client_secret: str, refresh_token: str) -> dict[str, Any]:
    body = {
        "action": "requesttoken",
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "client_id": client_id,
        "client_secret": client_secret,
    }
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(TOKEN_ENDPOINT, data=body, headers={"Accept": "application/json"})
    if resp.status_code >= 400:
        raise WithingsError(f"Withings-Token-Erneuerung fehlgeschlagen: HTTP {resp.status_code}: {resp.text[:300]}")
    return _parse_token_response(resp)


async def get_valid_access_token(
    settings: dict[str, Any], save_tokens: Callable[[str, str, int], Awaitable[None] | None],
    force_refresh: bool = False,
) -> str:
    """`save_tokens(access_token, refresh_token, expires_at)` persists a refreshed token back to
    settings -- passed in rather than importing db directly, same storage-agnostic shape as
    google_health.py's get_valid_access_token.

    `force_refresh=True` bypasses the cached-expiry check entirely -- callers should retry once
    with this after any 401 (WithingsError.status_code == 401) from an actual API call, since
    Withings can invalidate a token well before its own reported expiry (see WithingsError's doc
    comment)."""
    access_token = settings.get("withingsAccessToken") or ""
    expires_at = settings.get("withingsExpiresAt") or 0
    if not force_refresh and access_token and time.time() < expires_at - 60:
        return access_token
    refresh_token = settings.get("withingsRefreshToken") or ""
    if not refresh_token:
        raise WithingsError("Nicht bei Withings angemeldet -- bitte zuerst 'Login mit Withings' ausführen.")
    data = await refresh_access_token(settings.get("withingsClientId", ""), settings.get("withingsClientSecret", ""), refresh_token)
    new_access = data["access_token"]
    new_expires_at = int(time.time()) + int(data.get("expires_in", 10800))
    result = save_tokens(new_access, data.get("refresh_token") or refresh_token, new_expires_at)
    if result is not None:
        await result
    return new_access


@dataclass
class BodyMeasurement:
    date_millis: int
    weight_kg: float | None
    fat_ratio_percent: float | None


async def fetch_measurements(access_token: str, from_millis: int, to_millis: int) -> list[BodyMeasurement]:
    """Withings' `getmeas` action, restricted to real (non-goal, `category=1`) weight + body-fat-
    ratio measurements -- one grouped reading per weigh-in, since Withings reports every metric
    captured in the same session (weight, fat ratio, ...) as one `measuregrp`, not separate rows.
    Each raw `{"value": int, "unit": int}` pair encodes `value * 10**unit` as the real number
    (Withings' own fixed-point encoding, documented in their API reference)."""
    body = await _post_action(MEASURE_ENDPOINT, access_token, {
        "action": "getmeas",
        "meastypes": f"{_MEASTYPE_WEIGHT},{_MEASTYPE_FAT_RATIO}",
        "category": 1,
        "startdate": int(from_millis / 1000),
        "enddate": int(to_millis / 1000),
    })
    groups = body.get("measuregrps") or []
    readings: list[BodyMeasurement] = []
    for grp in groups:
        date_millis = int(grp.get("date", 0)) * 1000
        weight_kg: float | None = None
        fat_ratio: float | None = None
        for m in grp.get("measures", []):
            value, unit, mtype = m.get("value"), m.get("unit"), m.get("type")
            if value is None or unit is None or mtype is None:
                continue
            real_value = value * (10 ** unit)
            if mtype == _MEASTYPE_WEIGHT:
                weight_kg = real_value
            elif mtype == _MEASTYPE_FAT_RATIO:
                fat_ratio = real_value
        if weight_kg is not None or fat_ratio is not None:
            readings.append(BodyMeasurement(date_millis, weight_kg, fat_ratio))
    readings.sort(key=lambda r: r.date_millis)
    return readings


_TREND_STABLE_THRESHOLD_PERCENT = 2.0  # relative change below this counts as "stable"


@dataclass
class Trend:
    direction: str  # "UP" | "DOWN" | "STABLE"
    arrow: str  # "↗" | "↘" | "➔"
    change: float  # last reading minus first reading, in the metric's own unit


def compute_trend(points: list[tuple[int, float]]) -> Trend | None:
    """Compares the EARLIEST vs. LATEST reading in the window (not a full regression) -- matches
    the "3-Monats-Trend ... steigend/fallend/stabil" request literally: first-vs-last over the
    requested 3-month span, not a smoothed slope. None when there are fewer than 2 points to
    compare (nothing to trend)."""
    if len(points) < 2:
        return None
    ordered = sorted(points, key=lambda p: p[0])
    first_value, last_value = ordered[0][1], ordered[-1][1]
    if first_value == 0:
        return None
    change = last_value - first_value
    relative_change_percent = abs(change) / abs(first_value) * 100.0
    if relative_change_percent < _TREND_STABLE_THRESHOLD_PERCENT:
        return Trend("STABLE", "➔", change)
    return Trend("UP", "↗", change) if change > 0 else Trend("DOWN", "↘", change)


@dataclass
class WeightFatTrendResult:
    readings: list[BodyMeasurement]
    weight_trend: Trend | None
    fat_trend: Trend | None


async def fetch_weight_and_fat_trend(access_token: str) -> WeightFatTrendResult:
    """Item 1's "3-Monats-Trend für Gewicht und Körperfettanteil" -- the one bundled call the
    chat tool (see tools.py) actually makes: every measurement in the last 90 days, plus each
    metric's own first-vs-last trend over that same window."""
    now = int(time.time() * 1000)
    from_millis = now - 90 * 24 * 60 * 60 * 1000
    readings = await fetch_measurements(access_token, from_millis, now)
    weight_points = [(r.date_millis, r.weight_kg) for r in readings if r.weight_kg is not None]
    fat_points = [(r.date_millis, r.fat_ratio_percent) for r in readings if r.fat_ratio_percent is not None]
    return WeightFatTrendResult(
        readings=readings,
        weight_trend=compute_trend(weight_points),  # type: ignore[arg-type]
        fat_trend=compute_trend(fat_points),  # type: ignore[arg-type]
    )


def _as_int_or_none(value: object) -> int | None:
    if value is None:
        return None
    try:
        return int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def _as_float_or_none(value: object) -> float | None:
    if value is None:
        return None
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def _seconds_to_minutes(value: object) -> int | None:
    seconds = _as_int_or_none(value)
    return seconds // 60 if seconds is not None else None


def _date_ymd(millis: int) -> str:
    """Withings' activity/sleep/workout endpoints filter by calendar day (`startdateymd`/
    `enddateymd`), not epoch millis like `getmeas` -- local calendar day, matching how every other
    day-bucketed value in this app is presented (see e.g. nightscout.py's own %d.%m. formatting)."""
    return time.strftime("%Y-%m-%d", time.localtime(millis / 1000))


def _parse_ymd_millis(date_str: object) -> int | None:
    if not isinstance(date_str, str) or not date_str:
        return None
    try:
        parsed = time.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        return None
    return int(time.mktime(parsed) * 1000)


async def _post_action(endpoint: str, access_token: str, body: dict[str, Any]) -> dict[str, Any]:
    """Shared POST + status-check for the three endpoints below -- same status-code-carrying
    error shape as fetch_measurements, so the 401-retry-once pattern works identically for all of
    them."""
    headers = {"Authorization": f"Bearer {access_token}"}
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(endpoint, data=body, headers=headers)
    if resp.status_code >= 400:
        raise WithingsError(f"Withings-API-Fehler: HTTP {resp.status_code}: {resp.text[:300]}")
    data = resp.json()
    body_status = data.get("status")
    if body_status != 0:
        status_code = body_status if isinstance(body_status, int) else None
        raise WithingsError(f"Withings-API-Fehler: status {body_status}: {data.get('error', '')}", status_code=status_code)
    return data.get("body") or {}


# ---------------------------------------------------------------------------
# Daily activity (steps, distance, calories, heart rate) -- smartwatch/tracker data
# ---------------------------------------------------------------------------

# Steps/distance/calories/elevation/soft/moderate/intense are returned by default; heart-rate
# fields need to be requested explicitly via data_fields (confirmed via Withings' API reference).
_ACTIVITY_DATA_FIELDS = "hr_average,hr_min,hr_max"


@dataclass
class DailyActivity:
    date_millis: int  # local midnight of the day this summary covers
    steps: int | None
    distance_meters: float | None
    calories_kcal: float | None
    elevation_meters: float | None
    soft_activity_minutes: int | None
    moderate_activity_minutes: int | None
    intense_activity_minutes: int | None
    hr_average_bpm: int | None
    hr_min_bpm: int | None
    hr_max_bpm: int | None


async def fetch_activity(access_token: str, from_millis: int, to_millis: int) -> list[DailyActivity]:
    body = await _post_action(MEASURE_ENDPOINT, access_token, {
        "action": "getactivity",
        "startdateymd": _date_ymd(from_millis),
        "enddateymd": _date_ymd(to_millis),
        "data_fields": _ACTIVITY_DATA_FIELDS,
    })
    result: list[DailyActivity] = []
    for a in body.get("activities") or []:
        date_millis = _parse_ymd_millis(a.get("date"))
        if date_millis is None:
            continue
        result.append(DailyActivity(
            date_millis=date_millis,
            steps=_as_int_or_none(a.get("steps")),
            distance_meters=_as_float_or_none(a.get("distance")),
            calories_kcal=_as_float_or_none(a.get("calories")),
            elevation_meters=_as_float_or_none(a.get("elevation")),
            soft_activity_minutes=_as_int_or_none(a.get("soft")),
            moderate_activity_minutes=_as_int_or_none(a.get("moderate")),
            intense_activity_minutes=_as_int_or_none(a.get("intense")),
            hr_average_bpm=_as_int_or_none(a.get("hr_average")),
            hr_min_bpm=_as_int_or_none(a.get("hr_min")),
            hr_max_bpm=_as_int_or_none(a.get("hr_max")),
        ))
    result.sort(key=lambda x: x.date_millis)
    return result


# ---------------------------------------------------------------------------
# Sleep summaries -- smartwatch/tracker data
# ---------------------------------------------------------------------------

@dataclass
class SleepSummary:
    date_millis: int  # local midnight of the day this summary's night ENDS on
    total_sleep_minutes: int | None
    light_sleep_minutes: int | None
    deep_sleep_minutes: int | None
    rem_sleep_minutes: int | None
    wakeup_count: int | None
    wakeup_duration_minutes: int | None
    sleep_score: int | None
    hr_average_bpm: int | None


async def fetch_sleep_summary(access_token: str, from_millis: int, to_millis: int) -> list[SleepSummary]:
    body = await _post_action(SLEEP_ENDPOINT, access_token, {
        "action": "getsummary",
        "startdateymd": _date_ymd(from_millis),
        "enddateymd": _date_ymd(to_millis),
    })
    result: list[SleepSummary] = []
    for s in body.get("series") or []:
        date_millis = _parse_ymd_millis(s.get("date"))
        if date_millis is None:
            continue
        d = s.get("data") or {}
        result.append(SleepSummary(
            date_millis=date_millis,
            total_sleep_minutes=_seconds_to_minutes(d.get("total_sleep_time")),
            light_sleep_minutes=_seconds_to_minutes(d.get("lightsleepduration")),
            deep_sleep_minutes=_seconds_to_minutes(d.get("deepsleepduration")),
            rem_sleep_minutes=_seconds_to_minutes(d.get("remsleepduration")),
            wakeup_count=_as_int_or_none(d.get("wakeupcount")),
            wakeup_duration_minutes=_seconds_to_minutes(d.get("wakeupduration")),
            sleep_score=_as_int_or_none(d.get("sleep_score")),
            hr_average_bpm=_as_int_or_none(d.get("hr_average")),
        ))
    result.sort(key=lambda x: x.date_millis)
    return result


# ---------------------------------------------------------------------------
# Workouts -- smartwatch/tracker data
# ---------------------------------------------------------------------------

# Not exhaustive -- Withings has ~90 workout category codes (developer.withings.com/api-reference
# -> Measure -> getworkouts). Unrecognized ids fall back to "Kategorie <id>" rather than guessing.
_WORKOUT_CATEGORY_LABELS = {
    1: "Gehen", 2: "Laufen", 3: "Wandern", 6: "Radfahren", 7: "Schwimmen", 8: "Surfen",
    9: "Kitesurfen", 10: "Windsurfen", 12: "Tennis", 13: "Tischtennis", 14: "Squash",
    15: "Badminton", 16: "Krafttraining", 17: "Wasserball", 18: "Wassergymnastik", 19: "Boxen",
    20: "Golf", 21: "Tanzen", 24: "Yoga", 34: "Fußball", 35: "Rugby", 36: "Basketball",
    186: "Klettern", 187: "Handball",
}


@dataclass
class Workout:
    start_millis: int
    end_millis: int
    category: int
    category_label: str
    calories_kcal: float | None
    distance_meters: float | None
    steps: int | None
    hr_average_bpm: int | None


async def fetch_workouts(access_token: str, from_millis: int, to_millis: int) -> list[Workout]:
    body = await _post_action(MEASURE_ENDPOINT, access_token, {
        "action": "getworkouts",
        "startdateymd": _date_ymd(from_millis),
        "enddateymd": _date_ymd(to_millis),
        "data_fields": "calories,hr_average,steps,distance",
    })
    result: list[Workout] = []
    for w in body.get("series") or []:
        start = _as_int_or_none(w.get("startdate"))
        end = _as_int_or_none(w.get("enddate"))
        if start is None or end is None:
            continue
        d = w.get("data") or {}
        category = _as_int_or_none(w.get("category")) or 0
        result.append(Workout(
            start_millis=start * 1000,
            end_millis=end * 1000,
            category=category,
            category_label=_WORKOUT_CATEGORY_LABELS.get(category, f"Kategorie {category}"),
            calories_kcal=_as_float_or_none(d.get("calories")),
            distance_meters=_as_float_or_none(d.get("distance")),
            steps=_as_int_or_none(d.get("steps")),
            hr_average_bpm=_as_int_or_none(d.get("hr_average")),
        ))
    result.sort(key=lambda x: x.start_millis)
    return result
