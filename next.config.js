/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: { unoptimized: true },
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true,
  },
  swcMinify: false,
  modularizeImports: {
    '@radix-ui/react-*': {
      transform: '@radix-ui/react-{{member}}'
    }
  }
};

module.exports = nextConfig;

