import {
  DEFAULT_PH_CENTER,
  type EQPEvent,
  FAULT_TRACES,
  ISLAND_POLYGONS,
  isEventUnlocated,
  type TectonicTrace,
} from '../data/eqpData.ts';
import type { ActiveFaultsDataset, GeologyManifest } from './geologyLayers.ts';
import { computeDistanceAndBearing, type MainOfficeLocation } from './nearestPlaces.ts';

export type PrimerMapExtent = 'focused' | 'regional' | 'national';
export type PrimerMapTheme = 'classic' | 'print-bw';

export interface PrimerMapLayerConfig {
  schematicFaults: boolean;
  gisCandidateFaults: boolean;
  nearestLocalities: boolean;
  stations: boolean;
  mainOfficeVector: boolean;
  trenchSystemsGis: boolean;
}

export const DEFAULT_PRIMER_MAP_LAYERS: PrimerMapLayerConfig = {
  schematicFaults: true,
  gisCandidateFaults: false,
  nearestLocalities: true,
  stations: false,
  mainOfficeVector: false,
  trenchSystemsGis: false,
};

export type PrimerMapSourceSolutionStatus =
  | 'adopted-verified'
  | 'adopted-unverified-model'
  | 'legacy-or-manual'
  | 'stale'
  | 'unlocated';

export interface PrimerMapUnavailableLayer {
  layer: string;
  reason: string;
}

export interface PrimerMapFigureProvenance {
  sourceEventFingerprint: string;
  generatedAt: string;
  sourceSolutionStatus: PrimerMapSourceSolutionStatus;
  sourceSolutionNote: string;
  basemapSource: string;
  dataSources: string[];
  unavailableLayers: PrimerMapUnavailableLayer[];
  nonCausalDisclaimer: string;
}

export interface PrimerMapFigureRecord {
  status: 'ready' | 'unavailable';
  unavailableReason?: string;
  reviewStatus: 'ready-for-review' | 'requires-info' | 'requires-scientific-review';
  extent: PrimerMapExtent;
  theme: PrimerMapTheme;
  layers: PrimerMapLayerConfig;
  bbox: {
    minLon: number;
    maxLon: number;
    minLat: number;
    maxLat: number;
  } | null;
  scaleBarKm: number | null;
  svgMarkup: string;
  pngDataUrl?: string;
  caption: string;
  provenance: PrimerMapFigureProvenance;
}

export interface PrimerNearestCityPin {
  name: string;
  lat: number;
  lon: number;
  distanceKm: number;
  bearing: string;
}

export interface GeneratePrimerFigureOptions {
  extent?: PrimerMapExtent;
  theme?: PrimerMapTheme;
  layers?: Partial<PrimerMapLayerConfig>;
  primaryLocationLabel?: string | null;
  faultGeneratorLabel?: string | null;
  nearestCitiesPins?: PrimerNearestCityPin[];
  isPlotResultStale?: boolean;
  gisActiveFaultsData?: ActiveFaultsDataset | null;
  gisManifest?: GeologyManifest | null;
  mainOffice?: MainOfficeLocation;
  customCaption?: string;
}

const REFERENCE_PH_CITIES: Array<{ name: string; lon: number; lat: number }> = [
  { name: 'Manila', lon: 120.98, lat: 14.6 },
  { name: 'Baguio City', lon: 120.59, lat: 16.41 },
  { name: 'Legazpi City', lon: 123.73, lat: 13.14 },
  { name: 'Tacloban City', lon: 125.0, lat: 11.24 },
  { name: 'Borongan City', lon: 125.43, lat: 11.61 },
  { name: 'Iloilo City', lon: 122.56, lat: 10.72 },
  { name: 'Cebu City', lon: 123.89, lat: 10.31 },
  { name: 'Puerto Princesa', lon: 118.74, lat: 9.74 },
  { name: 'Surigao City', lon: 125.49, lat: 9.78 },
  { name: 'Cagayan de Oro', lon: 124.63, lat: 8.48 },
  { name: 'Davao City', lon: 125.61, lat: 7.07 },
  { name: 'Zamboanga City', lon: 122.07, lat: 6.91 },
];

const NICE_SCALE_KM = [5, 10, 20, 25, 50, 100, 150, 200, 250, 300, 500];

const NON_CAUSAL_DISCLAIMER =
  'Geographic proximity to mapped faults or trenches does not confirm earthquake causation.';

function escapeXml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function isValidGeographicCoordinate(lat: number, lon: number): boolean {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

/**
 * Computes a deterministic 16-hex-char fingerprint of the active event parameters
 * driving the primer epicenter figure so edits to hypocenter, picks/stale state,
 * or magnitude automatically flag previously generated figures as stale.
 */
export function computePrimerEventFingerprint(
  event: EQPEvent,
  options: {
    primaryLocationLabel?: string | null;
    isPlotResultStale?: boolean;
  } = {}
): string {
  const payload = JSON.stringify({
    id: event.id,
    bulletinNo: event.bulletinNo,
    originDateGmt: event.originDateGmt,
    originTimeGmt: event.originTimeGmt,
    lat: Number.isFinite(event.lat) ? Number(event.lat.toFixed(4)) : null,
    lon: Number.isFinite(event.lon) ? Number(event.lon.toFixed(4)) : null,
    depthKm: Number.isFinite(event.depthKm) ? Number(event.depthKm.toFixed(2)) : null,
    iterations: event.iterations,
    preferredScale: event.preferredScale,
    ms: event.ms,
    mb: event.mb,
    md: event.md,
    errKm: event.errKm,
    rmsSec: event.rmsSec,
    primaryLocationLabel: options.primaryLocationLabel ?? null,
    locationChecksum: event.locationMetadata?.inputChecksum ?? null,
    validationStatus: event.locationMetadata?.validationStatus ?? null,
    isPlotResultStale: Boolean(options.isPlotResultStale),
  });

  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ payload.length;
  for (let i = 0; i < payload.length; i++) {
    const ch = payload.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= ch + ((i & 0xff) << 1);
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

export function resolveSourceSolutionStatus(
  event: EQPEvent,
  isPlotResultStale = false
): { status: PrimerMapSourceSolutionStatus; note: string } {
  if (isEventUnlocated(event) || !isValidGeographicCoordinate(event.lat, event.lon)) {
    return {
      status: 'unlocated',
      note: 'Hypocenter location is unlocated or invalid; map coordinates unavailable.',
    };
  }
  if (isPlotResultStale) {
    return {
      status: 'stale',
      note: 'Source PLOT solution is stale relative to modified phase picks; re-run Locate and refresh figure.',
    };
  }
  if (event.locationMetadata) {
    if (event.locationMetadata.validationStatus === 'verified') {
      return {
        status: 'adopted-verified',
        note: `Adopted ${event.locationMetadata.solver} solution (${event.locationMetadata.modelName})`,
      };
    }
    return {
      status: 'adopted-unverified-model',
      note: `Adopted ${event.locationMetadata.solver} solution (validation status: ${event.locationMetadata.validationStatus})`,
    };
  }
  return {
    status: 'legacy-or-manual',
    note: `Active event record (${event.filename})`,
  };
}

export function computeMapBoundingBox(
  lat: number,
  lon: number,
  extent: PrimerMapExtent
): { minLon: number; maxLon: number; minLat: number; maxLat: number; tickStep: number } {
  if (extent === 'national') {
    return {
      minLon: 115.5,
      maxLon: 128.5,
      minLat: 4.2,
      maxLat: 19.8,
      tickStep: 2,
    };
  }
  if (extent === 'focused') {
    const lonHalf = 1.65;
    const latHalf = 1.1;
    return {
      minLon: Number((lon - lonHalf).toFixed(3)),
      maxLon: Number((lon + lonHalf).toFixed(3)),
      minLat: Number((lat - latHalf).toFixed(3)),
      maxLat: Number((lat + latHalf).toFixed(3)),
      tickStep: 0.5,
    };
  }
  // Regional extent centered cleanly around the epicenter while matching 760x420 plot aspect
  const lonHalf = 3.4;
  const latHalf = 2.25;
  return {
    minLon: Number((lon - lonHalf).toFixed(3)),
    maxLon: Number((lon + lonHalf).toFixed(3)),
    minLat: Number((lat - latHalf).toFixed(3)),
    maxLat: Number((lat + latHalf).toFixed(3)),
    tickStep: 1,
  };
}

export function computeCartographicScaleBar(
  minLon: number,
  maxLon: number,
  midLat: number,
  plotWidthPx: number
): { scaleKm: number; scalePx: number } {
  const degLonKm = 111.32 * Math.max(0.25, Math.cos((midLat * Math.PI) / 180));
  const totalWidthKm = Math.max(10, (maxLon - minLon) * degLonKm);
  const targetPx = Math.min(130, Math.max(70, plotWidthPx * 0.16));
  const rawKm = (targetPx / Math.max(100, plotWidthPx)) * totalWidthKm;
  const scaleKm =
    NICE_SCALE_KM.reduce((best, cand) =>
      Math.abs(cand - rawKm) < Math.abs(best - rawKm) ? cand : best
    ) || 50;
  const scalePx = Math.max(36, Math.min(160, (scaleKm / totalWidthKm) * plotWidthPx));
  return { scaleKm, scalePx };
}

function createStarPolygonPoints(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number
): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return pts.join(' ');
}

function getActiveMagnitudeLabel(event: EQPEvent): string | null {
  const val =
    event.preferredScale === 'Ms'
      ? event.ms
      : event.preferredScale === 'Mb'
        ? event.mb
        : event.md;
  if (!Number.isFinite(val) || val <= 0) return null;
  return `${event.preferredScale} ${val.toFixed(1)}`;
}

function formatTickLabel(value: number, axis: 'lat' | 'lon'): string {
  const formatted = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${formatted}°${axis === 'lat' ? 'N' : 'E'}`;
}

/**
 * Generates a deterministic, self-contained SVG epicenter & geographic context figure
 * from verified active event state and permitted built-in / loaded GIS vector layers.
 */
export function generatePrimerEpicenterFigure(
  event: EQPEvent,
  options: GeneratePrimerFigureOptions = {}
): PrimerMapFigureRecord {
  const extent: PrimerMapExtent = options.extent ?? 'regional';
  const theme: PrimerMapTheme = options.theme ?? 'classic';
  const layers: PrimerMapLayerConfig = {
    ...DEFAULT_PRIMER_MAP_LAYERS,
    ...(options.layers ?? {}),
  };

  const nowIso = new Date().toISOString();
  const fingerprint = computePrimerEventFingerprint(event, {
    primaryLocationLabel: options.primaryLocationLabel,
    isPlotResultStale: options.isPlotResultStale,
  });
  const solutionMeta = resolveSourceSolutionStatus(event, options.isPlotResultStale);
  const magLabel = getActiveMagnitudeLabel(event);

  const unavailableLayers: PrimerMapUnavailableLayer[] = [];

  // Manifest-gated GIS trench layer check: trench_systems_REVIEW_ONLY.geojson uses EPSG:4253 without datum transform
  if (layers.trenchSystemsGis) {
    const trenchManifestStatus =
      options.gisManifest?.trench_systems?.status ??
      'REVIEW ONLY pending scientific and GIS review';
    unavailableLayers.push({
      layer: 'GIS Trench Systems (trench_systems_REVIEW_ONLY.geojson)',
      reason: `${trenchManifestStatus}; EPSG:4253 (Luzon 1911) to WGS84 datum transformation unavailable.`,
    });
  }

  // Manifest-gated GIS active faults layer check
  const gisFaultsRequestedAndReady =
    layers.gisCandidateFaults && Boolean(options.gisActiveFaultsData);
  if (layers.gisCandidateFaults && !options.gisActiveFaultsData) {
    unavailableLayers.push({
      layer: 'GIS Active Faults (active_faults.geojson)',
      reason:
        'Candidate GIS fault dataset is not loaded yet or provenance verification is pending.',
    });
  }

  // Validate coordinates strictly — never invent an epicenter location
  if (
    isEventUnlocated(event) ||
    !isValidGeographicCoordinate(event.lat, event.lon)
  ) {
    return {
      status: 'unavailable',
      unavailableReason:
        'Epicenter latitude/longitude are unlocated or invalid. Run Locate and adopt valid coordinates before generating a map figure.',
      reviewStatus: 'requires-info',
      extent,
      theme,
      layers,
      bbox: null,
      scaleBarKm: null,
      svgMarkup: '',
      caption:
        options.customCaption?.trim() ||
        `Figure 1. Epicenter map unavailable for Event ${event.id} (coordinates pending location).`,
      provenance: {
        sourceEventFingerprint: fingerprint,
        generatedAt: nowIso,
        sourceSolutionStatus: 'unlocated',
        sourceSolutionNote: solutionMeta.note,
        basemapSource: 'Built-in EQP Philippine Coastline Vector (EPSG:4326)',
        dataSources: ['None rendered — event coordinates unavailable'],
        unavailableLayers,
        nonCausalDisclaimer: NON_CAUSAL_DISCLAIMER,
      },
    };
  }

  const bbox = computeMapBoundingBox(event.lat, event.lon, extent);
  const { minLon, maxLon, minLat, maxLat, tickStep } = bbox;

  const svgW = 760;
  const svgH = 548;
  const padL = 48;
  const padR = 48;
  const padT = 36;
  const plotW = svgW - padL - padR; // 664
  const plotH = 408;
  const legendTop = padT + plotH + 24; // 468

  const project = (lon: number, lat: number): [number, number] => [
    padL + ((lon - minLon) / Math.max(0.25, maxLon - minLon)) * plotW,
    padT + ((maxLat - lat) / Math.max(0.25, maxLat - minLat)) * plotH,
  ];

  const isPrintBw = theme === 'print-bw';
  const palette = isPrintBw
    ? {
        outerBg: '#ffffff',
        seaFill: '#f8fafc',
        landFill: '#e2e8f0',
        landStroke: '#334155',
        gridStroke: '#cbd5e1',
        frameStroke: '#0f172a',
        tickText: '#0f172a',
        faultStroke: '#0f172a',
        trenchStroke: '#475569',
        gisFaultStroke: '#334155',
        cityDot: '#0f172a',
        cityText: '#0f172a',
        starFill: '#0f172a',
        starStroke: '#ffffff',
        stationFill: '#334155',
        legendBg: '#f8fafc',
        legendBorder: '#cbd5e1',
      }
    : {
        outerBg: '#ffffff',
        seaFill: '#dceefb',
        landFill: '#f4f1ea',
        landStroke: '#64748b',
        gridStroke: '#93c5fd',
        frameStroke: '#0f172a',
        tickText: '#334155',
        faultStroke: '#dc2626',
        trenchStroke: '#6d28d9',
        gisFaultStroke: '#b91c1c',
        cityDot: '#1e293b',
        cityText: '#0f172a',
        starFill: '#dc2626',
        starStroke: '#ffffff',
        stationFill: '#0284c7',
        legendBg: '#f8fafc',
        legendBorder: '#cbd5e1',
      };

  const lonTicks: number[] = [];
  const startLonTick = Math.ceil(minLon / tickStep) * tickStep;
  for (let l = startLonTick; l <= maxLon + 1e-6; l += tickStep) {
    lonTicks.push(Number(l.toFixed(2)));
  }

  const latTicks: number[] = [];
  const startLatTick = Math.ceil(minLat / tickStep) * tickStep;
  for (let l = startLatTick; l <= maxLat + 1e-6; l += tickStep) {
    latTicks.push(Number(l.toFixed(2)));
  }

  const midLat = (minLat + maxLat) / 2;
  const { scaleKm, scalePx } = computeCartographicScaleBar(
    minLon,
    maxLon,
    midLat,
    plotW
  );

  const [epiX, epiY] = project(event.lon, event.lat);

  // Build SVG layers safely
  const clipId = `primer-map-clip-${fingerprint.slice(0, 8)}`;

  const ticksSvg = [
    ...lonTicks.map((lon) => {
      const [tx] = project(lon, minLat);
      if (tx < padL + 8 || tx > padL + plotW - 8) return '';
      const lbl = escapeXml(formatTickLabel(lon, 'lon'));
      return `
        <line x1="${tx.toFixed(1)}" y1="${padT - 4}" x2="${tx.toFixed(1)}" y2="${padT}" stroke="${palette.frameStroke}" stroke-width="0.9" />
        <line x1="${tx.toFixed(1)}" y1="${padT + plotH}" x2="${tx.toFixed(1)}" y2="${padT + plotH + 4}" stroke="${palette.frameStroke}" stroke-width="0.9" />
        <text x="${tx.toFixed(1)}" y="${padT - 7}" text-anchor="middle" font-size="9" font-family="Consolas, monospace" fill="${palette.tickText}">${lbl}</text>
        <text x="${tx.toFixed(1)}" y="${padT + plotH + 14}" text-anchor="middle" font-size="9" font-family="Consolas, monospace" fill="${palette.tickText}">${lbl}</text>
      `;
    }),
    ...latTicks.map((lat) => {
      const [, ty] = project(minLon, lat);
      if (ty < padT + 8 || ty > padT + plotH - 8) return '';
      const lbl = escapeXml(formatTickLabel(lat, 'lat'));
      return `
        <line x1="${padL - 4}" y1="${ty.toFixed(1)}" x2="${padL}" y2="${ty.toFixed(1)}" stroke="${palette.frameStroke}" stroke-width="0.9" />
        <line x1="${padL + plotW}" y1="${ty.toFixed(1)}" x2="${padL + plotW + 4}" y2="${ty.toFixed(1)}" stroke="${palette.frameStroke}" stroke-width="0.9" />
        <text x="${padL - 7}" y="${(ty + 3).toFixed(1)}" text-anchor="end" font-size="9" font-family="Consolas, monospace" fill="${palette.tickText}">${lbl}</text>
        <text x="${padL + plotW + 7}" y="${(ty + 3).toFixed(1)}" text-anchor="start" font-size="9" font-family="Consolas, monospace" fill="${palette.tickText}">${lbl}</text>
      `;
    }),
  ].join('\n');

  const gridSvg = [
    ...lonTicks.map((lon) => {
      const [gx] = project(lon, minLat);
      return `<line x1="${gx.toFixed(1)}" y1="${padT}" x2="${gx.toFixed(1)}" y2="${padT + plotH}" stroke="${palette.gridStroke}" stroke-width="0.6" stroke-dasharray="3 3" />`;
    }),
    ...latTicks.map((lat) => {
      const [, gy] = project(minLon, lat);
      return `<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${padL + plotW}" y2="${gy.toFixed(1)}" stroke="${palette.gridStroke}" stroke-width="0.6" stroke-dasharray="3 3" />`;
    }),
  ].join('\n');

  const islandsSvg = ISLAND_POLYGONS.map((island) => {
    const pts = island.points
      .map(([lon, lat]) => {
        const [x, y] = project(lon, lat);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
    return `<polygon points="${pts}" fill="${palette.landFill}" stroke="${palette.landStroke}" stroke-width="1" stroke-linejoin="round" />`;
  }).join('\n');

  const schematicFaultsSvg = layers.schematicFaults
    ? FAULT_TRACES.map((trace: TectonicTrace) => {
        const d = trace.points
          .map(([lon, lat], idx) => {
            const [x, y] = project(lon, lat);
            return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
          })
          .join(' ');
        const stroke =
          trace.kind === 'boundary' ? palette.trenchStroke : palette.faultStroke;
        const dash = trace.kind === 'boundary' ? '5 3' : '4 2.5';
        return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="1.3" stroke-dasharray="${dash}" opacity="0.85" />`;
      }).join('\n')
    : '';

  // Optional GIS active faults clipped strictly to bbox (only when explicitly loaded)
  let gisFaultsRenderedCount = 0;
  let gisFaultsSvg = '';
  if (gisFaultsRequestedAndReady && options.gisActiveFaultsData) {
    const segments: string[] = [];
    for (const feature of options.gisActiveFaultsData.features) {
      if (!Array.isArray(feature.bbox) || feature.bbox.length < 4) continue;
      const [fMinLon, fMinLat, fMaxLon, fMaxLat] = feature.bbox;
      if (fMaxLon < minLon || fMinLon > maxLon || fMaxLat < minLat || fMinLat > maxLat) {
        continue;
      }
      if (feature.properties.fault_category !== 'Active Fault') continue;
      gisFaultsRenderedCount++;
      const lines =
        feature.geometry.type === 'LineString'
          ? [feature.geometry.coordinates]
          : feature.geometry.coordinates;
      for (const line of lines) {
        const d = line
          .map(([lon, lat], idx) => {
            const [x, y] = project(lon, lat);
            return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
          })
          .join(' ');
        segments.push(
          `<path d="${d}" fill="none" stroke="${palette.gisFaultStroke}" stroke-width="1.15" ${
            feature.isUncertainTrace ? 'stroke-dasharray="3 2"' : ''
          } opacity="0.82" />`
        );
      }
      if (segments.length >= 900) break;
    }
    gisFaultsSvg = segments.join('\n');
  }

  // City pins within viewport (merge verified nearestCitiesPins + built-in reference cities, deduplicated)
  const cityPinsToRender: Array<{ name: string; lat: number; lon: number; isNearest: boolean }> = [];
  if (layers.nearestLocalities) {
    const seenCity = new Set<string>();
    for (const pin of options.nearestCitiesPins ?? []) {
      if (
        pin.lon >= minLon + 0.12 &&
        pin.lon <= maxLon - 0.12 &&
        pin.lat >= minLat + 0.12 &&
        pin.lat <= maxLat - 0.12
      ) {
        const key = pin.name.trim().toLowerCase();
        if (!seenCity.has(key)) {
          seenCity.add(key);
          cityPinsToRender.push({
            name: pin.name,
            lat: pin.lat,
            lon: pin.lon,
            isNearest: true,
          });
        }
      }
    }
    for (const refCity of REFERENCE_PH_CITIES) {
      if (
        refCity.lon >= minLon + 0.25 &&
        refCity.lon <= maxLon - 0.25 &&
        refCity.lat >= minLat + 0.25 &&
        refCity.lat <= maxLat - 0.25
      ) {
        const key = refCity.name.trim().toLowerCase();
        if (!seenCity.has(key) && cityPinsToRender.length < 10) {
          seenCity.add(key);
          cityPinsToRender.push({
            name: refCity.name,
            lat: refCity.lat,
            lon: refCity.lon,
            isNearest: false,
          });
        }
      }
    }
  }

  const citiesSvg = cityPinsToRender
    .map((c, idx) => {
      const [cx, cy] = project(c.lon, c.lat);
      const dy = idx % 2 === 0 ? -6 : 11;
      return `
        <g>
          <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${c.isNearest ? 3 : 2.3}" fill="${palette.cityDot}" stroke="#ffffff" stroke-width="0.8" />
          <text x="${(cx + 5).toFixed(1)}" y="${(cy + dy).toFixed(1)}" font-size="9" font-weight="${c.isNearest ? '700' : '500'}" font-family="Segoe UI, Arial, sans-serif" fill="${palette.cityText}" stroke="#ffffff" stroke-width="2.2" paint-order="stroke">${escapeXml(c.name)}</text>
        </g>
      `;
    })
    .join('\n');

  // Optional Seismic Stations
  const stationsSvg = layers.stations
    ? event.picks
        .filter((p) => isValidGeographicCoordinate(p.lat, p.lon))
        .map((p) => {
          const [sx, sy] = project(p.lon, p.lat);
          if (sx < padL || sx > padL + plotW || sy < padT || sy > padT + plotH) return '';
          const fill = p.pExcluded ? '#94a3b8' : palette.stationFill;
          return `
            <g>
              <polygon points="${sx.toFixed(1)},${(sy - 4.5).toFixed(1)} ${(sx - 4).toFixed(1)},${(sy + 3.2).toFixed(1)} ${(sx + 4).toFixed(1)},${(sy + 3.2).toFixed(1)}" fill="${fill}" stroke="#ffffff" stroke-width="0.8" />
              <text x="${(sx + 5).toFixed(1)}" y="${(sy + 3).toFixed(1)}" font-size="8" font-family="Consolas, monospace" font-weight="700" fill="#0f172a" stroke="#ffffff" stroke-width="2" paint-order="stroke">${escapeXml(p.sta)}</text>
            </g>
          `;
        })
        .join('\n')
    : '';

  // Optional Main Office bearing vector
  let officeSvg = '';
  if (layers.mainOfficeVector && options.mainOffice) {
    const office = options.mainOffice;
    const [ox, oy] = project(office.lon, office.lat);
    const info = computeDistanceAndBearing(
      office.lat,
      office.lon,
      event.lat,
      event.lon
    );
    officeSvg = `
      <line x1="${ox.toFixed(1)}" y1="${oy.toFixed(1)}" x2="${epiX.toFixed(1)}" y2="${epiY.toFixed(1)}" stroke="#0284c7" stroke-width="1.2" stroke-dasharray="4 3" />
      <rect x="${(ox - 3).toFixed(1)}" y="${(oy - 3).toFixed(1)}" width="6" height="6" fill="#0284c7" stroke="#ffffff" stroke-width="0.8" />
      <text x="${(ox + 6).toFixed(1)}" y="${(oy + 3).toFixed(1)}" font-size="8.5" font-weight="600" font-family="Segoe UI, Arial, sans-serif" fill="#0369a1" stroke="#ffffff" stroke-width="2" paint-order="stroke">${escapeXml(office.code)} (${Math.round(info.distKm)} km)</text>
    `;
  }

  // Epicenter 5-point Star Marker + Coordinate Callout
  const starPts = createStarPolygonPoints(epiX, epiY, 10, 4.4);
  const calloutLabel = `${magLabel ? `${magLabel} · ` : ''}${event.lat.toFixed(2)}°N, ${event.lon.toFixed(2)}°E`;
  const calloutPlaceRight = epiX < padL + plotW * 0.68;
  const calloutX = calloutPlaceRight ? epiX + 13 : epiX - 13;
  const calloutAnchor = calloutPlaceRight ? 'start' : 'end';

  const epicenterSvg = `
    <g>
      <circle cx="${epiX.toFixed(1)}" cy="${epiY.toFixed(1)}" r="15" fill="none" stroke="${palette.starFill}" stroke-opacity="0.35" stroke-width="1.2" />
      <polygon points="${starPts}" fill="${palette.starFill}" stroke="${palette.starStroke}" stroke-width="1.1" />
      <text x="${calloutX.toFixed(1)}" y="${(epiY - 3).toFixed(1)}" text-anchor="${calloutAnchor}" font-size="9.5" font-weight="700" font-family="Consolas, monospace" fill="#0f172a" stroke="#ffffff" stroke-width="2.6" paint-order="stroke">${escapeXml(calloutLabel)}</text>
      <text x="${calloutX.toFixed(1)}" y="${(epiY + 9).toFixed(1)}" text-anchor="${calloutAnchor}" font-size="8.5" font-weight="600" font-family="Consolas, monospace" fill="#334155" stroke="#ffffff" stroke-width="2.4" paint-order="stroke">Depth ${event.depthKm.toFixed(1)} km</text>
    </g>
  `;

  // North Arrow (top-right inside plot) & Cartographic Scale Bar (bottom-left inside plot)
  const northX = padL + plotW - 22;
  const northY = padT + 24;
  const scaleX = padL + 12;
  const scaleY = padT + plotH - 26;

  // Build Data Sources list accurately reflecting only what was actually rendered
  const dataSources: string[] = [
    'Built-in EQP Philippine Coastline Polygons (EPSG:4326)',
  ];
  if (layers.schematicFaults) {
    dataSources.push('Built-in EQP Schematic Faults & Trenches (reference only)');
  }
  if (gisFaultsRequestedAndReady) {
    dataSources.push(
      `GIS Active Faults (${gisFaultsRenderedCount} clipped traces from active_faults.geojson — candidate overlay pending provenance approval)`
    );
  }
  if (layers.nearestLocalities) {
    dataSources.push(
      `Localities (${cityPinsToRender.length} verified/reference city markers)`
    );
  }
  if (layers.stations) {
    dataSources.push(`Seismic Stations (${event.picks.length} event pick locations)`);
  }

  // Self-contained Legend & Attribution Box below plot
  const legendItems: string[] = [
    `<g transform="translate(${padL + 14}, ${legendTop + 16})"><polygon points="${createStarPolygonPoints(0, 0, 5.5, 2.5)}" fill="${palette.starFill}" stroke="#0f172a" stroke-width="0.6" /><text x="11" y="3" font-size="9" font-family="Segoe UI, Arial, sans-serif" fill="#0f172a">Epicenter (${escapeXml(magLabel ?? 'Mag Pending')})</text></g>`,
  ];
  if (layers.nearestLocalities) {
    legendItems.push(
      `<g transform="translate(${padL + 168}, ${legendTop + 16})"><circle cx="0" cy="0" r="3" fill="${palette.cityDot}" /><text x="9" y="3" font-size="9" font-family="Segoe UI, Arial, sans-serif" fill="#0f172a">City / Locality Reference</text></g>`
    );
  }
  if (layers.schematicFaults) {
    legendItems.push(
      `<g transform="translate(${padL + 320}, ${legendTop + 16})"><line x1="-6" y1="0" x2="10" y2="0" stroke="${palette.faultStroke}" stroke-width="1.4" stroke-dasharray="4 2" /><text x="15" y="3" font-size="9" font-family="Segoe UI, Arial, sans-serif" fill="#0f172a">Schematic Fault</text></g>`
    );
    legendItems.push(
      `<g transform="translate(${padL + 432}, ${legendTop + 16})"><line x1="-6" y1="0" x2="10" y2="0" stroke="${palette.trenchStroke}" stroke-width="1.4" stroke-dasharray="5 3" /><text x="15" y="3" font-size="9" font-family="Segoe UI, Arial, sans-serif" fill="#0f172a">Schematic Trench</text></g>`
    );
  }
  if (layers.stations) {
    legendItems.push(
      `<g transform="translate(${padL + 550}, ${legendTop + 16})"><polygon points="0,-4 -3.5,3 3.5,3" fill="${palette.stationFill}" /><text x="9" y="3" font-size="9" font-family="Segoe UI, Arial, sans-serif" fill="#0f172a">Station</text></g>`
    );
  }

  const staleNoticeSvg =
    solutionMeta.status === 'stale'
      ? `<rect x="${padL + 8}" y="${padT + 8}" width="318" height="20" rx="2" fill="#fffbeb" stroke="#f59e0b" stroke-width="0.9" /><text x="${padL + 15}" y="${padT + 21}" font-size="8.5" font-weight="700" font-family="Segoe UI, Arial, sans-serif" fill="#92400e">STALE SOURCE SOLUTION — RE-RUN LOCATE &amp; REFRESH FIGURE</text>`
      : '';

  const svgMarkup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" role="img" aria-label="${escapeXml(
    `Earthquake epicenter map for ${event.id} at ${event.lat.toFixed(2)}°N, ${event.lon.toFixed(2)}°E`
  )}" style="background:${palette.outerBg};display:block;max-width:100%;height:auto;">
  <defs>
    <clipPath id="${clipId}">
      <rect x="${padL}" y="${padT}" width="${plotW}" height="${plotH}" />
    </clipPath>
  </defs>
  <rect x="0" y="0" width="${svgW}" height="${svgH}" fill="${palette.outerBg}" />
  <text x="${padL}" y="15" font-size="10.5" font-weight="700" font-family="Segoe UI, Arial, sans-serif" fill="#0f172a">${escapeXml(
    `EPICENTER & GEOGRAPHIC CONTEXT MAP — EVENT ${event.id} (B${event.bulletinNo})`
  )}</text>
  ${ticksSvg}
  <g clip-path="url(#${clipId})">
    <rect x="${padL}" y="${padT}" width="${plotW}" height="${plotH}" fill="${palette.seaFill}" />
    ${gridSvg}
    ${islandsSvg}
    ${schematicFaultsSvg}
    ${gisFaultsSvg}
    ${officeSvg}
    ${citiesSvg}
    ${stationsSvg}
    ${epicenterSvg}
    ${staleNoticeSvg}
    <g transform="translate(${northX}, ${northY})">
      <circle cx="0" cy="0" r="14" fill="rgba(255,255,255,0.9)" stroke="#334155" stroke-width="0.8" />
      <polygon points="0,-9 -4.2,3.5 0,0.8 4.2,3.5" fill="#0f172a" />
      <text x="0" y="10.5" text-anchor="middle" font-size="7.5" font-weight="700" font-family="Segoe UI, Arial, sans-serif" fill="#0f172a">N</text>
    </g>
    <g transform="translate(${scaleX}, ${scaleY})">
      <rect x="-6" y="-12" width="${(scalePx + 18).toFixed(1)}" height="28" rx="2" fill="rgba(255,255,255,0.92)" stroke="#334155" stroke-width="0.7" />
      <text x="${(scalePx / 2).toFixed(1)}" y="-2" text-anchor="middle" font-size="8.5" font-weight="700" font-family="Consolas, monospace" fill="#0f172a">0 — ${scaleKm} km</text>
      <rect x="0" y="3" width="${(scalePx / 2).toFixed(1)}" height="5" fill="#0f172a" stroke="#0f172a" stroke-width="0.6" />
      <rect x="${(scalePx / 2).toFixed(1)}" y="3" width="${(scalePx / 2).toFixed(1)}" height="5" fill="#ffffff" stroke="#0f172a" stroke-width="0.6" />
    </g>
  </g>
  <rect x="${padL}" y="${padT}" width="${plotW}" height="${plotH}" fill="none" stroke="${palette.frameStroke}" stroke-width="1.2" />
  <rect x="${padL}" y="${legendTop}" width="${plotW}" height="64" fill="${palette.legendBg}" stroke="${palette.legendBorder}" stroke-width="0.9" />
  ${legendItems.join('\n  ')}
  <text x="${padL + 12}" y="${legendTop + 36}" font-size="8.5" font-family="Segoe UI, Arial, sans-serif" fill="#334155">${escapeXml(
    `Sources: ${dataSources.join(' · ')}`
  )}</text>
  <text x="${padL + 12}" y="${legendTop + 51}" font-size="8.5" font-weight="600" font-family="Segoe UI, Arial, sans-serif" fill="#475569">${escapeXml(
    `Note: ${NON_CAUSAL_DISCLAIMER}`
  )}</text>
</svg>`;

  const headlineLoc =
    options.primaryLocationLabel && options.primaryLocationLabel !== 'Location pending'
      ? ` near ${options.primaryLocationLabel}`
      : '';
  const defaultCaption = `Figure 1. Epicenter location (${event.lat.toFixed(3)}°N, ${event.lon.toFixed(
    3
  )}°E, depth ${event.depthKm.toFixed(1)} km${magLabel ? `, ${magLabel}` : ''})${headlineLoc}. ${NON_CAUSAL_DISCLAIMER}`;

  const reviewStatus: PrimerMapFigureRecord['reviewStatus'] =
    solutionMeta.status === 'stale' ||
    solutionMeta.status === 'adopted-unverified-model' ||
    gisFaultsRequestedAndReady ||
    unavailableLayers.length > 0
      ? 'requires-scientific-review'
      : 'ready-for-review';

  return {
    status: 'ready',
    reviewStatus,
    extent,
    theme,
    layers,
    bbox: { minLon, maxLon, minLat, maxLat },
    scaleBarKm: scaleKm,
    svgMarkup,
    caption: options.customCaption?.trim() || defaultCaption,
    provenance: {
      sourceEventFingerprint: fingerprint,
      generatedAt: nowIso,
      sourceSolutionStatus: solutionMeta.status,
      sourceSolutionNote: solutionMeta.note,
      basemapSource: 'Built-in EQP Philippine Coastline Vector (EPSG:4326)',
      dataSources,
      unavailableLayers,
      nonCausalDisclaimer: NON_CAUSAL_DISCLAIMER,
    },
  };
}

/**
 * Rasterizes our self-contained pure-vector SVG string into a PNG Data URL in the browser.
 * Safe from CORS tainting because no external tiles or remote URLs exist in the SVG.
 */
export async function rasterizePrimerSvgToPng(
  svgMarkup: string,
  width = 1520,
  height = 1096
): Promise<string | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined' || !svgMarkup.trim()) {
    return null;
  }

  const loadImage = (src: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = async () => {
        try {
          if (typeof el.decode === 'function') {
            await el.decode().catch(() => undefined);
          }
        } finally {
          resolve(el);
        }
      };
      el.onerror = (err) => reject(err);
      el.src = src;
    });

  const svgBlob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
  const blobUrl = URL.createObjectURL(svgBlob);
  try {
    let img: HTMLImageElement;
    try {
      img = await loadImage(blobUrl);
    } catch {
      const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;
      img = await loadImage(dataUrl);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

/**
 * Deterministic Canvas fallback renderer for jsPDF when rasterized PNG isn't cached yet.
 */
export function renderPrimerMapCanvasFallback(
  event: EQPEvent,
  figure: PrimerMapFigureRecord
): string {
  if (typeof document === 'undefined' || figure.status !== 'ready' || !figure.bbox) {
    return '';
  }
  const width = 1040;
  const height = 700;
  const plotL = 62;
  const plotT = 44;
  const plotW = width - 124;
  const plotH = 540;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const { minLon, maxLon, minLat, maxLat } = figure.bbox;
  const project = (lon: number, lat: number): [number, number] => [
    plotL + ((lon - minLon) / Math.max(0.25, maxLon - minLon)) * plotW,
    plotT + ((maxLat - lat) / Math.max(0.25, maxLat - minLat)) * plotH,
  ];

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText(
    `EPICENTER & GEOGRAPHIC CONTEXT MAP — EVENT ${event.id} (B${event.bulletinNo})`,
    plotL,
    26
  );

  ctx.save();
  ctx.beginPath();
  ctx.rect(plotL, plotT, plotW, plotH);
  ctx.clip();

  ctx.fillStyle = figure.theme === 'print-bw' ? '#f8fafc' : '#dceefb';
  ctx.fillRect(plotL, plotT, plotW, plotH);

  ISLAND_POLYGONS.forEach((island) => {
    ctx.beginPath();
    island.points.forEach(([lon, lat], idx) => {
      const [x, y] = project(lon, lat);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = figure.theme === 'print-bw' ? '#e2e8f0' : '#f4f1ea';
    ctx.fill();
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  });

  if (figure.layers.schematicFaults) {
    ctx.save();
    ctx.setLineDash([7, 4]);
    FAULT_TRACES.forEach((t) => {
      ctx.beginPath();
      t.points.forEach(([lon, lat], idx) => {
        const [x, y] = project(lon, lat);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle =
        t.kind === 'boundary'
          ? figure.theme === 'print-bw'
            ? '#475569'
            : '#6d28d9'
          : figure.theme === 'print-bw'
            ? '#0f172a'
            : '#dc2626';
      ctx.lineWidth = 1.8;
      ctx.stroke();
    });
    ctx.restore();
  }

  const centerLon = isEventUnlocated(event) ? DEFAULT_PH_CENTER.lon : event.lon;
  const centerLat = isEventUnlocated(event) ? DEFAULT_PH_CENTER.lat : event.lat;
  const [ex, ey] = project(centerLon, centerLat);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 14 : 6;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    const x = ex + r * Math.cos(angle);
    const y = ey + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = figure.theme === 'print-bw' ? '#0f172a' : '#dc2626';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.restore();

  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.6;
  ctx.strokeRect(plotL, plotT, plotW, plotH);

  ctx.fillStyle = '#334155';
  ctx.font = '12px sans-serif';
  ctx.fillText(
    `Sources: ${figure.provenance.dataSources.join(' · ')}`,
    plotL,
    plotT + plotH + 34
  );
  ctx.fillText(`Note: ${figure.provenance.nonCausalDisclaimer}`, plotL, plotT + plotH + 56);

  return canvas.toDataURL('image/png');
}
