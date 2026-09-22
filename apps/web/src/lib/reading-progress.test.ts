import { expect, test } from 'bun:test';
import { createReadingProgressWriter } from './reading-progress';
test('leaving before the debounce expires flushes the latest position exactly once to the original source', () => {
  const saved: unknown[] = [];
  const writer = createReadingProgressWriter('book', 'alice', () => 'alice', async (id,state) => { saved.push({ id, state }); });
  writer.write({ page: 2 }); writer.write({ page: 7, percent: 0.7 }); writer.flush(); writer.flush();
  expect(saved).toEqual([{ id: 'book', state: { page: 7, percent: 0.7 } }]);
});
test('an account change discards its pending position instead of writing with replacement credentials', () => {
  const saved: unknown[] = []; let owner = 'alice';
  const writer = createReadingProgressWriter('book', owner, () => owner, async (id,state) => { saved.push({ id,state }); });
  writer.write({ chunkPos: 4 }); owner = 'bob'; writer.flush(); expect(saved).toEqual([]);
});
