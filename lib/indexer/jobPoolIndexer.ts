/**
 * JobPool Indexer / Relayer Service
 * 
 * This service listens to JobPool contract events and creates
 * Atoms and Triples in Intuition Knowledge Graph
 * 
 * Run this as a background service (e.g., using PM2, Docker, or a cloud function)
 */

import { createPublicClient, http, parseAbiItem } from 'viem'
import { intuitionClient } from '../intuitionClient'

// Configuration
const RPC_URL = process.env.RPC_URL || 'https://testnet.rpc.intuition.systems/http'
const JOB_POOL_ADDRESS = (process.env.JOB_POOL_ADDRESS || '0x8A21eAa3271d546471435804F2a1c90b80BD7B95') as `0x${string}`
const CHAIN_ID = parseInt(process.env.CHAIN_ID || '13579') // Intuition Testnet

// Create public client
const publicClient = createPublicClient({
  chain: {
    id: CHAIN_ID,
    name: 'Intuition Testnet',
    network: 'intuition-testnet',
    nativeCurrency: { name: 'tTRUST', symbol: 'TRUST', decimals: 18 },
    rpcUrls: {
      default: { http: [RPC_URL] },
      public: { http: [RPC_URL] },
    },
  },
  transport: http(RPC_URL),
})

/**
 * Find or create a profile atom for an address
 */
async function findOrCreateProfileAtom(address: string): Promise<string | null> {
  try {
    // Try to find existing profile atom (shape depends on IntuitionClient types)
    const profileData: any = await intuitionClient.getUserProfileData(address)
    const atomId =
      profileData?.atomId ||
      profileData?.atom_id ||
      profileData?.atom?.id ||
      profileData?.atom?.term_id

    if (atomId && typeof atomId === 'string') {
      return atomId
    }

    // If not found, create a basic profile atom
    // Note: This requires a wallet client with signing capability
    // In a production indexer, you'd use a dedicated service account
    console.warn(`Profile atom not found for ${address}, skipping triple creation`)
    return null
  } catch (error) {
    console.error(`Error finding profile atom for ${address}:`, error)
    return null
  }
}

/**
 * Create a Triple in Intuition
 * Note: This is a placeholder - actual implementation depends on your Intuition SDK
 */
async function createTriple(
  subjectAtom: string,
  predicate: string,
  objectAtom: string
): Promise<boolean> {
  try {
    // TODO: Implement actual triple creation using Intuition SDK or Multivote contract
    // Example:
    // await intuitionClient.createTriple(subjectAtom, predicate, objectAtom)
    
    console.log(`Creating triple: ${subjectAtom} --[${predicate}]--> ${objectAtom}`)
    
    // For now, just log it
    // In production, you'd call the Intuition Multivote contract or GraphQL API
    return true
  } catch (error) {
    console.error('Error creating triple:', error)
    return false
  }
}

/**
 * Handle JobCreated event
 */
async function handleJobCreated(
  jobId: bigint,
  creator: `0x${string}`,
  payment: bigint,
  deadline: bigint
) {
  console.log(
    `[JobCreated] Job #${jobId} by ${creator}, payment: ${payment.toString()}, deadline: ${deadline.toString()}`
  )

  try {
    // Find creator's profile atom
    const creatorProfile = await findOrCreateProfileAtom(creator.toLowerCase())

    // NOTE: The new JobPool contract doesn't emit a jobAtom bytes32, so we can't directly
    // link to a specific Job Atom here. You can extend this by:
    // - keeping an off-chain mapping jobId -> jobAtom, or
    // - deriving the atom from IPFS metadata.
    //
    // For now we just ensure the creator profile exists and log.
    if (creatorProfile) {
      console.log(`Creator profile atom for ${creator}: ${creatorProfile}`)
    }
  } catch (error) {
    console.error(`Error handling JobCreated for job ${jobId}:`, error)
  }
}

/**
 * Handle WorkSubmitted event
 */
async function handleWorkSubmitted(
  jobId: bigint,
  worker: `0x${string}`,
  submissionHash: `0x${string}`
) {
  console.log(`[WorkSubmitted] Job #${jobId} by ${worker}, hash: ${submissionHash}`)

  try {
    const workerProfile = await findOrCreateProfileAtom(worker.toLowerCase())

    // The new JobPool contract stores submissionHash as bytes32.
    // To create triples, you'll want an off-chain mapping from jobId
    // to a Submission Atom ID.
    if (workerProfile) {
      console.log(`Worker profile atom for ${worker}: ${workerProfile}`)
    }
  } catch (error) {
    console.error(`Error handling WorkSubmitted for job ${jobId}:`, error)
  }
}

/**
 * Handle JobCompleted event
 */
async function handleJobCompleted(
  jobId: bigint,
  worker: `0x${string}`,
  workerPayment: bigint,
  platformFee: bigint
) {
  console.log(
    `[JobCompleted] Job #${jobId}, Worker: ${worker}, Payment: ${workerPayment.toString()}, Fee: ${platformFee.toString()}`
  )

  try {
    const workerProfile = await findOrCreateProfileAtom(worker.toLowerCase())

    // Here you might:
    // - link Job Atom -> Worker profile via "completedBy"
    // - emit trust votes based on workerPayment
    // That requires knowing the jobAtom off-chain.
    if (workerProfile) {
      console.log(`Worker profile atom for completed job: ${workerProfile}`)
    }
  } catch (error) {
    console.error(`Error handling JobCompleted for job ${jobId}:`, error)
  }
}

/**
 * Start listening to JobPool events
 */
export async function startJobPoolIndexer(fromBlock?: bigint) {
  console.log('🚀 Starting JobPool Indexer...')
  console.log(`   Contract: ${JOB_POOL_ADDRESS}`)
  console.log(`   Chain: ${CHAIN_ID}`)
  console.log(`   RPC: ${RPC_URL}`)

  let lastProcessedBlock = fromBlock ?? 0n

  // Get current block number
  const currentBlock = await publicClient.getBlockNumber()
  console.log(`   Current block: ${currentBlock}`)
  console.log(`   Starting from block: ${lastProcessedBlock}`)

  // Process historical events first
  if (lastProcessedBlock < currentBlock) {
    console.log('📜 Processing historical events...')
    await processHistoricalEvents(lastProcessedBlock, currentBlock)
    lastProcessedBlock = currentBlock
  }

  // Set up event listeners for new events
  console.log('👂 Listening for new events...')

  // Watch for JobCreated events
  publicClient.watchEvent({
    address: JOB_POOL_ADDRESS,
    event: parseAbiItem(
      'event JobCreated(uint256 indexed jobId, address indexed creator, uint256 payment, uint256 deadline)'
    ),
    onLogs: (logs) => {
      for (const log of logs) {
        if (log.blockNumber && log.blockNumber > lastProcessedBlock) {
          handleJobCreated(
            log.args.jobId!,
            log.args.creator!,
            log.args.payment!,
            log.args.deadline!
          )
          lastProcessedBlock = log.blockNumber
        }
      }
    },
  })

  // Watch for WorkSubmitted events
  publicClient.watchEvent({
    address: JOB_POOL_ADDRESS,
    event: parseAbiItem(
      'event WorkSubmitted(uint256 indexed jobId, address indexed worker, bytes32 submissionHash)'
    ),
    onLogs: (logs) => {
      for (const log of logs) {
        if (log.blockNumber && log.blockNumber > lastProcessedBlock) {
          handleWorkSubmitted(
            log.args.jobId!,
            log.args.worker!,
            log.args.submissionHash!
          )
          lastProcessedBlock = log.blockNumber
        }
      }
    },
  })

  // Watch for JobCompleted events
  publicClient.watchEvent({
    address: JOB_POOL_ADDRESS,
    event: parseAbiItem(
      'event JobCompleted(uint256 indexed jobId, address indexed worker, uint256 workerPayment, uint256 platformFee)'
    ),
    onLogs: (logs) => {
      for (const log of logs) {
        if (log.blockNumber && log.blockNumber > lastProcessedBlock) {
          handleJobCompleted(
            log.args.jobId!,
            log.args.worker!,
            log.args.workerPayment!,
            log.args.platformFee!
          )
          lastProcessedBlock = log.blockNumber
        }
      }
    },
  })

  console.log('✅ Indexer started successfully')
}

/**
 * Process historical events
 */
async function processHistoricalEvents(fromBlock: bigint, toBlock: bigint) {
  const batchSize = 1000n // Process 1000 blocks at a time

  for (let start = fromBlock; start < toBlock; start += batchSize) {
    const end = start + batchSize > toBlock ? toBlock : start + batchSize

    try {
      // Get JobCreated events
      const jobCreatedLogs = await publicClient.getLogs({
        address: JOB_POOL_ADDRESS,
        event: parseAbiItem(
          'event JobCreated(uint256 indexed jobId, address indexed creator, uint256 payment, uint256 deadline)'
        ),
        fromBlock: start as bigint,
        toBlock: end as bigint,
      })

      for (const log of jobCreatedLogs) {
        await handleJobCreated(
          log.args.jobId!,
          log.args.creator!,
          log.args.payment!,
          log.args.deadline!
        )
      }

      // Get WorkSubmitted events
      const workSubmittedLogs = await publicClient.getLogs({
        address: JOB_POOL_ADDRESS,
        event: parseAbiItem(
          'event WorkSubmitted(uint256 indexed jobId, address indexed worker, bytes32 submissionHash)'
        ),
        fromBlock: start as bigint,
        toBlock: end as bigint,
      })

      for (const log of workSubmittedLogs) {
        await handleWorkSubmitted(
          log.args.jobId!,
          log.args.worker!,
          log.args.submissionHash!
        )
      }

      // Get JobCompleted events
      const jobCompletedLogs = await publicClient.getLogs({
        address: JOB_POOL_ADDRESS,
        event: parseAbiItem(
          'event JobCompleted(uint256 indexed jobId, address indexed worker, uint256 workerPayment, uint256 platformFee)'
        ),
        fromBlock: start as bigint,
        toBlock: end as bigint,
      })

      for (const log of jobCompletedLogs) {
        await handleJobCompleted(
          log.args.jobId!,
          log.args.worker!,
          log.args.workerPayment!,
          log.args.platformFee!
        )
      }

      console.log(`✓ Processed blocks ${start} to ${end}`)
    } catch (error) {
      console.error(`Error processing blocks ${start} to ${end}:`, error)
    }
  }
}

// If running as a standalone script
if (require.main === module) {
  startJobPoolIndexer().catch(console.error)
}


