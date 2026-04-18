import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@neuronexus/auth', '@neuronexus/shared', '@neuronexus/api'],
  // Produce a minimal runtime bundle at .next/standalone — consumed by the
  // web Dockerfile for a ~120 MB final image.
  output: 'standalone',
  // Next 16 rewrites dev-time security headers; the prod config mirrors that
  // with an extra CSP that blocks everything except our own origins.
  async headers() {
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
              `connect-src 'self' ${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'}`,
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
