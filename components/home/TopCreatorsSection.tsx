'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { intuitionClient, TrustScore, Atom } from '@/lib/intuitionClient'

interface CreatorData extends TrustScore {
  address?: string
  atom?: Atom
  completedJobs?: number
}

// Mock data for development/demo - Top 10
const mockCreators: CreatorData[] = [
  {
    atomId: '0x1234567890123456789012345678901234567890',
    score: 9850,
    shares: 1250,
    votes: 342,
    address: '0x1234567890123456789012345678901234567890',
    completedJobs: 45,
  },
  {
    atomId: '0x2345678901234567890123456789012345678901',
    score: 8720,
    shares: 980,
    votes: 298,
    address: '0x2345678901234567890123456789012345678901',
    completedJobs: 38,
  },
  {
    atomId: '0x3456789012345678901234567890123456789012',
    score: 7650,
    shares: 850,
    votes: 256,
    address: '0x3456789012345678901234567890123456789012',
    completedJobs: 32,
  },
  {
    atomId: '0x4567890123456789012345678901234567890123',
    score: 6540,
    shares: 720,
    votes: 198,
    address: '0x4567890123456789012345678901234567890123',
    completedJobs: 28,
  },
  {
    atomId: '0x5678901234567890123456789012345678901234',
    score: 5430,
    shares: 650,
    votes: 175,
    address: '0x5678901234567890123456789012345678901234',
    completedJobs: 24,
  },
  {
    atomId: '0x6789012345678901234567890123456789012345',
    score: 4320,
    shares: 580,
    votes: 152,
    address: '0x6789012345678901234567890123456789012345',
    completedJobs: 21,
  },
  {
    atomId: '0x7890123456789012345678901234567890123456',
    score: 3890,
    shares: 520,
    votes: 128,
    address: '0x7890123456789012345678901234567890123456',
    completedJobs: 18,
  },
  {
    atomId: '0x8901234567890123456789012345678901234567',
    score: 3210,
    shares: 450,
    votes: 105,
    address: '0x8901234567890123456789012345678901234567',
    completedJobs: 15,
  },
  {
    atomId: '0x9012345678901234567890123456789012345678',
    score: 2780,
    shares: 380,
    votes: 89,
    address: '0x9012345678901234567890123456789012345678',
    completedJobs: 12,
  },
  {
    atomId: '0x0123456789012345678901234567890123456789',
    score: 2450,
    shares: 320,
    votes: 76,
    address: '0x0123456789012345678901234567890123456789',
    completedJobs: 10,
  },
]

export function TopCreatorsSection() {
  const router = useRouter()
  const [creators, setCreators] = useState<CreatorData[]>(mockCreators)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const fetchCreators = async () => {
      try {
        setLoading(true)
        const topCreators = await intuitionClient.getTopCreators(10)
        
        // If API returns empty array or fails, use mock data
        if (!topCreators || topCreators.length === 0) {
          console.log('No creators from API, using mock data')
          setCreators(mockCreators)
          setLoading(false)
          return
        }
        
        // Fetch additional data for each creator
        const creatorsWithData = await Promise.all(
          topCreators.map(async (creator, index) => {
            try {
              const atom = await intuitionClient.getAtom(creator.atomId)
              const triples = await intuitionClient.getTriples(creator.atomId, 'completed_job_for')
              
              // Try to extract address from atom data or use atomId as fallback
              const address = atom?.data?.address || atom?.data?.wallet || creator.atomId.slice(0, 42)
              
              return {
                ...creator,
                atom,
                address,
                completedJobs: triples.length,
              }
            } catch (err) {
              // If individual creator fetch fails, return basic data
              return {
                ...creator,
                address: creator.atomId.slice(0, 42),
                completedJobs: 0,
              }
            }
          })
        )

        setCreators(creatorsWithData.length > 0 ? creatorsWithData : mockCreators)
      } catch (error) {
        console.error('Error fetching creators:', error)
        // Fallback to mock data for development
        setCreators(mockCreators)
      } finally {
        setLoading(false)
      }
    }

    // Only fetch if we want to try API, otherwise use mock data immediately
    // fetchCreators()
  }, [])

  const formatAddress = (address: string) => {
    if (!address) return 'N/A'
    if (address.length > 42) return address.slice(0, 6) + '...' + address.slice(-4)
    return address.slice(0, 6) + '...' + address.slice(-4)
  }

  const getTrustLevel = (score: number) => {
    if (score >= 8000) return { level: 'Elite', color: 'bg-purple-100 text-purple-700', badge: '⭐' }
    if (score >= 6000) return { level: 'Expert', color: 'bg-blue-100 text-blue-700', badge: '🏆' }
    if (score >= 4000) return { level: 'Pro', color: 'bg-green-100 text-green-700', badge: '✨' }
    if (score >= 2000) return { level: 'Rising', color: 'bg-yellow-100 text-yellow-700', badge: '📈' }
    return { level: 'New', color: 'bg-gray-100 text-gray-700', badge: '🌱' }
  }

  // Ensure we always have creators to display - limit to top 10
  const displayCreators = (creators.length > 0 ? creators : mockCreators).slice(0, 10)

  if (loading) {
    return (
      <section className="py-16 bg-gray-50">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center mb-8">
            <h2 className="text-3xl md:text-4xl font-bold mb-3 text-gray-900">
              Top Creators
            </h2>
            <p className="text-base text-gray-600">
              Leading creators ranked by trust and reputation
            </p>
          </div>
          <div className="max-w-5xl mx-auto bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="animate-pulse">
              {[...Array(10)].map((_, i) => (
                <div key={i} className="p-2.5 border-b border-gray-100">
                  <div className="h-3 bg-gray-200 rounded w-1/4"></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="py-16 bg-gray-50">
      <div className="container">
        <div className="mx-auto max-w-2xl text-center mb-8">
          <h2 className="text-3xl md:text-4xl font-bold mb-3 text-gray-900">
            Top Creators
          </h2>
          <p className="text-base text-gray-600">
            Leading creators ranked by trust and reputation
          </p>
        </div>

        {displayCreators.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-600">No creators found. Check back soon!</p>
          </div>
        ) : (
          <div className="max-w-7xl mx-auto bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-y border-gray-200">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Rank
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Address
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Trust Level
                    </th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Trust Score
                    </th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Shares
                    </th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Votes
                    </th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Jobs
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {displayCreators.map((creator, index) => {
                    const trustInfo = getTrustLevel(creator.score)
                    return (
                      <tr
                        key={creator.atomId}
                        onClick={() => router.push(`/creators/${creator.atomId}`)}
                        className="hover:bg-gray-50 transition-colors cursor-pointer group"
                      >
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center text-white font-bold text-xs">
                              {index + 1}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <div className="text-xs font-medium text-gray-900 group-hover:text-primary transition-colors">
                            {formatAddress(creator.address || creator.atomId)}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${trustInfo.color}`}>
                            {trustInfo.badge} {trustInfo.level}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-right">
                          <div className="text-xs font-semibold text-primary">
                            {creator.score.toLocaleString()}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-right">
                          <div className="text-xs text-gray-700">
                            {creator.shares.toLocaleString()}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-right">
                          <div className="text-xs text-gray-700">
                            {creator.votes.toLocaleString()}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-right">
                          <div className="text-xs text-gray-700">
                            {creator.completedJobs || 0}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="text-center mt-8">
          <Link
            href="/creators"
            className="inline-flex items-center px-5 py-2 text-sm font-semibold rounded-full border border-gray-300 text-gray-900 hover:border-primary hover:text-primary transition-all duration-200"
          >
            View All Creators
            <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  )
}

