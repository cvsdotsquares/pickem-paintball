// next.config.mjs
// This file is used to customize Next.js behavior.
// Learn more: https://nextjs.org/docs/api-reference/next.config.js/introduction

import path from "path";
import { fileURLToPath } from "url";

/** This repo lives under a home dir that also has its own package-lock.json; without this, Next infers the wrong root and every route 404s. */
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig = {
  outputFileTracingRoot: projectRoot,
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
