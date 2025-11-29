'use client'

import { useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { UserProfile } from '@/components/dashboard/UserProfile'
import { ProfilePictureUpload } from '@/components/dashboard/ProfilePictureUpload'
import { WalletModal } from '@/components/ui/WalletModal'

export default function DashboardPage() {
  const { address, isConnected } = useAccount()
  const router = useRouter()
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false)

  useEffect(() => {
    if (!isConnected) {
      setIsWalletModalOpen(true)
    }
  }, [isConnected])

  if (!isConnected) {
    return (
      <main className="min-h-screen">
        <Header />
        <div className="container py-24">
          <div className="max-w-2xl mx-auto text-center">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">
              Connect Your Wallet
            </h1>
            <p className="text-gray-600 mb-8">
              Please connect your wallet to access your dashboard.
            </p>
          </div>
        </div>
        <Footer />
        <WalletModal 
          isOpen={isWalletModalOpen} 
          onClose={() => {
            setIsWalletModalOpen(false)
            router.push('/')
          }} 
        />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <Header />
      <div className="container py-12">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-2">
              Dashboard
            </h1>
            <p className="text-gray-600">
              Manage your profile and view your reputation on BlockPay
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Profile Picture Section */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-2xl shadow-card p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  Profile Picture
                </h2>
                <ProfilePictureUpload address={address || ''} />
              </div>
            </div>

            {/* User Profile Section */}
            <div className="lg:col-span-2">
              <UserProfile address={address || ''} />
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </main>
  )
}


