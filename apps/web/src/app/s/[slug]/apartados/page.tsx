import { ReservableCatalog } from './reservable-catalog';

export const dynamic = 'force-dynamic';

const apiUrl = (
  process.env.ORION_API_URL ?? 'http://localhost:3000'
).replace(/\/+$/, '');

export default async function StoreReservationsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let data: unknown = null;
  let error = '';

  try {
    const response = await fetch(
      `${apiUrl}/reservation/public/site/${encodeURIComponent(slug)}/catalog`,
      { cache: 'no-store' },
    );
    if (!response.ok) {
      error =
        response.status === 404
          ? 'Esta tienda no está disponible.'
          : 'No fue posible cargar los apartados.';
    } else {
      data = await response.json();
    }
  } catch {
    error = 'La tienda no está disponible en este momento.';
  }

  return <ReservableCatalog slug={slug} initialData={data} initialError={error} />;
}
