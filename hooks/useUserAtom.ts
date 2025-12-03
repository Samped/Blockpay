'use client'

import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'

const GRAPHQL_URL = 'https://testnet.intuition.sh/v1/graphql'

/**
 * Hook to get the current user's atom ID (term_id) from Intuition Knowledge Graph
 */
export function useUserAtom() {
  const { address, isConnected } = useAccount()
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
              term_id
            }
          }
        `

        const response = await fetch(GRAPHQL_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query,
            variables: { address: address.toLowerCase() },
          }),
        })

        const result = await response.json()
        const atom = result.data?.atoms?.[0]
        
        if (atom?.term_id) {
          setUserAtomId(atom.term_id.toLowerCase() as `0x${string}`)
        } else {
          setUserAtomId(null)
        }
      } catch (error) {
        console.error('Error fetching user atom:', error)
        setUserAtomId(null)
      } finally {
        setLoading(false)
      }
    }

    fetchUserAtom()
  }, [address, isConnected])

  return { userAtomId, loading }
}

