// RAG prompt builder — shared between apps/api (assembles the prompt sent to the
// LLM) and test suites (asserts the grounding contract). Pure TS, no DOM/Node.
//
// Grounding contract (AC1 / AC3):
//   (a) Answer ONLY from the provided card context.
//   (b) If the context is insufficient, explicitly say the information is not
//       in the user's cards ("not in your cards").
//   (c) Any general-knowledge addition MUST be explicitly labeled as outside
//       the user's cards.
//   (d) Cite sources using the stable token [card:<cardId>] so the server can
//       map citations to Citation[] objects for the client.

export interface RagChunk {
  cardId: string;
  text: string;
  deckName?: string;
}

export interface RagHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface RagPromptResult {
  system: string;
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
}

// ── System prompt helpers ───────────────────────────────────────────────────

const GROUNDING_SYSTEM = `You are a study assistant for a spaced-repetition flashcard app. \
Your role is to help the user understand and recall the content of their own flashcards.

Rules you MUST follow:
1. Answer ONLY using information from the card excerpts provided in the context below. Do not use outside knowledge as a primary source.
2. If the provided context does not contain enough information to answer the question, say explicitly: "This information is not in your cards."
3. If you include any general knowledge beyond what the cards state, you MUST clearly label it with the phrase "outside your cards:" before that content.
4. Cite the cards you draw on using the token [card:<cardId>] immediately after the relevant claim. Use the exact cardId from the context.
5. Never fabricate card content. Only quote or paraphrase text that appears in the context below.`;

const NOT_FOUND_SYSTEM = `You are a study assistant for a spaced-repetition flashcard app.

No card context was found for this query. You MUST respond with exactly: "This information is not in your cards." Do not attempt to answer from general knowledge.`;

// ── Context block builder ───────────────────────────────────────────────────

function buildContextBlock(chunks: RagChunk[]): string {
  if (chunks.length === 0) return '';
  const lines = chunks.map((c) => {
    const deck = c.deckName ? ` (deck: ${c.deckName})` : '';
    return `[card:${c.cardId}]${deck}\n${c.text}`;
  });
  return `<card_context>\n${lines.join('\n\n')}\n</card_context>`;
}

// ── Main export ─────────────────────────────────────────────────────────────

/**
 * Build the system prompt + messages array for a grounded RAG chat turn.
 *
 * @param query   The user's current question.
 * @param chunks  Retrieved card excerpts (top-k from pgvector retrieval).
 * @param history Prior conversation turns (oldest first, excluding this query).
 */
export function buildRagPrompt({
  query,
  chunks,
  history,
}: {
  query: string;
  chunks: RagChunk[];
  history: RagHistoryMessage[];
}): RagPromptResult {
  const hasContext = chunks.length > 0;
  const system = hasContext ? GROUNDING_SYSTEM : NOT_FOUND_SYSTEM;

  const messages: RagPromptResult['messages'] = [];

  // Inject the card context as a system message immediately before the first
  // user turn so the model sees it with the highest positional weight.
  if (hasContext) {
    messages.push({
      role: 'system',
      content: buildContextBlock(chunks),
    });
  }

  // Thread prior conversation history.
  for (const h of history) {
    messages.push({ role: h.role, content: h.content });
  }

  // Current user query.
  messages.push({ role: 'user', content: query });

  return { system, messages };
}
