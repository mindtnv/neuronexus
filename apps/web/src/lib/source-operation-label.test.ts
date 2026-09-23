import { expect, test } from 'bun:test';
import { sourceOperationLabel } from './source-operation-label';
import { operationHref } from './operations-api';
import ru from './messages/ru/operations';
import en from './messages/en/operations';

test('readable indexing and disabled search have distinct, translated capability messages', () => {
  const t = (key: string) => key;
  expect(sourceOperationLabel({ status: 'indexing', total: 3, searchAvailable: true }, t)).toBe('operations.phases.search_preparing');
  expect(sourceOperationLabel({ status: 'indexing', total: 3, searchAvailable: false }, t)).toBe('operations.phases.search_unavailable');
  expect(sourceOperationLabel({ status: 'error', total: 3, errorCode: 'index_failed' }, t)).toBe('operations.phases.search_unavailable');
  expect(sourceOperationLabel({ status: 'error', total: 0, errorCode: 'parse_failed' }, t)).toBeNull();
  expect(ru.phases.search_preparing).toContain('Можно читать');
  expect(en.phases.search_preparing).toContain('Ready to read');
});
test('operation destinations address the exact artifact and use retained work without a source', () => {
  expect(operationHref({ kind: 'source', id: 'book' })).toBe('/library/book');
  expect(operationHref({ kind: 'source-artifact', id: 'quiz', sourceId: 'book' })).toBe('/library/book?artifact=quiz');
  expect(operationHref({ kind: 'source-artifact', id: 'quiz', sourceId: null })).toBe('/library/study?artifact=quiz');
  expect(operationHref({ kind: 'notebook-artifact', id: 'quiz', notebookId: 'notebook' })).toBe('/notebooks/notebook?artifact=quiz');
});
