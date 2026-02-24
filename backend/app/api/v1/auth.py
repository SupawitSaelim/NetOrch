"""Authentication & user-management endpoints."""

from __future__ import annotations

from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from app.core.config import settings
from app.core.security import create_access_token
from app.core.rate_limit import login_limiter
from app.api.deps import get_current_user, require_role
from app.schemas.common import LoginRequest, TokenResponse
from app.services import users as user_store
from app.services import audit

router = APIRouter(prefix="/auth", tags=["Authentication"])


# ── Login ──────────────────────────────────────────────
@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest, req: Request):
    """Authenticate and receive a JWT token."""
    client_ip = req.client.host if req.client else "unknown"
    login_limiter.check(client_ip)
    user = user_store.authenticate(request.username, request.password)
    if user is None:
        audit.record(
            user=request.username,
            action="login_failed",
            resource="auth",
            ip=req.client.host if req.client else "",
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    role = user.get("role", "viewer")
    login_limiter.reset(client_ip)  # reset on successful login
    token = create_access_token(
        subject=request.username,
        role=role,
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
    )
    audit.record(
        user=request.username,
        role=role,
        action="login",
        resource="auth",
        ip=req.client.host if req.client else "",
    )
    return TokenResponse(
        access_token=token,
        expires_in=settings.access_token_expire_minutes * 60,
        role=role,
    )


# ── Current user info ─────────────────────────────────
@router.get("/me")
async def get_me(user: dict = Depends(get_current_user)):
    """Get current user info."""
    info = user_store.get_user(user["username"])
    if info is None:
        return {"username": user["username"], "role": user["role"]}
    return info


# ── User management (admin only) ──────────────────────
class CreateUserRequest(BaseModel):
    username: str
    password: str
    role: str = "viewer"
    display_name: str = ""


class UpdateUserRequest(BaseModel):
    role: Optional[str] = None
    password: Optional[str] = None
    display_name: Optional[str] = None


@router.get("/users")
async def list_users(admin: dict = Depends(require_role("admin"))):
    """List all users (admin only)."""
    return {"users": user_store.list_users()}


@router.post("/users", status_code=201)
async def create_user(
    data: CreateUserRequest,
    req: Request,
    admin: dict = Depends(require_role("admin")),
):
    """Create a new user (admin only)."""
    try:
        user = user_store.create_user(
            username=data.username,
            password=data.password,
            role=data.role,
            display_name=data.display_name,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    audit.record(
        user=admin["username"],
        role=admin["role"],
        action="create_user",
        resource=f"user:{data.username}",
        detail=f"role={data.role}",
        ip=req.client.host if req.client else "",
    )
    return {"success": True, "user": user}


@router.put("/users/{username}")
async def update_user(
    username: str,
    data: UpdateUserRequest,
    req: Request,
    admin: dict = Depends(require_role("admin")),
):
    """Update a user (admin only)."""
    try:
        user = user_store.update_user(
            username, role=data.role, password=data.password, display_name=data.display_name
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    audit.record(
        user=admin["username"],
        role=admin["role"],
        action="update_user",
        resource=f"user:{username}",
        detail=f"fields={'|'.join(k for k, v in data.model_dump().items() if v is not None)}",
        ip=req.client.host if req.client else "",
    )
    return {"success": True, "user": user}


@router.delete("/users/{username}")
async def delete_user(
    username: str,
    req: Request,
    admin: dict = Depends(require_role("admin")),
):
    """Delete a user (admin only). Cannot delete last admin."""
    try:
        user_store.delete_user(username)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    audit.record(
        user=admin["username"],
        role=admin["role"],
        action="delete_user",
        resource=f"user:{username}",
        ip=req.client.host if req.client else "",
    )
    return {"success": True, "message": f"User '{username}' deleted"}
