// Raw SSE transport for the grounded RAG chat stream (Slice 5 / Decision 4).
//
// Eden Treaty (lib/api.ts) is request/response only — it CANNOT consume a
// streaming `text/event-stream` response. So the one streaming endpoint
// (`POST /chat/conversations/:id/stream`) is reached here via a hand-written
// `fetch` + `ReadableStreamDefaultReader`, parsing SSE frames by hand. Everything
// else (list/open/create/delete conversations, GET /cards/:id) stays on Eden.
//
// `credentials:'include'` is mandatory (mirrors api.ts): without it the
// BetterAuth session cookie doesn't cross the :3000↔:3001 boundary and the
// server 401s. We hit `NEXT_PUBLIC_API_URL` directly (no Next proxy), exactly
// the same base URL Eden uses.

import type {
  ChatResumeRequest,
  ChatStreamEvent,
  ChatStreamRequest,
  Citation,
} from '@neuronexus/shared';

// Same resolution order as lib/api.ts so the two clients agree on the origin.
const baseURL =
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL
    ? process.env.NEXT_PUBLIC_API_URL
    : 'http://localhost:3000';

export interface ChatStreamHandlers {
  /** A token delta arrived — append it to the live assistant message. */
  onToken?: (delta: string) => void;
  /** The resolved citation set for this turn arrived. */
  onCitation?: (citations: Citation[]) => void;
  /** The stream completed cleanly; `messageId` is the persisted assistant message. */
  onDone?: (messageId: string) => void;
  /**
   * A terminal error frame arrived (post-flush server error) OR the transport
   * itself failed (network / non-2xx / no body). Either way the stream is over.
   */
  onError?: (message: string) => void;

  // ── Agentic stream handlers (Phase A) ──────────────────────────────────────
  /**
   * A streamed reasoning delta — append to the live "thinking" trace. Best-effort
   * and never persisted; the trace auto-collapses once the final answer arrives.
   */
  onReasoning?: (delta: string) => void;
  /** The model finalized a tool call and the loop began executing it (status `running`). */
  onToolCall?: (toolCall: { id: string; name: string; args: unknown }) => void;
  /** A tool finished executing — `ok` + optional one-line `summary` + citations (search_cards). */
  onToolResult?: (toolResult: {
    id: string;
    ok: boolean;
    summary?: string;
    citations?: Citation[];
  }) => void;
  /** A coarse loop-phase hint for the live status line (thinking / calling_tool / answering). */
  onStatus?: (phase: 'thinking' | 'calling_tool' | 'answering') => void;
  /**
   * Phase B: the loop paused awaiting human approval of a write/SRS tool. Declared
   * here so the union is stable; the resume transport that answers it lands in B.
   */
  onAwaitConfirmation?: (await_: {
    toolCall: { id: string; name: string; args: unknown };
    impact?: { willDeleteCards?: number; willCreateCards?: number; affectsSiblings?: boolean };
  }) => void;
}

/** Dispatch one parsed SSE event to the matching handler. */
function dispatch(event: ChatStreamEvent, handlers: ChatStreamHandlers): void {
  switch (event.type) {
    case 'token':
      handlers.onToken?.(event.delta);
      break;
    case 'citation':
      handlers.onCitation?.(event.citations);
      break;
    case 'done':
      handlers.onDone?.(event.messageId);
      break;
    case 'error':
      handlers.onError?.(event.message);
      break;
    // ── Agentic frames (Phase A; additive — parseBlock already decodes them) ──
    case 'reasoning':
      handlers.onReasoning?.(event.delta);
      break;
    case 'tool_call':
      handlers.onToolCall?.({ id: event.id, name: event.name, args: event.args });
      break;
    case 'tool_result':
      handlers.onToolResult?.({
        id: event.id,
        ok: event.ok,
        summary: event.summary,
        citations: event.citations,
      });
      break;
    case 'status':
      handlers.onStatus?.(event.phase);
      break;
    case 'await_confirmation':
      // Phase B: surfaced to the (optional) confirmation handler. The resume
      // transport that answers it lands in Phase B; harmless to dispatch now.
      handlers.onAwaitConfirmation?.({ toolCall: event.toolCall, impact: event.impact });
      break;
  }
}

/**
 * Parse one SSE block (the text between two blank-line separators) into a typed
 * event. The server emits frames as `event: <type>\ndata: <json>\n\n`; the JSON
 * payload is the full `ChatStreamEvent` (so the `data:` line is authoritative —
 * the `event:` line is redundant but kept for readability / EventSource compat).
 * Returns null for keep-alive / comment-only blocks.
 */
function parseBlock(block: string): ChatStreamEvent | null {
  const dataLines = block
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trim());
  if (dataLines.length === 0) return null;
  try {
    return JSON.parse(dataLines.join('\n')) as ChatStreamEvent;
  } catch {
    return null;
  }
}

/**
 * Drive `handlers` off an already-opened SSE `Response`. Shared verbatim by
 * `streamChat` and `resumeChat` so both transports parse frames identically
 * (raw fetch + reader, outside Eden — Eden can't consume a stream). Surfaces
 * pre-flush failures (non-2xx / no body) and transport tears via `onError`, so
 * callers always have a single completion path; never rejects.
 */
async function consumeSseResponse(
  res: Response,
  handlers: ChatStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  // Pre-flush failures (chat disabled → 503, foreign thread → 404, auth → 401)
  // come back as a normal JSON body, not a stream. Surface them as an error.
  if (!res.ok || !res.body) {
    let message = `chat_failed_${res.status}`;
    try {
      const payload = (await res.json()) as { error?: string };
      if (payload?.error) message = payload.error;
    } catch {
      // non-JSON body — keep the status-coded message.
    }
    handlers.onError?.(message);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE frames are separated by a blank line. Process every complete block,
      // keep the trailing partial in the buffer for the next read.
      let sep: number;
      // eslint-disable-next-line no-cond-assign
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const event = parseBlock(block);
        if (event) dispatch(event, handlers);
      }
    }
    // Flush any final block that wasn't terminated by a blank line.
    const tail = buffer.trim();
    if (tail) {
      const event = parseBlock(tail);
      if (event) dispatch(event, handlers);
    }
  } catch (err) {
    // A deliberate stop aborts the in-flight reader.read() with AbortError —
    // swallow it (the turn was cancelled on purpose, not a transport failure).
    if (isAbortError(err) || signal?.aborted) return;
    handlers.onError?.(err instanceof Error ? err.message : 'stream_error');
  }
}

/**
 * Open the SSE stream for a chat turn and drive the handlers as frames arrive.
 *
 * Resolves when the stream closes (after `done`/`error` or the body ends). Never
 * rejects — transport failures are surfaced via `onError` so callers have a
 * single completion path. Returns the accumulated assistant text (handy for the
 * caller's own bookkeeping / tests).
 *
 * Note (Phase B): a turn that hits a write/SRS tool ends with an
 * `await_confirmation` frame and then the stream CLOSES with NO `done` — the
 * turn is suspended awaiting human approval. The caller answers it via
 * `resumeChat`, which re-attaches the same handler set to the continued turn.
 *
 * `opts.model` / `opts.deckId` are the per-turn reasoning-level selection +
 * deck scope (validated server-side; absent ⇒ today's behavior). `opts.signal`
 * wires an AbortController so the caller can stop the stream — an `AbortError`
 * from the cancelled fetch is swallowed silently (NOT surfaced via `onError`),
 * so the generic-error copy never flashes on a deliberate stop.
 */
export interface ChatTurnOpts {
  model?: string;
  deckId?: string;
  signal?: AbortSignal;
}

/** True when a thrown error is the AbortController firing (a deliberate stop). */
function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

export async function streamChat(
  conversationId: string,
  content: string,
  handlers: ChatStreamHandlers,
  opts?: ChatTurnOpts,
): Promise<void> {
  const body: ChatStreamRequest = { content, model: opts?.model, deckId: opts?.deckId };
  let res: Response;
  try {
    res = await fetch(`${baseURL}/chat/conversations/${conversationId}/stream`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: opts?.signal,
    });
  } catch (err) {
    // A deliberate stop (controller.abort()) rejects the fetch with AbortError —
    // swallow it; the caller drops the placeholder + shows the retry affordance.
    if (isAbortError(err)) return;
    handlers.onError?.(err instanceof Error ? err.message : 'network_error');
    return;
  }

  await consumeSseResponse(res, handlers, opts?.signal);
}

/**
 * Resume a turn suspended at an `await_confirmation` frame (Phase B / S9).
 *
 * `streamChat` closes its stream (with NO `done`) when the agent loop hits a
 * write/SRS tool; the loop is paused server-side, the transcript-up-to-the
 * pending `tool_calls` row already committed. This POSTs the human decision to
 * `POST /chat/conversations/:id/resume` and consumes the CONTINUED SSE response
 * with the SAME parse loop + handler set — the resumed turn keeps rendering
 * reasoning/token/tool_result/citation into the same assistant message until
 * `done` (Apply executes the mutation first; Reject records a "rejected" tool
 * result so the model answers without mutating).
 *
 * `decision: 'apply'` runs the pending mutation then continues the loop;
 * `'reject'` skips it. Mirrors `streamChat`: raw fetch + reader, outside Eden,
 * never rejects (failures surface via `onError`).
 */
export async function resumeChat(
  conversationId: string,
  body: ChatResumeRequest,
  handlers: ChatStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${baseURL}/chat/conversations/${conversationId}/resume`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (isAbortError(err)) return;
    handlers.onError?.(err instanceof Error ? err.message : 'network_error');
    return;
  }

  await consumeSseResponse(res, handlers, signal);
}

/**
 * Regenerate the LAST assistant turn (S6 / AC3.4). POSTs to the server's
 * `/regenerate` route, which deletes the trailing assistant turn then re-runs the
 * loop over the SAME last user message with the CURRENT model (doubles as "retry
 * deeper"). The continued SSE response is consumed with the SAME parse loop +
 * handler set as `streamChat`, so the fresh answer renders into the placeholder
 * the caller re-added. Mirrors `streamChat`: raw fetch + reader, outside Eden,
 * abort-aware, never rejects (transport failures surface via `onError`).
 */
export async function regenerateChat(
  conversationId: string,
  opts: { model?: string; deckId?: string; content?: string },
  handlers: ChatStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${baseURL}/chat/conversations/${conversationId}/regenerate`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      // `content` (edit-and-rerun, B2): when present the server UPDATES the last
      // user row in place before replaying; absent ⇒ today's regenerate exactly.
      body: JSON.stringify({ model: opts.model, deckId: opts.deckId, content: opts.content }),
      signal,
    });
  } catch (err) {
    if (isAbortError(err)) return;
    handlers.onError?.(err instanceof Error ? err.message : 'network_error');
    return;
  }

  await consumeSseResponse(res, handlers, signal);
}
