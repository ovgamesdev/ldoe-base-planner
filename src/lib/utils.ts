/** UUID v4 без crypto.randomUUID: на getRandomValues, а если и его нет — на Math.random. */
const uuidFromRandomValues = (): string =>
  '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
    (+c ^ ((typeof window !== 'undefined' && window.crypto ? window.crypto.getRandomValues(new Uint8Array(1))[0] : Math.floor(Math.random() * 256)) & (15 >> (+c / 4)))).toString(16)
  );

/** Generates a random UUID, falling back to a manual implementation when window.crypto.randomUUID isn't available. */
export const generateUUID = (): string => {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return uuidFromRandomValues();
};

/**
 * crypto.randomUUID есть только в защищённом контексте (https / localhost). Если открыть dev-сервер с телефона по
 * http://192.168.x.x, его нет, а Firebase (App Check, Installations) вызывает его сам. Подставляем ту же запасную
 * реализацию, что и в generateUUID. В защищённом контексте ничего не меняет.
 */
export const installRandomUUIDPolyfill = (): void => {
  if (typeof window === 'undefined' || !window.crypto || typeof window.crypto.randomUUID === 'function') return;
  window.crypto.randomUUID = uuidFromRandomValues as typeof window.crypto.randomUUID;
};

/** Small, fast, non-cryptographic string hash (cyrb53). Used to derive a stable short id from a share id. */
export const cyrb53 = (str: string, seed = 0): string => {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
};

/** Base path the app is deployed under (e.g. for subpath hosting). Prefix any static asset URL with this. */
export const getBasePath = (): string => process.env.NEXT_PUBLIC_BASE_PATH || '';

/** Добавляет к адресу версию сборки (?v=...), чтобы после деплоя файл не брался из старого кэша. */
export const withBuildVersion = (url: string): string => {
  const v = process.env.NEXT_PUBLIC_BUILD_ID;
  return v ? `${url}${url.includes('?') ? '&' : '?'}v=${encodeURIComponent(v)}` : url;
};

/** Order-independent structural equality for JSON-serializable values (sorts object keys before comparing). */
export const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(',')}}`;
};