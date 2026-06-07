'use client';

import { NNAppPage } from '@/components/app-page';
import { NNEmpty } from '@/components/screens/empty';
import { useT } from '@/lib/i18n';

export default function Page() {
  const t = useT();
  return (
    <NNAppPage title={t('nav.home')}>
      <NNEmpty kind="first-run" />
    </NNAppPage>
  );
}
