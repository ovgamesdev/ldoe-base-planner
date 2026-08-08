import MainPlannerClient from '@/components/MainPlannerClient'
import type { Metadata } from 'next'

export function generateStaticParams() {
  return [
    { lang: 'ru' },
    { lang: 'en' },
  ];
}

type Props = {
  params: Promise<{ lang: string }>;
};

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { lang } = await props.params;
  const isEn = lang === 'en';
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

  const title = isEn
    ? 'LDOE BASE PLANNER — Base & Settlement Planner'
    : 'LDOE BASE PLANNER — Планировщик базы и поселения';
  const description = isEn
    ? 'Interactive base and settlement planner for Last Day on Earth: Survival (LDOE). Design rooms, walls, floors and workbenches with an easy drag-and-drop layout tool, and plan your perfect base before you build it in-game.'
    : 'Интерактивный планировщик базы и поселения для игры Last Day on Earth: Survival (LDOE). Удобная расстановка комнат, стен, полов и станков — спланируйте идеальную базу заранее, прежде чем строить её в игре.';

  const path = `/${lang}/`;

  return {
    metadataBase: new URL('https://ovgamesdev.github.io/ldoe-base-planner'),
    title,
    description,
    manifest: `${basePath}/site-${isEn ? 'en' : 'ru'}.webmanifest`,
    alternates: {
      canonical: path,
      languages: {
        ru: '/ru/',
        en: '/en/',
      },
    },
    robots: {
      index: true,
      follow: true,
    },
    openGraph: {
      title,
      description,
      url: path,
      siteName: 'LDOE BASE PLANNER',
      locale: isEn ? 'en_US' : 'ru_RU',
      type: 'website',
      images: [{ url: `/og-image-${lang}.png`, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      site: '@ovgamesdev',
      title,
      description,
      creator: '@ovgamesdev',
      images: [`/og-image-${lang}.png`],
    },
  };
}

export default async function Page(props: Props) {
  // Распаковываем params, чтобы Next.js корректно привязал этот компонент к статическим путям
  const { lang } = await props.params;
  const isEn = lang === 'en';

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'LDOE BASE PLANNER',
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: 'Any (Web)',
    url: `https://ovgamesdev.github.io/ldoe-base-planner/${lang}/`,
    inLanguage: isEn ? 'en' : 'ru',
    description: isEn
      ? 'Interactive base and settlement planner for Last Day on Earth: Survival (LDOE).'
      : 'Интерактивный планировщик базы и поселения для игры Last Day on Earth: Survival (LDOE).',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <h1 className="sr-only">
        {isEn
          ? 'LDOE BASE PLANNER — Base & Settlement Planner for Last Day on Earth: Survival'
          : 'LDOE BASE PLANNER — Планировщик базы и поселения для Last Day on Earth: Survival'}
      </h1>
      <MainPlannerClient />
    </>
  );
}