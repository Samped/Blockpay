import { NextRequest, NextResponse } from 'next/server'

/**
 * API Route to proxy atom creation requests
 * This bypasses CORS restrictions by making the request from the server
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, data } = body

    if (!type || !data) {
      return NextResponse.json(
        { error: 'Missing type or data' },
        { status: 400 }
      )
    }

    const contractAddress = '0x2Ece8D4dEdcB9918A398528f3fa4688b1d2CAB91'

    // Try multiple endpoints with contract address (only valid testnet.intuition.sh domains)
    const endpoints = [
      `https://testnet.intuition.sh/v1/atoms`,
      `https://testnet.intuition.sh/atoms`,
      `https://testnet.intuition.sh/v1/atoms?contract=${contractAddress}`,
      `https://testnet.intuition.sh/atoms?contract=${contractAddress}`,
    ]

    // Prepare request body with contract address
    const requestBody = {
      type,
      data: {
        ...data,
        contract: contractAddress,
      },
    }

    for (const endpoint of endpoints) {
      try {
        console.log(`[API Route] Trying endpoint: ${endpoint}`)
        console.log(`[API Route] Request body:`, JSON.stringify(requestBody, null, 2))
        
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        })

        const responseText = await response.text()
        console.log(`[API Route] Response from ${endpoint}:`)
        console.log(`[API Route]   Status: ${response.status} ${response.statusText}`)
        console.log(`[API Route]   Body: ${responseText.substring(0, 500)}`)

        if (response.ok) {
          try {
            const atom = JSON.parse(responseText)
            if (atom && atom.id) {
              console.log(`[API Route] [SUCCESS] SUCCESS: Atom created with ID: ${atom.id}`)
              return NextResponse.json(atom)
            } else {
              console.warn(`[API Route] [WARNING] Response missing atom ID:`, atom)
            }
          } catch (parseError) {
            console.error(`[API Route] [ERROR] Failed to parse JSON:`, parseError)
            return NextResponse.json(
              { error: 'Invalid JSON response', response: responseText.substring(0, 200) },
              { status: 500 }
            )
          }
        } else {
          console.warn(`[API Route] [WARNING] Endpoint ${endpoint} returned ${response.status}`)
          console.warn(`[API Route]   Error: ${responseText.substring(0, 200)}`)
        }
      } catch (endpointError: any) {
        console.error(`[API Route] [ERROR] Endpoint ${endpoint} failed:`, endpointError.message)
        console.error(`[API Route]   Error details:`, endpointError)
        continue
      }
    }

    // All REST endpoints failed - atoms may need to be created on-chain
    return NextResponse.json(
      { 
        error: 'Atom creation via REST API is not available',
        message: 'The Intuition Knowledge Graph API does not support REST endpoints for atom creation. Atoms may need to be created on-chain via the contract.',
        suggestion: 'Consider using on-chain methods to create atoms via the contract 0x2Ece8D4dEdcB9918A398528f3fa4688b1d2CAB91'
      },
      { status: 501 } // 501 Not Implemented
    )
  } catch (error: any) {
    console.error('API route error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

