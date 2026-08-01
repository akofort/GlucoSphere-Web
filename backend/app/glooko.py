"""Glooko direct client -- native port of rilhia/omni-endo-ai-mcp's auth/data-fetching AND
analytics logic (https://github.com/rilhia/omni-endo-ai-mcp, src/glooko.js + src/analytics.js +
src/range.js), ported to httpx/async rather than vendored verbatim, same reverse-engineering
discipline as the other native integrations in this project (fetch the real, maintained client
source, port the logic natively, verify live).

Glooko aggregates data from many insulin pump brands -- this client is deliberately vendor-
agnostic: it never names a specific pump brand anywhere (code, tool description, or the data it
hands to the chat model), only generic terms ("Insulinpumpe" / "Pumpe" / "CGM" / "Kathetereinheit"
-- the reference implementation's own tool descriptions say "Omnipod 5" throughout; this port
deliberately does not).

Deviations from the reference, deliberate and scoped for this app:
  - No persistent local archive/cold-start-backfill/sync-lock machinery -- this is a stateless
    per-request FastAPI backend, not a long-running MCP server process. Every call fetches the
    requested window fresh from Glooko (bounded by the same day-caps the reference uses).
  - Single canonical unit: mg/dL throughout (matches this app's own established convention --
    "mg/dL is always what the backend computes/returns" -- see nightscout.py/dexcom_share.py/
    librelinkup.py). The reference stores mmol/L internally and exposes a per-call unit override;
    that's dropped here since no other tool in this app has one either. Glooko's own account-
    configured source unit (US accounts are typically mg/dL, others mmol/L, and the API gives no
    reliable signal) is auto-detected per fetch from the CGM value range (mmol/L glucose readings
    are always <= ~33, mg/dL readings are always >= ~40 -- no real-world overlap) rather than
    requiring a manually configured setting.
  - Time parameters are fromEpochMillis/toEpochMillis (matching every other tool in this app,
    e.g. Nightscout/Dexcom/LibreLinkUp/Google Health) rather than the reference's raw ISO 8601
    start/end strings.

Auth flow (confirmed against the reference implementation's real, working login flow):
1. GET /users/sign_in?id=login_form with redirect handling disabled, to read the region-specific
   login host from the Location header.
2. GET that regional login page, scrape the Rails CSRF token out of the HTML
   (`name="csrf-token" content="..."`).
3. POST email/password + CSRF token to the same URL. The resulting dashboard HTML embeds both the
   patient id (`window.patient = "..."`) and the API base URL (`apiUrl: '...'`).

Data fetch: GET {apiBase}/api/v3/graph/data?patient=...&startDate=<ISO>&endDate=<ISO>&series[]=...
for CGM/bolus/basal-state/device-event series (response.series.*), and GET
{apiBase}/api/v3/devices_and_settings?patient=... for pump settings history
(response.deviceSettings.pumps.{guid}.{timestamp} -- confirmed field paths from the reference).
"""
from __future__ import annotations

import asyncio
import math
import re
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

_BASE_DOMAIN = "https://my.glooko.com"
_TIMEOUT = httpx.Timeout(20.0, connect=10.0)
_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0"
_MGDL_PER_MMOL = 18.0182
# Everything the 11 tools below need, requested in one call per raw fetch (same series list
# regardless of which tool triggered it -- one fetch serves all of them, see _get_raw_cached).
_SERIES = [
    "cgmHigh", "cgmNormal", "cgmLow",
    "deliveredBolus", "totalInsulinPerDay",
    "basalBarAutomated", "basalBarAutomatedSuspend", "basalBarAutomatedMax", "pumpOp5LimitedMode",
    "setSiteChange", "cgmSensorChange",
]
# Same day-span caps as the reference (per tool, see CAPS in range.js) -- generous for aggregating
# tools (fixed-size output regardless of span), tighter for tools that return raw points.
_CAP_SUMMARY_DAYS = 400
_CAP_TIMELINE_DAYS = 21
_CAP_BOLUS_DAYS = 92


class GlookoError(RuntimeError):
    pass


def _iso(millis: int) -> str:
    return datetime.fromtimestamp(millis / 1000, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def _epoch_to_iso(epoch_seconds: float) -> str:
    return datetime.fromtimestamp(epoch_seconds, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _assert_cap(from_millis: int, to_millis: int, max_days: int, tool_name: str) -> None:
    if to_millis <= from_millis:
        raise GlookoError(f"{tool_name}: toEpochMillis muss nach fromEpochMillis liegen.")
    span_days = (to_millis - from_millis) / 86400000
    if span_days > max_days:
        raise GlookoError(f"{tool_name}: Zeitraum zu groß ({span_days:.0f} Tage, Maximum {max_days}).")


def _num_or_none(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------------------
# Auth (unchanged from the original single-tool implementation)
# ---------------------------------------------------------------------------

async def _login(email: str, password: str) -> tuple[httpx.AsyncClient, str, str]:
    """Returns (client, patient_id, api_base). Caller owns closing the client."""
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

        return client, patient_match.group(1), api_base
    except httpx.HTTPError as exc:
        await client.aclose()
        raise GlookoError(f"Anmeldung fehlgeschlagen: {exc}") from exc
    except GlookoError:
        await client.aclose()
        raise


async def _fetch_raw(email: str, password: str, from_millis: int, to_millis: int) -> dict[str, Any]:
    """One graph/data call + one devices_and_settings call for the window. Returns
    {"data": <graph/data JSON>, "settings": <devices_and_settings JSON>}."""
    client, patient_id, api_base = await _login(email, password)
    try:
        params = [
            ("patient", patient_id), ("startDate", _iso(from_millis)), ("endDate", _iso(to_millis)),
            ("locale", "en-GB"), ("insulinTooltips", "true"), ("filterBgReadings", "true"),
            ("splitByDay", "false"),
        ] + [("series[]", s) for s in _SERIES]
        headers = {"Accept": "application/json", "X-Requested-With": "XMLHttpRequest"}
        # Reuse the authenticated client (cookies) for both calls, concurrently.
        data_task = client.get(f"{api_base}/api/v3/graph/data", params=params, headers=headers)
        settings_task = client.get(f"{api_base}/api/v3/devices_and_settings", params={"patient": patient_id}, headers=headers)
        data_resp, settings_resp = await asyncio.gather(data_task, settings_task)
        for resp, label in ((data_resp, "graph/data"), (settings_resp, "devices_and_settings")):
            if resp.status_code == 401:
                raise GlookoError("Sitzung abgelaufen -- bitte erneut testen.")
            if resp.status_code >= 400:
                raise GlookoError(f"Glooko-API-Fehler ({label}): HTTP {resp.status_code}: {resp.text[:300]}")
        return {"data": data_resp.json(), "settings": settings_resp.json()}
    except httpx.HTTPError as exc:
        raise GlookoError(f"Glooko-Datenabruf fehlgeschlagen: {exc}") from exc
    finally:
        await client.aclose()


# Short-TTL in-memory coalescing cache: when the model calls several Glooko tools for the same
# (or an overlapping) window in one turn, main.py's tool-execution loop runs them concurrently
# (see send_message's asyncio.gather) -- this cache means those concurrent calls share ONE actual
# login + fetch instead of each doing its own, and a follow-up call moments later reuses the same
# fetch instead of re-authenticating. Keyed on the exact window, not just email, since different
# tools in the same turn often ask for different ranges (e.g. a 90-day summary alongside a 3-day
# bolus log).
_RAW_CACHE_TTL_SECONDS = 45
_raw_cache: dict[tuple[str, int, int], tuple[float, Any]] = {}


async def _get_raw_cached(email: str, password: str, from_millis: int, to_millis: int) -> dict[str, Any]:
    key = (email, from_millis, to_millis)
    now = time.monotonic()
    cached = _raw_cache.get(key)
    if cached is not None and now - cached[0] < _RAW_CACHE_TTL_SECONDS:
        return await cached[1]
    task = asyncio.ensure_future(_fetch_raw(email, password, from_millis, to_millis))
    _raw_cache[key] = (now, task)
    try:
        return await task
    except Exception:
        _raw_cache.pop(key, None)
        raise


# ---------------------------------------------------------------------------
# Unit detection & conversion -- see module docstring for the range-based heuristic.
# ---------------------------------------------------------------------------

def _detect_source_unit(raw_data: dict[str, Any]) -> str:
    series = (raw_data.get("series") or {}) if isinstance(raw_data, dict) else {}
    for key in ("cgmNormal", "cgmHigh", "cgmLow"):
        for p in (series.get(key) or [])[:5]:
            y = p.get("y")
            if isinstance(y, (int, float)):
                return "mgdl" if y > 40 else "mmol"
    return "mgdl"  # no CGM data to detect from -- default matches this app's own MG_DL convention


def _convert(value: Any, source_unit: str) -> float | None:
    """mg/dL <-> mmol/L is a pure ratio (no offset), so this is correct for both absolute glucose
    values and deltas (e.g. ISF, std dev) alike -- unlike the reference's toDisplay/toDisplayDelta
    split, which only exists there to choose rounding precision for a runtime-switchable unit."""
    v = _num_or_none(value)
    if v is None:
        return None
    return round(v * _MGDL_PER_MMOL) if source_unit == "mmol" else round(v, 1)


# ---------------------------------------------------------------------------
# Timeline construction (CGM + bolus, unified and sorted) -- port of processUnifiedGlookoData
# ---------------------------------------------------------------------------

def _build_timeline(raw_data: dict[str, Any], source_unit: str) -> list[dict[str, Any]]:
    series = (raw_data.get("series") or {}) if isinstance(raw_data, dict) else {}
    all_cgm: list[dict] = []
    for key in ("cgmHigh", "cgmNormal", "cgmLow"):
        all_cgm.extend(series.get(key) or [])
    all_cgm.sort(key=lambda p: p.get("x", 0))

    clean_cgm: list[dict[str, Any]] = []
    seen_buckets: set[int] = set()
    for p in all_cgm:
        x = p.get("x")
        if not isinstance(x, (int, float)):
            continue
        bucket = int(x // 300) * 300
        if bucket in seen_buckets:
            continue
        seen_buckets.add(bucket)
        val = _convert(p.get("y"), source_unit)
        if val is None:
            continue
        vel = round(val - clean_cgm[-1]["val"], 1) if clean_cgm else 0.0
        clean_cgm.append({"epoch": x, "type": "CGM", "val": val, "vel": vel, "time": _epoch_to_iso(x)})

    boluses: list[dict[str, Any]] = []
    for b in series.get("deliveredBolus") or []:
        x = b.get("x")
        if not isinstance(x, (int, float)):
            continue
        is_manual = bool(b.get("isManual"))
        carbs_input = b.get("carbsInput") or 0
        rec_correction = b.get("insulinRecommendationForCorrection") or 0
        if not is_manual and carbs_input > 0 and rec_correction == 0:
            cls = "Meal Bolus"
        elif is_manual and carbs_input == 0:
            cls = "Manual Correction Bolus"
        elif not is_manual and carbs_input == 0 and rec_correction > 0:
            cls = "System Correction Bolus"
        elif not is_manual and carbs_input > 0 and rec_correction > 0:
            cls = "Meal With Correction Bolus"
        else:
            cls = "Unknown"
        override = "above" if b.get("isOverrideAbove") else ("below" if b.get("isOverrideBelow") else None)
        delivered = _num_or_none(b.get("insulinDelivered"))
        programmed = _num_or_none(b.get("insulinProgrammed"))
        interrupted = bool(b.get("isInterrupted")) or (
            delivered is not None and programmed is not None and delivered < programmed - 1e-9
        )
        units = delivered if delivered is not None else _num_or_none(b.get("y"))
        boluses.append({
            "epoch": x, "type": "BOLUS", "units": units, "delivered": delivered, "programmed": programmed,
            "recTotal": _num_or_none(b.get("totalInsulinRecommendation")),
            "recCorrection": _num_or_none(b.get("insulinRecommendationForCorrection")),
            "recCarbs": _num_or_none(b.get("insulinRecommendationForCarbs")),
            "carbs": _num_or_none(b.get("carbsInput")),
            "iob": _num_or_none(b.get("insulinOnBoard")),
            "bgInput": _convert(b.get("bloodGlucoseInput"), source_unit),
            "bgSource": b.get("bloodGlucoseInputSource"),
            "isManual": is_manual, "interrupted": interrupted, "override": override, "class": cls,
            "time": _epoch_to_iso(x),
        })

    timeline = clean_cgm + boluses
    timeline.sort(key=lambda i: i["epoch"])
    return timeline


def _extract_daily_insulin(raw_data: dict[str, Any]) -> list[dict[str, Any]]:
    series = (raw_data.get("series") or {}) if isinstance(raw_data, dict) else {}
    out = []
    for key, rec in (series.get("dailyInsulinTotals") or {}).items():
        try:
            day_epoch = int(key)
        except (TypeError, ValueError):
            continue
        out.append({
            "dayUtc": datetime.fromtimestamp(day_epoch, tz=timezone.utc).strftime("%Y-%m-%d"),
            "dayEpoch": day_epoch,
            "basalUnits": _num_or_none(rec.get("basalUnitsPerDay")),
            "bolusUnits": _num_or_none(rec.get("bolusUnitsPerDay")),
            "totalUnits": _num_or_none(rec.get("totalInsulinPerDay")),
        })
    out.sort(key=lambda d: d["dayEpoch"])
    return out


def _extract_device_events(raw_data: dict[str, Any]) -> dict[str, list[dict]]:
    series = (raw_data.get("series") or {}) if isinstance(raw_data, dict) else {}

    def dedupe(arr: list[dict] | None) -> list[dict]:
        seen: set[int] = set()
        out = []
        for e in arr or []:
            epoch = e.get("x")
            if not isinstance(epoch, (int, float)):
                ts = e.get("timestamp")
                if not ts:
                    continue
                try:
                    epoch = datetime.fromisoformat(str(ts).replace("Z", "+00:00")).timestamp()
                except ValueError:
                    continue
            epoch = int(epoch)
            if epoch in seen:
                continue
            seen.add(epoch)
            out.append({"epoch": epoch, "time": _epoch_to_iso(epoch)})
        out.sort(key=lambda x: x["epoch"])
        return out

    return {"podChanges": dedupe(series.get("setSiteChange")), "sensorChanges": dedupe(series.get("cgmSensorChange"))}


def _derive_basal_states(raw_data: dict[str, Any], window_start_epoch: int, window_end_epoch: int) -> list[dict[str, Any]]:
    """Port of deriveBasalStates -- pairs bar-series rising/falling edges into [start,end)
    intervals (NOT positional pairing, see the reference's comment on why), classifies every
    sub-interval by state precedence (limited > max > suspend > normal), then merges consecutive
    same-state segments."""
    series = (raw_data.get("series") or {}) if isinstance(raw_data, dict) else {}

    def bar_intervals(arr: list[dict] | None) -> list[tuple[float, float]]:
        out: list[tuple[float, float]] = []
        open_start: float | None = None
        prev_y = 0
        for p in arr or []:
            x = p.get("x")
            if not isinstance(x, (int, float)):
                continue
            y = 1 if p.get("y") == 1 else 0
            if y == 1 and prev_y != 1:
                if open_start is None:
                    open_start = x
            elif y != 1 and prev_y == 1:
                if open_start is not None and x > open_start:
                    out.append((open_start, x))
                open_start = None
            prev_y = y
        return out

    def mode_intervals(arr: list[dict] | None) -> list[tuple[float, float]]:
        seen: set[tuple[float, float]] = set()
        out: list[tuple[float, float]] = []
        for p in arr or []:
            ts, ets = p.get("timestamp"), p.get("endTimestamp")
            if not ts or not ets:
                continue
            try:
                s = datetime.fromisoformat(str(ts).replace("Z", "+00:00")).timestamp()
                e = datetime.fromisoformat(str(ets).replace("Z", "+00:00")).timestamp()
            except ValueError:
                continue
            key = (s, e)
            if e > s and key not in seen:
                seen.add(key)
                out.append((s, e))
        return out

    suspend = bar_intervals(series.get("basalBarAutomatedSuspend"))
    maxi = bar_intervals(series.get("basalBarAutomatedMax"))
    normal = bar_intervals(series.get("basalBarAutomated"))
    limited = mode_intervals(series.get("pumpOp5LimitedMode"))

    all_iv = suspend + maxi + normal + limited
    if not all_iv:
        return []
    lo = window_start_epoch if window_start_epoch is not None else min(i[0] for i in all_iv)
    hi = window_end_epoch if window_end_epoch is not None else max(i[1] for i in all_iv)

    def in_any(t: float, ivs: list[tuple[float, float]]) -> bool:
        return any(s <= t < e for s, e in ivs)

    bounds = {lo, hi}
    for s, e in all_iv:
        if lo <= s <= hi:
            bounds.add(s)
        if lo <= e <= hi:
            bounds.add(e)
    pts = sorted(bounds)

    segs = []
    for a, b in zip(pts, pts[1:]):
        if b <= a:
            continue
        mid = a + (b - a) / 2
        if in_any(mid, limited):
            state = "limited"
        elif in_any(mid, maxi):
            state = "max"
        elif in_any(mid, suspend):
            state = "suspend"
        else:
            state = "normal"
        segs.append((a, b, state))

    merged: list[dict[str, Any]] = []
    for a, b, st in segs:
        if merged and merged[-1]["state"] == st and merged[-1]["endEpoch"] == a:
            merged[-1]["endEpoch"] = b
        else:
            merged.append({"startEpoch": a, "endEpoch": b, "state": st})

    return [
        {
            "state": m["state"], "start": _epoch_to_iso(m["startEpoch"]), "end": _epoch_to_iso(m["endEpoch"]),
            "startEpoch": m["startEpoch"], "endEpoch": m["endEpoch"],
            "minutes": round((m["endEpoch"] - m["startEpoch"]) / 60),
        }
        for m in merged
    ]


def _summarise_basal_states(intervals: list[dict[str, Any]]) -> dict[str, Any]:
    if not intervals:
        return {"available": False, "note": "Keine Basalraten-Verhaltensdaten für diesen Zeitraum."}
    total_secs = sum(i["endEpoch"] - i["startEpoch"] for i in intervals)
    by_state = {"normal": 0.0, "suspend": 0.0, "max": 0.0, "limited": 0.0}
    counts = {"normal": 0, "suspend": 0, "max": 0, "limited": 0}
    for i in intervals:
        by_state[i["state"]] = by_state.get(i["state"], 0) + (i["endEpoch"] - i["startEpoch"])
        counts[i["state"]] = counts.get(i["state"], 0) + 1

    def pct(s: float) -> float:
        return round(s / total_secs * 100, 1) if total_secs else 0.0

    def mins(s: float) -> int:
        return round(s / 60)

    return {
        "available": True,
        "spanHours": round(total_secs / 3600, 2),
        "normal": {"minutes": mins(by_state["normal"]), "percent": pct(by_state["normal"]), "episodes": counts["normal"]},
        "suspend": {"minutes": mins(by_state["suspend"]), "percent": pct(by_state["suspend"]), "episodes": counts["suspend"]},
        "max": {"minutes": mins(by_state["max"]), "percent": pct(by_state["max"]), "episodes": counts["max"]},
        "limited": {"minutes": mins(by_state["limited"]), "percent": pct(by_state["limited"]), "episodes": counts["limited"]},
        "interpretation": {
            "suspend": "Algorithmus hat die Basalrate pausiert, typischerweise zur Vorbeugung eines vorhergesagten Tiefwerts. Ein Zustand, keine Einheiten-Menge.",
            "max": "Algorithmus liefert an der Obergrenze, typischerweise gegen einen Anstieg. Ein Zustand, keine Einheiten-Menge.",
            "limited": "System hat das CGM-Signal verloren (>20 Min) und lief mit einer festen Basalrate. Der Algorithmus hat NICHT angepasst -- Glukose-Ausreißer in dieser Zeit sind nicht auf Algorithmus-Entscheidungen zurückzuführen.",
            "normal": "Normale automatisierte Abgabe.",
        },
    }


# ---------------------------------------------------------------------------
# Settings history -- port of getActiveSettings
# ---------------------------------------------------------------------------

def _normalize_settings_data(data: dict, source_unit: str) -> dict:
    if source_unit != "mmol" or not isinstance(data, dict):
        return data
    profiles = data.get("profilesBolus")
    if not isinstance(profiles, list):
        return data
    new_profiles = []
    for p in profiles:
        p = dict(p)
        for seg_key in ("targetBgSegments", "isfSegments"):
            seg = p.get(seg_key)
            if isinstance(seg, dict) and isinstance(seg.get("data"), list):
                p[seg_key] = {**seg, "data": [{**sn, "value": _convert(sn.get("value"), source_unit)} for sn in seg["data"]]}
        new_profiles.append(p)
    return {**data, "profilesBolus": new_profiles}


def _extract_settings_history(raw_settings: dict[str, Any], from_millis: int, to_millis: int, source_unit: str) -> list[dict[str, Any]]:
    pumps = ((raw_settings.get("deviceSettings") or {}).get("pumps") or {}) if isinstance(raw_settings, dict) else {}
    flat = []
    for _guid, ts_map in pumps.items():
        if not isinstance(ts_map, dict):
            continue
        for ts, data in ts_map.items():
            try:
                epoch_ms = int(datetime.fromisoformat(str(ts).replace("Z", "+00:00")).timestamp() * 1000)
            except ValueError:
                continue
            flat.append({"timestamp": ts, "epochMs": epoch_ms, "data": data})
    flat.sort(key=lambda s: s["epochMs"])
    if not flat:
        return []

    baseline_idx = 0
    for i, s in enumerate(flat):
        if s["epochMs"] <= from_millis:
            baseline_idx = i

    result = []
    for s in flat[baseline_idx:]:
        if s["epochMs"] > to_millis:
            break
        result.append({"activeTimestamp": s["timestamp"], "settings": _normalize_settings_data(s["data"], source_unit)})
    return result


def _find_active_data_record(data: list[dict], epoch: float) -> Any:
    if not data:
        return None
    h = datetime.fromtimestamp(epoch, tz=timezone.utc).hour
    sorted_data = sorted(data, key=lambda s: s.get("segmentStart", 0))
    active = None
    for s in sorted_data:
        if s.get("segmentStart", 0) <= h:
            active = s
    return (active or sorted_data[-1]).get("value")


def _format_hour(h: Any) -> str:
    try:
        h = float(h)
    except (TypeError, ValueError):
        return str(h)
    return f"{int(h)}:{'30' if h % 1 == 0.5 else '00'}"


def _target_for_epoch(epoch: float, settings_history: list[dict]) -> float | None:
    if not settings_history:
        return None
    active = None
    for s in settings_history:
        try:
            s_epoch = datetime.fromisoformat(s["activeTimestamp"].replace("Z", "+00:00")).timestamp()
        except (KeyError, ValueError):
            continue
        if s_epoch <= epoch:
            active = s
    if active is None:
        return None
    try:
        segs = active["settings"]["profilesBolus"][0]["targetBgSegments"]["data"]
    except (KeyError, IndexError, TypeError):
        return None
    return _find_active_data_record(segs, epoch) if segs else None


def _shape_settings(settings_history: list[dict]) -> list[dict[str, Any]]:
    out = []
    for s in settings_history:
        try:
            gen = s["settings"]["generalSettings"]
            basal = s["settings"].get("basalSettings", {})
            profile = s["settings"]["profilesBolus"][0]
        except (KeyError, IndexError, TypeError):
            continue
        out.append({
            "effective": s["activeTimestamp"],
            "DIA_hours": gen.get("activeInsulinTime"),
            "maxBasalRate": basal.get("maxBasalRate"),
            "targetBg": [{"from": _format_hour(sn.get("segmentStart")), "value": sn.get("value")}
                         for sn in (profile.get("targetBgSegments") or {}).get("data") or []],
            "isf": [{"from": _format_hour(sn.get("segmentStart")), "value": sn.get("value")}
                    for sn in (profile.get("isfSegments") or {}).get("data") or []],
            "carbRatio": [{"from": _format_hour(sn.get("segmentStart")), "value": sn.get("value")}
                          for sn in (profile.get("insulinToCarbRatioSegments") or {}).get("data") or []],
        })
    return out


# ---------------------------------------------------------------------------
# Core metrics -- ports of calculateTIRMetrics / rankingMetrics / compareRanking
# ---------------------------------------------------------------------------

def _calculate_tir_metrics(bg_values: list[float], low: float, high: float) -> dict[str, float]:
    if not bg_values:
        return {"tir": 0.0, "low": 0.0, "high": 0.0}
    n = len(bg_values)
    in_range = sum(1 for v in bg_values if low <= v <= high)
    low_count = sum(1 for v in bg_values if v < low)
    high_count = sum(1 for v in bg_values if v > high)
    return {"tir": in_range / n * 100, "low": low_count / n * 100, "high": high_count / n * 100}


def _median(values: list[float]) -> float | None:
    if not values:
        return None
    s = sorted(values)
    n = len(s)
    mid = n // 2
    return s[mid] if n % 2 else (s[mid - 1] + s[mid]) / 2


def _ranking_metrics(points: list[dict], low: float, high: float, settings_history: list[dict]) -> dict[str, Any]:
    vals = [p["val"] for p in points]
    tir = round(_calculate_tir_metrics(vals, low, high)["tir"], 2)
    devs = [abs(p["val"] - tgt) for p in points if (tgt := _target_for_epoch(p["epoch"], settings_history)) is not None]
    med = _median(devs)
    median_abs_target_dev = None if med is None else round(med, 1)
    cv = None
    if vals:
        avg = sum(vals) / len(vals)
        if avg > 0:
            sd = math.sqrt(sum((v - avg) ** 2 for v in vals) / len(vals))
            cv = round(sd / avg * 100, 2)
    return {"tir": tir, "medianAbsTargetDev": median_abs_target_dev, "cv": cv}


def _compare_ranking(a: dict, b: dict) -> float:
    """>0 if a is better than b, <0 if worse, 0 if indistinguishable."""
    if a["tir"] != b["tir"]:
        return a["tir"] - b["tir"]
    ad, bd = a["medianAbsTargetDev"], b["medianAbsTargetDev"]
    if ad is not None and bd is not None and ad != bd:
        return bd - ad
    if ad is None and bd is not None:
        return -1
    if ad is not None and bd is None:
        return 1
    ac, bc = a["cv"], b["cv"]
    if ac is not None and bc is not None and ac != bc:
        return bc - ac
    if ac is None and bc is not None:
        return -1
    if ac is not None and bc is None:
        return 1
    return 0


def _observed_day_span(epochs: list[float]) -> float:
    if not epochs:
        return 0.0
    span = (max(epochs) - min(epochs)) / 86400
    return span if span > 0 else 1 / 24


def _summarise_insulin(timeline: list[dict], daily_insulin: list[dict] | None) -> dict[str, Any]:
    bolus_items = [i for i in timeline if i["type"] == "BOLUS"]
    bolus_units = sum(b.get("units") or 0 for b in bolus_items)
    bolus_event_count = len(bolus_items)
    cgm_epochs = [i["epoch"] for i in timeline if i["type"] == "CGM"]
    observed_days = _observed_day_span(cgm_epochs)
    bolus_units_per_day = bolus_units / observed_days if observed_days else 0

    out: dict[str, Any] = {
        "observedDays": round(observed_days, 2),
        "bolusSource": "archive-events",
        "bolusUnits": round(bolus_units, 2),
        "bolusUnitsPerDay": round(bolus_units_per_day, 2),
        "bolusEventCount": bolus_event_count,
        "avgUnitsPerBolus": round(bolus_units / bolus_event_count, 2) if bolus_event_count else None,
    }
    if daily_insulin:
        basal_units = sum(r["basalUnits"] for r in daily_insulin if r.get("basalUnits") is not None)
        basal_day_count = sum(1 for r in daily_insulin if r.get("basalUnits") is not None)
        avg_basal_per_day = basal_units / basal_day_count if basal_day_count else None
        out["basalSource"] = "glooko-daily"
        out["basalUnits"] = round(basal_units, 2)
        out["basalDayCount"] = basal_day_count
        out["averageBasalUnitsPerDay"] = None if avg_basal_per_day is None else round(avg_basal_per_day, 2)
        if avg_basal_per_day is not None:
            daily_total = avg_basal_per_day + bolus_units_per_day
            out["basalPercent"] = round(avg_basal_per_day / daily_total * 100, 1) if daily_total else None
            out["bolusPercent"] = round(bolus_units_per_day / daily_total * 100, 1) if daily_total else None
    return out


def _summarise_carbs(timeline: list[dict]) -> dict[str, Any]:
    cgm_epochs = [i["epoch"] for i in timeline if i["type"] == "CGM"]
    observed_days = _observed_day_span(cgm_epochs) or 1
    carbs_grams = sum(i.get("carbs") or 0 for i in timeline if i["type"] == "BOLUS" and (i.get("carbs") or 0) > 0)
    carb_entry_count = sum(1 for i in timeline if i["type"] == "BOLUS" and (i.get("carbs") or 0) > 0)
    return {
        "carbsGrams": round(carbs_grams), "carbsPerDay": round(carbs_grams / observed_days), "carbEntryCount": carb_entry_count,
    }


def _calculate_hourly(timeline: list[dict], low: float, high: float) -> list[dict[str, Any]]:
    cgm = [i for i in timeline if i["type"] == "CGM"]
    if not cgm:
        return []
    hourly: dict[int, list[float]] = {}
    for p in cgm:
        h = datetime.fromtimestamp(p["epoch"], tz=timezone.utc).hour
        hourly.setdefault(h, []).append(p["val"])
    rows = []
    for h, vals in hourly.items():
        m = _calculate_tir_metrics(vals, low, high)
        rows.append({
            "hour": f"{h:02d}:00", "hourNum": h,
            "avg": round(sum(vals) / len(vals), 1),
            "tir": round(m["tir"], 2), "low": round(m["low"], 2), "high": round(m["high"], 2),
            "readings": len(vals),
        })
    rows.sort(key=lambda r: r["hourNum"])
    return rows


def _get_interpolated_bg(target_epoch: float, cgm_only: list[dict]) -> float | None:
    before = None
    after = None
    for p in cgm_only:
        if p["epoch"] <= target_epoch:
            before = p
        elif after is None:
            after = p
            break
    if before is None or after is None or (after["epoch"] - before["epoch"]) > 600:
        chosen = before or after
        return chosen["val"] if chosen else None
    weight = (target_epoch - before["epoch"]) / (after["epoch"] - before["epoch"])
    return round(before["val"] + weight * (after["val"] - before["val"]), 1)


def _build_enriched_bolus_log(timeline: list[dict], settings_history: list[dict]) -> list[dict[str, Any]]:
    cgm_only = [i for i in timeline if i["type"] == "CGM"]
    out = []
    for bolus in (i for i in timeline if i["type"] == "BOLUS"):
        active = None
        for s in settings_history:
            try:
                s_epoch = datetime.fromisoformat(s["activeTimestamp"].replace("Z", "+00:00")).timestamp()
            except (KeyError, ValueError):
                continue
            if s_epoch <= bolus["epoch"]:
                active = s
        context = None
        if active is not None:
            try:
                profile = active["settings"]["profilesBolus"][0]
                context = {
                    "DIA": active["settings"]["generalSettings"].get("activeInsulinTime"),
                    "target": _find_active_data_record((profile.get("targetBgSegments") or {}).get("data") or [], bolus["epoch"]),
                    "isf": _find_active_data_record((profile.get("isfSegments") or {}).get("data") or [], bolus["epoch"]),
                    "active_cr": _find_active_data_record((profile.get("insulinToCarbRatioSegments") or {}).get("data") or [], bolus["epoch"]),
                }
            except (KeyError, IndexError, TypeError):
                context = None
        out.append({
            **bolus,
            "cgm_val": _get_interpolated_bg(bolus["epoch"], cgm_only),
            "context": context,
        })
    return out


# ---------------------------------------------------------------------------
# Bucketed trend -- port of bucketTrend/buildBucketRow
# ---------------------------------------------------------------------------

def _calendar_bucket_key(epoch_seconds: float, granularity: str) -> str:
    d = datetime.fromtimestamp(epoch_seconds, tz=timezone.utc)
    if granularity == "day":
        return d.strftime("%Y-%m-%d")
    if granularity == "week":
        monday = d - timedelta(days=d.weekday())
        return "W:" + monday.strftime("%Y-%m-%d")
    if granularity == "month":
        return f"{d.year}-{d.month:02d}"
    if granularity == "quarter":
        q = (d.month - 1) // 3 + 1
        return f"{d.year}-Q{q}"
    raise GlookoError(f"Unbekannte Granularität: {granularity}")


def _fixed_bucket_key(epoch_seconds: float, start_epoch_seconds: float, size_days: int) -> str:
    size_secs = size_days * 86400
    idx = math.floor((epoch_seconds - start_epoch_seconds) / size_secs)
    bucket_start = start_epoch_seconds + idx * size_secs
    return "F:" + datetime.fromtimestamp(bucket_start, tz=timezone.utc).strftime("%Y-%m-%d")


def _bucket_trend(
    timeline: list[dict], low: float, high: float, mode: str, granularity: str, fixed_size_days: int,
    window_start: int, daily_insulin: list[dict] | None,
) -> list[dict[str, Any]]:
    buckets: dict[str, dict[str, Any]] = {}

    def key_for(epoch: float) -> str:
        return _fixed_bucket_key(epoch, window_start, fixed_size_days) if mode == "fixed" else _calendar_bucket_key(epoch, granularity)

    def new_bucket(key: str, epoch: float) -> dict[str, Any]:
        return {
            "key": key, "firstEpoch": epoch, "lastEpoch": epoch,
            "cgmEpochs": [], "cgmSum": 0.0, "cgmSumSq": 0.0, "cgmCount": 0,
            "inRange": 0, "low": 0, "high": 0,
            "bolusUnits": 0.0, "bolusCount": 0, "carbs": 0.0, "carbEntries": 0,
            "basalByDay": {}, "hasInsulinData": False,
        }

    for item in timeline:
        key = key_for(item["epoch"])
        b = buckets.setdefault(key, new_bucket(key, item["epoch"]))
        b["firstEpoch"] = min(b["firstEpoch"], item["epoch"])
        b["lastEpoch"] = max(b["lastEpoch"], item["epoch"])
        if item["type"] == "CGM":
            v = item["val"]
            b["cgmEpochs"].append(item["epoch"])
            b["cgmSum"] += v
            b["cgmSumSq"] += v * v
            b["cgmCount"] += 1
            if v < low:
                b["low"] += 1
            elif v > high:
                b["high"] += 1
            else:
                b["inRange"] += 1
        elif item["type"] == "BOLUS":
            b["bolusUnits"] += item.get("units") or 0
            b["bolusCount"] += 1
            if (item.get("carbs") or 0) > 0:
                b["carbs"] += item["carbs"]
                b["carbEntries"] += 1

    for rec in daily_insulin or []:
        if rec.get("basalUnits") is None:
            continue
        day_epoch = datetime.fromisoformat(rec["dayUtc"] + "T12:00:00+00:00").timestamp()
        key = key_for(day_epoch)
        b = buckets.setdefault(key, new_bucket(key, day_epoch))
        b["basalByDay"][rec["dayUtc"]] = rec["basalUnits"]
        b["hasInsulinData"] = True

    rows = []
    for b in sorted(buckets.values(), key=lambda x: x["firstEpoch"]):
        rows.append(_build_bucket_row(b, low, high))
    return rows


def _build_bucket_row(b: dict[str, Any], low: float, high: float) -> dict[str, Any]:
    avg = b["cgmSum"] / b["cgmCount"] if b["cgmCount"] else 0.0
    variance = (b["cgmSumSq"] / b["cgmCount"] - avg * avg) if b["cgmCount"] else 0.0
    std = math.sqrt(max(0.0, variance))
    cv = (std / avg * 100) if avg else 0.0
    gmi = round(3.31 + 0.02392 * avg, 2) if b["cgmCount"] else None

    observed_days = _observed_day_span(b["cgmEpochs"]) or 1
    expected_readings = max(1, round(observed_days * 288))
    coverage_pct = round(min(100, b["cgmCount"] / expected_readings * 100), 1)

    basal_units = sum(b["basalByDay"].values())
    basal_day_count = len(b["basalByDay"])
    bolus_units = round(b["bolusUnits"], 2)
    bolus_units_per_day = b["bolusUnits"] / observed_days
    avg_units_per_bolus = round(b["bolusUnits"] / b["bolusCount"], 2) if b["bolusCount"] else None

    insulin: dict[str, Any] = {
        "bolusSource": "archive-events", "bolusUnits": bolus_units,
        "bolusUnitsPerDay": round(bolus_units_per_day, 2), "bolusEventCount": b["bolusCount"],
        "avgUnitsPerBolus": avg_units_per_bolus,
    }
    if b["hasInsulinData"]:
        avg_basal_per_day = basal_units / basal_day_count if basal_day_count else None
        insulin["basalSource"] = "glooko-daily"
        insulin["basalUnits"] = round(basal_units, 2)
        insulin["basalDayCount"] = basal_day_count
        insulin["averageBasalUnitsPerDay"] = None if avg_basal_per_day is None else round(avg_basal_per_day, 2)
        if avg_basal_per_day is not None:
            daily_total = avg_basal_per_day + bolus_units_per_day
            insulin["basalPercent"] = round(avg_basal_per_day / daily_total * 100, 1) if daily_total else None
            insulin["bolusPercent"] = round(bolus_units_per_day / daily_total * 100, 1) if daily_total else None

    return {
        "bucket": re.sub(r"^[WF]:", "", b["key"]),
        "start": _epoch_to_iso(b["firstEpoch"]), "end": _epoch_to_iso(b["lastEpoch"]),
        "observedDays": round(observed_days, 3),
        "glucose": {
            "avg": round(avg, 1) if b["cgmCount"] else None,
            "timeInRange": round(b["inRange"] / b["cgmCount"] * 100, 2) if b["cgmCount"] else 0,
            "timeLow": round(b["low"] / b["cgmCount"] * 100, 2) if b["cgmCount"] else 0,
            "timeHigh": round(b["high"] / b["cgmCount"] * 100, 2) if b["cgmCount"] else 0,
            "stdDev": round(std, 1) if b["cgmCount"] else None,
            "coefficientOfVariation": round(cv, 2),
            "gmiEstimatedA1c": gmi,
            "cgmReadingCount": b["cgmCount"],
        },
        "insulin": insulin,
        "carbs": {
            "carbsGrams": round(b["carbs"]), "carbsPerDay": round(b["carbs"] / observed_days), "carbEntryCount": b["carbEntries"],
        },
        "coverage": {
            "cgmReadingCount": b["cgmCount"], "expectedReadingCount": expected_readings,
            "coveragePercent": coverage_pct, "trustworthy": coverage_pct >= 70,
        },
    }


def _downsample_for_chart(timeline: list[dict], max_points: int) -> dict[str, Any]:
    cgm = [i for i in timeline if i["type"] == "CGM"]
    boluses = [
        {"t": i["time"], "epoch": i["epoch"], "units": i.get("units"), "carbs": i.get("carbs"), "class": i.get("class")}
        for i in timeline if i["type"] == "BOLUS"
    ]
    if not cgm:
        return {"points": [], "boluses": boluses, "requestedMax": max_points, "actualPoints": 0}

    cap = max(2, int(max_points) or 200)
    if len(cgm) <= cap:
        points = [{"t": p["time"], "avg": p["val"], "min": p["val"], "max": p["val"], "n": 1} for p in cgm]
        return {"points": points, "boluses": boluses, "requestedMax": cap, "actualPoints": len(points)}

    start_epoch, end_epoch = cgm[0]["epoch"], cgm[-1]["epoch"]
    total_span = (end_epoch - start_epoch) or 1
    bucket_span = total_span / cap

    buckets: dict[int, dict[str, Any]] = {}
    for p in cgm:
        idx = min(cap - 1, int((p["epoch"] - start_epoch) // bucket_span))
        b = buckets.setdefault(idx, {"sum": 0.0, "n": 0, "min": math.inf, "max": -math.inf})
        b["sum"] += p["val"]
        b["n"] += 1
        b["min"] = min(b["min"], p["val"])
        b["max"] = max(b["max"], p["val"])

    points = [
        {
            "t": _epoch_to_iso(start_epoch + idx * bucket_span),
            "avg": round(b["sum"] / b["n"], 1), "min": round(b["min"], 1), "max": round(b["max"], 1), "n": b["n"],
        }
        for idx, b in sorted(buckets.items())
    ]
    return {"points": points, "boluses": boluses, "requestedMax": cap, "actualPoints": len(points)}


# ---------------------------------------------------------------------------
# Diabetes summary -- port of computeSummary
# ---------------------------------------------------------------------------

def _compute_summary(timeline: list[dict], settings_history: list[dict], low: float, high: float, daily_insulin: list[dict] | None) -> dict[str, Any]:
    cgm_vals = [i["val"] for i in timeline if i["type"] == "CGM"]
    report_start = timeline[0]["time"] if timeline else None
    report_end = timeline[-1]["time"] if timeline else None
    days = (timeline[-1]["epoch"] - timeline[0]["epoch"]) / 86400 if len(timeline) > 1 else 0

    avg = std = cv = 0.0
    gmi = None
    tir = {"tir": 0.0, "low": 0.0, "high": 0.0}
    if cgm_vals:
        avg = sum(cgm_vals) / len(cgm_vals)
        std = math.sqrt(sum((v - avg) ** 2 for v in cgm_vals) / len(cgm_vals))
        cv = (std / avg * 100) if avg else 0.0
        tir = _calculate_tir_metrics(cgm_vals, low, high)
        gmi = round(3.31 + 0.02392 * avg, 2)

    daily_pts: dict[str, list[dict]] = {}
    for p in timeline:
        if p["type"] != "CGM":
            continue
        k = p["time"][:10]
        daily_pts.setdefault(k, []).append(p)
    best_day = worst_day = None
    best_dm = worst_dm = None
    for k, pts in daily_pts.items():
        m = _ranking_metrics(pts, low, high, settings_history)
        if best_dm is None or _compare_ranking(m, best_dm) > 0:
            best_dm, best_day = m, {"day": k, **m}
        if worst_dm is None or _compare_ranking(m, worst_dm) < 0:
            worst_dm, worst_day = m, {"day": k, **m}
    best_day = best_day or {"day": "N/A", "tir": 0, "medianAbsTargetDev": None, "cv": None}
    worst_day = worst_day or {"day": "N/A", "tir": 0, "medianAbsTargetDev": None, "cv": None}

    hourly_pts: dict[int, list[dict]] = {}
    for p in timeline:
        if p["type"] != "CGM":
            continue
        h = datetime.fromtimestamp(p["epoch"], tz=timezone.utc).hour
        hourly_pts.setdefault(h, []).append(p)
    best_hour = worst_hour = None
    best_hm = worst_hm = None
    for h, pts in hourly_pts.items():
        m = _ranking_metrics(pts, low, high, settings_history)
        label = f"{h:02d}:00"
        if best_hm is None or _compare_ranking(m, best_hm) > 0:
            best_hm, best_hour = m, {"hour": label, **m}
        if worst_hm is None or _compare_ranking(m, worst_hm) < 0:
            worst_hm, worst_hour = m, {"hour": label, **m}
    best_hour = best_hour or {"hour": "N/A", "tir": 0, "medianAbsTargetDev": None, "cv": None}
    worst_hour = worst_hour or {"hour": "N/A", "tir": 0, "medianAbsTargetDev": None, "cv": None}

    cgm_points = [i for i in timeline if i["type"] == "CGM"]
    glucose_extremes = None
    if cgm_points:
        hi = max(p["val"] for p in cgm_points)
        lo = min(p["val"] for p in cgm_points)

        def instances(target: float) -> list[dict]:
            return sorted(
                [{"value": p["val"], "time": p["time"]} for p in cgm_points if abs(p["val"] - target) < 0.5],
                key=lambda r: r["time"],
            )

        highs, lows = instances(hi), instances(lo)
        glucose_extremes = {
            "highest": {"value": hi, "count": len(highs), "instances": highs},
            "lowest": {"value": lo, "count": len(lows), "instances": lows},
        }

    boluses = [i for i in timeline if i["type"] == "BOLUS"]
    bolus_architecture = {
        "meal": sum(1 for b in boluses if b["class"] == "Meal Bolus"),
        "manualCorrection": sum(1 for b in boluses if b["class"] == "Manual Correction Bolus"),
        "systemCorrection": sum(1 for b in boluses if b["class"] == "System Correction Bolus"),
        "mealWithCorrection": sum(1 for b in boluses if b["class"] == "Meal With Correction Bolus"),
    }

    return {
        "unit": "mg/dL",
        "reportRange": {"start": report_start, "end": report_end, "days": round(days, 2)},
        "glucoseControl": {
            "averageBG": round(avg, 1) if cgm_vals else None,
            "gmiEstimatedA1c": gmi,
            "stdDev": round(std, 1) if cgm_vals else None,
            "coefficientOfVariation": round(cv, 2),
            "variabilityFlag": "High Variability" if cv > 36 else "Stable",
            "timeInRange": round(tir["tir"], 2), "timeLow": round(tir["low"], 2), "timeHigh": round(tir["high"], 2),
            "cgmReadingCount": len(cgm_vals),
        },
        "glucoseExtremes": glucose_extremes,
        "bestWorst": {"bestDay": best_day, "worstDay": worst_day, "bestHour": best_hour, "worstHour": worst_hour},
        "insulin": _summarise_insulin(timeline, daily_insulin),
        "bolusArchitecture": bolus_architecture,
        "carbs": _summarise_carbs(timeline),
        "settings": _shape_settings(settings_history),
    }


# ---------------------------------------------------------------------------
# Public per-tool entry points (one per chat tool, see tools.py)
# ---------------------------------------------------------------------------

_DEFAULT_LOW_MGDL = 70.0
_DEFAULT_HIGH_MGDL = 180.0


async def _prepared(email: str, password: str, from_millis: int, to_millis: int) -> tuple[list[dict], list[dict], list[dict], dict, str]:
    """Fetches once (via the coalescing cache) and returns
    (timeline, settings_history, daily_insulin, raw_data, source_unit)."""
    raw = await _get_raw_cached(email, password, from_millis, to_millis)
    source_unit = _detect_source_unit(raw["data"])
    timeline = _build_timeline(raw["data"], source_unit)
    settings_history = _extract_settings_history(raw["settings"], from_millis, to_millis, source_unit)
    daily_insulin = _extract_daily_insulin(raw["data"])
    return timeline, settings_history, daily_insulin, raw["data"], source_unit


async def get_diabetes_summary(email: str, password: str, from_millis: int, to_millis: int, lower: float = _DEFAULT_LOW_MGDL, upper: float = _DEFAULT_HIGH_MGDL) -> dict:
    _assert_cap(from_millis, to_millis, _CAP_SUMMARY_DAYS, "get_diabetes_summary")
    timeline, settings_history, daily_insulin, _raw, _unit = await _prepared(email, password, from_millis, to_millis)
    summary = _compute_summary(timeline, settings_history, lower, upper, daily_insulin)
    if not timeline:
        summary["note"] = "Keine CGM-/Bolus-Daten für diesen Zeitraum verfügbar."
    return summary


async def get_trend(
    email: str, password: str, from_millis: int, to_millis: int,
    mode: str = "calendar", granularity: str = "month", fixed_size_days: int = 7,
    lower: float = _DEFAULT_LOW_MGDL, upper: float = _DEFAULT_HIGH_MGDL,
) -> dict:
    _assert_cap(from_millis, to_millis, _CAP_SUMMARY_DAYS, "get_trend")
    timeline, _sh, daily_insulin, _raw, _unit = await _prepared(email, password, from_millis, to_millis)
    rows = _bucket_trend(timeline, lower, upper, mode, granularity, fixed_size_days, from_millis / 1000, daily_insulin)
    return {
        "window": {"start": _iso(from_millis), "end": _iso(to_millis)},
        "mode": mode, "granularity": granularity if mode == "calendar" else f"{fixed_size_days}d",
        "unit": "mg/dL", "bucketCount": len(rows), "buckets": rows,
    }


async def get_glucose(email: str, password: str, from_millis: int, to_millis: int, band: str = "all", lower: float = _DEFAULT_LOW_MGDL, upper: float = _DEFAULT_HIGH_MGDL) -> dict:
    _assert_cap(from_millis, to_millis, _CAP_TIMELINE_DAYS, "get_glucose")
    timeline, _sh, _di, _raw, _unit = await _prepared(email, password, from_millis, to_millis)

    def band_of(v: float) -> str:
        if v < lower:
            return "low"
        if v > upper:
            return "high"
        return "target"

    readings = []
    for i in timeline:
        if i["type"] != "CGM":
            continue
        b = band_of(i["val"])
        if band != "all" and b != band:
            continue
        r = {"time": i["time"], "value": i["val"], "velocity": i["vel"]}
        if band == "all":
            r["band"] = b
        readings.append(r)

    return {
        "window": {"start": _iso(from_millis), "end": _iso(to_millis)},
        "thresholdsUsed": {"lower": lower, "upper": upper, "unit": "mg/dL"},
        "band": band, "count": len(readings), "readings": readings,
    }


@dataclass
class GlucosePoint:
    date_millis: int
    mg_dl: float
    #: Change in mg/dL to the previous 5-minute reading (see _build_timeline's "vel").
    velocity: float


async def fetch_glucose_points(email: str, password: str, from_millis: int, to_millis: int) -> list[GlucosePoint]:
    """Plain CGM readings for the Übersicht's live graph -- same timeline the chat tools use, but
    returned as values instead of the tool-shaped dict, so main.py doesn't have to parse ISO
    strings back into timestamps."""
    _assert_cap(from_millis, to_millis, _CAP_TIMELINE_DAYS, "fetch_glucose_points")
    timeline, _sh, _di, _raw, _unit = await _prepared(email, password, from_millis, to_millis)
    return [
        GlucosePoint(date_millis=int(i["epoch"] * 1000), mg_dl=float(i["val"]), velocity=float(i.get("vel") or 0.0))
        for i in timeline
        if i["type"] == "CGM" and isinstance(i.get("epoch"), (int, float))
    ]


# Glooko reports no trend arrow of its own -- derived here from the change to the previous reading
# (readings are 5 minutes apart, see _build_timeline's bucketing), using Nightscout's own
# direction names so the UI needs no second mapping. Thresholds are Nightscout's mg/dL-per-minute
# bands (1 / 2 / 3) multiplied by those 5 minutes.
_TREND_STEPS = ((15.0, "DoubleUp", "DoubleDown"), (10.0, "SingleUp", "SingleDown"), (5.0, "FortyFiveUp", "FortyFiveDown"))


def direction_for_velocity(velocity: float) -> str:
    for threshold, up, down in _TREND_STEPS:
        if velocity >= threshold:
            return up
        if velocity <= -threshold:
            return down
    return "Flat"


async def get_chart_series(email: str, password: str, from_millis: int, to_millis: int, max_points: int = 250) -> dict:
    _assert_cap(from_millis, to_millis, _CAP_SUMMARY_DAYS, "get_chart_series")
    timeline, _sh, _di, _raw, _unit = await _prepared(email, password, from_millis, to_millis)
    series = _downsample_for_chart(timeline, max_points)
    return {"window": {"start": _iso(from_millis), "end": _iso(to_millis)}, "unit": "mg/dL", **series}


async def get_enriched_bolus_log(email: str, password: str, from_millis: int, to_millis: int, classes: list[str] | None = None) -> dict:
    _assert_cap(from_millis, to_millis, _CAP_BOLUS_DAYS, "get_enriched_bolus_log")
    timeline, settings_history, _di, _raw, _unit = await _prepared(email, password, from_millis, to_millis)
    log = _build_enriched_bolus_log(timeline, settings_history)
    if classes:
        log = [b for b in log if b["class"] in classes]
    return {
        "window": {"start": _iso(from_millis), "end": _iso(to_millis)},
        "filterApplied": classes or "All", "count": len(log), "boluses": log,
    }


async def get_hourly_trends(email: str, password: str, from_millis: int, to_millis: int, lower: float = _DEFAULT_LOW_MGDL, upper: float = _DEFAULT_HIGH_MGDL) -> dict:
    _assert_cap(from_millis, to_millis, _CAP_SUMMARY_DAYS, "get_hourly_trends")
    timeline, _sh, _di, _raw, _unit = await _prepared(email, password, from_millis, to_millis)
    return {
        "window": {"start": _iso(from_millis), "end": _iso(to_millis)}, "unit": "mg/dL",
        "byHour": _calculate_hourly(timeline, lower, upper),
    }


async def get_basal_delivery(email: str, password: str, from_millis: int, to_millis: int, include_intervals: bool = True) -> dict:
    _assert_cap(from_millis, to_millis, _CAP_SUMMARY_DAYS, "get_basal_delivery")
    raw = await _get_raw_cached(email, password, from_millis, to_millis)
    intervals = _derive_basal_states(raw["data"], from_millis / 1000, to_millis / 1000)
    result: dict[str, Any] = {
        "window": {"start": _iso(from_millis), "end": _iso(to_millis)},
        "summary": _summarise_basal_states(intervals),
    }
    if include_intervals:
        result["intervals"] = [{"state": i["state"], "start": i["start"], "end": i["end"], "minutes": i["minutes"]} for i in intervals]
    return result


async def get_daily_insulin(email: str, password: str, from_millis: int, to_millis: int) -> dict:
    _assert_cap(from_millis, to_millis, _CAP_SUMMARY_DAYS, "get_daily_insulin")
    raw = await _get_raw_cached(email, password, from_millis, to_millis)
    days = _extract_daily_insulin(raw["data"])
    with_values = [d for d in days if d.get("totalUnits") is not None]
    n = len(with_values)

    def s(key: str) -> float:
        return sum(d.get(key) or 0 for d in with_values)

    aggregate = None
    if n:
        total = s("totalUnits")
        aggregate = {
            "daysWithData": n, "basalUnits": round(s("basalUnits"), 2), "bolusUnits": round(s("bolusUnits"), 2),
            "totalUnits": round(total, 2), "basalUnitsPerDay": round(s("basalUnits") / n, 2),
            "bolusUnitsPerDay": round(s("bolusUnits") / n, 2), "totalUnitsPerDay": round(total / n, 2),
            "basalPercent": round(s("basalUnits") / total * 100) if total > 0 else None,
        }
    return {
        "window": {"start": _iso(from_millis), "end": _iso(to_millis)}, "source": "glooko-daily",
        "sourceNote": "Glookos eigene Tagessummen wie vom Gerät gemeldet (nicht aus Einzelereignissen neu berechnet). "
                      "Für aus Bolusereignissen aggregierte Werte siehe get_diabetes_summary oder get_trend.",
        "days": [{"date": d["dayUtc"], "basalUnits": d["basalUnits"], "bolusUnits": d["bolusUnits"], "totalUnits": d["totalUnits"]} for d in days],
        "aggregate": aggregate,
    }


async def get_settings_history(email: str, password: str, from_millis: int, to_millis: int) -> dict:
    _assert_cap(from_millis, to_millis, _CAP_SUMMARY_DAYS, "get_settings_history")
    raw = await _get_raw_cached(email, password, from_millis, to_millis)
    source_unit = _detect_source_unit(raw["data"])
    settings_history = _extract_settings_history(raw["settings"], from_millis, to_millis, source_unit)
    return {"window": {"start": _iso(from_millis), "end": _iso(to_millis)}, "settings": _shape_settings(settings_history)}


async def get_device_events(email: str, password: str, from_millis: int, to_millis: int) -> dict:
    _assert_cap(from_millis, to_millis, _CAP_SUMMARY_DAYS, "get_device_events")
    raw = await _get_raw_cached(email, password, from_millis, to_millis)
    ev = _extract_device_events(raw["data"])
    return {
        "window": {"start": _iso(from_millis), "end": _iso(to_millis)},
        "podChanges": [x["time"] for x in ev["podChanges"]], "sensorChanges": [x["time"] for x in ev["sensorChanges"]],
        "counts": {"podChanges": len(ev["podChanges"]), "sensorChanges": len(ev["sensorChanges"])},
    }


async def get_meal_window_analysis(email: str, password: str, event_epoch_millis: int) -> dict:
    from_millis = event_epoch_millis - 30 * 60 * 1000
    to_millis = event_epoch_millis + 180 * 60 * 1000
    timeline, settings_history, _di, _raw, _unit = await _prepared(email, password, from_millis, to_millis)
    cgm = [i for i in timeline if i["type"] == "CGM"]
    boluses = _build_enriched_bolus_log(timeline, settings_history)
    return {
        "targetEvent": _iso(event_epoch_millis), "unit": "mg/dL",
        "glucoseTimeline": [{"time": i["time"], "value": i["val"]} for i in cgm],
        "associatedBoluses": boluses,
    }


async def test_connection(email: str, password: str) -> tuple[bool, str]:
    if not email or not password:
        return False, "Benutzername und Passwort erforderlich."
    try:
        now = int(time.time() * 1000)
        summary = await get_diabetes_summary(email, password, now - 7 * 24 * 60 * 60 * 1000, now)
    except GlookoError as exc:
        return False, str(exc)
    count = summary.get("glucoseControl", {}).get("cgmReadingCount", 0)
    return True, f"Verbindung erfolgreich -- {count} CGM-Messungen in den letzten 7 Tagen gefunden."
