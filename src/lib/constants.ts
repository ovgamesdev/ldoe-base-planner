import type { AutoTileVariant, MapData } from './initial-data'

export type Tool = 'floor' | 'wall' | 'object' | 'nobuild' | 'eraser' | 'hand';
export type ViewMode = 'isometric' | 'topDown' | 'topDown45';

export interface InitialMapEntry {
  id: string;
  name: string;
  file: string;
}

export const ALL_ROTATIONS = [0, 90, 180, 270];

export const EMPTY_AUTO_TILE_IMAGES: Record<AutoTileVariant, string> = {
  single: '', end: '', straight: '', corner: '', tee: '', cross: ''
};

export const AUTO_TILE_APPEARANCE_BY_MASK: Record<number, { variant: AutoTileVariant; rotation: number }> = {
  0: { variant: 'single', rotation: 0 },
  1: { variant: 'end', rotation: 180 },
  2: { variant: 'end', rotation: 270 },
  3: { variant: 'corner', rotation: 270 },
  4: { variant: 'end', rotation: 0 },
  5: { variant: 'straight', rotation: 0 },
  6: { variant: 'corner', rotation: 0 },
  7: { variant: 'tee', rotation: 270 },
  8: { variant: 'end', rotation: 90 },
  9: { variant: 'corner', rotation: 180 },
  10: { variant: 'straight', rotation: 90 },
  11: { variant: 'tee', rotation: 180 },
  12: { variant: 'corner', rotation: 90 },
  13: { variant: 'tee', rotation: 90 },
  14: { variant: 'tee', rotation: 0 },
  15: { variant: 'cross', rotation: 0 },
};

export const ISO_W = 56;
export const ISO_H = 28;
export const CELL_SIZE = 48;

export const LOADING_MAP: MapData = {
  id: 'loading-map',
  name: 'Загрузка карты…',
  mapConfig: { width: 20, height: 18, noBuildZones: [] },
  layers: { floors: [], walls: [], objects: [] }
};

export const CATEGORY_LABELS: Record<string, string> = {
  workbenches_storage: "Станки > Хранилище",
  workbenches_basic: "Станки > Базовые",
  workbenches_advanced: "Станки > Продвинутые",
  workbenches_technologic: "Станки > Технологичн.",
  workbenches_extractors: "Станки > Добыча",

  furniture_practical: "Мебель > Практичная",
  furniture_for_comfort: "Мебель > Для уюта",
  furniture_for_the_garden: "Мебель > Для сада",
  furniture_protective: "Мебель > Защитная",
  furniture_wall_mounted: "Мебель > Настенная",

  special_unique: "Особое > Уникальное",
  special_transport: "Особое > Транспорт",

  decorations_plants: "Украшения > Растения",
  decorations_season_rewards: "Украшения > Сезонные награды",
  decorations_wall_rewards: "Украшения > Настенные награды"
};

export const TOOL_LABELS: Record<Tool, string> = {
  floor: 'Floor (Полы)',
  wall: 'Wall (Стены)',
  object: 'Object (Станки)',
  nobuild: 'No-Build Зоны',
  eraser: 'Eraser (Ластик)',
  hand: 'Hand (Пан)'
};