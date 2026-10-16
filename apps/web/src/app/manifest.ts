import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Yaleka',
    short_name: 'Yaleka',
    description:
      'Agenda, familia, educación y negocio reunidos en un mismo lugar.',
    start_url: '/life',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#061426',
    theme_color: '#07182b',
    lang: 'es-MX',
    categories: ['productivity', 'business', 'lifestyle'],
    icons: [
      {
        src: '/app-icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/app-icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/app-icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
