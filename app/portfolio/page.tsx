import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { PortfolioShowcase } from '@/components/portfolio/PortfolioShowcase'

export default function PortfolioPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <PortfolioShowcase />
      </main>
      <Footer />
    </div>
  )
}
