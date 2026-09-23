'use client';

import React, { useEffect, useRef, useState } from 'react';
import { newUuidV7, OPERATION_GROUPS, type OperationItem, type OperationRetryInput } from '@neuronexus/shared';
import { useT } from '@/lib/i18n';
import { operationHref, OperationRequestError, requestOperationRetry } from '@/lib/operations-api';
import { RecentActions } from './recent-actions';
import { useOperations } from './operations-provider';
import { useAppNavigation } from './navigation';
import { Modal } from './design-system/modal';
import { NNBtn, NNIcon } from './ui';

export function OperationsButton({ mobile = false }: { mobile?: boolean }) {
  const context = useOperations();
  const t = useT();
  if (!context) return null;
  const count = context.snapshot.feed?.active.total ?? 0;
  return <button type="button" className={mobile ? 'nn-operations-mobile-button' : 'nn-operations-button'}
    aria-label={count ? t('operations.count', { count }) : t('operations.title')}
    aria-haspopup="dialog" aria-expanded={context.open} onClick={() => context.setOpen(true)}>
    <NNIcon name="clock" size={18} /><span className="nn-sidebar-label">{t('operations.title')}</span>
    {count > 0 && <span className="nn-operations-count" aria-hidden="true">{count}</span>}
  </button>;
}

function OperationRow({ row }: { row: OperationItem }) {
  const context = useOperations()!;
  const t = useT(), navigation = useAppNavigation();
  const [confirmDefaults, setConfirmDefaults] = useState(false);
  const [state, setState] = useState<'idle' | 'pending' | 'failed' | 'uncertain'>('idle');
  const [retryAt, setRetryAt] = useState(0), [now, setNow] = useState(Date.now);
  const [requestError, setRequestError] = useState<string | null>(null);
  const request = useRef<OperationRetryInput | null>(null);
  const pending = useRef(false), alive = useRef(true);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); }; }, []);
  useEffect(() => {
    if (retryAt <= Date.now()) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [retryAt]);
  const retry = async (acceptDefaults = false) => {
    if (pending.current || retryAt > Date.now()) return;
    pending.current = true;
    try {
      if (!request.current) {
        if (row.retry.needsDefaults && !acceptDefaults) { setConfirmDefaults(true); return; }
        if (!alive.current) return;
        request.current = { kind: row.kind, id: row.id, runId: row.runId, requestId: newUuidV7(), acceptDefaults: row.retry.needsDefaults };
      }
      setConfirmDefaults(false); setState('pending'); setRequestError(null);
      controller.current = new AbortController();
      await requestOperationRetry(request.current, controller.current.signal);
      if (!alive.current) return;
      setState('idle'); request.current = null;
      await context.observer.refresh();
    } catch (error) {
      if (!alive.current) return;
      const known = error instanceof OperationRequestError && error.status >= 400 && error.status < 500;
      setState(known ? 'failed' : 'uncertain');
      if (error instanceof OperationRequestError && error.status === 429) setRetryAt(Date.now() + error.retryAfterMs);
      if (error instanceof OperationRequestError && error.status >= 500 && error.requestId) setRequestError(error.message);
      if (known) await context.observer.refresh();
    } finally { pending.current = false; }
  };
  const open = () => {
    context.setOpen(false);
    navigation.push(operationHref(row.destination));
  };
  const canOpen = row.kind === 'source' ? row.canRead : row.phase === 'ready';
  const phase = row.phase === 'ready' && row.artifactType === 'quiz' ? t('operations.quizReady') : t(`operations.phases.${row.phase}`);
  return <li className="nn-operation-row" data-operation-id={row.id}>
    <NNIcon name={row.phase === 'failed' ? 'warning' : row.phase === 'ready' ? 'check' : 'clock'} size={17} />
    <div className="nn-operation-copy"><strong title={row.title}>{row.title}</strong><span>{phase}</span>
      {row.canRead && ['parsing', 'queued', 'failed'].includes(row.phase) && <span>{t('operations.readable')}</span>}
      {row.progress && <progress max={row.progress.total} value={row.progress.completed}
        aria-label={t('operations.progress', { completed: row.progress.completed, total: row.progress.total })} />}
      {row.phase === 'failed' && !row.retry.allowed && <small>{t(row.retry.reason === 'ai_unavailable' ? 'operations.aiUnavailable' : 'operations.sourceUnavailable')}</small>}
      {state === 'failed' && <span role="alert">{t('operations.retryFailed')}</span>}
      {state === 'uncertain' && <span role="status">{t('operations.uncertain')}</span>}
      {requestError && <small>{requestError}</small>}
      {confirmDefaults && <div role="group" aria-label={t('operations.defaults')}><p>{t('operations.defaults')}</p>
        <NNBtn size="sm" onClick={() => void retry(true)}>{t('operations.retry')}</NNBtn>
        <NNBtn size="sm" variant="ghost" onClick={() => setConfirmDefaults(false)}>{t('actions.cancel')}</NNBtn></div>}
      {retryAt > now && <small>{t('operations.cooldown', { seconds: Math.ceil((retryAt - now) / 1000) })}</small>}
    </div>
    <div className="nn-operation-actions">
      {canOpen && <NNBtn size="sm" variant="soft" onClick={() => void open()}>{t(row.kind === 'source' ? 'operations.read' : 'operations.open')}</NNBtn>}
      {row.retry.allowed && <NNBtn size="sm" variant="ghost" disabled={state === 'pending' || retryAt > now} onClick={() => void retry()}>
        {t(state === 'pending' ? 'operations.retrying' : 'operations.retry')}
      </NNBtn>}
    </div>
  </li>;
}

export function OperationsHost() {
  const context = useOperations();
  const t = useT();
  // Freeze group/order while a row has focus; update row data in-place. New rows
  // arrive after blur, so a completion cannot move a keyboard user's control.
  const [focused, setFocused] = useState(false);
  const stable = useRef<Map<string, { group: typeof OPERATION_GROUPS[number]; row: OperationItem }>>(new Map());
  if (!context) return null;
  const { snapshot, observer, open, setOpen } = context;
  const incoming = new Map<string, { group: typeof OPERATION_GROUPS[number]; row: OperationItem }>(OPERATION_GROUPS.flatMap(group => snapshot.feed?.[group].items.map(row => [`${row.kind}:${row.id}`, { group, row }] as const) ?? []));
  if (!focused) stable.current = incoming;
  else for (const [key, value] of stable.current) { const next = incoming.get(key); if (next) stable.current.set(key, { group: value.group, row: next.row }); }
  return <Modal open={open} title={t('operations.title')} closeLabel={t('actions.close')} onClose={() => setOpen(false)} className="nn-operations-panel">
    <div className="nn-operations-content" onFocus={() => setFocused(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setFocused(false); }}>
      {snapshot.status === 'loading' && <p role="status">{t('operations.loading')}</p>}
      {(snapshot.status === 'stale' || snapshot.status === 'unavailable') && <div className="nn-operation-notice" role="status">
        <p>{t(`operations.${snapshot.status}`)}</p><NNBtn size="sm" onClick={() => void observer.refresh()}>{t('operations.refresh')}</NNBtn>
      </div>}
      {snapshot.feed && OPERATION_GROUPS.map(group => {
        const items = [...stable.current.values()].filter(value => value.group === group);
        const page = snapshot.feed![group];
        if (!items.length && !page.total) return null;
        return <section key={group} aria-label={t(`operations.${group}`)}>
          <h3>{t(`operations.${group}`)} <span>{page.total}</span></h3>
          <ul>{items.map(({ row }) => <OperationRow key={`${row.kind}:${row.id}:${row.runId}`} row={row} />)}</ul>
          {page.nextCursor && <NNBtn size="sm" variant="ghost" disabled={snapshot.loadingMore !== null} onClick={() => void observer.loadMore(group)}>{t('operations.more')}</NNBtn>}
        </section>;
      })}
      {snapshot.feed && OPERATION_GROUPS.every(group => !snapshot.feed![group].total) && <p>{t('operations.empty')}</p>}
      <RecentActions />
      <p className="nn-operations-history">{t('operations.history')}</p>
    </div>
  </Modal>;
}
