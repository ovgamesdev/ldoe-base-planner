import type { BrushSize, BuildMode } from '@/lib/build-modes'
import { BRUSH_SIZES } from '@/lib/build-modes'
import type { Tool } from '@/lib/constants'
import type { EraserScope } from '@/lib/useBuildTools'
import type { TranslationKey } from '@/context/LanguageContext'
import { memo, useEffect, useRef, useState, type ReactNode } from 'react'

// Раскладка панели не должна зависеть от содержимого, иначе она «прыгает»:
//  - ширина фиксирована (на весь экран, но не шире MAX), кнопки режимов делят её поровну;
//  - ряд режимов не переносится (на узком экране прокручивается), активная кнопка не меняет вес шрифта;
//  - «Отменить/Вернуть» всегда на месте и просто гаснут, а не появляются;
//  - доп. опции (размер кисти, что стирать) и подсказка лежат ВЫШЕ ряда режимов: панель прижата к низу,
//    поэтому ряд, по которому тыкает палец, остаётся на одном месте при любых переключениях.

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

// Иконки в одном стиле вместо эмодзи: эмодзи рисуются разными шрифтами и меняют высоту кнопок.
const ICON_PATHS: Record<BuildMode | 'undo' | 'redo', ReactNode> = {
  single: <rect x="7" y="7" width="6" height="6" rx="1" fill="currentColor" stroke="none" />,
  brush: (
    <>
      <path d="M13.5 3.5 8 9" />
      <path d="M8 9c-1.7-.4-3 .8-3 2.2 0 1-.6 1.8-1.5 2.3 3 .7 6-.3 6-3" />
      <path d="M13.5 3.5a1 1 0 0 1 0 1.4L9.5 8.5" />
    </>
  ),
  line: <path d="M4 16 16 4" />,
  rect: <rect x="3.5" y="5.5" width="13" height="9" rx="1" fill="currentColor" stroke="none" />,
  frame: <rect x="3.5" y="5.5" width="13" height="9" rx="1" />,
  fill: (
    <>
      <path d="m4 10 5.5-5.5 6 6L10 16a1.4 1.4 0 0 1-2 0L4 12a1.4 1.4 0 0 1 0-2Z" />
      <path d="M17 13.5s1.5 1.7 1.5 2.7a1.5 1.5 0 0 1-3 0c0-1 1.5-2.7 1.5-2.7Z" fill="currentColor" />
    </>
  ),
  outline: <rect x="3.5" y="3.5" width="13" height="13" rx="1" strokeDasharray="2.5 2" />,
  undo: <path d="M7 4 3.5 7.5 7 11M4 7.5h7a4.5 4.5 0 0 1 0 9H8" />,
  redo: <path d="M13 4l3.5 3.5L13 11M16 7.5H9a4.5 4.5 0 0 0 0 9h3" />,
};

function Icon({ name }: { name: BuildMode | 'undo' | 'redo' }) {
  return (
    <svg
      viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

const BASE = 'h-10 sm:h-9 rounded-md text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap select-none touch-manipulation cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-amber-400';
const ON = 'bg-amber-500 text-neutral-950';
const OFF = 'bg-neutral-800/80 text-neutral-300 hover:bg-neutral-700';
const DISABLED = 'disabled:opacity-35 disabled:cursor-default disabled:hover:bg-neutral-800/80';
const NO_SCROLLBAR = '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

// Ряд опций сворачивается плавно (grid-rows 0fr→1fr) и всегда смонтирован: ничего не появляется «из пустоты».
function OptionRow({ open, label, children }: { open: boolean; label: string; children: ReactNode }) {
  return (
    <div
      className={`grid transition-[grid-template-rows,opacity] duration-150 ease-out ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
      aria-hidden={!open}
      inert={!open}
    >
      <div className="min-h-0 overflow-hidden">
        <div className="flex items-center gap-2 pb-1.5">
          <span className="shrink-0 pl-1 text-[10px] uppercase tracking-wide text-neutral-500">{label}</span>
          <div className={`flex flex-1 min-w-0 gap-1 overflow-x-auto ${NO_SCROLLBAR}`}>{children}</div>
        </div>
      </div>
    </div>
  );
}

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
  const visible = showModes || canUndo || canRedo;
  const hk = showModes ? hintKey(tool, mode, isDecor) : null;
  const showScope = showModes && tool === 'eraser' && mode !== 'single';
  const showSize = showModes && showBrushSize;

  // Подсказка не исчезает мгновенно, а гаснет с прежним текстом (иначе при смене режима она «мигает» и меняет высоту).
  const [lastHint, setLastHint] = useState<TranslationKey | null>(hk);
  if (hk && hk !== lastHint) setLastHint(hk);
  const hintText = hk ?? lastHint;
  const modeName = showModes ? t(modeLabel(tool, mode, isDecor)) : '';

  // Если режимы не влезают (узкий экран), держим активный по центру ряда.
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = rowRef.current;
    if (!row || row.scrollWidth <= row.clientWidth) return;
    const el = row.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!el) return;
    row.scrollTo({ left: el.offsetLeft - (row.clientWidth - el.offsetWidth) / 2, behavior: 'smooth' });
  }, [mode, tool, modes]);

  if (!visible) return null;

  return (
    <div className="absolute inset-x-0 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-20 flex justify-center px-2 pointer-events-none">
      <div className="w-full max-w-[42rem] flex flex-col gap-1.5">
        {/* Подсказка: на узком экране кнопки без подписей, поэтому имя режима пишем здесь. */}
        {showModes && (
          <div
            aria-live="polite"
            className={`self-center max-w-full min-h-8 flex items-center bg-neutral-900/90 backdrop-blur border border-neutral-700/80 text-neutral-300 text-[11px] leading-4 px-3 py-1 rounded-lg shadow-lg text-center transition-opacity duration-150 ${hk ? 'opacity-100' : 'opacity-0 max-sm:opacity-100'}`}
          >
            <span>
              <b className="sm:hidden text-neutral-100 font-semibold">{modeName}</b>
              {hintText && <span className={hk ? '' : 'hidden'}><span className="sm:hidden"> — </span>{t(hintText)}</span>}
            </span>
          </div>
        )}

        <div role="toolbar" className={`pointer-events-auto ${showModes ? 'w-full' : 'w-fit self-center'} bg-neutral-900/90 backdrop-blur border border-neutral-700/80 rounded-xl shadow-xl p-1.5 select-none`}>
          {/* Скрытые ряды опций всё равно участвуют в расчёте ширины w-fit, поэтому без режимов их не монтируем. */}
          {showModes && (
            <>
          <OptionRow open={showSize} label={t('brushSize')}>
            {BRUSH_SIZES.map(n => (
              <button key={n} onClick={() => onSetBrushSize(n)} aria-pressed={brushSize === n} className={`${BASE} ${brushSize === n ? ON : OFF} flex-1 px-2.5 tabular-nums`}>{n}×{n}</button>
            ))}
          </OptionRow>
          <OptionRow open={showScope} label={t('eraserScope')}>
            {SCOPES.map(s => (
              <button key={s.id} onClick={() => onSetEraserScope(s.id)} aria-pressed={eraserScope === s.id} className={`${BASE} ${eraserScope === s.id ? ON : OFF} flex-1 px-2.5`}>{t(s.label)}</button>
            ))}
          </OptionRow>
            </>
          )}

          <div className="flex items-center gap-1">
            <div ref={rowRef} className={`${showModes ? 'flex flex-1' : 'hidden'} min-w-0 gap-1 overflow-x-auto touch-pan-x ${NO_SCROLLBAR}`}>
              {showModes && modes.map(m => {
                const label = t(modeLabel(tool, m, isDecor));
                return (
                  <button
                    key={m} onClick={() => onSetMode(m)} aria-pressed={mode === m} aria-label={label} title={label}
                    className={`${BASE} ${mode === m ? ON : OFF} flex-1 min-w-10 sm:min-w-fit px-2 sm:px-2.5`}
                  >
                    <Icon name={m} />
                    <span className="hidden sm:inline">{label}</span>
                  </button>
                );
              })}
            </div>
            {showModes && <span className="w-px h-6 bg-neutral-700 mx-0.5 shrink-0" />}
            <button
              onClick={onUndo} disabled={!canUndo} aria-label={t('undoBulk')}
              title={undoLabel ? t('undoWithTitle', { label: undoLabel }) : t('undoBulkTitle')}
              className={`${BASE} ${OFF} ${DISABLED} w-10 sm:w-9 shrink-0`}
            ><Icon name="undo" /></button>
            <button
              onClick={onRedo} disabled={!canRedo} aria-label={t('redoBulk')}
              title={redoLabel ? t('redoWithTitle', { label: redoLabel }) : t('redoBulkTitle')}
              className={`${BASE} ${OFF} ${DISABLED} w-10 sm:w-9 shrink-0`}
            ><Icon name="redo" /></button>
          </div>
        </div>
      </div>
    </div>
  );
});
