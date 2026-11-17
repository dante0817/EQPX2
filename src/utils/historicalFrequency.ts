import type { EQPEvent } from '../data/eqpData';
import type { GeoViewportBounds } from '../components/SeismicityTrendOverlay';
import {
  geodesicDistanceKm,
  type HistoricalEarthquakeRecord,
  parseActiveEventUtcMs,
} from './historicalSeismicity';

export type FrequencySpatialScope = 'all' | 'viewport' | 'near-epicenter';
export type FrequencyBinResolution = 'auto' | 'hour' | 'day' | 'week' | 'month' | 'year';
export type ResolvedFrequencyBinResolution = 'hour' | 'day' | 'week' | 'month' | 'year';
export type BurstClassification =
  | 'Aftershock Sequence Candidate'
  | 'Seismic Swarm Candidate'
  | 'Elevated Seismicity Burst';

export interface HistoricalFrequencyBin {
  key: string;
  label: string;
  rangeLabel: string;
  startMs: number;
  endMs: number;
  intervalDays: number;
  count: number;
  cumulativeCount: number;
  ratePerDay: number;
  maxMag: number | null;
  maxMagEventId: string | null;
  maxMagEventPlace: string | null;
  meanDepthKm: number | null;
  zScore: number;
  isBurst: boolean;
  containsActiveEvent: boolean;
  events: HistoricalEarthquakeRecord[];
}

export interface DetectedSeismicityBurst {
  id: string;
  classification: BurstClassification;
  startMs: number;
  endMs: number;
  startLabel: string;
  endLabel: string;
  binKeys: string[];
  totalEvents: number;
  peakCount: number;
  peakRatePerDay: number;
  peakBinLabel: string;
  maxMag: number | null;
  secondMaxMag: number | null;
  magSpread: number | null;
  maxMagEventPlace: string | null;
  preLargestCount: number;
  postLargestCount: number;
  summary: string;
}

export interface AnalyzeHistoricalFrequencyParams {
  historicalEvents: HistoricalEarthquakeRecord[];
  activeEvent?: EQPEvent | null;
  viewportBounds?: GeoViewportBounds | null;
  spatialScope?: FrequencySpatialScope;
  epicenterRadiusKm?: number;
  resolution?: FrequencyBinResolution;
  minMagnitude?: number | null;
}

export interface HistoricalFrequencyAnalysis {
  filteredEvents: HistoricalEarthquakeRecord[];
  totalCatalogCount: number;
  resolvedResolution: ResolvedFrequencyBinResolution;
  bins: HistoricalFrequencyBin[];
  baselineMeanPerBin: number;
  baselineStdDevPerBin: number;
  burstThresholdCount: number;
  bursts: DetectedSeismicityBurst[];
  peakBin: HistoricalFrequencyBin | null;
  activeEventTimeMs: number | null;
  activeEventBinKey: string | null;
  overallMaxMag: number | null;
  dateSpanDays: number;
  sparseEmptyGapsOmitted: boolean;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
const MAX_CONTIGUOUS_BINS = 120;

export function getEventTimestampMs(ev: HistoricalEarthquakeRecord): number | null {
  if (Number.isFinite(ev.originTimeMs)) return ev.originTimeMs;
  const parsed = Date.parse(ev.originTimeUtc);
  return Number.isFinite(parsed) ? parsed : null;
}

export function resolveAutoFrequencyResolution(spanMs: number): ResolvedFrequencyBinResolution {
  const spanDays = Math.max(0, spanMs / DAY_MS);
  if (spanDays <= 3) return 'hour';
  if (spanDays <= 90) return 'day';
  if (spanDays <= 540) return 'week';
  if (spanDays <= 1825) return 'month';
  return 'year';
}

function getBinStartMs(ms: number, resolution: ResolvedFrequencyBinResolution): number {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const hr = d.getUTCHours();

  switch (resolution) {
    case 'hour':
      return Date.UTC(y, m, day, hr, 0, 0, 0);
    case 'day':
      return Date.UTC(y, m, day, 0, 0, 0, 0);
    case 'week': {
      // ISO-like Monday 00:00 UTC week anchor
      const dayOfWeek = (d.getUTCDay() + 6) % 7;
      return Date.UTC(y, m, day - dayOfWeek, 0, 0, 0, 0);
    }
    case 'month':
      return Date.UTC(y, m, 1, 0, 0, 0, 0);
    case 'year':
      return Date.UTC(y, 0, 1, 0, 0, 0, 0);
  }
}

function getNextBinStartMs(
  binStartMs: number,
  resolution: ResolvedFrequencyBinResolution
): number {
  const d = new Date(binStartMs);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const hr = d.getUTCHours();

  switch (resolution) {
    case 'hour':
      return Date.UTC(y, m, day, hr + 1, 0, 0, 0);
    case 'day':
      return Date.UTC(y, m, day + 1, 0, 0, 0, 0);
    case 'week':
      return binStartMs + WEEK_MS;
    case 'month':
      return Date.UTC(y, m + 1, 1, 0, 0, 0, 0);
    case 'year':
      return Date.UTC(y + 1, 0, 1, 0, 0, 0, 0);
  }
}

function formatBinDescriptor(
  binStartMs: number,
  resolution: ResolvedFrequencyBinResolution
): { key: string; label: string; rangeLabel: string } {
  const d = new Date(binStartMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const hr = String(d.getUTCHours()).padStart(2, '0');

  switch (resolution) {
    case 'hour':
      return {
        key: `${y}-${m}-${day}T${hr}`,
        label: `${m}/${day} ${hr}h`,
        rangeLabel: `${y}-${m}-${day} ${hr}:00–${hr}:59 UTC`,
      };
    case 'day':
      return {
        key: `${y}-${m}-${day}`,
        label: `${m}/${day}`,
        rangeLabel: `${y}-${m}-${day} UTC`,
      };
    case 'week':
      return {
        key: `${y}-${m}-${day}`,
        label: `${m}/${day}`,
        rangeLabel: `Week of ${y}-${m}-${day} UTC`,
      };
    case 'month':
      return {
        key: `${y}-${m}`,
        label: `${y}-${m}`,
        rangeLabel: `${y}-${m} UTC`,
      };
    case 'year':
      return {
        key: `${y}`,
        label: `${y}`,
        rangeLabel: `${y} UTC`,
      };
  }
}

function estimateBinCount(
  firstStartMs: number,
  lastStartMs: number,
  resolution: ResolvedFrequencyBinResolution
): number {
  const span = Math.max(0, lastStartMs - firstStartMs);
  switch (resolution) {
    case 'hour':
      return Math.floor(span / HOUR_MS) + 1;
    case 'day':
      return Math.floor(span / DAY_MS) + 1;
    case 'week':
      return Math.floor(span / WEEK_MS) + 1;
    case 'month':
      return Math.floor(span / (30 * DAY_MS)) + 2;
    case 'year':
      return (
        new Date(lastStartMs).getUTCFullYear() -
        new Date(firstStartMs).getUTCFullYear() +
        1
      );
  }
}

function classifyBurstWindow(
  burstBins: HistoricalFrequencyBin[],
  resolvedResolution: ResolvedFrequencyBinResolution
): DetectedSeismicityBurst {
  const eventsInBurst = burstBins
    .flatMap((b) => b.events)
    .slice()
    .sort((a, b) => (getEventTimestampMs(a) ?? 0) - (getEventTimestampMs(b) ?? 0));

  const totalEvents = eventsInBurst.length;
  let peakBin = burstBins[0];
  for (const b of burstBins) {
    if (b.count > peakBin.count) peakBin = b;
  }

  const withMag = eventsInBurst
    .filter((ev) => ev.magnitude !== null && Number.isFinite(ev.magnitude))
    .map((ev) => ({
      ev,
      mag: ev.magnitude as number,
      ms: getEventTimestampMs(ev) ?? 0,
    }));

  const sortedByMag = withMag.slice().sort((a, b) => b.mag - a.mag);
  const largest = sortedByMag[0] ?? null;
  const secondLargest = sortedByMag[1] ?? null;
  const maxMag = largest ? largest.mag : null;
  const secondMaxMag = secondLargest ? secondLargest.mag : null;
  const magSpread =
    maxMag !== null && secondMaxMag !== null
      ? Number((maxMag - secondMaxMag).toFixed(2))
      : null;

  let preLargestCount = 0;
  let postLargestCount = 0;
  if (largest) {
    for (const ev of eventsInBurst) {
      if (ev.id === largest.ev.id) continue;
      const ms = getEventTimestampMs(ev) ?? 0;
      if (ms < largest.ms) preLargestCount += 1;
      else postLargestCount += 1;
    }
  }

  const startMs = burstBins[0].startMs;
  const endMs = burstBins[burstBins.length - 1].endMs;
  const largestOffsetFraction =
    largest && endMs > startMs
      ? (largest.ms - startMs) / Math.max(1, endMs - startMs)
      : 0;

  let classification: BurstClassification = 'Elevated Seismicity Burst';
  let summary = `${totalEvents} clustered events · peak ${peakBin.count} in ${peakBin.rangeLabel}`;

  const hasClearMainshock =
    maxMag !== null &&
    ((magSpread !== null && magSpread >= 0.9) ||
      (maxMag >= 5.5 && magSpread !== null && magSpread >= 0.6));

  if (
    hasClearMainshock &&
    largest &&
    (postLargestCount >= Math.max(2, preLargestCount) || largestOffsetFraction <= 0.45)
  ) {
    classification = 'Aftershock Sequence Candidate';
    const spreadText = magSpread !== null ? `, ΔM ${magSpread.toFixed(1)}` : '';
    summary = `M${largest.mag.toFixed(1)} lead shock${spreadText} with ${postLargestCount} follow-on event${postLargestCount === 1 ? '' : 's'}`;
  } else if (
    (magSpread !== null && magSpread < 0.9 && totalEvents >= 4) ||
    (burstBins.length >= 2 &&
      preLargestCount >= 2 &&
      postLargestCount >= 2 &&
      (magSpread === null || magSpread < 1.1))
  ) {
    classification = 'Seismic Swarm Candidate';
    const rangeText =
      maxMag !== null && secondMaxMag !== null
        ? `top shocks M${secondMaxMag.toFixed(1)}–M${maxMag.toFixed(1)} (ΔM ${(magSpread ?? 0).toFixed(1)})`
        : `${burstBins.length} ${resolvedResolution} bins`;
    summary = `${totalEvents} sustained cluster events · ${rangeText}`;
  } else if (maxMag !== null) {
    summary = `${totalEvents} events (max M${maxMag.toFixed(1)}${magSpread !== null ? `, ΔM ${magSpread.toFixed(1)}` : ''}) · peak ${peakBin.count} in ${peakBin.label}`;
  }

  return {
    id: `burst-${burstBins[0].key}-${burstBins[burstBins.length - 1].key}`,
    classification,
    startMs,
    endMs,
    startLabel: burstBins[0].rangeLabel,
    endLabel: burstBins[burstBins.length - 1].rangeLabel,
    binKeys: burstBins.map((b) => b.key),
    totalEvents,
    peakCount: peakBin.count,
    peakRatePerDay: peakBin.ratePerDay,
    peakBinLabel: peakBin.rangeLabel,
    maxMag,
    secondMaxMag,
    magSpread,
    maxMagEventPlace: largest ? largest.ev.place : peakBin.maxMagEventPlace,
    preLargestCount,
    postLargestCount,
    summary,
  };
}

export function analyzeHistoricalFrequency(
  params: AnalyzeHistoricalFrequencyParams
): HistoricalFrequencyAnalysis {
  const {
    historicalEvents,
    activeEvent = null,
    viewportBounds = null,
    spatialScope = 'all',
    epicenterRadiusKm = 100,
    resolution = 'auto',
    minMagnitude = null,
  } = params;

  const activeTimeMs = activeEvent ? parseActiveEventUtcMs(activeEvent) : null;
  const activeLocated =
    activeEvent !== null &&
    Number.isFinite(activeEvent.lat) &&
    Number.isFinite(activeEvent.lon) &&
    (activeEvent.lat !== 0 || activeEvent.lon !== 0) &&
    activeEvent.iterations > 0;

  const filteredWithTime: { ev: HistoricalEarthquakeRecord; ms: number }[] = [];

  for (const ev of historicalEvents) {
    const ms = getEventTimestampMs(ev);
    if (ms === null) continue;

    if (
      minMagnitude !== null &&
      Number.isFinite(minMagnitude) &&
      (ev.magnitude === null || !Number.isFinite(ev.magnitude) || ev.magnitude < minMagnitude)
    ) {
      continue;
    }

    if (spatialScope === 'viewport' && viewportBounds) {
      if (
        !Number.isFinite(ev.lat) ||
        !Number.isFinite(ev.lon) ||
        ev.lat < viewportBounds.minLat ||
        ev.lat > viewportBounds.maxLat ||
        ev.lon < viewportBounds.minLon ||
        ev.lon > viewportBounds.maxLon
      ) {
        continue;
      }
    } else if (spatialScope === 'near-epicenter' && activeLocated && activeEvent) {
      if (!Number.isFinite(ev.lat) || !Number.isFinite(ev.lon)) continue;
      const dist = geodesicDistanceKm(activeEvent.lat, activeEvent.lon, ev.lat, ev.lon);
      if (dist > Math.max(5, epicenterRadiusKm)) continue;
    }

    filteredWithTime.push({ ev, ms });
  }

  filteredWithTime.sort((a, b) => a.ms - b.ms);
  const filteredEvents = filteredWithTime.map((item) => item.ev);

  let overallMaxMag: number | null = null;
  for (const ev of filteredEvents) {
    if (ev.magnitude !== null && Number.isFinite(ev.magnitude)) {
      overallMaxMag = overallMaxMag === null ? ev.magnitude : Math.max(overallMaxMag, ev.magnitude);
    }
  }

  if (filteredWithTime.length === 0) {
    const fallbackRes: ResolvedFrequencyBinResolution =
      resolution === 'auto' ? 'day' : resolution;
    return {
      filteredEvents: [],
      totalCatalogCount: historicalEvents.length,
      resolvedResolution: fallbackRes,
      bins: [],
      baselineMeanPerBin: 0,
      baselineStdDevPerBin: 0,
      burstThresholdCount: 3,
      bursts: [],
      peakBin: null,
      activeEventTimeMs: activeTimeMs,
      activeEventBinKey: null,
      overallMaxMag: null,
      dateSpanDays: 0,
      sparseEmptyGapsOmitted: false,
    };
  }

  const minMs = filteredWithTime[0].ms;
  const maxMs = filteredWithTime[filteredWithTime.length - 1].ms;
  const dateSpanDays = (maxMs - minMs) / DAY_MS;

  const resolvedResolution: ResolvedFrequencyBinResolution =
    resolution === 'auto' ? resolveAutoFrequencyResolution(maxMs - minMs) : resolution;

  const firstBinStart = getBinStartMs(minMs, resolvedResolution);
  const lastBinStart = getBinStartMs(maxMs, resolvedResolution);
  const estimatedBins = estimateBinCount(firstBinStart, lastBinStart, resolvedResolution);
  const sparseEmptyGapsOmitted = estimatedBins > MAX_CONTIGUOUS_BINS;

  const bucketStarts = new Set<number>();
  if (!sparseEmptyGapsOmitted) {
    let cursor = firstBinStart;
    let guard = 0;
    while (cursor <= lastBinStart && guard < MAX_CONTIGUOUS_BINS + 4) {
      bucketStarts.add(cursor);
      cursor = getNextBinStartMs(cursor, resolvedResolution);
      guard += 1;
    }
  } else {
    for (const item of filteredWithTime) {
      const bStart = getBinStartMs(item.ms, resolvedResolution);
      bucketStarts.add(bStart);
      const nextB = getNextBinStartMs(bStart, resolvedResolution);
      if (nextB <= lastBinStart) bucketStarts.add(nextB);
    }
  }

  const activeBinStart =
    activeTimeMs !== null ? getBinStartMs(activeTimeMs, resolvedResolution) : null;

  const sortedStarts = Array.from(bucketStarts).sort((a, b) => a - b);
  const binByStart = new Map<number, HistoricalFrequencyBin>();

  for (const startMs of sortedStarts) {
    const endMs = getNextBinStartMs(startMs, resolvedResolution);
    const intervalDays = Math.max(1 / 24, (endMs - startMs) / DAY_MS);
    const desc = formatBinDescriptor(startMs, resolvedResolution);
    binByStart.set(startMs, {
      key: desc.key,
      label: desc.label,
      rangeLabel: desc.rangeLabel,
      startMs,
      endMs,
      intervalDays,
      count: 0,
      cumulativeCount: 0,
      ratePerDay: 0,
      maxMag: null,
      maxMagEventId: null,
      maxMagEventPlace: null,
      meanDepthKm: null,
      zScore: 0,
      isBurst: false,
      containsActiveEvent: activeBinStart !== null && startMs === activeBinStart,
      events: [],
    });
  }

  for (const { ev, ms } of filteredWithTime) {
    const startMs = getBinStartMs(ms, resolvedResolution);
    const bin = binByStart.get(startMs);
    if (!bin) continue;
    bin.events.push(ev);
    bin.count += 1;
    if (ev.magnitude !== null && Number.isFinite(ev.magnitude)) {
      if (bin.maxMag === null || ev.magnitude > bin.maxMag) {
        bin.maxMag = ev.magnitude;
        bin.maxMagEventId = ev.eventId;
        bin.maxMagEventPlace = ev.place;
      }
    }
  }

  const bins = Array.from(binByStart.values()).sort((a, b) => a.startMs - b.startMs);

  let runningCumulative = 0;
  for (const bin of bins) {
    runningCumulative += bin.count;
    bin.cumulativeCount = runningCumulative;
    bin.ratePerDay = Number((bin.count / bin.intervalDays).toFixed(2));
    const knownDepths = bin.events
      .map((e) => e.depthKm)
      .filter((z): z is number => z !== null && Number.isFinite(z));
    bin.meanDepthKm =
      knownDepths.length > 0
        ? Number(
            (knownDepths.reduce((acc, z) => acc + z, 0) / knownDepths.length).toFixed(1)
          )
        : null;
  }

  // Baseline mean & std-dev across the full observed interval span (including omitted 0-count gaps)
  const totalSpanIntervals = sparseEmptyGapsOmitted
    ? Math.max(bins.length, estimatedBins)
    : bins.length;
  const totalEventCount = bins.reduce((acc, b) => acc + b.count, 0);
  const baselineMeanPerBin =
    totalSpanIntervals > 0 ? totalEventCount / totalSpanIntervals : 0;
  const omittedZeroBins = Math.max(0, totalSpanIntervals - bins.length);
  const sumSquaredDiffs =
    bins.reduce((acc, b) => acc + Math.pow(b.count - baselineMeanPerBin, 2), 0) +
    omittedZeroBins * Math.pow(baselineMeanPerBin, 2);
  const variance =
    totalSpanIntervals > 1 ? sumSquaredDiffs / totalSpanIntervals : 0;
  const baselineStdDevPerBin = Math.sqrt(variance);

  const burstThresholdCount = Math.max(
    3,
    Math.ceil(baselineMeanPerBin + 1.5 * baselineStdDevPerBin)
  );

  let peakBin: HistoricalFrequencyBin | null = null;
  let activeEventBinKey: string | null = null;

  for (const bin of bins) {
    if (bin.containsActiveEvent) activeEventBinKey = bin.key;
    bin.zScore =
      baselineStdDevPerBin > 0
        ? Number(((bin.count - baselineMeanPerBin) / baselineStdDevPerBin).toFixed(2))
        : 0;
    bin.isBurst =
      bin.count >= burstThresholdCount ||
      (baselineMeanPerBin > 0 && bin.count >= Math.max(3, Math.ceil(baselineMeanPerBin * 2.5)));
    if (!peakBin || bin.count > peakBin.count) {
      peakBin = bin;
    }
  }

  // Group contiguous elevated bins into candidate sequence/swarm windows
  const elevatedCutoff = Math.max(2, Math.ceil(baselineMeanPerBin * 1.6));
  const bursts: DetectedSeismicityBurst[] = [];
  let currentRun: HistoricalFrequencyBin[] = [];

  const flushRun = () => {
    if (currentRun.length === 0) return;
    const totalEvents = currentRun.reduce((acc, b) => acc + b.count, 0);
    const hasPeakBurst = currentRun.some((b) => b.isBurst);
    if (totalEvents >= 4 && (hasPeakBurst || currentRun.length >= 2)) {
      bursts.push(classifyBurstWindow(currentRun, resolvedResolution));
    }
    currentRun = [];
  };

  for (let i = 0; i < bins.length; i += 1) {
    const bin = bins[i];
    const isElevated = bin.isBurst || (bin.count >= elevatedCutoff && bin.count >= 2);
    if (isElevated) {
      if (currentRun.length > 0) {
        const prev = currentRun[currentRun.length - 1];
        // When sparse empty gaps are omitted, only merge bins within 2 intervals of each other
        const maxGapMs = prev.intervalDays * DAY_MS * 2.5;
        if (bin.startMs - prev.endMs > maxGapMs) {
          flushRun();
        }
      }
      currentRun.push(bin);
    } else {
      flushRun();
    }
  }
  flushRun();

  bursts.sort((a, b) => b.totalEvents - a.totalEvents || b.startMs - a.startMs);

  return {
    filteredEvents,
    totalCatalogCount: historicalEvents.length,
    resolvedResolution,
    bins,
    baselineMeanPerBin: Number(baselineMeanPerBin.toFixed(2)),
    baselineStdDevPerBin: Number(baselineStdDevPerBin.toFixed(2)),
    burstThresholdCount,
    bursts,
    peakBin,
    activeEventTimeMs: activeTimeMs,
    activeEventBinKey,
    overallMaxMag,
    dateSpanDays: Number(dateSpanDays.toFixed(1)),
    sparseEmptyGapsOmitted,
  };
}
