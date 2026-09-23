import { ensureTestDom, GlobalRegistrator } from './test-dom-setup';
import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import React, { act, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Root } from 'react-dom/client';
import { useNN } from './store';
import { LayerParent, useTransientLayer } from './use-transient-layer';
import { useNavigationGuard } from '../components/navigation';
import { transientLayers } from './layer-stack';
ensureTestDom(); const { createRoot } = await import('react-dom/client');
let root: Root, host: HTMLDivElement;
beforeEach(() => { ensureTestDom(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  useNN.setState({ profile: { userId: 'layers-owner' } as any }); host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); useNN.getState().reset(); transientLayers.setOwner(''); delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT; });
afterAll(() => { try { GlobalRegistrator.unregister(); } catch {} });
function Menu({ close }: { close: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useTransientLayer({ root: ref, onClose: close });
  return createPortal(<div ref={ref} role="menu"><button>Menu action</button></div>, document.body);
}
function Frame({ guard, onDanger = () => {} }: { guard?: () => Promise<boolean>; onDanger?: () => void }) {
  const [open, setOpen] = useState(true), [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const layer = useTransientLayer({ root: ref, enabled: open, modal: true, onClose: () => setOpen(false) });
  useNavigationGuard(guard ?? (async () => true), open ? layer.id : false);
  return <><button data-danger="true" onClick={onDanger}>Underlying delete</button>{open && <LayerParent.Provider value={layer.id}>
    <div ref={ref} role="dialog"><input aria-label="Draft" defaultValue="kept" /><button onClick={event => { event.currentTarget.focus(); setMenu(true); }}>Menu</button>
      {menu && <Menu close={() => setMenu(false)} />}</div>
  </LayerParent.Provider>}</>;
}
test('portalled menus own their interaction and Escape closes exactly one layer, except during composition', async () => {
  await act(async () => root.render(<Frame />));
  const trigger = [...host.querySelectorAll('button')].find(button => button.textContent === 'Menu')!;
  await act(async () => trigger.click());
  const menu = document.querySelector('[role="menu"]')!;
  await act(async () => menu.querySelector('button')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })));
  expect(host.querySelector('[role="dialog"]')).not.toBeNull(); expect(document.querySelector('[role="menu"]')).not.toBeNull();
  await act(async () => menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, isComposing: true })));
  expect(document.querySelector('[role="menu"]')).not.toBeNull();
  await act(async () => menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(document.querySelector('[role="menu"]')).toBeNull(); expect(host.querySelector('[role="dialog"]')).not.toBeNull();
  expect(document.activeElement).toBe(trigger);
});
test('outside dismissal consumes the initiating click instead of activating a control underneath', async () => {
  let deleted = 0; await act(async () => root.render(<Frame onDanger={() => deleted++} />));
  const button = host.querySelector('button')!;
  await act(async () => button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, cancelable: true })));
  await act(async () => button.click());
  expect(host.querySelector('[role="dialog"]')).toBeNull(); expect(deleted).toBe(0);
  await act(async () => button.click()); expect(deleted).toBe(1);
});
test('dirty guards retain input and are checked only once for overlapping close requests', async () => {
  const decision = Promise.withResolvers<boolean>(); let checks = 0;
  await act(async () => root.render(<Frame guard={async () => { checks++; return decision.promise; }} />));
  await act(async () => { void transientLayers.dismissTop('escape'); void transientLayers.dismissTop('outside'); });
  expect(checks).toBe(1);
  await act(async () => decision.resolve(false));
  expect(host.querySelector('input')!.value).toBe('kept'); expect(host.querySelector('[role="dialog"]')).not.toBeNull();
});

test('a vanished invoker falls back to the workspace instead of leaving keyboard focus lost', async () => {
  const trigger = document.createElement('button'), main = document.createElement('main');
  main.tabIndex = -1; document.body.append(trigger, main); trigger.focus();
  try {
    await act(async () => root.render(<Frame />));
    trigger.remove();
    await act(async () => { await transientLayers.dismissTop('escape'); });
    expect(document.activeElement).toBe(main);
  } finally { trigger.remove(); main.remove(); }
});

test('viewport presentation changes keep the same dirty guard registered', async () => {
  function Responsive({ mobile }: { mobile: boolean }) {
    const ref = useRef<HTMLDivElement>(null), layer = useTransientLayer({ root: ref, modal: mobile, history: mobile, onClose() {} });
    useNavigationGuard(async () => false, layer.id);
    return <div ref={ref}>Draft</div>;
  }
  await act(async () => root.render(<Responsive mobile />));
  await act(async () => root.render(<Responsive mobile={false} />));
  expect(await transientLayers.dismissTop('escape')).toBe(false);
  expect(transientLayers.hasLayers()).toBe(true);
});
