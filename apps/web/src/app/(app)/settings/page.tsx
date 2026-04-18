'use client';

import { NNAppPage } from '@/components/app-page';
import { NNSettings } from '@/components/screens/settings';
import { useT } from '@/lib/i18n';

export default function Page() {
  const t = useT();
  return (
    <NNAppPage title={t('nav.settings')} subtitle={t('settings.pageSubtitle')}>
      <NNSettings />
    </NNAppPage>
  );
}
