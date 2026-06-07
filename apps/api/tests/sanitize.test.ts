// Sanitizer unit tests (Milestone 1, Phase 4). The server save edge MUST
// neutralize an mXSS corpus — not just three toy vectors (PRE-MORTEM #1). These
// assert that `sanitizeFieldHtml` strips script/event-handler/javascript:/SVG/
// foreignobject/img/malformed vectors while preserving the allowlisted
// formatting tags.

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MEDIA_TOKEN_RE, SANITIZE_CONFIG, sanitizeFieldHtml, sanitizeFieldValues } from '../src/sanitize.ts';

/** A clean output must contain no executable / dangerous markers. */
function isNeutralized(out: string): boolean {
  const lower = out.toLowerCase();
  return (
    !lower.includes('<script') &&
    !lower.includes('</script') &&
    !lower.includes('javascript:') &&
    !lower.includes('onerror') &&
    !lower.includes('onload') &&
    !lower.includes('onclick') &&
    !lower.includes('<iframe') &&
    !lower.includes('<svg') &&
    !lower.includes('<img') &&
    !lower.includes('<foreignobject') &&
    !lower.includes('<style')
  );
}

describe('sanitizeFieldHtml — mXSS corpus', () => {
  const corpus = [
    '<script>alert(1)</script>',
    '<SCRIPT SRC=//evil.test/x.js></SCRIPT>',
    '<img src=x onerror=alert(1)>',
    '<IMG SRC="javascript:alert(1)">',
    '<a href="javascript:alert(1)">click</a>',
    '<div onclick="alert(1)">x</div>',
    '<body onload=alert(1)>',
    '<svg><script>alert(1)</script></svg>',
    '<svg/onload=alert(1)>',
    '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)></style></mglyph></mtext></math>',
    '<foreignObject><iframe src="javascript:alert(1)"></iframe></foreignObject>',
    '<iframe src="javascript:alert(1)"></iframe>',
    '<style>body{background:url("javascript:alert(1)")}</style>',
    '<input autofocus onfocus=alert(1)>',
    '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
    '<!--<img src=x onerror=alert(1)>-->',
    '<<script>alert(1)//<</script>',
    '<scr<script>ipt>alert(1)</scr</script>ipt>',
    '<a href="jav&#x09;ascript:alert(1)">x</a>',
    '<a href="javascript:alert(1)">x</a>',
  ];

  for (const vector of corpus) {
    test(`neutralizes: ${vector.slice(0, 50)}`, () => {
      const out = sanitizeFieldHtml(vector);
      expect(isNeutralized(out)).toBe(true);
    });
  }
});

describe('sanitizeFieldHtml — preserves allowlisted formatting', () => {
  test('keeps b/i/em/strong/u/p/ul/ol/li/br', () => {
    const html =
      '<p>Hello <b>bold</b> <i>italic</i> <em>em</em> <strong>s</strong> <u>u</u><br><ul><li>one</li></ul></p>';
    const out = sanitizeFieldHtml(html);
    expect(out).toContain('<b>bold</b>');
    expect(out).toContain('<i>italic</i>');
    expect(out).toContain('<li>one</li>');
    expect(out).toContain('<br');
  });

  test('keeps span/div class but drops other attributes', () => {
    const out = sanitizeFieldHtml('<span class="hl" style="color:red" onclick="x()">t</span>');
    expect(out).toContain('class="hl"');
    expect(out.toLowerCase()).not.toContain('onclick');
    expect(out.toLowerCase()).not.toContain('style');
  });

  test('plain text passes through unchanged', () => {
    expect(sanitizeFieldHtml('Der Hund')).toBe('Der Hund');
  });

  test('non-string input degrades to empty string', () => {
    // @ts-expect-error — exercising the runtime guard
    expect(sanitizeFieldHtml(null)).toBe('');
    // @ts-expect-error — exercising the runtime guard
    expect(sanitizeFieldHtml(undefined)).toBe('');
  });
});

describe('sanitizeFieldValues', () => {
  test('sanitizes every value, preserves field names', () => {
    const out = sanitizeFieldValues({
      Front: '<b>Hund</b><script>x</script>',
      Back: 'dog<img src=x onerror=alert(1)>',
    });
    expect(out.Front).toBe('<b>Hund</b>');
    expect(out.Back.toLowerCase()).not.toContain('onerror');
    expect(Object.keys(out)).toEqual(['Front', 'Back']);
  });
});

// ── Editor-rework gating spike: pin the size/code invariants the rework builds
// on, against the REAL server config (apps/api/src/sanitize.ts). These are the
// SERVER-edge halves; the matching CLIENT-edge halves live in
// apps/web/src/lib/sanitize-img.test.ts. Together they pin the documented
// server-strip / client-keep `img.class` asymmetry and the `width`-as-size-carrier
// decision so a sanitizer-config drift fails CI.
describe('sanitizeFieldHtml — editor-rework size/code invariants (server edge)', () => {
  // (a) `<img class>` is STRIPPED on the SERVER edge. img.class is NOT in
  // allowedAttributes.img (src/alt/width/height only) and transformTags.img
  // rebuilds the attribute set, so class never survives a save. This is the
  // server half of the documented server-strip/client-keep asymmetry: class on
  // img never round-trips (save strips it) — which is WHY image sizing uses the
  // `width` attribute, not a class.
  test('(a) img class is stripped on save', () => {
    const out = sanitizeFieldHtml(`<img src="/m/3f29c1a8-5b6e-4d2a-9c10-7e8f4a2b6d11" class="nn-img-m">`);
    expect(out.toLowerCase()).toContain('<img');
    expect(out.toLowerCase()).not.toContain('class=');
  });

  // (c) `<img width="320">` (integer) — width is KEPT (digits-only clamp in
  // transformTags.img). The size carrier that survives the server edge.
  test('(c) integer img width is kept', () => {
    const out = sanitizeFieldHtml(`<img src="/m/3f29c1a8-5b6e-4d2a-9c10-7e8f4a2b6d11" width="320">`);
    expect(out).toContain('width="320"');
  });

  // (d) `<img width="50%">` (non-integer) — width is STRIPPED on the server edge
  // (the digits-only `/^[0-9]+$/` clamp rejects `%`). Only integer px widths
  // round-trip, so the resize presets must emit bare integers.
  test('(d) non-integer img width is stripped on save', () => {
    const out = sanitizeFieldHtml(`<img src="/m/3f29c1a8-5b6e-4d2a-9c10-7e8f4a2b6d11" width="50%">`);
    expect(out.toLowerCase()).toContain('<img');
    expect(out).not.toContain('50%');
    expect(out.toLowerCase()).not.toContain('width=');
  });

  // (e) `<span class="nn-code">` — class is KEPT on the server edge (span:['class']
  // in allowedAttributes). This is the inline-code carrier that round-trips, in
  // contrast to img.class which does not.
  test('(e) span nn-code class is kept', () => {
    const out = sanitizeFieldHtml('<span class="nn-code">x = 1</span>');
    expect(out).toContain('class="nn-code"');
    expect(out).toContain('x = 1');
  });

  // (f) `<code>` and `<a>` are now ALLOWED tags (rich-content A4): markdown
  // emits `<code>` for inline/fenced code and `<a>` for explicit links. <code>
  // keeps a `class` (hljs/language tokens); <a> keeps a valid-scheme href.
  // INVERTED from the M1/M2 "tags dropped" pin — both tags now round-trip.
  test('(f) code and a tags are KEPT (rich-content A4)', () => {
    const codeOut = sanitizeFieldHtml('<code class="language-js">const x</code>');
    expect(codeOut.toLowerCase()).toContain('<code');
    expect(codeOut).toContain('class="language-js"');
    expect(codeOut).toContain('const x');
    const aOut = sanitizeFieldHtml('<a href="https://x.test">link text</a>');
    expect(aOut.toLowerCase()).toContain('<a');
    expect(aOut).toContain('href="https://x.test"');
    expect(aOut).toContain('link text');
  });
});

// ── Step 0 / Step 4 bypass corpus (SERVER edge, executable now). The rich-content
// allow-list (A4/B3) adds <a href> (http/https/mailto) plus <pre>/<code>/headings/
// blockquote/table tags. These pin the server keep/drop contract so a config drift
// fails CI; the matching CLIENT-edge halves live in
// apps/web/src/lib/sanitize-img.test.ts (the two edges must agree byte-for-byte).
describe('sanitizeFieldHtml — Step 4 rich-content allow-list (server edge)', () => {
  // <a> keep/drop by scheme (plan B3). Valid scheme → tag + href KEEP (positive
  // proof href survives). Invalid scheme → tag KEPT, href DROPPED (NOT element
  // removal — distinct from img). The client edge mirrors this exactly.
  test('<a href="https://…"> is KEPT with href (positive)', () => {
    const out = sanitizeFieldHtml('<a href="https://ok.test/p">x</a>');
    expect(out.toLowerCase()).toContain('<a');
    expect(out).toContain('href="https://ok.test/p"');
    expect(out).toContain('>x</a>');
  });

  test('<a href="mailto:…"> is KEPT with href', () => {
    const out = sanitizeFieldHtml('<a href="mailto:a@b.test">mail</a>');
    expect(out.toLowerCase()).toContain('<a');
    expect(out).toContain('href="mailto:a@b.test"');
  });

  test('<a href="javascript:…"> keeps the tag, drops the href (drop attr, keep tag)', () => {
    const out = sanitizeFieldHtml('<a href="javascript:alert(1)">x</a>');
    expect(out.toLowerCase()).toContain('<a');
    expect(out.toLowerCase()).not.toContain('href');
    expect(out.toLowerCase()).not.toContain('javascript:');
    expect(out).toContain('>x</a>');
  });

  test('<a href="data:…"> drops the href (data: scheme not allowed)', () => {
    const out = sanitizeFieldHtml('<a href="data:text/html,<script>alert(1)</script>">x</a>');
    expect(out.toLowerCase()).toContain('<a');
    expect(out.toLowerCase()).not.toContain('href');
    expect(out.toLowerCase()).not.toContain('data:');
  });

  test('<pre><code class="language-js"> round-trips with class', () => {
    const out = sanitizeFieldHtml('<pre><code class="language-js">const x = 1;</code></pre>');
    expect(out.toLowerCase()).toContain('<pre');
    expect(out.toLowerCase()).toContain('<code');
    expect(out).toContain('class="language-js"');
    expect(out).toContain('const x = 1;');
  });

  test('headings h1-h6 and blockquote are kept', () => {
    const out = sanitizeFieldHtml(
      '<h1>a</h1><h2>b</h2><h3>c</h3><h4>d</h4><h5>e</h5><h6>f</h6><blockquote>q</blockquote>',
    );
    for (const tag of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote']) {
      expect(out.toLowerCase()).toContain(`<${tag}`);
    }
  });

  test('table/thead/tbody/tr/th/td are kept', () => {
    const out = sanitizeFieldHtml(
      '<table><thead><tr><th>H</th></tr></thead><tbody><tr><td>C</td></tr></tbody></table>',
    );
    for (const tag of ['table', 'thead', 'tbody', 'tr', 'th', 'td']) {
      expect(out.toLowerCase()).toContain(`<${tag}`);
    }
  });

  test('th/td colspan/rowspan are dropped (narrower surface)', () => {
    const out = sanitizeFieldHtml('<table><tr><td colspan="2" rowspan="3">x</td></tr></table>');
    expect(out.toLowerCase()).toContain('<td');
    expect(out.toLowerCase()).not.toContain('colspan');
    expect(out.toLowerCase()).not.toContain('rowspan');
  });

  // Fenced-code escape attempt: a `</code><script>` payload inside a code block.
  // The <code>/<pre> tags survive, but the <script> is dropped whole.
  test('fenced-code escape </code><script> drops the script', () => {
    const out = sanitizeFieldHtml('<pre><code>x</code><script>alert(1)</script></pre>');
    expect(out.toLowerCase()).not.toContain('<script');
    expect(out.toLowerCase()).not.toContain('</script');
    expect(out.toLowerCase()).toContain('<code');
  });

  // Step 5 (plan A1a/steelman): markdown is rendered CLIENT-SIDE only; it reaches
  // the server save edge as TEXT, never HTML. The server sanitizer has NO
  // autolinker, so a bare URL in a field value is preserved as plain text and
  // NEVER becomes an <a> here (the client edge — render-card — proves the
  // matching linkify:false render-path behavior). This pins that the server never
  // synthesizes a link from text.
  test('server does not autolink a bare URL (no markdown / linkify on the save edge)', () => {
    const out = sanitizeFieldHtml('see http://example.test/x now');
    expect(out.toLowerCase()).not.toContain('<a');
    expect(out).toContain('http://example.test/x');
  });

  // Mermaid SVG is a CLIENT-only concern (mermaid renders in the browser via the
  // dedicated MERMAID_DOMPURIFY_CONFIG sink in render-card.tsx — see the SVG
  // bypass corpus in apps/web/src/lib/sanitize-img.test.ts). The server save edge
  // never sees mermaid SVG (field values reach it as markdown TEXT), so there is
  // no server-side mermaid vector to pin here.
});

// ── Editor-rework cross-edge byte-identical guard. The two sanitizer edges
// (server apps/api/src/sanitize.ts, client apps/web/src/lib/render-card.tsx) MUST
// agree byte-for-byte on the media-token regex and the allowed-tags list, or an
// img/token kept by one edge could be dropped by the other (or vice versa). We
// STRING-SCRAPE the client file rather than importing it: render-card.tsx is a
// 'use client' module with DOM/DOMPurify/KaTeX deps that don't load cleanly in
// this server-side bun:test context. The server side imports its real values.
describe('sanitizer cross-edge byte-identical guard (editor rework Step 0)', () => {
  const repoRoot = new URL('../../../', import.meta.url).pathname;
  const clientSrc = readFileSync(
    join(repoRoot, 'apps/web/src/lib/render-card.tsx'),
    'utf8',
  );

  test('MEDIA_TOKEN_RE.source is identical across both edges', () => {
    // Scrape the client literal: `MEDIA_TOKEN_RE =\n  /…/;`
    const m = clientSrc.match(/MEDIA_TOKEN_RE\s*=\s*(\/[^\n]*\/)\s*;/);
    expect(m).not.toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const clientLiteral = m![1];
    // Reconstruct the client regex source from its literal text and compare to
    // the server's live .source (anchors + char classes must match exactly).
    const clientSource = clientLiteral.slice(1, -1); // strip leading/trailing `/`
    expect(clientSource).toBe(MEDIA_TOKEN_RE.source);
  });

  test('server allowed-tags list equals client ALLOWED_TAGS list', () => {
    // Scrape the client ALLOWED_TAGS array literal.
    const m = clientSrc.match(/ALLOWED_TAGS:\s*\[([^\]]*)\]/);
    expect(m).not.toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const clientTags = m![1]
      .split(',')
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
    expect(clientTags).toEqual(SANITIZE_CONFIG.allowedTags);
  });
});

describe('SANITIZE_CONFIG shape (referenced by Phase 4b + client edge)', () => {
  test('allowlist is the pinned rich-content set (M1 + M2 img + A4)', () => {
    // Rich-content allow-list (plan A4/B3): M1+M2 narrow set PLUS markdown block/
    // inline tags. The order here MUST match apps/api/src/sanitize.ts exactly
    // (and, via the cross-edge equality scrape above, the client ALLOWED_TAGS).
    expect(SANITIZE_CONFIG.allowedTags).toEqual([
      'b', 'i', 'em', 'strong', 'u', 'ul', 'ol', 'li', 'br', 'hr', 'p', 'span', 'div', 'img',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code', 'a',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
    ]);
    expect(SANITIZE_CONFIG.allowedAttributes).toEqual({
      span: ['class'],
      div: ['class'],
      img: ['src', 'alt', 'width', 'height'],
      // code/pre carry highlight.js class tokens; <a> carries href only.
      code: ['class'],
      pre: ['class'],
      a: ['href'],
    });
    // img is allowed in M2, but ONLY as the relative media token — no scheme
    // may ever ride on it (see imgExclusiveFilter + MEDIA_TOKEN_RE).
    expect(SANITIZE_CONFIG.allowedTags).toContain('img');
    // <a href> is restricted to http/https/mailto (mailto rides on the
    // per-tag scheme list, not the global allowedSchemes); img is schemeless.
    expect(SANITIZE_CONFIG.allowedSchemesByTag).toEqual({
      img: [],
      a: ['http', 'https', 'mailto'],
    });
    expect(SANITIZE_CONFIG.allowProtocolRelative).toBe(false);
    // <a> is now an ALLOWED tag (rich-content A4) — links round-trip with a
    // valid scheme; an invalid scheme drops the href but keeps the bare tag.
    expect(SANITIZE_CONFIG.allowedTags).toContain('a');
  });
});
