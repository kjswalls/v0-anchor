/** @type {import('next').NextConfig} */
// Cache bust: force full rebuild v5
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Force module graph rebuild
  experimental: {
    turbotrace: {
      memoryLimit: 4000,
    },
  },
}

export default nextConfig
