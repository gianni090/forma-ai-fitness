import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent the dev watcher from walking the whole Windows drive (for example D:\\pagefile.sys).
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
