// «Урожай выделений → карточки» (feature #2) — unit tests for the PURE wizard
// helpers (no DOM / no fetch). Candidates + decisions in → apply payload out:
// exclusion, inline-edit override, empty-front drop, order preservation,
// length-mismatch safety, and the count/seed helpers.

import { describe, expect, test } from 'bun:test';
import {
  buildHarvestSelection,
  harvestSelectionCount,
  initialDecisions,
  type HarvestDecision,
} from './harvest';
import type { HarvestCandidate } from '@/lib/types';

function cand(partial: Partial<HarvestCandidate> & { front: string }): HarvestCandidate {
  return {
    origin: partial.origin ?? { kind: 'mark', markId: crypto.randomUUID() },
    page: partial.page ?? null,
    front: partial.front,
    back: partial.back ?? 'B',
    quote: partial.quote ?? 'a quote',
  };
}

const keep = (front: string, back: string): HarvestDecision => ({ include: true, front, back });
const drop = (front = '', back = ''): HarvestDecision => ({ include: false, front, back });

describe('buildHarvestSelection', () => {
  test('all included, unedited → echoes the candidates verbatim', () => {
    const cs = [cand({ front: 'Q1' }), cand({ front: 'Q2' })];
    const out = buildHarvestSelection(cs, [keep('Q1', 'B'), keep('Q2', 'B')]);
    expect(out.length).toBe(2);
    expect(out[0]!.front).toBe('Q1');
    expect(out[1]!.front).toBe('Q2');
  });

  test('excluded cards are dropped', () => {
    const cs = [cand({ front: 'Q1' }), cand({ front: 'Q2' }), cand({ front: 'Q3' })];
    const out = buildHarvestSelection(cs, [keep('Q1', 'B'), drop(), keep('Q3', 'B')]);
    expect(out.map((c) => c.front)).toEqual(['Q1', 'Q3']);
  });

  test('inline-edited front/back override the candidate (trimmed)', () => {
    const cs = [cand({ front: 'orig front', back: 'orig back' })];
    const out = buildHarvestSelection(cs, [keep('  edited front  ', '  edited back ')]);
    expect(out[0]!.front).toBe('edited front');
    expect(out[0]!.back).toBe('edited back');
  });

  test('origin / page / quote are preserved from the candidate', () => {
    const origin = { kind: 'ink' as const, page: 5 };
    const cs = [cand({ front: 'Q', origin, page: 5, quote: 'the source passage' })];
    const out = buildHarvestSelection(cs, [keep('Q edited', 'A')]);
    expect(out[0]!.origin).toEqual(origin);
    expect(out[0]!.page).toBe(5);
    expect(out[0]!.quote).toBe('the source passage');
  });

  test('a card whose front trims to empty is dropped (never sent as empty_card)', () => {
    const cs = [cand({ front: 'Q1' }), cand({ front: 'Q2' })];
    const out = buildHarvestSelection(cs, [keep('   ', 'B'), keep('Q2', 'B')]);
    expect(out.map((c) => c.front)).toEqual(['Q2']);
  });

  test('empty back is allowed (only front is required)', () => {
    const cs = [cand({ front: 'Q1' })];
    const out = buildHarvestSelection(cs, [keep('Q1', '   ')]);
    expect(out.length).toBe(1);
    expect(out[0]!.back).toBe('');
  });

  test('decisions shorter than candidates → only the decided prefix is built', () => {
    const cs = [cand({ front: 'Q1' }), cand({ front: 'Q2' })];
    const out = buildHarvestSelection(cs, [keep('Q1', 'B')]);
    expect(out.map((c) => c.front)).toEqual(['Q1']);
  });

  test('no candidates → empty array', () => {
    expect(buildHarvestSelection([], [])).toEqual([]);
  });
});

describe('harvestSelectionCount', () => {
  test('counts only the cards that would actually be created', () => {
    const cs = [cand({ front: 'Q1' }), cand({ front: 'Q2' }), cand({ front: 'Q3' })];
    const decisions = [keep('Q1', 'B'), drop(), keep('  ', 'B')]; // one excluded, one empty
    expect(harvestSelectionCount(cs, decisions)).toBe(1);
  });
});

describe('initialDecisions', () => {
  test('seeds every card included with its proposed front/back', () => {
    const cs = [cand({ front: 'Q1', back: 'A1' }), cand({ front: 'Q2', back: 'A2' })];
    const d = initialDecisions(cs);
    expect(d).toEqual([
      { include: true, front: 'Q1', back: 'A1' },
      { include: true, front: 'Q2', back: 'A2' },
    ]);
  });
});
