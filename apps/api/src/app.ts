import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { swagger } from '@elysiajs/swagger';
import { env } from './env.ts';
import { dbPing } from '@neuronexus/db';
import { authPlugin } from './auth-plugin.ts';
import { decksModule } from './modules/decks.ts';
import { deckOptionsModule } from './modules/deck-options.ts';
import { filteredDecksModule } from './modules/filtered-decks.ts';
import { cardsModule } from './modules/cards.ts';
import { noteTypesModule } from './modules/note-types.ts';
import { notesModule } from './modules/notes.ts';
import { reviewsModule } from './modules/reviews.ts';
import { statsModule } from './modules/stats.ts';
import { profileModule } from './modules/profile.ts';
import { mediaModule } from './modules/media.ts';
import { aiModule, chatModule } from './modules/ai.ts';
import { cardsSimilarModule, graphModule } from './modules/semantic.ts';
import { notebooksModule, sourcesModule } from './modules/notebooks.ts';
import { libraryModule } from './modules/library.ts';
import { AUTH_RATE_RULES, clientIpFromRequest, rateLimitCheck } from './rate-limit.ts';
import { pickRequestId, requestLogger, rootLogger } from './logger.ts';

/**
 * Build the full Elysia app (no .listen). Separating this from the binding
 * lets tests call `app.handle(req)` directly against an in-process instance.
 */
export function buildApp() {
  // Global request body ceiling (DoS hardening): cap any single request body at
  // 2 MiB. `serve.maxRequestBodySize` is the Bun.serve option Elysia forwards
  // (Elysia 1.4 `ElysiaConfig.serve: Partial<Serve>` → Bun `Serve.Options`).
  return new Elysia({ serve: { maxRequestBodySize: 2 * 1024 * 1024 } })
    .state('log', rootLogger)
    .use(
      cors({
        origin: env.WEB_ORIGIN,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        exposeHeaders: ['x-request-id'],
      }),
    )
    .use(swagger({ path: '/docs' }))
    // Request ID + structured logger — runs first so every other hook / handler
    // can attach to the same child logger through `store.log`.
    .onRequest(({ request, set, store }) => {
      const requestId = pickRequestId(request.headers);
      const url = new URL(request.url);
      const child = requestLogger({
        requestId,
        method: request.method,
        path: url.pathname,
      });
      (store as { log: typeof rootLogger }).log = child;
      set.headers['x-request-id'] = requestId;
      child.debug('request.start');
    })
    // IP-based rate limiter for the auth surface. Runs before `.mount(auth.handler)`
    // in authPlugin, so any 429 short-circuits BetterAuth entirely.
    .onRequest(({ request, set }) => {
      const url = new URL(request.url);
      const path = url.pathname;
      const method = request.method;
      if (method !== 'POST') return;
      const rule =
        path === '/api/auth/sign-in/email'
          ? AUTH_RATE_RULES.signIn
          : path === '/api/auth/sign-up/email'
            ? AUTH_RATE_RULES.signUp
            : path === '/api/auth/forget-password' || path === '/api/auth/forgot-password'
              ? AUTH_RATE_RULES.forgot
              : null;
      if (!rule) return;
      const ip = clientIpFromRequest(request);
      const check = rateLimitCheck(ip, rule);
      if (check.allowed) return;
      const retryS = Math.ceil(check.retryAfterMs / 1000);
      set.status = 429;
      set.headers['retry-after'] = String(retryS);
      return { error: 'rate_limited', retryAfterSeconds: retryS };
    })
    .use(authPlugin)
    .get('/health', async ({ status, store }) => {
      const log = (store as { log?: typeof rootLogger }).log ?? rootLogger;
      try {
        const ping = await dbPing();
        return { ok: true, now: new Date().toISOString(), db: ping };
      } catch (err) {
        log.error({ err }, 'health.db_ping_failed');
        return status(503, {
          ok: false,
          now: new Date().toISOString(),
          db: { ok: false, error: String(err) },
        });
      }
    })
    .onError(({ code, error, status, store }) => {
      const log = (store as { log?: typeof rootLogger }).log ?? rootLogger;
      if (code === 'VALIDATION') {
        log.warn({ code, err: String(error) }, 'validation');
        return status(400, { error: 'ValidationError', detail: String(error) });
      }
      if (code === 'NOT_FOUND') {
        return status(404, { error: 'NotFound' });
      }
      log.error({ code, err: error }, 'unhandled');
      return status(500, { error: 'InternalServerError' });
    })
    .use(profileModule)
    .use(decksModule)
    .use(noteTypesModule)
    .use(notesModule)
    .use(cardsModule)
    .use(cardsSimilarModule)
    .use(graphModule)
    .use(deckOptionsModule)
    .use(filteredDecksModule)
    .use(reviewsModule)
    .use(statsModule)
    .use(mediaModule)
    .use(aiModule)
    .use(chatModule)
    .use(notebooksModule)
    .use(sourcesModule)
    .use(libraryModule);
}

export type App = ReturnType<typeof buildApp>;
