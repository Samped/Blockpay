'use client'

import { useEffect } from 'react'
import { useAccount, usePublicClient, useWalletClient, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi'
import { parseEther } from 'viem'
import { JOB_POOL_ABI, Job, JobStatus, cidToBytes32, parseTrustAmount, formatTrustAmount } from '@/lib/jobPoolContract'
// Contract address (deployed on Intuition testnet)
export const JOB_POOL_ADDRESS = process.env.NEXT_PUBLIC_JOB_POOL_ADDRESS || '0xA4Ff50De4BF072063cb76D6c67952fAD2412e918'

export function useJobPool() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const { writeContract, data: hash, isPending: isWriting, error: writeError } = useWriteContract()
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash })

  // Read job count with refetch capability
  const { data: jobCount, refetch: refetchJobCount } = useReadContract({
    address: JOB_POOL_ADDRESS as `0x${string}`,
    abi: JOB_POOL_ABI,
    functionName: 'jobCount',
    query: {
      enabled: !!JOB_POOL_ADDRESS && JOB_POOL_ADDRESS !== '0x0000000000000000000000000000000000000000',
      refetchInterval: false, // Don't auto-refetch, we'll do it manually
    },
  })

  // Refetch jobCount when transaction is confirmed (for new jobs)
  useEffect(() => {
    if (isConfirmed && hash) {
      // Wait a bit for the block to be indexed, then refetch
      const timer = setTimeout(() => {
        console.log('[useJobPool] Refetching jobCount after transaction confirmation')
        refetchJobCount()
      }, 2000) // 2 second delay to allow block indexing
      
      return () => clearTimeout(timer)
    }
  }, [isConfirmed, hash, refetchJobCount])

  /**
   * Create a job (payable - sends native token as escrow)
   */
  async function createJob(
    budget: string,
    deadline: number,
    jobMetaHash: string = ''
  ): Promise<{ success: boolean; jobId?: bigint; error?: string }> {
    if (!isConnected || !address) {
      return { success: false, error: 'Please connect your wallet' }
    }

    if (!publicClient) {
      return { success: false, error: 'Public client not available' }
    }

    try {
      const jobPayment = parseTrustAmount(budget)
      
      // Validate budget
      if (jobPayment === 0n) {
        return { success: false, error: 'Budget must be greater than 0' }
      }

      // Check if contract is paused
      try {
        const isPaused = await publicClient.readContract({
          address: JOB_POOL_ADDRESS as `0x${string}`,
          abi: JOB_POOL_ABI,
          functionName: 'paused',
        })
        
        if (isPaused) {
          return { success: false, error: 'Contract is currently paused. Please try again later.' }
        }
      } catch (err) {
        console.warn('Could not check if contract is paused:', err)
      }

      // Use fixed atomCreationFee of 0.1 TRUST (matches contract default)
      const atomCreationFee = parseTrustAmount('0.1')

      // Frontend sends exactly: jobPayment + atomCreationFee (0.1 TRUST for job atom)
      // Predicates were already initialized via Remix, so no extra predicate cost here.
      const predicateCost = 0n
      const requiredValue = jobPayment + atomCreationFee

      // Validate deadline is in the future
      const currentBlock = await publicClient.getBlockNumber()
      const currentBlockTime = (await publicClient.getBlock({ blockNumber: currentBlock })).timestamp
      const deadlineBigInt = BigInt(deadline)
      
      console.log('Job creation details:', {
        jobPayment: jobPayment.toString(),
        atomCreationFee: atomCreationFee.toString(),
        predicateCost: predicateCost.toString(),
        requiredValue: requiredValue.toString(),
        currentBlockTime: currentBlockTime.toString(),
        deadline: deadlineBigInt.toString(),
        deadlineInFuture: deadlineBigInt > currentBlockTime,
      })
      
      if (deadlineBigInt <= currentBlockTime) {
        return { 
          success: false, 
          error: `Deadline must be in the future. Current block time: ${new Date(Number(currentBlockTime) * 1000).toLocaleString()}, Deadline: ${new Date(Number(deadlineBigInt) * 1000).toLocaleString()}` 
        }
      }

      // Simulate the transaction first to catch errors
      try {
        await publicClient.simulateContract({
          address: JOB_POOL_ADDRESS as `0x${string}`,
          abi: JOB_POOL_ABI,
          functionName: 'createJob',
          args: [deadlineBigInt, jobPayment, jobMetaHash],
          value: requiredValue,
          account: address,
        })
        console.log('[SUCCESS] Transaction simulation successful')
      } catch (simError: any) {
        console.error('[ERROR] Transaction simulation failed:', simError)
        // Try to decode the error
        let errorMessage = simError.message || 'Transaction would revert'
        
        // Check for common revert reasons
        if (simError.message?.includes('Minimum job payment')) {
          errorMessage = 'Job payment must be at least 0.01 TRUST'
        } else if (simError.message?.includes('Deadline too soon')) {
          errorMessage = 'Deadline must be at least 1 hour in the future'
        } else if (simError.message?.includes('Deadline too far')) {
          errorMessage = 'Deadline cannot be more than 1 year in the future'
        } else if (simError.message?.includes('Insufficient msg.value')) {
          errorMessage = `Insufficient funds. Required: ${formatTrustAmount(requiredValue)} TRUST (${formatTrustAmount(jobPayment)} payment + 0.1 TRUST atom fee)`
        } else if (simError.message?.includes('Contract is paused')) {
          errorMessage = 'Contract is currently paused'
        }
        
        return { success: false, error: errorMessage }
      }
      
      // If simulation passes, send the actual transaction with gas limit
      writeContract({
        address: JOB_POOL_ADDRESS as `0x${string}`,
        abi: JOB_POOL_ABI,
        functionName: 'createJob',
        args: [deadlineBigInt, jobPayment, jobMetaHash],
        value: requiredValue,
        gas: 500000n, // Increased gas limit for atom creation
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

    if (!publicClient) {
      return { success: false, error: 'Public client not available' }
    }

    try {
      // Use fixed atomCreationFee of 0.1 TRUST (matches contract default)
      const atomCreationFee = parseTrustAmount('0.1')

      // Required value: 2 * atomCreationFee (submission atom + triple)
      const requiredValue = atomCreationFee * 2n

      // Convert CID string to bytes32 hash
      const submissionHash = cidToBytes32(previewCID)

      // Simulate the transaction first to catch errors
      try {
        await publicClient.simulateContract({
          address: JOB_POOL_ADDRESS as `0x${string}`,
          abi: JOB_POOL_ABI,
          functionName: 'submitWork',
          args: [jobId, submissionHash],
          value: requiredValue,
          account: address,
        })
        console.log('[SUCCESS] Submission transaction simulation successful')
      } catch (simError: any) {
        console.error('[ERROR] Submission transaction simulation failed:', simError)
        let errorMessage = simError.message || 'Transaction would revert'
        
        // Check for common revert reasons
        if (simError.message?.includes('Invalid job')) {
          errorMessage = 'Job does not exist'
        } else if (simError.message?.includes('Job not active')) {
          errorMessage = 'Job is not open for submissions'
        } else if (simError.message?.includes('Deadline passed')) {
          errorMessage = 'Job deadline has passed'
        } else if (simError.message?.includes('Send 2 * atomCreationFee')) {
          errorMessage = `Insufficient funds. Required: ${formatTrustAmount(requiredValue)} TRUST (2 x 0.1 TRUST atom creation fee)`
        } else if (simError.message?.includes('Submission atom creation failed')) {
          errorMessage = 'Failed to create submission atom. This might be due to insufficient deposit amount or MultiVault requirements. Please check that you have enough funds and try again.'
        } else if (simError.message?.includes('createAtoms failed')) {
          errorMessage = 'MultiVault rejected atom creation. This might be due to minimum deposit requirements. Please contact support if this persists.'
        }
        
        // Try to extract the actual revert reason if available
        if (simError.cause?.data) {
          console.error('Detailed error data:', simError.cause.data)
        }
        if (simError.details) {
          console.error('Error details:', simError.details)
        }
        
        return { success: false, error: errorMessage }
      }

      // If simulation passes, send the actual transaction with gas limit
      writeContract({
        address: JOB_POOL_ADDRESS as `0x${string}`,
        abi: JOB_POOL_ABI,
        functionName: 'submitWork',
        args: [jobId, submissionHash],
        value: requiredValue,
        gas: 500000n, // Increased gas limit for atom creation
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
    jobId: bigint,
    submissionId: bigint = 0n
  ): Promise<{ success: boolean; error?: string }> {
    if (!isConnected || !address) {
      return { success: false, error: 'Please connect your wallet' }
    }

    if (!publicClient) {
      return { success: false, error: 'Public client not available' }
    }

    try {
      // Use fixed atomCreationFee of 0.1 TRUST (matches contract default)
      const atomCreationFee = parseTrustAmount('0.1')

      // Required value: 2 * atomCreationFee (payment atom + triple)
      const requiredValue = atomCreationFee * 2n

      // Simulate the transaction first to catch errors
      try {
        await publicClient.simulateContract({
          address: JOB_POOL_ADDRESS as `0x${string}`,
          abi: JOB_POOL_ABI,
          functionName: 'acceptWork',
          args: [jobId, submissionId],
          value: requiredValue,
          account: address,
        })
        console.log('[SUCCESS] Accept work transaction simulation successful')
      } catch (simError: any) {
        console.error('[ERROR] Accept work transaction simulation failed:', simError)
        let errorMessage = simError.message || 'Transaction would revert'
        
        if (simError.message?.includes('Send 2 * atomCreationFee')) {
          errorMessage = `Insufficient funds. Required: ${formatTrustAmount(requiredValue)} TRUST (2 x 0.1 TRUST atom creation fee)`
        } else if (simError.message?.includes('Accept too soon')) {
          errorMessage = 'You must wait at least 1 hour after a submission is made before you can accept it. This is a security feature to protect submitters from front-running attacks. Please wait and try again later.'
        } else if (simError.message?.includes('Already accepted')) {
          errorMessage = 'This submission has already been accepted.'
        } else if (simError.message?.includes('Withdrawn')) {
          errorMessage = 'This submission has been withdrawn by the worker.'
        } else if (simError.message?.includes('Only creator')) {
          errorMessage = 'Only the job creator can accept work.'
        } else if (simError.message?.includes('Job not active')) {
          errorMessage = 'This job is no longer active and cannot accept new submissions.'
        }
        
        return { success: false, error: errorMessage }
      }

      writeContract({
        address: JOB_POOL_ADDRESS as `0x${string}`,
        abi: JOB_POOL_ABI,
        functionName: 'acceptWork',
        args: [jobId, submissionId],
        value: requiredValue,
        gas: 500000n, // Increased gas limit for atom creation
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
        gas: 300000n, // Set reasonable gas limit to prevent high fees
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
        gas: 300000n, // Set reasonable gas limit to prevent high fees
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
  async function getJob(jobId: bigint): Promise<(Job & { jobId: bigint; title?: string; description?: string }) | null> {
    if (!publicClient) {
      console.warn('No public client available for getJob')
      return null
    }

    try {
      console.log(`Fetching job ${jobId.toString()} from contract ${JOB_POOL_ADDRESS}`)
      
      // First, check if jobAtomId exists - this is the most reliable indicator that a job exists
      let jobAtomId: `0x${string}` | null = null
      try {
        jobAtomId = await publicClient.readContract({
          address: JOB_POOL_ADDRESS as `0x${string}`,
          abi: JOB_POOL_ABI,
          functionName: 'jobAtomIds',
          args: [jobId],
        }) as `0x${string}`
        
        if (jobAtomId && jobAtomId !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
          console.log(`Job ${jobId.toString()} atom ID found: ${jobAtomId}`)
        } else {
          console.warn(`Job ${jobId.toString()} atom ID is zero - job may not exist`)
        }
      } catch (atomErr) {
        console.warn(`Could not check jobAtomId for job ${jobId.toString()}:`, atomErr)
      }
      
      // Try using the public jobs mapping first (more direct)
      let result: any
      try {
        result = await publicClient.readContract({
          address: JOB_POOL_ADDRESS as `0x${string}`,
          abi: JOB_POOL_ABI,
          functionName: 'jobs',
          args: [jobId],
        })
        console.log(`Job ${jobId.toString()} fetched via jobs mapping:`, result)
      } catch (err: any) {
        // If jobs mapping doesn't work, try getJob function
        console.log(`jobs mapping failed, trying getJob function:`, err.message)
        try {
          result = await publicClient.readContract({
            address: JOB_POOL_ADDRESS as `0x${string}`,
            abi: JOB_POOL_ABI,
            functionName: 'getJob',
            args: [jobId],
          })
          console.log(`Job ${jobId.toString()} fetched via getJob function:`, result)
        } catch (err2: any) {
          console.error(`Both methods failed for job ${jobId.toString()}:`, err2.message)
          // If we have a jobAtomId, return minimal job instead of null
          if (jobAtomId && jobAtomId !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
            console.warn(`Job ${jobId.toString()} atom exists but struct failed to load - returning minimal job`)
            const minimalJob: Job & { jobId: bigint; title?: string; description?: string } = {
              jobId,
              creator: '0x0000000000000000000000000000000000000000' as `0x${string}`,
              payment: 0n,
              deadline: 0n,
              status: 0 as JobStatus,
              hasSubmission: false,
              worker: '0x0000000000000000000000000000000000000000' as `0x${string}`,
              submissionHash: '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
              title: `Job #${jobId.toString()} (Loading...)`,
              description: 'Job data is being indexed. Please refresh in a moment.',
            }
            return minimalJob
          }
          return null
        }
      }

      // Check if job exists (creator should not be zero address)
      if (!result || !result[0] || result[0] === '0x0000000000000000000000000000000000000000') {
        // If jobAtomId exists but struct is missing, return a minimal job object
        if (jobAtomId && jobAtomId !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
          console.warn(`Job ${jobId.toString()} atom exists but struct is missing - returning minimal job object`)
          // Return a minimal job with default values
          const minimalJob: Job & { jobId: bigint; title?: string; description?: string } = {
            jobId,
            creator: '0x0000000000000000000000000000000000000000' as `0x${string}`, // Will be filtered or shown as "Loading..."
            payment: 0n,
            deadline: 0n,
            status: 0 as JobStatus, // Active
            hasSubmission: false,
            worker: '0x0000000000000000000000000000000000000000' as `0x${string}`,
            submissionHash: '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
            title: `Job #${jobId.toString()} (Loading...)`,
            description: 'Job data is being indexed. Please refresh in a moment.',
          }
          return minimalJob
        }
        
        console.warn(`Job ${jobId.toString()} does not exist (zero address creator and no atom ID)`)
        return null
      }

      // Result is a tuple: [creator, payment, deadline, status, hasSubmission, worker, submissionHash]
      const job: Job & { 
        jobId: bigint
        title?: string
        description?: string
        category?: string
        requirements?: string[]
        budget?: string
        createdAt?: string
      } = {
        jobId,
        creator: result[0] as `0x${string}`,
        payment: result[1] as bigint,
        deadline: result[2] as bigint,
        status: result[3] as JobStatus,
        hasSubmission: result[4] as boolean,
        worker: result[5] as `0x${string}`,
        submissionHash: result[6] as `0x${string}`,
      }
      
      console.log(`Job ${jobId.toString()} parsed successfully:`, {
        creator: job.creator,
        payment: job.payment.toString(),
        status: JobStatus[job.status],
        hasSubmission: job.hasSubmission,
      })

      // Try to fetch job metadata from multiple sources
      let metadataLoaded = false
      
      console.log(`[INFO] Fetching metadata for Job #${jobId.toString()}`)
      console.log(`   Creator: ${job.creator}`)
      console.log(`   Payment: ${job.payment.toString()}`)
      console.log(`   Deadline: ${job.deadline.toString()} (${new Date(Number(job.deadline) * 1000).toLocaleString()})`)
      
      // 1. Try localStorage first (most reliable for recently created jobs)
      try {
        // First, try direct jobId key
        const directKey = `job_metadata_${jobId.toString()}`
        const directStored = localStorage.getItem(directKey)
        console.log(`   Checking localStorage key: ${directKey}`, directStored ? 'FOUND' : 'NOT FOUND')
        
        if (directStored) {
          const stored = JSON.parse(directStored)
          if (stored.metadata) {
            const storedMetadata = stored.metadata
            job.title = storedMetadata.title || `Job #${jobId.toString()}`
            job.description = storedMetadata.description || ''
            job.category = storedMetadata.category || ''
            job.requirements = storedMetadata.requirements || []
            job.budget = storedMetadata.budget || job.payment.toString()
            job.createdAt = storedMetadata.createdAt || new Date().toISOString()
            metadataLoaded = true
            console.log(`[SUCCESS] Job ${jobId.toString()} metadata loaded from localStorage (direct key)`)
            console.log(`   Title: ${job.title}`)
            console.log(`   Category: ${job.category}`)
          }
        }
        
        // If not found, check all localStorage keys for job metadata (including transaction hash keys)
        if (!metadataLoaded) {
          console.log(`   Searching all localStorage keys for matching metadata...`)
          const allKeys: string[] = []
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            if (key && (key.startsWith('job_metadata_') || key.startsWith('job_metadata_tx_'))) {
              allKeys.push(key)
            }
          }
          console.log(`   Found ${allKeys.length} potential metadata keys:`, allKeys)
          
          for (const key of allKeys) {
            try {
              const stored = JSON.parse(localStorage.getItem(key) || '{}')
              if (stored.metadata) {
                const storedMetadata = stored.metadata
                console.log(`   Checking key ${key}:`, {
                  storedDeadline: storedMetadata.deadline,
                  contractDeadline: Number(job.deadline),
                  storedBudget: storedMetadata.budget,
                  contractPayment: formatTrustAmount(job.payment),
                })
                
                // Match by deadline and budget (best we can do without jobId in metadata)
                // Also check if budget matches (allowing for string/number conversion)
                const storedBudgetNum = Number(storedMetadata.budget)
                const contractPaymentNum = Number(formatTrustAmount(job.payment))
                const budgetMatch = storedMetadata.budget === job.payment.toString() || 
                                   storedMetadata.budget === formatTrustAmount(job.payment) ||
                                   Math.abs(storedBudgetNum - contractPaymentNum) < 0.0001 // Allow small difference
                
                const storedDeadline = Number(storedMetadata.deadline)
                const contractDeadline = Number(job.deadline)
                const deadlineMatch = storedDeadline === contractDeadline ||
                                     Math.abs(storedDeadline - contractDeadline) < 60 // Allow 1 minute difference
                
                console.log(`   Match check: deadline=${deadlineMatch}, budget=${budgetMatch}`)
                
                if (deadlineMatch && budgetMatch) {
                  job.title = storedMetadata.title || `Job #${jobId.toString()}`
                  job.description = storedMetadata.description || ''
                  job.category = storedMetadata.category || ''
                  job.requirements = storedMetadata.requirements || []
                  job.budget = storedMetadata.budget || job.payment.toString()
                  job.createdAt = storedMetadata.createdAt || new Date().toISOString()
                  metadataLoaded = true
                  console.log(`[SUCCESS] Job ${jobId.toString()} metadata loaded from localStorage (matched by deadline/budget)`)
                  console.log(`   Title: ${job.title}`)
                  console.log(`   Description: ${job.description}`)
                  console.log(`   Category: ${job.category}`)
                  // Update to use jobId as key for future lookups
                  localStorage.setItem(`job_metadata_${jobId.toString()}`, JSON.stringify(stored))
                  break
                }
              }
            } catch (err) {
              console.warn(`Error parsing localStorage key ${key}:`, err)
            }
          }
        }
      } catch (err) {
        console.warn('Error checking localStorage for job metadata:', err)
      }
      
      // 2. Try to fetch from Filebase API using job details (deadline is most reliable)
      if (!metadataLoaded) {
        try {
          console.log(`   Trying to fetch from Filebase API with deadline=${job.deadline.toString()}...`)
          const filebaseResponse = await fetch(
            `/api/ipfs/filebase/fetch?deadline=${job.deadline.toString()}`
          )
          
          console.log(`   Filebase API response status: ${filebaseResponse.status}`)
          
          if (filebaseResponse.ok) {
            const filebaseData = await filebaseResponse.json()
            console.log(`   Filebase API response:`, filebaseData)
            
            if (filebaseData.success && filebaseData.metadata) {
              const metadata = filebaseData.metadata
              job.title = metadata.title || `Job #${jobId.toString()}`
              job.description = metadata.description || ''
              job.category = metadata.category || ''
              job.requirements = metadata.requirements || []
              job.budget = metadata.budget || job.payment.toString()
              job.createdAt = metadata.createdAt || new Date().toISOString()
              metadataLoaded = true
              console.log(`[SUCCESS] Job ${jobId.toString()} metadata loaded from Filebase API`)
              console.log(`   Title: ${job.title}`)
              console.log(`   Description: ${job.description}`)
              console.log(`   Category: ${job.category}`)
              console.log(`   Requirements:`, job.requirements)
              
              // Store in localStorage for future use
              localStorage.setItem(`job_metadata_${jobId.toString()}`, JSON.stringify({
                cid: filebaseData.cid,
                metadata: {
                  title: job.title,
                  description: job.description,
                  category: job.category,
                  requirements: job.requirements,
                  budget: job.budget,
                  deadline: metadata.deadline,
                  createdAt: job.createdAt,
                },
                httpUrl: `https://${filebaseData.cid}.ipfs.filebase.io`,
              }))
            } else {
              console.log(`   Filebase API returned success=false or no metadata`)
            }
          } else {
            const errorData = await filebaseResponse.json().catch(() => ({}))
            console.log(`   Filebase API error:`, errorData)
          }
        } catch (err) {
          console.warn('Error fetching from Filebase API:', err)
        }
      }
      
      // 3. Try to fetch from IPFS if we have a CID in localStorage
      if (!metadataLoaded) {
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            if (key && key.startsWith('job_metadata_')) {
              const stored = JSON.parse(localStorage.getItem(key) || '{}')
              if (stored.cid || stored.httpUrl) {
                const url = stored.httpUrl || `https://${stored.cid}.ipfs.w3s.link`
                try {
                  const response = await fetch(url)
                  if (response.ok) {
                    const metadata = await response.json()
                    // Match by deadline and budget
                    if (metadata.deadline === Number(job.deadline) && 
                        metadata.budget === job.payment.toString()) {
                      job.title = metadata.title || `Job #${jobId.toString()}`
                      job.description = metadata.description || ''
                      job.category = metadata.category || ''
                      job.requirements = metadata.requirements || []
                      job.budget = metadata.budget || job.payment.toString()
                      job.createdAt = metadata.createdAt || new Date().toISOString()
                      metadataLoaded = true
                      console.log(`[SUCCESS] Job ${jobId.toString()} metadata loaded from IPFS`)
                      break
                    }
                  }
                } catch (fetchErr) {
                  console.warn('Error fetching metadata from IPFS:', fetchErr)
                }
              }
            }
          }
        } catch (err) {
          console.warn('Error fetching job metadata from IPFS:', err)
        }
      }
      
      // 4. Intuition atom lookup removed - metadata is fetched from localStorage, Filebase API, or IPFS gateways only
      
      // Fallback if nothing found
      if (!metadataLoaded) {
        job.title = `Job #${jobId.toString()}`
        console.warn(`Job ${jobId.toString()} metadata not found in any source`)
      }
      
      // Ensure title is always set (final fallback)
      if (!job.title || job.title === '') {
        job.title = `Job #${jobId.toString()}`
      }

      console.log(`[SUCCESS] Job ${jobId.toString()} loaded with title: "${job.title}"`)
      return job
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

  /**
   * Upvote a job
   * @param jobId - The job ID to upvote
   * @param userAtomId - The user's atom ID (term_id) from Intuition Knowledge Graph
   */
  async function upvoteJob(
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
      // Check if already upvoted
      const alreadyUpvoted = await publicClient.readContract({
        address: JOB_POOL_ADDRESS as `0x${string}`,
        abi: JOB_POOL_ABI,
        functionName: 'hasUpvoted',
        args: [jobId, address],
      })

      if (alreadyUpvoted) {
        return { success: false, error: 'You have already upvoted this job' }
      }

      // Get atom creation fee
      const atomCreationFee = parseTrustAmount('0.1') // 0.1 TRUST

      // Call upvoteJob function
      writeContract({
        address: JOB_POOL_ADDRESS as `0x${string}`,
        abi: JOB_POOL_ABI,
        functionName: 'upvoteJob',
        args: [jobId, userAtomId as `0x${string}`],
        value: atomCreationFee,
        gas: 300000n,
      })

      return { success: true }
    } catch (error: any) {
      console.error('Error upvoting job:', error)
      return {
        success: false,
        error: error.message || 'Failed to upvote job',
      }
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
    refetchJobCount,
    publicClient,
    
    // Functions
    createJob,
    submitWork,
    acceptWork,
    cancelJob,
    expireJob,
    upvoteJob,
    getJob,
    isJobExpired,
  }
}
