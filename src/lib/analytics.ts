'use client';

import { Analytics, getAnalytics, isSupported, logEvent } from 'firebase/analytics'
import { firebaseApp } from './firebase'

let analyticsPromise: Promise<Analytics | null> | null = null;

export const getAnalyticsInstance = async (): Promise<Analytics | null> => {
  if (typeof window === 'undefined') return null;
  if (!analyticsPromise) {
    analyticsPromise = isSupported()
      .then((supported) => (supported ? getAnalytics(firebaseApp) : null))
      .catch(() => null);
  }
  return analyticsPromise;
};

export const trackEvent = async (eventName: string, eventParams?: Record<string, unknown>) => {
  try {
    const analytics = await getAnalyticsInstance();
    if (analytics) {
      logEvent(analytics, eventName, eventParams);
    }
  } catch (e) {
    console.error('Analytics tracking error:', e);
  }
};