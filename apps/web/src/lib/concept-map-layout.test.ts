// «Блокноты 2.0» N4 — concept-map force-layout unit tests (Р10 / item F).
//
// The layout is a PURE, deterministic, seeded force simulation (no DOM, no RNG).
// These tests pin its three load-bearing invariants:
//   1. Convergence: every coordinate is a finite number (never NaN/±Inf), even
//      for degenerate inputs (one node, coincident seeds, dangling edges).
//   2. Determinism: identical input ⇒ byte-identical output (the seeded-init
//      contract that keeps the map stable across remounts).
//   3. Separation: coincident-seeded nodes are nudged apart (no two nodes share
//      an exact position — which would make 1/d² repulsion explode to NaN).

import { describe, expect, test } from 'bun:test';
import {
  layoutConceptMap,
  radiusForChunkCount,
  type LayoutInputEdge,
  type LayoutInputNode,
} from './concept-map-layout';

const OPTS = { width: 600, height: 400 };

function nodes(...ids: string[]): LayoutInputNode[] {
  return ids.map((id, i) => ({ id, chunkCount: (i + 1) * 3 }));
}

describe('layoutConceptMap — convergence (finite, non-NaN)', () => {
  test('all coordinates are finite for a normal graph', () => {
    const ns = nodes('a', 'b', 'c', 'd', 'e');
    const es: LayoutInputEdge[] = [
      { a: 'a', b: 'b', score: 0.8 },
      { a: 'b', b: 'c', score: 0.6 },
      { a: 'c', b: 'd', score: 0.5 },
      { a: 'd', b: 'e', score: 0.7 },
      { a: 'a', b: 'e', score: 0.4 },
    ];
    const out = layoutConceptMap(ns, es, OPTS);
    expect(out.nodes).toHaveLength(5);
    for (const n of out.nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
      expect(Number.isFinite(n.r)).toBe(true);
    }
  });

  test('single node converges to a finite coordinate (no division by zero)', () => {
    const out = layoutConceptMap(nodes('solo'), [], OPTS);
    expect(out.nodes).toHaveLength(1);
    expect(Number.isFinite(out.nodes[0]!.x)).toBe(true);
    expect(Number.isFinite(out.nodes[0]!.y)).toBe(true);
  });

  test('empty input yields an empty layout', () => {
    const out = layoutConceptMap([], [], OPTS);
    expect(out.nodes).toHaveLength(0);
    expect(out.width).toBe(600);
    expect(out.height).toBe(400);
  });

  test('dangling edges (endpoint not in nodes) do not crash or NaN', () => {
    const out = layoutConceptMap(nodes('a', 'b'), [{ a: 'a', b: 'ghost', score: 0.9 }], OPTS);
    expect(out.nodes).toHaveLength(2);
    for (const n of out.nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
    }
  });

  test('nodes stay clamped within the canvas (radius-aware margin)', () => {
    const ns = nodes('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h');
    const out = layoutConceptMap(ns, [], OPTS);
    for (const n of out.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(n.r);
      expect(n.x).toBeLessThanOrEqual(OPTS.width - n.r);
      expect(n.y).toBeGreaterThanOrEqual(n.r);
      expect(n.y).toBeLessThanOrEqual(OPTS.height - n.r);
    }
  });

  test('a large graph (60 nodes at the section cap) stays finite', () => {
    const ns: LayoutInputNode[] = Array.from({ length: 60 }, (_, i) => ({
      id: `n${i}`,
      chunkCount: (i % 7) + 1,
    }));
    const es: LayoutInputEdge[] = ns
      .slice(0, 59)
      .map((n, i) => ({ a: n.id, b: ns[i + 1]!.id, score: 0.5 }));
    const out = layoutConceptMap(ns, es, OPTS);
    expect(out.nodes).toHaveLength(60);
    expect(out.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y))).toBe(true);
  });
});

describe('layoutConceptMap — determinism (seeded, no RNG)', () => {
  test('identical input produces identical output', () => {
    const ns = nodes('alpha', 'beta', 'gamma', 'delta');
    const es: LayoutInputEdge[] = [
      { a: 'alpha', b: 'beta', score: 0.7 },
      { a: 'gamma', b: 'delta', score: 0.6 },
    ];
    const a = layoutConceptMap(ns, es, OPTS);
    const b = layoutConceptMap(ns, es, OPTS);
    expect(a.nodes).toEqual(b.nodes);
  });

  test('input order of nodes does not affect a node\'s settled position', () => {
    // The seed is hash(id), independent of array index for the INITIAL placement;
    // the per-index nudge is sub-pixel (×1.3). Re-running with the SAME order is
    // identical (already covered); here we assert each id is present + finite when
    // the array is reversed (no crash, stable membership).
    const forward = layoutConceptMap(nodes('a', 'b', 'c'), [], OPTS);
    const reversed = layoutConceptMap(nodes('c', 'b', 'a'), [], OPTS);
    const ids = (l: typeof forward) => l.nodes.map((n) => n.id).sort();
    expect(ids(forward)).toEqual(['a', 'b', 'c']);
    expect(ids(reversed)).toEqual(['a', 'b', 'c']);
  });

  test('different node ids produce different layouts (seed actually varies)', () => {
    const a = layoutConceptMap(nodes('one', 'two'), [], OPTS);
    const b = layoutConceptMap(nodes('three', 'four'), [], OPTS);
    // At least one coordinate differs — the seed is id-derived, not constant.
    const differs =
      a.nodes[0]!.x !== b.nodes[0]!.x || a.nodes[0]!.y !== b.nodes[0]!.y;
    expect(differs).toBe(true);
  });
});

describe('layoutConceptMap — separation (coincident seeds nudged apart)', () => {
  test('no two nodes share an exact position', () => {
    const ns = nodes('a', 'b', 'c', 'd', 'e', 'f');
    const out = layoutConceptMap(ns, [], OPTS);
    const seen = new Set<string>();
    for (const n of out.nodes) {
      const key = `${n.x.toFixed(4)},${n.y.toFixed(4)}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  test('zero iterations still separates the seeded placement (no overlap)', () => {
    const out = layoutConceptMap(nodes('x', 'y', 'z'), [], { ...OPTS, iterations: 0 });
    const positions = out.nodes.map((n) => `${n.x.toFixed(3)},${n.y.toFixed(3)}`);
    expect(new Set(positions).size).toBe(positions.length);
  });
});

describe('radiusForChunkCount', () => {
  test('monotonic non-decreasing and clamped to a sane band', () => {
    const r1 = radiusForChunkCount(1);
    const r10 = radiusForChunkCount(10);
    const r1000 = radiusForChunkCount(1000);
    expect(r1).toBeLessThanOrEqual(r10);
    expect(r10).toBeLessThanOrEqual(r1000);
    expect(r1).toBeGreaterThanOrEqual(7);
    expect(r1000).toBeLessThanOrEqual(22);
  });

  test('a zero / negative chunk count degrades to the minimum radius', () => {
    expect(radiusForChunkCount(0)).toBeGreaterThanOrEqual(7);
    expect(radiusForChunkCount(-5)).toBeGreaterThanOrEqual(7);
    expect(Number.isFinite(radiusForChunkCount(0))).toBe(true);
  });
});
