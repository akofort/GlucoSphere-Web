"""Settings backup export/import -- ported from the Android app's `SettingsBackup.kt` concept
(exports API keys/LLM choice/system prompt/MCP servers, deliberately NOT chat history), optional
password encryption via Fernet (AES-128-CBC + HMAC) with a PBKDF2-derived key -- same idea as the
Android app's own password-protected export, different concrete primitive (the Kotlin version used
the platform's own crypto APIs; this uses `cryptography`, the standard choice on the Python side).
"""
from __future__ import annotations

import base64
import json
import time
from typing import Any

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
import os

from . import db

BACKUP_VERSION = 1
_PBKDF2_ITERATIONS = 390_000


class WrongPasswordError(Exception):
    pass


class PasswordRequiredError(Exception):
    pass


def _derive_key(password: str, salt: bytes) -> bytes:
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=_PBKDF2_ITERATIONS)
    return base64.urlsafe_b64encode(kdf.derive(password.encode()))


def build_export_payload() -> dict[str, Any]:
    settings = db.load_settings()
    return {
        "version": BACKUP_VERSION,
        "exportedAt": int(time.time() * 1000),
        "settings": settings,
        "mcpServers": db.list_mcp_servers(),
    }


def export_backup(password: str | None) -> dict[str, Any]:
    payload = build_export_payload()
    if not password:
        return {"encrypted": False, **payload}
    salt = os.urandom(16)
    key = _derive_key(password, salt)
    token = Fernet(key).encrypt(json.dumps(payload).encode())
    return {
        "encrypted": True,
        "version": BACKUP_VERSION,
        "salt": base64.b64encode(salt).decode(),
        "ciphertext": token.decode(),
    }


def import_backup(data: dict[str, Any], password: str | None) -> dict[str, Any]:
    if data.get("encrypted"):
        if not password:
            raise PasswordRequiredError()
        try:
            salt = base64.b64decode(data["salt"])
            key = _derive_key(password, salt)
            plaintext = Fernet(key).decrypt(data["ciphertext"].encode())
            payload = json.loads(plaintext)
        except (InvalidToken, KeyError, ValueError) as exc:
            raise WrongPasswordError() from exc
    else:
        payload = data

    settings = payload.get("settings", {})
    db.save_settings(settings)
    for server in payload.get("mcpServers", []):
        server = dict(server)
        server.pop("createdAt", None)
        db.upsert_mcp_server(server)
    return db.load_settings()
