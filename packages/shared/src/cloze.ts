export const MAX_CLOZE_DEPTH = 8;
export const MAX_CLOZE_CARDS = 128;
export const MAX_CLOZE_NUMBER = 2_147_483_647;
/** Also recognizes rows written by an older API during the migration rollout. */
export function isLegacyClozeCard(card: { renderKind: string; clozeNumber?: number | null }): boolean {
  return card.renderKind === 'cloze' && (card.clozeNumber ?? 0) === 0;
}
export class ClozeSyntaxError extends Error {
  constructor(public readonly position: number, message = 'invalid_cloze') {
    super(message); this.name = 'ClozeSyntaxError';
  }
}
export interface ClozeSpan { number: number; answer: string; hint?: string; end: number }

function codeEnd(source: string, start: number): number | undefined {
  if (source[start] !== '`') return undefined;
  let length = 1;
  while (source[start + length] === '`') length++;
  const marker = '`'.repeat(length);
  let end = source.indexOf(marker, start + length);
  while (end >= 0 && (source[end - 1] === '`' || source[end + length] === '`')) end = source.indexOf(marker, end + length);
  return end >= 0 ? end + length : start + length;
}

/** Balanced cloze grammar. A backslash escapes syntax; code spans are opaque. */
export function parseClozeAt(source: string, start: number, depth = 0, legacy = false, math = false): ClozeSpan | null {
  const open = /^\{\{c(\d+)::/.exec(source.slice(start));
  if (!open) {
    if (/^\{\{c-?\d/.test(source.slice(start))) throw new ClozeSyntaxError(start);
    return null;
  }
  const parsedNumber = Number(open[1]);
  if ((!legacy && (!Number.isInteger(parsedNumber) || parsedNumber < 1 || parsedNumber > MAX_CLOZE_NUMBER)) || depth >= MAX_CLOZE_DEPTH) throw new ClozeSyntaxError(start);
  const number = Number.isSafeInteger(parsedNumber) ? parsedNumber : 0;
  const body = start + open[0].length;
  let hint = -1;
  let braces = 0;
  for (let i = body; i < source.length;) {
    if (source[i] === '\\') { i += 2; continue; }
    const code = math ? undefined : codeEnd(source, i);
    if (code !== undefined) { i = code; continue; }
    const child = source.startsWith('{{c', i) ? parseClozeAt(source, i, depth + 1, legacy, math) : null;
    if (child) { if (hint >= 0) throw new ClozeSyntaxError(i); i = child.end; continue; }
    if (braces === 0 && source.startsWith('}}', i)) {
      const answer = source.slice(body, hint < 0 ? i : hint);
      if (!answer.trim()) throw new ClozeSyntaxError(start);
      return { number, answer, ...(hint < 0 ? {} : { hint: source.slice(hint + 2, i) }), end: i + 2 };
    }
    if (braces === 0 && hint < 0 && source.startsWith('::', i)) { hint = i; i += 2; continue; }
    if (source[i] === '{') braces++;
    if (source[i] === '}') { if (braces === 0) throw new ClozeSyntaxError(i); braces--; }
    i++;
  }
  throw new ClozeSyntaxError(start);
}

export function renderClozeSource(source: string, mode: 'prompt' | 'answer', target = 0,
  onNumber?: (number: number) => void, math = false, legacy = false, depth = 0): string {
  let out = '';
  for (let i = 0; i < source.length;) {
    if (source[i] === '\\' && (source[i + 1] === '{' || source[i + 1] === '\\')) {
      out += source.slice(i, i + 2); i += 2; continue;
    }
    const code = math ? undefined : codeEnd(source, i);
    if (code !== undefined) { out += source.slice(i, code); i = code; continue; }
    const node = source.startsWith('{{c', i) ? parseClozeAt(source, i, depth, legacy, math) : null;
    if (!node) { out += source[i++]; continue; }
    onNumber?.(node.number);
    // Visit every nested number even when an outer question hides it.
    const revealed = renderClozeSource(node.answer, 'answer', 0, onNumber, math, legacy, depth + 1);
    if (mode === 'prompt' && (target === 0 || target === node.number)) {
      const hint = node.hint?.trim();
      out += math ? (hint ? `\\text{[${hint.replace(/[\\{}#$%&_]/g, ' ')}]}` : '\\ldots') : `[${hint || '…'}]`;
    } else out += mode === 'answer' ? revealed : renderClozeSource(node.answer, mode, target, undefined, math, legacy, depth + 1);
    i = node.end;
  }
  return out;
}
