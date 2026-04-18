'use client';

import { NNAppPage } from '@/components/app-page';
import { NNComingSoon } from '@/components/coming-soon';

export default function Page() {
  return (
    <NNAppPage title="Импорт" subtitle="Скоро">
      <NNComingSoon
        icon="image"
        title="Импорт PDF — скоро"
        description="Автоматическая генерация карточек из PDF через AI включится после подключения LLM. А пока — карточки можно создавать руками в редакторе."
      />
    </NNAppPage>
  );
}
