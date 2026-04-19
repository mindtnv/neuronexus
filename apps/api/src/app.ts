import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { swagger } from '@elysiajs/swagger';
import { env } from './env.ts';
import { dbPing } from '@neuronexus/db';
import { authPlugin } from './auth-plugin.ts';
import { achievementsModule } from './modules/achievements.ts';
import { decksModule } from './modules/decks.ts';
import { cardsModule } from './modules/cards.ts';
import { reviewsModule } from './modules/reviews.ts';
import { profileModule } from './modules/profile.ts';
import { AUTH_RATE_RULES, clientIpFromRequest, rateLimitCheck } from './rate-limit.ts';
import {
  apiErrorBody,
  getRequestLogger,
  getRootLogger,
  pickRequestId,
  requestFields,
  requestLogger,
  type RequestStore,
} from './logger.ts';

/**
 * Build the full Elysia app (no .listen). Separating this from the binding
 * lets tests call `app.handle(req)` directly against an in-process instance.
 */
export function buildApp() {
  const rootLogger = getRootLogger();
  return new Elysia()
    .state('log', rootLogger)
    .state('requestId', '')
    .state('requestStartedAt', 0)
    .use(
      cors({
        origin: env.WEB_ORIGIN,
        credentials: true,
        methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: [
          'Content-Type',
          'Authorization',
          'x-forwarded-for',
          'x-client-flow-id',
          'x-client-scenario-id',
        ],
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
        clientFlowId: request.headers.get('x-client-flow-id') ?? undefined,
        clientScenarioId: request.headers.get('x-client-scenario-id') ?? undefined,
      });
      const requestStore = store as RequestStore;
      requestStore.log = child;
      requestStore.requestId = requestId;
      requestStore.requestStartedAt = Date.now();
      set.headers['x-request-id'] = requestId;
      child.debug('request.start');
    })
    .onAfterResponse(({ set, store }) => {
      const state = store as RequestStore;
      const log = getRequestLogger(store);
      const startedAt = state.requestStartedAt ?? Date.now();
      const durationMs = Date.now() - startedAt;
      const statusCode =
        typeof set.status === 'number'
          ? set.status
          : typeof set.status === 'string'
            ? Number(set.status) || 200
            : 200;
      log.info(requestFields(store, { statusCode, durationMs }), 'request.end');
    })
    // IP-based rate limiter for the auth surface. Runs before `.mount(auth.handler)`
    // in authPlugin, so any 429 short-circuits BetterAuth entirely.
    .onRequest(({ request, set, status, store }) => {
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
      const log = getRequestLogger(store);
      set.status = 429;
      set.headers['retry-after'] = String(retryS);
      log.warn(
        requestFields(store, {
          errorCode: 'AUTH_RATE_LIMITED',
          authPath: path,
          ip,
          retryAfterSeconds: retryS,
        }),
        'auth.rate_limited',
      );
      return status(
        429,
        Object.assign(apiErrorBody(store, 'AUTH_RATE_LIMITED', 'Too many requests.', {
          retryAfterSeconds: retryS,
        }), {
          retryAfterSeconds: retryS,
        }),
      );
    })
    .use(authPlugin)
    .get('/health', async ({ status, store }) => {
      const log = getRequestLogger(store);
      const startedAt = Date.now();
      try {
        const ping = await dbPing();
        return {
          ok: true,
          now: new Date().toISOString(),
          components: {
            api: { status: 'ok', latencyMs: Date.now() - startedAt },
            db: { status: 'ok', latencyMs: ping.latencyMs },
          },
          db: ping,
        };
      } catch (err) {
        log.error(
          requestFields(store, { errorCode: 'HEALTH_DB_UNAVAILABLE', err }),
          'health.db_ping_failed',
        );
        return status(503, {
          ok: false,
          now: new Date().toISOString(),
          components: {
            api: { status: 'degraded', latencyMs: Date.now() - startedAt },
            db: { status: 'error', latencyMs: null as number | null },
          },
          db: { ok: false, latencyMs: null as number | null },
          ...apiErrorBody(store, 'HEALTH_DB_UNAVAILABLE', 'Database health check failed.'),
        });
      }
    })
    .onError(({ code, error, status, store }) => {
      const log = getRequestLogger(store);
      if (code === 'VALIDATION') {
        log.warn(
          requestFields(store, {
            errorCode: 'VALIDATION_FAILED',
            code,
            err: String(error),
          }),
          'validation',
        );
        return status(
          400,
          apiErrorBody(store, 'VALIDATION_FAILED', 'Request validation failed.', String(error)),
        );
      }
      if (code === 'NOT_FOUND') {
        return status(404, apiErrorBody(store, 'RESOURCE_NOT_FOUND', 'Resource not found.'));
      }
      log.error(
        requestFields(store, {
          errorCode: 'INTERNAL_SERVER_ERROR',
          code,
          err: error,
        }),
        'unhandled',
      );
      return status(
        500,
        apiErrorBody(store, 'INTERNAL_SERVER_ERROR', 'Internal server error.'),
      );
    })
    .use(profileModule)
    .use(decksModule)
    .use(cardsModule)
    .use(reviewsModule)
    .use(achievementsModule);
}

export type App = ReturnType<typeof buildApp>;
