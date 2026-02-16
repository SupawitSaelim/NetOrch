"""Network Tools endpoints — Ping, Traceroute, ARP table from hosts/routers."""

from __future__ import annotations

import logging
import re

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.ssh_utils import ssh_exec

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tools", tags=["Network Tools"])


# ── Schemas ──────────────────────────────────────────────────────

class PingRequest(BaseModel):
    source: str          # netns name (e.g. "h1") or empty for VM root
    target: str          # IP address or hostname
    count: int = 4
    timeout: int = 5     # per-ping timeout in seconds


class TracerouteRequest(BaseModel):
    source: str
    target: str
    max_hops: int = 15
    timeout: int = 3


class ArpRequest(BaseModel):
    source: str          # netns name


# ── Validation ───────────────────────────────────────────────────

_SAFE_NAME = re.compile(r'^[a-zA-Z0-9_\-]+$')
_SAFE_IP = re.compile(r'^[a-zA-Z0-9._:\-]+$')


def _validate_name(name: str, field: str = "name") -> str:
    name = name.strip()
    if not name or not _SAFE_NAME.match(name):
        raise HTTPException(400, detail=f"Invalid {field}: {name!r}")
    return name


def _validate_target(target: str) -> str:
    target = target.strip()
    if not target or not _SAFE_IP.match(target):
        raise HTTPException(400, detail=f"Invalid target: {target!r}")
    return target


# ── Ping ─────────────────────────────────────────────────────────

@router.post("/ping")
async def ping(req: PingRequest):
    """Run ping from a host (netns) or VM root to a target IP."""
    source = _validate_name(req.source, "source") if req.source else ""
    target = _validate_target(req.target)
    count = min(max(req.count, 1), 20)
    timeout = min(max(req.timeout, 1), 10)

    if source:
        cmd = f"ip netns exec {source} ping -c {count} -W {timeout} {target}"
    else:
        cmd = f"ping -c {count} -W {timeout} {target}"

    r = await ssh_exec(cmd)

    # Parse summary
    lines = r.stdout.strip().split('\n')
    summary = {}
    for line in lines:
        if 'packets transmitted' in line:
            m = re.search(r'(\d+) packets transmitted, (\d+) received', line)
            if m:
                tx, rx = int(m.group(1)), int(m.group(2))
                summary['transmitted'] = tx
                summary['received'] = rx
                summary['loss_pct'] = round((1 - rx / tx) * 100, 1) if tx > 0 else 100
        if 'rtt min/avg/max' in line or 'round-trip min/avg/max' in line:
            m = re.search(r'= ([\d.]+)/([\d.]+)/([\d.]+)', line)
            if m:
                summary['rtt_min'] = float(m.group(1))
                summary['rtt_avg'] = float(m.group(2))
                summary['rtt_max'] = float(m.group(3))

    return {
        "success": r.returncode == 0,
        "source": source or "(vm-root)",
        "target": target,
        "output": r.stdout,
        "error": r.stderr if r.returncode != 0 else None,
        "summary": summary,
    }


# ── Traceroute ───────────────────────────────────────────────────

@router.post("/traceroute")
async def traceroute(req: TracerouteRequest):
    """Run traceroute from a host (netns) or VM root."""
    source = _validate_name(req.source, "source") if req.source else ""
    target = _validate_target(req.target)
    max_hops = min(max(req.max_hops, 1), 30)
    timeout = min(max(req.timeout, 1), 10)

    if source:
        cmd = f"ip netns exec {source} traceroute -m {max_hops} -w {timeout} -n {target}"
    else:
        cmd = f"traceroute -m {max_hops} -w {timeout} -n {target}"

    r = await ssh_exec(cmd)

    # Parse hops
    hops = []
    for line in r.stdout.strip().split('\n')[1:]:  # skip header
        m = re.match(r'\s*(\d+)\s+(.*)', line)
        if m:
            hops.append({'hop': int(m.group(1)), 'detail': m.group(2).strip()})

    return {
        "success": r.returncode == 0,
        "source": source or "(vm-root)",
        "target": target,
        "output": r.stdout,
        "error": r.stderr if r.returncode != 0 else None,
        "hops": hops,
    }


# ── ARP Table ────────────────────────────────────────────────────

@router.post("/arp")
async def arp_table(req: ArpRequest):
    """Get ARP table from a host namespace."""
    source = _validate_name(req.source, "source")
    cmd = f"ip netns exec {source} ip neigh show"
    r = await ssh_exec(cmd)

    entries = []
    for line in r.stdout.strip().split('\n'):
        if not line.strip():
            continue
        parts = line.split()
        if len(parts) >= 4:
            entry: dict = {'ip': parts[0]}
            if 'lladdr' in parts:
                idx = parts.index('lladdr')
                entry['mac'] = parts[idx + 1] if idx + 1 < len(parts) else '?'
            entry['state'] = parts[-1] if parts[-1] in ('REACHABLE', 'STALE', 'DELAY', 'PROBE', 'FAILED', 'INCOMPLETE', 'PERMANENT') else 'unknown'
            entry['interface'] = parts[2] if parts[1] == 'dev' else ''
            entries.append(entry)

    return {
        "success": r.returncode == 0,
        "source": source,
        "output": r.stdout,
        "entries": entries,
    }


# ── MAC Address Table ────────────────────────────────────────────

class MacRequest(BaseModel):
    bridge: str          # OVS bridge name (e.g. "sw1")


@router.post("/mac")
async def mac_table(req: MacRequest):
    """Get MAC address (FDB) table from an OVS bridge."""
    bridge = _validate_name(req.bridge, "bridge")

    # Try ovs-appctl fdb/show first (best for OVS bridges)
    r = await ssh_exec(f"ovs-appctl fdb/show {bridge}")

    entries = []
    if r.returncode == 0 and r.stdout.strip():
        for line in r.stdout.strip().split('\n'):
            # Header: "port  VLAN  MAC                Age"
            if line.strip().startswith('port') or not line.strip():
                continue
            parts = line.split()
            if len(parts) >= 4:
                entry: dict = {
                    'port': parts[0],
                    'vlan': parts[1],
                    'mac': parts[2],
                    'age': parts[3],
                }
                entries.append(entry)
    else:
        # Fallback: try ovs-ofctl dump-flows (extract dl_dst / dl_src MACs)
        r2 = await ssh_exec(f"ovs-ofctl dump-flows {bridge}")
        if r2.returncode == 0:
            seen_macs: set = set()
            for line in r2.stdout.strip().split('\n'):
                for mac_match in re.finditer(r'dl_(?:src|dst)=([0-9a-fA-F:]{17})', line):
                    mac_addr = mac_match.group(1)
                    if mac_addr not in seen_macs:
                        seen_macs.add(mac_addr)
                        direction = 'src' if 'dl_src=' + mac_addr in line else 'dst'
                        entries.append({
                            'port': '—',
                            'vlan': '—',
                            'mac': mac_addr,
                            'age': '—',
                            'source': f'flow ({direction})',
                        })
            r = r2  # use for output

    return {
        "success": r.returncode == 0,
        "bridge": bridge,
        "output": r.stdout,
        "error": r.stderr if r.returncode != 0 else None,
        "entries": entries,
        "total": len(entries),
    }


# ── List Hosts (for dropdown) ────────────────────────────────────

@router.get("/hosts")
async def list_hosts():
    """List all network namespaces (hosts) available for testing."""
    r = await ssh_exec("ip netns list")
    hosts = []
    for line in r.stdout.strip().split('\n'):
        name = line.split()[0] if line.strip() else ''
        if name:
            hosts.append(name)
    return {"hosts": sorted(hosts)}


@router.get("/bridges")
async def list_bridges():
    """List all OVS bridges available for MAC table lookup."""
    r = await ssh_exec("ovs-vsctl list-br")
    bridges = []
    for line in r.stdout.strip().split('\n'):
        name = line.strip()
        if name:
            bridges.append(name)
    return {"bridges": sorted(bridges)}
