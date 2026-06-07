'use client';

import { NNAppPage } from '@/components/app-page';
import { NNStats } from '@/components/screens/stats';
import { useNN } from '@/lib/store';
import { useT } from '@/lib/i18n';

export default function Page() {
  const t = useT();
  const decks = useNN((s) => s.decks);
  return (
    <NNAppPage title={t('nav.stats')} subtitle={decks.length > 0 ? `· ${decks.length}` : undefined}>
      <NNStats />
    </NNAppPage>
  );
}
