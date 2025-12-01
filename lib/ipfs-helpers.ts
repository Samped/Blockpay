import * as ipfsOnlyHash from 'ipfs-only-hash'

/**
 * Compute an IPFS CID (v1) for the given buffer without uploading it.
 */
export async function computeIpfsCid(buffer: Buffer): Promise<string> {
  const cid = await ipfsOnlyHash.of(buffer, {
    cidVersion: 1,
    rawLeaves: true,
  })

  return cid
}


