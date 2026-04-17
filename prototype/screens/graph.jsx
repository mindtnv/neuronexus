// NeuroNexus — Graph screen
// Full knowledge graph with clusters, filters, details panel

const NNGraph = ({ variant = 'force' }) => {
  if (variant === 'constellation') return <NNGraphConstellation/>;
  if (variant === 'clusters') return <NNGraphClusters/>;
  return <NNGraphForce/>;
};

// Generate nodes deterministically
const makeGraph = (seed = 1) => {
  const clusters = [
    { id: 'g', label: 'German',    color: 'amber',  cx: 0.28, cy: 0.38, n: 34 },
    { id: 's', label: 'Systems',   color: 'violet', cx: 0.64, cy: 0.32, n: 28 },
    { id: 'r', label: 'Rust',      color: 'sky',    cx: 0.72, cy: 0.66, n: 22 },
    { id: 'b', label: 'Biases',    color: 'rose',   cx: 0.32, cy: 0.72, n: 18 },
    { id: 'c', label: 'Crypto',    color: 'lime',   cx: 0.5,  cy: 0.5,  n: 12 },
  ];
  const W = 1200, H = 700;
  const nodes = [];
  clusters.forEach(cl => {
    for (let i = 0; i < cl.n; i++) {
      const a = (i / cl.n) * Math.PI * 2 + Math.sin(seed + i) * 0.8;
      const r = 40 + Math.abs(Math.sin(seed * 3 + i * 2)) * 100;
      const x = cl.cx * W + Math.cos(a) * r;
      const y = cl.cy * H + Math.sin(a) * r;
      const mastery = Math.abs(Math.sin(seed + i * 1.7 + cl.cx * 9));
      nodes.push({
        id: `${cl.id}${i}`, x, y, cluster: cl.id, color: cl.color,
        size: 3 + mastery * 8,
        mastery,
      });
    }
  });
  return { nodes, clusters, W, H };
};

// ─────────────────────────────────────────────
// Variant A: Force-directed (default)
// ─────────────────────────────────────────────
const NNGraphForce = () => {
  const { nodes, clusters, W, H } = makeGraph(1);
  // Edges — connect within cluster + few cross-cluster
  const edges = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (a.cluster === b.cluster && d < 90 && Math.random() < 0.35) edges.push([i, j, 0.4]);
      else if (d < 140 && Math.random() < 0.015) edges.push([i, j, 0.15]);
    }
  }
  return (
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 320px', overflow: 'hidden' }}>
      {/* Canvas */}
      <div style={{ position: 'relative', background: 'var(--ink-950)', overflow: 'hidden' }}>
        {/* Toolbar */}
        <div style={{
          position: 'absolute', top: 14, left: 14, zIndex: 5,
          display: 'flex', gap: 6, padding: 6,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
        }}>
          <NNBtn size="sm" variant="ghost" active icon="graph">Force</NNBtn>
          <NNBtn size="sm" variant="ghost">Clusters</NNBtn>
          <NNBtn size="sm" variant="ghost">Timeline</NNBtn>
          <NNBtn size="sm" variant="ghost">Hierarchy</NNBtn>
        </div>
        <div style={{
          position: 'absolute', top: 14, right: 14, zIndex: 5, display: 'flex', gap: 6,
        }}>
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
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '100%', display: 'block' }}>
          {/* subtle grid */}
          <defs>
            <radialGradient id="glowG" cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="#9ad155" stopOpacity="0.35"/>
              <stop offset="1" stopColor="#9ad155" stopOpacity="0"/>
            </radialGradient>
          </defs>
          {/* Edges */}
          {edges.map(([i, j, op], k) => (
            <line key={k} x1={nodes[i].x} y1={nodes[i].y} x2={nodes[j].x} y2={nodes[j].y}
              stroke={nodes[i].cluster === nodes[j].cluster ? `var(--${nodes[i].color}-500)` : 'var(--ink-600)'}
              strokeWidth="0.5" opacity={op}/>
          ))}
          {/* Nodes */}
          {nodes.map((n, i) => {
            const hi = n.id === 'g4';
            return (
              <g key={i}>
                {hi && <circle cx={n.x} cy={n.y} r="28" fill="url(#glowG)"/>}
                <circle cx={n.x} cy={n.y} r={n.size + 3} fill={`var(--${n.color}-500)`} opacity={0.15}/>
                <circle cx={n.x} cy={n.y} r={n.size}
                  fill={n.mastery > 0.7 ? `var(--${n.color}-500)` : n.mastery > 0.4 ? `var(--${n.color}-600)` : 'var(--ink-700)'}
                  stroke={hi ? 'var(--text)' : `var(--${n.color}-500)`}
                  strokeWidth={hi ? 2 : 0.5}/>
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
          {/* Focus node label */}
          <g transform={`translate(${nodes[3].x + 20}, ${nodes[3].y - 10})`}>
            <rect x="0" y="-12" width="110" height="24" rx="4" fill="var(--surface)" stroke="var(--border-2)"/>
            <text x="8" y="4" fontSize="11" fontFamily="var(--font-sans)" fill="var(--text)">der Nachbar</text>
          </g>
        </svg>
      </div>

      {/* Right panel — node details */}
      <aside style={{
        borderLeft: '1px solid var(--border)', background: 'var(--surface)',
        display: 'flex', flexDirection: 'column', overflow: 'auto',
      }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Selected node</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 28, color: 'var(--text)', letterSpacing: -0.5 }}>der Nachbar</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>the neighbor</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
            <NNBadge tone="amber" size="sm">German</NNBadge>
            <NNBadge tone="lime" size="sm">mastered 91%</NNBadge>
          </div>
        </div>

        <div style={{ padding: 18 }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>Stats</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { l: 'Reviews', v: '7' }, { l: 'Lapses', v: '1' },
              { l: 'Ease', v: '2.4' }, { l: 'Stability', v: '18d' },
            ].map(s => (
              <div key={s.l} style={{ padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{s.l}</div>
                <div style={{ fontSize: 16, color: 'var(--text)', fontWeight: 500 }} className="mono">{s.v}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: 18, borderTop: '1px solid var(--border)' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10,
          }}>
            <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.8 }}>
              Linked cards · 7
            </span>
            <NNBtn size="sm" variant="ghost" icon="plus"/>
          </div>
          {[
            { q: 'der Freund', rel: 'semantic', clr: 'sky' },
            { q: 'die Familie', rel: 'semantic', clr: 'sky' },
            { q: 'wohnen', rel: 'topic', clr: 'amber' },
            { q: 'neighbor (EN)', rel: 'etymology', clr: 'violet' },
            { q: 'Nachbarschaft', rel: 'derivation', clr: 'lime' },
          ].map((l, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
              borderTop: i ? '1px solid var(--border)' : 'none',
            }}>
              <div style={{ fontSize: 12.5, color: 'var(--text)', flex: 1 }}>{l.q}</div>
              <NNBadge size="xs" tone={l.clr}>{l.rel}</NNBadge>
            </div>
          ))}
        </div>

        <div style={{ padding: 18, borderTop: '1px solid var(--border)', marginTop: 'auto' }}>
          <NNBtn block variant="soft" icon="sparkle">Ask AI about this node</NNBtn>
        </div>
      </aside>
    </div>
  );
};

// ─────────────────────────────────────────────
// Variant B: Constellation — starmap aesthetic
// ─────────────────────────────────────────────
const NNGraphConstellation = () => {
  const { nodes, clusters, W, H } = makeGraph(2);
  return (
    <div style={{ flex: 1, position: 'relative', background: 'radial-gradient(ellipse at center, #141721 0%, #06070a 100%)', overflow: 'hidden' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '100%' }}>
        {/* Background stars */}
        {Array.from({ length: 120 }).map((_, i) => {
          const x = (Math.sin(i * 9.3) * 0.5 + 0.5) * W;
          const y = (Math.cos(i * 7.7) * 0.5 + 0.5) * H;
          return <circle key={i} cx={x} cy={y} r={Math.abs(Math.sin(i)) * 1.2}
            fill="#fff" opacity={0.08 + Math.abs(Math.cos(i)) * 0.2}/>;
        })}
        {/* Constellation lines */}
        {clusters.map(cl => {
          const cn = nodes.filter(n => n.cluster === cl.id).slice(0, 8);
          return cn.slice(0, -1).map((n, i) => (
            <line key={`${cl.id}-${i}`} x1={n.x} y1={n.y} x2={cn[i+1].x} y2={cn[i+1].y}
              stroke={`var(--${cl.color}-400)`} strokeWidth="0.3" opacity="0.5"/>
          ));
        })}
        {/* Nodes as stars */}
        {nodes.map((n, i) => (
          <g key={i}>
            <circle cx={n.x} cy={n.y} r={n.size + 4} fill={`var(--${n.color}-400)`} opacity={0.12}/>
            <circle cx={n.x} cy={n.y} r={n.size * 0.7} fill="#fff"/>
          </g>
        ))}
        {/* Cluster names as constellation labels */}
        {clusters.map(c => (
          <text key={c.id} x={c.cx * W} y={c.cy * H - 140} textAnchor="middle"
            fontFamily="var(--font-serif)" fontSize="22" fill={`var(--${c.color}-400)`} fontStyle="italic" opacity="0.9">
            {c.label}
          </text>
        ))}
      </svg>

      <div style={{
        position: 'absolute', top: 18, left: '50%', transform: 'translateX(-50%)',
        padding: '10px 16px', background: 'rgba(20,22,30,0.7)', backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.08)', borderRadius: 999,
        display: 'flex', gap: 8, alignItems: 'center',
      }}>
        <NNIcon name="stars" size={13} color="var(--violet-400)"/>
        <span style={{ fontSize: 12, color: 'var(--text)' }}>Constellation view</span>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>· 847 stars · 5 asterisms</span>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// Variant C: Clusters — bubble chart grouped
// ─────────────────────────────────────────────
const NNGraphClusters = () => {
  const { clusters } = makeGraph(3);
  return (
    <div style={{ flex: 1, padding: 32, overflow: 'auto' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: 16,
      }}>
        {clusters.map(cl => (
          <div key={cl.id} style={{
            padding: 20, borderRadius: 16, background: 'var(--surface)',
            border: `1px solid var(--border)`,
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', right: -30, top: -30, width: 180, height: 180,
              borderRadius: '50%', background: `radial-gradient(circle, rgba(var(--${cl.color}-rgb), 0.15), transparent 70%)`,
              opacity: 0.4,
            }}/>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 10, height: 10, borderRadius: 3, background: `var(--${cl.color}-500)` }}/>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{cl.label}</div>
              <div style={{ flex: 1 }}/>
              <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{cl.n} cards</span>
            </div>
            {/* bubble pack */}
            <svg viewBox="0 0 320 180" style={{ width: '100%', height: 180 }}>
              {Array.from({ length: cl.n }).map((_, i) => {
                const a = (i / cl.n) * Math.PI * 2;
                const r = 20 + (i % 4) * 25;
                const x = 160 + Math.cos(a + i * 0.3) * r;
                const y = 90 + Math.sin(a + i * 0.3) * r * 0.6;
                const s = 4 + Math.abs(Math.sin(i * 2)) * 10;
                return (
                  <g key={i}>
                    <circle cx={x} cy={y} r={s + 2} fill={`var(--${cl.color}-500)`} opacity={0.12}/>
                    <circle cx={x} cy={y} r={s} fill={`var(--${cl.color}-500)`} opacity={0.4 + (i % 5) * 0.12}/>
                  </g>
                );
              })}
            </svg>
            <div style={{
              display: 'flex', gap: 12, paddingTop: 12, borderTop: '1px solid var(--border)',
              fontSize: 11.5, color: 'var(--text-muted)',
            }}>
              <span><span className="mono" style={{ color: 'var(--lime-400)' }}>84%</span> mastery</span>
              <span>·</span>
              <span><span className="mono">12</span> links out</span>
              <div style={{ flex: 1 }}/>
              <NNBtn size="sm" variant="ghost" iconRight="arrow">Open</NNBtn>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

Object.assign(window, { NNGraph });
