// Pure helpers for the composer's @-mention + /slash-command triggers (D1/D2).
// React-free so they unit-test via `bun test` (no chat render harness).

// ── Trigger detection ─────────────────────────────────────────────────────────

export type ComposerTrigger =
  | { kind: 'mention'; query: string; start: number }
  | { kind: 'slash'; query: string; start: number };

/** Max chars the live mention query may span (keeps the scan cheap + sane). */
const MENTION_QUERY_MAX = 40;

/**
 * Detect an active popover trigger at the caret.
 *   • slash: the draft STARTS with `/word` and the caret is inside it (so `/`
 *     mid-text never triggers).
 *   • mention: an `@` at the string start or after whitespace, with the query
 *     being the text from it to the caret (no newline, ≤40 chars; spaces are
 *     allowed so multi-word deck names match). `a@b` is NOT a trigger (no
 *     whitespace boundary before the @).
 * Returns null when nothing is active.
 */
export function detectComposerTrigger(value: string, caret: number): ComposerTrigger | null {
  const before = value.slice(0, caret);

  // Slash: only at the very start of the draft, single token.
  const slashMatch = /^\/([a-z]*)$/i.exec(before);
  if (slashMatch && caret <= (slashMatch[1]?.length ?? 0) + 1) {
    return { kind: 'slash', query: slashMatch[1] ?? '', start: 0 };
  }

  // Mention: scan back for the nearest '@' with a whitespace/start boundary.
  const at = before.lastIndexOf('@');
  if (at === -1) return null;
  if (at > 0 && !/\s/.test(before[at - 1]!)) return null; // a@b — not a trigger
  const query = before.slice(at + 1);
  if (query.includes('\n')) return null;
  if (query.length > MENTION_QUERY_MAX) return null;
  return { kind: 'mention', query, start: at };
}

/**
 * Splice the trigger text (`@query` / `/query`) out of the draft, replacing it
 * with `replacement` (usually ''). Returns the next draft + caret position.
 */
export function applyTrigger(
  value: string,
  trigger: ComposerTrigger,
  caret: number,
  replacement = '',
): { value: string; caret: number } {
  const next = value.slice(0, trigger.start) + replacement + value.slice(caret);
  return { value: next, caret: trigger.start + replacement.length };
}

// ── Mention search (decks + cards from the store mirror) ─────────────────────

export interface MentionDeck {
  id: string;
  name: string;
  icon?: string;
}
export interface MentionCard {
  id: string;
  front: string;
  deckId: string;
}

export interface MentionResults {
  decks: MentionDeck[];
  cards: MentionCard[];
}

/**
 * Case-insensitive substring search over deck names + card fronts. Empty query
 * → the first N decks (alphabetical) + first N cards (mirror order). Caps keep
 * the popover scannable.
 */
export function searchMentions(
  decks: MentionDeck[],
  cards: MentionCard[],
  query: string,
  caps: { decks: number; cards: number } = { decks: 4, cards: 6 },
): MentionResults {
  const q = query.trim().toLowerCase();
  const matchedDecks = (
    q.length === 0
      ? decks.slice().sort((a, b) => a.name.localeCompare(b.name))
      : decks.filter((d) => d.name.toLowerCase().includes(q))
  ).slice(0, caps.decks);
  const matchedCards = (
    q.length === 0 ? cards : cards.filter((c) => c.front.toLowerCase().includes(q))
  ).slice(0, caps.cards);
  return { decks: matchedDecks, cards: matchedCards };
}

// ── Slash commands (D2) ───────────────────────────────────────────────────────

export const SLASH_COMMANDS = ['quiz', 'forecast', 'stats', 'review', 'research'] as const;
export type SlashCommand = (typeof SLASH_COMMANDS)[number];

/** Filter the command list by the live `/query` prefix. */
export function filterSlashCommands(query: string): SlashCommand[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [...SLASH_COMMANDS];
  return SLASH_COMMANDS.filter((c) => c.startsWith(q));
}

type T = (key: string, params?: Record<string, string | number>) => string;

/** Localized draft template for a slash command (deck name interpolated). */
export function slashTemplate(cmd: SlashCommand, t: T, deckName?: string): string {
  return t(`chat.slash.${cmd}Template`, { deck: deckName ?? '' }).trim();
}
