'use client';

import { NNTopbar } from '@/components/shell';
import { NNStats } from '@/components/screens/stats';
import { useNN } from '@/lib/store';
import { useT } from '@/lib/i18n';

export default function Page() {
  const t = useT();
  const decks = useNN((s) => s.decks);
  return (
    <>
      <NNTopbar
        title={t('nav.stats')}
        subtitle={t('stats.pageSubtitle', { count: decks.length, unit: t(decks.length === 1 ? 'units.deck' : 'units.decks') })}
      />
      <NNStats />
    </>
  );
}
