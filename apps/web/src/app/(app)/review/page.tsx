'use client';

import { Suspense } from 'react';
import { NNAppPage } from '@/components/app-page';
import { NNReview } from '@/components/screens/review';
import { useT } from '@/lib/i18n';
import { RouteContentFallback } from '@/components/route-fallbacks';

function ReviewPageInner() {
  const t = useT();
  return (
    <NNAppPage title={t('nav.review')}>
      <Suspense fallback={<RouteContentFallback />}>
        <NNReview variant="classic" />
      </Suspense>
    </NNAppPage>
  );
}

export default function Page() {
  return <ReviewPageInner />;
}
