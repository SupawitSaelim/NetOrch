"""WebSocket endpoint for real-time updates."""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(tags=["WebSocket"])
logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages WebSocket connections and broadcasts."""

    def __init__(self):
        self.active_connections: list[WebSocket] = []
        self._events: list[dict] = []
        self._max_events = 200

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active_connections.append(ws)
        logger.info("WebSocket client connected (%d total)", len(self.active_connections))

    def disconnect(self, ws: WebSocket):
        self.active_connections.remove(ws)
        logger.info("WebSocket client disconnected (%d total)", len(self.active_connections))

    async def broadcast(self, message: dict):
        """Send message to all connected clients."""
        data = json.dumps(message, default=str)
        disconnected: list[WebSocket] = []
        for conn in self.active_connections:
            try:
                await conn.send_text(data)
            except Exception:
                disconnected.append(conn)
        for conn in disconnected:
            self.active_connections.remove(conn)

    def push_event(self, level: str, component: str, message: str):
        """Add a real-time event and keep only the latest N."""
        evt = {
            "id": f"evt-{uuid4().hex[:8]}",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": level,
            "component": component,
            "message": message,
        }
        self._events.insert(0, evt)
        self._events = self._events[: self._max_events]
        return evt

    @property
    def events(self) -> list[dict]:
        return list(self._events)


manager = ConnectionManager()

# Background task reference
_bg_task: asyncio.Task | None = None


async def _broadcast_loop():
    """Background coroutine: collect stats & push to clients every 5 seconds."""
    from app.api.deps import get_orchestrator

    orch = get_orchestrator()
    logger.info("WebSocket broadcast loop started")

    while True:
        try:
            await asyncio.sleep(5)
            if not manager.active_connections:
                continue

            # Gather monitoring data
            stats = await orch.get_monitoring_stats()
            topo = await orch.topology.get_topology()
            topo_dict = {
                "nodes": [n.model_dump() for n in topo["nodes"]],
                "links": [ln.model_dump() for ln in topo["links"]],
            }

            await manager.broadcast({
                "type": "stats",
                "data": stats,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
            await manager.broadcast({
                "type": "topology",
                "data": topo_dict,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
            await manager.broadcast({
                "type": "events",
                "data": manager.events[:50],
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.error("Broadcast loop error: %s", exc)
            await asyncio.sleep(5)


def start_broadcast_loop():
    """Start the background broadcast task (call once at startup)."""
    global _bg_task
    if _bg_task is None or _bg_task.done():
        _bg_task = asyncio.create_task(_broadcast_loop())
    return _bg_task


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    """Main WebSocket endpoint for real-time updates."""
    await manager.connect(ws)
    try:
        while True:
            # Listen for client messages (ping / subscribe requests)
            data = await ws.receive_text()
            try:
                msg = json.loads(data)
                msg_type = msg.get("type", "")
                if msg_type == "ping":
                    await ws.send_text(json.dumps({"type": "pong"}))
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        manager.disconnect(ws)
