// Unit tests for the «Блокноты 2.0» N3 coverage gap-prompt builder (Р9). DOM-free.

import { describe, expect, test } from 'bun:test';
import { buildGapPrompt } from './notebook-coverage';
import type { NotebookCoverageGap } from './types';

const TEMPLATE = 'Make flashcards for the section "{heading}" of the source "{source}".';

describe('buildGapPrompt', () => {
  test('substitutes heading + source', () => {
    const gap: NotebookCoverageGap = {
      sourceId: 's1',
      sourceTitle: 'Deep Learning',
      heading: 'Backpropagation',
      uncovered: 12,
    };
    expect(buildGapPrompt(gap, { template: TEMPLATE, noHeadingLabel: 'untitled' })).toBe(
      'Make flashcards for the section "Backpropagation" of the source "Deep Learning".',
    );
  });

  test('null heading → the no-heading label', () => {
    const gap: NotebookCoverageGap = {
      sourceId: 's1',
      sourceTitle: 'Notes',
      heading: null,
      uncovered: 4,
    };
    expect(buildGapPrompt(gap, { template: TEMPLATE, noHeadingLabel: 'untitled' })).toBe(
      'Make flashcards for the section "untitled" of the source "Notes".',
    );
  });

  test('whitespace-only heading collapses to the no-heading label', () => {
    const gap: NotebookCoverageGap = {
      sourceId: 's1',
      sourceTitle: 'Notes',
      heading: '   ',
      uncovered: 1,
    };
    expect(buildGapPrompt(gap, { template: TEMPLATE, noHeadingLabel: 'без заголовка' })).toBe(
      'Make flashcards for the section "без заголовка" of the source "Notes".',
    );
  });
});
