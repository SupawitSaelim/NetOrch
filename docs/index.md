# Hybrid SDN Orchestration Platform - Documentation

## Overview

This documentation covers the design, architecture, and implementation details of the Web-Based Hybrid SDN and Routing Orchestration Platform.

## Documentation Index

### Architecture
- [Architecture Overview](./architecture/overview.md) - High-level system architecture
- [Component Design](./architecture/components.md) - Detailed component specifications
- [Data Flow](./architecture/data-flow.md) - How data flows through the system

### API Reference
- [API Specification](./api/specification.md) - RESTful API endpoints and contracts
- [API Examples](./api/examples.md) - Usage examples and sample requests

### Guides
- [Development Setup](./guides/development-setup.md) - Setting up the development environment
- [Deployment Guide](./guides/deployment.md) - Single-node and multi-node deployment
- [Configuration Guide](./guides/configuration.md) - System configuration options

### Components
- [Backend (FastAPI)](./components/backend.md) - Backend API service
- [Frontend (React)](./components/frontend.md) - Web GUI application
- [FRRouting](./components/frrouting.md) - Routing engine integration
- [Ryu Controller](./components/ryu-controller.md) - SDN controller
- [Open vSwitch](./components/ovs.md) - Virtual switching layer

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React (TypeScript) |
| Backend API | FastAPI (Python) |
| Routing Engine | FRRouting |
| SDN Controller | Ryu |
| Data Plane | Open vSwitch (OVS) |
| OS | Linux (Ubuntu/Debian) |

## Project Phases

- **Phase 1**: Single-Node Deployment (Current)
- **Phase 2**: Multi-Node Deployment
- **Phase 3**: Advanced Features
