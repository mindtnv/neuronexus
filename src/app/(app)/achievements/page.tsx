'use client';

import { NNTopbar } from '@/components/shell';
import { NNAchievements } from '@/components/screens/achievements';
import { useNN } from '@/lib/store';
import { useT } from '@/lib/i18n';

export default function Page() {
  const t = useT();
  const profile = useNN((s) => s.profile);
  const level = profile?.level ?? 1;
  return (
    <>
      <NNTopbar title={t('achievements.pageTitle')} subtitle={t('achievements.pageSubtitle', { level })} />
      <NNAchievements />
    </>
  );
}
