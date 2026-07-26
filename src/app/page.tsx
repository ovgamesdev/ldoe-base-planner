'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CanvasGrid } from '../components/CanvasGrid'
import { LeftSidebar } from '../components/LeftSidebar'
import { RightSidebar } from '../components/RightSidebar'
import { SelectedElementPanel } from '../components/SelectedElementPanel'
import { ALL_ROTATIONS, CATEGORY_LABELS, EMPTY_AUTO_TILE_IMAGES, InitialMapEntry, LOADING_MAP, Tool, ViewMode } from '../lib/constants'
import {
  getEffectiveSize,
  getOccupiedCells,
  hasFloorForWall,
  hasValidWallForDecor,
  isWallDecorValid
} from '../lib/grid-utils'
import type { AutoTileVariant, CatalogItem, ColorVariant, MapData, ObjectLayer } from '../lib/initial-data'

const generateUUID = (): string => {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
    (+c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))).toString(16)
  );
};

const getBasePath = () => process.env.NEXT_PUBLIC_BASE_PATH || '';

export default function TSXBasePlanner() {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [initialMaps, setInitialMaps] = useState<InitialMapEntry[]>([]);

  const [isMobileLeftOpen, setIsMobileLeftOpen] = useState(false);
  const [isMobileRightOpen, setIsMobileRightOpen] = useState(false);

  const catalogMap = useMemo(() => {
    const map: Record<string, CatalogItem> = {};
    catalog.forEach(c => { map[c.typeId] = c; });
    return map;
  }, [catalog]);
  
  const [maps, setMaps] = useState<MapData[]>([]);
  const [activeMapId, setActiveMapId] = useState<string>('');
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);

  const mapState = useMemo(() => {
    return maps.find(m => m.id === activeMapId) || LOADING_MAP;
  }, [maps, activeMapId]);

  const selectedElementData = useMemo(() => {
    if (!selectedInstanceId) return null;
    if (selectedInstanceId.startsWith('floor_')) {
      const [, x, y] = selectedInstanceId.split('_');
      const floor = mapState.layers.floors.find(f => f.x === Number(x) && f.y === Number(y));
      return floor ? { type: 'floor' as const, data: floor } : null;
    }
    
    if (selectedInstanceId.startsWith('wall_')) {
      const [, x, y, ori] = selectedInstanceId.split('_');
      const wall = mapState.layers.walls.find(w => w.x === Number(x) && w.y === Number(y) && w.orientation === ori);
      
      const targetX = ori === 'vertical' ? Number(x) - 1 : Number(x);
      const targetY = Number(y);
      const isH = ori === 'horizontal';

      const decors = mapState.layers.objects
        .filter(o => {
          const t = catalogMap[o.typeId];
          return t?.constraints.placementType === 'wall' &&
                 o.x === targetX && o.y === targetY &&
                 ((o.rotation === 0 || o.rotation === 180) === isH);
        })
        .map(o => ({ obj: o, template: catalogMap[o.typeId] }));

      return wall ? { type: 'wall' as const, data: wall, decors } : null;
    }
    
    const primaryObj = mapState.layers.objects.find(o => o.instanceId === selectedInstanceId);
    if (primaryObj) {
      const primaryTemplate = catalogMap[primaryObj.typeId];
      const primaryEffSize = primaryTemplate ? getEffectiveSize(primaryTemplate) : null;
      const primaryCells = primaryTemplate && primaryEffSize
        ? getOccupiedCells(primaryObj.x, primaryObj.y, primaryEffSize.w, primaryEffSize.h, primaryObj.rotation)
        : [{ x: primaryObj.x, y: primaryObj.y }];

      const objectsInCell = mapState.layers.objects.filter(o => {
        const t = catalogMap[o.typeId];
        if (!t) return false;
        const effSize = getEffectiveSize(t);
        const cells = getOccupiedCells(o.x, o.y, effSize.w, effSize.h, o.rotation);
        return cells.some(c => primaryCells.some(pc => pc.x === c.x && pc.y === c.y));
      });

      return { 
        type: 'object' as const, 
        data: objectsInCell.map(o => ({ obj: o, template: catalogMap[o.typeId] }))
      };
    }
    return null;
  }, [selectedInstanceId, mapState, catalogMap]);

  useEffect(() => {
    if (selectedInstanceId && !selectedElementData) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedInstanceId(null);
    }
  }, [selectedInstanceId, selectedElementData]);

  const setMapState = useCallback((action: MapData | ((prev: MapData) => MapData)) => {
    setMaps(prevMaps =>
      prevMaps.map(m => {
        if (m.id === mapState.id) {
          return typeof action === 'function' ? action(m) : action;
        }
        return m;
      })
    );
  }, [mapState.id]);

  const [viewMode, setViewMode] = useState<ViewMode>('topDown');
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isLoaded, setIsLoaded] = useState(false);

  const [activeTool, setActiveTool] = useState<Tool>('hand');
  const [selectedTypeId, setSelectedTypeId] = useState<string>('');
  const [currentRotation, setCurrentRotation] = useState<number>(0);
  const [buildLevel, setBuildLevel] = useState<number>(1);
  const [isDoorPlacement, setIsDoorPlacement] = useState<boolean>(false);
  const [isWindowPlacement, setIsWindowPlacement] = useState<boolean>(false);
  const [isCatalogBuilderVisible, setIsCatalogBuilderVisible] = useState(false);

  const interactionRef = useRef({
    activeTool, selectedTypeId, currentRotation, buildLevel, isDoorPlacement, isWindowPlacement
  });

  useEffect(() => {
    interactionRef.current = { activeTool, selectedTypeId, currentRotation, buildLevel, isDoorPlacement, isWindowPlacement };
  }, [activeTool, selectedTypeId, currentRotation, buildLevel, isDoorPlacement, isWindowPlacement]);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchCategory, setSearchCategory] = useState<string>('all');

  const [dragItemIndex, setDragItemIndex] = useState<number | null>(null);
  const [dragOverItemIndex, setDragOverItemIndex] = useState<number | null>(null);

  const uniqueCategories = useMemo(() => Array.from(new Set(catalog.map(c => c.category))), [catalog]);
  const allCategories = useMemo(() => [...uniqueCategories.filter(c => !(c in CATEGORY_LABELS)), ...Object.keys(CATEGORY_LABELS)], [uniqueCategories]);
  
  const availableMaps = useMemo(() => {
    const loadedMaps = maps.map(map => ({ id: map.id, name: map.name }));
    const unloadedInitialMaps = initialMaps
      .filter(initialMap => !maps.some(map => map.id === initialMap.id))
      .map(({ id, name }) => ({ id, name }));
    return [...loadedMaps, ...unloadedInitialMaps];
  }, [initialMaps, maps]);

  const [isPanning, setIsPanning] = useState<boolean>(false);
  const lastPointerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const skipNextPersistenceRef = useRef(true);
  
  const [isTransforming, setIsTransforming] = useState(false);
  const transformTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsTransforming(true);

    if (transformTimeoutRef.current) {
      clearTimeout(transformTimeoutRef.current);
    }

    if (!isPanning) {
      transformTimeoutRef.current = setTimeout(() => {
        setIsTransforming(false);
      }, 150);
    }

    return () => {
      if (transformTimeoutRef.current) {
        clearTimeout(transformTimeoutRef.current);
      }
    };
  }, [isPanning, zoom]);

  const activeWillChange = isTransforming;

  const [newBuilding, setNewBuilding] = useState({
    typeId: '', name: '', category: 'workstation', w: 1, h: 1, image: '', tooltipImage: '', color: '#4b5563',
    allowedRotations: [0, 90, 180, 270] as number[],
    placementType: 'floor' as 'floor' | 'ground' | 'wall' | 'any',
    minFloorLvl: 1,
    minWallLvl: 1,
    allowWindowWall: true,
    allowWallDecorAbove: false,
    maxCount: 99,
    sharedLimitGroup: '',
    autoTiling: false,
    connectsTo: '',
    autoTileImages: EMPTY_AUTO_TILE_IMAGES,
    colorVariants: [] as ColorVariant[]
  });

  const objectListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [catalogResponse, mapsResponse] = await Promise.all([
          fetch(`${getBasePath()}/data/catalog.json`),
          fetch(`${getBasePath()}/data/maps.json`)
        ]);
        if (!catalogResponse.ok || !mapsResponse.ok) throw new Error('Initial data request failed');
        const defaults = await catalogResponse.json() as CatalogItem[];
        const mapIndex = await mapsResponse.json() as InitialMapEntry[];
        if (!Array.isArray(defaults) || !Array.isArray(mapIndex)) {
          throw new Error('Invalid initial data');
        }
        setInitialMaps(mapIndex);
        const mapIdFromUrl = new URLSearchParams(window.location.search).get('map');
        const requestedInitialMapId = mapIdFromUrl && mapIndex.some(map => map.id === mapIdFromUrl)
          ? mapIdFromUrl
          : null;

        const savedCatalog = localStorage.getItem('ldoe_catalog');
        const savedMaps = localStorage.getItem('ldoe_maps');
        const savedActiveMapId = localStorage.getItem('ldoe_activeMapId');
        const savedOldMap = localStorage.getItem('ldoe_mapState');
        const savedViewMode = localStorage.getItem('ldoe_viewMode');
        const savedZoom = localStorage.getItem('ldoe_zoom');
        const savedPan = localStorage.getItem('ldoe_pan');
        const savedActiveTool = localStorage.getItem('ldoe_activeTool');
        const savedToolConfig = localStorage.getItem('ldoe_toolConfig');
        const savedNewBuilding = localStorage.getItem('ldoe_newBuilding');
        const savedCatalogBuilderVisibility = localStorage.getItem('ldoe_catalogBuilderVisible');

        const parsedCatalog = savedCatalog ? JSON.parse(savedCatalog) as CatalogItem[] : null;
        const restoredCatalog = Array.isArray(parsedCatalog) && parsedCatalog.length > 0 ? parsedCatalog : defaults;
        setCatalog(restoredCatalog);
        setSelectedTypeId(restoredCatalog[0]?.typeId ?? '');
        setCurrentRotation(restoredCatalog[0]?.constraints.allowedRotations[0] ?? 0);

        let restoredMap = false;
        if (savedMaps) {
          const parsedMaps = JSON.parse(savedMaps) as MapData[];
          if (Array.isArray(parsedMaps) && parsedMaps.length > 0) {
            setMaps(parsedMaps);
            setActiveMapId(requestedInitialMapId ?? (savedActiveMapId && parsedMaps.some(map => map.id === savedActiveMapId)
              ? savedActiveMapId
              : parsedMaps[0].id));
            restoredMap = true;
          }
        }

        if (!restoredMap && savedOldMap) {
          const oldMap = JSON.parse(savedOldMap) as MapData;
          const migratedMap: MapData = {
            ...oldMap,
            id: oldMap.id || 'default-map-1',
            name: oldMap.name || 'Основная база'
          };
          setMaps([migratedMap]);
          setActiveMapId(migratedMap.id);
          restoredMap = true;
        }

        if (!restoredMap) {
          setActiveMapId(requestedInitialMapId ?? mapIndex[0]?.id ?? '');
        }

        if (savedViewMode) setViewMode(savedViewMode as ViewMode);
        if (savedZoom) setZoom(parseFloat(savedZoom));
        if (savedPan) setPan(JSON.parse(savedPan));
        if (savedActiveTool) setActiveTool(savedActiveTool as Tool);
        if (savedToolConfig) {
          const config = JSON.parse(savedToolConfig);
          if (config.selectedTypeId) setSelectedTypeId(config.selectedTypeId);
          if (config.currentRotation !== undefined) setCurrentRotation(config.currentRotation);
          if (config.buildLevel !== undefined) setBuildLevel(config.buildLevel);
          if (config.isDoorPlacement !== undefined) setIsDoorPlacement(config.isDoorPlacement);
          if (config.isWindowPlacement !== undefined) setIsWindowPlacement(config.isWindowPlacement);
        }
        if (savedNewBuilding) {
          const savedBuilding = JSON.parse(savedNewBuilding);
          setNewBuilding(prev => ({
            ...prev,
            ...savedBuilding,
            autoTiling: savedBuilding.autoTiling ?? false,
            connectsTo: savedBuilding.connectsTo ?? '',
            autoTileImages: { ...EMPTY_AUTO_TILE_IMAGES, ...savedBuilding.autoTileImages }
          }));
        }
        if (savedCatalogBuilderVisibility) setIsCatalogBuilderVisible(savedCatalogBuilderVisibility === 'true');
      } catch (e) {
        console.error('Ошибка загрузки состояния из localStorage:', e);
      } finally {
        setIsLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!isLoaded || !activeMapId || initialMaps.length === 0) return;

    const url = new URL(window.location.href);
    const isInitialMap = activeMapId === initialMaps[0].id;
    const isPublicMap = initialMaps.some(map => map.id === activeMapId);

    if (isPublicMap && !isInitialMap) {
      url.searchParams.set('map', activeMapId);
    } else {
      url.searchParams.delete('map');
    }
    window.history.replaceState(null, '', url);
  }, [activeMapId, initialMaps, isLoaded]);

  useEffect(() => {
    if (!activeMapId || maps.some(map => map.id === activeMapId)) return;
    const entry = initialMaps.find(map => map.id === activeMapId);
    if (!entry) return;

    let isCancelled = false;
    void (async () => {
      try {
        const response = await fetch(entry.file, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const map = await response.json() as MapData;
        if (!map?.mapConfig || !map?.layers) throw new Error('Invalid map data');
        if (!isCancelled) {
          skipNextPersistenceRef.current = true;
          setMaps(prev => [...prev.filter(item => item.id !== map.id), map]);
        }
      } catch (error) {
        console.error('Не удалось загрузить карту:', error);
      }
    })();
    return () => { isCancelled = true; };
  }, [activeMapId, initialMaps, maps]);

  useEffect(() => {
    if (!isLoaded) return;
    if (skipNextPersistenceRef.current) {
      skipNextPersistenceRef.current = false;
      return;
    }

    localStorage.setItem('ldoe_catalog', JSON.stringify(catalog));
    localStorage.setItem('ldoe_maps', JSON.stringify(maps));
    localStorage.setItem('ldoe_activeMapId', activeMapId);
    localStorage.setItem('ldoe_viewMode', viewMode);
    localStorage.setItem('ldoe_zoom', zoom.toString());
    localStorage.setItem('ldoe_pan', JSON.stringify(pan));
    localStorage.setItem('ldoe_activeTool', activeTool);
    localStorage.setItem('ldoe_toolConfig', JSON.stringify({
      selectedTypeId,
      currentRotation,
      buildLevel,
      isDoorPlacement,
      isWindowPlacement
    }));
    localStorage.setItem('ldoe_newBuilding', JSON.stringify(newBuilding));
    localStorage.setItem('ldoe_catalogBuilderVisible', String(isCatalogBuilderVisible));
  }, [catalog, maps, activeMapId, viewMode, zoom, pan, isLoaded, activeTool, selectedTypeId, currentRotation, buildLevel, isDoorPlacement, isWindowPlacement, newBuilding, isCatalogBuilderVisible]);

  const scrollListToSelected = useCallback(() => {
    if (!objectListRef.current || !selectedTypeId) return;
    const selectedEl = objectListRef.current.querySelector(`[data-type-id="${selectedTypeId}"]`) as HTMLElement | null;
    if (!selectedEl) return;

    const container = objectListRef.current;
    const containerRect = container.getBoundingClientRect();
    const elRect = selectedEl.getBoundingClientRect();

    const isFullyVisible = elRect.top >= containerRect.top && elRect.bottom <= containerRect.bottom;
    if (isFullyVisible) return;

    if (elRect.top < containerRect.top) {
      container.scrollTop -= (containerRect.top - elRect.top);
    } else if (elRect.bottom > containerRect.bottom) {
      container.scrollTop += (elRect.bottom - containerRect.bottom);
    }
  }, [selectedTypeId]);

  useEffect(() => {
    if (activeTool === 'object') {
      const id = setTimeout(() => scrollListToSelected(), 0);
      return () => clearTimeout(id);
    }
  }, [activeTool, selectedTypeId, scrollListToSelected]);

  useEffect(() => {
    if (activeTool !== 'object') return;
    const id = setTimeout(() => {
      const selectedEl = objectListRef.current?.querySelector(`[data-type-id="${selectedTypeId}"]`) as HTMLElement | null;
      if (selectedEl) {
        scrollListToSelected();
      } else {
        if (objectListRef.current) objectListRef.current.scrollTop = 0;
      }
    }, 0);
    return () => clearTimeout(id);
  }, [searchCategory, activeTool, selectedTypeId, scrollListToSelected]);

  useEffect(() => {
    if (activeTool === 'object' && searchQuery === '') {
      const id = setTimeout(() => scrollListToSelected(), 0);
      return () => clearTimeout(id);
    }
  }, [searchQuery, activeTool, selectedTypeId, scrollListToSelected]);

  const { width: GRID_W, height: GRID_H } = mapState.mapConfig;
  const selectedTemplate = catalogMap[selectedTypeId];
  const selectedAllowedRotations = selectedTemplate?.constraints.autoTiling
    ? [0]
    : selectedTemplate?.constraints.allowedRotations?.length
    ? selectedTemplate.constraints.allowedRotations
    : [0];

  const handleDragStart = useCallback((index: number) => {
    setDragItemIndex(index);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverItemIndex(index);

    if (objectListRef.current) {
      const container = objectListRef.current;
      const rect = container.getBoundingClientRect();
      const threshold = 20;
      const speed = 8;

      if (e.clientY < rect.top + threshold) {
        container.scrollTop -= speed;
      } else if (e.clientY > rect.bottom - threshold) {
        container.scrollTop += speed;
      }
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (dragItemIndex === null || dragOverItemIndex === null) return;
    if (dragItemIndex === dragOverItemIndex) {
      setDragItemIndex(null);
      setDragOverItemIndex(null);
      return;
    }

    const filteredCatalog = catalog.filter(item =>
      (searchCategory === 'all' || item.category === searchCategory) &&
      (item.name.toLowerCase().includes(searchQuery.toLowerCase()) || item.category.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    const draggedItem = filteredCatalog[dragItemIndex];
    const targetItem = filteredCatalog[dragOverItemIndex];

    if (!draggedItem || !targetItem) {
      setDragItemIndex(null);
      setDragOverItemIndex(null);
      return;
    }

    const oldIndex = catalog.findIndex(c => c.typeId === draggedItem.typeId);
    const newIndex = catalog.findIndex(c => c.typeId === targetItem.typeId);

    const newCatalog = [...catalog];
    const [removed] = newCatalog.splice(oldIndex, 1);
    newCatalog.splice(newIndex, 0, removed);

    setCatalog(newCatalog);
    setDragItemIndex(null);
    setDragOverItemIndex(null);
  }, [catalog, dragItemIndex, dragOverItemIndex, searchCategory, searchQuery]);

  const handleDragEnd = useCallback(() => {
    setDragItemIndex(null);
    setDragOverItemIndex(null);
  }, []);

  const handleCreateMap = useCallback(() => {
    const newMap: MapData = {
      id: generateUUID(),
      name: `Карта ${maps.length + 1}`,
      mapConfig: {
        width: 20,
        height: 18,
        noBuildZones: mapState.mapConfig.noBuildZones
      },
      layers: { floors: [], walls: [], objects: [] }
    };
    setMaps(prev => [...prev, newMap]);
    setActiveMapId(newMap.id);
  }, [maps.length, mapState.mapConfig.noBuildZones]);

  const handleRenameMap = useCallback((newName: string) => {
    setMaps(prev => prev.map(m => m.id === mapState.id ? { ...m, name: newName } : m));
  }, [mapState.id]);

  const handleDeleteMap = useCallback((idToDelete: string) => {
    if (maps.length <= 1) {
      alert('Нельзя удалить единственную карту!');
      return;
    }
    if (!window.confirm('Вы действительно хотите удалить эту карту?')) {
      return;
    }
    if (!window.confirm('Внимание! Это действие необратимо. Подтвердите удаление окончательно.')) {
      return;
    }
    const nextMaps = maps.filter(m => m.id !== idToDelete);
    setMaps(nextMaps);
    if (activeMapId === idToDelete) setActiveMapId(nextMaps[0].id);
  }, [maps, activeMapId]);

  const validatePlacement = useCallback((typeId: string, x: number, y: number, rotation: number, ignoreInstanceId?: string): boolean => {
    const template = catalogMap[typeId];
    if (!template) {
      console.warn(`[Placement Error] Шаблон объекта с ID '${typeId}' не найден в каталоге.`);
      return false;
    }

    const allowed = template.constraints.autoTiling
      ? [0]
      : template.constraints.allowedRotations?.length
      ? template.constraints.allowedRotations
      : [0];
    if (!allowed.includes(rotation)) {
      console.warn(`[Placement Error] Поворот ${rotation}° не разрешен для '${template.name}'. Разрешенные:`, allowed);
      return false;
    }

    const effSize = getEffectiveSize(template);
    const cells = getOccupiedCells(x, y, effSize.w, effSize.h, rotation);
    const placementType = template.constraints.placementType || (template.constraints.requiresFloor ? 'floor' : 'any');

    if (placementType === 'wall') {
      if (cells.some(c => c.x > GRID_W || c.y > GRID_H || c.x < -1 || c.y < -1)) {
        console.warn(`[Placement Error] Объект '${template.name}' (стена) выходит за границы карты.`);
        return false;
      }
    } else {
      if (cells.some(c => c.x >= GRID_W || c.y >= GRID_H || c.x < 0 || c.y < 0)) {
        console.warn(`[Placement Error] Объект '${template.name}' выходит за границы карты.`);
        return false;
      }
    }

    if (placementType !== 'wall') {
      const inNoBuild = cells.find(c => mapState.mapConfig.noBuildZones.some(nb => nb.x === c.x && nb.y === c.y));
      if (inNoBuild) {
        console.warn(`[Placement Error] Объект '${template.name}' попадает в запретную зону No-Build на клетке (${inNoBuild.x}, ${inNoBuild.y}).`);
        return false;
      }
    }

    const otherObjects = mapState.layers.objects;

    for (const cell of cells) {
      const objectsHere = otherObjects.filter(obj => {
        if (obj.instanceId === ignoreInstanceId) return false;
        const objTemplate = catalogMap[obj.typeId];
        if (!objTemplate) return false;
        
        const objEffSize = getEffectiveSize(objTemplate);
        const objCells = getOccupiedCells(obj.x, obj.y, objEffSize.w, objEffSize.h, obj.rotation);
        
        return objCells.some(oc => oc.x === cell.x && oc.y === cell.y);
      });

      if (objectsHere.length > 0) {
        if (placementType === 'wall') {
          const wallDecors = objectsHere.filter(o => catalogMap[o.typeId]?.constraints.placementType === 'wall');
          
          if (wallDecors.length >= 2) {
            console.warn(`[Placement Error] На стене в клетке (${cell.x}, ${cell.y}) превышен лимит декора (макс. 2).`);
            return false;
          }
          
          if (wallDecors.length === 1) {
            const existingDecor = wallDecors[0];
            const isExistingH = existingDecor.rotation === 0 || existingDecor.rotation === 180;
            const isNewH = rotation === 0 || rotation === 180;
            if (isExistingH === isNewH) {
              console.warn(`[Placement Error] На стене (${cell.x}, ${cell.y}) уже висит декор с аналогичной ориентацией.`);
              return false;
            }
          }

          const blockingFloorObject = objectsHere.find(o => {
             const t = catalogMap[o.typeId];
             if (t?.constraints.placementType === 'wall') return false; 
             if (t && !t.constraints.allowWallDecorAbove) return true;
             return false;
          });
          if (blockingFloorObject) {
            console.warn(`[Placement Error] Напольный объект '${catalogMap[blockingFloorObject.typeId]?.name}' в клетке (${cell.x}, ${cell.y}) блокирует размещение декора над ним.`);
            return false;
          }
        } else {
          const blockingObject = objectsHere.find(o => {
             const t = catalogMap[o.typeId];
             if (t?.constraints.placementType === 'wall' && template.constraints.allowWallDecorAbove) return false; 
             return true; 
          });
          if (blockingObject) {
            console.warn(`[Placement Error] Клетка (${cell.x}, ${cell.y}) уже занята объектом '${catalogMap[blockingObject.typeId]?.name}'.`);
            return false; 
          }
        }
      }
    }

    if (placementType === 'floor') {
      const requiredLvl = template.constraints.requiresSpecificFloorLevel || 1;
      const missingFloorCell = cells.find(cell =>
        !mapState.layers.floors.some(f => f.x === cell.x && f.y === cell.y && f.level >= requiredLvl)
      );
      if (missingFloorCell) {
        console.warn(`[Placement Error] '${template.name}' требует пол уровня ${requiredLvl} или выше в клетке (${missingFloorCell.x}, ${missingFloorCell.y}).`);
        return false;
      }
    } else if (placementType === 'any') {
      const requiredLvl = template.constraints.requiresSpecificFloorLevel;
      if (requiredLvl) {
        const invalidFloorCell = cells.find(cell => {
          const floor = mapState.layers.floors.find(f => f.x === cell.x && f.y === cell.y);
          return floor && floor.level < requiredLvl;
        });
        if (invalidFloorCell) {
          console.warn(`[Placement Error] '${template.name}' при установке на пол требует уровень ${requiredLvl} или выше в клетке (${invalidFloorCell.x}, ${invalidFloorCell.y}).`);
          return false;
        }
      }
    } else if (placementType === 'ground') {
      const existingFloorCell = cells.find(cell =>
        mapState.layers.floors.some(f => f.x === cell.x && f.y === cell.y)
      );
      if (existingFloorCell) {
        console.warn(`[Placement Error] '${template.name}' можно ставить только на голую землю. Пол найден в клетке (${existingFloorCell.x}, ${existingFloorCell.y}).`);
        return false;
      }
    } else if (placementType === 'wall') {
      const minWallLvl = template.constraints.requiresWallLevel || 1;
      const allowWindow = template.constraints.allowWindowWall ?? true;

      const missingWallCell = cells.find(cell => {
        const checkX = rotation === 90 || rotation === 270 ? cell.x + 1 : cell.x;
        return !hasValidWallForDecor(mapState.layers.walls, checkX, cell.y, minWallLvl, allowWindow, rotation);
      });
      if (missingWallCell) {
        console.warn(`[Placement Error] Для декора '${template.name}' не найдена подходящая стена (Lvl >= ${minWallLvl}${!allowWindow ? ', без окна' : ''}) на линии (${missingWallCell.x}, ${missingWallCell.y}).`);
        return false;
      }
    }

    if (template.constraints.maxPerBase) {
      if (template.constraints.sharedLimitGroup) {
        const groupCount = mapState.layers.objects.filter(obj => {
          if (obj.instanceId === ignoreInstanceId) return false;
          const t = catalogMap[obj.typeId];
          return t && t.constraints.sharedLimitGroup === template.constraints.sharedLimitGroup;
        }).length;
        if (groupCount >= template.constraints.maxPerBase) {
          console.warn(`[Placement Error] Превышен лимит (${template.constraints.maxPerBase}) для группы объектов '${template.constraints.sharedLimitGroup}'.`);
          return false;
        }
      } else {
        const currentCount = mapState.layers.objects.filter(obj => obj.typeId === typeId && obj.instanceId !== ignoreInstanceId).length;
        if (currentCount >= template.constraints.maxPerBase) {
          console.warn(`[Placement Error] Превышен лимит (${template.constraints.maxPerBase}) для объекта '${template.name}'.`);
          return false;
        }
      }
    }

    return true;
  }, [catalogMap, GRID_W, GRID_H, mapState.mapConfig.noBuildZones, mapState.layers.objects, mapState.layers.floors, mapState.layers.walls]);

  const handleCellClick = useCallback((x: number, y: number) => {
    const { activeTool, buildLevel, selectedTypeId, currentRotation } = interactionRef.current;

    if (activeTool === 'hand') return; 

    const isOutOfBounds = x < 0 || y < 0 || x >= GRID_W || y >= GRID_H;

    if (activeTool === 'floor') {
      if (isOutOfBounds) return;
      
      const floorAlreadyExists = mapState.layers.floors.some(f => f.x === x && f.y === y);
      if (!floorAlreadyExists) {
        const objExists = mapState.layers.objects.some(obj => {
          const t = catalogMap[obj.typeId];
          if (!t) return false;
          if (t.constraints.placementType === 'wall') return false;
          const cells = getOccupiedCells(obj.x, obj.y, t.size.w, t.size.h, obj.rotation);
          return cells.some(c => c.x === x && c.y === y);
        });
        if (objExists) {
           alert('Невозможно разместить пол под уже установленным станком!');
           return; 
        }
      }

      const isRemoving = mapState.layers.floors.some(f => f.x === x && f.y === y && f.level === buildLevel);

      if (isRemoving) {
        const objExists = mapState.layers.objects.some(obj => {
          const t = catalogMap[obj.typeId];
          if (!t) return false;
          if (t.constraints.placementType === 'wall') return false;
          const cells = getOccupiedCells(obj.x, obj.y, t.size.w, t.size.h, obj.rotation);
          return cells.some(c => c.x === x && c.y === y);
        });
        if (objExists) {
          alert('Невозможно удалить пол под уже установленным станком!');
          return;
        }
      } else if (floorAlreadyExists) {
        const invalidObj = mapState.layers.objects.find(obj => {
          const t = catalogMap[obj.typeId];
          if (!t) return false;
          if (t.constraints.placementType !== 'floor') return false;
          const reqLvl = t.constraints.requiresSpecificFloorLevel || 1;
          if (buildLevel < reqLvl) {
            const cells = getOccupiedCells(obj.x, obj.y, t.size.w, t.size.h, obj.rotation);
            return cells.some(c => c.x === x && c.y === y);
          }
          return false;
        });
        if (invalidObj) {
          alert('Невозможно понизить уровень пола под станком ниже требуемого!');
          return;
        }
      }

      setMapState(prev => {
        const filtered = prev.layers.floors.filter(f => !(f.x === x && f.y === y));
        const nextFloors = isRemoving ? filtered : [...filtered, { x, y, level: buildLevel }];
        const nextWalls = prev.layers.walls.filter(w => hasFloorForWall(nextFloors, w.x, w.y, w.orientation, w.level));
        const nextObjects = prev.layers.objects.filter(obj => isWallDecorValid(obj, nextWalls, catalogMap));
        
        return {
          ...prev,
          layers: { ...prev.layers, floors: nextFloors, walls: nextWalls, objects: nextObjects }
        };
      });

      if (!isRemoving) {
        setSelectedInstanceId(`floor_${x}_${y}`);
      } else if (selectedInstanceId === `floor_${x}_${y}`) {
        setSelectedInstanceId(null);
      }
    } else if (activeTool === 'nobuild') {
      if (isOutOfBounds) return;
      
      setMapState(prev => {
        const exists = prev.mapConfig.noBuildZones.some(nb => nb.x === x && nb.y === y);
        return {
          ...prev,
          mapConfig: {
            ...prev.mapConfig,
            noBuildZones: exists ? prev.mapConfig.noBuildZones.filter(nb => !(nb.x === x && nb.y === y)) : [...prev.mapConfig.noBuildZones, { x, y }]
          }
        };
      });
    } else if (activeTool === 'object') {
      const template = catalogMap[selectedTypeId];
      
      if (template?.constraints.placementType === 'wall') {
        return;
      }

      const rotationToUse = template.constraints.autoTiling ? 0 : currentRotation;

      if (validatePlacement(selectedTypeId, x, y, rotationToUse)) {
        const newObjId = generateUUID();
        setMapState(prev => ({
          ...prev,
          layers: {
            ...prev.layers,
            objects: [
              ...prev.layers.objects,
              { instanceId: newObjId, typeId: selectedTypeId, x, y, rotation: rotationToUse }
            ]
          }
        }));
        setSelectedInstanceId(newObjId);
      } else {
        alert('Невозможно разместить объект в этом месте.\nОткройте консоль разработчика (F12) для просмотра подробной причины.');
      }
    } else if (activeTool === 'eraser') {
      setMapState(prev => {
        const newObjects = [...prev.layers.objects];
        let removedInstanceId: string | null = null;
        
        for (let i = newObjects.length - 1; i >= 0; i--) {
          const obj = newObjects[i];
          const t = catalogMap[obj.typeId];
          if (!t) continue;
          if (t.constraints.placementType === 'wall') continue;
          
          const effSize = getEffectiveSize(t);
          const cells = getOccupiedCells(obj.x, obj.y, effSize.w, effSize.h, obj.rotation);
          
          if (cells.some(c => c.x === x && c.y === y)) {
            removedInstanceId = obj.instanceId;
            newObjects.splice(i, 1);
            break;
          }
        }

        if (removedInstanceId) {
          if (removedInstanceId === selectedInstanceId) setSelectedInstanceId(null);
          return {
            ...prev,
            layers: { ...prev.layers, objects: newObjects }
          };
        } else {
          if (isOutOfBounds) return prev;
          
          const nextFloors = prev.layers.floors.filter(f => !(f.x === x && f.y === y));
          const nextWalls = prev.layers.walls.filter(w => {
            return hasFloorForWall(nextFloors, w.x, w.y, w.orientation, w.level);
          });
          const nextObjects = prev.layers.objects.filter(obj => isWallDecorValid(obj, nextWalls, catalogMap));
          
          return {
            ...prev,
            layers: {
              ...prev.layers,
              floors: nextFloors,
              walls: nextWalls,
              objects: nextObjects,
            }
          };
        }
      });
    }
  }, [GRID_W, GRID_H, mapState.layers.floors, mapState.layers.objects, catalogMap, selectedInstanceId, setMapState, validatePlacement]);

  const handleWallClick = useCallback((x: number, y: number, orientation: 'horizontal' | 'vertical', e: React.MouseEvent) => {
    e.stopPropagation();

    const { activeTool, selectedTypeId, buildLevel, isDoorPlacement, isWindowPlacement } = interactionRef.current;

    if (activeTool === 'eraser') {
      const targetX = orientation === 'vertical' ? x - 1 : x;
      const targetY = y;
      const isH = orientation === 'horizontal';

      setMapState(prev => {
        const newObjects = [...prev.layers.objects];
        let removedInstanceId: string | null = null;

        for (let i = newObjects.length - 1; i >= 0; i--) {
          const obj = newObjects[i];
          const t = catalogMap[obj.typeId];
          if (t?.constraints.placementType !== 'wall') continue;

          if (obj.x === targetX && obj.y === targetY) {
            const objIsH = obj.rotation === 0 || obj.rotation === 180;
            if (objIsH === isH) {
              removedInstanceId = obj.instanceId;
              newObjects.splice(i, 1);
              break;
            }
          }
        }

        if (removedInstanceId) {
          if (removedInstanceId === selectedInstanceId) setSelectedInstanceId(null);
          return { ...prev, layers: { ...prev.layers, objects: newObjects } };
        }

        const nextWalls = prev.layers.walls.filter(w => !(w.x === x && w.y === y && w.orientation === orientation));
        const nextObjects = prev.layers.objects.filter(obj => isWallDecorValid(obj, nextWalls, catalogMap));

        const wallId = `wall_${x}_${y}_${orientation}`;
        if (selectedInstanceId === wallId) setSelectedInstanceId(null);

        return {
          ...prev,
          layers: {
            ...prev.layers,
            walls: nextWalls,
            objects: nextObjects
          }
        };
      });
      return;
    }

    if (activeTool === 'object') {
      const template = catalogMap[selectedTypeId];
      if (!template || template.constraints.placementType !== 'wall') return;

      const targetX = orientation === 'vertical' ? x - 1 : x;
      const targetY = y;
      const autoRotation = orientation === 'horizontal' ? 0 : 90;

      const allowed = template.constraints.allowedRotations?.length
        ? template.constraints.allowedRotations
        : [0];

      if (!allowed.includes(autoRotation)) {
        alert(`Этот предмет не поддерживается для стены под углом ${autoRotation}°!`);
        return;
      }

      const wall = mapState.layers.walls.find(w => w.x === x && w.y === y && w.orientation === orientation);
      if (!wall) {
        alert('Гирлянду/декор можно повесить только на существующую стену!');
        return;
      }

      const minWallLvl = template.constraints.requiresWallLevel || 1;
      if (wall.level < minWallLvl) {
        alert(`Для размещения требуется стена уровня ${minWallLvl} или выше!`);
        return;
      }

      if (wall.isWindow && template.constraints.allowWindowWall === false) {
        alert('Этот предмет нельзя вешать на стену с окном!');
        return;
      }

      if (validatePlacement(selectedTypeId, targetX, targetY, autoRotation)) {
        const newObjId = generateUUID();
        setMapState(prev => ({
          ...prev,
          layers: {
            ...prev.layers,
            objects: [
              ...prev.layers.objects,
              { instanceId: newObjId, typeId: selectedTypeId, x: targetX, y: targetY, rotation: autoRotation }
            ]
          }
        }));
        setSelectedInstanceId(newObjId);
      } else {
        alert('Невозможно разместить декор в этой позиции.\nПодробности в консоли (F12).');
      }
      return;
    }

    if (activeTool !== 'wall') return;

    const hasFloor = hasFloorForWall(mapState.layers.floors, x, y, orientation, buildLevel);
    if (!hasFloor) {
      alert(`Стену уровня ${buildLevel} можно ставить только на край пола уровня ${buildLevel} или выше!`);
      return;
    }

    const isRemoving = mapState.layers.walls.some(w => w.x === x && w.y === y && w.orientation === orientation && w.level === buildLevel && w.isDoor === isDoorPlacement && w.isWindow === isWindowPlacement);

    setMapState(prev => {
      const filtered = prev.layers.walls.filter(w => !(w.x === x && w.y === y && w.orientation === orientation));
      const nextWalls = isRemoving ? filtered : [...filtered, { x, y, orientation, level: buildLevel, isDoor: isDoorPlacement, isWindow: isWindowPlacement }];
      const nextObjects = prev.layers.objects.filter(obj => isWallDecorValid(obj, nextWalls, catalogMap));

      return {
        ...prev,
        layers: {
          ...prev.layers,
          walls: nextWalls,
          objects: nextObjects
        }
      };
    });

    const wallId = `wall_${x}_${y}_${orientation}`;
    if (!isRemoving) {
      setSelectedInstanceId(wallId);
    } else if (selectedInstanceId === wallId) {
      setSelectedInstanceId(null);
    }
  }, [catalogMap, selectedInstanceId, setMapState, mapState.layers.walls, mapState.layers.floors, validatePlacement]);

  const handleSelectBuildingType = useCallback((typeId: string) => {
    setSelectedTypeId(typeId);
    const t = catalogMap[typeId];
    const allowed = t?.constraints.autoTiling ? [0] : (t?.constraints.allowedRotations?.length ? t.constraints.allowedRotations : [0]);
    setCurrentRotation(prevRot => (allowed.includes(prevRot) ? prevRot : allowed[0]));
  }, [catalogMap]);

  const toggleNewBuildingRotation = useCallback((deg: number) => {
    setNewBuilding(prev => {
      const has = prev.allowedRotations.includes(deg);
      const next = has ? prev.allowedRotations.filter(d => d !== deg) : [...prev.allowedRotations, deg].sort((a, b) => a - b);
      return { ...prev, allowedRotations: next };
    });
  }, []);

  const loadForEditing = useCallback((targetTypeId: string) => {
    const t = catalogMap[targetTypeId];
    if (!t) return;
    setNewBuilding({
      typeId: t.typeId,
      name: t.name,
      category: t.category,
      w: t.size.w,
      h: t.size.h,
      image: t.image,
      tooltipImage: t.tooltipImage || '',
      color: t.color,
      allowedRotations: t.constraints.allowedRotations?.length ? [...t.constraints.allowedRotations] : [0],
      placementType: t.constraints.placementType || (t.constraints.requiresFloor ? 'floor' : 'any'),
      minFloorLvl: t.constraints.requiresSpecificFloorLevel || 1,
      minWallLvl: t.constraints.requiresWallLevel || 1,
      allowWindowWall: t.constraints.allowWindowWall ?? true,
      allowWallDecorAbove: t.constraints.allowWallDecorAbove || false,
      maxCount: t.constraints.maxPerBase || 99,
      sharedLimitGroup: t.constraints.sharedLimitGroup || '',
      autoTiling: t.constraints.autoTiling || false,
      connectsTo: t.constraints.connectsTo?.join(', ') || '',
      autoTileImages: {
        single: t.constraints.autoTileImages?.single || '',
        end: t.constraints.autoTileImages?.end || '',
        straight: t.constraints.autoTileImages?.straight || '',
        corner: t.constraints.autoTileImages?.corner || '',
        tee: t.constraints.autoTileImages?.tee || '',
        cross: t.constraints.autoTileImages?.cross || ''
      },
      colorVariants: t.colorVariants ? [...t.colorVariants] : []
    });
    if (isMobileLeftOpen) {
      setIsMobileLeftOpen(false)
      setIsMobileRightOpen(true)
    }
    setIsCatalogBuilderVisible(true)
  }, [catalogMap, isMobileLeftOpen]);

  const saveProduct = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!newBuilding.typeId || !newBuilding.name) return;

    const allowedRotations = newBuilding.autoTiling
      ? [0]
      : (newBuilding.allowedRotations.length ? newBuilding.allowedRotations : [0]);
    const connectsTo = newBuilding.connectsTo
      .split(',')
      .map(typeId => typeId.trim())
      .filter(Boolean);
    const autoTileImages = Object.fromEntries(
      Object.entries(newBuilding.autoTileImages).filter(([, image]) => image.trim())
    ) as Partial<Record<AutoTileVariant, string>>;

    const item: CatalogItem = {
      typeId: newBuilding.typeId.trim(),
      category: newBuilding.category,
      name: newBuilding.name.trim(),
      size: { w: Number(newBuilding.w), h: Number(newBuilding.h) },
      image: newBuilding.image || '',
      tooltipImage: newBuilding.tooltipImage || '',
      color: newBuilding.color,
      colorVariants: newBuilding.colorVariants.filter(v => v.color && v.image),
      constraints: {
        rotatable: !newBuilding.autoTiling && allowedRotations.length > 1,
        allowedRotations,
        autoTiling: newBuilding.autoTiling || undefined,
        connectsTo: connectsTo.length ? connectsTo : undefined,
        autoTileImages: Object.keys(autoTileImages).length ? autoTileImages : undefined,
        placementType: newBuilding.placementType,
        requiresFloor: newBuilding.placementType === 'floor',
        requiresSpecificFloorLevel: (newBuilding.placementType === 'floor' || newBuilding.placementType === 'any') ? Number(newBuilding.minFloorLvl) : undefined,
        requiresWallLevel: newBuilding.placementType === 'wall' ? Number(newBuilding.minWallLvl) : undefined,
        allowWindowWall: newBuilding.placementType === 'wall' ? newBuilding.allowWindowWall : undefined,
        allowWallDecorAbove: newBuilding.allowWallDecorAbove,
        maxPerBase: Number(newBuilding.maxCount),
        sharedLimitGroup: newBuilding.sharedLimitGroup.trim() || undefined
      }
    };

    if (catalogMap[item.typeId]) {
      setCatalog(prev => prev.map(c => c.typeId === item.typeId ? item : c));
      alert(`Здание/декор "${item.name}" успешно обновлено!`);
    } else {
      setCatalog(prev => [...prev, item]);
      alert(`Здание/декор "${item.name}" успешно добавлено!`);
    }
    
    setSelectedTypeId(item.typeId);
    setCurrentRotation(allowedRotations[0]);
  }, [newBuilding, catalogMap]);

  const handleDeleteCatalogItem = useCallback((typeId: string) => {
    const item = catalog.find(c => c.typeId === typeId);
    if (!item) return;

    if (!window.confirm(`Вы действительно хотите удалить "${item.name}" из каталога?`)) {
      return;
    }
    if (!window.confirm(`Внимание! Это действие необратимо. Подтвердите окончательное удаление "${item.name}".`)) {
      return;
    }

    const nextCatalog = catalog.filter(c => c.typeId !== typeId);
    setCatalog(nextCatalog);

    if (selectedTypeId === typeId) {
      setSelectedTypeId(nextCatalog[0]?.typeId ?? '');
    }

    alert(`Элемент "${item.name}" был успешно удалён из каталога.`);
  }, [catalog, selectedTypeId]);

  const handlePaintObject = useCallback((instanceId: string, color: string | undefined) => {
    setMapState(prev => ({
      ...prev,
      layers: {
        ...prev.layers,
        objects: prev.layers.objects.map(o => o.instanceId === instanceId ? { ...o, paintColor: color } : o)
      }
    }));
  }, [setMapState]);

  const handleExportMap = useCallback(() => {
    const safeName = mapState.name.trim().replace(/\s+/g, '_') || 'map_config';
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(mapState, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute("href", dataStr); 
    dlAnchor.setAttribute("download", `ldoe_blueprint_map_${safeName}.json`); 
    dlAnchor.click();
  }, [mapState]);

  const handleImportMap = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try { 
        const parsed = JSON.parse(evt.target?.result as string); 
        if (parsed.mapConfig && parsed.layers) {
          const importedMap: MapData = {
            ...parsed,
            id: parsed.id || generateUUID(),
            name: parsed.name || file.name.replace(/\.json$/i, '') || 'Импортированная карта'
          };

          setMaps(prev => {
            const existingIndex = prev.findIndex(m => m.id === importedMap.id);
            if (existingIndex >= 0) {
              const next = [...prev];
              next[existingIndex] = importedMap;
              return next;
            }
            return [...prev, importedMap];
          });
          setActiveMapId(importedMap.id);
        } 
      } catch { alert('Ошибка структуры JSON карты'); }
    };
    reader.readAsText(file); e.target.value = '';
  }, []);

  const handleExportCatalog = useCallback(() => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(catalog, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute("href", dataStr); dlAnchor.setAttribute("download", "ldoe_catalog.json"); dlAnchor.click();
  }, [catalog]);

  const handleImportCatalog = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target?.result as string);
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].typeId) {
          const normalized: CatalogItem[] = parsed.map((c: CatalogItem) => ({
            ...c, constraints: {
              ...c.constraints, allowedRotations: c.constraints.allowedRotations?.length ? c.constraints.allowedRotations : (c.constraints.rotatable ? ALL_ROTATIONS : [0])
            }
          }));
          setCatalog(normalized);
        }
      } catch { alert('Ошибка структуры JSON каталога'); }
    };
    reader.readAsText(file); e.target.value = '';
  }, []);

  const handleResetCatalog = useCallback(async () => {
    if (!window.confirm('Сбросить каталог к исходным значениям? Добавленные и изменённые элементы будут удалены.')) {
      return;
    }

    try {
      const response = await fetch(`${getBasePath()}/data/catalog.json`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const defaults = await response.json() as CatalogItem[];
      if (!Array.isArray(defaults)) throw new Error('Invalid catalog data');

      setCatalog(defaults);
      setSelectedTypeId(defaults[0]?.typeId ?? '');
      setCurrentRotation(defaults[0]?.constraints.allowedRotations[0] ?? 0);
    } catch (error) {
      console.error('Не удалось сбросить каталог:', error);
      alert('Не удалось получить исходный каталог. Попробуйте ещё раз.');
    }
  }, []);

  const allCells = useMemo(() => {
    const cells: { x: number; y: number }[] = [];
    for (let y = -1; y <= GRID_H; y++) {
      for (let x = -1; x <= GRID_W; x++) cells.push({ x, y });
    }
    return cells.sort((a, b) => {
      if (viewMode === 'isometric') {
        return (a.y - a.x) - (b.y - b.x);
      }
      return (a.x + a.y) - (b.x + b.y);
    });
  }, [GRID_W, GRID_H, viewMode]);

  const wallLines = useMemo(() => {
    const lines: { x: number; y: number; orientation: 'horizontal' | 'vertical' }[] = [];
    for (let y = 0; y <= GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) lines.push({ x, y, orientation: 'horizontal' });
    }
    for (let x = 0; x <= GRID_W; x++) {
      for (let y = 0; y < GRID_H; y++) lines.push({ x, y, orientation: 'vertical' });
    }
    return lines;
  }, [GRID_W, GRID_H]);

  const sortedRootObjects = useMemo(() => {
    return mapState.layers.objects
      .map(obj => ({ obj, template: catalogMap[obj.typeId] }))
      .filter((o): o is { obj: ObjectLayer; template: CatalogItem } => !!o.template)
      .sort((a, b) => {
        const depthA = a.obj.x + a.obj.y;
        const depthB = b.obj.x + b.obj.y;
        if (depthA !== depthB) return depthA - depthB;
        const isWallA = a.template.constraints.placementType === 'wall' ? 1 : 0;
        const isWallB = b.template.constraints.placementType === 'wall' ? 1 : 0;
        return isWallA - isWallB;
      });
  }, [mapState.layers.objects, catalogMap]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (activeTool !== 'hand' && e.button !== 1 && e.button !== 2) return;
    setIsPanning(true);
    lastPointerRef.current = { x: e.clientX, y: e.clientY };
  }, [activeTool]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return;
    const dx = e.clientX - lastPointerRef.current.x; 
    const dy = e.clientY - lastPointerRef.current.y;
    lastPointerRef.current = { x: e.clientX, y: e.clientY };
    setPan(p => ({ x: p.x + dx, y: p.y + dy }));
  }, [isPanning]);

  const stopPanning = useCallback(() => setIsPanning(false), []);
  const resetCamera = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, []);

  const handleCopyObject = useCallback((typeId: string, rotation: number) => {
    setActiveTool('object');
    setSelectedTypeId(typeId);
    setCurrentRotation(rotation);
    setSelectedInstanceId(null);
  }, []);

  const handleRotateSelectedObject = useCallback((obj: { instanceId: string; typeId: string; x: number; y: number; rotation: number }) => {
    const template = catalogMap[obj.typeId];
    if (!template) return;
    const allowed = template.constraints.autoTiling ? [0] : (template.constraints.allowedRotations?.length ? template.constraints.allowedRotations : ALL_ROTATIONS);
    const curIdx = allowed.indexOf(obj.rotation);
    const nextRot = allowed[(curIdx + 1) % allowed.length];
    
    if (validatePlacement(obj.typeId, obj.x, obj.y, nextRot, obj.instanceId)) {
      setMapState(prev => ({
        ...prev,
        layers: {
          ...prev.layers,
          objects: prev.layers.objects.map(o => o.instanceId === obj.instanceId ? { ...o, rotation: nextRot } : o)
        }
      }));
    } else {
      alert('Невозможно повернуть объект в этой позиции!');
    }
  }, [catalogMap, validatePlacement, setMapState]);

  const handleDeleteSelectedObject = useCallback((instanceId: string) => {
    setMapState(prev => ({
      ...prev,
      layers: {
        ...prev.layers,
        objects: prev.layers.objects.filter(o => o.instanceId !== instanceId)
      }
    }));
    if (selectedElementData?.type === 'object' && selectedElementData.data.length <= 1) {
      setSelectedInstanceId(null);
    }
  }, [setMapState, selectedElementData]);

  const handleDeleteSelectedFloor = useCallback((x: number, y: number) => {
    setMapState(prev => {
      const nextFloors = prev.layers.floors.filter(f => !(f.x === x && f.y === y));
      const nextWalls = prev.layers.walls.filter(w => hasFloorForWall(nextFloors, w.x, w.y, w.orientation, w.level));
      const nextObjects = prev.layers.objects.filter(obj => isWallDecorValid(obj, nextWalls, catalogMap));

      return {
        ...prev,
        layers: {
          ...prev.layers,
          floors: nextFloors,
          walls: nextWalls,
          objects: nextObjects
        }
      };
    });
    setSelectedInstanceId(null);
  }, [setMapState, catalogMap]);

  const handleDeleteSelectedWall = useCallback((x: number, y: number, orientation: 'horizontal' | 'vertical') => {
    setMapState(prev => {
      const nextWalls = prev.layers.walls.filter(w => !(w.x === x && w.y === y && w.orientation === orientation));
      const nextObjects = prev.layers.objects.filter(obj => isWallDecorValid(obj, nextWalls, catalogMap));

      return {
        ...prev,
        layers: {
          ...prev.layers,
          walls: nextWalls,
          objects: nextObjects
        }
      };
    });
    setSelectedInstanceId(null);
  }, [setMapState, catalogMap]);

  const handleDeleteWallDecor = useCallback((instanceId: string) => {
    setMapState(prev => ({
      ...prev,
      layers: {
        ...prev.layers,
        objects: prev.layers.objects.filter(o => o.instanceId !== instanceId)
      }
    }));
  }, [setMapState]);

  if (!isLoaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-950 text-amber-500 font-bold">
        Загрузка данных редактора...
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-screen w-screen overflow-hidden bg-neutral-950 text-white select-none">
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #171717; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #f59e0b; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #fbbf24; }
      `}} />

      <div className="md:hidden flex items-center justify-between bg-neutral-900 border-b border-neutral-800 p-2.5 z-20">
        <button
          onClick={() => setIsMobileLeftOpen(true)}
          className="bg-neutral-800 hover:bg-neutral-700 text-amber-500 font-bold px-3 py-2 rounded text-xs border border-neutral-700 flex items-center gap-1 min-h-[40px]"
        >
          <span>☰</span> Инструменты
        </button>
        <span className="font-black text-amber-500 text-xs tracking-wider">LDOE BLUEPRINT</span>
        <button
          onClick={() => setIsMobileRightOpen(true)}
          className="bg-neutral-800 hover:bg-neutral-700 text-amber-500 font-bold px-3 py-2 rounded text-xs border border-neutral-700 flex items-center gap-1 min-h-[40px]"
        >
          <span>⚙️</span> Каталог
        </button>
      </div>

      <div className={`fixed md:relative inset-y-0 left-0 z-40 w-80 max-w-[85vw] transform ${isMobileLeftOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 transition-transform duration-200 ease-in-out`}>
        <LeftSidebar
          gridW={GRID_W}
          gridH={GRID_H}
          maps={maps}
          mapState={mapState}
          activeMapId={activeMapId}
          availableMaps={availableMaps}
          catalog={catalog}
          catalogMap={catalogMap}
          uniqueCategories={uniqueCategories}
          searchCategory={searchCategory}
          searchQuery={searchQuery}
          activeTool={activeTool}
          viewMode={viewMode}
          zoom={zoom}
          buildLevel={buildLevel}
          isDoorPlacement={isDoorPlacement}
          isWindowPlacement={isWindowPlacement}
          selectedTypeId={selectedTypeId}
          selectedAllowedRotations={selectedAllowedRotations}
          currentRotation={currentRotation}
          dragItemIndex={dragItemIndex}
          dragOverItemIndex={dragOverItemIndex}
          onCreateMap={handleCreateMap}
          onDeleteMap={handleDeleteMap}
          onRenameMap={handleRenameMap}
          onSetActiveMapId={setActiveMapId}
          onExportMap={handleExportMap}
          onImportMap={handleImportMap}
          onExportCatalog={handleExportCatalog}
          onImportCatalog={handleImportCatalog}
          onResetCatalog={handleResetCatalog}
          onSetViewMode={setViewMode}
          onResetCamera={resetCamera}
          onSetActiveTool={setActiveTool}
          onSetBuildLevel={setBuildLevel}
          onSetDoorPlacement={setIsDoorPlacement}
          onSetWindowPlacement={setIsWindowPlacement}
          onSetSearchCategory={setSearchCategory}
          onSetSearchQuery={setSearchQuery}
          onClearSearch={() => setSearchQuery('')}
          onSelectBuildingType={handleSelectBuildingType}
          onCurrentRotationChange={setCurrentRotation}
          onLoadForEditing={loadForEditing}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onDragEnd={handleDragEnd}
          objectListRef={objectListRef}
          onCloseMobile={() => setIsMobileLeftOpen(false)}
        />
      </div>
      
      {isMobileLeftOpen && (
        <div 
          onClick={() => setIsMobileLeftOpen(false)} 
          className="fixed inset-0 bg-black/60 z-30 md:hidden backdrop-blur-sm"
        />
      )}

      <div className="relative flex-1 h-full overflow-hidden flex items-center justify-center z-0">
        <CanvasGrid
          mapState={mapState}
          catalogMap={catalogMap}
          viewMode={viewMode}
          zoom={zoom}
          pan={pan}
          isPanning={isPanning}
          activeTool={activeTool}
          selectedTypeId={selectedTypeId}
          selectedInstanceId={selectedInstanceId}
          selectedElementData={selectedElementData}
          allCells={allCells}
          wallLines={wallLines}
          sortedRootObjects={sortedRootObjects}
          useWillChange={activeWillChange}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={stopPanning}
          onMouseLeave={stopPanning}
          onCellClick={handleCellClick}
          onWallClick={handleWallClick}
          onSelectInstance={setSelectedInstanceId}
          onZoomChange={setZoom}
          onPanChange={setPan}
        />
      
        <SelectedElementPanel
          selectedElementData={selectedElementData}
          onClose={() => setSelectedInstanceId(null)}
          onPaintObject={handlePaintObject}
          onCopyObject={handleCopyObject}
          onRotateObject={handleRotateSelectedObject}
          onDeleteObject={handleDeleteSelectedObject}
          onDeleteFloor={handleDeleteSelectedFloor}
          onDeleteWall={handleDeleteSelectedWall}
          onDeleteWallDecor={handleDeleteWallDecor}
        />
      </div>

      {isMobileRightOpen && (
        <div 
          onClick={() => setIsMobileRightOpen(false)} 
          className="fixed inset-0 bg-black/60 z-30 md:hidden backdrop-blur-sm"
        />
      )}
      
      <div className={`fixed md:relative inset-y-0 right-0 max-md:w-80 max-w-[85vw] z-40 transform ${isMobileRightOpen ? 'translate-x-0' : 'translate-x-full'} md:translate-x-0 transition-transform duration-200 ease-in-out`}>
        <RightSidebar
          isCatalogBuilderVisible={isCatalogBuilderVisible || isMobileRightOpen}
          newBuilding={newBuilding}
          allCategories={allCategories}
          catalog={catalog}
          onToggleVisibility={() => setIsCatalogBuilderVisible(prev => !prev)}
          onSetNewBuilding={setNewBuilding}
          onToggleNewBuildingRotation={toggleNewBuildingRotation}
          onSaveProduct={saveProduct}
          onDeleteProduct={handleDeleteCatalogItem}
          onCloseMobile={() => setIsMobileRightOpen(false)}
        />
      </div>
    </div>
  );
}