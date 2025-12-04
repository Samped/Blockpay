import { NextRequest, NextResponse } from 'next/server'
import { S3Client, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'

// Ensure this runs in the Node.js runtime (required for aws-sdk)
export const runtime = 'nodejs'

const REGION = 'us-east-1'
const FILEBASE_ENDPOINT = process.env.FILEBASE_ENDPOINT || 'https://s3.filebase.com'
const BUCKET = process.env.FILEBASE_BUCKET

if (!BUCKET) {
  console.warn('FILEBASE_BUCKET not set - Filebase fetch will not work')
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
 * Fetch metadata from Filebase by CID
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const cid = searchParams.get('cid')
    const jobId = searchParams.get('jobId')
    const deadline = searchParams.get('deadline')
    const budget = searchParams.get('budget')

    if (!BUCKET) {
      return NextResponse.json(
        { error: 'Filebase not configured' },
        { status: 500 }
      )
    }

    // If CID is provided, fetch directly
    if (cid) {
      try {
        const cleanCid = cid.replace(/^ipfs:\/\//, '').replace(/^\/ipfs\//, '')
        console.log(`Fetching from Filebase with CID: ${cleanCid}`)
        
        const command = new GetObjectCommand({
          Bucket: BUCKET,
          Key: cleanCid,
        })

        const response = await s3Client.send(command)
        const body = await response.Body?.transformToByteArray()
        if (!body) {
          return NextResponse.json({ error: 'Empty response' }, { status: 404 })
        }

        const text = new TextDecoder().decode(body)
        const metadata = JSON.parse(text)
        
        console.log('Successfully fetched metadata from Filebase:', metadata)

        return NextResponse.json({
          success: true,
          metadata,
          cid: cleanCid,
        })
      } catch (err: any) {
        console.error('Error fetching from Filebase by CID:', err)
        // If direct fetch fails, try IPFS gateway as fallback
        try {
          const cleanCid = cid.replace(/^ipfs:\/\//, '').replace(/^\/ipfs\//, '')
          const gatewayUrl = `https://${cleanCid}.ipfs.filebase.io`
          const response = await fetch(gatewayUrl)
          if (response.ok) {
            const metadata = await response.json()
            return NextResponse.json({
              success: true,
              metadata,
              cid: cleanCid,
              source: 'gateway',
            })
          }
        } catch (gatewayErr) {
          console.error('Gateway fallback also failed:', gatewayErr)
        }
        
        return NextResponse.json(
          { error: err.message || 'Failed to fetch from Filebase' },
          { status: 500 }
        )
      }
    }

    // If jobId, deadline, or budget provided, try to find matching metadata
    if (jobId || deadline || budget) {
      try {
        console.log(`Searching Filebase for metadata with deadline=${deadline}, budget=${budget}, jobId=${jobId}`)
        
        // List objects in bucket (limited to recent ones)
        const listCommand = new ListObjectsV2Command({
          Bucket: BUCKET,
          MaxKeys: 200, // Increase limit to search more objects
        })

        const listResponse = await s3Client.send(listCommand)
        const objects = listResponse.Contents || []
        
        console.log(`Found ${objects.length} objects in Filebase bucket`)

        // Array to collect matching submission metadata (if searching by jobId)
        const matchingSubmissionMetadata: any[] = []

        // Try to fetch and match metadata
        for (const obj of objects) {
          if (!obj.Key) continue

          // Skip if it's not likely to be JSON (based on size or name)
          if (obj.Size && obj.Size > 100000) continue // Skip large files

          try {
            const getCommand = new GetObjectCommand({
              Bucket: BUCKET,
              Key: obj.Key,
            })

            const response = await s3Client.send(getCommand)
            const body = await response.Body?.transformToByteArray()
            if (!body) continue

            const text = new TextDecoder().decode(body)
            
            // Check if it's JSON
            let metadata
            try {
              metadata = JSON.parse(text)
            } catch {
              continue // Not JSON, skip
            }

            // Check if it's job metadata (has title, description, deadline, budget)
            const isJobMetadata = metadata.title && metadata.deadline
            
            // Check if it's submission metadata (has jobId, previewCID)
            const isSubmissionMetadata = metadata.jobId && metadata.previewCID
            
            if (!isJobMetadata && !isSubmissionMetadata) {
              continue // Not job or submission metadata
            }

            let matches = false

            // Handle job metadata matching
            if (isJobMetadata) {
              console.log(`Checking job metadata with deadline=${metadata.deadline}, budget=${metadata.budget}`)

              // Match by deadline (most reliable identifier)
              // Allow up to 1 hour difference for timezone issues
              if (deadline) {
                const deadlineNum = Number(deadline)
                const metadataDeadlineNum = Number(metadata.deadline)
                const deadlineDiff = Math.abs(metadataDeadlineNum - deadlineNum)
                const deadlineMatch = metadataDeadlineNum === deadlineNum ||
                                     deadlineDiff < 3600 // Allow 1 hour difference for timezone
                
                console.log(`   Comparing deadlines: metadata=${metadataDeadlineNum}, contract=${deadlineNum}, diff=${deadlineDiff}s (${Math.floor(deadlineDiff/60)}min)`)
                
                if (deadlineMatch) {
                  matches = true
                  console.log(`[SUCCESS] Deadline match found: ${metadataDeadlineNum} vs ${deadlineNum} (diff: ${deadlineDiff}s)`)
                }
              }
              
              // If no deadline provided, try budget matching
              if (!deadline && budget) {
                const budgetNum = Number(budget)
                const metadataBudgetNum = Number(metadata.budget)
                const budgetMatch = metadata.budget === budget ||
                                  Math.abs(metadataBudgetNum - budgetNum) < 0.01 // Allow small difference
                matches = budgetMatch
              }
              
              // If both provided, deadline takes priority but budget can help narrow down
              if (deadline && budget && matches) {
                // Already matched by deadline, but log budget for info
                console.log(`Budget info: metadata=${metadata.budget}, contract=${budget}`)
              }

              if (matches) {
                console.log(`[SUCCESS] Found matching job metadata in Filebase:`, metadata)
                return NextResponse.json({
                  success: true,
                  metadata,
                  cid: obj.Key,
                })
              }
            }

            // Handle submission metadata matching
            if (isSubmissionMetadata && jobId) {
              console.log(`Checking submission metadata with jobId=${metadata.jobId}`)
              
              if (metadata.jobId === jobId.toString() || metadata.jobId === jobId) {
                matchingSubmissionMetadata.push({
                  ...metadata,
                  cid: obj.Key,
                })
                console.log(`[SUCCESS] Found matching submission metadata in Filebase:`, metadata)
              }
            }
          } catch (parseErr: any) {
            // Not JSON or not metadata, skip
            console.log(`Skipping ${obj.Key}: ${parseErr.message}`)
            continue
          }
        }

        // If we found submission metadata, return it as an array
        if (matchingSubmissionMetadata.length > 0) {
          console.log(`Found ${matchingSubmissionMetadata.length} submission metadata entries`)
          return NextResponse.json({
            success: true,
            metadata: matchingSubmissionMetadata.length === 1 ? matchingSubmissionMetadata[0] : matchingSubmissionMetadata,
            cid: matchingSubmissionMetadata[0]?.cid,
          })
        }

        console.log('No matching metadata found in Filebase')
        return NextResponse.json(
          { error: 'No matching metadata found' },
          { status: 404 }
        )
      } catch (err: any) {
        console.error('Error searching Filebase:', err)
        return NextResponse.json(
          { error: err.message || 'Failed to search Filebase' },
          { status: 500 }
        )
      }
    }

    return NextResponse.json(
      { error: 'Please provide cid, or jobId/deadline/budget to search' },
      { status: 400 }
    )
  } catch (err: any) {
    console.error('Filebase fetch error:', err)
    return NextResponse.json(
      { error: err?.message || 'Fetch failed' },
      { status: 500 }
    )
  }
}

