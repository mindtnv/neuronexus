'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { NNBadge, NNBtn, NNCard, NNIcon, NNKbd, NNSkeleton, NNTag } from '@/components/ui';
import { CLOZE_RE, previewGrades, xpForRating } from '@neuronexus/shared';
import { humanInterval } from '@/lib/fsrs';
import { api, ok } from '@/lib/api';
import { cardFromApi } from '@/lib/mappers';
import { useT } from '@/lib/i18n';
import { useNN } from '@/lib/store';
import { useBreakpoint } from '@/lib/use-breakpoint';
import { useEmptyRedirect } from '@/lib/use-empty-redirect';
import type { Card, Rating } from '@/lib/types';

type RatingMeta = {
  k: Rating;
  labelKey: string;
  tone: 'rose' | 'amber' | 'lime' | 'sky';
  hue: string;
  bg: string;
};

const RATINGS: RatingMeta[] = [
  { k: 1, labelKey: 'review.ratings.again', tone: 'rose', hue: 'var(--rose-500)', bg: 'rgba(232,120,138,0.12)' },
  { k: 2, labelKey: 'review.ratings.hard', tone: 'amber', hue: 'var(--amber-500)', bg: 'rgba(243,182,85,0.12)' },
  { k: 3, labelKey: 'review.ratings.good', tone: 'lime', hue: 'var(--lime-500)', bg: 'rgba(154,209,85,0.12)' },
  { k: 4, labelKey: 'review.ratings.easy', tone: 'sky', hue: 'var(--sky-500)', bg: 'rgba(85,196,214,0.12)' },
];

export const NNReview = ({ variant: _variant = 'classic' }: { variant?: 'classic' }) => {
  return <NNReviewClassic />;
};

// ─────────────────────────────────────────────
// Cloze helpers — the regex source comes from the shared CLOZE_RE
// (@neuronexus/shared); the JSX rendering stays local (DOM-specific).
// ─────────────────────────────────────────────
const renderClozePrompt = (text: string): React.ReactNode[] => {
  const out: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(CLOZE_RE.source, 'g');
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) {
      out.push(<span key={`t-${key++}`}>{text.slice(lastIndex, m.index)}</span>);
    }
    out.push(
      <span
        key={`b-${key++}`}
        style={{
          padding: '0 14px',
          borderBottom: '2px dashed var(--lime-400)',
          minWidth: 80,
          display: 'inline-block',
        }}
      >
        &nbsp;
      </span>,
    );
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) {
    out.push(<span key={`t-${key++}`}>{text.slice(lastIndex)}</span>);
  }
  return out;
};

const renderClozeRevealed = (text: string): React.ReactNode[] => {
  const out: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(CLOZE_RE.source, 'g');
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) {
      out.push(<span key={`t-${key++}`}>{text.slice(lastIndex, m.index)}</span>);
    }
    out.push(
      <span key={`f-${key++}`} style={{ color: 'var(--lime-400)', fontWeight: 600 }}>
        {m[1]}
      </span>,
    );
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) {
    out.push(<span key={`t-${key++}`}>{text.slice(lastIndex)}</span>);
  }
  return out;
};

// Type variant char-by-char diff
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
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';
  const bootstrapped = useNN((s) => s.bootstrapped);
  const decks = useNN((s) => s.decks);
  const profile = useNN((s) => s.profile);
  const grade = useNN((s) => s.gradeCard);

  // Freeze the queue for this session so newly-rescheduled cards don't jump back in
  const [queue, setQueue] = useState<Card[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [xpGained, setXpGained] = useState(0);
  const [startedAt, setStartedAt] = useState<number>(() => Date.now());
  const [gradeCounts, setGradeCounts] = useState<Record<Rating, number>>({ 1: 0, 2: 0, 3: 0, 4: 0 });

  // Type variant state
  const [typedAnswer, setTypedAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Flip-glow pulse
  const [glow, setGlow] = useState(false);

  const lockRef = useRef(false);
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
        const res: any = await ok(await (api as any).cards.queue.get({ query: {} }));
        const due = ((res?.due ?? []) as any[]).map(cardFromApi);
        const fresh = ((res?.new ?? []) as any[]).map(cardFromApi);
        const q = [...due, ...fresh];
        setQueue(q);
        setStartedAt(Date.now());
        sessionStartRef.current = Date.now();
        if (q.length > 0) sessionStartedRef.current = true;
      } catch {
        // Leave the queue empty → renders the "all caught up" empty state.
      }
    })();
  }, [bootstrapped]);

  const current = queue[index];
  const deck = useMemo(() => (current ? decks.find((d) => d.id === current.deckId) : undefined), [current, decks]);

  const previews = useMemo(
    () =>
      current
        ? previewGrades(current.fsrs, new Date(), {
            requestRetention: profile?.desiredRetention,
          })
        : null,
    [current, profile?.desiredRetention],
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

  // Autofocus input for type variant
  useEffect(() => {
    if (current?.variant === 'type' && !submitted) {
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [current?.id, current?.variant, submitted]);

  const handleGrade = useCallback(
    async (rating: Rating) => {
      if (!current || lockRef.current) return;
      // Type variant: don't allow grading before submission
      if (current.variant === 'type' && !submitted) return;
      lockRef.current = true;
      const duration = Date.now() - startedAt;
      try {
        await grade(current.id, rating, duration);
        setCompleted((c) => c + 1);
        setXpGained((x) => x + xpForRating(rating));
        setGradeCounts((g) => ({ ...g, [rating]: g[rating] + 1 }));
        setIndex((i) => i + 1);
        setRevealed(false);
        setSubmitted(false);
        setTypedAnswer('');
        setStartedAt(Date.now());
      } finally {
        lockRef.current = false;
      }
    },
    [current, grade, startedAt, submitted],
  );

  const handleTypeSubmit = useCallback(() => {
    if (!current || current.variant !== 'type' || submitted) return;
    setSubmitted(true);
    setRevealed(true);
  }, [current, submitted]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA';

      // Escape always exits to home
      if (e.key === 'Escape') {
        e.preventDefault();
        router.push('/');
        return;
      }

      if (!current) return;

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
      // Skip forward
      if (e.key === 'k' && !inInput) {
        e.preventDefault();
        setIndex((i) => Math.min(queue.length, i + 1));
        setRevealed(false);
        setSubmitted(false);
        setTypedAnswer('');
        return;
      }

      // Space — flip / submit
      if (e.code === 'Space') {
        if (current.variant === 'type') {
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
      if (current.variant === 'type' && !submitted) return;
      if (inInput) return;
      if (e.key === '1') handleGrade(1);
      else if (e.key === '2') handleGrade(2);
      else if (e.key === '3') handleGrade(3);
      else if (e.key === '4') handleGrade(4);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [revealed, current, handleGrade, router, queue.length, submitted, handleTypeSubmit]);

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

  const clozeSource =
    current.variant === 'cloze' ? (current.clozeText ?? current.front) : '';

  const frontFontSize = isMobile
    ? (current.variant === 'cloze' ? 28 : 32)
    : (current.variant === 'cloze' ? 36 : 48);

  // Which section controls reveal/ratings visibility per-variant
  const showAnswerSection =
    current.variant === 'type' ? submitted : revealed;
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
      {/* progress */}
      <div
        style={{
          width: '100%',
          maxWidth: 760,
          padding: isMobile ? '12px 0 16px' : '18px 0 24px',
          display: 'flex',
          alignItems: 'center',
          gap: isMobile ? 10 : 16,
          flexShrink: 0,
        }}
      >
        <NNBadge icon="stack" size="sm" tone={deck?.color ?? 'neutral'}>
          {deck?.name ?? t('review.queueFallback')}
        </NNBadge>
        <div
          style={{
            flex: 1,
            height: 6,
            background: 'var(--surface-3)',
            borderRadius: 3,
            overflow: 'hidden',
          }}
        >
          <div style={{ width: `${progress}%`, height: '100%', background: 'var(--lime-500)', transition: 'width 200ms ease' }} />
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }} className="mono">
          {index} / {total} · <span style={{ color: 'var(--lime-400)' }}>+{xpGained} XP</span>
        </span>
      </div>

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
          if (current.variant === 'type' && !submitted) return;
          setRevealed((v) => !v);
        }}
        style={{
          width: '100%',
          maxWidth: 760,
          minHeight: isMobile ? 280 : 380,
          borderRadius: 18,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          flexShrink: 0,
          padding: isMobile ? '20px 18px' : '36px 44px',
          cursor: current.variant === 'type' && !submitted ? 'default' : 'pointer',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          boxShadow: glow
            ? '0 0 0 2px rgba(154,209,85,0.35), var(--shadow-lg)'
            : 'var(--shadow-lg)',
          transition: 'box-shadow 220ms ease, transform 220ms ease',
        }}
      >
        <div style={{ display: 'flex', gap: 8, marginBottom: 28, flexWrap: 'wrap', alignItems: 'center' }}>
          <NNBadge size="xs" tone="neutral">
            {current.variant}
          </NNBadge>
          {current.tags.map((t) => (
            <NNTag key={t} color={deck?.color === 'neutral' ? 'sky' : deck?.color ?? 'sky'}>
              {t}
            </NNTag>
          ))}
        </div>

        {/* Front / prompt */}
        <div
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: frontFontSize,
            lineHeight: 1.15,
            letterSpacing: -1,
            color: 'var(--text)',
            fontWeight: 400,
            wordBreak: 'break-word',
          }}
        >
          {current.variant === 'cloze' ? (
            revealed ? (
              <>{renderClozeRevealed(clozeSource)}</>
            ) : (
              <>{renderClozePrompt(clozeSource)}</>
            )
          ) : (
            current.front
          )}
        </div>

        {/* Type input */}
        {current.variant === 'type' && (
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
                borderRadius: 10,
                border: '1px solid var(--border-2)',
                background: 'var(--surface-2)',
                color: 'var(--text)',
                outline: 'none',
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
                  borderRadius: 10,
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  fontSize: 16,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
                className="mono"
              >
                {diffAnswer(typedAnswer, current.back).map((tok, i) => {
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

        <div
          style={{
            margin: '28px 0',
            height: 1,
            background: 'linear-gradient(to right, transparent, var(--border-2), transparent)',
          }}
        />

        {/* Answer / reveal area (animated opacity + translate) */}
        <div
          style={{
            opacity: showAnswerSection ? 1 : 0,
            transform: showAnswerSection ? 'translateY(0)' : 'translateY(6px)',
            transition: 'opacity 200ms ease, transform 200ms ease',
            pointerEvents: showAnswerSection ? 'auto' : 'none',
            minHeight: 40,
          }}
        >
          {showAnswerSection && (
            <div
              style={{
                fontSize: 28,
                fontWeight: 500,
                color: 'var(--lime-400)',
                letterSpacing: -0.4,
                fontFamily: 'var(--font-serif)',
                lineHeight: 1.35,
              }}
            >
              {current.variant === 'cloze' ? (
                <>
                  <div>{renderClozeRevealed(clozeSource)}</div>
                  {current.back && (
                    <div
                      style={{
                        marginTop: 14,
                        fontSize: 15,
                        fontFamily: 'var(--font-sans)',
                        fontWeight: 400,
                        color: 'var(--text-muted)',
                        letterSpacing: 0,
                        lineHeight: 1.5,
                      }}
                    >
                      {current.back}
                    </div>
                  )}
                </>
              ) : (
                current.back
              )}
            </div>
          )}
        </div>

        {!showAnswerSection && current.variant !== 'type' && (
          <div
            style={{
              fontSize: 14,
              color: 'var(--text-dim)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <NNKbd>Space</NNKbd> {t('review.toRevealAnswer')}
          </div>
        )}

        <div style={{ flex: 1, minHeight: 20 }} />
        <div
          style={{
            paddingTop: 20,
            marginTop: 20,
            borderTop: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            fontSize: 11.5,
            color: 'var(--text-dim)',
            flexWrap: 'wrap',
          }}
        >
          <span className="mono">
            {elapsed != null ? t('review.meta.lastAgo', { n: elapsed }) : t('review.meta.newCard')}
            {' · '}
            stability {fsrsState.stability.toFixed(1)}
          </span>
          <span>·</span>
          <span className="mono">
            reps {fsrsState.reps} · lapses {fsrsState.lapses}
          </span>
          <div style={{ flex: 1 }} />
          <span className="mono" style={{ opacity: 0.7, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <NNKbd>J</NNKbd> {t('review.hints.prev')} · <NNKbd>K</NNKbd> {t('review.hints.skip')} · <NNKbd>E</NNKbd> {t('review.hints.edit')} · <NNKbd>Esc</NNKbd> {t('review.hints.home')}
          </span>
          <Link
            href={`/editor?card=${current.id}`}
            onClick={(e) => e.stopPropagation()}
            style={{ color: 'inherit', display: 'inline-flex' }}
          >
            <NNBtn size="sm" variant="ghost" icon="edit" />
          </Link>
        </div>
      </div>

      <div
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: isMobile ? 68 : 0,
          padding: isMobile ? '10px 14px calc(12px + env(safe-area-inset-bottom, 0px))' : '14px 24px 18px',
          background: 'linear-gradient(180deg, rgba(10,11,13,0) 0%, var(--bg) 40%)',
          display: 'flex',
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
                    style={{
                      padding: isMobile ? '10px 6px' : '14px 12px',
                      borderRadius: 12,
                      cursor: 'pointer',
                      background: r.bg,
                      border: `1px solid ${r.hue}`,
                      color: 'var(--text)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: 3,
                      fontFamily: 'var(--font-sans)',
                      transition: 'transform 120ms ease',
                    }}
                    onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.98)')}
                    onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                    onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 4 : 8, width: '100%' }}>
                      <NNKbd>{r.k}</NNKbd>
                      <span style={{ fontSize: isMobile ? 11 : 14, fontWeight: 600 }}>{t(r.labelKey)}</span>
                    </div>
                    <div style={{ fontSize: isMobile ? 10 : 11.5, color: 'var(--text-muted)' }} className="mono">
                      {humanInterval(preview, new Date())}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : current.variant !== 'type' ? (
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
}: {
  title: string;
  subtitle: string;
  cta?: string;
  href?: string;
}) => {
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
        gap: 14,
        padding: isMobile ? '0 14px 32px' : '0 32px 48px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontFamily: 'var(--font-serif)', fontSize: isMobile ? 36 : 48, color: 'var(--text)', letterSpacing: -1 }}>{title}</div>
      <div style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 460, lineHeight: 1.5 }}>{subtitle}</div>
      {cta && href && (
        <Link href={href} style={{ marginTop: 8 }}>
          <NNBtn size="lg" variant="primary" icon="plus">
            {cta}
          </NNBtn>
        </Link>
      )}
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

