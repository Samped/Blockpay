export function HowItWorksSection() {
  const steps = [
    {
      number: '1',
      title: 'Connect Your Wallet',
      description: 'Link your Web3 wallet to create your identity as an Atom in the Intuition Knowledge Graph.',
    },
    {
      number: '2',
      title: 'Build Your Reputation',
      description: 'Complete jobs, receive votes, and build trust. Your reputation score is calculated from real on-chain interactions.',
    },
    {
      number: '3',
      title: 'Post or Apply for Jobs',
      description: 'Browse the public job pool or post your own. Artists submit watermarked previews before approval.',
    },
    {
      number: '4',
      title: 'Get Paid in TRUST',
      description: 'Upon job approval, escrow releases payment automatically. You gain access to full-resolution assets.',
    },
  ]

  return (
    <section className="py-24 bg-white">
      <div className="container">
        <div className="mx-auto max-w-3xl text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-5 text-gray-900">
            How It Works
          </h2>
          <p className="text-xl text-gray-600 font-light">
            Simple, transparent, and trust-anchored
          </p>
        </div>

        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {steps.map((step, index) => (
              <div
                key={index}
                className="flex gap-6 items-start group"
              >
                <div className="flex-shrink-0 w-16 h-16 rounded-2xl bg-primary text-white flex items-center justify-center font-bold text-2xl shadow-soft group-hover:shadow-card transition-all duration-300">
                  {step.number}
                </div>
                <div className="flex-1 pt-2">
                  <h3 className="text-2xl font-bold mb-3 text-gray-900">{step.title}</h3>
                  <p className="text-gray-600 leading-relaxed">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

