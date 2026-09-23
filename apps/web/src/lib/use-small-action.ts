'use client';
import { useEffect, useLayoutEffect, useMemo, useSyncExternalStore } from 'react';
import { RecoverableSave } from './recoverable-save';
import { draftFingerprint } from './editor-drafts';
import { getUiActionReceipt, saveUiAction } from './ui-actions-api';
import { useNN } from './store';

interface SmallAction { path: string; method: 'POST' | 'PATCH'; args: Record<string, unknown> }
export function useSmallAction(owner: string, visibleFingerprint?: string) {
  const controller = useMemo(() => new RecoverableSave<SmallAction>(owner), [owner]);
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const last = useMemo(() => ({ current: null as { payload: SmallAction; fingerprint: string } | null }), [controller]);
  const announceReplay = (accepted: Awaited<ReturnType<typeof controller.run>>) => {
    if (accepted?.response.replayed && accepted.response.outcome === 'applied' && useNN.getState().profile?.userId === owner) {
      window.dispatchEvent(new CustomEvent('nn:ui-action', { detail: { owner, receipt: accepted.response.receipt } }));
      window.dispatchEvent(new Event('nn:knowledge-changed'));
    }
    return accepted;
  };
  useLayoutEffect(() => { if (visibleFingerprint !== undefined) controller.edit(visibleFingerprint); }, [controller, visibleFingerprint]);
  useEffect(() => { controller.activate(); return () => controller.dispose(); }, [controller]);
  const run = async (path: string, args: Record<string, unknown>, method: 'POST' | 'PATCH' = 'PATCH') => {
    const payload = { path, method, args }, fingerprint = visibleFingerprint ?? draftFingerprint(payload);
    last.current = { payload, fingerprint };
    return controller.run(payload, fingerprint, request => saveUiAction(owner, request.payload.path, request.payload.method, request.payload.args, request.requestId),
      requestId => getUiActionReceipt(owner, requestId)).then(announceReplay);
  };
  const retry = () => {
    const pending = controller.getSnapshot().pending;
    const action = pending ? { payload: pending.payload, fingerprint: pending.fingerprint } : last.current;
    return action ? controller.run(action.payload, visibleFingerprint ?? action.fingerprint,
      request => saveUiAction(owner, request.payload.path, request.payload.method, request.payload.args, request.requestId),
      requestId => getUiActionReceipt(owner, requestId)).then(announceReplay) : Promise.resolve(null);
  };
  return { snapshot, controller, run, retry, busy: snapshot.status === 'saving', uncertain: snapshot.status === 'uncertain' };
}
