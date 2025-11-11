import Link from 'next/link'
import { Logo } from '@/components/ui/Logo'

export function Footer() {
  return (
    <footer className="border-t border-gray-100 bg-white">
      <div className="container py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
          <div className="space-y-4">
            <Logo size={32} />
            <p className="text-sm text-gray-600 leading-relaxed">
              Decentralized marketplace for creators, designers, builders, and artists.
            </p>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Platform</h4>
            <ul className="space-y-3 text-sm">
              <li>
                <Link href="/jobs" className="text-gray-600 hover:text-primary transition-colors">
                  Job Pool
                </Link>
              </li>
              <li>
                <Link href="/creators" className="text-gray-600 hover:text-primary transition-colors">
                  Top Creators
                </Link>
              </li>
              <li>
                <Link href="/portfolio" className="text-gray-600 hover:text-primary transition-colors">
                  Portfolio
                </Link>
              </li>
            </ul>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Resources</h4>
            <ul className="space-y-3 text-sm">
              <li>
                <Link href="/docs" className="text-gray-600 hover:text-primary transition-colors">
                  Documentation
                </Link>
              </li>
              <li>
                <a
                  href="https://intuition.so"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-600 hover:text-primary transition-colors"
                >
                  Intuition Network
                </a>
              </li>
            </ul>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Community</h4>
            <ul className="space-y-3 text-sm">
              <li>
                <a
                  href="https://twitter.com/blockpay"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-600 hover:text-primary transition-colors"
                >
                  Twitter
                </a>
              </li>
              <li>
                <a
                  href="https://discord.gg/blockpay"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-600 hover:text-primary transition-colors"
                >
                  Discord
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-100 text-center text-sm text-gray-500">
          <p>© {new Date().getFullYear()} BlockPay. Built on Intuition&apos;s Knowledge Graph.</p>
        </div>
      </div>
    </footer>
  )
}

