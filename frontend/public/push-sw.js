/* Avisos al celular (NOT-01). El service worker generado por Workbox importa este archivo. */
self.addEventListener('push', (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    d = { titulo: event.data ? event.data.text() : '' };
  }
  event.waitUntil((async () => {
    // iOS exige mostrar una notificación por cada aviso recibido.
    await self.registration.showNotification(d.titulo || 'Mantenimiento', {
      body: d.cuerpo || '',
      tag: d.id || undefined,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      lang: 'es-CO',
      data: { enlace: d.enlace || '/notificaciones', id: d.id || null },
    });
    if (typeof d.noLeidas === 'number' && self.navigator.setAppBadge) {
      self.navigator.setAppBadge(d.noLeidas).catch(() => undefined);
    }
    // Si la app está abierta, que actualice el contador de inmediato.
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    ventanas.forEach((c) => c.postMessage({ tipo: 'cmms:aviso' }));
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { enlace, id } = event.notification.data || {};
  const url = new URL(enlace || '/notificaciones', self.location.origin);
  // La app marca la notificación como leída al abrirse con ?leer=<id>.
  if (id) url.searchParams.set('leer', id);
  event.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of ventanas) {
      if (new URL(c.url).origin !== self.location.origin) continue;
      await c.focus();
      if ('navigate' in c) await c.navigate(url.href);
      return;
    }
    await self.clients.openWindow(url.href);
  })());
});
