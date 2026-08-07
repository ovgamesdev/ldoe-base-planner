/* eslint-disable @typescript-eslint/no-explicit-any */
import { child, get, ref, serverTimestamp } from 'firebase/database'
import { translations } from '../context/LanguageContext'
import { DEFAULT_MAP } from './constants'
import { db } from './firebase'
import type { BaseData, MapData } from './initial-data'
import { generateUUID } from './utils'

export const isDefaultMapName = (name: string): boolean => {
  if (!name) return true;
  const trimmed = name.trim();

  const exactDefaults = [
    translations.ru.mapPrefix,
    translations.en.mapPrefix,
    translations.ru.defaultMap,
    translations.en.defaultMap,
    translations.ru.loadedMap,
    translations.en.loadedMap,
    translations.ru.sharedMap,
    translations.en.sharedMap,
    translations.ru.importedMap,
    translations.en.importedMap,
  ];

  if (exactDefaults.includes(trimmed)) {
    return true;
  }

  const defaultPattern = /^(Карта|Map)(\s+\d+)?$/i;
  return defaultPattern.test(trimmed);
};

export const validateMapData = (mapData: any): mapData is MapData => {
  if (!mapData || typeof mapData !== 'object') return false;

  const validateBase = (base: any) => {
    if (!base || typeof base !== 'object') return false;
    if (!base.layers || typeof base.layers !== 'object') return false;
    if (
      (base.layers.floors !== undefined && !Array.isArray(base.layers.floors)) ||
      (base.layers.walls !== undefined && !Array.isArray(base.layers.walls)) ||
      (base.layers.objects !== undefined && !Array.isArray(base.layers.objects))
    ){
      return false;
    }
    if (!base.mapConfig || typeof base.mapConfig !== 'object') return false;
    return true;
  };

  return validateBase(mapData.mainBase) && validateBase(mapData.settlementBase);
};

export const sanitizeMapData = (mapData: any, defaultName: string): MapData => {
  const sanitizeBase = (base: any, defaultBase: BaseData): BaseData => {
    if (!base || typeof base !== 'object') return defaultBase;
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
  };

  const res: MapData = {
    id: mapData?.id || generateUUID(),
    name: mapData?.name || defaultName,
    mainBase: sanitizeBase(mapData?.mainBase, DEFAULT_MAP.mainBase),
    settlementBase: sanitizeBase(mapData?.settlementBase, DEFAULT_MAP.settlementBase)
  };

  if (mapData?.shareId) res.shareId = mapData.shareId;
  if (mapData?.ownerId) res.ownerId = mapData.ownerId;
  if (typeof mapData?.createdAt === 'number') res.createdAt = mapData.createdAt;
  if (typeof mapData?.updatedAt === 'number') res.updatedAt = mapData.updatedAt;

  return res;
};

export const buildBlankMap = (name: string): MapData => {
  const id = generateUUID();
  return {
    id,
    shareId: id,
    name,
    mainBase: {
      ...DEFAULT_MAP.mainBase,
      layers: {
        ...DEFAULT_MAP.mainBase.layers,
        floors: [...DEFAULT_MAP.mainBase.layers.floors],
        walls: [...DEFAULT_MAP.mainBase.layers.walls],
        objects: DEFAULT_MAP.mainBase.layers.objects.map((obj) => ({
          ...obj,
          instanceId: generateUUID(),
        })),
      },
    },
    settlementBase: {
      ...DEFAULT_MAP.settlementBase,
      layers: {
        ...DEFAULT_MAP.settlementBase.layers,
        floors: [...DEFAULT_MAP.settlementBase.layers.floors],
        walls: [...DEFAULT_MAP.settlementBase.layers.walls],
        objects: DEFAULT_MAP.settlementBase.layers.objects.map((obj) => ({
          ...obj,
          instanceId: generateUUID(),
        })),
      },
    },
  };
};

/**
 * Resolves the createdAt value for a shares/{shareId} write.
 *
 * createdAt must be set exactly once, at creation, and never change again — the
 * database rules enforce this server-side. So:
 * - a brand-new share gets a fresh server timestamp (timezone-agnostic UTC ms;
 *   each viewer's UI formats it in their own local timezone).
 * - an edit of a base we already know the createdAt for (kept in local state)
 *   simply reuses that exact value.
 * - an edit of an older local map that predates this field (so we don't know its
 *   createdAt) looks it up on the server, so re-saving/re-sharing it doesn't reset
 *   its history. If the server doesn't have one either, it's treated as new.
 */
export const resolveShareCreatedAt = async (
  shareId: string,
  isNewShare: boolean,
  knownCreatedAt?: number
): Promise<number | object> => {
  if (isNewShare) return serverTimestamp();
  if (typeof knownCreatedAt === 'number') return knownCreatedAt;

  try {
    const snap = await get(child(ref(db), `shares/${shareId}/createdAt`));
    if (snap.exists() && typeof snap.val() === 'number') return snap.val();
  } catch {
    // Fall through — treat it as a new creation if the lookup fails.
  }
  return serverTimestamp();
};

/**
 * Decides the id/shareId/ownerId a map should get whenever it's loaded from an
 * outside source (a "?share=" link, the community gallery, or an imported .json file).
 *
 * - If the current user is the owner (ownerId matches), the original id/shareId are
 *   kept, so a later export overwrites the very same cloud record instead of creating
 *   a duplicate.
 * - Otherwise the map is treated as "not mine": its local `id` becomes the shareId it
 *   was loaded from (so it's always obvious where the copy came from), and it gets a
 *   brand-new `shareId` (and ownerId is cleared) so exporting/sharing this local copy
 *   can never overwrite the original owner's base in the database.
 */
export const resolveImportedMapOwnership = (
  sanitized: MapData,
  currentUserId: string | undefined,
  fallbackSourceShareId?: string
): MapData => {
  const sourceShareId = sanitized.shareId || fallbackSourceShareId;
  const isOwner = Boolean(sanitized.ownerId) && sanitized.ownerId === currentUserId;

  if (isOwner) {
    return { ...sanitized, shareId: sourceShareId };
  }

  if (!sourceShareId) {
    // Never exported/shared before — nothing to reassign, just make sure it doesn't
    // carry someone else's ownerId.
    return { ...sanitized, shareId: undefined, ownerId: undefined, createdAt: undefined, updatedAt: undefined };
  }

  return {
    ...sanitized,
    id: sourceShareId,
    shareId: generateUUID(),
    ownerId: undefined,
    // This local copy hasn't been shared under the current user's ownership yet,
    // so it gets its own creation/edit history starting from the next save.
    createdAt: undefined,
    updatedAt: undefined
  };
};
// export const decompressMapFromUrl = async (base64urlStr: string, defaultLoadedName: string): Promise<Partial<MapData>> => {
//   let jsonStr = '';
//   try {
//     let base64 = base64urlStr.replace(/-/g, '+').replace(/_/g, '/');
//     while (base64.length % 4) base64 += '=';
//     const binary = atob(base64);
//     const bytes = new Uint8Array(binary.length);
//     for (let i = 0; i < binary.length; i++) {
//       bytes[i] = binary.charCodeAt(i);
//     }
//     const ds = new DecompressionStream('deflate-raw');
//     const blob = new Blob([bytes]);
//     const decompressedStream = blob.stream().pipeThrough(ds);
//     const decompressedBuffer = await new Response(decompressedStream).arrayBuffer();
//     jsonStr = new TextDecoder().decode(decompressedBuffer);
//   } catch {
//     try {
//       jsonStr = decodeURIComponent(atob(base64urlStr));
//     } catch {
//       jsonStr = base64urlStr;
//     }
//   }

//   const m = JSON.parse(jsonStr);

//   if (m.mainBase) {
//     return m;
//   }

//   return {
//     id: generateUUID(),
//     name: m.n || defaultLoadedName,
//     mainBase: {
//       mapConfig: {
//         width: DEFAULT_MAP.mainBase.mapConfig.width,
//         height: DEFAULT_MAP.mainBase.mapConfig.height,
//         noBuildZones: (m.mb?.c || []).map((nb: any) => ({ x: nb[0], y: nb[1] }))
//       },
//       layers: {
//         floors: (m.mb?.l?.f || []).map((f: any) => ({ x: f[0], y: f[1], level: f[2] })),
//         walls: (m.mb?.l?.w || []).map((w: any) => ({ x: w[0], y: w[1], orientation: w[2] === 0 ? 'horizontal' : 'vertical', level: w[3], isDoor: !!w[4], isWindow: !!w[5] })),
//         objects: (m.mb?.l?.o || []).map((o: any) => ({ instanceId: generateUUID(), typeId: o[0], x: o[1], y: o[2], rotation: o[3], paintColor: o[4] || undefined }))
//       }
//     },
//     settlementBase: {
//       mapConfig: {
//         width: DEFAULT_MAP.settlementBase.mapConfig.width,
//         height: DEFAULT_MAP.settlementBase.mapConfig.height,
//         noBuildZones: (m.sb?.c || []).map((nb: any) => ({ x: nb[0], y: nb[1], layer: nb[2] || 'objects' }))
//       },
//       layers: {
//         floors: (m.sb?.l?.f || []).map((f: any) => ({ x: f[0], y: f[1], level: f[2] })),
//         walls: (m.sb?.l?.w || []).map((w: any) => ({ x: w[0], y: w[1], orientation: w[2] === 0 ? 'horizontal' : 'vertical', level: w[3], isDoor: !!w[4], isWindow: !!w[5] })),
//         objects: (m.sb?.l?.o || []).map((o: any) => ({ instanceId: generateUUID(), typeId: o[0], x: o[1], y: o[2], rotation: o[3], layer: o[4] || 'objects', paintColor: o[5] || undefined }))
//       }
//     }
//   };
// };