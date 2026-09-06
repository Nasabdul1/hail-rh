self.addEventListener('push', (event) => {
  let payload = {}
  try { payload = event.data.json() } catch { /* ignore malformed payloads */ }
  event.waitUntil(
    self.registration.showNotification(payload.title || 'Hail', {
      body: payload.body || '',
      tag: payload.tag || 'hail',
      data: { url: payload.url || '/' },
      icon: '/logo.png',
      badge: '/logo.png',
      renotify: true
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const existing = list.find((c) => c.url.includes(self.location.origin))
      if (existing) return existing.focus()
      return clients.openWindow(event.notification.data.url || '/')
    })
  )
})
