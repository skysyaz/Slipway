import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // Real type safety — do not ignore build errors.
  typescript: {
    ignoreBuildErrors: false,
  },
  // ponytail: keep the native-addon packages OUT of the server bundle.
  // ssh2 loads a native binding (`sshcrypto.node`, plus optional cpu-features)
  // from lib/protocol/crypto.js. Turbopack cannot place a non-ECMAScript asset
  // in an ESM chunk, so `next build` failed outright with:
  //
  //   ./node_modules/ssh2/lib/protocol/crypto.js
  //   non-ecmascript placeable asset
  //
  // reached both directly (the SSH server-join route) and transitively
  // (instrumentation → scheduler → docker-ops → docker → dockerode →
  // docker-modem → ssh2). Listing them here makes Next `require()` them at
  // runtime instead of bundling them — which is what we want regardless, since
  // the Dockerfile already ships the whole node_modules into standalone.
  serverExternalPackages: ["ssh2", "dockerode", "docker-modem", "cpu-features"],
};

export default nextConfig;