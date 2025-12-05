/**
 * VotingContract ABI and utilities
 * Contract for BlockPay Voting System
 * Deployed: 0x3401D0e9CD397EcDf6dde6122aD788B19fc578E2
 */

import { parseUnits, formatUnits } from 'viem'

// Contract address
export const VOTING_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_VOTING_CONTRACT_ADDRESS || '0x3401D0e9CD397EcDf6dde6122aD788B19fc578E2' as `0x${string}`

// VotingContract ABI (matches deployed contract)
export const VOTING_CONTRACT_ABI = [
  {
    name: 'voteOnJob',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: '_jobId', type: 'uint256', internalType: 'uint256' },
      { name: '_userAtomId', type: 'bytes32', internalType: 'bytes32' },
    ],
    outputs: [],
  },
  {
    name: 'getVotesCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_jobId', type: 'uint256', internalType: 'uint256' }],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
  },
  {
    name: 'getVotes',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_jobId', type: 'uint256', internalType: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        internalType: 'struct VotingContract.Vote[]',
        components: [
          { name: 'voter', type: 'address', internalType: 'address' },
          { name: 'jobId', type: 'uint256', internalType: 'uint256' },
          { name: 'tripleId', type: 'bytes32', internalType: 'bytes32' },
        ],
      },
    ],
  },
  {
    name: 'checkHasVoted',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: '_voter', type: 'address', internalType: 'address' },
      { name: '_jobId', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
  },
  {
    name: 'votedPredicate',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32', internalType: 'bytes32' }],
  },
  {
    name: 'owner',
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
    name: 'jobPool',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
  },
  {
    name: 'multivault',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
  },
  {
    name: 'ATOM_CREATION_FEE',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
  },
  {
    name: 'VoteCast',
    type: 'event',
    inputs: [
      { name: 'jobId', type: 'uint256', indexed: true, internalType: 'uint256' },
      { name: 'voter', type: 'address', indexed: true, internalType: 'address' },
      { name: 'userAtomId', type: 'bytes32', indexed: false, internalType: 'bytes32' },
      { name: 'tripleId', type: 'bytes32', indexed: false, internalType: 'bytes32' },
    ],
  },
] as const

// Helper functions
export function parseTrustAmount(amount: string): bigint {
  return parseUnits(amount, 18)
}

export function formatTrustAmount(amount: bigint): string {
  return formatUnits(amount, 18)
}








