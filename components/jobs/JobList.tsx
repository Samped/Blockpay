'use client'

import { useState, useEffect } from 'react'
import { useJobPool } from '@/hooks/useJobPool'
import { Job, JobStatus, formatTrustAmount } from '@/lib/jobPoolContract'
import { JobDetail } from './JobDetail'

interface JobListProps {
  onCreateJob?: () => void
}

export function JobList({ onCreateJob }: JobListProps) {
  const { jobCounter, getJob } = useJobPool()
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedJobId, setSelectedJobId] = useState<bigint | null>(null)

  useEffect(() => {
    loadJobs()
  }, [jobCounter])

  async function loadJobs() {
    if (!jobCounter || jobCounter === 0n) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const jobPromises: Promise<Job | null>[] = []
      
      // Load all jobs from 1 to jobCounter
      for (let i = 1n; i <= jobCounter; i++) {
        jobPromises.push(getJob(i))
      }

      const jobResults = await Promise.all(jobPromises)
      const validJobs = jobResults.filter(j => j !== null) as Job[]
      
      // Sort by creation date (newest first)
      validJobs.sort((a, b) => Number(b.createdAt) - Number(a.createdAt))
      
      setJobs(validJobs)
    } catch (err) {
      console.error('Error loading jobs:', err)
    } finally {
      setLoading(false)
    }
  }

  if (selectedJobId) {
    return (
      <JobDetail
        jobId={selectedJobId}
        onBack={() => setSelectedJobId(null)}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-card p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Job Pool</h2>
          {onCreateJob && (
            <button
              onClick={onCreateJob}
              className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-[#0052CC] transition-colors font-medium"
            >
              + Create Job
            </button>
          )}
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="h-20 bg-gray-200 rounded-lg"></div>
              </div>
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-12">
            <svg className="mx-auto h-16 w-16 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No jobs yet</h3>
            <p className="text-gray-600 mb-4">Be the first to create a job and start hiring creators!</p>
            {onCreateJob && (
              <button
                onClick={onCreateJob}
                className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-[#0052CC] transition-colors font-medium"
              >
                Create First Job
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {jobs.map((job) => (
              <div
                key={job.id.toString()}
                onClick={() => setSelectedJobId(job.id)}
                className="border border-gray-200 rounded-lg p-4 hover:border-primary hover:shadow-md transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      Job #{job.id.toString()}
                    </h3>
                    <p className="text-sm text-gray-600 font-mono mb-2">
                      {job.requestor.substring(0, 10)}...{job.requestor.substring(job.requestor.length - 8)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-primary mb-1">
                      {formatTrustAmount(job.budget)} TRUST
                    </p>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      job.status === JobStatus.Open ? 'bg-green-100 text-green-800' :
                      job.status === JobStatus.Approved ? 'bg-blue-100 text-blue-800' :
                      job.status === JobStatus.Cancelled ? 'bg-gray-100 text-gray-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {JobStatus[job.status]}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span>{job.submissionIds.length} submission{job.submissionIds.length !== 1 ? 's' : ''}</span>
                  <span>Created {new Date(Number(job.createdAt) * 1000).toLocaleDateString()}</span>
                  {job.deadline > 0n && (
                    <span>Deadline: {new Date(Number(job.deadline) * 1000).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}


