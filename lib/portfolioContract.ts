/**
 * PortfolioContract ABI and Configuration
 * Contract for batch portfolio creation on Intuition Knowledge Graph
 */

export const PORTFOLIO_CONTRACT_ABI = [
  {
    name: 'initializePredicates',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'names', type: 'string[]', internalType: 'string[]' },
    ],
    outputs: [],
  },
  {
    name: 'setPredicateIds',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'names', type: 'string[]', internalType: 'string[]' },
      { name: 'ids', type: 'bytes32[]', internalType: 'bytes32[]' },
    ],
    outputs: [],
  },
  {
    name: 'setPredicateId',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'name', type: 'string', internalType: 'string' },
      { name: 'id', type: 'bytes32', internalType: 'bytes32' },
    ],
    outputs: [],
  },
  {
    name: 'updatePredicateId',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'name', type: 'string', internalType: 'string' },
      { name: 'newId', type: 'bytes32', internalType: 'bytes32' },
    ],
    outputs: [],
  },
  {
    name: 'addProfileImages',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'profileId', type: 'bytes32', internalType: 'bytes32' },
      { name: 'imageHashes', type: 'string[]', internalType: 'string[]' },
    ],
    outputs: [
      { name: 'imageAtomId', type: 'bytes32', internalType: 'bytes32' },
      { name: 'tripleId', type: 'bytes32', internalType: 'bytes32' },
    ],
  },
  {
    name: 'updateProfileSkills',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'profileId', type: 'bytes32', internalType: 'bytes32' },
      { name: 'skills', type: 'string[]', internalType: 'string[]' },
    ],
    outputs: [
      { name: 'skillAtomId', type: 'bytes32', internalType: 'bytes32' },
      { name: 'tripleId', type: 'bytes32', internalType: 'bytes32' },
    ],
  },
  {
    name: 'updateProfileTags',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'profileId', type: 'bytes32', internalType: 'bytes32' },
      { name: 'tags', type: 'string[]', internalType: 'string[]' },
    ],
    outputs: [
      { name: 'tagAtomId', type: 'bytes32', internalType: 'bytes32' },
      { name: 'tripleId', type: 'bytes32', internalType: 'bytes32' },
    ],
  },
  {
    name: 'updateProfileSocials',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'profileId', type: 'bytes32', internalType: 'bytes32' },
      { name: 'socials', type: 'string[]', internalType: 'string[]' },
    ],
    outputs: [
      { name: 'socialAtomId', type: 'bytes32', internalType: 'bytes32' },
      { name: 'tripleId', type: 'bytes32', internalType: 'bytes32' },
    ],
  },
  {
    name: 'updateProfileAchievements',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'profileId', type: 'bytes32', internalType: 'bytes32' },
      { name: 'achievements', type: 'string[]', internalType: 'string[]' },
    ],
    outputs: [
      { name: 'achievementAtomId', type: 'bytes32', internalType: 'bytes32' },
      { name: 'tripleId', type: 'bytes32', internalType: 'bytes32' },
    ],
  },
  {
    name: 'updateProfileProjects',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'profileId', type: 'bytes32', internalType: 'bytes32' },
      { name: 'projects', type: 'string[]', internalType: 'string[]' },
    ],
    outputs: [
      { name: 'projectAtomId', type: 'bytes32', internalType: 'bytes32' },
      { name: 'tripleId', type: 'bytes32', internalType: 'bytes32' },
    ],
  },
  {
    name: 'trustPortfolio',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'profileId', type: 'bytes32', internalType: 'bytes32' },
    ],
    outputs: [
      { name: 'trustAtomId', type: 'bytes32', internalType: 'bytes32' },
      { name: 'trustTripleId', type: 'bytes32', internalType: 'bytes32' },
    ],
  },
  {
    name: 'batchCreatePortfolio',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'profileJson', type: 'string', internalType: 'string' },
      { name: 'skills', type: 'string[]', internalType: 'string[]' },
      { name: 'tags', type: 'string[]', internalType: 'string[]' },
      { name: 'socials', type: 'string[]', internalType: 'string[]' },
      { name: 'achievements', type: 'string[]', internalType: 'string[]' },
      { name: 'projects', type: 'string[]', internalType: 'string[]' },
    ],
    outputs: [
      { name: 'profileId', type: 'bytes32', internalType: 'bytes32' },
      { name: 'skillIds', type: 'bytes32[]', internalType: 'bytes32[]' },
      { name: 'tagIds', type: 'bytes32[]', internalType: 'bytes32[]' },
      { name: 'socialIds', type: 'bytes32[]', internalType: 'bytes32[]' },
      { name: 'achievementIds', type: 'bytes32[]', internalType: 'bytes32[]' },
      { name: 'projectIds', type: 'bytes32[]', internalType: 'bytes32[]' },
    ],
  },
  {
    name: 'predicateIds',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'string', internalType: 'string' }],
    outputs: [{ name: '', type: 'bytes32', internalType: 'bytes32' }],
  },
  {
    name: 'ATOM_CREATION_FEE',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
  },
  {
    name: 'MAX_SKILLS',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
  },
  {
    name: 'MAX_TAGS',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
  },
  {
    name: 'MAX_SOCIALS',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
  },
  {
    name: 'MAX_ACHIEVEMENTS',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
  },
  {
    name: 'MAX_PROJECTS',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
  },
  {
    name: 'paused',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
  },
  {
    name: 'owner',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
  },
  // Events
  {
    name: 'AtomCreated',
    type: 'event',
    inputs: [
      { name: 'atomId', type: 'bytes32', indexed: true, internalType: 'bytes32' },
      { name: 'atomType', type: 'string', indexed: false, internalType: 'string' },
    ],
  },
  {
    name: 'TripleCreated',
    type: 'event',
    inputs: [
      { name: 'tripleId', type: 'bytes32', indexed: true, internalType: 'bytes32' },
      { name: 'subject', type: 'bytes32', indexed: false, internalType: 'bytes32' },
      { name: 'predicate', type: 'string', indexed: false, internalType: 'string' },
      { name: 'objectPreview', type: 'string', indexed: false, internalType: 'string' },
    ],
  },
  {
    name: 'PredicateInitialized',
    type: 'event',
    inputs: [
      { name: 'name', type: 'string', indexed: false, internalType: 'string' },
      { name: 'predicateId', type: 'bytes32', indexed: false, internalType: 'bytes32' },
    ],
  },
  {
    name: 'ImageHashesStored',
    type: 'event',
    inputs: [
      { name: 'profileId', type: 'bytes32', indexed: true, internalType: 'bytes32' },
      { name: 'imageAtomId', type: 'bytes32', indexed: false, internalType: 'bytes32' },
      { name: 'hashCount', type: 'uint256', indexed: false, internalType: 'uint256' },
    ],
  },
  {
    name: 'TrustedByAdded',
    type: 'event',
    inputs: [
      { name: 'profileId', type: 'bytes32', indexed: true, internalType: 'bytes32' },
      { name: 'voter', type: 'address', indexed: true, internalType: 'address' },
      { name: 'trustAtomId', type: 'bytes32', indexed: false, internalType: 'bytes32' },
      { name: 'trustTripleId', type: 'bytes32', indexed: false, internalType: 'bytes32' },
    ],
  },
] as const

/**
 * Portfolio Contract Address
 * Deployed contract address: 0xb1A2c93234f3eC33f9813b2243B7F4daF2e01592
 * Network: Intuition Testnet (Chain ID: 13579)
 * 
 * To override, set NEXT_PUBLIC_PORTFOLIO_CONTRACT_ADDRESS in .env.local
 */
export const PORTFOLIO_CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_PORTFOLIO_CONTRACT_ADDRESS || '0xb1A2c93234f3eC33f9813b2243B7F4daF2e01592') as `0x${string}`

/**
 * Parse TRUST amount (same as ETH parsing)
 */
export function parseTrustAmount(amount: string): bigint {
  return BigInt(Math.floor(parseFloat(amount) * 1e18))
}

/**
 * Format TRUST amount for display
 */
export function formatTrustAmount(amount: bigint): string {
  return (Number(amount) / 1e18).toFixed(4)
}

/**
 * Calculate total fee for portfolio creation
 * @param profileCount Number of profile atoms (always 1)
 * @param projectCount Number of projects (array length, but only 1 atom if > 0)
 * @param skillCount Number of skills (array length, but only 1 atom if > 0)
 * @param tagCount Number of tags (array length, but only 1 atom if > 0)
 * @param socialCount Number of social links (array length, but only 1 atom if > 0)
 * @param achievementCount Number of achievements (array length, but only 1 atom if > 0)
 * @returns Total fee in wei
 * 
 * New structure: 1 atom + 1 triple per category (not per item)
 * - 1 profile atom
 * - Up to 5 category atoms (skills, tags, socials, achievements, projects) - one per non-empty category
 * - Up to 5 triples (one per non-empty category)
 * - Platform fee: 0.1 TRUST
 */
export function calculatePortfolioFee(
  profileCount: number,
  projectCount: number,
  skillCount: number,
  tagCount: number,
  socialCount: number,
  achievementCount: number
): bigint {
  // Atoms: 1 profile + up to 5 category atoms (one per non-empty category)
  let totalValueAtoms = 0
  if (skillCount > 0) totalValueAtoms += 1
  if (tagCount > 0) totalValueAtoms += 1
  if (socialCount > 0) totalValueAtoms += 1
  if (achievementCount > 0) totalValueAtoms += 1
  if (projectCount > 0) totalValueAtoms += 1
  
  const totalAtoms = profileCount + totalValueAtoms // Profile + category atoms
  
  // Triples: one per non-empty category
  const totalTriples = totalValueAtoms
  
  // Fee per atom/triple is 0.1 TRUST
  const feePerItem = parseTrustAmount('0.1')
  
  // Platform fee: 0.1 TRUST
  const platformFee = parseTrustAmount('0.1')
  
  return BigInt(totalAtoms + totalTriples) * feePerItem + platformFee
}

/**
 * Validate portfolio input data
 */
export interface PortfolioValidationResult {
  valid: boolean
  errors: string[]
}

export function validatePortfolioInput(data: {
  profileJson: string
  skills: string[]
  tags: string[]
  socials: string[]
  achievements: string[]
  projects: string[]
}): PortfolioValidationResult {
  const errors: string[] = []
  
  // Profile JSON validation
  if (!data.profileJson || data.profileJson.trim().length === 0) {
    errors.push('Profile JSON is required')
  } else if (data.profileJson.length > 50000) {
    errors.push('Profile JSON is too long (max 50000 characters)')
  }
  
  // Array length validation
  if (data.skills.length > 100) errors.push('Too many skills (max 100)')
  if (data.tags.length > 50) errors.push('Too many tags (max 50)')
  if (data.socials.length > 20) errors.push('Too many social links (max 20)')
  if (data.achievements.length > 50) errors.push('Too many achievements (max 50)')
  if (data.projects.length > 50) errors.push('Too many projects (max 50)')
  
  // String length validation
  data.skills.forEach((skill, i) => {
    if (skill.length > 100) errors.push(`Skill ${i + 1} is too long (max 100 characters)`)
  })
  
  data.tags.forEach((tag, i) => {
    if (tag.length > 50) errors.push(`Tag ${i + 1} is too long (max 50 characters)`)
  })
  
  data.achievements.forEach((achievement, i) => {
    if (achievement.length > 500) errors.push(`Achievement ${i + 1} is too long (max 500 characters)`)
  })
  
  data.projects.forEach((project, i) => {
    if (project.length > 5000) errors.push(`Project ${i + 1} JSON is too long (max 5000 characters)`)
    // Basic JSON validation
    try {
      JSON.parse(project)
    } catch {
      errors.push(`Project ${i + 1} is not valid JSON`)
    }
  })
  
  data.socials.forEach((social, i) => {
    if (social.length > 1000) errors.push(`Social ${i + 1} JSON is too long (max 1000 characters)`)
    // Basic JSON validation
    try {
      const parsed = JSON.parse(social)
      if (typeof parsed !== 'object' || parsed === null) {
        errors.push(`Social ${i + 1} must be a JSON object`)
      }
    } catch {
      errors.push(`Social ${i + 1} is not valid JSON`)
    }
  })
  
  return {
    valid: errors.length === 0,
    errors,
  }
}
