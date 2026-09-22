import { ensureTestDom, GlobalRegistrator } from './test-dom-setup';
import { afterAll, beforeEach, expect, test } from 'bun:test';
import { captureSourceTextSelection } from './source-text-selection';
beforeEach(ensureTestDom);
afterAll(() => { try { GlobalRegistrator.unregister(); } catch {} });
const a = '01900000-0000-7000-8000-000000000001', b = '01900000-0000-7000-8000-000000000002';
test('selection across rendered Markdown/code chunks excludes reader chrome and retains ordered anchors', async () => {
  const host = document.createElement('div'); document.body.appendChild(host);
  host.innerHTML = `<div data-chunk-id="${a}"><span>Section label</span><div data-source-text-body>A <strong>Pod</strong> groups containers.</div></div><div data-chunk-id="${b}"><div data-source-text-body><pre><code>kubectl get pods</code></pre><button>Copy</button></div></div>`;
  const range = document.createRange(); range.setStart(host.querySelector('strong')!.firstChild!,0); range.setEnd(host.querySelector('code')!.firstChild!,15);
  const selection = await captureSourceTextSelection(host, range, new Map([[a,'A **Pod** groups containers.'],[b,'```\nkubectl get pods\n```']]));
  expect(selection!.quote).toBe('Pod groups containers. kubectl get pod');
  expect(selection!.chunks.map(chunk => chunk.chunkId)).toEqual([a,b]);
  expect(selection!.chunks[0]!.start).toBe(2); expect(selection!.chunks[0]!.textHash).toHaveLength(64);
  expect(selection!.quote).not.toContain('Section'); expect(selection!.quote).not.toContain('Copy'); host.remove();
});
test('rendered formulas exclude hidden math markup and a missing raw chunk preserves a quote-only fallback', async () => {
  const host = document.createElement('div'); document.body.appendChild(host);
  host.innerHTML = `<div data-chunk-id="${a}"><div data-source-text-body>Formula <span class="katex-mathml">hidden TeX</span><span class="katex-html" aria-hidden="true">x²</span></div></div>`;
  const range = document.createRange(); range.selectNodeContents(host.querySelector('[data-source-text-body]')!);
  const selected = await captureSourceTextSelection(host,range,new Map());
  expect(selected!.quote).toBe('Formula x²'); expect(selected!.chunks).toEqual([]); host.remove();
});

test('stored normalized offsets restore across formatting and refuse changed rendered text', async () => {
  const { restoreSourceTextRange } = await import('./source-text-selection');
  const host = document.createElement('div'); document.body.appendChild(host);
  host.innerHTML = `<div data-chunk-id="${a}"><div data-source-text-body>A   <b>Pod</b> groups containers.</div></div>`;
  const body = host.querySelector<HTMLElement>('[data-source-text-body]')!, range = document.createRange();
  range.selectNodeContents(body.querySelector('b')!);
  const selected = await captureSourceTextSelection(host,range,new Map([[a,'A **Pod** groups containers.']]));
  const restored = await restoreSourceTextRange(body,selected!.chunks[0]!);
  expect(restored!.toString()).toBe('Pod');
  body.querySelector('b')!.textContent = 'Deployment';
  expect(await restoreSourceTextRange(body,selected!.chunks[0]!)).toBeNull(); host.remove();
});

test('paragraphs, line breaks and list items remain separate words in captured excerpts', async () => {
  const host = document.createElement('div'); document.body.appendChild(host);
  host.innerHTML = `<div data-chunk-id="${a}"><div data-source-text-body><p>First paragraph.</p><p>Second<br>line.</p><ul><li>One</li><li>Two</li></ul></div></div>`;
  const body = host.querySelector('[data-source-text-body]')!, range = document.createRange(); range.selectNodeContents(body);
  try {
    const result = await captureSourceTextSelection(host, range, new Map([[a, 'First paragraph.\n\nSecond\nline.\n- One\n- Two']]));
    expect(result!.quote).toBe('First paragraph. Second line. One Two');
    expect(result!.chunks).toHaveLength(1);
  } finally { host.remove(); }
});
test('oversized and outside-reader selections never produce truncated or unrelated anchors', async () => {
  const host = document.createElement('div'); document.body.appendChild(host);
  host.innerHTML = `<div data-chunk-id="${a}"><div data-source-text-body>${'x'.repeat(4001)}</div></div>`;
  const range = document.createRange(); range.selectNodeContents(host.querySelector('[data-source-text-body]')!);
  try {
    await expect(captureSourceTextSelection(host, range, new Map([[a, 'x'.repeat(4001)]]))).rejects.toThrow('context_excerpt_too_large');
    const outside = document.createRange(); outside.selectNodeContents(document.body);
    expect(await captureSourceTextSelection(host, outside, new Map())).toBeNull();
  } finally { host.remove(); }
});

test('old serialized ranges remain restorable and new block-separated ranges round-trip', async () => {
  const { restoreSourceTextRange } = await import('./source-text-selection');
  const host = document.createElement('div'); document.body.appendChild(host);
  host.innerHTML = `<div data-chunk-id="${a}"><div data-source-text-body><p>One</p><p>Two</p></div></div>`;
  const body = host.querySelector<HTMLElement>('[data-source-text-body]')!;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('OneTwo'));
  const renderedHash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  try {
    const old = await restoreSourceTextRange(body, { chunkId: a, textHash: 'a'.repeat(64), renderedHash, start: 3, end: 6 });
    expect(old!.toString()).toBe('Two');
    const range = document.createRange(); range.selectNodeContents(body);
    const captured = await captureSourceTextSelection(host, range, new Map([[a, 'One\n\nTwo']]));
    const restored = await restoreSourceTextRange(body, captured!.chunks[0]!);
    expect((await captureSourceTextSelection(host, restored!, new Map([[a, 'One\n\nTwo']])))!.quote).toBe('One Two');
  } finally { host.remove(); }
});
test('bounded surrounding context never splits a surrogate pair', async () => {
  const host = document.createElement('div'); document.body.appendChild(host);
  const text = '🧠'.repeat(100) + ' Pod ' + '🧠'.repeat(100);
  host.innerHTML = `<div data-chunk-id="${a}"><div data-source-text-body></div></div>`;
  const body = host.querySelector('[data-source-text-body]')!; body.textContent = text;
  const range = document.createRange(); range.setStart(body.firstChild!, 201); range.setEnd(body.firstChild!, 204);
  try {
    const selected = await captureSourceTextSelection(host, range, new Map([[a, text]]));
    expect(selected!.prefix).toBe('🧠'.repeat(59) + ' ');
    expect(selected!.suffix).toBe(' ' + '🧠'.repeat(59));
  } finally { host.remove(); }
});

test('the sixteen-chunk selection boundary rejects excess instead of dropping fragments', async () => {
  const host = document.createElement('div'); document.body.appendChild(host);
  const raw = new Map(Array.from({ length: 17 }, (_, index) => [`01900000-0000-7000-8000-${String(index + 1).padStart(12, '0')}`, `Part ${index}`]));
  host.innerHTML = [...raw].map(([id, text]) => `<div data-chunk-id="${id}"><div data-source-text-body>${text}</div></div>`).join('');
  try {
    const range = document.createRange(); range.selectNodeContents(host);
    await expect(captureSourceTextSelection(host, range, raw)).rejects.toThrow('context_excerpt_too_large');
    host.lastElementChild!.remove(); range.selectNodeContents(host);
    expect((await captureSourceTextSelection(host, range, raw))!.chunks).toHaveLength(16);
  } finally { host.remove(); }
});
