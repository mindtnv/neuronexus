'use client';

import { useMemo } from 'react';
import { NNTopbar } from '@/components/shell';
import { NNGraphWithHover } from '@/components/screens/graph-hover';
import { useT } from '@/lib/i18n';
import { useNN } from '@/lib/store';

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
      <NNGraphWithHover />
    </>
  );
}
