import { signMessage } from 'wagmi/actions'
import { config as wagmiConfig } from '../wagmi.js'
import { API_URL } from './config.js'
import { getLocalSigner } from './wallet.js'

const tokens = new Map()

export function getSignFn(isExternalWallet) {
  return async (message) => {
    if (isExternalWallet) return signMessage(wagmiConfig, { message })
    const signer = getLocalSigner()
    if (!signer) throw new Error('Wallet is locked')
    return signer.signMessage({ message })
  }
}

export async function ensureAuthToken(address, signFn) {
  const key = address.toLowerCase()
  const cached = tokens.get(key)
  if (cached) return cached

  const nonceRes = await fetch(`${API_URL}/api/auth/nonce`)
  if (!nonceRes.ok) throw new Error(`Auth nonce request failed (${nonceRes.status})`)
  const { nonce } = await nonceRes.json()
  if (!nonce) throw new Error('Auth nonce missing')

  const signature = await signFn(`Hail login: ${nonce}`)

  const loginRes = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, signature, nonce })
  })
  if (!loginRes.ok) throw new Error(`Auth login failed (${loginRes.status})`)
  const { token } = await loginRes.json()
  if (!token) throw new Error('Auth token missing')

  tokens.set(key, token)
  return token
}

export function clearAuthToken(address) {
  tokens.delete(address.toLowerCase())
}

export async function apiFetch(address, signFn, path, options = {}) {
  let token = await ensureAuthToken(address, signFn)
  let res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) }
  })
  if (res.status === 401) {
    clearAuthToken(address)
    token = await ensureAuthToken(address, signFn)
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) }
    })
  }
  return res
}
