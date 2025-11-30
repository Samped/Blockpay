'use client'

import { useState, useEffect, useRef } from 'react'
import { usePublicClient, useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi'
import { parseEther, decodeErrorResult } from 'viem'
import { intuitionClient, Atom, TrustScore, Triple } from '@/lib/intuitionClient'
import { INTUITION_CONTRACT_ABI, INTUITION_CONTRACT_ADDRESS, atomDataToBytes } from '@/lib/intuitionContract'

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
        console.log('🔍 Fetching user profile for address:', address)
        console.log('📡 Public client available:', !!publicClient)

        // Fetch user profile using GraphQL API, passing publicClient to check contract
        const profileData = await intuitionClient.getUserProfileData(address, publicClient || undefined)
        
        console.log('📊 Profile data received:', {
          hasAtom: !!profileData.atom,
          atomId: profileData.atom?.id,
          trustScore: profileData.trustScore?.score
        })
        
        const { atom: userAtom, trustScore, completedJobs, createdArtworks, profileData: atomData } = profileData

        if (!userAtom) {
          console.warn('⚠️ No atom found via getUserProfileData, trying direct query...')
          
          // Try a direct query to see if ANY atoms exist for this creator
          try {
            const directQuery = `
              query CheckAtoms($address: String!) {
                atoms(
                  where: { creator_id: { _eq: $address } }
                  limit: 10
                  order_by: { created_at: desc }
                ) {
                  term_id
                  type
                  label
                  emoji
                  image
                  data
                  created_at
                  creator_id
                }
              }
            `
            const response = await fetch('https://testnet.intuition.sh/v1/graphql', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                query: directQuery,
                variables: { address: address.toLowerCase() }
              })
            })
            const result = await response.json()
            if (result.data?.atoms?.length > 0) {
              console.log('✅ Found', result.data.atoms.length, 'atoms created by this address')
              
              // Find the best matching User profile atom
              let bestAtom: any = null
              let bestParsedData: any = {}
              let bestScore = 0
              
              result.data.atoms.forEach((atom: any, idx: number) => {
                // Try to parse data to see what's in it
                let parsedData: any = {}
                try {
                  if (typeof atom.data === 'string') {
                    // Skip if it's just a type description like "json object" or "JsonObject"
                    const dataStr = atom.data.trim()
                    if ((dataStr.toLowerCase() === 'json object' || dataStr === 'JsonObject') && dataStr.length < 50) {
                      console.log(`      ⚠️ Skipping atom ${idx + 1} - data is just type description: "${dataStr}"`)
                      parsedData = {}
                    } else {
                      try {
                        parsedData = JSON.parse(atom.data)
                        console.log(`      ✅ Successfully parsed JSON data for atom ${idx + 1}`)
                      } catch (parseErr) {
                        // If it's not valid JSON, check if it's a simple string value
                        if (atom.data.length > 0 && atom.data.length < 200) {
                          // Might be a simple string, not JSON
                          parsedData = { value: atom.data }
                        } else {
                          throw parseErr
                        }
                      }
                    }
                  } else if (atom.data && typeof atom.data === 'object') {
                    parsedData = atom.data
                    console.log(`      ✅ Using atom ${idx + 1} data as object`)
                  }
                } catch (e) {
                  console.warn(`      ⚠️ Could not parse atom ${idx + 1} data:`, e)
                  parsedData = {}
                }
                
                console.log(`   ${idx + 1}. Term ID: ${atom.term_id?.substring(0, 30)}`)
                console.log(`      Type: ${atom.type || 'null'}`)
                console.log(`      Label: ${atom.label || 'null'}`)
                console.log(`      Has data: ${!!atom.data}`)
                console.log(`      Data keys: ${Object.keys(parsedData).slice(0, 10).join(', ')}`)
                console.log(`      Parsed data sample:`, {
                  name: parsedData.name,
                  bio: parsedData.bio?.substring(0, 30),
                  email: parsedData.email,
                  twitter: parsedData.twitter
                })
                
                // Check if this looks like a User profile
                // Profile data indicators
                const hasName = !!(parsedData.name)
                const hasBio = !!(parsedData.bio)
                const hasEmail = !!(parsedData.email)
                const hasSocial = !!(parsedData.twitter || parsedData.github || parsedData.behance || parsedData.dribbble)
                const hasProfileData = hasName || hasBio || hasEmail || hasSocial
                
                // Type indicators
                const isUserType = atom.type === 'User' || parsedData.type === 'User'
                const hasAddress = !!(parsedData.address || parsedData.wallet)
                
                // Label indicators (skip "json object" labels)
                const hasValidLabel = atom.label && 
                  !atom.label.toLowerCase().includes('json') && 
                  atom.label !== 'JsonObject' &&
                  atom.label.length > 0
                
                const isUserProfile = isUserType || hasAddress || hasProfileData || (hasValidLabel && hasProfileData)
                
                console.log(`      Profile check for atom ${idx + 1}:`, {
                  isUserType,
                  hasAddress,
                  hasProfileData,
                  hasName,
                  hasBio,
                  hasEmail,
                  hasSocial,
                  hasValidLabel,
                  isUserProfile
                })
                
                if (isUserProfile) {
                  // Score atoms based on how much profile data they have
                  const profileDataScore = [
                    parsedData.name,
                    parsedData.bio,
                    parsedData.email,
                    parsedData.twitter,
                    parsedData.github,
                    parsedData.website,
                    parsedData.behance,
                    parsedData.dribbble
                  ].filter(Boolean).length
                  
                  console.log(`      ✅ This is a User profile! Score: ${profileDataScore}`)
                  
                  if (profileDataScore > bestScore) {
                    bestAtom = atom
                    bestParsedData = parsedData
                    bestScore = profileDataScore
                    console.log(`      ⭐ New best atom! (Score: ${bestScore})`)
                  }
                } else {
                  console.log(`      ⚠️ Not a User profile`)
                }
              })
              
              // Use the best matching atom if found, OR use the first atom if we have any atoms at all
              // (even if it doesn't have a high score, it's better than nothing)
              if (bestAtom) {
                // If we have a good match (score > 0), use it
                // Otherwise, if we have ANY atom, use the first one (might be a profile we just haven't recognized)
                if (bestScore === 0 && result.data.atoms.length > 0) {
                  // Use the first atom as fallback
                  const firstAtom = result.data.atoms[0]
                  let firstParsedData: any = {}
                  
                  try {
                    if (typeof firstAtom.data === 'string') {
                      const dataStr = firstAtom.data.trim()
                      if (!(dataStr.toLowerCase() === 'json object' || dataStr === 'JsonObject') || dataStr.length >= 50) {
                        try {
                          firstParsedData = JSON.parse(firstAtom.data)
                        } catch {}
                      }
                    } else if (firstAtom.data && typeof firstAtom.data === 'object') {
                      firstParsedData = firstAtom.data
                    }
                  } catch {}
                  
                  bestAtom = firstAtom
                  bestParsedData = firstParsedData
                  console.log('⚠️ No high-scoring profile found, using first atom as fallback')
                }
                
                console.log('✅✅✅ Using atom as user profile!')
                console.log('   Atom term_id:', bestAtom.term_id?.substring(0, 30))
                console.log('   Profile data score:', bestScore)
                console.log('   Label:', bestAtom.label)
                console.log('   Type:', bestAtom.type)
                console.log('   Profile data:', {
                  name: bestParsedData.name,
                  bio: bestParsedData.bio?.substring(0, 50),
                  email: bestParsedData.email,
                  twitter: bestParsedData.twitter,
                  github: bestParsedData.github,
                  dataKeys: Object.keys(bestParsedData)
                })
                
                const foundAtom = {
                  ...bestAtom,
                  id: bestAtom.term_id,
                  term_id: bestAtom.term_id,
                  data: bestParsedData,
                  type: bestAtom.type || bestParsedData.type || 'User'
                }
                
                // Get name from parsed data, skip label if it's "json object"
                let displayName = bestParsedData.name
                // If no name in parsed data, try label (but skip "json object" type labels)
                if (!displayName && bestAtom.label) {
                  const labelLower = bestAtom.label.toLowerCase()
                  if (!labelLower.includes('json') && bestAtom.label !== 'JsonObject' && bestAtom.label.length > 0) {
                    displayName = bestAtom.label
                    console.log(`   Using label as name: "${displayName}"`)
                  }
                }
                // If still no name, try to extract from other fields
                if (!displayName) {
                  if (bestParsedData.bio) {
                    displayName = bestParsedData.bio.substring(0, 30)
                  } else if (bestParsedData.email) {
                    displayName = bestParsedData.email.split('@')[0]
                  } else if (bestParsedData.twitter) {
                    displayName = bestParsedData.twitter.replace('@', '')
                  } else if (bestParsedData.github) {
                    displayName = bestParsedData.github
                  }
                }
                
                console.log(`   Final display name: "${displayName}"`)
                
                const userDataToSet = {
                  atom: foundAtom,
                  trustScore: null,
                  completedJobs: 0,
                  createdArtworks: 0,
                  bio: bestParsedData.bio || '',
                  name: displayName || '',
                  email: bestParsedData.email || '',
                  website: bestParsedData.website || '',
                  socialLinks: {
                    twitter: bestParsedData.twitter || bestParsedData.socialLinks?.twitter,
                    github: bestParsedData.github || bestParsedData.socialLinks?.github,
                    behance: bestParsedData.behance || bestParsedData.socialLinks?.behance,
                    dribbble: bestParsedData.dribbble || bestParsedData.socialLinks?.dribbble,
                  },
                }
                
                console.log('📝 Setting user data:', {
                  hasAtom: !!userDataToSet.atom,
                  atomId: userDataToSet.atom?.id?.substring(0, 30),
                  name: userDataToSet.name,
                  bio: userDataToSet.bio?.substring(0, 30),
                  email: userDataToSet.email,
                  twitter: userDataToSet.socialLinks.twitter
                })
                
                setUserData(userDataToSet)
                setEditForm({
                  name: displayName || '',
                  bio: bestParsedData.bio || '',
                  email: bestParsedData.email || '',
                  website: bestParsedData.website || '',
                  twitter: bestParsedData.twitter || bestParsedData.socialLinks?.twitter || '',
                  github: bestParsedData.github || bestParsedData.socialLinks?.github || '',
                  behance: bestParsedData.behance || bestParsedData.socialLinks?.behance || '',
                  dribbble: bestParsedData.dribbble || bestParsedData.socialLinks?.dribbble || '',
                })
                setLoading(false)
                console.log('✅✅✅ Profile data set successfully! Dashboard should now show profile.')
                return
              } else {
                console.log('⚠️ Found atoms but none could be used as profile')
              }
            } else {
              console.log('🔍 Direct query also found 0 atoms - they may not be indexed yet')
            }
          } catch (checkError) {
            console.error('❌ Error in diagnostic query:', checkError)
          }
        }

        // Ensure atom has id set from term_id (only if userAtom exists)
        if (userAtom) {
          if (!userAtom.id && userAtom.term_id) {
            userAtom.id = userAtom.term_id
          }
          
          // Extract user data from atom
          setUserData({
            atom: userAtom,
            trustScore,
            completedJobs,
            createdArtworks,
            bio: atomData.bio || '',
            name: atomData.name || userAtom.label || '',
            email: atomData.email || '',
            website: atomData.website || '',
            socialLinks: {
              twitter: atomData.twitter || atomData.socialLinks?.twitter,
              github: atomData.github || atomData.socialLinks?.github,
              behance: atomData.behance || atomData.socialLinks?.behance,
              dribbble: atomData.dribbble || atomData.socialLinks?.dribbble,
            },
          })

          // Set edit form with current data
          setEditForm({
            name: atomData.name || '',
            bio: atomData.bio || '',
            email: atomData.email || '',
            website: atomData.website || '',
            twitter: atomData.twitter || atomData.socialLinks?.twitter || '',
            github: atomData.github || atomData.socialLinks?.github || '',
            behance: atomData.behance || atomData.socialLinks?.behance || '',
            dribbble: atomData.dribbble || atomData.socialLinks?.dribbble || '',
          })
        }
      } catch (error) {
        console.error('❌ Error fetching user data:', error)
      } finally {
        setLoading(false)
      }
    }

    // Store the function in ref for manual refresh
    fetchUserDataRef.current = fetchUserData
    
    // Only fetch on mount or when address changes (not auto-refresh)
    fetchUserData()
  }, [address, publicClient])

  const handleSave = async () => {
    const atomId = userData.atom?.term_id || userData.atom?.id
    if (!atomId) {
      console.error('Cannot save: No atom ID or term_id found')
      return
    }

    if (!isConnected || !address) {
      console.error('❌ Wallet not connected:', { isConnected, address })
      alert('Please connect your wallet to update your profile')
      return
    }

    if (chain?.id !== 13579) {
      alert('Please switch to Intuition Testnet (Chain ID: 13579) to update your profile')
      return
    }
    
    console.log('💾 Updating profile on-chain with atom ID:', atomId)
    console.log('✅ Wallet connected:', { isConnected, address, chainId: chain?.id })

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
          console.log('📋 Reading minimum deposit from contract...')
          // Try to read getMinAtomDeposit
          const minDeposit = await publicClient.readContract({
            address: INTUITION_CONTRACT_ADDRESS,
            abi: INTUITION_CONTRACT_ABI,
            functionName: 'getMinAtomDeposit',
          }) as bigint | undefined
          
          if (minDeposit && minDeposit > 0n) {
            minimumDeposit = minDeposit
            console.log('✓ Minimum deposit from contract:', minimumDeposit.toString(), 'wei')
            console.log('  (', (Number(minimumDeposit) / 1e18).toFixed(6), 'tTRUST)')
          } else {
            console.warn('⚠️ Could not read minimum deposit, using default 0.01 tTRUST')
          }
        } catch (configError: any) {
          console.warn('⚠️ Could not read minimum deposit from contract, using default 0.01 tTRUST:', configError.message)
        }
      }

      // IMPORTANT: Based on contract docs, msg.value MUST equal sum(assets[])
      // The minimum deposit on testnet is 0.01 tTRUST (not 0.001!)
      // Use the minimum deposit amount - EXACTLY like UserInitialization.tsx
      const assetDeposit = minimumDeposit
      const totalValue = assetDeposit // msg.value must equal sum(assets[])
      
      console.log('💡 Using deposit amount:', assetDeposit.toString(), 'wei')
      console.log('   (', (Number(assetDeposit) / 1e18).toFixed(6), 'tTRUST)')

      console.log('=== Updating profile atom on-chain ===')
      console.log('Contract:', INTUITION_CONTRACT_ADDRESS)
      console.log('Function: createAtoms(bytes[] data, uint256[] assets) payable')
      console.log('Atom data (bytes):', atomDataBytes.substring(0, 100) + '...')
      console.log('Minimum deposit:', minimumDeposit.toString(), 'wei')
      console.log('Total in assets[]:', assetDeposit.toString(), 'wei')
      console.log('Total msg.value:', totalValue.toString(), 'wei')
      console.log('Total msg.value (tTRUST):', (Number(totalValue) / 1e18).toFixed(6))
      console.log('⚠️ NOTE: assets[] = [minimumDeposit], msg.value = sum(assets[])')

      // Prepare function arguments - EXACTLY like UserInitialization.tsx
      // assets[] contains only the deposit, msg.value contains fee + deposit
      const functionArgs: [`0x${string}`[], bigint[]] = [
        [atomDataBytes], // bytes[] - array with one atom data
        [assetDeposit]   // uint256[] - array with deposit amount (NOT including fee)
      ]

      // Simulate transaction first to catch errors - EXACTLY like UserInitialization.tsx
      if (publicClient && address) {
        try {
          console.log('🔍 Simulating transaction to check for errors...')
          const simulation = await publicClient.simulateContract({
            account: address as `0x${string}`,
            address: INTUITION_CONTRACT_ADDRESS,
            abi: INTUITION_CONTRACT_ABI,
            functionName: 'createAtoms',
            args: functionArgs,
            value: totalValue // msg.value = sum(assets[])
          })
          console.log('✅ Simulation successful - transaction should work')
          console.log('Simulation result:', simulation)
        } catch (simError: any) {
          console.error('❌ Simulation failed - transaction will revert!')
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
            console.error('⚠️ Error 0xb4856ebc - contract rejecting duplicate atom creation')
            console.log('💡 Falling back to GraphQL update instead of on-chain creation')
            
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
          alert(`⚠️ ${errorMessage}. Check browser console (F12) for full details.`)
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

      console.log('✓ Transaction request sent to wallet')
      // Note: Transaction confirmation and GraphQL update will be handled in useEffect below
    } catch (error: any) {
      console.error('Error updating profile:', error)
      setLoading(false)
      alert(`Failed to update profile: ${error.message || 'Unknown error'}`)
    }
  }

  // Handle transaction confirmation and update GraphQL
  useEffect(() => {
    if (isConfirmed && hash) {
      console.log('✅ Profile update transaction confirmed! Tx:', hash)
      
      const updateAfterConfirmation = async () => {
        try {
          // Wait a bit for GraphQL indexing
          await new Promise(resolve => setTimeout(resolve, 3000))

          // Update GraphQL with the new data (optional - for faster UI updates)
          const atomId = userData.atom?.term_id || userData.atom?.id
          if (atomId) {
            const updatedData = {
              ...(userData.atom.data || {}),
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

            try {
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
                console.warn('GraphQL update failed, but on-chain update succeeded:', result.errors)
              }
            } catch (graphqlError) {
              console.warn('Could not update GraphQL, but on-chain update succeeded:', graphqlError)
            }
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
              data: {
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
            }
          })

          setIsEditing(false)
          setLoading(false)
          console.log('✅ Profile updated successfully on-chain!')
          setSuccessMessage(`Profile updated successfully! Transaction: ${hash.substring(0, 10)}...${hash.substring(hash.length - 8)}`)
          setShowSuccessToast(true)
        } catch (error) {
          console.error('Error in post-confirmation update:', error)
          setLoading(false)
        }
      }

      updateAfterConfirmation()
    }
  }, [isConfirmed, hash, editForm, userData])

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
                  onClick={() => {
                    window.location.reload()
                  }}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors mr-2"
                >
                  🔄 Refresh
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
                💡 If you created a profile on-chain, it may take 10-30 seconds for GraphQL to index it.
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
            🔄
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
        {/* Wallet Address */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Wallet Address
          </label>
          <p className="text-sm text-gray-900 font-mono bg-gray-50 px-3 py-2 rounded-lg">
            {address}
          </p>
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
    </div>
    </>
  )
}


