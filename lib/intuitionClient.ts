/**
 * Intuition Knowledge Graph Client
 * Handles interactions with Intuition's Knowledge Graph for Atoms, Triples, and Multivote Contracts
 */

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

  constructor(apiUrl?: string, graphUrl?: string) {
    this.apiUrl = apiUrl || process.env.NEXT_PUBLIC_INTUITION_API_URL || 'https://api.intuition.so'
    this.graphUrl = graphUrl || process.env.NEXT_PUBLIC_INTUITION_GRAPH_URL || 'https://graph.intuition.so'
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
      const response = await fetch(`${this.graphUrl}/atoms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type, data }),
      })
      if (!response.ok) return null
      return await response.json()
    } catch (error) {
      console.error('Error creating atom:', error)
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
}

// Singleton instance
export const intuitionClient = new IntuitionClient()

