'use client';

import { NNAppPage } from '@/components/app-page';
import { useEffect } from 'react';
import { useAppNavigation } from '@/components/navigation';
import { NNPageSkeleton } from '@/components/ui';
import { useT } from '@/lib/i18n';

export default function Page() {
  const t = useT();
  const router = useAppNavigation();
  useEffect(() => { router.replace('/review'); }, [router]);
  return (
    <NNAppPage title={t('nav.review')}>
      <NNPageSkeleton />
    </NNAppPage>
  );
}
