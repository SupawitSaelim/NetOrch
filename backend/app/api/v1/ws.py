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
    """Background coroutine: broadcast stats, topology, and events to WS clients.

    Uses staggered intervals to reduce backend load:
    - Stats: every 5 seconds (cached 10s TTL)
    - Topology: every 15 seconds (cached 30s TTL)
    - Events: every 10 seconds (in-memory, no SSH)
    """
    from app.api.deps import get_orchestrator
    from app.core.config import settings as _settings

    orch = get_orchestrator()
    interval = _settings.ws_broadcast_interval
    logger.info("WebSocket broadcast loop started (interval=%.1fs)", interval)

    tick = 0  # Counter for staggered broadcasts

    while True:
        try:
            await asyncio.sleep(interval)
            if not manager.active_connections:
                tick = 0
                continue

            tick += 1
            now = datetime.now(timezone.utc).isoformat()

            # Stats: every tick (5s) — uses 10s TTL cache
            stats = await orch.get_monitoring_stats()
            await manager.broadcast({
                "type": "stats",
                "data": stats,
                "timestamp": now,
            })

            # Topology: every 3rd tick (15s) — uses 30s TTL cache
            if tick % 3 == 0:
                topo = await orch.get_topology_cached()
                # topology data is already dicts from TopologyService._discover()
                topo_dict = {
                    "nodes": topo.get("nodes", []),
                    "links": topo.get("links", []),
                }
                await manager.broadcast({
                    "type": "topology",
                    "data": topo_dict,
                    "timestamp": now,
                })

            # Events: every 2nd tick (10s) — in-memory, no SSH cost
            if tick % 2 == 0:
                await manager.broadcast({
                    "type": "events",
                    "data": manager.events[:50],
                    "timestamp": now,
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
    """Main WebSocket endpoint for real-time updates.

    Supports optional JWT authentication via query parameter:
    ws://host/api/v1/ws?token=<jwt_token>
    """
    # Optional auth — allow unauthenticated for read-only broadcast
    token = ws.query_params.get("token")
    if token:
        from app.core.security import verify_token
        user_info = verify_token(token)
        if user_info is None:
            await ws.close(code=4001, reason="Invalid token")
            return

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
