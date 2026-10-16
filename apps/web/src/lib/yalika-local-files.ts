// Device-only repository. No upload, shared public URL or implicit cloud sync.
export type FileScope = { userId: string; companyId: string };
export type LocalFile = { id: string; name: string; type: string; size: number; createdAt: string; blob: Blob };
const MAX_SIZE = 20 * 1024 * 1024;
export function scopeKey(scope: FileScope) {
  if (!scope.userId.trim() || !scope.companyId.trim()) throw new Error('Sesión incompleta');
  return JSON.stringify([scope.companyId, scope.userId]);
}
export function checkFile(file: Blob, name: string) {
  if (!name.trim() || file.size > MAX_SIZE) throw new Error('Elige un archivo de hasta 20 MB.');
}
function openStore(scope: FileScope): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(`yaleka.files.v1:${scopeKey(scope)}`, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('files', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('No se pudo abrir el almacenamiento local.'));
    request.onblocked = () => reject(new Error('Cierra las otras pestañas de Yalika y vuelve a intentar.'));
  });
}
export async function listLocalFiles(scope: FileScope): Promise<LocalFile[]> {
  const db = await openStore(scope);
  return new Promise((resolve, reject) => {
    const tx = db.transaction('files', 'readonly');
    const req = tx.objectStore('files').getAll();
    tx.oncomplete = () => { db.close(); resolve((req.result as LocalFile[]).sort((a,b) => b.createdAt.localeCompare(a.createdAt))); };
    tx.onabort = () => { db.close(); reject(new Error('No se pudieron leer los archivos.')); };
  });
}
// A caller keeps operationId across retries. Same ID + different content is a conflict.
export async function saveLocalFile(scope: FileScope, blob: Blob, name: string, operationId: string): Promise<void> {
  checkFile(blob, name);
  if (!operationId.trim()) throw new Error('Falta el identificador de operación');
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))).map(v => v.toString(16).padStart(2,'0')).join('');
  const db = await openStore(scope);
  return new Promise((resolve, reject) => {
    const tx = db.transaction('files', 'readwrite');
    const store = tx.objectStore('files');
    let conflict = false;
    const req = store.get(operationId);
    req.onsuccess = () => {
      if (req.result) {
        if (req.result.digest !== digest || req.result.name !== name || req.result.type !== blob.type) { conflict = true; tx.abort(); }
      } else {
        store.add({ id: operationId, name, type: blob.type, size: blob.size, blob, digest, createdAt: new Date().toISOString() });
      }
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onabort = () => { db.close(); reject(new Error(conflict ? 'La operación ya pertenece a otro archivo.' : 'No se guardó el archivo. Revisa el espacio disponible.')); };
  });
}
