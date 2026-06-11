'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { LibraryReader } from '@/components/screens/library-reader';

// L2 — the full-screen reader at /library/[id]. The M4/M5 reading-first workflow
// (PDF + ink + marks + quick-card) moved here OUT of the notebook workspace.
// LibraryReader consumes useSearchParams (?page=&chunk=&pos=&mark=) so it renders
// under a Suspense boundary (Next requires it). It renders its own full-height
// chrome (back/title/details header + reader toolbar), so it does NOT use the
// standard NNAppPage topbar — the reader needs the full viewport.
export default function Page() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === 'string' ? params.id : undefined;
  return (
    <Suspense fallback={null}>
      {id ? <LibraryReader sourceId={id} /> : null}
    </Suspense>
  );
}
