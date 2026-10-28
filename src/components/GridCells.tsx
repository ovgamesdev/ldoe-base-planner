import type { Tool, ViewMode } from '@/lib/constants'
import { FLOOR_TEXTURES_MAIN, FLOOR_TEXTURES_SETTLEMENT } from '@/lib/constants'
import { diamondPoints, getAssetPath, getFloorFill, getFloorPatternId } from '@/lib/grid-utils'
import type { BaseType, FloorLayer, MapData, SettlementLayerType } from '@/lib/initial-data'
import { memo, useMemo } from 'react'
import type { RefObject } from 'react'

interface GridCellsProps {
  allCells: { x: number; y: number }[];
  gridW: number;
  gridH: number;
  viewMode: ViewMode;
  activeTool: Tool;
  mapState: MapData['mainBase'];
  activeBaseType: BaseType;
  activeSettlementLayer: SettlementLayerType;
  highlightedCells?: Set<string>;
  onCellClick: (x: number, y: number) => void;
  onSelectFloor: (x: number, y: number) => void;
  onClearSelection: () => void;
  onHoverCell?: (x: number, y: number) => void;
  // Режим строительства читаем из ref в обработчиках: его смена не должна перерисовывать все клетки.
  buildRef?: RefObject<{ active: boolean; kind: 'cell' | 'vertex' }>;
  onBuildPress?: (p: { x: number; y: number }, button: number) => void;
  onBuildHover?: (p: { x: number; y: number }) => void;
}

export const GridCells = memo(function GridCells({
  allCells,
  gridW,
  gridH,
  viewMode,
  activeTool,
  mapState,
  activeBaseType,
  activeSettlementLayer,
  highlightedCells,
  onCellClick,
  onSelectFloor,
  onClearSelection,
  onHoverCell,
  buildRef,
  onBuildPress,
  onBuildHover
}: GridCellsProps) {
  // const isResourceLayer = activeBaseType === 'settlement' && (activeSettlementLayer === 'energy' || activeSettlementLayer === 'water');
  // const opacityValue = isResourceLayer ? 0.35 : 1;
  const opacityValue = 1;

  // Всё, что зависит только от данных карты, считаем один раз (Set/Map вместо .some/.find на каждую клетку).
  const cells = useMemo(() => {
    const noBuild = new Set<string>();
    for (const nb of mapState.mapConfig.noBuildZones) {
      if (activeBaseType === 'main' || nb.layer === activeSettlementLayer) noBuild.add(`${nb.x},${nb.y}`);
    }
    const floorAt = new Map<string, FloorLayer>();
    for (const f of mapState.layers.floors) {
      const k = `${f.x},${f.y}`;
      if (!floorAt.has(k)) floorAt.set(k, f);
    }
    return allCells.map(({ x, y }) => {
      const k = `${x},${y}`;
      const isOutOfBounds = x < 0 || y < 0 || x >= gridW || y >= gridH;
      const isNoBuild = !isOutOfBounds && noBuild.has(k);
      const floor = isOutOfBounds ? undefined : floorAt.get(k);
      const floorExists = !!floor;
      const isInteractive = (!isOutOfBounds && activeTool !== 'hand') || floorExists || (isOutOfBounds && (activeTool === 'object' || activeTool === 'eraser'));
      const isHighlighted = !!highlightedCells?.has(k);
      return {
        x, y, floorExists, isInteractive,
        points: diamondPoints(x, y, viewMode, gridW),
        fill: isOutOfBounds ? 'transparent' : (isHighlighted ? 'rgba(234, 179, 8, 0.4)' : (isNoBuild ? '#450a0a' : getFloorFill(floor ? [floor] : [], x, y, activeBaseType, activeSettlementLayer))),
        stroke: isOutOfBounds ? (activeTool === 'object' ? 'rgba(255,255,255,0.05)' : 'transparent') : (isHighlighted ? '#eab308' : '#262626'),
        strokeWidth: isHighlighted ? 2 : 1,
      };
    });
  }, [allCells, gridW, gridH, viewMode, activeTool, mapState, activeBaseType, activeSettlementLayer, highlightedCells]);

  return (
    <>
      <defs>
        {Object.entries(FLOOR_TEXTURES_MAIN).flatMap(([lvl, src]) => ([0, 270] as const).map(rot => (
          <pattern
            key={`floor-tex-main-${lvl}-r${rot}`}
            id={getFloorPatternId('main', Number(lvl), rot)}
            patternUnits="objectBoundingBox"
            patternContentUnits="objectBoundingBox"
            width={1}
            height={1}
          >
            <image
              href={getAssetPath(src)}
              x={0} y={0} width={1} height={1}
              preserveAspectRatio="xMidYMid slice"
              transform={rot ? `rotate(${rot} 0.5 0.5)` : undefined}
            />
          </pattern>
        )))}
        {Object.entries(FLOOR_TEXTURES_SETTLEMENT).flatMap(([lvl, src]) => ([0, 270] as const).map(rot => (
          <pattern
            key={`floor-tex-settlement-${lvl}-r${rot}`}
            id={getFloorPatternId('settlement', Number(lvl), rot)}
            patternUnits="objectBoundingBox"
            patternContentUnits="objectBoundingBox"
            width={1}
            height={1}
          >
            <image
              href={getAssetPath(src)}
              x={0} y={0} width={1} height={1}
              preserveAspectRatio="xMidYMid slice"
              transform={rot ? `rotate(${rot} 0.5 0.5)` : undefined}
            />
          </pattern>
        )))}
      </defs>
      {cells.map(({ x, y, floorExists, isInteractive, points, fill, stroke, strokeWidth }) => (
        <polygon
          key={`floor-${x}-${y}`}
          points={points}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          onClick={(e) => {
            e.stopPropagation();
            if (activeTool === 'hand') {
              if (floorExists) onSelectFloor(x, y);
              else onClearSelection();
            } else if (!buildRef?.current.active) {
              onCellClick(x, y);
            }
          }}
          // Построение мышью: палец и стилус идут через касания в CanvasGrid, поэтому здесь только мышь.
          onPointerDown={(e) => { const b = buildRef?.current; if (e.pointerType === 'mouse' && b?.active && b.kind === 'cell') onBuildPress?.({ x, y }, e.button); }}
          onPointerEnter={(e) => { const b = buildRef?.current; if (e.pointerType === 'mouse' && b?.active && b.kind === 'cell') onBuildHover?.({ x, y }); }}
          onMouseEnter={() => { if (onHoverCell) onHoverCell(x, y); }}
          className={isInteractive ? 'cursor-pointer transition-opacity hover:opacity-80' : 'transition-opacity'}
          style={{ pointerEvents: isInteractive ? 'auto' : 'none', opacity: opacityValue }}
        />
      ))}
    </>
  );
});