"""Audit log endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from app.api.deps import get_current_user, require_role
from app.services import audit

router = APIRouter(prefix="/audit", tags=["Audit"])


@router.get("/logs")
async def get_audit_logs(
    limit: int = 50,
    offset: int = 0,
    user: str | None = None,
    action: str | None = None,
    resource: str | None = None,
    _caller: dict = Depends(get_current_user),
):
    """Get audit log entries (any authenticated user)."""
    entries, total = audit.get_entries(
        limit=limit,
        offset=offset,
        user=user,
        action=action,
        resource=resource,
    )
    return {"entries": entries, "total": total}


@router.delete("/logs")
async def clear_audit_logs(
    req: Request,
    admin: dict = Depends(require_role("admin")),
):
    """Clear all audit logs (admin only)."""
    count = audit.clear()
    audit.record(
        user=admin["username"],
        role=admin["role"],
        action="clear_audit",
        resource="audit",
        detail=f"cleared {count} entries",
        ip=req.client.host if req.client else "",
    )
    return {"success": True, "cleared": count}
