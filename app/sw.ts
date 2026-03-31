import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist } from 'serwist';

// This is injected by @serwist/next during build
declare global {
  interface ServiceWorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  // Push-only setup — no precaching in this PR
  precacheEntries: self.__SW_MANIFEST ?? [],
  skipWaiting: true,
  clientsClaim: true,
});

serwist.addEventListeners();

// Handle push events from server
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload: { title?: string; body?: string; url?: string } = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Anchor', body: event.data.text() };
  }

  const title = payload.title ?? 'Anchor';
  const options: NotificationOptions = {
    body: payload.body ?? '',
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    data: { url: payload.url ?? '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Open the app (or the notification URL) when a notification is clicked
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url: string = event.notification.data?.url ?? '/';
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      })
  );
});
