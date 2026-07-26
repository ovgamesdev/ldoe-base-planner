import React, { memo } from 'react'
import { CATEGORY_LABELS } from '../lib/constants'
import type { CatalogItem, ColorVariant } from '../lib/initial-data'

interface NewBuildingState {
  typeId: string;
  name: string;
  category: string;
  w: number;
  h: number;
  image: string;
  tooltipImage: string;
  color: string;
  allowedRotations: number[];
  placementType: 'floor' | 'ground' | 'wall' | 'any';
  minFloorLvl: number;
  minWallLvl: number;
  allowWindowWall: boolean;
  allowWallDecorAbove: boolean;
  maxCount: number;
  sharedLimitGroup: string;
  autoTiling: boolean;
  connectsTo: string;
  autoTileImages: Record<string, string>;
  colorVariants: ColorVariant[];
}

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
  const isEditing = catalog.some(c => c.typeId === newBuilding.typeId);

  return (
    <div className={`w-full ${isCatalogBuilderVisible ? 'md:w-80 p-4' : 'md:w-12 p-2'} bg-neutral-900 border-l border-neutral-800 overflow-y-auto custom-scrollbar z-10 transition-all duration-200 h-full`}>
      <div className="flex items-center justify-between mb-3">
        {isCatalogBuilderVisible && <h2 className="text-xl font-black text-amber-500 tracking-wide">
          Конструктор Каталога
        </h2>}
        <div className="flex items-center gap-2">
          {onCloseMobile && (
            <button
              type="button"
              onClick={onCloseMobile}
              className="md:hidden rounded bg-neutral-800 p-2 text-xs text-neutral-300 hover:bg-neutral-700 min-w-[36px] min-h-[36px] cursor-pointer"
            >
              ✕
            </button>
          )}
          <button
            type="button"
            onClick={onToggleVisibility}
            aria-label={isCatalogBuilderVisible ? 'Скрыть конструктор каталога' : 'Показать конструктор каталога'}
            title={isCatalogBuilderVisible ? 'Скрыть конструктор' : 'Показать конструктор'}
            className="hidden md:block rounded bg-neutral-800 px-2.5 py-1 text-xs text-amber-500 hover:bg-neutral-700 cursor-pointer"
          >
            {isCatalogBuilderVisible ? '→' : '←'}
          </button>
        </div>
      </div>

      {isCatalogBuilderVisible && (
        <form onSubmit={onSaveProduct} className="space-y-3 text-xs">
          <div>
            <label className="block text-neutral-400 mb-1">Уникальный Type ID</label>
            <input required type="text" placeholder="например, poster_v1" value={newBuilding.typeId} onChange={e => onSetNewBuilding(prev => ({ ...prev, typeId: e.target.value }))} className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 focus:outline-none focus:border-amber-500" />
          </div>

          <div>
            <label className="block text-neutral-400 mb-1">Название элемента</label>
            <input required type="text" placeholder="Плакат" value={newBuilding.name} onChange={e => onSetNewBuilding(prev => ({ ...prev, name: e.target.value }))} className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 focus:outline-none focus:border-amber-500" />
          </div>

          <div>
            <label className="block text-neutral-400 mb-1">Категория</label>
            <select
              value={newBuilding.category}
              onChange={e => onSetNewBuilding(prev => ({ ...prev, category: e.target.value }))}
              className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 focus:outline-none focus:border-amber-500 custom-scrollbar cursor-pointer"
            >
              {allCategories.map(c => (
                <option key={c} value={c}>{CATEGORY_LABELS[c] || c}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-neutral-400 mb-1">Ширина (W)</label>
              <input type="number" min="1" max="5" value={newBuilding.w} onChange={e => onSetNewBuilding(prev => ({ ...prev, w: Number(e.target.value) }))} className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 focus:outline-none" />
            </div>
            <div>
              <label className="block text-neutral-400 mb-1">Высота (H)</label>
              <input type="number" min="1" max="5" value={newBuilding.h} onChange={e => onSetNewBuilding(prev => ({ ...prev, h: Number(e.target.value) }))} className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 focus:outline-none" />
            </div>
          </div>

          <div>
            <label className="block text-neutral-400 mb-1">Путь к картинке по умолчанию (URL)</label>
            <input type="text" placeholder="/assets/items/poster.png" value={newBuilding.image} onChange={e => onSetNewBuilding(prev => ({ ...prev, image: e.target.value }))} className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 focus:outline-none" />
          </div>

          <div>
            <label className="block text-neutral-400 mb-1">Превью для Tooltip</label>
            <input type="text" placeholder="/assets/items/poster_preview.png" value={newBuilding.tooltipImage} onChange={e => onSetNewBuilding(prev => ({ ...prev, tooltipImage: e.target.value }))} className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 focus:outline-none" />
          </div>

          <div>
            <label className="block text-neutral-400 mb-1">Цвет заливки</label>
            <label className="flex items-center gap-2 text-neutral-300 mb-2 cursor-pointer text-xs py-1">
              <input type="checkbox" checked={newBuilding.color === 'transparent'} onChange={e => onSetNewBuilding(prev => ({ ...prev, color: e.target.checked ? 'transparent' : '#4b5563' }))} className="w-4 h-4 rounded bg-neutral-800 border-neutral-700 text-amber-500 focus:ring-0" /> Без цвета (прозрачный)
            </label>
            {newBuilding.color !== 'transparent' && (
              <div className="flex gap-2 items-center">
                <input type="color" value={newBuilding.color === 'transparent' ? '#000000' : newBuilding.color} onChange={e => onSetNewBuilding(prev => ({ ...prev, color: e.target.value }))} className="w-10 h-10 rounded cursor-pointer bg-transparent border-0" />
                <input type="text" value={newBuilding.color} onChange={e => onSetNewBuilding(prev => ({ ...prev, color: e.target.value }))} className="flex-1 bg-neutral-950 border border-neutral-800 rounded p-2 focus:outline-none" />
              </div>
            )}
          </div>

          <div>
            <label className="block text-neutral-400 mb-1">Тип размещения</label>
            <select
              value={newBuilding.placementType}
              onChange={e => onSetNewBuilding(prev => ({ ...prev, placementType: e.target.value as "floor" | "ground" | "wall" | "any" }))}
              className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 focus:outline-none focus:border-amber-500 custom-scrollbar cursor-pointer"
            >
              <option value="floor">На пол (floor)</option>
              <option value="ground">На землю (ground)</option>
              <option value="wall">На стену (wall)</option>
              <option value="any">Везде (any)</option>
            </select>
          </div>

          {newBuilding.placementType === 'wall' && (
            <div className="space-y-2 bg-neutral-950 p-2 rounded border border-neutral-800">
              <div>
                <label className="block text-neutral-400 mb-1">Мин. уровень стены</label>
                <input type="number" min="1" max="5" value={newBuilding.minWallLvl} onChange={e => onSetNewBuilding(prev => ({ ...prev, minWallLvl: Number(e.target.value) }))} className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 focus:outline-none" />
              </div>
              <label className="flex items-center gap-2 text-neutral-300 cursor-pointer py-1">
                <input type="checkbox" checked={newBuilding.allowWindowWall} onChange={e => onSetNewBuilding(prev => ({ ...prev, allowWindowWall: e.target.checked }))} className="accent-amber-500 w-4 h-4" />
                Разрешено на стене с окном
              </label>
            </div>
          )}

          <div className="bg-neutral-950 p-2 rounded border border-neutral-800 space-y-2">
            {(newBuilding.placementType === 'floor' || newBuilding.placementType === 'any') && (
              <div>
                <label className="block text-neutral-400 mb-1">Мин. уровень пола</label>
                <input type="number" min="1" max="5" value={newBuilding.minFloorLvl} onChange={e => onSetNewBuilding(prev => ({ ...prev, minFloorLvl: Number(e.target.value) }))} className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 focus:outline-none" />
              </div>
            )}
            <label className="flex items-center gap-2 text-neutral-300 cursor-pointer py-1">
              <input type="checkbox" checked={newBuilding.allowWallDecorAbove} onChange={e => onSetNewBuilding(prev => ({ ...prev, allowWallDecorAbove: e.target.checked }))} className="accent-amber-500 w-4 h-4" />
              Разрешить настенный декор над ним
            </label>
          </div>

          {!newBuilding.autoTiling && (
            <div>
              <label className="block text-neutral-400 mb-1">Разрешённые повороты</label>
              <div className="flex gap-1">
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
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-neutral-400 mb-1">Макс. на базу</label>
              <input type="number" min="1" max="999" value={newBuilding.maxCount} onChange={e => onSetNewBuilding(prev => ({ ...prev, maxCount: Number(e.target.value) }))} className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 focus:outline-none" />
            </div>
            <div>
              <label className="block text-neutral-400 mb-1">Группа лимита</label>
              <input type="text" placeholder="например, chests" value={newBuilding.sharedLimitGroup} onChange={e => onSetNewBuilding(prev => ({ ...prev, sharedLimitGroup: e.target.value }))} className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 focus:outline-none" />
            </div>
          </div>

          <div className="bg-neutral-950 p-2 rounded border border-neutral-800 space-y-2">
            <label className="flex items-center gap-2 text-neutral-300 cursor-pointer py-1">
              <input type="checkbox" checked={newBuilding.autoTiling} onChange={e => onSetNewBuilding(prev => ({ ...prev, autoTiling: e.target.checked }))} className="accent-amber-500 w-4 h-4" />
              Включить авто-тайлинг
            </label>

            {newBuilding.autoTiling && (
              <>
                <div>
                  <label className="block text-neutral-400 mb-1">Соединяется с Type ID (через запятую)</label>
                  <input
                    type="text"
                    placeholder="hedge_tile_01, hedge_tile_02"
                    value={newBuilding.connectsTo}
                    onChange={e => onSetNewBuilding(prev => ({ ...prev, connectsTo: e.target.value }))}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5 pt-1">
                  <span className="block text-[11px] font-bold text-neutral-400">Изображения вариантов тайла:</span>
                  {(['single', 'end', 'straight', 'corner', 'tee', 'cross'] as const).map(variant => (
                    <div key={variant} className="flex items-center gap-1.5">
                      <span className="w-14 text-[10px] text-neutral-500 uppercase font-mono">{variant}</span>
                      <input
                        type="text"
                        placeholder={`URL для ${variant}`}
                        value={newBuilding.autoTileImages[variant]}
                        onChange={e => onSetNewBuilding(prev => ({
                          ...prev,
                          autoTileImages: { ...prev.autoTileImages, [variant]: e.target.value }
                        }))}
                        className="flex-1 bg-neutral-900 border border-neutral-800 rounded p-1.5 text-xs focus:outline-none"
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="bg-neutral-950 p-2 rounded border border-neutral-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-neutral-400">Цветовые варианты (краска)</span>
              <button
                type="button"
                onClick={() => onSetNewBuilding(prev => ({ ...prev, colorVariants: [...prev.colorVariants, { color: '#ffffff', image: '' }] }))}
                className="text-xs bg-neutral-800 hover:bg-neutral-700 text-amber-400 px-2 py-1 rounded cursor-pointer"
              >
                + Добавить
              </button>
            </div>
            {newBuilding.colorVariants.map((v, idx) => (
              <div key={idx} className="flex gap-1.5 items-center">
                <input
                  type="color"
                  value={v.color}
                  onChange={e => {
                    const newColor = e.target.value;
                    onSetNewBuilding(prev => {
                      const next = [...prev.colorVariants];
                      next[idx] = { ...next[idx], color: newColor };
                      return { ...prev, colorVariants: next };
                    });
                  }}
                  className="w-8 h-8 rounded cursor-pointer bg-transparent border-0"
                />
                <input
                  type="text"
                  placeholder="URL картинки с этим цветом"
                  value={v.image}
                  onChange={e => {
                    const newImg = e.target.value;
                    onSetNewBuilding(prev => {
                      const next = [...prev.colorVariants];
                      next[idx] = { ...next[idx], image: newImg };
                      return { ...prev, colorVariants: next };
                    });
                  }}
                  className="flex-1 bg-neutral-900 border border-neutral-800 rounded p-1.5 text-xs focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => onSetNewBuilding(prev => ({ ...prev, colorVariants: prev.colorVariants.filter((_, i) => i !== idx) }))}
                  className="text-red-400 p-2 text-sm font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <button type="submit" className="w-full bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold py-3 rounded transition text-xs uppercase tracking-wider mt-2 min-h-[44px] cursor-pointer">
            {catalog.some(c => c.typeId === newBuilding.typeId) ? 'Сохранить изменения' : 'Добавить в каталог'}
          </button>

          {isEditing && (
            <button
              type="button"
              onClick={() => onDeleteProduct(newBuilding.typeId)}
              className="w-full bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-800/50 font-bold py-3 rounded transition text-xs uppercase tracking-wider mt-1 min-h-[44px] cursor-pointer"
            >
              Удалить из каталога
            </button>
          )}
        </form>
      )}
    </div>
  );
});