'use client'

import { useState, useEffect } from 'react'
import { useAccount, usePublicClient } from 'wagmi'
import { fetchAllPortfolios, fetchPortfoliosByCreator, Portfolio } from '@/lib/portfolioFetcher'
import { PortfolioCreateForm } from './PortfolioCreateForm'
import { PortfolioDetail } from './PortfolioDetail'

export function PortfolioShowcase() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [filter, setFilter] = useState<'all' | 'mine'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [skillFilter, setSkillFilter] = useState<string>('')
  const [tagFilter, setTagFilter] = useState<string>('')
  const [showFilterMenu, setShowFilterMenu] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)

  const loadPortfolios = async () => {
    setLoading(true)
    try {
      console.log('[INFO] ========== Loading portfolios ==========')
      console.log('[INFO] Filter:', filter, 'Address:', address)
      
      if (filter === 'mine' && address) {
        // Try reading portfolio ID from contract, then fetch from GraphQL
        if (publicClient) {
          try {
            const PORTFOLIO_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_PORTFOLIO_CONTRACT_ADDRESS as `0x${string}`
            if (PORTFOLIO_CONTRACT_ADDRESS && PORTFOLIO_CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000') {
              const PORTFOLIO_CONTRACT_ABI = [
                {
                  name: 'userPortfolioAtoms',
                  type: 'function',
                  stateMutability: 'view',
                  inputs: [{ name: '', type: 'address' }],
                  outputs: [{ name: '', type: 'bytes32' }],
                },
              ] as const

              const profileId = await publicClient.readContract({
                address: PORTFOLIO_CONTRACT_ADDRESS,
                abi: PORTFOLIO_CONTRACT_ABI,
                functionName: 'userPortfolioAtoms',
                args: [address as `0x${string}`],
              }) as `0x${string}`

              console.log('[INFO] Contract read result - profileId:', profileId)
              console.log('[INFO] Is zero address?', profileId === '0x0000000000000000000000000000000000000000000000000000000000000000')

              if (profileId && profileId !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
                console.log('[INFO] Found portfolio ID from contract:', profileId)
                console.log('[INFO] Portfolio ID (full):', profileId)
                // Fetch from GraphQL (datavass)
                const { fetchPortfolioByProfileId } = await import('@/lib/portfolioFetcher')
                console.log('[INFO] Attempting to fetch portfolio from datavass...')
                
                // Try multiple times with delays (GraphQL indexing can take time)
                let myPortfolio = null
                for (let attempt = 0; attempt < 3; attempt++) {
                  if (attempt > 0) {
                    console.log(`[INFO] Retry attempt ${attempt + 1}/3, waiting 2 seconds...`)
                    await new Promise(resolve => setTimeout(resolve, 2000))
                  }
                  myPortfolio = await fetchPortfolioByProfileId(profileId)
                  if (myPortfolio) {
                    console.log(`[INFO] Portfolio found on attempt ${attempt + 1}`)
                    break
                  }
                }
                
                console.log('[INFO] fetchPortfolioByProfileId result:', myPortfolio ? 'SUCCESS' : 'NULL')
                if (myPortfolio) {
                  console.log('[INFO] Portfolio fetched from datavass:', {
                    profileId: myPortfolio.profileId,
                    hasProfileData: !!myPortfolio.profileData,
                    profileDataKeys: myPortfolio.profileData ? Object.keys(myPortfolio.profileData) : [],
                    profileName: myPortfolio.profileData?.name,
                    profileBio: myPortfolio.profileData?.bio,
                    skillsCount: myPortfolio.skills.length,
                    tagsCount: myPortfolio.tags.length,
                  })
                  console.log('[INFO] Setting portfolios state with:', [myPortfolio])
                  setPortfolios([myPortfolio])
                  console.log('[INFO] Portfolio state updated')
                  return
                } else {
                  console.log('[WARN] Portfolio ID found in contract but not indexed in GraphQL yet')
                  console.log('[WARN] Portfolio ID:', profileId)
                  console.log('[WARN] This is normal - GraphQL indexing can take 2-5 minutes')
                  console.log('[WARN] Please wait a few minutes and refresh, or check the transaction on the block explorer')
                }
              } else {
                console.log('[INFO] No portfolio ID found in contract for address:', address)
                console.log('[INFO] This means no portfolio has been created yet for this address')
              }
            }
          } catch (error) {
            console.error('[ERROR] Error reading from contract:', error)
          }
        }
        // Fallback to GraphQL query by creator
        console.log('[INFO] Falling back to GraphQL query by creator')
        const myPortfolios = await fetchPortfoliosByCreator(address)
        console.log('[INFO] Found', myPortfolios.length, 'portfolios for creator')
        if (myPortfolios.length > 0) {
          console.log('[INFO] Setting portfolios from creator query:', myPortfolios.map(p => p.profileId.slice(0, 10)))
        }
        setPortfolios(myPortfolios)
      } else {
        console.log('[INFO] Loading ALL portfolios from datavass')
        const allPortfolios = await fetchAllPortfolios(50)
        console.log('[INFO] Found', allPortfolios.length, 'total portfolios from datavass')
        if (allPortfolios.length > 0) {
          console.log('[INFO] Portfolio IDs:', allPortfolios.map(p => p.profileId.slice(0, 10)))
          console.log('[INFO] Portfolio names:', allPortfolios.map(p => p.profileData?.name || 'No name'))
        } else {
          console.log('[WARN] No portfolios found!')
          console.log('[WARN] This could mean:')
          console.log('[WARN] 1. No portfolios have been created yet')
          console.log('[WARN] 2. Portfolios are not indexed in GraphQL yet')
          console.log('[WARN] 3. GraphQL query failed or returned no results')
          console.log('[WARN] 4. Contract address mismatch (check .env.local)')
        }
        setPortfolios(allPortfolios)
      }
    } catch (error) {
      console.error('[ERROR] Error loading portfolios:', error)
      setPortfolios([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPortfolios()
  }, [address, filter, refreshKey])

  // Debug: Log portfolios state changes
  useEffect(() => {
    console.log('[DEBUG] Portfolios state changed:', {
      count: portfolios.length,
      portfolios: portfolios.map(p => ({
        profileId: p.profileId?.slice(0, 20),
        hasProfileData: !!p.profileData,
        name: p.profileData?.name,
        bio: p.profileData?.bio?.slice(0, 50),
        skillsCount: p.skills.length,
      })),
    })
  }, [portfolios])

  const handleCreateSuccess = () => {
    setShowCreateForm(false)
    // Refresh portfolios after creation
    setTimeout(() => {
      window.location.reload()
    }, 5000) // Wait 5 seconds for indexing
  }

  // Filter portfolios based on search and filters
  const filteredPortfolios = portfolios.filter(portfolio => {
    // Search query filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      const matchesSearch = 
        portfolio.profileData.name?.toLowerCase().includes(query) ||
        portfolio.profileData.bio?.toLowerCase().includes(query) ||
        portfolio.skills.some(skill => skill.toLowerCase().includes(query)) ||
        portfolio.tags.some(tag => tag.toLowerCase().includes(query)) ||
        portfolio.projects.some(project => 
          project.title?.toLowerCase().includes(query) ||
          project.description?.toLowerCase().includes(query)
        ) ||
        portfolio.achievements.some(achievement => achievement.toLowerCase().includes(query))
      
      if (!matchesSearch) return false
    }

    // Skill filter
    if (skillFilter) {
      const hasSkill = portfolio.skills.some(skill => 
        skill.toLowerCase().includes(skillFilter.toLowerCase())
      )
      if (!hasSkill) return false
    }

    // Tag filter
    if (tagFilter) {
      const hasTag = portfolio.tags.some(tag => 
        tag.toLowerCase().includes(tagFilter.toLowerCase())
      )
      if (!hasTag) return false
    }

    return true
  })

  // Get unique skills and tags for filter dropdowns
  const allSkills = Array.from(new Set(portfolios.flatMap(p => p.skills))).sort()
  const allTags = Array.from(new Set(portfolios.flatMap(p => p.tags))).sort()

  if (showCreateForm) {
    return (
      <div className="container mx-auto px-4 py-16">
        <button
          onClick={() => setShowCreateForm(false)}
          className="mb-6 text-primary hover:text-[#0052CC] flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Hub
        </button>
        <PortfolioCreateForm onSuccess={handleCreateSuccess} onCancel={() => setShowCreateForm(false)} />
      </div>
    )
  }

  // Show portfolio detail if one is selected (after all hooks are called)
  if (selectedProfileId) {
    return (
      <div className="container mx-auto px-4 py-16">
        <PortfolioDetail
          profileId={selectedProfileId}
          onBack={() => setSelectedProfileId(null)}
        />
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-16">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-8">
        <div>
          <h1 className="text-4xl md:text-5xl font-bold mb-3 text-gray-900">Hub</h1>
          <p className="text-lg text-gray-600 font-light">
            Discover creators and their verified work on the blockchain
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setRefreshKey(prev => prev + 1)
            }}
            disabled={loading}
            className="h-11 w-11 border border-gray-200 rounded-full text-gray-700 hover:bg-gray-50 disabled:opacity-50 flex items-center justify-center shadow-sm transition-all"
            title="Refresh"
            aria-label="Refresh"
          >
            <svg 
              className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          {isConnected && (
            <>
              <button
                onClick={() => setFilter(filter === 'all' ? 'mine' : 'all')}
                className={`h-11 w-11 rounded-full border flex items-center justify-center transition-all shadow-sm ${
                  filter === 'mine'
                    ? 'bg-primary border-primary text-white hover:bg-[#0052CC]'
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
                title={filter === 'mine' ? 'Viewing My Hub' : 'Viewing All Hubs'}
                aria-label={filter === 'mine' ? 'Viewing My Hub' : 'Viewing All Hubs'}
              >
                {filter === 'mine' ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A4 4 0 0112 15a4 4 0 016.879 2.804M12 11a4 4 0 100-8 4 4 0 000 8z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )}
              </button>
              <button
                onClick={() => setShowCreateForm(true)}
                className="h-11 w-11 bg-primary text-white rounded-full font-semibold hover:bg-[#0052CC] transition-all flex items-center justify-center shadow-sm"
                title="Create Hub"
                aria-label="Create Hub"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Search and Filter Bar */}
      <div className="mb-8 space-y-4">
        {/* Search Bar */}
        <div className="relative">
          <svg 
            className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search portfolios by name, skills, tags, projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Filter Row */}
        <div className="flex items-center gap-3">
          {/* Filter Button */}
          <div className="relative">
            <button
              onClick={() => setShowFilterMenu(!showFilterMenu)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${
                (skillFilter || tagFilter)
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              <span className="text-sm font-medium">Filters</span>
              {(skillFilter || tagFilter) && (
                <span className="ml-1 px-2 py-0.5 bg-white/20 rounded-full text-xs font-semibold">
                  {[skillFilter, tagFilter].filter(Boolean).length}
                </span>
              )}
            </button>

            {/* Filter Dropdown Menu */}
            {showFilterMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowFilterMenu(false)}
                />
                <div className="absolute top-full left-0 mt-2 w-80 bg-white rounded-xl border border-gray-200 shadow-lg z-20 p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-gray-900">Filter Portfolios</h3>
                    <button
                      onClick={() => setShowFilterMenu(false)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="space-y-4">
                    {/* Skill Filter */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Filter by Skill
                      </label>
                      <select
                        value={skillFilter}
                        onChange={(e) => {
                          setSkillFilter(e.target.value)
                          if (e.target.value) {
                            setShowFilterMenu(false)
                          }
                        }}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
                      >
                        <option value="">All Skills</option>
                        {allSkills.map((skill) => (
                          <option key={skill} value={skill}>
                            {skill}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Tag Filter */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Filter by Tag
                      </label>
                      <select
                        value={tagFilter}
                        onChange={(e) => {
                          setTagFilter(e.target.value)
                          if (e.target.value) {
                            setShowFilterMenu(false)
                          }
                        }}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
                      >
                        <option value="">All Tags</option>
                        {allTags.map((tag) => (
                          <option key={tag} value={tag}>
                            {tag}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Clear Filters Button */}
                    {(skillFilter || tagFilter) && (
                      <button
                        onClick={() => {
                          setSkillFilter('')
                          setTagFilter('')
                        }}
                        className="w-full px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        Clear All Filters
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Active Filter Tags */}
          {(skillFilter || tagFilter) && (
            <div className="flex flex-wrap gap-2">
              {skillFilter && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary rounded-full text-sm font-medium">
                  <span>Skill: {skillFilter}</span>
                  <button
                    onClick={() => setSkillFilter('')}
                    className="hover:bg-primary/20 rounded-full p-0.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              )}
              {tagFilter && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary rounded-full text-sm font-medium">
                  <span>Tag: {tagFilter}</span>
                  <button
                    onClick={() => setTagFilter('')}
                    className="hover:bg-primary/20 rounded-full p-0.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Results Count */}
        {!loading && (
          <div className="text-sm text-gray-600">
            Showing {filteredPortfolios.length} of {portfolios.length} portfolios
            {(searchQuery || skillFilter || tagFilter) && ' (filtered)'}
          </div>
        )}
      </div>

      {/* Loading State */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-soft p-6 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
              <div className="h-3 bg-gray-200 rounded w-full mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-5/6"></div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && portfolios.length === 0 && (
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <p className="text-gray-600 mb-6">
            {filter === 'mine' ? "You haven't created any portfolios yet." : 'No portfolios found.'}
          </p>
          {isConnected && (
            <button
              onClick={() => setShowCreateForm(true)}
              className="inline-flex items-center px-6 py-3 bg-primary text-white rounded-full font-semibold hover:bg-[#0052CC] transition-all gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Create Your First Portfolio
            </button>
          )}
        </div>
      )}

      {/* Portfolio Grid */}
      {!loading && filteredPortfolios.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPortfolios.map((portfolio) => (
            <PortfolioCard 
              key={portfolio.profileId} 
              portfolio={portfolio}
              onClick={() => setSelectedProfileId(portfolio.profileId)}
            />
          ))}
        </div>
      )}

      {/* No Results (Filtered) */}
      {!loading && portfolios.length > 0 && filteredPortfolios.length === 0 && (
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <p className="text-gray-600 mb-2">No portfolios match your search criteria.</p>
          <button
            onClick={() => {
              setSearchQuery('')
              setSkillFilter('')
              setTagFilter('')
            }}
            className="text-primary hover:text-[#0052CC] text-sm font-medium"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  )
}

function PortfolioCard({ portfolio, onClick }: { portfolio: Portfolio; onClick: () => void }) {
  const formatAddress = (address: string) => {
    if (!address) return 'N/A'
    return address.slice(0, 6) + '...' + address.slice(-4)
  }

  return (
    <div 
      onClick={onClick}
      className="bg-white rounded-2xl border border-gray-100 shadow-soft hover:shadow-card-hover transition-all duration-300 hover:-translate-y-1 overflow-hidden cursor-pointer"
    >
      {/* Profile Header */}
      <div className="p-6">
        <div className="flex items-start gap-4 mb-4">
          {portfolio.profileData.profilePicture ? (
            <img
              src={portfolio.profileData.profilePicture}
              alt={portfolio.profileData.name || 'Profile'}
              className="w-12 h-12 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <span className="text-primary font-semibold text-lg">
                {portfolio.profileData.name?.[0]?.toUpperCase() || '?'}
              </span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-gray-900 mb-1 truncate">
              {portfolio.profileData.name || formatAddress(portfolio.creatorAddress)}
            </h3>
            <p className="text-xs text-gray-500 font-mono truncate">
              {formatAddress(portfolio.creatorAddress)}
            </p>
          </div>
        </div>

        {/* Bio */}
        {portfolio.profileData.bio && (
          <p className="text-sm text-gray-600 mb-4 line-clamp-2">
            {portfolio.profileData.bio}
          </p>
        )}

        {/* Skills */}
        {portfolio.skills.length > 0 && (
          <div className="mb-4">
            <div className="flex flex-wrap gap-2">
              {portfolio.skills.slice(0, 3).map((skill, index) => (
                <span
                  key={index}
                  className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20"
                >
                  {skill}
                </span>
              ))}
              {portfolio.skills.length > 3 && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                  +{portfolio.skills.length - 3}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="flex items-center gap-4 pt-4 border-t border-gray-100">
          {portfolio.projects.length > 0 && (
            <div className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <span className="text-xs text-gray-600">
                {portfolio.projects.length} {portfolio.projects.length === 1 ? 'project' : 'projects'}
              </span>
            </div>
          )}
          {portfolio.skills.length > 0 && (
            <div className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <span className="text-xs text-gray-600">
                {portfolio.skills.length} {portfolio.skills.length === 1 ? 'skill' : 'skills'}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

