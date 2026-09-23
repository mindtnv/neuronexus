'use client';
import { useT } from '@/lib/i18n';
import type { SaveStatus } from '@/lib/recoverable-save';
import { NNBtn, NNIcon } from './ui';

export function SaveFeedback({ status, onRetry, errorCode }: { status: SaveStatus; onRetry?: () => void; errorCode?: string | null }) {
  const t = useT();
  if (status === 'clean' || status === 'dirty') return null;
  const error = status === 'failed' || status === 'conflict';
  return <div role={error ? 'alert' : 'status'} aria-live="polite" data-status={status} className={`nn-save-feedback${error ? ' is-error' : ''}`}>
    <NNIcon name={error || status === 'uncertain' ? 'warning' : status === 'saved' ? 'check' : 'clock'} size={14} />
    <span>{t(errorCode === 'request_expired' ? 'actionsRecovery.expiredSave' : `actionsRecovery.${status}`)}</span>
    {(status === 'failed' || status === 'uncertain') && onRetry && <NNBtn variant="ghost" size="sm" onClick={onRetry}>{t('actionsRecovery.retry')}</NNBtn>}
  </div>;
}
