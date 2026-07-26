import React, { memo, useCallback, useEffect, useRef, useState } from 'react'
import type { Tool, ViewMode } from '../lib/constants'
import { ALL_ROTATIONS, CATEGORY_LABELS, TOOL_LABELS } from '../lib/constants'
import type { CatalogItem, MapData } from '../lib/initial-data'

interface LeftSidebarProps {
  gridW: number;
  gridH: number;
  maps: MapData[];
  mapState: MapData;
  activeMapId: string;
  availableMaps: { id: string; name: string }[];
  catalog: CatalogItem[];
  catalogMap: Record<string, CatalogItem>;
  uniqueCategories: string[];
  searchCategory: string;
  searchQuery: string;
  activeTool: Tool;
  viewMode: ViewMode;
  zoom: number;
  buildLevel: number;
  isDoorPlacement: boolean;
  isWindowPlacement: boolean;
  selectedTypeId: string;
  selectedAllowedRotations: number[];
  currentRotation: number;
  dragItemIndex: number | null;
  dragOverItemIndex: number | null;
  
  onCloseMobile?: () => void;
  onCreateMap: () => void;
  onDeleteMap: (id: string) => void;
  onRenameMap: (name: string) => void;
  onSetActiveMapId: (id: string) => void;
  onExportMap: () => void;
  onImportMap: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onExportCatalog: () => void;
  onImportCatalog: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onResetCatalog: () => void;
  onSetViewMode: (mode: ViewMode) => void;
  onResetCamera: () => void;
  onSetActiveTool: (tool: Tool) => void;
  onSetBuildLevel: (lvl: number) => void;
  onSetDoorPlacement: (val: boolean) => void;
  onSetWindowPlacement: (val: boolean) => void;
  onSetSearchCategory: (cat: string) => void;
  onSetSearchQuery: (query: string) => void;
  onClearSearch: () => void;
  onSelectBuildingType: (typeId: string) => void;
  onCurrentRotationChange: (rot: number) => void;
  onLoadForEditing: (typeId: string) => void;
  onDragStart: (idx: number) => void;
  onDragOver: (e: React.DragEvent, idx: number) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  objectListRef: React.RefObject<HTMLDivElement | null>;
}

export const LeftSidebar = memo(function LeftSidebar({
  gridW,
  gridH,
  maps,
  mapState,
  activeMapId,
  availableMaps,
  catalog,
  catalogMap,
  uniqueCategories,
  searchCategory,
  searchQuery,
  activeTool,
  viewMode,
  zoom,
  buildLevel,
  isDoorPlacement,
  isWindowPlacement,
  selectedTypeId,
  selectedAllowedRotations,
  currentRotation,
  dragItemIndex,
  dragOverItemIndex,
  onCloseMobile,
  onCreateMap,
  onDeleteMap,
  onRenameMap,
  onSetActiveMapId,
  onExportMap,
  onImportMap,
  onExportCatalog,
  onImportCatalog,
  onResetCatalog,
  onSetViewMode,
  onResetCamera,
  onSetActiveTool,
  onSetBuildLevel,
  onSetDoorPlacement,
  onSetWindowPlacement,
  onSetSearchCategory,
  onSetSearchQuery,
  onClearSearch,
  onSelectBuildingType,
  onCurrentRotationChange,
  onLoadForEditing,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  objectListRef,
}: LeftSidebarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const catalogInputRef = useRef<HTMLInputElement>(null);

  const [localZoom, setLocalZoom] = useState(zoom);

  useEffect(() => {
    setLocalZoom(zoom);
  }, [zoom]);

  useEffect(() => {
    const handleInternalZoom = (e: Event) => {
      const customEvent = e as CustomEvent;
      setLocalZoom(customEvent.detail.newZoom);
    };
    window.addEventListener('internal-zoom', handleInternalZoom);
    return () => window.removeEventListener('internal-zoom', handleInternalZoom);
  }, []);

  const dispatchZoomEvent = useCallback((val: number) => {
    const clamped = Math.min(5, Math.max(0.3, val));
    setLocalZoom(clamped);
    window.dispatchEvent(new CustomEvent('external-zoom', { detail: { newZoom: clamped } }));
  }, []);

  const filteredCatalog = catalog.filter(item =>
    (searchCategory === 'all' || item.category === searchCategory) &&
    (item.name.toLowerCase().includes(searchQuery.toLowerCase()) || item.category.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="w-full md:w-80 bg-neutral-900 border-r border-neutral-800 p-4 flex flex-col gap-4 overflow-y-auto custom-scrollbar z-10 h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-amber-500 tracking-wide">LDOE BLUEPRINT</h1>
          <p className="text-xs text-neutral-400">Сетка: {gridW}x{gridH} клеток</p>
        </div>
        {onCloseMobile && (
          <button 
            onClick={onCloseMobile}
            className="md:hidden rounded bg-neutral-800 p-2 text-xs text-neutral-300 hover:bg-neutral-700 min-w-[36px] min-h-[36px] cursor-pointer"
          >
            ✕
          </button>
        )}
      </div>

      <div className="space-y-3 bg-neutral-950 p-3 rounded border border-neutral-800">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">Менеджер Карт</span>
          <button onClick={onCreateMap} className="bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold px-3 py-1.5 rounded text-xs transition cursor-pointer">
            + Новая карта
          </button>
        </div>

        <div>
          <label className="block text-[11px] text-neutral-400 mb-1">Выбрать карту</label>
          <div className="flex gap-1.5">
            <select value={activeMapId} onChange={e => onSetActiveMapId(e.target.value)} className="flex-1 bg-neutral-900 border border-neutral-800 text-xs rounded p-2 focus:outline-none focus:border-amber-500 custom-scrollbar cursor-pointer">
              {availableMaps.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            {maps.length > 1 && (
              <button onClick={() => onDeleteMap(mapState.id)} className="bg-red-900/40 hover:bg-red-800 text-red-300 border border-red-800/50 px-3 rounded text-xs transition cursor-pointer">
                ✕
              </button>
            )}
          </div>
        </div>

        <div>
          <label className="block text-[11px] text-neutral-400 mb-1">Название текущей карты</label>
          <input type="text" value={mapState.name} onChange={e => onRenameMap(e.target.value)} className="w-full bg-neutral-900 border border-neutral-800 text-xs rounded p-2 focus:outline-none focus:border-amber-500" />
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-neutral-800">
          <button onClick={onExportMap} className="bg-neutral-800 hover:bg-neutral-700 py-2 px-2 rounded text-xs transition min-h-[40px] cursor-pointer">Экспорт</button>
          <button onClick={() => fileInputRef.current?.click()} className="bg-neutral-800 hover:bg-neutral-700 py-2 px-2 rounded text-xs transition min-h-[40px] cursor-pointer">Импорт</button>
        </div>
        <input type="file" ref={fileInputRef} onChange={onImportMap} accept=".json" className="hidden" />

        <div className="pt-2 border-t border-neutral-800 flex items-center justify-between text-xs">
          <span className="font-bold uppercase tracking-wider text-neutral-500">Каталог</span>
          <div className="flex gap-2">
            <button onClick={onExportCatalog} className="text-blue-400 underline p-1 cursor-pointer">Экспорт</button>
            <button onClick={() => catalogInputRef.current?.click()} className="text-emerald-400 underline p-1 cursor-pointer">Импорт</button>
            <button onClick={onResetCatalog} className="text-red-400 underline p-1 cursor-pointer">Сбросить</button>
          </div>
          <input type="file" ref={catalogInputRef} onChange={onImportCatalog} accept=".json" className="hidden" />
        </div>
      </div>

      <div className="space-y-2 bg-neutral-950 p-3 rounded border border-neutral-800">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">Вид / Камера</span>
          <div className="flex gap-1 bg-neutral-900 p-1 rounded border border-neutral-700">
            <button onClick={() => onSetViewMode('topDown')} className={`px-2.5 py-1 text-xs uppercase font-bold rounded transition ${viewMode === 'topDown' ? 'bg-amber-500 text-neutral-950' : 'text-neutral-400 hover:text-white'} cursor-pointer`}>2D</button>
            <button onClick={() => onSetViewMode('topDown45')} className={`px-2.5 py-1 text-xs uppercase font-bold rounded transition ${viewMode === 'topDown45' ? 'bg-amber-500 text-neutral-950' : 'text-neutral-400 hover:text-white'} cursor-pointer`}>2D 45°</button>
          </div>
        </div>
        
        <div className="flex items-center gap-2 pt-1">
          <button onClick={() => dispatchZoomEvent(localZoom - 0.1)} className="w-9 h-9 bg-neutral-800 hover:bg-neutral-700 rounded text-sm font-bold flex items-center justify-center cursor-pointer">-</button>
          <input type="range" min={30} max={500} step={10} value={Math.round(localZoom * 100)} onChange={e => dispatchZoomEvent(Number(e.target.value) / 100)} className="flex-1 accent-amber-500 h-6 cursor-pointer" />
          <button onClick={() => dispatchZoomEvent(localZoom + 0.1)} className="w-9 h-9 bg-neutral-800 hover:bg-neutral-700 rounded text-sm font-bold flex items-center justify-center cursor-pointer">+</button>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-neutral-500 font-mono">{Math.round(localZoom * 100)}%</span>
          <button onClick={onResetCamera} className="text-xs text-amber-400 underline p-1 cursor-pointer">Сбросить камеру</button>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-bold uppercase tracking-wider text-neutral-400">Инструменты рисования</label>
        <div className="grid grid-cols-2 gap-2">
          {(['floor', 'wall', 'object', 'nobuild', 'eraser', 'hand'] as const).map(t => (
            <button
              key={t}
              onClick={() => onSetActiveTool(t)}
              className={`py-3 px-3 text-left rounded text-xs font-medium transition min-h-[44px] flex items-center ${activeTool === t ? 'bg-amber-500 text-neutral-950 font-bold' : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300'} cursor-pointer`}
            >
              {TOOL_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {(activeTool === 'floor' || activeTool === 'wall') && (
        <div className="space-y-3 bg-neutral-950 p-3 rounded border border-neutral-800">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-neutral-400 block mb-1.5">Уровень материала</label>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map(lvl => (
                <button key={lvl} onClick={() => onSetBuildLevel(lvl)} className={`flex-1 py-2 rounded text-xs font-bold min-h-[40px] ${buildLevel === lvl ? 'bg-amber-500 text-neutral-950' : 'bg-neutral-800 text-neutral-400'} cursor-pointer`}>
                  Lvl {lvl}
                </button>
              ))}
            </div>
          </div>
          {activeTool === 'wall' && (
            <div className="flex gap-3 text-xs select-none text-neutral-300 pt-1">
              <label className="flex items-center gap-1.5 cursor-pointer py-1 hover:text-white">
                <input type="radio" checked={!isDoorPlacement && !isWindowPlacement} onChange={() => { onSetDoorPlacement(false); onSetWindowPlacement(false); }} className="accent-amber-500 w-4 h-4 cursor-pointer" />
                Стена
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer py-1 hover:text-white">
                <input type="radio" checked={isDoorPlacement} onChange={() => { onSetDoorPlacement(true); onSetWindowPlacement(false); }} className="accent-amber-500 w-4 h-4 cursor-pointer" />
                Дверь
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer py-1 hover:text-white">
                <input type="radio" checked={isWindowPlacement} onChange={() => { onSetDoorPlacement(false); onSetWindowPlacement(true); }} className="accent-amber-500 w-4 h-4 cursor-pointer" />
                Окно
              </label>
            </div>
          )}
        </div>
      )}

      {activeTool === 'object' && (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-neutral-400 block mb-1">Выбор здания / декора</label>
            
            <div className="bg-neutral-800 border border-neutral-700 rounded p-2 space-y-2">
              <div className="flex gap-1">
                <select 
                  value={searchCategory} 
                  onChange={e => onSetSearchCategory(e.target.value)} 
                  className="flex-shrink-0 w-[42%] bg-neutral-950 border border-neutral-800 rounded p-2 text-xs text-white focus:outline-none focus:border-amber-500 custom-scrollbar cursor-pointer"
                >
                  <option value="all">Все категории</option>
                  {uniqueCategories.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c] || c}</option>)}
                </select>
                <div className="relative flex-1">
                  <input 
                    type="text" 
                    placeholder="Поиск..." 
                    value={searchQuery}
                    onChange={e => onSetSearchQuery(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 pr-7 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={onClearSearch}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white text-sm p-1 cursor-pointer"
                      title="Очистить поиск"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
              <div ref={objectListRef} className="h-64 md:h-72 overflow-y-auto overflow-x-hidden space-y-1.5 pr-1 custom-scrollbar">
                {filteredCatalog.map((item, idx) => {
                  const limitInfo = (() => {
                    const max = item.constraints.maxPerBase;
                    if (!max) return null;
                    let current = 0;
                    if (item.constraints.sharedLimitGroup) {
                      current = mapState.layers.objects.filter(obj => {
                        const t = catalogMap[obj.typeId];
                        return t?.constraints.sharedLimitGroup === item.constraints.sharedLimitGroup;
                      }).length;
                    } else {
                      current = mapState.layers.objects.filter(obj => obj.typeId === item.typeId).length;
                    }
                    return { current, max, remaining: max - current };
                  })();

                  return (
                    <div
                      key={item.typeId}
                      data-type-id={item.typeId}
                      draggable
                      onDragStart={() => onDragStart(idx)}
                      onDragOver={(e) => onDragOver(e, idx)}
                      onDrop={onDrop}
                      onDragEnd={onDragEnd}
                      className={`flex gap-1 items-center transition ${dragItemIndex === idx ? 'opacity-40' : ''} ${dragOverItemIndex === idx && dragItemIndex !== idx ? 'border-t-2 border-amber-500' : ''}`}
                    >
                      <button
                        onClick={() => onSelectBuildingType(item.typeId)}
                        className={`flex-1 text-left flex items-center gap-2 p-2 rounded transition min-w-0 min-h-[44px] ${selectedTypeId === item.typeId ? 'bg-amber-500/20 border border-amber-500/50' : 'bg-neutral-900 border border-transparent hover:border-neutral-600'} cursor-pointer`}
                      >
                        {item.tooltipImage || item.image ? (
                          <img src={item.tooltipImage || item.image} alt={item.name} className="w-10 h-10 object-contain bg-neutral-950 rounded p-0.5 flex-shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded flex-shrink-0 flex items-center justify-center text-[8px] text-white" style={{ backgroundColor: item.color !== 'transparent' ? item.color : '#333' }}>
                            {item.name.slice(0,3)}
                          </div>
                        )}
                        <div className="flex flex-col overflow-hidden min-w-0 flex-1">
                          <span className={`truncate text-xs ${selectedTypeId === item.typeId ? 'text-amber-500 font-bold' : 'text-neutral-300'}`}>{item.name}</span>
                          <span className="text-[10px] text-neutral-500 truncate">
                            {item.size.w}x{item.size.h} • {item.constraints.placementType || 'floor'}
                            {limitInfo && (
                              <span className={`ml-1 ${limitInfo.remaining <= 0 ? 'text-red-400 font-bold' : limitInfo.current > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                • Лимит: {limitInfo.current}/{limitInfo.max}
                              </span>
                            )}
                          </span>
                        </div>
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); onLoadForEditing(item.typeId); }} 
                        className="p-2.5 bg-neutral-900 hover:bg-amber-500 hover:text-neutral-950 text-amber-500 border border-transparent hover:border-amber-400 rounded transition text-xs flex items-center justify-center min-w-[36px] min-h-[44px] cursor-pointer" 
                        title="Редактировать в конструкторе"
                      >
                        ✎
                      </button>
                    </div>
                  );
                })}
                {filteredCatalog.length === 0 && (
                  <div className="text-center text-neutral-500 text-xs py-3">Ничего не найдено</div>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-neutral-400 block mb-1">
              Поворот {selectedAllowedRotations.length <= 1 && <span className="text-neutral-600 normal-case">(зафиксировано)</span>}
            </label>
            <div className="flex gap-1.5">
              {ALL_ROTATIONS.map(deg => {
                const isAllowed = selectedAllowedRotations.includes(deg);
                return (
                  <button
                    key={deg}
                    disabled={!isAllowed}
                    onClick={() => onCurrentRotationChange(deg)}
                    className={`flex-1 py-2 text-xs rounded transition min-h-[40px] ${
                      !isAllowed
                        ? 'bg-neutral-900 text-neutral-700 cursor-not-allowed'
                        : currentRotation === deg
                          ? 'bg-amber-500 text-neutral-950 font-bold cursor-pointer'
                          : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700 cursor-pointer'
                    }`}
                  >
                    {deg}°
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});