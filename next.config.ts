import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

// Content Security Policy (CSP)
// Start in Report-Only mode to observe violations without blocking.
// Once stable, you can switch the header key to `Content-Security-Policy`.
const cspReportOnly = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  // Allow images from HTTPS + data/blob for uploaded/inline assets
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https:",
  // Next.js commonly needs inline styles in many setups
  "style-src 'self' 'unsafe-inline' https:",
  // Keep permissive in report-only to avoid noisy false positives.
  // You can later remove 'unsafe-eval' and tighten hosts.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
  // Allow XHR/fetch/websocket to known external services.
  // Keeping https:/wss: broad for report-only; tighten after observing reports.
  "connect-src 'self' https: wss:",
  // Where the browser should send CSP violation reports
  // Support both legacy `report-uri` and modern Reporting API `report-to`.
  "report-uri /api/csp-report",
  "report-to csp",
].join("; ");

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
          // Reduce DNS prefetching
          { key: "X-DNS-Prefetch-Control", value: "off" },
          // Clickjacking protection
          { key: "X-Frame-Options", value: "DENY" },
          // Reduce referrer leakage
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Block legacy cross-domain policies
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
          // Limit powerful browser features
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=()",
          },
          // Safer cross-origin behavior
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          // Modern Reporting API endpoint for CSP reports
          // (Chrome/Edge prefer this over legacy `report-uri`.)
          { key: "Reporting-Endpoints", value: 'csp="/api/csp-report"' },
          // CSP in report-only mode (safe to enable globally)
          { key: "Content-Security-Policy-Report-Only", value: cspReportOnly },
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

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "inrcy",

  project: "javascript-nextjs",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Uncomment to route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  // tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
