import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  outputFileTracingRoot: path.join(__dirname),
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "placehold.co", pathname: "/**" },
      { protocol: "https", hostname: "images.unsplash.com", pathname: "/**" },
      { protocol: "https", hostname: "picsum.photos", pathname: "/**" },
      { protocol: "https", hostname: "prepservicesfba.com", pathname: "/**" },
    ],
  },
  async headers() {
    return [
      {
        source: "/b-card/:path*.vcf",
        headers: [
          { key: "Content-Type", value: "text/vcard; charset=utf-8" },
          {
            key: "Content-Disposition",
            value: 'inline; filename="Arshad-Iqbal-Prep-Services-FBA.vcf"',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
