'use client';
import { useId } from 'react';
import { NNBtn, NNIcon } from '@/components/ui';
import { useT } from '@/lib/i18n';

export function ChatUnavailable({ connectionError = false, busy = false, requestId, onRetry, onLeave }: {
  connectionError?: boolean; busy?: boolean; requestId?: string;
  onRetry: () => void; onLeave: () => void;
}) {
  const t = useT();
  const titleId = useId();
  return <section className="reomi-chat-unavailable" aria-labelledby={titleId}>
    <div className="reomi-chat-unavailable-content">
      <div className="reomi-chat-unavailable-icon" aria-hidden="true"><NNIcon name="chat" size={28} /><span><NNIcon name="warning" size={14} /></span></div>
      <div role="alert"><h2 id={titleId}>{t('chat.unavailable.title')}</h2>
        <p>{t(connectionError ? 'chat.unavailable.connection' : 'chat.unavailable.service')}</p>
      </div>
      <div className="reomi-chat-unavailable-actions">
        <NNBtn variant="primary" icon="sync" loading={busy} loadingLabel={t('chat.unavailable.checking')} onClick={onRetry}>{t('chat.unavailable.retry')}</NNBtn>
        <NNBtn variant="ghost" icon="cards" onClick={onLeave}>{t('chat.unavailable.cards')}</NNBtn>
      </div>
      {requestId && <small>{t('chat.unavailable.reference', { id: requestId })}</small>}
    </div>
  </section>;
}
