"""Common schemas shared across the application."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class SuccessResponse(BaseModel):
    success: bool = True
    message: str = "OK"


class ErrorResponse(BaseModel):
    error: str
    message: str
    details: dict[str, Any] | None = None
    timestamp: datetime


class HealthComponent(BaseModel):
    api: str = "up"
    frr: str = "unknown"
    ryu: str = "unknown"
    ovs: str = "unknown"


class HealthResponse(BaseModel):
    status: str = "healthy"
    components: HealthComponent = HealthComponent()
    timestamp: datetime


class SystemInfo(BaseModel):
    version: str = "0.1.0"
    mode: str = "dc"
    uptime: int = 0
    hostname: str = "netorch"


class SystemModeRequest(BaseModel):
    mode: str  # "dc" or "wan"


class SystemModeResponse(BaseModel):
    mode: str


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int = 3600
    role: str = "viewer"
