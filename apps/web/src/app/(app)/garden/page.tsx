'use client';

import { NNAppPage } from '@/components/app-page';
import { NNGarden } from '@/components/screens/garden';
import { useNN } from '@/lib/store';
import { useT } from '@/lib/i18n';

export default function Page() {
  const t = useT();
  const profile = useNN((s) => s.profile);
  const level = profile?.level ?? 1;
  const streak = profile?.streakDays ?? 0;
  return (
    <NNAppPage title={t('nav.garden')} subtitle={t('garden.pageSubtitle', { level, streak })}>
      <NNGarden variant="terrarium" />
    </NNAppPage>
  );
}
