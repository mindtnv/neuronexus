'use client';

// ConceptMap («Блокноты 2.0» N4, Р10 «Карта концептов») — a lightweight SVG
// force-directed graph of a notebook's document SECTIONS and their semantic
// similarity, rendered in the Overview tab BELOW the coverage block.
//
//  • Lazy: the workspace fetches GET …/concept-map only when this component
//    first mounts (the Overview tab is open) — see OverviewPanel.
//  • Layout: a tiny dependency-free force sim (lib/concept-map-layout.ts) run
//    ONCE on the fetched data — NOT animated per frame (so reduced-motion is
//    honoured for free). Positions are SEEDED from node ids → stable across
//    remounts.
//  • Nodes: a circle (radius ∝ log(chunkCount)), colour by sourceId (a
//    deterministic palette), label = heading or «часть N» (N from firstPos).
//    Click → onOpenCitation(firstChunkId, sourceId) (the workspace's resolver
//    opens the citation viewer on that section's first chunk).
//  • Edges: stroke width + opacity scale with the cosine score.
//  • Hover: the hovered node + its neighbours (and the connecting edges) stay
//    lit; everything else dims.
//  • Degrade: reason='not_indexed' (or empty) → a «not indexed yet» empty-state.
//
// No d3, no external graph lib — pure SVG over the pure layout helper.

import { useEffect, useMemo, useRef, useState } from 'react';
import { NNIcon, NNSkeleton } from '@/components/ui';
import {
  layoutConceptMap,
  type LayoutInputEdge,
  type LayoutInputNode,
} from '@/lib/concept-map-layout';
import type { ConceptMapResult } from '@/lib/types';

type Tfn = (key: string, params?: Record<string, string | number>) => string;

export interface ConceptMapProps {
  notebookId: string;
  /** Has the notebook any ready sources? (Drives the «add sources» empty-state.) */
  hasReady: boolean;
  /** Fetch the concept-map (vectors-only; degrades to reason='not_indexed'). */
  conceptMap: (id: string) => Promise<ConceptMapResult>;
  /** A node click → open the citation viewer on its first chunk. */
  onOpenCitation: (chunkId: string, sourceId: string) => void;
  t: Tfn;
}

const VIEW_W = 560;
const VIEW_H = 360;

/** A small, perceptually-distinct palette keyed deterministically by sourceId. */
const NODE_PALETTE = [
  'var(--lime-400)',
  'var(--sky-400)',
  'var(--violet-400)',
  'var(--amber-400)',
  'var(--rose-400)',
  'var(--lime-300)',
  'var(--sky-200)',
  'var(--violet-200)',
];

/** FNV-1a → palette index (stable per sourceId). */
function colorForSource(sourceId: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < sourceId.length; i++) {
    h ^= sourceId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return NODE_PALETTE[(h >>> 0) % NODE_PALETTE.length]!;
}

export const ConceptMap = ({
  notebookId,
  hasReady,
  conceptMap,
  onOpenCitation,
  t,
}: ConceptMapProps) => {
  const [data, setData] = useState<ConceptMapResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  // Lazy fetch ONCE per mount (this component only mounts when the Overview tab
  // is open). Vectors-only — no chat key needed.
  useEffect(() => {
    if (fetchedRef.current) return;
    if (!hasReady) return;
    fetchedRef.current = true;
    setLoading(true);
    let cancelled = false;
    (async () => {
      try {
        const res = await conceptMap(notebookId);
        if (!cancelled) setData(res);
      } catch {
        if (!cancelled) setData({ nodes: [], edges: [], reason: 'not_indexed' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasReady, conceptMap, notebookId]);

  // Run the force layout once on the fetched nodes/edges (deterministic).
  const layout = useMemo(() => {
    if (!data || data.nodes.length === 0) return null;
    const inNodes: LayoutInputNode[] = data.nodes.map((n) => ({
      id: n.id,
      chunkCount: n.chunkCount,
    }));
    const inEdges: LayoutInputEdge[] = data.edges.map((e) => ({
      a: e.a,
      b: e.b,
      score: e.score,
    }));
    return layoutConceptMap(inNodes, inEdges, { width: VIEW_W, height: VIEW_H });
  }, [data]);

  // Node-id → its laid-out position (and the original node payload).
  const positioned = useMemo(() => {
    if (!data || !layout) return null;
    const posById = new Map(layout.nodes.map((n) => [n.id, n]));
    const byId = new Map(data.nodes.map((n) => [n.id, n]));
    return { posById, byId };
  }, [data, layout]);

  // Adjacency for the hover highlight (a node + its direct neighbours stay lit).
  const neighbours = useMemo(() => {
    const adj = new Map<string, Set<string>>();
    for (const e of data?.edges ?? []) {
      (adj.get(e.a) ?? adj.set(e.a, new Set()).get(e.a)!).add(e.b);
      (adj.get(e.b) ?? adj.set(e.b, new Set()).get(e.b)!).add(e.a);
    }
    return adj;
  }, [data]);

  const isLit = (id: string): boolean => {
    if (!hovered) return true;
    if (id === hovered) return true;
    return neighbours.get(hovered)?.has(id) ?? false;
  };
  const edgeLit = (a: string, b: string): boolean => {
    if (!hovered) return true;
    return a === hovered || b === hovered;
  };

  const nodeLabel = (n: { label: string | null; firstPos: number }): string =>
    n.label && n.label.length > 0
      ? n.label
      : t('notebooks.map.part', { n: Math.floor(n.firstPos / 10) + 1 });

  // ── States ───────────────────────────────────────────────────────────────────
  if (!hasReady) {
    return (
      <p style={{ fontSize: 11.5, color: 'var(--text-dim)', margin: 0 }}>
        {t('notebooks.map.empty')}
      </p>
    );
  }
  if (loading || data === null) {
    return <NNSkeleton style={{ height: 120 }} />;
  }
  if (data.reason === 'not_indexed' || data.nodes.length === 0) {
    return (
      <div className="nn-empty-state" style={{ paddingTop: 18, paddingBottom: 18 }}>
        <span className="nn-empty-state-icon">
          <NNIcon name="graph" size={22} color="var(--text-dim)" />
        </span>
        <p className="nn-empty-state-hint">{t('notebooks.map.notIndexed')}</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: 0 }}>
        {t('notebooks.map.hint')}
      </p>
      <div className="nn-concept-map">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          width="100%"
          style={{ display: 'block', maxHeight: 360 }}
          role="img"
          aria-label={t('notebooks.map.heading')}
        >
          {/* Edges first (under the nodes). */}
          {positioned &&
            (data.edges ?? []).map((e, i) => {
              const pa = positioned.posById.get(e.a);
              const pb = positioned.posById.get(e.b);
              if (!pa || !pb) return null;
              const lit = edgeLit(e.a, e.b);
              return (
                <line
                  key={`${e.a}|${e.b}|${i}`}
                  x1={pa.x}
                  y1={pa.y}
                  x2={pb.x}
                  y2={pb.y}
                  stroke="var(--lime-500)"
                  strokeWidth={0.6 + e.score * 2.4}
                  strokeOpacity={lit ? 0.18 + e.score * 0.42 : 0.05}
                  strokeLinecap="round"
                />
              );
            })}

          {/* Nodes. */}
          {positioned &&
            data.nodes.map((n) => {
              const pos = positioned.posById.get(n.id);
              if (!pos) return null;
              const lit = isLit(n.id);
              const color = colorForSource(n.sourceId);
              const label = nodeLabel(n);
              return (
                <g
                  key={n.id}
                  className="nn-concept-node"
                  transform={`translate(${pos.x} ${pos.y})`}
                  opacity={lit ? 1 : 0.28}
                  onMouseEnter={() => setHovered(n.id)}
                  onMouseLeave={() => setHovered((h) => (h === n.id ? null : h))}
                  onClick={() => onOpenCitation(n.firstChunkId, n.sourceId)}
                  style={{ cursor: 'pointer' }}
                >
                  <title>{`${n.sourceTitle} · ${label}`}</title>
                  <circle
                    r={pos.r}
                    fill={color}
                    fillOpacity={0.85}
                    stroke="var(--surface)"
                    strokeWidth={1.5}
                  />
                  <text
                    y={pos.r + 11}
                    textAnchor="middle"
                    fontSize={9.5}
                    fill="var(--text-muted)"
                    style={{ fontFamily: 'var(--font-sans)', pointerEvents: 'none' }}
                  >
                    {label.length > 22 ? `${label.slice(0, 22)}…` : label}
                  </text>
                </g>
              );
            })}
        </svg>
      </div>
    </div>
  );
};
