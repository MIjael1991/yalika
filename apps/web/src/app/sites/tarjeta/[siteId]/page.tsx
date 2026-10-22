import QRCode from 'qrcode';
import { cookies, headers } from 'next/headers';
import { requireManagerSession } from '../../../../lib/yalika-business-session';
import { PRESET_BY_ID } from '../../../s/[slug]/template-presets';
import { TarjetaEditor } from './tarjeta-editor';

export const dynamic = 'force-dynamic';
const apiUrl = (process.env.YALIKA_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

type Site = {
  id: string;
  name: string;
  slug: string;
  template: string;
  whatsappPhone: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  tiktokUrl: string | null;
  accentColor: string | null;
};

const hex = (value: string | null | undefined, fallback: string) => (value && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback);

function handle(url: string | null) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    return `${parsed.hostname.replace(/^www\./, '')}${parsed.pathname.replace(/\/$/, '')}`;
  } catch {
    return '';
  }
}

export default async function SiteCardPage({ params }: { params: Promise<{ siteId: string }> }) {
  const user = await requireManagerSession();
  const { siteId } = await params;
  const cookieHeader = (await cookies()).toString();
  const response = await fetch(`${apiUrl}/site/company/${encodeURIComponent(user.companyId)}/site/${encodeURIComponent(siteId)}`, {
    headers: { cookie: cookieHeader },
    cache: 'no-store',
  }).catch(() => null);
  if (!response?.ok) return <main className="min-h-screen bg-slate-950 p-8 text-white">Página no encontrada o sin permiso.</main>;
  const site = (await response.json()) as Site;

  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3001';
  const forwardedProto = h.get('x-forwarded-proto');
  const proto = forwardedProto ?? (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
  const publicUrl = `${proto}://${host}/s/${site.slug}`;
  const qrDataUrl = await QRCode.toDataURL(publicUrl, { width: 260, margin: 1, errorCorrectionLevel: 'M' });
  const localOnly = host.startsWith('localhost') || host.startsWith('127.0.0.1');

  const preset = PRESET_BY_ID[site.template];
  const colors = {
    bg: preset?.c.bg ?? '#ffffff',
    fg: preset?.c.fg ?? '#12303d',
    accent: hex(site.accentColor, preset?.c.accent ?? '#0e6f8a'),
    onAccent: preset?.c.onAccent ?? '#ffffff',
    deep: preset?.c.deep ?? '#12303d',
  };

  return (
    <TarjetaEditor
      initial={{
        name: site.name,
        role: preset?.label ?? '',
        phone: site.whatsappPhone ?? '',
        email: '',
        address: '',
        instagram: handle(site.instagramUrl),
        facebook: handle(site.facebookUrl),
      }}
      colors={colors}
      publicUrl={publicUrl}
      qrDataUrl={qrDataUrl}
      localOnly={localOnly}
    />
  );
}
