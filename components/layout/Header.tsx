'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAccount, useDisconnect } from 'wagmi'
import { Logo } from '@/components/ui/Logo'
import { WalletModal } from '@/components/ui/WalletModal'

export function Header() {
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false)

  // Close modal when connected
  useEffect(() => {
    if (isConnected) {
      setIsWalletModalOpen(false)
    }
  }, [isConnected])

  // Debug
  useEffect(() => {
    console.log('Header - Wallet modal state:', isWalletModalOpen)
  }, [isWalletModalOpen])

  return (
    <header className="sticky top-0 z-50 w-full bg-white/80 backdrop-blur-md border-b border-gray-100">
      <div className="container flex h-20 items-center justify-between">
        <Link href="/" className="group">
          <Logo size={40} className="group-hover:opacity-80 transition-opacity" />
        </Link>

        <nav className="hidden md:flex items-center space-x-8">
          <Link href="/jobs" className="text-sm font-medium text-gray-700 hover:text-primary transition-colors">
            Job Pool
          </Link>
          <Link href="/creators" className="text-sm font-medium text-gray-700 hover:text-primary transition-colors">
            Top Creators
          </Link>
          <Link href="/portfolio" className="text-sm font-medium text-gray-700 hover:text-primary transition-colors">
            Portfolio
          </Link>
        </nav>

        <div className="flex items-center space-x-3">
          {isConnected ? (
            <>
              <span className="text-sm text-gray-600 font-medium px-3 py-1.5 bg-gray-50 rounded-full">
                {address?.slice(0, 6)}...{address?.slice(-4)}
              </span>
              <button
                onClick={() => disconnect()}
                className="px-5 py-2 text-sm font-medium rounded-full bg-gray-900 text-white hover:bg-gray-800 transition-all duration-200"
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                alert('Button clicked! Opening modal...')
                console.log('Button clicked! Current state:', isWalletModalOpen)
                setIsWalletModalOpen(true)
                console.log('Setting modal to true')
                setTimeout(() => {
                  console.log('State after update:', isWalletModalOpen)
                }, 100)
              }}
              className="px-6 py-2.5 text-sm font-semibold rounded-full bg-primary text-white hover:bg-[#0052CC] transition-all duration-200 shadow-soft cursor-pointer"
            >
              Connect Wallet
            </button>
          )}
        </div>
      </div>
      
      <WalletModal 
        isOpen={isWalletModalOpen} 
        onClose={() => setIsWalletModalOpen(false)} 
      />
    </header>
  )
}

