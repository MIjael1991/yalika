import QRCode from 'qrcode';
import { cookies, headers } from 'next/headers';
import { requireManagerSession } from '../../../../lib/yalika-business-session';
import { QrActions } from './qr-actions';

export const dynamic = 'force-dynamic';
const apiUrl = (process.env.YALIKA_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

type Site = { id: string; name: string; slug: string; status: string };

export default async function SiteQrPage({ params }: { params: Promise<{ siteId: string }> }) {
  const user = await requireManagerSession();
  const { siteId } = await params;
  const cookieHeader = (await cookies()).toString();
  const response = await fetch(`${apiUrl}/site/company/${encodeURIComponent(user.companyId)}/site/${encodeURIComponent(siteId)}`, {
    headers: { cookie: cookieHeader }, cache: 'no-store',
  }).catch(() => null);
  if (!response?.ok) return <main className="min-h-screen bg-slate-950 p-8 text-white">Página no encontrada o sin permiso.</main>;
  const site = (await response.json()) as Site;
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3001';
  const forwardedProto = h.get('x-forwarded-proto');
  const proto = forwardedProto ?? (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
  const publicUrl = `${proto}://${host}/s/${site.slug}`;
  const qrDataUrl = await QRCode.toDataURL(publicUrl, { width: 340, margin: 2, errorCorrectionLevel: 'M' });
  const localOnly = host.startsWith('localhost') || host.startsWith('127.0.0.1');

  return (
    <main className="min-h-screen bg-[#07111f] p-4 text-white md:p-8 print:bg-white print:text-black">
      <div className="mx-auto max-w-xl rounded-[2rem] border border-white/10 bg-white/[0.045] p-6 text-center print:border-0 print:bg-white">
        <p className="text-xs font-black uppercase tracking-[.28em] text-emerald-300 print:text-black">Yalika · QR de página</p>
        <h1 className="mt-2 text-3xl font-black">{site.name}</h1>
        <div className="mx-auto mt-6 w-fit rounded-3xl bg-white p-4"><img src={qrDataUrl} alt={`QR de ${site.name}`} className="h-[300px] w-[300px]" /></div>
        <p className="mt-4 break-all text-sm text-slate-400 print:text-black">{publicUrl}</p>
        {localOnly ? <p className="mt-3 rounded-xl bg-amber-300/10 p-3 text-xs text-amber-100 print:hidden">Este QR apunta a localhost porque estás trabajando en local. En producción usará el dominio público.</p> : null}
        <QrActions url={publicUrl} qrDataUrl={qrDataUrl} slug={site.slug} />
        <a href="/sites" className="mt-4 inline-block text-sm font-bold text-cyan-300 print:hidden">← Mis páginas</a>
      </div>
    </main>
  );
}
