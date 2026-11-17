export type FaultCategory = 'Active Fault' | 'Potentially Active Fault';

export type TrenchFeatureKind = 'trench' | 'trough' | 'transform_fault';

export interface ActiveFaultProperties {
  source_row: number | null;
  global_id: string | null;
  fault_name: string | null;
  segment_name: string | null;
  fault_category: FaultCategory | string | null;
  fault_category_code: string | null;
  trace_type: string | null;
  trace_code: string | null;
  line_type: string | null;
  line_code: string | null;
  mechanism: string | null;
  mapped_year: number | string | null;
  published_year: number | string | null;
  mapping_scale: string | null;
  project: string | null;
  fault_identifier: string | null;
  fault_theme_code: string | null;
  additional_notes: string | null;
}

export interface TrenchFeatureProperties {
  source_row: number | null;
  name: string | null;
  source_label: string | null;
  feature_kind: TrenchFeatureKind | string | null;
}

export type GeoJsonLineGeometry =
  | { type: 'LineString'; coordinates: Array<[number, number]> }
  | { type: 'MultiLineString'; coordinates: Array<Array<[number, number]>> };

export interface ValidatedFaultFeature {
  type: 'Feature';
  id?: string | number;
  properties: ActiveFaultProperties;
  geometry: GeoJsonLineGeometry;
  bbox: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
  isUncertainTrace: boolean;
}

export interface ValidatedTrenchFeature {
  type: 'Feature';
  id?: string | number;
  properties: TrenchFeatureProperties;
  geometry: GeoJsonLineGeometry;
  bbox: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
  kind: TrenchFeatureKind;
  displayName: string;
}

export interface GeoJsonLineFeature {
  type: 'Feature';
  id?: string | number;
  properties: Record<string, unknown>;
  geometry: GeoJsonLineGeometry;
}

export interface GeoJsonFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJsonLineFeature[];
}

export interface ActiveFaultsDataset {
  type: 'FeatureCollection';
  totalCount: number;
  activeFaultCount: number;
  potentiallyActiveFaultCount: number;
  otherCategoryCount: number;
  features: ValidatedFaultFeature[];
  activeFaultCollection: GeoJsonFeatureCollection;
  potentiallyActiveFaultCollection: GeoJsonFeatureCollection;
  loadedAt: string;
  sourceUrl: string;
}

export interface TrenchSystemsDataset {
  type: 'FeatureCollection';
  totalCount: number;
  trenchCount: number;
  troughCount: number;
  transformFaultCount: number;
  features: ValidatedTrenchFeature[];
  featureCollection: GeoJsonFeatureCollection;
  loadedAt: string;
  sourceUrl: string;
}

export interface GeologyManifest {
  package_name: string;
  purpose: string;
  data_source: string;
  output_crs: string;
  active_faults: {
    features: number;
    source: string;
    source_crs: string;
    file: string;
    size_bytes: number;
    status: string;
  };
  trench_systems: {
    source_records: number;
    features: number;
    empty_geometry_skipped_source_rows: number[];
    source: string;
    source_crs: string;
    file: string;
    size_bytes: number;
    datum_transformation: string;
    estimated_transformation_accuracy_m: number;
    status: string;
  };
  known_issues: string[];
}

export interface GeologyLayerVisibility {
  activeFaults: boolean;
  potentiallyActiveFaults: boolean;
  trenches: boolean;
}

export const DEFAULT_GEOLOGY_LAYER_VISIBILITY: GeologyLayerVisibility = {
  activeFaults: false,
  potentiallyActiveFaults: false,
  trenches: false,
};

export type SelectedGeologyFeature =
  | {
      kind: 'fault';
      category: FaultCategory | string;
      properties: ActiveFaultProperties;
      clickCoords: { lat: number; lon: number };
    }
  | {
      kind: 'trench';
      trenchKind: TrenchFeatureKind;
      displayName: string;
      properties: TrenchFeatureProperties;
      clickCoords: { lat: number; lon: number };
    };

export function resolveGeologyAssetUrl(filename: string): string {
  const base = (import.meta.env?.BASE_URL ?? '/').trim() || '/';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return `${normalizedBase}data/geology/${filename.replace(/^\/+/, '')}`;
}

function asNullableString(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return s.length > 0 ? s : null;
}

function asNullableNumber(val: unknown): number | null {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string' && val.trim() !== '') {
    const n = Number(val);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function isValidCoordPair(pt: unknown): pt is [number, number] {
  if (!Array.isArray(pt) || pt.length < 2) return false;
  const lon = Number(pt[0]);
  const lat = Number(pt[1]);
  return (
    Number.isFinite(lon) &&
    Number.isFinite(lat) &&
    lon >= -180 &&
    lon <= 180 &&
    lat >= -90 &&
    lat <= 90
  );
}

function validateAndComputeLineBbox(
  geometry: unknown
): {
  valid: GeoJsonLineGeometry;
  bbox: [number, number, number, number];
} | null {
  if (!geometry || typeof geometry !== 'object') return null;
  const g = geometry as { type?: unknown; coordinates?: unknown };

  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  if (g.type === 'LineString') {
    if (!Array.isArray(g.coordinates) || g.coordinates.length < 2) return null;
    const cleanLine: Array<[number, number]> = [];
    for (const pt of g.coordinates) {
      if (!isValidCoordPair(pt)) return null;
      const lon = Number(pt[0]);
      const lat = Number(pt[1]);
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      cleanLine.push([lon, lat]);
    }
    return {
      valid: { type: 'LineString', coordinates: cleanLine },
      bbox: [minLon, minLat, maxLon, maxLat],
    };
  }

  if (g.type === 'MultiLineString') {
    if (!Array.isArray(g.coordinates) || g.coordinates.length === 0) return null;
    const cleanMulti: Array<Array<[number, number]>> = [];
    for (const part of g.coordinates) {
      if (!Array.isArray(part) || part.length < 2) return null;
      const cleanPart: Array<[number, number]> = [];
      for (const pt of part) {
        if (!isValidCoordPair(pt)) return null;
        const lon = Number(pt[0]);
        const lat = Number(pt[1]);
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        cleanPart.push([lon, lat]);
      }
      cleanMulti.push(cleanPart);
    }
    return {
      valid: { type: 'MultiLineString', coordinates: cleanMulti },
      bbox: [minLon, minLat, maxLon, maxLat],
    };
  }

  return null;
}

export function isUncertainTraceType(traceType: string | null | undefined): boolean {
  if (!traceType) return false;
  const lower = traceType.toLowerCase();
  return (
    lower.includes('approximate') ||
    lower.includes('concealed') ||
    lower.includes('inferred') ||
    lower.includes('offshore projection')
  );
}

export function normalizeActiveFaultProperties(raw: unknown): ActiveFaultProperties {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const mappedYearRaw = p.mapped_year;
  const publishedYearRaw = p.published_year;
  return {
    source_row: asNullableNumber(p.source_row),
    global_id: asNullableString(p.global_id),
    fault_name: asNullableString(p.fault_name),
    segment_name: asNullableString(p.segment_name),
    fault_category: asNullableString(p.fault_category),
    fault_category_code: asNullableString(p.fault_category_code),
    trace_type: asNullableString(p.trace_type),
    trace_code: asNullableString(p.trace_code),
    line_type: asNullableString(p.line_type),
    line_code: asNullableString(p.line_code),
    mechanism: asNullableString(p.mechanism),
    mapped_year:
      typeof mappedYearRaw === 'number' && Number.isFinite(mappedYearRaw)
        ? mappedYearRaw
        : asNullableString(mappedYearRaw),
    published_year:
      typeof publishedYearRaw === 'number' && Number.isFinite(publishedYearRaw)
        ? publishedYearRaw
        : asNullableString(publishedYearRaw),
    mapping_scale: asNullableString(p.mapping_scale),
    project: asNullableString(p.project),
    fault_identifier: asNullableString(p.fault_identifier),
    fault_theme_code: asNullableString(p.fault_theme_code),
    additional_notes: asNullableString(p.additional_notes),
  };
}

export function normalizeTrenchKind(
  rawKind: string | null | undefined,
  name?: string | null,
  sourceLabel?: string | null
): TrenchFeatureKind {
  const k = (rawKind ?? '').trim().toLowerCase();
  if (k === 'transform_fault' || k.includes('transform')) return 'transform_fault';
  if (k === 'trough' || k.includes('trough')) return 'trough';
  if (k === 'trench' || k.includes('trench')) return 'trench';

  const combined = `${name ?? ''} ${sourceLabel ?? ''}`.toLowerCase();
  if (combined.includes('transform')) return 'transform_fault';
  if (combined.includes('trough')) return 'trough';
  return 'trench';
}

export function getTrenchKindLabel(kind: TrenchFeatureKind): string {
  switch (kind) {
    case 'transform_fault':
      return 'Transform Fault';
    case 'trough':
      return 'Trough';
    case 'trench':
    default:
      return 'Trench';
  }
}

export function getTrenchDisplayName(props: TrenchFeatureProperties): string {
  const name = props.name?.trim() || '';
  const sourceLabel = props.source_label?.trim() || '';
  const genericNames = new Set([
    'transform fault',
    'trench',
    'trough',
    'fault',
    'unknown',
  ]);

  if (sourceLabel) {
    const isTruncatedUnderscore = /_\d*$/.test(sourceLabel);
    if (!name || genericNames.has(name.toLowerCase())) {
      return sourceLabel;
    }
    if (!isTruncatedUnderscore && sourceLabel.length > name.length) {
      return sourceLabel;
    }
  }
  return name || sourceLabel || 'Unnamed Tectonic Feature';
}

export function parseAndValidateActiveFaultsGeoJson(
  raw: unknown,
  sourceUrl = 'data/geology/active_faults.geojson'
): ActiveFaultsDataset {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Active faults GeoJSON payload is not a valid JSON object.');
  }
  const fc = raw as { type?: unknown; features?: unknown };
  if (fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) {
    throw new Error('Active faults dataset must be a valid GeoJSON FeatureCollection.');
  }

  const features: ValidatedFaultFeature[] = [];
  const activeGeoFeatures: GeoJsonLineFeature[] = [];
  const potentiallyActiveGeoFeatures: GeoJsonLineFeature[] = [];
  let activeFaultCount = 0;
  let potentiallyActiveFaultCount = 0;
  let otherCategoryCount = 0;

  for (let i = 0; i < fc.features.length; i++) {
    const f = fc.features[i] as {
      type?: unknown;
      id?: unknown;
      properties?: unknown;
      geometry?: unknown;
    };
    if (!f || f.type !== 'Feature') {
      throw new Error(`Invalid GeoJSON feature at index ${i} in active faults dataset.`);
    }
    const geomInfo = validateAndComputeLineBbox(f.geometry);
    if (!geomInfo) {
      throw new Error(
        `Invalid or unsupported geometry at index ${i} in active faults dataset (expected LineString or MultiLineString with WGS84 coordinates).`
      );
    }

    const props = normalizeActiveFaultProperties(f.properties);
    const isUncertainTrace = isUncertainTraceType(props.trace_type);
    const featureId =
      typeof f.id === 'string' || typeof f.id === 'number' ? f.id : undefined;

    features.push({
      type: 'Feature',
      id: featureId,
      properties: props,
      geometry: geomInfo.valid,
      bbox: geomInfo.bbox,
      isUncertainTrace,
    });

    const geoFeature: GeoJsonLineFeature = {
      type: 'Feature',
      id: featureId,
      properties: {
        ...props,
        __eqp_layer_kind: 'fault',
        __eqp_uncertain: isUncertainTrace,
      },
      geometry: geomInfo.valid,
    };

    if (props.fault_category === 'Active Fault') {
      activeFaultCount++;
      activeGeoFeatures.push(geoFeature);
    } else if (props.fault_category === 'Potentially Active Fault') {
      potentiallyActiveFaultCount++;
      potentiallyActiveGeoFeatures.push(geoFeature);
    } else {
      otherCategoryCount++;
    }
  }

  return {
    type: 'FeatureCollection',
    totalCount: features.length,
    activeFaultCount,
    potentiallyActiveFaultCount,
    otherCategoryCount,
    features,
    activeFaultCollection: {
      type: 'FeatureCollection',
      features: activeGeoFeatures,
    },
    potentiallyActiveFaultCollection: {
      type: 'FeatureCollection',
      features: potentiallyActiveGeoFeatures,
    },
    loadedAt: new Date().toISOString(),
    sourceUrl,
  };
}

export function parseAndValidateTrenchSystemsGeoJson(
  raw: unknown,
  sourceUrl = 'data/geology/trench_systems_REVIEW_ONLY.geojson'
): TrenchSystemsDataset {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Trench systems GeoJSON payload is not a valid JSON object.');
  }
  const fc = raw as { type?: unknown; features?: unknown };
  if (fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) {
    throw new Error('Trench systems dataset must be a valid GeoJSON FeatureCollection.');
  }

  const features: ValidatedTrenchFeature[] = [];
  const geoFeatures: GeoJsonLineFeature[] = [];
  let trenchCount = 0;
  let troughCount = 0;
  let transformFaultCount = 0;

  for (let i = 0; i < fc.features.length; i++) {
    const f = fc.features[i] as {
      type?: unknown;
      id?: unknown;
      properties?: unknown;
      geometry?: unknown;
    };
    if (!f || f.type !== 'Feature') {
      throw new Error(`Invalid GeoJSON feature at index ${i} in trench systems dataset.`);
    }
    const geomInfo = validateAndComputeLineBbox(f.geometry);
    if (!geomInfo) {
      throw new Error(
        `Invalid or unsupported geometry at index ${i} in trench systems dataset.`
      );
    }
    const rawProps = (f.properties && typeof f.properties === 'object'
      ? f.properties
      : {}) as Record<string, unknown>;
    const props: TrenchFeatureProperties = {
      source_row: asNullableNumber(rawProps.source_row),
      name: asNullableString(rawProps.name),
      source_label: asNullableString(rawProps.source_label),
      feature_kind: asNullableString(rawProps.feature_kind),
    };
    const kind = normalizeTrenchKind(props.feature_kind, props.name, props.source_label);
    const displayName = getTrenchDisplayName(props);
    if (kind === 'transform_fault') transformFaultCount++;
    else if (kind === 'trough') troughCount++;
    else trenchCount++;

    const featureId =
      typeof f.id === 'string' || typeof f.id === 'number' ? f.id : undefined;

    features.push({
      type: 'Feature',
      id: featureId,
      properties: props,
      geometry: geomInfo.valid,
      bbox: geomInfo.bbox,
      kind,
      displayName,
    });

    geoFeatures.push({
      type: 'Feature',
      id: featureId,
      properties: {
        ...props,
        __eqp_layer_kind: 'trench',
        __eqp_trench_kind: kind,
        __eqp_display_name: displayName,
      },
      geometry: geomInfo.valid,
    });
  }

  return {
    type: 'FeatureCollection',
    totalCount: features.length,
    trenchCount,
    troughCount,
    transformFaultCount,
    features,
    featureCollection: {
      type: 'FeatureCollection',
      features: geoFeatures,
    },
    loadedAt: new Date().toISOString(),
    sourceUrl,
  };
}

let cachedActiveFaults: ActiveFaultsDataset | null = null;
let pendingActiveFaultsPromise: Promise<ActiveFaultsDataset> | null = null;

let cachedTrenchSystems: TrenchSystemsDataset | null = null;
let pendingTrenchSystemsPromise: Promise<TrenchSystemsDataset> | null = null;

let cachedManifest: GeologyManifest | null = null;
let pendingManifestPromise: Promise<GeologyManifest> | null = null;

export function getCachedActiveFaultsDataset(): ActiveFaultsDataset | null {
  return cachedActiveFaults;
}

export function getCachedTrenchSystemsDataset(): TrenchSystemsDataset | null {
  return cachedTrenchSystems;
}

export function getCachedGeologyManifest(): GeologyManifest | null {
  return cachedManifest;
}

export async function loadActiveFaultsDataset(
  fetcher: typeof fetch = fetch
): Promise<ActiveFaultsDataset> {
  if (cachedActiveFaults) return cachedActiveFaults;
  if (pendingActiveFaultsPromise) return pendingActiveFaultsPromise;

  const url = resolveGeologyAssetUrl('active_faults.geojson');
  pendingActiveFaultsPromise = (async () => {
    try {
      const res = await fetcher(url);
      if (!res.ok) {
        throw new Error(`Unable to load active fault GIS data (HTTP ${res.status}).`);
      }
      const json: unknown = await res.json();
      const validated = parseAndValidateActiveFaultsGeoJson(json, url);
      cachedActiveFaults = validated;
      return validated;
    } finally {
      pendingActiveFaultsPromise = null;
    }
  })();

  return pendingActiveFaultsPromise;
}

export async function loadTrenchSystemsDataset(
  fetcher: typeof fetch = fetch
): Promise<TrenchSystemsDataset> {
  if (cachedTrenchSystems) return cachedTrenchSystems;
  if (pendingTrenchSystemsPromise) return pendingTrenchSystemsPromise;

  const url = resolveGeologyAssetUrl('trench_systems_REVIEW_ONLY.geojson');
  pendingTrenchSystemsPromise = (async () => {
    try {
      const res = await fetcher(url);
      if (!res.ok) {
        throw new Error(`Unable to load trench GIS data (HTTP ${res.status}).`);
      }
      const json: unknown = await res.json();
      const validated = parseAndValidateTrenchSystemsGeoJson(json, url);
      cachedTrenchSystems = validated;
      return validated;
    } finally {
      pendingTrenchSystemsPromise = null;
    }
  })();

  return pendingTrenchSystemsPromise;
}

export async function loadGeologyManifest(
  fetcher: typeof fetch = fetch
): Promise<GeologyManifest> {
  if (cachedManifest) return cachedManifest;
  if (pendingManifestPromise) return pendingManifestPromise;

  const url = resolveGeologyAssetUrl('manifest.json');
  pendingManifestPromise = (async () => {
    try {
      const res = await fetcher(url);
      if (!res.ok) {
        throw new Error(`Unable to load geological GIS manifest (HTTP ${res.status}).`);
      }
      const json = (await res.json()) as GeologyManifest;
      cachedManifest = json;
      return json;
    } finally {
      pendingManifestPromise = null;
    }
  })();

  return pendingManifestPromise;
}

function pointToSegmentDistSq(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const ex = px - x1;
    const ey = py - y1;
    return ex * ex + ey * ey;
  }
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  const ex = px - projX;
  const ey = py - projY;
  return ex * ex + ey * ey;
}

function minDistSqToLineGeometry(
  lon: number,
  lat: number,
  geometry: GeoJsonLineGeometry,
  lonScale: number
): number {
  let minSq = Infinity;
  const lines =
    geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
  for (const line of lines) {
    for (let i = 0; i < line.length - 1; i++) {
      const [lon1, lat1] = line[i];
      const [lon2, lat2] = line[i + 1];
      const dSq = pointToSegmentDistSq(
        lon * lonScale,
        lat,
        lon1 * lonScale,
        lat1,
        lon2 * lonScale,
        lat2
      );
      if (dSq < minSq) minSq = dSq;
    }
  }
  return minSq;
}

export function hitTestGeologyFeatures(params: {
  clickLon: number;
  clickLat: number;
  maxToleranceDeg: number;
  visibility: GeologyLayerVisibility;
  activeFaultsData: ActiveFaultsDataset | null;
  trenchData: TrenchSystemsDataset | null;
}): SelectedGeologyFeature | null {
  const {
    clickLon,
    clickLat,
    maxToleranceDeg,
    visibility,
    activeFaultsData,
    trenchData,
  } = params;

  const lonScale = Math.max(0.25, Math.cos((clickLat * Math.PI) / 180));
  const maxDistSq = maxToleranceDeg * maxToleranceDeg;
  let bestDistSq = maxDistSq;
  let bestMatch: SelectedGeologyFeature | null = null;

  if (
    activeFaultsData &&
    (visibility.activeFaults || visibility.potentiallyActiveFaults)
  ) {
    for (const feature of activeFaultsData.features) {
      const cat = feature.properties.fault_category;
      if (cat === 'Active Fault' && !visibility.activeFaults) continue;
      if (cat === 'Potentially Active Fault' && !visibility.potentiallyActiveFaults)
        continue;
      if (cat !== 'Active Fault' && cat !== 'Potentially Active Fault') continue;

      const [minLon, minLat, maxLon, maxLat] = feature.bbox;
      if (
        clickLon < minLon - maxToleranceDeg ||
        clickLon > maxLon + maxToleranceDeg ||
        clickLat < minLat - maxToleranceDeg ||
        clickLat > maxLat + maxToleranceDeg
      ) {
        continue;
      }

      const dSq = minDistSqToLineGeometry(
        clickLon,
        clickLat,
        feature.geometry,
        lonScale
      );
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestMatch = {
          kind: 'fault',
          category: cat,
          properties: feature.properties,
          clickCoords: { lat: clickLat, lon: clickLon },
        };
      }
    }
  }

  if (trenchData && visibility.trenches) {
    for (const feature of trenchData.features) {
      const [minLon, minLat, maxLon, maxLat] = feature.bbox;
      if (
        clickLon < minLon - maxToleranceDeg ||
        clickLon > maxLon + maxToleranceDeg ||
        clickLat < minLat - maxToleranceDeg ||
        clickLat > maxLat + maxToleranceDeg
      ) {
        continue;
      }

      const dSq = minDistSqToLineGeometry(
        clickLon,
        clickLat,
        feature.geometry,
        lonScale
      );
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestMatch = {
          kind: 'trench',
          trenchKind: feature.kind,
          displayName: feature.displayName,
          properties: feature.properties,
          clickCoords: { lat: clickLat, lon: clickLon },
        };
      }
    }
  }

  return bestMatch;
}

export interface GisNearestFaultResult {
  feature: ValidatedFaultFeature;
  epicentralDistKm: number;
  hypocentralDistKm: number;
  bearingDeg: number;
  quadrantLabel: string;
  nearestPoint: { lat: number; lon: number };
}

export interface ComputeNearestGisFaultsOptions {
  epicenterLat: number;
  epicenterLon: number;
  depthKm?: number;
  activeFaultsData: ActiveFaultsDataset;
  includePotentiallyActive?: boolean;
  limit?: number;
}

export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const earthRadiusKm = 6371.0088;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const sinHalfLat = Math.sin(dLat / 2);
  const sinHalfLon = Math.sin(dLon / 2);
  const a =
    sinHalfLat * sinHalfLat +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * sinHalfLon * sinHalfLon;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  return earthRadiusKm * c;
}

export function computeCompassBearing(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number
): { azimDeg: number; quadrantLabel: string } {
  const rad = Math.PI / 180;
  const phi1 = fromLat * rad;
  const phi2 = toLat * rad;
  const dLambda = (toLon - fromLon) * rad;
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  const rawDeg = (Math.atan2(y, x) * 180) / Math.PI;
  const azimDeg = ((rawDeg % 360) + 360) % 360;

  let ns = 'N';
  let ew = 'E';
  let angle = azimDeg;
  if (azimDeg > 90 && azimDeg <= 180) {
    ns = 'S';
    ew = 'E';
    angle = 180 - azimDeg;
  } else if (azimDeg > 180 && azimDeg < 270) {
    ns = 'S';
    ew = 'W';
    angle = azimDeg - 180;
  } else if (azimDeg >= 270) {
    ns = 'N';
    ew = 'W';
    angle = 360 - azimDeg;
  }
  const roundedAngle = Math.round(angle);
  return {
    azimDeg,
    quadrantLabel: `${ns} ${String(roundedAngle).padStart(2, '0')}° ${ew}`,
  };
}

function closestPointOnSegmentKm(
  pLat: number,
  pLon: number,
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number
): { distKm: number; projLat: number; projLon: number } {
  const meanLatRad = (((aLat + bLat + pLat) / 3) * Math.PI) / 180;
  const kx = 111.32 * Math.max(0.25, Math.cos(meanLatRad));
  const ky = 111.32;

  const ax = aLon * kx;
  const ay = aLat * ky;
  const bx = bLon * kx;
  const by = bLat * ky;
  const px = pLon * kx;
  const py = pLat * ky;

  const abx = bx - ax;
  const aby = by - ay;
  const abLenSq = abx * abx + aby * aby;

  if (abLenSq <= 1e-12) {
    return {
      distKm: haversineDistanceKm(pLat, pLon, aLat, aLon),
      projLat: aLat,
      projLon: aLon,
    };
  }

  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / abLenSq));
  if (t === 0) {
    return {
      distKm: haversineDistanceKm(pLat, pLon, aLat, aLon),
      projLat: aLat,
      projLon: aLon,
    };
  }
  if (t === 1) {
    return {
      distKm: haversineDistanceKm(pLat, pLon, bLat, bLon),
      projLat: bLat,
      projLon: bLon,
    };
  }

  const projLat = (ay + t * aby) / ky;
  const projLon = (ax + t * abx) / kx;
  return {
    distKm: haversineDistanceKm(pLat, pLon, projLat, projLon),
    projLat,
    projLon,
  };
}

function closestPointOnFaultGeometry(
  pLat: number,
  pLon: number,
  geometry: GeoJsonLineGeometry
): { distKm: number; lat: number; lon: number } {
  const lines =
    geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
  let bestDistKm = Infinity;
  let bestLat = pLat;
  let bestLon = pLon;

  for (const line of lines) {
    for (let i = 0; i < line.length - 1; i++) {
      const [aLon, aLat] = line[i];
      const [bLon, bLat] = line[i + 1];
      const hit = closestPointOnSegmentKm(pLat, pLon, aLat, aLon, bLat, bLon);
      if (hit.distKm < bestDistKm) {
        bestDistKm = hit.distKm;
        bestLat = hit.projLat;
        bestLon = hit.projLon;
      }
    }
  }

  return { distKm: bestDistKm, lat: bestLat, lon: bestLon };
}

export function computeNearestGisFaults(
  options: ComputeNearestGisFaultsOptions
): GisNearestFaultResult[] {
  const {
    epicenterLat,
    epicenterLon,
    depthKm = 0,
    activeFaultsData,
    includePotentiallyActive = false,
    limit = 3,
  } = options;

  if (
    !Number.isFinite(epicenterLat) ||
    !Number.isFinite(epicenterLon) ||
    epicenterLat < -90 ||
    epicenterLat > 90 ||
    epicenterLon < -180 ||
    epicenterLon > 180 ||
    limit <= 0
  ) {
    return [];
  }

  const safeDepthKm = Number.isFinite(depthKm) && depthKm > 0 ? depthKm : 0;

  // Step 1: Compute conservative spherical lower-bound distance to each feature's bbox
  const candidates: Array<{
    feature: ValidatedFaultFeature;
    bboxLowerBoundKm: number;
  }> = [];

  for (const feature of activeFaultsData.features) {
    const cat = feature.properties.fault_category;
    if (cat === 'Active Fault') {
      // always included
    } else if (cat === 'Potentially Active Fault' && includePotentiallyActive) {
      // included when toggled on
    } else {
      continue;
    }

    const [minLon, minLat, maxLon, maxLat] = feature.bbox;
    const clampedLat = Math.max(minLat, Math.min(maxLat, epicenterLat));
    const clampedLon = Math.max(minLon, Math.min(maxLon, epicenterLon));
    const bboxLowerBoundKm =
      clampedLat === epicenterLat && clampedLon === epicenterLon
        ? 0
        : haversineDistanceKm(epicenterLat, epicenterLon, clampedLat, clampedLon) * 0.95;

    candidates.push({ feature, bboxLowerBoundKm });
  }

  candidates.sort((a, b) => a.bboxLowerBoundKm - b.bboxLowerBoundKm);

  // Step 2: Evaluate exact polyline segment distance with early cutoff once bbox bound exceeds
  // the worst distance in our deduplicated top-N list.
  const rawTop: Array<{
    feature: ValidatedFaultFeature;
    epicentralDistKm: number;
    lat: number;
    lon: number;
  }> = [];
  const seenKeys = new Set<string>();
  let worstKeptDistKm = Infinity;

  for (const candidate of candidates) {
    if (rawTop.length >= limit && candidate.bboxLowerBoundKm > worstKeptDistKm) {
      break;
    }

    const hit = closestPointOnFaultGeometry(
      epicenterLat,
      epicenterLon,
      candidate.feature.geometry
    );
    if (!Number.isFinite(hit.distKm)) continue;

    const p = candidate.feature.properties;
    const dedupeKey =
      p.fault_name && p.segment_name
        ? `${p.fault_category ?? ''}|${p.fault_name}|${p.segment_name}`
        : `row:${p.source_row ?? candidate.feature.id ?? Math.random()}`;

    // Always keep exact closest trace; for identical named fault+segment duplicates keep only closest
    if (seenKeys.has(dedupeKey)) {
      const existingIdx = rawTop.findIndex((item) => {
        const ep = item.feature.properties;
        const k =
          ep.fault_name && ep.segment_name
            ? `${ep.fault_category ?? ''}|${ep.fault_name}|${ep.segment_name}`
            : `row:${ep.source_row ?? item.feature.id ?? ''}`;
        return k === dedupeKey;
      });
      if (existingIdx !== -1 && hit.distKm < rawTop[existingIdx].epicentralDistKm) {
        rawTop[existingIdx] = {
          feature: candidate.feature,
          epicentralDistKm: hit.distKm,
          lat: hit.lat,
          lon: hit.lon,
        };
        rawTop.sort((a, b) => a.epicentralDistKm - b.epicentralDistKm);
        worstKeptDistKm =
          rawTop.length >= limit ? rawTop[limit - 1].epicentralDistKm : Infinity;
      }
      continue;
    }

    if (rawTop.length < limit || hit.distKm < worstKeptDistKm) {
      rawTop.push({
        feature: candidate.feature,
        epicentralDistKm: hit.distKm,
        lat: hit.lat,
        lon: hit.lon,
      });
      seenKeys.add(dedupeKey);
      rawTop.sort((a, b) => a.epicentralDistKm - b.epicentralDistKm);
      if (rawTop.length > limit) {
        const removed = rawTop.pop();
        if (removed) {
          const rp = removed.feature.properties;
          const rk =
            rp.fault_name && rp.segment_name
              ? `${rp.fault_category ?? ''}|${rp.fault_name}|${rp.segment_name}`
              : `row:${rp.source_row ?? removed.feature.id ?? ''}`;
          seenKeys.delete(rk);
        }
      }
      worstKeptDistKm =
        rawTop.length >= limit ? rawTop[limit - 1].epicentralDistKm : Infinity;
    }
  }

  return rawTop.map((item) => {
    const bearing =
      item.epicentralDistKm < 1e-4
        ? { azimDeg: 0, quadrantLabel: 'On Trace' }
        : computeCompassBearing(epicenterLat, epicenterLon, item.lat, item.lon);
    return {
      feature: item.feature,
      epicentralDistKm: item.epicentralDistKm,
      hypocentralDistKm: Math.hypot(item.epicentralDistKm, safeDepthKm),
      bearingDeg: bearing.azimDeg,
      quadrantLabel: bearing.quadrantLabel,
      nearestPoint: { lat: item.lat, lon: item.lon },
    };
  });
}
