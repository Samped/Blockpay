'use client'

import { useEffect } from 'react'

interface ImageModalProps {
  isOpen: boolean
  onClose: () => void
  imageUrl: string
  imageCid: string
  jobTitle?: string
}

export function ImageModal({ isOpen, onClose, imageUrl, imageCid, jobTitle }: ImageModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  const handleDownload = async () => {
    try {
      const response = await fetch(imageUrl)
      const blob = await response.blob()
      const contentType = response.headers.get('content-type') || 'image/webp'
      
      // Determine file extension from content type
      let extension = 'webp'
      if (contentType.includes('jpeg') || contentType.includes('jpg')) {
        extension = 'jpg'
      } else if (contentType.includes('png')) {
        extension = 'png'
      } else if (contentType.includes('webp')) {
        extension = 'webp'
      }
      
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const safeTitle = (jobTitle || imageCid).replace(/[^a-z0-9]/gi, '_').toLowerCase()
      a.download = `job-${safeTitle}.${extension}`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      console.error('Error downloading image:', err)
      alert('Failed to download image. Please try right-clicking and saving the image.')
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative max-w-7xl max-h-[90vh] w-full h-full flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 bg-white/10 hover:bg-white/20 text-white rounded-full p-2 transition-colors"
          aria-label="Close"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Download button */}
        <button
          onClick={handleDownload}
          className="absolute top-4 right-16 z-10 bg-blue-600 hover:bg-blue-700 text-white rounded-full p-2 transition-colors flex items-center gap-2"
          aria-label="Download"
          title="Download image"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </button>

        {/* Image */}
        <img
          src={imageUrl}
          alt={jobTitle || 'Completed work'}
          className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        />

        {/* Job title overlay */}
        {jobTitle && (
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-lg">
            <p className="text-sm font-medium">{jobTitle}</p>
          </div>
        )}
      </div>
    </div>
  )
}

