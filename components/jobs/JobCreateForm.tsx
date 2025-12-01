'use client'

import { useState } from 'react'
import { useAccount } from 'wagmi'
import { useJobPool } from '@/hooks/useJobPool'
import { uploadToIPFS as uploadFilebaseToIPFS } from '@/frontend/uploadToIPFS'
import { parseTrustAmount } from '@/lib/jobPoolContract'

interface JobCreateFormProps {
  onSuccess?: (jobId: bigint) => void
  onCancel?: () => void
}

export function JobCreateForm({ onSuccess, onCancel }: JobCreateFormProps) {
  const { address, isConnected } = useAccount()
  const { createJobAtom, createJob, isWriting, isConfirming, hash } = useJobPool()
  
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isConnected) {
      setError('Please connect your wallet')
      return
    }

    setError(null)
    setStep('uploading')

    try {
      // Step 1: Upload job metadata to IPFS (via Filebase backend)
      const jobMetadata = {
        title: formData.title,
        description: formData.description,
        category: formData.category,
        requirements: formData.requirements.split('\n').filter(r => r.trim()),
        budget: formData.budget,
        deadline: formData.deadline ? new Date(formData.deadline).getTime() / 1000 : 0,
        createdAt: new Date().toISOString(),
      }

      const metadataBlob = new Blob([JSON.stringify(jobMetadata)], {
        type: 'application/json',
      })
      const metadataFile = new File([metadataBlob], 'job-metadata.json', {
        type: 'application/json',
      })

      const ipfsResult = await uploadFilebaseToIPFS(metadataFile, {
        uploader: address,
        type: 'job-metadata',
      })
      console.log('Job metadata uploaded to IPFS (Filebase):', ipfsResult.cid)

      // Step 2: Create job atom in Intuition
      setStep('creating')
      const jobAtomId = await createJobAtom({
        title: formData.title,
        description: formData.description,
        category: formData.category,
        requirements: jobMetadata.requirements,
        budget: formData.budget,
        deadline: jobMetadata.deadline,
        metadataCID: ipfsResult.cid,
      })

      if (!jobAtomId) {
        throw new Error('Failed to create job atom in Intuition')
      }

      // Step 3: Create job on-chain
      const budgetAmount = parseTrustAmount(formData.budget)
      const deadline = formData.deadline ? BigInt(Math.floor(new Date(formData.deadline).getTime() / 1000)) : 0n

      const result = await createJob(formData.budget, jobAtomId, Number(deadline))
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to create job')
      }

      setStep('success')
      if (onSuccess && result.jobId) {
        onSuccess(result.jobId)
      }
    } catch (err: any) {
      console.error('Error creating job:', err)
      setError(err.message || 'Failed to create job')
      setStep('form')
    }
  }

  if (step === 'success') {
    return (
      <div className="bg-white rounded-2xl shadow-card p-6">
        <div className="text-center py-8">
          <div className="mb-4">
            <svg className="mx-auto h-16 w-16 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Job Created Successfully!</h3>
          <p className="text-gray-600 mb-4">Your job has been posted and is now open for submissions.</p>
          {hash && (
            <p className="text-sm text-gray-500 font-mono">
              Tx: {hash.substring(0, 10)}...{hash.substring(hash.length - 8)}
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow-card p-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Create New Job</h2>

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
            Deadline (optional)
          </label>
          <input
            type="datetime-local"
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
            {step === 'creating' && (isWriting || isConfirming) && 'Creating Job...'}
            {step === 'form' && 'Create Job'}
          </button>
        </div>
      </form>
    </div>
  )
}


