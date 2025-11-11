'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAccount } from 'wagmi'
import { WalletModal } from '@/components/ui/WalletModal'

export function HeroSection() {
  const { isConnected } = useAccount()
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false)

  // Close modal when connected
  useEffect(() => {
    if (isConnected) {
      setIsWalletModalOpen(false)
    }
  }, [isConnected])

  return (
    <section className="relative overflow-hidden bg-white py-24 md:py-32">
      <div className="container">
        <div className="mx-auto max-w-4xl text-center space-y-10">
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-gray-900 leading-tight">
            Where{' '}
            <span className="text-primary">Creativity</span>{' '}
            Meets{' '}
            <span className="text-primary">Trust</span>
          </h1>
          
          <p className="text-xl md:text-2xl text-gray-600 max-w-2xl mx-auto leading-relaxed font-light">
            A decentralized marketplace for creators, designers, builders, and artists.
            Built on Intuition&apos;s Knowledge Graph with verifiable reputation and programmable payments.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4">
            {isConnected ? (
              <>
                <Link
                  href="/jobs"
                  className="px-8 py-4 text-base font-semibold rounded-full bg-primary text-white hover:bg-[#0052CC] transition-all duration-200 shadow-card hover:shadow-card-hover"
                >
                  Explore Job Pool
                </Link>
                <Link
                  href="/portfolio"
                  className="px-8 py-4 text-base font-semibold rounded-full border-2 border-gray-300 text-gray-900 hover:border-gray-400 hover:bg-gray-50 transition-all duration-200"
                >
                  Create Portfolio
                </Link>
              </>
            ) : (
              <button
                onClick={() => setIsWalletModalOpen(true)}
                className="px-10 py-4 text-base font-semibold rounded-full bg-primary text-white hover:bg-[#0052CC] transition-all duration-200 shadow-card hover:shadow-card-hover"
              >
                Connect Wallet to Get Started
              </button>
            )}
          </div>

          <div className="pt-12 flex flex-wrap items-center justify-center gap-8 text-sm text-gray-500">
            <div className="flex items-center gap-2.5">
              <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="w-3 h-3 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="font-medium">Verifiable Reputation</span>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="w-3 h-3 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="font-medium">IP Protection </span>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="w-3 h-3 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="font-medium">Low Platform Fees</span>
            </div>
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

