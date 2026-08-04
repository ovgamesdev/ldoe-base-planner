import type { NextConfig } from 'next'

// const isGithubActions = process.env.GITHUB_ACTIONS || false;
// Точное название репозитория
const repo = 'ldoe-base-planner'
// Вычисляем basePath один раз
// const currentBasePath = isGithubActions ? `/${repo}` : '';
const currentBasePath = `/${repo}`;

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  
  allowedDevOrigins: ['192.168.0.104'],
  // Устанавливаем basePath для встроенных механизмов Next.js
  basePath: currentBasePath,
  assetPrefix: currentBasePath,
  
  // Пробрасываем вычисленный basePath в клиентскую часть кода
  env: {
    NEXT_PUBLIC_BASE_PATH: currentBasePath,
  },
  
  images: {
    unoptimized: true, // На GitHub Pages нет Node.js сервера для оптимизации картинок
  },
};

export default nextConfig;