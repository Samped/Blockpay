'use client'

import { useState, useEffect, useRef } from 'react'
import { usePublicClient, useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi'
import { parseEther, decodeErrorResult, formatUnits } from 'viem'
import { intuitionClient, Atom, TrustScore, Triple } from '@/lib/intuitionClient'
import { INTUITION_CONTRACT_ABI, INTUITION_CONTRACT_ADDRESS, atomDataToBytes } from '@/lib/intuitionContract'
import { CompletedJobs } from './CompletedJobs'
import { WorkerNotifications } from './WorkerNotifications'

interface UserProfileProps {
  address: string
}

interface UserData {
  atom: Atom | null
  trustScore: TrustScore | null
  completedJobs: number
  createdArtworks: number
  bio: string
  name: string
  email: string
  website: string
  socialLinks: {
    twitter?: string
    github?: string
    behance?: string
    dribbble?: string
  }
}

export function UserProfile({ address }: UserProfileProps) {
  const publicClient = usePublicClient()
  const { isConnected, chain } = useAccount()
  const { writeContract, data: hash, isPending: isWriting, error: writeError } = useWriteContract()
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash })
  
  const [userData, setUserData] = useState<UserData>({
    atom: null,
    trustScore: null,
    completedJobs: 0,
    createdArtworks: 0,
    bio: '',
    name: '',
    email: '',
    website: '',
    socialLinks: {},
  })
  const [loading, setLoading] = useState(true)
  const [walletBalance, setWalletBalance] = useState<string | null>(null)
  
  // Count completed jobs from localStorage
  const countCompletedJobsFromStorage = () => {
    if (!address) return 0
    try {
      const creatorCompletedJobsKey = `creator_completed_jobs_${address.toLowerCase()}`
      const jobIds = JSON.parse(localStorage.getItem(creatorCompletedJobsKey) || '[]')
      return jobIds.length
    } catch (err) {
      return 0
    }
  }
  const [isEditing, setIsEditing] = useState(false)
  const [showSuccessToast, setShowSuccessToast] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [editForm, setEditForm] = useState({
    name: '',
    bio: '',
    email: '',
    website: '',
    twitter: '',
    github: '',
    behance: '',
    dribbble: '',
  })

  // Store fetchUserData in a ref so it can be called manually
  const fetchUserDataRef = useRef<(() => Promise<void>) | null>(null)

  useEffect(() => {
    const fetchUserData = async () => {
      if (!address) return

      try {
        setLoading(true)
        console.log('[INFO] Fetching user profile for address:', address)
        console.log('📡 Public client available:', !!publicClient)

        // Fetch user profile using GraphQL API, passing publicClient to check contract
        const profileData = await intuitionClient.getUserProfileData(address, publicClient || undefined)
        
        console.log('[STATS] Profile data received:', {
          hasAtom: !!profileData.atom,
          atomId: profileData.atom?.id,
          trustScore: profileData.trustScore?.score
        })
        
        const { atom: userAtom, trustScore, completedJobs: apiCompletedJobs, createdArtworks, profileData: atomData } = profileData
        
        // Count completed jobs from localStorage (more accurate)
        const storageCompletedJobs = countCompletedJobsFromStorage()
        const completedJobs = Math.max(apiCompletedJobs, storageCompletedJobs)

        if (userAtom) {
          setUserData({
            atom: userAtom,
            trustScore,
            completedJobs,
            createdArtworks,
            bio: atomData?.bio || '',
            name: atomData?.name || '',
            email: atomData?.email || '',
            website: atomData?.website || '',
            socialLinks: {
              twitter: atomData?.twitter || '',
              github: atomData?.github || '',
              behance: atomData?.behance || '',
              dribbble: atomData?.dribbble || '',
            },
          })
          setLoading(false)
          return
        }

        // No atom found; skip any legacy/diagnostic fallbacks
        setLoading(false)
        return
      } catch (error) {
        console.error('[ERROR] Error fetching user data:', error)
      } finally {
        setLoading(false)
      }
    }

    // Store the function in ref for manual refresh
    fetchUserDataRef.current = fetchUserData
    
    // Only fetch on mount or when address changes (not auto-refresh)
    fetchUserData()
  }, [address, publicClient])

  // Fetch wallet TRUST balance (native token) and show it under the wallet address
  useEffect(() => {
    const fetchBalance = async () => {
      if (!publicClient || !address) return
      try {
        const balance = await publicClient.getBalance({ address: address as `0x${string}` })
        const formatted = formatUnits(balance, 18)
        setWalletBalance(formatted)
        console.log('[INFO] Wallet balance fetched:', formatted, 'TRUST')
      } catch (err) {
        console.error('[ERROR] Error fetching wallet balance:', err)
      }
    }

    fetchBalance()
  }, [publicClient, address])

  const handleSave = async () => {
    const atomId = userData.atom?.term_id || userData.atom?.id
    if (!atomId) {
      console.error('Cannot save: No atom ID or term_id found')
      return
    }

    if (!isConnected || !address) {
      console.error('[ERROR] Wallet not connected:', { isConnected, address })
      alert('Please connect your wallet to update your profile')
      return
    }

    if (chain?.id !== 13579) {
      alert('Please switch to Intuition Testnet (Chain ID: 13579) to update your profile')
      return
    }
    
    console.log('💾 Updating profile on-chain with atom ID:', atomId)
    console.log('[SUCCESS] Wallet connected:', { isConnected, address, chainId: chain?.id })

    try {
      setLoading(true)

      // Prepare updated profile data - add unique identifier to avoid duplicate detection
      // The contract might reject duplicate atoms, so we add a version/timestamp
      const timestamp = Date.now()
      const updatedData = {
        address: address.toLowerCase(),
        wallet: address.toLowerCase(),
        type: 'User',
        name: editForm.name,
        bio: editForm.bio,
        email: editForm.email,
        website: editForm.website,
        twitter: editForm.twitter,
        github: editForm.github,
        behance: editForm.behance,
        dribbble: editForm.dribbble,
        updatedAt: new Date().toISOString(),
        version: timestamp, // Add unique version to prevent duplicate detection
        revision: timestamp, // Additional unique field
        // Don't preserve old createdAt to avoid conflicts
      }

      // Convert atom data to bytes for createAtoms function
      const atomDataBytes = atomDataToBytes(updatedData)

      // First, try to read the actual minimum deposit from the contract - EXACTLY like UserInitialization.tsx
      let minimumDeposit = parseEther('0.01') // Default to 0.01 tTRUST (minimum on testnet)
      
      if (publicClient) {
        try {
          console.log('[INFO] Reading minimum deposit from contract...')
          // Try to read getMinAtomDeposit
          const minDeposit = await publicClient.readContract({
            address: INTUITION_CONTRACT_ADDRESS,
            abi: INTUITION_CONTRACT_ABI,
            functionName: 'getMinAtomDeposit',
          }) as bigint | undefined
          
          if (minDeposit && minDeposit > 0n) {
            minimumDeposit = minDeposit
            console.log('[OK] Minimum deposit from contract:', minimumDeposit.toString(), 'wei')
            console.log('  (', (Number(minimumDeposit) / 1e18).toFixed(6), 'tTRUST)')
          } else {
            console.warn('[WARNING] Could not read minimum deposit, using default 0.01 tTRUST')
          }
        } catch (configError: any) {
          console.warn('[WARNING] Could not read minimum deposit from contract, using default 0.01 tTRUST:', configError.message)
        }
      }

      // IMPORTANT: Based on contract docs, msg.value MUST equal sum(assets[])
      // The minimum deposit on testnet is 0.01 tTRUST (not 0.001!)
      // Use the minimum deposit amount - EXACTLY like UserInitialization.tsx
      const assetDeposit = minimumDeposit
      const totalValue = assetDeposit // msg.value must equal sum(assets[])
      
      console.log('[NOTE] Using deposit amount:', assetDeposit.toString(), 'wei')
      console.log('   (', (Number(assetDeposit) / 1e18).toFixed(6), 'tTRUST)')

      console.log('=== Updating profile atom on-chain ===')
      console.log('Contract:', INTUITION_CONTRACT_ADDRESS)
      console.log('Function: createAtoms(bytes[] data, uint256[] assets) payable')
      console.log('Atom data (bytes):', atomDataBytes.substring(0, 100) + '...')
      console.log('Minimum deposit:', minimumDeposit.toString(), 'wei')
      console.log('Total in assets[]:', assetDeposit.toString(), 'wei')
      console.log('Total msg.value:', totalValue.toString(), 'wei')
      console.log('Total msg.value (tTRUST):', (Number(totalValue) / 1e18).toFixed(6))
      console.log('[WARNING] NOTE: assets[] = [minimumDeposit], msg.value = sum(assets[])')

      // Prepare function arguments - EXACTLY like UserInitialization.tsx
      // assets[] contains only the deposit, msg.value contains fee + deposit
      const functionArgs: [`0x${string}`[], bigint[]] = [
        [atomDataBytes], // bytes[] - array with one atom data
        [assetDeposit]   // uint256[] - array with deposit amount (NOT including fee)
      ]

      // Simulate transaction first to catch errors - EXACTLY like UserInitialization.tsx
      if (publicClient && address) {
        try {
          console.log('[INFO] Simulating transaction to check for errors...')
          const simulation = await publicClient.simulateContract({
            account: address as `0x${string}`,
            address: INTUITION_CONTRACT_ADDRESS,
            abi: INTUITION_CONTRACT_ABI,
            functionName: 'createAtoms',
            args: functionArgs,
            value: totalValue // msg.value = sum(assets[])
          })
          console.log('[SUCCESS] Simulation successful - transaction should work')
          console.log('Simulation result:', simulation)
        } catch (simError: any) {
          console.error('[ERROR] Simulation failed - transaction will revert!')
          console.error('Full error:', simError)
          console.error('Error cause:', simError?.cause)
          console.error('Error data:', simError?.cause?.data)
          console.error('Error signature:', simError?.cause?.data?.errorName || 'Unknown')
          
          // Try to decode the error - EXACTLY like UserInitialization.tsx
          let errorMessage = 'Transaction will revert'
          try {
            // Try to decode using the ABI
            if (simError?.cause?.data && typeof simError.cause.data === 'string') {
              const decoded = decodeErrorResult({
                data: simError.cause.data as `0x${string}`,
                abi: INTUITION_CONTRACT_ABI,
              })
              if (decoded) {
                errorMessage = `Contract error: ${decoded.errorName || 'Unknown error'}`
                console.log('Decoded error:', decoded)
              }
            }
          } catch (decodeError) {
            console.warn('Could not decode error:', decodeError)
          }
          
          // Extract revert reason from various error formats - EXACTLY like UserInitialization.tsx
          if (!errorMessage || errorMessage === 'Transaction will revert') {
            if (simError?.cause?.data?.message) {
              errorMessage = simError.cause.data.message
            } else if (simError?.shortMessage) {
              errorMessage = simError.shortMessage
            } else if (simError?.message) {
              errorMessage = simError.message
            }
          }
          
          // Check for error signature 0xb4856ebc first
          const errorSig = simError?.cause?.data && typeof simError.cause.data === 'string' 
            ? simError.cause.data.substring(0, 10) 
            : ''
          
          if (errorSig === '0xb4856ebc') {
            // This error suggests the contract is rejecting duplicate atoms
            // Since atoms are immutable, we should update via GraphQL instead
            console.error('[WARNING] Error 0xb4856ebc - contract rejecting duplicate atom creation')
            console.log('[NOTE] Falling back to GraphQL update instead of on-chain creation')
            
            // Fall back to GraphQL update
            setLoading(false)
            try {
              const atomId = userData.atom?.term_id || userData.atom?.id
              if (atomId) {
                const updatedData = {
                  ...(userData.atom?.data || {}),
                  name: editForm.name,
                  bio: editForm.bio,
                  email: editForm.email,
                  website: editForm.website,
                  twitter: editForm.twitter,
                  github: editForm.github,
                  behance: editForm.behance,
                  dribbble: editForm.dribbble,
                  updatedAt: new Date().toISOString()
                }

                const mutation = `
                  mutation UpdateAtom($term_id: String!, $data: jsonb!) {
                    update_atoms(
                      where: { term_id: { _eq: $term_id } }
                      _set: { data: $data }
                    ) {
                      affected_rows
                      returning {
                        term_id
                        data
                      }
                    }
                  }
                `

                const response = await fetch('https://testnet.intuition.sh/v1/graphql', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    query: mutation,
                    variables: {
                      term_id: atomId,
                      data: updatedData
                    }
                  })
                })

                const result = await response.json()
                if (result.errors) {
                  throw new Error(result.errors[0].message)
                }

                // Update local state
                setUserData({
                  ...userData,
                  name: editForm.name,
                  bio: editForm.bio,
                  email: editForm.email,
                  website: editForm.website,
                  socialLinks: {
                    twitter: editForm.twitter,
                    github: editForm.github,
                    behance: editForm.behance,
                    dribbble: editForm.dribbble,
                  },
                  atom: {
                    ...userData.atom,
                    data: updatedData
                  }
                })

                setIsEditing(false)
                setSuccessMessage('Profile updated successfully via GraphQL! (On-chain creation was rejected - likely duplicate atom)')
                setShowSuccessToast(true)
                return
              }
            } catch (graphqlError: any) {
              errorMessage = `Failed to update via GraphQL: ${graphqlError.message || 'Unknown error'}. The contract rejected creating a new atom (error: 0xb4856ebc), likely because a User atom already exists for this address.`
            }
          } else if (errorMessage.includes('InvalidDepositAmount') || errorMessage.includes('InvalidDeposit')) {
            errorMessage = `Invalid deposit amount. The minimum required deposit is ${(Number(minimumDeposit) / 1e18).toFixed(6)} tTRUST, but you provided ${(Number(assetDeposit) / 1e18).toFixed(6)} tTRUST. Please ensure you have at least ${(Number(minimumDeposit) / 1e18).toFixed(6)} tTRUST + gas fees in your wallet.`
          } else if (errorMessage.includes('insufficient') || errorMessage.includes('balance') || errorMessage.includes('funds')) {
            errorMessage = `Insufficient tTRUST balance. You need at least ${(Number(totalValue) / 1e18).toFixed(6)} tTRUST + gas fees.`
          } else if (errorMessage.includes('value') || errorMessage.includes('msg.value')) {
            errorMessage = `Value mismatch: msg.value must equal sum(assets[]). Expected: ${(Number(totalValue) / 1e18).toFixed(6)} tTRUST (deposit: ${(Number(assetDeposit) / 1e18).toFixed(6)}).`
          } else if (errorMessage.includes('length') || errorMessage.includes('array')) {
            errorMessage = 'Array length mismatch: data and assets arrays must have the same length.'
          } else if (errorMessage.includes('minimum') || errorMessage.includes('deposit')) {
            errorMessage = `Minimum deposit not met. Required: ${(Number(minimumDeposit) / 1e18).toFixed(6)} tTRUST, you provided: ${(Number(assetDeposit) / 1e18).toFixed(6)} tTRUST.`
          }
          
          setLoading(false)
          alert(`[WARNING] ${errorMessage}. Check browser console (F12) for full details.`)
          return
        }
      }

      // Call contract's createAtoms function - EXACTLY like UserInitialization.tsx
      // Function signature: createAtoms(bytes[] calldata data, uint256[] calldata assets) payable
      // msg.value MUST equal sum(assets[])
      writeContract({
        address: INTUITION_CONTRACT_ADDRESS,
        abi: INTUITION_CONTRACT_ABI,
        functionName: 'createAtoms',
        args: functionArgs,
        value: totalValue // msg.value = sum(assets[])
      })

      console.log('[OK] Transaction request sent to wallet')
      // Note: Transaction confirmation and GraphQL update will be handled in useEffect below
    } catch (error: any) {
      console.error('Error updating profile:', error)
      setLoading(false)
      alert(`Failed to update profile: ${error.message || 'Unknown error'}`)
    }
  }

  // Handle transaction confirmation: refresh triple-based data only
  useEffect(() => {
    if (isConfirmed && hash) {
      console.log('[SUCCESS] Profile update transaction confirmed! Tx:', hash)
      
      const updateAfterConfirmation = async () => {
        try {
          // Wait a bit for indexing
          await new Promise(resolve => setTimeout(resolve, 3000))

          // Refresh user data after update (triple-based only)
          if (fetchUserDataRef.current) {
            await fetchUserDataRef.current()
          }

          setIsEditing(false)
          setLoading(false)
          console.log('[SUCCESS] Profile updated successfully on-chain!')
          setSuccessMessage(`Profile updated successfully! Transaction: ${hash.substring(0, 10)}...${hash.substring(hash.length - 8)}`)
          setShowSuccessToast(true)
        } catch (error) {
          console.error('Error in post-confirmation update:', error)
          setLoading(false)
        }
      }

      updateAfterConfirmation()
    }
  }, [isConfirmed, hash, fetchUserDataRef])

  // Handle transaction errors
  useEffect(() => {
    if (writeError) {
      console.error('Transaction error:', writeError)
      setLoading(false)
      let errorMessage = 'Transaction failed: '
      if (writeError.message?.includes('user rejected')) {
        errorMessage = 'Transaction was cancelled.'
      } else if (writeError.message?.includes('insufficient funds')) {
        errorMessage = 'Insufficient tTRUST for deposit + gas fees.'
      } else {
        errorMessage += writeError.message || 'Unknown error'
      }
      alert(errorMessage)
    }
  }, [writeError])

  const getTrustLevel = (score: number | null) => {
    if (!score) return { level: 'New', color: 'bg-gray-100 text-gray-900' }
    if (score >= 8000) return { level: 'Elite', color: 'bg-gray-100 text-gray-900' }
    if (score >= 6000) return { level: 'Expert', color: 'bg-gray-100 text-gray-900' }
    if (score >= 4000) return { level: 'Pro', color: 'bg-gray-100 text-gray-900' }
    if (score >= 2000) return { level: 'Rising', color: 'bg-gray-100 text-gray-900' }
    return { level: 'New', color: 'bg-gray-100 text-gray-900' }
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

  // If no profile exists, show create profile message
  if (!userData.atom) {
    return (
      <div className="bg-white rounded-2xl shadow-card p-6">
        <div className="text-center py-12">
          <div className="mb-4">
            <svg className="mx-auto h-16 w-16 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No Profile Found</h3>
          <p className="text-gray-600 mb-4">
            {loading 
              ? 'Checking for your profile...' 
              : 'You haven\'t created a profile yet, or it hasn\'t been indexed yet. If you just created a profile, wait 10-30 seconds and refresh.'}
          </p>
          {!loading && (
            <>
              <div className="mb-6">
                <button
                  onClick={async () => {
                    // Manually retry fetching user data
                    if (fetchUserDataRef.current) {
                      setLoading(true)
                      await fetchUserDataRef.current()
                    }
                  }}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors mr-2"
                >
                  🔄 Retry Search
                </button>
                <button
                  onClick={() => {
                    window.location.reload()
                  }}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors mr-2"
                >
                  Refresh Page
                </button>
                <button
                  onClick={() => {
                    // Trigger the UserInitialization modal to show
                    window.dispatchEvent(new CustomEvent('showCreateProfileModal'))
                  }}
                  className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-[#0052CC] transition-colors font-medium"
                >
                  Create Profile
                </button>
              </div>
              <p className="text-xs text-gray-500">
                [NOTE] If you created a profile on-chain, it may take 10-30 seconds for GraphQL to index it. Try clicking "Retry Search" to check again.
              </p>
            </>
          )}
        </div>
      </div>
    )
  }

  const trustInfo = getTrustLevel(userData.trustScore?.score || null)

  const handleRefresh = async () => {
    if (fetchUserDataRef.current) {
      await fetchUserDataRef.current()
    }
  }

  return (
    <>
      {/* Success Toast Notification */}
      {showSuccessToast && (
        <div
          onClick={() => setShowSuccessToast(false)}
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm cursor-pointer"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg shadow-2xl p-6 min-w-[320px] max-w-md border border-green-400/30 cursor-default animate-in slide-in-from-top-5"
          >
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 mt-0.5">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="font-semibold text-lg mb-2">Success!</p>
                <p className="text-sm text-green-50 mb-4">{successMessage}</p>
                <p className="text-xs text-green-200 opacity-80">Click anywhere outside to dismiss</p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setShowSuccessToast(false)
                }}
                className="flex-shrink-0 text-white/80 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-card p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Profile Information</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            className="px-3 py-2 text-sm font-medium rounded-full border border-gray-300 text-gray-900 hover:border-primary hover:text-primary transition-colors"
            title="Refresh profile data"
          >
            Refresh
          </button>
          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className="px-4 py-2 text-sm font-medium rounded-full border border-gray-300 text-gray-900 hover:border-primary hover:text-primary transition-colors"
            >
              Edit Profile
            </button>
          ) : (
          <div className="flex gap-2">
            <button
              onClick={() => {
                setIsEditing(false)
                setEditForm({
                  name: userData.name,
                  bio: userData.bio,
                  email: userData.email,
                  website: userData.website,
                  twitter: userData.socialLinks.twitter || '',
                  github: userData.socialLinks.github || '',
                  behance: userData.socialLinks.behance || '',
                  dribbble: userData.socialLinks.dribbble || '',
                })
              }}
              className="px-4 py-2 text-sm font-medium rounded-full border border-gray-300 text-gray-900 hover:border-gray-400 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isWriting || isConfirming || loading}
              className="px-4 py-2 text-sm font-medium rounded-full bg-primary text-white hover:bg-[#0052CC] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isWriting || isConfirming ? 'Processing...' : 'Save Changes'}
            </button>
          </div>
          )}
        </div>
      </div>

      <div className="space-y-6">
        {/* Wallet Address & Balance */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Wallet Address
          </label>
          <p className="text-sm text-gray-900 font-mono bg-gray-50 px-3 py-2 rounded-lg">
            {address}
          </p>
          {walletBalance !== null && (
            <p className="mt-1 text-xs text-gray-600">
              Balance:{' '}
              <span className="font-semibold text-primary">
                {Number(walletBalance).toLocaleString(undefined, { maximumFractionDigits: 4 })}
              </span>{' '}
              TRUST
            </p>
          )}
        </div>

        {/* Trust Score & Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-xs text-gray-600 mb-1">Trust Score</div>
            <div className="text-2xl font-bold text-primary">
              {userData.trustScore?.score.toLocaleString() || '0'}
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-xs text-gray-600 mb-1">Trust Level</div>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${trustInfo.color}`}>
              {trustInfo.level}
            </span>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-xs text-gray-600 mb-1">Completed Jobs</div>
            <div className="text-2xl font-bold text-gray-900">
              {userData.completedJobs}
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-xs text-gray-600 mb-1">Artworks</div>
            <div className="text-2xl font-bold text-gray-900">
              {userData.createdArtworks}
            </div>
          </div>
        </div>

        {/* Name */}
        {isEditing ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name
            </label>
            <input
              type="text"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="Your name"
            />
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name
            </label>
            <p className="text-sm text-gray-900">
              {userData.name || 'Not set'}
            </p>
          </div>
        )}

        {/* Bio */}
        {isEditing ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Bio
            </label>
            <textarea
              value={editForm.bio}
              onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="Tell us about yourself..."
            />
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Bio
            </label>
            <p className="text-sm text-gray-900 whitespace-pre-wrap">
              {userData.bio || 'No bio added yet'}
            </p>
          </div>
        )}

        {/* Contact Information */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {isEditing ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="your@email.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Website
                </label>
                <input
                  type="url"
                  value={editForm.website}
                  onChange={(e) => setEditForm({ ...editForm, website: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="https://yourwebsite.com"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <p className="text-sm text-gray-900">
                  {userData.email || 'Not set'}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Website
                </label>
                <p className="text-sm text-gray-900">
                  {userData.website ? (
                    <a href={userData.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      {userData.website}
                    </a>
                  ) : (
                    'Not set'
                  )}
                </p>
              </div>
            </>
          )}
        </div>

        {/* Social Links */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Social Links
          </label>
          {isEditing ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Twitter</label>
                <input
                  type="text"
                  value={editForm.twitter}
                  onChange={(e) => setEditForm({ ...editForm, twitter: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="@username"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">GitHub</label>
                <input
                  type="text"
                  value={editForm.github}
                  onChange={(e) => setEditForm({ ...editForm, github: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="username"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Behance</label>
                <input
                  type="text"
                  value={editForm.behance}
                  onChange={(e) => setEditForm({ ...editForm, behance: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="username"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Dribbble</label>
                <input
                  type="text"
                  value={editForm.dribbble}
                  onChange={(e) => setEditForm({ ...editForm, dribbble: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="username"
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {userData.socialLinks.twitter && (
                <a
                  href={`https://twitter.com/${userData.socialLinks.twitter.replace('@', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline"
                >
                  Twitter: {userData.socialLinks.twitter}
                </a>
              )}
              {userData.socialLinks.github && (
                <a
                  href={`https://github.com/${userData.socialLinks.github}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline"
                >
                  GitHub: {userData.socialLinks.github}
                </a>
              )}
              {userData.socialLinks.behance && (
                <a
                  href={`https://behance.net/${userData.socialLinks.behance}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline"
                >
                  Behance: {userData.socialLinks.behance}
                </a>
              )}
              {userData.socialLinks.dribbble && (
                <a
                  href={`https://dribbble.com/${userData.socialLinks.dribbble}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline"
                >
                  Dribbble: {userData.socialLinks.dribbble}
                </a>
              )}
              {!userData.socialLinks.twitter && !userData.socialLinks.github && 
               !userData.socialLinks.behance && !userData.socialLinks.dribbble && (
                <p className="text-sm text-gray-500">No social links added</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Worker Notifications Section */}
      <div className="mt-8">
        <WorkerNotifications />
      </div>

      {/* Completed Jobs Section */}
      <div className="mt-8">
        <CompletedJobs />
      </div>
    </div>
    </>
  )
}


