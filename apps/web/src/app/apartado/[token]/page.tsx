import { ReservationTracking } from './reservation-tracking';

export const dynamic = 'force-dynamic';

export default async function ReservationTrackingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <ReservationTracking token={token} />;
}
