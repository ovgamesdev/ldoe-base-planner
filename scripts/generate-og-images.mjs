// scripts/generate-og-images.mjs
//
// Генерирует og-image-ru.png и og-image-en.png (1200x630) БЕЗ серверных функций
// Next.js (без opengraph-image.tsx / ImageResponse) — обычный build-time скрипт
// на satori + resvg (это те же библиотеки, на которых работает next/og внутри,
// просто вызванные напрямую, так что подходит для `output: 'export'`).
//
// Запуск:  node scripts/generate-og-images.mjs
// В package.json добавить:  "prebuild": "node scripts/generate-og-images.mjs"
// (тогда картинки будут пересобираться перед каждым `next build`)

import { Resvg } from '@resvg/resvg-js'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import satori from 'satori'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const WIDTH = 1200
const HEIGHT = 630

// ---- Настройки под проект --------------------------------------------
const BG_IMAGE_PATH = path.join(ROOT, 'public', 'og-bg-map.png') // теперь 1920x1080
const FONT_REGULAR_PATH = path.join(ROOT, 'fonts', 'Geist-Regular.ttf')
const FONT_BOLD_PATH = path.join(ROOT, 'fonts', 'Geist-Bold.ttf')
const OUT_DIR = path.join(ROOT, 'public')

// Позиция кропа фона: 'right' — образ сдвинут максимально вправо (обрезается левый край),
// по вертикали всегда 'center'. Значение — objectPosition для <img>.
// Можно тонко подвинуть числом: '65% center' (0% = целиком слева, 100% = целиком справа).
const BG_OBJECT_POSITION = '100% center'

const CONTENT = {
  ru: {
    badge: 'LAST DAY ON EARTH: SURVIVAL',
    title1: 'LDOE BASE',
    title2: 'PLANNER',
    subtitle1: 'Планировщик базы и поселения',
    subtitle2: 'Создавай и делись макетами онлайн',
  },
  en: {
    badge: 'LAST DAY ON EARTH: SURVIVAL',
    title1: 'LDOE BASE',
    title2: 'PLANNER',
    subtitle1: 'Base & settlement planner',
    subtitle2: 'Design and share your layouts online',
  },
}
// ------------------------------------------------------------------------

function assertFileExists(p, hint) {
  if (!existsSync(p)) {
    throw new Error(`Не найден файл: ${p}${hint ? `\n${hint}` : ''}`)
  }
}

function toDataUri(filePath) {
  const buf = readFileSync(filePath)
  return `data:image/png;base64,${buf.toString('base64')}`
}

function buildMarkup(lang) {
  const t = CONTENT[lang]
  const bgDataUri = toDataUri(BG_IMAGE_PATH)

  return {
    // Внешний контейнер: только рамка холста + overflow hidden, сам не позиционирует фон —
    // это важно, т.к. Satori плохо соблюдает background-size:cover на background-image,
    // из-за чего появлялись чёрные поля. Фон рисуем отдельным <img objectFit="cover">.
    type: 'div',
    props: {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: '#0a0a0a',
      },
      children: [
        // Слой 1: фоновая картинка, честный cover-кроп с управляемой позицией
        {
          type: 'img',
          props: {
            src: bgDataUri,
            style: {
              position: 'absolute',
              top: 0,
              left: (((1200 / 2) / 2) / 1.2),
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: BG_OBJECT_POSITION,
            },
          },
        },
        // Слой 2: тёмный градиент слева направо для контраста под текст
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              display: 'flex',
              backgroundImage:
                'linear-gradient(90deg, rgba(8,8,8,0.97) 0%, rgba(8,8,8,0.85) 45%, rgba(8,8,8,0.15) 68%, rgba(8,8,8,0) 100%)',
            },
          },
        },
        // Слой 3: текст поверх всего
        {
          type: 'div',
          props: {
            style: {
              position: 'relative',
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              padding: '70px',
              fontFamily: 'Brand',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    alignItems: 'flex-start',
                    alignSelf: 'flex-start',
                    border: '2px solid #ff9500',
                    borderRadius: 6,
                    padding: '10px 18px',
                    marginBottom: 28,
                  },
                  children: {
                    type: 'span',
                    props: {
                      style: { color: '#ff9500', fontSize: 21, fontWeight: 700, letterSpacing: 1 },
                      children: t.badge,
                    },
                  },
                },
              },
              {
                type: 'div',
                props: {
                  style: { display: 'flex', flexDirection: 'column', lineHeight: 1.05 },
                  children: [
                    {
                      type: 'span',
                      props: { style: { color: '#f5f5f5', fontSize: 64, fontWeight: 700 }, children: t.title1 },
                    },
                    {
                      type: 'span',
                      props: { style: { color: '#ff9500', fontSize: 64, fontWeight: 700 }, children: t.title2 },
                    },
                  ],
                },
              },
              {
                type: 'div',
                props: {
                  style: { display: 'flex', flexDirection: 'column', marginTop: 26 },
                  children: [
                    { type: 'span', props: { style: { color: '#c3c3c3', fontSize: 29 }, children: t.subtitle1 } },
                    { type: 'span', props: { style: { color: '#c3c3c3', fontSize: 29 }, children: t.subtitle2 } },
                  ],
                },
              },
            ],
          },
        },
      ],
    },
  }
}

async function generateOne(lang) {
  const fontRegular = readFileSync(FONT_REGULAR_PATH)
  const fontBold = readFileSync(FONT_BOLD_PATH)

  const svg = await satori(buildMarkup(lang), {
    width: WIDTH,
    height: HEIGHT,
    fonts: [
      { name: 'Brand', data: fontRegular, weight: 400, style: 'normal' },
      { name: 'Brand', data: fontBold, weight: 700, style: 'normal' },
    ],
  })

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: WIDTH },
  })
  const uncompressedPng = resvg.render().asPng()

  const png = await sharp(uncompressedPng)
    .png({ quality: 80, compressionLevel: 9, palette: true })
    .toBuffer()

  const outPath = path.join(OUT_DIR, `og-image-${lang}.png`)
  writeFileSync(outPath, png)
  console.log(`✓ ${path.relative(ROOT, outPath)} (${(png.length / 1024).toFixed(0)} KB)`)
}

async function main() {
  assertFileExists(BG_IMAGE_PATH, 'Положите фон карты (без UI-панели) в public/og-bg-map.png')
  assertFileExists(FONT_REGULAR_PATH, 'Нужен .ttf с поддержкой кириллицы (Geist её не поддерживает)')
  assertFileExists(FONT_BOLD_PATH, 'Нужен .ttf с поддержкой кириллицы (Geist её не поддерживает)')

  for (const lang of Object.keys(CONTENT)) {
    await generateOne(lang)
  }
}

main().catch((err) => {
  console.error('Ошибка генерации og-image:', err.message)
  process.exit(1)
})