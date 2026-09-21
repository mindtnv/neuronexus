import { describe, expect, test } from 'bun:test';

// Next's server testing helpers patch process-global request/async state.
// Keep them outside Bun's shared API integration-test process.
function route(url: string): { status: number; redirect: string | null } {
  const result = Bun.spawnSync([
    process.execPath,
    '--eval',
    `await import('next/dist/server/node-environment');
     const { getRedirectUrl, unstable_getResponseFromNextConfig } = await import('next/experimental/testing/server');
     const { nextConfig } = await import('./next.config.ts');
     const response = await unstable_getResponseFromNextConfig({ url: process.argv[1], nextConfig });
     console.log(JSON.stringify({ status: response.status, redirect: getRedirectUrl(response) }));`,
    url,
  ], { cwd: import.meta.dir });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return JSON.parse(result.stdout.toString());
}

describe('production domain migration', () => {
  test.each([
    ['/', 'https://app.reomi.ru/'],
    ['/cards?focus=example&view=table', 'https://app.reomi.ru/cards?focus=example&view=table'],
    ['/auth/reset-password?token=sample', 'https://app.reomi.ru/auth/reset-password?token=sample'],
  ])('redirects the legacy host preserving %s', (path, destination) => {
    const response = route(`https://neuronexus.mihailantonov.pro${path}`);
    expect(response.status).toBe(307);
    expect(response.redirect).toBe(destination);
  });

  test.each([
    'https://app.reomi.ru/cards?focus=example',
    'http://localhost:3001/cards',
    'https://neuronexusXmihailantonovXpro/cards',
    'https://neuronexus.mihailantonov.pro.example.com/cards',
  ])('does not redirect unrelated or canonical URL %s', (url) => {
    expect(route(url).redirect).toBeNull();
  });
});
