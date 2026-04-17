import { State } from 'ts-fsrs';
import type { Card, Deck } from './types';

// ─────────────────────────────────────────────
// Graph primitives
// ─────────────────────────────────────────────

export interface GraphNode {
  id: string;
  x: number;
  y: number;
  r: number;
  color: string; // deck color token, e.g. 'lime'
  deckId: string;
  card: Card;
  mastered: boolean; // reps>=5 && state===Review
  isNew: boolean;    // reps===0 or state===New
}

export interface GraphEdge {
  a: string;       // node id
  b: string;       // node id
  weight: number;  // count of shared tags
}

// Simple deterministic string hash → unsigned 32-bit integer.
export function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// Convert 32-bit hash to normalized [0, 1) float.
export function hashFloat(s: string, salt = 0): number {
  const h = hashStr(s + '::' + salt);
  return (h % 10000) / 10000;
}

const MAX_EDGES = 200;

/**
 * Build a knowledge graph from cards & decks.
 * Layout:
 *   - Each deck cluster is centered on a circle around viewbox center.
 *   - Each card orbits its cluster center at a small deterministic radius.
 * Edges:
 *   - Two cards share ≥1 tag → edge, weighted by shared-tag count.
 *   - Kept to MAX_EDGES total, prioritising highest weight.
 */
export function buildGraph(
  cards: Card[],
  decks: Deck[],
  width: number,
  height: number
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const cx = width / 2;
  const cy = height / 2;
  const deckRing = Math.min(width, height) * 0.32;
  const nodeOrbit = Math.min(width, height) * 0.14;

  // Only decks that have cards actually get a cluster slot (stable order).
  const cardsByDeck = new Map<string, Card[]>();
  for (const c of cards) {
    const arr = cardsByDeck.get(c.deckId);
    if (arr) arr.push(c);
    else cardsByDeck.set(c.deckId, [c]);
  }
  const activeDecks = decks.filter((d) => (cardsByDeck.get(d.id)?.length ?? 0) > 0);

  const deckCenters = new Map<string, { x: number; y: number; color: string }>();
  const N = Math.max(1, activeDecks.length);
  activeDecks.forEach((deck, i) => {
    const angle = (i / N) * Math.PI * 2 - Math.PI / 2;
    deckCenters.set(deck.id, {
      x: cx + Math.cos(angle) * deckRing,
      y: cy + Math.sin(angle) * deckRing,
      color: deck.color,
    });
  });

  // Fallback for orphan cards whose deck isn't in `decks`.
  const fallback = { x: cx, y: cy, color: 'neutral' };

  const nodes: GraphNode[] = cards.map((card) => {
    const center = deckCenters.get(card.deckId) ?? fallback;
    const angle = hashFloat(card.id, 1) * Math.PI * 2;
    const radiusJitter = 0.4 + hashFloat(card.id, 2) * 0.6; // 0.4–1.0
    const x = center.x + Math.cos(angle) * nodeOrbit * radiusJitter;
    const y = center.y + Math.sin(angle) * nodeOrbit * radiusJitter;

    const reps = card.fsrs?.reps ?? 0;
    const state = card.fsrs?.state as unknown as State;
    const mastered = reps >= 5 && state === State.Review;
    const isNew = reps === 0 || state === State.New;
    // Node radius: 3–8 px from reps.
    const r = 3 + Math.min(5, Math.log2(reps + 1) * 1.8);

    return {
      id: card.id,
      x,
      y,
      r,
      color: center.color,
      deckId: card.deckId,
      card,
      mastered,
      isNew,
    };
  });

  // Build edges: cards with ≥1 shared tag.
  // Use a tag→cards index so we don't do O(N²) for tag-less cards.
  const tagIndex = new Map<string, string[]>(); // tag → card ids
  for (const card of cards) {
    for (const t of card.tags ?? []) {
      const arr = tagIndex.get(t);
      if (arr) arr.push(card.id);
      else tagIndex.set(t, [card.id]);
    }
  }

  const pairWeight = new Map<string, number>();
  for (const ids of tagIndex.values()) {
    if (ids.length < 2) continue;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i];
        const b = ids[j];
        const key = a < b ? `${a}::${b}` : `${b}::${a}`;
        pairWeight.set(key, (pairWeight.get(key) ?? 0) + 1);
      }
    }
  }

  const allEdges: GraphEdge[] = [];
  for (const [key, weight] of pairWeight) {
    const [a, b] = key.split('::');
    allEdges.push({ a, b, weight });
  }
  // Most-shared-tags first; keep only MAX_EDGES.
  allEdges.sort((x, y) => y.weight - x.weight);
  const edges = allEdges.slice(0, MAX_EDGES);

  return { nodes, edges };
}

/**
 * Count distinct neighbors of a node via the edge list.
 */
export function countLinks(edges: GraphEdge[], nodeId: string): number {
  let n = 0;
  for (const e of edges) if (e.a === nodeId || e.b === nodeId) n++;
  return n;
}

/**
 * Rough "mastery" heuristic (0–1) for UI display.
 * Uses retrievability-ish proxy: reps vs. lapses + stability weighting.
 */
export function cardMastery(card: Card): number {
  const reps = card.fsrs?.reps ?? 0;
  const lapses = card.fsrs?.lapses ?? 0;
  const stability = card.fsrs?.stability ?? 0;
  if (reps === 0) return 0;
  const successRatio = Math.max(0, (reps - lapses) / Math.max(1, reps));
  const stabilityTerm = Math.min(1, stability / 30); // 30d stability ≈ confident
  return Math.max(0, Math.min(1, successRatio * 0.7 + stabilityTerm * 0.3));
}
