// C3 — conversation auto-titling. One cheap non-streaming completion (the
// `complete()` aux surface, NEVER `chatStreamAgentic` — that would consume a
// scripted test fake's turn) generates a short thread title from the FIRST user
// message of an untitled conversation.
//
// Best-effort by design: time-bounded (CHAT_TITLE_TIMEOUT_MS), never throws —
// any failure (timeout, AiDisabledError when no `complete` fake is injected
// under test, gateway error, empty output) returns `null` and the turn
// completes without a `title` frame. The persistence gate is `title IS NULL`,
// so the next turn (or a regenerate) simply retries.

import type { Logger } from 'pino';
import { env } from '../env.ts';
import { complete } from './openai-client.ts';

/** Hard cap on the persisted title length (also the PATCH route's max). */
const TITLE_MAX_CHARS = 60;

const TITLE_SYSTEM_PROMPT = [
  'You title chat conversations.',
  'Generate a very short title (at most 6 words) for a conversation that opens with the user message below.',
  'Answer in the language of the message.',
  'Return ONLY the title — no quotes, no trailing punctuation, no explanations.',
].join(' ');

/** Strip wrapping quotes/newlines + trailing punctuation, clamp to 60 chars. */
export function normalizeTitle(raw: string): string | null {
  let s = raw.replace(/\s+/g, ' ').trim();
  // Drop wrapping quotes + trailing sentence punctuation until stable —
  // `«Тайтл».` needs the dot removed BEFORE the closing guillemet matches.
  let prev: string;
  do {
    prev = s;
    s = s
      .replace(/^["'«„“]+/, '')
      .replace(/["'»“”]+$/, '')
      .replace(/[.,;:!?…]+$/, '')
      .trim();
  } while (s !== prev);
  if (s.length === 0) return null;
  if (s.length > TITLE_MAX_CHARS) s = s.slice(0, TITLE_MAX_CHARS).trimEnd();
  return s;
}

/**
 * Generate a title for a conversation opening with `firstUserMessage`.
 * Returns the normalized title or `null` — NEVER throws.
 */
export async function generateConversationTitle(
  firstUserMessage: string,
  opts: { model?: string; log?: Logger } = {},
): Promise<string | null> {
  try {
    const raw = await complete(
      [
        { role: 'system', content: TITLE_SYSTEM_PROMPT },
        { role: 'user', content: firstUserMessage.slice(0, 2000) },
      ],
      {
        model: opts.model,
        log: opts.log,
        signal: AbortSignal.timeout(env.ai.CHAT_TITLE_TIMEOUT_MS),
      },
    );
    return normalizeTitle(raw);
  } catch (err) {
    opts.log?.debug({ err }, 'ai.title.skipped');
    return null;
  }
}
