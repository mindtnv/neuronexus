'use client';

import { NNAppPage } from '@/components/app-page';
import { NNGarden } from '@/components/screens/garden';
import { useNN } from '@/lib/store';
import { useT } from '@/lib/i18n';

export default function Page() {
  const t = useT();
  const profile = useNN((s) => s.profile);
  const level = profile?.level ?? 1;
  return (
    <NNAppPage title={t('nav.garden')} subtitle={`· L${level}`}>
      <NNGarden variant="terrarium" />
    </NNAppPage>
  );
}
