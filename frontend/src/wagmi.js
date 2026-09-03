import React from 'react'
import { defaultWagmiConfig } from '@web3modal/wagmi'

export const robinhoodChain = {
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://robinhood-rpc.publicnode.com'] },
    public: { http: ['https://robinhood-rpc.publicnode.com'] }
  },
  blockExplorers: {
    default: { name: 'Blockscout', url: 'https://explorer.robinhoodchain.com' }
  }
}

const projectId = import.meta.env.VITE_WC_PROJECT_ID || 'demo'

const metadata = {
  name: 'Hail.rh',
  description: 'On-chain voice calls on Robinhood Chain',
  url: 'https://hail.rh',
  icons: ['https://hail.rh/icon.png']
}

export const config = defaultWagmiConfig({
  chains: [robinhoodChain],
  projectId,
  metadata,
  enableCoinbase: false
})