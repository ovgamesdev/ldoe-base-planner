import { segKey } from './build-modes'
import { getEffectiveSize, getOccupiedCells } from './grid-utils'
import type { BaseType, CatalogItem, FloorLayer, NoBuildZone, ObjectLayer, SettlementLayerType, WallLayer } from './initial-data'

// Индексы слоёв карты для предпросмотра и построения: карты и множества по клеткам и рёбрам.
// Всё считается лениво (только то, что нужно текущему инструменту) и один раз на набор слоёв —
// вызывающий код пересоздаёт индекс, только когда меняются сами слои (useMemo в useBuildTools).

const k2 = (x: number, y: number) => `${x},${y}`;

export interface LayerIndexInput {
  floors: FloorLayer[];
  walls: WallLayer[];
  objects: ObjectLayer[];
  noBuildZones: NoBuildZone[];
  catalogMap: Record<string, CatalogItem>;
  activeBaseType: BaseType;
  activeSettlementLayer: SettlementLayerType;
}

export function createLayerIndex({ floors, walls, objects, noBuildZones, catalogMap, activeBaseType, activeSettlementLayer }: LayerIndexInput) {
  const lazy = <T,>(make: () => T) => {
    let done = false;
    let value: T;
    return () => { if (!done) { value = make(); done = true; } return value; };
  };
  const layerOf = (o: ObjectLayer) => o.layer || catalogMap[o.typeId]?.constraints.settlementLayer || 'objects';
  const relevant = (o: ObjectLayer) => activeBaseType === 'main' || layerOf(o) === activeSettlementLayer;

  const floorAt = lazy(() => new Map(floors.map(f => [k2(f.x, f.y), f.level])));
  // наибольший уровень пола в клетке: для проверки «есть ли пол под стеной нужного уровня»
  const floorMaxLevel = lazy(() => {
    const m = new Map<string, number>();
    for (const f of floors) {
      const key = k2(f.x, f.y);
      if (f.level > (m.get(key) ?? -Infinity)) m.set(key, f.level);
    }
    return m;
  });
  const relevantObjects = lazy(() => objects.filter(relevant));

  return {
    floorAt,
    floorSet: lazy(() => new Set(floors.map(f => k2(f.x, f.y)))),
    wallKeys: lazy(() => new Set(walls.map(w => segKey(w)))),
    wallAt: lazy(() => new Map(walls.map(w => [segKey(w), w]))),
    noBuild: lazy(() => new Set(noBuildZones
      .filter(z => activeBaseType === 'main' || z.layer === activeSettlementLayer)
      .map(z => k2(z.x, z.y)))),
    // занятые клетки и требуемый уровень пола под объектами (для пола)
    occupancy: lazy(() => {
      const occupied = new Set<string>();
      const needLevel = new Map<string, number>();
      for (const o of relevantObjects()) {
        const tt = catalogMap[o.typeId];
        if (!tt || tt.constraints.placementType === 'wall') continue;
        const req = tt.constraints.placementType === 'floor' ? (tt.constraints.requiresSpecificFloorLevel || 1) : 0;
        for (const c of getOccupiedCells(o.x, o.y, tt.size.w, tt.size.h, o.rotation)) {
          const key = k2(c.x, c.y);
          occupied.add(key);
          if (req > (needLevel.get(key) ?? 0)) needLevel.set(key, req);
        }
      }
      return { occupied, needLevel };
    }),
    // рёбра внутри многоклеточного объекта (стену там ставить нельзя), в формате segKey
    crossedEdges: lazy(() => {
      const edges = new Set<string>();
      for (const o of relevantObjects()) {
        const tt = catalogMap[o.typeId];
        if (!tt || tt.constraints.placementType === 'wall') continue;
        const eff = getEffectiveSize(tt);
        const cells = getOccupiedCells(o.x, o.y, eff.w, eff.h, o.rotation);
        if (cells.length < 2) continue;
        const own = new Set(cells.map(c => k2(c.x, c.y)));
        for (const c of cells) {
          if (own.has(k2(c.x + 1, c.y))) edges.add(`v${c.x + 1},${c.y}`);
          if (own.has(k2(c.x, c.y + 1))) edges.add(`h${c.x},${c.y + 1}`);
        }
      }
      return edges;
    }),
    // объекты для ластика вместе с занимаемыми клетками (по эффективному размеру)
    eraserObjects: lazy(() => {
      const out: { o: ObjectLayer; cells: { x: number; y: number }[] }[] = [];
      for (const o of relevantObjects()) {
        const tt = catalogMap[o.typeId];
        if (!tt) continue;
        const eff = getEffectiveSize(tt);
        out.push({ o, cells: getOccupiedCells(o.x, o.y, eff.w, eff.h, o.rotation) });
      }
      return out;
    }),
    hasFloorForWall: (x: number, y: number, orientation: 'horizontal' | 'vertical', level: number) => {
      const m = floorMaxLevel();
      const a = k2(x, y);
      const b = orientation === 'horizontal' ? k2(x, y - 1) : k2(x - 1, y);
      return (m.get(a) ?? -Infinity) >= level || (m.get(b) ?? -Infinity) >= level;
    },
  };
}

export type LayerIndex = ReturnType<typeof createLayerIndex>;
