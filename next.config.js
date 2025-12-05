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
    
    // Ignore React Native modules that MetaMask SDK tries to import
    // These are not needed for web builds
    config.resolve.alias = {
      ...config.resolve.alias,
      '@react-native-async-storage/async-storage': false,
    }
    
    // Ignore optional React Native dependencies
    config.resolve.fallback = {
      ...config.resolve.fallback,
      '@react-native-async-storage/async-storage': false,
    }
    
    return config
  },
}

module.exports = nextConfig

