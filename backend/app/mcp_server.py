"""Hand-rolled MCP (Model Context Protocol) SERVER implementation -- exposes GlucoSphere-Web's own
data as MCP tools for external clients (Claude Desktop, Open WebUI, ...) via `POST /api/mcp` (see
main.py). The reverse role of tools.py/mcp_client.py, which is this app acting as an MCP CLIENT of
other servers -- here GlucoSphere-Web itself IS the server.

Deliberately NOT built on the official `mcp` Python SDK: `pip install mcp` (current release,
mcp==2.0.0) force-upgrades starlette to >=1.x and pydantic to 2.13+, both incompatible with this
app's pinned fastapi==0.115.6 (requires starlette<0.42,>=0.40) -- confirmed live against the
production container (pip's own resolver error), then fully reverted via
`docker compose up -d --force-recreate backend`. Hand-implementing the JSON-RPC 2.0 / Streamable
HTTP transport directly here avoids that conflict entirely -- only a handful of methods are
actually needed (initialize, notifications/initialized, ping, tools/list, tools/call), well within
reach without the SDK.

Every tool below returns a plain JSON-serializable dict (never raises for a "not configured"
source -- that's reported as `{"configured": false, "note": "..."}` in the result instead, same
"never crash the tool call" philosophy as tools.py's own native tools). `get_raw_glucose_entries`/
`get_raw_device_events`/`get_24h_traffic_light_status`/`get_data_gap_report` are deliberately
scoped to the direct Nightscout REST API only (not Dexcom/LibreLinkUp/Glooko/MCP sources) -- the
request explicitly names Nightscout as the raw-data source, and combining heterogeneous sources
without per-row provenance tagging would undermine "unaggregated raw data" for an external client
that has no other way to know which source each row came from.
"""
from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable

from . import db, google_health, nightscout, withings
from .tools import _withings_call_with_retry as _withings_retry

PROTOCOL_VERSION = "2024-11-05"
SERVER_NAME = "glucosphere-web"
SERVER_VERSION = "1.0"

_MGDL_TO_MMOL = 18.0182


# ---------------------------------------------------------------------------
# Small shared helpers
# ---------------------------------------------------------------------------

def _now_millis() -> int:
    return int(time.time() * 1000)


def _days_window(days: int) -> tuple[int, int]:
    now = _now_millis()
    return now - int(days) * 24 * 60 * 60 * 1000, now


def _parse_iso_millis(text: str) -> int:
    cleaned = (text or "").strip()
    if cleaned.endswith("Z"):
        cleaned = cleaned[:-1] + "+00:00"
    dt = datetime.fromisoformat(cleaned)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp() * 1000)


def _iso_utc(millis: int) -> str:
    return datetime.fromtimestamp(millis / 1000, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _local_date_str(millis: int) -> str:
    """Matches withings.py's own local-time date encoding (`_parse_ymd_millis` uses `time.mktime`)."""
    return time.strftime("%Y-%m-%d", time.localtime(millis / 1000))


def _utc_date_str(millis: int) -> str:
    """Matches google_health.py's own UTC date encoding (`_parse_date_only` is UTC-aware)."""
    return time.strftime("%Y-%m-%d", time.gmtime(millis / 1000))


def _convert_glucose(value_mgdl: float, units: str) -> float:
    return round(value_mgdl / _MGDL_TO_MMOL, 2) if units == "mmol" else round(value_mgdl, 1)


def _metrics_dict(m: nightscout.DashboardMetrics, units: str) -> dict[str, Any]:
    return {
        "timeInRangePercent": round(m.tir_percent, 1),
        "hypoPercent": round(m.hypo_percent, 1),
        "severeHypoPercent": round(m.severe_hypo_percent, 1),
        "hyperPercent": round(m.hyper_percent, 1),
        "cvPercent": round(m.cv_percent, 1),
        "averageGlucose": _convert_glucose(m.avg_glucose, units),
        "estimatedHbA1cPercent": round(m.estimated_hba1c_percent, 2),
        "units": units,
    }


def _trend_dict(trend: "withings.Trend | None") -> dict[str, Any] | None:
    if trend is None:
        return None
    return {"direction": trend.direction, "change": round(trend.change, 2)}


def _nightscout_configured(settings: dict) -> bool:
    return bool(settings.get("nightscoutApiUrl")) and settings.get("nightscoutApiEnabled", True)


def _nightscout_creds(settings: dict) -> tuple[str, str, str]:
    return settings["nightscoutApiUrl"], settings["nightscoutApiAuthMethod"], settings["nightscoutApiSecret"]


def _withings_configured(settings: dict) -> bool:
    return bool(settings.get("withingsEnabled", True)) and bool(
        settings.get("withingsAccessToken") or settings.get("withingsRefreshToken")
    )


def _save_google_health_tokens(access_token: str, refresh_token: str, expires_at: int) -> None:
    db.save_settings({
        "googleHealthAccessToken": access_token,
        "googleHealthRefreshToken": refresh_token,
        "googleHealthExpiresAt": expires_at,
    })


def _resolve_primary_patient() -> dict | None:
    """No per-request "current user" exists for a bearer-token MCP call (unlike the cookie-session
    chat, see main.py's `_resolve_main_user`) -- falls back to the household's/practice's own
    primary patient: the first DIABETIKER account, or the first ADMIN account if none is set up
    yet, or simply the first account that exists at all."""
    users = db.list_users()
    diabetiker = [u for u in users if u.get("userRole") == "DIABETIKER"]
    if diabetiker:
        return diabetiker[0]
    admins = [u for u in users if u.get("role") == "ADMIN"]
    if admins:
        return admins[0]
    return users[0] if users else None


# ---------------------------------------------------------------------------
# Tool implementations
# ---------------------------------------------------------------------------

async def _tool_raw_glucose_entries(arguments: dict[str, Any]) -> dict[str, Any]:
    start, end = arguments.get("start"), arguments.get("end")
    if not start or not end:
        raise ValueError("Both 'start' and 'end' are required.")
    limit = int(arguments.get("limit") or 288)
    from_millis, to_millis = _parse_iso_millis(start), _parse_iso_millis(end)
    settings = db.load_settings()
    if not _nightscout_configured(settings):
        return {
            "configured": False,
            "note": "Nightscout is not configured (Settings -> Data sources -> Nightscout). "
                    "This tool only queries the direct Nightscout REST API, no other glucose source.",
        }
    entries = await nightscout.fetch_entries(*_nightscout_creds(settings), from_millis, to_millis)
    entries.sort(key=lambda e: e.date_millis)
    if limit > 0:
        entries = entries[-limit:]
    result_entries = []
    prev = None
    for e in entries:
        velocity = None
        if prev is not None:
            dt_min = (e.date_millis - prev.date_millis) / 60_000
            if dt_min > 0:
                velocity = round((e.sgv_mg_dl - prev.sgv_mg_dl) / dt_min, 2)
        result_entries.append({
            "timestamp": _iso_utc(e.date_millis),
            "epochMillis": e.date_millis,
            "glucoseMgDl": round(e.sgv_mg_dl, 1),
            "trend": e.direction or None,
            "trendArrow": nightscout.trend_arrow_for(e.direction),
            "velocityMgDlPerMin": velocity,
        })
        prev = e
    return {"configured": True, "source": "nightscout", "count": len(result_entries), "entries": result_entries}


async def _tool_raw_device_events(arguments: dict[str, Any]) -> dict[str, Any]:
    start, end = arguments.get("start"), arguments.get("end")
    if not start or not end:
        raise ValueError("Both 'start' and 'end' are required.")
    limit = int(arguments.get("limit") or 100)
    from_millis, to_millis = _parse_iso_millis(start), _parse_iso_millis(end)
    settings = db.load_settings()
    if not _nightscout_configured(settings):
        return {
            "configured": False,
            "note": "Nightscout is not configured (Settings -> Data sources -> Nightscout). "
                    "This tool only queries the direct Nightscout REST API, no other treatment source.",
        }
    treatments = await nightscout.fetch_treatments(*_nightscout_creds(settings), from_millis, to_millis)
    if limit > 0:
        treatments = treatments[-limit:]
    events = [
        {
            "timestamp": _iso_utc(t.date_millis),
            "epochMillis": t.date_millis,
            "eventType": t.event_type or None,
            "insulinUnits": t.insulin_units,
            "carbsGrams": t.carbs_grams,
            "tempBasalRatePerHour": t.temp_basal_rate,
            "tempBasalPercent": t.temp_basal_percent,
            "durationMinutes": t.duration_minutes,
            "notes": t.notes or None,
        }
        for t in treatments
    ]
    return {"configured": True, "source": "nightscout", "count": len(events), "events": events}


async def _tool_traffic_light_status(arguments: dict[str, Any]) -> dict[str, Any]:
    units = arguments.get("units") or "mgdl"
    settings = db.load_settings()
    if not _nightscout_configured(settings):
        return {"configured": False, "note": "Nightscout is not configured (Settings -> Data sources -> Nightscout)."}
    now = _now_millis()
    from_millis = now - 24 * 60 * 60 * 1000
    entries = await nightscout.fetch_entries(*_nightscout_creds(settings), from_millis, now)
    metrics = nightscout.compute_metrics(entries)
    if metrics is None:
        return {"configured": True, "hasData": False, "note": "No glucose entries in the last 24 hours."}
    status = nightscout.compute_status(metrics)
    return {
        "configured": True,
        "hasData": True,
        "trafficLight": status.status,  # "GREEN" | "YELLOW" | "RED"
        "reason": status.reason,
        "windowStart": _iso_utc(from_millis),
        "windowEnd": _iso_utc(now),
        **_metrics_dict(metrics, units),
    }


async def _tool_patient_clinical_profile(_arguments: dict[str, Any]) -> dict[str, Any]:
    patient = _resolve_primary_patient()
    if patient is None:
        return {"configured": False, "note": "No user account exists yet."}
    settings = db.load_settings()
    target_low = target_high = None
    target_note = "Default range (no active Nightscout treatment profile found)."
    if _nightscout_configured(settings):
        try:
            profile = await nightscout.fetch_active_profile(*_nightscout_creds(settings))
        except Exception:  # noqa: BLE001 -- target range falls back to the default, not a hard error
            profile = None
        if profile is not None:
            if profile.target_low_segments:
                target_low = profile.target_low_segments[0].value
            if profile.target_high_segments:
                target_high = profile.target_high_segments[0].value
            target_note = (
                f"From active Nightscout profile '{profile.name}' (first time segment -- "
                "targets may vary over the day, see get_data_gap_report/Nightscout directly for the full schedule)."
            )
    return {
        "configured": True,
        "firstName": patient.get("displayName") or patient.get("username"),
        "lastName": patient.get("lastName") or "",
        "birthDate": patient.get("birthDate") or "",
        "diabetesSince": patient.get("diabetesSince") or "",
        "glucoseUnit": patient.get("glucoseUnit", "MG_DL"),
        "insulinPump": patient.get("insulinPump", "NONE"),
        "cgmSystem": patient.get("cgmSystem", "NONE"),
        "targetRangeMgDl": {"low": target_low if target_low is not None else 70, "high": target_high if target_high is not None else 180},
        "targetRangeNote": target_note,
    }


async def _tool_combined_health_summary(arguments: dict[str, Any]) -> dict[str, Any]:
    days = int(arguments.get("days") or 7)
    settings = db.load_settings()
    result: dict[str, Any] = {"windowDays": days}
    if _nightscout_configured(settings):
        from_millis, to_millis = _days_window(days)
        entries = await nightscout.fetch_entries(*_nightscout_creds(settings), from_millis, to_millis)
        metrics = nightscout.compute_metrics(entries)
        result["glucose"] = {"configured": True, **_metrics_dict(metrics, "mgdl")} if metrics else {
            "configured": True, "note": "No glucose entries in this window.",
        }
    else:
        result["glucose"] = {"configured": False}
    if _withings_configured(settings):
        try:
            trend_result = await _withings_retry(settings, withings.fetch_weight_and_fat_trend)
        except Exception as exc:  # noqa: BLE001
            result["bodyMetrics"] = {"configured": True, "error": str(exc)}
        else:
            latest = trend_result.readings[-1] if trend_result.readings else None
            result["bodyMetrics"] = {
                "configured": True,
                "windowNote": "Withings weight/body-fat always covers the last 3 months, independent of the `days` parameter above.",
                "latestWeightKg": latest.weight_kg if latest else None,
                "latestBodyFatPercent": latest.fat_ratio_percent if latest else None,
                "latestMeasuredAt": _iso_utc(latest.date_millis) if latest else None,
                "weightTrend": _trend_dict(trend_result.weight_trend),
                "bodyFatTrend": _trend_dict(trend_result.fat_trend),
            }
    else:
        result["bodyMetrics"] = {"configured": False}
    return result


async def _tool_data_gap_report(arguments: dict[str, Any]) -> dict[str, Any]:
    start, end = arguments.get("start"), arguments.get("end")
    if not start or not end:
        raise ValueError("Both 'start' and 'end' are required.")
    from_millis, to_millis = _parse_iso_millis(start), _parse_iso_millis(end)
    settings = db.load_settings()
    if not _nightscout_configured(settings):
        return {"configured": False, "note": "Nightscout is not configured (Settings -> Data sources -> Nightscout)."}
    entries = await nightscout.fetch_entries(*_nightscout_creds(settings), from_millis, to_millis)
    gaps = nightscout.detect_gaps(entries, from_millis, to_millis)
    return {
        "configured": True,
        "windowStart": _iso_utc(from_millis),
        "windowEnd": _iso_utc(to_millis),
        "gapThresholdMinutes": 60,
        "gaps": [
            {
                "start": _iso_utc(g.start_millis),
                "end": _iso_utc(g.end_millis),
                "durationMinutes": round((g.end_millis - g.start_millis) / 60_000),
            }
            for g in gaps
        ],
    }


async def _tool_sleep_analysis(arguments: dict[str, Any]) -> dict[str, Any]:
    days = int(arguments.get("days") or 7)
    settings = db.load_settings()
    if not _withings_configured(settings):
        return {"configured": False, "note": "Withings is not connected (Settings -> Data sources -> Withings API)."}
    from_millis, to_millis = _days_window(days)
    nights = await _withings_retry(settings, lambda token: withings.fetch_sleep_summary(token, from_millis, to_millis))
    return {
        "configured": True,
        "windowDays": days,
        "nights": [
            {
                "date": _local_date_str(n.date_millis),
                "totalSleepMinutes": n.total_sleep_minutes,
                "lightSleepMinutes": n.light_sleep_minutes,
                "deepSleepMinutes": n.deep_sleep_minutes,
                "remSleepMinutes": n.rem_sleep_minutes,
                "wakeupCount": n.wakeup_count,
                "wakeupDurationMinutes": n.wakeup_duration_minutes,
                "sleepScore": n.sleep_score,
                "hrAverageBpm": n.hr_average_bpm,
            }
            for n in nights
        ],
    }


async def _tool_workout_activity_log(arguments: dict[str, Any]) -> dict[str, Any]:
    days = int(arguments.get("days") or 7)
    settings = db.load_settings()
    if not _withings_configured(settings):
        return {"configured": False, "note": "Withings is not connected (Settings -> Data sources -> Withings API)."}
    from_millis, to_millis = _days_window(days)
    workouts = await _withings_retry(settings, lambda token: withings.fetch_workouts(token, from_millis, to_millis))
    return {
        "configured": True,
        "windowDays": days,
        "workouts": [
            {
                "start": _iso_utc(w.start_millis),
                "end": _iso_utc(w.end_millis),
                "durationMinutes": round((w.end_millis - w.start_millis) / 60_000),
                "category": w.category_label,
                "caloriesKcal": w.calories_kcal,
                "distanceMeters": w.distance_meters,
                "steps": w.steps,
                "hrAverageBpm": w.hr_average_bpm,
            }
            for w in workouts
        ],
    }


async def _tool_cardio_metrics(arguments: dict[str, Any]) -> dict[str, Any]:
    days = int(arguments.get("days") or 7)
    settings = db.load_settings()
    from_millis, to_millis = _days_window(days)
    result: dict[str, Any] = {
        "windowDays": days,
        "activityHeartRate": [],
        "restingHeartRate": [],
        "hrv": [],
        "ecg": None,
        "note": "ECG / heart-rhythm recordings are not available via this integration "
                "(Withings' /v2/heart endpoint is out of scope).",
    }
    if _withings_configured(settings):
        try:
            days_activity = await _withings_retry(settings, lambda token: withings.fetch_activity(token, from_millis, to_millis))
            result["activityHeartRate"] = [
                {"date": _local_date_str(a.date_millis), "averageBpm": a.hr_average_bpm, "minBpm": a.hr_min_bpm, "maxBpm": a.hr_max_bpm}
                for a in days_activity if a.hr_average_bpm is not None
            ]
        except Exception as exc:  # noqa: BLE001
            result["withingsError"] = str(exc)
    if settings.get("googleHealthEnabled", True) and (settings.get("googleHealthAccessToken") or settings.get("googleHealthRefreshToken")):
        try:
            access_token = await google_health.get_valid_access_token(settings, _save_google_health_tokens)
            resting = await google_health.fetch_resting_heart_rate(access_token, from_millis, to_millis)
            hrv = await google_health.fetch_daily_hrv(access_token, from_millis, to_millis)
            result["restingHeartRate"] = [{"date": _utc_date_str(r.date_millis), "bpm": r.bpm} for r in resting]
            result["hrv"] = [{"date": _utc_date_str(h.date_millis), "averageHrvMs": h.average_hrv_milliseconds} for h in hrv]
        except Exception as exc:  # noqa: BLE001
            result["googleHealthError"] = str(exc)
    return result


# ---------------------------------------------------------------------------
# Tool registry (name, description, inputSchema per MCP's tools/list shape) + dispatch
# ---------------------------------------------------------------------------

_WINDOW_START_END = {
    "start": {"type": "string", "description": "Start of the time range, ISO 8601 (e.g. 2026-07-28T00:00:00Z)."},
    "end": {"type": "string", "description": "End of the time range, ISO 8601 (e.g. 2026-07-29T00:00:00Z)."},
}

TOOLS: list[dict[str, Any]] = [
    {
        "name": "get_raw_glucose_entries",
        "description": "Raw, unaggregated CGM glucose entries (timestamp, glucose value, trend direction, computed "
                        "velocity) directly from the configured Nightscout instance for a time range. No "
                        "interpretation, filtering, or aggregation is applied.",
        "inputSchema": {
            "type": "object",
            "properties": {
                **_WINDOW_START_END,
                "limit": {"type": "integer", "description": "Maximum number of entries to return, most recent first. Default 288 (~24h at 5-minute intervals)."},
            },
            "required": ["start", "end"],
        },
    },
    {
        "name": "get_raw_device_events",
        "description": "Raw, unaggregated treatment/device events directly from Nightscout for a time range: bolus "
                        "doses, carbohydrates, temp basals, and sensor/cannula (site) changes. No interpretation "
                        "or aggregation is applied.",
        "inputSchema": {
            "type": "object",
            "properties": {
                **_WINDOW_START_END,
                "limit": {"type": "integer", "description": "Maximum number of events to return, most recent first. Default 100."},
            },
            "required": ["start", "end"],
        },
    },
    {
        "name": "get_24h_traffic_light_status",
        "description": "Traffic-light status (GREEN/YELLOW/RED) plus core metrics (Time in Range %, %CV, average "
                        "glucose) for the last 24 hours, computed from the direct Nightscout REST API.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "units": {"type": "string", "enum": ["mgdl", "mmol"], "description": "Glucose unit for the returned values. Default 'mgdl'."},
            },
        },
    },
    {
        "name": "get_patient_clinical_profile",
        "description": "Clinical master data of the primary patient: name, date of birth, diabetes duration, "
                        "devices (insulin pump, CGM system), glucose unit, and target range.",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "get_combined_health_summary",
        "description": "Bundles glucose metrics over a given window with the latest Withings body metrics (weight, "
                        "body-fat percentage, 3-month trend).",
        "inputSchema": {
            "type": "object",
            "properties": {"days": {"type": "integer", "description": "Number of days back to compute glucose metrics over. Default 7."}},
        },
    },
    {
        "name": "get_data_gap_report",
        "description": "Reports gaps in CGM data coverage (strictly longer than 1 hour) within the given time range, "
                        "from the direct Nightscout REST API.",
        "inputSchema": {"type": "object", "properties": {**_WINDOW_START_END}, "required": ["start", "end"]},
    },
    {
        "name": "get_sleep_analysis",
        "description": "Sleep duration, phases (light/deep/REM), and quality per night over a given window, from a "
                        "connected Withings smartwatch/tracker.",
        "inputSchema": {
            "type": "object",
            "properties": {"days": {"type": "integer", "description": "Number of days back to look. Default 7."}},
        },
    },
    {
        "name": "get_workout_activity_log",
        "description": "Individual workouts, calories, and activity times over a given window, from a connected "
                        "Withings smartwatch/tracker.",
        "inputSchema": {
            "type": "object",
            "properties": {"days": {"type": "integer", "description": "Number of days back to look. Default 7."}},
        },
    },
    {
        "name": "get_cardio_metrics",
        "description": "Resting heart rate, heart rate variability (HRV), and activity heart rate over a given "
                        "window, from connected Withings/Google Health integrations. No ECG/heart-rhythm data.",
        "inputSchema": {
            "type": "object",
            "properties": {"days": {"type": "integer", "description": "Number of days back to look. Default 7."}},
        },
    },
]

_HANDLERS: dict[str, Callable[[dict[str, Any]], Awaitable[dict[str, Any]]]] = {
    "get_raw_glucose_entries": _tool_raw_glucose_entries,
    "get_raw_device_events": _tool_raw_device_events,
    "get_24h_traffic_light_status": _tool_traffic_light_status,
    "get_patient_clinical_profile": _tool_patient_clinical_profile,
    "get_combined_health_summary": _tool_combined_health_summary,
    "get_data_gap_report": _tool_data_gap_report,
    "get_sleep_analysis": _tool_sleep_analysis,
    "get_workout_activity_log": _tool_workout_activity_log,
    "get_cardio_metrics": _tool_cardio_metrics,
}


async def call_tool(name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    handler = _HANDLERS.get(name)
    if handler is None:
        raise ValueError(f"Unknown tool: {name}")
    return await handler(arguments or {})


# ---------------------------------------------------------------------------
# JSON-RPC 2.0 message dispatch (MCP Streamable HTTP transport, see main.py's /api/mcp routes)
# ---------------------------------------------------------------------------

def _result(msg_id: Any, result: dict[str, Any]) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": msg_id, "result": result}


def _error(msg_id: Any, code: int, message: str) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": msg_id, "error": {"code": code, "message": message}}


async def handle_message(message: dict[str, Any]) -> dict[str, Any] | None:
    """Handles one JSON-RPC 2.0 request or notification. Returns None for a notification (no `id`
    key at all, e.g. `notifications/initialized`) since none is expected in response -- a response
    dict otherwise."""
    if not isinstance(message, dict):
        return _error(None, -32600, "Invalid Request")
    method = message.get("method")
    msg_id = message.get("id")
    is_notification = "id" not in message

    if method == "initialize":
        return _result(msg_id, {
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": {"tools": {}},
            "serverInfo": {"name": SERVER_NAME, "version": SERVER_VERSION},
        })
    if method == "ping":
        return None if is_notification else _result(msg_id, {})
    if method in ("notifications/initialized", "notifications/cancelled"):
        return None
    if method == "tools/list":
        return _result(msg_id, {"tools": TOOLS})
    if method == "tools/call":
        params = message.get("params") or {}
        name = params.get("name")
        arguments = params.get("arguments") or {}
        try:
            tool_result = await call_tool(name, arguments)
            text = json.dumps(tool_result, ensure_ascii=False, indent=2)
            return _result(msg_id, {"content": [{"type": "text", "text": text}], "isError": False})
        except Exception as exc:  # noqa: BLE001 -- surfaced to the MCP client as a tool-level error, not a transport failure
            return _result(msg_id, {"content": [{"type": "text", "text": f"Error: {exc}"}], "isError": True})
    if is_notification:
        return None
    return _error(msg_id, -32601, f"Method not found: {method}")
