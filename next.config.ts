import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  turbopack: {
    resolveAlias: {
      // ocad2geojson's reader requires 'fs' for its path-based API, which we
      // never use (we always pass a Buffer). Stub it out for the browser bundle.
      fs: { browser: "./empty.ts" },
    },
  },
};

export default nextConfig;
