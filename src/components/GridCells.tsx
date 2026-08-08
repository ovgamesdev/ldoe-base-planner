import type { Tool, ViewMode } from '@/lib/constants'
import { FLOOR_TEXTURES_MAIN, FLOOR_TEXTURES_SETTLEMENT } from '@/lib/constants'
import { diamondPoints, getAssetPath, getFloorFill, getFloorPatternId } from '@/lib/grid-utils'
import type { BaseType, MapData, SettlementLayerType } from '@/lib/initial-data'
import { memo } from 'react'

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
  onHoverCell
}: GridCellsProps) {
  // const isResourceLayer = activeBaseType === 'settlement' && (activeSettlementLayer === 'energy' || activeSettlementLayer === 'water');
  // const opacityValue = isResourceLayer ? 0.35 : 1;
  const opacityValue = 1;

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
      {allCells.map(({ x, y }) => {
        const isOutOfBounds = x < 0 || y < 0 || x >= gridW || y >= gridH;
        const isNoBuild = !isOutOfBounds && mapState.mapConfig.noBuildZones.some(nb => nb.x === x && nb.y === y && (activeBaseType === 'main' || nb.layer === activeSettlementLayer));
        const floorExists = !isOutOfBounds && mapState.layers.floors.some(f => f.x === x && f.y === y);
        const isInteractive = (!isOutOfBounds && activeTool !== 'hand') || floorExists || (isOutOfBounds && (activeTool === 'object' || activeTool === 'eraser'));
        const isHighlighted = highlightedCells?.has(`${x},${y}`);

        return (
          <polygon
            key={`floor-${x}-${y}`}
            points={diamondPoints(x, y, viewMode, gridW)}
            fill={isOutOfBounds ? 'transparent' : (isHighlighted ? 'rgba(234, 179, 8, 0.4)' : (isNoBuild ? '#450a0a' : getFloorFill(mapState.layers.floors, x, y, activeBaseType, activeSettlementLayer)))}
            stroke={isOutOfBounds ? (activeTool === 'object' ? 'rgba(255,255,255,0.05)' : 'transparent') : (isHighlighted ? '#eab308' : "#262626")}
            strokeWidth={isHighlighted ? 2 : 1}
            onClick={(e) => {
              e.stopPropagation();
              if (activeTool === 'hand') {
                if (floorExists) onSelectFloor(x, y);
                else onClearSelection();
              } else {
                onCellClick(x, y);
              }
            }}
            onMouseEnter={() => onHoverCell && onHoverCell(x, y)}
            className={isInteractive ? 'cursor-pointer transition-opacity hover:opacity-80' : 'transition-opacity'}
            style={{ pointerEvents: isInteractive ? 'auto' : 'none', opacity: opacityValue }}
          />
        );
      })}
    </>
  );
});