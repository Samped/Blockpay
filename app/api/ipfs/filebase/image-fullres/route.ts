import { NextRequest, NextResponse } from 'next/server'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'

export const runtime = 'nodejs'

const REGION = 'us-east-1'
const FILEBASE_ENDPOINT = process.env.FILEBASE_ENDPOINT || 'https://s3.filebase.com'
const BUCKET = process.env.FILEBASE_BUCKET

if (!BUCKET) {
  console.warn('FILEBASE_BUCKET not set - Filebase full-res image proxy will not work')
}

const s3Client = new S3Client({
  region: REGION,
  endpoint: FILEBASE_ENDPOINT,
  credentials: {
    accessKeyId: process.env.FILEBASE_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.FILEBASE_SECRET_ACCESS_KEY || '',
  },
  forcePathStyle: true,
})

/**
 * Proxy FULL RESOLUTION image from Filebase by CID
 * This route NEVER processes/watermarks images - serves them exactly as stored
 * Use this for completed jobs to get the original high-quality, watermark-free image
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
      console.log(`[FullRes Image Proxy] 🔍 Fetching ORIGINAL (unwatermarked) image from Filebase with CID: ${cleanCid}`)
      console.log(`[FullRes Image Proxy] ⚠️ This route NEVER processes or watermarks images - serving exactly as stored`)
      
      const command = new GetObjectCommand({
        Bucket: BUCKET,
        Key: cleanCid,
      })

      const response = await s3Client.send(command)
      const body = await response.Body?.transformToByteArray()
      
      if (!body || body.length === 0) {
        console.error(`[FullRes Image Proxy] ❌ Empty response from Filebase for CID: ${cleanCid}`)
        return NextResponse.json(
          { error: 'Empty response from Filebase', cid: cleanCid },
          { status: 404 }
        )
      }

      // Get content type from response
      const contentType = response.ContentType || 'image/webp'
      
      console.log(`[FullRes Image Proxy] ✅ [SUCCESS] Serving ORIGINAL image (NO WATERMARK, NO PROCESSING):`)
      console.log(`[FullRes Image Proxy]    - Content-Type: ${contentType}`)
      console.log(`[FullRes Image Proxy]    - Size: ${body.length} bytes`)
      console.log(`[FullRes Image Proxy]    - CID: ${cleanCid}`)

      // Convert Uint8Array to Buffer for NextResponse compatibility
      const buffer = Buffer.from(body) as Buffer

      // Return the image EXACTLY as stored - NO processing, NO watermarking, NO compression
      // This is the original file that was uploaded with type='submission-full-res'
      return new NextResponse(buffer as BodyInit, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Length': buffer.length.toString(),
          'Cache-Control': 'no-cache, no-store, must-revalidate', // Don't cache - ensure fresh image
          'Pragma': 'no-cache',
          'Expires': '0',
          'Access-Control-Allow-Origin': '*',
          'Content-Disposition': 'inline',
          'X-Content-Type-Options': 'nosniff',
          'X-Image-Type': 'full-resolution-no-watermark', // Custom header to identify this is full-res
        },
      })
    } catch (err: any) {
      const cleanCid = cid.replace(/^ipfs:\/\//, '').replace(/^\/ipfs\//, '')
      console.error('[FullRes Image Proxy] Error fetching image from Filebase:', {
        error: err.message,
        code: err.Code,
        name: err.name,
        cid: cleanCid,
      })
      
      // Try direct IPFS gateway as fallback
      try {
        const gatewayUrl = `https://${cleanCid}.ipfs.filebase.io`
        console.log(`[FullRes Image Proxy] Trying direct gateway: ${gatewayUrl}`)
        
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 10000)
        
        const response = await fetch(gatewayUrl, {
          headers: {
            'Accept': 'image/*',
          },
          signal: controller.signal,
        })
        
        clearTimeout(timeoutId)
        
        if (response.ok) {
          const contentType = response.headers.get('content-type')
          if (contentType && contentType.startsWith('image/')) {
            const imageBuffer = await response.arrayBuffer()
            
            return new NextResponse(imageBuffer, {
              status: 200,
              headers: {
                'Content-Type': contentType,
                'Content-Length': imageBuffer.byteLength.toString(),
                'Cache-Control': 'public, max-age=86400',
                'Access-Control-Allow-Origin': '*',
                'Content-Disposition': 'inline',
                'X-Content-Type-Options': 'nosniff',
              },
            })
          }
        }
      } catch (gatewayErr: any) {
        console.error('[FullRes Image Proxy] Gateway fallback failed:', gatewayErr.message)
      }
      
      return NextResponse.json(
        { 
          error: 'Failed to fetch full resolution image',
          cid: cleanCid,
          message: err.message || 'Image not found'
        },
        { status: 404 }
      )
    }
  } catch (err: any) {
    console.error('FullRes image proxy error:', err)
    return NextResponse.json(
      { error: err?.message || 'Proxy failed' },
      { status: 500 }
    )
  }
}

