// Source byte-dedup at finalize (NotebookLM M1, T6 CRITIC-M3 / AC1.7).
//
// A finalize computes `byteHash = sha256(bytes)`; a READY source in the SAME
// (user, notebook) with the same hash short-circuits as 409 `duplicate_source`
// (the just-uploaded object + pending row are cleaned up, no second embed run).
// A different notebook OR different bytes embeds normally.
//
// The finalize path reads S3 (`headSize` + `getObjectBytes`) — there is NO
// storage seam (see report), so the END-TO-END 409 is exercised against REAL
// MinIO (the same `roundTrip` reachability gate as media.test.ts; skips when S3
// is down). To make the first source reach `status='ready'` without a valid PDF
// fixture, the PDF extractor seam is injected (bytes come from S3, the fake
// extractor returns units). A storage-independent DB-layer dedup-query test runs
// unconditionally as a backstop.

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { and, count, eq } from 'drizzle-orm';
import { db, notebooks, sources as sourcesTable } from '@neuronexus/db';
import { buildApp } from '../src/app.ts';
import { env } from '../src/env.ts';
import {
  __resetAiClientForTests,
  __setAiClientForTests,
} from '../src/ai/openai-client.ts';
import { __setPdfExtractorForTests } from '../src/ai/source-parsers.ts';
import { drainSourceIngest } from '../src/ai/source-ingest.ts';
import { callApp, resetTestDb, signUpAndCookie, uniqueEmail } from './helpers.ts';

const app = buildApp();
const DIM = 1536;

// Reachability probe (mirrors media.test.ts) — the e2e dedup tests need MinIO.
let s3Up = false;
try {
  const res = await fetch(`${env.S3_ENDPOINT}/minio/health/live`, {
    method: 'GET',
    signal: AbortSignal.timeout(2000),
  });
  s3Up = res.ok;
} catch {
  s3Up = false;
}
const roundTrip = s3Up ? test : test.skip;

const PDF_BYTES_A = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2, 3, 4, 5]); // "%PDF-" + junk
const PDF_BYTES_B = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 9, 8, 7, 6, 5]);

function installFakeEmbedder(): void {
  __setAiClientForTests({
    async embed(texts: string[]): Promise<number[][]> {
      return texts.map((_, i) => {
        const v = new Array<number>(DIM).fill(0);
        v[i % DIM] = 1;
        return v;
      });
    },
  });
}

async function uploadToS3(
  upload: { url: string; fields: Record<string, string> },
  bytes: Uint8Array,
): Promise<number> {
  const fd = new FormData();
  for (const [k, v] of Object.entries(upload.fields)) fd.append(k, v);
  fd.set('Content-Type', 'application/pdf');
  fd.append('file', new Blob([bytes], { type: 'application/pdf' }));
  const res = await fetch(upload.url, { method: 'POST', body: fd });
  return res.status;
}

interface PresignBody {
  sourceId: string;
  upload: { url: string; fields: Record<string, string> };
}

async function createNotebook(cookie: string, title = 'NB'): Promise<string> {
  const res = await callApp(app, 'POST', '/notebooks', { cookie, body: { title } });
  return (await res.json<{ id: string }>()).id;
}

/** presign → upload bytes → finalize (worker drains to ready). Returns finalize status. */
async function uploadAndFinalize(
  cookie: string,
  notebookId: string,
  bytes: Uint8Array,
): Promise<{ status: number; body: unknown; sourceId: string }> {
  const presign = await (
    await callApp(app, 'POST', `/notebooks/${notebookId}/sources`, {
      cookie,
      body: { kind: 'upload', title: 'Book', mime: 'application/pdf', size: bytes.length },
    })
  ).json<PresignBody>();
  const up = await uploadToS3(presign.upload, bytes);
  expect(up).toBe(204);
  const finalize = await callApp(app, 'POST', `/sources/${presign.sourceId}/finalize`, { cookie });
  return { status: finalize.status, body: await finalize.json(), sourceId: presign.sourceId };
}

describe('source dedup — finalize byte_hash (real MinIO round-trip)', () => {
  beforeEach(async () => {
    await resetTestDb();
    // The fake extractor lets a non-PDF byte blob reach ready (bytes come from S3).
    __setPdfExtractorForTests(async () => ['Page one.', 'Page two.']);
    installFakeEmbedder();
  });
  afterEach(() => {
    __setPdfExtractorForTests(null);
    __resetAiClientForTests();
  });

  roundTrip('same bytes, same notebook → second finalize 409 duplicate_source (no second embed)', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    const nbId = await createNotebook(cookie);

    // First source: finalize → enqueue → drain to ready.
    const first = await uploadAndFinalize(cookie, nbId, PDF_BYTES_A);
    expect(first.status).toBe(200);
    await drainSourceIngest({ timeoutMs: 5000 });
    const [firstRow] = await db
      .select({ status: sourcesTable.status, byteHash: sourcesTable.byteHash })
      .from(sourcesTable)
      .where(eq(sourcesTable.id, first.sourceId));
    expect(firstRow!.status).toBe('ready');
    expect(firstRow!.byteHash).toBeTruthy();

    // Second source: SAME bytes, SAME notebook → finalize detects the ready dup.
    const second = await uploadAndFinalize(cookie, nbId, PDF_BYTES_A);
    expect(second.status).toBe(409);
    expect((second.body as { error: string }).error).toBe('duplicate_source');

    // The duplicate's pending row was cleaned up (deleted by finalize).
    const [dupRow] = await db
      .select({ n: count() })
      .from(sourcesTable)
      .where(eq(sourcesTable.id, second.sourceId));
    expect(dupRow!.n).toBe(0);
    // Still exactly ONE ready source for this hash in the notebook.
    const [ready] = await db
      .select({ n: count() })
      .from(sourcesTable)
      .where(and(eq(sourcesTable.notebookId, nbId), eq(sourcesTable.status, 'ready')));
    expect(ready!.n).toBe(1);
  });

  roundTrip('different bytes, same notebook → second finalize succeeds (no dedup)', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    const nbId = await createNotebook(cookie);

    const first = await uploadAndFinalize(cookie, nbId, PDF_BYTES_A);
    expect(first.status).toBe(200);
    await drainSourceIngest({ timeoutMs: 5000 });

    const second = await uploadAndFinalize(cookie, nbId, PDF_BYTES_B);
    expect(second.status).toBe(200); // distinct hash → not a dup
    await drainSourceIngest({ timeoutMs: 5000 });

    const [readyN] = await db
      .select({ n: count() })
      .from(sourcesTable)
      .where(and(eq(sourcesTable.notebookId, nbId), eq(sourcesTable.status, 'ready')));
    expect(readyN!.n).toBe(2);
  });

  roundTrip('same bytes, DIFFERENT notebook → second finalize succeeds (dedup is per-notebook)', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    const nb1 = await createNotebook(cookie, 'NB1');
    const nb2 = await createNotebook(cookie, 'NB2');

    const first = await uploadAndFinalize(cookie, nb1, PDF_BYTES_A);
    expect(first.status).toBe(200);
    await drainSourceIngest({ timeoutMs: 5000 });

    // SAME bytes in a DIFFERENT notebook → not a duplicate.
    const second = await uploadAndFinalize(cookie, nb2, PDF_BYTES_A);
    expect(second.status).toBe(200);
  });
});

describe('source dedup — DB-layer query invariant (storage-independent backstop)', () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  test('the dedup predicate matches only same (user, notebook, byteHash, status=ready)', async () => {
    const { userId } = await signUpAndCookie(app, uniqueEmail());
    const [nb1] = await db.insert(notebooks).values({ userId, title: 'NB1' }).returning({ id: notebooks.id });
    const [nb2] = await db.insert(notebooks).values({ userId, title: 'NB2' }).returning({ id: notebooks.id });
    const HASH = 'deadbeef'.repeat(8);

    // A READY source in nb1 with HASH.
    await db.insert(sourcesTable).values({
      userId,
      notebookId: nb1!.id,
      kind: 'pdf',
      title: 'ready dup',
      status: 'ready',
      verified: true,
      byteHash: HASH,
    });
    // Same hash but NOT ready (still indexing) — must NOT count as a dup.
    await db.insert(sourcesTable).values({
      userId,
      notebookId: nb1!.id,
      kind: 'pdf',
      title: 'indexing same hash',
      status: 'indexing',
      verified: true,
      byteHash: HASH,
    });
    // Same hash, ready, but DIFFERENT notebook — must NOT count for nb2.
    // (Already covered by nb1's row being scoped to nb1.)

    // The finalize dedup query: ready + same (user, notebook, hash).
    const dupInNb1 = await db
      .select({ id: sourcesTable.id })
      .from(sourcesTable)
      .where(
        and(
          eq(sourcesTable.userId, userId),
          eq(sourcesTable.notebookId, nb1!.id),
          eq(sourcesTable.byteHash, HASH),
          eq(sourcesTable.status, 'ready'),
        ),
      );
    expect(dupInNb1.length).toBe(1); // exactly the ready row, not the indexing one

    const dupInNb2 = await db
      .select({ id: sourcesTable.id })
      .from(sourcesTable)
      .where(
        and(
          eq(sourcesTable.userId, userId),
          eq(sourcesTable.notebookId, nb2!.id),
          eq(sourcesTable.byteHash, HASH),
          eq(sourcesTable.status, 'ready'),
        ),
      );
    expect(dupInNb2.length).toBe(0); // per-notebook scope → no dup in nb2
  });
});
