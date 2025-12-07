import type { Metadata } from 'next'
import { Poppins } from 'next/font/google'
import './globals.css'
import { Web3Provider } from '@/components/providers/Web3Provider'
import { UserInitialization } from '@/components/providers/UserInitialization'

const poppins = Poppins({ 
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-poppins',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'BlockPay',
  description: 'A trust-anchored decentralized marketplace for creators, designers, builders, and artists built on Intuition\'s Knowledge Graph',
  icons: {
    icon: '/logo.png',
    shortcut: '/logo.png',
    apple: '/logo.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${poppins.variable} font-sans`}>
        <Web3Provider>
          <UserInitialization>
            {children}
          </UserInitialization>
        </Web3Provider>
      </body>
    </html>
  )
}

