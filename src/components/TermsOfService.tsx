'use client';

import { useLanguage } from '@/context/LanguageContext'
import Link from 'next/link'

export default function TermsOfService() {
  const { t, language } = useLanguage();

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 py-12 px-4 sm:px-6 lg:px-8 overflow-auto">
      <div className="max-w-4xl mx-auto bg-slate-900 border border-slate-800 rounded-xl p-6 sm:p-10 shadow-xl space-y-8">
        <div>
          <Link
            href={`/${language}`}
            className="text-sm font-medium text-emerald-400 hover:text-emerald-300 transition-colors inline-flex items-center gap-1 mb-4"
          >
            {t('backToMain')}
          </Link>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">
            {t('termsOfServiceHeader')}
          </h1>
          <p className="text-sm text-slate-400">
            {t('termsLastUpdated')}
          </p>
        </div>

        <section className="space-y-4 text-slate-300 leading-relaxed text-sm sm:text-base">
          <p>{t('termsIntro')}</p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white border-b border-slate-800 pb-2">
            {t('termsSec1Title')}
          </h2>
          <div className="space-y-3 text-slate-300 text-sm sm:text-base">
            <p>{t('termsSec1Text1')}</p>
            <p>{t('termsSec1Text2')}</p>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white border-b border-slate-800 pb-2">
            {t('termsSec2Title')}
          </h2>
          <p className="text-slate-300 text-sm sm:text-base">
            {t('termsSec2Intro')}
          </p>
          <ul className="list-disc list-inside space-y-2 text-slate-300 text-sm sm:text-base pl-2">
            <li>{t('termsSec2Item1')}</li>
            <li>{t('termsSec2Item2')}</li>
            <li>{t('termsSec2Item3')}</li>
            <li>{t('termsSec2Item4')}</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white border-b border-slate-800 pb-2">
            {t('termsSec3Title')}
          </h2>
          <p className="text-slate-300 text-sm sm:text-base">
            {t('termsSec3Text')}
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white border-b border-slate-800 pb-2">
            {t('termsSec4Title')}
          </h2>
          <div className="space-y-3 text-slate-300 text-sm sm:text-base">
            <p>{t('termsSec4Text1')}</p>
            <p>{t('termsSec4Text2')}</p>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white border-b border-slate-800 pb-2">
            {t('termsSec5Title')}
          </h2>
          <p className="text-slate-300 text-sm sm:text-base">
            {t('termsSec5Text')}
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white border-b border-slate-800 pb-2">
            {t('termsSec6Title')}
          </h2>
          <p className="text-slate-300 text-sm sm:text-base">
            {t('termsSec6Text')}
          </p>
          <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 text-sm text-slate-300">
            <p><strong className="text-white">{t('developerLabel')}</strong> ovgamesdev</p>
            <p><strong className="text-white">{t('emailLabel')}</strong> <a href="mailto:ovgamesdev@gmail.com" className="text-emerald-400 hover:underline">ovgamesdev@gmail.com</a></p>
          </div>
        </section>
      </div>
    </main>
  );
}