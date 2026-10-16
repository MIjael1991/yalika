import type { NextConfig } from "next";

// YALIKA_SURVEY_SECURITY_CONFIG
const isProduction = process.env.NODE_ENV === 'production';

const yalikaSurveySecurityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
  ...(isProduction
    ? [
        {
          key: 'Content-Security-Policy',
          value: [
            "default-src 'self'",
            "base-uri 'self'",
            "object-src 'none'",
            "frame-ancestors 'none'",
            "form-action 'self'",
            "img-src 'self' data: blob: https:",
            "font-src 'self' data:",
            "style-src 'self' 'unsafe-inline'",
            "script-src 'self' 'unsafe-inline'",
            "connect-src 'self'",
            "worker-src 'self' blob:",
            'upgrade-insecure-requests',
          ].join('; '),
        },
        { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
      ]
    : []),
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ['*.trycloudflare.com'],
  // Enlaces guardados antes del cambio de nombre (por ejemplo las imágenes de las páginas).
  async rewrites() {
    return [{ source: '/api/orion/:path*', destination: '/api/yalika/:path*' }];
  },
  async headers() {
    return [
      { source: '/surveys/:path*', headers: yalikaSurveySecurityHeaders },
      { source: '/encuestas/:path*', headers: yalikaSurveySecurityHeaders },
      { source: '/registro', headers: yalikaSurveySecurityHeaders },
      {
        source: '/e/:path*',
        headers: [
          ...yalikaSurveySecurityHeaders,
          { key: 'Cache-Control', value: 'no-store, max-age=0' },
        ],
      },
      {
        source: '/api/yalika/survey/:path*',
        headers: [
          ...yalikaSurveySecurityHeaders,
          { key: 'Cache-Control', value: 'no-store, max-age=0' },
        ],
      },
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/javascript; charset=utf-8',
          },
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
