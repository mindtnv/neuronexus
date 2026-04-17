'use client';

import { NNTopbar } from '@/components/shell';
import { NNSessionComplete } from '@/components/screens/session-complete';
import { useT } from '@/lib/i18n';

export default function Page() {
  const t = useT();
  return (
    <>
      <NNTopbar title={t('nav.review')} subtitle={t('session.pageSubtitle')} />
      <NNSessionComplete />
    </>
  );
}
