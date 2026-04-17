'use client';

import { NNTopbar } from '@/components/shell';
import { NNReviewWithTutor } from '@/components/overlays/ai-tutor';
import { useT } from '@/lib/i18n';

export default function Page() {
  const t = useT();
  return (
    <>
      <NNTopbar title={t('nav.review')} subtitle={t('overlays.tutor.pageSubtitle')} />
      <NNReviewWithTutor />
    </>
  );
}
