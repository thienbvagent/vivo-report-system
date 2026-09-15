/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  serverExternalPackages: ['bcryptjs'],
  turbopack: {
    root: process.cwd()
  }
};

export default nextConfig;
