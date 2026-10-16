import { requireBusinessSession } from '../../lib/yalika-business-session';
import Link from 'next/link';
import { FilesWorkspace } from '../archivos/files-workspace';
import { StudioWorkspace } from './studio-workspace';
export const dynamic = 'force-dynamic';
export default async function StudioPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const files = (await searchParams).tab === 'archivos';
  const user = await requireBusinessSession();
  return <><nav aria-label="Estudio" className="flex gap-3 px-5 pt-5 text-[var(--yk-text)]"><Link aria-current={!files ? 'page' : undefined} className="min-h-12 rounded-xl border border-blue-400 px-5 py-3" href="/estudio">Crear</Link><Link aria-current={files ? 'page' : undefined} className="min-h-12 rounded-xl border border-blue-400 px-5 py-3" href="/estudio?tab=archivos">Mis archivos</Link></nav>{files ? <FilesWorkspace scope={{ userId:user.id, companyId:user.companyId }} /> : <StudioWorkspace scope={{ userId:user.id, companyId:user.companyId }} />}</>;
}
