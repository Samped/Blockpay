/**
 * Intuition Knowledge Graph Contract ABI and utilities
 * Contract: 0x2Ece8D4dEdcB9918A398528f3fa4688b1d2CAB91
 */

import { toBytes, bytesToHex } from 'viem'

// Contract utilities for Intuition Knowledge Graph

export const INTUITION_CONTRACT_ADDRESS = '0x2Ece8D4dEdcB9918A398528f3fa4688b1d2CAB91' as const

/**
 * Intuition MultiVault Contract ABI
 * Contract: 0x2Ece8D4dEdcB9918A398528f3fa4688b1d2CAB91 (Intuition Testnet)
 * Documentation: https://www.docs.intuition.systems/docs/developer-tools/contracts/deployments
 * 
 * Function: createAtoms(bytes[] calldata data, uint256[] calldata assets) payable returns (bytes32[])
 * - data: Array of bytes representing atom data (JSON encoded)
 * - assets: Array of uint256 representing deposit amounts for each atom
 * - msg.value: MUST equal sum(assets[]) - native token (tTRUST) sent via msg.value
 * Returns: bytes32[] - Array of atom IDs (term_ids)
 */
export const INTUITION_CONTRACT_ABI = [
  {
    name: 'createAtoms',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'data', type: 'bytes[]', internalType: 'bytes[]' },
      { name: 'assets', type: 'uint256[]', internalType: 'uint256[]' },
    ],
    outputs: [
      { name: '', type: 'bytes32[]', internalType: 'bytes32[]' },
    ],
  },
  // Read functions to get configuration
  {
    name: 'getAtomConfig',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'creationFee', type: 'uint256', internalType: 'uint256' },
      { name: 'minimumDeposit', type: 'uint256', internalType: 'uint256' },
    ],
  },
  {
    name: 'getGeneralConfig',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'atomCreationFee', type: 'uint256', internalType: 'uint256' },
      { name: 'atomMinimumDeposit', type: 'uint256', internalType: 'uint256' },
    ],
  },
  // Common custom errors for MultiVault (to decode revert reasons)
  {
    name: 'InvalidDepositAmount',
    type: 'error',
    inputs: [],
  },
  {
    name: 'InsufficientFunds',
    type: 'error',
    inputs: [],
  },
  {
    name: 'InsufficientDeposit',
    type: 'error',
    inputs: [],
  },
  {
    name: 'MinimumDepositNotMet',
    type: 'error',
    inputs: [],
  },
  {
    name: 'ValueMismatch',
    type: 'error',
    inputs: [],
  },
  {
    name: 'ArrayLengthMismatch',
    type: 'error',
    inputs: [],
  },
  {
    name: 'InvalidValue',
    type: 'error',
    inputs: [],
  },
  {
    name: 'InvalidAmount',
    type: 'error',
    inputs: [],
  },
  {
    name: 'DuplicateAtom',
    type: 'error',
    inputs: [],
  },
  {
    name: 'AtomAlreadyExists',
    type: 'error',
    inputs: [],
  },
  {
    name: 'InvalidAtomData',
    type: 'error',
    inputs: [],
  },
  // Read function to get minimum deposit
  {
    name: 'getMinAtomDeposit',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: '', type: 'uint256', internalType: 'uint256' },
    ],
  },
] as const

/**
 * Convert atom data to a JSON string for on-chain storage
 */
export function serializeAtomData(data: Record<string, any>): string {
  return JSON.stringify(data)
}

/**
 * Create atom URI from data
 * Can be data URI, IPFS URI, or HTTP URL
 * For testing, we use data URI format
 */
export function createAtomUri(data: Record<string, any>): string {
  // Use data URI format: data:application/json,{json}
  const jsonString = serializeAtomData(data)
  return `data:application/json,${encodeURIComponent(jsonString)}`
}

/**
 * Convert atom data to bytes array for createAtoms function
 * The createAtoms function requires bytes[] not string URI
 * Uses viem's toBytes for proper encoding
 */
export function atomDataToBytes(data: Record<string, any>): `0x${string}` {
  const jsonString = serializeAtomData(data)
  // Use viem's toBytes to convert string to bytes, then to hex
  const bytes = toBytes(jsonString)
  return bytesToHex(bytes)
}

