'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { intuitionClient, Atom } from '@/lib/intuitionClient'

interface JobData extends Atom {
  title?: string
  description?: string
  budget?: string
  deadline?: string
  expirationDate?: string
  category?: string
  clientAddress?: string
  applicants?: number
  isActive?: boolean
}

// Mock data for development/demo
const mockJobs: JobData[] = [
  {
    id: 'job-1',
    type: 'Job',
    data: {
      title: 'Hand-drawn Cat PFP Design',
      description: 'Looking for a unique hand-drawn cat profile picture with a modern twist. Should be colorful and eye-catching.',
      budget: '50',
      deadline: '2024-02-15',
      expirationDate: '2024-12-31',
      category: 'Illustration',
      clientAddress: '0x1234...5678',
      applicants: 3,
      isActive: true,
    },
  },
  {
    id: 'job-2',
    type: 'Job',
    data: {
      title: 'Logo Design for Web3 Startup',
      description: 'Need a professional logo design for a new DeFi platform. Should convey trust and innovation.',
      budget: '200',
      deadline: '2024-02-20',
      expirationDate: '2024-11-30',
      category: 'Logo Design',
      clientAddress: '0x2345...6789',
      applicants: 8,
      isActive: true,
    },
  },
  {
    id: 'job-3',
    type: 'Job',
    data: {
      title: 'NFT Collection Artwork',
      description: 'Creating a 10,000 piece NFT collection. Need consistent art style with variations.',
      budget: '500',
      deadline: '2024-03-01',
      expirationDate: '2024-01-15',
      category: 'Digital Art',
      clientAddress: '0x3456...7890',
      applicants: 12,
      isActive: false,
    },
  },
  {
    id: 'job-4',
    type: 'Job',
    data: {
      title: 'Website UI/UX Design',
      description: 'Modern, clean UI/UX design for a portfolio website. Mobile responsive required.',
      budget: '300',
      deadline: '2024-02-25',
      category: 'UI/UX Design',
      clientAddress: '0x4567...8901',
      applicants: 5,
    },
  },
  {
    id: 'job-5',
    type: 'Job',
    data: {
      title: '3D Character Modeling',
      description: 'Create a 3D character model for a game. Low poly style preferred.',
      budget: '400',
      deadline: '2024-02-28',
      category: '3D Modeling',
      clientAddress: '0x5678...9012',
      applicants: 7,
    },
  },
  {
    id: 'job-6',
    type: 'Job',
    data: {
      title: 'Brand Identity Package',
      description: 'Complete brand identity including logo, color palette, typography, and style guide.',
      budget: '600',
      deadline: '2024-03-05',
      category: 'Branding',
      clientAddress: '0x6789...0123',
      applicants: 4,
    },
  },
]

export function JobPoolSection() {
  const [jobs, setJobs] = useState<JobData[]>(() => {
    // Extract data from mockJobs structure
    return mockJobs.map(job => ({
      ...job,
      title: job.data?.title,
      description: job.data?.description,
      budget: job.data?.budget,
      deadline: job.data?.deadline,
      expirationDate: job.data?.expirationDate,
      category: job.data?.category,
      clientAddress: job.data?.clientAddress,
      applicants: job.data?.applicants,
      isActive: job.data?.isActive,
    }))
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        setLoading(true)
        const activeJobs = await intuitionClient.getActiveJobs(6)
        
        if (!activeJobs || activeJobs.length === 0) {
          console.log('No jobs from API, using mock data')
          setJobs(mockJobs.map(job => ({
            ...job,
            title: job.data?.title,
            description: job.data?.description,
            budget: job.data?.budget,
            deadline: job.data?.deadline,
            expirationDate: job.data?.expirationDate,
            category: job.data?.category,
            clientAddress: job.data?.clientAddress,
            applicants: job.data?.applicants,
            isActive: job.data?.isActive,
          })))
          setLoading(false)
          return
        }
        
        const jobsWithData = await Promise.all(
          activeJobs.map(async (job) => {
            try {
              // Skip if job.id is missing
              if (!job.id) {
                return job
              }
              
              // Get client info
              const clientTriples = await intuitionClient.getTriples(job.id, 'posted_by')
              const clientAtomId = clientTriples[0]?.object
              const clientAtom = clientAtomId ? await intuitionClient.getAtom(clientAtomId) : null
              
              // Get applicants count
              const applicantTriples = await intuitionClient.getTriples(job.id, 'applied_to')
              
              return {
                ...job,
                title: job.data?.title || 'Untitled Job',
                description: job.data?.description || '',
                budget: job.data?.budget || job.data?.price || '0',
                deadline: job.data?.deadline || '',
                expirationDate: job.data?.expirationDate || job.data?.expiresAt || job.data?.deadline || '',
                category: job.data?.category || 'General',
                clientAddress: clientAtom?.data?.address || clientAtom?.data?.wallet || clientAtomId?.slice(0, 10) + '...',
                applicants: applicantTriples.length,
                isActive: job.data?.isActive !== false,
              }
            } catch (err) {
              return {
                ...job,
                title: job.data?.title || 'Untitled Job',
                description: job.data?.description || '',
                budget: job.data?.budget || '0',
                expirationDate: job.data?.expirationDate || job.data?.expiresAt || job.data?.deadline || '',
                applicants: 0,
                isActive: job.data?.isActive !== false,
              }
            }
          })
        )

        setJobs(jobsWithData.length > 0 ? jobsWithData : mockJobs.map(job => ({
          ...job,
          title: job.data?.title,
          description: job.data?.description,
          budget: job.data?.budget,
          deadline: job.data?.deadline,
          expirationDate: job.data?.expirationDate,
          category: job.data?.category,
          clientAddress: job.data?.clientAddress,
          applicants: job.data?.applicants,
          isActive: job.data?.isActive,
        })))
      } catch (error) {
        console.error('Error fetching jobs:', error)
        setJobs(mockJobs.map(job => ({
          ...job,
          title: job.data?.title,
          description: job.data?.description,
          budget: job.data?.budget,
          deadline: job.data?.deadline,
          expirationDate: job.data?.expirationDate,
          category: job.data?.category,
          clientAddress: job.data?.clientAddress,
          applicants: job.data?.applicants,
          isActive: job.data?.isActive,
        })))
      } finally {
        setLoading(false)
      }
    }

    // fetchJobs() // Commented out to use mock data initially
  }, [])

  const formatAddress = (address: string) => {
    if (!address) return 'N/A'
    if (address.length > 10) return address.slice(0, 6) + '...' + address.slice(-4)
    return address
  }

  const displayJobs = jobs.slice(0, 12)

  if (loading) {
    return (
      <section className="py-24 bg-white">
        <div className="container">
          <div className="mb-12">
            <div className="h-10 bg-gray-200 rounded w-64 mb-3 animate-pulse"></div>
            <div className="h-6 bg-gray-200 rounded w-96 animate-pulse"></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="bg-white border border-gray-100 rounded-2xl p-6 shadow-soft animate-pulse">
                <div className="h-6 bg-gray-200 rounded w-3/4 mb-3"></div>
                <div className="h-4 bg-gray-200 rounded w-1/3 mb-4"></div>
                <div className="h-16 bg-gray-200 rounded mb-5"></div>
                <div className="flex gap-6 pt-4 border-t border-gray-100">
                  <div className="h-12 bg-gray-200 rounded w-24"></div>
                  <div className="h-12 bg-gray-200 rounded w-24"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="py-24 bg-white">
      <div className="container">
        <div className="flex items-center justify-between mb-12">
          <div>
            <h2 className="text-4xl md:text-5xl font-bold mb-3 text-gray-900">
              Active Job Pool
            </h2>
            <p className="text-lg text-gray-600 font-light">
              Discover creative opportunities and showcase your talent
            </p>
          </div>
          <Link
            href="/jobs"
            className="hidden md:flex items-center px-6 py-3 text-sm font-semibold rounded-full border border-gray-300 text-gray-900 hover:border-primary hover:text-primary transition-all duration-200"
          >
            View All
            <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        {displayJobs.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-gray-600 mb-6">No active jobs at the moment. Check back soon!</p>
            <Link
              href="/jobs"
              className="inline-flex items-center px-6 py-3 text-sm font-semibold rounded-full bg-primary text-white hover:bg-[#0052CC] transition-all duration-200"
            >
              Post a Job
            </Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {displayJobs.map((job) => (
                <Link
                  key={job.id}
                  href="/jobs"
                  className="group relative bg-white rounded-2xl border border-gray-100 shadow-soft hover:shadow-card-hover transition-all duration-300 hover:-translate-y-1 overflow-hidden"
                >
                  <div className="p-6">
                    {/* Header with Status */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-3">
                          <h3 className="text-lg font-bold text-gray-900 group-hover:text-primary transition-colors line-clamp-2">
                            {job.title || 'Untitled Job'}
                          </h3>
                          {(() => {
                            const isActive = job.isActive !== false
                            const expirationDate = job.expirationDate || job.deadline
                            const isExpired = expirationDate ? new Date(expirationDate) < new Date() : false
                            
                            if (isExpired) {
                              return (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200 flex-shrink-0">
                                  Expired
                                </span>
                              )
                            }
                            return isActive ? (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200 flex-shrink-0">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5"></span>
                                Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200 flex-shrink-0">
                                Inactive
                              </span>
                            )
                          })()}
                        </div>
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-50 text-gray-700 border border-gray-200">
                          {job.category || 'General'}
                        </span>
                      </div>
                    </div>
                    
                    {/* Description */}
                    <p className="text-sm text-gray-600 mb-5 line-clamp-2 leading-relaxed min-h-[2.5rem]">
                      {job.description || 'No description provided.'}
                    </p>
                    
                    {/* Stats */}
                    <div className="flex items-center gap-6 pt-4 border-t border-gray-100 mb-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 font-medium">Budget</div>
                          <div className="text-sm font-bold text-gray-900">
                            {job.budget || '0'} TRUST
                          </div>
                        </div>
                      </div>
                      
                      {job.applicants !== undefined && (
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center">
                            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                          </div>
                          <div>
                            <div className="text-xs text-gray-500 font-medium">Applicants</div>
                            <div className="text-sm font-bold text-gray-900">
                              {job.applicants}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {/* Expiration Date */}
                    {(job.expirationDate || job.deadline) && (
                      <div className="pt-4 border-t border-gray-100">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span className="font-medium">
                              {(() => {
                                const expDate = job.expirationDate || job.deadline
                                if (!expDate) return 'N/A'
                                const date = new Date(expDate)
                                const now = new Date()
                                const daysLeft = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
                                
                                if (daysLeft < 0) {
                                  return `Expired ${Math.abs(daysLeft)} day${Math.abs(daysLeft) !== 1 ? 's' : ''} ago`
                                } else if (daysLeft === 0) {
                                  return 'Expires today'
                                } else if (daysLeft === 1) {
                                  return 'Expires tomorrow'
                                } else {
                                  return `Expires in ${daysLeft} days`
                                }
                              })()}
                            </span>
                          </div>
                          <span className="text-xs text-gray-400 font-medium">
                            {(job.expirationDate || job.deadline) 
                              ? new Date(job.expirationDate || job.deadline!).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                              : 'N/A'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Hover indicator */}
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-primary to-purple-600 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left"></div>
                </Link>
              ))}
            </div>

            <div className="text-center md:hidden">
              <Link
                href="/jobs"
                className="inline-flex items-center px-6 py-3 text-sm font-semibold rounded-full border border-gray-300 text-gray-900 hover:border-primary hover:text-primary transition-all duration-200"
              >
                View All Jobs
                <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </>
        )}
      </div>
    </section>
  )
}

