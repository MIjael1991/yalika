import { cookies } from 'next/headers';

import { requireManagerSession } from '../../../lib/yalika-business-session';
import type { ReservationPolicy } from '../apartados/reservation-policy-form';
import type { TeamMember } from '../equipo/team-workspace';
import { AjustesWorkspace } from './ajustes-workspace';

export const dynamic = 'force-dynamic';

const apiUrl = (process.env.YALIKA_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

async function getApi<T>(path: string, cookieHeader: string): Promise<T | null> {
  try {
    const response = await fetch(`${apiUrl}/${path}`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

export default async function AjustesPage() {
  const user = await requireManagerSession();
  const cookieHeader = (await cookies()).toString();
  const companyId = encodeURIComponent(user.companyId);

  const [policy, team, promotions] = await Promise.all([
    getApi<ReservationPolicy>(`reservation/company/${companyId}/policy`, cookieHeader),
    getApi<TeamMember[]>('team', cookieHeader),
    getApi<Array<{ id: string; siteSlug?: string | null }>>(`promotion/public/company/${companyId}`, cookieHeader),
  ]);

  return (
    <AjustesWorkspace
      companyId={user.companyId}
      initialPolicy={
        policy ?? {
          companyId: user.companyId,
          enabled: false,
          depositRequired: true,
          depositType: 'fixed',
          depositValue: 100,
          holdMinutes: 15,
          activeDays: 2,
        }
      }
      cashiers={(team ?? []).filter(
        (member) => (member.role?.name ?? '').trim().toLowerCase() === 'cajero',
      )}
      activePromotions={promotions?.length ?? 0}
      promoSiteReady={Boolean(promotions?.some((promotion) => promotion.siteSlug))}
      teamError={team === null}
    />
  );
}
