import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ensure tesseract.js native Node deps are not bundled into server functions
  // (the server OCR routes are stubs now, but this prevents build warnings)
  serverExternalPackages: ["tesseract.js", "tesseract.js-core"],
};

export default nextConfig;
