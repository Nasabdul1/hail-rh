const REQUIRED_ENV = [
  'VITE_WC_PROJECT_ID',
  'VITE_DIAL_PROTOCOL',
  'VITE_TOKEN_FACTORY',
  'VITE_API_URL',
  'VITE_WS_URL',
  'VITE_VAPID_PUBLIC_KEY',
  'VITE_TURN_USERNAME',
  'VITE_TURN_CREDENTIAL'
]

for (const key of REQUIRED_ENV) {
  const value = import.meta.env[key]
  if (!value || !String(value).trim()) {
    throw new Error(
      `[Hail] Missing required environment variable ${key}. ` +
      `Set it in frontend/.env (see deployment docs). Refusing to start with insecure defaults.`
    )
  }
}

export const WC_PROJECT_ID = import.meta.env.VITE_WC_PROJECT_ID
export const DIAL_PROTOCOL_ADDRESS = import.meta.env.VITE_DIAL_PROTOCOL
export const TOKEN_FACTORY_ADDRESS = import.meta.env.VITE_TOKEN_FACTORY
export const API_URL = import.meta.env.VITE_API_URL.replace(/\/$/, '')
export const WS_URL = import.meta.env.VITE_WS_URL.replace(/\/$/, '')
export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY
export const TURN_USERNAME = import.meta.env.VITE_TURN_USERNAME
export const TURN_CREDENTIAL = import.meta.env.VITE_TURN_CREDENTIAL

if (typeof window !== 'undefined' && window.location.protocol === 'https:' && !WS_URL.startsWith('wss://')) {
  throw new Error('[Hail] VITE_WS_URL must use wss:// when the page is served over HTTPS.')
}
