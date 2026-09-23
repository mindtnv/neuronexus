'use client';

import React, { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { OperationObserver, type OperationSnapshot } from '@/lib/operation-observer';
import { fetchOperations } from '@/lib/operations-api';
import { useNN } from '@/lib/store';
import { useT } from '@/lib/i18n';

interface OperationsContextValue {
  observer: OperationObserver;
  snapshot: OperationSnapshot;
  open: boolean;
  setOpen: (open: boolean) => void;
  owner: string;
}
const OperationsContext = createContext<OperationsContextValue | null>(null);
export const useOperations = () => useContext(OperationsContext);

function OwnerOperations({ owner, children }: { owner: string; children: React.ReactNode }) {
  const [observer] = useState(() => new OperationObserver(fetchOperations));
  const snapshot = useSyncExternalStore(observer.subscribe, observer.getSnapshot, observer.getSnapshot);
  const [open, setOpen] = useState(false);
  const t = useT();
  useEffect(() => {
    const visibility = () => observer.setVisible(document.visibilityState !== 'hidden');
    const refresh = () => { if (document.visibilityState !== 'hidden') void observer.refresh(); };
    visibility(); observer.start();
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('focus', refresh);
    window.addEventListener('nn:operations-changed', refresh);
    window.addEventListener('nn:knowledge-changed', refresh);
    return () => {
      document.removeEventListener('visibilitychange', visibility); window.removeEventListener('focus', refresh);
      window.removeEventListener('nn:operations-changed', refresh); window.removeEventListener('nn:knowledge-changed', refresh);
      observer.dispose();
    };
  }, [observer]);
  const value = useMemo(() => ({ observer, snapshot, open, setOpen, owner }), [observer, snapshot, open, owner]);
  return <OperationsContext.Provider value={value}>
    {children}
    <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {snapshot.completions.length > 0 ? t('operations.completed', { count: snapshot.completions.length }) : ''}
    </span>
  </OperationsContext.Provider>;
}

export function OperationsProvider({ children }: { children: React.ReactNode }) {
  const owner = useNN(state => state.profile?.userId);
  return owner ? <OwnerOperations key={owner} owner={owner}>{children}</OwnerOperations> : children;
}
