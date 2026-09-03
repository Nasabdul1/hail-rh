# Hail — On-Chain Communication on Robinhood Chain

The first on-chain calling and messaging layer built exclusively for Robinhood Chain.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   React App     │────▶│  Node.js API     │────▶│  PostgreSQL     │
│  (wagmi/viem)   │     │  (Express)       │     │  (Profiles,     │
└─────────────────┘     └──────────────────┘     │   Calls, Tokens)│
         │                       │                └─────────────────┘
         │                       │
         ▼                       ▼
┌─────────────────────────────────────────┐
│      Robinhood Chain (Chain ID 4663)    │
│  ┌─────────────┐    ┌──────────────┐   │
│  │ DialProtocol│    │ TokenFactory │   │
│  │   .sol      │    │    .sol      │   │
│  └─────────────┘    └──────────────┘   │
└─────────────────────────────────────────┘
```

## Quick Start

### 1. Deploy Smart Contracts

```bash
cd contracts
forge install
forge script script/Deploy.s.sol --rpc-url robinhood --broadcast
```

Copy the deployed addresses into `frontend/.env`:
```
VITE_DIAL_PROTOCOL=0x...
VITE_TOKEN_FACTORY=0x...
```

### 2. Start Backend

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your DATABASE_URL
npm run migrate
npm run dev
```

### 3. Start Frontend

```bash
cd frontend
npm install
cp .env.example .env
# Edit .env with your WalletConnect Project ID
npm run dev
```

## Features

- **Create Wallet** — Generate a local wallet with private key (client-side)
- **Connect Wallet** — WalletConnect integration (MetaMask, Robinhood Wallet, etc.)
- **On-Chain Calls** — Real smart contract interactions via DialProtocol
- **Token Factory** — Create ERC-20 tokens directly on Robinhood Chain
- **Profiles** — User profiles stored in PostgreSQL
- **Contact Book** — Save and manage wallet contacts
- **Call History** — Full on-chain call history with subgraph support

## Security Notes

⚠️ **IMPORTANT**: The current wallet creation stores private keys in localStorage.
For production, implement:
- Proper encryption (AES-256 with user password)
- MPC (Multi-Party Computation) wallets
- Hardware security modules (HSM)
- Or use ERC-4337 smart contract wallets with social recovery

## Environment Variables

### Frontend (.env)
```
VITE_WC_PROJECT_ID=your_walletconnect_project_id
VITE_DIAL_PROTOCOL=0x...
VITE_TOKEN_FACTORY=0x...
```

### Backend (.env)
```
PORT=4000
DATABASE_URL=postgresql://user:pass@localhost:5432/hail
HAIL_TOKEN_CA=0x... (set after PONS launch)
```

## License

MIT
