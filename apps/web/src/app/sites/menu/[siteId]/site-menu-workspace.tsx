'use client';

import { useState } from 'react';

export type EditableSection = {
  id: string;
  type: string;
  title: string | null;
  enabled: boolean;
  sortOrder: number;
  layout: string;
  content?: Record<string, unknown> | null;
};

const typeLabels: Record<string, string> = {
  hero: 'Inicio',
  catalog: 'Productos',
  promotions: 'Promociones',
  gallery: 'Galería',
  menu: 'Servicios / categorías',
  text: 'Información',
  loyalty: 'Recompensas',
  location: 'Ubicación',
  contact: 'Contacto',
  video: 'Video',
  banner: 'Aviso',
};

export function SiteMenuWorkspace({
  siteId,
  siteName,
  initialSections,
}: {
  siteId: string;
  siteName: string;
  initialSections: EditableSection[];
}) {
  const [sections, setSections] = useState(
    [...initialSections].sort((a, b) => a.sortOrder - b.sortOrder),
  );
  const [dragging, setDragging] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  function move(from: number, to: number) {
    if (to < 0 || to >= sections.length || from === to) return;
    setSections((current) => {
      const next = [...current];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

  async function save() {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/orion/site/${siteId}/sections`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-yalika-confirm-live-update': 'yes',
        },
        body: JSON.stringify({
          sections: sections.map((section, index) => ({
            type: section.type,
            title: section.title || undefined,
            enabled: section.enabled,
            sortOrder: index * 10,
            layout: section.layout || 'default',
            content: section.content ?? undefined,
          })),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof body?.message === 'string' ? body.message : 'No se pudo guardar');
      setMessage('Menú guardado.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#07111f] p-4 text-white md:p-8">
      <div className="mx-auto max-w-3xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[.28em] text-cyan-300">Yaleka · Menú</p>
            <h1 className="mt-2 text-3xl font-black">{siteName}</h1>
            <p className="mt-2 text-sm text-slate-400">Arrastra los bloques para ordenar el menú. También puedes usar ↑ y ↓.</p>
          </div>
          <a href="/sites" className="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold">← Mis páginas</a>
        </div>

        <div className="mt-7 space-y-3">
          {sections.map((section, index) => (
            <div
              key={section.id}
              draggable
              onDragStart={() => setDragging(index)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (dragging !== null) move(dragging, index);
                setDragging(null);
              }}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.05] p-4"
            >
              <span className="cursor-grab text-xl text-slate-500" title="Arrastrar">⋮⋮</span>
              <div className="min-w-[150px] flex-1">
                <p className="text-[10px] font-black uppercase tracking-[.2em] text-slate-500">{typeLabels[section.type] ?? section.type}</p>
                <input
                  value={section.title ?? ''}
                  onChange={(event) => setSections((current) => current.map((item, i) => i === index ? { ...item, title: event.target.value } : item))}
                  placeholder={typeLabels[section.type] ?? 'Sección'}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm"
                />
              </div>
              <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={section.enabled} onChange={(event) => setSections((current) => current.map((item, i) => i === index ? { ...item, enabled: event.target.checked } : item))} /> Visible</label>
              <div className="flex gap-1"><button type="button" onClick={() => move(index, index - 1)} className="rounded-lg border border-white/10 px-3 py-2">↑</button><button type="button" onClick={() => move(index, index + 1)} className="rounded-lg border border-white/10 px-3 py-2">↓</button></div>
            </div>
          ))}
        </div>

        {message ? <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm">{message}</p> : null}
        <button disabled={busy} onClick={() => void save()} className="mt-6 w-full rounded-2xl bg-cyan-300 px-5 py-4 font-black text-slate-950 disabled:opacity-50">{busy ? 'Guardando…' : 'Guardar orden del menú'}</button>
      </div>
    </main>
  );
}
