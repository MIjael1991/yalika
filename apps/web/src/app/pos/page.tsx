import { cookies } from 'next/headers';
import { requireBusinessSession } from '../../lib/yalika-business-session';
import {
  PosWorkspace,
  type ActivePromotion,
  type Product,
} from './pos-workspace';

export const dynamic = 'force-dynamic';

async function getProducts(companyId: string, cookieHeader: string) {
  if (!companyId) {
    return {
      products: [] as Product[],
      error: '',
    };
  }

  const apiUrl = (
    process.env.YALIKA_API_URL ?? 'http://localhost:3000'
  ).replace(/\/+$/, '');

  try {
    const response = await fetch(
      `${apiUrl}/catalog/product/company/${encodeURIComponent(companyId)}`,
      { headers: { cookie: cookieHeader }, cache: 'no-store' },
    );

    if (!response.ok) {
      return {
        products: [] as Product[],
        error: 'No se pudo cargar el catálogo',
      };
    }

    return {
      products: (await response.json()) as Product[],
      error: '',
    };
  } catch {
    return {
      products: [] as Product[],
      error: 'Yalika API no está disponible',
    };
  }
}

async function getPromotions(companyId: string) {
  if (!companyId) {
    return [] as ActivePromotion[];
  }

  const apiUrl = (
    process.env.YALIKA_API_URL ?? 'http://localhost:3000'
  ).replace(/\/+$/, '');

  try {
    const response = await fetch(
      `${apiUrl}/promotion/public/company/${encodeURIComponent(companyId)}`,
      { cache: 'no-store' },
    );

    return response.ok
      ? ((await response.json()) as ActivePromotion[])
      : [];
  } catch {
    return [] as ActivePromotion[];
  }
}

export default async function PosPage() {
  const user = await requireBusinessSession();
  const companyId = user.companyId;
  const cookieHeader = (await cookies()).toString();
  const [catalog, promotions] = await Promise.all([
    getProducts(companyId, cookieHeader),
    getPromotions(companyId),
  ]);

  return (
    <PosWorkspace
      initialCompanyId={companyId}
      initialAuthorizedUserId={user.id}
      initialProducts={catalog.products}
      initialPromotions={promotions}
      initialCatalogError={catalog.error}
    />
  );
}
