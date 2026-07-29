"""SQLite persistence. Multi-user (see README "Mehrere Benutzer"): one shared `settings` blob
(API keys, Nightscout, MCP servers -- the household's/team's shared data source config, ADMIN-only)
plus a `users` table for accounts (own login, role, chat history, personalization).

Settings are stored as one JSON blob (mirrors the Android app's DataStore `AppSettings` shape)
rather than one column per field: the settings shape is still evolving during the MVP phase, and
a JSON blob means adding a field never needs a migration. Chat history gets real columns since
it's queried/filtered, not just round-tripped whole.
"""
from __future__ import annotations

import json
import os
import sqlite3
import time
import uuid
from contextlib import contextmanager
from typing import Any, Iterator

DB_PATH = os.environ.get("GLUCOSPHERE_DB_PATH", "/data/glucosphere.db")

_SCHEMA = """
CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);

CREATE TABLE IF NOT EXISTS credentials (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'MEMBER',
    display_name TEXT NOT NULL DEFAULT '',
    user_role TEXT NOT NULL DEFAULT 'DIABETIKER',
    app_language TEXT NOT NULL DEFAULT 'DE',
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS mcp_servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    transport TEXT NOT NULL DEFAULT 'STREAMABLE_HTTP',
    auth_method TEXT NOT NULL DEFAULT 'NONE',
    token TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'OTHER',
    enabled INTEGER NOT NULL DEFAULT 0,
    auto_run_tools INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS llm_request_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    purpose TEXT NOT NULL,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    tool_calls INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER NOT NULL,
    success INTEGER NOT NULL,
    error_message TEXT,
    detail TEXT,
    created_at INTEGER NOT NULL
);

-- One row per data source (native API id or MCP server id) that has ever passed a health check /
-- test-connection -- lets the Datenquellen page show "yellow" (reachable before, failing now) vs.
-- "red" (never worked) instead of just green/red.
CREATE TABLE IF NOT EXISTS source_health (
    source_id TEXT PRIMARY KEY,
    last_ok_at INTEGER NOT NULL
);
"""

_MAX_LOG_ENTRIES = 200

DEFAULT_SETTINGS: dict[str, Any] = {
    "systemPrompt": None,  # None -> use server-side DEFAULT_SYSTEM_PROMPT
    "additionalInstructions": "",
    "llmProviderType": "GEMINI",
    "geminiApiKey": "",
    "geminiModel": "auto",
    "claudeApiKey": "",
    "claudeBaseUrl": "https://api.anthropic.com/v1",
    "claudeModel": "auto",
    "openAiApiKey": "",
    "openAiBaseUrl": "https://api.openai.com/v1",
    "openAiModel": "auto",
    "deepseekApiKey": "",
    "deepseekModel": "auto",
    "nightscoutApiUrl": "",
    "nightscoutApiSecret": "",
    "nightscoutApiAuthMethod": "API_SECRET_HEADER",
    "nightscoutApiEnabled": True,
    "feelfitEmail": "",
    "feelfitPassword": "",
    "feelfitEnabled": True,
    "googleHealthClientId": "",
    "googleHealthClientSecret": "",
    "googleHealthEnabled": True,
    "googleHealthAccessToken": "",
    "googleHealthRefreshToken": "",
    "googleHealthExpiresAt": 0,
    "googleHealthOAuthState": "",
    "googleHealthOAuthPkceVerifier": "",
    "googleHealthOAuthRedirectUri": "",
    # Withings Public REST API -- native OAuth2 (Authorization Code + PKCE), same shape/fields as
    # Google Health above, see withings.py.
    "withingsClientId": "",
    "withingsClientSecret": "",
    "withingsEnabled": True,
    "withingsAccessToken": "",
    "withingsRefreshToken": "",
    "withingsExpiresAt": 0,
    "withingsOAuthState": "",
    "withingsOAuthPkceVerifier": "",
    "withingsOAuthRedirectUri": "",
    "dexcomUsername": "",
    "dexcomPassword": "",
    "dexcomRegion": "US",
    "dexcomEnabled": True,
    "libreEmail": "",
    "librePassword": "",
    "libreRegion": "US",
    "libreEnabled": True,
    # Glooko aggregates data from many pump brands -- deliberately vendor-agnostic, see glooko.py.
    "glookoUsername": "",
    "glookoPassword": "",
    "glookoEnabled": True,
    # Purely organizational tags for the native-API cards on Datenquellen (mirrors the category an
    # MCP server is tagged with) -- user-editable, since e.g. Google Health is primarily an
    # activity/sleep hub with glucose only incidentally synced in from another app, not really a
    # "Diabetes / Blutzucker" source by default the way Nightscout/Dexcom/Libre are.
    "nightscoutCategory": "GLUCOSE_TREATMENTS",
    "dexcomCategory": "GLUCOSE_TREATMENTS",
    "libreCategory": "GLUCOSE_TREATMENTS",
    "feelfitCategory": "BODY_METRICS",
    "googleHealthCategory": "ACTIVITY",
    "glookoCategory": "GLUCOSE_TREATMENTS",
    "withingsCategory": "BODY_METRICS",
    # Bearer token for GlucoSphere-Web AS an MCP server (see mcp_server.py, /api/mcp) -- distinct
    # from `mcp_servers` above, which is this app acting as an MCP CLIENT of other servers. Empty
    # means "not yet generated"; AuthMiddleware rejects every /api/mcp request while empty.
    "mcpServerToken": "",
}


def _connect() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


_MCP_OAUTH_COLUMNS = {
    "oauth_client_id": "TEXT NOT NULL DEFAULT ''",
    "oauth_client_secret": "TEXT NOT NULL DEFAULT ''",
    "oauth_auth_endpoint": "TEXT NOT NULL DEFAULT ''",
    "oauth_token_endpoint": "TEXT NOT NULL DEFAULT ''",
    "oauth_scope": "TEXT NOT NULL DEFAULT ''",
    "oauth_redirect_uri": "TEXT NOT NULL DEFAULT ''",
    "oauth_access_token": "TEXT NOT NULL DEFAULT ''",
    "oauth_refresh_token": "TEXT NOT NULL DEFAULT ''",
    "oauth_expires_at": "INTEGER NOT NULL DEFAULT 0",
    "oauth_pkce_verifier": "TEXT NOT NULL DEFAULT ''",
    "oauth_state": "TEXT NOT NULL DEFAULT ''",
}


def _migrate_mcp_oauth_columns(conn: sqlite3.Connection) -> None:
    """SQLite `ALTER TABLE ... ADD COLUMN` migration for the OAuth2 fields added after
    `mcp_servers` first shipped -- additive only, safe to run against a DB that already has real
    server rows (checked live against the production DB on 192.168.1.110's Google Fit/FeelFit/
    Omada entries before this went out)."""
    existing = {r[1] for r in conn.execute("PRAGMA table_info(mcp_servers)").fetchall()}
    for column, decl in _MCP_OAUTH_COLUMNS.items():
        if column not in existing:
            conn.execute(f"ALTER TABLE mcp_servers ADD COLUMN {column} {decl}")


def _add_column_if_missing(conn: sqlite3.Connection, table: str, column: str, decl: str) -> None:
    existing = {r[1] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()}
    if column not in existing:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {decl}")


def _migrate_multi_user(conn: sqlite3.Connection) -> None:
    """One-time migration from the single-admin `credentials` row to the `users` table (see
    README "Mehrere Benutzer"). `sessions`/`chat_sessions` predate `user_id` -- both existing
    tables get the column added (CREATE TABLE IF NOT EXISTS in _SCHEMA only applies to a table
    that doesn't exist yet, so a fresh install and an upgrade both need this), then every existing
    row is backfilled to whichever account the old singleton credentials become, so nobody loses
    access to their already-configured login or existing chat history across the upgrade."""
    _add_column_if_missing(conn, "sessions", "user_id", "TEXT NOT NULL DEFAULT ''")
    _add_column_if_missing(conn, "chat_sessions", "user_id", "TEXT NOT NULL DEFAULT ''")

    if conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] > 0:
        return
    old = conn.execute("SELECT username, password_hash, salt FROM credentials WHERE id = 1").fetchone()
    if old is None:
        return
    admin_id = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO users (id, username, password_hash, salt, role, created_at) VALUES (?, ?, ?, ?, 'ADMIN', ?)",
        (admin_id, old["username"], old["password_hash"], old["salt"], int(time.time() * 1000)),
    )
    conn.execute("UPDATE chat_sessions SET user_id = ? WHERE user_id = ''", (admin_id,))
    conn.execute("UPDATE sessions SET user_id = ? WHERE user_id = ''", (admin_id,))


def _migrate_message_metadata(conn: sqlite3.Connection) -> None:
    """duration_ms/success/provider/model on chat_messages -- only ever set for assistant
    messages (see add_message), shown under each answer in the UI (date-time/duration/status)."""
    _add_column_if_missing(conn, "chat_messages", "duration_ms", "INTEGER")
    _add_column_if_missing(conn, "chat_messages", "success", "INTEGER")
    _add_column_if_missing(conn, "chat_messages", "provider", "TEXT")
    _add_column_if_missing(conn, "chat_messages", "model", "TEXT")


def init_db() -> None:
    with _connect() as conn:
        conn.executescript(_SCHEMA)
        _migrate_mcp_oauth_columns(conn)
        _migrate_multi_user(conn)
        _migrate_message_metadata(conn)
        _add_column_if_missing(conn, "mcp_servers", "is_realtime", "INTEGER NOT NULL DEFAULT 0")
        _add_column_if_missing(conn, "users", "glucose_unit", "TEXT NOT NULL DEFAULT 'MG_DL'")
        _add_column_if_missing(conn, "users", "insulin_pump", "TEXT NOT NULL DEFAULT 'NONE'")
        _add_column_if_missing(conn, "users", "cgm_system", "TEXT NOT NULL DEFAULT 'NONE'")
        _add_column_if_missing(conn, "mcp_servers", "oauth_token_action", "TEXT NOT NULL DEFAULT ''")
        # For FACHPERSONAL/ANGEHOERIGE accounts: which DIABETIKER account's data sources/device
        # settings the system prompt should use (see main.py::send_message). Self-service, set via
        # ProfilePage.tsx alongside the user's own role -- empty for DIABETIKER accounts (they are
        # their own main user).
        _add_column_if_missing(conn, "users", "linked_main_user_id", "TEXT NOT NULL DEFAULT ''")
        # Clinical stammdata of the Hauptpatient (see ProfilePage.tsx / GET /api/patient-profile) --
        # only meaningful on a DIABETIKER account's own row, same pattern as glucose_unit/
        # insulin_pump/cgm_system above. birth_date is an ISO date (YYYY-MM-DD), diabetes_since a
        # plain year string -- both kept as TEXT since they're only ever displayed, never computed.
        _add_column_if_missing(conn, "users", "last_name", "TEXT NOT NULL DEFAULT ''")
        _add_column_if_missing(conn, "users", "birth_date", "TEXT NOT NULL DEFAULT ''")
        _add_column_if_missing(conn, "users", "diabetes_since", "TEXT NOT NULL DEFAULT ''")
        # "Einstellungen -> Erscheinungsbild" -- per-user like app_language (one browser login is
        # one person's own preference, not a shared device setting the way it is on Android).
        _add_column_if_missing(conn, "users", "color_theme", "TEXT NOT NULL DEFAULT 'MEDICAL_BLUE'")
        row = conn.execute("SELECT 1 FROM settings WHERE id = 1").fetchone()
        if row is None:
            conn.execute(
                "INSERT INTO settings (id, data) VALUES (1, ?)",
                (json.dumps(DEFAULT_SETTINGS),),
            )


@contextmanager
def get_conn() -> Iterator[sqlite3.Connection]:
    conn = _connect()
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def load_settings() -> dict[str, Any]:
    with get_conn() as conn:
        row = conn.execute("SELECT data FROM settings WHERE id = 1").fetchone()
        stored = json.loads(row["data"]) if row else {}
    merged = {**DEFAULT_SETTINGS, **stored}
    return merged


def save_settings(patch: dict[str, Any]) -> dict[str, Any]:
    current = load_settings()
    current.update({k: v for k, v in patch.items() if v is not None or k in DEFAULT_SETTINGS})
    with get_conn() as conn:
        conn.execute("UPDATE settings SET data = ? WHERE id = 1", (json.dumps(current),))
    return current


def create_session(user_id: str, title: str) -> dict[str, Any]:
    session_id = str(uuid.uuid4())
    created_at = int(time.time() * 1000)
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO chat_sessions (id, user_id, title, created_at) VALUES (?, ?, ?, ?)",
            (session_id, user_id, title, created_at),
        )
    return {"id": session_id, "title": title, "createdAt": created_at}


def list_sessions(user_id: str) -> list[dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, title, created_at FROM chat_sessions WHERE user_id = ? ORDER BY created_at DESC",
            (user_id,),
        ).fetchall()
    return [{"id": r["id"], "title": r["title"], "createdAt": r["created_at"]} for r in rows]


def _session_belongs_to(conn: sqlite3.Connection, session_id: str, user_id: str) -> bool:
    row = conn.execute("SELECT 1 FROM chat_sessions WHERE id = ? AND user_id = ?", (session_id, user_id)).fetchone()
    return row is not None


def delete_session(session_id: str, user_id: str) -> None:
    with get_conn() as conn:
        conn.execute("DELETE FROM chat_sessions WHERE id = ? AND user_id = ?", (session_id, user_id))


def rename_session(session_id: str, user_id: str, title: str) -> dict[str, Any]:
    with get_conn() as conn:
        if not _session_belongs_to(conn, session_id, user_id):
            raise PermissionError("Session gehört nicht diesem Benutzer.")
        conn.execute("UPDATE chat_sessions SET title = ? WHERE id = ?", (title, session_id))
        row = conn.execute(
            "SELECT id, title, created_at FROM chat_sessions WHERE id = ?", (session_id,),
        ).fetchone()
    return {"id": row["id"], "title": row["title"], "createdAt": row["created_at"]}


def mark_source_ok(source_id: str, when_millis: int) -> None:
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO source_health (source_id, last_ok_at) VALUES (?, ?) "
            "ON CONFLICT(source_id) DO UPDATE SET last_ok_at = excluded.last_ok_at",
            (source_id, when_millis),
        )


def get_source_health() -> dict[str, int]:
    with get_conn() as conn:
        rows = conn.execute("SELECT source_id, last_ok_at FROM source_health").fetchall()
    return {r["source_id"]: r["last_ok_at"] for r in rows}


def add_message(
    session_id: str, user_id: str, role: str, content: str,
    duration_ms: int | None = None, success: bool | None = None,
    provider: str | None = None, model: str | None = None,
) -> dict[str, Any]:
    """`duration_ms`/`success`/`provider`/`model` are only ever passed for assistant messages
    (see main.py::send_message) -- shown under each answer in the UI (date-time/duration/status)."""
    created_at = int(time.time() * 1000)
    with get_conn() as conn:
        if not _session_belongs_to(conn, session_id, user_id):
            raise PermissionError("Session gehört nicht diesem Benutzer.")
        cur = conn.execute(
            "INSERT INTO chat_messages (session_id, role, content, created_at, duration_ms, success, provider, model) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (session_id, role, content, created_at, duration_ms, None if success is None else int(success), provider, model),
        )
        message_id = cur.lastrowid
    return {
        "id": message_id, "sessionId": session_id, "role": role, "content": content, "createdAt": created_at,
        "durationMs": duration_ms, "success": success, "provider": provider, "model": model,
    }


def list_messages(session_id: str, user_id: str) -> list[dict[str, Any]]:
    with get_conn() as conn:
        if not _session_belongs_to(conn, session_id, user_id):
            raise PermissionError("Session gehört nicht diesem Benutzer.")
        rows = conn.execute(
            "SELECT id, session_id, role, content, created_at, duration_ms, success, provider, model "
            "FROM chat_messages WHERE session_id = ? ORDER BY id ASC",
            (session_id,),
        ).fetchall()
    return [
        {
            "id": r["id"], "sessionId": r["session_id"], "role": r["role"], "content": r["content"],
            "createdAt": r["created_at"], "durationMs": r["duration_ms"],
            "success": None if r["success"] is None else bool(r["success"]),
            "provider": r["provider"], "model": r["model"],
        }
        for r in rows
    ]


def clear_messages(session_id: str, user_id: str) -> None:
    """Empties a session's messages but keeps the session itself -- "Chatverlauf löschen"
    (clear history, keep the conversation slot), distinct from delete_session (removes the
    session entirely, used when deleting a whole entry from the session list)."""
    with get_conn() as conn:
        if not _session_belongs_to(conn, session_id, user_id):
            raise PermissionError("Session gehört nicht diesem Benutzer.")
        conn.execute("DELETE FROM chat_messages WHERE session_id = ?", (session_id,))


# ---------------------------------------------------------------------------
# Auth: users + sessions
# ---------------------------------------------------------------------------

def _user_row_to_dict(r: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": r["id"],
        "username": r["username"],
        "role": r["role"],
        "displayName": r["display_name"],
        "userRole": r["user_role"],
        "appLanguage": r["app_language"],
        "glucoseUnit": r["glucose_unit"],
        "insulinPump": r["insulin_pump"],
        "cgmSystem": r["cgm_system"],
        "linkedMainUserId": r["linked_main_user_id"],
        "lastName": r["last_name"],
        "birthDate": r["birth_date"],
        "diabetesSince": r["diabetes_since"],
        "colorTheme": r["color_theme"],
        "createdAt": r["created_at"],
    }


def count_users() -> int:
    with get_conn() as conn:
        return conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]


def create_user(username: str, password_hash: str, salt: str, role: str, display_name: str = "") -> dict[str, Any]:
    user_id = str(uuid.uuid4())
    created_at = int(time.time() * 1000)
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO users (id, username, password_hash, salt, role, display_name, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (user_id, username, password_hash, salt, role, display_name, created_at),
        )
    return get_user(user_id)  # type: ignore[return-value]


def list_users() -> list[dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM users ORDER BY created_at ASC").fetchall()
    return [_user_row_to_dict(r) for r in rows]


def list_diabetiker_accounts() -> list[dict[str, Any]]:
    """Just id/displayName, not a full user record -- for the "linked main user" picker on
    FACHPERSONAL/ANGEHOERIGE profiles (see ProfilePage.tsx), which any logged-in user (not just
    ADMIN) needs to populate, unlike list_users()/GET /api/users which is admin-only."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, display_name, username FROM users WHERE user_role = 'DIABETIKER' ORDER BY created_at ASC",
        ).fetchall()
    return [{"id": r["id"], "displayName": r["display_name"] or r["username"]} for r in rows]


def get_user(user_id: str) -> dict[str, Any] | None:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return _user_row_to_dict(row) if row else None


def get_user_by_username_raw(username: str) -> dict[str, Any] | None:
    """Includes password_hash/salt -- only for verifying a login, never returned from an API."""
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    if row is None:
        return None
    d = _user_row_to_dict(row)
    d["passwordHash"] = row["password_hash"]
    d["salt"] = row["salt"]
    return d


def get_user_raw(user_id: str) -> dict[str, Any] | None:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if row is None:
        return None
    d = _user_row_to_dict(row)
    d["passwordHash"] = row["password_hash"]
    d["salt"] = row["salt"]
    return d


def update_own_profile(
    user_id: str, display_name: str, user_role: str, app_language: str,
    glucose_unit: str = "MG_DL", insulin_pump: str = "NONE", cgm_system: str = "NONE",
    linked_main_user_id: str = "", last_name: str = "", birth_date: str = "", diabetes_since: str = "",
    color_theme: str = "MEDICAL_BLUE",
) -> dict[str, Any]:
    with get_conn() as conn:
        conn.execute(
            "UPDATE users SET display_name = ?, user_role = ?, app_language = ?, "
            "glucose_unit = ?, insulin_pump = ?, cgm_system = ?, linked_main_user_id = ?, "
            "last_name = ?, birth_date = ?, diabetes_since = ?, color_theme = ? WHERE id = ?",
            (
                display_name, user_role, app_language, glucose_unit, insulin_pump, cgm_system,
                linked_main_user_id, last_name, birth_date, diabetes_since, color_theme, user_id,
            ),
        )
    return get_user(user_id)  # type: ignore[return-value]


def admin_update_user(
    user_id: str, role: str | None, username: str | None,
    user_role: str | None = None, linked_main_user_id: str | None = None,
) -> dict[str, Any] | None:
    updates, params = [], []
    if role is not None:
        updates.append("role = ?")
        params.append(role)
    if username is not None:
        updates.append("username = ?")
        params.append(username)
    if user_role is not None:
        updates.append("user_role = ?")
        params.append(user_role)
    if linked_main_user_id is not None:
        updates.append("linked_main_user_id = ?")
        params.append(linked_main_user_id)
    if not updates:
        return get_user(user_id)
    params.append(user_id)
    with get_conn() as conn:
        conn.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", params)
    return get_user(user_id)


def set_user_password(user_id: str, password_hash: str, salt: str) -> None:
    with get_conn() as conn:
        conn.execute("UPDATE users SET password_hash = ?, salt = ? WHERE id = ?", (password_hash, salt, user_id))


def delete_user(user_id: str) -> None:
    with get_conn() as conn:
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM chat_sessions WHERE user_id = ?", (user_id,))


def create_db_session(token: str, user_id: str, ttl_seconds: int) -> None:
    now = int(time.time())
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
            (token, user_id, now, now + ttl_seconds),
        )


def get_db_session(token: str) -> dict[str, Any] | None:
    with get_conn() as conn:
        row = conn.execute("SELECT token, user_id, expires_at FROM sessions WHERE token = ?", (token,)).fetchone()
    if row is None:
        return None
    if row["expires_at"] < int(time.time()):
        delete_db_session(token)
        return None
    return {"token": row["token"], "userId": row["user_id"], "expiresAt": row["expires_at"]}


def delete_db_session(token: str) -> None:
    with get_conn() as conn:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))


# ---------------------------------------------------------------------------
# MCP servers
# ---------------------------------------------------------------------------

def _mcp_row_to_dict(r: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": r["id"],
        "name": r["name"],
        "url": r["url"],
        "transport": r["transport"],
        "authMethod": r["auth_method"],
        "token": r["token"],
        "category": r["category"],
        "enabled": bool(r["enabled"]),
        "autoRunTools": bool(r["auto_run_tools"]),
        "isRealtime": bool(r["is_realtime"]),
        "createdAt": r["created_at"],
        "oauthClientId": r["oauth_client_id"],
        "oauthClientSecret": r["oauth_client_secret"],
        "oauthAuthEndpoint": r["oauth_auth_endpoint"],
        "oauthTokenEndpoint": r["oauth_token_endpoint"],
        "oauthScope": r["oauth_scope"],
        "oauthRedirectUri": r["oauth_redirect_uri"],
        # Optional extra `action` form field some providers require in the token request body
        # alongside the standard OAuth2 fields (e.g. Withings needs `action=requesttoken`,
        # confirmed against their currently-maintained client -- not standard OAuth2, but Withings
        # implements its token endpoint as one more `action`-dispatched call on their general API).
        "oauthTokenAction": r["oauth_token_action"],
        # Access/refresh tokens deliberately NOT exposed to the frontend -- only whether we have
        # one, so the UI can show "Angemeldet"/"Nicht angemeldet" without ever handling the token.
        "oauthLoggedIn": bool(r["oauth_access_token"]),
        "oauthExpiresAt": r["oauth_expires_at"],
    }


def list_mcp_servers() -> list[dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM mcp_servers ORDER BY created_at ASC").fetchall()
    return [_mcp_row_to_dict(r) for r in rows]


def get_mcp_server(server_id: str) -> dict[str, Any] | None:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM mcp_servers WHERE id = ?", (server_id,)).fetchone()
    return _mcp_row_to_dict(row) if row else None


def get_mcp_server_raw(server_id: str) -> dict[str, Any] | None:
    """Like get_mcp_server, but includes the actual OAuth2 tokens -- only for internal use
    (calling the MCP server, refreshing tokens), never returned from an API response."""
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM mcp_servers WHERE id = ?", (server_id,)).fetchone()
    if row is None:
        return None
    d = _mcp_row_to_dict(row)
    d["oauthAccessToken"] = row["oauth_access_token"]
    d["oauthRefreshToken"] = row["oauth_refresh_token"]
    d["oauthPkceVerifier"] = row["oauth_pkce_verifier"]
    d["oauthState"] = row["oauth_state"]
    return d


def get_mcp_server_by_oauth_state(state: str) -> dict[str, Any] | None:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM mcp_servers WHERE oauth_state = ? AND oauth_state != ''", (state,)).fetchone()
    if row is None:
        return None
    d = _mcp_row_to_dict(row)
    d["oauthPkceVerifier"] = row["oauth_pkce_verifier"]
    return d


def upsert_mcp_server(server: dict[str, Any]) -> dict[str, Any]:
    server_id = server.get("id") or str(uuid.uuid4())
    created_at = server.get("createdAt") or int(time.time() * 1000)
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO mcp_servers (id, name, url, transport, auth_method, token, category, enabled, "
            "auto_run_tools, created_at, oauth_client_id, oauth_client_secret, oauth_auth_endpoint, "
            "oauth_token_endpoint, oauth_scope, oauth_redirect_uri, is_realtime, oauth_token_action) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(id) DO UPDATE SET name=excluded.name, url=excluded.url, transport=excluded.transport, "
            "auth_method=excluded.auth_method, token=excluded.token, category=excluded.category, "
            "enabled=excluded.enabled, auto_run_tools=excluded.auto_run_tools, "
            "oauth_client_id=excluded.oauth_client_id, oauth_client_secret=excluded.oauth_client_secret, "
            "oauth_auth_endpoint=excluded.oauth_auth_endpoint, oauth_token_endpoint=excluded.oauth_token_endpoint, "
            "oauth_scope=excluded.oauth_scope, oauth_redirect_uri=excluded.oauth_redirect_uri, "
            "is_realtime=excluded.is_realtime, oauth_token_action=excluded.oauth_token_action",
            (
                server_id, server["name"], server["url"], server.get("transport", "STREAMABLE_HTTP"),
                server.get("authMethod", "NONE"), server.get("token", ""), server.get("category", "OTHER"),
                int(bool(server.get("enabled", False))), int(bool(server.get("autoRunTools", False))), created_at,
                server.get("oauthClientId", ""), server.get("oauthClientSecret", ""),
                server.get("oauthAuthEndpoint", ""), server.get("oauthTokenEndpoint", ""),
                server.get("oauthScope", ""), server.get("oauthRedirectUri", ""),
                int(bool(server.get("isRealtime", False))), server.get("oauthTokenAction", ""),
            ),
        )
    return get_mcp_server(server_id)  # type: ignore[return-value]


def delete_mcp_server(server_id: str) -> None:
    with get_conn() as conn:
        conn.execute("DELETE FROM mcp_servers WHERE id = ?", (server_id,))


def set_mcp_oauth_pending(server_id: str, state: str, pkce_verifier: str, redirect_uri: str) -> None:
    with get_conn() as conn:
        conn.execute(
            "UPDATE mcp_servers SET oauth_state = ?, oauth_pkce_verifier = ?, oauth_redirect_uri = ? WHERE id = ?",
            (state, pkce_verifier, redirect_uri, server_id),
        )


def set_mcp_oauth_tokens(server_id: str, access_token: str, refresh_token: str, expires_at: int) -> None:
    with get_conn() as conn:
        conn.execute(
            "UPDATE mcp_servers SET oauth_access_token = ?, oauth_refresh_token = ?, oauth_expires_at = ?, "
            "oauth_state = '', oauth_pkce_verifier = '' WHERE id = ?",
            (access_token, refresh_token, expires_at, server_id),
        )


# ---------------------------------------------------------------------------
# LLM request log (Performance-/Debug-Log)
# ---------------------------------------------------------------------------

def add_log_entry(
    provider: str, model: str, purpose: str, duration_ms: int, success: bool,
    prompt_tokens: int | None = None, completion_tokens: int | None = None,
    tool_calls: int = 0, error_message: str | None = None, detail: str | None = None,
) -> None:
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO llm_request_log (provider, model, purpose, prompt_tokens, completion_tokens, "
            "tool_calls, duration_ms, success, error_message, detail, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                provider, model, purpose, prompt_tokens, completion_tokens, tool_calls, duration_ms,
                int(success), error_message, detail, int(time.time() * 1000),
            ),
        )
        conn.execute(
            "DELETE FROM llm_request_log WHERE id NOT IN "
            "(SELECT id FROM llm_request_log ORDER BY id DESC LIMIT ?)",
            (_MAX_LOG_ENTRIES,),
        )


def list_log_entries() -> list[dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM llm_request_log ORDER BY id DESC").fetchall()
    return [
        {
            "id": r["id"], "provider": r["provider"], "model": r["model"], "purpose": r["purpose"],
            "promptTokens": r["prompt_tokens"], "completionTokens": r["completion_tokens"],
            "toolCalls": r["tool_calls"], "durationMs": r["duration_ms"], "success": bool(r["success"]),
            "errorMessage": r["error_message"], "detail": r["detail"], "createdAt": r["created_at"],
        }
        for r in rows
    ]


def clear_log_entries() -> None:
    with get_conn() as conn:
        conn.execute("DELETE FROM llm_request_log")
