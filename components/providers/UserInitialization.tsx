// CORRECTED UserInitialization.tsx

// Key insight: Creating atoms is FREE (no ETH deposit required)

// Staking ETH is only for signaling trust/relevance on existing atoms



'use client'



import { useEffect, useState, useRef } from 'react'

import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSimulateContract, useWalletClient, usePublicClient } from 'wagmi'

import { createPortal } from 'react-dom'

import { parseEther, toBytes, bytesToHex, keccak256, encodePacked, decodeErrorResult } from 'viem'

import { intuitionClient, Atom as IntuitionAtom, createProfileAtom } from '@/lib/intuitionClient'
import { AccountInfo } from '@/components/AccountInfo'
import { INTUITION_CONTRACT_ABI, INTUITION_CONTRACT_ADDRESS, createAtomUri, atomDataToBytes } from '@/lib/intuitionContract'



const INTUITION_MULTIVAULT_ADDRESS = '0x2Ece8D4dEdcB9918A398528f3fa4688b1d2CAB91'

const KNOWLEDGE_GRAPH_URL = 'https://testnet.intuition.sh/v1/graphql'






interface ProfileData {

  name: string

  bio: string

  email: string

  website: string

  profilePicture: string

  twitter: string

  github: string

  behance: string

  dribbble: string

}



// Use Atom type from intuitionClient
type Atom = IntuitionAtom



export function UserInitialization({ children }: { children: React.ReactNode }) {

  const { address, isConnected, chain } = useAccount()
  const publicClient = usePublicClient()

  const { writeContract, data: hash, isPending: isWriting, error: writeError } = useWriteContract()

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash })

  

  const [isInitializing, setIsInitializing] = useState(true) // Start as true to show loading state

  const [showModal, setShowModal] = useState(false)

  const [userAtom, setUserAtom] = useState<Atom | null>(null)
  
  const [profileCheckComplete, setProfileCheckComplete] = useState(false) // Track if profile check is done

  const [error, setError] = useState<string | null>(null)

  const [profileData, setProfileData] = useState<ProfileData>({

    name: '',

    bio: '',

    email: '',

    website: '',

    profilePicture: '',

    twitter: '',

    github: '',

    behance: '',

    dribbble: '',

  })

  const [mounted, setMounted] = useState(false)

  const initializedAddressRef = useRef<string | null>(null)
  const fetchAccountInfoRef = useRef<(() => Promise<void>) | null>(null)

  // Account information state
  const [accountInfo, setAccountInfo] = useState<{
    atoms: any[]
    triples: any[]
    recentAtoms: any[]
    loading: boolean
  } | null>(null)



  useEffect(() => {

    setMounted(true)

  }, [])

  // Listen for custom event to show create profile modal
  useEffect(() => {
    const handleShowCreateProfile = () => {
      // Only show modal if no profile exists
      if (!userAtom && isConnected && address) {
        setShowModal(true)
      }
    }

    window.addEventListener('showCreateProfileModal', handleShowCreateProfile)
    return () => {
      window.removeEventListener('showCreateProfileModal', handleShowCreateProfile)
    }
  }, [userAtom, isConnected, address])



  // Check if user atom exists in Knowledge Graph

  useEffect(() => {

    const checkUserExists = async () => {

      if (!isConnected || !address) {

        setShowModal(false)
        setProfileCheckComplete(false)
        setIsInitializing(false)
        initializedAddressRef.current = null

        return

      }



      if (initializedAddressRef.current === address.toLowerCase()) {
        // Already checked this address, but ensure profile check is marked complete
        setProfileCheckComplete(true)
        return
      }



      try {

        console.log('=== Checking Knowledge Graph for user profile ===')

        console.log('Address:', address)

        setIsInitializing(true)
        setProfileCheckComplete(false) // Mark as not complete yet
        setError(null)
        setShowModal(false) // Don't show modal until check is complete



        // Query Knowledge Graph for existing user atom
        // Check both by creator_id (atoms created by this address) and by data field
        const query = `

          query GetUserAtom($address: String!) {

            atoms(

              where: {

                _or: [

                  { creator_id: { _eq: $address } }

                  {

                    _and: [

                      { type: { _eq: "User" } }

                      { 

                        _or: [

                          { data: { _contains: { address: $address } } }

                          { data: { _contains: { wallet: $address } } }

                        ]

                      }

                    ]

                  }

                ]

              }

              limit: 1

              order_by: { created_at: desc }

            ) {

              id

              term_id

              type

              label

              image

              emoji

              data

              creator_id

              created_at

            }

          }

        `



        const response = await fetch(KNOWLEDGE_GRAPH_URL, {

          method: 'POST',

          headers: { 'Content-Type': 'application/json' },

          body: JSON.stringify({

            query,

            variables: { address: address.toLowerCase() }

          })

        })



        const result = await response.json()



        if (result.errors) {

          console.warn('GraphQL errors:', result.errors)

          setUserAtom(null)

          // Only show modal after check is complete
          setProfileCheckComplete(true)
          setIsInitializing(false)
          // Don't auto-show modal on error - let user manually trigger it
          setShowModal(false)

          return

        }



        const existingAtom = result.data?.atoms?.[0]



        if (existingAtom) {

          console.log('✓ User atom exists:', existingAtom.term_id || existingAtom.id)

          setUserAtom(existingAtom)

          

          // Load existing profile data

          const atomData = existingAtom.data || {} as Record<string, any>

            setProfileData({

              name: atomData.name || '',

              bio: atomData.bio || atomData.description || '',

              email: atomData.email || '',

              website: atomData.website || '',

              profilePicture: atomData.profilePicture || atomData.pfp || atomData.avatar || '',

              twitter: atomData.twitter || atomData.socialLinks?.twitter || '',

              github: atomData.github || atomData.socialLinks?.github || '',

              behance: atomData.behance || atomData.socialLinks?.behance || '',

              dribbble: atomData.dribbble || atomData.socialLinks?.dribbble || '',

          })

          

          console.log('✅ Profile exists - showing welcome message')

          // Profile exists - DO NOT show modal
          setShowModal(false)
          setProfileCheckComplete(true)
          initializedAddressRef.current = address.toLowerCase()

        } else {

          console.log('✗ No user atom found')

          console.log('✓ User needs to create profile - will show creation form')

          setUserAtom(null)

          // Mark check as complete, then show modal
          setProfileCheckComplete(true)
          // Auto-show modal ONLY after check confirms no profile exists
          setShowModal(true)

        }



        setIsInitializing(false)



      } catch (err: any) {

        console.error('Error checking user:', err)

        setError('Could not check existing profile. You can still create one.')

        setUserAtom(null)

        // Mark check as complete even on error
        setProfileCheckComplete(true)
        setIsInitializing(false)
        // Don't auto-show modal on error - let user manually trigger it from dashboard
        setShowModal(false)

      }

    }



    checkUserExists()

  }, [address, isConnected])

  // Query account information when wallet is connected
  useEffect(() => {
    const fetchAccountInfo = async () => {
      if (!isConnected || !address) {
        setAccountInfo(null)
        return
      }

      try {
        setAccountInfo({ atoms: [], triples: [], recentAtoms: [], loading: true })

        console.log('=== Fetching account information ===')
        console.log('Address:', address)

        // Query 1: Get all atoms created by this account
        // Use the same query structure that works for recent atoms
        const atomsQuery = `
          query GetAccountAtoms($address: String!) {
            atoms(
              where: {
                creator_id: { _eq: $address }
              }
              order_by: { created_at: desc }
              limit: 100
            ) {
              term_id
              label
              emoji
              type
              image
              data
              created_at
              block_number
              creator_id
              vault_id
              creator {
                id
                label
              }
            }
          }
        `

        // Query 2: Get recent atoms (for discovery)
        const recentAtomsQuery = `
          query GetRecentAtoms($limit: Int!) {
            atoms(
              limit: $limit
              order_by: { created_at: desc }
            ) {
              term_id
              label
              emoji
              type
              image
              data
              created_at
              block_number
              creator_id
              creator {
                id
                label
              }
            }
          }
        `

        // Query 3: Get triples related to this account
        const triplesQuery = `
          query GetAccountTriples($address: String!) {
            triples(
              where: {
                _or: [
                  { subject: { _eq: $address } }
                  { object: { _eq: $address } }
                ]
              }
              order_by: { created_at: desc }
              limit: 20
            ) {
              id
              subject
              predicate
              object
              created_at
            }
          }
        `

        const [atomsRes, recentRes, triplesRes] = await Promise.all([
          fetch(KNOWLEDGE_GRAPH_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: atomsQuery,
              variables: { address: address.toLowerCase() }
            })
          }),
          fetch(KNOWLEDGE_GRAPH_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: recentAtomsQuery,
              variables: { limit: 10 }
            })
          }),
          fetch(KNOWLEDGE_GRAPH_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: triplesQuery,
              variables: { address: address.toLowerCase() }
            })
          })
        ])

        const [atomsData, recentData, triplesData] = await Promise.all([
          atomsRes.json(),
          recentRes.json(),
          triplesRes.json()
        ])

        // Debug: Log raw GraphQL responses
        console.log('🔍 Raw GraphQL Response for Account Atoms:')
        console.log('  Status:', atomsRes.status)
        console.log('  Response:', atomsData)
        if (atomsData.errors) {
          console.error('  GraphQL Errors:', atomsData.errors)
        }
        if (atomsData.data) {
          console.log('  Data structure:', Object.keys(atomsData.data))
          console.log('  Atoms count:', atomsData.data.atoms?.length || 0)
        }

        let atoms = atomsData.data?.atoms || []
        const recentAtoms = recentData.data?.atoms || []
        const triples = triplesData.data?.triples || []

        console.log('✓ Account atoms query result:', atoms.length)
        console.log('✓ Recent atoms:', recentAtoms.length)
        console.log('✓ Account triples:', triples.length)
        
        // Process atoms to normalize their structure (parse JSON data, set type, etc.)
        atoms = atoms.map((atom: any) => {
          // Parse data if it's a string
          let parsedData = atom.data
          if (typeof atom.data === 'string') {
            try {
              parsedData = JSON.parse(atom.data)
              console.log('✓ Parsed atom data from string for atom:', atom.id?.substring(0, 20))
            } catch (e) {
              console.warn('Could not parse atom data as JSON:', e)
              parsedData = {}
            }
          }
          
          // Set type from data if not set at top level
          if (!atom.type && parsedData && typeof parsedData === 'object') {
            if (parsedData.type) {
              atom.type = parsedData.type
              console.log('✓ Set atom type from data:', parsedData.type)
            } else if (parsedData.address || parsedData.wallet) {
              // If data has address/wallet, treat as User profile
              atom.type = 'User'
              console.log('✓ Set atom type to "User" based on address in data')
            }
          }
          
          // If still no type, default to 'User' for atoms created by this address
          if (!atom.type) {
            atom.type = 'User'
          }
          
          // Update atom.data with parsed data
          if (parsedData && typeof parsedData === 'object') {
            atom.data = parsedData
          }
          
          return atom
        })
        
        // Set id from term_id for all atoms (for compatibility)
        atoms = atoms.map((atom: any) => {
          if (!atom.id && atom.term_id) {
            atom.id = atom.term_id
          }
          return atom
        })
        
        // Log sample atoms for debugging
        if (atoms.length > 0) {
          console.log('📊 Sample account atoms (after processing):', atoms.slice(0, 3).map((a: any) => ({
            term_id: a.term_id?.substring(0, 20),
            id: a.id?.substring(0, 20),
            type: a.type,
            creator_id: a.creator_id?.substring(0, 20),
            has_data: !!a.data,
            data_keys: a.data ? Object.keys(a.data).slice(0, 5) : []
          })))
        }
        
        // If no atoms found but recent atoms show atoms from this creator, use those
        if (atoms.length === 0 && recentAtoms.length > 0) {
          const myAtoms = recentAtoms.filter((atom: any) => {
            const creatorId = atom.creator?.id || atom.creator_id
            return creatorId?.toLowerCase() === address.toLowerCase()
          })
          if (myAtoms.length > 0) {
            console.log('⚠️ Account query found 0 atoms, but recent atoms shows', myAtoms.length, 'atoms from this address')
            console.log('   Sample recent atoms:', myAtoms.slice(0, 2).map((a: any) => ({
              id: a.id?.substring(0, 20),
              type: a.type,
              creator_id: a.creator_id || a.creator?.id
            })))
            console.log('   Processing and using recent atoms as account atoms')
            
            // Process these atoms too
            atoms = myAtoms.map((atom: any) => {
              let parsedData = atom.data
              if (typeof atom.data === 'string') {
                try {
                  parsedData = JSON.parse(atom.data)
                } catch (e) {
                  parsedData = {}
                }
              }
              
              if (!atom.type && parsedData && typeof parsedData === 'object') {
                if (parsedData.type) {
                  atom.type = parsedData.type
                } else if (parsedData.address || parsedData.wallet) {
                  atom.type = 'User'
                }
              }
              
              if (!atom.type) {
                atom.type = 'User'
              }
              
              if (parsedData && typeof parsedData === 'object') {
                atom.data = parsedData
              }
              
              return atom
            })
          }
        }
        
        // Log what we're actually setting
        console.log('📦 Final atoms array length:', atoms.length)
        if (atoms.length > 0) {
          console.log('   First atom:', {
            term_id: atoms[0].term_id?.substring(0, 30),
            id: atoms[0].id?.substring(0, 30),
            type: atoms[0].type,
            has_data: !!atoms[0].data,
            data_keys: atoms[0].data ? Object.keys(atoms[0].data).slice(0, 5) : []
          })
        } else {
          console.log('⚠️ No atoms found after all processing. Check GraphQL query response.')
          if (atomsData.errors) {
            console.error('GraphQL errors:', atomsData.errors)
          }
          if (atomsData.data && !atomsData.data.atoms) {
            console.warn('GraphQL response structure:', Object.keys(atomsData.data || {}))
          }
          
          // Try a simpler diagnostic query to see if ANY atoms exist for this creator
          console.log('🔍 Running diagnostic query to check for atoms...')
          console.log('   Querying address:', address.toLowerCase())
          console.log('   GraphQL URL:', KNOWLEDGE_GRAPH_URL)
          
          try {
            // First, try querying ALL recent atoms and filter client-side
            const allAtomsQuery = `
              query GetAllRecentAtoms {
                atoms(
                  limit: 50
                  order_by: { created_at: desc }
                ) {
                  term_id
                  type
                  creator_id
                  data
                  created_at
                }
              }
            `
            console.log('🔍 Step 1: Querying ALL recent atoms...')
            const allAtomsRes = await fetch(KNOWLEDGE_GRAPH_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                query: allAtomsQuery
              })
            })
            const allAtomsData = await allAtomsRes.json()
            console.log('🔍 All atoms query result:', {
              status: allAtomsRes.status,
              totalAtoms: allAtomsData.data?.atoms?.length || 0,
              hasErrors: !!allAtomsData.errors,
              errors: allAtomsData.errors
            })
            
            // Filter for atoms created by this address
            if (allAtomsData.data?.atoms?.length > 0) {
              const myAtomsFromAll = allAtomsData.data.atoms.filter((atom: any) => {
                const creatorId = atom.creator_id?.toLowerCase()
                const myAddress = address.toLowerCase()
                const matches = creatorId === myAddress
                if (matches) {
                  console.log('   ✓ Found matching atom:', {
                    term_id: atom.term_id?.substring(0, 30),
                    creator_id: atom.creator_id?.substring(0, 20),
                    type: atom.type
                  })
                }
                return matches
              })
              
              console.log('🔍 Filtered atoms by creator_id:', {
                totalAtoms: allAtomsData.data.atoms.length,
                myAtoms: myAtomsFromAll.length,
                myAddress: address.toLowerCase()
              })
              
              if (myAtomsFromAll.length > 0) {
                console.log('✅ Found', myAtomsFromAll.length, 'atoms by filtering all atoms!')
                atoms = myAtomsFromAll.map((atom: any) => {
                  let parsedData = atom.data
                  if (typeof atom.data === 'string') {
                    try {
                      parsedData = JSON.parse(atom.data)
                    } catch (e) {
                      parsedData = {}
                    }
                  }
                  
                  if (!atom.type && parsedData && typeof parsedData === 'object') {
                    if (parsedData.type) {
                      atom.type = parsedData.type
                    } else if (parsedData.address || parsedData.wallet) {
                      atom.type = 'User'
                    }
                  }
                  
                  if (!atom.type) {
                    atom.type = 'User'
                  }
                  
                  if (parsedData && typeof parsedData === 'object') {
                    atom.data = parsedData
                  }
                  
                  return atom
                })
                console.log('✅ Processed', atoms.length, 'atoms from all atoms query')
              }
            }
            
            // Also try the direct creator_id query
            const diagnosticQuery = `
              query DiagnosticAtoms($address: String!) {
                atoms(
                  where: { creator_id: { _eq: $address } }
                  limit: 10
                ) {
                  term_id
                  type
                  creator_id
                  data
                  created_at
                }
              }
            `
            console.log('🔍 Step 2: Querying by creator_id filter...')
            const diagRes = await fetch(KNOWLEDGE_GRAPH_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                query: diagnosticQuery,
                variables: { address: address.toLowerCase() }
              })
            })
            const diagData = await diagRes.json()
            console.log('🔍 Diagnostic query result:', {
              status: diagRes.status,
              hasErrors: !!diagData.errors,
              errors: diagData.errors,
              atomsFound: diagData.data?.atoms?.length || 0,
              sampleAtoms: diagData.data?.atoms?.slice(0, 3).map((a: any) => ({
                term_id: a.term_id?.substring(0, 30),
                type: a.type,
                creator_id: a.creator_id?.substring(0, 20),
                has_data: !!a.data
              }))
            })
            
            // If diagnostic query finds atoms and we don't have any yet, use them
            if (atoms.length === 0 && diagData.data?.atoms?.length > 0) {
              console.log('✅ Diagnostic query found atoms! Processing them...')
              atoms = diagData.data.atoms.map((atom: any) => {
                let parsedData = atom.data
                if (typeof atom.data === 'string') {
                  try {
                    parsedData = JSON.parse(atom.data)
                  } catch (e) {
                    parsedData = {}
                  }
                }
                
                if (!atom.type && parsedData && typeof parsedData === 'object') {
                  if (parsedData.type) {
                    atom.type = parsedData.type
                  } else if (parsedData.address || parsedData.wallet) {
                    atom.type = 'User'
                  }
                }
                
                if (!atom.type) {
                  atom.type = 'User'
                }
                
                if (parsedData && typeof parsedData === 'object') {
                  atom.data = parsedData
                }
                
                return atom
              })
              console.log('✅ Processed', atoms.length, 'atoms from diagnostic query')
            }
          } catch (diagError) {
            console.error('Diagnostic query failed:', diagError)
          }
        }

        const accountInfoData = {
          atoms,
          triples,
          recentAtoms,
          loading: false
        }

        setAccountInfo(accountInfoData)

        // If no atoms and no triples found, check if we should show Create Profile modal
        // Only show if userAtom is null (no profile exists yet)
        if (atoms.length === 0 && triples.length === 0 && !userAtom) {
          console.log('⚠️ No atoms or triples found - user needs to create profile')
          // Don't auto-show modal - let user navigate to dashboard or manually trigger creation
          // Modal will be shown when user explicitly wants to create profile
        }
      } catch (err: any) {
        console.error('Error fetching account info:', err)
        const accountInfoData = {
          atoms: [],
          triples: [],
          recentAtoms: [],
          loading: false
        }
        setAccountInfo(accountInfoData)
        
        // If error and no user atom exists, log but don't auto-show modal
        if (!userAtom) {
          console.log('⚠️ Error fetching account info - user may need to create profile')
          // Don't auto-show modal - let user navigate to dashboard
        }
      }
    }

    // Store function in ref for external access
    fetchAccountInfoRef.current = fetchAccountInfo
    
    fetchAccountInfo()
    
    // Expose fetchAccountInfo for manual refresh
    if (typeof window !== 'undefined') {
      (window as any).refreshAccountInfo = fetchAccountInfo
    }
  }, [address, isConnected, userAtom])

  // Handle transaction confirmation

  useEffect(() => {

    if (isConfirmed && hash) {

      console.log('✅ Atom creation confirmed! Tx:', hash)

      

      // Wait for Knowledge Graph indexing

      const waitForIndexing = async () => {

        let attempts = 0

        const maxAttempts = 10



        while (attempts < maxAttempts) {

          attempts++

          console.log(`Polling Knowledge Graph (attempt ${attempts}/${maxAttempts})...`)

          

          try {

            const query = `

              query GetUserAtom($address: String!) {

                atoms(

                  where: {

                    _or: [

                      { creator_id: { _eq: $address } }

                      {

                        _and: [

                          { type: { _eq: "User" } }

                          { data: { _contains: { address: $address } } }

                        ]

                      }

                    ]

                  }

                  limit: 1

                  order_by: { created_at: desc }

                ) {

                  id

                  term_id

                  type

                  label

                  image

                  emoji

                  data

                  creator_id

                  created_at

                }

              }

            `



            const response = await fetch(KNOWLEDGE_GRAPH_URL, {

              method: 'POST',

              headers: { 'Content-Type': 'application/json' },

              body: JSON.stringify({

                query,

                variables: { address: address?.toLowerCase() }

              })

            })



            const result = await response.json()

            const newAtom = result.data?.atoms?.[0]



            if (newAtom) {

              console.log('✓✓ Atom indexed:', newAtom.id)

              setUserAtom(newAtom)

              initializedAddressRef.current = address?.toLowerCase() || null

              // Create a triple for the account after atom is indexed
              await createAccountTriple(newAtom.id, address || '')

            setShowModal(false)

            setIsInitializing(false)

              return

            }

          } catch (err) {

            console.error('Polling error:', err)

          }



          // Wait 2 seconds before next attempt

          await new Promise(resolve => setTimeout(resolve, 2000))

        }



        // If not found after max attempts

        console.warn('Atom not found after polling. May need manual refresh.')

        setError('Atom created but not yet indexed. Please refresh in a moment.')

        setIsInitializing(false)

      }



      waitForIndexing()

    }

  }, [isConfirmed, hash, address])



  // Handle errors

  useEffect(() => {

    if (writeError) {

      console.error('Transaction error:', writeError)

      

      let errorMessage = ''

      if (writeError.message?.includes('user rejected') || writeError.message?.includes('User denied') || writeError.message?.includes('User rejected')) {

        errorMessage = 'Transaction was cancelled. You can try again when ready.'

      } else if (writeError.message?.includes('insufficient funds')) {

        errorMessage = 'Insufficient ETH for gas fees. Please add more ETH to your wallet.'

      } else if (writeError.message?.includes('network') || writeError.message?.includes('chain')) {

        errorMessage = 'Wrong network. Please switch to Intuition Testnet (Chain ID: 13579)'

      } else if (writeError.message?.includes('revert') || writeError.message?.includes('execution reverted')) {

        errorMessage = 'Transaction was rejected by the contract. Please check your data and try again.'

      } else {

        errorMessage = `Transaction failed: ${writeError.message || 'Unknown error. Please try again.'}`

      }

      

      setError(errorMessage)

      setIsInitializing(false)

    }

  }, [writeError])

  // Auto-create profile using contract's createAtom function
  const autoCreateProfile = async () => {
    if (!address || !isConnected) {
      console.log('Cannot auto-create: wallet not connected')
      return
    }

    if (chain?.id !== 13579) {
      console.log('Cannot auto-create: wrong network. Please switch to Intuition Testnet (Chain ID: 13579)')
      setError('Please switch to Intuition Testnet (Chain ID: 13579) to create your profile')
      setShowModal(true)
      return
    }

    try {
      setIsInitializing(true)
      setError(null)

      // First, try to read the actual minimum deposit from the contract
      let minimumDeposit = parseEther('0.01') // Default to 0.01 tTRUST (minimum on testnet)
      
      if (publicClient) {
        try {
          console.log('📋 Reading minimum deposit from contract (auto-create)...')
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
      const assetDeposit = minimumDeposit
      const totalValue = assetDeposit // msg.value must equal sum(assets[])

      // Prepare profile data for contract
      const atomData = {
        address: address.toLowerCase(),
        wallet: address.toLowerCase(),
        type: 'User',
        name: profileData.name || 'User',
        bio: profileData.bio || '',
        email: profileData.email || '',
        website: profileData.website || '',
        profilePicture: profileData.profilePicture || '',
        twitter: profileData.twitter || '',
        github: profileData.github || '',
        behance: profileData.behance || '',
        dribbble: profileData.dribbble || '',
        createdAt: new Date().toISOString()
      }

      // Convert atom data to bytes for createAtoms function
      const atomDataBytes = atomDataToBytes(atomData)

      console.log('=== Auto-creating profile via contract ===')
      console.log('Contract:', INTUITION_CONTRACT_ADDRESS)
      console.log('Function: createAtoms(bytes[] data, uint256[] assets) payable')
      console.log('Atom data (bytes):', atomDataBytes.substring(0, 100) + '...')
      console.log('Minimum deposit:', minimumDeposit.toString(), 'wei')
      console.log('Total in assets[]:', assetDeposit.toString(), 'wei')
      console.log('Total msg.value:', totalValue.toString(), 'wei')
      console.log('Total msg.value (tTRUST):', (Number(totalValue) / 1e18).toFixed(6))
      console.log('⚠️ NOTE: assets[] = [minimumDeposit], msg.value = sum(assets[])')

      // Call contract's createAtoms function
      // Function signature: createAtoms(bytes[] calldata data, uint256[] calldata assets) payable
      // msg.value MUST equal sum(assets[])
      writeContract({
        address: INTUITION_CONTRACT_ADDRESS,
        abi: INTUITION_CONTRACT_ABI,
        functionName: 'createAtoms',
        args: [
          [atomDataBytes], // bytes[] - array with one atom data
          [assetDeposit]   // uint256[] - array with deposit + fee
        ],
        value: totalValue // msg.value = sum(assets[])
      })

      console.log('✓ Transaction request sent to wallet')
    } catch (err: any) {
      console.error('❌ Failed to create profile:', err)
      setError(`Failed to create profile: ${err.message || 'Unknown error'}`)
      setIsInitializing(false)
    }
  }

  // Helper function to create a triple for the account
  const createAccountTriple = async (atomId: string, accountAddress: string) => {
    try {
      console.log('=== Creating triple for account ===')
      console.log('Atom ID:', atomId)
      console.log('Account:', accountAddress)

      // Create a triple linking the account to the atom
      // Subject: account address, Predicate: "has_profile", Object: atom ID
      const triple = await intuitionClient.createTriple(
        accountAddress.toLowerCase(),
        'has_profile',
        atomId
      )

      if (triple) {
        console.log('✅ Triple created successfully:', triple.id)
      } else {
        console.warn('⚠️ Triple creation returned null - may need to retry')
        
        // Try GraphQL mutation as fallback
        try {
          const tripleMutation = `
            mutation CreateTriple($subject: String!, $predicate: String!, $object: String!) {
              insert_triples_one(object: {
                subject: $subject
                predicate: $predicate
                object: $object
              }) {
                id
                subject
                predicate
                object
              }
            }
          `

          const response = await fetch(KNOWLEDGE_GRAPH_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: tripleMutation,
              variables: {
                subject: accountAddress.toLowerCase(),
                predicate: 'has_profile',
                object: atomId
              }
            })
          })

          const result = await response.json()
          if (result.data?.insert_triples_one) {
            console.log('✅ Triple created via GraphQL:', result.data.insert_triples_one.id)
          } else if (result.errors) {
            console.warn('GraphQL triple creation errors:', result.errors)
          }
        } catch (graphqlErr: any) {
          console.warn('GraphQL triple creation failed:', graphqlErr.message)
        }
      }
    } catch (err: any) {
      console.error('Error creating triple:', err)
      // Don't throw - triple creation failure shouldn't block atom creation
    }
  }

  const handleCreateAtom = async () => {
    
    if (!address) {

      setError('Wallet not connected')

      return

    }



    try {

      setIsInitializing(true)

      setError(null)



      // GraphQL is READ-ONLY - use contract to create atom on-chain
      if (chain?.id !== 13579) {
        setError('Please switch to Intuition Testnet (Chain ID: 13579)')
        setIsInitializing(false)
        return
      }

      // Prepare profile data for contract
      // Use createAtoms with bytes[] data array
      const atomData = {
        address: address.toLowerCase(),
        wallet: address.toLowerCase(),
        type: 'User',
        name: profileData.name || 'User',
        bio: profileData.bio || '',
        email: profileData.email || '',
        website: profileData.website || '',
        profilePicture: profileData.profilePicture || '',
        twitter: profileData.twitter || '',
        github: profileData.github || '',
        behance: profileData.behance || '',
        dribbble: profileData.dribbble || '',
        createdAt: new Date().toISOString()
      }

      // First, try to read the actual minimum deposit from the contract
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
      // Use the minimum deposit amount
      const assetDeposit = minimumDeposit
      const totalValue = assetDeposit // msg.value must equal sum(assets[])
      
      console.log('💡 Using deposit amount:', assetDeposit.toString(), 'wei')
      console.log('   (', (Number(assetDeposit) / 1e18).toFixed(6), 'tTRUST)')

      // Convert atom data to bytes for createAtoms function
      const atomDataBytes = atomDataToBytes(atomData)

      console.log('=== Creating profile via contract (on-chain) ===')
      console.log('Contract:', INTUITION_CONTRACT_ADDRESS)
      console.log('Function: createAtoms(bytes[] data, uint256[] assets) payable')
      console.log('Atom data (bytes):', atomDataBytes.substring(0, 100) + '...')
      console.log('Minimum deposit:', minimumDeposit.toString(), 'wei')
      console.log('Total in assets[]:', assetDeposit.toString(), 'wei')
      console.log('Total msg.value:', totalValue.toString(), 'wei')
      console.log('Total msg.value (tTRUST):', (Number(totalValue) / 1e18).toFixed(6))
      console.log('⚠️ NOTE: assets[] = [minimumDeposit], msg.value = sum(assets[])')

      // Prepare function arguments
      // assets[] contains only the deposit, msg.value contains fee + deposit
      const functionArgs: [`0x${string}`[], bigint[]] = [
        [atomDataBytes], // bytes[] - array with one atom data
        [assetDeposit]   // uint256[] - array with deposit amount (NOT including fee)
      ]

      // Simulate transaction first to catch errors
      if (publicClient && address) {
        try {
          console.log('🔍 Simulating transaction to check for errors...')
          const simulation = await publicClient.simulateContract({
            account: address,
            address: INTUITION_CONTRACT_ADDRESS,
            abi: INTUITION_CONTRACT_ABI,
            functionName: 'createAtoms',
            args: functionArgs,
            value: totalValue // msg.value = creationFee + sum(assets[])
          })
          console.log('✅ Simulation successful - transaction should work')
          console.log('Simulation result:', simulation)
        } catch (simError: any) {
          console.error('❌ Simulation failed - transaction will revert!')
          console.error('Full error:', simError)
          console.error('Error cause:', simError?.cause)
          console.error('Error data:', simError?.cause?.data)
          console.error('Error signature:', simError?.cause?.data?.errorName || 'Unknown')
          
          // Try to decode the error
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
          
          // Extract revert reason from various error formats
          if (!errorMessage || errorMessage === 'Transaction will revert') {
            if (simError?.cause?.data?.message) {
              errorMessage = simError.cause.data.message
            } else if (simError?.shortMessage) {
              errorMessage = simError.shortMessage
            } else if (simError?.message) {
              errorMessage = simError.message
            }
          }
          
          // Check for common issues
          if (errorMessage.includes('InvalidDepositAmount') || errorMessage.includes('InvalidDeposit')) {
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
          
          setError(`⚠️ ${errorMessage}. Check browser console (F12) for full details.`)
          setIsInitializing(false)
          return
        }
      }

      // Call contract's createAtoms function
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
      // Note: Transaction confirmation and GraphQL polling is handled in the useEffect hook



    } catch (err: any) {

      console.error('Error creating atom:', err)

      setError(err.message || 'Failed to create atom. Please try again.')

      setIsInitializing(false)

    }

  }



  const handleUpdateProfile = async () => {

    if (!userAtom) return



    try {

      setIsInitializing(true)

      setError(null)



      // Prepare updated data

      const updatedData = {

        ...(userAtom.data || {}),

        name: profileData.name,

        bio: profileData.bio,

        email: profileData.email,

        website: profileData.website,

        profilePicture: profileData.profilePicture,

        twitter: profileData.twitter,

        github: profileData.github,

        behance: profileData.behance,

        dribbble: profileData.dribbble,

        updatedAt: new Date().toISOString()

      }



      // Update via GraphQL

      const mutation = `

        mutation UpdateAtom($id: String!, $data: jsonb!) {

          update_atoms_by_pk(

            pk_columns: { id: $id }

            _set: { data: $data }

          ) {

            id

            data

          }

        }

      `



      const response = await fetch(KNOWLEDGE_GRAPH_URL, {

        method: 'POST',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({

          query: mutation,

          variables: {

            id: userAtom.id,

            data: updatedData

          }

        })

      })



      const result = await response.json()



      if (result.errors) {

        throw new Error(result.errors[0].message)

      }



      console.log('✓ Profile updated via GraphQL')

      setUserAtom({ ...userAtom, data: updatedData as Record<string, any> })

        setShowModal(false)

        setIsInitializing(false)
      


    } catch (err: any) {

      console.error('Error updating profile:', err)

      setError(err.message || 'Failed to update profile')

      setIsInitializing(false)

    }

  }



  // Only show modal if profile check is complete AND no profile exists
  const modalContent = showModal && isConnected && profileCheckComplete && !userAtom && (

    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">

      <div className="relative bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">

        <div className="p-6">

          {/* Header */}

          <div className="flex items-start justify-between mb-6">

            <div>

              <h2 className="text-2xl font-bold text-gray-900">

                Create Profile

              </h2>

              <p className="text-xs text-amber-600 mt-1">⚠️ Requires 0.01 tTRUST deposit + gas fees. You can only create a profile once.</p>

            </div>

            <button

              onClick={() => setShowModal(false)}

              className="text-gray-400 hover:text-gray-600"

            >

              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">

                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />

              </svg>

            </button>

          </div>



          {error && (

            <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200">

              <p className="text-sm text-red-600">{error}</p>

            </div>

          )}



                 {isInitializing || isWriting || isConfirming ? (

                   <div className="text-center py-8">

              <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>

              <p className="text-gray-600">

                       {isWriting ? 'Preparing transaction...' : 

                 isConfirming ? 'Confirming on-chain...' :

                 isConfirmed ? 'Waiting for Knowledge Graph indexing...' :

                 'Processing...'}

              </p>

                     {hash && (

                <p className="text-xs text-gray-500 mt-2 font-mono">

                  Tx: {hash.slice(0, 10)}...{hash.slice(-8)}

                </p>

              )}

                   </div>

                 ) : (

            <>

              {/* Form */}

              <div className="space-y-4 mb-6">

                  <div>

                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>

                  <input

                    type="text"

                    value={profileData.name}

                    onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}

                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"

                    placeholder="Your name"

                  />

                </div>



                <div>

                  <label className="block text-sm font-medium text-gray-700 mb-1">Bio</label>

                  <textarea

                    value={profileData.bio}

                    onChange={(e) => setProfileData({ ...profileData, bio: e.target.value })}

                    rows={3}

                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"

                    placeholder="Tell us about yourself..."

                  />

                </div>



                <div className="grid grid-cols-2 gap-4">

                  <div>

                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>

                    <input

                      type="email"

                      value={profileData.email}

                      onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}

                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"

                      placeholder="email@example.com"

                    />

                  </div>

                  <div>

                    <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>

                    <input

                      type="url"

                      value={profileData.website}

                      onChange={(e) => setProfileData({ ...profileData, website: e.target.value })}

                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"

                      placeholder="https://..."

                    />

                  </div>

                </div>



                <div>

                  <label className="block text-sm font-medium text-gray-700 mb-2">Social Links</label>

                  <div className="grid grid-cols-2 gap-3">

                      <input

                        type="text"

                        value={profileData.twitter}

                        onChange={(e) => setProfileData({ ...profileData, twitter: e.target.value })}

                      className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"

                      placeholder="Twitter @username"

                    />

                      <input

                        type="text"

                        value={profileData.github}

                        onChange={(e) => setProfileData({ ...profileData, github: e.target.value })}

                      className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"

                      placeholder="GitHub username"

                    />

                    </div>

                </div>



                {!userAtom && (
                  
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    
                    <p className="text-sm text-amber-800">
                      
                      <strong>Note:</strong> Creating your profile atom requires a deposit of <strong>0.01 tTRUST</strong> (minimum) + gas fees.
                      
                      The transaction value (msg.value) must exactly equal the deposit amount. Make sure you have sufficient tTRUST tokens in your wallet before proceeding.
                      
                    </p>
                    
                        </div>
                  
                )}

              </div>



              {/* Action Button */}

                <button

                onClick={handleCreateAtom}

                  disabled={isInitializing || isWriting || isConfirming || !!userAtom}

                className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-colors"

              >

                {userAtom ? 'Profile Already Created' : 'Create Profile (0.01 tTRUST)'}

                </button>
                
                {userAtom && (
                  <p className="text-sm text-gray-600 mt-2 text-center">
                    Your profile has been created. You can update it from your dashboard.
                  </p>
                )}

            </>

          )}

        </div>

      </div>

    </div>

  )



  return (

    <>
      {children}

      {/* Welcome Banner - Show when profile exists */}
      {isConnected && address && userAtom && (() => {
        try {
          const atomData = typeof userAtom.data === 'string' 
            ? JSON.parse(userAtom.data) 
            : (userAtom.data || {})
          const userName = atomData.name || (userAtom as any).label || 'User'
          return userName ? (
            <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-[9997] max-w-md w-full mx-4" data-welcome-banner>
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg shadow-lg p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                    <span className="text-xl">👋</span>
                  </div>
                  <div>
                    <p className="font-semibold">Welcome back, {userName}!</p>
                    <p className="text-sm text-blue-100">Your profile is ready</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    const banner = document.querySelector('[data-welcome-banner]')
                    if (banner) banner.remove()
                  }}
                  className="text-white/80 hover:text-white transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ) : null
        } catch {
          return null
        }
      })()}

      {/* Display Account Information */}
      {isConnected && address && (
        <div className="fixed bottom-4 right-4 w-96 max-h-[80vh] overflow-y-auto bg-white rounded-lg shadow-xl border border-gray-200 z-[9998] p-4">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Account Information</h3>
          <AccountInfo 
            accountInfo={accountInfo} 
            onRefresh={async () => {
              if (fetchAccountInfoRef.current) {
                await fetchAccountInfoRef.current()
              } else if (typeof window !== 'undefined' && (window as any).refreshAccountInfo) {
                await (window as any).refreshAccountInfo()
              }
            }}
          />
        </div>
      )}

      {mounted && typeof window !== 'undefined' && document.body
        ? createPortal(modalContent, document.body)
        : modalContent}
    </>
  )

}
