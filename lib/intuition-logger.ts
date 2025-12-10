import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { intuitionContractConfig } from '@/lib/intuitionContract'

/**
 * Minimal Intuition logger that sends a createAtom-style transaction.
 * Adapt this to your actual Intuition / Multivote contract interface.
 */

const rpcUrl = process.env.RPC_URL
const signerPrivateKey = process.env.SIGNER_PRIVATE_KEY

const chainIdEnv = process.env.NEXT_PUBLIC_CHAIN_ID
const chainId = chainIdEnv ? Number(chainIdEnv) : undefined

let walletClient:
  | ReturnType<typeof createWalletClient>
  | null = null

function getWalletClient() {
  if (!rpcUrl || !signerPrivateKey || !chainId) {
    // Intuition logging not configured; we'll operate in no-op mode
    return null
  }

  if (walletClient) return walletClient

  const account = privateKeyToAccount(signerPrivateKey as `0x${string}`)

  walletClient = createWalletClient({
    account,
    chain: {
      id: chainId,
      name: 'Intuition',
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl] } },
    },
    transport: http(rpcUrl),
  })

  return walletClient
}

export async function logUploadToIntuition(metadata: Record<string, any>) {
  try {
    const client = getWalletClient()
    if (!client) {
      // Not configured - just return metadata so caller knows we skipped on-chain logging
      return { skipped: true, reason: 'Intuition logger not configured', metadata }
    }

    const ipfsUri = metadata.cid as string | undefined
    if (!ipfsUri) {
      return { skipped: true, reason: 'Missing cid in metadata', metadata }
    }

    const { address, abi } = intuitionContractConfig

    const hash = await client.writeContract({
      address,
      abi,
      functionName: 'createAtom', // adapt if your contract uses a different name
      args: [ipfsUri],
    })

    return { txHash: hash, cid: ipfsUri }
  } catch (err) {
    console.error('Intuition logger error:', err)
    return { error: String(err), metadata }
  }
}


