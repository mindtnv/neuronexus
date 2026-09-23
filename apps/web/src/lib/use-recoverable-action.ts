'use client';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { RecoverableSave } from './recoverable-save';
import { getUiActionReceipt, saveUiAction } from './ui-actions-api';
import { ApiError } from './api';

import type { RecoveryAction } from './recovery-action';
export type { RecoveryAction } from './recovery-action';
export function useRecoverableAction(owner: string, fingerprint: string, baseVersion?: string) {
  const [controller] = useState(() => new RecoverableSave<RecoveryAction>(owner));
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const version = useRef(baseVersion);
  useLayoutEffect(() => { controller.edit(fingerprint); }, [controller, fingerprint]);
  useEffect(() => {
    if (version.current !== baseVersion && controller.getSnapshot().status === 'conflict') controller.resolveConflict();
    version.current = baseVersion;
  }, [baseVersion, controller]);
  useEffect(() => { controller.activate(); return () => controller.dispose(); }, [controller]);
  const save = async (action: RecoveryAction, submittedFingerprint = fingerprint) => {
    const accepted = await controller.run(action, submittedFingerprint,
      request => saveUiAction(owner, request.payload.path, request.payload.method, request.payload.args, request.requestId),
      requestId => getUiActionReceipt(owner, requestId));
    if (!accepted) {
      const error = controller.getSnapshot();
      throw new ApiError(error.error ?? 'save_failed', { status: error.errorStatus ?? (error.status === 'conflict' ? 409 : 0) });
    }
    return accepted;
  };
  return { controller, snapshot, save };
}
