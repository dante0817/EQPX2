import { EQPEvent, isEventUnlocated } from '../data/eqpData';
import type { HistoricalEarthquakeRecord } from './historicalSeismicity';
import { computeDistanceAndBearing } from './nearestPlaces';
import type { GeoViewportBounds } from '../components/SeismicityTrendOverlay';

export type TimelineSourceFilter = 'all' | 'workspace' | 'historical';
export type TimelineTrailMode = 'cumulative' | '7d' | '30d' | '90d' | '365d';
export type TimelinePlaybackSpeed = 0.5 | 1 | 2 | 4;

export interface TimelineEventPoint {
  id: string;
  sourceKind: 'workspace' | 'historical';
  sourceLabel: string;
  originTimeMs: number;
  originTimeUtc: string;
  lat: number;
  lon: number;
  depthKm: number | null;
  magnitude: number | null;
  magnitudeScale: string;
  place: string;
  workspaceEventId?: string;
}

export interface VisibleTimelineEvent extends TimelineEventPoint {
  ageFraction: number;
  opacity: number;
  isRecentPulse: boolean;
  sequenceOrder: number;
  depthColor: string;
  radiusPx: number;
}

export interface TimelineWindowBounds {
  minMs: number;
  maxMs: number;
  spanMs: number;
}

export interface TimelineTrendSummary {
  visibleCount: number;
  totalCount: number;
  peakMagnitude: number | null;
  peakEvent: VisibleTimelineEvent | null;
  meanDepthKm: number | null;
  shallowCount: number;
  intermediateCount: number;
  deepCount: number;
  unknownDepthCount: number;
  centroidLat: number | null;
  centroidLon: number | null;
  netMigrationKm: number | null;
  migrationBearingLabel: string | null;
}

const TRAIL_MODE_MS: Record<Exclude<TimelineTrailMode, 'cumulative'>, number> = {
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
  '365d': 365 * 24 * 60 * 60 * 1000,
};

export function getTrailWindowMs(mode: TimelineTrailMode): number | null {
  if (mode === 'cumulative') return null;
  return TRAIL_MODE_MS[mode];
}

export function getTimelineDepthColor(depthKm: number | null): string {
  if (depthKm === null || !Number.isFinite(depthKm)) return '#64748b';
  if (depthKm <= 30) return '#f97316';
  if (depthKm <= 100) return '#eab308';
  return '#6366f1';
}

export function getTimelineDepthBandLabel(depthKm: number | null): string {
  if (depthKm === null || !Number.isFinite(depthKm)) return 'Unknown';
  if (depthKm <= 30) return 'Shallow (≤30 km)';
  if (depthKm <= 100) return 'Intermediate (31–100 km)';
  return 'Deep (>100 km)';
}

export function getTimelineMarkerRadiusPx(magnitude: number | null): number {
  if (magnitude === null || !Number.isFinite(magnitude)) return 5;
  return Math.max(4.5, Math.min(13, 2.8 + magnitude * 1.35));
}

export function parseEqpEventOriginMs(ev: Pick<EQPEvent, 'originDateGmt' | 'originTimeGmt'>): number | null {
  const datePart = String(ev.originDateGmt ?? '').trim();
  const timePart = String(ev.originTimeGmt ?? '').trim();
  if (!datePart) return null;

  const cleanTime = timePart || '00:00:00';
  const isoCandidate = `${datePart}T${cleanTime}Z`;
  const parsed = Date.parse(isoCandidate);
  if (Number.isFinite(parsed)) return parsed;

  const fallback = Date.parse(`${datePart} ${cleanTime} UTC`);
  return Number.isFinite(fallback) ? fallback : null;
}

export function getWorkspaceEventMagnitude(
  ev: Pick<EQPEvent, 'preferredScale' | 'ms' | 'mb' | 'md'>
): { value: number | null; scale: string } {
  const scale = ev.preferredScale || 'Ms';
  const raw =
    scale === 'Ms' ? ev.ms : scale === 'Mb' ? ev.mb : ev.md;
  if (Number.isFinite(raw) && raw > 0) {
    return { value: raw, scale };
  }
  const fallback = [
    { value: ev.ms, scale: 'Ms' },
    { value: ev.mb, scale: 'Mb' },
    { value: ev.md, scale: 'Md' },
  ].find((item) => Number.isFinite(item.value) && item.value > 0);
  if (fallback) return fallback;
  return { value: null, scale };
}

export function formatUtcTimelineTimestamp(ms: number): string {
  if (!Number.isFinite(ms)) return '—';
  const d = new Date(ms);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min} UTC`;
}

export function formatUtcTimelineShortDate(ms: number): string {
  if (!Number.isFinite(ms)) return '—';
  const d = new Date(ms);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function buildTimelineCatalog(options: {
  workspaceEvents: EQPEvent[];
  historicalEvents: HistoricalEarthquakeRecord[];
  sourceFilter?: TimelineSourceFilter;
  minMagnitude?: number | null;
  viewportBounds?: GeoViewportBounds | null;
}): TimelineEventPoint[] {
  const {
    workspaceEvents,
    historicalEvents,
    sourceFilter = 'all',
    minMagnitude = null,
    viewportBounds = null,
  } = options;

  const points: TimelineEventPoint[] = [];

  if (sourceFilter === 'all' || sourceFilter === 'workspace') {
    for (const ev of workspaceEvents) {
      if (isEventUnlocated(ev)) continue;
      if (!Number.isFinite(ev.lat) || !Number.isFinite(ev.lon)) continue;
      const originTimeMs = parseEqpEventOriginMs(ev);
      if (originTimeMs === null) continue;
      const mag = getWorkspaceEventMagnitude(ev);
      const selectedCity = ev.cities.find((c) => c.id === ev.selectedCityId);
      const selectedTown = ev.towns.find((t) => t.id === ev.selectedTownId);
      const place =
        selectedCity?.label ??
        selectedTown?.label ??
        ev.centralOfficeBearing ??
        ev.filename;

      points.push({
        id: `ws-${ev.id}`,
        sourceKind: 'workspace',
        sourceLabel: `EQP ${ev.filename}`,
        originTimeMs,
        originTimeUtc: new Date(originTimeMs).toISOString(),
        lat: ev.lat,
        lon: ev.lon,
        depthKm: Number.isFinite(ev.depthKm) ? ev.depthKm : null,
        magnitude: mag.value,
        magnitudeScale: mag.scale,
        place,
        workspaceEventId: ev.id,
      });
    }
  }

  if (sourceFilter === 'all' || sourceFilter === 'historical') {
    for (const rec of historicalEvents) {
      if (!Number.isFinite(rec.lat) || !Number.isFinite(rec.lon)) continue;
      const originTimeMs = Number.isFinite(rec.originTimeMs)
        ? rec.originTimeMs
        : Date.parse(rec.originTimeUtc);
      if (!Number.isFinite(originTimeMs)) continue;

      // Deduplicate against already added workspace events within 60s & 0.08 deg
      const overlapsWorkspace = points.some(
        (ws) =>
          ws.sourceKind === 'workspace' &&
          Math.abs(ws.originTimeMs - originTimeMs) <= 60_000 &&
          Math.abs(ws.lat - rec.lat) <= 0.08 &&
          Math.abs(ws.lon - rec.lon) <= 0.08
      );
      if (overlapsWorkspace) continue;

      points.push({
        id: `hist-${rec.id}`,
        sourceKind: 'historical',
        sourceLabel: rec.dataSource || 'Historical Catalog',
        originTimeMs,
        originTimeUtc: rec.originTimeUtc || new Date(originTimeMs).toISOString(),
        lat: rec.lat,
        lon: rec.lon,
        depthKm: rec.depthKm !== null && Number.isFinite(rec.depthKm) ? rec.depthKm : null,
        magnitude:
          rec.magnitude !== null && Number.isFinite(rec.magnitude) ? rec.magnitude : null,
        magnitudeScale: rec.magnitudeType || 'M',
        place: rec.place || `${rec.lat.toFixed(2)}°N, ${rec.lon.toFixed(2)}°E`,
      });
    }
  }

  const filtered = points.filter((pt) => {
    if (
      minMagnitude !== null &&
      Number.isFinite(minMagnitude) &&
      minMagnitude > 0 &&
      (pt.magnitude === null || pt.magnitude < minMagnitude)
    ) {
      return false;
    }
    if (viewportBounds) {
      if (
        pt.lat < viewportBounds.minLat ||
        pt.lat > viewportBounds.maxLat ||
        pt.lon < viewportBounds.minLon ||
        pt.lon > viewportBounds.maxLon
      ) {
        return false;
      }
    }
    return true;
  });

  filtered.sort((a, b) => a.originTimeMs - b.originTimeMs);
  return filtered;
}

export function computeTimelineWindowBounds(
  sortedEvents: TimelineEventPoint[]
): TimelineWindowBounds | null {
  if (sortedEvents.length === 0) return null;
  const minMs = sortedEvents[0].originTimeMs;
  const maxMs = sortedEvents[sortedEvents.length - 1].originTimeMs;
  const spanMs = Math.max(1000, maxMs - minMs);
  return { minMs, maxMs, spanMs };
}

export function computeVisibleTimelineEvents(
  sortedEvents: TimelineEventPoint[],
  playheadMs: number,
  trailMode: TimelineTrailMode,
  totalSpanMs: number
): VisibleTimelineEvent[] {
  if (sortedEvents.length === 0 || !Number.isFinite(playheadMs)) return [];

  const trailWindowMs = getTrailWindowMs(trailMode);
  const windowStartMs =
    trailWindowMs !== null ? playheadMs - trailWindowMs : sortedEvents[0].originTimeMs;
  const effectiveSpanMs = Math.max(
    1000,
    trailWindowMs !== null ? trailWindowMs : totalSpanMs
  );
  const pulseThresholdMs = Math.max(60_000, Math.min(effectiveSpanMs * 0.045, 7 * 24 * 60 * 60 * 1000));

  const inWindow = sortedEvents.filter(
    (ev) => ev.originTimeMs <= playheadMs && ev.originTimeMs >= windowStartMs
  );

  return inWindow.map((ev, index) => {
    const ageMs = Math.max(0, playheadMs - ev.originTimeMs);
    const ageFraction = Math.max(0, Math.min(1, ageMs / effectiveSpanMs));
    const minOpacity = trailMode === 'cumulative' ? 0.42 : 0.24;
    const opacity = Number((1 - ageFraction * (1 - minOpacity)).toFixed(3));
    const isLatest = index === inWindow.length - 1;
    const isRecentPulse = isLatest || ageMs <= pulseThresholdMs;

    return {
      ...ev,
      ageFraction,
      opacity,
      isRecentPulse,
      sequenceOrder: index + 1,
      depthColor: getTimelineDepthColor(ev.depthKm),
      radiusPx: getTimelineMarkerRadiusPx(ev.magnitude),
    };
  });
}

export function computeTimelineTrendSummary(
  visibleEvents: VisibleTimelineEvent[],
  totalCount: number
): TimelineTrendSummary {
  if (visibleEvents.length === 0) {
    return {
      visibleCount: 0,
      totalCount,
      peakMagnitude: null,
      peakEvent: null,
      meanDepthKm: null,
      shallowCount: 0,
      intermediateCount: 0,
      deepCount: 0,
      unknownDepthCount: 0,
      centroidLat: null,
      centroidLon: null,
      netMigrationKm: null,
      migrationBearingLabel: null,
    };
  }

  let peakEvent: VisibleTimelineEvent | null = null;
  let peakMagnitude: number | null = null;
  let depthSum = 0;
  let depthCount = 0;
  let shallowCount = 0;
  let intermediateCount = 0;
  let deepCount = 0;
  let unknownDepthCount = 0;
  let latSum = 0;
  let lonSum = 0;

  for (const ev of visibleEvents) {
    latSum += ev.lat;
    lonSum += ev.lon;

    if (ev.magnitude !== null && Number.isFinite(ev.magnitude)) {
      if (peakMagnitude === null || ev.magnitude > peakMagnitude) {
        peakMagnitude = ev.magnitude;
        peakEvent = ev;
      }
    }

    if (ev.depthKm === null || !Number.isFinite(ev.depthKm)) {
      unknownDepthCount += 1;
    } else {
      depthSum += ev.depthKm;
      depthCount += 1;
      if (ev.depthKm <= 30) shallowCount += 1;
      else if (ev.depthKm <= 100) intermediateCount += 1;
      else deepCount += 1;
    }
  }

  let netMigrationKm: number | null = null;
  let migrationBearingLabel: string | null = null;
  if (visibleEvents.length >= 2) {
    const first = visibleEvents[0];
    const last = visibleEvents[visibleEvents.length - 1];
    const shift = computeDistanceAndBearing(first.lat, first.lon, last.lat, last.lon);
    netMigrationKm = Number(shift.distKm.toFixed(1));
    migrationBearingLabel = shift.quadrantLabel;
  }

  return {
    visibleCount: visibleEvents.length,
    totalCount,
    peakMagnitude,
    peakEvent,
    meanDepthKm: depthCount > 0 ? Number((depthSum / depthCount).toFixed(1)) : null,
    shallowCount,
    intermediateCount,
    deepCount,
    unknownDepthCount,
    centroidLat: Number((latSum / visibleEvents.length).toFixed(3)),
    centroidLon: Number((lonSum / visibleEvents.length).toFixed(3)),
    netMigrationKm,
    migrationBearingLabel,
  };
}

export function buildTimelineMigrationGeoJson(
  visibleEvents: VisibleTimelineEvent[]
): {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: Record<string, unknown>;
    geometry: {
      type: 'LineString';
      coordinates: Array<[number, number]>;
    };
  }>;
} {
  if (visibleEvents.length < 2) {
    return { type: 'FeatureCollection', features: [] };
  }
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          count: visibleEvents.length,
        },
        geometry: {
          type: 'LineString',
          coordinates: visibleEvents.map((ev) => [ev.lon, ev.lat]),
        },
      },
    ],
  };
}
