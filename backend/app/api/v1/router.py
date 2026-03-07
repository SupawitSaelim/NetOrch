"""V1 API router - aggregates all v1 endpoints."""

from fastapi import APIRouter

from app.api.v1.audit import router as audit_router
from app.api.v1.advanced import router as advanced_router
from app.api.v1.auth import router as auth_router
from app.api.v1.connection import router as connection_router
from app.api.v1.monitoring import router as monitoring_router
from app.api.v1.network_tools import router as network_tools_router
from app.api.v1.routing import router as routing_router
from app.api.v1.sdn import router as sdn_router
from app.api.v1.system import router as system_router
from app.api.v1.topology import router as topology_router
from app.api.v1.topology_builder import router as topology_builder_router
from app.api.v1.vrf import router as vrf_router

router = APIRouter()

router.include_router(auth_router)
router.include_router(system_router)
router.include_router(connection_router)
router.include_router(routing_router)
router.include_router(sdn_router)
router.include_router(topology_router)
router.include_router(topology_builder_router)
router.include_router(monitoring_router)
router.include_router(vrf_router)
router.include_router(network_tools_router)
router.include_router(audit_router)
router.include_router(advanced_router)
