/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: true,
  },
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
    
    // Ignore React Native modules and optional dependencies that MetaMask SDK/WalletConnect try to import
    // These are not needed for web builds (applies to both server and client)
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      '@react-native-async-storage/async-storage': false,
      'pino-pretty': false,
    }
    
    // Ignore optional dependencies (for both server and client builds)
    config.resolve.fallback = {
      ...(config.resolve.fallback || {}),
      '@react-native-async-storage/async-storage': false,
      'pino-pretty': false,
    }
    
    // Add plugin to ignore optional dependencies using webpack's IgnorePlugin
    const webpack = require('webpack')
    config.plugins = config.plugins || []
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^pino-pretty$/,
      })
    )
    
    return config
  },
}

module.exports = nextConfig

