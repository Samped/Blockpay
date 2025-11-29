'use client'

import { useState, useEffect } from 'react'
import { usePublicClient } from 'wagmi'
import { intuitionClient, Atom, TrustScore, Triple } from '@/lib/intuitionClient'

interface UserProfileProps {
  address: string
}

interface UserData {
  atom: Atom | null
  trustScore: TrustScore | null
  completedJobs: number
  createdArtworks: number
  bio: string
  name: string
  email: string
  website: string
  socialLinks: {
    twitter?: string
    github?: string
    behance?: string
    dribbble?: string
  }
}

export function UserProfile({ address }: UserProfileProps) {
  const publicClient = usePublicClient()
  const [userData, setUserData] = useState<UserData>({
    atom: null,
    trustScore: null,
    completedJobs: 0,
    createdArtworks: 0,
    bio: '',
    name: '',
    email: '',
    website: '',
    socialLinks: {},
  })
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({
    name: '',
    bio: '',
    email: '',
    website: '',
    twitter: '',
    github: '',
    behance: '',
    dribbble: '',
  })

  useEffect(() => {
    const fetchUserData = async () => {
      if (!address) return

      try {
        setLoading(true)
        console.log('🔍 Fetching user profile for address:', address)
        console.log('📡 Public client available:', !!publicClient)

        // Fetch user profile using GraphQL API, passing publicClient to check contract
        const profileData = await intuitionClient.getUserProfileData(address, publicClient || undefined)
        
        console.log('📊 Profile data received:', {
          hasAtom: !!profileData.atom,
          atomId: profileData.atom?.id,
          trustScore: profileData.trustScore?.score
        })
        
        const { atom: userAtom, trustScore, completedJobs, createdArtworks, profileData: atomData } = profileData

        if (!userAtom) {
          console.warn('⚠️ No atom found for address:', address)
          console.log('💡 This could mean:')
          console.log('   1. Atom was just created and GraphQL hasn\'t indexed it yet (wait 10-30 seconds)')
          console.log('   2. Atom was created with different data structure')
          console.log('   3. Query filters don\'t match the atom')
          console.log('   4. Atom exists but doesn\'t have type="User" set')
          
          // Try a direct query to see if ANY atoms exist for this creator
          try {
            const directQuery = `
              query CheckAtoms($address: String!) {
                atoms(
                  where: { creator_id: { _eq: $address } }
                  limit: 5
                  order_by: { created_at: desc }
                ) {
                  id
                  term_id
                  type
                  data
                  created_at
                }
              }
            `
            const response = await fetch('https://testnet.intuition.sh/v1/graphql', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                query: directQuery,
                variables: { address: address.toLowerCase() }
              })
            })
            const result = await response.json()
            if (result.data?.atoms?.length > 0) {
              console.log('🔍 Found', result.data.atoms.length, 'atoms created by this address:')
              result.data.atoms.forEach((atom: any, idx: number) => {
                console.log(`   ${idx + 1}. ID: ${atom.id?.substring(0, 30)}, Type: ${atom.type || 'null'}, Has data: ${!!atom.data}`)
              })
              console.log('💡 The query should have found these atoms. Check Strategy 1 logs above.')
            } else {
              console.log('🔍 Direct query also found 0 atoms - they may not be indexed yet')
            }
          } catch (checkError) {
            console.warn('Could not run diagnostic query:', checkError)
          }
        }

        // Extract user data from atom
        setUserData({
          atom: userAtom,
          trustScore,
          completedJobs,
          createdArtworks,
          bio: atomData.bio || '',
          name: atomData.name || '',
          email: atomData.email || '',
          website: atomData.website || '',
          socialLinks: {
            twitter: atomData.twitter || atomData.socialLinks?.twitter,
            github: atomData.github || atomData.socialLinks?.github,
            behance: atomData.behance || atomData.socialLinks?.behance,
            dribbble: atomData.dribbble || atomData.socialLinks?.dribbble,
          },
        })

        // Set edit form with current data
        setEditForm({
          name: atomData.name || '',
          bio: atomData.bio || '',
          email: atomData.email || '',
          website: atomData.website || '',
          twitter: atomData.twitter || atomData.socialLinks?.twitter || '',
          github: atomData.github || atomData.socialLinks?.github || '',
          behance: atomData.behance || atomData.socialLinks?.behance || '',
          dribbble: atomData.dribbble || atomData.socialLinks?.dribbble || '',
        })
      } catch (error) {
        console.error('❌ Error fetching user data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchUserData()
    
    // Also set up a refresh interval to check for newly indexed atoms
    const refreshInterval = setInterval(() => {
      if (!userData.atom && address) {
        console.log('🔄 Auto-refreshing profile data...')
        fetchUserData()
      }
    }, 10000) // Check every 10 seconds if no atom found

    return () => clearInterval(refreshInterval)
  }, [address])

  const handleSave = async () => {
    if (!userData.atom?.id) {
      console.error('Cannot save: No atom ID found')
      return
    }

    try {
      // Update atom data via GraphQL
      const updatedData = {
        ...(userData.atom.data || {}),
        name: editForm.name,
        bio: editForm.bio,
        email: editForm.email,
        website: editForm.website,
        twitter: editForm.twitter,
        github: editForm.github,
        behance: editForm.behance,
        dribbble: editForm.dribbble,
        updatedAt: new Date().toISOString()
      }

      const mutation = `
        mutation UpdateAtom($id: String!, $data: jsonb!) {
          update_atoms_by_pk(
            pk_columns: { id: $id }
            _set: { data: $data }
          ) {
            id
            data
          }
        }
      `

      const response = await fetch('https://testnet.intuition.sh/v1/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: mutation,
          variables: {
            id: userData.atom.id,
            data: updatedData
          }
        })
      })

      const result = await response.json()

      if (result.errors) {
        throw new Error(result.errors[0].message)
      }

      // Update local state
      setUserData({
        ...userData,
        name: editForm.name,
        bio: editForm.bio,
        email: editForm.email,
        website: editForm.website,
        socialLinks: {
          twitter: editForm.twitter,
          github: editForm.github,
          behance: editForm.behance,
          dribbble: editForm.dribbble,
        },
        atom: {
          ...userData.atom,
          data: updatedData
        }
      })

      setIsEditing(false)
      console.log('✓ Profile updated successfully')
    } catch (error) {
      console.error('Error saving profile:', error)
      alert('Failed to save profile. Please try again.')
    }
  }

  const getTrustLevel = (score: number | null) => {
    if (!score) return { level: 'New', color: 'bg-gray-100 text-gray-900' }
    if (score >= 8000) return { level: 'Elite', color: 'bg-gray-100 text-gray-900' }
    if (score >= 6000) return { level: 'Expert', color: 'bg-gray-100 text-gray-900' }
    if (score >= 4000) return { level: 'Pro', color: 'bg-gray-100 text-gray-900' }
    if (score >= 2000) return { level: 'Rising', color: 'bg-gray-100 text-gray-900' }
    return { level: 'New', color: 'bg-gray-100 text-gray-900' }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-card p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    )
  }

  // If no profile exists, show create profile message
  if (!userData.atom) {
    return (
      <div className="bg-white rounded-2xl shadow-card p-6">
        <div className="text-center py-12">
          <div className="mb-4">
            <svg className="mx-auto h-16 w-16 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No Profile Found</h3>
          <p className="text-gray-600 mb-4">
            {loading 
              ? 'Checking for your profile...' 
              : 'You haven\'t created a profile yet, or it hasn\'t been indexed yet. If you just created a profile, wait 10-30 seconds and refresh.'}
          </p>
          {!loading && (
            <>
              <div className="mb-6">
                <button
                  onClick={() => {
                    window.location.reload()
                  }}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors mr-2"
                >
                  🔄 Refresh
                </button>
                <button
                  onClick={() => {
                    // Trigger the UserInitialization modal to show
                    window.dispatchEvent(new CustomEvent('showCreateProfileModal'))
                  }}
                  className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-[#0052CC] transition-colors font-medium"
                >
                  Create Profile
                </button>
              </div>
              <p className="text-xs text-gray-500">
                💡 If you created a profile on-chain, it may take 10-30 seconds for GraphQL to index it.
              </p>
            </>
          )}
        </div>
      </div>
    )
  }

  const trustInfo = getTrustLevel(userData.trustScore?.score || null)

  return (
    <div className="bg-white rounded-2xl shadow-card p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Profile Information</h2>
        {!isEditing ? (
          <button
            onClick={() => setIsEditing(true)}
            className="px-4 py-2 text-sm font-medium rounded-full border border-gray-300 text-gray-900 hover:border-primary hover:text-primary transition-colors"
          >
            Edit Profile
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => {
                setIsEditing(false)
                setEditForm({
                  name: userData.name,
                  bio: userData.bio,
                  email: userData.email,
                  website: userData.website,
                  twitter: userData.socialLinks.twitter || '',
                  github: userData.socialLinks.github || '',
                  behance: userData.socialLinks.behance || '',
                  dribbble: userData.socialLinks.dribbble || '',
                })
              }}
              className="px-4 py-2 text-sm font-medium rounded-full border border-gray-300 text-gray-900 hover:border-gray-400 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm font-medium rounded-full bg-primary text-white hover:bg-[#0052CC] transition-colors"
            >
              Save Changes
            </button>
          </div>
        )}
      </div>

      <div className="space-y-6">
        {/* Wallet Address */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Wallet Address
          </label>
          <p className="text-sm text-gray-900 font-mono bg-gray-50 px-3 py-2 rounded-lg">
            {address}
          </p>
        </div>

        {/* Trust Score & Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-xs text-gray-600 mb-1">Trust Score</div>
            <div className="text-2xl font-bold text-primary">
              {userData.trustScore?.score.toLocaleString() || '0'}
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-xs text-gray-600 mb-1">Trust Level</div>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${trustInfo.color}`}>
              {trustInfo.level}
            </span>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-xs text-gray-600 mb-1">Completed Jobs</div>
            <div className="text-2xl font-bold text-gray-900">
              {userData.completedJobs}
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-xs text-gray-600 mb-1">Artworks</div>
            <div className="text-2xl font-bold text-gray-900">
              {userData.createdArtworks}
            </div>
          </div>
        </div>

        {/* Name */}
        {isEditing ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name
            </label>
            <input
              type="text"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="Your name"
            />
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name
            </label>
            <p className="text-sm text-gray-900">
              {userData.name || 'Not set'}
            </p>
          </div>
        )}

        {/* Bio */}
        {isEditing ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Bio
            </label>
            <textarea
              value={editForm.bio}
              onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="Tell us about yourself..."
            />
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Bio
            </label>
            <p className="text-sm text-gray-900 whitespace-pre-wrap">
              {userData.bio || 'No bio added yet'}
            </p>
          </div>
        )}

        {/* Contact Information */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {isEditing ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="your@email.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Website
                </label>
                <input
                  type="url"
                  value={editForm.website}
                  onChange={(e) => setEditForm({ ...editForm, website: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="https://yourwebsite.com"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <p className="text-sm text-gray-900">
                  {userData.email || 'Not set'}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Website
                </label>
                <p className="text-sm text-gray-900">
                  {userData.website ? (
                    <a href={userData.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      {userData.website}
                    </a>
                  ) : (
                    'Not set'
                  )}
                </p>
              </div>
            </>
          )}
        </div>

        {/* Social Links */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Social Links
          </label>
          {isEditing ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Twitter</label>
                <input
                  type="text"
                  value={editForm.twitter}
                  onChange={(e) => setEditForm({ ...editForm, twitter: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="@username"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">GitHub</label>
                <input
                  type="text"
                  value={editForm.github}
                  onChange={(e) => setEditForm({ ...editForm, github: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="username"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Behance</label>
                <input
                  type="text"
                  value={editForm.behance}
                  onChange={(e) => setEditForm({ ...editForm, behance: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="username"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Dribbble</label>
                <input
                  type="text"
                  value={editForm.dribbble}
                  onChange={(e) => setEditForm({ ...editForm, dribbble: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="username"
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {userData.socialLinks.twitter && (
                <a
                  href={`https://twitter.com/${userData.socialLinks.twitter.replace('@', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline"
                >
                  Twitter: {userData.socialLinks.twitter}
                </a>
              )}
              {userData.socialLinks.github && (
                <a
                  href={`https://github.com/${userData.socialLinks.github}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline"
                >
                  GitHub: {userData.socialLinks.github}
                </a>
              )}
              {userData.socialLinks.behance && (
                <a
                  href={`https://behance.net/${userData.socialLinks.behance}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline"
                >
                  Behance: {userData.socialLinks.behance}
                </a>
              )}
              {userData.socialLinks.dribbble && (
                <a
                  href={`https://dribbble.com/${userData.socialLinks.dribbble}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline"
                >
                  Dribbble: {userData.socialLinks.dribbble}
                </a>
              )}
              {!userData.socialLinks.twitter && !userData.socialLinks.github && 
               !userData.socialLinks.behance && !userData.socialLinks.dribbble && (
                <p className="text-sm text-gray-500">No social links added</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


