'use client';

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useLanguage } from '../context/LanguageContext'
import { hasConsentDecision, onConsentReopenRequest, setConsent } from '../lib/cookie-consent'

export default function CookieConsentBanner() {
  const { t, language } = useLanguage();

  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    setVisible(!hasConsentDecision());
  }, []);

  useEffect(() => {
    return onConsentReopenRequest(() => setVisible(true));
  }, []);

  const handleAcceptAll = () => {
    setConsent(true);
    setVisible(false);
  };

  const handleNecessaryOnly = () => {
    setConsent(false);
    setVisible(false);
  };

  if (!mounted || !visible) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label={t('cookieBannerTitle')}
      className="fixed bottom-0 inset-x-0 z-50 p-4 sm:p-6"
    >
      <div className="max-w-3xl mx-auto bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4">
        <p className="text-sm text-slate-300 leading-relaxed flex-1">
          {t('cookieBannerText')}{' '}
          <Link
            href={`/${language}/privacy`}
            className="text-emerald-400 hover:underline whitespace-nowrap"
          >
            {t('cookieBannerPrivacyLink')}
          </Link>
        </p>

        <div className="flex gap-2 shrink-0">
          <button
            onClick={handleNecessaryOnly}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            {t('cookieBannerNecessaryOnly')}
          </button>
          <button
            onClick={handleAcceptAll}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-colors cursor-pointer"
          >
            {t('cookieBannerAcceptAll')}
          </button>
        </div>
      </div>
    </div>
  );
}