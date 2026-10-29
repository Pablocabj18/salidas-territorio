const CACHE = "territorios-oeste-shell-v12";
const BASE = new URL("./", self.registration.scope).pathname;
const SHELL = [BASE, `${BASE}territorios.geojson`, `${BASE}cuadras.geojson`, `${BASE}manifest.webmanifest`, `${BASE}app-icon.svg`];
// Archivos sin hash en el nombre: se piden primero a la red para que una nueva geometría llegue sin cambiar la versión del caché.
const SIN_HASH = /\.(geojson|webmanifest|svg)$/;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

function guardar(clave, response) {
  if (response.ok) {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(clave, copy));
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then((response) => guardar(BASE, response)).catch(() => caches.match(BASE)));
    return;
  }
  if (SIN_HASH.test(url.pathname)) {
    event.respondWith(fetch(request).then((response) => guardar(request, response)).catch(() => caches.match(request)));
    return;
  }
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => guardar(request, response))));
});
