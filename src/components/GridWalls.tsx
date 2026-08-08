import type { Tool, ViewMode } from '@/lib/constants'
import { WALL_DOOR_COLOR, WALL_INDICATOR_SEGMENT_RATIO, WALL_WINDOW_COLOR } from '@/lib/constants'
import { getInsetSegment, getTopVertex, getWallColor } from '@/lib/grid-utils'
import type { BaseType, SettlementLayerType, WallLayer } from '@/lib/initial-data'
import React, { memo } from 'react'

interface GridWallsProps {
  wallLines: { x: number; y: number; orientation: 'horizontal' | 'vertical' }[];
  walls: WallLayer[];
  viewMode: ViewMode;
  gridW: number;
  activeTool: Tool;
  isWallDecorTool: boolean;
  activeBaseType: BaseType;
  activeSettlementLayer: SettlementLayerType;
  highlightedWalls?: Set<string>;
  onWallClick: (x: number, y: number, orientation: 'horizontal' | 'vertical', e: React.MouseEvent) => void;
  onSelectWall: (wallId: string) => void;
  onClearSelection: () => void;
}

export const GridWalls = memo(function GridWalls({
  wallLines,
  walls,
  viewMode,
  gridW,
  activeTool,
  isWallDecorTool,
  activeBaseType,
  activeSettlementLayer,
  highlightedWalls,
  onWallClick,
  onSelectWall,
  onClearSelection
}: GridWallsProps) {
  const isResourceLayer = activeBaseType === 'settlement' && (activeSettlementLayer === 'energy' || activeSettlementLayer === 'water');
  const opacityValue = isResourceLayer ? 0.35 : 1;

  return (
    <>
      {wallLines.map(({ x, y, orientation }) => {
        const wallKey = `w${orientation === 'horizontal' ? 'h' : 'v'}-${x}-${y}`;
        const isRoomOuterWall = highlightedWalls?.has(wallKey);

        const wall = walls.find(w => w.x === x && w.y === y && w.orientation === orientation);
        // Фоновый цвет стены (по уровню материала), не зависит от двери/окна.
        const levelColor = getWallColor(walls, x, y, orientation);

        // Обе ориентации строятся одинаково: t -> конец (сосед по X для horizontal, по Y для vertical).
        const t = getTopVertex(x, y, viewMode, gridW);
        const end = orientation === 'horizontal'
          ? getTopVertex(x + 1, y, viewMode, gridW)
          : getTopVertex(x, y + 1, viewMode, gridW);

        const strokeColor = isRoomOuterWall ? '#f59e0b' : (levelColor ?? 'transparent');
        const strokeWidth = isRoomOuterWall ? 6 : (levelColor ? 4 : 10);
        const strokeOpacity = isRoomOuterWall ? 1 : (levelColor ? 1 : (isWallDecorTool ? 0.3 : 0));
        const isInteractive = activeTool === 'wall' || levelColor || isWallDecorTool || activeTool === 'eraser';

        const handleClick = (e: React.MouseEvent) => {
          e.stopPropagation();
          if (activeTool === 'hand') {
            if (levelColor) onSelectWall(`wall_${x}_${y}_${orientation}`);
            else onClearSelection();
          } else if (activeTool === 'wall' || isWallDecorTool || activeTool === 'eraser') {
            onWallClick(x, y, orientation, e);
          }
        };

        // Дверь и окно — оба короче стены и по центру, одинаковой ширины.
        // Фон уровня остаётся виден по краям стены.
        const indicatorColor = wall?.isDoor ? WALL_DOOR_COLOR : wall?.isWindow ? WALL_WINDOW_COLOR : null;
        const indicatorSegment = indicatorColor && !isRoomOuterWall
          ? getInsetSegment(t, end, WALL_INDICATOR_SEGMENT_RATIO)
          : null;

        return (
          <g key={`${orientation === 'horizontal' ? 'wh' : 'wv'}-${x}-${y}`} style={{ opacity: opacityValue }}>
            <line
              x1={t.sx} y1={t.sy} x2={end.sx} y2={end.sy}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              strokeOpacity={strokeOpacity}
              onClick={handleClick}
              className={isInteractive ? 'cursor-pointer hover:stroke-amber-400' : ''}
              style={{ pointerEvents: isInteractive ? 'stroke' : 'none' }}
            />
            {indicatorSegment && indicatorColor && (
              <line
                x1={indicatorSegment.x1} y1={indicatorSegment.y1} x2={indicatorSegment.x2} y2={indicatorSegment.y2}
                stroke={indicatorColor}
                strokeWidth={strokeWidth}
                style={{ pointerEvents: 'none' }}
              />
            )}
          </g>
        );
      })}
    </>
  );
});