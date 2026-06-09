'use client';

// NNChat — the grounded RAG chat screen (Slice 5).
//
//  • Thread list (left) + message stream (right), responsive.
//  • Conversations are lazy-loaded HERE on mount (NOT in bootstrap — chat is a
//    separate concern and bootstrap stays fast). All state is screen-local.
//  • List / open / create / delete go through Eden (lib/api.ts). Sending a
//    message goes through the RAW fetch+reader path (lib/chat-stream.ts) because
//    Eden can't consume a stream. Tokens render live as they arrive (AC6).
//  • On mount we read GET /ai/status; chatEnabled:false → a setup notice instead
//    of the composer (degrade, never crash — Principle 5).
//  • Citations render through RichCard (Principle 4 / AC8): the cited card's
//    FRONT is rendered by RichCard, resolved from the store mirror first, falling
//    back to GET /cards/:id (Eden) when outside the ≤500-row mirror. NEVER raw
//    HTML. Model prose sits ABOVE the cited-card block so own-vs-general content
//    is visibly separated (AC3).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Citation, ChatModelOption } from '@neuronexus/shared';
import { CARD_TOKEN_RE as CARD_TOKEN_CORE_RE } from '@neuronexus/shared';
import { NNBtn, NNCard, NNIcon, NNSkeleton, NNBadge } from '@/components/ui';
import { RichCard } from '@/components/rich-card';
import { renderCardHtml, SafeHtml } from '@/lib/render-card';
import { api, ok } from '@/lib/api';
import {
  regenerateChat,
  resumeChat,
  streamChat,
  type ChatStreamHandlers,
} from '@/lib/chat-stream';
import {
  applySummaryFrom,
  formatElapsed,
  groupHeaderState,
  hasAnswerlessUserTail,
  PLURAL_TOOL_NAMES,
  reconstructMessages,
  summarizeSteps,
  toolIcon,
  toolLabel,
  type MessageVM,
  type PersistedMessageRow,
  type ToolCallVM,
} from '@/lib/chat-activity';
import { cardFromApi } from '@/lib/mappers';
import { useNN } from '@/lib/store';
import type { Card } from '@/lib/types';
import { useBreakpoint } from '@/lib/use-breakpoint';
import { useT, useLocale } from '@/lib/i18n';
import { useDialog } from '@/components/dialog';
import { raiseToast } from '@/components/toasts';

// ── Screen-local view models (Eden serializes dates → ISO strings) ───────────

interface ConversationVM {
  id: string;
  title: string | null;
  updatedAt: string;
}

// The view-model + persisted-row types (`MessageVM`, `ToolCallVM`,
// `PersistedMessageRow`) and the pure reconstruction/parse helpers now live in
// `@/lib/chat-activity` (ONE definition each — re-imported above). This screen
// only wires them into JSX.

type AiStatus = {
  embeddingEnabled: boolean;
  chatEnabled: boolean;
  degraded: boolean;
  /** Model allow-list for the per-turn picker (AC2.2). `[]` ⇒ picker hidden. */
  models: ChatModelOption[];
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function conversationTitle(c: ConversationVM, fallback: string): string {
  const trimmed = (c.title ?? '').trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

// Hand-rolled relative-duration formatter (no dep — Principle 4). Returns the
// localized "updated N ago" line from an ISO timestamp, using the chat i18n
// dictionary for the unit words (so en/ru both read naturally). `t` is the
// translator; the unit count is interpolated via `{count}`. Anything in the
// future or unparseable collapses to "just now".
function relativeUpdated(
  iso: string | undefined,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (!iso) return '';
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  // Under a minute reads as a bare "just now" — wrapping it in "updated … ago"
  // would be redundant ("updated just now ago"), so return it standalone.
  if (diffMs < 60_000) return t('chat.threads.relativeNow');
  let time: string;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) {
    time = t('chat.threads.relativeMinutes', { count: mins });
  } else {
    const hours = Math.floor(mins / 60);
    if (hours < 24) {
      time = t('chat.threads.relativeHours', { count: hours });
    } else {
      time = t('chat.threads.relativeDays', { count: Math.floor(hours / 24) });
    }
  }
  return t('chat.threads.updatedAgo', { time });
}

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
function stripCardTokens(text: string): string {
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

const AssistantMarkdown = ({ content }: { content: string }) => {
  const html = useMemo(
    () => renderCardHtml(CHAT_MD_NOTE_TYPE, { Body: stripCardTokens(content) }, 'front'),
    [content],
  );
  return (
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
  );
};

// ── Component ──────────────────────────────────────────────────────────────────

// localStorage key for the last-used model selection (re-validated on load).
const MODEL_LS_KEY = 'nn:chat:model';

export const NNChat = () => {
  const t = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';
  const { confirm } = useDialog();

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
  // Inline-rename state (AC3.1): the thread id being edited + its draft title.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageVM[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
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

  // Resolved cards for citations outside the store mirror (cardId → Card).
  const [fetchedCards, setFetchedCards] = useState<Record<string, Card>>({});

  const scrollRef = useRef<HTMLDivElement>(null);
  // AbortController for the in-flight turn (S6 stop). Held in a ref so the Stop
  // button can abort the same controller the active send/resume/regenerate owns.
  const abortRef = useRef<AbortController | null>(null);

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
        }
      } catch {
        if (!cancelled)
          setStatus({ embeddingEnabled: false, chatEnabled: false, degraded: false, models: [] });
      } finally {
        if (!cancelled) setStatusLoaded(true);
      }
      try {
        const res = (await ok(await (api as any).chat.conversations.get())) as {
          items: ConversationVM[];
        };
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
  }, []);

  // Keep the stream pinned to the bottom as tokens / messages arrive.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

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

  const openThread = useCallback(async (id: string) => {
    setActiveId(id);
    setComposing(true);
    setThreadLoading(true);
    try {
      const res = (await ok(await (api as any).chat.conversations({ id }).get())) as {
        messages: PersistedMessageRow[];
      };
      // Reconstruct the agentic transcript from the persisted wire shape: tool-call
      // rows become cards, role:'tool' rows fold into their parent, the '' sentinel
      // and JSON-in-content tool rows never leak as blank/garbled bubbles.
      setMessages(reconstructMessages(res.messages ?? []));
    } catch {
      setMessages([]);
    } finally {
      setThreadLoading(false);
    }
  }, []);

  // Start a fresh chat: clear the active thread and (on mobile) reveal the
  // stream pane with an empty state + composer.
  const newThread = useCallback(() => {
    setActiveId(null);
    setMessages([]);
    setDraft('');
    setComposing(true);
  }, []);

  // Mobile-only: leave the stream pane and return to the thread list.
  const backToList = useCallback(() => {
    setActiveId(null);
    setMessages([]);
    setComposing(false);
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
        setActiveId(null);
        setMessages([]);
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

  // Inline rename (AC3.1): PATCH the conversation title via Eden, update the
  // local list optimistically. An empty title is ignored (server would 400 it).
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

  const startRename = useCallback((c: ConversationVM) => {
    setRenamingId(c.id);
    setRenameDraft((c.title ?? '').trim());
  }, []);

  // Commit the inline rename (Enter / blur). Empty draft just cancels.
  const commitRename = useCallback(() => {
    const id = renamingId;
    if (!id) return;
    const draftTitle = renameDraft;
    setRenamingId(null);
    setRenameDraft('');
    if (draftTitle.trim().length > 0) void renameThread(id, draftTitle);
  }, [renamingId, renameDraft, renameThread]);

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
        onDone: () => {
          // Finalize the turn timer off the ORIGINAL turnStartedAt (T-accumulate).
          finalizeTurn({ streaming: false });
          setStreamPhase(null);
          // Bump this thread to the top (server already bumped updatedAt on done).
          setConversations((prev) => {
            const found = prev.find((c) => c.id === convId);
            if (!found) return prev;
            const rest = prev.filter((c) => c.id !== convId);
            return [{ ...found, updatedAt: new Date().toISOString() }, ...rest];
          });
        },
        onError: (message) => {
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

  // Answer a paused write/SRS tool call (Phase B / S10). Apply runs the mutation
  // server-side then continues the loop; Reject records a "rejected" result so
  // the model answers without mutating. The SAME stream handlers are re-attached
  // (via buildStreamHandlers) so the continued turn renders into the same bubble.
  const confirmToolCall = useCallback(
    async (assistantMsgId: string, toolCallId: string, decision: 'apply' | 'reject') => {
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
        { resumeToolCallId: toolCallId, decision, model: model ?? undefined },
        buildStreamHandlers(assistantMsgId, convId),
        controller.signal,
      );
      setSending(false);
    },
    [activeId, buildStreamHandlers, model],
  );

  const send = useCallback(async () => {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    setDraft('');

    // Ensure a conversation exists (create on first message of a new thread).
    let convId = activeId;
    if (!convId) {
      try {
        const created = (await ok(
          await (api as any).chat.conversations.post({ title: content.slice(0, 80) }),
        )) as ConversationVM;
        convId = created.id;
        setActiveId(created.id);
        setConversations((prev) => [created, ...prev]);
      } catch {
        setSending(false);
        setDraft(content);
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
      { id: userMsgId, role: 'user', content, citations: [], createdAt: new Date().toISOString() },
      {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        citations: [],
        streaming: true,
        turnStartedAt: Date.now(),
      },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;
    await streamChat(convId!, content, buildStreamHandlers(assistantMsgId, convId!), {
      model: model ?? undefined,
      deckId: deckScope ?? undefined,
      signal: controller.signal,
    });

    setSending(false);
  }, [activeId, draft, sending, buildStreamHandlers, model, deckScope]);

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
  }, []);

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
        },
      ];
    });
    const controller = new AbortController();
    abortRef.current = controller;
    await regenerateChat(
      convId,
      { model: model ?? undefined, deckId: deckScope ?? undefined },
      buildStreamHandlers(assistantMsgId, convId),
      controller.signal,
    );
    setSending(false);
  }, [activeId, sending, buildStreamHandlers, model, deckScope]);

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
          },
        ];
      });
      const controller = new AbortController();
      abortRef.current = controller;
      await regenerateChat(
        convId,
        { model: model ?? undefined, deckId: deckScope ?? undefined, content: trimmed },
        buildStreamHandlers(assistantMsgId, convId),
        controller.signal,
      );
      setSending(false);
    },
    [activeId, sending, messages, buildStreamHandlers, model, deckScope],
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
      {/* Thread list. On mobile it's the full screen until the user opens or
          starts a chat (`composing`); on desktop it's always the left rail. */}
      {(!isMobile || !composing) && (
        <aside
          style={{
            width: isMobile ? '100%' : 268,
            flexShrink: 0,
            borderRight: isMobile ? 'none' : '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--surface)',
          }}
        >
          <div
            style={{
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              borderBottom: '1px solid var(--border)',
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 1.4,
                textTransform: 'uppercase',
                color: 'var(--text-dim)',
                fontFamily: 'var(--font-sans)',
              }}
            >
              {t('chat.threads.title')}
            </span>
            <NNBtn size="sm" variant="soft" icon="plus" onClick={newThread}>
              {t('chat.threads.newThread')}
            </NNBtn>
          </div>
          <div className="nn-scroll" style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
            {!conversationsLoaded ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 4 }}>
                <NNSkeleton height={38} />
                <NNSkeleton height={38} />
                <NNSkeleton height={38} />
              </div>
            ) : conversations.length === 0 ? (
              <p
                style={{
                  fontSize: 13,
                  color: 'var(--text-dim)',
                  padding: '12px 8px',
                  margin: 0,
                }}
              >
                {t('chat.threads.empty')}
              </p>
            ) : (
              conversations.map((c) => {
                const isActive = c.id === activeId;
                const isRenaming = renamingId === c.id;
                return (
                  <div
                    key={c.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (!isRenaming) openThread(c.id);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      startRename(c);
                    }}
                    onKeyDown={(e) => {
                      if (isRenaming) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openThread(c.id);
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 6,
                      padding: '9px 10px',
                      borderRadius: 'var(--r-md)',
                      cursor: 'pointer',
                      background: isActive ? 'var(--surface-3)' : 'transparent',
                      transition: 'background 120ms ease',
                    }}
                  >
                    {isRenaming ? (
                      <input
                        autoFocus
                        value={renameDraft}
                        maxLength={200}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            commitRename();
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            setRenamingId(null);
                            setRenameDraft('');
                          }
                        }}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          padding: '4px 8px',
                          borderRadius: 'var(--r-sm)',
                          border: '1px solid var(--border-2)',
                          background: 'var(--surface-2)',
                          color: 'var(--text)',
                          fontFamily: 'var(--font-sans)',
                          fontSize: 13.5,
                          outline: 'none',
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          minWidth: 0,
                          gap: 1,
                          flex: 1,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 13.5,
                            fontWeight: isActive ? 600 : 500,
                            color: isActive ? 'var(--text)' : 'var(--text-muted)',
                            fontFamily: 'var(--font-sans)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {conversationTitle(c, t('chat.threads.untitled'))}
                        </span>
                        {relativeUpdated(c.updatedAt, t) && (
                          <span
                            style={{
                              fontSize: 10.5,
                              color: 'var(--text-dim)',
                              fontFamily: 'var(--font-sans)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {relativeUpdated(c.updatedAt, t)}
                          </span>
                        )}
                      </div>
                    )}
                    {!isRenaming && (
                      <span style={{ display: 'inline-flex', gap: 2, flexShrink: 0 }}>
                        <button
                          type="button"
                          aria-label={t('chat.threads.rename')}
                          title={t('chat.threads.rename')}
                          onClick={(e) => {
                            e.stopPropagation();
                            startRename(c);
                          }}
                          style={{
                            display: 'flex',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--text-dim)',
                            padding: 2,
                          }}
                        >
                          <NNIcon name="edit" size={14} />
                        </button>
                        <button
                          type="button"
                          aria-label={t('chat.threads.delete')}
                          title={t('chat.threads.delete')}
                          onClick={(e) => {
                            e.stopPropagation();
                            void deleteThread(c.id);
                          }}
                          style={{
                            display: 'flex',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--text-dim)',
                            padding: 2,
                          }}
                        >
                          <NNIcon name="x" size={14} />
                        </button>
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </aside>
      )}

      {/* Message stream + composer. On mobile it replaces the list while
          composing; on desktop it's always the right pane. */}
      {(!isMobile || composing) && (
        <section style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {isMobile && (
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
              <NNBtn size="sm" variant="ghost" icon="chevl" onClick={backToList}>
                {t('chat.threads.title')}
              </NNBtn>
            </div>
          )}

          <div
            ref={scrollRef}
            className="nn-scroll"
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: isMobile ? '16px 14px' : '24px 28px',
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
            }}
          >
            {threadLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 760, width: '100%', margin: '0 auto' }}>
                <NNSkeleton height={48} />
                <NNSkeleton height={96} />
              </div>
            ) : messages.length === 0 ? (
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
              </div>
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
                  <MessageRow
                    key={m.id}
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
                    onRegenerate={() => void regenerate()}
                    // Edit-and-rerun only on the LAST user message, when idle (AC4.1).
                    canEdit={m.role === 'user' && i === messages.length - 1 && !sending}
                    onEdit={(text) => void editAndRegenerate(text)}
                    onOpenCard={(cardId) => router.push(`/cards?focus=${cardId}`)}
                    locale={locale}
                    t={t}
                  />
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
              </div>
            )}
          </div>

          {/* Composer */}
          <div
            style={{
              borderTop: '1px solid var(--border)',
              padding: isMobile ? '10px 12px' : '14px 28px',
              background: 'var(--surface)',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                maxWidth: 760,
                width: '100%',
                margin: '0 auto',
              }}
            >
              {/* Per-turn controls: model (reasoning) picker + deck scope. The model
                  picker is hidden entirely when no allow-list is configured
                  (status.models empty) — chat is then identical to today. */}
              {((status?.models?.length ?? 0) > 0 || sortedDecks.length > 0) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {(status?.models?.length ?? 0) > 0 && (
                    <ModelPicker
                      models={status?.models ?? []}
                      value={model}
                      onSelect={selectModel}
                      t={t}
                    />
                  )}
                  {sortedDecks.length > 0 && (
                    <DeckScopePicker
                      decks={sortedDecks}
                      value={deckScope}
                      onSelect={setDeckScope}
                      t={t}
                    />
                  )}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  placeholder={t('chat.composer.placeholder')}
                  rows={1}
                  style={{
                    flex: 1,
                    resize: 'none',
                    minHeight: 42,
                    maxHeight: 160,
                    padding: '10px 14px',
                    borderRadius: 'var(--r-md)',
                    border: '1px solid var(--border-2)',
                    background: 'var(--surface-2)',
                    color: 'var(--text)',
                    fontFamily: 'var(--font-sans)',
                    fontSize: 14,
                    lineHeight: 1.45,
                    outline: 'none',
                  }}
                />
                {/* Send toggles to Stop while a turn is in flight (S6 / AC3.3). */}
                {sending ? (
                  <NNBtn variant="danger" size="lg" icon="pause" onClick={stopTurn}>
                    {t('chat.composer.stop')}
                  </NNBtn>
                ) : (
                  <NNBtn
                    variant="primary"
                    size="lg"
                    icon="arrow"
                    onClick={() => void send()}
                    disabled={draft.trim().length === 0}
                  >
                    {t('chat.composer.send')}
                  </NNBtn>
                )}
              </div>
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
  onConfirm: (assistantMsgId: string, toolCallId: string, decision: 'apply' | 'reject') => void;
  /** Show the regenerate action (only on the last, finished assistant message). */
  canRegenerate?: boolean;
  /** Copy this message's clean prose to the clipboard (assistant only). */
  onCopy?: () => void;
  /** Regenerate the last assistant turn (assistant only). */
  onRegenerate?: () => void;
  /** Show the edit-and-rerun affordance (only on the last user message). */
  canEdit?: boolean;
  /** Edit-and-rerun the last user message with the edited text (AC4.1/4.2). */
  onEdit?: (text: string) => void;
  /** Open a cited card in /cards (jump-to-card, AC3.6). */
  onOpenCard?: (cardId: string) => void;
  /** Active locale for absolute-timestamp formatting on hover. */
  locale: string;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const MessageRow = ({
  message,
  phase = null,
  resolveCard,
  deckNameById,
  onConfirm,
  canRegenerate = false,
  onCopy,
  onRegenerate,
  canEdit = false,
  onEdit,
  onOpenCard,
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
            className="nn-chat-user-bubble"
            title={formatTimestamp(message.createdAt, locale)}
            style={{
              display: 'inline-flex',
              alignItems: 'flex-start',
              gap: 6,
              maxWidth: '78%',
            }}
          >
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
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 'var(--r-lg)',
                background: 'var(--surface-3)',
                color: 'var(--text)',
                fontFamily: 'var(--font-sans)',
                fontSize: 14,
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                minWidth: 0,
              }}
            >
              {message.content}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Assistant turn: model prose (above) is visibly separate from the cited cards
  // (below), making own-vs-general content distinguishable (AC3).
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        title={formatTimestamp(message.createdAt, locale)}
        style={{ display: 'flex', alignItems: 'center', gap: 7 }}
      >
        <NNIcon name="sparkle" size={15} color="var(--violet-400)" />
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 1,
            textTransform: 'uppercase',
            color: 'var(--text-dim)',
            fontFamily: 'var(--font-sans)',
          }}
        >
          {t('chat.stream.assistant')}
        </span>
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
          onConfirm={(toolCallId, decision) => onConfirm(message.id, toolCallId, decision)}
          onOpenCard={onOpenCard}
          t={t}
        />
      )}

      {/* Model prose rendered as Markdown (same pipeline as cards, via SafeHtml).
          The inline [card:<id>] grounding tokens are stripped — the sources are
          shown in the collapsible block below. */}
      {answerStarted ? (
        <AssistantMarkdown content={message.content} />
      ) : isStreaming ? (
        <span style={{ fontSize: 13, color: 'var(--text-dim)', fontStyle: 'italic' }}>
          {phase === 'calling_tool'
            ? t('chat.tool.running')
            : t('chat.stream.thinking')}
        </span>
      ) : null}

      {/* Cited cards — collapsed by default into a count summary (they can be
          large); expandable to the full RichCard list (AC8), clearly delimited
          as "from your cards" so they're visibly distinct from the prose above. */}
      {message.citations.length > 0 && (
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
            message.citations.map((cit) => (
              <CitationCard
                key={cit.chunkId}
                citation={cit}
                card={resolveCard(cit.cardId)}
                deckName={cit.deckId ? deckNameById.get(cit.deckId) : undefined}
                onOpenCard={onOpenCard}
                t={t}
              />
            ))}
        </div>
      )}

      {/* Per-message actions: copy clean prose + (last assistant only) regenerate.
          Only on a finished assistant turn that has prose. */}
      {!isStreaming && answerStarted && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <NNBtn
            size="sm"
            variant="ghost"
            icon="stack"
            ariaLabel={t('chat.message.copy')}
            title={t('chat.message.copy')}
            onClick={() => onCopy?.()}
          >
            {t('chat.message.copy')}
          </NNBtn>
          {canRegenerate && (
            <NNBtn
              size="sm"
              variant="ghost"
              icon="sync"
              ariaLabel={t('chat.message.regenerate')}
              title={t('chat.message.regenerate')}
              onClick={() => onRegenerate?.()}
            >
              {t('chat.message.regenerate')}
            </NNBtn>
          )}
        </div>
      )}
    </div>
  );
};

// ── One cited card (RichCard front, or snippet fallback) ─────────────────────

interface CitationCardProps {
  citation: Citation;
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
  /** Answer this step's pending confirmation (Phase B). */
  onConfirm: (decision: 'apply' | 'reject') => void;
  /** Jump to a cited card in /cards (AC3.6). */
  onOpenCard?: (cardId: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const ToolActivityStep = ({
  toolCall,
  resolveCard,
  deckNameById,
  onConfirm,
  onOpenCard,
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

  const statusTone =
    toolCall.status === 'ok' ? 'lime' : toolCall.status === 'error' ? 'rose' : 'neutral';
  const statusText =
    toolCall.status === 'ok'
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
        {/* Status chip: spinner while running, ✓/✕ once resolved (reused verbatim). */}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          {toolCall.status === 'running' ? (
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
              noBottomMargin={summaryIsLast}
              t={t}
            />
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* search_cards → cited cards through the ONLY card sink (RichCard). */}
            {!isWebSearch &&
              cardCitations.map((cit) => (
                <CitationCard
                  key={cit.chunkId}
                  citation={cit}
                  card={resolveCard(cit.cardId)}
                  deckName={cit.deckId ? deckNameById.get(cit.deckId) : undefined}
                  onOpenCard={onOpenCard}
                  t={t}
                />
              ))}
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
  /** Omit the bottom margin when this is the only element in the step body. */
  noBottomMargin?: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const PostApplySummary = ({ summary, deckNameById, onOpenCard, noBottomMargin, t }: PostApplySummaryProps) => {
  const deckName = summary.deckId ? deckNameById.get(summary.deckId) : undefined;
  const text =
    summary.kind === 'create'
      ? t('chat.activity.appliedCreated', {
          count: summary.count ?? 1,
          deck: deckName ?? '',
        })
      : t('chat.activity.appliedEdited');
  return (
    <button
      type="button"
      onClick={() => summary.cardId && onOpenCard?.(summary.cardId)}
      disabled={!summary.cardId || !onOpenCard}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        alignSelf: 'flex-start',
        background: 'transparent',
        border: 'none',
        padding: '2px 0',
        marginBottom: noBottomMargin ? 0 : 6,
        cursor: summary.cardId && onOpenCard ? 'pointer' : 'default',
        color: 'var(--lime-400)',
        fontFamily: 'var(--font-sans)',
        fontSize: 12.5,
        fontWeight: 600,
      }}
    >
      <NNIcon name="check" size={13} color="var(--lime-400)" />
      {text}
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
  onConfirm: (toolCallId: string, decision: 'apply' | 'reject') => void;
  onOpenCard?: (cardId: string) => void;
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
              onConfirm={(decision) => onConfirm(tc.id, decision)}
              onOpenCard={onOpenCard}
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

interface ConfirmControlsProps {
  toolCall: ToolCallVM;
  onConfirm: (decision: 'apply' | 'reject') => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const ConfirmControls = ({ toolCall, onConfirm, t }: ConfirmControlsProps) => {
  const decided = toolCall.decision != null;
  const impact = toolCall.impact;
  const willCreate = impact?.willCreateCards ?? 0;
  const willDelete = impact?.willDeleteCards ?? 0;
  const affectsSiblings = impact?.affectsSiblings === true;

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

      {/* Blast radius — only the parts the dry-run predicted. DELETE is prominent. */}
      {(willCreate > 0 || willDelete > 0 || affectsSiblings) && (
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
        <div style={{ display: 'flex', gap: 8 }}>
          <NNBtn
            size="sm"
            variant="primary"
            icon="check"
            disabled={decided}
            onClick={() => onConfirm('apply')}
          >
            {t('chat.confirm.apply')}
          </NNBtn>
          <NNBtn
            size="sm"
            variant="ghost"
            icon="x"
            disabled={decided}
            onClick={() => onConfirm('reject')}
          >
            {t('chat.confirm.reject')}
          </NNBtn>
        </div>
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
