import type { BuildPoint } from './build-modes'
import { CELL_SIZE, ISO_H, ISO_W } from './constants'
import type { ViewMode } from './constants'

// Перевод точки касания в клетку / вершину сетки. Чистая математика, без DOM:
// не зависит от вида (2D, 2D 45°, изометрия), зума и от того, что лежит под пальцем
// (объекты и стены не «перехватывают» касание, как перехватили бы события SVG).

export interface Viewport {
  // центр <svg> на экране (центр его getBoundingClientRect: от смещения, зума, поворота и раскладки не зависит)
  cx: number;
  cy: number;
  // зум, применённый к svg (CanvasGrid.localTransformRef.z)
  zoom: number;
  // размеры содержимого svg (его viewBox)
  svgW: number;
  svgH: number;
  // реальный размер блока <svg> в раскладке до transform. Во flex-контейнере браузер может сжать svg
  // уже самой раскладкой, тогда содержимое вписывается в блок (preserveAspectRatio), и масштаб не равен 1.
  layoutW?: number;
  layoutH?: number;
}

// Экран → координаты SVG. Обратно к `scale(zoom) [rotate(-45deg)]` вокруг центра svg плюс вписывание viewBox в блок.
export function clientToSvg(clientX: number, clientY: number, v: Viewport, viewMode: ViewMode): { sx: number; sy: number } {
  const fit = Math.min((v.layoutW ?? v.svgW) / v.svgW, (v.layoutH ?? v.svgH) / v.svgH);
  const k = v.zoom * fit;
  let dx = (clientX - v.cx) / k;
  let dy = (clientY - v.cy) / k;
  if (viewMode === 'topDown45') {
    // обратный поворот: +45°
    const c = Math.SQRT1_2;
    [dx, dy] = [dx * c - dy * c, dx * c + dy * c];
  }
  return { sx: dx + v.svgW / 2, sy: dy + v.svgH / 2 };
}

// Координаты SVG → дробные координаты сетки (целые значения — вершины клеток).
// Обратно к getTopVertex из grid-utils.
export function svgToGrid(sx: number, sy: number, viewMode: ViewMode, gridW: number): { gx: number; gy: number } {
  if (viewMode === 'isometric') {
    const u = (sx - ISO_W / 2) / (ISO_W / 2);   // = x + y
    const w = (sy - ISO_H / 2) / (ISO_H / 2);   // = gridW - x + y
    return { gx: (u - w + gridW) / 2, gy: (u + w - gridW) / 2 };
  }
  return { gx: (sx - CELL_SIZE) / CELL_SIZE, gy: (sy - CELL_SIZE) / CELL_SIZE };
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// Клетка под пальцем. Диапазон как у allCells: от -1 до размера карты включительно.
export function cellAtClient(clientX: number, clientY: number, v: Viewport, viewMode: ViewMode, gridW: number, gridH: number): BuildPoint {
  const { sx, sy } = clientToSvg(clientX, clientY, v, viewMode);
  const { gx, gy } = svgToGrid(sx, sy, viewMode, gridW);
  return { x: clamp(Math.floor(gx), -1, gridW), y: clamp(Math.floor(gy), -1, gridH) };
}

// Обратно к svgToGrid: вершина сетки → координаты SVG (то же, что getTopVertex в grid-utils).
function gridToSvg(x: number, y: number, viewMode: ViewMode, gridW: number): { sx: number; sy: number } {
  if (viewMode === 'isometric') {
    return { sx: (x + y) * (ISO_W / 2) + ISO_W / 2, sy: ((gridW - x) + y) * (ISO_H / 2) + ISO_H / 2 };
  }
  return { sx: x * CELL_SIZE + CELL_SIZE, sy: y * CELL_SIZE + CELL_SIZE };
}

// Ближайшая к точке вершина сетки («магнит» без радиуса: наводить прямо на точку не нужно, и пальцем, и мышью).
// В 2D ближайшая вершина — просто округление. В изометрии клетка — ромб, и «ближайшая по сетке» не всегда
// ближайшая на экране, поэтому сравниваем расстояние до четырёх углов клетки, в которую попала точка.
export function vertexAtClient(clientX: number, clientY: number, v: Viewport, viewMode: ViewMode, gridW: number, gridH: number): BuildPoint {
  const { sx, sy } = clientToSvg(clientX, clientY, v, viewMode);
  const { gx, gy } = svgToGrid(sx, sy, viewMode, gridW);
  if (viewMode !== 'isometric') {
    return { x: clamp(Math.round(gx), 0, gridW), y: clamp(Math.round(gy), 0, gridH) };
  }
  const fx = Math.floor(gx), fy = Math.floor(gy);
  let best: BuildPoint = { x: clamp(Math.round(gx), 0, gridW), y: clamp(Math.round(gy), 0, gridH) };
  let bestD = Infinity;
  for (const cx of [fx, fx + 1]) {
    for (const cy of [fy, fy + 1]) {
      const x = clamp(cx, 0, gridW), y = clamp(cy, 0, gridH);
      const p = gridToSvg(x, y, viewMode, gridW);
      const d = (p.sx - sx) ** 2 + (p.sy - sy) ** 2;
      if (d < bestD) { bestD = d; best = { x, y }; }
    }
  }
  return best;
}

// Порог «это уже движение, а не касание» в пикселях экрана.
export const TOUCH_SLOP = 8;
