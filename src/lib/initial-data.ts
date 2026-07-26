export interface Constraints {
  rotatable: boolean;
  allowedRotations: number[];
  autoTiling?: boolean;
  connectsTo?: string[];
  autoTileImages?: Partial<Record<AutoTileVariant, string>>;
  placementType?: 'floor' | 'ground' | 'wall' | 'any';
  requiresFloor?: boolean;
  requiresSpecificFloorLevel?: number;
  requiresWallLevel?: number;
  allowWindowWall?: boolean;
  allowWallDecorAbove?: boolean;
  maxPerBase?: number;
  sharedLimitGroup?: string;
}

export interface ColorVariant {
  color: string;
  image: string;
}

export interface CatalogItem {
  typeId: string;
  category: string;
  name: string;
  size: { w: number; h: number };
  image: string;
  tooltipImage?: string;
  color: string;
  colorVariants?: ColorVariant[];
  constraints: Constraints;
}

export interface NoBuildZone {
  x: number;
  y: number;
}

export interface FloorLayer { x: number; y: number; level: number; }
export interface WallLayer { x: number; y: number; orientation: 'horizontal' | 'vertical'; level: number; isDoor: boolean; isWindow?: boolean; }
export interface ObjectLayer { instanceId: string; typeId: string; x: number; y: number; rotation: number; paintColor?: string; }

export interface MapData {
  id: string;
  name: string;
  mapConfig: { width: number; height: number; noBuildZones: NoBuildZone[]; };
  layers: { floors: FloorLayer[]; walls: WallLayer[]; objects: ObjectLayer[]; };
}

export type AutoTileVariant = 'single' | 'end' | 'straight' | 'corner' | 'tee' | 'cross';
