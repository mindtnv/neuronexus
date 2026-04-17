'use client';

import { NNTopbar } from '@/components/shell';
import { NNGarden } from '@/components/screens/garden';
import { useNN } from '@/lib/store';
import { useT } from '@/lib/i18n';

export default function Page() {
  const t = useT();
  const profile = useNN((s) => s.profile);
  const level = profile?.level ?? 1;
  const streak = profile?.streakDays ?? 0;
  return (
    <>
      <NNTopbar title={t('nav.garden')} subtitle={t('garden.pageSubtitle', { level, streak })} />
      <NNGarden variant="terrarium" />
    </>
  );
}
