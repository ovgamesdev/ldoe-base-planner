import { TranslationKey, useLanguage } from '@/context/LanguageContext'
import { getItemName, SettlementLayerType, type CatalogItem, type NewBuildingState } from '@/lib/initial-data'
import React, { memo } from 'react'

interface RightSidebarProps {
  isCatalogBuilderVisible: boolean;
  newBuilding: NewBuildingState;
  allCategories: string[];
  catalog: CatalogItem[];
  onToggleVisibility: () => void;
  onSetNewBuilding: React.Dispatch<React.SetStateAction<NewBuildingState>>;
  onToggleNewBuildingRotation: (deg: number) => void;
  onSaveProduct: (e: React.FormEvent) => void;
  onDeleteProduct: (typeId: string) => void;
  onCloseMobile?: () => void;
}

export const RightSidebar = memo(function RightSidebar({
  isCatalogBuilderVisible,
  newBuilding,
  allCategories,
  catalog,
  onToggleVisibility,
  onSetNewBuilding,
  onToggleNewBuildingRotation,
  onSaveProduct,
  onDeleteProduct,
  onCloseMobile
}: RightSidebarProps) {
  const { t, language } = useLanguage();

  const isSettlementOrBoth = newBuilding.baseType === 'settlement' || newBuilding.baseType === 'both';
  const isSettlementOnly = newBuilding.baseType === 'settlement';
  const isEnergyOrWater = isSettlementOrBoth && (newBuilding.settlementLayer === 'energy' || newBuilding.settlementLayer === 'water');
  const isMainBaseOnly = newBuilding.baseType === 'main';

  const showDesksAndRooms = !isMainBaseOnly && !isEnergyOrWater;
  const showPlacementType = !isEnergyOrWater;

  const handleBaseTypeChange = (baseType: 'main' | 'settlement' | 'both') => {
    onSetNewBuilding(prev => ({
      ...prev,
      baseType,
      placementType: baseType === 'settlement' && prev.placementType === 'wall' ? 'floor' : prev.placementType
    }));
  };

  const handleDeleteProduct = (typeId: string) => {
    const itemName = getItemName(newBuilding.name, language);

    if (window.confirm(t('confirmDeleteCatalogItem', { name: itemName }))) {
      onDeleteProduct(typeId);
    }
  };

  return (
    <div className="relative h-full w-full bg-neutral-900 border-l border-neutral-800 overflow-hidden">
      <div
        className={`hidden md:flex flex-col h-full w-12 items-center py-4 absolute inset-y-0 left-0 transition-opacity duration-300 ${
          !isCatalogBuilderVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <button
          onClick={onToggleVisibility}
          title={t('openCatalogBuilder')}
          className="text-amber-500 hover:text-amber-400 font-bold p-2 text-lg cursor-pointer"
        >
          ⚙️
        </button>
      </div>

      <div
        className={`flex flex-col h-full w-80 text-xs overflow-y-auto custom-scrollbar p-4 transition-opacity duration-300 ${
          isCatalogBuilderVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-neutral-800 shrink-0">
          <h2 className="font-bold text-amber-500 text-sm flex items-center gap-2">
            <span>⚙️</span> {t('catalogBuilder')}
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleVisibility}
              className="hidden md:inline-block text-neutral-400 hover:text-white font-bold px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 cursor-pointer"
              title={t('collapsePanel')}
            >
              ✕
            </button>
            <button
              type="button"
              onClick={onCloseMobile}
              className="md:hidden text-neutral-400 hover:text-white font-bold px-2 py-1 rounded bg-neutral-800 border border-neutral-700 cursor-pointer"
            >
              {t('close')}
            </button>
          </div>
        </div>

        <form onSubmit={onSaveProduct} className="space-y-4">
          <div className="space-y-2">
            <div>
              <label className="block text-neutral-400 mb-1">{t('itemId')}</label>
              <input
                type="text"
                required
                value={newBuilding.typeId}
                onChange={e => onSetNewBuilding(prev => ({ ...prev, typeId: e.target.value }))}
                placeholder="e.g. settlement_pump"
                className="w-full bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1.5 text-white focus:border-amber-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-neutral-400 mb-1">{t('nameRuLabel')}</label>
              <input
                type="text"
                value={newBuilding.name.ru}
                onChange={e => onSetNewBuilding(prev => ({ ...prev, name: { ...prev.name, ru: e.target.value } }))}
                className="w-full bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1.5 text-white focus:border-amber-500 outline-none"
                placeholder="Название объекта"
              />
            </div>

            <div>
              <label className="block text-neutral-400 mb-1">{t('nameEnLabel')}</label>
              <input
                type="text"
                value={newBuilding.name.en}
                onChange={e => onSetNewBuilding(prev => ({ ...prev, name: { ...prev.name, en: e.target.value } }))}
                className="w-full bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1.5 text-white focus:border-amber-500 outline-none"
                placeholder="Name object"
              />
            </div>

            <div>
              <label className="block text-neutral-400 mb-1">{t('categoryLabel')}</label>
              <input
                type="text"
                list="catalog-categories-list"
                value={newBuilding.category}
                onChange={e => onSetNewBuilding(prev => ({ ...prev, category: e.target.value }))}
                placeholder="workstation / decoration / energy / etc."
                className="w-full bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1.5 text-white focus:border-amber-500 outline-none"
              />
              <datalist id="catalog-categories-list">
                {allCategories.map(cat => (
                  <option key={cat} value={cat}>{t(cat as TranslationKey)}</option>
                ))}
              </datalist>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-neutral-400 mb-1">{t('widthLabel')}</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={newBuilding.w}
                  onChange={e => onSetNewBuilding(prev => ({ ...prev, w: Math.max(1, parseInt(e.target.value) || 1) }))}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1.5 text-white focus:border-amber-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-neutral-400 mb-1">{t('heightLabel')}</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={newBuilding.h}
                  onChange={e => onSetNewBuilding(prev => ({ ...prev, h: Math.max(1, parseInt(e.target.value) || 1) }))}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1.5 text-white focus:border-amber-500 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-neutral-400 mb-1">{t('imagePathLabel')}</label>
              <input
                type="text"
                value={newBuilding.image}
                onChange={e => onSetNewBuilding(prev => ({ ...prev, image: e.target.value }))}
                placeholder="/images/items/pump.png"
                className="w-full bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1.5 text-white focus:border-amber-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-neutral-400 mb-1">
                {t('visualOverflowLabel')}
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {([
                  ['visualOverflowTop', 'top'],
                  ['visualOverflowRight', 'right'],
                  ['visualOverflowBottom', 'bottom'],
                  ['visualOverflowLeft', 'left']
                ] as const).map(([field, label]) => (
                  <div key={field}>
                    <span className="block text-neutral-500 text-[10px] text-center mb-0.5">{label}</span>
                    <input
                      type="number"
                      min={0}
                      max={5}
                      step={0.05}
                      value={newBuilding[field]}
                      onChange={e => onSetNewBuilding(prev => ({ ...prev, [field]: Math.max(0, parseFloat(e.target.value) || 0) }))}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded px-1.5 py-1.5 text-white text-center focus:border-amber-500 outline-none"
                    />
                  </div>
                ))}
              </div>
              <p className="text-neutral-500 text-[10px] mt-1">
                {t('visualOverflowHint')}
              </p>
            </div>

            <div>
              <label className="block text-neutral-400 mb-1">{t('tooltipImageLabel')}</label>
              <input
                type="text"
                value={newBuilding.tooltipImage}
                onChange={e => onSetNewBuilding(prev => ({ ...prev, tooltipImage: e.target.value }))}
                placeholder="/images/tooltips/pump_info.png"
                className="w-full bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1.5 text-white focus:border-amber-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-neutral-400 mb-1">{t('fillColorLabel')}</label>
              <label className="flex items-center gap-2 text-neutral-300 mb-2 cursor-pointer text-xs py-1">
                <input type="checkbox" checked={newBuilding.color === 'transparent'} onChange={e => onSetNewBuilding(prev => ({ ...prev, color: e.target.checked ? 'transparent' : '#4b5563' }))} className="w-4 h-4 rounded bg-neutral-800 border-neutral-700 text-amber-500 focus:ring-0" /> {t('transparentColor')}
              </label>
              {newBuilding.color !== 'transparent' && (
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    value={newBuilding.color || '#4b5563'}
                    onChange={e => onSetNewBuilding(prev => ({ ...prev, color: e.target.value }))}
                    className="w-8 h-8 rounded border border-neutral-700 bg-transparent cursor-pointer"
                  />
                  <input
                    type="text"
                    value={newBuilding.color}
                    onChange={e => onSetNewBuilding(prev => ({ ...prev, color: e.target.value }))}
                    placeholder="#4b5563"
                    className="flex-1 bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1.5 text-white focus:border-amber-500 outline-none"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-neutral-800 space-y-2">
            <h3 className="font-bold text-amber-500">{t('baseCompatibility')}</h3>

            <div>
              <label className="block text-neutral-400 mb-1">{t('baseLabel')}</label>
              <select
                value={newBuilding.baseType}
                onChange={e => handleBaseTypeChange(e.target.value as "main" | "settlement" | "both")}
                className="w-full bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1.5 text-white focus:border-amber-500 outline-none"
              >
                <option value="main">{t('mainBase')}</option>
                <option value="settlement">{t('settlement')}</option>
                <option value="both">{t('allBases')}</option>
              </select>
            </div>

            {isSettlementOrBoth && (
              <div>
                <label className="block text-neutral-400 mb-1">{t('settlementLayerLabel')}</label>
                <select
                  value={newBuilding.settlementLayer || 'objects'}
                  onChange={e => onSetNewBuilding(prev => ({ ...prev, settlementLayer: e.target.value as SettlementLayerType }))}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1.5 text-white focus:border-amber-500 outline-none"
                >
                  <option value="objects">{t('itemsAndBuildings')}</option>
                  <option value="energy">{t('energy')}</option>
                  <option value="water">{t('water')}</option>
                </select>
              </div>
            )}
          </div>

          {isSettlementOrBoth && (
            <div className="pt-3 border-t border-neutral-800 space-y-2">
              <h3 className="font-bold text-amber-500">{t('settlementResources')}</h3>
              <label className="flex items-center gap-2 text-neutral-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!newBuilding.requiresPower}
                  onChange={e => onSetNewBuilding(prev => ({ ...prev, requiresPower: e.target.checked }))}
                  className="accent-amber-500 rounded"
                />
                <span>{t('requiresPowerCheckbox')}</span>
              </label>
              <label className="flex items-center gap-2 text-neutral-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!newBuilding.requiresWater}
                  onChange={e => onSetNewBuilding(prev => ({ ...prev, requiresWater: e.target.checked }))}
                  className="accent-amber-500 rounded"
                />
                <span>{t('requiresWaterCheckbox')}</span>
              </label>
            </div>
          )}

          <div className="pt-3 border-t border-neutral-800 space-y-2">
            <h3 className="font-bold text-amber-500">{t('rotationAndAutoTiling')}</h3>

            <label className="flex items-center gap-2 text-neutral-300 cursor-pointer">
              <input
                type="checkbox"
                checked={newBuilding.autoTiling}
                onChange={e => onSetNewBuilding(prev => ({ ...prev, autoTiling: e.target.checked }))}
                className="accent-amber-500 rounded"
              />
              <span>{t('enableAutoTiling')}</span>
            </label>

            {!newBuilding.autoTiling ? (
              <div>
                <label className="block text-neutral-400 mb-1">{t('allowedRotationsLabel')}</label>
                <div className="flex gap-1.5">
                  {[0, 90, 180, 270].map(deg => (
                    <button
                      type="button"
                      key={deg}
                      onClick={() => onToggleNewBuildingRotation(deg)}
                      className={`flex-1 py-2 rounded text-xs font-bold transition min-h-[40px] ${newBuilding.allowedRotations.includes(deg) ? 'bg-amber-500 text-neutral-950' : 'bg-neutral-950 text-neutral-500 border border-neutral-800'} cursor-pointer`}
                    >
                      {deg}°
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div>
                  <label className="block text-neutral-400 mb-1">{t('connectsToLabel')}</label>
                  <input
                    type="text"
                    value={newBuilding.connectsTo}
                    onChange={e => onSetNewBuilding(prev => ({ ...prev, connectsTo: e.target.value }))}
                    placeholder="settlement_wall_lvl1, settlement_wall_lvl2"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1.5 text-white focus:border-amber-500 outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-neutral-400">{t('tileVariationImages')}</label>
                  {(['single', 'end', 'straight', 'corner', 'tee', 'cross'] as const).map(variant => (
                    <div key={variant} className="flex items-center gap-2">
                      <span className="w-16 text-neutral-400 text-[10px] uppercase">{variant}:</span>
                      <input
                        type="text"
                        value={newBuilding.autoTileImages[variant] || ''}
                        onChange={e =>
                          onSetNewBuilding(prev => ({
                            ...prev,
                            autoTileImages: { ...prev.autoTileImages, [variant]: e.target.value }
                          }))
                        }
                        placeholder={`/images/${variant}.png`}
                        className="flex-1 bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-white focus:border-amber-500 outline-none"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {showPlacementType && (
            <div className="pt-3 border-t border-neutral-800 space-y-2">
              <h3 className="font-bold text-amber-500">{t('placementTypeHeader')}</h3>

              <div>
                <label className="block text-neutral-400 mb-1">{t('placementLabel')}</label>
                <select
                  value={newBuilding.placementType}
                  onChange={e => onSetNewBuilding(prev => ({ ...prev, placementType: e.target.value as "floor" | "ground" | "wall" | "any" }))}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1.5 text-white focus:border-amber-500 outline-none"
                >
                  <option value="floor">{t('placementFloor')}</option>
                  <option value="ground">{t('placementGround')}</option>
                  {!isSettlementOnly && <option value="wall">{t('placementWall')}</option>}
                  <option value="any">{t('placementAny')}</option>
                </select>
              </div>

              {(newBuilding.placementType === 'floor' || newBuilding.placementType === 'any') && (
                <div>
                  <label className="block text-neutral-400 mb-1">{t('minFloorLvlLabel')}</label>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={newBuilding.minFloorLvl}
                    onChange={e => onSetNewBuilding(prev => ({ ...prev, minFloorLvl: parseInt(e.target.value) || 1 }))}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1.5 text-white focus:border-amber-500 outline-none"
                  />
                </div>
              )}

              {newBuilding.placementType === 'wall' && (
                <div>
                  <label className="block text-neutral-400 mb-1">{t('minWallLvlLabel')}</label>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={newBuilding.minWallLvl}
                    onChange={e => onSetNewBuilding(prev => ({ ...prev, minWallLvl: parseInt(e.target.value) || 1 }))}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1.5 text-white focus:border-amber-500 outline-none"
                  />
                </div>
              )}

              {!isSettlementOnly && newBuilding.placementType === 'wall' && (
                <label className="flex items-center gap-2 text-neutral-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newBuilding.allowWindowWall}
                    onChange={e => onSetNewBuilding(prev => ({ ...prev, allowWindowWall: e.target.checked }))}
                    className="accent-amber-500 rounded"
                  />
                  <span>{t('allowWindowWall')}</span>
                </label>
              )}

              {!isSettlementOnly && (
                <label className="flex items-center gap-2 text-neutral-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newBuilding.allowWallDecorAbove}
                    onChange={e => onSetNewBuilding(prev => ({ ...prev, allowWallDecorAbove: e.target.checked }))}
                    className="accent-amber-500 rounded"
                  />
                  <span>{t('allowWallDecorAbove')}</span>
                </label>
              )}
            </div>
          )}

          {showDesksAndRooms && (
            <div className="pt-3 border-t border-neutral-800 space-y-2">
              <h3 className="font-bold text-amber-500">{t('roomsAndDesks')}</h3>

              <div>
                <label className="block text-neutral-400 mb-1">{t('isDeskCode')}</label>
                <input
                  type="text"
                  value={newBuilding.isDesk}
                  onChange={e => onSetNewBuilding(prev => ({ ...prev, isDesk: e.target.value }))}
                  placeholder="e.g. desk_substation"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1.5 text-white focus:border-amber-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-neutral-400 mb-1">{t('requiredDeskCode')}</label>
                <input
                  type="text"
                  value={newBuilding.requiredDesk}
                  onChange={e => onSetNewBuilding(prev => ({ ...prev, requiredDesk: e.target.value }))}
                  placeholder="e.g. desk_substation"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1.5 text-white focus:border-amber-500 outline-none"
                />
              </div>
            </div>
          )}

          <div className="pt-3 border-t border-neutral-800 space-y-2">
            <h3 className="font-bold text-amber-500">{t('quantityLimits')}</h3>

            <div>
              <label className="block text-neutral-400 mb-1">{t('maxPerBaseLabel')}</label>
              <input
                type="number"
                min={1}
                max={999}
                value={newBuilding.maxCount}
                onChange={e => onSetNewBuilding(prev => ({ ...prev, maxCount: parseInt(e.target.value) || 99 }))}
                className="w-full bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1.5 text-white focus:border-amber-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-neutral-400 mb-1">{t('sharedLimitGroupLabel')}</label>
              <input
                type="text"
                value={newBuilding.sharedLimitGroup}
                onChange={e => onSetNewBuilding(prev => ({ ...prev, sharedLimitGroup: e.target.value }))}
                placeholder="e.g. settlement_generators"
                className="w-full bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1.5 text-white focus:border-amber-500 outline-none"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-neutral-800 space-y-2">
            <button
              type="submit"
              className="w-full bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold py-2 px-4 rounded text-xs transition-colors cursor-pointer"
            >
              {catalog.some(c => c.typeId === newBuilding.typeId) ? t('updateItemBtn') : t('addItemBtn')}
            </button>

            {catalog.some(c => c.typeId === newBuilding.typeId) && (
              <button
                type="button"
                onClick={() => handleDeleteProduct(newBuilding.typeId)}
                className="w-full bg-red-900/60 hover:bg-red-800/80 border border-red-700/60 text-red-200 font-bold py-1.5 px-4 rounded text-xs transition-colors cursor-pointer"
              >
                {t('deleteFromCatalogBtn')}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
});