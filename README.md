# GlucoSphere-Web

Containerisierte Web-Version von [GlucoSphere](https://github.com/akofort/GlucoSphere) (der
Android-App). MVP-Stand: Übersicht (Dashboard), Chat mit Cloud-LLM-Anbietern, LLM-Konfiguration,
Datenquellen (Nightscout direkt) und Profil -- Backup, Voice-Modus, PDF-Export, Lizenzstufen,
lokales Modell und der volle MCP-Protokoll-Client sind (noch) nicht portiert, siehe
"Known limitations" unten.

## Architektur

```
┌─────────────┐      /api/*      ┌─────────────┐
│  frontend   │ ───────────────► │   backend   │
│  React+Vite │   (nginx proxy)  │   FastAPI   │
│  (nginx)    │                  │             │
└─────────────┘                  └──────┬──────┘
     :8180                              │
                                   SQLite (Volume)
                                         │
                              Gemini / Claude / OpenAI /
                              DeepSeek / OneProvider / Nightscout
```

- **frontend/**: React + TypeScript + Vite, gebaut als statische Dateien und über nginx
  ausgeliefert. nginx reicht `/api/*` an den Backend-Container weiter (kein CORS-Setup in Prod
  nötig).
- **backend/**: Python + FastAPI. Speichert Einstellungen und Chat-Verlauf in SQLite (Docker-Volume
  `glucosphere-data`, überlebt Container-Neustarts). Spricht direkt mit den Cloud-LLM-APIs
  (Gemini/Anthropic/OpenAI-kompatibel) und der Nightscout-REST-API.

## Deployment (Docker-Host, z. B. 192.168.1.110)

Voraussetzung: Docker + Docker Compose Plugin auf dem Zielhost.

```bash
git clone https://github.com/akofort/GlucoSphere-Web.git
cd GlucoSphere-Web
docker compose up -d --build
```

Danach ist die App unter `http://192.168.1.110:8180` erreichbar. Der Backend-Container ist nicht
nach außen exponiert (nur intern über das Compose-Netzwerk erreichbar) -- alle Zugriffe laufen
über den nginx-Reverse-Proxy im Frontend-Container.

Neubauen nach einem `git pull`:

```bash
docker compose up -d --build
```

Für die Versionsanzeige unter "Einstellungen -> Über" wird der Commit/Build-Zeitpunkt als Build-Arg
durchgereicht -- `deploy.sh` setzt beides automatisch; bei einem manuellen Build auf dem Host:

```bash
VITE_BUILD_SHA=$(git rev-parse --short HEAD) VITE_BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
  docker compose up -d --build
```

(Die App-Version selbst kommt aus `frontend/package.json` und ist auch ohne Build-Args korrekt.)

Logs ansehen:

```bash
docker compose logs -f backend
docker compose logs -f frontend
```

Die SQLite-Datenbank liegt im benannten Volume `glucosphere-data` (Pfad `/data/glucosphere.db` im
Backend-Container) -- übersteht `docker compose down`, nicht aber `docker compose down -v`.

## Konfiguration

Alle Einstellungen (API-Keys, Nightscout-URL, System-Prompt-Anpassungen, Profil) werden über die
Weboberfläche unter "Einstellungen" gepflegt und in der SQLite-DB gespeichert -- keine
Umgebungsvariablen für Secrets nötig.

## Auth & Mehrere Benutzer

Ein Login (Benutzername/Passwort, Session-Cookie, 30 Tage gültig) schützt die gesamte App, siehe
`backend/app/auth.py`. Zwei Rollen:

- **ADMIN** -- voller Zugriff (API-Keys, MCP-Server, Backup, Logging, Benutzerverwaltung).
- **MEMBER** -- für Familie/Diabetes-Team: nur Übersicht + Chat (eigener, von anderen Benutzern
  getrennter Chatverlauf) + das eigene Profil (Name/Rolle für die persönliche Ansprache der KI,
  Sprache, Passwort). Alles andere liefert `403` (`main.py`'s `require_admin`), im Frontend werden
  die entsprechenden Menüpunkte/Routen gar nicht erst angezeigt (`AdminRoute` in `App.tsx`).

Benutzer anlegen/verwalten: "Einstellungen -> Benutzerverwaltung" (nur für ADMIN sichtbar).

Beim allerersten Start ohne gesetzte `ADMIN_USERNAME`/`ADMIN_PASSWORD` (siehe `docker-compose.yml`)
wird automatisch ein ADMIN-Konto `admin` mit zufälligem Passwort angelegt -- das Passwort steht
danach **nur einmal** im Log:

```bash
docker compose logs backend | grep -A3 "generated one"
```

Danach unter "Einstellungen -> Konto" ein eigenes Passwort setzen. Passwort-Hashing: PBKDF2-HMAC-
SHA256, 210.000 Iterationen (stdlib `hashlib`, keine zusätzliche Abhängigkeit).

Ein Upgrade von einer älteren Version (Single-User) migriert automatisch: das bisherige Konto wird
zum ersten ADMIN, bestehender Chatverlauf und die aktive Login-Session bleiben erhalten (getestet
gegen eine Kopie der alten Schema-Version vor dem Release).

## MCP-Server & Tool-Calling im Chat

Unter "Einstellungen -> Datenquellen" lassen sich beliebig viele MCP-Server eintragen (Name, URL,
Transport, Auth, Datenkategorie). Aktive Server werden im Chat automatisch als natives
Function-Calling angeboten -- die KI entscheidet selbst, wann sie ein Werkzeug aufruft, mehrere
Runden pro Antwort sind möglich (max. 5, siehe `_MAX_TOOL_ITERATIONS` in `main.py`). Die direkte
Nightscout-API läuft über denselben Mechanismus, als eingebautes Werkzeug (`get_glucose_entries`).

### Google Health: Schritte & Aktivität

Tageswerte kommen aus Googles eigenem Server-seitigem Rollup
(`POST .../dataTypes/{typ}/dataPoints:dailyRollUp`, siehe `google_health.py`), nicht aus lokal
aufsummierten Einzelintervallen. Das ist der entscheidende Unterschied: das Rollup führt mehrere
Quellen zusammen (Uhr **und** Handy zählen denselben Spaziergang) und rechnet Wearable-Daten aus
Zeiträumen heraus, in denen das Gerät gar nicht getragen wurde -- beides kann eine lokale Summe
nicht. Außerdem liefert es Werte für Konten, deren schreibende App nur Tagessummen und gar keine
Intraday-Intervalle veröffentlicht; für die meldete der alte Weg schlicht "keine Schrittdaten".

- `get_google_health_steps` -- Schritte pro Kalendertag, bei Zeiträumen bis 48 h zusätzlich die
  Einzelintervalle; fällt auf die Intervall-Summe zurück, falls das Rollup leer bleibt.
- `get_google_health_activity` -- Tageszeile aus Schritten, Distanz, aktiven Minuten und aktiv
  verbrannten Kalorien (vier Rollups parallel, ein fehlender Datentyp lässt die anderen stehen).

Die API begrenzt Rollup-Zeiträume selbst: 14 Tage für `active-minutes`/`total-calories`, 90 Tage
für alles andere -- `fetch_daily_rollup` kappt entsprechend und behält die neuesten Tage. Zeitraum
und Tagesgrenzen sind **zivile** (lokale) Kalendertage, passend zur `TZ` des Containers.

`backend/app/mcp_client.py` unterstützt drei Transporte, alle live gegen echte Server verifiziert:

- **Streamable HTTP** (aktueller MCP-Standard, 2025-03-26) -- ein POST-Endpunkt, JSON- oder
  SSE-Antwort, `Mcp-Session-Id`-Header wird durchgereicht.
- **SSE** (älterer, weiterhin verbreiteter Transport) -- ein offener `GET /sse`-Stream liefert im
  ersten Event den echten POST-Pfad, Antworten kommen über denselben Stream zurück.
- **OpenAPI-Proxy** (z. B. [`mcpo`](https://github.com/open-webui/mcpo)) -- eigentlich kein MCP,
  aber ein häufiges Muster: jeder OpenAPI-Pfad ist ein Werkzeug, Aufruf ist ein simpler POST.

### OAuth2 für MCP-Server (z. B. Withings)

Server, die per OAuth2 statt eines statischen Tokens authentifizieren -- Withings ist der konkrete
Fall, der das ausgelöst hat -- lassen sich über Auth-Typ "OAuth2" anbinden
(`backend/app/oauth.py`): Authorization Code Flow + PKCE, manuelle Endpoint-/Client-Eintragung
(keine automatische Discovery). Ablauf:

1. Eigene App im Entwickler-Portal des Providers registrieren (bei Withings:
   [account.withings.com/partner/add_oauth2](https://account.withings.com/partner/add_oauth2)) --
   liefert Client-ID und Client-Secret.
2. Als Redirect-URI genau `http(s)://<host>:<port>/api/mcp-servers/oauth/callback` eintragen (bei
   192.168.1.110: `http://192.168.1.110:8180/api/mcp-servers/oauth/callback`).
3. Server in GlucoSphere-Web anlegen, Auth-Typ "OAuth2", Client-ID/Secret sowie Authorization-/
   Token-Endpoint eintragen, speichern.
4. "Login mit Provider" -- leitet zum Provider weiter, nach Zustimmung zurück in die App.

Access-Token-Refresh läuft automatisch vor jedem Tool-Aufruf (`oauth.get_valid_access_token`).

### Aufbau der Übersicht: Live-Teil und Auswertung

Die Übersicht besteht aus zwei Teilen mit bewusst unterschiedlicher Ökonomie:

1. **Live-Kachel** (`components/LiveGlucoseTile.tsx`, `GET /api/live-status`) -- aktueller Wert mit
   Tendenz und die 24h-Kurve, direkt aus den nativen Echtzeit-Quellen (Nightscout, Dexcom,
   LibreLinkUp). **Kein LLM, keine MCP-Quellen** (deren Extraktion läuft über LLM-Runden und dauert
   zig Sekunden -- das gehört nicht hinter einen 30-Sekunden-Takt). Der Wert aktualisiert sich alle
   30 s, die Kurve alle 15 min, beides pausiert in einem nicht sichtbaren Tab. Der **Stand** des
   Messwerts steht immer dabei; ab 15 Minuten Alter verliert die Kachel ihre Ampelfarbe und
   markiert den Wert als veraltet, statt eine Aussage über "jetzt" vorzutäuschen.
   Die Hintergrundfarbe richtet sich nach dem Wert *und* der Tendenz: fällt der Wert schnell und
   liegt unter 100 mg/dL (oder steigt schnell über 150), wechselt die Kachel eine Stufe früher --
   sonst wäre die Warnung erst da, wenn die Grenze bereits überschritten ist.
2. **Auswertung** darunter -- Zeitraum, Quellenauswahl und "Aktualisieren", Stand + LLM-Dauer, dann
   Kennzahlen, KI-Zusammenfassung, Anbieter/Modell + Quellen und zuletzt die Hinweise zur
   Datenqualität. Sie wird nur auf Knopfdruck neu gebaut (ein Durchlauf kann Minuten dauern).

Datenlücken erwähnt die KI-Zusammenfassung bewusst **nicht** mehr: sie werden ihr als Kontext
mitgegeben, damit sie Kennzahlen aus einem lückenhaften Fenster nicht überinterpretiert, aber
ausgegeben werden sie wortgleich im eigenen Hinweis-Block darunter -- vorher stand dieselbe Warnung
zweimal da, einmal davon umformuliert.

### Datenquellen-Auswahl auf der Übersicht (Mehrquellen)

Über der Übersicht lässt sich per Chip (wie die Zeitraum-Auswahl) ein-/ausschalten, welche Quelle
für die aktuelle Ansicht einfließt -- unabhängig vom globalen "aktiviert"-Schalter in den
Einstellungen. `GET /api/dashboard-sources` listet die Kandidaten: die direkte Nightscout-API
sowie jeden aktiven MCP-Server der Kategorie "Diabetes/Blutzucker" (z. B. Glooko, ein zweiter
Nightscout-MCP-Server, ...).

Da die TIR/Hypo/Hyper/%CV-Formeln rohe Blutzucker-Einzelmesswerte brauchen und jeder MCP-Server
andere Werkzeugnamen/Ausgabeformate hat (anders als die eine feste Nightscout-API-Form), holt
`backend/app/dashboard_sources.py` diese Werte für Nicht-Nightscout-Quellen über zwei gezielte
LLM-Aufrufe: (1) das passende Werkzeug für den Zeitraum aufrufen (echtes Tool-Calling, wie im
Chat), (2) die rohe Werkzeug-Antwort in ein festes `[{t, v}]`-Format umwandeln. Danach laufen
exakt dieselben deterministischen Formeln wie bei Nightscout. Mehrere gleichzeitig ausgewählte
Quellen werden pro Kennzahl gemittelt (wie in der Android-App), sichtbar als "Kombinierte
Auswertung (...)" über dem Status. Braucht einen konfigurierten Cloud-LLM-Provider -- ohne
API-Key bleiben Nicht-Nightscout-Quellen leer statt einen Fehler zu werfen.

## Modell-Auswahl aktuell halten (ohne neues Release)

"Einstellungen -> LLM-Konfiguration -> **Modelle aktualisieren**" holt die aktuell verfügbaren
Modelle direkt beim jeweiligen Anbieter ab und übernimmt die 4 relevantesten in die Auswahl
(`backend/app/model_discovery.py`, gecacht in `settings.providerModelCache`):

| Anbieter | Endpunkt | Auth |
| --- | --- | --- |
| OpenAI/OpenRouter | `GET {baseUrl}/models` | `Authorization: Bearer <key>` |
| Anthropic Claude | `GET {baseUrl}/models` | `x-api-key: <key>`, `anthropic-version: 2023-06-01` |
| Google Gemini | `GET .../v1beta/models?key=<key>` | Key als Query-Parameter |
| DeepSeek | `GET https://api.deepseek.com/models` | `Authorization: Bearer <key>` |

Die Rohlisten sind lang und enthalten viele Nicht-Chat-Modelle (Embeddings, TTS, Bild, Moderation);
`pick_relevant` filtert diese heraus, entdoppelt Alias-/Datums- und Verpackungs-Varianten
(`…-latest`, `…-20251001`, `…-0731`, `…-fast`, `…-16k`), sortiert nach Versionsnummer und liefert
höchstens 4 Einträge -- bewusst **schnellstes zuerst, Flaggschiff zuletzt**, weil "Automatisch"
genau diese Reihenfolge nutzt (Chat = erstes, Übersicht-Analyse = letztes, siehe
`model_catalog.resolve`). Sobald eine Live-Liste existiert, löst "Automatisch" auch nur noch
innerhalb dieser Liste auf -- sonst würde die App eine fest verdrahtete, womöglich abgekündigte
Modell-ID aufrufen.

Zwei Details, die aus dem Abgleich mit den echten Katalogen stammen:

- Die Marker werden auf **ID-Segmenten** verglichen, nicht als Teilzeichenketten: "ge**mini**"
  enthält "mini", wodurch vorher *jedes* Gemini-Modell als schnelles Modell galt, der
  Flaggschiff-Platz leer blieb und das `-flash-lite` seinen Platz verlor.
- Die günstigste Stufe (`…-flash-lite`, `…-lite`, `…-nano`) bekommt garantiert einen Platz und
  steht vorn: nach reiner Versionssortierung verliert sie sonst gegen das teurere `flash`/`mini`
  derselben Generation -- obwohl genau sie der sinnvolle Alltags-Default für den Chat ist.

Es ist eine Heuristik, keine kuratierte Liste -- das ist der Punkt: sie funktioniert auch für
Modelle, die es beim Bauen dieser Version noch nicht gab. Alles, was sie nicht trifft, bleibt über
"Manuelle Eingabe" erreichbar, und "Auf mitgelieferte Liste zurücksetzen" macht den Abruf rückgängig.

## Sprache (DE/EN)

Die UI ist zweisprachig (Deutsch/Englisch), umschaltbar unter "Einstellungen" -- persistiert in
`Settings.appLanguage`. Umsetzung: `frontend/src/lib/strings.ts` (ein flaches DE/EN-Objekt, analog
zur Android-App's `Strings.kt`, aber ohne deren Dex-Verifier-Problem mit sehr vielen
Konstruktor-Parametern, da hier nur ein Objektliteral statt eines Kotlin-Data-Class-Konstruktors
verwendet wird) + `LanguageContext.tsx`.

Übersetzt ist auch alles, was der Server an Text erzeugt und die Oberfläche wortgleich anzeigt:
Zeitraum-Beschriftung, Ampel-Begründung (`nightscout.compute_status`), Datenlücken-Warnungen
(`format_gap_warning`, mit eigenem Hinweis-Präfix je Sprache) und der Analyse-Prompt selbst -- die
KI-Zusammenfassung wird also in der Sprache des jeweiligen Kontos erzeugt, nicht in der des
Servers. `_parse_narrative` akzeptiert beide Marker-Sprachen (`ZUSAMMENFASSUNG:`/`SUMMARY:`), weil
Modelle gelegentlich mit der Überschrift der anderen Sprache antworten. Der `/api/mcp`-Server
antwortet immer englisch -- seine gesamte Oberfläche (Tool-Namen, Beschreibungen, Feldnamen) ist es.

## PDF-Export & Voice-Modus

**PDF-Export**: Chat-Antworten (📄-Link unter jeder Antwort) und die Übersicht (📄-Symbol oben)
lassen sich exportieren -- ohne PDF-Bibliothek im Client, stattdessen über den nativen
Druckdialog des Browsers ("Als PDF speichern"), siehe `frontend/src/lib/pdfExport.ts`. Jeder Export
trägt dieselbe Herkunftsangabe wie die Bildschirmansicht ("Ausgewertet mit: … / Quelle(n): …"), damit
ein ausgedruckter Bericht nachvollziehbar bleibt.

**Voice-Modus**: Mikrofon-Eingabe (Spracherkennung) und Vorlesen einzelner Chat-Antworten
(Sprachausgabe) über die Web Speech API, siehe `ChatPage.tsx`. Browserabhängig -- Spracherkennung
ist aktuell im Wesentlichen Chrome/Edge-only (kein Firefox/Safari), die Buttons blenden sich per
Feature-Detection selbst aus, wenn der Browser sie nicht unterstützt.

## Logging (Einstellungen -> Logging, nur ADMIN)

Drei Protokolle unter einem Menüpunkt:

- **Performance-Log** -- jede LLM-Anfrage mit Anbieter, Modell, Tokens, Dauer und Fehlermeldung.
  Rollierend, die letzten 200 Einträge.
- **Token & Kosten** -- kumulierter Token-Verbrauch je Anbieter/Modell (`token_usage`-Tabelle, läuft
  unabhängig vom 200er-Fenster des Performance-Logs weiter) plus optionale Kostenschätzung. Die
  Preise pro 1 Mio. Tokens werden je Modell selbst eingetragen -- Anbieter-Preislisten ändern sich
  laufend und unterscheiden sich je Tarif/Region, hart verdrahtete Raten wären still falsch. Ohne
  hinterlegten Preis werden nur Tokens gezählt (Kosten: "--", nicht "0"). "Verbrauch zurücksetzen"
  leert nur die Zähler, die Preise bleiben.
  Preise lassen sich per Knopfdruck aus der öffentlichen OpenRouter-Modell-Liste beziehen
  (`https://openrouter.ai/api/v1/models`, ohne API-Key) -- dort stehen auch die Preise der über
  OpenRouter angebotenen Modelle von Anthropic, OpenAI, Google und DeepSeek. Die Anbieter-eigenen
  Endpunkte (`/v1/models` bei OpenAI/Anthropic, `models?key=` bei Gemini, `/models` bei DeepSeek)
  liefern **keine** Preise, nur Modell-IDs -- deshalb ist OpenRouter die Preisquelle, unabhängig
  vom konfigurierten Anbieter. Bereits von Hand eingetragene Preise werden dabei standardmäßig
  nicht überschrieben (Checkbox), und ein Modell, das OpenRouter nicht führt, bleibt ohne Preis
  statt einen geschätzten zu bekommen.
- **Benutzung & Zugriffe** -- wer sich wann an-/abgemeldet hat (inkl. fehlgeschlagener Anmeldungen),
  welche Fragen gestellt, welche Tools ausgeführt und welche Übersichten erzeugt wurden; filterbar
  nach Ereignis, Benutzer und Freitext. Optional zusätzlich ein **Access-Log** (jede API-Anfrage mit
  Methode, Pfad, Status, Dauer -- auch abgelehnte 401/403), standardmäßig aus, da sehr geschwätzig.
  Die letzten 5000 Einträge.

## Known limitations (MVP-Stand)

Bewusste Scope-Entscheidung für die erste Version (siehe Absprache): MVP zuerst, iterativ ausbauen.
Nicht enthalten:

- **Lokales Modell** (LiteRT/Gemma) -- nur Cloud-Anbieter (Gemini, Claude, OpenAI/OpenRouter,
  DeepSeek, OneProvider).
- **OAuth2-Discovery/Dynamic Client Registration** (RFC8414/RFC7591) für MCP-Server -- OAuth2 selbst
  wird unterstützt (siehe "MCP-Server & Tool-Calling"), aber Endpoints/Client-ID/Secret müssen
  manuell eingetragen werden (eigene App im Entwickler-Portal des Providers registrieren, z. B.
  Withings), keine automatische Erkennung.
- **Lizenzstufen** (Free/User/Developer mit Nutzungslimits) -- bewusst NICHT portiert: für ein
  selbst gehostetes Tool im eigenen Netz ohne App-Store-Vertrieb ergibt Monetarisierung/Lizenzierung
  keinen Sinn mehr.
- **Nur zwei feste Rollen** (ADMIN/MEMBER, siehe "Auth & Mehrere Benutzer") -- kein granulareres
  Rechtesystem (z. B. "darf Datenquellen sehen, aber nicht ändern"). Weiterhin ein Tool für den
  Betrieb im eigenen, vertrauenswürdigen Netzwerk, nicht fürs offene Internet gedacht.
- Dashboard-Metriken (TIR/Hypo/Hyper/%CV/GMI) werden -- anders als in der Android-App, wo das LLM
  sie aus MCP-Tool-Ergebnissen berechnet -- hier deterministisch im Backend aus den rohen
  Nightscout-Werten berechnet (gleiche Formeln/Schwellwerte wie die Android-App eigene
  STUFE-1-Vorschau, siehe `backend/app/nightscout.py`). Robuster, aber eine bewusste Abweichung vom
  Original-Ansatz.

## Lokale Entwicklung (ohne Docker)

Backend:

```bash
cd backend
python -m venv .venv && . .venv/Scripts/activate  # oder source .venv/bin/activate unter Linux/Mac
pip install -r requirements.txt
GLUCOSPHERE_DB_PATH=./dev.db uvicorn app.main:app --reload
```

Frontend (proxied gegen das lokale Backend auf Port 8000):

```bash
cd frontend
npm install
npm run dev
```
