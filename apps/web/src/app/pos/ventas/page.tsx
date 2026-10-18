import { cookies } from 'next/headers';
import { requireBusinessSession } from '../../../lib/yalika-business-session';
import {
  SalesHistoryWorkspace,
  type OrderSummary,
  type ReturnSummary,
} from './sales-history-workspace';

export const dynamic = 'force-dynamic';

async function getOrders(companyId: string, cookieHeader: string) {
  if (!companyId) {
    return {
      orders: [] as OrderSummary[],
      returns: [] as ReturnSummary[],
      error: '',
    };
  }

  const apiUrl = (
    process.env.YALIKA_API_URL ?? 'http://localhost:3000'
  ).replace(/\/+$/, '');

  try {
    const [ordersResponse, returnsResponse] = await Promise.all([
      fetch(`${apiUrl}/order/company/${encodeURIComponent(companyId)}`, {
        headers: { cookie: cookieHeader },
        cache: 'no-store',
      }),
      fetch(`${apiUrl}/return/company/${encodeURIComponent(companyId)}`, {
        headers: { cookie: cookieHeader },
        cache: 'no-store',
      }),
    ]);

    if (!ordersResponse.ok || !returnsResponse.ok) {
      return {
        orders: [] as OrderSummary[],
        returns: [] as ReturnSummary[],
        error: 'No se pudo cargar el historial de ventas',
      };
    }

    return {
      orders: (await ordersResponse.json()) as OrderSummary[],
      returns: (await returnsResponse.json()) as ReturnSummary[],
      error: '',
    };
  } catch {
    return {
      orders: [] as OrderSummary[],
      returns: [] as ReturnSummary[],
      error: 'Yalika API no está disponible',
    };
  }
}

export default async function SalesHistoryPage() {
  const user = await requireBusinessSession();
  const data = await getOrders(user.companyId, (await cookies()).toString());

  return (
    <SalesHistoryWorkspace
      companyId={user.companyId}
      isCashier={user.isCashier && !user.permissions.includes('reports')}
      initialOrders={data.orders}
      initialReturns={data.returns}
      initialError={data.error}
    />
  );
}
