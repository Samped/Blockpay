'use client'

import { useState, useEffect, useMemo } from 'react'
import { useJobPool } from '@/hooks/useJobPool'
import { Job, JobStatus, formatTrustAmount } from '@/lib/jobPoolContract'
import { JobDetail } from './JobDetail'

interface JobListProps {
  onCreateJob?: () => void
  refreshRef?: React.MutableRefObject<() => void>
}

export function JobList({ onCreateJob, refreshRef }: JobListProps) {
  const { jobCount, getJob, publicClient } = useJobPool()
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedJobId, setSelectedJobId] = useState<bigint | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<JobStatus | 'all'>('all')
  const [failedJobIds, setFailedJobIds] = useState<bigint[]>([])
  const [retryingJobs, setRetryingJobs] = useState<Set<bigint>>(new Set())

  // Refresh when jobCount changes or manually triggered
  useEffect(() => {
    if (jobCount !== undefined) {
      loadJobs()
    }
  }, [jobCount, refreshKey])
  
  // Add missing dependency warning fix
  // eslint-disable-next-line react-hooks/exhaustive-deps

  async function loadJobs() {
    console.log('Loading jobs, jobCount:', jobCount?.toString())
    
    if (jobCount === undefined) {
      console.log('JobCount is undefined, waiting for it to load...')
      setLoading(false)
      return // Don't clear jobs if jobCount is just not loaded yet
    }
    
    if (jobCount === 0n) {
      console.log('No jobs found (jobCount is 0)')
      setLoading(false)
      setJobs([])
      return
    }

    try {
      setLoading(true)
      console.log(`Loading ${jobCount.toString()} jobs...`)
      
      const jobPromises: Array<Promise<{ jobId: bigint; job: Job | null }>> = []
      
      // Helper function to get a job with retry logic for jobs that have atomIds
      const getJobWithRetry = async (jobId: bigint, hasAtomId: boolean, timeoutMs = 5000): Promise<Job | null> => {
        const maxRetries = hasAtomId ? 3 : 1 // Retry up to 3 times if atomId exists
        
        for (let attempt = 0; attempt < maxRetries; attempt++) {
          try {
            // Create a timeout promise
            const timeoutPromise = new Promise<null>((resolve) => {
              setTimeout(() => resolve(null), timeoutMs)
            })
            
            // Race between getting the job and timeout
            const jobPromise = getJob(jobId)
            const result = await Promise.race([jobPromise, timeoutPromise])
            
            if (result) {
              // If result has zero address creator (not fully loaded), try again or return null
              if (result.creator === '0x0000000000000000000000000000000000000000') {
                console.log(`Job ${jobId.toString()} has zero address creator, will be filtered out`)
                // Try one more time if we have retries left
                if (attempt < maxRetries - 1 && hasAtomId) {
                  console.log(`Retrying job ${jobId.toString()} (attempt ${attempt + 2}/${maxRetries})...`)
                  await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)))
                  continue
                }
                return null // Filter out jobs that aren't fully loaded
              }
              return result
            } else {
              // If timeout and we have retries left, try again
              if (attempt < maxRetries - 1 && hasAtomId) {
                console.log(`Job ${jobId.toString()} timed out, retrying (attempt ${attempt + 2}/${maxRetries})...`)
                await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)))
                continue
              }
              console.warn(`Job ${jobId.toString()} fetch timed out after ${timeoutMs}ms (attempt ${attempt + 1}/${maxRetries})`)
              return null
            }
          } catch (err) {
            console.error(`Error fetching job ${jobId.toString()} (attempt ${attempt + 1}):`, err)
            if (attempt < maxRetries - 1 && hasAtomId) {
              await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)))
              continue
            }
            return null
          }
        }
        return null
      }
      
      // First, check all jobAtomIds in parallel to see which jobs exist
      // This helps us show jobs even if the struct fails to load
      const atomIdPromises: Array<Promise<{ jobId: bigint; atomId: `0x${string}` | null }>> = []
      if (publicClient) {
        for (let i = 1n; i <= jobCount; i++) {
          atomIdPromises.push(
            (async () => {
              try {
                const { JOB_POOL_ADDRESS, JOB_POOL_ABI } = await import('@/lib/jobPoolContract')
                const atomId = await publicClient.readContract({
                  address: JOB_POOL_ADDRESS as `0x${string}`,
                  abi: JOB_POOL_ABI,
                  functionName: 'jobAtomIds',
                  args: [i],
                }) as `0x${string}`
                return { 
                  jobId: i, 
                  atomId: atomId !== '0x0000000000000000000000000000000000000000000000000000000000000000' ? atomId : null 
                }
              } catch (err) {
                console.warn(`Could not check atomId for job ${i.toString()}:`, err)
                return { jobId: i, atomId: null }
              }
            })()
          )
        }
      }

      // Wait for atomId checks (with timeout)
      const atomIdResults = publicClient 
        ? await Promise.allSettled(atomIdPromises).then(results => 
            results.map((result, index) => 
              result.status === 'fulfilled' 
                ? result.value 
                : { jobId: BigInt(index + 1), atomId: null }
            )
          )
        : []

      // Load all jobs from 1 to jobCount with retry logic
      // Check which jobs have atomIds first to determine retry strategy
      const atomIdMap = new Map<bigint, `0x${string}` | null>()
      atomIdResults.forEach(({ jobId, atomId }) => {
        atomIdMap.set(jobId, atomId)
      })

      for (let i = 1n; i <= jobCount; i++) {
        const hasAtomId = !!atomIdMap.get(i)
        jobPromises.push(
          getJobWithRetry(i, hasAtomId, 5000).then(job => {
            if (job) {
              console.log(`Job ${i.toString()} loaded successfully`)
            } else {
              console.warn(`Job ${i.toString()} could not be loaded (timed out or not found)`)
            }
            return { jobId: i, job }
          }).catch(err => {
            console.error(`Error loading job ${i.toString()}:`, err)
            return { jobId: i, job: null }
          })
        )
      }

      // Wait for all jobs with a reasonable timeout
      const jobResults = await Promise.allSettled(jobPromises).then(results => {
        return results.map((result, index) => {
          if (result.status === 'fulfilled') {
            return result.value
          } else {
            console.error(`Job ${(index + 1).toString()} promise rejected:`, result.reason)
            return { jobId: BigInt(index + 1), job: null }
          }
        })
      })
      console.log(`Loaded ${jobResults.length} job results`)

      // Only include jobs that have fully loaded (no "Loading..." or "Indexing..." state)
      // Exclude jobs with zero address creators (not fully indexed)
      const validJobs = jobResults
        .filter(({ jobId, job }) => {
          // Only include if job loaded successfully and has valid creator
          if (job !== null && job.creator !== '0x0000000000000000000000000000000000000000') {
            return true
          }
          // Exclude jobs that failed to load or have zero address
          console.log(`Excluding job ${jobId.toString()} - not fully loaded (creator: ${job?.creator || 'null'})`)
          return false
        })
        .map(({ jobId, job }) => {
          const jobWithId = { ...job!, jobId } as Job & { jobId: bigint; title?: string; description?: string }
          // Ensure title is always set (fallback if metadata wasn't loaded)
          if (!jobWithId.title) {
            jobWithId.title = `Job #${jobId.toString()}`
          }
          return jobWithId
        })
      
      const failedJobs = jobResults.filter(({ job }) => job === null)
      if (failedJobs.length > 0) {
        const failedIds = failedJobs.map(({ jobId }) => jobId)
        setFailedJobIds(failedIds)
        console.warn(`${failedJobs.length} job(s) could not be loaded:`, failedIds.map(id => id.toString()))
        console.warn('   These jobs may not exist or are still being indexed. Try refreshing in a few moments.')
      } else {
        setFailedJobIds([])
      }
      
      console.log(`Found ${validJobs.length} valid jobs out of ${jobCount.toString()} total`)
      validJobs.forEach(job => {
        console.log(`  Job ${job.jobId.toString()}: title="${(job as any).title || 'NOT SET'}", creator="${job.creator.substring(0, 10)}..."`)
      })
      
      // Sort by job ID descending (newest first)
      validJobs.sort((a, b) => Number(b.jobId - a.jobId))
      
      // Only update jobs if we got at least some results, or if jobCount is 0
      // This prevents clearing jobs if a reload fails
      if (validJobs.length > 0 || jobCount === 0n) {
        setJobs(validJobs as any)
      } else {
        console.warn('No valid jobs found but jobCount > 0, keeping existing jobs to prevent data loss')
        // Don't clear jobs if reload failed - keep existing ones
      }

      // Note: Loading jobs are now filtered out, so no retry logic needed
    } catch (err) {
      console.error('Error loading jobs:', err)
    } finally {
      setLoading(false)
    }
  }

  // Expose refresh function for parent components
  const refresh = () => {
    setRefreshKey(prev => prev + 1)
  }

  // Expose refresh via ref
  useEffect(() => {
    if (refreshRef) {
      refreshRef.current = refresh
    }
    // Also store globally for JobCreateForm
    ;(window as any).__refreshJobList = refresh
  }, [refreshRef])

  // Filter jobs based on search and status
  const filteredJobs = useMemo(() => {
    return jobs.filter((job: any) => {
      // Status filter
      if (statusFilter !== 'all' && job.status !== statusFilter) {
        return false
      }
      
      // Search filter (search in job ID, creator address, or description if available)
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const jobId = job.jobId?.toString() || ''
        const creator = job.creator?.toLowerCase() || ''
        return jobId.includes(query) || creator.includes(query)
      }
      
      return true
    })
  }, [jobs, searchQuery, statusFilter])

  if (selectedJobId) {
    return (
      <JobDetail
        jobId={selectedJobId}
        onBack={() => setSelectedJobId(null)}
      />
    )
  }

  return (
    <div className="space-y-8 py-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div>
          <h1 className="text-4xl md:text-5xl font-bold mb-3 text-gray-900">
            Job Pool
          </h1>
          <p className="text-lg text-gray-600 font-light">
            Discover creative opportunities and showcase your talent
          </p>
          {jobCount !== undefined && (
            <p className="text-sm text-gray-500 mt-2">
              Total jobs: {jobCount.toString()} {loading && '(loading...)'}
            </p>
          )}
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setRefreshKey(prev => prev + 1)}
            className="p-2 border border-gray-300 rounded-full text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading}
            title="Refresh job list"
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
          {onCreateJob && (
            <button
              onClick={onCreateJob}
              className="px-6 py-3 text-sm font-semibold rounded-full bg-primary text-white hover:bg-[#0052CC] transition-all duration-200 shadow-soft"
            >
              + Create Job
            </button>
          )}
        </div>
      </div>

      {/* Search and Filter Bar */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <svg className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by job ID or creator address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as JobStatus | 'all')}
          className="px-6 py-3 border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white"
        >
          <option value="all">All Status</option>
          <option value={JobStatus.Active}>Active</option>
          <option value={JobStatus.Completed}>Completed</option>
          <option value={JobStatus.Cancelled}>Cancelled</option>
          <option value={JobStatus.Expired}>Expired</option>
        </select>
      </div>

      {/* Jobs Grid */}
      <div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="animate-pulse bg-white rounded-2xl border border-gray-100 p-6">
                <div className="h-6 bg-gray-200 rounded mb-4"></div>
                <div className="h-4 bg-gray-200 rounded mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              </div>
            ))}
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-gray-600 mb-6">
              {jobs.length === 0 
                ? 'No jobs at the moment. Check back soon!' 
                : 'No jobs match your search criteria.'}
            </p>
            {onCreateJob && jobs.length === 0 && (
              <button
                onClick={onCreateJob}
                className="inline-flex items-center px-6 py-3 text-sm font-semibold rounded-full bg-primary text-white hover:bg-[#0052CC] transition-all duration-200"
              >
                Post a Job
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredJobs.map((job: any) => {
              const jobId = job.jobId || jobs.indexOf(job) + 1
              const isActive = job.status === JobStatus.Active
              const deadlineDate = job.deadline && job.deadline > 0n 
                ? new Date(Number(job.deadline) * 1000) 
                : null
              const isExpired = deadlineDate ? deadlineDate < new Date() : false
              
              return (
                <div
                  key={jobId.toString()}
                  onClick={() => setSelectedJobId(BigInt(jobId))}
                  className="group relative bg-white rounded-2xl border border-gray-100 shadow-soft hover:shadow-card-hover transition-all duration-300 hover:-translate-y-1 overflow-hidden cursor-pointer"
                >
                  <div className="p-6">
                    {/* Job Name as Header */}
                    <div className="mb-4">
                      <h3 className="text-xl font-bold text-gray-900 group-hover:text-primary transition-colors mb-3 line-clamp-2">
                        {(job as any).title || 'Untitled Job'}
                      </h3>
                      {job.description && (
                        <p className="text-sm text-gray-600 mb-3 line-clamp-2 leading-relaxed">
                          {job.description}
                        </p>
                      )}
                    </div>
                    
                    {/* Status Badge */}
                    <div className="flex items-center gap-2 mb-4 flex-wrap">
                      {isExpired ? (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                          Expired
                        </span>
                      ) : isActive ? (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5"></span>
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                          {JobStatus[job.status] || 'Unknown'}
                        </span>
                      )}
                    </div>
                    
                    {/* Stats */}
                    <div className="flex items-center gap-6 pt-4 border-t border-gray-100 mb-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 font-medium">Budget</div>
                          <div className="text-sm font-bold text-gray-900">
                            {formatTrustAmount(job.payment || 0n)} TRUST
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center">
                          <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 font-medium">Submissions</div>
                          <div className="text-sm font-bold text-gray-900">
                            {job.hasSubmission ? '1' : '0'}
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Deadline */}
                    {deadlineDate && (
                      <div className="pt-4 border-t border-gray-100">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span className="font-medium">
                              {(() => {
                                const now = new Date()
                                const daysLeft = Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
                                
                                if (daysLeft < 0) {
                                  return `Expired ${Math.abs(daysLeft)} day${Math.abs(daysLeft) !== 1 ? 's' : ''} ago`
                                } else if (daysLeft === 0) {
                                  return 'Expires today'
                                } else if (daysLeft === 1) {
                                  return 'Expires tomorrow'
                                } else {
                                  return `Expires in ${daysLeft} days`
                                }
                              })()}
                            </span>
                          </div>
                          <span className="text-xs text-gray-400 font-medium">
                            {deadlineDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Hover indicator */}
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-primary to-purple-600 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left"></div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}


