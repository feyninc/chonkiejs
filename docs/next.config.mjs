import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  images: {
    unoptimized: true,
    remotePatterns: [{ hostname: "raw.githubusercontent.com" }],
  },
  async redirects() {
    return [
      {
        source: "/python",
        destination: "/chonkie/quick-start",
        permanent: true,
      },
      {
        source: "/python/:path*",
        destination: "/chonkie/:path*",
        permanent: true,
      },
      {
        source: "/chonkiejs",
        destination: "/chonkiejs/getting-started/quick-start",
        permanent: true,
      },
      {
        source: "/getting-started/:path*",
        destination: "/chonkiejs/getting-started/:path*",
        permanent: true,
      },
      {
        source: "/chunkers/:path*",
        destination: "/chonkiejs/chunkers/:path*",
        permanent: true,
      },
      {
        source: "/handshakes/:path*",
        destination: "/chonkiejs/handshakes/:path*",
        permanent: true,
      },
      {
        source: "/changelog",
        destination: "/chonkiejs/changelog",
        permanent: true,
      },
      {
        source: "/troubleshooting",
        destination: "/chonkiejs/troubleshooting",
        permanent: true,
      },
      {
        source: "/api/overview",
        destination: "/chonkiejs/api/overview",
        permanent: true,
      },
      {
        source: "/api/types",
        destination: "/chonkiejs/api/types",
        permanent: true,
      },
      {
        source: "/api/tokenizer",
        destination: "/chonkiejs/api/tokenizer",
        permanent: true,
      },
      {
        source: "/api/rules",
        destination: "/chonkiejs/api/rules",
        permanent: true,
      },
    ];
  },
};

export default withMDX(config);
