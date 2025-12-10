/**
 * Triple-based User Profile Creation
 * Implements universal, composable profile structure using atoms and triples
 * 
 * Pattern:
 * - User Atom: Minimal atom with just type, wallet, and displayName
 * - Predicate Atoms: Universal concepts (HasName, HasBio, HasAvatar, etc.)
 * - Value Atoms: Actual profile field values
 * - Triples: Link User atom to profile fields via predicates
 */

import { parseEther } from 'viem'
import { 
  INTUITION_CONTRACT_ADDRESS,
  INTUITION_CONTRACT_ABI,
  encodeUserAtomData,
  encodePredicateAtomData,
  encodeValueAtomData
} from './intuitionContract'
import { intuitionClient } from './intuitionClient'

export interface ProfileField {
  predicate: string  // e.g., "HasName", "HasBio"
  value: string      // e.g., "Samuel", "A developer"
}

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
 */
export async function getOrCreatePredicateAtom(
  predicateName: string,
  walletClient: any,
  minimumDeposit: bigint
): Promise<string | null> {
  try {
    // First, try to find existing predicate atom via GraphQL
    const query = `
      query GetPredicateAtom($name: String!) {
        atoms(
          where: {
            _and: [
              { type: { _eq: "Predicate" } }
              { data: { _contains: { name: $name } } }
            ]
          }
          limit: 1
        ) {
          term_id
          id
          type
          data
        }
      }
    `
    
    const result = await intuitionClient.graphqlQuery(query, { name: predicateName })
    
    if (result?.atoms?.[0]?.term_id) {
      console.log(`[OK] Found existing predicate atom: ${predicateName} -> ${result.atoms[0].term_id}`)
      return result.atoms[0].term_id
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
    
    // Wait for transaction and get the atom ID
    // Note: In a real implementation, you'd wait for the transaction receipt
    // and query the contract event or GraphQL to get the atom ID
    // For now, we'll return null and the caller should handle polling
    return null
  } catch (error: any) {
    console.error(`[ERROR] Error getting/creating predicate atom ${predicateName}:`, error)
    return null
  }
}

/**
 * Create a value atom for a profile field
 */
export async function createValueAtom(
  value: string,
  walletClient: any,
  minimumDeposit: bigint
): Promise<string | null> {
  try {
    if (!value || value.trim().length === 0) {
      return null
    }
    
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
    return null // Caller should poll for the atom ID
  } catch (error: any) {
    console.error(`[ERROR] Error creating value atom:`, error)
    return null
  }
}

/**
 * Create triples linking User atom to profile fields
 */
export async function createProfileTriples(
  userAtomId: string,
  profileFields: ProfileField[],
  walletClient: any,
  minimumDeposit: bigint
): Promise<string | null> {
  try {
    // This is a simplified version - in practice, you'd need to:
    // 1. Get or create predicate atoms for each field
    // 2. Create value atoms for each field value
    // 3. Create triples linking user -> predicate -> value
    
    // For now, we'll create the triples via GraphQL (if supported)
    // or return the transaction hash for on-chain creation
    
    const subjects: string[] = []
    const predicates: string[] = []
    const objects: string[] = []
    const assets: bigint[] = []
    
    // Note: This is a placeholder - actual implementation would need
    // to resolve predicate and value atom IDs first
    for (const field of profileFields) {
      if (field.value && field.value.trim().length > 0) {
        subjects.push(userAtomId)
        // predicates.push(predicateAtomId) // Would need to resolve this
        // objects.push(valueAtomId) // Would need to resolve this
        assets.push(minimumDeposit)
      }
    }
    
    if (subjects.length === 0) {
      return null
    }
    
    // Create triples on-chain
    const txHash = await walletClient.writeContract({
      address: INTUITION_CONTRACT_ADDRESS,
      abi: INTUITION_CONTRACT_ABI,
      functionName: 'createTriples',
      args: [
        subjects.map(s => s as `0x${string}`),
        predicates.map(p => p as `0x${string}`),
        objects.map(o => o as `0x${string}`),
        assets
      ],
      value: assets.reduce((sum, a) => sum + a, 0n),
      account: walletClient.account
    })
    
    console.log(`[OK] Profile triples creation transaction sent: ${txHash}`)
    return txHash
  } catch (error: any) {
    console.error(`[ERROR] Error creating profile triples:`, error)
    return null
  }
}

/**
 * Create a universal User atom with minimal data
 * Returns the transaction hash - caller should poll for the atom ID
 */
export async function createUserAtom(
  userWallet: string,
  displayName: string | undefined,
  walletClient: any,
  minimumDeposit: bigint
): Promise<string> {
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
  return txHash
}

/**
 * Convert profile data to ProfileField array
 */
export function profileDataToFields(profileData: UniversalProfileData): ProfileField[] {
  const fields: ProfileField[] = []
  
  if (profileData.name) {
    fields.push({ predicate: PROFILE_PREDICATES.HAS_NAME, value: profileData.name })
  }
  if (profileData.bio) {
    fields.push({ predicate: PROFILE_PREDICATES.HAS_BIO, value: profileData.bio })
  }
  if (profileData.email) {
    fields.push({ predicate: PROFILE_PREDICATES.HAS_EMAIL, value: profileData.email })
  }
  if (profileData.website) {
    fields.push({ predicate: PROFILE_PREDICATES.HAS_WEBSITE, value: profileData.website })
  }
  if (profileData.profilePicture) {
    fields.push({ predicate: PROFILE_PREDICATES.HAS_AVATAR, value: profileData.profilePicture })
  }
  if (profileData.twitter) {
    fields.push({ predicate: PROFILE_PREDICATES.HAS_TWITTER, value: profileData.twitter })
  }
  if (profileData.github) {
    fields.push({ predicate: PROFILE_PREDICATES.HAS_GITHUB, value: profileData.github })
  }
  if (profileData.behance) {
    fields.push({ predicate: PROFILE_PREDICATES.HAS_BEHANCE, value: profileData.behance })
  }
  if (profileData.dribbble) {
    fields.push({ predicate: PROFILE_PREDICATES.HAS_DRIBBBLE, value: profileData.dribbble })
  }
  
  return fields
}









