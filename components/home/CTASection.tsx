'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAccount } from 'wagmi'
import { WalletModal } from '@/components/ui/WalletModal'

export function CTASection() {
  const { isConnected } = useAccount()
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false)

  // Close modal when connected
  useEffect(() => {
    if (isConnected) {
      setIsWalletModalOpen(false)
    }
  }, [isConnected])

  return (
    <section className="py-24 bg-gray-900 text-white">
      <div className="container">
        <div className="mx-auto max-w-3xl text-center space-y-10">
          <h2 className="text-4xl md:text-5xl font-bold">
            Ready to Join the Future of Creative Work?
          </h2>
          <p className="text-xl text-gray-300 font-light leading-relaxed">
            Connect your wallet and start building your verifiable reputation today.
            No platform fees, full ownership, transparent trust.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            {isConnected ? (
              <Link
                href="/jobs"
                className="px-10 py-4 text-base font-semibold rounded-full bg-white text-gray-900 hover:bg-gray-100 transition-all duration-200 shadow-card hover:shadow-card-hover"
              >
                Explore Jobs
              </Link>
            ) : (
              <button
                onClick={() => setIsWalletModalOpen(true)}
                className="px-10 py-4 text-base font-semibold rounded-full bg-white text-gray-900 hover:bg-gray-100 transition-all duration-200 shadow-card hover:shadow-card-hover"
              >
                Get Started
              </button>
            )}
          </div>
          
          <WalletModal 
            isOpen={isWalletModalOpen} 
            onClose={() => setIsWalletModalOpen(false)} 
          />
        </div>
      </div>
    </section>
  )
}

