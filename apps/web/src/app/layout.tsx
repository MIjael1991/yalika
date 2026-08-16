import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';

import { OrionSidebar } from '@/components/orion-sidebar';

import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

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
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
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
