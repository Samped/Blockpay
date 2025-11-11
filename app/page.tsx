import Link from 'next/link'
import { HeroSection } from '@/components/home/HeroSection'
import { TopCreatorsSection } from '@/components/home/TopCreatorsSection'
import { FeaturesSection } from '@/components/home/FeaturesSection'
import { HowItWorksSection } from '@/components/home/HowItWorksSection'
import { StatsSection } from '@/components/home/StatsSection'
import { CTASection } from '@/components/home/CTASection'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'

export default function Home() {
  return (
    <main className="min-h-screen">
      <Header />
      <HeroSection />
      <StatsSection />
      <FeaturesSection />
      <TopCreatorsSection />
      <HowItWorksSection />
      <CTASection />
      <Footer />
    </main>
  )
}

