'use client';

import { useLanguage } from '@/context/LanguageContext'
import { trackEvent } from '@/lib/analytics'
import type { ViewMode } from '@/lib/constants'
import {
	buildCellsInBounds,
	buildExportFileName,
	buildSortedRootObjects,
	buildWallLinesInBounds,
	embedSvgImagesAsDataUris,
	getContentCellBounds,
	getFullGridCellBounds,
	getPixelBoundsForCellBounds
} from '@/lib/image-export-utils'
import type { BaseData, BaseType, CatalogItem, SettlementLayerType } from '@/lib/initial-data'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { GridCells } from './GridCells'
import { GridObjects } from './GridObjects'
import { GridWalls } from './GridWalls'

const noop = () => {};
const noopWall = () => {};

// Экспорт картинки всегда идёт видом сверху — изометрию убрали из модалки:
// в топ-дауне ничего не перекрывается перспективой и картинка читается лучше
// на скриншотах/в чатах, где её обычно смотрят маленькой.
const EXPORT_VIEW_MODE: ViewMode = 'topDown';

type ExportBaseType = 'main' | 'settlement';
type ExportScale = 1 | 2 | 4;
type ExportFormat = 'png' | 'webp';
type ExportStatus = 'idle' | 'rendering' | 'ready' | 'error';

interface ShareImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  mapName: string;
  mainBase: BaseData;
  settlementBase: BaseData;
  catalogMap: Record<string, CatalogItem>;
  initialBaseType: BaseType;
  initialSettlementLayer: SettlementLayerType;
}

const PAD = 32;
const WATERMARK_LABEL = 'LDOE BASE PLANNER';

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const ShareImageModal = memo(function ShareImageModal({
  isOpen,
  onClose,
  mapName,
  mainBase,
  settlementBase,
  catalogMap,
  initialBaseType,
  initialSettlementLayer,
}: ShareImageModalProps) {
  const { t } = useLanguage();

  const [baseType, setBaseType] = useState<ExportBaseType>(initialBaseType === 'settlement' ? 'settlement' : 'main');
  const [settlementLayer, setSettlementLayer] = useState<SettlementLayerType>(initialSettlementLayer);
  const [scale, setScale] = useState<ExportScale>(2);
  const [format, setFormat] = useState<ExportFormat>('png');
  // Качество применяется только к webp (0.5–1); PNG всегда без потерь и этот
  // параметр игнорирует. 0.9 — компромисс: заметно легче PNG, разницу в
  // деталях текстур почти не видно.
  const [webpQuality, setWebpQuality] = useState(0.9);
  const [transparentBg, setTransparentBg] = useState(false);
  const [cropToContent, setCropToContent] = useState(true);

  const [status, setStatus] = useState<ExportStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [svgFallbackUrl, setSvgFallbackUrl] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const renderTokenRef = useRef(0);
  // Кэш "URL ассета -> data: URI" на время жизни модалки: одни и те же иконки
  // и текстуры повторяются на базе десятки раз, а перегенерация превью (смена
  // масштаба/фона) не должна перекачивать их заново.
  const dataUriCacheRef = useRef<Map<string, string>>(new Map());

  // При каждом открытии модалки синхронизируем выбор с тем, что человек сейчас
  // реально смотрит в редакторе — так превью сразу совпадает с ожиданиями.
  useEffect(() => {
    if (!isOpen) return;
    setBaseType(initialBaseType === 'settlement' ? 'settlement' : 'main');
    setSettlementLayer(initialSettlementLayer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Очистка object URL при закрытии модалки / размонтировании — иначе они текут.
  useEffect(() => {
    if (isOpen) return;
    setResultUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
    setSvgFallbackUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
    setResultBlob(null);
    setStatus('idle');
    setErrorMessage(null);
    setCopyFeedback(false);
  }, [isOpen]);

  useEffect(() => () => {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    if (svgFallbackUrl) URL.revokeObjectURL(svgFallbackUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const base = baseType === 'settlement' ? settlementBase : mainBase;
  const gridW = base.mapConfig.width;
  const gridH = base.mapConfig.height;

  const bounds = useMemo(
    () => cropToContent ? getContentCellBounds(base, catalogMap, gridW, gridH) : getFullGridCellBounds(gridW, gridH),
    [base, catalogMap, gridW, gridH, cropToContent]
  );
  const cells = useMemo(() => buildCellsInBounds(bounds, EXPORT_VIEW_MODE), [bounds]);
  const wallLines = useMemo(() => buildWallLinesInBounds(bounds, gridW, gridH), [bounds, gridW, gridH]);
  const sortedRootObjects = useMemo(
    () => buildSortedRootObjects(base.layers.objects, catalogMap),
    [base.layers.objects, catalogMap]
  );
  const pixelBounds = useMemo(
    () => getPixelBoundsForCellBounds(bounds, EXPORT_VIEW_MODE, gridW),
    [bounds, gridW]
  );

  const svgWidth = Math.max(1, Math.round(pixelBounds.maxSx - pixelBounds.minSx + PAD * 2));
  const svgHeight = Math.max(1, Math.round(pixelBounds.maxSy - pixelBounds.minSy + PAD * 2));
  const offsetX = PAD - pixelBounds.minSx;
  const offsetY = PAD - pixelBounds.minSy;
  const svgKey = `${baseType}-${bounds.minX}-${bounds.minY}-${bounds.maxX}-${bounds.maxY}`;

  // Итоговый размер PNG в пикселях — известен сразу (до рендера), т.к. зависит
  // только от границ базы и выбранного множителя, поэтому показываем его как
  // живой предпросмотр ещё до того, как картинка сгенерируется.
  const finalWidth = svgWidth * scale;
  const finalHeight = svgHeight * scale;

  // Генерируем PNG заново при любом изменении настроек экспорта (пока модалка открыта).
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const myToken = ++renderTokenRef.current;
    setStatus('rendering');
    setErrorMessage(null);
    setCopyFeedback(false);

    const run = async () => {
      // Даём React закоммитить обновлённый скрытый <svg> перед тем как его читать.
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      if (cancelled || renderTokenRef.current !== myToken) return;

      const svgEl = svgRef.current;
      if (!svgEl) return;

      let svgUrl: string | null = null;
      try {
        // Ключевой момент: браузер НЕ подгружает внешние ресурсы у <image> внутри
        // SVG, который используется как источник для растеризации ("SVG as image"
        // ограничение) — поэтому просто ждать здесь загрузки <image> в живом DOM
        // недостаточно, они всё равно не попадут в растровую картинку. Встраиваем
        // их как data: URI в клон дерева перед сериализацией — так же, как это
        // делают обычные "export SVG to PNG" библиотеки.
        const embeddedSvg = await embedSvgImagesAsDataUris(svgEl, dataUriCacheRef.current);
        if (cancelled || renderTokenRef.current !== myToken) return;

        const svgString = new XMLSerializer().serializeToString(embeddedSvg);
        const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        svgUrl = URL.createObjectURL(svgBlob);

        const img = new Image();
        const loaded = new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('svg-decode-failed'));
        });
        img.src = svgUrl;
        await loaded;

        if (cancelled || renderTokenRef.current !== myToken) { URL.revokeObjectURL(svgUrl); return; }

        const canvas = document.createElement('canvas');
        canvas.width = svgWidth * scale;
        canvas.height = svgHeight * scale;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('canvas-2d-unavailable');

        if (!transparentBg) {
          ctx.fillStyle = '#0a0a0a';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Ненавязчивая подпись — картинка часто расшаривается за пределами приложения.
        const wmText = `${WATERMARK_LABEL} · ${mapName}`;
        const fontSize = Math.round(13 * scale);
        ctx.font = `${fontSize}px sans-serif`;
        ctx.textBaseline = 'alphabetic';
        const textW = ctx.measureText(wmText).width;
        const padX = 10 * scale, padY = 7 * scale;
        const boxW = textW + padX * 2;
        const boxH = fontSize + padY * 1.6;
        const boxX = canvas.width - boxW - 10 * scale;
        const boxY = canvas.height - boxH - 10 * scale;
        ctx.fillStyle = 'rgba(10,10,10,0.55)';
        ctx.fillRect(boxX, boxY, boxW, boxH);
        ctx.fillStyle = 'rgba(245,158,11,0.95)';
        ctx.fillText(wmText, boxX + padX, boxY + boxH - padY * 0.85);

        // PNG всегда без потерь (лучше для чёткой графики/текста, но тяжелее).
        // WebP с качеством < 1 — тот же пиксельный размер, но заметно легче
        // файл: экономия обычно 2–5× при почти незаметной потере деталей.
        const mimeType = format === 'webp' ? 'image/webp' : 'image/png';
        const encodeQuality = format === 'webp' ? webpQuality : undefined;
        const imageBlob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, mimeType, encodeQuality));
        if (!imageBlob) throw new Error(`${format}-encode-failed`);

        if (cancelled || renderTokenRef.current !== myToken) { URL.revokeObjectURL(svgUrl); return; }

        const imageUrl = URL.createObjectURL(imageBlob);
        setResultBlob(imageBlob);
        setResultUrl(prev => { if (prev) URL.revokeObjectURL(prev); return imageUrl; });
        setSvgFallbackUrl(prev => { if (prev) URL.revokeObjectURL(prev); return svgUrl; });
        setStatus('ready');
        trackEvent('map_share_image', {
          base: baseType,
          view_mode: EXPORT_VIEW_MODE,
          scale,
          crop: cropToContent,
          format,
          ...(format === 'webp' ? { quality: webpQuality } : {})
        });
      } catch (err) {
        console.error('Не удалось сформировать изображение базы:', err);
        if (svgUrl) URL.revokeObjectURL(svgUrl);
        if (!cancelled && renderTokenRef.current === myToken) {
          setStatus('error');
          setErrorMessage(String((err as Error)?.message || err));
        }
      }
    };

    run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, baseType, settlementLayer, cropToContent, scale, format, webpQuality, transparentBg, svgWidth, svgHeight, offsetX, offsetY, svgKey, mapName]);

  const handleDownload = useCallback(() => {
    if (!resultUrl) return;
    const a = document.createElement('a');
    a.href = resultUrl;
    a.download = buildExportFileName(mapName, baseType, format);
    a.click();
    trackEvent('map_share_image_download', { format, base: baseType });
  }, [resultUrl, mapName, baseType, format]);

  const handleDownloadSvg = useCallback(() => {
    if (!svgFallbackUrl) return;
    const a = document.createElement('a');
    a.href = svgFallbackUrl;
    a.download = buildExportFileName(mapName, baseType, 'svg');
    a.click();
    trackEvent('map_share_image_download', { format: 'svg', base: baseType });
  }, [svgFallbackUrl, mapName, baseType]);

  // Буфер обмена по спецификации гарантированно принимает только image/png —
  // для webp многие браузеры write() тихо отклонят. Саму кнопку не прячем при
  // смене формата (не должна скакать в интерфейсе) — просто блокируем и
  // подсказываем переключиться на PNG.
  const clipboardSupported = typeof window !== 'undefined' && !!navigator.clipboard && typeof window.ClipboardItem !== 'undefined';
  const canCopy = clipboardSupported && format === 'png';
  const handleCopy = useCallback(async () => {
    if (!resultBlob || !canCopy) return;
    try {
      await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': resultBlob })]);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
      trackEvent('map_share_image_copy', { base: baseType });
    } catch (err) {
      console.error('Не удалось скопировать изображение:', err);
    }
  }, [resultBlob, canCopy, baseType]);

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const handleShare = useCallback(async () => {
    if (!resultBlob) return;
    try {
      const file = new File([resultBlob], buildExportFileName(mapName, baseType, format), { type: resultBlob.type });
      if (typeof navigator.canShare === 'function' && !navigator.canShare({ files: [file] })) {
        handleDownload();
        return;
      }
      await navigator.share({ files: [file], title: mapName });
      trackEvent('map_share_image_native_share', { base: baseType });
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') console.error('Не удалось поделиться изображением:', err);
    }
  }, [resultBlob, mapName, baseType, format, handleDownload]);

  if (!isOpen || typeof document === 'undefined') return null;

  const tabBtn = (active: boolean) =>
    `flex-1 py-1.5 text-xs font-bold rounded transition cursor-pointer ${active ? 'bg-amber-500 text-neutral-950' : 'text-neutral-400 hover:text-white bg-neutral-900'}`;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-3"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[92vh] overflow-y-auto custom-scrollbar bg-neutral-900 border border-neutral-800 rounded-lg shadow-2xl p-4 space-y-4 text-white"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-amber-500 flex items-center gap-2">
            <span>🖼️</span> {t('shareImageTitle')}
          </h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white transition cursor-pointer"
            title={t('close')}
          >
            ✕
          </button>
        </div>

        <div className="flex gap-1 bg-neutral-950 p-1 rounded border border-neutral-800">
          <button onClick={() => setBaseType('main')} className={tabBtn(baseType === 'main')}>{t('mainBaseTab')}</button>
          <button onClick={() => setBaseType('settlement')} className={tabBtn(baseType === 'settlement')}>{t('settlementTab')}</button>
        </div>

        {baseType === 'settlement' && (
          <div className="flex gap-1 bg-neutral-950 p-1 rounded border border-neutral-800">
            <button onClick={() => setSettlementLayer('objects')} className={tabBtn(settlementLayer === 'objects')}>{t('objects')}</button>
            <button onClick={() => setSettlementLayer('energy')} className={tabBtn(settlementLayer === 'energy')}>{t('energy')}</button>
            <button onClick={() => setSettlementLayer('water')} className={tabBtn(settlementLayer === 'water')}>{t('waterTab')}</button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 bg-neutral-950 p-1 rounded border border-neutral-800">
            <button onClick={() => setScale(1)} className={`${tabBtn(scale === 1)} min-w-10`}>1×</button>
            <button onClick={() => setScale(2)} className={`${tabBtn(scale === 2)} min-w-10`}>2×</button>
            <button onClick={() => setScale(4)} className={`${tabBtn(scale === 4)} min-w-10`}>4×</button>
          </div>

          <div className="flex gap-1 bg-neutral-950 p-1 rounded border border-neutral-800">
            <button onClick={() => setFormat('png')} className={`${tabBtn(format === 'png')} min-w-10`}>{t('shareImageFormatPng')}</button>
            <button onClick={() => setFormat('webp')} className={`${tabBtn(format === 'webp')} min-w-10`}>{t('shareImageFormatWebp')}</button>
          </div>

          <label className="flex items-center gap-1.5 text-xs text-neutral-300 cursor-pointer select-none ml-auto">
            <input
              type="checkbox"
              checked={cropToContent}
              onChange={e => setCropToContent(e.target.checked)}
              className="accent-amber-500 cursor-pointer"
            />
            {t('shareImageCropToContent')}
          </label>

          <label className="flex items-center gap-1.5 text-xs text-neutral-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={transparentBg}
              onChange={e => setTransparentBg(e.target.checked)}
              className="accent-amber-500 cursor-pointer"
            />
            {t('shareImageTransparentBg')}
          </label>
        </div>

        {/* Качество сжатия влияет только на webp — PNG в этой модалке всегда
            без потерь. Пиксельный размер (см. бейдж над превью) от формата и
            качества не зависит — меняется только вес файла. */}
        {format === 'webp' && (
          <div className="flex items-center gap-2 text-xs text-neutral-300 -mt-1">
            <span className="text-neutral-400 shrink-0">{t('shareImageQuality')}</span>
            <input
              type="range"
              min={50}
              max={100}
              step={5}
              value={Math.round(webpQuality * 100)}
              onChange={e => setWebpQuality(Number(e.target.value) / 100)}
              className="flex-1 accent-amber-500 cursor-pointer"
            />
            <span className="font-mono text-neutral-400 w-10 text-right shrink-0">{Math.round(webpQuality * 100)}%</span>
          </div>
        )}

        <div
          className="relative rounded border border-neutral-800 overflow-hidden flex items-center justify-center h-[42vh] min-h-[220px] max-h-[420px]"
          style={{
            backgroundImage: 'linear-gradient(45deg, #262626 25%, transparent 25%), linear-gradient(-45deg, #262626 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #262626 75%), linear-gradient(-45deg, transparent 75%, #262626 75%)',
            backgroundSize: '16px 16px',
            backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
            backgroundColor: '#171717'
          }}
        >
          <div className="absolute top-2 left-2 bg-neutral-950/80 backdrop-blur-sm text-[11px] text-neutral-300 font-mono px-2 py-1 rounded border border-neutral-800 pointer-events-none">
            {finalWidth}×{finalHeight}px
            {status === 'ready' && resultBlob && ` · ${formatFileSize(resultBlob.size)}`}
          </div>
          {status === 'ready' && resultUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={resultUrl} alt={mapName} className="max-w-full max-h-full object-contain" />
          )}
          {status === 'rendering' && (
            <div className="text-xs text-amber-400 font-bold animate-pulse px-4 text-center">{t('shareImageGenerating')}</div>
          )}
          {status === 'error' && (
            <div className="text-xs text-red-400 text-center px-4 max-w-sm" title={errorMessage ?? undefined}>
              {t('shareImageError')}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleDownload}
            disabled={status !== 'ready'}
            className="flex-1 min-w-[140px] bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-neutral-950 font-bold py-2 px-3 rounded text-xs transition cursor-pointer"
          >
            ⬇ {t('shareImageDownload')} {format.toUpperCase()}
          </button>
          {canShare && (
            <button
              onClick={handleShare}
              disabled={status !== 'ready'}
              className="flex-1 min-w-[120px] bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-2 px-3 rounded text-xs transition cursor-pointer"
            >
              📤 {t('shareImageShare')}
            </button>
          )}
          {clipboardSupported && (
            <button
              onClick={handleCopy}
              disabled={status !== 'ready' || !canCopy}
              title={!canCopy && format !== 'png' ? t('shareImageCopyPngOnly') : undefined}
              className="flex-1 min-w-[120px] bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-2 px-3 rounded text-xs transition cursor-pointer"
            >
              {copyFeedback ? `✓ ${t('shareImageCopied')}` : `📋 ${t('shareImageCopy')}`}
            </button>
          )}
        </div>

        {status === 'error' && svgFallbackUrl && (
          <button onClick={handleDownloadSvg} className="text-xs text-blue-400 underline cursor-pointer">
            {t('shareImageDownloadSvg')}
          </button>
        )}

        {/* Скрытый рендер для растеризации — вне видимой области, но не display:none,
            чтобы <image> внутри гарантированно грузились. Использует те же
            GridCells/GridObjects/GridWalls, что и основной canvas, поэтому картинка
            всегда 1-в-1 совпадает с тем, что видно в редакторе. */}
        <div aria-hidden style={{ position: 'fixed', top: 0, left: 0, width: 0, height: 0, overflow: 'hidden', opacity: 0, pointerEvents: 'none' }}>
          <svg
            key={svgKey}
            ref={svgRef}
            width={svgWidth}
            height={svgHeight}
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            xmlns="http://www.w3.org/2000/svg"
          >
            <g transform={`translate(${offsetX}, ${offsetY})`}>
              <GridCells
                allCells={cells}
                gridW={gridW}
                gridH={gridH}
                viewMode={EXPORT_VIEW_MODE}
                activeTool="hand"
                mapState={base}
                activeBaseType={baseType}
                activeSettlementLayer={settlementLayer}
                onCellClick={noop}
                onSelectFloor={noop}
                onClearSelection={noop}
              />
              <GridObjects
                sortedRootObjects={sortedRootObjects}
                objects={base.layers.objects}
                viewMode={EXPORT_VIEW_MODE}
                gridW={gridW}
                activeTool="hand"
                activeBaseType={baseType}
                activeSettlementLayer={settlementLayer}
                onSelectObject={noop}
                clipIdPrefix="share-export-clip"
              />
              <GridWalls
                wallLines={wallLines}
                walls={base.layers.walls}
                viewMode={EXPORT_VIEW_MODE}
                gridW={gridW}
                activeTool="hand"
                isWallDecorTool={false}
                activeBaseType={baseType}
                activeSettlementLayer={settlementLayer}
                onWallClick={noopWall}
                onSelectWall={noop}
                onClearSelection={noop}
              />
            </g>
          </svg>
        </div>
      </div>
    </div>,
    document.body
  );
});