'use client';

import { NNAppPage } from '@/components/app-page';
import { NNComingSoon } from '@/components/coming-soon';

export default function Page() {
  return (
    <NNAppPage title="AI Tutor" subtitle="Скоро">
      <NNComingSoon
        icon="sparkle"
        title="AI-тьютор — скоро"
        description="Контекстный AI-чат внутри повтора, который объяснит ошибку и предложит мнемонику, появится после интеграции LLM-провайдера."
      />
    </NNAppPage>
  );
}
