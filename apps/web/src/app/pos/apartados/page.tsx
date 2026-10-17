import { cookies } from 'next/headers';

import { requireBusinessSession } from '../../../lib/yalika-business-session';
import {
  ReservationWorkspace,
  type ReservationPolicy,
  type ReservationRecord,
} from './reservation-workspace';

export const dynamic = 'force-dynamic';

const apiUrl = (
  process.env.YALIKA_API_URL ?? 'http://localhost:3000'
).replace(/\/+$/, '');

async function getApi<T>(
  path: string,
  cookieHeader: string,
): Promise<T | null> {
  try {
    const response = await fetch(`${apiUrl}/${path}`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export default async function ReservationsPage() {
  const user = await requireBusinessSession();
  const cookieHeader = (await cookies()).toString();
  const companyId = user.companyId;

  const [reservations, policy] = await Promise.all([
    getApi<ReservationRecord[]>(
      `reservation/company/${encodeURIComponent(companyId)}`,
      cookieHeader,
    ),
    getApi<ReservationPolicy>(
      `reservation/company/${encodeURIComponent(companyId)}/policy`,
      cookieHeader,
    ),
  ]);

  return (
    <ReservationWorkspace
      companyId={companyId}
      isCashier={user.isCashier}
      initialReservations={reservations ?? []}
      initialPolicy={
        policy ?? {
          companyId,
          enabled: false,
          depositRequired: true,
          depositType: 'fixed',
          depositValue: 100,
          holdMinutes: 15,
          activeDays: 2,
        }
      }
      initialError={
        reservations && policy
          ? ''
          : 'No fue posible cargar Apartados. Verifica que la API esté encendida.'
      }
    />
  );
}
