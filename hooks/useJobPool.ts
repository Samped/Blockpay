'use client'

import { useAccount, usePublicClient, useWalletClient, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi'
import { parseEther } from 'viem'
import { JOB_POOL_ABI, Job, JobStatus, cidToBytes32 } from '@/lib/jobPoolContract'
import { parseTrustAmount } from '@/lib/jobPoolContract'
import { intuitionClient } from '@/lib/intuitionClient'

// Contract address (deployed on Intuition testnet)
export const JOB_POOL_ADDRESS = process.env.NEXT_PUBLIC_JOB_POOL_ADDRESS || '0x8A21eAa3271d546471435804F2a1c90b80BD7B95'

export function useJobPool() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const { writeContract, data: hash, isPending: isWriting, error: writeError } = useWriteContract()
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash })

  // Read job count
  const { data: jobCount } = useReadContract({
    address: JOB_POOL_ADDRESS as `0x${string}`,
    abi: JOB_POOL_ABI,
    functionName: 'jobCount',
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
   * Create a job (payable - sends native token as escrow)
   */
  async function createJob(
    budget: string,
    deadline: number
  ): Promise<{ success: boolean; jobId?: bigint; error?: string }> {
    if (!isConnected || !address) {
      return { success: false, error: 'Please connect your wallet' }
    }

    try {
      const budgetAmount = parseTrustAmount(budget)
      
      // createJob is payable - send native token as msg.value
      writeContract({
        address: JOB_POOL_ADDRESS as `0x${string}`,
        abi: JOB_POOL_ABI,
        functionName: 'createJob',
        args: [BigInt(deadline)],
        value: budgetAmount,
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
    previewCID: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!isConnected || !address) {
      return { success: false, error: 'Please connect your wallet' }
    }

    try {
      // Convert CID string to bytes32 hash
      const submissionHash = cidToBytes32(previewCID)

      writeContract({
        address: JOB_POOL_ADDRESS as `0x${string}`,
        abi: JOB_POOL_ABI,
        functionName: 'submitWork',
        args: [jobId, submissionHash],
      })

      return { success: true }
    } catch (error: any) {
      console.error('Error submitting work:', error)
      return { success: false, error: error.message || 'Failed to submit work' }
    }
  }

  /**
   * Accept work (creator approves submission and releases payment)
   */
  async function acceptWork(
    jobId: bigint
  ): Promise<{ success: boolean; error?: string }> {
    if (!isConnected || !address) {
      return { success: false, error: 'Please connect your wallet' }
    }

    try {
      writeContract({
        address: JOB_POOL_ADDRESS as `0x${string}`,
        abi: JOB_POOL_ABI,
        functionName: 'acceptWork',
        args: [jobId],
      })

      return { success: true }
    } catch (error: any) {
      console.error('Error accepting work:', error)
      return { success: false, error: error.message || 'Failed to accept work' }
    }
  }

  /**
   * Cancel a job (only if no submissions)
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
   * Expire a job (anyone can call after deadline)
   */
  async function expireJob(jobId: bigint): Promise<{ success: boolean; error?: string }> {
    if (!isConnected || !address) {
      return { success: false, error: 'Please connect your wallet' }
    }

    try {
      writeContract({
        address: JOB_POOL_ADDRESS as `0x${string}`,
        abi: JOB_POOL_ABI,
        functionName: 'expireJob',
        args: [jobId],
      })

      return { success: true }
    } catch (error: any) {
      console.error('Error expiring job:', error)
      return { success: false, error: error.message || 'Failed to expire job' }
    }
  }

  /**
   * Get job details
   */
  async function getJob(jobId: bigint): Promise<Job | null> {
    if (!publicClient) return null

    try {
      const result = await publicClient.readContract({
        address: JOB_POOL_ADDRESS as `0x${string}`,
        abi: JOB_POOL_ABI,
        functionName: 'getJob',
        args: [jobId],
      })

      // Result is a tuple: [creator, payment, deadline, status, hasSubmission, worker, submissionHash]
      return {
        creator: result[0] as `0x${string}`,
        payment: result[1] as bigint,
        deadline: result[2] as bigint,
        status: result[3] as JobStatus,
        hasSubmission: result[4] as boolean,
        worker: result[5] as `0x${string}`,
        submissionHash: result[6] as `0x${string}`,
      }
    } catch (error) {
      console.error('Error fetching job:', error)
      return null
    }
  }

  /**
   * Check if job is expired
   */
  async function isJobExpired(jobId: bigint): Promise<boolean> {
    if (!publicClient) return false

    try {
      const expired = await publicClient.readContract({
        address: JOB_POOL_ADDRESS as `0x${string}`,
        abi: JOB_POOL_ABI,
        functionName: 'isJobExpired',
        args: [jobId],
      })

      return expired as boolean
    } catch (error) {
      console.error('Error checking job expiration:', error)
      return false
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
    jobCount,
    
    // Functions
    createJobAtom,
    createSubmissionAtom,
    createJob,
    submitWork,
    acceptWork,
    cancelJob,
    expireJob,
    getJob,
    isJobExpired,
  }
}
