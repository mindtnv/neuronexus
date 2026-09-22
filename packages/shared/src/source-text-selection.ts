import { validate as validUuid } from 'uuid';
import { ASSISTANT_CONTEXT_LIMITS } from './assistant-context';
export interface SourceTextSegment {
  chunkId: string;
  /** SHA-256 of raw source chunk text and normalized rendered text, respectively. */
  textHash: string;
  renderedHash: string;
  /** Offsets in normalized rendered text, not Markdown source or PDF geometry. */
  start: number;
  end: number;
}
export interface SourceTextSelection {
  version: 1;
  quote: string;
  /** Empty means an explicitly unanchored, user-supplied quote. */
  chunks: SourceTextSegment[];
  prefix?: string;
  suffix?: string;
}
export const normalizeSourceText = (text: string) => text.normalize('NFC').replace(/\s+/gu, ' ').trim();
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_text_selection');
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error('invalid_text_selection');
}
export function parseSourceTextSelection(input: unknown): SourceTextSelection {
  const value = object(input);
  keys(value, ['version','quote','chunks','prefix','suffix']);
  if (value.version !== 1 || typeof value.quote !== 'string' || !value.quote.trim()
    || value.quote.length > ASSISTANT_CONTEXT_LIMITS.excerptChars || !Array.isArray(value.chunks)
    || value.chunks.length > ASSISTANT_CONTEXT_LIMITS.passageChunks) throw new Error('invalid_text_selection');
  const chunks = value.chunks.map(raw => {
    const chunk = object(raw); keys(chunk, ['chunkId','textHash','renderedHash','start','end']);
    if (typeof chunk.chunkId !== 'string' || !validUuid(chunk.chunkId)
      || typeof chunk.textHash !== 'string' || !/^[a-f0-9]{64}$/.test(chunk.textHash)
      || typeof chunk.renderedHash !== 'string' || !/^[a-f0-9]{64}$/.test(chunk.renderedHash)
      || !Number.isSafeInteger(chunk.start) || !Number.isSafeInteger(chunk.end)
      || Number(chunk.start) < 0 || Number(chunk.end) <= Number(chunk.start) || Number(chunk.end) > 1_000_000) throw new Error('invalid_text_selection');
    return { chunkId: chunk.chunkId, textHash: chunk.textHash, renderedHash: chunk.renderedHash, start: Number(chunk.start), end: Number(chunk.end) };
  });
  if (new Set(chunks.map(chunk => chunk.chunkId)).size !== chunks.length) throw new Error('invalid_text_selection');
  const result: SourceTextSelection = { version: 1, quote: value.quote, chunks };
  for (const key of ['prefix','suffix'] as const) {
    if (value[key] === undefined) continue;
    if (typeof value[key] !== 'string' || value[key].length > 120) throw new Error('invalid_text_selection');
    result[key] = value[key];
  }
  return result;
}
