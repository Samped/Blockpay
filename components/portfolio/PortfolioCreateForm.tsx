'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount, usePublicClient } from 'wagmi'
import { usePortfolioContract, PortfolioData } from '@/hooks/usePortfolioContract'
import { formatTrustAmount, calculatePortfolioFee, PORTFOLIO_CONTRACT_ADDRESS, PORTFOLIO_CONTRACT_ABI } from '@/lib/portfolioContract'
import { decodeEventLog } from 'viem'
import { uploadToIPFS as uploadFilebaseToIPFS } from '@/frontend/uploadToIPFS'
import { fetchPortfolioByProfileId } from '@/lib/portfolioFetcher'

// Helper function to compress/resize image
function compressImage(file: File, maxWidth: number = 800, maxHeight: number = 800, quality: number = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let width = img.width
        let height = img.height

        // Calculate new dimensions
        if (width > height) {
          if (width > maxWidth) {
            height = (height * maxWidth) / width
            width = maxWidth
          }
        } else {
          if (height > maxHeight) {
            width = (width * maxHeight) / height
            height = maxHeight
          }
        }

        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Could not get canvas context'))
          return
        }

        ctx.drawImage(img, 0, 0, width, height)
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to compress image'))
              return
            }
            const reader = new FileReader()
            reader.onloadend = () => resolve(reader.result as string)
            reader.onerror = reject
            reader.readAsDataURL(blob)
          },
          'image/jpeg',
          quality
        )
      }
      img.onerror = reject
      img.src = e.target?.result as string
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

interface PortfolioCreateFormProps {
  onSuccess?: (result: { profileId: string; txHash: string }) => void
  onCancel?: () => void
}

export function PortfolioCreateForm({ onSuccess, onCancel }: PortfolioCreateFormProps) {
  const router = useRouter()
  const { isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { createPortfolio, addProfileImages, isPending, isConfirmed, txHash, writeError, isPaused } = usePortfolioContract()
  const [indexingStatus, setIndexingStatus] = useState<string | null>(null)
  const [uploadingImages, setUploadingImages] = useState(false)

  // Form state
  const [profileData, setProfileData] = useState({
    name: '',
    bio: '',
    email: '',
    website: '',
    profilePicture: null as File | null,
    profilePicturePreview: '' as string,
  })

  // Skills with dropdown, experience, and level
  const commonSkills = [
    'Developer - JavaScript',
    'Developer - TypeScript',
    'Developer - Python',
    'Developer - Solidity',
    'Developer - React',
    'Developer - Node.js',
    'Developer - Web3',
    'Frontend Engineer',
    'Backend Engineer',
    'Full Stack Developer',
    'Mobile Developer',
    'Blockchain Developer',
    'Smart Contract Developer',
    'UI/UX Designer',
    'Graphic Designer',
    'Content Writer',
    'Technical Writer',
    'Copywriter',
    'Digital Marketer',
    'Social Media Marketer',
    'SEO Specialist',
    'Project Manager',
    'Product Manager',
    'Data Analyst',
    'Data Scientist',
    'DevOps Engineer',
    'QA Engineer',
    'Consultant',
    'Freelancer',
  ]
  const [selectedSkills, setSelectedSkills] = useState<string[]>([])
  const [showSkillsDropdown, setShowSkillsDropdown] = useState(false)
  const [customSkills, setCustomSkills] = useState<Array<{ name: string; years: string; level: string }>>([])
  
  // Tags with dropdown
  const commonTags = ['Developer', 'Designer', 'Creator', 'Entrepreneur', 'Artist', 'Writer', 'Marketer', 'Consultant', 'Freelancer', 'Agency']
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [showTagsDropdown, setShowTagsDropdown] = useState(false)
  const [customTags, setCustomTags] = useState<string[]>([''])
  
  // Social media with toggles
  const socialPlatforms = ['GitHub', 'Twitter', 'LinkedIn', 'Instagram', 'Discord', 'Telegram', 'Website', 'Portfolio']
  const [selectedSocials, setSelectedSocials] = useState<Set<string>>(new Set())
  const [selectedSocialUrls, setSelectedSocialUrls] = useState<Map<string, string>>(new Map())
  const [customSocials, setCustomSocials] = useState<Array<{ platform: string; url: string }>>([])
  
  // Achievements with links
  const [achievements, setAchievements] = useState<Array<{ text: string; link: string }>>([{ text: '', link: '' }])
  
  // Projects with pictures and links
  const [projects, setProjects] = useState<Array<{ title: string; description: string; imageFile: File | null; imagePreview: string; externalLink: string; category?: string }>>([
    { title: '', description: '', imageFile: null, imagePreview: '', externalLink: '' },
  ])

  // Showcase images (work portfolio)
  const [showcaseImages, setShowcaseImages] = useState<Array<{ file: File | null; preview: string; cid?: string }>>([])

  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Helper to get all skills as strings
  const getAllSkills = (): string[] => {
    const skillStrings: string[] = [...selectedSkills]
    customSkills.forEach(skill => {
      if (skill.name.trim()) {
        skillStrings.push(skill.name.trim())
      }
    })
    return skillStrings
  }

  // Helper to get all tags as strings
  const getAllTags = (): string[] => {
    const tagStrings: string[] = [...selectedTags]
    customTags.forEach(tag => {
      if (tag.trim()) {
        tagStrings.push(tag.trim())
      }
    })
    return tagStrings
  }

  // Helper to get all socials
  const getAllSocials = (): Array<{ platform: string; url: string }> => {
    const socialArray: Array<{ platform: string; url: string }> = []
    selectedSocials.forEach(platform => {
      const url = selectedSocialUrls.get(platform) || ''
      if (url.trim()) {
        socialArray.push({ platform, url: url.trim() })
      }
    })
    customSocials.forEach(social => {
      if (social.platform.trim() && social.url.trim() && !selectedSocials.has(social.platform)) {
        socialArray.push(social)
      }
    })
    return socialArray
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (!isConnected) {
      setError('Please connect your wallet')
      return
    }

    if (isPaused) {
      setError('Portfolio creation is currently paused')
      return
    }

    // Note: We don't check predicatesInitialized here because:
    // 1. The contract will revert if predicates aren't initialized
    // 2. Predicates have been initialized (confirmed via transaction logs)
    // 3. The check can be unreliable due to RPC caching
    // 4. The contract will provide a clear error message if predicates aren't initialized

    try {
      // Convert profile picture to compressed base64 if exists
      let profilePictureBase64: string | undefined
      if (profileData.profilePicture) {
        try {
          profilePictureBase64 = await compressImage(profileData.profilePicture, 400, 400, 0.7)
          // Check if still too large (base64 is ~33% larger, so 10000 chars = ~7500 bytes)
          if (profilePictureBase64.length > 8000) {
            // Compress more aggressively
            profilePictureBase64 = await compressImage(profileData.profilePicture, 300, 300, 0.6)
          }
        } catch (error) {
          console.error('Error compressing profile picture:', error)
          setError('Failed to compress profile picture. Please use a smaller image.')
          return
        }
      }

      // Build profile JSON
      let profileJson = JSON.stringify({
        name: profileData.name,
        bio: profileData.bio,
        email: profileData.email || undefined,
        website: profileData.website || undefined,
        profilePicture: profilePictureBase64 || undefined,
      })
      
      // Check profile JSON length - if too long, try without picture
      if (profileJson.length > 50000) {
        if (profilePictureBase64) {
          // Try without profile picture
          const profileJsonWithoutPicture = JSON.stringify({
            name: profileData.name,
            bio: profileData.bio,
            email: profileData.email || undefined,
            website: profileData.website || undefined,
          })
          
          if (profileJsonWithoutPicture.length <= 50000) {
            console.warn(`[WARN] Profile picture too large (${profileJson.length} bytes), removing it`)
            // Continue without picture
            profileJson = profileJsonWithoutPicture
          } else {
            setError(`Profile data is too long (${profileJson.length} bytes, max 50,000). Please shorten your name or bio, or remove the profile picture.`)
            return
          }
        } else {
          setError(`Profile data is too long (${profileJson.length} bytes, max 50,000). Please shorten your name or bio.`)
          return
        }
      }
      
      // Final validation - ensure profileJson is within limits
      if (profileJson.length > 50000) {
        setError(`Profile JSON is still too long after processing (${profileJson.length} bytes, max 50,000). Please shorten your data.`)
        return
      }
      
      console.log(`[INFO] Profile JSON length: ${profileJson.length} bytes (max 50,000)`)
      
      // Validate profile JSON doesn't contain profilePicture if it was too large
      try {
        const parsed = JSON.parse(profileJson)
        if (parsed.profilePicture && profileJson.length > 40000) {
          console.warn('[WARN] Profile picture detected but JSON is large, removing it')
          const withoutPicture = JSON.stringify({
            name: parsed.name,
            bio: parsed.bio,
            email: parsed.email,
            website: parsed.website,
          })
          if (withoutPicture.length <= 50000) {
            profileJson = withoutPicture
            console.log('[INFO] Removed profile picture to stay within limits')
          }
        }
      } catch (e) {
        console.error('[ERROR] Failed to parse profile JSON for validation:', e)
      }

      // Build portfolio data
      const portfolioData: PortfolioData = {
        profileJson,
        skills: getAllSkills(),
        tags: getAllTags(),
        socials: getAllSocials()
          .filter(s => s.platform.trim() && s.url.trim())
          .map(s => JSON.stringify({ platform: s.platform, url: s.url })),
        achievements: achievements
          .filter(a => a.text.trim())
          .map(a => a.text.trim()),
        projects: await Promise.all(
          projects
            .filter(p => p.title.trim())
            .map(async (p) => {
              let imageBase64: string | undefined
              if (p.imageFile) {
                try {
                  imageBase64 = await compressImage(p.imageFile, 600, 600, 0.7)
                  // Check if still too large (5000 chars = ~3750 bytes)
                  if (imageBase64.length > 4500) {
                    // Compress more aggressively
                    imageBase64 = await compressImage(p.imageFile, 400, 400, 0.6)
                  }
                } catch (error) {
                  console.error('Error compressing project image:', error)
                  // Continue without image if compression fails
                }
              }
              
              const projectJson = JSON.stringify({ 
                title: p.title, 
                description: p.description, 
                category: p.category || undefined,
                imageUrl: imageBase64 || undefined,
                externalLink: p.externalLink || undefined,
              })
              
              // Final check - if still too large, remove image
              if (projectJson.length > 5000 && imageBase64) {
                const projectJsonWithoutImage = JSON.stringify({ 
                  title: p.title, 
                  description: p.description, 
                  category: p.category || undefined,
                  externalLink: p.externalLink || undefined,
                })
                if (projectJsonWithoutImage.length <= 5000) {
                  return projectJsonWithoutImage
                }
              }
              
              if (projectJson.length > 5000) {
                throw new Error(`Project "${p.title}" data is too long even without image. Please shorten the description.`)
              }
              
              return projectJson
            })
        ),
      }

      const result = await createPortfolio(portfolioData)

      if (result.success && result.profileId) {
        // Upload showcase images if any
        if (showcaseImages.length > 0) {
          setUploadingImages(true)
          setIndexingStatus('Uploading showcase images to IPFS...')
          
          try {
            // Upload all images to Filebase/DataBass via the shared helper (same flow as JobPool)
            const imageHashes: string[] = []
            
            for (let i = 0; i < showcaseImages.length; i++) {
              const image = showcaseImages[i]
              if (!image.file) continue
              
              setIndexingStatus(`Uploading image ${i + 1}/${showcaseImages.length}...`)
              
              const uploadData = await uploadFilebaseToIPFS(image.file, {
                uploader: address,
                type: 'portfolio-showcase',
              })
              
              const cid = uploadData.cid.replace(/^ipfs:\/\//, '') // Remove ipfs:// prefix
              imageHashes.push(cid)
            }
            
            // Add images to portfolio on-chain
            if (imageHashes.length > 0) {
              setIndexingStatus('Adding images to portfolio...')
              const addImagesResult = await addProfileImages(result.profileId, imageHashes)
              
              if (!addImagesResult.success) {
                console.warn('Failed to add images to portfolio:', addImagesResult.error)
                // Don't fail the whole operation, just warn
                setIndexingStatus('Portfolio created, but failed to add images. You can add them later.')
              } else {
                setIndexingStatus('Portfolio and images created successfully!')
              }
            }
          } catch (imageError: any) {
            console.error('Error uploading images:', imageError)
            // Don't fail the whole operation, just warn
            setIndexingStatus('Portfolio created, but failed to upload images. You can add them later.')
          } finally {
            setUploadingImages(false)
          }
        }
        
        setSuccess(true)
        if (result.txHash && onSuccess) {
          onSuccess({ profileId: result.profileId, txHash: result.txHash })
        }
      } else {
        setError(result.error || 'Failed to create portfolio')
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    }
  }

  // Handle transaction confirmation and wait for indexing
  useEffect(() => {
    const handleTransactionConfirmation = async () => {
      if (isConfirmed && txHash && publicClient && !success) {
        try {
          setIndexingStatus('Transaction confirmed! Waiting for GraphQL indexing...')
          
          // Get transaction receipt
          const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
          
          // Extract profileId from AtomCreated event
          let profileId: string | undefined
          for (const log of receipt.logs) {
            try {
              const decoded = decodeEventLog({
                abi: PORTFOLIO_CONTRACT_ABI,
                data: log.data,
                topics: log.topics,
              })
              
              if (decoded.eventName === 'AtomCreated' && decoded.args.atomType === 'profile') {
                profileId = decoded.args.atomId as string
                break
              }
            } catch {
              // Not our event, continue
            }
          }

          if (profileId) {
            setIndexingStatus(`Portfolio created! Profile ID: ${profileId.slice(0, 10)}... Waiting for indexing...`)
            
            // Wait for GraphQL indexing (poll every 3 seconds, max 60 seconds)
            const maxAttempts = 20
            let attempts = 0
            
            while (attempts < maxAttempts) {
              await new Promise(resolve => setTimeout(resolve, 3000))
              const portfolio = await fetchPortfolioByProfileId(profileId)
              
              if (portfolio) {
                setIndexingStatus('Portfolio indexed and available!')
                setSuccess(true)
                if (onSuccess) {
                  onSuccess({ profileId, txHash })
                }
                return
              }
              
              attempts++
              setIndexingStatus(`Waiting for indexing... (${attempts}/${maxAttempts})`)
            }
            
            // Even if not indexed yet, show success
            setIndexingStatus('Portfolio created but may take a few moments to appear. Refreshing hub...')
            setSuccess(true)
            if (onSuccess) {
              onSuccess({ profileId, txHash })
            }
          } else {
            // No profileId extracted, but transaction succeeded
            setIndexingStatus('Transaction confirmed! Redirecting to hub...')
            setSuccess(true)
            if (onSuccess) {
              onSuccess({ profileId: '', txHash })
            }
            // Redirect to portfolio page
            setTimeout(() => {
              router.push('/hub')
            }, 2000)
          }
        } catch (error) {
          console.error('[ERROR] Error waiting for indexing:', error)
          setIndexingStatus('Transaction confirmed. Redirecting to hub...')
          setSuccess(true)
          if (onSuccess) {
            onSuccess({ profileId: '', txHash })
          }
          // Redirect to portfolio page
          setTimeout(() => {
            router.push('/hub')
          }, 2000)
        }
      }
    }

    handleTransactionConfirmation()
  }, [isConfirmed, txHash, publicClient, success, onSuccess])


  if (!isConnected) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-8 text-center">
        <p className="text-gray-600 mb-4">Please connect your wallet to create a portfolio</p>
      </div>
    )
  }

  // Calculate fee breakdown for display
  const feeBreakdown = (() => {
    let totalValueAtoms = 0
    const categories: string[] = []
    if (getAllSkills().length > 0) { totalValueAtoms += 1; categories.push('Skills') }
    if (getAllTags().length > 0) { totalValueAtoms += 1; categories.push('Tags') }
    if (getAllSocials().filter(s => s.platform.trim() && s.url.trim()).length > 0) { totalValueAtoms += 1; categories.push('Socials') }
    if (achievements.filter(a => a.text.trim()).length > 0) { totalValueAtoms += 1; categories.push('Achievements') }
    if (projects.filter(p => p.title.trim()).length > 0) { totalValueAtoms += 1; categories.push('Projects') }
    
    const totalAtoms = 1 + totalValueAtoms // Profile + categories
    const totalTriples = totalValueAtoms
    const atomTripleFee = (totalAtoms + totalTriples) * 0.1
    const platformFee = 0.1
    const totalFee = atomTripleFee + platformFee
    
    return { totalFee, categories, totalValueAtoms, atomTripleFee, platformFee }
  })()

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 shadow-soft p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">Create Your Portfolio</h2>
        <p className="text-gray-600">Build your professional portfolio on the blockchain</p>
      </div>

      {/* Fee Breakdown */}
      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-900">Estimated Fee Breakdown</h3>
          <span className="text-lg font-bold text-primary">{feeBreakdown.totalFee.toFixed(4)} TRUST</span>
        </div>
        <div className="text-xs text-gray-600 space-y-1">
          <div className="flex justify-between">
            <span>Profile atom (1 × 0.1 TRUST)</span>
            <span>0.1 TRUST</span>
          </div>
          {feeBreakdown.categories.length > 0 && (
            <>
              <div className="flex justify-between">
                <span>Category atoms ({feeBreakdown.totalValueAtoms} × 0.1 TRUST)</span>
                <span>{(feeBreakdown.totalValueAtoms * 0.1).toFixed(4)} TRUST</span>
              </div>
              <div className="flex justify-between">
                <span>Category triples ({feeBreakdown.totalValueAtoms} × 0.1 TRUST)</span>
                <span>{(feeBreakdown.totalValueAtoms * 0.1).toFixed(4)} TRUST</span>
              </div>
              <div className="text-gray-500 mt-1">
                Categories: {feeBreakdown.categories.join(', ') || 'None'}
              </div>
            </>
          )}
          <div className="flex justify-between pt-1 border-t border-blue-200">
            <span className="font-semibold">Platform fee</span>
            <span className="font-semibold">0.1 TRUST</span>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Note: Each category (skills, tags, socials, achievements, projects) costs 0.2 TRUST total (0.1 for atom + 0.1 for triple), regardless of how many items you add.
        </p>
      </div>

      {/* Error Messages */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {writeError && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800">Transaction Error: {writeError.message}</p>
        </div>
      )}

      {isPaused && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">Portfolio creation is currently paused</p>
        </div>
      )}


      {/* Success Message */}
      {success && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm text-green-800 font-medium mb-2">
            Portfolio creation transaction confirmed!
          </p>
          {txHash && (
            <p className="text-xs text-green-700 mb-2">
              Transaction: <a href={`https://testnet.explorer.intuition.systems/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="underline">{txHash.slice(0, 10)}...{txHash.slice(-8)}</a>
            </p>
          )}
          {indexingStatus && (
            <p className="text-xs text-green-700">{indexingStatus}</p>
          )}
        </div>
      )}

      {/* Profile Section */}
      <section className="mb-8">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Profile Information</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input
              type="text"
              required
              value={profileData.name}
              onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              maxLength={100}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bio *</label>
            <textarea
              required
              value={profileData.bio}
              onChange={(e) => setProfileData({ ...profileData, bio: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              rows={3}
              maxLength={500}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={profileData.email}
                onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
              <input
                type="url"
                value={profileData.website}
                onChange={(e) => setProfileData({ ...profileData, website: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Profile Picture</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) {
                  const reader = new FileReader()
                  reader.onloadend = () => {
                    setProfileData({
                      ...profileData,
                      profilePicture: file,
                      profilePicturePreview: reader.result as string,
                    })
                  }
                  reader.readAsDataURL(file)
                }
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            />
            {profileData.profilePicturePreview && (
              <div className="mt-2">
                <img
                  src={profileData.profilePicturePreview}
                  alt="Profile preview"
                  className="w-24 h-24 rounded-full object-cover border border-gray-200"
                />
                <button
                  type="button"
                  onClick={() => setProfileData({ ...profileData, profilePicture: null, profilePicturePreview: '' })}
                  className="mt-2 text-sm text-red-600 hover:text-red-800"
                >
                  Remove image
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Skills Section */}
      <section className="mb-8">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Skills</h3>
        
        {/* Skills Dropdown */}
        <div className="mb-4 relative">
          <label className="block text-sm font-medium text-gray-700 mb-2">Select Skills</label>
          <button
            type="button"
            onClick={() => setShowSkillsDropdown(!showSkillsDropdown)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-left flex items-center justify-between bg-white"
          >
            <span className="text-gray-700">
              {selectedSkills.length > 0 ? `${selectedSkills.length} skill(s) selected` : 'Select skills...'}
            </span>
            <svg
              className={`w-5 h-5 text-gray-400 transition-transform ${showSkillsDropdown ? 'transform rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          
          {showSkillsDropdown && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowSkillsDropdown(false)}
              />
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-20 max-h-60 overflow-y-auto">
                {commonSkills.map((skill) => (
                  <label
                    key={skill}
                    className="flex items-center px-4 py-2 hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedSkills.includes(skill)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedSkills([...selectedSkills, skill])
                        } else {
                          setSelectedSkills(selectedSkills.filter(s => s !== skill))
                        }
                      }}
                      className="mr-3 w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                    />
                    <span className="text-sm text-gray-700">{skill}</span>
                  </label>
                ))}
              </div>
            </>
          )}
          
          {selectedSkills.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {selectedSkills.map((skill) => (
                <span
                  key={skill}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-primary/10 text-primary rounded-full text-sm"
                >
                  {skill}
                  <button
                    type="button"
                    onClick={() => setSelectedSkills(selectedSkills.filter(s => s !== skill))}
                    className="hover:text-red-600"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Custom Skills with Experience and Level */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">Add Custom Skill</label>
            <button
              type="button"
              onClick={() => setCustomSkills([...customSkills, { name: '', years: '', level: '' }])}
              className="text-sm text-primary hover:text-[#0052CC]"
            >
              + Add Custom Skill
            </button>
          </div>
          <div className="space-y-2">
            {customSkills.map((skill, index) => (
              <div key={index} className="grid grid-cols-12 gap-2">
                <input
                  type="text"
                  value={skill.name}
                  onChange={(e) => {
                    const newSkills = [...customSkills]
                    newSkills[index].name = e.target.value
                    setCustomSkills(newSkills)
                  }}
                  className="col-span-4 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="Skill name"
                  maxLength={100}
                />
                <input
                  type="number"
                  value={skill.years}
                  onChange={(e) => {
                    const newSkills = [...customSkills]
                    newSkills[index].years = e.target.value
                    setCustomSkills(newSkills)
                  }}
                  className="col-span-3 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="Years"
                  min="0"
                  max="50"
                />
                <select
                  value={skill.level}
                  onChange={(e) => {
                    const newSkills = [...customSkills]
                    newSkills[index].level = e.target.value
                    setCustomSkills(newSkills)
                  }}
                  className="col-span-3 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                >
                  <option value="">Level</option>
                  <option value="Beginner">Beginner</option>
                  <option value="Intermediate">Intermediate</option>
                  <option value="Advanced">Advanced</option>
                  <option value="Expert">Expert</option>
                </select>
                <button
                  type="button"
                  onClick={() => setCustomSkills(customSkills.filter((_, i) => i !== index))}
                  className="col-span-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tags Section */}
      <section className="mb-8">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Tags</h3>
        
        {/* Tags Dropdown */}
        <div className="mb-4 relative">
          <label className="block text-sm font-medium text-gray-700 mb-2">Select Tags</label>
          <button
            type="button"
            onClick={() => setShowTagsDropdown(!showTagsDropdown)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-left flex items-center justify-between bg-white"
          >
            <span className="text-gray-700">
              {selectedTags.length > 0 ? `${selectedTags.length} tag(s) selected` : 'Select tags...'}
            </span>
            <svg
              className={`w-5 h-5 text-gray-400 transition-transform ${showTagsDropdown ? 'transform rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          
          {showTagsDropdown && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowTagsDropdown(false)}
              />
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-20 max-h-60 overflow-y-auto">
                {commonTags.map((tag) => (
                  <label
                    key={tag}
                    className="flex items-center px-4 py-2 hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedTags.includes(tag)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedTags([...selectedTags, tag])
                        } else {
                          setSelectedTags(selectedTags.filter(t => t !== tag))
                        }
                      }}
                      className="mr-3 w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                    />
                    <span className="text-sm text-gray-700">{tag}</span>
                  </label>
                ))}
              </div>
            </>
          )}
          
          {selectedTags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {selectedTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-primary/10 text-primary rounded-full text-sm"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => setSelectedTags(selectedTags.filter(t => t !== tag))}
                    className="hover:text-red-600"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Custom Tags */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">Add Custom Tag</label>
            <button
              type="button"
              onClick={() => setCustomTags([...customTags, ''])}
              className="text-sm text-primary hover:text-[#0052CC]"
            >
              + Add Custom Tag
            </button>
          </div>
          <div className="space-y-2">
            {customTags.map((tag, index) => (
              <div key={index} className="flex gap-2">
                <input
                  type="text"
                  value={tag}
                  onChange={(e) => {
                    const newTags = [...customTags]
                    newTags[index] = e.target.value
                    setCustomTags(newTags)
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="e.g., Blockchain Expert, UI/UX Designer"
                  maxLength={50}
                />
                <button
                  type="button"
                  onClick={() => setCustomTags(customTags.filter((_, i) => i !== index))}
                  className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Social Links Section */}
      <section className="mb-8">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Social Links</h3>
        
        {/* Common Social Platforms Toggles */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Select Social Platforms</label>
          <div className="flex flex-wrap gap-2">
            {socialPlatforms.map((platform) => (
              <button
                key={platform}
                type="button"
                onClick={() => {
                  const newSet = new Set(selectedSocials)
                  if (newSet.has(platform)) {
                    newSet.delete(platform)
                  } else {
                    newSet.add(platform)
                  }
                  setSelectedSocials(newSet)
                }}
                className={`px-4 py-2 rounded-lg border transition-all ${
                  selectedSocials.has(platform)
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-primary'
                }`}
              >
                {platform}
              </button>
            ))}
          </div>
        </div>

        {/* URLs for Selected Platforms */}
        {selectedSocials.size > 0 && (
          <div className="mb-4 p-4 bg-gray-50 rounded-lg">
            <label className="block text-sm font-medium text-gray-700 mb-2">Add URLs for Selected Platforms</label>
            <div className="space-y-2">
              {Array.from(selectedSocials).map((platform) => (
                <div key={platform} className="flex gap-2 items-center">
                  <label className="w-24 text-sm text-gray-600">{platform}:</label>
                  <input
                    type="url"
                    value={selectedSocialUrls.get(platform) || ''}
                    onChange={(e) => {
                      const newMap = new Map(selectedSocialUrls)
                      newMap.set(platform, e.target.value)
                      setSelectedSocialUrls(newMap)
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder={`${platform} URL`}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Custom Social Links */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">Other Social Links</label>
            <button
              type="button"
              onClick={() => setCustomSocials([...customSocials, { platform: '', url: '' }])}
              className="text-sm text-primary hover:text-[#0052CC]"
            >
              + Add Other
            </button>
          </div>
          <div className="space-y-2">
            {customSocials.filter(s => !selectedSocials.has(s.platform)).map((social, index) => (
              <div key={index} className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  value={social.platform}
                  onChange={(e) => {
                    const newSocials = [...customSocials]
                    newSocials[index].platform = e.target.value
                    setCustomSocials(newSocials)
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="Platform"
                />
                <input
                  type="url"
                  value={social.url}
                  onChange={(e) => {
                    const newSocials = [...customSocials]
                    newSocials[index].url = e.target.value
                    setCustomSocials(newSocials)
                  }}
                  className="col-span-2 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="URL"
                />
                <button
                  type="button"
                  onClick={() => setCustomSocials(customSocials.filter((_, i) => i !== index))}
                  className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Achievements Section */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-gray-900">Achievements</h3>
          <button
            type="button"
            onClick={() => setAchievements([...achievements, { text: '', link: '' }])}
            disabled={achievements.length >= 50}
            className="text-sm text-primary hover:text-[#0052CC] disabled:text-gray-400"
          >
            + Add Achievement
          </button>
        </div>
        <div className="space-y-2">
          {achievements.map((achievement, index) => (
            <div key={index} className="space-y-2">
              <textarea
                value={achievement.text}
                onChange={(e) => {
                  const newAchievements = [...achievements]
                  newAchievements[index].text = e.target.value
                  setAchievements(newAchievements)
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="e.g., Won Best Developer Award 2024"
                rows={2}
                maxLength={500}
              />
              <div className="flex gap-2">
                <input
                  type="url"
                  value={achievement.link}
                  onChange={(e) => {
                    const newAchievements = [...achievements]
                    newAchievements[index].link = e.target.value
                    setAchievements(newAchievements)
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="Link (optional)"
                />
                {achievements.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setAchievements(achievements.filter((_, i) => i !== index))}
                    className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Projects Section */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-gray-900">Projects</h3>
          <button
            type="button"
            onClick={() => setProjects([...projects, { title: '', description: '', imageFile: null, imagePreview: '', externalLink: '' }])}
            disabled={projects.length >= 50}
            className="text-sm text-primary hover:text-[#0052CC] disabled:text-gray-400"
          >
            + Add Project
          </button>
        </div>
        <div className="space-y-4">
          {projects.map((project, index) => (
            <div key={index} className="p-4 border border-gray-200 rounded-lg">
              <div className="space-y-2">
                <input
                  type="text"
                  value={project.title}
                  onChange={(e) => {
                    const newProjects = [...projects]
                    newProjects[index].title = e.target.value
                    setProjects(newProjects)
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="Project Title *"
                  required
                />
                <textarea
                  value={project.description}
                  onChange={(e) => {
                    const newProjects = [...projects]
                    newProjects[index].description = e.target.value
                    setProjects(newProjects)
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="Project Description *"
                  rows={3}
                  required
                />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) {
                          const reader = new FileReader()
                          reader.onloadend = () => {
                            const newProjects = [...projects]
                            newProjects[index].imageFile = file
                            newProjects[index].imagePreview = reader.result as string
                            setProjects(newProjects)
                          }
                          reader.readAsDataURL(file)
                        }
                      }}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                    {project.imagePreview && (
                      <div className="mt-2">
                        <img
                          src={project.imagePreview}
                          alt="Project preview"
                          className="w-full h-32 object-cover rounded-lg border border-gray-200"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const newProjects = [...projects]
                            newProjects[index].imageFile = null
                            newProjects[index].imagePreview = ''
                            setProjects(newProjects)
                          }}
                          className="mt-1 text-xs text-red-600 hover:text-red-800"
                        >
                          Remove image
                        </button>
                      </div>
                    )}
                  </div>
                  <input
                    type="url"
                    value={project.externalLink}
                    onChange={(e) => {
                      const newProjects = [...projects]
                      newProjects[index].externalLink = e.target.value
                      setProjects(newProjects)
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder="External Link (optional)"
                  />
                </div>
                <input
                  type="text"
                  value={project.category || ''}
                  onChange={(e) => {
                    const newProjects = [...projects]
                    newProjects[index].category = e.target.value
                    setProjects(newProjects)
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="Category (optional)"
                />
              </div>
              {projects.length > 1 && (
                <button
                  type="button"
                  onClick={() => setProjects(projects.filter((_, i) => i !== index))}
                  className="mt-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg"
                >
                  Remove Project
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Showcase Your Work Section */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Showcase Your Work</h2>
        <p className="text-sm text-gray-600 mb-4">
          Upload images of your work to showcase your portfolio. Images will be stored on IPFS.
        </p>
        
        <div className="space-y-4">
          {/* Image Upload Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {showcaseImages.map((image, index) => (
              <div key={index} className="relative group">
                <div className="aspect-square border-2 border-dashed border-gray-300 rounded-lg overflow-hidden bg-gray-50">
                  {image.preview ? (
                    <img
                      src={image.preview}
                      alt={`Showcase ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const newImages = showcaseImages.filter((_, i) => i !== index)
                    setShowcaseImages(newImages)
                  }}
                  className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
            
            {/* Add Image Button */}
            {showcaseImages.length < 200 && (
              <label className="aspect-square border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors flex items-center justify-center">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      const reader = new FileReader()
                      reader.onloadend = () => {
                        setShowcaseImages([...showcaseImages, { file, preview: reader.result as string }])
                      }
                      reader.readAsDataURL(file)
                    }
                  }}
                />
                <div className="text-center">
                  <svg className="w-8 h-8 mx-auto text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span className="text-sm text-gray-600">Add Image</span>
                </div>
              </label>
            )}
          </div>
          
          {showcaseImages.length >= 200 && (
            <p className="text-sm text-amber-600">Maximum 200 images reached</p>
          )}
        </div>
      </section>

      {/* Submit Buttons */}
      <div className="flex gap-4 justify-end">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={isPending || isPaused || uploadingImages}
          className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-[#0052CC] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploadingImages ? 'Uploading Images...' : isPending ? 'Creating Portfolio...' : 'Create Portfolio'}
        </button>
      </div>
    </form>
  )
}

