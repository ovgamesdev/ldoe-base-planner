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
    ? 'Interactive base and settlement planner for LDOE.'
    : 'Интерактивный планировщик базы и поселения для LDOE.';

  return {
    metadataBase: new URL('https://ovgamesdev.github.io/ldoe-base-planner'),
    title,
    description,
    manifest: `${basePath}/site-${isEn ? 'en' : 'ru'}.webmanifest`,
    robots: {
      index: true,
      follow: true,
    },
    openGraph: {
      title,
      description,
      url: `/${lang}/`,
      siteName: 'LDOE BASE PLANNER',
      locale: isEn ? 'en_US' : 'ru_RU',
      type: 'website',
      images: [{ url: `${basePath}/og-image.png`, width: 1200, height: 630, alt: "LDOE BASE PLANNER Preview" }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      creator: 'ovgamesdev',
      images: [`${basePath}/og-image.png`],
    },
  };
}

export default async function Page(props: Props) {
  // Распаковываем params, чтобы Next.js корректно привязал этот компонент к статическим путям
  const { lang } = await props.params;

  return <MainPlannerClient />;
}