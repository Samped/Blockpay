/**
 * Utility functions for serializing and deserializing objects containing BigInt values.
 * 
 * JSON.stringify() throws an error when it encounters a BigInt value.
 * These utilities convert BigInt values to strings before serialization,
 * and optionally convert them back to BigInt during deserialization.
 * 
 * @example
 * // Instead of JSON.stringify(obj), use:
 * import { stringifyWithBigInt } from '@/lib/bigint-serialization'
 * const json = stringifyWithBigInt({ jobId: BigInt(123), payment: BigInt(1000) })
 * // Result: '{"jobId":"123","payment":"1000"}'
 * 
 * @example
 * // For localStorage:
 * localStorage.setItem('key', stringifyWithBigInt(data))
 * const data = JSON.parse(localStorage.getItem('key') || '{}')
 * // BigInt values will be strings: data.jobId === "123"
 */

/**
 * Replacer function for JSON.stringify that converts BigInt to string
 */
export function bigIntReplacer(key: string, value: any): any {
  if (typeof value === 'bigint') {
    return value.toString()
  }
  return value
}

/**
 * Reviver function for JSON.parse that can convert string numbers back to BigInt
 * Use this if you need to restore BigInt values after parsing
 */
export function bigIntReviver(key: string, value: any): any {
  // If you want to automatically convert certain fields back to BigInt,
  // you can add logic here. For now, we'll keep them as strings since
  // most use cases work fine with string representations.
  return value
}

/**
 * Safely stringify an object that may contain BigInt values
 * Converts all BigInt values to strings
 */
export function stringifyWithBigInt(obj: any): string {
  return JSON.stringify(obj, bigIntReplacer)
}

/**
 * Safely parse a JSON string that may have contained BigInt values
 * BigInt values will remain as strings (use bigIntReviver if you need to convert back)
 */
export function parseWithBigInt(jsonString: string): any {
  return JSON.parse(jsonString, bigIntReviver)
}

/**
 * Type guard to check if a value is a BigInt
 */
export function isBigInt(value: any): value is bigint {
  return typeof value === 'bigint'
}

/**
 * Recursively convert all BigInt values in an object to strings
 * Useful for preparing data before serialization
 */
export function bigIntToString(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj
  }
  
  if (typeof obj === 'bigint') {
    return obj.toString()
  }
  
  if (Array.isArray(obj)) {
    return obj.map(bigIntToString)
  }
  
  if (typeof obj === 'object') {
    const result: any = {}
    for (const [key, value] of Object.entries(obj)) {
      result[key] = bigIntToString(value)
    }
    return result
  }
  
  return obj
}

/**
 * Recursively convert string numbers back to BigInt for specific keys
 * Useful when you know which fields should be BigInt
 */
export function stringToBigInt(obj: any, bigIntKeys: string[] = []): any {
  if (obj === null || obj === undefined) {
    return obj
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => stringToBigInt(item, bigIntKeys))
  }
  
  if (typeof obj === 'object') {
    const result: any = {}
    for (const [key, value] of Object.entries(obj)) {
      if (bigIntKeys.includes(key) && typeof value === 'string' && /^\d+$/.test(value)) {
        result[key] = BigInt(value)
      } else {
        result[key] = stringToBigInt(value, bigIntKeys)
      }
    }
    return result
  }
  
  return obj
}

