import {
  ACTIVE_VOLCANOES,
  DEFAULT_PH_CENTER,
  EQPEvent,
  FAULT_TRACES,
  ISLAND_POLYGONS,
  isEventUnlocated,
  StationMeta,
  StationPick,
  TECTONIC_PLATES,
} from '../data/eqpData';
import type { VisibleTimelineEvent } from './epicenterTimeline';
import type {
  ActiveFaultsDataset,
  GeologyLayerVisibility,
  TrenchSystemsDataset,
} from './geologyLayers';
import type { HistoricalEarthquakeRecord } from './historicalSeismicity';
import type { MapViewportState } from './maps/basemapConfig';
import {
  computeMapScaleBarMetrics,
  computeWebMercatorMetersPerPixel,
} from './maps/scaleBar';
import {
  computeDistanceAndBearing,
  type MainOfficeLocation,
} from './nearestPlaces';
import type { PeisBandCode, ShakeMapResult } from './shakemap';
import {
  stationMetaMatchesRegion,
  stationPickMatchesRegion,
  type StationRegionFilter,
} from './stationRegions';

export type RulerMeasurementResult = ReturnType<typeof computeDistanceAndBearing>;
export type MapSnapshotStyleMode = 'terrain' | 'satellite' | 'hybrid' | 'roadmap';

export interface MapSnapshotDepthDiagnostics {
  hostingLayerLabel: string;
  nearestBoundaryLabel: string;
  trialDeltaLabel: string;
  assessment: string;
  status: string;
  depthConstraintRatio: number;
  trialDepthKm: number;
}

export interface MapSnapshotCaptureResult {
  engine: 'vector' | 'maplibre' | 'google' | '3d';
  canvas?: HTMLCanvasElement | null;
  cssWidth?: number;
  cssHeight?: number;
  projectLonLat?: (lon: number, lat: number) => [number, number];
  viewport?: MapViewportState;
  metersPerPixel?: number;
  basemapLabel?: string;
  mapStyleMode?: MapSnapshotStyleMode;
  showMainOffice?: boolean;
  showNetworkCoverage?: boolean;
  depthDiagnostics?: MapSnapshotDepthDiagnostics;
  strataMode?: string;
  verticalExag?: number;
  showSlab?: boolean;
  showRays?: boolean;
}

export type MapSnapshotProvider = () => Promise<MapSnapshotCaptureResult | null>;

export interface MapSnapshotComparisonMarker {
  modelId: string;
  label: string;
  lat: number;
  lon: number;
  color: string;
}

export interface MapSnapshotNearestCityPin {
  name: string;
  lat: number;
  lon: number;
  distanceKm: number;
  bearing: string;
}

export interface MapSnapshotPanelInput {
  titleBadge?: string;
  subtitle?: string;
  shakeMap: ShakeMapResult | null;
  capture: MapSnapshotCaptureResult | null;
}

export interface MapSnapshotExportOptions {
  event: EQPEvent;
  stations: StationMeta[];
  selectedStation: string | null;
  basemapLabel: string;
  viewDimension: '2d' | '3d';
  mapStyleMode: MapSnapshotStyleMode;
  viewport: MapViewportState;
  showFaults: boolean;
  showVolcanoes: boolean;
  showPlates: boolean;
  showStations: boolean;
  showGrid: boolean;
  regionFilter: StationRegionFilter;
  showShakeMap: boolean;
  shakeMapOpacity: number;
  visibleShakeBands: Record<PeisBandCode, boolean>;
  highlightedShakeBand: PeisBandCode | null;
  mainOffice: MainOfficeLocation;
  showRangeRings: boolean;
  showNearestPlaces: boolean;
  nearestCitiesPins: MapSnapshotNearestCityPin[];
  showCatalogEvents: boolean;
  catalogEvents: EQPEvent[];
  rulerPoints: {
    start: { lat: number; lon: number } | null;
    end: { lat: number; lon: number } | null;
  };
  rulerMeasurement: RulerMeasurementResult | null;
  comparisonMarkers?: MapSnapshotComparisonMarker[];
  geologyVisibility: GeologyLayerVisibility;
  gisActiveFaultsData: ActiveFaultsDataset | null;
  gisTrenchData: TrenchSystemsDataset | null;
  timelineEvents: VisibleTimelineEvent[];
  showTimelineMigration: boolean;
  selectedTimelineEventId: string | null;
  showSeismicityTrendOverlay?: boolean;
  historicalTrendEvents?: HistoricalEarthquakeRecord[];
  panels: MapSnapshotPanelInput[];
}

export interface MapLegendItem {
  label: string;
  swatchKind: 'star' | 'circle' | 'square' | 'diamond' | 'line-solid' | 'line-dashed' | 'box';
  color: string;
  borderColor?: string;
}

const FONT_SANS =
  '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const FONT_MONO =
  '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

const CART_THEMES: Record<
  MapSnapshotStyleMode,
  {
    sea: string;
    grid: string;
    gridLabel: string;
    land: string;
    landStroke: string;
    fault: string;
    plateStroke: string;
    stationText: string;
    volcanoText: string;
    cityDot: string;
    cityText: string;
    attributionBg: string;
    attributionText: string;
  }
> = {
  terrain: {
    sea: '#d8effc',
    grid: '#bae6fd',
    gridLabel: '#475569',
    land: '#eef2e6',
    landStroke: '#64748b',
    fault: '#e11d48',
    plateStroke: '#4f46e5',
    stationText: '#0f172a',
    volcanoText: '#9a3412',
    cityDot: '#0f766e',
    cityText: '#115e59',
    attributionBg: 'rgba(255,255,255,0.88)',
    attributionText: '#334155',
  },
  satellite: {
    sea: '#0a192f',
    grid: '#1e3a5f',
    gridLabel: '#93c5fd',
    land: '#1e3a2f',
    landStroke: '#4ade80',
    fault: '#fb7185',
    plateStroke: '#818cf8',
    stationText: '#f8fafc',
    volcanoText: '#ffedd5',
    cityDot: '#cbd5e1',
    cityText: '#f1f5f9',
    attributionBg: 'rgba(15,23,42,0.84)',
    attributionText: '#e2e8f0',
  },
  hybrid: {
    sea: '#0f233c',
    grid: '#274c77',
    gridLabel: '#bfdbfe',
    land: '#243b30',
    landStroke: '#86efac',
    fault: '#f43f5e',
    plateStroke: '#a5b4fc',
    stationText: '#f8fafc',
    volcanoText: '#ffffff',
    cityDot: '#fde047',
    cityText: '#f8fafc',
    attributionBg: 'rgba(15,23,42,0.84)',
    attributionText: '#e2e8f0',
  },
  roadmap: {
    sea: '#dbeafe',
    grid: '#bfdbfe',
    gridLabel: '#334155',
    land: '#f8fafc',
    landStroke: '#94a3b8',
    fault: '#dc2626',
    plateStroke: '#4338ca',
    stationText: '#0f172a',
    volcanoText: '#78350f',
    cityDot: '#0f766e',
    cityText: '#0f172a',
    attributionBg: 'rgba(255,255,255,0.88)',
    attributionText: '#334155',
  },
};

export function buildMapSnapshotFilename(event: EQPEvent, suffix = 'map_snapshot'): string {
  const rawBase = (event.filename || event.id || 'EQP_Event').replace(/\.eqp$/i, '');
  const safeBase = rawBase.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'EQP_Event';
  return `${safeBase}_${suffix}.png`;
}

export function getActiveMagnitude(event: EQPEvent): number {
  if (event.preferredScale === 'Ms') return event.ms;
  if (event.preferredScale === 'Mb') return event.mb;
  return event.md;
}

export function getStationResidualHex(pick: StationPick): string {
  if (pick.pExcluded) return '#94a3b8';
  const maxRes = Math.max(Math.abs(pick.resP), Math.abs(pick.resS));
  if (maxRes >= 1.0) return '#dc2626';
  if (maxRes > 0.5) return '#d97706';
  return '#2563eb';
}

function latToMercatorY(latDeg: number): number {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, latDeg));
  const rad = (clamped * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + rad / 2));
}

export function buildMercatorProjector(
  viewport: MapViewportState,
  width: number,
  height: number
): {
  project: (lon: number, lat: number) => [number, number];
  unproject: (x: number, y: number) => [number, number];
  metersPerPixel: number;
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
} {
  const worldSize = 256 * Math.pow(2, Math.max(1, Math.min(20, viewport.zoom)));
  const scaleFactor = width / Math.max(320, 820);
  const pxPerRadLon = (worldSize * scaleFactor) / (2 * Math.PI);
  const centerX = ((viewport.lon + 180) / 360) * worldSize * scaleFactor;
  const centerMercY = latToMercatorY(viewport.lat);
  const halfW = width / 2;
  const halfH = height / 2;

  const project = (lon: number, lat: number): [number, number] => {
    const wx = ((lon + 180) / 360) * worldSize * scaleFactor;
    const x = halfW + (wx - centerX);
    const y = halfH - (latToMercatorY(lat) - centerMercY) * pxPerRadLon;
    return [x, y];
  };

  const unproject = (x: number, y: number): [number, number] => {
    const wx = centerX + (x - halfW);
    const lon = (wx / (worldSize * scaleFactor)) * 360 - 180;
    const mercY = centerMercY + (halfH - y) / pxPerRadLon;
    const lat = (2 * Math.atan(Math.exp(mercY)) - Math.PI / 2) * (180 / Math.PI);
    return [lon, lat];
  };

  const [minLon, maxLat] = unproject(0, 0);
  const [maxLon, minLat] = unproject(width, height);
  const metersPerPixel = computeWebMercatorMetersPerPixel(viewport.lat, viewport.zoom) / scaleFactor;

  return {
    project,
    unproject,
    metersPerPixel,
    minLon,
    maxLon,
    minLat,
    maxLat,
  };
}

export function drawGisLayersToCanvas(
  ctx: CanvasRenderingContext2D,
  options: {
    project: (lon: number, lat: number) => [number, number];
    minLon: number;
    maxLon: number;
    minLat: number;
    maxLat: number;
    scale: number;
    geologyVisibility: GeologyLayerVisibility;
    gisActiveFaultsData: ActiveFaultsDataset | null;
    gisTrenchData: TrenchSystemsDataset | null;
  }
): void {
  const {
    project,
    minLon,
    maxLon,
    minLat,
    maxLat,
    scale,
    geologyVisibility,
    gisActiveFaultsData,
    gisTrenchData,
  } = options;

  if (
    !geologyVisibility.activeFaults &&
    !geologyVisibility.potentiallyActiveFaults &&
    !geologyVisibility.trenches
  ) {
    return;
  }

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const drawLines = (
    lines: Array<Array<[number, number]>>,
    strokeStyle: string,
    lineWidth: number,
    dash: number[],
    alpha: number
  ) => {
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth * scale;
    ctx.globalAlpha = alpha;
    ctx.setLineDash(dash.map((d) => d * scale));
    ctx.beginPath();
    for (const line of lines) {
      if (line.length < 2) continue;
      const [x0, y0] = project(line[0][0], line[0][1]);
      ctx.moveTo(x0, y0);
      for (let i = 1; i < line.length; i++) {
        const [xi, yi] = project(line[i][0], line[i][1]);
        ctx.lineTo(xi, yi);
      }
    }
    ctx.stroke();
  };

  if (geologyVisibility.trenches && gisTrenchData) {
    for (const feat of gisTrenchData.features) {
      const [fMinLon, fMinLat, fMaxLon, fMaxLat] = feat.bbox;
      if (fMaxLon < minLon || fMinLon > maxLon || fMaxLat < minLat || fMinLat > maxLat) {
        continue;
      }
      const lines =
        feat.geometry.type === 'LineString'
          ? [feat.geometry.coordinates]
          : feat.geometry.coordinates;
      if (feat.kind === 'trough') {
        drawLines(lines, '#0d9488', 2.0, [7, 4], 0.9);
      } else if (feat.kind === 'transform_fault') {
        drawLines(lines, '#7c3aed', 2.0, [3, 3], 0.9);
      } else {
        drawLines(lines, '#3730a3', 2.3, [], 0.92);
      }
    }
  }

  if (geologyVisibility.potentiallyActiveFaults && gisActiveFaultsData) {
    const certainLines: Array<Array<[number, number]>> = [];
    const uncertainLines: Array<Array<[number, number]>> = [];
    for (const feat of gisActiveFaultsData.features) {
      if (feat.properties.fault_category !== 'Potentially Active Fault') continue;
      const [fMinLon, fMinLat, fMaxLon, fMaxLat] = feat.bbox;
      if (fMaxLon < minLon || fMinLon > maxLon || fMaxLat < minLat || fMinLat > maxLat) {
        continue;
      }
      const lines =
        feat.geometry.type === 'LineString'
          ? [feat.geometry.coordinates]
          : feat.geometry.coordinates;
      if (feat.isUncertainTrace) {
        uncertainLines.push(...lines);
      } else {
        certainLines.push(...lines);
      }
    }
    if (certainLines.length > 0) drawLines(certainLines, '#d97706', 1.45, [6, 3.5], 0.92);
    if (uncertainLines.length > 0) drawLines(uncertainLines, '#d97706', 1.25, [2.2, 3.2], 0.8);
  }

  if (geologyVisibility.activeFaults && gisActiveFaultsData) {
    const certainLines: Array<Array<[number, number]>> = [];
    const uncertainLines: Array<Array<[number, number]>> = [];
    for (const feat of gisActiveFaultsData.features) {
      if (feat.properties.fault_category !== 'Active Fault') continue;
      const [fMinLon, fMinLat, fMaxLon, fMaxLat] = feat.bbox;
      if (fMaxLon < minLon || fMinLon > maxLon || fMaxLat < minLat || fMinLat > maxLat) {
        continue;
      }
      const lines =
        feat.geometry.type === 'LineString'
          ? [feat.geometry.coordinates]
          : feat.geometry.coordinates;
      if (feat.isUncertainTrace) {
        uncertainLines.push(...lines);
      } else {
        certainLines.push(...lines);
      }
    }
    if (certainLines.length > 0) drawLines(certainLines, '#e11d48', 1.55, [], 0.95);
    if (uncertainLines.length > 0) drawLines(uncertainLines, '#e11d48', 1.35, [5, 3.5], 0.8);
  }

  ctx.restore();
}

export async function rasterizeSvgElementToCanvas(
  svgEl: SVGSVGElement,
  targetWidth: number,
  targetHeight: number
): Promise<HTMLCanvasElement> {
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  clone.setAttribute('width', String(targetWidth));
  clone.setAttribute('height', String(targetHeight));

  // Ensure Tailwind font utility classes & SVG text render consistently outside document CSS
  const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  styleEl.textContent = `
    .font-mono { font-family: ${FONT_MONO}; }
    .font-sans { font-family: ${FONT_SANS}; }
  `;
  clone.insertBefore(styleEl, clone.firstChild);

  const xml = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Failed to rasterize map SVG layer'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
    }
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function drawBadgePill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  opts: {
    font: string;
    bg: string;
    border?: string;
    textColor: string;
    padX?: number;
    padY?: number;
    radius?: number;
    scale?: number;
    align?: 'left' | 'center' | 'right';
  }
): void {
  const s = opts.scale ?? 1;
  ctx.save();
  ctx.font = opts.font;
  const metrics = ctx.measureText(text);
  const padX = (opts.padX ?? 6) * s;
  const padY = (opts.padY ?? 3.5) * s;
  const fontPx = parseFloat(opts.font.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? '12');
  const boxW = metrics.width + padX * 2;
  const boxH = fontPx + padY * 2;
  const rx =
    opts.align === 'right'
      ? x - boxW
      : opts.align === 'center'
        ? x - boxW / 2
        : x;
  const ry = y - boxH / 2;

  drawRoundedRect(ctx, rx, ry, boxW, boxH, (opts.radius ?? 4) * s);
  ctx.fillStyle = opts.bg;
  ctx.fill();
  if (opts.border) {
    ctx.strokeStyle = opts.border;
    ctx.lineWidth = 1.2 * s;
    ctx.stroke();
  }
  ctx.fillStyle = opts.textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, rx + boxW / 2, y + 0.5 * s);
  ctx.restore();
}

/**
 * Draws all DOM/marker overlays cleanly onto a 2D canvas using projected coordinates.
 * Used on top of MapLibre WebGL captures (since DOM markers are outside the WebGL canvas)
 * and inside the full Web Mercator cartographic renderer.
 */
function drawProjectedMarkersAndBadges(
  ctx: CanvasRenderingContext2D,
  opts: {
    width: number;
    height: number;
    scale: number;
    project: (lon: number, lat: number) => [number, number];
    event: EQPEvent;
    stations: StationMeta[];
    selectedStation: string | null;
    regionFilter: StationRegionFilter;
    showVolcanoes: boolean;
    showStations: boolean;
    showNetworkCoverage?: boolean;
    showMainOffice: boolean;
    mainOffice: MainOfficeLocation;
    showRangeRings: boolean;
    showNearestPlaces: boolean;
    nearestCitiesPins: MapSnapshotNearestCityPin[];
    showCatalogEvents: boolean;
    catalogEvents: EQPEvent[];
    shakeMap: ShakeMapResult | null;
    showShakeMap: boolean;
    shakeMapOpacity: number;
    visibleShakeBands: Record<PeisBandCode, boolean>;
    highlightedShakeBand: PeisBandCode | null;
    rulerPoints: {
      start: { lat: number; lon: number } | null;
      end: { lat: number; lon: number } | null;
    };
    comparisonMarkers?: MapSnapshotComparisonMarker[];
    timelineEvents: VisibleTimelineEvent[];
    selectedTimelineEventId: string | null;
    drawStationRays?: boolean;
    drawOfficeVector?: boolean;
    drawRulerLine?: boolean;
    drawErrorCircle?: boolean;
    drawTimelinePath?: boolean;
    showTimelineMigration?: boolean;
  }
): void {
  const {
    width,
    height,
    scale: s,
    project,
    event,
    stations,
    selectedStation,
    regionFilter,
    showVolcanoes,
    showStations,
    showNetworkCoverage = false,
    showMainOffice,
    mainOffice,
    showRangeRings,
    showNearestPlaces,
    nearestCitiesPins,
    showCatalogEvents,
    catalogEvents,
    shakeMap,
    showShakeMap,
    shakeMapOpacity,
    visibleShakeBands,
    highlightedShakeBand,
    rulerPoints,
    comparisonMarkers = [],
    timelineEvents,
    selectedTimelineEventId,
    drawStationRays = false,
    drawOfficeVector = false,
    drawRulerLine = false,
    drawErrorCircle = false,
    drawTimelinePath = false,
    showTimelineMigration = false,
  } = opts;

  const unlocated = isEventUnlocated(event);
  const epiLat = unlocated ? DEFAULT_PH_CENTER.lat : event.lat;
  const epiLon = unlocated ? DEFAULT_PH_CENTER.lon : event.lon;
  const [epiX, epiY] = project(epiLon, epiLat);

  const stationMetaByCode: Record<string, StationMeta> = {};
  for (const st of stations) stationMetaByCode[st.code] = st;

  const visiblePicks = event.picks.filter((pick) =>
    stationPickMatchesRegion(pick, regionFilter, stationMetaByCode)
  );
  const pickedCodeSet = new Set(event.picks.map((p) => p.sta.toUpperCase()));

  // Optional vector lines if caller didn't already render them in WebGL
  if (drawErrorCircle && !unlocated) {
    const rKm = Math.max(1, event.errKm);
    const latDeg = rKm / 111.32;
    const lonDeg = rKm / (111.32 * Math.max(0.25, Math.cos((event.lat * Math.PI) / 180)));
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      const [px, py] = project(event.lon + Math.cos(a) * lonDeg, event.lat + Math.sin(a) * latDeg);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(220, 38, 38, 0.14)';
    ctx.fill();
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 1.4 * s;
    ctx.stroke();
    ctx.restore();
  }

  if (drawStationRays && showStations && !unlocated) {
    ctx.save();
    for (const pick of visiblePicks) {
      if (pick.pExcluded) continue;
      const [sx, sy] = project(pick.lon, pick.lat);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(epiX, epiY);
      ctx.strokeStyle = getStationResidualHex(pick);
      ctx.globalAlpha = 0.42;
      ctx.lineWidth = 1.35 * s;
      ctx.stroke();
    }
    ctx.restore();
  }

  if (drawOfficeVector && showMainOffice && !unlocated) {
    const [ox, oy] = project(mainOffice.lon, mainOffice.lat);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(epiX, epiY);
    ctx.strokeStyle = '#059669';
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 1.8 * s;
    ctx.setLineDash([5 * s, 4 * s]);
    ctx.stroke();
    ctx.restore();
  }

  if (drawTimelinePath && showTimelineMigration && timelineEvents.length >= 2) {
    ctx.save();
    ctx.beginPath();
    timelineEvents.forEach((tl, idx) => {
      const [tx, ty] = project(tl.lon, tl.lat);
      if (idx === 0) ctx.moveTo(tx, ty);
      else ctx.lineTo(tx, ty);
    });
    ctx.strokeStyle = '#0284c7';
    ctx.globalAlpha = 0.72;
    ctx.lineWidth = 1.8 * s;
    ctx.setLineDash([5 * s, 3 * s]);
    ctx.stroke();
    ctx.restore();
  }

  if (drawRulerLine && rulerPoints.start && rulerPoints.end) {
    const [ax, ay] = project(rulerPoints.start.lon, rulerPoints.start.lat);
    const [bx, by] = project(rulerPoints.end.lon, rulerPoints.end.lat);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.strokeStyle = '#7c3aed';
    ctx.lineWidth = 2.25 * s;
    ctx.setLineDash([6 * s, 3 * s]);
    ctx.stroke();
    ctx.restore();
  }

  // 1. ShakeMap centroid Roman numeral badges
  if (shakeMap && showShakeMap && shakeMapOpacity > 0) {
    for (const contour of shakeMap.contours) {
      if (visibleShakeBands[contour.band.roman] === false) continue;
      const [lblLon, lblLat] = contour.labelPoint ?? contour.centroid;
      if (!Number.isFinite(lblLon) || !Number.isFinite(lblLat)) continue;
      const [lx, ly] = project(lblLon, lblLat);
      if (lx < 10 * s || lx > width - 10 * s || ly < 10 * s || ly > height - 10 * s) continue;
      const isHighlighted =
        highlightedShakeBand === contour.band.roman && contour.isEpicentral !== false;
      const isDimmed =
        highlightedShakeBand !== null && highlightedShakeBand !== contour.band.roman;
      ctx.save();
      ctx.globalAlpha = isHighlighted
        ? 1
        : isDimmed
          ? 0.35
          : Math.min(1, 0.55 + shakeMapOpacity * 0.45);
      drawBadgePill(ctx, lx, ly, contour.band.roman, {
        font: `700 ${(isHighlighted ? 11.5 : 10) * s}px ${FONT_MONO}`,
        bg: 'rgba(255,255,255,0.92)',
        border: contour.band.strokeHex,
        textColor: contour.band.strokeHex,
        padX: 4.5,
        padY: 2.5,
        radius: 3,
        scale: s,
        align: 'center',
      });
      ctx.restore();
    }
  }

  // 2. Range ring labels
  if (showRangeRings && !unlocated) {
    for (const rKm of [50, 100, 200]) {
      const northLat = event.lat + rKm / 111.32;
      const [rx, ry] = project(event.lon, northLat);
      if (rx < -40 * s || rx > width + 40 * s || ry < -20 * s || ry > height + 20 * s) continue;
      drawBadgePill(ctx, rx, ry, `${rKm} km`, {
        font: `600 ${9.5 * s}px ${FONT_MONO}`,
        bg: 'rgba(255,255,255,0.9)',
        border: '#7dd3fc',
        textColor: '#075985',
        padX: 4.5,
        padY: 2.5,
        radius: 3.5,
        scale: s,
        align: 'center',
      });
    }
  }

  // 3. Nearest Cities
  if (showNearestPlaces) {
    for (const city of nearestCitiesPins) {
      const [cx, cy] = project(city.lon, city.lat);
      if (cx < -30 * s || cx > width + 30 * s || cy < -30 * s || cy > height + 30 * s) continue;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, 4 * s, 0, Math.PI * 2);
      ctx.fillStyle = '#0f766e';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.4 * s;
      ctx.stroke();
      ctx.restore();
      drawBadgePill(ctx, cx + 7 * s, cy, `${city.name} (${city.distanceKm} km)`, {
        font: `600 ${9.5 * s}px ${FONT_SANS}`,
        bg: 'rgba(240,253,250,0.94)',
        border: '#5eead4',
        textColor: '#134e4a',
        padX: 5,
        padY: 2.5,
        radius: 3.5,
        scale: s,
        align: 'left',
      });
    }
  }

  // 4. Active Volcanoes
  if (showVolcanoes) {
    for (const vol of ACTIVE_VOLCANOES) {
      const [vx, vy] = project(vol.lon, vol.lat);
      if (vx < -20 * s || vx > width + 20 * s || vy < -20 * s || vy > height + 20 * s) continue;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(vx, vy - 6.5 * s);
      ctx.lineTo(vx - 6 * s, vy + 4.5 * s);
      ctx.lineTo(vx + 6 * s, vy + 4.5 * s);
      ctx.closePath();
      ctx.fillStyle = '#ea580c';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.3 * s;
      ctx.stroke();
      ctx.restore();

      drawBadgePill(ctx, vx + 8 * s, vy, vol.name, {
        font: `600 ${9.5 * s}px ${FONT_SANS}`,
        bg: 'rgba(255,255,255,0.9)',
        border: '#fed7aa',
        textColor: '#9a3412',
        padX: 4.5,
        padY: 2.2,
        radius: 3,
        scale: s,
        align: 'left',
      });
    }
  }

  // 5. Catalog events
  if (showCatalogEvents) {
    for (const catEv of catalogEvents) {
      if (catEv.id === event.id || isEventUnlocated(catEv)) continue;
      const [cx, cy] = project(catEv.lon, catEv.lat);
      if (cx < -20 * s || cx > width + 20 * s || cy < -20 * s || cy > height + 20 * s) continue;
      const mag = getActiveMagnitude(catEv);
      const r = Math.max(4.5, Math.min(9.5, 2.5 + mag * 1.1)) * s;
      const depthHex =
        catEv.depthKm <= 30 ? '#f97316' : catEv.depthKm <= 100 ? '#eab308' : '#6366f1';
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = depthHex;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5 * s;
      ctx.stroke();
      ctx.restore();
      drawBadgePill(ctx, cx + r + 4 * s, cy, `M${mag.toFixed(1)}`, {
        font: `600 ${9.2 * s}px ${FONT_MONO}`,
        bg: 'rgba(255,255,255,0.92)',
        border: '#cbd5e1',
        textColor: '#1e293b',
        padX: 4,
        padY: 2,
        radius: 3,
        scale: s,
        align: 'left',
      });
    }
  }

  // 6. Main Office Marker
  if (showMainOffice) {
    const [ox, oy] = project(mainOffice.lon, mainOffice.lat);
    const distKm = !unlocated
      ? Math.round(computeDistanceAndBearing(mainOffice.lat, mainOffice.lon, event.lat, event.lon).distKm)
      : null;
    ctx.save();
    drawRoundedRect(ctx, ox - 6 * s, oy - 6 * s, 12 * s, 12 * s, 2.5 * s);
    ctx.fillStyle = '#059669';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.6 * s;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ox, oy, 2.1 * s, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();
    drawBadgePill(
      ctx,
      ox + 9 * s,
      oy,
      `${mainOffice.code}${distKm !== null ? ` · ${distKm} km` : ''}`,
      {
        font: `700 ${9.5 * s}px ${FONT_MONO}`,
        bg: 'rgba(6,78,59,0.92)',
        border: 'rgba(52,211,153,0.7)',
        textColor: '#ecfdf5',
        padX: 5.5,
        padY: 2.5,
        radius: 3.5,
        scale: s,
        align: 'left',
      }
    );
  }

  // 7. Network background coverage stations (optional)
  if (showNetworkCoverage) {
    const netStations = stations.filter(
      (st) =>
        st.status !== 'retired' &&
        !pickedCodeSet.has(st.code.toUpperCase()) &&
        stationMetaMatchesRegion(st, regionFilter)
    );
    for (const st of netStations) {
      const [nx, ny] = project(st.lon, st.lat);
      if (nx < -15 * s || nx > width + 15 * s || ny < -15 * s || ny > height + 15 * s) continue;
      ctx.save();
      ctx.globalAlpha = 0.78;
      ctx.beginPath();
      ctx.moveTo(nx, ny - 3.5 * s);
      ctx.lineTo(nx - 3.2 * s, ny + 2.5 * s);
      ctx.lineTo(nx + 3.2 * s, ny + 2.5 * s);
      ctx.closePath();
      ctx.fillStyle = st.networkType === 'volcanic' ? '#f97316' : st.networkType === 'strong_motion' ? '#475569' : '#0284c7';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.9 * s;
      ctx.stroke();
      ctx.restore();
    }
  }

  // 8. Seismic Stations
  if (showStations) {
    for (const pick of visiblePicks) {
      const [sx, sy] = project(pick.lon, pick.lat);
      if (sx < -25 * s || sx > width + 25 * s || sy < -25 * s || sy > height + 25 * s) continue;
      const isSelected = selectedStation === pick.sta;
      const colorHex = getStationResidualHex(pick);
      const r = (isSelected ? 7.2 : 6) * s;

      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(Math.PI / 4);
      drawRoundedRect(ctx, -r * 0.75, -r * 0.75, r * 1.5, r * 1.5, 1.5 * s);
      ctx.fillStyle = colorHex;
      ctx.fill();
      ctx.strokeStyle = isSelected ? '#0f172a' : '#ffffff';
      ctx.lineWidth = (isSelected ? 2 : 1.4) * s;
      ctx.stroke();
      ctx.restore();

      drawBadgePill(ctx, sx + 8.5 * s, sy, pick.sta, {
        font: `700 ${9.5 * s}px ${FONT_MONO}`,
        bg: isSelected ? '#0f172a' : 'rgba(255,255,255,0.95)',
        border: isSelected ? '#0f172a' : '#cbd5e1',
        textColor: isSelected ? '#ffffff' : '#1e293b',
        padX: 4.5,
        padY: 2.2,
        radius: 3,
        scale: s,
        align: 'left',
      });
    }
  }

  // 9. Animated Timeline Epicenters
  for (const tlEv of timelineEvents) {
    const [tx, ty] = project(tlEv.lon, tlEv.lat);
    if (tx < -24 * s || tx > width + 24 * s || ty < -24 * s || ty > height + 24 * s) continue;
    const isSel = selectedTimelineEventId === tlEv.id;
    const r = (isSel ? tlEv.radiusPx + 1.5 : tlEv.radiusPx) * s;
    ctx.save();
    if (tlEv.isRecentPulse || isSel) {
      ctx.beginPath();
      ctx.arc(tx, ty, r + 4.5 * s, 0, Math.PI * 2);
      ctx.strokeStyle = isSel ? '#0f172a' : tlEv.depthColor;
      ctx.globalAlpha = Math.max(0.42, tlEv.opacity * 0.75);
      ctx.lineWidth = 1.5 * s;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(tx, ty, r, 0, Math.PI * 2);
    ctx.fillStyle = tlEv.depthColor;
    ctx.globalAlpha = tlEv.opacity;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = isSel ? '#0f172a' : '#ffffff';
    ctx.lineWidth = (isSel ? 2 : 1.3) * s;
    ctx.stroke();
    ctx.restore();
  }

  // 10. Ruler P1 & P2 Pins
  if (rulerPoints.start) {
    const [ax, ay] = project(rulerPoints.start.lon, rulerPoints.start.lat);
    ctx.save();
    ctx.beginPath();
    ctx.arc(ax, ay, 5.8 * s, 0, Math.PI * 2);
    ctx.fillStyle = '#7c3aed';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.6 * s;
    ctx.stroke();
    ctx.restore();
    drawBadgePill(ctx, ax, ay - 15 * s, 'P1', {
      font: `700 ${9 * s}px ${FONT_MONO}`,
      bg: '#6d28d9',
      border: '#ffffff',
      textColor: '#ffffff',
      padX: 4.5,
      padY: 2,
      radius: 3,
      scale: s,
      align: 'center',
    });

    if (rulerPoints.end) {
      const [bx, by] = project(rulerPoints.end.lon, rulerPoints.end.lat);
      const info = computeDistanceAndBearing(
        rulerPoints.start.lat,
        rulerPoints.start.lon,
        rulerPoints.end.lat,
        rulerPoints.end.lon
      );
      ctx.save();
      ctx.beginPath();
      ctx.arc(bx, by, 5.8 * s, 0, Math.PI * 2);
      ctx.fillStyle = '#7c3aed';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.6 * s;
      ctx.stroke();
      ctx.restore();
      drawBadgePill(
        ctx,
        bx,
        by + 17 * s,
        `P2 · ${info.distKm.toFixed(1)} km · ${info.azimDeg.toFixed(1)}°`,
        {
          font: `700 ${9.2 * s}px ${FONT_MONO}`,
          bg: '#4c1d95',
          border: '#ffffff',
          textColor: '#ffffff',
          padX: 5.5,
          padY: 2.5,
          radius: 3.5,
          scale: s,
          align: 'center',
        }
      );
    }
  }

  // 11. Comparison Markers (if any)
  for (const cm of comparisonMarkers) {
    const [cx, cy] = project(cm.lon, cm.lat);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy - 7 * s);
    ctx.lineTo(cx + 7 * s, cy);
    ctx.lineTo(cx, cy + 7 * s);
    ctx.lineTo(cx - 7 * s, cy);
    ctx.closePath();
    ctx.fillStyle = cm.color;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.4 * s;
    ctx.stroke();
    ctx.restore();
    drawBadgePill(ctx, cx + 10 * s, cy, cm.label, {
      font: `700 ${9 * s}px ${FONT_MONO}`,
      bg: 'rgba(255,255,255,0.92)',
      border: cm.color,
      textColor: '#0f172a',
      padX: 4.5,
      padY: 2,
      radius: 3,
      scale: s,
      align: 'left',
    });
  }

  // 12. Epicenter Star Marker + Pill
  if (!unlocated) {
    const mag = getActiveMagnitude(event);
    ctx.save();
    ctx.beginPath();
    ctx.arc(epiX, epiY, 13 * s, 0, Math.PI * 2);
    ctx.fillStyle = '#dc2626';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.2 * s;
    ctx.stroke();

    // Crisp 5-point star inside badge
    ctx.beginPath();
    const outerR = 7.5 * s;
    const innerR = 3.4 * s;
    for (let i = 0; i < 10; i++) {
      const ang = -Math.PI / 2 + (i * Math.PI) / 5;
      const rad = i % 2 === 0 ? outerR : innerR;
      const sx = epiX + Math.cos(ang) * rad;
      const sy = epiY + Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();

    drawBadgePill(
      ctx,
      epiX,
      epiY + 23 * s,
      `${event.preferredScale} ${mag.toFixed(1)} · ${event.depthKm.toFixed(1)} km`,
      {
        font: `700 ${9.8 * s}px ${FONT_MONO}`,
        bg: 'rgba(15,23,42,0.92)',
        border: 'rgba(255,255,255,0.75)',
        textColor: '#ffffff',
        padX: 6,
        padY: 2.8,
        radius: 3.5,
        scale: s,
        align: 'center',
      }
    );
  }
}

/**
 * Full high-resolution Web Mercator cartographic canvas renderer.
 * Used for Google Maps (for ToS/CORS-compliant vector snapshot matching exact viewport)
 * and as a zero-failure fallback if WebGL canvas readback is unavailable.
 */
function renderMercatorCartographicCanvas(opts: {
  width: number;
  height: number;
  viewport: MapViewportState;
  styleMode: MapSnapshotStyleMode;
  panelShakeMap: ShakeMapResult | null;
  exportOpts: MapSnapshotExportOptions;
  showMainOffice: boolean;
}): { canvas: HTMLCanvasElement; metersPerPixel: number } {
  const { width, height, viewport, styleMode, panelShakeMap, exportOpts, showMainOffice } = opts;
  const s = width / 860;
  const theme = CART_THEMES[styleMode];
  const { project, metersPerPixel, minLon, maxLon, minLat, maxLat } = buildMercatorProjector(
    viewport,
    width,
    height
  );

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // 1. Ocean backdrop
  ctx.fillStyle = theme.sea;
  ctx.fillRect(0, 0, width, height);

  // 2. Tectonic plates polygons
  if (exportOpts.showPlates) {
    ctx.save();
    for (const plate of TECTONIC_PLATES) {
      ctx.beginPath();
      plate.points.forEach(([lon, lat], idx) => {
        const [x, y] = project(lon, lat);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fillStyle = plate.fillColor;
      ctx.fill();
      ctx.strokeStyle = theme.plateStroke;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1.2 * s;
      ctx.setLineDash([6 * s, 4 * s]);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);

      const [lx, ly] = project(plate.labelCoord[0], plate.labelCoord[1]);
      ctx.font = `600 ${9.5 * s}px ${FONT_MONO}`;
      ctx.fillStyle = theme.plateStroke;
      ctx.textAlign = 'center';
      ctx.fillText(plate.shortLabel, lx, ly);
    }
    ctx.restore();
  }

  // 3. Coordinate graticule
  if (exportOpts.showGrid || styleMode === 'hybrid' || styleMode === 'terrain' || styleMode === 'roadmap') {
    const lonSpanApprox = Math.max(0.5, maxLon - minLon);
    const stepDeg = lonSpanApprox > 12 ? 2 : lonSpanApprox > 4 ? 1 : 0.5;
    ctx.save();
    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 1 * s;
    ctx.setLineDash([3 * s, 3 * s]);
    ctx.font = `500 ${9.5 * s}px ${FONT_MONO}`;
    ctx.fillStyle = theme.gridLabel;

    const startLon = Math.ceil(minLon / stepDeg) * stepDeg;
    for (let lon = startLon; lon <= maxLon; lon += stepDeg) {
      const [x] = project(lon, viewport.lat);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      ctx.fillText(`${lon.toFixed(stepDeg < 1 ? 1 : 0)}°E`, x + 4 * s, 14 * s);
    }
    const startLat = Math.ceil(minLat / stepDeg) * stepDeg;
    for (let lat = startLat; lat <= maxLat; lat += stepDeg) {
      const [, y] = project(viewport.lon, lat);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      ctx.fillText(`${lat.toFixed(stepDeg < 1 ? 1 : 0)}°N`, 6 * s, y - 4 * s);
    }
    ctx.restore();
  }

  // 4. Island polygons
  ctx.save();
  ctx.fillStyle = theme.land;
  ctx.strokeStyle = theme.landStroke;
  ctx.lineWidth = 1.2 * s;
  ctx.lineJoin = 'round';
  for (const island of ISLAND_POLYGONS) {
    ctx.beginPath();
    island.points.forEach(([lon, lat], idx) => {
      const [x, y] = project(lon, lat);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();

  // 5. ShakeMap contours
  if (panelShakeMap && exportOpts.showShakeMap && exportOpts.shakeMapOpacity > 0) {
    const baseFill = Math.max(0, Math.min(0.85, exportOpts.shakeMapOpacity * 0.7));
    const baseStroke = Math.min(1, 0.35 + exportOpts.shakeMapOpacity * 0.65);

    for (const contour of panelShakeMap.contours) {
      if (exportOpts.visibleShakeBands[contour.band.roman] === false) continue;
      const isHighlighted =
        exportOpts.highlightedShakeBand === contour.band.roman && contour.isEpicentral !== false;
      const isDimmed =
        exportOpts.highlightedShakeBand !== null &&
        exportOpts.highlightedShakeBand !== contour.band.roman;
      const fillAlpha = isHighlighted
        ? Math.min(0.85, baseFill + 0.14)
        : isDimmed
          ? baseFill * 0.55
          : baseFill;
      const strokeAlpha = isHighlighted ? 1 : isDimmed ? baseStroke * 0.55 : baseStroke;

      ctx.save();
      ctx.beginPath();
      for (const ring of contour.rings) {
        ring.forEach(([lon, lat], pIdx) => {
          const [px, py] = project(lon, lat);
          if (pIdx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.closePath();
      }
      ctx.fillStyle = contour.band.fillHex;
      ctx.globalAlpha = fillAlpha;
      ctx.fill('evenodd');
      ctx.strokeStyle = contour.band.strokeHex;
      ctx.globalAlpha = strokeAlpha;
      ctx.lineWidth = (isHighlighted ? 2.4 : 1.45) * s;
      ctx.stroke();
      ctx.restore();
    }
  }

  // 6. Plate boundaries & Schematic faults
  if (exportOpts.showPlates) {
    ctx.save();
    ctx.strokeStyle = '#4f46e5';
    ctx.lineWidth = 1.9 * s;
    ctx.setLineDash([7 * s, 3 * s]);
    for (const b of FAULT_TRACES.filter((f) => f.kind === 'boundary')) {
      ctx.beginPath();
      b.points.forEach(([lon, lat], i) => {
        const [x, y] = project(lon, lat);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
    ctx.restore();
  }

  if (exportOpts.showFaults) {
    ctx.save();
    ctx.strokeStyle = theme.fault;
    ctx.lineWidth = 1.85 * s;
    ctx.setLineDash([5 * s, 3 * s]);
    for (const f of FAULT_TRACES.filter((t) => t.kind === 'fault')) {
      ctx.beginPath();
      f.points.forEach(([lon, lat], i) => {
        const [x, y] = project(lon, lat);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
    ctx.restore();
  }

  // 7. GIS Layers
  drawGisLayersToCanvas(ctx, {
    project,
    minLon,
    maxLon,
    minLat,
    maxLat,
    scale: s,
    geologyVisibility: exportOpts.geologyVisibility,
    gisActiveFaultsData: exportOpts.gisActiveFaultsData,
    gisTrenchData: exportOpts.gisTrenchData,
  });

  // 8. Range Ring circles
  if (exportOpts.showRangeRings && !isEventUnlocated(exportOpts.event)) {
    const ev = exportOpts.event;
    ctx.save();
    ctx.strokeStyle = '#0284c7';
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 1.2 * s;
    ctx.setLineDash([4 * s, 4 * s]);
    for (const rKm of [50, 100, 200]) {
      const latDegPerKm = 1 / 111.32;
      const lonDegPerKm = 1 / (111.32 * Math.max(0.25, Math.cos((ev.lat * Math.PI) / 180)));
      ctx.beginPath();
      for (let i = 0; i <= 72; i++) {
        const th = (i / 72) * Math.PI * 2;
        const [px, py] = project(ev.lon + Math.cos(th) * rKm * lonDegPerKm, ev.lat + Math.sin(th) * rKm * latDegPerKm);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  }

  // 9. All projected markers, rays, vectors, ruler & epicenter
  drawProjectedMarkersAndBadges(ctx, {
    width,
    height,
    scale: s,
    project,
    event: exportOpts.event,
    stations: exportOpts.stations,
    selectedStation: exportOpts.selectedStation,
    regionFilter: exportOpts.regionFilter,
    showVolcanoes: exportOpts.showVolcanoes,
    showStations: exportOpts.showStations,
    showMainOffice,
    mainOffice: exportOpts.mainOffice,
    showRangeRings: exportOpts.showRangeRings,
    showNearestPlaces: exportOpts.showNearestPlaces,
    nearestCitiesPins: exportOpts.nearestCitiesPins,
    showCatalogEvents: exportOpts.showCatalogEvents,
    catalogEvents: exportOpts.catalogEvents,
    shakeMap: panelShakeMap,
    showShakeMap: exportOpts.showShakeMap,
    shakeMapOpacity: exportOpts.shakeMapOpacity,
    visibleShakeBands: exportOpts.visibleShakeBands,
    highlightedShakeBand: exportOpts.highlightedShakeBand,
    rulerPoints: exportOpts.rulerPoints,
    comparisonMarkers: exportOpts.comparisonMarkers,
    timelineEvents: exportOpts.timelineEvents,
    selectedTimelineEventId: exportOpts.selectedTimelineEventId,
    drawStationRays: true,
    drawOfficeVector: true,
    drawRulerLine: true,
    drawErrorCircle: true,
    drawTimelinePath: true,
    showTimelineMigration: exportOpts.showTimelineMigration,
  });

  return { canvas, metersPerPixel };
}

function drawScaleBarOnCanvas(
  ctx: CanvasRenderingContext2D,
  x: number,
  yBottom: number,
  metersPerPixel: number,
  scale: number,
  alignRight = false
): void {
  const metrics = computeMapScaleBarMetrics(metersPerPixel, false);
  if (!metrics) return;

  const barW = metrics.barWidthPx * scale;
  const padX = 10 * scale;
  const padY = 8 * scale;
  const boxW = barW + padX * 2;
  const boxH = 34 * scale;
  const bx = alignRight ? x - boxW : x;
  const by = yBottom - boxH;

  ctx.save();
  drawRoundedRect(ctx, bx, by, boxW, boxH, 6 * scale);
  ctx.fillStyle = 'rgba(255,255,255,0.93)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(148,163,184,0.9)';
  ctx.lineWidth = 1.1 * scale;
  ctx.stroke();

  const innerX = bx + padX;
  const textY = by + padY + 4 * scale;
  ctx.font = `700 ${10 * scale}px ${FONT_MONO}`;
  ctx.fillStyle = '#334155';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText('0', innerX, textY);

  if (metrics.showMidLabel) {
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';
    ctx.fillText(metrics.halfLabel.value, innerX + barW / 2, textY);
  }

  ctx.fillStyle = '#1e293b';
  ctx.textAlign = 'right';
  ctx.fillText(`${metrics.fullLabel.value} ${metrics.fullLabel.unit}`, innerX + barW, textY);

  const barY = by + boxH - padY - 6 * scale;
  const barH = 6 * scale;
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(innerX, barY, barW / 2, barH);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(innerX + barW / 2, barY, barW / 2, barH);
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.1 * scale;
  ctx.strokeRect(innerX, barY, barW, barH);
  ctx.restore();
}

function drawRulerSummaryCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  rulerPoints: MapSnapshotExportOptions['rulerPoints'],
  measurement: RulerMeasurementResult | null
): void {
  if (!rulerPoints.start) return;
  const w = 250 * scale;
  const h = (measurement ? 76 : 48) * scale;

  ctx.save();
  drawRoundedRect(ctx, x, y, w, h, 8 * scale);
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.fill();
  ctx.strokeStyle = '#c084fc';
  ctx.lineWidth = 1.4 * scale;
  ctx.stroke();

  ctx.font = `700 ${11 * scale}px ${FONT_SANS}`;
  ctx.fillStyle = '#581c87';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('Distance & Bearing Ruler', x + 10 * scale, y + 8 * scale);

  ctx.font = `600 ${10 * scale}px ${FONT_MONO}`;
  if (measurement && rulerPoints.end) {
    ctx.fillStyle = '#1e293b';
    ctx.fillText(
      `${measurement.distKm.toFixed(2)} km · ${measurement.azimDeg.toFixed(1)}° (${measurement.quadrantLabel})`,
      x + 10 * scale,
      y + 27 * scale
    );
    ctx.fillStyle = '#475569';
    ctx.font = `500 ${9 * scale}px ${FONT_MONO}`;
    ctx.fillText(
      `P1: ${rulerPoints.start.lat.toFixed(3)}°N, ${rulerPoints.start.lon.toFixed(3)}°E`,
      x + 10 * scale,
      y + 44 * scale
    );
    ctx.fillText(
      `P2: ${rulerPoints.end.lat.toFixed(3)}°N, ${rulerPoints.end.lon.toFixed(3)}°E`,
      x + 10 * scale,
      y + 57 * scale
    );
  } else {
    ctx.fillStyle = '#475569';
    ctx.fillText(
      `P1: ${rulerPoints.start.lat.toFixed(3)}°N, ${rulerPoints.start.lon.toFixed(3)}°E`,
      x + 10 * scale,
      y + 26 * scale
    );
  }
  ctx.restore();
}

function draw3dHudOverlay(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  event: EQPEvent,
  diag?: MapSnapshotDepthDiagnostics
): void {
  const unlocated = isEventUnlocated(event);
  const w = 275 * scale;
  const h = 50 * scale;

  ctx.save();
  drawRoundedRect(ctx, x, y, w, h, 8 * scale);
  ctx.fillStyle = 'rgba(2,6,23,0.88)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(71,85,105,0.85)';
  ctx.lineWidth = 1.2 * scale;
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  if (unlocated) {
    ctx.font = `700 ${11 * scale}px ${FONT_MONO}`;
    ctx.fillStyle = '#fcd34d';
    ctx.fillText('Hypocenter Pending', x + 12 * scale, y + 9 * scale);
    ctx.font = `500 ${9.5 * scale}px ${FONT_SANS}`;
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText('Philippine Archipelago Subsurface Block', x + 12 * scale, y + 27 * scale);
  } else {
    ctx.font = `700 ${11 * scale}px ${FONT_MONO}`;
    ctx.fillStyle = '#fb7185';
    ctx.fillText(`Z = ${event.depthKm.toFixed(1)} km`, x + 12 * scale, y + 9 * scale);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(
      `· ${event.lat.toFixed(3)}°N, ${event.lon.toFixed(3)}°E`,
      x + 98 * scale,
      y + 9 * scale
    );
    if (diag) {
      ctx.font = `600 ${10 * scale}px ${FONT_SANS}`;
      ctx.fillStyle = diag.status === 'Well-Constrained' ? '#34d399' : '#fbbf24';
      ctx.fillText(diag.status, x + 12 * scale, y + 28 * scale);
      ctx.font = `500 ${10 * scale}px ${FONT_MONO}`;
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText(`· Δmin/Z = ${diag.depthConstraintRatio.toFixed(2)}`, x + 112 * scale, y + 28 * scale);
    }
  }
  ctx.restore();
}

export function buildActiveLegendItems(
  opts: MapSnapshotExportOptions,
  capture: MapSnapshotCaptureResult | null,
  shakeMap: ShakeMapResult | null
): MapLegendItem[] {
  if (opts.viewDimension === '3d') {
    return [
      { label: 'Solved Hypocenter', swatchKind: 'circle', color: '#dc2626' },
      {
        label: isEventUnlocated(opts.event)
          ? 'Trial Depth (Pending)'
          : `Trial Depth (${opts.event.trialDepthKm.toFixed(1)} km)`,
        swatchKind: 'diamond',
        color: '#f59e0b',
      },
      { label: 'Philippine Trench Slab', swatchKind: 'box', color: 'rgba(6,182,212,0.45)', borderColor: '#0891b2' },
      { label: 'Moho (30.0 km)', swatchKind: 'box', color: 'rgba(168,85,247,0.4)', borderColor: '#9333ea' },
    ];
  }

  const items: MapLegendItem[] = [
    { label: 'Epicenter', swatchKind: 'star', color: '#dc2626' },
  ];

  if (opts.showStations) {
    items.push({ label: 'Active Station', swatchKind: 'diamond', color: '#2563eb' });
    items.push({ label: 'Warning (> 0.50s)', swatchKind: 'diamond', color: '#d97706' });
  }
  if (opts.showFaults) {
    items.push({ label: 'Schematic Faults', swatchKind: 'line-dashed', color: '#e11d48' });
  }
  if (opts.geologyVisibility.activeFaults) {
    items.push({ label: 'GIS Active Faults', swatchKind: 'line-solid', color: '#e11d48' });
  }
  if (opts.geologyVisibility.potentiallyActiveFaults) {
    items.push({ label: 'Potentially Active Faults', swatchKind: 'line-dashed', color: '#d97706' });
  }
  if (opts.geologyVisibility.trenches) {
    items.push({ label: 'Trenches / Tectonic', swatchKind: 'line-solid', color: '#3730a3' });
  }
  if (opts.showVolcanoes) {
    items.push({ label: 'Active Volcanoes', swatchKind: 'circle', color: '#ea580c' });
  }
  if (opts.showPlates) {
    items.push({ label: 'Plate Boundaries', swatchKind: 'box', color: 'rgba(99,102,241,0.22)', borderColor: '#4f46e5' });
  }
  if (
    opts.showShakeMap &&
    shakeMap &&
    opts.shakeMapOpacity > 0 &&
    shakeMap.contours.some((c) => opts.visibleShakeBands[c.band.roman] !== false)
  ) {
    items.push({
      label: `ShakeMap PEIS (Max ${shakeMap.peakRoman})`,
      swatchKind: 'box',
      color: 'rgba(251,191,36,0.45)',
      borderColor: '#ea580c',
    });
  }
  if (capture?.showMainOffice ?? true) {
    items.push({ label: `${opts.mainOffice.code} Main Office`, swatchKind: 'square', color: '#059669' });
  }
  if (opts.showRangeRings) {
    items.push({ label: 'Range Rings (50/100/200 km)', swatchKind: 'line-dashed', color: '#0284c7' });
  }
  if (opts.showNearestPlaces && opts.nearestCitiesPins.length > 0) {
    items.push({ label: `Cities (${opts.nearestCitiesPins.length})`, swatchKind: 'circle', color: '#0f766e' });
  }
  if (opts.showCatalogEvents) {
    items.push({ label: 'Catalog Events', swatchKind: 'circle', color: '#f97316' });
  }
  if (opts.timelineEvents.length > 0) {
    items.push({ label: `Timeline (${opts.timelineEvents.length})`, swatchKind: 'circle', color: '#ea580c' });
  }
  if (opts.rulerPoints.start && opts.rulerPoints.end) {
    items.push({ label: 'Distance Ruler', swatchKind: 'line-dashed', color: '#7c3aed' });
  }
  return items;
}

function drawLegendItems(
  ctx: CanvasRenderingContext2D,
  xStart: number,
  yMid: number,
  maxX: number,
  scale: number,
  items: MapLegendItem[]
): void {
  ctx.save();
  ctx.font = `600 ${11 * scale}px ${FONT_SANS}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  let cursorX = xStart;
  for (const item of items) {
    const labelW = ctx.measureText(item.label).width;
    const itemW = 18 * scale + labelW + 18 * scale;
    if (cursorX + itemW > maxX) break;

    const swX = cursorX + 6 * scale;
    if (item.swatchKind === 'star' || item.swatchKind === 'circle') {
      ctx.beginPath();
      ctx.arc(swX, yMid, 4.5 * scale, 0, Math.PI * 2);
      ctx.fillStyle = item.color;
      ctx.fill();
    } else if (item.swatchKind === 'square') {
      ctx.fillStyle = item.color;
      ctx.fillRect(swX - 4.5 * scale, yMid - 4.5 * scale, 9 * scale, 9 * scale);
    } else if (item.swatchKind === 'diamond') {
      ctx.save();
      ctx.translate(swX, yMid);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = item.color;
      ctx.fillRect(-4 * scale, -4 * scale, 8 * scale, 8 * scale);
      ctx.restore();
    } else if (item.swatchKind === 'line-solid' || item.swatchKind === 'line-dashed') {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(swX - 6 * scale, yMid);
      ctx.lineTo(swX + 8 * scale, yMid);
      ctx.strokeStyle = item.color;
      ctx.lineWidth = 2.2 * scale;
      if (item.swatchKind === 'line-dashed') ctx.setLineDash([4 * scale, 2.5 * scale]);
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.fillStyle = item.color;
      ctx.fillRect(swX - 6 * scale, yMid - 4.5 * scale, 12 * scale, 9 * scale);
      if (item.borderColor) {
        ctx.strokeStyle = item.borderColor;
        ctx.lineWidth = 1.2 * scale;
        ctx.strokeRect(swX - 6 * scale, yMid - 4.5 * scale, 12 * scale, 9 * scale);
      }
    }

    ctx.fillStyle = '#334155';
    ctx.fillText(item.label, cursorX + 18 * scale, yMid + 0.5 * scale);
    cursorX += itemW;
  }
  ctx.restore();
}

async function buildPanelCanvas(
  panel: MapSnapshotPanelInput,
  exportOpts: MapSnapshotExportOptions,
  targetPanelWidth: number
): Promise<{ canvas: HTMLCanvasElement; usedVectorFallbackForGoogle: boolean; usedFallbackForMapLibre: boolean }> {
  const capture = panel.capture;
  const s = targetPanelWidth / 1200;
  let usedVectorFallbackForGoogle = false;
  let usedFallbackForMapLibre = false;

  // Determine inner map image canvas
  let mapCanvas: HTMLCanvasElement;
  let mapMetersPerPixel = capture?.metersPerPixel ?? 0;

  if (capture?.engine === 'vector' && capture.canvas) {
    mapCanvas = capture.canvas;
  } else if (capture?.engine === '3d' && capture.canvas) {
    const cssH = Math.max(240, capture.cssHeight || 520);
    const cssW = Math.max(320, capture.cssWidth || 800);
    const targetH = Math.round((targetPanelWidth * cssH) / cssW);
    mapCanvas = document.createElement('canvas');
    mapCanvas.width = targetPanelWidth;
    mapCanvas.height = targetH;
    const ctx = mapCanvas.getContext('2d')!;
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, targetPanelWidth, targetH);
    ctx.drawImage(capture.canvas, 0, 0, targetPanelWidth, targetH);
    draw3dHudOverlay(ctx, 18 * s, 18 * s, s, exportOpts.event, capture.depthDiagnostics);
    if (mapMetersPerPixel > 0) {
      drawScaleBarOnCanvas(
        ctx,
        targetPanelWidth - 18 * s,
        54 * s,
        mapMetersPerPixel * (cssW / targetPanelWidth),
        s,
        true
      );
    }
  } else if (capture?.engine === 'maplibre' && capture.canvas && capture.projectLonLat && capture.cssWidth && capture.cssHeight) {
    const cssW = Math.max(320, capture.cssWidth);
    const cssH = Math.max(240, capture.cssHeight);
    const targetH = Math.round((targetPanelWidth * cssH) / cssW);
    const markerScale = targetPanelWidth / cssW;
    mapCanvas = document.createElement('canvas');
    mapCanvas.width = targetPanelWidth;
    mapCanvas.height = targetH;
    const ctx = mapCanvas.getContext('2d')!;
    ctx.drawImage(capture.canvas, 0, 0, targetPanelWidth, targetH);

    // Draw all HTML DOM markers & badges crisply at target resolution using live map.project
    drawProjectedMarkersAndBadges(ctx, {
      width: targetPanelWidth,
      height: targetH,
      scale: markerScale,
      project: (lon, lat) => {
        const [cx, cy] = capture.projectLonLat!(lon, lat);
        return [cx * markerScale, cy * markerScale];
      },
      event: exportOpts.event,
      stations: exportOpts.stations,
      selectedStation: exportOpts.selectedStation,
      regionFilter: exportOpts.regionFilter,
      showVolcanoes: exportOpts.showVolcanoes,
      showStations: exportOpts.showStations,
      showMainOffice: capture.showMainOffice ?? true,
      mainOffice: exportOpts.mainOffice,
      showRangeRings: exportOpts.showRangeRings,
      showNearestPlaces: exportOpts.showNearestPlaces,
      nearestCitiesPins: exportOpts.nearestCitiesPins,
      showCatalogEvents: exportOpts.showCatalogEvents,
      catalogEvents: exportOpts.catalogEvents,
      shakeMap: panel.shakeMap,
      showShakeMap: exportOpts.showShakeMap,
      shakeMapOpacity: exportOpts.shakeMapOpacity,
      visibleShakeBands: exportOpts.visibleShakeBands,
      highlightedShakeBand: exportOpts.highlightedShakeBand,
      rulerPoints: exportOpts.rulerPoints,
      comparisonMarkers: exportOpts.comparisonMarkers,
      timelineEvents: exportOpts.timelineEvents,
      selectedTimelineEventId: exportOpts.selectedTimelineEventId,
      drawStationRays: false,
      drawOfficeVector: false,
      drawRulerLine: false,
      drawErrorCircle: false,
      drawTimelinePath: false,
    });
    if (mapMetersPerPixel > 0) {
      mapMetersPerPixel = mapMetersPerPixel / markerScale;
    }
  } else {
    // Google Maps (ToS/CORS-compliant vector basemap) or MapLibre fallback
    if (capture?.engine === 'google' || exportOpts.basemapLabel.toLowerCase().includes('google')) {
      usedVectorFallbackForGoogle = true;
    } else if (capture?.engine === 'maplibre') {
      usedFallbackForMapLibre = true;
    }
    const targetH = Math.round(targetPanelWidth * 0.65);
    const vp = capture?.viewport ?? exportOpts.viewport;
    const styleMode = capture?.mapStyleMode ?? exportOpts.mapStyleMode;
    const rendered = renderMercatorCartographicCanvas({
      width: targetPanelWidth,
      height: targetH,
      viewport: vp,
      styleMode,
      panelShakeMap: panel.shakeMap,
      exportOpts,
      showMainOffice: capture?.showMainOffice ?? true,
    });
    mapCanvas = rendered.canvas;
    mapMetersPerPixel = rendered.metersPerPixel;
  }

  const mapW = mapCanvas.width;
  const mapH = mapCanvas.height;
  const panelScale = mapW / 1200;

  // Draw in-viewport overlays (scale bar for 2D, ruler card, trend badge)
  const mapCtx = mapCanvas.getContext('2d');
  if (mapCtx) {
    if (exportOpts.viewDimension !== '3d') {
      const mpp =
        capture?.engine === 'vector' && capture.cssWidth
          ? (capture.metersPerPixel ?? 0) * (capture.cssWidth / mapW)
          : mapMetersPerPixel;
      if (mpp > 0) {
        drawScaleBarOnCanvas(mapCtx, 18 * panelScale, mapH - 18 * panelScale, mpp, panelScale, false);
      }
      if (exportOpts.rulerPoints.start) {
        drawRulerSummaryCard(
          mapCtx,
          18 * panelScale,
          18 * panelScale,
          panelScale,
          exportOpts.rulerPoints,
          exportOpts.rulerMeasurement
        );
      }
    }

    if (exportOpts.showSeismicityTrendOverlay && exportOpts.historicalTrendEvents) {
      const count = exportOpts.historicalTrendEvents.length;
      drawBadgePill(
        mapCtx,
        mapW - 18 * panelScale,
        exportOpts.viewDimension === '3d' ? mapH - 22 * panelScale : 24 * panelScale,
        `Trend Overlay · ${count.toLocaleString('en-US')} Historical Events`,
        {
          font: `600 ${10.5 * panelScale}px ${FONT_SANS}`,
          bg: 'rgba(15,23,42,0.88)',
          border: 'rgba(56,189,248,0.65)',
          textColor: '#e0f2fe',
          padX: 9,
          padY: 4.5,
          radius: 5,
          scale: panelScale,
          align: 'right',
        }
      );
    }
  }

  // Wrap mapCanvas with Panel Banner (optional for compare mode) + Footer Legend
  const hasSubHeader = Boolean(panel.titleBadge || panel.subtitle);
  const subHeaderH = hasSubHeader ? Math.round(42 * panelScale) : 0;
  const has3dDiag = exportOpts.viewDimension === '3d' && Boolean(capture?.depthDiagnostics);
  const footerH = Math.round((has3dDiag ? 98 : 42) * panelScale);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = mapW;
  outCanvas.height = subHeaderH + mapH + footerH;
  const ctx = outCanvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, outCanvas.width, outCanvas.height);

  if (hasSubHeader) {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, mapW, subHeaderH);
    ctx.font = `700 ${13 * panelScale}px ${FONT_SANS}`;
    ctx.fillStyle = '#f8fafc';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const badgeText = panel.titleBadge ? `${panel.titleBadge} · ` : '';
    ctx.fillText(`${badgeText}${panel.subtitle ?? ''}`, 16 * panelScale, subHeaderH / 2);
  }

  ctx.drawImage(mapCanvas, 0, subHeaderH);

  // Footer strip
  const fy = subHeaderH + mapH;
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, fy, mapW, footerH);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = Math.max(1, panelScale);
  ctx.beginPath();
  ctx.moveTo(0, fy);
  ctx.lineTo(mapW, fy);
  ctx.stroke();

  const legendItems = buildActiveLegendItems(exportOpts, capture ?? null, panel.shakeMap);
  const legendRowY = fy + Math.round(21 * panelScale);
  const erhText = isEventUnlocated(exportOpts.event)
    ? 'ERH Pending'
    : `ERH ±${exportOpts.event.errKm.toFixed(2)} km`;

  ctx.font = `600 ${11 * panelScale}px ${FONT_MONO}`;
  ctx.fillStyle = '#475569';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(erhText, mapW - 16 * panelScale, legendRowY);

  drawLegendItems(
    ctx,
    14 * panelScale,
    legendRowY,
    mapW - 160 * panelScale,
    panelScale,
    legendItems
  );

  if (has3dDiag && capture?.depthDiagnostics) {
    const diag = capture.depthDiagnostics;
    const dy = fy + Math.round(44 * panelScale);
    ctx.strokeStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.moveTo(14 * panelScale, dy - 4 * panelScale);
    ctx.lineTo(mapW - 14 * panelScale, dy - 4 * panelScale);
    ctx.stroke();

    const cols = [
      { label: 'Hosting Crustal Layer', value: diag.hostingLayerLabel, color: '#0f172a' },
      { label: 'Nearest Discontinuity', value: diag.nearestBoundaryLabel, color: '#0f172a' },
      { label: 'Trial-to-Solved ΔZ / Nearest Sta', value: diag.trialDeltaLabel, color: '#0f172a' },
      {
        label: 'Depth Assessment',
        value: diag.assessment,
        color: diag.status === 'Well-Constrained' ? '#047857' : '#b45309',
      },
    ];
    const colW = (mapW - 32 * panelScale) / 4;
    cols.forEach((col, i) => {
      const cx = 16 * panelScale + i * colW;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = `500 ${9.5 * panelScale}px ${FONT_SANS}`;
      ctx.fillStyle = '#64748b';
      ctx.fillText(col.label, cx, dy + 4 * panelScale);
      ctx.font = `600 ${10.5 * panelScale}px ${i === 3 ? FONT_SANS : FONT_MONO}`;
      ctx.fillStyle = col.color;
      const clipped = col.value.length > 44 ? `${col.value.slice(0, 41)}…` : col.value;
      ctx.fillText(clipped, cx, dy + 20 * panelScale);
    });
  }

  return {
    canvas: outCanvas,
    usedVectorFallbackForGoogle,
    usedFallbackForMapLibre,
  };
}

export async function exportMapSnapshotPng(
  exportOpts: MapSnapshotExportOptions
): Promise<{
  filename: string;
  width: number;
  height: number;
  usedVectorFallbackForGoogle: boolean;
}> {
  const isCompare = exportOpts.panels.length > 1;
  const targetPanelWidth = isCompare ? 1560 : 2400;
  const builtPanels = await Promise.all(
    exportOpts.panels.map((p) => buildPanelCanvas(p, exportOpts, targetPanelWidth))
  );

  const usedVectorFallbackForGoogle = builtPanels.some((b) => b.usedVectorFallbackForGoogle);
  const pad = isCompare ? 24 : 0;
  const gap = isCompare ? 24 : 0;
  const totalContentW =
    builtPanels.reduce((acc, b) => acc + b.canvas.width, 0) +
    (builtPanels.length - 1) * gap +
    pad * 2;
  const maxPanelH = Math.max(...builtPanels.map((b) => b.canvas.height));

  const scale = totalContentW / 2400;
  const headerH = Math.round(76 * scale);
  const bottomMetaH = Math.round(34 * scale);

  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = totalContentW;
  finalCanvas.height = headerH + maxPanelH + pad * 2 + bottomMetaH;
  const ctx = finalCanvas.getContext('2d')!;

  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);

  // Top Header Strip
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, finalCanvas.width, headerH);

  const ev = exportOpts.event;
  const unlocated = isEventUnlocated(ev);
  const mag = getActiveMagnitude(ev);
  const titleText = ev.filename || ev.id || 'Earthquake Event';
  const locSummary = unlocated
    ? 'Hypocenter Pending · Awaiting Solution'
    : `${ev.lat.toFixed(3)}°N, ${ev.lon.toFixed(3)}°E · Depth ${ev.depthKm.toFixed(1)} km · ${ev.preferredScale} ${mag.toFixed(1)} · ERH ±${ev.errKm.toFixed(2)} km · RMS ${ev.rmsSec.toFixed(2)}s`;
  const originText = `Origin: ${ev.originDateGmt} ${ev.originTimeGmt} UTC (${ev.originDateLst} ${ev.originTimeLst} LST) · Bulletin #${ev.bulletinNo}`;

  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.font = `700 ${20 * scale}px ${FONT_SANS}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`EQP Seismotectonic Map Snapshot — ${titleText}`, 24 * scale, 14 * scale);

  ctx.font = `500 ${13 * scale}px ${FONT_MONO}`;
  ctx.fillStyle = '#bae6fd';
  ctx.fillText(locSummary, 24 * scale, 44 * scale);

  ctx.textAlign = 'right';
  ctx.font = `600 ${13 * scale}px ${FONT_SANS}`;
  ctx.fillStyle = '#f8fafc';
  const modeTag =
    exportOpts.viewDimension === '3d'
      ? '3D Subsurface Block'
      : `${exportOpts.basemapLabel} (${exportOpts.mapStyleMode.toUpperCase()})`;
  ctx.fillText(modeTag, finalCanvas.width - 24 * scale, 16 * scale);

  ctx.font = `500 ${11.5 * scale}px ${FONT_MONO}`;
  ctx.fillStyle = '#cbd5e1';
  ctx.fillText(originText, finalCanvas.width - 24 * scale, 44 * scale);

  // Panels
  let xOffset = pad;
  for (const built of builtPanels) {
    ctx.drawImage(built.canvas, xOffset, headerH + pad);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = Math.max(1, scale);
    ctx.strokeRect(xOffset, headerH + pad, built.canvas.width, built.canvas.height);
    xOffset += built.canvas.width + gap;
  }

  // Bottom Provenance & Timestamp Bar
  const metaY = headerH + maxPanelH + pad * 2;
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(0, metaY, finalCanvas.width, bottomMetaH);
  ctx.textBaseline = 'middle';
  ctx.font = `500 ${11 * scale}px ${FONT_MONO}`;
  ctx.fillStyle = '#334155';
  ctx.textAlign = 'left';
  const basemapNote = usedVectorFallbackForGoogle
    ? 'Basemap: Cartographic Vector Render (Synced to Google Maps Viewport)'
    : `Basemap: ${exportOpts.basemapLabel}`;
  ctx.fillText(basemapNote, 24 * scale, metaY + bottomMetaH / 2);

  ctx.textAlign = 'right';
  const nowUtc = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  ctx.fillText(
    `Exported ${nowUtc} · ${finalCanvas.width}×${finalCanvas.height} px`,
    finalCanvas.width - 24 * scale,
    metaY + bottomMetaH / 2
  );

  // Export PNG Blob and trigger download
  const filename = buildMapSnapshotFilename(
    ev,
    exportOpts.viewDimension === '3d' ? 'map_3d_snapshot' : isCompare ? 'map_compare_snapshot' : 'map_snapshot'
  );

  const blob = await new Promise<Blob>((resolve, reject) => {
    finalCanvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Canvas PNG encoding failed'))),
      'image/png',
      1.0
    );
  });

  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return {
    filename,
    width: finalCanvas.width,
    height: finalCanvas.height,
    usedVectorFallbackForGoogle,
  };
}
