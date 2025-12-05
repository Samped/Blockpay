'use client'

import { useState, useEffect, useRef } from 'react'
import { useAccount } from 'wagmi'
import { useJobPool } from '@/hooks/useJobPool'
import { Job, Submission, JobStatus, SubmissionStatus, formatTrustAmount } from '@/lib/jobPoolContract'
import { getIPFSUrl } from '@/lib/ipfs'
import { SubmissionForm } from './SubmissionForm'
import { KnowledgeGraphView } from './KnowledgeGraphView'
import { VoteButton } from './VoteButton'
import { useUserAtom } from '@/hooks/useUserAtom'
import { usePublicClient } from 'wagmi'
import { JOB_POOL_ADDRESS, JOB_POOL_ABI } from '@/lib/jobPoolContract'

// Component to display submission preview with multiple gateway fallbacks
function SubmissionPreviewImage({ previewCID }: { previewCID: string }) {
  const [currentGatewayIndex, setCurrentGatewayIndex] = useState(0)
  const [error, setError] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [loadingTimeout, setLoadingTimeout] = useState<NodeJS.Timeout | null>(null)
  
  if (!previewCID) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-sm text-red-800">No preview CID available</p>
      </div>
    )
  }
  
  // Clean CID - remove ipfs:// prefix and any leading slashes
  const cleanCid = previewCID.replace(/^ipfs:\/\//, '').replace(/^\/ipfs\//, '').replace(/^\/+/, '')
  console.log('[IMAGE] SubmissionPreviewImage - CID:', cleanCid)
  
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
    // Clear timeout if image loads successfully
    if (loadingTimeout) {
      clearTimeout(loadingTimeout)
      setLoadingTimeout(null)
    }
    console.log(`[SUCCESS] Image loaded successfully from ${gateways[currentGatewayIndex]?.name}`)
    setImageLoaded(true)
    setImageError(false)
  }
  
  const handleImageError = () => {
    // Clear timeout
    if (loadingTimeout) {
      clearTimeout(loadingTimeout)
      setLoadingTimeout(null)
    }
    console.warn(`[ERROR] Gateway ${gateways[currentGatewayIndex]?.name} failed`)
    setImageError(true)
    
    if (!isLastGateway) {
      console.log(`[RETRY] Trying next gateway: ${gateways[currentGatewayIndex + 1]?.name}`)
      setTimeout(() => {
        setCurrentGatewayIndex(prev => prev + 1)
        setImageError(false)
        setImageLoaded(false)
      }, 500)
    } else {
      console.error('[ERROR] All IPFS gateways failed for CID:', cleanCid)
      setError(true)
    }
  }
  
  // Reset when gateway changes and set timeout
  useEffect(() => {
    setImageLoaded(false)
    setImageError(false)
    
    // Clear any existing timeout
    if (loadingTimeout) {
      clearTimeout(loadingTimeout)
    }
    
    // Set a timeout for image loading (10 seconds for better reliability)
    const timeout = setTimeout(() => {
      setImageError(prevError => {
        if (!prevError) {
          console.warn(`[WARNING] Image loading timeout (10s) for ${gateways[currentGatewayIndex]?.name}`)
          
          if (!isLastGateway) {
            console.log(`[RETRY] Trying next gateway: ${gateways[currentGatewayIndex + 1]?.name}`)
            setTimeout(() => {
              setCurrentGatewayIndex(prev => prev + 1)
            }, 500)
          } else {
            console.error('[ERROR] All IPFS gateways failed for CID:', cleanCid)
            setError(true)
          }
        }
        return true
      })
    }, 10000) // 10 second timeout for better reliability
    
    setLoadingTimeout(timeout)
    
    // Cleanup timeout on unmount or when gateway changes
    return () => {
      if (timeout) {
        clearTimeout(timeout)
      }
    }
  }, [currentGatewayIndex, cleanCid, isLastGateway])
  
  // Pre-check API response for Filebase Proxy to catch JSON errors early
  useEffect(() => {
    if (currentGatewayIndex !== 0 || !currentUrl.includes('/api/ipfs/filebase/image')) {
      return
    }
    
    let cancelled = false
    
    const checkApiResponse = async () => {
      try {
        const response = await fetch(currentUrl, { 
          method: 'HEAD', // Use HEAD to check without downloading
          cache: 'no-cache'
        })
        
        if (cancelled) return
        
        const contentType = response.headers.get('content-type')
        
        // If API returns JSON or error status, it's an error
        if (!response.ok || (contentType && contentType.includes('application/json'))) {
          console.error('[ERROR] Filebase Proxy API returned error:', {
            status: response.status,
            statusText: response.statusText,
            contentType
          })
          
          if (!isLastGateway) {
            console.log(`[RETRY] Trying next gateway: ${gateways[currentGatewayIndex + 1]?.name}`)
            setTimeout(() => {
              if (!cancelled) {
                setCurrentGatewayIndex(prev => prev + 1)
              }
            }, 500)
          } else {
            if (!cancelled) {
              setError(true)
            }
          }
        } else {
          console.log('[INFO] Filebase Proxy API response looks good:', {
            status: response.status,
            contentType
          })
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('[WARNING] Could not check API response:', err)
          // Don't fail immediately, let the image tag try to load
        }
      }
    }
    
    // Check after a short delay to see if API returns error
    const checkTimeout = setTimeout(checkApiResponse, 1000)
    
    return () => {
      cancelled = true
      clearTimeout(checkTimeout)
    }
  }, [currentUrl, currentGatewayIndex, isLastGateway])
  
  
  if (error) {
    const filebaseUrl = `https://${cleanCid}.ipfs.filebase.io`
    const ipfsUrl = `https://ipfs.io/ipfs/${cleanCid}`
    
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-sm text-red-800 font-medium mb-2">
          [WARNING] Failed to load preview image from IPFS gateways
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
  
  // Prevent right-click context menu
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    return false
  }

  // Prevent drag-and-drop
  const handleDragStart = (e: React.DragEvent) => {
    e.preventDefault()
    return false
  }

  return (
    <div 
      className="relative bg-white rounded-xl border-2 border-gray-200 shadow-lg overflow-hidden"
      onContextMenu={handleContextMenu}
      onDragStart={handleDragStart}
      onSelect={(e) => e.preventDefault()}
      style={{ userSelect: 'none', WebkitUserSelect: 'none', MozUserSelect: 'none', msUserSelect: 'none' }}
    >
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
        {/* Invisible overlay to prevent direct image access */}
        {imageLoaded && !error && (
          <div 
            className="absolute inset-0 z-30 cursor-not-allowed"
            onContextMenu={handleContextMenu}
            onDragStart={handleDragStart}
            style={{ 
              userSelect: 'none', 
              WebkitUserSelect: 'none', 
              MozUserSelect: 'none', 
              msUserSelect: 'none',
              pointerEvents: 'auto'
            }}
          />
        )}
        <img
          key={currentGatewayIndex} // Force re-render when gateway changes
          src={currentUrl}
          alt="Submission preview (watermarked)"
          className={`rounded-lg shadow-xl transition-all duration-300 ${
            imageLoaded ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
          }`}
          onLoad={handleImageLoad}
          onError={handleImageError}
          onContextMenu={handleContextMenu}
          onDragStart={handleDragStart}
          draggable={false}
          style={{ 
            display: error ? 'none' : 'block',
            maxWidth: '100%',
            maxHeight: '400px',
            width: 'auto',
            height: 'auto',
            objectFit: 'contain',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            MozUserSelect: 'none',
            msUserSelect: 'none',
            pointerEvents: 'none', // Prevent direct interaction with image
            WebkitUserDrag: 'none' as any,
            KhtmlUserDrag: 'none' as any,
            MozUserDrag: 'none' as any,
            OUserDrag: 'none' as any,
            userDrag: 'none',
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
            [WARNING] Could not load preview image
          </p>
          <p className="text-xs text-red-600 font-mono break-all mb-3">
            CID: {cleanCid}
          </p>
          <div className="space-y-3">
            <button
              onClick={async () => {
                console.log('[RETRY] Manually testing proxy API...')
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
  const { getJob, acceptWork, cancelJob, isWriting, isConfirming, hash, isConfirmed } = useJobPool()
  const publicClient = usePublicClient()
  const { userAtomId } = useUserAtom()
  const [jobAtomId, setJobAtomId] = useState<`0x${string}` | null>(null)
  
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
  const [fullResCID, setFullResCID] = useState<string>('')
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
  const processedHashRef = useRef<string | null>(null)

  useEffect(() => {
    loadJobData()
  }, [jobId])

  // Fetch job atom ID
  useEffect(() => {
    const fetchJobAtomId = async () => {
      if (!publicClient || !jobId) return

      try {
        const atomId = await publicClient.readContract({
          address: JOB_POOL_ADDRESS as `0x${string}`,
          abi: JOB_POOL_ABI,
          functionName: 'jobAtomIds',
          args: [jobId],
        }) as `0x${string}`

        if (atomId && atomId !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
          setJobAtomId(atomId)
        }
      } catch (error) {
        console.error('Error fetching job atom ID:', error)
      }
    }

    fetchJobAtomId()
  }, [publicClient, jobId])

  async function loadJobData() {
    try {
      setLoading(true)
      setError(null) // Clear previous errors
      
      // Try loading the job, with retry if it fails
      let jobData = await getJob(jobId)
      
      // If job not found, wait a bit and retry (might be still indexing)
      if (!jobData) {
        console.log(`[INFO] Job ${jobId.toString()} not found, retrying after 2 seconds...`)
        await new Promise(resolve => setTimeout(resolve, 2000))
        jobData = await getJob(jobId)
      }
      
      // If still not found, wait longer and retry once more
      if (!jobData) {
        console.log(`[INFO] Job ${jobId.toString()} still not found, retrying after 3 more seconds...`)
        await new Promise(resolve => setTimeout(resolve, 3000))
        jobData = await getJob(jobId)
      }
      
      if (!jobData) {
        setError(`Job #${jobId.toString()} not found. It may still be processing. Please refresh the page.`)
        console.error(`[ERROR] Job ${jobId.toString()} could not be loaded after retries`)
        return
      }

      setJob(jobData)

      // Load ALL submissions from contract (contract supports multiple submissions)
      const allSubmissions: Submission[] = []
      
      try {
        // Get all submissions from contract
        const submissionsData = await publicClient.readContract({
          address: JOB_POOL_ADDRESS as `0x${string}`,
          abi: JOB_POOL_ABI,
          functionName: 'getSubmissions',
          args: [jobId],
        }) as [string[], `0x${string}`[], boolean[]]
        
        const [workers, submissionHashes, accepted] = submissionsData
        console.log(`[INFO] Found ${workers.length} submissions for job ${jobId.toString()}`)
        
        // Load submission metadata from localStorage for each submission
        for (let i = 0; i < workers.length; i++) {
          const worker = workers[i]
          const submissionHash = submissionHashes[i]
          const isAccepted = accepted[i]
          
          if (!worker || worker === '0x0000000000000000000000000000000000000000') {
            continue
          }
          
          let previewCID = ''
          let fullResCID = ''
          
          // Try to get submission metadata from localStorage
          try {
            // Try worker-based key (may be array or single object)
            const workerKey = `submission_metadata_${jobId.toString()}_${worker.toLowerCase()}`
            const stored = localStorage.getItem(workerKey)
            if (stored) {
              const submissionData = JSON.parse(stored)
              // Handle both array and single object formats
              const submissions = Array.isArray(submissionData) ? submissionData : [submissionData]
              
              // Find submission matching this hash or the most recent one
              for (const sub of submissions) {
                if (sub.jobId === jobId.toString() && sub.worker?.toLowerCase() === worker.toLowerCase()) {
                  // Match by submission hash if available, or use the most recent
                  if (!submissionHash || sub.transactionHash || !previewCID) {
                    if (sub.previewCID) previewCID = sub.previewCID
                    if (sub.fullResCID) fullResCID = sub.fullResCID
                    // If we found a match, prefer it
                    if (sub.transactionHash && submissionHash) {
                      break
                    }
                  }
                }
              }
            }
            
            // Also try job-based key (may be array)
            if (!previewCID || !fullResCID) {
              const jobKey = `submission_metadata_job_${jobId.toString()}`
              const stored = localStorage.getItem(jobKey)
              if (stored) {
                const submissionData = JSON.parse(stored)
                const submissions = Array.isArray(submissionData) ? submissionData : [submissionData]
                
                for (const sub of submissions) {
                  if (sub.worker?.toLowerCase() === worker.toLowerCase()) {
                    if (sub.previewCID && !previewCID) previewCID = sub.previewCID
                    if (sub.fullResCID && !fullResCID) fullResCID = sub.fullResCID
                  }
                }
              }
            }
            
            // Search all submission metadata keys
            if (!previewCID || !fullResCID) {
              for (let j = 0; j < localStorage.length; j++) {
                const key = localStorage.key(j)
                if (key && key.startsWith('submission_metadata_')) {
                  try {
                    const stored = JSON.parse(localStorage.getItem(key) || '{}')
                    const submissions = Array.isArray(stored) ? stored : [stored]
                    
                    for (const sub of submissions) {
                      if (sub.jobId === jobId.toString() && sub.worker?.toLowerCase() === worker.toLowerCase()) {
                        if (sub.previewCID && !previewCID) previewCID = sub.previewCID
                        if (sub.fullResCID && !fullResCID) fullResCID = sub.fullResCID
                      }
                    }
                  } catch (e) {
                    // Skip invalid entries
                  }
                }
              }
            }
          } catch (err) {
            console.warn(`Error reading submission metadata for worker ${worker}:`, err)
          }
          
          // Create submission object
          const submission: Submission = {
            id: BigInt(i),
            submitter: worker as `0x${string}`,
            previewCID: previewCID,
            status: isAccepted ? SubmissionStatus.Approved : SubmissionStatus.Pending,
            timestamp: BigInt(Math.floor(Date.now() / 1000)), // Contract doesn't expose timestamp easily
          }
          
          allSubmissions.push(submission)
          console.log(`[OK] Loaded submission ${i} from worker ${worker.substring(0, 10)}... (previewCID: ${previewCID ? 'found' : 'missing'})`)
        }
      } catch (err) {
        console.warn('Error loading submissions from contract:', err)
        // Fallback to old method if getSubmissions fails
        if (jobData.hasSubmission && jobData.worker && jobData.submissionHash !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
          let previewCID = ''
          let fullResCID = ''
          
          // Try to get submission metadata from localStorage first
          try {
            // Try jobId-based key first (may be array)
            const jobKey = `submission_metadata_job_${jobId.toString()}`
            const stored = localStorage.getItem(jobKey)
            if (stored) {
              const submissionData = JSON.parse(stored)
              const submissions = Array.isArray(submissionData) ? submissionData : [submissionData]
              const latest = submissions[submissions.length - 1] // Get most recent
              if (latest.previewCID) previewCID = latest.previewCID
              if (latest.fullResCID) fullResCID = latest.fullResCID
            }
            
            // Try worker-based key (may be array)
            if (!previewCID || !fullResCID) {
              const workerKey = `submission_metadata_${jobId.toString()}_${jobData.worker.toLowerCase()}`
              const stored = localStorage.getItem(workerKey)
              if (stored) {
                const submissionData = JSON.parse(stored)
                const submissions = Array.isArray(submissionData) ? submissionData : [submissionData]
                const latest = submissions[submissions.length - 1] // Get most recent
                if (latest.previewCID && !previewCID) previewCID = latest.previewCID
                if (latest.fullResCID && !fullResCID) fullResCID = latest.fullResCID
              }
            }
          } catch (err2) {
            console.warn('Error reading submission metadata from localStorage:', err2)
          }
          
          const submission: Submission = {
            id: 0n,
            submitter: jobData.worker,
            previewCID: previewCID,
            status: jobData.status === JobStatus.Completed ? SubmissionStatus.Approved : SubmissionStatus.Pending,
            timestamp: BigInt(Math.floor(Date.now() / 1000)),
          }
          allSubmissions.push(submission)
        }
      }
        
      console.log(`[SUCCESS] Loaded ${allSubmissions.length} submissions for job ${jobId.toString()}`)
      setSubmissions(allSubmissions)
      
      // Store fullResCID from the first submission (for backward compatibility)
      if (allSubmissions.length > 0 && allSubmissions[0].previewCID) {
        // Try to get fullResCID from localStorage
        const workerKey = `submission_metadata_${jobId.toString()}_${allSubmissions[0].submitter.toLowerCase()}`
        const stored = localStorage.getItem(workerKey)
        if (stored) {
          try {
            const submissionData = JSON.parse(stored)
            const submissions = Array.isArray(submissionData) ? submissionData : [submissionData]
            const latest = submissions[submissions.length - 1]
            if (latest.fullResCID) {
              setFullResCID(latest.fullResCID)
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    } catch (err: any) {
      console.error('Error loading job:', err)
      setError(err.message || 'Failed to load job')
    } finally {
      setLoading(false)
    }
  }

  // Effect to handle transaction confirmation and create notification
  useEffect(() => {
    if (!isConfirmed || !hash || !job || !publicClient) return
    
    // Prevent duplicate processing
    if (processedHashRef.current === hash) {
      console.log('⚠️ Transaction hash already processed:', hash)
      return
    }

    const handleTransactionConfirmed = async () => {
      try {
        console.log('✅ Transaction confirmed, creating notification for worker...', hash)
        
        // Mark this hash as processed
        processedHashRef.current = hash
        
        // Get transaction receipt to verify it succeeded
        const receipt = await publicClient.getTransactionReceipt({ hash })
        if (!receipt || receipt.status !== 'success') {
          console.error('Transaction failed:', receipt)
          processedHashRef.current = null // Reset on failure
          return
        }

        // Get worker address from job
        const workerAddress = job.worker || submissions[0]?.submitter || ''
        if (!workerAddress) {
          console.error('No worker address found')
          return
        }

        const jobPayment = job.payment || BigInt(0)
        
        // Calculate worker payment more accurately
        // Platform fee is stored in basis points (e.g., 250 = 2.5%)
        // Default platform fee is 2.5% if not available
        const BASIS_POINTS = 10000n
        const defaultPlatformFee = 250n // 2.5% in basis points
        // Try to get platformFeeAtCreation from job, fallback to default
        const jobAny = job as any
        const platformFeeBasisPoints = jobAny.platformFeeAtCreation 
          ? BigInt(jobAny.platformFeeAtCreation) 
          : defaultPlatformFee
        const platformFee = (jobPayment * platformFeeBasisPoints) / BASIS_POINTS
        const workerPayment = jobPayment > platformFee ? jobPayment - platformFee : jobPayment
        
        // When job is completed, store the full resolution image CID for the creator
        // Try to get fullResCID from state, or retrieve from submission metadata
        let finalFullResCID = fullResCID
        if (!finalFullResCID && workerAddress) {
          try {
            // Try to get from submission metadata
            const submissionKey = `submission_metadata_job_${jobId.toString()}`
            const submissionData = localStorage.getItem(submissionKey)
            if (submissionData) {
              const submission = JSON.parse(submissionData)
              finalFullResCID = submission.fullResCID || submission.metadata?.fullResCID
            }
            
            // Also try worker-specific key
            if (!finalFullResCID) {
              const workerKey = `submission_metadata_${jobId.toString()}_${workerAddress.toLowerCase()}`
              const workerData = localStorage.getItem(workerKey)
              if (workerData) {
                const submission = JSON.parse(workerData)
                finalFullResCID = submission.fullResCID || submission.metadata?.fullResCID
              }
            }
          } catch (err) {
            console.warn('Error retrieving fullResCID from submission metadata:', err)
          }
        }
        
        if (address) {
          try {
            // Store completed job with full resolution image for creator
            const completedJobKey = `completed_job_${jobId.toString()}_${address.toLowerCase()}`
            const completedJobData = {
              jobId: jobId.toString(),
              creator: address,
              worker: workerAddress,
              fullResCID: finalFullResCID || '',
              previewCID: submissions[0]?.previewCID || '',
              completedAt: new Date().toISOString(),
              title: job.title || `Job #${jobId.toString()}`,
              description: job.description || '',
            }
            localStorage.setItem(completedJobKey, JSON.stringify(completedJobData))
            console.log('💾 Stored completed job with full resolution image for creator:', completedJobKey)
            
            // Also store in a list of all completed jobs for this creator
            const creatorCompletedJobsKey = `creator_completed_jobs_${address.toLowerCase()}`
            const existingJobs = JSON.parse(localStorage.getItem(creatorCompletedJobsKey) || '[]')
            // Check if this job is already in the list
            if (!existingJobs.find((j: any) => j.jobId === jobId.toString())) {
              existingJobs.push({
                jobId: jobId.toString(),
                completedAt: completedJobData.completedAt,
              })
              localStorage.setItem(creatorCompletedJobsKey, JSON.stringify(existingJobs))
              console.log('💾 Updated creator completed jobs list')
            }
          } catch (err) {
            console.error('Error storing completed job data:', err)
          }
        }
        
        // Create notification for worker when job is completed and payment is sent
        try {
          const notificationId = `notification_${Date.now()}_${jobId.toString()}`
          const notification = {
            id: notificationId,
            type: 'job_completed',
            jobId: jobId.toString(),
            title: job.title || `Job #${jobId.toString()}`,
            message: `Your work has been selected! Payment of ${workerPayment.toString()} TRUST has been sent to your account.`,
            workerAddress: workerAddress.toLowerCase(),
            creatorAddress: address?.toLowerCase() || '',
            paymentAmount: workerPayment.toString(),
            createdAt: new Date().toISOString(),
            read: false,
          }
          
          // Store notification for worker
          const workerNotificationsKey = `worker_notifications_${workerAddress.toLowerCase()}`
          const existingNotifications = JSON.parse(localStorage.getItem(workerNotificationsKey) || '[]')
          // Check if notification already exists for this job
          const existingNotification = existingNotifications.find((n: any) => n.jobId === jobId.toString())
          if (!existingNotification) {
            existingNotifications.unshift(notification) // Add to beginning
            // Keep only last 50 notifications
            const recentNotifications = existingNotifications.slice(0, 50)
            localStorage.setItem(workerNotificationsKey, JSON.stringify(recentNotifications))
            console.log('🔔 Created notification for worker:', workerAddress, 'Job:', jobId.toString())
            
            // Trigger storage event so other tabs/components can update
            window.dispatchEvent(new StorageEvent('storage', {
              key: workerNotificationsKey,
              newValue: JSON.stringify(recentNotifications),
            }))
          } else {
            console.log('⚠️ Notification already exists for this job')
          }
        } catch (err) {
          console.error('Error creating worker notification:', err)
        }
        
        // Reload job data
        loadJobData()
      } catch (err: any) {
        console.error('Error handling transaction confirmation:', err)
      }
    }

    handleTransactionConfirmed()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirmed, hash])

  async function handleApprove() {
    if (!job || !publicClient) return

    try {
      // The contract uses acceptWork(jobId) instead of approveWork(jobId, submissionId)
      const result = await acceptWork(jobId)
      if (!result.success) {
        setError(result.error || 'Failed to approve submission')
        return
      }
      
      // Notification will be created in useEffect when transaction is confirmed
      console.log('⏳ Waiting for transaction confirmation to create notification...')
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
        <div className="flex justify-end">
          <VoteButton
            jobId={jobId}
            jobAtomId={jobAtomId || '0x0000000000000000000000000000000000000000000000000000000000000000'}
            userAtomId={userAtomId}
            onVoteSuccess={() => {
              console.log('Vote successful!')
            }}
          />
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
                console.log('[RETRY] Force reloading job metadata from Filebase...')
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
                      [WARNING] Preview image not available. The submission was made but the preview CID could not be retrieved.
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

