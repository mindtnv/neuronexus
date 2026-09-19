import { describe, expect, test } from 'bun:test';
import { readEditorDraft, writeEditorDraft, clearEditorDraft, MAX_DRAFT_BYTES, MAX_DRAFTS, DraftStorageError, listEditorDrafts } from './editor-drafts';

class MemoryStorage {
  rows = new Map<string, string>();
  get length() { return this.rows.size; }
  key(i: number) { return [...this.rows.keys()][i] ?? null; }
  getItem(k: string) { return this.rows.get(k) ?? null; }
  setItem(k: string, v: string) { this.rows.set(k, v); }
  removeItem(k: string) { this.rows.delete(k); }
}
const scope = { ownerId: 'alice', kind: 'note' as const, entityId: 'note-1' };
const value = { fields: { Q: 'Unsaved **Markdown**', A: 'answer' }, baseVersion: 'old' };

describe('bounded owner-scoped editor drafts', () => {
  test('round-trips lossless source with its base version across new readers', () => {
    const storage = new MemoryStorage();
    const written = writeEditorDraft(scope, value, null, storage);
    expect(readEditorDraft(scope, storage)).toEqual(written);
    expect(readEditorDraft(scope, storage)?.value).toEqual(value);
    expect(readEditorDraft({ ...scope, ownerId: 'bob' }, storage)).toBeNull();
    expect(readEditorDraft({ ...scope, entityId: 'note-2' }, storage)).toBeNull();
    expect(readEditorDraft({ ...scope, kind: 'type' }, storage)).toBeNull();
  });
  test('new notes and existing notes have independent recovery slots', () => {
    const storage = new MemoryStorage();
    writeEditorDraft(scope, value, null, storage);
    writeEditorDraft({ ...scope, entityId: 'new' }, { fields: { Q: 'New' } }, null, storage);
    expect(readEditorDraft(scope, storage)?.value).toEqual(value);
    expect((readEditorDraft({ ...scope, entityId: 'new' }, storage)?.value as any).fields.Q).toBe('New');
  });
  test('stale tabs cannot overwrite or clear a newer saved draft', () => {
    const storage = new MemoryStorage();
    const first = writeEditorDraft(scope, value, null, storage);
    const next = writeEditorDraft(scope, { fields: { Q: 'Newer' } }, first.revision, storage);
    expect(() => writeEditorDraft(scope, value, first.revision, storage)).toThrow(DraftStorageError);
    expect(clearEditorDraft(scope, first.revision, storage)).toBe(false);
    expect(readEditorDraft(scope, storage)).toEqual(next);
    expect(clearEditorDraft(scope, next.revision, storage)).toBe(true);
    expect(readEditorDraft(scope, storage)).toBeNull();
  });
  test('oversize and capacity limits preserve existing drafts without truncation or eviction', () => {
    const storage = new MemoryStorage();
    const first = writeEditorDraft(scope, value, null, storage);
    expect(() => writeEditorDraft(scope, { text: 'x'.repeat(MAX_DRAFT_BYTES) }, first.revision, storage)).toThrow(DraftStorageError);
    expect(readEditorDraft(scope, storage)).toEqual(first);
    for (let i = 1; i < MAX_DRAFTS; i++) writeEditorDraft({ ...scope, entityId: `note-${i + 1}` }, value, null, storage);
    expect(() => writeEditorDraft({ ...scope, entityId: 'extra' }, value, null, storage)).toThrow(DraftStorageError);
    expect(readEditorDraft(scope, storage)).toEqual(first);
  });
  test('unavailable storage and malformed or foreign envelopes are explicit failures', () => {
    const storage = new MemoryStorage();
    writeEditorDraft(scope, value, null, storage);
    const key = storage.key(0)!;
    storage.setItem(key, '{broken');
    expect(() => readEditorDraft(scope, storage)).toThrow(DraftStorageError);
    storage.setItem(key, JSON.stringify({ version: 1, ...scope, ownerId: 'bob', value }));
    expect(() => readEditorDraft(scope, storage)).toThrow(DraftStorageError);
    storage.getItem = () => { throw new Error('denied'); };
    expect(() => readEditorDraft(scope, storage)).toThrow(DraftStorageError);
  });
});


test('the draft library scopes entries by owner and never exposes an invalid foreign envelope', () => {
  const storage = new MemoryStorage();
  writeEditorDraft(scope, value, null, storage);
  const other = { ...scope, ownerId: 'bob' };
  writeEditorDraft(other, { fields: { Q: 'Bob text' } }, null, storage);
  const bobKey = [...storage.rows.keys()].find(k => k.includes(':bob:'))!;
  storage.setItem(bobKey, storage.getItem(storage.key(0)!)!);
  expect(listEditorDrafts('alice', storage)).toHaveLength(1);
  const bob = listEditorDrafts('bob', storage);
  expect(bob).toEqual([{ scope: other, record: null }]);
  expect(JSON.stringify(bob)).not.toContain('Unsaved');
});
