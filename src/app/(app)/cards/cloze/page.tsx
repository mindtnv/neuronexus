'use client';

import { NNTopbar } from '@/components/shell';
import { NNCardTypes } from '@/components/screens/card-types';
import { useT } from '@/lib/i18n';

export default function Page() {
  const t = useT();
  return (
    <>
      <NNTopbar title={t('nav.review')} subtitle={t('cards.cloze.pageSubtitle')} />
      <NNCardTypes variant="cloze" />
    </>
  );
}
