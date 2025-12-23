// next.config.mjs
// This file is used to customize Next.js behavior.
// Learn more: https://nextjs.org/docs/api-reference/next.config.js/introduction

const nextConfig = {
  reactStrictMode: false,
  eslint: {
    ignoreDuringBuilds: false,
  },
  images: {
    domains: ["lh3.googleusercontent.com", "firebasestorage.googleapis.com"],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
