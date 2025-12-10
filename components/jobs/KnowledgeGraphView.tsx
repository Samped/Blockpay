'use client'

import { useEffect, useState, useRef } from 'react'
import { usePublicClient, useAccount } from 'wagmi'
import { JOB_POOL_ADDRESS, JOB_POOL_ABI } from '@/lib/jobPoolContract'
import { checkAtomIndexed } from '@/lib/checkAtomIndexed'

const GRAPHQL_URL = 'https://testnet.intuition.sh/v1/graphql'

interface Atom {
  term_id: string
  type: string
  label?: string
  data?: string
  created_at?: string
  creator_id?: string
}

interface Triple {
  id: string
  subject: string
  predicate: string
  object: string
  created_at?: string
}

interface JobGraphData {
  jobAtom?: Atom
  submissionAtoms: Atom[]
  paymentAtoms: Atom[]
  triples: Triple[]
}

interface IndexStatus {
  [atomId: string]: boolean
}

export function KnowledgeGraphView({ jobId }: { jobId: bigint }) {
  const publicClient = usePublicClient()
  const { address } = useAccount()
  const [loading, setLoading] = useState(true)
  const [graphData, setGraphData] = useState<JobGraphData>({
    submissionAtoms: [],
    paymentAtoms: [],
    triples: [],
  })
  const [indexStatus, setIndexStatus] = useState<IndexStatus>({})
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const hasLoadedRef = useRef(false)

  // Reset retry count and loaded flag when jobId changes
  useEffect(() => {
    setRetryCount(0)
    setError(null)
    setLoading(true)
    hasLoadedRef.current = false
  }, [jobId])

  useEffect(() => {
    let cancelled = false
    let timeoutId: NodeJS.Timeout | null = null

    const fetchGraphData = async () => {
      if (!jobId) {
        setLoading(false)
        setError('Invalid job id')
        return
      }

      if (!publicClient) {
        // No RPC client yet (wallet/provider not ready)
        setLoading(false)
        setError('Connect your wallet or wait for the network to initialize to view the knowledge graph.')
        return
      }

      // Don't fetch if we already have data and it's not a retry
      if (hasLoadedRef.current && retryCount === 0) {
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)

      // Add timeout to prevent infinite loading
      timeoutId = setTimeout(() => {
        if (!cancelled && retryCount < 3) {
          console.log(`[INFO] Knowledge graph timeout, retrying (attempt ${retryCount + 1}/3)...`)
          setError('Request timed out. The knowledge graph may still be indexing. Retrying automatically...')
          // Automatically retry after a short delay by incrementing retry count
          setTimeout(() => {
            if (!cancelled) {
              setRetryCount(prev => prev + 1)
            }
          }, 3000) // Retry after 3 seconds
        } else if (!cancelled) {
          setError('Request timed out after multiple attempts. The knowledge graph may still be indexing. Please check back later.')
          setLoading(false)
        }
      }, 60000) // 60 second timeout

      try {
        console.log('[INFO] Fetching knowledge graph for job:', jobId.toString())
        // 1. Get atom IDs from contract
        const jobAtomId = await publicClient.readContract({
          address: JOB_POOL_ADDRESS as `0x${string}`,
          abi: JOB_POOL_ABI,
          functionName: 'jobAtomIds',
          args: [jobId],
        }) as `0x${string}`

        // Get submission and payment atom IDs by trying indices until we hit empty
        const submissionAtomIds: `0x${string}`[] = []
        const paymentAtomIds: `0x${string}`[] = []

        // Try up to 100 submissions (maxSubmissionsPerJob limit)
        // Stop early if we get consecutive empty results
        let consecutiveEmpty = 0
        for (let i = 0; i < 100; i++) {
          try {
            const subAtomId = await publicClient.readContract({
              address: JOB_POOL_ADDRESS as `0x${string}`,
              abi: JOB_POOL_ABI,
              functionName: 'submissionAtomIds',
              args: [jobId, BigInt(i)],
            }) as `0x${string}`

            const payAtomId = await publicClient.readContract({
              address: JOB_POOL_ADDRESS as `0x${string}`,
              abi: JOB_POOL_ABI,
              functionName: 'paymentAtomIds',
              args: [jobId, BigInt(i)],
            }) as `0x${string}`

            const hasSub = subAtomId && subAtomId !== '0x0000000000000000000000000000000000000000000000000000000000000000'
            const hasPay = payAtomId && payAtomId !== '0x0000000000000000000000000000000000000000000000000000000000000000'

            if (hasSub) {
              submissionAtomIds.push(subAtomId)
              consecutiveEmpty = 0
            }
            if (hasPay) {
              paymentAtomIds.push(payAtomId)
              consecutiveEmpty = 0
            }

            // If both are empty and we've checked a few, likely no more exist
            if (!hasSub && !hasPay) {
              consecutiveEmpty++
              if (consecutiveEmpty >= 3) {
                break // Stop if we get 3 consecutive empty results
              }
            }
          } catch (err) {
            // If we get an error, likely no more submissions exist, break the loop
            console.warn(`Error fetching atom IDs for submission ${i}:`, err)
            break
          }
        }

        // 2. Query Intuition GraphQL for atom details
        const allAtomIds = [
          jobAtomId,
          ...submissionAtomIds,
          ...paymentAtomIds,
        ].filter(id => id && id !== '0x0000000000000000000000000000000000000000000000000000000000000000')

        if (allAtomIds.length === 0) {
          setError('No atoms found for this job')
          setLoading(false)
          return
        }

        // Query atoms
        const atomsQuery = `
          query GetAtoms($termIds: [String!]!) {
            atoms(where: { term_id: { _in: $termIds } }) {
              term_id
              type
              label
              data
              created_at
              creator_id
            }
          }
        `

        const atomsResponse = await fetch(GRAPHQL_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: atomsQuery,
            variables: { termIds: allAtomIds },
          }),
        })

        const atomsData = await atomsResponse.json()

        if (atomsData.errors) {
          console.error('GraphQL errors:', atomsData.errors)
          setError(`GraphQL error: ${atomsData.errors[0]?.message || 'Unknown error'}`)
          setLoading(false)
          return
        }

        const atoms: Atom[] = atomsData.data?.atoms || []

        // Separate atoms by type
        const jobAtom = atoms.find(a => a.term_id.toLowerCase() === jobAtomId.toLowerCase())
        const submissionAtoms = atoms.filter(a =>
          submissionAtomIds.some(id => id.toLowerCase() === a.term_id.toLowerCase())
        )
        const paymentAtoms = atoms.filter(a =>
          paymentAtomIds.some(id => id.toLowerCase() === a.term_id.toLowerCase())
        )

        // 3. Query triples connecting these atoms
        // Query each atom individually to avoid GraphQL schema issues
        const allTriples: Triple[] = []
        
        for (const atomId of allAtomIds) {
          try {
            const triplesQuery = `
              query GetTriples($atomId: String!) {
                triples(
                  where: {
                    _or: [
                      { subject: { _eq: $atomId } }
                      { object: { _eq: $atomId } }
                    ]
                  }
                ) {
                  id
                  subject
                  predicate
                  object
                  created_at
                }
              }
            `

            const triplesResponse = await fetch(GRAPHQL_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                query: triplesQuery,
                variables: { atomId: atomId.toLowerCase() },
              }),
            })

            const triplesData = await triplesResponse.json()
            
            if (triplesData.data?.triples) {
              allTriples.push(...triplesData.data.triples)
            }
          } catch (err) {
            console.warn(`Could not fetch triples for atom ${atomId}:`, err)
          }
        }

        // Remove duplicates
        const uniqueTriples = allTriples.filter((triple, index, self) =>
          index === self.findIndex(t => t.id === triple.id)
        )

        // Filter to only include triples connecting our atoms
        const relevantTriples = uniqueTriples.filter(t =>
          allAtomIds.some(id => id.toLowerCase() === t.subject.toLowerCase()) &&
          allAtomIds.some(id => id.toLowerCase() === t.object.toLowerCase())
        )

        if (cancelled) return

        setGraphData({
          jobAtom,
          submissionAtoms,
          paymentAtoms,
          triples: relevantTriples,
        })

        // Check index status for all atoms
        const statusChecks: IndexStatus = {}
        const allAtoms = [
          jobAtom,
          ...submissionAtoms,
          ...paymentAtoms,
        ].filter(Boolean) as Atom[]

        for (const atom of allAtoms) {
          try {
            const status = await checkAtomIndexed(atom.term_id)
            statusChecks[atom.term_id.toLowerCase()] = status.indexed
          } catch (err) {
            console.warn(`Could not check index status for ${atom.term_id}:`, err)
            statusChecks[atom.term_id.toLowerCase()] = false
          }
        }

        setIndexStatus(statusChecks)

        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = null
        }
        setLoading(false)
        hasLoadedRef.current = true // Mark as successfully loaded
        setRetryCount(0) // Reset retry count on success
        console.log('[SUCCESS] Knowledge graph loaded successfully')
      } catch (err: any) {
        if (cancelled) return
        
        console.error('Error fetching knowledge graph data:', err)
        if (timeoutId) clearTimeout(timeoutId)
        setError(err.message || 'Failed to load knowledge graph')
        setLoading(false)
      }
    }

    fetchGraphData()

    return () => {
      cancelled = true
    }
  }, [publicClient, jobId, address, retryCount])

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-card p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Knowledge Graph</h3>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <span className="ml-3 text-gray-600">Loading knowledge graph...</span>
        </div>
      </div>
    )
  }

  if (error && !loading) {
    return (
      <div className="bg-white rounded-2xl shadow-card p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Knowledge Graph</h3>
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">{error}</p>
        </div>
      </div>
    )
  }

  const parseAtomData = (data?: string) => {
    if (!data) return null
    try {
      return JSON.parse(data)
    } catch {
      return null
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-card p-6">
      <h3 className="text-xl font-bold text-gray-900 mb-6">Knowledge Graph</h3>

      {/* Graph Visualization */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
        <div className="flex flex-col items-center space-y-4">
          {/* Job Atom */}
          {graphData.jobAtom && (
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-2">
                <div className="bg-blue-100 text-blue-800 px-4 py-2 rounded-lg font-semibold">
                  Job #{jobId.toString()}
                </div>
                {indexStatus[graphData.jobAtom.term_id.toLowerCase()] && (
                  <span className="text-green-600 text-xl" title="Indexed in Intuition GraphQL">
                    Indexed
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {graphData.jobAtom.term_id.substring(0, 10)}...
              </div>
            </div>
          )}

          {/* Connections to Submissions */}
          {graphData.submissionAtoms.length > 0 && (
            <div className="flex items-center">
              <div className="w-8 h-0.5 bg-gray-400"></div>
              <div className="text-xs text-gray-500 px-2">hasSubmission</div>
              <div className="w-8 h-0.5 bg-gray-400"></div>
            </div>
          )}

          {/* Submission Atoms */}
          {graphData.submissionAtoms.map((atom, idx) => {
            const data = parseAtomData(atom.data)
            const isIndexed = indexStatus[atom.term_id.toLowerCase()]
            return (
              <div key={atom.term_id} className="flex flex-col items-center">
                <div className="flex items-center gap-2">
                  <div className="bg-green-100 text-green-800 px-4 py-2 rounded-lg font-semibold">
                    Submission #{idx + 1}
                  </div>
                  {isIndexed && (
                    <span className="text-green-600 text-xl" title="Indexed in Intuition GraphQL">
                      Indexed
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {atom.term_id.substring(0, 10)}...
                </div>

                {/* Connection to Payment */}
                {graphData.paymentAtoms[idx] && (
                  <>
                    <div className="w-0.5 h-4 bg-gray-400 my-1"></div>
                    <div className="text-xs text-gray-500">paidOutAs</div>
                    <div className="w-0.5 h-4 bg-gray-400 my-1"></div>
                    <div className="flex items-center gap-2">
                      <div className="bg-purple-100 text-purple-800 px-4 py-2 rounded-lg font-semibold">
                        Payment #{idx + 1}
                      </div>
                      {indexStatus[graphData.paymentAtoms[idx].term_id.toLowerCase()] && (
                        <span className="text-green-600 text-xl" title="Indexed in Intuition GraphQL">
                          Indexed
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {graphData.paymentAtoms[idx].term_id.substring(0, 10)}...
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Detailed Atom List */}
      <div className="space-y-4">
        {/* Job Atom Details */}
        {graphData.jobAtom && (
          <div className="border border-gray-200 rounded-lg p-4">
            <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <span>Job</span>
              <span>Job Atom</span>
              {indexStatus[graphData.jobAtom.term_id.toLowerCase()] && (
                <span className="text-green-600 text-lg" title="Indexed in Intuition GraphQL">
                  [SUCCESS] Indexed
                </span>
              )}
            </h4>
            <div className="space-y-2 text-sm">
              <div>
                <span className="font-medium text-gray-700">ID:</span>
                <code className="ml-2 text-xs bg-gray-100 px-2 py-1 rounded font-mono break-all">
                  {graphData.jobAtom.term_id}
                </code>
              </div>
              <div>
                <span className="font-medium text-gray-700">Type:</span>
                <span className="ml-2">{graphData.jobAtom.type}</span>
              </div>
              {graphData.jobAtom.created_at && (
                <div>
                  <span className="font-medium text-gray-700">Created:</span>
                  <span className="ml-2">{new Date(graphData.jobAtom.created_at).toLocaleString()}</span>
                </div>
              )}
              {parseAtomData(graphData.jobAtom.data) && (
                <div className="mt-3">
                  <span className="font-medium text-gray-700">Data:</span>
                  <pre className="text-xs bg-gray-50 p-3 rounded mt-2 overflow-auto border border-gray-200">
                    {JSON.stringify(parseAtomData(graphData.jobAtom.data), null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Submission Atoms */}
        {graphData.submissionAtoms.map((atom, idx) => {
          const data = parseAtomData(atom.data)
          const isIndexed = indexStatus[atom.term_id.toLowerCase()]
          return (
            <div key={atom.term_id} className="border border-gray-200 rounded-lg p-4">
              <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <span>Submission</span>
                <span>Submission Atom #{idx + 1}</span>
                {isIndexed && (
                  <span className="text-green-600 text-lg" title="Indexed in Intuition GraphQL">
                    Indexed Indexed
                  </span>
                )}
              </h4>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-medium text-gray-700">ID:</span>
                  <code className="ml-2 text-xs bg-gray-100 px-2 py-1 rounded font-mono break-all">
                    {atom.term_id}
                  </code>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Type:</span>
                  <span className="ml-2">{atom.type}</span>
                </div>
                {atom.created_at && (
                  <div>
                    <span className="font-medium text-gray-700">Created:</span>
                    <span className="ml-2">{new Date(atom.created_at).toLocaleString()}</span>
                  </div>
                )}
                {data && (
                  <div className="mt-3">
                    <span className="font-medium text-gray-700">Data:</span>
                    <pre className="text-xs bg-gray-50 p-3 rounded mt-2 overflow-auto border border-gray-200">
                      {JSON.stringify(data, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {/* Payment Atoms */}
        {graphData.paymentAtoms.map((atom, idx) => {
          const data = parseAtomData(atom.data)
          const isIndexed = indexStatus[atom.term_id.toLowerCase()]
          return (
            <div key={atom.term_id} className="border border-gray-200 rounded-lg p-4">
              <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <span>Payment</span>
                <span>Payment Atom #{idx + 1}</span>
                {isIndexed && (
                  <span className="text-green-600 text-lg" title="Indexed in Intuition GraphQL">
                    Indexed Indexed
                  </span>
                )}
              </h4>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-medium text-gray-700">ID:</span>
                  <code className="ml-2 text-xs bg-gray-100 px-2 py-1 rounded font-mono break-all">
                    {atom.term_id}
                  </code>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Type:</span>
                  <span className="ml-2">{atom.type}</span>
                </div>
                {atom.created_at && (
                  <div>
                    <span className="font-medium text-gray-700">Created:</span>
                    <span className="ml-2">{new Date(atom.created_at).toLocaleString()}</span>
                  </div>
                )}
                {data && (
                  <div className="mt-3">
                    <span className="font-medium text-gray-700">Data:</span>
                    <pre className="text-xs bg-gray-50 p-3 rounded mt-2 overflow-auto border border-gray-200">
                      {JSON.stringify(data, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {/* Triples */}
        {graphData.triples.length > 0 && (
          <div className="border border-gray-200 rounded-lg p-4">
            <h4 className="font-semibold text-gray-900 mb-2 flex items-center">
              <span className="mr-2">Links:</span> Relationships (Triples)
            </h4>
            <div className="space-y-2">
              {graphData.triples.map((triple) => (
                <div key={triple.id} className="text-sm bg-gray-50 p-2 rounded">
                  <div className="font-mono text-xs">
                    <span className="text-blue-600">{triple.subject.substring(0, 10)}...</span>
                    {' -> '}
                    <span className="text-purple-600">{triple.predicate}</span>
                    {' -> '}
                    <span className="text-green-600">{triple.object.substring(0, 10)}...</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {graphData.triples.length === 0 && graphData.jobAtom && (
          <div className="text-sm text-gray-500 text-center py-4">
            No triples found yet. Triples are created when submissions are made and accepted.
          </div>
        )}
      </div>
    </div>
  )
}

