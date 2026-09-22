import { validate as validUuid } from 'uuid';

export const ASSISTANT_OBJECT_KINDS = [
  'card', 'deck', 'source', 'source_passage', 'notebook', 'written_note',
  'flashcard_note', 'note_type', 'artifact', 'conversation',
] as const;
export type AssistantObjectKind = typeof ASSISTANT_OBJECT_KINDS[number];
export type AssistantContextPolicy = 'focus' | 'strict';
export const MAX_ASSISTANT_CONCURRENT_TURNS = 3;
export const ASSISTANT_CONTEXT_LIMITS = {
  refs: 16, inputRefs: 128, labelChars: 200, excerptChars: 4_000,
  totalExcerptChars: 24_000, notebookSources: 100, passageChunks: 16,
} as const;

export interface AssistantPassageSegment {
  chunkId: string;
  start?: number;
  end?: number;
}
export interface AssistantPassageLocator {
  chunkId?: string;
  chunks?: AssistantPassageSegment[];
  page?: number;
  position?: number;
  section?: string;
  start?: number;
  end?: number;
  quote?: string;
  contentHash?: string;
}
export type AssistantObjectRef =
  | { kind: Exclude<AssistantObjectKind, 'source_passage' | 'notebook'>; id: string }
  | { kind: 'notebook'; id: string; sourceIds?: string[] }
  | { kind: 'source_passage'; id: string; locator: AssistantPassageLocator };

export interface AssistantContextInput {
  version: 1;
  policy: AssistantContextPolicy;
  refs: AssistantObjectRef[];
}
export interface AssistantObjectSnapshot {
  ref: AssistantObjectRef;
  label: string;
  available: boolean;
  href?: string;
  parent?: { kind: AssistantObjectKind; id: string; label: string };
  excerpt?: string;
  /** Hash of server-resolved content/state, never client-authored authority. */
  version?: string;
  verifiedQuote?: boolean;
  state?: string;
}
export interface AssistantContextSnapshot {
  version: 1;
  policy: AssistantContextPolicy;
  refs: AssistantObjectSnapshot[];
  /** Exact membership frozen at send time; [] is distinct from unbounded. */
  sourceIds: string[];
  deckIds: string[];
  revision: number;
}

export class AssistantContextError extends Error {
  constructor(public readonly code: string) { super(code); this.name = 'AssistantContextError'; }
}
function fail(code = 'invalid_context'): never { throw new AssistantContextError(code); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(value).some(k => !allowed.includes(k))) fail();
}
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !validUuid(value)) return fail();
  return value.toLowerCase();
}
function optionalInteger(value: unknown, min: number): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min) return fail();
  return value;
}
function boundedText(value: unknown, max: number, code = 'invalid_context'): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > max || !value.trim()) return fail(code);
  return value;
}
function offsets(o: Record<string, unknown>): { start?: number; end?: number } {
  const start = optionalInteger(o.start, 0), end = optionalInteger(o.end, 0);
  if ((start === undefined) !== (end === undefined) || (start !== undefined && end! <= start)) fail();
  return start === undefined ? {} : { start, end };
}
function parseLocator(value: unknown): AssistantPassageLocator {
  const o = object(value);
  keys(o, ['chunkId', 'chunks', 'page', 'position', 'section', 'start', 'end', 'quote', 'contentHash']);
  const result: AssistantPassageLocator = { ...offsets(o) };
  if (o.chunkId !== undefined) result.chunkId = uuid(o.chunkId);
  if (o.chunks !== undefined) {
    if (o.chunkId !== undefined || !Array.isArray(o.chunks) || !o.chunks.length || o.chunks.length > ASSISTANT_CONTEXT_LIMITS.passageChunks) fail();
    result.chunks = (o.chunks as unknown[]).map(value => {
      const segment = object(value); keys(segment, ['chunkId', 'start', 'end']);
      return { chunkId: uuid(segment.chunkId), ...offsets(segment) };
    });
    if (new Set(result.chunks.map(c => c.chunkId)).size !== result.chunks.length) fail();
    if (result.start !== undefined) fail();
  }
  const page = optionalInteger(o.page, 1), position = optionalInteger(o.position, 0);
  const section = boundedText(o.section, 300);
  const quote = boundedText(o.quote, ASSISTANT_CONTEXT_LIMITS.excerptChars, 'context_excerpt_too_large');
  const contentHash = boundedText(o.contentHash, 128);
  if (page !== undefined) result.page = page;
  if (position !== undefined) result.position = position;
  if (section !== undefined) result.section = section;
  if (quote !== undefined) result.quote = quote;
  if (contentHash !== undefined) result.contentHash = contentHash;
  if (!result.chunkId && !result.chunks && page === undefined && position === undefined && !section && !quote) fail();
  if (result.start !== undefined && !result.chunkId) fail();
  return result;
}

export function parseAssistantRef(value: unknown): AssistantObjectRef {
  const o = object(value);
  if (!(ASSISTANT_OBJECT_KINDS as readonly unknown[]).includes(o.kind)) return fail();
  const kind = o.kind as AssistantObjectKind, id = uuid(o.id);
  keys(o, kind === 'source_passage' ? ['kind', 'id', 'locator'] : kind === 'notebook' ? ['kind', 'id', 'sourceIds'] : ['kind', 'id']);
  if (kind === 'source_passage') return { kind, id, locator: parseLocator(o.locator) };
  if (kind === 'notebook' && o.sourceIds !== undefined) {
    if (!Array.isArray(o.sourceIds) || o.sourceIds.length > ASSISTANT_CONTEXT_LIMITS.notebookSources) return fail();
    return { kind, id, sourceIds: [...new Set(o.sourceIds.map(uuid))].sort() };
  }
  return { kind, id };
}

/** Canonical key is independent of JSON/JSONB property ordering. */
export function assistantRefKey(ref: AssistantObjectRef): string {
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([,v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k,v]) => [k, canonical(v)])) : value;
  return JSON.stringify(canonical(ref));
}

/** A per-message notebook subset replaces its pinned subset; passages remain distinct. */
export function mergeAssistantSnapshots(...groups: readonly AssistantObjectSnapshot[][]): AssistantObjectSnapshot[] {
  const merged=new Map<string,AssistantObjectSnapshot>();
  for(const group of groups)for(const snapshot of group)merged.set(snapshot.ref.kind==='notebook'?`notebook:${snapshot.ref.id}`:assistantRefKey(snapshot.ref),snapshot);
  return [...merged.values()];
}

export function parseAssistantContext(value: unknown): AssistantContextInput {
  const o = object(value);
  keys(o, ['version', 'policy', 'refs']);
  if (o.version !== 1 || (o.policy !== undefined && o.policy !== 'focus' && o.policy !== 'strict') || !Array.isArray(o.refs)) return fail();
  if (o.refs.length > ASSISTANT_CONTEXT_LIMITS.inputRefs) return fail('context_too_many_refs');
  const refs = [...new Map(o.refs.map(v => { const r = parseAssistantRef(v); return [assistantRefKey(r), r] as const; })).values()];
  if (refs.length > ASSISTANT_CONTEXT_LIMITS.refs) return fail('context_too_many_refs');
  const excerptChars = refs.reduce((n, r) => n + (r.kind === 'source_passage' ? r.locator.quote?.length ?? 0 : 0), 0);
  if (excerptChars > ASSISTANT_CONTEXT_LIMITS.totalExcerptChars) return fail('context_payload_too_large');
  return { version: 1, policy: o.policy ?? 'focus', refs };
}
