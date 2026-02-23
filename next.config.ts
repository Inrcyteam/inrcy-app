import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Security headers suitable for production on Vercel.
  // Kept conservative to avoid breaking OAuth flows.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Prevent MIME sniffing
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Clickjacking protection
          { key: "X-Frame-Options", value: "DENY" },
          // Reduce referrer leakage
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Limit powerful browser features
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=()",
          },
          // Safer cross-origin behavior
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          // HSTS (only effective on HTTPS)
          {
            key: "Strict-Transport-Security",
            value: "max-age=15552000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
