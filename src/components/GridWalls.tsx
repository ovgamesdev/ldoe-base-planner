import React, { memo } from 'react'
import type { Tool, ViewMode } from '../lib/constants'
import { getTopVertex, getWallColor } from '../lib/grid-utils'
import type { WallLayer } from '../lib/initial-data'

interface GridWallsProps {
  wallLines: { x: number; y: number; orientation: 'horizontal' | 'vertical' }[];
  walls: WallLayer[];
  viewMode: ViewMode;
  gridW: number;
  activeTool: Tool;
  isWallDecorTool: boolean;
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
  onWallClick,
  onSelectWall,
  onClearSelection
}: GridWallsProps) {
  return (
    <>
      {wallLines.map(({ x, y, orientation }) => {
        if (orientation === 'horizontal') {
          const t = getTopVertex(x, y, viewMode, gridW);
          const r = getTopVertex(x + 1, y, viewMode, gridW);
          const color = getWallColor(walls, x, y, 'horizontal');
          const isInteractive = activeTool === 'wall' || color || isWallDecorTool || activeTool === 'eraser';

          return (
            <line
              key={`wh-${x}-${y}`}
              x1={t.sx} y1={t.sy} x2={r.sx} y2={r.sy}
              stroke={color ?? 'transparent'}
              strokeWidth={color ? 4 : 10}
              strokeOpacity={color ? 1 : (isWallDecorTool ? 0.3 : 0)}
              onClick={(e) => {
                e.stopPropagation();
                if (activeTool === 'hand') {
                  if (color) onSelectWall(`wall_${x}_${y}_horizontal`);
                  else onClearSelection();
                } else if (activeTool === 'wall' || isWallDecorTool || activeTool === 'eraser') {
                  onWallClick(x, y, 'horizontal', e);
                }
              }}
              className={isInteractive ? 'cursor-pointer hover:stroke-white/40' : ''}
              style={{ pointerEvents: isInteractive ? 'stroke' : 'none' }}
            />
          );
        } else {
          const t = getTopVertex(x, y, viewMode, gridW);
          const l = getTopVertex(x, y + 1, viewMode, gridW);
          const color = getWallColor(walls, x, y, 'vertical');
          const isInteractive = activeTool === 'wall' || color || isWallDecorTool || activeTool === 'eraser';

          return (
            <line
              key={`wv-${x}-${y}`}
              x1={t.sx} y1={t.sy} x2={l.sx} y2={l.sy}
              stroke={color ?? 'transparent'}
              strokeWidth={color ? 4 : 10}
              strokeOpacity={color ? 1 : (isWallDecorTool ? 0.3 : 0)}
              onClick={(e) => {
                e.stopPropagation();
                if (activeTool === 'hand') {
                  if (color) onSelectWall(`wall_${x}_${y}_vertical`);
                  else onClearSelection();
                } else if (activeTool === 'wall' || isWallDecorTool || activeTool === 'eraser') {
                  onWallClick(x, y, 'vertical', e);
                }
              }}
              className={isInteractive ? 'cursor-pointer hover:stroke-white/40' : ''}
              style={{ pointerEvents: isInteractive ? 'stroke' : 'none' }}
            />
          );
        }
      })}
    </>
  );
});