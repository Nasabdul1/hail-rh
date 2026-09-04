import { VAPID_PUBLIC_KEY } from './config.js'
import { apiFetch } from './auth.js'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null
  return navigator.serviceWorker.register('/sw.js')
}

export async function subscribePush(address, signFn) {
  try {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      return { subscribed: false }
    }
    const registration = await registerServiceWorker()
    if (!registration) return { subscribed: false }

    if (Notification.permission === 'default') {
      await Notification.requestPermission()
    }
    if (Notification.permission !== 'granted') {
      return { subscribed: false }
    }

    let subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      })
    }

    const { endpoint, keys } = subscription.toJSON()
    const res = await apiFetch(address, signFn, '/api/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({ subscription: { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } } })
    })
    if (!res.ok) throw new Error(`Push subscribe failed (${res.status})`)
    return { subscribed: true }
  } catch (e) {
    console.error('Push subscribe failed:', e)
    return { subscribed: false }
  }
}

export async function unsubscribePush(address, signFn) {
  try {
    if (!('serviceWorker' in navigator)) return
    const registration = await navigator.serviceWorker.getRegistration('/sw.js')
    const subscription = registration ? await registration.pushManager.getSubscription() : null
    if (!subscription) return
    await apiFetch(address, signFn, '/api/push/subscribe', {
      method: 'DELETE',
      body: JSON.stringify({ endpoint: subscription.endpoint })
    })
    await subscription.unsubscribe()
  } catch (e) {
    console.error('Push unsubscribe failed:', e)
  }
}
