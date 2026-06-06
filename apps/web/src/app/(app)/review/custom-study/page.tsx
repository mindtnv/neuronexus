'use client';

import { NNAppPage } from '@/components/app-page';
import { NNCustomStudy } from '@/components/screens/custom-study';
import { useT } from '@/lib/i18n';

export default function Page() {
  const t = useT();
  return (
    <NNAppPage title={t('review.customStudy.title')} subtitle={t('review.customStudy.subtitle')}>
      <NNCustomStudy />
    </NNAppPage>
  );
}
