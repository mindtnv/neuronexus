'use client';

import { NNAppPage } from '@/components/app-page';
import { NNComingSoon } from '@/components/coming-soon';

export default function Page() {
  return (
    <NNAppPage title="Лиги" subtitle="Скоро">
      <NNComingSoon
        icon="trophy"
        title="Лиги — скоро"
        description="Недельные лиги с настоящим leaderboard'ом и друзьями появятся в следующем релизе. Пока тренируй свой сад — он не требует соревнований."
      />
    </NNAppPage>
  );
}
