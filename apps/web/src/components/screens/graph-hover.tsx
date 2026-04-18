'use client';

// NeuroNexus — Graph with node hover mini-card tooltip.
// Uses the shared buildGraph helper over real store data.

import React, { useMemo, useRef, useState } from 'react';
import { NNBtn, NNBadge } from '@/components/ui';
import { useNN } from '@/lib/store';
import { buildGraph, countLinks, cardMastery, type GraphNode } from '@/lib/graph';
import { useBreakpoint } from '@/lib/use-breakpoint';
import type { DeckColor, Deck } from '@/lib/types';
import { useT } from '@/lib/i18n';

const W = 1200;
const H = 700;

const MasteryBar = ({ value, color }: { value: number; color: string }) => (
  <div style={{ height: 4, background: 'var(--surface-3)', borderRadius: 2, overflow: 'hidden', marginTop: 6 }}>
    <div style={{
      width: `${Math.max(0, Math.min(1, value)) * 100}%`,
      height: '100%',
      background: `var(--${color}-500)`,
      borderRadius: 2,
      transition: 'width 400ms ease',
    }}/>
  </div>
);

const NodeTooltip = ({
  node,
  deckName,
  mastery,
  links,
  svgX,
  svgY,
  containerW,
  containerH,
}: {
  node: GraphNode;
  deckName: string;
  mastery: number;
  links: number;
  svgX: number; // 0..containerW (already mapped)
  svgY: number; // 0..containerH
  containerW: number;
  containerH: number;
}) => {
  const t = useT();
  const width = 230;
  const height = 150;
  // Flip left if too close to right edge; clamp vertically.
  const left = svgX + 18 + width > containerW ? svgX - width - 14 : svgX + 18;
  const top = Math.min(Math.max(svgY - height / 2, 8), Math.max(8, containerH - height - 8));
  const card = node.card;

  return (
    <div style={{
      position: 'absolute',
      left, top,
      width,
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
        <NNBadge size="xs" tone={node.color as DeckColor}>{deckName}</NNBadge>
      </div>

      {/* Front */}
      <div style={{
        fontFamily: 'var(--font-serif)', fontSize: 18, letterSpacing: -0.4,
        lineHeight: 1.2, marginBottom: 4, color: 'var(--text)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {card.front}
      </div>

      {/* Back */}
      <div style={{
        fontSize: 12, color: 'var(--text-muted)', marginBottom: 10,
        overflow: 'hidden', textOverflow: 'ellipsis',
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
      }}>
        {card.back}
      </div>

      {/* Mastery */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--text-dim)' }}>
        <span>{t('graph.hover.mastery')}</span>
        <span className="mono" style={{ color: `var(--${node.color}-400)` }}>
          {Math.round(mastery * 100)}%
        </span>
      </div>
      <MasteryBar value={mastery} color={node.color}/>

      {/* Links count */}
      <div style={{ marginTop: 8, fontSize: 10.5, color: 'var(--text-dim)' }}>
        {links === 1 ? t('graph.hover.linkedOne', { n: links }) : t('graph.hover.linkedMany', { n: links })}
      </div>
    </div>
  );
};

export const NNGraphWithHover = () => {
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

  const nodesById = useMemo(() => {
    const m = new Map<string, GraphNode>();
    for (const n of nodes) m.set(n.id, n);
    return m;
  }, [nodes]);

  const decksById = useMemo(() => {
    const m = new Map<string, Deck>();
    for (const d of decks) m.set(d.id, d);
    return m;
  }, [decks]);

  const deckCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of nodes) m.set(n.deckId, (m.get(n.deckId) ?? 0) + 1);
    return m;
  }, [nodes]);

  const legendDecks = useMemo(
    () => decks.filter((d) => (deckCounts.get(d.id) ?? 0) > 0),
    [decks, deckCounts]
  );

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

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const hoveredNode = hoveredId ? nodesById.get(hoveredId) ?? null : null;
  const hoveredDeckName = hoveredNode
    ? decksById.get(hoveredNode.deckId)?.name ?? 'Deck'
    : null;
  const hoveredMastery = hoveredNode ? cardMastery(hoveredNode.card) : 0;
  const hoveredLinks = hoveredNode ? countLinks(edges, hoveredNode.id) : 0;

  // Map the hovered node's SVG coordinates to container pixel coordinates,
  // so the tooltip follows the actual node (not the raw mouse).
  const tooltipAnchor = useMemo(() => {
    if (!hoveredNode || !svgRef.current || !containerRef.current) return null;
    const svgRect = svgRef.current.getBoundingClientRect();
    const cRect = containerRef.current.getBoundingClientRect();
    const scaleX = svgRect.width / W;
    const scaleY = svgRect.height / H;
    const px = (svgRect.left - cRect.left) + hoveredNode.x * scaleX;
    const py = (svgRect.top - cRect.top) + hoveredNode.y * scaleY;
    return { x: px, y: py };
  }, [hoveredNode]);

  return (
    <div style={{
      flex: 1,
      display: 'grid',
      gridTemplateColumns: isMobile ? '1fr' : '1fr 320px',
      gridTemplateRows: isMobile ? 'minmax(320px, 55vh) auto' : 'auto',
      overflow: isMobile ? 'auto' : 'hidden',
    }}>
      {/* Canvas */}
      <div
        ref={containerRef}
        style={{ position: 'relative', background: 'var(--ink-950)', overflow: 'hidden', minHeight: isMobile ? 320 : undefined, width: '100%' }}
      >
        {/* Toolbar (visual only) */}
        <div style={{
          position: 'absolute', top: 14, left: 14, zIndex: 5,
          display: 'flex', gap: 6, padding: 6,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
        }}>
          <NNBtn size="sm" variant="ghost" active icon="graph">{t('graph.toolbar.force')}</NNBtn>
          <NNBtn size="sm" variant="ghost">{t('graph.toolbar.clusters')}</NNBtn>
          <NNBtn size="sm" variant="ghost">{t('graph.toolbar.timeline')}</NNBtn>
        </div>
        <div style={{ position: 'absolute', top: 14, right: 14, zIndex: 5, display: 'flex', gap: 6 }}>
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
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', height: '100%', display: 'block', cursor: 'crosshair' }}
        >
          <defs>
            <radialGradient id="nn-hover-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="#9ad155" stopOpacity="0.4"/>
              <stop offset="1" stopColor="#9ad155" stopOpacity="0"/>
            </radialGradient>
          </defs>

          {/* Edges */}
          {edges.map((e, k) => {
            const a = nodesById.get(e.a);
            const b = nodesById.get(e.b);
            if (!a || !b) return null;
            const sameDeck = a.deckId === b.deckId;
            const opacity = Math.min(0.55, 0.18 + e.weight * 0.12);
            const isSel = !!hoveredNode && (a.id === hoveredNode.id || b.id === hoveredNode.id);
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
            const isHov = hoveredId === n.id;
            const fill = n.mastered
              ? `var(--${n.color}-500)`
              : n.isNew
                ? 'var(--ink-700)'
                : `var(--${n.color}-600)`;
            const stroke = isHov
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
                onMouseEnter={() => setHoveredId(n.id)}
                onMouseLeave={() => setHoveredId((cur) => (cur === n.id ? null : cur))}
              >
                {(isHov || n.mastered) && (
                  <circle cx={n.x} cy={n.y} r={n.r + (isHov ? 18 : 12)} fill="url(#nn-hover-glow)"/>
                )}
                <circle cx={n.x} cy={n.y} r={n.r + 3} fill={`var(--${n.color}-500)`} opacity={isHov ? 0.3 : 0.15}/>
                <circle
                  cx={n.x} cy={n.y} r={isHov ? n.r + 2 : n.r}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={isHov ? 2 : n.isNew ? 0.8 : 0.6}
                  opacity={n.isNew && !isHov ? 0.75 : 1}
                  style={{ transition: 'r 120ms ease' }}
                />
              </g>
            );
          })}

          {/* Cluster labels */}
          {deckLabelPositions.map(({ deck, x, y }) => (
            <text key={deck.id} x={x} y={y}
              textAnchor="middle" fontSize="14" fontFamily="var(--font-mono)"
              fill={`var(--${deck.color}-400)`} fontWeight="500" letterSpacing="1">
              {deck.name.toUpperCase()}
            </text>
          ))}
        </svg>

        {/* Hover tooltip */}
        {hoveredNode && hoveredDeckName && tooltipAnchor && (
          <NodeTooltip
            node={hoveredNode}
            deckName={hoveredDeckName}
            mastery={hoveredMastery}
            links={hoveredLinks}
            svgX={tooltipAnchor.x}
            svgY={tooltipAnchor.y}
            containerW={containerRef.current?.offsetWidth || 900}
            containerH={containerRef.current?.offsetHeight || 600}
          />
        )}

        {/* Hover hint */}
        {!hoveredNode && (
          <div style={{
            position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)',
            fontSize: 11, color: 'var(--text-dim)', pointerEvents: 'none',
            background: 'var(--surface)', border: '1px solid var(--border)',
            padding: '5px 12px', borderRadius: 99,
          }}>
            {t('graph.hover.previewHint')}
          </div>
        )}
      </div>

      {/* Right panel — summary */}
      <aside style={{
        borderLeft: isMobile ? 'none' : '1px solid var(--border)',
        borderTop: isMobile ? '1px solid var(--border)' : 'none',
        background: 'var(--surface)',
        display: 'flex', flexDirection: 'column',
        overflow: isMobile ? 'visible' : 'auto',
        maxWidth: '100%',
      }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>
            {t('graph.hover.hovered')}
          </div>
          <div style={{
            fontFamily: 'var(--font-serif)', fontSize: 26, letterSpacing: -0.5, lineHeight: 1.2,
            color: hoveredNode ? 'var(--text)' : 'var(--text-muted)',
          }}>
            {hoveredNode ? hoveredNode.card.front : t('graph.hover.nothing')}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>
            {hoveredNode ? hoveredNode.card.back : t('graph.hover.hint')}
          </div>
          {hoveredNode && hoveredDeckName && (
            <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
              <NNBadge tone={hoveredNode.color as DeckColor} size="sm">{hoveredDeckName}</NNBadge>
              {hoveredNode.mastered && (
                <NNBadge tone="lime" size="sm">
                  {t('graph.hover.mastered', { pct: Math.round(hoveredMastery * 100) })}
                </NNBadge>
              )}
              {hoveredNode.isNew && <NNBadge tone="neutral" size="sm">{t('graph.hover.new')}</NNBadge>}
            </div>
          )}
        </div>

        <div style={{ padding: 18 }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>{t('graph.hover.stats')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { l: t('graph.hover.reviews'), v: hoveredNode ? String(hoveredNode.card.fsrs?.reps ?? 0) : '—' },
              { l: t('graph.hover.lapses'), v: hoveredNode ? String(hoveredNode.card.fsrs?.lapses ?? 0) : '—' },
              { l: t('graph.hover.stability'), v: hoveredNode && hoveredNode.card.fsrs?.stability
                ? `${hoveredNode.card.fsrs.stability.toFixed(1)}d`
                : '—' },
              { l: t('graph.hover.links'), v: hoveredNode ? String(hoveredLinks) : '—' },
            ].map((s) => (
              <div key={s.l} style={{ padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{s.l}</div>
                <div style={{ fontSize: 16, fontWeight: 500 }} className="mono">{s.v}</div>
              </div>
            ))}
          </div>
        </div>

        {hoveredNode && hoveredNode.card.tags.length > 0 && (
          <div style={{ padding: 18, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
              {t('graph.hover.tags', { n: hoveredNode.card.tags.length })}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {hoveredNode.card.tags.slice(0, 12).map((t) => (
                <span key={t} className="mono" style={{
                  fontSize: 11, color: 'var(--text-muted)',
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  padding: '2px 6px', borderRadius: 6,
                }}>
                  #{t}
                </span>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
};
