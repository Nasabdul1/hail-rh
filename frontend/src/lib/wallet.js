import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { createWalletClient, http } from 'viem'
import { robinhoodChain } from '../wagmi.js'

const STORAGE_KEY = 'hail_local_wallet'
const PBKDF2_ITERATIONS = 250000

let cachedAccount = null

function toBase64(bytes) {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

function fromBase64(str) {
  const binary = atob(str)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function deriveAesKey(password, salt) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

async function encryptPayload(password, payload) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveAesKey(password, salt)
  const plaintext = new TextEncoder().encode(JSON.stringify(payload))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
  return { salt: toBase64(salt), iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) }
}

async function decryptPayload(password, salt, iv, ciphertext) {
  const key = await deriveAesKey(password, fromBase64(salt))
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(iv) },
    key,
    fromBase64(ciphertext)
  )
  return JSON.parse(new TextDecoder().decode(plaintext))
}

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function getLocalWallet() {
  const stored = readStored()
  if (!stored || !stored.address) return null
  return { address: stored.address, createdAt: stored.createdAt || null, version: stored.version || 1 }
}

export function hasLocalWallet() {
  return !!readStored()?.address
}

export function isWalletUnlocked() {
  return !!cachedAccount
}

function cacheAccount(privateKey) {
  cachedAccount = privateKeyToAccount(privateKey)
  return cachedAccount
}

export async function createEncryptedWallet(password) {
  const privateKey = generatePrivateKey()
  const account = cacheAccount(privateKey)
  const createdAt = Date.now()
  const { salt, iv, ciphertext } = await encryptPayload(password, { privateKey, createdAt })
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, address: account.address, salt, iv, ciphertext, createdAt }))
  return { address: account.address, createdAt }
}

export async function unlockLocalWallet(password) {
  const stored = readStored()
  if (!stored || !stored.address) throw new Error('No local wallet found')

  if (stored.version === 2) {
    const payload = await decryptPayload(password, stored.salt, stored.iv, stored.ciphertext)
    const account = cacheAccount(payload.privateKey)
    if (account.address.toLowerCase() !== stored.address.toLowerCase()) throw new Error('Wallet mismatch')
    return { address: account.address, createdAt: stored.createdAt || payload.createdAt || null }
  }

  if (stored.privateKey) {
    const account = cacheAccount(stored.privateKey)
    const createdAt = stored.createdAt || Date.now()
    const encrypted = await encryptPayload(password, { privateKey: stored.privateKey, createdAt })
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, address: account.address, ...encrypted, createdAt }))
    return { address: account.address, createdAt }
  }

  throw new Error('Unrecognized wallet format')
}

export function getLocalSigner() {
  if (!cachedAccount) throw new Error('Wallet is locked. Unlock it with your password first.')
  return cachedAccount
}

// Decrypt the stored wallet with the given password and return the raw private
// key for user-initiated backup. Never caches the account or persists anything.
export async function revealPrivateKey(password) {
  const stored = readStored()
  if (!stored || !stored.address) throw new Error('No local wallet found')

  if (stored.version === 2) {
    const payload = await decryptPayload(password, stored.salt, stored.iv, stored.ciphertext)
    return payload.privateKey
  }

  if (stored.privateKey) return stored.privateKey

  throw new Error('Unrecognized wallet format')
}

export function getLocalWalletClient() {
  return createWalletClient({
    account: getLocalSigner(),
    chain: robinhoodChain,
    transport: http(robinhoodChain.rpcUrls.default.http[0])
  })
}

export function removeLocalWallet() {
  cachedAccount = null
  localStorage.removeItem(STORAGE_KEY)
}
