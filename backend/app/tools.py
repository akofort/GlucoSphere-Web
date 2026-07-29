"""Unifies the built-in Nightscout direct-API tool and every enabled MCP server's tools into one
flat list the chat tool-calling loop (see `main.py::send_message`) can hand to any provider,
regardless of where a given tool actually comes from -- mirrors the Android app's own
`nightscoutDirectServer()`/`allDataSourceServers` idea (`NightscoutDirectApi.kt`) of treating the
direct API as "just another server" from the rest of the app's point of view.
"""
from __future__ import annotations

import time
from typing import Any

from . import db, dexcom_share, feelfit, glooko, google_health, librelinkup, mcp_client, nightscout, oauth

NIGHTSCOUT_TOOL_NAME = "get_glucose_entries"
FEELFIT_TOOL_NAME = "get_body_composition_history"
GOOGLE_HEALTH_TOOL_NAME = "get_google_health_blood_glucose"
GOOGLE_HEALTH_SLEEP_TOOL_NAME = "get_google_health_sleep"
GOOGLE_HEALTH_STEPS_TOOL_NAME = "get_google_health_steps"
GOOGLE_HEALTH_HEART_RATE_TOOL_NAME = "get_google_health_heart_rate"
GOOGLE_HEALTH_RESTING_HEART_RATE_TOOL_NAME = "get_google_health_resting_heart_rate"
GOOGLE_HEALTH_HRV_TOOL_NAME = "get_google_health_hrv"
DEXCOM_TOOL_NAME = "get_dexcom_glucose_entries"
LIBRELINKUP_TOOL_NAME = "get_librelinkup_glucose_entries"
GLOOKO_TOOL_NAME = "get_insulin_pump_data"

_NIGHTSCOUT_SCHEMA = {
    "type": "object",
    "properties": {
        "fromEpochMillis": {"type": "integer", "description": "Start des Zeitraums als Unix-Zeitstempel in Millisekunden"},
        "toEpochMillis": {"type": "integer", "description": "Ende des Zeitraums als Unix-Zeitstempel in Millisekunden"},
    },
    "required": ["fromEpochMillis", "toEpochMillis"],
}

_FEELFIT_SCHEMA = {"type": "object", "properties": {}}

_GOOGLE_HEALTH_SCHEMA = {
    "type": "object",
    "properties": {
        "fromEpochMillis": {"type": "integer", "description": "Start des Zeitraums als Unix-Zeitstempel in Millisekunden"},
        "toEpochMillis": {"type": "integer", "description": "Ende des Zeitraums als Unix-Zeitstempel in Millisekunden"},
    },
    "required": ["fromEpochMillis", "toEpochMillis"],
}


async def list_available_tools(settings: dict, mcp_servers: list[dict]) -> list[dict]:
    """Returns tool schemas ({"name", "description", "inputSchema"}) ready to hand to
    `llm_providers.chat(tools=...)`. MCP servers are queried live (`tools/list`) each call --
    acceptable for a handful of enabled servers and a few chat turns per session; a server that
    fails to answer is skipped rather than failing the whole list (see `_safe_list_tools`)."""
    tools: list[dict] = []
    if settings.get("nightscoutApiUrl") and settings.get("nightscoutApiEnabled", True):
        tools.append({
            "name": NIGHTSCOUT_TOOL_NAME,
            "description": "Ruft rohe Blutzucker-Sensorwerte (sgv in mg/dL, Zeitstempel, Trendrichtung) direkt "
                           "per Nightscout REST-API für einen Zeitraum ab.",
            "inputSchema": _NIGHTSCOUT_SCHEMA,
            "_source": "nightscout",
        })
    if settings.get("feelfitEmail") and settings.get("feelfitEnabled", True):
        tools.append({
            "name": FEELFIT_TOOL_NAME,
            "description": "Ruft die Körperzusammensetzungs-Messhistorie (Gewicht, Körperfett, BMI, Muskel-/"
                           "Knochenmasse, Wasseranteil, viszerales Fett, Grundumsatz) von der FeelFit-Körperwaage ab.",
            "inputSchema": _FEELFIT_SCHEMA,
            "_source": "feelfit",
        })
    if settings.get("googleHealthAccessToken") or settings.get("googleHealthRefreshToken"):
        if settings.get("googleHealthEnabled", True):
            tools.append({
                "name": GOOGLE_HEALTH_TOOL_NAME,
                "description": "Ruft Blutzucker-Messungen (mg/dL, Zeitstempel) über die Google Health API für einen "
                               "Zeitraum ab -- z. B. von einem verbundenen CGM/BZ-Messgerät, das mit Google Health synchronisiert.",
                "inputSchema": _GOOGLE_HEALTH_SCHEMA,
                "_source": "google_health",
            })
            tools.append({
                "name": GOOGLE_HEALTH_SLEEP_TOOL_NAME,
                "description": "Ruft Schlafsitzungen (Ein-/Ausschlafzeit, Schlafdauer, Wachzeit, Einschlafdauer) über "
                               "die Google Health API für einen Zeitraum ab -- z. B. von einem verbundenen Schlaftracker, "
                               "der mit Google Health synchronisiert. WICHTIG: Sitzungen werden nach ihrer ENDZEIT "
                               "gefiltert, die oft erst nach Mitternacht liegt -- um 'letzte Nacht' vollständig zu "
                               "erfassen, muss toEpochMillis bis in den aktuellen Vormittag reichen (nicht nur bis "
                               "Mitternacht), sonst wird die Sitzung fälschlich als 'keine Daten' gemeldet.",
                "inputSchema": _GOOGLE_HEALTH_SCHEMA,
                "_source": "google_health",
            })
            tools.append({
                "name": GOOGLE_HEALTH_STEPS_TOOL_NAME,
                "description": "Ruft die Schrittzahl über die Google Health API für einen Zeitraum ab (einzelne "
                               "Zeitintervalle mit jeweiliger Schrittzahl) -- z. B. von einer verbundenen Smartwatch.",
                "inputSchema": _GOOGLE_HEALTH_SCHEMA,
                "_source": "google_health",
            })
            tools.append({
                "name": GOOGLE_HEALTH_HEART_RATE_TOOL_NAME,
                "description": "Ruft rohe Pulsmessungen (Schläge pro Minute, Zeitstempel) über die Google Health API "
                               "für einen Zeitraum ab -- z. B. von einer verbundenen Smartwatch.",
                "inputSchema": _GOOGLE_HEALTH_SCHEMA,
                "_source": "google_health",
            })
            tools.append({
                "name": GOOGLE_HEALTH_RESTING_HEART_RATE_TOOL_NAME,
                "description": "Ruft den täglichen Ruhepuls (Schläge pro Minute pro Tag) über die Google Health API "
                               "für einen Zeitraum ab -- eignet sich besser für einen Trend über mehrere Tage als "
                               "die rohen Pulsmessungen.",
                "inputSchema": _GOOGLE_HEALTH_SCHEMA,
                "_source": "google_health",
            })
            tools.append({
                "name": GOOGLE_HEALTH_HRV_TOOL_NAME,
                "description": "Ruft die tägliche Herzfrequenzvariabilität (HRV, durchschnittlicher RMSSD-Wert in "
                               "Millisekunden pro Tag -- höher gilt allgemein als besser erholt) über die Google "
                               "Health API für einen Zeitraum ab. HINWEIS: Google Health hat keinen eigenen "
                               "'Tagesform'/Readiness-Score -- HRV und Ruhepuls sind die nächstliegenden echten Werte "
                               "dafür, aber kein offizieller kombinierter Score.",
                "inputSchema": _GOOGLE_HEALTH_SCHEMA,
                "_source": "google_health",
            })
    if settings.get("dexcomUsername") and settings.get("dexcomEnabled", True):
        tools.append({
            "name": DEXCOM_TOOL_NAME,
            "description": "Ruft aktuelle Blutzucker-Sensorwerte (mg/dL, Zeitstempel, Trendrichtung) über die "
                           "Dexcom-Share-API ab -- liefert nur die letzten bis zu 24 Stunden, keine älteren Daten.",
            "inputSchema": _FEELFIT_SCHEMA,
            "_source": "dexcom",
        })
    if settings.get("libreEmail") and settings.get("libreEnabled", True):
        tools.append({
            "name": LIBRELINKUP_TOOL_NAME,
            "description": "Ruft aktuelle Blutzucker-Sensorwerte (mg/dL, Zeitstempel) über LibreLinkUp (FreeStyle "
                           "Libre) ab -- liefert nur die letzten ca. 12 Stunden, keine älteren Daten.",
            "inputSchema": _FEELFIT_SCHEMA,
            "_source": "librelinkup",
        })
    if settings.get("glookoUsername") and settings.get("glookoEnabled", True):
        tools.append({
            "name": GLOOKO_TOOL_NAME,
            "description": "Ruft allgemeine Insulinpumpen-Daten (Bolusgaben mit Zeitpunkt/Einheiten, tägliche "
                           "Basal-/Bolus-/Gesamt-Insulinmenge) für einen Zeitraum ab -- herstellerunabhängig, "
                           "unabhängig vom konkreten Pumpenmodell.",
            "inputSchema": _GOOGLE_HEALTH_SCHEMA,
            "_source": "glooko",
        })
    for server in mcp_servers:
        if not server.get("enabled"):
            continue
        for tool in await _safe_list_tools(server):
            tools.append({
                "name": tool.name,
                "description": tool.description,
                "inputSchema": tool.input_schema,
                "_source": server["id"],
            })
    return tools


async def resolve_server_auth(server: dict, force_refresh: bool = False) -> dict:
    """OAuth2 servers store a client id/secret/endpoints, not a manually entered token --
    resolves (refreshing if needed) a current access token and returns a server dict shaped like
    a plain BEARER_TOKEN server, so mcp_client.py never needs to know OAuth2 exists.

    `force_refresh` bypasses the cached-expiry check (see oauth.get_valid_access_token) -- used
    by the retry-on-401 helpers below, since a provider can invalidate a token well before the
    locally cached expiry (observed live with Withings)."""
    if server.get("authMethod") != "OAUTH2":
        return server
    token = await oauth.get_valid_access_token(server["id"], force_refresh=force_refresh)
    return {**server, "authMethod": "BEARER_TOKEN", "token": token}


def _is_auth_error(exc: Exception) -> bool:
    return isinstance(exc, mcp_client.McpClientError) and exc.status_code == 401


async def _safe_list_tools(server: dict) -> list[mcp_client.McpTool]:
    try:
        resolved = await resolve_server_auth(server)
        return await mcp_client.list_tools(resolved)
    except Exception as exc:  # noqa: BLE001 -- one unreachable/unauthenticated server must not break the whole tool list
        if server.get("authMethod") == "OAUTH2" and _is_auth_error(exc):
            # The cached token looked valid (expiry not yet reached) but the provider rejected it
            # anyway -- force a real refresh and retry once before giving up.
            try:
                resolved = await resolve_server_auth(server, force_refresh=True)
                return await mcp_client.list_tools(resolved)
            except Exception:  # noqa: BLE001
                return []
        return []


async def execute_tool(name: str, arguments: dict[str, Any], settings: dict, mcp_servers: list[dict]) -> str:
    """Never raises -- a failed tool call (server down, network blip, ...) is fed back to the
    model as an error-flavored tool result instead of crashing the whole chat request. The model
    can then tell the user what happened instead of the request 500ing (observed live: a
    transient MCP connection failure here previously took the entire /messages endpoint down)."""
    if name == NIGHTSCOUT_TOOL_NAME:
        return await _execute_nightscout(arguments, settings)
    if name == FEELFIT_TOOL_NAME:
        return await _execute_feelfit(settings)
    if name == GOOGLE_HEALTH_TOOL_NAME:
        return await _execute_google_health(arguments, settings)
    if name == GOOGLE_HEALTH_SLEEP_TOOL_NAME:
        return await _execute_google_health_sleep(arguments, settings)
    if name == GOOGLE_HEALTH_STEPS_TOOL_NAME:
        return await _execute_google_health_steps(arguments, settings)
    if name == GOOGLE_HEALTH_HEART_RATE_TOOL_NAME:
        return await _execute_google_health_heart_rate(arguments, settings)
    if name == GOOGLE_HEALTH_RESTING_HEART_RATE_TOOL_NAME:
        return await _execute_google_health_resting_heart_rate(arguments, settings)
    if name == GOOGLE_HEALTH_HRV_TOOL_NAME:
        return await _execute_google_health_hrv(arguments, settings)
    if name == DEXCOM_TOOL_NAME:
        return await _execute_dexcom(settings)
    if name == LIBRELINKUP_TOOL_NAME:
        return await _execute_librelinkup(settings)
    if name == GLOOKO_TOOL_NAME:
        return await _execute_glooko(arguments, settings)
    try:
        for server in mcp_servers:
            if not server.get("enabled"):
                continue
            tools = await _safe_list_tools(server)
            if any(t.name == name for t in tools):
                resolved = await resolve_server_auth(server)
                try:
                    return await mcp_client.call_tool(resolved, name, arguments)
                except Exception as exc:  # noqa: BLE001
                    if server.get("authMethod") != "OAUTH2" or not _is_auth_error(exc):
                        raise
                    # Same stale-cached-expiry case as _safe_list_tools -- force a refresh and
                    # retry the actual tool call once before surfacing the failure.
                    resolved = await resolve_server_auth(server, force_refresh=True)
                    return await mcp_client.call_tool(resolved, name, arguments)
        return f"Fehler: Tool '{name}' wurde bei keinem aktiven Server gefunden."
    except Exception as exc:  # noqa: BLE001 -- see docstring
        return f"Fehler beim Aufruf von '{name}': {exc}"


async def _execute_nightscout(arguments: dict[str, Any], settings: dict) -> str:
    now = int(time.time() * 1000)
    from_millis = int(arguments.get("fromEpochMillis") or now - 24 * 60 * 60 * 1000)
    to_millis = int(arguments.get("toEpochMillis") or now)
    try:
        entries = await nightscout.fetch_entries(
            settings["nightscoutApiUrl"], settings["nightscoutApiAuthMethod"], settings["nightscoutApiSecret"],
            from_millis, to_millis,
        )
    except Exception as exc:  # noqa: BLE001
        return f"Fehler beim Abruf der Nightscout-Daten: {exc}"
    if not entries:
        return "Keine Blutzucker-Werte im angefragten Zeitraum gefunden."
    lines = [
        f"{time.strftime('%d.%m. %H:%M', time.localtime(e.date_millis / 1000))}: {e.sgv_mg_dl:.0f} mg/dL ({nightscout.trend_arrow_for(e.direction)})"
        for e in sorted(entries, key=lambda e: e.date_millis)
    ]
    return "\n".join(lines)


async def _execute_feelfit(settings: dict) -> str:
    try:
        measurements = await feelfit.fetch_measurements(settings["feelfitEmail"], settings["feelfitPassword"])
    except Exception as exc:  # noqa: BLE001
        return f"Fehler beim Abruf der FeelFit-Daten: {exc}"
    if not measurements:
        return "Keine Körperzusammensetzungs-Messungen gefunden."
    lines = []
    for m in measurements:
        date = time.strftime("%d.%m.%Y %H:%M", time.localtime(m.date_millis / 1000))
        parts = [date]
        if m.weight_kg is not None:
            parts.append(f"Gewicht {m.weight_kg:.1f} kg")
        if m.body_fat_percent is not None:
            parts.append(f"Körperfett {m.body_fat_percent:.1f}%")
        if m.bmi is not None:
            parts.append(f"BMI {m.bmi:.1f}")
        if m.muscle_kg is not None:
            parts.append(f"Muskelmasse {m.muscle_kg:.1f} kg")
        if m.water_percent is not None:
            parts.append(f"Wasser {m.water_percent:.1f}%")
        if m.visceral_fat is not None:
            parts.append(f"viszerales Fett {m.visceral_fat:.0f}")
        if m.bmr_kcal is not None:
            parts.append(f"Grundumsatz {m.bmr_kcal:.0f} kcal")
        lines.append(f"{parts[0]}: {', '.join(parts[1:])}" if len(parts) > 1 else parts[0])
    return "\n".join(lines)


def _save_google_health_tokens(access_token: str, refresh_token: str, expires_at: int) -> None:
    db.save_settings({
        "googleHealthAccessToken": access_token,
        "googleHealthRefreshToken": refresh_token,
        "googleHealthExpiresAt": expires_at,
    })


async def _execute_google_health(arguments: dict[str, Any], settings: dict) -> str:
    now = int(time.time() * 1000)
    from_millis = int(arguments.get("fromEpochMillis") or now - 24 * 60 * 60 * 1000)
    to_millis = int(arguments.get("toEpochMillis") or now)
    try:
        access_token = await google_health.get_valid_access_token(settings, _save_google_health_tokens)
        readings = await google_health.fetch_blood_glucose(access_token, from_millis, to_millis)
    except Exception as exc:  # noqa: BLE001
        return f"Fehler beim Abruf der Google-Health-Daten: {exc}"
    if not readings:
        return "Keine Blutzucker-Werte im angefragten Zeitraum gefunden."
    lines = [
        f"{time.strftime('%d.%m. %H:%M', time.localtime(r.date_millis / 1000))}: {r.mg_dl:.0f} mg/dL"
        for r in readings
    ]
    return "\n".join(lines)


async def _execute_google_health_sleep(arguments: dict[str, Any], settings: dict) -> str:
    now = int(time.time() * 1000)
    from_millis = int(arguments.get("fromEpochMillis") or now - 7 * 24 * 60 * 60 * 1000)
    to_millis = int(arguments.get("toEpochMillis") or now)
    try:
        access_token = await google_health.get_valid_access_token(settings, _save_google_health_tokens)
        sessions = await google_health.fetch_sleep(access_token, from_millis, to_millis)
    except Exception as exc:  # noqa: BLE001
        return f"Fehler beim Abruf der Google-Health-Schlafdaten: {exc}"
    if not sessions:
        return "Keine Schlafsitzungen im angefragten Zeitraum gefunden."
    lines = []
    for s in sessions:
        start = time.strftime("%d.%m. %H:%M", time.localtime(s.start_millis / 1000))
        end = time.strftime("%d.%m. %H:%M", time.localtime(s.end_millis / 1000))
        parts = [f"{start} - {end}"]
        if s.minutes_asleep is not None:
            parts.append(f"Schlafdauer {s.minutes_asleep // 60}h {s.minutes_asleep % 60}min")
        if s.minutes_awake is not None:
            parts.append(f"wach {s.minutes_awake} min")
        if s.minutes_to_fall_asleep is not None:
            parts.append(f"Einschlafzeit {s.minutes_to_fall_asleep} min")
        lines.append(": ".join([parts[0], ", ".join(parts[1:])]) if len(parts) > 1 else parts[0])
    return "\n".join(lines)


async def _execute_google_health_steps(arguments: dict[str, Any], settings: dict) -> str:
    now = int(time.time() * 1000)
    from_millis = int(arguments.get("fromEpochMillis") or now - 24 * 60 * 60 * 1000)
    to_millis = int(arguments.get("toEpochMillis") or now)
    try:
        access_token = await google_health.get_valid_access_token(settings, _save_google_health_tokens)
        intervals = await google_health.fetch_steps(access_token, from_millis, to_millis)
    except Exception as exc:  # noqa: BLE001
        return f"Fehler beim Abruf der Google-Health-Schrittdaten: {exc}"
    if not intervals:
        return "Keine Schrittdaten im angefragten Zeitraum gefunden."
    total = sum(i.count for i in intervals)
    lines = [f"Gesamt im Zeitraum: {total} Schritte"]
    for i in intervals:
        start = time.strftime("%d.%m. %H:%M", time.localtime(i.start_millis / 1000))
        end = time.strftime("%H:%M", time.localtime(i.end_millis / 1000))
        lines.append(f"{start} - {end}: {i.count} Schritte")
    return "\n".join(lines)


async def _execute_google_health_heart_rate(arguments: dict[str, Any], settings: dict) -> str:
    now = int(time.time() * 1000)
    from_millis = int(arguments.get("fromEpochMillis") or now - 24 * 60 * 60 * 1000)
    to_millis = int(arguments.get("toEpochMillis") or now)
    try:
        access_token = await google_health.get_valid_access_token(settings, _save_google_health_tokens)
        readings = await google_health.fetch_heart_rate(access_token, from_millis, to_millis)
    except Exception as exc:  # noqa: BLE001
        return f"Fehler beim Abruf der Google-Health-Pulsdaten: {exc}"
    if not readings:
        return "Keine Pulsmessungen im angefragten Zeitraum gefunden."
    # A wearable samples every few seconds -- a raw line per reading would be thousands of lines
    # for even a single day (observed: 10000+ in 24h), far too much to hand an LLM. Aggregate into
    # hourly min/avg/max buckets instead, like a Garmin/Fitbit heart-rate-over-time chart would show.
    bpms = [r.bpm for r in readings]
    lines = [
        f"Gesamt im Zeitraum ({len(readings)} Messungen): "
        f"min {min(bpms)}, ø {sum(bpms) / len(bpms):.0f}, max {max(bpms)} bpm"
    ]
    buckets: dict[str, list[int]] = {}
    for r in readings:
        hour_key = time.strftime("%d.%m. %Hh", time.localtime(r.date_millis / 1000))
        buckets.setdefault(hour_key, []).append(r.bpm)
    for hour_key, values in buckets.items():
        lines.append(f"{hour_key}: min {min(values)}, ø {sum(values) / len(values):.0f}, max {max(values)} bpm")
    return "\n".join(lines)


async def _execute_google_health_resting_heart_rate(arguments: dict[str, Any], settings: dict) -> str:
    now = int(time.time() * 1000)
    from_millis = int(arguments.get("fromEpochMillis") or now - 14 * 24 * 60 * 60 * 1000)
    to_millis = int(arguments.get("toEpochMillis") or now)
    try:
        access_token = await google_health.get_valid_access_token(settings, _save_google_health_tokens)
        readings = await google_health.fetch_resting_heart_rate(access_token, from_millis, to_millis)
    except Exception as exc:  # noqa: BLE001
        return f"Fehler beim Abruf des Google-Health-Ruhepulses: {exc}"
    if not readings:
        return "Keine Ruhepuls-Werte im angefragten Zeitraum gefunden."
    lines = [
        f"{time.strftime('%d.%m.%Y', time.gmtime(r.date_millis / 1000))}: {r.bpm} bpm (Ruhepuls)"
        for r in readings
    ]
    return "\n".join(lines)


async def _execute_google_health_hrv(arguments: dict[str, Any], settings: dict) -> str:
    now = int(time.time() * 1000)
    from_millis = int(arguments.get("fromEpochMillis") or now - 14 * 24 * 60 * 60 * 1000)
    to_millis = int(arguments.get("toEpochMillis") or now)
    try:
        access_token = await google_health.get_valid_access_token(settings, _save_google_health_tokens)
        readings = await google_health.fetch_daily_hrv(access_token, from_millis, to_millis)
    except Exception as exc:  # noqa: BLE001
        return f"Fehler beim Abruf der Google-Health-HRV-Daten: {exc}"
    if not readings:
        return "Keine HRV-Werte im angefragten Zeitraum gefunden."
    lines = []
    for r in readings:
        date = time.strftime("%d.%m.%Y", time.gmtime(r.date_millis / 1000))
        if r.average_hrv_milliseconds is not None:
            lines.append(f"{date}: HRV {r.average_hrv_milliseconds:.1f} ms")
        else:
            lines.append(f"{date}: HRV-Wert ohne Durchschnitt gemeldet")
    return "\n".join(lines)


async def _execute_dexcom(settings: dict) -> str:
    try:
        readings = await dexcom_share.fetch_readings(
            settings["dexcomUsername"], settings["dexcomPassword"], settings.get("dexcomRegion", "US"),
        )
    except Exception as exc:  # noqa: BLE001
        return f"Fehler beim Abruf der Dexcom-Daten: {exc}"
    if not readings:
        return "Keine Blutzucker-Werte gefunden."
    lines = [
        f"{time.strftime('%d.%m. %H:%M', time.localtime(r.date_millis / 1000))}: {r.mg_dl:.0f} mg/dL ({dexcom_share.trend_arrow_for(r.trend)})"
        for r in readings
    ]
    return "\n".join(lines)


async def _execute_librelinkup(settings: dict) -> str:
    try:
        readings = await librelinkup.fetch_readings(
            settings["libreEmail"], settings["librePassword"], settings.get("libreRegion", "US"),
        )
    except Exception as exc:  # noqa: BLE001
        return f"Fehler beim Abruf der LibreLinkUp-Daten: {exc}"
    if not readings:
        return "Keine Blutzucker-Werte gefunden."
    lines = [
        f"{time.strftime('%d.%m. %H:%M', time.localtime(r.date_millis / 1000))}: {r.mg_dl:.0f} mg/dL"
        for r in readings
    ]
    return "\n".join(lines)


async def _execute_glooko(arguments: dict[str, Any], settings: dict) -> str:
    now = int(time.time() * 1000)
    from_millis = int(arguments.get("fromEpochMillis") or now - 7 * 24 * 60 * 60 * 1000)
    to_millis = int(arguments.get("toEpochMillis") or now)
    try:
        boluses, daily = await glooko.fetch_pump_data(settings["glookoUsername"], settings["glookoPassword"], from_millis, to_millis)
    except Exception as exc:  # noqa: BLE001
        return f"Fehler beim Abruf der Insulinpumpen-Daten: {exc}"
    if not boluses and not daily:
        return "Keine Insulinpumpen-Daten im angefragten Zeitraum gefunden."
    lines = []
    if daily:
        lines.append("Tägliche Insulinmenge:")
        for d in daily:
            date = time.strftime("%d.%m.%Y", time.gmtime(d.date_millis / 1000))
            parts = [date]
            if d.basal_units is not None:
                parts.append(f"Basal {d.basal_units:.1f} E")
            if d.bolus_units is not None:
                parts.append(f"Bolus {d.bolus_units:.1f} E")
            if d.total_units is not None:
                parts.append(f"gesamt {d.total_units:.1f} E")
            lines.append(f"{parts[0]}: {', '.join(parts[1:])}" if len(parts) > 1 else parts[0])
    if boluses:
        lines.append("Bolusgaben:")
        for b in boluses:
            when = time.strftime("%d.%m. %H:%M", time.localtime(b.date_millis / 1000))
            parts = [when]
            if b.delivered_units is not None:
                parts.append(f"{b.delivered_units:.2f} E")
            if b.carbs_g is not None and b.carbs_g > 0:
                parts.append(f"{b.carbs_g:.0f} g KH")
            parts.append("manuell" if b.is_manual else "automatisch/algorithmisch")
            lines.append(": ".join([parts[0], ", ".join(parts[1:])]))
    return "\n".join(lines)
