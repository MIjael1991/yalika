import { RecoveryWorkspace } from './recovery-workspace';

export const metadata = {
  title: 'Recuperar acceso · Yalika',
};

export default async function RecoverPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  return <RecoveryWorkspace initialToken={params.token ?? ''} />;
}
