'use client';

import { useMemo } from 'react';
import { NNTopbar } from '@/components/shell';
import { NNReview } from '@/components/screens/review';
import { useNN } from '@/lib/store';
import { useT } from '@/lib/i18n';

export default function Page() {
  const t = useT();
  const cards = useNN((s) => s.cards);
  const due = useMemo(() => {
    const now = Date.now();
    return cards.filter((c) => new Date(c.fsrs.due).getTime() <= now).length;
  }, [cards]);
  return (
    <>
      <NNTopbar title={t('nav.review')} subtitle={t('review.pageSubtitle', { due })} />
      <NNReview variant="classic" />
    </>
  );
}
