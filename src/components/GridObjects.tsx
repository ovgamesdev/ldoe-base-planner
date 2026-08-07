import { useLanguage } from '@/context/LanguageContext'
import type { Tool, ViewMode } from '@/lib/constants'
import { AUTO_TILE_APPEARANCE_BY_MASK, CELL_SIZE, ISO_W } from '@/lib/constants'
import {
  footprintCentroid,
  footprintPoints,
  getAssetPath,
  getAutoTileMask,
  getEffectiveSize,
  getFinalSize,
  getTopVertex
} from '@/lib/grid-utils'
import type { BaseType, CatalogItem, ObjectLayer, SettlementLayerType } from '@/lib/initial-data'
import { getItemName } from '@/lib/initial-data'
import { memo } from 'react'

interface GridObjectsProps {
  sortedRootObjects: { obj: ObjectLayer; template: CatalogItem }[];
  objects: ObjectLayer[];
  viewMode: ViewMode;
  gridW: number;
  activeTool: Tool;
  activeBaseType: BaseType;
  activeSettlementLayer: SettlementLayerType;
  onSelectObject: (instanceId: string) => void;
}

export const GridObjects = memo(function GridObjects({
  sortedRootObjects,
  objects,
  viewMode,
  gridW,
  activeTool,
  activeBaseType,
  activeSettlementLayer,
  onSelectObject
}: GridObjectsProps) {
  const { language } = useLanguage();

  return (
    <>
      {sortedRootObjects.map(({ obj, template }, index) => {
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
        const clipId = `clip-obj-${obj.instanceId || index}`;

        const variantImage = template.colorVariants?.find(v => v.color === obj.paintColor)?.image;
        const autoTileImage = autoTileAppearance ? template.constraints.autoTileImages?.[autoTileAppearance.variant] : undefined;
        const currentImage = autoTileImage || variantImage || template.image;

        const objLayer = obj.layer || template.constraints.settlementLayer || 'objects';
        const isCurrentLayer = activeBaseType !== 'settlement' || objLayer === activeSettlementLayer;
        const isFaded = !isCurrentLayer;
        let isSelect = !isFaded

        let opacity = 1;
        let color = template.color || '#eab308'
        if (isFaded) {
          if (activeSettlementLayer === 'energy') {
            opacity = template.constraints.requiresPower ? 0.90 : 0.12;
            if (template.constraints.requiresPower) {
              isSelect = true
              color = 'oklch(79.5% 0.184 86.047)'
            }
          } else if (activeSettlementLayer === 'water') {
            opacity = template.constraints.requiresWater ? 0.90 : 0.12;
            if (template.constraints.requiresWater) {
              isSelect = true
              color = 'oklch(71.5% 0.143 215.221)'
            }
          } else {
            opacity = 0.25;
          }
        }

        const objectKey = obj.instanceId || `obj-${obj.typeId}-${obj.x}-${obj.y}-${index}`;
        const displayName = getItemName(template.name, language);

        return (
          <g
            key={objectKey}
            onClick={(e) => {
              e.stopPropagation();
              if (activeTool === 'hand' && isSelect) {
                onSelectObject(obj.instanceId);
              }
            }}
            className={activeTool === 'hand' && isSelect ? "cursor-pointer" : ""}
            style={{ pointerEvents: activeTool === 'hand' && isSelect ? 'auto' : 'none', opacity }}
          >
            <polygon
              points={pts}
              fill={color}
              fillOpacity={0.25}
              stroke={color}
              strokeWidth={1.5}
            />
            {currentImage ? (
              <image
                href={getAssetPath(currentImage)}
                x={foX}
                y={foY}
                width={S}
                height={S}
                preserveAspectRatio="xMidYMid meet"
                style={{ pointerEvents: 'none' }}
                transform={displayRotation !== 0 ? `rotate(${displayRotation}, ${centroid.sx}, ${centroid.sy})` : undefined}
              />
            ) : (
              <g>
                <clipPath id={clipId}>
                  <rect
                    x={centroid.sx - chipW / 2}
                    y={centroid.sy - chipH / 2}
                    width={chipW}
                    height={chipH}
                    rx={6}
                    ry={6}
                  />
                </clipPath>
                <rect
                  x={centroid.sx - chipW / 2}
                  y={centroid.sy - chipH / 2}
                  width={chipW}
                  height={chipH}
                  rx={6}
                  ry={6}
                  fill={template.color || '#374151'}
                  stroke="#1f2937"
                  strokeWidth={1}
                />
                <text
                  x={centroid.sx}
                  y={centroid.sy}
                  clipPath={`url(#${clipId})`}
                  fill="#ffffff"
                  fontSize={10}
                  fontWeight="bold"
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {displayName}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </>
  );
});