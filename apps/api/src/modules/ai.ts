// AI / RAG module. v1 foundation (Slice 0): exposes `GET /ai/status` so the web
// `/chat` screen can show a setup notice when AI features are unconfigured.
// Slices 3–4 extend THIS module with `POST /ai/reindex` + the chat/SSE routes.
//
// All AI features degrade-not-crash: the two flags (`embeddingEnabled` /
// `chatEnabled`) are decoupled and derive from optional env (apps/api/src/env.ts).

import { Elysia } from 'elysia';
import { env, embeddingEnabled, chatEnabled } from '../env.ts';
import { authPlugin } from '../auth-plugin.ts';

export const aiModule = new Elysia({ prefix: '/ai' })
  .use(authPlugin)
  // Reports both independent switches + the active model config so the client
  // can render the right setup notice. Auth-scoped for consistency (no
  // per-user data yet).
  .get(
    '/status',
    () => ({
      embeddingEnabled,
      chatEnabled,
      embeddingModel: env.ai.EMBEDDING_MODEL,
      chatModel: env.ai.CHAT_MODEL,
      embeddingDim: env.ai.EMBEDDING_DIM,
    }),
    { auth: true },
  );
