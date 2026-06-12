'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { NNAppPage } from '@/components/app-page';
import { NotebookWorkspace } from '@/components/screens/notebook-workspace';
import { useT } from '@/lib/i18n';

// M2: the per-notebook page is the three-panel workspace (sources │ reader │
// chat). The library list stays at /notebooks. The workspace consumes
// useSearchParams (?source=&chunk=&pos= / ?thread=) so it renders under a
// Suspense boundary (Next requires it — see /chat, /cards).
export default function Page() {
  const t = useT();
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === 'string' ? params.id : undefined;
  return (
    <NNAppPage title={t('nav.notebooks')}>
      <Suspense fallback={null}>
        {id ? <NotebookWorkspace key={id} notebookId={id} /> : null}
      </Suspense>
    </NNAppPage>
  );
}
