import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

initOpenNextCloudflareForDev();

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Next.js's default Server Action body limit is 1MB. The dashboard's
    // upload form calls uploadDocument (a Server Action) directly, and
    // real scanned/photographed multi-page PDFs routinely exceed 1MB even
    // though the synthetic test fixtures under cases/ never did - raising
    // this is what makes real-world documents uploadable at all.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
