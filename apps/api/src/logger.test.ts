import { describe, expect, test } from 'bun:test';
import pino from 'pino';
import {
  createLoggerOptions,
  normalizeLogPath,
  safeError,
  safeLogUrl,
  summarizeUpstreamResponse,
} from './logger.ts';

describe('privacy-safe logging boundary', () => {
  test('normalizes identifiers and removes query/fragment/user-info from URLs', () => {
    expect(
      normalizeLogPath(
        '/cards/0198f57b-8f04-7abc-9c1e-001122334455/reviews/123?token=secret#private',
      ),
    ).toBe('/cards/:uuid/reviews/:id');
    expect(
      safeLogUrl(
        'https://alice:password@example.com/cards/0198f57b-8f04-7abc-9c1e-001122334455?api_key=sk-secret#x',
      ),
    ).toBe('https://example.com/cards/:uuid');
  });

  test('serializes errors with bounded, token-censored fields only', () => {
    const error = Object.assign(
      new Error(`provider rejected Bearer top-secret and sk-${'a'.repeat(80)} ${'x'.repeat(800)}`),
      { code: 'provider_failed', requestBody: 'must-not-appear' },
    );
    const summary = safeError(error);
    const encoded = JSON.stringify(summary);

    expect(summary.name).toBe('Error');
    expect(summary.code).toBe('provider_failed');
    expect(summary.message.length).toBeLessThanOrEqual(300);
    expect(encoded).not.toContain('top-secret');
    expect(encoded).not.toContain('sk-');
    expect(encoded).not.toContain('requestBody');
    expect(safeError({ password: 'secret', prompt: 'private card text' })).toEqual({
      name: 'NonError',
      message: 'Non-error value thrown',
    });
    expect(safeError(new Error('Failed query\nparams: private card text')).message).toBe(
      'Failed query\nparams:[REDACTED]',
    );
  });

  test('reads only a bounded allow-listed upstream error summary', async () => {
    const response = new Response(
      JSON.stringify({
        error: {
          code: 'rate_limit',
          type: 'provider_error',
          message: `Bearer secret ${'x'.repeat(20_000)}`,
          prompt: 'private input',
        },
      }),
      { status: 429 },
    );
    const summary = await summarizeUpstreamResponse(response);
    const encoded = JSON.stringify(summary);

    expect(summary.status).toBe(429);
    expect(summary.code).toBe('rate_limit');
    expect(summary.type).toBe('provider_error');
    expect((summary.message ?? '').length).toBeLessThanOrEqual(300);
    expect(encoded).not.toContain('secret');
    expect(encoded).not.toContain('private input');
    expect(encoded.length).toBeLessThan(700);
  });

  test('production logger emits one-line JSON and redacts known secret fields', () => {
    const lines: string[] = [];
    const destination = { write: (chunk: string) => lines.push(chunk) };
    const log = pino(
      createLoggerOptions({ nodeEnv: 'production', level: 'info' }),
      destination,
    );

    log.info(
      {
        event: 'contract.test',
        authorization: 'Bearer hidden',
        nested: { password: 'hidden-too' },
      },
      'contract.test',
    );

    expect(lines).toHaveLength(1);
    const row = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(row.app).toBe('neuronexus-api');
    expect(row.event).toBe('contract.test');
    expect(row.authorization).toBe('[REDACTED]');
    expect((row.nested as { password: string }).password).toBe('[REDACTED]');
    expect(row.level).toBe(30);
    expect(typeof row.time).toBe('string');
  });

  test('pre-sanitized errors remain useful when Pino serializers run', () => {
    const lines: string[] = [];
    const log = pino(createLoggerOptions({ nodeEnv: 'production', level: 'info' }), {
      write: (chunk: string) => lines.push(chunk),
    });

    log.error({ err: safeError(new Error('provider failed token=hidden')) }, 'failed');

    const row = JSON.parse(lines[0]!) as { err: { name: string; message: string } };
    expect(row.err).toEqual({ name: 'Error', message: 'provider failed token=[REDACTED]' });
  });
});
