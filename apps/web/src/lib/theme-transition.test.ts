import { afterEach, beforeEach, expect, test } from 'bun:test';
import { ensureTestDom } from './test-dom-setup';
import { revealThemeChange, themeRevealRadius } from './theme-transition';

let previousTransition: typeof document.startViewTransition;
let previousAnimate: typeof document.documentElement.animate;
let previousMatch: typeof window.matchMedia;
beforeEach(() => {
  ensureTestDom();
  previousTransition = document.startViewTransition;
  previousAnimate = document.documentElement.animate;
  previousMatch = window.matchMedia;
  window.matchMedia = (() => ({ matches: false })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  document.startViewTransition = previousTransition;
  document.documentElement.animate = previousAnimate;
  window.matchMedia = previousMatch;
  document.documentElement.removeAttribute('data-theme-transition');
});
test('unsupported browsers apply the preference immediately once', async () => {
  document.startViewTransition = undefined as any;
  let applied = 0;
  await revealThemeChange(() => applied++, { x: 20, y: 20 });
  expect(applied).toBe(1);
  expect(document.documentElement.hasAttribute('data-theme-transition')).toBe(false);
});
test('reduced motion bypasses snapshotting and animation', async () => {
  let snapshots = 0, applied = 0;
  window.matchMedia = (() => ({ matches: true })) as unknown as typeof window.matchMedia;
  document.startViewTransition = (() => { snapshots++; }) as any;
  await revealThemeChange(() => applied++, { x: 20, y: 20 });
  expect(snapshots).toBe(0); expect(applied).toBe(1);
});
test('the new theme reveals from the toggle and clears transition state', async () => {
  let applied = 0, animation: any, cancelled = 0;
  document.startViewTransition = ((update: () => void) => { update(); return { ready: Promise.resolve(), finished: Promise.resolve() }; }) as any;
  document.documentElement.animate = ((frames: any, options: any) => { animation = { frames, options }; return { finished: Promise.resolve(), cancel: () => { cancelled++; } }; }) as any;
  await revealThemeChange(() => applied++, { x: 900, y: 32 });
  expect(applied).toBe(1);
  expect(animation.frames.clipPath[0]).toBe('circle(0px at 900px 32px)');
  expect(animation.options.pseudoElement).toBe('::view-transition-new(root)');
  expect(animation.options.fill).toBe('none');
  expect(cancelled).toBe(1);
  expect(document.documentElement.hasAttribute('data-theme-transition')).toBe(false);
});
test('a skipped snapshot still applies the preference exactly once', async () => {
  let applied = 0;
  document.documentElement.animate = (() => { throw Error('must not animate'); }) as any;
  document.startViewTransition = ((update: () => void) => { update(); return { ready: Promise.reject(Error('skipped')), finished: Promise.resolve() }; }) as any;
  await revealThemeChange(() => applied++, { x: 20, y: 20 });
  expect(applied).toBe(1);
});


test('reveal overscans the far lower-left corner on tall and wide windows', () => {
  for (const [width, height] of [[1259, 998], [1920, 1080], [390, 844]]) {
    const origin = { x: width - 45, y: 42 };
    const radius = themeRevealRadius(origin, width, height);
    for (const [x, y] of [[0, 0], [width, 0], [0, height], [width, height]]) {
      expect(radius).toBeGreaterThan(Math.hypot(origin.x - x, origin.y - y) + 4);
    }
  }
});

test('an interrupted animation releases its clip and still applies the theme only once', async () => {
  let applied = 0, cancelled = 0;
  document.startViewTransition = ((update: () => void) => { update(); return { ready: Promise.resolve(), finished: Promise.resolve() }; }) as any;
  document.documentElement.animate = (() => ({ finished: Promise.reject(Error('interrupted')), cancel: () => { cancelled++; } })) as any;
  await revealThemeChange(() => applied++, { x: 100, y: 32 });
  expect(applied).toBe(1); expect(cancelled).toBe(1);
  expect(document.documentElement.hasAttribute('data-theme-transition')).toBe(false);
});

test('coverage includes a snapshot larger than innerWidth/innerHeight', async () => {
  const root = document.documentElement;
  const measure = root.getBoundingClientRect;
  let end = '';
  root.getBoundingClientRect = (() => ({ right: 1800, bottom: 1400 })) as any;
  document.startViewTransition = ((update: () => void) => { update(); return { ready: Promise.resolve(), finished: Promise.resolve() }; }) as any;
  root.animate = ((frames: any) => { end = frames.clipPath[1]; return { finished: Promise.resolve(), cancel() {} }; }) as any;
  try {
    await revealThemeChange(() => {}, { x: 1210, y: 40 });
    const radius = Number(/circle\((\d+)px/.exec(end)?.[1]);
    expect(radius).toBeGreaterThan(Math.hypot(1210, 1360));
    expect(root.hasAttribute('data-theme-transition')).toBe(false);
  } finally { root.getBoundingClientRect = measure; }
});
