"""WebSocket terminal — proxy SSH/vtysh session to the browser."""

from __future__ import annotations

import asyncio
import logging
import os

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends

from app.api.deps import get_current_user
from app.core.config import settings

router = APIRouter(tags=["Terminal"])
logger = logging.getLogger(__name__)


async def _open_ssh_process(shell: str = "vtysh") -> asyncio.subprocess.Process:
    """Open a persistent interactive SSH session to the VM."""
    ssh_key = os.path.expanduser(settings.vm_ssh_key)
    cmd = [
        "ssh",
        "-tt",
        "-o", "StrictHostKeyChecking=no",
        "-o", "ConnectTimeout=5",
        "-o", "ServerAliveInterval=15",
        "-i", ssh_key,
        f"{settings.vm_user}@{settings.vm_host}",
        shell,
    ]
    return await asyncio.create_subprocess_exec(
        *cmd,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )


@router.websocket("/ws/terminal")
async def terminal_ws(ws: WebSocket):
    """Interactive terminal over WebSocket.

    The browser sends keystrokes; we forward them to an SSH session
    and stream stdout back.
    """
    await ws.accept()

    # Parse optional query params
    query = ws.query_params
    shell = query.get("shell", "vtysh")  # vtysh | bash
    if shell not in ("vtysh", "bash", "/bin/bash"):
        shell = "vtysh"

    proc: asyncio.subprocess.Process | None = None

    try:
        proc = await _open_ssh_process(shell)
        logger.info("Terminal session started (shell=%s, pid=%s)", shell, proc.pid)

        async def _read_loop():
            """Read from SSH stdout and send to browser."""
            assert proc and proc.stdout
            while True:
                data = await proc.stdout.read(4096)
                if not data:
                    break
                try:
                    await ws.send_bytes(data)
                except Exception:
                    break

        read_task = asyncio.create_task(_read_loop())

        # Read keystrokes from browser and pipe to SSH stdin
        while True:
            msg = await ws.receive()
            if msg.get("type") == "websocket.disconnect":
                break
            raw = msg.get("bytes") or (msg.get("text", "").encode())
            if proc.stdin and raw:
                proc.stdin.write(raw)
                await proc.stdin.drain()

    except WebSocketDisconnect:
        logger.info("Terminal client disconnected")
    except Exception as e:
        logger.error("Terminal error: %s", e)
    finally:
        if proc:
            try:
                proc.terminate()
                await asyncio.wait_for(proc.wait(), timeout=3)
            except Exception:
                proc.kill()
        logger.info("Terminal session closed")
