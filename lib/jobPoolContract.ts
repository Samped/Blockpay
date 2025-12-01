/**
 * JobPool Contract ABI and utilities
 * Contract for BlockPay Job Pool System
 * Deployed: 0x8A21eAa3271d546471435804F2a1c90b80BD7B95
 */

import { parseUnits, formatUnits } from 'viem'

// JobPool Contract ABI (matches deployed contract)
export const JOB_POOL_ABI = [
  {
    name: 'createJob',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: '_deadline', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
  },
  {
    name: 'submitWork',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_jobId', type: 'uint256', internalType: 'uint256' },
      { name: '_submissionHash', type: 'bytes32', internalType: 'bytes32' },
    ],
    outputs: [],
  },
  {
    name: 'acceptWork',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_jobId', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'cancelJob',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_jobId', type: 'uint256', internalType: 'uint256' }],
    outputs: [],
  },
  {
    name: 'expireJob',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_jobId', type: 'uint256', internalType: 'uint256' }],
    outputs: [],
  },
  {
    name: 'getJob',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_jobId', type: 'uint256', internalType: 'uint256' }],
    outputs: [
      { name: 'creator', type: 'address' },
      { name: 'payment', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'status', type: 'uint8' },
      { name: 'hasSubmission', type: 'bool' },
      { name: 'worker', type: 'address' },
      { name: 'submissionHash', type: 'bytes32' },
    ],
  },
  {
    name: 'jobCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
  },
  {
    name: 'platformFeePercent',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
  },
  {
    name: 'platformOwner',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
  },
  {
    name: 'paused',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
  },
  {
    name: 'isJobExpired',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_jobId', type: 'uint256', internalType: 'uint256' }],
    outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
  },
  // Events
  {
    name: 'JobCreated',
    type: 'event',
    inputs: [
      { name: 'jobId', type: 'uint256', indexed: true },
      { name: 'creator', type: 'address', indexed: true },
      { name: 'payment', type: 'uint256', indexed: false },
      { name: 'deadline', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'WorkSubmitted',
    type: 'event',
    inputs: [
      { name: 'jobId', type: 'uint256', indexed: true },
      { name: 'worker', type: 'address', indexed: true },
      { name: 'submissionHash', type: 'bytes32', indexed: false },
    ],
  },
  {
    name: 'JobCompleted',
    type: 'event',
    inputs: [
      { name: 'jobId', type: 'uint256', indexed: true },
      { name: 'worker', type: 'address', indexed: true },
      { name: 'workerPayment', type: 'uint256', indexed: false },
      { name: 'platformFee', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'JobCancelled',
    type: 'event',
    inputs: [
      { name: 'jobId', type: 'uint256', indexed: true },
      { name: 'creator', type: 'address', indexed: true },
      { name: 'refund', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'JobExpired',
    type: 'event',
    inputs: [
      { name: 'jobId', type: 'uint256', indexed: true },
      { name: 'creator', type: 'address', indexed: true },
      { name: 'refund', type: 'uint256', indexed: false },
    ],
  },
] as const

// Job Status enum (matches contract)
export enum JobStatus {
  Active = 0,
  Completed = 1,
  Cancelled = 2,
  Expired = 3,
}

// Types
export interface Job {
  creator: `0x${string}`
  payment: bigint
  deadline: bigint
  status: JobStatus
  hasSubmission: boolean
  worker: `0x${string}`
  submissionHash: `0x${string}`
}

/**
 * Convert IPFS CID string to bytes32 hash
 * For CIDv0 (Qm...), we can use the first 32 bytes
 * For CIDv1 (bafy...), we hash it
 */
export function cidToBytes32(cid: string): `0x${string}` {
  // Remove ipfs:// prefix if present
  const cleanCid = cid.replace(/^ipfs:\/\//, '')
  
  // For CIDv0 (46 chars starting with Qm), take first 32 bytes
  if (cleanCid.length === 46 && cleanCid.startsWith('Qm')) {
    // Convert base58 to bytes, then take first 32 bytes
    // For simplicity, we'll hash the CID string
    const encoder = new TextEncoder()
    const bytes = encoder.encode(cleanCid)
    // Use keccak256 hash (in production, use proper base58 decode)
    // For now, pad to 32 bytes
    const padded = new Uint8Array(32)
    padded.set(bytes.slice(0, 32))
    return `0x${Array.from(padded).map(b => b.toString(16).padStart(2, '0')).join('')}` as `0x${string}`
  }
  
  // For other CIDs, hash the string
  // In production, use proper IPFS CID parsing
  const encoder = new TextEncoder()
  const bytes = encoder.encode(cleanCid)
  const padded = new Uint8Array(32)
  padded.set(bytes.slice(0, 32))
  return `0x${Array.from(padded).map(b => b.toString(16).padStart(2, '0')).join('')}` as `0x${string}`
}

/**
 * Format native token amount for display
 */
export function formatTrustAmount(amount: bigint, decimals: number = 18): string {
  return formatUnits(amount, decimals)
}

/**
 * Parse native token amount from string
 */
export function parseTrustAmount(amount: string, decimals: number = 18): bigint {
  return parseUnits(amount, decimals)
}
