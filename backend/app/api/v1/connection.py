"""Connection settings endpoints — detect, update, test, and manage VM services."""

from __future__ import annotations

import asyncio
import logging
import os
import re

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.deps import get_current_user, require_role
from app.core.config import settings
from app.services import audit
from app.services.ssh_utils import cleanup_control_master, ssh_exec

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/connection", tags=["Connection"])


# ── Schemas ──────────────────────────────────────────────────────────────

class ConnectionSettings(BaseModel):
    vm_host: str
    vm_user: str
    vm_ssh_key: str
    ryu_url: str
    frr_enabled: bool
    ryu_enabled: bool
    ovs_enabled: bool


class ConnectionUpdateRequest(BaseModel):
    vm_host: str | None = None
    vm_user: str | None = None
    vm_ssh_key: str | None = None
    ryu_url: str | None = None
    frr_enabled: bool | None = None
    ryu_enabled: bool | None = None
    ovs_enabled: bool | None = None


class TestResult(BaseModel):
    ssh: dict
    ryu: dict
    frr: dict
    ovs: dict


class DetectResult(BaseModel):
    """Attempt to auto-detect the VM IP via known methods."""
    detected_ip: str | None = None
    method: str | None = None
    candidates: list[dict] = []


# ── Helpers ──────────────────────────────────────────────────────────────

ENV_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env")
ENV_PATH = os.path.normpath(ENV_PATH)


def _read_env() -> dict[str, str]:
    """Read .env file into a dict."""
    env_vars: dict[str, str] = {}
    if not os.path.exists(ENV_PATH):
        return env_vars
    with open(ENV_PATH, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, _, value = line.partition("=")
                env_vars[key.strip()] = value.strip()
    return env_vars


def _write_env(env_vars: dict[str, str]) -> None:
    """Write dict back to .env file preserving comments and order."""
    lines: list[str] = []
    existing_keys: set[str] = set()

    if os.path.exists(ENV_PATH):
        with open(ENV_PATH, "r", encoding="utf-8") as f:
            for line in f:
                stripped = line.strip()
                if stripped and not stripped.startswith("#") and "=" in stripped:
                    key = stripped.split("=", 1)[0].strip()
                    if key in env_vars:
                        lines.append(f"{key}={env_vars[key]}\n")
                        existing_keys.add(key)
                    else:
                        lines.append(line)
                else:
                    lines.append(line)

    # Append any new keys not already in file
    for key, value in env_vars.items():
        if key not in existing_keys:
            lines.append(f"{key}={value}\n")

    with open(ENV_PATH, "w", encoding="utf-8") as f:
        f.writelines(lines)


async def _test_ssh(host: str, user: str, ssh_key: str) -> dict:
    """Test SSH connectivity to the given host."""
    expanded_key = os.path.expanduser(ssh_key)
    try:
        proc = await asyncio.create_subprocess_exec(
            "ssh",
            "-o", "StrictHostKeyChecking=no",
            "-o", "ConnectTimeout=5",
            "-o", "BatchMode=yes",
            "-i", expanded_key,
            f"{user}@{host}",
            "echo OK",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=10)
        ok = proc.returncode == 0 and "OK" in stdout.decode()
        return {
            "status": "connected" if ok else "failed",
            "message": "SSH connection successful" if ok else stderr.decode().strip()[:200],
            "host": host,
        }
    except asyncio.TimeoutError:
        return {"status": "timeout", "message": "SSH connection timed out (10s)", "host": host}
    except Exception as e:
        return {"status": "error", "message": str(e)[:200], "host": host}


async def _test_ryu(ryu_url: str) -> dict:
    """Test Ryu/SDN REST API connectivity."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            # Try common Ryu REST endpoints
            resp = await client.get(f"{ryu_url}/stats/switches")
            return {
                "status": "connected" if resp.status_code == 200 else "error",
                "message": f"Ryu API responded (HTTP {resp.status_code})" if resp.status_code == 200 else f"HTTP {resp.status_code}",
                "url": ryu_url,
            }
    except httpx.ConnectError:
        return {"status": "unreachable", "message": f"Cannot connect to {ryu_url}", "url": ryu_url}
    except httpx.TimeoutException:
        return {"status": "timeout", "message": "Ryu API timed out (5s)", "url": ryu_url}
    except Exception as e:
        return {"status": "error", "message": str(e)[:200], "url": ryu_url}


async def _test_frr(host: str, user: str, ssh_key: str) -> dict:
    """Test FRRouting availability via SSH."""
    expanded_key = os.path.expanduser(ssh_key)
    try:
        proc = await asyncio.create_subprocess_exec(
            "ssh",
            "-o", "StrictHostKeyChecking=no",
            "-o", "ConnectTimeout=5",
            "-o", "BatchMode=yes",
            "-i", expanded_key,
            f"{user}@{host}",
            "vtysh -c 'show version' 2>/dev/null | head -1",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=10)
        output = stdout.decode().strip()
        if proc.returncode == 0 and output:
            return {"status": "available", "message": output[:200]}
        return {"status": "unavailable", "message": stderr.decode().strip()[:200] or "vtysh not found or not responding"}
    except asyncio.TimeoutError:
        return {"status": "timeout", "message": "FRR check timed out"}
    except Exception as e:
        return {"status": "error", "message": str(e)[:200]}


async def _test_ovs(host: str, user: str, ssh_key: str) -> dict:
    """Test Open vSwitch availability via SSH."""
    expanded_key = os.path.expanduser(ssh_key)
    try:
        proc = await asyncio.create_subprocess_exec(
            "ssh",
            "-o", "StrictHostKeyChecking=no",
            "-o", "ConnectTimeout=5",
            "-o", "BatchMode=yes",
            "-i", expanded_key,
            f"{user}@{host}",
            "ovs-vsctl --version 2>/dev/null | head -1",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=10)
        output = stdout.decode().strip()
        if proc.returncode == 0 and output:
            return {"status": "available", "message": output[:200]}
        return {"status": "unavailable", "message": stderr.decode().strip()[:200] or "ovs-vsctl not found"}
    except asyncio.TimeoutError:
        return {"status": "timeout", "message": "OVS check timed out"}
    except Exception as e:
        return {"status": "error", "message": str(e)[:200]}


# ── Endpoints ────────────────────────────────────────────────────────────

@router.get("", response_model=ConnectionSettings)
async def get_connection_settings(_user: dict = Depends(get_current_user)):
    """Get current connection settings."""
    return ConnectionSettings(
        vm_host=settings.vm_host,
        vm_user=settings.vm_user,
        vm_ssh_key=settings.vm_ssh_key,
        ryu_url=settings.ryu_url,
        frr_enabled=settings.frr_enabled,
        ryu_enabled=settings.ryu_enabled,
        ovs_enabled=settings.ovs_enabled,
    )


@router.put("")
async def update_connection_settings(
    req: ConnectionUpdateRequest,
    _user: dict = Depends(require_role("admin")),
):
    """Update connection settings (admin only).

    Updates both in-memory settings AND the .env file,
    then resets the SSH ControlMaster so new connections
    use the updated host/credentials.
    """
    changes: dict[str, str] = {}
    env_updates: dict[str, str] = {}

    if req.vm_host is not None and req.vm_host != settings.vm_host:
        settings.vm_host = req.vm_host
        env_updates["VM_HOST"] = req.vm_host
        changes["vm_host"] = req.vm_host

    if req.vm_user is not None and req.vm_user != settings.vm_user:
        settings.vm_user = req.vm_user
        env_updates["VM_USER"] = req.vm_user
        changes["vm_user"] = req.vm_user

    if req.vm_ssh_key is not None and req.vm_ssh_key != settings.vm_ssh_key:
        settings.vm_ssh_key = req.vm_ssh_key
        env_updates["VM_SSH_KEY"] = req.vm_ssh_key
        changes["vm_ssh_key"] = req.vm_ssh_key

    if req.ryu_url is not None and req.ryu_url != settings.ryu_url:
        settings.ryu_url = req.ryu_url
        env_updates["RYU_URL"] = req.ryu_url
        changes["ryu_url"] = req.ryu_url

    if req.frr_enabled is not None and req.frr_enabled != settings.frr_enabled:
        settings.frr_enabled = req.frr_enabled
        env_updates["FRR_ENABLED"] = str(req.frr_enabled).lower()
        changes["frr_enabled"] = str(req.frr_enabled)

    if req.ryu_enabled is not None and req.ryu_enabled != settings.ryu_enabled:
        settings.ryu_enabled = req.ryu_enabled
        env_updates["RYU_ENABLED"] = str(req.ryu_enabled).lower()
        changes["ryu_enabled"] = str(req.ryu_enabled)

    if req.ovs_enabled is not None and req.ovs_enabled != settings.ovs_enabled:
        settings.ovs_enabled = req.ovs_enabled
        env_updates["OVS_ENABLED"] = str(req.ovs_enabled).lower()
        changes["ovs_enabled"] = str(req.ovs_enabled)

    if not changes:
        return {"success": True, "message": "No changes", "changes": {}}

    # Persist to .env file
    if env_updates:
        try:
            current_env = _read_env()
            current_env.update(env_updates)
            _write_env(current_env)
        except Exception as e:
            logger.error("Failed to write .env: %s", e)
            raise HTTPException(status_code=500, detail=f"Failed to persist settings: {e}") from e

    # Reset SSH ControlMaster if host/user/key changed
    if any(k in changes for k in ("vm_host", "vm_user", "vm_ssh_key")):
        try:
            await cleanup_control_master()
        except Exception:
            pass  # Non-fatal — next SSH call will establish a new connection

    # Also update Ryu URL in NodeConfig defaults
    if "ryu_url" in changes:
        for node in settings.node_list:
            if node.ryu_url:
                node.ryu_url = req.ryu_url

    audit.record(
        user=_user["username"],
        role=_user.get("role", "unknown"),
        action="update_connection",
        resource="connection",
        detail=str(changes),
    )

    return {"success": True, "message": "Connection settings updated", "changes": changes}


@router.post("/test", response_model=TestResult)
async def test_connection(_user: dict = Depends(get_current_user)):
    """Test all connections (SSH, Ryu, FRR, OVS) with current settings."""
    ssh_result, ryu_result, frr_result, ovs_result = await asyncio.gather(
        _test_ssh(settings.vm_host, settings.vm_user, settings.vm_ssh_key),
        _test_ryu(settings.ryu_url) if settings.ryu_enabled else _make_disabled_result("Ryu"),
        _test_frr(settings.vm_host, settings.vm_user, settings.vm_ssh_key) if settings.frr_enabled else _make_disabled_result("FRR"),
        _test_ovs(settings.vm_host, settings.vm_user, settings.vm_ssh_key) if settings.ovs_enabled else _make_disabled_result("OVS"),
    )

    return TestResult(
        ssh=ssh_result,
        ryu=ryu_result,
        frr=frr_result,
        ovs=ovs_result,
    )


@router.post("/test/custom")
async def test_custom_connection(
    req: ConnectionUpdateRequest,
    _user: dict = Depends(get_current_user),
):
    """Test connection with custom (unsaved) settings before applying them."""
    host = req.vm_host or settings.vm_host
    user = req.vm_user or settings.vm_user
    key = req.vm_ssh_key or settings.vm_ssh_key
    ryu = req.ryu_url or settings.ryu_url
    frr_on = req.frr_enabled if req.frr_enabled is not None else settings.frr_enabled
    ryu_on = req.ryu_enabled if req.ryu_enabled is not None else settings.ryu_enabled
    ovs_on = req.ovs_enabled if req.ovs_enabled is not None else settings.ovs_enabled

    ssh_result, ryu_result, frr_result, ovs_result = await asyncio.gather(
        _test_ssh(host, user, key),
        _test_ryu(ryu) if ryu_on else _make_disabled_result("Ryu"),
        _test_frr(host, user, key) if frr_on else _make_disabled_result("FRR"),
        _test_ovs(host, user, key) if ovs_on else _make_disabled_result("OVS"),
    )

    return {
        "ssh": ssh_result,
        "ryu": ryu_result,
        "frr": frr_result,
        "ovs": ovs_result,
    }


@router.post("/detect")
async def detect_vm_ip(_user: dict = Depends(get_current_user)):
    """Attempt to auto-detect the VM IP address.

    Tries several methods:
    1. Check if current configured host is reachable
    2. Scan common local VM subnet ranges (192.168.64.x, 192.168.122.x)
    """
    candidates: list[dict] = []

    # Method 1: Check current setting
    current = settings.vm_host
    result = await _test_ssh(current, settings.vm_user, settings.vm_ssh_key)
    if result["status"] == "connected":
        return DetectResult(
            detected_ip=current,
            method="current_config",
            candidates=[{"ip": current, "status": "connected", "method": "current_config"}],
        )

    # Method 2: Try arp table for known MAC prefixes (common VM hypervisors)
    try:
        proc = await asyncio.create_subprocess_exec(
            "arp", "-a",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=5)
        arp_output = stdout.decode()

        # Extract IPs from arp table
        ip_pattern = re.compile(r'\((\d+\.\d+\.\d+\.\d+)\)')
        for match in ip_pattern.finditer(arp_output):
            ip = match.group(1)
            if ip.startswith("192.168.") or ip.startswith("10."):
                candidates.append({"ip": ip, "status": "found_in_arp", "method": "arp_scan"})
    except Exception:
        pass

    # Method 3: Quick ping sweep of common VM subnets
    subnets = ["192.168.64", "192.168.122"]
    scan_tasks = []
    for subnet in subnets:
        for i in range(2, 10):  # Only scan .2 to .9 (common VM range)
            ip = f"{subnet}.{i}"
            if not any(c["ip"] == ip for c in candidates):
                scan_tasks.append(_quick_ping(ip))

    if scan_tasks:
        ping_results = await asyncio.gather(*scan_tasks)
        for ip, reachable in ping_results:
            if reachable:
                candidates.append({"ip": ip, "status": "reachable", "method": "ping_scan"})

    # Try SSH on reachable candidates
    for c in candidates:
        if c["status"] in ("found_in_arp", "reachable"):
            ssh_test = await _test_ssh(c["ip"], settings.vm_user, settings.vm_ssh_key)
            c["ssh_status"] = ssh_test["status"]
            if ssh_test["status"] == "connected":
                return DetectResult(
                    detected_ip=c["ip"],
                    method=c["method"],
                    candidates=candidates,
                )

    return DetectResult(
        detected_ip=None,
        method=None,
        candidates=candidates,
    )


async def _quick_ping(ip: str) -> tuple[str, bool]:
    """Quick ping check — returns (ip, reachable)."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "ping", "-c", "1", "-W", "1", ip,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await asyncio.wait_for(proc.communicate(), timeout=3)
        return (ip, proc.returncode == 0)
    except Exception:
        return (ip, False)


async def _make_disabled_result(name: str) -> dict:
    """Return a 'disabled' status for services that are turned off."""
    return {"status": "disabled", "message": f"{name} is disabled in settings"}


# ── Service Management ───────────────────────────────────────────────────

# systemd unit names for each service
_SERVICE_UNITS: dict[str, list[str]] = {
    "frr": ["frr"],
    "ryu": ["ryu-controller"],
    "ovs": ["ovsdb-server", "ovs-vswitchd"],
}

# Fallback start commands if systemd units don't exist
_SERVICE_FALLBACK_START: dict[str, str] = {
    "ryu": (
        "if [ -f /opt/ryu-env/bin/osken-manager ]; then "
        "cd /opt/ryu-env && nohup bin/osken-manager "
        "--wsapi-port 8080 --ofp-tcp-listen-port 6653 "
        "/opt/ryu-env/netorch_ryu_app.py > /var/log/ryu-controller.log 2>&1 & "
        "echo 'started'; "
        "else echo 'osken-manager not found'; fi"
    ),
    "ovs": (
        "ovsdb-server --remote=punix:/usr/local/var/run/openvswitch/db.sock "
        "--remote=db:Open_vSwitch,Open_vSwitch,manager_options "
        "--pidfile --detach 2>/dev/null; "
        "ovs-vswitchd --pidfile --detach 2>/dev/null && echo 'started' || echo 'failed'"
    ),
}


class ServiceActionRequest(BaseModel):
    service: str  # "frr", "ryu", "ovs"
    action: str   # "start", "stop", "restart", "status"


class ServiceStatusResult(BaseModel):
    service: str
    status: str        # "running", "stopped", "error", "not-installed"
    message: str
    unit: str | None = None


async def _ssh_service_cmd(service: str, action: str) -> dict:
    """Execute a systemd service action via SSH.

    Falls back to manual start if systemd unit doesn't exist.
    """
    units = _SERVICE_UNITS.get(service, [])
    if not units:
        return {"status": "error", "message": f"Unknown service: {service}"}

    if action == "status":
        return await _get_service_status(service)

    if action not in ("start", "stop", "restart"):
        return {"status": "error", "message": f"Invalid action: {action}"}

    # OVS: clean up stale lock files & processes before start/restart to avoid
    # "failed to lock lockfile (Resource temporarily unavailable)" errors.
    if service == "ovs" and action in ("start", "restart"):
        await ssh_exec(
            "pkill -9 ovsdb-server 2>/dev/null; "
            "rm -f /etc/openvswitch/.conf.db.~lock~ 2>/dev/null; "
            "systemctl reset-failed ovsdb-server.service 2>/dev/null; "
            "systemctl reset-failed ovs-vswitchd.service 2>/dev/null"
        )
        await asyncio.sleep(0.5)

    # Try systemd first
    results = []
    all_ok = True
    for unit in units:
        result = await ssh_exec(f"systemctl {action} {unit} 2>&1")
        if result.returncode == 0:
            results.append(f"{unit}: {action} OK")
        else:
            # Systemd unit might not exist — try fallback for start/restart
            if action in ("start", "restart") and service in _SERVICE_FALLBACK_START:
                fallback_result = await ssh_exec(_SERVICE_FALLBACK_START[service], timeout=15)
                if "started" in fallback_result.stdout.lower():
                    results.append(f"{service}: started via fallback")
                else:
                    all_ok = False
                    results.append(
                        f"{unit}: {result.stderr or result.stdout or 'failed'}".strip()[:200]
                    )
            else:
                all_ok = False
                results.append(
                    f"{unit}: {result.stderr or result.stdout or 'failed'}".strip()[:200]
                )

    # Wait a moment for service to be ready after start/restart
    if action in ("start", "restart") and all_ok:
        await asyncio.sleep(1.5)

    return {
        "status": "ok" if all_ok else "error",
        "message": "; ".join(results),
    }


async def _get_service_status(service: str) -> dict:
    """Get the running status of a service."""
    if service == "frr":
        result = await ssh_exec("systemctl is-active frr 2>/dev/null || echo inactive")
        active = "active" in result.stdout and "inactive" not in result.stdout
        if active:
            # Get version info for extra detail
            ver = await ssh_exec("vtysh -c 'show version' 2>/dev/null | head -1")
            return {
                "service": "frr",
                "status": "running",
                "message": ver.stdout.strip()[:200] if ver.stdout.strip() else "FRR is running",
                "unit": "frr",
            }
        return {
            "service": "frr",
            "status": "stopped",
            "message": "FRR service is not running",
            "unit": "frr",
        }

    elif service == "ryu":
        # Check via HTTP first (most reliable)
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(f"{settings.ryu_url}/stats/switches")
                if resp.status_code == 200:
                    return {
                        "service": "ryu",
                        "status": "running",
                        "message": f"Ryu API responding at {settings.ryu_url}",
                        "unit": "ryu-controller",
                    }
        except Exception:
            pass
        # Fallback: check process
        result = await ssh_exec("pgrep -fa 'osken-manager|ryu-manager' | head -1")
        if result.returncode == 0 and result.stdout.strip():
            return {
                "service": "ryu",
                "status": "running",
                "message": f"Process found: {result.stdout.strip()[:150]}",
                "unit": "ryu-controller",
            }
        return {
            "service": "ryu",
            "status": "stopped",
            "message": "Ryu/Osken controller is not running",
            "unit": "ryu-controller",
        }

    elif service == "ovs":
        result = await ssh_exec("pgrep -c ovs-vswitchd 2>/dev/null || echo 0")
        count = result.stdout.strip()
        if count.isdigit() and int(count) > 0:
            ver = await ssh_exec("ovs-vsctl --version 2>/dev/null | head -1")
            return {
                "service": "ovs",
                "status": "running",
                "message": ver.stdout.strip()[:200] if ver.stdout.strip() else "OVS is running",
                "unit": "ovs-vswitchd",
            }
        return {
            "service": "ovs",
            "status": "stopped",
            "message": "OVS is not running",
            "unit": "ovs-vswitchd",
        }

    return {"service": service, "status": "error", "message": f"Unknown service: {service}"}


# ── Service Control Endpoints ────────────────────────────────────────────

@router.post("/services/action")
async def service_action(
    req: ServiceActionRequest,
    _user: dict = Depends(require_role("admin", "operator")),
):
    """Start, stop, restart, or check status of a VM service.

    Supports: frr, ryu, ovs.
    Actions: start, stop, restart, status.
    Requires admin or operator role.
    """
    if req.service not in _SERVICE_UNITS:
        raise HTTPException(status_code=400, detail=f"Unknown service: {req.service}. Valid: frr, ryu, ovs")
    if req.action not in ("start", "stop", "restart", "status"):
        raise HTTPException(status_code=400, detail=f"Invalid action: {req.action}. Valid: start, stop, restart, status")

    result = await _ssh_service_cmd(req.service, req.action)

    if req.action != "status":
        audit.record(
            user=_user["username"],
            role=_user.get("role", "unknown"),
            action=f"service_{req.action}",
            resource=req.service,
            detail=result.get("message", "")[:300],
        )

    return {
        "success": result["status"] == "ok" or result.get("status") == "running",
        "service": req.service,
        "action": req.action,
        **result,
    }


@router.get("/services/status")
async def all_services_status(_user: dict = Depends(get_current_user)):
    """Get running status of all managed services (frr, ryu, ovs)."""
    frr_result, ryu_result, ovs_result = await asyncio.gather(
        _get_service_status("frr"),
        _get_service_status("ryu"),
        _get_service_status("ovs"),
    )
    return {
        "services": {
            "frr": frr_result,
            "ryu": ryu_result,
            "ovs": ovs_result,
        }
    }
