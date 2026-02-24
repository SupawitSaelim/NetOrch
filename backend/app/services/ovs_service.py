"""Open vSwitch service - interface to OVS via SSH.

When OVS is disabled, returns mock data for macOS development.
When enabled, executes ovs-vsctl / ovs-ofctl on the Red Hat VM via SSH.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from app.core.config import settings
from app.services.ssh_utils import ovs_exec, ssh_exec

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _parse_bridge_info(name: str, ports_out: str, dpid_out: str, ctrl_out: str) -> dict:
    """Build a bridge dict from several ovs-vsctl outputs."""
    ports = [p.strip() for p in ports_out.strip().splitlines() if p.strip()]
    dpid = dpid_out.strip().replace('"', '')
    controller = ctrl_out.strip()
    return {"name": name, "dpid": dpid or name, "ports": ports, "controller": controller}


# ---------------------------------------------------------------------------
# Service class
# ---------------------------------------------------------------------------
class OVSService:
    """Interface to Open vSwitch."""

    def __init__(self) -> None:
        self._enabled = settings.ovs_enabled
        self._vsctl_path = settings.ovs_vsctl_path

    # -- Bridges -----------------------------------------------------------

    async def list_bridges(self) -> list[dict]:
        """List all OVS bridges."""
        if not self._enabled:
            return [
                {"name": "br0", "dpid": "0000000000000001", "ports": ["eth0", "eth1", "vxlan0"],
                 "controller": "tcp:127.0.0.1:6633"},
                {"name": "br1", "dpid": "0000000000000002", "ports": ["eth2", "eth3"],
                 "controller": "tcp:127.0.0.1:6633"},
            ]

        try:
            result = await ovs_exec("ovs-vsctl list-br")
            if result.returncode != 0:
                logger.error("ovs-vsctl list-br failed: %s", result.stderr)
                return []

            bridge_names = [n.strip() for n in result.stdout.splitlines() if n.strip()]
            if not bridge_names:
                return []

            # Fetch ports, dpid, and controller for ALL bridges in parallel
            # instead of 3 sequential SSH calls per bridge
            async def _fetch_bridge(name: str) -> dict:
                ports_r, dpid_r, ctrl_r = await asyncio.gather(
                    ovs_exec(f"ovs-vsctl list-ports {name}"),
                    ovs_exec(f"ovs-vsctl get bridge {name} datapath_id"),
                    ovs_exec(f"ovs-vsctl get-controller {name}"),
                )
                return _parse_bridge_info(name, ports_r.stdout, dpid_r.stdout, ctrl_r.stdout)

            bridges = await asyncio.gather(*[_fetch_bridge(n) for n in bridge_names])
            return list(bridges)
        except Exception as exc:
            logger.error("list_bridges error: %s", exc)
            return []

    async def get_bridge(self, name: str) -> dict | None:
        """Get a single bridge by name."""
        bridges = await self.list_bridges()
        return next((b for b in bridges if b["name"] == name), None)

    async def create_bridge(
        self,
        name: str,
        protocols: list[str] | None = None,
        controller: str | None = None,
    ) -> bool:
        """Create OVS bridge."""
        if not self._enabled:
            logger.info("[Mock] Created bridge %s", name)
            return True

        try:
            cmd = f"ovs-vsctl --may-exist add-br {name}"
            result = await ovs_exec(cmd)
            if result.returncode != 0:
                logger.error("create_bridge failed: %s", result.stderr)
                return False

            if protocols:
                proto_str = ",".join(protocols)
                await ovs_exec(f"ovs-vsctl set bridge {name} protocols={proto_str}")
            if controller:
                await ovs_exec(f"ovs-vsctl set-controller {name} {controller}")
            return True
        except Exception as exc:
            logger.error("create_bridge error: %s", exc)
            return False

    async def delete_bridge(self, name: str) -> bool:
        """Delete OVS bridge."""
        if not self._enabled:
            logger.info("[Mock] Deleted bridge %s", name)
            return True

        try:
            result = await ovs_exec(f"ovs-vsctl --if-exists del-br {name}")
            return result.returncode == 0
        except Exception as exc:
            logger.error("delete_bridge error: %s", exc)
            return False

    # -- Ports -------------------------------------------------------------

    async def add_port(self, bridge: str, port_name: str, **options: Any) -> bool:
        """Add port to bridge."""
        if not self._enabled:
            logger.info("[Mock] Added port %s to %s", port_name, bridge)
            return True

        try:
            cmd = f"ovs-vsctl --may-exist add-port {bridge} {port_name}"
            # Append any type/option settings
            iface_type = options.get("type")
            if iface_type:
                cmd += f" -- set interface {port_name} type={iface_type}"
                for key, value in options.items():
                    if key != "type":
                        cmd += f" options:{key}={value}"
            result = await ovs_exec(cmd)
            return result.returncode == 0
        except Exception as exc:
            logger.error("add_port error: %s", exc)
            return False

    async def delete_port(self, bridge: str, port_name: str) -> bool:
        """Delete port from bridge."""
        if not self._enabled:
            logger.info("[Mock] Deleted port %s from %s", port_name, bridge)
            return True

        try:
            result = await ovs_exec(f"ovs-vsctl --if-exists del-port {bridge} {port_name}")
            return result.returncode == 0
        except Exception as exc:
            logger.error("delete_port error: %s", exc)
            return False

    # -- Controller --------------------------------------------------------

    async def set_controller(self, bridge: str, controller_url: str) -> bool:
        """Set OpenFlow controller for bridge."""
        if not self._enabled:
            logger.info("[Mock] Set controller %s for %s", controller_url, bridge)
            return True

        try:
            result = await ovs_exec(f"ovs-vsctl set-controller {bridge} {controller_url}")
            return result.returncode == 0
        except Exception as exc:
            logger.error("set_controller error: %s", exc)
            return False

    # -- VXLAN tunnels -----------------------------------------------------

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
            logger.info("[Mock] Created VXLAN %s on %s (VNI=%d)", port_name, bridge, vni)
            return True

        return await self.add_port(
            bridge,
            port_name,
            type="vxlan",
            remote_ip=remote_ip,
            key=str(vni),
            dst_port=str(dst_port),
        )

    # -- Status ------------------------------------------------------------

    async def get_status(self) -> str:
        """Check OVS status."""
        if not self._enabled:
            return "mock"
        try:
            result = await ssh_exec("pgrep -c ovs-vswitchd")
            count = int(result.stdout.strip()) if result.stdout.strip().isdigit() else 0
            return "up" if count > 0 else "down"
        except Exception:
            return "down"
