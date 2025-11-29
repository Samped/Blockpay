/**
 * Types for Intuition API interactions
 */

export interface AttestationFilters {
  creator?: string
  subject?: string
  predicate?: string
  object?: string
  minConfidence?: number
  fromTimestamp?: number
  toTimestamp?: number
  limit?: number
  offset?: number
}

export interface Attestation {
  id: string
  subject: string
  predicate: string
  object: string
  creator?: string
  confidence?: number
  timestamp?: number
}



