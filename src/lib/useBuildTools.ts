'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { trackEvent } from './analytics'
import { createLayerIndex } from './build-index'
import type { BuildViewState } from './build-preview-store'
import { createBuildPreviewStore } from './build-preview-store'
import type { BrushSize, BuildMode, BuildPoint, Orientation, SizeLabel, WallSeg } from './build-modes'
import { TOOL_MODES, boundarySegments, cellsForMode, floodFill, isRangeMode, lineCells, runsForMode, segKey, sizeLabel, tilePositions, uniqueSegments } from './build-modes'
import type { Tool } from './constants'
import { getEffectiveSize, getFinalSize, hasFloorForWall, isWallDecorValid } from './grid-utils'
import type { BaseData, BaseType, CatalogItem, NoBuildZone, ObjectLayer, SettlementLayerType, WallLayer } from './initial-data'
import type { RecordedSetMapState } from './useMapHistory'
import { generateUUID } from './utils'
import type { TranslationKey } from '@/context/LanguageContext'

export type EraserScope = 'all' | 'objects' | 'floors' | 'walls';

export interface BuildPreview {
  tone: 'add' | 'remove';
  cells: { x: number; y: number; ok: boolean }[];
  segs: { x: number; y: number; orientation: Orientation; ok: boolean }[];
  boxes: { x: number; y: number; w: number; h: number; ok: boolean }[];
  label?: SizeLabel | null; // подпись размера при протяжке («5×3»)
}

interface Plan extends BuildPreview {
  changes: number;
  firstReason?: string;
  protectedCount?: number;
  apply?: (prev: BaseData) => BaseData;
}

interface Deps {
  tool: Tool;
  mapState: BaseData;
  activeMapId: string;
  activeBaseType: BaseType;
  activeSettlementLayer: SettlementLayerType;
  catalogMap: Record<string, CatalogItem>;
  selectedTypeId: string;
  currentRotation: number;
  buildLevel: number;
  isDoorPlacement: boolean;
  isWindowPlacement: boolean;
  movingInstanceId: string | null;
  readOnly: boolean;
  gridW: number;
  gridH: number;
  setMapState: RecordedSetMapState;
  validatePlacement: (typeId: string, x: number, y: number, rotation: number, ignoreInstanceId?: string, extraObjects?: ObjectLayer[]) => { valid: boolean; reason?: string };
  showAlert: (message: string, title?: string, type?: 'error' | 'info' | 'success' | 'warning', dontShowAgainKey?: string) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  getCopyColor: (typeId: string) => string | undefined;
  clearSelection: () => void;
  history: { canUndo: boolean; canRedo: boolean; undo: () => void; redo: () => void };
}

const k2 = (x: number, y: number) => `${x},${y}`;

// Выбранный режим по инструментам переживает перезагрузку страницы (localStorage, ключ ниже).
const MODES_KEY = 'ldoe_build_modes';
const ALL_MODES: BuildMode[] = ['single', 'brush', 'line', 'rect', 'frame', 'fill', 'outline'];
const loadModes = (): Partial<Record<Tool, BuildMode>> => {
  try {
    const raw = JSON.parse(localStorage.getItem(MODES_KEY) ?? '{}') as Record<string, unknown>;
    const out: Partial<Record<Tool, BuildMode>> = {};
    for (const t of Object.keys(TOOL_MODES) as Tool[]) {
      const m = raw?.[t];
      if (typeof m === 'string' && (ALL_MODES as string[]).includes(m)) out[t] = m as BuildMode;
    }
    return out;
  } catch { return {}; }
};
const saveModes = (modes: Partial<Record<Tool, BuildMode>>) => {
  try { localStorage.setItem(MODES_KEY, JSON.stringify(modes)); } catch { /* хранилище недоступно: режим просто не запомнится */ }
};

// Подпись массового действия в истории («Пол (12)»)
const BULK_LABEL: Record<Tool, TranslationKey> = {
  floor: 'histBulkFloor', wall: 'histBulkWall', object: 'histBulkObject', nobuild: 'histBulkNoBuild', eraser: 'histBulkErase', hand: 'histBulkErase',
};

const EMPTY: Plan = { tone: 'add', cells: [], segs: [], boxes: [], changes: 0 };

export function useBuildTools(deps: Deps) {
  const {
    tool, mapState, activeMapId, activeBaseType, activeSettlementLayer, catalogMap, selectedTypeId, currentRotation,
    buildLevel, isDoorPlacement, isWindowPlacement, movingInstanceId, gridW, gridH,
    setMapState, validatePlacement, showAlert, getCopyColor, clearSelection, history,
  } = deps;
  const { t } = deps;

  const [modeByTool, setModeByTool] = useState<Partial<Record<Tool, BuildMode>>>({});
  const modesRef = useRef<Partial<Record<Tool, BuildMode>>>({});
  // Читаем после монтирования, а не в инициализаторе состояния: иначе разметка с сервера и клиента разойдётся.
  useEffect(() => {
    modesRef.current = { ...loadModes(), ...modesRef.current };
    setModeByTool(modesRef.current);
  }, []);
  const [eraserScope, setEraserScope] = useState<EraserScope>('all');
  const [brushSize, setBrushSize] = useState<BrushSize>(1);

  const template = catalogMap[selectedTypeId];
  const isDecor = tool === 'object' && template?.constraints.placementType === 'wall';

  // Какие режимы показывать: у декора на стене нет кисти и контура-рамки (там 'rect' и так контур).
  const modes = useMemo(() => {
    const list = TOOL_MODES[tool];
    if (isDecor) return list.filter(m => m === 'single' || m === 'line' || m === 'rect');
    return list;
  }, [tool, isDecor]);

  let mode: BuildMode = modeByTool[tool] ?? 'single';
  if (!modes.includes(mode)) mode = 'single';
  if (tool === 'object' && movingInstanceId) mode = 'single'; // перемещение — всегда по одному
  const active = mode !== 'single';
  // wall и декор на стене строятся по вершинам сетки; всё остальное — по клеткам.
  const kind: 'cell' | 'vertex' = (tool === 'wall' || isDecor) && isRangeMode(mode) ? 'vertex' : 'cell';

  // Размер кисти есть у пола, запретной зоны и ластика и только в режиме «кисть» (у объектов кисть ставит по одному).
  const brushSizeApplies = mode === 'brush' && (tool === 'floor' || tool === 'nobuild' || tool === 'eraser');

  const setMode = useCallback((m: BuildMode) => {
    modesRef.current = { ...modesRef.current, [tool]: m };
    setModeByTool(modesRef.current);
    saveModes(modesRef.current);
  }, [tool]);

  // ---------- индексы слоёв ----------
  // Карты и множества по слоям считаются лениво и один раз на изменение самих слоёв, а не при каждом
  // движении курсора (см. build-index.ts).
  const { floors: layerFloors, walls: layerWalls, objects: layerObjects } = mapState.layers;
  const noBuildZones = mapState.mapConfig.noBuildZones;
  const idx = useMemo(
    () => createLayerIndex({ floors: layerFloors, walls: layerWalls, objects: layerObjects, noBuildZones, catalogMap, activeBaseType, activeSettlementLayer }),
    [layerFloors, layerWalls, layerObjects, noBuildZones, catalogMap, activeBaseType, activeSettlementLayer],
  );

  // ---------- планирование ----------

  const buildPlan = useCallback((m: BuildMode, points: BuildPoint[], forCommit = false): Plan => {
    if (!points.length) return EMPTY;
    const W = gridW, H = gridH;
    const inB = (c: BuildPoint) => c.x >= 0 && c.y >= 0 && c.x < W && c.y < H;
    const zoneMatches = (nb: NoBuildZone) => activeBaseType === 'main' || nb.layer === activeSettlementLayer;
    const cascade = (base: BaseData, nextFloors: BaseData['layers']['floors'], nextWalls: BaseData['layers']['walls']): BaseData => {
      const checkedWalls = nextWalls.filter(w => hasFloorForWall(nextFloors, w.x, w.y, w.orientation, w.level));
      return {
        ...base,
        layers: {
          ...base.layers,
          floors: nextFloors,
          walls: checkedWalls,
          objects: base.layers.objects.filter(o => isWallDecorValid(o, checkedWalls, catalogMap)),
        },
      };
    };

    // ---- пол ----
    if (tool === 'floor') {
      if (activeBaseType === 'settlement' && buildLevel > 3) return { ...EMPTY, firstReason: t('settlementFloorMaxLvl') };

      const floorAt = idx.floorAt();
      const noBuild = idx.noBuild();
      const { occupied, needLevel } = idx.occupancy();

      let target: BuildPoint[];
      if (m === 'fill') {
        const startLevel = floorAt.get(k2(points[0].x, points[0].y));
        target = floodFill(points[0], W, H, (x, y) => floorAt.get(k2(x, y)) === startLevel, idx.wallKeys());
      } else {
        target = cellsForMode(m, points, brushSize).filter(inB);
      }
      if (!target.length) return EMPTY;

      const remove = m !== 'fill' && target.every(c => floorAt.get(k2(c.x, c.y)) === buildLevel);
      let firstReason: string | undefined;
      const cells = target.map(c => {
        const key = k2(c.x, c.y);
        const cur = floorAt.get(key);
        let reason: string | undefined;
        if (remove) {
          if (occupied.has(key)) reason = t('cannotRemoveFloorUnderObject');
        } else if (noBuild.has(key)) reason = t('cannotBuildInNoBuildZone');
        else if (cur === undefined && occupied.has(key)) reason = t('cannotPlaceFloorUnderObject');
        else if (cur !== undefined && buildLevel < (needLevel.get(key) ?? 0)) reason = t('cannotLowerFloorUnderObject');
        if (reason && !firstReason) firstReason = reason;
        return { x: c.x, y: c.y, ok: !reason };
      });
      const good = cells.filter(c => c.ok);
      const changes = good.filter(c => (remove ? floorAt.has(k2(c.x, c.y)) : floorAt.get(k2(c.x, c.y)) !== buildLevel)).length;
      return {
        tone: remove ? 'remove' : 'add', cells, segs: [], boxes: [], changes, firstReason,
        apply: (prev) => {
          const byKey = new Map(prev.layers.floors.map(f => [k2(f.x, f.y), f]));
          for (const c of good) {
            if (remove) byKey.delete(k2(c.x, c.y));
            else byKey.set(k2(c.x, c.y), { x: c.x, y: c.y, level: buildLevel });
          }
          return cascade(prev, [...byKey.values()], prev.layers.walls);
        },
      };
    }

    // ---- запретная зона ----
    if (tool === 'nobuild') {
      const inZone = idx.noBuild();
      let target: BuildPoint[];
      let remove: boolean;
      if (m === 'fill') {
        const startState = inZone.has(k2(points[0].x, points[0].y));
        target = floodFill(points[0], W, H, (x, y) => inZone.has(k2(x, y)) === startState, idx.wallKeys());
        remove = startState;
      } else {
        target = cellsForMode(m, points, brushSize).filter(inB);
        remove = target.length > 0 && target.every(c => inZone.has(k2(c.x, c.y)));
      }
      if (!target.length) return EMPTY;

      const targetKeys = new Set(target.map(c => k2(c.x, c.y)));
      const changes = target.filter(c => inZone.has(k2(c.x, c.y)) === remove).length;
      return {
        tone: remove ? 'remove' : 'add',
        cells: target.map(c => ({ ...c, ok: true })), segs: [], boxes: [], changes,
        apply: (prev) => {
          const kept = prev.mapConfig.noBuildZones.filter(z => !(zoneMatches(z) && targetKeys.has(k2(z.x, z.y))));
          const layer = activeBaseType === 'settlement' ? activeSettlementLayer : undefined;
          return {
            ...prev,
            mapConfig: {
              ...prev.mapConfig,
              noBuildZones: remove ? kept : [...kept, ...target.map(c => ({ x: c.x, y: c.y, layer }))],
            },
          };
        },
      };
    }

    // ---- стены ----
    if (tool === 'wall') {
      if (activeBaseType === 'settlement' && buildLevel > 2) return { ...EMPTY, firstReason: t('settlementWallMaxLvl') };

      let segs: WallSeg[];
      if (m === 'outline') {
        const floorSet = idx.floorSet();
        const region = floodFill(points[0], W, H, (x, y) => floorSet.has(k2(x, y)), idx.wallKeys(), false);
        if (!region.length) return { ...EMPTY, firstReason: t('wallOutlineNeedsFloor') };
        segs = boundarySegments(region);
      } else {
        segs = uniqueSegments(runsForMode(m, points));
      }
      segs = segs.filter(s => (s.orientation === 'horizontal'
        ? s.x >= 0 && s.x < W && s.y >= 0 && s.y <= H
        : s.x >= 0 && s.x <= W && s.y >= 0 && s.y < H));
      if (!segs.length) return EMPTY;

      const wallAt = idx.wallAt();
      const same = (w: WallLayer | undefined) =>
        !!w && w.level === buildLevel && !!w.isDoor === isDoorPlacement && !!w.isWindow === isWindowPlacement;
      const remove = m !== 'outline' && segs.every(s => same(wallAt.get(segKey(s))));
      const crossedEdges = idx.crossedEdges();

      let firstReason: string | undefined;
      const out = segs.map(s => {
        let reason: string | undefined;
        if (!remove) {
          if (!idx.hasFloorForWall(s.x, s.y, s.orientation, buildLevel)) reason = t('wallRequiresFloor', { level: buildLevel });
          else if (crossedEdges.has(segKey(s))) reason = t('wallCrossesBuilding');
        }
        if (reason && !firstReason) firstReason = reason;
        return { ...s, ok: !reason };
      });
      const good = out.filter(s => s.ok);
      const changes = good.filter(s => (remove ? wallAt.has(segKey(s)) : !same(wallAt.get(segKey(s))))).length;
      return {
        tone: remove ? 'remove' : 'add', cells: [], segs: out, boxes: [], changes, firstReason,
        apply: (prev) => {
          const targets = new Set(good.map(segKey));
          const kept = prev.layers.walls.filter(w => !targets.has(segKey(w)));
          const nextWalls = remove ? kept : [...kept, ...good.map(s => ({
            x: s.x, y: s.y, orientation: s.orientation, level: buildLevel, isDoor: isDoorPlacement, isWindow: isWindowPlacement,
          }))];
          return {
            ...prev,
            layers: { ...prev.layers, walls: nextWalls, objects: prev.layers.objects.filter(o => isWallDecorValid(o, nextWalls, catalogMap)) },
          };
        },
      };
    }

    // ---- объекты ----
    if (tool === 'object' && template) {
      const placed: ObjectLayer[] = [];
      const rotationToUse = template.constraints.autoTiling ? 0 : currentRotation;
      const layer = activeBaseType === 'settlement' ? (template.constraints.settlementLayer || 'objects') : undefined;
      // цвет копируемого объекта читаем из ref только при реальном размещении, не при предпросмотре
      const copyColor = forCommit ? getCopyColor(selectedTypeId) : undefined;
      let firstReason: string | undefined;
      const boxes: BuildPreview['boxes'] = [];
      const segs: BuildPreview['segs'] = [];

      const tryPlace = (x: number, y: number, rotation: number) => {
        const res = validatePlacement(selectedTypeId, x, y, rotation, undefined, placed);
        if (res.valid) {
          placed.push({ instanceId: generateUUID(), typeId: selectedTypeId, x, y, rotation, paintColor: copyColor, layer });
        } else if (!firstReason) firstReason = res.reason;
        return res.valid;
      };

      if (isDecor) {
        const L = getEffectiveSize(template).w;
        for (const run of runsForMode(m, points)) {
          for (let i = 0; i + L <= run.len; i += L) {
            const horizontal = run.orientation === 'horizontal';
            const tx = horizontal ? run.x + i : run.x - 1;
            const ty = horizontal ? run.y : run.y + i;
            if (placed.some(p => p.x === tx && p.y === ty && (p.rotation === 0) === horizontal)) continue;
            const ok = tryPlace(tx, ty, horizontal ? 0 : 90);
            for (let j = 0; j < L; j++) {
              segs.push(horizontal
                ? { x: run.x + i + j, y: run.y, orientation: 'horizontal', ok }
                : { x: run.x, y: run.y + i + j, orientation: 'vertical', ok });
            }
          }
        }
      } else {
        const eff = getEffectiveSize(template);
        const { w: fw, h: fh } = getFinalSize(eff.w, eff.h, rotationToUse);
        const positions = m === 'brush' ? points : tilePositions(m, points[0], points[points.length - 1], fw, fh);
        const seen = new Set<string>();
        for (const p of positions) {
          if (seen.has(k2(p.x, p.y))) continue;
          seen.add(k2(p.x, p.y));
          const ok = tryPlace(p.x, p.y, rotationToUse);
          boxes.push({ x: p.x, y: p.y, w: fw, h: fh, ok });
        }
      }

      return {
        tone: 'add', cells: [], segs, boxes, changes: placed.length, firstReason,
        apply: (prev) => ({ ...prev, layers: { ...prev.layers, objects: [...prev.layers.objects, ...placed] } }),
      };
    }

    // ---- ластик ----
    if (tool === 'eraser') {
      const area = cellsForMode(m, points, brushSize).filter(inB);
      if (!area.length) return EMPTY;
      const areaKeys = new Set(area.map(c => k2(c.x, c.y)));
      const canTerrain = activeBaseType === 'main' || activeSettlementLayer === 'objects';
      const doObjects = eraserScope === 'all' || eraserScope === 'objects';
      const doFloors = canTerrain && (eraserScope === 'all' || eraserScope === 'floors');
      const doWalls = canTerrain && (eraserScope === 'all' || eraserScope === 'walls');

      const removeIds = new Set<string>();
      let protectedCount = 0;
      if (doObjects) {
        for (const { o, cells } of idx.eraserObjects()) {
          if (!cells.some(c => areaKeys.has(k2(c.x, c.y)))) continue;
          if (o.isDefault) protectedCount++;
          else removeIds.add(o.instanceId);
        }
      }
      const floorAtKey = idx.floorAt();
      const floorKeys = doFloors ? new Set([...areaKeys].filter(k => floorAtKey.has(k))) : new Set<string>();
      // Пол под объектом, который остаётся стоять (защищённый или вне «Что стирать»), не стираем.
      const blockedKeys = new Set<string>();
      if (floorKeys.size) {
        const standing = new Set<string>();
        for (const { o, cells } of idx.eraserObjects()) {
          if (removeIds.has(o.instanceId) || catalogMap[o.typeId]?.constraints.placementType === 'wall') continue;
          for (const c of cells) standing.add(k2(c.x, c.y));
        }
        for (const k of [...floorKeys]) if (standing.has(k)) { floorKeys.delete(k); blockedKeys.add(k); }
      }
      const wallRemoveKeys = new Set<string>();
      if (doWalls) {
        for (const c of area) {
          wallRemoveKeys.add(`h${c.x},${c.y}`); wallRemoveKeys.add(`h${c.x},${c.y + 1}`);
          wallRemoveKeys.add(`v${c.x},${c.y}`); wallRemoveKeys.add(`v${c.x + 1},${c.y}`);
        }
      }
      let wallCount = 0;
      if (wallRemoveKeys.size) {
        const wallAtKey = idx.wallAt();
        for (const k of wallRemoveKeys) if (wallAtKey.has(k)) wallCount++;
      }
      const changes = removeIds.size + floorKeys.size + wallCount;
      return {
        tone: 'remove', cells: area.map(c => ({ ...c, ok: !blockedKeys.has(k2(c.x, c.y)) })), segs: [], boxes: [], changes, protectedCount,
        firstReason: changes === 0
          ? (blockedKeys.size > 0 ? t('cannotRemoveFloorUnderObject') : protectedCount > 0 ? t('defaultBuildingCannotDelete') : undefined)
          : undefined,
        apply: (prev) => {
          const nextObjects = prev.layers.objects.filter(o => !removeIds.has(o.instanceId));
          const nextFloors = floorKeys.size ? prev.layers.floors.filter(f => !floorKeys.has(k2(f.x, f.y))) : prev.layers.floors;
          const nextWalls = wallCount ? prev.layers.walls.filter(w => !wallRemoveKeys.has(segKey(w))) : prev.layers.walls;
          if (!floorKeys.size && !wallCount) return { ...prev, layers: { ...prev.layers, objects: nextObjects } };
          return cascade({ ...prev, layers: { ...prev.layers, objects: nextObjects } }, nextFloors, nextWalls);
        },
      };
    }

    return EMPTY;
  }, [tool, catalogMap, template, isDecor, activeBaseType, activeSettlementLayer, selectedTypeId, currentRotation, buildLevel,
      isDoorPlacement, isWindowPlacement, gridW, gridH, eraserScope, validatePlacement, getCopyColor, t, idx, brushSize]);

  const commit = useCallback((m: BuildMode, points: BuildPoint[]) => {
    const plan = buildPlan(m, points, true);
    if (!plan.apply || plan.changes === 0) {
      if (plan.firstReason) showAlert(plan.firstReason, t(tool === 'eraser' ? 'protectedObject' : 'placementError'), 'info');
      return;
    }
    setMapState(plan.apply, { label: BULK_LABEL[tool], params: { n: plan.changes } });
    if (tool === 'eraser') clearSelection();
    trackEvent('bulk_build', { tool, mode: m, count: plan.changes });
  }, [buildPlan, showAlert, t, tool, setMapState, clearSelection]);

  const { canUndo, canRedo, undo, redo } = history;

  // ---------- жест (нажатие / протяжка / отпускание) ----------

  const g = useRef<{
    anchor: BuildPoint | null; hover: BuildPoint | null; stroke: BuildPoint[];
    pressed: boolean; down: BuildPoint | null; anchoredBefore: boolean;
    // касание, которое станет заливкой/обводкой, только если палец поднят без движения и без второго пальца
    pendingTap: BuildPoint | null;
    // предпросмотр касания уже отдан в React-состояние (до этого жест живёт только в ref)
    shown: boolean;
  }>({ anchor: null, hover: null, stroke: [], pressed: false, down: null, anchoredBefore: false, pendingTap: null, shown: false });
  // Состояние показа живёт во внешнем хранилище: движение курсора/пальца не вызывает setState в хуке
  // и не перерисовывает MainPlannerClient, обновляется только BuildPreviewLayer.
  const [previewStore] = useState(createBuildPreviewStore);

  const sync = useCallback(() => {
    const s = g.current;
    previewStore.setView({ anchor: s.anchor, hover: s.hover, stroke: s.stroke });
  }, [previewStore]);

  const cancel = useCallback(() => {
    g.current = { anchor: null, hover: null, stroke: [], pressed: false, down: null, anchoredBefore: false, pendingTap: null, shown: false };
    previewStore.clear();
  }, [previewStore]);

  const modeRef = useRef(mode);
  const commitRef = useRef(commit);
  useEffect(() => { modeRef.current = mode; commitRef.current = commit; });

  // Смена инструмента, режима, базы или карты сбрасывает незавершённый жест.
  useEffect(() => { cancel(); }, [tool, mode, activeBaseType, activeSettlementLayer, activeMapId, selectedTypeId, cancel]);

  const press = useCallback((p: BuildPoint, button: number) => {
    const m = modeRef.current;
    const s = g.current;
    if (m === 'single') return;
    if (button !== 0) { cancel(); return; }
    s.hover = p; s.pressed = true; s.down = p;
    if (m === 'fill' || m === 'outline') {
      s.pressed = false;
      commitRef.current(m, [p]);
      cancel();
      return;
    }
    if (m === 'brush') s.stroke = [p];
    else { s.anchoredBefore = s.anchor !== null; if (!s.anchor) s.anchor = p; }
    sync();
  }, [cancel, sync]);

  const hoverTo = useCallback((p: BuildPoint) => {
    const s = g.current;
    if (!s.anchor && !s.pressed) return;
    if (s.hover && s.hover.x === p.x && s.hover.y === p.y) return;
    s.hover = p;
    if (modeRef.current === 'brush' && s.pressed && s.stroke.length) {
      // lineCells закрывает «дыры», если курсор быстро перескочил через несколько клеток
      const last = s.stroke[s.stroke.length - 1];
      const have = new Set(s.stroke.map(c => k2(c.x, c.y)));
      s.stroke = [...s.stroke, ...lineCells(last, p).filter(c => !have.has(k2(c.x, c.y)))];
    }
    sync();
  }, [sync]);

  const release = useCallback(() => {
    const s = g.current;
    if (!s.pressed) return;
    s.pressed = false;
    const m = modeRef.current;
    const p = s.hover ?? s.down;
    if (m === 'brush') {
      if (s.stroke.length) commitRef.current(m, s.stroke);
      cancel();
      return;
    }
    if (isRangeMode(m) && p && s.down) {
      if (s.anchoredBefore && s.anchor) { commitRef.current(m, [s.anchor, p]); cancel(); return; }
      if (p.x !== s.down.x || p.y !== s.down.y) { commitRef.current(m, [s.down, p]); cancel(); return; }
      // отпустили в той же точке — ждём вторую точку (удобно на тач-экране)
    }
    sync();
  }, [cancel, sync]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cancel(); };
    // Отпускание мыши. Палец и стилус заканчивают жест через touchEnd, их здесь не ждём.
    const onUp = (e: PointerEvent) => { if (e.pointerType === 'mouse') release(); };
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('pointerup', onUp); window.removeEventListener('keydown', onKey); };
  }, [cancel, release]);

  // Ctrl/Cmd+Z — откат, Ctrl+Y или Ctrl+Shift+Z — вернуть. Берём e.code, чтобы работало и в русской раскладке.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (g.current.pressed) return; // посреди мазка откатывать нечего
      const isUndo = e.code === 'KeyZ' && !e.shiftKey;
      const isRedo = e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey);
      if (isUndo && canUndo) { e.preventDefault(); undo(); }
      else if (isRedo && canRedo) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canUndo, canRedo, undo, redo]);

  // ---------- касания (один палец рисует, второй палец отменяет мазок и превращает жест в щипок) ----------

  const touchStart = useCallback((p: BuildPoint) => {
    const m = modeRef.current;
    if (m === 'single') return;
    const s = g.current;
    if (m === 'fill' || m === 'outline') { s.pendingTap = p; return; }
    // Без setState: касание может оказаться началом щипка, и перерисовывать всё приложение
    // в этот момент нельзя — зум начнётся с рывка. Предпросмотр появится, когда палец сдвинется.
    s.hover = p; s.pressed = true; s.down = p;
    if (m === 'brush') s.stroke = [p];
    else { s.anchoredBefore = s.anchor !== null; if (!s.anchor) s.anchor = p; }
  }, []);

  // Вызывается только после того, как палец ушёл дальше порога касания.
  const touchMove = useCallback((p: BuildPoint) => {
    const s = g.current;
    if (s.pendingTap) { s.pendingTap = null; return; } // залив/обводка — только по касанию
    hoverTo(p);
    if (!s.shown) { s.shown = true; sync(); } // первый показ мазка/линии (hoverTo мог не сработать на той же клетке)
  }, [hoverTo, sync]);

  const touchEnd = useCallback(() => {
    const s = g.current;
    const tap = s.pendingTap;
    if (tap) {
      s.pendingTap = null;
      commitRef.current(modeRef.current, [tap]);
      cancel();
      return;
    }
    release();
  }, [cancel, release]);

  // Второй палец или touchcancel. Мазок и протяжка отменяются, ничего не строится.
  // Если первая точка линии/прямоугольника уже стоит (ждём вторую), она остаётся.
  const touchAbort = useCallback(() => {
    const s = g.current;
    s.pendingTap = null;
    if (!s.pressed) return;
    s.pressed = false;
    if (modeRef.current !== 'brush' && s.anchoredBefore && s.anchor) {
      s.hover = null; s.down = null; s.stroke = [];
      if (s.shown) { s.shown = false; sync(); } // перерисовка нужна, только если предпросмотр уже был показан
      return;
    }
    cancel();
  }, [cancel, sync]);

  // ---------- предпросмотр ----------

  // Считает предпросмотр по состоянию жеста. Вызывается из хранилища (при чтении снимка слоем
  // предпросмотра), а не при рендере MainPlannerClient.
  const planPreview = useCallback((view: BuildViewState): BuildPreview | null => {
    if (!active) return null;
    let points: BuildPoint[] = [];
    if (mode === 'brush') points = view.stroke;
    else if (isRangeMode(mode) && view.anchor) points = [view.anchor, view.hover ?? view.anchor];
    if (!points.length) return null;
    const plan = buildPlan(mode, points);
    const label = sizeLabel(mode, kind, points[0], points[points.length - 1]);
    return { tone: plan.tone, cells: plan.cells, segs: plan.segs, boxes: plan.boxes, label };
  }, [active, mode, kind, buildPlan]);

  // Объявлен после cancel-эффекта: при смене режима сначала сбрасывается жест, затем ставится новый расчёт.
  useEffect(() => { previewStore.setPlanner(planPreview); }, [previewStore, planPreview]);

  return {
    mode, modes, setMode, active, kind, isDecor,
    eraserScope, setEraserScope,
    brushSize, setBrushSize, brushSizeApplies,
    press, hoverTo, cancel,
    touchStart, touchMove, touchEnd, touchAbort,
    previewStore,
    canUndo, canRedo, undo, redo,
  };
}
