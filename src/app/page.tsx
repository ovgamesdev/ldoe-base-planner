import type { Metadata } from "next"

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

export const metadata: Metadata = {
  metadataBase: new URL("https://ovgamesdev.github.io/ldoe-base-planner"),
  title: "LDOE BASE PLANNER — Планировщик базы и поселения",
  description: "Интерактивный планировщик базы и поселения для Last Day on Earth: Survival.",
  openGraph: {
    title: "LDOE BASE PLANNER — Планировщик базы и поселения",
    description: "Интерактивный планировщик базы и поселения для Last Day on Earth: Survival.",
    url: "/",
    siteName: "LDOE BASE PLANNER",
    locale: "ru_RU",
    type: "website",
    images: [
      {
        url: `${basePath}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "LDOE BASE PLANNER Preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "LDOE BASE PLANNER — Планировщик базы и поселения",
    description: "Интерактивный планировщик базы и поселения для игры Last Day on Earth: Survival.",
    creator: "ovgamesdev",
    images: [`${basePath}/og-image.png`],
  },
};

export default function RootPage() {
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function() {
              try {
                var savedLang = localStorage.getItem('ldoe_language');
                var lang = (savedLang === 'en' || savedLang === 'ru') ? savedLang : (navigator.language.toLowerCase().startsWith('en') ? 'en' : 'ru');
                var currentPath = window.location.pathname;
                
                // Проверяем, содержит ли путь уже язык (слэш обязателен, чтобы избежать ложных срабатываний)
                if (!currentPath.match(/\\/(en|ru)(\\/|$)/)) {
                  var newPath = currentPath.endsWith('/') ? currentPath + lang + '/' : currentPath + '/' + lang + '/';
                  window.location.replace(newPath);
                }
              } catch (e) {}
            })();
          `,
        }}
      />
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a] text-white">
        <p>Загрузка... / Loading...</p>
      </div>
    </>
  );
}