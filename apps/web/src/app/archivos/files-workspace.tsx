'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { listLocalFiles, saveLocalFile, type FileScope, type LocalFile } from '../../lib/yalika-local-files';
export function FilesWorkspace({ scope }: { scope: FileScope }) {
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { let active = true; listLocalFiles(scope).then(rows => { if (active) setFiles(rows); }).catch(e => { if (active) setNotice(e.message); }); return () => { active = false; }; }, [scope]);
  async function add(file?: File) {
    if (!file || busy) return;
    setBusy(true); setNotice('');
    try { await saveLocalFile(scope, file, file.name, crypto.randomUUID()); setFiles(await listLocalFiles(scope)); setNotice('Guardado en este navegador.'); }
    catch(e) { setNotice(e instanceof Error ? e.message : 'No se pudo guardar.'); }
    finally { setBusy(false); }
  }
  function download(file: LocalFile) {
    const url = URL.createObjectURL(file.blob); const a = document.createElement('a');
    a.href = url; a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <main className="mx-auto max-w-5xl p-5 text-[var(--yk-text)] sm:p-8">
    <p className="text-xs tracking-widest text-[var(--yk-link)]">YALIKA</p><h1 className="mt-2 text-3xl font-bold">Archivos</h1>
    <p className="mt-3 max-w-2xl text-[var(--yk-muted)]">Documentos y materiales de Estudio en este dispositivo. No se suben a la nube ni se comparten con otros usuarios.</p>
    <div className="my-6 flex flex-wrap gap-3"><label className="cursor-pointer rounded-xl bg-cyan-300 px-4 py-3 font-bold text-slate-950">{busy ? 'Guardando…' : 'Agregar archivo'}<input aria-label="Agregar archivo" type="file" disabled={busy} className="sr-only" onChange={e => { void add(e.target.files?.[0]); e.target.value = ''; }} /></label><Link href="/estudio" className="rounded-xl border border-[var(--yk-border)] px-4 py-3">Abrir Estudio</Link></div>
    <p className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 text-sm text-amber-100">Hasta 20 MB por archivo. Descargar una copia te permite conservarla si borras los datos del navegador o cambias de equipo. En un equipo compartido usa perfiles de navegador separados.</p>
    <p role="status" className="my-4 text-sm text-[var(--yk-link)]">{notice}</p>
    <div className="space-y-3">{files.map(file => <article key={file.id} className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--yk-border)] bg-[var(--yk-panel)] p-4"><div className="min-w-0"><h2 className="break-words font-semibold">{file.name}</h2><p className="text-xs text-[var(--yk-muted)]">{Math.ceil(file.size / 1024)} KB · {new Date(file.createdAt).toLocaleDateString('es-MX')} · Local</p></div><button type="button" onClick={() => download(file)} className="rounded-xl border border-cyan-300/30 p-3 text-sm">Descargar</button></article>)}</div>
    {!files.length ? <p className="mt-8 text-[var(--yk-muted)]">Tus archivos aparecerán aquí al agregarlos o guardarlos desde Estudio.</p> : null}
  </main>;
}
