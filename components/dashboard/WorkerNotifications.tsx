'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount } from 'wagmi'
import { formatTrustAmount } from '@/lib/jobPoolContract'

interface Notification {
  id: string
  type: 'job_completed'
  jobId: string
  title: string
  message: string
  workerAddress: string
  creatorAddress: string
  paymentAmount: string
  createdAt: string
  read: boolean
}

export function WorkerNotifications() {
  const { address } = useAccount()
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (!address) {
      setLoading(false)
      return
    }

    // Scan for payment atoms and create notifications
    const scanPaymentAtoms = async (): Promise<boolean> => {
      try {
        console.log('Scanning for payment atoms for worker:', address.toLowerCase())
        
        // Try multiple query strategies
        // Strategy 1: Query all JsonObject atoms (broader search)
        const allAtomsQuery = `
          query GetAllJsonAtoms {
            atoms(
              where: {
                type: { _eq: "JsonObject" }
              }
              order_by: { created_at: desc }
              limit: 200
            ) {
              term_id
              type
              label
              data
              created_at
              creator_id
            }
          }
        `

        const response = await fetch('https://testnet.intuition.sh/v1/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: allAtomsQuery,
          })
        })

        const result = await response.json()
        
        if (result.errors) {
          console.error('GraphQL errors:', result.errors)
          return false
        }
        
        const allAtoms = result.data?.atoms || []
        console.log(`Found ${allAtoms.length} JsonObject atoms, filtering for payments...`)
        
        // Filter for payment atoms where worker matches
        const paymentAtoms = allAtoms.filter((atom: any) => {
          try {
            let atomData: any = {}
            if (typeof atom.data === 'string') {
              try {
                atomData = JSON.parse(atom.data)
              } catch (e) {
                console.warn('Failed to parse atom data as JSON:', atom.term_id)
                return false
              }
            } else if (atom.data && typeof atom.data === 'object') {
              atomData = atom.data
            } else {
              return false
            }
            
            const isPayment = atomData.type === 'payment'
            const workerMatch = atomData.worker?.toLowerCase() === address.toLowerCase()
            
            if (isPayment) {
              console.log(`Found payment atom ${atom.term_id}:`, {
                worker: atomData.worker,
                workerMatch,
                jobId: atomData.jobId,
                workerPayment: atomData.workerPayment
              })
            }
            
            return isPayment && workerMatch
          } catch (e) {
            console.warn('Error filtering atom:', e, atom.term_id)
            return false
          }
        })

        console.log(`Found ${paymentAtoms.length} payment atoms for this worker`)

        const workerNotificationsKey = `worker_notifications_${address.toLowerCase()}`
        const existingNotifications = JSON.parse(localStorage.getItem(workerNotificationsKey) || '[]')
        let hasNewNotifications = false

        for (const atom of paymentAtoms) {
          try {
            // Parse atom data
            let atomData: any = {}
            if (typeof atom.data === 'string') {
              atomData = JSON.parse(atom.data)
            } else if (atom.data && typeof atom.data === 'object') {
              atomData = atom.data
            }

            console.log(`Processing atom ${atom.term_id}:`, {
              type: atomData.type,
              worker: atomData.worker,
              jobId: atomData.jobId,
              workerPayment: atomData.workerPayment
            })

            // Check if it's a payment atom for this worker
            if (atomData.type === 'payment' && 
                atomData.worker?.toLowerCase() === address.toLowerCase() &&
                atomData.workerPayment) {
              
              const jobId = atomData.jobId?.toString()
              const workerPayment = atomData.workerPayment

              // Check if notification already exists for this job or atom
              const existingNotification = existingNotifications.find(
                (n: Notification) => 
                  (n.jobId === jobId && n.type === 'job_completed') ||
                  n.id === `notification_atom_${atom.term_id}`
              )

              if (!existingNotification) {
                console.log(`Creating notification from payment atom for job ${jobId}`, {
                  atomId: atom.term_id,
                  jobId,
                  workerPayment,
                  createdAt: atom.created_at
                })
                
                const notification: Notification = {
                  id: `notification_atom_${atom.term_id}`,
                  type: 'job_completed',
                  jobId: jobId || '',
                  title: `Job #${jobId}`,
                  message: `Your work has been selected! Payment of ${formatTrustAmount(BigInt(workerPayment))} TRUST has been sent to your account.`,
                  workerAddress: address.toLowerCase(),
                  creatorAddress: atom.creator_id?.toLowerCase() || '',
                  paymentAmount: workerPayment.toString(),
                  createdAt: atom.created_at || new Date().toISOString(),
                  read: false,
                }

                existingNotifications.unshift(notification)
                hasNewNotifications = true
                console.log(`Added notification for job ${jobId}`)
              } else {
                console.log(`Notification already exists for job ${jobId} or atom ${atom.term_id}`)
              }
            } else {
              console.log(`Atom ${atom.term_id} doesn't match payment criteria:`, {
                isPayment: atomData.type === 'payment',
                workerMatch: atomData.worker?.toLowerCase() === address.toLowerCase(),
                hasPayment: !!atomData.workerPayment
              })
            }
          } catch (err) {
            console.error('Error processing payment atom:', err, atom)
          }
        }

        if (hasNewNotifications) {
          // Keep only last 50 notifications
          const recentNotifications = existingNotifications.slice(0, 50)
          localStorage.setItem(workerNotificationsKey, JSON.stringify(recentNotifications))
          console.log('Updated notifications from payment atoms, total:', recentNotifications.length)
          
          // Trigger storage event
          window.dispatchEvent(new StorageEvent('storage', {
            key: workerNotificationsKey,
            newValue: JSON.stringify(recentNotifications),
          }))
          
          // Force reload notifications
          return true // Return true to indicate new notifications were added
        }
        
        return false
      } catch (err) {
        console.error('Error scanning payment atoms:', err)
        return false
      }
    }
    
    // Make scanPaymentAtoms accessible for manual trigger
    (window as any).scanPaymentAtoms = scanPaymentAtoms

    const loadNotifications = () => {
      try {
        const workerNotificationsKey = `worker_notifications_${address.toLowerCase()}`
        const stored = localStorage.getItem(workerNotificationsKey)
        const notificationsList: Notification[] = stored ? JSON.parse(stored) : []
        
        // Sort by date (newest first)
        notificationsList.sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
        
        setNotifications(notificationsList)
        setUnreadCount(notificationsList.filter(n => !n.read).length)
      } catch (err) {
        console.error('Error loading notifications:', err)
      } finally {
        setLoading(false)
      }
    }

    // Load existing notifications first
    loadNotifications()
    
    // Scan for payment atoms immediately and in background
    scanPaymentAtoms().then((hasNew) => {
      if (hasNew) {
        loadNotifications()
      }
    })
    
    // Listen for storage changes
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key && e.key === `worker_notifications_${address.toLowerCase()}`) {
        loadNotifications()
      }
    }
    
    window.addEventListener('storage', handleStorageChange)
    
    // Check for new notifications periodically (including scanning atoms)
    const interval = setInterval(() => {
      loadNotifications()
      scanPaymentAtoms().then((hasNew) => {
        if (hasNew) {
          loadNotifications()
        }
      })
    }, 5000) // Check every 5 seconds
    
    return () => {
      window.removeEventListener('storage', handleStorageChange)
      clearInterval(interval)
    }
  }, [address])

  const markAsRead = (notificationId: string) => {
    if (!address) return
    
    try {
      const workerNotificationsKey = `worker_notifications_${address.toLowerCase()}`
      const updated = notifications.map(n => 
        n.id === notificationId ? { ...n, read: true } : n
      )
      setNotifications(updated)
      localStorage.setItem(workerNotificationsKey, JSON.stringify(updated))
      setUnreadCount(updated.filter(n => !n.read).length)
    } catch (err) {
      console.error('Error marking notification as read:', err)
    }
  }

  const markAllAsRead = () => {
    if (!address) return
    
    try {
      const workerNotificationsKey = `worker_notifications_${address.toLowerCase()}`
      const updated = notifications.map(n => ({ ...n, read: true }))
      setNotifications(updated)
      localStorage.setItem(workerNotificationsKey, JSON.stringify(updated))
      setUnreadCount(0)
    } catch (err) {
      console.error('Error marking all notifications as read:', err)
    }
  }

  const deleteNotification = (notificationId: string) => {
    if (!address) return
    
    try {
      const workerNotificationsKey = `worker_notifications_${address.toLowerCase()}`
      const updated = notifications.filter(n => n.id !== notificationId)
      setNotifications(updated)
      localStorage.setItem(workerNotificationsKey, JSON.stringify(updated))
      setUnreadCount(updated.filter(n => !n.read).length)
    } catch (err) {
      console.error('Error deleting notification:', err)
    }
  }

  // Don't show anything if wallet is not connected
  if (!address) {
    return null
  }

  // Don't show anything while loading
  if (loading) {
    return null
  }

  // Don't show anything if there are no notifications
  if (notifications.length === 0) {
    return null
  }

  // Helper to resolve a nicer job title from localStorage metadata
  const getJobTitle = (notification: Notification) => {
    const jobId = notification.jobId
    try {
      const metaKey = `job_metadata_${jobId}`
      const stored = localStorage.getItem(metaKey)
      if (stored) {
        const parsed = JSON.parse(stored)
        const meta = parsed.metadata || parsed
        if (meta.title && typeof meta.title === 'string' && meta.title.trim().length > 0) {
          return meta.title.trim()
        }
      }
    } catch (err) {
      console.warn('Error reading job metadata for notification:', notification, err)
    }
    // Fallback to notification title, then generic Job #id
    if (notification.title && !notification.title.startsWith('Job #')) {
      return notification.title
    }
    return `Job #${jobId}`
  }

  return (
    <div className="bg-white rounded-2xl shadow-card p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-gray-900">Notifications</h2>
          {unreadCount > 0 && (
            <span className="bg-blue-600 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
              {unreadCount} new
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllAsRead}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            Mark all as read
          </button>
        )}
      </div>

      <div className="space-y-3">
        {notifications.map((notification) => (
            <div
              key={notification.id}
              onClick={() => {
                // Navigate to the job details on click
                if (notification.jobId) {
                  router.push(`/jobs?jobId=${notification.jobId}`)
                }
              }}
              className={`border rounded-lg p-4 transition-all cursor-pointer ${
                notification.read
                  ? 'bg-gray-50 border-gray-200 hover:border-gray-300'
                  : 'bg-blue-50 border-blue-200 shadow-sm hover:border-blue-300'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    {!notification.read && (
                      <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
                    )}
                    <h3 className="font-semibold text-gray-900">
                      {getJobTitle(notification)}
                    </h3>
                  </div>
                  
                  <p className="text-sm text-gray-700 mb-2">
                    {notification.message}
                  </p>
                  
                  {notification.type === 'job_completed' && (
                    <div className="flex items-center gap-4 text-xs text-gray-500 mt-3">
                      <span>
                        {getJobTitle(notification)} (Job #{notification.jobId})
                      </span>
                      <span>|</span>
                      <span className="font-semibold text-green-600">
                        Payment: {formatTrustAmount(BigInt(notification.paymentAmount))} TRUST
                      </span>
                      <span>|</span>
                      <span>{new Date(notification.createdAt).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>
                
                <div className="flex items-center gap-2">
                  {!notification.read && (
                    <button
                      onClick={() => markAsRead(notification.id)}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                      title="Mark as read"
                    >
                      Mark read
                    </button>
                  )}
                  <button
                    onClick={() => deleteNotification(notification.id)}
                    className="text-gray-400 hover:text-red-600 transition-colors"
                    title="Delete notification"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
      </div>
    </div>
  )
}

