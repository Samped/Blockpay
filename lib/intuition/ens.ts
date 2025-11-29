/**
 * ENS (Ethereum Name Service) resolution utilities
 */

export interface AddressResolution {
  address: string | null
  ensName: string | null
  isENS: boolean
  error?: string
}

/**
 * Resolve an Ethereum address or ENS name
 * @param input - Ethereum address (0x...) or ENS name (vitalik.eth)
 * @returns Resolution result with address and ENS name
 */
export async function resolveAddressOrENS(input: string): Promise<AddressResolution> {
  // Check if input is already a valid Ethereum address
  if (input.startsWith('0x') && input.length === 42) {
    const addressRegex = /^0x[a-fA-F0-9]{40}$/
    if (addressRegex.test(input)) {
      return {
        address: input.toLowerCase(),
        ensName: null,
        isENS: false,
      }
    }
  }

  // Check if input looks like an ENS name
  if (input.endsWith('.eth') || input.includes('.')) {
    try {
      // For now, we'll return an error since ENS resolution requires
      // additional infrastructure (provider, ENS resolver contract)
      // In production, you would use ethers.js or viem to resolve ENS
      return {
        address: null,
        ensName: input.toLowerCase(),
        isENS: true,
        error: 'ENS resolution not yet implemented. Please use a full Ethereum address (0x...).',
      }
    } catch (error) {
      return {
        address: null,
        ensName: input.toLowerCase(),
        isENS: true,
        error: error instanceof Error ? error.message : 'Failed to resolve ENS name',
      }
    }
  }

  // Invalid input
  return {
    address: null,
    ensName: null,
    isENS: false,
    error: 'Invalid address or ENS name format',
  }
}



