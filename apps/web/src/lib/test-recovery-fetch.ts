// Test-only transport adapter: reuse existing domain fixtures while exercising
// the versioned client envelope. Real receipt semantics have API integration tests.
import { newUuidV7 } from '@neuronexus/shared';

export function adaptRecoveryFetch(domainFetch: typeof fetch): typeof fetch {
  const receipts = new Map<string, unknown>();
  return (async (url: unknown, init?: RequestInit) => {
    const path = String(url);
    if (!path.includes('/ui-actions/v1/')) return domainFetch(url as RequestInfo, init);
    if (path.endsWith('/session')) return Response.json({ sessionId: newUuidV7(), serverTime: new Date().toISOString() });
    if (path.includes('/receipts/')) {
      const result = receipts.get(path.split('/').at(-1)!);
      return result ? Response.json(result) : Response.json({ error: 'receipt_not_found' }, { status: 404 });
    }
    const envelope = JSON.parse(String(init?.body));
    const legacyPath = path.replace('/ui-actions/v1/card-notes', '/notes').replace('/ui-actions/v1', '');
    const response = await domainFetch(legacyPath, { ...init, body: JSON.stringify(envelope.input) });
    if (!response.ok) return response;
    const data = await response.json();
    const note = data.note ?? data;
    const result = { result: data, replayed: false, outcome: 'applied', serverTime: new Date().toISOString(),
      receipt: { id: newUuidV7(), requestId: envelope.requestId, kind: path.includes('/card-notes') ? 'card-note-save' : 'note-type-save',
        label: note.name ?? 'Card', target: { kind: path.includes('/card-notes') ? 'card-note' : 'note-type', id: note.id, revision: note.updatedAt ?? '' },
        createdAt: new Date().toISOString(), consumedAt: null, undoUntil: null } };
    receipts.set(envelope.requestId, result);
    return Response.json(result);
  }) as unknown as typeof fetch;
}
