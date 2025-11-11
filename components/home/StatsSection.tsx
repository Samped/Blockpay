'use client'

import { useEffect, useState } from 'react'
import { intuitionClient } from '@/lib/intuitionClient'

export function StatsSection() {
  const [stats, setStats] = useState({
    creators: 0,
    jobs: 0,
    trustScore: 0,
    artworks: 0,
  })

  useEffect(() => {
    // Fetch real stats from Intuition API
    const fetchStats = async () => {
      try {
        const topCreators = await intuitionClient.getTopCreators(1)
        // In a real implementation, you'd fetch actual counts from the API
        setStats({
          creators: 1250, // Placeholder
          jobs: 342, // Placeholder
          trustScore: topCreators[0]?.score || 0,
          artworks: 1890, // Placeholder
        })
      } catch (error) {
        console.error('Error fetching stats:', error)
      }
    }

    fetchStats()
  }, [])

  const statItems = [
    { label: 'Active Creators', value: stats.creators.toLocaleString() },
    { label: 'Open Jobs', value: stats.jobs.toLocaleString() },
    { label: 'Top Trust Score', value: stats.trustScore.toLocaleString() },
    { label: 'Artworks Minted', value: stats.artworks.toLocaleString() },
  ]

  return (
    <section className="py-16 border-y border-gray-100 bg-white">
      <div className="container">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {statItems.map((item, index) => (
            <div key={index} className="text-center">
              <div className="text-4xl md:text-5xl font-bold mb-3 text-primary">
                {item.value}
              </div>
              <div className="text-sm font-medium text-gray-600">{item.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

