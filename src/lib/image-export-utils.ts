import type { ViewMode } from './constants'
import { getEffectiveSize, getFinalSize, getTopVertex } from './grid-utils'
import type { BaseData, CatalogItem, ObjectLayer } from './initial-data'

// ---------------------------------------------------------------------------
// Помощники для экспорта базы в картинку ("Поделиться как картинкой").
//
// Идея: вместо рендера всей сетки (в которой реальная застройка может занимать
// маленький кусочек посередине, а всё остальное — пустая трава) считаем
// "содержательные" границы базы (по полам/стенам/объектам, с отступом в
// EXPORT_PADDING_CELLS клеток) и рендерим только их. Экспорт переиспользует
// те же React-компоненты (GridCells/GridObjects/GridWalls), что и основной
// редактор, поэтому картинка всегда выглядит так же, как в приложении.
// ---------------------------------------------------------------------------

export interface CellBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface PixelBounds {
  minSx: number;
  maxSx: number;
  minSy: number;
  maxSy: number;
}

const EXPORT_PADDING_CELLS = 1;

/**
 * Границы (в индексах клеток, инклюзивно), реально занятые содержимым базы —
 * полами, стенами и объектами (с учётом их фактического размера/поворота), плюс
 * отступ в EXPORT_PADDING_CELLS клеток по periметру. Если база пуста, возвращает
 * границы всей сетки (как в обычном редакторе — с рамкой в 1 клетку вокруг).
 */
/** Границы (в индексах клеток) для всей сетки целиком — как в обычном редакторе (рамка в 1 клетку по периметру). */
export const getFullGridCellBounds = (gridW: number, gridH: number): CellBounds => ({
  minX: -1,
  minY: -1,
  maxX: gridW,
  maxY: gridH,
});

export const getContentCellBounds = (
  base: BaseData,
  catalogMap: Record<string, CatalogItem>,
  gridW: number,
  gridH: number
): CellBounds => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  const extend = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };

  base.layers.floors.forEach(f => extend(f.x, f.y));

  base.layers.walls.forEach(w => {
    extend(w.x, w.y);
    // Стена — это отрезок между двумя соседними клетками; берём приблизительно
    // (без пиксельной точности, запас по краю всё равно добавляется ниже).
    if (w.orientation === 'horizontal') extend(w.x, w.y - 1);
    else extend(w.x - 1, w.y);
  });

  base.layers.objects.forEach(obj => {
    const template = catalogMap[obj.typeId];
    if (!template) { extend(obj.x, obj.y); return; }
    const effSize = getEffectiveSize(template);
    const { w: fw, h: fh } = getFinalSize(effSize.w, effSize.h, obj.rotation);
    extend(obj.x, obj.y);
    extend(obj.x + Math.max(fw, 1) - 1, obj.y + Math.max(fh, 1) - 1);
  });

  if (!isFinite(minX)) {
    // Пустая база — берём всю сетку целиком, как в обычном редакторе (рамка в 1 клетку).
    return getFullGridCellBounds(gridW, gridH);
  }

  return {
    minX: Math.max(minX - EXPORT_PADDING_CELLS, -1),
    minY: Math.max(minY - EXPORT_PADDING_CELLS, -1),
    maxX: Math.min(maxX + EXPORT_PADDING_CELLS, gridW),
    maxY: Math.min(maxY + EXPORT_PADDING_CELLS, gridH),
  };
};

/** Список клеток внутри границ, отсортированный так же, как в основном редакторе (для правильного наложения при отрисовке). */
export const buildCellsInBounds = (bounds: CellBounds, viewMode: ViewMode): { x: number; y: number }[] => {
  const cells: { x: number; y: number }[] = [];
  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) cells.push({ x, y });
  }
  return cells.sort((a, b) => {
    if (viewMode === 'isometric') return (a.y - a.x) - (b.y - b.x);
    return (a.x + a.y) - (b.x + b.y);
  });
};

/** Список линий стен внутри границ (пересечение с реальной сеткой стен 0..gridW/0..gridH). */
export const buildWallLinesInBounds = (
  bounds: CellBounds,
  gridW: number,
  gridH: number
): { x: number; y: number; orientation: 'horizontal' | 'vertical' }[] => {
  const lines: { x: number; y: number; orientation: 'horizontal' | 'vertical' }[] = [];

  const hX0 = Math.max(bounds.minX, 0), hX1 = Math.min(bounds.maxX, gridW - 1);
  const hY0 = Math.max(bounds.minY, 0), hY1 = Math.min(bounds.maxY, gridH);
  for (let y = hY0; y <= hY1; y++) {
    for (let x = hX0; x <= hX1; x++) lines.push({ x, y, orientation: 'horizontal' });
  }

  const vX0 = Math.max(bounds.minX, 0), vX1 = Math.min(bounds.maxX, gridW);
  const vY0 = Math.max(bounds.minY, 0), vY1 = Math.min(bounds.maxY, gridH - 1);
  for (let x = vX0; x <= vX1; x++) {
    for (let y = vY0; y <= vY1; y++) lines.push({ x, y, orientation: 'vertical' });
  }

  return lines;
};

/** Те же приоритеты отрисовки объектов, что и в основном редакторе (лес/стены поверх пола, ближе — выше). */
export const buildSortedRootObjects = (
  objects: ObjectLayer[],
  catalogMap: Record<string, CatalogItem>
): { obj: ObjectLayer; template: CatalogItem }[] => {
  const getRenderPriority = (item: { obj: ObjectLayer; template: CatalogItem }) => {
    const { template } = item;
    if (template.constraints.placementType === 'wall') return 3;
    if (template.constraints.requiresPower || template.constraints.requiresWater) return 2;
    if (template.constraints.placementType === 'floor' || template.constraints.placementType === 'any') return 1;
    return 0;
  };

  return objects
    .map(obj => ({ obj, template: catalogMap[obj.typeId] }))
    .filter((o): o is { obj: ObjectLayer; template: CatalogItem } => !!o.template)
    .sort((a, b) => {
      const priorityA = getRenderPriority(a);
      const priorityB = getRenderPriority(b);
      if (priorityA !== priorityB) return priorityA - priorityB;
      return (a.obj.x + a.obj.y) - (b.obj.x + b.obj.y);
    });
};

/**
 * Пиксельная (экранная, в локальных координатах SVG) bounding box для границ
 * `bounds`, вычисленная через те же getTopVertex, что и сам рендер — поэтому
 * всегда точно совпадает с тем, что реально нарисуется.
 * gridW здесь — ширина ПОЛНОЙ сетки базы (а не обрезанной области), так как
 * getTopVertex использует её для изометрического сдвига.
 */
export const getPixelBoundsForCellBounds = (bounds: CellBounds, viewMode: ViewMode, gridW: number): PixelBounds => {
  const corners = [
    getTopVertex(bounds.minX, bounds.minY, viewMode, gridW),
    getTopVertex(bounds.maxX + 1, bounds.minY, viewMode, gridW),
    getTopVertex(bounds.maxX + 1, bounds.maxY + 1, viewMode, gridW),
    getTopVertex(bounds.minX, bounds.maxY + 1, viewMode, gridW),
  ];
  return {
    minSx: Math.min(...corners.map(c => c.sx)),
    maxSx: Math.max(...corners.map(c => c.sx)),
    minSy: Math.min(...corners.map(c => c.sy)),
    maxSy: Math.max(...corners.map(c => c.sy)),
  };
};

/** Безопасное имя файла из названия карты. */
export const buildExportFileName = (mapName: string, baseLabel: string, ext: string): string => {
  const safe = mapName.trim().replace(/\s+/g, '_').replace(/[^\p{L}\p{N}_-]/gu, '') || 'base';
  return `ldoe_${safe}_${baseLabel}.${ext}`;
};

const XLINK_NS = 'http://www.w3.org/1999/xlink';

/** Скачивает ресурс и превращает его в data: URI (base64). */
const fetchAsDataUri = async (url: string): Promise<string> => {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`fetch-failed:${res.status}:${url}`);
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('file-read-failed'));
    reader.readAsDataURL(blob);
  });
};

/**
 * Клонирует SVG и заменяет все внешние `<image href="...">` (в т.ч. те, что
 * лежат внутри `<pattern>` — текстуры полов) на встроенные data: URI.
 *
 * Это обязательный шаг перед растеризацией: когда SVG используется как
 * источник для `<img>`/canvas ("SVG as image"), браузер не подгружает
 * внешние ресурсы, на которые ссылаются вложенные `<image>` — это ограничение
 * безопасности, а не баг конкретного экспорта. Поэтому заливка и обводка
 * (обычные SVG-фигуры) рисуются нормально, а текстуры полов и иконки
 * объектов — нет, хотя сам PNG при этом успешно генерируется без ошибки.
 *
 * `cache` передаётся снаружи и переиспользуется между вызовами (пока открыта
 * модалка экспорта), чтобы не перекачивать одни и те же иконки заново при
 * каждой перегенерации превью (смена масштаба/фона и т.п.) — на одной базе
 * один и тот же ассет обычно встречается десятки раз.
 */
export const embedSvgImagesAsDataUris = async (
  svgEl: SVGSVGElement,
  cache: Map<string, string>
): Promise<SVGSVGElement> => {
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  const imageEls = Array.from(clone.querySelectorAll('image'));

  const getHref = (el: SVGImageElement) => el.getAttribute('href') || el.getAttributeNS(XLINK_NS, 'href');

  const srcs = Array.from(new Set(
    imageEls
      .map(getHref)
      .filter((src): src is string => !!src && !src.startsWith('data:'))
  ));

  await Promise.all(srcs.map(async src => {
    if (cache.has(src)) return;
    try {
      cache.set(src, await fetchAsDataUri(src));
    } catch (err) {
      // Не валим весь экспорт из-за одной картинки — она просто не отрисуется,
      // остальное (заливки, стены, прочие объекты) всё равно попадёт в PNG.
      console.error('Не удалось встроить изображение для экспорта базы:', src, err);
    }
  }));

  imageEls.forEach(el => {
    const src = getHref(el);
    const dataUri = src ? cache.get(src) : undefined;
    if (dataUri) {
      el.setAttribute('href', dataUri);
      el.removeAttributeNS(XLINK_NS, 'href');
    }
  });

  return clone;
};