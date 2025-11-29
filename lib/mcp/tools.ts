/**
 * MCP (Model Context Protocol) Tool Handlers
 * These functions handle tool execution requests from MCP clients
 */

import { z } from 'zod'
import { intuitionClient, getAttestations, getTrustScoreForAddress } from '@/lib/intuition/client'
import { resolveAddressOrENS } from '@/lib/intuition/ens'

// Validation schemas
const AddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address')

const AttestationFiltersSchema = z.object({
  creator: z.string().optional(),
  subject: z.string().optional(),
  predicate: z.string().optional(),
  object: z.string().optional(),
  minConfidence: z.number().min(0).max(1).optional(),
  fromTimestamp: z.number().int().positive().optional(),
  toTimestamp: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(1000).optional(),
  offset: z.number().int().min(0).optional(),
})

/**
 * Get trust score for an Ethereum address
 */
export async function handleGetTrustScore(params: { address: string }) {
  const { address } = AddressSchema.parse(params.address)

  // Resolve ENS if needed
  const resolution = await resolveAddressOrENS(address)
  if (!resolution.address) {
    throw new Error(resolution.error || 'Invalid address or ENS name')
  }

  const trustScore = await getTrustScoreForAddress(resolution.address)
  
  if (!trustScore) {
    return {
      address: resolution.address,
      ensName: resolution.ensName,
      score: null,
      message: 'No trust score found for this address',
    }
  }

  return {
    address: resolution.address,
    ensName: resolution.ensName,
    ...trustScore,
  }
}

/**
 * Get attestations with filters
 */
export async function handleGetAttestations(params: any) {
  const filters = AttestationFiltersSchema.parse(params)
  const attestations = await getAttestations(filters)
  
  return {
    attestations,
    count: attestations.length,
    filters,
  }
}

/**
 * Verify if an address has a specific credential (predicate-object pair)
 */
export async function handleVerifyCredential(params: { address: string; claim: string }) {
  const { address, claim } = z.object({
    address: z.string(),
    claim: z.string(),
  }).parse(params)

  // Resolve address
  const resolution = await resolveAddressOrENS(address)
  if (!resolution.address) {
    throw new Error(resolution.error || 'Invalid address or ENS name')
  }

  // Get user atom
  const userAtom = await intuitionClient.getUserProfileByAddress(resolution.address)
  if (!userAtom) {
    return {
      address: resolution.address,
      hasCredential: false,
      message: 'User atom not found',
    }
  }

  // Parse claim (format: "predicate:object" or just "predicate")
  const [predicate, object] = claim.includes(':') ? claim.split(':') : [claim, undefined]

  // Check for triples matching the claim
  const triples = await intuitionClient.getTriples(userAtom.id, predicate)
  
  const hasCredential = object
    ? triples.some(t => t.object.toLowerCase() === object.toLowerCase())
    : triples.length > 0

  return {
    address: resolution.address,
    hasCredential,
    predicate,
    object: object || null,
    triplesFound: triples.length,
  }
}

/**
 * Find trusted experts in a topic
 */
export async function handleFindTrustedExperts(params: { topic: string; limit?: number }) {
  const { topic, limit = 10 } = z.object({
    topic: z.string(),
    limit: z.number().int().min(1).max(100).optional(),
  }).parse(params)

  // Search for atoms with the topic as a predicate or in their data
  // This is a simplified implementation - you may need to adjust based on your data model
  const attestations = await getAttestations({
    predicate: topic,
    limit: limit * 2, // Get more to filter by trust score
  })

  // Get trust scores for subjects
  const experts = []
  for (const attestation of attestations.slice(0, limit * 2)) {
    const trustScore = await getTrustScoreForAddress(attestation.subject)
    if (trustScore && trustScore.score > 0) {
      experts.push({
        address: attestation.subject,
        trustScore: trustScore.score,
        shares: trustScore.shares,
        votes: trustScore.votes,
      })
    }
  }

  // Sort by trust score and limit
  experts.sort((a, b) => b.trustScore - a.trustScore)
  
  return {
    topic,
    experts: experts.slice(0, limit),
    count: experts.length,
  }
}



