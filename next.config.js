/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['localhost'],
  },
  transpilePackages: ['@wagmi/connectors', 'porto'],
  webpack: (config, { isServer }) => {
    // Fix for porto z.encode import error
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
      }
      // Ignore the problematic porto/internal import if it doesn't exist
      config.resolve.fallback = {
        ...config.resolve.fallback,
      }
    }
    return config
  },
}

module.exports = nextConfig

