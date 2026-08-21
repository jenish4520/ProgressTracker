import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Body metrics / food logs are personal data; never cache them at the edge.
    staleTimes: { dynamic: 0 },
  },
  async headers() {
    return [
      {
        // The service worker must be re-validated on every load, otherwise a
        // stale worker keeps serving an old shell after a deploy.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
