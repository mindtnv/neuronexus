'use client';

// NeuroNexus — Graph screen
// Full knowledge graph with clusters, filters, details panel.
// Real data wired from the useNN store; derived via buildGraph.

import React, { useMemo, useState } from 'react';
import { NNIcon, NNBtn, NNBadge } from '@/components/ui';
import { useEmptyRedirect } from '@/lib/use-empty-redirect';
import { useNN } from '@/lib/store';
import { buildGraph, countLinks, cardMastery, hashFloat } from '@/lib/graph';
import { humanInterval } from '@/lib/fsrs';
import { useBreakpoint } from '@/lib/use-breakpoint';
import type { DeckColor } from '@/lib/types';
import { useT } from '@/lib/i18n';

const W = 1200;
const H = 700;

export const NNGraph = ({ variant = 'force' }: { variant?: 'force' | 'constellation' | 'clusters' }) => {
  if (variant === 'constellation') return <NNGraphConstellation/>;
  if (variant === 'clusters') return <NNGraphClusters/>;
  return <NNGraphForce/>;
};

// ─────────────────────────────────────────────
// Variant A: Force-directed (default) — real data
// ─────────────────────────────────────────────
export const NNGraphForce = () => {
  useEmptyRedirect('graph');
  const t = useT();
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';
  const isDesktop = bp === 'desktop';
  const cards = useNN((s) => s.cards);
  const decks = useNN((s) => s.decks);

  const { nodes, edges } = useMemo(
    () => buildGraph(cards, decks, W, H),
    [cards, decks]
  );

  // Per-deck node counts for the legend.
  const deckCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of nodes) m.set(n.deckId, (m.get(n.deckId) ?? 0) + 1);
    return m;
  }, [nodes]);

  const legendDecks = useMemo(
    () => decks.filter((d) => (deckCounts.get(d.id) ?? 0) > 0),
    [decks, deckCounts]
  );

  // Deck-center lookup for drawing cluster labels (mirrors buildGraph math).
  const deckLabelPositions = useMemo(() => {
    const cx = W / 2;
    const cy = H / 2;
    const deckRing = Math.min(W, H) * 0.32;
    const nodeOrbit = Math.min(W, H) * 0.14;
    return legendDecks.map((d, i) => {
      const angle = (i / Math.max(1, legendDecks.length)) * Math.PI * 2 - Math.PI / 2;
      const lx = cx + Math.cos(angle) * deckRing;
      const ly = cy + Math.sin(angle) * deckRing - nodeOrbit - 10;
      return { deck: d, x: lx, y: ly };
    });
  }, [legendDecks]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedNode = useMemo(
    () => (selectedId ? nodes.find((n) => n.id === selectedId) ?? null : null),
    [selectedId, nodes]
  );

  // Lookup by id for fast edge rendering.
  const nodesById = useMemo(() => {
    const m = new Map<string, typeof nodes[number]>();
    for (const n of nodes) m.set(n.id, n);
    return m;
  }, [nodes]);

  const selectedLinks = useMemo(() => {
    if (!selectedNode) return [] as { id: string; front: string; shared: number; color: string }[];
    const out: { id: string; front: string; shared: number; color: string }[] = [];
    for (const e of edges) {
      const otherId = e.a === selectedNode.id ? e.b : e.b === selectedNode.id ? e.a : null;
      if (!otherId) continue;
      const other = nodesById.get(otherId);
      if (!other) continue;
      out.push({ id: other.id, front: other.card.front, shared: e.weight, color: other.color });
    }
    return out.sort((x, y) => y.shared - x.shared).slice(0, 8);
  }, [selectedNode, edges, nodesById]);

  return (
    <div style={{
      flex: 1,
      display: 'grid',
      gridTemplateColumns: isMobile ? '1fr' : '1fr 320px',
      gridTemplateRows: isMobile ? 'minmax(320px, 55vh) auto' : 'auto',
      overflow: isMobile ? 'auto' : 'hidden',
    }}>
      {/* Canvas */}
      <div style={{ position: 'relative', background: 'var(--ink-950)', overflow: 'hidden', minHeight: isMobile ? 320 : undefined, width: '100%' }}>
        {/* Toolbar (visual only) */}
        <div style={{
          position: 'absolute', top: 14, left: 14, zIndex: 5,
          display: 'flex', gap: 6, padding: 6,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
        }}>
          <NNBtn size="sm" variant="ghost" active icon="graph">{t('graph.toolbar.force')}</NNBtn>
          <NNBtn size="sm" variant="ghost">{t('graph.toolbar.clusters')}</NNBtn>
          <NNBtn size="sm" variant="ghost">{t('graph.toolbar.timeline')}</NNBtn>
          <NNBtn size="sm" variant="ghost">{t('graph.toolbar.hierarchy')}</NNBtn>
        </div>
        <div style={{
          position: 'absolute', top: 14, right: 14, zIndex: 5, display: 'flex', gap: 6,
        }}>
          <NNBtn size="sm" variant="soft" icon="filter">{t('graph.toolbar.filters')}</NNBtn>
          <NNBtn size="sm" variant="soft" icon="search">{t('graph.toolbar.find')}</NNBtn>
        </div>

        {/* Legend */}
        <div style={{
          position: 'absolute', bottom: 14, left: 14, zIndex: 5,
          padding: '10px 14px', background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: 10,
          display: 'flex', flexDirection: 'column', gap: 6,
          minWidth: 160,
        }}>
          <div style={{ fontSize: 10.5, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 }}>{t('graph.legend.title')}</div>
          {legendDecks.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{t('graph.legend.empty')}</div>
          )}
          {legendDecks.map((d) => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <div style={{ width: 9, height: 9, borderRadius: '50%', background: `var(--${d.color}-500)` }}/>
              <span style={{ color: 'var(--text)' }}>{d.name}</span>
              <span className="mono" style={{ color: 'var(--text-dim)', marginLeft: 'auto', fontSize: 11 }}>
                {deckCounts.get(d.id) ?? 0}
              </span>
            </div>
          ))}
        </div>

        {/* Zoom (visual only) */}
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
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', height: '100%', display: 'block' }}
          onClick={() => setSelectedId(null)}
        >
          <defs>
            <radialGradient id="nn-graph-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="#9ad155" stopOpacity="0.35"/>
              <stop offset="1" stopColor="#9ad155" stopOpacity="0"/>
            </radialGradient>
          </defs>

          {/* Edges first */}
          {edges.map((e, k) => {
            const a = nodesById.get(e.a);
            const b = nodesById.get(e.b);
            if (!a || !b) return null;
            const sameDeck = a.deckId === b.deckId;
            const opacity = Math.min(0.55, 0.18 + e.weight * 0.12);
            const isSel = !!selectedNode && (a.id === selectedNode.id || b.id === selectedNode.id);
            return (
              <line
                key={k}
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={sameDeck ? `var(--${a.color}-500)` : 'var(--ink-600)'}
                strokeWidth={isSel ? 1.2 : 0.5}
                opacity={isSel ? 0.85 : opacity}
              />
            );
          })}

          {/* Nodes */}
          {nodes.map((n) => {
            const isSel = selectedNode?.id === n.id;
            const fill = n.mastered
              ? `var(--${n.color}-500)`
              : n.isNew
                ? 'var(--ink-700)'
                : `var(--${n.color}-600)`;
            const stroke = isSel
              ? 'var(--text)'
              : n.mastered
                ? 'var(--lime-400)'
                : n.isNew
                  ? 'var(--border-2)'
                  : `var(--${n.color}-500)`;
            return (
              <g
                key={n.id}
                style={{ cursor: 'pointer' }}
                onClick={(ev) => {
                  ev.stopPropagation();
                  setSelectedId(n.id);
                }}
              >
                {n.mastered && (
                  <circle cx={n.x} cy={n.y} r={n.r + 12} fill="url(#nn-graph-glow)"/>
                )}
                <circle cx={n.x} cy={n.y} r={n.r + 3} fill={`var(--${n.color}-500)`} opacity={0.15}/>
                <circle
                  cx={n.x} cy={n.y} r={n.r}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={isSel ? 2 : n.isNew ? 0.8 : 0.6}
                  opacity={n.isNew ? 0.75 : 1}
                />
              </g>
            );
          })}

          {/* Cluster labels */}
          {deckLabelPositions.map(({ deck, x, y }) => (
            <text
              key={deck.id}
              x={x} y={y}
              textAnchor="middle"
              fontSize="14"
              fontFamily="var(--font-mono)"
              fill={`var(--${deck.color}-400)`}
              fontWeight="500"
              letterSpacing="1"
            >
              {deck.name.toUpperCase()}
            </text>
          ))}

          {/* Selected node label */}
          {selectedNode && (
            <g transform={`translate(${selectedNode.x + 14}, ${selectedNode.y - 10})`} pointerEvents="none">
              <rect
                x="0" y="-12"
                width={Math.min(180, selectedNode.card.front.length * 7 + 20)}
                height="24" rx="4"
                fill="var(--surface)"
                stroke="var(--border-2)"
              />
              <text x="8" y="4" fontSize="11" fontFamily="var(--font-sans)" fill="var(--text)">
                {selectedNode.card.front.length > 22
                  ? selectedNode.card.front.slice(0, 22) + '…'
                  : selectedNode.card.front}
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* Right panel — node details */}
      <aside style={{
        borderLeft: isMobile ? 'none' : '1px solid var(--border)',
        borderTop: isMobile ? '1px solid var(--border)' : 'none',
        background: 'var(--surface)',
        display: 'flex', flexDirection: 'column',
        overflow: isMobile ? 'visible' : 'auto',
        maxWidth: '100%',
      }}>
        {selectedNode ? (
          <NodeDetail
            node={selectedNode}
            deckName={decks.find((d) => d.id === selectedNode.deckId)?.name ?? 'Deck'}
            linksCount={countLinks(edges, selectedNode.id)}
            linkedCards={selectedLinks}
          />
        ) : (
          <EmptyDetail totalCards={cards.length} totalEdges={edges.length}/>
        )}

      </aside>
    </div>
  );
};

const EmptyDetail = ({ totalCards, totalEdges }: { totalCards: number; totalEdges: number }) => {
  const t = useT();
  return (
  <>
    <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>
        {t('graph.detail.selected')}
      </div>
      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: 'var(--text-muted)', letterSpacing: -0.5 }}>
        {t('graph.detail.nothing')}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
        {t('graph.detail.clickHint')}
      </div>
    </div>
    <div style={{ padding: 18 }}>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
        {t('graph.detail.graph')}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{t('graph.detail.nodes')}</div>
          <div style={{ fontSize: 16, color: 'var(--text)', fontWeight: 500 }} className="mono">{totalCards}</div>
        </div>
        <div style={{ padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{t('graph.detail.edges')}</div>
          <div style={{ fontSize: 16, color: 'var(--text)', fontWeight: 500 }} className="mono">{totalEdges}</div>
        </div>
      </div>
    </div>
  </>
  );
};

const NodeDetail = ({
  node,
  deckName,
  linksCount,
  linkedCards,
}: {
  node: ReturnType<typeof buildGraph>['nodes'][number];
  deckName: string;
  linksCount: number;
  linkedCards: { id: string; front: string; shared: number; color: string }[];
}) => {
  const t = useT();
  const card = node.card;
  const fsrs = card.fsrs;
  const reps = fsrs?.reps ?? 0;
  const lapses = fsrs?.lapses ?? 0;
  const stability = fsrs?.stability ?? 0;
  const mastery = cardMastery(card);
  const due = fsrs?.due ? humanInterval(fsrs) : '—';
  const tone = node.color as DeckColor;

  return (
    <>
      <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>
          {t('graph.detail.selected')}
        </div>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 26, color: 'var(--text)', letterSpacing: -0.5, lineHeight: 1.2 }}>
          {card.front}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>
          {card.back}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
          <NNBadge tone={tone} size="sm">{deckName}</NNBadge>
          {node.mastered && <NNBadge tone="lime" size="sm">{t('graph.detail.mastered', { pct: Math.round(mastery * 100) })}</NNBadge>}
          {node.isNew && <NNBadge tone="neutral" size="sm">{t('graph.detail.new')}</NNBadge>}
        </div>
        {card.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            {card.tags.slice(0, 6).map((t) => (
              <span
                key={t}
                className="mono"
                style={{
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  padding: '2px 6px',
                  borderRadius: 6,
                }}
              >
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: 18 }}>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
          {t('graph.detail.stats')}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { l: t('graph.detail.reviews'), v: String(reps) },
            { l: t('graph.detail.lapses'), v: String(lapses) },
            { l: t('graph.detail.stability'), v: stability ? `${stability.toFixed(1)}d` : '—' },
            { l: t('graph.detail.due'), v: due },
          ].map((s) => (
            <div key={s.l} style={{ padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{s.l}</div>
              <div style={{ fontSize: 16, color: 'var(--text)', fontWeight: 500 }} className="mono">{s.v}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: 18, borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.8 }}>
            {t('graph.detail.linkedCards', { n: linksCount })}
          </span>
          <NNBtn size="sm" variant="ghost" icon="plus"/>
        </div>
        {linkedCards.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            {t('graph.detail.noLinks')}
          </div>
        )}
        {linkedCards.map((l, i) => (
          <div key={l.id} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
            borderTop: i ? '1px solid var(--border)' : 'none',
          }}>
            <div style={{
              fontSize: 12.5, color: 'var(--text)', flex: 1,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {l.front}
            </div>
            <NNBadge size="xs" tone={l.color as DeckColor}>
              {l.shared} {l.shared === 1 ? t('graph.detail.tagSingular') : t('graph.detail.tagPlural')}
            </NNBadge>
          </div>
        ))}
      </div>

      <div style={{ padding: 18, borderTop: '1px solid var(--border)', marginTop: 'auto' }}>
        <NNBtn block variant="soft" icon="sparkle">{t('graph.detail.askAi')}</NNBtn>
      </div>
    </>
  );
};

// ─────────────────────────────────────────────
// Variant B: Constellation — starmap aesthetic (static mockup)
// ─────────────────────────────────────────────
const MOCK_CLUSTERS = [
  { id: 'g', label: 'German',    color: 'amber',  cx: 0.28, cy: 0.38, n: 34 },
  { id: 's', label: 'Systems',   color: 'violet', cx: 0.64, cy: 0.32, n: 28 },
  { id: 'r', label: 'Rust',      color: 'sky',    cx: 0.72, cy: 0.66, n: 22 },
  { id: 'b', label: 'Biases',    color: 'rose',   cx: 0.32, cy: 0.72, n: 18 },
  { id: 'c', label: 'Crypto',    color: 'lime',   cx: 0.5,  cy: 0.5,  n: 12 },
];

const makeMockNodes = (seed: number) => {
  const Wm = 1200;
  const Hm = 700;
  const out: { id: string; x: number; y: number; cluster: string; color: string; size: number; mastery: number }[] = [];
  MOCK_CLUSTERS.forEach((cl) => {
    for (let i = 0; i < cl.n; i++) {
      const a = (i / cl.n) * Math.PI * 2 + Math.sin(seed + i) * 0.8;
      const r = 40 + Math.abs(Math.sin(seed * 3 + i * 2)) * 100;
      const x = cl.cx * Wm + Math.cos(a) * r;
      const y = cl.cy * Hm + Math.sin(a) * r;
      const mastery = Math.abs(Math.sin(seed + i * 1.7 + cl.cx * 9));
      out.push({
        id: `${cl.id}${i}`, x, y, cluster: cl.id, color: cl.color,
        size: 3 + mastery * 8,
        mastery,
      });
    }
  });
  return { nodes: out, Wm, Hm };
};

export const NNGraphConstellation = () => {
  const t = useT();
  const { nodes, Wm, Hm } = makeMockNodes(2);
  return (
    <div style={{ flex: 1, position: 'relative', background: 'radial-gradient(ellipse at center, #141721 0%, #06070a 100%)', overflow: 'hidden' }}>
      <svg viewBox={`0 0 ${Wm} ${Hm}`} style={{ width: '100%', height: '100%' }}>
        {/* Background stars — deterministic via hashFloat */}
        {Array.from({ length: 120 }).map((_, i) => {
          const x = (Math.sin(i * 9.3) * 0.5 + 0.5) * Wm;
          const y = (Math.cos(i * 7.7) * 0.5 + 0.5) * Hm;
          const shimmer = hashFloat(`star-${i}`, 3);
          return <circle key={i} cx={x} cy={y} r={Math.abs(Math.sin(i)) * 1.2}
            fill="#fff" opacity={0.08 + shimmer * 0.2}/>;
        })}
        {/* Constellation lines */}
        {MOCK_CLUSTERS.map((cl) => {
          const cn = nodes.filter((n) => n.cluster === cl.id).slice(0, 8);
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
        {MOCK_CLUSTERS.map((c) => (
          <text key={c.id} x={c.cx * Wm} y={c.cy * Hm - 140} textAnchor="middle"
            fontFamily="var(--font-serif)" fontSize="22" fill={`var(--${c.color}-400)`} fontStyle="italic" opacity="0.9">
            {t(`graph.constellation.clusters.${c.id}`)}
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
        <span style={{ fontSize: 12, color: 'var(--text)' }}>{t('graph.constellation.view')}</span>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{t('graph.constellation.sub')}</span>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// Variant C: Clusters — bubble chart grouped (static mockup)
// ─────────────────────────────────────────────
export const NNGraphClusters = () => {
  const t = useT();
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';
  return (
    <div style={{ flex: 1, padding: isMobile ? 14 : 32, overflow: 'auto' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: isMobile ? 12 : 16,
      }}>
        {MOCK_CLUSTERS.map((cl) => (
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
              <div style={{ fontSize: 15, fontWeight: 600 }}>{t(`graph.constellation.clusters.${cl.id}`)}</div>
              <div style={{ flex: 1 }}/>
              <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('graph.clusters.cards', { n: cl.n })}</span>
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
              <span><span className="mono" style={{ color: 'var(--lime-400)' }}>84%</span> {t('graph.clusters.mastery')}</span>
              <span>·</span>
              <span><span className="mono">12</span> {t('graph.clusters.linksOut')}</span>
              <div style={{ flex: 1 }}/>
              <NNBtn size="sm" variant="ghost" iconRight="arrow">{t('graph.clusters.open')}</NNBtn>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
