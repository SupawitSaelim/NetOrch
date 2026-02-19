"""API dependencies - auth, services, role-based access control."""

from __future__ import annotations

from typing import Any

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.security import verify_token
from app.services.orchestrator import orchestrator

security = HTTPBearer(auto_error=False)


async def get_orchestrator():
    """Get the orchestrator singleton."""
    orchestrator.increment_requests()
    return orchestrator


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict[str, str]:
    """Validate JWT token and return {username, role}."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    info = verify_token(credentials.credentials)
    if info is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    return {"username": info["sub"], "role": info["role"]}


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict[str, str] | None:
    """Optionally validate JWT token. Returns None if not authenticated."""
    if credentials is None:
        return None
    info = verify_token(credentials.credentials)
    if info is None:
        return None
    return {"username": info["sub"], "role": info["role"]}


def require_role(*allowed_roles: str):
    """Dependency factory that checks the user has one of the allowed roles.

    Usage:
        @router.post(..., dependencies=[Depends(require_role("admin", "operator"))])
    or as a parameter:
        user = Depends(require_role("admin"))
    """

    async def _guard(
        user: dict[str, str] = Depends(get_current_user),
    ) -> dict[str, str]:
        if user["role"] not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{user['role']}' is not authorized. Requires: {', '.join(allowed_roles)}",
            )
        return user

    return _guard
