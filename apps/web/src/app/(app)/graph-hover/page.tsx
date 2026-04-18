'use client';

import { NNAppPage } from '@/components/app-page';
import { NNGraphWithHover } from '@/components/screens/graph-hover';
import { getGraphSummary } from '@/lib/graph';
import { useT } from '@/lib/i18n';
import { useNN } from '@/lib/store';

export default function Page() {
  const t = useT();
  const cards = useNN((s) => s.cards);
  const decks = useNN((s) => s.decks);
  const summary = getGraphSummary(cards, decks);
  return (
    <NNAppPage
        title={t('nav.graph')}
        subtitle={t('graph.pageSubtitle', summary)}
      >
      <NNGraphWithHover />
    </NNAppPage>
  );
}
