'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useMemo, useState } from 'react';

const templates = [
  ['yaleka_cherry_nails', 'Servicios elegante · sin catálogo'],
  ['yaleka_luna_boutique', 'Luna Boutique · moda'],
  ['yaleka_prisma_papeleria', 'Prisma Papelería · colorida'],
  ['boutique_elegant', 'Boutique elegante'],
  ['minimal_catalog', 'Catálogo limpio'],
  ['social_vibrant', 'Social vibrante'],
  ['artisan_warm', 'Artesanal cálido'],
  ['dark_neon', 'Neón oscuro'],
] as const;

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

async function post(path: string, body?: unknown) {
  const response = await fetch(`/api/yalika/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data?.message === 'string' ? data.message : 'No se pudo crear la página');
  }
  return data as { id: string };
}

export function CreateSiteWorkspace({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [template, setTemplate] = useState('yaleka_luna_boutique');
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [publish, setPublish] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const suggested = useMemo(() => slug || slugify(name), [name, slug]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setError('Escribe el nombre de la página.');
    if (!suggested) return setError('Escribe un enlace válido.');
    setBusy(true);
    setError('');
    try {
      const created = await post('site', {
        companyId,
        name: name.trim(),
        slug: suggested,
        template,
        whatsappPhone: whatsappPhone.trim() || undefined,
        heroTitle: name.trim(),
        heroSubtitle:
          template === 'yaleka_prisma_papeleria'
            ? 'Escuela, oficina y creatividad en un solo lugar.'
            : template === 'yaleka_cherry_nails'
              ? 'Servicios, galería y contacto directo.'
              : 'Compra fácil y atención directa.',
      });
      if (publish) await post(`site/${created.id}/publish`);
      router.push('/sites');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#07111f] p-4 text-white md:p-8">
      <form onSubmit={submit} className="mx-auto max-w-2xl rounded-[2rem] border border-white/10 bg-white/[0.045] p-6 md:p-8">
        <p className="text-xs font-black uppercase tracking-[.28em] text-cyan-300">Yalika · Nueva página</p>
        <h1 className="mt-2 text-3xl font-black">Crear otra página</h1>
        <p className="mt-2 text-sm text-slate-400">No reemplaza las que ya tienes.</p>
        {error ? <p className="mt-5 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-red-100">{error}</p> : null}
        <label className="mt-6 block text-sm font-bold">Nombre<input value={name} onChange={(e) => setName(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3" placeholder="Ej. Mi tienda" /></label>
        <label className="mt-4 block text-sm font-bold">Enlace<input value={slug} onChange={(e) => setSlug(slugify(e.target.value))} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3" placeholder={suggested || 'mi-tienda'} /></label>
        <p className="mt-1 text-xs text-slate-500">Quedará como /s/{suggested || 'mi-tienda'}</p>
        <label className="mt-4 block text-sm font-bold">Diseño<select value={template} onChange={(e) => setTemplate(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3">{templates.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label className="mt-4 block text-sm font-bold">WhatsApp<input value={whatsappPhone} onChange={(e) => setWhatsappPhone(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3" placeholder="443..." /></label>
        <label className="mt-5 flex items-center gap-3 text-sm"><input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} /> Publicarla al crear</label>
        <div className="mt-7 flex gap-3"><button disabled={busy} className="flex-1 rounded-xl bg-cyan-300 px-5 py-3 font-black text-slate-950 disabled:opacity-50">{busy ? 'Creando…' : 'Crear página'}</button><a href="/sites" className="rounded-xl border border-white/10 px-5 py-3 font-bold">Cancelar</a></div>
      </form>
    </main>
  );
}
