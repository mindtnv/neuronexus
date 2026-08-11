import { describe, expect, test } from 'bun:test';
import { ApiError, apiErrorFromResponse, ok } from './api.ts';

describe('browser API failure correlation', () => {
  test('Eden failures retain status and x-request-id', async () => {
    const response = new Response(JSON.stringify({ error: 'upstream_failed' }), {
      status: 503,
      headers: { 'x-request-id': 'edge-503' },
    });

    try {
      await ok({
        data: null,
        error: { status: 503, value: { error: 'upstream_failed', token: 'sk-secret' } },
        response,
        status: 503,
      });
      throw new Error('expected ok() to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ status: 503, requestId: 'edge-503' });
      expect((error as Error).message).toContain('upstream_failed');
      expect((error as Error).message).toContain('edge-503');
      expect((error as Error).message).not.toContain('sk-secret');
    }
  });

  test('raw responses create bounded typed failures', async () => {
    const response = new Response(
      JSON.stringify({ error: `Bearer secret ${'x'.repeat(2000)}` }),
      { status: 502, headers: { 'x-request-id': 'raw-502' } },
    );
    const error = await apiErrorFromResponse(response, 'request_failed');

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(502);
    expect(error.requestId).toBe('raw-502');
    expect(error.message.length).toBeLessThan(400);
    expect(error.message).not.toContain('secret');
  });

  test('expected control-flow statuses retain correlation without support suffix', () => {
    const error = new ApiError('cooldown', { status: 429, requestId: 'cooldown-id' });
    expect(error.requestId).toBe('cooldown-id');
    expect(error.message).toBe('cooldown');
  });
});
