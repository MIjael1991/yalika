'use client';
import { useEffect, useState } from 'react';
import { listLocalFiles, saveLocalFile, type FileScope, type LocalFile } from '../../lib/yalika-local-files';
import styles from '../estudio/studio.module.css';

const size = (n: number) => (n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
const kind = (name: string) => (name.includes('.') ? name.split('.').pop()!.slice(0, 4) : 'arch');

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
  return <main className={styles.workspace}>
    <header className={styles.heading}>
      <div>
        <h1>Mis archivos</h1>
        <p>Documentos y materiales de Estudio en este dispositivo. No se suben a la nube ni se comparten con otros usuarios.</p>
      </div>
    </header>
    <div className={styles.fileUpload}>
      <span><strong>Agregar un archivo</strong><small>Hasta 20 MB por archivo.</small></span>
      <label className={styles.bigButton} aria-disabled={busy}>{busy ? 'Guardando…' : 'Elegir archivo'}<input aria-label="Agregar archivo" type="file" hidden disabled={busy} onChange={e => { void add(e.target.files?.[0]); e.target.value = ''; }} /></label>
    </div>
    <p className={styles.help}>Los resultados de Estudio (PDF, ZIP, Word) se conservan 30 días y luego se borran solos; lo que agregas tú a mano no vence. Descarga una copia para conservarla si borras los datos del navegador o cambias de equipo. En un equipo compartido usa perfiles de navegador separados.</p>
    {notice ? <p role="status" className={styles.help}>{notice}</p> : null}
    {files.length ? <ul className={styles.fileList} aria-label="Archivos guardados">{files.map(file => <li key={file.id} className={styles.fileItem}>
      <span className={styles.fileKind} aria-hidden="true">{kind(file.name)}</span>
      <div><strong>{file.name}</strong><small>{size(file.size)} · {new Date(file.createdAt).toLocaleDateString('es-MX')} · Solo en este dispositivo{file.expiresAt ? ` · Se borra el ${new Date(file.expiresAt).toLocaleDateString('es-MX')}` : ''}</small></div>
      <button type="button" onClick={() => download(file)}>Descargar</button>
    </li>)}</ul> : <div className={styles.drop}><strong>Aún no tienes archivos guardados</strong><p>Aparecerán aquí al agregarlos o al guardarlos desde Estudio.</p></div>}
  </main>;
}
