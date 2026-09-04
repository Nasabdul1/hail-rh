import { defaultWagmiConfig } from '@web3modal/wagmi'
import { WC_PROJECT_ID } from './lib/config.js'

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

const metadata = {
  name: 'Hail.rh',
  description: 'On-chain voice calls on Robinhood Chain',
  url: 'https://hailrh.online',
  icons: ['https://hailrh.online/logo.png']
}

export const config = defaultWagmiConfig({
  chains: [robinhoodChain],
  projectId: WC_PROJECT_ID,
  metadata,
  enableCoinbase: false
})
