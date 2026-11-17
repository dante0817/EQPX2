import { type EQPEvent, isEventUnlocated } from '../data/eqpData.ts';
import {
  type CrossSectionProjectedEvent,
  type FilteredHistoricalEvent,
  geodesicAzimuthDeg,
  geodesicDistanceKm,
  type HistoricalEarthquakeRecord,
  parseActiveEventUtcMs,
  projectEventsToCrossSection,
} from './historicalSeismicity.ts';

export type SequenceSectionId = 'identify' | 'timeline' | 'spatial' | 'magnitude' | 'decay';

export type SequenceEventRole =
  | 'Reference Event'
  | 'Candidate Mainshock'
  | 'Candidate Foreshock'
  | 'Candidate Aftershock'
  | 'Candidate Swarm/Cluster'
  | 'Unclassified';

export type SequenceObservationWindow =
  | 'pre-event'
  | 'post-event'
  | 'background'
  | 'outside-window';

export type SequenceMcMethod = 'manual' | 'maxc' | 'gft90';
export type SequenceRateBinMode = 'hour' | 'day' | 'week' | 'custom';
export type SequenceCharacterization =
  | 'Mainshock–Aftershock Candidate'
  | 'Foreshock–Mainshock–Aftershock Candidate'
  | 'Swarm / Cluster Candidate'
  | 'Background / Unclassified'
  | 'Insufficient Data';

export type SequenceQualityStatus = 'Experimental' | 'Insufficient Data' | 'Ambiguous';

export interface SequenceFilterConfig {
  radiusKm: number;
  preDays: number;
  postDays: number;
  backgroundDays: number;
  minDepthKm: string;
  maxDepthKm: string;
  includeMissingDepth: boolean;
  minMag: string;
  maxMag: string;
  magTypes: string[];
  dataSources: string[];
  excludeDuplicates: boolean;
  enableClusterAssist: boolean;
  clusterEpsKm: number;
  clusterTimeHours: number;
  clusterMinPts: number;
  binMode: SequenceRateBinMode;
  customBinHours: number;
  gapThresholdHours: number;
}

export const DEFAULT_SEQUENCE_FILTERS: SequenceFilterConfig = {
  radiusKm: 100,
  preDays: 30,
  postDays: 90,
  backgroundDays: 365,
  minDepthKm: '',
  maxDepthKm: '',
  includeMissingDepth: true,
  minMag: '',
  maxMag: '',
  magTypes: [],
  dataSources: [],
  excludeDuplicates: true,
  enableClusterAssist: false,
  clusterEpsKm: 25,
  clusterTimeHours: 72,
  clusterMinPts: 4,
  binMode: 'day',
  customBinHours: 12,
  gapThresholdHours: 72,
};

export interface SequenceCandidateEvent {
  record: HistoricalEarthquakeRecord;
  distanceKm: number;
  azimuthDeg: number;
  dtHoursFromReference: number | null;
  dtHoursFromMainshock: number | null;
  window: SequenceObservationWindow;
  isReferenceMatch: boolean;
  isDuplicate: boolean;
  duplicateOfId: string | null;
  duplicateUncertain: boolean;
  duplicateNote: string | null;
  clusterId: number | null;
  role: SequenceEventRole;
  eligible: boolean;
  included: boolean;
  excludedReason: string | null;
}

export interface SequenceAssemblyResult {
  referenceEventId: string;
  referenceTimeMs: number | null;
  candidateMainshockId: string | null;
  candidateMainshockTimeMs: number | null;
  largestEligibleId: string | null;
  largestEligibleMag: number | null;
  totalCatalogCount: number;
  eligibleCount: number;
  selectedCount: number;
  excludedCount: number;
  duplicateCount: number;
  uncertainDuplicateCount: number;
  clusterCount: number;
  events: SequenceCandidateEvent[];
  selectedEvents: SequenceCandidateEvent[];
  characterization: SequenceCharacterization;
}

export interface TimelineRateBin {
  binIndex: number;
  startMs: number;
  endMs: number;
  labelUtc: string;
  count: number;
  cumulativeCount: number;
  observedHours: number;
  isPartialInterval: boolean;
  ratePerDay: number;
  maxMag: number | null;
}

export interface CatalogGapPeriod {
  startMs: number;
  endMs: number;
  startUtc: string;
  endUtc: string;
  durationHours: number;
}

export interface TimelineRateSummary {
  binHours: number;
  observationStartMs: number | null;
  observationEndMs: number | null;
  bins: TimelineRateBin[];
  gaps: CatalogGapPeriod[];
  preRefCount: number;
  postRefCount: number;
  preRefRatePerDay: number | null;
  postRefRatePerDay: number | null;
  preRefMaxMag: number | null;
  postRefMaxMag: number | null;
  trendDescription: string;
}

export interface MagnitudeBinCount {
  magCenter: number;
  count: number;
  cumulativeCount: number;
  log10Cum: number | null;
  fittedLog10Cum: number | null;
}

export interface MagnitudeFrequencyResult {
  status: SequenceQualityStatus;
  selectedMagType: string | null;
  availableMagTypes: Array<{ magType: string; count: number }>;
  totalWithMag: number;
  sampleAboveMc: number;
  binWidth: number;
  mcMethod: SequenceMcMethod;
  mcValue: number | null;
  gftResidualPct: number | null;
  bValue: number | null;
  bStdErr: number | null;
  bCi95HalfWidth: number | null;
  aValue: number | null;
  bins: MagnitudeBinCount[];
  warnings: string[];
  methodNote: string;
}

export interface OmoriRatePoint {
  timeDays: number;
  tStartDays: number;
  tEndDays: number;
  count: number;
  observedRatePerDay: number;
  fittedRatePerDay: number | null;
  residualPerDay: number | null;
}

export interface OmoriDecayResult {
  status: SequenceQualityStatus;
  suitableForOmori: boolean;
  suitabilityReason: string;
  referenceTimeUtc: string | null;
  fitStartDays: number;
  fitEndDays: number;
  mcThreshold: number | null;
  magTypeFilter: string | null;
  eventCountInWindow: number;
  kValue: number | null;
  cValueDays: number | null;
  pValue: number | null;
  logLikelihood: number | null;
  ksStatistic: number | null;
  observedSeries: OmoriRatePoint[];
  warnings: string[];
  limitations: string[];
}

export interface SequenceQualityReport {
  overallStatus: SequenceQualityStatus;
  totalCatalogRecords: number;
  independentSelectedRecords: number;
  duplicateFlaggedCount: number;
  uncertainMatchCount: number;
  missingDepthCount: number;
  uncertainLocationCount: number;
  temporalCoverageNote: string;
  completenessNote: string;
  modelSuitabilityNote: string;
  limitations: string[];
}

export interface SavedSequenceInvestigation {
  id: string;
  name: string;
  notes?: string;
  savedAtUtc: string;
  referenceEventId: string;
  acceptedSolutionIterations: number;
  candidateMainshockId: string | null;
  includedEventIds: string[];
  excludedEventIds: string[];
  manualRoles: Record<string, SequenceEventRole>;
  filters: SequenceFilterConfig;
  mcMethod: SequenceMcMethod;
  manualMc: number;
  selectedMagType: string;
  omoriFitStartDays: number;
  omoriFitEndDays: number;
  omoriMc: number;
  catalogVersion: number;
  analysisMethodVersion: string;
  inputFingerprint: string;
  summarySnapshot: {
    selectedCount: number;
    characterization: SequenceCharacterization;
    bValue: number | null;
    mcValue: number | null;
    omoriP: number | null;
    overallStatus: SequenceQualityStatus;
  };
}

export const SEQUENCE_METHOD_VERSION = 'eqp-seq-v1.0 (ST-DBSCAN + Aki-MLE + Ogata-Omori-MLE)';

export function getActiveEventMagnitude(event: EQPEvent): { mag: number | null; scale: string } {
  const val =
    event.preferredScale === 'Ms'
      ? event.ms
      : event.preferredScale === 'Mb'
        ? event.mb
        : event.md;
  return {
    mag: Number.isFinite(val) && val > 0 ? val : null,
    scale: event.preferredScale || 'Md',
  };
}

export function buildSequenceInputFingerprint(params: {
  event: EQPEvent;
  catalogVersion: number;
  catalogCount: number;
  candidateMainshockId: string | null;
  filters: SequenceFilterConfig;
  manualIncludedIds: Set<string>;
  manualExcludedIds: Set<string>;
  manualRoles: Record<string, SequenceEventRole>;
  selectedMagType: string;
  mcMethod: SequenceMcMethod;
  manualMc: number;
  omoriFitStartDays: number;
  omoriFitEndDays: number;
  omoriMc: number;
}): string {
  const inc = Array.from(params.manualIncludedIds).sort().join(',');
  const exc = Array.from(params.manualExcludedIds).sort().join(',');
  const roles = Object.entries(params.manualRoles)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join(',');
  return JSON.stringify({
    ev: [params.event.id, params.event.originDateGmt, params.event.originTimeGmt, params.event.iterations],
    cat: [params.catalogVersion, params.catalogCount],
    ms: params.candidateMainshockId,
    f: params.filters,
    inc,
    exc,
    roles,
    mfd: [params.selectedMagType, params.mcMethod, params.manualMc],
    omori: [params.omoriFitStartDays, params.omoriFitEndDays, params.omoriMc],
  });
}

/**
 * Spatial-temporal DBSCAN grouping (Birant & Kut 2007 ST-DBSCAN) for candidate swarm/cluster support.
 */
function computeStDbscanClusters(
  items: Array<{
    id: string;
    lat: number;
    lon: number;
    ms: number;
  }>,
  epsKm: number,
  epsTimeHours: number,
  minPts: number
): Map<string, number> {
  const clusterMap = new Map<string, number>();
  if (items.length < minPts) return clusterMap;

  const visited = new Set<string>();
  const epsMs = Math.max(1, epsTimeHours) * 3_600_000;
  const epsDist = Math.max(1, epsKm);

  const regionQuery = (idx: number): number[] => {
    const p = items[idx];
    const neighbors: number[] = [];
    for (let j = 0; j < items.length; j++) {
      const q = items[j];
      if (Math.abs(p.ms - q.ms) > epsMs) continue;
      const d = geodesicDistanceKm(p.lat, p.lon, q.lat, q.lon);
      if (Number.isFinite(d) && d <= epsDist) {
        neighbors.push(j);
      }
    }
    return neighbors;
  };

  let clusterId = 0;
  for (let i = 0; i < items.length; i++) {
    const pId = items[i].id;
    if (visited.has(pId)) continue;
    visited.add(pId);

    const neighbors = regionQuery(i);
    if (neighbors.length < minPts) continue;

    clusterId += 1;
    clusterMap.set(pId, clusterId);
    const seedQueue = [...neighbors];
    const inQueue = new Set<number>(neighbors);

    while (seedQueue.length > 0) {
      const currIdx = seedQueue.shift()!;
      const currId = items[currIdx].id;
      if (!visited.has(currId)) {
        visited.add(currId);
        const currNeighbors = regionQuery(currIdx);
        if (currNeighbors.length >= minPts) {
          for (const nIdx of currNeighbors) {
            if (!inQueue.has(nIdx)) {
              inQueue.add(nIdx);
              seedQueue.push(nIdx);
            }
          }
        }
      }
      if (!clusterMap.has(currId)) {
        clusterMap.set(currId, clusterId);
      }
    }
  }

  return clusterMap;
}

/**
 * ES1 — Sequence Engine:
 * Deduplicates catalog records, identifies matches to the active EQP reference event,
 * classifies pre/post/background observation windows, applies optional ST-DBSCAN clustering,
 * and respects manual membership & candidate mainshock selection without forcing causal labels.
 */
export function assembleEarthquakeSequence(params: {
  catalog: HistoricalEarthquakeRecord[];
  activeEvent: EQPEvent;
  filters: SequenceFilterConfig;
  candidateMainshockId: string | null;
  manualIncludedIds: Set<string>;
  manualExcludedIds: Set<string>;
  manualRoles: Record<string, SequenceEventRole>;
}): SequenceAssemblyResult {
  const {
    catalog,
    activeEvent,
    filters,
    candidateMainshockId,
    manualIncludedIds,
    manualExcludedIds,
    manualRoles,
  } = params;

  const refUnlocated = isEventUnlocated(activeEvent);
  const refTimeMs = parseActiveEventUtcMs(activeEvent);

  const minMagNum = filters.minMag.trim() === '' ? null : Number(filters.minMag);
  const maxMagNum = filters.maxMag.trim() === '' ? null : Number(filters.maxMag);
  const minDepthNum = filters.minDepthKm.trim() === '' ? null : Number(filters.minDepthKm);
  const maxDepthNum = filters.maxDepthKm.trim() === '' ? null : Number(filters.maxDepthKm);

  const mainshockRecord = candidateMainshockId
    ? catalog.find((r) => r.id === candidateMainshockId) ?? null
    : null;
  const mainshockTimeMs = mainshockRecord ? mainshockRecord.originTimeMs : null;

  // Sort chronologically for deterministic deduplication (prefer higher quality or non-uncertain record)
  const sortedCatalog = [...catalog].sort((a, b) => a.originTimeMs - b.originTimeMs);

  const seenCanonicalKeys = new Map<string, HistoricalEarthquakeRecord>();
  const keptForDupCheck: HistoricalEarthquakeRecord[] = [];
  const dupMeta = new Map<
    string,
    { isDuplicate: boolean; duplicateOfId: string | null; uncertain: boolean; note: string | null }
  >();

  let refMatchFound = false;

  for (const rec of sortedCatalog) {
    const key = `${rec.dataSource.toLowerCase()}::${rec.eventId.toLowerCase()}`;
    const existingKey = seenCanonicalKeys.get(key);
    if (existingKey) {
      dupMeta.set(rec.id, {
        isDuplicate: true,
        duplicateOfId: existingKey.id,
        uncertain: false,
        note: `Exact source+eventId duplicate of ${existingKey.eventId} (${existingKey.dataSource})`,
      });
      continue;
    }

    let uncertainDupOf: HistoricalEarthquakeRecord | null = null;
    let uncertainNote: string | null = null;
    for (const prev of keptForDupCheck) {
      const dtSec = Math.abs(rec.originTimeMs - prev.originTimeMs) / 1000;
      if (dtSec > 20) continue;
      const distKm = geodesicDistanceKm(rec.lat, rec.lon, prev.lat, prev.lon);
      if (!Number.isFinite(distKm) || distKm > 15) continue;
      const magDiff =
        rec.magnitude !== null && prev.magnitude !== null
          ? Math.abs(rec.magnitude - prev.magnitude)
          : null;
      if (magDiff === null || magDiff <= 0.6) {
        uncertainDupOf = prev;
        uncertainNote = `Cross-source match with ${prev.eventId} (${prev.dataSource}): Δt=${dtSec.toFixed(1)}s, Δd=${distKm.toFixed(1)}km`;
        break;
      }
    }

    if (uncertainDupOf) {
      dupMeta.set(rec.id, {
        isDuplicate: true,
        duplicateOfId: uncertainDupOf.id,
        uncertain: true,
        note: uncertainNote,
      });
      continue;
    }

    seenCanonicalKeys.set(key, rec);
    keptForDupCheck.push(rec);
    dupMeta.set(rec.id, {
      isDuplicate: false,
      duplicateOfId: null,
      uncertain: false,
      note: null,
    });
  }

  // First pass: spatial-temporal & parameter filtering + window tagging
  const preClusterPool: Array<{ id: string; lat: number; lon: number; ms: number }> = [];
  const baseRows: Array<{
    record: HistoricalEarthquakeRecord;
    distanceKm: number;
    azimuthDeg: number;
    dtHoursFromReference: number | null;
    dtHoursFromMainshock: number | null;
    window: SequenceObservationWindow;
    isReferenceMatch: boolean;
    isDuplicate: boolean;
    duplicateOfId: string | null;
    duplicateUncertain: boolean;
    duplicateNote: string | null;
    eligible: boolean;
    excludedReason: string | null;
  }> = [];

  for (const rec of sortedCatalog) {
    const distanceKm = refUnlocated
      ? 0
      : geodesicDistanceKm(activeEvent.lat, activeEvent.lon, rec.lat, rec.lon);
    const azimuthDeg = refUnlocated
      ? 0
      : geodesicAzimuthDeg(activeEvent.lat, activeEvent.lon, rec.lat, rec.lon);

    const dtHoursFromReference =
      refTimeMs !== null ? (rec.originTimeMs - refTimeMs) / 3_600_000 : null;
    const dtHoursFromMainshock =
      mainshockTimeMs !== null ? (rec.originTimeMs - mainshockTimeMs) / 3_600_000 : null;

    // Detect if this catalog record corresponds to the active EQP event (prevent double-counting)
    let isReferenceMatch = false;
    if (!refMatchFound && !refUnlocated && dtHoursFromReference !== null) {
      if (Math.abs(dtHoursFromReference) <= 120 / 3600 && distanceKm <= 10) {
        isReferenceMatch = true;
        refMatchFound = true;
      }
    }

    let window: SequenceObservationWindow = 'background';
    if (dtHoursFromReference !== null) {
      const preH = Math.max(0, filters.preDays) * 24;
      const postH = Math.max(0, filters.postDays) * 24;
      const bgH = Math.max(preH, filters.backgroundDays * 24);
      if (dtHoursFromReference < -bgH || dtHoursFromReference > postH) {
        window = 'outside-window';
      } else if (dtHoursFromReference < -preH) {
        window = 'background';
      } else if (dtHoursFromReference < 0) {
        window = 'pre-event';
      } else {
        window = 'post-event';
      }
    }

    const dm = dupMeta.get(rec.id)!;
    const reasons: string[] = [];

    if (!refUnlocated && (!Number.isFinite(distanceKm) || distanceKm > filters.radiusKm)) {
      reasons.push(`Distance ${Number.isFinite(distanceKm) ? distanceKm.toFixed(1) : 'N/A'} km > ${filters.radiusKm} km`);
    }
    if (window === 'outside-window') {
      reasons.push('Outside observation time window');
    }
    if (minMagNum !== null && Number.isFinite(minMagNum)) {
      if (rec.magnitude === null || rec.magnitude < minMagNum) {
        reasons.push(`M < ${minMagNum}`);
      }
    }
    if (maxMagNum !== null && Number.isFinite(maxMagNum)) {
      if (rec.magnitude === null || rec.magnitude > maxMagNum) {
        reasons.push(`M > ${maxMagNum}`);
      }
    }
    if (rec.depthKm === null) {
      if (!filters.includeMissingDepth) reasons.push('Missing depth excluded');
    } else {
      if (minDepthNum !== null && Number.isFinite(minDepthNum) && rec.depthKm < minDepthNum) {
        reasons.push(`Depth < ${minDepthNum} km`);
      }
      if (maxDepthNum !== null && Number.isFinite(maxDepthNum) && rec.depthKm > maxDepthNum) {
        reasons.push(`Depth > ${maxDepthNum} km`);
      }
    }
    if (filters.magTypes.length > 0 && !filters.magTypes.includes(rec.magnitudeType || 'Unknown')) {
      reasons.push(`MagType ${rec.magnitudeType} filtered`);
    }
    if (filters.dataSources.length > 0 && !filters.dataSources.includes(rec.dataSource)) {
      reasons.push(`Source ${rec.dataSource} filtered`);
    }
    if (filters.excludeDuplicates && dm.isDuplicate) {
      reasons.push(dm.note || 'Duplicate record excluded');
    }

    const eligible = reasons.length === 0;
    if (eligible) {
      preClusterPool.push({
        id: rec.id,
        lat: rec.lat,
        lon: rec.lon,
        ms: rec.originTimeMs,
      });
    }

    baseRows.push({
      record: rec,
      distanceKm: Number.isFinite(distanceKm) ? Number(distanceKm.toFixed(2)) : 0,
      azimuthDeg: Number.isFinite(azimuthDeg) ? Number(azimuthDeg.toFixed(1)) : 0,
      dtHoursFromReference:
        dtHoursFromReference !== null ? Number(dtHoursFromReference.toFixed(4)) : null,
      dtHoursFromMainshock:
        dtHoursFromMainshock !== null ? Number(dtHoursFromMainshock.toFixed(4)) : null,
      window,
      isReferenceMatch,
      isDuplicate: dm.isDuplicate,
      duplicateOfId: dm.duplicateOfId,
      duplicateUncertain: dm.uncertain,
      duplicateNote: dm.note,
      eligible,
      excludedReason: reasons.length > 0 ? reasons.join('; ') : null,
    });
  }

  // Optional ST-DBSCAN cluster-assisted grouping
  const clusterMap = filters.enableClusterAssist
    ? computeStDbscanClusters(
        preClusterPool,
        filters.clusterEpsKm,
        filters.clusterTimeHours,
        filters.clusterMinPts
      )
    : new Map<string, number>();

  const uniqueClusters = new Set<number>(clusterMap.values());

  // Identify largest eligible event
  let largestEligibleId: string | null = null;
  let largestEligibleMag: number | null = null;
  for (const r of baseRows) {
    if (!r.eligible) continue;
    if (r.record.magnitude !== null) {
      if (largestEligibleMag === null || r.record.magnitude > largestEligibleMag) {
        largestEligibleMag = r.record.magnitude;
        largestEligibleId = r.record.id;
      }
    }
  }

  // Second pass: determine conservative roles and inclusion state
  let eligibleCount = 0;
  let selectedCount = 0;
  let excludedCount = 0;
  let duplicateCount = 0;
  let uncertainDuplicateCount = 0;

  let foreshockCount = 0;
  let aftershockCount = 0;
  let swarmClusterCount = 0;

  const events: SequenceCandidateEvent[] = baseRows.map((row) => {
    const rec = row.record;
    const clusterId = clusterMap.get(rec.id) ?? null;

    if (row.eligible) eligibleCount++;
    if (row.isDuplicate) {
      duplicateCount++;
      if (row.duplicateUncertain) uncertainDuplicateCount++;
    }

    // Membership decision:
    // - Manual exclusion always excludes
    // - Manual inclusion can pull in an otherwise filtered non-duplicate (or duplicate override)
    // - Otherwise included iff eligible
    const isManualExcluded = manualExcludedIds.has(rec.id);
    const isManualIncluded = manualIncludedIds.has(rec.id);
    const included = isManualExcluded ? false : isManualIncluded ? true : row.eligible;

    if (included) selectedCount++;
    else excludedCount++;

    // Conservative role assignment (never auto-labels all nearby events as aftershocks!)
    let role: SequenceEventRole = 'Unclassified';
    const manualRole = manualRoles[rec.id];
    if (manualRole) {
      role = manualRole;
    } else if (candidateMainshockId && rec.id === candidateMainshockId) {
      role = 'Candidate Mainshock';
    } else if (row.isReferenceMatch) {
      role = 'Reference Event';
    } else if (clusterId !== null) {
      // Only events inside an ST-DBSCAN spatiotemporal cluster or relative to explicit candidate mainshock receive candidate sequence tags
      if (candidateMainshockId && row.dtHoursFromMainshock !== null) {
        if (row.dtHoursFromMainshock < -0.02) role = 'Candidate Foreshock';
        else if (row.dtHoursFromMainshock > 0.02) role = 'Candidate Aftershock';
        else role = 'Candidate Swarm/Cluster';
      } else {
        role = 'Candidate Swarm/Cluster';
      }
    } else if (candidateMainshockId && row.dtHoursFromMainshock !== null && included) {
      // If user explicitly nominated a Candidate Mainshock, allow conservative candidate window tagging within 0.5 * radius
      const nearKm = Math.max(15, filters.radiusKm * 0.6);
      const distToMs = mainshockRecord
        ? geodesicDistanceKm(mainshockRecord.lat, mainshockRecord.lon, rec.lat, rec.lon)
        : row.distanceKm;
      if (distToMs <= nearKm) {
        if (row.dtHoursFromMainshock < -0.02 && row.dtHoursFromMainshock >= -filters.preDays * 24) {
          role = 'Candidate Foreshock';
        } else if (
          row.dtHoursFromMainshock > 0.02 &&
          row.dtHoursFromMainshock <= filters.postDays * 24
        ) {
          role = 'Candidate Aftershock';
        }
      }
    }

    if (included) {
      if (role === 'Candidate Foreshock') foreshockCount++;
      else if (role === 'Candidate Aftershock') aftershockCount++;
      else if (role === 'Candidate Swarm/Cluster') swarmClusterCount++;
    }

    return {
      ...row,
      clusterId,
      role,
      included,
    };
  });

  const selectedEvents = events.filter((e) => e.included);

  let characterization: SequenceCharacterization = 'Background / Unclassified';
  if (selectedCount < 3) {
    characterization = 'Insufficient Data';
  } else if (candidateMainshockId && aftershockCount >= 3 && foreshockCount >= 2) {
    characterization = 'Foreshock–Mainshock–Aftershock Candidate';
  } else if (candidateMainshockId && aftershockCount >= 3) {
    characterization = 'Mainshock–Aftershock Candidate';
  } else if (swarmClusterCount >= 4 || uniqueClusters.size > 0) {
    characterization = 'Swarm / Cluster Candidate';
  }

  return {
    referenceEventId: activeEvent.id,
    referenceTimeMs: refTimeMs,
    candidateMainshockId,
    candidateMainshockTimeMs: mainshockTimeMs,
    largestEligibleId,
    largestEligibleMag,
    totalCatalogCount: catalog.length,
    eligibleCount,
    selectedCount,
    excludedCount,
    duplicateCount,
    uncertainDuplicateCount,
    clusterCount: uniqueClusters.size,
    events,
    selectedEvents,
    characterization,
  };
}

/**
 * ES2 — Timeline, Seismicity Rate, Partial-Interval Accounting & Catalog Gap Detection.
 */
export function computeTimelineRateSummary(params: {
  selectedEvents: SequenceCandidateEvent[];
  referenceTimeMs: number | null;
  filters: SequenceFilterConfig;
}): TimelineRateSummary {
  const { selectedEvents, referenceTimeMs, filters } = params;

  const binHours =
    filters.binMode === 'hour'
      ? 1
      : filters.binMode === 'day'
        ? 24
        : filters.binMode === 'week'
          ? 168
          : Math.max(1, Math.min(720, filters.customBinHours || 12));
  const binMs = binHours * 3_600_000;

  if (selectedEvents.length === 0) {
    return {
      binHours,
      observationStartMs: null,
      observationEndMs: null,
      bins: [],
      gaps: [],
      preRefCount: 0,
      postRefCount: 0,
      preRefRatePerDay: null,
      postRefRatePerDay: null,
      preRefMaxMag: null,
      postRefMaxMag: null,
      trendDescription: 'No selected sequence events available to construct timeline rates.',
    };
  }

  const sorted = [...selectedEvents].sort((a, b) => a.record.originTimeMs - b.record.originTimeMs);
  const obsStartMs = sorted[0].record.originTimeMs;
  const obsEndMs = sorted[sorted.length - 1].record.originTimeMs;

  // Detect missing catalog periods (gaps exceeding threshold)
  const gapThreshMs = Math.max(6, filters.gapThresholdHours) * 3_600_000;
  const gaps: CatalogGapPeriod[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prevMs = sorted[i - 1].record.originTimeMs;
    const currMs = sorted[i].record.originTimeMs;
    const diff = currMs - prevMs;
    if (diff >= gapThreshMs) {
      gaps.push({
        startMs: prevMs,
        endMs: currMs,
        startUtc: new Date(prevMs).toISOString(),
        endUtc: new Date(currMs).toISOString(),
        durationHours: Number((diff / 3_600_000).toFixed(1)),
      });
    }
  }

  // Align bins cleanly on UTC intervals
  const firstBinStart = Math.floor(obsStartMs / binMs) * binMs;
  const lastBinStart = Math.floor(obsEndMs / binMs) * binMs;
  const totalBins = Math.min(600, Math.floor((lastBinStart - firstBinStart) / binMs) + 1);
  const effectiveBinMs =
    totalBins >= 600 ? Math.ceil((obsEndMs - firstBinStart + 1) / 600) : binMs;
  const effectiveBinHours = effectiveBinMs / 3_600_000;

  const counts = new Array<number>(totalBins).fill(0);
  const maxMags = new Array<number | null>(totalBins).fill(null);

  for (const ev of sorted) {
    const idx = Math.min(
      totalBins - 1,
      Math.max(0, Math.floor((ev.record.originTimeMs - firstBinStart) / effectiveBinMs))
    );
    counts[idx] += 1;
    if (ev.record.magnitude !== null) {
      const prev = maxMags[idx];
      if (prev === null || ev.record.magnitude > prev) {
        maxMags[idx] = ev.record.magnitude;
      }
    }
  }

  // Effective configured observation window for partial edge-interval detection
  const effectiveWindowStartMs =
    referenceTimeMs !== null
      ? referenceTimeMs - Math.max(filters.preDays, filters.backgroundDays) * 86_400_000
      : obsStartMs;
  const effectiveWindowEndMs =
    referenceTimeMs !== null ? referenceTimeMs + filters.postDays * 86_400_000 : obsEndMs;
  const clipBoundStartMs = Math.max(obsStartMs, effectiveWindowStartMs);
  const clipBoundEndMs = Math.min(obsEndMs, effectiveWindowEndMs);

  let cumulative = 0;
  const bins: TimelineRateBin[] = [];
  for (let i = 0; i < totalBins; i++) {
    const bStart = firstBinStart + i * effectiveBinMs;
    const bEnd = bStart + effectiveBinMs;
    const isEdgeBin = i === 0 || i === totalBins - 1;
    let observedHours = effectiveBinHours;
    if (isEdgeBin && totalBins > 1) {
      const clippedStart = Math.max(bStart, clipBoundStartMs);
      const clippedEnd = Math.min(bEnd, clipBoundEndMs);
      const rawObsHours = Math.max(0, (clippedEnd - clippedStart) / 3_600_000);
      observedHours = Math.max(
        Math.min(effectiveBinHours, Math.max(1, effectiveBinHours * 0.25)),
        Math.min(effectiveBinHours, rawObsHours)
      );
    }
    const isPartial = observedHours < effectiveBinHours * 0.95;
    cumulative += counts[i];
    const observedDays = Math.max(1 / 24, observedHours / 24);
    bins.push({
      binIndex: i,
      startMs: bStart,
      endMs: bEnd,
      labelUtc: new Date(bStart).toISOString().slice(0, 16).replace('T', ' '),
      count: counts[i],
      cumulativeCount: cumulative,
      observedHours: Number(observedHours.toFixed(2)),
      isPartialInterval: isPartial,
      ratePerDay: Number((counts[i] / observedDays).toFixed(2)),
      maxMag: maxMags[i],
    });
  }

  // Pre vs. Post reference comparison
  let preRefCount = 0;
  let postRefCount = 0;
  let preRefMaxMag: number | null = null;
  let postRefMaxMag: number | null = null;
  if (referenceTimeMs !== null) {
    for (const ev of sorted) {
      if (ev.record.originTimeMs < referenceTimeMs) {
        preRefCount++;
        if (ev.record.magnitude !== null && (preRefMaxMag === null || ev.record.magnitude > preRefMaxMag)) {
          preRefMaxMag = ev.record.magnitude;
        }
      } else if (ev.record.originTimeMs > referenceTimeMs) {
        postRefCount++;
        if (ev.record.magnitude !== null && (postRefMaxMag === null || ev.record.magnitude > postRefMaxMag)) {
          postRefMaxMag = ev.record.magnitude;
        }
      }
    }
  }

  const preSpanDays =
    referenceTimeMs !== null && obsStartMs < referenceTimeMs
      ? Math.max(1 / 24, (referenceTimeMs - obsStartMs) / 86_400_000)
      : null;
  const postSpanDays =
    referenceTimeMs !== null && obsEndMs > referenceTimeMs
      ? Math.max(1 / 24, (obsEndMs - referenceTimeMs) / 86_400_000)
      : null;

  const preRefRatePerDay =
    preSpanDays !== null ? Number((preRefCount / preSpanDays).toFixed(2)) : null;
  const postRefRatePerDay =
    postSpanDays !== null ? Number((postRefCount / postSpanDays).toFixed(2)) : null;

  const peakBin = bins.reduce((best, b) => (b.ratePerDay > best.ratePerDay ? b : best), bins[0]);
  const gapNote =
    gaps.length > 0
      ? ` ${gaps.length} inter-event gap(s) ≥ ${filters.gapThresholdHours}h detected (possible catalog outage/incompleteness, not treated as zero seismicity).`
      : '';
  const rateNote =
    preRefRatePerDay !== null && postRefRatePerDay !== null
      ? ` Observed rate shifted from ${preRefRatePerDay}/day pre-reference (${preRefCount} events) to ${postRefRatePerDay}/day post-reference (${postRefCount} events).`
      : '';

  return {
    binHours: Number(effectiveBinHours.toFixed(2)),
    observationStartMs: obsStartMs,
    observationEndMs: obsEndMs,
    bins,
    gaps,
    preRefCount,
    postRefCount,
    preRefRatePerDay,
    postRefRatePerDay,
    preRefMaxMag,
    postRefMaxMag,
    trendDescription: `Peak observed bin rate ${peakBin.ratePerDay}/day (${peakBin.count} events in interval starting ${peakBin.labelUtc} UTC).${rateNote}${gapNote} Descriptive historical summary only — not an earthquake prediction.`,
  };
}

/**
 * ES2 — Spatial Cross-Section Projection Wrapper reusing historicalSeismicity.projectEventsToCrossSection.
 */
export function projectSequenceToCrossSection(
  selectedEvents: SequenceCandidateEvent[],
  centerLat: number,
  centerLon: number,
  strikeAzimuthDeg: number,
  halfSwathKm: number
): CrossSectionProjectedEvent[] {
  const asFiltered: FilteredHistoricalEvent[] = selectedEvents.map((s) => ({
    record: s.record,
    distanceKm: s.distanceKm,
    azimuthDeg: s.azimuthDeg,
    dtHoursRelativeToActive: s.dtHoursFromReference,
    sequenceCandidate: 'Origin Window Candidate',
  }));
  return projectEventsToCrossSection(
    asFiltered,
    centerLat,
    centerLon,
    strikeAzimuthDeg,
    halfSwathKm
  );
}

/**
 * ES3 — Magnitude–Frequency Distribution & Gutenberg–Richter (Aki 1965 / Shi & Bolt 1982).
 * Never silently mixes Ml, Mw, mb, Ms for statistical b-value fitting.
 */
export function computeMagnitudeFrequencyAnalysis(params: {
  selectedEvents: SequenceCandidateEvent[];
  selectedMagType: string;
  mcMethod: SequenceMcMethod;
  manualMc: number;
  binWidth?: number;
}): MagnitudeFrequencyResult {
  const { selectedEvents, selectedMagType, mcMethod, manualMc } = params;
  const binWidth = params.binWidth ?? 0.1;

  const typeCountsMap = new Map<string, number>();
  for (const ev of selectedEvents) {
    if (ev.record.magnitude === null || !Number.isFinite(ev.record.magnitude)) continue;
    const mt = ev.record.magnitudeType || 'Unknown';
    typeCountsMap.set(mt, (typeCountsMap.get(mt) ?? 0) + 1);
  }
  const availableMagTypes = Array.from(typeCountsMap.entries())
    .map(([magType, count]) => ({ magType, count }))
    .sort((a, b) => b.count - a.count);

  const effectiveMagType =
    selectedMagType && typeCountsMap.has(selectedMagType)
      ? selectedMagType
      : availableMagTypes[0]?.magType ?? null;

  const warnings: string[] = [];
  if (availableMagTypes.length > 1) {
    warnings.push(
      `Catalog contains multiple magnitude scales (${availableMagTypes
        .map((m) => `${m.magType}:${m.count}`)
        .join(', ')}). Statistical fitting is strictly isolated to '${effectiveMagType}' to avoid scale mixing.`
    );
  }

  const mags = selectedEvents
    .filter(
      (ev) =>
        ev.record.magnitude !== null &&
        Number.isFinite(ev.record.magnitude) &&
        (effectiveMagType === null || (ev.record.magnitudeType || 'Unknown') === effectiveMagType)
    )
    .map((ev) => Number(ev.record.magnitude!.toFixed(2)));

  if (mags.length === 0) {
    return {
      status: 'Insufficient Data',
      selectedMagType: effectiveMagType,
      availableMagTypes,
      totalWithMag: 0,
      sampleAboveMc: 0,
      binWidth,
      mcMethod,
      mcValue: null,
      gftResidualPct: null,
      bValue: null,
      bStdErr: null,
      bCi95HalfWidth: null,
      aValue: null,
      bins: [],
      warnings: ['No numeric magnitudes available for the selected sequence and magnitude scale.'],
      methodNote: 'Aki (1965) MLE with ΔM/2 bin correction + Shi & Bolt (1982) uncertainty.',
    };
  }

  const minM = Math.floor(Math.min(...mags) * 10) / 10;
  const maxM = Math.ceil(Math.max(...mags) * 10) / 10;
  const binEdges: number[] = [];
  for (let m = minM; m <= maxM + 1e-6; m = Number((m + binWidth).toFixed(2))) {
    binEdges.push(m);
  }

  const countsByBin = binEdges.map((edge) =>
    mags.filter((m) => m >= edge - binWidth * 0.5 && m < edge + binWidth * 0.5).length
  );

  // Estimate Mc
  let mcValue = Number(manualMc.toFixed(1));
  let gftResidualPct: number | null = null;

  const computeAkiForThreshold = (mcCut: number) => {
    const sub = mags.filter((m) => m >= mcCut - binWidth * 0.5);
    if (sub.length < 2) return null;
    const meanM = sub.reduce((s, v) => s + v, 0) / sub.length;
    const denom = meanM - (mcCut - binWidth * 0.5);
    if (denom <= 0.05) return null;
    const bVal = Math.LOG10E / denom;
    const aVal = Math.log10(sub.length) + bVal * mcCut;
    return { sub, meanM, bVal, aVal };
  };

  if (mcMethod === 'maxc') {
    let bestIdx = 0;
    for (let i = 1; i < countsByBin.length; i++) {
      if (countsByBin[i] >= countsByBin[bestIdx]) bestIdx = i;
    }
    // Wiemer & Wyss (2000) empirical MAXC with +0.1/+0.2 adjustment clamped safely within observed span
    mcValue = Number(
      Math.max(minM, Math.min(maxM - 0.2, binEdges[bestIdx] + 0.1)).toFixed(1)
    );
  } else if (mcMethod === 'gft90') {
    let foundMc: number | null = null;
    let bestRes = Infinity;
    for (let i = 0; i < binEdges.length - 3; i++) {
      const mcCand = binEdges[i];
      const fit = computeAkiForThreshold(mcCand);
      if (!fit || fit.sub.length < 15) continue;
      let sumObs = 0;
      let sumAbsDiff = 0;
      for (let j = i; j < binEdges.length; j++) {
        const obsCum = mags.filter((m) => m >= binEdges[j] - binWidth * 0.5).length;
        const predCum = Math.pow(10, fit.aVal - fit.bVal * binEdges[j]);
        sumObs += obsCum;
        sumAbsDiff += Math.abs(obsCum - predCum);
      }
      const resPct = sumObs > 0 ? (sumAbsDiff / sumObs) * 100 : 100;
      if (resPct < bestRes) bestRes = resPct;
      if (resPct <= 10 && foundMc === null) {
        foundMc = mcCand;
        gftResidualPct = Number(resPct.toFixed(1));
        break;
      }
    }
    if (foundMc !== null) {
      mcValue = foundMc;
    } else {
      gftResidualPct = Number.isFinite(bestRes) ? Number(bestRes.toFixed(1)) : null;
      warnings.push('GFT-90 threshold (<10% residual) not met; fell back to manual/MAXC reference.');
    }
  }

  const fit = computeAkiForThreshold(mcValue);
  const sampleAboveMc = fit ? fit.sub.length : 0;
  const magSpanAboveMc =
    fit && fit.sub.length > 0 ? Math.max(...fit.sub) - Math.min(...fit.sub) : 0;

  let status: SequenceQualityStatus = 'Experimental';
  let bValue: number | null = null;
  let bStdErr: number | null = null;
  let bCi95HalfWidth: number | null = null;
  let aValue: number | null = null;

  if (!fit || sampleAboveMc < 20 || magSpanAboveMc < 0.7) {
    status = 'Insufficient Data';
    warnings.push(
      `Insufficient data above Mc=${mcValue.toFixed(1)} (n=${sampleAboveMc}, span=${magSpanAboveMc.toFixed(
        1
      )}). Minimum 20 events and ≥0.7 magnitude unit span required for reliable Gutenberg–Richter MLE.`
    );
  } else {
    const varianceSum = fit.sub.reduce((acc, m) => acc + (m - fit.meanM) ** 2, 0);
    const sigmaB =
      2.3 *
      fit.bVal *
      fit.bVal *
      Math.sqrt(varianceSum / Math.max(1, fit.sub.length * (fit.sub.length - 1)));
    bValue = Number(fit.bVal.toFixed(3));
    bStdErr = Number(sigmaB.toFixed(3));
    bCi95HalfWidth = Number((1.96 * sigmaB).toFixed(3));
    aValue = Number(fit.aVal.toFixed(3));
    if (bValue < 0.4 || bValue > 2.2) {
      status = 'Ambiguous';
      warnings.push(
        `Estimated b=${bValue} lies outside typical tectonic range (0.5–1.8); verify catalog completeness and magnitude homogeneity.`
      );
    }
  }

  const bins: MagnitudeBinCount[] = binEdges.map((edge, idx) => {
    const cumCount = mags.filter((m) => m >= edge - binWidth * 0.5).length;
    const fitted =
      aValue !== null && bValue !== null && edge >= mcValue - 1e-6
        ? Number((aValue - bValue * edge).toFixed(3))
        : null;
    return {
      magCenter: edge,
      count: countsByBin[idx],
      cumulativeCount: cumCount,
      log10Cum: cumCount > 0 ? Number(Math.log10(cumCount).toFixed(3)) : null,
      fittedLog10Cum: fitted,
    };
  });

  return {
    status,
    selectedMagType: effectiveMagType,
    availableMagTypes,
    totalWithMag: mags.length,
    sampleAboveMc,
    binWidth,
    mcMethod,
    mcValue,
    gftResidualPct,
    bValue,
    bStdErr,
    bCi95HalfWidth,
    aValue,
    bins,
    warnings,
    methodNote: `Aki (1965) MLE with ΔM/2=${(binWidth * 0.5).toFixed(
      2
    )} bin correction + Shi & Bolt (1982) 1σ uncertainty (Experimental — not empirically validated).`,
  };
}

/**
 * ES3 — Conditional Modified Omori–Utsu Decay via Ogata (1983) Event-Time Maximum Likelihood.
 *   n(t) = K / (t + c)^p
 * Refuses to force Omori fitting onto swarms or small/unsuitable sample sets.
 */
export function computeConditionalOmoriDecay(params: {
  selectedEvents: SequenceCandidateEvent[];
  characterization: SequenceCharacterization;
  referenceTimeMs: number | null;
  candidateMainshockTimeMs: number | null;
  fitStartDays: number;
  fitEndDays: number;
  mcThreshold: number;
  magTypeFilter: string | null;
}): OmoriDecayResult {
  const {
    selectedEvents,
    characterization,
    referenceTimeMs,
    candidateMainshockTimeMs,
    fitStartDays,
    fitEndDays,
    mcThreshold,
    magTypeFilter,
  } = params;

  const anchorTimeMs = candidateMainshockTimeMs ?? referenceTimeMs;
  const warnings: string[] = [];
  const limitations = [
    'Stationary single-sequence modified Omori–Utsu model assumes homogeneous completeness above Mc.',
    'Early post-mainshock hours frequently suffer short-term detection incompleteness (c-value bias).',
    'Conditional descriptive decay fit only — does not generate ETAS secondary cascades or earthquake probabilities.',
  ];

  const t1 = Math.max(0.001, fitStartDays);
  const t2 = Math.max(t1 + 0.5, fitEndDays);

  if (anchorTimeMs === null) {
    return {
      status: 'Insufficient Data',
      suitableForOmori: false,
      suitabilityReason: 'Missing valid UTC origin timestamp for mainshock/reference anchor.',
      referenceTimeUtc: null,
      fitStartDays: t1,
      fitEndDays: t2,
      mcThreshold,
      magTypeFilter,
      eventCountInWindow: 0,
      kValue: null,
      cValueDays: null,
      pValue: null,
      logLikelihood: null,
      ksStatistic: null,
      observedSeries: [],
      warnings: ['No valid UTC reference timestamp available for Omori–Utsu decay time t = 0.'],
      limitations,
    };
  }

  const anchorUtc = new Date(anchorTimeMs).toISOString();

  // Extract post-anchor event times above Mc
  const postEventTimesDays: number[] = [];
  for (const ev of selectedEvents) {
    const dtDays = (ev.record.originTimeMs - anchorTimeMs) / 86_400_000;
    if (dtDays < t1 || dtDays > t2) continue;
    if (ev.record.magnitude === null || ev.record.magnitude < mcThreshold) continue;
    if (magTypeFilter && (ev.record.magnitudeType || 'Unknown') !== magTypeFilter) continue;
    postEventTimesDays.push(dtDays);
  }
  postEventTimesDays.sort((a, b) => a - b);

  // Build observed logarithmically spaced rate bins regardless of fit eligibility
  const observedSeries: OmoriRatePoint[] = [];
  const numRateBins = 12;
  const logT1 = Math.log10(t1);
  const logT2 = Math.log10(t2);
  for (let b = 0; b < numRateBins; b++) {
    const bStart = Math.pow(10, logT1 + (b / numRateBins) * (logT2 - logT1));
    const bEnd = Math.pow(10, logT1 + ((b + 1) / numRateBins) * (logT2 - logT1));
    const midT = Math.sqrt(bStart * bEnd);
    const cnt = postEventTimesDays.filter((t) => t >= bStart && t < bEnd).length;
    const dtWidth = Math.max(1e-4, bEnd - bStart);
    observedSeries.push({
      timeDays: Number(midT.toFixed(4)),
      tStartDays: Number(bStart.toFixed(4)),
      tEndDays: Number(bEnd.toFixed(4)),
      count: cnt,
      observedRatePerDay: Number((cnt / dtWidth).toFixed(2)),
      fittedRatePerDay: null,
      residualPerDay: null,
    });
  }

  // Check suitability before fitting
  if (characterization === 'Swarm / Cluster Candidate' && candidateMainshockTimeMs === null) {
    return {
      status: 'Ambiguous',
      suitableForOmori: false,
      suitabilityReason:
        'Sequence appears swarm/cluster-like with no nominated Candidate Mainshock; Omori–Utsu decay fit is withheld.',
      referenceTimeUtc: anchorUtc,
      fitStartDays: t1,
      fitEndDays: t2,
      mcThreshold,
      magTypeFilter,
      eventCountInWindow: postEventTimesDays.length,
      kValue: null,
      cValueDays: null,
      pValue: null,
      logLikelihood: null,
      ksStatistic: null,
      observedSeries,
      warnings: [
        'Swarm-like seismicity does not generally follow a single mainshock-triggered Omori–Utsu decay law. Nominate an explicit Candidate Mainshock only if physically justified.',
      ],
      limitations,
    };
  }

  if (postEventTimesDays.length < 20) {
    return {
      status: 'Insufficient Data',
      suitableForOmori: false,
      suitabilityReason: `Only ${postEventTimesDays.length} post-event earthquake(s) ≥ M ${mcThreshold.toFixed(
        1
      )} in [${t1}, ${t2}] days (minimum 20 required for MLE).`,
      referenceTimeUtc: anchorUtc,
      fitStartDays: t1,
      fitEndDays: t2,
      mcThreshold,
      magTypeFilter,
      eventCountInWindow: postEventTimesDays.length,
      kValue: null,
      cValueDays: null,
      pValue: null,
      logLikelihood: null,
      ksStatistic: null,
      observedSeries,
      warnings: ['Insufficient post-event sample above Mc to constrain (K, c, p) stably.'],
      limitations,
    };
  }

  if (t1 < 0.05) {
    warnings.push(
      `Fit start t1=${t1.toFixed(3)} d is very early after the anchor event; coda masking & catalog incompleteness may artificially inflate c.`
    );
  }

  // Ogata (1983) continuous-time point-process log-likelihood evaluation
  const integralFactor = (c: number, p: number): number => {
    if (Math.abs(p - 1) < 1e-5) {
      return Math.log((t2 + c) / (t1 + c));
    }
    return (Math.pow(t2 + c, 1 - p) - Math.pow(t1 + c, 1 - p)) / (1 - p);
  };

  const n = postEventTimesDays.length;
  const evalLogLik = (c: number, p: number): { ll: number; k: number } => {
    const a = integralFactor(c, p);
    if (!Number.isFinite(a) || a <= 0) return { ll: -Infinity, k: 0 };
    const k = n / a;
    let sumLog = 0;
    for (let i = 0; i < n; i++) {
      sumLog += Math.log(postEventTimesDays[i] + c);
    }
    // ln L = N*ln(K) - p * sum ln(t_i + c) - K * A = N*ln(K) - p * sum - N
    const ll = n * Math.log(k) - p * sumLog - n;
    return { ll, k };
  };

  // Coarse 2D grid + progressive coordinate refinement
  let bestC = 0.05;
  let bestP = 1.0;
  let bestLl = -Infinity;
  let bestK = 10;

  const cGrid = [0.002, 0.005, 0.01, 0.02, 0.04, 0.08, 0.15, 0.3, 0.6, 1.2, 2.5, 5.0];
  for (const cCand of cGrid) {
    for (let pCand = 0.4; pCand <= 2.2 + 1e-9; pCand += 0.1) {
      const { ll, k } = evalLogLik(cCand, pCand);
      if (ll > bestLl) {
        bestLl = ll;
        bestC = cCand;
        bestP = pCand;
        bestK = k;
      }
    }
  }

  let stepC = bestC * 0.4;
  let stepP = 0.08;
  for (let round = 0; round < 10; round++) {
    let improved = false;
    for (const dc of [-stepC, 0, stepC]) {
      for (const dp of [-stepP, 0, stepP]) {
        if (dc === 0 && dp === 0) continue;
        const cCand = Math.max(0.001, Math.min(10, bestC + dc));
        const pCand = Math.max(0.35, Math.min(2.4, bestP + dp));
        const { ll, k } = evalLogLik(cCand, pCand);
        if (ll > bestLl) {
          bestLl = ll;
          bestC = cCand;
          bestP = pCand;
          bestK = k;
          improved = true;
        }
      }
    }
    if (!improved) {
      stepC *= 0.5;
      stepP *= 0.5;
    }
  }

  // Compute Kolmogorov-Smirnov residual D between empirical CDF and cumulative Omori integral
  const totalInt = integralFactor(bestC, bestP);
  let ksMax = 0;
  for (let i = 0; i < n; i++) {
    const t = postEventTimesDays[i];
    const partInt =
      Math.abs(bestP - 1) < 1e-5
        ? Math.log((t + bestC) / (t1 + bestC))
        : (Math.pow(t + bestC, 1 - bestP) - Math.pow(t1 + bestC, 1 - bestP)) / (1 - bestP);
    const modelCdf = Math.max(0, Math.min(1, partInt / Math.max(1e-12, totalInt)));
    const empBefore = i / n;
    const empAfter = (i + 1) / n;
    ksMax = Math.max(ksMax, Math.abs(empAfter - modelCdf), Math.abs(empBefore - modelCdf));
  }

  // Populate fitted rate curve & residuals on observed bins
  for (const pt of observedSeries) {
    const fitted = bestK / Math.pow(pt.timeDays + bestC, bestP);
    pt.fittedRatePerDay = Number(fitted.toFixed(2));
    pt.residualPerDay = Number((pt.observedRatePerDay - fitted).toFixed(2));
  }

  if (observedSeries.length > 0 && observedSeries[0].fittedRatePerDay !== null) {
    if (observedSeries[0].observedRatePerDay < observedSeries[0].fittedRatePerDay * 0.45) {
      warnings.push(
        `Initial post-event bin (${observedSeries[0].tStartDays}–${observedSeries[0].tEndDays} d) shows lower observed rate than fitted curve — strong indicator of early aftershock detection incompleteness.`
      );
    }
  }

  const status: SequenceQualityStatus =
    ksMax > 0.25 || bestC <= 0.0015 || bestC >= 9.5 ? 'Ambiguous' : 'Experimental';
  if (status === 'Ambiguous') {
    warnings.push(
      `Fit boundary or elevated KS residual (D=${ksMax.toFixed(
        3
      )}); c/p parameters are weakly constrained.`
    );
  }

  return {
    status,
    suitableForOmori: true,
    suitabilityReason: `Fitted over ${n} events (M ≥ ${mcThreshold.toFixed(
      1
    )}) in [${t1}, ${t2}] d via Ogata (1983) continuous-time MLE.`,
    referenceTimeUtc: anchorUtc,
    fitStartDays: t1,
    fitEndDays: t2,
    mcThreshold,
    magTypeFilter,
    eventCountInWindow: n,
    kValue: Number(bestK.toFixed(2)),
    cValueDays: Number(bestC.toFixed(4)),
    pValue: Number(bestP.toFixed(3)),
    logLikelihood: Number(bestLl.toFixed(2)),
    ksStatistic: Number(ksMax.toFixed(3)),
    observedSeries,
    warnings,
    limitations,
  };
}

/**
 * ES3 — Holistic Investigation Quality Assessment Report.
 */
export function buildSequenceQualityReport(params: {
  assembly: SequenceAssemblyResult;
  timeline: TimelineRateSummary;
  mfd: MagnitudeFrequencyResult;
  omori: OmoriDecayResult;
}): SequenceQualityReport {
  const { assembly, timeline, mfd, omori } = params;
  const selected = assembly.selectedEvents;
  const missingDepthCount = selected.filter((e) => e.record.depthKm === null).length;
  const uncertainLocationCount = selected.filter((e) => e.record.locationUncertain).length;

  let overallStatus: SequenceQualityStatus = 'Experimental';
  if (assembly.selectedCount < 3 || mfd.status === 'Insufficient Data') {
    overallStatus = 'Insufficient Data';
  } else if (
    mfd.status === 'Ambiguous' ||
    omori.status === 'Ambiguous' ||
    assembly.uncertainDuplicateCount > 0 ||
    uncertainLocationCount > selected.length * 0.4
  ) {
    overallStatus = 'Ambiguous';
  }

  const limitations: string[] = [
    'Sequence roles (Candidate Mainshock/Foreshock/Aftershock/Swarm) are provisional analytical tags — not confirmed physical rupture associations.',
    'Spatial proximity and temporal ordering do not prove static Coulomb stress triggering, fluid migration, or fault rupture propagation.',
    'All statistical parameters (Mc, b-value, Omori K/c/p) are marked Experimental until benchmarked against independently curated regional catalogs.',
    'Missing catalog observation intervals are explicitly flagged as potential outages and never treated as confirmed zero seismicity.',
  ];

  return {
    overallStatus,
    totalCatalogRecords: assembly.totalCatalogCount,
    independentSelectedRecords: assembly.selectedCount,
    duplicateFlaggedCount: assembly.duplicateCount,
    uncertainMatchCount: assembly.uncertainDuplicateCount,
    missingDepthCount,
    uncertainLocationCount,
    temporalCoverageNote:
      timeline.observationStartMs && timeline.observationEndMs
        ? `${new Date(timeline.observationStartMs).toISOString().slice(0, 16)} to ${new Date(
            timeline.observationEndMs
          )
            .toISOString()
            .slice(0, 16)} UTC (${timeline.gaps.length} gap(s) ≥ ${
            timeline.gaps[0]?.durationHours ?? '—'
          }h)`
        : 'No temporal coverage',
    completenessNote:
      mfd.bValue !== null && mfd.mcValue !== null
        ? `Mc=${mfd.mcValue.toFixed(1)} (${mfd.mcMethod.toUpperCase()}), n=${mfd.sampleAboveMc} (${mfd.selectedMagType}), b=${mfd.bValue.toFixed(
            3
          )} ± ${mfd.bStdErr?.toFixed(3)}`
        : mfd.warnings[0] || 'Insufficient completeness sample',
    modelSuitabilityNote: omori.suitableForOmori
      ? `Omori–Utsu (Ogata MLE): p=${omori.pValue ?? '—'}, c=${omori.cValueDays ?? '—'} d, K=${
          omori.kValue ?? '—'
        }, KS=${omori.ksStatistic ?? '—'}`
      : omori.suitabilityReason,
    limitations,
  };
}

/**
 * ES5 — Export Helpers (CSV, GeoJSON, Reproducible JSON & Concise Research Summary).
 */
function csvEsc(val: unknown): string {
  const s = String(val ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportSequenceEventsCsv(params: {
  investigationName: string;
  activeEvent: EQPEvent;
  assembly: SequenceAssemblyResult;
  catalogVersion: number;
}): string {
  const { investigationName, activeEvent, assembly, catalogVersion } = params;
  const lines = [
    `# EQP Modern Earthquake Sequence Export (Read-Only Research Investigation)`,
    `# Investigation: ${investigationName} | Method: ${SEQUENCE_METHOD_VERSION}`,
    `# Reference EQP Event: ${activeEvent.id} | UTC ${activeEvent.originDateGmt} ${activeEvent.originTimeGmt} | Catalog Version: ${catalogVersion}`,
    [
      'recordId',
      'eventId',
      'originTimeUtc',
      'lat',
      'lon',
      'depthKm',
      'depthStatus',
      'magnitude',
      'magnitudeType',
      'distanceKmFromRef',
      'azimuthDeg',
      'dtHoursFromRef',
      'dtHoursFromMainshock',
      'window',
      'provisionalRole',
      'clusterId',
      'included',
      'isReferenceMatch',
      'isDuplicate',
      'dataSource',
      'catalogVersion',
      'place',
    ].join(','),
  ];

  for (const ev of assembly.selectedEvents) {
    const r = ev.record;
    lines.push(
      [
        r.id,
        r.eventId,
        r.originTimeUtc,
        r.lat.toFixed(5),
        r.lon.toFixed(5),
        r.depthKm !== null ? r.depthKm.toFixed(2) : '',
        r.depthStatus,
        r.magnitude !== null ? r.magnitude.toFixed(2) : '',
        r.magnitudeType,
        ev.distanceKm,
        ev.azimuthDeg,
        ev.dtHoursFromReference ?? '',
        ev.dtHoursFromMainshock ?? '',
        ev.window,
        ev.role,
        ev.clusterId ?? '',
        ev.included,
        ev.isReferenceMatch,
        ev.isDuplicate,
        r.dataSource,
        r.catalogVersion,
        r.place,
      ]
        .map(csvEsc)
        .join(',')
    );
  }
  return lines.join('\n');
}

export function exportSequenceGeoJson(params: {
  investigationName: string;
  activeEvent: EQPEvent;
  assembly: SequenceAssemblyResult;
}): string {
  const { investigationName, activeEvent, assembly } = params;
  const fc = {
    type: 'FeatureCollection',
    metadata: {
      schema: 'eqp-modern.earthquake-sequence.geojson.v1',
      investigationName,
      referenceEventId: activeEvent.id,
      candidateMainshockId: assembly.candidateMainshockId,
      characterization: assembly.characterization,
      generatedAtUtc: new Date().toISOString(),
      disclaimer:
        'Provisional sequence membership and roles for research only; not confirmed physical causal links.',
    },
    features: assembly.selectedEvents.map((ev) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [
          ev.record.lon,
          ev.record.lat,
          ...(ev.record.depthKm !== null ? [ev.record.depthKm] : []),
        ],
      },
      properties: {
        id: ev.record.id,
        eventId: ev.record.eventId,
        originTimeUtc: ev.record.originTimeUtc,
        magnitude: ev.record.magnitude,
        magnitudeType: ev.record.magnitudeType,
        depthKm: ev.record.depthKm,
        distanceKmFromRef: ev.distanceKm,
        dtHoursFromRef: ev.dtHoursFromReference,
        dtHoursFromMainshock: ev.dtHoursFromMainshock,
        provisionalRole: ev.role,
        window: ev.window,
        clusterId: ev.clusterId,
        dataSource: ev.record.dataSource,
        place: ev.record.place,
        hasFocalMechanism: ev.record.focalMechanism !== null,
      },
    })),
  };
  return JSON.stringify(fc, null, 2);
}

export function exportTimelineRatesCsv(
  timeline: TimelineRateSummary,
  investigationName: string
): string {
  const lines = [
    `# EQP Modern Sequence Timeline & Seismicity Rates`,
    `# Investigation: ${investigationName} | Bin Width: ${timeline.binHours} hours`,
    ['binIndex', 'startUtc', 'endUtc', 'eventCount', 'cumulativeCount', 'observedHours', 'isPartialInterval', 'ratePerDay', 'maxMag'].join(','),
  ];
  for (const b of timeline.bins) {
    lines.push(
      [
        b.binIndex,
        new Date(b.startMs).toISOString(),
        new Date(b.endMs).toISOString(),
        b.count,
        b.cumulativeCount,
        b.observedHours,
        b.isPartialInterval,
        b.ratePerDay,
        b.maxMag ?? '',
      ]
        .map(csvEsc)
        .join(',')
    );
  }
  return lines.join('\n');
}

export function exportMagnitudeFrequencyCsv(
  mfd: MagnitudeFrequencyResult,
  investigationName: string
): string {
  const lines = [
    `# EQP Modern Sequence Magnitude-Frequency & Gutenberg-Richter Export (Experimental)`,
    `# Investigation: ${investigationName} | Scale: ${mfd.selectedMagType ?? 'None'} | Mc: ${mfd.mcValue ?? 'N/A'} (${mfd.mcMethod.toUpperCase()}) | b: ${mfd.bValue ?? 'Withheld'} +/- ${mfd.bStdErr ?? 'N/A'} | a: ${mfd.aValue ?? 'Withheld'}`,
    ['magCenter', 'binWidth', 'incrementalCount', 'cumulativeCount', 'log10Cum', 'fittedLog10Cum', 'residualLog10'].join(','),
  ];
  for (const b of mfd.bins) {
    const residual =
      b.log10Cum !== null && b.fittedLog10Cum !== null
        ? Number((b.log10Cum - b.fittedLog10Cum).toFixed(3))
        : '';
    lines.push(
      [
        b.magCenter.toFixed(2),
        mfd.binWidth.toFixed(2),
        b.count,
        b.cumulativeCount,
        b.log10Cum ?? '',
        b.fittedLog10Cum ?? '',
        residual,
      ]
        .map(csvEsc)
        .join(',')
    );
  }
  return lines.join('\n');
}

export function exportSequenceInvestigationJson(params: {
  investigationName: string;
  notes?: string;
  activeEvent: EQPEvent;
  filters: SequenceFilterConfig;
  assembly: SequenceAssemblyResult;
  timeline: TimelineRateSummary;
  mfd: MagnitudeFrequencyResult;
  omori: OmoriDecayResult;
  quality: SequenceQualityReport;
  catalogVersion: number;
  inputFingerprint: string;
  includedEventIds?: string[];
  excludedEventIds?: string[];
  manualRoles?: Record<string, SequenceEventRole>;
  mcMethod?: SequenceMcMethod;
  manualMc?: number;
  omoriFitStartDays?: number;
  omoriFitEndDays?: number;
  omoriMc?: number;
}): string {
  return JSON.stringify(
    {
      schema: 'eqp-modern.earthquake-sequence-analysis.v1',
      exportedAtUtc: new Date().toISOString(),
      methodVersion: SEQUENCE_METHOD_VERSION,
      investigationName: params.investigationName,
      notes: params.notes ?? '',
      catalogVersion: params.catalogVersion,
      inputFingerprint: params.inputFingerprint,
      referenceEvent: {
        id: params.activeEvent.id,
        acceptedSolutionIterations: params.activeEvent.iterations,
        originDateGmt: params.activeEvent.originDateGmt,
        originTimeGmt: params.activeEvent.originTimeGmt,
        lat: params.activeEvent.lat,
        lon: params.activeEvent.lon,
        depthKm: params.activeEvent.depthKm,
      },
      filters: params.filters,
      membershipDecisions: {
        candidateMainshockId: params.assembly.candidateMainshockId,
        includedEventIds: params.includedEventIds ?? [],
        excludedEventIds: params.excludedEventIds ?? [],
        manualRoles: params.manualRoles ?? {},
      },
      statisticalParams: {
        selectedMagType: params.mfd.selectedMagType ?? '',
        mcMethod: params.mcMethod ?? params.mfd.mcMethod,
        manualMc: params.manualMc ?? params.mfd.mcValue ?? 3.0,
        omoriFitStartDays: params.omoriFitStartDays ?? params.omori.fitStartDays,
        omoriFitEndDays: params.omoriFitEndDays ?? params.omori.fitEndDays,
        omoriMc: params.omoriMc ?? params.omori.mcThreshold ?? 3.0,
      },
      summary: {
        characterization: params.assembly.characterization,
        candidateMainshockId: params.assembly.candidateMainshockId,
        eligibleCount: params.assembly.eligibleCount,
        selectedCount: params.assembly.selectedCount,
        duplicateCount: params.assembly.duplicateCount,
      },
      timelineSummary: {
        binHours: params.timeline.binHours,
        preRefCount: params.timeline.preRefCount,
        postRefCount: params.timeline.postRefCount,
        preRefRatePerDay: params.timeline.preRefRatePerDay,
        postRefRatePerDay: params.timeline.postRefRatePerDay,
        gaps: params.timeline.gaps,
        trendDescription: params.timeline.trendDescription,
      },
      magnitudeFrequency: params.mfd,
      omoriDecay: params.omori,
      qualityReport: params.quality,
      selectedEvents: params.assembly.selectedEvents.map((e) => ({
        id: e.record.id,
        eventId: e.record.eventId,
        originTimeUtc: e.record.originTimeUtc,
        lat: e.record.lat,
        lon: e.record.lon,
        depthKm: e.record.depthKm,
        magnitude: e.record.magnitude,
        magnitudeType: e.record.magnitudeType,
        role: e.role,
        window: e.window,
        distanceKm: e.distanceKm,
        dtHoursFromReference: e.dtHoursFromReference,
      })),
    },
    null,
    2
  );
}

/**
 * Parses either a SavedSequenceInvestigation record or an exported eqp-modern.earthquake-sequence-analysis.v1 package.
 */
export function parseSequenceInvestigationJson(rawJson: string): SavedSequenceInvestigation {
  const parsed = JSON.parse(rawJson) as Record<string, unknown>;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid JSON structure for sequence investigation.');
  }
  const filters = (parsed.filters as SequenceFilterConfig | undefined) ?? DEFAULT_SEQUENCE_FILTERS;
  const membership = parsed.membershipDecisions as Record<string, unknown> | undefined;
  const statParams = parsed.statisticalParams as Record<string, unknown> | undefined;
  const refObj = parsed.referenceEvent as Record<string, unknown> | undefined;
  const summaryObj = parsed.summary as Record<string, unknown> | undefined;

  const name =
    typeof parsed.investigationName === 'string' && parsed.investigationName.trim()
      ? parsed.investigationName.trim()
      : typeof parsed.name === 'string' && parsed.name.trim()
      ? parsed.name.trim()
      : `Imported-${new Date().toISOString().slice(0, 10)}`;

  return {
    id: typeof parsed.id === 'string' && parsed.id.trim() ? parsed.id.trim() : '',
    name,
    notes: typeof parsed.notes === 'string' ? parsed.notes : '',
    savedAtUtc:
      typeof parsed.savedAtUtc === 'string'
        ? parsed.savedAtUtc
        : typeof parsed.exportedAtUtc === 'string'
        ? parsed.exportedAtUtc
        : new Date().toISOString(),
    referenceEventId: String(
      parsed.referenceEventId ?? refObj?.id ?? ''
    ),
    acceptedSolutionIterations: Number(
      parsed.acceptedSolutionIterations ?? refObj?.acceptedSolutionIterations ?? 0
    ),
    candidateMainshockId:
      (parsed.candidateMainshockId as string | null | undefined) ??
      (membership?.candidateMainshockId as string | null | undefined) ??
      (summaryObj?.candidateMainshockId as string | null | undefined) ??
      null,
    includedEventIds: Array.isArray(parsed.includedEventIds)
      ? (parsed.includedEventIds as string[])
      : Array.isArray(membership?.includedEventIds)
      ? (membership.includedEventIds as string[])
      : [],
    excludedEventIds: Array.isArray(parsed.excludedEventIds)
      ? (parsed.excludedEventIds as string[])
      : Array.isArray(membership?.excludedEventIds)
      ? (membership.excludedEventIds as string[])
      : [],
    manualRoles:
      parsed.manualRoles && typeof parsed.manualRoles === 'object'
        ? (parsed.manualRoles as Record<string, SequenceEventRole>)
        : membership?.manualRoles && typeof membership.manualRoles === 'object'
        ? (membership.manualRoles as Record<string, SequenceEventRole>)
        : {},
    filters: { ...DEFAULT_SEQUENCE_FILTERS, ...filters },
    mcMethod:
      (parsed.mcMethod as SequenceMcMethod | undefined) ??
      (statParams?.mcMethod as SequenceMcMethod | undefined) ??
      'maxc',
    manualMc: Number(parsed.manualMc ?? statParams?.manualMc ?? 3.0),
    selectedMagType: String(parsed.selectedMagType ?? statParams?.selectedMagType ?? ''),
    omoriFitStartDays: Number(parsed.omoriFitStartDays ?? statParams?.omoriFitStartDays ?? 0.05),
    omoriFitEndDays: Number(parsed.omoriFitEndDays ?? statParams?.omoriFitEndDays ?? 60),
    omoriMc: Number(parsed.omoriMc ?? statParams?.omoriMc ?? 3.0),
    catalogVersion: Number(parsed.catalogVersion ?? 1),
    analysisMethodVersion: String(
      parsed.analysisMethodVersion ?? parsed.methodVersion ?? SEQUENCE_METHOD_VERSION
    ),
    inputFingerprint: String(parsed.inputFingerprint ?? ''),
    summarySnapshot: (parsed.summarySnapshot as SavedSequenceInvestigation['summarySnapshot']) ?? {
      selectedCount: Number(summaryObj?.selectedCount ?? 0),
      characterization:
        (summaryObj?.characterization as SequenceCharacterization) ?? 'Background / Unclassified',
      bValue: null,
      mcValue: null,
      omoriP: null,
      overallStatus: 'Experimental',
    },
  };
}

