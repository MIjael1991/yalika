import { requireManagerSession } from '../../../lib/yalika-business-session';
import { CreateSiteWorkspace } from './create-site-workspace';

export default async function NuevaPagina() {
  const user = await requireManagerSession();
  return <CreateSiteWorkspace companyId={user.companyId} />;
}
