"""NetOrch Backend - Hybrid SDN Orchestration Platform API."""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.health import router as health_router
from app.api.v1.router import router as v1_router
from app.core.config import settings

# Configure logging
logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

app = FastAPI(
    title=settings.project_name,
    version="0.1.0",
    description="REST API for the Hybrid SDN and Routing Orchestration Platform",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS - allow frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite dev server
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(health_router, prefix=settings.api_v1_prefix)
app.include_router(v1_router, prefix=settings.api_v1_prefix)


@app.get("/", tags=["Root"])
async def root():
    """Root endpoint."""
    return {
        "name": settings.project_name,
        "version": "0.1.0",
        "docs": "/docs",
        "api": settings.api_v1_prefix,
    }
