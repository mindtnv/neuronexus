// AST → client predicate: `buildCardPredicate(ast, ctx): (card) => boolean`.
//
// This is the CLIENT back-end of the one-AST-two-consumers design (the server
// SQL builder is the other; it lives in apps/api and consumes the same AST
// types). Pure-TS, no DOM/Node deps.
//
// Determinism contract (Critic must-fix C2): `now` and deck-name resolution are
// INJECTED via `ctx`. This module NEVER calls `Date.now()` inline, so time-
// relative operators (`is:due`, `added:N`, `edited:N`, `prop:due`) are testable
// with a pinned clock and stay in parity with the server (which passes the same
// per-request `now`).

import type { CardState } from './index.ts';
import { likeToRegex } from './card-query-match.ts';
import type {
  CardQueryNode,
  CompareOp,
  PropField,
  TermNode,
} from './card-query.ts';

/**
 * Minimal structural shape a card must satisfy to be filtered. Built from the UI
 * `Card` (or a server row) by the caller. Timestamps are epoch milliseconds.
 *
 * Adapter note: `scheduledDays` must come from the FSRS scheduled interval
 * (`card.fsrs.scheduled_days`, snake_case in ts-fsrs / `mappers.ts:49`) — that
 * is what `prop:ivl` reads. `state` is the lowercase label
 * (`new|learning|review|relearning`), matching the DB column and the server.
 */
export interface CardLike {
  front: string;
  back: string;
  clozeText?: string | null;
  tags: string[];
  variant: 'basic' | 'cloze' | 'type';
  deckId: string;
  state: CardState;
  suspended: boolean;
  /** epoch ms */
  due: number;
  /** epoch ms */
  createdAt: number;
  /** epoch ms */
  updatedAt: number;
  lapses: number;
  reps: number;
  stability: number;
  difficulty: number;
  /** FSRS scheduled interval in days; backs `prop:ivl`. */
  scheduledDays: number;
}

export interface PredicateContext {
  /**
   * Injected "current time" in epoch ms. NEVER read `Date.now()` inside this
   * module — the caller pins this so client/server agree and tests are stable.
   */
  now: number;
  /**
   * Resolve a `deck:` value to the set of matching deck ids. `nested` is true
   * when the subtree should be included (always true for the plain `deck:` form
   * per AC7; the `::*` marker is an explicit hint). Deck-table knowledge is
   * injected so shared stays deck-table-agnostic.
   */
  resolveDeckIds(value: string, nested: boolean): string[];
}

const MS_PER_DAY = 86_400_000;

/**
 * Compile an AST into a predicate over {@link CardLike}. The returned function
 * is pure given the same `ctx`.
 */
export function buildCardPredicate(
  ast: CardQueryNode,
  ctx: PredicateContext,
): (card: CardLike) => boolean {
  return (card: CardLike) => evalNode(ast, card, ctx);
}

function evalNode(node: CardQueryNode, card: CardLike, ctx: PredicateContext): boolean {
  switch (node.kind) {
    case 'empty':
      return true;
    case 'and':
      return node.children.every((c) => evalNode(c, card, ctx));
    case 'or':
      return node.children.some((c) => evalNode(c, card, ctx));
    case 'not':
      return !evalNode(node.child, card, ctx);
    case 'group':
      return evalNode(node.child, card, ctx);
    case 'term':
      return evalTerm(node, card, ctx);
  }
}

function evalTerm(term: TermNode, card: CardLike, ctx: PredicateContext): boolean {
  switch (term.field) {
    case 'text':
      return (
        substringMatch(card.front, term.value) ||
        substringMatch(card.back, term.value) ||
        substringMatch(card.clozeText ?? '', term.value)
      );

    case 'front':
      return fieldMatch(card.front, term.value);
    case 'back':
      return fieldMatch(card.back, term.value);
    case 'cloze':
      return fieldMatch(card.clozeText ?? '', term.value);

    case 'deck': {
      const ids = ctx.resolveDeckIds(term.value, term.nested ?? true);
      return ids.includes(card.deckId);
    }

    case 'tag':
      return tagMatch(card.tags, term.value);

    case 'is':
      return isMatch(term.value, card, ctx.now);

    case 'variant':
      return card.variant === term.value;

    case 'added':
      return withinDays(card.createdAt, term.value, ctx.now);
    case 'edited':
      return withinDays(card.updatedAt, term.value, ctx.now);

    case 'prop':
      return propMatch(term, card, ctx.now);
  }
}

// ── text matching ─────────────────────────────────────────────────────────────

/**
 * Substring match (bareword / front:/back:/cloze:). Wildcards `*`/`_` are
 * honored via likeToRegex; with no wildcard we still do a case-insensitive
 * substring (by wrapping the value in `*…*`). All regex translation goes through
 * the shared helper — no inline regex (Architect should-fix #7).
 */
function substringMatch(haystack: string, value: string): boolean {
  // Substring semantics: anchor-free match → wrap in implicit wildcards.
  return likeToRegex(`*${value}*`).test(haystack);
}

/**
 * `field:value` matching. Empty value (`front:`) → field must be empty (AC7). If
 * the value contains an explicit wildcard, it is treated as a full-pattern match
 * over the field; otherwise it is a substring match.
 */
function fieldMatch(fieldValue: string, value: string): boolean {
  if (value === '') return fieldValue === '';
  if (value.includes('*') || value.includes('_')) {
    // Explicit pattern. Substring semantics: allow the pattern to match anywhere
    // by wrapping with implicit `*` on both sides.
    return likeToRegex(`*${value}*`).test(fieldValue);
  }
  return substringMatch(fieldValue, value);
}

// ── tags ──────────────────────────────────────────────────────────────────────

function tagMatch(tags: string[], value: string): boolean {
  if (value === 'none') return tags.length === 0;
  if (value.includes('*') || value.includes('_')) {
    const re = likeToRegex(value);
    return tags.some((t) => re.test(t));
  }
  // exact (case-insensitive) membership
  const lower = value.toLowerCase();
  return tags.some((t) => t.toLowerCase() === lower);
}

// ── is: ───────────────────────────────────────────────────────────────────────

function isMatch(value: string, card: CardLike, now: number): boolean {
  switch (value) {
    case 'new':
      return card.state === 'new';
    case 'learn':
      // Anki's "learn" covers both learning and relearning queues.
      return card.state === 'learning' || card.state === 'relearning';
    case 'review':
      return card.state === 'review';
    case 'due':
      // Due = scheduled at-or-before now AND not suspended (Critic C2 boundary
      // contract: `<=` is inclusive).
      return card.due <= now && !card.suspended;
    case 'suspended':
      return card.suspended;
    default:
      return false;
  }
}

// ── added: / edited: ──────────────────────────────────────────────────────────

/**
 * `added:N` / `edited:N` → the timestamp falls within the last N days of `now`
 * (inclusive lower bound at `now - N*day`). Non-numeric / non-positive N → no
 * match.
 */
function withinDays(ts: number, value: string, now: number): boolean {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return false;
  const cutoff = now - n * MS_PER_DAY;
  return ts >= cutoff && ts <= now;
}

// ── prop: ─────────────────────────────────────────────────────────────────────

function propMatch(term: TermNode, card: CardLike, now: number): boolean {
  const prop = term.prop ?? 'reps';
  const op = term.op ?? '=';
  const actual = propValue(prop, card);
  const operand = propOperand(prop, term.value, now);
  if (!Number.isFinite(operand)) return false;
  return compareNum(actual, op, operand);
}

function propValue(prop: PropField, card: CardLike): number {
  switch (prop) {
    case 'reps':
      return card.reps;
    case 'lapses':
      return card.lapses;
    case 'due':
      return card.due;
    case 's':
      return card.stability;
    case 'd':
      return card.difficulty;
    case 'ivl':
      // Pinned decision (plan Phase 1): `prop:ivl` maps to the FSRS scheduled
      // interval in days.
      return card.scheduledDays;
  }
}

/**
 * Interpret the operand for a prop. For `prop:due` the operand is a relative day
 * offset (Anki-style: `prop:due<=3` = due within 3 days), resolved against the
 * injected `now`. All other props compare against the raw number.
 */
function propOperand(prop: PropField, raw: string, now: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return NaN;
  if (prop === 'due') return now + n * MS_PER_DAY;
  return n;
}

function compareNum(a: number, op: CompareOp, b: number): boolean {
  switch (op) {
    case '=':
      return a === b;
    case '!=':
      return a !== b;
    case '<':
      return a < b;
    case '>':
      return a > b;
    case '<=':
      return a <= b;
    case '>=':
      return a >= b;
  }
}
