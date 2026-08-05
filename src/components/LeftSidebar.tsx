import { getAssetPath } from '@/lib/grid-utils'
import Link from 'next/link'
import React, { memo, useCallback, useEffect, useRef, useState } from 'react'
import { TranslationKey, useLanguage } from '../context/LanguageContext'
import type { Tool, ViewMode } from '../lib/constants'
import { ALL_ROTATIONS } from '../lib/constants'
import { clearConsent } from '../lib/cookie-consent'
import type { BaseType, CatalogItem, MapData, SettlementLayerType } from '../lib/initial-data'
import { getItemName, searchMatchesName } from '../lib/initial-data'
import { isDefaultMapName } from './MainPlannerClient'

interface LeftSidebarProps {
  gridW: number;
  gridH: number;
  maps: MapData[];
  fullMapState: MapData;
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
  activeBaseType: BaseType;
  activeSettlementLayer: SettlementLayerType;
  
  onCloseMobile?: () => void;
  onGoogleSignIn?: () => void;
  onSignOut?: () => void;
  onCreateMap: () => void;
  onDeleteMap: (id: string) => void;
  onRenameMap: (name: string) => void;
  onSetActiveMapId: (id: string) => void;
  onExportMap: () => void;
  onImportMap: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onShareMap: () => void;
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
  onSetActiveBaseType: (base: BaseType) => void;
  onSetActiveSettlementLayer: (layer: SettlementLayerType) => void;
  objectListRef: React.RefObject<HTMLDivElement | null>;
}

export const LeftSidebar = memo(function LeftSidebar({
  gridW,
  gridH,
  maps,
  fullMapState,
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
  activeBaseType,
  activeSettlementLayer,
  onCloseMobile,
  onGoogleSignIn,
  onSignOut,
  onCreateMap,
  onDeleteMap,
  onRenameMap,
  onSetActiveMapId,
  onExportMap,
  onImportMap,
  onShareMap,
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
  onSetActiveBaseType,
  onSetActiveSettlementLayer,
  objectListRef,
}: LeftSidebarProps) {
  const { t, language, setLanguage } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const catalogInputRef = useRef<HTMLInputElement>(null);

  const [localZoom, setLocalZoom] = useState(zoom);
  const [isEditingMapName, setIsEditingMapName] = useState(false);

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

  const handleDeleteMap = () => {
    if (window.confirm(t('deleteMapConfirm', { name: fullMapState.name }))) {
      onDeleteMap(fullMapState.id);
    }
  };

  const handleExportMap = () => {
    if (isDefaultMapName(fullMapState.name)) {
      alert(t('renameMapBeforeExport'));
      setIsEditingMapName(true);
      return;
    }
    onExportMap();
  };

  const handleShareMap = () => {
    if (isDefaultMapName(fullMapState.name)) {
      alert(t('renameMapBeforeShare'));
      setIsEditingMapName(true);
      return;
    }
    onShareMap();
  };

  const handleCookieSettings = () => {
    clearConsent();
  };

  const handleResetCatalog = () => {
    if (window.confirm(t('resetCatalogConfirm'))) {
      onResetCatalog();
    }
  };

  const filteredCatalog = catalog.filter(item => {
    if (item.constraints.baseType && item.constraints.baseType !== 'both' && item.constraints.baseType !== activeBaseType) return false;

    if (activeBaseType === 'settlement') {
      const itemLayer = item.constraints.settlementLayer || 'objects';
      if (itemLayer !== activeSettlementLayer) {
        const isRes = (activeSettlementLayer === 'objects' && (item.constraints.settlementLayer === 'energy' || item.constraints.settlementLayer === 'water')) ||
                      (activeSettlementLayer === 'objects' && item.constraints.requiresPower) ||
                      (activeSettlementLayer === 'objects' && item.constraints.requiresWater);
        if (!isRes) return false;
      }
    }
    const matchesCategory = searchCategory === 'all' || item.category === searchCategory;
    const matchesQuery = searchMatchesName(item.name, searchQuery) || item.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesQuery;
  });

  const maxFloorLevel = activeBaseType === 'settlement' ? 3 : 5;
  const maxWallLevel = activeBaseType === 'settlement' ? 2 : 5;

  return (
    <div className="w-full md:w-80 bg-neutral-900 border-r border-neutral-800 p-4 flex flex-col gap-4 overflow-y-auto custom-scrollbar z-10 h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-amber-500 tracking-wide">LDOE BASE PLANNER</h1>
          <p className="text-xs text-neutral-400">{t('grid')}: {gridW}x{gridH} {t('cells')}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-neutral-950 p-1 rounded border border-neutral-800 text-xs font-bold">
            <button
              onClick={() => setLanguage('ru')}
              className={`px-2 py-0.5 rounded transition ${language === 'ru' ? 'bg-amber-500 text-neutral-950' : 'text-neutral-400 hover:text-white'} cursor-pointer`}
            >
              RU
            </button>
            <button
              onClick={() => setLanguage('en')}
              className={`px-2 py-0.5 rounded transition ${language === 'en' ? 'bg-amber-500 text-neutral-950' : 'text-neutral-400 hover:text-white'} cursor-pointer`}
            >
              EN
            </button>
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
      </div>

      <div className="flex bg-neutral-950 p-1 rounded border border-neutral-800">
        <button onClick={() => { onSetActiveBaseType('main'); if (buildLevel > 5) onSetBuildLevel(5); }} className={`flex-1 py-1.5 text-xs font-bold rounded transition ${activeBaseType === 'main' ? 'bg-amber-500 text-neutral-950' : 'text-neutral-400 hover:text-white'} cursor-pointer`}>{t('mainBaseTab')}</button>
        <button onClick={() => { onSetActiveBaseType('settlement'); if (buildLevel > 3) onSetBuildLevel(3); }} className={`flex-1 py-1.5 text-xs font-bold rounded transition ${activeBaseType === 'settlement' ? 'bg-amber-500 text-neutral-950' : 'text-neutral-400 hover:text-white'} cursor-pointer`}>{t('settlementTab')}</button>
      </div>

      {activeBaseType === 'settlement' && (
        <div className="flex bg-neutral-900 p-1 rounded border border-neutral-800">
          <button onClick={() => onSetActiveSettlementLayer('objects')} className={`flex-1 py-1 text-xs font-bold rounded transition ${activeSettlementLayer === 'objects' ? 'bg-blue-600 text-white' : 'text-neutral-400 hover:text-white'} cursor-pointer`}>{t('objects')}</button>
          <button onClick={() => onSetActiveSettlementLayer('energy')} className={`flex-1 py-1 text-xs font-bold rounded transition ${activeSettlementLayer === 'energy' ? 'bg-yellow-500 text-neutral-950' : 'text-neutral-400 hover:text-white'} cursor-pointer`}>{t('energy')}</button>
          <button onClick={() => onSetActiveSettlementLayer('water')} className={`flex-1 py-1 text-xs font-bold rounded transition ${activeSettlementLayer === 'water' ? 'bg-cyan-500 text-neutral-950' : 'text-neutral-400 hover:text-white'} cursor-pointer`}>{t('waterTab')}</button>
        </div>
      )}

      <div className="space-y-3 bg-neutral-950 p-3 rounded border border-neutral-800">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">{t('mapManager')}</span>
          <button onClick={onCreateMap} className="bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold px-3 py-1.5 rounded text-xs transition cursor-pointer">
            {t('newMapBtn')}
          </button>
        </div>

        <div>
          <label className="block text-[11px] text-neutral-400 mb-1">{t('selectMapLabel')}</label>
          {isEditingMapName ? (
            <div className="flex gap-1">
              <input
                type="text"
                value={fullMapState.name}
                onChange={e => onRenameMap(e.target.value)}
                className="flex-1 min-w-0 bg-neutral-900 border border-amber-500 text-xs rounded p-2 focus:outline-none focus:border-amber-500 text-white"
                autoFocus
              />
              <button
                onClick={() => setIsEditingMapName(false)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white w-8 rounded text-xs transition cursor-pointer shrink-0"
                title={t('save')}
              >
                ✓
              </button>
            </div>
          ) : (
            <>
              <select value={activeMapId} onChange={e => onSetActiveMapId(e.target.value)} className="w-full bg-neutral-900 border border-neutral-800 text-xs rounded p-2 focus:outline-none focus:border-amber-500 custom-scrollbar cursor-pointer text-white">
                {availableMaps.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
              <div className="flex gap-1 mt-1">
                <button
                  onClick={() => setIsEditingMapName(true)}
                  className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-amber-500 py-1.5 rounded text-xs transition cursor-pointer"
                  title={t('rename')}
                >
                  {t('renameBtn')}
                </button>
                {maps.length > 1 && (
                  <button onClick={handleDeleteMap} className="flex-1 bg-red-900/40 hover:bg-red-800 text-red-300 border border-red-800/50 py-1.5 rounded text-xs transition cursor-pointer" title={t('deleteMap')}>
                    {t('deleteMapBtn')}
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-neutral-800">
          <button onClick={handleExportMap} className="bg-neutral-800 hover:bg-neutral-700 py-2 px-2 rounded text-xs transition min-h-[40px] cursor-pointer text-white">{t('exportBtn')}</button>
          <button onClick={() => fileInputRef.current?.click()} className="bg-neutral-800 hover:bg-neutral-700 py-2 px-2 rounded text-xs transition min-h-[40px] cursor-pointer text-white">{t('importBtn')}</button>
        </div>
        <button
          onClick={handleShareMap}
          className="w-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/40 py-2 px-2 rounded text-xs transition min-h-[40px] cursor-pointer flex items-center justify-center gap-1.5 font-bold"
        >
          <span>🔗</span> {t('shareBtn')}
        </button>
        {(onGoogleSignIn || onSignOut) && (
          <div className="flex gap-2 pt-2 border-t border-neutral-800">
            {onGoogleSignIn && (
              <button
                onClick={onGoogleSignIn}
                className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-amber-400 py-1.5 px-2 rounded text-xs transition cursor-pointer flex items-center justify-center gap-1.5 font-medium"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.761H12.545z"/>
                </svg>
                {t('signIn')}
              </button>
            )}
            {onSignOut && (
              <button
                onClick={onSignOut}
                className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-red-400 py-1.5 px-2 rounded text-xs transition cursor-pointer flex items-center justify-center gap-1.5 font-medium"
              >
                {t('signOut')}
              </button>
            )}
          </div>
        )}
        <input type="file" ref={fileInputRef} onChange={onImportMap} accept=".json" className="hidden" />

        <div className="pt-2 border-t border-neutral-800 flex items-center justify-between text-xs">
          <span className="font-bold uppercase tracking-wider text-neutral-500">{t('catalog')}</span>
          <div className="flex gap-2">
            <button onClick={onExportCatalog} className="text-blue-400 underline p-1 cursor-pointer">{t('exportBtn')}</button>
            <button onClick={() => catalogInputRef.current?.click()} className="text-emerald-400 underline p-1 cursor-pointer">{t('importBtn')}</button>
            <button onClick={handleResetCatalog} className="text-red-400 underline p-1 cursor-pointer">{t('resetBtn')}</button>
          </div>
          <input type="file" ref={catalogInputRef} onChange={onImportCatalog} accept=".json" className="hidden" />
        </div>
      </div>

      <div className="space-y-2 bg-neutral-950 p-3 rounded border border-neutral-800">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">{t('viewCamera')}</span>
          <div className="flex gap-1 bg-neutral-900 p-1 rounded border border-neutral-700">
            <button onClick={() => onSetViewMode('topDown')} className={`px-2.5 py-1 text-xs uppercase font-bold rounded transition ${viewMode === 'topDown' ? 'bg-amber-500 text-neutral-950' : 'text-neutral-400 hover:text-white'} cursor-pointer`}>2D</button>
            <button onClick={() => onSetViewMode('topDown45')} className={`px-2.5 py-1 text-xs uppercase font-bold rounded transition ${viewMode === 'topDown45' ? 'bg-amber-500 text-neutral-950' : 'text-neutral-400 hover:text-white'} cursor-pointer`}>2D 45°</button>
          </div>
        </div>
        
        <div className="flex items-center gap-2 pt-1">
          <button onClick={() => dispatchZoomEvent(localZoom - 0.1)} className="w-9 h-9 bg-neutral-800 hover:bg-neutral-700 rounded text-sm font-bold flex items-center justify-center cursor-pointer text-white">-</button>
          <input type="range" min={30} max={500} step={10} value={Math.round(localZoom * 100)} onChange={e => dispatchZoomEvent(Number(e.target.value) / 100)} className="flex-1 accent-amber-500 h-6 cursor-pointer" />
          <button onClick={() => dispatchZoomEvent(localZoom + 0.1)} className="w-9 h-9 bg-neutral-800 hover:bg-neutral-700 rounded text-sm font-bold flex items-center justify-center cursor-pointer text-white">+</button>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-neutral-500 font-mono">{Math.round(localZoom * 100)}%</span>
          <button onClick={onResetCamera} className="text-xs text-amber-400 underline p-1 cursor-pointer">{t('resetCamera')}</button>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-bold uppercase tracking-wider text-neutral-400">{t('drawingTools')}</label>
        <div className="grid grid-cols-2 gap-2">
          {(['floor', 'wall', 'object', 'nobuild', 'eraser', 'hand'] as const).map(toolKey => (
            <button
              key={toolKey}
              onClick={() => onSetActiveTool(toolKey)}
              className={`py-3 px-3 text-center rounded text-xs font-medium transition min-h-[52px] md:min-h-[44px] flex flex-col md:flex-row items-center justify-center gap-1 ${activeTool === toolKey ? 'bg-amber-500 text-neutral-950 font-bold shadow-lg' : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300'} cursor-pointer`}
            >
              <span className="text-lg md:text-base">{toolKey === 'floor' ? '🟫' : toolKey === 'wall' ? '🧱' : toolKey === 'object' ? '🏠' : toolKey === 'nobuild' ? '🚫' : toolKey === 'eraser' ? '🗑️' : '✋'}</span>
              <span className="text-[10px] md:text-xs leading-tight">{t(toolKey)}</span>
            </button>
          ))}
        </div>
      </div>

      {(activeTool === 'floor' || activeTool === 'wall') && (
        <div className="space-y-3 bg-neutral-950 p-3 rounded border border-neutral-800">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-neutral-400 block mb-1.5">{t('materialLevel')}</label>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map(lvl => (
                <button key={lvl} onClick={() => onSetBuildLevel(lvl)} disabled={activeTool === 'floor' ? lvl > maxFloorLevel : lvl > maxWallLevel} className={`flex-1 py-2 rounded text-xs font-bold min-h-[40px] ${buildLevel === lvl ? 'bg-amber-500 text-neutral-950' : 'bg-neutral-800 text-neutral-400'} disabled:opacity-30 cursor-pointer`}>
                Lvl {lvl}
              </button>
            ))}
          </div>
          </div>
          {activeTool === 'wall' && (
            <div className="flex gap-3 text-xs select-none text-neutral-300 pt-1">
              <label className="flex items-center gap-1.5 cursor-pointer py-1 hover:text-white">
                <input type="radio" checked={!isDoorPlacement && !isWindowPlacement} onChange={() => { onSetDoorPlacement(false); onSetWindowPlacement(false); }} className="accent-amber-500 w-4 h-4 cursor-pointer" />
                {t('wall')}
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer py-1 hover:text-white">
                <input type="radio" checked={isDoorPlacement} onChange={() => { onSetDoorPlacement(true); onSetWindowPlacement(false); }} className="accent-amber-500 w-4 h-4 cursor-pointer" />
                {t('door')}
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer py-1 hover:text-white">
                <input type="radio" checked={isWindowPlacement} onChange={() => { onSetDoorPlacement(false); onSetWindowPlacement(true); }} className="accent-amber-500 w-4 h-4 cursor-pointer" />
                {t('window')}
              </label>
            </div>
          )}
        </div>
      )}

      {activeTool === 'object' && (
        <div className="space-y-3">
          <div>
            <div className="mb-1">
              <label className="text-xs font-bold uppercase tracking-wider text-neutral-400 block">
                {t('selectBuildingOrDecor')}
              </label>
              {selectedTypeId && (
                <div className="text-xs text-amber-500 mt-0.5 truncate">
                  {t('selectedBuilding')} {getItemName(catalog.find(c => c.typeId === selectedTypeId)?.name, language)}
                </div>
              )}
            </div>

            <div className="bg-neutral-800 border border-neutral-700 rounded p-2 space-y-2">
              <div className="flex flex-col md:flex-row gap-1.5 md:gap-1">
              <select
                value={searchCategory}
                onChange={e => onSetSearchCategory(e.target.value)}
                className="w-full md:w-[42%] shrink-0 bg-neutral-950 border border-neutral-800 rounded p-2.5 md:p-2 text-xs text-white focus:outline-none focus:border-amber-500 custom-scrollbar cursor-pointer"
              >
                <option value="all">{t('allCategories')}</option>
                {uniqueCategories.map(c => <option key={c} value={c}>{t(c as TranslationKey)}</option>)}
              </select>
                <div className="relative flex-1">
              <input
                type="text"
                placeholder={t('searchPlaceholder')}
                value={searchQuery}
                onChange={e => onSetSearchQuery(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded p-2.5 md:p-2 pr-9 md:pr-7 text-xs text-white focus:outline-none focus:border-amber-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={onClearSearch}
                  className="absolute right-2 md:right-1.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white text-base md:text-sm p-1 cursor-pointer"
                  title={t('clearSearch')}
                >
                  ✕
                </button>
              )}
            </div>
          </div>
              <div ref={objectListRef} className="h-72 md:h-72 overflow-y-auto overflow-x-hidden space-y-2 md:space-y-1.5 pr-1 custom-scrollbar">
                {filteredCatalog.map((item, idx) => {
                  const limitInfo = (() => {
                    const max = item.constraints.maxPerBase;
                    if (!max) return null;
                    let current = 0;
                    if (item.constraints.sharedLimitGroup) {
                      current = fullMapState[`${activeBaseType === 'main' ? 'mainBase' : 'settlementBase'}`].layers.objects.filter(obj => {
                        const tItem = catalogMap[obj.typeId];
                        return tItem?.constraints.sharedLimitGroup === item.constraints.sharedLimitGroup;
                      }).length;
                    } else {
                      current = fullMapState[`${activeBaseType === 'main' ? 'mainBase' : 'settlementBase'}`].layers.objects.filter(obj => obj.typeId === item.typeId).length;
                    }
                    return { current, max, remaining: max - current };
                  })();

                  const itemName = getItemName(item.name, language);

                  return (
                    <div
                      key={item.typeId}
                      data-type-id={item.typeId}
                      draggable
                      onDragStart={() => onDragStart(idx)}
                      onDragOver={(e) => onDragOver(e, idx)}
                      onDrop={onDrop}
                      onDragEnd={onDragEnd}
                      className={`flex gap-1.5 md:gap-1 items-center transition ${dragItemIndex === idx ? 'opacity-40' : ''} ${dragOverItemIndex === idx && dragItemIndex !== idx ? 'border-t-2 border-amber-500' : ''}`}
                    >
                      <button
                        onClick={() => onSelectBuildingType(item.typeId)}
                        className={`flex-1 text-left flex items-center gap-2.5 md:gap-2 p-3 md:p-2 rounded transition min-w-0 min-h-[56px] md:min-h-[44px] ${selectedTypeId === item.typeId ? 'bg-amber-500/20 border-2 md:border border-amber-500 shadow-lg md:shadow-none' : 'bg-neutral-900 border border-transparent hover:border-neutral-600'} cursor-pointer active:scale-95`}
                      >
                        {item.tooltipImage || item.image ? (
                          <img src={getAssetPath(item.tooltipImage || item.image)} alt={itemName} className="w-12 h-12 md:w-10 md:h-10 object-contain bg-neutral-950 rounded p-1 md:p-0.5 shrink-0" />
                          ) : (
                          <div className="w-12 h-12 md:w-10 md:h-10 rounded shrink-0 flex items-center justify-center text-[9px] md:text-[8px] text-white" style={{ backgroundColor: item.color !== 'transparent' ? item.color : '#333' }}>
                            {itemName.slice(0, 3)}
                        </div>
                        )}
                        <div className="flex flex-col overflow-hidden min-w-0 flex-1">
                          <span className={`truncate text-sm md:text-xs ${selectedTypeId === item.typeId ? 'text-amber-500 font-bold' : 'text-neutral-300'}`}>{itemName}</span>
                          <span className="text-[11px] md:text-[10px] text-neutral-500 truncate">
                            {item.size.w}x{item.size.h} • {t(item.constraints.placementType as TranslationKey || 'floor')}
                            {limitInfo && (
                              <span className={`ml-1 ${limitInfo.remaining <= 0 ? 'text-red-400 font-bold' : limitInfo.current > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                • {limitInfo.current}/{limitInfo.max}
                          </span>
                        )}
                  </span>
                  </div>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onLoadForEditing(item.typeId); }}
                    className="p-3 md:p-2.5 bg-neutral-900 hover:bg-amber-500 hover:text-neutral-950 text-amber-500 border border-transparent hover:border-amber-400 rounded transition text-base md:text-xs flex items-center justify-center min-w-[44px] md:min-w-[36px] min-h-[56px] md:min-h-[44px] cursor-pointer active:scale-95 shrink-0"
                    title={t('editInConstructor')}
                      >
                    ✎
                      </button>
                    </div>
                  );
                })}
            {filteredCatalog.length === 0 && (
                <div className="text-center text-neutral-500 text-sm md:text-xs py-4 md:py-3">{t('nothingFound')}</div>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-neutral-400 block mb-1">
              {t('rotationHeading')} {selectedAllowedRotations.length <= 1 && <span className="text-neutral-600 normal-case">{t('fixedRotation')}</span>}
            </label>
            <div className="flex gap-1.5">
              {ALL_ROTATIONS.map(deg => {
                const isAllowed = selectedAllowedRotations.includes(deg);
                return (
                  <button
                    key={deg}
                    disabled={!isAllowed}
                    onClick={() => onCurrentRotationChange(deg)}
                    className={`flex-1 py-3 md:py-2 text-xs rounded transition min-h-[48px] md:min-h-[40px] ${
                      !isAllowed
                        ? 'bg-neutral-900 text-neutral-700 cursor-not-allowed'
                        : currentRotation === deg
                          ? 'bg-amber-500 text-neutral-950 font-bold shadow-lg cursor-pointer'
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

      <div className="pt-3 mt-auto border-t border-neutral-800 flex items-center justify-center gap-4 text-[11px] text-neutral-500 flex-wrap">
        <Link href={`/${language}/privacy`} className="hover:text-neutral-300 transition underline">
          {t('privacyPolicy')}
        </Link>
        <span>•</span>
        <Link href={`/${language}/terms`} className="hover:text-neutral-300 transition underline">
          {t('termsOfService')}
        </Link>
        <span>•</span>
        <button
          type="button"
          onClick={handleCookieSettings}
          className="hover:text-neutral-300 transition underline cursor-pointer"
        >
          {t('cookieSettings')}
        </button>
      </div>
    </div>
  );
});