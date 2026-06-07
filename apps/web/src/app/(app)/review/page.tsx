'use client';

import { Suspense } from 'react';
import { NNAppPage } from '@/components/app-page';
import { NNReview } from '@/components/screens/review';
import { countDueCards } from '@/lib/cards';
import { useNN } from '@/lib/store';
import { useT } from '@/lib/i18n';

function ReviewPageInner() {
  const t = useT();
  const due = useNN((s) => countDueCards(s.cards));
  return (
    <NNAppPage title={t('nav.review')} subtitle={due > 0 ? `· ${due}` : undefined}>
      <NNReview variant="classic" />
    </NNAppPage>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ReviewPageInner />
    </Suspense>
  );
}
