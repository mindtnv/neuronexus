import { afterEach, describe, expect, test } from 'bun:test';
import { ApiError } from './api.ts';
import { streamChat } from './chat-stream.ts';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('chat stream failure correlation', () => {
  test('non-success responses surface a typed error with request correlation', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: 'chat_upstream_failed' }), {
        status: 503,
        headers: { 'x-request-id': 'chat-503' },
      })) as unknown as typeof fetch;

    let received: { message: string; error?: ApiError } | undefined;
    await streamChat('conversation', 'hello', {
      onError: (message, error) => {
        received = { message, error };
      },
    });

    expect(received?.error).toBeInstanceOf(ApiError);
    expect(received?.error).toMatchObject({ status: 503, requestId: 'chat-503' });
    expect(received?.message).toContain('chat-503');
  });

  test('a deliberate abort keeps the specialized silent behavior', async () => {
    globalThis.fetch = (async () => {
      throw new DOMException('aborted', 'AbortError');
    }) as unknown as typeof fetch;
    let errorCalls = 0;

    await streamChat('conversation', 'hello', {
      onError: () => {
        errorCalls += 1;
      },
    });

    expect(errorCalls).toBe(0);
  });
});
