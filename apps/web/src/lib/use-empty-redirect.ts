'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAppNavigation } from '@/components/navigation';
import { useNN } from './store';

export type EmptyCheck = 'first-run' | 'done' | 'graph';

export function useEmptyRedirect(check: EmptyCheck, enabled = true) {
  const router = useAppNavigation();
  const pathname = usePathname();
  const bootstrapped = useNN((s) => s.bootstrapped);
  const cards = useNN((s) => s.cards);
  const decks = useNN((s) => s.decks);

  useEffect(() => {
    if (!enabled) return;
    if (pathname && pathname.startsWith('/empty/')) return;
    if (!bootstrapped) return;

    let matches = false;
    if (check === 'first-run') {
      matches = decks.length === 0;
    } else if (check === 'done') {
      const now = new Date();
      matches =
        cards.length > 0 &&
        cards.filter((c) => new Date(c.fsrs.due) <= now).length === 0;
    } else if (check === 'graph') {
      matches = cards.length < 10;
    }

    if (matches) {
      router.replace(`/empty/${check}`);
    }
  }, [check, enabled, bootstrapped, cards, decks, pathname, router]);
}
