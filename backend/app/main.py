"""GlucoSphere-Web backend -- FastAPI. Multi-user (see README "Mehrere Benutzer"): ADMIN accounts
get full access, MEMBER accounts (family/Diabetes-Team) get Chat + Übersicht + their own profile
only -- everything else is gated by `require_admin` below.
"""
from __future__ import annotations

import asyncio
import logging
import secrets
import time
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel
from starlette.middleware.base import BaseHTTPMiddleware

from . import auth, backup, dashboard_sources, db, dexcom_share, feelfit, glooko, google_health, librelinkup, llm_providers, mcp_client, mcp_server, model_catalog, nightscout, oauth, prompts, tools, withings

log = logging.getLogger("glucosphere")

app = FastAPI(title="GlucoSphere-Web API")

# Trusted-local-network tool (see README) -- permissive CORS is an accepted tradeoff, not an
# oversight. Real access control is the session-cookie login + role checks below, not CORS.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

_PUBLIC_PATHS = {"/api/health", "/api/auth/login", "/api/auth/me"}


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if not request.url.path.startswith("/api/") or request.url.path in _PUBLIC_PATHS:
            return await call_next(request)
        if request.url.path == "/api/mcp":
            return await self._dispatch_mcp_auth(request, call_next)
        token = request.cookies.get(auth.SESSION_COOKIE_NAME)
        user = auth.get_session_user(token)
        if user is None:
            return JSONResponse({"detail": "Nicht angemeldet."}, status_code=401)
        request.state.user = user
        return await call_next(request)

    @staticmethod
    async def _dispatch_mcp_auth(request: Request, call_next):
        """`/api/mcp` (GlucoSphere-Web acting AS an MCP server, see mcp_server.py) uses its own
        bearer-token secret from Settings -> MCP Server & API instead of the session-cookie login
        every other `/api/*` route requires -- external MCP clients (Claude Desktop, Open WebUI,
        ...) have no browser session to present."""
        expected = db.load_settings().get("mcpServerToken") or ""
        header = request.headers.get("authorization", "")
        if not expected or header != f"Bearer {expected}":
            return JSONResponse({"detail": "Unauthorized"}, status_code=401, headers={"WWW-Authenticate": "Bearer"})
        return await call_next(request)


app.add_middleware(AuthMiddleware)


def current_user(request: Request) -> dict:
    return request.state.user


def require_admin(request: Request) -> dict:
    user = request.state.user
    if user["role"] != auth.ROLE_ADMIN:
        raise HTTPException(403, "Nur für Administratoren.")
    return user


def _resolve_main_user(user: dict) -> dict:
    """For FACHPERSONAL/ANGEHOERIGE accounts with a linked main user (see ProfilePage.tsx), returns
    that DIABETIKER account's record -- its device settings (pump/CGM/unit) and display name drive
    the system prompt instead of the FACHPERSONAL/ANGEHOERIGE account's own (blank) ones. A
    DIABETIKER account is its own main user; falls back to `user` if the link is missing/stale."""
    if user.get("userRole") in ("FACHPERSONAL", "ANGEHOERIGE") and user.get("linkedMainUserId"):
        main = db.get_user(user["linkedMainUserId"])
        if main:
            return main
    return user


@app.on_event("startup")
def _startup() -> None:
    db.init_db()
    generated_password = auth.ensure_admin_bootstrapped()
    if generated_password:
        users = db.list_users()
        log.warning(
            "=" * 60 + "\nGlucoSphere-Web: no ADMIN_PASSWORD set -- generated one:\n"
            "  username: %s\n  password: %s\n"
            "Log in with this once, then change it under Einstellungen -> Konto.\n" + "=" * 60,
            users[0]["username"] if users else "admin", generated_password,
        )


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

class LoginRequest(BaseModel):
    username: str
    password: str


@app.post("/api/auth/login")
def login(req: LoginRequest) -> JSONResponse:
    user = auth.verify_login(req.username, req.password)
    if user is None:
        raise HTTPException(401, "Benutzername oder Passwort falsch.")
    token = auth.create_session(user["id"])
    resp = JSONResponse({"success": True})
    resp.set_cookie(
        auth.SESSION_COOKIE_NAME, token, max_age=auth.SESSION_TTL_SECONDS,
        httponly=True, samesite="lax",
    )
    return resp


@app.post("/api/auth/logout")
def logout(request: Request) -> JSONResponse:
    token = request.cookies.get(auth.SESSION_COOKIE_NAME)
    if token:
        auth.destroy_session(token)
    resp = JSONResponse({"success": True})
    resp.delete_cookie(auth.SESSION_COOKIE_NAME)
    return resp


@app.get("/api/auth/me")
def me(request: Request) -> dict:
    """Public (see `_PUBLIC_PATHS`) so the frontend can check login status on boot without
    tripping the 401-redirect-to-login handler -- returns `username: null` when not logged in
    instead of a 401."""
    token = request.cookies.get(auth.SESSION_COOKIE_NAME)
    user = auth.get_session_user(token)
    if user is None:
        return {"username": None}
    return user


class ChangePasswordRequest(BaseModel):
    currentPassword: str
    newPassword: str


@app.post("/api/auth/change-password")
def change_password(req: ChangePasswordRequest, user: dict = Depends(current_user)) -> dict:
    if len(req.newPassword) < 8:
        raise HTTPException(400, "Neues Passwort muss mindestens 8 Zeichen haben.")
    if not auth.change_password(user["id"], req.currentPassword, req.newPassword):
        raise HTTPException(401, "Aktuelles Passwort falsch.")
    return {"success": True}


# ---------------------------------------------------------------------------
# Own profile (all roles) + user management (ADMIN only)
# ---------------------------------------------------------------------------

class UpdateProfileRequest(BaseModel):
    # All fields are optional and merged onto the current profile server-side (see
    # update_own_profile below) so that a caller which only wants to change one field
    # (e.g. the language switcher) can never silently reset the others to their defaults.
    displayName: str | None = None
    userRole: str | None = None
    appLanguage: str | None = None
    glucoseUnit: str | None = None
    insulinPump: str | None = None
    cgmSystem: str | None = None
    linkedMainUserId: str | None = None
    lastName: str | None = None
    birthDate: str | None = None
    diabetesSince: str | None = None
    colorTheme: str | None = None
    aidSystem: str | None = None


@app.put("/api/users/me")
def update_own_profile(req: UpdateProfileRequest, user: dict = Depends(current_user)) -> dict:
    return db.update_own_profile(
        user["id"],
        req.displayName if req.displayName is not None else user["displayName"],
        req.userRole if req.userRole is not None else user["userRole"],
        req.appLanguage if req.appLanguage is not None else user["appLanguage"],
        req.glucoseUnit if req.glucoseUnit is not None else user["glucoseUnit"],
        req.insulinPump if req.insulinPump is not None else user["insulinPump"],
        req.cgmSystem if req.cgmSystem is not None else user["cgmSystem"],
        req.linkedMainUserId if req.linkedMainUserId is not None else user.get("linkedMainUserId", ""),
        req.lastName if req.lastName is not None else user.get("lastName", ""),
        req.birthDate if req.birthDate is not None else user.get("birthDate", ""),
        req.diabetesSince if req.diabetesSince is not None else user.get("diabetesSince", ""),
        req.colorTheme if req.colorTheme is not None else user.get("colorTheme", "MEDICAL_BLUE"),
        req.aidSystem if req.aidSystem is not None else user.get("aidSystem", "NONE"),
    )


@app.get("/api/users/diabetiker-accounts")
def list_diabetiker_accounts(_: dict = Depends(current_user)) -> dict:
    """Not admin-gated (unlike GET /api/users) -- any logged-in user needs this to populate the
    "linked main user" picker in Benutzerverwaltung (see UsersPage.tsx)."""
    return {"accounts": db.list_diabetiker_accounts()}


@app.get("/api/patient-profile")
def get_patient_profile(user: dict = Depends(current_user)) -> dict:
    """The clinical Patientenprofil (see ProfilePage.tsx) is one record per Hauptpatient
    (DIABETIKER account), not per logged-in user -- FACHPERSONAL/ANGEHOERIGE accounts read the
    linked main user's record here instead of their own (blank) one, same resolution as the
    system prompt/dashboard use (_resolve_main_user). `isEditable` tells the frontend whether the
    caller IS that patient (only the patient's own account, or an admin via Benutzerverwaltung,
    may change it)."""
    main = _resolve_main_user(user)
    return {
        "id": main["id"],
        "firstName": main["displayName"],
        "lastName": main.get("lastName", ""),
        "birthDate": main.get("birthDate", ""),
        "diabetesSince": main.get("diabetesSince", ""),
        "glucoseUnit": main["glucoseUnit"],
        "insulinPump": main["insulinPump"],
        "cgmSystem": main["cgmSystem"],
        "aidSystem": main.get("aidSystem", "NONE"),
        "isEditable": main["id"] == user["id"],
    }


@app.get("/api/users")
def list_users(_: dict = Depends(require_admin)) -> dict:
    return {"users": db.list_users()}


class CreateUserRequest(BaseModel):
    username: str
    password: str
    role: str = auth.ROLE_MEMBER
    displayName: str = ""


@app.post("/api/users")
def create_user(req: CreateUserRequest, _: dict = Depends(require_admin)) -> dict:
    if len(req.password) < 8:
        raise HTTPException(400, "Passwort muss mindestens 8 Zeichen haben.")
    if db.get_user_by_username_raw(req.username) is not None:
        raise HTTPException(409, "Benutzername bereits vergeben.")
    salt = secrets.token_hex(16)
    return db.create_user(req.username, auth.hash_password(req.password, salt), salt, req.role, req.displayName)


class AdminUpdateUserRequest(BaseModel):
    role: str | None = None
    username: str | None = None
    newPassword: str | None = None
    # Benutzertyp (Diabetiker/Fachpersonal/Angehörige) is anchored in Benutzerverwaltung, not
    # self-service (see ProfilePage.tsx, now clinical-stammdata-only) -- an admin assigns it here,
    # along with which DIABETIKER account a FACHPERSONAL/ANGEHOERIGE account is linked to.
    userRole: str | None = None
    linkedMainUserId: str | None = None


@app.put("/api/users/{user_id}")
def admin_update_user(user_id: str, req: AdminUpdateUserRequest, admin: dict = Depends(require_admin)) -> dict:
    if user_id == admin["id"] and req.role is not None and req.role != auth.ROLE_ADMIN:
        raise HTTPException(400, "Du kannst dir nicht selbst die Admin-Rolle entziehen.")
    target = db.get_user_raw(user_id)
    if target is None:
        raise HTTPException(404, "Benutzer nicht gefunden.")
    if req.newPassword:
        if len(req.newPassword) < 8:
            raise HTTPException(400, "Neues Passwort muss mindestens 8 Zeichen haben.")
        salt = secrets.token_hex(16)
        db.set_user_password(user_id, auth.hash_password(req.newPassword, salt), salt)
    updated = db.admin_update_user(user_id, req.role, req.username, req.userRole, req.linkedMainUserId)
    return updated  # type: ignore[return-value]


@app.delete("/api/users/{user_id}")
def delete_user(user_id: str, admin: dict = Depends(require_admin)) -> dict:
    if user_id == admin["id"]:
        raise HTTPException(400, "Du kannst dein eigenes Konto nicht löschen.")
    db.delete_user(user_id)
    return {"deleted": True}


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

@app.get("/api/settings")
def get_settings(_: dict = Depends(require_admin)) -> dict:
    return db.load_settings()


@app.put("/api/settings")
def update_settings(patch: dict[str, Any], _: dict = Depends(require_admin)) -> dict:
    return db.save_settings(patch)


@app.get("/api/system-prompt/default")
def get_default_system_prompt(user: dict = Depends(require_admin)) -> dict:
    """The built-in base prompt `settings.systemPrompt: null` falls back to -- shown read-only in
    the UI as a reference/reset target, see SystemPromptPage.tsx. Shown in the admin's own
    appLanguage since that's also what a real request would use for them (see build_system_prompt)."""
    is_en = user.get("appLanguage") == "EN"
    return {"defaultPrompt": prompts.DEFAULT_SYSTEM_PROMPT_EN if is_en else prompts.DEFAULT_SYSTEM_PROMPT_DE}


@app.get("/api/providers")
def list_providers() -> dict:
    return {
        "providers": [
            {
                "type": ptype,
                "label": label,
                "models": [
                    {"id": m.id, "label": m.label, "priceTier": m.price_tier}
                    for m in model_catalog.options_for(ptype)
                ],
            }
            for ptype, label in model_catalog.PROVIDER_LABELS.items()
        ]
    }


class LlmTestRequest(BaseModel):
    providerType: str
    apiKey: str = ""
    baseUrl: str | None = None
    model: str = model_catalog.AUTO_MODEL_ID


_KEY_FIELD = {
    "GEMINI": "geminiApiKey",
    "CLAUDE": "claudeApiKey",
    "OPENAI": "openAiApiKey",
    "DEEPSEEK": "deepseekApiKey",
}
_MODEL_FIELD = {
    "GEMINI": "geminiModel",
    "CLAUDE": "claudeModel",
    "OPENAI": "openAiModel",
    "DEEPSEEK": "deepseekModel",
}


@app.post("/api/llm/test-connection")
async def test_llm_connection(req: LlmTestRequest, _: dict = Depends(require_admin)) -> dict:
    if req.providerType not in _KEY_FIELD:
        raise HTTPException(400, f"Unbekannter Provider: {req.providerType}")
    temp_settings = {
        _KEY_FIELD[req.providerType]: req.apiKey,
        _MODEL_FIELD[req.providerType]: req.model,
        "claudeBaseUrl": req.baseUrl or model_catalog.DEFAULT_CLAUDE_BASE_URL,
        "openAiBaseUrl": req.baseUrl or model_catalog.DEFAULT_OPENAI_BASE_URL,
    }
    ok, message = await llm_providers.test_connection(req.providerType, temp_settings)
    return {"success": ok, "message": message}


class NightscoutTestRequest(BaseModel):
    url: str
    authMethod: str = "API_SECRET_HEADER"
    token: str = ""


@app.post("/api/nightscout/test-connection")
async def test_nightscout(req: NightscoutTestRequest, _: dict = Depends(require_admin)) -> dict:
    ok, message = await nightscout.test_connection(req.url, req.authMethod, req.token)
    return {"success": ok, "message": message}


class FeelFitTestRequest(BaseModel):
    email: str
    password: str


@app.post("/api/feelfit/test-connection")
async def test_feelfit(req: FeelFitTestRequest, _: dict = Depends(require_admin)) -> dict:
    ok, message = await feelfit.test_connection(req.email, req.password)
    return {"success": ok, "message": message}


class DexcomTestRequest(BaseModel):
    username: str
    password: str
    region: str = "US"


@app.post("/api/dexcom/test-connection")
async def test_dexcom(req: DexcomTestRequest, _: dict = Depends(require_admin)) -> dict:
    ok, message = await dexcom_share.test_connection(req.username, req.password, req.region)
    return {"success": ok, "message": message}


class LibreTestRequest(BaseModel):
    email: str
    password: str
    region: str = "US"


@app.post("/api/librelinkup/test-connection")
async def test_librelinkup(req: LibreTestRequest, _: dict = Depends(require_admin)) -> dict:
    ok, message = await librelinkup.test_connection(req.email, req.password, req.region)
    return {"success": ok, "message": message}


class GlookoTestRequest(BaseModel):
    username: str
    password: str


@app.post("/api/glooko/test-connection")
async def test_glooko(req: GlookoTestRequest, _: dict = Depends(require_admin)) -> dict:
    ok, message = await glooko.test_connection(req.username, req.password)
    return {"success": ok, "message": message}


# ---------------------------------------------------------------------------
# Google Health API (native OAuth2 -- see google_health.py)
# ---------------------------------------------------------------------------

class GoogleHealthAuthorizeRequest(BaseModel):
    redirectUri: str


def _save_google_health_tokens(access_token: str, refresh_token: str, expires_at: int) -> None:
    db.save_settings({
        "googleHealthAccessToken": access_token,
        "googleHealthRefreshToken": refresh_token,
        "googleHealthExpiresAt": expires_at,
    })


@app.post("/api/google-health/oauth/authorize")
def google_health_oauth_authorize(req: GoogleHealthAuthorizeRequest, _: dict = Depends(require_admin)) -> dict:
    settings = db.load_settings()
    state = secrets.token_urlsafe(24)
    verifier, challenge = google_health.pkce_pair()
    try:
        url = google_health.build_authorize_url(settings.get("googleHealthClientId", ""), req.redirectUri, state, challenge)
    except google_health.GoogleHealthError as exc:
        raise HTTPException(400, str(exc)) from exc
    db.save_settings({
        "googleHealthOAuthState": state,
        "googleHealthOAuthPkceVerifier": verifier,
        "googleHealthOAuthRedirectUri": req.redirectUri,
    })
    return {"authorizeUrl": url}


@app.get("/api/google-health/oauth/callback")
async def google_health_oauth_callback(code: str | None = None, state: str | None = None, error: str | None = None) -> RedirectResponse:
    target = "/settings/data-sources"
    if error:
        return RedirectResponse(f"{target}?googleHealth=error&detail={error}")
    settings = db.load_settings()
    if not code or not state or state != settings.get("googleHealthOAuthState"):
        return RedirectResponse(f"{target}?googleHealth=error&detail=invalid_state")
    try:
        data = await google_health.exchange_code(
            settings.get("googleHealthClientId", ""), settings.get("googleHealthClientSecret", ""),
            code, settings.get("googleHealthOAuthRedirectUri", ""), settings.get("googleHealthOAuthPkceVerifier", ""),
        )
    except google_health.GoogleHealthError as exc:
        return RedirectResponse(f"{target}?googleHealth=error&detail={exc}")
    expires_at = int(time.time()) + int(data.get("expires_in", 3600))
    db.save_settings({
        "googleHealthAccessToken": data.get("access_token", ""),
        "googleHealthRefreshToken": data.get("refresh_token") or settings.get("googleHealthRefreshToken", ""),
        "googleHealthExpiresAt": expires_at,
        "googleHealthOAuthState": "", "googleHealthOAuthPkceVerifier": "",
    })
    return RedirectResponse(f"{target}?googleHealth=success")


async def _check_google_health(settings: dict) -> tuple[bool, str]:
    try:
        access_token = await google_health.get_valid_access_token(settings, _save_google_health_tokens)
        now = int(time.time() * 1000)
        readings = await google_health.fetch_blood_glucose(access_token, now - 30 * 24 * 60 * 60 * 1000, now)
        return True, f"Verbindung erfolgreich -- {len(readings)} Messungen in den letzten 30 Tagen gefunden."
    except google_health.GoogleHealthError as exc:
        return False, str(exc)


@app.post("/api/google-health/test-connection")
async def test_google_health(_: dict = Depends(require_admin)) -> dict:
    ok, message = await _check_google_health(db.load_settings())
    return {"success": ok, "message": message}


# ---------------------------------------------------------------------------
# Withings API (native OAuth2 -- see withings.py)
# ---------------------------------------------------------------------------

class WithingsAuthorizeRequest(BaseModel):
    redirectUri: str


def _save_withings_tokens(access_token: str, refresh_token: str, expires_at: int) -> None:
    db.save_settings({
        "withingsAccessToken": access_token,
        "withingsRefreshToken": refresh_token,
        "withingsExpiresAt": expires_at,
    })


@app.post("/api/withings/oauth/authorize")
def withings_oauth_authorize(req: WithingsAuthorizeRequest, _: dict = Depends(require_admin)) -> dict:
    settings = db.load_settings()
    state = secrets.token_urlsafe(24)
    verifier, challenge = withings.pkce_pair()
    try:
        url = withings.build_authorize_url(settings.get("withingsClientId", ""), req.redirectUri, state, challenge)
    except withings.WithingsError as exc:
        raise HTTPException(400, str(exc)) from exc
    db.save_settings({
        "withingsOAuthState": state,
        "withingsOAuthPkceVerifier": verifier,
        "withingsOAuthRedirectUri": req.redirectUri,
    })
    return {"authorizeUrl": url}


@app.get("/api/withings/oauth/callback")
async def withings_oauth_callback(code: str | None = None, state: str | None = None, error: str | None = None) -> RedirectResponse:
    target = "/settings/data-sources"
    if error:
        return RedirectResponse(f"{target}?withings=error&detail={error}")
    settings = db.load_settings()
    if not code or not state or state != settings.get("withingsOAuthState"):
        return RedirectResponse(f"{target}?withings=error&detail=invalid_state")
    try:
        data = await withings.exchange_code(
            settings.get("withingsClientId", ""), settings.get("withingsClientSecret", ""),
            code, settings.get("withingsOAuthRedirectUri", ""), settings.get("withingsOAuthPkceVerifier", ""),
        )
    except withings.WithingsError as exc:
        return RedirectResponse(f"{target}?withings=error&detail={exc}")
    expires_at = int(time.time()) + int(data.get("expires_in", 10800))
    db.save_settings({
        "withingsAccessToken": data.get("access_token", ""),
        "withingsRefreshToken": data.get("refresh_token") or settings.get("withingsRefreshToken", ""),
        "withingsExpiresAt": expires_at,
        "withingsOAuthState": "", "withingsOAuthPkceVerifier": "",
    })
    return RedirectResponse(f"{target}?withings=success")


async def _check_withings(settings: dict) -> tuple[bool, str]:
    now = int(time.time() * 1000)
    try:
        access_token = await withings.get_valid_access_token(settings, _save_withings_tokens)
        try:
            readings = await withings.fetch_measurements(access_token, now - 30 * 24 * 60 * 60 * 1000, now)
        except withings.WithingsError as exc:
            if exc.status_code != 401:
                raise
            # Same stale-cached-expiry case as tools.py's _execute_withings -- force a refresh
            # and retry once before surfacing the failure.
            access_token = await withings.get_valid_access_token(settings, _save_withings_tokens, force_refresh=True)
            readings = await withings.fetch_measurements(access_token, now - 30 * 24 * 60 * 60 * 1000, now)
        return True, f"Verbindung erfolgreich -- {len(readings)} Messungen in den letzten 30 Tagen gefunden."
    except withings.WithingsError as exc:
        return False, str(exc)


@app.post("/api/withings/test-connection")
async def test_withings(_: dict = Depends(require_admin)) -> dict:
    ok, message = await _check_withings(db.load_settings())
    return {"success": ok, "message": message}


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

_RANGE_LABELS = {6: "Letzte 6h", 24: "Letzte 24h", 72: "Letzte 72h", 168: "Letzte 7 Tage", 2160: "Letzte 3 Monate"}


def _available_dashboard_sources(settings: dict) -> list[dict]:
    """Every glucose-capable source: the direct Nightscout API (if configured+enabled) plus every
    enabled MCP server of category GLUCOSE_TREATMENTS -- the latter go through
    dashboard_sources.fetch_glucose_entries (LLM-assisted tool-calling + extraction, see that
    module's docstring) since, unlike Nightscout, we don't know their tool names/output shape
    ahead of time. `server` carries the raw MCP server dict for internal use, stripped before the
    API response (see get_dashboard_sources)."""
    sources = []
    if settings.get("nightscoutApiUrl") and settings.get("nightscoutApiEnabled", True):
        # The direct Nightscout API is always treated as realtime -- it's the one source type
        # that has no LLM-assisted extraction lag and, per user experience, "usually has realtime
        # data" (unlike e.g. Glooko, which can lag hours behind).
        sources.append({"id": "nightscout", "name": settings.get("nightscoutDisplayName") or "Nightscout", "category": "GLUCOSE_TREATMENTS", "computesMetrics": True, "isRealtime": True, "server": None})
    if settings.get("dexcomUsername") and settings.get("dexcomEnabled", True):
        sources.append({"id": "dexcom", "name": settings.get("dexcomDisplayName") or "Dexcom", "category": "GLUCOSE_TREATMENTS", "computesMetrics": True, "isRealtime": True, "server": None})
    if settings.get("libreEmail") and settings.get("libreEnabled", True):
        sources.append({"id": "librelinkup", "name": settings.get("libreDisplayName") or "LibreLinkUp", "category": "GLUCOSE_TREATMENTS", "computesMetrics": True, "isRealtime": True, "server": None})
    for server in db.list_mcp_servers():
        if server.get("enabled") and server.get("category") == "GLUCOSE_TREATMENTS":
            sources.append({
                "id": server["id"], "name": server["name"], "category": "GLUCOSE_TREATMENTS",
                "computesMetrics": True, "isRealtime": bool(server.get("isRealtime")), "server": server,
            })
    return sources


@app.get("/api/dashboard-sources")
def get_dashboard_sources() -> dict:
    settings = db.load_settings()
    sources = _available_dashboard_sources(settings)
    return {"sources": [{k: v for k, v in s.items() if k != "server"} for s in sources]}


async def _fetch_source_entries(source: dict, settings: dict, from_millis: int, to_millis: int) -> list[nightscout.NightscoutEntry]:
    if source["id"] == "nightscout":
        return await nightscout.fetch_entries(
            settings["nightscoutApiUrl"], settings["nightscoutApiAuthMethod"], settings["nightscoutApiSecret"],
            from_millis, to_millis,
        )
    if source["id"] == "dexcom":
        # Dexcom Share only exposes "the most recent N minutes", no arbitrary date range -- so a
        # "previous period" request (trend comparison) has nothing meaningful to return.
        now = int(time.time() * 1000)
        if to_millis < now - 5 * 60 * 1000:
            return []
        minutes = max(1, min(1440, int((to_millis - from_millis) / 60_000)))
        readings = await dexcom_share.fetch_readings(
            settings["dexcomUsername"], settings["dexcomPassword"], settings.get("dexcomRegion", "US"),
            minutes=minutes, max_count=288,
        )
        return [nightscout.NightscoutEntry(r.mg_dl, r.date_millis, r.trend) for r in readings]
    if source["id"] == "librelinkup":
        # Same constraint as Dexcom -- LibreLinkUp's graph endpoint has no range parameters at
        # all, it always returns the fixed ~12h window.
        now = int(time.time() * 1000)
        if to_millis < now - 5 * 60 * 1000:
            return []
        readings = await librelinkup.fetch_readings(settings["libreEmail"], settings["librePassword"], settings.get("libreRegion", "US"))
        return [nightscout.NightscoutEntry(r.mg_dl, r.date_millis, "") for r in readings if from_millis <= r.date_millis <= to_millis]
    entries = await dashboard_sources.fetch_glucose_entries(source["server"], settings, from_millis, to_millis)
    return entries or []


async def _fetch_source_safe(source: dict, settings: dict, from_millis: int, to_millis: int) -> list[nightscout.NightscoutEntry]:
    """Never raises -- one unreachable/erroring source (network error, MCP timeout, ...) must not
    affect the other sources when fetched concurrently via asyncio.gather below."""
    try:
        return await _fetch_source_entries(source, settings, from_millis, to_millis)
    except Exception:  # noqa: BLE001
        return []


@app.get("/api/dashboard")
async def get_dashboard(
    rangeHours: int = 24, includeNarrative: bool = True, sources: str | None = None,
    user: dict = Depends(current_user),
) -> dict:
    dashboard_start = time.monotonic()
    settings = db.load_settings()
    available = _available_dashboard_sources(settings)
    if not available:
        return {"configured": False}

    selected_ids = sources.split(",") if sources is not None else [s["id"] for s in available]
    selected = [s for s in available if s["id"] in selected_ids]
    if not selected:
        return {"configured": True, "excluded": True, "rangeHours": rangeHours, "rangeLabel": _RANGE_LABELS.get(rangeHours, f"Letzte {rangeHours}h")}

    now = int(time.time() * 1000)
    window_ms = rangeHours * 60 * 60 * 1000
    from_millis, to_millis = now - window_ms, now
    prev_from, prev_to = now - 2 * window_ms, now - window_ms

    # Each source's fetch can take tens of seconds to minutes (MCP sources go through a couple of
    # LLM round-trips -- see dashboard_sources.py); fetching sequentially made a 2-source dashboard
    # exceed nginx's proxy timeout. Fire every source's current- and previous-range fetch at once
    # so total wall time is roughly the slowest single fetch, not the sum of all of them.
    current_results, prev_results, device_status = await asyncio.gather(
        asyncio.gather(*[_fetch_source_safe(s, settings, from_millis, to_millis) for s in selected]),
        asyncio.gather(*[_fetch_source_safe(s, settings, prev_from, prev_to) for s in selected]),
        _fetch_device_status_safe(settings),
    )

    contributions = []  # each: (source, metrics, prev_metrics_or_None, latest_entry, entries)
    for source, entries, prev_entries in zip(selected, current_results, prev_results):
        m = nightscout.compute_metrics(entries)
        if m is None or nightscout.looks_empty(m):
            continue
        prev_m = nightscout.compute_metrics(prev_entries)
        if prev_m is not None and nightscout.looks_empty(prev_m):
            prev_m = None
        candidate_latest = max(entries, key=lambda e: e.date_millis)
        contributions.append((source, m, prev_m, candidate_latest, entries))

    if not contributions:
        return {"configured": True, "hasData": False, "rangeHours": rangeHours, "rangeLabel": _RANGE_LABELS.get(rangeHours, f"Letzte {rangeHours}h")}

    # Prefer realtime sources (e.g. Nightscout) over laggy ones (e.g. Glooko, which can trail
    # hours behind): if any contributing source is realtime, drop the non-realtime ones from the
    # combined result instead of letting stale data dilute it.
    realtime_contributions = [c for c in contributions if c[0].get("isRealtime")]
    if realtime_contributions:
        contributions = realtime_contributions

    per_source_metrics = [c[1] for c in contributions]
    per_source_prev_metrics = [c[2] for c in contributions if c[2] is not None]
    contributing_names = [c[0]["name"] for c in contributions]
    latest = max((c[3] for c in contributions), key=lambda e: e.date_millis)

    # Item 3's "Automatische Erkennung von Datenlücken" -- per contributing source, over the
    # actually-requested [from_millis, to_millis] window (not just the entries that happened to
    # come back), so a source that went silent for the LAST part of the window is caught too.
    data_gaps = [
        {
            "sourceName": source["name"],
            "startMillis": gap.start_millis,
            "endMillis": gap.end_millis,
            "warningText": nightscout.format_gap_warning(source["name"], gap),
        }
        for source, _m, _prev_m, _latest, entries in contributions
        for gap in nightscout.detect_gaps(entries, from_millis, to_millis)
    ]

    # Chart series for the Übersicht sparkline -- capped at the last 24h even for longer ranges
    # (7d/3M) to keep the graph readable and the response small, downsampled if still too dense.
    _CHART_WINDOW_MS = 24 * 60 * 60 * 1000
    _CHART_MAX_POINTS = 300
    chart_from = max(from_millis, now - _CHART_WINDOW_MS)
    chart_entries = sorted(
        (e for c in contributions for e in c[4] if e.date_millis >= chart_from),
        key=lambda e: e.date_millis,
    )
    if len(chart_entries) > _CHART_MAX_POINTS:
        stride = len(chart_entries) / _CHART_MAX_POINTS
        chart_entries = [chart_entries[int(i * stride)] for i in range(_CHART_MAX_POINTS)]
    series = [{"t": e.date_millis, "v": round(e.sgv_mg_dl, 1)} for e in chart_entries]

    metrics = nightscout.combine_metrics(per_source_metrics)
    prev_metrics = nightscout.combine_metrics(per_source_prev_metrics) if per_source_prev_metrics else None
    status = nightscout.compute_status(metrics)

    trend = None
    if prev_metrics is not None:
        trend = {
            "tirDelta": metrics.tir_percent - prev_metrics.tir_percent,
            "hypoDelta": metrics.hypo_percent - prev_metrics.hypo_percent,
            "avgGlucoseDelta": metrics.avg_glucose - prev_metrics.avg_glucose,
        }

    result = {
        "configured": True,
        "hasData": True,
        "rangeHours": rangeHours,
        "rangeLabel": _RANGE_LABELS.get(rangeHours, f"Letzte {rangeHours}h"),
        "status": status.status,
        "statusReason": status.reason,
        "metrics": {
            "tirPercent": metrics.tir_percent,
            "hypoPercent": metrics.hypo_percent,
            "severeHypoPercent": metrics.severe_hypo_percent,
            "hyperPercent": metrics.hyper_percent,
            "cvPercent": metrics.cv_percent,
            "avgGlucose": metrics.avg_glucose,
            "estimatedHbA1cPercent": metrics.estimated_hba1c_percent,
        },
        "trend": trend,
        "series": series,
        "latestValueMgDl": latest.sgv_mg_dl,
        "latestTrendArrow": nightscout.trend_arrow_for(latest.direction),
        "latestTimestampMillis": latest.date_millis,
        "generatedAtMillis": now,
        "summaryText": None,
        "tips": [],
        "combinedSourcesNote": (
            f"Kombinierte Auswertung ({', '.join(contributing_names)})" if len(contributing_names) > 1 else None
        ),
        # Item 2's "IOB und COB als Live-Metriken im Übersicht-Dashboard" -- null/empty whenever
        # no Nightscout devicestatus (Loop/AndroidAPS) is reporting, not an error.
        "iobUnits": device_status.iob_units if device_status else None,
        "cobGrams": device_status.cob_grams if device_status else None,
        "loopStatus": device_status.loop_status if device_status else None,
        "dataGaps": data_gaps,
    }

    provider_type = settings.get("llmProviderType")
    if includeNarrative and provider_type and _KEY_FIELD.get(provider_type) and settings.get(_KEY_FIELD[provider_type]):
        iob_cob_line = _iob_cob_system_state_text(device_status).strip()
        gaps_line = (
            "\n\nDatenlücken im Zeitraum (bei der Zusammenfassung explizit erwähnen, nicht ignorieren):\n"
            + "\n".join(g["warningText"] for g in data_gaps)
        ) if data_gaps else ""
        narrative_prompt = (
            f"Aktuelle Kennzahlen ({result['rangeLabel']}, Quelle: {', '.join(contributing_names)}): "
            f"Time in Range {metrics.tir_percent:.1f}%, "
            f"Hypoglykämien {metrics.hypo_percent:.1f}%, Hyperglykämien {metrics.hyper_percent:.1f}%, "
            f"Variabilität %CV {metrics.cv_percent:.1f}%, Ø Glukose {metrics.avg_glucose:.0f} mg/dL, "
            f"Status: {status.reason}"
            + (f"\n{iob_cob_line}" if iob_cob_line else "")
            + gaps_line
            + "\n\nSchreibe dazu eine kurze Zusammenfassung (2-3 Sätze) und danach genau 3 knappe, "
            "konkrete Tipps als Liste (je 1 Zeile, ohne Nummerierung/Bindestrich-Präfix -- nur der "
            "reine Tipp-Text, getrennt durch Zeilenumbrüche). Nenne in der Zusammenfassung explizit "
            "die genutzte(n) Datenquelle(n) und -- falls vorhanden -- jede gemeldete Datenlücke. "
            "Format exakt:\nZUSAMMENFASSUNG: <text>\nTIPPS:\n<tipp1>\n<tipp2>\n<tipp3>"
        )
        if user.get("role") != "ADMIN":
            # Non-admin (MEMBER/family/care-team) accounts must not get therapy suggestions from
            # the dashboard narrative -- keep it to short factual info only.
            narrative_prompt += (
                "\n\nWICHTIG: Dieser Nutzer ist kein Administrator. Halte die Zusammenfassung "
                "und die Tipps auf reine kurze Sachinformation beschränkt (was die Werte zeigen) "
                "-- keine Therapieansätze, keine Dosierungs- oder Behandlungsvorschläge."
            )
        main_user = _resolve_main_user(user)
        system_prompt = prompts.build_system_prompt(
            settings.get("systemPrompt"), user["displayName"], user["userRole"],
            settings.get("additionalInstructions", ""), user.get("appLanguage", "DE"),
            main_user.get("glucoseUnit", "MG_DL"), main_user.get("insulinPump", "NONE"), main_user.get("cgmSystem", "NONE"),
            main_user_name=main_user["displayName"],
        )
        start = time.monotonic()
        try:
            chat_result = await llm_providers.chat(
                provider_type, settings, system_prompt,
                [{"role": "user", "content": narrative_prompt}], purpose="ANALYSIS",
            )
            summary, tips = _parse_narrative(chat_result.text)
            result["summaryText"] = summary
            result["tips"] = tips
            # Item 6's dashboard transparency: which provider/model actually produced this
            # narrative, shown under the summary in OverviewPage.tsx ("Ausgewertet mit: ...").
            result["narrativeProvider"] = provider_type
            result["narrativeModel"] = chat_result.model
            db.add_log_entry(
                provider_type, chat_result.model, "ANALYSIS", int((time.monotonic() - start) * 1000), True,
                chat_result.prompt_tokens, chat_result.completion_tokens,
            )
        except Exception as exc:  # noqa: BLE001 -- narrative is a nice-to-have, never block the dashboard
            db.add_log_entry(
                provider_type, settings.get(_MODEL_FIELD.get(provider_type, ""), "auto"), "ANALYSIS",
                int((time.monotonic() - start) * 1000), False, error_message=str(exc),
            )
            result["narrativeFailed"] = True

    result["generationDurationMs"] = int((time.monotonic() - dashboard_start) * 1000)
    return result


def _parse_narrative(text: str) -> tuple[str | None, list[str]]:
    summary = None
    tips: list[str] = []
    section = None
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.upper().startswith("ZUSAMMENFASSUNG:"):
            summary = stripped.split(":", 1)[1].strip()
            section = None
        elif stripped.upper().startswith("TIPPS:"):
            section = "tips"
        elif section == "tips" and stripped:
            tips.append(stripped.lstrip("-•").strip())
    if summary is None and text.strip():
        summary = text.strip()
    return summary, tips[:5]


# ---------------------------------------------------------------------------
# Chat
# ---------------------------------------------------------------------------

@app.get("/api/chat/sessions")
def get_sessions(user: dict = Depends(current_user)) -> dict:
    return {"sessions": db.list_sessions(user["id"])}


class CreateSessionRequest(BaseModel):
    title: str = "Neuer Chat"


@app.post("/api/chat/sessions")
def create_session(req: CreateSessionRequest, user: dict = Depends(current_user)) -> dict:
    return db.create_session(user["id"], req.title)


@app.delete("/api/chat/sessions/{session_id}")
def remove_session(session_id: str, user: dict = Depends(current_user)) -> dict:
    db.delete_session(session_id, user["id"])
    return {"deleted": True}


class RenameSessionRequest(BaseModel):
    title: str


@app.put("/api/chat/sessions/{session_id}")
def rename_session(session_id: str, req: RenameSessionRequest, user: dict = Depends(current_user)) -> dict:
    try:
        return db.rename_session(session_id, user["id"], req.title.strip() or "Chat")
    except PermissionError as exc:
        raise HTTPException(403, str(exc)) from exc


@app.get("/api/chat/sessions/{session_id}/messages")
def get_messages(session_id: str, user: dict = Depends(current_user)) -> dict:
    try:
        return {"messages": db.list_messages(session_id, user["id"])}
    except PermissionError as exc:
        raise HTTPException(403, str(exc)) from exc


@app.delete("/api/chat/sessions/{session_id}/messages")
def clear_messages(session_id: str, user: dict = Depends(current_user)) -> dict:
    try:
        db.clear_messages(session_id, user["id"])
    except PermissionError as exc:
        raise HTTPException(403, str(exc)) from exc
    return {"cleared": True}


class SendMessageRequest(BaseModel):
    content: str
    # "Interaktive Rückfrage im Chat": null (the default) means "no explicit choice yet, run the
    # ambiguity check below". A non-null list means the frontend already resolved a prior
    # SourceChoiceRequired response (one specific source, or every candidate for "Alle Quellen")
    # -- see the retry call in ChatPage.tsx's pickSource(). Tool availability this turn is
    # narrowed to exactly these `_source` ids, and the ambiguity check itself is skipped.
    selectedSourceIds: list[str] | None = None


_MAX_TOOL_ITERATIONS = 5
_SYSTEM_STATE_TIME_HINT = "\n\n[SYSTEM STATE]\nLokale Zeit: {time}\nMaßeinheit: mg/dL{iob_cob}\n[/SYSTEM STATE]"


async def _fetch_device_status_safe(settings: dict) -> nightscout.DeviceStatusSnapshot | None:
    """Never raises -- an unreachable/misconfigured Nightscout instance must not break the whole
    chat turn just because IOB/COB (item 2's "Live-Metriken ... im Prompt-Kontext") couldn't be
    fetched this time; the model still has the dedicated get_nightscout_devicestatus tool to try
    again explicitly if it needs the freshest possible value."""
    if not settings.get("nightscoutApiUrl") or not settings.get("nightscoutApiEnabled", True):
        return None
    try:
        return await nightscout.fetch_latest_device_status(
            settings["nightscoutApiUrl"], settings["nightscoutApiAuthMethod"], settings["nightscoutApiSecret"],
        )
    except Exception:  # noqa: BLE001
        return None


def _iob_cob_system_state_text(status: nightscout.DeviceStatusSnapshot | None) -> str:
    if status is None:
        return ""
    parts = []
    if status.iob_units is not None:
        parts.append(f"IOB {status.iob_units:.2f} IE")
    if status.cob_grams is not None:
        parts.append(f"COB {status.cob_grams:.0f} g")
    if not parts:
        return ""
    stand = time.strftime("%H:%M", time.localtime(status.date_millis / 1000))
    return f"\n{', '.join(parts)} (Quelle: Nightscout REST API, Stand {stand} Uhr)"

# Same simple substring-keyword approach as the Android app's inferQueryCategory (see
# domain/McpServerSelection.kt) -- deliberately no NLP, returns None (ambiguous/off-topic) rather
# than guessing wrong, so the caller falls back to "don't second-guess, offer every source".
_SPORT_KEYWORDS = (
    "sport", "bewegung", "training", "trainiert", "workout", "schritte", "laufen", "joggen",
    "fitness", "aktivität", "aktivitäten", "fahrrad", "radfahren", "kalorien verbrannt",
)
_DIABETES_KEYWORDS = (
    "blutzucker", "glukose", "insulin", "diabetes", "hypo", "hyper", "kohlenhydrate",
    "nightscout", "glooko", "tir", "time in range", "bolus", "basal", "sensor", "cgm",
)
_BODY_KEYWORDS = (
    "gewicht", "abgenommen", "zugenommen", "muskelmasse", "muskelanteil", "körperfett",
    "körperzusammensetzung", "waage", "withings", "bmi",
)


def _infer_query_category(text: str) -> str | None:
    lower = text.lower()
    matches = [
        category for category, keywords in (
            ("ACTIVITY", _SPORT_KEYWORDS),
            ("GLUCOSE_TREATMENTS", _DIABETES_KEYWORDS),
            ("BODY_METRICS", _BODY_KEYWORDS),
        )
        if any(k in lower for k in keywords)
    ]
    return matches[0] if len(matches) == 1 else None


def _detect_source_ambiguity(sources: dict[str, dict], request_text: str) -> list[dict] | None:
    """True ambiguity: the question is confidently about ONE category (see
    _infer_query_category), and 2+ currently-available sources cover that same category -- e.g.
    glucose data sitting in both Nightscout and Glooko. Returns None (nothing to ask) whenever the
    category itself is unclear, so an off-topic/general question never triggers a pointless
    interruption."""
    category = _infer_query_category(request_text)
    if category is None:
        return None
    candidates = [s for s in sources.values() if s["category"] == category]
    if len(candidates) < 2:
        return None
    return candidates


@app.post("/api/chat/sessions/{session_id}/messages")
async def send_message(session_id: str, req: SendMessageRequest, user: dict = Depends(current_user)) -> dict:
    settings = db.load_settings()
    provider_type = settings.get("llmProviderType")
    key_field = _KEY_FIELD.get(provider_type)
    if not key_field or not settings.get(key_field):
        raise HTTPException(400, f"Kein API-Key für {provider_type} hinterlegt -- bitte in der LLM-Konfiguration eintragen.")

    try:
        # A retry call (selectedSourceIds already resolved, see SendMessageRequest's doc comment)
        # answers the SAME question already persisted by the original call below -- adding it
        # again here would duplicate the user's bubble in the chat history.
        if req.selectedSourceIds is None:
            user_message = db.add_message(session_id, user["id"], "user", req.content)
        else:
            user_message = None
        history = db.list_messages(session_id, user["id"])
    except PermissionError as exc:
        raise HTTPException(403, str(exc)) from exc

    mcp_servers = db.list_mcp_servers()
    available_tools = await tools.list_available_tools(settings, mcp_servers)

    if req.selectedSourceIds is None:
        # "Interaktive Rückfrage im Chat": ask instead of silently querying every ambiguous
        # source (or silently guessing one) whenever 2+ same-category sources could equally
        # answer this and the user hasn't already resolved it via a source-choice button.
        sources = tools.sources_by_id(available_tools, settings, mcp_servers)
        ambiguous = _detect_source_ambiguity(sources, req.content)
        if ambiguous:
            is_en = user.get("appLanguage", "DE") == "EN"
            names = ", ".join(s["name"] for s in ambiguous)
            question = (
                f"Several sources are available for this: {names}. Which one should I use?"
                if is_en else
                f"Dafür stehen mehrere Quellen zur Verfügung: {names}. Welche soll ich verwenden?"
            )
            return {
                "userMessage": user_message,
                "sourceChoiceRequired": True,
                "question": question,
                "options": [{"id": s["id"], "name": s["name"], "isRestApi": s["isRestApi"]} for s in ambiguous],
            }
    else:
        # Explicit resolution from a source-choice button -- narrow tool availability to exactly
        # those sources' tools for this turn, same as the ambiguity check would have offered.
        available_tools = [t for t in available_tools if t["_source"] in req.selectedSourceIds]

    app_language = user.get("appLanguage", "DE")
    main_user = _resolve_main_user(user)
    device_status = await _fetch_device_status_safe(settings)
    system_prompt = (
        prompts.build_system_prompt(
            settings.get("systemPrompt"), user["displayName"], user["userRole"],
            settings.get("additionalInstructions", ""), app_language,
            main_user.get("glucoseUnit", "MG_DL"), main_user.get("insulinPump", "NONE"), main_user.get("cgmSystem", "NONE"),
            main_user_name=main_user["displayName"],
        )
        + _SYSTEM_STATE_TIME_HINT.format(
            time=time.strftime("%d.%m.%Y %H:%M %Z"), iob_cob=_iob_cob_system_state_text(device_status),
        )
        + tools.build_realtime_hint(available_tools, app_language == "EN")
    )

    conversation = [{"role": m["role"], "content": m["content"]} for m in history if m["role"] in ("user", "assistant")]

    tool_activity: list[dict] = []
    total_duration_ms = 0
    total_tool_calls = 0
    prompt_tokens_sum = 0
    completion_tokens_sum = 0
    final_model = settings.get(_MODEL_FIELD.get(provider_type, ""), "auto")
    final_text = ""

    for _ in range(_MAX_TOOL_ITERATIONS):
        start = time.monotonic()
        try:
            chat_result = await llm_providers.chat(
                provider_type, settings, system_prompt, conversation, purpose="CHAT",
                tools=available_tools or None,
            )
        except llm_providers.ProviderError as exc:
            total_duration_ms += int((time.monotonic() - start) * 1000)
            db.add_log_entry(
                provider_type, final_model, "CHAT", total_duration_ms,
                False, error_message=str(exc), tool_calls=total_tool_calls,
            )
            # Saved as a normal (failed) assistant message -- rather than only a toast -- so the
            # attempt stays visible in the conversation with its own timestamp/duration/status,
            # same as a successful answer (see ChatPage.tsx's status display).
            error_message = db.add_message(
                session_id, user["id"], "assistant", f"⚠️ {exc}",
                duration_ms=total_duration_ms, success=False, provider=provider_type, model=final_model,
            )
            return {"userMessage": user_message, "assistantMessage": error_message, "toolActivity": tool_activity}

        total_duration_ms += int((time.monotonic() - start) * 1000)
        final_model = chat_result.model
        prompt_tokens_sum += chat_result.prompt_tokens or 0
        completion_tokens_sum += chat_result.completion_tokens or 0

        if not chat_result.tool_calls:
            final_text = chat_result.text
            break

        total_tool_calls += len(chat_result.tool_calls)
        conversation.append({"role": "assistant", "tool_calls": chat_result.tool_calls, "content": chat_result.text})
        # Run every tool call from this turn concurrently rather than one after another -- e.g. a
        # question spanning both an overview and a bolus log triggers two Glooko calls in the same
        # turn, and running them in parallel keeps latency down instead of paying each call's full
        # round trip sequentially. tools.execute_tool never raises (see its own docstring), so
        # gather needs no try/except here. Results are zipped back in the original call order.
        results = await asyncio.gather(*(
            tools.execute_tool(tc["name"], tc["arguments"], settings, mcp_servers) for tc in chat_result.tool_calls
        ))
        for tc, result_text in zip(chat_result.tool_calls, results):
            tool_activity.append({"name": tc["name"], "arguments": tc["arguments"]})
            conversation.append({"role": "tool", "tool_call_id": tc["id"], "name": tc["name"], "content": result_text})
    else:
        final_text = "Die Anfrage benötigte zu viele Werkzeug-Aufrufe -- bitte die Frage eingrenzen und erneut versuchen."

    db.add_log_entry(
        provider_type, final_model, "CHAT", total_duration_ms, True,
        prompt_tokens_sum or None, completion_tokens_sum or None, tool_calls=total_tool_calls,
    )
    assistant_message = db.add_message(
        session_id, user["id"], "assistant", final_text,
        duration_ms=total_duration_ms, success=True, provider=provider_type, model=final_model,
    )
    return {"userMessage": user_message, "assistantMessage": assistant_message, "toolActivity": tool_activity}


# ---------------------------------------------------------------------------
# MCP SERVER (GlucoSphere-Web AS an MCP server, /api/mcp -- see mcp_server.py) -- the reverse role
# of the "MCP servers" section below, which is this app acting as an MCP CLIENT of other servers.
# ---------------------------------------------------------------------------

@app.post("/api/mcp")
async def mcp_endpoint(request: Request) -> Response:
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        return JSONResponse({"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Parse error"}}, status_code=400)

    session_id = request.headers.get("mcp-session-id") or secrets.token_urlsafe(16)
    headers = {"Mcp-Session-Id": session_id}

    is_batch = isinstance(body, list)
    messages = body if is_batch else [body]
    responses = []
    for m in messages:
        resp = await mcp_server.handle_message(m)
        if resp is not None:
            responses.append(resp)

    if not responses:
        # Every message in the request was a notification (e.g. `notifications/initialized`) --
        # nothing to respond with, per JSON-RPC 2.0.
        return Response(status_code=202, headers=headers)
    return JSONResponse(responses if is_batch else responses[0], headers=headers)


@app.get("/api/mcp")
async def mcp_get_not_supported() -> Response:
    """Per the MCP Streamable HTTP spec: a server that does not support a standalone server-to-
    client SSE stream (this one never pushes unsolicited notifications -- every tool here is a
    simple, stateless request/response) MUST respond to GET with HTTP 405."""
    return Response(status_code=405)


@app.post("/api/mcp-server/regenerate-token")
def regenerate_mcp_server_token(_: dict = Depends(require_admin)) -> dict:
    token = secrets.token_urlsafe(32)
    db.save_settings({"mcpServerToken": token})
    return {"token": token}


# ---------------------------------------------------------------------------
# MCP servers
# ---------------------------------------------------------------------------

class McpServerRequest(BaseModel):
    id: str | None = None
    name: str
    url: str
    transport: str = "STREAMABLE_HTTP"
    authMethod: str = "NONE"
    token: str = ""
    category: str = "OTHER"
    enabled: bool = False
    autoRunTools: bool = False
    isRealtime: bool = False
    oauthClientId: str = ""
    oauthClientSecret: str = ""
    oauthAuthEndpoint: str = ""
    oauthTokenEndpoint: str = ""
    oauthScope: str = ""
    oauthRedirectUri: str = ""
    oauthTokenAction: str = ""


@app.get("/api/mcp-servers")
def list_mcp_servers(_: dict = Depends(require_admin)) -> dict:
    return {"servers": db.list_mcp_servers()}


@app.post("/api/mcp-servers")
def upsert_mcp_server(req: McpServerRequest, _: dict = Depends(require_admin)) -> dict:
    return db.upsert_mcp_server(req.model_dump())


@app.delete("/api/mcp-servers/{server_id}")
def delete_mcp_server(server_id: str, _: dict = Depends(require_admin)) -> dict:
    db.delete_mcp_server(server_id)
    return {"deleted": True}


class McpTestRequest(BaseModel):
    url: str
    transport: str = "STREAMABLE_HTTP"
    authMethod: str = "NONE"
    token: str = ""
    serverId: str | None = None


@app.post("/api/mcp-servers/test-connection")
async def test_mcp_server(req: McpTestRequest, _: dict = Depends(require_admin)) -> dict:
    server = req.model_dump()
    if req.authMethod == "OAUTH2":
        if not req.serverId:
            return {"success": False, "message": "Bitte zuerst speichern und mit dem Provider anmelden, dann testen."}
        try:
            server["token"] = await oauth.get_valid_access_token(req.serverId)
            server["authMethod"] = "BEARER_TOKEN"
        except oauth.OAuthError as exc:
            return {"success": False, "message": str(exc)}
    ok, message = await mcp_client.test_connection(server)
    return {"success": ok, "message": message}


async def _check_mcp_server(server: dict) -> tuple[bool, str]:
    try:
        resolved = await tools.resolve_server_auth(server)
        found = await mcp_client.list_tools(resolved)
    except mcp_client.McpClientError as exc:
        if server.get("authMethod") != "OAUTH2" or exc.status_code != 401:
            return False, str(exc)
        # Cached token looked valid (expiry not yet reached) but the provider rejected it anyway
        # -- force a real refresh and retry once, same as tools.py's tool-call retry.
        try:
            resolved = await tools.resolve_server_auth(server, force_refresh=True)
            found = await mcp_client.list_tools(resolved)
        except Exception as exc2:  # noqa: BLE001 -- surfaced as a failed health check, not a 500
            return False, str(exc2)
    except Exception as exc:  # noqa: BLE001 -- surfaced as a failed health check, not a 500
        return False, str(exc)
    names = ", ".join(t.name for t in found[:5])
    suffix = f" ({names}{', …' if len(found) > 5 else ''})" if found else ""
    return True, f"Verbindung erfolgreich -- {len(found)} Tool(s) gefunden{suffix}."


@app.get("/api/data-sources/health")
async def data_sources_health(_: dict = Depends(require_admin)) -> dict:
    """Runs every configured source's test-connection check in parallel (see individual
    /api/*/test-connection endpoints above) and classifies each as GREEN (reachable now),
    YELLOW (unreachable now but reachable on some earlier check -- e.g. a stale token or a
    temporary outage), or RED (never successfully reached)."""
    settings = db.load_settings()
    mcp_servers = db.list_mcp_servers()
    previously_ok = db.get_source_health()

    checks: list[tuple[str, Any]] = []
    if settings.get("nightscoutApiUrl"):
        checks.append(("nightscout", nightscout.test_connection(
            settings["nightscoutApiUrl"], settings["nightscoutApiAuthMethod"], settings["nightscoutApiSecret"],
        )))
    if settings.get("dexcomUsername"):
        checks.append(("dexcom", dexcom_share.test_connection(
            settings["dexcomUsername"], settings["dexcomPassword"], settings.get("dexcomRegion", "US"),
        )))
    if settings.get("libreEmail"):
        checks.append(("librelinkup", librelinkup.test_connection(
            settings["libreEmail"], settings["librePassword"], settings.get("libreRegion", "US"),
        )))
    if settings.get("feelfitEmail"):
        checks.append(("feelfit", feelfit.test_connection(settings["feelfitEmail"], settings["feelfitPassword"])))
    if settings.get("googleHealthRefreshToken"):
        checks.append(("google_health", _check_google_health(settings)))
    if settings.get("glookoUsername"):
        checks.append(("glooko", glooko.test_connection(settings["glookoUsername"], settings["glookoPassword"])))
    for server in mcp_servers:
        checks.append((server["id"], _check_mcp_server(server)))

    async def run_one(source_id: str, coro: Any) -> tuple[str, bool, str]:
        try:
            ok, message = await coro
        except Exception as exc:  # noqa: BLE001 -- a source blowing up must not break the others
            ok, message = False, str(exc)
        return source_id, ok, message

    results = await asyncio.gather(*(run_one(sid, coro) for sid, coro in checks))

    now = int(time.time() * 1000)
    sources: dict[str, dict] = {}
    for source_id, ok, message in results:
        if ok:
            db.mark_source_ok(source_id, now)
            status = "GREEN"
        elif source_id in previously_ok:
            status = "YELLOW"
        else:
            status = "RED"
        sources[source_id] = {"status": status, "message": message}
    return {"sources": sources}


@app.get("/api/mcp-servers/{server_id}/tools")
async def get_mcp_server_tools(server_id: str, _: dict = Depends(require_admin)) -> dict:
    server = db.get_mcp_server(server_id)
    if server is None:
        raise HTTPException(404, "Server nicht gefunden.")
    try:
        resolved = await tools.resolve_server_auth(server)
        discovered = await mcp_client.list_tools(resolved)
    except (mcp_client.McpClientError, oauth.OAuthError) as exc:
        raise HTTPException(502, str(exc)) from exc
    return {"tools": [{"name": t.name, "description": t.description, "inputSchema": t.input_schema} for t in discovered]}


# ---------------------------------------------------------------------------
# MCP OAuth2 (Authorization Code + PKCE) -- see oauth.py
# ---------------------------------------------------------------------------

class McpOAuthAuthorizeRequest(BaseModel):
    redirectUri: str


@app.post("/api/mcp-servers/{server_id}/oauth/authorize")
def mcp_oauth_authorize(server_id: str, req: McpOAuthAuthorizeRequest, _: dict = Depends(require_admin)) -> dict:
    server = db.get_mcp_server(server_id)
    if server is None:
        raise HTTPException(404, "Server nicht gefunden.")
    try:
        url = oauth.build_authorize_url(server, req.redirectUri)
    except oauth.OAuthError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"authorizeUrl": url}


@app.get("/api/mcp-servers/oauth/callback")
async def mcp_oauth_callback(code: str | None = None, state: str | None = None, error: str | None = None) -> RedirectResponse:
    target = "/settings/data-sources"
    if error:
        return RedirectResponse(f"{target}?oauth=error&detail={error}")
    if not code or not state:
        return RedirectResponse(f"{target}?oauth=error&detail=missing_code")
    server = db.get_mcp_server_by_oauth_state(state)
    if server is None:
        return RedirectResponse(f"{target}?oauth=error&detail=unknown_state")
    try:
        await oauth.exchange_code(server, code, server["oauthRedirectUri"])
    except oauth.OAuthError as exc:
        return RedirectResponse(f"{target}?oauth=error&detail={exc}")
    return RedirectResponse(f"{target}?oauth=success")


# ---------------------------------------------------------------------------
# Backup export/import
# ---------------------------------------------------------------------------

class ExportBackupRequest(BaseModel):
    password: str | None = None


@app.post("/api/backup/export")
def export_backup(req: ExportBackupRequest, _: dict = Depends(require_admin)) -> dict:
    return backup.export_backup(req.password)


class ImportBackupRequest(BaseModel):
    data: dict[str, Any]
    password: str | None = None


@app.post("/api/backup/import")
def import_backup(req: ImportBackupRequest, _: dict = Depends(require_admin)) -> dict:
    try:
        settings = backup.import_backup(req.data, req.password)
    except backup.PasswordRequiredError:
        raise HTTPException(422, "Diese Backup-Datei ist verschlüsselt -- bitte Passwort angeben.")
    except backup.WrongPasswordError:
        raise HTTPException(401, "Falsches Passwort.")
    return settings


# ---------------------------------------------------------------------------
# Performance-Log
# ---------------------------------------------------------------------------

@app.get("/api/performance-log")
def get_performance_log(_: dict = Depends(require_admin)) -> dict:
    return {"entries": db.list_log_entries()}


@app.delete("/api/performance-log")
def clear_performance_log(_: dict = Depends(require_admin)) -> dict:
    db.clear_log_entries()
    return {"cleared": True}
