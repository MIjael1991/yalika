import { notFound } from 'next/navigation';

import { tradeGroups } from '@/lib/yalika-presente';

import { ServiceGroup } from './service-group';

export const dynamic = 'force-dynamic';

export default async function TequioGroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ grupo: string }>;
  searchParams: Promise<{ oficio?: string }>;
}) {
  const { grupo } = await params;
  const { oficio } = await searchParams;
  const group = tradeGroups.find((g) => g.key === grupo && g.key !== 'otros');
  if (!group) notFound();
  return <ServiceGroup groupKey={group.key} initialTrade={typeof oficio === 'string' ? oficio : ''} />;
}
