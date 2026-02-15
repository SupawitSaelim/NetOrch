# API Specification

## 1. Overview

This document defines the RESTful API for the Hybrid SDN Orchestration Platform.

**Base URL:** `http://localhost:8000/api/v1`

**Content-Type:** `application/json`

**Authentication:** Bearer token (JWT)

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
  "password": "password123"
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

## 3. System Endpoints

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

### 3.3 Get/Set Mode

```http
GET /system/mode
PUT /system/mode
```

**PUT Request Body:**
```json
{
  "mode": "dc"  // or "wan"
}
```

---

## 4. Routing Endpoints

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

### 4.2 Add Static Route

```http
POST /routing/routes/static
```

**Request Body:**
```json
{
  "destination": "10.0.0.0/24",
  "next_hop": "192.168.1.1",
  "metric": 100,
  "description": "Route to network A"
}
```

**Response (201):**
```json
{
  "success": true,
  "route": {
    "destination": "10.0.0.0/24",
    "next_hop": "192.168.1.1",
    "protocol": "static"
  }
}
```

### 4.3 Delete Static Route

```http
DELETE /routing/routes/static/{destination}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Route deleted"
}
```

---

## 5. BGP Endpoints

### 5.1 Get BGP Summary

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

### 5.2 Get BGP Neighbors

```http
GET /routing/bgp/neighbors
GET /routing/bgp/neighbors/{neighbor_ip}
```

**Response (200):**
```json
{
  "neighbors": [
    {
      "neighbor": "10.0.0.2",
      "remote_as": 65002,
      "description": "Peer to Site B",
      "state": "Established",
      "uptime": "1d02h30m",
      "local_address": "10.0.0.1",
      "local_port": 179,
      "remote_port": 45678,
      "hold_time": 180,
      "keepalive": 60,
      "prefixes_received": 10,
      "prefixes_sent": 5
    }
  ]
}
```

### 5.3 Add BGP Neighbor

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

**Response (201):**
```json
{
  "success": true,
  "neighbor": {
    "neighbor": "10.0.0.3",
    "remote_as": 65003,
    "state": "Idle"
  }
}
```

### 5.4 Delete BGP Neighbor

```http
DELETE /routing/bgp/neighbors/{neighbor_ip}
```

### 5.5 Get BGP Routes

```http
GET /routing/bgp/routes
GET /routing/bgp/routes?neighbor={neighbor_ip}&direction={in|out}
```

---

## 6. OSPF Endpoints

### 6.1 Get OSPF Summary

```http
GET /routing/ospf/summary
```

**Response (200):**
```json
{
  "router_id": "10.0.0.1",
  "areas": [
    {
      "area_id": "0.0.0.0",
      "type": "normal",
      "interfaces": 2,
      "neighbors": 1
    }
  ],
  "total_routes": 15
}
```

### 6.2 Get OSPF Neighbors

```http
GET /routing/ospf/neighbors
```

**Response (200):**
```json
{
  "neighbors": [
    {
      "neighbor_id": "10.0.0.2",
      "priority": 1,
      "state": "Full/DR",
      "address": "192.168.1.2",
      "interface": "eth0",
      "dead_time": "00:00:35"
    }
  ]
}
```

### 6.3 Configure OSPF Interface

```http
POST /routing/ospf/interfaces
```

**Request Body:**
```json
{
  "interface": "eth1",
  "area": "0.0.0.0",
  "cost": 10,
  "priority": 1,
  "network_type": "point-to-point"
}
```

---

## 7. SDN Flow Endpoints

### 7.1 Get All Flows

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

### 7.2 Get Flow by ID

```http
GET /sdn/flows/{flow_id}
```

### 7.3 Add Flow

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

**Response (201):**
```json
{
  "success": true,
  "flow_id": "flow-002"
}
```

### 7.4 Delete Flow

```http
DELETE /sdn/flows/{flow_id}
DELETE /sdn/flows?dpid={dpid}&match={match_criteria}
```

### 7.5 Get Flow Statistics

```http
GET /sdn/flows/{flow_id}/stats
```

**Response (200):**
```json
{
  "flow_id": "flow-001",
  "packet_count": 1500,
  "byte_count": 153600,
  "duration_sec": 3600,
  "duration_nsec": 123456789
}
```

---

## 8. Switch Management Endpoints

### 8.1 Get All Switches

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
        },
        {
          "port_no": 2,
          "name": "eth1",
          "hw_addr": "aa:bb:cc:dd:ee:02",
          "state": "up"
        }
      ]
    }
  ]
}
```

### 8.2 Get Switch Details

```http
GET /switches/{dpid}
```

### 8.3 Create Bridge

```http
POST /switches
```

**Request Body:**
```json
{
  "name": "br1",
  "protocols": ["OpenFlow13", "OpenFlow14"],
  "controller": "tcp:127.0.0.1:6633",
  "datapath_type": "system"
}
```

### 8.4 Delete Bridge

```http
DELETE /switches/{name}
```

### 8.5 Add Port to Bridge

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

### 8.6 Create VXLAN Port

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

## 9. Topology Endpoints

### 9.1 Get Topology

```http
GET /topology
```

**Response (200):**
```json
{
  "nodes": [
    {
      "id": "switch-001",
      "type": "switch",
      "name": "br0",
      "dpid": "0000000000000001",
      "metadata": {
        "x": 100,
        "y": 200
      }
    },
    {
      "id": "router-001",
      "type": "router",
      "name": "frr-router",
      "metadata": {}
    }
  ],
  "links": [
    {
      "id": "link-001",
      "source": "switch-001",
      "target": "router-001",
      "source_port": "eth0",
      "target_port": "eth1",
      "bandwidth": 1000,
      "status": "up"
    }
  ],
  "timestamp": "2026-02-15T10:00:00Z"
}
```

### 9.2 Refresh Topology

```http
POST /topology/refresh
```

### 9.3 Update Node Position

```http
PATCH /topology/nodes/{node_id}
```

**Request Body:**
```json
{
  "metadata": {
    "x": 150,
    "y": 250
  }
}
```

---

## 10. Monitoring Endpoints

### 10.1 Get System Stats

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
    "frr": {
      "bgp_neighbors": 2,
      "ospf_neighbors": 1,
      "total_routes": 50
    },
    "ovs": {
      "bridges": 2,
      "flows": 150
    },
    "ryu": {
      "switches": 2,
      "controllers": 1
    }
  }
}
```

### 10.2 Get Port Statistics

```http
GET /monitoring/ports/{dpid}
GET /monitoring/ports/{dpid}/{port_no}
```

**Response (200):**
```json
{
  "ports": [
    {
      "port_no": 1,
      "name": "eth0",
      "rx_packets": 100000,
      "tx_packets": 95000,
      "rx_bytes": 10240000,
      "tx_bytes": 9728000,
      "rx_dropped": 0,
      "tx_dropped": 0,
      "rx_errors": 0,
      "tx_errors": 0
    }
  ]
}
```

### 10.3 Get Events/Logs

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

## 11. Policy Endpoints

### 11.1 Get Policies

```http
GET /policies
```

**Response (200):**
```json
{
  "policies": [
    {
      "id": "policy-001",
      "name": "Block-External-SSH",
      "enabled": true,
      "priority": 1000,
      "match": {
        "ipv4_src": "0.0.0.0/0",
        "tcp_dst": 22
      },
      "action": "drop",
      "created_at": "2026-02-15T09:00:00Z"
    }
  ]
}
```

### 11.2 Create Policy

```http
POST /policies
```

**Request Body:**
```json
{
  "name": "Redirect-HTTP-Traffic",
  "priority": 500,
  "match": {
    "eth_type": 2048,
    "ip_proto": 6,
    "tcp_dst": 80
  },
  "action": "redirect",
  "action_params": {
    "output_port": 5
  }
}
```

### 11.3 Update Policy

```http
PUT /policies/{policy_id}
```

### 11.4 Delete Policy

```http
DELETE /policies/{policy_id}
```

### 11.5 Enable/Disable Policy

```http
POST /policies/{policy_id}/enable
POST /policies/{policy_id}/disable
```

---

## 12. Error Responses

### 12.1 Error Format

```json
{
  "error": "VALIDATION_ERROR",
  "message": "Invalid IP address format",
  "details": {
    "field": "neighbor",
    "value": "invalid-ip"
  },
  "timestamp": "2026-02-15T10:00:00Z"
}
```

### 12.2 Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid input data |
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource already exists |
| `INTERNAL_ERROR` | 500 | Internal server error |
| `SERVICE_UNAVAILABLE` | 503 | FRR/Ryu/OVS not available |

---

## 13. API Versioning

The API is versioned via URL path (`/api/v1/`). Breaking changes will increment the version number.

## 14. Rate Limiting

| Tier | Requests/minute |
|------|-----------------|
| Default | 100 |
| Authenticated | 500 |
| Admin | Unlimited |

Rate limit headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1708000000
```
