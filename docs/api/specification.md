# API Specification

## 1. Overview

This document defines all API endpoints for the NetOrch platform.

**Base URL:** `http://localhost:8000/api/v1`

**Content-Type:** `application/json`

**Authentication:** Bearer token (JWT) — required for write operations (POST/PUT/DELETE on protected endpoints). Read operations are public.

**Total Endpoints:** 45 REST + 2 WebSocket

---

## 2. Authentication

### 2.1 Login

```http
POST /auth/login
```

**Request Body:**
```json
{
  "username": "admin",
  "password": "admin123"
}
```

**Response (200):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer",
  "expires_in": 3600
}
```

### 2.2 Using Authentication

Include token in `Authorization` header:
```
Authorization: Bearer <access_token>
```

---

## 3. Health & System

### 3.1 Health Check

```http
GET /health
```

**Response (200):**
```json
{
  "status": "healthy",
  "components": {
    "api": "up",
    "frr": "up",
    "ryu": "up",
    "ovs": "up"
  },
  "timestamp": "2026-02-15T10:00:00Z"
}
```

### 3.2 System Info

```http
GET /system/info
```

**Response (200):**
```json
{
  "version": "1.0.0",
  "mode": "dc",
  "uptime": 86400,
  "hostname": "sdn-controller"
}
```

### 3.3 Get System Mode

```http
GET /system/mode
```

### 3.4 Set System Mode (Auth Required)

```http
PUT /system/mode
```

**Request Body:**
```json
{
  "mode": "dc"
}
```

---

## 4. Routing Endpoints (10)

### 4.1 Get Routing Table

```http
GET /routing/routes
GET /routing/routes?protocol=bgp
GET /routing/routes?destination=10.0.0.0/24
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| protocol | string | Filter by protocol (bgp, ospf, static, connected) |
| destination | string | Filter by destination prefix |

**Response (200):**
```json
{
  "routes": [
    {
      "destination": "10.0.0.0/24",
      "next_hop": "192.168.1.1",
      "protocol": "bgp",
      "metric": 100,
      "interface": "eth0",
      "uptime": "01:30:45",
      "selected": true,
      "fib": true
    }
  ],
  "total": 1
}
```

### 4.2 Add Static Route (Auth Required)

```http
POST /routing/routes/static
```

**Request Body:**
```json
{
  "destination": "10.0.0.0/24",
  "next_hop": "192.168.1.1",
  "metric": 100
}
```

### 4.3 Delete Static Route (Auth Required)

```http
DELETE /routing/routes/static/{destination}
```

### 4.4 Get BGP Summary

```http
GET /routing/bgp/summary
```

**Response (200):**
```json
{
  "local_as": 65001,
  "router_id": "10.0.0.1",
  "total_neighbors": 2,
  "established": 2,
  "neighbors": [
    {
      "neighbor": "10.0.0.2",
      "remote_as": 65002,
      "state": "Established",
      "uptime": "1d02h30m",
      "prefixes_received": 10,
      "prefixes_sent": 5
    }
  ]
}
```

### 4.5 Get BGP Neighbors

```http
GET /routing/bgp/neighbors
GET /routing/bgp/neighbors/{neighbor_ip}
```

### 4.6 Add BGP Neighbor (Auth Required)

```http
POST /routing/bgp/neighbors
```

**Request Body:**
```json
{
  "neighbor": "10.0.0.3",
  "remote_as": 65003,
  "description": "Peer to Site C",
  "update_source": "lo0",
  "ebgp_multihop": 2,
  "password": "secret123",
  "address_families": ["ipv4_unicast"]
}
```

### 4.7 Delete BGP Neighbor (Auth Required)

```http
DELETE /routing/bgp/neighbors/{neighbor_ip}
```

### 4.8 Get OSPF Summary

```http
GET /routing/ospf/summary
```

### 4.9 Get OSPF Neighbors

```http
GET /routing/ospf/neighbors
```

---

## 5. SDN / Flow Endpoints (11)

### 5.1 Get All Flows

```http
GET /sdn/flows
GET /sdn/flows?dpid={switch_dpid}
```

**Response (200):**
```json
{
  "flows": [
    {
      "id": "flow-001",
      "dpid": "0000000000000001",
      "table_id": 0,
      "priority": 100,
      "match": {
        "in_port": 1,
        "eth_type": 2048,
        "ipv4_dst": "10.0.0.0/24"
      },
      "actions": [
        {"type": "OUTPUT", "port": 2}
      ],
      "packet_count": 1000,
      "byte_count": 102400,
      "idle_timeout": 0,
      "hard_timeout": 0
    }
  ],
  "total": 1
}
```

### 5.2 Get Flow by ID

```http
GET /sdn/flows/{flow_id}
```

### 5.3 Add Flow (Auth Required)

```http
POST /sdn/flows
```

**Request Body:**
```json
{
  "dpid": "0000000000000001",
  "table_id": 0,
  "priority": 100,
  "match": {
    "in_port": 1,
    "eth_type": 2048,
    "ipv4_src": "10.0.1.0/24",
    "ipv4_dst": "10.0.2.0/24"
  },
  "actions": [
    {"type": "SET_FIELD", "field": "ipv4_dst", "value": "10.0.3.1"},
    {"type": "OUTPUT", "port": 3}
  ],
  "idle_timeout": 300,
  "hard_timeout": 0
}
```

### 5.4 Delete Flow (Auth Required)

```http
DELETE /sdn/flows/{flow_id}
```

### 5.5 Get Flow Statistics

```http
GET /sdn/flows/{flow_id}/stats
```

### 5.6 Get All Switches

```http
GET /switches
```

**Response (200):**
```json
{
  "switches": [
    {
      "dpid": "0000000000000001",
      "name": "br0",
      "connected": true,
      "controller": "tcp:127.0.0.1:6633",
      "ports": [
        {
          "port_no": 1,
          "name": "eth0",
          "hw_addr": "aa:bb:cc:dd:ee:01",
          "state": "up"
        }
      ]
    }
  ]
}
```

### 5.7 Get Switch Details

```http
GET /switches/{dpid}
```

### 5.8 Create Bridge (Auth Required)

```http
POST /switches
```

**Request Body:**
```json
{
  "name": "br1",
  "protocols": ["OpenFlow13", "OpenFlow14"],
  "controller": "tcp:127.0.0.1:6633"
}
```

### 5.9 Delete Bridge (Auth Required)

```http
DELETE /switches/{name}
```

### 5.10 Add Port (Auth Required)

```http
POST /switches/{bridge_name}/ports
```

**Request Body:**
```json
{
  "port_name": "eth2",
  "type": "internal",
  "vlan_mode": "access",
  "tag": 100
}
```

### 5.11 Create VXLAN Port (Auth Required)

```http
POST /switches/{bridge_name}/ports/vxlan
```

**Request Body:**
```json
{
  "port_name": "vxlan0",
  "remote_ip": "192.168.1.2",
  "vni": 100,
  "dst_port": 4789
}
```

---

## 6. Topology Endpoints (3)

### 6.1 Get Topology

```http
GET /topology
```

**Response (200):**
```json
{
  "nodes": [
    {
      "id": "switch-br0",
      "type": "switch",
      "name": "br0",
      "metadata": { "x": 100, "y": 200 }
    },
    {
      "id": "host-host1",
      "type": "host",
      "name": "host1",
      "metadata": {}
    },
    {
      "id": "router-router1",
      "type": "router",
      "name": "router1",
      "metadata": {}
    }
  ],
  "links": [
    {
      "id": "link-001",
      "source": "switch-br0",
      "target": "host-host1",
      "source_port": "ve-host1-br",
      "target_port": "ve-host1",
      "status": "up"
    }
  ],
  "timestamp": "2026-02-15T10:00:00Z"
}
```

### 6.2 Refresh Topology (Auth Required)

```http
POST /topology/refresh
```

### 6.3 Update Node Position (Auth Required)

```http
PATCH /topology/nodes/{node_id}
```

**Request Body:**
```json
{
  "metadata": { "x": 150, "y": 250 }
}
```

---

## 7. Topology Builder Endpoints (11)

These endpoints create/delete actual network resources on the RHEL VM.

### 7.1 Create Switch

```http
POST /topology/builder/switches
```

**Request Body:**
```json
{
  "name": "switch1"
}
```

### 7.2 Delete Switch

```http
DELETE /topology/builder/switches/{name}
```

### 7.3 Create Host

```http
POST /topology/builder/hosts
```

**Request Body:**
```json
{
  "name": "host1",
  "switch": "switch1",
  "ip": "10.0.0.1/24"
}
```

### 7.4 Delete Host

```http
DELETE /topology/builder/hosts/{name}
```

### 7.5 Create Router

```http
POST /topology/builder/routers
```

**Request Body:**
```json
{
  "name": "router1"
}
```

Creates a network namespace with FRR daemons (zebra, bgpd, ospfd).

### 7.6 Delete Router

```http
DELETE /topology/builder/routers/{name}
```

### 7.7 Create Link

```http
POST /topology/builder/links
```

**Request Body:**
```json
{
  "source_name": "host1",
  "target_name": "switch1"
}
```

### 7.8 Delete Link

```http
DELETE /topology/builder/links?source_name=host1&target_name=switch1
```

### 7.9 Batch Update Positions

```http
PUT /topology/builder/positions
```

**Request Body:**
```json
{
  "positions": {
    "switch-switch1": { "x": 100, "y": 200 },
    "host-host1": { "x": 300, "y": 400 }
  }
}
```

### 7.10 List Hosts (Network Namespaces)

```http
GET /topology/builder/hosts
```

### 7.11 Clear All Topology

```http
DELETE /topology/builder/all
```

Removes all OVS bridges, network namespaces, and veth pairs on the VM.

---

## 8. Monitoring Endpoints (3)

### 8.1 Get System Stats

```http
GET /monitoring/stats
```

**Response (200):**
```json
{
  "cpu_usage": 25.5,
  "memory_usage": 45.2,
  "uptime": 86400,
  "api_requests_total": 10000,
  "components": {
    "frr": { "bgp_neighbors": 2, "ospf_neighbors": 1, "total_routes": 50 },
    "ovs": { "bridges": 2, "flows": 150 },
    "ryu": { "switches": 2, "controllers": 1 }
  }
}
```

### 8.2 Get Port Statistics

```http
GET /monitoring/ports/{dpid}
```

### 8.3 Get Events/Logs

```http
GET /monitoring/events
GET /monitoring/events?level=error&limit=100
```

**Response (200):**
```json
{
  "events": [
    {
      "id": "evt-001",
      "timestamp": "2026-02-15T10:00:00Z",
      "level": "info",
      "component": "bgp",
      "message": "BGP neighbor 10.0.0.2 state changed to Established"
    }
  ],
  "total": 1
}
```

---

## 9. VRF Endpoints (5)

### 9.1 List VRFs

```http
GET /vrf
```

### 9.2 Create VRF (Auth Required)

```http
POST /vrf
```

**Request Body:**
```json
{
  "name": "customer-a",
  "rd": "65001:100",
  "rt_import": "65001:100",
  "rt_export": "65001:100"
}
```

### 9.3 Delete VRF (Auth Required)

```http
DELETE /vrf/{name}
```

### 9.4 Configure BGP in VRF (Auth Required)

```http
POST /vrf/{name}/bgp
```

### 9.5 Get VRF Routes

```http
GET /vrf/{name}/routes
```

---

## 10. Network Tools Endpoints (4)

### 10.1 Ping

```http
POST /tools/ping
```

**Request Body:**
```json
{
  "source": "host1",
  "target": "10.0.0.2",
  "count": 4
}
```

### 10.2 Traceroute

```http
POST /tools/traceroute
```

**Request Body:**
```json
{
  "source": "host1",
  "target": "10.0.0.2"
}
```

### 10.3 ARP Table

```http
POST /tools/arp
```

**Request Body:**
```json
{
  "source": "host1"
}
```

### 10.4 List Hosts

```http
GET /tools/hosts
```

Returns all network namespaces available for tool execution.

---

## 11. WebSocket Endpoints (2)

### 11.1 Real-Time Broadcast

```
ws://host/api/v1/ws
```

Server pushes JSON messages every 5 seconds:
```json
{
  "type": "stats",
  "data": { "cpu_usage": 25.5, "memory_usage": 45.2, "..." : "..." }
}
```

Message types: `stats`, `topology`, `events`

### 11.2 Interactive Terminal

```
ws://host/api/v1/ws/terminal?shell=bash
ws://host/api/v1/ws/terminal?shell=vtysh&netns=router1
```

**Query Parameters:**
| Parameter | Default | Description |
|-----------|---------|-------------|
| shell | `bash` | Shell type: `bash` or `vtysh` |
| netns | — | Network namespace to execute in |

Bidirectional: client sends keystrokes, server sends terminal output.

---

## 12. Endpoint Summary Table

| Category | Method | Path | Auth | Count |
|----------|--------|------|------|-------|
| **Health** | GET | `/health` | — | |
| | GET | `/system/info` | — | **2** |
| **Auth** | POST | `/auth/login` | — | **1** |
| **System** | GET | `/system/mode` | — | |
| | PUT | `/system/mode` | ✅ | **2** |
| **Routing** | GET | `/routing/routes` | — | |
| | POST | `/routing/routes/static` | ✅ | |
| | DELETE | `/routing/routes/static/{dest}` | ✅ | |
| | GET | `/routing/bgp/summary` | — | |
| | GET | `/routing/bgp/neighbors` | — | |
| | GET | `/routing/bgp/neighbors/{ip}` | — | |
| | POST | `/routing/bgp/neighbors` | ✅ | |
| | DELETE | `/routing/bgp/neighbors/{ip}` | ✅ | |
| | GET | `/routing/ospf/summary` | — | |
| | GET | `/routing/ospf/neighbors` | — | **10** |
| **SDN** | GET | `/sdn/flows` | — | |
| | GET | `/sdn/flows/{id}` | — | |
| | POST | `/sdn/flows` | ✅ | |
| | DELETE | `/sdn/flows/{id}` | ✅ | |
| | GET | `/sdn/flows/{id}/stats` | — | |
| | GET | `/switches` | — | |
| | GET | `/switches/{dpid}` | — | |
| | POST | `/switches` | ✅ | |
| | DELETE | `/switches/{name}` | ✅ | |
| | POST | `/switches/{name}/ports` | ✅ | |
| | POST | `/switches/{name}/ports/vxlan` | ✅ | **11** |
| **Topology** | GET | `/topology` | — | |
| | POST | `/topology/refresh` | ✅ | |
| | PATCH | `/topology/nodes/{id}` | ✅ | **3** |
| **Builder** | POST | `/topology/builder/switches` | — | |
| | DELETE | `/topology/builder/switches/{name}` | — | |
| | POST | `/topology/builder/hosts` | — | |
| | DELETE | `/topology/builder/hosts/{name}` | — | |
| | POST | `/topology/builder/routers` | — | |
| | DELETE | `/topology/builder/routers/{name}` | — | |
| | POST | `/topology/builder/links` | — | |
| | DELETE | `/topology/builder/links` | — | |
| | PUT | `/topology/builder/positions` | — | |
| | GET | `/topology/builder/hosts` | — | |
| | DELETE | `/topology/builder/all` | — | **11** |
| **Monitoring** | GET | `/monitoring/stats` | — | |
| | GET | `/monitoring/ports/{dpid}` | — | |
| | GET | `/monitoring/events` | — | **3** |
| **VRF** | GET | `/vrf` | — | |
| | POST | `/vrf` | ✅ | |
| | DELETE | `/vrf/{name}` | ✅ | |
| | POST | `/vrf/{name}/bgp` | ✅ | |
| | GET | `/vrf/{name}/routes` | — | **5** |
| **Tools** | POST | `/tools/ping` | — | |
| | POST | `/tools/traceroute` | — | |
| | POST | `/tools/arp` | — | |
| | GET | `/tools/hosts` | — | **4** |
| **WebSocket** | WS | `/ws` | — | |
| | WS | `/ws/terminal` | — | **2** |
| | | | **Total** | **45 REST + 2 WS** |

---

## 13. Error Responses

### Error Format

```json
{
  "detail": "Error message here"
}
```

### HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request / Validation Error |
| 401 | Unauthorized (missing/invalid token) |
| 403 | Forbidden |
| 404 | Not Found |
| 500 | Internal Server Error |
| 503 | Service Unavailable (FRR/OVS not reachable) |

---

## 14. Interactive API Docs

FastAPI auto-generates interactive documentation:

- **Swagger UI:** `http://localhost:8000/docs`
- **ReDoc:** `http://localhost:8000/redoc`
