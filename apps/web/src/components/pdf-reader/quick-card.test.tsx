import { ensureTestDom, GlobalRegistrator } from '../../lib/test-dom-setup';
import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import React, { act } from 'react';
import type { Root } from 'react-dom/client';
import { DialogProvider } from '../dialog';
import { useNN } from '../../lib/store';
ensureTestDom();
const { createRoot } = await import('react-dom/client');
const { QuickCardDialog } = await import('./quick-card');
let root: Root, host: HTMLDivElement, oldFetch: typeof fetch;
beforeEach(() => {
  ensureTestDom(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  oldFetch = globalThis.fetch; useNN.setState({ decks: [], profile: { userId: 'owner' } as any });
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); globalThis.fetch = oldFetch; useNN.getState().reset(); delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT; });
afterAll(() => { try { GlobalRegistrator.unregister(); } catch {} });
const t = (key: string) => key;
const render = (children: React.ReactNode) => root.render(<DialogProvider>{children}</DialogProvider>);
async function enterName() {
  const plus = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes('Создать колоду') || b.textContent?.includes('Create a deck') || b.textContent?.includes('assistant.newDestinationDeck'))!;
  await act(async () => plus.click());
  const input = host.querySelector('input[maxlength="100"]')! as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Kubernetes');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  return input;
}

test('a fresh account creates a destination and submits the original source-backed card draft', async () => {
  let submitted: any, created = '', closed = false, deckRequests = 0;
  globalThis.fetch = (async (url: any, init: any) => {
    if (String(url).endsWith('/decks')) {
      deckRequests++;
      return Response.json({ id: 'new-deck', name: 'Kubernetes', color: 'lime', createdAt: new Date().toISOString() });
    }
    submitted = JSON.parse(init.body);
    return Response.json({ noteId: 'note', cardIds: ['card'] });
  }) as unknown as typeof fetch;
  await act(async () => render(<QuickCardDialog open sourceId="source" sourceName="Book" sourceVersion="2026-09-21T00:00:00.000Z" page={7} quote="Original quote"
    prefillFront="My question" prefillBack="My edited answer" chatEnabled={false} t={t}
    onCreated={(_result,id) => { created = id; }} onClose={() => { closed = true; }} />));
  const input = await enterName();
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  expect(deckRequests).toBe(1);
  expect(Array.from(host.querySelectorAll('textarea')).map(e => e.value)).toEqual(['My question', 'My edited answer']);
  expect(closed).toBe(false);
  const save = Array.from(host.querySelectorAll('button')).find(b => b.textContent === 'notebooks.quickcard.createBtn')!;
  expect(save.disabled).toBe(false);
  await act(async () => { save.click(); await new Promise(resolve => setTimeout(resolve, 0)); });
  expect(submitted).toMatchObject({ deckId: 'new-deck', front: 'My question', back: 'My edited answer', page: 7, quote: 'Original quote' });
  expect(submitted.pdfSelection).toEqual({ version: 1, sourceVersion: '2026-09-21T00:00:00.000Z', page: 7, quote: 'Original quote' });
  expect(created).toBe('card'); expect(closed).toBe(true);
});

test('failed destination creation preserves the card fields and permits a retry', async () => {
  globalThis.fetch = (async () => Response.json({ error: 'unavailable' }, { status: 500 })) as unknown as typeof fetch;
  await act(async () => render(<QuickCardDialog open sourceId="source" sourceName="Book" quote="Preserved quote"
    prefillFront="Question" chatEnabled={false} t={t} onCreated={() => {}} onClose={() => {}} />));
  const input = await enterName();
  await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await new Promise(resolve => setTimeout(resolve, 0)); });
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  expect(input.value).toBe('Kubernetes'); expect(input.disabled).toBe(false);
  expect(Array.from(host.querySelectorAll('textarea')).map(e => e.value)).toEqual(['Question', 'Preserved quote']);
});

test('text selections reach the save endpoint intact after the card is edited', async () => {
  let submitted: any;
  const textSelection = { version: 1 as const, quote: 'Original selected quote', chunks: [{
    chunkId: '01900000-0000-7000-8000-000000000001', textHash: 'a'.repeat(64), renderedHash: 'b'.repeat(64), start: 4, end: 27,
  }] };
  globalThis.fetch = (async (url: any, init: any) => {
    if (String(url).endsWith('/decks')) return Response.json({ id: 'new-deck', name: 'Kubernetes', color: 'lime' });
    submitted = JSON.parse(init.body); return Response.json({ noteId: 'note', cardIds: ['card'] });
  }) as unknown as typeof fetch;
  await act(async () => render(<QuickCardDialog open sourceId="source" sourceName="Book" quote={textSelection.quote} textSelection={textSelection}
    prefillFront="Edited question" prefillBack="Edited answer" chatEnabled={false} t={t} onCreated={() => {}} onClose={() => {}} />));
  const input = await enterName();
  await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  const save = Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'notebooks.quickcard.createBtn')!;
  await act(async () => { save.click(); });
  expect(submitted.textSelection).toEqual(textSelection);
  expect(submitted.front).toBe('Edited question'); expect(submitted.back).toBe('Edited answer');
  expect(submitted.page).toBeUndefined(); expect(submitted.rects).toBeUndefined();
});

test('harvest transport keeps date-looking content and evidence versions as literal strings', async () => {
  const candidate = { origin: { kind: 'ink' as const, page: 1 }, page: 1, front: '2026-09-21', back: '2026-09-22', quote: '2026-09-20',
    evidence: { sourceVersion: '2026-09-21T00:00:00.000Z', originHash: 'a'.repeat(64) } };
  globalThis.fetch = (async () => Response.json({ candidates: [candidate] })) as unknown as typeof fetch;
  expect(await useNN.getState().harvestCards('source')).toEqual([candidate]);
});

test('closing an edited selection card asks before losing its source-backed fields', async () => {
  let closed = false;
  await act(async () => render(<QuickCardDialog open sourceId="source" sourceName="Book" quote="Original source passage" chatEnabled={false} t={t} onCreated={() => {}} onClose={() => { closed = true; }} />));
  await act(async () => { const input = host.querySelector('textarea')!; Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, 'Keep my edited question'); input.dispatchEvent(new Event('input', { bubbles: true })); });
  await act(async () => host.querySelector('textarea')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(closed).toBe(false); expect(document.body.textContent).toContain('editor.draft.leaveTitle');
  await act(async () => [...document.querySelectorAll('button')].find(button => button.textContent === 'editor.draft.stay')!.click());
  expect(host.querySelector('textarea')!.value).toBe('Keep my edited question'); expect([...host.querySelectorAll('textarea')][1]!.value).toBe('Original source passage');
});

test('a submitted selection card holds its inputs and ignores duplicate submit or close until settlement', async () => {
  useNN.setState({ decks: [{ id: 'deck', name: 'Deck', color: 'lime', position: 0 }] as any });
  const response = Promise.withResolvers<Response>(); let writes = 0, closed = false;
  globalThis.fetch = (async () => { writes++; return response.promise; }) as unknown as typeof fetch;
  await act(async () => render(<QuickCardDialog open sourceId="source" sourceName="Book" prefillFront="Question" quote="Original quote" chatEnabled={false} t={t} onCreated={() => {}} onClose={() => { closed = true; }} />));
  await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === 'notebooks.quickcard.createBtn')!.click());
  expect([...host.querySelectorAll('textarea')].every(input => input.disabled)).toBe(true);
  await act(async () => host.querySelector('[role="dialog"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true })));
  await act(async () => host.querySelector('[role="dialog"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(writes).toBe(1); expect(closed).toBe(false);
  await act(async () => response.resolve(Response.json({ noteId: 'note', cardIds: ['card'] })));
  expect(closed).toBe(true);
});
