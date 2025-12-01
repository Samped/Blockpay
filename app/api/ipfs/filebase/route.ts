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
    const buffer = Buffer.from(arrayBuffer)

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
      finalBuffer = await compressAndWatermark(buffer, {
        maxWidth: Number(process.env.IMAGE_MAX_WIDTH) || 2000,
        maxHeight: Number(process.env.IMAGE_MAX_HEIGHT) || 2000,
        quality: Number(process.env.IMAGE_QUALITY) || 80,
        watermarkText: process.env.WATERMARK_TEXT || 'Blockpay – preview',
        watermarkOpacity: Number(process.env.WATERMARK_OPACITY) || 0.35,
      })
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


