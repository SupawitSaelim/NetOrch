"""Open vSwitch service - interface to OVS commands.

When OVS is not available, returns mock data for development.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)


class OVSService:
    """Interface to Open vSwitch."""

    def __init__(self):
        self._enabled = settings.ovs_enabled
        self._vsctl_path = settings.ovs_vsctl_path

    async def list_bridges(self) -> list[dict]:
        """List all OVS bridges."""
        if not self._enabled:
            return [
                {"name": "br0", "dpid": "0000000000000001", "ports": ["eth0", "eth1", "vxlan0"]},
                {"name": "br1", "dpid": "0000000000000002", "ports": ["eth2", "eth3"]},
            ]
        return []

    async def create_bridge(
        self,
        name: str,
        protocols: list[str] | None = None,
        controller: str | None = None,
    ) -> bool:
        """Create OVS bridge."""
        if not self._enabled:
            logger.info(f"[Mock] Created bridge {name}")
            return True
        return False

    async def delete_bridge(self, name: str) -> bool:
        """Delete OVS bridge."""
        if not self._enabled:
            logger.info(f"[Mock] Deleted bridge {name}")
            return True
        return False

    async def add_port(self, bridge: str, port_name: str, **options: Any) -> bool:
        """Add port to bridge."""
        if not self._enabled:
            logger.info(f"[Mock] Added port {port_name} to {bridge}")
            return True
        return False

    async def delete_port(self, bridge: str, port_name: str) -> bool:
        """Delete port from bridge."""
        if not self._enabled:
            logger.info(f"[Mock] Deleted port {port_name} from {bridge}")
            return True
        return False

    async def set_controller(self, bridge: str, controller_url: str) -> bool:
        """Set OpenFlow controller for bridge."""
        if not self._enabled:
            logger.info(f"[Mock] Set controller {controller_url} for {bridge}")
            return True
        return False

    async def create_vxlan_port(
        self,
        bridge: str,
        port_name: str,
        remote_ip: str,
        vni: int,
        dst_port: int = 4789,
    ) -> bool:
        """Create VXLAN tunnel port."""
        if not self._enabled:
            logger.info(f"[Mock] Created VXLAN port {port_name} on {bridge} (VNI={vni})")
            return True
        return False

    async def get_status(self) -> str:
        """Check OVS status."""
        if not self._enabled:
            return "mock"
        return "unknown"
