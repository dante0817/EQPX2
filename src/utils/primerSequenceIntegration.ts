import {
  type EQPEvent,
  FAULT_TRACES,
  ISLAND_POLYGONS,
  isEventUnlocated,
  type TectonicTrace,
} from '../data/eqpData.ts';
import {
  assembleEarthquakeSequence,
  computeTimelineRateSummary,
  DEFAULT_SEQUENCE_FILTERS,
  type SequenceAssemblyResult,
  type SequenceCandidateEvent,
  type SequenceFilterConfig,
  type TimelineRateSummary,
} from './earthquakeSequence.ts';
import {
  computeHistoricalSummaryStats,
  DEFAULT_HISTORICAL_FILTERS,
  filterHistoricalEvents,
  geodesicDistanceKm,
  type HistoricalEarthquakeRecord,
  type HistoricalFilterConfig,
  type HistoricalSummaryStats,
  parseActiveEventUtcMs,
} from './historicalSeismicity.ts';
import {
  computeCatalogCoverageSummary,
  type PrimerCatalogCoverageSummary,
} from './primerCatalogAdapters.ts';
import {
  computeCartographicScaleBar,
  computeMapBoundingBox,
  computePrimerEventFingerprint,
  isValidGeographicCoordinate,
  type PrimerMapExtent,
  type PrimerMapTheme,
  type PrimerNearestCityPin,
} from './primerMapFigure.ts';

export interface PrimerSequenceAnalysisConfig {
  filters: SequenceFilterConfig;
  nominatedMainshockRecordId: string | null;
  /**
   * Optional IDs of scientifically reviewed/accepted aftershocks (e.g. from a reviewed investigation).
   * When empty, sequence events are strictly reported as spatiotemporal candidates, never as confirmed aftershocks.
   */
  acceptedAftershockIds: string[];
  historicalRadiusKm: number;
  historicalLookbackYears: number;
  historicalMinMag: number;
  historicalMaxRows: number;
  mapExtent: PrimerMapExtent;
  mapTheme: PrimerMapTheme;
  dataCutoffUtc?: string;
}

export const DEFAULT_PRIMER_SEQUENCE_CONFIG: PrimerSequenceAnalysisConfig = {
  filters: {
    ...DEFAULT_SEQUENCE_FILTERS,
    radiusKm: 100,
    preDays: 7,
    postDays: 30,
    backgroundDays: 365,
    excludeDuplicates: true,
    binMode: 'day',
  },
  nominatedMainshockRecordId: null,
  acceptedAftershockIds: [],
  historicalRadiusKm: 150,
  historicalLookbackYears: 50,
  historicalMinMag: 5.0,
  historicalMaxRows: 12,
  mapExtent: 'focused',
  mapTheme: 'classic',
};

export interface PrimerDayCountBin {
  dayOffset: number;
  labelUtc: string;
  count: number;
  maxMag: number | null;
}

export interface PrimerMagDistributionBin {
  binLabel: string;
  binMin: number;
  binMax: number;
  count: number;
}

export interface PrimerHistoricalTableRow {
  recordId: string;
  eventId: string;
  originTimeUtc: string;
  originTimePst: string;
  lat: number;
  lon: number;
  depthKm: number | null;
  magnitude: number | null;
  magnitudeType: string;
  distanceKm: number;
  dataSource: string;
  catalogVersion: string;
  place: string;
}

export interface PrimerStage3FigureSvg {
  status: 'ready' | 'unavailable';
  unavailableReason?: string;
  svgMarkup: string;
  caption: string;
}

export interface PrimerSequenceStatistics {
  membershipBasis:
    | 'reviewed-sequence-membership'
    | 'candidate-spatiotemporal-window'
    | 'unavailable';
  referenceEventId: string;
  referenceOriginUtc: string | null;
  referenceOriginPst: string | null;
  nominatedMainshock: {
    recordId: string;
    eventId: string;
    originTimeUtc: string;
    magnitude: number | null;
    magnitudeType: string;
    distanceFromRefKm: number;
  } | null;
  totalCatalogCount: number;
  eligiblePostEventCount: number;
  candidateAftershockCount: number;
  scientificallyAcceptedAftershockCount: number | null;
  preEventCount: number;
  backgroundCount: number;
  excludedCount: number;
  exactDuplicateExcludedCount: number;
  uncertainDuplicateFlaggedCount: number;
  incompleteMissingDepthCount: number;
  incompleteMissingMagCount: number;
  uncertainLocationCount: number;
  magnitudesByScale: Array<{
    magType: string;
    count: number;
    min: number;
    max: number;
  }>;
  primaryMagScaleLabel: string | null;
  catalogMinMagnitude: number | null;
  catalogMaxMagnitude: number | null;
  hasMixedMagnitudeScales: boolean;
  maxAftershock: {
    eventId: string;
    magnitude: number;
    magnitudeType: string;
    originTimeUtc: string;
    distanceKm: number;
  } | null;
  countsByInterval: {
    within24h: number;
    within72h: number;
    within7d: number;
    within30d: number;
  };
  countsByDay: PrimerDayCountBin[];
  magnitudeDistribution: PrimerMagDistributionBin[];
  elapsedSinceReferenceHours: number | null;
  elapsedLabel: string;
  spatialDistribution: {
    minDistanceKm: number | null;
    medianDistanceKm: number | null;
    maxDistanceKm: number | null;
    knownDepthCount: number;
    missingDepthCount: number;
    meanDepthKm: number | null;
  };
  dataCutoffUtc: string;
  dataCutoffPst: string;
}

export interface PrimerHistoricalSeismicitySummary {
  status: 'ready' | 'unavailable';
  unavailableReason?: string;
  radiusKm: number;
  lookbackYears: number;
  minMag: number;
  totalMatchingCount: number;
  rows: PrimerHistoricalTableRow[];
  stats: HistoricalSummaryStats;
  caption: string;
  associationDisclaimer: string;
}

export interface PrimerStage3Provenance {
  inputFingerprint: string;
  referenceEventFingerprint: string;
  catalogVersion: number;
  catalogCount: number;
  sourceLabel: string;
  generatedAtUtc: string;
  reviewStatus: 'requires-scientific-review' | 'requires-info' | 'ready-for-review';
  limitations: string[];
  coverage: PrimerCatalogCoverageSummary;
}

export interface PrimerStage3Package {
  config: PrimerSequenceAnalysisConfig;
  statistics: PrimerSequenceStatistics;
  timelineSummary: TimelineRateSummary;
  historical: PrimerHistoricalSeismicitySummary;
  figures: {
    aftershockMap: PrimerStage3FigureSvg;
    activityChart: PrimerStage3FigureSvg;
    magnitudeChart: PrimerStage3FigureSvg;
  };
  provenance: PrimerStage3Provenance;
}

function escapeXml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatUtcAsPst(utcMsOrIso: number | string): string {
  const ms =
    typeof utcMsOrIso === 'number' ? utcMsOrIso : Date.parse(String(utcMsOrIso));
  if (!Number.isFinite(ms)) return 'Unavailable';
  const pstMs = ms + 8 * 3_600_000;
  const d = new Date(pstMs);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss} PST (UTC+8)`;
}

function formatElapsedDuration(hours: number | null): string {
  if (hours === null || !Number.isFinite(hours)) return 'Unavailable';
  if (hours < 0) return `Pre-cutoff (${Math.abs(hours).toFixed(1)} h before reference)`;
  const days = Math.floor(hours / 24);
  const remHours = hours - days * 24;
  if (days === 0) return `${hours.toFixed(1)} h`;
  return `${days} d ${remHours.toFixed(1)} h (${hours.toFixed(1)} h total)`;
}

export function computeStage3InputFingerprint(params: {
  event: EQPEvent;
  primaryLocationLabel?: string | null;
  isPlotResultStale?: boolean;
  catalogVersion: number;
  catalogCount: number;
  config: PrimerSequenceAnalysisConfig;
}): string {
  const refFp = computePrimerEventFingerprint(params.event, {
    primaryLocationLabel: params.primaryLocationLabel,
    isPlotResultStale: params.isPlotResultStale,
  });
  const payload = JSON.stringify({
    refFp,
    catalogVersion: params.catalogVersion,
    catalogCount: params.catalogCount,
    filters: params.config.filters,
    mainshockId: params.config.nominatedMainshockRecordId,
    acceptedIds: [...params.config.acceptedAftershockIds].sort(),
    hist: [
      params.config.historicalRadiusKm,
      params.config.historicalLookbackYears,
      params.config.historicalMinMag,
      params.config.historicalMaxRows,
    ],
    mapExtent: params.config.mapExtent,
    mapTheme: params.config.mapTheme,
  });

  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9 ^ payload.length;
  for (let i = 0; i < payload.length; i++) {
    const ch = payload.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= ch + (i & 0xff);
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

function createStarPoints(cx: number, cy: number, outerR: number, innerR: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}

function generateAftershockMapSvg(params: {
  event: EQPEvent;
  config: PrimerSequenceAnalysisConfig;
  assembly: SequenceAssemblyResult;
  postEvents: SequenceCandidateEvent[];
  preAndBgEvents: SequenceCandidateEvent[];
  historicalRows: PrimerHistoricalTableRow[];
  acceptedSet: Set<string>;
  nominatedMainshock: PrimerSequenceStatistics['nominatedMainshock'];
  nearestCitiesPins: PrimerNearestCityPin[];
  statistics: PrimerSequenceStatistics;
}): PrimerStage3FigureSvg {
  const {
    event,
    config,
    postEvents,
    preAndBgEvents,
    historicalRows,
    acceptedSet,
    nominatedMainshock,
    nearestCitiesPins,
    statistics,
  } = params;

  if (isEventUnlocated(event) || !isValidGeographicCoordinate(event.lat, event.lon)) {
    return {
      status: 'unavailable',
      unavailableReason:
        'Reference earthquake coordinates are unlocated or invalid; spatial sequence map unavailable.',
      svgMarkup: '',
      caption: `Figure 2. Sequence & historical distribution map unavailable (reference location pending).`,
    };
  }

  const totalPlotted =
    postEvents.length + preAndBgEvents.length + historicalRows.length;
  if (totalPlotted === 0) {
    return {
      status: 'unavailable',
      unavailableReason:
        'No catalog records fall within the configured spatial/temporal window. Import regional catalog data or adjust filters.',
      svgMarkup: '',
      caption: `Figure 2. Sequence & historical distribution map unavailable (0 catalog records in window for R=${config.filters.radiusKm} km).`,
    };
  }

  const isPrintBw = config.mapTheme === 'print-bw';
  const svgW = 760;
  const svgH = 492;
  const padL = 48;
  const padR = 24;
  const padT = 36;
  const plotW = svgW - padL - padR; // 688
  const plotH = 368;
  const legendTop = padT + plotH + 18; // 422

  const bbox = computeMapBoundingBox(event.lat, event.lon, config.mapExtent);
  const { minLon, maxLon, minLat, maxLat, tickStep } = bbox;
  const project = (lon: number, lat: number): [number, number] => [
    padL + ((lon - minLon) / Math.max(0.2, maxLon - minLon)) * plotW,
    padT + ((maxLat - lat) / Math.max(0.2, maxLat - minLat)) * plotH,
  ];

  const [refX, refY] = project(event.lon, event.lat);
  const midLat = (minLat + maxLat) / 2;
  const { scaleKm, scalePx } = computeCartographicScaleBar(
    minLon,
    maxLon,
    midLat,
    plotW
  );

  // Search radius circle (semi-axes on equirectangular grid)
  const radLatDeg = config.filters.radiusKm / 110.574;
  const radLonDeg =
    config.filters.radiusKm / (111.32 * Math.max(0.25, Math.cos((event.lat * Math.PI) / 180)));
  const radRx = (radLonDeg / Math.max(0.2, maxLon - minLon)) * plotW;
  const radRy = (radLatDeg / Math.max(0.2, maxLat - minLat)) * plotH;

  const lonTicks: number[] = [];
  for (let l = Math.ceil(minLon / tickStep) * tickStep; l <= maxLon + 1e-6; l += tickStep) {
    lonTicks.push(Number(l.toFixed(2)));
  }
  const latTicks: number[] = [];
  for (let l = Math.ceil(minLat / tickStep) * tickStep; l <= maxLat + 1e-6; l += tickStep) {
    latTicks.push(Number(l.toFixed(2)));
  }

  const gridAndTicks = [
    ...lonTicks.map((l) => {
      const [x] = project(l, minLat);
      if (x < padL + 6 || x > padL + plotW - 6) return '';
      return `
        <line x1="${x.toFixed(1)}" y1="${padT}" x2="${x.toFixed(1)}" y2="${padT + plotH}" stroke="${
        isPrintBw ? '#e2e8f0' : '#93c5fd'
      }" stroke-width="0.6" stroke-dasharray="3 3" />
        <text x="${x.toFixed(1)}" y="${padT + plotH + 12}" text-anchor="middle" font-size="8.5" font-family="Consolas, monospace" fill="#334155">${l}°E</text>
      `;
    }),
    ...latTicks.map((l) => {
      const [, y] = project(minLon, l);
      if (y < padT + 6 || y > padT + plotH - 6) return '';
      return `
        <line x1="${padL}" y1="${y.toFixed(1)}" x2="${padL + plotW}" y2="${y.toFixed(1)}" stroke="${
        isPrintBw ? '#e2e8f0' : '#93c5fd'
      }" stroke-width="0.6" stroke-dasharray="3 3" />
        <text x="${padL - 5}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="8.5" font-family="Consolas, monospace" fill="#334155">${l}°N</text>
      `;
    }),
  ].join('\n');

  const islandsSvg = ISLAND_POLYGONS.map((island) => {
    const pts = island.points
      .map(([lon, lat]) => {
        const [x, y] = project(lon, lat);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
    return `<polygon points="${pts}" fill="${isPrintBw ? '#e2e8f0' : '#f4f1ea'}" stroke="#64748b" stroke-width="0.95" stroke-linejoin="round" />`;
  }).join('\n');

  const faultsSvg = FAULT_TRACES.map((t: TectonicTrace) => {
    const d = t.points
      .map(([lon, lat], i) => {
        const [x, y] = project(lon, lat);
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
    const stroke =
      t.kind === 'boundary'
        ? isPrintBw
          ? '#475569'
          : '#7c3aed'
        : isPrintBw
          ? '#1e293b'
          : '#b91c1c';
    return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="1.15" stroke-dasharray="${
      t.kind === 'boundary' ? '5 3' : '3.5 2.5'
    }" opacity="0.72" />`;
  }).join('\n');

  // Historical background events (teal/slate diamonds)
  const histSvg = historicalRows
    .map((h) => {
      const [x, y] = project(h.lon, h.lat);
      const r = h.magnitude !== null ? Math.max(3.5, Math.min(8, h.magnitude * 1.1)) : 4;
      const pts = `${x.toFixed(1)},${(y - r).toFixed(1)} ${(x + r).toFixed(1)},${y.toFixed(
        1
      )} ${x.toFixed(1)},${(y + r).toFixed(1)} ${(x - r).toFixed(1)},${y.toFixed(1)}`;
      return `<polygon points="${pts}" fill="${
        isPrintBw ? '#94a3b8' : '#0d9488'
      }" fill-opacity="0.78" stroke="#0f172a" stroke-width="0.65" />`;
    })
    .join('\n');

  // Pre-event / background catalog events within window (hollow circles)
  const preBgSvg = preAndBgEvents
    .map((ev) => {
      const [x, y] = project(ev.record.lon, ev.record.lat);
      const mag = ev.record.magnitude ?? 2.5;
      const r = Math.max(2.5, Math.min(7.5, (mag - 1.2) * 1.3));
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(
        1
      )}" fill="none" stroke="#475569" stroke-width="1" opacity="0.7" />`;
    })
    .join('\n');

  // Post-event sequence earthquakes (distinguish scientifically reviewed vs candidate)
  const postSvg = postEvents
    .map((ev) => {
      const [x, y] = project(ev.record.lon, ev.record.lat);
      const mag = ev.record.magnitude ?? 2.5;
      const r = Math.max(3.0, Math.min(9.5, (mag - 1.0) * 1.5));
      const isReviewed = acceptedSet.has(ev.record.id);
      const fill = isPrintBw
        ? isReviewed
          ? '#0f172a'
          : '#64748b'
        : isReviewed
          ? '#991b1b'
          : '#f59e0b';
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(
        1
      )}" fill="${fill}" fill-opacity="0.82" stroke="#ffffff" stroke-width="0.7" />`;
    })
    .join('\n');

  // Nominated mainshock overlay if different from active ref
  let msSvg = '';
  if (nominatedMainshock) {
    const match = [...postEvents, ...preAndBgEvents].find(
      (e) => e.record.id === nominatedMainshock.recordId
    );
    const msRec = match?.record;
    if (msRec) {
      const [mx, my] = project(msRec.lon, msRec.lat);
      msSvg = `<rect x="${(mx - 6).toFixed(1)}" y="${(my - 6).toFixed(
        1
      )}" width="12" height="12" fill="#facc15" stroke="#0f172a" stroke-width="1.3" />`;
    }
  }

  // City labels
  const citySvg = nearestCitiesPins
    .slice(0, 6)
    .map((c) => {
      const [cx, cy] = project(c.lon, c.lat);
      if (cx < padL + 10 || cx > padL + plotW - 10 || cy < padT + 10 || cy > padT + plotH - 10) {
        return '';
      }
      return `
        <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="2.5" fill="#0f172a" stroke="#ffffff" stroke-width="0.7" />
        <text x="${(cx + 5).toFixed(1)}" y="${(cy - 3).toFixed(
        1
      )}" font-size="8.5" font-weight="600" font-family="Segoe UI, Arial, sans-serif" fill="#0f172a" stroke="#ffffff" stroke-width="2" paint-order="stroke">${escapeXml(
        c.name
      )}</text>
      `;
    })
    .join('\n');

  const isCandidateOnly = statistics.membershipBasis !== 'reviewed-sequence-membership';
  const bannerLabel = isCandidateOnly
    ? 'CANDIDATE SPATIOTEMPORAL WINDOW — NOT REVIEWED AFTERSHOCK MEMBERSHIP'
    : `REVIEWED SEQUENCE MEMBERSHIP (${acceptedSet.size} ACCEPTED AFTERSHOCKS)`;

  const clipId = `s3-map-clip-${event.id.replace(/[^a-zA-Z0-9]/g, '')}`;
  const northX = padL + plotW - 22;
  const northY = padT + 22;
  const scaleX = padL + 12;
  const scaleY = padT + plotH - 22;

  const svgMarkup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" role="img" aria-label="Sequence and historical seismicity distribution map" style="background:#ffffff;display:block;max-width:100%;height:auto;">
  <defs>
    <clipPath id="${clipId}">
      <rect x="${padL}" y="${padT}" width="${plotW}" height="${plotH}" />
    </clipPath>
  </defs>
  <rect x="0" y="0" width="${svgW}" height="${svgH}" fill="#ffffff" />
  <text x="${padL}" y="15" font-size="10.5" font-weight="700" font-family="Segoe UI, Arial, sans-serif" fill="#0f172a">${escapeXml(
    `SEQUENCE & HISTORICAL SEISMICITY MAP — REF ${event.id} (R=${config.filters.radiusKm} km)`
  )}</text>
  <text x="${padL + plotW}" y="15" text-anchor="end" font-size="8.5" font-weight="700" font-family="Consolas, monospace" fill="${
    isCandidateOnly ? '#92400e' : '#065f46'
  }">${escapeXml(bannerLabel)}</text>
  <g clip-path="url(#${clipId})">
    <rect x="${padL}" y="${padT}" width="${plotW}" height="${plotH}" fill="${
    isPrintBw ? '#f8fafc' : '#dceefb'
  }" />
    ${gridAndTicks}
    ${islandsSvg}
    ${faultsSvg}
    <ellipse cx="${refX.toFixed(1)}" cy="${refY.toFixed(1)}" rx="${radRx.toFixed(
    1
  )}" ry="${radRy.toFixed(
    1
  )}" fill="none" stroke="#005a94" stroke-width="1.1" stroke-dasharray="6 4" opacity="0.7" />
    ${histSvg}
    ${preBgSvg}
    ${postSvg}
    ${msSvg}
    ${citySvg}
    <polygon points="${createStarPoints(refX, refY, 9.5, 4.2)}" fill="${
    isPrintBw ? '#0f172a' : '#dc2626'
  }" stroke="#ffffff" stroke-width="1" />
    <g transform="translate(${northX}, ${northY})">
      <circle cx="0" cy="0" r="13" fill="rgba(255,255,255,0.92)" stroke="#334155" stroke-width="0.8" />
      <polygon points="0,-8 -3.8,3 0,0.8 3.8,3" fill="#0f172a" />
      <text x="0" y="9.5" text-anchor="middle" font-size="7" font-weight="700" font-family="Segoe UI, Arial, sans-serif" fill="#0f172a">N</text>
    </g>
    <g transform="translate(${scaleX}, ${scaleY})">
      <rect x="-5" y="-11" width="${(scalePx + 14).toFixed(
    1
  )}" height="24" rx="2" fill="rgba(255,255,255,0.92)" stroke="#334155" stroke-width="0.7" />
      <text x="${(scalePx / 2).toFixed(
    1
  )}" y="-1" text-anchor="middle" font-size="8" font-weight="700" font-family="Consolas, monospace" fill="#0f172a">0 — ${scaleKm} km</text>
      <rect x="0" y="3" width="${(scalePx / 2).toFixed(
    1
  )}" height="4.5" fill="#0f172a" />
      <rect x="${(scalePx / 2).toFixed(1)}" y="3" width="${(scalePx / 2).toFixed(
    1
  )}" height="4.5" fill="#ffffff" stroke="#0f172a" stroke-width="0.6" />
    </g>
  </g>
  <rect x="${padL}" y="${padT}" width="${plotW}" height="${plotH}" fill="none" stroke="#0f172a" stroke-width="1.1" />
  <rect x="${padL}" y="${legendTop}" width="${plotW}" height="52" fill="#f8fafc" stroke="#cbd5e1" stroke-width="0.9" />
  <g transform="translate(${padL + 14}, ${legendTop + 15})">
    <polygon points="${createStarPoints(0, 0, 5, 2.2)}" fill="${
    isPrintBw ? '#0f172a' : '#dc2626'
  }" stroke="#0f172a" stroke-width="0.5" />
    <text x="9" y="3" font-size="8.5" font-family="Segoe UI, Arial, sans-serif" fill="#0f172a">Ref EQ (${escapeXml(
      event.id
    )})</text>
  </g>
  <g transform="translate(${padL + 148}, ${legendTop + 15})">
    <circle cx="0" cy="0" r="4" fill="${
      isPrintBw ? '#64748b' : isCandidateOnly ? '#f59e0b' : '#991b1b'
    }" stroke="#0f172a" stroke-width="0.5" />
    <text x="8" y="3" font-size="8.5" font-family="Segoe UI, Arial, sans-serif" fill="#0f172a">${
      isCandidateOnly
        ? `Post-Event Candidates (${postEvents.length})`
        : `Accepted Aftershocks (${postEvents.length})`
    }</text>
  </g>
  <g transform="translate(${padL + 332}, ${legendTop + 15})">
    <circle cx="0" cy="0" r="3.5" fill="none" stroke="#475569" stroke-width="1" />
    <text x="8" y="3" font-size="8.5" font-family="Segoe UI, Arial, sans-serif" fill="#0f172a">Pre/Bg (${
      preAndBgEvents.length
    })</text>
  </g>
  <g transform="translate(${padL + 422}, ${legendTop + 15})">
    <polygon points="0,-4 4,0 0,4 -4,0" fill="${
      isPrintBw ? '#94a3b8' : '#0d9488'
    }" stroke="#0f172a" stroke-width="0.6" />
    <text x="8" y="3" font-size="8.5" font-family="Segoe UI, Arial, sans-serif" fill="#0f172a">Historical ≥M${config.historicalMinMag.toFixed(
      1
    )} (${historicalRows.length})</text>
  </g>
  <g transform="translate(${padL + 566}, ${legendTop + 15})">
    <circle cx="0" cy="0" r="5" fill="none" stroke="#005a94" stroke-width="1" stroke-dasharray="3 2" />
    <text x="8" y="3" font-size="8.5" font-family="Segoe UI, Arial, sans-serif" fill="#0f172a">${
      config.filters.radiusKm
    } km radius</text>
  </g>
  <text x="${padL + 10}" y="${legendTop + 37}" font-size="8" font-family="Segoe UI, Arial, sans-serif" fill="#475569">${escapeXml(
    `Cutoff: ${statistics.dataCutoffUtc} | Note: Spatiotemporal window membership & proximity do not prove physical rupture causation or fault association.`
  )}</text>
</svg>`;

  const captionMode = isCandidateOnly
    ? 'spatiotemporal candidate post-event earthquakes (unreviewed membership)'
    : 'scientifically reviewed sequence earthquakes';
  return {
    status: 'ready',
    svgMarkup,
    caption: `Figure 2. Spatial distribution of ${postEvents.length} ${captionMode} within ${config.filters.radiusKm} km of Reference Event ${event.id}, plotted alongside ${preAndBgEvents.length} pre-event/background events and ${historicalRows.length} regional historical earthquakes (M ≥ ${config.historicalMinMag.toFixed(1)}).`,
  };
}

function generateActivityTimelineSvg(params: {
  event: EQPEvent;
  countsByDay: PrimerDayCountBin[];
  statistics: PrimerSequenceStatistics;
  timelineSummary: TimelineRateSummary;
  theme: PrimerMapTheme;
}): PrimerStage3FigureSvg {
  const { event, countsByDay, statistics, timelineSummary, theme } = params;
  if (countsByDay.length === 0) {
    return {
      status: 'unavailable',
      unavailableReason:
        'No timestamped sequence earthquakes fall within the active observation window.',
      svgMarkup: '',
      caption: `Figure 3. Earthquake activity vs. time chart unavailable (no timestamped events in window).`,
    };
  }

  const isPrintBw = theme === 'print-bw';
  const svgW = 760;
  const svgH = 290;
  const padL = 52;
  const padR = 54;
  const padT = 36;
  const plotW = svgW - padL - padR; // 654
  const plotH = 194;
  const baseLineY = padT + plotH;

  const maxDaily = Math.max(1, ...countsByDay.map((b) => b.count));
  let cumulative = 0;
  const cumSeries = countsByDay.map((b) => {
    cumulative += b.count;
    return cumulative;
  });
  const maxCum = Math.max(1, cumulative);

  const barStep = plotW / countsByDay.length;
  const barW = Math.max(4, Math.min(26, barStep * 0.72));

  const barsSvg = countsByDay
    .map((b, idx) => {
      const cx = padL + (idx + 0.5) * barStep;
      const h = (b.count / maxDaily) * (plotH - 8);
      const y = baseLineY - h;
      const isPost = b.dayOffset >= 0;
      const fill = isPrintBw
        ? isPost
          ? '#334155'
          : '#cbd5e1'
        : isPost
          ? '#005a94'
          : '#94a3b8';
      return `<rect x="${(cx - barW / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(
        1
      )}" height="${Math.max(0.5, h).toFixed(1)}" fill="${fill}" stroke="#ffffff" stroke-width="0.5" />`;
    })
    .join('\n');

  const cumPoints = cumSeries
    .map((c, idx) => {
      const cx = padL + (idx + 0.5) * barStep;
      const cy = baseLineY - (c / maxCum) * (plotH - 8);
      return `${cx.toFixed(1)},${cy.toFixed(1)}`;
    })
    .join(' ');

  // Reference t=0 line between negative and non-negative dayOffsets
  const firstPostIdx = countsByDay.findIndex((b) => b.dayOffset >= 0);
  const tZeroLineSvg =
    firstPostIdx > 0
      ? `<line x1="${(padL + firstPostIdx * barStep).toFixed(
          1
        )}" y1="${padT}" x2="${(padL + firstPostIdx * barStep).toFixed(
          1
        )}" y2="${baseLineY}" stroke="#dc2626" stroke-width="1.2" stroke-dasharray="4 3" />
         <text x="${(padL + firstPostIdx * barStep + 4).toFixed(1)}" y="${
          padT + 12
        }" font-size="8" font-weight="700" font-family="Consolas, monospace" fill="#b91c1c">t = 0 (Ref)</text>`
      : '';

  // X ticks (up to 7 evenly spaced labels)
  const labelStride = Math.max(1, Math.ceil(countsByDay.length / 7));
  const xLabelsSvg = countsByDay
    .map((b, idx) => {
      if (idx % labelStride !== 0 && idx !== countsByDay.length - 1) return '';
      const cx = padL + (idx + 0.5) * barStep;
      return `<text x="${cx.toFixed(1)}" y="${
        baseLineY + 13
      }" text-anchor="middle" font-size="8" font-family="Consolas, monospace" fill="#334155">${
        b.dayOffset >= 0 ? `+${b.dayOffset}d` : `${b.dayOffset}d`
      }</text>`;
    })
    .join('\n');

  const yTicks = [0, Math.ceil(maxDaily / 2), maxDaily];
  const yTicksSvg = yTicks
    .map((v) => {
      const y = baseLineY - (v / maxDaily) * (plotH - 8);
      return `
        <line x1="${padL}" y1="${y.toFixed(1)}" x2="${padL + plotW}" y2="${y.toFixed(
        1
      )}" stroke="#e2e8f0" stroke-width="0.7" />
        <text x="${padL - 6}" y="${(y + 3).toFixed(
        1
      )}" text-anchor="end" font-size="8.5" font-family="Consolas, monospace" fill="#334155">${v}</text>
      `;
    })
    .join('\n');

  const svgMarkup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" role="img" aria-label="Earthquake activity versus time chart" style="background:#ffffff;display:block;max-width:100%;height:auto;">
  <rect x="0" y="0" width="${svgW}" height="${svgH}" fill="#ffffff" />
  <text x="${padL}" y="16" font-size="10.5" font-weight="700" font-family="Segoe UI, Arial, sans-serif" fill="#0f172a">${escapeXml(
    `EARTHQUAKE ACTIVITY VS. TIME (DAILY COUNTS & CUMULATIVE TOTAL) — EVENT ${event.id}`
  )}</text>
  <text x="${padL + plotW}" y="16" text-anchor="end" font-size="8" font-family="Consolas, monospace" fill="#475569">${escapeXml(
    `Gaps ≥ 72h: ${timelineSummary.gaps.length}`
  )}</text>
  ${yTicksSvg}
  ${barsSvg}
  ${tZeroLineSvg}
  <polyline points="${cumPoints}" fill="none" stroke="${
    isPrintBw ? '#0f172a' : '#d97706'
  }" stroke-width="1.8" />
  <rect x="${padL}" y="${padT}" width="${plotW}" height="${plotH}" fill="none" stroke="#334155" stroke-width="1" />
  ${xLabelsSvg}
  <text x="14" y="${
    padT + plotH / 2
  }" transform="rotate(-90 14 ${
    padT + plotH / 2
  })" text-anchor="middle" font-size="8.5" font-weight="600" font-family="Segoe UI, Arial, sans-serif" fill="#334155">Events / Day</text>
  <text x="${padL + plotW + 6}" y="${padT + 8}" font-size="8" font-family="Consolas, monospace" fill="${
    isPrintBw ? '#0f172a' : '#b45309'
  }">${maxCum}</text>
  <text x="${svgW - 12}" y="${
    padT + plotH / 2
  }" transform="rotate(90 ${svgW - 12} ${
    padT + plotH / 2
  })" text-anchor="middle" font-size="8.5" font-weight="600" font-family="Segoe UI, Arial, sans-serif" fill="${
    isPrintBw ? '#0f172a' : '#b45309'
  }">Cumulative</text>
  <text x="${padL}" y="${svgH - 12}" font-size="8" font-family="Segoe UI, Arial, sans-serif" fill="#475569">${escapeXml(
    `Descriptive catalog counts only (no Omori/ETAS forecast fitted). Cutoff: ${statistics.dataCutoffUtc}`
  )}</text>
</svg>`;

  return {
    status: 'ready',
    svgMarkup,
    caption: `Figure 3. Observed daily earthquake counts (bars) and cumulative count (curve) relative to Reference Event ${event.id}. Descriptive catalog observation up to ${statistics.dataCutoffPst}; zero-count bins may reflect detection gaps rather than absence of seismicity.`,
  };
}

function generateMagnitudeDistributionSvg(params: {
  event: EQPEvent;
  bins: PrimerMagDistributionBin[];
  statistics: PrimerSequenceStatistics;
  theme: PrimerMapTheme;
}): PrimerStage3FigureSvg {
  const { event, bins, statistics, theme } = params;
  if (bins.length === 0) {
    return {
      status: 'unavailable',
      unavailableReason:
        'No numeric catalog magnitudes are available within the filtered sequence.',
      svgMarkup: '',
      caption: `Figure 4. Magnitude distribution chart unavailable (missing numeric magnitudes).`,
    };
  }

  const isPrintBw = theme === 'print-bw';
  const svgW = 760;
  const svgH = 248;
  const padL = 52;
  const padR = 24;
  const padT = 36;
  const plotW = svgW - padL - padR; // 684
  const plotH = 152;
  const baseLineY = padT + plotH;

  const maxCount = Math.max(1, ...bins.map((b) => b.count));
  const step = plotW / bins.length;
  const barW = Math.max(10, Math.min(46, step * 0.68));

  const yTicks = [0, Math.ceil(maxCount / 2), maxCount];
  const yTicksSvg = yTicks
    .map((v) => {
      const y = baseLineY - (v / maxCount) * (plotH - 10);
      return `
        <line x1="${padL}" y1="${y.toFixed(1)}" x2="${padL + plotW}" y2="${y.toFixed(
        1
      )}" stroke="#e2e8f0" stroke-width="0.7" />
        <text x="${padL - 6}" y="${(y + 3).toFixed(
        1
      )}" text-anchor="end" font-size="8.5" font-family="Consolas, monospace" fill="#334155">${v}</text>
      `;
    })
    .join('\n');

  const barsSvg = bins
    .map((b, idx) => {
      const cx = padL + (idx + 0.5) * step;
      const h = (b.count / maxCount) * (plotH - 12);
      const y = baseLineY - h;
      return `
        <rect x="${(cx - barW / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(
        1
      )}" height="${Math.max(1, h).toFixed(1)}" fill="${
        isPrintBw ? '#334155' : '#0f766e'
      }" stroke="#ffffff" stroke-width="0.6" />
        <text x="${cx.toFixed(1)}" y="${(y - 3).toFixed(
        1
      )}" text-anchor="middle" font-size="8" font-weight="700" font-family="Consolas, monospace" fill="#0f172a">${
        b.count > 0 ? b.count : ''
      }</text>
        <text x="${cx.toFixed(1)}" y="${
        baseLineY + 13
      }" text-anchor="middle" font-size="8" font-family="Consolas, monospace" fill="#334155">${escapeXml(
        b.binLabel
      )}</text>
      `;
    })
    .join('\n');

  const scaleTitle = statistics.hasMixedMagnitudeScales
    ? `MULTIPLE SCALES (${statistics.magnitudesByScale.map((m) => m.magType).join('/')}) — UNHOMOGENIZED COUNTS`
    : `SCALE: ${statistics.primaryMagScaleLabel ?? 'Reported Mag'}`;

  const svgMarkup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" role="img" aria-label="Magnitude distribution chart" style="background:#ffffff;display:block;max-width:100%;height:auto;">
  <rect x="0" y="0" width="${svgW}" height="${svgH}" fill="#ffffff" />
  <text x="${padL}" y="16" font-size="10.5" font-weight="700" font-family="Segoe UI, Arial, sans-serif" fill="#0f172a">${escapeXml(
    `CATALOG MAGNITUDE DISTRIBUTION — EVENT ${event.id}`
  )}</text>
  <text x="${padL + plotW}" y="16" text-anchor="end" font-size="8" font-weight="700" font-family="Consolas, monospace" fill="${
    statistics.hasMixedMagnitudeScales ? '#92400e' : '#0f766e'
  }">${escapeXml(scaleTitle)}</text>
  ${yTicksSvg}
  ${barsSvg}
  <rect x="${padL}" y="${padT}" width="${plotW}" height="${plotH}" fill="none" stroke="#334155" stroke-width="1" />
  <text x="14" y="${
    padT + plotH / 2
  }" transform="rotate(-90 14 ${
    padT + plotH / 2
  })" text-anchor="middle" font-size="8.5" font-weight="600" font-family="Segoe UI, Arial, sans-serif" fill="#334155">Count</text>
  <text x="${padL}" y="${svgH - 12}" font-size="8" font-family="Segoe UI, Arial, sans-serif" fill="#475569">${escapeXml(
    statistics.hasMixedMagnitudeScales
      ? 'Warning: Multiple magnitude types in source catalog; do not interpret mixed-scale counts as a homogeneous Gutenberg–Richter b-value curve.'
      : `Single reported scale (${statistics.primaryMagScaleLabel ?? 'N/A'}); network completeness threshold limits low-magnitude counts.`
  )}</text>
</svg>`;

  return {
    status: 'ready',
    svgMarkup,
    caption: `Figure 4. Magnitude distribution of ${statistics.eligiblePostEventCount} eligible post-event catalog earthquakes${
      statistics.hasMixedMagnitudeScales
        ? ' (grouped across reported catalog scales; not homogenized)'
        : statistics.primaryMagScaleLabel
          ? ` (${statistics.primaryMagScaleLabel})`
          : ''
    }.`,
  };
}

/**
 * Generates the complete Stage 3 Aftershock & Historical Seismicity statistical, tabular, and figure package.
 * Never mutates the input EQPEvent or catalog records.
 */
export function buildPrimerStage3Package(params: {
  event: EQPEvent;
  catalog: HistoricalEarthquakeRecord[];
  catalogVersion: number;
  sourceLabel: string;
  config?: Partial<PrimerSequenceAnalysisConfig>;
  primaryLocationLabel?: string | null;
  isPlotResultStale?: boolean;
  nearestCitiesPins?: PrimerNearestCityPin[];
}): PrimerStage3Package {
  const config: PrimerSequenceAnalysisConfig = {
    ...DEFAULT_PRIMER_SEQUENCE_CONFIG,
    ...(params.config ?? {}),
    filters: {
      ...DEFAULT_SEQUENCE_FILTERS,
      ...DEFAULT_PRIMER_SEQUENCE_CONFIG.filters,
      ...(params.config?.filters ?? {}),
    },
  };

  const nowUtc = config.dataCutoffUtc || new Date().toISOString();
  const cutoffMs = Date.parse(nowUtc) || Date.now();
  const refTimeMs = parseActiveEventUtcMs(params.event);
  const coverage = computeCatalogCoverageSummary(params.catalog);
  const refFp = computePrimerEventFingerprint(params.event, {
    primaryLocationLabel: params.primaryLocationLabel,
    isPlotResultStale: params.isPlotResultStale,
  });

  // Reuse existing sequence assembly engine
  const assembly = assembleEarthquakeSequence({
    catalog: params.catalog,
    activeEvent: params.event,
    filters: config.filters,
    candidateMainshockId: config.nominatedMainshockRecordId,
    manualIncludedIds: new Set<string>(),
    manualExcludedIds: new Set<string>(),
    manualRoles: {},
  });

  const timelineSummary = computeTimelineRateSummary({
    selectedEvents: assembly.selectedEvents,
    referenceTimeMs: assembly.referenceTimeMs,
    filters: config.filters,
  });

  const acceptedSet = new Set<string>(config.acceptedAftershockIds);

  // Exclude exact reference event match and nominated mainshock itself from aftershock counts
  const isAnchorOrRef = (row: SequenceCandidateEvent): boolean =>
    row.isReferenceMatch ||
    row.record.eventId.trim().toLowerCase() === params.event.id.trim().toLowerCase() ||
    (config.nominatedMainshockRecordId !== null &&
      row.record.id === config.nominatedMainshockRecordId);

  const nominatedRecord = config.nominatedMainshockRecordId
    ? params.catalog.find((r) => r.id === config.nominatedMainshockRecordId) ?? null
    : null;
  const nominatedMainshock = nominatedRecord
    ? {
        recordId: nominatedRecord.id,
        eventId: nominatedRecord.eventId,
        originTimeUtc: nominatedRecord.originTimeUtc,
        magnitude: nominatedRecord.magnitude,
        magnitudeType: nominatedRecord.magnitudeType,
        distanceFromRefKm: !isEventUnlocated(params.event)
          ? Number(
              geodesicDistanceKm(
                params.event.lat,
                params.event.lon,
                nominatedRecord.lat,
                nominatedRecord.lon
              ).toFixed(2)
            )
          : 0,
      }
    : null;

  const anchorMs = nominatedRecord ? nominatedRecord.originTimeMs : refTimeMs;

  const postEvents: SequenceCandidateEvent[] = [];
  const preAndBgEvents: SequenceCandidateEvent[] = [];

  for (const row of assembly.selectedEvents) {
    if (isAnchorOrRef(row)) continue;
    if (anchorMs !== null) {
      if (row.record.originTimeMs > anchorMs && row.record.originTimeMs <= cutoffMs) {
        postEvents.push(row);
      } else if (row.record.originTimeMs < anchorMs) {
        preAndBgEvents.push(row);
      }
    } else if (row.window === 'post-event') {
      postEvents.push(row);
    } else {
      preAndBgEvents.push(row);
    }
  }

  // Exact duplicates skipped vs uncertain cross-source matches
  const exactDuplicateExcludedCount = assembly.events.filter(
    (e) => e.isDuplicate && !e.duplicateUncertain
  ).length;
  const uncertainDuplicateFlaggedCount = assembly.uncertainDuplicateCount;

  // Missing fields across selected post-event pool
  const incompleteMissingDepthCount = postEvents.filter((e) => e.record.depthKm === null).length;
  const incompleteMissingMagCount = postEvents.filter(
    (e) => e.record.magnitude === null || !Number.isFinite(e.record.magnitude)
  ).length;
  const uncertainLocationCount = postEvents.filter((e) => e.record.locationUncertain).length;

  // Magnitude stats strictly segmented by scale
  const scaleBuckets = new Map<string, number[]>();
  const validPostMags: Array<{ row: SequenceCandidateEvent; mag: number }> = [];
  for (const row of postEvents) {
    if (row.record.magnitude !== null && Number.isFinite(row.record.magnitude)) {
      const mt = row.record.magnitudeType || 'Unknown';
      const arr = scaleBuckets.get(mt) ?? [];
      arr.push(row.record.magnitude);
      scaleBuckets.set(mt, arr);
      validPostMags.push({ row, mag: row.record.magnitude });
    }
  }

  const magnitudesByScale = Array.from(scaleBuckets.entries())
    .map(([magType, vals]) => ({
      magType,
      count: vals.length,
      min: Math.min(...vals),
      max: Math.max(...vals),
    }))
    .sort((a, b) => b.count - a.count);

  const hasMixedMagnitudeScales = magnitudesByScale.length > 1;
  const primaryMagScaleLabel = magnitudesByScale[0]?.magType ?? null;

  const catalogMinMagnitude =
    validPostMags.length > 0 ? Math.min(...validPostMags.map((v) => v.mag)) : null;
  const catalogMaxMagnitude =
    validPostMags.length > 0 ? Math.max(...validPostMags.map((v) => v.mag)) : null;

  let maxAftershock: PrimerSequenceStatistics['maxAftershock'] = null;
  if (validPostMags.length > 0) {
    const sortedBest = [...validPostMags].sort((a, b) => b.mag - a.mag)[0];
    maxAftershock = {
      eventId: sortedBest.row.record.eventId,
      magnitude: sortedBest.mag,
      magnitudeType: sortedBest.row.record.magnitudeType || 'Unknown',
      originTimeUtc: sortedBest.row.record.originTimeUtc,
      distanceKm: sortedBest.row.distanceKm,
    };
  }

  // Time intervals relative to anchor
  let within24h = 0;
  let within72h = 0;
  let within7d = 0;
  let within30d = 0;
  const dayMap = new Map<number, { count: number; maxMag: number | null; startMs: number }>();

  for (const row of assembly.selectedEvents) {
    if (isAnchorOrRef(row) || anchorMs === null) continue;
    const dtHours = (row.record.originTimeMs - anchorMs) / 3_600_000;
    if (dtHours > 0 && row.record.originTimeMs <= cutoffMs) {
      if (dtHours <= 24) within24h++;
      if (dtHours <= 72) within72h++;
      if (dtHours <= 24 * 7) within7d++;
      if (dtHours <= 24 * 30) within30d++;
    }
    const dayOffset = Math.floor(dtHours / 24);
    const existingDay = dayMap.get(dayOffset) ?? {
      count: 0,
      maxMag: null,
      startMs: anchorMs + dayOffset * 86_400_000,
    };
    existingDay.count += 1;
    if (
      row.record.magnitude !== null &&
      (existingDay.maxMag === null || row.record.magnitude > existingDay.maxMag)
    ) {
      existingDay.maxMag = row.record.magnitude;
    }
    dayMap.set(dayOffset, existingDay);
  }

  const countsByDay: PrimerDayCountBin[] = Array.from(dayMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([dayOffset, val]) => ({
      dayOffset,
      labelUtc: new Date(val.startMs).toISOString().slice(0, 10),
      count: val.count,
      maxMag: val.maxMag,
    }));

  // Magnitude distribution in 0.5-unit bins
  const magnitudeDistribution: PrimerMagDistributionBin[] = [];
  if (validPostMags.length > 0) {
    const startBin = Math.floor(Math.min(...validPostMags.map((v) => v.mag)) * 2) / 2;
    const endBin = Math.floor(Math.max(...validPostMags.map((v) => v.mag)) * 2) / 2;
    for (let b = startBin; b <= endBin + 1e-6; b += 0.5) {
      const bMin = Number(b.toFixed(1));
      const bMax = Number((b + 0.5).toFixed(1));
      const count = validPostMags.filter((v) => v.mag >= bMin && v.mag < bMax).length;
      magnitudeDistribution.push({
        binLabel: `${bMin.toFixed(1)}–${(bMax - 0.1).toFixed(1)}`,
        binMin: bMin,
        binMax: bMax,
        count,
      });
    }
  }

  // Spatial distance & depth stats across postEvents
  const dists = postEvents.map((e) => e.distanceKm).sort((a, b) => a - b);
  const depths = postEvents
    .map((e) => e.record.depthKm)
    .filter((d): d is number => d !== null && Number.isFinite(d));

  const medianDistanceKm =
    dists.length === 0
      ? null
      : dists.length % 2 === 1
        ? dists[(dists.length - 1) / 2]
        : Number(((dists[dists.length / 2 - 1] + dists[dists.length / 2]) / 2).toFixed(2));

  const elapsedSinceReferenceHours =
    anchorMs !== null ? Number(((cutoffMs - anchorMs) / 3_600_000).toFixed(2)) : null;

  const acceptedPostCount =
    acceptedSet.size > 0
      ? postEvents.filter((e) => acceptedSet.has(e.record.id)).length
      : null;

  const membershipBasis: PrimerSequenceStatistics['membershipBasis'] =
    params.catalog.length === 0 || isEventUnlocated(params.event)
      ? 'unavailable'
      : acceptedSet.size > 0
        ? 'reviewed-sequence-membership'
        : 'candidate-spatiotemporal-window';

  const statistics: PrimerSequenceStatistics = {
    membershipBasis,
    referenceEventId: params.event.id,
    referenceOriginUtc: refTimeMs !== null ? new Date(refTimeMs).toISOString() : null,
    referenceOriginPst: refTimeMs !== null ? formatUtcAsPst(refTimeMs) : null,
    nominatedMainshock,
    totalCatalogCount: params.catalog.length,
    eligiblePostEventCount: postEvents.length,
    candidateAftershockCount: postEvents.filter(
      (e) =>
        e.role === 'Candidate Aftershock' ||
        (e.window === 'post-event' && !acceptedSet.has(e.record.id))
    ).length,
    scientificallyAcceptedAftershockCount: acceptedPostCount,
    preEventCount: preAndBgEvents.filter((e) => e.window === 'pre-event').length,
    backgroundCount: preAndBgEvents.filter((e) => e.window === 'background').length,
    excludedCount: assembly.excludedCount,
    exactDuplicateExcludedCount,
    uncertainDuplicateFlaggedCount,
    incompleteMissingDepthCount,
    incompleteMissingMagCount,
    uncertainLocationCount,
    magnitudesByScale,
    primaryMagScaleLabel,
    catalogMinMagnitude,
    catalogMaxMagnitude,
    hasMixedMagnitudeScales,
    maxAftershock,
    countsByInterval: {
      within24h,
      within72h,
      within7d,
      within30d,
    },
    countsByDay,
    magnitudeDistribution,
    elapsedSinceReferenceHours,
    elapsedLabel: formatElapsedDuration(elapsedSinceReferenceHours),
    spatialDistribution: {
      minDistanceKm: dists.length > 0 ? dists[0] : null,
      medianDistanceKm,
      maxDistanceKm: dists.length > 0 ? dists[dists.length - 1] : null,
      knownDepthCount: depths.length,
      missingDepthCount: postEvents.length - depths.length,
      meanDepthKm:
        depths.length > 0
          ? Number((depths.reduce((s, v) => s + v, 0) / depths.length).toFixed(1))
          : null,
    },
    dataCutoffUtc: new Date(cutoffMs).toISOString(),
    dataCutoffPst: formatUtcAsPst(cutoffMs),
  };

  // Requirement E: Historical Regional Seismicity (strictly prior to anchor/reference when dated)
  const histFilters: HistoricalFilterConfig = {
    ...DEFAULT_HISTORICAL_FILTERS,
    radiusMode: 'custom',
    customRadiusKm: config.historicalRadiusKm,
    timeDirection: refTimeMs !== null ? 'before' : 'both',
    timeWindowPreset: 'custom',
    customDaysBefore: Math.max(1, Math.round(config.historicalLookbackYears * 365.25)),
    customDaysAfter: 0,
    minMag: config.historicalMinMag > 0 ? String(config.historicalMinMag) : '',
  };

  const filteredHistoricalRaw = filterHistoricalEvents(
    params.catalog,
    params.event,
    histFilters
  ).filter(
    (item) =>
      item.record.eventId.trim().toLowerCase() !== params.event.id.trim().toLowerCase() &&
      Math.abs(item.dtHoursRelativeToActive ?? 999) > 120 / 3600
  );

  // Deduplicate historical entries by record ID / exact duplicate map
  const dupLookup = new Map<string, boolean>(
    assembly.events.map((e) => [e.record.id, e.isDuplicate && !e.duplicateUncertain])
  );
  const dedupHistorical = filteredHistoricalRaw.filter(
    (item) => !dupLookup.get(item.record.id)
  );
  const histStats = computeHistoricalSummaryStats(dedupHistorical);

  // Sort significant historical earthquakes (magnitude desc, then recent)
  const historicalRows: PrimerHistoricalTableRow[] = [...dedupHistorical]
    .sort((a, b) => {
      const magDiff = (b.record.magnitude ?? -1) - (a.record.magnitude ?? -1);
      if (Math.abs(magDiff) > 0.05) return magDiff;
      return b.record.originTimeMs - a.record.originTimeMs;
    })
    .slice(0, config.historicalMaxRows)
    .map((item) => ({
      recordId: item.record.id,
      eventId: item.record.eventId,
      originTimeUtc: item.record.originTimeUtc,
      originTimePst: formatUtcAsPst(item.record.originTimeUtc),
      lat: item.record.lat,
      lon: item.record.lon,
      depthKm: item.record.depthKm,
      magnitude: item.record.magnitude,
      magnitudeType: item.record.magnitudeType,
      distanceKm: item.distanceKm,
      dataSource: item.record.dataSource,
      catalogVersion: item.record.catalogVersion,
      place: item.record.place || 'Unnamed location',
    }));

  const historicalAssociationDisclaimer =
    'Historical earthquakes listed below reflect regional catalog background prior to the reference event and are not established as genetically or fault-rupture linked to the current earthquake sequence.';

  const historical: PrimerHistoricalSeismicitySummary = isEventUnlocated(params.event)
    ? {
        status: 'unavailable',
        unavailableReason:
          'Reference earthquake coordinates are unlocated; regional historical seismicity radius cannot be queried.',
        radiusKm: config.historicalRadiusKm,
        lookbackYears: config.historicalLookbackYears,
        minMag: config.historicalMinMag,
        totalMatchingCount: 0,
        rows: [],
        stats: histStats,
        caption: 'Table 1. Historical regional seismicity unavailable (reference coordinates pending).',
        associationDisclaimer: historicalAssociationDisclaimer,
      }
    : params.catalog.length === 0
      ? {
          status: 'unavailable',
          unavailableReason:
            'No historical catalog records are currently loaded. Import CSV/GeoJSON or load the shared catalog.',
          radiusKm: config.historicalRadiusKm,
          lookbackYears: config.historicalLookbackYears,
          minMag: config.historicalMinMag,
          totalMatchingCount: 0,
          rows: [],
          stats: histStats,
          caption: 'Table 1. Historical regional seismicity unavailable (catalog empty).',
          associationDisclaimer: historicalAssociationDisclaimer,
        }
      : {
          status: 'ready',
          radiusKm: config.historicalRadiusKm,
          lookbackYears: config.historicalLookbackYears,
          minMag: config.historicalMinMag,
          totalMatchingCount: dedupHistorical.length,
          rows: historicalRows,
          stats: histStats,
          caption: `Table 1. Notable regional historical earthquakes (M ≥ ${config.historicalMinMag.toFixed(
            1
          )}, within ${config.historicalRadiusKm} km, lookback ${config.historicalLookbackYears} yr; ${
            dedupHistorical.length
          } matching, showing top ${historicalRows.length}).`,
          associationDisclaimer: historicalAssociationDisclaimer,
        };

  const aftershockMap = generateAftershockMapSvg({
    event: params.event,
    config,
    assembly,
    postEvents,
    preAndBgEvents,
    historicalRows,
    acceptedSet,
    nominatedMainshock,
    nearestCitiesPins: params.nearestCitiesPins ?? [],
    statistics,
  });

  const activityChart = generateActivityTimelineSvg({
    event: params.event,
    countsByDay,
    statistics,
    timelineSummary,
    theme: config.mapTheme,
  });

  const magnitudeChart = generateMagnitudeDistributionSvg({
    event: params.event,
    bins: magnitudeDistribution,
    statistics,
    theme: config.mapTheme,
  });

  const limitations = [...coverage.limitations];
  if (uncertainDuplicateFlaggedCount > 0) {
    limitations.push(
      `${uncertainDuplicateFlaggedCount} potential cross-catalog duplicate pair(s) were flagged for analyst review.`
    );
  }
  if (membershipBasis === 'candidate-spatiotemporal-window') {
    limitations.push(
      'Post-event counts reflect spatiotemporal candidate windows rather than scientifically reviewed aftershock sequence membership.'
    );
  }
  limitations.push(
    'No aftershock forecast or fitted Omori–Utsu decay law claim is emitted automatically in the primer without independent validation.'
  );

  const inputFingerprint = computeStage3InputFingerprint({
    event: params.event,
    primaryLocationLabel: params.primaryLocationLabel,
    isPlotResultStale: params.isPlotResultStale,
    catalogVersion: params.catalogVersion,
    catalogCount: params.catalog.length,
    config,
  });

  const reviewStatus: PrimerStage3Provenance['reviewStatus'] =
    params.catalog.length === 0 || isEventUnlocated(params.event)
      ? 'requires-info'
      : 'requires-scientific-review';

  return {
    config,
    statistics,
    timelineSummary,
    historical,
    figures: {
      aftershockMap,
      activityChart,
      magnitudeChart,
    },
    provenance: {
      inputFingerprint,
      referenceEventFingerprint: refFp,
      catalogVersion: params.catalogVersion,
      catalogCount: params.catalog.length,
      sourceLabel: params.sourceLabel,
      generatedAtUtc: new Date().toISOString(),
      reviewStatus,
      limitations,
      coverage,
    },
  };
}

/**
 * Formats deterministic, scientifically conservative prose for the Primer's Section 3 (Aftershocks)
 * using real catalog counts, cutoff timestamps, and explicit candidate/limitation qualifiers.
 */
export function formatStage3AftershockSectionText(
  pkg: PrimerStage3Package,
  expectingAftershocksFlag: boolean
): string {
  const s = pkg.statistics;
  const lines: string[] = [
    `Current Bulletin Flag — Expecting Aftershocks: ${expectingAftershocksFlag ? 'YES' : 'NO'}`,
    `Data Cutoff: ${s.dataCutoffPst} (${s.dataCutoffUtc}) · Elapsed Since Reference: ${s.elapsedLabel}`,
    `Catalog Source: ${pkg.provenance.sourceLabel} (v${pkg.provenance.catalogVersion}, ${s.totalCatalogCount} catalog records)`,
  ];

  if (s.membershipBasis === 'unavailable') {
    lines.push(
      '',
      '[REQUIRES INFORMATION: Verified regional catalog records or reference epicenter coordinates are unavailable. Import validated catalog data or locate the reference earthquake before finalizing aftershock statistics.]'
    );
    return lines.join('\n');
  }

  if (s.nominatedMainshock) {
    lines.push(
      `Reviewed / Nominated Anchor Mainshock: ${s.nominatedMainshock.eventId} (${s.nominatedMainshock.magnitudeType} ${
        s.nominatedMainshock.magnitude?.toFixed(1) ?? 'N/A'
      }, ${s.nominatedMainshock.originTimeUtc})`
    );
  } else {
    lines.push(
      `Reference Event Anchor: ${s.referenceEventId} (Note: Active EQP event is used as a spatiotemporal reference only and is not automatically assumed to be the mainshock.)`
    );
  }

  lines.push('');

  if (s.scientificallyAcceptedAftershockCount !== null) {
    lines.push(
      `Scientifically Reviewed Aftershocks: ${s.scientificallyAcceptedAftershockCount} accepted post-event earthquakes out of ${s.eligiblePostEventCount} eligible post-event catalog entries within ${pkg.config.filters.radiusKm} km (reference/mainshock excluded).`
    );
  } else {
    lines.push(
      `Post-Event Spatiotemporal Candidates (Unreviewed Membership): ${s.eligiblePostEventCount} eligible earthquakes recorded within ${pkg.config.filters.radiusKm} km up to +${pkg.config.filters.postDays} days (reference earthquake excluded from counts).`
    );
  }

  lines.push(
    `Interval Breakdown: ${s.countsByInterval.within24h} within +24h · ${s.countsByInterval.within72h} within +72h · ${s.countsByInterval.within7d} within +7d · ${s.countsByInterval.within30d} within +30d.`
  );

  if (s.magnitudesByScale.length > 0) {
    const scaleSummary = s.magnitudesByScale
      .map((m) => `${m.magType}: n=${m.count}, M ${m.min.toFixed(1)}–${m.max.toFixed(1)}`)
      .join(' | ');
    lines.push(`Recorded Magnitude Ranges (by reported scale): ${scaleSummary}.`);
  } else {
    lines.push('Recorded Magnitude Ranges: Unavailable (no numeric magnitudes recorded).');
  }

  if (s.maxAftershock) {
    lines.push(
      `Largest Post-Event Earthquake in Window: ${s.maxAftershock.eventId} (${s.maxAftershock.magnitudeType} ${s.maxAftershock.magnitude.toFixed(
        1
      )}) at ${s.maxAftershock.originTimeUtc}, ${s.maxAftershock.distanceKm.toFixed(1)} km from reference.`
    );
  }

  lines.push(
    `Historical Regional Background (R=${pkg.historical.radiusKm} km, ${pkg.historical.lookbackYears} yr lookback, M ≥ ${pkg.historical.minMag.toFixed(
      1
    )}): ${pkg.historical.totalMatchingCount} historical record(s) identified prior to the reference event.`
  );

  lines.push('');
  lines.push(
    `[REQUIRES SCIENTIFIC REVIEW: ${
      s.scientificallyAcceptedAftershockCount === null
        ? 'Counts currently represent spatiotemporal catalog candidates rather than formally confirmed aftershock sequence membership. '
        : ''
    }${
      s.hasMixedMagnitudeScales
        ? 'Multiple magnitude scales are present and were not merged into a single homogenized distribution. '
        : ''
    }Exact duplicates excluded: ${s.exactDuplicateExcludedCount}; uncertain cross-source matches flagged for review: ${s.uncertainDuplicateFlaggedCount}.]`
  );

  return lines.join('\n');
}
