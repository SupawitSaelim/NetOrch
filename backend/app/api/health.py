"""Health check endpoint (no auth required)."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from app.api.deps import get_orchestrator
from app.schemas.common import HealthComponent, HealthResponse, SystemInfo
from app.services.orchestrator import Orchestrator

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health_check(orch: Orchestrator = Depends(get_orchestrator)):
    """Check the health of all system components."""
    components = await orch.get_health()
    return HealthResponse(
        status="healthy",
        components=HealthComponent(**components),
        timestamp=datetime.now(timezone.utc),
    )


@router.get("/system/info", response_model=SystemInfo)
async def system_info(orch: Orchestrator = Depends(get_orchestrator)):
    """Get system information."""
    info = await orch.get_system_info()
    return SystemInfo(**info)
