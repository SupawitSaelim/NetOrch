"""Network Tools endpoints — Ping, Traceroute, ARP, MAC, Packet Capture."""

from __future__ import annotations

import logging
import re

from fastapi import APIRouter, HTTPException, Query
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


class CaptureRequest(BaseModel):
    source: str = ""      # netns name (empty = VM root)
    interface: str = "any"  # interface to capture on
    filter: str = ""      # BPF filter expression (e.g. "icmp", "port 80")
    count: int = 20       # max packets to capture
    timeout: int = 10     # max seconds to wait


# ── Validation ───────────────────────────────────────────────────

_SAFE_NAME = re.compile(r'^[a-zA-Z0-9_\-]+$')
_SAFE_IP = re.compile(r'^[a-zA-Z0-9._:\-]+$')
_SAFE_BPF = re.compile(r'^[a-zA-Z0-9 ._:\-/()!=<>&|]+$')


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


# ── Packet Capture (tcpdump) ──────────────────────────────────────

@router.post("/capture")
async def packet_capture(req: CaptureRequest):
    """Run tcpdump to capture packets on an interface.

    Returns parsed packet list + raw output.
    Runs with a packet count limit and timeout for safety.
    """
    source = _validate_name(req.source, "source") if req.source else ""
    interface = _validate_name(req.interface, "interface") if req.interface else "any"
    count = min(max(req.count, 1), 100)  # 1-100 packets
    timeout = min(max(req.timeout, 1), 30)  # 1-30 seconds

    # Validate BPF filter (no shell injection)
    bpf_filter = ""
    if req.filter:
        filt = req.filter.strip()
        if filt and not _SAFE_BPF.match(filt):
            raise HTTPException(400, detail=f"Invalid filter expression: {filt!r}")
        bpf_filter = filt

    # Build tcpdump command: -nn (no DNS), -e (show MAC), -l (line-buffered)
    # --immediate-mode for faster output
    tcpdump_cmd = f"tcpdump -nn -e -c {count} -i {interface}"
    if bpf_filter:
        tcpdump_cmd += f" {bpf_filter}"

    if source:
        cmd = f"ip netns exec {source} {tcpdump_cmd}"
    else:
        cmd = tcpdump_cmd

    r = await ssh_exec(cmd, timeout=timeout + 5)

    # Parse packets from tcpdump output
    packets = []
    lines = r.stdout.strip().split('\n') if r.stdout.strip() else []
    summary_lines: list[str] = []

    for line in lines:
        line = line.strip()
        if not line:
            continue
        # Summary line: "X packets captured, Y packets received by filter, Z packets dropped"
        if 'packets captured' in line or 'packets received' in line or 'packets dropped' in line:
            summary_lines.append(line)
            continue

        # Parse tcpdump line: timestamp src > dst: proto info
        pkt = _parse_tcpdump_line(line)
        if pkt:
            packets.append(pkt)

    # Extract summary stats
    summary = {}
    summary_text = "\n".join(summary_lines)
    if summary_text or r.stderr:
        text = summary_text or r.stderr
        m = re.search(r'(\d+) packets? captured', text)
        if m:
            summary['captured'] = int(m.group(1))
        m = re.search(r'(\d+) packets? received', text)
        if m:
            summary['received'] = int(m.group(1))
        m = re.search(r'(\d+) packets? dropped', text)
        if m:
            summary['dropped'] = int(m.group(1))

    return {
        "success": r.returncode == 0 or len(packets) > 0,
        "source": source or "(vm-root)",
        "interface": interface,
        "filter": bpf_filter or "(none)",
        "output": r.stdout,
        "error": r.stderr if r.returncode != 0 and not packets else None,
        "packets": packets,
        "total": len(packets),
        "summary": summary,
    }


def _parse_tcpdump_line(line: str) -> dict | None:
    """Parse a single tcpdump -nn -e output line into a structured dict."""
    if not line or line.startswith('tcpdump:') or line.startswith('listening on'):
        return None

    result: dict = {'raw': line}

    # Try to extract timestamp (HH:MM:SS.ffffff)
    ts_match = re.match(r'^(\d{2}:\d{2}:\d{2}\.\d+)\s+(.+)', line)
    if ts_match:
        result['timestamp'] = ts_match.group(1)
        rest = ts_match.group(2)
    else:
        rest = line

    # Extract MAC addresses from -e output: aa:bb:cc:dd:ee:ff > ff:ff:ff:ff:ff:ff
    mac_match = re.match(r'([0-9a-fA-F:]{17})\s+>\s+([0-9a-fA-F:]{17})', rest)
    if mac_match:
        result['src_mac'] = mac_match.group(1)
        result['dst_mac'] = mac_match.group(2)
        rest = rest[mac_match.end():].strip().lstrip(',').strip()

    # Extract ethertype
    ether_match = re.match(r'ethertype\s+(\S+)\s+\(0x[\da-fA-F]+\)', rest)
    if ether_match:
        result['ethertype'] = ether_match.group(1)
        rest = rest[ether_match.end():].strip().lstrip(',').strip()

    # Extract IP src > dst
    ip_match = re.search(r'(\d+\.\d+\.\d+\.\d+[\.\d]*)\s+>\s+(\d+\.\d+\.\d+\.\d+[\.\d]*)', rest)
    if ip_match:
        result['src_ip'] = ip_match.group(1)
        result['dst_ip'] = ip_match.group(2)

    # Extract protocol hints (check rest text + ethertype)
    proto = 'other'
    rest_lower = rest.lower()
    ethertype_lower = result.get('ethertype', '').lower()
    if 'icmp' in rest_lower:
        proto = 'ICMP'
    elif 'tcp' in rest_lower or 'Flags [' in rest:
        proto = 'TCP'
    elif 'udp' in rest_lower:
        proto = 'UDP'
    elif 'arp' in rest_lower or ethertype_lower == 'arp':
        proto = 'ARP'
    elif 'stp' in rest_lower or ethertype_lower == 'stp':
        proto = 'STP'
    elif 'lldp' in rest_lower or ethertype_lower == 'lldp':
        proto = 'LLDP'
    result['protocol'] = proto

    # Extract length
    len_match = re.search(r'length\s+(\d+)', rest)
    if len_match:
        result['length'] = int(len_match.group(1))

    result['info'] = rest.strip() if rest.strip() else line

    return result


# ── List Interfaces ──────────────────────────────────────────────

@router.get("/interfaces")
async def list_interfaces(source: str = Query("", description="Network namespace (empty = VM root)")):
    """List network interfaces in a namespace (or VM root)."""
    if source:
        source = _validate_name(source, "source")
        cmd = f"ip netns exec {source} ip -br addr show"
    else:
        cmd = "ip -br addr show"

    r = await ssh_exec(cmd)
    interfaces = []
    for line in r.stdout.strip().split('\n'):
        if not line.strip():
            continue
        parts = line.split()
        if len(parts) >= 2:
            iface: dict = {
                'name': parts[0],
                'state': parts[1],
                'addresses': parts[2:] if len(parts) > 2 else [],
            }
            interfaces.append(iface)

    return {
        "source": source or "(vm-root)",
        "interfaces": interfaces,
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
