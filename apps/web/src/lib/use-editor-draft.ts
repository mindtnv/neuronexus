'use client';

import { useEffect, useRef, useState } from 'react';
import { clearEditorDraft, clearInvalidEditorDraft, downloadEditorDraft, editorDraftKey, draftFingerprint, DraftStorageError, readEditorDraft, writeEditorDraft, type DraftScope, type EditorDraft } from './editor-drafts';
import { useNN } from './store';
import { useT } from './i18n';
import { useDialog } from '@/components/dialog';
import { useNavigationGuard } from '@/components/navigation';

type DraftStatus = 'idle' | 'saved' | 'saving' | 'pending' | DraftStorageError['code'];
/** Components using this hook must be keyed by owner and edited entity. */
export function useEditorDraft<T extends object>({ scope, value, fingerprint, validate, onRestore, onSave, busy }: {
  scope: DraftScope; value: T; fingerprint: string; validate: (value: unknown) => value is T;
  onRestore: (value: T) => void; onSave: () => Promise<boolean>; busy: boolean;
}) {
  const t = useT(); const { select } = useDialog();
  const [pending, setPending] = useState<EditorDraft<T> | null>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<DraftStatus>('idle');
  const clean = useRef(fingerprint);
  // An explicitly restored buffer remains recoverable until save or discard,
  // even if it matches a stale cached baseline when fresher props arrive.
  const restored = useRef(false);
  const baselineValue = useRef(value);
  const revision = useRef<string | null>(null);
  const offered = useRef<EditorDraft<T> | null>(null);
  const invalid = useRef(false);
  const loaded = useRef(false); const alive = useRef(true);
  const lastSaved = useRef('');
  const live = useRef({ value, fingerprint, onRestore, onSave, busy });
  live.current = { value, fingerprint, onRestore, onSave, busy };
  const owned = () => Boolean(scope.ownerId) && useNN.getState().profile?.userId === scope.ownerId;
  const update = (next: DraftStatus) => { if (alive.current) setStatus(next); };
  const errorStatus = (error: unknown) => error instanceof DraftStorageError ? error.code : 'unavailable';
  const serializedValue = draftFingerprint(value);
  const dirty = () => restored.current || clean.current !== live.current.fingerprint;
  const flush = (closing = false): boolean => {
    if ((!owned() && !(closing && scope.ownerId)) || !loaded.current || offered.current || invalid.current) return false;
    if (!dirty()) return true;
    const serialized = draftFingerprint(live.current.value);
    try {
      if (lastSaved.current === serialized) {
        if ((readEditorDraft(scope)?.revision ?? null) !== revision.current) throw new DraftStorageError('changed');
        return true;
      }
      const record = writeEditorDraft(scope, live.current.value, revision.current);
      revision.current = record.revision; lastSaved.current = serialized; update('saved'); return true;
    } catch (error) { update(errorStatus(error)); return false; }
  };
  const clear = (confirmed = false) => {
    if (!owned() && !(confirmed && scope.ownerId)) return false;
    try {
      if (!clearEditorDraft(scope, revision.current)) { update('changed'); return false; }
      revision.current = null; lastSaved.current = ''; update('idle'); return true;
    } catch (error) { update(errorStatus(error)); return false; }
  };
  const markSaved = (fingerprint = live.current.fingerprint, savedValue?: T) => {
    const matches = live.current.fingerprint === fingerprint;
    restored.current = false; invalid.current = false; clean.current = fingerprint;
    if (savedValue) baselineValue.current = savedValue; else if (matches) baselineValue.current = live.current.value;
    offered.current = null; if (alive.current) setPending(null);
    if (matches) clear(true); else flush();
  };
  const restore = () => {
    if (!offered.current || !owned()) return;
    const record = offered.current;
    restored.current = true;
    offered.current = null; setPending(null); lastSaved.current = draftFingerprint(record.value);
    live.current.onRestore(record.value); update('saved');
  };
  const discard = (reset = false) => {
    if (!owned()) return false;
    if (status === 'invalid' && revision.current === null) {
      try { clearInvalidEditorDraft(scope); revision.current = null; update('idle'); } catch (error) { update(errorStatus(error)); return false; }
    } else if (!clear()) return false;
    offered.current = null; setPending(null);
    invalid.current = false; restored.current = false;
    if (reset) { live.current.value = baselineValue.current; live.current.fingerprint = clean.current; live.current.onRestore(baselineValue.current); }
    else flush();
    return true;
  };

  useEffect(() => {
    alive.current = true;
    if (owned()) {
      try {
        const record = readEditorDraft<T>(scope);
        revision.current = record?.revision ?? null;
        if (record) {
          if (!validate(record.value)) throw new DraftStorageError('invalid');
          offered.current = record; setPending(record); setStatus('pending');
        }
      } catch (error) { invalid.current = errorStatus(error) === 'invalid'; setStatus(errorStatus(error)); }
    }
    loaded.current = true; setReady(true);
    const unload = (event: BeforeUnloadEvent) => {
      const saved = flush();
      if (live.current.busy || (dirty() && !saved)) { event.preventDefault(); event.returnValue = ''; }
    };
    const hide = () => { flush(); };
    const changed = (event: StorageEvent) => {
      if (event.key !== editorDraftKey(scope)) return;
      try { if (readEditorDraft(scope)?.revision !== revision.current) { lastSaved.current = ''; update('changed'); } }
      catch (error) { update(errorStatus(error)); }
    };
    window.addEventListener('beforeunload', unload); window.addEventListener('pagehide', hide); window.addEventListener('storage', changed);
    return () => { alive.current = false; flush(true); window.removeEventListener('beforeunload', unload); window.removeEventListener('pagehide', hide); window.removeEventListener('storage', changed); };
  }, []);
  useEffect(() => {
    if (!loaded.current || offered.current || invalid.current) return;
    if (!dirty()) { baselineValue.current = live.current.value; if (revision.current) clear(); return; }
    if (lastSaved.current === serializedValue) return;
    setStatus(owned() ? 'saving' : 'unavailable');
    const timer = setTimeout(() => flush(), 300);
    return () => clearTimeout(timer);
  }, [fingerprint, serializedValue]);

  const confirmLeave = async () => {
    if (!owned()) return true;
    if (live.current.busy) return false;
    if (!dirty() || offered.current) return true;
    const choice = await select({ title: t('editor.draft.leaveTitle'), message: t('editor.draft.leaveBody'), value: 'keep',
      options: [ { value: 'save', label: t('editor.draft.saveAndLeave') }, { value: 'keep', label: t('editor.draft.keepAndLeave') }, { value: 'discard', label: t('editor.draft.discardAndLeave') } ],
      confirmLabel: t('editor.draft.continue'), cancelLabel: t('editor.draft.stay'),
    });
    if (!alive.current || !owned()) return false;
    if (choice === 'save') return await live.current.onSave();
    if (choice === 'keep') return flush();
    if (choice === 'discard') return discard(true);
    return false;
  };
  useNavigationGuard(confirmLeave);
  const download = () => {
    if (!owned()) return false;
    try { downloadEditorDraft(live.current.value, scope.kind); return true; } catch { return false; }
  };
  return { download, pending, blocked: !ready || Boolean(pending), status, dirty: dirty(), restore, discard: () => discard(), markSaved, flush, confirmLeave };
}
