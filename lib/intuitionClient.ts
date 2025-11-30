/**
 * Intuition Knowledge Graph Client
 * Handles interactions with Intuition's Knowledge Graph for Atoms, Triples, and Multivote Contracts
 */

import { parseEther } from 'viem'
import {
  INTUITION_CONTRACT_ABI,
  INTUITION_CONTRACT_ADDRESS,
  createAtomUri
} from './intuitionContract'

export interface Atom {
  id: string
  type: string
  data?: Record<string, any>
}

export interface Triple {
  id: string
  subject: string
  predicate: string
  object: string
}

export interface TrustScore {
  atomId: string
  score: number
  shares: number
  votes: number
}

export class IntuitionClient {
  private apiUrl: string
  private graphUrl: string
  private graphqlUrl: string
  private contractAddress: string

  constructor(apiUrl?: string, graphUrl?: string, graphqlUrl?: string) {
    this.apiUrl = apiUrl || process.env.NEXT_PUBLIC_INTUITION_API_URL || 'https://testnet.intuition.sh'
    this.graphUrl = graphUrl || process.env.NEXT_PUBLIC_INTUITION_GRAPH_URL || 'https://testnet.intuition.sh'
    this.graphqlUrl = graphqlUrl || process.env.NEXT_PUBLIC_INTUITION_GRAPHQL_URL || 'https://testnet.intuition.sh/v1/graphql'
    this.contractAddress = process.env.NEXT_PUBLIC_INTUITION_CONTRACT || '0x2Ece8D4dEdcB9918A398528f3fa4688b1d2CAB91'
  }

  /**
   * Execute a GraphQL query with timeout
   */
  async graphqlQuery(query: string, variables?: Record<string, any>, timeout: number = 5000): Promise<any> {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      try {
        console.log('GraphQL Query:', { url: this.graphqlUrl, query: query.substring(0, 100), variables })
        
        const response = await fetch(this.graphqlUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query,
            variables,
          }),
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        const responseText = await response.text()
        console.log('GraphQL Response Status:', response.status, response.statusText)
        console.log('GraphQL Response Body:', responseText.substring(0, 500))

        if (!response.ok) {
          console.error('GraphQL HTTP error:', response.status, responseText)
          throw new Error(`GraphQL API returned ${response.status}: ${responseText.substring(0, 200)}`)
        }

        let result
        try {
          result = JSON.parse(responseText)
        } catch (parseError) {
          console.error('Failed to parse GraphQL response:', parseError)
          throw new Error(`Invalid JSON response from GraphQL API: ${responseText.substring(0, 200)}`)
        }
        
        if (result.errors) {
          console.error('❌ GraphQL errors:', JSON.stringify(result.errors, null, 2))
          const errorMessages = result.errors.map((e: any) => e.message || JSON.stringify(e)).join(', ')
          throw new Error(`GraphQL errors: ${errorMessages}`)
        }

        // Log successful responses for debugging
        if (result.data) {
          const dataKeys = Object.keys(result.data)
          console.log('✅ GraphQL query successful. Returned keys:', dataKeys)
          if (result.data.atoms) {
            console.log('   Atoms count:', result.data.atoms.length)
          }
        }

        return result.data
      } catch (fetchError: any) {
        clearTimeout(timeoutId)
        if (fetchError.name === 'AbortError') {
          console.warn('GraphQL query timeout')
          throw new Error('GraphQL query timed out')
        }
        throw fetchError
      }
    } catch (error: any) {
      console.error('Error executing GraphQL query:', error)
      throw error // Re-throw to allow caller to handle
    }
  }

  /**
   * Get an Atom from the Knowledge Graph
   */
  async getAtom(atomId: string): Promise<Atom | null> {
    try {
      const response = await fetch(`${this.graphUrl}/atoms/${atomId}`)
      if (!response.ok) return null
      return await response.json()
    } catch (error) {
      console.error('Error fetching atom:', error)
      return null
    }
  }

  /**
   * Create a new Atom in the Knowledge Graph
   */
  async createAtom(type: string, data: Record<string, any>): Promise<Atom | null> {
    try {
      console.log('=== REST API: Creating atom ===')
      console.log('Type:', type)
      console.log('Graph URL:', this.graphUrl)
      console.log('API URL:', this.apiUrl)
      console.log('Data keys:', Object.keys(data))
      console.log('Full data:', JSON.stringify(data, null, 2))
      
      // Try Next.js API route first (bypasses CORS)
      // Include contract address in the request
      try {
        console.log('🌐 Trying Next.js API route (bypasses CORS)...')
        console.log('📝 Including contract address:', this.contractAddress)
        const apiResponse = await fetch('/api/atoms', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            type, 
            data: {
              ...data,
              contract: this.contractAddress,
            }
          }),
        })

        if (apiResponse.ok) {
          const atom = await apiResponse.json()
          if (atom && atom.id) {
            console.log('✅✅✅ SUCCESS: Atom created via API route:', atom.id)
            return atom
          }
        } else {
          const errorData = await apiResponse.json().catch(() => ({}))
          console.warn('⚠️ API route returned error:', apiResponse.status, errorData)
        }
      } catch (apiError: any) {
        console.warn('⚠️ API route failed:', apiError.message)
      }

      // Fallback to direct REST API endpoints (may be blocked by CORS)
      const endpoints = [
        `${this.graphUrl}/atoms`,
        `${this.apiUrl}/atoms`,
        `${this.graphUrl}/v1/atoms`,
        `${this.apiUrl}/v1/atoms`,
        `https://testnet.intuition.sh/atoms`,
        `https://testnet.intuition.sh/v1/atoms`,
      ]

      for (const endpoint of endpoints) {
        try {
          console.log(`🌐 Making POST request to: ${endpoint}`)
          console.log(`Request body:`, JSON.stringify({ type, data }, null, 2))
          
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ type, data }),
          })
          
          const responseText = await response.text()
          console.log(`📡 Response from ${endpoint}:`)
          console.log(`   Status: ${response.status} ${response.statusText}`)
          console.log(`   Body: ${responseText.substring(0, 500)}`)
          
          if (response.ok) {
            try {
              const atom = JSON.parse(responseText)
              if (atom && atom.id) {
                console.log('✅✅✅ SUCCESS: Atom created via REST API:', atom.id)
                console.log('Full atom response:', JSON.stringify(atom, null, 2))
                return atom
              } else {
                console.warn('⚠️ Response parsed but missing atom id:', atom)
              }
            } catch (parseError) {
              console.warn('⚠️ Failed to parse response as JSON:', parseError)
              console.warn('Raw response:', responseText.substring(0, 200))
            }
          } else {
            console.warn(`⚠️ Endpoint ${endpoint} returned ${response.status}: ${responseText.substring(0, 200)}`)
          }
        } catch (endpointError: any) {
          // Handle CORS and network errors
          const errorMsg = endpointError?.message || String(endpointError)
          if (errorMsg.includes('CORS') || errorMsg.includes('Failed to fetch') || endpointError?.name === 'TypeError') {
            console.warn(`⚠️ CORS blocked or network error for ${endpoint}`)
            console.warn(`   Error: ${errorMsg}`)
          } else {
            console.error(`❌ Endpoint ${endpoint} failed:`, errorMsg)
            console.error('Error details:', endpointError)
          }
          continue
        }
      }
      
      console.error('❌❌❌ All REST API endpoints failed - no network request succeeded')
      return null
    } catch (error) {
      console.error('❌ Error creating atom via REST:', error)
      throw error // Re-throw to propagate error
    }
  }

  /**
   * Get Triples for a subject (relationships)
   */
  async getTriples(subject: string, predicate?: string): Promise<Triple[]> {
    try {
      const url = predicate
        ? `${this.graphUrl}/triples?subject=${subject}&predicate=${predicate}`
        : `${this.graphUrl}/triples?subject=${subject}`
      
      const response = await fetch(url)
      if (!response.ok) return []
      return await response.json()
    } catch (error) {
      console.error('Error fetching triples:', error)
      return []
    }
  }

  /**
   * Create a Triple (relationship) in the Knowledge Graph
   */
  async createTriple(
    subject: string,
    predicate: string,
    object: string
  ): Promise<Triple | null> {
    try {
      const response = await fetch(`${this.graphUrl}/triples`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ subject, predicate, object }),
      })
      if (!response.ok) return null
      return await response.json()
    } catch (error) {
      console.error('Error creating triple:', error)
      return null
    }
  }

  /**
   * Get trust score for a creator/user atom
   */
  async getTrustScore(atomId: string): Promise<TrustScore | null> {
    try {
      const response = await fetch(`${this.apiUrl}/trust/${atomId}`)
      if (!response.ok) return null
      return await response.json()
    } catch (error) {
      console.error('Error fetching trust score:', error)
      return null
    }
  }

  /**
   * Get top creators ranked by trust score
   */
  async getTopCreators(limit: number = 10): Promise<TrustScore[]> {
    try {
      const response = await fetch(`${this.apiUrl}/trust/ranked?limit=${limit}`)
      if (!response.ok) return []
      return await response.json()
    } catch (error) {
      console.error('Error fetching top creators:', error)
      return []
    }
  }

  /**
   * Create an Artwork Atom linked to a creator
   */
  async createArtworkAtom(
    creatorAtomId: string,
    artworkData: {
      title: string
      description: string
      previewUrl: string
      highResUrl: string
      price: string // in TRUST tokens
    }
  ): Promise<Atom | null> {
    const artworkAtom = await this.createAtom('Artwork', artworkData)
    if (!artworkAtom) return null

    // Create relationship: creator created artwork
    await this.createTriple(creatorAtomId, 'created', artworkAtom.id)
    
    return artworkAtom
  }

  /**
   * Record a job completion in the graph
   */
  async recordJobCompletion(
    creatorAtomId: string,
    clientAtomId: string,
    jobAtomId: string,
    artworkAtomId: string
  ): Promise<boolean> {
    try {
      // Create relationships
      await this.createTriple(creatorAtomId, 'completed_job_for', clientAtomId)
      await this.createTriple(jobAtomId, 'completed_by', creatorAtomId)
      await this.createTriple(jobAtomId, 'resulted_in', artworkAtomId)
      
      return true
    } catch (error) {
      console.error('Error recording job completion:', error)
      return false
    }
  }

  /**
   * Get active jobs from the Knowledge Graph
   */
  async getActiveJobs(limit: number = 6): Promise<Atom[]> {
    try {
      // Query for Job type atoms that are not completed
      const response = await fetch(`${this.graphUrl}/atoms?type=Job&limit=${limit}`)
      if (!response.ok) return []
      const jobs = await response.json()
      
      // Filter out completed jobs by checking if they have a 'completed_by' triple
      const activeJobs = []
      for (const job of jobs) {
        const completedTriples = await this.getTriples(job.id, 'completed_by')
        if (completedTriples.length === 0) {
          activeJobs.push(job)
        }
      }
      
      return activeJobs.slice(0, limit)
    } catch (error) {
      console.error('Error fetching active jobs:', error)
      return []
    }
  }

  /**
   * Check contract for atoms created by address by looking at past transactions
   * This helps find atoms that exist on-chain but may not be indexed in GraphQL yet
   */
  async checkContractForAtoms(walletAddress: string, publicClient: any): Promise<string[]> {
    try {
      const addr = walletAddress.toLowerCase()
      console.log('🔍 Checking contract for atoms created by:', addr)

      if (!publicClient) {
        console.warn('⚠️ No public client available to check contract')
        return []
      }

      // Get past transactions from this address to the contract
      // Look for createAtoms calls
      try {
        const logs = await publicClient.getLogs({
          address: INTUITION_CONTRACT_ADDRESS,
          event: {
            type: 'event',
            name: 'AtomCreated', // Common event name for atom creation
            inputs: [
              { name: 'atomId', type: 'bytes32', indexed: true },
              { name: 'creator', type: 'address', indexed: true },
            ]
          },
          args: {
            creator: addr as `0x${string}`
          },
          fromBlock: 0n,
        })

        if (logs && logs.length > 0) {
          const atomIds = logs.map((log: any) => log.args.atomId)
          console.log('✓ Found atoms in contract events:', atomIds.length)
          return atomIds.map((id: any) => `0x${id.toString(16).padStart(64, '0')}`)
        }
      } catch (eventError: any) {
        // Event might not exist or have different signature
        console.log('⚠️ Could not query events:', eventError.message)
      }

      // Alternative: Check transaction history
      // Get recent transactions from the address
      try {
        const blockNumber = await publicClient.getBlockNumber()
        const fromBlock = blockNumber > 10000n ? blockNumber - 10000n : 0n
        
        // Note: This is a simplified approach - in production you'd want to use an indexer
        // For now, we'll rely on GraphQL which should have indexed the transactions
        console.log('ℹ️ Transaction history check would require an indexer')
      } catch (txError) {
        console.warn('Could not check transaction history:', txError)
      }

      return []
    } catch (error) {
      console.error('Error checking contract for atoms:', error)
      return []
    }
  }

  /**
   * Get user profile atom by wallet address using GraphQL
   * First checks contract, then queries GraphQL with multiple strategies
   */
  async getUserProfileByAddress(walletAddress: string, publicClient?: any): Promise<Atom | null> {
    try {
      const addr = walletAddress.toLowerCase()
      console.log('🔍 getUserProfileByAddress called for:', addr)
      console.log('📡 GraphQL URL:', this.graphqlUrl)

      // First, try to check contract for atom IDs if publicClient is available
      let contractAtomIds: string[] = []
      if (publicClient) {
        contractAtomIds = await this.checkContractForAtoms(addr, publicClient)
        if (contractAtomIds.length > 0) {
          console.log('✓ Found atom IDs from contract:', contractAtomIds)
          // Try to fetch these atoms by term_id
          for (const termId of contractAtomIds) {
            try {
      const query = `
                query GetAtomByTermId($termId: String!) {
                  atoms(where: { term_id: { _eq: $termId } }, limit: 1) {
                    term_id
            type
                    label
                    image
                    emoji
                    data
                    creator_id
                    created_at
                    vault_id
          }
        }
      `
              const data = await this.graphqlQuery(query, { termId })
              if (data?.atoms?.[0]) {
                console.log('✓ Found atom by term_id from contract:', data.atoms[0].id)
                return data.atoms[0] as Atom
              }
            } catch (termIdError) {
              console.warn('Could not fetch atom by term_id:', termId, termIdError)
            }
          }
        }
      }

      // Strategy 1: Query by creator_id (most reliable for on-chain created atoms)
      console.log('📡 Strategy 1: Querying by creator_id...')
      try {
        const query1 = `
          query GetUserProfileByCreator($address: String!) {
            atoms(
              where: { creator_id: { _eq: $address } }
              limit: 50
              order_by: { created_at: desc }
            ) {
              term_id
              type
              label
              image
              emoji
              data
              creator_id
              created_at
              block_number
            }
          }
        `
        const data1 = await this.graphqlQuery(query1, { address: addr })
        console.log('📊 Strategy 1 results:', data1?.atoms?.length || 0, 'atoms found')
        
        if (data1?.atoms?.length > 0) {
          console.log('📋 Sample atoms from Strategy 1:', data1.atoms.slice(0, 3).map((a: any) => {
            let parsedData = null
            try {
              parsedData = typeof a.data === 'string' ? JSON.parse(a.data) : (a.data || {})
            } catch {}
            return {
              term_id: a.term_id?.substring(0, 20),
              type: a.type || parsedData?.type || 'unknown',
              has_data: !!a.data,
              data_type: typeof a.data,
              creator_id: a.creator_id?.substring(0, 20),
              data_keys: parsedData ? Object.keys(parsedData).slice(0, 5) : []
            }
          }))
          
          // Process all atoms to normalize their structure
          const processedAtoms = data1.atoms.map((atom: any) => {
            // Parse data if it's a string
            let parsedData = atom.data
            if (typeof atom.data === 'string') {
              try {
                parsedData = JSON.parse(atom.data)
              } catch (e) {
                console.warn('Could not parse atom data as JSON:', e)
                parsedData = {}
              }
            }
            
            // Set type from data if not set at top level
            if (!atom.type && parsedData && typeof parsedData === 'object') {
              if (parsedData.type) {
                atom.type = parsedData.type
              } else if (parsedData.address || parsedData.wallet) {
                // If data has address/wallet, treat as User profile
                atom.type = 'User'
              }
            }
            
            // If still no type, default to 'User' for atoms created by this address
            if (!atom.type) {
              atom.type = 'User'
            }
            
            // Update atom.data with parsed data
            if (parsedData && typeof parsedData === 'object') {
              atom.data = parsedData
            }
            
            return atom
          })
          
          // Try to find User type atom first
          let userAtom = processedAtoms.find((atom: any) => {
            return atom.type === 'User'
          })
          
          // If no User type, try to find by address in data
          if (!userAtom) {
            userAtom = processedAtoms.find((atom: any) => {
          const atomData = atom.data || {}
              return (
                atomData.address?.toLowerCase() === addr ||
                atomData.wallet?.toLowerCase() === addr
              )
            })
          }
          
          // If still no match, use the most recent atom as the profile
          if (!userAtom && processedAtoms.length > 0) {
            console.log('⚠️ No User type atom found, using most recent atom as profile')
            userAtom = processedAtoms[0]
          }
          
          if (userAtom) {
            // Use term_id as the id field (since GraphQL doesn't have id)
            if (!userAtom.id && userAtom.term_id) {
              userAtom.id = userAtom.term_id
            }
            
            // Use term_id as the id field (since GraphQL doesn't have id)
            if (!userAtom.id && userAtom.term_id) {
              userAtom.id = userAtom.term_id
            }
            
            console.log('✅ Found user atom via creator_id:', userAtom.term_id?.substring(0, 30) || userAtom.id?.substring(0, 30))
            console.log('   Atom type:', userAtom.type)
            console.log('   Has data:', !!userAtom.data)
            console.log('   Creator ID:', userAtom.creator_id?.substring(0, 20))
            console.log('   Data keys:', userAtom.data ? Object.keys(userAtom.data).slice(0, 10) : [])
            
            // Ensure data is properly structured
            if (!userAtom.data || typeof userAtom.data !== 'object') {
              userAtom.data = {}
            }
            
            return userAtom as Atom
          }
        }
      } catch (err1) {
        console.warn('⚠️ Strategy 1 failed:', err1)
      }

      // Strategy 2: Query by type=User (simplified - data field filtering is complex in GraphQL)
      console.log('📡 Strategy 2: Querying by type=User...')
      try {
        const query2 = `
          query GetUserProfileByType($address: String!) {
            atoms(
              where: {
                _and: [
                  { type: { _eq: "User" } }
                  { creator_id: { _eq: $address } }
                ]
              }
              limit: 20
              order_by: { created_at: desc }
            ) {
              term_id
              type
              label
              image
              emoji
              data
              creator_id
              created_at
              block_number
            }
          }
        `
        const data2 = await this.graphqlQuery(query2, { address: addr })
        console.log('📊 Strategy 2 results:', data2?.atoms?.length || 0, 'atoms found')
        
        if (data2?.atoms?.length > 0) {
          // Find atom with matching address in data
          const matchingAtom = data2.atoms.find((atom: any) => {
            try {
              const atomData = typeof atom.data === 'string' ? JSON.parse(atom.data) : (atom.data || {})
          return (
            atomData.address?.toLowerCase() === addr ||
            atomData.wallet?.toLowerCase() === addr ||
                atom.creator_id?.toLowerCase() === addr
              )
            } catch {
              return atom.creator_id?.toLowerCase() === addr
            }
          }) || data2.atoms[0] // Fallback to first atom if no exact match
          
          if (matchingAtom) {
            // Use term_id as the id field
            if (!matchingAtom.id && matchingAtom.term_id) {
              matchingAtom.id = matchingAtom.term_id
            }
            console.log('✅ Found user atom via type=User:', matchingAtom.term_id || matchingAtom.id)
            return matchingAtom as Atom
          }
        }
      } catch (err2) {
        console.warn('⚠️ Strategy 2 failed:', err2)
      }

      // Strategy 3: Query ALL atoms by creator_id (no type filter) and filter client-side
      console.log('📡 Strategy 3: Querying ALL atoms by creator_id (no type filter)...')
      try {
        const query3 = `
          query GetAllAtomsByCreator($address: String!) {
            atoms(
              where: { creator_id: { _eq: $address } }
              limit: 100
              order_by: { created_at: desc }
            ) {
              term_id
              type
              label
              image
              emoji
              data
              creator_id
              created_at
              block_number
            }
          }
        `
        const data3 = await this.graphqlQuery(query3, { address: addr })
        console.log('📊 Strategy 3 results: Found', data3?.atoms?.length || 0, 'total atoms by creator')
        
        if (data3?.atoms?.length > 0) {
          console.log('📋 All atoms by creator:', data3.atoms.map((a: any) => ({
            id: a.id?.substring(0, 20),
            type: a.type,
            term_id: a.term_id?.substring(0, 20),
            has_data: !!a.data
          })))
          
          // Try to find User type atom
          let matchingAtom = data3.atoms.find((atom: any) => {
            return atom.type === 'User'
          })
          
          // If no User type, try parsing data to find address match
          if (!matchingAtom) {
            matchingAtom = data3.atoms.find((atom: any) => {
              try {
                const atomData = typeof atom.data === 'string' ? JSON.parse(atom.data) : (atom.data || {})
                return (
                  atomData.address?.toLowerCase() === addr ||
                  atomData.wallet?.toLowerCase() === addr ||
                  atomData.type === 'User'
                )
              } catch {
                return false
              }
            })
          }
          
          // If still no match, use the most recent atom
          if (!matchingAtom && data3.atoms.length > 0) {
            console.log('⚠️ No User type or address match found, using most recent atom')
            matchingAtom = data3.atoms[0]
          }

        if (matchingAtom) {
            // Use term_id as the id field
            if (!matchingAtom.id && matchingAtom.term_id) {
              matchingAtom.id = matchingAtom.term_id
            }
            console.log('✅ Found user atom via broad search:', matchingAtom.term_id || matchingAtom.id)
            console.log('   Creator ID:', matchingAtom.creator_id)
            console.log('   Atom type:', matchingAtom.type)
            return matchingAtom as Atom
          } else {
            console.log('⚠️ No matching atom found in', data3.atoms.length, 'atoms')
          }
        }
      } catch (err3) {
        console.warn('⚠️ Strategy 3 failed:', err3)
      }

      // Strategy 4: Try REST API to get all User atoms and filter
      console.log('📡 Strategy 4: Trying REST API fallback...')
      try {
        const response = await fetch(`${this.graphUrl}/atoms?type=User&limit=100`)
        if (response.ok) {
          const atoms = await response.json()
          console.log('📊 REST API returned:', Array.isArray(atoms) ? atoms.length : 0, 'atoms')
          if (Array.isArray(atoms)) {
            const matchingAtom = atoms.find((atom: Atom) => {
              const atomData = atom.data || {}
              return (
                atomData.address?.toLowerCase() === addr ||
                atomData.wallet?.toLowerCase() === addr ||
                atom.id.toLowerCase().includes(addr.slice(2))
              )
            })
            if (matchingAtom) {
              // Use term_id as the id field if needed
              if (!matchingAtom.id && matchingAtom.term_id) {
                matchingAtom.id = matchingAtom.term_id
              }
              console.log('✅ Found user atom via REST API:', matchingAtom.term_id || matchingAtom.id)
              return matchingAtom
            }
          }
        } else {
          console.warn('⚠️ REST API returned status:', response.status)
        }
      } catch (restError) {
        console.warn('⚠️ REST API fallback failed:', restError)
      }

      // Strategy 5: Diagnostic - Query recent atoms and filter by creator_id
      console.log('📡 Strategy 5: Running diagnostic query...')
      try {
        const diagnosticQuery = `
          query DiagnosticQuery {
            atoms(limit: 50, order_by: { created_at: desc }) {
              term_id
              type
              label
              image
              emoji
              creator_id
              data
              created_at
            }
          }
        `
        const diagnosticData = await this.graphqlQuery(diagnosticQuery)
        console.log('📊 Diagnostic: Found', diagnosticData?.atoms?.length || 0, 'recent atoms')
        
        if (diagnosticData?.atoms?.length > 0) {
          // Filter by creator_id
          const myAtoms = diagnosticData.atoms.filter((atom: any) => {
            return atom.creator_id?.toLowerCase() === addr
          })
          
          console.log('📊 Diagnostic: Found', myAtoms.length, 'atoms created by', addr.substring(0, 10) + '...')
          
          if (myAtoms.length > 0) {
            // Process atoms to find the best match
            const processedAtoms = myAtoms.map((atom: any) => {
              let parsedData: any = {}
              try {
                if (typeof atom.data === 'string') {
                  parsedData = JSON.parse(atom.data)
                } else if (atom.data && typeof atom.data === 'object') {
                  parsedData = atom.data
                }
              } catch {}
              
              // Set type from data if not set
              if (!atom.type && parsedData.type) {
                atom.type = parsedData.type
              } else if (!atom.type && (parsedData.address || parsedData.wallet)) {
                atom.type = 'User'
              }
              
              atom.data = parsedData
              return atom
            })
            
            // Find User type atom or atom with address match
            let matchingAtom = processedAtoms.find((atom: any) => {
              return atom.type === 'User' || atom.data?.type === 'User'
            })
            
            if (!matchingAtom) {
              matchingAtom = processedAtoms.find((atom: any) => {
                return atom.data?.address?.toLowerCase() === addr || atom.data?.wallet?.toLowerCase() === addr
              })
            }
            
            if (!matchingAtom && processedAtoms.length > 0) {
              matchingAtom = processedAtoms[0]
            }
            
            if (matchingAtom) {
              if (!matchingAtom.id && matchingAtom.term_id) {
                matchingAtom.id = matchingAtom.term_id
              }
              console.log('✅✅✅ Found user atom via diagnostic query!', matchingAtom.term_id?.substring(0, 30))
              return matchingAtom as Atom
            }
          }
        }
      } catch (diagError) {
        console.warn('⚠️ Diagnostic query failed:', diagError)
      }

      console.log('❌ No user atom found after trying all strategies')
      console.log('💡 Possible reasons:')
      console.log('   1. Atom was just created and GraphQL hasn\'t indexed it yet')
      console.log('   2. Atom was created with different data structure')
      console.log('   3. Address mismatch in atom data')
      console.log('   4. GraphQL endpoint issue')

      return null
    } catch (error) {
      console.error('Error fetching user profile by address:', error)
      return null
    }
  }

  /**
   * Create a user atom with custom data
   */
  async createUserAtomWithData(walletAddress: string, data: Record<string, any>): Promise<Atom | null> {
    try {
      const addr = walletAddress.toLowerCase()
      
      console.log('Creating user atom with data:', { address: addr, dataKeys: Object.keys(data) })

      // GraphQL API only has pinOrganization, pinPerson, pinThing mutations
      // No direct atom creation mutations - must use REST API
      console.log('ℹ️ GraphQL API is read-only for atom creation')
      console.log('→ Using REST API via Next.js proxy route to create atom...')
      
      const atom = await this.createAtom('User', data)
      
      if (atom && atom.id) {
        console.log('✓✓✓ Atom created via REST API:', atom.id)
        // Create a triple linking the address to the atom (if supported)
        try {
          await this.createTriple(atom.id, 'has_wallet', addr)
          console.log('Wallet triple created')
        } catch (tripleError) {
          console.warn('Could not create wallet triple:', tripleError)
        }
        return atom
      }

      console.error('❌ All atom creation methods failed - GraphQL and REST both returned null')
      console.error('No network request succeeded. Check API endpoints and network connection.')
      return null
    } catch (error) {
      console.error('Error creating user atom with data:', error)
      return null
    }
  }

  /**
   * Create a user atom for a wallet address
   */
  async createUserAtom(walletAddress: string): Promise<Atom | null> {
    try {
      const addr = walletAddress.toLowerCase()
      
      // Check if atom already exists
      const existingAtom = await this.getUserProfileByAddress(addr)
      if (existingAtom) {
        return existingAtom
      }

      // Create user atom data
      const userData = {
        address: addr,
        wallet: addr,
        type: 'User',
        createdAt: new Date().toISOString(),
        contract: this.contractAddress,
      }

      // Try to create via GraphQL mutation first
      const mutation = `
        mutation CreateUserAtom($type: String!, $data: jsonb!) {
          insert_atoms_one(object: { type: $type, data: $data }) {
            id
            type
            data
          }
        }
      `

      const variables = {
        type: 'User',
        data: userData,
      }

      const mutationData = await this.graphqlQuery(mutation, variables)
      
      if (mutationData && mutationData.insert_atoms_one) {
        return mutationData.insert_atoms_one
      }

      // Fallback to REST API
      const atom = await this.createAtom('User', userData)
      
      if (atom) {
        // Create a triple linking the address to the atom (if supported)
        try {
          await this.createTriple(atom.id, 'has_wallet', addr)
        } catch (tripleError) {
          console.warn('Could not create wallet triple:', tripleError)
        }
      }

      return atom
    } catch (error) {
      console.error('Error creating user atom:', error)
      return null
    }
  }

  /**
   * Get user profile with all related data (trust score, jobs, artworks, etc.)
   */
  async getUserProfileData(walletAddress: string, publicClient?: any): Promise<{
    atom: Atom | null
    trustScore: TrustScore | null
    completedJobs: number
    createdArtworks: number
    profileData: Record<string, any>
  }> {
    try {
      console.log('🔍 getUserProfileData called for:', walletAddress)
      const userAtom = await this.getUserProfileByAddress(walletAddress, publicClient)
      
      if (!userAtom) {
        console.log('❌ No atom found in getUserProfileData')
        return {
          atom: null,
          trustScore: null,
          completedJobs: 0,
          createdArtworks: 0,
          profileData: {},
        }
      }

      console.log('✅ Atom found in getUserProfileData:', {
        id: userAtom.id?.substring(0, 30),
        type: userAtom.type,
        has_data: !!userAtom.data,
        data_type: typeof userAtom.data
      })

      // Ensure data is properly parsed
      let profileData: Record<string, any> = {}
      if (userAtom.data) {
        if (typeof userAtom.data === 'string') {
          try {
            profileData = JSON.parse(userAtom.data)
            console.log('✓ Parsed atom data from string')
          } catch (e) {
            console.warn('Could not parse atom data as JSON:', e)
            profileData = {}
          }
        } else if (typeof userAtom.data === 'object') {
          profileData = userAtom.data
          console.log('✓ Using atom data as object')
        }
      }
      
      console.log('📊 Profile data extracted:', {
        keys: Object.keys(profileData),
        has_name: !!profileData.name,
        has_bio: !!profileData.bio,
        has_address: !!profileData.address
      })

      // Update atom.data with parsed data for consistency
      userAtom.data = profileData

      // Fetch trust score (non-blocking)
      let trustScore: TrustScore | null = null
      try {
        trustScore = await this.getTrustScore(userAtom.id)
      } catch (e) {
        console.warn('Could not fetch trust score:', e)
      }

      // Fetch completed jobs count (non-blocking)
      let completedJobs = 0
      try {
      const completedJobsTriples = await this.getTriples(userAtom.id, 'completed_job_for')
        completedJobs = completedJobsTriples.length
      } catch (e) {
        console.warn('Could not fetch completed jobs:', e)
      }

      // Fetch created artworks count (non-blocking)
      let createdArtworks = 0
      try {
      const createdArtworksTriples = await this.getTriples(userAtom.id, 'created')
        createdArtworks = createdArtworksTriples.length
      } catch (e) {
        console.warn('Could not fetch created artworks:', e)
      }

      console.log('✅ Returning profile data:', {
        hasAtom: true,
        hasTrustScore: !!trustScore,
        completedJobs,
        createdArtworks,
        profileDataKeys: Object.keys(profileData)
      })

      return {
        atom: userAtom,
        trustScore,
        completedJobs,
        createdArtworks,
        profileData,
      }
    } catch (error) {
      console.error('❌ Error fetching user profile data:', error)
      return {
        atom: null,
        trustScore: null,
        completedJobs: 0,
        createdArtworks: 0,
        profileData: {},
      }
    }
  }
}

// Singleton instance
export const intuitionClient = new IntuitionClient()

/**
 * Create a profile atom on-chain using depositAtom
 * This function handles the on-chain transaction to create an atom with a deposit
 * 
 * @param signer - Wallet client from wagmi (useWalletClient)
 * @param profileData - User profile data to store in the atom
 * @param depositAmount - Amount of ETH/tTRUST to deposit (default: 0.001)
 * @returns Transaction hash and success status
 */
export async function createProfileAtom({
  signer,
  profileData,
  depositAmount = '0.001'
}: {
  signer: any      // Wallet client or injected signer
  profileData: any  // User profile data JSON
  depositAmount?: string // Deposit amount in ETH/tTRUST (default: 0.001)
}) {
  try {
    if (!signer) {
      throw new Error('Wallet client (signer) is required')
    }

    const walletClient = signer
    const account = walletClient.account

    if (!account) {
      throw new Error('No account found in wallet client')
    }

    // 1. Convert JSON to bytes for createAtoms function
    const { atomDataToBytes } = await import('./intuitionContract')
    const atomDataBytes = atomDataToBytes(profileData)
    const depositAmountWei = parseEther(depositAmount)

    console.log('=== Creating profile atom on-chain ===')
    console.log('Contract:', INTUITION_CONTRACT_ADDRESS)
    console.log('Function: createAtoms(bytes[] data, uint256[] assets) payable')
    console.log('Atom data (bytes):', atomDataBytes.substring(0, 100) + '...')
    console.log('Deposit amount:', depositAmount, 'tTRUST')
    console.log('Deposit amount (wei):', depositAmountWei.toString())

    // 2. Call createAtoms with bytes array and assets array
    // msg.value must equal sum(assets[])
    const txHash = await walletClient.writeContract({
      address: INTUITION_CONTRACT_ADDRESS,
      abi: INTUITION_CONTRACT_ABI,
      functionName: 'createAtoms',
      args: [
        [atomDataBytes], // bytes[] - array with one atom data
        [depositAmountWei] // uint256[] - array with one deposit amount
      ],
      value: depositAmountWei, // msg.value must equal sum(assets[])
      account: account
    })

    console.log('✅ Transaction sent:', txHash)

    return { success: true, txHash }
  } catch (error: any) {
    console.error('❌ Error creating profile atom:', error)
    return { 
      success: false, 
      error: error.message || 'Unknown error',
      details: error
    }
  }
}

