"""Unifies the built-in Nightscout direct-API tool and every enabled MCP server's tools into one
flat list the chat tool-calling loop (see `main.py::send_message`) can hand to any provider,
regardless of where a given tool actually comes from -- mirrors the Android app's own
`nightscoutDirectServer()`/`allDataSourceServers` idea (`NightscoutDirectApi.kt`) of treating the
direct API as "just another server" from the rest of the app's point of view.
"""
from __future__ import annotations

import json
import time
from typing import Any

from . import db, dexcom_share, feelfit, glooko, google_health, librelinkup, mcp_client, nightscout, oauth, withings

NIGHTSCOUT_TOOL_NAME = "get_glucose_entries"
NIGHTSCOUT_TREATMENTS_TOOL_NAME = "get_nightscout_treatments"
NIGHTSCOUT_PROFILE_TOOL_NAME = "get_nightscout_profile"
NIGHTSCOUT_DEVICESTATUS_TOOL_NAME = "get_nightscout_devicestatus"
FEELFIT_TOOL_NAME = "get_body_composition_history"
WITHINGS_TOOL_NAME = "get_withings_body_composition"
GOOGLE_HEALTH_TOOL_NAME = "get_google_health_blood_glucose"
GOOGLE_HEALTH_SLEEP_TOOL_NAME = "get_google_health_sleep"
GOOGLE_HEALTH_STEPS_TOOL_NAME = "get_google_health_steps"
GOOGLE_HEALTH_HEART_RATE_TOOL_NAME = "get_google_health_heart_rate"
GOOGLE_HEALTH_RESTING_HEART_RATE_TOOL_NAME = "get_google_health_resting_heart_rate"
GOOGLE_HEALTH_HRV_TOOL_NAME = "get_google_health_hrv"
DEXCOM_TOOL_NAME = "get_dexcom_glucose_entries"
LIBRELINKUP_TOOL_NAME = "get_librelinkup_glucose_entries"
# Insulin pump ("Glooko") tools -- names match the reference implementation
# (rilhia/omni-endo-ai-mcp) this was ported from, one tool per distinct analysis.
GLOOKO_SUMMARY_TOOL_NAME = "get_diabetes_summary"
GLOOKO_TREND_TOOL_NAME = "get_trend"
GLOOKO_GLUCOSE_TOOL_NAME = "get_glucose"
GLOOKO_CHART_SERIES_TOOL_NAME = "get_chart_series"
GLOOKO_BOLUS_LOG_TOOL_NAME = "get_enriched_bolus_log"
GLOOKO_HOURLY_TRENDS_TOOL_NAME = "get_hourly_trends"
GLOOKO_BASAL_DELIVERY_TOOL_NAME = "get_basal_delivery"
GLOOKO_DAILY_INSULIN_TOOL_NAME = "get_daily_insulin"
GLOOKO_SETTINGS_HISTORY_TOOL_NAME = "get_settings_history"
GLOOKO_DEVICE_EVENTS_TOOL_NAME = "get_device_events"
GLOOKO_MEAL_WINDOW_TOOL_NAME = "get_meal_window_analysis"

_NIGHTSCOUT_SCHEMA = {
    "type": "object",
    "properties": {
        "fromEpochMillis": {"type": "integer", "description": "Start des Zeitraums als Unix-Zeitstempel in Millisekunden"},
        "toEpochMillis": {"type": "integer", "description": "Ende des Zeitraums als Unix-Zeitstempel in Millisekunden"},
    },
    "required": ["fromEpochMillis", "toEpochMillis"],
}

_FEELFIT_SCHEMA = {"type": "object", "properties": {}}
_WITHINGS_SCHEMA = {"type": "object", "properties": {}}
_NIGHTSCOUT_TREATMENTS_SCHEMA = _NIGHTSCOUT_SCHEMA
_NIGHTSCOUT_PROFILE_SCHEMA = {"type": "object", "properties": {}}
_NIGHTSCOUT_DEVICESTATUS_SCHEMA = {"type": "object", "properties": {}}

_GOOGLE_HEALTH_SCHEMA = {
    "type": "object",
    "properties": {
        "fromEpochMillis": {"type": "integer", "description": "Start des Zeitraums als Unix-Zeitstempel in Millisekunden"},
        "toEpochMillis": {"type": "integer", "description": "Ende des Zeitraums als Unix-Zeitstempel in Millisekunden"},
    },
    "required": ["fromEpochMillis", "toEpochMillis"],
}

_GLOOKO_WINDOW_PROPS = {
    "fromEpochMillis": {"type": "integer", "description": "Start des Zeitraums als Unix-Zeitstempel in Millisekunden"},
    "toEpochMillis": {"type": "integer", "description": "Ende des Zeitraums als Unix-Zeitstempel in Millisekunden"},
}
_GLOOKO_WINDOW_SCHEMA_REF = {
    "type": "object", "properties": _GLOOKO_WINDOW_PROPS, "required": ["fromEpochMillis", "toEpochMillis"],
}
_GLOOKO_THRESHOLD_PROPS = {
    "lowerMgDl": {"type": "number", "description": "Optional. Untere (Hypo-)Grenze in mg/dL für Time-in-Range-Berechnungen. Standard: 70."},
    "upperMgDl": {"type": "number", "description": "Optional. Obere (Hyper-)Grenze in mg/dL für Time-in-Range-Berechnungen. Standard: 180."},
}
_GLOOKO_SUMMARY_SCHEMA = {
    "type": "object",
    "properties": {**_GLOOKO_WINDOW_PROPS, **_GLOOKO_THRESHOLD_PROPS},
    "required": ["fromEpochMillis", "toEpochMillis"],
}
_GLOOKO_TREND_SCHEMA = {
    "type": "object",
    "properties": {
        **_GLOOKO_WINDOW_PROPS,
        "mode": {"type": "string", "enum": ["calendar", "fixed"], "description": "Optional (Standard: calendar). \"calendar\" bucketet nach echten Kalendereinheiten (Tag/Woche/Monat/Quartal), \"fixed\" nach gleich langen Abschnitten ab fromEpochMillis."},
        "granularity": {"type": "string", "enum": ["day", "week", "month", "quarter"], "description": "Optional (Standard: month). Bucket-Größe bei mode=calendar."},
        "fixedSizeDays": {"type": "integer", "description": "Optional (Standard: 7). Länge jedes Buckets in Tagen bei mode=fixed."},
        **_GLOOKO_THRESHOLD_PROPS,
    },
    "required": ["fromEpochMillis", "toEpochMillis"],
}
_GLOOKO_GLUCOSE_SCHEMA = {
    "type": "object",
    "properties": {
        **_GLOOKO_WINDOW_PROPS,
        "band": {"type": "string", "enum": ["low", "high", "target", "all"], "description": "Optional (Standard: all). Welche Messwerte zurückgegeben werden: \"low\" (unter der unteren Grenze, Hypo), \"high\" (über der oberen Grenze, Hyper), \"target\" (im Zielbereich), \"all\" (alle, jeweils mit Bereichs-Tag)."},
        **_GLOOKO_THRESHOLD_PROPS,
    },
    "required": ["fromEpochMillis", "toEpochMillis"],
}
_GLOOKO_CHART_SERIES_SCHEMA = {
    "type": "object",
    "properties": {
        **_GLOOKO_WINDOW_PROPS,
        "maxPoints": {"type": "integer", "description": "Optional (Standard: 250, Bereich 20-1000). Ziel-Anzahl der Punkte für ein Diagramm -- deutlich günstiger als get_glucose für breite Zeiträume, da nicht mehr Punkte zurückgegeben werden als ein Chart ohnehin darstellen kann."},
    },
    "required": ["fromEpochMillis", "toEpochMillis"],
}
_GLOOKO_BOLUS_LOG_SCHEMA = {
    "type": "object",
    "properties": {
        **_GLOOKO_WINDOW_PROPS,
        "classes": {
            "type": "array", "items": {"type": "string", "enum": ["Meal Bolus", "Manual Correction Bolus", "System Correction Bolus", "Meal With Correction Bolus"]},
            "description": "Optional. Filter auf bestimmte Bolus-Klassen, z. B. um nur Korrekturboli zu sehen. Weglassen für alle.",
        },
    },
    "required": ["fromEpochMillis", "toEpochMillis"],
}
_GLOOKO_HOURLY_SCHEMA = {
    "type": "object",
    "properties": {**_GLOOKO_WINDOW_PROPS, **_GLOOKO_THRESHOLD_PROPS},
    "required": ["fromEpochMillis", "toEpochMillis"],
}
_GLOOKO_BASAL_DELIVERY_SCHEMA = {
    "type": "object",
    "properties": {
        **_GLOOKO_WINDOW_PROPS,
        "includeIntervals": {"type": "boolean", "description": "Optional (Standard: true). Ob die volle Intervall-Zeitleiste enthalten sein soll, oder nur die Zusammenfassung pro Zustand (deutlich kleiner bei langen Zeiträumen)."},
    },
    "required": ["fromEpochMillis", "toEpochMillis"],
}
_GLOOKO_MEAL_WINDOW_SCHEMA = {
    "type": "object",
    "properties": {
        "eventEpochMillis": {"type": "integer", "description": "Unix-Zeitstempel (Millisekunden) des Mahlzeiten-/Bolus-Ereignisses. Fenster ist automatisch 30 Minuten davor bis 3 Stunden danach -- z. B. den Zeitpunkt vorher mit get_enriched_bolus_log ermitteln."},
    },
    "required": ["eventEpochMillis"],
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
            "_realtime": True,
        })
        tools.append({
            "name": NIGHTSCOUT_TREATMENTS_TOOL_NAME,
            "description": "Ruft Behandlungs-Einträge direkt per Nightscout-REST-API für einen Zeitraum ab: "
                           "Bolus-Gaben (Einheiten), Kohlenhydrate/BE, Temp Basals (Rate/Prozent/Dauer) sowie "
                           "Katheter- (CAGE/Site Change) und Sensor-Wechsel (SAGE/Sensor Change).",
            "inputSchema": _NIGHTSCOUT_TREATMENTS_SCHEMA,
            "_source": "nightscout",
            "_realtime": True,
        })
        tools.append({
            "name": NIGHTSCOUT_PROFILE_TOOL_NAME,
            "description": "Ruft das aktuell aktive Therapieprofil direkt per Nightscout-REST-API ab: "
                           "Basalratenprofil, Korrekturfaktor (ISF), BE-/KE-Faktor (ICR), BZ-Zielbereich und "
                           "DIA (Wirkdauer des Insulins). Kein Zeitraum-Parameter -- immer das aktuell gültige Profil.",
            "inputSchema": _NIGHTSCOUT_PROFILE_SCHEMA,
            "_source": "nightscout",
            "_realtime": False,
        })
        tools.append({
            "name": NIGHTSCOUT_DEVICESTATUS_TOOL_NAME,
            "description": "Ruft den aktuellsten Geräte-Status direkt per Nightscout-REST-API ab: IOB (Insulin on "
                           "Board), COB (Carbs on Board), Loop-Statusmeldung (z. B. AndroidAPS/Loop) und, falls "
                           "vom Loop-System gemeldet, vorhergesagte Blutzuckerwerte. Kein Zeitraum-Parameter -- "
                           "immer der aktuellste gemeldete Stand.",
            "inputSchema": _NIGHTSCOUT_DEVICESTATUS_SCHEMA,
            "_source": "nightscout",
            "_realtime": True,
        })
    if settings.get("feelfitEmail") and settings.get("feelfitEnabled", True):
        tools.append({
            "name": FEELFIT_TOOL_NAME,
            "description": "Ruft die Körperzusammensetzungs-Messhistorie (Gewicht, Körperfett, BMI, Muskel-/"
                           "Knochenmasse, Wasseranteil, viszerales Fett, Grundumsatz) von der FeelFit-Körperwaage ab.",
            "inputSchema": _FEELFIT_SCHEMA,
            "_source": "feelfit",
            "_realtime": False,
        })
    if settings.get("googleHealthAccessToken") or settings.get("googleHealthRefreshToken"):
        if settings.get("googleHealthEnabled", True):
            tools.append({
                "name": GOOGLE_HEALTH_TOOL_NAME,
                "description": "Ruft Blutzucker-Messungen (mg/dL, Zeitstempel) über die Google Health API für einen "
                               "Zeitraum ab -- z. B. von einem verbundenen CGM/BZ-Messgerät, das mit Google Health synchronisiert. "
                               "ZEITVERZÖGERTE QUELLE -- die Synchronisation von der jeweiligen Drittanbieter-App nach "
                               "Google Health kann Minuten bis Stunden dauern; NICHT für Fragen zu aktuellen Werten/den "
                               "letzten 2 Stunden verwenden.",
                "inputSchema": _GOOGLE_HEALTH_SCHEMA,
                "_source": "google_health",
                "_realtime": False,
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
                "_realtime": False,
            })
            tools.append({
                "name": GOOGLE_HEALTH_STEPS_TOOL_NAME,
                "description": "Ruft die Schrittzahl über die Google Health API für einen Zeitraum ab (einzelne "
                               "Zeitintervalle mit jeweiliger Schrittzahl) -- z. B. von einer verbundenen Smartwatch.",
                "inputSchema": _GOOGLE_HEALTH_SCHEMA,
                "_source": "google_health",
                "_realtime": False,
            })
            tools.append({
                "name": GOOGLE_HEALTH_HEART_RATE_TOOL_NAME,
                "description": "Ruft rohe Pulsmessungen (Schläge pro Minute, Zeitstempel) über die Google Health API "
                               "für einen Zeitraum ab -- z. B. von einer verbundenen Smartwatch.",
                "inputSchema": _GOOGLE_HEALTH_SCHEMA,
                "_source": "google_health",
                "_realtime": False,
            })
            tools.append({
                "name": GOOGLE_HEALTH_RESTING_HEART_RATE_TOOL_NAME,
                "description": "Ruft den täglichen Ruhepuls (Schläge pro Minute pro Tag) über die Google Health API "
                               "für einen Zeitraum ab -- eignet sich besser für einen Trend über mehrere Tage als "
                               "die rohen Pulsmessungen.",
                "inputSchema": _GOOGLE_HEALTH_SCHEMA,
                "_source": "google_health",
                "_realtime": False,
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
                "_realtime": False,
            })
    if settings.get("withingsAccessToken") or settings.get("withingsRefreshToken"):
        if settings.get("withingsEnabled", True):
            tools.append({
                "name": WITHINGS_TOOL_NAME,
                "description": "Ruft Gewicht (kg) und Körperfettanteil (%) der letzten 3 Monate über die direkte "
                               "Withings-REST-API ab, inklusive Trendrichtung je Kennzahl (steigend/fallend/stabil, "
                               "verglichen zwischen erster und letzter Messung im Zeitraum). Direkte, native "
                               "Integration (Blau-Kennzeichnung '⚡ Direkt-API' in den Einstellungen), keine MCP-"
                               "Anbindung.",
                "inputSchema": _WITHINGS_SCHEMA,
                "_source": "withings",
                "_realtime": False,
            })
    if settings.get("dexcomUsername") and settings.get("dexcomEnabled", True):
        tools.append({
            "name": DEXCOM_TOOL_NAME,
            "description": "Ruft aktuelle Blutzucker-Sensorwerte (mg/dL, Zeitstempel, Trendrichtung) über die "
                           "Dexcom-Share-API ab -- liefert nur die letzten bis zu 24 Stunden, keine älteren Daten.",
            "inputSchema": _FEELFIT_SCHEMA,
            "_source": "dexcom",
            "_realtime": True,
        })
    if settings.get("libreEmail") and settings.get("libreEnabled", True):
        tools.append({
            "name": LIBRELINKUP_TOOL_NAME,
            "description": "Ruft aktuelle Blutzucker-Sensorwerte (mg/dL, Zeitstempel) über LibreLinkUp (FreeStyle "
                           "Libre) ab -- liefert nur die letzten ca. 12 Stunden, keine älteren Daten.",
            "inputSchema": _FEELFIT_SCHEMA,
            "_source": "librelinkup",
            "_realtime": True,
        })
    if settings.get("glookoUsername") and settings.get("glookoEnabled", True):
        _glooko_note = (
            " Insulinpumpen-Daten sind über die Kathetereinheit/Pumpen-App zeitverzögert -- ZEITVERZÖGERTE "
            "QUELLE, NIEMALS für Fragen zu aktuellen Werten/Ereignissen der letzten 2 Stunden verwenden, auch "
            "wenn Einträge scheinbar aktuell aussehen."
        )
        tools.append({
            "name": GLOOKO_SUMMARY_TOOL_NAME,
            "description": "Bester Startpunkt für jede Übersichtsfrage zur Insulinpumpe/CGM über einen Zeitraum "
                           "(Tag/Woche/Monat/mehrere Monate) -- liefert feste, günstige Kennzahlen unabhängig von "
                           "der Fensterlänge: Time-in-Range/TIR, GMI (geschätztes HbA1c), Variationskoeffizient "
                           "(%CV), höchster/niedrigster Messwert mit Zeitpunkten, bester/schlechtester Tag und "
                           "Stunde, Insulin (Basal/Bolus-Aufteilung), Bolus-Architektur (Anteil Mahlzeiten-/"
                           "Korrektur-Boli), Kohlenhydrate und die im Zeitraum gültigen Pumpen-Einstellungen."
                           + _glooko_note,
            "inputSchema": _GLOOKO_SUMMARY_SCHEMA, "_source": "glooko", "_realtime": False,
        })
        tools.append({
            "name": GLOOKO_TREND_TOOL_NAME,
            "description": "Glukose-, Insulin- und Kohlenhydrat-Kennzahlen in Zeit-Buckets über eine Spanne -- für "
                           "\"wie hat sich das Monat für Monat über das letzte Jahr entwickelt\"-Fragen. Jeder Bucket "
                           "wird unabhängig aus den Rohwerten berechnet (nicht durch Mitteln von Mitteln), daher "
                           "liefert ein nach Monat aufgeteiltes Jahr 12 korrekte Zeilen in einem Aufruf statt vieler "
                           "einzelner get_diabetes_summary-Aufrufe." + _glooko_note,
            "inputSchema": _GLOOKO_TREND_SCHEMA, "_source": "glooko", "_realtime": False,
        })
        tools.append({
            "name": GLOOKO_GLUCOSE_TOOL_NAME,
            "description": "Einzelne, zeitgestempelte CGM-Messwerte für einen Zeitraum, optional gefiltert nach "
                           "Bereich (nur Hypo-/Hyper-/Zielbereichswerte). Für breite Zeiträume/Diagramme "
                           "get_chart_series verwenden (deutlich günstiger); für Kennzahlen get_diabetes_summary "
                           "oder get_trend." + _glooko_note,
            "inputSchema": _GLOOKO_GLUCOSE_SCHEMA, "_source": "glooko", "_realtime": False,
        })
        tools.append({
            "name": GLOOKO_CHART_SERIES_TOOL_NAME,
            "description": "Auf eine Zielanzahl Punkte herunterge sampelte Glukose-Werte zum Zeichnen eines "
                           "Diagramms, mit Min/Max-Band pro Punkt (damit Spitzen nicht verloren gehen) plus "
                           "Bolus-Ereignissen als Marker. Für jede Diagramm-/Chart-Anfrage über einen Zeitraum "
                           "verwenden statt get_glucose." + _glooko_note,
            "inputSchema": _GLOOKO_CHART_SERIES_SCHEMA, "_source": "glooko", "_realtime": False,
        })
        tools.append({
            "name": GLOOKO_BOLUS_LOG_TOOL_NAME,
            "description": "Jede Bolusgabe im Zeitraum, angereichert mit dem interpolierten CGM-Wert bei Abgabe "
                           "sowie ISF, Kohlenhydrat-Faktor (ICR), Zielwert und DIA, die zu diesem Zeitpunkt galten. "
                           "Enthält abgegebene vs. programmierte Einheiten (abgegeben < programmiert = "
                           "unterbrochen), Empfehlung des Bolusrechners (Korrektur/Kohlenhydrate/gesamt), ob "
                           "übersteuert wurde, und die Bolus-Klasse. Für Insulin-Stacking, Bolusrechner-Genauigkeit, "
                           "unterbrochene Abgaben und Übersteuerungen." + _glooko_note,
            "inputSchema": _GLOOKO_BOLUS_LOG_SCHEMA, "_source": "glooko", "_realtime": False,
        })
        tools.append({
            "name": GLOOKO_HOURLY_TRENDS_TOOL_NAME,
            "description": "Time-in-Range und Durchschnittsglukose gebündelt nach Tageszeit (UTC-Stunde) über den "
                           "gesamten Zeitraum -- für \"warum bin ich immer zu einer bestimmten Zeit hoch/niedrig\"-"
                           "Fragen, wiederkehrende Muster, Dawn-Phänomen, Abend-Hochs." + _glooko_note,
            "inputSchema": _GLOOKO_HOURLY_SCHEMA, "_source": "glooko", "_realtime": False,
        })
        tools.append({
            "name": GLOOKO_BASAL_DELIVERY_TOOL_NAME,
            "description": "Was die Insulinpumpe mit der Basalrate über die Zeit gemacht hat: normal abgegeben, "
                           "pausiert (suspend), an der Obergrenze (max), oder blind auf fester Rate gelaufen, weil "
                           "das CGM-Signal verloren ging (limited). WICHTIG: das sind ZUSTÄNDE, keine Insulin-"
                           "Mengen (für Einheiten get_daily_insulin verwenden). Für Tiefwert-Untersuchungen "
                           "(war die Basalrate vorher schon pausiert?) und Rebound-Muster." + _glooko_note,
            "inputSchema": _GLOOKO_BASAL_DELIVERY_SCHEMA, "_source": "glooko", "_realtime": False,
        })
        tools.append({
            "name": GLOOKO_DAILY_INSULIN_TOOL_NAME,
            "description": "Die eigenen Tagessummen der Insulinpumpen-App: Basal-, Bolus- und Gesamteinheiten pro "
                           "Tag, wie vom Gerät gemeldet (nicht aus Einzelereignissen neu berechnet). Für eine "
                           "Tag-für-Tag-Basal-/Bolus-Tabelle oder \"wie viel Insulin insgesamt pro Tag\"."
                           + _glooko_note,
            "inputSchema": _GLOOKO_WINDOW_SCHEMA_REF, "_source": "glooko", "_realtime": False,
        })
        tools.append({
            "name": GLOOKO_SETTINGS_HISTORY_TOOL_NAME,
            "description": "Jede Änderung der Pumpen-Profileinstellungen, die im Zeitraum galt, chronologisch: "
                           "DIA (aktive Insulinzeit), maximale Basalrate, sowie die zeitsegmentierten Ziel-, ISF- "
                           "und Kohlenhydrat-Faktor-Profile. Nötig, um zu wissen, welche Einstellungen zu einem "
                           "bestimmten Zeitpunkt galten (z. B. vor Beurteilung eines Bolus)." + _glooko_note,
            "inputSchema": _GLOOKO_WINDOW_SCHEMA_REF, "_source": "glooko", "_realtime": False,
        })
        tools.append({
            "name": GLOOKO_DEVICE_EVENTS_TOOL_NAME,
            "description": "Wechsel der Kathetereinheit (Insulinpumpe) und CGM-Sensorwechsel als zeitgestempelte "
                           "Ereignisse. Als KONTEXT für nahegelegene Glukose-Störungen nützlich (eine frische "
                           "Kathetereinheit kann anfangs hoch laufen, ein neuer Sensor kann während der "
                           "Aufwärmphase unregelmäßig messen) -- niemals als alleinige Ursache behaupten."
                           + _glooko_note,
            "inputSchema": _GLOOKO_WINDOW_SCHEMA_REF, "_source": "glooko", "_realtime": False,
        })
        tools.append({
            "name": GLOOKO_MEAL_WINDOW_TOOL_NAME,
            "description": "Fokussierter Blick um ein einzelnes Ereignis (typischerweise ein Mahlzeiten-Bolus): "
                           "genau 30 Minuten davor bis 3 Stunden danach. Für die Beurteilung eines postprandialen "
                           "Anstiegs und wie gut eine Dosis gewirkt hat. Zeitpunkt vorher z. B. mit "
                           "get_enriched_bolus_log ermitteln." + _glooko_note,
            "inputSchema": _GLOOKO_MEAL_WINDOW_SCHEMA, "_source": "glooko", "_realtime": False,
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
                # Admin-set per-server toggle (see McpServerEditor.tsx) -- the same flag the
                # dashboard uses to prefer realtime sources over lagging ones.
                "_realtime": bool(server.get("isRealtime")),
            })
    return tools


_REALTIME_HINT_DE = (
    "\n\n# ECHTZEIT-EINSTUFUNG DER AKTUELLEN WERKZEUGE\n"
    "Jedes oben gelistete Werkzeug ist hier als ECHTZEIT oder ZEITVERZÖGERT eingestuft. Für "
    "Fragen zu aktuellen Werten oder Ereignissen der letzten 2 Stunden (z. B. \"Wie ist mein BZ "
    "gerade?\", \"Trend der letzten Stunde\") darfst du AUSSCHLIESSLICH als ECHTZEIT eingestufte "
    "Werkzeuge verwenden. ZEITVERZÖGERTE Werkzeuge dürfen NIEMALS für solche Fragen herangezogen "
    "werden, selbst wenn ihre Einträge scheinbar aktuell aussehen.\n"
)
_REALTIME_HINT_EN = (
    "\n\n# REALTIME CLASSIFICATION OF THE CURRENT TOOLS\n"
    "Every tool listed above is classified here as REALTIME or DELAYED. For questions about "
    "current values or events from the last 2 hours (e.g. \"what's my BG right now?\", \"trend "
    "over the last hour\") you may ONLY use tools classified as REALTIME. DELAYED tools must "
    "NEVER be used for such questions, even if their entries look recent.\n"
)


def build_realtime_hint(available_tools: list[dict], is_en: bool) -> str:
    """Dynamic, always-accurate per-turn supplement to the static system prompt's recency rules
    (see prompts.py) -- built from the actual tool list for this turn rather than trusting the
    model to remember which of possibly many MCP servers are realtime. Also the single place that
    knows whether a realtime source is configured at all, for the "no live source configured"
    transparency rule."""
    realtime = [t["name"] for t in available_tools if t.get("_realtime")]
    delayed = [t["name"] for t in available_tools if not t.get("_realtime")]
    if is_en:
        lines = [_REALTIME_HINT_EN]
        lines.append(f"REALTIME: {', '.join(realtime) if realtime else '(none)'}")
        lines.append(f"DELAYED: {', '.join(delayed) if delayed else '(none)'}")
        if not realtime:
            lines.append(
                "\nNo realtime source is currently configured/enabled. For any question about "
                "current values, say directly that an active Nightscout connection needs to be "
                "set up for that (Settings -> Data sources)."
            )
    else:
        lines = [_REALTIME_HINT_DE]
        lines.append(f"ECHTZEIT: {', '.join(realtime) if realtime else '(keine)'}")
        lines.append(f"ZEITVERZÖGERT: {', '.join(delayed) if delayed else '(keine)'}")
        if not realtime:
            lines.append(
                "\nAktuell ist KEINE Echtzeit-Quelle konfiguriert/aktiviert. Weise bei jeder "
                "Frage zu aktuellen Werten direkt darauf hin, dass dafür eine aktive "
                "Nightscout-Anbindung eingerichtet werden muss (Einstellungen -> Datenquellen)."
            )
    return "\n".join(lines)


_NATIVE_SOURCE_NAMES = {
    "nightscout": "Nightscout",
    "feelfit": "FeelFit",
    "google_health": "Google Health",
    "dexcom": "Dexcom",
    "librelinkup": "LibreLinkUp",
    "glooko": "Glooko",
    "withings": "Withings",
}
_NATIVE_SOURCE_CATEGORY_KEYS = {
    "nightscout": "nightscoutCategory",
    "feelfit": "feelfitCategory",
    "google_health": "googleHealthCategory",
    "dexcom": "dexcomCategory",
    "librelinkup": "libreCategory",
    "glooko": "glookoCategory",
    "withings": "withingsCategory",
}


def sources_by_id(available_tools: list[dict], settings: dict, mcp_servers: list[dict]) -> dict[str, dict]:
    """One row per distinct `_source` actually present in `available_tools` this turn --
    {id, name, category, isRestApi} -- for the chat "welche Quelle?" disambiguation (see
    main.py::send_message). `isRestApi` mirrors the same REST-vs-MCP distinction the Android app
    draws (see its ui/theme/SourceTypeColors.kt): every built-in native integration counts as
    "direct" here (blue badge), same as Nightscout's direct REST API was on Android -- an MCP
    server (the user's own, arbitrary, external server) is the only "MCP" (violet badge) case."""
    mcp_by_id = {s["id"]: s for s in mcp_servers}
    result: dict[str, dict] = {}
    for t in available_tools:
        source_id = t["_source"]
        if source_id in result:
            continue
        if source_id in _NATIVE_SOURCE_NAMES:
            result[source_id] = {
                "id": source_id,
                "name": _NATIVE_SOURCE_NAMES[source_id],
                "category": settings.get(_NATIVE_SOURCE_CATEGORY_KEYS[source_id], "GLUCOSE_TREATMENTS"),
                "isRestApi": True,
            }
        else:
            server = mcp_by_id.get(source_id)
            result[source_id] = {
                "id": source_id,
                "name": server["name"] if server else source_id,
                "category": server.get("category", "OTHER") if server else "OTHER",
                "isRestApi": False,
            }
    return result


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


# Item 3's "Transparente Quellenangabe": every native tool name maps to the source it belongs to,
# so `execute_tool` below can prepend an unambiguous "Quelle: ..." header centrally -- one place
# that can never be forgotten by an individual _execute_* function, rather than duplicating the
# citation in each of them.
_TOOL_NAME_TO_SOURCE_ID = {
    NIGHTSCOUT_TOOL_NAME: "nightscout",
    NIGHTSCOUT_TREATMENTS_TOOL_NAME: "nightscout",
    NIGHTSCOUT_PROFILE_TOOL_NAME: "nightscout",
    NIGHTSCOUT_DEVICESTATUS_TOOL_NAME: "nightscout",
    FEELFIT_TOOL_NAME: "feelfit",
    GOOGLE_HEALTH_TOOL_NAME: "google_health",
    GOOGLE_HEALTH_SLEEP_TOOL_NAME: "google_health",
    GOOGLE_HEALTH_STEPS_TOOL_NAME: "google_health",
    GOOGLE_HEALTH_HEART_RATE_TOOL_NAME: "google_health",
    GOOGLE_HEALTH_RESTING_HEART_RATE_TOOL_NAME: "google_health",
    GOOGLE_HEALTH_HRV_TOOL_NAME: "google_health",
    WITHINGS_TOOL_NAME: "withings",
    DEXCOM_TOOL_NAME: "dexcom",
    LIBRELINKUP_TOOL_NAME: "librelinkup",
    GLOOKO_SUMMARY_TOOL_NAME: "glooko",
    GLOOKO_TREND_TOOL_NAME: "glooko",
    GLOOKO_GLUCOSE_TOOL_NAME: "glooko",
    GLOOKO_CHART_SERIES_TOOL_NAME: "glooko",
    GLOOKO_BOLUS_LOG_TOOL_NAME: "glooko",
    GLOOKO_HOURLY_TRENDS_TOOL_NAME: "glooko",
    GLOOKO_BASAL_DELIVERY_TOOL_NAME: "glooko",
    GLOOKO_DAILY_INSULIN_TOOL_NAME: "glooko",
    GLOOKO_SETTINGS_HISTORY_TOOL_NAME: "glooko",
    GLOOKO_DEVICE_EVENTS_TOOL_NAME: "glooko",
    GLOOKO_MEAL_WINDOW_TOOL_NAME: "glooko",
}


def _cite_source(result: str, citation: str) -> str:
    """Prepends `citation` unless `result` already carries its own "Quelle:" header (e.g.
    Withings, which builds a more detailed one itself) or is an error string (nothing to
    attribute a source to)."""
    if result.startswith("Quelle:") or result.startswith("Fehler"):
        return result
    return f"{citation}\n\n{result}"


async def _dispatch_native(name: str, arguments: dict[str, Any], settings: dict) -> str | None:
    """The native (non-MCP) tool dispatch chain -- returns None for a tool name it doesn't
    recognize, so `execute_tool` below falls through to the MCP-server lookup."""
    if name == NIGHTSCOUT_TOOL_NAME:
        return await _execute_nightscout(arguments, settings)
    if name == NIGHTSCOUT_TREATMENTS_TOOL_NAME:
        return await _execute_nightscout_treatments(arguments, settings)
    if name == NIGHTSCOUT_PROFILE_TOOL_NAME:
        return await _execute_nightscout_profile(settings)
    if name == NIGHTSCOUT_DEVICESTATUS_TOOL_NAME:
        return await _execute_nightscout_devicestatus(settings)
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
    if name == WITHINGS_TOOL_NAME:
        return await _execute_withings(settings)
    if name == DEXCOM_TOOL_NAME:
        return await _execute_dexcom(settings)
    if name == LIBRELINKUP_TOOL_NAME:
        return await _execute_librelinkup(settings)
    if name == GLOOKO_SUMMARY_TOOL_NAME:
        return await _execute_glooko_summary(arguments, settings)
    if name == GLOOKO_TREND_TOOL_NAME:
        return await _execute_glooko_trend(arguments, settings)
    if name == GLOOKO_GLUCOSE_TOOL_NAME:
        return await _execute_glooko_glucose(arguments, settings)
    if name == GLOOKO_CHART_SERIES_TOOL_NAME:
        return await _execute_glooko_chart_series(arguments, settings)
    if name == GLOOKO_BOLUS_LOG_TOOL_NAME:
        return await _execute_glooko_bolus_log(arguments, settings)
    if name == GLOOKO_HOURLY_TRENDS_TOOL_NAME:
        return await _execute_glooko_hourly_trends(arguments, settings)
    if name == GLOOKO_BASAL_DELIVERY_TOOL_NAME:
        return await _execute_glooko_basal_delivery(arguments, settings)
    if name == GLOOKO_DAILY_INSULIN_TOOL_NAME:
        return await _execute_glooko_daily_insulin(arguments, settings)
    if name == GLOOKO_SETTINGS_HISTORY_TOOL_NAME:
        return await _execute_glooko_settings_history(arguments, settings)
    if name == GLOOKO_DEVICE_EVENTS_TOOL_NAME:
        return await _execute_glooko_device_events(arguments, settings)
    if name == GLOOKO_MEAL_WINDOW_TOOL_NAME:
        return await _execute_glooko_meal_window(arguments, settings)
    return None


async def execute_tool(name: str, arguments: dict[str, Any], settings: dict, mcp_servers: list[dict]) -> str:
    """Never raises -- a failed tool call (server down, network blip, ...) is fed back to the
    model as an error-flavored tool result instead of crashing the whole chat request. The model
    can then tell the user what happened instead of the request 500ing (observed live: a
    transient MCP connection failure here previously took the entire /messages endpoint down).

    Every result gets an explicit "Quelle: ..." header via `_cite_source` (item 3's "Transparente
    Quellenangabe") before it's handed back -- native tools cite "{Anbieter} REST API", MCP tools
    cite "{Servername} MCP", matching the two example phrasings from the request."""
    native_result = await _dispatch_native(name, arguments, settings)
    if native_result is not None:
        source_id = _TOOL_NAME_TO_SOURCE_ID.get(name)
        display_name = _NATIVE_SOURCE_NAMES.get(source_id, source_id) if source_id else name
        return _cite_source(native_result, f"Quelle: {display_name} REST API")
    try:
        for server in mcp_servers:
            if not server.get("enabled"):
                continue
            tools = await _safe_list_tools(server)
            if any(t.name == name for t in tools):
                resolved = await resolve_server_auth(server)
                citation = f"Quelle: {server.get('name') or server['id']} MCP"
                try:
                    result = await mcp_client.call_tool(resolved, name, arguments)
                    return _cite_source(result, citation)
                except Exception as exc:  # noqa: BLE001
                    if server.get("authMethod") != "OAUTH2" or not _is_auth_error(exc):
                        raise
                    # Same stale-cached-expiry case as _safe_list_tools -- force a refresh and
                    # retry the actual tool call once before surfacing the failure.
                    resolved = await resolve_server_auth(server, force_refresh=True)
                    result = await mcp_client.call_tool(resolved, name, arguments)
                    return _cite_source(result, citation)
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
    # Item 3's "Automatische Erkennung von Datenlücken" -- appended, never silently filled/
    # estimated; compute_metrics/TIR/etc. downstream already only ever aggregate the entries
    # actually present, so nothing else needs to change to honor "AUSSCHLIESSLICH aus den
    # tatsächlich vorliegenden Datenpunkten".
    gaps = nightscout.detect_gaps(entries, from_millis, to_millis)
    if gaps:
        lines.append("")
        lines.extend(nightscout.format_gap_warning("Nightscout", gap) for gap in gaps)
    return "\n".join(lines)


async def _execute_nightscout_treatments(arguments: dict[str, Any], settings: dict) -> str:
    now = int(time.time() * 1000)
    from_millis = int(arguments.get("fromEpochMillis") or now - 24 * 60 * 60 * 1000)
    to_millis = int(arguments.get("toEpochMillis") or now)
    try:
        treatments = await nightscout.fetch_treatments(
            settings["nightscoutApiUrl"], settings["nightscoutApiAuthMethod"], settings["nightscoutApiSecret"],
            from_millis, to_millis,
        )
    except Exception as exc:  # noqa: BLE001
        return f"Fehler beim Abruf der Nightscout-Behandlungsdaten: {exc}"
    if not treatments:
        return "Keine Behandlungs-Einträge (Bolus/Kohlenhydrate/Temp Basal/Geräte-Wechsel) im angefragten Zeitraum gefunden."
    cage, sage = nightscout.split_cage_sage_events(treatments)
    lines = []
    for t in treatments:
        date = time.strftime("%d.%m. %H:%M", time.localtime(t.date_millis / 1000))
        parts = [t.event_type or "Ereignis"]
        if t.insulin_units is not None:
            parts.append(f"{t.insulin_units:.2f} IE Insulin")
        if t.carbs_grams is not None:
            parts.append(f"{t.carbs_grams:.0f} g Kohlenhydrate")
        if t.temp_basal_rate is not None:
            parts.append(f"Temp-Basal-Rate {t.temp_basal_rate:.2f} U/h")
        if t.temp_basal_percent is not None:
            parts.append(f"Temp-Basal {t.temp_basal_percent:.0f}%")
        if t.duration_minutes is not None:
            parts.append(f"{t.duration_minutes:.0f} min")
        if t.notes:
            parts.append(t.notes)
        lines.append(f"{date}: {', '.join(parts)}")
    lines.append("")
    lines.append(f"Katheter-/Site-Wechsel (CAGE) im Zeitraum: {len(cage)}")
    lines.append(f"Sensor-Wechsel (SAGE) im Zeitraum: {len(sage)}")
    return "\n".join(lines)


async def _execute_nightscout_profile(settings: dict) -> str:
    try:
        profile = await nightscout.fetch_active_profile(
            settings["nightscoutApiUrl"], settings["nightscoutApiAuthMethod"], settings["nightscoutApiSecret"],
        )
    except Exception as exc:  # noqa: BLE001
        return f"Fehler beim Abruf des Nightscout-Therapieprofils: {exc}"
    if profile is None:
        return "Kein Therapieprofil in Nightscout hinterlegt."

    def format_segments(segments: list, unit: str) -> str:
        if not segments:
            return "  (keine Segmente hinterlegt)"
        return "\n".join(f"  ab {s.time} Uhr: {s.value:.2f} {unit}" for s in segments)

    lines = [
        f"Profilname: {profile.name}",
        f"DIA (Wirkdauer): {profile.dia_hours:.1f} h" if profile.dia_hours is not None else "DIA (Wirkdauer): nicht hinterlegt",
        "",
        "Basalratenprofil (U/h):",
        format_segments(profile.basal_segments, "U/h"),
        "",
        f"Korrekturfaktor ISF ({profile.units}/IE):",
        format_segments(profile.isf_segments, profile.units),
        "",
        "BE-/KE-Faktor ICR (g Kohlenhydrate/IE):",
        format_segments(profile.icr_segments, "g/IE"),
        "",
        f"BZ-Zielwert untere Grenze ({profile.units}):",
        format_segments(profile.target_low_segments, profile.units),
        "",
        f"BZ-Zielwert obere Grenze ({profile.units}):",
        format_segments(profile.target_high_segments, profile.units),
    ]
    return "\n".join(lines)


async def _execute_nightscout_devicestatus(settings: dict) -> str:
    try:
        status = await nightscout.fetch_latest_device_status(
            settings["nightscoutApiUrl"], settings["nightscoutApiAuthMethod"], settings["nightscoutApiSecret"],
        )
    except Exception as exc:  # noqa: BLE001
        return f"Fehler beim Abruf des Nightscout-Gerätestatus: {exc}"
    if status is None:
        return "Kein Geräte-Status (IOB/COB/Loop) in Nightscout gemeldet -- vermutlich kein Loop-/AndroidAPS-System angebunden."
    date = time.strftime("%d.%m.%Y %H:%M", time.localtime(status.date_millis / 1000))
    lines = [f"Stand: {date} Uhr"]
    lines.append(f"IOB (Insulin on Board): {status.iob_units:.2f} IE" if status.iob_units is not None else "IOB (Insulin on Board): nicht gemeldet")
    lines.append(f"COB (Carbs on Board): {status.cob_grams:.0f} g" if status.cob_grams is not None else "COB (Carbs on Board): nicht gemeldet")
    lines.append(f"Loop-Status: {status.loop_status}" if status.loop_status else "Loop-Status: nicht gemeldet")
    if status.predicted_bg_mgdl:
        preview = ", ".join(f"{v:.0f}" for v in status.predicted_bg_mgdl[:12])
        lines.append(f"Vorhergesagte BZ-Werte (mg/dL, nächste Punkte): {preview}")
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


def _save_withings_tokens(access_token: str, refresh_token: str, expires_at: int) -> None:
    db.save_settings({
        "withingsAccessToken": access_token,
        "withingsRefreshToken": refresh_token,
        "withingsExpiresAt": expires_at,
    })


def _format_withings_trend(label: str, trend: "withings.Trend | None", unit: str) -> str:
    if trend is None:
        return f"{label}-Trend: nicht genug Messungen im Zeitraum für einen Trend"
    direction_label = {"UP": "steigend", "DOWN": "fallend", "STABLE": "stabil"}[trend.direction]
    return f"{label}-Trend (3 Monate): {trend.arrow} {direction_label} ({trend.change:+.1f} {unit} zwischen erster und letzter Messung)"


async def _execute_withings(settings: dict) -> str:
    try:
        access_token = await withings.get_valid_access_token(settings, _save_withings_tokens)
        try:
            result = await withings.fetch_weight_and_fat_trend(access_token)
        except withings.WithingsError as exc:
            if exc.status_code != 401:
                raise
            # The cached token looked valid (expiry not yet reached) but Withings rejected it
            # anyway -- force a real refresh and retry once before giving up (see
            # WithingsError's doc comment; confirmed live).
            access_token = await withings.get_valid_access_token(settings, _save_withings_tokens, force_refresh=True)
            result = await withings.fetch_weight_and_fat_trend(access_token)
    except Exception as exc:  # noqa: BLE001
        return f"Fehler beim Abruf der Withings-Daten: {exc}"
    if not result.readings:
        return "Keine Withings-Messungen in den letzten 3 Monaten gefunden."
    lines = ["Quelle: Withings REST API (direkte API, letzte 3 Monate)", ""]
    for r in result.readings:
        date = time.strftime("%d.%m.%Y %H:%M", time.localtime(r.date_millis / 1000))
        parts = [date]
        if r.weight_kg is not None:
            parts.append(f"Gewicht {r.weight_kg:.1f} kg")
        if r.fat_ratio_percent is not None:
            parts.append(f"Körperfett {r.fat_ratio_percent:.1f}%")
        lines.append(f"{parts[0]}: {', '.join(parts[1:])}" if len(parts) > 1 else parts[0])
    lines.append("")
    lines.append(_format_withings_trend("Gewicht", result.weight_trend, "kg"))
    lines.append(_format_withings_trend("Körperfett", result.fat_trend, "%"))
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


def _glooko_window(arguments: dict[str, Any], default_days_back: int = 14) -> tuple[int, int]:
    now = int(time.time() * 1000)
    from_millis = int(arguments.get("fromEpochMillis") or now - default_days_back * 24 * 60 * 60 * 1000)
    to_millis = int(arguments.get("toEpochMillis") or now)
    return from_millis, to_millis


def _glooko_json(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, indent=2)


async def _execute_glooko_summary(arguments: dict[str, Any], settings: dict) -> str:
    from_millis, to_millis = _glooko_window(arguments)
    try:
        result = await glooko.get_diabetes_summary(
            settings["glookoUsername"], settings["glookoPassword"], from_millis, to_millis,
            arguments.get("lowerMgDl", 70), arguments.get("upperMgDl", 180),
        )
    except Exception as exc:  # noqa: BLE001
        return f"Fehler beim Abruf der Insulinpumpen-Übersicht: {exc}"
    return _glooko_json(result)


async def _execute_glooko_trend(arguments: dict[str, Any], settings: dict) -> str:
    from_millis, to_millis = _glooko_window(arguments, default_days_back=90)
    try:
        result = await glooko.get_trend(
            settings["glookoUsername"], settings["glookoPassword"], from_millis, to_millis,
            arguments.get("mode", "calendar"), arguments.get("granularity", "month"),
            int(arguments.get("fixedSizeDays", 7)), arguments.get("lowerMgDl", 70), arguments.get("upperMgDl", 180),
        )
    except Exception as exc:  # noqa: BLE001
        return f"Fehler beim Abruf des Insulinpumpen-Trends: {exc}"
    return _glooko_json(result)


async def _execute_glooko_glucose(arguments: dict[str, Any], settings: dict) -> str:
    from_millis, to_millis = _glooko_window(arguments, default_days_back=1)
    try:
        result = await glooko.get_glucose(
            settings["glookoUsername"], settings["glookoPassword"], from_millis, to_millis,
            arguments.get("band", "all"), arguments.get("lowerMgDl", 70), arguments.get("upperMgDl", 180),
        )
    except Exception as exc:  # noqa: BLE001
        return f"Fehler beim Abruf der CGM-Werte: {exc}"
    return _glooko_json(result)


async def _execute_glooko_chart_series(arguments: dict[str, Any], settings: dict) -> str:
    from_millis, to_millis = _glooko_window(arguments, default_days_back=14)
    try:
        result = await glooko.get_chart_series(
            settings["glookoUsername"], settings["glookoPassword"], from_millis, to_millis,
            int(arguments.get("maxPoints", 250)),
        )
    except Exception as exc:  # noqa: BLE001
        return f"Fehler beim Abruf der Chart-Serie: {exc}"
    return _glooko_json(result)


async def _execute_glooko_bolus_log(arguments: dict[str, Any], settings: dict) -> str:
    from_millis, to_millis = _glooko_window(arguments, default_days_back=7)
    try:
        result = await glooko.get_enriched_bolus_log(
            settings["glookoUsername"], settings["glookoPassword"], from_millis, to_millis, arguments.get("classes"),
        )
    except Exception as exc:  # noqa: BLE001
        return f"Fehler beim Abruf des Bolus-Protokolls: {exc}"
    return _glooko_json(result)


async def _execute_glooko_hourly_trends(arguments: dict[str, Any], settings: dict) -> str:
    from_millis, to_millis = _glooko_window(arguments, default_days_back=14)
    try:
        result = await glooko.get_hourly_trends(
            settings["glookoUsername"], settings["glookoPassword"], from_millis, to_millis,
            arguments.get("lowerMgDl", 70), arguments.get("upperMgDl", 180),
        )
    except Exception as exc:  # noqa: BLE001
        return f"Fehler beim Abruf der Tageszeit-Muster: {exc}"
    return _glooko_json(result)


async def _execute_glooko_basal_delivery(arguments: dict[str, Any], settings: dict) -> str:
    from_millis, to_millis = _glooko_window(arguments, default_days_back=7)
    try:
        result = await glooko.get_basal_delivery(
            settings["glookoUsername"], settings["glookoPassword"], from_millis, to_millis,
            bool(arguments.get("includeIntervals", True)),
        )
    except Exception as exc:  # noqa: BLE001
        return f"Fehler beim Abruf des Basalraten-Verhaltens: {exc}"
    return _glooko_json(result)


async def _execute_glooko_daily_insulin(arguments: dict[str, Any], settings: dict) -> str:
    from_millis, to_millis = _glooko_window(arguments, default_days_back=14)
    try:
        result = await glooko.get_daily_insulin(settings["glookoUsername"], settings["glookoPassword"], from_millis, to_millis)
    except Exception as exc:  # noqa: BLE001
        return f"Fehler beim Abruf der täglichen Insulinmengen: {exc}"
    return _glooko_json(result)


async def _execute_glooko_settings_history(arguments: dict[str, Any], settings: dict) -> str:
    from_millis, to_millis = _glooko_window(arguments, default_days_back=90)
    try:
        result = await glooko.get_settings_history(settings["glookoUsername"], settings["glookoPassword"], from_millis, to_millis)
    except Exception as exc:  # noqa: BLE001
        return f"Fehler beim Abruf der Pumpen-Einstellungshistorie: {exc}"
    return _glooko_json(result)


async def _execute_glooko_device_events(arguments: dict[str, Any], settings: dict) -> str:
    from_millis, to_millis = _glooko_window(arguments, default_days_back=14)
    try:
        result = await glooko.get_device_events(settings["glookoUsername"], settings["glookoPassword"], from_millis, to_millis)
    except Exception as exc:  # noqa: BLE001
        return f"Fehler beim Abruf der Geräte-Ereignisse: {exc}"
    return _glooko_json(result)


async def _execute_glooko_meal_window(arguments: dict[str, Any], settings: dict) -> str:
    event_epoch_millis = arguments.get("eventEpochMillis")
    if event_epoch_millis is None:
        return "Fehler: eventEpochMillis ist erforderlich."
    try:
        result = await glooko.get_meal_window_analysis(settings["glookoUsername"], settings["glookoPassword"], int(event_epoch_millis))
    except Exception as exc:  # noqa: BLE001
        return f"Fehler bei der Mahlzeitenfenster-Analyse: {exc}"
    return _glooko_json(result)
