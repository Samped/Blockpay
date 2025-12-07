/**
 * Universal Profile Creation System
 * Implements the universal atom and triple system for user profiles
 * 
 * Pattern:
 * 1. Create User atom: abi.encode("User", userWallet, displayName)
 * 2. Get or create predicate atoms (HasName, HasBio, etc.)
 * 3. Create value atoms for each profile field
 * 4. Create triples linking User -> Predicate -> Value
 */

import { parseEther, waitForTransactionReceipt } from 'viem'
import { 
  INTUITION_CONTRACT_ADDRESS,
  INTUITION_CONTRACT_ABI,
  encodeUserAtomData,
  encodePredicateAtomData,
  encodeValueAtomData,
  decodeUserAtomData,
  decodePredicateAtomData,
  decodeValueAtomData
} from './intuitionContract'
import { intuitionClient } from './intuitionClient'

export interface UniversalProfileData {
  displayName?: string
  name?: string
  bio?: string
  email?: string
  website?: string
  profilePicture?: string
  twitter?: string
  github?: string
  behance?: string
  dribbble?: string
}

/**
 * Universal predicate names for user profiles
 * These are shared across all applications
 */
export const PROFILE_PREDICATES = {
  HAS_NAME: 'HasName',
  HAS_BIO: 'HasBio',
  HAS_EMAIL: 'HasEmail',
  HAS_WEBSITE: 'HasWebsite',
  HAS_AVATAR: 'HasAvatar',
  HAS_TWITTER: 'HasTwitter',
  HAS_GITHUB: 'HasGithub',
  HAS_BEHANCE: 'HasBehance',
  HAS_DRIBBBLE: 'HasDribbble',
} as const

/**
 * Get or create a predicate atom
 * Predicates are universal and can be reused across all applications
 * Returns the atom ID (term_id) if found or created
 */
export async function getOrCreatePredicateAtom(
  predicateName: string,
  walletClient: any,
  publicClient: any,
  minimumDeposit: bigint
): Promise<string | null> {
  try {
    console.log(`[INFO] Getting or creating predicate atom: ${predicateName}`)
    
    // First, try to find existing predicate atom via GraphQL
    const query = `
      query GetPredicateAtom($name: String!) {
        atoms(
          where: {
            _and: [
              { type: { _eq: "Predicate" } }
            ]
          }
          limit: 100
        ) {
          term_id
          id
          type
          data
        }
      }
    `
    
    const result = await intuitionClient.graphqlQuery(query, {})
    
    // Filter atoms to find the one with matching predicate name
    if (result?.atoms) {
      for (const atom of result.atoms) {
        if (typeof atom.data === 'string' && atom.data.startsWith('0x')) {
          const decoded = decodePredicateAtomData(atom.data as `0x${string}`)
          if (decoded === predicateName) {
            console.log(`[OK] Found existing predicate atom: ${predicateName} -> ${atom.term_id}`)
            return atom.term_id
          }
        }
      }
    }
    
    // If not found, create it
    console.log(`[INFO] Creating new predicate atom: ${predicateName}`)
    const predicateData = encodePredicateAtomData(predicateName)
    
    const txHash = await walletClient.writeContract({
      address: INTUITION_CONTRACT_ADDRESS,
      abi: INTUITION_CONTRACT_ABI,
      functionName: 'createAtoms',
      args: [
        [predicateData],
        [minimumDeposit]
      ],
      value: minimumDeposit,
      account: walletClient.account
    })
    
    console.log(`[OK] Predicate atom creation transaction sent: ${txHash}`)
    
    // Wait for transaction receipt
    const receipt = await waitForTransactionReceipt(publicClient, { hash: txHash })
    console.log(`[OK] Predicate atom transaction confirmed: ${receipt.transactionHash}`)
    
    // Poll for the atom to be indexed
    let attempts = 0
    const maxAttempts = 20
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      const queryResult = await intuitionClient.graphqlQuery(query, {})
      if (queryResult?.atoms) {
        for (const atom of queryResult.atoms) {
          if (typeof atom.data === 'string' && atom.data.startsWith('0x')) {
            const decoded = decodePredicateAtomData(atom.data as `0x${string}`)
            if (decoded === predicateName) {
              console.log(`[SUCCESS] Predicate atom indexed: ${predicateName} -> ${atom.term_id}`)
              return atom.term_id
            }
          }
        }
      }
      attempts++
    }
    
    console.warn(`[WARNING] Predicate atom not indexed after ${maxAttempts} attempts`)
    return null
  } catch (error: any) {
    console.error(`[ERROR] Error getting/creating predicate atom ${predicateName}:`, error)
    return null
  }
}

/**
 * Create a value atom for a profile field
 * Returns the atom ID (term_id) after creation and indexing
 */
export async function createValueAtom(
  value: string,
  walletClient: any,
  publicClient: any,
  minimumDeposit: bigint
): Promise<string | null> {
  try {
    if (!value || value.trim().length === 0) {
      return null
    }
    
    console.log(`[INFO] Creating value atom for: ${value.substring(0, 50)}...`)
    const valueData = encodeValueAtomData(value)
    
    const txHash = await walletClient.writeContract({
      address: INTUITION_CONTRACT_ADDRESS,
      abi: INTUITION_CONTRACT_ABI,
      functionName: 'createAtoms',
      args: [
        [valueData],
        [minimumDeposit]
      ],
      value: minimumDeposit,
      account: walletClient.account
    })
    
    console.log(`[OK] Value atom creation transaction sent: ${txHash}`)
    
    // Wait for transaction receipt
    const receipt = await waitForTransactionReceipt(publicClient, { hash: txHash })
    console.log(`[OK] Value atom transaction confirmed: ${receipt.transactionHash}`)
    
    // Poll for the atom to be indexed
    let attempts = 0
    const maxAttempts = 20
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Query for atoms with this value
      const query = `
        query GetValueAtom {
          atoms(
            where: {
              type: { _eq: "Value" }
            }
            limit: 100
            order_by: { created_at: desc }
          ) {
            term_id
            data
          }
        }
      `
      
      const result = await intuitionClient.graphqlQuery(query, {})
      if (result?.atoms) {
        for (const atom of result.atoms) {
          if (typeof atom.data === 'string' && atom.data.startsWith('0x')) {
            const decoded = decodeValueAtomData(atom.data as `0x${string}`)
            if (decoded === value) {
              console.log(`[SUCCESS] Value atom indexed: ${value.substring(0, 50)}... -> ${atom.term_id}`)
              return atom.term_id
            }
          }
        }
      }
      attempts++
    }
    
    console.warn(`[WARNING] Value atom not indexed after ${maxAttempts} attempts`)
    return null
  } catch (error: any) {
    console.error(`[ERROR] Error creating value atom:`, error)
    return null
  }
}

/**
 * Create a universal User atom with minimal data
 * bytes userData = abi.encode("User", userWallet, displayName)
 * Returns the atom ID (term_id) after creation and indexing
 */
export async function createUserAtom(
  userWallet: string,
  displayName: string | undefined,
  walletClient: any,
  publicClient: any,
  minimumDeposit: bigint
): Promise<{ atomId: string | null; txHash: string }> {
  try {
    console.log(`[INFO] Creating User atom for wallet: ${userWallet}`)
    const userData = encodeUserAtomData(userWallet, displayName)
    
    const txHash = await walletClient.writeContract({
      address: INTUITION_CONTRACT_ADDRESS,
      abi: INTUITION_CONTRACT_ABI,
      functionName: 'createAtoms',
      args: [
        [userData],
        [minimumDeposit]
      ],
      value: minimumDeposit,
      account: walletClient.account
    })
    
    console.log(`[OK] User atom creation transaction sent: ${txHash}`)
    
    // Wait for transaction receipt
    const receipt = await waitForTransactionReceipt(publicClient, { hash: txHash })
    console.log(`[OK] User atom transaction confirmed: ${receipt.transactionHash}`)
    
    // Poll for the atom to be indexed
    let attempts = 0
    const maxAttempts = 20
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Query for User atoms with this wallet
      const query = `
        query GetUserAtom($wallet: String!) {
          atoms(
            where: {
              type: { _eq: "User" }
            }
            limit: 100
            order_by: { created_at: desc }
          ) {
            term_id
            data
          }
        }
      `
      
      const result = await intuitionClient.graphqlQuery(query, {})
      if (result?.atoms) {
        for (const atom of result.atoms) {
          if (typeof atom.data === 'string' && atom.data.startsWith('0x')) {
            const decoded = decodeUserAtomData(atom.data as `0x${string}`)
            if (decoded && decoded.wallet.toLowerCase() === userWallet.toLowerCase()) {
              console.log(`[SUCCESS] User atom indexed: ${userWallet} -> ${atom.term_id}`)
              return { atomId: atom.term_id, txHash }
            }
          }
        }
      }
      attempts++
    }
    
    console.warn(`[WARNING] User atom not indexed after ${maxAttempts} attempts`)
    return { atomId: null, txHash }
  } catch (error: any) {
    console.error(`[ERROR] Error creating User atom:`, error)
    throw error
  }
}

/**
 * Create triples linking User atom to profile fields
 * Creates triples: UserAtom -> PredicateAtom -> ValueAtom
 */
export async function createProfileTriples(
  userAtomId: string,
  profileData: UniversalProfileData,
  walletClient: any,
  publicClient: any,
  minimumDeposit: bigint
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    console.log(`[INFO] Creating profile triples for User atom: ${userAtomId}`)
    
    // Map profile data to predicate-value pairs
    const fieldMappings: Array<{ predicate: string; value: string }> = []
    
    if (profileData.name) {
      fieldMappings.push({ predicate: PROFILE_PREDICATES.HAS_NAME, value: profileData.name })
    }
    if (profileData.bio) {
      fieldMappings.push({ predicate: PROFILE_PREDICATES.HAS_BIO, value: profileData.bio })
    }
    if (profileData.email) {
      fieldMappings.push({ predicate: PROFILE_PREDICATES.HAS_EMAIL, value: profileData.email })
    }
    if (profileData.website) {
      fieldMappings.push({ predicate: PROFILE_PREDICATES.HAS_WEBSITE, value: profileData.website })
    }
    if (profileData.profilePicture) {
      fieldMappings.push({ predicate: PROFILE_PREDICATES.HAS_AVATAR, value: profileData.profilePicture })
    }
    if (profileData.twitter) {
      fieldMappings.push({ predicate: PROFILE_PREDICATES.HAS_TWITTER, value: profileData.twitter })
    }
    if (profileData.github) {
      fieldMappings.push({ predicate: PROFILE_PREDICATES.HAS_GITHUB, value: profileData.github })
    }
    if (profileData.behance) {
      fieldMappings.push({ predicate: PROFILE_PREDICATES.HAS_BEHANCE, value: profileData.behance })
    }
    if (profileData.dribbble) {
      fieldMappings.push({ predicate: PROFILE_PREDICATES.HAS_DRIBBBLE, value: profileData.dribbble })
    }
    
    if (fieldMappings.length === 0) {
      console.log('[INFO] No profile fields to create triples for')
      return { success: true }
    }
    
    // Get or create predicate atoms
    const predicateAtomIds: string[] = []
    for (const field of fieldMappings) {
      const predicateId = await getOrCreatePredicateAtom(
        field.predicate,
        walletClient,
        publicClient,
        minimumDeposit
      )
      if (predicateId) {
        predicateAtomIds.push(predicateId)
      } else {
        console.warn(`[WARNING] Failed to get/create predicate atom: ${field.predicate}`)
        return { success: false, error: `Failed to get/create predicate: ${field.predicate}` }
      }
    }
    
    // Create value atoms
    const valueAtomIds: string[] = []
    for (const field of fieldMappings) {
      const valueId = await createValueAtom(
        field.value,
        walletClient,
        publicClient,
        minimumDeposit
      )
      if (valueId) {
        valueAtomIds.push(valueId)
      } else {
        console.warn(`[WARNING] Failed to create value atom for: ${field.value.substring(0, 50)}`)
        return { success: false, error: `Failed to create value atom for: ${field.predicate}` }
      }
    }
    
    // Prepare triple arrays
    const subjects: `0x${string}`[] = fieldMappings.map(() => userAtomId as `0x${string}`)
    const predicates: `0x${string}`[] = predicateAtomIds.map(id => id as `0x${string}`)
    const objects: `0x${string}`[] = valueAtomIds.map(id => id as `0x${string}`)
    const assets: bigint[] = fieldMappings.map(() => minimumDeposit)
    const totalValue = assets.reduce((sum, a) => sum + a, 0n)
    
    console.log(`[INFO] Creating ${subjects.length} triples...`)
    
    // Create triples on-chain
    const txHash = await walletClient.writeContract({
      address: INTUITION_CONTRACT_ADDRESS,
      abi: INTUITION_CONTRACT_ABI,
      functionName: 'createTriples',
      args: [subjects, predicates, objects, assets],
      value: totalValue,
      account: walletClient.account
    })
    
    console.log(`[OK] Profile triples creation transaction sent: ${txHash}`)
    
    // Wait for transaction receipt
    const receipt = await waitForTransactionReceipt(publicClient, { hash: txHash })
    console.log(`[OK] Profile triples transaction confirmed: ${receipt.transactionHash}`)
    
    return { success: true, txHash }
  } catch (error: any) {
    console.error(`[ERROR] Error creating profile triples:`, error)
    return { success: false, error: error.message || 'Unknown error' }
  }
}

/**
 * Create a complete universal profile
 * 1. Creates User atom with minimal data
 * 2. Creates predicate atoms (if needed)
 * 3. Creates value atoms for profile fields
 * 4. Creates triples linking everything together
 */
export async function createUniversalProfile(
  userWallet: string,
  profileData: UniversalProfileData,
  walletClient: any,
  publicClient: any,
  minimumDeposit: bigint
): Promise<{
  userAtomId: string | null
  success: boolean
  error?: string
  txHashes?: string[]
}> {
  try {
    console.log('[INFO] Creating universal profile...')
    
    // Step 1: Create User atom
    const { atomId: userAtomId, txHash: userTxHash } = await createUserAtom(
      userWallet,
      profileData.displayName,
      walletClient,
      publicClient,
      minimumDeposit
    )
    
    if (!userAtomId) {
      return {
        userAtomId: null,
        success: false,
        error: 'Failed to create or index User atom',
        txHashes: [userTxHash]
      }
    }
    
    console.log(`[SUCCESS] User atom created: ${userAtomId}`)
    
    // Step 2: Create profile triples (predicates, values, and triples)
    const triplesResult = await createProfileTriples(
      userAtomId,
      profileData,
      walletClient,
      publicClient,
      minimumDeposit
    )
    
    if (!triplesResult.success) {
      return {
        userAtomId,
        success: false,
        error: triplesResult.error || 'Failed to create profile triples',
        txHashes: [userTxHash, triplesResult.txHash].filter(Boolean) as string[]
      }
    }
    
    console.log('[SUCCESS] Universal profile created successfully!')
    
    return {
      userAtomId,
      success: true,
      txHashes: [userTxHash, triplesResult.txHash].filter(Boolean) as string[]
    }
  } catch (error: any) {
    console.error('[ERROR] Error creating universal profile:', error)
    return {
      userAtomId: null,
      success: false,
      error: error.message || 'Unknown error'
    }
  }
}






