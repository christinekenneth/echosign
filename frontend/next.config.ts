import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['@mediapipe/hands', '@mediapipe/holistic', 'three', '@pixiv/three-vrm', 'kalidokit'],
};

export default nextConfig;
