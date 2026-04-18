'use client';

import { NNAppPage } from '@/components/app-page';
import { NNEmpty } from '@/components/screens/empty';
import { useT } from '@/lib/i18n';

export default function Page() {
  const t = useT();
  return (
    <NNAppPage title={t('nav.graph')} subtitle={t('empty.graph.pageSubtitle')}>
      <NNEmpty kind="graph" />
    </NNAppPage>
  );
}
