import { ensureTestDom, GlobalRegistrator } from '../../lib/test-dom-setup';
import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import React, { act } from 'react';
import type { Root } from 'react-dom/client';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { AppNavigationProvider } from '../navigation';
import { DialogProvider } from '../dialog';
import { I18nProvider } from '../../lib/i18n';
import { clearSessionResourceCache } from '../../lib/session-resource';
import { useNN } from '../../lib/store';
import { cardFromApi, profileFromApi } from '../../lib/mappers';
import { clearStudyResult, saveStudyResult, type StudyResult } from '../../lib/study-result';

// Re-register before loading DOM-dependent modules; other suites tear the DOM down.
ensureTestDom();
const { createRoot } = await import('react-dom/client');
const { NNHome } = await import('./home');
const { NNDecks } = await import('./decks');
const { NNSessionComplete } = await import('./session-complete');

const counts = { total: 601, newCount: 601, learningCount: 0, reviewCount: 0, suspendedCount: 0, dueLearning: 0, dueReview: 0, nextLearningAt: null, nextDueAt: null, newRemaining: 20, reviewRemaining: 200, availableNew: 20, availableReview: 0, totalAvailable: 20, limitedNew: 581, limitedReview: 0, serverNow: new Date().toISOString() };
const overview = { overall: counts, decks: { deck: counts }, direct: { deck: counts } };
const navigations: string[] = [];
const router = { bfcacheId: 'test', push(href: string) { navigations.push(href); }, replace() {}, back() {}, forward() {}, refresh() {}, prefetch() {}, hmrRefresh() {} };
const result: StudyResult = { version: 1, userId: 'result-user', completedAt: Date.now(), deckName: 'Study', answers: 2, cards: 1,
  durationMs: 2300, xpGained: 10, grades: { 1: 1, 2: 0, 3: 1, 4: 0 }, mode: 'regular', reviewHref: '/review?deck=deck' };
let root: Root;
let container: HTMLDivElement;
let originalFetch: typeof fetch;

beforeEach(() => {
  ensureTestDom();
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.setItem('nn:locale', 'en');
  clearSessionResourceCache();
  clearStudyResult('result-user'); navigations.length = 0;
  originalFetch = globalThis.fetch;
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
  useNN.setState({ bootstrapped: true, decks: [{ id: 'deck', name: 'Study', color: 'lime', species: 'fern', createdAt: 0 }], cards: [cardFromApi({ id: 'cached', deckId: 'deck', suspended: true })] });
  globalThis.fetch = ((url: any) => Promise.resolve(Response.json(
    String(url).includes('/study-summary') ? overview : String(url).includes('/library') ? { items: [] }
    : String(url).includes('/stats/forecast') ? { days: 7, buckets: [], overdueCount: 0, total: 0 }
    : String(url).includes('/status') ? { chatEnabled: false } : [],
  ))) as unknown as typeof fetch;
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove();
  globalThis.fetch = originalFetch; useNN.getState().reset();
  delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
});
afterAll(() => GlobalRegistrator.unregister());

async function render(screen: React.ReactNode) {
  await act(async () => root.render(
    <AppRouterContext.Provider value={router}><PathnameContext.Provider value="/">
      <I18nProvider><AppNavigationProvider><DialogProvider>{screen}</DialogProvider></AppNavigationProvider></I18nProvider>
    </PathnameContext.Provider></AppRouterContext.Provider>,
  ));
}

describe('study overview screens', () => {
  test('home uses complete server counts rather than the one cached suspended card', async () => {
    await render(<NNHome />);
    expect(container.textContent).toContain('20cards due');
    expect(container.textContent).toContain('601cards');
    expect(container.textContent).not.toContain('forgetting > 60%');
  });

  test('decks use server totals and daily availability', async () => {
    await render(<NNDecks />);
    expect(container.textContent).toContain('601 cards across all decks');
    const review = container.querySelector('a[href="/review?deck=deck"]');
    expect(review).not.toBeNull();
    expect(container.textContent).toContain('601');
  });

  test('a failed count request is shown as unavailable with a retry', async () => {
    globalThis.fetch = ((url: any) => Promise.resolve(String(url).includes('/study-summary')
      ? Response.json({ error: 'unavailable' }, { status: 503 }) : Response.json(String(url).includes('/stats/forecast')
        ? { days: 7, buckets: [], overdueCount: 0, total: 0 } : []))) as unknown as typeof fetch;
    await render(<NNHome />);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Could not refresh');
    expect(container.textContent).toContain('—cards due');
    expect(container.textContent).toContain('Try again');
  });

  test('forecast errors do not render a fabricated zero forecast', async () => {
    globalThis.fetch = ((url: any) => Promise.resolve(
      String(url).includes('/stats/forecast') ? Response.json({ error: 'unavailable' }, { status: 503 })
      : Response.json(String(url).includes('/study-summary') ? overview : []),
    )) as unknown as typeof fetch;
    await render(<NNHome />);
    expect(container.textContent).toContain('Could not refresh the forecast');
    expect(container.textContent).not.toContain('Tomorrow');
  });

  test('home refreshes when a scheduled card becomes due and when returning to the window', async () => {
    let loads = 0;
    const due = new Date(Date.now() + 100).toISOString();
    globalThis.fetch = ((url: any) => {
      if (String(url).includes('/study-summary')) {
        loads++;
        return Promise.resolve(Response.json({ ...overview, overall: { ...counts,
          totalAvailable: loads === 1 ? 0 : 1, nextDueAt: loads === 1 ? due : null, serverNow: new Date().toISOString(),
        } }));
      }
      return Promise.resolve(Response.json(String(url).includes('/stats/forecast') ? { days: 7, buckets: [], overdueCount: 0, total: 0 } : []));
    }) as unknown as typeof fetch;
    await render(<NNHome />);
    expect(container.textContent).toContain('0cards due');
    for (let i = 0; i < 30 && !container.textContent?.includes('1cards due'); i++) {
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    }
    expect(container.textContent).toContain('1cards due');
    const before = loads;
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(loads).toBeGreaterThan(before);
  });

  test('session results distinguish answers from cards, use real counts and keep the deck scope', async () => {
    useNN.setState({ profile: profileFromApi({ userId: 'result-user', name: 'Tester' }) });
    saveStudyResult(result);
    await render(<NNSessionComplete />);
    expect(container.textContent).toContain('Answers2');
    expect(container.textContent).toContain('Cards reviewed1');
    expect(container.textContent).toContain('20 in queue');
    expect(container.textContent).not.toContain('9:30');
    expect(container.textContent).not.toContain('Fern grew');
    expect(container.textContent).not.toContain('Re-queue all');
    const continueButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Continue studying'))!;
    await act(async () => continueButton.click());
    expect(navigations.at(-1)).toBe('/review?deck=deck');
  });

  test('a new account never sees another account\'s result', async () => {
    saveStudyResult(result);
    useNN.setState({ profile: profileFromApi({ userId: 'someone-else', name: 'Other' }) });
    await render(<NNSessionComplete />);
    expect(container.textContent).toContain('No recent session');
    expect(container.textContent).not.toContain('Distinct cards');
  });
});
