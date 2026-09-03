import { createWeb3Modal } from '@web3modal/wagmi'
import { config } from './wagmi.js'

const modal = createWeb3Modal({
  wagmiConfig: config,
  projectId: import.meta.env.VITE_WC_PROJECT_ID || 'demo',
  themeMode: 'dark',
  themeVariables: {
    '--w3m-color-mix': '#00C805',
    '--w3m-color-mix-strength': 20,
    '--w3m-accent': '#00C805'
  }
})

export function openWalletModal() {
  modal.open()
}