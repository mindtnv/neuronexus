// Pure unit tests for the shared SSE frame splitter (`parseSseLines`) and the
// agentic stream parser's tool-call assembly via an injected fake client. No DB,
// no network, no env keys — feeds a synthetic ReadableStream / scripted chunks.

import { describe, expect, test, afterEach } from 'bun:test';
import {
  parseSseLines,
  SSE_DONE,
  chatStreamAgentic,
  __setAiClientForTests,
  __resetAiClientForTests,
  type AgentStreamChunk,
} from './openai-client.ts';

/** Build a ReadableStream reader from a list of string chunks. */
function readerOf(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
  return stream.getReader();
}

async function collect(
  it: AsyncIterable<unknown>,
): Promise<unknown[]> {
  const out: unknown[] = [];
  for await (const v of it) out.push(v);
  return out;
}

describe('parseSseLines — SSE frame splitting', () => {
  test('parses one frame per blank-line-separated data: line', async () => {
    const out = await collect(
      parseSseLines(readerOf(['data: {"a":1}\n\n', 'data: {"b":2}\n\n'])),
    );
    expect(out).toEqual([{ a: 1 }, { b: 2 }]);
  });

  test('reassembles a frame split across multiple reads', async () => {
    // The JSON payload is delivered in three fragments; no complete frame until
    // the trailing blank line arrives.
    const out = await collect(
      parseSseLines(readerOf(['data: {"hel', 'lo":', '"world"}\n\n'])),
    );
    expect(out).toEqual([{ hello: 'world' }]);
  });

  test('stops at [DONE] and yields the sentinel', async () => {
    const out = await collect(
      parseSseLines(readerOf(['data: {"a":1}\n\n', 'data: [DONE]\n\n', 'data: {"never":1}\n\n'])),
    );
    expect(out).toEqual([{ a: 1 }, SSE_DONE]);
  });

  test('skips malformed/partial JSON lines without throwing', async () => {
    const out = await collect(
      parseSseLines(readerOf(['data: {bad json\n\n', 'data: {"ok":1}\n\n'])),
    );
    expect(out).toEqual([{ ok: 1 }]);
  });

  test('ignores non-data lines (comments / event:)', async () => {
    const out = await collect(
      parseSseLines(readerOf([': keep-alive\n\n', 'event: foo\ndata: {"x":1}\n\n'])),
    );
    expect(out).toEqual([{ x: 1 }]);
  });
});

describe('chatStreamAgentic — injected fake seam', () => {
  afterEach(() => __resetAiClientForTests());

  test('routes through injected.chatStreamAgentic verbatim', async () => {
    const scripted: AgentStreamChunk[] = [
      { type: 'reasoning', text: 'thinking' },
      { type: 'tool_call_delta', index: 0, id: 'c1', name: 'search_cards', argsFragment: '{"que' },
      { type: 'tool_call_delta', index: 0, argsFragment: 'ry":"x"}' },
      { type: 'finish', reason: 'tool_calls' },
    ];
    __setAiClientForTests({
      // eslint-disable-next-line require-yield
      async *chatStreamAgentic() {
        for (const c of scripted) yield c;
      },
    });
    const out = (await collect(chatStreamAgentic([{ role: 'user', content: 'x' }]))) as AgentStreamChunk[];
    expect(out).toEqual(scripted);
  });
});

describe('tool-call assembler (index-keyed)', () => {
  // Mirrors the loop's assembly logic: fragments accumulate per index, parsed
  // only once finalized. Two interleaved calls with out-of-order indices.
  function assemble(deltas: AgentStreamChunk[]): { id: string; name: string; arguments: string }[] {
    const partials = new Map<number, { id: string; name: string; args: string }>();
    for (const d of deltas) {
      if (d.type !== 'tool_call_delta') continue;
      const cur = partials.get(d.index) ?? { id: '', name: '', args: '' };
      if (d.id) cur.id = d.id;
      if (d.name) cur.name = d.name;
      if (d.argsFragment) cur.args += d.argsFragment;
      partials.set(d.index, cur);
    }
    return [...partials.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, p]) => ({ id: p.id, name: p.name, arguments: p.args }));
  }

  test('assembles two interleaved fragmented calls in index order', () => {
    const deltas: AgentStreamChunk[] = [
      { type: 'tool_call_delta', index: 1, id: 'b', name: 'web_search', argsFragment: '{"q":' },
      { type: 'tool_call_delta', index: 0, id: 'a', name: 'search_cards', argsFragment: '{"query":' },
      { type: 'tool_call_delta', index: 1, argsFragment: '"foo"}' },
      { type: 'tool_call_delta', index: 0, argsFragment: '"bar"}' },
    ];
    const calls = assemble(deltas);
    expect(calls).toEqual([
      { id: 'a', name: 'search_cards', arguments: '{"query":"bar"}' },
      { id: 'b', name: 'web_search', arguments: '{"q":"foo"}' },
    ]);
    expect(JSON.parse(calls[0]!.arguments)).toEqual({ query: 'bar' });
    expect(JSON.parse(calls[1]!.arguments)).toEqual({ q: 'foo' });
  });
});
