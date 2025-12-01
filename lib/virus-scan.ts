/**
 * Scan a buffer for viruses.
 * Currently a no-op placeholder to avoid heavy native dependencies.
 * Returns false (clean). Replace with real scanning (e.g. ClamAV) in production.
 */
export async function scanBufferForVirus(buffer: Buffer): Promise<boolean> {
  void buffer
  // TODO: integrate a real virus scanner (e.g. ClamAV daemon) in production.
  return false
}


