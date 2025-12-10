'use client'

import { useState, useEffect } from 'react'
import { useAccount, usePublicClient } from 'wagmi'
import { JOB_POOL_ADDRESS, JOB_POOL_ABI, JobStatus } from '@/lib/jobPoolContract'
import { ImageModal } from './ImageModal'

interface CompletedJob {
  jobId: string
  creator: string
  worker: string
  fullResCID: string
  previewCID: string
  completedAt: string
  title: string
  description: string
}

function HighResImage({ cid, onClick, isFullRes = false }: { cid: string; onClick?: () => void; isFullRes?: boolean }) {
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)
  
  const cleanCid = cid.replace(/^ipfs:\/\//, '').replace(/^\/ipfs\//, '').replace(/^\/+/, '')
  // Use full-res route for full resolution images (no processing, no watermark)
  // Use regular proxy for preview images
  const imageUrl = isFullRes
    ? `/api/ipfs/filebase/image-fullres?cid=${encodeURIComponent(cleanCid)}`
    : `/api/ipfs/filebase/image?cid=${encodeURIComponent(cleanCid)}`
  
  return (
    <div 
      className="relative w-full aspect-square bg-gray-100 rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
      onClick={onClick}
    >
      {!imageLoaded && !imageError && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}
      {imageError && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
          <p className="text-xs text-gray-500">Failed to load image</p>
        </div>
      )}
      <img
        src={imageUrl}
        alt="Completed work"
        className={`w-full h-full object-contain transition-opacity duration-300 ${
          imageLoaded ? 'opacity-100' : 'opacity-0'
        }`}
        onLoad={() => setImageLoaded(true)}
        onError={() => setImageError(true)}
      />
      {imageLoaded && onClick && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/10 transition-colors">
          <div className="opacity-0 hover:opacity-100 transition-opacity">
            <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
            </svg>
          </div>
        </div>
      )}
    </div>
  )
}

export function CompletedJobs() {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const [completedJobs, setCompletedJobs] = useState<CompletedJob[]>([])
  const [loading, setLoading] = useState(true)
  const [recovering, setRecovering] = useState(false)
  const [selectedImage, setSelectedImage] = useState<{ url: string; cid: string; title: string } | null>(null)

  useEffect(() => {
    if (!address) {
      setLoading(false)
      return
    }

    // Automatically recover from contract in background if no jobs found
    const autoRecoverIfNeeded = async () => {
      if (!publicClient) return
      
      // Check if we have any completed jobs first
      const creatorCompletedJobsKey = `creator_completed_jobs_${address.toLowerCase()}`
      const jobIds = JSON.parse(localStorage.getItem(creatorCompletedJobsKey) || '[]')
      
      // If no jobs found, automatically recover from contract in background
      if (jobIds.length === 0) {
        console.log('No completed jobs found, automatically recovering from contract in background...')
        try {
          const jobCount = await publicClient.readContract({
            address: JOB_POOL_ADDRESS as `0x${string}`,
            abi: JOB_POOL_ABI,
            functionName: 'jobCount',
          }) as bigint

          const recoveredJobs: CompletedJob[] = []
          
          for (let i = 1; i <= Number(jobCount); i++) {
            try {
              const jobData = await publicClient.readContract({
                address: JOB_POOL_ADDRESS as `0x${string}`,
                abi: JOB_POOL_ABI,
                functionName: 'jobs',
                args: [BigInt(i)],
              }) as any

              const creator = jobData[0] as string
              const status = jobData[3] as number
              const worker = jobData[5] as string

              if (creator.toLowerCase() === address.toLowerCase() && status === JobStatus.Completed) {
                const jobKey = `completed_job_${i}_${address.toLowerCase()}`
                let existing = localStorage.getItem(jobKey)
                
                let fullResCID = ''
                const possibleKeys = [
                  `submission_metadata_job_${i}`,
                  `submission_metadata_${i}_${worker.toLowerCase()}`,
                  `submission_metadata_${i}_${address.toLowerCase()}`,
                ]

                for (const key of possibleKeys) {
                  const data = localStorage.getItem(key)
                  if (data) {
                    try {
                      const submission = JSON.parse(data)
                      fullResCID = submission.fullResCID || submission.metadata?.fullResCID || ''
                      if (fullResCID) break
                    } catch (e) {
                      console.warn(`Error parsing submission data from ${key}:`, e)
                    }
                  }
                }

                if (fullResCID) {
                  const completedJobData: CompletedJob = existing ? JSON.parse(existing) : {
                    jobId: i.toString(),
                    creator: address,
                    worker: worker,
                    fullResCID: fullResCID,
                    previewCID: '',
                    completedAt: new Date().toISOString(),
                    title: `Job #${i}`,
                    description: '',
                  }

                  if (!completedJobData.fullResCID) {
                    completedJobData.fullResCID = fullResCID
                  }

                  localStorage.setItem(jobKey, JSON.stringify(completedJobData))

                  const creatorCompletedJobsKey = `creator_completed_jobs_${address.toLowerCase()}`
                  const existingJobs = JSON.parse(localStorage.getItem(creatorCompletedJobsKey) || '[]')
                  if (!existingJobs.find((j: any) => j.jobId === i.toString())) {
                    existingJobs.push({
                      jobId: i.toString(),
                      completedAt: completedJobData.completedAt,
                    })
                    localStorage.setItem(creatorCompletedJobsKey, JSON.stringify(existingJobs))
                  }

                  if (completedJobData.fullResCID) {
                    recoveredJobs.push(completedJobData)
                  }
                }
              }
            } catch (err) {
              // Silently continue
            }
          }

          if (recoveredJobs.length > 0) {
            setCompletedJobs(prev => {
              const combined = [...prev, ...recoveredJobs]
              const unique = combined.filter((job, index, self) => 
                index === self.findIndex(j => j.jobId === job.jobId)
              )
              unique.sort((a, b) => 
                new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
              )
              return unique
            })
            console.log(`Auto-recovered ${recoveredJobs.length} completed jobs in background`)
          }
        } catch (err) {
          console.error('Error in background recovery:', err)
        }
      }
    }

    const loadCompletedJobs = async () => {
      try {
        console.log('Loading completed jobs for:', address.toLowerCase())
        
        // Get list of completed job IDs for this creator
        const creatorCompletedJobsKey = `creator_completed_jobs_${address.toLowerCase()}`
        let jobIds = JSON.parse(localStorage.getItem(creatorCompletedJobsKey) || '[]')
        console.log('Found job IDs from list:', jobIds)
        
        // Also search for all completed_job keys in localStorage as fallback
        const allKeys: string[] = []
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key && key.startsWith(`completed_job_`) && key.includes(address.toLowerCase())) {
            allKeys.push(key)
            const jobIdMatch = key.match(/completed_job_(\d+)_/)
            if (jobIdMatch) {
              const jobId = jobIdMatch[1]
              if (!jobIds.find((j: any) => j.jobId === jobId)) {
                jobIds.push({ jobId, completedAt: new Date().toISOString() })
                console.log('Found additional job from key:', key, 'JobId:', jobId)
              }
            }
          }
        }
        console.log('All completed_job keys found:', allKeys)
        console.log('Final job IDs list:', jobIds)
        
        // Load each completed job's data
        const jobs: CompletedJob[] = []
        
        for (const item of jobIds) {
          const jobId = typeof item === 'string' ? item : item.jobId
          const jobKey = `completed_job_${jobId}_${address.toLowerCase()}`
          console.log(`Checking job ${jobId}, key: ${jobKey}`)
          const jobData = localStorage.getItem(jobKey)
          
          if (jobData) {
            try {
              const job = JSON.parse(jobData)
              console.log(`Found job data for ${jobId}:`, {
                hasFullRes: !!job.fullResCID,
                hasPreview: !!job.previewCID,
                worker: job.worker,
              })
              
              // If fullResCID is missing, try to fetch it from submission metadata
              if (!job.fullResCID && job.worker) {
                console.log(`Attempting to recover fullResCID for job ${jobId}...`)
                try {
                  // Try to find submission metadata - check multiple possible keys
                  const possibleKeys = [
                    `submission_metadata_job_${jobId}`,
                    `submission_metadata_${jobId}_${job.worker.toLowerCase()}`,
                    `submission_metadata_${jobId}_${address.toLowerCase()}`,
                  ]
                  
                  for (const submissionKey of possibleKeys) {
                    const submissionData = localStorage.getItem(submissionKey)
                    if (submissionData) {
                      console.log(`Found submission data in key: ${submissionKey}`)
                      const submission = JSON.parse(submissionData)
                      const foundCID = submission.fullResCID || submission.metadata?.fullResCID
                      if (foundCID) {
                        job.fullResCID = foundCID
                        localStorage.setItem(jobKey, JSON.stringify(job))
                        console.log(`Recovered fullResCID from ${submissionKey} for job:`, jobId)
                        break
                      }
                    }
                  }
                  
                  // Try fetching from API as last resort
                  if (!job.fullResCID) {
                    console.log(`Trying API fetch for job ${jobId}...`)
                    try {
                      const response = await fetch(`/api/ipfs/filebase/fetch?jobId=${jobId}`)
                      if (response.ok) {
                        const data = await response.json()
                        console.log('API response:', data)
                        if (data.success && data.metadata) {
                          const metadata = Array.isArray(data.metadata) ? data.metadata[0] : data.metadata
                          const foundCID = metadata.fullResCID || metadata.metadata?.fullResCID
                          if (foundCID) {
                            job.fullResCID = foundCID
                            localStorage.setItem(jobKey, JSON.stringify(job))
                            console.log(`Recovered fullResCID from API for job:`, jobId)
                          }
                        }
                      }
                    } catch (apiErr) {
                      console.warn('Could not fetch from API:', apiErr)
                    }
                  }
                } catch (recoveryErr) {
                  console.warn('Error recovering fullResCID:', recoveryErr)
                }
              }
              
              // ONLY include job if it has fullResCID (no watermark)
              // Do NOT include jobs with only previewCID (which has watermark)
              if (job.fullResCID) {
                jobs.push(job)
                console.log(`Added job ${jobId} to list (has fullResCID)`)
              } else {
                console.warn(`Job ${jobId} has no fullResCID - skipping (will not show on dashboard)`)
                if (job.previewCID) {
                  console.warn(`   Job ${jobId} has previewCID but no fullResCID - preview will NOT be shown`)
                }
              }
            } catch (e) {
              console.error(`Error parsing job data for ${jobId}:`, e)
            }
          } else {
            console.warn(`No job data found for key: ${jobKey}`)
          }
        }
        
        // Also try to find jobs by searching all submission metadata
        console.log('Searching all submission metadata for completed jobs...')
        const submissionJobsToCheck: { jobId: string; fullResCID: string; previewCID: string; worker: string }[] = []
        
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key && key.startsWith('submission_metadata_')) {
            try {
              const data = JSON.parse(localStorage.getItem(key) || '{}')
              // Check if this submission has a fullResCID and might be for a completed job
              const fullResCID = data.fullResCID || data.metadata?.fullResCID
              const previewCID = data.previewCID || data.metadata?.previewCID
              if ((fullResCID || previewCID) && data.jobId) {
                const jobId = data.jobId.toString()
                // Check if we already have this job
                if (!jobs.find(j => j.jobId === jobId)) {
                  const worker = data.worker || ''
                  submissionJobsToCheck.push({ jobId, fullResCID: fullResCID || '', previewCID: previewCID || '', worker })
                  console.log(`Found submission with image for job ${jobId} in key: ${key}`, { 
                    fullResCID: !!fullResCID, 
                    previewCID: !!previewCID,
                    fullResCIDValue: fullResCID,
                    previewCIDValue: previewCID,
                  })
                }
              }
            } catch (e) {
              // Skip invalid entries
            }
          }
        }
        
        // Check contract for these jobs to see if they're completed
        // Do this synchronously but update state after
        if (submissionJobsToCheck.length > 0 && publicClient) {
          console.log(`Checking ${submissionJobsToCheck.length} jobs in contract...`)
          
          // Process contract checks
          const checkJobs = async () => {
            const newJobs: CompletedJob[] = []
            
            for (const subJob of submissionJobsToCheck) {
              try {
                const jobData = await publicClient.readContract({
                  address: JOB_POOL_ADDRESS as `0x${string}`,
                  abi: JOB_POOL_ABI,
                  functionName: 'jobs',
                  args: [BigInt(subJob.jobId)],
                }) as any
                
                const creator = jobData[0] as string
                const status = jobData[3] as number
                const worker = jobData[5] as string
                
                // Check if this job is completed and owned by current user
                if (creator.toLowerCase() === address.toLowerCase() && status === JobStatus.Completed) {
                  console.log(`Job ${subJob.jobId} is completed! Creating entry...`)
                  
                  const completedJobKey = `completed_job_${subJob.jobId}_${address.toLowerCase()}`
                  const completedJobData: CompletedJob = {
                    jobId: subJob.jobId,
                    creator: address,
                    worker: worker || subJob.worker,
                    fullResCID: subJob.fullResCID,
                    previewCID: subJob.previewCID,
                    completedAt: new Date().toISOString(),
                    title: `Job #${subJob.jobId}`,
                    description: '',
                  }
                  
                  localStorage.setItem(completedJobKey, JSON.stringify(completedJobData))
                  
                  // Add to list
                  const creatorCompletedJobsKey = `creator_completed_jobs_${address.toLowerCase()}`
                  const existingJobs = JSON.parse(localStorage.getItem(creatorCompletedJobsKey) || '[]')
                  if (!existingJobs.find((j: any) => j.jobId === subJob.jobId)) {
                    existingJobs.push({
                      jobId: subJob.jobId,
                      completedAt: completedJobData.completedAt,
                    })
                    localStorage.setItem(creatorCompletedJobsKey, JSON.stringify(existingJobs))
                  }
                  
                  // Add to jobs array
                  jobs.push(completedJobData)
                  newJobs.push(completedJobData)
                  console.log(`Created completed job entry for job ${subJob.jobId}`)
                }
              } catch (err) {
                console.warn(`Error checking job ${subJob.jobId} in contract:`, err)
              }
            }
            
            // Update state with newly found jobs
            if (newJobs.length > 0) {
              setCompletedJobs(prev => {
                const combined = [...prev, ...newJobs]
                // Remove duplicates
                const unique = combined.filter((job, index, self) => 
                  index === self.findIndex(j => j.jobId === job.jobId)
                )
                // Sort by date
                unique.sort((a, b) => 
                  new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
                )
                return unique
              })
            }
          }
          
          // Run async check but don't await it (non-blocking)
          checkJobs().catch(err => console.error('Error in async job check:', err))
        }
        
        // Sort by completion date (newest first)
        jobs.sort((a, b) => 
          new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
        )
        
        setCompletedJobs(jobs)
      } catch (err) {
        console.error('Error loading completed jobs:', err)
      } finally {
        setLoading(false)
      }
    }

    loadCompletedJobs()
    
    // Automatically recover from contract in background if needed
    autoRecoverIfNeeded()
    
    // Listen for storage changes to update the list
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key && e.key.startsWith('completed_job_') && e.key.includes(address.toLowerCase())) {
        loadCompletedJobs()
      }
    }
    
    window.addEventListener('storage', handleStorageChange)
    
    // Also check periodically for new completed jobs
    const interval = setInterval(loadCompletedJobs, 5000)
    
    return () => {
      window.removeEventListener('storage', handleStorageChange)
      clearInterval(interval)
    }
  }, [address])

  // Debug: Log what we found (must be before early returns)
  useEffect(() => {
    if (address && !loading) {
      console.log('CompletedJobs Debug:', {
        address: address.toLowerCase(),
        foundJobs: completedJobs.length,
        jobs: completedJobs.map(j => ({
          jobId: j.jobId,
          hasFullRes: !!j.fullResCID,
          hasPreview: !!j.previewCID,
          fullResCID: j.fullResCID,
        })),
      })
      
      // Also log all localStorage keys related to this address
      const allKeys: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && (key.includes(address.toLowerCase()) || key.includes('completed_job') || key.includes('submission_metadata'))) {
          allKeys.push(key)
        }
      }
      console.log('Relevant localStorage keys:', allKeys)
    }
  }, [address, loading, completedJobs])

  // Don't show anything if wallet is not connected
  if (!address) {
    return null
  }

  // Don't show anything while loading
  if (loading) {
    return null
  }

  const recoverFromContract = async () => {
    if (!address || !publicClient) return
    
    setRecovering(true)
    setLoading(true)
    try {
      console.log('Recovering completed jobs from contract...')
      
      const recoveredJobs: CompletedJob[] = []
      
      // Get job count from contract
      const jobCount = await publicClient.readContract({
        address: JOB_POOL_ADDRESS as `0x${string}`,
        abi: JOB_POOL_ABI,
        functionName: 'jobCount',
      }) as bigint
      
      console.log(`Total jobs in contract: ${jobCount.toString()}`)
      
      // Check each job to see if it's completed and owned by this address
      for (let i = 1; i <= Number(jobCount); i++) {
        try {
          const jobData = await publicClient.readContract({
            address: JOB_POOL_ADDRESS as `0x${string}`,
            abi: JOB_POOL_ABI,
            functionName: 'jobs',
            args: [BigInt(i)],
          }) as any
          
          const creator = jobData[0] as string
          const status = jobData[3] as number
          const worker = jobData[5] as string
          
          // Check if this job is completed and owned by current user
          if (creator.toLowerCase() === address.toLowerCase() && status === JobStatus.Completed) {
            console.log(`Found completed job ${i} for creator ${address}`)
            
            const jobKey = `completed_job_${i}_${address.toLowerCase()}`
            let existing = localStorage.getItem(jobKey)
            
            // Try to find submission metadata - check ALL possible keys
            let fullResCID = ''
            let previewCID = ''
            const possibleKeys = [
              `submission_metadata_job_${i}`,
              `submission_metadata_${i}_${worker.toLowerCase()}`,
              `submission_metadata_${i}_${address.toLowerCase()}`,
            ]
            
            // Also search all localStorage keys that might contain this job's metadata
            console.log(`Searching for submission metadata for job ${i}...`)
            for (let j = 0; j < localStorage.length; j++) {
              const key = localStorage.key(j)
              if (key && key.includes(`submission_metadata`) && key.includes(`${i}`)) {
                possibleKeys.push(key)
                console.log(`Found potential key: ${key}`)
              }
            }
            
            for (const key of possibleKeys) {
              const data = localStorage.getItem(key)
              if (data) {
                try {
                  const submission = JSON.parse(data)
                  console.log(`Checking key ${key}:`, {
                    hasFullRes: !!(submission.fullResCID || submission.metadata?.fullResCID),
                    hasPreview: !!(submission.previewCID || submission.metadata?.previewCID),
                    jobId: submission.jobId,
                    metadata: submission.metadata,
                  })
                  
                  const foundFullRes = submission.fullResCID || submission.metadata?.fullResCID || ''
                  const foundPreview = submission.previewCID || submission.metadata?.previewCID || ''
                  
                  if (foundFullRes) {
                    fullResCID = foundFullRes
                    console.log(`Found fullResCID in ${key}: ${fullResCID}`)
                  }
                  if (foundPreview) {
                    previewCID = foundPreview
                    console.log(`Found previewCID in ${key}: ${previewCID}`)
                  }
                  
                  if (fullResCID || previewCID) {
                    break
                  }
                } catch (e) {
                  console.warn(`Error parsing submission data from ${key}:`, e)
                }
              } else {
                console.log(`Key ${key} not found in localStorage`)
              }
            }
            
            console.log(`Final CIDs for job ${i}:`, { fullResCID, previewCID })
            
            // Create or update completed job entry
            const completedJobData: CompletedJob = existing ? JSON.parse(existing) : {
              jobId: i.toString(),
              creator: address,
              worker: worker,
              fullResCID: fullResCID,
              previewCID: previewCID,
              completedAt: new Date().toISOString(),
              title: `Job #${i}`,
              description: '',
            }
            
            // Update with found CIDs if missing
            if (!completedJobData.fullResCID && fullResCID) {
              completedJobData.fullResCID = fullResCID
            }
            if (!completedJobData.previewCID && previewCID) {
              completedJobData.previewCID = previewCID
            }
            
            localStorage.setItem(jobKey, JSON.stringify(completedJobData))
            
            // Add to list
            const creatorCompletedJobsKey = `creator_completed_jobs_${address.toLowerCase()}`
            const existingJobs = JSON.parse(localStorage.getItem(creatorCompletedJobsKey) || '[]')
            if (!existingJobs.find((j: any) => j.jobId === i.toString())) {
              existingJobs.push({
                jobId: i.toString(),
                completedAt: completedJobData.completedAt,
              })
              localStorage.setItem(creatorCompletedJobsKey, JSON.stringify(existingJobs))
            }
            
            // ONLY add jobs with fullResCID (no watermark)
            // Do NOT add jobs with only previewCID (which has watermark)
            if (completedJobData.fullResCID) {
              recoveredJobs.push(completedJobData)
              console.log(`Created/updated completed job entry for job ${i} (has fullResCID)`, completedJobData)
            } else {
              console.warn(`Job ${i} is completed but has no fullResCID - skipping (will not show on dashboard)`)
              if (completedJobData.previewCID || previewCID) {
                console.warn(`   Job ${i} has previewCID but no fullResCID - preview will NOT be shown`)
              }
            }
          } else {
            console.log(`Job ${i}: creator=${creator.toLowerCase()}, user=${address.toLowerCase()}, status=${status} (${JobStatus[status]}), isCreator=${creator.toLowerCase() === address.toLowerCase()}, isCompleted=${status === JobStatus.Completed}`)
          }
        } catch (err) {
          console.warn(`Error checking job ${i}:`, err)
        }
      }
      
      console.log(`Recovery complete. Found ${recoveredJobs.length} jobs with images`)
      
      // Update state with recovered jobs
      if (recoveredJobs.length > 0) {
        setCompletedJobs(prev => {
          const combined = [...prev, ...recoveredJobs]
          // Remove duplicates
          const unique = combined.filter((job, index, self) => 
            index === self.findIndex(j => j.jobId === job.jobId)
          )
          // Sort by date
          unique.sort((a, b) => 
            new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
          )
          return unique
        })
        console.log(`Recovered ${recoveredJobs.length} completed jobs`)
      }
      
      setRecovering(false)
      setLoading(false)
    } catch (err) {
      console.error('Error recovering from contract:', err)
      setRecovering(false)
      setLoading(false)
    }
  }

  // Show loading state
  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-card p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Completed Jobs</h2>
        </div>
        <div className="text-center py-8">
          <div className="animate-pulse text-gray-400">Loading completed jobs...</div>
        </div>
      </div>
    )
  }

  // Filter jobs with fullResCID
  const jobsWithImages = completedJobs.filter((job) => job.fullResCID)

  return (
    <div className="bg-white rounded-2xl shadow-card p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Completed Jobs</h2>
        {jobsWithImages.length > 0 && (
          <span className="text-sm text-gray-500">{jobsWithImages.length} {jobsWithImages.length === 1 ? 'job' : 'jobs'}</span>
        )}
      </div>
      
      {jobsWithImages.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-gray-600 mb-2 font-medium">No completed jobs yet</p>
          <p className="text-sm text-gray-500 mb-4">
            {recovering ? 'Recovering jobs from contract...' : 'Completed jobs will appear here once you finish and pay for work.'}
          </p>
          {!recovering && (
            <button
              onClick={recoverFromContract}
              className="inline-flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-[#0052CC] transition-colors text-sm font-medium"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Recover from Contract
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {jobsWithImages.map((job) => {
            // ONLY use fullResCID - never show previewCID (which has watermark)
            const imageCid = job.fullResCID
            const isFullRes = true // Always true since we filtered for fullResCID
            
            console.log(`[CompletedJobs] Rendering job ${job.jobId} with fullResCID:`, imageCid)
            
            const cleanCid = imageCid.replace(/^ipfs:\/\//, '').replace(/^\/ipfs\//, '').replace(/^\/+/, '')
            // ALWAYS use full-res route - it NEVER processes/watermarks images
            const imageUrl = `/api/ipfs/filebase/image-fullres?cid=${encodeURIComponent(cleanCid)}&t=${Date.now()}`
            
            console.log(`[CompletedJobs] Using FULL-RES route for job ${job.jobId}: ${imageUrl}`)
            
            return (
              <div key={job.jobId} className="bg-gray-50 rounded-xl p-4 hover:shadow-lg transition-shadow">
                <div className="mb-4">
                  <HighResImage 
                    cid={imageCid}
                    isFullRes={true}
                    onClick={() => setSelectedImage({
                      url: imageUrl,
                      cid: imageCid,
                      title: job.title || `Job #${job.jobId}`,
                    })}
                  />
                  <p className="text-xs text-green-600 mt-2 text-center">
                    High resolution (no watermark)
                  </p>
                  <p className="text-xs text-gray-400 mt-1 text-center">
                    CID: {cleanCid.substring(0, 12)}...
                  </p>
                </div>
            
            <div className="space-y-2">
              <h3 className="font-semibold text-gray-900 truncate">
                {job.title || `Job #${job.jobId}`}
              </h3>
              
              {job.description && (
                <p className="text-sm text-gray-600 line-clamp-2">
                  {job.description}
                </p>
              )}
              
              <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-200">
                <span>Job #{job.jobId}</span>
                <span>{new Date(job.completedAt).toLocaleDateString()}</span>
              </div>
              
              {job.worker && (
                <div className="text-xs text-gray-500">
                  Worker: <span className="font-mono">{job.worker.slice(0, 6)}...{job.worker.slice(-4)}</span>
                </div>
              )}
            </div>
          </div>
          )
          })}
        </div>
      )}

      {/* Image Modal */}
      {selectedImage && (
        <ImageModal
          isOpen={!!selectedImage}
          onClose={() => setSelectedImage(null)}
          imageUrl={selectedImage.url}
          imageCid={selectedImage.cid}
          jobTitle={selectedImage.title}
        />
      )}
    </div>
  )
}

