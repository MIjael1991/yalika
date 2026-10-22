import { SafetyRecordView } from './safety-record';

export const dynamic = 'force-dynamic';

export default async function TequioRegistroPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SafetyRecordView id={id} />;
}
