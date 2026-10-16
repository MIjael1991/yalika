'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { saveLocalFile, type FileScope } from '../../lib/yaleka-local-files';
const tools = [
  ['Imagen', 'Conserva imágenes originales en Archivos. Edición y generación: pendientes.'],
  ['DOCX', 'Importa documentos existentes. Generación y edición: pendientes.'],
  ['PDF', 'Conserva tus PDF. Escaneo y exportación: pendientes.'],
  ['XLSX', 'Guarda hojas existentes. Edición y cálculos: pendientes.'],
  ['Presentación', 'Guarda tu archivo existente. Creación de diapositivas: pendiente.'],
  ['Escaneo y conversión', 'Captura, OCR y conversión entre formatos: pendientes.'],
];
export function StudioWorkspace({ scope }: { scope: FileScope }) {
  const [text, setText] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  const operation = useRef<{ text: string; id: string } | null>(null);
  async function save() {
    if (busy || !text.trim()) return;
    setBusy(true);
    if (!operation.current || operation.current.text !== text) operation.current = { text, id: crypto.randomUUID() };
    try { await saveLocalFile(scope, new Blob([text], { type: 'text/plain;charset=utf-8' }), 'Borrador-Yaleka.txt', operation.current.id); setNotice('Borrador guardado en Archivos, en este dispositivo.'); }
    catch(e) { setNotice(e instanceof Error ? e.message : 'No se pudo guardar.'); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-5xl p-5 text-[var(--yk-text)] sm:p-8"><p className="text-xs tracking-widest text-[var(--yk-link)]">YALEKA</p><h1 className="mt-2 text-3xl font-bold">Estudio</h1><p className="mt-3 text-[var(--yk-muted)]">Un lugar para preparar contenido y organizar tus materiales. El asistente está en Mi día.</p>
    <div className="my-6 flex gap-3"><Link className="rounded-xl bg-cyan-300 px-4 py-3 font-semibold text-slate-950" href="/life#orion-captura">Pedir ayuda al asistente</Link><Link className="rounded-xl border border-[var(--yk-border)] px-4 py-3" href="/estudio?tab=archivos">Agregar o ver archivos</Link></div>
    <section className="rounded-3xl border border-[var(--yk-border)] bg-[var(--yk-panel)] p-5"><h2 className="text-lg font-bold">Borrador de texto</h2><label className="mt-3 block text-sm text-[var(--yk-muted)]">Contenido<textarea lang="es-MX" spellCheck maxLength={100000} value={text} onChange={e => setText(e.target.value)} rows={7} className="mt-2 w-full rounded-xl border border-[var(--yk-border)] bg-[var(--yk-field)] p-4" placeholder="Escribe o pega el contenido que quieres preparar…" /></label><button disabled={busy || !text.trim()} onClick={() => void save()} className="mt-3 rounded-xl bg-cyan-300 px-4 py-3 font-bold text-slate-950 disabled:opacity-40">{busy ? 'Guardando…' : 'Guardar en Archivos'}</button><p role="status" className="mt-3 text-sm text-[var(--yk-link)]">{notice}</p></section>
    <h2 className="mb-3 mt-8 text-lg font-bold">Herramientas y disponibilidad</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{tools.map(([title, description]) => <article key={title} className="rounded-2xl border border-[var(--yk-border)] p-5"><h3 className="font-bold">{title}</h3><p className="mt-2 text-sm text-[var(--yk-muted)]">{description}</p></article>)}</div>
  </main>;
}
