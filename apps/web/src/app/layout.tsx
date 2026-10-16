import type { Metadata } from 'next';

import { YalikaShell } from '@/components/yalika-shell';

import './globals.css';

export const metadata: Metadata = {
  title: 'Yalika',
  description: 'Yalika Intelligence Platform',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased">
        <YalikaShell>{children}</YalikaShell>
      </body>
    </html>
  );
}
