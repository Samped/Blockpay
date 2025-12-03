'use client'

import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { useJobPool } from '@/hooks/useJobPool'
import { uploadToIPFS as uploadFilebaseToIPFS } from '@/frontend/uploadToIPFS'

interface SubmissionFormProps {
  jobId: bigint
  onSuccess?: () => void
  onCancel?: () => void
}

export function SubmissionForm({ jobId, onSuccess, onCancel }: SubmissionFormProps) {
  const { address, isConnected } = useAccount()
  const { submitWork, isWriting, isConfirming, isConfirmed, hash, writeError } = useJobPool()
  
  const [formData, setFormData] = useState({
    description: '',
    previewFile: null as File | null,
  })
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<'form' | 'uploading' | 'creating' | 'success'>('form')

  // Store submission metadata and preview CID for later retrieval
  const [submissionMetadata, setSubmissionMetadata] = useState<{
    previewCID: string
    metadataCID: string
    metadata: any
  } | null>(null)

  // Watch for transaction confirmation
  useEffect(() => {
    if (isConfirmed && hash && step === 'creating' && submissionMetadata) {
      // Transaction confirmed! Store submission metadata in localStorage
      const storageKey = `submission_metadata_${jobId.toString()}_${address}`
      localStorage.setItem(storageKey, JSON.stringify({
        jobId: jobId.toString(),
        worker: address,
        previewCID: submissionMetadata.previewCID,
        metadataCID: submissionMetadata.metadataCID,
        metadata: submissionMetadata.metadata,
        transactionHash: hash,
        createdAt: new Date().toISOString(),
      }))
      console.log('Stored submission metadata in localStorage:', storageKey)
      
      // Also store with jobId as key for easier lookup
      const jobKey = `submission_metadata_job_${jobId.toString()}`
      localStorage.setItem(jobKey, JSON.stringify({
        jobId: jobId.toString(),
        worker: address,
        previewCID: submissionMetadata.previewCID,
        metadataCID: submissionMetadata.metadataCID,
        metadata: submissionMetadata.metadata,
        transactionHash: hash,
        createdAt: new Date().toISOString(),
      }))
      
      // Show success
      setStep('success')
      if (onSuccess) {
        setTimeout(() => onSuccess(), 2000)
      }
    }
  }, [isConfirmed, hash, step, onSuccess, submissionMetadata, jobId, address])

  // Watch for transaction errors
  useEffect(() => {
    if (writeError && step === 'creating') {
      console.error('Transaction error:', writeError)
      setError(writeError.message || 'Transaction failed. Please try again.')
      setStep('form')
    }
  }, [writeError, step])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFormData({ ...formData, previewFile: e.target.files[0] })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isConnected) {
      setError('Please connect your wallet')
      return
    }

    if (!formData.previewFile) {
      setError('Please upload a preview image')
      return
    }

    setError(null)
    setStep('uploading')

    try {
      // Step 1: Upload preview image to IPFS (via Filebase backend)
      const previewResult = await uploadFilebaseToIPFS(formData.previewFile, {
        uploader: address,
        type: 'submission-preview',
        jobId: jobId.toString(),
      })
      console.log('Preview uploaded to IPFS (Filebase):', previewResult.cid)

      // Step 2: Upload submission metadata to IPFS
      const submissionMetadata = {
        jobId: jobId.toString(),
        description: formData.description,
        previewCID: previewResult.cid,
        createdAt: new Date().toISOString(),
      }

      const metadataBlob = new Blob([JSON.stringify(submissionMetadata)], {
        type: 'application/json',
      })
      const metadataFile = new File([metadataBlob], 'submission-metadata.json', {
        type: 'application/json',
      })

      const metadataResult = await uploadFilebaseToIPFS(metadataFile, {
        uploader: address,
        type: 'submission-metadata',
        jobId: jobId.toString(),
      })
      console.log('Submission metadata uploaded to IPFS (Filebase):', metadataResult.cid)

      // Store metadata for later (will be saved to localStorage after transaction confirmation)
      setSubmissionMetadata({
        previewCID: previewResult.cid,
        metadataCID: metadataResult.cid,
        metadata: submissionMetadata,
      })

      // Step 3: Submit work on-chain (this will trigger the transaction)
      setStep('creating')
      const result = await submitWork(
        jobId,
        previewResult.cid
      )
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to submit work')
      }

      // Don't show success yet - wait for transaction confirmation via useEffect
      // The success message will be shown when isConfirmed becomes true
    } catch (err: any) {
      console.error('Error submitting work:', err)
      setError(err.message || 'Failed to submit work')
      setStep('form')
    }
  }

  if (step === 'success') {
    return (
      <div className="border border-green-200 bg-green-50 rounded-lg p-4">
        <div className="flex items-center gap-3">
          <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-green-900">Submission successful!</p>
            <p className="text-xs text-green-700">Your work has been submitted for review.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Preview Image *
        </label>
        <input
          type="file"
          required
          accept="image/*"
          onChange={handleFileChange}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        />
        {formData.previewFile && (
          <p className="mt-1 text-xs text-gray-500">
            Selected: {formData.previewFile.name}
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Description (optional)
        </label>
        <textarea
          rows={4}
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          placeholder="Add any notes about your submission..."
        />
      </div>

      <div className="flex gap-3 pt-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors text-sm font-medium"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={isWriting || isConfirming || uploading || step !== 'form'}
          className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-[#0052CC] transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {step === 'uploading' && 'Uploading...'}
          {step === 'creating' && (isWriting || isConfirming) && 'Submitting...'}
          {step === 'form' && 'Submit Work'}
        </button>
      </div>
    </form>
  )
}


