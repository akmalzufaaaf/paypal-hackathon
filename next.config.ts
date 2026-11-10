import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Native module: keep better-sqlite3 out of the server bundle so Node
     can load its .node binary at runtime (bundling it breaks /api/*). */
  serverExternalPackages: ["better-sqlite3"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
