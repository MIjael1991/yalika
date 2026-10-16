import { cookies } from 'next/headers';
import { requireManagerSession } from '../../../../lib/yalika-business-session';
import { SiteTeamWorkspace } from './site-team-workspace';

export const dynamic = 'force-dynamic';
const apiUrl = (process.env.YALIKA_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

export default async function SiteTeamPage({ params }: { params: Promise<{ siteId: string }> }) {
  await requireManagerSession();
  const { siteId } = await params;
  const cookieHeader = (await cookies()).toString();
  const response = await fetch(`${apiUrl}/site-team/site/${encodeURIComponent(siteId)}`, {
    headers: { cookie: cookieHeader }, cache: 'no-store',
  }).catch(() => null);
  if (!response?.ok) return <main className="min-h-screen bg-slate-950 p-8 text-white">No tienes permiso para administrar el equipo de esta página.</main>;
  const data = await response.json();
  return <SiteTeamWorkspace initialData={data} />;
}
