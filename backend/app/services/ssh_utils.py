"""SSH utility for executing commands on the Red Hat VM.

Uses SSH ControlMaster for persistent connection multiplexing,
dramatically reducing handshake overhead for repeated SSH calls.
"""

from __future__ import annotations

import asyncio
import logging
import os
import tempfile
from typing import NamedTuple

from app.core.config import settings

logger = logging.getLogger(__name__)

# ── SSH ControlMaster socket path ──
_CONTROL_DIR = os.path.join(tempfile.gettempdir(), "netorch-ssh")
os.makedirs(_CONTROL_DIR, mode=0o700, exist_ok=True)
_CONTROL_PATH = os.path.join(_CONTROL_DIR, "ctrl-%C")

# Lock to prevent concurrent ControlMaster establishment races
_master_lock = asyncio.Lock()
_master_established = False


class CmdResult(NamedTuple):
    stdout: str
    stderr: str
    returncode: int


async def _ensure_control_master() -> None:
    """Establish a persistent SSH ControlMaster connection if not already active."""
    global _master_established
    if _master_established:
        # Quick check if master socket is still alive
        ssh_key = os.path.expanduser(settings.vm_ssh_key)
        check = await asyncio.create_subprocess_exec(
            "ssh",
            "-o", "StrictHostKeyChecking=no",
            "-o", f"ControlPath={_CONTROL_PATH}",
            "-O", "check",
            f"{settings.vm_user}@{settings.vm_host}",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await check.communicate()
        if check.returncode == 0:
            return
        logger.info("SSH ControlMaster socket stale, re-establishing...")
        _master_established = False

    async with _master_lock:
        if _master_established:
            return
        ssh_key = os.path.expanduser(settings.vm_ssh_key)
        logger.info("Establishing SSH ControlMaster connection...")
        proc = await asyncio.create_subprocess_exec(
            "ssh",
            "-o", "StrictHostKeyChecking=no",
            "-o", "ConnectTimeout=10",
            "-o", "ServerAliveInterval=15",
            "-o", "ServerAliveCountMax=3",
            "-o", f"ControlMaster=yes",
            "-o", f"ControlPath={_CONTROL_PATH}",
            "-o", f"ControlPersist={settings.ssh_control_persist}",  # configurable
            "-i", ssh_key,
            "-N",  # No command, just establish connection
            "-f",  # Go to background
            f"{settings.vm_user}@{settings.vm_host}",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=15)
        if proc.returncode == 0:
            _master_established = True
            logger.info("SSH ControlMaster established successfully")
        else:
            logger.warning(
                f"SSH ControlMaster failed (rc={proc.returncode}): "
                f"{stderr.decode('utf-8', errors='replace').strip()}"
            )


async def ssh_exec(command: str, timeout: int | None = None) -> CmdResult:
    """Execute a command on the VM via SSH.

    Uses ControlMaster for connection reuse when available,
    falling back to direct SSH if ControlMaster is not established.

    Returns CmdResult with stdout, stderr, and return code.
    """
    if timeout is None:
        timeout = settings.ssh_timeout
    ssh_key = os.path.expanduser(settings.vm_ssh_key)

    # Try to use ControlMaster for faster connections
    await _ensure_control_master()

    ssh_cmd = [
        "ssh",
        "-o", "StrictHostKeyChecking=no",
        "-o", "ConnectTimeout=5",
        "-o", "ServerAliveInterval=10",
        "-o", f"ControlMaster=auto",
        "-o", f"ControlPath={_CONTROL_PATH}",
        "-i", ssh_key,
        f"{settings.vm_user}@{settings.vm_host}",
        command,
    ]
    try:
        proc = await asyncio.create_subprocess_exec(
            *ssh_cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        return CmdResult(
            stdout=stdout.decode("utf-8", errors="replace").strip(),
            stderr=stderr.decode("utf-8", errors="replace").strip(),
            returncode=proc.returncode or 0,
        )
    except asyncio.TimeoutError:
        logger.error(f"SSH command timed out ({timeout}s): {command[:80]}")
        return CmdResult(stdout="", stderr="timeout", returncode=-1)
    except Exception as e:
        logger.error(f"SSH command failed: {e}")
        return CmdResult(stdout="", stderr=str(e), returncode=-1)


async def ssh_exec_batch(commands: list[str], timeout: int = 30) -> CmdResult:
    """Execute multiple commands in a single SSH session.

    Commands are joined with ' && ' so they run sequentially.
    Useful for reducing SSH round-trips when commands are related.
    """
    combined = " && ".join(commands)
    return await ssh_exec(combined, timeout=timeout)


async def cleanup_control_master() -> None:
    """Clean up the SSH ControlMaster connection on shutdown."""
    global _master_established
    if not _master_established:
        return
    try:
        proc = await asyncio.create_subprocess_exec(
            "ssh",
            "-o", f"ControlPath={_CONTROL_PATH}",
            "-O", "exit",
            f"{settings.vm_user}@{settings.vm_host}",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await proc.communicate()
        _master_established = False
        logger.info("SSH ControlMaster connection closed")
    except Exception as e:
        logger.warning(f"Error closing SSH ControlMaster: {e}")


async def vtysh_exec(command: str) -> CmdResult:
    """Execute a vtysh command on the VM."""
    return await ssh_exec(f'vtysh -c "{command}"')


async def ovs_exec(command: str) -> CmdResult:
    """Execute an ovs-vsctl command on the VM."""
    return await ssh_exec(command)
