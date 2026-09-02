import {
  SalesHistoryWorkspace,
  type OrderSummary,
  type ReturnSummary,
} from './sales-history-workspace';

export const dynamic = 'force-dynamic';

async function getOrders(companyId: string) {
  if (!companyId) {
    return {
      orders: [] as OrderSummary[],
      returns: [] as ReturnSummary[],
      error: '',
    };
  }

  const apiUrl = (
    process.env.ORION_API_URL ?? 'http://localhost:3000'
  ).replace(/\/+$/, '');

  try {
    const [ordersResponse, returnsResponse] = await Promise.all([
      fetch(`${apiUrl}/order/company/${encodeURIComponent(companyId)}`, {
        cache: 'no-store',
      }),
      fetch(`${apiUrl}/return/company/${encodeURIComponent(companyId)}`, {
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
      error: 'ORION API no está disponible',
    };
  }
}

export default async function SalesHistoryPage() {
  const companyId = process.env.ORION_COMPANY_ID ?? '';
  const data = await getOrders(companyId);

  return (
    <SalesHistoryWorkspace
      initialOrders={data.orders}
      initialReturns={data.returns}
      initialError={data.error}
    />
  );
}
