import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const REGION = 'us-east-1'
const FILEBASE_ENDPOINT = process.env.FILEBASE_ENDPOINT || 'https://s3.filebase.com'
const BUCKET = process.env.FILEBASE_BUCKET

if (!BUCKET) {
  throw new Error('FILEBASE_BUCKET must be set in environment variables')
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

export async function uploadToFilebase(params: {
  key: string
  body: Buffer
  contentType?: string
}) {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: params.key,
    Body: params.body,
    ContentType: params.contentType,
    Metadata: {
      'uploaded-by': 'blockpay',
    },
  })

  const res = await s3Client.send(command)

  return {
    etag: res.ETag,
    key: params.key,
    url: `https://ipfs.filebase.io/ipfs/${params.key}`,
  }
}


