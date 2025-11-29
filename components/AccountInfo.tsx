'use client'

import { useAccount } from 'wagmi'
import { useState } from 'react'

interface AccountInfoProps {
  accountInfo: {
    atoms: any[]
    triples: any[]
    recentAtoms: any[]
    loading: boolean
  } | null
  onRefresh?: () => void
}

export function AccountInfo({ accountInfo, onRefresh }: AccountInfoProps) {
  const { address, isConnected } = useAccount()
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleRefresh = async () => {
    if (onRefresh) {
      setIsRefreshing(true)
      try {
        await onRefresh()
      } finally {
        setTimeout(() => setIsRefreshing(false), 1000)
      }
    }
  }

  if (!isConnected || !address) {
    return null
  }

  if (!accountInfo) {
    return (
      <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
        <p className="text-sm text-gray-600">Connect your wallet to see account information</p>
      </div>
    )
  }

  if (accountInfo.loading) {
    return (
      <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm text-gray-600">Loading account information...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Account Summary */}
      <div className="p-6 bg-white rounded-lg border border-gray-200 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Account Overview</h2>
          {onRefresh && (
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="px-3 py-1.5 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              <svg 
                className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          )}
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-gray-600 mb-1">Your Atoms</p>
            <p className="text-2xl font-bold text-blue-600">{accountInfo.atoms.length}</p>
          </div>
          <div className="p-4 bg-green-50 rounded-lg">
            <p className="text-sm text-gray-600 mb-1">Triples</p>
            <p className="text-2xl font-bold text-green-600">{accountInfo.triples.length}</p>
          </div>
          <div className="p-4 bg-purple-50 rounded-lg">
            <p className="text-sm text-gray-600 mb-1">Address</p>
            <p className="text-xs font-mono text-purple-600 break-all">
              {address?.slice(0, 6)}...{address?.slice(-4)}
            </p>
          </div>
        </div>
      </div>

      {/* Your Atoms */}
      {accountInfo.atoms.length > 0 && (
        <div className="p-6 bg-white rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Your Atoms ({accountInfo.atoms.length})</h3>
          <div className="space-y-3">
            {accountInfo.atoms.slice(0, 10).map((atom: any, index: number) => {
              // Parse atom data if it's a JSON object or string
              let atomData: any = {}
              try {
                if (typeof atom.data === 'string') {
                  // Skip if it's just a type description like "json object" or "JsonObject"
                  if (atom.data.toLowerCase().includes('json') && atom.data.length < 50) {
                    atomData = {}
                  } else {
                    atomData = JSON.parse(atom.data)
                  }
                } else if (atom.data && typeof atom.data === 'object') {
                  atomData = atom.data
                }
              } catch (e) {
                // If parsing fails, use empty object
                atomData = {}
              }
              
              // Get atom name from various sources
              // Skip atom.label if it's just a type description like "json object" or "JsonObject"
              let atomLabel = atom.label
              if (atomLabel && (atomLabel.toLowerCase().includes('json') || atomLabel === 'JsonObject')) {
                atomLabel = null // Ignore this label
              }
              
              // Prioritize parsed data over label
              let atomName = atomData.name || atomLabel || atomData.type || atom.type || 'Unnamed Atom'
              const atomType = atom.type || atomData.type || 'Unknown'
              
              // If atomName is still generic, try to get something meaningful
              if ((atomName === 'Unnamed Atom' || atomName === 'json object' || atomName === 'JsonObject')) {
                if (atomData.bio) {
                  atomName = atomData.bio.substring(0, 30) + (atomData.bio.length > 30 ? '...' : '')
                } else if (atomData.email) {
                  const emailName = atomData.email.split('@')[0]
                  atomName = emailName.charAt(0).toUpperCase() + emailName.slice(1)
                } else if (atomData.twitter) {
                  atomName = atomData.twitter.replace('@', '')
                } else if (atomData.github) {
                  atomName = atomData.github
                }
              }
              
              return (
                <div
                  key={atom.term_id || atom.id || index}
                  className="p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-blue-300 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    {atom.emoji && (
                      <span className="text-2xl">{atom.emoji}</span>
                    )}
                    {atom.image && (
                      <img 
                        src={atom.image} 
                        alt={atomName}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h4 className="font-semibold text-gray-900 truncate">
                          {atomName !== 'Unnamed Atom' && atomName !== 'json object' && atomName !== 'JsonObject' ? atomName : (atomData.name || atomData.bio?.substring(0, 20) || 'Unnamed Atom')}
                        </h4>
                        {atomType && atomType !== 'Unknown' && (
                          <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">
                            {atomType}
                          </span>
                        )}
                      </div>
                      
                      {/* Display atom data if available */}
                      {atomData && Object.keys(atomData).length > 0 && (
                        <div className="mt-2 text-xs text-gray-600 space-y-1">
                          {atomData.name && (
                            <p className="font-medium text-gray-900">{atomData.name}</p>
                          )}
                          {atomData.bio && (
                            <p className="truncate">{atomData.bio}</p>
                          )}
                          {atomData.email && (
                            <p>📧 {atomData.email}</p>
                          )}
                          {atomData.website && (
                            <p>🌐 <a href={atomData.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{atomData.website}</a></p>
                          )}
                          {atomData.twitter && (
                            <p>🐦 <a href={`https://twitter.com/${atomData.twitter.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{atomData.twitter}</a></p>
                          )}
                          {atomData.github && (
                            <p>💻 <a href={`https://github.com/${atomData.github}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{atomData.github}</a></p>
                          )}
                        </div>
                      )}
                      
                      {atom.term_id && (
                        <p className="text-xs text-gray-500 font-mono truncate mt-1">
                          ID: {atom.term_id}
                        </p>
                      )}
                      {atom.created_at && (
                        <p className="text-xs text-gray-400 mt-1">
                          Created: {new Date(atom.created_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Recent Atoms (Discovery) */}
      {accountInfo.recentAtoms.length > 0 && (
        <div className="p-6 bg-white rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Atoms (Discovery)</h3>
          <div className="space-y-3">
            {accountInfo.recentAtoms.slice(0, 10).map((atom: any, index: number) => {
              // Parse atom data if it's a JSON object or string
              let atomData: any = {}
              try {
                if (typeof atom.data === 'string') {
                  atomData = JSON.parse(atom.data)
                } else if (atom.data && typeof atom.data === 'object') {
                  atomData = atom.data
                }
              } catch (e) {
                // If parsing fails, use empty object
                atomData = {}
              }
              
              const atomName = atom.label || atomData.name || atomData.type || atom.type || 'Unnamed Atom'
              const atomType = atom.type || atomData.type || 'Unknown'
              const creatorLabel = atom.creator?.label || atom.creator?.id || atom.creator_id || 'Unknown'
              
              return (
                <div
                  key={atom.term_id || atom.id || index}
                  className="p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-purple-300 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    {atom.emoji && (
                      <span className="text-2xl">{atom.emoji}</span>
                    )}
                    {atom.image && (
                      <img 
                        src={atom.image} 
                        alt={atomName}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h4 className="font-semibold text-gray-900 truncate">
                          {atomName}
                        </h4>
                        <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded">
                          {atomType}
                        </span>
                      </div>
                      
                      {/* Display atom data if available */}
                      {atomData && Object.keys(atomData).length > 0 && atomType === 'User' && (
                        <div className="mt-2 text-xs text-gray-600 space-y-1">
                          {atomData.bio && (
                            <p className="truncate">{atomData.bio}</p>
                          )}
                          {atomData.email && (
                            <p>📧 {atomData.email}</p>
                          )}
                        </div>
                      )}
                      
                      {creatorLabel && (
                        <p className="text-xs text-gray-500 mt-1">
                          Created by: {creatorLabel.length > 20 
                            ? creatorLabel.slice(0, 6) + '...' + creatorLabel.slice(-4)
                            : creatorLabel}
                        </p>
                      )}
                      {atom.created_at && (
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(atom.created_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Triples */}
      {accountInfo.triples.length > 0 && (
        <div className="p-6 bg-white rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Your Triples</h3>
          <div className="space-y-2">
            {accountInfo.triples.slice(0, 10).map((triple: any, index: number) => (
              <div
                key={triple.id || index}
                className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-gray-600">
                    {triple.subject?.slice(0, 8)}...
                  </span>
                  <span className="text-gray-400">→</span>
                  <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">
                    {triple.predicate}
                  </span>
                  <span className="text-gray-400">→</span>
                  <span className="font-mono text-xs text-gray-600">
                    {triple.object?.slice(0, 8)}...
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {accountInfo.atoms.length === 0 && accountInfo.triples.length === 0 && (
        <div className="p-6 bg-gray-50 rounded-lg border border-gray-200 text-center">
          <p className="text-gray-600 mb-2">No atoms or triples found for this account</p>
          <p className="text-sm text-gray-500">
            Create your first atom to get started!
          </p>
        </div>
      )}
    </div>
  )
}

