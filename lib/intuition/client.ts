/**
 * Intuition Client wrapper for API routes
 * Extends the base IntuitionClient with additional methods needed for API endpoints
 */

import { intuitionClient as baseClient } from '@/lib/intuitionClient'
import type { AttestationFilters, Attestation } from './types'
import type { Triple } from '@/lib/intuitionClient'

/**
 * Get attestations (triples) with filters
 */
export async function getAttestations(filters: AttestationFilters): Promise<Attestation[]> {
  try {
    // Build GraphQL query based on filters
    const whereConditions: string[] = []
    const variables: Record<string, any> = {}

    if (filters.subject) {
      whereConditions.push('{ subject: { _eq: $subject } }')
      variables.subject = filters.subject.toLowerCase()
    }

    if (filters.predicate) {
      whereConditions.push('{ predicate: { _eq: $predicate } }')
      variables.predicate = filters.predicate
    }

    if (filters.object) {
      whereConditions.push('{ object: { _eq: $object } }')
      variables.object = filters.object.toLowerCase()
    }

    if (filters.creator) {
      // Note: creator might not be directly available in triples
      // This would need to be implemented based on your data model
      whereConditions.push('{ creator: { _eq: $creator } }')
      variables.creator = filters.creator.toLowerCase()
    }

    const whereClause = whereConditions.length > 0
      ? `where: { _and: [${whereConditions.join(', ')}] }`
      : ''

    const limit = filters.limit || 100
    const offset = filters.offset || 0

    const query = `
      query GetTriples(${Object.keys(variables).map(k => `$${k}: String!`).join(', ')}) {
        triples(${whereClause}, limit: ${limit}, offset: ${offset}) {
          id
          subject
          predicate
          object
        }
      }
    `

    const data = await baseClient.graphqlQuery(query, variables)

    if (!data || !data.triples) {
      return []
    }

    // Convert triples to attestations format
    const attestations: Attestation[] = data.triples.map((triple: Triple) => ({
      id: triple.id,
      subject: triple.subject,
      predicate: triple.predicate,
      object: triple.object,
      confidence: 1.0, // Default confidence if not available
    }))

    // Apply additional filters that can't be done in GraphQL
    let filtered = attestations

    if (filters.minConfidence !== undefined) {
      filtered = filtered.filter(a => (a.confidence || 0) >= filters.minConfidence!)
    }

    if (filters.fromTimestamp !== undefined) {
      filtered = filtered.filter(a => (a.timestamp || 0) >= filters.fromTimestamp!)
    }

    if (filters.toTimestamp !== undefined) {
      filtered = filtered.filter(a => (a.timestamp || 0) <= filters.toTimestamp!)
    }

    return filtered
  } catch (error) {
    console.error('Error fetching attestations:', error)
    // Fallback to REST API via getTriples
    try {
      const triples = await baseClient.getTriples(filters.subject || '')
      return triples.map(triple => ({
        id: triple.id,
        subject: triple.subject,
        predicate: triple.predicate,
        object: triple.object,
        confidence: 1.0,
      }))
    } catch (fallbackError) {
      console.error('Fallback also failed:', fallbackError)
      return []
    }
  }
}

/**
 * Get trust score for an address (resolves to atom first)
 */
export async function getTrustScoreForAddress(address: string) {
  try {
    // First, get the user atom for this address
    const userAtom = await baseClient.getUserProfileByAddress(address)
    if (!userAtom) {
      return null
    }

    // Then get trust score for the atom
    const trustScore = await baseClient.getTrustScore(userAtom.id)
    return trustScore
  } catch (error) {
    console.error('Error getting trust score for address:', error)
    return null
  }
}

// Re-export the base client
export const intuitionClient = baseClient



