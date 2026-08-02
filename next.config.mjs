/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // The lineage graph is loaded once into module scope on the server.
    largePageDataBytes: 8 * 1024 * 1024,
  },
};

export default nextConfig;
