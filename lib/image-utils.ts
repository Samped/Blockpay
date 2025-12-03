import sharp from 'sharp'

interface ImageOptions {
  maxWidth?: number
  maxHeight?: number
  quality?: number
  watermarkText?: string
  watermarkOpacity?: number
}

export async function compressAndWatermark(
  buffer: Buffer,
  opts: ImageOptions = {}
): Promise<Buffer> {
  const {
    maxWidth = 1200, // Reduced from 2000 for lower quality previews
    maxHeight = 1200, // Reduced from 2000 for lower quality previews
    quality = 55, // Reduced from 80 for lower quality previews
    watermarkText = 'Blockpay – preview',
    watermarkOpacity = 0.6, // Increased opacity for better visibility
  } = opts

  let image = sharp(buffer)
  const meta = await image.metadata()
  const originalWidth = meta.width ?? maxWidth
  const originalHeight = meta.height ?? maxHeight
  const originalSize = buffer.length

  console.log(`[Image] 📥 Original: ${originalWidth}x${originalHeight}, ${(originalSize / 1024).toFixed(1)}KB, Target max: ${maxWidth}x${maxHeight}, Quality: ${quality}`)

  // Step 1: Resize the image to max dimensions (reduces quality)
  // Force resize to exactly maxWidth x maxHeight to ensure quality reduction
  const resizedBuffer = await image
    .resize({
      width: maxWidth,
      height: maxHeight,
      fit: 'inside', // Maintain aspect ratio but fit within bounds
      withoutEnlargement: false, // Allow enlarging if needed (shouldn't happen)
    })
    .png() // Convert to PNG first to ensure we have the resized dimensions
    .toBuffer()
  
  const resizedSharp = sharp(resizedBuffer)
  const resizedMeta = await resizedSharp.metadata()
  const baseWidth = resizedMeta.width ?? maxWidth
  const baseHeight = resizedMeta.height ?? maxHeight
  
  const pixelReduction = ((1 - (baseWidth * baseHeight) / (originalWidth * originalHeight)) * 100).toFixed(1)
  console.log(`[Image] ✅ Resized to: ${baseWidth}x${baseHeight} (reduced by ${pixelReduction}% pixels)`)
  console.log(`[Image] 📊 Size: ${originalWidth}x${originalHeight} → ${baseWidth}x${baseHeight}`)
  
  // Use the resized image
  image = resizedSharp

  // Create a tiled watermark pattern that covers the entire image
  // Use a single large SVG with all watermark text elements positioned correctly
  const spacingX = Math.max(200, Math.min(300, Math.floor(baseWidth / 4))) // Spacing between watermarks
  const spacingY = Math.max(100, Math.min(150, Math.floor(baseHeight / 5))) // Spacing between watermarks
  
  // Calculate font size
  const fontSize = Math.max(32, Math.min(48, Math.floor(spacingX / 6)))
  
  console.log(`[Watermark] Creating tiled watermark: ${baseWidth}x${baseHeight}, spacing: ${spacingX}x${spacingY}, fontSize: ${fontSize}`)
  
  // Calculate how many watermarks we need
  const countX = Math.ceil(baseWidth / spacingX) + 2
  const countY = Math.ceil(baseHeight / spacingY) + 2
  
  console.log(`[Watermark] Will create ${countX * countY} watermarks in a ${countX}x${countY} grid`)
  
  // Create all watermark text elements in a single SVG
  const watermarkTexts = []
  for (let y = -1; y <= countY; y++) {
    for (let x = -1; x <= countX; x++) {
      const centerX = x * spacingX + (spacingX / 2)
      const centerY = y * spacingY + (spacingY / 2)
      
      // Only add if within or near the image bounds
      if (centerX > -spacingX && centerX < baseWidth + spacingX && 
          centerY > -spacingY && centerY < baseHeight + spacingY) {
        watermarkTexts.push(
          `<text 
            x="${centerX}" 
            y="${centerY}" 
            font-size="${fontSize}" 
            dominant-baseline="middle" 
            text-anchor="middle" 
            fill="white" 
            fill-opacity="${watermarkOpacity}" 
            font-family="Arial, Helvetica, sans-serif"
            font-weight="bold"
            transform="rotate(-45 ${centerX} ${centerY})"
          >${escapeHtml(watermarkText)}</text>`
        )
      }
    }
  }
  
  console.log(`[Watermark] Created ${watermarkTexts.length} watermark text elements`)
  
  // Create a single large SVG with all watermarks
  const fullWatermarkSvg = `
    <svg width="${baseWidth}" height="${baseHeight}" xmlns="http://www.w3.org/2000/svg">
      ${watermarkTexts.join('\n      ')}
    </svg>
  `
  
  const watermarkBuffer = Buffer.from(fullWatermarkSvg)
  
  console.log(`[Watermark] SVG created: ${watermarkBuffer.length} bytes, ${watermarkTexts.length} text elements`)

  // Create watermark overlay from the SVG
  const watermarkOverlay = await sharp(watermarkBuffer)
    .resize(baseWidth, baseHeight, {
      fit: 'fill', // Force exact dimensions
    })
    .png()
    .toBuffer()

  console.log(`[Watermark] ✅ Watermark overlay created: ${baseWidth}x${baseHeight}, ${watermarkOverlay.length} bytes, ${watermarkTexts.length} watermarks`)

  // Composite the tiled watermark overlay onto the image
  const watermarkedImage = await image
    .composite([
      {
        input: watermarkOverlay,
        blend: 'over',
      },
    ])
    .toBuffer()
  
  // Convert to webp with lower quality after watermarking
  const final = await sharp(watermarkedImage)
    .webp({ 
      quality: quality, // Low quality for previews
      effort: 3, // Lower effort = faster compression
      smartSubsample: true, // Better quality at lower file sizes
    })
    .toBuffer()
  
  const finalMeta = await sharp(final).metadata()
  const sizeReduction = ((1 - final.length / originalSize) * 100).toFixed(1)
  console.log(`[Watermark] ✅ Final image: ${finalMeta.width}x${finalMeta.height}, ${(final.length / 1024).toFixed(1)}KB, format: ${finalMeta.format}, quality: ${quality}`)
  console.log(`[Watermark] ✅ Size reduction: ${(originalSize / 1024).toFixed(1)}KB → ${(final.length / 1024).toFixed(1)}KB (${sizeReduction}% smaller)`)
  console.log(`[Watermark] ✅ Dimensions: ${originalWidth}x${originalHeight} → ${finalMeta.width}x${finalMeta.height}`)
  console.log(`[Watermark] ✅ Created ${watermarkTexts.length} watermark instances across the image`)

  return final
}

function escapeHtml(str: string) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}


