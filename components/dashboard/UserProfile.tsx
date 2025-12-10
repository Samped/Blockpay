'use client'

import { useState, useEffect, useRef } from 'react'
import { usePublicClient, useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi'
import { parseEther, decodeErrorResult, formatUnits } from 'viem'
import { intuitionClient, Atom, TrustScore, Triple } from '@/lib/intuitionClient'
import { INTUITION_CONTRACT_ABI, INTUITION_CONTRACT_ADDRESS, atomDataToBytes } from '@/lib/intuitionContract'
import { JOB_POOL_ADDRESS, JOB_POOL_ABI, JobStatus } from '@/lib/jobPoolContract'
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
  
  // Count completed jobs from localStorage (more robust)
  const countCompletedJobsFromStorage = () => {
    if (!address) return 0
    try {
      const addressLower = address.toLowerCase()
      const creatorCompletedJobsKey = `creator_completed_jobs_${addressLower}`
      
      // First, try to get from the list
      const jobIds = JSON.parse(localStorage.getItem(creatorCompletedJobsKey) || '[]')
      let count = Array.isArray(jobIds) ? jobIds.length : 0
      
      // Also check all completed_job keys as a fallback
      let foundKeys = 0
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith(`completed_job_`) && key.includes(addressLower)) {
          foundKeys++
        }
      }
      
      // Use the maximum of both methods
      const finalCount = Math.max(count, foundKeys)
      
      console.log('[CompletedJobs] Count from storage:', {
        fromList: count,
        fromKeys: foundKeys,
        finalCount,
        address: addressLower
      })
      
      return finalCount
    } catch (err) {
      console.error('[CompletedJobs] Error counting from storage:', err)
      return 0
    }
  }

  // Count completed jobs from contract (fallback)
  const countCompletedJobsFromContract = async (): Promise<number> => {
    if (!address || !publicClient) return 0
    try {
      const jobCount = await publicClient.readContract({
        address: JOB_POOL_ADDRESS as `0x${string}`,
        abi: JOB_POOL_ABI,
        functionName: 'jobCount',
      }) as bigint

      let completedCount = 0
      const totalJobs = Number(jobCount)
      
      // Check each job to see if it's completed and owned by this address
      for (let i = 1; i <= totalJobs; i++) {
        try {
          const jobData = await publicClient.readContract({
            address: JOB_POOL_ADDRESS as `0x${string}`,
            abi: JOB_POOL_ABI,
            functionName: 'jobs',
            args: [BigInt(i)],
          }) as any
          
          const creator = (jobData[0] as string).toLowerCase()
          const status = jobData[3] as number
          
          if (creator === address.toLowerCase() && status === JobStatus.Completed) {
            completedCount++
          }
        } catch (err) {
          // Skip jobs that can't be read
          continue
        }
      }
      
      console.log('[CompletedJobs] Count from contract:', completedCount)
      return completedCount
    } catch (err) {
      console.error('[CompletedJobs] Error counting from contract:', err)
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
          trustScore: profileData.trustScore?.score,
          profileDataKeys: Object.keys(profileData.profileData || {}),
          profileDataSample: profileData.profileData
        })
        
        const { atom: userAtom, trustScore, completedJobs: apiCompletedJobs, createdArtworks, profileData: atomData } = profileData
        
        console.log('[DEBUG] Extracted data:', {
          hasUserAtom: !!userAtom,
          atomDataKeys: Object.keys(atomData || {}),
          name: atomData?.name,
          bio: atomData?.bio,
          email: atomData?.email
        })
        
        // Count completed jobs from localStorage (more accurate)
        const storageCompletedJobs = countCompletedJobsFromStorage()
        
        // If no jobs in storage, try contract as fallback
        let contractCompletedJobs = 0
        if (storageCompletedJobs === 0 && publicClient) {
          contractCompletedJobs = await countCompletedJobsFromContract()
        }
        
        // Prioritize localStorage count, then contract, then API
        const completedJobs = storageCompletedJobs > 0 
          ? storageCompletedJobs 
          : (contractCompletedJobs > 0 ? contractCompletedJobs : apiCompletedJobs)
        
        console.log('[CompletedJobs] Final count:', {
          storageCount: storageCompletedJobs,
          contractCount: contractCompletedJobs,
          apiCount: apiCompletedJobs,
          finalCount: completedJobs
        })

        if (userAtom) {
          // Also check atom.data directly as a fallback if atomData is empty
          let finalAtomData = atomData || {}
          
          // If atomData is empty, try to extract from userAtom.data
          if (Object.keys(finalAtomData).length === 0 && userAtom.data) {
            console.log('[FALLBACK] atomData is empty, checking userAtom.data directly...')
            try {
              if (typeof userAtom.data === 'string') {
                finalAtomData = JSON.parse(userAtom.data)
              } else if (typeof userAtom.data === 'object' && userAtom.data !== null) {
                finalAtomData = userAtom.data
              }
              console.log('[FALLBACK] Extracted from userAtom.data:', Object.keys(finalAtomData))
            } catch (e) {
              console.warn('[FALLBACK] Failed to parse userAtom.data:', e)
            }
          }
          
          const newUserData = {
            atom: userAtom,
            trustScore,
            completedJobs,
            createdArtworks,
            bio: finalAtomData?.bio || finalAtomData?.description || '',
            name: finalAtomData?.name || finalAtomData?.displayName || '',
            email: finalAtomData?.email || '',
            website: finalAtomData?.website || finalAtomData?.url || '',
            socialLinks: {
              twitter: finalAtomData?.twitter || '',
              github: finalAtomData?.github || '',
              behance: finalAtomData?.behance || '',
              dribbble: finalAtomData?.dribbble || '',
            },
          }
          setUserData(newUserData)
          
          // Initialize editForm with fetched data
          setEditForm({
            name: newUserData.name,
            bio: newUserData.bio,
            email: newUserData.email,
            website: newUserData.website,
            twitter: newUserData.socialLinks.twitter || '',
            github: newUserData.socialLinks.github || '',
            behance: newUserData.socialLinks.behance || '',
            dribbble: newUserData.socialLinks.dribbble || '',
          })
          
          console.log('[SUCCESS] User data set:', {
            name: newUserData.name,
            bio: newUserData.bio,
            email: newUserData.email,
            website: newUserData.website,
            hasAtom: !!newUserData.atom,
            trustScore: newUserData.trustScore?.score,
            atomDataKeys: Object.keys(finalAtomData),
            source: Object.keys(atomData || {}).length > 0 ? 'triples' : 'atom.data'
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

  // Debug: Log current state (must be before any conditional returns)
  useEffect(() => {
    if (address && !loading) {
      console.log('[UserProfile] Current state:', {
        hasAtom: !!userData.atom,
        atomId: userData.atom?.id || userData.atom?.term_id,
        name: userData.name,
        bio: userData.bio,
        email: userData.email,
        trustScore: userData.trustScore?.score
      })
    }
  }, [userData, address, loading])

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
    
    console.log('Updating profile on-chain with atom ID:', atomId)
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

  // Debug: Log current state (must be before any conditional returns)
  useEffect(() => {
    if (address && !loading) {
      console.log('[UserProfile] Current state:', {
        hasAtom: !!userData.atom,
        atomId: userData.atom?.id || userData.atom?.term_id,
        name: userData.name,
        bio: userData.bio,
        email: userData.email,
        trustScore: userData.trustScore?.score
      })
    }
  }, [userData, address, loading])

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
  // Only show this if we're not loading AND we've confirmed there's no atom
  if (!loading && !userData.atom) {
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
            You haven't created a profile yet, or it hasn't been indexed yet. If you just created a profile, wait 10-30 seconds and refresh.
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
      setLoading(true)
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

      <div className="bg-white rounded-2xl shadow-card p-8">
      <div className="flex items-center justify-between mb-8 pb-6 border-b border-gray-200">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Profile Information</h2>
          <p className="text-sm text-gray-500">Manage your personal details and social links</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            className="p-2.5 rounded-lg border border-gray-300 text-gray-600 hover:border-primary hover:text-primary hover:bg-primary/5 transition-all"
            title="Refresh profile data"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className="p-2.5 rounded-lg border border-gray-300 text-gray-600 hover:border-primary hover:text-primary hover:bg-primary/5 transition-all"
              title="Edit profile"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
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
              className="p-2.5 rounded-lg border border-gray-300 text-gray-600 hover:border-gray-400 hover:bg-gray-50 transition-all"
              title="Cancel editing"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <button
              onClick={handleSave}
              disabled={isWriting || isConfirming || loading}
              className="p-2.5 rounded-lg bg-primary text-white hover:bg-[#0052CC] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              title="Save changes"
            >
              {isWriting || isConfirming ? (
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          </div>
          )}
        </div>
      </div>

      <div className="space-y-6">
        {/* Wallet Address & Balance */}
        <div className="bg-white rounded-xl p-5 border border-gray-200">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Wallet Address
          </label>
          <p className="text-base text-gray-900 font-mono bg-gray-50 px-4 py-3 rounded-lg border border-gray-200">
            {address}
          </p>
          {walletBalance !== null && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-sm text-gray-600">Balance:</span>
              <span className="text-lg font-bold text-gray-900">
                {Number(walletBalance).toLocaleString(undefined, { maximumFractionDigits: 4 })}
              </span>
              <span className="text-sm font-medium text-gray-600">TRUST</span>
            </div>
          )}
        </div>

        {/* Trust Score & Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-5 border border-gray-200">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Trust Score</div>
            <div className="text-3xl font-bold text-gray-900">
              {userData.trustScore?.score.toLocaleString() || '0'}
            </div>
          </div>
          <div className="bg-white rounded-xl p-5 border border-gray-200">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Trust Level</div>
            <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-semibold ${trustInfo.color} border`}>
              {trustInfo.level}
            </span>
          </div>
          <div className="bg-white rounded-xl p-5 border border-gray-200">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Completed Jobs</div>
            <div className="text-3xl font-bold text-gray-900">
              {userData.completedJobs}
            </div>
          </div>
          <div className="bg-white rounded-xl p-5 border border-gray-200">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Artworks</div>
            <div className="text-3xl font-bold text-gray-900">
              {userData.createdArtworks}
            </div>
          </div>
        </div>

        {/* Name */}
        {isEditing ? (
          <div className="bg-white rounded-xl p-5 border border-gray-200">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Name
            </label>
            <input
              type="text"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              placeholder="Your name"
            />
          </div>
        ) : (
          <div className="bg-white rounded-xl p-5 border border-gray-200">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Name
            </label>
            <p className="text-xl font-bold text-gray-900">
              {userData.name || 'Not set'}
            </p>
          </div>
        )}

        {/* Bio */}
        {isEditing ? (
          <div className="bg-white rounded-xl p-5 border border-gray-200">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Bio
            </label>
            <textarea
              value={editForm.bio}
              onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })}
              rows={4}
              className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all resize-none"
              placeholder="Tell us about yourself..."
            />
          </div>
        ) : (
          <div className="bg-white rounded-xl p-5 border border-gray-200">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Bio
            </label>
            <p className="text-base text-gray-800 leading-relaxed whitespace-pre-wrap">
              {userData.bio || 'No bio added yet'}
            </p>
          </div>
        )}

        {/* Contact Information */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {isEditing ? (
            <>
              <div className="bg-white rounded-xl p-5 border border-gray-200">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Email
                </label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                  placeholder="your@email.com"
                />
              </div>
              <div className="bg-white rounded-xl p-5 border border-gray-200">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Website
                </label>
                <input
                  type="url"
                  value={editForm.website}
                  onChange={(e) => setEditForm({ ...editForm, website: e.target.value })}
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                  placeholder="https://yourwebsite.com"
                />
              </div>
            </>
          ) : (
            <>
              <div className="bg-white rounded-xl p-5 border border-gray-200">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Email
                </label>
                <p className="text-base font-medium text-gray-900 break-all">
                  {userData.email ? (
                    <a href={`mailto:${userData.email}`} className="text-primary hover:underline">
                      {userData.email}
                    </a>
                  ) : (
                    <span className="text-gray-400">Not set</span>
                  )}
                </p>
              </div>
              <div className="bg-white rounded-xl p-5 border border-gray-200">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Website
                </label>
                <p className="text-base font-medium text-gray-900">
                  {userData.website ? (
                    <a href={userData.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">
                      {userData.website}
                    </a>
                  ) : (
                    <span className="text-gray-400">Not set</span>
                  )}
                </p>
              </div>
            </>
          )}
        </div>

        {/* Social Links */}
        <div className="bg-white rounded-xl p-5 border border-gray-200">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
            Social Links
          </label>
          {isEditing ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Twitter</label>
                <input
                  type="text"
                  value={editForm.twitter}
                  onChange={(e) => setEditForm({ ...editForm, twitter: e.target.value })}
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                  placeholder="@username"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">GitHub</label>
                <input
                  type="text"
                  value={editForm.github}
                  onChange={(e) => setEditForm({ ...editForm, github: e.target.value })}
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                  placeholder="username"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Behance</label>
                <input
                  type="text"
                  value={editForm.behance}
                  onChange={(e) => setEditForm({ ...editForm, behance: e.target.value })}
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                  placeholder="username"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Dribbble</label>
                <input
                  type="text"
                  value={editForm.dribbble}
                  onChange={(e) => setEditForm({ ...editForm, dribbble: e.target.value })}
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                  placeholder="username"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {userData.socialLinks.twitter && (
                <a
                  href={`https://twitter.com/${userData.socialLinks.twitter.replace('@', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200 hover:border-primary hover:shadow-md transition-all group"
                >
                  <svg className="w-5 h-5 text-[#1DA1F2]" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2c9 5 20 0 20-11.5a4.5 4.5 0 00-.08-.83A7.72 7.72 0 0023 3z"/>
                  </svg>
                  <span className="text-base font-medium text-gray-900 group-hover:text-primary transition-colors">
                    {userData.socialLinks.twitter}
                  </span>
                </a>
              )}
              {userData.socialLinks.github && (
                <a
                  href={`https://github.com/${userData.socialLinks.github}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200 hover:border-primary hover:shadow-md transition-all group"
                >
                  <svg className="w-5 h-5 text-gray-900" fill="currentColor" viewBox="0 0 24 24">
                    <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd"/>
                  </svg>
                  <span className="text-base font-medium text-gray-900 group-hover:text-primary transition-colors">
                    {userData.socialLinks.github}
                  </span>
                </a>
              )}
              {userData.socialLinks.behance && (
                <a
                  href={`https://behance.net/${userData.socialLinks.behance}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200 hover:border-primary hover:shadow-md transition-all group"
                >
                  <svg className="w-5 h-5 text-[#1769FF]" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M22 7h-7v-2h7v2zm1.726 10c-.442 1.297-2.029 3-5.101 3-3.074 0-5.564-1.729-5.564-5.675 0-3.91 2.325-5.92 5.466-5.92 3.082 0 4.964 1.782 5.375 4.426.078.506.109 1.188.095 2.14h-8.027c.13 3.211 3.483 3.312 4.925 2.059.3-.504.473-1.115.473-1.823h4.915zm-7.688-6.5c0-2.266-1.329-3.5-3.01-3.5-1.673 0-3.01 1.234-3.01 3.5 0 2.266 1.337 3.5 3.01 3.5 1.681 0 3.01-1.234 3.01-3.5zM5.526 6.5c-.552 0-1 .45-1 1s.448 1 1 1 1-.45 1-1-.448-1-1-1zm-2.776 1.5h5.599c.551 0 .999.45.999 1v11h-2.827v-4.333H1.854v4.333H0V9c0-.55.448-1 .999-1zm16.75 5.75c0 .553-.448 1-1 1h-4.001c.551 0 .999.45.999 1 0 .553-.448 1-.999 1h-2.001c-.551 0-.999-.447-.999-1v-5c0-.553.448-1 .999-1h5.002c.551 0 .999.447.999 1v3z"/>
                  </svg>
                  <span className="text-base font-medium text-gray-900 group-hover:text-primary transition-colors">
                    {userData.socialLinks.behance}
                  </span>
                </a>
              )}
              {userData.socialLinks.dribbble && (
                <a
                  href={`https://dribbble.com/${userData.socialLinks.dribbble}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200 hover:border-primary hover:shadow-md transition-all group"
                >
                  <svg className="w-5 h-5 text-[#EA4C89]" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 24C5.385 24 0 18.615 0 12S5.385 0 12 0s12 5.385 12 12-5.385 12-12 12zm10.12-10.358c-.35-.11-3.17-.953-6.384-.438 1.34 3.684 1.887 6.684 1.992 7.308 2.3-1.555 3.936-4.02 4.395-6.87zm-6.115 7.808c-.153-.9-.75-4.032-2.19-7.77l-.066.02c-5.79 2.015-7.86 6.025-8.003 6.4 1.23.66 2.80 1.048 4.435 1.048 1.485 0 2.93-.256 4.212-.68zm-9.96-5.09c.232-.4 3.045-5.055 8.332-6.765.135-.045.27-.084.405-.12-.26-.585-.54-1.167-.832-1.72C7.17 11.775 2.206 11.71 1.756 11.7l-.004.312c0 2.633.998 5.037 2.634 6.855zm-2.42-8.955c.232.4 3.045 5.055 8.332 6.765.135.045.27.084.405.12.26-.585.54-1.167.832-1.72-6.155-2.83-10.867-2.88-11.569-2.88zm11.774 2.953c-3.225-.516-6.03.325-6.414.438a10.12 10.12 0 0 1 4.395-6.87c.105.624.652 3.684 2.02 7.308zm-5.84 2.55c.232-.4 3.045-5.055 8.332-6.765.135-.045.27-.084.405-.12-.26-.585-.54-1.167-.832-1.72-6.155 2.83-10.867 2.88-11.569 2.88l.004-.312c0-1.633.998-3.037 2.634-4.855z"/>
                  </svg>
                  <span className="text-base font-medium text-gray-900 group-hover:text-primary transition-colors">
                    {userData.socialLinks.dribbble}
                  </span>
                </a>
              )}
              {!userData.socialLinks.twitter && !userData.socialLinks.github && 
               !userData.socialLinks.behance && !userData.socialLinks.dribbble && (
                <p className="text-sm text-gray-400 italic">No social links added</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Worker Notifications Section */}
      <div className="mt-8">
        <WorkerNotifications />
      </div>
    </div>
    </>
  )
}


