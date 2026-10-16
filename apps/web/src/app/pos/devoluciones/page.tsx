import { ReturnsWorkspace, type Order, type ReturnRecord } from './returns-workspace';

export const dynamic = 'force-dynamic';

async function getInitialData(companyId: string) {
  if (!companyId) {
    return {
      orders: [] as Order[],
      returns: [] as ReturnRecord[],
      error: '',
    };
  }

  const apiUrl = (
    process.env.YALIKA_API_URL ?? 'http://localhost:3000'
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
        orders: [] as Order[],
        returns: [] as ReturnRecord[],
        error: 'No se pudo cargar el historial comercial',
      };
    }

    return {
      orders: (await ordersResponse.json()) as Order[],
      returns: (await returnsResponse.json()) as ReturnRecord[],
      error: '',
    };
  } catch {
    return {
      orders: [] as Order[],
      returns: [] as ReturnRecord[],
      error: 'Yalika API no está disponible',
    };
  }
}

export default async function ReturnsPage() {
  const companyId = process.env.YALIKA_COMPANY_ID ?? '';
  const data = await getInitialData(companyId);

  return (
    <ReturnsWorkspace
      companyId={companyId}
      authorizedUserId={process.env.YALIKA_AUTHORIZED_USER_ID ?? ''}
      initialOrders={data.orders}
      initialReturns={data.returns}
      initialError={data.error}
    />
  );
}
