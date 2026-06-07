import { describe, expect, test } from 'bun:test';
// `./layout` cannot be imported under bun test: it pulls in next/font/google and
// client-only providers via the `@/` path alias (neither resolves in the
// happy-dom/bun harness). The viewport/metadata exports are therefore isolated in
// the side-effect-free `./layout.metadata` module, which `layout.tsx` re-exports
// verbatim — so testing it here is testing exactly what Next ships. A source-level
// assertion below guards that the re-export wiring stays intact.
import { viewport, metadata } from './layout.metadata';

describe('root viewport export', () => {
  test('viewport-fit is cover (enables safe-area insets)', () => {
    expect(viewport.viewportFit).toBe('cover');
  });

  test('themeColor is defined (dark + light media variants)', () => {
    expect(viewport.themeColor).toBeDefined();
    expect(Array.isArray(viewport.themeColor)).toBe(true);
  });
});

describe('root metadata export', () => {
  test('applicationName is set', () => {
    expect(metadata.applicationName).toBe('NeuroNexus');
  });

  test('appleWebApp matches the PWA shape', () => {
    expect(metadata.appleWebApp).toEqual({
      capable: true,
      title: 'NeuroNexus',
      statusBarStyle: 'black-translucent',
    });
  });
});

describe('layout.tsx wiring', () => {
  test('layout re-exports metadata + viewport from layout.metadata', async () => {
    const src = await Bun.file(new URL('./layout.tsx', import.meta.url)).text();
    expect(src).toContain('export { metadata, viewport } from "./layout.metadata"');
  });
});
