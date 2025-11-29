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
  
  // Detect available wallets directly from window
  const detectWallets = () => {
    if (typeof window === 'undefined') return []
    
    const win = window as any
    const detected: Array<{ name: string; provider: any; isMetaMask?: boolean }> = []
    
    // Check for MetaMask first
    if (win.ethereum?.isMetaMask) {
      detected.push({ name: 'MetaMask', provider: win.ethereum, isMetaMask: true })
    }
    
    // Check for OKX Wallet (can be in window.okxwallet or window.okexchain)
    if (win.okxwallet || win.okexchain) {
      if (!detected.find(w => w.name === 'OKX Wallet')) {
        detected.push({ name: 'OKX Wallet', provider: win.okxwallet || win.okexchain })
      }
    }
    
    // Check for Zerion (can be in window.zerion)
    if (win.zerion) {
      if (!detected.find(w => w.name === 'Zerion')) {
        detected.push({ name: 'Zerion', provider: win.zerion })
      }
    }
    
    // Check for other wallets in window.ethereum (but avoid duplicates)
    if (win.ethereum && !win.ethereum.isMetaMask) {
      if (win.ethereum.isCoinbaseWallet && !detected.find(w => w.name === 'Coinbase Wallet')) {
        detected.push({ name: 'Coinbase Wallet', provider: win.ethereum })
      } else if (win.ethereum.isTrust && !detected.find(w => w.name === 'Trust Wallet')) {
        detected.push({ name: 'Trust Wallet', provider: win.ethereum })
      } else if (win.ethereum.isBraveWallet && !detected.find(w => w.name === 'Brave Wallet')) {
        detected.push({ name: 'Brave Wallet', provider: win.ethereum })
      } else if (win.ethereum.isOKExWallet && !detected.find(w => w.name === 'OKX Wallet')) {
        detected.push({ name: 'OKX Wallet', provider: win.ethereum })
      } else if (win.ethereum.isZerion && !detected.find(w => w.name === 'Zerion')) {
        detected.push({ name: 'Zerion', provider: win.ethereum })
      } else if (!detected.find(w => w.name === 'OKX Wallet' || w.name === 'Zerion' || w.name === 'MetaMask')) {
        detected.push({ name: 'Browser Wallet', provider: win.ethereum })
      }
    }
    
    return detected
  }
  
  const detectedWallets = detectWallets()

  const handleConnect = (connector: any) => {
    if (!connector) {
      console.error('No connector provided')
      return
    }
    
    if (!connector.ready) {
      console.warn('Connector is not ready:', connector.id)
      // Still try to connect - some connectors might work even if not marked as ready
    }
    
    try {
      setConnectingTo(connector.id)
      connect({ connector })
    } catch (err) {
      console.error('Wallet connection error:', err)
      setConnectingTo(null)
    }
  }

  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Close modal when connected
  useEffect(() => {
    if (isConnected) {
      setConnectingTo(null)
      onClose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected])

  // Handle ESC key to close modal
  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  if (!isOpen || !mounted) {
    return null
  }

  const getWalletName = (connector: any) => {
    const name = (connector.name || '').toLowerCase()
    const id = (connector.id || '').toLowerCase()
    
    // Check window.ethereum for specific wallet indicators first
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      const provider = (window as any).ethereum
      if (provider.isMetaMask) return 'MetaMask'
      if (provider.isCoinbaseWallet) return 'Coinbase Wallet'
      if (provider.isTrust) return 'Trust Wallet'
      if (provider.isBraveWallet) return 'Brave Wallet'
      if (provider.isOKExWallet) return 'OKX Wallet'
      if (provider.isZerion) return 'Zerion'
      if (provider.isRabby) return 'Rabby'
      if (provider.isTokenPocket) return 'TokenPocket'
    }
    
    // Check for OKX and Zerion in window
    if (typeof window !== 'undefined') {
      const win = window as any
      if (win.okxwallet || win.okexchain) return 'OKX Wallet'
      if (win.zerion) return 'Zerion'
    }
    
    // Check connector name/id
    if (name.includes('metamask') || id.includes('metamask')) return 'MetaMask'
    if (name.includes('okx') || id.includes('okx') || name.includes('okex')) return 'OKX Wallet'
    if (name.includes('zerion') || id.includes('zerion')) return 'Zerion'
    if (name.includes('coinbase') || id.includes('coinbase')) return 'Coinbase Wallet'
    if (name.includes('trust') || id.includes('trust')) return 'Trust Wallet'
    if (name.includes('walletconnect') || id.includes('walletconnect')) return 'WalletConnect'
    if (name.includes('injected') || id.includes('injected')) {
      return 'Browser Wallet'
    }
    
    return connector.name || 'Browser Wallet'
  }

  const getWalletIcon = (connector: any, walletName?: string) => {
    const name = (connector?.name || walletName || '').toLowerCase()
    const id = (connector?.id || '').toLowerCase()
    
    // MetaMask
    if (name.includes('metamask') || id.includes('metamask') || walletName === 'MetaMask') {
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
    
    // OKX Wallet
    if (name.includes('okx') || id.includes('okx') || name.includes('okex') || walletName === 'OKX Wallet') {
      return (
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="24" height="24" rx="4" fill="#000000"/>
          <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#FFFFFF"/>
          <path d="M2 17L12 22L22 17V12L12 17L2 12V17Z" fill="#FFFFFF"/>
        </svg>
      )
    }
    
    // Zerion
    if (name.includes('zerion') || id.includes('zerion') || walletName === 'Zerion') {
      return (
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="10" fill="#2962EF"/>
          <path d="M12 6L8 10H10V16H14V10H16L12 6Z" fill="#FFFFFF"/>
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
          <div className="space-y-3 mb-4">
            {(() => {
              // First, try to use wagmi connectors if available and ready
              const readyConnectors = connectors.filter(c => c.ready)
              
              // If we have ready connectors, use them
              if (readyConnectors.length > 0) {
                const seenWallets = new Set<string>()
                return readyConnectors
                  .filter(connector => {
                    const walletName = getWalletName(connector)
                    if (seenWallets.has(walletName)) {
                      // Prefer MetaMask connector over injected for MetaMask
                      if (walletName === 'MetaMask' && !connector.name?.toLowerCase().includes('metamask')) {
                        return false
                      }
                      return false
                    }
                    seenWallets.add(walletName)
                    return true
                  })
                  .map((connector) => {
                    const isConnecting = connectingTo === connector.id
                    const isDisabled = isPending && !isConnecting
                    
                    return (
                      <button
                        key={connector.id}
                        type="button"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          handleConnect(connector)
                        }}
                        disabled={isDisabled}
                        className="w-full flex items-center justify-between p-4 rounded-xl border-2 border-gray-200 hover:border-primary hover:bg-gray-50 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed group"
                      >
                        <div className="flex items-center gap-4">
                          <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-gray-50 rounded-lg group-hover:bg-primary/10 transition-colors">
                            {getWalletIcon(connector, getWalletName(connector))}
                          </div>
                          <div className="text-left">
                            <div className="font-semibold text-gray-900">
                              {getWalletName(connector)}
                            </div>
                            <div className="text-xs text-gray-500">
                              {(() => {
                                const walletName = getWalletName(connector)
                                if (walletName === 'MetaMask') return 'Connect using MetaMask extension'
                                if (walletName === 'OKX Wallet') return 'Connect using OKX Wallet extension'
                                if (walletName === 'Zerion') return 'Connect using Zerion wallet'
                                return 'Connect using your browser wallet'
                              })()}
                            </div>
                          </div>
                        </div>
                        {isConnecting ? (
                          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />
                        ) : (
                          <svg className="w-5 h-5 text-gray-400 group-hover:text-primary transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        )}
                      </button>
                    )
                  })
              }
              
              // Fallback: Use detected wallets from window if wagmi connectors aren't ready
              if (detectedWallets.length > 0) {
                return detectedWallets.map((wallet, index) => {
                  const isConnecting = connectingTo === `detected-${index}`
                  
                  return (
                    <button
                      key={`detected-${index}`}
                      type="button"
                      onClick={async (e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        try {
                          setConnectingTo(`detected-${index}`)
                          // Try to find a matching connector
                          const matchingConnector = connectors.find(c => {
                            const name = getWalletName(c)
                            return name === wallet.name
                          })
                          
                          if (matchingConnector) {
                            handleConnect(matchingConnector)
                          } else {
                            // Try to connect directly via injected connector
                            const injectedConnector = connectors.find(c => 
                              c.name?.toLowerCase().includes('injected') || c.id?.toLowerCase().includes('injected')
                            )
                            if (injectedConnector) {
                              handleConnect(injectedConnector)
                            } else {
                              // Request connection directly
                              if (wallet.provider && wallet.provider.request) {
                                await wallet.provider.request({ method: 'eth_requestAccounts' })
                                window.location.reload()
                              }
                            }
                          }
                        } catch (err) {
                          console.error('Connection error:', err)
                          setConnectingTo(null)
                        }
                      }}
                      disabled={isPending && !isConnecting}
                      className="w-full flex items-center justify-between p-4 rounded-xl border-2 border-gray-200 hover:border-primary hover:bg-gray-50 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed group"
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-gray-50 rounded-lg group-hover:bg-primary/10 transition-colors">
                          {getWalletIcon(null, wallet.name)}
                        </div>
                        <div className="text-left">
                          <div className="font-semibold text-gray-900">
                            {wallet.name}
                          </div>
                          <div className="text-xs text-gray-500">
                            Connect using {wallet.name}
                          </div>
                        </div>
                      </div>
                      {isConnecting ? (
                        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />
                      ) : (
                        <svg className="w-5 h-5 text-gray-400 group-hover:text-primary transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      )}
                    </button>
                  )
                })
              }
              
              // No wallets found at all
              return (
                <div className="p-6 text-center border-2 border-dashed border-gray-200 rounded-xl">
                  <svg className="w-12 h-12 mx-auto mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <p className="text-sm font-medium text-gray-900 mb-1">No wallets found</p>
                  <p className="text-xs text-gray-500 mb-4">Please install a Web3 wallet to continue.</p>
                  <a 
                    href="https://metamask.io" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-full bg-primary text-white hover:bg-[#0052CC] transition-colors"
                  >
                    Install MetaMask
                    <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>
              )
            })()}
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-4 rounded-lg bg-red-50 border border-red-200 mb-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-900 mb-1">Connection Error</p>
                  <p className="text-sm text-red-600">{error.message}</p>
                  <p className="text-xs text-red-500 mt-2">Please try again or select a different wallet.</p>
                </div>
              </div>
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

