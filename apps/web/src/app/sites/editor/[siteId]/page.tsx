import { cookies } from 'next/headers';
import { requireBusinessSession } from '../../../../lib/yalika-business-session';
import {
  SiteBuilderWorkspace,
  type CatalogProduct,
  type LoyaltyProgramRecord,
  type PromotionRecord,
  type ScratchCampaignRecord,
  type SiteRecord,
} from '../../site-builder-workspace';

export const dynamic = 'force-dynamic';

const apiUrl = (process.env.YALIKA_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

async function getApi<T>(path: string, cookieHeader: string) {
  try {
    const response = await fetch(`${apiUrl}/${path}`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export default async function SiteEditorPage({ params }: { params: Promise<{ siteId: string }> }) {
  const user = await requireBusinessSession();
  const { siteId } = await params;
  const companyId = user.companyId;
  const cookieHeader = (await cookies()).toString();

  const [site, products, promotions, loyaltyPrograms, scratchCampaign] = await Promise.all([
    getApi<SiteRecord>(`site/company/${encodeURIComponent(companyId)}/site/${encodeURIComponent(siteId)}`, cookieHeader),
    getApi<CatalogProduct[]>(`catalog/product/company/${encodeURIComponent(companyId)}`, cookieHeader),
    getApi<PromotionRecord[]>(`promotion/company/${encodeURIComponent(companyId)}`, cookieHeader),
    getApi<LoyaltyProgramRecord[]>(`loyalty-program/company/${encodeURIComponent(companyId)}`, cookieHeader),
    getApi<ScratchCampaignRecord>(`scratch/company/${encodeURIComponent(companyId)}`, cookieHeader),
  ]);

  if (!site) {
    return <main className="min-h-screen bg-slate-950 p-8 text-white"><h1 className="text-2xl font-black">Página no encontrada o sin permiso</h1><a href="/sites" className="mt-4 inline-block text-cyan-300">Volver a Mis páginas</a></main>;
  }

  return (
    <>
      <div className="bg-[#07111f] px-4 pt-4 text-white md:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap gap-2">
          <a href="/sites" className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold">← Mis páginas</a>
          <a href={`/sites/menu/${siteId}`} className="rounded-xl border border-cyan-300/20 px-3 py-2 text-xs font-bold text-cyan-200">Ordenar menú</a>
          <a href={`/sites/equipo/${siteId}`} className="rounded-xl border border-violet-300/20 px-3 py-2 text-xs font-bold text-violet-200">Equipo y permisos</a>
          <a href={`/sites/qr/${siteId}`} className="rounded-xl border border-emerald-300/20 px-3 py-2 text-xs font-bold text-emerald-200">QR</a>
        </div>
      </div>
      <SiteBuilderWorkspace
        initialCompanyId={companyId}
        initialSite={site}
        initialProducts={products ?? []}
        initialPromotions={promotions ?? []}
        initialLoyaltyPrograms={loyaltyPrograms ?? []}
        initialScratchCampaign={scratchCampaign}
        initialAuthorizedUserId={user.id}
      />
    </>
  );
}
