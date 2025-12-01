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
    maxWidth = 2000,
    maxHeight = 2000,
    quality = 80,
    watermarkText = 'Blockpay – preview',
    watermarkOpacity = 0.35,
  } = opts

  let image = sharp(buffer)
  const meta = await image.metadata()

  if ((meta.width && meta.width > maxWidth) || (meta.height && meta.height > maxHeight)) {
    image = image.resize({
      width: maxWidth,
      height: maxHeight,
      fit: 'inside',
      withoutEnlargement: true,
    })
  }

  // Convert to webp for better compression
  image = image.webp({ quality })

  const svgWatermark = `
    <svg width="800" height="200">
      <rect x="0" y="0" width="100%" height="100%" fill="transparent"/>
      <text x="50%" y="50%" font-size="36" dominant-baseline="middle" text-anchor="middle" fill="white" fill-opacity="${watermarkOpacity}" font-family="Arial, Helvetica, sans-serif">
        ${escapeHtml(watermarkText)}
      </text>
    </svg>
  `

  const svgBuffer = Buffer.from(svgWatermark)

  const final = await image
    .composite([
      {
        input: svgBuffer,
        gravity: 'southeast',
        blend: 'over',
      },
    ])
    .toBuffer()

  return final
}

function escapeHtml(str: string) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}


