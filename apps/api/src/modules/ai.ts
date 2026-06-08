// AI / RAG module. v1 foundation. Exposes:
//   GET  /ai/status   — both feature switches + active model config (Slice 0).
//   POST /ai/reindex  — enqueue all the caller's cards for (re)indexing (Slice 3).
//
// All AI features degrade-not-crash: the two flags (`embeddingEnabled` /
// `chatEnabled`) are decoupled and derive from optional env (apps/api/src/env.ts);
// `/ai/status` also reflects the boot-time dim-assertion degrade state.

import { Elysia } from 'elysia';
import { env, embeddingEnabled, chatEnabled } from '../env.ts';
import { authPlugin } from '../auth-plugin.ts';
import { embeddingDegraded, reindexUser } from '../ai/index-queue.ts';

export const aiModule = new Elysia({ prefix: '/ai' })
  .use(authPlugin)
  // Reports both independent switches + the active model config so the client
  // can render the right setup notice. `degraded` is true when the boot-time
  // dimension assertion disabled embedding writes (column dim ≠ EMBEDDING_DIM).
  .get(
    '/status',
    () => ({
      embeddingEnabled: embeddingEnabled && !embeddingDegraded(),
      chatEnabled,
      embeddingModel: env.ai.EMBEDDING_MODEL,
      chatModel: env.ai.CHAT_MODEL,
      embeddingDim: env.ai.EMBEDDING_DIM,
      degraded: embeddingDegraded(),
    }),
    { auth: true },
  )
  // Enqueue all of the caller's cards for (re)indexing (user-scoped backfill).
  // Non-blocking: returns `{ queued }` immediately and drains in background.
  // `queued` is 0 when embeddings are unconfigured/degraded (no-op).
  .post(
    '/reindex',
    async ({ user }) => {
      const queued = await reindexUser(user.id);
      return { queued };
    },
    { auth: true },
  );
