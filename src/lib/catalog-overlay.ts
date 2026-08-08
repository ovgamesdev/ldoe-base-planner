/* eslint-disable @typescript-eslint/no-explicit-any */
import type { CatalogItem, CatalogOverlay, CatalogOverlayEntry } from './initial-data'
import { stableStringify } from './utils'

// ---------------------------------------------------------------------------
// Catalog persistence: localStorage only ever holds a *diff* against
// /data/catalog.json ("the overlay"), never a full copy of the catalog.
//
// This means:
// - New/changed items published in catalog.json show up for everyone on next
//   load automatically, since the full catalog is always rebuilt from the
//   live catalog.json plus whatever local overlay remains on top of it.
// - If catalog.json is later edited to match what a user already had
//   locally, that now-redundant overlay entry is dropped automatically.
// ---------------------------------------------------------------------------

export const CATALOG_OVERLAY_STORAGE_KEY = 'ldoe_catalog_overlay';
export const LEGACY_CATALOG_STORAGE_KEY = 'ldoe_catalog';

export const CATALOG_ITEM_FIELDS: (keyof CatalogItem)[] = [
  'category', 'name', 'size', 'image', 'tooltipImage', 'color', 'colorVariants', 'constraints'
];

export const catalogValuesEqual = (a: unknown, b: unknown): boolean =>
  a === b || stableStringify(a) === stableStringify(b);

export const stripOverlayMeta = (entry: CatalogOverlayEntry): Partial<CatalogItem> => {
  const { typeId, _updatedAt, _deleted, ...fields } = entry;
  return fields;
};

/** Only the fields of `item` that differ from `base` (or the whole item if there's no base). */
export const diffCatalogItem = (item: CatalogItem, base: CatalogItem | undefined): Partial<CatalogItem> => {
  if (!base) return { ...item };
  const diff: Partial<CatalogItem> = {};
  CATALOG_ITEM_FIELDS.forEach((key) => {
    if (!catalogValuesEqual(item[key], base[key])) {
      (diff as any)[key] = item[key];
    }
  });
  return diff;
};

/**
 * Rebuilds the overlay from the current (in-memory, fully-merged) catalog against
 * the live defaults, reusing `_updatedAt` from `previousOverlay` wherever the diff
 * for that item hasn't actually changed, so timestamps only move when content does.
 */
export const buildCatalogOverlay = (
  currentCatalog: CatalogItem[],
  defaults: CatalogItem[],
  previousOverlay: CatalogOverlay
): CatalogOverlay => {
  const defaultsMap = new Map(defaults.map(d => [d.typeId, d]));
  const currentMap = new Map(currentCatalog.map(c => [c.typeId, c]));
  const overlay: CatalogOverlay = {};
  const now = Date.now();

  currentMap.forEach((item, typeId) => {
    const diff = diffCatalogItem(item, defaultsMap.get(typeId));
    if (Object.keys(diff).length === 0) return;

    const prev = previousOverlay[typeId];
    const unchanged = prev && !prev._deleted && catalogValuesEqual(stripOverlayMeta(prev), diff);
    overlay[typeId] = { ...diff, typeId, _updatedAt: unchanged ? prev!._updatedAt : now };
  });

  defaultsMap.forEach((_, typeId) => {
    if (currentMap.has(typeId)) return;
    const prev = previousOverlay[typeId];
    overlay[typeId] = { typeId, _deleted: true, _updatedAt: prev?._deleted ? prev._updatedAt : now };
  });

  return overlay;
};

/** Applies a stored overlay on top of the live catalog.json defaults. */
export const applyCatalogOverlay = (defaults: CatalogItem[], overlay: CatalogOverlay): CatalogItem[] => {
  const result: CatalogItem[] = [];
  const seen = new Set<string>();

  defaults.forEach((base) => {
    seen.add(base.typeId);
    const entry = overlay[base.typeId];
    if (entry?._deleted) return;
    result.push(entry ? { ...base, ...stripOverlayMeta(entry) } as CatalogItem : base);
  });

  Object.values(overlay).forEach((entry) => {
    if (seen.has(entry.typeId) || entry._deleted) return;
    result.push({ typeId: entry.typeId, ...stripOverlayMeta(entry) } as CatalogItem);
  });

  return result;
};

/**
 * Drops overlay entries that no longer add anything on top of the (possibly
 * freshly-republished) catalog.json defaults:
 * - an edit whose fields now match the current default exactly
 * - a deletion marker for an item catalog.json no longer has anyway
 * Locally-added items with no counterpart in catalog.json are always kept.
 */
export const cleanupCatalogOverlay = (overlay: CatalogOverlay, defaults: CatalogItem[]): CatalogOverlay => {
  const defaultsMap = new Map(defaults.map(d => [d.typeId, d]));
  const cleaned: CatalogOverlay = {};

  Object.values(overlay).forEach((entry) => {
    const base = defaultsMap.get(entry.typeId);

    if (entry._deleted) {
      if (base) cleaned[entry.typeId] = entry;
      return;
    }

    if (!base) {
      cleaned[entry.typeId] = entry;
      return;
    }

    const fields = stripOverlayMeta(entry);
    const stillDiffers = (Object.keys(fields) as (keyof CatalogItem)[])
      .some((key) => !catalogValuesEqual(fields[key], base[key]));
    if (stillDiffers) cleaned[entry.typeId] = entry;
  });

  return cleaned;
};

export const readCatalogOverlay = (): CatalogOverlay => {
  try {
    const raw = localStorage.getItem(CATALOG_OVERLAY_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};

    // Defensive cleanup for data written by a since-fixed bug where locally-added
    // items lost their typeId (both as the object key and inside the entry) on
    // the way through applyCatalogOverlay. Such entries are unrecoverable (the
    // typeId is gone for good) — drop them rather than let them keep producing
    // catalog items with typeId undefined.
    const cleaned: CatalogOverlay = {};
    Object.entries(parsed as Record<string, CatalogOverlayEntry>).forEach(([key, entry]) => {
      if (key === 'undefined' || !entry || !entry.typeId) return;
      cleaned[key] = entry;
    });
    return cleaned;
  } catch {
    return {};
  }
};

export const writeCatalogOverlay = (overlay: CatalogOverlay): void => {
  if (Object.keys(overlay).length > 0) {
    localStorage.setItem(CATALOG_OVERLAY_STORAGE_KEY, JSON.stringify(overlay));
  } else {
    localStorage.removeItem(CATALOG_OVERLAY_STORAGE_KEY);
  }
};