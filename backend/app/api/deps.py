"""API dependencies - auth, services, etc."""

from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import settings
from app.core.security import verify_token
from app.services.orchestrator import orchestrator

security = HTTPBearer(auto_error=False)


async def get_orchestrator():
    """Get the orchestrator singleton."""
    orchestrator.increment_requests()
    return orchestrator


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> str:
    """Validate JWT token and return username."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    username = verify_token(credentials.credentials)
    if username is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    return username


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> str | None:
    """Optionally validate JWT token. Returns None if not authenticated."""
    if credentials is None:
        return None
    return verify_token(credentials.credentials)
