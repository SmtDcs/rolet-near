import type { NextConfig } from "next";
import { buildCspHeader } from "./lib/csp";

const isDev = process.env.NODE_ENV !== "production";

const nextConfig: NextConfig = {
  // Next blocks cross-origin dev requests, which stops the page hydrating when
  // the dev server is reached over a tunnel or by a bare loopback address.
  allowedDevOrigins: ["*.trycloudflare.com", "127.0.0.1"],
  devIndicators: false,
  // Keep the dev server off the production build. Sharing .next between
  // `next dev` and `next start` leaves the running server pointing at chunks
  // the dev server deleted, which shows up as a black page.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  images: {
    // Landing art uses quality={90} (HD pass); Next 16 only allows listed qualities.
    qualities: [75, 90],
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    const csp = buildCspHeader({
      isDev,
      rpcUrls: [
        process.env.NEXT_PUBLIC_NEAR_RPC_URL,
        process.env.NEXT_PUBLIC_NEAR_RPC,
      ],
    });
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: csp,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
