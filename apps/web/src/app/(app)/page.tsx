'use client';

import { NNAppPage } from '@/components/app-page';
import { NNHome } from '@/components/screens/home';
import { useT } from '@/lib/i18n';

export default function Page() {
  const t = useT();
  return (
    <NNAppPage title={t('nav.home')}>
      <NNHome />
    </NNAppPage>
  );
}
