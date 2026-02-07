/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['three', '@mediapipe/hands', '@mediapipe/camera_utils'],
}

module.exports = nextConfig
