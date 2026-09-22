import { ensureTestDom, GlobalRegistrator } from '../../lib/test-dom-setup';
import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import React, { act } from 'react';
import type { Root } from 'react-dom/client';
ensureTestDom();
const { createRoot } = await import('react-dom/client');
const { MessageRow } = await import('./chat-presentation');
let root: Root, host: HTMLDivElement;
beforeEach(() => { ensureTestDom(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT; });
afterAll(() => { try { GlobalRegistrator.unregister(); } catch {} });
test('a rejected edit retains its text while the user changes scope and retries', async () => {
  const edits: string[] = []; let accepted = false;
  await act(async () => root.render(<MessageRow message={{ id: 'user', role: 'user', content: 'Original', citations: [] }}
    resolveCard={() => undefined} deckNameById={new Map()} onConfirm={() => {}} canEdit locale="en" t={key => key}
    onEdit={async text => { edits.push(text); return accepted; }} />));
  await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="chat.message.edit"]')!.click());
  const input = host.querySelector('input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Use only appropriate materials');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
  expect(host.querySelector('input')?.value).toBe('Use only appropriate materials');
  await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  expect(host.querySelector('input')?.value).toBe('Use only appropriate materials');
  accepted = true;
  await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  expect(edits).toEqual(['Use only appropriate materials', 'Use only appropriate materials']);
  expect(host.querySelector('input')).toBeNull();
});
