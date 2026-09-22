import { expect, test } from 'bun:test';
import { restoreNotebookSourceScope, newlyReadableNotebookSources } from './notebook-source-scope';
const rows = [
  { id: 'ready', status: 'ready' }, { id: 'parsed', status: 'indexing' },
  { id: 'index-error', status: 'error', errorCode: 'index_failed' },
  { id: 'parse-error', status: 'error', errorCode: 'parse_failed' }, { id: 'pending', status: 'pending' },
];
test('notebook scope can select parsed material without selecting parser failures', () => {
  expect([...restoreNotebookSourceScope(rows, null)]).toEqual(['ready', 'parsed', 'index-error']);
  expect([...restoreNotebookSourceScope(rows, [])]).toEqual([]);
  expect([...restoreNotebookSourceScope(rows, ['parsed', 'foreign', 'parse-error'])]).toEqual(['parsed']);
  expect([...restoreNotebookSourceScope(rows, { broken: true })]).toEqual(['ready', 'parsed', 'index-error']);
});
test('finishing indexing cannot silently reselect a previously available, unchecked source', () => {
  expect(newlyReadableNotebookSources(rows, [{ id: 'parsed', status: 'ready' }])).toEqual([]);
  expect(newlyReadableNotebookSources(rows, [{ id: 'pending', status: 'indexing' }, { id: 'unknown', status: 'ready' }])).toEqual(['pending']);
});
