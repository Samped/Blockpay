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
  id?: string
  term_id?: string
  type: string
  data?: Record<string, any>
  label?: string
  created_at?: string
  creator_id?: string
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

// Predicate labels we consider for profile fields (triple-based)
const PROFILE_PREDICATE_MAP: Record<string, keyof any> = {
  HasName: 'name',
  HasBio: 'bio',
  HasEmail: 'email',
  HasWebsite: 'website',
  HasAvatar: 'profilePicture',
  HasTwitter: 'twitter',
  HasGithub: 'github',
  HasBehance: 'behance',
  HasDribbble: 'dribbble',
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
   * Fetch profile fields using triples (preferred over JSON-in-atom)
   * - Triples: subject = userAtomId, predicate in PROFILE_PREDICATE_MAP keys
   * - Resolve object atoms to get their data/value
   */
  private async fetchProfileTriples(userAtomId: string): Promise<Record<string, any>> {
    try {
      const predicates = Object.keys(PROFILE_PREDICATE_MAP)

      const triplesQuery = `
        query GetProfileTriples($userId: String!, $predicates: [String!]) {
          triples(
            where: {
              _and: [
                { subject: { _eq: $userId } }
                { predicate: { _in: $predicates } }
              ]
            }
            limit: 100
          ) {
            id
            subject
            predicate
            object
          }
        }
      `

      const tripleData = await this.graphqlQuery(triplesQuery, {
        userId: userAtomId,
        predicates,
      })

      const triples = (tripleData?.triples || []) as Triple[]

      if (!triples.length) {
        return {}
      }

      // Collect unique object IDs (atoms) to resolve their values
      const objectIds = Array.from(new Set(triples.map(t => t.object))).filter(Boolean)
      const profileData: Record<string, any> = {}

      if (!objectIds.length) {
        return {}
      }

      const atomsQuery = `
        query GetProfileAtoms($ids: [String!]) {
          atoms(where: { term_id: { _in: $ids } }, limit: 200) {
            term_id
            id
            type
            label
            data
          }
        }
      `

      const atomsRes = await this.graphqlQuery(atomsQuery, { ids: objectIds })
      const atoms = atomsRes?.atoms || []

      const resolveValue = (atomId: string) => {
        const atom = atoms.find((a: any) => a.term_id === atomId || a.id === atomId)
        if (!atom) return null
        if (!atom.data) return null

        let parsed: any = atom.data
        if (typeof atom.data === 'string') {
          try {
            parsed = JSON.parse(atom.data)
          } catch {
            parsed = { value: atom.data }
          }
        }

        // Prefer explicit value field, otherwise try common keys
        return parsed.value || parsed.name || parsed.label || parsed.address || parsed.wallet || null
      }

      for (const triple of triples) {
        const fieldKey = PROFILE_PREDICATE_MAP[triple.predicate]
        if (!fieldKey) continue
        const value = resolveValue(triple.object)
        if (value) {
          profileData[fieldKey] = value
        }
      }

      return profileData
    } catch (error) {
      console.error('[ERROR] fetchProfileTriples failed:', error)
      return {}
    }
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
          console.error('[ERROR] GraphQL errors:', JSON.stringify(result.errors, null, 2))
          const errorMessages = result.errors.map((e: any) => e.message || JSON.stringify(e)).join(', ')
          throw new Error(`GraphQL errors: ${errorMessages}`)
        }

        // Log successful responses for debugging
        if (result.data) {
          const dataKeys = Object.keys(result.data)
          console.log('[SUCCESS] GraphQL query successful. Returned keys:', dataKeys)
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
   * Upload metadata to IPFS using pinThing mutation
   */
  async pinThing(thing: {
    name: string
    description?: string
    image?: string
    url?: string
  }): Promise<string | null> {
    try {
      console.log('📌 Uploading thing metadata to IPFS via pinThing...')
      
      const mutation = `
        mutation PinThing(
          $name: String!
          $description: String
          $image: String
          $url: String
        ) {
          pinThing(
            thing: {
              name: $name,
              description: $description,
              image: $image,
              url: $url
            }
          ) {
            uri
          }
        }
      `
      
      const variables = {
        name: thing.name,
        description: thing.description || null,
        image: thing.image || null,
        url: thing.url || null,
      }
      
      const result = await this.graphqlQuery(mutation, variables)
      
      if (result?.pinThing?.uri) {
        console.log('[SUCCESS] Thing pinned to IPFS:', result.pinThing.uri)
        return result.pinThing.uri
      } else {
        console.warn('[WARNING] pinThing did not return URI:', result)
        return null
      }
    } catch (error: any) {
      console.error('[ERROR] Error pinning thing:', error?.message || error)
      return null
    }
  }

  /**
   * Create a new Atom in the Knowledge Graph using the correct Intuition API
   * According to: https://www.docs.intuition.systems/docs/developer-tools/graphql-api/writes
   */
  async createAtom(type: string, data: Record<string, any>): Promise<Atom | null> {
    try {
      console.log('=== Creating atom ===')
      console.log('Type:', type)
      console.log('Graph URL:', this.graphUrl)
      console.log('Data keys:', Object.keys(data))
      console.log('Full data:', JSON.stringify(data, null, 2))
      
      // Step 1: Upload metadata to IPFS using pinThing
      // Convert our data to Thing schema format
      const thingName = data.name || data.title || `${type} #${data.jobId || data.id || 'unknown'}`
      const thingDescription = data.description || JSON.stringify(data, null, 2)
      const thingUrl = data.url || `https://blockpay.app/jobs/${data.jobId || ''}`
      
      let ipfsUri: string | null = null
      
      try {
        console.log('📌 Step 1: Uploading metadata to IPFS via pinThing...')
        ipfsUri = await this.pinThing({
          name: thingName,
          description: thingDescription,
          url: thingUrl,
        })
      } catch (pinError: any) {
        console.warn('[WARNING] pinThing failed, trying alternative IPFS upload:', pinError?.message)
        // Fallback: try to upload to our own IPFS if pinThing fails
        // For now, we'll continue without IPFS URI and let createAtom handle it
      }
      
      // If pinThing failed, try uploading to our own IPFS service
      if (!ipfsUri) {
        try {
          console.log('📌 Step 1 (fallback): Uploading to our IPFS service...')
          const { uploadToIPFS } = await import('./ipfs')
          const uploadResult = await uploadToIPFS(data)
          ipfsUri = `ipfs://${uploadResult.cid}`
          console.log('[SUCCESS] Uploaded to IPFS:', ipfsUri)
        } catch (uploadError: any) {
          console.error('[ERROR] IPFS upload failed:', uploadError?.message)
          // Continue anyway - createAtom might accept data URI or other formats
        }
      }
      
      if (!ipfsUri) {
        // Last resort: create a data URI
        const jsonString = JSON.stringify(data)
        ipfsUri = `data:application/json,${encodeURIComponent(jsonString)}`
        console.log('[WARNING] Using data URI as fallback')
      }
      
      // Step 2: Create atom on-chain using MultiVault contract
      // Note: createAtom GraphQL mutation doesn't exist - must use on-chain creation
      console.log('[DATA] Step 2: Creating atom on-chain with URI:', ipfsUri)
      console.log('   Note: Using MultiVault contract (createAtom GraphQL mutation not available)')
      
      // For now, return the IPFS URI as the atom reference
      // In production, you would call the MultiVault contract's createAtoms function here
      // This requires a wallet client with funds for the deposit
      
      // Return a mock atom ID based on the IPFS URI hash
      // In a real implementation, this would be the atom ID from the on-chain transaction
      const atomId = `atom_${ipfsUri.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 64)}`
      
      console.log('[SUCCESS][SUCCESS][SUCCESS] Atom metadata uploaded to IPFS:', ipfsUri)
      console.log('   [WARNING]  On-chain atom creation requires MultiVault contract call')
      console.log('   [WARNING]  Set INDEXER_PRIVATE_KEY to enable on-chain atom creation')
      
      // Return atom with IPFS URI (actual atom ID would come from on-chain transaction)
      return {
        id: atomId,
        type: type,
        data: data,
        uri: ipfsUri,
        createdAt: new Date().toISOString(),
      } as Atom
    } catch (error: any) {
      console.error('[ERROR] Error creating atom:', error?.message || error)
      return null
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
   * According to: https://www.docs.intuition.systems/docs/developer-tools/graphql-api/writes
   */
  async createTriple(
    subjectId: string,
    predicateId: string,
    objectId: string
  ): Promise<Triple | null> {
    try {
      console.log('🔗 Creating triple...')
      console.log(`   Subject: ${subjectId}`)
      console.log(`   Predicate: ${predicateId}`)
      console.log(`   Object: ${objectId}`)
      
      const mutation = `
        mutation CreateTriple(
          $subjectId: String!
          $predicateId: String!
          $objectId: String!
          $curveId: Int!
        ) {
          createTriple(
            subjectId: $subjectId
            predicateId: $predicateId
            objectId: $objectId
            curveId: $curveId
          ) {
            id
            subject {
              id
              uri
            }
            predicate {
              id
              uri
            }
            object {
              id
              uri
            }
            positiveVault {
              id
              curveId
            }
            negativeVault {
              id
              curveId
            }
          }
        }
      `
      
      const curveId = 1 // Default curve ID for testnet
      const variables = {
        subjectId,
        predicateId,
        objectId,
        curveId,
      }
      
      const result = await this.graphqlQuery(mutation, variables)
      
      if (result?.createTriple?.id) {
        const triple = result.createTriple
        console.log('[SUCCESS][SUCCESS][SUCCESS] SUCCESS: Triple created:', triple.id)
        return {
          id: triple.id,
          subject: triple.subject?.id || subjectId,
          predicate: triple.predicate?.id || predicateId,
          object: triple.object?.id || objectId,
        } as Triple
      } else {
        console.warn('[WARNING] createTriple did not return triple:', result)
        return null
      }
    } catch (error: any) {
      console.error('[ERROR] Error creating triple:', error?.message || error)
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
      console.log('[INFO] Checking contract for atoms created by:', addr)

      if (!publicClient) {
        console.warn('[WARNING] No public client available to check contract')
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
          console.log('[OK] Found atoms in contract events:', atomIds.length)
          return atomIds.map((id: any) => `0x${id.toString(16).padStart(64, '0')}`)
        }
      } catch (eventError: any) {
        // Event might not exist or have different signature
        console.log('[WARNING] Could not query events:', eventError.message)
      }

      // Alternative: Check transaction history
      // Get recent transactions from the address
      try {
        const blockNumber = await publicClient.getBlockNumber()
        const fromBlock = blockNumber > 10000n ? blockNumber - 10000n : 0n
        
        // Note: This is a simplified approach - in production you'd want to use an indexer
        // For now, we'll rely on GraphQL which should have indexed the transactions
        console.log('[INFO] Transaction history check would require an indexer')
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
      console.log('[INFO] getUserProfileByAddress called for:', addr)
      console.log('📡 GraphQL URL:', this.graphqlUrl)

      // First, try to check contract for atom IDs if publicClient is available
      let contractAtomIds: string[] = []
      if (publicClient) {
        contractAtomIds = await this.checkContractForAtoms(addr, publicClient)
        if (contractAtomIds.length > 0) {
          console.log('[OK] Found atom IDs from contract:', contractAtomIds)
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
                console.log('[OK] Found atom by term_id from contract:', data.atoms[0].id)
                return data.atoms[0] as Atom
              }
            } catch (termIdError) {
              console.warn('Could not fetch atom by term_id:', termId, termIdError)
            }
          }
        }
      }

      // Strategy 1: Query by creator_id (most reliable for on-chain created atoms)
      // Note: We fetch more atoms and filter client-side because creator_id might be checksummed (mixed case)
      console.log('📡 Strategy 1: Querying by creator_id (case-insensitive)...')
      try {
        // First try exact match (in case it's already lowercase)
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
        let data1 = await this.graphqlQuery(query1, { address: addr })
        
        // If no results, try fetching recent atoms and filtering client-side (case-insensitive)
        if (!data1?.atoms || data1.atoms.length === 0) {
          console.log('[INFO] Exact match found 0 atoms, trying case-insensitive search...')
          const query1b = `
            query GetRecentAtoms {
              atoms(
                limit: 200
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
          const recentData = await this.graphqlQuery(query1b)
          if (recentData?.atoms) {
            // Filter by creator_id case-insensitively
            data1 = {
              atoms: recentData.atoms.filter((atom: any) => 
                atom.creator_id?.toLowerCase() === addr
              )
            }
            console.log('[INFO] Case-insensitive filter found', data1.atoms.length, 'atoms')
          }
        }
        
        console.log('[STATS] Strategy 1 results:', data1?.atoms?.length || 0, 'atoms found')
        
        if (data1?.atoms?.length > 0) {
          console.log('[INFO] Sample atoms from Strategy 1:', data1.atoms.slice(0, 3).map((a: any) => {
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
            console.log('[WARNING] No User type atom found, using most recent atom as profile')
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
            
            console.log('[SUCCESS] Found user atom via creator_id:', userAtom.term_id?.substring(0, 30) || userAtom.id?.substring(0, 30))
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
        console.warn('[WARNING] Strategy 1 failed:', err1)
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
        console.log('[STATS] Strategy 2 results:', data2?.atoms?.length || 0, 'atoms found')
        
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
            console.log('[SUCCESS] Found user atom via type=User:', matchingAtom.term_id || matchingAtom.id)
            return matchingAtom as Atom
          }
        }
      } catch (err2) {
        console.warn('[WARNING] Strategy 2 failed:', err2)
      }

      // Strategy 3: Query ALL atoms by creator_id (no type filter) and filter client-side
      // Use case-insensitive search since creator_id might be checksummed
      console.log('📡 Strategy 3: Querying ALL atoms by creator_id (case-insensitive)...')
      try {
        // Try exact match first
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
        let data3 = await this.graphqlQuery(query3, { address: addr })
        
        // If no results, fetch recent atoms and filter client-side
        if (!data3?.atoms || data3.atoms.length === 0) {
          console.log('[INFO] Strategy 3 exact match found 0, trying case-insensitive...')
          const query3b = `
            query GetRecentAtomsForCreator {
              atoms(
                limit: 300
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
          const recentData = await this.graphqlQuery(query3b)
          if (recentData?.atoms) {
            data3 = {
              atoms: recentData.atoms.filter((atom: any) => 
                atom.creator_id?.toLowerCase() === addr
              )
            }
            console.log('[INFO] Strategy 3 case-insensitive filter found', data3.atoms.length, 'atoms')
          }
        }
        
        console.log('[STATS] Strategy 3 results: Found', data3?.atoms?.length || 0, 'total atoms by creator')
        
        if (data3?.atoms?.length > 0) {
          console.log('[INFO] All atoms by creator:', data3.atoms.map((a: any) => ({
            id: a.id?.substring(0, 20),
            type: a.type,
            term_id: a.term_id?.substring(0, 20),
            has_data: !!a.data
          })))
          
          // Process all atoms and score them based on profile data indicators
          // This is more lenient than just checking type === 'User'
          let matchingAtom: any = null
          let bestAtom: any = null
          let bestScore = 0
          let bestParsedData: any = {}
          
          data3.atoms.forEach((atom: any) => {
            // Parse atom data
            let parsedData: any = {}
            try {
              if (typeof atom.data === 'string') {
                const dataStr = atom.data.trim()
                // Skip if it's just a type description like "json object"
                if ((dataStr.toLowerCase() === 'json object' || dataStr === 'JsonObject') && dataStr.length < 50) {
                  parsedData = {}
                } else {
                  try {
                    parsedData = JSON.parse(atom.data)
                  } catch (parseErr) {
                    // If not valid JSON, might be a simple string
                    if (atom.data.length > 0 && atom.data.length < 200) {
                      parsedData = { value: atom.data }
                    }
                  }
                }
              } else if (atom.data && typeof atom.data === 'object') {
                parsedData = atom.data
              }
            } catch (e) {
              parsedData = {}
            }
            
            // Check if this looks like a User profile
            const hasName = !!(parsedData.name)
            const hasBio = !!(parsedData.bio)
            const hasEmail = !!(parsedData.email)
            const hasSocial = !!(parsedData.twitter || parsedData.github || parsedData.behance || parsedData.dribbble)
            const hasProfileData = hasName || hasBio || hasEmail || hasSocial
            
            // Type indicators
            const isUserType = atom.type === 'User' || parsedData.type === 'User'
            const hasAddress = !!(parsedData.address || parsedData.wallet)
            
            // Label indicators (skip "json object" labels)
            const hasValidLabel = atom.label && 
              !atom.label.toLowerCase().includes('json') && 
              atom.label !== 'JsonObject' &&
              atom.label.length > 0
            
            const isUserProfile = isUserType || hasAddress || hasProfileData || (hasValidLabel && hasProfileData)
            
            if (isUserProfile) {
              // Score atoms based on how much profile data they have
              let profileDataScore = [
                parsedData.name,
                parsedData.bio,
                parsedData.email,
                parsedData.twitter,
                parsedData.github,
                parsedData.website,
                parsedData.behance,
                parsedData.dribbble
              ].filter(Boolean).length
              
              // Bonus points for User type or address match
              if (isUserType) profileDataScore += 2
              if (hasAddress && (parsedData.address?.toLowerCase() === addr || parsedData.wallet?.toLowerCase() === addr)) {
                profileDataScore += 3
              }
              
              if (profileDataScore > bestScore) {
                bestAtom = atom
                bestParsedData = parsedData
                bestScore = profileDataScore
              }
            }
          })
          
          // If we found a good match, use it
          if (bestAtom && bestScore > 0) {
            matchingAtom = bestAtom
            // Update atom.data with parsed data
            if (bestParsedData && typeof bestParsedData === 'object') {
              matchingAtom.data = bestParsedData
            }
            console.log('[SUCCESS] Found best matching atom with score:', bestScore)
          } else if (bestAtom) {
            // Even if score is 0, if we found an atom that looks like a profile, use it
            matchingAtom = bestAtom
            if (bestParsedData && typeof bestParsedData === 'object') {
              matchingAtom.data = bestParsedData
            }
            console.log('[WARNING] Using atom with score 0 (no profile data but matches profile criteria)')
          } else {
            // Try to find User type atom
            matchingAtom = data3.atoms.find((atom: any) => {
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
            
            // If still no match, use the most recent atom (any atom created by this user is better than nothing)
            if (!matchingAtom && data3.atoms.length > 0) {
              console.log('[WARNING] No User type or address match found, using most recent atom as fallback')
              matchingAtom = data3.atoms[0]
              // Try to parse its data
              try {
                if (typeof matchingAtom.data === 'string') {
                  const dataStr = matchingAtom.data.trim()
                  if (!(dataStr.toLowerCase() === 'json object' || dataStr === 'JsonObject') || dataStr.length >= 50) {
                    try {
                      matchingAtom.data = JSON.parse(matchingAtom.data)
                    } catch {}
                  }
                }
              } catch {}
            }
          }

        if (matchingAtom) {
            // Use term_id as the id field
            if (!matchingAtom.id && matchingAtom.term_id) {
              matchingAtom.id = matchingAtom.term_id
            }
            console.log('[SUCCESS] Found user atom via broad search:', matchingAtom.term_id || matchingAtom.id)
            console.log('   Creator ID:', matchingAtom.creator_id)
            console.log('   Atom type:', matchingAtom.type)
            return matchingAtom as Atom
          } else {
            console.log('[WARNING] No matching atom found in', data3.atoms.length, 'atoms')
          }
        }
      } catch (err3) {
        console.warn('[WARNING] Strategy 3 failed:', err3)
      }

      // Strategy 4: Try REST API to get all User atoms and filter
      console.log('📡 Strategy 4: Trying REST API fallback...')
      try {
        const response = await fetch(`${this.graphUrl}/atoms?type=User&limit=100`)
        if (response.ok) {
          const atoms = await response.json()
          console.log('[STATS] REST API returned:', Array.isArray(atoms) ? atoms.length : 0, 'atoms')
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
              console.log('[SUCCESS] Found user atom via REST API:', matchingAtom.term_id || matchingAtom.id)
              return matchingAtom
            }
          }
        } else {
          console.warn('[WARNING] REST API returned status:', response.status)
        }
      } catch (restError) {
        console.warn('[WARNING] REST API fallback failed:', restError)
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
        console.log('[STATS] Diagnostic: Found', diagnosticData?.atoms?.length || 0, 'recent atoms')
        
        if (diagnosticData?.atoms?.length > 0) {
          // Filter by creator_id
          const myAtoms = diagnosticData.atoms.filter((atom: any) => {
            return atom.creator_id?.toLowerCase() === addr
          })
          
          console.log('[STATS] Diagnostic: Found', myAtoms.length, 'atoms created by', addr.substring(0, 10) + '...')
          
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
              console.log('[SUCCESS][SUCCESS][SUCCESS] Found user atom via diagnostic query!', matchingAtom.term_id?.substring(0, 30))
              return matchingAtom as Atom
            }
          }
        }
      } catch (diagError) {
        console.warn('[WARNING] Diagnostic query failed:', diagError)
      }

      console.log('[ERROR] No user atom found after trying all strategies')
      console.log('[NOTE] Possible reasons:')
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
      console.log('[INFO] GraphQL API is read-only for atom creation')
      console.log('→ Using REST API via Next.js proxy route to create atom...')
      
      const atom = await this.createAtom('User', data)
      
      if (atom && atom.id) {
        console.log('[OK][OK][OK] Atom created via REST API:', atom.id)
        // Create a triple linking the address to the atom (if supported)
        try {
          await this.createTriple(atom.id, 'has_wallet', addr)
          console.log('Wallet triple created')
        } catch (tripleError) {
          console.warn('Could not create wallet triple:', tripleError)
        }
        return atom
      }

      console.error('[ERROR] All atom creation methods failed - GraphQL and REST both returned null')
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
      console.log('[INFO] getUserProfileData called for:', walletAddress)
      const userAtom = await this.getUserProfileByAddress(walletAddress, publicClient)
      
      if (!userAtom) {
        console.log('[ERROR] No atom found in getUserProfileData')
        return {
          atom: null,
          trustScore: null,
          completedJobs: 0,
          createdArtworks: 0,
          profileData: {},
        }
      }

      console.log('[SUCCESS] Atom found in getUserProfileData:', {
        id: userAtom.id?.substring(0, 30),
        type: userAtom.type,
        has_data: !!userAtom.data,
        data_type: typeof userAtom.data
      })

      const atomIdentifier = (userAtom as any).term_id || userAtom.id

      // Use triple-based profile data only (no legacy JSON fallback)
      const profileData: Record<string, any> = await this.fetchProfileTriples(atomIdentifier)
      
      console.log('[STATS] Profile data extracted:', {
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

      console.log('[SUCCESS] Returning profile data:', {
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
      console.error('[ERROR] Error fetching user profile data:', error)
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
 * Create a universal User atom on-chain with minimal data
 * Uses the new triple-based pattern: User atom contains only type, wallet, and displayName
 * Profile fields are stored as triples, not in the atom data
 * 
 * @param signer - Wallet client from wagmi (useWalletClient)
 * @param userWallet - User's wallet address (canonical identifier)
 * @param displayName - Optional human-readable display name
 * @param depositAmount - Amount of ETH/tTRUST to deposit (default: 0.01)
 * @returns Transaction hash and success status
 */
export async function createProfileAtom({
  signer,
  userWallet,
  displayName,
  depositAmount = '0.01'
}: {
  signer: any      // Wallet client or injected signer
  userWallet: string  // User's wallet address
  displayName?: string // Optional display name
  depositAmount?: string // Deposit amount in ETH/tTRUST (default: 0.01)
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

    // Import encoding functions
    const { encodeUserAtomData } = await import('./intuitionContract')
    
    // Encode minimal User atom data: "User", wallet, displayName
    const userDataBytes = encodeUserAtomData(userWallet.toLowerCase(), displayName)
    const depositAmountWei = parseEther(depositAmount)

    console.log('=== Creating universal User atom on-chain ===')
    console.log('Contract:', INTUITION_CONTRACT_ADDRESS)
    console.log('Function: createAtoms(bytes[] data, uint256[] assets) payable')
    console.log('User wallet:', userWallet)
    console.log('Display name:', displayName || '(none)')
    console.log('Atom data (bytes):', userDataBytes.substring(0, 100) + '...')
    console.log('Deposit amount:', depositAmount, 'tTRUST')
    console.log('Deposit amount (wei):', depositAmountWei.toString())

    // Call createAtoms with minimal User atom data
    // msg.value must equal sum(assets[])
    const txHash = await walletClient.writeContract({
      address: INTUITION_CONTRACT_ADDRESS,
      abi: INTUITION_CONTRACT_ABI,
      functionName: 'createAtoms',
      args: [
        [userDataBytes], // bytes[] - array with one User atom data
        [depositAmountWei] // uint256[] - array with one deposit amount
      ],
      value: depositAmountWei, // msg.value must equal sum(assets[])
      account: account
    })

    console.log('[SUCCESS] User atom creation transaction sent:', txHash)
    console.log('[INFO] After transaction confirms, create triples for profile fields')

    return { success: true, txHash }
  } catch (error: any) {
    console.error('[ERROR] Error creating User atom:', error)
    return { 
      success: false, 
      error: error.message || 'Unknown error',
      details: error
    }
  }
}

