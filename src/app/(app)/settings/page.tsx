'use client';

import { NNTopbar } from '@/components/shell';
import { NNSettings } from '@/components/screens/settings';
import { useT } from '@/lib/i18n';

export default function Page() {
  const t = useT();
  return (
    <>
      <NNTopbar title={t('nav.settings')} subtitle={t('settings.pageSubtitle')} />
      <NNSettings />
    </>
  );
}
