import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // La raíz lleva a /inicio, que reparte según el rol (o al ingreso si no hay sesión).
  async redirects() {
    return [{ source: "/", destination: "/inicio", permanent: false }];
  },
};

export default nextConfig;
