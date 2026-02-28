"""Advanced service — Failure Simulation, Traffic Engineering, Metrics Export.

Phase 3 features:
- Failure simulation: bring down links/nodes and restore them
- Traffic engineering: policy-based path selection via OVS flow rules
- Metrics export: Prometheus-compatible and JSON format metrics
"""

from __future__ import annotations

import asyncio
import copy
import logging
import time
from datetime import datetime, timezone
from typing import Any

from app.core.config import settings
from app.services.ssh_utils import ssh_exec, ovs_exec

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════
# Failure Simulation
# ═══════════════════════════════════════════════════════════════════════════


class _SimulatedFailure:
    """Track a simulated failure."""

    __slots__ = ("target_type", "target_id", "details", "timestamp", "commands_applied")

    def __init__(
        self,
        target_type: str,
        target_id: str,
        details: dict[str, Any],
        commands_applied: list[str],
    ):
        self.target_type = target_type
        self.target_id = target_id
        self.details = details
        self.commands_applied = commands_applied
        self.timestamp = datetime.now(timezone.utc).isoformat()

    def to_dict(self) -> dict[str, Any]:
        return {
            "target_type": self.target_type,
            "target_id": self.target_id,
            "details": self.details,
            "timestamp": self.timestamp,
        }


class FailureSimulator:
    """Simulate network failures by manipulating OVS ports and network namespaces."""

    def __init__(self) -> None:
        self._active_failures: dict[str, _SimulatedFailure] = {}
        self._enabled = settings.ovs_enabled

    @property
    def active_failures(self) -> list[dict[str, Any]]:
        return [f.to_dict() for f in self._active_failures.values()]

    async def simulate_link_down(self, link_id: str) -> dict[str, Any]:
        """Simulate a link failure by bringing the OVS port down.

        link_id should be a port name on an OVS bridge (e.g. 'veth-sw1-h1').
        In mock mode, records the failure in memory without executing commands.
        """
        key = f"link:{link_id}"
        if key in self._active_failures:
            return {
                "success": False,
                "error": f"Link '{link_id}' is already in failed state",
                "active_failures": self.active_failures,
            }

        commands: list[str] = []

        if self._enabled:
            # Bring the interface down using ip link set
            cmd = f"ip link set {link_id} down"
            commands.append(cmd)
            result = await ssh_exec(cmd)
            if result.returncode != 0:
                logger.error("simulate_link_down failed for %s: %s", link_id, result.stderr)
                return {
                    "success": False,
                    "error": f"Failed to bring down link: {result.stderr}",
                }
        else:
            commands.append(f"[mock] ip link set {link_id} down")
            logger.info("[Mock] Simulated link-down for %s", link_id)

        failure = _SimulatedFailure(
            target_type="link",
            target_id=link_id,
            details={"action": "link_down", "port": link_id},
            commands_applied=commands,
        )
        self._active_failures[key] = failure

        return {
            "success": True,
            "message": f"Link '{link_id}' brought down successfully",
            "failure": failure.to_dict(),
            "active_failures": self.active_failures,
        }

    async def simulate_node_failure(self, node_id: str) -> dict[str, Any]:
        """Simulate a node failure by isolating a network namespace.

        For switches: disables all ports on the OVS bridge.
        For hosts/routers (netns): brings down all interfaces inside the namespace.
        """
        key = f"node:{node_id}"
        if key in self._active_failures:
            return {
                "success": False,
                "error": f"Node '{node_id}' is already in failed state",
                "active_failures": self.active_failures,
            }

        commands: list[str] = []
        details: dict[str, Any] = {"action": "node_failure", "node": node_id}

        if self._enabled:
            # Try as OVS bridge first
            br_check = await ovs_exec(f"ovs-vsctl br-exists {node_id}")
            if br_check.returncode == 0:
                # It's a bridge — get ports and bring them all down
                ports_result = await ovs_exec(f"ovs-vsctl list-ports {node_id}")
                ports = [p.strip() for p in ports_result.stdout.splitlines() if p.strip()]
                details["type"] = "switch"
                details["ports_disabled"] = ports
                for port in ports:
                    cmd = f"ip link set {port} down"
                    commands.append(cmd)
                    await ssh_exec(cmd)
            else:
                # Assume it's a network namespace — bring down all non-lo interfaces
                iface_result = await ssh_exec(
                    f"ip netns exec {node_id} ip -o link show | awk -F': ' '{{print $2}}' | grep -v lo"
                )
                ifaces = [i.strip().split("@")[0] for i in iface_result.stdout.splitlines() if i.strip()]
                details["type"] = "namespace"
                details["interfaces_disabled"] = ifaces
                for iface in ifaces:
                    cmd = f"ip netns exec {node_id} ip link set {iface} down"
                    commands.append(cmd)
                    await ssh_exec(cmd)
        else:
            commands.append(f"[mock] isolate node {node_id}")
            details["type"] = "mock"
            details["ports_disabled"] = ["veth0", "veth1"]
            logger.info("[Mock] Simulated node failure for %s", node_id)

        failure = _SimulatedFailure(
            target_type="node",
            target_id=node_id,
            details=details,
            commands_applied=commands,
        )
        self._active_failures[key] = failure

        return {
            "success": True,
            "message": f"Node '{node_id}' isolated successfully",
            "failure": failure.to_dict(),
            "active_failures": self.active_failures,
        }

    async def restore_all(self) -> dict[str, Any]:
        """Restore all simulated failures by re-enabling disabled links/nodes."""
        if not self._active_failures:
            return {
                "success": True,
                "message": "No active failures to restore",
                "restored": 0,
            }

        restored: list[str] = []
        errors: list[str] = []

        for key, failure in list(self._active_failures.items()):
            try:
                if self._enabled:
                    if failure.target_type == "link":
                        cmd = f"ip link set {failure.target_id} up"
                        result = await ssh_exec(cmd)
                        if result.returncode != 0:
                            errors.append(f"Failed to restore link {failure.target_id}: {result.stderr}")
                            continue
                    elif failure.target_type == "node":
                        detail = failure.details
                        if detail.get("type") == "switch":
                            for port in detail.get("ports_disabled", []):
                                await ssh_exec(f"ip link set {port} up")
                        elif detail.get("type") == "namespace":
                            for iface in detail.get("interfaces_disabled", []):
                                await ssh_exec(
                                    f"ip netns exec {failure.target_id} ip link set {iface} up"
                                )
                else:
                    logger.info("[Mock] Restored %s: %s", failure.target_type, failure.target_id)

                restored.append(failure.target_id)
                del self._active_failures[key]
            except Exception as exc:
                errors.append(f"Error restoring {failure.target_id}: {str(exc)}")

        return {
            "success": len(errors) == 0,
            "message": f"Restored {len(restored)} failure(s)"
            + (f", {len(errors)} error(s)" if errors else ""),
            "restored": len(restored),
            "restored_items": restored,
            "errors": errors,
            "remaining_failures": self.active_failures,
        }

    async def restore_one(self, target_id: str) -> dict[str, Any]:
        """Restore a single simulated failure."""
        # Find the failure by target_id
        matching_key = None
        for key, failure in self._active_failures.items():
            if failure.target_id == target_id:
                matching_key = key
                break

        if matching_key is None:
            return {
                "success": False,
                "error": f"No active failure found for '{target_id}'",
            }

        failure = self._active_failures[matching_key]

        if self._enabled:
            if failure.target_type == "link":
                result = await ssh_exec(f"ip link set {failure.target_id} up")
                if result.returncode != 0:
                    return {"success": False, "error": result.stderr}
            elif failure.target_type == "node":
                detail = failure.details
                if detail.get("type") == "switch":
                    for port in detail.get("ports_disabled", []):
                        await ssh_exec(f"ip link set {port} up")
                elif detail.get("type") == "namespace":
                    for iface in detail.get("interfaces_disabled", []):
                        await ssh_exec(
                            f"ip netns exec {failure.target_id} ip link set {iface} up"
                        )
        else:
            logger.info("[Mock] Restored %s: %s", failure.target_type, failure.target_id)

        del self._active_failures[matching_key]

        return {
            "success": True,
            "message": f"Restored '{target_id}' successfully",
            "active_failures": self.active_failures,
        }


# ═══════════════════════════════════════════════════════════════════════════
# Traffic Engineering
# ═══════════════════════════════════════════════════════════════════════════


class TrafficPolicy:
    """Represents a traffic engineering policy."""

    _counter = 0

    def __init__(
        self,
        name: str,
        description: str,
        match: dict[str, Any],
        action: dict[str, Any],
        priority: int = 100,
    ):
        TrafficPolicy._counter += 1
        self.id = f"policy-{TrafficPolicy._counter}"
        self.name = name
        self.description = description
        self.match = match  # e.g. {"src_ip": "10.0.0.0/24", "dst_ip": "10.0.1.0/24", "protocol": "tcp"}
        self.action = action  # e.g. {"type": "route", "next_hop": "192.168.1.1"} or {"type": "qos", "rate_limit": "10mbps"}
        self.priority = priority
        self.enabled = True
        self.hit_count = 0
        self.created_at = datetime.now(timezone.utc).isoformat()
        self.updated_at = self.created_at

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "match": self.match,
            "action": self.action,
            "priority": self.priority,
            "enabled": self.enabled,
            "hit_count": self.hit_count,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


class TrafficEngineer:
    """Manage traffic engineering policies via OVS flow rules."""

    def __init__(self) -> None:
        self._policies: dict[str, TrafficPolicy] = {}
        self._enabled = settings.ovs_enabled

    @property
    def policies(self) -> list[dict[str, Any]]:
        return [p.to_dict() for p in self._policies.values()]

    async def list_policies(self) -> dict[str, Any]:
        return {"policies": self.policies, "total": len(self._policies)}

    async def get_policy(self, policy_id: str) -> dict[str, Any] | None:
        p = self._policies.get(policy_id)
        return p.to_dict() if p else None

    async def create_policy(
        self,
        name: str,
        description: str = "",
        match: dict[str, Any] | None = None,
        action: dict[str, Any] | None = None,
        priority: int = 100,
    ) -> dict[str, Any]:
        """Create a traffic engineering policy and optionally install OVS flows."""
        match = match or {}
        action = action or {}

        policy = TrafficPolicy(
            name=name,
            description=description,
            match=match,
            action=action,
            priority=priority,
        )

        # Build OVS flow command from policy
        if self._enabled and action.get("type") in ("route", "forward", "qos"):
            flow_cmd = self._build_flow_command(policy)
            if flow_cmd:
                result = await ovs_exec(flow_cmd)
                if result.returncode != 0:
                    logger.warning("Failed to install flow for policy %s: %s", policy.id, result.stderr)

        self._policies[policy.id] = policy
        logger.info("Created traffic policy: %s (%s)", policy.name, policy.id)

        return {
            "success": True,
            "message": f"Policy '{name}' created",
            "policy": policy.to_dict(),
        }

    def _build_flow_command(self, policy: TrafficPolicy) -> str | None:
        """Build ovs-ofctl add-flow command from a traffic policy."""
        bridge = policy.match.get("bridge", "br0")
        match_parts: list[str] = []

        if "src_ip" in policy.match:
            match_parts.append(f"nw_src={policy.match['src_ip']}")
        if "dst_ip" in policy.match:
            match_parts.append(f"nw_dst={policy.match['dst_ip']}")
        if "protocol" in policy.match:
            proto = policy.match["protocol"]
            if proto == "tcp":
                match_parts.append("tcp")
            elif proto == "udp":
                match_parts.append("udp")
            elif proto == "icmp":
                match_parts.append("icmp")
        if "in_port" in policy.match:
            match_parts.append(f"in_port={policy.match['in_port']}")

        # Default to IP if we have nw_src/nw_dst but no specific protocol
        if any("nw_" in p for p in match_parts) and not any(
            p in ("tcp", "udp", "icmp") for p in match_parts
        ):
            match_parts.insert(0, "ip")

        # Determine action
        action_str = "NORMAL"
        action_type = policy.action.get("type", "forward")
        if action_type == "forward" and "output_port" in policy.action:
            action_str = f"output:{policy.action['output_port']}"
        elif action_type == "drop":
            action_str = "drop"
        elif action_type == "qos" and "queue" in policy.action:
            action_str = f"set_queue:{policy.action['queue']},NORMAL"
        elif action_type == "mirror" and "mirror_port" in policy.action:
            out = policy.action.get("output_port", "NORMAL")
            action_str = f"output:{policy.action['mirror_port']},{out}" if out != "NORMAL" else f"output:{policy.action['mirror_port']},NORMAL"

        match_str = ",".join(match_parts) if match_parts else "ip"
        return f"ovs-ofctl add-flow {bridge} priority={policy.priority},{match_str},actions={action_str}"

    async def update_policy(
        self, policy_id: str, updates: dict[str, Any]
    ) -> dict[str, Any]:
        """Update an existing traffic policy."""
        policy = self._policies.get(policy_id)
        if not policy:
            return {"success": False, "error": f"Policy '{policy_id}' not found"}

        for key in ("name", "description", "priority", "enabled"):
            if key in updates:
                setattr(policy, key, updates[key])
        if "match" in updates:
            policy.match = updates["match"]
        if "action" in updates:
            policy.action = updates["action"]
        policy.updated_at = datetime.now(timezone.utc).isoformat()

        return {
            "success": True,
            "message": f"Policy '{policy_id}' updated",
            "policy": policy.to_dict(),
        }

    async def delete_policy(self, policy_id: str) -> dict[str, Any]:
        """Delete a traffic policy."""
        if policy_id not in self._policies:
            return {"success": False, "error": f"Policy '{policy_id}' not found"}

        policy = self._policies.pop(policy_id)
        logger.info("Deleted traffic policy: %s (%s)", policy.name, policy.id)

        return {
            "success": True,
            "message": f"Policy '{policy.name}' deleted",
        }

    async def toggle_policy(self, policy_id: str) -> dict[str, Any]:
        """Enable or disable a traffic policy."""
        policy = self._policies.get(policy_id)
        if not policy:
            return {"success": False, "error": f"Policy '{policy_id}' not found"}

        policy.enabled = not policy.enabled
        policy.updated_at = datetime.now(timezone.utc).isoformat()

        return {
            "success": True,
            "message": f"Policy '{policy.name}' {'enabled' if policy.enabled else 'disabled'}",
            "policy": policy.to_dict(),
        }


# ═══════════════════════════════════════════════════════════════════════════
# Metrics Export
# ═══════════════════════════════════════════════════════════════════════════


class MetricsExporter:
    """Export platform metrics in JSON and Prometheus exposition format."""

    def __init__(self) -> None:
        self._start_time = time.time()

    async def export_json(self) -> dict[str, Any]:
        """Export all metrics as structured JSON."""
        from app.services.orchestrator import orchestrator

        # Gather metrics from all subsystems in parallel
        health, stats, sys_info = await asyncio.gather(
            orchestrator.get_health(),
            orchestrator.get_monitoring_stats(),
            orchestrator.get_system_info(),
        )

        return {
            "format": "json",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "system": {
                "version": sys_info.get("version", "0.1.0"),
                "mode": sys_info.get("mode", "dc"),
                "hostname": sys_info.get("hostname", "netorch"),
                "uptime_seconds": sys_info.get("uptime", 0),
            },
            "health": health,
            "resources": {
                "cpu_usage_percent": stats.get("cpu_usage", 0),
                "memory_usage_percent": stats.get("memory_usage", 0),
            },
            "networking": {
                "frr": stats.get("components", {}).get("frr", {}),
                "ovs": stats.get("components", {}).get("ovs", {}),
                "ryu": stats.get("components", {}).get("ryu", {}),
            },
            "api": {
                "requests_total": stats.get("api_requests_total", 0),
            },
        }

    async def export_prometheus(self) -> str:
        """Export metrics in Prometheus exposition text format."""
        from app.services.orchestrator import orchestrator

        health, stats, sys_info = await asyncio.gather(
            orchestrator.get_health(),
            orchestrator.get_monitoring_stats(),
            orchestrator.get_system_info(),
        )

        lines: list[str] = []

        def _add(name: str, value: Any, help_text: str, mtype: str = "gauge", labels: str = ""):
            lines.append(f"# HELP {name} {help_text}")
            lines.append(f"# TYPE {name} {mtype}")
            label_str = f"{{{labels}}}" if labels else ""
            lines.append(f"{name}{label_str} {value}")

        # System
        _add("netorch_up", 1, "Whether the NetOrch platform is up")
        _add("netorch_uptime_seconds", sys_info.get("uptime", 0), "Platform uptime in seconds", "counter")

        # Resources
        _add("netorch_cpu_usage_percent", stats.get("cpu_usage", 0), "CPU usage percentage")
        _add("netorch_memory_usage_percent", stats.get("memory_usage", 0), "Memory usage percentage")

        # API
        _add("netorch_api_requests_total", stats.get("api_requests_total", 0), "Total API requests", "counter")

        # Component health (1=up, 0=down, 0.5=mock)
        health_map = {"up": 1, "mock": 0.5, "down": 0, "unknown": 0}
        for component in ("frr", "ryu", "ovs"):
            status_val = health_map.get(health.get(component, "unknown"), 0)
            _add(
                "netorch_component_health",
                status_val,
                f"Health status of {component} (1=up, 0.5=mock, 0=down)",
                labels=f'component="{component}"',
            )

        # FRR metrics
        frr = stats.get("components", {}).get("frr", {})
        _add("netorch_frr_bgp_neighbors", frr.get("bgp_neighbors", 0), "Number of BGP neighbors")
        _add("netorch_frr_ospf_neighbors", frr.get("ospf_neighbors", 0), "Number of OSPF neighbors")
        _add("netorch_frr_routes_total", frr.get("total_routes", 0), "Total routes in FRR")

        # OVS metrics
        ovs = stats.get("components", {}).get("ovs", {})
        _add("netorch_ovs_bridges", ovs.get("bridges", 0), "Number of OVS bridges")
        _add("netorch_ovs_flows", ovs.get("flows", 0), "Number of OpenFlow rules")

        # Ryu metrics
        ryu = stats.get("components", {}).get("ryu", {})
        _add("netorch_ryu_switches", ryu.get("switches", 0), "Number of SDN switches")

        lines.append("")  # trailing newline
        return "\n".join(lines)


# ═══════════════════════════════════════════════════════════════════════════
# Singleton instances
# ═══════════════════════════════════════════════════════════════════════════

failure_simulator = FailureSimulator()
traffic_engineer = TrafficEngineer()
metrics_exporter = MetricsExporter()
