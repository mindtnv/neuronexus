'use client';

import { Suspense } from 'react';
import { NNDecks } from '@/components/screens/decks';
import { NNAppPage } from '@/components/app-page';
import { RouteContentFallback } from '@/components/route-fallbacks';
import { useT } from '@/lib/i18n';

export default function Page() {
  const t = useT();
  return <Suspense fallback={<NNAppPage title={t('nav.decks')}><RouteContentFallback /></NNAppPage>}><NNDecks /></Suspense>;
}
