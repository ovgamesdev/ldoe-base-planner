import { memo } from 'react'
import type { Tool, ViewMode } from '../lib/constants'
import { diamondPoints, getFloorFill } from '../lib/grid-utils'
import type { MapData } from '../lib/initial-data'

interface GridCellsProps {
  allCells: { x: number; y: number }[];
  gridW: number;
  gridH: number;
  viewMode: ViewMode;
  activeTool: Tool;
  mapState: MapData;
  onCellClick: (x: number, y: number) => void;
  onSelectFloor: (x: number, y: number) => void;
  onClearSelection: () => void;
}

export const GridCells = memo(function GridCells({
  allCells,
  gridW,
  gridH,
  viewMode,
  activeTool,
  mapState,
  onCellClick,
  onSelectFloor,
  onClearSelection
}: GridCellsProps) {
  return (
    <>
      {allCells.map(({ x, y }) => {
        const isOutOfBounds = x < 0 || y < 0 || x >= gridW || y >= gridH;
        const isNoBuild = !isOutOfBounds && mapState.mapConfig.noBuildZones.some(nb => nb.x === x && nb.y === y);
        const floorExists = !isOutOfBounds && mapState.layers.floors.some(f => f.x === x && f.y === y);
        const isInteractive = (!isOutOfBounds && activeTool !== 'hand') || floorExists || (isOutOfBounds && (activeTool === 'object' || activeTool === 'eraser'));

        return (
          <polygon
            key={`floor-${x}-${y}`}
            points={diamondPoints(x, y, viewMode, gridW)}
            fill={isOutOfBounds ? 'transparent' : (isNoBuild ? '#450a0a' : getFloorFill(mapState.layers.floors, x, y))}
            stroke={isOutOfBounds ? (activeTool === 'object' ? 'rgba(255,255,255,0.05)' : 'transparent') : "#262626"}
            strokeWidth={1}
            onClick={(e) => {
              e.stopPropagation();
              if (activeTool === 'hand') {
                if (floorExists) onSelectFloor(x, y);
                else onClearSelection();
              } else {
                onCellClick(x, y);
              }
            }}
            className={isInteractive ? 'cursor-pointer transition-opacity hover:opacity-80' : 'transition-opacity'}
            style={{ pointerEvents: isInteractive ? 'auto' : 'none' }}
          />
        );
      })}
    </>
  );
});