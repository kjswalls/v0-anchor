import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';
import withSerwistInit from '@serwist/next';

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
};

export default async function config(phase) {
  // Only enable serwist in production / non-test builds to avoid SW interference in dev
  if (phase === PHASE_DEVELOPMENT_SERVER) {
    return nextConfig;
  }

  const withSerwist = withSerwistInit({
    swSrc: 'app/sw.ts',
    swDest: 'public/sw.js',
    // Push-only — no precaching / offline caching in this PR
    disable: false,
  });

  return withSerwist(nextConfig);
}
