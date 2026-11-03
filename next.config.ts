import path from "node:path";
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  // The editor already surfaces compile/runtime failures in its own UI. Keep
  // Next's floating development badge out of the canvas and transport chrome.
  devIndicators: false,
  // Open pages poll for agent handoffs, staged drafts, job progress and review state.
  // Keep those routine checks out of the dev log; route errors still print.
  logging: {
    incomingRequests: {
      ignore: [
        /\/api\/projects\/[^/]+\/(library-presentation\?metadata=1|asset-generation$|revision$|timeline\/proposals\?|agent-chat\/events$)/,
        /\/api\/generation-jobs\?.*active=1/,
      ],
    },
  },
  // Let disposable verification servers use their own build directory without
  // contending with the user-owned dev server's `.next` lock.
  distDir: process.env.TIMELINE_NEXT_DIST_DIR?.trim() || ".next",
  // The stable review server exists to serve a snapshot WHILE agents churn
  // source on the shared branch — requiring the whole dirty tree to typecheck
  // at snapshot time would make review mode unavailable exactly when it is
  // most needed. The canonical type gate stays `pnpm typecheck`; the plain
  // `pnpm build` remains strict.
  typescript: {
    ignoreBuildErrors: process.env.TIMELINE_REVIEW_BUILD === "1",
  },
  // DreamCut is its own pnpm root;
  // pin tracing + Turbopack to this folder so Next doesn't walk up into the
  // parent workspace (which resolves deps from the wrong node_modules).
  outputFileTracingRoot: path.join(__dirname),
  // User media and local analysis runtimes are never desktop application resources.
  ...(process.env.TIMELINE_NEXT_DIST_DIR === ".next-desktop" ? {
    // Release builds with a Sentry upload token make source maps; desktop/build.mjs uploads them to
    // Sentry and deletes them before packaging, so no map ever ships.
    productionBrowserSourceMaps: process.env.DREAMCUT_RELEASE_SOURCEMAPS === "1",
    experimental: { webpackMemoryOptimizations: true, serverSourceMaps: process.env.DREAMCUT_RELEASE_SOURCEMAPS === "1" },
    webpack: (config) => { config.cache = false; return config; },
    outputFileTracingExcludes: { "/*": ["./projects/**", "./private/**", "./personal/**", "./analysis/**", "./library/**", "./testing/results/**", "./.env*", "./.venv*/**", "./.matting/**", "./native/**/target/**", "./.next-*/cache/**", "./catalogs/sfx/**", "./catalogs/music/**", "./catalogs/images/**", "./catalogs/visual/**"] },
  } : {}),
  turbopack: {
    root: path.join(__dirname),
  },
  serverExternalPackages: ["playwright-core", "esbuild", "onnxruntime-web"],
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  telemetry: false,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
});
