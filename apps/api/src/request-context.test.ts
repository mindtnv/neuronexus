import { describe, expect, test } from 'bun:test';
import pino, { type Logger } from 'pino';
import { createLoggerOptions } from './logger.ts';

// This suite injects the DB ping and never opens these dependencies, but the
// production env module validates their presence at import time.
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/neuronexus_test';
process.env.TEST_DATABASE_URL ??= process.env.DATABASE_URL;
process.env.BETTER_AUTH_URL ??= 'http://localhost:3000';
process.env.BETTER_AUTH_SECRET ??= 'request-context-test-secret-32-bytes';
process.env.S3_ENDPOINT ??= 'http://localhost:9000';
process.env.S3_BUCKET ??= 'test';
process.env.S3_ACCESS_KEY_ID ??= 'test';
process.env.S3_SECRET_ACCESS_KEY ??= 'test-secret';
process.env.S3_PUBLIC_BASE_URL ??= 'http://localhost:9000/test';

const { buildApp } = await import('./app.ts');

function captureLogger(): { log: Logger; rows: Array<Record<string, unknown>> } {
  const rows: Array<Record<string, unknown>> = [];
  const destination = {
    write(chunk: string) {
      rows.push(JSON.parse(chunk) as Record<string, unknown>);
    },
  };
  return {
    log: pino(createLoggerOptions({ nodeEnv: 'production', level: 'debug' }), destination),
    rows,
  };
}

function completionRows(rows: Array<Record<string, unknown>>) {
  return rows.filter((row) => row.event === 'http.request.completed');
}

async function waitForCompletions(rows: Array<Record<string, unknown>>, count: number): Promise<void> {
  for (let i = 0; i < 20 && completionRows(rows).length < count; i += 1) {
    await Bun.sleep(1);
  }
}

describe('request context lifecycle', () => {
  test('returns and logs one upstream request id on a successful response', async () => {
    const { log, rows } = captureLogger();
    const app = buildApp({
      logger: log,
      pingDb: async () => ({ ok: true as const, latencyMs: 2 }),
    });

    const response = await app.handle(
      new Request('http://localhost/health?token=hidden', {
        headers: { 'x-request-id': 'edge-request-42' },
      }),
    );
    await waitForCompletions(rows, 1);

    expect(response.status).toBe(200);
    expect(response.headers.get('x-request-id')).toBe('edge-request-42');
    const completed = completionRows(rows);
    expect(completed).toHaveLength(1);
    expect(completed[0]).toMatchObject({
      requestId: 'edge-request-42',
      method: 'GET',
      path: '/health',
      status: 200,
    });
    expect(completed[0]!.durationMs).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(completed[0])).not.toContain('hidden');
  });

  test('uses one request context for an error and returns only a safe health failure', async () => {
    const { log, rows } = captureLogger();
    const app = buildApp({
      logger: log,
      pingDb: async () => {
        throw new Error('postgres password=super-secret');
      },
    });

    const response = await app.handle(
      new Request('http://localhost/health', {
        headers: { 'x-request-id': 'failed-request' },
      }),
    );
    await waitForCompletions(rows, 1);
    const body = (await response.json()) as { db: { error: string } };

    expect(response.status).toBe(503);
    expect(body.db.error).toBe('unavailable');
    expect(rows.find((row) => row.msg === 'health.db_ping_failed')).toMatchObject({
      requestId: 'failed-request',
    });
    expect(completionRows(rows)).toEqual([
      expect.objectContaining({ requestId: 'failed-request', status: 503 }),
    ]);
    expect(JSON.stringify(rows)).not.toContain('super-secret');
  });

  test('rejects unsafe request ids and normalizes high-cardinality paths', async () => {
    const { log, rows } = captureLogger();
    const app = buildApp({ logger: log, pingDb: async () => ({ ok: true as const, latencyMs: 1 }) });

    const response = await app.handle(
      new Request(
        'http://localhost/missing/0198f57b-8f04-7abc-9c1e-001122334455/123?token=hidden',
        { headers: { 'x-request-id': 'unsafe id with spaces' } },
      ),
    );
    await waitForCompletions(rows, 1);
    const requestId = response.headers.get('x-request-id') ?? '';

    expect(response.status).toBe(404);
    expect(requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(completionRows(rows)).toEqual([
      expect.objectContaining({
        requestId,
        path: '/missing/:uuid/:id',
        status: response.status,
      }),
    ]);
  });

  test('keeps concurrent request ids isolated', async () => {
    const { log, rows } = captureLogger();
    let call = 0;
    const app = buildApp({
      logger: log,
      pingDb: async () => {
        call += 1;
        await new Promise((resolve) => setTimeout(resolve, call === 1 ? 15 : 1));
        return { ok: true as const, latencyMs: 1 };
      },
    });

    await Promise.all([
      app.handle(new Request('http://localhost/health', { headers: { 'x-request-id': 'slow-a' } })),
      app.handle(new Request('http://localhost/health', { headers: { 'x-request-id': 'fast-b' } })),
    ]);
    await waitForCompletions(rows, 2);

    const completed = completionRows(rows);
    expect(completed).toHaveLength(2);
    expect(new Set(completed.map((row) => row.requestId))).toEqual(new Set(['slow-a', 'fast-b']));
  });

  test('validation diagnostics omit submitted values', async () => {
    const { log, rows } = captureLogger();
    const app = buildApp({ logger: log, pingDb: async () => ({ ok: true as const, latencyMs: 1 }) });

    const response = await app.handle(
      new Request('http://localhost/notes', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-request-id': 'validation-request',
        },
        body: JSON.stringify({
          noteTypeId: 'not-a-uuid',
          deckId: 'also-not-a-uuid',
          fieldValues: { password: 'submitted-super-secret' },
        }),
      }),
    );
    await waitForCompletions(rows, 1);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'ValidationError',
      detail: 'Invalid request',
    });
    expect(rows.find((row) => row.event === 'http.validation.failed')).toMatchObject({
      requestId: 'validation-request',
      code: 'VALIDATION',
    });
    expect(JSON.stringify(rows)).not.toContain('submitted-super-secret');
  });
});
