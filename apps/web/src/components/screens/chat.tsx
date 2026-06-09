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
import type { Citation } from '@neuronexus/shared';
import { CARD_TOKEN_RE as CARD_TOKEN_CORE_RE } from '@neuronexus/shared';
import { NNBtn, NNCard, NNIcon, NNSkeleton, NNBadge } from '@/components/ui';
import { RichCard } from '@/components/rich-card';
import { renderCardHtml, SafeHtml } from '@/lib/render-card';
import { api, ok } from '@/lib/api';
import { streamChat } from '@/lib/chat-stream';
import { cardFromApi } from '@/lib/mappers';
import { useNN } from '@/lib/store';
import type { Card } from '@/lib/types';
import { useBreakpoint } from '@/lib/use-breakpoint';
import { useT } from '@/lib/i18n';
import { useDialog } from '@/components/dialog';

// ── Screen-local view models (Eden serializes dates → ISO strings) ───────────

interface ConversationVM {
  id: string;
  title: string | null;
  updatedAt: string;
}

// One agentic tool call surfaced as a card in the stream. `args` is the parsed
// (or raw) argument object the model emitted; `result` is a one-line summary for
// the collapsible body; `citations` are the cited cards (search_cards only) /
// web results (web_search only) attached after the tool resolves.
interface ToolCallVM {
  id: string;
  name: string;
  args: unknown;
  status: 'running' | 'ok' | 'error';
  /** One-line human summary from the tool_result frame (optional). */
  result?: string;
  /** Cited cards for search_cards (rendered via RichCard — the only card sink). */
  citations?: Citation[];
}

interface MessageVM {
  id: string;
  // `tool` only appears on reload reconstruction — a persisted role:'tool' row is
  // folded into its parent assistant message's toolCalls, never rendered as its
  // own bubble (see openThread reconstruction rule).
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  citations: Citation[];
  /** Streamed reasoning trace for this assistant turn (ephemeral, never persisted). */
  reasoning?: string;
  /** Tool calls made during this assistant turn, in call order. */
  toolCalls?: ToolCallVM[];
  /** True while tokens are still streaming into this assistant message. */
  streaming?: boolean;
}

type AiStatus = {
  embeddingEnabled: boolean;
  chatEnabled: boolean;
  degraded: boolean;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function conversationTitle(c: ConversationVM, fallback: string): string {
  const trimmed = (c.title ?? '').trim();
  return trimmed.length > 0 ? trimmed : fallback;
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

// ── Persisted-row → view-model reconstruction (reload) ───────────────────────
// Eden serializes the message rows verbatim, so a reloaded transcript carries
// the wire shape: a `user` row, an `assistant` row whose `toolCalls` is non-null
// (its `content` is the `''` sentinel), one `role:'tool'` row per result (its
// `content` is the JSON-stringified tool result, linked by `toolCallId`), then
// the final `assistant` text row (`toolCalls` null). The reconstruction rule
// (S6 step 5) folds those back into the UI view models WITHOUT ever leaking a
// sentinel or a JSON-in-content tool row as a blank/garbled bubble:
//   • user                              → a user bubble
//   • assistant w/ non-null toolCalls   → an assistant VM carrying tool-call
//                                          cards (REGARDLESS of content)
//   • role:'tool'                       → folded into its parent's matching
//                                          tool call by toolCallId (never its
//                                          own bubble)
//   • assistant w/ null toolCalls       → prose
interface PersistedMessageRow {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  citations?: Citation[] | null;
  toolCalls?: { id: string; name: string; arguments: string }[] | null;
  toolCallId?: string | null;
}

// Parse a persisted `role:'tool'` row's `content` into a UI status + summary.
// The backend stores the tool's model-facing TEXT on success (plain, capped) and
// `JSON.stringify({ ok:false, error })` on failure — so a JSON `{ ok:false }`
// payload is a failed call, anything else is a successful text result. Per-call
// citations are NOT in this content (they ride the turn-level `citation` event /
// the final assistant row), so they're not reconstructed here. Best-effort: a
// malformed/legacy payload degrades to a bare summary, never throws.
function parseToolResultContent(content: string): { ok: boolean; summary?: string } {
  if (content.length === 0) return { ok: true };
  try {
    const parsed = JSON.parse(content) as { ok?: boolean; error?: string; summary?: string };
    // A structured failure envelope from the loop.
    if (parsed && typeof parsed === 'object' && parsed.ok === false) {
      const summary =
        typeof parsed.error === 'string'
          ? parsed.error
          : typeof parsed.summary === 'string'
            ? parsed.summary
            : undefined;
      return { ok: false, summary };
    }
    // JSON but not a failure envelope — fall through to treat as text below.
  } catch {
    // Not JSON — the common case (success text). Fall through.
  }
  return { ok: true, summary: content };
}

function parseToolArgs(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function reconstructMessages(rows: PersistedMessageRow[]): MessageVM[] {
  const out: MessageVM[] = [];
  // The last assistant VM that carries tool calls — role:'tool' rows attach here.
  let pendingToolHost: MessageVM | null = null;

  for (const row of rows) {
    const citations = Array.isArray(row.citations) ? row.citations : [];

    if (row.role === 'tool') {
      // A tool-result row — fold into its parent's matching tool call. Never a bubble.
      const parsed = parseToolResultContent(row.content);
      const host = pendingToolHost;
      const tc = host?.toolCalls?.find((c) => c.id === row.toolCallId);
      if (tc) {
        tc.status = parsed.ok ? 'ok' : 'error';
        if (parsed.summary !== undefined) tc.result = parsed.summary;
      }
      continue;
    }

    if (row.role === 'assistant' && row.toolCalls && row.toolCalls.length > 0) {
      // Tool-call row — render as tool-call cards regardless of content (sentinel).
      const vm: MessageVM = {
        id: row.id,
        role: 'assistant',
        content: '',
        citations: [],
        toolCalls: row.toolCalls.map((c) => ({
          id: c.id,
          name: c.name,
          args: parseToolArgs(c.arguments),
          status: 'ok' as const,
        })),
      };
      out.push(vm);
      pendingToolHost = vm;
      continue;
    }

    // user OR assistant-prose OR system → a normal bubble.
    out.push({
      id: row.id,
      role: row.role,
      content: row.content,
      citations,
    });
    // A fresh prose/user turn closes the tool-result attachment window.
    pendingToolHost = null;
  }

  return out;
}

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

export const NNChat = () => {
  const t = useT();
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';
  const { confirm } = useDialog();

  // Store mirror (read-only here): cards for citation resolution, decks for names.
  const cards = useNN((s) => s.cards);
  const decks = useNN((s) => s.decks);

  const [status, setStatus] = useState<AiStatus | null>(null);
  const [statusLoaded, setStatusLoaded] = useState(false);

  const [conversations, setConversations] = useState<ConversationVM[]>([]);
  const [conversationsLoaded, setConversationsLoaded] = useState(false);
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

  // Resolved cards for citations outside the store mirror (cardId → Card).
  const [fetchedCards, setFetchedCards] = useState<Record<string, Card>>({});

  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Effects ─────────────────────────────────────────────────────────────────

  // AI status + conversation list, lazy on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = (await ok(await (api as any).ai.status.get())) as AiStatus;
        if (!cancelled) setStatus(s);
      } catch {
        if (!cancelled) setStatus({ embeddingEnabled: false, chatEnabled: false, degraded: false });
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
    const userMsgId = `local-user-${Date.now()}`;
    const assistantMsgId = `local-assistant-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: 'user', content, citations: [] },
      { id: assistantMsgId, role: 'assistant', content: '', citations: [], streaming: true },
    ]);

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

    await streamChat(convId!, content, {
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
      // A tool call started — append a running card (idempotent on id).
      onToolCall: (tc) =>
        patchToolCalls((calls) =>
          calls.some((c) => c.id === tc.id)
            ? calls
            : [...calls, { id: tc.id, name: tc.name, args: tc.args, status: 'running' }],
        ),
      // A tool finished — flip status, attach the one-line summary + citations.
      onToolResult: (tr) =>
        patchToolCalls((calls) =>
          calls.map((c) =>
            c.id === tr.id
              ? {
                  ...c,
                  status: tr.ok ? 'ok' : 'error',
                  result: tr.summary ?? c.result,
                  citations: tr.citations ?? c.citations,
                }
              : c,
          ),
        ),
      // Coarse phase hint — drives the live status line under the placeholder.
      onStatus: (phase) => setStreamPhase(phase),
      // Turn-level citation set (union-deduped server-side, intersected with
      // emitted [card:<id>] tokens) — the collapsible "sources" block below.
      onCitation: (citations) => patchAssistant({ citations }),
      onDone: () => {
        patchAssistant({ streaming: false });
        setStreamPhase(null);
      },
      onError: (message) => {
        patchAssistant({
          streaming: false,
          content:
            message === 'ai_disabled'
              ? t('chat.errors.disabled')
              : t('chat.errors.generic'),
        });
        setStreamPhase(null);
      },
    });

    // Bump this thread to the top (server already bumped updatedAt on done).
    setConversations((prev) => {
      const found = prev.find((c) => c.id === convId);
      if (!found) return prev;
      const rest = prev.filter((c) => c.id !== convId);
      return [{ ...found, updatedAt: new Date().toISOString() }, ...rest];
    });
    setSending(false);
  }, [activeId, draft, sending, t]);

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
                return (
                  <div
                    key={c.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openThread(c.id)}
                    onKeyDown={(e) => {
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
                        flexShrink: 0,
                      }}
                    >
                      <NNIcon name="x" size={14} />
                    </button>
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
                {messages.map((m) => (
                  <MessageRow
                    key={m.id}
                    message={m}
                    phase={m.streaming ? streamPhase : null}
                    resolveCard={resolveCard}
                    deckNameById={deckNameById}
                    t={t}
                  />
                ))}
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
                alignItems: 'flex-end',
                gap: 10,
                maxWidth: 760,
                width: '100%',
                margin: '0 auto',
              }}
            >
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
              <NNBtn
                variant="primary"
                size="lg"
                icon="arrow"
                onClick={() => void send()}
                disabled={sending || draft.trim().length === 0}
              >
                {sending ? t('chat.composer.sending') : t('chat.composer.send')}
              </NNBtn>
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
  t: (key: string, params?: Record<string, string | number>) => string;
}

const MessageRow = ({ message, phase = null, resolveCard, deckNameById, t }: MessageRowProps) => {
  const isUser = message.role === 'user';
  // Cited cards are collapsed by default (they can be large); a count summary
  // toggles the full RichCard list. Hook declared before the user-message early
  // return so it's always called in the same order.
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const toolCalls = message.toolCalls ?? [];
  const hasReasoning = (message.reasoning ?? '').trim().length > 0;
  // While the turn is still streaming and the final answer hasn't begun, the
  // thinking placeholder shows; once any prose/tool work exists it gives way.
  const isStreaming = !!message.streaming;
  const answerStarted = message.content.length > 0;

  if (isUser) {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div
          style={{
            maxWidth: '78%',
            padding: '10px 14px',
            borderRadius: 'var(--r-lg)',
            background: 'var(--surface-3)',
            color: 'var(--text)',
            fontFamily: 'var(--font-sans)',
            fontSize: 14,
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {message.content}
        </div>
      </div>
    );
  }

  // Assistant turn: model prose (above) is visibly separate from the cited cards
  // (below), making own-vs-general content distinguishable (AC3).
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
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

      {/* Tool-call cards (search_cards / web_search) — one per call, in call
          order, ABOVE the prose so the work the agent did is visible. */}
      {toolCalls.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {toolCalls.map((tc) => (
            <ToolCallCard
              key={tc.id}
              toolCall={tc}
              resolveCard={resolveCard}
              deckNameById={deckNameById}
              t={t}
            />
          ))}
        </div>
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
                t={t}
              />
            ))}
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
  t: (key: string, params?: Record<string, string | number>) => string;
}

const CitationCard = ({ citation, card, deckName, t }: CitationCardProps) => (
  <NNCard padding={14} style={{ background: 'var(--surface-2)' }}>
    {(deckName || card) && (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        {deckName && (
          <NNBadge tone="lime" size="xs">
            {deckName}
          </NNBadge>
        )}
      </div>
    )}
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

// ── One agentic tool-call card ───────────────────────────────────────────────
// Hand-rolled (no UI lib). Header: tool name + a short args summary + status
// (spinner while running → ✓ ok / ✕ error). Collapsible body: for search_cards
// the cited cards render through the EXISTING CitationCard/RichCard path (the
// only card sink). For web_search the result is rendered as PLAIN TEXT — an
// untrusted sink — with bare URLs linkified only after https?: scheme validation.

const TOOL_LABEL_KEY: Record<string, string> = {
  search_cards: 'chat.tool.search_cards',
  web_search: 'chat.tool.web_search',
};

// Build a one-line args summary without trusting the model's arg shape. For the
// known read tools the most useful field is the query string; fall back to a
// compact JSON for anything else. Rendered as a plain React text node.
function toolArgsSummary(name: string, args: unknown): string {
  if (args && typeof args === 'object') {
    const q = (args as Record<string, unknown>).query;
    if (typeof q === 'string' && q.trim().length > 0) return q.trim();
  }
  if (typeof args === 'string') return args;
  try {
    const json = JSON.stringify(args);
    return json && json !== '{}' ? json : '';
  } catch {
    return '';
  }
}

interface ToolCallCardProps {
  toolCall: ToolCallVM;
  resolveCard: (cardId: string) => Card | undefined;
  deckNameById: Map<string, string>;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const ToolCallCard = ({ toolCall, resolveCard, deckNameById, t }: ToolCallCardProps) => {
  const [open, setOpen] = useState(false);
  const labelKey = TOOL_LABEL_KEY[toolCall.name];
  const label = labelKey ? t(labelKey) : toolCall.name;
  const argsSummary = toolArgsSummary(toolCall.name, toolCall.args);
  const isWebSearch = toolCall.name === 'web_search';
  const cardCitations = toolCall.citations ?? [];
  // A body exists when there's something to expand: cited cards (search_cards) or
  // a textual result (web_search / any tool's one-line summary).
  const hasBody = cardCitations.length > 0 || (toolCall.result ?? '').trim().length > 0;

  const statusTone =
    toolCall.status === 'ok' ? 'lime' : toolCall.status === 'error' ? 'rose' : 'neutral';
  const statusText =
    toolCall.status === 'ok'
      ? t('chat.tool.done')
      : toolCall.status === 'error'
        ? t('chat.tool.failed')
        : t('chat.tool.running');

  return (
    <NNCard padding={12} style={{ background: 'var(--surface-2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <NNIcon
          name={isWebSearch ? 'link' : 'search'}
          size={14}
          color="var(--violet-400)"
        />
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
          <span
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: 'var(--text)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            {label}
          </span>
          {argsSummary.length > 0 && (
            <span
              style={{
                fontSize: 12,
                color: 'var(--text-dim)',
                fontFamily: 'var(--font-sans)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={argsSummary}
            >
              {argsSummary}
            </span>
          )}
        </div>
        {/* Status pill: spinner while running, ✓/✕ once resolved. */}
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
        </span>
      </div>

      {/* Collapsible result body. */}
      {hasBody && (
        <div style={{ marginTop: 10 }}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              alignSelf: 'flex-start',
              background: 'transparent',
              border: 'none',
              padding: '2px 0',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 600 }}>{t('chat.tool.resultToggle')}</span>
            <span
              style={{
                display: 'inline-flex',
                transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 140ms ease',
              }}
            >
              <NNIcon name="chevd" size={12} color="var(--text-muted)" />
            </span>
          </button>
          {open && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              {/* search_cards → cited cards through the ONLY card sink (RichCard). */}
              {!isWebSearch &&
                cardCitations.map((cit) => (
                  <CitationCard
                    key={cit.chunkId}
                    citation={cit}
                    card={resolveCard(cit.cardId)}
                    deckName={cit.deckId ? deckNameById.get(cit.deckId) : undefined}
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
          )}
        </div>
      )}
    </NNCard>
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
