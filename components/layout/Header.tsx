'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAccount, useDisconnect, usePublicClient } from 'wagmi'
import { formatUnits } from 'viem'
import { Logo } from '@/components/ui/Logo'
import { WalletModal } from '@/components/ui/WalletModal'

export function Header() {
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false)
  const publicClient = usePublicClient()
  const [walletBalance, setWalletBalance] = useState<string | null>(null)
  const [isFetchingBalance, setIsFetchingBalance] = useState(false)

  // Close modal when connected
  useEffect(() => {
    if (isConnected) {
      setIsWalletModalOpen(false)
    }
  }, [isConnected])

  // Fetch TRUST balance for the connected wallet (for nav bar display)
  useEffect(() => {
    const fetchBalance = async () => {
      if (!publicClient || !address) {
        setWalletBalance(null)
        return
      }
      try {
        setIsFetchingBalance(true)
        const balance = await publicClient.getBalance({ address: address as `0x${string}` })
        const formatted = formatUnits(balance, 18)
        setWalletBalance(formatted)
      } catch (err) {
        console.error('[Header] Error fetching wallet balance:', err)
        setWalletBalance(null)
      } finally {
        setIsFetchingBalance(false)
      }
    }

    fetchBalance()
  }, [publicClient, address])

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
          <Link href="/hub" className="text-sm font-medium text-gray-700 hover:text-primary transition-colors">
            Hub
          </Link>
          {isConnected && (
            <Link href="/dashboard" className="text-sm font-medium text-gray-700 hover:text-primary transition-colors">
              Dashboard
            </Link>
          )}
        </nav>

        <div className="flex items-center space-x-3">
          {isConnected ? (
            <>
              <Link href="/dashboard" className="group">
                <div className="px-3 py-2 bg-gray-50/90 border border-gray-200 rounded-2xl shadow-sm hover:bg-gray-100 hover:border-gray-300 transition-all duration-200">
                  <p className="text-xs font-medium text-gray-500 tracking-wide">
                    {address?.slice(0, 6)}...{address?.slice(-4)}
                  </p>
                  {walletBalance !== null && (
                    <p className="mt-0.5 text-[11px] text-gray-700">
                      <span className="font-semibold text-primary">
                        {Number(walletBalance).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                      </span>{' '}
                      <span className="text-gray-400">TRUST</span>
                    </p>
                  )}
                  {walletBalance === null && isFetchingBalance && (
                    <p className="mt-0.5 text-[11px] text-gray-400">
                      Fetching TRUST...
                    </p>
                  )}
                </div>
              </Link>
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
              onClick={() => setIsWalletModalOpen(true)}
              className="px-6 py-2.5 text-sm font-semibold rounded-full bg-primary text-white hover:bg-[#0052CC] transition-all duration-200 shadow-soft"
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

