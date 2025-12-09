/**
 * Portfolio Fetcher
 * Fetches portfolios created via PortfolioContract from Intuition Knowledge Graph
 */

import { intuitionClient } from './intuitionClient'

export interface Portfolio {
  profileId: string
  creatorAddress: string
  profileData: {
    name?: string
    bio?: string
    email?: string
    website?: string
    profilePicture?: string
  }
  skills: string[]
  tags: string[]
  socials: Array<{ platform: string; url: string }>
  achievements: string[]
  projects: Array<{ title: string; description: string; category?: string }>
  createdAt?: string
}

/**
 * Fetch portfolio by profile atom ID
 */
export async function fetchPortfolioByProfileId(profileId: string, profileAtom?: any): Promise<Portfolio | null> {
  try {
    console.log('[INFO] Fetching portfolio by profileId:', profileId)
    
    // 1. Get the profile atom - use provided atom or fetch via GraphQL
    let atom = profileAtom
    if (!atom) {
      // Try GraphQL query instead of REST API (which has CORS issues)
      const atomQuery = `
        query GetAtom($termId: String!) {
          atoms(
            where: { term_id: { _eq: $termId } }
            limit: 1
          ) {
            term_id
            type
            creator_id
            created_at
            data
          }
        }
      `
      const result = await intuitionClient.graphqlQuery(atomQuery, { termId: profileId.toLowerCase() })
      const atoms = result?.atoms || []
      if (atoms.length === 0) {
        console.log('[WARN] Profile atom not found for ID:', profileId)
        return null
      }
      atom = atoms[0]
    }
    
    if (!atom) {
      console.log('[WARN] Profile atom not found for ID:', profileId)
      return null
    }
    
    console.log('[INFO] Found profile atom:', atom.term_id, 'creator:', atom.creator_id)

    // Parse profile data
    // Contract creates: {"type":"profile","data":{...profileJson...}}
    let profileData: any = {}
    if (atom.data) {
      if (typeof atom.data === 'string') {
        try {
          if (atom.data.startsWith('0x')) {
            // Hex encoded
            const decoded = Buffer.from(atom.data.slice(2), 'hex').toString('utf-8')
            const parsed = JSON.parse(decoded)
            // Handle nested structure: {"type":"profile","data":{...}}
            profileData = parsed.data || parsed
          } else {
            const parsed = JSON.parse(atom.data)
            // Handle nested structure: {"type":"profile","data":{...}}
            profileData = parsed.data || parsed
          }
        } catch (error) {
          console.log('[DEBUG] Error parsing profile data:', error)
          // Try to extract from atom data structure
          if (typeof atom.data === 'object') {
            profileData = atom.data
          }
        }
      } else if (typeof atom.data === 'object') {
        // Handle nested structure
        profileData = atom.data.data || atom.data
      }
    }
    
    console.log('[DEBUG] Parsed profile data for', profileId, ':', profileData)

    // 2. Get predicate IDs for portfolio predicates - query all recent atoms and filter
    const predicateQuery = `
      query GetPortfolioPredicates {
        atoms(
          limit: 200
          order_by: { created_at: desc }
        ) {
          term_id
          data
        }
      }
    `

    const predicateResult = await intuitionClient.graphqlQuery(predicateQuery, {})
    const allAtoms = predicateResult?.atoms || []
    
    // Filter for predicate atoms with skill/tag/social/achievement
    const predicates = allAtoms.filter(atom => {
      try {
        let data: any = {}
        if (typeof atom.data === 'string' && atom.data.startsWith('0x')) {
          const decoded = Buffer.from(atom.data.slice(2), 'hex').toString('utf-8')
          data = JSON.parse(decoded)
        } else if (typeof atom.data === 'string') {
          data = JSON.parse(atom.data)
        } else {
          data = atom.data
        }
        return data.type === 'predicate' && 
               ['skill', 'tag', 'social', 'achievement'].includes(data.name)
      } catch {
        return false
      }
    })

    // Build predicate map
    const predicateMap: Record<string, string> = {}
    for (const pred of predicates) {
      try {
        let predData: any = {}
        if (typeof pred.data === 'string' && pred.data.startsWith('0x')) {
          const decoded = Buffer.from(pred.data.slice(2), 'hex').toString('utf-8')
          predData = JSON.parse(decoded)
        } else if (typeof pred.data === 'string') {
          predData = JSON.parse(pred.data)
        } else {
          predData = pred.data
        }
        
        if (predData.type === 'predicate' && predData.name) {
          predicateMap[predData.name] = pred.term_id
        }
      } catch {
        // Skip invalid predicates
      }
    }

    // 3. Get triples from profile atom
    // Use the correct GraphQL schema structure for triples (matching VoteButton pattern)
    const triplesQuery = `
      query GetPortfolioTriples($subject: String!) {
        triples(
          where: { 
            subject: { _eq: $subject }
          }
          limit: 200
        ) {
          id
          subject
          predicate
          object
        }
      }
    `

    const triplesResult = await intuitionClient.graphqlQuery(triplesQuery, {
      subject: profileId.toLowerCase(),
    })

    if (triplesResult?.errors) {
      console.error('[ERROR] GraphQL errors in triples query:', triplesResult.errors)
    }

    const triples = triplesResult?.triples || []
    console.log('[INFO] Found', triples.length, 'triples for profile', profileId)
    
    if (triples.length === 0) {
      console.log('[WARN] No triples found for profile atom. This portfolio may not have any skills, tags, socials, etc.')
    }

    // 4. Get object atom IDs - handle nested structure
    const objectIds = Array.from(new Set(
      triples
        .map((t: any) => t.object?.term_id || t.object)
        .filter(Boolean)
    ))
    
    // Also get predicate IDs
    const predicateIds = Array.from(new Set(
      triples
        .map((t: any) => t.predicate?.term_id || t.predicate)
        .filter(Boolean)
    ))
    
    if (objectIds.length === 0) {
      console.log('[INFO] No triples found, returning portfolio with profile data only')
      const portfolio = {
        profileId,
        creatorAddress: atom.creator_id || '',
        profileData: profileData.data || profileData,
        skills: [],
        tags: [],
        socials: [],
        achievements: [],
        projects: [],
        createdAt: atom.created_at,
      }
      console.log('[INFO] Returning portfolio (no triples):', {
        profileId: portfolio.profileId,
        hasProfileData: !!portfolio.profileData,
        profileDataKeys: portfolio.profileData ? Object.keys(portfolio.profileData) : [],
      })
      return portfolio
    }

    // 5. Get all object atoms
    const atomsQuery = `
      query GetPortfolioAtoms($ids: [String!]) {
        atoms(where: { term_id: { _in: $ids } }, limit: 200) {
          term_id
          type
          data
        }
      }
    `

    const atomsResult = await intuitionClient.graphqlQuery(atomsQuery, { ids: objectIds })
    
    if (atomsResult?.errors) {
      console.error('[ERROR] GraphQL errors in atoms query:', atomsResult.errors)
    }
    
    const atoms = atomsResult?.atoms || []
    console.log('[INFO] Found', atoms.length, 'object atoms out of', objectIds.length, 'requested')

    // Build atom map
    const atomMap: Record<string, any> = {}
    for (const atom of atoms) {
      try {
        let atomData: any = {}
        if (typeof atom.data === 'string' && atom.data.startsWith('0x')) {
          const decoded = Buffer.from(atom.data.slice(2), 'hex').toString('utf-8')
          atomData = JSON.parse(decoded)
        } else if (typeof atom.data === 'string') {
          atomData = JSON.parse(atom.data)
        } else {
          atomData = atom.data
        }
        atomMap[atom.term_id] = { type: atom.type, data: atomData }
      } catch {
        atomMap[atom.term_id] = { type: atom.type, data: atom.data }
      }
    }

    // 6. Parse triples into portfolio data
    const skills: string[] = []
    const tags: string[] = []
    const socials: Array<{ platform: string; url: string }> = []
    const achievements: string[] = []
    const projects: Array<{ title: string; description: string; category?: string }> = []

    const skillPredicateId = predicateMap['skill']
    const tagPredicateId = predicateMap['tag']
    const socialPredicateId = predicateMap['social']
    const achievementPredicateId = predicateMap['achievement']

    for (const triple of triples) {
      // Handle both flat and nested triple structures
      let triplePredicateId = ''
      let tripleObjectId = ''
      
      if (triple.predicate?.term_id) {
        triplePredicateId = triple.predicate.term_id.toLowerCase()
      } else if (typeof triple.predicate === 'string') {
        triplePredicateId = triple.predicate.toLowerCase()
      }
      
      if (triple.object?.term_id) {
        tripleObjectId = triple.object.term_id.toLowerCase()
      } else if (typeof triple.object === 'string') {
        tripleObjectId = triple.object.toLowerCase()
      }
      
      if (!triplePredicateId || !tripleObjectId) continue
      
      const objectAtom = atomMap[tripleObjectId]
      if (!objectAtom) {
        console.log('[DEBUG] Object atom not found for ID:', tripleObjectId)
        continue
      }

      // Compare predicate IDs (case-insensitive)
      const skillPredLower = skillPredicateId?.toLowerCase() || ''
      const tagPredLower = tagPredicateId?.toLowerCase() || ''
      const socialPredLower = socialPredicateId?.toLowerCase() || ''
      const achievementPredLower = achievementPredicateId?.toLowerCase() || ''

      if (skillPredLower && triplePredicateId === skillPredLower && objectAtom.type === 'value') {
        const skillValue = objectAtom.data?.data || objectAtom.data
        if (typeof skillValue === 'string') {
          skills.push(skillValue)
        }
      } else if (tagPredLower && triplePredicateId === tagPredLower && objectAtom.type === 'value') {
        const tagValue = objectAtom.data?.data || objectAtom.data
        if (typeof tagValue === 'string') {
          tags.push(tagValue)
        }
      } else if (socialPredLower && triplePredicateId === socialPredLower && objectAtom.type === 'value') {
        const socialData = objectAtom.data?.data || objectAtom.data
        if (typeof socialData === 'object' && socialData.platform && socialData.url) {
          socials.push({ platform: socialData.platform, url: socialData.url })
        } else if (typeof socialData === 'string') {
          try {
            const parsed = JSON.parse(socialData)
            if (parsed.platform && parsed.url) {
              socials.push({ platform: parsed.platform, url: parsed.url })
            }
          } catch {
            // Skip invalid social
          }
        }
      } else if (achievementPredLower && triplePredicateId === achievementPredLower && objectAtom.type === 'value') {
        const achievementValue = objectAtom.data?.data || objectAtom.data
        if (typeof achievementValue === 'string') {
          achievements.push(achievementValue)
        }
      } else if (objectAtom.type === 'project') {
        const projectData = objectAtom.data?.data || objectAtom.data
        if (typeof projectData === 'object') {
          projects.push({
            title: projectData.title || '',
            description: projectData.description || '',
            category: projectData.category,
          })
        }
      }
    }

    const portfolio = {
      profileId,
      creatorAddress: atom.creator_id || '',
      profileData: profileData.data || profileData,
      skills,
      tags,
      socials,
      achievements,
      projects,
      createdAt: atom.created_at,
    }
    
    console.log('[SUCCESS] Portfolio fully loaded:', {
      profileId: portfolio.profileId,
      hasProfileData: !!portfolio.profileData,
      profileDataKeys: portfolio.profileData ? Object.keys(portfolio.profileData) : [],
      skillsCount: portfolio.skills.length,
      tagsCount: portfolio.tags.length,
      socialsCount: portfolio.socials.length,
      achievementsCount: portfolio.achievements.length,
      projectsCount: portfolio.projects.length,
    })
    
    return portfolio
  } catch (error) {
    console.error('[ERROR] Error fetching portfolio for ID:', profileId, error)
    if (error instanceof Error) {
      console.error('[ERROR] Error message:', error.message)
      console.error('[ERROR] Error stack:', error.stack)
    }
    return null
  }
}

/**
 * Fetch portfolio by user's wallet address (reads from contract)
 */
export async function fetchPortfolioByAddress(address: string, publicClient?: any): Promise<Portfolio | null> {
  try {
    if (!publicClient) {
      console.log('[WARN] No publicClient provided, cannot read from contract')
      return null
    }

    const PORTFOLIO_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_PORTFOLIO_CONTRACT_ADDRESS as `0x${string}`
    if (!PORTFOLIO_CONTRACT_ADDRESS || PORTFOLIO_CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') {
      console.log('[WARN] Portfolio contract address not configured')
      return null
    }

    // Read userPortfolioAtoms mapping from contract
    const PORTFOLIO_CONTRACT_ABI = [
      {
        name: 'userPortfolioAtoms',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: '', type: 'address' }],
        outputs: [{ name: '', type: 'bytes32' }],
      },
    ] as const

    const profileId = await publicClient.readContract({
      address: PORTFOLIO_CONTRACT_ADDRESS,
      abi: PORTFOLIO_CONTRACT_ABI,
      functionName: 'userPortfolioAtoms',
      args: [address as `0x${string}`],
    }) as `0x${string}`

    if (!profileId || profileId === '0x0000000000000000000000000000000000000000000000000000000000000000') {
      console.log('[INFO] No portfolio found in contract for address:', address)
      return null
    }

    console.log('[INFO] Found portfolio ID from contract:', profileId)
    return await fetchPortfolioByProfileId(profileId)
  } catch (error) {
    console.error('[ERROR] Error fetching portfolio by address:', error)
    return null
  }
}

/**
 * Fetch all portfolios (recent profile atoms)
 */
export async function fetchAllPortfolios(limit: number = 50): Promise<Portfolio[]> {
  try {
    // Query for profile atoms - scan recent atoms and filter by data content
    const query = `
      query GetProfileAtoms($limit: Int!) {
        atoms(
          limit: $limit
          order_by: { created_at: desc }
        ) {
          term_id
          creator_id
          created_at
          data
        }
      }
    `

    const result = await intuitionClient.graphqlQuery(query, { limit })
    const allAtoms = result?.atoms || []
    
    // Filter for profile atoms
    const profileAtoms = allAtoms.filter(atom => {
      try {
        let data: any = {}
        if (typeof atom.data === 'string' && atom.data.startsWith('0x')) {
          const decoded = Buffer.from(atom.data.slice(2), 'hex').toString('utf-8')
          data = JSON.parse(decoded)
        } else if (typeof atom.data === 'string') {
          data = JSON.parse(atom.data)
        } else {
          data = atom.data
        }
        // Check for profile type - contract creates: {"type":"profile","data":{...}}
        const isProfile = data.type === 'profile'
        if (isProfile) {
          console.log('[INFO] Found profile atom:', atom.term_id, 'creator:', atom.creator_id)
        }
        return isProfile
      } catch (error) {
        console.log('[DEBUG] Error parsing atom data:', atom.term_id, error)
        return false
      }
    })
    
    console.log('[INFO] Filtered', profileAtoms.length, 'profile atoms from', allAtoms.length, 'total atoms')

    // Fetch full portfolio data for each profile
    // Pass the atom directly to avoid REST API call (which has CORS issues)
    const portfolios: Portfolio[] = []
    for (const atom of profileAtoms) {
      if (atom.term_id) {
        console.log('[INFO] Processing profile atom:', atom.term_id, 'creator:', atom.creator_id)
        try {
          const portfolio = await fetchPortfolioByProfileId(atom.term_id, atom)
          if (portfolio) {
            console.log('[SUCCESS] Portfolio loaded:', portfolio.profileId)
            portfolios.push(portfolio)
          } else {
            console.log('[WARN] fetchPortfolioByProfileId returned null for atom:', atom.term_id)
          }
        } catch (error) {
          console.error('[ERROR] Exception while loading portfolio for atom:', atom.term_id, error)
          if (error instanceof Error) {
            console.error('[ERROR] Error details:', error.message, error.stack)
          }
        }
      }
    }

    return portfolios
  } catch (error) {
    console.error('[ERROR] Error fetching all portfolios:', error)
    return []
  }
}

/**
 * Fetch portfolios by creator address
 */
export async function fetchPortfoliosByCreator(creatorAddress: string): Promise<Portfolio[]> {
  try {
    const query = `
      query GetPortfoliosByCreator($creator: String!) {
        atoms(
          where: { 
            creator_id: { _eq: $creator }
          }
          limit: 50
          order_by: { created_at: desc }
        ) {
          term_id
          creator_id
          created_at
          data
        }
      }
    `

    const result = await intuitionClient.graphqlQuery(query, {
      creator: creatorAddress.toLowerCase(),
    })

    const allAtoms = result?.atoms || []
    
    // Filter for profile atoms
    const profileAtoms = allAtoms.filter(atom => {
      try {
        let data: any = {}
        if (typeof atom.data === 'string' && atom.data.startsWith('0x')) {
          const decoded = Buffer.from(atom.data.slice(2), 'hex').toString('utf-8')
          data = JSON.parse(decoded)
        } else if (typeof atom.data === 'string') {
          data = JSON.parse(atom.data)
        } else {
          data = atom.data
        }
        // Check for profile type - contract creates: {"type":"profile","data":{...}}
        const isProfile = data.type === 'profile'
        if (isProfile) {
          console.log('[INFO] Found profile atom by creator:', atom.term_id, 'creator:', atom.creator_id)
        }
        return isProfile
      } catch (error) {
        console.log('[DEBUG] Error parsing atom data:', atom.term_id, error)
        return false
      }
    })
    
    console.log('[INFO] Filtered', profileAtoms.length, 'profile atoms from', allAtoms.length, 'total atoms for creator', creatorAddress)
    const portfolios: Portfolio[] = []

    for (const atom of profileAtoms) {
      if (atom.term_id) {
        const portfolio = await fetchPortfolioByProfileId(atom.term_id)
        if (portfolio) {
          portfolios.push(portfolio)
        }
      }
    }

    return portfolios
  } catch (error) {
    console.error('[ERROR] Error fetching portfolios by creator:', error)
    return []
  }
}

