'use client'

import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { useJobPool } from '@/hooks/useJobPool'
import { Job, Submission, JobStatus, SubmissionStatus, formatTrustAmount } from '@/lib/jobPoolContract'
import { getIPFSUrl } from '@/lib/ipfs'
import { SubmissionForm } from './SubmissionForm'
import { KnowledgeGraphView } from './KnowledgeGraphView'

// Component to display submission preview with multiple gateway fallbacks
function SubmissionPreviewImage({ previewCID }: { previewCID: string }) {
  const [currentGatewayIndex, setCurrentGatewayIndex] = useState(0)
  const [error, setError] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)
  
  if (!previewCID) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-sm text-red-800">No preview CID available</p>
      </div>
    )
  }
  
  // Clean CID - remove ipfs:// prefix and any leading slashes
  const cleanCid = previewCID.replace(/^ipfs:\/\//, '').replace(/^\/ipfs\//, '').replace(/^\/+/, '')
  console.log('🖼️ SubmissionPreviewImage - CID:', cleanCid)
  
  // List of IPFS gateways with their URL formats
  // Start with our own proxy API (most reliable)
  const gateways = [
    { name: 'Filebase Proxy (API)', url: `/api/ipfs/filebase/image?cid=${encodeURIComponent(cleanCid)}` },
    { name: 'filebase.io', url: `https://${cleanCid}.ipfs.filebase.io` },
    { name: 'w3s.link', url: `https://${cleanCid}.ipfs.w3s.link` },
    { name: 'ipfs.io', url: `https://ipfs.io/ipfs/${cleanCid}` },
    { name: 'cloudflare-ipfs.com', url: `https://cloudflare-ipfs.com/ipfs/${cleanCid}` },
    { name: 'dweb.link', url: `https://dweb.link/ipfs/${cleanCid}` },
    { name: 'gateway.pinata.cloud', url: `https://gateway.pinata.cloud/ipfs/${cleanCid}` },
  ]
  
  const currentUrl = gateways[currentGatewayIndex]?.url || ''
  const isLastGateway = currentGatewayIndex >= gateways.length - 1
  
  const handleImageLoad = () => {
    console.log(`✅ Image loaded successfully from ${gateways[currentGatewayIndex]?.name}`)
    setImageLoaded(true)
    setImageError(false)
  }
  
  const handleImageError = () => {
    console.warn(`❌ Gateway ${gateways[currentGatewayIndex]?.name} failed`)
    setImageError(true)
    
    if (!isLastGateway) {
      console.log(`🔄 Trying next gateway: ${gateways[currentGatewayIndex + 1]?.name}`)
      setTimeout(() => {
        setCurrentGatewayIndex(prev => prev + 1)
        setImageError(false)
        setImageLoaded(false)
      }, 500)
    } else {
      console.error('❌ All IPFS gateways failed for CID:', cleanCid)
      setError(true)
    }
  }
  
  // Reset when gateway changes
  useEffect(() => {
    setImageLoaded(false)
    setImageError(false)
  }, [currentGatewayIndex])
  
  
  if (error) {
    const filebaseUrl = `https://${cleanCid}.ipfs.filebase.io`
    const ipfsUrl = `https://ipfs.io/ipfs/${cleanCid}`
    
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-sm text-red-800 font-medium mb-2">
          ⚠️ Failed to load preview image from IPFS gateways
        </p>
        <p className="text-xs text-red-600 mt-1 font-mono break-all mb-3">
          CID: {previewCID}
        </p>
        <div className="mt-3 space-y-2">
          <p className="text-xs text-gray-700">Try opening these links directly:</p>
          <div className="space-y-1">
            <a 
              href={filebaseUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="block text-xs text-blue-600 hover:text-blue-800 underline break-all"
            >
              Filebase: {filebaseUrl}
            </a>
            <a 
              href={ipfsUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="block text-xs text-blue-600 hover:text-blue-800 underline break-all"
            >
              IPFS.io: {ipfsUrl}
            </a>
          </div>
        </div>
      </div>
    )
  }
  
  return (
    <div className="relative bg-white rounded-xl border-2 border-gray-200 shadow-lg overflow-hidden">
      {!imageLoaded && !error && (
        <div className="absolute inset-0 flex items-center justify-center z-10 bg-gray-50">
          <div className="text-center">
            <div className="w-10 h-10 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-sm font-medium text-gray-700">
              Loading preview...
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {gateways[currentGatewayIndex]?.name}
            </p>
          </div>
        </div>
      )}
      
      <div className="relative w-full flex justify-center items-center bg-gradient-to-br from-gray-50 to-gray-100 p-6">
        <img
          key={currentGatewayIndex} // Force re-render when gateway changes
          src={currentUrl}
          alt="Submission preview (watermarked)"
          className={`rounded-lg shadow-xl transition-all duration-300 ${
            imageLoaded ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
          }`}
          onLoad={handleImageLoad}
          onError={handleImageError}
          style={{ 
            display: error ? 'none' : 'block',
            maxWidth: '100%',
            maxHeight: '400px',
            width: 'auto',
            height: 'auto',
            objectFit: 'contain',
          }}
        />
      </div>
      
      {imageLoaded && !error && (
        <div className="absolute top-4 right-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg z-20 flex items-center gap-1.5">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
          </svg>
          Watermarked Preview
        </div>
      )}
      
      {imageError && !error && !isLastGateway && (
        <div className="absolute inset-0 flex items-center justify-center bg-yellow-50/90 z-10">
          <div className="text-center">
            <p className="text-sm font-medium text-yellow-800">
              {gateways[currentGatewayIndex]?.name} failed
            </p>
            <p className="text-xs text-yellow-600 mt-1">
              Trying next gateway...
            </p>
          </div>
        </div>
      )}
      
      {error && (
        <div className="p-4 text-center">
          <p className="text-sm text-red-800 font-medium mb-2">
            ⚠️ Could not load preview image
          </p>
          <p className="text-xs text-red-600 font-mono break-all mb-3">
            CID: {cleanCid}
          </p>
          <div className="space-y-3">
            <button
              onClick={async () => {
                console.log('🔄 Manually testing proxy API...')
                try {
                  const proxyUrl = `/api/ipfs/filebase/image?cid=${encodeURIComponent(cleanCid)}`
                  console.log('Testing:', proxyUrl)
                  const response = await fetch(proxyUrl)
                  console.log('Proxy API response:', {
                    status: response.status,
                    statusText: response.statusText,
                    contentType: response.headers.get('content-type'),
                    ok: response.ok,
                  })
                  
                  if (response.ok) {
                    const blob = await response.blob()
                    console.log('Blob received:', {
                      type: blob.type,
                      size: blob.size,
                    })
                    if (blob.type.startsWith('image/')) {
                      const reader = new FileReader()
                      reader.onloadend = () => {
                        setImageDataUrl(reader.result as string)
                        setImageLoaded(true)
                        setError(false)
                        alert('Image loaded successfully via proxy!')
                      }
                      reader.readAsDataURL(blob)
                    } else {
                      alert(`Not an image: ${blob.type}. Size: ${blob.size} bytes`)
                    }
                  } else {
                    const errorText = await response.text()
                    alert(`Proxy API error: ${response.status} - ${errorText.substring(0, 100)}`)
                  }
                } catch (err: any) {
                  console.error('Manual test error:', err)
                  alert(`Error: ${err.message}`)
                }
              }}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
            >
              Test Proxy API
            </button>
            <div className="space-y-2">
              <p className="text-xs text-gray-700">Or try these direct links:</p>
              <div className="space-y-1">
                {gateways.slice(0, 4).map((gw) => (
                  <a
                    key={gw.name}
                    href={gw.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-xs text-blue-600 hover:text-blue-800 underline break-all"
                  >
                    {gw.name}: {gw.url}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface JobDetailProps {
  jobId: bigint
  onBack?: () => void
}

export function JobDetail({ jobId, onBack }: JobDetailProps) {
  const { address, isConnected } = useAccount()
  const { getJob, acceptWork, cancelJob, isWriting, isConfirming } = useJobPool()
  
  const [job, setJob] = useState<(Job & { 
    jobId: bigint
    title?: string
    description?: string
    category?: string
    requirements?: string[]
    budget?: string
    createdAt?: string
  }) | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [showSubmissionForm, setShowSubmissionForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showMetadataInput, setShowMetadataInput] = useState(false)
  const [manualMetadata, setManualMetadata] = useState({
    title: '',
    description: '',
    category: '',
    requirements: '',
  })

  useEffect(() => {
    loadJobData()
  }, [jobId])

  async function loadJobData() {
    try {
      setLoading(true)
      const jobData = await getJob(jobId)
      if (!jobData) {
        setError('Job not found')
        return
      }

      setJob(jobData)

      // The contract only stores one submission (hasSubmission, worker, submissionHash)
      // If there's a submission, fetch the preview CID from localStorage or IPFS
      if (jobData.hasSubmission && jobData.worker && jobData.submissionHash !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
        let previewCID = ''
        
        // Try to get preview CID from localStorage first
        try {
          // Try jobId-based key first
          const jobKey = `submission_metadata_job_${jobId.toString()}`
          const stored = localStorage.getItem(jobKey)
          if (stored) {
            const submissionData = JSON.parse(stored)
            if (submissionData.previewCID) {
              previewCID = submissionData.previewCID
              console.log('Found submission preview CID in localStorage:', previewCID)
            }
          }
          
          // If not found, try worker-based key
          if (!previewCID) {
            const workerKey = `submission_metadata_${jobId.toString()}_${jobData.worker.toLowerCase()}`
            const stored = localStorage.getItem(workerKey)
            if (stored) {
              const submissionData = JSON.parse(stored)
              if (submissionData.previewCID) {
                previewCID = submissionData.previewCID
                console.log('Found submission preview CID in localStorage (worker key):', previewCID)
              }
            }
          }
          
          // If still not found, try searching all submission metadata keys
          if (!previewCID) {
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i)
              if (key && key.startsWith('submission_metadata_')) {
                try {
                  const stored = JSON.parse(localStorage.getItem(key) || '{}')
                  if (stored.jobId === jobId.toString() && stored.worker?.toLowerCase() === jobData.worker.toLowerCase() && stored.previewCID) {
                    previewCID = stored.previewCID
                    console.log('Found submission preview CID in localStorage (search):', previewCID)
                    break
                  }
                } catch (e) {
                  // Skip invalid entries
                }
              }
            }
          }
        } catch (err) {
          console.warn('Error reading submission metadata from localStorage:', err)
        }
        
        // If still not found, try fetching from IPFS using Filebase API
        if (!previewCID) {
          try {
            console.log('🔍 Searching Filebase API for submission metadata with jobId:', jobId.toString())
            // Try to fetch submission metadata from Filebase by searching for jobId
            const response = await fetch(`/api/ipfs/filebase/fetch?jobId=${jobId.toString()}`)
            console.log('Filebase API response status:', response.status)
            
            if (response.ok) {
              const data = await response.json()
              console.log('Filebase API response data:', data)
              
              // Handle both single object and array responses
              let submissionMeta = null
              if (data.success) {
                if (Array.isArray(data.metadata)) {
                  // Find metadata that matches this job and has previewCID
                  submissionMeta = data.metadata.find((m: any) => 
                    (m.jobId === jobId.toString() || m.jobId === jobId) && 
                    m.previewCID
                  )
                } else if (data.metadata && data.metadata.previewCID) {
                  // Single object response
                  submissionMeta = data.metadata
                }
              }
              
              if (submissionMeta?.previewCID) {
                previewCID = submissionMeta.previewCID
                console.log('✅ Found submission preview CID from Filebase API:', previewCID)
                
                // Store it in localStorage for future use
                const storageKey = `submission_metadata_job_${jobId.toString()}`
                localStorage.setItem(storageKey, JSON.stringify({
                  jobId: jobId.toString(),
                  worker: jobData.worker,
                  previewCID: previewCID,
                  metadata: submissionMeta,
                  createdAt: new Date().toISOString(),
                }))
                console.log('💾 Stored submission metadata in localStorage with key:', storageKey)
              } else {
                console.warn('⚠️ Filebase API returned data but no matching submission metadata found')
              }
            } else {
              const errorText = await response.text()
              console.warn('Filebase API error response:', response.status, errorText)
            }
          } catch (err) {
            console.error('❌ Error fetching submission metadata from Filebase:', err)
          }
        }
        
        console.log('Submission data:', {
          jobId: jobId.toString(),
          worker: jobData.worker,
          hasSubmission: jobData.hasSubmission,
          submissionHash: jobData.submissionHash,
          previewCID: previewCID || 'NOT FOUND',
        })
        
        const submission: Submission = {
          id: 1n, // Only one submission per job in this contract
          submitter: jobData.worker,
          previewCID: previewCID, // Now we have the actual preview CID
          status: jobData.status === JobStatus.Completed ? SubmissionStatus.Approved : SubmissionStatus.Pending,
          timestamp: BigInt(Math.floor(Date.now() / 1000)),
        }
        setSubmissions([submission])
        
        // If previewCID is still empty, log a warning
        if (!previewCID) {
          console.warn('⚠️ Preview CID not found for submission. Worker:', jobData.worker, 'JobId:', jobId.toString())
          console.warn('   This might mean the submission metadata was not stored or the Filebase search failed.')
          console.warn('   Check localStorage for keys starting with "submission_metadata_"')
        }
      } else {
        setSubmissions([])
      }
    } catch (err: any) {
      console.error('Error loading job:', err)
      setError(err.message || 'Failed to load job')
    } finally {
      setLoading(false)
    }
  }

  async function handleApprove() {
    if (!job) return

    try {
      // The contract uses acceptWork(jobId) instead of approveWork(jobId, submissionId)
      const result = await acceptWork(jobId)
      if (!result.success) {
        setError(result.error || 'Failed to approve submission')
        return
      }
      
      // Reload job data
      await loadJobData()
    } catch (err: any) {
      setError(err.message || 'Failed to approve submission')
    }
  }

  async function handleCancel() {
    if (!job) return

    if (!confirm('Are you sure you want to cancel this job? The escrow will be returned to you.')) {
      return
    }

    try {
      const result = await cancelJob(jobId)
      if (!result.success) {
        setError(result.error || 'Failed to cancel job')
        return
      }
      
      await loadJobData()
    } catch (err: any) {
      setError(err.message || 'Failed to cancel job')
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-card p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    )
  }

  if (error || !job) {
    return (
      <div className="bg-white rounded-2xl shadow-card p-6">
        <div className="text-center py-8">
          <p className="text-red-600 mb-4">{error || 'Job not found'}</p>
          {onBack && (
            <button
              onClick={onBack}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-[#0052CC] transition-colors"
            >
              Back to Jobs
            </button>
          )}
        </div>
      </div>
    )
  }

  const isRequestor = address?.toLowerCase() === job.creator.toLowerCase()
  const isOpen = job.status === JobStatus.Active
  // Allow multiple submissions per job while it is Active.
  // Contract-level limits (max submissions, per-user limits) are enforced on-chain.
  const canSubmit = isConnected && !isRequestor && isOpen
  
  // Debug logging
  console.log('JobDetail - Submission visibility:', {
    isConnected,
    isRequestor,
    isOpen,
    hasSubmission: job.hasSubmission,
    canSubmit,
    address,
    creator: job.creator,
    status: job.status,
  })

  return (
    <div className="space-y-6">
      {/* Job Header Card */}
      <div className="bg-white rounded-2xl shadow-card p-6">
        <div className="flex items-start justify-between mb-6">
          <div className="flex-1">
            <h2 className="text-3xl font-bold text-gray-900 mb-3">{job.title || `Job #${job.jobId.toString()}`}</h2>
            {job.description && (
              <p className="text-gray-600 mb-4 text-lg leading-relaxed">{job.description}</p>
            )}
            <div className="flex items-center gap-3 flex-wrap">
              <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                job.status === JobStatus.Active ? 'bg-green-100 text-green-800' :
                job.status === JobStatus.Completed ? 'bg-blue-100 text-blue-800' :
                job.status === JobStatus.Cancelled ? 'bg-gray-100 text-gray-800' :
                'bg-red-100 text-red-800'
              }`}>
                {JobStatus[job.status]}
              </span>
              <span className="text-base font-semibold text-primary">
                Budget: {formatTrustAmount(job.payment)} TRUST
              </span>
            </div>
          </div>
          {onBack && (
            <button
              onClick={onBack}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors ml-4"
            >
              ← Back
            </button>
          )}
        </div>
      </div>

      {/* Job Metadata Card */}
      <div className="bg-white rounded-2xl shadow-card p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-gray-900">Job Information</h3>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                // Force reload from Filebase
                console.log('🔄 Force reloading job metadata from Filebase...')
                console.log('Job details:', {
                  jobId: job.jobId.toString(),
                  deadline: job.deadline.toString(),
                  deadlineDate: new Date(Number(job.deadline) * 1000).toISOString(),
                  payment: job.payment.toString(),
                  paymentFormatted: formatTrustAmount(job.payment),
                })
                
                // Try Filebase API directly
                try {
                  const response = await fetch(`/api/ipfs/filebase/fetch?deadline=${job.deadline.toString()}`)
                  const data = await response.json()
                  console.log('Filebase API response:', data)
                  
                  if (data.success && data.metadata) {
                    // Update job with metadata
                    setJob({
                      ...job,
                      title: data.metadata.title,
                      description: data.metadata.description,
                      category: data.metadata.category,
                      requirements: data.metadata.requirements,
                      budget: data.metadata.budget,
                      createdAt: data.metadata.createdAt,
                    })
                    alert('Metadata loaded successfully!')
                  } else {
                    alert(`Metadata not found. Check console for details. Status: ${response.status}`)
                  }
                } catch (err) {
                  console.error('Error fetching from Filebase:', err)
                  alert('Error fetching metadata. Check console.')
                }
                
                // Also reload job data
                await loadJobData()
              }}
              className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              title="Refresh job data"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 text-gray-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
            {(!job.title || !job.description) && (
              <button
                onClick={() => setShowMetadataInput(!showMetadataInput)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {showMetadataInput ? 'Cancel' : 'Add Metadata'}
              </button>
            )}
          </div>
        </div>

        {/* Manual Metadata Input */}
        {showMetadataInput && (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Add Job Metadata</h4>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Title</label>
                <input
                  type="text"
                  value={manualMetadata.title}
                  onChange={(e) => setManualMetadata({ ...manualMetadata, title: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                  placeholder="e.g., Hand drawn white cat"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Description</label>
                <textarea
                  value={manualMetadata.description}
                  onChange={(e) => setManualMetadata({ ...manualMetadata, description: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                  rows={3}
                  placeholder="Describe the job requirements..."
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Category</label>
                <input
                  type="text"
                  value={manualMetadata.category}
                  onChange={(e) => setManualMetadata({ ...manualMetadata, category: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                  placeholder="e.g., design"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Requirements (one per line)</label>
                <textarea
                  value={manualMetadata.requirements}
                  onChange={(e) => setManualMetadata({ ...manualMetadata, requirements: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                  rows={2}
                  placeholder="PNG&#10;Minimum 1000x1000px"
                />
              </div>
              <button
                onClick={() => {
                  const metadata = {
                    title: manualMetadata.title,
                    description: manualMetadata.description,
                    category: manualMetadata.category,
                    requirements: manualMetadata.requirements.split('\n').filter(r => r.trim()),
                    budget: formatTrustAmount(job.payment),
                    deadline: Number(job.deadline),
                    createdAt: new Date().toISOString(),
                  }
                  localStorage.setItem(`job_metadata_${job.jobId.toString()}`, JSON.stringify({
                    metadata,
                  }))
                  setJob({
                    ...job,
                    title: metadata.title,
                    description: metadata.description,
                    category: metadata.category,
                    requirements: metadata.requirements,
                    budget: metadata.budget,
                    createdAt: metadata.createdAt,
                  })
                  setShowMetadataInput(false)
                  alert('Metadata saved! Refresh the page to see it.')
                }}
                className="w-full px-4 py-2 bg-primary text-white rounded-lg hover:bg-[#0052CC] transition-colors text-sm font-medium"
              >
                Save Metadata
              </button>
            </div>
          </div>
        )}
        
        {/* Two-column layout for job information */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Left Column - Job Details */}
          <div className="space-y-6">
            {/* Title */}
            <div>
              <h4 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">Title</h4>
              <p className="text-xl text-gray-900 font-semibold">{job.title || 'Untitled Job'}</p>
            </div>

            {/* Description */}
            <div>
              <h4 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">Description</h4>
              {job.description ? (
                <p className="text-base text-gray-700 leading-relaxed whitespace-pre-wrap">{job.description}</p>
              ) : (
                <p className="text-base text-gray-400 italic">No description provided</p>
              )}
            </div>

            {/* Category */}
            <div>
              <h4 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">Category</h4>
              {job.category ? (
                <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium bg-primary/10 text-primary border border-primary/20">
                  {job.category}
                </span>
              ) : (
                <span className="text-base text-gray-400 italic">Not specified</span>
              )}
            </div>

            {/* Requirements */}
            <div>
              <h4 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">Requirements</h4>
              {job.requirements && job.requirements.length > 0 ? (
                <ul className="space-y-2">
                  {job.requirements.map((req, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span className="text-primary mt-1.5">•</span>
                      <span className="text-base text-gray-700">{req}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-base text-gray-400 italic">No specific requirements listed</p>
              )}
            </div>
          </div>

          {/* Right Column - Financial & Timeline */}
          <div className="space-y-6">
            {/* Budget */}
            <div className="bg-white rounded-xl p-5 border border-gray-200">
              <h4 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">Budget</h4>
              <p className="text-2xl font-bold text-gray-900">
                {job.budget || formatTrustAmount(job.payment)} TRUST
              </p>
            </div>

            {/* Created At */}
            {job.createdAt && (
              <div>
                <h4 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">Created At</h4>
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-base text-gray-700 font-medium">
                    {new Date(job.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            )}

            {/* Deadline */}
            {job.deadline > 0n && (
              <div className="bg-white rounded-xl p-5 border border-gray-200">
                <h4 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">Deadline</h4>
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-base text-gray-700 font-medium">
                    {new Date(Number(job.deadline) * 1000).toLocaleString()}
                  </p>
                </div>
                {(() => {
                  const deadlineDate = new Date(Number(job.deadline) * 1000)
                  const now = new Date()
                  const daysLeft = Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
                  
                  if (daysLeft < 0) {
                    return (
                      <div className="flex items-center gap-2 mt-2">
                        <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                        <p className="text-sm text-gray-600 font-semibold">
                          Expired {Math.abs(daysLeft)} day{Math.abs(daysLeft) !== 1 ? 's' : ''} ago
                        </p>
                      </div>
                    )
                  } else if (daysLeft === 0) {
                    return (
                      <div className="flex items-center gap-2 mt-2">
                        <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                        <p className="text-sm text-gray-600 font-semibold">
                          Expires today
                        </p>
                      </div>
                    )
                  } else {
                    return (
                      <div className="flex items-center gap-2 mt-2">
                        <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                        <p className="text-sm text-gray-600 font-semibold">
                          {daysLeft} day{daysLeft !== 1 ? 's' : ''} remaining
                        </p>
                      </div>
                    )
                  }
                })()}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Job Contract Details Card */}
      <div className="bg-white rounded-2xl shadow-card p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-6">Contract Details</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">Creator</h4>
            <p className="text-base text-gray-900 font-mono break-all">{job.creator}</p>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">Status</h4>
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
              job.status === JobStatus.Active ? 'bg-green-100 text-green-800' :
              job.status === JobStatus.Completed ? 'bg-blue-100 text-blue-800' :
              job.status === JobStatus.Cancelled ? 'bg-gray-100 text-gray-800' :
              'bg-red-100 text-red-800'
            }`}>
              {JobStatus[job.status]}
            </span>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">Budget</h4>
            <p className="text-base text-gray-900 font-semibold">
              {job.budget || formatTrustAmount(job.payment)} TRUST
            </p>
          </div>

          {job.hasSubmission && job.worker && job.worker !== '0x0000000000000000000000000000000000000000' && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">Worker</h4>
              <p className="text-base text-gray-900 font-mono break-all">{job.worker}</p>
            </div>
          )}

          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">Submissions</h4>
            <p className="text-base text-gray-900">
              {submissions.length > 0
                ? `${submissions.length} submission${submissions.length !== 1 ? 's' : ''} received`
                : 'No submissions yet'}
            </p>
          </div>

          {job.hasSubmission && job.submissionHash && job.submissionHash !== '0x0000000000000000000000000000000000000000000000000000000000000000' && (
            <div className="md:col-span-2">
              <h4 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">Submission Hash</h4>
              <p className="text-xs text-gray-600 font-mono break-all bg-gray-50 p-2 rounded">{job.submissionHash}</p>
            </div>
          )}
        </div>

        {isRequestor && isOpen && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <button
              onClick={() => handleCancel()}
              className="px-4 py-2 text-sm border border-red-300 text-red-700 rounded-lg hover:bg-red-50 transition-colors"
            >
              Cancel Job
            </button>
          </div>
        )}
      </div>

      {/* Submissions */}
      <div className="bg-white rounded-2xl shadow-card p-6 relative">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-semibold text-gray-900">
            Submissions ({submissions.length})
          </h3>
          {!isRequestor && isOpen && (
            <>
              {!showSubmissionForm && (
                <button
                  onClick={() => {
                    if (!isConnected) {
                      setError('Please connect your wallet to submit work')
                      return
                    }
                    setShowSubmissionForm(true)
                  }}
                  className="flex items-center justify-center w-12 h-12 bg-primary text-white rounded-full hover:bg-[#0052CC] transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Submit work for this job"
                  disabled={!canSubmit}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              )}
              {showSubmissionForm && (
                <button
                  onClick={() => setShowSubmissionForm(false)}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-gray-700"
                >
                  Cancel
                </button>
              )}
            </>
          )}
          {isRequestor && (
            <span className="text-sm text-gray-500">You created this job</span>
          )}
          {!isOpen && (
            <span className="text-sm text-gray-500">Job is not open for submissions</span>
          )}
        </div>

        {showSubmissionForm && !isRequestor && isOpen && (
          <div className="mb-6">
            <SubmissionForm
              jobId={jobId}
              onSuccess={() => {
                setShowSubmissionForm(false)
                loadJobData()
              }}
              onCancel={() => setShowSubmissionForm(false)}
            />
          </div>
        )}

        {submissions.length === 0 && !showSubmissionForm ? (
          <div className="text-center py-12 text-gray-500">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-base mb-2">No submissions yet</p>
            {!isRequestor && isOpen && (
              <p className="text-sm text-gray-400">Click the + button above to submit your work</p>
            )}
            {!isConnected && !isRequestor && isOpen && (
              <p className="text-sm text-orange-500 mt-2">Please connect your wallet to submit</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {submissions.map((submission) => (
              <div
                key={submission.id.toString()}
                className="border border-gray-200 rounded-lg p-4"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      Submission #{submission.id.toString()}
                    </p>
                    <p className="text-xs text-gray-600 font-mono mt-1">
                      {submission.submitter}
                    </p>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    submission.status === SubmissionStatus.Approved ? 'bg-green-100 text-green-800' :
                    submission.status === SubmissionStatus.Rejected ? 'bg-red-100 text-red-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {SubmissionStatus[submission.status]}
                  </span>
                </div>

                {submission.previewCID ? (
                  <div className="mb-3">
                    <SubmissionPreviewImage previewCID={submission.previewCID} />
                    <p className="text-xs text-gray-500 mt-2">
                      This is a low-quality watermarked preview. The full-resolution work will be delivered after approval.
                    </p>
                  </div>
                ) : (
                  <div className="mb-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm text-yellow-800">
                      ⚠️ Preview image not available. The submission was made but the preview CID could not be retrieved.
                    </p>
                    <p className="text-xs text-yellow-600 mt-1">
                      Worker: {submission.submitter}
                    </p>
                  </div>
                )}

                {isRequestor && isOpen && submission.status === SubmissionStatus.Pending && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <button
                      onClick={() => handleApprove()}
                      disabled={isWriting || isConfirming}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isWriting || isConfirming ? 'Processing...' : 'Approve & Pay'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Knowledge Graph View */}
      <KnowledgeGraphView jobId={jobId} />
    </div>
  )
}

