import { PetDetail } from './pet-detail';

export const dynamic = 'force-dynamic';

export default async function PetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PetDetail petId={id} />;
}
