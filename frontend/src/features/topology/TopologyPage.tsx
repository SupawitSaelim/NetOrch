import { useQuery } from '@tanstack/react-query';
import { getTopology } from '../../api/endpoints';
import { SkeletonCard, ErrorBanner, EmptyState } from '../../components/Shared';
import { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';

/* ═══════════════════════════════════════════════════════════════
   Interactive Force-Directed Network Topology (D3.js)
   ═══════════════════════════════════════════════════════════════ */

const NODE_COLORS: Record<string, string> = {
  switch: '#3b82f6',
  router: '#22c55e',
  host: '#a78bfa',
  network: '#f59e0b',
};

const NODE_ICONS: Record<string, string> = {
  switch: '\u0042',  // placeholder - we use text
  router: '\u0052',
  host: '\u0048',
  network: '\u004e',
};

const NODE_LABELS: Record<string, string> = {
  switch: '⬡',
  router: '⬢',
  host: '◉',
  network: '◎',
};

// D3 simulation node/link types
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

export default function TopologyPage() {
  const topology = useQuery({
    queryKey: ['topology'],
    queryFn: () => getTopology().then((r) => r.data),
    refetchInterval: 30_000,
  });

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; node: SimNode } | null>(null);
  const [dimensions, setDimensions] = useState({ width: 900, height: 520 });

  const nodes = topology.data?.nodes ?? [];
  const links = topology.data?.links ?? [];

  // Track container size
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({ width, height: Math.max(height, 450) });
        }
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Main D3 force simulation
  const renderGraph = useCallback(() => {
    if (!svgRef.current || nodes.length === 0) return;
    const svgEl = svgRef.current;
    const svg = d3.select(svgEl);

    svg.selectAll('*').remove();

    const { width, height } = dimensions;

    // Prepare data (deep copy for D3 mutation)
    const simNodes: SimNode[] = nodes.map((n) => ({
      id: n.id,
      type: n.type,
      name: n.name,
      dpid: n.dpid,
      metadata: n.metadata,
      x: (n.metadata.x as number) ?? width / 2 + (Math.random() - 0.5) * 200,
      y: (n.metadata.y as number) ?? height / 2 + (Math.random() - 0.5) * 200,
    }));

    const simLinks: SimLink[] = links.map((l) => ({
      id: l.id,
      source: l.source,
      target: l.target,
      source_port: l.source_port,
      target_port: l.target_port,
      bandwidth: l.bandwidth,
      status: l.status,
    }));

    // ── Definitions (gradients, markers, filters) ──
    const defs = svg.append('defs');

    // Glow filter
    const filter = defs.append('filter').attr('id', 'glow').attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%');
    filter.append('feGaussianBlur').attr('stdDeviation', '4').attr('result', 'blur');
    filter.append('feComposite').attr('in', 'SourceGraphic').attr('in2', 'blur').attr('operator', 'over');

    // Arrow marker for links
    defs.append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 32)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#475569');

    // Animated dash pattern
    defs.append('style').text(`
      @keyframes dash-flow {
        to { stroke-dashoffset: -20; }
      }
      .link-animated {
        animation: dash-flow 0.8s linear infinite;
      }
    `);

    // ── Zoom behavior ──
    const g = svg.append('g');

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom as any);
    svg.call(zoom.transform as any, d3.zoomIdentity.translate(width * 0.1, height * 0.05).scale(0.85));

    // ── Force simulation ──
    const simulation = d3.forceSimulation(simNodes)
      .force('link', d3.forceLink<SimNode, SimLink>(simLinks).id((d) => d.id).distance(140).strength(0.4))
      .force('charge', d3.forceManyBody().strength(-600))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(50))
      .force('x', d3.forceX(width / 2).strength(0.04))
      .force('y', d3.forceY(height / 2).strength(0.04));

    // ── Links ──
    const linkGroup = g.append('g').attr('class', 'links');

    // Shadow line for glow effect
    linkGroup.selectAll('.link-glow')
      .data(simLinks)
      .join('line')
      .attr('class', 'link-glow')
      .attr('stroke', (d) => d.status === 'up' ? '#3b82f6' : '#ef4444')
      .attr('stroke-width', 6)
      .attr('stroke-opacity', 0.15)
      .attr('stroke-linecap', 'round');

    // Main link line
    const linkLines = linkGroup.selectAll('.link-line')
      .data(simLinks)
      .join('line')
      .attr('class', (d) => `link-line ${d.status === 'up' ? 'link-animated' : ''}`)
      .attr('stroke', (d) => d.status === 'up' ? '#475569' : '#ef4444')
      .attr('stroke-width', 2.5)
      .attr('stroke-dasharray', (d) => d.status === 'up' ? '8,4' : '5,5')
      .attr('stroke-linecap', 'round')
      .attr('marker-end', 'url(#arrowhead)');

    // Link labels (port info)
    const linkLabels = linkGroup.selectAll('.link-label')
      .data(simLinks)
      .join('g')
      .attr('class', 'link-label');

    linkLabels.append('rect')
      .attr('rx', 4)
      .attr('ry', 4)
      .attr('fill', 'var(--color-bg-card, #1e293b)')
      .attr('stroke', 'var(--color-border, #334155)')
      .attr('stroke-width', 0.5)
      .attr('opacity', 0.9);

    linkLabels.append('text')
      .text((d) => `${d.source_port}↔${d.target_port}`)
      .attr('fill', '#94a3b8')
      .attr('font-size', 9)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('font-family', 'monospace');

    // Status indicator on links
    const statusDots = linkGroup.selectAll('.status-dot')
      .data(simLinks)
      .join('circle')
      .attr('class', 'status-dot')
      .attr('r', 4)
      .attr('fill', (d) => d.status === 'up' ? '#22c55e' : '#ef4444')
      .attr('stroke', '#0f172a')
      .attr('stroke-width', 1.5);

    // ── Nodes ──
    const nodeGroup = g.append('g').attr('class', 'nodes');

    const nodeGs = nodeGroup.selectAll('.node')
      .data(simNodes)
      .join('g')
      .attr('class', 'node')
      .style('cursor', 'grab');

    // Outer glow ring
    nodeGs.append('circle')
      .attr('r', 30)
      .attr('fill', (d) => NODE_COLORS[d.type] ?? '#94a3b8')
      .attr('opacity', 0.1)
      .attr('filter', 'url(#glow)');

    // Outer ring
    nodeGs.append('circle')
      .attr('r', 25)
      .attr('fill', 'none')
      .attr('stroke', (d) => NODE_COLORS[d.type] ?? '#94a3b8')
      .attr('stroke-width', 2)
      .attr('stroke-opacity', 0.4)
      .attr('stroke-dasharray', '4,3');

    // Main circle
    nodeGs.append('circle')
      .attr('r', 20)
      .attr('fill', (d) => NODE_COLORS[d.type] ?? '#94a3b8')
      .attr('stroke', (d) => d3.color(NODE_COLORS[d.type] ?? '#94a3b8')!.brighter(0.5).formatHex())
      .attr('stroke-width', 2);

    // Icon text
    nodeGs.append('text')
      .text((d) => NODE_LABELS[d.type] ?? '●')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-size', 16)
      .attr('fill', '#fff')
      .attr('pointer-events', 'none');

    // Name label
    nodeGs.append('text')
      .text((d) => d.name)
      .attr('dy', 38)
      .attr('text-anchor', 'middle')
      .attr('fill', '#e2e8f0')
      .attr('font-size', 12)
      .attr('font-weight', 600)
      .attr('pointer-events', 'none');

    // Type label
    nodeGs.append('text')
      .text((d) => d.type)
      .attr('dy', 52)
      .attr('text-anchor', 'middle')
      .attr('fill', '#64748b')
      .attr('font-size', 10)
      .attr('pointer-events', 'none');

    // ── Drag behavior ──
    const drag = d3.drag<SVGGElement, SimNode>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
        d3.select(event.sourceEvent.target.closest('.node')).style('cursor', 'grabbing');
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
        d3.select(event.sourceEvent.target.closest('.node')).style('cursor', 'grab');
      });

    nodeGs.call(drag as any);

    // ── Hover tooltip ──
    nodeGs
      .on('mouseenter', (event, d) => {
        const [x, y] = d3.pointer(event, svgRef.current);
        setTooltip({ x: x + 15, y: y - 10, node: d });

        // Highlight connected links
        linkLines.attr('stroke-opacity', (l) => {
          const src = typeof l.source === 'object' ? (l.source as SimNode).id : l.source;
          const tgt = typeof l.target === 'object' ? (l.target as SimNode).id : l.target;
          return src === d.id || tgt === d.id ? 1 : 0.15;
        });

        // Dim other nodes
        nodeGs.attr('opacity', (n) => {
          if (n.id === d.id) return 1;
          const connected = simLinks.some((l) => {
            const src = typeof l.source === 'object' ? (l.source as SimNode).id : l.source;
            const tgt = typeof l.target === 'object' ? (l.target as SimNode).id : l.target;
            return (src === d.id && tgt === n.id) || (tgt === d.id && src === n.id);
          });
          return connected ? 1 : 0.25;
        });
      })
      .on('mouseleave', () => {
        setTooltip(null);
        linkLines.attr('stroke-opacity', 1);
        nodeGs.attr('opacity', 1);
      });

    // ── Tick: update positions ──
    simulation.on('tick', () => {
      // Update glow lines
      linkGroup.selectAll<SVGLineElement, SimLink>('.link-glow')
        .attr('x1', (d) => (d.source as SimNode).x!)
        .attr('y1', (d) => (d.source as SimNode).y!)
        .attr('x2', (d) => (d.target as SimNode).x!)
        .attr('y2', (d) => (d.target as SimNode).y!);

      // Update main lines
      linkLines
        .attr('x1', (d) => (d.source as SimNode).x!)
        .attr('y1', (d) => (d.source as SimNode).y!)
        .attr('x2', (d) => (d.target as SimNode).x!)
        .attr('y2', (d) => (d.target as SimNode).y!);

      // Update link labels
      linkLabels.attr('transform', (d) => {
        const sx = (d.source as SimNode).x!;
        const sy = (d.source as SimNode).y!;
        const tx = (d.target as SimNode).x!;
        const ty = (d.target as SimNode).y!;
        return `translate(${(sx + tx) / 2},${(sy + ty) / 2})`;
      });

      // Resize label background rects
      linkLabels.each(function () {
        const g = d3.select(this);
        const text = g.select('text').node() as SVGTextElement;
        if (text) {
          const bbox = text.getBBox();
          g.select('rect')
            .attr('x', bbox.x - 4)
            .attr('y', bbox.y - 2)
            .attr('width', bbox.width + 8)
            .attr('height', bbox.height + 4);
        }
      });

      // Update status dots (at 30% along the link)
      statusDots
        .attr('cx', (d) => {
          const sx = (d.source as SimNode).x!;
          const tx = (d.target as SimNode).x!;
          return sx + (tx - sx) * 0.3;
        })
        .attr('cy', (d) => {
          const sy = (d.source as SimNode).y!;
          const ty = (d.target as SimNode).y!;
          return sy + (ty - sy) * 0.3;
        });

      // Update nodes
      nodeGs.attr('transform', (d) => `translate(${d.x},${d.y})`);
    });

    // Cleanup
    return () => {
      simulation.stop();
    };
  }, [nodes, links, dimensions]);

  useEffect(() => {
    const cleanup = renderGraph();
    return () => cleanup?.();
  }, [renderGraph]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Network Topology</h2>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', fontSize: 12 }}>
          {Object.entries(NODE_COLORS).map(([type, color]) => (
            <span key={type} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block' }} />
              <span style={{ color: 'var(--color-text-muted)', textTransform: 'capitalize' }}>{type}</span>
            </span>
          ))}
          <span style={{ color: 'var(--color-text-muted)', marginLeft: 8 }}>
            Scroll: zoom · Drag: move nodes · Hover: details
          </span>
        </div>
      </div>

      {topology.isLoading && <SkeletonCard count={1} />}
      {topology.isError && <ErrorBanner message="Failed to load topology data." />}
      {!topology.isLoading && !topology.isError && nodes.length === 0 && (
        <EmptyState icon="🌐" title="No topology data" description="Waiting for OVS/FRR discovery..." />
      )}

      {/* Force-directed graph */}
      {nodes.length > 0 && (
        <div
          ref={containerRef}
          className="fade-in"
          style={{
            position: 'relative',
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 12,
            marginBottom: 24,
            overflow: 'hidden',
            height: 520,
          }}
        >
          {/* Grid background */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `
                radial-gradient(circle at 1px 1px, rgba(255,255,255,0.03) 1px, transparent 0)
              `,
              backgroundSize: '30px 30px',
              pointerEvents: 'none',
            }}
          />

          <svg
            ref={svgRef}
            width={dimensions.width}
            height={dimensions.height}
            style={{ display: 'block', width: '100%', height: '100%' }}
          />

          {/* Tooltip */}
          {tooltip && (
            <div
              style={{
                position: 'absolute',
                left: tooltip.x,
                top: tooltip.y,
                background: 'rgba(15,23,42,0.95)',
                border: '1px solid rgba(59,130,246,0.3)',
                borderRadius: 8,
                padding: '10px 14px',
                fontSize: 12,
                color: '#e2e8f0',
                pointerEvents: 'none',
                zIndex: 10,
                minWidth: 160,
                backdropFilter: 'blur(8px)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: NODE_COLORS[tooltip.node.type] ?? '#94a3b8',
                    display: 'inline-block',
                  }}
                />
                {tooltip.node.name}
              </div>
              <div style={{ color: '#94a3b8', lineHeight: 1.8 }}>
                <div><b>Type:</b> <span style={{ textTransform: 'capitalize' }}>{tooltip.node.type}</span></div>
                {tooltip.node.dpid && <div><b>DPID:</b> <span style={{ fontFamily: 'monospace' }}>{tooltip.node.dpid}</span></div>}
                {tooltip.node.metadata.ip != null && <div><b>IP:</b> {String(tooltip.node.metadata.ip)}</div>}
                {tooltip.node.metadata.bridge != null && <div><b>Bridge:</b> {String(tooltip.node.metadata.bridge)}</div>}
                {tooltip.node.metadata.interfaces != null && <div><b>Interfaces:</b> {String(tooltip.node.metadata.interfaces)}</div>}
              </div>
            </div>
          )}

          {/* Stats overlay */}
          <div
            style={{
              position: 'absolute',
              bottom: 12,
              left: 12,
              background: 'rgba(15,23,42,0.8)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              padding: '6px 12px',
              fontSize: 11,
              color: 'var(--color-text-muted)',
              display: 'flex',
              gap: 16,
            }}
          >
            <span>Nodes: <b style={{ color: 'var(--color-text)' }}>{nodes.length}</b></span>
            <span>Links: <b style={{ color: 'var(--color-text)' }}>{links.length}</b></span>
            <span>Up: <b style={{ color: '#22c55e' }}>{links.filter((l) => l.status === 'up').length}</b></span>
            <span>Down: <b style={{ color: '#ef4444' }}>{links.filter((l) => l.status === 'down').length}</b></span>
          </div>
        </div>
      )}

      {/* Node & Link tables */}
      {nodes.length > 0 && (
      <div className="fade-in" style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div
          style={{
            flex: '1 1 250px',
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 12,
            padding: 20,
          }}
        >
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Nodes ({nodes.length})</h3>
          {nodes.map((n) => (
            <div
              key={n.id}
              style={{
                display: 'flex',
                gap: 8,
                padding: '6px 0',
                borderBottom: '1px solid var(--color-border)',
                fontSize: 13,
              }}
            >
              <span>{NODE_ICONS[n.type]}</span>
              <span style={{ fontWeight: 500 }}>{n.name}</span>
              <span style={{ color: 'var(--color-text-muted)', marginLeft: 'auto' }}>{n.type}</span>
            </div>
          ))}
        </div>

        <div
          style={{
            flex: '2 1 350px',
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 12,
            padding: 20,
          }}
        >
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
                  <td style={{ padding: 6, fontFamily: 'monospace', fontSize: 11 }}>
                    {l.source_port}↔{l.target_port}
                  </td>
                  <td style={{ padding: 6 }}>{l.bandwidth ? `${l.bandwidth}M` : '-'}</td>
                  <td
                    style={{
                      padding: 6,
                      color: l.status === 'up' ? 'var(--color-success)' : 'var(--color-danger)',
                      fontWeight: 600,
                    }}
                  >
                    {l.status === 'up' ? '● Up' : '○ Down'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </div>
  );
}
