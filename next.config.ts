import type { NextConfig } from 'next'

const isGithubActions = process.env.GITHUB_ACTIONS || false;
// Укажите точное название вашего репозитория
const repo = 'ldoe-base-planner'; 

const nextConfig: NextConfig = {
  output: 'export',
  allowedDevOrigins: ['192.168.0.104'],
  // Устанавливаем basePath только при деплое на GitHub (для правильных путей к asset'ам)
  basePath: isGithubActions ? `/${repo}` : '',
  images: {
    unoptimized: true, // На GitHub Pages нет Node.js сервера для оптимизации картинок
  },
};

export default nextConfig;