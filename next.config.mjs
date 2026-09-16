/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  serverExternalPackages: ['bcryptjs', 'node:sqlite'],
  turbopack: {
    root: process.cwd()
  }
};

export default nextConfig;
