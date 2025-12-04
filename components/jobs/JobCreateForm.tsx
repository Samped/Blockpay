'use client'

import { useState, useEffect } from 'react'
import { useAccount, usePublicClient } from 'wagmi'
import { useJobPool } from '@/hooks/useJobPool'
import { useUserAtom } from '@/hooks/useUserAtom'
import { uploadToIPFS as uploadFilebaseToIPFS } from '@/frontend/uploadToIPFS'
import { parseTrustAmount, JOB_POOL_ADDRESS, JOB_POOL_ABI } from '@/lib/jobPoolContract'

interface JobCreateFormProps {
  onSuccess?: (jobId: bigint) => void
  onCancel?: () => void
}

export function JobCreateForm({ onSuccess, onCancel }: JobCreateFormProps) {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { createJob, isWriting, isConfirming, isConfirmed, hash, writeError } = useJobPool()
  const { userAtomId, loading: userAtomLoading } = useUserAtom()
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'general',
    requirements: '',
    budget: '',
    deadline: '',
  })
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<'form' | 'uploading' | 'creating' | 'success'>('form')
  const [txHash, setTxHash] = useState<string | null>(null)

  // Watch for transaction confirmation
  useEffect(() => {
    if (isConfirmed && hash && step === 'creating') {
      // Transaction confirmed! Now show success
      setTxHash(hash)
      setStep('success')
      
      // Upload metadata to IPFS and store locally for retrieval
      try {
        const deadlineTimestamp = formData.deadline ? Math.floor(new Date(formData.deadline).getTime() / 1000) : 0
        const jobMetadata = {
          title: formData.title,
          description: formData.description,
          category: formData.category,
          requirements: formData.requirements.split('\n').filter(r => r.trim()),
          budget: formData.budget,
          deadline: deadlineTimestamp,
          createdAt: new Date().toISOString(),
        }

        const metadataBlob = new Blob([JSON.stringify(jobMetadata)], {
          type: 'application/json',
        })
        const metadataFile = new File([metadataBlob], 'job-metadata.json', {
          type: 'application/json',
        })

        // Upload to IPFS and store mapping
        uploadFilebaseToIPFS(metadataFile, {
          uploader: address,
          type: 'job-metadata',
        }).then((ipfsResult) => {
          console.log('Job metadata uploaded to IPFS (Filebase):', ipfsResult.cid)
          
          // Store metadata in localStorage with transaction hash as temporary key
          if (hash) {
            const tempKey = `job_metadata_tx_${hash}`
            localStorage.setItem(tempKey, JSON.stringify({
              cid: ipfsResult.cid,
              metadata: jobMetadata,
              httpUrl: ipfsResult.httpUrl,
            }))
            console.log('Stored job metadata locally with temp key:', tempKey)
            
            // Try to get jobId from jobCount after a short delay (to allow transaction to be mined)
            if (publicClient) {
              setTimeout(async () => {
                try {
                  // Read jobCount from contract to get the latest jobId
                  const currentJobCount = await publicClient.readContract({
                    address: JOB_POOL_ADDRESS as `0x${string}`,
                    abi: JOB_POOL_ABI,
                    functionName: 'jobCount',
                  }) as bigint
                  
                  if (currentJobCount > 0n) {
                    // Store with jobId as key
                    const jobIdKey = `job_metadata_${currentJobCount.toString()}`
                    localStorage.setItem(jobIdKey, JSON.stringify({
                      cid: ipfsResult.cid,
                      metadata: jobMetadata,
                      httpUrl: ipfsResult.httpUrl,
                    }))
                    console.log(`Stored job metadata with jobId key: ${jobIdKey}`)
                  }
                } catch (err) {
                  console.warn('Could not get jobId to store metadata:', err)
                }
              }, 3000) // Wait 3 seconds for transaction to be mined
            }
          }
          
        }).catch((err) => {
          console.warn('Failed to upload job metadata to IPFS (non-critical):', err)
        })
      } catch (err) {
        // Ignore optional metadata upload errors
        console.warn('Optional metadata upload failed:', err)
      }
    }
  }, [isConfirmed, hash, step, formData, address])

  // Watch for transaction errors
  useEffect(() => {
    if (writeError && step === 'creating') {
      setError(writeError.message || 'Transaction failed')
      setStep('form')
    }
  }, [writeError, step])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isConnected) {
      setError('Please connect your wallet')
      return
    }

    // Check if user has created a profile atom
    if (userAtomLoading) {
      setError('Checking your profile...')
      return
    }

    if (!userAtomId) {
      setError('Please create your profile first to create a job')
      // Show the user atom creation modal
      window.dispatchEvent(new CustomEvent('showCreateProfileModal'))
      return
    }

    if (!formData.deadline) {
      setError('Please set a deadline for the job')
      return
    }

    setError(null)
    setStep('creating')
    setTxHash(null)

    try {
      // Convert deadline to Unix timestamp
      // datetime-local gives us a date in local time, we need to convert to UTC timestamp
      const deadlineDate = new Date(formData.deadline)
      const deadlineTimestamp = Math.floor(deadlineDate.getTime() / 1000)
      const currentTimestamp = Math.floor(Date.now() / 1000)
      
      console.log('Deadline validation:', {
        deadlineInput: formData.deadline,
        deadlineDate: deadlineDate.toISOString(),
        deadlineTimestamp,
        currentTimestamp,
        difference: deadlineTimestamp - currentTimestamp,
      })
      
      if (deadlineTimestamp <= currentTimestamp) {
        throw new Error(`Deadline must be in the future. Current time: ${new Date(currentTimestamp * 1000).toLocaleString()}, Deadline: ${deadlineDate.toLocaleString()}`)
      }

      // Validate budget
      const budgetNum = parseFloat(formData.budget)
      if (isNaN(budgetNum) || budgetNum <= 0) {
        throw new Error('Budget must be a positive number')
      }

      // Create job on-chain (contract is payable - sends native token as payment)
      // The contract needs: deadline, jobPayment, and jobMetaHash
      // Payment is sent via msg.value (jobPayment + atomCreationFee + predicateCost if first job)
      // For now, use empty string for jobMetaHash (can be updated later with IPFS CID)
      const result = await createJob(formData.budget, deadlineTimestamp, '')
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to create job')
      }

      // Don't show success yet - wait for transaction confirmation
      // The useEffect will handle showing success when isConfirmed becomes true
    } catch (err: any) {
      console.error('Error creating job:', err)
      setError(err.message || 'Failed to create job')
      setStep('form')
    }
  }

  if (step === 'success') {
    return (
      <div className="bg-white rounded-2xl shadow-card p-6">
        {onCancel && (
          <button
            onClick={onCancel}
            className="flex items-center justify-center w-10 h-10 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors mb-4"
            aria-label="Go back"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        <div className="text-center py-8">
          <div className="mb-4">
            <svg className="mx-auto h-16 w-16 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Job Created Successfully!</h3>
          <p className="text-gray-600 mb-4">Your job has been posted on-chain and is now open for submissions.</p>
          {(txHash || hash) && (
            <div className="mb-6 p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500 mb-1">Transaction Hash:</p>
              <p className="text-sm text-gray-700 font-mono break-all">
                {(txHash || hash)?.substring(0, 20)}...{(txHash || hash)?.substring((txHash || hash)?.length - 8)}
              </p>
            </div>
          )}
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => {
                // Refresh job list and go back
                if ((window as any).__refreshJobList) {
                  ;(window as any).__refreshJobList()
                }
                // Call onCancel which will trigger refresh in parent
                if (onCancel) {
                  onCancel()
                }
              }}
              className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-[#0052CC] transition-colors font-medium"
            >
              View Job Marketplace
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow-card p-6">
      <div className="flex items-center gap-4 mb-6">
        {onCancel && (
          <button
            onClick={onCancel}
            className="flex items-center justify-center w-10 h-10 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
            aria-label="Go back"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        <h2 className="text-2xl font-bold text-gray-900">Create New Job</h2>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Job Title *
          </label>
          <input
            type="text"
            required
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            placeholder="e.g., Design a logo for my startup"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Description *
          </label>
          <textarea
            required
            rows={6}
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            placeholder="Describe the job requirements, deliverables, and any specific details..."
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Category
            </label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="general">General</option>
              <option value="design">Design</option>
              <option value="development">Development</option>
              <option value="writing">Writing</option>
              <option value="marketing">Marketing</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Budget (TRUST) *
            </label>
            <input
              type="number"
              required
              step="0.01"
              min="0.01"
              value={formData.budget}
              onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="0.00"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Requirements (one per line)
          </label>
          <textarea
            rows={4}
            value={formData.requirements}
            onChange={(e) => setFormData({ ...formData, requirements: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            placeholder="e.g., Must be in PNG format&#10;Minimum 1000x1000px&#10;Include source files"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Deadline *
          </label>
          <input
            type="datetime-local"
            required
            value={formData.deadline}
            onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          />
        </div>

        <div className="flex gap-4 pt-4">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors font-medium"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={isWriting || isConfirming || uploading || step !== 'form'}
            className="flex-1 px-6 py-3 bg-primary text-white rounded-lg hover:bg-[#0052CC] transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {step === 'uploading' && 'Uploading to IPFS...'}
            {step === 'creating' && isWriting && 'Waiting for wallet...'}
            {step === 'creating' && isConfirming && 'Confirming transaction...'}
            {step === 'form' && 'Create Job'}
          </button>
        </div>
      </form>
    </div>
  )
}


