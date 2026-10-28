import type { BrushSize, BuildMode } from '@/lib/build-modes'
import { BRUSH_SIZES } from '@/lib/build-modes'
import type { Tool } from '@/lib/constants'
import type { EraserScope } from '@/lib/useBuildTools'
import type { TranslationKey } from '@/context/LanguageContext'
import { memo } from 'react'

const MODE_ICON: Record<BuildMode, string> = {
  single: '•', brush: '🖌️', line: '╱', rect: '▰', frame: '▭', fill: '🪣', outline: '⬚',
};

const SCOPES: { id: EraserScope; label: TranslationKey }[] = [
  { id: 'all', label: 'scopeAll' },
  { id: 'objects', label: 'scopeObjects' },
  { id: 'floors', label: 'scopeFloors' },
  { id: 'walls', label: 'scopeWalls' },
];

const modeLabel = (tool: Tool, mode: BuildMode, isDecor: boolean): TranslationKey => {
  if (mode === 'rect' && (tool === 'wall' || isDecor)) return 'modeRectWall';
  if (mode === 'rect' && tool === 'object') return 'modeRectObject';
  const map: Record<BuildMode, TranslationKey> = {
    single: 'modeSingle', brush: 'modeBrush', line: 'modeLine', rect: 'modeRect',
    frame: 'modeFrame', fill: 'modeFill', outline: 'modeOutline',
  };
  return map[mode];
};

const hintKey = (tool: Tool, mode: BuildMode, isDecor: boolean): TranslationKey | null => {
  if (mode === 'single') return null;
  const vertex = (tool === 'wall' || isDecor) && (mode === 'line' || mode === 'rect');
  if (mode === 'brush') return 'hintBrush';
  if (mode === 'fill') return 'hintFill';
  if (mode === 'outline') return 'hintOutline';
  if (mode === 'line') return vertex ? 'hintLineVertex' : 'hintLine';
  if (mode === 'frame') return 'hintFrame';
  if (tool === 'wall' || isDecor) return 'hintRectWall';
  if (tool === 'object') return 'hintRectObject';
  if (tool === 'eraser') return 'hintRectEraser';
  return 'hintRect';
};

export const BuildModeBar = memo(function BuildModeBar({
  tool, modes, mode, isDecor, eraserScope, brushSize, showBrushSize, canUndo, canRedo, undoLabel, redoLabel, t, onSetMode, onSetEraserScope, onSetBrushSize, onUndo, onRedo,
}: {
  tool: Tool;
  modes: BuildMode[];
  mode: BuildMode;
  isDecor: boolean;
  eraserScope: EraserScope;
  brushSize: BrushSize;
  showBrushSize: boolean;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel?: string | null; // что откатится («Пол (12)»)
  redoLabel?: string | null;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  onSetMode: (m: BuildMode) => void;
  onSetEraserScope: (s: EraserScope) => void;
  onSetBrushSize: (s: BrushSize) => void;
  onUndo: () => void;
  onRedo: () => void;
}) {
  // В режиме «Рука» и у инструментов без выбора режима панели режимов нет, но откат и возврат остаются.
  const showModes = tool !== 'hand' && modes.length >= 2;
  if (!showModes && !canUndo && !canRedo) return null;
  const hk = showModes ? hintKey(tool, mode, isDecor) : null;
  const btn = (on: boolean) => `px-2.5 py-1.5 rounded text-xs font-medium flex items-center gap-1 whitespace-nowrap transition cursor-pointer ${on ? 'bg-amber-500 text-neutral-950 font-bold' : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300'}`;

  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 max-w-[calc(100%-1.5rem)] flex flex-col items-center gap-1.5 pointer-events-none">
      {hk && (
        <div className="bg-neutral-900/90 backdrop-blur border border-neutral-700/80 text-neutral-300 text-[11px] px-3 py-1 rounded-lg shadow-lg text-center">
          {t(hk)}
        </div>
      )}
      <div className="pointer-events-auto bg-neutral-900/90 backdrop-blur border border-neutral-700/80 rounded-xl shadow-xl p-1.5 flex flex-wrap items-center justify-center gap-1">
        {showModes && modes.map(m => (
          <button key={m} onClick={() => onSetMode(m)} className={btn(mode === m)} title={t(modeLabel(tool, m, isDecor))}>
            <span>{MODE_ICON[m]}</span>
            <span>{t(modeLabel(tool, m, isDecor))}</span>
          </button>
        ))}
        {showModes && showBrushSize && (
          <>
            <span className="w-px h-6 bg-neutral-700 mx-1" />
            <span className="text-[10px] uppercase text-neutral-500 px-1">{t('brushSize')}</span>
            {BRUSH_SIZES.map(n => (
              <button key={n} onClick={() => onSetBrushSize(n)} className={btn(brushSize === n)}>{n}×{n}</button>
            ))}
          </>
        )}
        {showModes && tool === 'eraser' && mode !== 'single' && (
          <>
            <span className="w-px h-6 bg-neutral-700 mx-1" />
            <span className="text-[10px] uppercase text-neutral-500 px-1">{t('eraserScope')}</span>
            {SCOPES.map(s => (
              <button key={s.id} onClick={() => onSetEraserScope(s.id)} className={btn(eraserScope === s.id)}>{t(s.label)}</button>
            ))}
          </>
        )}
        {(canUndo || canRedo) && (
          <>
            {showModes && <span className="w-px h-6 bg-neutral-700 mx-1" />}
            <button onClick={onUndo} disabled={!canUndo} className={`${btn(false)} disabled:opacity-40 disabled:cursor-default disabled:hover:bg-neutral-800`} title={undoLabel ? t('undoWithTitle', { label: undoLabel }) : t('undoBulkTitle')}>↩ {t('undoBulk')}</button>
            <button onClick={onRedo} disabled={!canRedo} className={`${btn(false)} disabled:opacity-40 disabled:cursor-default disabled:hover:bg-neutral-800`} title={redoLabel ? t('redoWithTitle', { label: redoLabel }) : t('redoBulkTitle')}>↪ {t('redoBulk')}</button>
          </>
        )}
      </div>
    </div>
  );
});
