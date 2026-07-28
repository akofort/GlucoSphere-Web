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
from dataclasses import dataclass
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


def compute_status(m: DashboardMetrics) -> StatusEvaluation:
    """Same thresholds as the Android app's `computeStatus` (`DiabetesDashboardManager.kt`)."""
    red_reasons = []
    if m.severe_hypo_percent > 1.0:
        red_reasons.append(f"schweren Unterzuckerungen ({m.severe_hypo_percent:.1f}% > 1%)")
    if m.hypo_percent > 10.0:
        red_reasons.append(f"Unterzuckerungen über 10% der Zeit ({m.hypo_percent:.1f}%)")
    if m.tir_percent < 50.0:
        red_reasons.append(f"Time in Range unter 50% ({m.tir_percent:.1f}%)")
    if red_reasons:
        return StatusEvaluation("RED", f"Status ROT aufgrund von {' und '.join(red_reasons)}.")

    yellow_reasons = []
    if 4.0 <= m.hypo_percent <= 10.0:
        yellow_reasons.append(f"erhöhtem Unterzuckerungs-Anteil ({m.hypo_percent:.1f}%, Bereich 4-10%)")
    if 50.0 <= m.tir_percent <= 70.0:
        yellow_reasons.append(f"Time in Range im mittleren Bereich ({m.tir_percent:.1f}%, 50-70%)")
    if m.cv_percent > 36.0:
        yellow_reasons.append(f"erhöhter Blutzucker-Variabilität (%CV = {m.cv_percent:.1f}%, > 36%)")
    if yellow_reasons:
        tir_is_good = m.tir_percent > 70.0
        suffix = f" trotz guter Time in Range ({m.tir_percent:.1f}%)" if tir_is_good else ""
        return StatusEvaluation("YELLOW", f"Status GELB aufgrund {' und '.join(yellow_reasons)}{suffix}.")

    return StatusEvaluation("GREEN", "Status GRÜN -- alle Werte im empfohlenen Zielbereich.")
