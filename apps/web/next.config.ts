import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@neuronexus/auth', '@neuronexus/shared', '@neuronexus/api'],
  // Produce a minimal runtime bundle at .next/standalone — consumed by the
  // web Dockerfile for a ~120 MB final image.
  output: 'standalone',
  // Media resolver (M2 Phase 2, plan C-1): a static reverse-proxy that maps the
  // stored relative token `/m/{uuid}` → the public S3 object `media/{uuid}`.
  // Next proxies server-side so the browser request stays same-origin, which is
  // why `img-src 'self'` in the CSP below still covers it — no CSP widening, no
  // DB lookup, no Bun hot path. The `:uuid` param is constrained to a strict
  // canonical UUID (C-6) so traversal / garbage tokens 404 at the route.
  async rewrites() {
    const mediaBase = process.env.NEXT_PUBLIC_MEDIA_BASE_URL ?? 'http://localhost:9000/neuronexus-media';
    return [
      {
        source: '/m/:uuid([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})',
        destination: `${mediaBase}/media/:uuid`,
      },
    ];
  },
  // Next 16 rewrites dev-time security headers; the prod config mirrors that
  // with an extra CSP that blocks everything except our own origins.
  async headers() {
    // The image upload (M2 Phase 4) is a RAW cross-origin POST from the browser
    // straight to S3/MinIO (presigned POST policy, bytes bypass Bun). Its origin
    // is the S3 endpoint, derived from NEXT_PUBLIC_MEDIA_BASE_URL — add it to
    // connect-src or the browser CSP-blocks the upload. img-src needs NO change:
    // images load same-origin via the `/m/:uuid` Next rewrite above.
    const mediaBase =
      process.env.NEXT_PUBLIC_MEDIA_BASE_URL ?? 'http://localhost:9000/neuronexus-media';
    let mediaOrigin = '';
    try {
      mediaOrigin = new URL(mediaBase).origin;
    } catch {
      mediaOrigin = '';
    }
    const apiOrigin = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
    const connectSrc = ["'self'", apiOrigin, mediaOrigin].filter(Boolean).join(' ');
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // Next.js still inlines a bootstrap script in production; unsafe-inline is
              // required until we opt into the CSP-nonce pipeline.
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              `connect-src ${connectSrc}`,
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
