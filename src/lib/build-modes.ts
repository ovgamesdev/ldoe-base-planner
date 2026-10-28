import type { Tool } from './constants'

// Режимы строительства. 'single' — прежнее поведение (клик = одно действие).
// line/rect/frame — «от точки до точки» (мышью: зажать и протянуть; на тач-экране: два касания).
// brush — зажать и вести по клеткам. fill — заливка области. outline — обвести стенами область пола.
export type BuildMode = 'single' | 'brush' | 'line' | 'rect' | 'frame' | 'fill' | 'outline';

export type BuildPoint = { x: number; y: number };
export type Orientation = 'horizontal' | 'vertical';
export type WallSeg = { x: number; y: number; orientation: Orientation };

// Какие режимы доступны инструменту. Для стен 'rect' — это контур (стены строятся по рёбрам клеток).
export const TOOL_MODES: Record<Tool, BuildMode[]> = {
  floor: ['single', 'brush', 'line', 'rect', 'frame', 'fill'],
  wall: ['single', 'line', 'rect', 'outline'],
  object: ['single', 'brush', 'line', 'rect', 'frame'],
  nobuild: ['single', 'brush', 'line', 'rect', 'frame', 'fill'],
  eraser: ['single', 'brush', 'line', 'rect'],
  hand: [],
};

// Режимы, которым нужны две точки (начало и конец).
export const isRangeMode = (mode: BuildMode) => mode === 'line' || mode === 'rect' || mode === 'frame';

const key = (x: number, y: number) => `${x},${y}`;

export const lineCells = (a: BuildPoint, b: BuildPoint): BuildPoint[] => {
  // Брезенхем: допускает диагонали.
  const cells: BuildPoint[] = [];
  let x = a.x, y = a.y;
  const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y);
  const sx = a.x < b.x ? 1 : -1, sy = a.y < b.y ? 1 : -1;
  let err = dx - dy;
  for (;;) {
    cells.push({ x, y });
    if (x === b.x && y === b.y) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
  return cells;
};

// Прямая строго по одной оси (по той, где дальше).
export const snapToAxis = (a: BuildPoint, b: BuildPoint): BuildPoint =>
  Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? { x: b.x, y: a.y } : { x: a.x, y: b.y };

export const rectCells = (a: BuildPoint, b: BuildPoint): BuildPoint[] => {
  const cells: BuildPoint[] = [];
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cells.push({ x, y });
  return cells;
};

export const frameCells = (a: BuildPoint, b: BuildPoint): BuildPoint[] => {
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  return rectCells(a, b).filter(c => c.x === x0 || c.x === x1 || c.y === y0 || c.y === y1);
};

// Размер кисти (сторона квадрата в клетках): пол, запретная зона и ластик.
export const BRUSH_SIZES = [1, 2, 3] as const;
export type BrushSize = (typeof BRUSH_SIZES)[number];

// Мазок из квадратов size×size вокруг каждой клетки: у 3×3 клетка в центре, у 2×2 она левая верхняя.
// Клетки соседних квадратов пересекаются, поэтому результат без повторов.
export const expandBrush = (points: BuildPoint[], size: number): BuildPoint[] => {
  if (size <= 1) return points;
  const from = -Math.floor((size - 1) / 2);
  const seen = new Set<string>();
  const out: BuildPoint[] = [];
  for (const p of points) {
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        const x = p.x + from + dx, y = p.y + from + dy;
        const k = key(x, y);
        if (!seen.has(k)) { seen.add(k); out.push({ x, y }); }
      }
    }
  }
  return out;
};

// Клетки для режимов «по клеткам». Для 'brush' передаётся уже собранный мазок; brushSize расширяет его.
export const cellsForMode = (mode: BuildMode, points: BuildPoint[], brushSize = 1): BuildPoint[] => {
  if (!points.length) return [];
  if (mode === 'brush') return expandBrush(points, brushSize);
  const a = points[0], b = points[points.length - 1];
  if (mode === 'line') return lineCells(a, b);
  if (mode === 'rect') return rectCells(a, b);
  if (mode === 'frame') return frameCells(a, b);
  return [a];
};

// Прямые отрезки на сетке вершин: {orientation, x, y, len}. horizontal идёт вправо от (x,y), vertical — вниз.
export type WallRun = { orientation: Orientation; x: number; y: number; len: number };

export const runsForLine = (a: BuildPoint, b: BuildPoint): WallRun[] => {
  const e = snapToAxis(a, b);
  if (e.x === a.x && e.y === a.y) return [];
  return e.y === a.y
    ? [{ orientation: 'horizontal', x: Math.min(a.x, e.x), y: a.y, len: Math.abs(e.x - a.x) }]
    : [{ orientation: 'vertical', x: a.x, y: Math.min(a.y, e.y), len: Math.abs(e.y - a.y) }];
};

export const runsForRect = (a: BuildPoint, b: BuildPoint): WallRun[] => {
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  const runs: WallRun[] = [];
  if (x1 > x0) {
    runs.push({ orientation: 'horizontal', x: x0, y: y0, len: x1 - x0 });
    if (y1 > y0) runs.push({ orientation: 'horizontal', x: x0, y: y1, len: x1 - x0 });
  }
  if (y1 > y0) {
    runs.push({ orientation: 'vertical', x: x0, y: y0, len: y1 - y0 });
    if (x1 > x0) runs.push({ orientation: 'vertical', x: x1, y: y0, len: y1 - y0 });
  }
  return runs;
};

export const runsForMode = (mode: BuildMode, points: BuildPoint[]): WallRun[] => {
  if (points.length < 1) return [];
  const a = points[0], b = points[points.length - 1];
  if (mode === 'line') return runsForLine(a, b);
  if (mode === 'rect' || mode === 'frame') return runsForRect(a, b);
  return [];
};

export const runSegments = (run: WallRun): WallSeg[] => {
  const segs: WallSeg[] = [];
  for (let i = 0; i < run.len; i++) {
    segs.push(run.orientation === 'horizontal'
      ? { x: run.x + i, y: run.y, orientation: 'horizontal' }
      : { x: run.x, y: run.y + i, orientation: 'vertical' });
  }
  return segs;
};

export const segKey = (s: WallSeg) => `${s.orientation === 'horizontal' ? 'h' : 'v'}${s.x},${s.y}`;

// Уникальные отрезки всех прогонов (углы прямоугольника не дублируются).
export const uniqueSegments = (runs: WallRun[]): WallSeg[] => {
  const seen = new Set<string>();
  const out: WallSeg[] = [];
  for (const run of runs) for (const s of runSegments(run)) {
    const k = segKey(s);
    if (!seen.has(k)) { seen.add(k); out.push(s); }
  }
  return out;
};

// Есть ли стена на ребре между соседними клетками (x1,y1) и (x2,y2).
const wallBetween = (walls: Set<string>, x1: number, y1: number, x2: number, y2: number) => {
  if (y1 === y2) return walls.has(`v${Math.max(x1, x2)},${y1}`);
  return walls.has(`h${x1},${Math.max(y1, y2)}`);
};

// Заливка области: клетки, достижимые от start через passable, не пересекая стены.
export const floodFill = (
  start: BuildPoint,
  width: number,
  height: number,
  passable: (x: number, y: number) => boolean,
  wallKeys: Set<string>,
  stopAtWalls = true,
): BuildPoint[] => {
  if (start.x < 0 || start.y < 0 || start.x >= width || start.y >= height || !passable(start.x, start.y)) return [];
  const seen = new Set<string>([key(start.x, start.y)]);
  const queue: BuildPoint[] = [start];
  const out: BuildPoint[] = [];
  while (queue.length) {
    const c = queue.pop()!;
    out.push(c);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = c.x + dx, ny = c.y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const k = key(nx, ny);
      if (seen.has(k) || !passable(nx, ny)) continue;
      if (stopAtWalls && wallBetween(wallKeys, c.x, c.y, nx, ny)) continue;
      seen.add(k);
      queue.push({ x: nx, y: ny });
    }
  }
  return out;
};

// Граница набора клеток: рёбра между клеткой набора и клеткой вне набора.
export const boundarySegments = (cells: BuildPoint[]): WallSeg[] => {
  const set = new Set(cells.map(c => key(c.x, c.y)));
  const segs: WallSeg[] = [];
  for (const { x, y } of cells) {
    if (!set.has(key(x, y - 1))) segs.push({ x, y, orientation: 'horizontal' });
    if (!set.has(key(x, y + 1))) segs.push({ x, y: y + 1, orientation: 'horizontal' });
    if (!set.has(key(x - 1, y))) segs.push({ x, y, orientation: 'vertical' });
    if (!set.has(key(x + 1, y))) segs.push({ x: x + 1, y, orientation: 'vertical' });
  }
  return segs;
};

// Подпись размера при протяжке линии/прямоугольника/рамки. x, y — центр фигуры в координатах сетки
// (для клеток — центр охватывающего прямоугольника, для вершин — середина отрезка/контура).
// Клетки: «5×3» — размер охватывающего прямоугольника в клетках (у линии одно из чисел 1).
// Вершины (стены, декор): у линии — длина в рёбрах («5»), у контура — «5×3» в клетках.
// Для одной клетки/точки подписи нет.
export type SizeLabel = { text: string; x: number; y: number };

export const sizeLabel = (mode: BuildMode, kind: 'cell' | 'vertex', a: BuildPoint, b: BuildPoint): SizeLabel | null => {
  if (!isRangeMode(mode)) return null;
  if (kind === 'vertex') {
    if (mode === 'line') {
      const e = snapToAxis(a, b);
      const len = Math.abs(e.x - a.x) + Math.abs(e.y - a.y);
      return len > 0 ? { text: `${len}`, x: (a.x + e.x) / 2, y: (a.y + e.y) / 2 } : null;
    }
    const w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
    if (!w && !h) return null;
    return { text: w && h ? `${w}×${h}` : `${w || h}`, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  const w = Math.abs(b.x - a.x) + 1, h = Math.abs(b.y - a.y) + 1;
  if (w === 1 && h === 1) return null;
  return { text: `${w}×${h}`, x: (a.x + b.x) / 2 + 0.5, y: (a.y + b.y) / 2 + 0.5 };
};

// Позиции для плитки размером fw×fh: заполнение прямоугольника / по контуру / вдоль линии.
// Берутся только плитки, целиком попадающие в область.
export const tilePositions = (mode: BuildMode, a: BuildPoint, b: BuildPoint, fw: number, fh: number): BuildPoint[] => {
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  const out: BuildPoint[] = [];
  const seen = new Set<string>();
  const add = (x: number, y: number) => {
    const k = key(x, y);
    if (!seen.has(k)) { seen.add(k); out.push({ x, y }); }
  };

  if (mode === 'rect') {
    for (let y = y0; y + fh - 1 <= y1; y += fh) for (let x = x0; x + fw - 1 <= x1; x += fw) add(x, y);
  } else if (mode === 'frame') {
    if (y1 - y0 + 1 < fh || x1 - x0 + 1 < fw) return out;
    for (let x = x0; x + fw - 1 <= x1; x += fw) { add(x, y0); add(x, y1 - fh + 1); }
    for (let y = y0; y + fh - 1 <= y1; y += fh) { add(x0, y); add(x1 - fw + 1, y); }
  } else if (mode === 'line') {
    const e = snapToAxis(a, b);
    if (e.y === a.y) {
      const dir = e.x >= a.x ? 1 : -1;
      for (let k = 0; k * fw <= Math.abs(e.x - a.x); k++) add(a.x + dir * k * fw - (dir < 0 ? fw - 1 : 0), a.y);
    } else {
      const dir = e.y >= a.y ? 1 : -1;
      for (let k = 0; k * fh <= Math.abs(e.y - a.y); k++) add(a.x, a.y + dir * k * fh - (dir < 0 ? fh - 1 : 0));
    }
  } else {
    add(a.x, a.y);
  }
  return out;
};
