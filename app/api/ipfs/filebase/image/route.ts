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
  forcePathStyle: false,
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
      
      console.log(`[Image Proxy] ✅ Successfully fetched image: ${contentType}, ${body.length} bytes`)

      // Return the image with proper headers
      return new NextResponse(body, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Length': body.length.toString(),
          'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
          'Access-Control-Allow-Origin': '*', // Allow CORS
        },
      })
    } catch (err: any) {
      console.error('[Image Proxy] Error fetching image from Filebase:', {
        error: err.message,
        code: err.Code,
        name: err.name,
        cid: cid.replace(/^ipfs:\/\//, '').replace(/^\/ipfs\//, ''),
      })
      
      // Try IPFS gateway as fallback
      try {
        const cleanCid = cid.replace(/^ipfs:\/\//, '').replace(/^\/ipfs\//, '')
        const gatewayUrl = `https://${cleanCid}.ipfs.filebase.io`
        console.log(`Trying Filebase gateway as fallback: ${gatewayUrl}`)
        
        const response = await fetch(gatewayUrl, {
          headers: {
            'Accept': 'image/*',
          },
        })
        
        if (response.ok) {
          const imageBuffer = await response.arrayBuffer()
          const contentType = response.headers.get('content-type') || 'image/webp'
          
          return new NextResponse(imageBuffer, {
            status: 200,
            headers: {
              'Content-Type': contentType,
              'Content-Length': imageBuffer.byteLength.toString(),
              'Cache-Control': 'public, max-age=3600',
              'Access-Control-Allow-Origin': '*',
            },
          })
        }
      } catch (gatewayErr) {
        console.error('Gateway fallback also failed:', gatewayErr)
      }
      
      return NextResponse.json(
        { error: err.message || 'Failed to fetch image from Filebase' },
        { status: 500 }
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

