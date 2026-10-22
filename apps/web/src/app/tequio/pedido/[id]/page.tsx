import { RequestDetail } from './request-detail';

export const dynamic = 'force-dynamic';

export default async function PresentePedidoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RequestDetail id={id} />;
}
