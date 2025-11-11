'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useConnect, useAccount } from 'wagmi'

interface WalletModalProps {
  isOpen: boolean
  onClose: () => void
}

export function WalletModal({ isOpen, onClose }: WalletModalProps) {
  const { connect, connectors, error, isPending } = useConnect()
  const { isConnected } = useAccount()
  const [connectingTo, setConnectingTo] = useState<string | null>(null)

  const handleConnect = async (connector: any) => {
    try {
      setConnectingTo(connector.id)
      await connect({ connector })
      // Modal will close via useEffect in parent component when isConnected changes
    } catch (err) {
      console.error('Connection error:', err)
      setConnectingTo(null)
    }
  }

  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Debug
  useEffect(() => {
    if (isOpen) {
      console.log('WalletModal opened:', { connectorsCount: connectors.length, connectors: connectors.map(c => ({ name: c.name, ready: c.ready })) })
    }
  }, [isOpen, connectors])

  if (!isOpen || !mounted) {
    return null
  }

  const getWalletName = (connector: any) => {
    if (connector.name.toLowerCase().includes('metamask')) return 'MetaMask'
    if (connector.name.toLowerCase().includes('injected')) return 'Browser Wallet'
    if (connector.name.toLowerCase().includes('walletconnect')) return 'WalletConnect'
    return connector.name || 'Unknown Wallet'
  }

  const getWalletIcon = (connector: any) => {
    const name = connector.name.toLowerCase()
    if (name.includes('metamask')) {
      return (
        <svg className="w-6 h-6" viewBox="0 0 40 37" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M36.0112 1.33333L22.1222 13.0933L24.6667 5.48889L36.0112 1.33333Z" fill="#E2761B" stroke="#E2761B" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M3.98889 1.33333L17.7556 13.1556L15.3333 5.48889L3.98889 1.33333Z" fill="#E4761B" stroke="#E4761B" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M31.1222 26.6667L27.5556 32.4444L35.3333 34.6667L37.7778 27.1111L31.1222 26.6667Z" fill="#E4761B" stroke="#E4761B" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M2.22222 27.1111L4.66667 34.6667L12.4444 32.4444L8.88889 26.6667L2.22222 27.1111Z" fill="#E4761B" stroke="#E4761B" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M12.4444 16.4444L10.2222 19.5556L17.7778 19.9111L17.3333 11.7333L12.4444 16.4444Z" fill="#E4761B" stroke="#E4761B" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M27.5556 16.4444L22.5556 11.6L22.2222 19.9111L29.7778 19.5556L27.5556 16.4444Z" fill="#E4761B" stroke="#E4761B" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M12.4444 32.4444L18.2222 29.7778L13.3333 26.6667L12.4444 32.4444Z" fill="#D7C1B3" stroke="#D7C1B3" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M21.7778 29.7778L27.5556 32.4444L26.6667 26.6667L21.7778 29.7778Z" fill="#D7C1B3" stroke="#D7C1B3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )
    }
    // Default wallet icon
    return (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    )
  }

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-card-hover max-w-md w-full z-[10000]" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Connect Wallet</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Wallet Options */}
          <div className="space-y-2 mb-4">
            {connectors.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                <p className="text-sm mb-2">No wallets available.</p>
                <p className="text-xs">Please install a Web3 wallet like MetaMask.</p>
                <a 
                  href="https://metamask.io" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline text-sm mt-2 inline-block"
                >
                  Install MetaMask →
                </a>
              </div>
            ) : (
              connectors.map((connector) => {
                const isConnecting = connectingTo === connector.id
                const isDisabled = isPending && !isConnecting
                
                return (
                  <button
                    key={connector.id}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      console.log('Connecting to wallet:', connector.name, connector.id, 'ready:', connector.ready)
                      if (connector.ready) {
                        handleConnect(connector)
                      }
                    }}
                    disabled={isDisabled || !connector.ready}
                    className="w-full flex items-center justify-between p-4 rounded-xl border-2 border-gray-200 hover:border-primary hover:bg-gray-50 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-primary group-hover:scale-110 transition-transform">
                        {getWalletIcon(connector)}
                      </div>
                      <div className="text-left">
                        <div className="font-semibold text-gray-900">
                          {getWalletName(connector)}
                        </div>
                        {!connector.ready && (
                          <div className="text-xs text-gray-500">Not available</div>
                        )}
                      </div>
                    </div>
                    {isConnecting ? (
                      <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg className="w-5 h-5 text-gray-400 group-hover:text-primary transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                  </button>
                )
              })
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 mb-4">
              <p className="text-sm text-red-600">{error.message}</p>
            </div>
          )}

          {/* Footer */}
          <p className="text-xs text-gray-500 text-center">
            By connecting, you agree to BlockPay&apos;s Terms of Service
          </p>
        </div>
      </div>
    </div>
  )

  // Render modal using portal to ensure it's on top
  if (typeof window !== 'undefined' && document.body) {
    return createPortal(modalContent, document.body)
  }
  
  return modalContent
}

