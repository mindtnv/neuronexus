'use client';

import { NNAppPage } from '@/components/app-page';
import { NNDecks } from '@/components/screens/decks';
import { useT } from '@/lib/i18n';

export default function Page() {
  const t = useT();
  return (
    <NNAppPage title={t('nav.decks')}>
      <NNDecks />
    </NNAppPage>
  );
}
