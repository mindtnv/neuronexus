// NeuroNexus — Graph with node hover mini-card tooltip

const HOVER_NODES = [
  { id: 'g4',  label: 'der Nachbar',      back: 'the neighbor',       deck: 'German',   color: 'amber',  mastery: 0.91, links: 7,  cx: 0.28, cy: 0.38 },
  { id: 's2',  label: 'CAP theorem',      back: 'consistency tradeoff', deck: 'Systems', color: 'violet', mastery: 0.76, links: 11, cx: 0.64, cy: 0.32 },
  { id: 'r1',  label: 'HashMap::entry',   back: 'in-place mutation',  deck: 'Rust',     color: 'sky',    mastery: 0.55, links: 4,  cx: 0.72, cy: 0.66 },
  { id: 'b3',  label: 'Sunk cost fallacy',back: 'past cost bias',     deck: 'Biases',   color: 'rose',   mastery: 0.88, links: 6,  cx: 0.32, cy: 0.72 },
  { id: 'c0',  label: 'Merkle tree',      back: 'hash tree structure',deck: 'Crypto',   color: 'lime',   mastery: 0.44, links: 8,  cx: 0.5,  cy: 0.5  },
];

const MasteryBar = ({ value, color }) => (
  <div style={{ height: 4, background: 'var(--surface-3)', borderRadius: 2, overflow: 'hidden', marginTop: 6 }}>
    <div style={{
      width: `${value * 100}%`, height: '100%',
      background: `var(--${color}-500)`,
      borderRadius: 2,
      transition: 'width 400ms ease',
    }}/>
  </div>
);

const NodeTooltip = ({ node, x, y, containerW, containerH }) => {
  const W = 220, H = 130;
  // Flip left if too close to right edge
  const left = x + 16 + W > containerW ? x - W - 12 : x + 16;
  const top  = Math.min(Math.max(y - H / 2, 8), containerH - H - 8);

  return (
    <div style={{
      position: 'absolute',
      left, top,
      width: W,
      background: 'var(--surface)',
      border: `1px solid var(--${node.color}-500)`,
      borderRadius: 14,
      padding: '14px 16px',
      boxShadow: `var(--shadow-lg), 0 0 0 1px rgba(0,0,0,0.3)`,
      pointerEvents: 'none',
      zIndex: 20,
      animation: 'node-pop 140ms cubic-bezier(.34,1.4,.64,1)',
    }}>
      <style>{`@keyframes node-pop { from { transform: scale(0.88); opacity: 0; } to { transform: scale(1); opacity: 1; } }`}</style>

      {/* Deck badge */}
      <div style={{ marginBottom: 8 }}>
        <NNBadge size="xs" tone={node.color}>{node.deck}</NNBadge>
      </div>

      {/* Front */}
      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 20, letterSpacing: -0.4, lineHeight: 1.2, marginBottom: 4 }}>
        {node.label}
      </div>

      {/* Back */}
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
        {node.back}
      </div>

      {/* Mastery */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--text-dim)' }}>
        <span>mastery</span>
        <span className="mono" style={{ color: `var(--${node.color}-400)` }}>{Math.round(node.mastery * 100)}%</span>
      </div>
      <MasteryBar value={node.mastery} color={node.color}/>

      {/* Links count */}
      <div style={{ marginTop: 8, fontSize: 10.5, color: 'var(--text-dim)' }}>
        {node.links} linked nodes
      </div>
    </div>
  );
};

const NNGraphWithHover = () => {
  const { nodes, clusters, W, H } = makeGraph(1);
  const [hovered, setHovered] = React.useState(null);
  const [mousePos, setMousePos] = React.useState({ x: 0, y: 0 });
  const svgRef = React.useRef(null);
  const containerRef = React.useRef(null);

  // Build edges same as NNGraphForce
  const edges = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (a.cluster === b.cluster && d < 90 && Math.abs(Math.sin(i * j * 0.1)) < 0.35) edges.push([i, j, 0.4]);
      else if (d < 140 && Math.abs(Math.sin(i * j * 0.07)) < 0.015) edges.push([i, j, 0.15]);
    }
  }

  const handleSvgMouseMove = e => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  // Map HOVER_NODES to SVG coordinates for hit targets
  const hoverTargets = HOVER_NODES.map(hn => ({
    ...hn,
    svgX: hn.cx * W,
    svgY: hn.cy * H,
  }));

  return (
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 320px', overflow: 'hidden' }}>
      {/* Canvas */}
      <div
        ref={containerRef}
        style={{ position: 'relative', background: 'var(--ink-950)', overflow: 'hidden' }}
        onMouseMove={handleSvgMouseMove}
      >
        {/* Toolbar */}
        <div style={{
          position: 'absolute', top: 14, left: 14, zIndex: 5,
          display: 'flex', gap: 6, padding: 6,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
        }}>
          <NNBtn size="sm" variant="ghost" active icon="graph">Force</NNBtn>
          <NNBtn size="sm" variant="ghost">Clusters</NNBtn>
          <NNBtn size="sm" variant="ghost">Timeline</NNBtn>
        </div>
        <div style={{ position: 'absolute', top: 14, right: 14, zIndex: 5, display: 'flex', gap: 6 }}>
          <NNBtn size="sm" variant="soft" icon="filter">Filters</NNBtn>
          <NNBtn size="sm" variant="soft" icon="search">Find</NNBtn>
        </div>

        {/* Legend */}
        <div style={{
          position: 'absolute', bottom: 14, left: 14, zIndex: 5,
          padding: '10px 14px', background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: 10,
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <div style={{ fontSize: 10.5, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 }}>Clusters</div>
          {clusters.map(c => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <div style={{ width: 9, height: 9, borderRadius: '50%', background: `var(--${c.color}-500)` }}/>
              <span style={{ color: 'var(--text)' }}>{c.label}</span>
              <span className="mono" style={{ color: 'var(--text-dim)', marginLeft: 'auto', fontSize: 11 }}>{c.n}</span>
            </div>
          ))}
        </div>

        {/* Zoom */}
        <div style={{
          position: 'absolute', bottom: 14, right: 14, zIndex: 5,
          display: 'flex', flexDirection: 'column', background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden',
        }}>
          <NNBtn size="sm" variant="ghost" icon="plus" style={{ borderRadius: 0, borderBottom: '1px solid var(--border)' }}/>
          <div style={{ padding: '6px 10px', textAlign: 'center', fontSize: 11, color: 'var(--text-muted)' }} className="mono">100%</div>
          <NNBtn size="sm" variant="ghost" style={{ borderRadius: 0, borderTop: '1px solid var(--border)' }}>−</NNBtn>
        </div>

        {/* Graph SVG */}
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', height: '100%', display: 'block', cursor: 'crosshair' }}
        >
          <defs>
            {HOVER_NODES.map(hn => (
              <radialGradient key={hn.id} id={`glow-${hn.id}`} cx="50%" cy="50%" r="50%">
                <stop offset="0" stopColor={`var(--${hn.color}-400)`} stopOpacity="0.4"/>
                <stop offset="1" stopColor={`var(--${hn.color}-400)`} stopOpacity="0"/>
              </radialGradient>
            ))}
          </defs>

          {/* Edges */}
          {edges.map(([i, j, op], k) => (
            <line key={k}
              x1={nodes[i].x} y1={nodes[i].y}
              x2={nodes[j].x} y2={nodes[j].y}
              stroke={nodes[i].cluster === nodes[j].cluster ? `var(--${nodes[i].color}-500)` : 'var(--ink-600)'}
              strokeWidth="0.5" opacity={op}
            />
          ))}

          {/* Regular nodes */}
          {nodes.map((n, i) => {
            const isHoverTarget = HOVER_NODES.find(h => h.id === n.id);
            const isHov = hovered?.id === n.id;
            return (
              <g key={i}
                style={{ cursor: isHoverTarget ? 'pointer' : 'default' }}
                onMouseEnter={() => isHoverTarget && setHovered(isHoverTarget)}
                onMouseLeave={() => setHovered(null)}
              >
                {isHov && <circle cx={n.x} cy={n.y} r={n.size + 18} fill={`url(#glow-${n.id})`}/>}
                <circle cx={n.x} cy={n.y} r={n.size + 3} fill={`var(--${n.color}-500)`} opacity={isHov ? 0.28 : 0.15}/>
                <circle
                  cx={n.x} cy={n.y} r={isHov ? n.size + 2 : n.size}
                  fill={n.mastery > 0.7 ? `var(--${n.color}-500)` : n.mastery > 0.4 ? `var(--${n.color}-600)` : 'var(--ink-700)'}
                  stroke={isHov ? 'var(--text)' : `var(--${n.color}-500)`}
                  strokeWidth={isHov ? 2 : 0.5}
                  style={{ transition: 'r 120ms ease' }}
                />
                {isHoverTarget && !isHov && (
                  <circle cx={n.x} cy={n.y} r={n.size + 8} fill="transparent"
                    stroke={`var(--${n.color}-500)`} strokeWidth="0.5" strokeDasharray="3 3" opacity="0.4"/>
                )}
              </g>
            );
          })}

          {/* Cluster labels */}
          {clusters.map(c => (
            <text key={c.id} x={c.cx * W} y={c.cy * H - 130}
              textAnchor="middle" fontSize="14" fontFamily="var(--font-mono)"
              fill={`var(--${c.color}-400)`} fontWeight="500" letterSpacing="1">
              {c.label.toUpperCase()}
            </text>
          ))}
        </svg>

        {/* Hover tooltip */}
        {hovered && (
          <NodeTooltip
            node={hovered}
            x={mousePos.x}
            y={mousePos.y}
            containerW={containerRef.current?.offsetWidth || 900}
            containerH={containerRef.current?.offsetHeight || 600}
          />
        )}

        {/* Hover hint */}
        {!hovered && (
          <div style={{
            position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)',
            fontSize: 11, color: 'var(--text-dim)', pointerEvents: 'none',
            background: 'var(--surface)', border: '1px solid var(--border)',
            padding: '5px 12px', borderRadius: 99,
          }}>
            Hover highlighted nodes to preview card
          </div>
        )}
      </div>

      {/* Right panel */}
      <aside style={{
        borderLeft: '1px solid var(--border)', background: 'var(--surface)',
        display: 'flex', flexDirection: 'column', overflow: 'auto',
      }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Selected node</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 28, letterSpacing: -0.5 }}>
            {hovered ? hovered.label : 'der Nachbar'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            {hovered ? hovered.back : 'the neighbor'}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
            <NNBadge tone={hovered ? hovered.color : 'amber'} size="sm">{hovered ? hovered.deck : 'German'}</NNBadge>
            <NNBadge tone="lime" size="sm">mastered {hovered ? Math.round(hovered.mastery * 100) : 91}%</NNBadge>
          </div>
        </div>

        <div style={{ padding: 18 }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>Stats</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[{ l: 'Reviews', v: '7' }, { l: 'Lapses', v: '1' }, { l: 'Ease', v: '2.4' }, { l: 'Stability', v: '18d' }].map(s => (
              <div key={s.l} style={{ padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{s.l}</div>
                <div style={{ fontSize: 16, fontWeight: 500 }} className="mono">{s.v}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: 18, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
            Linked cards · {hovered ? hovered.links : 7}
          </div>
          {['der Freund', 'die Familie', 'wohnen', 'neighbor (EN)', 'Nachbarschaft'].map((l, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: i ? '1px solid var(--border)' : 'none' }}>
              <div style={{ fontSize: 12.5, flex: 1 }}>{l}</div>
              <NNBadge size="xs" tone="sky">{['semantic','semantic','topic','etymology','derivation'][i]}</NNBadge>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
};

Object.assign(window, { NNGraphWithHover });
