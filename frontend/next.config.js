/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ['10.20.0.46', '10.20.0.249', '10.20.0.238'],

  // Next.js 16+ Proxy Configuration (replaces deprecated middleware)
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/api/v1/:path*',
          destination: 'http://api:8090/api/v1/:path*'
        },
        {
          source: '/api/:path*',
          destination: 'http://api:8090/api/v1/:path*'
        }
      ]
    }
  }
}

module.exports = nextConfig