'use client';

// StudioPanel («Блокноты 2.0» N2, Р12 «Студия» tab) — the right-dock studio
// surface: a grid of generation tiles, the artifact list with job-status badges
// (polled by use-artifact-status while any job is non-terminal), and an
// overlay viewer that renders a ready artifact's markdown with clickable
// `[src:]` footnote chips.
//
//  • Tiles: 5 markdown types (summary/study_guide/faq/timeline/glossary) + a
//    `quiz` tile (N3) that opens a question-count dialog before generating. A
//    markdown tile click POSTs createArtifact(type) over the workspace's checked
//    source scope, then optimistically refreshes the list. 4xx/409 errors map to
//    an i18n toast by the machine error code (generation_in_progress → «Дождитесь…»).
//  • A ready `quiz` artifact opens the QuizPlayer (instead of the markdown
//    viewer): question-by-question runner → server-scored result → «слабые места
//    → карточки» chat-prefill + attempt history.
//  • List rows: type icon + title + status badge (spinner/pulse for pending/
//    generating, rose for error with the errorCode prose, plain for ready) +
//    updatedAt + a ⋯ menu (regenerate / delete with confirm). A ready row opens
//    the viewer.
//  • Viewer: markdown via the SAME card render pipeline (renderCardHtml →
//    SafeHtml). [src:<chunkId>] tokens are stripped from the prose and rendered
//    as a numbered, clickable footnote row ([1][2]…) — a click calls
//    `onOpenCitation(chunkId)` (the workspace resolves the chunk's source and
//    opens its citation-viewer). Buttons: copy (markdown, tokens stripped), to a
//    note, regenerate, delete.
//  • Gating: !chatEnabled ⇒ a setup notice instead of the tiles (degrade).
//
// Panel-local state; the parent owns the store methods + the chat-prefill /
// citation-open handoffs. Inline styles + CSS vars + ui.tsx primitives only.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  NOTEBOOK_ARTIFACT_TYPES,
  QUIZ_QUESTIONS_DEFAULT,
  QUIZ_QUESTIONS_MAX,
  type ArtifactErrorCode,
  type ArtifactStatus,
  type NotebookArtifactType,
} from '@neuronexus/shared';
import { NNBtn, NNCard, NNIcon, NNBadge, NNSkeleton } from '@/components/ui';
import { renderCardHtml, SafeHtml } from '@/lib/render-card';
import { useDialog } from '@/components/dialog';
import { raiseToast } from '@/components/toasts';
import { useArtifactStatus, useArtifactTimers } from '@/lib/use-artifact-status';
import {
  formatCharCount,
  formatElapsedSeconds,
  splitElapsed,
} from '@/lib/artifact-progress';
import { parseArtifactCitations, stripSrcTokens } from '@/lib/notebook-artifacts';
import { QuizPlayer } from '@/components/notebook/quiz-player';
import type { buildAttemptAnswers } from '@/lib/quiz-player';
import type { NotebookArtifact, QuizAttempt } from '@/lib/types';

type Tfn = (key: string, params?: Record<string, string | number>) => string;

// A single-field "basic" note-type that feeds artifact markdown through the card
// render pipeline (markdown-it → DOMPurify via SafeHtml) — same pattern as the
// notes panel + chat AssistantMarkdown. The sanitizer stays the single boundary.
const ARTIFACT_MD_NOTE_TYPE = {
  kind: 'basic' as const,
  templates: [{ name: 'artifact', ord: 0, frontTemplate: '{{Body}}', backTemplate: '{{Body}}' }],
};

// The icon shown per artifact type (from the available NNIcon set).
const TYPE_ICON: Record<NotebookArtifactType, string> = {
  summary: 'doc',
  study_guide: 'book',
  faq: 'bulb',
  timeline: 'clock',
  glossary: 'tag',
  quiz: 'target',
};

// The non-quiz markdown types, in generation-tile order (quiz is appended last
// and opens a question-count dialog before generating — N3).
const MARKDOWN_TYPES = NOTEBOOK_ARTIFACT_TYPES.filter((tp) => tp !== 'quiz');

const ARTIFACT_ERROR_CODE_SET = new Set<string>([
  'ai_disabled',
  'timeout',
  'generation_failed',
  'invalid_quiz',
  'no_sources',
  'interrupted',
]);

export interface StudioPanelProps {
  notebookId: string;
  /** The workspace's checked source scope (chat checkboxes). Empty ⇒ the server
   *  defaults to all ready sources. */
  scopeIds: string[];
  /** /ai/status.chatEnabled — gates the generation tiles (degrade, never crash). */
  chatEnabled: boolean;
  listArtifacts: (notebookId: string) => Promise<NotebookArtifact[]>;
  createArtifact: (
    notebookId: string,
    type: NotebookArtifactType,
    sourceIds?: string[],
    questionCount?: number,
  ) => Promise<NotebookArtifact>;
  getArtifact: (notebookId: string, artifactId: string) => Promise<NotebookArtifact>;
  deleteArtifact: (notebookId: string, artifactId: string) => Promise<void>;
  regenerateArtifact: (notebookId: string, artifactId: string) => Promise<NotebookArtifact>;
  /** Quiz attempt submit + history (N3) — threaded into the quiz player. */
  submitQuizAttempt: (
    notebookId: string,
    artifactId: string,
    answers: ReturnType<typeof buildAttemptAnswers>,
  ) => Promise<QuizAttempt>;
  listQuizAttempts: (notebookId: string, artifactId: string) => Promise<QuizAttempt[]>;
  /** A `[src:]` footnote chip was clicked — the workspace resolves the chunk's
   *  source + opens its citation-viewer. */
  onOpenCitation: (chunkId: string, sourceIds: string[]) => void;
  /** «В заметку» — save a ready artifact's markdown into the notebook's notes. */
  onSaveToNote: (title: string, contentMd: string) => void | Promise<void>;
  /** «Слабые места → карточки» — prefill the chat composer (quiz result, N3). */
  onPrefillChat: (text: string) => void;
  t: Tfn;
}

export const StudioPanel = ({
  notebookId,
  scopeIds,
  chatEnabled,
  listArtifacts,
  createArtifact,
  getArtifact,
  deleteArtifact,
  regenerateArtifact,
  submitQuizAttempt,
  listQuizAttempts,
  onOpenCitation,
  onSaveToNote,
  onPrefillChat,
  t,
}: StudioPanelProps) => {
  const { confirm } = useDialog();

  // Quiz question-count picker (N3): when the quiz tile is clicked we open a small
  // inline dialog (presets + slider) before POSTing the artifact job.
  const [quizDialogOpen, setQuizDialogOpen] = useState(false);

  const [artifacts, setArtifacts] = useState<NotebookArtifact[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState<NotebookArtifactType | null>(null);

  // Open viewer (full artifact incl. content); null = list.
  const [openId, setOpenId] = useState<string | null>(null);
  const [openFull, setOpenFull] = useState<NotebookArtifact | null>(null);
  const [openLoading, setOpenLoading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const rows = await listArtifacts(notebookId);
      setArtifacts(rows);
    } catch {
      /* keep current on a transient error */
    } finally {
      setLoaded(true);
    }
  }, [listArtifacts, notebookId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Poll the list while any job is non-terminal (pending|generating).
  useArtifactStatus({ items: artifacts, refresh, enabled: chatEnabled });

  // Live elapsed timers (anchored on first non-terminal sighting, NOT createdAt —
  // a regenerate keeps the old createdAt). `now` ticks every second while running.
  const { startedAt, now } = useArtifactTimers(artifacts);

  // Keep the open viewer fresh: when a polled list row for the open artifact
  // flips to ready, re-fetch the full content.
  const openListRow = useMemo(
    () => (openId ? artifacts.find((a) => a.id === openId) ?? null : null),
    [artifacts, openId],
  );
  const openFullStatusRef = useRef<ArtifactStatus | null>(null);
  openFullStatusRef.current = openFull?.status ?? null;

  const loadFull = useCallback(
    async (artifactId: string) => {
      setOpenLoading(true);
      try {
        const full = await getArtifact(notebookId, artifactId);
        setOpenFull(full);
      } catch {
        setOpenFull(null);
      } finally {
        setOpenLoading(false);
      }
    },
    [getArtifact, notebookId],
  );

  // Re-fetch the full content when the open row's status changes under polling
  // (e.g. generating → ready), so the viewer shows the finished document.
  useEffect(() => {
    if (!openId || !openListRow) return;
    if (openListRow.status !== openFullStatusRef.current) {
      void loadFull(openId);
    }
  }, [openId, openListRow, loadFull]);

  // LIVE viewer: while the open artifact is still generating, poll its FULL
  // content every ~2s so the growing partial text streams into the viewer (the
  // list-row status alone stays 'generating', so the status-change effect above
  // never re-fires during a stream). Stops the instant it goes terminal.
  const openFullStatus = openFull?.status ?? null;
  useEffect(() => {
    if (!openId) return;
    if (openFullStatus !== 'pending' && openFullStatus !== 'generating') return;
    const interval = setInterval(() => void loadFull(openId), 2000);
    return () => clearInterval(interval);
  }, [openId, openFullStatus, loadFull]);

  const openArtifact = useCallback(
    (a: NotebookArtifact) => {
      setOpenId(a.id);
      setOpenFull(null);
      void loadFull(a.id);
    },
    [loadFull],
  );

  // ── Generate ──────────────────────────────────────────────────────────────────
  const onGenerate = useCallback(
    async (type: NotebookArtifactType, questionCount?: number) => {
      if (creating) return;
      setCreating(type);
      try {
        const scope = scopeIds.length > 0 ? scopeIds : undefined;
        const created = await createArtifact(notebookId, type, scope, questionCount);
        setArtifacts((prev) => [created, ...prev]);
      } catch (err) {
        raiseToast({ kind: 'info', title: artifactErrorToast(err, t) });
      } finally {
        setCreating(null);
      }
    },
    [creating, scopeIds, createArtifact, notebookId, t],
  );

  // Quiz tile → open the question-count dialog; the dialog's «Generate» calls
  // onGenerate('quiz', count).
  const onQuizConfirm = useCallback(
    (count: number) => {
      setQuizDialogOpen(false);
      void onGenerate('quiz', count);
    },
    [onGenerate],
  );

  // ── Row actions ─────────────────────────────────────────────────────────────────
  const onRegenerate = useCallback(
    async (a: NotebookArtifact) => {
      try {
        const updated = await regenerateArtifact(notebookId, a.id);
        setArtifacts((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
        if (openId === a.id) setOpenFull(updated);
      } catch (err) {
        raiseToast({ kind: 'info', title: artifactErrorToast(err, t) });
      }
    },
    [regenerateArtifact, notebookId, openId, t],
  );

  const onDelete = useCallback(
    async (a: NotebookArtifact) => {
      const yes = await confirm({
        title: t('notebooks.studio.delete'),
        message: t('notebooks.studio.deleteConfirm'),
        danger: true,
        confirmLabel: t('notebooks.studio.delete'),
      });
      if (!yes) return;
      try {
        await deleteArtifact(notebookId, a.id);
        setArtifacts((prev) => prev.filter((x) => x.id !== a.id));
        if (openId === a.id) {
          setOpenId(null);
          setOpenFull(null);
        }
      } catch {
        raiseToast({ kind: 'info', title: t('notebooks.studio.createFailed') });
      }
    },
    [confirm, t, deleteArtifact, notebookId, openId],
  );

  // ── Render: viewer ──────────────────────────────────────────────────────────────
  if (openId) {
    const closeViewer = () => {
      setOpenId(null);
      setOpenFull(null);
    };
    // A ready quiz opens the PLAYER, not the markdown viewer.
    if (openFull && openFull.type === 'quiz' && openFull.status === 'ready') {
      return (
        <QuizPlayer
          notebookId={notebookId}
          artifact={openFull}
          sourceIds={openFull.sourceIds ?? openListRow?.sourceIds ?? []}
          submitQuizAttempt={submitQuizAttempt}
          listQuizAttempts={listQuizAttempts}
          onOpenCitation={onOpenCitation}
          onPrefillChat={onPrefillChat}
          onBack={closeViewer}
          t={t}
        />
      );
    }
    return (
      <ArtifactViewer
        artifact={openFull}
        loading={openLoading}
        sourceIds={openFull?.sourceIds ?? openListRow?.sourceIds ?? []}
        onBack={closeViewer}
        onOpenCitation={onOpenCitation}
        onSaveToNote={onSaveToNote}
        onRegenerate={() => {
          if (!openFull) return;
          // Kick the regenerate and return to the list so the user sees the
          // pending badge + live polling (the viewer would otherwise show the
          // stale/old content while the new one generates).
          void onRegenerate(openFull);
          setOpenId(null);
          setOpenFull(null);
        }}
        onDelete={() => openFull && void onDelete(openFull)}
        t={t}
      />
    );
  }

  // ── Render: list + tiles ─────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {quizDialogOpen && (
        <QuizCountDialog
          onConfirm={onQuizConfirm}
          onClose={() => setQuizDialogOpen(false)}
          t={t}
        />
      )}
      <div className="nn-scroll" style={{ flex: 1, overflowY: 'auto', padding: '10px 10px 14px' }}>
        {/* Generation tiles (or a setup notice when chat is off). */}
        {!chatEnabled ? (
          <div className="nn-empty-state" style={{ paddingTop: 24, paddingBottom: 24 }}>
            <span className="nn-empty-state-icon">
              <NNIcon name="sparkle" size={26} color="var(--text-dim)" />
            </span>
            <p className="nn-empty-state-hint">{t('notebooks.studio.setupHint')}</p>
          </div>
        ) : (
          <>
            <span
              className="nn-chrome"
              style={{
                display: 'block',
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.07em',
                color: 'var(--text-dim)',
                marginBottom: 8,
              }}
            >
              {t('notebooks.studio.generateHeading')}
            </span>
            <div className="nn-studio-tiles">
              {MARKDOWN_TYPES.map((type) => (
                <StudioTile
                  key={type}
                  type={type}
                  busy={creating === type}
                  disabled={creating !== null}
                  onClick={() => void onGenerate(type)}
                  t={t}
                />
              ))}
              {/* Quiz (N3) — opens a question-count dialog before generating. */}
              <StudioTile
                key="quiz"
                type="quiz"
                busy={creating === 'quiz'}
                disabled={creating !== null}
                onClick={() => setQuizDialogOpen(true)}
                t={t}
              />
            </div>
          </>
        )}

        {/* Artifact list. */}
        <span
          className="nn-chrome"
          style={{
            display: 'block',
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
            color: 'var(--text-dim)',
            margin: '16px 0 8px',
          }}
        >
          {t('notebooks.studio.listHeading')}
        </span>
        {!loaded ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <NNSkeleton style={{ height: 44 }} />
            <NNSkeleton style={{ height: 44 }} />
          </div>
        ) : artifacts.length === 0 ? (
          <div className="nn-empty-state" style={{ paddingTop: 18, paddingBottom: 18 }}>
            <span className="nn-empty-state-icon">
              <NNIcon name="stack" size={24} color="var(--text-dim)" />
            </span>
            <p className="nn-empty-state-hint">{t('notebooks.studio.empty')}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {artifacts.map((a) => (
              <ArtifactRow
                key={a.id}
                artifact={a}
                // A ready row opens the final viewer; a generating row opens the
                // LIVE viewer (growing partial text + caret). pending/error don't open.
                onOpen={() =>
                  (a.status === 'ready' || a.status === 'generating') && openArtifact(a)
                }
                elapsedMs={
                  a.status === 'generating'
                    ? (startedAt(a.id) ? now - startedAt(a.id)! : 0)
                    : undefined
                }
                onRegenerate={() => void onRegenerate(a)}
                onDelete={() => void onDelete(a)}
                t={t}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Generation tile ────────────────────────────────────────────────────────────

const StudioTile = ({
  type,
  busy = false,
  disabled = false,
  onClick,
  t,
}: {
  type: NotebookArtifactType;
  busy?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  t: Tfn;
}) => (
  <button
    type="button"
    className="nn-studio-tile"
    disabled={disabled}
    onClick={onClick}
    title={t(`notebooks.studio.type_${type}Desc`)}
  >
    <span className="nn-studio-tile-icon">
      {busy ? (
        <span className="nn-spin" style={{ display: 'flex' }}>
          <NNIcon name="sync" size={16} color="var(--lime-400)" />
        </span>
      ) : (
        <NNIcon name={TYPE_ICON[type]} size={16} color="var(--lime-400)" />
      )}
    </span>
    <span className="nn-studio-tile-body">
      <span className="nn-studio-tile-name">{t(`notebooks.studio.type_${type}`)}</span>
      <span className="nn-studio-tile-desc">{t(`notebooks.studio.type_${type}Desc`)}</span>
    </span>
  </button>
);

// ── Artifact list row ─────────────────────────────────────────────────────────

const ArtifactRow = ({
  artifact,
  onOpen,
  elapsedMs,
  onRegenerate,
  onDelete,
  t,
}: {
  artifact: NotebookArtifact;
  onOpen: () => void;
  /** Elapsed ms since the job was first seen generating (live timer). */
  elapsedMs?: number;
  onRegenerate: () => void;
  onDelete: () => void;
  t: Tfn;
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const ready = artifact.status === 'ready';
  // A generating row is openable too (LIVE viewer); pending/error are not.
  const openable = artifact.status === 'ready' || artifact.status === 'generating';
  const terminal = artifact.status === 'ready' || artifact.status === 'error';

  return (
    <div className="nn-source-row" style={{ cursor: openable ? 'pointer' : 'default' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          type="button"
          onClick={openable ? onOpen : undefined}
          disabled={!openable}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            flex: 1,
            minWidth: 0,
            background: 'transparent',
            border: 'none',
            cursor: openable ? 'pointer' : 'default',
            padding: 0,
            textAlign: 'left',
          }}
        >
          <NNIcon name={TYPE_ICON[artifact.type]} size={14} color="var(--text-muted)" />
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
              flex: 1,
            }}
          >
            {artifact.title}
          </span>
        </button>
        <ArtifactStatusBadge
          status={artifact.status}
          errorCode={artifact.errorCode}
          progressChars={artifact.progressChars}
          elapsedMs={elapsedMs}
          t={t}
        />
        <div
          className="nn-source-row-actions"
          style={{ display: 'flex', gap: 0, flexShrink: 0, position: 'relative' }}
        >
          <NNBtn
            variant="ghost"
            size="sm"
            icon="dots"
            ariaLabel={t('notebooks.studio.regenerate')}
            title={t('notebooks.studio.regenerate')}
            onClick={() => setMenuOpen((v) => !v)}
          />
          {menuOpen && (
            <>
              <div
                onClick={() => setMenuOpen(false)}
                style={{ position: 'fixed', inset: 0, zIndex: 40 }}
              />
              <div className="nn-lib-menu" style={{ right: 0, top: 'calc(100% + 4px)', minWidth: 180 }}>
                <button
                  type="button"
                  className="nn-lib-menu-item"
                  disabled={!terminal}
                  onClick={() => {
                    setMenuOpen(false);
                    onRegenerate();
                  }}
                >
                  <NNIcon name="sync" size={14} color="var(--text-muted)" />
                  {t('notebooks.studio.regenerate')}
                </button>
                <button
                  type="button"
                  className="nn-lib-menu-item"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete();
                  }}
                >
                  <NNIcon name="x" size={14} color="var(--text-muted)" />
                  {t('notebooks.studio.delete')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

/** «N сек» / «N мин M сек» from elapsed ms via the pure splitters. */
function formatElapsed(elapsedMs: number, t: Tfn): string {
  const { minutes, seconds } = splitElapsed(formatElapsedSeconds(elapsedMs));
  return minutes > 0
    ? t('notebooks.studio.elapsedMin', { minutes, seconds })
    : t('notebooks.studio.elapsedSec', { seconds });
}

/** The bare formatted count «1 234» / «12,3 тыс.» (no «симв.» unit). */
function liveCharsDisplay(n: number, t: Tfn): string {
  const c = formatCharCount(n);
  return c.isThousands ? `${c.display} ${t('notebooks.studio.charsK')}` : c.display;
}

/** «≈1 234 симв.» / «≈12,3 тыс. симв.» from a raw char count. */
function formatChars(n: number, t: Tfn): string {
  return t('notebooks.studio.chars', { chars: liveCharsDisplay(n, t) });
}

const ArtifactStatusBadge = ({
  status,
  errorCode,
  progressChars,
  elapsedMs,
  t,
}: {
  status: ArtifactStatus;
  errorCode: string | null;
  progressChars?: number;
  elapsedMs?: number;
  t: Tfn;
}) => {
  if (status === 'ready') return null;
  if (status === 'error') {
    const code = errorCode && ARTIFACT_ERROR_CODE_SET.has(errorCode) ? errorCode : 'generation_failed';
    return (
      <NNBadge tone="rose" size="xs">
        {t(`notebooks.studio.error_${code as ArtifactErrorCode}`)}
      </NNBadge>
    );
  }
  if (status === 'pending') {
    return (
      <NNBadge tone="amber" size="xs">
        <span className="nn-pulse-dot" style={{ marginRight: 4 }} />
        {t('notebooks.studio.queued')}
      </NNBadge>
    );
  }
  // generating — a soft pulsing badge with a live elapsed timer + char counter.
  const parts: string[] = [];
  if (typeof elapsedMs === 'number') parts.push(formatElapsed(elapsedMs, t));
  if (typeof progressChars === 'number' && progressChars > 0) {
    parts.push(formatChars(progressChars, t));
  }
  return (
    <NNBadge tone="amber" size="xs">
      <span className="nn-pulse-dot" style={{ marginRight: 4 }} />
      {parts.length > 0 ? parts.join(' · ') : t('notebooks.studio.statusGenerating')}
    </NNBadge>
  );
};

// ── Artifact viewer ──────────────────────────────────────────────────────────

const ArtifactViewer = ({
  artifact,
  loading,
  sourceIds,
  onBack,
  onOpenCitation,
  onSaveToNote,
  onRegenerate,
  onDelete,
  t,
}: {
  artifact: NotebookArtifact | null;
  loading: boolean;
  sourceIds: string[];
  onBack: () => void;
  onOpenCitation: (chunkId: string, sourceIds: string[]) => void;
  onSaveToNote: (title: string, contentMd: string) => void | Promise<void>;
  onRegenerate: () => void;
  onDelete: () => void;
  t: Tfn;
}) => {
  const contentMd = artifact?.contentMd ?? '';
  // A job still running streams partial raw text into content_md — show it live
  // (md: caret-tailed prose; quiz: a placeholder, the raw JSON isn't readable).
  const live = artifact != null && (artifact.status === 'generating' || artifact.status === 'pending');
  const { prose, footnotes } = useMemo(() => parseArtifactCitations(contentMd), [contentMd]);
  const html = useMemo(
    () => renderCardHtml(ARTIFACT_MD_NOTE_TYPE, { Body: prose }, 'front'),
    [prose],
  );

  const onCopy = useCallback(() => {
    void navigator.clipboard
      ?.writeText(stripSrcTokens(contentMd))
      .then(() => raiseToast({ kind: 'info', title: t('notebooks.studio.copied') }))
      .catch(() => undefined);
  }, [contentMd, t]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 10px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        <NNBtn variant="ghost" size="sm" icon="chevl" onClick={onBack}>
          {t('notebooks.studio.back')}
        </NNBtn>
        <span style={{ flex: 1 }} />
        {artifact && (
          <>
            {/* Copy / to-note / regenerate finalize a READY doc — hidden while a
                stream is still running (only delete + back make sense live). */}
            {!live && (
              <>
                <NNBtn
                  variant="ghost"
                  size="sm"
                  icon="clip"
                  ariaLabel={t('notebooks.studio.copy')}
                  title={t('notebooks.studio.copy')}
                  onClick={onCopy}
                />
                <NNBtn
                  variant="ghost"
                  size="sm"
                  icon="doc"
                  ariaLabel={t('notebooks.studio.toNote')}
                  title={t('notebooks.studio.toNote')}
                  onClick={() => void onSaveToNote(artifact.title, contentMd)}
                />
                <NNBtn
                  variant="ghost"
                  size="sm"
                  icon="sync"
                  ariaLabel={t('notebooks.studio.regenerate')}
                  title={t('notebooks.studio.regenerate')}
                  onClick={onRegenerate}
                />
              </>
            )}
            <NNBtn
              variant="ghost"
              size="sm"
              icon="x"
              ariaLabel={t('notebooks.studio.delete')}
              title={t('notebooks.studio.delete')}
              onClick={onDelete}
            />
          </>
        )}
      </div>

      <div className="nn-scroll" style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {(loading && !artifact) || (!artifact) ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <NNSkeleton style={{ height: 18, width: '60%' }} />
            <NNSkeleton style={{ height: 120 }} />
          </div>
        ) : live && artifact.type === 'quiz' ? (
          // Quiz streams raw JSON into content_md — unreadable as markdown; show a
          // placeholder with the live char count instead.
          <div className="nn-empty-state" style={{ paddingTop: 28, paddingBottom: 28 }}>
            <span className="nn-empty-state-icon">
              <span className="nn-spin" style={{ display: 'flex' }}>
                <NNIcon name="sync" size={22} color="var(--lime-400)" />
              </span>
            </span>
            <p className="nn-empty-state-hint">
              {t('notebooks.studio.quizGenerating', {
                chars: liveCharsDisplay(contentMd.length, t),
              })}
            </p>
          </div>
        ) : live ? (
          // Markdown types: render the partial prose with a blinking caret. Skip the
          // footnote row — [src:] tokens finalize (intersect) only at ready.
          <>
            <h3
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: 'var(--text)',
                margin: '0 0 10px',
                fontFamily: 'var(--font-sans)',
                wordBreak: 'break-word',
              }}
            >
              {artifact.title}
            </h3>
            {contentMd.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0 }}>
                {t('notebooks.studio.liveGenerating')}
              </p>
            ) : (
              <div style={{ position: 'relative' }}>
                <SafeHtml
                  html={html}
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 13.5,
                    lineHeight: 1.6,
                    color: 'var(--text)',
                    wordBreak: 'break-word',
                  }}
                />
                <span className="nn-artifact-caret" aria-hidden="true" />
              </div>
            )}
          </>
        ) : (
          <>
            <h3
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: 'var(--text)',
                margin: '0 0 10px',
                fontFamily: 'var(--font-sans)',
                wordBreak: 'break-word',
              }}
            >
              {artifact.title}
            </h3>
            <SafeHtml
              html={html}
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 13.5,
                lineHeight: 1.6,
                color: 'var(--text)',
                wordBreak: 'break-word',
              }}
            />
            {footnotes.length > 0 && (
              <div className="nn-studio-footnotes">
                {footnotes.map((f) => (
                  <button
                    key={f.chunkId}
                    type="button"
                    className="nn-studio-footnote"
                    onClick={() => onOpenCitation(f.chunkId, sourceIds)}
                    title={t('notebooks.backlinks.open')}
                  >
                    <NNIcon name="doc" size={10} color="var(--sky-400)" />
                    {f.n}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// ── Quiz question-count dialog (N3) ─────────────────────────────────────────────
// A small modal: presets (5/10/15/20) + a slider, default QUIZ_QUESTIONS_DEFAULT.
// «Сгенерировать» POSTs a quiz job with the chosen count (server clamps to the cap).

const QUIZ_PRESETS = [5, 10, 15, 20] as const;

const QuizCountDialog = ({
  onConfirm,
  onClose,
  t,
}: {
  onConfirm: (count: number) => void;
  onClose: () => void;
  t: Tfn;
}) => {
  const [count, setCount] = useState<number>(QUIZ_QUESTIONS_DEFAULT);
  return (
    <>
      <div
        className="nn-dialog-backdrop"
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,0.5)' }}
      />
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 91,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
          pointerEvents: 'none',
        }}
      >
        <NNCard
          padding={18}
          style={{
            width: 360,
            maxWidth: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            pointerEvents: 'auto',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <NNIcon name="target" size={16} color="var(--lime-400)" />
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0, flex: 1, fontFamily: 'var(--font-sans)' }}>
              {t('notebooks.quiz.dialogTitle')}
            </h3>
            <NNBtn variant="ghost" size="sm" icon="x" ariaLabel={t('actions.cancel')} onClick={onClose} />
          </div>

          <p style={{ fontSize: 12.5, color: 'var(--text-dim)', margin: 0 }}>
            {t('notebooks.quiz.dialogHint')}
          </p>

          {/* Presets */}
          <div style={{ display: 'flex', gap: 8 }}>
            {QUIZ_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                className={`nn-quiz-preset${count === p ? ' selected' : ''}`}
                onClick={() => setCount(p)}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Slider + live value */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="range"
              min={3}
              max={QUIZ_QUESTIONS_MAX}
              step={1}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="nn-quiz-slider"
              style={{ flex: 1, accentColor: 'var(--lime-500)' }}
              aria-label={t('notebooks.quiz.dialogTitle')}
            />
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', minWidth: 24, textAlign: 'right' }}>
              {count}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <NNBtn variant="ghost" size="sm" onClick={onClose}>
              {t('actions.cancel')}
            </NNBtn>
            <NNBtn variant="primary" size="sm" icon="target" onClick={() => onConfirm(count)}>
              {t('notebooks.quiz.dialogGenerate')}
            </NNBtn>
          </div>
        </NNCard>
      </div>
    </>
  );
};

// ── Error → toast text ──────────────────────────────────────────────────────────

const ROUTE_ERROR_CODES = new Set([
  'no_sources',
  'invalid_type',
  'too_many_artifacts',
  'generation_in_progress',
  'not_terminal',
  'ai_disabled',
]);

/** Map a thrown ok()-error to a studio toast string by its machine code. */
function artifactErrorToast(err: unknown, t: Tfn): string {
  const code = extractErrorCode(err);
  if (code && ROUTE_ERROR_CODES.has(code)) return t(`notebooks.studio.err_${code}`);
  return t('notebooks.studio.createFailed');
}

/** Best-effort extraction of the `{ error: <code> }` body from an ok() throw. */
function extractErrorCode(err: unknown): string | null {
  if (!err) return null;
  // ok() throws an Error whose message is the JSON-stringified error body.
  const msg = err instanceof Error ? err.message : String(err);
  const m = msg.match(/"error"\s*:\s*"([a-z_]+)"/);
  if (m) return m[1]!;
  // Plain code string fallback.
  if (/^[a-z_]+$/.test(msg)) return msg;
  return null;
}
