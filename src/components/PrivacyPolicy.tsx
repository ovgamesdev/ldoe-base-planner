'use client';

import { useLanguage } from '@/context/LanguageContext'
import Link from 'next/link'

export default function PrivacyPolicy() {
  const { t, language } = useLanguage();

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 py-12 px-4 sm:px-6 lg:px-8 overflow-auto">
      <div className="max-w-4xl mx-auto bg-slate-900 border border-slate-800 rounded-xl p-6 sm:p-10 shadow-xl space-y-8">
        <div>
          <Link
            href={"/"+language}
            className="text-sm font-medium text-emerald-400 hover:text-emerald-300 transition-colors inline-flex items-center gap-1 mb-4"
          >
            {t('backToMain')}
          </Link>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">
            {t('privacyPolicyHeader')}
          </h1>
          <p className="text-sm text-slate-400">
            {t('privacyLastUpdated')}
          </p>
        </div>

        <section className="space-y-4 text-slate-300 leading-relaxed text-sm sm:text-base">
          <p>{t('privacyIntro1')}</p>
          <p>{t('privacyIntro2')}</p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white border-b border-slate-800 pb-2">
            {t('privacySec1Title')}
          </h2>
          <div className="space-y-3 text-slate-300 text-sm sm:text-base">
            <p>{t('privacySec1Intro')}</p>
            <ul className="list-disc list-inside space-y-2 pl-2">
              <li>
                <strong className="text-slate-100">{t('privacySec1Item1Label')}</strong>
                {t('privacySec1Item1Text')}
              </li>
              <li>
                <strong className="text-slate-100">{t('privacySec1Item2Label')}</strong>
                {t('privacySec1Item2Text')}
              </li>
              <li>
                <strong className="text-slate-100">{t('privacySec1Item3Label')}</strong>
                {t('privacySec1Item3Text')}
              </li>
              <li>
                <strong className="text-slate-100">{t('privacySec1Item4Label')}</strong>
                {t('privacySec1Item4Text')}
              </li>
            </ul>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white border-b border-slate-800 pb-2">
            {t('privacySec2Title')}
          </h2>
          <ul className="list-disc list-inside space-y-2 text-slate-300 text-sm sm:text-base pl-2">
            <li>{t('privacySec2Item1')}</li>
            <li>{t('privacySec2Item2')}</li>
            <li>{t('privacySec2Item3')}</li>
            <li>{t('privacySec2Item4')}</li>
            <li>{t('privacySec2Item5')}</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white border-b border-slate-800 pb-2">
            {t('privacySec3Title')}
          </h2>
          <p className="text-slate-300 text-sm sm:text-base">
            {t('privacySec3Text')}
          </p>
          <ul className="list-disc list-inside space-y-2 text-slate-300 text-sm sm:text-base pl-2">
            <li>
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-400 hover:underline"
              >
                {t('googlePrivacyPolicyLink')}
              </a>
            </li>
            <li>
              <a
                href="https://firebase.google.com/support/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-400 hover:underline"
              >
                {t('firebasePrivacyPolicyLink')}
              </a>
            </li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white border-b border-slate-800 pb-2">
            {t('privacySec4Title')}
          </h2>
          <p className="text-slate-300 text-sm sm:text-base">
            {t('privacySec4Text')}
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white border-b border-slate-800 pb-2">
            {t('privacyCookiesTitle')}
          </h2>
          <div className="space-y-3 text-slate-300 text-sm sm:text-base">
            <p>{t('privacyCookiesIntro')}</p>
            <ul className="list-disc list-inside space-y-2 pl-2">
              <li>
                <strong className="text-slate-100">{t('privacyCookiesNecessaryLabel')}</strong>
                {t('privacyCookiesNecessaryText')}
              </li>
              <li>
                <strong className="text-slate-100">{t('privacyCookiesAnalyticsLabel')}</strong>
                {t('privacyCookiesAnalyticsText')}
              </li>
            </ul>
            <p>{t('privacyCookiesManageText')}</p>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white border-b border-slate-800 pb-2">
            {t('privacySec5Title')}
          </h2>
          <p className="text-slate-300 text-sm sm:text-base">
            {t('privacySec5Text')}
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