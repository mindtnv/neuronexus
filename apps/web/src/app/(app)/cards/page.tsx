'use client';

import { Suspense } from 'react';
import { NNAppPage } from '@/components/app-page';
import { NNCardsBrowser } from '@/components/screens/cards-browser';
import { useT } from '@/lib/i18n';
import { RouteContentFallback } from '@/components/route-fallbacks';

export default function Page() {
  const t = useT();
  return (
    <NNAppPage title={t('cards.title')}>
      <Suspense fallback={<RouteContentFallback />}>
        <NNCardsBrowser />
      </Suspense>
    </NNAppPage>
  );
}
