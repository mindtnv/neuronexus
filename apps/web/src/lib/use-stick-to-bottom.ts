'use client';

// useStickToBottom (B1) — smart scroll pinning for the chat transcript.
//
// The old behavior unconditionally yanked the pane to the bottom on every
// message/token update, fighting a user who scrolled up to re-read during a
// stream. This hook tracks whether the user is "near bottom" (within
// `threshold` px) and only auto-scrolls then; otherwise it raises `hasUnseen`
// so the caller can render a floating "jump to latest" pill.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

export interface StickToBottom {
  /** The user is within `threshold` px of the bottom (auto-follow active). */
  nearBottom: boolean;
  /** Content arrived while scrolled away — show the jump pill highlight. */
  hasUnseen: boolean;
  /** Scroll to the bottom now (pill click / new turn) + clear `hasUnseen`. */
  scrollToBottom: () => void;
  /** Call on every content change (messages effect): follows or flags unseen. */
  notifyContentChange: () => void;
}

export function useStickToBottom(
  ref: RefObject<HTMLElement | null>,
  opts: { threshold?: number } = {},
): StickToBottom {
  const threshold = opts.threshold ?? 120;
  const [nearBottom, setNearBottom] = useState(true);
  const [hasUnseen, setHasUnseen] = useState(false);
  // Mirror in a ref so notifyContentChange (called from effects) reads fresh.
  const nearBottomRef = useRef(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      const near = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
      nearBottomRef.current = near;
      setNearBottom(near);
      if (near) setHasUnseen(false);
    };
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [ref, threshold]);

  const scrollToBottom = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    nearBottomRef.current = true;
    setNearBottom(true);
    setHasUnseen(false);
  }, [ref]);

  const notifyContentChange = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (nearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    } else {
      setHasUnseen(true);
    }
  }, [ref]);

  return { nearBottom, hasUnseen, scrollToBottom, notifyContentChange };
}
