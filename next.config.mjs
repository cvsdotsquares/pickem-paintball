// next.config.mjs
// This file is used to customize Next.js behavior.
// Learn more: https://nextjs.org/docs/api-reference/next.config.js/introduction

import path from "path";
import { fileURLToPath } from "url";

/** This repo lives under a home dir that also has its own package-lock.json; without this, Next infers the wrong root and every route 404s. */
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig = {
  outputFileTracingRoot: projectRoot,
  /** Avoid flaky vendor-chunk resolution for icon packages (fixes missing `vendor-chunks/lucide-react.js`). */
  transpilePackages: ["lucide-react"],
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  reactStrictMode: false,
  /**
   * Dev-only: allow phones / other devices on your LAN to load App Router + dev assets.
   * Without this, Next can block non-localhost origins and the app may look like a 404.
   * @see https://nextjs.org/docs/app/api-reference/config/next-config-js/allowedDevOrigins
   */
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "*.local",
    // Hostnames are matched per label (right to left); use one * per octet group.
    "192.168.*.*",
    "10.*.*.*",
    "172.*.*.*",
  ],
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    domains: ["lh3.googleusercontent.com", "firebasestorage.googleapis.com"],
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.output.chunkLoadTimeout = 120000;
      // Stale webpack filesystem cache can reference missing chunks (e.g. `Cannot find module './5611.js'`)
      // after interrupted compiles or switching LAN/mobile while dev is running. Memory cache avoids bad IDs.
      config.cache = { type: "memory" };
    }
    return config;
  },
  async redirects() {
    return [
      {
        source: "/pages/faq",
        destination: "/dashboard/faq",
        permanent: true,
      },
    ];
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
