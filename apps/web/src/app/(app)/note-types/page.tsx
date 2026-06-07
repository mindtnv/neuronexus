'use client';

import { Suspense } from 'react';
import { NNAppPage } from '@/components/app-page';
import { NNNoteTypeEditor } from '@/components/screens/note-type-editor';
import { useT } from '@/lib/i18n';

export default function Page() {
  const t = useT();
  return (
    <NNAppPage title={t('noteTypes.pageTitle')}>
      <Suspense fallback={null}>
        <NNNoteTypeEditor />
      </Suspense>
    </NNAppPage>
  );
}
