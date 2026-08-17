import { PendingAccountsWorkspace, type PendingOrder } from './pending-accounts-workspace';

export const dynamic = 'force-dynamic';

async function getPendingOrders(companyId: string) {
  if (!companyId) {
    return {
      orders: [] as PendingOrder[],
      error: '',
    };
  }

  const apiUrl = (
    process.env.ORION_API_URL ?? 'http://localhost:3000'
  ).replace(/\/+$/, '');

  try {
    const response = await fetch(
      `${apiUrl}/order/company/${encodeURIComponent(companyId)}`,
      { cache: 'no-store' },
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
      error: 'ORION API no está disponible',
    };
  }
}

export default async function PendingAccountsPage() {
  const companyId = process.env.ORION_COMPANY_ID ?? '';
  const data = await getPendingOrders(companyId);

  return (
    <PendingAccountsWorkspace
      companyId={companyId}
      initialOrders={data.orders}
      initialError={data.error}
    />
  );
}
