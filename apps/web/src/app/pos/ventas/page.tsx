import {
  SalesHistoryWorkspace,
  type OrderSummary,
} from './sales-history-workspace';

export const dynamic = 'force-dynamic';

async function getOrders(companyId: string) {
  if (!companyId) {
    return {
      orders: [] as OrderSummary[],
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
        orders: [] as OrderSummary[],
        error: 'No se pudo cargar el historial de ventas',
      };
    }

    return {
      orders: (await response.json()) as OrderSummary[],
      error: '',
    };
  } catch {
    return {
      orders: [] as OrderSummary[],
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
      initialError={data.error}
    />
  );
}
