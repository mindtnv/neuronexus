// Concept-map force layout («Блокноты 2.0» N4, Р10) — a tiny, dependency-free
// 2D force simulation for the notebook concept-map SVG. NO d3.
//
// The layout is computed ONCE (a fixed number of ticks at mount) and drawn — it
// is NOT animated frame-by-frame (so `prefers-reduced-motion` is honoured for
// free: there's no motion to suppress). The three forces are the classic trio:
//   • repulsion   — every node pushes every other away (Coulomb-ish, 1/d²).
//   • springs     — each edge pulls its endpoints toward a rest length.
//   • centering   — a gentle pull toward the canvas centre keeps the graph framed.
//
// DETERMINISM is the contract: identical input ⇒ identical output, because the
// initial node positions are SEEDED from a hash of each node id (NOT
// Math.random). This keeps the map stable across remounts / refetches (a user
// staring at the same notebook sees the same picture) and makes the layout
// unit-testable. Coincident seeds are nudged apart deterministically so two nodes
// never share an exact position (which would make repulsion explode to NaN).
//
// Pure: no DOM, no React — just numbers in, numbers out. The SVG component
// (components/notebook/concept-map.tsx) consumes the laid-out coordinates.

export interface LayoutInputNode {
  id: string;
  /** Drives the node radius (clamped) — bigger sections render larger. */
  chunkCount: number;
}

export interface LayoutInputEdge {
  a: string;
  b: string;
  /** Cosine similarity 0..1 — a stronger edge pulls harder + draws heavier. */
  score: number;
}

export interface LaidOutNode {
  id: string;
  x: number;
  y: number;
  /** Pixel radius (chunkCount → log-scaled, clamped to [MIN_R, MAX_R]). */
  r: number;
}

export interface ConceptMapLayout {
  nodes: LaidOutNode[];
  width: number;
  height: number;
}

export interface LayoutOptions {
  width: number;
  height: number;
  /** Simulation ticks (default TICKS). More = more settled, but it's O(n²·ticks). */
  iterations?: number;
}

// ── Tunables ──────────────────────────────────────────────────────────────────
const TICKS = 120;
const MIN_R = 7;
const MAX_R = 22;
/** Repulsion strength (scaled by area so density is canvas-size invariant). */
const REPULSION = 9000;
/** Spring (edge) stiffness. */
const SPRING_K = 0.035;
/** Edge rest length in px. */
const REST_LENGTH = 90;
/** Centering pull toward the canvas middle. */
const CENTER_K = 0.012;
/** Per-tick velocity damping (cooling). */
const DAMPING = 0.85;
/** Cap on per-tick displacement (px) — keeps the sim from exploding. */
const MAX_STEP = 30;

/** FNV-1a 32-bit hash of a string → a stable uint32 (seed source). */
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A seeded [0,1) value derived from a string + a salt (two independent axes). */
function seeded01(id: string, salt: number): number {
  // Mix the salt in, then take the high bits for a well-spread fraction.
  const h = hash32(`${id}#${salt}`);
  return ((h >>> 8) & 0xffffff) / 0x1000000;
}

/** log-scaled node radius from a chunk count, clamped to [MIN_R, MAX_R]. */
export function radiusForChunkCount(chunkCount: number): number {
  const n = Math.max(1, chunkCount);
  const r = MIN_R + Math.log2(n + 1) * 3.2;
  return Math.max(MIN_R, Math.min(MAX_R, r));
}

/**
 * Run the force simulation and return settled node coordinates. Deterministic
 * for a given (nodes, edges, options) — seeded init, fixed tick count, no RNG.
 * Coordinates are clamped into the canvas with a radius-aware margin so nodes
 * never clip the edge. Empty input ⇒ empty layout.
 */
export function layoutConceptMap(
  nodes: LayoutInputNode[],
  edges: LayoutInputEdge[],
  options: LayoutOptions,
): ConceptMapLayout {
  const width = Math.max(1, options.width);
  const height = Math.max(1, options.height);
  const iterations = Math.max(0, options.iterations ?? TICKS);

  if (nodes.length === 0) return { nodes: [], width, height };

  const cx = width / 2;
  const cy = height / 2;

  // Seeded initial placement on a spread around the centre. A small
  // deterministic per-index nudge guarantees no two nodes coincide (coincident
  // points make the 1/d² repulsion divide by zero → NaN).
  interface Body {
    id: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    r: number;
  }
  const bodies: Body[] = nodes.map((n, i) => {
    const ax = seeded01(n.id, 1);
    const ay = seeded01(n.id, 2);
    // Spread across ~70% of the canvas, plus a tiny golden-angle nudge by index
    // so hash collisions can't stack two nodes on the same pixel.
    const nudge = i * 0.61803398875;
    return {
      id: n.id,
      x: cx + (ax - 0.5) * width * 0.7 + Math.cos(nudge) * 1.3,
      y: cy + (ay - 0.5) * height * 0.7 + Math.sin(nudge) * 1.3,
      vx: 0,
      vy: 0,
      r: radiusForChunkCount(n.chunkCount),
    };
  });

  const indexById = new Map(bodies.map((b, i) => [b.id, i]));
  // Resolve edges to body-index pairs once (skip dangling edges defensively).
  const edgePairs = edges
    .map((e) => ({
      i: indexById.get(e.a),
      j: indexById.get(e.b),
      score: Math.max(0, Math.min(1, e.score)),
    }))
    .filter((e): e is { i: number; j: number; score: number } => e.i != null && e.j != null && e.i !== e.j);

  // Repulsion is scaled by the canvas area relative to a 600×400 reference so a
  // tiny mobile canvas doesn't fling everything off-screen.
  const areaScale = (width * height) / (600 * 400);
  const repulsion = REPULSION * Math.max(0.35, Math.min(2, areaScale));

  for (let tick = 0; tick < iterations; tick++) {
    // Cool the system over time (simulated annealing) for a stabler finish.
    const cooling = 1 - tick / (iterations + 1);

    // ── Repulsion (all pairs) ──
    for (let i = 0; i < bodies.length; i++) {
      const bi = bodies[i]!;
      for (let j = i + 1; j < bodies.length; j++) {
        const bj = bodies[j]!;
        let dx = bi.x - bj.x;
        let dy = bi.y - bj.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01) {
          // Coincident (shouldn't happen post-seed, but guard NaN): deterministic
          // split along a fixed axis derived from the pair order.
          dx = (i - j) || 1;
          dy = 1;
          d2 = dx * dx + dy * dy;
        }
        const dist = Math.sqrt(d2);
        const force = (repulsion / d2) * cooling;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        bi.vx += fx;
        bi.vy += fy;
        bj.vx -= fx;
        bj.vy -= fy;
      }
    }

    // ── Springs (edges) ──
    for (const e of edgePairs) {
      const bi = bodies[e.i]!;
      const bj = bodies[e.j]!;
      const dx = bj.x - bi.x;
      const dy = bj.y - bi.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      // A stronger edge (higher score) targets a SHORTER rest length → similar
      // sections cluster tighter.
      const rest = REST_LENGTH * (1 - 0.4 * e.score);
      const displacement = dist - rest;
      const force = SPRING_K * displacement * (0.5 + e.score);
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      bi.vx += fx;
      bi.vy += fy;
      bj.vx -= fx;
      bj.vy -= fy;
    }

    // ── Centering + integrate ──
    for (const b of bodies) {
      b.vx += (cx - b.x) * CENTER_K;
      b.vy += (cy - b.y) * CENTER_K;
      b.vx *= DAMPING;
      b.vy *= DAMPING;
      // Clamp per-tick step so a transient huge force can't NaN/explode.
      const step = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (step > MAX_STEP) {
        const s = MAX_STEP / step;
        b.vx *= s;
        b.vy *= s;
      }
      b.x += b.vx;
      b.y += b.vy;
    }
  }

  // Clamp into the canvas with a radius-aware margin so no node clips an edge.
  const laid: LaidOutNode[] = bodies.map((b) => ({
    id: b.id,
    x: Math.max(b.r + 2, Math.min(width - b.r - 2, b.x)),
    y: Math.max(b.r + 2, Math.min(height - b.r - 2, b.y)),
    r: b.r,
  }));

  return { nodes: laid, width, height };
}
