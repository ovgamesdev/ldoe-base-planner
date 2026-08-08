/* eslint-disable @typescript-eslint/no-explicit-any */
import { MapData } from '@/lib/initial-data'
import { cyrb53 } from '@/lib/utils'
import { DEFAULT_MAP } from './constants'

/**
 * Рекурсивно очищает объект или массив от значений `undefined`,
 * чтобы предотвратить ошибки при вызове update() в Firebase Realtime Database.
 */
export function cleanUndefined<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj
      .filter((item) => item !== undefined)
      .map((item) => cleanUndefined(item)) as unknown as T;
  }

  if (typeof obj === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleaned[key] = cleanUndefined(value);
      }
    }
    return cleaned as unknown as T;
  }

  return obj;
}

/**
 * Вычисляет хеш снимка данных для быстрой проверки наличия изменений.
 */
export function computeSnapshotHash(data: any): string {
  return String(cyrb53(JSON.stringify(data)));
}

/**
 * Генерирует точечный diff для вызова update() в Firebase.
 * Удалённые поля передаются со значением null.
 */
export function buildFirebaseDiff(
  prev: Record<string, any> | null,
  next: Record<string, any>,
  prefix: string = ''
): Record<string, any> {
  const diff: Record<string, any> = {};

  if (!prev) {
    diff[prefix] = next;
    return diff;
  }

  const allKeys = new Set([...Object.keys(prev), ...Object.keys(next)]);

  for (const key of allKeys) {
    const prevVal = prev[key];
    const nextVal = next[key];
    const path = prefix ? `${prefix}/${key}` : key;

    if (nextVal === undefined) {
      if (prevVal !== undefined) {
        diff[path] = null;
      }
      continue;
    }

    if (prevVal === undefined) {
      diff[path] = nextVal;
      continue;
    }

    if (JSON.stringify(prevVal) === JSON.stringify(nextVal)) {
      continue;
    }

    if (
      typeof prevVal === 'object' &&
      prevVal !== null &&
      !Array.isArray(prevVal) &&
      typeof nextVal === 'object' &&
      nextVal !== null &&
      !Array.isArray(nextVal)
    ) {
      const subDiff = buildFirebaseDiff(prevVal, nextVal, path);
      Object.assign(diff, subDiff);
    } else {
      diff[path] = nextVal;
    }
  }

  return diff;
}

/**
 * Формирует полные объекты `shares/{shareId}` и `shares_summary/{shareId}`
 * с гарантированным соответствием Firebase Security Rules.
 */
export function prepareShareRecords(mapData: MapData, timestamp: object) {
  const cleaned = cleanUndefined(mapData);
  const createdAt = typeof cleaned.createdAt === 'number' ? cleaned.createdAt : timestamp;
  const updatedAt = timestamp;

  const rawName = (cleaned.name || '').trim() || 'Map';
  const name = rawName.length > 100 ? rawName.slice(0, 100) : rawName;

  const shareRecord = {
    id: cleaned.id,
    name,
    ownerId: cleaned.ownerId || '',
    shareId: cleaned.shareId || '',
    mainBase: cleaned.mainBase || {
      mapConfig: DEFAULT_MAP.mainBase.mapConfig,
      layers: DEFAULT_MAP.mainBase.layers
    },
    settlementBase: cleaned.settlementBase || {
      mapConfig: DEFAULT_MAP.settlementBase.mapConfig,
      layers: DEFAULT_MAP.settlementBase.layers
    },
    createdAt,
    updatedAt
  };

  const summaryRecord = {
    id: cleaned.id,
    name,
    ownerId: cleaned.ownerId || '',
    shareId: cleaned.shareId || '',
    createdAt,
    updatedAt
  };

  return {
    shareRecord,
    summaryRecord
  };
}