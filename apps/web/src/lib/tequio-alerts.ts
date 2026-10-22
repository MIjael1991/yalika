'use client';

import { presenteApi } from './yalika-presente';

/**
 * Avisos de Tequio al celular (Web Push). Se piden con un toque de la persona; el servidor solo
 * manda trabajos nuevos a quien está prendido, y avisos de sus pedidos y trabajos en curso.
 */
const SCRIPT = '/tequio-sw.js';
const SCOPE = '/tequio/';

export type AlertsState = 'on' | 'off' | 'denied' | 'unsupported';

function supported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

function keyBytes(base64url: string) {
  const padded = base64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = window.atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration() {
  const reg = await navigator.serviceWorker.register(SCRIPT, { scope: SCOPE });
  if (reg.active) return reg;
  const worker = reg.installing ?? reg.waiting;
  if (worker) {
    await new Promise<void>((resolve) => {
      worker.addEventListener('statechange', () => {
        if (worker.state === 'activated') resolve();
      });
    });
  }
  return reg;
}

/** ¿Este celular ya tiene los avisos prendidos? */
export async function alertsState(): Promise<AlertsState> {
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'off';
  try {
    const reg = await navigator.serviceWorker.getRegistration(SCOPE);
    const sub = await reg?.pushManager.getSubscription();
    return sub ? 'on' : 'off';
  } catch {
    return 'off';
  }
}

/** Prende los avisos en este celular (debe llamarse al tocar un botón). */
export async function enableAlerts(): Promise<AlertsState> {
  if (!supported()) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  const reg = await registration();
  const { publicKey } = await presenteApi.pushKey();
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
  const json = sub.toJSON();
  await presenteApi.pushSubscribe({
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh ?? '',
    auth: json.keys?.auth ?? '',
  });
  return 'on';
}

/** Apaga los avisos en este celular. */
export async function disableAlerts(): Promise<AlertsState> {
  if (!supported()) return 'unsupported';
  const reg = await navigator.serviceWorker.getRegistration(SCOPE);
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await presenteApi.pushUnsubscribe(sub.endpoint).catch(() => undefined);
    await sub.unsubscribe().catch(() => false);
  }
  return 'off';
}
