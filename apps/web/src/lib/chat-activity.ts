// Pure helper module for the Codex-like condensed agent transcript (chat redesign).
//
// This module holds ALL pure, React-free logic the chat screen needs so it can be
// unit-tested via `bun test` (this repo has no chat component-render harness — see
// the plan, Principle P3). The chat screen (`chat.tsx`) re-imports the moved types
// + helpers and wires them into JSX.
//
// MOVED here (one definition each, no type split): the view-model + persisted-row
// TYPES (`MessageVM`, `ToolCallVM`, `PersistedMessageRow`) and the pure
// reconstruction/parse helpers (`reconstructMessages`, `parseToolArgs`,
// `parseToolResultContent`, `hasAnswerlessUserTail`, `WRITE_SRS_TOOL_NAMES`,
// `TOOL_LABEL_KEY`).
//
// NEW pure functions for the redesign: `toolLabel`, `formatElapsed`,
// `summarizeSteps`, `groupHeaderState`, `applySummaryFrom`, `dropTrailingExchange`,
// `TOOL_ICON_KEY`.

import type { Citation } from '@neuronexus/shared';
import type { IconName } from '@/components/ui';

// ── View models (Eden serializes dates → ISO strings) ────────────────────────

// One agentic tool call surfaced in the stream. `args` is the parsed (or raw)
// argument object the model emitted; `result` is a one-line summary for the
// collapsible body; `citations` are the cited cards (search_cards only) / web
// results (web_search only) attached after the tool resolves.
export interface ToolCallVM {
  id: string;
  name: string;
  args: unknown;
  status: 'running' | 'ok' | 'error';
  /** One-line human summary from the tool_result frame (optional). */
  result?: string;
  /** Cited cards for search_cards (rendered via RichCard — the only card sink). */
  citations?: Citation[];
  // ── Phase B: confirm-before-write (S10) ────────────────────────────────────
  /**
   * True while this write/SRS tool call is paused awaiting human approval (the
   * `await_confirmation` frame arrived and the stream closed with no `done`).
   * The card renders Apply/Reject controls + the blast-radius summary.
   */
  awaitingConfirmation?: boolean;
  /** Dry-run blast radius from the `await_confirmation` frame (rendered above Apply). */
  impact?: { willDeleteCards?: number; willCreateCards?: number; affectsSiblings?: boolean };
  /**
   * The decision the user picked, once clicked. Set IMMEDIATELY on click so both
   * buttons disable and a double-apply can't be issued from the UI side (the
   * server has its own atomic backstop, but this prevents the second request).
   */
  decision?: 'apply' | 'reject';
  // ── Codex-like redesign (ephemeral; never persisted, not on the wire) ───────
  /** Wall-clock ms when `onToolCall` fired for this step. */
  startedAt?: number;
  /** Wall-clock ms span from `startedAt` to `onToolResult` (stamped, NOT rendered). */
  durationMs?: number;
  /** Post-apply write summary (create/edit), rendered as a single line in the step body. */
  applySummary?: ApplySummary;
}

export interface MessageVM {
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
  /** ISO createdAt of the persisted row — surfaced as a hover title on the message timestamp. */
  createdAt?: string;
  // ── Codex-like redesign timing (T-accumulate single-stamp; ephemeral) ───────
  /** Wall-clock ms stamped ONCE when this turn's host placeholder is created. */
  turnStartedAt?: number;
  /** Computed turn duration: `Date.now() - turnStartedAt`, set only at onDone/onError. */
  elapsedMs?: number;
}

// Persisted-row wire shape (Eden serializes message rows verbatim).
export interface PersistedMessageRow {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  citations?: Citation[] | null;
  toolCalls?: { id: string; name: string; arguments: string }[] | null;
  toolCallId?: string | null;
  createdAt?: string | null;
}

// ── Tool label / icon maps ────────────────────────────────────────────────────

// Per-tool verb-phrase label key (single source — NO `chat.tool.label.*` split).
export const TOOL_LABEL_KEY: Record<string, string> = {
  search_cards: 'chat.tool.search_cards',
  web_search: 'chat.tool.web_search',
  card_progress: 'chat.tool.card_progress',
  study_stats: 'chat.tool.study_stats',
  list_decks: 'chat.tool.list_decks',
  browse_cards: 'chat.tool.browse_cards',
  get_card: 'chat.tool.get_card',
};

// Tool names that have a `chat.tool.<name>_n` plural key for contiguous-run header
// phrases (AC2.2: "Reviewed 7 cards"). Single source — `ToolActivityGroup` imports
// this instead of maintaining a local Set.
export const PLURAL_TOOL_NAMES = new Set(['get_card', 'card_progress', 'browse_cards']);

// Tool-type icon map (AC3.1) — parallel to TOOL_LABEL_KEY. Reuses existing
// NNIcon names only (no new icons). Default fallback is `bolt`.
export const TOOL_ICON_KEY: Record<string, IconName> = {
  get_card: 'brain',
  card_progress: 'brain',
  list_decks: 'stack',
  browse_cards: 'stack',
  study_stats: 'target',
  web_search: 'link',
  search_cards: 'search',
};

/** Resolve a tool's icon, falling back to `bolt` for unknown tool names. */
export function toolIcon(name: string): IconName {
  return TOOL_ICON_KEY[name] ?? 'bolt';
}

// ── Parse helpers (MOVED from chat.tsx) ──────────────────────────────────────

// Parse a persisted `role:'tool'` row's `content` into a UI status + summary.
// The backend stores the tool's model-facing TEXT on success (plain, capped) and
// `JSON.stringify({ ok:false, error })` on failure — so a JSON `{ ok:false }`
// payload is a failed call, anything else is a successful text result.
export function parseToolResultContent(content: string): { ok: boolean; summary?: string } {
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

export function parseToolArgs(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

// Write/SRS tool names — these PAUSE the loop for human approval (Phase B).
export const WRITE_SRS_TOOL_NAMES = new Set([
  'create_card',
  'edit_card',
  'suspend',
  'set_due',
  'forget',
]);

// ── Persisted-row → view-model reconstruction (reload) ───────────────────────
// Folds the persisted wire shape back into the grouped UI view models WITHOUT
// ever leaking a sentinel or a JSON-in-content tool row as a blank/garbled bubble:
//   • user                              → a user bubble
//   • assistant w/ non-null toolCalls   → an assistant VM carrying tool-call cards
//   • role:'tool'                       → folded into its parent's matching tool call
//   • assistant w/ null toolCalls       → prose
export function reconstructMessages(rows: PersistedMessageRow[]): MessageVM[] {
  const out: MessageVM[] = [];
  // The last assistant VM that carries tool calls — role:'tool' rows attach here.
  let pendingToolHost: MessageVM | null = null;
  // Tool calls still awaiting a role:'tool' row across the whole transcript; the
  // post-pass promotes the unresolved write/SRS ones to awaitingConfirmation.
  const unresolved: ToolCallVM[] = [];

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
        // Resolved — drop it from the unresolved set.
        const idx = unresolved.indexOf(tc);
        if (idx !== -1) unresolved.splice(idx, 1);
      }
      continue;
    }

    if (row.role === 'assistant' && row.toolCalls && row.toolCalls.length > 0) {
      // Tool-call row — render as tool-call cards regardless of content (sentinel).
      // Start each call as `running`; a following role:'tool' row resolves it.
      const calls: ToolCallVM[] = row.toolCalls.map((c) => ({
        id: c.id,
        name: c.name,
        args: parseToolArgs(c.arguments),
        status: 'running' as const,
      }));
      const vm: MessageVM = {
        id: row.id,
        role: 'assistant',
        content: '',
        citations: [],
        toolCalls: calls,
        createdAt: row.createdAt ?? undefined,
      };
      out.push(vm);
      pendingToolHost = vm;
      for (const c of calls) unresolved.push(c);
      continue;
    }

    // user OR assistant-prose OR system → a normal bubble.
    out.push({
      id: row.id,
      role: row.role,
      content: row.content,
      citations,
      createdAt: row.createdAt ?? undefined,
    });
    // A fresh prose/user turn closes the tool-result attachment window.
    pendingToolHost = null;
  }

  // Post-pass: any unresolved tool call is a tool that never got its result row.
  // A write/SRS one is a suspended-pending-write → re-render Apply/Reject so the
  // user can resume it (impact isn't persisted, so the blast-radius is omitted
  // on reload — the buttons still drive resumeChat). A read tool left unresolved
  // is a torn transcript; mark it errored rather than spin forever.
  for (const tc of unresolved) {
    if (WRITE_SRS_TOOL_NAMES.has(tc.name)) {
      tc.awaitingConfirmation = true;
    } else {
      tc.status = 'error';
    }
  }

  return out;
}

// The abort/regenerate cliff: the user row is pre-committed server-side (before
// streaming), but the assistant turn only commits at end-of-stream. So an
// aborted/torn turn leaves a TRAILING `user` message with NO following assistant
// row — a question with no answer. Detect it so the "stopped — regenerate?"
// recovery affordance renders both live (on abort) and on reload.
export function hasAnswerlessUserTail(messages: MessageVM[]): boolean {
  const last = messages[messages.length - 1];
  return !!last && last.role === 'user';
}

// ── Action-label derivation (Component 2 / AC2.1, AC2.2) ─────────────────────

// Context the label templates use to resolve UUIDs into human-readable text. Both
// resolvers are ALREADY available on the tool-card path (no new data fetch).
export interface ToolLabelCtx {
  /** Resolve a card's front text from its id (store mirror → fetched). */
  resolveCardFront?: (cardId: string) => string | undefined;
  /** Resolve a deck's name from its id. */
  deckName?: (deckId: string) => string | undefined;
}

export interface ToolLabelResult {
  /** i18n key — `chat.tool.<name>` (or `chat.tool.<name>_n` for the pluralized collapse). */
  labelKey: string;
  /** Interpolation params for the i18n string (e.g. {front}, {query}, {scope}, {count}). */
  params: Record<string, string | number>;
  /** Optional arg string to render in --font-mono (queries). Never a UUID/JSON. */
  argMono?: string;
}

// Best-effort cast of the model's arg object to a record (never trusts shape).
function argRecord(args: unknown): Record<string, unknown> {
  return args && typeof args === 'object' ? (args as Record<string, unknown>) : {};
}

function nonEmptyString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;
}

/**
 * Derive a human-readable verb-phrase label for one tool call — NEVER leaking a
 * UUID or raw JSON (AC2.1/2.2). Returns the i18n `labelKey` (single
 * `chat.tool.<name>` namespace), interpolation `params`, and an optional `argMono`
 * string (a query, rendered in monospace in S4).
 */
export function toolLabel(name: string, args: unknown, ctx: ToolLabelCtx = {}): ToolLabelResult {
  const a = argRecord(args);
  const labelKey = TOOL_LABEL_KEY[name] ?? `chat.tool.${name}`;

  switch (name) {
    case 'get_card':
    case 'card_progress': {
      const cardId = nonEmptyString(a.cardId);
      const front = cardId ? ctx.resolveCardFront?.(cardId) : undefined;
      // Resolved front, else a SHORT id slice — NEVER the full UUID/JSON.
      const display = front ?? (cardId ? cardId.slice(0, 8) : '');
      return { labelKey, params: { front: display } };
    }
    case 'browse_cards': {
      const query = nonEmptyString(a.query);
      if (query) return { labelKey, params: { query }, argMono: query };
      const deckId = nonEmptyString(a.deckId);
      const deck = deckId ? ctx.deckName?.(deckId) : undefined;
      return { labelKey, params: { query: deck ?? '' } };
    }
    case 'list_decks':
      return { labelKey, params: {} };
    case 'study_stats': {
      const scope = nonEmptyString(a.scope) ?? 'global';
      const deckId = nonEmptyString(a.deckId);
      const deck = deckId ? ctx.deckName?.(deckId) : undefined;
      return { labelKey, params: { scope: deck ?? scope } };
    }
    case 'search_cards':
    case 'web_search': {
      const query = nonEmptyString(a.query) ?? '';
      return { labelKey, params: { query }, argMono: query || undefined };
    }
    default: {
      // Unknown tool — emit the bare label key only, never raw args.
      return { labelKey, params: {} };
    }
  }
}

// ── Elapsed-time formatting (AC1.5) ──────────────────────────────────────────

type T = (key: string, params?: Record<string, string | number>) => string;

/**
 * Hand-rolled "Worked for Ns" formatter (mirrors the relativeUpdated style).
 *   • < 1s          → chat.activity.workedSub  ("<1s")
 *   • 1–59s         → chat.activity.workedSeconds {count}
 *   • 60s–59m59s    → chat.activity.workedMinutes {m, s}
 *   • ≥ 3600s       → chat.activity.workedHours {h, m}  (runaway cap — no raw seconds)
 * Pure (takes `t`). A negative/NaN ms collapses to the sub-second form.
 */
export function formatElapsed(ms: number, t: T): string {
  if (!Number.isFinite(ms) || ms < 1000) return t('chat.activity.workedSub');
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return t('chat.activity.workedSeconds', { count: totalSeconds });
  if (totalSeconds < 3600) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return t('chat.activity.workedMinutes', { m, s });
  }
  // ≥ 1h — cap as "Hh Mm" so a runaway turn reads sanely (never raw "7412s").
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return t('chat.activity.workedHours', { h, m });
}

// ── Repeated-call summarization (AC2.2 / Assumption 4) ───────────────────────

export interface StepGroup {
  name: string;
  count: number;
  /** Index of the first step in this contiguous run (preserves call order). */
  firstIndex: number;
}

/**
 * Collapse ONLY CONSECUTIVE same-tool runs into one group (preserves call order).
 * Interleaved runs (A,A,B,A) do NOT merge across the B — they stay
 * `[A×2, B, A×1]`, so the header copy never under-counts or implies a contiguity
 * that didn't happen. The summed group counts always equal the raw step count.
 */
export function summarizeSteps(steps: { name: string }[]): StepGroup[] {
  const groups: StepGroup[] = [];
  for (let i = 0; i < steps.length; i++) {
    const name = steps[i]!.name;
    const last = groups[groups.length - 1];
    if (last && last.name === name) {
      last.count += 1;
    } else {
      groups.push({ name, count: 1, firstIndex: i });
    }
  }
  return groups;
}

// ── Activity-group header state (AC1.2 / AC1.3 / Change 5) ───────────────────

export interface GroupHeaderInput {
  /** The turn is still streaming. */
  streaming: boolean;
  /** The final prose answer has begun arriving. */
  answerStarted: boolean;
  /**
   * Single-step group auto-opens (Decision A1): when there is exactly one step the
   * group renders light + expanded. Multi-step groups collapse-on-answer via `live`.
   */
  singleStepAutoOpen: boolean;
  /**
   * Force the group open while ANY step is awaiting human confirmation (AC1.4).
   * A pending-confirmation step is always visible even in a multi-step group where
   * `initialOpen` and `live` are both false — without this the Apply/Reject controls
   * are hidden behind a closed group and the turn is stuck with no affordance.
   */
  anyAwaiting?: boolean;
}

export interface GroupHeaderState {
  status: 'running' | 'done' | 'error';
  /** Auto-collapse flag — mirrors ReasoningBlock.live (streaming && !answerStarted). */
  live: boolean;
  /** Initial open state before any manual toggle: `initialOpen || live` drives the group. */
  initialOpen: boolean;
}

/**
 * Derive the activity-group header status + auto-collapse `live` flag + the
 * `initialOpen` branch. Status: any error → error; any running → running; else
 * done. `live = streaming && !answerStarted` (mirrors ReasoningBlock). The
 * single-step group's `initialOpen` is true (auto-expanded); a multi-step group's
 * `initialOpen` is false so it collapses-on-answer via `live`. When `anyAwaiting`
 * is true (a step is paused for human approval), `initialOpen` is forced true so
 * the Apply/Reject controls are never hidden behind a closed group (AC1.4).
 */
export function groupHeaderState(
  steps: { status: ToolCallVM['status'] }[],
  { streaming, answerStarted, singleStepAutoOpen, anyAwaiting }: GroupHeaderInput,
): GroupHeaderState {
  const anyError = steps.some((s) => s.status === 'error');
  const anyRunning = steps.some((s) => s.status === 'running');
  const status: GroupHeaderState['status'] = anyError ? 'error' : anyRunning ? 'running' : 'done';
  const live = streaming && !answerStarted;
  // Force initialOpen when a step is awaiting confirmation so the controls are
  // always visible regardless of step count or whether an answer has arrived.
  const initialOpen = singleStepAutoOpen || (anyAwaiting === true);
  return { status, live, initialOpen };
}

// ── Post-apply write summary (Component 5 / AC5.1) ───────────────────────────

export interface ApplySummary {
  kind: 'create' | 'edit';
  count?: number;
  deckId?: string;
  cardId?: string;
}

/**
 * Derive a post-apply write summary from an APPLIED create/edit tool's name+args
 * (used by the S5 render path). Reads only `cardIds`/`deckId`/`cardId` already on
 * the tool args. Returns null for reject/other tools so nothing renders.
 */
export function applySummaryFrom(name: string, args: unknown): ApplySummary | null {
  const a = argRecord(args);
  if (name === 'create_card') {
    const deckId = nonEmptyString(a.deckId);
    // create_card may carry a single card or a `cardIds` batch — count what's there.
    const cardIds = Array.isArray(a.cardIds) ? a.cardIds.length : undefined;
    const count = cardIds ?? 1;
    return { kind: 'create', count, deckId };
  }
  if (name === 'edit_card') {
    const cardId = nonEmptyString(a.cardId);
    return { kind: 'edit', cardId };
  }
  return null;
}

// ── B1 fallback helper (client-only resend; only if api build unavailable) ───

/**
 * Trim the trailing user[+assistant] exchange from a message list (the B1 fallback
 * edit-and-rerun path). With B2 (server-side) chosen as the default this is unused
 * by the live UI, but it is kept + unit-tested so the fallback path is provable.
 * Drops a trailing assistant VM (if present) then a trailing user VM (if present).
 */
export function dropTrailingExchange(messages: MessageVM[]): MessageVM[] {
  let end = messages.length;
  if (end > 0 && messages[end - 1]!.role === 'assistant') end -= 1;
  if (end > 0 && messages[end - 1]!.role === 'user') end -= 1;
  return messages.slice(0, end);
}
