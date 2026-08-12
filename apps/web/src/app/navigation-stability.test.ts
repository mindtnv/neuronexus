import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const webSrc = join(import.meta.dir, '..');

describe('route transition invariants', () => {
  test('the application shell never keys or fades the route subtree', () => {
    const shell = readFileSync(join(webSrc, 'components/app-shell.tsx'), 'utf8');
    expect(shell).not.toContain('fadeKey');
    expect(shell).not.toContain('nn-page-fade');
    expect(shell).not.toMatch(/key=\{bootstrapped/);
  });

  test('App Router suspense boundaries never render a blank fallback', async () => {
    const glob = new Bun.Glob('app/**/page.tsx');
    for await (const path of glob.scan({ cwd: webSrc, absolute: true })) {
      const source = readFileSync(path, 'utf8');
      expect(source).not.toMatch(/fallback=\{null\}/);
    }
  });

  test('global CSS never watches every property for transitions', () => {
    const css = readFileSync(join(webSrc, 'app/globals.css'), 'utf8');
    expect(css).not.toMatch(/transition\s*:\s*all\b/);
  });

  test('route and root error boundaries plus not-found UI are present', () => {
    expect(readFileSync(join(webSrc, 'app/(app)/error.tsx'), 'utf8')).toContain('reset');
    expect(readFileSync(join(webSrc, 'app/global-error.tsx'), 'utf8')).toContain('<html');
    expect(readFileSync(join(webSrc, 'app/not-found.tsx'), 'utf8')).toContain('404');
  });
});
