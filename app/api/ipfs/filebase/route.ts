import { NextRequest, NextResponse } from 'next/server'
import { uploadToFilebase } from '@/lib/filebase-client'
import { compressAndWatermark } from '@/lib/image-utils'
import { scanBufferForVirus } from '@/lib/virus-scan'
import { computeIpfsCid } from '@/lib/ipfs-helpers'
import { logUploadToIntuition } from '@/lib/intuition-logger'

// Ensure this runs in the Node.js runtime (required for sharp, node-clam, aws-sdk)
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()

    const file = formData.get('file')
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    const mime = file.type || ''
    const size = file.size ?? 0

    const maxSize =
      Number(process.env.MAX_UPLOAD_BYTES) && Number.isFinite(Number(process.env.MAX_UPLOAD_BYTES))
        ? Number(process.env.MAX_UPLOAD_BYTES)
        : 10_000_000 // 10 MB default

    if (size <= 0) {
      return NextResponse.json({ error: 'Empty file not allowed' }, { status: 400 })
    }

    if (size > maxSize) {
      return NextResponse.json(
        { error: 'File too large', maxBytes: maxSize, actualBytes: size },
        { status: 413 }
      )
    }

    const allowedMimes = (process.env.ALLOWED_MIMETYPES ||
      'image/jpeg,image/png,image/webp,application/zip,application/pdf,application/json'
    )
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean)

    // Support wildcard in ALLOWED_MIMETYPES (e.g. "*") and always allow JSON metadata
    const allowAll = allowedMimes.includes('*')
    if (!allowAll && mime !== 'application/json' && !allowedMimes.includes(mime)) {
      return NextResponse.json({ error: 'File type not allowed', mime }, { status: 415 })
    }

    // Convert Web File to Node.js Buffer
    const arrayBuffer = await file.arrayBuffer()
    // Explicitly cast to ensure correct Buffer type (not Buffer<ArrayBufferLike>)
    const buffer: Buffer = Buffer.from(arrayBuffer)

    // 1) Virus scan (if enabled)
    const virusScanEnabled = process.env.ENABLE_VIRUS_SCAN !== 'false'
    if (virusScanEnabled) {
      const infected = await scanBufferForVirus(buffer)
      if (infected) {
        return NextResponse.json({ error: 'File failed virus scan' }, { status: 400 })
      }
    }

    // 2) Image processing: compress + watermark if it's an image
    let finalBuffer = buffer
    if (mime.startsWith('image/')) {
      // For submission previews, use lower quality and smaller dimensions
      // For full resolution images, skip compression/watermarking
      const uploadType = formData.get('type') as string
      const isSubmissionPreview = uploadType?.includes('submission-preview')
      const isFullRes = uploadType?.includes('submission-full-res')
      
      console.log(`[Upload] Image detected: type="${uploadType}", isSubmissionPreview=${isSubmissionPreview}, isFullRes=${isFullRes}`)
      console.log(`[Upload] CRITICAL: If isFullRes=${isFullRes}, image will be uploaded WITHOUT watermark`)
      
      // Skip processing for full resolution images - upload as-is
      if (isFullRes) {
        console.log(`[Upload] FULL RESOLUTION IMAGE DETECTED`)
        console.log(`[Upload] Uploading original without ANY processing (no compression, no watermark)`)
        console.log(`[Upload] Original buffer size: ${buffer.length} bytes`)
        console.log(`[Upload] This image will be stored EXACTLY as received - NO watermark will be added`)
        // Keep original buffer, no processing - upload exactly as received
        finalBuffer = buffer
        console.log(`[Upload] Full resolution image will be uploaded as-is: ${finalBuffer.length} bytes`)
        console.log(`[Upload] END FULL RESOLUTION UPLOAD`)
      } else {
        const opts = {
          maxWidth: isSubmissionPreview 
            ? (Number(process.env.IMAGE_MAX_WIDTH) || 600) // Much lower for previews to prevent stealing
            : (Number(process.env.IMAGE_MAX_WIDTH) || 2000),
          maxHeight: isSubmissionPreview
            ? (Number(process.env.IMAGE_MAX_HEIGHT) || 600) // Much lower for previews to prevent stealing
            : (Number(process.env.IMAGE_MAX_HEIGHT) || 2000),
          quality: isSubmissionPreview
            ? (Number(process.env.IMAGE_QUALITY) || 15) // Much lower quality for previews (15% instead of 30%)
            : (Number(process.env.IMAGE_QUALITY) || 80),
          watermarkText: process.env.WATERMARK_TEXT || 'Blockpay – preview',
          watermarkOpacity: isSubmissionPreview
            ? (Number(process.env.WATERMARK_OPACITY) || 0.8) // More visible watermark for previews (80% opacity)
            : (Number(process.env.WATERMARK_OPACITY) || 0.6),
        }
        
        console.log(`[Upload] Processing image with options:`, opts)
        
        finalBuffer = await compressAndWatermark(buffer, opts)
        
        console.log(`[Upload] [SUCCESS] Image processed: ${buffer.length} bytes → ${finalBuffer.length} bytes`)
      }
    }

    // 3) Compute IPFS CID locally
    const cid = await computeIpfsCid(finalBuffer)

    // 4) Upload to Filebase using CID as key (idempotent)
    const key = cid
    const uploadRes = await uploadToFilebase({
      key,
      body: finalBuffer,
      contentType: mime,
    })

    // 5) Log upload to Intuition (best-effort)
    const metadata = {
      type: (formData.get('type') as string | null) || 'asset',
      filename: file.name,
      contentType: mime,
      cid: `ipfs://${cid}`,
      size: finalBuffer.length,
      uploader: (formData.get('uploader') as string | null) || 'unknown',
      jobId: (formData.get('jobId') as string | null) || null,
      createdAt: new Date().toISOString(),
    }

    const intuitionResult = await logUploadToIntuition(metadata)

    return NextResponse.json({
      success: true,
      cid: `ipfs://${cid}`,
      httpUrl: uploadRes.url,
      filebase: uploadRes,
      intuition: intuitionResult,
    })
  } catch (err: any) {
    console.error('Filebase upload error:', err)
    return NextResponse.json(
      { error: err?.message || 'Upload failed' },
      { status: 500 }
    )
  }
}


