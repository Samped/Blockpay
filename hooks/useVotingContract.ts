'use client'

import { useAccount, usePublicClient, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi'
import { parseTrustAmount, formatTrustAmount, VOTING_CONTRACT_ADDRESS, VOTING_CONTRACT_ABI } from '@/lib/votingContract'

export function useVotingContract() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { writeContract, data: hash, isPending: isWriting, error: writeError } = useWriteContract()
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash })

  const isPending = isWriting || isConfirming

  /**
   * Vote on a job
   * @param jobId The job ID to vote on
   * @param userAtomId The user's atom ID (term_id) from Intuition Knowledge Graph
   */
  async function voteOnJob(
    jobId: bigint,
    userAtomId: `0x${string}`
  ): Promise<{ success: boolean; error?: string }> {
    if (!isConnected || !address) {
      return { success: false, error: 'Please connect your wallet' }
    }

    if (!publicClient) {
      return { success: false, error: 'Public client not available' }
    }

    try {
      // Use fixed atomCreationFee of 0.1 TRUST (matches contract constant)
      const atomCreationFee = parseTrustAmount('0.1')
      const requiredValue = atomCreationFee

      // Validate user atom ID
      if (!userAtomId || userAtomId === '0x0000000000000000000000000000000000000000000000000000000000000000') {
        return { success: false, error: 'Invalid user atom ID. Please create your user profile first.' }
      }

      // Simulate the transaction first to catch errors
      try {
        await publicClient.simulateContract({
          address: VOTING_CONTRACT_ADDRESS as `0x${string}`,
          abi: VOTING_CONTRACT_ABI,
          functionName: 'voteOnJob',
          args: [jobId, userAtomId],
          value: requiredValue,
          account: address,
        })
        console.log('[SUCCESS] Vote transaction simulation successful')
      } catch (simError: any) {
        console.error('[ERROR] Vote transaction simulation failed:', simError)
        let errorMessage = simError.message || 'Transaction would revert'
        
        // Check for common revert reasons
        if (errorMessage.includes('Already voted')) {
          errorMessage = 'You have already voted on this job.'
        } else if (errorMessage.includes('Invalid user atom')) {
          errorMessage = 'Your user profile atom ID is invalid or missing.'
        } else if (errorMessage.includes('Job not active')) {
          errorMessage = 'This job is not active (may be cancelled, expired, or completed).'
        } else if (errorMessage.includes('Invalid job ID')) {
          errorMessage = 'Invalid job ID.'
        } else if (errorMessage.includes('Send exact atom creation fee')) {
          errorMessage = `Vote requires exactly ${formatTrustAmount(requiredValue)} TRUST.`
        } else if (errorMessage.includes('Paused')) {
          errorMessage = 'Voting is currently paused.'
        }
        
        return { success: false, error: errorMessage }
      }

      // If simulation passes, send the actual transaction
      writeContract({
        address: VOTING_CONTRACT_ADDRESS as `0x${string}`,
        abi: VOTING_CONTRACT_ABI,
        functionName: 'voteOnJob',
        args: [jobId, userAtomId],
        value: requiredValue,
        gas: 300000n,
      })

      return { success: true }
    } catch (error: any) {
      console.error('Error voting on job:', error)
      return { success: false, error: error.message || 'Failed to vote on job' }
    }
  }

  /**
   * Check if a user has voted on a job
   */
  async function checkHasVoted(jobId: bigint): Promise<boolean> {
    if (!address || !publicClient) return false

    try {
      const hasVoted = await publicClient.readContract({
        address: VOTING_CONTRACT_ADDRESS as `0x${string}`,
        abi: VOTING_CONTRACT_ABI,
        functionName: 'checkHasVoted',
        args: [address, jobId],
      })
      return hasVoted as boolean
    } catch (error) {
      console.error('Error checking vote status:', error)
      return false
    }
  }

  /**
   * Get vote count for a job
   */
  async function getVotesCount(jobId: bigint): Promise<number> {
    if (!publicClient) return 0

    try {
      const count = await publicClient.readContract({
        address: VOTING_CONTRACT_ADDRESS as `0x${string}`,
        abi: VOTING_CONTRACT_ABI,
        functionName: 'getVotesCount',
        args: [jobId],
      })
      return Number(count as bigint)
    } catch (error) {
      console.error('Error getting vote count:', error)
      return 0
    }
  }

  return {
    voteOnJob,
    checkHasVoted,
    getVotesCount,
    isPending,
    isConfirmed,
    hash,
    error: writeError,
  }
}




