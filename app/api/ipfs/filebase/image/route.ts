import { NextRequest, NextResponse } from 'next/server'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'

export const runtime = 'nodejs'

const REGION = 'us-east-1'
const FILEBASE_ENDPOINT = process.env.FILEBASE_ENDPOINT || 'https://s3.filebase.com'
const BUCKET = process.env.FILEBASE_BUCKET

if (!BUCKET) {
  console.warn('FILEBASE_BUCKET not set - Filebase image proxy will not work')
}

const s3Client = new S3Client({
  region: REGION,
  endpoint: FILEBASE_ENDPOINT,
  credentials: {
    accessKeyId: process.env.FILEBASE_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.FILEBASE_SECRET_ACCESS_KEY || '',
  },
  forcePathStyle: true, // Use path-style URLs to avoid DNS issues with bucket name in domain
})

/**
 * Proxy image from Filebase by CID
 * This bypasses IPFS gateway issues by using direct Filebase S3 access
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const cid = searchParams.get('cid')

    if (!cid) {
      return NextResponse.json(
        { error: 'CID parameter required' },
        { status: 400 }
      )
    }

    if (!BUCKET) {
      return NextResponse.json(
        { error: 'Filebase not configured' },
        { status: 500 }
      )
    }

    try {
      const cleanCid = cid.replace(/^ipfs:\/\//, '').replace(/^\/ipfs\//, '')
      console.log(`[Image Proxy] Fetching image from Filebase with CID: ${cleanCid}`)
      console.log(`[Image Proxy] Bucket: ${BUCKET}`)
      
      const command = new GetObjectCommand({
        Bucket: BUCKET,
        Key: cleanCid,
      })

      const response = await s3Client.send(command)
      const body = await response.Body?.transformToByteArray()
      
      console.log(`[Image Proxy] S3 Response:`, {
        contentType: response.ContentType,
        contentLength: response.ContentLength,
        bodySize: body?.length,
        metadata: response.Metadata,
      })
      
      if (!body || body.length === 0) {
        console.error(`[Image Proxy] Empty response from Filebase for CID: ${cleanCid}`)
        return NextResponse.json(
          { error: 'Empty response from Filebase', cid: cleanCid },
          { status: 404 }
        )
      }

      // Get content type from response or default to image
      const contentType = response.ContentType || 'image/webp'
      
      console.log(`[Image Proxy] [SUCCESS] Successfully fetched image: ${contentType}, ${body.length} bytes`)

      // Convert Uint8Array to Buffer for NextResponse compatibility
      const buffer = Buffer.from(body) as Buffer

      // Return the image with proper headers to prevent downloads
      return new NextResponse(buffer as BodyInit, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Length': buffer.length.toString(),
          'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
          'Access-Control-Allow-Origin': '*', // Allow CORS
          'Content-Disposition': 'inline', // Prevent download, display inline only
          'X-Content-Type-Options': 'nosniff', // Prevent MIME type sniffing
        },
      })
    } catch (err: any) {
      const cleanCid = cid.replace(/^ipfs:\/\//, '').replace(/^\/ipfs\//, '')
      console.error('[Image Proxy] Error fetching image from Filebase:', {
        error: err.message,
        code: err.Code,
        name: err.name,
        cid: cleanCid,
      })
      
      // Try multiple IPFS gateways as fallback
      const gatewayUrls = [
        `https://${cleanCid}.ipfs.filebase.io`,
        `https://${cleanCid}.ipfs.w3s.link`,
        `https://ipfs.io/ipfs/${cleanCid}`,
        `https://cloudflare-ipfs.com/ipfs/${cleanCid}`,
        `https://dweb.link/ipfs/${cleanCid}`,
      ]
      
      for (const gatewayUrl of gatewayUrls) {
        try {
          console.log(`[Image Proxy] Trying gateway fallback: ${gatewayUrl}`)
          
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout
          
          const response = await fetch(gatewayUrl, {
            headers: {
              'Accept': 'image/*',
            },
            signal: controller.signal,
          })
          
          clearTimeout(timeoutId)
          
          if (response.ok) {
            const contentType = response.headers.get('content-type')
            
            // Only proceed if it's actually an image
            if (contentType && contentType.startsWith('image/')) {
              const imageBuffer = await response.arrayBuffer()
              const buffer = Buffer.from(imageBuffer)
              
              console.log(`[Image Proxy] [SUCCESS] Fetched from gateway: ${gatewayUrl}, ${buffer.length} bytes`)
              
              return new NextResponse(buffer as BodyInit, {
                status: 200,
                headers: {
                  'Content-Type': contentType,
                  'Content-Length': buffer.length.toString(),
                  'Cache-Control': 'public, max-age=3600',
                  'Access-Control-Allow-Origin': '*',
                  'Content-Disposition': 'inline', // Prevent download, display inline only
                  'X-Content-Type-Options': 'nosniff', // Prevent MIME type sniffing
                },
              })
            } else {
              console.warn(`[Image Proxy] Gateway returned non-image content type: ${contentType}`)
            }
          } else {
            console.warn(`[Image Proxy] Gateway returned status ${response.status} for ${gatewayUrl}`)
          }
        } catch (gatewayErr: any) {
          if (gatewayErr.name === 'AbortError') {
            console.warn(`[Image Proxy] Gateway timeout: ${gatewayUrl}`)
          } else {
            console.warn(`[Image Proxy] Gateway error for ${gatewayUrl}:`, gatewayErr.message)
          }
          // Continue to next gateway
        }
      }
      
      // All gateways failed
      console.error(`[Image Proxy] All gateways failed for CID: ${cleanCid}`)
      return NextResponse.json(
        { 
          error: 'Failed to fetch image from Filebase and all IPFS gateways',
          cid: cleanCid,
          message: err.message || 'Image not found'
        },
        { status: 404 }
      )
    }
  } catch (err: any) {
    console.error('Filebase image proxy error:', err)
    return NextResponse.json(
      { error: err?.message || 'Proxy failed' },
      { status: 500 }
    )
  }
}

