import React, { memo, useCallback, useEffect, useRef } from 'react'
import type { Tool, ViewMode } from '../lib/constants'
import { CELL_SIZE, ISO_H, ISO_W } from '../lib/constants'
import type { BaseData, BaseType, CatalogItem, ObjectLayer, SelectedElementData, SettlementLayerType } from '../lib/initial-data'
import { GridCells } from './GridCells'
import { GridObjects } from './GridObjects'
import { GridWalls } from './GridWalls'
import { SelectionOverlay } from './SelectionOverlay'

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
  activeSettlementLayer
}: CanvasGridProps) {
  const svgRef = useRef<SVGSVGElement>(null);

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
    ? (GRID_W + GRID_H) * (ISO_W / 2) + ISO_W
    : GRID_W * CELL_SIZE + CELL_SIZE * 2;

  const svgHeight = viewMode === 'isometric'
    ? (GRID_W + GRID_H) * (ISO_H / 2) + ISO_H * 2
    : GRID_H * CELL_SIZE + CELL_SIZE * 2;

  const selectedTemplate = catalogMap[selectedTypeId];
  const wasDraggingRef = useRef(false);

  const isWallDecorTool = activeTool === 'object' && selectedTemplate?.constraints.placementType === 'wall';

  const handleLocalWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    setSvgWillChange(true);
    const rect = e.currentTarget.getBoundingClientRect();
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

  const touchStateRef = useRef<{
    mode: 'none' | 'pan' | 'pinch';
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

  const handleLocalMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const canPan = activeTool === 'hand' || e.button === 1 || e.button === 2 || isPanning;

    mouseStateRef.current = {
      isDown: canPan,
      isDragging: false,
      startX: e.clientX,
      startY: e.clientY,
      initialPan: { x: localTransformRef.current.x, y: localTransformRef.current.y }
    };

    if (onMouseDown) onMouseDown(e);
  }, [activeTool, isPanning, onMouseDown]);

  const handleLocalMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const state = mouseStateRef.current;

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

    if (onMouseMove) onMouseMove(e);
  }, [updateTransform, onMouseMove, setSvgWillChange]);

  // Единая точка завершения взаимодействия: используется и обычным mouseup/mouseleave/
  // touchend на канве, и window-level safety-net'ом ниже (на случай, если кнопку мыши
  // отпустили за пределами канвы и обычный onMouseUp на div не сработал).
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
  }, [onPanChange, onZoomChange, onMouseUp, setSvgWillChange]);

  const handleLocalMouseUp = useCallback((_e: React.MouseEvent<HTMLDivElement>) => {
    forceStopInteraction();
  }, [forceStopInteraction]);

  // Safety-net: если кнопку мыши отпустили (или палец подняли) за пределами канвы,
  // либо окно/вкладка потеряли фокус во время драга — mouseup/touchend на самом div
  // не сработает, и локальное состояние (а с ним и willChange) зависнет навсегда.
  // Слушаем это на уровне window/document и принудительно завершаем взаимодействие.
  useEffect(() => {
    const handleWindowPointerUp = () => forceStopInteraction();
    const handleWindowBlur = () => forceStopInteraction();
    const handleVisibilityChange = () => {
      if (document.hidden) forceStopInteraction();
    };

    window.addEventListener('mouseup', handleWindowPointerUp);
    window.addEventListener('touchend', handleWindowPointerUp);
    window.addEventListener('touchcancel', handleWindowPointerUp);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('mouseup', handleWindowPointerUp);
      window.removeEventListener('touchend', handleWindowPointerUp);
      window.removeEventListener('touchcancel', handleWindowPointerUp);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [forceStopInteraction]);

  const handleLocalMouseLeave = useCallback((_e: React.MouseEvent<HTMLDivElement>) => {
    // Курсор ушёл с канвы, но кнопка ещё может быть зажата (drag продолжится за её пределами) —
    // не завершаем взаимодействие здесь, это сделает window-level 'mouseup'/'pointerup'
    // (либо обычный onMouseUp на div, если курсор вернётся и отпустится внутри).
    if (onMouseLeave) onMouseLeave();
  }, [onMouseLeave]);

  const getTouchDist = (t1: React.Touch, t2: React.Touch) => {
    return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
  };

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      touchStateRef.current = {
        mode: 'pan',
        initialDist: 0,
        initialZoom: localTransformRef.current.z,
        initialPan: { x: localTransformRef.current.x, y: localTransformRef.current.y },
        startTouchPos: { x: touch.clientX, y: touch.clientY },
        isDrag: false
      };
    } else if (e.touches.length === 2) {
      const dist = getTouchDist(e.touches[0], e.touches[1]);

      const startFocalX = ((e.touches[0].clientX + e.touches[1].clientX) / 2) - centerX;
      const startFocalY = ((e.touches[0].clientY + e.touches[1].clientY) / 2) - centerY;

      touchStateRef.current = {
        mode: 'pinch',
        initialDist: dist,
        initialZoom: localTransformRef.current.z,
        initialPan: { x: localTransformRef.current.x, y: localTransformRef.current.y },
        startTouchPos: { x: startFocalX, y: startFocalY },
        isDrag: true
      };
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const state = touchStateRef.current;

    if (e.touches.length === 1 && state.mode === 'pan') {
      const touch = e.touches[0];
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

    } else if (e.touches.length === 2 && state.mode === 'pinch') {
      const currentDist = getTouchDist(e.touches[0], e.touches[1]);
      if (state.initialDist > 0) {
        state.isDrag = true;
        if (!willChangeActiveRef.current) setSvgWillChange(true);

        const rect = e.currentTarget.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const scale = currentDist / state.initialDist;
        const targetZoom = Math.min(Math.max(0.3, state.initialZoom * scale), 5.0);

        const currFocalX = ((e.touches[0].clientX + e.touches[1].clientX) / 2) - centerX;
        const currFocalY = ((e.touches[0].clientY + e.touches[1].clientY) / 2) - centerY;

        const zoomRatio = targetZoom / state.initialZoom;

        const newPanX = currFocalX - (state.startTouchPos.x - state.initialPan.x) * zoomRatio;
        const newPanY = currFocalY - (state.startTouchPos.y - state.initialPan.y) * zoomRatio;

        state.currentPan = { x: newPanX, y: newPanY };
        state.currentZoom = targetZoom;
        localTransformRef.current = { x: newPanX, y: newPanY, z: targetZoom };

        updateTransform(newPanX, newPanY, targetZoom);
      }
    }
  }, [updateTransform, setSvgWillChange]);

  const handleTouchEnd = useCallback(() => {
    forceStopInteraction();
  }, [forceStopInteraction]);

  return (
    <div
      className="flex-1 bg-neutral-950 overflow-hidden relative flex items-center justify-center z-0 touch-none select-none"
      style={{ cursor: isPanning || mouseStateRef.current.isDragging ? 'grabbing' : (activeTool === 'hand' ? 'grab' : 'default') }}
      onWheel={handleLocalWheel}
      onMouseDown={handleLocalMouseDown}
      onMouseMove={handleLocalMouseMove}
      onMouseUp={handleLocalMouseUp}
      onMouseLeave={handleLocalMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg
        ref={svgRef}
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
          onSelectFloor={(x, y) => onSelectInstance(`floor_${x}_${y}`)}
          onClearSelection={() => onSelectInstance(null)}
          onHoverCell={(x, y) => setHoveredCell && setHoveredCell({ x, y })}
        />

        <GridObjects
          sortedRootObjects={sortedRootObjects}
          objects={mapState.layers.objects}
          viewMode={viewMode}
          gridW={GRID_W}
          activeTool={activeTool}
          activeBaseType={activeBaseType}
          activeSettlementLayer={activeSettlementLayer}
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
          onClearSelection={() => onSelectInstance(null)}
        />

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
    prevProps.wallLines === nextProps.wallLines &&
    prevProps.sortedRootObjects === nextProps.sortedRootObjects &&
    prevProps.activeBaseType === nextProps.activeBaseType &&
    prevProps.activeSettlementLayer === nextProps.activeSettlementLayer
  );
});