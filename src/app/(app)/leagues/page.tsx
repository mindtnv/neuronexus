'use client';

import { NNTopbar } from '@/components/shell';
import { NNLeagues } from '@/components/screens/leagues';
import { useT } from '@/lib/i18n';

export default function Page() {
  const t = useT();
  return (
    <>
      <NNTopbar title={t('leagues.pageTitle')} subtitle={t('leagues.pageSubtitle')} />
      <NNLeagues />
    </>
  );
}
