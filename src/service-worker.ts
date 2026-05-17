/// <reference lib="WebWorker" />
import { ExpirationPlugin } from 'workbox-expiration'
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkOnly } from 'workbox-strategies'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>
}

// All page navigations always go to the network — this app is not offline-capable.
// Must be registered before precacheAndRoute so it takes precedence.
registerRoute(new NavigationRoute(new NetworkOnly()))

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

self.addEventListener('install', (event) => event.waitUntil(self.skipWaiting()))
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

// Static assets are fingerprinted by Vite in production — safe to serve from cache.
// In dev, filenames have no content hash, so CacheFirst would serve stale assets.
if (!import.meta.env.DEV) {
  registerRoute(
    ({ request }) =>
      request.destination === 'script' ||
      request.destination === 'style' ||
      request.destination === 'image' ||
      request.destination === 'font',
    new CacheFirst({
      cacheName: 'static-assets',
      plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 })],
    }),
  )
}

self.addEventListener('push', (event) => {
  if (!event.data) return
  const { title, body, url } = event.data.json() as { title: string; body: string; url: string }
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-64x64.png',
      data: { url },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data as { url: string }).url
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const existing = wins.find((w) => w.url === target)
      return existing ? existing.focus() : self.clients.openWindow(target)
    })(),
  )
})
