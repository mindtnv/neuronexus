'use client';

import { NNAppPage } from '@/components/app-page';
import { NNSessionComplete } from '@/components/screens/session-complete';
import { useT } from '@/lib/i18n';

export default function Page() {
  const t = useT();
  return (
    <NNAppPage title={t('nav.review')}>
      <NNSessionComplete />
    </NNAppPage>
  );
}
