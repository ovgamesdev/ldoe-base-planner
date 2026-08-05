/* eslint-disable @typescript-eslint/no-explicit-any */
import { getAssetPath } from '@/lib/grid-utils'
import { memo, useEffect, useRef, useState } from 'react'
import { TranslationKey, useLanguage } from '../context/LanguageContext'
import { getItemName, type CatalogItem } from '../lib/initial-data'

interface SelectedElementPanelProps {
  selectedElementData: any;
  onClose: () => void;
  onPaintObject: (instanceId: string, color: string | undefined) => void;
  onCopyObject: (typeId: string, rotation: number) => void;
  onRotateObject: (obj: { instanceId: string; typeId: string; x: number; y: number; rotation: number }) => void;
  onDeleteObject: (instanceId: string) => void;
  onDeleteFloor: (x: number, y: number) => void;
  onDeleteWall: (x: number, y: number, orientation: 'horizontal' | 'vertical') => void;
  onDeleteWallDecor: (instanceId: string) => void;
}

export const SelectedElementPanel = memo(function SelectedElementPanel({
  selectedElementData,
  onClose,
  onPaintObject,
  onCopyObject,
  onRotateObject,
  onDeleteObject,
  onDeleteFloor,
  onDeleteWall,
  onDeleteWallDecor
}: SelectedElementPanelProps) {
  const { t, language } = useLanguage();
  const [isClosing, setIsClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef(0);
  const currentYRef = useRef(0);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    setIsClosing(false);
    if (panelRef.current) {
      panelRef.current.style.animation = '';
      panelRef.current.style.transform = '';
      panelRef.current.style.opacity = '';
      panelRef.current.style.transition = '';
    }
  }, [selectedElementData]);

  if (!selectedElementData) return null;

  const handleClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(() => {
      onClose();
    }, 200);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement;

    if (target.closest('.overflow-y-auto') || target.closest('button') || target.closest('input')) {
      return;
    }

    startYRef.current = e.touches[0].clientY;
    currentYRef.current = 0;
    isDraggingRef.current = true;

    if (panelRef.current) {
      panelRef.current.style.animation = 'none';
      panelRef.current.style.transition = 'none';
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDraggingRef.current) return;

    const deltaY = e.touches[0].clientY - startYRef.current;

    if (deltaY > 0) {
      currentYRef.current = deltaY;
      if (panelRef.current) {
        panelRef.current.style.transform = `translateY(${deltaY}px)`;
      }
    } else {
      currentYRef.current = 0;
      if (panelRef.current) {
        panelRef.current.style.transform = `translateY(0px)`;
      }
    }
  };

  const handleTouchEnd = () => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;

    if (!panelRef.current) return;

    panelRef.current.style.transition = 'transform 0.2s ease-out, opacity 0.2s ease-out';

    if (currentYRef.current > 80) {
      panelRef.current.style.transform = 'translateY(100%)';
      panelRef.current.style.opacity = '0';
      setTimeout(() => {
        onClose();
      }, 200);
    } else {
      panelRef.current.style.transform = 'translateY(0px)';
    }
  };

  return (
    <>
      <style>{`
        @keyframes panelEnterMobile {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes panelEnterDesktop {
          from { transform: translateY(-8px) scale(0.95); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes panelExitMobile {
          from { transform: translateY(0); opacity: 1; }
          to { transform: translateY(100%); opacity: 0; }
        }
        @keyframes panelExitDesktop {
          from { transform: translateY(0) scale(1); opacity: 1; }
          to { transform: translateY(-8px) scale(0.95); opacity: 0; }
        }
        .panel-anim-enter {
          animation: panelEnterMobile 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          will-change: transform, opacity;
        }
        .panel-anim-exit {
          animation: panelExitMobile 0.2s cubic-bezier(0.7, 0, 0.84, 0) forwards;
          will-change: transform, opacity;
        }
        @media (min-width: 768px) {
          .panel-anim-enter {
            animation: panelEnterDesktop 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          }
          .panel-anim-exit {
            animation: panelExitDesktop 0.2s cubic-bezier(0.7, 0, 0.84, 0) forwards;
          }
        }
      `}</style>
      <div
        ref={panelRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={`max-md:fixed max-md:bottom-0 max-md:left-0 max-md:right-0 max-md:w-full max-md:max-h-[75vh] max-md:rounded-t-2xl md:absolute md:top-4 md:right-4 bg-neutral-900/95 backdrop-blur border border-emerald-500/50 p-3 rounded-lg shadow-2xl text-xs w-72 z-50 flex flex-col select-none ${
          isClosing ? 'panel-anim-exit' : 'panel-anim-enter'
        }`}
      >
        <div className="max-md:flex hidden flex-col items-center pt-1 pb-2 -mt-1 cursor-grab active:cursor-grabbing">
          <div className="w-12 h-1.5 bg-neutral-600 rounded-full" />
        </div>

        <div className="flex items-center justify-between border-b border-neutral-800 pb-2 mb-3 shrink-0">
          <span className="font-bold text-emerald-400 text-sm">
            {selectedElementData.type === 'object' && t('objectsCount', { count: selectedElementData.data.length })}
            {selectedElementData.type === 'floor' && t('floor')}
            {selectedElementData.type === 'wall' && (selectedElementData.data.isDoor ? t('door') : selectedElementData.data.isWindow ? t('window') : t('wall'))}
          </span>
          <button onClick={handleClose} className="text-neutral-400 hover:text-white font-bold p-2 text-base min-w-[36px] min-h-[36px] flex items-center justify-center cursor-pointer">✕</button>
        </div>
        
        {selectedElementData.type === 'object' && (
          <div className="overflow-y-auto max-h-[55vh] custom-scrollbar pr-1 space-y-4 touch-pan-y">
            {selectedElementData.data.map(({ obj, template }: { obj: any; template: CatalogItem }) => {
              if (!template) return null;
              const itemName = getItemName(template.name, language);
              const variantImage = template.colorVariants?.find(v => v.color === obj.paintColor)?.image;
              const currentImage = variantImage || template.image;
              
              return (
                <div key={obj.instanceId} className="border-b border-neutral-800/50 pb-3 last:border-0 last:pb-0">
                  <div className="flex gap-3 mb-3 items-center">
                    {(template.tooltipImage || currentImage) ? (
                      <img 
                        src={getAssetPath(template.tooltipImage || currentImage)} 
                        alt={itemName} 
                        className="w-16 h-16 object-contain bg-neutral-950 rounded border border-neutral-800 p-1" 
                      />
                    ) : (
                      <div 
                        className="w-16 h-16 rounded border border-neutral-800 flex items-center justify-center font-bold text-xs text-white shadow-inner"
                        style={{ backgroundColor: obj.paintColor || (template.color === 'transparent' ? '#333' : template.color) }}
                      >
                        {itemName.slice(0, 3)}
                      </div>
                    )}
                    
                    <div className="space-y-1 text-neutral-300 flex-1">
                      <p className="font-bold text-emerald-300 text-sm">{itemName}</p>
                      <p><span className="text-neutral-500">{t('categoryLabel')}</span> {t(template.category as TranslationKey)}</p>
                      <p><span className="text-neutral-500">{t('sizeLabel')}</span> {template.size.w}x{template.size.h}</p>
                      <p><span className="text-neutral-500">{t('rotationLabel')}</span> {obj.rotation}°</p>
                      {template.constraints.requiresPower && <p><span className="text-neutral-500">{t('requiresPowerLabel')}</span> <span className="text-amber-400 font-semibold">{t('yesPower')}</span></p>}
                      {template.constraints.requiresWater && <p><span className="text-neutral-500">{t('requiresWaterLabel')}</span> <span className="text-blue-400 font-semibold">{t('yesWater')}</span></p>}
                    </div>
                  </div>

                  {template.colorVariants && template.colorVariants.length > 0 && (
                    <div className="mb-3 bg-neutral-950 p-2 rounded border border-neutral-800">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block mb-1.5 flex items-center gap-1">
                        <span>🖌️</span> {t('colorSelection')}
                      </span>
                      <div className="grid grid-cols-5 gap-2">
                        <button
                          onClick={() => onPaintObject(obj.instanceId, undefined)}
                          className={`w-full aspect-square rounded flex items-center justify-center transition-all min-h-[36px] ${!obj.paintColor ? 'border-2 border-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.5)] z-10' : 'border border-neutral-700 hover:border-neutral-400 opacity-90'} cursor-pointer`}
                          style={{ background: '#595954' }}
                          title={t('defaultColor')}
                        >
                          <svg 
                            className="w-6 h-6 text-red-500 drop-shadow-md select-none" 
                            fill="none" 
                            viewBox="0 0 24 24" 
                            stroke="currentColor" 
                            strokeWidth={2.5}
                          >
                            <circle cx="12" cy="12" r="8" />
                            <line x1="6.5" y1="17.5" x2="17.5" y2="6.5" />
                          </svg>
                        </button>
                        {template.colorVariants.map(variant => {
                          const isActive = obj.paintColor === variant.color;
                          return (
                            <button
                              key={variant.color}
                              onClick={() => onPaintObject(obj.instanceId, variant.color)}
                              className={`w-full aspect-square rounded flex items-center justify-center transition-all min-h-[36px] ${isActive ? 'border-2 border-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.5)] z-10' : 'border border-neutral-700 hover:border-neutral-400 opacity-90'} cursor-pointer`}
                              style={{ background: variant.color }}
                              title={variant.color}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => onCopyObject(obj.typeId, obj.rotation)}
                      className="flex-1 bg-blue-900/40 hover:bg-blue-800 text-blue-300 py-2.5 rounded font-bold text-xs transition min-h-[42px] cursor-pointer"
                    >
                      {t('copyBtn')}
                    </button>
                    <button
                      disabled={template.constraints.autoTiling}
                      onClick={() => onRotateObject(obj)}
                      className={`flex-1 bg-neutral-800 hover:bg-neutral-700 text-amber-400 py-2.5 rounded font-bold text-xs transition disabled:opacity-50 min-h-[42px] ${template.constraints.autoTiling ? "cursor-not-allowed" : "cursor-pointer"}`}
                    >
                      {t('rotateBtn')}
                    </button>
                    <button
                      onClick={() => onDeleteObject(obj.instanceId)}
                      className="flex-1 bg-red-900/50 hover:bg-red-800 text-red-200 py-2.5 rounded font-bold text-xs transition min-h-[42px] cursor-pointer"
                    >
                      {t('deleteBtn')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {selectedElementData.type === 'floor' && (
          <div className="space-y-2 text-neutral-300">
            <p><span className="text-neutral-500">{t('coordinatesLabel')}</span> {selectedElementData.data.x}, {selectedElementData.data.y}</p>
            <p><span className="text-neutral-500">{t('materialLevelLabel')}</span> {selectedElementData.data.level}</p>
            
            <div className="flex gap-2 pt-3 mt-2 border-t border-neutral-800">
              <button
                onClick={() => onDeleteFloor(selectedElementData.data.x, selectedElementData.data.y)}
                className="flex-1 bg-red-900/50 hover:bg-red-800 text-red-200 py-3 rounded font-bold text-xs transition min-h-[44px] cursor-pointer"
              >
                {t('deleteFloorBtn')}
              </button>
            </div>
          </div>
        )}

        {selectedElementData.type === 'wall' && (
          <div className="space-y-2 text-neutral-300">
            <p><span className="text-neutral-500">{t('coordinatesLabel')}</span> {selectedElementData.data.x}, {selectedElementData.data.y}</p>
            <p><span className="text-neutral-500">{t('orientationLabel')}</span> {selectedElementData.data.orientation === 'horizontal' ? t('horizontal') : selectedElementData.data.orientation === 'vertical' ? t('vertical') : selectedElementData.data.orientation}</p>
            <p><span className="text-neutral-500">{t('materialLevelLabel')}</span> {selectedElementData.data.level}</p>
            
            {selectedElementData.decors && selectedElementData.decors.length > 0 && (
              <div className="pt-2 mt-2 border-t border-neutral-800">
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block mb-1.5">{t('installedDecor')}</span>
                <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-1 touch-pan-y">
                  {selectedElementData.decors.map(({ obj, template }: { obj: any; template: CatalogItem }) => {
                    const itemName = getItemName(template.name, language);
                    const currentImage = template.colorVariants?.find(v => v.color === obj.paintColor)?.image || template.tooltipImage || template.image;
                    return (
                      <div key={obj.instanceId} className="flex items-center gap-2 bg-neutral-950 p-2 rounded border border-neutral-800">
                        {currentImage ? (
                          <img src={getAssetPath(currentImage)} alt={itemName} className="w-8 h-8 object-contain bg-neutral-900 rounded p-0.5" />
                        ) : (
                          <div className="w-8 h-8 rounded flex items-center justify-center font-bold text-[8px] text-white" style={{ backgroundColor: obj.paintColor || template.color || '#333' }}>
                            {itemName.slice(0, 3)}
                          </div>
                        )}
                        <div className="flex-1 overflow-hidden">
                          <p className="font-bold text-emerald-300 text-xs truncate">{itemName}</p>
                        </div>
                        <button
                          onClick={() => onDeleteWallDecor(obj.instanceId)}
                          className="bg-red-900/50 hover:bg-red-800 text-red-200 px-3 py-1.5 rounded font-bold text-xs transition min-h-[36px] cursor-pointer"
                        >
                          {t('deleteShortBtn')}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            
            <div className="flex gap-2 pt-3 mt-2 border-t border-neutral-800">
              <button
                onClick={() => onDeleteWall(selectedElementData.data.x, selectedElementData.data.y, selectedElementData.data.orientation)}
                className="flex-1 bg-red-900/50 hover:bg-red-800 text-red-200 py-3 rounded font-bold text-xs transition min-h-[44px] cursor-pointer"
              >
                {t('deleteElementBtn')}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
});