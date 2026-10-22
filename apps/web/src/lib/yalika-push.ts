// Avisos push: la alarma suena aunque Yalika esté cerrada (si el servidor tiene las llaves configuradas).
import { yalikaApi } from "./yalika-alarmas";

export type PushState = "on" | "denied" | "unsupported" | "server-off" | "error";

function keyToBytes(base64: string) {
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function supported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** Suscribe este dispositivo. Pide permiso solo si `ask` es verdadero (debe venir de un toque del usuario). */
export async function enablePush(ask: boolean): Promise<PushState> {
  if (!supported()) return "unsupported";
  try {
    const info = await yalikaApi<{ enabled: boolean; publicKey: string | null }>("push/key");
    if (!info.enabled || !info.publicKey) return "server-off";

    if (Notification.permission === "default" && ask) await Notification.requestPermission();
    if (Notification.permission === "denied") return "denied";
    if (Notification.permission !== "granted") return "error";

    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    const sub =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyToBytes(info.publicKey) as BufferSource,
      }));
    const json = sub.toJSON();
    await yalikaApi("push/subscribe", {
      method: "POST",
      body: JSON.stringify({ endpoint: sub.endpoint, p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" }),
    });
    return "on";
  } catch {
    return "error";
  }
}
