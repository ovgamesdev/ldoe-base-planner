import type { BuildPoint } from '@/lib/build-modes'
import type { ViewMode } from '@/lib/constants'
import { diamondPoints, footprintPoints, getTopVertex } from '@/lib/grid-utils'
import type { BuildPreviewStore } from '@/lib/build-preview-store'
import type { BuildPreview } from '@/lib/useBuildTools'
import { memo, useMemo, useSyncExternalStore } from 'react'

const COLORS = {
  add: { fill: 'rgba(250, 204, 21, 0.45)', stroke: '#facc15' },
  box: { fill: 'rgba(34, 197, 94, 0.45)', stroke: '#22c55e' },
  bad: { fill: 'rgba(239, 68, 68, 0.5)', stroke: '#ef4444' },
};

const LABEL_PX = 14; // высота шрифта подписи размера на экране, px

// Предпросмотр массового действия + маркер первой точки. Не перехватывает мышь.
export const BuildPreviewOverlay = memo(function BuildPreviewOverlay({
  preview, anchor, kind, viewMode, gridW, scale,
}: {
  preview: BuildPreview | null;
  anchor: BuildPoint | null;
  kind: 'cell' | 'vertex';
  viewMode: ViewMode;
  gridW: number;
  scale: number; // реальный масштаб svg на экране: зум × вписывание svg в блок раскладки
}) {
  const removing = preview?.tone === 'remove';
  return (
    <g style={{ pointerEvents: 'none' }}>
      {preview?.cells.map(c => {
        const col = c.ok && !removing ? COLORS.add : COLORS.bad;
        return <polygon key={`pc-${c.x}-${c.y}`} points={diamondPoints(c.x, c.y, viewMode, gridW)} fill={col.fill} stroke={col.stroke} strokeWidth={1} />;
      })}
      {preview?.boxes.map(b => {
        const col = b.ok ? COLORS.box : COLORS.bad;
        return <polygon key={`pb-${b.x}-${b.y}`} points={footprintPoints(b.x, b.y, b.w, b.h, viewMode, gridW)} fill={col.fill} stroke={col.stroke} strokeWidth={2} />;
      })}
      {preview?.segs.map(s => {
        const a = getTopVertex(s.x, s.y, viewMode, gridW);
        const e = s.orientation === 'horizontal' ? getTopVertex(s.x + 1, s.y, viewMode, gridW) : getTopVertex(s.x, s.y + 1, viewMode, gridW);
        const col = s.ok && !removing ? COLORS.add : COLORS.bad;
        return (
          <line key={`ps-${s.orientation}-${s.x}-${s.y}`} x1={a.sx} y1={a.sy} x2={e.sx} y2={e.sy}
            stroke={col.stroke} strokeWidth={7} strokeOpacity={0.85} strokeLinecap="round"
            strokeDasharray={removing ? '6 4' : undefined} />
        );
      })}
      {anchor && (kind === 'vertex'
        ? (() => { const v = getTopVertex(anchor.x, anchor.y, viewMode, gridW); return <circle cx={v.sx} cy={v.sy} r={7} fill="#facc15" stroke="#171717" strokeWidth={2} />; })()
        : <polygon points={diamondPoints(anchor.x, anchor.y, viewMode, gridW)} fill="none" stroke="#facc15" strokeWidth={3} />)}
      {preview?.label && (() => {
        const { text, x, y } = preview.label;
        const c = getTopVertex(x, y, viewMode, gridW);
        // Размер плашки постоянный на экране (не зависит ни от зума, ни от сжатия svg раскладкой); в виде сверху под 45° текст возвращаем в горизонталь.
        const fs = LABEL_PX / Math.max(scale, 0.05);
        const w = (text.length * 0.62 + 1.6) * fs, h = fs * 1.8;
        return (
          <g transform={viewMode === 'topDown45' ? `rotate(45 ${c.sx} ${c.sy})` : undefined}>
            <rect x={c.sx - w / 2} y={c.sy - h / 2} width={w} height={h} rx={h / 2} fill="rgba(23,23,23,0.92)" stroke="#facc15" strokeWidth={2 / Math.max(scale, 0.05)} />
            <text x={c.sx} y={c.sy} fill="#ffffff" fontSize={fs} fontWeight="bold" textAnchor="middle" dominantBaseline="central">{text}</text>
          </g>
        );
      })()}
    </g>
  );
});

// Слой предпросмотра, подписанный на хранилище жеста: на каждую новую клетку под кистью/курсором
// перерисовывается только он, а не MainPlannerClient и не вся карта.
export const BuildPreviewLayer = memo(function BuildPreviewLayer({
  store, kind, viewMode, gridW, scale,
}: {
  store: BuildPreviewStore;
  kind: 'cell' | 'vertex';
  viewMode: ViewMode;
  gridW: number;
  scale: number;
}) {
  const { preview, anchor } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  return <BuildPreviewOverlay preview={preview} anchor={anchor} kind={kind} viewMode={viewMode} gridW={gridW} scale={scale} />;
});

// Точки сетки (углы клеток) — видимые ориентиры для режимов «линия/контур» у стен и декора на стенах.
// Не перехватывают мышь: вершина выбирается по ближайшей к курсору (vertexAtClient в CanvasGrid).
// Все точки рисуются одним <path>: каждая вершина — нулевой отрезок с круглым окончанием, так что
// в DOM один узел вместо (W+1)·(H+1) кружков.
export const GridVertices = memo(function GridVertices({
  gridW, gridH, viewMode,
}: {
  gridW: number;
  gridH: number;
  viewMode: ViewMode;
}) {
  const d = useMemo(() => {
    const parts: string[] = [];
    for (let y = 0; y <= gridH; y++) {
      for (let x = 0; x <= gridW; x++) {
        const v = getTopVertex(x, y, viewMode, gridW);
        parts.push(`M${v.sx} ${v.sy}h0`);
      }
    }
    return parts.join('');
  }, [gridW, gridH, viewMode]);
  return <path d={d} stroke="rgba(255,255,255,0.45)" strokeWidth={6} strokeLinecap="round" fill="none" style={{ pointerEvents: 'none' }} />;
});
