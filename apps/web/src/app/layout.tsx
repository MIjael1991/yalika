import type { Metadata } from 'next';

import { OrionSidebar } from '@/components/orion-sidebar';

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
        <div className="min-h-screen bg-slate-950">
          <OrionSidebar />

          <div className="min-w-0 lg:pl-64">
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
