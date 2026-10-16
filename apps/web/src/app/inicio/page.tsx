import { requireBusinessSession } from '../../lib/yalika-business-session';
import { HomeWorkspace } from './home-workspace';
export const dynamic = 'force-dynamic';
export default async function Page() {
  await requireBusinessSession();
  return <HomeWorkspace />;
}
