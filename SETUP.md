# BlockPay Setup Guide

## Installation

1. Install dependencies:
```bash
npm install
```

2. Create a `.env.local` file (copy from `.env.example`):
```bash
cp .env.example .env.local
```

3. Update `.env.local` with your configuration:
- Set `NEXT_PUBLIC_INTUITION_API_URL` and `NEXT_PUBLIC_INTUITION_GRAPH_URL` to your Intuition API endpoints
- Optionally add `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` for WalletConnect support

## Development

Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
blockPay/
├── app/                    # Next.js app directory
│   ├── layout.tsx          # Root layout with Web3Provider
│   ├── page.tsx            # Home page
│   └── globals.css         # Global styles
├── components/
│   ├── home/               # Home page components
│   │   ├── HeroSection.tsx
│   │   ├── FeaturesSection.tsx
│   │   ├── HowItWorksSection.tsx
│   │   ├── StatsSection.tsx
│   │   └── CTASection.tsx
│   ├── layout/             # Layout components
│   │   ├── Header.tsx
│   │   └── Footer.tsx
│   └── providers/          # Context providers
│       └── Web3Provider.tsx
└── lib/
    └── intuitionClient.ts  # Intuition Knowledge Graph client
```

## Intuition Integration

The `IntuitionClient` class in `lib/intuitionClient.ts` provides methods to:

- **Atoms**: Create and retrieve Atoms from the Knowledge Graph
- **Triples**: Create relationships between Atoms
- **Trust Scores**: Get reputation scores for creators
- **Artwork Atoms**: Mint artwork with provenance
- **Job Completion**: Record job completions in the graph

### Example Usage

```typescript
import { intuitionClient } from '@/lib/intuitionClient'

// Get a creator's trust score
const trustScore = await intuitionClient.getTrustScore(atomId)

// Create an artwork Atom
const artwork = await intuitionClient.createArtworkAtom(creatorId, {
  title: 'My Artwork',
  description: 'A beautiful piece',
  previewUrl: 'https://...',
  highResUrl: 'https://...',
  price: '50'
})

// Get top creators
const topCreators = await intuitionClient.getTopCreators(10)
```

## Web3 Integration

BlockPay uses Wagmi for Web3 functionality:

- **Wallet Connection**: Users can connect MetaMask or injected wallets
- **Chain Support**: Mainnet, Sepolia, and Localhost
- **Account Management**: View connected address and disconnect

The `Web3Provider` wraps the entire app and provides Web3 context to all components.

## Next Steps

1. Implement the Job Pool page (`/jobs`)
2. Create the Top Creators page (`/creators`)
3. Build the Portfolio page (`/portfolio`)
4. Add TRUST token contract integration
5. Implement escrow smart contracts
6. Add Multivote contract integration for reputation voting

