/* Estudio sin internet. Solo guarda programa (archivos con nombre único) y la pantalla de /estudio.
   Nunca guarda datos de la API ni de otras secciones; los archivos del usuario viven en su dispositivo. */
const STATIC = "estudio-static-v1";
const PAGES = "estudio-pages-v1";
const OCR = "estudio-ocr-v1";
const OCR_HOSTS = ["cdn.jsdelivr.net", "tessdata.projectnaptha.com"];
const TABS = ["", "hoja", "nombres", "imagen", "convertir", "unir", "voz", "expedientes", "archivos"];
const ASSET = /\/_next\/static\/[A-Za-z0-9_\-./~%+@]+\.(?:js|mjs|css|wasm)/g;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

const tabUrl = (t) => "/estudio" + (t ? "?tab=" + t : "");

async function cacheFirst(request, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok && res.type !== "opaque") cache.put(request, res.clone());
  return res;
}

async function page(request) {
  const cache = await caches.open(PAGES);
  try {
    const res = await fetch(request);
    if (res.ok && !res.redirected && new URL(res.url).pathname === "/estudio") {
      cache.put(request.url, res.clone());
    } else if (res.redirected) {
      await caches.delete(PAGES); // sesión cerrada o vencida: no se conserva nada
    }
    return res;
  } catch {
    return (await cache.match(request.url)) || (await cache.match("/estudio")) || Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith("/_next/static/")) return event.respondWith(cacheFirst(request, STATIC));
    if (request.mode === "navigate" && url.pathname === "/estudio") return event.respondWith(page(request));
    return;
  }
  if (OCR_HOSTS.includes(url.hostname)) event.respondWith(cacheFirst(request, OCR));
});

/* Descarga una vez todo lo necesario para abrir cualquier sección sin internet. */
async function warm() {
  const cache = await caches.open(STATIC);
  const pages = await caches.open(PAGES);
  const keep = new Set();
  const queue = [];
  for (const t of TABS) {
    const res = await fetch(tabUrl(t), { credentials: "same-origin" });
    if (!res.ok || res.redirected) throw new Error("sin sesión");
    await pages.put(tabUrl(t), res.clone());
    if (!t) await pages.put("/estudio", res.clone());
    const text = await res.text();
    for (const m of text.replace(/\\\//g, "/").matchAll(ASSET)) queue.push(m[0]);
  }
  while (queue.length) {
    const path = queue.pop();
    if (keep.has(path)) continue;
    keep.add(path);
    let res = await cache.match(path);
    if (!res) {
      res = await fetch(path);
      if (!res.ok) continue;
      await cache.put(path, res.clone());
    }
    if (/\.(?:js|mjs)$/.test(path)) {
      const text = await res.text();
      for (const m of text.matchAll(/static\/[A-Za-z0-9_\-./~%+@]+\.(?:js|mjs|css|wasm)/g)) queue.push("/_next/" + m[0]);
    }
  }
  for (const req of await cache.keys()) {
    if (!keep.has(new URL(req.url).pathname)) await cache.delete(req);
  }
  return keep.size;
}

self.addEventListener("message", (event) => {
  const port = event.ports[0];
  if (event.data === "warm") {
    event.waitUntil(
      warm().then(
        (n) => port && port.postMessage({ ok: true, n }),
        () => port && port.postMessage({ ok: false }),
      ),
    );
  } else if (event.data === "clear") {
    event.waitUntil(Promise.all([caches.delete(PAGES), caches.delete(STATIC), caches.delete(OCR)]));
  }
});
