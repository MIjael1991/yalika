'use client';

import { usePathname } from 'next/navigation';

import { OrionSidebar } from './orion-sidebar';

export function OrionShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === '/login') {
    return <div className="min-h-screen bg-slate-950">{children}</div>;
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <OrionSidebar />
      <div className="min-w-0 lg:pl-64">{children}</div>
    </div>
  );
}
