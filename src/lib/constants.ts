import type { AutoTileVariant, MapData } from './initial-data'

export type Tool = 'floor' | 'wall' | 'object' | 'nobuild' | 'eraser' | 'hand';
export type ViewMode = 'isometric' | 'topDown' | 'topDown45';

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
  name: 'Loading map…',
  mainBase: {layers: {floors: [], walls: [], objects: []}, mapConfig: {width: 20, height: 18, noBuildZones: []}},
  settlementBase: {layers: {floors: [], walls: [], objects: []}, mapConfig: {width: 23, height: 18, noBuildZones: []}},
};

export const DEFAULT_MAP: Pick<MapData, 'mainBase' | 'settlementBase'> = {
  mainBase: {layers: {floors: [], walls: [], objects: []}, mapConfig: {width: 20, height: 18, noBuildZones: [{x:0,y:15},{x:0,y:14},{x:0,y:13},{x:0,y:12},{x:1,y:15},{x:1,y:14},{x:1,y:13},{x:1,y:12},{x:2,y:15},{x:2,y:14},{x:2,y:13},{x:2,y:12},{x:3,y:15},{x:3,y:14},{x:3,y:13},{x:3,y:12},{x:4,y:15},{x:4,y:14},{x:4,y:13},{x:4,y:12}]}},
  settlementBase: {layers: {floors: [], walls: [], objects: [{instanceId:"",typeId:"new_base_substation",x:22,y:2,rotation:90,layer:"objects",isDefault:true},{instanceId:"",typeId:"new_base_water_pump",x:18,y:16,rotation:0,layer:"objects",isDefault:true}]}, mapConfig: {width: 23, height: 18, noBuildZones: [{x:22,y:17,layer:"objects"},{x:22,y:16,layer:"objects"},{x:21,y:16,layer:"objects"},{x:21,y:17,layer:"objects"},{x:21,y:15,layer:"objects"},{x:20,y:15,layer:"objects"},{x:19,y:15,layer:"objects"},{x:18,y:15,layer:"objects"},{x:20,y:16,layer:"objects"},{x:20,y:17,layer:"objects"},{x:17,y:16,layer:"objects"},{x:16,y:17,layer:"objects"},{x:17,y:17,layer:"objects"},{x:21,y:15,layer:"energy"},{x:20,y:15,layer:"energy"},{x:22,y:13,layer:"energy"},{x:20,y:13,layer:"energy"},{x:18,y:14,layer:"energy"},{x:16,y:13,layer:"energy"},{x:15,y:15,layer:"energy"},{x:16,y:17,layer:"energy"},{x:13,y:16,layer:"energy"},{x:12,y:13,layer:"energy"},{x:8,y:14,layer:"energy"},{x:21,y:1,layer:"energy"},{x:19,y:0,layer:"energy"},{x:19,y:2,layer:"energy"},{x:19,y:11,layer:"energy"},{x:18,y:10,layer:"energy"},{x:16,y:10,layer:"energy"},{x:22,y:10,layer:"energy"},{x:21,y:10,layer:"energy"},{x:22,y:9,layer:"energy"},{x:22,y:7,layer:"energy"},{x:20,y:8,layer:"energy"},{x:19,y:7,layer:"energy"},{x:18,y:7,layer:"energy"},{x:17,y:8,layer:"energy"},{x:19,y:5,layer:"energy"},{x:20,y:4,layer:"energy"},{x:21,y:4,layer:"energy"},{x:22,y:3,layer:"energy"},{x:21,y:6,layer:"energy"},{x:17,y:1,layer:"energy"},{x:15,y:0,layer:"energy"},{x:17,y:4,layer:"energy"},{x:16,y:3,layer:"energy"},{x:16,y:6,layer:"energy"},{x:15,y:6,layer:"energy"},{x:15,y:8,layer:"energy"},{x:13,y:7,layer:"energy"},{x:17,y:12,layer:"energy"},{x:14,y:11,layer:"energy"},{x:11,y:9,layer:"energy"},{x:14,y:4,layer:"energy"},{x:12,y:2,layer:"energy"},{x:22,y:17,layer:"water"},{x:21,y:17,layer:"water"},{x:20,y:17,layer:"water"},{x:19,y:17,layer:"water"},{x:18,y:17,layer:"water"},{x:17,y:17,layer:"water"},{x:16,y:17,layer:"water"},{x:18,y:16,layer:"water"},{x:21,y:16,layer:"water"},{x:22,y:16,layer:"water"},{x:21,y:15,layer:"water"},{x:20,y:15,layer:"water"},{x:20,y:13,layer:"water"},{x:22,y:13,layer:"water"},{x:21,y:11,layer:"water"},{x:21,y:10,layer:"water"},{x:22,y:10,layer:"water"},{x:22,y:9,layer:"water"},{x:20,y:8,layer:"water"},{x:22,y:7,layer:"water"},{x:22,y:6,layer:"water"},{x:21,y:6,layer:"water"},{x:22,y:4,layer:"water"},{x:21,y:4,layer:"water"},{x:20,y:4,layer:"water"},{x:22,y:3,layer:"water"},{x:21,y:1,layer:"water"},{x:22,y:1,layer:"water"},{x:20,y:0,layer:"water"},{x:18,y:14,layer:"water"},{x:17,y:12,layer:"water"},{x:19,y:11,layer:"water"},{x:18,y:10,layer:"water"},{x:18,y:8,layer:"water"},{x:17,y:8,layer:"water"},{x:18,y:7,layer:"water"},{x:19,y:7,layer:"water"},{x:19,y:5,layer:"water"},{x:17,y:4,layer:"water"},{x:17,y:3,layer:"water"},{x:19,y:2,layer:"water"},{x:19,y:0,layer:"water"},{x:17,y:1,layer:"water"},{x:16,y:15,layer:"water"},{x:15,y:15,layer:"water"},{x:16,y:13,layer:"water"},{x:16,y:12,layer:"water"},{x:16,y:10,layer:"water"},{x:15,y:8,layer:"water"},{x:16,y:6,layer:"water"},{x:15,y:6,layer:"water"},{x:15,y:5,layer:"water"},{x:16,y:3,layer:"water"},{x:14,y:4,layer:"water"},{x:14,y:2,layer:"water"},{x:16,y:0,layer:"water"},{x:15,y:0,layer:"water"},{x:14,y:11,layer:"water"},{x:14,y:14,layer:"water"},{x:13,y:16,layer:"water"},{x:13,y:10,layer:"water"},{x:13,y:7,layer:"water"},{x:12,y:1,layer:"water"},{x:12,y:2,layer:"water"},{x:12,y:7,layer:"water"},{x:12,y:13,layer:"water"},{x:12,y:16,layer:"water"},{x:11,y:10,layer:"water"},{x:11,y:9,layer:"water"},{x:11,y:5,layer:"water"},{x:11,y:0,layer:"water"},{x:10,y:2,layer:"water"},{x:10,y:9,layer:"water"},{x:10,y:12,layer:"water"},{x:10,y:17,layer:"water"},{x:9,y:15,layer:"water"},{x:9,y:7,layer:"water"},{x:9,y:3,layer:"water"},{x:8,y:0,layer:"water"},{x:8,y:2,layer:"water"},{x:8,y:5,layer:"water"},{x:8,y:13,layer:"water"},{x:8,y:14,layer:"water"},{x:7,y:10,layer:"water"},{x:7,y:7,layer:"water"},{x:7,y:5,layer:"water"},{x:6,y:0,layer:"water"},{x:6,y:1,layer:"water"},{x:6,y:3,layer:"water"},{x:6,y:8,layer:"water"},{x:6,y:13,layer:"water"},{x:5,y:11,layer:"water"},{x:5,y:10,layer:"water"},{x:5,y:6,layer:"water"},{x:5,y:1,layer:"water"},{x:4,y:0,layer:"water"},{x:4,y:3,layer:"water"},{x:4,y:5,layer:"water"},{x:4,y:8,layer:"water"},{x:4,y:10,layer:"water"},{x:4,y:12,layer:"water"},{x:3,y:5,layer:"water"},{x:3,y:2,layer:"water"},{x:2,y:0,layer:"water"},{x:2,y:2,layer:"water"},{x:2,y:4,layer:"water"},{x:2,y:7,layer:"water"},{x:2,y:10,layer:"water"},{x:2,y:13,layer:"water"},{x:1,y:12,layer:"water"},{x:1,y:11,layer:"water"},{x:0,y:11,layer:"water"},{x:0,y:10,layer:"water"},{x:0,y:9,layer:"water"},{x:1,y:8,layer:"water"},{x:0,y:7,layer:"water"},{x:1,y:6,layer:"water"},{x:0,y:5,layer:"water"},{x:0,y:4,layer:"water"},{x:1,y:4,layer:"water"},{x:1,y:3,layer:"water"},{x:0,y:0,layer:"water"},{x:0,y:1,layer:"water"},{x:1,y:1,layer:"water"},{x:0,y:2,layer:"water"},{x:8,y:5,layer:"energy"},{x:6,y:1,layer:"energy"},{x:1,y:4,layer:"energy"},{x:0,y:11,layer:"energy"},{x:5,y:10,layer:"energy"},{x:22,y:2,layer:"objects"},{x:22,y:3,layer:"objects"},{x:19,y:16,layer:"objects"},{x:18,y:16,layer:"objects"},{x:19,y:17,layer:"objects"},{x:18,y:17,layer:"objects"}]}},
}

export const CATEGORY_LABELS: Record<string, string> = {
  // ПОСЕЛЕНИЕ
  rooms_storehouse: "Комнаты > Склад",
  rooms_woodshop: "Комнаты > Столярная",
  rooms_foundry: "Комнаты > Литейная",
  rooms_assembly: "Комнаты > Сборочная",
  rooms_workshop: "Комнаты > Мастерская",
  supply_power: "Снабжение > Энергия",
  supply_water: "Снабжение > Вода",

  // БАЗА
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
