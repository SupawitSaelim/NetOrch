#!/opt/ryu-env/bin/python
"""
os-ken (Ryu) SDN Controller launcher for NetOrch
Usage: osken-manager [--wsapi-port PORT] [--ofp-tcp-listen-port PORT] [app.py ...]
"""
import sys
import os

# Parse our custom arguments before os-ken gets them
wsapi_port = 8080
ofp_port = 6653
apps = []

i = 1
while i < len(sys.argv):
    if sys.argv[i] == '--wsapi-port' and i + 1 < len(sys.argv):
        wsapi_port = int(sys.argv[i + 1])
        i += 2
    elif sys.argv[i] == '--ofp-tcp-listen-port' and i + 1 < len(sys.argv):
        ofp_port = int(sys.argv[i + 1])
        i += 2
    else:
        apps.append(sys.argv[i])
        i += 1

# Set os-ken config via environment
os.environ['OSKEN_WSAPI_PORT'] = str(wsapi_port)
os.environ['OSKEN_OFP_TCP_LISTEN_PORT'] = str(ofp_port)

from os_ken.base.app_manager import AppManager
from os_ken import cfg

# Configure
cfg.CONF.register_cli_opts([
    cfg.IntOpt('wsapi-port', default=wsapi_port),
    cfg.IntOpt('ofp-tcp-listen-port', default=ofp_port),
])

# Set args for oslo.config
sys.argv = ['osken-manager'] + apps

# Run
app_mgr = AppManager.get_instance()
app_mgr.load_apps(apps + ['os_ken.controller.ofp_handler'])
contexts = app_mgr.create_contexts()
app_mgr.instantiate_apps(**contexts)

# Start WSGI on the specified port
from os_ken.app.wsgi import start_service
from os_ken.lib import hub

# Start the OpenFlow controller
webapp = hub.spawn(start_service)
try:
    app_mgr.close()
except:
    pass

hub.joinall([webapp])
