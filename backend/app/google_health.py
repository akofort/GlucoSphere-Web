"""Google Health API (https://developers.google.com/health/reference/rest) direct client --
native OAuth2 (Authorization Code + PKCE) integration for blood glucose and sleep data, alongside
Nightscout's/FeelFit's own direct-API integrations. Unlike those two (fixed username+secret),
this needs OAuth2 since Google's consumer health API only allows delegated per-user access -- same
PKCE shape as oauth.py's generic MCP-server OAuth2, implemented separately here since Google
Health isn't an MCP server (just its own REST API), so the well-known Google endpoints can be
defaults instead of admin-entered.

Confirmed against the live discovery document (health.googleapis.com/$discovery/rest?version=v4)
and live-probed against a real account's data (see fetch_* docstrings for exact scope/path per
data type). Blood glucose lives under `users/me/dataTypes/blood-glucose/dataPoints`, value already
in mg/dL (`bloodGlucoseMilligramsPerDeciliter`), scope `health_metrics_and_measurements.readonly`.
Sleep, heart rate, HRV, resting heart rate and steps all live behind the SAME OAuth connection but
different scopes (https://developers.google.com/health/scopes) -- all requested together at login
so one "Login mit Google" covers everything; an account that authorized an older/narrower scope
set needs to re-run the login once for the newly added tools to start working (OAuth doesn't
retroactively add scopes to an existing refresh token). Not otherwise live-tested end to end (that
needs a real Google Cloud OAuth client, which only the deploying admin can register -- same
constraint as Withings, see oauth.py).
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import secrets
import time
import urllib.parse
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable

import httpx

AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
SCOPE = (
    "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly "
    "https://www.googleapis.com/auth/googlehealth.sleep.readonly "
    "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly"
)
_API_BASE = "https://health.googleapis.com/v4"
_TIMEOUT = httpx.Timeout(15.0, connect=10.0)


class GoogleHealthError(RuntimeError):
    pass


def pkce_pair() -> tuple[str, str]:
    verifier = base64.urlsafe_b64encode(secrets.token_bytes(40)).decode().rstrip("=")
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    return verifier, challenge


def build_authorize_url(client_id: str, redirect_uri: str, state: str, code_challenge: str) -> str:
    if not client_id:
        raise GoogleHealthError("Google Health ist nicht konfiguriert (Client-ID fehlt).")
    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": SCOPE,
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "access_type": "offline",
        "prompt": "consent",
    }
    return f"{AUTH_ENDPOINT}?{urllib.parse.urlencode(params)}"


async def exchange_code(client_id: str, client_secret: str, code: str, redirect_uri: str, code_verifier: str) -> dict[str, Any]:
    body = {
        "grant_type": "authorization_code", "code": code, "redirect_uri": redirect_uri,
        "client_id": client_id, "client_secret": client_secret, "code_verifier": code_verifier,
    }
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(TOKEN_ENDPOINT, data=body, headers={"Accept": "application/json"})
    if resp.status_code >= 400:
        raise GoogleHealthError(f"Google-Token-Austausch fehlgeschlagen: HTTP {resp.status_code}: {resp.text[:300]}")
    return resp.json()


async def refresh_access_token(client_id: str, client_secret: str, refresh_token: str) -> dict[str, Any]:
    body = {
        "grant_type": "refresh_token", "refresh_token": refresh_token,
        "client_id": client_id, "client_secret": client_secret,
    }
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(TOKEN_ENDPOINT, data=body, headers={"Accept": "application/json"})
    if resp.status_code >= 400:
        raise GoogleHealthError(f"Google-Token-Erneuerung fehlgeschlagen: HTTP {resp.status_code}: {resp.text[:300]}")
    return resp.json()


async def get_valid_access_token(
    settings: dict[str, Any], save_tokens: Callable[[str, str, int], Awaitable[None] | None],
) -> str:
    """`save_tokens(access_token, refresh_token, expires_at)` persists a refreshed token back to
    settings -- passed in rather than importing db directly, same storage-agnostic shape as
    oauth.py's get_valid_access_token."""
    access_token = settings.get("googleHealthAccessToken") or ""
    expires_at = settings.get("googleHealthExpiresAt") or 0
    if access_token and time.time() < expires_at - 60:
        return access_token
    refresh_token = settings.get("googleHealthRefreshToken") or ""
    if not refresh_token:
        raise GoogleHealthError("Nicht bei Google Health angemeldet -- bitte zuerst 'Login mit Google' ausführen.")
    data = await refresh_access_token(
        settings.get("googleHealthClientId", ""), settings.get("googleHealthClientSecret", ""), refresh_token,
    )
    new_access = data["access_token"]
    new_expires_at = int(time.time()) + int(data.get("expires_in", 3600))
    result = save_tokens(new_access, data.get("refresh_token") or refresh_token, new_expires_at)
    if result is not None:
        await result
    return new_access


@dataclass
class GlucoseReading:
    date_millis: int
    mg_dl: float


def _parse_time_millis(physical_time: str) -> int:
    text = physical_time.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    dt = datetime.fromisoformat(text)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp() * 1000)


async def fetch_blood_glucose(access_token: str, from_millis: int, to_millis: int) -> list[GlucoseReading]:
    from_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(from_millis / 1000))
    to_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(to_millis / 1000))
    # Filter field prefix is the snake_case proto field name (confirmed via the discovery
    # document's own `daily_heart_rate_variability.date` example) -- NOT the kebab-case data
    # type ID used in the URL path (`blood-glucose`). Using the kebab form here previously
    # caused a live HTTP 400 INVALID_DATA_POINT_FILTER_DATA_TYPE_RESTRICTION error.
    filter_expr = (
        f'blood_glucose.sample_time.physical_time >= "{from_iso}" AND '
        f'blood_glucose.sample_time.physical_time < "{to_iso}"'
    )
    url = f"{_API_BASE}/users/me/dataTypes/blood-glucose/dataPoints"
    headers = {"Authorization": f"Bearer {access_token}"}
    readings: list[GlucoseReading] = []
    page_token: str | None = None
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        for _ in range(10):  # hard cap on pagination loops
            params: dict[str, Any] = {"filter": filter_expr, "pageSize": 1000}
            if page_token:
                params["pageToken"] = page_token
            resp = await client.get(url, headers=headers, params=params)
            if resp.status_code >= 400:
                raise GoogleHealthError(f"Google-Health-API-Fehler: HTTP {resp.status_code}: {resp.text[:300]}")
            data = resp.json()
            for dp in data.get("dataPoints", []):
                bg = dp.get("bloodGlucose")
                if not bg:
                    continue
                sample_time = bg.get("sampleTime", {}).get("physicalTime")
                value = bg.get("bloodGlucoseMilligramsPerDeciliter")
                if sample_time is None or value is None:
                    continue
                readings.append(GlucoseReading(_parse_time_millis(sample_time), float(value)))
            page_token = data.get("nextPageToken")
            if not page_token:
                break
    readings.sort(key=lambda r: r.date_millis)
    return readings


@dataclass
class SleepSession:
    start_millis: int
    end_millis: int
    minutes_asleep: int | None
    minutes_awake: int | None
    minutes_in_sleep_period: int | None
    minutes_to_fall_asleep: int | None


async def fetch_sleep(access_token: str, from_millis: int, to_millis: int) -> list[SleepSession]:
    from_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(from_millis / 1000))
    to_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(to_millis / 1000))
    # Sleep is a "session" data type filtered on interval END time (not start time like the
    # generic session pattern, and not sample_time like blood glucose) -- confirmed via the
    # discovery doc's dataPoints.list filter grammar ("Session end time (Sleep specific)").
    filter_expr = f'sleep.interval.end_time >= "{from_iso}" AND sleep.interval.end_time < "{to_iso}"'
    url = f"{_API_BASE}/users/me/dataTypes/sleep/dataPoints"
    headers = {"Authorization": f"Bearer {access_token}"}
    sessions: list[SleepSession] = []
    page_token: str | None = None
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        for _ in range(10):  # hard cap on pagination loops
            params: dict[str, Any] = {"filter": filter_expr, "pageSize": 1000}
            if page_token:
                params["pageToken"] = page_token
            resp = await client.get(url, headers=headers, params=params)
            if resp.status_code >= 400:
                raise GoogleHealthError(f"Google-Health-API-Fehler: HTTP {resp.status_code}: {resp.text[:300]}")
            data = resp.json()
            for dp in data.get("dataPoints", []):
                sleep = dp.get("sleep")
                if not sleep:
                    continue
                interval = sleep.get("interval") or {}
                start_time = interval.get("startTime")
                end_time = interval.get("endTime")
                if start_time is None or end_time is None:
                    continue
                summary = sleep.get("summary") or {}
                sessions.append(SleepSession(
                    start_millis=_parse_time_millis(start_time),
                    end_millis=_parse_time_millis(end_time),
                    minutes_asleep=_int_or_none(summary.get("minutesAsleep")),
                    minutes_awake=_int_or_none(summary.get("minutesAwake")),
                    minutes_in_sleep_period=_int_or_none(summary.get("minutesInSleepPeriod")),
                    minutes_to_fall_asleep=_int_or_none(summary.get("minutesToFallAsleep")),
                ))
            page_token = data.get("nextPageToken")
            if not page_token:
                break
    sessions.sort(key=lambda s: s.start_millis)
    return sessions


def _int_or_none(value: Any) -> int | None:
    return int(value) if value is not None else None


async def _fetch_data_points(access_token: str, data_type: str, filter_expr: str) -> list[dict]:
    url = f"{_API_BASE}/users/me/dataTypes/{data_type}/dataPoints"
    headers = {"Authorization": f"Bearer {access_token}"}
    points: list[dict] = []
    page_token: str | None = None
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        for _ in range(10):  # hard cap on pagination loops
            params: dict[str, Any] = {"filter": filter_expr, "pageSize": 1000}
            if page_token:
                params["pageToken"] = page_token
            resp = await client.get(url, headers=headers, params=params)
            if resp.status_code >= 400:
                raise GoogleHealthError(f"Google-Health-API-Fehler: HTTP {resp.status_code}: {resp.text[:300]}")
            data = resp.json()
            points.extend(data.get("dataPoints", []))
            page_token = data.get("nextPageToken")
            if not page_token:
                break
    return points


@dataclass
class StepsInterval:
    start_millis: int
    end_millis: int
    count: int


async def fetch_steps(access_token: str, from_millis: int, to_millis: int) -> list[StepsInterval]:
    """`steps` is a generic interval data type (unlike sleep, filtered on interval START time --
    live-probed 403 confirmed it needs the `activity_and_fitness.readonly` scope, distinct from
    the blood-glucose/sleep scopes already in use)."""
    from_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(from_millis / 1000))
    to_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(to_millis / 1000))
    filter_expr = f'steps.interval.start_time >= "{from_iso}" AND steps.interval.start_time < "{to_iso}"'
    points = await _fetch_data_points(access_token, "steps", filter_expr)
    intervals: list[StepsInterval] = []
    for dp in points:
        steps = dp.get("steps")
        if not steps:
            continue
        interval = steps.get("interval") or {}
        start_time, end_time, count = interval.get("startTime"), interval.get("endTime"), steps.get("count")
        if start_time is None or end_time is None or count is None:
            continue
        intervals.append(StepsInterval(_parse_time_millis(start_time), _parse_time_millis(end_time), int(count)))
    intervals.sort(key=lambda s: s.start_millis)
    return intervals


# ---------------------------------------------------------------------------
# Daily rollups (dataPoints:dailyRollUp)
# ---------------------------------------------------------------------------
# Google Health aggregates server-side via `POST .../dataPoints:dailyRollUp` (confirmed against the
# live discovery document). That is the right call for "how many steps yesterday": it reconciles
# every data source (watch + phone both counting the same walk) and drops wearable data from
# intervals when the device wasn't actually worn -- neither of which raw interval data points can
# do, and summing those locally therefore double-counts. The rollup also survives the common case
# where the writing app only publishes daily totals and no intraday intervals at all.
#
# Ranges are CIVIL time (the user's calendar days, no timezone), and the API caps them: 14 days for
# active-minutes/total-calories/heart-rate, 90 days for everything else.
_ROLLUP_MAX_DAYS = {"active-minutes": 14, "total-calories": 14, "heart-rate": 14}
_ROLLUP_DEFAULT_MAX_DAYS = 90
_DAY_MILLIS = 24 * 60 * 60 * 1000


def _civil_date(millis: int) -> dict[str, Any]:
    """Local calendar date -- the container runs in the user's timezone (TZ in docker-compose.yml),
    so "yesterday" here means their yesterday, not UTC's."""
    lt = time.localtime(millis / 1000)
    return {"date": {"year": lt.tm_year, "month": lt.tm_mon, "day": lt.tm_mday}}


def _civil_date_to_millis(civil: dict[str, Any]) -> int:
    date_obj = (civil or {}).get("date") or {}
    if not date_obj.get("year"):
        return 0
    return int(datetime(
        int(date_obj["year"]), int(date_obj.get("month") or 1), int(date_obj.get("day") or 1),
    ).timestamp() * 1000)


async def fetch_daily_rollup(access_token: str, data_type: str, from_millis: int, to_millis: int) -> list[dict]:
    """One rolled-up data point per calendar day, in `DailyRollupDataPoint` shape (the value lives
    under the data type's own camelCase key, e.g. `steps.countSum`). The requested range is clamped
    to the API's per-type maximum, keeping the most recent days."""
    max_days = _ROLLUP_MAX_DAYS.get(data_type, _ROLLUP_DEFAULT_MAX_DAYS)
    if to_millis - from_millis > max_days * _DAY_MILLIS:
        from_millis = to_millis - max_days * _DAY_MILLIS
    # `end` is exclusive and must be day-aligned -- take the day AFTER `to_millis` so the current
    # (partial) day is included instead of silently dropped.
    body: dict[str, Any] = {
        "range": {"start": _civil_date(from_millis), "end": _civil_date(to_millis + _DAY_MILLIS)},
        "windowSizeDays": 1,
    }
    url = f"{_API_BASE}/users/me/dataTypes/{data_type}/dataPoints:dailyRollUp"
    headers = {"Authorization": f"Bearer {access_token}"}
    points: list[dict] = []
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        for _ in range(10):  # hard cap on pagination loops
            resp = await client.post(url, headers=headers, json=body)
            if resp.status_code >= 400:
                raise GoogleHealthError(f"Google-Health-API-Fehler ({data_type}): HTTP {resp.status_code}: {resp.text[:300]}")
            data = resp.json()
            points.extend(data.get("rollupDataPoints", []))
            next_token = data.get("nextPageToken")
            if not next_token:
                break
            body["pageToken"] = next_token
    return points


@dataclass
class DailySteps:
    date_millis: int
    count: int


async def fetch_daily_steps(access_token: str, from_millis: int, to_millis: int) -> list[DailySteps]:
    days = []
    for dp in await fetch_daily_rollup(access_token, "steps", from_millis, to_millis):
        count = ((dp.get("steps") or {}).get("countSum"))
        date_millis = _civil_date_to_millis(dp.get("civilStartTime") or {})
        if count is None or not date_millis:
            continue
        days.append(DailySteps(date_millis, int(count)))
    days.sort(key=lambda d: d.date_millis)
    return days


@dataclass
class DailyActivity:
    date_millis: int
    steps: int | None = None
    distance_meters: float | None = None
    active_minutes: int | None = None
    active_kcal: float | None = None


async def fetch_daily_activity(access_token: str, from_millis: int, to_millis: int) -> list[DailyActivity]:
    """Steps, distance, active minutes and active calories per day, merged into one row per day.
    Each data type is its own rollup call (the endpoint's parent path IS the data type), so they
    run concurrently; a type the account has no data for -- or that its granted scopes don't cover
    -- is skipped rather than failing the whole summary."""
    async def safe(data_type: str) -> list[dict]:
        try:
            return await fetch_daily_rollup(access_token, data_type, from_millis, to_millis)
        except GoogleHealthError:
            return []

    steps, distance, active_minutes, energy = await asyncio.gather(
        safe("steps"), safe("distance"), safe("active-minutes"), safe("active-energy-burned"),
    )

    by_date: dict[int, DailyActivity] = {}

    def row(dp: dict) -> DailyActivity | None:
        date_millis = _civil_date_to_millis(dp.get("civilStartTime") or {})
        if not date_millis:
            return None
        return by_date.setdefault(date_millis, DailyActivity(date_millis))

    for dp in steps:
        entry, value = row(dp), (dp.get("steps") or {}).get("countSum")
        if entry and value is not None:
            entry.steps = int(value)
    for dp in distance:
        entry, value = row(dp), (dp.get("distance") or {}).get("millimetersSum")
        if entry and value is not None:
            entry.distance_meters = int(value) / 1000.0
    for dp in active_minutes:
        entry = row(dp)
        levels = (dp.get("activeMinutes") or {}).get("activeMinutesRollupByActivityLevel") or []
        total = sum(int(level.get("activeMinutesSum") or 0) for level in levels)
        if entry and levels:
            entry.active_minutes = total
    for dp in energy:
        entry, value = row(dp), (dp.get("activeEnergyBurned") or {}).get("kcalSum")
        if entry and value is not None:
            entry.active_kcal = float(value)

    return sorted(by_date.values(), key=lambda d: d.date_millis)


@dataclass
class HeartRateReading:
    date_millis: int
    bpm: int


async def fetch_heart_rate(access_token: str, from_millis: int, to_millis: int) -> list[HeartRateReading]:
    """`heart-rate` is a sample data type, same shape as blood glucose (live-probed: works with
    the existing health_metrics_and_measurements scope, no extra scope needed)."""
    from_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(from_millis / 1000))
    to_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(to_millis / 1000))
    filter_expr = (
        f'heart_rate.sample_time.physical_time >= "{from_iso}" AND '
        f'heart_rate.sample_time.physical_time < "{to_iso}"'
    )
    points = await _fetch_data_points(access_token, "heart-rate", filter_expr)
    readings: list[HeartRateReading] = []
    for dp in points:
        hr = dp.get("heartRate")
        if not hr:
            continue
        sample_time = hr.get("sampleTime", {}).get("physicalTime")
        bpm = hr.get("beatsPerMinute")
        if sample_time is None or bpm is None:
            continue
        readings.append(HeartRateReading(_parse_time_millis(sample_time), int(bpm)))
    readings.sort(key=lambda r: r.date_millis)
    return readings


@dataclass
class DailyRestingHeartRate:
    date_millis: int
    bpm: int


def _parse_date_only(date_obj: dict[str, Any]) -> int:
    dt = datetime(int(date_obj["year"]), int(date_obj["month"]), int(date_obj["day"]), tzinfo=timezone.utc)
    return int(dt.timestamp() * 1000)


def _date_iso(millis: int) -> str:
    return time.strftime("%Y-%m-%d", time.gmtime(millis / 1000))


async def fetch_resting_heart_rate(access_token: str, from_millis: int, to_millis: int) -> list[DailyRestingHeartRate]:
    """`daily-resting-heart-rate` is a "daily summary" data type, filtered on `.date` (live-probed:
    works with the existing health_metrics_and_measurements scope)."""
    filter_expr = (
        f'daily_resting_heart_rate.date >= "{_date_iso(from_millis)}" AND '
        f'daily_resting_heart_rate.date < "{_date_iso(to_millis)}"'
    )
    points = await _fetch_data_points(access_token, "daily-resting-heart-rate", filter_expr)
    readings: list[DailyRestingHeartRate] = []
    for dp in points:
        drhr = dp.get("dailyRestingHeartRate")
        if not drhr:
            continue
        date_obj, bpm = drhr.get("date"), drhr.get("beatsPerMinute")
        if date_obj is None or bpm is None:
            continue
        readings.append(DailyRestingHeartRate(_parse_date_only(date_obj), int(bpm)))
    readings.sort(key=lambda r: r.date_millis)
    return readings


@dataclass
class DailyHrv:
    date_millis: int
    average_hrv_milliseconds: float | None


async def fetch_daily_hrv(access_token: str, from_millis: int, to_millis: int) -> list[DailyHrv]:
    """`daily-heart-rate-variability` is a "daily summary" data type, filtered on `.date`
    (live-probed: works with the existing health_metrics_and_measurements scope). Reports the
    daily average HRV (RMSSD, milliseconds) -- higher is generally associated with better
    recovery, though Google Health has no single "readiness"/"Tagesform" score of its own."""
    filter_expr = (
        f'daily_heart_rate_variability.date >= "{_date_iso(from_millis)}" AND '
        f'daily_heart_rate_variability.date < "{_date_iso(to_millis)}"'
    )
    points = await _fetch_data_points(access_token, "daily-heart-rate-variability", filter_expr)
    readings: list[DailyHrv] = []
    for dp in points:
        dhrv = dp.get("dailyHeartRateVariability")
        if not dhrv:
            continue
        date_obj = dhrv.get("date")
        if date_obj is None:
            continue
        avg = dhrv.get("averageHeartRateVariabilityMilliseconds")
        readings.append(DailyHrv(_parse_date_only(date_obj), float(avg) if avg is not None else None))
    readings.sort(key=lambda r: r.date_millis)
    return readings
