export type NoteContentErrorCode = 'html_image_requires_markdown' | 'typein_answer_required' | 'typein_answer_placement' | 'invalid_template' | 'invalid_accepted_answers' | 'no_cards_generated';
export class NoteContentError extends Error {
  constructor(public readonly code: NoteContentErrorCode) { super(code); this.name = 'NoteContentError'; }
}

export const CARD_MEDIA_TOKEN_RE = /^\/m\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function mediaSourceFromTag(tag: string): string | null {
  return /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag)?.slice(1).find((value) => value !== undefined) ?? null;
}

/** Only explicit alternatives count; punctuation and internal spacing remain significant. */
export const normalizeTypedAnswer = (value: string) => value.trim().normalize('NFC').toLowerCase();
export function acceptedAnswerVariants(values: readonly string[]): string[] {
  if (values.length > 20 || values.some((value) => !value.trim() || value.length > 256 || /[\r\n]/.test(value))) {
    throw new NoteContentError('invalid_accepted_answers');
  }
  const unique = new Map<string, string>();
  for (const value of values) unique.set(normalizeTypedAnswer(value), value.trim().normalize('NFC'));
  return [...unique.values()];
}
export function typedAnswerTarget(typed: string, canonical: string, alternatives: readonly string[] = []): string {
  return [canonical, ...alternatives].find((answer) => normalizeTypedAnswer(answer) === normalizeTypedAnswer(typed)) ?? canonical;
}
