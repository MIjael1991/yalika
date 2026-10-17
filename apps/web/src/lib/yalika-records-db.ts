// Almacenamiento local de expedientes (IndexedDB), separado por empresa y usuario.
// Solo vive en este dispositivo: no es una nube ni un respaldo.
import { scopeKey, type FileScope } from "./yalika-local-files";
import type { Expediente, RecordFile } from "./yalika-records";
function open(scope: FileScope): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("yalika.records.v1:" + scopeKey(scope), 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("records", { keyPath: "id" });
      req.result.createObjectStore("files", { keyPath: "id" }).createIndex("record", "recordId");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new Error("No se pudo abrir el almacenamiento local."));
    req.onblocked = () => reject(new Error("Cierra las otras pestañas de Yalika y vuelve a intentar."));
  });
}
function run<T>(
  scope: FileScope,
  mode: IDBTransactionMode,
  job: (tx: IDBTransaction) => IDBRequest<T> | void,
): Promise<T | undefined> {
  return open(scope).then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const tx = db.transaction(["records", "files"], mode),
          req = job(tx);
        tx.oncomplete = () => {
          db.close();
          resolve(req ? req.result : undefined);
        };
        tx.onabort = () => {
          db.close();
          const quota = tx.error?.name === "QuotaExceededError";
          reject(new Error(quota ? "No hay espacio en este dispositivo." : "No se pudo guardar en este dispositivo."));
        };
      }),
  );
}
export async function listRecords(scope: FileScope): Promise<Expediente[]> {
  const rows = (await run<Expediente[]>(scope, "readonly", (tx) => tx.objectStore("records").getAll())) ?? [];
  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function saveRecord(scope: FileScope, e: Expediente) {
  await run(scope, "readwrite", (tx) => {
    tx.objectStore("records").put(e);
  });
}
export async function listFiles(scope: FileScope, recordId: string): Promise<RecordFile[]> {
  const rows =
    (await run<RecordFile[]>(scope, "readonly", (tx) => tx.objectStore("files").index("record").getAll(recordId))) ?? [];
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
// El archivo y el contador del expediente se guardan juntos: todo o nada.
export async function attachFile(scope: FileScope, file: RecordFile, e: Expediente) {
  await run(scope, "readwrite", (tx) => {
    tx.objectStore("files").put(file);
    tx.objectStore("records").put(e);
  });
}
export async function detachFile(scope: FileScope, fileId: string, e: Expediente) {
  await run(scope, "readwrite", (tx) => {
    tx.objectStore("files").delete(fileId);
    tx.objectStore("records").put(e);
  });
}
// Borra el expediente y todos sus archivos en una sola operación: todo o nada.
export async function deleteRecord(scope: FileScope, id: string) {
  await run(scope, "readwrite", (tx) => {
    tx.objectStore("records").delete(id);
    const cursor = tx.objectStore("files").index("record").openKeyCursor(IDBKeyRange.only(id));
    cursor.onsuccess = () => {
      const c = cursor.result;
      if (c) {
        tx.objectStore("files").delete(c.primaryKey);
        c.continue();
      }
    };
  });
}
