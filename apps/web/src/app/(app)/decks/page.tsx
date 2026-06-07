'use client';

import { NNAppPage } from '@/components/app-page';
import { NNDecks } from '@/components/screens/decks';
import { useNN } from '@/lib/store';
import { useT } from '@/lib/i18n';

export default function Page() {
  const t = useT();
  const cards = useNN((s) => s.cards);
  return (
    <NNAppPage title={t('nav.decks')} subtitle={cards.length > 0 ? `· ${cards.length}` : undefined}>
      <NNDecks />
    </NNAppPage>
  );
}
