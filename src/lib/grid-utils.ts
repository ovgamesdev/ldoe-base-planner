import { CELL_SIZE, ISO_H, ISO_W, ViewMode } from './constants'
import type { BaseType, CatalogItem, FloorLayer, ObjectLayer, SettlementLayerType, WallLayer } from './initial-data'

export const getOccupiedCells = (x: number, y: number, w: number, h: number, rotation: number) => {
  const cells: { x: number; y: number }[] = [];
  const isRotated = rotation === 90 || rotation === 270;
  const finalW = isRotated ? h : w;
  const finalH = isRotated ? w : h;

  for (let i = 0; i < finalW; i++) {
    for (let j = 0; j < finalH; j++) {
      cells.push({ x: x + i, y: y + j });
    }
  }
  return cells;
};

export const getEffectiveSize = (template: CatalogItem) => {
  if (template.constraints.placementType === 'wall') {
    const length = Math.max(template.size.w, template.size.h);
    return { w: length, h: 1 };
  }
  return template.size;
};

export const getFinalSize = (w: number, h: number, rotation: number) => {
  const isRotated = rotation === 90 || rotation === 270;
  return { w: isRotated ? h : w, h: isRotated ? w : h };
};

export const getAutoTileMask = (
  object: ObjectLayer,
  objects: ObjectLayer[],
  template: CatalogItem,
) => {
  const compatibleTypeIds = new Set([object.typeId, ...(template.constraints.connectsTo ?? [])]);
  const hasCompatibleObjectAt = (x: number, y: number) => objects.some(candidate =>
    candidate.instanceId !== object.instanceId &&
    candidate.x === x &&
    candidate.y === y &&
    compatibleTypeIds.has(candidate.typeId)
  );

  return (hasCompatibleObjectAt(object.x, object.y - 1) ? 1 : 0)
    + (hasCompatibleObjectAt(object.x + 1, object.y) ? 2 : 0)
    + (hasCompatibleObjectAt(object.x, object.y + 1) ? 4 : 0)
    + (hasCompatibleObjectAt(object.x - 1, object.y) ? 8 : 0);
};

export const isWallCrossingObjectFootprint = (
  objects: ObjectLayer[],
  catalogMap: Record<string, CatalogItem>,
  x: number,
  y: number,
  orientation: 'horizontal' | 'vertical'
) => {
  const cellA = orientation === 'horizontal' ? { x, y: y - 1 } : { x: x - 1, y };
  const cellB = { x, y };

  return objects.some(obj => {
    const template = catalogMap[obj.typeId];
    if (!template || template.constraints.placementType === 'wall') return false;

    const effSize = getEffectiveSize(template);
    const cells = getOccupiedCells(obj.x, obj.y, effSize.w, effSize.h, obj.rotation);
    if (cells.length < 2) return false;

    const hasA = cells.some(c => c.x === cellA.x && c.y === cellA.y);
    const hasB = cells.some(c => c.x === cellB.x && c.y === cellB.y);
    return hasA && hasB;
  });
};

export const hasFloorForWall = (
  floors: FloorLayer[], 
  x: number, 
  y: number, 
  orientation: 'horizontal' | 'vertical',
  requiredWallLevel: number = 1
) => {
  if (orientation === 'horizontal') {
    return floors.some(f => f.x === x && (f.y === y || f.y === y - 1) && f.level >= requiredWallLevel);
  } else {
    return floors.some(f => f.y === y && (f.x === x || f.x === x - 1) && f.level >= requiredWallLevel);
  }
};

export const hasValidWallForDecor = (
  walls: WallLayer[],
  x: number,
  y: number,
  minWallLevel: number = 1,
  allowWindow: boolean = true,
  rotation: number = 0
) => {
  const surroundingWalls = walls.filter(w => {
    switch (rotation) {
      case 0:
        return (w.orientation === 'horizontal' && w.x === x && w.y === y);
      case 180:
        return (w.orientation === 'horizontal' && w.x === x && w.y === y + 1);
      case 90:
      case 270:
        return (w.orientation === 'vertical' && w.x === x && w.y === y);
      default:
        return false;
    }
  });

  return surroundingWalls.some(w => {
    if (w.level < minWallLevel) return false;
    if (!allowWindow && w.isWindow) return false;
    return true;
  });
};

export const isWallDecorValid = (obj: ObjectLayer, walls: WallLayer[], catalogMap: Record<string, CatalogItem>) => {
  const template = catalogMap[obj.typeId];
  if (!template || template.constraints.placementType !== 'wall') return true;

  const effSize = getEffectiveSize(template);
  const cells = getOccupiedCells(obj.x, obj.y, effSize.w, effSize.h, obj.rotation);

  return cells.every(cell => {
    const checkX = (obj.rotation === 90 || obj.rotation === 270) ? cell.x + 1 : cell.x;
    const minWallLvl = template.constraints.requiresWallLevel || 1;
    const allowWindow = template.constraints.allowWindowWall ?? true;

    return hasValidWallForDecor(walls, checkX, cell.y, minWallLvl, allowWindow, obj.rotation);
  });
};

export const getTopVertex = (x: number, y: number, viewMode: ViewMode, gridW: number) => {
  if (viewMode === 'isometric') {
    const PAD_X = ISO_W / 2;
    const PAD_Y = ISO_H / 2;
    return {
      sx: (x + y) * (ISO_W / 2) + PAD_X,
      sy: ((gridW - x) + y) * (ISO_H / 2) + PAD_Y
    };
  } else {
    return {
      sx: x * CELL_SIZE + CELL_SIZE,
      sy: y * CELL_SIZE + CELL_SIZE
    };
  }
};

export const diamondPoints = (x: number, y: number, viewMode: ViewMode, gridW: number) => {
  const t = getTopVertex(x, y, viewMode, gridW);
  const r = getTopVertex(x + 1, y, viewMode, gridW);
  const b = getTopVertex(x + 1, y + 1, viewMode, gridW);
  const l = getTopVertex(x, y + 1, viewMode, gridW);
  return `${t.sx},${t.sy} ${r.sx},${r.sy} ${b.sx},${b.sy} ${l.sx},${l.sy}`;
};

export const footprintPoints = (x: number, y: number, fw: number, fh: number, viewMode: ViewMode, gridW: number) => {
  const t = getTopVertex(x, y, viewMode, gridW);
  const r = getTopVertex(x + fw, y, viewMode, gridW);
  const b = getTopVertex(x + fw, y + fh, viewMode, gridW);
  const l = getTopVertex(x, y + fh, viewMode, gridW);
  return `${t.sx},${t.sy} ${r.sx},${r.sy} ${b.sx},${b.sy} ${l.sx},${l.sy}`;
};

export const footprintCentroid = (x: number, y: number, fw: number, fh: number, viewMode: ViewMode, gridW: number) => {
  return getTopVertex(x + fw / 2, y + fh / 2, viewMode, gridW);
};

export const getCornerHighlightPaths = (
  t: { sx: number; sy: number },
  r: { sx: number; sy: number },
  b: { sx: number; sy: number },
  l: { sx: number; sy: number },
  len = 12
) => {
  const verts = [t, r, b, l];
  return verts.map((v, i) => {
    const prev = verts[(i + 3) % 4];
    const next = verts[(i + 1) % 4];

    const d1x = prev.sx - v.sx;
    const d1y = prev.sy - v.sy;
    const l1 = Math.hypot(d1x, d1y) || 1;
    const p1 = { sx: v.sx + (d1x / l1) * len, sy: v.sy + (d1y / l1) * len };

    const d2x = next.sx - v.sx;
    const d2y = next.sy - v.sy;
    const l2 = Math.hypot(d2x, d2y) || 1;
    const p2 = { sx: v.sx + (d2x / l2) * len, sy: v.sy + (d2y / l2) * len };

    return `M ${p1.sx},${p1.sy} L ${v.sx},${v.sy} L ${p2.sx},${p2.sy}`;
  });
};

export const getFloorFill = (floors: FloorLayer[], x: number, y: number, activeBaseType?: BaseType, activeSettlementLayer?: SettlementLayerType) => {
  const isResourceLayer = activeBaseType === 'settlement' && (activeSettlementLayer === 'energy' || activeSettlementLayer === 'water');
  if (isResourceLayer) return '#5b4736';

  const floor = floors.find(f => f.x === x && f.y === y);
  if (!floor) return '#166534'; 

  if (activeBaseType === 'settlement') {
    if (floor.level === 1) return '#78350f'; 
    if (floor.level === 2) return '#854d0e'; 
    if (floor.level === 3) return '#78716c'; 
    if (floor.level === 4) return '#334155'; 
    if (floor.level === 5) return '#164e63'; 
  }

  if (floor.level === 1) return '#78350f'; 
  if (floor.level === 2) return '#854d0e'; 
  if (floor.level === 3) return '#78716c'; 
  if (floor.level === 4) return '#334155'; 
  if (floor.level === 5) return '#164e63'; 
  return '#166534';
};

export const getWallColor = (walls: WallLayer[], x: number, y: number, orientation: 'horizontal' | 'vertical', activeBaseType?: BaseType) => {
  const wall = walls.find(w => w.x === x && w.y === y && w.orientation === orientation);
  if (!wall) return null;

  if (activeBaseType === 'settlement') {
    if (wall.isWindow) return '#3b82f6';
    if (wall.isDoor) return '#10b981';
    if (wall.level === 1) return '#d97706';
    if (wall.level === 2) return '#f59e0b';
    if (wall.level === 3) return '#a8a29e';
    if (wall.level === 4) return '#64748b';
  }

  if (wall.isWindow) return '#3b82f6';
  if (wall.isDoor) return '#10b981';
  if (wall.level === 1) return '#d97706';
  if (wall.level === 2) return '#f59e0b';
  if (wall.level === 3) return '#a8a29e';
  if (wall.level === 4) return '#64748b';
  return '#06b6d4';
};

export function getAssetPath(path: string | undefined): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${basePath}${cleanPath}`;
}