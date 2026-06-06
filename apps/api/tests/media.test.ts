import { beforeEach, describe, expect, test } from 'bun:test';
import { buildApp } from '../src/app.ts';
import { env } from '../src/env.ts';
import { callApp, resetTestDb, signUpAndCookie, uniqueEmail } from './helpers.ts';

const app = buildApp();

// Minimal valid 1x1 PNG — first bytes are the PNG magic number, so it passes the
// finalize magic-byte sniff. Used for the real round-trip.
const PNG_1X1 = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06,
  0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44,
  0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d,
  0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42,
  0x60, 0x82,
]);

// Probe whether MinIO/S3 is reachable. The full presign→POST→finalize tests run
// against real storage when it's up (it is, locally + CI); otherwise they skip
// so a missing-bucket dev box doesn't fail the suite.
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

type PresignBody = {
  mediaId: string;
  token: string;
  upload: { url: string; fields: Record<string, string> };
};

/** POST the presigned multipart form directly to S3. Returns the HTTP status. */
async function uploadToS3(
  upload: { url: string; fields: Record<string, string> },
  bytes: Uint8Array,
  contentType: string,
  fileType = contentType,
): Promise<number> {
  const fd = new FormData();
  for (const [k, v] of Object.entries(upload.fields)) fd.append(k, v);
  // Allow the caller to mismatch the form Content-Type for the rejection test.
  fd.set('Content-Type', contentType);
  fd.append('file', new Blob([bytes], { type: fileType }));
  const res = await fetch(upload.url, { method: 'POST', body: fd });
  return res.status;
}

describe('media', () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  test('POST /media/presign returns mediaId, token, and upload policy', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    const res = await callApp(app, 'POST', '/media/presign', {
      cookie,
      body: { mime: 'image/png', size: 1024 },
    });
    expect(res.status).toBe(200);
    const body = await res.json<PresignBody>();
    expect(body.mediaId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(body.token).toBe(`/m/${body.mediaId}`);
    expect(typeof body.upload.url).toBe('string');
    expect(body.upload.fields['Content-Type']).toBe('image/png');
    // Key is ext-free `media/{uuid}` (C-1/A7) and carries no userId.
    expect(body.upload.fields.key).toBe(`media/${body.mediaId}`);
  });

  test('POST /media/presign rejects a disallowed mime → 400 bad_mime', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    const res = await callApp(app, 'POST', '/media/presign', {
      cookie,
      body: { mime: 'application/pdf', size: 1024 },
    });
    expect(res.status).toBe(400);
    expect(await res.json<{ error: string }>()).toEqual({ error: 'bad_mime' });
  });

  test('POST /media/presign rejects an oversize declaration → 400 too_large', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    const res = await callApp(app, 'POST', '/media/presign', {
      cookie,
      body: { mime: 'image/png', size: env.MAX_MEDIA_BYTES + 1 },
    });
    expect(res.status).toBe(400);
    expect(await res.json<{ error: string }>()).toEqual({ error: 'too_large' });
  });

  test('POST /media/presign rejects a zero-size declaration → 400 too_large', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    const res = await callApp(app, 'POST', '/media/presign', {
      cookie,
      body: { mime: 'image/png', size: 0 },
    });
    expect(res.status).toBe(400);
    expect(await res.json<{ error: string }>()).toEqual({ error: 'too_large' });
  });

  test('media endpoints require auth', async () => {
    const res = await callApp(app, 'POST', '/media/presign', {
      body: { mime: 'image/png', size: 1024 },
    });
    expect(res.status).toBe(401);
  });

  roundTrip('full presign → POST → finalize happy path', async () => {
    const { cookie, userId } = await signUpAndCookie(app, uniqueEmail());
    const presign = await (
      await callApp(app, 'POST', '/media/presign', {
        cookie,
        body: { mime: 'image/png', size: PNG_1X1.length },
      })
    ).json<PresignBody>();

    const uploadStatus = await uploadToS3(presign.upload, PNG_1X1, 'image/png');
    expect(uploadStatus).toBe(204);

    const finalize = await callApp(app, 'POST', `/media/${presign.mediaId}/finalize`, {
      cookie,
    });
    expect(finalize.status).toBe(200);
    const row = await finalize.json<{
      id: string;
      userId: string;
      s3Key: string;
      mime: string;
      size: number;
    }>();
    expect(row.id).toBe(presign.mediaId);
    expect(row.userId).toBe(userId);
    expect(row.s3Key).toBe(`media/${presign.mediaId}`);
    expect(row.mime).toBe('image/png');
    expect(row.size).toBe(PNG_1X1.length);

    // Idempotent: a second finalize returns the same row, not a duplicate.
    const again = await callApp(app, 'POST', `/media/${presign.mediaId}/finalize`, {
      cookie,
    });
    expect(again.status).toBe(200);
    expect((await again.json<{ id: string }>()).id).toBe(presign.mediaId);

    // The row shows up in the user's scoped list.
    const list = await (
      await callApp(app, 'GET', '/media', { cookie })
    ).json<{ items: Array<{ id: string }> }>();
    expect(list.items.map((m) => m.id)).toContain(presign.mediaId);
  });

  roundTrip('finalize deletes the object + 400 when bytes are not a real image', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    const presign = await (
      await callApp(app, 'POST', '/media/presign', {
        cookie,
        body: { mime: 'image/png', size: 8 },
      })
    ).json<PresignBody>();

    // Upload non-image bytes under the (signed) image/png Content-Type — the
    // policy only binds the type, not the body, so S3 accepts it; finalize's
    // magic-byte sniff is the real gate.
    const junk = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);
    const uploadStatus = await uploadToS3(presign.upload, junk, 'image/png');
    expect(uploadStatus).toBe(204);

    const finalize = await callApp(app, 'POST', `/media/${presign.mediaId}/finalize`, {
      cookie,
    });
    expect(finalize.status).toBe(400);
    expect(await finalize.json<{ error: string }>()).toEqual({ error: 'bad_image' });

    // bad_image deletes BOTH the object (A5) and the pending claim row, so a
    // re-finalize finds no row → 404 not_found (the uuid is fully reclaimable).
    const retry = await callApp(app, 'POST', `/media/${presign.mediaId}/finalize`, {
      cookie,
    });
    expect(retry.status).toBe(404);
    expect(await retry.json<{ error: string }>()).toEqual({ error: 'not_found' });

    // No verified row was persisted.
    const list = await (
      await callApp(app, 'GET', '/media', { cookie })
    ).json<{ items: unknown[] }>();
    expect(list.items).toEqual([]);
  });

  roundTrip('S3 rejects a Content-Type that does not match the signed policy', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    const presign = await (
      await callApp(app, 'POST', '/media/presign', {
        cookie,
        body: { mime: 'image/png', size: PNG_1X1.length },
      })
    ).json<PresignBody>();
    // Signed for image/png; POST with image/jpeg → S3 403 (server-side bind).
    const uploadStatus = await uploadToS3(presign.upload, PNG_1X1, 'image/jpeg');
    expect(uploadStatus).toBe(403);
  });

  test('finalize on a never-uploaded id → 400 not_uploaded', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    const presign = await (
      await callApp(app, 'POST', '/media/presign', {
        cookie,
        body: { mime: 'image/png', size: 1024 },
      })
    ).json<PresignBody>();
    // No upload happened — finalize finds no object.
    const res = await callApp(app, 'POST', `/media/${presign.mediaId}/finalize`, {
      cookie,
    });
    expect(res.status).toBe(400);
    expect(await res.json<{ error: string }>()).toEqual({ error: 'not_uploaded' });
  });

  roundTrip(
    "cross-user integrity: B finalizing A's presigned uuid → 404; A can still finalize",
    async () => {
      const { cookie: aCookie, userId: aUserId } = await signUpAndCookie(app, uniqueEmail('a'));
      const { cookie: bCookie } = await signUpAndCookie(app, uniqueEmail('b'));

      // A presigns (claims the uuid under A) + uploads the real bytes.
      const presign = await (
        await callApp(app, 'POST', '/media/presign', {
          cookie: aCookie,
          body: { mime: 'image/png', size: PNG_1X1.length },
        })
      ).json<PresignBody>();
      expect(await uploadToS3(presign.upload, PNG_1X1, 'image/png')).toBe(204);

      // B tries to finalize A's presigned uuid. The uuid is bound to A at
      // presign, so B's finalize finds no row under B → 404. B cannot claim A's
      // bytes, and A's own finalize is NOT broken by a stolen unique key.
      const bFinalize = await callApp(
        app,
        'POST',
        `/media/${presign.mediaId}/finalize`,
        { cookie: bCookie },
      );
      expect(bFinalize.status).toBe(404);
      expect(await bFinalize.json<{ error: string }>()).toEqual({ error: 'not_found' });

      // A finalizes their own upload successfully (no s3_key collision from B).
      const aFinalize = await callApp(
        app,
        'POST',
        `/media/${presign.mediaId}/finalize`,
        { cookie: aCookie },
      );
      expect(aFinalize.status).toBe(200);
      expect((await aFinalize.json<{ userId: string }>()).userId).toBe(aUserId);

      // A sees their verified row; B sees nothing.
      const aList = await (
        await callApp(app, 'GET', '/media', { cookie: aCookie })
      ).json<{ items: Array<{ id: string }> }>();
      expect(aList.items.map((m) => m.id)).toContain(presign.mediaId);

      const bList = await (
        await callApp(app, 'GET', '/media', { cookie: bCookie })
      ).json<{ items: unknown[] }>();
      expect(bList.items).toEqual([]);
    },
  );

  test('GET /media excludes unverified (pending) presigned rows', async () => {
    const { cookie } = await signUpAndCookie(app, uniqueEmail());
    // Presign claims a pending (verified=false) row but does NOT finalize.
    await callApp(app, 'POST', '/media/presign', {
      cookie,
      body: { mime: 'image/png', size: 1024 },
    });
    // The list returns only verified rows, so the pending claim is hidden.
    const list = await (
      await callApp(app, 'GET', '/media', { cookie })
    ).json<{ items: unknown[] }>();
    expect(list.items).toEqual([]);
  });
});
