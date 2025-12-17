'use client'

import { useState, useEffect, useRef } from 'react'
import { useAccount, usePublicClient } from 'wagmi'
import { Portfolio, fetchPortfolioByProfileId } from '@/lib/portfolioFetcher'
import { JOB_POOL_ADDRESS, JOB_POOL_ABI, JobStatus } from '@/lib/jobPoolContract'
import { PORTFOLIO_CONTRACT_ADDRESS } from '@/lib/portfolioContract'
import { uploadToIPFS as uploadFilebaseToIPFS } from '@/frontend/uploadToIPFS'
import { usePortfolioContract } from '@/hooks/usePortfolioContract'

interface PortfolioDetailProps {
  profileId: string
  onBack: () => void
}

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

export function PortfolioDetail({ profileId, onBack }: PortfolioDetailProps) {
  const publicClient = usePublicClient()
  const { address, isConnected } = useAccount()
  const { addProfileImages, isPending: isAddingImages, isConfirmed: imagesConfirmed, txHash: imagesTxHash } = usePortfolioContract()
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [completedJobs, setCompletedJobs] = useState<CompletedJob[]>([])
  const [loadingJobs, setLoadingJobs] = useState(false)
  const [isOwner, setIsOwner] = useState(false)
  const [imageUploadLoading, setImageUploadLoading] = useState(false)
  const [imageUploadError, setImageUploadError] = useState<string | null>(null)
  const [imageUploadSuccess, setImageUploadSuccess] = useState<string | null>(null)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const addImagesRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [showAddImagesModal, setShowAddImagesModal] = useState(false)

  useEffect(() => {
    loadPortfolio()
  }, [profileId])

  // Determine ownership (creatorAddress match or contract mapping)
  useEffect(() => {
    const checkOwner = async () => {
      if (!portfolio || !address) {
        setIsOwner(false)
        return
      }

      const sameId = (a?: string | null, b?: string | null) => {
        if (!a || !b) return false
        const na = a.toLowerCase().replace(/^0x/, '')
        const nb = b.toLowerCase().replace(/^0x/, '')
        return na === nb
      }

      // Basic check: creator address matches
      if (portfolio.creatorAddress && portfolio.creatorAddress.toLowerCase() === address.toLowerCase()) {
        setIsOwner(true)
        return
      }

      // Fallback: read userPortfolioAtoms from contract
      try {
        if (publicClient && PORTFOLIO_CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000') {
          const USER_PORTFOLIO_ABI = [
            {
              name: 'userPortfolioAtoms',
              type: 'function',
              stateMutability: 'view',
              inputs: [{ name: '', type: 'address' }],
              outputs: [{ name: '', type: 'bytes32' }],
            },
          ] as const

          const profileFromContract = await publicClient.readContract({
            address: PORTFOLIO_CONTRACT_ADDRESS,
            abi: USER_PORTFOLIO_ABI,
            functionName: 'userPortfolioAtoms',
            args: [address as `0x${string}`],
          }) as `0x${string}`

          const normalizedFromContract = (profileFromContract || '').toLowerCase()
          const normalizedProfile = (portfolio.profileId || '').toLowerCase()

          if (
            normalizedFromContract &&
            normalizedFromContract !== '0x0000000000000000000000000000000000000000000000000000000000000000' &&
            sameId(normalizedFromContract, normalizedProfile)
          ) {
            setIsOwner(true)
            return
          }
        }
      } catch (err) {
        console.warn('[PortfolioDetail] Owner check failed:', err)
      }

      setIsOwner(false)
    }

    checkOwner()
  }, [portfolio, address, publicClient])

  useEffect(() => {
    if (portfolio?.creatorAddress) {
      loadCompletedJobs(portfolio.creatorAddress)
    }
  }, [portfolio?.creatorAddress, publicClient])

  // Watch for image upload transaction confirmation
  useEffect(() => {
    const handleImageUploadConfirmation = async () => {
      if (imagesConfirmed && imagesTxHash && imageUploadLoading) {
        try {
          console.log('[INFO] Image upload transaction confirmed:', imagesTxHash)
          setImageUploadSuccess('Images added successfully! Refreshing portfolio...')
          
          // Clear files and close modal
          setPendingFiles([])
          if (fileInputRef.current) {
            fileInputRef.current.value = ''
          }
          setShowAddImagesModal(false)

          // Wait a moment for indexing, then reload portfolio
          await new Promise(resolve => setTimeout(resolve, 2000))
          
          const refreshed = await fetchPortfolioByProfileId(profileId, undefined, publicClient || undefined)
          if (refreshed) {
            setPortfolio(refreshed)
            setImageUploadSuccess('Portfolio updated with new images!')
          } else {
            setImageUploadSuccess('Images added! Portfolio will refresh shortly (indexing may take a few moments).')
          }
        } catch (err) {
          console.error('[ERROR] Error handling image upload confirmation:', err)
          setImageUploadError('Images added but failed to refresh portfolio. Please refresh the page.')
        } finally {
          setImageUploadLoading(false)
        }
      }
    }

    handleImageUploadConfirmation()
  }, [imagesConfirmed, imagesTxHash, imageUploadLoading, profileId, publicClient])

  const loadPortfolio = async () => {
    setLoading(true)
    setError(null)
    try {
      console.log('[PortfolioDetail] Loading portfolio with profileId:', profileId)
      const data = await fetchPortfolioByProfileId(profileId, undefined, publicClient || undefined)
      if (data) {
        console.log('[PortfolioDetail] Portfolio loaded successfully:', data.profileId)
        setPortfolio(data)
      } else {
        console.error('[PortfolioDetail] Portfolio not found for profileId:', profileId)
        setError(`Portfolio not found. The portfolio may not be indexed yet (wait 2-5 minutes after creation), or the profile ID may be incorrect. Profile ID: ${profileId.slice(0, 20)}...`)
      }
    } catch (err) {
      console.error('[PortfolioDetail] Error loading portfolio:', err)
      setError(`Failed to load portfolio: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  const formatAddress = (address: string) => {
    if (!address) return 'N/A'
    return address.slice(0, 6) + '...' + address.slice(-4)
  }

  const loadCompletedJobs = async (creatorAddress: string) => {
    if (!publicClient || !creatorAddress) return
    
    setLoadingJobs(true)
    try {
      const addressLower = creatorAddress.toLowerCase()
      const creatorCompletedJobsKey = `creator_completed_jobs_${addressLower}`
      
      // Get list of completed job IDs from localStorage
      let jobIds = JSON.parse(localStorage.getItem(creatorCompletedJobsKey) || '[]')
      
      // Also search for all completed_job keys as fallback
      const allKeys: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith(`completed_job_`) && key.includes(addressLower)) {
          const jobIdMatch = key.match(/completed_job_(\d+)_/)
          if (jobIdMatch) {
            const jobId = jobIdMatch[1]
            if (!jobIds.find((j: any) => j.jobId === jobId)) {
              jobIds.push({ jobId })
            }
          }
          allKeys.push(key)
        }
      }

      // Load each completed job's data
      const jobs: CompletedJob[] = []
      for (const jobEntry of jobIds) {
        const jobId = typeof jobEntry === 'string' ? jobEntry : jobEntry.jobId
        const jobKey = `completed_job_${jobId}_${addressLower}`
        const jobData = localStorage.getItem(jobKey)
        
        if (jobData) {
          try {
            const parsed = JSON.parse(jobData)
            if (parsed.fullResCID) {
              jobs.push(parsed)
            }
          } catch (e) {
            console.error('Error parsing job data:', e)
          }
        }
      }

      // If no jobs found in localStorage, try to recover from contract
      if (jobs.length === 0) {
        try {
          const jobCount = await publicClient.readContract({
            address: JOB_POOL_ADDRESS as `0x${string}`,
            abi: JOB_POOL_ABI,
            functionName: 'jobCount',
          }) as bigint

          const totalJobs = Number(jobCount)
          const recoveredJobs: CompletedJob[] = []
          
          for (let i = 1; i <= totalJobs; i++) {
            try {
              const jobData = await publicClient.readContract({
                address: JOB_POOL_ADDRESS as `0x${string}`,
                abi: JOB_POOL_ABI,
                functionName: 'jobs',
                args: [BigInt(i)],
              }) as any
              
              const creator = (jobData[0] as string).toLowerCase()
              const status = jobData[3] as number
              
              if (creator === addressLower && status === JobStatus.Completed) {
                const jobKey = `completed_job_${i}_${addressLower}`
                const existing = localStorage.getItem(jobKey)
                
                if (existing) {
                  const parsed = JSON.parse(existing)
                  if (parsed.fullResCID) {
                    recoveredJobs.push(parsed)
                  }
                }
              }
            } catch (err) {
              continue
            }
          }
          
          setCompletedJobs(recoveredJobs)
        } catch (err) {
          console.error('Error recovering jobs from contract:', err)
        }
      } else {
        setCompletedJobs(jobs)
      }
    } catch (err) {
      console.error('Error loading completed jobs:', err)
    } finally {
      setLoadingJobs(false)
    }
  }

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setPendingFiles(Array.from(e.target.files))
      setImageUploadError(null)
      setImageUploadSuccess(null)
    }
  }

  const uploadImagesToPortfolio = async (files?: File[]) => {
    if (!portfolio) return
    if (!isConnected || !address) {
      setImageUploadError('Please connect your wallet')
      return
    }
    if (!isOwner) {
      // Proceed but warn if ownership not verified (contract itself enforces permissions if any)
      setImageUploadError('Ownership could not be verified. Proceeding to upload.')
    }

    const selected = files && files.length > 0 ? files : pendingFiles
    if (selected.length === 0) {
      setImageUploadError('Please select at least one image')
      return
    }

    setImageUploadLoading(true)
    setImageUploadError(null)
    setImageUploadSuccess(null)

    try {
      const hashes: string[] = []
      console.log('[INFO] Uploading', selected.length, 'images to DataBass/Filebase...')
      
      for (let i = 0; i < selected.length; i++) {
        const file = selected[i]
        console.log(`[INFO] Uploading image ${i + 1}/${selected.length}:`, file.name, `(${(file.size / 1024).toFixed(2)} KB)`)
        
        const uploadRes = await uploadFilebaseToIPFS(file, {
          uploader: address,
          type: 'portfolio-showcase',
        })
        
        // Extract CID - remove ipfs:// prefix if present, and any leading/trailing whitespace
        let cid = uploadRes.cid.replace(/^ipfs:\/\//, '').replace(/^\/ipfs\//, '').trim()
        
        // Validate CID format (basic check - should be alphanumeric with some special chars)
        if (!cid || cid.length === 0) {
          throw new Error(`Failed to get CID for image ${i + 1}`)
        }
        if (cid.length > 200) {
          throw new Error(`CID for image ${i + 1} is too long (${cid.length} chars, max 200)`)
        }
        
        console.log(`[INFO] Image ${i + 1} uploaded successfully. CID: ${cid}`)
        hashes.push(cid)
      }

      console.log('[INFO] All images uploaded. CIDs:', hashes)
      console.log('[INFO] Calling addProfileImages with profileId:', portfolio.profileId)
      
      // Check when portfolio was created to determine if we should wait
      let portfolioAgeMinutes = Infinity
      if (portfolio.createdAt) {
        try {
          const createdAt = new Date(portfolio.createdAt)
          const now = new Date()
          portfolioAgeMinutes = (now.getTime() - createdAt.getTime()) / (1000 * 60)
          console.log(`[INFO] Portfolio age: ${portfolioAgeMinutes.toFixed(1)} minutes`)
          
          if (portfolioAgeMinutes < 20) {
            console.warn(`[WARN] Portfolio was created only ${portfolioAgeMinutes.toFixed(1)} minutes ago.`)
            console.warn('[WARN] MultiVault may not have indexed the atoms yet. Consider waiting longer.')
            setImageUploadSuccess(`Portfolio created ${portfolioAgeMinutes.toFixed(0)} minutes ago. MultiVault may need more time to index...`)
          }
        } catch (dateErr) {
          console.warn('[WARN] Could not parse portfolio creation date:', dateErr)
        }
      }
      
      // Try the transaction with retry logic
      let result = await addProfileImages(portfolio.profileId as `0x${string}`, hashes)
      
      // If it fails with the MultiVault error, wait and retry once
      if (!result.success && result.error?.includes('0x7b0a37cf')) {
        console.warn('[WARN] First attempt failed with MultiVault error. Waiting 10 seconds and retrying...')
        setImageUploadSuccess('First attempt failed. Waiting 10 seconds for MultiVault to index atoms and retrying...')
        
        await new Promise(resolve => setTimeout(resolve, 10000))
        
        result = await addProfileImages(portfolio.profileId as `0x${string}`, hashes)
        
        // If it still fails after retry, provide specific guidance
        if (!result.success && result.error?.includes('0x7b0a37cf')) {
          if (portfolioAgeMinutes < 20) {
            throw new Error(
              `❌ MultiVault Error: Profile atom not available for triple creation.\n\n` +
              `Your portfolio was created ${portfolioAgeMinutes.toFixed(0)} minutes ago.\n\n` +
              `MultiVault needs at least 20 minutes to index atoms before they can be used in triples.\n\n` +
              `✅ Please wait ${Math.ceil(20 - portfolioAgeMinutes)} more minutes and try again.\n\n` +
              `The portfolio exists in GraphQL, but MultiVault's on-chain state hasn't caught up yet.`
            )
          } else {
            throw new Error(
              result.error || 'Failed to add images on-chain. The profile atom may not exist in MultiVault. Please verify your portfolio was created successfully.'
            )
          }
        }
      }
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to add images on-chain')
      }

      // Transaction submitted successfully - wait for confirmation
      setImageUploadSuccess('Transaction submitted! Waiting for confirmation...')
      
      // Don't close modal or clear files yet - wait for confirmation
    } catch (err: any) {
      setImageUploadError(err?.message || 'Failed to add images')
    } finally {
      setImageUploadLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-8 py-12">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-8">
            <div className="h-24 bg-gray-200 rounded mb-6"></div>
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        </div>
      </div>
    )
  }

  if (error || !portfolio) {
    return (
      <div className="space-y-8 py-12">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors mb-6"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Portfolios
        </button>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-8 text-center">
          <p className="text-red-600">{error || 'Portfolio not found'}</p>
        </div>
      </div>
    )
  }

  // Debug: Log portfolio data structure
  console.log('[PortfolioDetail] Portfolio data:', {
    profileId: portfolio.profileId,
    hasProfileData: !!portfolio.profileData,
    profileDataKeys: portfolio.profileData ? Object.keys(portfolio.profileData) : [],
    skillsCount: portfolio.skills.length,
    tagsCount: portfolio.tags.length,
    socialsCount: portfolio.socials.length,
    achievementsCount: portfolio.achievements.length,
    projectsCount: portfolio.projects.length,
    showcaseImagesCount: portfolio.showcaseImages?.length || 0,
    showcaseImages: portfolio.showcaseImages,
    skills: portfolio.skills,
    tags: portfolio.tags,
    socials: portfolio.socials,
    achievements: portfolio.achievements,
    projects: portfolio.projects,
  })

  const handlePlusClick = () => {
    setImageUploadError(null)
    setImageUploadSuccess(null)
    setPendingFiles([])
    setShowAddImagesModal(true)
  }

  const handlePlusFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files)
      setPendingFiles(files)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-16">
      <div className="max-w-3xl mx-auto px-6">
        {/* Top Bar */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-gray-500 hover:text-gray-900 text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>

          {/* Add Images quick action */}
          <button
            onClick={handlePlusClick}
            disabled={imageUploadLoading}
            className="flex items-center gap-2 px-3 py-2 rounded-full border border-gray-200 bg-white shadow-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            title={isOwner ? 'Add images to your portfolio' : 'Connect owner wallet to add images'}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v12m6-6H6" />
            </svg>
            <span className="text-xs font-medium">Add Images</span>
          </button>
        </div>

        {/* Container with rounded edges */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 md:p-16">
          {/* Upload status messages */}
          {(imageUploadError || imageUploadSuccess) && (
            <div className="mb-6">
              {imageUploadError && (
                <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded">
                  {imageUploadError}
                </div>
              )}
              {imageUploadSuccess && (
                <div className="p-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded mt-2">
                  {imageUploadSuccess}
                </div>
              )}
            </div>
          )}

          {/* Atom ID Reference */}
          <div className="mb-10 pb-8 border-b border-gray-200">
            <div className="text-xs text-gray-500 font-mono">
              <span>Atom ID: <span className="text-gray-900">{portfolio.profileId}</span></span>
            </div>
          </div>

        {/* Header */}
        <div className="mb-16">
          <div className="flex items-start gap-6 mb-6">
            {portfolio.profileData.profilePicture ? (
              <img
                src={portfolio.profileData.profilePicture}
                alt={portfolio.profileData.name || 'Profile'}
                className="w-24 h-24 rounded object-cover"
              />
            ) : (
              <div className="w-24 h-24 rounded bg-gray-100 flex items-center justify-center">
                <span className="text-gray-400 text-3xl font-medium">
                  {portfolio.profileData.name?.[0]?.toUpperCase() || '?'}
                </span>
              </div>
            )}
            <div className="flex-1">
              <h1 className="text-4xl font-bold text-gray-900 mb-2">
                {portfolio.profileData.name || formatAddress(portfolio.creatorAddress)}
              </h1>
              {portfolio.profileData.bio && (
                <p className="text-gray-600 leading-relaxed">
                  {portfolio.profileData.bio}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Content Sections */}
        <div className="space-y-14">
          {/* Skills Section */}
          {portfolio.skills.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-6">Skills</h2>
              <div className="flex flex-wrap gap-2">
                {portfolio.skills.map((skill, index) => (
                  <span
                    key={index}
                    className="px-3 py-1.5 bg-gray-100 text-gray-900 text-sm rounded"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Tags Section */}
          {portfolio.tags.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-6">Tags</h2>
              <div className="flex flex-wrap gap-2">
                {portfolio.tags.map((tag, index) => (
                  <span
                    key={index}
                    className="px-3 py-1.5 bg-gray-100 text-gray-900 text-sm rounded"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Social Media Section */}
          {portfolio.socials.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-6">Social Media</h2>
              <div className="space-y-3">
                {portfolio.socials.map((social, index) => {
                  const platform = social.platform.toLowerCase()
                  const url = social.url
                  
                  // Extract username from URL
                  let username = url
                  if (platform.includes('github')) {
                    username = url.replace(/^https?:\/\/(www\.)?github\.com\//i, '').replace(/\/$/, '')
                  } else if (platform.includes('twitter') || platform.includes('x.com')) {
                    username = url.replace(/^https?:\/\/(www\.)?(twitter\.com|x\.com)\//i, '').replace(/\/$/, '').replace('@', '')
                  } else if (platform.includes('behance')) {
                    username = url.replace(/^https?:\/\/(www\.)?behance\.net\//i, '').replace(/\/$/, '')
                  } else if (platform.includes('dribbble')) {
                    username = url.replace(/^https?:\/\/(www\.)?dribbble\.com\//i, '').replace(/\/$/, '')
                  } else {
                    // For other platforms, try to extract a username or show the domain
                    const match = url.match(/\/([^\/]+)\/?$/)
                    username = match ? match[1] : url
                  }
                  
                  // Get icon and color based on platform
                  const getPlatformIcon = () => {
                    if (platform.includes('github')) {
                      return {
                        icon: (
                          <svg className="w-5 h-5 text-gray-900" fill="currentColor" viewBox="0 0 24 24">
                            <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd"/>
                          </svg>
                        ),
                        href: `https://github.com/${username}`
                      }
                    } else if (platform.includes('twitter') || platform.includes('x.com')) {
                      return {
                        icon: (
                          <svg className="w-5 h-5 text-[#1DA1F2]" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2c9 5 20 0 20-11.5a4.5 4.5 0 00-.08-.83A7.72 7.72 0 0023 3z"/>
                          </svg>
                        ),
                        href: `https://twitter.com/${username}`
                      }
                    } else if (platform.includes('behance')) {
                      return {
                        icon: (
                          <svg className="w-5 h-5 text-[#1769FF]" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M22 7h-7v-2h7v2zm1.726 10c-.442 1.297-2.029 3-5.101 3-3.074 0-5.564-1.729-5.564-5.675 0-3.91 2.325-5.92 5.466-5.92 3.082 0 4.964 1.782 5.375 4.426.078.506.109 1.188.095 2.14h-8.027c.13 3.211 3.483 3.312 4.925 2.059.3-.504.473-1.115.473-1.823h4.915zm-7.688-6.5c0-2.266-1.329-3.5-3.01-3.5-1.673 0-3.01 1.234-3.01 3.5 0 2.266 1.337 3.5 3.01 3.5 1.681 0 3.01-1.234 3.01-3.5zM5.526 6.5c-.552 0-1 .45-1 1s.448 1 1 1 1-.45 1-1-.448-1-1-1zm-2.776 1.5h5.599c.551 0 .999.45.999 1v11h-2.827v-4.333H1.854v4.333H0V9c0-.55.448-1 .999-1zm16.75 5.75c0 .553-.448 1-1 1h-4.001c.551 0 .999.45.999 1 0 .553-.448 1-.999 1h-2.001c-.551 0-.999-.447-.999-1v-5c0-.553.448-1 .999-1h5.002c.551 0 .999.447.999 1v3z"/>
                          </svg>
                        ),
                        href: `https://behance.net/${username}`
                      }
                    } else if (platform.includes('dribbble')) {
                      return {
                        icon: (
                          <svg className="w-5 h-5 text-[#EA4C89]" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 24C5.385 24 0 18.615 0 12S5.385 0 12 0s12 5.385 12 12-5.385 12-12 12zm10.12-10.358c-.35-.11-3.17-.953-6.384-.438 1.34 3.684 1.887 6.684 1.992 7.308 2.3-1.555 3.936-4.02 4.395-6.87zm-6.115 7.808c-.153-.9-.75-4.032-2.19-7.77l-.066.02c-5.79 2.015-7.86 6.025-8.003 6.4 1.23.66 2.80 1.048 4.435 1.048 1.485 0 2.93-.256 4.212-.68zm-9.96-5.09c.232-.4 3.045-5.055 8.332-6.765.135-.045.27-.084.405-.12-.26-.585-.54-1.167-.832-1.72C7.17 11.775 2.206 11.71 1.756 11.7l-.004.312c0 2.633.998 5.037 2.634 6.855zm-2.42-8.955c.232.4 3.045 5.055 8.332 6.765.135.045.27.084.405.12.26-.585.54-1.167.832-1.72-6.155-2.83-10.867-2.88-11.569-2.88zm11.774 2.953c-3.225-.516-6.03.325-6.414.438a10.12 10.12 0 0 1 4.395-6.87c.105.624.652 3.684 2.02 7.308zm-5.84 2.55c.232-.4 3.045-5.055 8.332-6.765.135-.045.27-.084.405-.12-.26-.585-.54-1.167-.832-1.72-6.155 2.83-10.867 2.88-11.569 2.88l.004-.312c0-1.633.998-3.037 2.634-4.855z"/>
                          </svg>
                        ),
                        href: `https://dribbble.com/${username}`
                      }
                    } else {
                      // Generic icon for other platforms
                      return {
                        icon: (
                          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                          </svg>
                        ),
                        href: url
                      }
                    }
                  }
                  
                  const platformData = getPlatformIcon()
                  
                  return (
                    <a
                      key={index}
                      href={platformData.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200 hover:border-primary hover:shadow-md transition-all group"
                    >
                      {platformData.icon}
                      <span className="text-base font-medium text-gray-900 group-hover:text-primary transition-colors">
                        {username}
                      </span>
                    </a>
                  )
                })}
              </div>
            </section>
          )}

          {/* Achievements Section */}
          {portfolio.achievements.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-6">Achievements</h2>
              <div className="space-y-3">
                {portfolio.achievements.map((achievement, index) => {
                  const achievementText = typeof achievement === 'string' ? achievement : achievement.text || ''
                  const achievementLink = typeof achievement === 'object' ? achievement.link : undefined
                  
                  return (
                    <div key={index} className="flex items-start gap-3">
                      <span className="text-primary mt-1">-</span>
                      <div className="flex-1">
                        <p className="text-gray-900">{achievementText}</p>
                        {achievementLink && (
                          <a
                            href={achievementLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline mt-1 inline-block"
                          >
                            View link
                          </a>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* Projects Section */}
          {portfolio.projects.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-6">Projects</h2>
              <div className="space-y-6">
                {portfolio.projects.map((project, index) => {
                  const projectImage = (project as any).image || undefined
                  const projectLink = (project as any).externalLink || undefined
                  
                  return (
                    <div key={index} className="space-y-3">
                      {projectImage && (
                        <img
                          src={projectImage}
                          alt={project.title || 'Project'}
                          className="w-full h-48 object-cover rounded"
                        />
                      )}
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-1">
                          {project.title}
                        </h3>
                        {project.description && (
                          <p className="text-gray-600 text-sm leading-relaxed mb-2">{project.description}</p>
                        )}
                        <div className="flex items-center gap-3 flex-wrap">
                          {project.category && (
                            <span className="text-xs text-gray-500">{project.category}</span>
                          )}
                          {projectLink && (
                            <a
                              href={projectLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-primary hover:underline"
                            >
                              View project
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* Showcase Images Section */}
          {portfolio.showcaseImages && portfolio.showcaseImages.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-6">Showcase</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {portfolio.showcaseImages.map((cid, index) => {
                  const cleanCid = cid.replace(/^ipfs:\/\//, '').replace(/^\/ipfs\//, '').replace(/^\/+/, '')
                  const imageUrl = `/api/ipfs/filebase/image-fullres?cid=${encodeURIComponent(cleanCid)}&t=${Date.now()}`
                  
                  console.log('[PortfolioDetail] Rendering showcase image:', { index, cid, cleanCid, imageUrl })
                  
                  return (
                    <div
                      key={index}
                      className="relative group cursor-pointer"
                      onClick={() => window.open(imageUrl, '_blank')}
                    >
                      <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                        <img
                          src={imageUrl}
                          alt={`Showcase ${index + 1}`}
                          className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
                          onLoad={() => {
                            console.log('[PortfolioDetail] Showcase image loaded successfully:', cleanCid)
                          }}
                          onError={(e) => {
                            console.error('[PortfolioDetail] Showcase image failed to load:', { cid, cleanCid, imageUrl })
                            // Fallback if image fails to load
                            const target = e.target as HTMLImageElement
                            target.style.display = 'none'
                            const parent = target.parentElement
                            if (parent) {
                              parent.innerHTML = `
                                <div class="w-full h-full flex items-center justify-center text-gray-400">
                                  <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                  </svg>
                                </div>
                              `
                            }
                          }}
                        />
                      </div>
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-all rounded-lg flex items-center justify-center">
                        <svg className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* Add Images section removed; handled by top-right plus button */}

          {/* Completed Jobs Section */}
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-6">Completed Jobs</h2>
            {loadingJobs ? (
              <div className="text-center py-8 text-gray-500 text-sm">
                Loading completed jobs...
              </div>
            ) : completedJobs.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm">
                No completed jobs yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {completedJobs.map((job) => {
                  const imageCid = job.fullResCID
                  const cleanCid = imageCid.replace(/^ipfs:\/\//, '').replace(/^\/ipfs\//, '').replace(/^\/+/, '')
                  const imageUrl = `/api/ipfs/filebase/image-fullres?cid=${encodeURIComponent(cleanCid)}&t=${Date.now()}`
                  
                  return (
                    <div key={job.jobId} className="bg-gray-50 rounded-xl p-4 hover:shadow-lg transition-shadow">
                      <div className="mb-4">
                        <img
                          src={imageUrl}
                          alt={job.title || `Job #${job.jobId}`}
                          className="w-full h-48 object-cover rounded-lg cursor-pointer"
                          onClick={() => window.open(imageUrl, '_blank')}
                        />
                        <p className="text-xs text-green-600 mt-2 text-center">
                          High resolution
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
          </section>

          {/* Empty State */}
          {portfolio.skills.length === 0 && 
           portfolio.tags.length === 0 && 
           portfolio.socials.length === 0 && 
           portfolio.achievements.length === 0 && 
           portfolio.projects.length === 0 && (
            <div className="text-center py-12 text-gray-500 text-sm">
              <p>No additional information available.</p>
            </div>
          )}
        </div>
        </div>
      </div>

      {/* Add Images Modal */}
      {showAddImagesModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Add Images</h3>
              <button
                onClick={() => {
                  if (imageUploadLoading || isAddingImages) return // Don't allow closing during upload/transaction
                  setShowAddImagesModal(false)
                  setPendingFiles([])
                  setImageUploadError(null)
                  setImageUploadSuccess(null)
                  if (fileInputRef.current) fileInputRef.current.value = ''
                }}
                disabled={imageUploadLoading || isAddingImages}
                className="text-gray-500 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {imageUploadError && (
              <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded">
                {imageUploadError}
              </div>
            )}
            {imageUploadSuccess && (
              <div className="p-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded">
                {imageUploadSuccess}
              </div>
            )}

            <div className="space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handlePlusFileChange}
                className="block w-full text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-[#0052CC]"
              />
              {pendingFiles.length > 0 && (
                <div className="text-xs text-gray-600">
                  Selected {pendingFiles.length} image{pendingFiles.length > 1 ? 's' : ''}
                </div>
              )}
            </div>

            {pendingFiles.length > 0 && (
              <ul className="max-h-40 overflow-y-auto text-sm text-gray-700 space-y-1 border border-gray-100 rounded-lg p-3 bg-gray-50">
                {pendingFiles.map((file, idx) => (
                  <li key={idx} className="flex items-center justify-between">
                    <span className="truncate">{file.name}</span>
                    <button
                      onClick={() => {
                        const next = [...pendingFiles]
                        next.splice(idx, 1)
                        setPendingFiles(next)
                      }}
                      className="text-red-500 hover:text-red-700 text-xs"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => {
                  if (imageUploadLoading || isAddingImages) return // Don't allow closing during upload/transaction
                  setShowAddImagesModal(false)
                  setPendingFiles([])
                  setImageUploadError(null)
                  setImageUploadSuccess(null)
                  if (fileInputRef.current) fileInputRef.current.value = ''
                }}
                disabled={imageUploadLoading || isAddingImages}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={() => uploadImagesToPortfolio(pendingFiles)}
                disabled={imageUploadLoading || isAddingImages || pendingFiles.length === 0}
                className="px-4 py-2 bg-primary text-white rounded-md text-sm font-medium hover:bg-[#0052CC] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {imageUploadLoading && !isAddingImages
                  ? 'Uploading to IPFS...'
                  : isAddingImages && !imagesConfirmed
                  ? imagesTxHash
                    ? 'Confirming transaction...'
                    : 'Waiting for wallet...'
                  : imagesConfirmed
                  ? 'Success!'
                  : 'Upload & Save'}
              </button>
            </div>

            <p className="text-xs text-gray-500">
              Images upload to DataBass/Filebase; their CIDs are stored on-chain in a single transaction.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

