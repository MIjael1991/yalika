import type { Metadata } from 'next';

import { OrionShell } from '@/components/orion-shell';

import './globals.css';

export const metadata: Metadata = {
  title: 'ORION',
  description: 'ORION Intelligence Platform',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased">
        <OrionShell>{children}</OrionShell>
      </body>
    </html>
  );
}
