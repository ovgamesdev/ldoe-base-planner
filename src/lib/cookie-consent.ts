export type CookieConsent = {
  analytics: boolean;
  timestamp: number;
};

const CONSENT_KEY = 'cookie-consent-v1';
const CONSENT_EVENT = 'cookie-consent-changed';
const CONSENT_REOPEN_EVENT = 'cookie-consent-reopen';

export const getConsent = (): CookieConsent | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    return raw ? (JSON.parse(raw) as CookieConsent) : null;
  } catch {
    return null;
  }
};

/** true, если пользователь уже принял какое-либо решение (согласился ИЛИ отказался) */
export const hasConsentDecision = (): boolean => getConsent() !== null;

export const setConsent = (analytics: boolean): void => {
  if (typeof window === 'undefined') return;
  const value: CookieConsent = { analytics, timestamp: Date.now() };
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify(value));
  } catch {
    // localStorage недоступен (приватный режим и т.п.) — решение просто не сохранится между визитами
  }
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: value }));
};

/**
 * Сбросить решение и попросить баннер снова показаться (без перезагрузки страницы).
 * Используется настройкой "Cookie settings" в интерфейсе — например, чтобы
 * отозвать ранее данное согласие на аналитику.
 */
export const clearConsent = (): void => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(CONSENT_KEY);
  window.dispatchEvent(new Event(CONSENT_REOPEN_EVENT));
};

export const isAnalyticsAllowed = (): boolean => getConsent()?.analytics === true;

/** Подписка на изменение согласия без перезагрузки страницы */
export const onConsentChange = (cb: (consent: CookieConsent) => void): (() => void) => {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: Event) => cb((e as CustomEvent<CookieConsent>).detail);
  window.addEventListener(CONSENT_EVENT, handler);
  return () => window.removeEventListener(CONSENT_EVENT, handler);
};

/** Подписка на запрос "показать баннер согласия снова" (вызывается из clearConsent) */
export const onConsentReopenRequest = (cb: () => void): (() => void) => {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(CONSENT_REOPEN_EVENT, cb);
  return () => window.removeEventListener(CONSENT_REOPEN_EVENT, cb);
};