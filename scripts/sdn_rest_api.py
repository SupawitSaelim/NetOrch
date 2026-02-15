#!/opt/ryu-env/bin/python
"""
NetOrch - Minimal SDN REST API
Wraps ovs-ofctl / ovs-vsctl commands into a REST API
Runs on port 8080
"""
import json
import subprocess
import re
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs


def run_cmd(cmd):
    """Run shell command and return output"""
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=10)
        return result.stdout.strip(), result.returncode
    except Exception as e:
        return str(e), 1


def get_bridges():
    """Get OVS bridges"""
    out, _ = run_cmd("ovs-vsctl list-br")
    return [b for b in out.split('\n') if b]


def get_bridge_info(name):
    """Get bridge details"""
    out, rc = run_cmd(f"ovs-vsctl list bridge {name}")
    if rc != 0:
        return None
    info = {}
    for line in out.split('\n'):
        if ':' in line:
            key, val = line.split(':', 1)
            info[key.strip()] = val.strip()
    return info


def get_ports(bridge):
    """Get ports on a bridge"""
    out, _ = run_cmd(f"ovs-vsctl list-ports {bridge}")
    return [p for p in out.split('\n') if p]


def get_flows(bridge):
    """Get OpenFlow flows from a bridge"""
    out, rc = run_cmd(f"ovs-ofctl dump-flows {bridge} -O OpenFlow13")
    if rc != 0:
        return []
    flows = []
    for line in out.split('\n'):
        line = line.strip()
        if not line or line.startswith('OFPST') or line.startswith('NXST'):
            continue
        flow = {'raw': line}
        # Parse basic fields
        cookie_match = re.search(r'cookie=(\S+)', line)
        if cookie_match:
            flow['cookie'] = cookie_match.group(1)
        priority_match = re.search(r'priority=(\d+)', line)
        if priority_match:
            flow['priority'] = int(priority_match.group(1))
        actions_match = re.search(r'actions=(.+)$', line)
        if actions_match:
            flow['actions'] = actions_match.group(1)
        n_packets_match = re.search(r'n_packets=(\d+)', line)
        if n_packets_match:
            flow['n_packets'] = int(n_packets_match.group(1))
        n_bytes_match = re.search(r'n_bytes=(\d+)', line)
        if n_bytes_match:
            flow['n_bytes'] = int(n_bytes_match.group(1))
        flows.append(flow)
    return flows


def add_flow(bridge, priority, match_str, actions):
    """Add a flow rule"""
    cmd = f"ovs-ofctl add-flow {bridge} 'priority={priority},{match_str},actions={actions}' -O OpenFlow13"
    out, rc = run_cmd(cmd)
    return rc == 0, out


def delete_flow(bridge, match_str):
    """Delete flow rules matching criteria"""
    cmd = f"ovs-ofctl del-flows {bridge} '{match_str}' -O OpenFlow13"
    out, rc = run_cmd(cmd)
    return rc == 0, out


class SDNHandler(BaseHTTPRequestHandler):
    def _json_response(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == '/health':
            bridges = get_bridges()
            self._json_response({
                'status': 'running',
                'controller': 'netorch-sdn',
                'bridges': len(bridges)
            })

        elif path == '/switches' or path == '/bridges':
            bridges = get_bridges()
            result = []
            for br in bridges:
                ports = get_ports(br)
                info = get_bridge_info(br)
                result.append({
                    'name': br,
                    'dpid': info.get('datapath_id', '').replace('"', '') if info else '',
                    'ports': ports,
                    'n_ports': len(ports),
                    'protocols': info.get('protocols', '') if info else '',
                    'connected': True
                })
            self._json_response(result)

        elif path.startswith('/flows/'):
            bridge = path.split('/flows/')[1]
            if bridge in get_bridges():
                flows = get_flows(bridge)
                self._json_response({'bridge': bridge, 'flows': flows, 'total': len(flows)})
            else:
                self._json_response({'error': f'bridge {bridge} not found'}, 404)

        elif path == '/flows':
            all_flows = {}
            for br in get_bridges():
                all_flows[br] = get_flows(br)
            self._json_response(all_flows)

        else:
            self._json_response({'error': 'not found'}, 404)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        length = int(self.headers.get('Content-Length', 0))
        body = json.loads(self.rfile.read(length)) if length > 0 else {}

        if path.startswith('/flows/'):
            bridge = path.split('/flows/')[1]
            priority = body.get('priority', 100)
            match_str = body.get('match', '')
            actions = body.get('actions', 'NORMAL')
            ok, msg = add_flow(bridge, priority, match_str, actions)
            if ok:
                self._json_response({'status': 'created', 'bridge': bridge})
            else:
                self._json_response({'error': msg}, 500)

        elif path == '/bridges':
            name = body.get('name')
            if not name:
                self._json_response({'error': 'name required'}, 400)
                return
            run_cmd(f"ovs-vsctl --may-exist add-br {name}")
            proto = body.get('protocols', 'OpenFlow13')
            run_cmd(f"ovs-vsctl set bridge {name} protocols={proto}")
            self._json_response({'status': 'created', 'name': name})

        else:
            self._json_response({'error': 'not found'}, 404)

    def do_DELETE(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path.startswith('/flows/'):
            bridge = path.split('/flows/')[1]
            length = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(length)) if length > 0 else {}
            match_str = body.get('match', '')
            ok, msg = delete_flow(bridge, match_str)
            if ok:
                self._json_response({'status': 'deleted'})
            else:
                self._json_response({'error': msg}, 500)

        elif path.startswith('/bridges/'):
            name = path.split('/bridges/')[1]
            run_cmd(f"ovs-vsctl --if-exists del-br {name}")
            self._json_response({'status': 'deleted', 'name': name})

        else:
            self._json_response({'error': 'not found'}, 404)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def log_message(self, format, *args):
        print(f"[SDN-API] {self.address_string()} - {format % args}")


if __name__ == '__main__':
    port = 8080
    print(f"NetOrch SDN REST API starting on port {port}...")
    print(f"Bridges: {get_bridges()}")
    server = HTTPServer(('0.0.0.0', port), SDNHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...")
        server.shutdown()
