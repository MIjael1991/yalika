'use client';

import Link from 'next/link';
import { useState } from 'react';

export type SiteSummary = {
  id: string;
  name: string;
  slug: string;
  template: string;
  status: string;
  isPrimary: boolean;
  whatsappPhone: string | null;
  publishedAt: string | null;
  updatedAt: string;
};

const templateLabels: Record<string, string> = {
  yaleka_cherry_nails: 'Servicios · Cherry',
  yaleka_luna_boutique: 'Boutique',
  yaleka_prisma_papeleria: 'Papelería',
  boutique_elegant: 'Boutique elegante',
  social_vibrant: 'Social vibrante',
  minimal_catalog: 'Catálogo limpio',
  artisan_warm: 'Artesanal cálido',
  punk_rock: 'Punk rock',
  dark_neon: 'Neón oscuro',
  vacation_bright: 'Vacaciones',
};

async function action(path: string) {
  const response = await fetch(`/api/orion/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof body?.message === 'string' ? body.message : 'No se pudo completar la operación',
    );
  }
  return body;
}

export function SiteListWorkspace({ initialSites }: { initialSites: SiteSummary[] }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  async function run(id: string, operation: 'primary' | 'publish' | 'unpublish') {
    setBusy(`${id}:${operation}`);
    setError('');
    try {
      await action(`site/${id}/${operation}`);
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar');
    } finally {
      setBusy('');
    }
  }

  async function copyLink(site: SiteSummary) {
    const url = `${window.location.origin}/s/${site.slug}`;
    await navigator.clipboard.writeText(url);
    setCopied(site.id);
    window.setTimeout(() => setCopied(''), 1600);
  }

  return (
    <main className="min-h-screen bg-[#07111f] p-4 text-white md:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[.28em] text-cyan-300">Yaleka · Páginas</p>
            <h1 className="mt-2 text-3xl font-black md:text-4xl">Mis páginas</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              Puedes tener varias páginas en el mismo negocio. Cada una conserva diseño, enlace, menú, QR y equipo.
            </p>
          </div>
          <Link href="/sites/nueva" className="rounded-2xl bg-cyan-300 px-5 py-3 font-black text-slate-950">
            + Nueva página
          </Link>
        </header>

        {error ? <p className="mt-5 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-red-100">{error}</p> : null}

        {initialSites.length === 0 ? (
          <section className="mt-8 rounded-[2rem] border border-dashed border-white/15 bg-white/[0.03] p-10 text-center">
            <h2 className="text-xl font-black">Todavía no tienes páginas</h2>
            <p className="mt-2 text-slate-400">Crea la primera y Yaleka la marcará como principal.</p>
          </section>
        ) : (
          <section className="mt-8 grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
            {initialSites.map((site) => (
              <article key={site.id} className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-xl">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      {site.isPrimary ? <span className="rounded-full bg-cyan-300 px-3 py-1 text-[10px] font-black uppercase text-slate-950">Principal</span> : null}
                      <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${site.status === 'published' ? 'bg-emerald-300/15 text-emerald-200' : 'bg-amber-300/15 text-amber-100'}`}>
                        {site.status === 'published' ? 'Publicada' : 'Borrador'}
                      </span>
                    </div>
                    <h2 className="mt-4 text-2xl font-black">{site.name}</h2>
                    <p className="mt-1 text-sm text-slate-400">/s/{site.slug}</p>
                  </div>
                  <span className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-[10px] font-bold text-slate-400">
                    {templateLabels[site.template] ?? site.template}
                  </span>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-2">
                  <Link href={`/sites/editor/${site.id}`} className="rounded-xl bg-white px-4 py-3 text-center text-sm font-black text-slate-950">Editar</Link>
                  <a href={`/s/${site.slug}`} target="_blank" rel="noreferrer" className="rounded-xl border border-white/15 px-4 py-3 text-center text-sm font-bold">Ver página ↗</a>
                  <Link href={`/sites/menu/${site.id}`} className="rounded-xl border border-cyan-300/20 bg-cyan-300/5 px-4 py-3 text-center text-sm font-bold text-cyan-100">Menú</Link>
                  <Link href={`/sites/equipo/${site.id}`} className="rounded-xl border border-violet-300/20 bg-violet-300/5 px-4 py-3 text-center text-sm font-bold text-violet-100">Equipo</Link>
                  <Link href={`/sites/qr/${site.id}`} className="rounded-xl border border-emerald-300/20 bg-emerald-300/5 px-4 py-3 text-center text-sm font-bold text-emerald-100">QR</Link>
                  <button onClick={() => void copyLink(site)} className="rounded-xl border border-white/10 px-4 py-3 text-sm font-bold">{copied === site.id ? 'Copiado ✓' : 'Copiar enlace'}</button>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {!site.isPrimary ? (
                    <button disabled={busy !== ''} onClick={() => void run(site.id, 'primary')} className="rounded-xl border border-cyan-300/25 bg-cyan-300/5 px-3 py-2 text-xs font-bold text-cyan-100 disabled:opacity-40">Hacer principal</button>
                  ) : null}
                  {site.status === 'published' ? (
                    <button disabled={busy !== ''} onClick={() => void run(site.id, 'unpublish')} className="rounded-xl border border-amber-300/25 bg-amber-300/5 px-3 py-2 text-xs font-bold text-amber-100 disabled:opacity-40">Pasar a borrador</button>
                  ) : (
                    <button disabled={busy !== ''} onClick={() => void run(site.id, 'publish')} className="rounded-xl border border-emerald-300/25 bg-emerald-300/5 px-3 py-2 text-xs font-bold text-emerald-100 disabled:opacity-40">Publicar</button>
                  )}
                  <span className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-500">WhatsApp: {site.whatsappPhone ? 'listo' : 'sin configurar'}</span>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
