'use client'

import { useState, useRef } from 'react'
import { JobList } from '@/components/jobs/JobList'
import { JobCreateForm } from '@/components/jobs/JobCreateForm'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'

export default function JobsPage() {
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createdJobId, setCreatedJobId] = useState<bigint | null>(null)
  const refreshJobListRef = useRef<() => void>(() => {})

  const handleJobCreated = (jobId: bigint) => {
    setCreatedJobId(jobId)
    // Don't close form immediately - let success message show
    // User will click "View Job Marketplace" to go back
  }

  const handleViewMarketplace = () => {
    // Refresh job list before showing it
    if (refreshJobListRef.current) {
      refreshJobListRef.current()
    }
    setShowCreateForm(false)
    // Small delay to ensure job list has time to refresh
    setTimeout(() => {
      if (refreshJobListRef.current) {
        refreshJobListRef.current()
      }
    }, 1000)
  }

  return (
    <main className="min-h-screen bg-white">
      <Header />
      {showCreateForm ? (
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <JobCreateForm
            onSuccess={handleJobCreated}
            onCancel={handleViewMarketplace}
          />
        </div>
      ) : (
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <JobList 
            onCreateJob={() => setShowCreateForm(true)}
            refreshRef={refreshJobListRef}
          />
        </div>
      )}
      <Footer />
    </main>
  )
}


