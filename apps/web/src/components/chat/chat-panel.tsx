'use client';

// ChatPanel — the reusable grounded-chat core (transcript + composer + stream
// driver), extracted from the old `screens/chat.tsx` (NotebookLM M2 / T4).
//
//  • `mode: 'global'` — the standalone /chat screen: renders its OWN ThreadRail,
//    deck-scope picker, deep-research toggle, suggested pills, /research slash.
//    BEHAVIOR-IDENTICAL to the pre-extraction screen (same i18n keys, same
//    localStorage keys, queue/confirm wizard/stop/regenerate/citations).
//  • `mode: 'notebook'` — the workspace right panel: NO ThreadRail (the workspace
//    has its own switcher), conversations filtered to `notebookId`, created WITH
//    `notebookId`, every turn rides the workspace `sourceIds` scope. Deck-scope
//    picker, research toggle, suggested pills, /research are HIDDEN; the model
//    picker, attachments, confirm wizard, stop/regenerate/copy, queue stay.
//
//  • Conversations are lazy-loaded HERE on mount. All state is panel-local.
//  • List / open / create / delete go through Eden (lib/api.ts). Sending goes
//    through the RAW fetch+reader path (lib/chat-stream.ts) — Eden can't consume
//    a stream. Tokens render live as they arrive (AC6).
//  • On mount we read GET /ai/status; chatEnabled:false → a setup notice instead
//    of the composer (degrade, never crash — Principle 5).
//  • Card citations render through RichCard (Principle 4 / AC8); SOURCE citations
//    (M2) render as compact doc chips → onSourceCitation (workspace scrolls the
//    reader). Inline [card:<id>] / [src:<id>] grounding tokens are stripped from
//    the rendered prose.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAppNavigation } from '@/components/navigation';
import type {
  CardCitation,
  ChatModelOption,
  ChatResumeRequest,
  Citation,
  MessageAttachmentInput,
  SourceCitation,
} from '@neuronexus/shared';
import {
  CARD_TOKEN_RE as CARD_TOKEN_CORE_RE,
  SRC_TOKEN_RE as SRC_TOKEN_CORE_RE,
  isSourceCitation,
  MAX_MEDIA_BYTES,
  MEDIA_MIME_ALLOWLIST,
} from '@neuronexus/shared';
import {
  NNBadge,
  NNBtn,
  NNCard,
  NNIcon,
  NNInlineRefresh,
  NNKbd,
  NNLoadError,
  NNSkeleton,
} from '@/components/ui';
import { RichCard } from '@/components/rich-card';
import { renderCardHtml, SafeHtml } from '@/lib/render-card';
import { api, ok } from '@/lib/api';
import type { ResourceState } from '@/lib/resource-state';
import {
  fetchSessionResource,
  peekSessionResource,
} from '@/lib/session-resource';
import {
  regenerateChat,
  resumeChat,
  streamChat,
  type ChatStreamHandlers,
} from '@/lib/chat-stream';
import {
  applySummaryFrom,
  buildCardSelections,
  confirmDiffRows,
  createCardDraft,
  formatDayLabel,
  formatElapsed,
  groupHeaderState,
  hasAnswerlessUserTail,
  hasPendingConfirmation,
  needsDaySeparator,
  nextUndecidedIndex,
  PLURAL_TOOL_NAMES,
  reconstructMessages,
  summarizeSteps,
  toolIcon,
  toolLabel,
  usageTotal,
  type MessageVM,
  type PersistedMessageRow,
  type ToolCallVM,
} from '@/lib/chat-activity';
import { type ConversationVM } from '@/lib/chat-threads';
import {
  applyTrigger,
  detectComposerTrigger,
  filterSlashCommands,
  searchMentions,
  slashTemplate,
  type ComposerTrigger,
} from '@/lib/chat-mentions';
import { ThreadRail } from '@/components/chat/thread-rail';
import { ConfirmDiff } from '@/components/chat/confirm-diff';
import { MentionPopover, SlashMenu, mentionItems } from '@/components/chat/mention-popover';
import { useCodeCopyButtons } from '@/components/chat/code-copy';
import { useInlineCitations } from '@/components/chat/source-citations';
import {
  buildCitationNumbering,
  citationCoverLetter,
  citationCoverTone,
  citationLocation,
  type CitationNumbering,
} from '@/lib/chat-citations';
import { useStickToBottom } from '@/lib/use-stick-to-bottom';
import { cardFromApi } from '@/lib/mappers';
import { useNN } from '@/lib/store';
import { getDueCards } from '@/lib/cards';
import type { Card } from '@/lib/types';
import { useBreakpoint } from '@/lib/use-breakpoint';
import { useT, useLocale } from '@/lib/i18n';
import { useDialog } from '@/components/dialog';
import { raiseToast } from '@/components/toasts';

// The view-model + persisted-row types (`MessageVM`, `ToolCallVM`,
// `PersistedMessageRow`, `ConversationVM`) and the pure reconstruction/parse
// helpers live in `@/lib/chat-activity` + `@/lib/chat-threads` (ONE definition
// each — re-imported above). This screen only wires them into JSX.

type AiStatus = {
  embeddingEnabled: boolean;
  chatEnabled: boolean;
  degraded: boolean;
  /** Model allow-list for the per-turn picker (AC2.2). `[]` ⇒ picker hidden. */
  models: ChatModelOption[];
  /** Image attachments offered only when the server has vision on (CHAT_VISION). */
  visionEnabled?: boolean;
  /** The fetch_page tool is available — gates the deep-research mode toggle. */
  fetchPageEnabled?: boolean;
};

// ── Composer attachments ──────────────────────────────────────────────────────

/** One composer attachment chip (image: uploaded media ref; text: inline). */
interface AttachmentChipVM {
  key: string;
  kind: 'image' | 'text';
  name: string;
  /** image: set after the upload finishes. */
  mediaId?: string;
  /** image: `/m/<uuid>` preview path (Next rewrite → MinIO/S3). */
  token?: string;
  /** image: client-known MIME (preview only — the server trusts its DB row). */
  mime?: string;
  /** text: file content (client-truncated; the server re-caps). */
  text?: string;
  uploading?: boolean;
}

/** Max attachments per message (mirrors the server's body schema cap). */
const ATTACH_MAX = 4;
/** Text-file extensions accepted for inline attachment. */
const ATTACH_TEXT_TYPES = /\.(txt|md|markdown|csv|json|log)$/i;
/** Raw text-file size gate (the content is then truncated to ATTACH_TEXT_CHARS). */
const ATTACH_TEXT_FILE_MAX_BYTES = 256 * 1024;
/** Inline text-content cap (mirrors the server's re-cap). */
const ATTACH_TEXT_CHARS = 16_000;

// ── Helpers ──────────────────────────────────────────────────────────────────
// `conversationTitle` / `relativeUpdated` moved to lib/chat-threads (pure,
// unit-tested) — the rail renders them via the extracted ThreadRail.

// Absolute timestamp for the message-bubble hover title (AC3.2). Locale-formatted
// via Intl; falls back to the raw ISO string if it can't be parsed.
function formatTimestamp(iso: string | undefined, locale: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return d.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return d.toLocaleString();
  }
}

// Strip the inline [card:<id>] grounding tokens the model emits — the cited
// cards live in the collapsible "sources" block below, so the raw tokens are
// noise in the prose. Only spaces/tabs around a token are absorbed (never
// newlines), then runs of spaces are collapsed.
//
// Built from the shared core pattern (`CARD_TOKEN_CORE_RE` from @neuronexus/shared)
// so the server's citation-dedup and this client stay in lockstep on the token
// shape; the leading `[ \t]*` whitespace-absorber stays local to the renderer.
const CARD_TOKEN_RE = new RegExp(`[ \\t]*${CARD_TOKEN_CORE_RE.source}`, 'g');
// Source-citation token strip (M2) — same whitespace-absorbing variant as the
// card token, so `[src:<sourceChunkId>]` markers vanish from rendered prose.
const SRC_TOKEN_RE = new RegExp(`[ \\t]*${SRC_TOKEN_CORE_RE.source}`, 'g');
function stripCardTokens(text: string): string {
  return text
    .replace(CARD_TOKEN_RE, '')
    .replace(SRC_TOKEN_RE, '')
    .replace(/[ \t]{2,}/g, ' ');
}
// Notebook citation variant — keeps the `[src:<id>]` tokens in the prose so the
// inline-citation DOM decoration (`useInlineCitations`) can turn them into
// numbered chips. Only the card tokens (never numbered in notebook mode) are
// stripped. Used when `citeNumbers` is passed to AssistantMarkdown.
function stripCardTokensKeepSrc(text: string): string {
  return text.replace(CARD_TOKEN_RE, '').replace(/[ \t]{2,}/g, ' ');
}

// Validate a web-search result URL before rendering it as an <a href>. Mirrors
// the sanitizer's uponSanitizeAttribute scheme discipline (https?: / mailto:),
// but for web_search we only ever surface http(s) links. Anything else (a
// `javascript:` payload, a relative ref, garbage) is rejected → rendered as
// inert plain text, never a clickable link.
function safeWebUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

// Reconstruction note: the persisted-row → view-model reconstruction
// (`reconstructMessages`, `parseToolArgs`, `parseToolResultContent`,
// `WRITE_SRS_TOOL_NAMES`) and the answerless-tail detector (`hasAnswerlessUserTail`)
// now live in `@/lib/chat-activity` (re-imported above), so they can be unit-tested
// without a React import.

// Render assistant prose as Markdown through the SAME pipeline cards use
// (markdown-it → DOMPurify via SafeHtml) so lists/bold/headings/code render —
// the sanitizer stays the single security boundary and is never edited here. A
// synthetic single-field "basic" note-type with a `{{Body}}` template feeds the
// model text through `renderCardHtml`; `SafeHtml` is the one allowed inject sink.
const CHAT_MD_NOTE_TYPE = {
  kind: 'basic' as const,
  templates: [{ name: 'chat', ord: 0, frontTemplate: '{{Body}}', backTemplate: '{{Body}}' }],
};

const AssistantMarkdown = ({
  content,
  final,
  citeNumbers,
  citationOf,
  onCite,
  t,
}: {
  content: string;
  /** Code-copy buttons decorate only FINAL renders (no churn while streaming). */
  final: boolean;
  /** Notebook mode: chunkId → number for inline numbered citations. When passed,
   *  the `[src:]` tokens are KEPT in the prose and decorated into chips. */
  citeNumbers?: Map<string, number>;
  citationOf?: (chunkId: string) => SourceCitation | undefined;
  onCite?: (c: SourceCitation) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) => {
  const citeMode = !!citeNumbers && (citeNumbers.size ?? 0) > 0;
  const html = useMemo(
    () =>
      renderCardHtml(
        CHAT_MD_NOTE_TYPE,
        { Body: citeMode ? stripCardTokensKeepSrc(content) : stripCardTokens(content) },
        'front',
      ),
    [content, citeMode],
  );
  const hostRef = useRef<HTMLDivElement>(null);
  const copyLabels = useMemo(
    () => ({ copy: t('chat.message.codeCopy'), copied: t('chat.message.codeCopied') }),
    [t],
  );
  // B3 — post-render DOM decoration of `pre` blocks; the sanitizer never sees
  // the button. Scoped to THIS host only (cited RichCards are unaffected).
  useCodeCopyButtons(hostRef, { html, final }, copyLabels);
  // A2 — inline numbered citation chips (notebook mode only). Same post-render
  // decoration discipline; gated off entirely in card mode (`enabled`).
  const noCite = useMemo(() => new Map<string, number>(), []);
  const noopCitation = useCallback(() => undefined, []);
  const noopCite = useCallback(() => {}, []);
  useInlineCitations(
    hostRef,
    { html, final, enabled: citeMode && !!onCite },
    citeNumbers ?? noCite,
    citationOf ?? noopCitation,
    onCite ?? noopCite,
  );
  return (
    <div ref={hostRef}>
      <SafeHtml
        html={html}
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 14.5,
          lineHeight: 1.6,
          color: 'var(--text)',
          wordBreak: 'break-word',
        }}
      />
    </div>
  );
};

// ── Component ──────────────────────────────────────────────────────────────────

// localStorage key for the last-used model selection (re-validated on load).
const MODEL_LS_KEY = 'nn:chat:model';
// localStorage key for the deep-research mode toggle (sticky across sessions).
const RESEARCH_LS_KEY = 'nn:chat:research';

/** Imperative composer control exposed to a parent (M5 reader → «Спросить»). */
export interface ComposerPrefillHandle {
  /** Append text to the composer draft and focus it (no auto-send). */
  prefill: (text: string) => void;
}

export interface ChatPanelProps {
  /** 'global' = the /chat screen (rail + extras); 'notebook' = workspace panel. */
  mode?: 'global' | 'notebook';
  /** Notebook id this panel's threads are bound to (notebook mode only). */
  notebookId?: string;
  /** Per-turn source scope from the workspace checkboxes (notebook mode only).
   *  Undefined ⇒ the server defaults to all ready sources of the notebook. */
  sourceIds?: string[];
  /** Controlled active thread id (notebook mode — the workspace owns the switcher). */
  activeThreadId?: string | null;
  /** Notify the workspace when the open thread changes (notebook mode). */
  onThreadChange?: (id: string | null) => void;
  /** A source citation chip was clicked — workspace scrolls the reader to it. */
  onSourceCitation?: (c: SourceCitation) => void;
  /** Parent-owned ref the panel populates with an imperative `prefill(text)`
   *  (M5 reader «Спросить»). Additive — the global chat never passes it. */
  composerPrefillRef?: React.MutableRefObject<ComposerPrefillHandle | null>;
  /** «В заметки» (Р7) — save a finished assistant answer into the notebook's
   *  notes. ADDITIVE; the button renders ONLY when this prop is passed (notebook
   *  mode). The global /chat never passes it, so nothing changes there. */
  onSaveAnswer?: (payload: {
    content: string;
    citations: unknown[];
    messageId?: string;
  }) => void;
  /** Suggested-question pills for the empty state of a NEW notebook thread (N2,
   *  Р6). ADDITIVE — rendered ONLY in notebook mode (the global /chat builds its
   *  own deck/due suggestions). A click sends the question directly. */
  suggestedQuestions?: string[];
  /** Regenerate the notebook's suggested questions (A2 «Обновить подсказки»).
   *  ADDITIVE — the «Обновить подсказки» ghost button renders in the notebook
   *  empty state ONLY when this prop is passed. The workspace wires it to its
   *  overview regenerate; not passed ⇒ the button is hidden. */
  onRefreshSuggestions?: () => Promise<void> | void;
}

export const ChatPanel = ({
  mode = 'global',
  notebookId,
  sourceIds,
  activeThreadId,
  onThreadChange,
  onSourceCitation,
  composerPrefillRef,
  onSaveAnswer,
  suggestedQuestions,
  onRefreshSuggestions,
}: ChatPanelProps = {}) => {
  const t = useT();
  const { locale } = useLocale();
  const router = useAppNavigation();
  const searchParams = useSearchParams();
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';
  const { confirm } = useDialog();
  const isNotebook = mode === 'notebook';
  // Keep a live ref of the workspace source scope so the stream/resume/regenerate
  // callbacks read the CURRENT checkbox state without re-creating on every change.
  const sourceIdsRef = useRef<string[] | undefined>(sourceIds);
  useEffect(() => {
    sourceIdsRef.current = sourceIds;
  }, [sourceIds]);
  // Notify the workspace switcher of thread changes (notebook mode only).
  const onThreadChangeRef = useRef(onThreadChange);
  useEffect(() => {
    onThreadChangeRef.current = onThreadChange;
  }, [onThreadChange]);

  // Store mirror (read-only here): cards for citation resolution, decks for names.
  const cards = useNN((s) => s.cards);
  const decks = useNN((s) => s.decks);
  // Post-write store sync (S10): after an APPLIED chat write/SRS tool resolves,
  // refetch the affected card/deck so the rest of the app mirrors the change.
  const refetchCard = useNN((s) => s.refetchCard);
  const refetchDeckCards = useNN((s) => s.refetchDeckCards);

  const [status, setStatus] = useState<AiStatus | null>(null);
  const [statusLoaded, setStatusLoaded] = useState(false);

  const [conversations, setConversations] = useState<ConversationVM[]>([]);
  const [conversationsLoaded, setConversationsLoaded] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageVM[]>([]);
  const [threadResource, setThreadResource] = useState<ResourceState<MessageVM[]>>({
    data: [],
    status: 'ready',
    error: null,
  });
  // An Eden request cannot be cancelled after it starts. This sequence is the
  // local commit guard: a late A response can still finish after a rapid A→B,
  // but only B is allowed to update the visible transcript/status.
  const threadRequestRef = useRef(0);
  // On mobile the two panes are mutually exclusive. `composing` means the stream
  // pane is showing (either an open thread or a fresh, not-yet-created chat). On
  // desktop both panes are always visible, so this only gates the mobile layout.
  const [composing, setComposing] = useState(!isMobile);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  // Coarse loop-phase of the in-flight turn (drives the live status line under
  // the thinking placeholder). Null when no turn is streaming.
  const [streamPhase, setStreamPhase] = useState<
    'thinking' | 'calling_tool' | 'answering' | null
  >(null);

  // Per-turn reasoning-level (model) selection (AC2.4). Null = use the server
  // default; re-validated against `status.models` on status load. Persisted to
  // `localStorage` as last-used (pattern: cards-browser `nn:cards:dockHeight`).
  const [model, setModel] = useState<string | null>(null);
  // Optional per-turn deck scope (AC3.7). Null = all cards (no scope).
  const [deckScope, setDeckScope] = useState<string | null>(null);
  // Deep-research MODE toggle: rides every turn (send/resume/regenerate) as
  // `research: true` → research prompt + raised step/budget caps server-side.
  // Sticky across sessions (localStorage); only shown/restored when the server
  // offers fetch_page (status.fetchPageEnabled).
  const [research, setResearch] = useState(false);
  // «Обновить подсказки» (A2) in-flight flag — disables the ghost button + swaps
  // the sync glyph for a spinner while the workspace regenerates the overview.
  const [refreshingSuggestions, setRefreshingSuggestions] = useState(false);

  // Composer @-mention chips (D1): cards explicitly attached to the next send.
  const [mentionChips, setMentionChips] = useState<{ cardId: string; label: string }[]>([]);
  const mentionChipsRef = useRef<{ cardId: string; label: string }[]>([]);
  useEffect(() => {
    mentionChipsRef.current = mentionChips;
  }, [mentionChips]);

  // Composer file attachments: images upload through the SAME media pipeline as
  // card images (presign→POST→finalize via store.uploadMedia); text files are
  // read client-side and ride the body inline. Max 4; chips ride the NEXT send.
  const uploadMedia = useNN((s) => s.uploadMedia);
  const [attachChips, setAttachChips] = useState<AttachmentChipVM[]>([]);
  const attachChipsRef = useRef<AttachmentChipVM[]>([]);
  useEffect(() => {
    attachChipsRef.current = attachChips;
  }, [attachChips]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addAttachmentFiles = useCallback(
    async (files: Iterable<File>) => {
      for (const file of files) {
        if (attachChipsRef.current.length >= ATTACH_MAX) {
          raiseToast({ kind: 'info', titleKey: 'chat.composer.attachLimit' });
          return;
        }
        const isImage = (MEDIA_MIME_ALLOWLIST as readonly string[]).includes(file.type);
        const isText = ATTACH_TEXT_TYPES.test(file.name) || file.type.startsWith('text/');
        if (isImage) {
          if (file.size > MAX_MEDIA_BYTES) {
            raiseToast({ kind: 'info', titleKey: 'chat.composer.attachTooBig' });
            continue;
          }
          const key = `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          setAttachChips((prev) => [
            ...prev,
            { key, kind: 'image', name: file.name, mime: file.type, uploading: true },
          ]);
          try {
            const { token, mediaId } = await uploadMedia(file);
            setAttachChips((prev) =>
              prev.map((c) => (c.key === key ? { ...c, mediaId, token, uploading: false } : c)),
            );
          } catch {
            setAttachChips((prev) => prev.filter((c) => c.key !== key));
            raiseToast({ kind: 'info', titleKey: 'chat.composer.attachFailed' });
          }
        } else if (isText) {
          if (file.size > ATTACH_TEXT_FILE_MAX_BYTES) {
            raiseToast({ kind: 'info', titleKey: 'chat.composer.attachTooBig' });
            continue;
          }
          try {
            const text = (await file.text()).slice(0, ATTACH_TEXT_CHARS);
            if (text.trim().length === 0) continue;
            const key = `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            setAttachChips((prev) => [
              ...prev,
              { key, kind: 'text', name: file.name, text, uploading: false },
            ]);
          } catch {
            raiseToast({ kind: 'info', titleKey: 'chat.composer.attachFailed' });
          }
        } else {
          raiseToast({ kind: 'info', titleKey: 'chat.composer.attachUnsupported' });
        }
      }
    },
    [uploadMedia],
  );
  // Live composer popover trigger (@-mention / slash) + its keyboard cursor.
  const [trigger, setTrigger] = useState<ComposerTrigger | null>(null);
  const [popoverIdx, setPopoverIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Follow-up queue (D4): ONE message queued while a turn streams; auto-sent on
  // completion (but never while a confirmation is pending).
  const [queued, setQueued] = useState<string | null>(null);
  const queuedRef = useRef<string | null>(null);

  // Resolved cards for citations outside the store mirror (cardId → Card).
  const [fetchedCards, setFetchedCards] = useState<Record<string, Card>>({});

  const scrollRef = useRef<HTMLDivElement>(null);
  // Smart stick-to-bottom (B1): follow only while the user is near the bottom;
  // otherwise surface the "jump to latest" pill instead of yanking the scroll.
  const stick = useStickToBottom(scrollRef);
  // AbortController for the in-flight turn (S6 stop). Held in a ref so the Stop
  // button can abort the same controller the active send/resume/regenerate owns.
  const abortRef = useRef<AbortController | null>(null);
  // Latest messages mirror for non-reactive reads (queue flush guard).
  const messagesRef = useRef<MessageVM[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // ── Effects ─────────────────────────────────────────────────────────────────

  // AI status + conversation list, lazy on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = (await ok(await (api as any).ai.status.get())) as AiStatus;
        if (!cancelled) {
          setStatus(s);
          // Re-validate the persisted model against the live allow-list (AC2.4).
          // A stale value (model removed from CHAT_MODELS) silently falls back to
          // the default and is rewritten; an empty allow-list clears it entirely.
          const models = s.models ?? [];
          let stored: string | null = null;
          try {
            stored = localStorage.getItem(MODEL_LS_KEY);
          } catch {
            /* localStorage unavailable (private mode / SSR) — treat as unset. */
          }
          const valid = models.find((m) => m.id === stored);
          const resolved = valid ? stored : (models.find((m) => m.default)?.id ?? null);
          setModel(resolved);
          try {
            if (resolved) localStorage.setItem(MODEL_LS_KEY, resolved);
            else localStorage.removeItem(MODEL_LS_KEY);
          } catch {
            /* best-effort persistence */
          }
          // Restore the deep-research toggle — only meaningful when the server
          // offers fetch_page (a stale "1" with the tool killed stays ignored:
          // the toggle is hidden and `research` is never sent).
          if (s.fetchPageEnabled === true) {
            try {
              setResearch(localStorage.getItem(RESEARCH_LS_KEY) === '1');
            } catch {
              /* best-effort */
            }
          }
        }
      } catch {
        if (!cancelled)
          setStatus({ embeddingEnabled: false, chatEnabled: false, degraded: false, models: [] });
      } finally {
        if (!cancelled) setStatusLoaded(true);
      }
      try {
        // Notebook mode lists ONLY this notebook's threads (?notebookId=); the
        // global rail lists ONLY notebook_id IS NULL threads (server-side filter).
        const res = (await ok(
          await (api as any).chat.conversations.get(
            isNotebook && notebookId ? { query: { notebookId } } : undefined,
          ),
        )) as { items: ConversationVM[] };
        if (!cancelled) setConversations(res.items ?? []);
      } catch {
        if (!cancelled) setConversations([]);
      } finally {
        if (!cancelled) setConversationsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNotebook, notebookId]);

  // Keep the stream pinned to the bottom as tokens / messages arrive — but ONLY
  // while the user is near the bottom (B1). Scrolled away ⇒ the pill lights up.
  useEffect(() => {
    stick.notifyContentChange();
  }, [messages, stick]);

  // ── Deep link `?thread=<id>` (A5) — global mode only ─────────────────────────
  // Open the linked conversation once the list has loaded. The param is KEPT
  // (shareable URLs): switching threads rewrites it; new chat / back clears it.
  // In notebook mode the workspace owns the URL + thread selection (controlled
  // via `activeThreadId`), so this param effect is gated to global mode.
  const threadParam = searchParams.get('thread');
  const consumedThreadParamRef = useRef<string | null>(null);
  useEffect(() => {
    if (isNotebook) return;
    if (!conversationsLoaded || !threadParam) return;
    if (consumedThreadParamRef.current === threadParam) return;
    consumedThreadParamRef.current = threadParam;
    if (threadParam === activeId) return;
    if (conversations.some((c) => c.id === threadParam)) {
      void openThread(threadParam);
    }
    // Unknown id (foreign/deleted) — leave the rail as-is; the URL is harmless.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNotebook, conversationsLoaded, threadParam, conversations, activeId]);

  // ── Controlled active thread (notebook mode) ─────────────────────────────────
  // The workspace drives which thread is open via `activeThreadId`. Open it once
  // the list has loaded; a null switches to a fresh (uncreated) chat.
  useEffect(() => {
    if (!isNotebook || !conversationsLoaded) return;
    if (activeThreadId === undefined) return;
    if (activeThreadId === activeId) return;
    if (activeThreadId === null) {
      threadRequestRef.current += 1;
      setActiveId(null);
      setMessages([]);
      setThreadResource({ data: [], status: 'ready', error: null });
      return;
    }
    if (conversations.some((c) => c.id === activeThreadId)) {
      void openThread(activeThreadId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNotebook, conversationsLoaded, activeThreadId, conversations]);

  // ── Draft persistence (D3) — per-thread composer drafts in localStorage ─────
  // Persistence happens in `updateDraft` (the onChange path), NOT an effect, so
  // a thread switch can restore without racing a stale-draft write.
  const draftStorageKey = useCallback((id: string | null) => `nn:chat:draft:${id ?? 'new'}`, []);
  const updateDraft = useCallback(
    (value: string, threadId: string | null) => {
      setDraft(value);
      try {
        const key = draftStorageKey(threadId);
        if (value.trim().length === 0) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      } catch {
        /* best-effort */
      }
    },
    [draftStorageKey],
  );
  // Restore the (possibly empty) stored draft whenever the thread context flips.
  useEffect(() => {
    try {
      setDraft(localStorage.getItem(draftStorageKey(activeId)) ?? '');
    } catch {
      setDraft('');
    }
    setTrigger(null);
  }, [activeId, draftStorageKey]);

  // ── Card resolution for citations (store mirror → GET /cards/:id) ────────────

  const cardById = useMemo(() => {
    const map = new Map<string, Card>();
    for (const c of cards) map.set(c.id, c);
    return map;
  }, [cards]);

  const deckNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of decks) map.set(d.id, d.name);
    return map;
  }, [decks]);

  // Decks for the optional scope picker, sorted by name for a stable menu.
  const sortedDecks = useMemo(
    () => [...decks].sort((a, b) => a.name.localeCompare(b.name)),
    [decks],
  );

  // The abort/regenerate cliff (M1): a committed user turn with no answer — show
  // the recoverable "stopped — regenerate?" affordance (live + on reload). Never
  // while a turn is actively streaming.
  const answerlessTail = useMemo(
    () => !sending && hasAnswerlessUserTail(messages),
    [sending, messages],
  );

  const resolveCard = useCallback(
    (cardId: string): Card | undefined => cardById.get(cardId) ?? fetchedCards[cardId],
    [cardById, fetchedCards],
  );

  // When citations reference cards outside the mirror, fetch them via Eden.
  // Tool-call citations (search_cards results) are resolved the same way as the
  // turn-level citation set, so a cited card always renders through RichCard.
  useEffect(() => {
    const missing = new Set<string>();
    const consider = (cit: Citation) => {
      // Source citations carry their own snippet — never resolved as a card.
      if (isSourceCitation(cit)) return;
      if (!cardById.has(cit.cardId) && !fetchedCards[cit.cardId]) missing.add(cit.cardId);
    };
    for (const m of messages) {
      for (const cit of m.citations) consider(cit);
      for (const tc of m.toolCalls ?? []) {
        for (const cit of tc.citations ?? []) consider(cit);
      }
    }
    if (missing.size === 0) return;
    let cancelled = false;
    (async () => {
      const resolved: Record<string, Card> = {};
      for (const id of missing) {
        try {
          const row = await ok(await (api as any).cards({ id }).get());
          resolved[id] = cardFromApi(row);
        } catch {
          // Foreign / deleted card — skip; the citation falls back to its snippet.
        }
      }
      if (!cancelled && Object.keys(resolved).length > 0) {
        setFetchedCards((prev) => ({ ...prev, ...resolved }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [messages, cardById, fetchedCards]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  const openThread = useCallback(
    async (id: string) => {
      const requestVersion = ++threadRequestRef.current;
      const cacheKey = `chat:thread:${id}`;
      const scope = `chat:thread-pane:${isNotebook ? notebookId ?? 'notebook' : 'global'}`;
      const cached = peekSessionResource<MessageVM[]>(cacheKey);

      setActiveId(id);
      setComposing(true);
      if (cached) {
        setMessages(cached);
        setThreadResource({ data: cached, status: 'refreshing', error: null });
      } else {
        // Keep the previous transcript in memory until the requested thread is
        // ready, but do not present it under the newly selected thread id.
        setThreadResource({ data: null, status: 'loading', error: null });
      }
      // Shareable URL (A5): keep ?thread= in sync with the open conversation.
      // Notebook mode: the workspace owns the URL — notify it instead.
      if (isNotebook) onThreadChangeRef.current?.(id);
      else router.replace(`/chat?thread=${id}`, { scroll: false, track: false });

      const result = await fetchSessionResource({
        key: cacheKey,
        scope,
        fetcher: async () => {
          const res = (await ok(await (api as any).chat.conversations({ id }).get())) as {
            messages: PersistedMessageRow[];
          };
          // Reconstruct the agentic transcript from the persisted wire shape:
          // tool-call rows become cards, role:'tool' rows fold into their parent,
          // and JSON-in-content tool rows never leak as blank/garbled bubbles.
          return reconstructMessages(res.messages ?? []);
        },
      });

      if (threadRequestRef.current !== requestVersion || !result.current) return;
      if (result.ok) {
        setMessages(result.data);
        setThreadResource({ data: result.data, status: 'ready', error: null });
      } else {
        setThreadResource((previous) => ({
          ...previous,
          status: 'error',
          error: result.error,
        }));
      }
    },
    [router, isNotebook, notebookId],
  );

  // Start a fresh chat: clear the active thread and (on mobile) reveal the
  // stream pane with an empty state + composer.
  const newThread = useCallback(() => {
    threadRequestRef.current += 1;
    setActiveId(null);
    setMessages([]);
    setThreadResource({ data: [], status: 'ready', error: null });
    setComposing(true);
    if (isNotebook) onThreadChangeRef.current?.(null);
    else router.replace('/chat', { scroll: false, track: false });
  }, [router, isNotebook]);

  // Mobile-only: leave the stream pane and return to the thread list.
  const backToList = useCallback(() => {
    threadRequestRef.current += 1;
    setActiveId(null);
    setMessages([]);
    setThreadResource({ data: [], status: 'ready', error: null });
    setComposing(false);
    if (isNotebook) onThreadChangeRef.current?.(null);
    else router.replace('/chat', { scroll: false, track: false });
  }, [router, isNotebook]);

  // Pin / unpin a thread (C4): optimistic flip, reverted on a failed PATCH.
  const togglePin = useCallback(async (id: string, pinned: boolean) => {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, pinned } : c)));
    try {
      await ok(await (api as any).chat.conversations({ id }).patch({ pinned }));
    } catch {
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, pinned: !pinned } : c)));
    }
  }, []);

  const deleteThread = useCallback(
    async (id: string) => {
      const okToDelete = await confirm({
        title: t('chat.threads.delete'),
        message: t('chat.threads.deleteConfirm'),
        confirmLabel: t('actions.delete'),
        danger: true,
      });
      if (!okToDelete) return;
      try {
        await ok(await (api as any).chat.conversations({ id }).delete());
      } catch {
        // best-effort; still drop from the local list
      }
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) {
        threadRequestRef.current += 1;
        setActiveId(null);
        setMessages([]);
        setThreadResource({ data: [], status: 'ready', error: null });
        setComposing(!isMobile);
      }
    },
    [activeId, confirm, isMobile, t],
  );

  // Persist the chosen model as last-used (AC2.4). Best-effort localStorage.
  const selectModel = useCallback((id: string) => {
    setModel(id);
    try {
      localStorage.setItem(MODEL_LS_KEY, id);
    } catch {
      /* best-effort */
    }
  }, []);

  // Deep-research mode toggle — sticky, best-effort localStorage.
  const toggleResearch = useCallback(() => {
    setResearch((prev) => {
      const next = !prev;
      try {
        if (next) localStorage.setItem(RESEARCH_LS_KEY, '1');
        else localStorage.removeItem(RESEARCH_LS_KEY);
      } catch {
        /* best-effort */
      }
      return next;
    });
  }, []);

  // Inline rename (AC3.1): PATCH the conversation title via Eden, update the
  // local list optimistically. An empty title is ignored (server would 400 it).
  // The inline-edit state lives in ThreadRail; this is the commit handler.
  const renameThread = useCallback(async (id: string, title: string) => {
    const trimmed = title.trim();
    if (trimmed.length === 0) return;
    const next = trimmed.slice(0, 200);
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title: next } : c)));
    try {
      await ok(await (api as any).chat.conversations({ id }).patch({ title: next }));
    } catch {
      // best-effort; the optimistic title stays (server may have 404'd a foreign
      // id, but a foreign id never reaches here from the user's own list).
    }
  }, []);

  // Resolve an applied write/SRS tool by id (off the latest messages state) and
  // refetch the affected card/deck via the store mirror so the rest of the app
  // reflects the mutation. create_card → refetch the deck's cards; edit_card /
  // SRS → refetch the affected card. Best-effort; the store methods no-op on error.
  const syncStoreAfterToolResult = useCallback(
    (toolCallId: string) => {
      setMessages((prev) => {
        for (const m of prev) {
          const tc = m.toolCalls?.find((c) => c.id === toolCallId);
          if (!tc) continue;
          const args = (tc.args && typeof tc.args === 'object' ? tc.args : {}) as Record<
            string,
            unknown
          >;
          const deckId = typeof args.deckId === 'string' ? args.deckId : undefined;
          const cardId = typeof args.cardId === 'string' ? args.cardId : undefined;
          if (tc.name === 'create_card' && deckId) {
            void refetchDeckCards(deckId);
          } else if (cardId) {
            // edit_card / suspend / set_due / forget all carry the target cardId.
            void refetchCard(cardId);
          } else if (deckId) {
            void refetchDeckCards(deckId);
          }
          break;
        }
        return prev; // read-only pass — no state change.
      });
    },
    [refetchCard, refetchDeckCards],
  );

  // Build the streaming handler set for one assistant message. Shared verbatim
  // by the initial `send()` turn and the Phase-B `resumeChat` continuation, so a
  // resumed turn renders reasoning/token/tool_result/citation into the SAME
  // assistant bubble. `assistantMsgId` pins the target message; `convId` is used
  // for the post-write store sync + thread bump on done.
  const buildStreamHandlers = useCallback(
    (assistantMsgId: string, convId: string): ChatStreamHandlers => {
      const patchAssistant = (patch: Partial<MessageVM>) =>
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMsgId ? { ...m, ...patch } : m)),
        );

      // Mutate the live assistant message's toolCalls array immutably.
      const patchToolCalls = (mut: (calls: ToolCallVM[]) => ToolCallVM[]) =>
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId ? { ...m, toolCalls: mut(m.toolCalls ?? []) } : m,
          ),
        );

      // Finalize the turn timer (T-accumulate): compute `elapsedMs` ONCE off the
      // host's ORIGINAL `turnStartedAt`, called only at onDone/onError — never in
      // confirmToolCall/onAwaitConfirmation. So "Worked for Ns" = the full turn
      // INCLUDING any confirm pause, never overwritten by the resume stream.
      const finalizeTurn = (patch: Partial<MessageVM>) =>
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  ...patch,
                  elapsedMs:
                    m.turnStartedAt != null ? Date.now() - m.turnStartedAt : m.elapsedMs,
                }
              : m,
          ),
        );

      return {
        onToken: (delta) =>
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId ? { ...m, content: m.content + delta } : m,
            ),
          ),
        // Stream the reasoning trace into the collapsible "thinking" block.
        onReasoning: (delta) =>
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId ? { ...m, reasoning: (m.reasoning ?? '') + delta } : m,
            ),
          ),
        // A tool call started — append a running card (idempotent on id). Stamp
        // `startedAt` so per-tool `durationMs` can be computed on result (kept
        // honest but NOT rendered — Assumption 3). A write tool's stream-1
        // `startedAt` survives into the stream-2 result via the `some(id)` guard.
        onToolCall: (tc) =>
          patchToolCalls((calls) =>
            calls.some((c) => c.id === tc.id)
              ? calls
              : [
                  ...calls,
                  { id: tc.id, name: tc.name, args: tc.args, status: 'running', startedAt: Date.now() },
                ],
          ),
        // A tool finished — flip status, attach the one-line summary + citations.
        // On a confirmed write/SRS resume, the answering `tool_result` also clears
        // the awaiting/decision flags AND (when ok) triggers the post-write store
        // sync so the rest of the app mirrors the mutation. An APPLIED create/edit
        // also derives an ephemeral post-apply summary line (S5 / AC5.1).
        onToolResult: (tr) => {
          patchToolCalls((calls) =>
            calls.map((c) =>
              c.id === tr.id
                ? {
                    ...c,
                    status: tr.ok ? 'ok' : 'error',
                    result: tr.summary ?? c.result,
                    citations: tr.citations ?? c.citations,
                    awaitingConfirmation: false,
                    durationMs: c.startedAt != null ? Date.now() - c.startedAt : c.durationMs,
                    applySummary:
                      tr.ok && (c.name === 'create_card' || c.name === 'edit_card')
                        ? (applySummaryFrom(c.name, c.args) ?? c.applySummary)
                        : c.applySummary,
                  }
                : c,
            ),
          );
          // Web-store sync after an APPLIED write resolves ok. Resolve the call
          // by id off the latest state so we know its name+args (the resume that
          // produced this result may have started after `send()` returned).
          if (tr.ok) void syncStoreAfterToolResult(tr.id);
        },
        // Coarse phase hint — drives the live status line under the placeholder.
        onStatus: (phase) => setStreamPhase(phase),
        // Turn-level citation set (union-deduped server-side, intersected with
        // emitted [card:<id>] tokens) — the collapsible "sources" block below.
        onCitation: (citations) => patchAssistant({ citations }),
        // Phase B: a write/SRS tool paused the turn. Mark the matching tool-call
        // card as awaiting confirmation + attach its dry-run blast radius. The
        // stream then closes with NO `done`, so we also drop the streaming/phase
        // state — the turn is suspended until the user clicks Apply/Reject.
        onAwaitConfirmation: ({ toolCall, impact }) => {
          patchToolCalls((calls) =>
            calls.some((c) => c.id === toolCall.id)
              ? calls.map((c) =>
                  c.id === toolCall.id ? { ...c, awaitingConfirmation: true, impact } : c,
                )
              : [
                  ...calls,
                  {
                    id: toolCall.id,
                    name: toolCall.name,
                    args: toolCall.args,
                    status: 'running',
                    awaitingConfirmation: true,
                    impact,
                  },
                ],
          );
          patchAssistant({ streaming: false });
          setStreamPhase(null);
        },
        // C3 — the server auto-titled this (previously untitled) thread. The
        // PATCH-on-rename path wins server-side (`title IS NULL` guard); locally
        // we just reflect the frame.
        onTitle: (title) =>
          setConversations((prev) =>
            prev.map((c) => (c.id === convId ? { ...c, title } : c)),
          ),
        // C1 — accumulated token usage for the finished turn (badge under it).
        onUsage: (usage) =>
          patchAssistant({
            usage: {
              promptTokens: usage.promptTokens,
              completionTokens: usage.completionTokens,
              totalTokens: usage.totalTokens ?? usage.promptTokens + usage.completionTokens,
            },
          }),
        onDone: () => {
          // Finalize the turn timer off the ORIGINAL turnStartedAt (T-accumulate).
          finalizeTurn({ streaming: false });
          setStreamPhase(null);
          // Refresh recency (the rail derives ordering/groups from updatedAt).
          setConversations((prev) =>
            prev.map((c) =>
              c.id === convId ? { ...c, updatedAt: new Date().toISOString() } : c,
            ),
          );
        },
        onError: (message) => {
          // A second turn raced a live one — the server refused pre-flush, so
          // NOTHING was persisted. Drop the optimistic rows, put the text back
          // in the composer, and explain via toast instead of an error bubble.
          if (message === 'turn_in_progress') {
            const all = messagesRef.current;
            const idx = all.findIndex((m) => m.id === assistantMsgId);
            const prevRow = idx > 0 ? all[idx - 1] : undefined;
            const restored =
              prevRow && prevRow.role === 'user' && prevRow.id.startsWith('local-user-')
                ? prevRow.content
                : '';
            setMessages((prev) =>
              prev.filter((m) => m.id !== assistantMsgId && (restored ? m.id !== prevRow!.id : true)),
            );
            if (restored) setDraft(restored);
            raiseToast({ kind: 'info', titleKey: 'chat.errors.turnInProgress' });
            setStreamPhase(null);
            return;
          }
          finalizeTurn({
            streaming: false,
            content:
              message === 'ai_disabled'
                ? t('chat.errors.disabled')
                : t('chat.errors.generic'),
          });
          setStreamPhase(null);
        },
      };
    },
    // `t` is stable per-locale; `syncStoreAfterToolResult` is a stable callback.
    // setMessages/setStreamPhase/setConversations are stable store/state setters.
    [t, syncStoreAfterToolResult],
  );

  // Flush the queued follow-up (D4) once the current turn fully settles — but
  // never while a confirmation is still pending (the queued message waits for
  // Apply/Reject + the resumed turn). `sendContentRef` breaks the circular dep
  // (sendContent is declared further down and registered into the ref).
  const sendContentRef = useRef<((content: string) => Promise<void>) | null>(null);
  const maybeFlushQueue = useCallback(() => {
    const q = queuedRef.current;
    if (!q) return;
    if (hasPendingConfirmation(messagesRef.current)) return;
    queuedRef.current = null;
    setQueued(null);
    void sendContentRef.current?.(q);
  }, []);

  // Answer a paused write/SRS tool call (Phase B / S10). Apply runs the mutation
  // server-side then continues the loop; Reject records a "rejected" result so
  // the model answers without mutating. The SAME stream handlers are re-attached
  // (via buildStreamHandlers) so the continued turn renders into the same bubble.
  const confirmToolCall = useCallback(
    async (
      assistantMsgId: string,
      toolCallId: string,
      decision: 'apply' | 'reject',
      payload?: ConfirmPayload,
    ) => {
      const convId = activeId;
      if (!convId) return;
      // Mark the decision IMMEDIATELY so both buttons disable — a double-apply
      // can't be issued from the UI (the server also has an atomic backstop).
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                streaming: true,
                toolCalls: (m.toolCalls ?? []).map((c) =>
                  c.id === toolCallId ? { ...c, decision } : c,
                ),
              }
            : m,
        ),
      );
      // Flip the send/stop toggle BEFORE the await so the composer shows "Stop"
      // and the user can abort the in-flight resume stream (AC3.3).
      setSending(true);
      const controller = new AbortController();
      abortRef.current = controller;
      await resumeChat(
        convId,
        {
          resumeToolCallId: toolCallId,
          decision,
          model: model ?? undefined,
          research: isNotebook ? undefined : research || undefined,
          // Per-card confirm decisions + the optional note to the agent.
          cardSelections: payload?.cardSelections,
          feedback: payload?.feedback,
          // Keep the continuation on the same source scope (notebook mode).
          sourceIds: isNotebook ? sourceIdsRef.current : undefined,
        },
        buildStreamHandlers(assistantMsgId, convId),
        controller.signal,
      );
      setSending(false);
      // A queued follow-up held back by the confirmation flushes once the
      // resumed turn settles (D4).
      maybeFlushQueue();
    },
    [activeId, buildStreamHandlers, model, research, maybeFlushQueue, isNotebook],
  );

  // Send an explicit content string. `send()` (textarea/Enter) trims the draft;
  // suggested-prompt pills call this DIRECTLY — `setDraft(text); send()` would
  // read the STALE draft from the closure (state updates are async).
  const sendContent = useCallback(async (content: string) => {
    // Attachment-only sends are valid (e.g. "here's a screenshot" with no text).
    const hasAttachments = attachChipsRef.current.some((a) => !a.uploading);
    if (!content && !hasAttachments) return;
    // Do not append a turn to a transcript that has never loaded. Cached data
    // remains actionable during SWR; starting a turn then invalidates the
    // background GET so it cannot replace the optimistic stream.
    if (activeId && threadResource.data === null) return;
    if (activeId && threadResource.status !== 'ready') {
      threadRequestRef.current += 1;
      setThreadResource({ data: messagesRef.current, status: 'ready', error: null });
    }
    // Mid-stream send → queue ONE follow-up (a second send replaces it) (D4).
    if (sending) {
      queuedRef.current = content;
      setQueued(content);
      updateDraft('', activeId);
      return;
    }
    setSending(true);
    setDraft('');
    // The send consumes the draft — clear its stored copies (both the thread key
    // and the 'new' key when this send is about to create the conversation).
    try {
      localStorage.removeItem(draftStorageKey(activeId));
      localStorage.removeItem(draftStorageKey(null));
    } catch {
      /* best-effort */
    }
    // Consume the mention chips (C7) — they ride this turn only.
    const chips = mentionChipsRef.current;
    const mentionedCardIds = chips.map((c) => c.cardId);
    setMentionChips([]);
    // Consume the attachment chips (uploaded images + inline text files).
    const atts = attachChipsRef.current.filter((a) => !a.uploading);
    const attachmentInputs: MessageAttachmentInput[] = atts.map((a) =>
      a.kind === 'image'
        ? { kind: 'image' as const, mediaId: a.mediaId!, name: a.name }
        : { kind: 'text' as const, name: a.name, text: a.text! },
    );
    setAttachChips([]);

    // Ensure a conversation exists (create on first message of a new thread).
    // Created WITHOUT a title so the server auto-titles it after the first turn
    // (C3); locally the first-message slice is the placeholder until the
    // `title` frame arrives.
    let convId = activeId;
    if (!convId) {
      try {
        // Notebook mode binds the new thread to its notebook (server validates
        // ownership); global mode creates an unbound (notebook_id NULL) thread.
        const created = (await ok(
          await (api as any).chat.conversations.post(
            isNotebook && notebookId ? { notebookId } : {},
          ),
        )) as ConversationVM;
        convId = created.id;
        setActiveId(created.id);
        setConversations((prev) => [{ ...created, title: content.slice(0, 80) }, ...prev]);
        if (isNotebook) onThreadChangeRef.current?.(created.id);
        else router.replace(`/chat?thread=${created.id}`, { scroll: false, track: false });
      } catch {
        setSending(false);
        setDraft(content);
        setMentionChips(chips);
        return;
      }
    }

    // Optimistically append the user turn + a streaming assistant placeholder.
    // Stamp `turnStartedAt` ONCE here (T-accumulate, Change 1) — `elapsedMs` is
    // computed off it at onDone/onError only, so "Worked for Ns" = the full
    // perceived turn incl. any confirm pause.
    const userMsgId = `local-user-${Date.now()}`;
    const assistantMsgId = `local-assistant-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        role: 'user',
        content,
        citations: [],
        createdAt: new Date().toISOString(),
        mentions:
          chips.length > 0 ? chips.map((c) => ({ cardId: c.cardId, front: c.label })) : undefined,
        attachments:
          atts.length > 0
            ? atts.map((a) =>
                a.kind === 'image'
                  ? {
                      kind: 'image' as const,
                      mediaId: a.mediaId!,
                      token: a.token!,
                      mime: a.mime ?? 'image/png',
                      name: a.name,
                    }
                  : { kind: 'text' as const, name: a.name, text: a.text! },
              )
            : undefined,
      },
      {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        citations: [],
        streaming: true,
        turnStartedAt: Date.now(),
        createdAt: new Date().toISOString(),
        model: model ?? undefined,
      },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;
    await streamChat(convId!, content, buildStreamHandlers(assistantMsgId, convId!), {
      model: model ?? undefined,
      // Notebook mode: no deck-scope / research toggle (hidden); the per-turn
      // SOURCE scope rides instead.
      deckId: isNotebook ? undefined : (deckScope ?? undefined),
      research: isNotebook ? undefined : research || undefined,
      mentionedCardIds: mentionedCardIds.length > 0 ? mentionedCardIds : undefined,
      attachments: attachmentInputs.length > 0 ? attachmentInputs : undefined,
      sourceIds: isNotebook ? sourceIdsRef.current : undefined,
      signal: controller.signal,
    });

    setSending(false);
    maybeFlushQueue();
  }, [activeId, sending, buildStreamHandlers, model, deckScope, research, router, draftStorageKey, updateDraft, maybeFlushQueue, isNotebook, notebookId, threadResource.data, threadResource.status]);
  useEffect(() => {
    sendContentRef.current = sendContent;
  }, [sendContent]);

  const send = useCallback(() => sendContent(draft.trim()), [sendContent, draft]);

  // M5 — expose an imperative `prefill(text)` so the notebook reader's «Спросить»
  // action can seed the composer (e.g. a `> quote…` block) + focus it. Additive:
  // populated only when the parent passes `composerPrefillRef`; the global chat
  // never does, so its behavior is untouched. Reads the live draft via a ref so
  // the registered handle stays stable.
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  const activeIdRef = useRef(activeId);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);
  useEffect(() => {
    if (!composerPrefillRef) return;
    const ref = composerPrefillRef;
    ref.current = {
      prefill: (text: string) => {
        const cur = draftRef.current;
        const next = cur.trim().length > 0 ? `${cur.replace(/\s+$/, '')}\n\n${text}` : text;
        updateDraft(next, activeIdRef.current);
        requestAnimationFrame(() => {
          const el = textareaRef.current;
          el?.focus();
          el?.setSelectionRange(next.length, next.length);
        });
      },
    };
    return () => {
      if (ref.current) ref.current = null;
    };
  }, [composerPrefillRef, updateDraft]);

  // The user's biggest deck (by mirrored card count) — used by the suggested
  // prompts AND the slash-command templates (D2).
  const biggestDeck = useMemo(() => {
    if (cards.length === 0) return undefined;
    const countByDeck = new Map<string, number>();
    for (const c of cards) countByDeck.set(c.deckId, (countByDeck.get(c.deckId) ?? 0) + 1);
    return decks
      .filter((d) => (countByDeck.get(d.id) ?? 0) > 0)
      .sort((a, b) => countByDeck.get(b.id)! - countByDeck.get(a.id)!)[0];
  }, [cards, decks]);

  // Suggested prompts for the empty state of a NEW conversation — built purely
  // from the store mirror (deck names / due counts), zero extra fetches. Hidden
  // when the user has no cards (nothing to ask about).
  const suggestions = useMemo(() => {
    if (cards.length === 0) return [];
    const out: string[] = [];
    const dueCount = getDueCards(cards).length;
    if (dueCount > 0) out.push(t('chat.suggested.dueToday'));
    if (biggestDeck) out.push(t('chat.suggested.deckProgress', { name: biggestDeck.name }));
    out.push(t('chat.suggested.failing'));
    if (biggestDeck) out.push(t('chat.suggested.quiz', { name: biggestDeck.name }));
    return out.slice(0, 4);
  }, [cards, biggestDeck, t]);

  // ── Composer popovers: @-mention + slash (D1/D2) ─────────────────────────────

  // Re-derive the live trigger from the textarea's value + caret. Called from
  // onChange / onClick / onKeyUp so caret moves keep the popover honest.
  const refreshTrigger = useCallback((value: string) => {
    const caret = textareaRef.current?.selectionStart ?? value.length;
    const next = detectComposerTrigger(value, caret);
    setTrigger((prev) => {
      const changed =
        (prev === null) !== (next === null) ||
        prev?.kind !== next?.kind ||
        prev?.query !== next?.query ||
        prev?.start !== next?.start;
      if (changed) setPopoverIdx(0);
      return next;
    });
  }, []);

  const mentionResults = useMemo(() => {
    if (trigger?.kind !== 'mention') return null;
    return searchMentions(
      sortedDecks.map((d) => ({ id: d.id, name: d.name })),
      cards.map((c) => ({
        id: c.id,
        front: (c.renderFrontText || '').replace(/\s+/g, ' ').trim() || '…',
        deckId: c.deckId,
      })),
      trigger.query,
    );
  }, [trigger, sortedDecks, cards]);

  const slashCommands = useMemo(
    () =>
      trigger?.kind === 'slash'
        ? // Notebook mode hides the /research command (no deep-research there).
          filterSlashCommands(trigger.query).filter((c) => !isNotebook || c !== 'research')
        : [],
    [trigger, isNotebook],
  );

  const popoverCount =
    trigger?.kind === 'mention' && mentionResults
      ? mentionResults.decks.length + mentionResults.cards.length
      : trigger?.kind === 'slash'
        ? slashCommands.length
        : 0;

  // Pick the active mention option: a DECK sets the existing per-turn scope; a
  // CARD becomes a removable chip riding `mentionedCardIds` on the next send.
  const pickMention = useCallback(
    (index: number) => {
      if (!mentionResults || trigger?.kind !== 'mention') return;
      const { picks } = mentionItems(mentionResults, t);
      const pick = picks[index];
      if (!pick) return;
      const caret = textareaRef.current?.selectionStart ?? draft.length;
      const r = applyTrigger(draft, trigger, caret, '');
      updateDraft(r.value, activeId);
      if (pick.kind === 'deck') {
        setDeckScope(pick.id);
      } else {
        setMentionChips((prev) =>
          prev.some((c) => c.cardId === pick.id) || prev.length >= 5
            ? prev
            : [...prev, { cardId: pick.id, label: pick.label }],
        );
      }
      setTrigger(null);
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        el?.focus();
        el?.setSelectionRange(r.caret, r.caret);
      });
    },
    [mentionResults, trigger, draft, activeId, updateDraft, t],
  );

  const pickSlash = useCallback(
    (index: number) => {
      const cmd = slashCommands[index];
      if (!cmd) return;
      const text = slashTemplate(cmd, t, biggestDeck?.name);
      updateDraft(text, activeId);
      setTrigger(null);
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        el?.focus();
        el?.setSelectionRange(text.length, text.length);
      });
    },
    [slashCommands, t, biggestDeck, activeId, updateDraft],
  );

  // Stop the in-flight turn (S6 / AC3.3 — the abort cliff). Abort the active
  // controller; the swallowed AbortError leaves the user row persisted server-side
  // but no assistant turn committed. Drop the un-committed streaming placeholder
  // so the recoverable "stopped — regenerate?" affordance shows on the user tail.
  const stopTurn = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages((prev) =>
      prev.filter((m) => !(m.role === 'assistant' && m.streaming && m.content.length === 0 && (m.toolCalls ?? []).length === 0)),
    );
    // Any streaming placeholder that already has content/tool work: finalize it
    // (drop the streaming flag) rather than discard partial visible work.
    setMessages((prev) => prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)));
    setStreamPhase(null);
    setSending(false);
    // Stop means stop (D4): a queued follow-up returns to the draft instead of
    // auto-firing into a turn the user just cancelled.
    if (queuedRef.current) {
      const q = queuedRef.current;
      queuedRef.current = null;
      setQueued(null);
      updateDraft(q, activeId);
    }
  }, [activeId, updateDraft]);

  // Regenerate the LAST assistant turn (S6 / AC3.4). Removes any trailing
  // assistant VM locally, re-adds a streaming placeholder, then POSTs to the
  // server's /regenerate route (which deletes the trailing assistant turn + replays
  // the last user message with the CURRENT model — doubles as "retry deeper").
  // Reused by the per-message regenerate button AND the "stopped — regenerate?"
  // recovery affordance (the answer-less user tail).
  const regenerate = useCallback(async () => {
    const convId = activeId;
    if (!convId || sending) return;
    setSending(true);
    const assistantMsgId = `local-regen-${Date.now()}`;
    // Drop a trailing assistant VM (if any) and append a fresh streaming
    // placeholder so the new answer renders in its place.
    setMessages((prev) => {
      const trimmed =
        prev.length > 0 && prev[prev.length - 1].role === 'assistant'
          ? prev.slice(0, -1)
          : prev;
      return [
        ...trimmed,
        {
          id: assistantMsgId,
          role: 'assistant',
          content: '',
          citations: [],
          streaming: true,
          turnStartedAt: Date.now(),
          createdAt: new Date().toISOString(),
          model: model ?? undefined,
        },
      ];
    });
    const controller = new AbortController();
    abortRef.current = controller;
    await regenerateChat(
      convId,
      {
        model: model ?? undefined,
        deckId: isNotebook ? undefined : (deckScope ?? undefined),
        research: isNotebook ? undefined : research || undefined,
        sourceIds: isNotebook ? sourceIdsRef.current : undefined,
      },
      buildStreamHandlers(assistantMsgId, convId),
      controller.signal,
    );
    setSending(false);
    maybeFlushQueue();
  }, [activeId, sending, buildStreamHandlers, model, deckScope, research, maybeFlushQueue, isNotebook]);

  // Edit-and-rerun the LAST user message (S7 / AC4.2, B2 default). Locally update
  // the last user VM's content, drop any trailing assistant VM, append a fresh
  // streaming placeholder (stamping turnStartedAt — T-accumulate), then POST to
  // /regenerate with `content` so the server UPDATES the last user row in place
  // before replaying → clean history (no duplicate pre-edit pair on reload).
  const editAndRegenerate = useCallback(
    async (editedText: string) => {
      const convId = activeId;
      const trimmed = editedText.trim();
      if (!convId || sending || trimmed.length === 0) return;
      // Defensive: bail before mutating state or POSTing when there is no preceding
      // user row. The edit affordance only renders on a trailing user bubble, but
      // guard here to prevent a dangling streaming placeholder + spurious 400 POST.
      const hasUserRow = messages.some((m) => m.role === 'user');
      if (!hasUserRow) return;
      setSending(true);
      const assistantMsgId = `local-edit-${Date.now()}`;
      setMessages((prev) => {
        // Update the LAST user VM's content; drop a trailing assistant VM if any.
        let prevLastUserIdx = -1;
        for (let i = prev.length - 1; i >= 0; i--) {
          if (prev[i]!.role === 'user') { prevLastUserIdx = i; break; }
        }
        if (prevLastUserIdx === -1) return prev;
        const next = prev.map((m, i) =>
          i === prevLastUserIdx ? { ...m, content: trimmed } : m,
        );
        const dropped =
          next.length > 0 && next[next.length - 1]!.role === 'assistant'
            ? next.slice(0, -1)
            : next;
        return [
          ...dropped,
          {
            id: assistantMsgId,
            role: 'assistant' as const,
            content: '',
            citations: [],
            streaming: true,
            turnStartedAt: Date.now(),
            createdAt: new Date().toISOString(),
            model: model ?? undefined,
          },
        ];
      });
      const controller = new AbortController();
      abortRef.current = controller;
      await regenerateChat(
        convId,
        {
          model: model ?? undefined,
          deckId: isNotebook ? undefined : (deckScope ?? undefined),
          research: isNotebook ? undefined : research || undefined,
          sourceIds: isNotebook ? sourceIdsRef.current : undefined,
          content: trimmed,
        },
        buildStreamHandlers(assistantMsgId, convId),
        controller.signal,
      );
      setSending(false);
      maybeFlushQueue();
    },
    [activeId, sending, messages, buildStreamHandlers, model, deckScope, research, maybeFlushQueue, isNotebook],
  );

  // Copy an assistant message's clean prose to the clipboard (S6 / AC3.5). The
  // inline [card:<id>] grounding tokens are stripped first (they're noise in
  // copied text). A confirmation toast surfaces on success. Client-only.
  const copyMessage = useCallback(
    async (content: string) => {
      try {
        await navigator.clipboard.writeText(stripCardTokens(content));
        raiseToast({ kind: 'info', titleKey: 'chat.message.copied' });
      } catch {
        // Clipboard unavailable / denied — best-effort, no toast.
      }
    },
    [],
  );

  // «В заметки» (Р7): save a finished assistant answer into the notebook's notes.
  // The STORED content keeps its [src:] tokens (the note viewer renders them as
  // plain text in N1); only SOURCE citations are snapshotted (card citations are
  // notebook-irrelevant). `messageId` is the persisted assistant row id — omitted
  // for a still-ephemeral (never-reloaded) turn so the server accepts it without
  // the back-ref.
  const saveAnswer = useCallback(
    (m: MessageVM) => {
      if (!onSaveAnswer) return;
      const citations = (m.citations ?? []).filter(isSourceCitation) as unknown[];
      onSaveAnswer({
        content: m.content,
        citations,
        messageId: m.id && !m.id.startsWith('local-') ? m.id : undefined,
      });
    },
    [onSaveAnswer],
  );

  // ── Render: setup notice when chat is unconfigured ───────────────────────────

  if (statusLoaded && status && !status.chatEnabled) {
    return (
      <div style={{ padding: isMobile ? 16 : 32, maxWidth: 640, margin: '0 auto' }}>
        <NNCard padding={24} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <NNIcon name="sparkle" size={20} color="var(--violet-400)" />
            <h2
              style={{
                fontSize: 18,
                fontWeight: 700,
                fontFamily: 'var(--font-sans)',
                color: 'var(--text)',
                margin: 0,
              }}
            >
              {t('chat.setup.title')}
            </h2>
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--text-muted)', margin: 0 }}>
            {t('chat.setup.body')}
          </p>
          <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-dim)', margin: 0 }}>
            {t('chat.setup.indexNote')}
          </p>
          <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-dim)', margin: 0 }}>
            {t('chat.setup.docsHint')}
          </p>
        </NNCard>
      </div>
    );
  }

  // ── Render: main two-pane shell ──────────────────────────────────────────────

  return (
    <div
      style={{
        display: 'flex',
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      {/* Thread list (extracted ThreadRail — search/groups/pin/rename/delete).
          On mobile it's the full screen until the user opens or starts a chat
          (`composing`); on desktop it's always the left rail. Notebook mode
          HIDES it — the workspace provides its own thread switcher. */}
      {!isNotebook && (!isMobile || !composing) && (
        <ThreadRail
          conversations={conversations}
          activeId={activeId}
          loaded={conversationsLoaded}
          isMobile={isMobile}
          onOpen={(id) => void openThread(id)}
          onNew={newThread}
          onRename={(id, title) => void renameThread(id, title)}
          onDelete={(id) => void deleteThread(id)}
          onTogglePin={(id, pinned) => void togglePin(id, pinned)}
          t={t}
        />
      )}

      {/* Message stream + composer. On mobile it replaces the list while
          composing; on desktop it's always the right pane. Notebook mode always
          shows it (the workspace owns the tab/layout switch). */}
      {(isNotebook || !isMobile || composing) && (
        <section style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {!isNotebook && isMobile && (
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
              <NNBtn size="sm" variant="ghost" icon="chevl" onClick={backToList}>
                {t('chat.threads.title')}
              </NNBtn>
            </div>
          )}

          <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex' }}>
          <div
            ref={scrollRef}
            className="nn-scroll"
            aria-busy={
              threadResource.status === 'loading' || threadResource.status === 'refreshing'
            }
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: isMobile ? '16px 14px' : '24px 28px',
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
            }}
          >
            {threadResource.status === 'refreshing' && threadResource.data !== null && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <NNInlineRefresh label={t('states.loading')} />
              </div>
            )}
            {threadResource.status === 'error' && threadResource.data !== null && (
              <NNLoadError
                title={t('toasts.error')}
                description={threadResource.error?.safeMessage}
                retryLabel={t('notebooks.overview.retry')}
                requestId={threadResource.error?.requestId}
                onRetry={() => {
                  if (activeId) void openThread(activeId);
                }}
              />
            )}
            {threadResource.status === 'loading' && threadResource.data === null ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 760, width: '100%', margin: '0 auto' }}>
                <NNSkeleton height={48} />
                <NNSkeleton height={96} />
              </div>
            ) : threadResource.status === 'error' && threadResource.data === null ? (
              <div
                style={{
                  width: 'min(520px, 100%)',
                  margin: 'auto',
                }}
              >
                <NNLoadError
                  title={t('toasts.error')}
                  description={threadResource.error?.safeMessage}
                  retryLabel={t('notebooks.overview.retry')}
                  requestId={threadResource.error?.requestId}
                  onRetry={() => {
                    if (activeId) void openThread(activeId);
                  }}
                />
              </div>
            ) : messages.length === 0 ? (
              isNotebook ? (
                <NotebookChatEmpty
                  questions={!activeId ? (suggestedQuestions ?? []) : []}
                  sending={sending}
                  onAsk={(q) => void sendContent(q)}
                  onRefresh={
                    onRefreshSuggestions
                      ? async () => {
                          if (refreshingSuggestions) return;
                          setRefreshingSuggestions(true);
                          try {
                            await onRefreshSuggestions();
                          } finally {
                            setRefreshingSuggestions(false);
                          }
                        }
                      : undefined
                  }
                  refreshing={refreshingSuggestions}
                  t={t}
                />
              ) : (
                <div
                  style={{
                    margin: 'auto',
                    maxWidth: 460,
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <NNIcon name="sparkle" size={34} color="var(--violet-400)" />
                  <h2
                    style={{
                      fontSize: 20,
                      fontWeight: 700,
                      fontFamily: 'var(--font-sans)',
                      color: 'var(--text)',
                      margin: 0,
                    }}
                  >
                    {t('chat.stream.emptyTitle')}
                  </h2>
                  <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--text-muted)', margin: 0 }}>
                    {t('chat.stream.emptySubtitle')}
                  </p>
                  {/* Suggested prompts — new conversations only; click = send now. */}
                  {!activeId && suggestions.length > 0 && (
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        justifyContent: 'center',
                        gap: 8,
                        marginTop: 6,
                      }}
                    >
                      {suggestions.map((s) => (
                        <button
                          key={s}
                          type="button"
                          disabled={sending}
                          onClick={() => void sendContent(s)}
                          style={{
                            border: '1px solid var(--border)',
                            background: 'var(--surface-2)',
                            color: 'var(--text-muted)',
                            borderRadius: 999,
                            padding: '7px 14px',
                            fontSize: 12.5,
                            fontFamily: 'var(--font-sans)',
                            cursor: 'pointer',
                          }}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 18,
                  maxWidth: 760,
                  width: '100%',
                  margin: '0 auto',
                }}
              >
                {messages.map((m, i) => (
                  <React.Fragment key={m.id}>
                    {/* Day separator between messages from different LOCAL days (B2). */}
                    {needsDaySeparator(messages[i - 1]?.createdAt, m.createdAt) && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          margin: '2px 0',
                        }}
                      >
                        <span style={{ flex: 1, borderTop: '1px dashed var(--border-2)' }} />
                        <span
                          style={{
                            fontSize: 10.5,
                            fontWeight: 600,
                            letterSpacing: 0.8,
                            textTransform: 'uppercase',
                            color: 'var(--text-dim)',
                            fontFamily: 'var(--font-sans)',
                            flexShrink: 0,
                          }}
                        >
                          {formatDayLabel(m.createdAt!, locale, t)}
                        </span>
                        <span style={{ flex: 1, borderTop: '1px dashed var(--border-2)' }} />
                      </div>
                    )}
                    <MessageRow
                      message={m}
                      phase={m.streaming ? streamPhase : null}
                      resolveCard={resolveCard}
                      deckNameById={deckNameById}
                      onConfirm={confirmToolCall}
                      // Regenerate only on the LAST assistant message (and only once
                      // it has finished streaming).
                      canRegenerate={
                        m.role === 'assistant' && !m.streaming && i === messages.length - 1 && !sending
                      }
                      onCopy={() => void copyMessage(m.content)}
                      onSaveAnswer={onSaveAnswer ? () => saveAnswer(m) : undefined}
                      onRegenerate={() => void regenerate()}
                      // Edit-and-rerun only on the LAST user message, when idle (AC4.1).
                      canEdit={m.role === 'user' && i === messages.length - 1 && !sending}
                      onEdit={(text) => void editAndRegenerate(text)}
                      onOpenCard={(cardId) => router.push(`/cards?focus=${cardId}`)}
                      // Quotes inside a deck name would break the deck:"…" query syntax.
                      onOpenDeckCards={(deckName) =>
                        router.push(`/cards?q=${encodeURIComponent(`deck:"${deckName.replace(/"/g, '')}"`)}`)
                      }
                      onSourceCitation={onSourceCitation}
                      isNotebook={isNotebook}
                      sourceCount={isNotebook ? sourceIds?.length : undefined}
                      modelLabel={(id) => status?.models?.find((mm) => mm.id === id)?.label ?? id}
                      locale={locale}
                      t={t}
                    />
                  </React.Fragment>
                ))}
                {/* The abort/regenerate cliff (M1): a committed user turn with no
                    answer — a recoverable "stopped — regenerate?" affordance shown
                    both live (on abort) and on reload (trailing-user detection). */}
                {answerlessTail && (
                  <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <NNBtn size="sm" variant="soft" icon="sync" onClick={() => void regenerate()}>
                      {t('chat.message.stoppedRetry')}
                    </NNBtn>
                  </div>
                )}
                {/* Queued follow-up (D4): a dim pending bubble, cancellable back
                    into the draft; auto-sends once the current turn settles. */}
                {queued && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        maxWidth: '78%',
                        padding: '8px 12px',
                        borderRadius: 'var(--r-lg)',
                        background: 'var(--surface-2)',
                        border: '1px dashed var(--border-2)',
                        opacity: 0.7,
                      }}
                    >
                      <span
                        style={{
                          color: 'var(--text-muted)',
                          fontFamily: 'var(--font-sans)',
                          fontSize: 13.5,
                          lineHeight: 1.45,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          minWidth: 0,
                        }}
                      >
                        {queued}
                      </span>
                      <NNBadge tone="neutral" size="xs">
                        {t('chat.message.queued')}
                      </NNBadge>
                      <button
                        type="button"
                        aria-label={t('chat.message.queuedCancel')}
                        title={t('chat.message.queuedCancel')}
                        onClick={() => {
                          const q = queuedRef.current;
                          queuedRef.current = null;
                          setQueued(null);
                          if (q) updateDraft(q, activeId);
                        }}
                        style={{
                          display: 'flex',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--text-dim)',
                          padding: 2,
                          flexShrink: 0,
                        }}
                      >
                        <NNIcon name="x" size={13} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Jump-to-latest pill (B1) — floats over the scroll pane while the
              user is scrolled away; highlights when new content arrived. */}
          {!stick.nearBottom && messages.length > 0 && (
            <button
              type="button"
              onClick={stick.scrollToBottom}
              aria-label={t('chat.stream.jumpToBottom')}
              title={t('chat.stream.jumpToBottom')}
              style={{
                position: 'absolute',
                bottom: 12,
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 12px',
                borderRadius: 'var(--r-pill)',
                border: '1px solid var(--border-2)',
                background: 'var(--surface-3)',
                color: 'var(--text)',
                fontFamily: 'var(--font-sans)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: 'var(--shadow-md)',
                zIndex: 15,
              }}
            >
              <NNIcon name="chevd" size={13} />
              {stick.hasUnseen && sending ? t('chat.stream.newMessages') : null}
            </button>
          )}
          </div>

          {/* Composer (A2 redesign) — a centered card with the textarea on top
              and a single bottom controls row (attach · model · context · send).
              All behavior preserved (popovers, drag/paste, queue, stop). */}
          <div
            onDragOver={(e) => {
              if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
            }}
            onDrop={(e) => {
              const files = e.dataTransfer?.files;
              if (files && files.length > 0) {
                e.preventDefault();
                void addAttachmentFiles(Array.from(files));
              }
            }}
            style={{
              padding: isMobile ? '6px 12px 12px' : '6px 24px 14px',
              background: 'var(--bg)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <div
              className="nn-nb-composer"
              style={{
                width: '100%',
                maxWidth: messages.length === 0 ? 560 : 620,
                background: 'var(--surface)',
                border: '1px solid var(--border-2)',
                borderRadius: 16,
                boxShadow: 'var(--shadow-md)',
                padding: '10px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                position: 'relative',
              }}
            >
              {/* Composer popovers (D1/D2) — anchored above the card; the textarea
                  keeps focus, keyboard handled in its onKeyDown. */}
              {trigger?.kind === 'mention' && mentionResults && (
                <MentionPopover
                  results={mentionResults}
                  activeIndex={popoverIdx}
                  onPick={pickMention}
                  onHover={setPopoverIdx}
                  isMobile={isMobile}
                  t={t}
                />
              )}
              {trigger?.kind === 'slash' && slashCommands.length > 0 && (
                <SlashMenu
                  commands={slashCommands}
                  activeIndex={popoverIdx}
                  onPick={pickSlash}
                  onHover={setPopoverIdx}
                  isMobile={isMobile}
                  t={t}
                />
              )}
              {/* Mention chips (D1) — cards attached to the next send. */}
              {mentionChips.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {mentionChips.map((chip) => (
                    <span
                      key={chip.cardId}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '4px 8px',
                        borderRadius: 'var(--r-pill)',
                        border: '1px solid var(--border-2)',
                        background: 'var(--surface-3)',
                        color: 'var(--text-muted)',
                        fontFamily: 'var(--font-sans)',
                        fontSize: 12,
                        maxWidth: 240,
                      }}
                    >
                      <NNIcon name="brain" size={12} color="var(--text-dim)" />
                      <span
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          minWidth: 0,
                        }}
                      >
                        {chip.label}
                      </span>
                      <button
                        type="button"
                        aria-label={t('chat.composer.removeMention')}
                        title={t('chat.composer.removeMention')}
                        onClick={() =>
                          setMentionChips((prev) => prev.filter((c) => c.cardId !== chip.cardId))
                        }
                        style={{
                          display: 'flex',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--text-dim)',
                          padding: 0,
                        }}
                      >
                        <NNIcon name="x" size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {/* Attachment chips — uploaded images + inline text files. */}
              {attachChips.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {attachChips.map((chip) => (
                    <span
                      key={chip.key}
                      title={chip.name}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '4px 8px',
                        borderRadius: 'var(--r-pill)',
                        border: '1px solid var(--border-2)',
                        background: 'var(--surface-3)',
                        color: 'var(--text-muted)',
                        fontFamily: 'var(--font-sans)',
                        fontSize: 12,
                        maxWidth: 260,
                      }}
                    >
                      {chip.kind === 'image' && chip.token ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={chip.token}
                          alt={chip.name}
                          style={{ width: 24, height: 24, objectFit: 'cover', borderRadius: 6 }}
                        />
                      ) : (
                        <NNIcon
                          name={chip.kind === 'image' ? 'image' : 'doc'}
                          size={13}
                          color="var(--text-dim)"
                        />
                      )}
                      <span
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          minWidth: 0,
                        }}
                      >
                        {chip.name}
                      </span>
                      {chip.uploading ? (
                        <span className="nn-spin" aria-hidden>
                          <NNIcon name="sync" size={12} color="var(--text-dim)" />
                        </span>
                      ) : (
                        <button
                          type="button"
                          aria-label={t('chat.composer.removeAttachment')}
                          title={t('chat.composer.removeAttachment')}
                          onClick={() =>
                            setAttachChips((prev) => prev.filter((c) => c.key !== chip.key))
                          }
                          style={{
                            display: 'flex',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--text-dim)',
                            padding: 0,
                          }}
                        >
                          <NNIcon name="x" size={12} />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                accept={[
                  ...(status?.visionEnabled !== false ? (MEDIA_MIME_ALLOWLIST as readonly string[]) : []),
                  '.txt',
                  '.md',
                  '.markdown',
                  '.csv',
                  '.json',
                  '.log',
                ].join(',')}
                onChange={(e) => {
                  const files = e.target.files;
                  if (files && files.length > 0) void addAttachmentFiles(Array.from(files));
                  e.target.value = '';
                }}
              />
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => {
                  updateDraft(e.target.value, activeId);
                  refreshTrigger(e.target.value);
                }}
                onPaste={(e) => {
                  // Pasted screenshots/files become attachments, not garbled text.
                  const files = e.clipboardData?.files;
                  if (files && files.length > 0) {
                    e.preventDefault();
                    void addAttachmentFiles(Array.from(files));
                  }
                }}
                onClick={() => refreshTrigger(draft)}
                onKeyUp={(e) => {
                  // Caret moves (arrows left/right, Home/End) keep the trigger honest.
                  if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
                    refreshTrigger(draft);
                  }
                }}
                onKeyDown={(e) => {
                  // Popover navigation FIRST (D1/D2): arrows move, Enter/Tab pick,
                  // Esc closes (and never reaches any other Esc handler).
                  if (trigger) {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      e.stopPropagation();
                      setTrigger(null);
                      return;
                    }
                    if (popoverCount > 0) {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setPopoverIdx((i) => (i + 1) % popoverCount);
                        return;
                      }
                      if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setPopoverIdx((i) => (i - 1 + popoverCount) % popoverCount);
                        return;
                      }
                      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
                        e.preventDefault();
                        if (trigger.kind === 'mention') pickMention(popoverIdx);
                        else pickSlash(popoverIdx);
                        return;
                      }
                    } else if (e.key === 'Enter' && !e.shiftKey) {
                      // Zero results: Enter closes the popover and sends (no dead key).
                      setTrigger(null);
                    }
                  }
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder={t(
                  isNotebook
                    ? 'notebooks.chat.composerPlaceholder'
                    : research
                      ? 'chat.composer.researchPlaceholder'
                      : 'chat.composer.placeholder',
                )}
                rows={1}
                style={{
                  width: '100%',
                  resize: 'none',
                  minHeight: 24,
                  maxHeight: 160,
                  padding: '2px 4px',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 13.5,
                  lineHeight: 1.45,
                  outline: 'none',
                }}
              />
              {/* Bottom controls row — attach · model pill · context chip ·
                  spacer · ⏎ kbd · send/stop. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="nn-nb-icon-btn"
                  aria-label={t('chat.composer.attach')}
                  title={t('chat.composer.attach')}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={attachChips.length >= ATTACH_MAX}
                  style={{
                    width: 28,
                    height: 28,
                    flexShrink: 0,
                    borderRadius: 8,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'transparent',
                    border: 'none',
                    color: attachChips.length >= ATTACH_MAX ? 'var(--text-dim)' : 'var(--text-muted)',
                    cursor: attachChips.length >= ATTACH_MAX ? 'default' : 'pointer',
                  }}
                >
                  <NNIcon name="clip" size={16} />
                </button>
                {(status?.models?.length ?? 0) > 0 && (
                  <ModelPicker
                    models={status?.models ?? []}
                    value={model}
                    onSelect={selectModel}
                    t={t}
                  />
                )}
                {/* Context chip: notebook → «N источников» (read-only); global →
                    deck-scope + research pills (existing per-turn controls). */}
                {isNotebook ? (
                  sourceIds != null && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        fontSize: 11.5,
                        color: 'var(--text-dim)',
                        fontFamily: 'var(--font-sans)',
                      }}
                    >
                      <NNIcon name="book" size={12} color="var(--text-dim)" />
                      {t('notebooks.chat.sourceScope', { count: sourceIds.length })}
                    </span>
                  )
                ) : (
                  <>
                    {sortedDecks.length > 0 && (
                      <DeckScopePicker
                        decks={sortedDecks}
                        value={deckScope}
                        onSelect={setDeckScope}
                        t={t}
                      />
                    )}
                    {status?.fetchPageEnabled === true && (
                      <ResearchToggle active={research} onToggle={toggleResearch} t={t} />
                    )}
                  </>
                )}
                <span style={{ flex: 1 }} />
                {!isMobile && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 11,
                      color: 'var(--text-dim)',
                      fontFamily: 'var(--font-sans)',
                    }}
                  >
                    <NNKbd>⏎</NNKbd>
                    {t('chat.composer.sendHint')}
                  </span>
                )}
                {/* Send toggles to Stop while a turn is in flight (S6 / AC3.3). */}
                {sending ? (
                  <button
                    type="button"
                    aria-label={t('chat.composer.stop')}
                    title={t('chat.composer.stop')}
                    onClick={stopTurn}
                    style={{
                      width: 32,
                      height: 32,
                      flexShrink: 0,
                      borderRadius: 10,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      background: 'var(--rose-500)',
                      border: '1px solid var(--rose-500)',
                      color: 'var(--text-on-violet)',
                    }}
                  >
                    <NNIcon name="pause" size={14} color="var(--text-on-violet)" />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="nn-nb-send"
                    aria-label={t('chat.composer.send')}
                    title={t('chat.composer.send')}
                    onClick={() => void send()}
                    disabled={
                      (draft.trim().length === 0 && attachChips.length === 0) ||
                      attachChips.some((a) => a.uploading)
                    }
                    style={{
                      width: 32,
                      height: 32,
                      flexShrink: 0,
                      borderRadius: 10,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'var(--accent-500)',
                      border: '1px solid var(--accent-500)',
                      color: 'var(--text-on-accent)',
                    }}
                  >
                    <NNIcon name="send" size={15} color="var(--text-on-accent)" strokeWidth={2} />
                  </button>
                )}
              </div>
            </div>
            {/* Disclaimer (both modes). */}
            <div
              style={{
                marginTop: 8,
                fontSize: 10.5,
                color: 'var(--text-dim)',
                fontFamily: 'var(--font-sans)',
                textAlign: 'center',
              }}
            >
              {t('chat.composer.disclaimer')}
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

// ── One message row ──────────────────────────────────────────────────────────

type StreamPhase = 'thinking' | 'calling_tool' | 'answering' | null;

interface MessageRowProps {
  message: MessageVM;
  /** Coarse loop phase of the in-flight turn (only set on the streaming row). */
  phase?: StreamPhase;
  resolveCard: (cardId: string) => Card | undefined;
  deckNameById: Map<string, string>;
  /**
   * Answer a paused write/SRS tool call (Phase B). Carries the parent assistant
   * message id so the resume targets the right bubble.
   */
  onConfirm: (
    assistantMsgId: string,
    toolCallId: string,
    decision: 'apply' | 'reject',
    payload?: ConfirmPayload,
  ) => void;
  /** Show the regenerate action (only on the last, finished assistant message). */
  canRegenerate?: boolean;
  /** Copy this message's clean prose to the clipboard (assistant only). */
  onCopy?: () => void;
  /** «В заметки» (Р7) — save this answer into the notebook's notes (notebook
   *  mode only; undefined ⇒ the button is hidden). */
  onSaveAnswer?: () => void;
  /** Regenerate the last assistant turn (assistant only). */
  onRegenerate?: () => void;
  /** Show the edit-and-rerun affordance (only on the last user message). */
  canEdit?: boolean;
  /** Edit-and-rerun the last user message with the edited text (AC4.1/4.2). */
  onEdit?: (text: string) => void;
  /** Open a cited card in /cards (jump-to-card, AC3.6). */
  onOpenCard?: (cardId: string) => void;
  /** Open a deck's cards in /cards (post-create exit when no card id, P3.7). */
  onOpenDeckCards?: (deckName: string) => void;
  /** A source citation chip was clicked (workspace scrolls the reader). */
  onSourceCitation?: (c: SourceCitation) => void;
  /** Notebook mode (A2): numbered inline citations + «по N источникам» meta. */
  isNotebook?: boolean;
  /** Size of the active source scope — drives «по N источникам» (undefined ⇒
   *  hidden). Notebook mode only. */
  sourceCount?: number;
  /** Resolve a model id to its picker label (B6) — falls back to the raw id. */
  modelLabel?: (id: string) => string;
  /** Active locale for absolute-timestamp formatting on hover. */
  locale: string;
  t: (key: string, params?: Record<string, string | number>) => string;
}

/** Short HH:MM time for the inline message timestamp (B2). */
function formatTimeShort(iso: string | undefined, locale: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

const MessageRow = ({
  message,
  phase = null,
  resolveCard,
  deckNameById,
  onConfirm,
  canRegenerate = false,
  onCopy,
  onSaveAnswer,
  onRegenerate,
  canEdit = false,
  onEdit,
  onOpenCard,
  onOpenDeckCards,
  onSourceCitation,
  isNotebook = false,
  sourceCount,
  modelLabel,
  locale,
  t,
}: MessageRowProps) => {
  const isUser = message.role === 'user';
  // Cited cards are collapsed by default (they can be large); a count summary
  // toggles the full RichCard list. Hook declared before the user-message early
  // return so it's always called in the same order.
  const [sourcesOpen, setSourcesOpen] = useState(false);
  // Edit-and-rerun inline state (AC4.1) — hooks before the early return.
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState('');
  const toolCalls = message.toolCalls ?? [];
  const hasReasoning = (message.reasoning ?? '').trim().length > 0;
  // Notebook numbered citations (A2): build the per-message chunkId→number map +
  // ordered chip list from the prose's first-appearance order. Card mode skips
  // this (numbering stays empty ⇒ inline decoration is a no-op).
  const numbering: CitationNumbering = useMemo(
    () =>
      isNotebook
        ? buildCitationNumbering(message.content, message.citations)
        : { numberOf: new Map(), ordered: [] },
    [isNotebook, message.content, message.citations],
  );
  const citationOf = useCallback(
    (chunkId: string): SourceCitation | undefined =>
      numbering.ordered.find((o) => o.citation.sourceChunkId === chunkId)?.citation,
    [numbering],
  );
  // While the turn is still streaming and the final answer hasn't begun, the
  // thinking placeholder shows; once any prose/tool work exists it gives way.
  const isStreaming = !!message.streaming;
  const answerStarted = message.content.length > 0;

  if (isUser) {
    const startEdit = () => {
      setEditDraft(message.content);
      setEditing(true);
    };
    const commitEdit = () => {
      const text = editDraft.trim();
      setEditing(false);
      if (text.length > 0 && text !== message.content) onEdit?.(text);
    };
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        {editing ? (
          // Inline editable field (reuses the thread inline-rename pattern). Enter
          // confirms (edit-and-rerun), Esc cancels.
          <input
            autoFocus
            value={editDraft}
            maxLength={8000}
            aria-label={t('chat.message.editSave')}
            onChange={(e) => setEditDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitEdit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setEditing(false);
              }
            }}
            onBlur={() => setEditing(false)}
            style={{
              maxWidth: '78%',
              width: '78%',
              padding: '10px 14px',
              borderRadius: 'var(--r-lg)',
              border: '1px solid var(--border-2)',
              background: 'var(--surface-2)',
              color: 'var(--text)',
              fontFamily: 'var(--font-sans)',
              fontSize: 14,
              lineHeight: 1.5,
              outline: 'none',
            }}
          />
        ) : (
          <div
            className="nn-chat-user-bubble nn-msg-row"
            title={formatTimestamp(message.createdAt, locale)}
            style={{
              display: 'inline-flex',
              alignItems: 'flex-start',
              gap: 6,
              maxWidth: '78%',
            }}
          >
            {formatTimeShort(message.createdAt, locale) && (
              <span
                className="nn-msg-time"
                style={{
                  alignSelf: 'center',
                  fontSize: 10.5,
                  color: 'var(--text-dim)',
                  fontFamily: 'var(--font-sans)',
                  flexShrink: 0,
                }}
              >
                {formatTimeShort(message.createdAt, locale)}
              </span>
            )}
            {canEdit && onEdit && (
              <button
                type="button"
                aria-label={t('chat.message.edit')}
                title={t('chat.message.edit')}
                onClick={startEdit}
                style={{
                  display: 'flex',
                  alignSelf: 'center',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-dim)',
                  padding: 2,
                  flexShrink: 0,
                }}
              >
                <NNIcon name="edit" size={14} />
              </button>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
              {/* Attachments — image previews + file chips, above the text. */}
              {(message.attachments ?? []).length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>
                  {message.attachments!.map((a, i) =>
                    a.kind === 'image' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={`${a.mediaId}-${i}`}
                        src={a.token}
                        alt={a.name ?? 'attachment'}
                        title={a.name}
                        style={{
                          maxHeight: 180,
                          maxWidth: 260,
                          borderRadius: 'var(--r-md)',
                          border: '1px solid var(--border-2)',
                          objectFit: 'cover',
                        }}
                      />
                    ) : (
                      <span
                        key={`${a.name}-${i}`}
                        title={a.name}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '4px 10px',
                          borderRadius: 'var(--r-pill)',
                          border: '1px solid var(--border-2)',
                          background: 'var(--surface-2)',
                          color: 'var(--text-muted)',
                          fontFamily: 'var(--font-sans)',
                          fontSize: 12,
                          maxWidth: 220,
                        }}
                      >
                        <NNIcon name="doc" size={12} color="var(--text-dim)" />
                        <span
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            minWidth: 0,
                          }}
                        >
                          {a.name}
                        </span>
                      </span>
                    ),
                  )}
                </div>
              )}
              <div
                className="nn-nb-user-bubble"
                style={{
                  padding: '10px 14px',
                  borderRadius: '16px 16px 4px 16px',
                  background: 'var(--surface-3)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 13.5,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  minWidth: 0,
                }}
              >
                {message.content}
              </div>
              {/* Mention chips on a persisted user message (C7/D1). */}
              {(message.mentions ?? []).length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, justifyContent: 'flex-end' }}>
                  {message.mentions!.map((m) => (
                    <button
                      key={m.cardId}
                      type="button"
                      onClick={() => onOpenCard?.(m.cardId)}
                      title={m.front}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '2px 8px',
                        borderRadius: 'var(--r-pill)',
                        border: '1px solid var(--border-2)',
                        background: 'var(--surface-2)',
                        color: 'var(--text-dim)',
                        fontFamily: 'var(--font-sans)',
                        fontSize: 11,
                        cursor: onOpenCard ? 'pointer' : 'default',
                        maxWidth: 200,
                      }}
                    >
                      <NNIcon name="brain" size={11} color="var(--text-dim)" />
                      <span
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          minWidth: 0,
                        }}
                      >
                        {(resolveCard(m.cardId)?.renderFrontText || m.front || '').trim() || m.front}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Assistant turn: model prose (above) is visibly separate from the cited cards
  // (below), making own-vs-general content distinguishable (AC3).
  return (
    <div className="nn-msg-row" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        title={formatTimestamp(message.createdAt, locale)}
        style={{ display: 'flex', alignItems: 'center', gap: 8 }}
      >
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 9,
            flexShrink: 0,
            background: 'var(--tone-violet-bg)',
            border: '1px solid var(--tone-violet-border)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <NNIcon name="sparkle" size={14} color="var(--violet-400)" />
        </span>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-sans)' }}>
          {t('chat.stream.assistantName')}
        </span>
        {isNotebook && sourceCount != null && (
          <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-sans)' }}>
            {t('chat.stream.bySources', { count: sourceCount })}
          </span>
        )}
        {formatTimeShort(message.createdAt, locale) && (
          <span
            className="nn-msg-time"
            style={{
              fontSize: 10.5,
              color: 'var(--text-dim)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            {formatTimeShort(message.createdAt, locale)}
          </span>
        )}
      </div>

      {/* Collapsible reasoning trace — live-streams while the answer is still
          generating, then auto-collapses once the final answer arrives. */}
      {hasReasoning && (
        <ReasoningBlock
          reasoning={message.reasoning ?? ''}
          // Auto-open while streaming with no answer yet; collapse once prose lands.
          live={isStreaming && !answerStarted}
          t={t}
        />
      )}

      {/* Condensed activity group (Codex-like) — a single timed, collapsible work
          block wrapping the turn's tool steps, ABOVE the prose. Reasoning stays
          above it (rendered just before). "Worked for Ns" shows once finished and
          `elapsedMs` is present; on reload timing is absent (graceful). */}
      {toolCalls.length > 0 && (
        <ToolActivityGroup
          toolCalls={toolCalls}
          elapsedMs={message.elapsedMs}
          streaming={isStreaming}
          answerStarted={answerStarted}
          resolveCard={resolveCard}
          deckNameById={deckNameById}
          onConfirm={(toolCallId, decision, payload) =>
            onConfirm(message.id, toolCallId, decision, payload)
          }
          onOpenCard={onOpenCard}
          onOpenDeckCards={onOpenDeckCards}
          onSourceCitation={onSourceCitation}
          t={t}
        />
      )}

      {/* Model prose rendered as Markdown (same pipeline as cards, via SafeHtml).
          The inline [card:<id>] grounding tokens are stripped — the sources are
          shown in the collapsible block below. */}
      {answerStarted ? (
        <AssistantMarkdown
          content={message.content}
          final={!isStreaming}
          citeNumbers={isNotebook ? numbering.numberOf : undefined}
          citationOf={isNotebook ? citationOf : undefined}
          onCite={isNotebook ? onSourceCitation : undefined}
          t={t}
        />
      ) : isStreaming ? (
        <span style={{ fontSize: 13, color: 'var(--text-dim)', fontStyle: 'italic' }}>
          {phase === 'calling_tool'
            ? t('chat.tool.running')
            : t('chat.stream.thinking')}
        </span>
      ) : null}

      {/* Notebook mode (A2): a row of numbered source chips — each NBCite number
          + a 15×21 letter-tile cover + «Title · стр. N». Click → onSourceCitation
          (the workspace scrolls the reader). Inline ¹² chips in the prose share
          the same numbering. */}
      {isNotebook && numbering.ordered.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingTop: 2 }}>
          {numbering.ordered.map(({ n, citation }) => (
            <NumberedSourceChip
              key={`nbsrc-${citation.sourceChunkId}-${n}`}
              n={n}
              citation={citation}
              onClick={onSourceCitation}
              t={t}
            />
          ))}
        </div>
      )}

      {/* Cited cards (card mode) — collapsed by default into a count summary
          (they can be large); expandable to the full RichCard list (AC8),
          clearly delimited as "from your cards". Notebook mode renders the
          numbered chip row above instead. */}
      {!isNotebook && message.citations.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            paddingTop: 4,
            borderTop: '1px dashed var(--border-2)',
          }}
        >
          <button
            type="button"
            onClick={() => setSourcesOpen((v) => !v)}
            aria-expanded={sourcesOpen}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              alignSelf: 'flex-start',
              background: 'transparent',
              border: 'none',
              padding: '2px 0',
              cursor: 'pointer',
              color: 'var(--lime-400)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            <NNIcon name="stack" size={13} color="var(--lime-400)" />
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: 1,
                textTransform: 'uppercase',
              }}
            >
              {t('chat.stream.sourcesCount', { count: message.citations.length })}
            </span>
            <span
              style={{
                display: 'inline-flex',
                transform: sourcesOpen ? 'rotate(-90deg)' : 'rotate(180deg)',
                transition: 'transform 140ms ease',
              }}
            >
              <NNIcon name="chevl" size={12} color="var(--lime-400)" />
            </span>
          </button>
          {sourcesOpen &&
            message.citations.map((cit, ci) =>
              isSourceCitation(cit) ? (
                <SourceCitationChip
                  key={`src-${cit.sourceChunkId}-${ci}`}
                  citation={cit}
                  onClick={onSourceCitation}
                  t={t}
                />
              ) : (
                <CitationCard
                  key={`card-${cit.chunkId}-${ci}`}
                  citation={cit}
                  card={resolveCard(cit.cardId)}
                  deckName={cit.deckId ? deckNameById.get(cit.deckId) : undefined}
                  onOpenCard={onOpenCard}
                  t={t}
                />
              ),
            )}
        </div>
      )}

      {/* Per-message actions: copy clean prose + «В заметки» + (last assistant
          only) regenerate + a dim model · token badge (B6). Ghost 26px buttons
          (A2). Only on a finished turn with prose. */}
      {!isStreaming && answerStarted && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', marginLeft: -9 }}>
          <ActionBtn icon="copy" label={t('chat.message.copy')} onClick={() => onCopy?.()} />
          {onSaveAnswer && (
            <ActionBtn
              icon="note"
              label={t('notebooks.notes.saveAnswer')}
              onClick={() => onSaveAnswer()}
            />
          )}
          {canRegenerate && (
            <ActionBtn
              icon="sync"
              label={t('chat.message.regenerateShort')}
              onClick={() => onRegenerate?.()}
            />
          )}
          {(message.model || usageTotal(message.usage) > 0) && (
            <span
              title={
                message.usage
                  ? `${message.usage.promptTokens} in · ${message.usage.completionTokens} out`
                  : undefined
              }
              style={{
                marginLeft: 'auto',
                fontSize: 10.5,
                color: 'var(--text-dim)',
                fontFamily: 'var(--font-sans)',
                whiteSpace: 'nowrap',
              }}
            >
              {[
                message.model ? (modelLabel?.(message.model) ?? message.model) : null,
                usageTotal(message.usage) > 0
                  ? t('chat.message.tokens', { count: usageTotal(message.usage).toLocaleString() })
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

// ── Notebook empty state (A2) ────────────────────────────────────────────────
// Violet-glow hero + serif title + 2×2 suggestion cards + «Обновить подсказки».
// Suggestion icons/tones cycle by index (bolt/amber, clock/sky, bulb/lime,
// target/violet); clicking a card sends the question. The refresh button renders
// only when `onRefresh` is passed (workspace wires it to the overview regen).

const EMPTY_SUGGESTION_STYLES = [
  { icon: 'bolt', tone: 'amber' },
  { icon: 'clock', tone: 'sky' },
  { icon: 'bulb', tone: 'lime' },
  { icon: 'target', tone: 'violet' },
] as const;

const NotebookChatEmpty = ({
  questions,
  sending,
  onAsk,
  onRefresh,
  refreshing,
  t,
}: {
  questions: string[];
  sending: boolean;
  onAsk: (q: string) => void;
  onRefresh?: () => void;
  refreshing: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}) => (
  <div
    style={{
      margin: 'auto',
      position: 'relative',
      width: '100%',
      maxWidth: 600,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '8px 0',
    }}
  >
    {/* Violet radial glow behind the hero. */}
    <div
      aria-hidden
      style={{
        position: 'absolute',
        top: -24,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 560,
        height: 380,
        maxWidth: '100%',
        pointerEvents: 'none',
        background: 'radial-gradient(closest-side, var(--tone-violet-bg), transparent 72%)',
      }}
    />
    <span
      style={{
        width: 54,
        height: 54,
        borderRadius: 16,
        marginBottom: 20,
        background: 'var(--surface)',
        border: '1px solid var(--border-2)',
        boxShadow: 'var(--glow-violet)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <NNIcon name="sparkle" size={24} color="var(--violet-400)" />
    </span>
    <h1
      style={{
        margin: 0,
        fontFamily: 'var(--font-serif)',
        fontWeight: 400,
        fontSize: 36,
        letterSpacing: -0.4,
        color: 'var(--text)',
        textAlign: 'center',
      }}
    >
      {t('notebooks.chat.heroTitle')}
    </h1>
    <p
      style={{
        margin: '10px 0 0',
        fontSize: 13.5,
        lineHeight: 1.6,
        color: 'var(--text-muted)',
        textAlign: 'center',
        maxWidth: 420,
      }}
    >
      {t('notebooks.chat.heroSubtitle')}
    </p>

    {questions.length > 0 && (
      <div
        style={{
          marginTop: 28,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: '100%',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 10,
            width: '100%',
            maxWidth: 560,
          }}
        >
          {questions.slice(0, 4).map((q, i) => {
            const s = EMPTY_SUGGESTION_STYLES[i % EMPTY_SUGGESTION_STYLES.length];
            return (
              <button
                key={q}
                type="button"
                className="nn-nb-sug"
                disabled={sending}
                onClick={() => onAsk(q)}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: '12px 13px',
                  borderRadius: 12,
                  cursor: 'pointer',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  textAlign: 'left',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                <span
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 8,
                    flexShrink: 0,
                    marginTop: 1,
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <NNIcon name={s.icon} size={13} color={`var(--${s.tone}-400)`} />
                </span>
                <span style={{ fontSize: 12.5, lineHeight: 1.45, color: 'var(--text-muted)' }}>{q}</span>
              </button>
            );
          })}
        </div>
        {onRefresh && (
          <button
            type="button"
            className="nn-nb-refresh"
            disabled={refreshing}
            onClick={onRefresh}
            style={{
              marginTop: 14,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              height: 28,
              padding: '0 12px',
              borderRadius: 999,
              cursor: refreshing ? 'default' : 'pointer',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-dim)',
              fontFamily: 'var(--font-sans)',
              fontSize: 11.5,
              fontWeight: 500,
              opacity: refreshing ? 0.6 : 1,
            }}
          >
            <span className={refreshing ? 'nn-spin' : undefined} style={{ display: 'inline-flex' }}>
              <NNIcon name="sync" size={12} />
            </span>
            {t('notebooks.chat.refreshSuggestions')}
          </button>
        )}
      </div>
    )}
  </div>
);

// ── Assistant action button (ghost, 26px) ───────────────────────────────────
// NBActionBtn from the design — copy / save-to-notes / regenerate under an
// answer. Hover surface-2 via `.nn-nb-action`.

const ActionBtn = ({
  icon,
  label,
  onClick,
}: {
  icon: string;
  label: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    className="nn-nb-action"
    aria-label={label}
    title={label}
    onClick={onClick}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      height: 26,
      padding: '0 9px',
      borderRadius: 7,
      cursor: 'pointer',
      background: 'transparent',
      border: 'none',
      color: 'var(--text-dim)',
      fontFamily: 'var(--font-sans)',
      fontSize: 11.5,
      fontWeight: 500,
    }}
  >
    <NNIcon name={icon} size={13} />
    {label}
  </button>
);

// ── Numbered source chip (NBSourceChip) ──────────────────────────────────────
// One chip under a grounded answer: the citation number + a 15×21 letter-tile
// cover (deterministic tone) + «Title · стр. N». Click → onSourceCitation.

const NumberedSourceChip = ({
  n,
  citation,
  onClick,
  t,
}: {
  n: number;
  citation: SourceCitation;
  onClick?: (c: SourceCitation) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) => {
  const clickable = !!onClick;
  const title = citation.sourceTitle ?? t('chat.source.untitled');
  const loc = citationLocation(citation, t);
  const tone = citationCoverTone(citation.sourceId);
  return (
    <button
      type="button"
      className="nn-nb-srcchip"
      disabled={!clickable}
      onClick={() => onClick?.(citation)}
      title={clickable ? t('chat.source.open') : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px 6px 7px',
        borderRadius: 9,
        cursor: clickable ? 'pointer' : 'default',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <span className="nn-nb-cite nn-nb-cite-static">{n}</span>
      <span
        aria-hidden
        style={{
          width: 15,
          height: 21,
          borderRadius: 4,
          flexShrink: 0,
          position: 'relative',
          background: `linear-gradient(150deg, var(--${tone}-500), var(--${tone}-600))`,
          boxShadow: 'inset 2px 0 0 var(--inset-shadow), 0 1px 3px var(--ambient-shadow)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 9,
            color: 'color-mix(in srgb, var(--text-on-violet) 92%, transparent)',
            lineHeight: 1,
          }}
        >
          {citationCoverLetter(citation.sourceTitle)}
        </span>
      </span>
      <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
        <span style={{ color: 'var(--text)', fontWeight: 500 }}>{title}</span>
        {loc ? ` · ${loc}` : ''}
      </span>
    </button>
  );
};

// ── One cited card (RichCard front, or snippet fallback) ─────────────────────

interface CitationCardProps {
  citation: CardCitation;
  card: Card | undefined;
  deckName: string | undefined;
  /** Jump to this card in /cards (AC3.6) — opens the bottom edit dock there. */
  onOpenCard?: (cardId: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const CitationCard = ({ citation, card, deckName, onOpenCard, t }: CitationCardProps) => (
  <NNCard padding={14} style={{ background: 'var(--surface-2)' }}>
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 6,
        marginBottom: deckName || card ? 8 : 0,
      }}
    >
      {deckName ? (
        <NNBadge tone="lime" size="xs">
          {deckName}
        </NNBadge>
      ) : (
        <span />
      )}
      {onOpenCard && (
        <button
          type="button"
          aria-label={t('chat.message.openCard')}
          title={t('chat.message.openCard')}
          onClick={() => onOpenCard(citation.cardId)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--lime-400)',
            fontFamily: 'var(--font-sans)',
            fontSize: 11,
            fontWeight: 600,
            padding: 2,
            flexShrink: 0,
          }}
        >
          <NNIcon name="link" size={12} color="var(--lime-400)" />
          {t('chat.message.openCard')}
        </button>
      )}
    </div>
    {card && card.noteType ? (
      // The ONLY card renderer (Principle 4). Render the card's FRONT side.
      <RichCard
        noteType={card.noteType}
        fieldValues={card.note?.fieldValues ?? {}}
        side="front"
        templateOrd={card.templateOrd}
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 14,
          lineHeight: 1.5,
          color: 'var(--text)',
          wordBreak: 'break-word',
        }}
      />
    ) : (
      // Fallback when the card couldn't be resolved (deleted / foreign): show the
      // server-provided snippet as plain text — never raw HTML.
      <div
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 13.5,
          lineHeight: 1.5,
          color: 'var(--text-muted)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {citation.snippet ?? ''}
      </div>
    )}
  </NNCard>
);

// ── One cited source passage (NotebookLM M2) ─────────────────────────────────
// A compact doc chip — title + page + 2-line snippet. Clicking it calls
// `onClick` (the workspace scrolls its reader to the passage); in the global
// chat (no handler) it renders inert. Plain text only — never raw HTML.

interface SourceCitationChipProps {
  citation: SourceCitation;
  onClick?: (c: SourceCitation) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const SourceCitationChip = ({ citation, onClick, t }: SourceCitationChipProps) => {
  const clickable = !!onClick;
  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={() => onClick?.(citation)}
      title={clickable ? t('chat.source.open') : undefined}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 5,
        width: '100%',
        textAlign: 'left',
        padding: '10px 12px',
        borderRadius: 'var(--r-md)',
        border: '1px solid var(--border)',
        background: 'var(--surface-2)',
        cursor: clickable ? 'pointer' : 'default',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
        <NNIcon name="doc" size={13} color="var(--sky-400)" />
        <span
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: 'var(--text)',
            fontFamily: 'var(--font-sans)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0,
            flex: 1,
          }}
        >
          {citation.sourceTitle ?? t('chat.source.untitled')}
        </span>
        {citation.page != null && (
          <NNBadge tone="sky" size="xs">
            {t('chat.source.page', { n: citation.page })}
          </NNBadge>
        )}
      </span>
      {citation.snippet && (
        <span
          style={{
            fontSize: 12.5,
            lineHeight: 1.5,
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-sans)',
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            wordBreak: 'break-word',
          }}
        >
          {citation.snippet}
        </span>
      )}
    </button>
  );
};

// ── Collapsible reasoning trace ──────────────────────────────────────────────
// Hand-rolled (no UI lib — Principle 4). While `live` (turn streaming, no answer
// yet) the block is forced open so deltas are visible; once the answer arrives it
// auto-collapses. A manual toggle takes over from the auto behavior so a user who
// opens it to read isn't fought by the auto-collapse.

interface ReasoningBlockProps {
  reasoning: string;
  live: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const ReasoningBlock = ({ reasoning, live, t }: ReasoningBlockProps) => {
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const tailRef = useRef<HTMLDivElement>(null);

  // Effective open state: a manual choice wins; otherwise mirror `live`.
  const open = manualOpen ?? live;

  // Keep the live trace pinned to its newest line while streaming + open.
  useEffect(() => {
    if (open && live && tailRef.current) {
      tailRef.current.scrollTop = tailRef.current.scrollHeight;
    }
  }, [open, live, reasoning]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        borderLeft: '2px solid var(--border-2)',
        paddingLeft: 12,
      }}
    >
      <button
        type="button"
        onClick={() => setManualOpen(!open)}
        aria-expanded={open}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          alignSelf: 'flex-start',
          background: 'transparent',
          border: 'none',
          padding: '2px 0',
          cursor: 'pointer',
          color: 'var(--text-dim)',
          fontFamily: 'var(--font-sans)',
        }}
      >
        {live && (
          <span className="nn-spin" aria-hidden>
            <NNIcon name="sparkle" size={12} color="var(--violet-400)" />
          </span>
        )}
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}
        >
          {t('chat.reasoning.label')}
        </span>
        <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>
          {open ? t('chat.reasoning.hide') : t('chat.reasoning.show')}
        </span>
        <span
          style={{
            display: 'inline-flex',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 140ms ease',
          }}
        >
          <NNIcon name="chevd" size={12} color="var(--text-dim)" />
        </span>
      </button>
      {open && (
        <div
          ref={tailRef}
          className="nn-scroll"
          style={{
            maxHeight: live ? 180 : 320,
            overflowY: 'auto',
            fontFamily: 'var(--font-sans)',
            fontSize: 12.5,
            lineHeight: 1.6,
            color: 'var(--text-dim)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {reasoning}
        </div>
      )}
    </div>
  );
};

// ── Condensed activity group: step row + collapsible wrapper (Codex-like) ─────
// Hand-rolled (no UI lib — Principle 4). The group is a single timed, collapsible
// work block wrapping one assistant turn's tool steps; each step is a COMPACT ROW
// (icon + human label + optional monospace arg + status chip), expandable to its
// body. `NNCard` is reserved for the step BODY, never the row header (AC1.4). The
// step body REUSES verbatim the CitationCard/RichCard (the only card sink),
// WebSearchResultText (untrusted), and ConfirmControls (Phase B) of the old
// per-call card, plus a post-apply write-summary line (S5 / AC5.1).

interface ToolActivityStepProps {
  toolCall: ToolCallVM;
  resolveCard: (cardId: string) => Card | undefined;
  deckNameById: Map<string, string>;
  /** Answer this step's pending confirmation (Phase B; payload = per-card
   *  selections + feedback from the confirm editor). */
  onConfirm: (decision: 'apply' | 'reject', payload?: ConfirmPayload) => void;
  /** Jump to a cited card in /cards (AC3.6). */
  onOpenCard?: (cardId: string) => void;
  /** Open a deck's cards in /cards (post-create exit when no card id, P3.7). */
  onOpenDeckCards?: (deckName: string) => void;
  /** A source citation chip was clicked (search_source results, M2). */
  onSourceCitation?: (c: SourceCitation) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const ToolActivityStep = ({
  toolCall,
  resolveCard,
  deckNameById,
  onConfirm,
  onOpenCard,
  onOpenDeckCards,
  onSourceCitation,
  t,
}: ToolActivityStepProps) => {
  const [open, setOpen] = useState(false);
  // Human-readable verb-phrase label + optional monospace arg (NO UUID/JSON).
  const { labelKey, params, argMono } = toolLabel(toolCall.name, toolCall.args, {
    resolveCardFront: (cardId) => {
      const card = resolveCard(cardId);
      // The card's front text isn't directly available as a string here; the
      // first field value is the closest human-readable front for the label.
      const fields = card?.note?.fieldValues;
      if (fields) {
        const first = Object.values(fields).find((v) => typeof v === 'string' && v.trim());
        if (typeof first === 'string') return first.trim().slice(0, 80);
      }
      return undefined;
    },
    deckName: (deckId) => deckNameById.get(deckId),
  });
  const label = t(labelKey, params);
  const isWebSearch = toolCall.name === 'web_search';
  const cardCitations = toolCall.citations ?? [];
  const hasResultContent =
    cardCitations.length > 0 || (toolCall.result ?? '').trim().length > 0;
  // A body exists when there's something to expand: cited cards, a textual result,
  // a pending confirmation, or a post-apply summary line (S5).
  const hasBody =
    hasResultContent ||
    !!toolCall.awaitingConfirmation ||
    !!toolCall.applySummary;
  // PostApplySummary is the ONLY visible body element (no citations/result) → omit
  // its bottom margin so the NNCard padding isn't doubled at the bottom.
  const summaryIsLast = !!toolCall.applySummary && !hasResultContent && !toolCall.awaitingConfirmation;

  // An undecided pending write is "awaiting confirmation", NOT "running" — on
  // reload the spinner would otherwise imply server work that isn't happening.
  const pendingConfirm = !!toolCall.awaitingConfirmation && !toolCall.decision;
  const statusTone = pendingConfirm
    ? 'amber'
    : toolCall.status === 'ok'
      ? 'lime'
      : toolCall.status === 'error'
        ? 'rose'
        : 'neutral';
  const statusText = pendingConfirm
    ? t('chat.tool.awaiting')
    : toolCall.status === 'ok'
      ? t('chat.tool.done')
      : toolCall.status === 'error'
        ? t('chat.tool.failed')
        : t('chat.tool.running');

  // Awaiting-confirmation steps must show their Apply/Reject body without a click.
  const bodyOpen = open || !!toolCall.awaitingConfirmation;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* Compact row header — NOT an NNCard. Click toggles the body. */}
      <button
        type="button"
        onClick={() => hasBody && setOpen((v) => !v)}
        aria-expanded={hasBody ? bodyOpen : undefined}
        disabled={!hasBody}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          minWidth: 0,
          width: '100%',
          textAlign: 'left',
          background: 'transparent',
          border: 'none',
          padding: '4px 2px',
          cursor: hasBody ? 'pointer' : 'default',
        }}
      >
        <NNIcon name={toolIcon(toolCall.name)} size={14} color="var(--violet-400)" />
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0, flex: 1 }}>
          <span
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: 'var(--text)',
              fontFamily: 'var(--font-sans)',
              flexShrink: 0,
            }}
          >
            {label}
          </span>
          {/* A query arg is rendered in --font-mono for a code-like Codex feel (AC3.2). */}
          {argMono && (
            <span
              title={argMono}
              style={{
                fontSize: 12,
                color: 'var(--text-dim)',
                fontFamily: 'var(--font-mono)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
              }}
            >
              {argMono}
            </span>
          )}
        </span>
        {/* Status chip: pause while awaiting approval, spinner while running,
            ✓/✕ once resolved. */}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          {pendingConfirm ? (
            <NNIcon name="pause" size={13} color="var(--amber-400)" />
          ) : toolCall.status === 'running' ? (
            <span className="nn-spin" aria-hidden>
              <NNIcon name="sync" size={13} color="var(--text-dim)" />
            </span>
          ) : (
            <NNIcon
              name={toolCall.status === 'ok' ? 'check' : 'x'}
              size={13}
              color={toolCall.status === 'ok' ? 'var(--lime-400)' : 'var(--rose-400)'}
            />
          )}
          <NNBadge tone={statusTone} size="xs">
            {statusText}
          </NNBadge>
          {hasBody && (
            <span
              style={{
                display: 'inline-flex',
                transform: bodyOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 140ms ease',
              }}
            >
              <NNIcon name="chevd" size={12} color="var(--text-dim)" />
            </span>
          )}
        </span>
      </button>

      {/* Step body — NNCard is reserved for the BODY (AC1.4). */}
      {hasBody && bodyOpen && (
        <NNCard padding={12} style={{ background: 'var(--surface-2)' }}>
          {/* Phase B: confirm-before-write controls (reused verbatim). */}
          {toolCall.awaitingConfirmation && (
            <ConfirmControls toolCall={toolCall} onConfirm={onConfirm} t={t} />
          )}

          {/* Post-apply write summary line (S5 / AC5.1) — a single line, NOT a
              diff card. Only after an APPLIED create/edit; reject renders nothing. */}
          {toolCall.applySummary && (
            <PostApplySummary
              summary={toolCall.applySummary}
              deckNameById={deckNameById}
              onOpenCard={onOpenCard}
              onOpenDeckCards={onOpenDeckCards}
              noBottomMargin={summaryIsLast}
              t={t}
            />
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* search_cards → cited cards through the ONLY card sink (RichCard);
                search_source → source-passage chips (M2). */}
            {!isWebSearch &&
              cardCitations.map((cit, ci) =>
                isSourceCitation(cit) ? (
                  <SourceCitationChip
                    key={`src-${cit.sourceChunkId}-${ci}`}
                    citation={cit}
                    onClick={onSourceCitation}
                    t={t}
                  />
                ) : (
                  <CitationCard
                    key={`card-${cit.chunkId}-${ci}`}
                    citation={cit}
                    card={resolveCard(cit.cardId)}
                    deckName={cit.deckId ? deckNameById.get(cit.deckId) : undefined}
                    onOpenCard={onOpenCard}
                    t={t}
                  />
                ),
              )}
            {/* search_cards with a textual summary but no cited cards (genuine
                no-hit / error) → render the one-line summary as plain text. */}
            {!isWebSearch &&
              cardCitations.length === 0 &&
              (toolCall.result ?? '').length > 0 && (
                <WebSearchResultText text={toolCall.result ?? ''} />
              )}
            {/* web_search → UNTRUSTED: plain-text result with scheme-validated links. */}
            {isWebSearch && (toolCall.result ?? '').length > 0 && (
              <WebSearchResultText text={toolCall.result ?? ''} />
            )}
          </div>
        </NNCard>
      )}
    </div>
  );
};

// ── Post-apply write-summary line (S5 / AC5.1) ───────────────────────────────
// A single line after an APPLIED create/edit: "Created N cards in ‹deck› · open"
// / "Card updated · open" with a jump-link reusing onOpenCard → /cards?focus=.
// NOT a diff card. Reject path renders nothing (no applySummary set).

interface PostApplySummaryProps {
  summary: NonNullable<ToolCallVM['applySummary']>;
  deckNameById: Map<string, string>;
  onOpenCard?: (cardId: string) => void;
  /** Open the deck's cards in /cards — the create exit when no card id is known. */
  onOpenDeckCards?: (deckName: string) => void;
  /** Omit the bottom margin when this is the only element in the step body. */
  noBottomMargin?: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const PostApplySummary = ({ summary, deckNameById, onOpenCard, onOpenDeckCards, noBottomMargin, t }: PostApplySummaryProps) => {
  const deckName = summary.deckId ? deckNameById.get(summary.deckId) : undefined;
  // Four create variants: ±deck name (an unresolved deck must NOT leave an
  // «in  · open» hole) × singular/plural (proper phrasing for count=1).
  const count = summary.count ?? 1;
  const createKey =
    count === 1
      ? deckName
        ? 'chat.activity.appliedCreatedOne'
        : 'chat.activity.appliedCreatedOneNodeck'
      : deckName
        ? 'chat.activity.appliedCreated'
        : 'chat.activity.appliedCreatedNodeck';
  const text =
    summary.kind === 'create'
      ? t(createKey, { count, deck: deckName ?? '' })
      : t('chat.activity.appliedEdited');
  // Visible exit to the new/edited cards (P3.7): edit → /cards?focus=<id>; create
  // has no card id in-frame (the tool result is text-only), so fall back to the
  // deck filter /cards?q=deck:"<name>" when the deck resolves. No deck / no id ⇒
  // the line stays informational (no jump), exactly as before.
  const canOpen =
    summary.kind === 'edit'
      ? Boolean(summary.cardId && onOpenCard)
      : Boolean(deckName && onOpenDeckCards);
  const open = () => {
    if (summary.kind === 'edit') {
      if (summary.cardId) onOpenCard?.(summary.cardId);
    } else if (deckName) {
      onOpenDeckCards?.(deckName);
    }
  };
  return (
    <button
      type="button"
      onClick={open}
      disabled={!canOpen}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        alignSelf: 'flex-start',
        background: 'transparent',
        border: 'none',
        padding: '2px 0',
        marginBottom: noBottomMargin ? 0 : 6,
        cursor: canOpen ? 'pointer' : 'default',
        color: 'var(--lime-400)',
        fontFamily: 'var(--font-sans)',
        fontSize: 12.5,
        fontWeight: 600,
      }}
    >
      <NNIcon name="check" size={13} color="var(--lime-400)" />
      {text}
      {canOpen && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, opacity: 0.85 }}>
          · {t('chat.message.openCard')}
        </span>
      )}
    </button>
  );
};

// ── Condensed activity group (collapsible wrapper, Codex-like / AC1.1–1.3) ────
// Always wraps the turn's toolCalls[] (Decision A1). The header is the single
// collapse toggle: a work icon, a one-line summary ("Worked for Ns" once finished
// + `elapsedMs` present; live "working…" + nn-spin while live), the total step
// count (= raw step count = sum of summarizeSteps group counts), and overall
// status. Collapse state is driven ENTIRELY by groupHeaderState (Change 5):
// `manualOpen ?? (initialOpen || live)` (mirrors ReasoningBlock). Single-step
// renders light (no "N steps") + auto-expanded; multi-step collapses-on-answer.

interface ToolActivityGroupProps {
  toolCalls: ToolCallVM[];
  /** Turn-level wall-clock duration (ephemeral; absent on reload ⇒ no "Worked for Ns"). */
  elapsedMs?: number;
  streaming: boolean;
  answerStarted: boolean;
  resolveCard: (cardId: string) => Card | undefined;
  deckNameById: Map<string, string>;
  onConfirm: (toolCallId: string, decision: 'apply' | 'reject', payload?: ConfirmPayload) => void;
  onOpenCard?: (cardId: string) => void;
  onOpenDeckCards?: (deckName: string) => void;
  onSourceCitation?: (c: SourceCitation) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const ToolActivityGroup = ({
  toolCalls,
  elapsedMs,
  streaming,
  answerStarted,
  resolveCard,
  deckNameById,
  onConfirm,
  onOpenCard,
  onOpenDeckCards,
  onSourceCitation,
  t,
}: ToolActivityGroupProps) => {
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const singleStep = toolCalls.length === 1;
  // Force open when ANY step is awaiting confirmation so Apply/Reject is never
  // hidden behind a closed multi-step group (AC1.4).
  const anyAwaiting = toolCalls.some((c) => c.awaitingConfirmation);
  const { status, live, initialOpen } = groupHeaderState(toolCalls, {
    streaming,
    answerStarted,
    singleStepAutoOpen: singleStep,
    anyAwaiting,
  });
  // Effective open state: a manual choice wins; else auto (initialOpen || live || anyAwaiting).
  const open = manualOpen ?? (initialOpen || live || anyAwaiting);

  const groups = summarizeSteps(toolCalls);
  const totalSteps = toolCalls.length;
  // Per-tool pluralized phrase for a single CONTIGUOUS run of the same tool with a
  // `_n` plural key (AC2.2: "Reviewed 7 cards"). Only when the whole group is one
  // contiguous run (groups.length === 1) of count >= 2 and a `_n` key exists.
  // PLURAL_TOOL_NAMES is the single source (imported from chat-activity).
  const dominantPhrase =
    groups.length === 1 && groups[0]!.count >= 2 && PLURAL_TOOL_NAMES.has(groups[0]!.name)
      ? t(`chat.tool.${groups[0]!.name}_n`, { count: groups[0]!.count })
      : null;

  // Header summary line: live → "Working…"; finished with timing → "Worked for Ns";
  // finished without timing (reload) → the step count / pluralized phrase carries
  // it. Single-step is light (no "N steps" pluralization).
  const timeText =
    elapsedMs != null && !live ? t('chat.activity.worked', { time: formatElapsed(elapsedMs, t) }) : null;
  const countText = dominantPhrase ?? (singleStep ? '' : t('chat.activity.steps', { count: totalSteps }));
  const summaryText = live ? t('chat.activity.working') : (timeText ?? countText);
  // For a finished turn that ALSO has timing, surface the count/phrase as a suffix.
  const stepSuffix = !live && timeText && countText ? countText : null;

  const statusColor =
    status === 'error'
      ? 'var(--rose-400)'
      : status === 'running'
        ? 'var(--text-dim)'
        : 'var(--lime-400)';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-md)',
        background: 'var(--surface)',
        padding: '8px 12px',
      }}
    >
      {/* Header — the single collapse toggle for the whole work block. */}
      <button
        type="button"
        onClick={() => setManualOpen(!open)}
        aria-expanded={open}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          textAlign: 'left',
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
        }}
      >
        {live ? (
          <span className="nn-spin" aria-hidden>
            <NNIcon name="bolt" size={14} color="var(--violet-400)" />
          </span>
        ) : (
          <NNIcon name="bolt" size={14} color={statusColor} />
        )}
        <span
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 8,
            flex: 1,
            minWidth: 0,
            fontFamily: 'var(--font-sans)',
          }}
        >
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>
            {summaryText || t('chat.activity.steps', { count: totalSteps })}
          </span>
          {stepSuffix && (
            <span style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{stepSuffix}</span>
          )}
        </span>
        <span
          style={{
            display: 'inline-flex',
            flexShrink: 0,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 140ms ease',
          }}
        >
          <NNIcon name="chevd" size={12} color="var(--text-dim)" />
        </span>
      </button>

      {/* Collapsed body = each step enumerated (the summarizeSteps grouping only
          drives the header copy; the expanded list shows EACH step — AC2.2). */}
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {toolCalls.map((tc) => (
            <ToolActivityStep
              key={tc.id}
              toolCall={tc}
              resolveCard={resolveCard}
              deckNameById={deckNameById}
              onConfirm={(decision, payload) => onConfirm(tc.id, decision, payload)}
              onOpenCard={onOpenCard}
              onOpenDeckCards={onOpenDeckCards}
              onSourceCitation={onSourceCitation}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ── Confirm-before-write controls (Phase B / S10) ────────────────────────────
// Hand-rolled (no UI lib — Principle 4). Rendered inside a paused write/SRS
// tool-call card. Shows the dry-run blast radius ABOVE the Apply/Reject buttons
// so a destructive edit is confirmed knowingly; `willDelete` is surfaced
// PROMINENTLY (rose) because it loses FSRS history. Both buttons disable the
// instant one is clicked (`toolCall.decision` set) — the UI-side double-apply
// guard (the server enforces idempotency atomically too). Once a decision is
// chosen the controls collapse to a single status chip ("Applied"/"Rejected").

/** Per-card decisions + a note to the model, attached to a confirm answer. */
type ConfirmPayload = Pick<ChatResumeRequest, 'cardSelections' | 'feedback'>;

interface ConfirmControlsProps {
  toolCall: ToolCallVM;
  onConfirm: (decision: 'apply' | 'reject', payload?: ConfirmPayload) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const ConfirmControls = ({ toolCall, onConfirm, t }: ConfirmControlsProps) => {
  const decided = toolCall.decision != null;
  const impact = toolCall.impact;
  const willDelete = impact?.willDeleteCards ?? 0;
  const affectsSiblings = impact?.affectsSiblings === true;
  // Editable per-card draft (create_card only) — parsed from the ORIGINAL args
  // (full values; the capped impact preview is display-only). Null → read-only
  // preview as before (other tools / malformed args).
  const draft = useMemo(
    () => (toolCall.name === 'create_card' ? createCardDraft(toolCall.args) : null),
    [toolCall.name, toolCall.args],
  );
  const [cards, setCards] = useState<{ include: boolean; fieldValues: Record<string, string> }[]>(
    () => (draft ?? []).map((d) => ({ include: true, fieldValues: { ...d.fieldValues } })),
  );
  const [feedback, setFeedback] = useState('');

  // Wizard (batch only): the user decides cards ONE AT A TIME — accept/exclude/
  // edit the current card, then advance; the decisions accumulate locally and
  // leave as ONE resume (`cardSelections`) from the final review step.
  const wizard = draft !== null && draft.length > 1;
  const [decisions, setDecisions] = useState<('accepted' | 'excluded' | null)[]>(
    () => (draft ?? []).map(() => null),
  );
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<'cards' | 'review'>('cards');
  const acceptedCount = decisions.filter((d) => d === 'accepted').length;
  const excludedCount = decisions.filter((d) => d === 'excluded').length;

  const includedCount = wizard ? acceptedCount : cards.filter((c) => c.include).length;
  // B4/C8 — before/after previews (edit_card); create_card uses the editor when
  // the draft parsed, the capped preview rows otherwise.
  const diffRows = draft ? [] : confirmDiffRows(toolCall.name, impact);
  const willCreate = draft ? includedCount : (impact?.willCreateCards ?? 0);

  const setField = (cardIdx: number, field: string, value: string) =>
    setCards((prev) =>
      prev.map((c, i) =>
        i === cardIdx ? { ...c, fieldValues: { ...c.fieldValues, [field]: value } } : c,
      ),
    );
  const toggleCard = (cardIdx: number) =>
    setCards((prev) => prev.map((c, i) => (i === cardIdx ? { ...c, include: !c.include } : c)));

  // Decide the CURRENT wizard card and advance to the next undecided one (or
  // the review step once every card is decided). Re-deciding a visited card
  // overwrites and jumps forward to whatever is still undecided.
  const decide = (action: 'accepted' | 'excluded') => {
    const next = decisions.map((d, i) => (i === step ? action : d));
    setDecisions(next);
    const ni = nextUndecidedIndex(next, step);
    if (ni === -1) setPhase('review');
    else setStep(ni);
  };
  const jumpTo = (i: number) => {
    setStep(i);
    setPhase('cards');
  };

  const answer = (decision: 'apply' | 'reject') => {
    const fb = feedback.trim();
    const state = wizard
      ? cards.map((c, i) => ({ include: decisions[i] === 'accepted', fieldValues: c.fieldValues }))
      : cards;
    const selections = decision === 'apply' && draft ? buildCardSelections(draft, state) : [];
    const payload: ConfirmPayload = {
      cardSelections: selections.length > 0 ? selections : undefined,
      feedback: fb.length > 0 ? fb : undefined,
    };
    onConfirm(decision, payload.cardSelections || payload.feedback ? payload : undefined);
  };

  /** One-line excerpt for the review rows (first non-empty field). */
  const excerptOf = (fv: Record<string, string>): string =>
    (Object.values(fv).find((v) => v.trim()) ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);

  return (
    <div
      style={{
        marginTop: 10,
        paddingTop: 10,
        borderTop: '1px dashed var(--border-2)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: 'var(--amber-400)',
          fontFamily: 'var(--font-sans)',
        }}
      >
        {t('chat.confirm.pendingTitle')}
      </span>

      {/* What exactly changes / will be written — degrades silently when the
          payload is absent (old persisted rows, reload mid-pause). */}
      <ConfirmDiff rows={diffRows} proposalOnly={toolCall.name === 'create_card'} t={t} />

      {/* save_note proposal (Р14 / N3): a flat preview — title + a capped content
          excerpt. NOT the create_card wizard (notes aren't cards), no −/+ diff
          (it's a creation). Present only for a notebook save_note. */}
      {impact?.proposedNote && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: 'uppercase',
              color: 'var(--text-dim)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            {t('chat.confirm.noteTitle')}
          </span>
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--text)',
              fontFamily: 'var(--font-sans)',
              wordBreak: 'break-word',
            }}
          >
            {impact.proposedNote.title}
          </span>
          {impact.proposedNote.contentExcerpt.length > 0 && (
            <div
              style={{
                fontSize: 12,
                lineHeight: 1.5,
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-sans)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                padding: '6px 8px',
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-xs)',
              }}
            >
              {impact.proposedNote.contentExcerpt}
            </div>
          )}
        </div>
      )}

      {/* Source provenance (NotebookLM M3 / AC3.2): the passages the new card(s)
          will be LINKED to — «Источник: <title>, стр. N». Present only for a
          notebook create_card; absent everywhere else. */}
      {(impact?.provenance?.length ?? 0) > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: 'uppercase',
              color: 'var(--text-dim)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            {t('chat.confirm.provenanceTitle')}
          </span>
          {impact!.provenance!.map((p, i) => (
            <span
              key={`${p.chunkId}-${i}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-sans)',
              }}
            >
              <NNIcon name="doc" size={12} color="var(--sky-400)" />
              {p.page != null
                ? t('chat.confirm.provenanceRowPage', { title: p.sourceTitle, n: p.page })
                : t('chat.confirm.provenanceRow', { title: p.sourceTitle })}
            </span>
          ))}
        </div>
      )}

      {/* Single-card editor (create_card, one proposal): inline field edits.
          Built from the ORIGINAL args, so it works live AND after a reload. */}
      {draft && !wizard && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {cards.map((card, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 5,
                opacity: card.include ? 1 : 0.45,
                transition: 'opacity 120ms ease',
              }}
            >
              {!decided && !card.include && (
                <NNBtn size="sm" variant="ghost" icon="plus" onClick={() => toggleCard(i)}>
                  {t('chat.confirm.includeCard')}
                </NNBtn>
              )}
              {Object.entries(card.fieldValues).map(([field, value]) => (
                <label key={field} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 600,
                      letterSpacing: 0.6,
                      textTransform: 'uppercase',
                      color: 'var(--text-dim)',
                      fontFamily: 'var(--font-sans)',
                    }}
                  >
                    {field}
                  </span>
                  <textarea
                    value={value}
                    disabled={decided || !card.include}
                    onChange={(e) => setField(i, field, e.target.value)}
                    rows={Math.min(6, Math.max(1, Math.ceil(value.length / 70) + (value.match(/\n/g)?.length ?? 0)))}
                    style={{
                      width: '100%',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 12,
                      lineHeight: 1.5,
                      padding: '5px 8px',
                      borderRadius: 'var(--r-xs)',
                      border: '1px solid color-mix(in srgb, var(--lime-500) 25%, var(--border-2))',
                      background: 'color-mix(in srgb, var(--lime-500) 8%, transparent)',
                      color: 'var(--lime-300)',
                      resize: 'vertical',
                      outline: 'none',
                    }}
                  />
                </label>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Wizard (batch): ONE card at a time — accept / exclude / edit, then
          advance; a final review step fires the single resume. */}
      {wizard && !decided && phase === 'cards' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--text)',
                fontFamily: 'var(--font-sans)',
              }}
            >
              {t('chat.confirm.cardOf', { n: step + 1, total: cards.length })}
            </span>
            <span style={{ fontSize: 11.5, color: 'var(--text-dim)', fontFamily: 'var(--font-sans)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span>✓ {acceptedCount}</span>
              <span>✕ {excludedCount}</span>
              {decisions[step] !== null && (
                <NNBadge tone={decisions[step] === 'accepted' ? 'lime' : 'neutral'} size="xs">
                  {decisions[step] === 'accepted'
                    ? t('chat.confirm.acceptedBadge')
                    : t('chat.confirm.excludedBadge')}
                </NNBadge>
              )}
            </span>
          </div>
          {Object.entries(cards[step]?.fieldValues ?? {}).map(([field, value]) => (
            <label key={`${step}:${field}`} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 600,
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                  color: 'var(--text-dim)',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                {field}
              </span>
              <textarea
                value={value}
                onChange={(e) => setField(step, field, e.target.value)}
                rows={Math.min(8, Math.max(1, Math.ceil(value.length / 70) + (value.match(/\n/g)?.length ?? 0)))}
                style={{
                  width: '100%',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  lineHeight: 1.5,
                  padding: '5px 8px',
                  borderRadius: 'var(--r-xs)',
                  border: '1px solid color-mix(in srgb, var(--lime-500) 25%, var(--border-2))',
                  background: 'color-mix(in srgb, var(--lime-500) 8%, transparent)',
                  color: 'var(--lime-300)',
                  resize: 'vertical',
                  outline: 'none',
                }}
              />
            </label>
          ))}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <NNBtn size="sm" variant="primary" icon="check" onClick={() => decide('accepted')}>
              {t('chat.confirm.acceptCard')}
            </NNBtn>
            <NNBtn size="sm" variant="ghost" icon="x" onClick={() => decide('excluded')}>
              {t('chat.confirm.excludeCard')}
            </NNBtn>
            <span style={{ flex: 1 }} />
            {step > 0 && (
              <NNBtn size="sm" variant="ghost" onClick={() => setStep(step - 1)}>
                {t('chat.confirm.back')}
              </NNBtn>
            )}
          </div>
        </div>
      )}

      {/* Wizard review: every card decided — a clickable summary, the feedback
          note, and the single Apply(N)/Reject pair below. */}
      {wizard && !decided && phase === 'review' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {cards.map((card, i) => (
            <button
              key={i}
              type="button"
              onClick={() => jumpTo(i)}
              title={t('chat.confirm.reviewJump')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                textAlign: 'left',
                background: 'transparent',
                border: '1px solid var(--border-2)',
                borderRadius: 'var(--r-xs)',
                padding: '6px 9px',
                cursor: 'pointer',
                opacity: decisions[i] === 'excluded' ? 0.5 : 1,
              }}
            >
              <NNBadge tone={decisions[i] === 'accepted' ? 'lime' : 'neutral'} size="xs">
                {decisions[i] === 'accepted'
                  ? t('chat.confirm.acceptedBadge')
                  : t('chat.confirm.excludedBadge')}
              </NNBadge>
              <span
                style={{
                  fontSize: 12,
                  color: 'var(--text-muted)',
                  fontFamily: 'var(--font-sans)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  minWidth: 0,
                  textDecoration: decisions[i] === 'excluded' ? 'line-through' : 'none',
                }}
              >
                {t('chat.confirm.cardN', { n: i + 1 })} · {excerptOf(card.fieldValues)}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Optional note to the agent — "propose edits" without applying. Lands
          in the tool result on BOTH apply and reject. In the wizard it appears
          on the review step only. */}
      {!decided && (!wizard || phase === 'review') && (
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder={t('chat.confirm.feedbackPlaceholder')}
          rows={1}
          maxLength={2000}
          style={{
            width: '100%',
            fontFamily: 'var(--font-sans)',
            fontSize: 12.5,
            lineHeight: 1.5,
            padding: '6px 9px',
            borderRadius: 'var(--r-xs)',
            border: '1px solid var(--border-2)',
            background: 'var(--surface-3)',
            color: 'var(--text)',
            resize: 'vertical',
            outline: 'none',
          }}
        />
      )}

      {/* Blast radius — only the parts the dry-run predicted. DELETE is prominent.
          In the wizard it shows on the review step (live count of accepted cards). */}
      {(!wizard || phase === 'review' || decided) &&
        (willCreate > 0 || willDelete > 0 || affectsSiblings) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {willCreate > 0 && (
            <span
              style={{
                fontSize: 12.5,
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-sans)',
              }}
            >
              {t('chat.confirm.willCreate', { count: willCreate })}
            </span>
          )}
          {willDelete > 0 && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--rose-400)',
                fontFamily: 'var(--font-sans)',
              }}
            >
              <NNIcon name="x" size={13} color="var(--rose-400)" />
              {t('chat.confirm.willDelete', { count: willDelete })}
            </span>
          )}
          {affectsSiblings && (
            <span
              style={{
                fontSize: 12.5,
                color: 'var(--text-dim)',
                fontFamily: 'var(--font-sans)',
              }}
            >
              {t('chat.confirm.affectsSiblings')}
            </span>
          )}
        </div>
      )}

      {decided ? (
        // Once chosen, replace the buttons with a terminal status chip so the
        // decision is irreversible from the UI (no re-click path).
        <NNBadge tone={toolCall.decision === 'apply' ? 'lime' : 'neutral'} size="sm">
          {toolCall.decision === 'apply'
            ? t('chat.confirm.applied')
            : t('chat.confirm.rejected')}
        </NNBadge>
      ) : (
        // The single Apply/Reject pair: hidden mid-wizard (the per-card
        // accept/exclude buttons drive those steps), shown on review.
        (!wizard || phase === 'review') && (
          <div style={{ display: 'flex', gap: 8 }}>
            <NNBtn
              size="sm"
              variant="primary"
              icon="check"
              disabled={decided || (draft !== null && includedCount === 0)}
              onClick={() => answer('apply')}
            >
              {wizard ? t('chat.confirm.applyN', { count: includedCount }) : t('chat.confirm.apply')}
            </NNBtn>
            <NNBtn
              size="sm"
              variant="ghost"
              icon="x"
              disabled={decided}
              onClick={() => answer('reject')}
            >
              {t('chat.confirm.reject')}
            </NNBtn>
          </div>
        )
      )}
    </div>
  );
};

// ── Untrusted web-search result renderer (plain text + safe links) ───────────
// Brave title/snippet/url are attacker-influenced. We render the result string
// as PLAIN React text nodes — markup like `[x](javascript:)` or `<img onerror>`
// shows literally, never interpreted. Bare http(s) URLs found in the text are
// promoted to <a href> ONLY after `safeWebUrl` validates the scheme; any other
// scheme stays inert literal text. There is NO markdown / SafeHtml path here.

const URL_CANDIDATE_RE = /(https?:\/\/[^\s<>"']+)/gi;

const WebSearchResultText = ({ text }: { text: string }) => {
  // Split on URL candidates and interleave validated links with literal text.
  const parts = text.split(URL_CANDIDATE_RE);
  return (
    <div
      style={{
        fontFamily: 'var(--font-sans)',
        fontSize: 13,
        lineHeight: 1.55,
        color: 'var(--text-muted)',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {parts.map((part, i) => {
        // Odd indices are the captured URL candidates (split with one capture group).
        if (i % 2 === 1) {
          const href = safeWebUrl(part);
          if (href) {
            return (
              <a
                key={i}
                href={href}
                target="_blank"
                rel="noopener noreferrer nofollow"
                style={{ color: 'var(--sky-400)', wordBreak: 'break-all' }}
              >
                {part}
              </a>
            );
          }
          // Rejected scheme / malformed → inert literal text.
          return <React.Fragment key={i}>{part}</React.Fragment>;
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </div>
  );
};

// ── Compact dropdown menu (hand-rolled — no UI lib, Principle 4) ──────────────
// Shared by the model + deck-scope pickers. A trigger button opens a small
// absolutely-positioned popover above the composer; clicking outside or picking
// an option closes it. Inline styles + CSS vars; primitives from ui.tsx.

interface PickerMenuOption {
  id: string | null;
  label: string;
}

interface PickerMenuProps {
  /** Trigger label prefix (e.g. "Model"). */
  triggerLabel: string;
  /** Current selection's display label (shown after the prefix). */
  valueLabel: string;
  icon: 'bolt' | 'filter';
  options: PickerMenuOption[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

const PickerMenu = ({
  triggerLabel,
  valueLabel,
  icon,
  options,
  selectedId,
  onSelect,
}: PickerMenuProps) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Codex-style compact pill (S6 / AC6.1): leading glyph + value + chevron,
          --r-pill rounded. Cosmetic only — the menu/selection/persistence below
          are unchanged. Hand-rolled (inline + CSS vars, Principle 4). */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={triggerLabel}
        aria-label={triggerLabel}
        aria-expanded={open}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 10px',
          borderRadius: 'var(--r-pill)',
          border: '1px solid var(--border-2)',
          background: open ? 'var(--surface-3)' : 'var(--surface-2)',
          color: 'var(--text)',
          fontFamily: 'var(--font-sans)',
          fontSize: 12.5,
          fontWeight: 600,
          cursor: 'pointer',
          maxWidth: 220,
          transition: 'background 120ms ease',
        }}
      >
        <NNIcon name={icon} size={13} color="var(--text-dim)" />
        <span
          style={{
            maxWidth: 160,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {valueLabel}
        </span>
        <NNIcon name="chevd" size={12} color="var(--text-dim)" />
      </button>
      {open && (
        <div
          role="menu"
          className="nn-scroll"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 6px)',
            left: 0,
            minWidth: 180,
            maxWidth: 280,
            maxHeight: 280,
            overflowY: 'auto',
            padding: 4,
            borderRadius: 'var(--r-md)',
            border: '1px solid var(--border-2)',
            background: 'var(--surface)',
            boxShadow: 'var(--shadow-lg)',
            zIndex: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          {options.map((opt) => {
            const isSelected = opt.id === selectedId;
            return (
              <button
                key={opt.id ?? '__all__'}
                type="button"
                role="menuitemradio"
                aria-checked={isSelected}
                onClick={() => {
                  onSelect(opt.id);
                  setOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  padding: '8px 10px',
                  borderRadius: 'var(--r-sm)',
                  border: 'none',
                  cursor: 'pointer',
                  background: isSelected ? 'var(--surface-3)' : 'transparent',
                  color: 'var(--text)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 13,
                  textAlign: 'left',
                  width: '100%',
                }}
              >
                <span
                  style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {opt.label}
                </span>
                {isSelected && <NNIcon name="check" size={13} color="var(--lime-400)" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ── Model (reasoning-level) picker (S3 / AC2.4) ──────────────────────────────
// Rendered only when status.models is non-empty. Selecting an option persists it
// as last-used; the chosen model rides every turn (send / resume / regenerate).

interface ModelPickerProps {
  models: ChatModelOption[];
  value: string | null;
  onSelect: (id: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const ModelPicker = ({ models, value, onSelect, t }: ModelPickerProps) => {
  const current = models.find((m) => m.id === value) ?? models.find((m) => m.default) ?? models[0];
  return (
    <PickerMenu
      triggerLabel={t('chat.composer.model')}
      valueLabel={current ? current.label : t('chat.composer.model')}
      icon="bolt"
      options={models.map((m) => ({ id: m.id, label: m.label }))}
      selectedId={current?.id ?? null}
      onSelect={(id) => {
        if (id) onSelect(id);
      }}
    />
  );
};

// ── Deep-research mode toggle ─────────────────────────────────────────────────
// A pill TOGGLE (not a dropdown) next to the pickers: active ⇒ every turn rides
// `research: true` (research prompt + raised step/budget caps server-side).
// Sticky via localStorage; hidden when the server has no fetch_page tool.

interface ResearchToggleProps {
  active: boolean;
  onToggle: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const ResearchToggle = ({ active, onToggle, t }: ResearchToggleProps) => (
  <button
    type="button"
    onClick={onToggle}
    title={t('chat.composer.researchHint')}
    aria-pressed={active}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '5px 10px',
      borderRadius: 'var(--r-pill)',
      border: active
        ? '1px solid color-mix(in srgb, var(--violet-400) 55%, transparent)'
        : '1px solid var(--border-2)',
      background: active
        ? 'color-mix(in srgb, var(--violet-500) 16%, var(--surface-2))'
        : 'var(--surface-2)',
      color: active ? 'var(--violet-300)' : 'var(--text)',
      fontFamily: 'var(--font-sans)',
      fontSize: 12.5,
      fontWeight: 600,
      cursor: 'pointer',
      transition: 'background 120ms ease, border-color 120ms ease, color 120ms ease',
    }}
  >
    <NNIcon name="doc" size={13} color={active ? 'var(--violet-300)' : 'var(--text-dim)'} />
    <span>{t('chat.composer.research')}</span>
  </button>
);

// ── Deck-scope picker (S7 / AC3.7) ───────────────────────────────────────────
// An optional, clearable deck scope sent as the turn-level deckId. "All cards"
// clears it (deckId undefined ⇒ global retrieval, today's behavior).

interface DeckScopePickerProps {
  decks: { id: string; name: string }[];
  value: string | null;
  onSelect: (id: string | null) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const DeckScopePicker = ({ decks, value, onSelect, t }: DeckScopePickerProps) => {
  const current = decks.find((d) => d.id === value);
  return (
    <PickerMenu
      triggerLabel={t('chat.composer.deckScope')}
      valueLabel={current ? current.name : t('chat.composer.allDecks')}
      icon="filter"
      options={[
        { id: null, label: t('chat.composer.allDecks') },
        ...decks.map((d) => ({ id: d.id, label: d.name })),
      ]}
      selectedId={value}
      onSelect={onSelect}
    />
  );
};
