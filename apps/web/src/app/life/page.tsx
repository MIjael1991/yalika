import { LifeWorkspace } from './life-workspace';

export const dynamic = 'force-dynamic';

export default function LifePage() {
  const companyId = process.env.ORION_COMPANY_ID ?? '';
  const userId = process.env.ORION_AUTHORIZED_USER_ID ?? '';

  return <LifeWorkspace companyId={companyId} userId={userId} />;
}
