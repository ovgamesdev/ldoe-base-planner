import type { BaseData } from './initial-data'
import type { TranslationKey } from '@/context/LanguageContext'

// Хранилище истории правок в IndexedDB: между перезагрузками страницы живут последние шаги отката и возврата.
// localStorage не подходит: снимки карты тяжёлые, а он ограничен ~5 МБ и уже занят самими картами.

export interface HistoryEntry {
  base: BaseData;
  label?: TranslationKey;
  params?: Record<string, string | number>;
  coalesce?: string;
  at: number;
}

export interface StoredHistory {
  undo: HistoryEntry[];
  redo: HistoryEntry[];
  headHash: string; // отпечаток состояния карты, к которому относится история
  savedAt: number;
}

const DB_NAME = 'ldoe-planner-history';
const STORE = 'history';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise(resolve => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise(resolve => {
    try {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Быстрый отпечаток состояния карты (FNV-1a по JSON). Нужен, чтобы понять, что сохранённая история относится к этой карте. */
export function hashBase(base: BaseData): string {
  const s = JSON.stringify(base);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return `${s.length}:${(h >>> 0).toString(16)}`;
}

export async function loadStoredHistory(key: string): Promise<StoredHistory | null> {
  const rec = await run<StoredHistory | undefined>('readonly', s => s.get(key));
  return rec ?? null;
}

export async function saveStoredHistory(key: string, rec: StoredHistory): Promise<void> {
  await run('readwrite', s => s.put(rec, key));
}

export async function deleteStoredHistory(key: string): Promise<void> {
  await run('readwrite', s => s.delete(key));
}

/** Удаляет записи старше 30 дней (карты, которыми давно не пользовались или которых уже нет). */
export async function pruneStoredHistory(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
    const req = store.openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) return;
      const rec = cur.value as StoredHistory;
      if (!rec || Date.now() - rec.savedAt > MAX_AGE_MS) cur.delete();
      cur.continue();
    };
  } catch { /* история необязательна */ }
}
