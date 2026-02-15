"""Core configuration module."""

from __future__ import annotations

from typing import Literal

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # API
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    debug: bool = False
    project_name: str = "NetOrch - Hybrid SDN Orchestration Platform"
    api_v1_prefix: str = "/api/v1"

    # Security
    secret_key: str = "dev-secret-key-change-in-production"
    access_token_expire_minutes: int = 60
    admin_username: str = "admin"
    admin_password: str = "admin123"

    # System Mode
    system_mode: Literal["dc", "wan"] = "dc"

    # FRRouting
    frr_enabled: bool = False
    frr_vtysh_path: str = "/usr/bin/vtysh"

    # Ryu SDN Controller
    ryu_enabled: bool = False
    ryu_url: str = "http://localhost:8080"

    # Open vSwitch
    ovs_enabled: bool = False
    ovs_vsctl_path: str = "/usr/bin/ovs-vsctl"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
