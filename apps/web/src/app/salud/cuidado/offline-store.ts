const DB_NAME = "yaleka-clinical-offline";
const DB_VERSION = 1;
const STORE = "files";

function openDb(scope: string): Promise<IDBDatabase> {
  if (!scope)
    return Promise.reject(
      new Error("No se pudo verificar la cuenta para guardar el archivo"),
    );
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(
      `${DB_NAME}:${encodeURIComponent(scope)}`,
      DB_VERSION,
    );
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE))
        db.createObjectStore(STORE, { keyPath: "operationId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        request.error ??
          new Error("No fue posible abrir almacenamiento offline"),
      );
  });
}

export async function saveOfflineFile(
  scope: string,
  operationId: string,
  file: File,
  metadata: { title: string; sourceType: string },
) {
  const db = await openDb(scope);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({
      operationId,
      file,
      metadata,
      savedAt: new Date().toISOString(),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(tx.error ?? new Error("No fue posible guardar archivo offline"));
  });
  db.close();
}

export async function getOfflineFile(
  scope: string,
  operationId: string,
): Promise<any | null> {
  const db = await openDb(scope);
  const result = await new Promise<any | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(operationId);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () =>
      reject(request.error ?? new Error("No fue posible leer archivo offline"));
  });
  db.close();
  return result;
}

export async function deleteOfflineFile(scope: string, operationId: string) {
  const db = await openDb(scope);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(operationId);
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(tx.error ?? new Error("No fue posible limpiar archivo offline"));
  });
  db.close();
}
