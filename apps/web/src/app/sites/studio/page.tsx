import { requireBusinessSession } from '../../../lib/yalika-business-session';
import { SiteStudioWorkspace } from './site-studio-workspace';

export const dynamic = 'force-dynamic';

export default async function SiteStudioPage() {
  const user = await requireBusinessSession();
  return <SiteStudioWorkspace companyId={user.companyId} userId={user.id} />;
}
