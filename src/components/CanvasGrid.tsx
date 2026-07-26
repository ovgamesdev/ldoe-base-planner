import React, { memo, useCallback, useEffect, useRef } from 'react'
import type { Tool, ViewMode } from '../lib/constants'
import { CELL_SIZE, ISO_H, ISO_W } from '../lib/constants'
import type { CatalogItem, MapData, ObjectLayer } from '../lib/initial-data'
import { GridCells } from './GridCells'
import { GridObjects } from './GridObjects'
import { GridWalls } from './GridWalls'
import { SelectionOverlay } from './SelectionOverlay'

interface CanvasGridProps {
  mapState: MapData;
  catalogMap: Record<string, CatalogItem>;
  viewMode: ViewMode;
  zoom: number;
  pan: { x: number; y: number };
  isPanning: boolean;
  activeTool: Tool;
  selectedTypeId: string;
  selectedInstanceId: string | null;
  selectedElementData: any;
  allCells: { x: number; y: number }[];
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
  useWillChange: boolean;
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
  useWillChange
}: CanvasGridProps) {
  const svgRef = useRef<SVGSVGElement>(null); 
  
  // Единый реф для хранения координат, позволяет менять transform напрямую (минуя React)
  const localTransformRef = useRef({ x: pan.x, y: pan.y, z: zoom });
  const wheelTimeoutRef = useRef<any>(null);
  const lastDispatchedRef = useRef({ x: pan.x, y: pan.y, z: zoom });

  const updateTransform = useCallback((x: number, y: number, currentZoom: number) => {
    if (svgRef.current) {
      const rotate = viewMode === 'topDown45' ? 'rotate(-45deg)' : '';
      svgRef.current.style.transform = `translate(${x}px, ${y}px) scale(${currentZoom}) ${rotate}`;
    }
  }, [viewMode]);

  // Принудительно применяем трансформацию (поворот) при изменении режима вида
  useEffect(() => {
    const { x, y, z } = localTransformRef.current;
    updateTransform(x, y, z);
  }, [viewMode, updateTransform]);
  
  // Синхронизация: если внешний стейт поменялся (ползунком из LeftSidebar)
  useEffect(() => {
  // Сравниваем пришедшие пропсы с тем, что мы отправляли в последний раз.
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

  // Вычисляем это значение здесь, чтобы GridWalls не перерисовывался каждый раз, 
  // когда мы кликаем по другому напольному зданию в каталоге.
  const isWallDecorTool = activeTool === 'object' && selectedTemplate?.constraints.placementType === 'wall';

  // --- ЛОКАЛЬНЫЙ ОБРАБОТЧИК ЗУМА ДЛЯ КОЛЕСИКА ---
  const handleLocalWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
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

    // Прямое обновление DOM:
    localTransformRef.current = { x: nextX, y: nextY, z: nextZ };
    updateTransform(nextX, nextY, nextZ);

    // Debounce для обновления React стейта (чтобы обновился ползунок, но без просадок фпс при зуме)
    if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
    wheelTimeoutRef.current = setTimeout(() => {
      lastDispatchedRef.current = { x: nextX, y: nextY, z: nextZ };
      if (onZoomChange) onZoomChange(nextZ);
      if (onPanChange) onPanChange({ x: nextX, y: nextY });
    }, 100);
    window.dispatchEvent(new CustomEvent('internal-zoom', { detail: { newZoom: nextZ } }));
  }, [updateTransform, onZoomChange, onPanChange]);

  // --- ЛОКАЛЬНЫЙ ОБРАБОТЧИК ЗУМА ДЛЯ ПОЛЗУНКА (ИЗ LEFTSIDEBAR) ---
  useEffect(() => {
    const handleExternalZoom = (e: Event) => {
      const customEvent = e as CustomEvent;
      const nextZ = customEvent.detail.newZoom;
      const currentZ = localTransformRef.current.z;
      if (nextZ === currentZ) return;

      const zoomFactor = nextZ / currentZ;
      const nextX = localTransformRef.current.x * zoomFactor;
      const nextY = localTransformRef.current.y * zoomFactor;

      // Прямое обновление DOM
      localTransformRef.current = { x: nextX, y: nextY, z: nextZ };
      updateTransform(nextX, nextY, nextZ);

      // Debounce для обновления React стейта (чтобы синхронизировать TSXBasePlanner)
      if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
      wheelTimeoutRef.current = setTimeout(() => {
        lastDispatchedRef.current = { x: nextX, y: nextY, z: nextZ };
        if (onZoomChange) onZoomChange(nextZ);
        if (onPanChange) onPanChange({ x: nextX, y: nextY });
      }, 100);
      window.dispatchEvent(new CustomEvent('internal-zoom', { detail: { newZoom: nextZ } }));
    };

    window.addEventListener('external-zoom', handleExternalZoom);
    return () => window.removeEventListener('external-zoom', handleExternalZoom);
  }, [updateTransform, onZoomChange, onPanChange]);


  // --- СОСТОЯНИЕ ДЛЯ ТАЧ-ЖЕСТОВ ---
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

  // --- СОСТОЯНИЕ ДЛЯ МЫШИ ---
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
        const newPanX = state.initialPan.x + dx;
        const newPanY = state.initialPan.y + dy;

        state.currentPan = { x: newPanX, y: newPanY };
        localTransformRef.current = { ...localTransformRef.current, x: newPanX, y: newPanY };
        
        updateTransform(newPanX, newPanY, localTransformRef.current.z);
        return; 
      }
    }

    if (onMouseMove) onMouseMove(e);
  }, [updateTransform, onMouseMove]);

  const handleLocalMouseUp = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const state = mouseStateRef.current;
    
    if (state.isDragging) {
      wasDraggingRef.current = true;
      setTimeout(() => { wasDraggingRef.current = false; }, 200);
      if (state.currentPan && onPanChange) {
        lastDispatchedRef.current = { ...lastDispatchedRef.current, x: state.currentPan.x, y: state.currentPan.y };
        onPanChange(state.currentPan);
      }
    }

    state.isDown = false;
    state.isDragging = false;
    state.currentPan = undefined;

    if (onMouseUp) onMouseUp();
  }, [onPanChange, onMouseUp]);

  const handleLocalMouseLeave = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const state = mouseStateRef.current;

    if (state.isDragging) {
      if (state.currentPan && onPanChange) onPanChange(state.currentPan);
    }

    state.isDown = false;
    state.isDragging = false;
    state.currentPan = undefined;

    if (onMouseLeave) onMouseLeave();
  }, [onPanChange, onMouseLeave]);


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
  }, [updateTransform]);

  const handleTouchEnd = useCallback(() => {
    const state = touchStateRef.current;
    
    if (state.isDrag) {
      wasDraggingRef.current = true;
      setTimeout(() => {
        wasDraggingRef.current = false;
      }, 200);
    }
    
    if (state.currentPan && onPanChange) {
      lastDispatchedRef.current = { ...lastDispatchedRef.current, x: state.currentPan.x, y: state.currentPan.y };
      onPanChange(state.currentPan);
    }
    if (state.currentZoom && onZoomChange) {
      lastDispatchedRef.current.z = state.currentZoom;
      onZoomChange(state.currentZoom);
    }

    state.mode = 'none';
    state.isDrag = false;
    state.currentPan = undefined;
    state.currentZoom = undefined;
  }, [onPanChange, onZoomChange]);

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
          // Обратите внимание: transform удален отсюда, теперь он применяется только напрямую через updateTransform
          transformOrigin: 'center center',
          willChange: useWillChange ? 'transform' : 'auto', 
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
          onCellClick={onCellClick}
          onSelectFloor={(x, y) => onSelectInstance(`floor_${x}_${y}`)}
          onClearSelection={() => onSelectInstance(null)}
        />

        <GridObjects
          sortedRootObjects={sortedRootObjects}
          objects={mapState.layers.objects}
          viewMode={viewMode}
          gridW={GRID_W}
          activeTool={activeTool}
          onSelectObject={(instanceId) => onSelectInstance(instanceId)}
        />

        <GridWalls
          wallLines={wallLines}
          walls={mapState.layers.walls}
          viewMode={viewMode}
          gridW={GRID_W}
          activeTool={activeTool}
          isWallDecorTool={isWallDecorTool}
          onWallClick={onWallClick}
          onSelectWall={(wallId) => onSelectInstance(wallId)}
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
});