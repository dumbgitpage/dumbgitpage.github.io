/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  basePath: "/website-change-tracker", // Change to your GitHub repo name
  images: { unoptimized: true },
};

module.exports = nextConfig;
