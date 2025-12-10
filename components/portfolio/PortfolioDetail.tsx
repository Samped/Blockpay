'use client'

import { useState, useEffect } from 'react'
import { usePublicClient } from 'wagmi'
import { Portfolio, fetchPortfolioByProfileId } from '@/lib/portfolioFetcher'
import { JOB_POOL_ADDRESS, JOB_POOL_ABI, JobStatus } from '@/lib/jobPoolContract'

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
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [completedJobs, setCompletedJobs] = useState<CompletedJob[]>([])
  const [loadingJobs, setLoadingJobs] = useState(false)

  useEffect(() => {
    loadPortfolio()
  }, [profileId])

  useEffect(() => {
    if (portfolio?.creatorAddress) {
      loadCompletedJobs(portfolio.creatorAddress)
    }
  }, [portfolio?.creatorAddress, publicClient])

  const loadPortfolio = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchPortfolioByProfileId(profileId)
      if (data) {
        setPortfolio(data)
      } else {
        setError('Portfolio not found')
      }
    } catch (err) {
      console.error('Error loading portfolio:', err)
      setError('Failed to load portfolio')
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
    skills: portfolio.skills,
    tags: portfolio.tags,
    socials: portfolio.socials,
    achievements: portfolio.achievements,
    projects: portfolio.projects,
  })

  return (
    <div className="min-h-screen bg-gray-50 py-16">
      <div className="max-w-3xl mx-auto px-6">
        {/* Back Button */}
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-900 mb-8 text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        {/* Container with rounded edges */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 md:p-16">
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
                      <span className="text-primary mt-1">•</span>
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
                              View project →
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
                          ✓ High resolution
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
    </div>
  )
}

