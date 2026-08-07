export type AutoTileVariant = 'single' | 'end' | 'straight' | 'corner' | 'tee' | 'cross';
export type BaseType = 'main' | 'settlement' | 'both';
export type SettlementLayerType = 'objects' | 'energy' | 'water';

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
  baseType?: BaseType;
  settlementLayer?: SettlementLayerType;
  isDesk?: string;
  requiredDesk?: string;
  requiresPower?: boolean;
  requiresWater?: boolean;
}

export interface NewBuildingState {
  typeId: string;
  name: { ru: string; en: string };
  category: string;
  w: number;
  h: number;
  image: string;
  tooltipImage: string;
  color: string;
  allowedRotations: number[];
  placementType: 'floor' | 'ground' | 'wall' | 'any';
  minFloorLvl: number;
  minWallLvl: number;
  allowWindowWall: boolean;
  allowWallDecorAbove: boolean;
  maxCount: number;
  sharedLimitGroup: string;
  autoTiling: boolean;
  connectsTo: string;
  autoTileImages: Record<string, string>;
  colorVariants: ColorVariant[];
  baseType: BaseType;
  settlementLayer?: SettlementLayerType | undefined;
  isDesk: string;
  requiredDesk: string;
  requiresPower?: boolean;
  requiresWater?: boolean;
}

export interface ColorVariant {
  color: string;
  image: string;
}

export interface CatalogItem {
  typeId: string;
  category: string;
  name: { ru: string; en: string } | string;
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
  layer?: SettlementLayerType;
}

export interface FloorLayer { x: number; y: number; level: number; }
export interface WallLayer { x: number; y: number; orientation: 'horizontal' | 'vertical'; level: number; isDoor: boolean; isWindow?: boolean; }
export interface ObjectLayer { instanceId: string; typeId: string; x: number; y: number; rotation: number; paintColor?: string; layer?: SettlementLayerType; isDefault?: boolean; }

export interface BaseData {
  mapConfig: { width: number; height: number; noBuildZones: NoBuildZone[]; };
  layers: { floors: FloorLayer[]; walls: WallLayer[]; objects: ObjectLayer[]; };
}

export type SelectedElementData =
  | { type: 'floor'; data: FloorLayer }
  | { type: 'wall'; data: WallLayer; decors: { obj: ObjectLayer; template: CatalogItem }[] }
  | { type: 'object'; data: { obj: ObjectLayer; template: CatalogItem }[] };

export interface MapData {
  id: string;
  name: string;
  shareId?: string;
  ownerId?: string;
  mainBase: BaseData;
  settlementBase: BaseData;
  createdAt?: number;
  updatedAt?: number;
}

export interface ModalInfoState {
  title?: string;
  message: string;
  type?: 'error' | 'info' | 'success' | 'warning';
}

/**
 * A single locally-stored customization of the catalog, relative to /data/catalog.json.
 *
 * - For an item that also exists in catalog.json: only the fields the user actually
 *   changed are present, plus `typeId` and `_updatedAt`. Once catalog.json itself
 *   catches up to those fields, the entry is dropped automatically.
 * - For an item the user added that doesn't exist in catalog.json: every CatalogItem
 *   field is present (it's effectively a standalone item), plus `typeId` and `_updatedAt`.
 * - For an item the user deleted that still exists in catalog.json: `_deleted: true`.
 */
export type CatalogOverlayEntry = Partial<CatalogItem> & {
  typeId: string;
  _updatedAt: number;
  _deleted?: boolean;
};

export type CatalogOverlay = Record<string, CatalogOverlayEntry>;

export function getItemName(name: string | { ru: string; en: string } | undefined, lang: 'ru' | 'en' = 'ru'): string {
  if (!name) return '';
  if (typeof name === 'string') return name;
  return name[lang] || name.ru || name.en || '';
}

export function searchMatchesName(name: string | { ru: string; en: string } | undefined, query: string): boolean {
  if (!name || !query) return true;
  const q = query.toLowerCase();
  if (typeof name === 'string') {
    return name.toLowerCase().includes(q);
  }
  return (name.ru?.toLowerCase().includes(q) || name.en?.toLowerCase().includes(q)) ?? false;
}