import type { NextConfig } from 'next'

// const isGithubActions = process.env.GITHUB_ACTIONS || false;
// Точное название репозитория
const repo = 'ldoe-base-planner'
// Вычисляем basePath один раз
// const currentBasePath = isGithubActions ? `/${repo}` : '';
const currentBasePath = `/${repo}`;

// Идентификатор сборки: меняется при каждом деплое. Подставляется в адрес данных (catalog.json?v=...), чтобы браузер
// и CDN не отдавали старую копию после выкладки. На GitHub Pages заголовки кэша менять нельзя, поэтому версия идёт в URL.
const buildId = process.env.GITHUB_SHA || Date.now().toString(36);

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
    NEXT_PUBLIC_BUILD_ID: buildId,
  },
  
  images: {
    unoptimized: true, // На GitHub Pages нет Node.js сервера для оптимизации картинок
  },
};

export default nextConfig;