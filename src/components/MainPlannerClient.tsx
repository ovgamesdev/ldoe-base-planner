/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useLanguage } from '@/context/LanguageContext'
import { trackEvent } from '@/lib/analytics'
import {
  applyCatalogOverlay,
  buildCatalogOverlay,
  cleanupCatalogOverlay, LEGACY_CATALOG_STORAGE_KEY, readCatalogOverlay,
  writeCatalogOverlay
} from '@/lib/catalog-overlay'
import { ALL_ROTATIONS, CATEGORY_LABELS, DEFAULT_MAP, EMPTY_AUTO_TILE_IMAGES, LOADING_MAP, Tool, ViewMode } from '@/lib/constants'
import { auth, db } from '@/lib/firebase'
import {
  getEffectiveSize,
  getOccupiedCells,
  hasFloorForWall,
  hasValidWallForDecor,
  isWallCrossingObjectFootprint,
  isWallDecorValid
} from '@/lib/grid-utils'
import { getItemName, searchMatchesName, type AutoTileVariant, type BaseData, type BaseType, type CatalogItem, type CatalogOverlay, type MapData, type ModalInfoState, type NewBuildingState, type NoBuildZone, type ObjectLayer, type SettlementLayerType } from '@/lib/initial-data'
import {
  buildBlankMap,
  decompressMapFromUrl,
  resolveImportedMapOwnership,
  resolveShareCreatedAt,
  sanitizeMapData,
  validateMapData
} from '@/lib/map-utils'
import { cyrb53, generateUUID, getBasePath } from '@/lib/utils'
import { GoogleAuthProvider, linkWithPopup, onAuthStateChanged, signInAnonymously, signInWithPopup, signOut, User } from 'firebase/auth'
import { child, get, goOffline, goOnline, ref, remove, serverTimestamp, set } from 'firebase/database'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CanvasGrid } from './CanvasGrid'
import CookieConsentBanner from './CookieConsentBanner'
import { LeftSidebar } from './LeftSidebar'
import { ModalInfo } from './ModalInfo'
import { RightSidebar } from './RightSidebar'
import { SelectedElementPanel } from './SelectedElementPanel'
import { SharedBasesModal } from './SharedBasesModal'

export default function MainPlannerClient() {
  const { t, language } = useLanguage();

  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u) {
        setCurrentUser(u);
      } else {
        signInAnonymously(auth).catch((e) => console.error('Auth error:', e));
      }
    });
    return () => unsubscribe();
  }, []);

  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  // Live copy of /data/catalog.json (as last fetched) and the local overlay diffed
  // against it — see the catalog persistence helpers above `validateMapData`.
  const catalogDefaultsRef = useRef<CatalogItem[]>([]);
  const catalogOverlayRef = useRef<CatalogOverlay>({});

  const [isMobileLeftOpen, setIsMobileLeftOpen] = useState(false);
  const [isMobileRightOpen, setIsMobileRightOpen] = useState(false);

  const [modalInfo, setModalInfo] = useState<ModalInfoState | null>(null);

  const [isSharedBasesModalOpen, setIsSharedBasesModalOpen] = useState(false);
  const [sharedBasesList, setSharedBasesList] = useState<Partial<MapData>[]>([]);
  const [isLoadingSharedBases, setIsLoadingSharedBases] = useState(false);
  const [sharedBasesPage, setSharedBasesPage] = useState<number>(1);
  const [sharedBasesSearchQuery, setSharedBasesSearchQuery] = useState('');
  const [sharedBasesFilterMode, setSharedBasesFilterMode] = useState<'all' | 'my'>('all');
  const SHARED_BASES_PER_PAGE = 50;

  const showAlert = useCallback((message: string, title?: string, type: 'error' | 'info' | 'success' | 'warning' = 'info') => {
    setModalInfo({ message, title, type });
  }, []);

  const handleGoogleSignIn = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    try {
      await goOnline(db);
      if (auth.currentUser && auth.currentUser.isAnonymous) {
        try {
          await linkWithPopup(auth.currentUser, provider);
        } catch (linkError: any) {
          if (linkError.code === 'auth/credential-already-in-use') {
            await signInWithPopup(auth, provider);
          } else {
            throw linkError;
          }
        }
      } else {
        await signInWithPopup(auth, provider);
      }
      await goOffline(db);
      trackEvent('login', { method: 'google' });
    } catch (error: any) {
      await goOffline(db);
      if (error?.code !== 'auth/popup-closed-by-user') {
        console.error('Google Sign-In Error:', error);
        showAlert(t('authError'), t('error'), 'error');
      }
    }
  }, [showAlert, t]);

  const handleSignOut = useCallback(async () => {
    try {
      await goOnline(db);
      await signOut(auth);
      await signInAnonymously(auth);
      await goOffline(db);
      trackEvent('logout');
    } catch (error) {
      await goOffline(db);
      console.error('Sign-out error:', error);
    }
  }, []);

  const catalogMap = useMemo(() => {
    const map: Record<string, CatalogItem> = {};
    catalog.forEach(c => { map[c.typeId] = c; });
    return map;
  }, [catalog]);

  const [maps, setMaps] = useState<MapData[]>([]);
  const [activeMapId, setActiveMapId] = useState<string>('');
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);

  const [activeBaseType, setActiveBaseType] = useState<BaseType>('main');
  const [activeSettlementLayer, setActiveSettlementLayer] = useState<SettlementLayerType>('objects');

  const [layerSelections, setLayerSelections] = useState<Record<string, string>>({});

  const handleBaseTypeChange = useCallback((newType: BaseType) => {
    setActiveBaseType(newType);
    trackEvent('change_base_type', { base_type: newType });
  }, []);

  const handleSettlementLayerChange = useCallback((newLayer: SettlementLayerType) => {
    setActiveSettlementLayer(newLayer);
    trackEvent('change_settlement_layer', { layer: newLayer });
  }, []);

  const currentLayerKey = useMemo(() => {
    return activeBaseType === 'main' ? 'main' : `settlement_${activeSettlementLayer}`;
  }, [activeBaseType, activeSettlementLayer]);

  const fullMapState = useMemo(() => {
    return maps.find(m => m.id === activeMapId) || LOADING_MAP;
  }, [maps, activeMapId]);

  const mapState = useMemo(() => {
    const base = activeBaseType === 'main' ? fullMapState?.mainBase : fullMapState?.settlementBase;
    const defaultBase = activeBaseType === 'main' ? DEFAULT_MAP.mainBase : DEFAULT_MAP.settlementBase;
    if (!base) return defaultBase;

    return {
      mapConfig: {
        width: base.mapConfig?.width ?? defaultBase.mapConfig.width,
        height: base.mapConfig?.height ?? defaultBase.mapConfig.height,
        noBuildZones: Array.isArray(base.mapConfig?.noBuildZones) ? base.mapConfig.noBuildZones : []
      },
      layers: {
        floors: Array.isArray(base.layers?.floors) ? base.layers.floors : [],
        walls: Array.isArray(base.layers?.walls) ? base.layers.walls : [],
        objects: Array.isArray(base.layers?.objects) ? base.layers.objects : []
      }
    };
  }, [fullMapState, activeBaseType]);

  const { width: GRID_W, height: GRID_H } = mapState.mapConfig;

  const calculateRooms = useCallback((walls: BaseData['layers']['walls'], w: number, h: number) => {
    const visited = new Set<string>();
    const rooms: Set<string>[] = [];

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const key = `${x},${y}`;
        if (visited.has(key)) continue;

        const currentRoom = new Set<string>();
        const queue = [{x, y}];
        let isClosed = true;

        while (queue.length > 0) {
          const curr = queue.shift()!;
          const cKey = `${curr.x},${curr.y}`;
          if (visited.has(cKey)) continue;

          visited.add(cKey);
          currentRoom.add(cKey);

          const hasTopWall = walls.some(wall => wall.x === curr.x && wall.y === curr.y && wall.orientation === 'horizontal');
          if (!hasTopWall) {
            if (curr.y > 0) {
              queue.push({x: curr.x, y: curr.y - 1});
            } else {
              isClosed = false;
            }
          }

          const hasBottomWall = walls.some(wall => wall.x === curr.x && wall.y === curr.y + 1 && wall.orientation === 'horizontal');
          if (!hasBottomWall) {
            if (curr.y < h - 1) {
              queue.push({x: curr.x, y: curr.y + 1});
            } else {
              isClosed = false;
            }
          }

          const hasLeftWall = walls.some(wall => wall.x === curr.x && wall.y === curr.y && wall.orientation === 'vertical');
          if (!hasLeftWall) {
            if (curr.x > 0) {
              queue.push({x: curr.x - 1, y: curr.y});
            } else {
              isClosed = false;
            }
          }

          const hasRightWall = walls.some(wall => wall.x === curr.x + 1 && wall.y === curr.y && wall.orientation === 'vertical');
          if (!hasRightWall) {
            if (curr.x < w - 1) {
              queue.push({x: curr.x + 1, y: curr.y});
            } else {
              isClosed = false;
            }
          }
        }
        if (isClosed) rooms.push(currentRoom);
      }
    }
    return rooms;
  }, []);

  const rooms = useMemo(() => {
    if (activeBaseType !== 'settlement') return [];
    return calculateRooms(mapState.layers.walls, GRID_W, GRID_H);
  }, [activeBaseType, mapState.layers.walls, GRID_W, GRID_H, calculateRooms]);

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
          if (activeBaseType === 'settlement') {
            const objLayer = o.layer || 'objects';
            if (objLayer !== activeSettlementLayer) {
              const t = catalogMap[o.typeId];
              const isRes = (activeSettlementLayer === 'objects' && (t?.constraints.requiresPower || t?.constraints.requiresWater)) ||
                            (activeSettlementLayer === 'energy' && t?.constraints.requiresPower) ||
                            (activeSettlementLayer === 'water' && t?.constraints.requiresWater);
              if (!isRes) return false;
            }
          }
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
      if (activeBaseType === 'settlement') {
        const objLayer = primaryObj.layer || 'objects';
        if (objLayer !== activeSettlementLayer) {
          const t = catalogMap[primaryObj.typeId];
          const isRes = (activeSettlementLayer === 'objects' && (t?.constraints.requiresPower || t?.constraints.requiresWater)) ||
                        (activeSettlementLayer === 'energy' && t?.constraints.requiresPower) ||
                        (activeSettlementLayer === 'water' && t?.constraints.requiresWater);
          if (!isRes) return null;
        }
      }

      const primaryTemplate = catalogMap[primaryObj.typeId];
      const primaryEffSize = primaryTemplate ? getEffectiveSize(primaryTemplate) : null;
      const primaryCells = primaryTemplate && primaryEffSize
        ? getOccupiedCells(primaryObj.x, primaryObj.y, primaryEffSize.w, primaryEffSize.h, primaryObj.rotation)
        : [{ x: primaryObj.x, y: primaryObj.y }];

      const objectsInCell = mapState.layers.objects.filter(o => {
        if (activeBaseType === 'settlement') {
          const objLayer = o.layer || 'objects';
          if (objLayer !== activeSettlementLayer) {
            const t = catalogMap[o.typeId];
            const isRes = (activeSettlementLayer === 'objects' && (t?.constraints.requiresPower || t?.constraints.requiresWater)) ||
                          (activeSettlementLayer === 'energy' && t?.constraints.requiresPower) ||
                          (activeSettlementLayer === 'water' && t?.constraints.requiresWater);
            if (!isRes) return false;
          }
        }
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
  }, [selectedInstanceId, mapState, catalogMap, activeBaseType, activeSettlementLayer]);

  useEffect(() => {
    if (selectedInstanceId && !selectedElementData) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedInstanceId(null);
    }
  }, [selectedInstanceId, selectedElementData]);

  const setMapState = useCallback((action: BaseData | ((prev: BaseData) => BaseData)) => {
    setMaps(prevMaps =>
      prevMaps.map(m => {
        if (m.id === activeMapId) {
          const currentBase = activeBaseType === 'main'
            ? (m.mainBase || DEFAULT_MAP.mainBase)
            : (m.settlementBase || DEFAULT_MAP.settlementBase);
          const newBase = typeof action === 'function' ? action(currentBase) : action;
          return {
             ...m,
             [activeBaseType === 'main' ? 'mainBase' : 'settlementBase']: newBase
          };
        }
        return m;
      })
    );
  }, [activeMapId, activeBaseType]);

  const [viewMode, setViewMode] = useState<ViewMode>('topDown');
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoadingShareParam, setIsLoadingShareParam] = useState(false);
  const [hoveredCell, setHoveredCell] = useState<{x: number, y: number} | null>(null);

  const [activeTool, setActiveTool] = useState<Tool>('hand');
  const [selectedTypeId, setSelectedTypeId] = useState<string>('');
  const [currentRotation, setCurrentRotation] = useState<number>(0);
  const [buildLevel, setBuildLevel] = useState<number>(1);
  const [isDoorPlacement, setIsDoorPlacement] = useState<boolean>(false);
  const [isWindowPlacement, setIsWindowPlacement] = useState<boolean>(false);
  const [isCatalogBuilderVisible, setIsCatalogBuilderVisible] = useState(false);

  const handleToolChange = useCallback((tool: Tool) => {
    setActiveTool(tool);
    trackEvent('select_tool', { tool });
  }, []);

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    trackEvent('change_view_mode', { mode });
  }, []);

  const interactionRef = useRef({
    activeTool, selectedTypeId, currentRotation, buildLevel, isDoorPlacement, isWindowPlacement, activeBaseType, activeSettlementLayer
  });

  useEffect(() => {
    interactionRef.current = { activeTool, selectedTypeId, currentRotation, buildLevel, isDoorPlacement, isWindowPlacement, activeBaseType, activeSettlementLayer };
  }, [activeTool, selectedTypeId, currentRotation, buildLevel, isDoorPlacement, isWindowPlacement, activeBaseType, activeSettlementLayer]);

  const handleSetHoveredCell = useCallback((cell: { x: number; y: number } | null) => {
    if (interactionRef.current.activeBaseType !== 'settlement' || interactionRef.current.activeTool !== 'object' || !((catalogMap[interactionRef.current.selectedTypeId]?.constraints?.requiredDesk) || (catalogMap[interactionRef.current.selectedTypeId]?.constraints?.isDesk))) {
      setHoveredCell(prev => (prev === null ? prev : null));
      return;
    }

    setHoveredCell(prev => {
      if (!prev && !cell) return prev;
      if (prev && cell && prev.x === cell.x && prev.y === cell.y) return prev;
      return cell;
    });
  }, [catalogMap]);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchCategory, setSearchCategory] = useState<string>('all');

  const [dragItemIndex, setDragItemIndex] = useState<number | null>(null);
  const [dragOverItemIndex, setDragOverItemIndex] = useState<number | null>(null);

  const filteredCatalogForCurrentLayer = useMemo(() => {
    return catalog.filter(c => {
      if (c.constraints.baseType && c.constraints.baseType !== 'both' && c.constraints.baseType !== activeBaseType) return false;
      if (activeBaseType === 'settlement') {
        const itemLayer = c.constraints.settlementLayer || 'objects';
        if (itemLayer !== activeSettlementLayer) {
          const isRes = (activeSettlementLayer === 'objects' && (c.constraints.requiresPower || c.constraints.requiresWater)) ||
                        (activeSettlementLayer === 'energy' && c.constraints.requiresPower) ||
                        (activeSettlementLayer === 'water' && c.constraints.requiresWater);
          if (!isRes) return false;
        }
      }
      return true;
    });
  }, [catalog, activeBaseType, activeSettlementLayer]);

  const uniqueCategories = useMemo(() => Array.from(new Set(filteredCatalogForCurrentLayer.map(c => c.category))), [filteredCatalogForCurrentLayer]);
  const allCategories = useMemo(() => [...uniqueCategories.filter(c => !(c in CATEGORY_LABELS)), ...Object.keys(CATEGORY_LABELS)], [uniqueCategories]);

  useEffect(() => {
    if (!isLoaded || filteredCatalogForCurrentLayer.length === 0) return;

    const savedTypeId = layerSelections[currentLayerKey];
    if (savedTypeId && filteredCatalogForCurrentLayer.some(item => item.typeId === savedTypeId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedTypeId(savedTypeId);
      const t = catalogMap[savedTypeId];
      if (t) {
        const allowed = t.constraints.autoTiling ? [0] : (t.constraints.allowedRotations?.length ? t.constraints.allowedRotations : [0]);
        setCurrentRotation(allowed[0] || 0);
      }
    } else if (selectedTypeId && filteredCatalogForCurrentLayer.some(item => item.typeId === selectedTypeId)) {
      setLayerSelections(prev => ({ ...prev, [currentLayerKey]: selectedTypeId }));
      const t = catalogMap[selectedTypeId];
      if (t) {
        const allowed = t.constraints.autoTiling ? [0] : (t.constraints.allowedRotations?.length ? t.constraints.allowedRotations : [0]);
        setCurrentRotation(allowed[0] || 0);
      }
    } else {
      const defaultTypeId = filteredCatalogForCurrentLayer[0].typeId;
      setSelectedTypeId(defaultTypeId);
      setLayerSelections(prev => ({ ...prev, [currentLayerKey]: defaultTypeId }));
      const t = filteredCatalogForCurrentLayer[0];
      const allowed = t.constraints.autoTiling ? [0] : (t.constraints.allowedRotations?.length ? t.constraints.allowedRotations : [0]);
      setCurrentRotation(allowed[0] || 0);
    }
  }, [isLoaded, currentLayerKey, filteredCatalogForCurrentLayer, layerSelections, catalogMap, selectedTypeId]);

  const availableMaps = useMemo(() => {
    return maps.map(map => ({ id: map.id, name: map.name }));
  }, [maps]);

  const [isPanning, setIsPanning] = useState<boolean>(false);
  const lastPointerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const skipNextPersistenceRef = useRef(true);

  const [newBuilding, setNewBuilding] = useState<NewBuildingState>({
    typeId: '', name: { ru: '', en: '' }, category: 'workstation', w: 1, h: 1, image: '', tooltipImage: '', color: '#4b5563',
    allowedRotations: [0, 90, 180, 270],
    placementType: 'floor',
    minFloorLvl: 1,
    minWallLvl: 1,
    allowWindowWall: true,
    allowWallDecorAbove: false,
    maxCount: 99,
    sharedLimitGroup: '',
    autoTiling: false,
    connectsTo: '',
    autoTileImages: EMPTY_AUTO_TILE_IMAGES,
    colorVariants: [],
    baseType: 'both',
    settlementLayer: 'objects',
    isDesk: '',
    requiredDesk: '',
    requiresPower: false,
    requiresWater: false
  });

  const objectListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void (async () => {
      try {
        const catalogResponse = await fetch(`${getBasePath()}/data/catalog.json`);
        if (!catalogResponse.ok) throw new Error('Initial data request failed');
        const defaults = await catalogResponse.json() as CatalogItem[];
        if (!Array.isArray(defaults)) {
          throw new Error('Invalid initial data');
        }

        const savedMaps = localStorage.getItem('ldoe_maps');
        const savedActiveMapId = localStorage.getItem('ldoe_activeMapId');
        const savedViewMode = localStorage.getItem('ldoe_viewMode');
        const savedZoom = localStorage.getItem('ldoe_zoom');
        const savedPan = localStorage.getItem('ldoe_pan');
        const savedActiveTool = localStorage.getItem('ldoe_activeTool');
        const savedToolConfig = localStorage.getItem('ldoe_toolConfig');
        const savedLayerSelections = localStorage.getItem('ldoe_layerSelections');
        const savedNewBuilding = localStorage.getItem('ldoe_newBuilding');
        const savedCatalogBuilderVisibility = localStorage.getItem('ldoe_catalogBuilderVisible');

        catalogDefaultsRef.current = defaults;

        let overlay = readCatalogOverlay();
        if (Object.keys(overlay).length === 0) {
          // One-time migration from the old "full catalog copy" storage format.
          const legacyRaw = localStorage.getItem(LEGACY_CATALOG_STORAGE_KEY);
          if (legacyRaw) {
            try {
              const legacyCatalog = JSON.parse(legacyRaw) as CatalogItem[];
              if (Array.isArray(legacyCatalog) && legacyCatalog.length > 0) {
                overlay = buildCatalogOverlay(legacyCatalog, defaults, {});
              }
            } catch {
              // Ignore malformed legacy data — fall back to defaults.
            }
          }
        }
        localStorage.removeItem(LEGACY_CATALOG_STORAGE_KEY);

        // Drop any overlay entries catalog.json has already caught up with.
        overlay = cleanupCatalogOverlay(overlay, defaults);
        catalogOverlayRef.current = overlay;
        writeCatalogOverlay(overlay);

        setCatalog(applyCatalogOverlay(defaults, overlay));

        let restoredMap = false;
        if (savedMaps) {
          const parsedMaps = JSON.parse(savedMaps) as MapData[];
          if (Array.isArray(parsedMaps) && parsedMaps.length > 0) {
            const sanitizedMaps = parsedMaps.map(m => sanitizeMapData(m, tRef.current('mapPrefix')));
            setMaps(sanitizedMaps);
            setActiveMapId(savedActiveMapId && sanitizedMaps.some(map => map.id === savedActiveMapId)
              ? savedActiveMapId
              : sanitizedMaps[0].id);
            restoredMap = true;
          }
        }

        if (!restoredMap) {
          const blankMap = buildBlankMap(tRef.current('mapPrefix'));
          setMaps([blankMap]);
          setActiveMapId(blankMap.id);
        }

        if (savedViewMode) setViewMode(savedViewMode as ViewMode);
        if (savedZoom) setZoom(parseFloat(savedZoom));
        if (savedPan) setPan(JSON.parse(savedPan));
        if (savedActiveTool) setActiveTool(savedActiveTool as Tool);

        if (savedLayerSelections) {
          try {
            setLayerSelections(JSON.parse(savedLayerSelections));
          } catch (e) {
            console.error('Ошибка чтения layerSelections:', e);
          }
        }

        if (savedToolConfig) {
          const config = JSON.parse(savedToolConfig);
          if (config.selectedTypeId) setSelectedTypeId(config.selectedTypeId);
          if (config.currentRotation !== undefined) setCurrentRotation(config.currentRotation);
          if (config.buildLevel !== undefined) setBuildLevel(config.buildLevel);
          if (config.isDoorPlacement !== undefined) setIsDoorPlacement(config.isDoorPlacement);
          if (config.isWindowPlacement !== undefined) setIsWindowPlacement(config.isWindowPlacement);
          if (config.activeBaseType) setActiveBaseType(config.activeBaseType);
          if (config.activeSettlementLayer) setActiveSettlementLayer(config.activeSettlementLayer);
        }

        if (savedNewBuilding) {
          const savedBuilding = JSON.parse(savedNewBuilding);
          setNewBuilding(prev => ({
            ...prev,
            ...savedBuilding,
            autoTiling: savedBuilding.autoTiling ?? false,
            connectsTo: savedBuilding.connectsTo ?? '',
            autoTileImages: { ...EMPTY_AUTO_TILE_IMAGES, ...savedBuilding.autoTileImages },
            baseType: savedBuilding.baseType || 'both',
            settlementLayer: savedBuilding.settlementLayer || 'objects',
            isDesk: savedBuilding.isDesk || '',
            requiredDesk: savedBuilding.requiredDesk || '',
            requiresPower: savedBuilding.requiresPower ?? false,
            requiresWater: savedBuilding.requiresWater ?? false
          }));
        }
        if (savedCatalogBuilderVisibility) setIsCatalogBuilderVisible(savedCatalogBuilderVisibility === 'true');
        trackEvent('app_init');
      } catch (e) {
        console.error('Ошибка загрузки состояния из localStorage:', e);
      } finally {
        setIsLoaded(true);
      }
    })();
  }, [showAlert]);

  const shareParamHandledRef = useRef(false);
  useEffect(() => {
    if (!isLoaded || !currentUser || shareParamHandledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const paramName = params.has('share') ? 'share' : (params.has('map') ? 'map' : null);
    const shareParam = paramName ? params.get(paramName) : null;
    if (!shareParam) {
      shareParamHandledRef.current = true;
      return;
    }
    shareParamHandledRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoadingShareParam(true);

    void (async () => {
      try {
        let sharedMap: Partial<MapData> | null = null;
        await goOnline(db);
        const snapshot = await get(child(ref(db), `shares/${shareParam}`));
        if (snapshot.exists()) {
          sharedMap = snapshot.val() as Partial<MapData>;
        } else {
          sharedMap = await decompressMapFromUrl(shareParam, tRef.current('loadedMap'));
        }
        await goOffline(db);

        if (sharedMap && validateMapData(sharedMap)) {
          const sanitized = sanitizeMapData(sharedMap, tRef.current('mapPrefix'));
          const owned = resolveImportedMapOwnership(sanitized, currentUser.uid, shareParam);
          const isOwner = Boolean(sanitized.ownerId) && sanitized.ownerId === currentUser.uid;
          const mapObj: MapData = {
            ...owned,
            id: owned.id || `shared_${cyrb53(shareParam)}`,
            name: owned.name || tRef.current('sharedMap')
          };
          setMaps(prev => {
            const filtered = prev.filter(m => m.id !== mapObj.id);
            return [...filtered, mapObj];
          });
          setActiveMapId(mapObj.id);

          const url = new URL(window.location.href);
          url.searchParams.delete('share');
          url.searchParams.delete('map');
          window.history.replaceState(null, '', url);
          trackEvent('map_open_via_share', { share_id: shareParam, is_owner: isOwner, source: paramName || 'share' });
        } else {
          showAlert(tRef.current('jsonStructureError'), tRef.current('importError'), 'error');
        }
      } catch (err) {
        await goOffline(db);
        console.error('Ошибка загрузки карты из ссылки:', err);
        showAlert(tRef.current('failedLoadShared'), tRef.current('importError'), 'error');
      } finally {
        setIsLoadingShareParam(false);
      }
    })();
  }, [isLoaded, currentUser, showAlert]);

  useEffect(() => {
    if (!isLoaded) return;
    if (skipNextPersistenceRef.current) {
      skipNextPersistenceRef.current = false;
      return;
    }

    const nextCatalogOverlay = buildCatalogOverlay(catalog, catalogDefaultsRef.current, catalogOverlayRef.current);
    catalogOverlayRef.current = nextCatalogOverlay;
    writeCatalogOverlay(nextCatalogOverlay);
    localStorage.setItem('ldoe_maps', JSON.stringify(maps));
    localStorage.setItem('ldoe_activeMapId', activeMapId);
    localStorage.setItem('ldoe_viewMode', viewMode);
    localStorage.setItem('ldoe_zoom', zoom.toString());
    localStorage.setItem('ldoe_pan', JSON.stringify(pan));
    localStorage.setItem('ldoe_activeTool', activeTool);
    localStorage.setItem('ldoe_layerSelections', JSON.stringify(layerSelections));
    localStorage.setItem('ldoe_toolConfig', JSON.stringify({
      selectedTypeId,
      currentRotation,
      buildLevel,
      isDoorPlacement,
      isWindowPlacement,
      activeBaseType,
      activeSettlementLayer
    }));
    localStorage.setItem('ldoe_newBuilding', JSON.stringify(newBuilding));
    localStorage.setItem('ldoe_catalogBuilderVisible', String(isCatalogBuilderVisible));
  }, [catalog, maps, activeMapId, viewMode, zoom, pan, isLoaded, activeTool, selectedTypeId, currentRotation, buildLevel, isDoorPlacement, isWindowPlacement, newBuilding, isCatalogBuilderVisible, activeBaseType, activeSettlementLayer, layerSelections]);

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

    const filteredCatalog = catalog.filter(item => {
      if (item.constraints.baseType && item.constraints.baseType !== 'both' && item.constraints.baseType !== activeBaseType) return false;
      if (activeBaseType === 'settlement') {
        const itemLayer = item.constraints.settlementLayer || 'objects';
        if (itemLayer !== activeSettlementLayer) {
          const isRes = (activeSettlementLayer === 'objects' && (item.constraints.requiresPower || item.constraints.requiresWater)) ||
                        (activeSettlementLayer === 'energy' && item.constraints.requiresPower) ||
                        (activeSettlementLayer === 'water' && item.constraints.requiresWater);
          if (!isRes) return false;
        }
      }
      return (searchCategory === 'all' || item.category === searchCategory) &&
      (searchMatchesName(item.name, searchQuery) || item.category.toLowerCase().includes(searchQuery.toLowerCase()))
    });

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
  }, [catalog, dragItemIndex, dragOverItemIndex, searchCategory, searchQuery, activeBaseType, activeSettlementLayer]);

  const handleDragEnd = useCallback(() => {
    setDragItemIndex(null);
    setDragOverItemIndex(null);
  }, []);

  const handleCreateMap = useCallback(() => {
    const newMap = buildBlankMap(`${t('mapPrefix')} ${maps.length + 1}`);
    setMaps(prev => [...prev, newMap]);
    setActiveMapId(newMap.id);
    trackEvent('map_create', { map_id: newMap.id });
  }, [maps.length, t]);

  const handleRenameMap = useCallback((newName: string) => {
    setMaps(prev => prev.map(m => m.id === fullMapState.id ? { ...m, name: newName } : m));
    trackEvent('map_rename', { map_id: fullMapState.id, new_name: newName });
  }, [fullMapState.id]);

  const handleDeleteMap = useCallback(async (idToDelete: string) => {
    if (maps.length <= 1) {
      showAlert(t('cannotDeleteOnlyMap'), t('attention'), 'warning');
      return;
    }
    if (!window.confirm(t('confirmDeleteMap'))) {
      return;
    }
    if (!window.confirm(t('confirmDeleteMapFinal'))) {
      return;
    }

    const targetMap = maps.find(m => m.id === idToDelete);
    if (targetMap?.shareId && targetMap?.ownerId && currentUser && targetMap.ownerId === currentUser.uid) {
      try {
        await goOnline(db);
        await remove(ref(db, `shares/${targetMap.shareId}`));
        await remove(ref(db, `shares_summary/${targetMap.shareId}`));
        await goOffline(db);
      } catch (e) {
        await goOffline(db);
        console.error('Ошибка удаления карты из Firebase:', e);
      }
    }

    const nextMaps = maps.filter(m => m.id !== idToDelete);
    setMaps(nextMaps);
    if (activeMapId === idToDelete) setActiveMapId(nextMaps[0].id);
    trackEvent('map_delete', { map_id: idToDelete });
  }, [maps, activeMapId, showAlert, t, currentUser]);

  const validatePlacement = useCallback((typeId: string, x: number, y: number, rotation: number, ignoreInstanceId?: string): { valid: boolean; reason?: string } => {
    const template = catalogMap[typeId];
    if (!template) {
      return { valid: false, reason: t('templateNotFound', { typeId }) };
    }

    const templateDisplayName = getItemName(template.name, language);

    if (template.constraints.baseType && template.constraints.baseType !== 'both' && template.constraints.baseType !== activeBaseType) {
      return { valid: false, reason: t('invalidBaseType', { baseType: template.constraints.baseType, currentBaseType: activeBaseType }) };
    }
    if (activeBaseType === 'settlement' && template.constraints.settlementLayer && template.constraints.settlementLayer !== activeSettlementLayer) {
      const isRes = (activeSettlementLayer === 'objects' && (template.constraints.requiresPower || template.constraints.requiresWater)) ||
                    (activeSettlementLayer === 'energy' && template.constraints.requiresPower) ||
                    (activeSettlementLayer === 'water' && template.constraints.requiresWater);
      if (!isRes) {
        return { valid: false, reason: t('invalidSettlementLayer', { layer: template.constraints.settlementLayer, currentLayer: activeSettlementLayer }) };
      }
    }

    const allowed = template.constraints.autoTiling
      ? [0]
      : template.constraints.allowedRotations?.length
      ? template.constraints.allowedRotations
      : [0];
    if (!allowed.includes(rotation)) {
      return { valid: false, reason: t('rotationNotAllowed', { rotation, name: templateDisplayName, allowed: allowed.join(', ') }) };
    }

    const effSize = getEffectiveSize(template);
    const cells = getOccupiedCells(x, y, effSize.w, effSize.h, rotation);
    const placementType = template.constraints.placementType || (template.constraints.requiresFloor ? 'floor' : 'any');

    if (placementType === 'wall') {
      if (cells.some(c => c.x > GRID_W || c.y > GRID_H || c.x < -1 || c.y < -1)) {
        return { valid: false, reason: t('wallOutOfBounds', { name: templateDisplayName }) };
      }
    } else {
      if (cells.some(c => c.x >= GRID_W || c.y >= GRID_H || c.x < 0 || c.y < 0)) {
        return { valid: false, reason: t('objectOutOfBounds', { name: templateDisplayName }) };
      }
    }

    if (placementType !== 'wall') {
      const inNoBuild = cells.find(c => mapState.mapConfig.noBuildZones.some(nb => nb.x === c.x && nb.y === c.y && (activeBaseType === 'main' || nb.layer === activeSettlementLayer)));
      if (inNoBuild) {
        return { valid: false, reason: t('inNoBuildZone', { name: templateDisplayName, x: inNoBuild.x, y: inNoBuild.y }) };
      }
    }

    const otherObjects = mapState.layers.objects.filter(obj => {
      if (activeBaseType === 'main') return true;
      const objLayer = obj.layer || catalogMap[obj.typeId]?.constraints.settlementLayer || 'objects';
      return objLayer === activeSettlementLayer;
    });

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
            return { valid: false, reason: t('wallDecorLimitExceeded', { x: cell.x, y: cell.y }) };
          }

          if (wallDecors.length === 1) {
            const existingDecor = wallDecors[0];
            const isExistingH = existingDecor.rotation === 0 || existingDecor.rotation === 180;
            const isNewH = rotation === 0 || rotation === 180;
            if (isExistingH === isNewH) {
              return { valid: false, reason: t('wallDecorSameOrientation', { x: cell.x, y: cell.y }) };
            }
          }

          const blockingFloorObject = objectsHere.find(o => {
             const tObj = catalogMap[o.typeId];
             if (tObj?.constraints.placementType === 'wall') return false;
             if (tObj && !tObj.constraints.allowWallDecorAbove) return true;
             return false;
          });
          if (blockingFloorObject) {
            return { valid: false, reason: t('floorObjectBlocksDecor', { name: getItemName(catalogMap[blockingFloorObject.typeId]?.name, language), x: cell.x, y: cell.y }) };
          }
        } else {
          const blockingObject = objectsHere.find(o => {
             const tObj = catalogMap[o.typeId];
             if (tObj?.constraints.placementType === 'wall' && template.constraints.allowWallDecorAbove) return false;
             return true;
          });
          if (blockingObject) {
            return { valid: false, reason: t('cellOccupiedByObject', { name: getItemName(catalogMap[blockingObject.typeId]?.name, language), x: cell.x, y: cell.y }) };
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
        return { valid: false, reason: t('requiresFloorLevel', { name: templateDisplayName, level: requiredLvl, x: missingFloorCell.x, y: missingFloorCell.y }) };
      }
    } else if (placementType === 'any') {
      const requiredLvl = template.constraints.requiresSpecificFloorLevel;
      if (requiredLvl) {
        const invalidFloorCell = cells.find(cell => {
          const floor = mapState.layers.floors.find(f => f.x === cell.x && f.y === cell.y);
          return floor && floor.level < requiredLvl;
        });
        if (invalidFloorCell) {
          return { valid: false, reason: t('requiresFloorLevelOnFloor', { name: templateDisplayName, level: requiredLvl, x: invalidFloorCell.x, y: invalidFloorCell.y }) };
        }
      }
    } else if (placementType === 'ground') {
      const existingFloorCell = cells.find(cell =>
        mapState.layers.floors.some(f => f.x === cell.x && f.y === cell.y)
      );
      if (existingFloorCell) {
        return { valid: false, reason: t('requiresBareGround', { name: templateDisplayName, x: existingFloorCell.x, y: existingFloorCell.y }) };
      }
    } else if (placementType === 'wall') {
      const minWallLvl = template.constraints.requiresWallLevel || 1;
      const allowWindow = template.constraints.allowWindowWall ?? true;

      const missingWallCell = cells.find(cell => {
        const checkX = rotation === 90 || rotation === 270 ? cell.x + 1 : cell.x;
        return !hasValidWallForDecor(mapState.layers.walls, checkX, cell.y, minWallLvl, allowWindow, rotation);
      });
      if (missingWallCell) {
        return { valid: false, reason: t('missingWallForDecor', { name: templateDisplayName, level: minWallLvl, noWindow: !allowWindow ? t('noWindowSuffix') : '', x: missingWallCell.x, y: missingWallCell.y }) };
      }
    }

    if (activeBaseType === 'settlement') {
      const targetRoom = rooms.find(room => cells.some(c => room.has(`${c.x},${c.y}`)));

      if (template.constraints.isDesk) {
        if (!targetRoom) {
          return { valid: false, reason: t('mustBeInClosedRoom', { name: templateDisplayName }) };
        }
        const existingDesk = mapState.layers.objects.find(o => {
          if (o.instanceId === ignoreInstanceId) return false;
          const tObj = catalogMap[o.typeId];
          return tObj?.constraints.isDesk && targetRoom.has(`${o.x},${o.y}`);
        });
        if (existingDesk) {
          return { valid: false, reason: t('deskAlreadyInRoom') };
        }
      }

      if (template.constraints.requiredDesk) {
        if (!targetRoom) {
          const target_name = catalogMap[`new_base_${template.constraints.requiredDesk}`]?.name || template.constraints.requiredDesk;
          return { valid: false, reason: t('requiresDeskNotInRoom', { name: templateDisplayName, targetName: getItemName(target_name, language) }) };
        }
        const matchingDesk = mapState.layers.objects.find(o => {
          const tObj = catalogMap[o.typeId];
          return tObj?.constraints.isDesk === template.constraints.requiredDesk && targetRoom.has(`${o.x},${o.y}`);
        });
        if (!matchingDesk) {
          const target_name = catalogMap[`new_base_${template.constraints.requiredDesk}`]?.name || template.constraints.requiredDesk;
          return { valid: false, reason: t('requiresDeskInRoom', { name: templateDisplayName, targetName: getItemName(target_name, language) }) };
        }
      }
    }

    if (template.constraints.maxPerBase) {
      if (template.constraints.sharedLimitGroup) {
        const groupCount = mapState.layers.objects.filter(obj => {
          if (obj.instanceId === ignoreInstanceId) return false;
          const tObj = catalogMap[obj.typeId];
          return tObj && tObj.constraints.sharedLimitGroup === template.constraints.sharedLimitGroup;
        }).length;
        if (groupCount >= template.constraints.maxPerBase) {
          return { valid: false, reason: t('groupLimitExceeded', { limit: template.constraints.maxPerBase, group: template.constraints.sharedLimitGroup }) };
        }
      } else {
        const currentCount = mapState.layers.objects.filter(obj => obj.typeId === typeId && obj.instanceId !== ignoreInstanceId).length;
        if (currentCount >= template.constraints.maxPerBase) {
          return { valid: false, reason: t('objectLimitExceeded', { limit: template.constraints.maxPerBase, name: templateDisplayName }) };
        }
      }
    }

    return { valid: true };
  }, [catalogMap, language, activeBaseType, activeSettlementLayer, mapState.layers.objects, mapState.layers.floors, mapState.layers.walls, mapState.mapConfig.noBuildZones, t, GRID_W, GRID_H, rooms]);

  const handleCellClick = useCallback((x: number, y: number) => {
    const { activeTool, buildLevel, selectedTypeId, currentRotation, activeBaseType, activeSettlementLayer } = interactionRef.current;

    if (activeTool === 'hand') return;

    const isOutOfBounds = x < 0 || y < 0 || x >= GRID_W || y >= GRID_H;

    if (activeTool === 'floor') {
      if (isOutOfBounds) return;
      if (activeBaseType === 'settlement' && buildLevel > 3) {
        showAlert(t('settlementFloorMaxLvl'), t('limitation'), 'info');
        return;
      }

      const noBuildZones = mapState.mapConfig?.noBuildZones || [];
      const isNoBuild = noBuildZones.some(nb => {
        if (nb.x !== x || nb.y !== y) return false;
        if (activeBaseType === 'main') return true;
        return !nb.layer || nb.layer === activeSettlementLayer;
      });

      const floorAlreadyExists = mapState.layers.floors.some(f => f.x === x && f.y === y);
      const isRemoving = mapState.layers.floors.some(f => f.x === x && f.y === y && f.level === buildLevel);

      if (!isRemoving && isNoBuild) {
        showAlert(t('cannotBuildInNoBuildZone'), t('placementError'), 'error');
        return;
      }

      if (!floorAlreadyExists) {
        const objExists = mapState.layers.objects.some(obj => {
          if (activeBaseType === 'settlement') {
            const objLayer = obj.layer || catalogMap[obj.typeId]?.constraints.settlementLayer || 'objects';
            if (objLayer !== activeSettlementLayer) return false;
          }
          const tObj = catalogMap[obj.typeId];
          if (!tObj) return false;
          if (tObj.constraints.placementType === 'wall') return false;
          const cells = getOccupiedCells(obj.x, obj.y, tObj.size.w, tObj.size.h, obj.rotation);
          return cells.some(c => c.x === x && c.y === y);
        });
        if (objExists) {
           showAlert(t('cannotPlaceFloorUnderObject'), t('placementError'), 'error');
           return;
        }
      }

      if (isRemoving) {
        const objExists = mapState.layers.objects.some(obj => {
          if (activeBaseType === 'settlement') {
            const objLayer = obj.layer || catalogMap[obj.typeId]?.constraints.settlementLayer || 'objects';
            if (objLayer !== activeSettlementLayer) return false;
          }
          const tObj = catalogMap[obj.typeId];
          if (!tObj) return false;
          if (tObj.constraints.placementType === 'wall') return false;
          const cells = getOccupiedCells(obj.x, obj.y, tObj.size.w, tObj.size.h, obj.rotation);
          return cells.some(c => c.x === x && c.y === y);
        });
        if (objExists) {
          showAlert(t('cannotRemoveFloorUnderObject'), t('deletionError'), 'error');
          return;
        }
      } else if (floorAlreadyExists) {
        const invalidObj = mapState.layers.objects.find(obj => {
          if (activeBaseType === 'settlement') {
            const objLayer = obj.layer || catalogMap[obj.typeId]?.constraints.settlementLayer || 'objects';
            if (objLayer !== activeSettlementLayer) return false;
          }
          const tObj = catalogMap[obj.typeId];
          if (!tObj) return false;
          if (tObj.constraints.placementType !== 'floor') return false;
          const reqLvl = tObj.constraints.requiresSpecificFloorLevel || 1;
          if (buildLevel < reqLvl) {
            const cells = getOccupiedCells(obj.x, obj.y, tObj.size.w, tObj.size.h, obj.rotation);
            return cells.some(c => c.x === x && c.y === y);
          }
          return false;
        });
        if (invalidObj) {
          showAlert(t('cannotLowerFloorUnderObject'), t('levelError'), 'error');
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
        trackEvent('floor_place', { level: buildLevel, x, y });
      } else if (selectedInstanceId === `floor_${x}_${y}`) {
        setSelectedInstanceId(null);
        trackEvent('floor_remove', { x, y });
      }
    } else if (activeTool === 'nobuild') {
      if (isOutOfBounds) return;

      setMapState(prev => {
        const isMatch = (nb: NoBuildZone) => nb.x === x && nb.y === y && (activeBaseType === 'main' || nb.layer === activeSettlementLayer);
        const exists = prev.mapConfig.noBuildZones.some(isMatch);
        return {
          ...prev,
          mapConfig: {
            ...prev.mapConfig,
            noBuildZones: exists
              ? prev.mapConfig.noBuildZones.filter(nb => !isMatch(nb))
              : [...prev.mapConfig.noBuildZones, { x, y, layer: activeBaseType === 'settlement' ? activeSettlementLayer : undefined }]
          }
        };
      });
      trackEvent('nobuild_toggle', { x, y });
    } else if (activeTool === 'object') {
      const template = catalogMap[selectedTypeId];

      if (template?.constraints.placementType === 'wall') {
        return;
      }

      const rotationToUse = template?.constraints.autoTiling ? 0 : currentRotation;
      const placementResult = validatePlacement(selectedTypeId, x, y, rotationToUse);

      if (placementResult.valid) {
        const newObjId = generateUUID();
        const objTargetLayer = template?.constraints.settlementLayer || 'objects';
        setMapState(prev => ({
          ...prev,
          layers: {
            ...prev.layers,
            objects: [
              ...prev.layers.objects,
              { instanceId: newObjId, typeId: selectedTypeId, x, y, rotation: rotationToUse, layer: activeBaseType === 'settlement' ? objTargetLayer : undefined }
            ]
          }
        }));
        setSelectedInstanceId(newObjId);
        trackEvent('object_place', { type_id: selectedTypeId, base_type: activeBaseType, x, y });
      } else {
        showAlert(placementResult.reason || t('placementErrorMessage'), t('placementError'), 'error');
      }
    } else if (activeTool === 'eraser') {
      setMapState(prev => {
        const newObjects = [...prev.layers.objects];
        let removedInstanceId: string | null = null;

        for (let i = newObjects.length - 1; i >= 0; i--) {
          const obj = newObjects[i];
          if (activeBaseType === 'settlement') {
            const objLayer = obj.layer || catalogMap[obj.typeId]?.constraints.settlementLayer || 'objects';
            if (objLayer !== activeSettlementLayer) continue;
          }
          const tMap = catalogMap[obj.typeId];
          if (!tMap) continue;
          if (tMap.constraints.placementType === 'wall') continue;

          const effSize = getEffectiveSize(tMap);
          const cells = getOccupiedCells(obj.x, obj.y, effSize.w, effSize.h, obj.rotation);

          if (cells.some(c => c.x === x && c.y === y)) {
            if (obj.isDefault) {
              showAlert(t('defaultBuildingCannotDelete'), t('protectedObject'), 'info');
              return prev;
            }
            removedInstanceId = obj.instanceId;
            newObjects.splice(i, 1);
            break;
          }
        }

        if (removedInstanceId) {
          if (removedInstanceId === selectedInstanceId) setSelectedInstanceId(null);
          trackEvent('object_remove', { instance_id: removedInstanceId });
          return {
            ...prev,
            layers: { ...prev.layers, objects: newObjects }
          };
        } else {
          if (isOutOfBounds) return prev;
          if (activeBaseType === 'settlement' && activeSettlementLayer !== 'objects') return prev;

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [GRID_W, GRID_H, mapState.layers.floors, mapState.layers.objects, mapState.mapConfig.noBuildZones, catalogMap, selectedInstanceId, setMapState, validatePlacement, activeBaseType, activeSettlementLayer, showAlert, t]);

  const handleWallClick = useCallback((x: number, y: number, orientation: 'horizontal' | 'vertical', e: React.MouseEvent) => {
    e.stopPropagation();

    const { activeTool, selectedTypeId, buildLevel, isDoorPlacement, isWindowPlacement, activeBaseType, activeSettlementLayer } = interactionRef.current;

    if (activeTool === 'eraser') {
      const targetX = orientation === 'vertical' ? x - 1 : x;
      const targetY = y;
      const isH = orientation === 'horizontal';

      setMapState(prev => {
        const newObjects = [...prev.layers.objects];
        let removedInstanceId: string | null = null;

        for (let i = newObjects.length - 1; i >= 0; i--) {
          const obj = newObjects[i];
          if (activeBaseType === 'settlement') {
            const objLayer = obj.layer || catalogMap[obj.typeId]?.constraints.settlementLayer || 'objects';
            if (objLayer !== activeSettlementLayer) continue;
          }
          const tMap = catalogMap[obj.typeId];
          if (tMap?.constraints.placementType !== 'wall') continue;

          if (obj.x === targetX && obj.y === targetY) {
            const objIsH = obj.rotation === 0 || obj.rotation === 180;
            if (objIsH === isH) {
              if (obj.isDefault) {
                showAlert(t('defaultBuildingCannotDelete'), t('protectedObject'), 'info');
                return prev;
              }
              removedInstanceId = obj.instanceId;
              newObjects.splice(i, 1);
              break;
            }
          }
        }

        if (removedInstanceId) {
          if (removedInstanceId === selectedInstanceId) setSelectedInstanceId(null);
          trackEvent('wall_decor_remove', { instance_id: removedInstanceId });
          return { ...prev, layers: { ...prev.layers, objects: newObjects } };
        }

        if (activeBaseType === 'settlement' && activeSettlementLayer !== 'objects') return prev;

        const nextWalls = prev.layers.walls.filter(w => !(w.x === x && w.y === y && w.orientation === orientation));
        const nextObjects = prev.layers.objects.filter(obj => isWallDecorValid(obj, nextWalls, catalogMap));

        const wallId = `wall_${x}_${y}_${orientation}`;
        if (selectedInstanceId === wallId) setSelectedInstanceId(null);
        trackEvent('wall_remove', { x, y, orientation });

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
        showAlert(t('itemNotSupportedForAngle', { angle: autoRotation }), t('placementError'), 'error');
        return;
      }

      const wall = mapState.layers.walls.find(w => w.x === x && w.y === y && w.orientation === orientation);
      if (!wall) {
        showAlert(t('garlandOnlyOnWall'), t('placementError'), 'error');
        return;
      }

      const minWallLvl = template.constraints.requiresWallLevel || 1;
      if (wall.level < minWallLvl) {
        showAlert(t('wallLevelRequired', { level: minWallLvl }), t('insufficientLevel'), 'error');
        return;
      }

      if (wall.isWindow && template.constraints.allowWindowWall === false) {
        showAlert(t('noWindowWallDecor'), t('placementError'), 'error');
        return;
      }

      const placementResult = validatePlacement(selectedTypeId, targetX, targetY, autoRotation);
      if (placementResult.valid) {
        const newObjId = generateUUID();
        const objTargetLayer = template.constraints.settlementLayer || 'objects';
        setMapState(prev => ({
          ...prev,
          layers: {
            ...prev.layers,
            objects: [
              ...prev.layers.objects,
              { instanceId: newObjId, typeId: selectedTypeId, x: targetX, y: targetY, rotation: autoRotation, layer: activeBaseType === 'settlement' ? objTargetLayer : undefined }
            ]
          }
        }));
        setSelectedInstanceId(newObjId);
        trackEvent('wall_decor_place', { type_id: selectedTypeId, x: targetX, y: targetY });
      } else {
        showAlert(placementResult.reason || t('cannotPlaceGarland'), t('placementError'), 'error');
      }
      return;
    }

    if (activeTool !== 'wall') return;
    if (activeBaseType === 'settlement' && buildLevel > 2) {
      showAlert(t('settlementWallMaxLvl'), t('limitation'), 'info');
      return;
    }

    const hasFloor = hasFloorForWall(mapState.layers.floors, x, y, orientation, buildLevel);
    if (!hasFloor) {
      showAlert(t('wallRequiresFloor', { level: buildLevel }), t('buildError'), 'error');
      return;
    }

    const isRemoving = mapState.layers.walls.some(w => w.x === x && w.y === y && w.orientation === orientation && w.level === buildLevel && w.isDoor === isDoorPlacement && w.isWindow === isWindowPlacement);

    if (!isRemoving) {
      const relevantObjects = mapState.layers.objects.filter(obj => {
        if (activeBaseType === 'main') return true;
        const objLayer = obj.layer || catalogMap[obj.typeId]?.constraints.settlementLayer || 'objects';
        return objLayer === activeSettlementLayer;
      });
      if (isWallCrossingObjectFootprint(relevantObjects, catalogMap, x, y, orientation)) {
        showAlert(t('wallCrossesBuilding'), t('placementError'), 'error');
        return;
      }
    }

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
      trackEvent('wall_place', { level: buildLevel, orientation, is_door: isDoorPlacement, is_window: isWindowPlacement, x, y });
    } else if (selectedInstanceId === wallId) {
      setSelectedInstanceId(null);
      trackEvent('wall_remove', { x, y, orientation });
    }
  }, [catalogMap, selectedInstanceId, setMapState, mapState.layers.walls, mapState.layers.floors, mapState.layers.objects, validatePlacement, showAlert, t]);

  const handleSelectBuildingType = useCallback((typeId: string) => {
    setSelectedTypeId(typeId);
    setLayerSelections(prev => ({ ...prev, [currentLayerKey]: typeId }));
    const tObj = catalogMap[typeId];
    const allowed = tObj?.constraints.autoTiling ? [0] : (tObj?.constraints.allowedRotations?.length ? tObj.constraints.allowedRotations : [0]);
    setCurrentRotation(prevRot => (allowed.includes(prevRot) ? prevRot : allowed[0]));
    trackEvent('select_building_type', { type_id: typeId });
  }, [catalogMap, currentLayerKey]);

  const toggleNewBuildingRotation = useCallback((deg: number) => {
    setNewBuilding(prev => {
      const has = prev.allowedRotations.includes(deg);
      const next = has ? prev.allowedRotations.filter(d => d !== deg) : [...prev.allowedRotations, deg].sort((a, b) => a - b);
      return { ...prev, allowedRotations: next };
    });
  }, []);

  const loadForEditing = useCallback((targetTypeId: string) => {
    const item = catalogMap[targetTypeId];
    if (!item) return;

    const formattedName = typeof item.name === 'string'
      ? { ru: item.name, en: item.name }
      : { ru: item.name.ru || '', en: item.name.en || '' };

    setNewBuilding({
      typeId: item.typeId,
      name: formattedName,
      category: item.category,
      w: item.size.w,
      h: item.size.h,
      image: item.image,
      tooltipImage: item.tooltipImage || '',
      color: item.color || '#4b5563',
      allowedRotations: item.constraints.allowedRotations?.length ? [...item.constraints.allowedRotations] : [0],
      placementType: item.constraints.placementType || (item.constraints.requiresFloor ? 'floor' : 'any'),
      minFloorLvl: item.constraints.requiresSpecificFloorLevel || 1,
      minWallLvl: item.constraints.requiresWallLevel || 1,
      allowWindowWall: item.constraints.allowWindowWall ?? true,
      allowWallDecorAbove: item.constraints.allowWallDecorAbove || false,
      maxCount: item.constraints.maxPerBase || 99,
      sharedLimitGroup: item.constraints.sharedLimitGroup || '',
      autoTiling: item.constraints.autoTiling || false,
      connectsTo: item.constraints.connectsTo?.join(', ') || '',
      autoTileImages: {
        single: item.constraints.autoTileImages?.single || '',
        end: item.constraints.autoTileImages?.end || '',
        straight: item.constraints.autoTileImages?.straight || '',
        corner: item.constraints.autoTileImages?.corner || '',
        tee: item.constraints.autoTileImages?.tee || '',
        cross: item.constraints.autoTileImages?.cross || ''
      },
      colorVariants: item.colorVariants ? [...item.colorVariants] : [],
      baseType: item.constraints.baseType || 'both',
      settlementLayer: item.constraints.settlementLayer || 'objects',
      isDesk: item.constraints.isDesk || '',
      requiredDesk: item.constraints.requiredDesk || '',
      requiresPower: item.constraints.requiresPower || false,
      requiresWater: item.constraints.requiresWater || false
    });
    if (isMobileLeftOpen) {
      setIsMobileLeftOpen(false);
      setIsMobileRightOpen(true);
    }
    setIsCatalogBuilderVisible(true);
    trackEvent('catalog_item_edit', { type_id: targetTypeId });
  }, [catalogMap, isMobileLeftOpen]);

  const saveProduct = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!newBuilding.typeId || (!newBuilding.name.ru && !newBuilding.name.en)) return;

    const isSettlementOrBoth = newBuilding.baseType === 'settlement' || newBuilding.baseType === 'both';
    const isEnergyOrWater = isSettlementOrBoth && (newBuilding.settlementLayer === 'energy' || newBuilding.settlementLayer === 'water');

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
      name: {
        ru: newBuilding.name.ru || newBuilding.name.en,
        en: newBuilding.name.en || newBuilding.name.ru
      },
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
        placementType: isEnergyOrWater ? undefined : newBuilding.placementType,
        requiresFloor: !isEnergyOrWater && newBuilding.placementType === 'floor',
        requiresSpecificFloorLevel: (!isEnergyOrWater && (newBuilding.placementType === 'floor' || newBuilding.placementType === 'any')) ? Number(newBuilding.minFloorLvl) : undefined,
        requiresWallLevel: (!isEnergyOrWater && newBuilding.placementType === 'wall') ? Number(newBuilding.minWallLvl) : undefined,
        allowWindowWall: (!isEnergyOrWater && newBuilding.placementType === 'wall') ? newBuilding.allowWindowWall : undefined,
        allowWallDecorAbove: !isEnergyOrWater && newBuilding.allowWallDecorAbove,
        maxPerBase: Number(newBuilding.maxCount),
        sharedLimitGroup: newBuilding.sharedLimitGroup.trim() || undefined,
        baseType: newBuilding.baseType,
        settlementLayer: newBuilding.settlementLayer,
        isDesk: !isEnergyOrWater ? (newBuilding.isDesk.trim() || undefined) : undefined,
        requiredDesk: !isEnergyOrWater ? (newBuilding.requiredDesk.trim() || undefined) : undefined,
        requiresPower: isSettlementOrBoth ? newBuilding.requiresPower : undefined,
        requiresWater: isSettlementOrBoth ? newBuilding.requiresWater : undefined
      }
    };

    if (catalogMap[item.typeId]) {
      setCatalog(prev => prev.map(c => c.typeId === item.typeId ? item : c));
      showAlert(t('updatedSuccess', { name: getItemName(item.name, language) }), t('success'), 'success');
    } else {
      setCatalog(prev => [...prev, item]);
      showAlert(t('addedSuccess', { name: getItemName(item.name, language) }), t('success'), 'success');
    }

    setSelectedTypeId(item.typeId);
    setLayerSelections(prev => ({ ...prev, [currentLayerKey]: item.typeId }));
    setCurrentRotation(allowedRotations[0]);
    trackEvent('catalog_item_save', { type_id: item.typeId, category: item.category });
  }, [newBuilding, catalogMap, showAlert, t, language, currentLayerKey]);

  const handleDeleteCatalogItem = useCallback((typeId: string) => {
    const item = catalog.find(c => c.typeId === typeId);
    if (!item) return;

    const itemName = getItemName(item.name, language);

    if (!window.confirm(t('confirmDeleteCatalogItem', { name: itemName }))) {
      return;
    }
    if (!window.confirm(t('confirmDeleteCatalogItemFinal', { name: itemName }))) {
      return;
    }

    const nextCatalog = catalog.filter(c => c.typeId !== typeId);
    setCatalog(nextCatalog);

    if (selectedTypeId === typeId) {
      setSelectedTypeId(nextCatalog[0]?.typeId ?? '');
    }

    showAlert(t('itemDeletedFromCatalog', { name: itemName }), t('deleted'), 'info');
    trackEvent('catalog_item_delete', { type_id: typeId });
  }, [catalog, language, selectedTypeId, showAlert, t]);

  const handlePaintObject = useCallback((instanceId: string, color: string | undefined) => {
    setMapState(prev => ({
      ...prev,
      layers: {
        ...prev.layers,
        objects: prev.layers.objects.map(o => o.instanceId === instanceId ? { ...o, paintColor: color } : o)
      }
    }));
    trackEvent('object_paint', { instance_id: instanceId, color: color || 'default' });
  }, [setMapState]);

  const handleExportMap = useCallback(async () => {
    try {
      if (!validateMapData(fullMapState)) {
        showAlert(t('jsonStructureError'), t('importError'), 'error');
        return;
      }
      const jsonStrPayload = JSON.stringify(fullMapState);
      if (jsonStrPayload.length > 500000) {
        showAlert(t('exportError'), t('importError'), 'error');
        return;
      }
      // Only reuse the existing shareId/ownerId if this map is actually ours — a map
      // whose ownerId belongs to someone else must always get a fresh shareId, so we
      // never overwrite that other person's cloud copy.
      const isOwner = !fullMapState.ownerId || fullMapState.ownerId === currentUser?.uid;
      const shareId = isOwner ? (fullMapState.shareId || generateUUID()) : generateUUID();
      const ownerId = isOwner ? (fullMapState.ownerId || currentUser?.uid) : currentUser?.uid;
      const isNewShare = !isOwner || !fullMapState.shareId;

      await goOnline(db);
      const createdAt = await resolveShareCreatedAt(shareId, isNewShare, fullMapState.createdAt);
      const updatedAt = serverTimestamp();
      // Attached after sanitizeMapData, since createdAt/updatedAt here may be a
      // serverTimestamp() placeholder object rather than a plain number.
      const mapToSave: MapData = {
        ...sanitizeMapData({ ...fullMapState, shareId, ownerId }, t('mapPrefix')),
        createdAt: createdAt as unknown as number,
        updatedAt: updatedAt as unknown as number
      };

      const summaryData = {
        id: mapToSave.id,
        name: mapToSave.name,
        ownerId: mapToSave.ownerId,
        shareId: mapToSave.shareId,
        createdAt: mapToSave.createdAt,
        updatedAt: mapToSave.updatedAt
      };

      await set(ref(db, `shares/${shareId}`), mapToSave);
      await set(ref(db, `shares_summary/${shareId}`), summaryData);
      await goOffline(db);

      if (fullMapState.shareId !== shareId || fullMapState.ownerId !== ownerId) {
        setMaps(prev => prev.map(m => m.id === fullMapState.id ? { ...m, shareId, ownerId } : m));
      }

      const safeName = fullMapState.name.trim().replace(/\s+/g, '_') || 'map_config';
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(mapToSave, null, 2));
      const dlAnchor = document.createElement('a');
      dlAnchor.setAttribute("href", dataStr);
      dlAnchor.setAttribute("download", `ldoe_base_planner_map_${safeName}.json`);
      dlAnchor.click();

      showAlert(t('exportSuccess'), t('success'), 'success');
      trackEvent('map_export', { map_id: fullMapState.id, map_name: fullMapState.name });
    } catch (err) {
      await goOffline(db);
      console.error('Ошибка сохранения при экспорте:', err);
      const safeName = fullMapState.name.trim().replace(/\s+/g, '_') || 'map_config';
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(fullMapState, null, 2));
      const dlAnchor = document.createElement('a');
      dlAnchor.setAttribute("href", dataStr);
      dlAnchor.setAttribute("download", `ldoe_base_planner_map_${safeName}.json`);
      dlAnchor.click();

      showAlert(t('exportSuccessOffline'), t('attention'), 'info');
      trackEvent('map_export_offline', { map_id: fullMapState.id });
    }
  }, [fullMapState, showAlert, t, currentUser]);

  const handleShareMap = useCallback(async () => {
    try {
      if (!validateMapData(fullMapState)) {
        showAlert(t('linkCopiedError'), t('importError'), 'error');
        return;
      }
      const jsonStrPayload = JSON.stringify(fullMapState);
      if (jsonStrPayload.length > 500000) {
        showAlert(t('linkCopiedError'), t('importError'), 'error');
        return;
      }

      const isMainEmpty =
        (fullMapState.mainBase?.layers?.floors?.length ?? 0) === 0 &&
        (fullMapState.mainBase?.layers?.walls?.length ?? 0) === 0 &&
        (fullMapState.mainBase?.layers?.objects?.length ?? 0) === 0;

      const isSettlementEmpty =
        (fullMapState.settlementBase?.layers?.floors?.length ?? 0) === 0 &&
        (fullMapState.settlementBase?.layers?.walls?.length ?? 0) === 0 &&
        (fullMapState.settlementBase?.layers?.objects?.length ?? 0) === 0;

      if (isMainEmpty || isSettlementEmpty) {
        showAlert(t('emptyBase'), t('error'), 'error');
        return;
      }

      const uid = currentUser?.uid || auth.currentUser?.uid;
      if (!uid) {
        showAlert(t('authError'), t('error'), 'error');
        return;
      }

      const isOwner = !fullMapState.ownerId || fullMapState.ownerId === currentUser?.uid;
      const shareId = isOwner ? (fullMapState.shareId || generateUUID()) : generateUUID();
      const ownerId = isOwner ? (fullMapState.ownerId || currentUser?.uid) : currentUser?.uid;
      const isNewShare = !isOwner || !fullMapState.shareId;

      await goOnline(db);
      const createdAt = await resolveShareCreatedAt(shareId, isNewShare, fullMapState.createdAt);
      const updatedAt = serverTimestamp();
      const mapToSave: MapData = {
        ...sanitizeMapData({ ...fullMapState, shareId, ownerId }, t('mapPrefix')),
        createdAt: createdAt as unknown as number,
        updatedAt: updatedAt as unknown as number
      };

      const summaryData = {
        id: mapToSave.id,
        name: mapToSave.name,
        ownerId: mapToSave.ownerId || null,
        shareId: mapToSave.shareId,
        createdAt: mapToSave.createdAt,
        updatedAt: mapToSave.updatedAt
      };

      await set(ref(db, `shares/${shareId}`), mapToSave);
      await set(ref(db, `shares_summary/${shareId}`), summaryData);
      await goOffline(db);

      if (fullMapState.shareId !== shareId || fullMapState.ownerId !== ownerId) {
        setMaps(prev => prev.map(m => m.id === fullMapState.id ? { ...m, shareId, ownerId } : m));
      }

      const url = new URL(window.location.href);
      url.searchParams.set('share', shareId);
      url.searchParams.delete('map');

      await navigator.clipboard.writeText(url.toString());
      showAlert(t('linkCopied'), t('success'), 'success');
      trackEvent('map_share', { map_id: fullMapState.id, share_id: shareId });
    } catch (err) {
      await goOffline(db);
      console.error('Ошибка создания ссылки:', err);
      showAlert(t('linkCopiedError'), t('importError'), 'error');
    }
  }, [fullMapState, showAlert, t, currentUser]);

  const handleDeleteCloudMap = useCallback(async (shareId: string) => {
    if (!shareId) return;
    if (!window.confirm(t('confirmDeleteMap'))) return;
    try {
      await goOnline(db);
      await remove(ref(db, `shares/${shareId}`));
      await remove(ref(db, `shares_summary/${shareId}`));
      await goOffline(db);

      setSharedBasesList(prev => prev.filter(m => m.shareId !== shareId));
      showAlert(t('success'), t('success'), 'success');
      trackEvent('cloud_map_delete', { share_id: shareId });
    } catch (err) {
      await goOffline(db);
      console.error('Ошибка удаления базы из облака:', err);
      showAlert(t('removeError'), t('error'), 'error');
    }
  }, [showAlert, t]);

  const loadSharedBases = useCallback(async () => {
    setIsLoadingSharedBases(true);
    try {
      await goOnline(db);

      const summarySnapshot = await get(ref(db, 'shares_summary'));
      let list: Partial<MapData>[] = [];

      if (summarySnapshot.exists()) {
        const val = summarySnapshot.val();
        list = Object.entries(val).map(([key, data]: [string, any]) => ({
          id: data.id || `shared_${key}`,
          name: data.name || `${tRef.current('mapPrefix')} ${key}`,
          ownerId: data.ownerId,
          shareId: data.shareId || key,
          createdAt: typeof data.createdAt === 'number' ? data.createdAt : undefined,
          updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : undefined
        }));
      }
      await goOffline(db);

      list.reverse();
      setSharedBasesList(list);
    } catch (err) {
      await goOffline(db);
      console.error('Ошибка загрузки общедоступных баз:', err);
      showAlert(tRef.current('sharedBasesFetchError'), tRef.current('importError'), 'error');
    } finally {
      setIsLoadingSharedBases(false);
    }
  }, [showAlert]);

  const handleOpenSharedBasesPanel = useCallback(async () => {
    setIsSharedBasesModalOpen(true);
    setSharedBasesPage(1);
    setSharedBasesSearchQuery('');
    setSharedBasesFilterMode('all');
    trackEvent('open_shared_bases_panel');
    await loadSharedBases();
  }, [loadSharedBases]);

  const handleSharedBasesPageChange = useCallback((newPage: number) => {
    setSharedBasesPage(newPage);
  }, []);

  const handleSharedBasesSearchChange = useCallback((newQuery: string) => {
    setSharedBasesSearchQuery(newQuery);
    setSharedBasesPage(1);
  }, []);

  const handleSharedBasesFilterModeChange = useCallback((newMode: 'all' | 'my') => {
    setSharedBasesFilterMode(newMode);
    setSharedBasesPage(1);
  }, []);

  const handleSelectSharedMap = useCallback(async (mapSummary: Partial<MapData>) => {
    setIsLoadingSharedBases(true);
    try {
      let fullData: Partial<MapData> | null = mapSummary;
      if ((!mapSummary.mainBase || !mapSummary.settlementBase) && mapSummary.shareId) {
        await goOnline(db);
        const snapshot = await get(ref(db, `shares/${mapSummary.shareId}`));
        await goOffline(db);
        if (snapshot.exists()) {
          fullData = snapshot.val() as Partial<MapData>;
        }
      }

      if (!fullData || !validateMapData(fullData)) {
        showAlert(t('jsonStructureError'), t('importError'), 'error');
        return;
      }

      const sanitized = sanitizeMapData(fullData, t('mapPrefix'));
      const mapToLoad = resolveImportedMapOwnership(sanitized, currentUser?.uid, mapSummary.shareId);

      setMaps(prev => {
        const filtered = prev.filter(m => m.id !== mapToLoad.id);
        return [...filtered, mapToLoad];
      });
      setActiveMapId(mapToLoad.id);
      setIsSharedBasesModalOpen(false);
      showAlert(t('mapLoadedSuccess', { name: mapToLoad.name }), t('success'), 'success');
      trackEvent('map_load_shared', { share_id: mapToLoad.shareId });
    } catch (err) {
      await goOffline(db);
      console.error('Ошибка загрузки базы:', err);
      showAlert(t('failedLoadShared'), t('importError'), 'error');
    } finally {
      setIsLoadingSharedBases(false);
    }
  }, [showAlert, t, currentUser]);

  const filteredSharedBases = useMemo(() => {
    const q = sharedBasesSearchQuery.trim().toLowerCase();
    return sharedBasesList.filter((base) => {
      const matchesSearch = !q || (base.name || '').toLowerCase().includes(q);
      if (!matchesSearch) return false;
      if (sharedBasesFilterMode === 'my') {
        return Boolean(currentUser?.uid && base.ownerId === currentUser.uid);
      }
      return true;
    });
  }, [sharedBasesList, sharedBasesSearchQuery, sharedBasesFilterMode, currentUser]);

  const totalSharedBasesPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredSharedBases.length / SHARED_BASES_PER_PAGE));
  }, [filteredSharedBases.length]);

  const paginatedSharedBases = useMemo(() => {
    const safePage = Math.min(sharedBasesPage, totalSharedBasesPages);
    const startIndex = (safePage - 1) * SHARED_BASES_PER_PAGE;
    return filteredSharedBases.slice(startIndex, startIndex + SHARED_BASES_PER_PAGE);
  }, [filteredSharedBases, sharedBasesPage, totalSharedBasesPages]);

  const handleImportMap = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target?.result as string);
        if (parsed && validateMapData(parsed)) {
          const sanitized = sanitizeMapData(parsed, t('mapPrefix'));
          const owned = resolveImportedMapOwnership(sanitized, currentUser?.uid);
          const importedMap: MapData = {
            ...owned,
            name: parsed.name || file.name.replace(/\.json$/i, '') || t('importedMap')
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
          trackEvent('map_import', { map_name: importedMap.name });
        } else {
          showAlert(t('jsonStructureError'), t('importError'), 'error');
        }
      } catch { showAlert(t('jsonStructureError'), t('importError'), 'error'); }
    };
    reader.readAsText(file); e.target.value = '';
  }, [showAlert, t, currentUser]);

  const handleExportCatalog = useCallback(() => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(catalog, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute("href", dataStr); dlAnchor.setAttribute("download", "ldoe_catalog.json"); dlAnchor.click();
    trackEvent('catalog_export');
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
          trackEvent('catalog_import');
        }
      } catch { showAlert(t('catalogJsonStructureError'), t('importError'), 'error'); }
    };
    reader.readAsText(file); e.target.value = '';
  }, [showAlert, t]);

  const handleResetCatalog = useCallback(async () => {
    if (!window.confirm(t('resetCatalogConfirm'))) {
      return;
    }

    try {
      const response = await fetch(`${getBasePath()}/data/catalog.json`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const defaults = await response.json() as CatalogItem[];
      if (!Array.isArray(defaults)) throw new Error('Invalid catalog data');

      catalogDefaultsRef.current = defaults;
      catalogOverlayRef.current = {};
      writeCatalogOverlay({});

      setCatalog(defaults);
      setSelectedTypeId(defaults[0]?.typeId ?? '');
      setLayerSelections(prev => ({ ...prev, [currentLayerKey]: defaults[0]?.typeId ?? '' }));
      setCurrentRotation(defaults[0]?.constraints.allowedRotations[0] ?? 0);
      trackEvent('catalog_reset');
    } catch (error) {
      console.error('Не удалось сбросить каталог:', error);
      showAlert(t('resetCatalogFailed'), t('resetError'), 'error');
    }
  }, [currentLayerKey, showAlert, t]);

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

  const highlightedWalls = useMemo(() => {
    if (activeBaseType === 'settlement' && hoveredCell && activeTool === 'object') {
      const template = catalogMap[selectedTypeId];
      if (template && (template.constraints.isDesk || template.constraints.requiredDesk)) {
        const room = rooms.find(r => r.has(`${hoveredCell.x},${hoveredCell.y}`));
        if (room) {
          const wallSet = new Set<string>();
          room.forEach(cellKey => {
            const [cx, cy] = cellKey.split(',').map(Number);
            if (!room.has(`${cx},${cy - 1}`)) wallSet.add(`wh-${cx}-${cy}`);
            if (!room.has(`${cx},${cy + 1}`)) wallSet.add(`wh-${cx}-${cy + 1}`);
            if (!room.has(`${cx - 1},${cy}`)) wallSet.add(`wv-${cx}-${cy}`);
            if (!room.has(`${cx + 1},${cy}`)) wallSet.add(`wv-${cx + 1}-${cy}`);
          });
          return wallSet;
        }
      }
    }
    return new Set<string>();
  }, [activeBaseType, hoveredCell, activeTool, selectedTypeId, catalogMap, rooms]);

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
    const getRenderPriority = (item: { obj: ObjectLayer; template: CatalogItem }) => {
      const { template } = item;
      if (template.constraints.placementType === 'wall') return 3;
      if (template.constraints.requiresPower || template.constraints.requiresWater) return 2;
      if (template.constraints.placementType === 'floor' || template.constraints.placementType === 'any') return 1;
      return 0;
    };

    const objects = mapState?.layers?.objects || [];

    return objects
      .map(obj => ({ obj, template: catalogMap[obj.typeId] }))
      .filter((o): o is { obj: ObjectLayer; template: CatalogItem } => !!o.template)
      .sort((a, b) => {
        const priorityA = getRenderPriority(a);
        const priorityB = getRenderPriority(b);
        if (priorityA !== priorityB) return priorityA - priorityB;

        const depthA = a.obj.x + a.obj.y;
        const depthB = b.obj.x + b.obj.y;
        return depthA - depthB;
      });
  }, [mapState, catalogMap]);

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

  const cameraResetKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isLoaded) return;
    const key = `${activeMapId}::${activeBaseType}`;
    if (cameraResetKeyRef.current === null) {
      cameraResetKeyRef.current = key;
      return;
    }
    if (cameraResetKeyRef.current !== key) {
      cameraResetKeyRef.current = key;
      resetCamera();
    }
  }, [activeMapId, activeBaseType, isLoaded, resetCamera]);

  const handleCopyObject = useCallback((typeId: string, rotation: number) => {
    setActiveTool('object');
    setSelectedTypeId(typeId);
    setLayerSelections(prev => ({ ...prev, [currentLayerKey]: typeId }));
    setCurrentRotation(rotation);
    setSelectedInstanceId(null);
  }, [currentLayerKey]);

  const handleRotateSelectedObject = useCallback((obj: { instanceId: string; typeId: string; x: number; y: number; rotation: number }) => {
    const template = catalogMap[obj.typeId];
    if (!template) return;
    const allowed = template.constraints.autoTiling ? [0] : (template.constraints.allowedRotations?.length ? template.constraints.allowedRotations : ALL_ROTATIONS);
    const curIdx = allowed.indexOf(obj.rotation);
    const nextRot = allowed[(curIdx + 1) % allowed.length];

    const placementResult = validatePlacement(obj.typeId, obj.x, obj.y, nextRot, obj.instanceId);
    if (placementResult.valid) {
      setMapState(prev => ({
        ...prev,
        layers: {
          ...prev.layers,
          objects: prev.layers.objects.map(o => o.instanceId === obj.instanceId ? { ...o, rotation: nextRot } : o)
        }
      }));
    } else {
      showAlert(placementResult.reason || t('cannotRotateObject'), t('rotateError'), 'error');
    }
  }, [catalogMap, validatePlacement, setMapState, showAlert, t]);

  const handleDeleteSelectedObject = useCallback((instanceId: string) => {
    const targetObj = mapState.layers.objects.find(o => o.instanceId === instanceId);
    if (targetObj?.isDefault) {
      showAlert(t('defaultBuildingCannotDelete'), t('protectedObject'), 'info');
      return;
    }

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
  }, [mapState.layers.objects, setMapState, selectedElementData, showAlert, t]);

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
    const targetObj = mapState.layers.objects.find(o => o.instanceId === instanceId);
    if (targetObj?.isDefault) {
      showAlert(t('defaultBuildingCannotDelete'), t('protectedObject'), 'info');
      return;
    }

    setMapState(prev => ({
      ...prev,
      layers: {
        ...prev.layers,
        objects: prev.layers.objects.filter(o => o.instanceId !== instanceId)
      }
    }));
  }, [mapState.layers.objects, setMapState, showAlert, t]);

  if (!isLoaded || isLoadingShareParam) {
    return (
      <div className="w-screen h-screen bg-neutral-950 text-amber-500 flex items-center justify-center text-lg font-bold">
        {t('loadingPlanner')}
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

      <div className="md:hidden flex items-center justify-between gap-1.5 bg-neutral-900 border-b border-neutral-800 p-2 z-20 overflow-x-auto">
        <button
          onClick={() => setIsMobileLeftOpen(true)}
          className="bg-neutral-800 hover:bg-neutral-700 text-amber-500 font-bold px-2.5 py-1.5 rounded text-xs border border-neutral-700 flex items-center gap-1 shrink-0 min-h-[36px]"
        >
          <span>☰</span> {t('tools')}
        </button>
        <button
          onClick={handleOpenSharedBasesPanel}
          className="bg-amber-600 hover:bg-amber-500 text-white font-bold px-2.5 py-1.5 rounded text-xs border border-amber-500 flex items-center gap-1 shrink-0 min-h-[36px]"
        >
          <span>🌐</span> <span className="truncate max-w-[110px] xs:max-w-none">{t('publicBasesTitle')}</span>
        </button>
        <span className="font-black text-amber-500 text-[10px] sm:text-xs tracking-wider truncate hidden xs:inline shrink">LDOE BASE PLANNER</span>
        <button
          onClick={() => setIsMobileRightOpen(true)}
          className="bg-neutral-800 hover:bg-neutral-700 text-amber-500 font-bold px-2.5 py-1.5 rounded text-xs border border-neutral-700 flex items-center gap-1 shrink-0 min-h-[36px]"
        >
          <span>⚙️</span> {t('catalog')}
        </button>
      </div>

      <div className={`fixed md:relative inset-y-0 left-0 z-40 w-80 max-w-[85vw] transform ${isMobileLeftOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 transition-transform duration-200 ease-in-out`}>
        <LeftSidebar
          gridW={GRID_W}
          gridH={GRID_H}
          maps={maps}
          fullMapState={fullMapState}
          activeMapId={activeMapId}
          availableMaps={availableMaps}
          catalog={filteredCatalogForCurrentLayer}
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
          activeBaseType={activeBaseType}
          activeSettlementLayer={activeSettlementLayer}
          onCreateMap={handleCreateMap}
          onDeleteMap={handleDeleteMap}
          onRenameMap={handleRenameMap}
          onSetActiveMapId={setActiveMapId}
          onExportMap={handleExportMap}
          onImportMap={handleImportMap}
          onShareMap={handleShareMap}
          onExportCatalog={handleExportCatalog}
          onImportCatalog={handleImportCatalog}
          onResetCatalog={handleResetCatalog}
          onSetViewMode={handleViewModeChange}
          onResetCamera={resetCamera}
          onSetActiveTool={handleToolChange}
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
          onSetActiveBaseType={handleBaseTypeChange}
          onSetActiveSettlementLayer={handleSettlementLayerChange}
          objectListRef={objectListRef}
          onCloseMobile={() => setIsMobileLeftOpen(false)}
          onGoogleSignIn={currentUser && !currentUser.isAnonymous ? undefined : handleGoogleSignIn}
          onSignOut={currentUser && !currentUser.isAnonymous ? handleSignOut : undefined}
        />
      </div>

      {isMobileLeftOpen && (
        <div
          onClick={() => setIsMobileLeftOpen(false)}
          className="fixed inset-0 bg-black/60 z-30 md:hidden backdrop-blur-sm"
        />
      )}

      <div className="relative flex-1 h-full overflow-hidden flex items-center justify-center z-0">
        <div className="absolute top-3 left-3 z-20 hidden md:block">
          <button
            onClick={handleOpenSharedBasesPanel}
            className="bg-neutral-800/90 hover:bg-neutral-700 text-amber-500 hover:text-amber-400 font-bold px-3.5 py-2 rounded-lg text-xs border border-neutral-700/80 shadow-lg backdrop-blur flex items-center gap-2 transition-all cursor-pointer"
          >
            <span className="text-sm">🌐</span>
            <span>{t('publicBasesTitle')}</span>
          </button>
        </div>

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
          highlightedWalls={highlightedWalls}
          setHoveredCell={handleSetHoveredCell}
          wallLines={wallLines}
          sortedRootObjects={sortedRootObjects}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={stopPanning}
          onMouseLeave={() => { stopPanning(); handleSetHoveredCell(null); }}
          onCellClick={handleCellClick}
          onWallClick={handleWallClick}
          onSelectInstance={setSelectedInstanceId}
          onZoomChange={setZoom}
          onPanChange={setPan}
          activeBaseType={activeBaseType}
          activeSettlementLayer={activeSettlementLayer}
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

      <div className={`fixed md:relative inset-y-0 right-0 z-40 transition-all duration-300 ease-in-out overflow-hidden ${
        isMobileRightOpen
          ? 'w-80 max-w-[85vw] opacity-100'
          : 'w-0 max-w-0 opacity-0 pointer-events-none'
      } ${
        isCatalogBuilderVisible
          ? 'md:w-80 md:max-w-none md:opacity-100 md:pointer-events-auto'
          : 'md:w-12 md:max-w-none md:opacity-100 md:pointer-events-auto'
      }`}>
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

      <SharedBasesModal
        isOpen={isSharedBasesModalOpen}
        isLoading={isLoadingSharedBases}
        currentUserId={currentUser?.uid}
        currentPage={sharedBasesPage}
        totalPages={totalSharedBasesPages}
        onPageChange={handleSharedBasesPageChange}
        bases={paginatedSharedBases as MapData[]}
        searchQuery={sharedBasesSearchQuery}
        onSearchQueryChange={handleSharedBasesSearchChange}
        filterMode={sharedBasesFilterMode}
        onFilterModeChange={handleSharedBasesFilterModeChange}
        onClose={() => setIsSharedBasesModalOpen(false)}
        onSelectBase={handleSelectSharedMap}
        onDeleteBase={handleDeleteCloudMap}
      />

      <ModalInfo
        modalInfo={modalInfo}
        onClose={() => setModalInfo(null)}
      />

      <CookieConsentBanner />
    </div>
  );
}