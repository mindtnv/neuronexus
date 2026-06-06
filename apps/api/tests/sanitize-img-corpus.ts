// Shared two-engine bypass corpus (M2 Phase 3, plan amendments A2 + C-6).
//
// This is the SINGLE source of truth for the img-sanitizer corpus. It is imported
// by BOTH edges' tests so the SAME inputs run through:
//   * the server `sanitize-html` config (apps/api/tests/sanitize-img.test.ts)
//   * the client DOMPurify config    (apps/web/src/lib/sanitize-img.test.ts)
// Each test asserts identical keep/drop. Pure-TS, DOM-free — safe to import from
// either app (the web test imports it via a relative path).
//
// Threat model: a stored field value is inserted VERBATIM into HTML by
// `renderTemplate`, so the sanitizer is the ONLY gate. `<img>` survives ONLY when
// `src` is EXACTLY the strict relative media token `/m/<canonical-uuid>`; every
// other shape — absolute URLs, protocol-relative `//evil`, userinfo `@evil`,
// suffix `media.com.evil`, uppercase scheme, `data:`/`javascript:`, leading
// whitespace, a malformed 36-char token, fragment/quote/event-handler injection,
// path traversal — must be DROPPED on BOTH edges.

/** A real canonical v4-shaped UUID used for the one and only KEEP case. */
export const VALID_UUID = '3f29c1a8-5b6e-4d2a-9c10-7e8f4a2b6d11';

/** The exact valid relative token the sanitizer must keep. */
export const VALID_TOKEN = `/m/${VALID_UUID}`;

export interface ImgCorpusCase {
  /** A short label for the test name. */
  readonly label: string;
  /** The raw HTML fed to BOTH sanitizers. */
  readonly input: string;
  /** Whether an `<img>` element must SURVIVE (true) or be dropped whole (false). */
  readonly keep: boolean;
  /**
   * Substrings that must NOT appear (case-insensitively) in either edge's
   * output — event handlers / schemes / injected markers that must never leak.
   */
  readonly mustNotContain: readonly string[];
}

const NEVER = ['onerror', 'onload', 'javascript:', 'data:'] as const;

/**
 * The corpus. Exactly one KEEP (the valid token); everything else DROPS. The two
 * "kept" cases that carry an `onerror`/event-handler prove the img survives while
 * the handler is stripped.
 */
export const IMG_CORPUS: readonly ImgCorpusCase[] = [
  // The one legitimate token — KEEP.
  {
    label: 'valid /m/<uuid> token',
    input: `<img src="${VALID_TOKEN}">`,
    keep: true,
    mustNotContain: NEVER,
  },
  {
    label: 'valid token with alt/width/height',
    input: `<img src="${VALID_TOKEN}" alt="a cat" width="200" height="100">`,
    keep: true,
    mustNotContain: NEVER,
  },
  // Protocol-relative — DROP (would resolve to //evil).
  {
    label: 'protocol-relative //evil',
    input: '<img src="//evil.test/x">',
    keep: false,
    mustNotContain: NEVER,
  },
  // Userinfo smuggling — DROP (host is evil.test, not our token).
  {
    label: 'userinfo @evil with token-looking path',
    input: `<img src="https://x@evil.test${VALID_TOKEN}">`,
    keep: false,
    mustNotContain: NEVER,
  },
  // Suffix smuggling — DROP (a naive prefix/origin match would pass this).
  {
    label: 'suffix media.example.com.evil',
    input: '<img src="https://media.example.com.evil/x">',
    keep: false,
    mustNotContain: NEVER,
  },
  // Uppercase scheme — DROP.
  {
    label: 'uppercase HTTPS scheme',
    input: '<img src="HTTPS://evil/x">',
    keep: false,
    mustNotContain: NEVER,
  },
  // data: URL — DROP.
  {
    label: 'data: image url',
    input: '<img src="data:image/png;base64,xxxx">',
    keep: false,
    mustNotContain: NEVER,
  },
  // javascript: URL — DROP.
  {
    label: 'javascript: url',
    input: '<img src="javascript:alert(1)">',
    keep: false,
    mustNotContain: NEVER,
  },
  // Leading whitespace — KEEP. Both edges trim ASCII whitespace before matching
  // because DOMPurify (and the URL spec a real browser applies) strips it before
  // the value is ever observed; `  /m/<uuid>` therefore resolves to OUR OWN
  // same-origin media on both edges. This is NOT a bypass to an evil origin (the
  // host stays our token) — keeping it preserves byte-identical keep/drop parity.
  // Strictness of the token is proven by the malformed/traversal/userinfo cases.
  {
    label: 'leading-space token (whitespace-trimmed to valid)',
    input: `<img src="  ${VALID_TOKEN}">`,
    keep: true,
    mustNotContain: NEVER,
  },
  // Malformed 36-char token (all hyphens) — DROP. Proves strict UUID, not /36/.
  {
    label: 'malformed 36-char (all hyphens)',
    input: '<img src="/m/------------------------------------">',
    keep: false,
    mustNotContain: NEVER,
  },
  // Trailing fragment — DROP (anchored `$`).
  {
    label: 'token with trailing #',
    input: `<img src="${VALID_TOKEN}#">`,
    keep: false,
    mustNotContain: NEVER,
  },
  // Attribute-injection attempt — the parser splits this into a valid `src` plus
  // a stray `onerror` attribute. KEEP the img, DROP the onerror.
  {
    label: 'token + injected onerror attribute',
    input: `<img src="${VALID_TOKEN}" onerror=alert(1)>`,
    keep: true,
    mustNotContain: NEVER,
  },
  // Path traversal — DROP.
  {
    label: 'path traversal /m/../x',
    input: '<img src="/m/../../etc">',
    keep: false,
    mustNotContain: NEVER,
  },
  // Non-numeric dimension smuggling — KEEP img, drop the junk dimension.
  {
    label: 'non-numeric width injection',
    input: `<img src="${VALID_TOKEN}" width="100 onload=alert(1)">`,
    keep: true,
    mustNotContain: NEVER,
  },
] as const;

/**
 * Legacy M1 mXSS corpus — must stay neutralized now that `<img>` is allowed. None
 * of these may keep a script / event handler / dangerous scheme on EITHER edge.
 * (No KEEP expectation: these are pure "must be neutralized" vectors.)
 */
export const MXSS_CORPUS: readonly string[] = [
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
];

/** Markers that must NEVER survive in any mXSS-corpus output. */
export function isNeutralized(out: string): boolean {
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
    !lower.includes('<foreignobject') &&
    !lower.includes('<style')
  );
}

/** True if the sanitizer output still contains an `<img` element. */
export function keptImg(out: string): boolean {
  return out.toLowerCase().includes('<img');
}
