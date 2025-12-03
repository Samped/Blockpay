/**
 * IPFS utilities for uploading job metadata and submission previews
 * Supports multiple IPFS providers with automatic fallback
 */

export interface IPFSUploadResult {
  cid: string
  url: string
}

/**
 * Check IPFS configuration and return which provider is available
 */
function getIPFSProvider(): 'web3storage' | 'pinata' | 'none' {
  if (process.env.NEXT_PUBLIC_WEB3_STORAGE_TOKEN) {
    return 'web3storage'
  }
  if (process.env.NEXT_PUBLIC_PINATA_JWT) {
    return 'pinata'
  }
  return 'none'
}

/**
 * Get helpful error message for missing IPFS configuration
 */
function getIPFSErrorMessage(): string {
  return `IPFS storage not configured. Please set one of the following in your .env.local file:

Option 1 - Web3.Storage (Recommended):
  NEXT_PUBLIC_WEB3_STORAGE_TOKEN=your_token_here
  Get your token at: https://web3.storage/

Option 2 - Pinata:
  NEXT_PUBLIC_PINATA_JWT=your_jwt_here
  Get your JWT at: https://app.pinata.cloud/

For development, you can also use a public IPFS gateway (data won't persist).`
}

/**
 * Upload JSON data to IPFS with automatic provider fallback
 * Tries: web3.storage -> Pinata -> throws helpful error
 */
export async function uploadToIPFS(data: any): Promise<IPFSUploadResult> {
  const provider = getIPFSProvider()

  // Try web3.storage first
  if (provider === 'web3storage' || process.env.NEXT_PUBLIC_WEB3_STORAGE_TOKEN) {
    try {
      return await uploadToWeb3Storage(data)
    } catch (error: any) {
      console.warn('Web3.Storage upload failed, trying Pinata...', error.message)
      // Fall through to try Pinata
    }
  }

  // Try Pinata
  if (provider === 'pinata' || process.env.NEXT_PUBLIC_PINATA_JWT) {
    try {
      return await uploadToPinata(data)
    } catch (error: any) {
      console.warn('Pinata upload failed', error.message)
      // Fall through to error
    }
  }

  // No provider configured
  throw new Error(getIPFSErrorMessage())
}

/**
 * Upload JSON data to IPFS using web3.storage
 */
async function uploadToWeb3Storage(data: any): Promise<IPFSUploadResult> {
  const token = process.env.NEXT_PUBLIC_WEB3_STORAGE_TOKEN
  
  if (!token) {
    throw new Error('NEXT_PUBLIC_WEB3_STORAGE_TOKEN not configured')
  }

  try {
    const response = await fetch('https://api.web3.storage/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`IPFS upload failed: ${response.statusText} - ${errorText}`)
    }

    const result = await response.json()
    const cid = result.cid || result

    return {
      cid: typeof cid === 'string' ? cid : cid.toString(),
      url: `https://${cid}.ipfs.w3s.link`,
    }
  } catch (error: any) {
    console.error('Web3.Storage upload error:', error)
    throw new Error(`Failed to upload to Web3.Storage: ${error.message}`)
  }
}

/**
 * Upload file to IPFS with automatic provider fallback
 * Tries: web3.storage -> Pinata -> throws helpful error
 */
export async function uploadFileToIPFS(file: File): Promise<IPFSUploadResult> {
  const provider = getIPFSProvider()

  // Try web3.storage first
  if (provider === 'web3storage' || process.env.NEXT_PUBLIC_WEB3_STORAGE_TOKEN) {
    try {
      return await uploadFileToWeb3Storage(file)
    } catch (error: any) {
      console.warn('Web3.Storage file upload failed, trying Pinata...', error.message)
      // Fall through to try Pinata
    }
  }

  // Try Pinata
  if (provider === 'pinata' || process.env.NEXT_PUBLIC_PINATA_JWT) {
    try {
      return await uploadFileToPinata(file)
    } catch (error: any) {
      console.warn('Pinata file upload failed', error.message)
      // Fall through to error
    }
  }

  // No provider configured
  throw new Error(getIPFSErrorMessage())
}

/**
 * Upload file to IPFS using web3.storage
 */
async function uploadFileToWeb3Storage(file: File): Promise<IPFSUploadResult> {
  const token = process.env.NEXT_PUBLIC_WEB3_STORAGE_TOKEN
  
  if (!token) {
    throw new Error('NEXT_PUBLIC_WEB3_STORAGE_TOKEN not configured')
  }

  try {
    const formData = new FormData()
    formData.append('file', file)

    const response = await fetch('https://api.web3.storage/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`IPFS upload failed: ${response.statusText} - ${errorText}`)
    }

    const result = await response.json()
    const cid = result.cid || result

    return {
      cid: typeof cid === 'string' ? cid : cid.toString(),
      url: `https://${cid}.ipfs.w3s.link`,
    }
  } catch (error: any) {
    console.error('Web3.Storage file upload error:', error)
    throw new Error(`Failed to upload file to Web3.Storage: ${error.message}`)
  }
}

/**
 * Upload file to IPFS using Pinata
 */
async function uploadFileToPinata(file: File): Promise<IPFSUploadResult> {
  const jwt = process.env.NEXT_PUBLIC_PINATA_JWT
  
  if (!jwt) {
    throw new Error('NEXT_PUBLIC_PINATA_JWT not configured')
  }

  try {
    const formData = new FormData()
    formData.append('file', file)

    const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwt}`,
      },
      body: formData,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Pinata upload failed: ${response.statusText} - ${errorText}`)
    }

    const result = await response.json()
    const cid = result.IpfsHash

    return {
      cid,
      url: `https://gateway.pinata.cloud/ipfs/${cid}`,
    }
  } catch (error: any) {
    console.error('Pinata file upload error:', error)
    throw new Error(`Failed to upload file to Pinata: ${error.message}`)
  }
}

/**
 * Get IPFS URL from CID
 * Handles both raw CIDs and ipfs:// prefixed CIDs
 */
export function getIPFSUrl(cid: string | null | undefined, gateway: string = 'w3s.link'): string {
  if (!cid) {
    return ''
  }
  // Remove ipfs:// prefix if present
  const cleanCid = cid.replace(/^ipfs:\/\//, '').replace(/^\/ipfs\//, '')
  return `https://${cleanCid}.ipfs.${gateway}`
}

/**
 * Upload JSON data to IPFS using Pinata
 */
async function uploadToPinata(data: any): Promise<IPFSUploadResult> {
  const jwt = process.env.NEXT_PUBLIC_PINATA_JWT
  
  if (!jwt) {
    throw new Error('NEXT_PUBLIC_PINATA_JWT not configured')
  }

  try {
    const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pinataContent: data,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Pinata upload failed: ${response.statusText} - ${errorText}`)
    }

    const result = await response.json()
    const cid = result.IpfsHash

    return {
      cid,
      url: `https://gateway.pinata.cloud/ipfs/${cid}`,
    }
  } catch (error: any) {
    console.error('Pinata upload error:', error)
    throw new Error(`Failed to upload to Pinata: ${error.message}`)
  }
}

