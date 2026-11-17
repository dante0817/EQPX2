import { DEFAULT_PH_CENTER, EQPEvent, isEventUnlocated } from '../../data/eqpData';

export type BasemapProviderId =
  | 'openfreemap-liberty'
  | 'openfreemap-bright'
  | 'openfreemap-positron'
  | 'google-maps'
  | 'vector-schematic'
  | 'offline-philippines';

export type BasemapEngineKind = 'maplibre' | 'google' | 'vector' | 'pmtiles-offline';

export interface BasemapProviderMeta {
  id: BasemapProviderId;
  label: string;
  shortLabel: string;
  description: string;
  engine: BasemapEngineKind;
  category: 'open-source' | 'commercial' | 'offline';
  styleUrl?: string;
  supportsStyleSubmenu: boolean;
  requiresInternet: boolean;
  available: boolean;
  unavailableReason?: string;
}

/**
 * Offline Philippine PMTiles readiness configuration.
 * Keep disabled until a real local `.pmtiles` archive is placed under
 * `public/data/basemaps/philippines.pmtiles` and verified offline.
 */
export const OFFLINE_PMTILES_CONFIG = {
  archiveRelativePath: 'data/basemaps/philippines.pmtiles',
  publicUrl: '/data/basemaps/philippines.pmtiles',
  protocolScheme: 'pmtiles',
  installed: false,
  notes:
    'Future capability: register MapLibre PMTiles protocol (`pmtiles` npm package) pointing to `pmtiles:///data/basemaps/philippines.pmtiles` served with HTTP Range request support.',
} as const;

export const OPENFREEMAP_STYLES = {
  liberty: 'https://tiles.openfreemap.org/styles/liberty',
  bright: 'https://tiles.openfreemap.org/styles/bright',
  positron: 'https://tiles.openfreemap.org/styles/positron',
} as const;

export const BASEMAP_PROVIDERS: BasemapProviderMeta[] = [
  {
    id: 'openfreemap-liberty',
    label: 'OpenFreeMap Liberty',
    shortLabel: 'Liberty',
    description: 'Free, colorful OpenStreetMap vector basemap (keyless)',
    engine: 'maplibre',
    category: 'open-source',
    styleUrl: OPENFREEMAP_STYLES.liberty,
    supportsStyleSubmenu: false,
    requiresInternet: true,
    available: true,
  },
  {
    id: 'openfreemap-bright',
    label: 'OpenFreeMap Bright',
    shortLabel: 'Bright',
    description: 'Free, high-contrast light vector map for seismic analysis',
    engine: 'maplibre',
    category: 'open-source',
    styleUrl: OPENFREEMAP_STYLES.bright,
    supportsStyleSubmenu: false,
    requiresInternet: true,
    available: true,
  },
  {
    id: 'openfreemap-positron',
    label: 'OpenFreeMap Positron',
    shortLabel: 'Positron',
    description: 'Free, minimal muted basemap ideal for ShakeMap & fault overlays',
    engine: 'maplibre',
    category: 'open-source',
    styleUrl: OPENFREEMAP_STYLES.positron,
    supportsStyleSubmenu: false,
    requiresInternet: true,
    available: true,
  },
  {
    id: 'google-maps',
    label: 'Google Maps',
    shortLabel: 'Google Maps',
    description: 'Terrain, satellite & hybrid imagery via Google Maps Platform',
    engine: 'google',
    category: 'commercial',
    supportsStyleSubmenu: true,
    requiresInternet: true,
    available: true,
  },
  {
    id: 'vector-schematic',
    label: 'Vector Schematic (Built-in)',
    shortLabel: 'Vector',
    description: 'Zero-network Philippine archipelago & tectonic schematic',
    engine: 'vector',
    category: 'offline',
    supportsStyleSubmenu: true,
    requiresInternet: false,
    available: true,
  },
  {
    id: 'offline-philippines',
    label: 'Offline Philippines (PMTiles)',
    shortLabel: 'Offline PH',
    description: 'Local MapLibre PMTiles basemap archive (not installed)',
    engine: 'pmtiles-offline',
    category: 'offline',
    supportsStyleSubmenu: false,
    requiresInternet: false,
    available: OFFLINE_PMTILES_CONFIG.installed,
    unavailableReason:
      'Local philippines.pmtiles archive is not installed in public/data/basemaps/.',
  },
];

export const BASEMAP_STORAGE_KEY = 'eqp_selected_basemap_v1';

export function getBasemapMeta(id: BasemapProviderId): BasemapProviderMeta {
  return (
    BASEMAP_PROVIDERS.find((b) => b.id === id) ?? BASEMAP_PROVIDERS[0]
  );
}

export function isValidBasemapId(value: unknown): value is BasemapProviderId {
  return (
    typeof value === 'string' &&
    BASEMAP_PROVIDERS.some((b) => b.id === value)
  );
}

export function loadSavedBasemapId(storage?: Storage): BasemapProviderId | null {
  try {
    const target =
      storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!target) return null;
    const raw = target.getItem(BASEMAP_STORAGE_KEY);
    if (!isValidBasemapId(raw)) return null;
    const meta = getBasemapMeta(raw);
    if (!meta.available) return null;
    return raw;
  } catch {
    return null;
  }
}

export function saveSelectedBasemapId(
  id: BasemapProviderId,
  storage?: Storage
): void {
  try {
    const target =
      storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!target) return;
    target.setItem(BASEMAP_STORAGE_KEY, id);
  } catch {
    // Ignore storage write errors (e.g., private browsing quota)
  }
}

export function resolveInitialBasemapId(options: {
  hasGoogleKey: boolean;
  savedBasemapId?: BasemapProviderId | null;
}): BasemapProviderId {
  const { hasGoogleKey, savedBasemapId } = options;
  if (savedBasemapId && isValidBasemapId(savedBasemapId)) {
    const meta = getBasemapMeta(savedBasemapId);
    if (meta.available) {
      if (savedBasemapId === 'google-maps' && !hasGoogleKey) {
        return 'openfreemap-liberty';
      }
      return savedBasemapId;
    }
  }
  return hasGoogleKey ? 'google-maps' : 'openfreemap-liberty';
}

/**
 * Normalized 2D map viewport using 256px Web Mercator zoom convention
 * (same numeric zoom as Google Maps; MapLibre uses zoom - 1 due to 512px tiles).
 */
export interface MapViewportState {
  lat: number;
  lon: number;
  zoom: number;
}

export function createDefaultViewportForEvent(
  event: EQPEvent,
  compact = false
): MapViewportState {
  const unlocated = isEventUnlocated(event);
  return {
    lat: unlocated ? DEFAULT_PH_CENTER.lat : event.lat,
    lon: unlocated ? DEFAULT_PH_CENTER.lon : event.lon,
    zoom: unlocated ? 6 : compact ? 7.2 : 7,
  };
}

export function isValidViewport(
  viewport: Partial<MapViewportState> | null | undefined
): viewport is MapViewportState {
  return Boolean(
    viewport &&
      typeof viewport.lat === 'number' &&
      Number.isFinite(viewport.lat) &&
      viewport.lat >= -85 &&
      viewport.lat <= 85 &&
      typeof viewport.lon === 'number' &&
      Number.isFinite(viewport.lon) &&
      viewport.lon >= -180 &&
      viewport.lon <= 180 &&
      typeof viewport.zoom === 'number' &&
      Number.isFinite(viewport.zoom) &&
      viewport.zoom >= 1 &&
      viewport.zoom <= 20
  );
}

/**
 * Convert 256px Web Mercator zoom to Vector Schematic longitudinal span (degrees).
 */
export function zoomToLonSpan(zoom: number, containerWidthPx = 800): number {
  const safeWidth = Math.max(240, containerWidthPx);
  const safeZoom = Math.min(20, Math.max(1, zoom));
  const rawSpan = (360 * safeWidth) / (256 * Math.pow(2, safeZoom));
  return Number(Math.min(22, Math.max(0.35, rawSpan)).toFixed(3));
}

/**
 * Convert Vector Schematic longitudinal span (degrees) to 256px Web Mercator zoom.
 */
export function lonSpanToZoom(lonSpan: number, containerWidthPx = 800): number {
  const safeWidth = Math.max(240, containerWidthPx);
  const safeSpan = Math.min(30, Math.max(0.25, lonSpan));
  const rawZoom = Math.log2((360 * safeWidth) / (256 * safeSpan));
  return Number(Math.min(18, Math.max(3, rawZoom)).toFixed(3));
}

/**
 * MapLibre GL uses 512px tiles by default, so its zoom number is 1 less than 256px zoom.
 */
export function webMercatorZoomToMapLibreZoom(zoom256: number): number {
  return Math.max(1, Math.min(19, Number((zoom256 - 1).toFixed(3))));
}

export function mapLibreZoomToWebMercatorZoom(zoom512: number): number {
  return Math.max(2, Math.min(20, Number((zoom512 + 1).toFixed(3))));
}
