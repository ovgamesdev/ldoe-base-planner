import { memo } from 'react'
import type { Tool, ViewMode } from '../lib/constants'
import { AUTO_TILE_APPEARANCE_BY_MASK, CELL_SIZE, ISO_W } from '../lib/constants'
import {
	footprintCentroid,
	footprintPoints,
	getAutoTileMask,
	getEffectiveSize,
	getFinalSize,
	getTopVertex
} from '../lib/grid-utils'
import type { CatalogItem, ObjectLayer } from '../lib/initial-data'

interface GridObjectsProps {
  sortedRootObjects: { obj: ObjectLayer; template: CatalogItem }[];
  objects: ObjectLayer[];
  viewMode: ViewMode;
  gridW: number;
  activeTool: Tool;
  onSelectObject: (instanceId: string) => void;
}

export const GridObjects = memo(function GridObjects({
  sortedRootObjects,
  objects,
  viewMode,
  gridW,
  activeTool,
  onSelectObject
}: GridObjectsProps) {
  return (
    <>
      {sortedRootObjects.map(({ obj, template }) => {
        const effSize = getEffectiveSize(template);
        const autoTileMask = template.constraints.autoTiling
          ? getAutoTileMask(obj, objects, template)
          : null;
        const autoTileAppearance = autoTileMask === null ? null : AUTO_TILE_APPEARANCE_BY_MASK[autoTileMask];
        const displayRotation = autoTileAppearance?.rotation ?? obj.rotation;
        const { w: fw, h: fh } = getFinalSize(effSize.w, effSize.h, displayRotation);
        const pts = footprintPoints(obj.x, obj.y, fw, fh, viewMode, gridW);
        const centroid = footprintCentroid(obj.x, obj.y, fw, fh, viewMode, gridW);
        
        const t = getTopVertex(obj.x, obj.y, viewMode, gridW);
        const r = getTopVertex(obj.x + fw, obj.y, viewMode, gridW);
        const b = getTopVertex(obj.x + fw, obj.y + fh, viewMode, gridW);
        const l = getTopVertex(obj.x, obj.y + fh, viewMode, gridW);

        const minX = Math.min(t.sx, r.sx, b.sx, l.sx);
        const maxX = Math.max(t.sx, r.sx, b.sx, l.sx);
        const minY = Math.min(t.sy, r.sy, b.sy, l.sy);
        const maxY = Math.max(t.sy, r.sy, b.sy, l.sy);

        const boxW = maxX - minX;
        const boxH = maxY - minY;

        const t0 = getTopVertex(obj.x, obj.y, viewMode, gridW);
        const r0 = getTopVertex(obj.x + template.size.w, obj.y, viewMode, gridW);
        const b0 = getTopVertex(obj.x + template.size.w, obj.y + template.size.h, viewMode, gridW);
        const l0 = getTopVertex(obj.x, obj.y + template.size.h, viewMode, gridW);

        const baseBoxW = Math.max(t0.sx, r0.sx, b0.sx, l0.sx) - Math.min(t0.sx, r0.sx, b0.sx, l0.sx);
        const baseBoxH = Math.max(t0.sy, r0.sy, b0.sy, l0.sy) - Math.min(t0.sy, r0.sy, b0.sy, l0.sy);

        const S = Math.max(boxW, boxH, baseBoxW, baseBoxH);
        const foX = centroid.sx - S / 2;
        const foY = centroid.sy - S / 2;

        const chipW = Math.max(fw, fh) * (viewMode === 'isometric' ? ISO_W * 0.62 : CELL_SIZE * 0.85);
        const chipH = 30;
        const clipId = `clip-obj-${obj.instanceId}`;
        
        const variantImage = template.colorVariants?.find(v => v.color === obj.paintColor)?.image;
        const autoTileImage = autoTileAppearance ? template.constraints.autoTileImages?.[autoTileAppearance.variant] : undefined;
        const currentImage = autoTileImage || variantImage || template.image;

        return (
          <g 
            key={obj.instanceId} 
            onClick={(e) => {
              e.stopPropagation();
              if (activeTool === 'hand') {
                onSelectObject(obj.instanceId);
              }
            }} 
            className={activeTool === 'hand' ? "cursor-pointer" : ""}
            style={{ pointerEvents: activeTool === 'hand' ? 'auto' : 'none' }}
          >
            <defs><clipPath id={clipId}><polygon points={pts} /></clipPath></defs>
            <polygon points={pts} fill={template.color} fillOpacity={template.color === 'transparent' ? 0 : (currentImage ? 0.25 : 0.55)} stroke={template.color === 'transparent' && !currentImage ? '#666' : '#000'} strokeOpacity={0.5} strokeWidth={1.5} />

            {currentImage ? (
              <foreignObject x={foX} y={foY} width={S} height={S} clipPath={`url(#${clipId})`} style={{ pointerEvents: 'none' }}>
                <div className="relative overflow-hidden" style={{ width: `${S}px`, height: `${S}px` }}>
                  <img src={currentImage} alt={template.name} className="absolute object-contain pointer-events-none" style={{ width: `${baseBoxW}px`, height: `${baseBoxH}px`, top: '50%', left: '50%', transform: `translate(-50%, -50%) rotate(${displayRotation}deg)` }} onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
                  <div className="absolute pointer-events-none hidden" style={{ width: `${boxW}px`, height: `${boxH}px`, top: `${(S - boxH) / 2}px`, left: `${(S - boxW) / 2}px` }}>
                    <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[8px] font-bold text-white bg-black/60 px-1 rounded drop-shadow pointer-events-none whitespace-nowrap max-w-[90%] truncate">{obj.rotation}°</span>
                  </div>
                </div>
              </foreignObject>
            ) : (
              <foreignObject x={centroid.sx - chipW / 2} y={centroid.sy - chipH / 2} width={chipW} height={chipH} style={{ overflow: 'visible', pointerEvents: 'none' }}>
                <div className="w-full h-full flex flex-col items-center justify-center rounded shadow-md px-1 select-none overflow-hidden" style={{ background: template.color === 'transparent' ? 'rgba(0,0,0,0.6)' : template.color, border: '1px solid rgba(0,0,0,0.4)' }}>
                  <span className="text-[9px] font-bold text-white text-center leading-none drop-shadow whitespace-nowrap">{template.name} ({obj.rotation}°)</span>
                </div>
              </foreignObject>
            )}
          </g>
        );
      })}
    </>
  );
});