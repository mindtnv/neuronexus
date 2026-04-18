'use client';

import { NNAppPage } from '@/components/app-page';
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
    <NNAppPage
        title={t('nav.graph')}
        subtitle={t('graph.pageSubtitle', summary)}
      >
      <NNGraph variant="force" />
    </NNAppPage>
  );
}
