'use client'

import { useAccount, usePublicClient, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi'
import { parseTrustAmount, formatTrustAmount, PORTFOLIO_CONTRACT_ADDRESS, PORTFOLIO_CONTRACT_ABI, calculatePortfolioFee, validatePortfolioInput } from '@/lib/portfolioContract'
import { parseEther, decodeEventLog } from 'viem'
import { fetchPortfolioByProfileId } from '@/lib/portfolioFetcher'

export interface PortfolioData {
  profileJson: string // JSON string: {"name":"...","bio":"..."}
  skills: string[]
  tags: string[]
  socials: string[] // Array of JSON strings: ['{"platform":"github","url":"..."}']
  achievements: string[]
  projects: string[] // Array of JSON strings: ['{"title":"...","description":"..."}']
}

export interface CreatePortfolioResult {
  success: boolean
  profileId?: `0x${string}`
  skillIds?: `0x${string}`[]
  tagIds?: `0x${string}`[]
  socialIds?: `0x${string}`[]
  achievementIds?: `0x${string}`[]
  projectIds?: `0x${string}`[]
  error?: string
  txHash?: `0x${string}`
}

export function usePortfolioContract() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { writeContract, data: hash, isPending: isWriting, error: writeError } = useWriteContract()
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash })

  const isPending = isWriting || isConfirming

  // Check if contract is paused
  const { data: isPaused } = useReadContract({
    address: PORTFOLIO_CONTRACT_ADDRESS,
    abi: PORTFOLIO_CONTRACT_ABI,
    functionName: 'paused',
    query: { enabled: PORTFOLIO_CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000' },
  })

  // Check if predicates are initialized
  const { data: skillPredicateId } = useReadContract({
    address: PORTFOLIO_CONTRACT_ADDRESS,
    abi: PORTFOLIO_CONTRACT_ABI,
    functionName: 'predicateIds',
    args: ['skill'],
    query: { enabled: PORTFOLIO_CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000' },
  })

  const predicatesInitialized = skillPredicateId && skillPredicateId !== '0x0000000000000000000000000000000000000000000000000000000000000000'

  /**
   * Create a portfolio using batchCreatePortfolio
   * @param data Portfolio data to create
   */
  async function createPortfolio(data: PortfolioData): Promise<CreatePortfolioResult> {
    if (!isConnected || !address) {
      return { success: false, error: 'Please connect your wallet' }
    }

    if (!publicClient) {
      return { success: false, error: 'Public client not available' }
    }

    if (PORTFOLIO_CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') {
      return { success: false, error: 'Portfolio contract address not configured. Please set NEXT_PUBLIC_PORTFOLIO_CONTRACT_ADDRESS' }
    }

    // Validate input
    const validation = validatePortfolioInput(data)
    if (!validation.valid) {
      return { success: false, error: validation.errors.join('; ') }
    }

    // Note: We don't check predicatesInitialized here because:
    // 1. The contract will revert if predicates aren't initialized
    // 2. Predicates have been initialized (confirmed via transaction logs)
    // 3. The check can be unreliable due to RPC caching
    // The contract's batchCreatePortfolio will revert with a clear error if predicates aren't initialized

    // Check if contract is paused
    if (isPaused) {
      return { success: false, error: 'Portfolio creation is currently paused' }
    }

    try {
      // Calculate total fee
      const totalFee = calculatePortfolioFee(
        1, // profile count (always 1)
        data.projects.length,
        data.skills.length,
        data.tags.length,
        data.socials.length,
        data.achievements.length
      )

      console.log('[INFO] Creating portfolio with fee:', formatTrustAmount(totalFee), 'TRUST')
      console.log('[INFO] Using contract address:', PORTFOLIO_CONTRACT_ADDRESS)
      
      // Check account balance
      const balance = await publicClient.getBalance({ address })
      if (balance < totalFee) {
        const shortfall = totalFee - balance
        return { 
          success: false, 
          error: `Insufficient funds. Required: ${formatTrustAmount(totalFee)} TRUST, Available: ${formatTrustAmount(balance)} TRUST. You need ${formatTrustAmount(shortfall)} more TRUST.` 
        }
      }

      // Simulate the transaction first to catch errors
      try {
        await publicClient.simulateContract({
          address: PORTFOLIO_CONTRACT_ADDRESS,
          abi: PORTFOLIO_CONTRACT_ABI,
          functionName: 'batchCreatePortfolio',
          args: [
            data.profileJson,
            data.skills,
            data.tags,
            data.socials,
            data.achievements,
            data.projects,
          ],
          value: totalFee,
          account: address,
        })
      } catch (simError: any) {
        console.error('[ERROR] Transaction simulation failed:', simError)
        let errorMessage = 'Transaction simulation failed'
        
        // Try to extract the revert reason
        if (simError?.cause?.data) {
          try {
            // Try to decode the revert reason
            const data = simError.cause.data
            if (typeof data === 'string' && data.startsWith('0x08c379a0')) {
              // This is a revert with reason string
              // The reason is encoded after the selector
              const reasonHex = data.slice(10)
              const reasonLength = parseInt(reasonHex.slice(64, 128), 16)
              const reasonBytes = reasonHex.slice(128, 128 + reasonLength * 2)
              const reason = Buffer.from(reasonBytes, 'hex').toString('utf8')
              errorMessage = `Contract reverted: ${reason}`
            } else if (data?.reason) {
              errorMessage = `Contract reverted: ${data.reason}`
            }
          } catch (decodeError) {
            console.error('[ERROR] Failed to decode revert reason:', decodeError)
          }
        }
        
        if (simError?.message && !errorMessage.includes('reverted')) {
          errorMessage = simError.message
        } else if (simError?.shortMessage && !errorMessage.includes('reverted')) {
          errorMessage = simError.shortMessage
        }
        
        // Check for common revert reasons
        if (errorMessage.includes('Predicate') && errorMessage.includes('not initialized')) {
          errorMessage = 'Contract predicates not initialized. The contract owner needs to call initializePredicates() first.'
        } else if (errorMessage.includes('Paused')) {
          errorMessage = 'Portfolio creation is currently paused by the contract owner.'
        } else if (errorMessage.includes('too long')) {
          errorMessage = 'One of your fields is too long. Please shorten your profile data, descriptions, or remove images.'
        } else if (errorMessage.includes('Empty')) {
          errorMessage = 'One of your required fields is empty. Please fill in all required fields.'
        }
        
        return { success: false, error: errorMessage }
      }

      // Write the contract
      writeContract({
        address: PORTFOLIO_CONTRACT_ADDRESS,
        abi: PORTFOLIO_CONTRACT_ABI,
        functionName: 'batchCreatePortfolio',
        args: [
          data.profileJson,
          data.skills,
          data.tags,
          data.socials,
          data.achievements,
          data.projects,
        ],
        value: totalFee,
      })

      // Return success - the form will handle waiting for confirmation via isConfirmed
      return { success: true }
    } catch (error: any) {
      console.error('[ERROR] Error creating portfolio:', error)
      return { success: false, error: error.message || 'Unknown error occurred' }
    }
  }

  /**
   * Initialize predicates (owner only)
   * @param predicateNames Array of predicate names to initialize
   */
  async function initializePredicates(predicateNames: string[]): Promise<{ success: boolean; error?: string }> {
    if (!isConnected || !address) {
      return { success: false, error: 'Please connect your wallet' }
    }

    if (!publicClient) {
      return { success: false, error: 'Public client not available' }
    }

    if (PORTFOLIO_CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') {
      return { success: false, error: 'Portfolio contract address not configured' }
    }

    try {
      const fee = parseTrustAmount('0.1') * BigInt(predicateNames.length)

      // Simulate first
      try {
        await publicClient.simulateContract({
          address: PORTFOLIO_CONTRACT_ADDRESS,
          abi: PORTFOLIO_CONTRACT_ABI,
          functionName: 'initializePredicates',
          args: [predicateNames],
          value: fee,
          account: address,
        })
      } catch (simError: any) {
        return { success: false, error: simError.message || 'Transaction simulation failed' }
      }

      writeContract({
        address: PORTFOLIO_CONTRACT_ADDRESS,
        abi: PORTFOLIO_CONTRACT_ABI,
        functionName: 'initializePredicates',
        args: [predicateNames],
        value: fee,
      })

      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message || 'Unknown error' }
    }
  }

  return {
    createPortfolio,
    initializePredicates,
    isPending,
    isConfirmed,
    txHash: hash,
    writeError,
    isPaused: isPaused as boolean | undefined,
    predicatesInitialized: predicatesInitialized as boolean | undefined,
  }
}

