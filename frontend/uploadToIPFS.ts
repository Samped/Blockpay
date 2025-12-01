export async function uploadToIPFS(
  file: File,
  extra: { uploader?: string; type?: string; jobId?: string } = {}
) {
  const formData = new FormData()
  formData.append('file', file)

  if (extra.uploader) formData.append('uploader', extra.uploader)
  if (extra.type) formData.append('type', extra.type)
  if (extra.jobId) formData.append('jobId', extra.jobId)

  const res = await fetch('/api/ipfs/filebase', {
    method: 'POST',
    body: formData,
  })

  const json = await res.json()
  if (!res.ok) {
    throw new Error(json.error || 'Upload failed')
  }

  return json as {
    success: boolean
    cid: string
    httpUrl: string
    filebase: { etag?: string; key: string; url: string }
    intuition: any
  }
}


