import { NextRequest, NextResponse } from 'next/server'
import { compressAndWatermark } from '@/lib/image-utils'
import sharp from 'sharp'

export const runtime = 'nodejs'

/**
 * Test endpoint to verify watermark and image quality reduction
 * POST with an image file to test
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    
    const originalMeta = await sharp(buffer).metadata()
    console.log('Original image:', {
      width: originalMeta.width,
      height: originalMeta.height,
      format: originalMeta.format,
      size: buffer.length,
    })
    
    // Process with watermark
    const processed = await compressAndWatermark(buffer, {
      maxWidth: 1200,
      maxHeight: 1200,
      quality: 55,
      watermarkText: 'Blockpay – preview',
      watermarkOpacity: 0.6,
    })
    
    const processedMeta = await sharp(processed).metadata()
    console.log('Processed image:', {
      width: processedMeta.width,
      height: processedMeta.height,
      format: processedMeta.format,
      size: processed.length,
    })
    
    // Convert to Buffer and add type assertion for NextResponse compatibility
    const responseBuffer: Buffer = Buffer.isBuffer(processed) ? processed : Buffer.from(processed as ArrayBufferLike)
    
    return new NextResponse(responseBuffer as BodyInit, {
      headers: {
        'Content-Type': 'image/webp',
        'Content-Length': responseBuffer.length.toString(),
      },
    })
  } catch (err: any) {
    console.error('Test watermark error:', err)
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    )
  }
}



