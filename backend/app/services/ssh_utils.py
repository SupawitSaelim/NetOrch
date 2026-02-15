"""SSH utility for executing commands on the Red Hat VM."""

from __future__ import annotations

import asyncio
import logging
import os
from typing import NamedTuple

from app.core.config import settings

logger = logging.getLogger(__name__)


class CmdResult(NamedTuple):
    stdout: str
    stderr: str
    returncode: int


async def ssh_exec(command: str, timeout: int = 15) -> CmdResult:
    """Execute a command on the VM via SSH.

    Returns CmdResult with stdout, stderr, and return code.
    """
    ssh_key = os.path.expanduser(settings.vm_ssh_key)
    ssh_cmd = [
        "ssh",
        "-o", "StrictHostKeyChecking=no",
        "-o", "ConnectTimeout=5",
        "-o", "ServerAliveInterval=10",
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


async def vtysh_exec(command: str) -> CmdResult:
    """Execute a vtysh command on the VM."""
    return await ssh_exec(f'vtysh -c "{command}"')


async def ovs_exec(command: str) -> CmdResult:
    """Execute an ovs-vsctl command on the VM."""
    return await ssh_exec(command)
