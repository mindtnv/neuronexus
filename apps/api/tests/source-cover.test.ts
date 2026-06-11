// source-cover.ts unit tests (Library L3, §8.2 covers).
//
//   * extractEpubCover — built a minimal EPUB zip in-test (container.xml + OPF +
//     a tiny PNG) via fflate and assert the cover bytes/mime are pulled out for
//     each manifest convention (properties="cover-image", <meta name="cover">,
//     id/href heuristic). Oversize cover ⇒ null. No real EPUB binary needed.
//   * sniffImageMime — magic-byte sniff for png/jpeg/gif/webp.
//   * downloadUrlCover — SSRF-guarded og:image download via the injected fetch
//     seam: blocks private hosts, rejects non-image content-type / oversize,
//     returns bytes on a valid image response.

import { afterEach, describe, expect, test } from 'bun:test';
import {
  COVER_MAX_BYTES,
  downloadUrlCover,
  extractEpubCover,
  sniffImageMime,
  __setCoverFetchForTests,
} from '../src/ai/source-cover.ts';
import { __setDnsLookupForTests } from '../src/ai/page-reader.ts';

const enc = new TextEncoder();

// A 1×1 transparent PNG (real magic bytes 89 50 4E 47).
const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

const CONTAINER = `<?xml version="1.0"?>
<container><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`;

/** Build a DECOMPRESSED epub map (what fflate `unzipSync` yields) for a given
 *  OPF manifest/metadata + image key — `extractEpubCover` operates on the map,
 *  not the zipped bytes, so the test passes the map directly (no round-trip). */
function epubZip(opf: string, imageKey: string, imageBytes = PNG_BYTES): Record<string, Uint8Array> {
  return {
    'META-INF/container.xml': enc.encode(CONTAINER),
    'OEBPS/content.opf': enc.encode(opf),
    [imageKey]: imageBytes,
  };
}

afterEach(() => {
  __setCoverFetchForTests(null);
  __setDnsLookupForTests(null);
});

describe('sniffImageMime', () => {
  test('detects png', () => expect(sniffImageMime(PNG_BYTES)).toBe('image/png'));
  test('detects jpeg', () =>
    expect(sniffImageMime(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg'));
  test('detects gif', () =>
    expect(sniffImageMime(enc.encode('GIF89a'))).toBe('image/gif'));
  test('non-image ⇒ null', () => expect(sniffImageMime(enc.encode('not an image'))).toBeNull());
});

describe('extractEpubCover', () => {
  test('EPUB3 properties="cover-image"', () => {
    const opf = `<package><manifest>
      <item id="cov" href="images/cover.png" media-type="image/png" properties="cover-image"/>
      <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
    </manifest></package>`;
    const cover = extractEpubCover(epubZip(opf, 'OEBPS/images/cover.png'));
    expect(cover).not.toBeNull();
    expect(cover!.mime).toBe('image/png');
    expect(cover!.bytes.length).toBe(PNG_BYTES.length);
  });

  test('EPUB2 <meta name="cover" content="id">', () => {
    const opf = `<package><metadata><meta name="cover" content="coverId"/></metadata><manifest>
      <item id="coverId" href="cover.png" media-type="image/png"/>
    </manifest></package>`;
    const cover = extractEpubCover(epubZip(opf, 'OEBPS/cover.png'));
    expect(cover).not.toBeNull();
    expect(cover!.mime).toBe('image/png');
  });

  test('id/href heuristic fallback (manifest image whose href mentions cover)', () => {
    const opf = `<package><manifest>
      <item id="img7" href="art/the-cover-art.png" media-type="image/png"/>
      <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
    </manifest></package>`;
    const cover = extractEpubCover(epubZip(opf, 'OEBPS/art/the-cover-art.png'));
    expect(cover).not.toBeNull();
  });

  test('no cover manifest entry ⇒ null', () => {
    const opf = `<package><manifest>
      <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
    </manifest></package>`;
    expect(extractEpubCover(epubZip(opf, 'OEBPS/ch1.xhtml'))).toBeNull();
  });

  test('oversize cover ⇒ null (cap)', () => {
    const big = new Uint8Array(COVER_MAX_BYTES + 1);
    big.set(PNG_BYTES, 0); // valid magic, but too big
    const opf = `<package><manifest>
      <item id="cov" href="cover.png" media-type="image/png" properties="cover-image"/>
    </manifest></package>`;
    expect(extractEpubCover(epubZip(opf, 'OEBPS/cover.png', big))).toBeNull();
  });
});

describe('downloadUrlCover (SSRF-guarded)', () => {
  test('blocks a private-resolving host without an image fetch', async () => {
    __setDnsLookupForTests(async () => [{ address: '10.1.2.3', family: 4 }]);
    let fetched = false;
    __setCoverFetchForTests(async () => {
      fetched = true;
      return new Response(PNG_BYTES, { status: 200, headers: { 'content-type': 'image/png' } });
    });
    expect(await downloadUrlCover('https://evil.example.com/cover.png')).toBeNull();
    expect(fetched).toBe(false);
  });

  test('rejects a non-image content-type', async () => {
    __setDnsLookupForTests(async () => [{ address: '93.184.216.34', family: 4 }]);
    __setCoverFetchForTests(async () =>
      new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    );
    expect(await downloadUrlCover('https://cdn.example.com/page')).toBeNull();
  });

  test('returns bytes + sniffed mime for a valid image', async () => {
    __setDnsLookupForTests(async () => [{ address: '93.184.216.34', family: 4 }]);
    __setCoverFetchForTests(async () =>
      new Response(PNG_BYTES, { status: 200, headers: { 'content-type': 'image/png' } }),
    );
    const cover = await downloadUrlCover('https://cdn.example.com/cover.png');
    expect(cover).not.toBeNull();
    expect(cover!.mime).toBe('image/png');
    expect(cover!.bytes.length).toBe(PNG_BYTES.length);
  });

  test('does not follow a redirect (could point at a private host)', async () => {
    __setDnsLookupForTests(async () => [{ address: '93.184.216.34', family: 4 }]);
    __setCoverFetchForTests(async () =>
      new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } }),
    );
    expect(await downloadUrlCover('https://cdn.example.com/cover.png')).toBeNull();
  });
});
