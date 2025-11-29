'use client'

import { WagmiProvider, createConfig, http } from 'wagmi'
import { mainnet, sepolia, localhost } from 'wagmi/chains'
import { defineChain } from 'viem'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { injected, metaMask } from 'wagmi/connectors'
import { useState } from 'react'

// Define Intuition Testnet chain
const intuitionTestnet = defineChain({
  id: 13579,
  name: 'Intuition Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: {
      http: ['https://testnet.rpc.intuition.systems/http'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Intuition Explorer',
      url: 'https://testnet.intuition.sh',
    },
  },
})

// Helper to get all wallet connectors
const getConnectors = () => {
  const connectors: any[] = []
  
  // MetaMask - always include (will be ready if installed)
  connectors.push(metaMask())
  
  // Generic injected connector - this will catch MetaMask, OKX, Zerion, Coinbase, Trust Wallet, etc.
  // It detects any wallet that injects into window.ethereum
  connectors.push(injected({ shimDisconnect: true }))
  
  return connectors
}

// Configure chains & providers
const config = createConfig({
  chains: [intuitionTestnet, mainnet, sepolia, localhost],
  connectors: getConnectors(),
  transports: {
    [intuitionTestnet.id]: http('https://testnet.rpc.intuition.systems/http'),
    [mainnet.id]: http(),
    [sepolia.id]: http(),
    [localhost.id]: http(),
  },
})

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
      },
    },
  })
}

let browserQueryClient: QueryClient | undefined = undefined

function getQueryClient() {
  if (typeof window === 'undefined') {
    return makeQueryClient()
  }
  if (!browserQueryClient) browserQueryClient = makeQueryClient()
  return browserQueryClient
}

export function Web3Provider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => getQueryClient())

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  )
}

