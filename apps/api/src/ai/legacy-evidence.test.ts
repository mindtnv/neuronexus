import { expect, test } from 'bun:test';
import { evidenceExcerpt, legacyChunkEvidence } from './legacy-evidence';
test('legacy snapshots respect UTF-16 budgets without breaking astral characters', () => {
  expect(evidenceExcerpt('A🧠B', 2)).toBe('A');
  expect(evidenceExcerpt('A🧠B', 3)).toBe('A🧠');
  const snapshot = legacyChunkEvidence({ id: 'source', title: 'T'.repeat(199) + '🧠' },
    { id: 'chunk', text: 'Q'.repeat(319) + '🧠', position: 0, page: null, sourceHash: null });
  expect(snapshot.sourceTitle).toBe('T'.repeat(199)); expect(snapshot.quote).toBe('Q'.repeat(319));
});
