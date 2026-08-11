import { test } from 'bun:test';
import { env } from '../src/env.ts';

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

if (!s3Up && process.env.S3_INTEGRATION_REQUIRED === 'true') {
  throw new Error('S3 integration tests are required, but the configured endpoint is unavailable');
}

/**
 * Run storage round trips when S3 is available. Local development may skip
 * these tests, while the dedicated CI job makes availability mandatory.
 */
export const s3RoundTrip = s3Up ? test : test.skip;
