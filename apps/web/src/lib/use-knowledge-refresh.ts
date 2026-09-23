'use client';
import { useEffect, useRef } from 'react';

/** Refresh a mounted view after a confirmed save/undo without remounting its editor. */
export function useKnowledgeRefresh(refresh: () => void | Promise<void>) {
  const current = useRef(refresh); current.current = refresh;
  useEffect(() => {
    const handler = () => { void Promise.resolve(current.current()).catch(() => {}); };
    window.addEventListener('nn:knowledge-changed', handler);
    return () => window.removeEventListener('nn:knowledge-changed', handler);
  }, []);
}
