import type { Tool, ViewMode } from '@/lib/constants'
import { CELL_SIZE, ISO_H, ISO_W } from '@/lib/constants'
import type { BaseData, BaseType, CatalogItem, ObjectLayer, SelectedElementData, SettlementLayerType } from '@/lib/initial-data'
import React, { memo, useCallback, useEffect, useRef, useState } from 'react'
import type { BuildPoint } from '@/lib/build-modes'
import { TOUCH_SLOP, cellAtClient, vertexAtClient } from '@/lib/build-touch'
import type { BuildPreviewStore } from '@/lib/build-preview-store'
import { getTopVertex } from '@/lib/grid-utils'
import { BuildPreviewLayer, GridVertices } from './BuildOverlay'
import { GridCells } from './GridCells'
import { GridObjects } from './GridObjects'
import { GridWalls } from './GridWalls'
import { SelectionOverlay } from './SelectionOverlay'

// Автопрокрутка карты, пока одним пальцем ведут мазок/линию у края экрана.
const AUTOSCROLL_EDGE = 56; // ширина зоны у края, px
const AUTOSCROLL_MAX = 520; // скорость у самого края, px/с (не зависит от зума)
const AUTOSCROLL_KEEP = 80; // сколько карты всегда остаётся видно, px

type Pt = { clientX: number; clientY: number };

interface CanvasGridProps {
  mapState: BaseData;
  catalogMap: Record<string, CatalogItem>;
  viewMode: ViewMode;
  zoom: number;
  pan: { x: number; y: number };
  isPanning: boolean;
  activeTool: Tool;
  selectedTypeId: string;
  selectedInstanceId: string | null;
  selectedElementData: SelectedElementData | null;
  allCells: { x: number; y: number }[];
  highlightedCells?: Set<string>;
  highlightedWalls?: Set<string>;
  highlightedInstanceIds?: Set<string>;
  setHoveredCell?: (cell: { x: number; y: number } | null) => void;
  wallLines: { x: number; y: number; orientation: 'horizontal' | 'vertical' }[];
  sortedRootObjects: { obj: ObjectLayer; template: CatalogItem }[];

  onMouseDown: (e: React.MouseEvent) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseUp: () => void;
  onMouseLeave: () => void;

  onCellClick: (x: number, y: number) => void;
  onWallClick: (x: number, y: number, orientation: 'horizontal' | 'vertical', e: React.MouseEvent) => void;
  onSelectInstance: (id: string | null) => void;

  onZoomChange?: (newZoom: number) => void;
  onPanChange?: (newPan: { x: number; y: number }) => void;
  activeBaseType: BaseType;
  activeSettlementLayer: SettlementLayerType;

  buildActive?: boolean;
  buildKind?: 'cell' | 'vertex';
  // Предпросмотр лежит во внешнем хранилище: его обновления не перерисовывают CanvasGrid.
  buildStore?: BuildPreviewStore;
  onBuildPress?: (p: BuildPoint, button: number) => void;
  onBuildHover?: (p: BuildPoint) => void;
  // Касания в режимах строительства: один палец рисует, два пальца двигают и масштабируют карту.
  onBuildTouchStart?: (p: BuildPoint) => void;
  onBuildTouchMove?: (p: BuildPoint) => void;
  onBuildTouchEnd?: () => void;
  onBuildTouchAbort?: () => void;
}

export const CanvasGrid = memo(function CanvasGrid({
  mapState,
  catalogMap,
  viewMode,
  zoom,
  pan,
  isPanning,
  activeTool,
  selectedTypeId,
  selectedInstanceId,
  selectedElementData,
  allCells,
  highlightedCells,
  highlightedWalls,
  highlightedInstanceIds,
  setHoveredCell,
  wallLines,
  sortedRootObjects,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onMouseLeave,
  onCellClick,
  onWallClick,
  onSelectInstance,
  onZoomChange,
  onPanChange,
  activeBaseType,
  activeSettlementLayer,
  buildActive = false,
  buildKind = 'cell',
  buildStore,
  onBuildPress,
  onBuildHover,
  onBuildTouchStart,
  onBuildTouchMove,
  onBuildTouchEnd,
  onBuildTouchAbort
}: CanvasGridProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const localTransformRef = useRef({ x: pan.x, y: pan.y, z: zoom });
  const wheelTimeoutRef = useRef<NodeJS.Timeout>(null);
  const lastDispatchedRef = useRef({ x: pan.x, y: pan.y, z: zoom });

  const updateTransform = useCallback((x: number, y: number, currentZoom: number) => {
    if (svgRef.current) {
      const rotate = viewMode === 'topDown45' ? 'rotate(-45deg)' : '';
      svgRef.current.style.transform = `translate(${x}px, ${y}px) scale(${currentZoom}) ${rotate}`;
    }
  }, [viewMode]);

  // willChange управляется императивно, напрямую на DOM-узле, синхронно с реальным
  // началом/концом взаимодействия (drag/pinch/wheel) — а не через React state/props.
  // Так надёжнее: не зависит от цикла рендера (и не "теряется" из-за React.memo),
  // одинаково работает для мыши и тача, и гарантированно выключается по завершении.
  const willChangeActiveRef = useRef(false);
  const willChangeOffTimeoutRef = useRef<NodeJS.Timeout>(null);

  const setSvgWillChange = useCallback((active: boolean) => {
    if (willChangeOffTimeoutRef.current) {
      clearTimeout(willChangeOffTimeoutRef.current);
      willChangeOffTimeoutRef.current = null;
    }

    if (active) {
      if (!willChangeActiveRef.current) {
        willChangeActiveRef.current = true;
        if (svgRef.current) svgRef.current.style.willChange = 'transform';
      }
      return;
    }

    // Небольшая задержка перед выключением: даёт браузеру доотрисовать последний
    // кадр перехода на GPU-слое и не дёргает layer promotion при быстрых повторных жестах.
    willChangeOffTimeoutRef.current = setTimeout(() => {
      willChangeActiveRef.current = false;
      if (svgRef.current) svgRef.current.style.willChange = 'auto';
      willChangeOffTimeoutRef.current = null;
    }, 200);
  }, []);

  useEffect(() => {
    const { x, y, z } = localTransformRef.current;
    updateTransform(x, y, z);
  }, [viewMode, updateTransform]);

  useEffect(() => {
    return () => {
      if (willChangeOffTimeoutRef.current) clearTimeout(willChangeOffTimeoutRef.current);
      if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const isExternallyForced =
      pan.x !== lastDispatchedRef.current.x ||
      pan.y !== lastDispatchedRef.current.y ||
      zoom !== lastDispatchedRef.current.z;

    if (isExternallyForced) {
      localTransformRef.current = { x: pan.x, y: pan.y, z: zoom };
      lastDispatchedRef.current = { x: pan.x, y: pan.y, z: zoom };
      updateTransform(pan.x, pan.y, zoom);
    }
  }, [pan, zoom, updateTransform]);

  const { width: GRID_W, height: GRID_H } = mapState.mapConfig;

  const svgWidth = viewMode === 'isometric'
    ? (GRID_W + GRID_H) * (ISO_W / 2) + ISO_W * 2
    : GRID_W * CELL_SIZE + CELL_SIZE * 3;

  const svgHeight = viewMode === 'isometric'
    ? (GRID_W + GRID_H) * (ISO_H / 2) + ISO_H * 3
    : GRID_H * CELL_SIZE + CELL_SIZE * 3;

  // Во flex-контейнере браузер может сжать сам блок <svg> (на телефоне это обычное дело), и содержимое вписывается
  // в него с масштабом < 1. Реальный масштаб на экране = zoom × fit; от него зависит размер подписей и маркеров.
  const [fit, setFit] = useState(1);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const cs = getComputedStyle(svg);
      const w = parseFloat(cs.width), h = parseFloat(cs.height);
      if (!w || !h) return;
      const f = Math.min(w / svgWidth, h / svgHeight);
      setFit(prev => (Math.abs(prev - f) < 0.001 ? prev : f));
    };
    const ro = new ResizeObserver(measure); // первый вызов приходит сразу после observe
    ro.observe(svg);
    return () => ro.disconnect();
  }, [svgWidth, svgHeight]);
  const uiScale = Math.max(zoom * fit, 0.05);

  const selectedTemplate = catalogMap[selectedTypeId];
  const wasDraggingRef = useRef(false);

  // Режим строительства для клеток отдаём через ref, а колбэки делаем стабильными: тогда смена режима
  // («по одному» ↔ «кисть») не перерисовывает GridCells и GridWalls (это ~70 мс в профиле).
  const buildRef = useRef({ active: buildActive, kind: buildKind });
  useEffect(() => { buildRef.current = { active: buildActive, kind: buildKind }; }, [buildActive, buildKind]);
  const handleSelectFloor = useCallback((x: number, y: number) => onSelectInstance(`floor_${x}_${y}`), [onSelectInstance]);
  const handleClearSelection = useCallback(() => onSelectInstance(null), [onSelectInstance]);
  const handleHoverCell = useCallback((x: number, y: number) => { if (setHoveredCell) setHoveredCell({ x, y }); }, [setHoveredCell]);

  const isWallDecorTool = activeTool === 'object' && selectedTemplate?.constraints.placementType === 'wall';

  const handleLocalWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    setSvgWillChange(true);
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const mouseX = e.clientX - (rect.left + rect.width / 2);
    const mouseY = e.clientY - (rect.top + rect.height / 2);

    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const currentZ = localTransformRef.current.z;
    const nextZ = Math.min(5, Math.max(0.3, +(currentZ + delta).toFixed(2)));
    if (nextZ === currentZ) return;

    const zoomFactor = nextZ / currentZ;
    const currentX = localTransformRef.current.x;
    const currentY = localTransformRef.current.y;

    const nextX = mouseX - (mouseX - currentX) * zoomFactor;
    const nextY = mouseY - (mouseY - currentY) * zoomFactor;

    localTransformRef.current = { x: nextX, y: nextY, z: nextZ };
    updateTransform(nextX, nextY, nextZ);

    if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
    wheelTimeoutRef.current = setTimeout(() => {
      lastDispatchedRef.current = { x: nextX, y: nextY, z: nextZ };
      if (onZoomChange) onZoomChange(nextZ);
      if (onPanChange) onPanChange({ x: nextX, y: nextY });
      setSvgWillChange(false);
    }, 100);
    window.dispatchEvent(new CustomEvent('internal-zoom', { detail: { newZoom: nextZ } }));
  }, [updateTransform, onZoomChange, onPanChange, setSvgWillChange]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    node.addEventListener('wheel', handleLocalWheel, { passive: false });
    return () => {
      node.removeEventListener('wheel', handleLocalWheel);
    };
  }, [handleLocalWheel]);

  useEffect(() => {
    const handleExternalZoom = (e: Event) => {
      const customEvent = e as CustomEvent;
      const nextZ = customEvent.detail.newZoom;
      const currentZ = localTransformRef.current.z;
      if (nextZ === currentZ) return;

      setSvgWillChange(true);
      const zoomFactor = nextZ / currentZ;
      const nextX = localTransformRef.current.x * zoomFactor;
      const nextY = localTransformRef.current.y * zoomFactor;

      localTransformRef.current = { x: nextX, y: nextY, z: nextZ };
      updateTransform(nextX, nextY, nextZ);

      if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
      wheelTimeoutRef.current = setTimeout(() => {
        lastDispatchedRef.current = { x: nextX, y: nextY, z: nextZ };
        if (onZoomChange) onZoomChange(nextZ);
        if (onPanChange) onPanChange({ x: nextX, y: nextY });
        setSvgWillChange(false);
      }, 100);
      window.dispatchEvent(new CustomEvent('internal-zoom', { detail: { newZoom: nextZ } }));
    };

    window.addEventListener('external-zoom', handleExternalZoom);
    return () => window.removeEventListener('external-zoom', handleExternalZoom);
  }, [updateTransform, onZoomChange, onPanChange, setSvgWillChange]);

  const autoScrollRef = useRef<{ raf: number | null; last: number; x: number; y: number; armed: boolean; moved: boolean }>({
    raf: null, last: 0, x: 0, y: 0, armed: false, moved: false
  });

  // Останавливает автопрокрутку. dispatchPan — отдать итоговое смещение наружу (если карту реально двигали).
  const stopAutoScroll = useCallback((dispatchPan: boolean) => {
    const a = autoScrollRef.current;
    if (a.raf !== null) { cancelAnimationFrame(a.raf); a.raf = null; }
    if (dispatchPan && a.moved) {
      const lt = localTransformRef.current;
      lastDispatchedRef.current = { x: lt.x, y: lt.y, z: lt.z };
      onPanChange?.({ x: lt.x, y: lt.y });
    }
    a.moved = false;
    a.armed = false;
  }, [onPanChange]);

  useEffect(() => () => {
    const a = autoScrollRef.current;
    if (a.raf !== null) cancelAnimationFrame(a.raf);
  }, []);

  const touchStateRef = useRef<{
    mode: 'none' | 'pan' | 'pinch' | 'draw';
    initialDist: number;
    initialZoom: number;
    initialPan: { x: number; y: number };
    startTouchPos: { x: number; y: number };
    isDrag: boolean;
    currentPan?: { x: number; y: number };
    currentZoom?: number;
  }>({
    mode: 'none',
    initialDist: 0,
    initialZoom: zoom,
    initialPan: pan,
    startTouchPos: { x: 0, y: 0 },
    isDrag: false
  });

  const mouseStateRef = useRef<{
    isDown: boolean;
    isDragging: boolean;
    startX: number;
    startY: number;
    initialPan: { x: number; y: number };
    currentPan?: { x: number; y: number };
  }>({
    isDown: false,
    isDragging: false,
    startX: 0,
    startY: 0,
    initialPan: pan
  });

  // Активные касания (палец/стилус в контакте с экраном) по pointerId. Мышь сюда не попадает.
  // Заменяет e.touches из touch-событий: щипок считается по первым двум записям.
  const touchPointersRef = useRef(new Map<number, Pt>());
  const touchList = () => Array.from(touchPointersRef.current.values());
  // Предыдущее состояние кнопок мыши: нужно, чтобы заметить правую/среднюю кнопку, нажатую при зажатой левой
  // (pointerdown на вторую кнопку не приходит, меняется только e.buttons в pointermove).
  const mouseButtonsRef = useRef(0);
  // После жеста рисования пальцем браузер всё равно досоздаёт click: его надо проглотить, иначе касание обработается дважды.
  const suppressClickRef = useRef(false);

  // Клетка (или ближайшая вершина сетки) под пальцем или курсором — считаем по текущему transform, без DOM-событий.
  const pointAtTouch = useCallback((touch: Pt): BuildPoint | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    // Центр и размер блока берём у самого <svg>, а не выводим из pan/зума: во flex-контейнере браузер
    // может сжать svg по ширине, и расчёт «по допущению» уезжает от того, что видно на экране.
    const box = svg.getBoundingClientRect();
    const cs = getComputedStyle(svg);
    const vp = {
      cx: box.left + box.width / 2, cy: box.top + box.height / 2,
      zoom: localTransformRef.current.z, svgW: svgWidth, svgH: svgHeight,
      layoutW: parseFloat(cs.width) || svgWidth, layoutH: parseFloat(cs.height) || svgHeight,
    };
    return buildKind === 'vertex'
      ? vertexAtClient(touch.clientX, touch.clientY, vp, viewMode, GRID_W, GRID_H)
      : cellAtClient(touch.clientX, touch.clientY, vp, viewMode, GRID_W, GRID_H);
  }, [buildKind, viewMode, svgWidth, svgHeight, GRID_W, GRID_H]);

  // Куда и насколько быстро ехать карте, если палец в зоне у края: -1..1 по каждой оси (0 — не в зоне).
  // Палец у левого края двигает карту вправо (открывается то, что левее), и наоборот.
  // Видимая область карты. Сам контейнер высотой равен svg (он в flex-строке с items-center, не растягивается),
  // поэтому его границы уходят далеко за экран; берём пересечение с родителем (он обрезает) и с окном.
  const visibleRect = useCallback(() => {
    const node = containerRef.current;
    if (!node) return null;
    const c = node.getBoundingClientRect();
    const pr = node.parentElement?.getBoundingClientRect();
    const vv = window.visualViewport;
    const vw = vv?.width ?? window.innerWidth;
    const vh = vv?.height ?? window.innerHeight;
    return {
      left: Math.max(c.left, pr?.left ?? 0, 0),
      top: Math.max(c.top, pr?.top ?? 0, 0),
      right: Math.min(c.right, pr?.right ?? vw, vw),
      bottom: Math.min(c.bottom, pr?.bottom ?? vh, vh)
    };
  }, []);

  const edgeVelocity = useCallback((x: number, y: number) => {
    const r = visibleRect();
    if (!r) return { vx: 0, vy: 0 };
    const f = (d: number) => { const k = Math.min(1, Math.max(0, (AUTOSCROLL_EDGE - d) / AUTOSCROLL_EDGE)); return k * k; };
    return { vx: f(x - r.left) - f(r.right - x), vy: f(y - r.top) - f(r.bottom - y) };
  }, [visibleRect]);

  const autoScrollTickRef = useRef<(now: number) => void>(() => {});
  useEffect(() => {
    autoScrollTickRef.current = (now: number) => {
      const a = autoScrollRef.current;
      const svg = svgRef.current;
      const cr = visibleRect();
      if (!svg || !cr) { a.raf = null; return; }
      const dt = Math.min(0.05, Math.max(0, (now - a.last) / 1000));
      a.last = now;
      const { vx, vy } = edgeVelocity(a.x, a.y);
      if (vx === 0 && vy === 0) { a.raf = null; return; } // палец ушёл из зоны

      let dx = vx * AUTOSCROLL_MAX * dt;
      let dy = vy * AUTOSCROLL_MAX * dt;
      // Карту нельзя утащить целиком: по каждой оси остаётся видна полоса AUTOSCROLL_KEEP.
      const box = svg.getBoundingClientRect();
      if (dx > 0) dx = Math.max(0, Math.min(dx, cr.right - AUTOSCROLL_KEEP - box.left));
      if (dx < 0) dx = Math.min(0, Math.max(dx, cr.left + AUTOSCROLL_KEEP - box.right));
      if (dy > 0) dy = Math.max(0, Math.min(dy, cr.bottom - AUTOSCROLL_KEEP - box.top));
      if (dy < 0) dy = Math.min(0, Math.max(dy, cr.top + AUTOSCROLL_KEEP - box.bottom));

      if (dx !== 0 || dy !== 0) {
        const lt = localTransformRef.current;
        const nx = lt.x + dx;
        const ny = lt.y + dy;
        localTransformRef.current = { x: nx, y: ny, z: lt.z };
        updateTransform(nx, ny, lt.z);
        a.moved = true;
        const st = touchStateRef.current;
        st.currentPan = { x: nx, y: ny };
        st.currentZoom = lt.z;
        // карта поехала под неподвижным пальцем — клетка под ним сменилась
        const p = pointAtTouch({ clientX: a.x, clientY: a.y });
        if (p) onBuildTouchMove?.(p);
      }
      a.raf = requestAnimationFrame(autoScrollTickRef.current);
    };
  });

  // Кольцо на ближайшей к курсору вершине (режимы «линия/контур» у стен): видно, какая точка будет выбрана.
  // Двигается напрямую в DOM, без setState, чтобы не перерисовывать карту на каждое движение мыши.
  const hoverMarkerRef = useRef<SVGCircleElement>(null);
  const updateHoverMarker = useCallback((p: BuildPoint | null) => {
    const el = hoverMarkerRef.current;
    if (!el) return;
    if (!p) { el.style.visibility = 'hidden'; return; }
    const v = getTopVertex(p.x, p.y, viewMode, GRID_W);
    el.setAttribute('cx', String(v.sx));
    el.setAttribute('cy', String(v.sy));
    el.style.visibility = 'visible';
  }, [viewMode, GRID_W]);

  const handleLocalMouseDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    mouseButtonsRef.current = e.buttons;
    const canPan = activeTool === 'hand' || e.button === 1 || e.button === 2 || isPanning;

    // Стены/декор по вершинам: точка — ближайшая к курсору, наводить прямо на неё не нужно.
    // Левая кнопка рисует, средняя/правая отменяют незавершённый жест (и двигают карту, как обычно).
    if (buildActive && buildKind === 'vertex' && onBuildPress && activeTool !== 'hand') {
      const p = pointAtTouch(e);
      if (p) onBuildPress(p, e.button);
      if (e.button === 0) return;
    }

    mouseStateRef.current = {
      isDown: canPan,
      isDragging: false,
      startX: e.clientX,
      startY: e.clientY,
      initialPan: { x: localTransformRef.current.x, y: localTransformRef.current.y }
    };

    if (onMouseDown) onMouseDown(e);
  }, [activeTool, isPanning, onMouseDown, buildActive, buildKind, onBuildPress, pointAtTouch]);

  // Наведение без нажатия (мышь, стилус в воздухе): кольцо на ближайшей вершине и точка для предпросмотра.
  const hoverAt = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (buildActive && buildKind === 'vertex') {
      const p = pointAtTouch(e);
      if (p) {
        updateHoverMarker(p);
        onBuildHover?.(p);
      }
    }
  }, [buildActive, buildKind, pointAtTouch, updateHoverMarker, onBuildHover]);

  const handleLocalMouseMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const state = mouseStateRef.current;

    // Правая/средняя кнопка поверх зажатой левой отменяет незавершённый жест (как раньше отменял второй mousedown).
    const added = e.buttons & ~mouseButtonsRef.current;
    mouseButtonsRef.current = e.buttons;
    if ((added & 6) && buildActive && activeTool !== 'hand' && onBuildPress) {
      onBuildPress(pointAtTouch(e) ?? { x: 0, y: 0 }, 2);
    }

    if (state.isDown) {
      const dx = e.clientX - state.startX;
      const dy = e.clientY - state.startY;

      if (!state.isDragging && Math.hypot(dx, dy) > 4) {
        state.isDragging = true;
      }

      if (state.isDragging) {
        if (!willChangeActiveRef.current) setSvgWillChange(true);

        const newPanX = state.initialPan.x + dx;
        const newPanY = state.initialPan.y + dy;

        state.currentPan = { x: newPanX, y: newPanY };
        localTransformRef.current = { ...localTransformRef.current, x: newPanX, y: newPanY };

        updateTransform(newPanX, newPanY, localTransformRef.current.z);
        return;
      }
    }

    hoverAt(e);

    if (onMouseMove) onMouseMove(e);
  }, [updateTransform, onMouseMove, setSvgWillChange, buildActive, activeTool, onBuildPress, pointAtTouch, hoverAt]);

  // Единая точка завершения взаимодействия: используется и обычным pointerup/pointerleave
  // на канве, и window-level safety-net'ом ниже (на случай, если кнопку мыши
  // отпустили за пределами канвы и обычный onPointerUp на div не сработал).
  const forceStopInteraction = useCallback(() => {
    const mState = mouseStateRef.current;
    if (mState.isDown) {
      if (mState.isDragging) {
        wasDraggingRef.current = true;
        setTimeout(() => { wasDraggingRef.current = false; }, 200);
        if (mState.currentPan && onPanChange) {
          lastDispatchedRef.current = { ...lastDispatchedRef.current, x: mState.currentPan.x, y: mState.currentPan.y };
          onPanChange(mState.currentPan);
        }
      }

      mState.isDown = false;
      mState.isDragging = false;
      mState.currentPan = undefined;

      if (onMouseUp) onMouseUp();
    }

    const tState = touchStateRef.current;
    if (tState.mode === 'draw') {
      stopAutoScroll(false); // смещение карты уйдёт наружу блоком ниже (currentPan)
      onBuildTouchAbort?.(); // касание оборвалось (blur, уход вкладки): ничего не строим
    }
    if (tState.mode !== 'none') {
      if (tState.isDrag) {
        wasDraggingRef.current = true;
        setTimeout(() => { wasDraggingRef.current = false; }, 200);
      }
      if (tState.currentPan && onPanChange) {
        lastDispatchedRef.current = { ...lastDispatchedRef.current, x: tState.currentPan.x, y: tState.currentPan.y };
        onPanChange(tState.currentPan);
      }
      if (tState.currentZoom && onZoomChange) {
        lastDispatchedRef.current.z = tState.currentZoom;
        onZoomChange(tState.currentZoom);
      }

      tState.mode = 'none';
      tState.isDrag = false;
      tState.currentPan = undefined;
      tState.currentZoom = undefined;
    }

    setSvgWillChange(false);
  }, [onPanChange, onZoomChange, onMouseUp, setSvgWillChange, onBuildTouchAbort, stopAutoScroll]);

  const handleLocalMouseUp = useCallback(() => {
    forceStopInteraction();
  }, [forceStopInteraction]);

  // Safety-net: если кнопку мыши отпустили (или палец подняли) за пределами канвы,
  // либо окно/вкладка потеряли фокус во время драга — pointerup на самом div
  // не сработает, и локальное состояние (а с ним и willChange) зависнет навсегда.
  // Слушаем это на уровне window/document и принудительно завершаем взаимодействие.
  useEffect(() => {
    const handleWindowPointerUp = (e: PointerEvent) => {
      touchPointersRef.current.delete(e.pointerId);
      forceStopInteraction();
    };
    // Окно потеряло фокус: отпускания мы уже не увидим, забываем и касания тоже.
    const handleWindowBlur = () => { touchPointersRef.current.clear(); forceStopInteraction(); };
    const handleVisibilityChange = () => {
      if (document.hidden) { touchPointersRef.current.clear(); forceStopInteraction(); }
    };

    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', handleWindowPointerUp);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('pointercancel', handleWindowPointerUp);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [forceStopInteraction]);

  const handleLocalMouseLeave = useCallback(() => {
    // Курсор ушёл с канвы, но кнопка ещё может быть зажата (drag продолжится за её пределами) —
    // не завершаем взаимодействие здесь, это сделает window-level 'mouseup'/'pointerup'
    // (либо обычный onPointerUp на div, если курсор вернётся и отпустится внутри).
    updateHoverMarker(null);
    if (onMouseLeave) onMouseLeave();
  }, [onMouseLeave, updateHoverMarker]);

  const getTouchDist = (t1: Pt, t2: Pt) => {
    return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
  };

  const handleTouchStart = useCallback((e: React.PointerEvent<HTMLDivElement>, touches: Pt[]) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // Второй палец во время мазка: отменяем незавершённый жест, дальше это щипок/перемещение.
    if (touches.length >= 2 && touchStateRef.current.mode === 'draw') {
      stopAutoScroll(true); // если карта уже ехала — зафиксировать её положение до начала щипка
      onBuildTouchAbort?.();
    }

    if (touches.length === 1 && buildActive && onBuildTouchStart) {
      const touch = touches[0];
      touchStateRef.current = {
        mode: 'draw',
        initialDist: 0,
        initialZoom: localTransformRef.current.z,
        initialPan: { x: localTransformRef.current.x, y: localTransformRef.current.y },
        startTouchPos: { x: touch.clientX, y: touch.clientY },
        isDrag: false
      };
      const a = autoScrollRef.current;
      const v = edgeVelocity(touch.clientX, touch.clientY);
      a.x = touch.clientX; a.y = touch.clientY; a.moved = false;
      a.armed = v.vx === 0 && v.vy === 0; // мазок, начатый у самого края, сам карту не двигает
      // Отмена pointerdown гасит эмулированные mousedown/mouseup: касание не должно обработаться ещё и как мышь.
      if (e.cancelable) e.preventDefault();
      const p = pointAtTouch(touch);
      if (p) onBuildTouchStart(p);
    } else if (touches.length === 1) {
      const touch = touches[0];
      touchStateRef.current = {
        mode: 'pan',
        initialDist: 0,
        initialZoom: localTransformRef.current.z,
        initialPan: { x: localTransformRef.current.x, y: localTransformRef.current.y },
        startTouchPos: { x: touch.clientX, y: touch.clientY },
        isDrag: false
      };
    } else if (touches.length === 2) {
      // Слой под transform готовим сразу при втором пальце, а не на первом движении щипка:
      // иначе промоушн слоя случается посреди жеста и даёт рывок в начале зума.
      setSvgWillChange(true);
      const dist = getTouchDist(touches[0], touches[1]);

      const startFocalX = ((touches[0].clientX + touches[1].clientX) / 2) - centerX;
      const startFocalY = ((touches[0].clientY + touches[1].clientY) / 2) - centerY;

      touchStateRef.current = {
        mode: 'pinch',
        initialDist: dist,
        initialZoom: localTransformRef.current.z,
        initialPan: { x: localTransformRef.current.x, y: localTransformRef.current.y },
        startTouchPos: { x: startFocalX, y: startFocalY },
        isDrag: true
      };
    }
  }, [buildActive, onBuildTouchStart, onBuildTouchAbort, pointAtTouch, setSvgWillChange, edgeVelocity, stopAutoScroll]);

  const handleTouchMove = useCallback((e: React.PointerEvent<HTMLDivElement>, touches: Pt[]) => {
    const state = touchStateRef.current;

    if (state.mode === 'draw') {
      if (touches.length !== 1) return;
      const touch = touches[0];
      // Пока палец не ушёл дальше порога — это касание: дрожание пальца не добавляет клеток и не фиксирует линию.
      if (!state.isDrag && Math.hypot(touch.clientX - state.startTouchPos.x, touch.clientY - state.startTouchPos.y) > TOUCH_SLOP) {
        state.isDrag = true;
      }
      const a = autoScrollRef.current;
      a.x = touch.clientX; a.y = touch.clientY;
      const v = edgeVelocity(touch.clientX, touch.clientY);
      const inZone = v.vx !== 0 || v.vy !== 0;
      if (!inZone) a.armed = true;
      if (state.isDrag) {
        const p = pointAtTouch(touch);
        if (p) onBuildTouchMove?.(p);
        if (inZone && a.armed && a.raf === null) {
          setSvgWillChange(true);
          a.last = performance.now();
          a.raf = requestAnimationFrame(autoScrollTickRef.current);
        }
      }
      return;
    }

    if (touches.length === 1 && state.mode === 'pan') {
      const touch = touches[0];
      const dx = touch.clientX - state.startTouchPos.x;
      const dy = touch.clientY - state.startTouchPos.y;

      if (!state.isDrag && Math.hypot(dx, dy) > 5) {
        state.isDrag = true;
      }

      if (state.isDrag) {
        if (!willChangeActiveRef.current) setSvgWillChange(true);

        const newPanX = state.initialPan.x + dx;
        const newPanY = state.initialPan.y + dy;
        const targetZoom = state.initialZoom;

        state.currentPan = { x: newPanX, y: newPanY };
        state.currentZoom = targetZoom;
        localTransformRef.current = { x: newPanX, y: newPanY, z: targetZoom };

        updateTransform(newPanX, newPanY, targetZoom);
      }

    } else if (touches.length === 2 && state.mode === 'pinch') {
      const currentDist = getTouchDist(touches[0], touches[1]);
      if (state.initialDist > 0) {
        state.isDrag = true;
        if (!willChangeActiveRef.current) setSvgWillChange(true);

        const rect = e.currentTarget.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const scale = currentDist / state.initialDist;
        const targetZoom = Math.min(Math.max(0.3, state.initialZoom * scale), 5.0);

        const currFocalX = ((touches[0].clientX + touches[1].clientX) / 2) - centerX;
        const currFocalY = ((touches[0].clientY + touches[1].clientY) / 2) - centerY;

        const zoomRatio = targetZoom / state.initialZoom;

        const newPanX = currFocalX - (state.startTouchPos.x - state.initialPan.x) * zoomRatio;
        const newPanY = currFocalY - (state.startTouchPos.y - state.initialPan.y) * zoomRatio;

        state.currentPan = { x: newPanX, y: newPanY };
        state.currentZoom = targetZoom;
        localTransformRef.current = { x: newPanX, y: newPanY, z: targetZoom };

        updateTransform(newPanX, newPanY, targetZoom);
      }
    }
  }, [updateTransform, setSvgWillChange, pointAtTouch, onBuildTouchMove, edgeVelocity]);

  const handleTouchEnd = useCallback(() => {
    const state = touchStateRef.current;
    if (state.mode === 'draw') {
      // click после касания preventDefault на pointerup не отменить: глотаем его в onClickCapture у svg.
      suppressClickRef.current = true;
      setTimeout(() => { suppressClickRef.current = false; }, 400);
      state.mode = 'none';
      state.isDrag = false;
      onBuildTouchEnd?.();
      stopAutoScroll(true); // отдаём наружу, куда уехала карта; forceStopInteraction ниже уже не увидит draw-режим
    }
    forceStopInteraction();
  }, [forceStopInteraction, onBuildTouchEnd, stopAutoScroll]);

  const handleTouchCancel = useCallback(() => {
    forceStopInteraction(); // из draw-режима сам вызовет onBuildTouchAbort
  }, [forceStopInteraction]);

  // Одна ветка на все указатели. Мышь идёт старым путём (кнопки, наведение, перетаскивание карты),
  // палец и стилус в контакте — путём касаний (рисование, панорама, щипок).
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') { handleLocalMouseDown(e); return; }
    touchPointersRef.current.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
    handleTouchStart(e, touchList());
  }, [handleLocalMouseDown, handleTouchStart]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') { handleLocalMouseMove(e); return; }
    const known = touchPointersRef.current;
    if (!known.has(e.pointerId)) { hoverAt(e); return; } // стилус парит над экраном
    known.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
    handleTouchMove(e, touchList());
  }, [handleLocalMouseMove, handleTouchMove, hoverAt]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') { handleLocalMouseUp(); return; }
    touchPointersRef.current.delete(e.pointerId);
    handleTouchEnd();
  }, [handleLocalMouseUp, handleTouchEnd]);

  const handlePointerCancel = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') touchPointersRef.current.delete(e.pointerId);
    handleTouchCancel();
  }, [handleTouchCancel]);

  const handlePointerLeave = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') return; // у пальца pointerleave приходит сразу после отпускания
    handleLocalMouseLeave();
  }, [handleLocalMouseLeave]);

  return (
    <div
      ref={containerRef}
      className="flex-1 bg-neutral-950 overflow-hidden relative flex items-center justify-center z-0 touch-none select-none"
      style={{ cursor: isPanning || mouseStateRef.current.isDragging ? 'grabbing' : (activeTool === 'hand' ? 'grab' : (buildActive ? 'crosshair' : 'default')) }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={handlePointerLeave}
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg
        ref={svgRef}
        data-build-active={buildActive ? 'true' : undefined}
        width={svgWidth}
        height={svgHeight}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="select-none max-w-none touch-none"
        style={{
          transformOrigin: 'center center',
          willChange: 'auto',
          pointerEvents: 'auto'
        }}
        onClickCapture={(e) => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            e.stopPropagation();
            e.preventDefault();
            return;
          }
          if (wasDraggingRef.current) {
            e.stopPropagation();
            e.preventDefault();
            wasDraggingRef.current = false;
          }
        }}
        onClick={() => { if (activeTool === 'hand' && !mouseStateRef.current.isDragging) onSelectInstance(null); }}
      >
        <GridCells
          allCells={allCells}
          gridW={GRID_W}
          gridH={GRID_H}
          viewMode={viewMode}
          activeTool={activeTool}
          mapState={mapState}
          activeBaseType={activeBaseType}
          activeSettlementLayer={activeSettlementLayer}
          highlightedCells={highlightedCells}
          onCellClick={onCellClick}
          onSelectFloor={handleSelectFloor}
          onClearSelection={handleClearSelection}
          onHoverCell={handleHoverCell}
          buildRef={buildRef}
          onBuildPress={onBuildPress}
          onBuildHover={onBuildHover}
        />

        <GridObjects
          sortedRootObjects={sortedRootObjects}
          objects={mapState.layers.objects}
          viewMode={viewMode}
          gridW={GRID_W}
          activeTool={activeTool}
          activeBaseType={activeBaseType}
          activeSettlementLayer={activeSettlementLayer}
          highlightedInstanceIds={highlightedInstanceIds}
          onSelectObject={onSelectInstance}
        />

        <GridWalls
          wallLines={wallLines}
          walls={mapState.layers.walls}
          viewMode={viewMode}
          gridW={GRID_W}
          activeTool={activeTool}
          isWallDecorTool={isWallDecorTool}
          activeBaseType={activeBaseType}
          activeSettlementLayer={activeSettlementLayer}
          highlightedWalls={highlightedWalls}
          onWallClick={onWallClick}
          onSelectWall={onSelectInstance}
          onClearSelection={handleClearSelection}
        />

        {buildActive && buildKind === 'vertex' && onBuildPress && onBuildHover && (
          <GridVertices gridW={GRID_W} gridH={GRID_H} viewMode={viewMode} />
        )}

        {buildStore && <BuildPreviewLayer store={buildStore} kind={buildKind} viewMode={viewMode} gridW={GRID_W} scale={uiScale} />}

        {buildActive && buildKind === 'vertex' && (
          <circle
            ref={hoverMarkerRef}
            r={9 / uiScale}
            fill="none"
            stroke="#facc15"
            strokeWidth={2 / uiScale}
            style={{ pointerEvents: 'none', visibility: 'hidden' }}
          />
        )}

        <SelectionOverlay
          selectedInstanceId={selectedInstanceId}
          selectedElementData={selectedElementData}
          mapState={mapState}
          catalogMap={catalogMap}
          viewMode={viewMode}
          gridW={GRID_W}
        />
      </svg>
    </div>
  );
}, (prevProps, nextProps) => {
  const mapDataEqual =
    prevProps.mapState === nextProps.mapState &&
    prevProps.mapState.layers === nextProps.mapState.layers &&
    prevProps.mapState.mapConfig === nextProps.mapState.mapConfig;

  return (
    mapDataEqual &&
    prevProps.catalogMap === nextProps.catalogMap &&
    prevProps.viewMode === nextProps.viewMode &&
    prevProps.zoom === nextProps.zoom &&
    prevProps.pan === nextProps.pan &&
    prevProps.activeTool === nextProps.activeTool &&
    prevProps.selectedTypeId === nextProps.selectedTypeId &&
    prevProps.selectedInstanceId === nextProps.selectedInstanceId &&
    prevProps.selectedElementData === nextProps.selectedElementData &&
    prevProps.allCells === nextProps.allCells &&
    prevProps.highlightedCells === nextProps.highlightedCells &&
    prevProps.highlightedWalls === nextProps.highlightedWalls &&
    prevProps.highlightedInstanceIds === nextProps.highlightedInstanceIds &&
    prevProps.wallLines === nextProps.wallLines &&
    prevProps.sortedRootObjects === nextProps.sortedRootObjects &&
    prevProps.activeBaseType === nextProps.activeBaseType &&
    prevProps.activeSettlementLayer === nextProps.activeSettlementLayer &&
    prevProps.buildActive === nextProps.buildActive &&
    prevProps.buildKind === nextProps.buildKind &&
    prevProps.buildStore === nextProps.buildStore &&
    prevProps.onBuildPress === nextProps.onBuildPress &&
    prevProps.onBuildHover === nextProps.onBuildHover &&
    prevProps.onBuildTouchStart === nextProps.onBuildTouchStart &&
    prevProps.onBuildTouchMove === nextProps.onBuildTouchMove &&
    prevProps.onBuildTouchEnd === nextProps.onBuildTouchEnd &&
    prevProps.onBuildTouchAbort === nextProps.onBuildTouchAbort
  );
});