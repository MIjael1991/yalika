import {
  RewardsClub,
  type ClubConfiguration,
} from './rewards-club';

export const dynamic = 'force-dynamic';

const apiUrl = (
  process.env.ORION_API_URL ??
  'http://localhost:3000'
).replace(/\/+$/, '');

async function getClub(slug: string) {
  try {
    const response = await fetch(
      `${apiUrl}/engagement/public/${encodeURIComponent(slug)}`,
      {
        cache: 'no-store',
      },
    );

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as ClubConfiguration;
  } catch {
    return null;
  }
}

export default async function RewardsPage({
  params,
  searchParams,
}: {
  params: Promise<{
    slug: string;
  }>;
  searchParams: Promise<{
    ticket?: string;
    token?: string;
  }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const club = await getClub(slug);

  return (
    <RewardsClub
      slug={slug}
      initialClub={club}
      ticketOrderId={query.ticket ?? ''}
      ticketToken={query.token ?? ''}
    />
  );
}
