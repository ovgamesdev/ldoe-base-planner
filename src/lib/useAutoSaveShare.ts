/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from '@/lib/firebase'
import { withOnline } from '@/lib/firebase-connection'
import {
  buildFirebaseDiff,
  cleanUndefined,
  computeSnapshotHash,
  prepareShareRecords
} from '@/lib/firebase-sync'
import { MapData } from '@/lib/initial-data'
import { User } from 'firebase/auth'
import { get, ref, serverTimestamp, update } from 'firebase/database'
import { useCallback, useEffect, useRef, useState } from 'react'

interface AutoSaveState {
  isSaving: boolean;
  lastSyncedAt: number | null;
  syncError: Error | null;
  existsInFirebase: boolean;
}

export function useAutoSaveShare(
  mapData: MapData | null,
  currentUser: User | null,
  delayMs: number = 2000
) {
  const [saveState, setSaveState] = useState<AutoSaveState>({
    isSaving: false,
    lastSyncedAt: null,
    syncError: null,
    existsInFirebase: false
  });

  const mapRef = useRef(mapData);
  useEffect(() => {
    mapRef.current = mapData;
  }, [mapData]);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const lastSavedSnapshotRef = useRef<{
    share: Record<string, any>;
    summary: Record<string, any>;
  } | null>(null);

  const lastSavedHashRef = useRef<string | null>(null);
  const existsInFirebaseRef = useRef<boolean>(false);
  const checkedExistenceRef = useRef<string | null>(null);

  // Отслеживаем текущую (ещё не завершённую) проверку существования, чтобы
  // performSave мог её дождаться, а не работать по устаревшему/чужому
  // снапшоту, если сохранение сработает раньше, чем проверка успеет
  // завершиться (см. комментарий ниже про гонку при смене shareId).
  const existenceCheckRef = useRef<{ shareId: string; promise: Promise<void> } | null>(null);

  // Проверка существования записи в Firebase при смене shareId
  useEffect(() => {
    const shareId = mapData?.shareId;
    const ownerId = mapData?.ownerId;
    const isOwner = currentUser && ownerId === currentUser.uid;

    if (!shareId || !isOwner) {
      existsInFirebaseRef.current = false;
      checkedExistenceRef.current = null;
      existenceCheckRef.current = null;
      lastSavedSnapshotRef.current = null;
      lastSavedHashRef.current = null;
      setSaveState({
        isSaving: false,
        lastSyncedAt: null,
        syncError: null,
        existsInFirebase: false
      });
      return;
    }

    if (checkedExistenceRef.current === shareId) return;
    checkedExistenceRef.current = shareId;

    // Сбрасываем состояние СИНХРОННО, до начала асинхронного запроса. Если
    // этого не сделать, снапшот/хэш от предыдущего shareId остаются
    // действительными до завершения проверки — и если за это время
    // сработает дебаунс performSave, он посчитает diff для нового shareId
    // относительно данных совсем другой карты.
    existsInFirebaseRef.current = false;
    lastSavedSnapshotRef.current = null;
    lastSavedHashRef.current = null;

    const checkPromise = (async () => {
      try {
        const snapshot = await withOnline(() => get(ref(db, `shares/${shareId}`)));
        if (!isMountedRef.current) return;

        if (snapshot.exists()) {
          existsInFirebaseRef.current = true;
          const remoteVal = cleanUndefined(snapshot.val());
          const summaryVal = {
            id: remoteVal.id,
            name: remoteVal.name,
            ownerId: remoteVal.ownerId,
            shareId: remoteVal.shareId,
            createdAt: remoteVal.createdAt,
            updatedAt: remoteVal.updatedAt
          };

          lastSavedSnapshotRef.current = {
            share: remoteVal,
            summary: summaryVal
          };
          lastSavedHashRef.current = computeSnapshotHash(lastSavedSnapshotRef.current);

          setSaveState(prev => ({
            ...prev,
            existsInFirebase: true,
            lastSyncedAt: typeof remoteVal.updatedAt === 'number' ? remoteVal.updatedAt : Date.now()
          }));
        } else {
          existsInFirebaseRef.current = false;
          lastSavedSnapshotRef.current = null;
          lastSavedHashRef.current = null;
          setSaveState(prev => ({ ...prev, existsInFirebase: false }));
        }
      } catch (err) {
        if (isMountedRef.current) {
          console.error('Ошибка проверки существования карты в Firebase:', err);
        }
        // Разрешаем повторную попытку: без этого сбоя сети хук навсегда
        // остаётся в состоянии "неизвестно" и все сохранения этого shareId
        // идут по ветке полной перезаписи вместо инкрементального diff.
        checkedExistenceRef.current = null;
      } finally {
        if (existenceCheckRef.current?.shareId === shareId) {
          existenceCheckRef.current = null;
        }
      }
    })();

    existenceCheckRef.current = { shareId, promise: checkPromise };
  }, [mapData?.shareId, mapData?.ownerId, currentUser]);

  const performSave = useCallback(async () => {
    let currentMap = mapRef.current;
    if (!currentMap || !currentMap.shareId || !currentUser) return;
    if (currentMap.ownerId !== currentUser.uid) return;

    // Если проверка существования для текущего shareId ещё не завершилась —
    // дожидаемся её. Иначе можно ошибочно выбрать "создать" вместо
    // "обновить" (или наоборот) и получить неполную запись/отклонённую
    // валидацию на стороне Firebase.
    const pendingCheck = existenceCheckRef.current;
    if (pendingCheck && pendingCheck.shareId === currentMap.shareId) {
      await pendingCheck.promise;
      if (!isMountedRef.current) return;
      // Данные могли обновиться, пока ждали проверку — берём свежие.
      currentMap = mapRef.current;
      if (!currentMap || currentMap.shareId !== pendingCheck.shareId || !currentUser) return;
      if (currentMap.ownerId !== currentUser.uid) return;
    }

    const now = serverTimestamp();
    const cleanedMap = cleanUndefined(currentMap);
    const { shareRecord, summaryRecord } = prepareShareRecords(cleanedMap, now);

    const currentSnapshot = {
      share: shareRecord,
      summary: summaryRecord
    };
    const currentHash = computeSnapshotHash(currentSnapshot);

    // Если данные не изменились с момента последнего сохранения — пропускаем
    if (lastSavedHashRef.current === currentHash) {
      return;
    }

    if (isMountedRef.current) {
      setSaveState(prev => ({ ...prev, isSaving: true, syncError: null }));
    }

    try {
      const shareId = currentMap.shareId;

      await withOnline(async () => {
        if (!existsInFirebaseRef.current) {
          // Первичное сохранение: создаём полные структуры в shares и shares_summary
          const updates: Record<string, any> = {
            [`shares/${shareId}`]: shareRecord,
            [`shares_summary/${shareId}`]: summaryRecord
          };

          await update(ref(db), updates);
          existsInFirebaseRef.current = true;
        } else {
          // Последующее сохранение: отправляем только diff
          const lastShare = lastSavedSnapshotRef.current?.share || null;
          const lastSummary = lastSavedSnapshotRef.current?.summary || null;

          if (lastShare?.createdAt) {
            shareRecord.createdAt = lastShare.createdAt;
            summaryRecord.createdAt = lastShare.createdAt;
          }

          const shareDiff = buildFirebaseDiff(lastShare, shareRecord, `shares/${shareId}`);
          const summaryDiff = buildFirebaseDiff(lastSummary, summaryRecord, `shares_summary/${shareId}`);

          // Правила Firebase требуют, чтобы updatedAt присутствовал и был
          // числом (`newData.isNumber() && newData.val() <= now`) в каждой
          // записи. buildFirebaseDiff и так включает его почти всегда, но
          // неявно — из-за того, что serverTimestamp()-плейсхолдер никогда
          // не равен предыдущему числовому значению при сравнении. Не
          // полагаемся на этот побочный эффект и прописываем поле явно.
          shareDiff[`shares/${shareId}/updatedAt`] = shareRecord.updatedAt;
          summaryDiff[`shares_summary/${shareId}/updatedAt`] = summaryRecord.updatedAt;

          const updates = { ...shareDiff, ...summaryDiff };

          await update(ref(db), updates);
        }
      });

      // Обновляем snapshot и hash только при успешном запросе
      lastSavedSnapshotRef.current = currentSnapshot;
      lastSavedHashRef.current = currentHash;

      if (isMountedRef.current) {
        setSaveState({
          isSaving: false,
          lastSyncedAt: Date.now(),
          syncError: null,
          existsInFirebase: true
        });
      }
    } catch (err: any) {
      console.error('Ошибка фонового сохранения карты в Firebase:', err);

      // PERMISSION_DENIED в этой точке обычно означает, что удалённая запись
      // была удалена (не через этот хук — например, вручную или из другой
      // вкладки) и наш кэш "запись существует" устарел. Если продолжать
      // слать diff, каждая последующая попытка будет так же биться о
      // hasChildren([...]) на частично записанном/пустом узле. Сбрасываем
      // кэш, чтобы следующая попытка ушла как полноценное создание записи.
      const message = err instanceof Error ? err.message : String(err);
      if (/permission_denied/i.test(message)) {
        existsInFirebaseRef.current = false;
        lastSavedSnapshotRef.current = null;
        lastSavedHashRef.current = null;
      }

      if (isMountedRef.current) {
        setSaveState(prev => ({
          ...prev,
          isSaving: false,
          syncError: err instanceof Error ? err : new Error(String(err))
        }));
      }
    }
  }, [currentUser]);

  // Запуск фонового сохранения с дебаунсом при изменении карты
  useEffect(() => {
    const shareId = mapData?.shareId;
    const ownerId = mapData?.ownerId;
    if (!shareId || !currentUser || ownerId !== currentUser.uid) {
      return;
    }

    const timer = setTimeout(() => {
      void performSave();
    }, delayMs);

    return () => clearTimeout(timer);
  }, [mapData, currentUser, delayMs, performSave]);

  return {
    ...saveState,
    triggerSaveNow: performSave
  };
}