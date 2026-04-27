/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@crdg/core'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: '**.encuentra24.com' },
      { protocol: 'https', hostname: 'encuentra24.com' },
      { protocol: 'https', hostname: '**.point2homes.com' },
      { protocol: 'https', hostname: '**.mls.cr' },
      { protocol: 'https', hostname: 'mls.cr' },
      { protocol: 'https', hostname: '**.mlscr.com' },
      { protocol: 'https', hostname: '**.coldwellbankercostarica.com' },
      { protocol: 'https', hostname: 'coldwellbankercostarica.com' },
      { protocol: 'https', hostname: '**.amazonaws.com' },
      { protocol: 'https', hostname: 's3.amazonaws.com' },
      { protocol: 'https', hostname: '**.cloudfront.net' },
      { protocol: 'https', hostname: '**.googleusercontent.com' },
      { protocol: 'https', hostname: 'img.youtube.com' },
    ],
  },
  experimental: {
    typedRoutes: false,
  },
};

export default nextConfig;
