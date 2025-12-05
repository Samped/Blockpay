/**
 * Check if an atom is indexed in the Intuition GraphQL API
 */

const GRAPHQL_URL = 'https://testnet.intuition.sh/v1/graphql'

export interface AtomIndexStatus {
  indexed: boolean
  term_id: string
}

/**
 * Check if an atom is indexed by querying the GraphQL API
 * @param termId - The atom's term_id
 * @returns Promise with indexed status
 */
export async function checkAtomIndexed(termId: string): Promise<AtomIndexStatus> {
  try {
    const query = `
      query CheckAtomIndexed($termId: String!) {
        atoms(where: { term_id: { _eq: $termId } }, limit: 1) {
          term_id
        }
      }
    `

    const response = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        variables: { termId },
      }),
    })

    const result = await response.json()

    if (result.errors) {
      console.warn('GraphQL error checking atom index:', result.errors)
      return { indexed: false, term_id: termId }
    }

    const atoms = result.data?.atoms || []
    const indexed = atoms.length > 0 && atoms[0]?.term_id === termId

    return { indexed, term_id: termId }
  } catch (error) {
    console.error('Error checking atom index:', error)
    return { indexed: false, term_id: termId }
  }
}
