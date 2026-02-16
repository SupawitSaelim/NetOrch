import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getTopology,
  refreshTopology,
  createSwitch,
  deleteSwitch,
  createHost,
  deleteHost,
  createLink,
  deleteLink,
} from '../../api/endpoints';
import type { Topology } from '../../types';
import { SkeletonCard, ErrorBanner } from '../../components/Shared';
import { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';

/* ═══════════════════════════════════════════════════════════════
   EVE-NG Style Interactive Topology Builder (D3.js)
   ─ Create / delete switches, hosts, links via toolbar
   ─ Drag-to-link, click to place, right-click to delete
   ═══════════════════════════════════════════════════════════════ */

type BuilderMode = 'select' | 'addSwitch' | 'addHost' | 'addLink' | 'delete';

const NODE_COLORS: Record<string, string> = {
  switch: '#3b82f6',
  router: '#22c55e',
  host: '#a78bfa',
  network: '#f59e0b',
};

const NODE_LABELS: Record<string, string> = {
  switch: '⬡',
  router: '⬢',
  host: '◉',
  network: '◎',
};

const NODE_ICONS: Record<string, string> = {
  switch: 'B',
  router: 'R',
  host: 'H',
  network: 'N',
};

// ── D3 types ──
interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  type: string;
  name: string;
  dpid: string | null;
  metadata: Record<string, unknown>;
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  id: string;
  source_port: string;
  target_port: string;
  bandwidth: number | null;
  status: 'up' | 'down';
}

// ── Form types ──
interface CreateSwitchForm {
  name: string;
  protocols: string;
  controller: string;
}

interface CreateHostForm {
  name: string;
  ip: string;
  gateway: string;
}

/* ══════════════════════════ COMPONENT ══════════════════════════ */

export default function TopologyPage() {
  const qc = useQueryClient();

  // ── Data ──
  const topology = useQuery({
    queryKey: ['topology'],
    queryFn: () => getTopology().then((r) => r.data),
    refetchInterval: 30_000,
  });

  const nodes = topology.data?.nodes ?? [];
  const links = topology.data?.links ?? [];

  // ── Builder state ──
  const [mode, setMode] = useState<BuilderMode>('select');
  const [linkSource, setLinkSource] = useState<SimNode | null>(null);
  const [showSwitchDialog, setShowSwitchDialog] = useState(false);
  const [showHostDialog, setShowHostDialog] = useState(false);
  const [pendingPosition, setPendingPosition] = useState<{ x: number; y: number } | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);

  // ── Properties panel ──
  const [propertiesNode, setPropertiesNode] = useState<SimNode | null>(null);

  // ── D3 refs ──
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; node: SimNode } | null>(null);
  const [dimensions, setDimensions] = useState({ width: 900, height: 560 });
  const transformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
  // Keep a ref to mode so D3 event handlers see latest value
  const modeRef = useRef<BuilderMode>(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  const linkSourceRef = useRef<SimNode | null>(linkSource);
  useEffect(() => { linkSourceRef.current = linkSource; }, [linkSource]);

  // ── Form state ──
  const [switchForm, setSwitchForm] = useState<CreateSwitchForm>({ name: '', protocols: 'OpenFlow13', controller: '' });
  const [hostForm, setHostForm] = useState<CreateHostForm>({ name: '', ip: '', gateway: '' });

  // ── Toast ──
  const flash = useCallback((msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Mutations ──
  const refreshMut = useMutation({
    mutationFn: () => refreshTopology(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['topology'] }); flash('Topology refreshed'); },
  });

  const createSwitchMut = useMutation({
    mutationFn: (data: { name: string; x?: number; y?: number; protocols?: string; controller?: string }) =>
      createSwitch(data),
    onSuccess: (r, vars) => {
      // Optimistic: add switch to cache immediately
      qc.setQueryData(['topology'], (old: Topology | undefined) => {
        if (!old) return old;
        const newId = `switch-${String(old.nodes.filter(n => n.type === 'switch').length + 1).padStart(3, '0')}`;
        return {
          ...old,
          nodes: [...old.nodes, {
            id: newId, type: 'switch' as const, name: vars.name,
            dpid: null, metadata: { x: vars.x ?? 400, y: vars.y ?? 300 },
          }],
          links: [...old.links, {
            id: `link-new-${Date.now()}`, source: 'router-001', target: newId,
            source_port: 'internal', target_port: vars.name,
            bandwidth: 10000, status: 'up' as const,
          }],
        };
      });
      qc.invalidateQueries({ queryKey: ['topology'] });
      flash(r.data.message);
    },
    onError: (e: any) => flash(e?.response?.data?.detail ?? 'Failed to create switch', 'err'),
  });

  const deleteSwitchMut = useMutation({
    mutationFn: (name: string) => deleteSwitch(name),
    onSuccess: (r, deletedName) => {
      // Optimistic: remove switch + connected links from cache immediately
      qc.setQueryData(['topology'], (old: Topology | undefined) => {
        if (!old) return old;
        const removedIds = new Set(old.nodes.filter(n => n.name === deletedName && n.type === 'switch').map(n => n.id));
        return {
          ...old,
          nodes: old.nodes.filter(n => !removedIds.has(n.id)),
          links: old.links.filter(l => !removedIds.has(l.source) && !removedIds.has(l.target)),
        };
      });
      qc.invalidateQueries({ queryKey: ['topology'] });
      flash(r.data.message);
      setPropertiesNode(null);
    },
    onError: (e: any) => flash(e?.response?.data?.detail ?? 'Failed to delete switch', 'err'),
  });

  const createHostMut = useMutation({
    mutationFn: (data: { name: string; ip?: string; x?: number; y?: number; gateway?: string }) =>
      createHost(data),
    onSuccess: (r, vars) => {
      // Optimistic: add host to cache immediately
      const vethName = `${vars.name}-veth`;
      qc.setQueryData(['topology'], (old: Topology | undefined) => {
        if (!old) return old;
        const hostId = `host-${vethName}`;
        if (old.nodes.some(n => n.id === hostId)) return old;
        return {
          ...old,
          nodes: [...old.nodes, {
            id: hostId, type: 'host' as const, name: vethName,
            dpid: null, metadata: { x: vars.x ?? 400, y: vars.y ?? 400, ip: vars.ip, gateway: vars.gateway },
          }],
        };
      });
      qc.invalidateQueries({ queryKey: ['topology'] });
      flash(r.data.message);
    },
    onError: (e: any) => flash(e?.response?.data?.detail ?? 'Failed to create host', 'err'),
  });

  const deleteHostMut = useMutation({
    mutationFn: (name: string) => deleteHost(name),
    onSuccess: (r, deletedName) => {
      // Optimistic: remove host + connected links from cache immediately
      const vethName = `${deletedName}-veth`;
      qc.setQueryData(['topology'], (old: Topology | undefined) => {
        if (!old) return old;
        const removedIds = new Set(old.nodes.filter(n => n.name === vethName && n.type === 'host').map(n => n.id));
        return {
          ...old,
          nodes: old.nodes.filter(n => !removedIds.has(n.id)),
          links: old.links.filter(l => !removedIds.has(l.source) && !removedIds.has(l.target)),
        };
      });
      qc.invalidateQueries({ queryKey: ['topology'] });
      flash(r.data.message);
      setPropertiesNode(null);
    },
    onError: (e: any) => flash(e?.response?.data?.detail ?? 'Failed to delete host', 'err'),
  });

  const createLinkMut = useMutation({
    mutationFn: (data: { source_id: string; target_id: string; source_name: string; target_name: string }) =>
      createLink(data),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['topology'] });
      flash(r.data.message);
      setLinkSource(null);
    },
    onError: (e: any) => { flash(e?.response?.data?.detail ?? 'Failed to create link', 'err'); setLinkSource(null); },
  });

  const deleteLinkMut = useMutation({
    mutationFn: (data: { sourceName: string; targetName: string }) => deleteLink(data.sourceName, data.targetName),
    onSuccess: (r, vars) => {
      // Optimistic: remove link from cache immediately
      qc.setQueryData(['topology'], (old: Topology | undefined) => {
        if (!old) return old;
        const srcNode = old.nodes.find(n => n.name === vars.sourceName);
        const tgtNode = old.nodes.find(n => n.name === vars.targetName);
        if (!srcNode || !tgtNode) return old;
        return {
          ...old,
          links: old.links.filter(l =>
            !((l.source === srcNode.id && l.target === tgtNode.id) ||
              (l.source === tgtNode.id && l.target === srcNode.id))
          ),
        };
      });
      qc.invalidateQueries({ queryKey: ['topology'] });
      flash(r.data.message);
    },
    onError: (e: any) => flash(e?.response?.data?.detail ?? 'Failed to delete link', 'err'),
  });

  // ── Handlers ──
  const handleCreateSwitch = () => {
    if (!switchForm.name.trim()) return;
    createSwitchMut.mutate({
      name: switchForm.name.trim(),
      x: pendingPosition?.x,
      y: pendingPosition?.y,
      protocols: switchForm.protocols || undefined,
      controller: switchForm.controller || undefined,
    });
    setShowSwitchDialog(false);
    setSwitchForm({ name: '', protocols: 'OpenFlow13', controller: '' });
    setPendingPosition(null);
    setMode('select');
  };

  const handleCreateHost = () => {
    if (!hostForm.name.trim()) return;
    createHostMut.mutate({
      name: hostForm.name.trim(),
      ip: hostForm.ip || undefined,
      x: pendingPosition?.x,
      y: pendingPosition?.y,
      gateway: hostForm.gateway || undefined,
    });
    setShowHostDialog(false);
    setHostForm({ name: '', ip: '', gateway: '' });
    setPendingPosition(null);
    setMode('select');
  };

  // ── Resize ──
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) setDimensions({ width, height: Math.max(height, 450) });
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // ── Keyboard ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Escape') { setMode('select'); setLinkSource(null); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && propertiesNode) {
        if (propertiesNode.type === 'switch') deleteSwitchMut.mutate(propertiesNode.name);
        else if (propertiesNode.type === 'host') deleteHostMut.mutate(propertiesNode.name.replace('-veth', ''));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [propertiesNode]);

  /* ═══════════ D3 RENDER ═══════════ */
  const renderGraph = useCallback(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    const { width, height } = dimensions;

    const simNodes: SimNode[] = nodes.map((n) => ({
      id: n.id, type: n.type, name: n.name, dpid: n.dpid, metadata: n.metadata,
      x: (n.metadata.x as number) ?? width / 2 + (Math.random() - 0.5) * 300,
      y: (n.metadata.y as number) ?? height / 2 + (Math.random() - 0.5) * 200,
    }));

    const simLinks: SimLink[] = links.map((l) => ({
      id: l.id, source: l.source, target: l.target,
      source_port: l.source_port, target_port: l.target_port,
      bandwidth: l.bandwidth, status: l.status,
    }));

    // ── Defs ──
    const defs = svg.append('defs');
    const filter = defs.append('filter').attr('id', 'glow').attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%');
    filter.append('feGaussianBlur').attr('stdDeviation', '4').attr('result', 'blur');
    filter.append('feComposite').attr('in', 'SourceGraphic').attr('in2', 'blur').attr('operator', 'over');

    defs.append('marker')
      .attr('id', 'arrowhead').attr('viewBox', '0 -5 10 10').attr('refX', 32).attr('refY', 0)
      .attr('markerWidth', 6).attr('markerHeight', 6).attr('orient', 'auto')
      .append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', '#475569');

    defs.append('style').text(`
      @keyframes dash-flow { to { stroke-dashoffset: -20; } }
      .link-animated { animation: dash-flow 0.8s linear infinite; }
    `);

    const g = svg.append('g');

    // ── Zoom ──
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on('zoom', (event) => { g.attr('transform', event.transform); transformRef.current = event.transform; });

    svg.call(zoom as any);
    svg.call(zoom.transform as any, d3.zoomIdentity.translate(width * 0.05, height * 0.05).scale(0.9));

    // ── Canvas click (create mode) ──
    svg.on('click', (event: MouseEvent) => {
      if ((event.target as Element).closest('.node, .link-line, .link-glow')) return;
      const [mx, my] = d3.pointer(event, g.node());
      const m = modeRef.current;
      if (m === 'addSwitch') { setPendingPosition({ x: mx, y: my }); setShowSwitchDialog(true); }
      else if (m === 'addHost') { setPendingPosition({ x: mx, y: my }); setShowHostDialog(true); }
      else if (m === 'select') { setPropertiesNode(null); setLinkSource(null); }
    });

    // ── Force simulation ──
    const simulation = d3.forceSimulation(simNodes)
      .force('link', d3.forceLink<SimNode, SimLink>(simLinks).id((d) => d.id).distance(140).strength(0.4))
      .force('charge', d3.forceManyBody().strength(-500))
      .force('center', d3.forceCenter(width / 2, height / 2).strength(0.03))
      .force('collision', d3.forceCollide().radius(50))
      .force('x', d3.forceX(width / 2).strength(0.03))
      .force('y', d3.forceY(height / 2).strength(0.03));

    // ── Links ──
    const linkGroup = g.append('g').attr('class', 'links');

    linkGroup.selectAll('.link-glow').data(simLinks).join('line')
      .attr('class', 'link-glow')
      .attr('stroke', (d) => d.status === 'up' ? '#3b82f6' : '#ef4444')
      .attr('stroke-width', 6).attr('stroke-opacity', 0.15).attr('stroke-linecap', 'round');

    const linkLines = linkGroup.selectAll('.link-line').data(simLinks).join('line')
      .attr('class', (d) => `link-line ${d.status === 'up' ? 'link-animated' : ''}`)
      .attr('stroke', (d) => d.status === 'up' ? '#475569' : '#ef4444')
      .attr('stroke-width', 2.5)
      .attr('stroke-dasharray', (d) => d.status === 'up' ? '8,4' : '5,5')
      .attr('stroke-linecap', 'round').attr('marker-end', 'url(#arrowhead)');

    // Delete link on click
    linkLines.on('click', (event: MouseEvent, d: SimLink) => {
      event.stopPropagation();
      if (modeRef.current === 'delete') {
        const srcName = typeof d.source === 'object' ? (d.source as SimNode).name : String(d.source);
        const tgtName = typeof d.target === 'object' ? (d.target as SimNode).name : String(d.target);
        if (confirm(`Delete link ${srcName} ↔ ${tgtName}?`)) {
          deleteLinkMut.mutate({ sourceName: srcName, targetName: tgtName });
        }
      }
    });

    const linkLabels = linkGroup.selectAll('.link-label').data(simLinks).join('g').attr('class', 'link-label');
    linkLabels.append('rect').attr('rx', 4).attr('ry', 4)
      .attr('fill', 'var(--color-bg-card, #1e293b)')
      .attr('stroke', 'var(--color-border, #334155)').attr('stroke-width', 0.5).attr('opacity', 0.9);
    linkLabels.append('text')
      .text((d) => `${d.source_port}↔${d.target_port}`)
      .attr('fill', '#94a3b8').attr('font-size', 9)
      .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle').attr('font-family', 'monospace');

    const statusDots = linkGroup.selectAll('.status-dot').data(simLinks).join('circle')
      .attr('class', 'status-dot').attr('r', 4)
      .attr('fill', (d) => d.status === 'up' ? '#22c55e' : '#ef4444')
      .attr('stroke', '#0f172a').attr('stroke-width', 1.5);

    // ── Temp link line (link-creation preview) ──
    const tempLine = g.append('line').attr('class', 'temp-link')
      .attr('stroke', '#f59e0b').attr('stroke-width', 2).attr('stroke-dasharray', '6,4').attr('display', 'none');

    svg.on('mousemove.linkdraw', (event: MouseEvent) => {
      const ls = linkSourceRef.current;
      if (modeRef.current === 'addLink' && ls) {
        const [mx, my] = d3.pointer(event, g.node());
        tempLine.attr('display', null)
          .attr('x1', ls.x ?? 0).attr('y1', ls.y ?? 0).attr('x2', mx).attr('y2', my);
      } else {
        tempLine.attr('display', 'none');
      }
    });

    // ── Nodes ──
    const nodeGroup = g.append('g').attr('class', 'nodes');
    const nodeGs = nodeGroup.selectAll('.node').data(simNodes).join('g')
      .attr('class', 'node').style('cursor', 'grab');

    // Outer glow
    nodeGs.append('circle').attr('r', 30)
      .attr('fill', (d) => NODE_COLORS[d.type] ?? '#94a3b8').attr('opacity', 0.1).attr('filter', 'url(#glow)');
    // Selection ring
    nodeGs.append('circle').attr('class', 'select-ring').attr('r', 28)
      .attr('fill', 'none').attr('stroke', '#f59e0b').attr('stroke-width', 3).attr('stroke-dasharray', '6,3').attr('opacity', 0);
    // Outer ring
    nodeGs.append('circle').attr('r', 25).attr('fill', 'none')
      .attr('stroke', (d) => NODE_COLORS[d.type] ?? '#94a3b8')
      .attr('stroke-width', 2).attr('stroke-opacity', 0.4).attr('stroke-dasharray', '4,3');
    // Main circle
    nodeGs.append('circle').attr('r', 20)
      .attr('fill', (d) => NODE_COLORS[d.type] ?? '#94a3b8')
      .attr('stroke', (d) => d3.color(NODE_COLORS[d.type] ?? '#94a3b8')!.brighter(0.5).formatHex())
      .attr('stroke-width', 2);
    // Icon
    nodeGs.append('text')
      .text((d) => NODE_LABELS[d.type] ?? '●')
      .attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
      .attr('font-size', 16).attr('fill', '#fff').attr('pointer-events', 'none');
    // Name
    nodeGs.append('text').text((d) => d.name)
      .attr('dy', 38).attr('text-anchor', 'middle')
      .attr('fill', '#e2e8f0').attr('font-size', 12).attr('font-weight', 600).attr('pointer-events', 'none');
    // Type
    nodeGs.append('text').text((d) => d.type)
      .attr('dy', 52).attr('text-anchor', 'middle')
      .attr('fill', '#64748b').attr('font-size', 10).attr('pointer-events', 'none');

    // ── Node click — mode-dependent ──
    nodeGs.on('click', function (event: MouseEvent, d: SimNode) {
      event.stopPropagation();
      const m = modeRef.current;

      if (m === 'delete') {
        if (d.type === 'switch') {
          if (confirm(`Delete switch "${d.name}"?`)) deleteSwitchMut.mutate(d.name);
        } else if (d.type === 'host') {
          const hostName = d.name.replace('-veth', '');
          if (confirm(`Delete host "${hostName}"?`)) deleteHostMut.mutate(hostName);
        } else {
          flash(`Cannot delete ${d.type} nodes from builder`, 'err');
        }
        return;
      }

      if (m === 'addLink') {
        const ls = linkSourceRef.current;
        if (!ls) {
          setLinkSource(d);
          flash(`Link source: ${d.name} — click target node`);
          nodeGs.selectAll('.select-ring').attr('opacity', 0);
          d3.select(event.currentTarget as Element).select('.select-ring').attr('opacity', 1);
        } else if (ls.id !== d.id) {
          createLinkMut.mutate({ source_id: ls.id, target_id: d.id, source_name: ls.name, target_name: d.name });
          nodeGs.selectAll('.select-ring').attr('opacity', 0);
        }
        return;
      }

      // Select mode
      setPropertiesNode(d);
      nodeGs.selectAll('.select-ring').attr('opacity', 0);
      d3.select(event.currentTarget as Element).select('.select-ring').attr('opacity', 1);
    });

    // ── Drag (select mode) ──
    const drag = d3.drag<SVGGElement, SimNode>()
      .on('start', (event, d) => {
        if (modeRef.current !== 'select') return;
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x; d.fy = d.y;
      })
      .on('drag', (event, d) => {
        if (modeRef.current !== 'select') return;
        d.fx = event.x; d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (modeRef.current !== 'select') return;
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null; d.fy = null;
      });
    nodeGs.call(drag as any);

    // ── Hover ──
    nodeGs
      .on('mouseenter', (event: MouseEvent, d: SimNode) => {
        if (modeRef.current !== 'select') return;
        const [x, y] = d3.pointer(event, svgRef.current);
        setTooltip({ x: x + 15, y: y - 10, node: d });
        linkLines.attr('stroke-opacity', (l: SimLink) => {
          const src = typeof l.source === 'object' ? (l.source as SimNode).id : l.source;
          const tgt = typeof l.target === 'object' ? (l.target as SimNode).id : l.target;
          return src === d.id || tgt === d.id ? 1 : 0.15;
        });
        nodeGs.attr('opacity', (n: SimNode) => {
          if (n.id === d.id) return 1;
          return simLinks.some((l) => {
            const src = typeof l.source === 'object' ? (l.source as SimNode).id : l.source;
            const tgt = typeof l.target === 'object' ? (l.target as SimNode).id : l.target;
            return (src === d.id && tgt === n.id) || (tgt === d.id && src === n.id);
          }) ? 1 : 0.25;
        });
      })
      .on('mouseleave', () => {
        setTooltip(null);
        linkLines.attr('stroke-opacity', 1);
        nodeGs.attr('opacity', 1);
      });

    // ── Tick ──
    simulation.on('tick', () => {
      linkGroup.selectAll<SVGLineElement, SimLink>('.link-glow')
        .attr('x1', (d) => (d.source as SimNode).x!).attr('y1', (d) => (d.source as SimNode).y!)
        .attr('x2', (d) => (d.target as SimNode).x!).attr('y2', (d) => (d.target as SimNode).y!);
      linkLines
        .attr('x1', (d) => (d.source as SimNode).x!).attr('y1', (d) => (d.source as SimNode).y!)
        .attr('x2', (d) => (d.target as SimNode).x!).attr('y2', (d) => (d.target as SimNode).y!);
      linkLabels.attr('transform', (d) => {
        const sx = (d.source as SimNode).x!, sy = (d.source as SimNode).y!;
        const tx = (d.target as SimNode).x!, ty = (d.target as SimNode).y!;
        return `translate(${(sx + tx) / 2},${(sy + ty) / 2})`;
      });
      linkLabels.each(function () {
        const grp = d3.select(this);
        const txt = grp.select('text').node() as SVGTextElement;
        if (txt) {
          const b = txt.getBBox();
          grp.select('rect').attr('x', b.x - 4).attr('y', b.y - 2).attr('width', b.width + 8).attr('height', b.height + 4);
        }
      });
      statusDots
        .attr('cx', (d) => (d.source as SimNode).x! + ((d.target as SimNode).x! - (d.source as SimNode).x!) * 0.3)
        .attr('cy', (d) => (d.source as SimNode).y! + ((d.target as SimNode).y! - (d.source as SimNode).y!) * 0.3);
      nodeGs.attr('transform', (d) => `translate(${d.x},${d.y})`);
    });

    return () => { simulation.stop(); };
  }, [nodes, links, dimensions]);

  useEffect(() => {
    const cleanup = renderGraph();
    return () => cleanup?.();
  }, [renderGraph]);

  // ── Mode UI info ──
  const modeInfo: Record<BuilderMode, string> = {
    select: 'Click nodes to view properties · Drag to move · Scroll to zoom',
    addSwitch: 'Click on the canvas to place a new switch (OVS bridge)',
    addHost: 'Click on the canvas to place a new virtual host',
    addLink: linkSource ? `Click target node to link with "${linkSource.name}"` : 'Click a node as the link source, then click the target',
    delete: 'Click a node or link to delete it',
  };

  const modeColor: Record<BuilderMode, string> = {
    select: '#64748b', addSwitch: '#3b82f6', addHost: '#a78bfa', addLink: '#f59e0b', delete: '#ef4444',
  };

  const toolbarBtns: { mode: BuilderMode; icon: string; label: string; color: string }[] = [
    { mode: 'select', icon: '🖱', label: 'Select', color: '#64748b' },
    { mode: 'addSwitch', icon: '⬡', label: 'Add Switch', color: '#3b82f6' },
    { mode: 'addHost', icon: '◉', label: 'Add Host', color: '#a78bfa' },
    { mode: 'addLink', icon: '🔗', label: 'Add Link', color: '#f59e0b' },
    { mode: 'delete', icon: '🗑', label: 'Delete', color: '#ef4444' },
  ];

  // ── Auto-layout: arrange nodes in layered rows by type ──
  const handleAutoLayout = useCallback(() => {
    const layerOrder: Record<string, number> = { network: 0, router: 1, switch: 2, host: 3 };
    const layerY: Record<number, number> = { 0: 80, 1: 220, 2: 360, 3: 500 };
    const w = dimensions.width;

    // Group nodes by layer
    const layers: Record<number, typeof nodes> = {};
    for (const n of nodes) {
      const layer = layerOrder[n.type] ?? 3;
      (layers[layer] ??= []).push(n);
    }

    const newPositions: Record<string, { x: number; y: number }> = {};
    for (const [layerStr, group] of Object.entries(layers)) {
      const y = layerY[Number(layerStr)] ?? 400;
      const count = group.length;
      const spacing = Math.min(180, (w - 100) / Math.max(count, 1));
      const startX = w / 2 - ((count - 1) * spacing) / 2;
      group.forEach((n, i) => {
        newPositions[n.id] = { x: startX + i * spacing, y };
      });
    }

    // Update cache optimistically so D3 re-renders immediately
    qc.setQueryData(['topology'], (old: Topology | undefined) => {
      if (!old) return old;
      return {
        ...old,
        nodes: old.nodes.map(n => {
          const pos = newPositions[n.id];
          return pos ? { ...n, metadata: { ...n.metadata, x: pos.x, y: pos.y } } : n;
        }),
      };
    });

    flash('Layout adjusted');
  }, [nodes, dimensions.width, qc, flash]);

  /* ═══════════ RENDER ═══════════ */
  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>🌐 Network Topology Builder</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={handleAutoLayout} title="Auto-arrange nodes by type layer"
            style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, cursor: 'pointer', background: 'linear-gradient(135deg, #3b82f622, #a78bfa22)', border: '1px solid rgba(139,92,246,0.3)', color: '#a78bfa', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
            🏗️ Auto Layout
          </button>
          <button onClick={() => refreshMut.mutate()} disabled={refreshMut.isPending}
            style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, cursor: 'pointer', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', color: 'var(--color-text)', opacity: refreshMut.isPending ? 0.5 : 1 }}>
            {refreshMut.isPending ? '↻ Refreshing…' : '↻ Refresh'}
          </button>
          {Object.entries(NODE_COLORS).map(([type, color]) => (
            <span key={type} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
              <span style={{ color: 'var(--color-text-muted)', textTransform: 'capitalize' }}>{type}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, padding: '6px 8px', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {toolbarBtns.map((btn) => (
          <button key={btn.mode}
            onClick={() => { setMode(btn.mode); setLinkSource(null); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all .15s',
              background: mode === btn.mode ? btn.color + '22' : 'transparent',
              border: mode === btn.mode ? `2px solid ${btn.color}` : '2px solid transparent',
              color: mode === btn.mode ? btn.color : 'var(--color-text-muted)',
            }}>
            <span style={{ fontSize: 15 }}>{btn.icon}</span>{btn.label}
          </button>
        ))}
        <div style={{ width: 1, height: 28, background: 'var(--color-border)', margin: '0 8px' }} />
        <span style={{ fontSize: 12, color: modeColor[mode], fontWeight: 500, flex: 1, minWidth: 200 }}>{modeInfo[mode]}</span>
        {mode !== 'select' && (
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', padding: '4px 8px', background: 'rgba(255,255,255,0.05)', borderRadius: 6 }}>ESC to cancel</span>
        )}
      </div>

      {topology.isLoading && <SkeletonCard count={1} />}
      {topology.isError && <ErrorBanner message="Failed to load topology data." />}

      {/* Main: Graph + Properties */}
      <div style={{ display: 'flex', gap: 16 }}>
        {/* Canvas */}
        <div ref={containerRef} className="fade-in"
          style={{
            flex: 1, position: 'relative', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
            borderRadius: 12, overflow: 'hidden', height: 560,
            cursor: mode === 'addSwitch' || mode === 'addHost' ? 'crosshair' : mode === 'delete' ? 'not-allowed' : 'default',
          }}>
          {/* Grid */}
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.03) 1px, transparent 0)', backgroundSize: '30px 30px', pointerEvents: 'none' }} />
          {/* Mode banner */}
          {mode !== 'select' && (
            <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', padding: '6px 18px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: modeColor[mode] + '20', border: `1px solid ${modeColor[mode]}44`, color: modeColor[mode], zIndex: 10, backdropFilter: 'blur(8px)', whiteSpace: 'nowrap' }}>
              {mode === 'addSwitch' && '🔨 Click canvas to place Switch'}
              {mode === 'addHost' && '🔨 Click canvas to place Host'}
              {mode === 'addLink' && (linkSource ? `🔗 Click target → link with "${linkSource.name}"` : '🔗 Click source node')}
              {mode === 'delete' && '🗑️ Click a node or link to delete'}
            </div>
          )}
          {/* Empty */}
          {nodes.length === 0 && !topology.isLoading && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: 'var(--color-text-muted)', gap: 8 }}>
              <span style={{ fontSize: 48, opacity: 0.3 }}>🌐</span>
              <span style={{ fontSize: 15, fontWeight: 600 }}>Empty topology</span>
              <span style={{ fontSize: 12 }}>Use the toolbar to add switches and hosts, or click Refresh</span>
            </div>
          )}
          <svg ref={svgRef} width={dimensions.width} height={dimensions.height} style={{ display: 'block', width: '100%', height: '100%' }} />

          {/* Tooltip */}
          {tooltip && (
            <div style={{ position: 'absolute', left: tooltip.x, top: tooltip.y, background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#e2e8f0', pointerEvents: 'none', zIndex: 10, minWidth: 160, backdropFilter: 'blur(8px)', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: NODE_COLORS[tooltip.node.type] ?? '#94a3b8', display: 'inline-block' }} />
                {tooltip.node.name}
              </div>
              <div style={{ color: '#94a3b8', lineHeight: 1.8 }}>
                <div><b>Type:</b> <span style={{ textTransform: 'capitalize' }}>{tooltip.node.type}</span></div>
                {tooltip.node.dpid && <div><b>DPID:</b> <span style={{ fontFamily: 'monospace' }}>{tooltip.node.dpid}</span></div>}
                {tooltip.node.metadata.ip != null && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <b>IP/Subnet:</b>
                    <span style={{ fontFamily: 'monospace', color: '#38bdf8' }}>{String(tooltip.node.metadata.ip)}</span>
                  </div>
                )}
                {tooltip.node.metadata.gateway != null && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <b>Gateway:</b>
                    <span style={{ fontFamily: 'monospace', color: '#34d399' }}>{String(tooltip.node.metadata.gateway)}</span>
                  </div>
                )}
                {tooltip.node.metadata.bridge != null && <div><b>Bridge:</b> {String(tooltip.node.metadata.bridge)}</div>}
                {tooltip.node.type === 'host' && !tooltip.node.metadata.ip && (
                  <div style={{ color: '#f59e0b', fontStyle: 'italic', fontSize: 11 }}>No IP assigned</div>
                )}
              </div>
            </div>
          )}

          {/* Stats */}
          <div style={{ position: 'absolute', bottom: 12, left: 12, background: 'rgba(15,23,42,0.8)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '6px 12px', fontSize: 11, color: 'var(--color-text-muted)', display: 'flex', gap: 16 }}>
            <span>Nodes: <b style={{ color: 'var(--color-text)' }}>{nodes.length}</b></span>
            <span>Links: <b style={{ color: 'var(--color-text)' }}>{links.length}</b></span>
            <span>Up: <b style={{ color: '#22c55e' }}>{links.filter((l) => l.status === 'up').length}</b></span>
            <span>Down: <b style={{ color: '#ef4444' }}>{links.filter((l) => l.status === 'down').length}</b></span>
          </div>
        </div>

        {/* Properties Panel */}
        <div style={{ width: 280, flexShrink: 0, background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 16, overflow: 'auto', maxHeight: 560 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>📋 Properties</h3>
          {!propertiesNode ? (
            <div style={{ color: 'var(--color-text-muted)', fontSize: 12, textAlign: 'center', padding: '40px 0' }}>
              <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.3 }}>🔍</div>
              Select a node to view its properties
            </div>
          ) : (
            <div style={{ fontSize: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, padding: '10px 12px', background: (NODE_COLORS[propertiesNode.type] ?? '#94a3b8') + '15', borderRadius: 8, border: `1px solid ${NODE_COLORS[propertiesNode.type] ?? '#94a3b8'}33` }}>
                <span style={{ fontSize: 22 }}>{NODE_LABELS[propertiesNode.type] ?? '●'}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-text)' }}>{propertiesNode.name}</div>
                  <div style={{ color: 'var(--color-text-muted)', textTransform: 'capitalize' }}>{propertiesNode.type}</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <PropRow label="ID" value={propertiesNode.id} />
                <PropRow label="Type" value={propertiesNode.type} />
                <PropRow label="Name" value={propertiesNode.name} />
                {propertiesNode.dpid && <PropRow label="DPID" value={propertiesNode.dpid} mono />}
                {Object.entries(propertiesNode.metadata).map(([k, v]) =>
                  v != null ? <PropRow key={k} label={k} value={String(v)} /> : null
                )}
              </div>
              {/* Connected Links */}
              <div style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--color-text-muted)' }}>Connected Links</div>
                {links.filter(l => l.source === propertiesNode.id || l.target === propertiesNode.id).length === 0 ? (
                  <div style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>No connections</div>
                ) : (
                  links.filter(l => l.source === propertiesNode.id || l.target === propertiesNode.id).map(l => (
                    <div key={l.id} style={{ padding: '4px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 4, marginBottom: 4, fontSize: 11 }}>
                      <span style={{ color: l.status === 'up' ? '#22c55e' : '#ef4444', fontWeight: 700 }}>●</span>{' '}
                      {l.source} ↔ {l.target}
                      <span style={{ color: 'var(--color-text-muted)', marginLeft: 4 }}>{l.source_port}↔{l.target_port}</span>
                    </div>
                  ))
                )}
              </div>
              {/* Delete button */}
              {(propertiesNode.type === 'switch' || propertiesNode.type === 'host') && (
                <div style={{ marginTop: 16 }}>
                  <button
                    onClick={() => {
                      const name = propertiesNode.type === 'host' ? propertiesNode.name.replace('-veth', '') : propertiesNode.name;
                      if (confirm(`Delete ${propertiesNode.type} "${name}"?`)) {
                        if (propertiesNode.type === 'switch') deleteSwitchMut.mutate(name);
                        else deleteHostMut.mutate(name);
                      }
                    }}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: '#ef444420', border: '1px solid #ef444444', color: '#ef4444' }}>
                    🗑 Delete {propertiesNode.type}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Node & Link Tables */}
      {nodes.length > 0 && (
        <div className="fade-in" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 16 }}>
          <div style={{ flex: '1 1 250px', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 20 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Nodes ({nodes.length})</h3>
            {nodes.map((n) => (
              <div key={n.id}
                onClick={() => setPropertiesNode({ id: n.id, type: n.type, name: n.name, dpid: n.dpid, metadata: n.metadata })}
                style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--color-border)', fontSize: 13, cursor: 'pointer' }}>
                <span>{NODE_ICONS[n.type]}</span>
                <span style={{ fontWeight: 500 }}>{n.name}</span>
                <span style={{ color: 'var(--color-text-muted)', marginLeft: 'auto' }}>{n.type}</span>
              </div>
            ))}
          </div>
          <div style={{ flex: '2 1 350px', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 20 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Links ({links.length})</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
                  <th style={{ padding: 6 }}>Source</th>
                  <th style={{ padding: 6 }}>Target</th>
                  <th style={{ padding: 6 }}>Ports</th>
                  <th style={{ padding: 6 }}>BW</th>
                  <th style={{ padding: 6 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {links.map((l) => (
                  <tr key={l.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: 6 }}>{l.source}</td>
                    <td style={{ padding: 6 }}>{l.target}</td>
                    <td style={{ padding: 6, fontFamily: 'monospace', fontSize: 11 }}>{l.source_port}↔{l.target_port}</td>
                    <td style={{ padding: 6 }}>{l.bandwidth ? `${l.bandwidth}M` : '-'}</td>
                    <td style={{ padding: 6, color: l.status === 'up' ? 'var(--color-success)' : 'var(--color-danger)', fontWeight: 600 }}>
                      {l.status === 'up' ? '● Up' : '○ Down'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 100,
          padding: '12px 24px', borderRadius: 10, fontSize: 13, fontWeight: 600,
          background: toast.type === 'ok' ? '#22c55e20' : '#ef444420',
          border: `1px solid ${toast.type === 'ok' ? '#22c55e' : '#ef4444'}44`,
          color: toast.type === 'ok' ? '#22c55e' : '#ef4444',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)', backdropFilter: 'blur(12px)',
        }}>
          {toast.type === 'ok' ? '✓ ' : '✗ '}{toast.msg}
        </div>
      )}

      {/* Create Switch Dialog */}
      {showSwitchDialog && (
        <DialogOverlay onClose={() => { setShowSwitchDialog(false); setPendingPosition(null); }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>
            <span style={{ color: '#3b82f6' }}>⬡</span> Create Switch (OVS Bridge)
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <FieldLabel label="Bridge Name *">
              <input autoFocus value={switchForm.name}
                onChange={(e) => setSwitchForm({ ...switchForm, name: e.target.value })}
                placeholder="e.g. br-core" style={inputStyle}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateSwitch()} />
            </FieldLabel>
            <FieldLabel label="OpenFlow Protocol">
              <select value={switchForm.protocols}
                onChange={(e) => setSwitchForm({ ...switchForm, protocols: e.target.value })}
                style={inputStyle}>
                <option value="OpenFlow13">OpenFlow 1.3</option>
                <option value="OpenFlow10">OpenFlow 1.0</option>
                <option value="OpenFlow15">OpenFlow 1.5</option>
              </select>
            </FieldLabel>
            <FieldLabel label="SDN Controller (optional)">
              <input value={switchForm.controller}
                onChange={(e) => setSwitchForm({ ...switchForm, controller: e.target.value })}
                placeholder="e.g. 127.0.0.1:6653" style={inputStyle} />
            </FieldLabel>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
            <button onClick={() => { setShowSwitchDialog(false); setPendingPosition(null); }} style={cancelBtnStyle}>Cancel</button>
            <button onClick={handleCreateSwitch}
              disabled={!switchForm.name.trim() || createSwitchMut.isPending}
              style={{ ...primaryBtnStyle, background: '#3b82f6', opacity: !switchForm.name.trim() ? 0.4 : 1 }}>
              {createSwitchMut.isPending ? 'Creating…' : 'Create Switch'}
            </button>
          </div>
        </DialogOverlay>
      )}

      {/* Create Host Dialog */}
      {showHostDialog && (
        <DialogOverlay onClose={() => { setShowHostDialog(false); setPendingPosition(null); }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>
            <span style={{ color: '#a78bfa' }}>◉</span> Create Virtual Host
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <FieldLabel label="Host Name *">
              <input autoFocus value={hostForm.name}
                onChange={(e) => setHostForm({ ...hostForm, name: e.target.value })}
                placeholder="e.g. pc1" style={inputStyle}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateHost()} />
            </FieldLabel>
            <FieldLabel label="IP Address (CIDR, optional)">
              <input value={hostForm.ip}
                onChange={(e) => setHostForm({ ...hostForm, ip: e.target.value })}
                placeholder="e.g. 10.10.1.2/24" style={inputStyle} />
            </FieldLabel>
            <FieldLabel label="Default Gateway (optional)">
              <input value={hostForm.gateway}
                onChange={(e) => setHostForm({ ...hostForm, gateway: e.target.value })}
                placeholder="e.g. 10.10.1.1" style={inputStyle} />
            </FieldLabel>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
            <button onClick={() => { setShowHostDialog(false); setPendingPosition(null); }} style={cancelBtnStyle}>Cancel</button>
            <button onClick={handleCreateHost}
              disabled={!hostForm.name.trim() || createHostMut.isPending}
              style={{ ...primaryBtnStyle, background: '#a78bfa', opacity: !hostForm.name.trim() ? 0.4 : 1 }}>
              {createHostMut.isPending ? 'Creating…' : 'Create Host'}
            </button>
          </div>
        </DialogOverlay>
      )}
    </div>
  );
}

/* ── Sub-components ── */

function PropRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span style={{ color: 'var(--color-text-muted)', fontWeight: 500, textTransform: 'capitalize' }}>{label}</span>
      <span style={{ color: 'var(--color-text)', fontFamily: mono ? 'monospace' : 'inherit', fontSize: 11, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>
        {value}
      </span>
    </div>
  );
}

function DialogOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      <div style={{ background: 'var(--color-bg-card, #1e293b)', border: '1px solid var(--color-border, #334155)', borderRadius: 14, padding: 24, minWidth: 360, maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}
        onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ fontSize: 12 }}>
      <span style={{ color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  );
}

/* ── Shared styles ── */

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13,
  background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border, #334155)',
  color: 'var(--color-text, #e2e8f0)', outline: 'none', boxSizing: 'border-box',
};

const cancelBtnStyle: React.CSSProperties = {
  padding: '8px 18px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
  background: 'transparent', border: '1px solid var(--color-border, #334155)',
  color: 'var(--color-text-muted)', fontWeight: 500,
};

const primaryBtnStyle: React.CSSProperties = {
  padding: '8px 18px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
  border: 'none', color: '#fff', fontWeight: 600,
};
