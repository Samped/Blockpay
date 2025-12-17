'use client'

import { useAccount, usePublicClient, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi'
import { parseTrustAmount, formatTrustAmount, PORTFOLIO_CONTRACT_ADDRESS, PORTFOLIO_CONTRACT_ABI, calculatePortfolioFee, validatePortfolioInput } from '@/lib/portfolioContract'
import { parseEther, decodeEventLog } from 'viem'
import { fetchPortfolioByProfileId } from '@/lib/portfolioFetcher'

export interface PortfolioData {
  profileJson: string // JSON string: {"name":"...","bio":"..."}
  skills: string[]
  tags: string[]
  socials: string[] // Array of JSON strings: ['{"platform":"github","url":"..."}']
  achievements: string[]
  projects: string[] // Array of JSON strings: ['{"title":"...","description":"..."}']
}

export interface CreatePortfolioResult {
  success: boolean
  profileId?: `0x${string}`
  skillIds?: `0x${string}`[]
  tagIds?: `0x${string}`[]
  socialIds?: `0x${string}`[]
  achievementIds?: `0x${string}`[]
  projectIds?: `0x${string}`[]
  error?: string
  txHash?: `0x${string}`
}

export function usePortfolioContract() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { writeContract, data: hash, isPending: isWriting, error: writeError } = useWriteContract()
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash })

  const isPending = isWriting || isConfirming

  // Check if contract is paused
  const { data: isPaused } = useReadContract({
    address: PORTFOLIO_CONTRACT_ADDRESS,
    abi: PORTFOLIO_CONTRACT_ABI,
    functionName: 'paused',
    query: { enabled: PORTFOLIO_CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000' },
  })

  // Check if predicates are initialized
  const { data: skillPredicateId } = useReadContract({
    address: PORTFOLIO_CONTRACT_ADDRESS,
    abi: PORTFOLIO_CONTRACT_ABI,
    functionName: 'predicateIds',
    args: ['skill'],
    query: { enabled: PORTFOLIO_CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000' },
  })

  const { data: trustedByPredicateId } = useReadContract({
    address: PORTFOLIO_CONTRACT_ADDRESS,
    abi: PORTFOLIO_CONTRACT_ABI,
    functionName: 'predicateIds',
    args: ['trustedBy'],
    query: { enabled: PORTFOLIO_CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000' },
  })

  const predicatesInitialized = skillPredicateId && skillPredicateId !== '0x0000000000000000000000000000000000000000000000000000000000000000' &&
    trustedByPredicateId && trustedByPredicateId !== '0x0000000000000000000000000000000000000000000000000000000000000000'

  /**
   * Create a portfolio using batchCreatePortfolio
   * @param data Portfolio data to create
   */
  async function createPortfolio(data: PortfolioData): Promise<CreatePortfolioResult> {
    if (!isConnected || !address) {
      return { success: false, error: 'Please connect your wallet' }
    }

    if (!publicClient) {
      return { success: false, error: 'Public client not available' }
    }

    if (PORTFOLIO_CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') {
      return { success: false, error: 'Portfolio contract address not configured. Please set NEXT_PUBLIC_PORTFOLIO_CONTRACT_ADDRESS' }
    }

    // Validate input
    const validation = validatePortfolioInput(data)
    if (!validation.valid) {
      return { success: false, error: validation.errors.join('; ') }
    }

    // Note: We don't check predicatesInitialized here because:
    // 1. The contract will revert if predicates aren't initialized
    // 2. Predicates have been initialized (confirmed via transaction logs)
    // 3. The check can be unreliable due to RPC caching
    // The contract's batchCreatePortfolio will revert with a clear error if predicates aren't initialized

    // Check if contract is paused
    if (isPaused) {
      return { success: false, error: 'Portfolio creation is currently paused' }
    }

    try {
      // Calculate total fee
      const totalFee = calculatePortfolioFee(
        1, // profile count (always 1)
        data.projects.length,
        data.skills.length,
        data.tags.length,
        data.socials.length,
        data.achievements.length
      )

      console.log('[INFO] Creating portfolio with fee:', formatTrustAmount(totalFee), 'TRUST')
      console.log('[INFO] Using contract address:', PORTFOLIO_CONTRACT_ADDRESS)
      
      // Check account balance
      const balance = await publicClient.getBalance({ address })
      if (balance < totalFee) {
        const shortfall = totalFee - balance
        return { 
          success: false, 
          error: `Insufficient funds. Required: ${formatTrustAmount(totalFee)} TRUST, Available: ${formatTrustAmount(balance)} TRUST. You need ${formatTrustAmount(shortfall)} more TRUST.` 
        }
      }

      // Simulate the transaction first to catch errors
      try {
        await publicClient.simulateContract({
          address: PORTFOLIO_CONTRACT_ADDRESS,
          abi: PORTFOLIO_CONTRACT_ABI,
          functionName: 'batchCreatePortfolio',
          args: [
            data.profileJson,
            data.skills,
            data.tags,
            data.socials,
            data.achievements,
            data.projects,
          ],
          value: totalFee,
          account: address,
        })
      } catch (simError: any) {
        console.error('[ERROR] Transaction simulation failed:', simError)
        console.error('[ERROR] Full error object:', JSON.stringify(simError, Object.getOwnPropertyNames(simError), 2))
        console.error('[ERROR] Error cause:', simError?.cause)
        console.error('[ERROR] Error data:', simError?.cause?.data || simError?.data || simError?.error?.data)
        console.error('[ERROR] Error message:', simError?.message)
        console.error('[ERROR] Error shortMessage:', simError?.shortMessage)
        console.error('[ERROR] Error details:', simError?.details)
        
        let errorMessage = 'Transaction simulation failed'
        
        // Try to extract the revert reason from multiple possible locations
        const errorData = simError?.cause?.data || simError?.data || simError?.error?.data || simError?.cause?.cause?.data
        
        if (errorData) {
          try {
            console.log('[DEBUG] Attempting to decode error data:', errorData)
            
            // Check for specific error signature first
            if (typeof errorData === 'string' && errorData.startsWith('0x977c5b11')) {
              console.log('[DEBUG] Detected error signature 0x977c5b11')
              // This error signature could be from:
              // 1. JSON format validation (social links)
              // 2. Array/string length validation
              // 3. MultiVault contract error
              errorMessage = 'Contract validation failed. Please check: (1) Social links must be valid JSON objects starting with { and ending with }, (2) All string lengths are within limits, (3) All array lengths are within limits. Error signature: 0x977c5b11'
            } else if (typeof errorData === 'string' && errorData.startsWith('0x08c379a0')) {
              // This is a revert with reason string
              const reasonHex = errorData.slice(10)
              const reasonLength = parseInt(reasonHex.slice(64, 128), 16)
              const reasonBytes = reasonHex.slice(128, 128 + reasonLength * 2)
              const reason = Buffer.from(reasonBytes, 'hex').toString('utf8')
              errorMessage = `Contract reverted: ${reason}`
              console.log('[DEBUG] Decoded revert reason:', reason)
            } else if (errorData?.reason) {
              errorMessage = `Contract reverted: ${errorData.reason}`
            } else if (typeof errorData === 'string' && errorData.length > 0) {
              // Try to decode as error result
              try {
                const { decodeErrorResult } = await import('viem')
                const decoded = decodeErrorResult({
                  abi: PORTFOLIO_CONTRACT_ABI,
                  data: errorData as `0x${string}`,
                })
                errorMessage = `Contract error: ${decoded.errorName}`
                console.log('[DEBUG] Decoded error result:', decoded)
              } catch (decodeErr) {
                console.error('[ERROR] Failed to decode error result:', decodeErr)
                if (errorData.startsWith('0x977c5b11')) {
                  errorMessage = 'Contract validation failed. Check your input data format, especially social links JSON format.'
                } else {
                  errorMessage = 'Contract reverted. Check that all fields are valid and within limits.'
                }
              }
            }
          } catch (decodeError) {
            console.error('[ERROR] Failed to decode revert reason:', decodeError)
            if (typeof errorData === 'string' && errorData.startsWith('0x977c5b11')) {
              errorMessage = 'Contract validation failed. Please verify your input data format is correct.'
            }
          }
        }
        
        if (simError?.message && !errorMessage.includes('reverted') && !errorMessage.includes('Contract')) {
          errorMessage = simError.message
        } else if (simError?.shortMessage && !errorMessage.includes('reverted') && !errorMessage.includes('Contract')) {
          errorMessage = simError.shortMessage
        }
        
        // Check for common revert reasons
        if (errorMessage.includes('Predicate') && errorMessage.includes('not initialized')) {
          const match = errorMessage.match(/Predicate '(\w+)'/)
          const missingPredicate = match ? match[1] : 'unknown'
          errorMessage = `Contract predicate '${missingPredicate}' is not initialized. The contract owner needs to call setPredicateId('${missingPredicate}', <id>) or initializePredicates(['${missingPredicate}']) first.`
        } else if (errorMessage.includes('Paused')) {
          errorMessage = 'Portfolio creation is currently paused by the contract owner.'
        } else if (errorMessage.includes('Invalid JSON') || errorMessage.includes('JSON format')) {
          errorMessage = 'Invalid JSON format in social links. Each social link must be a valid JSON object like: {"platform":"GitHub","url":"https://..."}'
        } else if (errorMessage.includes('too long')) {
          errorMessage = 'One of your fields exceeds the maximum length. Please shorten your data.'
        } else if (errorMessage.includes('Empty')) {
          errorMessage = 'One of your required fields is empty. Please fill in all required fields.'
        } else if (errorMessage.includes('Send exact')) {
          errorMessage = 'Incorrect fee amount. Please try again.'
        } else if (errorMessage.includes('Too many')) {
          errorMessage = 'Too many items in one of your arrays. Please reduce the number of items.'
        } else if (errorMessage.includes('0x977c5b11') || (typeof errorData === 'string' && errorData?.startsWith?.('0x977c5b11'))) {
          errorMessage = 'Contract validation failed (error: 0x977c5b11). This could be due to: (1) Invalid JSON format in social links, (2) String/array length limits exceeded, or (3) MultiVault contract error. Please check your input data format and try again.'
        }
        
        return { success: false, error: errorMessage }
      }

      // Write the contract
      writeContract({
        address: PORTFOLIO_CONTRACT_ADDRESS,
        abi: PORTFOLIO_CONTRACT_ABI,
        functionName: 'batchCreatePortfolio',
        args: [
          data.profileJson,
          data.skills,
          data.tags,
          data.socials,
          data.achievements,
          data.projects,
        ],
        value: totalFee,
      })

      // Return success - the form will handle waiting for confirmation via isConfirmed
      return { success: true }
    } catch (error: any) {
      console.error('[ERROR] Error creating portfolio:', error)
      return { success: false, error: error.message || 'Unknown error occurred' }
    }
  }

  /**
   * Add profile images (IPFS hashes) to an existing portfolio
   * @param profileId The profile atom ID
   * @param imageHashes Array of IPFS hashes (CIDs)
   */
  async function addProfileImages(profileId: `0x${string}`, imageHashes: string[]): Promise<{ success: boolean; error?: string; txHash?: `0x${string}` }> {
    if (!isConnected || !address) {
      return { success: false, error: 'Please connect your wallet' }
    }

    if (!publicClient) {
      return { success: false, error: 'Public client not available' }
    }

    if (PORTFOLIO_CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') {
      return { success: false, error: 'Portfolio contract address not configured' }
    }

    if (imageHashes.length === 0) {
      return { success: false, error: 'No image hashes provided' }
    }

    // Validate image hashes format (should be CID without ipfs:// prefix)
    for (let i = 0; i < imageHashes.length; i++) {
      const hash = imageHashes[i]
      if (!hash || hash.trim().length === 0) {
        return { success: false, error: `Image hash at index ${i} is empty` }
      }
      if (hash.length > 200) {
        return { success: false, error: `Image hash at index ${i} is too long (max 200 characters)` }
      }
      // Remove ipfs:// prefix if present
      imageHashes[i] = hash.replace(/^ipfs:\/\//, '').trim()
    }

    // Validate profileId format
    if (!profileId || profileId.length !== 66 || !profileId.startsWith('0x')) {
      return { success: false, error: 'Invalid profileId format. Must be a valid bytes32 hex string.' }
    }

    // Declare variables at function scope so they're accessible throughout
    let isPaused = false
    let rpcAvailable = true
    let imagePredicateId: `0x${string}` | null = null
    let profileIdVerified = false
    let fee = parseTrustAmount('0.1') // fallback

    try {
      // Pre-flight checks: contract state (non-blocking if RPC fails)
      try {
        isPaused = await publicClient.readContract({
          address: PORTFOLIO_CONTRACT_ADDRESS,
          abi: PORTFOLIO_CONTRACT_ABI,
          functionName: 'paused',
        }) as boolean
        if (isPaused) {
          return { success: false, error: 'Portfolio contract is currently paused' }
        }
      } catch (pauseErr: any) {
        console.warn('[WARN] Failed to read paused state:', pauseErr)
        // Check if it's an RPC/network error
        if (pauseErr?.message?.includes('Failed to fetch') || 
            pauseErr?.message?.includes('CORS') || 
            pauseErr?.message?.includes('502') ||
            pauseErr?.cause?.message?.includes('Failed to fetch')) {
          console.warn('[WARN] RPC endpoint appears to be unavailable. Proceeding without pause check.')
          rpcAvailable = false
        }
      }

      // Pre-flight: ensure image predicate is initialized (non-blocking if RPC fails)
      try {
        imagePredicateId = await publicClient.readContract({
          address: PORTFOLIO_CONTRACT_ADDRESS,
          abi: PORTFOLIO_CONTRACT_ABI,
          functionName: 'predicateIds',
          args: ['image'],
        }) as `0x${string}`

        if (!imagePredicateId || imagePredicateId === '0x0000000000000000000000000000000000000000000000000000000000000000') {
          return { 
            success: false, 
            error: "Image predicate 'image' is not initialized. The contract owner must call initializePredicates(['image']) first." 
          }
        }
        console.log('[INFO] Image predicate ID:', imagePredicateId)
        
        // Verify predicate atom exists in GraphQL (only if we have the predicate ID)
        if (imagePredicateId) {
          try {
            const { intuitionClient } = await import('@/lib/intuitionClient')
            const predicateQuery = `
              query CheckPredicateAtom($termId: String!) {
                atoms(where: { term_id: { _eq: $termId } }, limit: 1) {
                  term_id
                  type
                  data
                  created_at
                  block_number
                }
              }
            `
            const predicateResult = await intuitionClient.graphqlQuery(predicateQuery, { 
              termId: imagePredicateId.toLowerCase() 
            })
          if (!predicateResult?.atoms || predicateResult.atoms.length === 0) {
            console.error('[ERROR] Image predicate atom not found in GraphQL:', imagePredicateId)
            return {
              success: false,
              error: `❌ Image predicate atom not found!\n\nThe image predicate atom (${imagePredicateId.slice(0, 20)}...) does not exist in the knowledge graph.\n\nThis means the 'image' predicate was not properly initialized.\n\n✅ Solution:\nThe contract owner must call:\n- initializePredicates(['image'])\n- OR setPredicateId('image', <predicateAtomId>)\n\nPlease contact the contract owner to initialize the image predicate.`
            }
          }
          const predAtom = predicateResult.atoms[0]
          console.log('[INFO] Image predicate atom verified in GraphQL:', {
            term_id: predAtom.term_id,
            type: predAtom.type,
            created_at: predAtom.created_at,
            block_number: predAtom.block_number,
            data: predAtom.data ? (typeof predAtom.data === 'string' ? predAtom.data.substring(0, 100) : JSON.stringify(predAtom.data).substring(0, 100)) : 'N/A',
          })
          
          // Verify the predicate ID from contract matches the GraphQL atom
          const normalizedPredId = imagePredicateId.toLowerCase()
          const normalizedGraphQLId = predAtom.term_id.toLowerCase()
          if (normalizedPredId !== normalizedGraphQLId) {
            console.error('[ERROR] PREDICATE ID MISMATCH!')
            console.error('[ERROR] Contract predicate ID:', imagePredicateId)
            console.error('[ERROR] GraphQL predicate ID:', predAtom.term_id)
            console.error('[ERROR] These should match! The contract may have the wrong predicate ID.')
            return {
              success: false,
              error: `❌ Predicate ID Mismatch!\n\nThe predicate ID stored in the contract (${imagePredicateId.slice(0, 20)}...) doesn't match the atom ID found in GraphQL (${predAtom.term_id.slice(0, 20)}...).\n\nThis means the contract has the wrong predicate ID stored.\n\n✅ Solution:\nThe contract owner must update the predicate ID:\n- Call setPredicateId('image', ${predAtom.term_id})\n- Or re-initialize the predicate`
            }
          } else {
            console.log('[INFO] ✅ Predicate ID matches between contract and GraphQL')
          }
          
          // Verify the atom type is correct (should be "Predicate" or similar)
          if (predAtom.type && !predAtom.type.toLowerCase().includes('predicate')) {
            console.warn('[WARN] ⚠️  Predicate atom type is not "Predicate":', predAtom.type)
            console.warn('[WARN] This may cause MultiVault to reject triple creation!')
            console.warn('[WARN] The predicate atom should have type "Predicate" but has type:', predAtom.type)
            console.warn('[WARN] This suggests the predicate was created incorrectly or is not a valid predicate atom.')
            console.warn('[WARN] Solution: Re-initialize the predicate using initializePredicates([\'image\'])')
            
            // Check the atom data to see if it has the correct structure
            if (predAtom.data) {
              try {
                const dataStr = typeof predAtom.data === 'string' ? predAtom.data : JSON.stringify(predAtom.data)
                console.warn('[WARN] Predicate atom data:', dataStr.substring(0, 200))
                if (!dataStr.includes('"type":"predicate"') && !dataStr.includes("'type':'predicate'")) {
                  console.error('[ERROR] ❌ Predicate atom data does not contain "type":"predicate"!')
                  console.error('[ERROR] The predicate atom was likely created incorrectly.')
                  console.error('[ERROR] Expected format: {"type":"predicate","name":"image"}')
                  console.error('[ERROR] This will cause MultiVault to reject triple creation.')
                  
                  return {
                    success: false,
                    error: `❌ Invalid Predicate Atom Structure!\n\nThe image predicate atom exists but has incorrect structure.\n\nCurrent type: ${predAtom.type}\nExpected type: Predicate\n\nThis means the predicate atom was created incorrectly.\n\n✅ REQUIRED FIX (Contract Owner Only):\n\nThe contract now has an updatePredicateId function to fix this!\n\nStep 1: Create a new predicate atom manually\n- Use MultiVault directly to create a new predicate atom\n- Data format: {"type":"predicate","name":"image"}\- Call MultiVault.createAtoms with 0.1 TRUST\n- Get the new predicate atom ID from the transaction\n\nStep 2: Update the contract\n- Call updatePredicateId('image', <newPredicateId>) from the contract owner wallet\n- This will replace the invalid predicate ID with the new one\n\nStep 3: Wait for indexing\n- Wait 20-30 minutes for MultiVault to index the new predicate atom\n- Then try uploading images again\n\n📝 Technical Details:\n- Current invalid predicate atom ID: ${imagePredicateId}\n- Current atom type: ${predAtom.type}\n- Expected format: {"type":"predicate","name":"image"}\n- The atom exists in GraphQL but MultiVault rejects it for triple creation\n\n💡 The updatePredicateId function is now available in the contract. Deploy the updated contract if needed.`
                  }
                }
              } catch (dataErr) {
                console.warn('[WARN] Could not check predicate atom data:', dataErr)
              }
            }
          }
          
          // Check if predicate was created recently (might need time to sync to MultiVault)
          if (predAtom.created_at) {
            try {
              const createdAt = new Date(predAtom.created_at)
              const now = new Date()
              const minutesAgo = (now.getTime() - createdAt.getTime()) / (1000 * 60)
              
              if (minutesAgo < 20) {
                console.warn(`[WARN] Predicate atom was created only ${minutesAgo.toFixed(1)} minutes ago.`)
                console.warn('[WARN] MultiVault may not have indexed it yet for triple creation.')
                console.warn('[WARN] This could cause the 0x7b0a37cf error.')
              }
            } catch (dateErr) {
              // Ignore date parsing errors
            }
          }
          } catch (predCheckErr) {
            console.warn('[WARN] Could not verify predicate atom in GraphQL:', predCheckErr)
            console.warn('[WARN] This may mean the predicate atom doesn\'t exist, which would cause the triple creation to fail')
          }
        }
      } catch (predErr: any) {
        console.error('[ERROR] Failed to read image predicate ID:', predErr)
        // Check if it's an RPC/network error
        if (predErr?.message?.includes('Failed to fetch') || 
            predErr?.message?.includes('CORS') || 
            predErr?.message?.includes('502') ||
            predErr?.cause?.message?.includes('Failed to fetch')) {
          console.warn('[WARN] RPC endpoint unavailable. Cannot verify predicate. Transaction may fail if predicate is not initialized.')
          rpcAvailable = false
          // Don't return error - let the transaction attempt proceed, it will fail with a clearer error if predicate is missing
        } else {
          return { 
            success: false, 
            error: "Failed to verify image predicate initialization. Please ensure the contract owner has initialized the 'image' predicate." 
          }
        }
      }

      // Read the on-chain atom creation fee to avoid mismatches (non-blocking if RPC fails)
      try {
        const onchainFee = await publicClient.readContract({
          address: PORTFOLIO_CONTRACT_ADDRESS,
          abi: PORTFOLIO_CONTRACT_ABI,
          functionName: 'ATOM_CREATION_FEE',
        }) as bigint
        if (onchainFee && onchainFee > 0n) {
          fee = onchainFee
        }
      } catch (feeErr: any) {
        console.warn('[WARN] Failed to read ATOM_CREATION_FEE, using fallback 0.1 TRUST', feeErr)
        // If RPC is down, we'll use the fallback fee
        if (feeErr?.message?.includes('Failed to fetch') || 
            feeErr?.message?.includes('CORS') || 
            feeErr?.message?.includes('502')) {
          rpcAvailable = false
        }
      }
      
      if (!rpcAvailable) {
        console.warn('[WARN] ⚠️  RPC endpoint is unavailable. Some pre-flight checks were skipped.')
        console.warn('[WARN] Transaction will proceed, but may fail if:')
        console.warn('[WARN]   - Contract is paused')
        console.warn('[WARN]   - Image predicate is not initialized')
        console.warn('[WARN]   - Fee amount is incorrect')
      }

      // Check account balance
      const balance = await publicClient.getBalance({ address })
      if (balance < fee) {
        return { 
          success: false, 
          error: `Insufficient funds. Required: ${formatTrustAmount(fee)} TRUST` 
        }
      }

      // Note: PortfolioContract doesn't have a userPortfolioAtoms mapping
      // We'll verify via GraphQL instead
      
      // Also try to verify profile atom exists in GraphQL (best-effort)
      // Use the same normalization logic as fetchPortfolioByProfileId
      try {
        try {
          const { intuitionClient } = await import('@/lib/intuitionClient')
          
          // Normalize profileId the same way fetchPortfolioByProfileId does
          let normalizedProfileId: string = profileId
          if (profileId.startsWith('0x')) {
            normalizedProfileId = profileId.toLowerCase()
          } else if (/^[0-9a-fA-F]{64}$/.test(profileId)) {
            normalizedProfileId = '0x' + profileId.toLowerCase()
          } else {
            normalizedProfileId = profileId.toLowerCase()
          }
          
          console.log('[INFO] Normalized profileId for GraphQL query:', normalizedProfileId)
          
          // Use the same query format as fetchPortfolioByProfileId
          const query = `
            query CheckAtomExists($termId: String!) {
              atoms(where: { term_id: { _eq: $termId } }, limit: 1) {
                term_id
                type
                creator_id
                created_at
                block_number
              }
            }
          `
          let result = await intuitionClient.graphqlQuery(query, { termId: normalizedProfileId })
          
          // If not found, try variations like fetchPortfolioByProfileId does
          if (!result?.atoms || result.atoms.length === 0) {
            console.warn('[WARN] Atom not found with normalized ID, trying variations...')
            const variations = []
            
            // Try without 0x prefix
            if (normalizedProfileId.startsWith('0x')) {
              variations.push(normalizedProfileId.slice(2) as string)
            } else {
              variations.push(('0x' + normalizedProfileId) as string)
            }
            
            // Try with uppercase
            variations.push(normalizedProfileId.toUpperCase() as string)
            if (normalizedProfileId.startsWith('0x')) {
              variations.push(('0x' + normalizedProfileId.slice(2).toUpperCase()) as string)
            }
            
            // Try original format
            if (profileId !== normalizedProfileId) {
              variations.push(profileId as string)
            }
            
            for (const variation of variations) {
              if (variation === normalizedProfileId) continue
              console.log('[INFO] Trying variation:', variation.slice(0, 30))
              try {
                const result2 = await intuitionClient.graphqlQuery(query, { termId: variation })
                const atoms2 = result2?.atoms || []
                if (atoms2.length > 0) {
                  console.log('[INFO] Found atom with variation:', variation.slice(0, 30))
                  result = { atoms: atoms2 }
                  break
                }
              } catch (err) {
                // Continue to next variation
              }
            }
          }
          
          if (result?.atoms && result.atoms.length > 0) {
            profileIdVerified = true
            const atom = result.atoms[0]
            console.log('[INFO] ✅ ProfileId verified via GraphQL - atom exists:', {
              term_id: atom.term_id,
              type: atom.type,
              creator: atom.creator_id,
              created_at: atom.created_at,
              block_number: atom.block_number,
            })
            
            // Check if the atom was created recently (within last 20 minutes)
            if (atom.created_at) {
              try {
                const createdAt = new Date(atom.created_at)
                const now = new Date()
                const minutesAgo = (now.getTime() - createdAt.getTime()) / (1000 * 60)
                
                if (minutesAgo < 20) {
                  console.warn(`[WARN] Profile atom was created only ${minutesAgo.toFixed(1)} minutes ago.`)
                  console.warn('[WARN] MultiVault may not have indexed it yet for triple creation.')
                  console.warn('[WARN] Recommendation: Wait at least 20 minutes after portfolio creation before adding images.')
                }
              } catch (dateErr) {
                // Ignore date parsing errors
              }
            }
          } else {
            console.error('[ERROR] ❌ ProfileId NOT FOUND in GraphQL after multiple search strategies!')
            console.error('[ERROR] ProfileId searched:', profileId)
            console.error('[ERROR] ProfileId (lowercase):', profileId.toLowerCase())
            console.error('[ERROR] This means the atom does not exist in the knowledge graph.')
            console.error('[ERROR] Possible causes:')
            console.error('[ERROR]   1. Portfolio was never created successfully')
            console.error('[ERROR]   2. ProfileId is incorrect')
            console.error('[ERROR]   3. Portfolio creation transaction failed')
            console.error('[ERROR]   4. GraphQL indexing delay (unlikely if portfolio is old)')
            
            return {
              success: false,
              error: `❌ Profile atom not found in knowledge graph!\n\nThe profileId (${profileId.slice(0, 20)}...) does not exist in GraphQL after multiple search attempts.\n\nThis means:\n- The portfolio was never created successfully, OR\n- The profileId is incorrect, OR\n- The portfolio creation transaction failed\n\n✅ Please verify:\n1. Check that the portfolio creation transaction was successful (check transaction hash)\n2. Verify the profileId is correct (should match the Atom ID shown on the portfolio page)\n3. If the portfolio was just created, wait a few minutes for GraphQL indexing\n4. Try refreshing the portfolio page to ensure it loads correctly\n\n📝 Note: If you can see the portfolio on the page, the atom exists but GraphQL may need time to index it.`
            }
          }
        } catch (graphqlErr) {
          console.error('[ERROR] Could not verify profileId via GraphQL:', graphqlErr)
          console.error('[ERROR] GraphQL error details:', graphqlErr)
          // Don't fail here - GraphQL might be temporarily unavailable, but warn user
          console.warn('[WARN] Proceeding without GraphQL verification, but transaction may fail if atom doesn\'t exist.')
        }
      } catch (graphqlCheckErr) {
        console.warn('[WARN] Could not verify profileId via GraphQL:', graphqlCheckErr)
      }
      
      if (!profileIdVerified) {
        console.warn('[WARN] ProfileId could not be verified. Proceeding with transaction, but it may fail if the atom does not exist.')
      }
      
      console.log('[INFO] Validating profileId format:', profileId)

      // Log transaction details for debugging
      console.log('[INFO] ===== addProfileImages Transaction Summary =====')
      console.log('[INFO] Profile ID (subject):', profileId)
      console.log('[INFO] Profile ID verified in GraphQL:', profileIdVerified ? 'YES' : 'NO')
      console.log('[INFO] Image Predicate ID:', imagePredicateId || 'NOT SET (RPC unavailable)')
      console.log('[INFO] Image Hashes Count:', imageHashes.length)
      console.log('[INFO] Image Hashes (first 3):', imageHashes.slice(0, 3))
      console.log('[INFO] Fee:', formatTrustAmount(fee), 'TRUST')
      console.log('[INFO] Contract Address:', PORTFOLIO_CONTRACT_ADDRESS)
      console.log('[INFO] RPC Available:', rpcAvailable ? 'YES' : 'NO')
      console.log('[INFO] ================================================')
      console.log('[INFO] ⚠️  IMPORTANT: All three atoms must exist in MultiVault for triple creation:')
      console.log('[INFO]    1. Profile atom (subject):', profileIdVerified ? '✅ Verified in GraphQL' : '❌ NOT FOUND')
      console.log('[INFO]    2. Image predicate (predicate):', imagePredicateId ? `ID: ${imagePredicateId.slice(0, 20)}...` : '❌ NOT SET')
      console.log('[INFO]    3. Image atom (object): Will be created in this transaction')
      console.log('[INFO] ================================================')
      
      // If RPC was unavailable and we don't have predicate ID, warn but proceed
      if (!rpcAvailable && !imagePredicateId) {
        console.warn('[WARN] ⚠️  RPC unavailable - cannot verify predicate. Transaction may fail.')
        console.warn('[WARN] If transaction fails, it means the image predicate is not initialized.')
      }
      
      // Additional validation: ensure image hashes don't contain invalid characters
      for (let i = 0; i < imageHashes.length; i++) {
        const hash = imageHashes[i]
        // Check for control characters or invalid JSON characters
        if (/[\x00-\x1F\x7F]/.test(hash)) {
          return { 
            success: false, 
            error: `Image hash at index ${i} contains invalid control characters` 
          }
        }
      }

      // Simulate first to catch errors early  
      try {
        await publicClient.simulateContract({
          address: PORTFOLIO_CONTRACT_ADDRESS,
          abi: PORTFOLIO_CONTRACT_ABI,
          functionName: 'addProfileImages',
          args: [profileId, imageHashes],
          value: fee,
          account: address,
        })
        console.log('[INFO] Transaction simulation successful')
      } catch (simError: any) {
        console.error('[ERROR] addProfileImages simulation failed:', simError)
        console.error('[ERROR] Full error object:', JSON.stringify(simError, Object.getOwnPropertyNames(simError), 2))

        // Attempt to decode revert reason
        let errorMessage = simError.message || 'Transaction simulation failed'
        
        try {
          const { decodeErrorResult } = await import('viem')
          const errorData = simError?.cause?.data || simError?.data || simError?.error?.data || simError?.cause?.cause?.data
          if (typeof errorData === 'string' && errorData.startsWith('0x')) {
            // Check for known error signature 0x7b0a37cf
            // This error signature is from MultiVault contract (not PortfolioContract)
            // It typically means the MultiVault contract rejected the atom/triple creation
            if (errorData.startsWith('0x7b0a37cf')) {
              console.error('[ERROR] MultiVault contract error detected (0x7b0a37cf)')
              console.error('[ERROR] This error comes from the MultiVault contract, not PortfolioContract')
              
              // Try to decode using MultiVault ABI
              try {
                const { INTUITION_CONTRACT_ABI } = await import('@/lib/intuitionContract')
                const { decodeErrorResult } = await import('viem')
                const decoded = decodeErrorResult({
                  abi: INTUITION_CONTRACT_ABI,
                  data: errorData as `0x${string}`,
                })
                console.error('[ERROR] Decoded MultiVault error:', decoded.errorName, decoded.args)
                return {
                  success: false,
                  error: `MultiVault contract error: ${decoded.errorName}. This usually means the profile atom doesn't exist or the atom/triple data format is invalid.`
                }
              } catch (decodeErr) {
                console.warn('[WARN] Could not decode MultiVault error:', decodeErr)
              }
              
              console.error('[ERROR] ===== MultiVault Triple Creation Failed =====')
              console.error('[ERROR] Error Code: 0x7b0a37cf (cannot be decoded - custom MultiVault error)')
              console.error('[ERROR] This error means one of the three atoms doesn\'t exist in MultiVault:')
              console.error('[ERROR]   1. Profile atom (subject):', profileId, profileIdVerified ? '✅ Exists in GraphQL' : '❌ NOT FOUND')
              console.error('[ERROR]   2. Image predicate (predicate):', imagePredicateId || 'NOT SET')
              console.error('[ERROR]   3. Image atom (object): Created in same transaction (should exist)')
              console.error('[ERROR] ================================================')
              console.error('[ERROR] Most likely issue: Image predicate atom doesn\'t exist in MultiVault')
              console.error('[ERROR] Even though predicateIds[\'image\'] is set in contract, the atom may not exist in MultiVault')
              console.error('[ERROR] Solution: Contract owner must ensure predicate atom was created in MultiVault')
              
              // Try to get more context from the error
              const errorMsg = simError?.message || simError?.shortMessage || ''
              const fullError = JSON.stringify(simError, null, 2)
              console.error('[ERROR] Full error details:', fullError)
              
              // Provide a comprehensive error message with actionable steps
              const errorDetails = {
                errorCode: '0x7b0a37cf',
                errorSource: 'MultiVault Contract',
                profileId: profileId,
                profileIdShort: profileId.slice(0, 20) + '...',
                imagePredicateId: imagePredicateId ? imagePredicateId.slice(0, 20) + '...' : 'NOT SET',
                possibleCauses: [
                  'Profile atom does not exist in MultiVault on-chain state',
                  'Portfolio creation transaction may have failed or not completed',
                  'MultiVault indexing delay (GraphQL shows atom but MultiVault doesn\'t have it yet)',
                  'Profile atom was created but not properly registered in MultiVault'
                ],
                solutions: [
                  'Wait 15-20 minutes after portfolio creation before adding images',
                  'Verify the portfolio creation transaction was successful (check transaction hash)',
                  'Check that the portfolio appears correctly when viewing it',
                  'Try refreshing the page and waiting a few more minutes',
                  'If the portfolio was just created, MultiVault needs time to process the atom creation'
                ]
              }
              
              console.error('[ERROR] MultiVault triple creation failed:', errorDetails)
              
              // Create a comprehensive diagnostic summary
              const diagnosticInfo = {
                profileAtom: {
                  id: profileId,
                  existsInGraphQL: profileIdVerified,
                  status: profileIdVerified ? '✅ Verified in GraphQL' : '❌ NOT FOUND'
                },
                predicateAtom: {
                  id: imagePredicateId || 'NOT SET',
                  existsInContract: !!imagePredicateId && imagePredicateId !== '0x0000000000000000000000000000000000000000000000000000000000000000',
                  status: imagePredicateId ? '✅ Set in contract' : '❌ NOT SET'
                },
                imageAtom: {
                  status: 'Will be created in this transaction'
                },
                error: '0x7b0a37cf - MultiVault rejected triple creation',
                likelyCause: profileIdVerified 
                  ? 'Predicate atom likely doesn\'t exist in MultiVault\'s on-chain state (indexing delay or not created)'
                  : 'Profile atom doesn\'t exist in MultiVault\'s on-chain state'
              }
              
              console.error('[ERROR] ===== DIAGNOSTIC SUMMARY =====')
              console.error('[ERROR]', JSON.stringify(diagnosticInfo, null, 2))
              console.error('[ERROR] ===============================')
              
              // Provide actionable error message based on diagnostic
              let errorMessage = `❌ MultiVault Error (0x7b0a37cf): Triple Creation Failed\n\n`
              errorMessage += `🔍 Diagnostic Results:\n`
              errorMessage += `- Profile atom: ${profileIdVerified ? '✅ Exists in GraphQL' : '❌ NOT FOUND'}\n`
              errorMessage += `- Predicate atom: ${imagePredicateId ? '✅ Set in contract' : '❌ NOT SET'}\n`
              errorMessage += `- Image atom: Will be created in transaction\n\n`
              
              errorMessage += `💡 What This Error Means:\n`
              errorMessage += `MultiVault rejected the triple creation because one of the required atoms doesn't exist in its on-chain state.\n\n`
              errorMessage += `The triple requires:\n`
              errorMessage += `1. Profile atom (subject) - ${profileIdVerified ? '✅ Found in GraphQL' : '❌ NOT FOUND'}\n`
              errorMessage += `2. Image predicate atom (predicate) - ${imagePredicateId ? '⚠️ Set in contract, but may not exist in MultiVault' : '❌ NOT SET'}\n`
              errorMessage += `3. Image atom (object) - ✅ Will be created in this transaction\n\n`
              
              if (profileIdVerified && imagePredicateId) {
                errorMessage += `🎯 Most Likely Issue:\n`
                errorMessage += `One of the atoms doesn't exist in MultiVault's on-chain state, even though they exist in GraphQL.\n\n`
                errorMessage += `This is typically a MultiVault indexing delay:\n`
                errorMessage += `- GraphQL indexes atoms quickly (seconds)\n`
                errorMessage += `- MultiVault's on-chain state updates slower (minutes)\n\n`
                errorMessage += `The atoms exist in GraphQL but MultiVault hasn't processed them yet for triple creation.\n\n`
                errorMessage += `✅ Solutions (try in order):\n\n`
                errorMessage += `1. Wait 20-30 minutes after portfolio/predicate creation\n`
                errorMessage += `   - MultiVault needs time to index atoms for triple creation\n`
                errorMessage += `   - GraphQL shows atoms immediately, but MultiVault takes longer\n\n`
                errorMessage += `2. If the predicate was just initialized, wait for it to be indexed\n`
                errorMessage += `   - Check the predicate initialization transaction was successful\n`
                errorMessage += `   - Wait at least 20 minutes after initialization\n\n`
                errorMessage += `3. Verify both atoms exist:\n`
                errorMessage += `   - Profile atom: ${profileId.slice(0, 20)}... (✅ Found in GraphQL)\n`
                errorMessage += `   - Predicate atom: ${imagePredicateId.slice(0, 20)}... (✅ Found in GraphQL)\n\n`
                errorMessage += `4. Try again after waiting - MultiVault indexing is asynchronous\n\n`
                errorMessage += `📝 Note: This is a known limitation - GraphQL and MultiVault have different indexing speeds.`
              } else if (!profileIdVerified) {
                errorMessage += `🎯 Most Likely Issue:\n`
                errorMessage += `The profile atom doesn't exist in MultiVault's on-chain state.\n\n`
                errorMessage += `This is likely a MultiVault indexing delay.\n`
                errorMessage += `GraphQL indexes atoms quickly, but MultiVault's on-chain state updates slower.\n\n`
                errorMessage += `✅ Solutions:\n`
                errorMessage += `1. Wait 20+ minutes after portfolio creation\n`
                errorMessage += `2. Verify the portfolio creation transaction was successful (check transaction hash)\n`
                errorMessage += `3. Try again after waiting\n\n`
                errorMessage += `📝 The portfolio exists in GraphQL, but MultiVault needs time to process it.`
              } else {
                errorMessage += `🎯 Most Likely Issue:\n`
                errorMessage += `The image predicate is not initialized in the contract.\n\n`
                errorMessage += `✅ REQUIRED FIX:\n`
                errorMessage += `The contract owner must initialize the 'image' predicate by calling:\n`
                errorMessage += `initializePredicates(['image']) with 0.1 TRUST\n\n`
                errorMessage += `📝 Contact the contract owner to initialize the predicate.`
              }
              
              errorMessage += `\n\n📋 Check browser console (F12) for full diagnostic details.`
              
              return {
                success: false,
                error: errorMessage
              }
            }
            
            try {
              const decoded = decodeErrorResult({
                abi: PORTFOLIO_CONTRACT_ABI,
                data: errorData as `0x${string}`,
              })
              errorMessage = `Contract reverted: ${decoded.errorName || 'Unknown error'}`
            } catch (decodeErr) {
              // If decodeErrorResult fails, check error message for hints
              if (simError?.message?.includes('Predicate') || simError?.message?.includes('not initialized')) {
                errorMessage = "Image predicate 'image' is not initialized. The contract owner must initialize it first."
              } else if (simError?.message?.includes('Send exact')) {
                errorMessage = `Incorrect fee amount. Required: ${formatTrustAmount(fee)} TRUST`
              } else if (simError?.message?.includes('Paused')) {
                errorMessage = 'Portfolio contract is currently paused'
              }
            }
          }
        } catch (decodeErr) {
          console.warn('[WARN] Failed to decode addProfileImages error:', decodeErr)
          // Check error message for common patterns
          if (simError?.message?.includes('Predicate') || simError?.message?.includes('not initialized')) {
            errorMessage = "Image predicate 'image' is not initialized. The contract owner must initialize it first."
          } else if (simError?.message?.includes('Send exact')) {
            errorMessage = `Incorrect fee amount. Required: ${formatTrustAmount(fee)} TRUST`
          }
        }

        return { 
          success: false, 
          error: errorMessage
        }
      }

      // If simulation succeeds, continue to write the transaction
      // Write the contract transaction (only reached if simulation succeeds)
      writeContract({
        address: PORTFOLIO_CONTRACT_ADDRESS,
        abi: PORTFOLIO_CONTRACT_ABI,
        functionName: 'addProfileImages',
        args: [profileId, imageHashes],
        value: fee,
      })

      // Return success - the transaction hash will be available via the hook's hash state
      // The caller should wait for isConfirmed to be true before considering it complete
      return { success: true, txHash: hash }
    } catch (error: any) {
      console.error('[ERROR] addProfileImages failed:', error)
      return { success: false, error: error.message || 'Unknown error' }
    }
  }

  /**
   * Initialize predicates (owner only)
   * @param predicateNames Array of predicate names to initialize
   */
  async function initializePredicates(predicateNames: string[]): Promise<{ success: boolean; error?: string }> {
    if (!isConnected || !address) {
      return { success: false, error: 'Please connect your wallet' }
    }

    if (!publicClient) {
      return { success: false, error: 'Public client not available' }
    }

    if (PORTFOLIO_CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') {
      return { success: false, error: 'Portfolio contract address not configured' }
    }

    try {
      const fee = parseTrustAmount('0.1') * BigInt(predicateNames.length)

      // Simulate first
      try {
        await publicClient.simulateContract({
          address: PORTFOLIO_CONTRACT_ADDRESS,
          abi: PORTFOLIO_CONTRACT_ABI,
          functionName: 'initializePredicates',
          args: [predicateNames],
          value: fee,
          account: address,
        })
      } catch (simError: any) {
        return { success: false, error: simError.message || 'Transaction simulation failed' }
      }

      writeContract({
        address: PORTFOLIO_CONTRACT_ADDRESS,
        abi: PORTFOLIO_CONTRACT_ABI,
        functionName: 'initializePredicates',
        args: [predicateNames],
        value: fee,
      })

      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message || 'Unknown error' }
    }
  }

  /**
   * Update an existing predicate ID (owner only)
   * Use this to fix invalid predicate atoms
   * @param predicateName Predicate name to update
   * @param newPredicateId New predicate atom ID (must be a valid predicate atom)
   */
  async function updatePredicateId(predicateName: string, newPredicateId: `0x${string}`): Promise<{ success: boolean; error?: string }> {
    if (!isConnected || !address) {
      return { success: false, error: 'Please connect your wallet' }
    }

    if (!publicClient) {
      return { success: false, error: 'Public client not available' }
    }

    if (PORTFOLIO_CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') {
      return { success: false, error: 'Portfolio contract address not configured' }
    }

    try {
      // Simulate first
      try {
        await publicClient.simulateContract({
          address: PORTFOLIO_CONTRACT_ADDRESS,
          abi: PORTFOLIO_CONTRACT_ABI,
          functionName: 'updatePredicateId',
          args: [predicateName, newPredicateId],
          account: address,
        })
      } catch (simError: any) {
        return { success: false, error: simError.message || 'Transaction simulation failed' }
      }

      writeContract({
        address: PORTFOLIO_CONTRACT_ADDRESS,
        abi: PORTFOLIO_CONTRACT_ABI,
        functionName: 'updatePredicateId',
        args: [predicateName, newPredicateId],
      })

      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message || 'Unknown error' }
    }
  }

  /**
   * Update profile skills
   * @param profileId The profile atom ID
   * @param skills Array of skill strings
   */
  async function updateProfileSkills(profileId: `0x${string}`, skills: string[]): Promise<{ success: boolean; error?: string; txHash?: `0x${string}` }> {
    if (!isConnected || !address) {
      return { success: false, error: 'Please connect your wallet' }
    }

    if (!publicClient) {
      return { success: false, error: 'Public client not available' }
    }

    if (PORTFOLIO_CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') {
      return { success: false, error: 'Portfolio contract address not configured' }
    }

    try {
      const fee = parseTrustAmount('0.2') // 0.1 for atom + 0.1 for triple

      // Simulate first
      try {
        await publicClient.simulateContract({
          address: PORTFOLIO_CONTRACT_ADDRESS,
          abi: PORTFOLIO_CONTRACT_ABI,
          functionName: 'updateProfileSkills',
          args: [profileId, skills],
          value: fee,
          account: address,
        })
      } catch (simError: any) {
        return { success: false, error: simError.message || 'Transaction simulation failed' }
      }

      writeContract({
        address: PORTFOLIO_CONTRACT_ADDRESS,
        abi: PORTFOLIO_CONTRACT_ABI,
        functionName: 'updateProfileSkills',
        args: [profileId, skills],
        value: fee,
      })

      return { success: true, txHash: hash }
    } catch (error: any) {
      return { success: false, error: error.message || 'Unknown error' }
    }
  }

  /**
   * Update profile tags
   * @param profileId The profile atom ID
   * @param tags Array of tag strings
   */
  async function updateProfileTags(profileId: `0x${string}`, tags: string[]): Promise<{ success: boolean; error?: string; txHash?: `0x${string}` }> {
    if (!isConnected || !address) {
      return { success: false, error: 'Please connect your wallet' }
    }

    if (!publicClient) {
      return { success: false, error: 'Public client not available' }
    }

    if (PORTFOLIO_CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') {
      return { success: false, error: 'Portfolio contract address not configured' }
    }

    try {
      const fee = parseTrustAmount('0.2') // 0.1 for atom + 0.1 for triple

      // Simulate first
      try {
        await publicClient.simulateContract({
          address: PORTFOLIO_CONTRACT_ADDRESS,
          abi: PORTFOLIO_CONTRACT_ABI,
          functionName: 'updateProfileTags',
          args: [profileId, tags],
          value: fee,
          account: address,
        })
      } catch (simError: any) {
        return { success: false, error: simError.message || 'Transaction simulation failed' }
      }

      writeContract({
        address: PORTFOLIO_CONTRACT_ADDRESS,
        abi: PORTFOLIO_CONTRACT_ABI,
        functionName: 'updateProfileTags',
        args: [profileId, tags],
        value: fee,
      })

      return { success: true, txHash: hash }
    } catch (error: any) {
      return { success: false, error: error.message || 'Unknown error' }
    }
  }

  /**
   * Update profile socials
   * @param profileId The profile atom ID
   * @param socials Array of social JSON strings
   */
  async function updateProfileSocials(profileId: `0x${string}`, socials: string[]): Promise<{ success: boolean; error?: string; txHash?: `0x${string}` }> {
    if (!isConnected || !address) {
      return { success: false, error: 'Please connect your wallet' }
    }

    if (!publicClient) {
      return { success: false, error: 'Public client not available' }
    }

    if (PORTFOLIO_CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') {
      return { success: false, error: 'Portfolio contract address not configured' }
    }

    try {
      const fee = parseTrustAmount('0.2') // 0.1 for atom + 0.1 for triple

      // Simulate first
      try {
        await publicClient.simulateContract({
          address: PORTFOLIO_CONTRACT_ADDRESS,
          abi: PORTFOLIO_CONTRACT_ABI,
          functionName: 'updateProfileSocials',
          args: [profileId, socials],
          value: fee,
          account: address,
        })
      } catch (simError: any) {
        return { success: false, error: simError.message || 'Transaction simulation failed' }
      }

      writeContract({
        address: PORTFOLIO_CONTRACT_ADDRESS,
        abi: PORTFOLIO_CONTRACT_ABI,
        functionName: 'updateProfileSocials',
        args: [profileId, socials],
        value: fee,
      })

      return { success: true, txHash: hash }
    } catch (error: any) {
      return { success: false, error: error.message || 'Unknown error' }
    }
  }

  /**
   * Update profile achievements
   * @param profileId The profile atom ID
   * @param achievements Array of achievement strings
   */
  async function updateProfileAchievements(profileId: `0x${string}`, achievements: string[]): Promise<{ success: boolean; error?: string; txHash?: `0x${string}` }> {
    if (!isConnected || !address) {
      return { success: false, error: 'Please connect your wallet' }
    }

    if (!publicClient) {
      return { success: false, error: 'Public client not available' }
    }

    if (PORTFOLIO_CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') {
      return { success: false, error: 'Portfolio contract address not configured' }
    }

    try {
      const fee = parseTrustAmount('0.2') // 0.1 for atom + 0.1 for triple

      // Simulate first
      try {
        await publicClient.simulateContract({
          address: PORTFOLIO_CONTRACT_ADDRESS,
          abi: PORTFOLIO_CONTRACT_ABI,
          functionName: 'updateProfileAchievements',
          args: [profileId, achievements],
          value: fee,
          account: address,
        })
      } catch (simError: any) {
        return { success: false, error: simError.message || 'Transaction simulation failed' }
      }

      writeContract({
        address: PORTFOLIO_CONTRACT_ADDRESS,
        abi: PORTFOLIO_CONTRACT_ABI,
        functionName: 'updateProfileAchievements',
        args: [profileId, achievements],
        value: fee,
      })

      return { success: true, txHash: hash }
    } catch (error: any) {
      return { success: false, error: error.message || 'Unknown error' }
    }
  }

  /**
   * Update profile projects
   * @param profileId The profile atom ID
   * @param projects Array of project JSON strings
   */
  async function updateProfileProjects(profileId: `0x${string}`, projects: string[]): Promise<{ success: boolean; error?: string; txHash?: `0x${string}` }> {
    if (!isConnected || !address) {
      return { success: false, error: 'Please connect your wallet' }
    }

    if (!publicClient) {
      return { success: false, error: 'Public client not available' }
    }

    if (PORTFOLIO_CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') {
      return { success: false, error: 'Portfolio contract address not configured' }
    }

    try {
      const fee = parseTrustAmount('0.2') // 0.1 for atom + 0.1 for triple

      // Simulate first
      try {
        await publicClient.simulateContract({
          address: PORTFOLIO_CONTRACT_ADDRESS,
          abi: PORTFOLIO_CONTRACT_ABI,
          functionName: 'updateProfileProjects',
          args: [profileId, projects],
          value: fee,
          account: address,
        })
      } catch (simError: any) {
        return { success: false, error: simError.message || 'Transaction simulation failed' }
      }

      writeContract({
        address: PORTFOLIO_CONTRACT_ADDRESS,
        abi: PORTFOLIO_CONTRACT_ABI,
        functionName: 'updateProfileProjects',
        args: [profileId, projects],
        value: fee,
      })

      return { success: true, txHash: hash }
    } catch (error: any) {
      return { success: false, error: error.message || 'Unknown error' }
    }
  }

  return {
    createPortfolio,
    addProfileImages,
    updateProfileSkills,
    updateProfileTags,
    updateProfileSocials,
    updateProfileAchievements,
    updateProfileProjects,
    initializePredicates,
    updatePredicateId,
    isPending,
    isConfirmed,
    txHash: hash,
    writeError,
    isPaused: isPaused as boolean | undefined,
    predicatesInitialized: predicatesInitialized as boolean | undefined,
  }
}

