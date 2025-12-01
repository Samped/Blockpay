'use client'

import { useState } from 'react'
import { JobList } from '@/components/jobs/JobList'
import { JobCreateForm } from '@/components/jobs/JobCreateForm'

export default function JobsPage() {
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createdJobId, setCreatedJobId] = useState<bigint | null>(null)

  const handleJobCreated = (jobId: bigint) => {
    setCreatedJobId(jobId)
    setShowCreateForm(false)
    // Optionally redirect to job detail or show success message
  }

  if (showCreateForm) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <JobCreateForm
          onSuccess={handleJobCreated}
          onCancel={() => setShowCreateForm(false)}
        />
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <JobList onCreateJob={() => setShowCreateForm(true)} />
    </div>
  )
}


