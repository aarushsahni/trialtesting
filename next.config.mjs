/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Ensure the annotation-guide markdown is shipped with the serverless
  // function on Vercel (Next.js file tracing doesn't pick up fs.readFileSync
  // at arbitrary paths automatically).
  outputFileTracingIncludes: {
    '/guide': ['./src/lib/annotation-guide.md'],
  },
};

export default nextConfig;
