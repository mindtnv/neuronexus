'use client';

import { Suspense } from 'react';
import { NNAppPage } from '@/components/app-page';
import { NNDecks } from '@/components/screens/decks';
import { useNN } from '@/lib/store';
import { useT } from '@/lib/i18n';

export default function Page() {
  const t = useT();
  const decks = useNN((s) => s.decks);
  const cards = useNN((s) => s.cards);
  const deckWord = t(decks.length === 1 ? 'units.deck' : 'units.decks');
  const cardWord = t(cards.length === 1 ? 'units.card' : 'units.cards');
  return (
    <NNAppPage
        title={t('nav.decks')}
        subtitle={`${decks.length} ${deckWord} · ${cards.length} ${cardWord}`}
      >
      <Suspense fallback={null}>
        <NNDecks />
      </Suspense>
    </NNAppPage>
  );
}
