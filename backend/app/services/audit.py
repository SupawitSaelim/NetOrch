"""Audit log service — records all state-changing operations."""

from __future__ import annotations

import json
import logging
import os
from collections import deque
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

AUDIT_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "data", "audit.jsonl")

# In-memory ring buffer (most recent 500 entries)
_MAX_ENTRIES = 500
_log: deque[dict[str, Any]] = deque(maxlen=_MAX_ENTRIES)
_counter = 0


def _ensure_data_dir():
    d = os.path.dirname(AUDIT_FILE)
    os.makedirs(d, exist_ok=True)


def record(
    *,
    user: str,
    role: str = "unknown",
    action: str,
    resource: str,
    detail: str = "",
    ip: str = "",
) -> dict[str, Any]:
    """Record an audit event. Persists to JSONL file and keeps in memory."""
    global _counter
    _counter += 1
    entry: dict[str, Any] = {
        "id": _counter,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "user": user,
        "role": role,
        "action": action,
        "resource": resource,
        "detail": detail,
        "ip": ip,
    }
    _log.appendleft(entry)

    # Append to file (best-effort)
    try:
        _ensure_data_dir()
        with open(AUDIT_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to persist audit entry: %s", exc)

    return entry


def get_entries(
    *,
    limit: int = 50,
    offset: int = 0,
    user: str | None = None,
    action: str | None = None,
    resource: str | None = None,
) -> tuple:
    """Return filtered audit entries from memory (newest first)."""
    filtered = list(_log)
    if user:
        filtered = [e for e in filtered if e["user"] == user]
    if action:
        filtered = [e for e in filtered if action.lower() in e["action"].lower()]
    if resource:
        filtered = [e for e in filtered if resource.lower() in e["resource"].lower()]
    total = len(filtered)
    return filtered[offset : offset + limit], total


def clear() -> int:
    """Clear all audit entries. Returns count removed."""
    count = len(_log)
    _log.clear()
    if os.path.exists(AUDIT_FILE):
        os.remove(AUDIT_FILE)
    return count
