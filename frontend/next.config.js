/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  swcMinify: true,
  // PWA configuration (for future)
  // pwa: {
  //   dest: 'public',
  //   register: true,
  //   skipWaiting: true,
  // },
  // Image optimization
  images: {
    domains: [],
    formats: ['image/avif', 'image/webp'],
  },
  // TypeScript
  typescript: {
    // Allow production builds to successfully complete even if
    // your project has type errors.
    ignoreBuildErrors: false,
  },
  // ESLint
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: false,
  },
  // Version information from environment (injected during build)
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.npm_package_version || process.env.APP_VERSION || '0.0.0-dev',
    NEXT_PUBLIC_GIT_SHA: process.env.GIT_SHA || process.env.GITHUB_SHA || 'local',
    NEXT_PUBLIC_BUILD_TIME: process.env.BUILD_TIME || new Date().toISOString(),
  },
};

module.exports = nextConfig;
