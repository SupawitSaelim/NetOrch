"""System mode and configuration endpoints."""

from fastapi import APIRouter, Depends

from app.api.deps import get_current_user, get_orchestrator
from app.core.config import settings
from app.schemas.common import SystemModeRequest, SystemModeResponse
from app.services.orchestrator import Orchestrator

router = APIRouter(prefix="/system", tags=["System"])


@router.get("/mode", response_model=SystemModeResponse)
async def get_mode():
    """Get current system mode (dc or wan)."""
    return SystemModeResponse(mode=settings.system_mode)


@router.put("/mode", response_model=SystemModeResponse)
async def set_mode(
    request: SystemModeRequest,
    _user: str = Depends(get_current_user),
    orch: Orchestrator = Depends(get_orchestrator),
):
    """Set system mode (requires auth)."""
    if request.mode not in ("dc", "wan"):
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Mode must be 'dc' or 'wan'")
    settings.system_mode = request.mode
    return SystemModeResponse(mode=settings.system_mode)
