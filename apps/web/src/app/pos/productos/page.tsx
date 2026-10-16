import { requireBusinessSession } from '../../../lib/yalika-business-session';
import { ProductManager } from './product-manager';

export const dynamic = 'force-dynamic';

export default async function ProductsPage() {
  const user = await requireBusinessSession();
  return <ProductManager companyId={user.companyId} />;
}
