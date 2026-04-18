// Structured logger — pino.
//
// Dev: human-readable via pino-pretty.
// Prod: one-line JSON per log, pipeable to any log aggregator.
// Tests: `LOG_LEVEL=silent` short-circuits everything.
//
// Every request gets a child logger bound to `{ requestId, method, path }` so
// lines from the same request are trivially groupable. The logger.ts hooks
// into Elysia lifecycle via onRequest / onAfterResponse in app.ts.

import pino, { type Logger } from 'pino';

const level =
  process.env.LOG_LEVEL ??
  (process.env.NODE_ENV === 'test'
    ? 'silent'
    : process.env.NODE_ENV === 'production'
      ? 'info'
      : 'debug');

const isProd = process.env.NODE_ENV === 'production';

export const rootLogger: Logger = pino({
  level,
  base: { app: 'neuronexus-api' },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Pretty transport in dev; raw JSON in prod. pino-pretty is a devDep; if
  // somehow missing in prod, pino will just emit JSON — no crash.
  ...(isProd
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            singleLine: true,
            ignore: 'pid,hostname',
            translateTime: 'HH:MM:ss.l',
          },
        },
      }),
  // Redact sensitive fields in case someone logs an entire request/body.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'body.password',
      'body.newPassword',
      'body.token',
      '*.password',
      '*.newPassword',
      '*.token',
    ],
    censor: '[REDACTED]',
  },
});

/** Per-request child logger. `requestId` lets downstream lines group. */
export function requestLogger(opts: {
  requestId: string;
  method: string;
  path: string;
  userId?: string;
}): Logger {
  return rootLogger.child(opts);
}

/** Extract or generate a request id. Honours upstream `x-request-id` header
 *  (set by reverse proxy / load balancer) so trace IDs line up end-to-end. */
export function pickRequestId(headers: Headers): string {
  const incoming = headers.get('x-request-id');
  if (incoming && incoming.length > 0 && incoming.length <= 128) return incoming;
  return crypto.randomUUID();
}
