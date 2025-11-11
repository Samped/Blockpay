'use client'

import Image from 'next/image'
import { useState } from 'react'

interface LogoProps {
  size?: number
  className?: string
  showText?: boolean
}

export function Logo({ size = 40, className = '', showText = true }: LogoProps) {
  const [logoError, setLogoError] = useState(false)
  const [currentSrc, setCurrentSrc] = useState('/logo.png')

  const handleError = () => {
    if (currentSrc.includes('.png')) {
      setCurrentSrc('/logo.jpg')
    } else if (currentSrc.includes('.jpg')) {
      setCurrentSrc('/logo.svg')
    } else {
      setLogoError(true)
    }
  }

  if (logoError) {
    // Fallback: just show text if logo fails to load
    return showText ? (
      <span className={`text-2xl font-bold text-gray-900 ${className}`}>
        BlockPay
      </span>
    ) : null
  }

  return (
    <div className={`flex items-center space-x-3 ${className}`}>
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <Image
          src={currentSrc}
          alt="BlockPay Logo"
          fill
          className="object-contain"
          onError={handleError}
          priority
        />
      </div>
      {showText && (
        <span className="text-2xl font-bold text-gray-900">
          BlockPay
        </span>
      )}
    </div>
  )
}

