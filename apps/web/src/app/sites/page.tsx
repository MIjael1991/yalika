import { cookies } from 'next/headers';
import { requireManagerSession } from '../../lib/yalika-business-session';
import { SiteListWorkspace, type SiteSummary } from './site-list-workspace';

export const dynamic = 'force-dynamic';

const apiUrl = (process.env.YALIKA_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

async function loadSites(companyId: string, cookieHeader: string) {
  try {
    const response = await fetch(`${apiUrl}/site/company/${encodeURIComponent(companyId)}/all`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });
    if (!response.ok) return [] as SiteSummary[];
    return (await response.json()) as SiteSummary[];
  } catch {
    return [] as SiteSummary[];
  }
}

export default async function SitesPage() {
  const user = await requireManagerSession();
  const cookieHeader = (await cookies()).toString();
  const sites = await loadSites(user.companyId, cookieHeader);
  return <SiteListWorkspace initialSites={sites} />;
}
