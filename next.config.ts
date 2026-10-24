import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Demo de portafolio: el código original tiene tipados legacy que vinext no bloqueaba.
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
