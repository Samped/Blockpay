'use client'

import { useAccount, usePublicClient, useWalletClient, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi'
import { JOB_POOL_ABI, ERC20_ABI, Job, Submission, JobStatus, SubmissionStatus } from '@/lib/jobPoolContract'
import { parseTrustAmount } from '@/lib/jobPoolContract'
import { atomDataToBytes } from '@/lib/intuitionContract'
import { intuitionClient } from '@/lib/intuitionClient'

// Contract addresses (update these after deployment)
export const JOB_POOL_ADDRESS = process.env.NEXT_PUBLIC_JOB_POOL_ADDRESS || '0x0000000000000000000000000000000000000000'
export const TRUST_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_TRUST_TOKEN_ADDRESS || '0x0000000000000000000000000000000000000000'

export function useJobPool() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const { writeContract, data: hash, isPending: isWriting, error: writeError } = useWriteContract()
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash })

  // Read job counter
  const { data: jobCounter } = useReadContract({
    address: JOB_POOL_ADDRESS as `0x${string}`,
    abi: JOB_POOL_ABI,
    functionName: 'jobCounter',
    query: {
      enabled: !!JOB_POOL_ADDRESS && JOB_POOL_ADDRESS !== '0x0000000000000000000000000000000000000000',
    },
  })

  /**
   * Create a job atom in Intuition and return the atom ID
   */
  async function createJobAtom(jobData: {
    title: string
    description: string
    category?: string
    requirements?: string[]
    budget: string
    deadline?: number
    metadataCID?: string
  }): Promise<string | null> {
    if (!address || !walletClient) return null

    try {
      const atomData = {
        address: address.toLowerCase(),
        wallet: address.toLowerCase(),
        type: 'Job',
        title: jobData.title,
        description: jobData.description,
        category: jobData.category || 'general',
        requirements: jobData.requirements || [],
        budget: jobData.budget,
        deadline: jobData.deadline,
        metadataCID: jobData.metadataCID,
        createdAt: new Date().toISOString(),
      }

      // Create atom using Intuition client
      const atomId = await intuitionClient.createProfileAtom(address, atomData, walletClient)
      return atomId
    } catch (error) {
      console.error('Error creating job atom:', error)
      return null
    }
  }

  /**
   * Create a submission atom in Intuition
   */
  async function createSubmissionAtom(submissionData: {
    jobId: string
    previewCID: string
    description?: string
    metadataCID?: string
  }): Promise<string | null> {
    if (!address || !walletClient) return null

    try {
      const atomData = {
        address: address.toLowerCase(),
        wallet: address.toLowerCase(),
        type: 'Submission',
        jobId: submissionData.jobId,
        previewCID: submissionData.previewCID,
        description: submissionData.description,
        metadataCID: submissionData.metadataCID,
        createdAt: new Date().toISOString(),
      }

      const atomId = await intuitionClient.createProfileAtom(address, atomData, walletClient)
      return atomId
    } catch (error) {
      console.error('Error creating submission atom:', error)
      return null
    }
  }

  /**
   * Check and approve TRUST token allowance
   */
  async function ensureApproval(amount: bigint): Promise<boolean> {
    if (!address || !publicClient) return false

    try {
      const allowance = await publicClient.readContract({
        address: TRUST_TOKEN_ADDRESS as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [address, JOB_POOL_ADDRESS as `0x${string}`],
      })

      if (allowance < amount) {
        writeContract({
          address: TRUST_TOKEN_ADDRESS as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [JOB_POOL_ADDRESS as `0x${string}`, amount],
        })
        return false // Will need to wait for approval
      }
      return true
    } catch (error) {
      console.error('Error checking allowance:', error)
      return false
    }
  }

  /**
   * Create a job
   */
  async function createJob(
    budget: string,
    jobAtomId: string | null,
    deadline: number = 0
  ): Promise<{ success: boolean; jobId?: bigint; error?: string }> {
    if (!isConnected || !address) {
      return { success: false, error: 'Please connect your wallet' }
    }

    try {
      const budgetAmount = parseTrustAmount(budget)
      
      // Ensure approval
      const approved = await ensureApproval(budgetAmount)
      if (!approved) {
        return { success: false, error: 'Please approve TRUST token spending first' }
      }

      // Convert atom ID to bytes32 (use zero if not provided)
      const jobAtomBytes32 = jobAtomId 
        ? (jobAtomId.startsWith('0x') ? jobAtomId : `0x${jobAtomId}`).padEnd(66, '0').slice(0, 66) as `0x${string}`
        : '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`

      writeContract({
        address: JOB_POOL_ADDRESS as `0x${string}`,
        abi: JOB_POOL_ABI,
        functionName: 'createJob',
        args: [budgetAmount, jobAtomBytes32, BigInt(deadline)],
      })

      return { success: true }
    } catch (error: any) {
      console.error('Error creating job:', error)
      return { success: false, error: error.message || 'Failed to create job' }
    }
  }

  /**
   * Submit work for a job
   */
  async function submitWork(
    jobId: bigint,
    submissionAtomId: string | null,
    previewCID: string
  ): Promise<{ success: boolean; submissionId?: bigint; error?: string }> {
    if (!isConnected || !address) {
      return { success: false, error: 'Please connect your wallet' }
    }

    try {
      const submissionAtomBytes32 = submissionAtomId
        ? (submissionAtomId.startsWith('0x') ? submissionAtomId : `0x${submissionAtomId}`).padEnd(66, '0').slice(0, 66) as `0x${string}`
        : '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`

      writeContract({
        address: JOB_POOL_ADDRESS as `0x${string}`,
        abi: JOB_POOL_ABI,
        functionName: 'submitWork',
        args: [jobId, submissionAtomBytes32, previewCID],
      })

      return { success: true }
    } catch (error: any) {
      console.error('Error submitting work:', error)
      return { success: false, error: error.message || 'Failed to submit work' }
    }
  }

  /**
   * Approve a submission
   */
  async function approveWork(
    jobId: bigint,
    submissionId: bigint
  ): Promise<{ success: boolean; error?: string }> {
    if (!isConnected || !address) {
      return { success: false, error: 'Please connect your wallet' }
    }

    try {
      writeContract({
        address: JOB_POOL_ADDRESS as `0x${string}`,
        abi: JOB_POOL_ABI,
        functionName: 'approveWork',
        args: [jobId, submissionId],
      })

      return { success: true }
    } catch (error: any) {
      console.error('Error approving work:', error)
      return { success: false, error: error.message || 'Failed to approve work' }
    }
  }

  /**
   * Cancel a job
   */
  async function cancelJob(jobId: bigint): Promise<{ success: boolean; error?: string }> {
    if (!isConnected || !address) {
      return { success: false, error: 'Please connect your wallet' }
    }

    try {
      writeContract({
        address: JOB_POOL_ADDRESS as `0x${string}`,
        abi: JOB_POOL_ABI,
        functionName: 'cancelJob',
        args: [jobId],
      })

      return { success: true }
    } catch (error: any) {
      console.error('Error cancelling job:', error)
      return { success: false, error: error.message || 'Failed to cancel job' }
    }
  }

  /**
   * Withdraw available balance
   */
  async function withdraw(): Promise<{ success: boolean; error?: string }> {
    if (!isConnected || !address) {
      return { success: false, error: 'Please connect your wallet' }
    }

    try {
      writeContract({
        address: JOB_POOL_ADDRESS as `0x${string}`,
        abi: JOB_POOL_ABI,
        functionName: 'withdraw',
        args: [],
      })

      return { success: true }
    } catch (error: any) {
      console.error('Error withdrawing:', error)
      return { success: false, error: error.message || 'Failed to withdraw' }
    }
  }

  /**
   * Get job details
   */
  async function getJob(jobId: bigint): Promise<Job | null> {
    if (!publicClient) return null

    try {
      const job = await publicClient.readContract({
        address: JOB_POOL_ADDRESS as `0x${string}`,
        abi: JOB_POOL_ABI,
        functionName: 'getJob',
        args: [jobId],
      })

      return job as Job
    } catch (error) {
      console.error('Error fetching job:', error)
      return null
    }
  }

  /**
   * Get submission details
   */
  async function getSubmission(submissionId: bigint): Promise<Submission | null> {
    if (!publicClient) return null

    try {
      const submission = await publicClient.readContract({
        address: JOB_POOL_ADDRESS as `0x${string}`,
        abi: JOB_POOL_ABI,
        functionName: 'getSubmission',
        args: [submissionId],
      })

      return submission as Submission
    } catch (error) {
      console.error('Error fetching submission:', error)
      return null
    }
  }

  /**
   * Get withdrawable balance for current user
   */
  async function getWithdrawableBalance(): Promise<bigint> {
    if (!address || !publicClient) return 0n

    try {
      const balance = await publicClient.readContract({
        address: JOB_POOL_ADDRESS as `0x${string}`,
        abi: JOB_POOL_ABI,
        functionName: 'withdrawable',
        args: [address],
      })

      return balance as bigint
    } catch (error) {
      console.error('Error fetching withdrawable balance:', error)
      return 0n
    }
  }

  return {
    // State
    isConnected,
    address,
    isWriting,
    isConfirming,
    isConfirmed,
    hash,
    writeError,
    jobCounter,
    
    // Functions
    createJobAtom,
    createSubmissionAtom,
    createJob,
    submitWork,
    approveWork,
    cancelJob,
    withdraw,
    getJob,
    getSubmission,
    getWithdrawableBalance,
    ensureApproval,
  }
}

