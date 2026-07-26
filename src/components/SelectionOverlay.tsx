import { memo } from 'react'
import type { ViewMode } from '../lib/constants'
import { getCornerHighlightPaths, getFinalSize, getTopVertex } from '../lib/grid-utils'
import type { CatalogItem, MapData } from '../lib/initial-data'

interface SelectionOverlayProps {
  selectedInstanceId: string | null;
  selectedElementData: any;
  mapState: MapData;
  catalogMap: Record<string, CatalogItem>;
  viewMode: ViewMode;
  gridW: number;
}

export const SelectionOverlay = memo(function SelectionOverlay({
  selectedInstanceId,
  selectedElementData,
  mapState,
  catalogMap,
  viewMode,
  gridW
}: SelectionOverlayProps) {
  if (!selectedInstanceId || !selectedElementData) return null;

  if (selectedInstanceId.startsWith('floor_')) {
    const [, sx, sy] = selectedInstanceId.split('_');
    const x = Number(sx), y = Number(sy);
    const floorExists = mapState.layers.floors.some(f => f.x === x && f.y === y);
    if (!floorExists) return null;

    const t = getTopVertex(x, y, viewMode, gridW);
    const r = getTopVertex(x + 1, y, viewMode, gridW);
    const b = getTopVertex(x + 1, y + 1, viewMode, gridW);
    const l = getTopVertex(x, y + 1, viewMode, gridW);
    return (
      <g style={{ pointerEvents: 'none' }}>
        {getCornerHighlightPaths(t, r, b, l, 12).map((d, i) => (
          <path key={`hl-f-${i}`} d={d} stroke="#22c55e" strokeWidth={4} strokeLinecap="square" strokeLinejoin="miter" fill="none" />
        ))}
      </g>
    );
  }

  if (selectedInstanceId.startsWith('wall_')) {
    const [, sx, sy, ori] = selectedInstanceId.split('_');
    const x = Number(sx), y = Number(sy);
    const wallExists = mapState.layers.walls.some(w => w.x === x && w.y === y && w.orientation === ori);
    if (!wallExists) return null;

    const t = getTopVertex(x, y, viewMode, gridW);
    const end = ori === 'horizontal' ? getTopVertex(x + 1, y, viewMode, gridW) : getTopVertex(x, y + 1, viewMode, gridW);
    
    return (
      <g key="hl-w" style={{ pointerEvents: 'none' }}>
        <line x1={t.sx} y1={t.sy} x2={end.sx} y2={end.sy} stroke="#22c55e" strokeWidth={8} strokeOpacity={0.35} strokeLinecap="round" />
        <line x1={t.sx} y1={t.sy} x2={end.sx} y2={end.sy} stroke="#22c55e" strokeWidth={2} strokeDasharray="5 3" strokeLinecap="round" />
        <circle cx={t.sx} cy={t.sy} r={3} fill="#22c55e" />
        <circle cx={end.sx} cy={end.sy} r={3} fill="#22c55e" />
      </g>
    );
  }

  const obj = mapState.layers.objects.find(o => o.instanceId === selectedInstanceId);
  if (obj) {
    const template = catalogMap[obj.typeId];
    if (template) {
      const { w: fw, h: fh } = getFinalSize(template.size.w, template.size.h, obj.rotation);
      const t = getTopVertex(obj.x, obj.y, viewMode, gridW);
      const r = getTopVertex(obj.x + fw, obj.y, viewMode, gridW);
      const b = getTopVertex(obj.x + fw, obj.y + fh, viewMode, gridW);
      const l = getTopVertex(obj.x, obj.y + fh, viewMode, gridW);
      return (
        <g style={{ pointerEvents: 'none' }}>
          {getCornerHighlightPaths(t, r, b, l, 12).map((d, i) => (
            <path key={`hl-o-${i}`} d={d} stroke="#22c55e" strokeWidth={4} strokeLinecap="square" strokeLinejoin="miter" fill="none" />
          ))}
        </g>
      );
    }
  }

  return null;
});