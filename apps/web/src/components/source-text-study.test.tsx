import { ensureTestDom, GlobalRegistrator } from '../lib/test-dom-setup';
import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import React, { act, useRef } from 'react';
import type { Root } from 'react-dom/client';
import { DialogProvider } from './dialog';
ensureTestDom();
const { createRoot } = await import('react-dom/client');
const { SourceTextStudy } = await import('./source-text-study');
let root: Root, host: HTMLDivElement, oldFetch: typeof fetch;
const chunkId = '01900000-0000-7000-8000-000000000001';
const chunks = [{ id: chunkId, text: 'A **Pod** groups containers.', position: 0 }] as any;
function Fixture({ onJump = () => {} }: { onJump?: (id: string) => void } = {}) {
  const reader = useRef<HTMLDivElement>(null);
  return <DialogProvider><div ref={reader}><SourceTextStudy sourceId="book" host={reader} chunks={chunks} onJump={onJump} />
    <div data-chunk-id={chunkId}><div data-source-text-body>A <b>Pod</b> groups containers.</div></div>
  </div></DialogProvider>;
}
beforeEach(() => { ensureTestDom(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; oldFetch = globalThis.fetch;
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { window.getSelection()?.removeAllRanges(); await act(async () => root.unmount()); host.remove(); globalThis.fetch = oldFetch; delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT; });
afterAll(() => { try { GlobalRegistrator.unregister(); } catch {} });
test('a text selection saves a source mark with render locators and no PDF coordinates', async () => {
  let body: any;
  globalThis.fetch = (async (_url: any, init: any) => {
    if (init?.method === 'POST') { body = JSON.parse(init.body); return Response.json({ id: 'mark', ...body }); }
    return Response.json({ items: [], nextOffset: null });
  }) as typeof fetch;
  await act(async () => root.render(<Fixture />));
  const range = document.createRange(); range.selectNodeContents(host.querySelector('b')!);
  await act(async () => { window.getSelection()!.addRange(range); document.dispatchEvent(new Event('selectionchange')); await new Promise(resolve => setTimeout(resolve, 10)); });
  const highlight = Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'assistant.highlightText')!;
  expect(highlight).toBeDefined();
  await act(async () => { highlight.click(); await new Promise(resolve => setTimeout(resolve, 0)); });
  expect(body.kind).toBe('highlight'); expect(body.selection.quote).toBe('Pod'); expect(body.selection.chunks[0].chunkId).toBe(chunkId);
  expect(body.selection.chunks[0].start).toBe(2); expect(body.page).toBeUndefined(); expect(body.rects).toBeUndefined();
});


for (const stale of [false, true]) test(`saved selection actions use ${stale ? 'a quote-only fallback' : 'the exact chunk'} without creating a notebook`, async () => {
  const selection = { version: 1, quote: 'Historical selected text', chunks: [{ chunkId, textHash: 'a'.repeat(64), renderedHash: 'b'.repeat(64), start: 0, end: 3 }] };
  const requests: string[] = []; let jump = '', asked: any;
  globalThis.fetch = (async (url: any, init: any) => {
    requests.push(`${init?.method ?? 'GET'} ${String(url)}`);
    return Response.json({ items: [{ id: 'saved-mark', kind: 'note', note: 'My annotation', selection, anchorStatus: stale ? 'unavailable' : 'anchored' }], nextOffset: null });
  }) as unknown as typeof fetch;
  const listener = (event: Event) => { asked = (event as CustomEvent).detail; };
  window.addEventListener('nn:assistant:ask', listener);
  try {
    await act(async () => root.render(<Fixture onJump={id => { jump = id; }} />));
    await act(async () => Array.from(host.querySelectorAll('button')).find(button => button.textContent?.includes('assistant.textMarks'))!.click());
    expect(host.textContent).toContain('Historical selected text'); expect(host.textContent).toContain('My annotation');
    const read = Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'assistant.readSource');
    if (stale) { expect(read).toBeUndefined(); expect(host.textContent).toContain('assistant.anchorUnavailable'); }
    else { await act(async () => read!.click()); expect(jump).toBe(chunkId); }
    await act(async () => Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'assistant.askObject')!.click());
    expect(asked.ref).toMatchObject({ kind: 'source_passage', id: 'book', locator: { quote: selection.quote } });
    expect(asked.ref.locator.chunks).toEqual(stale ? undefined : [{ chunkId }]);
    expect(requests.every(request => request.startsWith('GET ') && !request.includes('/notebooks'))).toBe(true);
  } finally { window.removeEventListener('nn:assistant:ask', listener); }
});

test('pending highlight restoration stops when the reader unmounts', async () => {
  const cssDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'CSS'), highlightDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'Highlight');
  const originalDigest = crypto.subtle.digest;
  let finish!: (value: ArrayBuffer) => void, started!: () => void, painted = 0;
  const entered = new Promise<void>(resolve => { started = resolve; });
  const pending = new Promise<ArrayBuffer>(resolve => { finish = resolve; });
  Object.defineProperty(globalThis, 'CSS', { configurable: true, value: { highlights: { set() { painted++; }, delete() {} } } });
  Object.defineProperty(globalThis, 'Highlight', { configurable: true, value: class {} });
  crypto.subtle.digest = (async () => { started(); return pending; }) as typeof crypto.subtle.digest;
  globalThis.fetch = (async () => Response.json({ items: [1, 2].map(id => ({ id: String(id), kind: 'highlight', anchorStatus: 'anchored',
    selection: { version: 1, quote: 'Pod', chunks: [{ chunkId, textHash: 'a'.repeat(64), renderedHash: '0'.repeat(64), start: 2, end: 5 }] } })), nextOffset: null })) as unknown as typeof fetch;
  try {
    await act(async () => root.render(<Fixture />)); await entered;
    const baseline = painted;
    await act(async () => root.unmount());
    await act(async () => { finish(new Uint8Array(32).buffer); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(painted).toBe(baseline);
  } finally {
    finish?.(new Uint8Array(32).buffer); crypto.subtle.digest = originalDigest;
    if (cssDescriptor) Object.defineProperty(globalThis, 'CSS', cssDescriptor); else delete (globalThis as any).CSS;
    if (highlightDescriptor) Object.defineProperty(globalThis, 'Highlight', highlightDescriptor); else delete (globalThis as any).Highlight;
  }
});
