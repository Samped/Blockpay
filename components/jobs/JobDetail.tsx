'use client'

import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { useJobPool } from '@/hooks/useJobPool'
import { Job, Submission, JobStatus, SubmissionStatus, formatTrustAmount } from '@/lib/jobPoolContract'
import { getIPFSUrl } from '@/lib/ipfs'
import { SubmissionForm } from './SubmissionForm'

interface JobDetailProps {
  jobId: bigint
  onBack?: () => void
}

export function JobDetail({ jobId, onBack }: JobDetailProps) {
  const { address, isConnected } = useAccount()
  const { getJob, getSubmission, approveWork, cancelJob, isWriting, isConfirming } = useJobPool()
  
  const [job, setJob] = useState<Job | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [showSubmissionForm, setShowSubmissionForm] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

      // Load all submissions
      const submissionPromises = jobData.submissionIds.map(id => getSubmission(id))
      const submissionResults = await Promise.all(submissionPromises)
      setSubmissions(submissionResults.filter(s => s !== null) as Submission[])
    } catch (err: any) {
      console.error('Error loading job:', err)
      setError(err.message || 'Failed to load job')
    } finally {
      setLoading(false)
    }
  }

  async function handleApprove(submissionId: bigint) {
    if (!job) return

    try {
      const result = await approveWork(jobId, submissionId)
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

  const isRequestor = address?.toLowerCase() === job.requestor.toLowerCase()
  const isOpen = job.status === JobStatus.Open || job.status === JobStatus.Submitted
  const canSubmit = isConnected && !isRequestor && isOpen

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-card p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Job #{job.id.toString()}</h2>
            <div className="flex items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                job.status === JobStatus.Open ? 'bg-green-100 text-green-800' :
                job.status === JobStatus.Approved ? 'bg-blue-100 text-blue-800' :
                job.status === JobStatus.Cancelled ? 'bg-gray-100 text-gray-800' :
                'bg-yellow-100 text-yellow-800'
              }`}>
                {JobStatus[job.status]}
              </span>
              <span className="text-sm text-gray-600">
                Budget: {formatTrustAmount(job.budget)} TRUST
              </span>
            </div>
          </div>
          {onBack && (
            <button
              onClick={onBack}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              ← Back
            </button>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-1">Requestor</h3>
            <p className="text-sm text-gray-900 font-mono">{job.requestor}</p>
          </div>

          {job.deadline > 0n && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-1">Deadline</h3>
              <p className="text-sm text-gray-900">
                {new Date(Number(job.deadline) * 1000).toLocaleString()}
              </p>
            </div>
          )}

          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-1">Created</h3>
            <p className="text-sm text-gray-900">
              {new Date(Number(job.createdAt) * 1000).toLocaleString()}
            </p>
          </div>
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
      <div className="bg-white rounded-2xl shadow-card p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-semibold text-gray-900">
            Submissions ({submissions.length})
          </h3>
          {canSubmit && (
            <button
              onClick={() => setShowSubmissionForm(!showSubmissionForm)}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-[#0052CC] transition-colors text-sm font-medium"
            >
              {showSubmissionForm ? 'Cancel' : '+ Submit Work'}
            </button>
          )}
        </div>

        {showSubmissionForm && canSubmit && (
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

        {submissions.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>No submissions yet</p>
            {canSubmit && !showSubmissionForm && (
              <button
                onClick={() => setShowSubmissionForm(true)}
                className="mt-4 px-4 py-2 bg-primary text-white rounded-lg hover:bg-[#0052CC] transition-colors text-sm font-medium"
              >
                Be the first to submit
              </button>
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

                {submission.previewCID && (
                  <div className="mb-3">
                    <img
                      src={getIPFSUrl(submission.previewCID)}
                      alt="Submission preview"
                      className="max-w-full h-auto rounded-lg border border-gray-200"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none'
                      }}
                    />
                  </div>
                )}

                {isRequestor && isOpen && submission.status === SubmissionStatus.Pending && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <button
                      onClick={() => handleApprove(submission.id)}
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
    </div>
  )
}

