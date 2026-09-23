import { isEmbeddingEnabled } from '../ai/openai-client';
import { embeddingDegraded } from '../ai/index-queue';

/** Service availability is independent of parsing/reading state. */
export function sourceOperationPresentation() {
  return { searchAvailable: isEmbeddingEnabled() && !embeddingDegraded() };
}
