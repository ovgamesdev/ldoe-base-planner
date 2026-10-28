'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BaseData } from './initial-data'
import type { HistoryEntry } from './history-store'
import { deleteStoredHistory, hashBase, loadStoredHistory, pruneStoredHistory, saveStoredHistory } from './history-store'
import type { TranslationKey } from '@/context/LanguageContext'

type SetMapState = (action: BaseData | ((prev: BaseData) => BaseData)) => void;

/** Подпись шага для подсказки на кнопке и признак склейки однотипных правок. */
export interface HistoryMeta {
  label?: TranslationKey;
  params?: Record<string, string | number>;
  coalesce?: string; // правки с одним ключом подряд склеиваются в один шаг
}
export type RecordedSetMapState = ((action: BaseData | ((prev: BaseData) => BaseData), meta?: HistoryMeta) => void) & {
  /** setMapState.labeled('histFloor')(prev => ...): то же, но с подписью шага. */
  labeled: (meta: TranslationKey | HistoryMeta) => (action: BaseData | ((prev: BaseData) => BaseData)) => void;
};

// Глубина истории в памяти на одну карту и базу. Снимки делят неизменённые слои между собой, так что 50 шагов обходятся дёшево.
const HISTORY_LIMIT = 50;
// Сколько шагов (с каждой стороны) переживает перезагрузку страницы.
const PERSIST_LIMIT = 10;
const PERSIST_DELAY_MS = 800;
const COALESCE_MS = 1000;

interface History { undo: HistoryEntry[]; redo: HistoryEntry[] }
const NO_HISTORY: History = { undo: [], redo: [] };
const capped = (list: HistoryEntry[], n = HISTORY_LIMIT) => (list.length > n ? list.slice(list.length - n) : list);

const arrEq = <T,>(a: T[], b: T[]) => a === b || (a.length === 0 && b.length === 0);
// Состояния считаем одинаковыми, если совпадают сами массивы слоёв: все правки создают новые массивы.
const sameBase = (a: BaseData, b: BaseData) =>
  a === b || (
    a.mapConfig.width === b.mapConfig.width && a.mapConfig.height === b.mapConfig.height &&
    arrEq(a.mapConfig.noBuildZones, b.mapConfig.noBuildZones) &&
    arrEq(a.layers.floors, b.layers.floors) && arrEq(a.layers.walls, b.layers.walls) && arrEq(a.layers.objects, b.layers.objects)
  );

interface Opts {
  mapKey: string; // карта + база: у каждой своя история
  mapState: BaseData;
  readOnly: boolean;
  ready: boolean; // карты загружены, состояние можно считать «известным»
  setMapState: SetMapState; // «сырая» запись состояния карты, без истории
  clearSelection: () => void;
}

/**
 * История правок карты: любое изменение через возвращаемый setMapState (массовые действия, одиночные
 * клики, панель выбранного элемента) становится шагом отката. Правки одного события склеиваются в один шаг,
 * однотипные правки одного объекта подряд (покраска, поворот) тоже, а вызовы без изменений шагов не создают.
 * Если состояние карты поменялось мимо setMapState (импорт, синхронизация), история этой карты сбрасывается.
 * Последние шаги сохраняются в IndexedDB и восстанавливаются после перезагрузки, если карта осталась прежней.
 */
export function useMapHistory({ mapKey, mapState, readOnly, ready, setMapState, clearSelection }: Opts) {
  const [history, setHistory] = useState<Record<string, History>>({});
  const historyRef = useRef(history);
  const latest = useRef(mapState);
  // Правка, поданная через setMapState и ещё не попавшая в историю. Состояние «до» берётся из known.
  const pending = useRef<{ key: string; meta: HistoryMeta } | null>(null);
  // Последнее состояние, которое мы видели; всё, что поменялось мимо нас, считается внешним изменением.
  const known = useRef<{ key: string; base: BaseData } | null>(null);
  // Состояние, которое ожидаем после отката/возврата.
  const expected = useRef<BaseData | null>(null);
  const lastEntry = useRef<HistoryEntry | null>(null);
  const loadedKeys = useRef(new Set<string>());

  const recordedFn = useCallback((action: BaseData | ((prev: BaseData) => BaseData), meta?: HistoryMeta) => {
    setMapState(prev => {
      const next = typeof action === 'function' ? action(prev) : action;
      if (!readOnly && next !== prev && !pending.current) pending.current = { key: mapKey, meta: meta ?? {} };
      return next;
    });
  }, [setMapState, readOnly, mapKey]);

  // recordedFn трогает ref только внутри обновления состояния, а не при рендере
  // eslint-disable-next-line react-hooks/refs
  const recorded = useMemo<RecordedSetMapState>(() => Object.assign(recordedFn, {
    labeled: (meta: TranslationKey | HistoryMeta) => {
      const m: HistoryMeta = typeof meta === 'string' ? { label: meta } : meta;
      return (action: BaseData | ((prev: BaseData) => BaseData)) => recordedFn(action, m);
    },
  }), [recordedFn]);

  useEffect(() => { historyRef.current = history; }, [history]);

  // Сверка с реальным состоянием: запись шага, ожидаемый откат или внешнее изменение.
  useEffect(() => {
    latest.current = mapState;
    if (!ready) return;
    const p = pending.current;
    pending.current = null;
    const k = known.current;
    if (!k || k.key !== mapKey) { known.current = { key: mapKey, base: mapState }; return; } // первый раз или смена карты
    if (sameBase(k.base, mapState)) return;
    known.current = { key: mapKey, base: mapState };

    if (p && p.key === mapKey) {
      const cur = historyRef.current[mapKey] ?? NO_HISTORY;
      const top = cur.undo[cur.undo.length - 1];
      const now = Date.now();
      let nextUndo: HistoryEntry[];
      if (p.meta.coalesce && top && top === lastEntry.current && top.coalesce === p.meta.coalesce && now - top.at < COALESCE_MS) {
        const merged = { ...top, at: now };
        lastEntry.current = merged;
        nextUndo = [...cur.undo.slice(0, -1), merged];
      } else {
        const entry: HistoryEntry = { base: k.base, label: p.meta.label, params: p.meta.params, coalesce: p.meta.coalesce, at: now };
        lastEntry.current = entry;
        nextUndo = capped([...cur.undo, entry]);
      }
      // Новая правка обрывает ветку «Вернуть».
      setHistory(h => ({ ...h, [mapKey]: { undo: nextUndo, redo: [] } }));
      return;
    }
    if (expected.current && sameBase(expected.current, mapState)) { expected.current = null; return; }
    // Карта изменилась мимо истории (импорт, синхронизация): прежние снимки к ней уже не относятся.
    setHistory(h => (h[mapKey]?.undo.length || h[mapKey]?.redo.length ? { ...h, [mapKey]: NO_HISTORY } : h));
  }, [mapState, mapKey, ready]);

  // ---------- сохранение между перезагрузками ----------

  useEffect(() => { if (ready) void pruneStoredHistory(); }, [ready]);

  useEffect(() => {
    if (!ready || readOnly || loadedKeys.current.has(mapKey)) return;
    loadedKeys.current.add(mapKey);
    const key = mapKey;
    const hash = hashBase(mapState);
    void loadStoredHistory(key).then(rec => {
      if (!rec || rec.headHash !== hash) return; // карта с тех пор изменилась: историю не восстанавливаем
      setHistory(h => (h[key]?.undo.length || h[key]?.redo.length ? h : { ...h, [key]: { undo: rec.undo, redo: rec.redo } }));
    });
  // mapState нужен только как состояние на момент первого показа карты
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, readOnly, mapKey]);

  useEffect(() => {
    if (!ready || readOnly) return;
    const h = history[mapKey];
    if (!h) return; // для этой карты ещё ничего не записывали или не загрузили: хранилище не трогаем
    const key = mapKey;
    const save = () => {
      if (!h.undo.length && !h.redo.length) { void deleteStoredHistory(key); return; }
      void saveStoredHistory(key, {
        undo: capped(h.undo, PERSIST_LIMIT), redo: capped(h.redo, PERSIST_LIMIT),
        headHash: hashBase(latest.current), savedAt: Date.now(),
      });
    };
    const timer = setTimeout(save, PERSIST_DELAY_MS);
    // Страницу закрывают раньше, чем сработает отсрочка: пишем сразу.
    const onHide = () => { if (document.visibilityState === 'hidden') { clearTimeout(timer); save(); } };
    document.addEventListener('visibilitychange', onHide);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', onHide); };
  }, [history, mapKey, ready, readOnly]);

  // ---------- откат и возврат ----------

  const cur = history[mapKey] ?? NO_HISTORY;
  const canUndo = !readOnly && cur.undo.length > 0;
  const canRedo = !readOnly && cur.redo.length > 0;
  const topUndo = canUndo ? cur.undo[cur.undo.length - 1] : null;
  const topRedo = canRedo ? cur.redo[cur.redo.length - 1] : null;

  const undo = useCallback(() => {
    const h = history[mapKey];
    if (readOnly || !h || !h.undo.length) return;
    const e = h.undo[h.undo.length - 1];
    setHistory({ ...history, [mapKey]: {
      undo: h.undo.slice(0, -1),
      redo: capped([...h.redo, { base: mapState, label: e.label, params: e.params, at: Date.now() }]),
    } });
    expected.current = e.base;
    setMapState(e.base);
    clearSelection();
  }, [history, mapKey, readOnly, mapState, setMapState, clearSelection]);

  const redo = useCallback(() => {
    const h = history[mapKey];
    if (readOnly || !h || !h.redo.length) return;
    const e = h.redo[h.redo.length - 1];
    setHistory({ ...history, [mapKey]: {
      undo: capped([...h.undo, { base: mapState, label: e.label, params: e.params, at: Date.now() }]),
      redo: h.redo.slice(0, -1),
    } });
    expected.current = e.base;
    setMapState(e.base);
    clearSelection();
  }, [history, mapKey, readOnly, mapState, setMapState, clearSelection]);

  return {
    setMapState: recorded, canUndo, canRedo, undo, redo,
    // Подписи ближайших шагов для подсказок на кнопках
    undoLabel: topUndo?.label ? { key: topUndo.label, params: topUndo.params } : null,
    redoLabel: topRedo?.label ? { key: topRedo.label, params: topRedo.params } : null,
  };
}
