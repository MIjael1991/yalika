import { cookies } from 'next/headers';
import { requireBusinessSession } from '../../../lib/yalika-business-session';
import { PendingAccountsWorkspace, type PendingOrder } from './pending-accounts-workspace';

export const dynamic = 'force-dynamic';

async function getPendingOrders(companyId: string, cookieHeader: string) {
  if (!companyId) {
    return {
      orders: [] as PendingOrder[],
      error: '',
    };
  }

  const apiUrl = (
    process.env.YALIKA_API_URL ?? 'http://localhost:3000'
  ).replace(/\/+$/, '');

  try {
    const response = await fetch(
      `${apiUrl}/order/company/${encodeURIComponent(companyId)}`,
      { headers: { cookie: cookieHeader }, cache: 'no-store' },
    );

    if (!response.ok) {
      return {
        orders: [] as PendingOrder[],
        error: 'No se pudieron cargar las cuentas pendientes',
      };
    }

    return {
      orders: (await response.json()) as PendingOrder[],
      error: '',
    };
  } catch {
    return {
      orders: [] as PendingOrder[],
      error: 'Yalika API no está disponible',
    };
  }
}

export default async function PendingAccountsPage() {
  const user = await requireBusinessSession();
  const companyId = user.companyId;
  const data = await getPendingOrders(companyId, (await cookies()).toString());

  return (
    <PendingAccountsWorkspace
      companyId={companyId}
      initialOrders={data.orders}
      initialError={data.error}
    />
  );
}
