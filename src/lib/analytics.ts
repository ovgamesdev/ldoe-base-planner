'use client';

import { Analytics, getAnalytics, isSupported, logEvent } from 'firebase/analytics'
import { isAnalyticsAllowed, onConsentChange } from './cookie-consent'
import { firebaseApp } from './firebase'

let analyticsPromise: Promise<Analytics | null> | null = null;

const initAnalytics = (): Promise<Analytics | null> => {
  if (!analyticsPromise) {
    analyticsPromise = isSupported()
      .then((supported) => (supported ? getAnalytics(firebaseApp) : null))
      .catch(() => null);
  }
  return analyticsPromise;
};

export const getAnalyticsInstance = async (): Promise<Analytics | null> => {
  if (typeof window === 'undefined') return null;
  if (!isAnalyticsAllowed()) return null; // нет согласия — GA не инициализируется, cookies не ставятся
  return initAnalytics();
};

export const trackEvent = async (eventName: string, eventParams?: Record<string, unknown>) => {
  try {
    const analytics = await getAnalyticsInstance();
    if (analytics) {
      logEvent(analytics, eventName, eventParams);
    }
    // Если согласия ещё нет — событие просто отбрасывается. Без очередей и "досылки задним числом".
  } catch (e) {
    console.error('Analytics tracking error:', e);
  }
};

if (typeof window !== 'undefined') {
  onConsentChange((consent) => {
    if (consent.analytics) {
      initAnalytics();
    }
  });
}