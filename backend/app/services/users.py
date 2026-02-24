"""User store — JSON-file-based user management with roles.

Roles: admin, operator, viewer
  - admin: full access (CRUD users, audit, all endpoints)
  - operator: can manage topology, flows, routing, tools, but not users
  - viewer: read-only access to all data
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Literal

from app.core.security import get_password_hash, verify_password

logger = logging.getLogger(__name__)

Role = Literal["admin", "operator", "viewer"]
VALID_ROLES: set[str] = {"admin", "operator", "viewer"}

USERS_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "data", "users.json")


def _ensure_data_dir():
    os.makedirs(os.path.dirname(USERS_FILE), exist_ok=True)


def _load_users() -> dict[str, dict[str, Any]]:
    """Load users from JSON file. Returns dict keyed by username."""
    if not os.path.exists(USERS_FILE):
        return {}
    try:
        with open(USERS_FILE, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _save_users(users: dict[str, dict[str, Any]]) -> None:
    _ensure_data_dir()
    with open(USERS_FILE, "w", encoding="utf-8") as f:
        json.dump(users, f, indent=2)


def _bootstrap_default_admin() -> None:
    """Create default admin user if no users exist."""
    from app.core.config import settings

    users = _load_users()
    if users:
        return
    users[settings.admin_username] = {
        "username": settings.admin_username,
        "password_hash": get_password_hash(settings.admin_password),
        "role": "admin",
        "display_name": "Administrator",
    }
    _save_users(users)
    logger.info("Bootstrapped default admin user: %s", settings.admin_username)


def authenticate(username: str, password: str) -> dict[str, Any] | None:
    """Verify credentials. Returns user dict (without hash) or None."""
    _bootstrap_default_admin()
    users = _load_users()
    user = users.get(username)
    if user is None:
        return None
    if not verify_password(password, user["password_hash"]):
        return None
    return {k: v for k, v in user.items() if k != "password_hash"}


def get_user(username: str) -> dict[str, Any] | None:
    """Get user info (without hash)."""
    _bootstrap_default_admin()
    users = _load_users()
    user = users.get(username)
    if user is None:
        return None
    return {k: v for k, v in user.items() if k != "password_hash"}


def list_users() -> list[dict[str, Any]]:
    """List all users (without hashes)."""
    _bootstrap_default_admin()
    users = _load_users()
    return [
        {k: v for k, v in u.items() if k != "password_hash"}
        for u in users.values()
    ]


def _validate_password(password: str) -> None:
    """Validate password complexity."""
    from app.core.config import settings
    min_len = settings.min_password_length
    if len(password) < min_len:
        raise ValueError(f"Password must be at least {min_len} characters")


def create_user(
    username: str,
    password: str,
    role: str = "viewer",
    display_name: str = "",
) -> dict[str, Any]:
    """Create a new user. Raises ValueError if exists."""
    _bootstrap_default_admin()
    if role not in VALID_ROLES:
        raise ValueError(f"Invalid role: {role}. Must be one of {VALID_ROLES}")
    if not username or not username.strip():
        raise ValueError("Username cannot be empty")
    _validate_password(password)
    users = _load_users()
    if username in users:
        raise ValueError(f"User '{username}' already exists")
    user_data = {
        "username": username,
        "password_hash": get_password_hash(password),
        "role": role,
        "display_name": display_name or username,
    }
    users[username] = user_data
    _save_users(users)
    return {k: v for k, v in user_data.items() if k != "password_hash"}


def update_user(
    username: str,
    *,
    role: str | None = None,
    password: str | None = None,
    display_name: str | None = None,
) -> dict[str, Any]:
    """Update user fields. Raises ValueError if not found."""
    users = _load_users()
    if username not in users:
        raise ValueError(f"User '{username}' not found")
    if role is not None:
        if role not in VALID_ROLES:
            raise ValueError(f"Invalid role: {role}. Must be one of {VALID_ROLES}")
        users[username]["role"] = role
    if password is not None:
        _validate_password(password)
        users[username]["password_hash"] = get_password_hash(password)
    if display_name is not None:
        users[username]["display_name"] = display_name
    _save_users(users)
    return {k: v for k, v in users[username].items() if k != "password_hash"}


def delete_user(username: str) -> bool:
    """Delete a user. Returns True if deleted. Cannot delete last admin."""
    users = _load_users()
    if username not in users:
        raise ValueError(f"User '{username}' not found")
    # Prevent deleting the last admin
    admins = [u for u in users.values() if u["role"] == "admin"]
    if users[username]["role"] == "admin" and len(admins) <= 1:
        raise ValueError("Cannot delete the last admin user")
    del users[username]
    _save_users(users)
    return True
