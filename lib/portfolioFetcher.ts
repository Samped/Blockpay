/**
 * Portfolio Fetcher
 * Fetches portfolios created via PortfolioContract from Intuition Knowledge Graph
 */

import { intuitionClient } from './intuitionClient'
import { PORTFOLIO_CONTRACT_ADDRESS, PORTFOLIO_CONTRACT_ABI } from './portfolioContract'

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
      if (result?.errors) {
        console.error('[ERROR] GraphQL errors when fetching atom:', result.errors)
      }
      const atoms = result?.atoms || []
      console.log('[INFO] GraphQL query for atom returned', atoms.length, 'atoms')
      if (atoms.length === 0) {
        console.log('[WARN] Profile atom not found for ID:', profileId)
        console.log('[WARN] Tried querying with termId:', profileId.toLowerCase())
        console.log('[WARN] This might mean the atom is not indexed yet, or the termId format is wrong')
        return null
      }
      atom = atoms[0]
      console.log('[INFO] ✅ Found atom in GraphQL:', atom.term_id)
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
    
    console.log('[DEBUG] Parsed profile data for', profileId, ':', {
      type: typeof profileData,
      isObject: typeof profileData === 'object',
      keys: profileData && typeof profileData === 'object' ? Object.keys(profileData) : [],
      name: profileData?.name,
      bio: profileData?.bio?.slice(0, 50),
      fullData: profileData,
    })

    // 2. Get predicate IDs directly from the contract (more reliable than GraphQL)
    // Use the predicate IDs from the transaction you showed:
    // skill: 0xa9c2d5889ae8904c067cad5e7d5e667711f1e23a57fe3096cdd4fb00691e73e0
    // tag: 0x42300b4ce5316f4246e5ec389fda28a4c9e354425f049f39fe602b5ce0b78b51
    // social: 0xbe1d5024ae24c26ed549eca1af20897dc8951b29c125f5b66ba13a8ffacf9a19
    // achievement: 0x710db8a9eb61b73986bbdc424e0bdd8bf17582773ff458639ef0379936b1791e
    
    // For now, use hardcoded predicate IDs from your transaction
    // TODO: Read from contract using publicClient when available
    const predicateMap: Record<string, string> = {
      skill: '0xa9c2d5889ae8904c067cad5e7d5e667711f1e23a57fe3096cdd4fb00691e73e0',
      tag: '0x42300b4ce5316f4246e5ec389fda28a4c9e354425f049f39fe602b5ce0b78b51',
      social: '0xbe1d5024ae24c26ed549eca1af20897dc8951b29c125f5b66ba13a8ffacf9a19',
      achievement: '0x710db8a9eb61b73986bbdc424e0bdd8bf17582773ff458639ef0379936b1791e',
    }
    
    console.log('[INFO] Using predicate IDs from contract initialization:', Object.keys(predicateMap))

    // 3. Get triples from profile atom
    // Try multiple query formats to find one that works
    const GRAPHQL_URL = 'https://testnet.intuition.sh/v1/graphql'
    const subjectId = profileId.toLowerCase()
    console.log('[INFO] Querying triples for subject:', subjectId)
    
    let triples: any[] = []
    
    // The error shows that subject is a relation, not a direct field
    // Try query format 1: Query subject as a direct string (not a relation)
    const query1 = `
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
    
    // Try query format 2: Query without where clause, filter client-side
    const query2 = `
      query GetAllTriples($limit: Int!) {
        triples(
          limit: $limit
          order_by: { created_at: desc }
        ) {
          id
          subject
          predicate
          object
        }
      }
    `
    
    // Try query format 3: Query by predicate IDs (if we know them)
    const query3 = `
      query GetPortfolioTriples($subject: String!) {
        triples(
          limit: 200
        ) {
          id
          subject
          predicate
          object
        }
      }
    `
    
    // Strategy: Since subject is a relation, query all triples and filter client-side
    // Note: triples don't have an 'id' field, only subject, predicate, object
    console.log('[INFO] Querying all recent triples and filtering by subject client-side...')
    try {
      const response = await fetch(GRAPHQL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            query GetAllTriples($limit: Int!) {
              triples(
                limit: $limit
                order_by: { created_at: desc }
              ) {
                subject {
                  term_id
                }
                predicate {
                  term_id
                }
                object {
                  term_id
                }
              }
            }
          `,
          variables: { limit: 1000 },
        }),
      })
      
      const data = await response.json()
      
      if (data.errors) {
        console.error('[ERROR] Fallback query failed:', JSON.stringify(data.errors, null, 2))
      } else if (data.data?.triples) {
        const allTriples = data.data.triples || []
        console.log('[INFO] Got', allTriples.length, 'total triples from query')
        
        // Filter by subject - handle both string and nested structures
        triples = allTriples.filter((t: any) => {
          const tripleSubject = (t.subject?.term_id || t.subject || '').toLowerCase()
          return tripleSubject === subjectId
        })
        
        console.log('[INFO] ✅ Filtered to', triples.length, 'triples for profile', profileId.slice(0, 20))
        if (triples.length > 0) {
          console.log('[INFO] Sample triple:', {
            id: triples[0].id,
            subject: triples[0].subject?.slice(0, 20) || triples[0].subject,
            predicate: triples[0].predicate?.slice(0, 20) || triples[0].predicate,
            object: triples[0].object?.slice(0, 20) || triples[0].object,
          })
          console.log('[INFO] First 3 triples:', triples.slice(0, 3).map(t => ({
            subject: t.subject?.term_id || t.subject,
            predicate: t.predicate?.term_id || t.predicate,
            object: t.object?.term_id || t.object,
          })))
        }
      }
    } catch (error) {
      console.error('[ERROR] Fallback query threw exception:', error)
    }
    
    if (triples.length === 0) {
      console.log('[WARN] All triples queries failed or returned no results')
      console.log('[INFO] Trying fallback: Query all recent triples and filter client-side...')
      
      // Fallback: Query all recent triples and filter by subject
      try {
        const fallbackQuery = `
          query GetAllTriples($limit: Int!) {
            triples(
              limit: $limit
              order_by: { created_at: desc }
            ) {
              subject {
                term_id
              }
              predicate {
                term_id
              }
              object {
                term_id
              }
            }
          }
        `
        
        const fallbackResponse = await fetch(GRAPHQL_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: fallbackQuery,
            variables: { limit: 500 },
          }),
        })
        
        const fallbackData = await fallbackResponse.json()
        if (fallbackData.data?.triples) {
          const allTriples = fallbackData.data.triples || []
          console.log('[INFO] Got', allTriples.length, 'total triples from fallback query')
          
          // Filter by subject (case-insensitive)
          triples = allTriples.filter((t: any) => {
            const tripleSubject = (t.subject?.term_id || t.subject || '').toLowerCase()
            return tripleSubject === subjectId
          })
          
          console.log('[INFO] Filtered to', triples.length, 'triples for profile', profileId.slice(0, 20))
          if (triples.length > 0) {
            console.log('[INFO] ✅ Fallback query found triples!')
          }
        }
      } catch (fallbackError) {
        console.error('[ERROR] Fallback query also failed:', fallbackError)
      }
      
      if (triples.length === 0) {
        console.log('[WARN] No triples found after all attempts')
        console.log('[INFO] This could mean:')
        console.log('[INFO] 1. Triples haven\'t been indexed yet (wait 2-5 minutes)')
        console.log('[INFO] 2. No triples were created for this profile')
        console.log('[INFO] 3. The profile ID format is incorrect')
        console.log('[INFO] Profile ID used:', profileId)
        console.log('[INFO] Subject ID used for query:', subjectId)
      }
    }
    
    if (triples.length === 0) {
      console.log('[WARN] No triples found for profile atom. Returning portfolio with profile data only')
      const portfolio: Portfolio = {
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
      console.log('[INFO] ✅ Returning portfolio (no triples):', {
        profileId: portfolio.profileId,
        hasProfileData: !!portfolio.profileData,
        profileDataKeys: portfolio.profileData ? Object.keys(portfolio.profileData) : [],
        name: portfolio.profileData?.name,
      })
      return portfolio
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
      console.log('[INFO] No object IDs from triples, returning portfolio with profile data only')
      const portfolio: Portfolio = {
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
      console.log('[INFO] ✅ Returning portfolio (no object IDs):', {
        profileId: portfolio.profileId,
        hasProfileData: !!portfolio.profileData,
        name: portfolio.profileData?.name,
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
        atomMap[atom.term_id.toLowerCase()] = { type: atom.type, data: atomData }
      } catch {
        atomMap[atom.term_id.toLowerCase()] = { type: atom.type, data: atom.data }
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
    const projectPredicateId = predicateMap['project']
    
    console.log('[INFO] Predicate IDs for parsing:', {
      skill: skillPredicateId?.slice(0, 20),
      tag: tagPredicateId?.slice(0, 20),
      social: socialPredicateId?.slice(0, 20),
      achievement: achievementPredicateId?.slice(0, 20),
      project: projectPredicateId?.slice(0, 20),
    })
    console.log('[INFO] Processing', triples.length, 'triples to extract portfolio data')

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
      
      if (!triplePredicateId || !tripleObjectId) {
        console.log('[DEBUG] Skipping triple - missing predicate or object:', {
          predicate: triplePredicateId || 'missing',
          object: tripleObjectId || 'missing',
          fullTriple: JSON.stringify(triple).slice(0, 200),
        })
        continue
      }
      
      const objectAtom = atomMap[tripleObjectId]
      if (!objectAtom) {
        console.log('[DEBUG] Object atom not found for ID:', tripleObjectId)
        console.log('[DEBUG] Available atom IDs:', Object.keys(atomMap).slice(0, 10))
        continue
      }

      // Compare predicate IDs (case-insensitive)
      const skillPredLower = skillPredicateId?.toLowerCase() || ''
      const tagPredLower = tagPredicateId?.toLowerCase() || ''
      const socialPredLower = socialPredicateId?.toLowerCase() || ''
      const achievementPredLower = achievementPredicateId?.toLowerCase() || ''

      // Check if this is a value atom - GraphQL returns JsonObject type, but data contains type: "value"
      // The atom.data should be parsed JSON like {"type":"value","data":"..."}
      const isValueAtom = objectAtom.type === 'value' || 
                         (objectAtom.data?.type === 'value')
      
      // Check if this is a project atom
      const isProjectAtom = objectAtom.type === 'project' || 
                           (objectAtom.data?.type === 'project')
      
      // Debug: Log the atom structure
      if (triplePredicateId === skillPredLower || triplePredicateId === tagPredLower || 
          triplePredicateId === socialPredLower || triplePredicateId === achievementPredLower) {
        console.log('[DEBUG] Atom structure:', {
          atomType: objectAtom.type,
          dataType: typeof objectAtom.data,
          dataKeys: typeof objectAtom.data === 'object' ? Object.keys(objectAtom.data || {}) : 'not object',
          dataTypeField: objectAtom.data?.type,
          dataDataField: typeof objectAtom.data?.data,
          isValueAtom,
          isProjectAtom,
        })
      }

      console.log('[DEBUG] Processing triple:', {
        predicate: triplePredicateId.slice(0, 30),
        objectType: objectAtom.type,
        isValueAtom,
        isProjectAtom,
        objectData: typeof objectAtom.data === 'object' ? objectAtom.data?.type : 'not object',
        matchesSkill: skillPredLower && triplePredicateId === skillPredLower,
        matchesTag: tagPredLower && triplePredicateId === tagPredLower,
        matchesSocial: socialPredLower && triplePredicateId === socialPredLower,
        matchesAchievement: achievementPredLower && triplePredicateId === achievementPredLower,
      })

      if (skillPredLower && triplePredicateId === skillPredLower && isValueAtom) {
        // Extract value from data structure: {"type":"value","data":"skill name"}
        let skillValue = objectAtom.data?.data
        if (!skillValue && typeof objectAtom.data === 'object' && objectAtom.data.data) {
          skillValue = objectAtom.data.data
        }
        if (typeof skillValue === 'string') {
          skills.push(skillValue)
          console.log('[INFO] ✅ Added skill:', skillValue)
        } else {
          console.log('[DEBUG] Skill value is not a string:', typeof skillValue, skillValue, 'Full data:', objectAtom.data)
        }
      } else if (tagPredLower && triplePredicateId === tagPredLower && isValueAtom) {
        // Extract value from data structure: {"type":"value","data":"tag name"}
        let tagValue = objectAtom.data?.data
        if (!tagValue && typeof objectAtom.data === 'object' && objectAtom.data.data) {
          tagValue = objectAtom.data.data
        }
        if (typeof tagValue === 'string') {
          tags.push(tagValue)
          console.log('[INFO] ✅ Added tag:', tagValue)
        } else {
          console.log('[DEBUG] Tag value is not a string:', typeof tagValue, tagValue, 'Full data:', objectAtom.data)
        }
      } else if (socialPredLower && triplePredicateId === socialPredLower && isValueAtom) {
        // Extract social data: {"type":"value","data":{"platform":"GitHub","url":"..."}}
        let socialData = objectAtom.data?.data
        if (!socialData && typeof objectAtom.data === 'object' && objectAtom.data.data) {
          socialData = objectAtom.data.data
        }
        
        // Handle both object and string formats
        if (typeof socialData === 'object' && socialData.platform && socialData.url) {
          socials.push({ platform: socialData.platform, url: socialData.url })
          console.log('[INFO] ✅ Added social:', socialData.platform)
        } else if (typeof socialData === 'string') {
          try {
            const parsed = JSON.parse(socialData)
            if (parsed.platform && parsed.url) {
              socials.push({ platform: parsed.platform, url: parsed.url })
              console.log('[INFO] ✅ Added social (parsed):', parsed.platform)
            }
          } catch {
            console.log('[DEBUG] Failed to parse social data:', socialData)
          }
        } else {
          console.log('[DEBUG] Social data format unexpected:', typeof socialData, socialData, 'Full data:', objectAtom.data)
        }
      } else if (achievementPredLower && triplePredicateId === achievementPredLower && isValueAtom) {
        // Extract value from data structure: {"type":"value","data":"achievement text"}
        let achievementValue = objectAtom.data?.data
        if (!achievementValue && typeof objectAtom.data === 'object' && objectAtom.data.data) {
          achievementValue = objectAtom.data.data
        }
        if (typeof achievementValue === 'string') {
          achievements.push(achievementValue)
          console.log('[INFO] ✅ Added achievement:', achievementValue.slice(0, 50))
        } else {
          console.log('[DEBUG] Achievement value is not a string:', typeof achievementValue, achievementValue, 'Full data:', objectAtom.data)
        }
      } else if (isProjectAtom) {
        // Extract project data: {"type":"project","data":{"title":"...","description":"..."}}
        let projectData = objectAtom.data?.data
        if (!projectData && typeof objectAtom.data === 'object' && objectAtom.data.data) {
          projectData = objectAtom.data.data
        }
        if (typeof projectData === 'object') {
          projects.push({
            title: projectData.title || '',
            description: projectData.description || '',
            category: projectData.category,
            image: projectData.image,
            externalLink: projectData.externalLink,
          })
          console.log('[INFO] ✅ Added project:', projectData.title)
        } else {
          console.log('[DEBUG] Project data format unexpected:', typeof projectData, projectData, 'Full data:', objectAtom.data)
        }
      } else {
        console.log('[DEBUG] Triple not matched:', {
          predicateMatch: {
            skill: skillPredLower && triplePredicateId === skillPredLower,
            tag: tagPredLower && triplePredicateId === tagPredLower,
            social: socialPredLower && triplePredicateId === socialPredLower,
            achievement: achievementPredLower && triplePredicateId === achievementPredLower,
          },
          isValueAtom,
          isProjectAtom,
          objectType: objectAtom.type,
        })
      }
    }
    
    console.log('[INFO] ========== Parsed Portfolio Data ==========')
    console.log('[INFO] Skills:', skills.length, skills)
    console.log('[INFO] Tags:', tags.length, tags)
    console.log('[INFO] Socials:', socials.length, socials)
    console.log('[INFO] Achievements:', achievements.length, achievements)
    console.log('[INFO] Projects:', projects.length, projects)

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
    // Get contract address to query portfolios created by the contract
    const PORTFOLIO_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_PORTFOLIO_CONTRACT_ADDRESS
    const contractAddress = PORTFOLIO_CONTRACT_ADDRESS?.toLowerCase() || ''
    
    console.log('[INFO] Fetching all portfolios, contract address:', contractAddress)
    
    // Query for profile atoms - query by contract creator OR scan all and filter
    let query: string
    let variables: any
    
    let allAtoms: any[] = []
    
    // Try querying by contract address first, but fallback to all atoms if it times out
    if (contractAddress && contractAddress !== '0x0000000000000000000000000000000000000000') {
      try {
        // Query atoms created by the contract
        query = `
          query GetProfileAtoms($creator: String!, $limit: Int!) {
            atoms(
              where: { creator_id: { _eq: $creator } }
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
        variables = { creator: contractAddress, limit }
        console.log('[INFO] Querying atoms created by contract:', contractAddress)
        
        const result = await intuitionClient.graphqlQuery(query, variables)
        if (result?.errors) {
          console.error('[ERROR] GraphQL errors:', result.errors)
        }
        allAtoms = result?.atoms || []
        console.log('[INFO] Found', allAtoms.length, 'atoms from contract query')
      } catch (error) {
        // If query times out or fails, fall back to querying all recent atoms
        console.warn('[WARN] Contract query failed (likely timeout), falling back to query all recent atoms:', error)
        if (error instanceof Error && error.message.includes('timeout')) {
          console.log('[INFO] Query timed out, using fallback strategy')
        }
        // Continue to fallback below
      }
    }
    
    // Fallback: query all recent atoms and filter client-side
    // This is more reliable and matches what UserInitialization does successfully
    if (allAtoms.length === 0) {
      console.log('[INFO] Using fallback: querying all recent atoms and filtering client-side')
      query = `
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
      variables = { limit }
      
      try {
        const result = await intuitionClient.graphqlQuery(query, variables)
        if (result?.errors) {
          console.error('[ERROR] Fallback GraphQL errors:', result.errors)
        }
        allAtoms = result?.atoms || []
        console.log('[INFO] Fallback query found', allAtoms.length, 'total atoms')
        
        // Filter for atoms created by the contract (if contract address is set)
        if (contractAddress && contractAddress !== '0x0000000000000000000000000000000000000000') {
          const contractAtoms = allAtoms.filter(atom => 
            atom.creator_id?.toLowerCase() === contractAddress.toLowerCase()
          )
          console.log('[INFO] Filtered', contractAtoms.length, 'atoms created by contract from', allAtoms.length, 'total atoms')
          allAtoms = contractAtoms
        }
      } catch (error) {
        console.error('[ERROR] Fallback query also failed:', error)
        allAtoms = []
      }
    }
    
    if (allAtoms.length === 0) {
      console.log('[WARN] ⚠️ No atoms returned from GraphQL query!')
      console.log('[WARN] Query variables:', variables)
      console.log('[WARN] Contract address used:', contractAddress || 'NONE (fallback mode)')
    }
    
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
          console.log('[INFO] ✅ Found profile atom:', atom.term_id.slice(0, 20) + '...', 'creator:', atom.creator_id?.slice(0, 10) + '...')
        }
        return isProfile
      } catch (error) {
        console.log('[DEBUG] Error parsing atom data:', atom.term_id?.slice(0, 20), error)
        return false
      }
    })
    
    console.log('[INFO] Filtered', profileAtoms.length, 'profile atoms from', allAtoms.length, 'total atoms')

    // Fetch full portfolio data for each profile
    // Pass the atom directly to avoid REST API call (which has CORS issues)
    const portfolios: Portfolio[] = []
    console.log('[INFO] Processing', profileAtoms.length, 'profile atoms to fetch full data')
    
    for (const atom of profileAtoms) {
      if (atom.term_id) {
        console.log('[INFO] 🔄 Processing profile atom:', atom.term_id.slice(0, 20) + '...')
        try {
          const portfolio = await fetchPortfolioByProfileId(atom.term_id, atom)
          if (portfolio) {
            console.log('[SUCCESS] ✅ Portfolio loaded:', portfolio.profileId.slice(0, 20) + '...')
            portfolios.push(portfolio)
          } else {
            console.log('[WARN] ⚠️ fetchPortfolioByProfileId returned null')
          }
        } catch (error) {
          console.error('[ERROR] ❌ Exception:', error)
          if (error instanceof Error) {
            console.error('[ERROR] Error message:', error.message)
          }
        }
      }
    }

    console.log('[INFO] ========== FINAL: Loaded', portfolios.length, 'portfolios ==========')
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

