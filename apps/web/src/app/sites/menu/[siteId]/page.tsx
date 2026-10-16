import { cookies } from 'next/headers';
import { requireBusinessSession } from '../../../../lib/yalika-business-session';
import { SiteMenuWorkspace, type EditableSection } from './site-menu-workspace';

export const dynamic = 'force-dynamic';
const apiUrl = (process.env.ORION_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

type Site = { id: string; name: string; sections: EditableSection[] };

export default async function SiteMenuPage({ params }: { params: Promise<{ siteId: string }> }) {
  const user = await requireBusinessSession();
  const { siteId } = await params;
  const cookieHeader = (await cookies()).toString();
  const response = await fetch(`${apiUrl}/site/company/${encodeURIComponent(user.companyId)}/site/${encodeURIComponent(siteId)}`, {
    headers: { cookie: cookieHeader }, cache: 'no-store',
  }).catch(() => null);
  if (!response?.ok) return <main className="min-h-screen bg-slate-950 p-8 text-white">Página no encontrada o sin permiso.</main>;
  const site = (await response.json()) as Site;
  return <SiteMenuWorkspace siteId={site.id} siteName={site.name} initialSections={site.sections} />;
}
