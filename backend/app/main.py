"""NetOrch Backend - Hybrid SDN Orchestration Platform API."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.health import router as health_router
from app.api.v1.router import router as v1_router
from app.api.v1.ws import router as ws_router, start_broadcast_loop, manager as ws_manager
from app.api.v1.terminal import router as terminal_router
from app.core.config import settings
from app.services.ssh_utils import cleanup_control_master
from app.services.orchestrator import orchestrator

# Configure logging
logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)


logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    # Security warnings
    if not settings.is_production:
        logger.warning(
            "⚠️  Running with default SECRET_KEY — set SECRET_KEY env var for production!"
        )
    if settings.admin_password == "admin123":
        logger.warning(
            "⚠️  Default admin password in use — set ADMIN_PASSWORD env var!"
        )

    # Warm up SSH ControlMaster connection to avoid first-request timeout
    from app.services.ssh_utils import _ensure_control_master
    try:
        await _ensure_control_master()
        logger.info("✓ SSH ControlMaster warmed up")
    except Exception as e:
        logger.warning(f"SSH warmup failed (VM may be offline): {e}")

    start_broadcast_loop()
    ws_manager.push_event("info", "system", "Platform started — WebSocket broadcasting enabled")
    yield
    # Cleanup resources on shutdown
    await orchestrator.shutdown()
    await cleanup_control_master()


app = FastAPI(
    title=settings.project_name,
    version="0.1.0",
    description="REST API for the Hybrid SDN and Routing Orchestration Platform",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS - configurable via CORS_ORIGINS env var
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(health_router, prefix=settings.api_v1_prefix)
app.include_router(v1_router, prefix=settings.api_v1_prefix)
app.include_router(ws_router, prefix=settings.api_v1_prefix)
app.include_router(terminal_router, prefix=settings.api_v1_prefix)


@app.get("/", tags=["Root"])
async def root():
    """Root endpoint."""
    return {
        "name": settings.project_name,
        "version": "0.1.0",
        "docs": "/docs",
        "api": settings.api_v1_prefix,
    }
