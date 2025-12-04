'use client'

import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { useJobPool } from '@/hooks/useJobPool'
import { usePublicClient } from 'wagmi'
import { JOB_POOL_ADDRESS, JOB_POOL_ABI } from '@/lib/jobPoolContract'

const GRAPHQL_URL = 'https://testnet.intuition.sh/v1/graphql'

interface UpvoteButtonProps {
  jobId: bigint
  jobAtomId: `0x${string}`
  userAtomId?: `0x${string}` | null
  onUpvoteSuccess?: () => void
}

export function UpvoteButton({ jobId, jobAtomId, userAtomId, onUpvoteSuccess }: UpvoteButtonProps) {
  const { address, isConnected } = useAccount()
  const { upvoteJob, isPending, isConfirmed } = useJobPool()
  const publicClient = usePublicClient()
  const [hasUpvoted, setHasUpvoted] = useState(false)
  const [upvoteCount, setUpvoteCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  // Check if user has already upvoted
  useEffect(() => {
    const checkUpvoteStatus = async () => {
      if (!publicClient || !address || !jobId) {
        setLoading(false)
        return
      }

      try {
        const upvoted = await publicClient.readContract({
          address: JOB_POOL_ADDRESS as `0x${string}`,
          abi: JOB_POOL_ABI,
          functionName: 'hasUpvoted',
          args: [jobId, address],
        })
        setHasUpvoted(upvoted as boolean)
      } catch (error) {
        console.error('Error checking upvote status:', error)
      } finally {
        setLoading(false)
      }
    }

    checkUpvoteStatus()
  }, [publicClient, address, jobId])

  // Fetch upvote count from GraphQL
  useEffect(() => {
    const fetchUpvoteCount = async () => {
      if (!jobAtomId) return

      try {
        // Get the upvoted predicate ID from contract
        if (!publicClient) return

        const upvotedPredicate = await publicClient.readContract({
          address: JOB_POOL_ADDRESS as `0x${string}`,
          abi: JOB_POOL_ABI,
          functionName: 'upvotedPredicate',
        }) as `0x${string}`

        if (!upvotedPredicate || upvotedPredicate === '0x0000000000000000000000000000000000000000000000000000000000000000') {
          setUpvoteCount(0)
          return
        }

        // Query triples where object = jobAtomId and predicate = upvotedPredicate
        const query = `
          query GetUpvotes($jobAtomId: String!, $predicateId: String!) {
            triples(
              where: {
                _and: [
                  { object: { _eq: $jobAtomId } }
                  { predicate: { _eq: $predicateId } }
                ]
              }
            ) {
              id
              subject
              object
            }
          }
        `

        const response = await fetch(GRAPHQL_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query,
            variables: {
              jobAtomId: jobAtomId.toLowerCase(),
              predicateId: upvotedPredicate.toLowerCase(),
            },
          }),
        })

        const data = await response.json()
        if (data.data?.triples) {
          setUpvoteCount(data.data.triples.length)
        } else {
          setUpvoteCount(0)
        }
      } catch (error) {
        console.error('Error fetching upvote count:', error)
        setUpvoteCount(null)
      }
    }

    fetchUpvoteCount()
  }, [jobAtomId, publicClient, isConfirmed])

  const handleUpvote = async () => {
    if (!isConnected || !address) {
      alert('Please connect your wallet to upvote')
      return
    }

    if (!userAtomId) {
      alert('Please create your user profile first to upvote jobs')
      return
    }

    if (hasUpvoted) {
      alert('You have already upvoted this job')
      return
    }

    try {
      const result = await upvoteJob(jobId, userAtomId as `0x${string}`)
      if (result.success) {
        setHasUpvoted(true)
        if (upvoteCount !== null) {
          setUpvoteCount(upvoteCount + 1)
        }
        onUpvoteSuccess?.()
      } else {
        alert(result.error || 'Failed to upvote job')
      }
    } catch (error: any) {
      console.error('Error upvoting:', error)
      alert(error.message || 'Failed to upvote job')
    }
  }

  if (loading) {
    return (
      <button
        disabled
        className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-400 rounded-lg cursor-not-allowed"
      >
        <span>Upvote</span>
        <span>Loading...</span>
      </button>
    )
  }

  return (
    <button
      onClick={handleUpvote}
      disabled={!isConnected || hasUpvoted || isPending || !userAtomId}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
        hasUpvoted
          ? 'bg-green-100 text-green-700 cursor-not-allowed'
          : isConnected && userAtomId
          ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
          : 'bg-gray-100 text-gray-400 cursor-not-allowed'
      }`}
    >
      <span>{hasUpvoted ? 'Upvoted' : 'Upvote'}</span>
      <span>{hasUpvoted ? 'Upvoted' : 'Upvote'}</span>
      {upvoteCount !== null && (
        <span className="ml-1 text-sm font-semibold">({upvoteCount})</span>
      )}
    </button>
  )
}

