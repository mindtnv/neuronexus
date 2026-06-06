// Sanitizer unit tests (Milestone 1, Phase 4). The server save edge MUST
// neutralize an mXSS corpus — not just three toy vectors (PRE-MORTEM #1). These
// assert that `sanitizeFieldHtml` strips script/event-handler/javascript:/SVG/
// foreignobject/img/malformed vectors while preserving the allowlisted
// formatting tags.

import { describe, expect, test } from 'bun:test';
import { SANITIZE_CONFIG, sanitizeFieldHtml, sanitizeFieldValues } from '../src/sanitize.ts';

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

describe('SANITIZE_CONFIG shape (referenced by Phase 4b + client edge)', () => {
  test('allowlist is the pinned narrow set', () => {
    expect(SANITIZE_CONFIG.allowedTags).toEqual([
      'b', 'i', 'em', 'strong', 'u', 'ul', 'ol', 'li', 'br', 'hr', 'p', 'span', 'div',
    ]);
    expect(SANITIZE_CONFIG.allowedAttributes).toEqual({ span: ['class'], div: ['class'] });
    // img is NOT in the allowlist (M1 strips media).
    expect(SANITIZE_CONFIG.allowedTags).not.toContain('img');
    expect(SANITIZE_CONFIG.allowedTags).not.toContain('a');
  });
});
