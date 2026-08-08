import { db } from '@/lib/firebase'
import { goOffline, goOnline } from 'firebase/database'

/**
 * `goOnline()` / `goOffline()` в Firebase RTDB переключают ОДНО глобальное
 * соединение для всего экземпляра `db`, а не только для текущей операции.
 * Если в приложении есть несколько независимых мест, которые делают
 * `goOnline() -> запрос -> goOffline()`, и хотя бы два таких вызова
 * пересекаются по времени, более ранний `goOffline()` тихо обрывает ещё
 * не завершённый запрос другого места.
 *
 * `withOnline` решает это подсчётом ссылок: соединение открывается один
 * раз на первый "хочу онлайн" и закрывается только когда счётчик снова
 * дошёл до нуля, то есть когда никому больше не нужно.
 */
let refCount = 0;

export async function withOnline<T>(fn: () => Promise<T>): Promise<T> {
  refCount++;
  if (refCount === 1) {
    goOnline(db);
  }
  try {
    return await fn();
  } finally {
    refCount--;
    if (refCount === 0) {
      goOffline(db);
    }
  }
}