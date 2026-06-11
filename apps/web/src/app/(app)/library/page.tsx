'use client';

import { Suspense } from 'react';
import { NNAppPage } from '@/components/app-page';
import { LibraryScreen } from '@/components/screens/library';
import { useT } from '@/lib/i18n';

export default function Page() {
  const t = useT();
  return (
    <NNAppPage title={t('nav.library')}>
      <Suspense fallback={null}>
        <LibraryScreen />
      </Suspense>
    </NNAppPage>
  );
}
