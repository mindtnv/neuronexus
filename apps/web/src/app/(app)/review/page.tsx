'use client';

import { Suspense } from 'react';
import { NNAppPage } from '@/components/app-page';
import { NNReview } from '@/components/screens/review';
import { countDueCards } from '@/lib/cards';
import { useNN } from '@/lib/store';
import { useT } from '@/lib/i18n';

export default function Page() {
  const t = useT();
  const due = useNN((s) => countDueCards(s.cards));
  return (
    <NNAppPage title={t('nav.review')} subtitle={t('review.pageSubtitle', { due })}>
      <Suspense fallback={null}>
        <NNReview variant="classic" />
      </Suspense>
    </NNAppPage>
  );
}
