import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  devIndicators: false,
  allowedDevOrigins: ["127.0.0.1"],
  // The OAuth consent page approves access to a workspace: it is never framed (clickjacking), cached or leaked in a
  // Referer to the app it sends the person back to.
  async headers() {
    return [
      {
        source: "/oauth/authorize",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
      // The trust documents (docs/trust/*.md, docs/RETENTION.md) are imported as plain strings by lib/trust/docs.ts,
      // so /privacy and /trust are built from them and the server never reads them at run time.
      "*.md": { type: "raw" },
    },
  },
};

export default nextConfig;
