import { requireBusinessSession } from '../../../lib/yalika-business-session';
import { InventoryWorkspace } from './inventory-workspace';

export const dynamic = 'force-dynamic';

export default async function InventoryPage() {
  const user = await requireBusinessSession();
  return <InventoryWorkspace companyId={user.companyId} />;
}
