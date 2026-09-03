import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { createWalletClient, custom, http } from 'viem'
import { robinhoodChain } from '../wagmi.js'

const STORAGE_KEY = 'hail_local_wallet'

export function createLocalWallet() {
  const privateKey = generatePrivateKey()
  const account = privateKeyToAccount(privateKey)
  const wallet = {
    address: account.address,
    privateKey,
    createdAt: Date.now()
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(wallet))
  return wallet
}

export function getLocalWallet() {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function removeLocalWallet() {
  localStorage.removeItem(STORAGE_KEY)
}

export function getLocalWalletClient() {
  const wallet = getLocalWallet()
  if (!wallet) return null
  const account = privateKeyToAccount(wallet.privateKey)
  return createWalletClient({
    account,
    chain: robinhoodChain,
    transport: http(robinhoodChain.rpcUrls.default.http[0])
  })
}

export function exportWalletData() {
  const wallet = getLocalWallet()
  if (!wallet) return null
  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
    json: JSON.stringify(wallet, null, 2)
  }
}
