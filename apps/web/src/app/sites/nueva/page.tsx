import { requireBusinessSession } from '../../../lib/yalika-business-session';
import { CreateSiteWorkspace } from './create-site-workspace';

export default async function NuevaPagina() {
  const user = await requireBusinessSession();
  return <CreateSiteWorkspace companyId={user.companyId} />;
}
