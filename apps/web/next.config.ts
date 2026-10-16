import type { NextConfig } from "next";

// YALEKA_SURVEY_SECURITY_CONFIG
const isProduction = process.env.NODE_ENV === 'production';

const yalekaSurveySecurityHeaders = [
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
  async headers() {
    return [
      { source: '/surveys/:path*', headers: yalekaSurveySecurityHeaders },
      { source: '/encuestas/:path*', headers: yalekaSurveySecurityHeaders },
      { source: '/registro', headers: yalekaSurveySecurityHeaders },
      {
        source: '/e/:path*',
        headers: [
          ...yalekaSurveySecurityHeaders,
          { key: 'Cache-Control', value: 'no-store, max-age=0' },
        ],
      },
      {
        source: '/api/orion/survey/:path*',
        headers: [
          ...yalekaSurveySecurityHeaders,
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
