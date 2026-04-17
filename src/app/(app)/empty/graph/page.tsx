'use client';

import { NNTopbar } from '@/components/shell';
import { NNEmpty } from '@/components/screens/empty';
import { useT } from '@/lib/i18n';

export default function Page() {
  const t = useT();
  return (
    <>
      <NNTopbar title={t('nav.graph')} subtitle={t('empty.graph.pageSubtitle')} />
      <NNEmpty kind="graph" />
    </>
  );
}
