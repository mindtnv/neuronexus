'use client';

import { NNAppPage } from '@/components/app-page';
import { NNCardTypes } from '@/components/screens/card-types';
import { useT } from '@/lib/i18n';

export default function Page() {
  const t = useT();
  return (
    <NNAppPage title={t('nav.review')} subtitle={t('cards.type.pageSubtitle')}>
      <NNCardTypes variant="type" />
    </NNAppPage>
  );
}
