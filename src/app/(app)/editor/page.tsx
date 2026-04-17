'use client';

import { Suspense } from 'react';
import { NNTopbar } from '@/components/shell';
import { NNEditor } from '@/components/screens/editor';
import { useT } from '@/lib/i18n';

export default function Page() {
  const t = useT();
  return (
    <>
      <NNTopbar title={t('nav.editor')} subtitle={t('editor.pageSubtitle')} />
      <Suspense fallback={null}>
        <NNEditor />
      </Suspense>
    </>
  );
}
