import type { NextConfig } from 'next';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const supa = new URL(supabaseUrl);
const httpOrigin = supa.origin;
const wsOrigin = `${supa.protocol === 'https:' ? 'wss:' : 'ws:'}//${supa.host}`;
const isDev = process.env.NODE_ENV !== 'production';

const csp = [
  "default-src 'self'",
  `img-src 'self' data: blob: ${httpOrigin}`,
  `connect-src 'self' ${httpOrigin} ${wsOrigin}`,
  "style-src 'self' 'unsafe-inline'",
  // 'unsafe-eval' only in development (React Refresh); production builds do not need it.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "font-src 'self' data:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const nextConfig: NextConfig = {
  // NEXT_DIST_DIR lets a production build run next to a dev server (CI and local checks).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      {
        protocol: supa.protocol.replace(':', '') as 'http' | 'https',
        hostname: supa.hostname,
        port: supa.port,
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Content-Security-Policy', value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
