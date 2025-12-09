'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PortfolioCreateForm } from './PortfolioCreateForm'

export function PortfolioCreatePage() {
  const router = useRouter()
  const [created, setCreated] = useState(false)

  const handleSuccess = (result: { profileId: string; txHash: string }) => {
    setCreated(true)
    // Optionally redirect after a delay
    setTimeout(() => {
      router.push('/portfolio')
    }, 3000)
  }

  const handleCancel = () => {
    router.back()
  }

  if (created) {
    return (
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-2xl mx-auto text-center">
          <div className="mb-6">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Portfolio Created Successfully!</h2>
            <p className="text-gray-600 mb-4">
              Your portfolio has been created on the blockchain. Redirecting to portfolio page...
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-16">
      <PortfolioCreateForm onSuccess={handleSuccess} onCancel={handleCancel} />
    </div>
  )
}

