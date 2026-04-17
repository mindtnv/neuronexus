'use client';

import { useMemo } from 'react';
import { NNTopbar } from '@/components/shell';
import { NNGraph } from '@/components/screens/graph';
import { useNN } from '@/lib/store';
import { useT } from '@/lib/i18n';

export default function Page() {
  const t = useT();
  const cards = useNN((s) => s.cards);
  const decks = useNN((s) => s.decks);
  const edges = useMemo(() => {
    let n = 0;
    for (let i = 0; i < cards.length; i++) {
      for (let j = i + 1; j < cards.length; j++) {
        if (cards[i].tags.some((t) => cards[j].tags.includes(t))) n++;
      }
    }
    return n;
  }, [cards]);
  return (
    <>
      <NNTopbar
        title={t('nav.graph')}
        subtitle={t('graph.pageSubtitle', { nodes: cards.length, links: edges, clusters: decks.length })}
      />
      <NNGraph variant="force" />
    </>
  );
}
