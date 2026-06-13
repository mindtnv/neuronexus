'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { NNBadge, NNBtn, NNCard, NNIcon, NNKbd, NNSkeleton, NNTag } from '@/components/ui';
import { previewGrades, xpForRating } from '@neuronexus/shared';
import { humanInterval } from '@/lib/fsrs';
import { api, ok } from '@/lib/api';
import { cardFromApi } from '@/lib/mappers';
import { RichCard } from '@/components/rich-card';
import { SimilarCardsPanel } from '@/components/similar-cards';
import { SourcePeekChip, SourcePeekPanel, useFirstCardSource } from '@/components/source-peek';
import { raiseToast } from '@/components/toasts';
import { useT } from '@/lib/i18n';
import { useNN } from '@/lib/store';
import { useUI } from '@/lib/ui-store';
import { useBreakpoint } from '@/lib/use-breakpoint';
import { useEmptyRedirect } from '@/lib/use-empty-redirect';
import { resolveDeckConfigClient } from '@/lib/deck-config';
import type { Card, CardSourceLink, Rating } from '@/lib/types';

type RatingMeta = {
  k: Rating;
  labelKey: string;
  tone: 'rose' | 'amber' | 'lime' | 'sky';
  hue: string;
  bg: string;
  bgHover: string;
};

// Subtle tonal градация — each rating carries its semantic hue only on the
// keycap chip + the interval, with a near-invisible tinted surface that lifts on
// hover. No acid fills; the row reads as one calm control strip, not four loud
// buttons.
const RATINGS: RatingMeta[] = [
  { k: 1, labelKey: 'review.ratings.again', tone: 'rose', hue: 'var(--rose-400)', bg: 'color-mix(in srgb, var(--rose-400) 5%, transparent)', bgHover: 'color-mix(in srgb, var(--rose-400) 12%, transparent)' },
  { k: 2, labelKey: 'review.ratings.hard', tone: 'amber', hue: 'var(--amber-400)', bg: 'color-mix(in srgb, var(--amber-400) 5%, transparent)', bgHover: 'color-mix(in srgb, var(--amber-400) 12%, transparent)' },
  { k: 3, labelKey: 'review.ratings.good', tone: 'lime', hue: 'var(--lime-400)', bg: 'color-mix(in srgb, var(--lime-400) 5%, transparent)', bgHover: 'color-mix(in srgb, var(--lime-400) 12%, transparent)' },
  { k: 4, labelKey: 'review.ratings.easy', tone: 'sky', hue: 'var(--sky-400)', bg: 'color-mix(in srgb, var(--sky-400) 5%, transparent)', bgHover: 'color-mix(in srgb, var(--sky-400) 12%, transparent)' },
];

// Friendly label for the render-kind eyebrow (was a raw English token like
// "typein" sitting next to the tags — looked like a debug badge). Falls back to
// the kind string for any future render kinds.
const renderKindLabel = (kind: string, t: (k: string) => string): string => {
  switch (kind) {
    case 'cloze':
      return t('editor.variants.cloze');
    case 'typein':
      return t('editor.variants.type');
    default:
      return t('editor.variants.basic');
  }
};

export const NNReview = ({ variant: _variant = 'classic' }: { variant?: 'classic' }) => {
  return <NNReviewClassic />;
};

// Type-in char-by-char diff
type DiffToken = { ch: string; kind: 'match' | 'extra' | 'missing' };

const diffAnswer = (userRaw: string, targetRaw: string): DiffToken[] => {
  const user = userRaw.trim();
  const target = targetRaw.trim();
  const u = user.toLowerCase();
  const t = target.toLowerCase();
  const m = u.length;
  const n = t.length;
  // LCS via DP
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (u[i - 1] === t[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const tokens: DiffToken[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (u[i - 1] === t[j - 1]) {
      tokens.push({ ch: target[j - 1], kind: 'match' });
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      tokens.push({ ch: user[i - 1], kind: 'extra' });
      i--;
    } else {
      tokens.push({ ch: target[j - 1], kind: 'missing' });
      j--;
    }
  }
  while (i > 0) {
    tokens.push({ ch: user[i - 1], kind: 'extra' });
    i--;
  }
  while (j > 0) {
    tokens.push({ ch: target[j - 1], kind: 'missing' });
    j--;
  }
  return tokens.reverse();
};

// ─────────────────────────────────────────────
// Variant A: Classic — functional flip card backed by store + FSRS
// ─────────────────────────────────────────────
export const NNReviewClassic = () => {
  const t = useT();
  useEmptyRedirect('first-run');
  const router = useRouter();
  const searchParams = useSearchParams();
  const filteredDeckId = searchParams.get('filteredDeckId') ?? undefined;
  // deck= param from the decks screen "Review" button (per-deck scoped queue).
  const deckId = searchParams.get('deck') ?? undefined;
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';
  const bootstrapped = useNN((s) => s.bootstrapped);
  const decks = useNN((s) => s.decks);
  const noteTypes = useNN((s) => s.noteTypes);
  const filteredDecks = useNN((s) => s.filteredDecks);
  const presets = useNN((s) => s.presets);
  const profile = useNN((s) => s.profile);
  const grade = useNN((s) => s.gradeCard);
  const undoLastReview = useNN((s) => s.undoLastReview);
  const zenMode = useUI((s) => s.zenMode);
  const toggleZen = useUI((s) => s.toggleZen);
  const setZen = useUI((s) => s.setZen);

  // Always exit zen when /review unmounts (route change away). app-shell also
  // guards this by pathname, but the local cleanup makes it robust to direct
  // unmounts and keeps re-entry non-zen.
  useEffect(() => () => setZen(false), [setZen]);

  // Freeze the queue for this session so newly-rescheduled cards don't jump back in
  const [queue, setQueue] = useState<Card[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  // Semantic "similar cards" drawer — only offered AFTER reveal (similar cards
  // would spoil the answer before the flip).
  const [similarOpen, setSimilarOpen] = useState(false);
  // Feature #1 — «провал → источник». On a lapse (Again) for a card WITH
  // provenance we HOLD the queue advance and surface the cited passage right in
  // the reviewer (an overlay popover). The grade already committed server-side;
  // only the visual advance waits for «понятно, дальше» / Esc. null = no peek.
  const [pendingPeek, setPendingPeek] = useState<CardSourceLink | null>(null);
  const [completed, setCompleted] = useState(0);
  const [xpGained, setXpGained] = useState(0);
  const [startedAt, setStartedAt] = useState<number>(() => Date.now());
  const [gradeCounts, setGradeCounts] = useState<Record<Rating, number>>({ 1: 0, 2: 0, 3: 0, 4: 0 });
  // 'regular' | 'filtered' — populated from the queue envelope's `mode` field
  const [sessionMode, setSessionMode] = useState<'regular' | 'filtered'>('regular');

  // Type variant state
  const [typedAnswer, setTypedAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Flip-glow pulse
  const [glow, setGlow] = useState(false);

  const lockRef = useRef(false);
  // Remember the last rating so undo can rewind the session XP / grade tallies
  // by the exact amount the grade added.
  const lastGradeRef = useRef<Rating | null>(null);
  const sessionStartRef = useRef<number>(Date.now());
  const sessionSavedRef = useRef(false);
  const sessionStartedRef = useRef(false);
  const queueLoadedRef = useRef(false);

  // Build the session queue from the server's scheduler queue — this respects
  // the daily new/review caps and excludes suspended (leeched) cards. We freeze
  // it once for the session so rescheduled cards don't jump back in.
  useEffect(() => {
    if (!bootstrapped || queueLoadedRef.current) return;
    queueLoadedRef.current = true;
    (async () => {
      try {
        const query: Record<string, string> = {};
        if (filteredDeckId) query.filteredDeckId = filteredDeckId;
        if (deckId) query.deckId = deckId;
        const res: any = await ok(await (api as any).cards.queue.get({ query }));
        const due = ((res?.due ?? []) as any[]).map(cardFromApi);
        const fresh = ((res?.new ?? []) as any[]).map(cardFromApi);
        const q = [...due, ...fresh];
        // Capture the mode from the envelope for mode-aware grading (Decision 7).
        if (res?.mode === 'filtered') {
          setSessionMode('filtered');
        }
        setQueue(q);
        setStartedAt(Date.now());
        sessionStartRef.current = Date.now();
        if (q.length > 0) sessionStartedRef.current = true;
      } catch {
        // Leave the queue empty → renders the "all caught up" empty state.
      }
    })();
  // filteredDeckId is stable for the lifetime of the session (frozen by queueLoadedRef).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrapped]);

  const current = queue[index];
  const deck = useMemo(() => (current ? decks.find((d) => d.id === current.deckId) : undefined), [current, decks]);

  // Feature #1 — the current card's first cited source (null when hand-authored).
  // Drives the post-reveal provenance chip AND the lapse peek. The hook is a
  // no-op without provenance, so manual cards stay clean.
  const firstSource = useFirstCardSource(current?.id ?? null);

  // Resolve per-deck FSRS config so preview intervals match what the server
  // will actually schedule (mirrors server deck-config.ts resolveDeckConfig).
  const currentDeckConfig = useMemo(
    () => resolveDeckConfigClient(current?.deckId, decks, presets, profile),
    [current?.deckId, decks, presets, profile],
  );

  const previews = useMemo(
    () =>
      current
        ? previewGrades(current.fsrs, new Date(), {
            requestRetention: currentDeckConfig.desiredRetention,
            learningSteps: currentDeckConfig.learningSteps,
            relearningSteps: currentDeckConfig.relearningSteps,
            maximumInterval: currentDeckConfig.maximumInterval,
          })
        : null,
    [current, currentDeckConfig],
  );

  // Pulse glow whenever reveal-state changes
  useEffect(() => {
    if (!current) return;
    setGlow(true);
    const t = setTimeout(() => setGlow(false), 220);
    return () => clearTimeout(t);
  }, [revealed, current]);

  // Reset per-card state when card changes
  useEffect(() => {
    setTypedAnswer('');
    setSubmitted(false);
    setRevealed(false);
  }, [current?.id]);

  // Autofocus input for the type-in render kind
  useEffect(() => {
    if (current?.renderKind === 'typein' && !submitted) {
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [current?.id, current?.renderKind, submitted]);

  // Advance to the next card + reset per-card state. Split out of handleGrade so
  // a held lapse-peek (Feature #1) can defer it to «понятно, дальше» without
  // duplicating the reset logic.
  const advanceQueue = useCallback(() => {
    setPendingPeek(null);
    setIndex((i) => i + 1);
    setRevealed(false);
    setSubmitted(false);
    setTypedAnswer('');
    setStartedAt(Date.now());
  }, []);

  const handleGrade = useCallback(
    async (rating: Rating) => {
      if (!current || lockRef.current) return;
      // Type-in: don't allow grading before submission
      if (current.renderKind === 'typein' && !submitted) return;
      lockRef.current = true;
      const duration = Date.now() - startedAt;
      try {
        // Pass source:'filtered' when in a filtered session so the server skips
        // the global daily counters (plan Decision 2 / Must-Fix #5).
        const source = sessionMode === 'filtered' ? 'filtered' as const : undefined;
        await grade(current.id, rating, duration, source);
        lastGradeRef.current = rating;
        setCompleted((c) => c + 1);
        setXpGained((x) => x + xpForRating(rating));
        setGradeCounts((g) => ({ ...g, [rating]: g[rating] + 1 }));
        // Feature #1 — on a lapse (Again) for a card WITH a usable cited source,
        // HOLD the advance and surface the passage. The grade is already
        // committed; the peek is a non-blocking post-grade affordance dismissed
        // via «понятно, дальше» / Esc, which then advances the queue.
        if (rating === 1 && firstSource && firstSource.sourceId) {
          setPendingPeek(firstSource);
        } else {
          advanceQueue();
        }
      } catch (err) {
        console.error('grade failed', err);
        raiseToast({ kind: 'error', title: t('common.toasts.error') });
      } finally {
        lockRef.current = false;
      }
    },
    [current, grade, sessionMode, startedAt, submitted, t, firstSource, advanceQueue],
  );

  // Undo the most recent grade. Restores the card + profile server-side (and in
  // the store mirror), steps the in-session queue back one card so the user can
  // re-grade, and rewinds the session XP/count tallies. 404 (nothing to undo) /
  // 409 (card modified) are surfaced as toasts. ⌘Z / Ctrl+Z or the button.
  const handleUndo = useCallback(async () => {
    if (lockRef.current) return;
    lockRef.current = true;
    const toast = (description: string) =>
      window.dispatchEvent(
        new CustomEvent('nn:toast', { detail: { kind: 'info', description } }),
      );
    try {
      await undoLastReview();
      // Rewind the in-session tallies + step back to the just-graded card.
      setCompleted((c) => Math.max(0, c - 1));
      setXpGained((x) => {
        const last = lastGradeRef.current;
        return last ? Math.max(0, x - xpForRating(last)) : x;
      });
      setGradeCounts((g) => {
        const last = lastGradeRef.current;
        if (!last) return g;
        return { ...g, [last]: Math.max(0, g[last] - 1) };
      });
      lastGradeRef.current = null;
      // A held lapse-peek (Feature #1) means the grade committed but the queue
      // did NOT advance — the index still points at the un-graded card, so we
      // re-reveal it in place rather than stepping back (which would skip a card).
      if (pendingPeek) {
        setPendingPeek(null);
      } else {
        setIndex((i) => Math.max(0, i - 1));
      }
      setRevealed(false);
      setSubmitted(false);
      setTypedAnswer('');
      setStartedAt(Date.now());
      toast(t('editor.review.undo.toast'));
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'card_modified_since_review') {
        toast(t('editor.review.undo.modified'));
      } else {
        // 'nothing_to_undo' (404) or any other failure.
        toast(t('editor.review.undo.empty'));
      }
    } finally {
      lockRef.current = false;
    }
  }, [undoLastReview, t, pendingPeek]);

  const handleTypeSubmit = useCallback(() => {
    if (!current || current.renderKind !== 'typein' || submitted) return;
    setSubmitted(true);
    setRevealed(true);
  }, [current, submitted]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA';

      // Escape: a held lapse-peek closes FIRST and advances (the grade already
      // committed); then an open similar-cards drawer closes; then zen exits
      // focus; otherwise exit the reviewer to home.
      if (e.key === 'Escape') {
        if (pendingPeek) {
          e.preventDefault();
          advanceQueue();
          return;
        }
        if (similarOpen) {
          e.preventDefault();
          setSimilarOpen(false);
          return;
        }
        if (zenMode) {
          e.preventDefault();
          setZen(false);
          return;
        }
        e.preventDefault();
        router.push('/');
        return;
      }

      // f / F — toggle zen (focus) mode. Outside inputs only so typing an 'f'
      // in the type-in field doesn't flip focus mode.
      if ((e.key === 'f' || e.key === 'F') && !inInput && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        toggleZen();
        return;
      }

      // Undo last grade — ⌘Z / Ctrl+Z. Works outside inputs only (don't steal
      // the native undo while typing). Available even on the done screen so the
      // user can still revert the final grade.
      if ((e.key === 'z' || e.key === 'Z') && (e.metaKey || e.ctrlKey) && !e.shiftKey && !inInput) {
        e.preventDefault();
        handleUndo();
        return;
      }

      if (!current) return;

      // While a lapse-peek is held, the card is already graded — swallow
      // navigation/flip/grade keys (Esc above is the way out). Edit/undo still
      // worked above; everything below is queue-movement that the peek defers.
      if (pendingPeek) return;

      // Edit shortcut — only outside inputs
      if ((e.key === 'e' || e.key === 'E') && !inInput) {
        e.preventDefault();
        router.push(`/editor?card=${current.id}`);
        return;
      }

      // Previous — visual only
      if (e.key === 'j' && !inInput) {
        e.preventDefault();
        setIndex((i) => Math.max(0, i - 1));
        setRevealed(false);
        setSubmitted(false);
        setTypedAnswer('');
        return;
      }
      // Skip forward — clamp to the LAST card (queue.length - 1) so the cursor
      // can't run off the end (one-past-last) and trip premature SessionDone +
      // session save without grading.
      if (e.key === 'k' && !inInput) {
        e.preventDefault();
        setIndex((i) => Math.min(queue.length - 1, i + 1));
        setRevealed(false);
        setSubmitted(false);
        setTypedAnswer('');
        return;
      }

      // Space — flip / submit
      if (e.code === 'Space') {
        if (current.renderKind === 'typein') {
          if (submitted) return; // noop — answer already visible
          if (inInput) return; // let user type spaces in the input
          e.preventDefault();
          handleTypeSubmit();
          return;
        }
        if (inInput) return;
        e.preventDefault();
        setRevealed((v) => !v);
        return;
      }

      // Grade keys
      if (!revealed) return;
      if (current.renderKind === 'typein' && !submitted) return;
      if (inInput) return;
      if (e.key === '1') handleGrade(1);
      else if (e.key === '2') handleGrade(2);
      else if (e.key === '3') handleGrade(3);
      else if (e.key === '4') handleGrade(4);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [revealed, current, handleGrade, handleUndo, router, queue.length, submitted, handleTypeSubmit, zenMode, toggleZen, setZen, similarOpen, pendingPeek, advanceQueue]);

  // Moving to another card closes the similar drawer (it belongs to the card).
  useEffect(() => {
    setSimilarOpen(false);
  }, [current?.id]);

  // Save session when queue exhausted
  useEffect(() => {
    if (
      sessionStartedRef.current &&
      !sessionSavedRef.current &&
      queue.length > 0 &&
      !current
    ) {
      sessionSavedRef.current = true;
      try {
        const reviewed = queue.slice(0, completed);
        const deckCount = new Map<string, number>();
        reviewed.forEach((c) => deckCount.set(c.deckId, (deckCount.get(c.deckId) ?? 0) + 1));
        let dominantDeckId: string | undefined;
        let maxCount = 0;
        for (const [id, count] of deckCount) {
          if (count > maxCount) {
            maxCount = count;
            dominantDeckId = id;
          }
        }
        const uniqueDecks = deckCount.size;
        const deckName =
          uniqueDecks > 1
            ? t('review.mixedQueue')
            : decks.find((d) => d.id === dominantDeckId)?.name ?? t('review.queueFallback');

        const payload = {
          completedAt: Date.now(),
          deckName,
          cards: completed,
          xpGained,
          durationMs: Date.now() - sessionStartRef.current,
          grades: gradeCounts,
        };
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('nn:lastSession', JSON.stringify(payload));
        }
      } catch {
        // best-effort
      }
    }
  }, [current, queue, completed, xpGained, gradeCounts, decks, t]);

  if (!bootstrapped) {
    return <ReviewSkeleton isMobile={isMobile} />;
  }

  if (queue.length === 0) {
    return (
      <ReviewEmpty
        title={t('review.allCaught.title')}
        subtitle={t('review.allCaught.subtitle')}
        cta={t('review.allCaught.cta')}
        href="/editor"
        customStudyHref="/review/custom-study"
        customStudyLabel={t('review.customStudy.title')}
      />
    );
  }

  if (!current) {
    return <SessionDone completed={completed} xp={xpGained} />;
  }

  const total = queue.length;
  const progress = (index / total) * 100;
  const fsrsState = current.fsrs;
  const elapsed = fsrsState.last_review
    ? Math.max(0, Math.floor((Date.now() - new Date(fsrsState.last_review).getTime()) / (1000 * 60 * 60 * 24)))
    : null;

  const renderKind = current.renderKind;
  const isCloze = renderKind === 'cloze';
  const isTypein = renderKind === 'typein';

  // Lazy HTML render from the note-type template + the note's sanitized field
  // values, via <RichCard> (markdown + math + code + async mermaid → DOMPurified
  // at the single SafeHtml edge it wraps). cloze front = prompt (blanks), back =
  // revealed. The queue payload embeds note + noteType (C-5), so render mode +
  // content come from the payload with no extra fetch.
  const renderNoteType = current.noteType ?? null;
  const renderFieldValues = current.note?.fieldValues ?? {};
  // For cloze, the FRONT card area flips between the prompt (front) and the
  // revealed answer (back) by switching the rendered SIDE.
  const promptSide: 'front' | 'back' = isCloze ? (revealed ? 'back' : 'front') : 'front';
  // Type-in compares the typed answer against the note-type's ANSWER field — the
  // LAST field by ordinal (Anki convention; "Back" for the builtin Type-in, but
  // works for renamed-field clones too). Resolve the full note-type from the
  // store by id (the embedded payload carries no field list); fall back to the
  // raw "Back" value, then the server-rendered back plaintext.
  const typeinNoteType = renderNoteType
    ? noteTypes.find((nt) => nt.id === renderNoteType.id)
    : undefined;
  const typeinTargetField =
    typeinNoteType && typeinNoteType.fields.length > 0
      ? [...typeinNoteType.fields].sort((a, b) => a.ord - b.ord).at(-1)?.name
      : undefined;
  const typeinTarget =
    (typeinTargetField ? renderFieldValues[typeinTargetField] : undefined) ??
    renderFieldValues['Back'] ??
    current.renderBackText;

  // Sans (not display-serif) at a sane scale — the old 48px serif both read as
  // "местами очень большой шрифт" and, being the em-base for the whole rendered
  // subtree, ballooned inline code / tables. Question stays the largest element
  // but no longer dominates; cloze a touch smaller (the prompt carries blanks).
  const frontFontSize = isMobile
    ? (isCloze ? 22 : 24)
    : (isCloze ? 26 : 28);

  // Which section controls reveal/ratings visibility per render kind.
  const showAnswerSection = isTypein ? submitted : revealed;
  const showRatings = showAnswerSection;

  // Reserve space at the bottom of the scroll area so the fixed rating bar
  // (or the "Show answer" button on mobile) never overlaps the card footer.
  const reservedBottom = showRatings ? (isMobile ? 108 : 118) : isMobile ? 88 : 0;

  return (
    <div
      style={{
        flex: 1,
        overflow: 'auto',
        padding: isMobile ? `0 14px ${reservedBottom}px` : `0 32px ${Math.max(24, reservedBottom)}px`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        position: 'relative',
      }}
    >
      {/* Zen mode: subtle floating exit affordance — the topbar is hidden, so
          this keeps the exit discoverable. Calm, top-right, never competes. */}
      {zenMode && (
        <button
          type="button"
          onClick={() => setZen(false)}
          title={`${t('review.exitFocus')} · Esc`}
          aria-label={t('review.exitFocus')}
          style={{
            position: 'absolute',
            top: isMobile ? 10 : 18,
            right: isMobile ? 12 : 24,
            zIndex: 30,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 10px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 9,
            color: 'var(--text-muted)',
            fontSize: 11.5,
            fontFamily: 'inherit',
            cursor: 'pointer',
            opacity: 0.7,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.7')}
        >
          <NNIcon name="x" size={12} color="var(--text-muted)" />
          <span>{t('review.exitFocus')}</span>
          <NNKbd>Esc</NNKbd>
        </button>
      )}

      {/* progress — deck badge · slim bar · count+XP · undo · focus */}
      <div
        style={{
          width: '100%',
          maxWidth: 760,
          padding: isMobile ? '12px 0 18px' : '20px 0 28px',
          display: 'flex',
          alignItems: 'center',
          gap: isMobile ? 10 : 16,
          flexShrink: 0,
        }}
      >
        <NNBadge icon="stack" size="sm" tone={deck?.color ?? 'neutral'}>
          {deck?.name ?? t('review.queueFallback')}
        </NNBadge>
        {sessionMode === 'filtered' && (
          <NNBadge size="sm" tone="violet">
            {t('review.customStudy.filterBadge')}
          </NNBadge>
        )}
        <div
          style={{
            flex: 1,
            height: 5,
            background: 'var(--surface-3)',
            borderRadius: 'var(--r-pill)',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <div
            style={{
              width: `${progress}%`,
              height: '100%',
              borderRadius: 'var(--r-pill)',
              background: 'linear-gradient(90deg, var(--lime-600), var(--lime-400))',
              transition: 'width 280ms cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />
        </div>
        <span
          style={{ fontSize: 12, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'baseline', gap: 6 }}
          className="mono"
        >
          <span>
            <span style={{ color: 'var(--text)' }}>{index}</span>
            <span style={{ opacity: 0.55 }}> / {total}</span>
          </span>
          <span style={{ color: 'var(--lime-400)', fontWeight: 600 }}>+{xpGained} XP</span>
        </span>
        {completed > 0 && (
          <NNBtn
            size="sm"
            variant="ghost"
            icon="sync"
            onClick={handleUndo}
            title={`${t('editor.review.undo.button')} (⌘Z)`}
          >
            {!isMobile && t('editor.review.undo.button')}
          </NNBtn>
        )}
        {revealed && (
          <NNBtn
            size="sm"
            variant="ghost"
            icon="stars"
            onClick={() => setSimilarOpen((v) => !v)}
            title={t('review.similar.open')}
            ariaLabel={t('review.similar.open')}
          />
        )}
        <NNBtn
          size="sm"
          variant="ghost"
          icon={zenMode ? 'x' : 'target'}
          onClick={() => toggleZen()}
          title={`${zenMode ? t('review.exitFocus') : t('review.focusMode')} (f)`}
          ariaLabel={zenMode ? t('review.exitFocus') : t('review.focusMode')}
        />
      </div>

      {/* Similar-cards drawer — desktop: floating right panel; mobile: bottom
          sheet. Overlay only (no layout shift), lazily rendered while open.
          Clicking a similar card jumps to the browser dock (?focus=). */}
      {similarOpen && current && (
        <aside
          role="dialog"
          aria-label={t('review.similar.title')}
          style={
            isMobile
              ? {
                  position: 'fixed',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  maxHeight: '55vh',
                  zIndex: 60,
                  background: 'var(--surface)',
                  borderTop: '1px solid var(--border)',
                  borderRadius: 'var(--r-xl) var(--r-xl) 0 0',
                  boxShadow: 'var(--shadow-lg)',
                  padding: '12px 14px calc(12px + env(safe-area-inset-bottom))',
                  overflow: 'auto',
                }
              : {
                  position: 'fixed',
                  right: 16,
                  top: 76,
                  bottom: 96,
                  width: 320,
                  zIndex: 60,
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-xl)',
                  boxShadow: 'var(--shadow-lg)',
                  padding: '12px 14px',
                  overflow: 'auto',
                }
          }
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <NNIcon name="stars" size={14} color="var(--lime-400)" />
            <span style={{ fontSize: 13, fontWeight: 600 }}>{t('review.similar.title')}</span>
            <div style={{ flex: 1 }} />
            <NNBtn
              size="sm"
              variant="ghost"
              icon="x"
              ariaLabel={t('review.similar.close')}
              onClick={() => setSimilarOpen(false)}
            />
          </div>
          <SimilarCardsPanel
            cardId={current.id}
            onOpen={(id) => router.push(`/cards?focus=${id}`)}
          />
          {/* Source backlinks moved OUT of the similar drawer (Feature #1): the
              card's provenance now lives in the post-reveal SourcePeekChip + the
              lapse SourcePeekPanel below, in the review flow itself. */}
        </aside>
      )}

      {/* Card */}
      <div
        onClick={(e) => {
          // Don't flip when clicking interactive children
          const t = e.target as HTMLElement;
          if (
            t.tagName === 'INPUT' ||
            t.tagName === 'BUTTON' ||
            t.tagName === 'A' ||
            t.closest('button') ||
            t.closest('a')
          )
            return;
          if (isTypein && !submitted) return;
          setRevealed((v) => !v);
        }}
        style={{
          width: '100%',
          maxWidth: 760,
          // Modest floor so a one-line card has presence, then the card HUGS its
          // content (the flex spacer that forced 380px of emptiness is gone).
          minHeight: isMobile ? 160 : 200,
          borderRadius: 'var(--r-xl)',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          flexShrink: 0,
          padding: isMobile ? '20px 18px' : '28px 32px',
          cursor: isTypein && !submitted ? 'default' : 'pointer',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: glow
            ? '0 0 0 1px color-mix(in srgb, var(--lime-400) 30%, transparent), var(--shadow-lg)'
            : 'var(--shadow-lg)',
          transition: 'box-shadow 220ms ease, transform 220ms ease',
        }}
      >
        {/* Card meta row — friendly kind chip + tags */}
        <div style={{ display: 'flex', gap: 8, marginBottom: isMobile ? 16 : 18, flexWrap: 'wrap', alignItems: 'center' }}>
          <NNBadge size="xs" tone="neutral">
            {renderKindLabel(renderKind, t)}
          </NNBadge>
          {current.tags.map((t) => (
            <NNTag key={t} color={deck?.color === 'neutral' ? 'sky' : deck?.color ?? 'sky'}>
              {t}
            </NNTag>
          ))}
        </div>

        {/* Question eyebrow — explicit hierarchy label */}
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: 1.6,
            textTransform: 'uppercase',
            color: 'var(--text-dim)',
            fontFamily: 'var(--font-sans)',
            marginBottom: 12,
          }}
        >
          {isCloze && revealed ? t('review.answerLabel') : t('review.questionLabel')}
        </div>

        {/* Front / prompt — rendered from the note-type template + field values
            via RichCard (single SafeHtml sink + async mermaid). Cloze shows
            blanks on the front; once revealed it switches to the answer side. */}
        {renderNoteType && (
          <RichCard
            noteType={renderNoteType}
            fieldValues={renderFieldValues}
            side={promptSide}
            templateOrd={current.templateOrd}
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: frontFontSize,
              lineHeight: 1.3,
              letterSpacing: -0.3,
              color: 'var(--text)',
              fontWeight: 600,
              wordBreak: 'break-word',
            }}
          />
        )}

        {/* Type input */}
        {isTypein && (
          <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              ref={inputRef}
              type="text"
              autoFocus
              disabled={submitted}
              value={typedAnswer}
              onChange={(e) => setTypedAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !submitted) {
                  e.preventDefault();
                  handleTypeSubmit();
                }
              }}
              placeholder={t('review.type.placeholder')}
              style={{
                width: '100%',
                padding: '14px 16px',
                fontSize: 18,
                fontFamily: 'var(--font-sans)',
                borderRadius: 'var(--r-md)',
                border: '1px solid var(--border-2)',
                background: 'var(--surface-2)',
                color: 'var(--text)',
                outline: 'none',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--lime-500)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-2)';
              }}
            />
            {!submitted && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <NNBtn size="md" variant="primary" onClick={handleTypeSubmit}>
                  {t('review.type.checkBtn')}
                </NNBtn>
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                  {t('review.type.pressPrefix')} <NNKbd>Enter</NNKbd> {t('review.type.pressSuffix')}
                </span>
              </div>
            )}
            {submitted && (
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 'var(--r-md)',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  fontSize: 16,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
                className="mono"
              >
                {diffAnswer(typedAnswer, typeinTarget).map((tok, i) => {
                  if (tok.kind === 'match') {
                    return (
                      <span key={i} style={{ color: 'var(--text)' }}>
                        {tok.ch}
                      </span>
                    );
                  }
                  if (tok.kind === 'extra') {
                    return (
                      <span
                        key={i}
                        style={{
                          color: 'var(--rose-500)',
                          textDecoration: 'line-through',
                        }}
                      >
                        {tok.ch}
                      </span>
                    );
                  }
                  return (
                    <span
                      key={i}
                      style={{
                        color: 'var(--rose-500)',
                        textDecoration: 'underline',
                        textDecorationStyle: 'dotted',
                      }}
                    >
                      {tok.ch}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Divider + answer block — hidden for cloze (the prompt area itself
            flips to the answer side; rendering it here too would duplicate).
            For non-cloze, the answer is a quiet reveal: an "Answer" eyebrow, a
            thin accent rule on the left, and calm --text serif (NOT lime). */}
        {!isCloze && (
          <>
            <div
              style={{
                margin: isMobile ? '20px 0 0' : '24px 0 0',
                height: 1,
                background: 'linear-gradient(to right, var(--border-2), transparent)',
              }}
            />
            <div
              style={{
                opacity: showAnswerSection ? 1 : 0,
                transform: showAnswerSection ? 'translateY(0)' : 'translateY(8px)',
                transition: 'opacity 240ms ease, transform 240ms ease',
                pointerEvents: showAnswerSection ? 'auto' : 'none',
                minHeight: showAnswerSection ? 40 : 0,
                marginTop: showAnswerSection ? (isMobile ? 18 : 22) : 0,
              }}
            >
              {showAnswerSection && renderNoteType && (
                <>
                  <div
                    style={{
                      fontSize: 10.5,
                      fontWeight: 600,
                      letterSpacing: 1.6,
                      textTransform: 'uppercase',
                      color: 'var(--lime-400)',
                      fontFamily: 'var(--font-sans)',
                      marginBottom: 12,
                    }}
                  >
                    {t('review.answerLabel')}
                  </div>
                  <div
                    style={{
                      borderLeft: '2px solid var(--lime-500)',
                      paddingLeft: isMobile ? 14 : 18,
                    }}
                  >
                    <RichCard
                      noteType={renderNoteType}
                      fieldValues={renderFieldValues}
                      side="back"
                      templateOrd={current.templateOrd}
                      style={{
                        fontSize: isMobile ? 16 : 17,
                        fontWeight: 400,
                        color: 'var(--text)',
                        letterSpacing: 0,
                        fontFamily: 'var(--font-sans)',
                        lineHeight: 1.6,
                        wordBreak: 'break-word',
                      }}
                    />
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {!showAnswerSection && !isTypein && (
          <div
            style={{
              fontSize: 13.5,
              color: 'var(--text-dim)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginTop: isMobile ? 18 : 20,
            }}
          >
            <NNKbd>Space</NNKbd> {t('review.toRevealAnswer')}
          </div>
        )}

      </div>

      {/* Feature #1 — post-reveal provenance chip. Shown after the answer is
          revealed for ANY grade, ONLY when the card has a usable cited source.
          Non-intrusive; an explicit click opens the library reader at the chunk. */}
      {showAnswerSection && firstSource && (
        <div
          style={{
            width: '100%',
            maxWidth: 760,
            marginTop: 12,
            display: 'flex',
            justifyContent: 'flex-start',
            flexShrink: 0,
          }}
        >
          <SourcePeekChip item={firstSource} onOpen={(href) => router.push(href)} />
        </div>
      )}

      {/* Quiet meta + hotkey strip — moved OUT of the card so the card holds only
          the question/answer. FSRS stats left, navigation hints right, edit at
          the far end. Mono + dim, never competes with the content. */}
      <div
        style={{
          width: '100%',
          maxWidth: 760,
          marginTop: 14,
          display: 'flex',
          alignItems: 'center',
          gap: isMobile ? 10 : 16,
          fontSize: 11.5,
          color: 'var(--text-dim)',
          flexWrap: 'wrap',
          flexShrink: 0,
        }}
      >
        <span className="mono">
          {elapsed != null ? t('review.meta.lastAgo', { n: elapsed }) : t('review.meta.newCard')}
          {' · '}
          stability {fsrsState.stability.toFixed(1)} · reps {fsrsState.reps} · lapses {fsrsState.lapses}
        </span>
        <div style={{ flex: 1 }} />
        {!isMobile && (
          <span className="mono" style={{ opacity: 0.7, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <NNKbd>J</NNKbd> {t('review.hints.prev')} · <NNKbd>K</NNKbd> {t('review.hints.skip')} · <NNKbd>E</NNKbd> {t('review.hints.edit')} · <NNKbd>Esc</NNKbd> {t('review.hints.home')}
          </span>
        )}
        <Link
          href={`/editor?card=${current.id}`}
          onClick={(e) => e.stopPropagation()}
          style={{ color: 'inherit', display: 'inline-flex' }}
        >
          <NNBtn size="sm" variant="ghost" icon="edit" />
        </Link>
      </div>

      {/* Feature #1 — held lapse-peek overlay. On Again for a provenance card we
          pause the queue and float the cited passage here (replacing the rating
          bar, which is moot — the grade already committed). «Понятно, дальше» /
          Esc advances. Non-blocking: the card stays visible above. */}
      {pendingPeek && (
        <div
          role="dialog"
          aria-label={t('review.peek.title')}
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: isMobile ? 68 : 0,
            padding: isMobile ? '10px 14px calc(12px + env(safe-area-inset-bottom, 0px))' : '14px 24px 18px',
            display: 'flex',
            justifyContent: 'center',
            zIndex: 25,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 760,
              pointerEvents: 'auto',
              background: 'var(--surface)',
              border: '1px solid var(--rose-400)',
              borderRadius: 'var(--r-xl)',
              boxShadow: 'var(--shadow-lg)',
              padding: isMobile ? '12px 14px calc(12px + env(safe-area-inset-bottom, 0px))' : '14px 16px',
            }}
          >
            <SourcePeekPanel
              item={pendingPeek}
              onOpenLibrary={(href) => router.push(href)}
              onDismiss={advanceQueue}
            />
          </div>
        </div>
      )}

      <div
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: isMobile ? 68 : 0,
          padding: isMobile ? '10px 14px calc(12px + env(safe-area-inset-bottom, 0px))' : '14px 24px 18px',
          background: 'linear-gradient(180deg, color-mix(in srgb, var(--bg) 0%, transparent) 0%, var(--bg) 40%)',
          display: pendingPeek ? 'none' : 'flex',
          justifyContent: 'center',
          zIndex: 20,
          pointerEvents: 'none',
        }}
      >
        <div style={{ width: '100%', maxWidth: 760, pointerEvents: 'auto' }}>
          {showRatings && previews ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: isMobile ? 6 : 10,
                width: '100%',
              }}
            >
              {RATINGS.map((r) => {
                const preview = previews[r.k];
                return (
                  <button
                    key={r.k}
                    onClick={() => handleGrade(r.k)}
                    title={`${t(r.labelKey)} · ${r.k}`}
                    style={{
                      padding: isMobile ? '9px 8px' : '12px 14px',
                      borderRadius: 'var(--r-lg)',
                      cursor: 'pointer',
                      background: r.bg,
                      border: `1px solid var(--border-2)`,
                      borderTop: `2px solid ${r.hue}`,
                      color: 'var(--text)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: isMobile ? 3 : 5,
                      fontFamily: 'var(--font-sans)',
                      transition: 'transform 120ms ease, background 140ms ease, border-color 140ms ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = r.bgHover;
                      e.currentTarget.style.borderColor = r.hue;
                      e.currentTarget.style.borderTopColor = r.hue;
                    }}
                    onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.97)')}
                    onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                      e.currentTarget.style.background = r.bg;
                      e.currentTarget.style.borderColor = 'var(--border-2)';
                      e.currentTarget.style.borderTopColor = r.hue;
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 5 : 8, width: '100%' }}>
                      <span
                        className="mono"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 18,
                          height: 18,
                          borderRadius: 5,
                          fontSize: 10.5,
                          fontWeight: 600,
                          color: r.hue,
                          background: r.bgHover,
                          flexShrink: 0,
                        }}
                      >
                        {r.k}
                      </span>
                      <span style={{ fontSize: isMobile ? 12 : 14, fontWeight: 600, letterSpacing: -0.2 }}>
                        {t(r.labelKey)}
                      </span>
                    </div>
                    <div
                      style={{ fontSize: isMobile ? 10 : 11.5, color: 'var(--text-muted)', paddingLeft: isMobile ? 0 : 26 }}
                      className="mono"
                    >
                      {humanInterval(preview, new Date())}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : !isTypein ? (
            <NNBtn size="lg" variant="soft" onClick={() => setRevealed(true)} block>
              {t('review.showAnswer')}
            </NNBtn>
          ) : null}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// Empty/loading/done states
// ─────────────────────────────────────────────

function ReviewSkeleton({ isMobile }: { isMobile: boolean }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: isMobile ? '16px 14px 32px' : '24px 40px 48px',
        gap: 18,
      }}
    >
      {/* Top bar: progress + session meta */}
      <div
        style={{
          width: '100%',
          maxWidth: 720,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}
      >
        <NNSkeleton width={90} height={26} radius={999} />
        <NNSkeleton width="100%" height={6} radius={3} />
        <NNSkeleton width={72} height={16} />
      </div>

      {/* Card body */}
      <div
        style={{
          width: '100%',
          maxWidth: 720,
          padding: isMobile ? 22 : 32,
          borderRadius: 18,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          minHeight: isMobile ? 320 : 380,
        }}
      >
        <NNSkeleton width={60} height={20} radius={6} />
        <NNSkeleton width="80%" height={isMobile ? 28 : 40} />
        <NNSkeleton width="50%" height={isMobile ? 22 : 32} style={{ marginTop: 12 }} />
        <div style={{ flex: 1 }} />
        <NNSkeleton width="100%" height={14} />
        <NNSkeleton width="30%" height={12} />
      </div>

      {/* Ratings row */}
      <div
        style={{
          width: '100%',
          maxWidth: 720,
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: isMobile ? 6 : 10,
        }}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <NNSkeleton key={i} height={isMobile ? 56 : 64} radius={12} />
        ))}
      </div>
    </div>
  );
}

const ReviewEmpty = ({
  title,
  subtitle,
  cta,
  href,
  customStudyHref,
  customStudyLabel,
}: {
  title: string;
  subtitle: string;
  cta?: string;
  href?: string;
  customStudyHref?: string;
  customStudyLabel?: string;
}) => {
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';
  return (
    <div
      className="nn-empty-state"
      style={{
        gap: 14,
        padding: isMobile ? '0 14px 32px' : '0 32px 48px',
      }}
    >
      <h1 className="nn-h1" style={{ fontSize: isMobile ? 36 : 48, letterSpacing: -1 }}>{title}</h1>
      <div style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 460, lineHeight: 1.5 }}>{subtitle}</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
        {cta && href && (
          <Link href={href}>
            <NNBtn size="lg" variant="primary" icon="plus">
              {cta}
            </NNBtn>
          </Link>
        )}
        {customStudyHref && customStudyLabel && (
          <Link href={customStudyHref}>
            <NNBtn size="lg" variant="soft" icon="filter">
              {customStudyLabel}
            </NNBtn>
          </Link>
        )}
      </div>
    </div>
  );
};

const SessionDone = ({ completed, xp }: { completed: number; xp: number }) => {
  const t = useT();
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
        padding: isMobile ? '0 14px 32px' : '0 32px 48px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontFamily: 'var(--font-serif)', fontSize: isMobile ? 40 : 56, color: 'var(--text)', letterSpacing: -1.5 }}>
        {t('review.sessionComplete.title')}
      </div>
      <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>
        <span className="mono" style={{ color: 'var(--text)' }}>
          {completed}
        </span>{' '}
        {t('review.sessionComplete.cards')} ·{' '}
        <span className="mono" style={{ color: 'var(--lime-400)' }}>
          +{xp} XP
        </span>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Link href="/session/complete">
          <NNBtn size="lg" variant="primary" icon="check">
            {t('review.sessionComplete.viewSummary')}
          </NNBtn>
        </Link>
        <Link href="/">
          <NNBtn size="lg" variant="outline">
            {t('review.sessionComplete.backHome')}
          </NNBtn>
        </Link>
      </div>
    </div>
  );
};

