"""Nightscout direct REST API client + deterministic glycemic metrics -- ported from the Android
app's `NightscoutDirectApi.kt` (fetch shape) and `DiabetesDashboardManager.kt`'s
`computeLiveSnapshot`/`computeStatus` (metrics formulas + RED/YELLOW/GREEN thresholds), so both
clients report identical numbers for the same raw Nightscout data.

Deviation from the Android app: there, the LLM itself computes TIR/hypo/hyper/etc. from raw MCP
tool output during the chat tool-loop; STUFE 1's instant preview is the only place that already
computes metrics deterministically in Kotlin. This web MVP has no MCP tool loop yet (see README),
so *all* dashboard metrics are computed deterministically here, server-side -- arguably more
robust than asking a model to do arithmetic, and it's exactly the same formulas the Android app's
own STUFE-1 preview already uses.
"""
from __future__ import annotations

import math
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from urllib.parse import parse_qsl, urlsplit, urlunsplit

import httpx

_TIMEOUT = httpx.Timeout(15.0, connect=10.0)

_TREND_ARROWS = {
    "DoubleUp": "⇈",
    "SingleUp": "↑",
    "FortyFiveUp": "↗",
    "Flat": "→",
    "FortyFiveDown": "↘",
    "SingleDown": "↓",
    "DoubleDown": "⇊",
}


def _auth_header(auth_method: str, token: str) -> tuple[str, str] | None:
    if not token:
        return None
    if auth_method == "BEARER_TOKEN":
        return ("Authorization", f"Bearer {token}")
    if auth_method == "API_SECRET_HEADER":
        return ("api-secret", token)
    return None


def _join_url(base_url: str, path: str) -> str:
    """Appends `path` to `base_url`'s own path -- does NOT carry over `base_url`'s own query
    string (e.g. a Nightscout share link's `?token=xyz`); callers must merge that in separately
    via `_base_query_params`. httpx's `client.get(url, params=...)` REPLACES the URL's existing
    query string wholesale rather than merging it (confirmed empirically -- unlike Ktor's
    `HttpRequestBuilder.parameter()`, which appends to a `URLBuilder` already seeded from
    `takeFrom(baseUrl)`), so passing a `?token=...`-bearing URL straight into `params=` silently
    drops the token and the request comes back 401."""
    parts = urlsplit(base_url)
    new_path = parts.path.rstrip("/") + path
    return urlunsplit((parts.scheme, parts.netloc, new_path, "", ""))


def _base_query_params(base_url: str) -> dict[str, str]:
    """`base_url`'s own query string (e.g. Nightscout's `?token=xyz` share-link format) as a
    dict, to be merged into a request's own `params=` -- see `_join_url`'s doc comment."""
    return dict(parse_qsl(urlsplit(base_url).query))


@dataclass
class NightscoutEntry:
    sgv_mg_dl: float
    date_millis: int
    direction: str


async def fetch_entries(base_url: str, auth_method: str, token: str, from_millis: int, to_millis: int) -> list[NightscoutEntry]:
    url = _join_url(base_url, "/api/v1/entries/sgv.json")
    header = _auth_header(auth_method, token)
    headers = dict([header]) if header else {}
    params = {
        **_base_query_params(base_url),
        "find[date][$gte]": from_millis,
        "find[date][$lte]": to_millis,
        "count": 100_000,
    }
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(url, params=params, headers=headers)
    if resp.status_code >= 400:
        raise RuntimeError(f"Nightscout-API-Fehler: HTTP {resp.status_code}")
    raw = resp.json()
    entries: list[NightscoutEntry] = []
    for item in raw if isinstance(raw, list) else []:
        sgv = item.get("sgv")
        date = item.get("date")
        if sgv is None or date is None:
            continue
        entries.append(NightscoutEntry(float(sgv), int(date), item.get("direction") or ""))
    return entries


async def test_connection(base_url: str, auth_method: str, token: str) -> tuple[bool, str]:
    try:
        now = int(time.time() * 1000)
        entries = await fetch_entries(base_url, auth_method, token, now - 3 * 60 * 60 * 1000, now)
        return True, f"Verbindung erfolgreich -- {len(entries)} Werte in den letzten 3h gefunden."
    except Exception as exc:  # noqa: BLE001 -- surfaced to the user as a plain message
        return False, str(exc)


def trend_arrow_for(direction: str) -> str:
    return _TREND_ARROWS.get(direction, "–")


@dataclass
class DashboardMetrics:
    tir_percent: float
    hypo_percent: float
    severe_hypo_percent: float
    hyper_percent: float
    cv_percent: float
    avg_glucose: float

    @property
    def estimated_hba1c_percent(self) -> float:
        """Glucose Management Indicator (Bergenstal et al. 2018) -- same formula as the Android
        app's `DashboardMetrics.estimatedHbA1cPercent`. Not a lab HbA1c substitute."""
        return 3.31 + 0.02392 * self.avg_glucose


def compute_metrics(entries: list[NightscoutEntry]) -> DashboardMetrics | None:
    if not entries:
        return None
    values = [e.sgv_mg_dl for e in entries]
    n = len(values)
    avg = sum(values) / n
    tir = 100.0 * sum(1 for v in values if 70.0 <= v <= 180.0) / n
    hypo = 100.0 * sum(1 for v in values if v < 70.0) / n
    severe_hypo = 100.0 * sum(1 for v in values if v < 54.0) / n
    hyper = 100.0 * sum(1 for v in values if v > 180.0) / n
    variance = sum((v - avg) ** 2 for v in values) / n
    std_dev = math.sqrt(variance)
    cv = 100.0 * std_dev / avg if avg > 0 else 0.0
    return DashboardMetrics(tir, hypo, severe_hypo, hyper, cv, avg)


def looks_empty(m: DashboardMetrics) -> bool:
    """TIR + hypo + hyper together should always sum to roughly 100% if there's any glucose
    reading at all, so all three (plus the average) coming back exactly zero is a reliable "this
    source had nothing to report" signature -- same idea as the Android app's `looksEmpty`.
    Excludes a source from a combined multi-source result instead of letting it silently pull the
    average toward zero."""
    return m.tir_percent == 0.0 and m.hypo_percent == 0.0 and m.hyper_percent == 0.0 and m.avg_glucose == 0.0


def combine_metrics(per_source: list[DashboardMetrics]) -> DashboardMetrics:
    """Averages each field across sources -- same approach as the Android app's `combineMetrics`:
    a plain, transparent combination instead of asking a model to reconcile several heterogeneous
    results in one shared context. Reduces to the single value unchanged when there's only one
    source, the common case."""
    if len(per_source) == 1:
        return per_source[0]
    n = len(per_source)
    return DashboardMetrics(
        tir_percent=sum(m.tir_percent for m in per_source) / n,
        hypo_percent=sum(m.hypo_percent for m in per_source) / n,
        severe_hypo_percent=sum(m.severe_hypo_percent for m in per_source) / n,
        hyper_percent=sum(m.hyper_percent for m in per_source) / n,
        cv_percent=sum(m.cv_percent for m in per_source) / n,
        avg_glucose=sum(m.avg_glucose for m in per_source) / n,
    )


@dataclass
class StatusEvaluation:
    status: str  # "RED" | "YELLOW" | "GREEN"
    reason: str


def compute_status(m: DashboardMetrics, is_en: bool = False) -> StatusEvaluation:
    """Same thresholds as the Android app's `computeStatus` (`DiabetesDashboardManager.kt`).

    `status` stays language-independent (the UI colors off it); only `reason` follows the app
    language -- it is rendered verbatim under the traffic light, so a German sentence on an English
    dashboard is simply wrong."""
    red_reasons = []
    if m.severe_hypo_percent > 1.0:
        red_reasons.append(
            f"severe hypoglycemia ({m.severe_hypo_percent:.1f}% > 1%)" if is_en
            else f"schweren Unterzuckerungen ({m.severe_hypo_percent:.1f}% > 1%)"
        )
    if m.hypo_percent > 10.0:
        red_reasons.append(
            f"hypoglycemia more than 10% of the time ({m.hypo_percent:.1f}%)" if is_en
            else f"Unterzuckerungen über 10% der Zeit ({m.hypo_percent:.1f}%)"
        )
    if m.tir_percent < 50.0:
        red_reasons.append(
            f"Time in Range below 50% ({m.tir_percent:.1f}%)" if is_en
            else f"Time in Range unter 50% ({m.tir_percent:.1f}%)"
        )
    if red_reasons:
        joined = (" and " if is_en else " und ").join(red_reasons)
        return StatusEvaluation("RED", f"Status RED due to {joined}." if is_en else f"Status ROT aufgrund von {joined}.")

    yellow_reasons = []
    if 4.0 <= m.hypo_percent <= 10.0:
        yellow_reasons.append(
            f"an elevated share of hypoglycemia ({m.hypo_percent:.1f}%, range 4-10%)" if is_en
            else f"erhöhtem Unterzuckerungs-Anteil ({m.hypo_percent:.1f}%, Bereich 4-10%)"
        )
    if 50.0 <= m.tir_percent <= 70.0:
        yellow_reasons.append(
            f"Time in Range in the middle band ({m.tir_percent:.1f}%, 50-70%)" if is_en
            else f"Time in Range im mittleren Bereich ({m.tir_percent:.1f}%, 50-70%)"
        )
    if m.cv_percent > 36.0:
        yellow_reasons.append(
            f"elevated glucose variability (%CV = {m.cv_percent:.1f}%, > 36%)" if is_en
            else f"erhöhter Blutzucker-Variabilität (%CV = {m.cv_percent:.1f}%, > 36%)"
        )
    if yellow_reasons:
        joined = (" and " if is_en else " und ").join(yellow_reasons)
        tir_is_good = m.tir_percent > 70.0
        if is_en:
            suffix = f" despite a good Time in Range ({m.tir_percent:.1f}%)" if tir_is_good else ""
            return StatusEvaluation("YELLOW", f"Status YELLOW due to {joined}{suffix}.")
        suffix = f" trotz guter Time in Range ({m.tir_percent:.1f}%)" if tir_is_good else ""
        return StatusEvaluation("YELLOW", f"Status GELB aufgrund {joined}{suffix}.")

    return StatusEvaluation(
        "GREEN",
        "Status GREEN -- all values within the recommended target range." if is_en
        else "Status GRÜN -- alle Werte im empfohlenen Zielbereich.",
    )


# ---------------------------------------------------------------------------
# Data-gap detection (item 3, "Automatische Erkennung von Datenlücken")
# ---------------------------------------------------------------------------

@dataclass
class DataGap:
    start_millis: int
    end_millis: int


_DEFAULT_GAP_THRESHOLD_MINUTES = 60


def detect_gaps(
    entries: list[NightscoutEntry], from_millis: int, to_millis: int,
    gap_threshold_minutes: int = _DEFAULT_GAP_THRESHOLD_MINUTES,
) -> list[DataGap]:
    """Any stretch of the requested [from_millis, to_millis] window with no CGM reading at all,
    STRICTLY LONGER than gap_threshold_minutes (item 3's "fehlende CGM-Werte über MEHR ALS 1
    Stunde" -- a gap of exactly 60 minutes does not itself qualify) -- checked at the START of the
    window (from_millis to the first entry), BETWEEN every pair of consecutive entries, and the
    END of the window (last entry to to_millis), so a sensor that's currently offline is caught
    too, not just a gap strictly between two historical readings. TIR/avg/%CV etc. never need to
    "fill" these gaps -- compute_metrics already only ever aggregates the entries actually
    present, so excluding a gap from the statistics is already the default behavior, not something
    this function has to enforce itself."""
    threshold_millis = gap_threshold_minutes * 60 * 1000
    if not entries:
        return [DataGap(from_millis, to_millis)] if to_millis - from_millis > threshold_millis else []
    ordered = sorted(entries, key=lambda e: e.date_millis)
    gaps: list[DataGap] = []
    if ordered[0].date_millis - from_millis > threshold_millis:
        gaps.append(DataGap(from_millis, ordered[0].date_millis))
    for prev, curr in zip(ordered, ordered[1:]):
        if curr.date_millis - prev.date_millis > threshold_millis:
            gaps.append(DataGap(prev.date_millis, curr.date_millis))
    if to_millis - ordered[-1].date_millis > threshold_millis:
        gaps.append(DataGap(ordered[-1].date_millis, to_millis))
    return gaps


# Every user-facing "Auffälligkeit" line starts with this marker. Chat tool results carry these
# inline in their text (the model is instructed to repeat them verbatim, see prompts.py), and
# main.py::send_message scans tool output for exactly this prefix to lift them back out as
# structured notices for the UI -- so the marker must stay a single shared constant.
NOTICE_PREFIX = "⚠️ Hinweis:"
NOTICE_PREFIX_EN = "⚠️ Note:"
# Both, because a chat turn's tool results are scanned for these lines (see main.py's
# _extract_notices) and the language depends on the account that asked.
NOTICE_PREFIXES = (NOTICE_PREFIX, NOTICE_PREFIX_EN)


def format_gap_warning(source_name: str, gap: DataGap, is_en: bool = False) -> str:
    """Item 3's exact required warning wording -- one instance per detected gap. Both the chat
    tool output (tools.py) and the Übersicht/report path (main.py) call this so the wording never
    drifts between the two surfaces."""
    start = time.strftime("%d.%m.%Y %H:%M", time.localtime(gap.start_millis / 1000))
    end = time.strftime("%d.%m.%Y %H:%M", time.localtime(gap.end_millis / 1000))
    if is_en:
        return (
            f"{NOTICE_PREFIX_EN} Source {source_name} has no data between {start} and {end}. "
            "The analysis only takes the available data points into account."
        )
    return (
        f"{NOTICE_PREFIX} In der Quelle {source_name} fehlen Daten im Zeitraum von {start} bis {end}. "
        "Die Auswertung berücksichtigt ausschließlich die verfügbaren Datenpunkte."
    )


# ---------------------------------------------------------------------------
# Treatments (item 2: Bolus, Carbs/BE, Temp Basals, CAGE/SAGE)
# ---------------------------------------------------------------------------

def _iso(millis: int) -> str:
    return datetime.fromtimestamp(millis / 1000, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def _parse_iso_millis(text: str | None) -> int | None:
    if not text:
        return None
    cleaned = text.strip()
    if cleaned.endswith("Z"):
        cleaned = cleaned[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(cleaned)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp() * 1000)


@dataclass
class Treatment:
    date_millis: int
    event_type: str
    insulin_units: float | None = None
    carbs_grams: float | None = None
    # Temp basal duration/rate -- only meaningful for eventType == "Temp Basal".
    duration_minutes: float | None = None
    temp_basal_rate: float | None = None  # absolute U/h, if reported
    temp_basal_percent: float | None = None  # percent-of-profile-basal, if reported instead
    notes: str = ""


# Nightscout has no single canonical "site/sensor change" eventType across all uploader apps --
# these are the commonly observed spellings (AndroidAPS, xDrip+, care portal manual entries).
_CAGE_EVENT_TYPES = {"Site Change", "Cannula Change", "Insulin Cartridge Change"}
_SAGE_EVENT_TYPES = {"Sensor Change", "Sensor Start"}


async def fetch_treatments(base_url: str, auth_method: str, token: str, from_millis: int, to_millis: int) -> list[Treatment]:
    url = _join_url(base_url, "/api/v1/treatments.json")
    header = _auth_header(auth_method, token)
    headers = dict([header]) if header else {}
    params = {
        **_base_query_params(base_url),
        "find[created_at][$gte]": _iso(from_millis),
        "find[created_at][$lte]": _iso(to_millis),
        "count": 10_000,
    }
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(url, params=params, headers=headers)
    if resp.status_code >= 400:
        raise RuntimeError(f"Nightscout-API-Fehler: HTTP {resp.status_code}")
    raw = resp.json()
    treatments: list[Treatment] = []
    for item in raw if isinstance(raw, list) else []:
        date_millis = item.get("mills") or _parse_iso_millis(item.get("created_at") or item.get("timestamp"))
        if date_millis is None:
            continue
        treatments.append(Treatment(
            date_millis=int(date_millis),
            event_type=item.get("eventType") or "",
            insulin_units=_as_float_or_none(item.get("insulin")),
            carbs_grams=_as_float_or_none(item.get("carbs")),
            duration_minutes=_as_float_or_none(item.get("duration")),
            temp_basal_rate=_as_float_or_none(item.get("absolute") if item.get("absolute") is not None else item.get("rate")),
            temp_basal_percent=_as_float_or_none(item.get("percent")),
            notes=item.get("notes") or "",
        ))
    treatments.sort(key=lambda t: t.date_millis)
    return treatments


def _as_float_or_none(value: object) -> float | None:
    if value is None:
        return None
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def split_cage_sage_events(treatments: list[Treatment]) -> tuple[list[Treatment], list[Treatment]]:
    """(cannula/site changes, sensor changes) -- the two device-event subsets item 2 calls out
    explicitly ("Katheter- (CAGE) und Sensor-Wechseln (SAGE)"), pulled out of the same treatments
    list rather than a separate API call (Nightscout reports both as ordinary treatment entries)."""
    cage = [t for t in treatments if t.event_type in _CAGE_EVENT_TYPES]
    sage = [t for t in treatments if t.event_type in _SAGE_EVENT_TYPES]
    return cage, sage


# ---------------------------------------------------------------------------
# Profile (item 2: Basalprofil, ISF, ICR, BZ-Zielwerte, DIA)
# ---------------------------------------------------------------------------

@dataclass
class ProfileSegment:
    time: str  # "HH:MM", the segment's start-of-day clock time per Nightscout's own profile shape
    value: float


@dataclass
class TherapyProfile:
    name: str
    units: str  # "mg/dl" | "mmol"
    dia_hours: float | None
    basal_segments: list[ProfileSegment] = field(default_factory=list)
    isf_segments: list[ProfileSegment] = field(default_factory=list)  # "sens" in Nightscout's own schema
    icr_segments: list[ProfileSegment] = field(default_factory=list)  # "carbratio"
    target_low_segments: list[ProfileSegment] = field(default_factory=list)
    target_high_segments: list[ProfileSegment] = field(default_factory=list)


def _segments(profile_doc: dict, key: str) -> list[ProfileSegment]:
    raw = profile_doc.get(key)
    if not isinstance(raw, list):
        return []
    segments = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        value = _as_float_or_none(item.get("value"))
        if value is None:
            continue
        segments.append(ProfileSegment(str(item.get("time") or ""), value))
    return segments


async def fetch_active_profile(base_url: str, auth_method: str, token: str) -> TherapyProfile | None:
    """Nightscout's `/api/v1/profile.json` returns a list of profile documents, newest first --
    this reads only the newest one and, within it, the profile named by `defaultProfile` (the one
    actually driving the pump/loop right now), falling back to the first profile in `store` if
    `defaultProfile` is missing or stale. Returns None if no profile document exists at all."""
    url = _join_url(base_url, "/api/v1/profile.json")
    header = _auth_header(auth_method, token)
    headers = dict([header]) if header else {}
    params = {**_base_query_params(base_url), "count": 1}
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(url, params=params, headers=headers)
    if resp.status_code >= 400:
        raise RuntimeError(f"Nightscout-API-Fehler: HTTP {resp.status_code}")
    raw = resp.json()
    if not isinstance(raw, list) or not raw:
        return None
    doc = raw[0]
    store = doc.get("store") if isinstance(doc.get("store"), dict) else {}
    default_name = doc.get("defaultProfile")
    profile_doc = store.get(default_name) if default_name in store else (next(iter(store.values()), None) if store else None)
    if not isinstance(profile_doc, dict):
        return None
    return TherapyProfile(
        name=default_name or next(iter(store.keys()), ""),
        units=profile_doc.get("units") or "mg/dl",
        dia_hours=_as_float_or_none(profile_doc.get("dia")),
        basal_segments=_segments(profile_doc, "basal"),
        isf_segments=_segments(profile_doc, "sens"),
        icr_segments=_segments(profile_doc, "carbratio"),
        target_low_segments=_segments(profile_doc, "target_low"),
        target_high_segments=_segments(profile_doc, "target_high"),
    )


# ---------------------------------------------------------------------------
# Device status (item 2: IOB, COB, Loop-Status, Vorhersagen)
# ---------------------------------------------------------------------------

@dataclass
class DeviceStatusSnapshot:
    date_millis: int
    iob_units: float | None
    cob_grams: float | None
    loop_status: str | None
    predicted_bg_mgdl: list[float] | None


def _extract_device_status(doc: dict) -> DeviceStatusSnapshot | None:
    date_millis = _parse_iso_millis(doc.get("created_at")) or doc.get("mills")
    if date_millis is None:
        return None
    # AndroidAPS/OpenAPS report under "openaps"; iOS Loop reports under "loop" -- different
    # uploader apps, different (undocumented, informally-conventioned) shapes for the same idea.
    openaps = doc.get("openaps") if isinstance(doc.get("openaps"), dict) else None
    loop = doc.get("loop") if isinstance(doc.get("loop"), dict) else None
    iob_units = cob_grams = None
    loop_status: str | None = None
    predicted: list[float] | None = None
    if openaps:
        iob_field = openaps.get("iob")
        iob_doc = iob_field[0] if isinstance(iob_field, list) and iob_field else iob_field
        if isinstance(iob_doc, dict):
            iob_units = _as_float_or_none(iob_doc.get("iob"))
        suggested = openaps.get("suggested") if isinstance(openaps.get("suggested"), dict) else {}
        cob_grams = _as_float_or_none(suggested.get("COB"))
        loop_status = suggested.get("reason")
        pred_bgs = suggested.get("predBGs") if isinstance(suggested.get("predBGs"), dict) else {}
        for key in ("IOB", "COB", "UAM", "ZT"):
            if isinstance(pred_bgs.get(key), list):
                predicted = [float(v) for v in pred_bgs[key]]
                break
    elif loop:
        iob_doc = loop.get("iob") if isinstance(loop.get("iob"), dict) else {}
        iob_units = _as_float_or_none(iob_doc.get("iob"))
        cob_doc = loop.get("cob") if isinstance(loop.get("cob"), dict) else {}
        cob_grams = _as_float_or_none(cob_doc.get("cob"))
        enacted = loop.get("enacted") if isinstance(loop.get("enacted"), dict) else {}
        loop_status = enacted.get("reason") or loop.get("name")
        predicted_doc = loop.get("predicted") if isinstance(loop.get("predicted"), dict) else {}
        if isinstance(predicted_doc.get("values"), list):
            predicted = [float(v) for v in predicted_doc["values"]]
    return DeviceStatusSnapshot(int(date_millis), iob_units, cob_grams, loop_status, predicted)


async def fetch_latest_device_status(base_url: str, auth_method: str, token: str) -> DeviceStatusSnapshot | None:
    """Most recent devicestatus document only -- IOB/COB/Loop-Status are point-in-time snapshots
    (see item 2), not a time series, so there is never a reason to fetch more than the latest
    one. Returns None if no uploader has ever posted a devicestatus document, or the newest one
    reports neither an "openaps" nor a "loop" section (an uploader app this integration doesn't
    yet recognize)."""
    url = _join_url(base_url, "/api/v1/devicestatus.json")
    header = _auth_header(auth_method, token)
    headers = dict([header]) if header else {}
    params = {**_base_query_params(base_url), "count": 1}
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(url, params=params, headers=headers)
    if resp.status_code >= 400:
        raise RuntimeError(f"Nightscout-API-Fehler: HTTP {resp.status_code}")
    raw = resp.json()
    if not isinstance(raw, list) or not raw:
        return None
    return _extract_device_status(raw[0])
