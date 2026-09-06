import { apiFetch } from './auth.js'

// Native (Capacitor Android) integration. The Capacitor runtime injects
// window.Capacitor into the WebView, so no npm package is needed here; in a
// plain browser everything below safely no-ops.

export function isNativeApp() {
  try {
    return !!(window.Capacitor?.isNativePlatform?.())
  } catch {
    return false
  }
}

function hailCallPlugin() {
  return window.Capacitor?.Plugins?.HailCall || null
}

let currentToken = null

export async function registerNativePush(address, signFn) {
  if (!isNativeApp()) return { registered: false }
  try {
    const Push = window.Capacitor?.Plugins?.PushNotifications
    if (!Push) return { registered: false }

    const perm = await Push.requestPermissions()
    if (perm.receive !== 'granted') return { registered: false }

    const token = await new Promise((resolve, reject) => {
      Push.addListener('registration', (t) => resolve(t.value))
      Push.addListener('registrationError', (e) => reject(new Error(e?.error || 'FCM registration failed')))
      Push.register()
    })
    currentToken = token

    const res = await apiFetch(address, signFn, '/api/push/native-subscribe', {
      method: 'POST',
      body: JSON.stringify({ token, platform: 'android' })
    })
    if (!res.ok) throw new Error(`Native push subscribe failed (${res.status})`)
    return { registered: true }
  } catch (e) {
    console.error('Native push registration failed:', e)
    return { registered: false }
  }
}

export async function unregisterNativePush(address, signFn) {
  if (!isNativeApp() || !currentToken) return
  try {
    await apiFetch(address, signFn, '/api/push/native-subscribe', {
      method: 'DELETE',
      body: JSON.stringify({ token: currentToken })
    })
  } catch (e) {
    console.error('Native push unregister failed:', e)
  }
}

// Returns a pending { action: 'answer'|'decline', from, callId } set when the
// app was cold-started from the native incoming-call UI, or null.
export async function consumePendingCallAction() {
  const plugin = hailCallPlugin()
  if (!plugin) return null
  try {
    const res = await plugin.getPendingCallAction()
    return res && res.action ? res : null
  } catch {
    return null
  }
}

// Subscribe to call actions emitted by the native UI while the app is alive.
// Returns an unsubscribe function.
export function onNativeCallAction(cb) {
  const plugin = hailCallPlugin()
  if (!plugin) return () => {}
  const handlePromise = plugin.addListener('callAction', cb)
  return () => {
    Promise.resolve(handlePromise).then((h) => h?.remove?.()).catch(() => {})
  }
}

// Lets the native layer know the web call UI is connected, so it doesn't ring
// the system UI for a call the web layer is already presenting.
export function notifyNativeWsState(connected) {
  try {
    hailCallPlugin()?.setWsConnected({ connected })
  } catch { /* bridge not ready */ }
}
