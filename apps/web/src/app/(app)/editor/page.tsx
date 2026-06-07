'use client';

import { Suspense } from 'react';
import { NNAppPage } from '@/components/app-page';
import { NNEditor } from '@/components/screens/editor';
import { useT } from '@/lib/i18n';

export default function Page() {
  const t = useT();
  return (
    <NNAppPage title={t('nav.editor')}>
      <Suspense fallback={null}>
        <NNEditor />
      </Suspense>
    </NNAppPage>
  );
}
