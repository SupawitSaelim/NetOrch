"""Core configuration module."""

from __future__ import annotations

import json
from typing import Literal

from pydantic import BaseModel
from pydantic_settings import BaseSettings


class NodeConfig(BaseModel):
    """Configuration for a single managed VM node."""

    name: str = "default"
    host: str = "192.168.64.3"
    user: str = "root"
    ssh_key: str = "~/.ssh/id_ed25519"
    frr_enabled: bool = False
    ovs_enabled: bool = False
    ryu_url: str | None = None


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # API
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    debug: bool = False
    project_name: str = "NetOrch - Hybrid SDN Orchestration Platform"
    api_v1_prefix: str = "/api/v1"

    # Security — MUST override in production via .env / environment variables
    secret_key: str = "dev-secret-key-change-in-production"
    access_token_expire_minutes: int = 60
    admin_username: str = "admin"
    admin_password: str = "admin123"
    min_password_length: int = 8

    # CORS — comma-separated origins, or "*" for all
    cors_origins: str = "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,http://127.0.0.1:3000"

    # System Mode
    system_mode: Literal["dc", "wan"] = "dc"

    # VM Connection (SSH to Red Hat VM) — primary / default node
    vm_host: str = "192.168.64.3"
    vm_user: str = "root"
    vm_ssh_key: str = "~/.ssh/id_ed25519"

    # Multi-node: JSON array of NodeConfig objects
    # e.g. NODES='[{"name":"dc1","host":"10.0.1.1"},{"name":"dc2","host":"10.0.2.1"}]'
    nodes: str = ""

    # FRRouting
    frr_enabled: bool = False
    frr_vtysh_path: str = "/usr/bin/vtysh"
    frr_default_asn: int = 65001

    # Ryu SDN Controller / SDN REST API
    ryu_enabled: bool = False
    ryu_url: str = "http://192.168.64.3:8080"

    # Open vSwitch
    ovs_enabled: bool = False
    ovs_vsctl_path: str = "/usr/bin/ovs-vsctl"

    # Operational tuning
    cache_stats_ttl: float = 10.0
    cache_topology_ttl: float = 30.0
    cache_health_ttl: float = 15.0
    ws_broadcast_interval: float = 5.0
    ssh_control_persist: int = 300
    ssh_timeout: int = 15
    audit_max_entries: int = 500

    @property
    def cors_origin_list(self) -> list[str]:
        """Parse comma-separated CORS origins."""
        if self.cors_origins.strip() == "*":
            return ["*"]
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        """Detect if running with default insecure credentials."""
        return self.secret_key != "dev-secret-key-change-in-production"

    @property
    def node_list(self) -> list[NodeConfig]:
        """Parse multi-node configuration.

        Returns a list of NodeConfig objects. If NODES env var is not set,
        returns a single node from the primary vm_host/vm_user/vm_ssh_key.
        """
        if self.nodes.strip():
            try:
                raw = json.loads(self.nodes)
                return [NodeConfig(**n) for n in raw]
            except (json.JSONDecodeError, TypeError):
                pass
        # Fallback: single node from primary settings
        return [
            NodeConfig(
                name="default",
                host=self.vm_host,
                user=self.vm_user,
                ssh_key=self.vm_ssh_key,
                frr_enabled=self.frr_enabled,
                ovs_enabled=self.ovs_enabled,
                ryu_url=self.ryu_url if self.ryu_enabled else None,
            )
        ]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
