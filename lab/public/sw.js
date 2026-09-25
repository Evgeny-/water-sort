// The previous version of the game was a PWA whose service worker kept serving
// it from its cache. This worker replaces it: it clears that cache, unregisters
// itself and reloads open tabs, so returning players get the current game.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const scope = self.registration.scope;
      for (const key of await caches.keys()) if (key.includes(scope)) await caches.delete(key);
      await self.registration.unregister();
      for (const client of await self.clients.matchAll({ type: "window" })) client.navigate(client.url);
    })(),
  );
});
