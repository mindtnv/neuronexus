'use client';

import { Suspense } from 'react';
import { NNAppPage } from '@/components/app-page';
import { NNChat } from '@/components/screens/chat';
import { useT } from '@/lib/i18n';

export default function Page() {
  const t = useT();
  return (
    <NNAppPage title={t('nav.chat')}>
      {/* NNChat consumes useSearchParams (?thread= deep link, A5) — Next requires
          a Suspense boundary around searchParams consumers (see /cards, /editor). */}
      <Suspense fallback={null}>
        <NNChat />
      </Suspense>
    </NNAppPage>
  );
}
