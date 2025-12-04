'use client'

import { useState, useEffect } from 'react'
import { useAccount, usePublicClient } from 'wagmi'
import { intuitionClient } from '@/lib/intuitionClient'

/**
 * Hook to get the current user's atom ID (term_id) from Intuition Knowledge Graph
 * Uses the same method as UserProfile component: intuitionClient.getUserProfileByAddress
 */
export function useUserAtom() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const [userAtomId, setUserAtomId] = useState<`0x${string}` | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchUserAtom = async () => {
      if (!isConnected || !address) {
        setUserAtomId(null)
        setLoading(false)
        return
      }

      try {
        console.log('[INFO] useUserAtom: Fetching user atom for address:', address)
        
        // Use the same method as UserProfile component - this is what works!
        const userAtom = await intuitionClient.getUserProfileByAddress(address, publicClient || undefined)
        
        if (userAtom?.term_id) {
          const termId = userAtom.term_id.toLowerCase() as `0x${string}`
          console.log('[SUCCESS] useUserAtom: Found user atom ID:', termId)
          setUserAtomId(termId)
        } else if (userAtom?.id) {
          // Fallback to id if term_id not available
          const atomId = userAtom.id.toLowerCase() as `0x${string}`
          console.log('[SUCCESS] useUserAtom: Found user atom ID (from id field):', atomId)
          setUserAtomId(atomId)
        } else {
          console.warn('[WARNING] useUserAtom: No user atom found')
          setUserAtomId(null)
        }
      } catch (error) {
        console.error('[ERROR] useUserAtom: Error fetching user atom:', error)
        setUserAtomId(null)
      } finally {
        setLoading(false)
      }
    }

    fetchUserAtom()
  }, [address, isConnected, publicClient])

  return { userAtomId, loading }
}

