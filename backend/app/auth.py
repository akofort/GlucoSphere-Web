"""Multi-user login (session cookie) -- see README "Mehrere Benutzer". Two roles: ADMIN (full
access -- API keys, MCP servers, backup, everyone's accounts) and MEMBER (chat + Übersicht only,
read-only otherwise -- e.g. family/Diabetes-Team members). PBKDF2-HMAC-SHA256 hashing (stdlib
`hashlib`, no extra dependency), opaque random session tokens in `sessions` (no JWT -- nothing
here needs to be stateless/self-contained).
"""
from __future__ import annotations

import hashlib
import os
import secrets

from . import db

SESSION_COOKIE_NAME = "glucosphere_session"
SESSION_TTL_SECONDS = 30 * 24 * 60 * 60  # 30 days
_PBKDF2_ITERATIONS = 210_000

ROLE_ADMIN = "ADMIN"
ROLE_MEMBER = "MEMBER"


def hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), _PBKDF2_ITERATIONS).hex()


def ensure_admin_bootstrapped() -> str | None:
    """Called once at startup. Returns a freshly generated password if the first ADMIN account had
    to be created (so `main.py` can log it), None if any user already existed.
    `ADMIN_USERNAME`/`ADMIN_PASSWORD` env vars seed the initial account if set; otherwise a random
    password is generated and only ever shown once, in the startup log
    (`docker compose logs backend`)."""
    if db.count_users() > 0:
        return None
    username = os.environ.get("ADMIN_USERNAME", "admin")
    password = os.environ.get("ADMIN_PASSWORD") or secrets.token_urlsafe(12)
    salt = secrets.token_hex(16)
    db.create_user(username, hash_password(password, salt), salt, ROLE_ADMIN)
    return password if not os.environ.get("ADMIN_PASSWORD") else None


def verify_login(username: str, password: str) -> dict | None:
    user = db.get_user_by_username_raw(username)
    if user is None:
        return None
    if not secrets.compare_digest(hash_password(password, user["salt"]), user["passwordHash"]):
        return None
    return user


def create_session(user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    db.create_db_session(token, user_id, SESSION_TTL_SECONDS)
    return token


def get_session_user(token: str | None) -> dict | None:
    """Resolves a session cookie straight to the logged-in user's public profile (id/username/
    role/displayName/userRole/appLanguage), or None if the session is missing/expired/orphaned."""
    if not token:
        return None
    session = db.get_db_session(token)
    if session is None:
        return None
    return db.get_user(session["userId"])


def is_valid_session(token: str | None) -> bool:
    return get_session_user(token) is not None


def destroy_session(token: str) -> None:
    db.delete_db_session(token)


def change_password(user_id: str, current_password: str, new_password: str) -> bool:
    user = db.get_user_raw(user_id)
    if user is None or not secrets.compare_digest(hash_password(current_password, user["salt"]), user["passwordHash"]):
        return False
    salt = secrets.token_hex(16)
    db.set_user_password(user_id, hash_password(new_password, salt), salt)
    return True
