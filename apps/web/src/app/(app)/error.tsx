'use client';

import { NNAppPage } from '@/components/app-page';
import { NNBtn, NNLoadError } from '@/components/ui';

export default function AppError({ error, reset }: { error: Error & { digest?: string; requestId?: string }; reset: () => void }) {
  return (
    <NNAppPage title="Не удалось открыть страницу">
      <div style={{ flex: 1, padding: 24, display: 'grid', placeItems: 'center' }}>
        <div style={{ width: 'min(520px, 100%)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <NNLoadError
            title="Страница не загрузилась"
            description="Повтори попытку. Если ошибка вернётся, передай идентификатор запроса в поддержку."
            retryLabel="Повторить"
            onRetry={reset}
            requestId={error.requestId}
          />
          <NNBtn variant="ghost" icon="chevl" onClick={() => window.history.back()}>
            Назад
          </NNBtn>
        </div>
      </div>
    </NNAppPage>
  );
}
