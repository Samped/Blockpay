'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'

interface ProfilePictureUploadProps {
  address: string
}

export function ProfilePictureUpload({ address }: ProfilePictureUploadProps) {
  const [pfpUrl, setPfpUrl] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load existing PFP from localStorage or generate from address
  useEffect(() => {
    const savedPfp = localStorage.getItem(`pfp_${address}`)
    if (savedPfp) {
      setPfpUrl(savedPfp)
    } else {
      // Generate a simple identicon or use a placeholder
      setPfpUrl(null)
    }
  }, [address])

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file')
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('Image size must be less than 5MB')
      return
    }

    setIsUploading(true)
    setError(null)

    try {
      // Convert to base64 for now (in production, upload to IPFS or a storage service)
      const reader = new FileReader()
      reader.onloadend = () => {
        const base64String = reader.result as string
        setPfpUrl(base64String)
        localStorage.setItem(`pfp_${address}`, base64String)
        setIsUploading(false)
        
        // TODO: Upload to IPFS and save to Intuition Atom
        // await uploadToIPFS(file)
        // await updateUserAtom(address, { pfpUrl: ipfsUrl })
      }
      reader.onerror = () => {
        setError('Failed to read image file')
        setIsUploading(false)
      }
      reader.readAsDataURL(file)
    } catch (err) {
      setError('Failed to upload image')
      setIsUploading(false)
    }
  }

  const handleRemove = () => {
    setPfpUrl(null)
    localStorage.removeItem(`pfp_${address}`)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center">
        <div className="relative w-32 h-32 rounded-full overflow-hidden bg-gray-100 border-4 border-gray-200">
          {pfpUrl ? (
            <Image
              src={pfpUrl}
              alt="Profile Picture"
              fill
              className="object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary to-purple-600">
              <span className="text-4xl font-bold text-white">
                {address?.slice(2, 4).toUpperCase() || '??'}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
          id="pfp-upload"
        />
        <label
          htmlFor="pfp-upload"
          className={`block w-full text-center px-4 py-2.5 text-sm font-medium rounded-full border-2 border-gray-300 text-gray-900 hover:border-primary hover:bg-gray-50 transition-all duration-200 cursor-pointer ${
            isUploading ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {isUploading ? 'Uploading...' : pfpUrl ? 'Change Picture' : 'Upload Picture'}
        </label>

        {pfpUrl && (
          <button
            onClick={handleRemove}
            className="w-full px-4 py-2 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-full transition-colors"
          >
            Remove Picture
          </button>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      <p className="text-xs text-gray-500 text-center">
        Recommended: Square image, at least 400x400px
      </p>
    </div>
  )
}

