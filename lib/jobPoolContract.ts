/**
 * JobPool Contract ABI and utilities
 * Contract for BlockPay Job Pool System
 */

import { parseUnits, formatUnits } from 'viem'

// JobPool Contract ABI
export const JOB_POOL_ABI = [
  {
    name: 'createJob',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'budget', type: 'uint256', internalType: 'uint256' },
      { name: 'jobAtom', type: 'bytes32', internalType: 'bytes32' },
      { name: 'deadline', type: 'uint64', internalType: 'uint64' },
    ],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
  },
  {
    name: 'submitWork',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId', type: 'uint256', internalType: 'uint256' },
      { name: 'submissionAtom', type: 'bytes32', internalType: 'bytes32' },
      { name: 'previewCID', type: 'string', internalType: 'string' },
    ],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
  },
  {
    name: 'approveWork',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId', type: 'uint256', internalType: 'uint256' },
      { name: 'submissionId', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'cancelJob',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'jobId', type: 'uint256', internalType: 'uint256' }],
    outputs: [],
  },
  {
    name: 'disputeJob',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'jobId', type: 'uint256', internalType: 'uint256' }],
    outputs: [],
  },
  {
    name: 'withdraw',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    name: 'getJob',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'jobId', type: 'uint256', internalType: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        internalType: 'struct JobPool.Job',
        components: [
          { name: 'id', type: 'uint256' },
          { name: 'requestor', type: 'address' },
          { name: 'budget', type: 'uint256' },
          { name: 'status', type: 'uint8' },
          { name: 'jobAtom', type: 'bytes32' },
          { name: 'deadline', type: 'uint64' },
          { name: 'createdAt', type: 'uint64' },
          { name: 'submissionIds', type: 'uint256[]' },
          { name: 'winningSubmissionId', type: 'uint256' },
        ],
      },
    ],
  },
  {
    name: 'getSubmission',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'submissionId', type: 'uint256', internalType: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        internalType: 'struct JobPool.Submission',
        components: [
          { name: 'id', type: 'uint256' },
          { name: 'submitter', type: 'address' },
          { name: 'submissionAtom', type: 'bytes32' },
          { name: 'previewCID', type: 'string' },
          { name: 'status', type: 'uint8' },
          { name: 'timestamp', type: 'uint64' },
        ],
      },
    ],
  },
  {
    name: 'getJobSubmissionIds',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'jobId', type: 'uint256', internalType: 'uint256' }],
    outputs: [{ name: '', type: 'uint256[]', internalType: 'uint256[]' }],
  },
  {
    name: 'withdrawable',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address', internalType: 'address' }],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
  },
  {
    name: 'jobCounter',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
  },
  {
    name: 'platformFeeBps',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint16', internalType: 'uint16' }],
  },
  {
    name: 'treasury',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
  },
  // Events
  {
    name: 'JobCreated',
    type: 'event',
    inputs: [
      { name: 'jobId', type: 'uint256', indexed: true },
      { name: 'requestor', type: 'address', indexed: true },
      { name: 'budget', type: 'uint256', indexed: false },
      { name: 'jobAtom', type: 'bytes32', indexed: false },
      { name: 'deadline', type: 'uint64', indexed: false },
    ],
  },
  {
    name: 'SubmissionCreated',
    type: 'event',
    inputs: [
      { name: 'jobId', type: 'uint256', indexed: true },
      { name: 'submissionId', type: 'uint256', indexed: true },
      { name: 'submitter', type: 'address', indexed: true },
      { name: 'submissionAtom', type: 'bytes32', indexed: false },
    ],
  },
  {
    name: 'JobApproved',
    type: 'event',
    inputs: [
      { name: 'jobId', type: 'uint256', indexed: true },
      { name: 'submissionId', type: 'uint256', indexed: true },
      { name: 'creator', type: 'address', indexed: true },
      { name: 'amountPaid', type: 'uint256', indexed: false },
      { name: 'fee', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'JobCancelled',
    type: 'event',
    inputs: [
      { name: 'jobId', type: 'uint256', indexed: true },
      { name: 'requestor', type: 'address', indexed: true },
    ],
  },
] as const

// ERC20 ABI for TRUST token
export const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const

// Job Status enum
export enum JobStatus {
  Open = 0,
  Submitted = 1,
  Approved = 2,
  Cancelled = 3,
  Disputed = 4,
  Resolved = 5,
  Closed = 6,
}

// Submission Status enum
export enum SubmissionStatus {
  Pending = 0,
  Rejected = 1,
  Approved = 2,
}

// Types
export interface Job {
  id: bigint
  requestor: `0x${string}`
  budget: bigint
  status: JobStatus
  jobAtom: `0x${string}`
  deadline: bigint
  createdAt: bigint
  submissionIds: bigint[]
  winningSubmissionId: bigint
}

export interface Submission {
  id: bigint
  submitter: `0x${string}`
  submissionAtom: `0x${string}`
  previewCID: string
  status: SubmissionStatus
  timestamp: bigint
}

/**
 * Convert atom ID (string) to bytes32
 */
export function atomIdToBytes32(atomId: string): `0x${string}` {
  // Remove '0x' if present and pad to 64 characters (32 bytes)
  const cleanId = atomId.startsWith('0x') ? atomId.slice(2) : atomId
  return `0x${cleanId.padStart(64, '0').slice(0, 64)}` as `0x${string}`
}

/**
 * Convert bytes32 to atom ID string
 */
export function bytes32ToAtomId(bytes32: `0x${string}`): string {
  return bytes32
}

/**
 * Format TRUST amount for display
 */
export function formatTrustAmount(amount: bigint, decimals: number = 18): string {
  return formatUnits(amount, decimals)
}

/**
 * Parse TRUST amount from string
 */
export function parseTrustAmount(amount: string, decimals: number = 18): bigint {
  return parseUnits(amount, decimals)
}

