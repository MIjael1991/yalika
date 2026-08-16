import { PosWorkspace, type Product } from './pos-workspace';

export const dynamic = 'force-dynamic';

async function getProducts(companyId: string) {
  if (!companyId) {
    return {
      products: [] as Product[],
      error: '',
    };
  }

  const apiUrl = (
    process.env.ORION_API_URL ?? 'http://localhost:3000'
  ).replace(/\/+$/, '');

  try {
    const response = await fetch(
      `${apiUrl}/catalog/product/company/${encodeURIComponent(companyId)}`,
      { cache: 'no-store' },
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
      error: 'ORION API no está disponible',
    };
  }
}

export default async function PosPage() {
  const companyId = process.env.ORION_COMPANY_ID ?? '';
  const catalog = await getProducts(companyId);

  return (
    <PosWorkspace
      initialCompanyId={companyId}
      initialAuthorizedUserId={process.env.ORION_AUTHORIZED_USER_ID ?? ''}
      initialProducts={catalog.products}
      initialCatalogError={catalog.error}
    />
  );
}
