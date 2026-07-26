import { memo, useEffect, useRef, useState } from 'react'
import type { CatalogItem } from '../lib/initial-data'

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
  const [translateY, setTranslateY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef(0);
  const currentYRef = useRef(0);

  // Сброс положения при смене выбранного элемента
  useEffect(() => {
    setTranslateY(0);
    setIsDragging(false);
  }, [selectedElementData]);

  if (!selectedElementData) return null;

  // Начало касания
  const handleTouchStart = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement;

    // Если касание произошло внутри скроллируемого контейнера или интерактивных элементов — игнорируем свайп шторки
    if (target.closest('.overflow-y-auto') || target.closest('button') || target.closest('input')) {
      return;
    }

    startYRef.current = e.touches[0].clientY;
    currentYRef.current = 0;
    setIsDragging(true);
  };

  // Движение пальца
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;

    const deltaY = e.touches[0].clientY - startYRef.current;

    // Тянуть можно только вниз
    if (deltaY > 0) {
      currentYRef.current = deltaY;
      setTranslateY(deltaY);
    } else {
      currentYRef.current = 0;
      setTranslateY(0);
    }
  };

  // Окончание касания
  const handleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);

    // Порог срабатывания закрытия (100px)
    if (currentYRef.current > 100) {
      onClose();
      setTimeout(() => setTranslateY(0), 200);
    } else {
      setTranslateY(0);
    }
  };

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        transform: translateY > 0 ? `translateY(${translateY}px)` : undefined,
        transition: isDragging ? 'none' : 'transform 0.2s ease-out'
      }}
      className="max-md:fixed max-md:bottom-0 max-md:left-0 max-md:right-0 max-md:w-full max-md:max-h-[75vh] max-md:rounded-t-2xl md:absolute md:top-4 md:right-4 bg-neutral-900/95 backdrop-blur border border-emerald-500/50 p-3 rounded-lg shadow-2xl text-xs w-72 z-50 flex flex-col select-none"
    >
      {/* Шапка для свайпа (Drag Zone) */}
      <div className="max-md:flex hidden flex-col items-center pt-1 pb-2 -mt-1 cursor-grab active:cursor-grabbing">
        <div className="w-12 h-1.5 bg-neutral-600 rounded-full" />
      </div>

      <div className="flex items-center justify-between border-b border-neutral-800 pb-2 mb-3 shrink-0">
        <span className="font-bold text-emerald-400 text-sm">
          {selectedElementData.type === 'object' && `Объекты (${selectedElementData.data.length})`}
          {selectedElementData.type === 'floor' && 'Пол'}
          {selectedElementData.type === 'wall' && (selectedElementData.data.isDoor ? 'Дверь' : selectedElementData.data.isWindow ? 'Окно' : 'Стена')}
        </span>
        <button onClick={onClose} className="text-neutral-400 hover:text-white font-bold p-2 text-base min-w-[36px] min-h-[36px] flex items-center justify-center cursor-pointer">✕</button>
      </div>
      
      {selectedElementData.type === 'object' && (
        <div className="overflow-y-auto max-h-[55vh] custom-scrollbar pr-1 space-y-4 touch-pan-y">
          {selectedElementData.data.map(({ obj, template }: { obj: any; template: CatalogItem }) => {
            if (!template) return null;
            const variantImage = template.colorVariants?.find(v => v.color === obj.paintColor)?.image;
            const currentImage = variantImage || template.image;
            
            return (
              <div key={obj.instanceId} className="border-b border-neutral-800/50 pb-3 last:border-0 last:pb-0">
                <div className="flex gap-3 mb-3 items-center">
                  {(template.tooltipImage || currentImage) ? (
                    <img 
                      src={template.tooltipImage || currentImage} 
                      alt={template.name} 
                      className="w-16 h-16 object-contain bg-neutral-950 rounded border border-neutral-800 p-1" 
                    />
                  ) : (
                    <div 
                      className="w-16 h-16 rounded border border-neutral-800 flex items-center justify-center font-bold text-xs text-white shadow-inner"
                      style={{ backgroundColor: obj.paintColor || (template.color === 'transparent' ? '#333' : template.color) }}
                    >
                      {template.name.slice(0, 3)}
                    </div>
                  )}
                  
                  <div className="space-y-1 text-neutral-300 flex-1">
                    <p className="font-bold text-emerald-300 text-sm">{template.name}</p>
                    <p><span className="text-neutral-500">Категория:</span> {template.category}</p>
                    <p><span className="text-neutral-500">Размер:</span> {template.size.w}x{template.size.h}</p>
                    <p><span className="text-neutral-500">Поворот:</span> {obj.rotation}°</p>
                  </div>
                </div>

                {template.colorVariants && template.colorVariants.length > 0 && (
                  <div className="mb-3 bg-neutral-950 p-2 rounded border border-neutral-800">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block mb-1.5 flex items-center gap-1">
                      <span>🖌️</span> ВЫБОР ЦВЕТА
                    </span>
                    <div className="grid grid-cols-5 gap-2">
                      <button
                        onClick={() => onPaintObject(obj.instanceId, undefined)}
                        className={`w-full aspect-square rounded flex items-center justify-center transition-all min-h-[36px] ${!obj.paintColor ? 'border-2 border-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.5)] z-10' : 'border border-neutral-700 hover:border-neutral-400 opacity-90'} cursor-pointer`}
                        style={{ background: '#595954' }}
                        title="По умолчанию"
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
                    Копир.
                  </button>
                  <button
                    disabled={template.constraints.autoTiling}
                    onClick={() => onRotateObject(obj)}
                    className={`flex-1 bg-neutral-800 hover:bg-neutral-700 text-amber-400 py-2.5 rounded font-bold text-xs transition disabled:opacity-50 min-h-[42px] ${template.constraints.autoTiling ? "cursor-not-allowed" : "cursor-pointer"}`}
                  >
                    Поворот
                  </button>
                  <button
                    onClick={() => onDeleteObject(obj.instanceId)}
                    className="flex-1 bg-red-900/50 hover:bg-red-800 text-red-200 py-2.5 rounded font-bold text-xs transition min-h-[42px] cursor-pointer"
                  >
                    Удалить
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedElementData.type === 'floor' && (
        <div className="space-y-2 text-neutral-300">
          <p><span className="text-neutral-500">Координаты:</span> {selectedElementData.data.x}, {selectedElementData.data.y}</p>
          <p><span className="text-neutral-500">Уровень материала:</span> {selectedElementData.data.level}</p>
          
          <div className="flex gap-2 pt-3 mt-2 border-t border-neutral-800">
            <button
              onClick={() => onDeleteFloor(selectedElementData.data.x, selectedElementData.data.y)}
              className="flex-1 bg-red-900/50 hover:bg-red-800 text-red-200 py-3 rounded font-bold text-xs transition min-h-[44px] cursor-pointer"
            >
              Удалить пол
            </button>
          </div>
        </div>
      )}

      {selectedElementData.type === 'wall' && (
        <div className="space-y-2 text-neutral-300">
          <p><span className="text-neutral-500">Координаты:</span> {selectedElementData.data.x}, {selectedElementData.data.y}</p>
          <p><span className="text-neutral-500">Ориентация:</span> {selectedElementData.data.orientation}</p>
          <p><span className="text-neutral-500">Уровень материала:</span> {selectedElementData.data.level}</p>
          
          {selectedElementData.decors && selectedElementData.decors.length > 0 && (
            <div className="pt-2 mt-2 border-t border-neutral-800">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block mb-1.5">Установленный декор:</span>
              <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-1 touch-pan-y">
                {selectedElementData.decors.map(({ obj, template }: { obj: any; template: CatalogItem }) => {
                  const currentImage = template.colorVariants?.find(v => v.color === obj.paintColor)?.image || template.image;
                  return (
                    <div key={obj.instanceId} className="flex items-center gap-2 bg-neutral-950 p-2 rounded border border-neutral-800">
                      {currentImage || template.tooltipImage ? (
                        <img src={currentImage || template.tooltipImage} alt={template.name} className="w-8 h-8 object-contain bg-neutral-900 rounded p-0.5" />
                      ) : (
                        <div className="w-8 h-8 rounded flex items-center justify-center font-bold text-[8px] text-white" style={{ backgroundColor: obj.paintColor || template.color || '#333' }}>
                          {template.name.slice(0,3)}
                        </div>
                      )}
                      <div className="flex-1 overflow-hidden">
                        <p className="font-bold text-emerald-300 text-xs truncate">{template.name}</p>
                      </div>
                      <button
                        onClick={() => onDeleteWallDecor(obj.instanceId)}
                        className="bg-red-900/50 hover:bg-red-800 text-red-200 px-3 py-1.5 rounded font-bold text-xs transition min-h-[36px] cursor-pointer"
                      >
                        Удал.
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
              Удалить элемент
            </button>
          </div>
        </div>
      )}
    </div>
  );
});