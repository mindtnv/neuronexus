// C5 — standing agent-instructions integration tests.
//
// CONTRACT (read from apps/api/src/modules/profile.ts + ai.ts + rag-prompt.ts):
//   * PATCH /profile accepts `agentInstructions` (≤2000 chars); whitespace-only
//     clears to NULL; >2000 → 400 ValidationError. GET /profile returns it.
//   * Every chat turn (stream/resume/regenerate) loads the instructions
//     pre-flush and injects them into the system prompt inside the guardrailed
//     `<user_instructions>` section.

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { buildApp } from '../src/app.ts';
import {
  __resetAiClientForTests,
  __setAiClientForTests,
  type AgentChatMessage,
  type AgentStreamChunk,
} from '../src/ai/openai-client.ts';
import { callApp, resetTestDb, signUpAndCookie, uniqueEmail } from './helpers.ts';

const app = buildApp();

let capturedAgentMessages: AgentChatMessage[][] = [];
function capturingStream() {
  return async function* (messages: AgentChatMessage[]): AsyncIterable<AgentStreamChunk> {
    capturedAgentMessages.push(messages);
    yield { type: 'content', text: 'Ok.' };
    yield { type: 'finish', reason: 'stop' };
  };
}
async function drain(res: Response): Promise<void> {
  const reader = res.body!.getReader();
  for (;;) {
    const { done } = await reader.read();
    if (done) break;
  }
}
async function createConversation(cookie: string): Promise<string> {
  const res = await callApp(app, 'POST', '/chat/conversations', { cookie, body: {} });
  return (await res.json<{ id: string }>()).id;
}
function streamReq(cookie: string, convId: string, content: string): Promise<Response> {
  return app.handle(
    new Request(`http://localhost/chat/conversations/${convId}/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ content }),
    }),
  );
}
/** GET /profile first (lazy-creates the row), then PATCH it. */
async function setInstructions(cookie: string, value: string): Promise<Response> {
  await callApp(app, 'GET', '/profile', { cookie });
  return callApp(app, 'PATCH', '/profile', { cookie, body: { agentInstructions: value } });
}

describe('profile — agent instructions (C5)', () => {
  beforeEach(async () => {
    await resetTestDb();
    capturedAgentMessages = [];
  });
  afterEach(() => {
    __resetAiClientForTests();
  });

  test('set / read / clear round-trip', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    const res = await setInstructions(cookie, 'Answer in German. Keep it short.');
    expect(res.status).toBe(200);
    expect((await res.json<{ agentInstructions: string }>()).agentInstructions).toBe(
      'Answer in German. Keep it short.',
    );

    const get = await callApp(app, 'GET', '/profile', { cookie });
    expect((await get.json<{ agentInstructions: string }>()).agentInstructions).toBe(
      'Answer in German. Keep it short.',
    );

    // Whitespace-only clears to NULL.
    const cleared = await callApp(app, 'PATCH', '/profile', {
      cookie,
      body: { agentInstructions: '   ' },
    });
    expect((await cleared.json<{ agentInstructions: string | null }>()).agentInstructions).toBeNull();
  });

  test('over-2000 chars → 400 ValidationError', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    await callApp(app, 'GET', '/profile', { cookie });
    const res = await callApp(app, 'PATCH', '/profile', {
      cookie,
      body: { agentInstructions: 'x'.repeat(2001) },
    });
    expect(res.status).toBe(400);
  });

  test('instructions are injected into the chat system prompt (guardrailed section)', async () => {
    __setAiClientForTests({ chatStreamAgentic: capturingStream() });
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    await setInstructions(cookie, 'Всегда отвечай по-русски и очень кратко.');
    const convId = await createConversation(cookie);

    await drain(await streamReq(cookie, convId, 'hello'));

    const system = capturedAgentMessages[0]![0]!;
    expect(system.role).toBe('system');
    expect(system.content).toContain('<user_instructions>');
    expect(system.content).toContain('Всегда отвечай по-русски и очень кратко.');
    expect(system.content).toMatch(/NEVER override/i);
  });

  test('no instructions set → no user_instructions section', async () => {
    __setAiClientForTests({ chatStreamAgentic: capturingStream() });
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    const convId = await createConversation(cookie);

    await drain(await streamReq(cookie, convId, 'hello'));

    const system = capturedAgentMessages[0]![0]!;
    expect(system.content).not.toContain('<user_instructions>');
  });
});
