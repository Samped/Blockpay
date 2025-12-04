'use client'

import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { useVotingContract } from '@/hooks/useVotingContract'
import { usePublicClient } from 'wagmi'
import { VOTING_CONTRACT_ADDRESS, VOTING_CONTRACT_ABI } from '@/lib/votingContract'
import { useUserAtom } from '@/hooks/useUserAtom'

const GRAPHQL_URL = 'https://testnet.intuition.sh/v1/graphql'

interface VoteButtonProps {
  jobId: bigint
  jobAtomId: `0x${string}`
  userAtomId?: `0x${string}` | null
  onVoteSuccess?: () => void
}

export function VoteButton({ jobId, jobAtomId, userAtomId, onVoteSuccess }: VoteButtonProps) {
  const { address, isConnected } = useAccount()
  const { voteOnJob, isPending, isConfirmed, checkHasVoted, getVotesCount } = useVotingContract()
  const publicClient = usePublicClient()
  const { userAtomId: hookUserAtomId } = useUserAtom()
  const [hasVoted, setHasVoted] = useState(false)
  const [voteCount, setVoteCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [jobStatus, setJobStatus] = useState<number | null>(null)
  const [disableReason, setDisableReason] = useState<string | null>(null)

  // Use provided userAtomId or fall back to hook
  const effectiveUserAtomId = userAtomId || hookUserAtomId

  // Check job status and vote status
  useEffect(() => {
    const checkVoteStatus = async () => {
      if (!publicClient || !jobId) {
        setLoading(false)
        return
      }

      const reasons: string[] = []

      try {
        // Check job status from JobPool
        try {
          const JOB_POOL_ADDRESS = process.env.NEXT_PUBLIC_JOB_POOL_ADDRESS || '0xA4Ff50De4BF072063cb76D6c67952fAD2412e918'
          const JOB_POOL_ABI = [
            {
              name: 'jobs',
              type: 'function',
              stateMutability: 'view',
              inputs: [{ name: '', type: 'uint256' }],
              outputs: [
                { name: 'creator', type: 'address' },
                { name: 'payment', type: 'uint256' },
                { name: 'deadline', type: 'uint256' },
                { name: 'status', type: 'uint8' },
                { name: 'activeSubmissionsCount', type: 'uint256' },
                { name: 'platformFeeAtCreation', type: 'uint256' },
                { name: 'jobMetaHash', type: 'string' },
              ],
            },
          ] as const

          const jobData = await publicClient.readContract({
            address: JOB_POOL_ADDRESS as `0x${string}`,
            abi: JOB_POOL_ABI,
            functionName: 'jobs',
            args: [jobId],
          }) as [address: `0x${string}`, payment: bigint, deadline: bigint, status: number, activeSubmissionsCount: bigint, platformFeeAtCreation: bigint, jobMetaHash: string]

          const status = jobData[3] // status is at index 3
          setJobStatus(status)

          // JobStatus enum: 0=Active, 1=Completed, 2=Cancelled, 3=Expired
          if (status !== 0) {
            const statusNames = ['Active', 'Completed', 'Cancelled', 'Expired']
            reasons.push(`Job is ${statusNames[status] || 'not active'}. Only active jobs can be voted on.`)
          }
        } catch (error) {
          console.error('Error checking job status:', error)
        }

        // Check if user has already voted
        if (address) {
          try {
            const voted = await checkHasVoted(jobId)
            setHasVoted(voted)
            if (voted) {
              reasons.push('You have already voted on this job.')
            }
          } catch (error) {
            console.error('Error checking vote status:', error)
          }
        }

        // Check other conditions
        if (!isConnected) reasons.push('Wallet not connected')
        if (!effectiveUserAtomId) reasons.push('User profile not created')
        if (isPending) reasons.push('Transaction pending')
        if (!jobAtomId || jobAtomId === '0x0000000000000000000000000000000000000000000000000000000000000000') {
          reasons.push('Job atom ID missing (old job)')
        }

        // Set disable reason (but exclude "User profile not created" from being shown in tooltip)
        const reasonsToShow = reasons.filter(r => r !== 'User profile not created')
        setDisableReason(reasonsToShow.length > 0 ? reasonsToShow.join('. ') : null)

        console.log('[VOTE] VoteButton debug:', {
          jobId: jobId.toString(),
          isConnected,
          hasUserAtom: !!effectiveUserAtomId,
          userAtomId: effectiveUserAtomId,
          hasVoted,
          isPending,
          jobStatus: jobStatus,
          jobAtomId: jobAtomId || 'missing',
          reasons,
        })
      } catch (error) {
        console.error('Error checking vote status:', error)
      } finally {
        setLoading(false)
      }
    }

    checkVoteStatus()
  }, [publicClient, address, jobId, checkHasVoted, isConfirmed, isConnected, effectiveUserAtomId, isPending, jobAtomId])

  // Fetch vote count from contract and GraphQL
  useEffect(() => {
    const fetchVoteCount = async () => {
      if (!jobAtomId || !publicClient) return

      try {
        // First try to get count from contract
        const contractCount = await getVotesCount(jobId)
        setVoteCount(contractCount)

        // Also try to get count from GraphQL for verification
        const votedPredicate = await publicClient.readContract({
          address: VOTING_CONTRACT_ADDRESS as `0x${string}`,
          abi: VOTING_CONTRACT_ABI,
          functionName: 'votedPredicate',
        }) as `0x${string}`

        if (!votedPredicate || votedPredicate === '0x0000000000000000000000000000000000000000000000000000000000000000') {
          return
        }

        // Query triples where object = jobAtomId and predicate = votedPredicate
        const query = `
          query GetVotes($jobAtomId: String!, $predicateId: String!) {
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
              predicateId: votedPredicate.toLowerCase(),
            },
          }),
        })

        const data = await response.json()
        if (data.data?.triples) {
          const graphqlCount = data.data.triples.length
          // Use GraphQL count if it's higher (more up-to-date)
          if (graphqlCount > contractCount) {
            setVoteCount(graphqlCount)
          }
        }
      } catch (error) {
        console.error('Error fetching vote count:', error)
        // Fall back to contract count if GraphQL fails
        try {
          const contractCount = await getVotesCount(jobId)
          setVoteCount(contractCount)
        } catch {
          setVoteCount(null)
        }
      }
    }

    fetchVoteCount()
  }, [jobAtomId, publicClient, jobId, getVotesCount, isConfirmed])

  const handleVote = async () => {
    if (!isConnected || !address) {
      alert('Please connect your wallet to vote')
      return
    }

    if (!effectiveUserAtomId) {
      const createProfile = confirm(
        'You need to create a user profile first to vote on jobs.\n\n' +
        'This creates your identity atom in the Intuition Knowledge Graph.\n\n' +
        'Would you like to create your profile now?'
      )
      if (createProfile) {
        // Trigger the UserInitialization modal to show
        window.dispatchEvent(new CustomEvent('showCreateProfileModal'))
      }
      return
    }

    if (hasVoted) {
      alert('You have already voted on this job')
      return
    }

    try {
      const result = await voteOnJob(jobId, effectiveUserAtomId as `0x${string}`)
      if (result.success) {
        setHasVoted(true)
        if (voteCount !== null) {
          setVoteCount(voteCount + 1)
        }
        onVoteSuccess?.()
      } else {
        alert(result.error || 'Failed to vote on job')
      }
    } catch (error: any) {
      console.error('Error voting:', error)
      alert(error.message || 'Failed to vote on job')
    }
  }

  if (loading) {
    return (
      <button
        disabled
        className="flex items-center gap-2 px-5 py-2.5 bg-gray-100 text-gray-400 rounded-xl cursor-not-allowed shadow-sm"
      >
        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span className="font-medium">Loading...</span>
      </button>
    )
  }


  const isDisabled = !isConnected || hasVoted || isPending || !effectiveUserAtomId || (jobStatus !== null && jobStatus !== 0) || !jobAtomId || jobAtomId === '0x0000000000000000000000000000000000000000000000000000000000000000'
  
  return (
    <div className="relative group">
      <button
        onClick={handleVote}
        disabled={isDisabled}
        title={disableReason || (isDisabled ? 'Connect wallet and create profile to vote' : 'Vote on this job')}
        className={`flex items-center gap-2.5 px-5 py-2.5 rounded-xl font-medium transition-all duration-200 shadow-sm ${
          hasVoted
            ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white cursor-not-allowed shadow-md'
            : isDisabled
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
            : 'bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700 hover:shadow-lg hover:scale-105 active:scale-95'
        }`}
      >
        {hasVoted ? (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
        <span>{hasVoted ? 'Voted' : 'Vote'}</span>
        {voteCount !== null && voteCount > 0 && (
          <span className="ml-1 px-2 py-0.5 bg-white/20 rounded-full text-sm font-semibold">
            {voteCount}
          </span>
        )}
      </button>
      {isDisabled && disableReason && (
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
          {disableReason}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
            <div className="border-4 border-transparent border-t-gray-800"></div>
          </div>
        </div>
      )}
    </div>
  )
}

