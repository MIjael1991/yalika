import { AccountHub } from './account-hub';
import { sectionFrom } from './sections';

export const metadata = {
  title: 'Mi cuenta · Yalika',
};

export const dynamic = 'force-dynamic';

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ seccion?: string }>;
}) {
  const { seccion } = await searchParams;
  return <AccountHub section={sectionFrom(seccion)} />;
}
