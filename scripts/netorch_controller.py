#!/opt/ryu-env/bin/python
"""
NetOrch Ryu (os-ken) SDN Controller
Starts OpenFlow controller on port 6653 with REST API on port 8080
"""
import sys
sys.argv = ['osken-manager', '--wsapi-port', '8080', '--ofp-tcp-listen-port', '6653']

from os_ken.base.app_manager import AppManager
from os_ken.controller import ofp_handler
from os_ken.app.wsgi import WSGIApplication
from os_ken.controller.handler import CONFIG_DISPATCHER, MAIN_DISPATCHER, set_ev_cls
from os_ken.controller import ofp_event
from os_ken.ofproto import ofproto_v1_3
from os_ken.lib.packet import packet, ethernet
from os_ken.lib import hub
from os_ken.base import app_manager
import json
from webob import Response
from os_ken.app.wsgi import ControllerBase, route


SIMPLE_SWITCH_INSTANCE_NAME = 'simple_switch_api'

class NetOrchController(app_manager.RyuApp):
    OFP_VERSIONS = [ofproto_v1_3.OFP_VERSION]
    _CONTEXTS = {'wsgi': WSGIApplication}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.mac_to_port = {}
        self.switches = {}
        wsgi = kwargs['wsgi']
        wsgi.register(NetOrchRestController, {SIMPLE_SWITCH_INSTANCE_NAME: self})

    @set_ev_cls(ofp_event.EventOFPSwitchFeatures, CONFIG_DISPATCHER)
    def switch_features_handler(self, ev):
        datapath = ev.msg.datapath
        ofproto = datapath.ofproto
        parser = datapath.ofproto_parser
        self.switches[datapath.id] = datapath
        match = parser.OFPMatch()
        actions = [parser.OFPActionOutput(ofproto.OFPP_CONTROLLER, ofproto.OFPCML_NO_BUFFER)]
        inst = [parser.OFPInstructionActions(ofproto.OFPIT_APPLY_ACTIONS, actions)]
        mod = parser.OFPFlowMod(datapath=datapath, priority=0, match=match, instructions=inst)
        datapath.send_msg(mod)
        self.logger.info(f"Switch {datapath.id} connected")

    @set_ev_cls(ofp_event.EventOFPPacketIn, MAIN_DISPATCHER)
    def packet_in_handler(self, ev):
        msg = ev.msg
        datapath = msg.datapath
        ofproto = datapath.ofproto
        parser = datapath.ofproto_parser
        in_port = msg.match['in_port']
        pkt = packet.Packet(msg.data)
        eth = pkt.get_protocols(ethernet.ethernet)[0]
        dst = eth.dst
        src = eth.src
        dpid = datapath.id
        self.mac_to_port.setdefault(dpid, {})
        self.mac_to_port[dpid][src] = in_port
        if dst in self.mac_to_port[dpid]:
            out_port = self.mac_to_port[dpid][dst]
        else:
            out_port = ofproto.OFPP_FLOOD
        actions = [parser.OFPActionOutput(out_port)]
        if out_port != ofproto.OFPP_FLOOD:
            match = parser.OFPMatch(in_port=in_port, eth_dst=dst, eth_src=src)
            inst = [parser.OFPInstructionActions(ofproto.OFPIT_APPLY_ACTIONS, actions)]
            mod = parser.OFPFlowMod(datapath=datapath, priority=1, match=match,
                                     instructions=inst, buffer_id=msg.buffer_id)
            datapath.send_msg(mod)
        data = None
        if msg.buffer_id == ofproto.OFP_NO_BUFFER:
            data = msg.data
        out = parser.OFPPacketOut(datapath=datapath, buffer_id=msg.buffer_id,
                                  in_port=in_port, actions=actions, data=data)
        datapath.send_msg(out)


class NetOrchRestController(ControllerBase):
    def __init__(self, req, link, data, **config):
        super().__init__(req, link, data, **config)
        self.app = data[SIMPLE_SWITCH_INSTANCE_NAME]

    @route('health', '/health', methods=['GET'])
    def health(self, req, **kwargs):
        body = json.dumps({
            'status': 'running',
            'switches': len(self.app.switches),
            'controller': 'os-ken',
            'version': '4.1.1'
        })
        return Response(content_type='application/json', body=body)

    @route('switches', '/switches', methods=['GET'])
    def list_switches(self, req, **kwargs):
        switches = []
        for dpid, dp in self.app.switches.items():
            switches.append({
                'dpid': f'{dpid:016x}',
                'id': dpid,
                'connected': True
            })
        return Response(content_type='application/json', body=json.dumps(switches))

    @route('flows', '/flows/{dpid}', methods=['GET'], requirements={'dpid': r'\d+'})
    def get_flows(self, req, dpid, **kwargs):
        dpid = int(dpid)
        if dpid not in self.app.switches:
            return Response(status=404, body=json.dumps({'error': 'switch not found'}))
        # Request flow stats from switch
        dp = self.app.switches[dpid]
        return Response(content_type='application/json',
                       body=json.dumps({'dpid': dpid, 'flows': []}))


if __name__ == '__main__':
    # Use os_ken's built-in way to start
    from os_ken import cfg as os_ken_cfg
    from os_ken.base.app_manager import AppManager

    # Register OpenFlow handler
    app_mgr = AppManager.get_instance()
    app_mgr.load_apps(['os_ken.controller.ofp_handler'])
    contexts = app_mgr.create_contexts()

    # Load our app
    app_cls = NetOrchController
    app = app_cls.cls_name()

    app_mgr.instantiate_apps(**contexts)

    hub.joinall(app_mgr.service_brick_instances.values())
