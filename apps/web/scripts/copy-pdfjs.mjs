// Copy the pdf.js runtime out of node_modules into public/vendor/pdfjs so the
// browser loads it as NATIVE ESM (`import(/* webpackIgnore: true */ ...)`),
// fully OUTSIDE webpack. Reason: Next 16's bundled webpack mis-compiles
// pdfjs-dist's ESM bundle at module init ("Object.defineProperty called on
// non-object", webpack#20095 — fixed only in webpack 5.103, which Next does
// not ship; pdf.js#20478). Native ESM is immune and identical in dev/prod.
//
// Wired into the `dev` and `build` scripts (NOT a lifecycle hook) so the copy
// can never be stale after a pdfjs-dist upgrade. public/vendor/ is gitignored.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
// Resolve through the package's own files (package.json is always exported).
const pkgRoot = dirname(require.resolve('pdfjs-dist/package.json'));
const outDir = join(here, '..', 'public', 'vendor', 'pdfjs');

mkdirSync(outDir, { recursive: true });
// LEGACY build on purpose: the modern build assumes a bleeding-edge JS engine
// (e.g. Uint8Array.toHex in 5.7 — worker dies with "a.toHex is not a function"
// on anything slightly older, incl. iPad Safari). Legacy ships its own
// polyfills with an identical API; the reader targets tablets first.
for (const f of ['pdf.min.mjs', 'pdf.worker.min.mjs']) {
  copyFileSync(join(pkgRoot, 'legacy', 'build', f), join(outDir, f));
}
console.log(`[copy-pdfjs] ${pkgRoot.split('pdfjs-dist@')[1]?.split('/')[0] ?? '?'} → public/vendor/pdfjs`);
