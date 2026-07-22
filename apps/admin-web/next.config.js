const path = require("node:path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Monorepo root, so Next's file tracer resolves the npm-workspace
  // packages (@dispatch/*) correctly when producing .next/standalone.
  outputFileTracingRoot: path.join(__dirname, "../.."),
};

module.exports = nextConfig;
