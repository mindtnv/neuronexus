import { describe, expect, test } from 'bun:test';
import {
  getRedirectUrl,
  unstable_getResponseFromNextConfig,
} from 'next/experimental/testing/server';
import { nextConfig } from './next.config';

describe('production domain migration', () => {
  test.each([
    ['/', 'https://app.reomi.ru/'],
    ['/cards?focus=example&view=table', 'https://app.reomi.ru/cards?focus=example&view=table'],
    ['/auth/reset-password?token=sample', 'https://app.reomi.ru/auth/reset-password?token=sample'],
  ])('redirects the legacy host preserving %s', async (path, destination) => {
    const response = await unstable_getResponseFromNextConfig({
      url: `https://neuronexus.mihailantonov.pro${path}`,
      nextConfig,
    });
    expect(response.status).toBe(307);
    expect(getRedirectUrl(response)).toBe(destination);
  });

  test.each([
    'https://app.reomi.ru/cards?focus=example',
    'http://localhost:3001/cards',
    'https://neuronexusXmihailantonovXpro/cards',
    'https://neuronexus.mihailantonov.pro.example.com/cards',
  ])('does not redirect unrelated or canonical URL %s', async (url) => {
    const response = await unstable_getResponseFromNextConfig({ url, nextConfig });
    expect(getRedirectUrl(response)).toBeNull();
  });
});
