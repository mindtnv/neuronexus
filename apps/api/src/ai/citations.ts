// Citation resolution — extracted from ai.ts so BOTH the chat module and the
// `search_cards` tool (apps/api/src/ai/tools.ts) share one implementation.
//
// Resolves retrieved chunks into RagChunk (for the prompt/model-facing text) +
// Citation[] (for the client + persistence). Deck names are looked up in one
// batched query for the prompt context block.

import { inArray } from 'drizzle-orm';
import { db, decks, type Citation } from '@neuronexus/db';
import type { RagChunk } from '@neuronexus/shared';
import type { RankedChunk } from './retrieve.ts';

/** Snippet length stored on each Citation (for the client's hover/preview). */
export const SNIPPET_LEN = 240;

export async function resolveCitations(
  hits: RankedChunk[],
): Promise<{ ragChunks: RagChunk[]; citations: Citation[] }> {
  if (hits.length === 0) return { ragChunks: [], citations: [] };

  const deckIds = [...new Set(hits.map((h) => h.deckId))];
  const deckRows = await db
    .select({ id: decks.id, name: decks.name })
    .from(decks)
    .where(inArray(decks.id, deckIds));
  const deckNameById = new Map(deckRows.map((d) => [d.id, d.name]));

  const ragChunks: RagChunk[] = hits.map((h) => ({
    cardId: h.cardId,
    text: h.text,
    deckName: deckNameById.get(h.deckId),
  }));
  const citations: Citation[] = hits.map((h) => ({
    cardId: h.cardId,
    chunkId: h.chunkId,
    deckId: h.deckId,
    snippet: h.text.slice(0, SNIPPET_LEN),
  }));
  return { ragChunks, citations };
}
