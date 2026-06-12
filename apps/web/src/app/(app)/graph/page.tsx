'use client';

import { NNAppPage } from '@/components/app-page';
import { CardsViewSwitcher } from '@/components/cards-view-switcher';
import { NNGraph } from '@/components/screens/graph';
import { getGraphSummary } from '@/lib/graph';
import { useNN } from '@/lib/store';
import { useT } from '@/lib/i18n';

export default function Page() {
  const t = useT();
  const cards = useNN((s) => s.cards);
  const decks = useNN((s) => s.decks);
  const summary = getGraphSummary(cards, decks);
  return (
    <NNAppPage title={t('nav.graph')} subtitle={summary.nodes > 0 ? `· ${summary.nodes}` : undefined}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <CardsViewSwitcher />
      </div>
      <NNGraph />
    </NNAppPage>
  );
}
