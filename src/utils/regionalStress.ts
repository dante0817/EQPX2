import { EQPEvent, isEventUnlocated } from '../data/eqpData';
import {
  computeKaganAngleDeg,
  dotVec,
  NodalPlane,
  normalizeAngle360,
  normalizeRake,
  normalizeVec,
  planeToVectors,
  PrincipalAxis,
  Vec3,
  vecToTrendPlunge,
} from './focalMechanism';
import {
  geodesicAzimuthDeg,
  geodesicDistanceKm,
  HistoricalEarthquakeRecord,
  HistoricalFocalMechanism,
  MechanismProvenanceKind,
  MechanismQualityGrade,
  parseActiveEventUtcMs,
} from './historicalSeismicity';

export type StressCenterMode = 'active-event' | 'custom-point' | 'all-locations';
export type StressRadiusPreset = '25' | '50' | '100' | '200' | '500' | 'custom';
export type StressTimeWindowPreset = 'all' | '30d' | '365d' | '10y' | 'custom-dates';
export type StressProvenanceFilter =
  | 'all'
  | 'validated-only'
  | 'imported-or-validated'
  | 'exclude-experimental';

export type StressInversionMode = 'iterative-unbiased' | 'michael-random-bootstrap';

export type StressResultStatus =
  | 'Insufficient Data'
  | 'Experimental'
  | 'Ambiguous'
  | 'Validated';

export type StressRegimeClass =
  | 'Normal'
  | 'Normal / Strike-Slip'
  | 'Strike-Slip'
  | 'Reverse / Strike-Slip'
  | 'Reverse / Thrust'
  | 'Transitional / Oblique';

export interface StressFilterConfig {
  centerMode: StressCenterMode;
  customLat: number;
  customLon: number;
  radiusPreset: StressRadiusPreset;
  customRadiusKm: number;
  timeWindowPreset: StressTimeWindowPreset;
  startDateUtc: string;
  endDateUtc: string;
  minDepthKm: string;
  maxDepthKm: string;
  includeMissingDepth: boolean;
  minMag: string;
  maxMag: string;
  provenanceFilter: StressProvenanceFilter;
  qualityGrades: MechanismQualityGrade[];
  dataSources: string[];
  autoDeduplicateCrossSource: boolean;
}

export interface StressInversionConfig {
  mode: StressInversionMode;
  bootstrapIterations: number;
  useQualityWeights: boolean;
  isReferenceBenchmarkRun?: boolean;
}

export const DEFAULT_STRESS_FILTERS: StressFilterConfig = {
  centerMode: 'active-event',
  customLat: 14.6,
  customLon: 121.0,
  radiusPreset: '200',
  customRadiusKm: 250,
  timeWindowPreset: 'all',
  startDateUtc: '',
  endDateUtc: '',
  minDepthKm: '',
  maxDepthKm: '',
  includeMissingDepth: true,
  minMag: '',
  maxMag: '',
  provenanceFilter: 'all',
  qualityGrades: [],
  dataSources: [],
  autoDeduplicateCrossSource: true,
};

export const DEFAULT_STRESS_INVERSION_CONFIG: StressInversionConfig = {
  mode: 'iterative-unbiased',
  bootstrapIterations: 200,
  useQualityWeights: true,
};

export const MIN_INDEPENDENT_MECHANISMS = 5;
export const RECOMMENDED_MECHANISMS = 8;

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

export const STRESS_QUALITY_WEIGHTS: Record<MechanismQualityGrade, number> = {
  A: 1.0,
  B: 0.75,
  C: 0.5,
  D: 0.25,
  Unknown: 0.5,
};

export interface PreparedStressMechanism {
  record: HistoricalEarthquakeRecord;
  mechanism: HistoricalFocalMechanism;
  plane1: NodalPlane;
  plane2: NodalPlane;
  n1: Vec3;
  s1: Vec3;
  n2: Vec3;
  s2: Vec3;
  weight: number;
  distanceKm: number | null;
  azimuthDeg: number | null;
  eligible: boolean;
  included: boolean;
  exclusionReason: string | null;
  duplicateOfId: string | null;
}

export interface StressDatasetSummary {
  totalCatalogRecords: number;
  recordsWithMechanism: number;
  filterMatchedCount: number;
  eligibleCount: number;
  selectedCount: number;
  excludedCount: number;
  duplicateCollapsedCount: number;
  independentCount: number;
  provenanceCounts: Record<MechanismProvenanceKind, number>;
  qualityCounts: Record<MechanismQualityGrade, number>;
  sourceCounts: Array<{ source: string; count: number }>;
  centroidLat: number | null;
  centroidLon: number | null;
  spatialSpanKm: number;
  depthMinKm: number | null;
  depthMaxKm: number | null;
  meanKaganDiversityDeg: number;
  maxKaganDiversityDeg: number;
  warnings: string[];
  centerLat: number | null;
  centerLon: number | null;
  effectiveRadiusKm: number | null;
}

export interface StressDataPreparationResult {
  items: PreparedStressMechanism[];
  includedItems: PreparedStressMechanism[];
  excludedItems: PreparedStressMechanism[];
  summary: StressDatasetSummary;
}

export interface PrincipalStressAxisResult {
  label: 'σ1' | 'σ2' | 'σ3';
  name: string;
  trend: number;
  plunge: number;
  vec: Vec3;
  eigenvalueNormalized: number;
  uncertainty95Deg: number;
  medianBootAngleDeg: number;
}

export interface BootstrapAxisSample {
  trend: number;
  plunge: number;
}

export interface MechanismInversionFit {
  recordId: string;
  eventId: string;
  dataSource: string;
  provenanceKind: MechanismProvenanceKind;
  quality: MechanismQualityGrade;
  weight: number;
  misfitPlane1Deg: number;
  misfitPlane2Deg: number;
  preferredPlane: 1 | 2;
  selectedMisfitDeg: number;
  planeAmbiguous: boolean;
}

export interface StressTensorComponents {
  sigmaNN: number;
  sigmaNE: number;
  sigmaND: number;
  sigmaEE: number;
  sigmaED: number;
  sigmaDD: number;
}

export interface StressRegimeAssessment {
  regimeClass: StressRegimeClass;
  zobackCode: 'NF' | 'NS' | 'SS' | 'TS' | 'TF' | 'OBL';
  simpsonAPhi: number;
  simpsonAPhiCI95: [number, number];
  ruleExplanation: string;
  pVsSigmaNote: string;
}

export interface RegionalStressInversionResult {
  status: StressResultStatus;
  insufficientReasons: string[];
  ambiguityReasons: string[];
  warnings: string[];
  methodologyLabel: string;
  conventionNote: string;
  inputFingerprint: string;
  computedAtUtc: string;
  config: StressInversionConfig;
  datasetSummary: StressDatasetSummary;
  tensor: StressTensorComponents | null;
  sigma1: PrincipalStressAxisResult | null;
  sigma2: PrincipalStressAxisResult | null;
  sigma3: PrincipalStressAxisResult | null;
  stressRatioR: number | null;
  stressRatioRCI95: [number, number] | null;
  bishopPhi: number | null;
  bishopPhiCI95: [number, number] | null;
  shMaxAzimuthDeg: number | null;
  shMaxUncertainty95Deg: number | null;
  shMaxDefined: boolean;
  shMaxNote: string;
  regime: StressRegimeAssessment | null;
  meanMisfitDeg: number | null;
  medianMisfitDeg: number | null;
  rmsMisfitDeg: number | null;
  maxMisfitDeg: number | null;
  wellFittedPct: number | null;
  ambiguousPlaneFraction: number | null;
  conditionNumber: number | null;
  rankRatio: number | null;
  mechanismFits: MechanismInversionFit[];
  bootstrapSamples: {
    sigma1: BootstrapAxisSample[];
    sigma2: BootstrapAxisSample[];
    sigma3: BootstrapAxisSample[];
  };
  limitations: string[];
  referenceValidationNote: string;
}

export function resolveStressRadiusKm(filters: StressFilterConfig): number {
  if (filters.radiusPreset === 'custom') {
    return Number.isFinite(filters.customRadiusKm) && filters.customRadiusKm > 0
      ? filters.customRadiusKm
      : 200;
  }
  return Number(filters.radiusPreset);
}

function qualityRank(q: MechanismQualityGrade): number {
  if (q === 'A') return 5;
  if (q === 'B') return 4;
  if (q === 'C') return 3;
  if (q === 'Unknown') return 2;
  return 1;
}

function provenanceRank(p: MechanismProvenanceKind): number {
  if (p === 'Validated') return 3;
  if (p === 'Imported') return 2;
  return 1;
}

function isValidNodalPlane(p: NodalPlane | undefined | null): p is NodalPlane {
  if (!p) return false;
  return (
    Number.isFinite(p.strike) &&
    Number.isFinite(p.dip) &&
    Number.isFinite(p.rake) &&
    p.dip >= 0 &&
    p.dip <= 90
  );
}

/**
 * Prepares, validates, filters, and deduplicates focal mechanism records
 * for regional stress tensor inversion. Read-only relative to EQPEvent and catalog.
 */
export function prepareStressMechanisms(
  catalog: HistoricalEarthquakeRecord[],
  activeEvent: EQPEvent,
  filters: StressFilterConfig,
  manualExcludedIds: ReadonlySet<string> = new Set()
): StressDataPreparationResult {
  const unlocated = isEventUnlocated(activeEvent);
  const effectiveRadiusKm =
    filters.centerMode === 'all-locations' ? null : resolveStressRadiusKm(filters);

  let centerLat: number | null = null;
  let centerLon: number | null = null;
  if (filters.centerMode === 'active-event') {
    if (!unlocated) {
      centerLat = activeEvent.lat;
      centerLon = activeEvent.lon;
    }
  } else if (filters.centerMode === 'custom-point') {
    if (
      Number.isFinite(filters.customLat) &&
      Number.isFinite(filters.customLon) &&
      filters.customLat >= -90 &&
      filters.customLat <= 90 &&
      filters.customLon >= -180 &&
      filters.customLon <= 180
    ) {
      centerLat = filters.customLat;
      centerLon = filters.customLon;
    }
  }

  const activeTimeMs = parseActiveEventUtcMs(activeEvent);
  const minMagNum = filters.minMag.trim() === '' ? null : Number(filters.minMag);
  const maxMagNum = filters.maxMag.trim() === '' ? null : Number(filters.maxMag);
  const minDepthNum = filters.minDepthKm.trim() === '' ? null : Number(filters.minDepthKm);
  const maxDepthNum = filters.maxDepthKm.trim() === '' ? null : Number(filters.maxDepthKm);

  const startMs =
    filters.timeWindowPreset === 'custom-dates' && filters.startDateUtc
      ? Date.parse(`${filters.startDateUtc}T00:00:00Z`)
      : null;
  const endMs =
    filters.timeWindowPreset === 'custom-dates' && filters.endDateUtc
      ? Date.parse(`${filters.endDateUtc}T23:59:59.999Z`)
      : null;

  const presetWindowMs =
    filters.timeWindowPreset === '30d'
      ? 30 * 86400_000
      : filters.timeWindowPreset === '365d'
        ? 365 * 86400_000
        : filters.timeWindowPreset === '10y'
          ? 3650 * 86400_000
          : null;

  const withMechs = catalog.filter((r) => r.focalMechanism !== null);
  const candidates: PreparedStressMechanism[] = [];

  for (const record of withMechs) {
    const fm = record.focalMechanism!;
    let distKm: number | null = null;
    let azDeg: number | null = null;
    if (centerLat !== null && centerLon !== null) {
      distKm = Number(geodesicDistanceKm(centerLat, centerLon, record.lat, record.lon).toFixed(2));
      azDeg = Number(geodesicAzimuthDeg(centerLat, centerLon, record.lat, record.lon).toFixed(1));
    }

    // Check filter match
    let filterReason: string | null = null;
    if (
      filters.centerMode === 'active-event' &&
      unlocated
    ) {
      filterReason = 'Active event unlocated for radius filter (switch to Custom Point or All Locations)';
    } else if (
      effectiveRadiusKm !== null &&
      distKm !== null &&
      (!Number.isFinite(distKm) || distKm > effectiveRadiusKm)
    ) {
      filterReason = `Outside ${effectiveRadiusKm} km radius (${distKm} km)`;
    }

    if (!filterReason) {
      if (presetWindowMs !== null && activeTimeMs !== null) {
        if (Math.abs(record.originTimeMs - activeTimeMs) > presetWindowMs) {
          filterReason = 'Outside relative time window';
        }
      } else if (filters.timeWindowPreset === 'custom-dates') {
        if (startMs !== null && Number.isFinite(startMs) && record.originTimeMs < startMs) {
          filterReason = 'Before start date filter';
        }
        if (endMs !== null && Number.isFinite(endMs) && record.originTimeMs > endMs) {
          filterReason = 'After end date filter';
        }
      }
    }

    if (!filterReason) {
      if (record.depthKm === null) {
        if (!filters.includeMissingDepth) filterReason = 'Missing depth excluded';
      } else {
        if (minDepthNum !== null && Number.isFinite(minDepthNum) && record.depthKm < minDepthNum) {
          filterReason = `Depth ${record.depthKm} km < min ${minDepthNum} km`;
        } else if (maxDepthNum !== null && Number.isFinite(maxDepthNum) && record.depthKm > maxDepthNum) {
          filterReason = `Depth ${record.depthKm} km > max ${maxDepthNum} km`;
        }
      }
    }

    if (!filterReason) {
      if (minMagNum !== null && Number.isFinite(minMagNum)) {
        if (record.magnitude === null || record.magnitude < minMagNum) {
          filterReason = 'Below minimum magnitude filter';
        }
      }
      if (maxMagNum !== null && Number.isFinite(maxMagNum)) {
        if (record.magnitude === null || record.magnitude > maxMagNum) {
          filterReason = 'Above maximum magnitude filter';
        }
      }
    }

    if (!filterReason) {
      if (filters.provenanceFilter === 'validated-only' && fm.provenanceKind !== 'Validated') {
        filterReason = `Provenance "${fm.provenanceKind}" excluded (Validated only)`;
      } else if (
        filters.provenanceFilter === 'imported-or-validated' &&
        fm.provenanceKind === 'Experimental'
      ) {
        filterReason = 'Experimental mechanism excluded by provenance filter';
      } else if (
        filters.provenanceFilter === 'exclude-experimental' &&
        fm.provenanceKind === 'Experimental'
      ) {
        filterReason = 'Experimental mechanism excluded';
      }
    }

    if (!filterReason && filters.qualityGrades.length > 0) {
      if (!filters.qualityGrades.includes(fm.quality)) {
        filterReason = `Quality grade ${fm.quality} deselected`;
      }
    }

    if (!filterReason && filters.dataSources.length > 0) {
      if (!filters.dataSources.includes(record.dataSource)) {
        filterReason = `Source "${record.dataSource}" filtered out`;
      }
    }

    if (filterReason !== null) {
      continue;
    }

    // Nodal-plane geometry validation
    const validPlane = isValidNodalPlane(fm.plane1);
    const p1: NodalPlane = validPlane
      ? {
          strike: Math.round(normalizeAngle360(fm.plane1.strike)) % 360,
          dip: Math.round(fm.plane1.dip),
          rake: Math.round(normalizeRake(fm.plane1.rake)),
        }
      : { strike: 0, dip: 45, rake: 0 };

    const { n: n1, s: s1 } = planeToVectors(p1.strike, p1.dip, p1.rake);
    // Auxiliary plane: fault normal is s1, slip vector is n1 (both directions equally represent double-couple)
    const p2: NodalPlane = isValidNodalPlane(fm.plane2)
      ? {
          strike: Math.round(normalizeAngle360(fm.plane2.strike)) % 360,
          dip: Math.round(fm.plane2.dip),
          rake: Math.round(normalizeRake(fm.plane2.rake)),
        }
      : p1;
    const n2 = normalizeVec(s1);
    const s2 = normalizeVec(n1);

    const eligible = validPlane && Number.isFinite(record.lat) && Number.isFinite(record.lon);
    const manuallyExcluded = manualExcludedIds.has(record.id);

    candidates.push({
      record,
      mechanism: fm,
      plane1: p1,
      plane2: p2,
      n1,
      s1,
      n2,
      s2,
      weight: STRESS_QUALITY_WEIGHTS[fm.quality] ?? 0.5,
      distanceKm: distKm,
      azimuthDeg: azDeg,
      eligible,
      included: eligible && !manuallyExcluded,
      exclusionReason: !eligible
        ? 'Invalid nodal-plane angles or coordinates'
        : manuallyExcluded
          ? 'Manually excluded by analyst'
          : null,
      duplicateOfId: null,
    });
  }

  // Sort deterministically by quality & provenance descending, then originTime desc
  // so duplicate resolution keeps the highest-quality, best-validated solution.
  const rankedOrder = [...candidates].sort((a, b) => {
    const pDiff = provenanceRank(b.mechanism.provenanceKind) - provenanceRank(a.mechanism.provenanceKind);
    if (pDiff !== 0) return pDiff;
    const qDiff = qualityRank(b.mechanism.quality) - qualityRank(a.mechanism.quality);
    if (qDiff !== 0) return qDiff;
    return b.record.originTimeMs - a.record.originTimeMs;
  });

  let duplicateCollapsedCount = 0;
  const keptForDedup: PreparedStressMechanism[] = [];

  for (const item of rankedOrder) {
    if (!item.included) continue;

    // Cross-source or repeated earthquake check: <= 15 km, <= 120 s, |dM| <= 0.6
    const dupMatch = keptForDedup.find((kept) => {
      const dtSec = Math.abs(item.record.originTimeMs - kept.record.originTimeMs) / 1000;
      if (dtSec > 120) return false;
      const dKm = geodesicDistanceKm(item.record.lat, item.record.lon, kept.record.lat, kept.record.lon);
      if (!Number.isFinite(dKm) || dKm > 15) return false;
      if (item.record.magnitude !== null && kept.record.magnitude !== null) {
        if (Math.abs(item.record.magnitude - kept.record.magnitude) > 0.6) return false;
      }
      return true;
    });

    if (dupMatch) {
      item.duplicateOfId = dupMatch.record.eventId;
      if (filters.autoDeduplicateCrossSource) {
        item.included = false;
        item.exclusionReason = `Duplicate earthquake of ${dupMatch.record.dataSource}:${dupMatch.record.eventId} (collapsed to keep 1 independent mechanism)`;
        duplicateCollapsedCount++;
        continue;
      }
    }

    keptForDedup.push(item);
  }

  // Restore time-descending display order
  candidates.sort((a, b) => b.record.originTimeMs - a.record.originTimeMs);

  const includedItems = candidates.filter((c) => c.included);
  const excludedItems = candidates.filter((c) => !c.included);

  const provenanceCounts: Record<MechanismProvenanceKind, number> = {
    Validated: 0,
    Imported: 0,
    Experimental: 0,
  };
  const qualityCounts: Record<MechanismQualityGrade, number> = {
    A: 0,
    B: 0,
    C: 0,
    D: 0,
    Unknown: 0,
  };
  const srcMap = new Map<string, number>();
  const depths: number[] = [];

  for (const item of includedItems) {
    provenanceCounts[item.mechanism.provenanceKind]++;
    qualityCounts[item.mechanism.quality]++;
    srcMap.set(item.record.dataSource, (srcMap.get(item.record.dataSource) ?? 0) + 1);
    if (item.record.depthKm !== null) depths.push(item.record.depthKm);
  }

  let centroidLat: number | null = null;
  let centroidLon: number | null = null;
  let spatialSpanKm = 0;

  if (includedItems.length > 0) {
    centroidLat = Number(
      (includedItems.reduce((s, x) => s + x.record.lat, 0) / includedItems.length).toFixed(4)
    );
    centroidLon = Number(
      (includedItems.reduce((s, x) => s + x.record.lon, 0) / includedItems.length).toFixed(4)
    );
    for (let i = 0; i < includedItems.length; i++) {
      for (let j = i + 1; j < includedItems.length; j++) {
        const d = geodesicDistanceKm(
          includedItems[i].record.lat,
          includedItems[i].record.lon,
          includedItems[j].record.lat,
          includedItems[j].record.lon
        );
        if (Number.isFinite(d) && d > spatialSpanKm) spatialSpanKm = d;
      }
    }
  }

  // Pairwise Kagan diversity among included mechanisms
  let kaganSum = 0;
  let kaganCount = 0;
  let maxKagan = 0;
  for (let i = 0; i < includedItems.length; i++) {
    for (let j = i + 1; j < includedItems.length; j++) {
      const k = computeKaganAngleDeg(includedItems[i].plane1, includedItems[j].plane1);
      kaganSum += k;
      kaganCount++;
      if (k > maxKagan) maxKagan = k;
    }
  }
  const meanKaganDiversityDeg = kaganCount > 0 ? Number((kaganSum / kaganCount).toFixed(1)) : 0;
  const maxKaganDiversityDeg = Number(maxKagan.toFixed(1));

  const depthMinKm = depths.length > 0 ? Math.min(...depths) : null;
  const depthMaxKm = depths.length > 0 ? Math.max(...depths) : null;

  const warnings: string[] = [];
  if (provenanceCounts.Experimental > 0) {
    warnings.push(
      `Includes ${provenanceCounts.Experimental} Experimental mechanism(s); review polarity constraints carefully.`
    );
  }
  if (!filters.autoDeduplicateCrossSource && candidates.some((c) => c.included && c.duplicateOfId)) {
    warnings.push(
      'Cross-source duplicate earthquakes are NOT collapsed and may over-weight the same rupture in the inversion.'
    );
  }
  if (spatialSpanKm > 250) {
    warnings.push(
      `Selected mechanisms span ${spatialSpanKm.toFixed(0)} km (> 250 km); regional stress uniformity across this aperture may be violated.`
    );
  }
  if (depthMinKm !== null && depthMaxKm !== null) {
    if (depthMinKm < 35 && depthMaxKm > 70) {
      warnings.push(
        `Depth span (${depthMinKm.toFixed(1)}–${depthMaxKm.toFixed(1)} km) mixes shallow crustal (<35 km) and sub-crustal/slab (>70 km) events.`
      );
    } else if (depthMaxKm - depthMinKm > 60) {
      warnings.push(
        `Wide depth range (${(depthMaxKm - depthMinKm).toFixed(1)} km) may combine distinct depth stress regimes.`
      );
    }
  }
  const uncertainCount = includedItems.filter((i) => i.record.locationUncertain).length;
  if (uncertainCount > 0) {
    warnings.push(
      `${uncertainCount} included event(s) carry preliminary or uncertain hypocenter flags.`
    );
  }

  return {
    items: candidates,
    includedItems,
    excludedItems,
    summary: {
      totalCatalogRecords: catalog.length,
      recordsWithMechanism: withMechs.length,
      filterMatchedCount: candidates.length,
      eligibleCount: candidates.filter((c) => c.eligible).length,
      selectedCount: includedItems.length,
      excludedCount: excludedItems.length,
      duplicateCollapsedCount,
      independentCount: keptForDedup.length,
      provenanceCounts,
      qualityCounts,
      sourceCounts: Array.from(srcMap.entries())
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count),
      centroidLat,
      centroidLon,
      spatialSpanKm: Number(spatialSpanKm.toFixed(1)),
      depthMinKm,
      depthMaxKm,
      meanKaganDiversityDeg,
      maxKaganDiversityDeg,
      warnings,
      centerLat,
      centerLon,
      effectiveRadiusKm,
    },
  };
}

/**
 * Deterministic 32-bit PRNG (Mulberry32) so bootstrap intervals and multi-start
 * seeds are strictly reproducible for identical inputs.
 */
function createSeededRng(seedInt: number): () => number {
  let state = seedInt >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString32(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Symmetric Jacobi eigensolver for real N x N symmetric matrices.
 * Returns eigenvalues sorted descending and corresponding orthonormal eigenvectors (columns).
 */
export function jacobiEigenSymmetric(matrixIn: number[][]): {
  values: number[];
  vectors: number[][];
} {
  const n = matrixIn.length;
  const A = matrixIn.map((row) => [...row]);
  const V: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (__, j) => (i === j ? 1 : 0))
  );

  const maxSweeps = 60 * n * n;
  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let maxOff = 0;
    let p = 0;
    let q = 1;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const val = Math.abs(A[i][j]);
        if (val > maxOff) {
          maxOff = val;
          p = i;
          q = j;
        }
      }
    }
    if (maxOff < 1e-13) break;

    const app = A[p][p];
    const aqq = A[q][q];
    const apq = A[p][q];
    const tau = (aqq - app) / (2 * apq);
    const t =
      tau >= 0
        ? 1 / (tau + Math.sqrt(1 + tau * tau))
        : -1 / (-tau + Math.sqrt(1 + tau * tau));
    const c = 1 / Math.sqrt(1 + t * t);
    const s = t * c;

    A[p][p] = app - t * apq;
    A[q][q] = aqq + t * apq;
    A[p][q] = 0;
    A[q][p] = 0;

    for (let k = 0; k < n; k++) {
      if (k === p || k === q) continue;
      const akp = A[k][p];
      const akq = A[k][q];
      A[k][p] = c * akp - s * akq;
      A[p][k] = A[k][p];
      A[k][q] = s * akp + c * akq;
      A[q][k] = A[k][q];
    }

    for (let k = 0; k < n; k++) {
      const vkp = V[k][p];
      const vkq = V[k][q];
      V[k][p] = c * vkp - s * vkq;
      V[k][q] = s * vkp + c * vkq;
    }
  }

  const pairs = Array.from({ length: n }, (_, i) => ({
    val: A[i][i],
    vec: V.map((row) => row[i]),
  })).sort((a, b) => b.val - a.val);

  return {
    values: pairs.map((p) => p.val),
    vectors: pairs.map((p) => p.vec),
  };
}

/**
 * Resolves the predicted unit shear traction vector tau(n) on fault plane with unit normal n
 * under compression-positive deviatoric stress tensor sigma (sigma1 >= sigma2 >= sigma3).
 *
 * Because n points from footwall into hanging wall in Aki & Richards (2002) NED convention
 * and slip s is hanging wall motion relative to footwall, compressive force across the fault
 * pushes the hanging wall along -[sigma*n - (n^T*sigma*n)*n].
 */
export function computePredictedShearTraction(
  sigma: StressTensorComponents,
  n: Vec3
): { vec: Vec3; magnitude: number } {
  const sn = {
    n: sigma.sigmaNN * n.n + sigma.sigmaNE * n.e + sigma.sigmaND * n.d,
    e: sigma.sigmaNE * n.n + sigma.sigmaEE * n.e + sigma.sigmaED * n.d,
    d: sigma.sigmaND * n.n + sigma.sigmaED * n.e + sigma.sigmaDD * n.d,
  };
  const sigmaNormal = n.n * sn.n + n.e * sn.e + n.d * sn.d;
  const tauRaw: Vec3 = {
    n: -(sn.n - sigmaNormal * n.n),
    e: -(sn.e - sigmaNormal * n.e),
    d: -(sn.d - sigmaNormal * n.d),
  };
  const mag = Math.hypot(tauRaw.n, tauRaw.e, tauRaw.d);
  if (mag < 1e-12) {
    return { vec: { n: 0, e: 0, d: 0 }, magnitude: 0 };
  }
  return {
    vec: { n: tauRaw.n / mag, e: tauRaw.e / mag, d: tauRaw.d / mag },
    magnitude: mag,
  };
}

export function computeSlipMisfitDeg(
  sigma: StressTensorComponents,
  n: Vec3,
  s: Vec3
): number {
  const tau = computePredictedShearTraction(sigma, n);
  if (tau.magnitude < 1e-10) return 90;
  const cosAngle = Math.max(-1, Math.min(1, dotVec(tau.vec, s)));
  return Math.acos(cosAngle) * RAD2DEG;
}

/**
 * Builds the 3x5 Michael (1984) design matrix G_k for fault normal n = (n1, n2, n3)
 * in compression-positive NED coordinates such that G_k * m = s_k, where
 * m = [sigmaNN, sigmaNE, sigmaND, sigmaEE, sigmaED]^T and sigmaDD = -(sigmaNN + sigmaEE).
 */
function buildMichaelRowBlock(n: Vec3): number[][] {
  const n1 = n.n;
  const n2 = n.e;
  const n3 = n.d;
  const n1sqMinusN3sq = n1 * n1 - n3 * n3;
  const n2sqMinusN3sq = n2 * n2 - n3 * n3;

  // tau = -[sigma*n - (n^T*sigma*n)*n]
  return [
    [
      -n1 + n1 * n1sqMinusN3sq,
      -n2 + 2 * n1 * n1 * n2,
      -n3 + 2 * n1 * n1 * n3,
      n1 * n2sqMinusN3sq,
      2 * n1 * n2 * n3,
    ],
    [
      n2 * n1sqMinusN3sq,
      -n1 + 2 * n1 * n2 * n2,
      2 * n1 * n2 * n3,
      -n2 + n2 * n2sqMinusN3sq,
      -n3 + 2 * n2 * n2 * n3,
    ],
    [
      n3 + n3 * n1sqMinusN3sq,
      2 * n1 * n2 * n3,
      -n1 + 2 * n1 * n3 * n3,
      n3 + n3 * n2sqMinusN3sq,
      -n2 + 2 * n2 * n3 * n3,
    ],
  ];
}

function mVecToTensor(m: number[]): StressTensorComponents {
  const sigmaNN = m[0];
  const sigmaNE = m[1];
  const sigmaND = m[2];
  const sigmaEE = m[3];
  const sigmaED = m[4];
  const sigmaDD = -(sigmaNN + sigmaEE);
  return { sigmaNN, sigmaNE, sigmaND, sigmaEE, sigmaED, sigmaDD };
}

function normalizeTensorByMaxShear(t: StressTensorComponents): {
  tensor: StressTensorComponents;
  eigenvalues: [number, number, number];
  axes: [PrincipalAxis, PrincipalAxis, PrincipalAxis];
  stressRatioR: number;
  bishopPhi: number;
} | null {
  const mat = [
    [t.sigmaNN, t.sigmaNE, t.sigmaND],
    [t.sigmaNE, t.sigmaEE, t.sigmaED],
    [t.sigmaND, t.sigmaED, t.sigmaDD],
  ];
  const eig = jacobiEigenSymmetric(mat);
  const s1 = eig.values[0];
  const s2 = eig.values[1];
  const s3 = eig.values[2];
  const span = s1 - s3;
  if (!Number.isFinite(span) || span < 1e-8) {
    return null;
  }

  const invSpan = 1 / span;
  const normTensor: StressTensorComponents = {
    sigmaNN: t.sigmaNN * invSpan,
    sigmaNE: t.sigmaNE * invSpan,
    sigmaND: t.sigmaND * invSpan,
    sigmaEE: t.sigmaEE * invSpan,
    sigmaED: t.sigmaED * invSpan,
    sigmaDD: t.sigmaDD * invSpan,
  };

  const e1 = vecToTrendPlunge({
    n: eig.vectors[0][0],
    e: eig.vectors[0][1],
    d: eig.vectors[0][2],
  });
  const e2 = vecToTrendPlunge({
    n: eig.vectors[1][0],
    e: eig.vectors[1][1],
    d: eig.vectors[1][2],
  });
  const e3 = vecToTrendPlunge({
    n: eig.vectors[2][0],
    e: eig.vectors[2][1],
    d: eig.vectors[2][2],
  });

  const R = Math.max(0, Math.min(1, (s1 - s2) * invSpan));
  const phi = Math.max(0, Math.min(1, (s2 - s3) * invSpan));

  return {
    tensor: normTensor,
    eigenvalues: [s1 * invSpan, s2 * invSpan, s3 * invSpan],
    axes: [e1, e2, e3],
    stressRatioR: R,
    bishopPhi: phi,
  };
}

/**
 * Solves weighted Michael (1984) linear stress tensor equations for a fixed plane choice
 * per mechanism, returning condition number and rank diagnostics from the 5x5 normal matrix.
 */
function solveMichaelLinearSystem(
  samples: Array<{ n: Vec3; s: Vec3; weight: number }>
): {
  tensor: StressTensorComponents;
  conditionNumber: number;
  rankRatio: number;
} | null {
  const N = Array.from({ length: 5 }, () => new Array<number>(5).fill(0));
  const b = new Array<number>(5).fill(0);

  for (const item of samples) {
    const G = buildMichaelRowBlock(item.n);
    const sArr = [item.s.n, item.s.e, item.s.d];
    const w = item.weight;
    for (let r = 0; r < 3; r++) {
      const row = G[r];
      const sr = sArr[r];
      for (let i = 0; i < 5; i++) {
        b[i] += w * row[i] * sr;
        for (let j = i; j < 5; j++) {
          N[i][j] += w * row[i] * row[j];
        }
      }
    }
  }
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < i; j++) {
      N[i][j] = N[j][i];
    }
  }

  const eig = jacobiEigenSymmetric(N);
  const lMax = eig.values[0];
  const lMin = eig.values[4];
  if (!Number.isFinite(lMax) || lMax < 1e-10) {
    return null;
  }
  const rankRatio = lMin / lMax;
  const conditionNumber = lMin > 1e-15 ? Math.sqrt(lMax / lMin) : Infinity;

  if (!Number.isFinite(conditionNumber) || rankRatio < 1e-6 || conditionNumber > 1000) {
    return null;
  }

  const m = new Array<number>(5).fill(0);
  for (let k = 0; k < 5; k++) {
    const lam = eig.values[k];
    const v = eig.vectors[k];
    let vDotB = 0;
    for (let i = 0; i < 5; i++) vDotB += v[i] * b[i];
    const coeff = vDotB / lam;
    for (let i = 0; i < 5; i++) m[i] += coeff * v[i];
  }

  return {
    tensor: mVecToTensor(m),
    conditionNumber,
    rankRatio,
  };
}

/**
 * Computes an unbiased symmetric seed tensor directly from P/T moment-tensor proxies
 * M_k = -(n_k s_k^T + s_k n_k^T), which is invariant to swapping Plane 1 and Plane 2.
 */
function computeUnbiasedSymmetricSeedTensor(
  items: PreparedStressMechanism[],
  useWeights: boolean
): StressTensorComponents {
  let sigmaNN = 0;
  let sigmaNE = 0;
  let sigmaND = 0;
  let sigmaEE = 0;
  let sigmaED = 0;
  let sigmaDD = 0;

  for (const it of items) {
    const w = useWeights ? it.weight : 1;
    // -(n s^T + s n^T) is traceless (since n . s = 0) and invariant to swapping n <-> s
    sigmaNN += -w * 2 * it.n1.n * it.s1.n;
    sigmaNE += -w * (it.n1.n * it.s1.e + it.n1.e * it.s1.n);
    sigmaND += -w * (it.n1.n * it.s1.d + it.n1.d * it.s1.n);
    sigmaEE += -w * 2 * it.n1.e * it.s1.e;
    sigmaED += -w * (it.n1.e * it.s1.d + it.n1.d * it.s1.e);
    sigmaDD += -w * 2 * it.n1.d * it.s1.d;
  }

  return { sigmaNN, sigmaNE, sigmaND, sigmaEE, sigmaED, sigmaDD };
}

/**
 * Exact horizontal maximum stress azimuth (SHmax, 0..180 deg clockwise from North)
 * from Lund & Townend (2007) horizontal stress projection of deviatoric tensor.
 */
export function computeLundTownendShMax(tensor: StressTensorComponents): {
  shMaxDeg: number | null;
  defined: boolean;
  anisotropy: number;
  note: string;
} {
  const dx = tensor.sigmaNN - tensor.sigmaEE;
  const dy = 2 * tensor.sigmaNE;
  const anisotropy = Math.hypot(dx, dy);
  if (!Number.isFinite(anisotropy) || anisotropy < 0.04) {
    return {
      shMaxDeg: null,
      defined: false,
      anisotropy: Number((anisotropy || 0).toFixed(3)),
      note: 'Horizontally near-isotropic stress state (σNN ≈ σEE and σNE ≈ 0); SHmax azimuth is poorly defined.',
    };
  }
  let az = 0.5 * Math.atan2(dy, dx) * RAD2DEG;
  az = ((az % 180) + 180) % 180;
  return {
    shMaxDeg: Number(az.toFixed(1)),
    defined: true,
    anisotropy: Number(anisotropy.toFixed(3)),
    note: 'Lund & Townend (2007) exact horizontal projection of the 3D deviatoric stress tensor.',
  };
}

/**
 * Deterministic stress regime classification following Zoback (1992) World Stress Map
 * plunge criteria and Simpson (1997) faulting regime parameter A_phi in [0, 3].
 */
export function classifyStressRegime(
  sigma1: PrincipalAxis,
  sigma2: PrincipalAxis,
  sigma3: PrincipalAxis,
  bishopPhi: number,
  simpsonCI95: [number, number]
): StressRegimeAssessment {
  const p1 = sigma1.plunge;
  const p2 = sigma2.plunge;
  const p3 = sigma3.plunge;

  let regimeClass: StressRegimeClass = 'Transitional / Oblique';
  let zobackCode: StressRegimeAssessment['zobackCode'] = 'OBL';
  let ruleExplanation = '';

  if (p1 >= 52 && p3 <= 35) {
    regimeClass = 'Normal';
    zobackCode = 'NF';
    ruleExplanation = `Zoback (1992) NF: σ1 is steep (${p1}° ≥ 52°) and σ3 is subhorizontal (${p3}° ≤ 35°).`;
  } else if (p1 >= 40 && p1 < 52 && p3 <= 20) {
    regimeClass = 'Normal / Strike-Slip';
    zobackCode = 'NS';
    ruleExplanation = `Zoback (1992) NS transitional: σ1 plunge is ${p1}° (40°–51°) with subhorizontal σ3 (${p3}° ≤ 20°).`;
  } else if (p3 >= 52 && p1 <= 35) {
    regimeClass = 'Reverse / Thrust';
    zobackCode = 'TF';
    ruleExplanation = `Zoback (1992) TF: σ3 is steep (${p3}° ≥ 52°) and σ1 is subhorizontal (${p1}° ≤ 35°).`;
  } else if (p3 >= 40 && p3 < 52 && p1 <= 20) {
    regimeClass = 'Reverse / Strike-Slip';
    zobackCode = 'TS';
    ruleExplanation = `Zoback (1992) TS transitional: σ3 plunge is ${p3}° (40°–51°) with subhorizontal σ1 (${p1}° ≤ 20°).`;
  } else if (p2 >= 45 && p1 <= 40 && p3 <= 40) {
    regimeClass = 'Strike-Slip';
    zobackCode = 'SS';
    ruleExplanation = `Zoback (1992) SS: σ2 is steep (${p2}° ≥ 45°) while σ1 (${p1}°) and σ3 (${p3}°) are subhorizontal (≤ 40°).`;
  } else {
    regimeClass = 'Transitional / Oblique';
    zobackCode = 'OBL';
    ruleExplanation = `Oblique / non-Andersonian triaxial orientations (plunges σ1=${p1}°, σ2=${p2}°, σ3=${p3}°) outside standard Zoback (1992) bins.`;
  }

  // Simpson (1997) A_phi using steepest principal stress axis index n_v
  let aPhi = 1.5;
  if (p1 >= p2 && p1 >= p3) {
    // Normal regime (sigma1 steepest)
    aPhi = 1 - bishopPhi;
  } else if (p2 >= p1 && p2 >= p3) {
    // Strike-slip regime (sigma2 steepest)
    aPhi = 1 + bishopPhi;
  } else {
    // Thrust/Reverse regime (sigma3 steepest)
    aPhi = 2 + (1 - bishopPhi);
  }

  return {
    regimeClass,
    zobackCode,
    simpsonAPhi: Number(aPhi.toFixed(2)),
    simpsonAPhiCI95: simpsonCI95,
    ruleExplanation,
    pVsSigmaNote:
      'Individual earthquake P/T axes bisect focal nodal planes at 45° and reflect fault geometry, whereas σ1/σ3 represent the regional stress tensor driving slip across differently oriented faults (McKenzie 1969).',
  };
}

function computeSimpsonAPhiRaw(
  p1: number,
  p2: number,
  p3: number,
  bishopPhi: number
): number {
  if (p1 >= p2 && p1 >= p3) return 1 - bishopPhi;
  if (p2 >= p1 && p2 >= p3) return 1 + bishopPhi;
  return 2 + (1 - bishopPhi);
}

function percentileSorted(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

export function buildStressInputFingerprint(
  items: PreparedStressMechanism[],
  config: StressInversionConfig
): string {
  const mechPart = items
    .map(
      (it) =>
        `${it.record.id}:${it.record.dataSource}:${it.record.originTimeMs}:${it.plane1.strike}/${it.plane1.dip}/${it.plane1.rake}:${it.mechanism.quality}:${it.mechanism.provenanceKind}`
    )
    .join('|');
  return `${config.mode}:${config.bootstrapIterations}:${config.useQualityWeights ? 1 : 0}:${config.isReferenceBenchmarkRun ? 1 : 0}::${mechPart}`;
}

/**
 * Runs Michael (1984, 1987) regional deviatoric stress tensor inversion with
 * nodal-plane ambiguity handling, degeneracy detection, and bootstrap uncertainty estimation.
 */
export function runRegionalStressInversion(
  preparation: StressDataPreparationResult,
  config: StressInversionConfig = DEFAULT_STRESS_INVERSION_CONFIG
): RegionalStressInversionResult {
  const included = preparation.includedItems;
  const summary = preparation.summary;
  const fingerprint = buildStressInputFingerprint(included, config);
  const computedAtUtc = new Date().toISOString();

  const baseLimitations = [
    'Michael (1984/1987) linear inversion assumes spatially uniform stress within the selected region and uniform shear stress magnitude (|τ| ≈ 1) on slipping faults.',
    'Focal mechanisms constrain only the 4 degrees of freedom of the reduced deviatoric stress tensor (σ1, σ2, σ3 orientations and shape ratio R); absolute stress magnitudes and isotropic pressure cannot be determined.',
    'Nodal-plane ambiguity is preserved; choosing between nodal plane 1 and 2 based solely on slip misfit does not prove which plane ruptured in the Earth without external geological data.',
  ];

  const makeInsufficient = (
    reasons: string[],
    condNum: number | null = null,
    rankRatio: number | null = null
  ): RegionalStressInversionResult => ({
    status: 'Insufficient Data',
    insufficientReasons: reasons,
    ambiguityReasons: [],
    warnings: summary.warnings,
    methodologyLabel:
      config.mode === 'iterative-unbiased'
        ? 'Michael (1984/1987) Linear Deviatoric Inversion (Unbiased Iterative Plane Selection + Random-Plane Bootstrap)'
        : 'Michael (1987) Random-Plane Linear Stress Inversion & Bootstrap',
    conventionNote: 'Aki & Richards (2002) NED · Compression-positive (σ1 ≥ σ2 ≥ σ3)',
    inputFingerprint: fingerprint,
    computedAtUtc,
    config,
    datasetSummary: summary,
    tensor: null,
    sigma1: null,
    sigma2: null,
    sigma3: null,
    stressRatioR: null,
    stressRatioRCI95: null,
    bishopPhi: null,
    bishopPhiCI95: null,
    shMaxAzimuthDeg: null,
    shMaxUncertainty95Deg: null,
    shMaxDefined: false,
    shMaxNote: '',
    regime: null,
    meanMisfitDeg: null,
    medianMisfitDeg: null,
    rmsMisfitDeg: null,
    maxMisfitDeg: null,
    wellFittedPct: null,
    ambiguousPlaneFraction: null,
    conditionNumber: condNum,
    rankRatio,
    mechanismFits: [],
    bootstrapSamples: { sigma1: [], sigma2: [], sigma3: [] },
    limitations: baseLimitations,
    referenceValidationNote: config.isReferenceBenchmarkRun
      ? 'Synthetic reference benchmark validation run.'
      : 'Not verified against independent field stress ground truth (borehole breakouts / overcoring).',
  });

  const insufficientReasons: string[] = [];
  if (summary.independentCount < MIN_INDEPENDENT_MECHANISMS) {
    insufficientReasons.push(
      `Only ${summary.independentCount} independent focal mechanism(s) selected; minimum ${MIN_INDEPENDENT_MECHANISMS} required to constrain the deviatoric stress tensor reliably.`
    );
  }
  if (included.length >= 2 && summary.maxKaganDiversityDeg < 12) {
    insufficientReasons.push(
      `Focal mechanism orientations are nearly identical (max Kagan spread ${summary.maxKaganDiversityDeg}° < 12°); a stress tensor cannot be uniquely constrained from identical slip planes.`
    );
  }

  if (insufficientReasons.length > 0) {
    return makeInsufficient(insufficientReasons);
  }

  const rng = createSeededRng(hashString32(fingerprint) || 1337);
  const useWeights = config.useQualityWeights;

  // Helper to solve iterative plane refinement from an initial tensor
  const runIterativeFromTensor = (
    seedTensor: StressTensorComponents
  ): {
    tensor: StressTensorComponents;
    conditionNumber: number;
    rankRatio: number;
    meanMisfit: number;
    choices: Array<1 | 2>;
  } | null => {
    let curr = seedTensor;
    let prevKey = '';
    let finalSol: { tensor: StressTensorComponents; conditionNumber: number; rankRatio: number } | null =
      null;
    let finalChoices: Array<1 | 2> = included.map(() => 1);

    for (let iter = 0; iter < 16; iter++) {
      const choices: Array<1 | 2> = [];
      const samples: Array<{ n: Vec3; s: Vec3; weight: number }> = [];

      for (const it of included) {
        const m1 = computeSlipMisfitDeg(curr, it.n1, it.s1);
        const m2 = computeSlipMisfitDeg(curr, it.n2, it.s2);
        const pickPlane: 1 | 2 = m1 <= m2 ? 1 : 2;
        choices.push(pickPlane);
        samples.push({
          n: pickPlane === 1 ? it.n1 : it.n2,
          s: pickPlane === 1 ? it.s1 : it.s2,
          weight: useWeights ? it.weight : 1,
        });
      }

      const key = choices.join('');
      const solved = solveMichaelLinearSystem(samples);
      if (!solved) return null;

      finalSol = solved;
      finalChoices = choices;
      curr = solved.tensor;
      if (key === prevKey) break;
      prevKey = key;
    }

    if (!finalSol) return null;
    let mSum = 0;
    let wSum = 0;
    for (let i = 0; i < included.length; i++) {
      const it = included[i];
      const w = useWeights ? it.weight : 1;
      const misfit =
        finalChoices[i] === 1
          ? computeSlipMisfitDeg(finalSol.tensor, it.n1, it.s1)
          : computeSlipMisfitDeg(finalSol.tensor, it.n2, it.s2);
      mSum += w * misfit;
      wSum += w;
    }

    return {
      tensor: finalSol.tensor,
      conditionNumber: finalSol.conditionNumber,
      rankRatio: finalSol.rankRatio,
      meanMisfit: wSum > 0 ? mSum / wSum : 90,
      choices: finalChoices,
    };
  };

  let bestRawTensor: StressTensorComponents | null = null;
  let bestCondNumber = Infinity;
  let bestRankRatio = 0;

  if (config.mode === 'iterative-unbiased') {
    // 1. Nodal-plane invariant P/T seed
    const symSeed = computeUnbiasedSymmetricSeedTensor(included, useWeights);
    const candidates: Array<{
      tensor: StressTensorComponents;
      conditionNumber: number;
      rankRatio: number;
      meanMisfit: number;
    }> = [];

    const symRes = runIterativeFromTensor(symSeed);
    if (symRes) candidates.push(symRes);

    // 2. Multi-start random nodal-plane seeds (unbiased against Plane 1)
    for (let trial = 0; trial < 12; trial++) {
      const samples = included.map((it) => {
        const pickTwo = rng() >= 0.5;
        return {
          n: pickTwo ? it.n2 : it.n1,
          s: pickTwo ? it.s2 : it.s1,
          weight: useWeights ? it.weight : 1,
        };
      });
      const initSol = solveMichaelLinearSystem(samples);
      if (!initSol) continue;
      const refined = runIterativeFromTensor(initSol.tensor);
      if (refined) candidates.push(refined);
    }

    if (candidates.length === 0) {
      return makeInsufficient([
        'Linear stress inversion matrix is singular or ill-conditioned (mechanisms lack independent fault-plane orientation diversity).',
      ]);
    }

    candidates.sort((a, b) => a.meanMisfit - b.meanMisfit);
    bestRawTensor = candidates[0].tensor;
    bestCondNumber = candidates[0].conditionNumber;
    bestRankRatio = candidates[0].rankRatio;
  } else {
    // Pure Michael (1987) random nodal-plane ensemble mean tensor
    let accNN = 0;
    let accNE = 0;
    let accND = 0;
    let accEE = 0;
    let accED = 0;
    let accDD = 0;
    let validDraws = 0;
    let condSum = 0;
    let rankSum = 0;

    for (let draw = 0; draw < 64; draw++) {
      const samples = included.map((it) => {
        const pickTwo = rng() >= 0.5;
        return {
          n: pickTwo ? it.n2 : it.n1,
          s: pickTwo ? it.s2 : it.s1,
          weight: useWeights ? it.weight : 1,
        };
      });
      const sol = solveMichaelLinearSystem(samples);
      if (!sol) continue;
      const norm = normalizeTensorByMaxShear(sol.tensor);
      if (!norm) continue;
      accNN += norm.tensor.sigmaNN;
      accNE += norm.tensor.sigmaNE;
      accND += norm.tensor.sigmaND;
      accEE += norm.tensor.sigmaEE;
      accED += norm.tensor.sigmaED;
      accDD += norm.tensor.sigmaDD;
      condSum += sol.conditionNumber;
      rankSum += sol.rankRatio;
      validDraws++;
    }

    if (validDraws === 0) {
      return makeInsufficient([
        'Random nodal-plane ensemble failed due to rank deficiency or insufficient mechanism diversity.',
      ]);
    }

    bestRawTensor = {
      sigmaNN: accNN / validDraws,
      sigmaNE: accNE / validDraws,
      sigmaND: accND / validDraws,
      sigmaEE: accEE / validDraws,
      sigmaED: accED / validDraws,
      sigmaDD: accDD / validDraws,
    };
    bestCondNumber = condSum / validDraws;
    bestRankRatio = rankSum / validDraws;
  }

  const normalized = bestRawTensor ? normalizeTensorByMaxShear(bestRawTensor) : null;
  if (!normalized) {
    return makeInsufficient(
      ['Inverted deviatoric stress tensor collapsed to near-zero shear norm.'],
      Number(bestCondNumber.toFixed(1)),
      Number(bestRankRatio.toExponential(2))
    );
  }

  const { tensor, eigenvalues, axes, stressRatioR, bishopPhi } = normalized;

  // Per-mechanism misfit & nodal-plane ambiguity audit
  const mechanismFits: MechanismInversionFit[] = included.map((it) => {
    const m1 = computeSlipMisfitDeg(tensor, it.n1, it.s1);
    const m2 = computeSlipMisfitDeg(tensor, it.n2, it.s2);
    const preferredPlane: 1 | 2 = m1 <= m2 ? 1 : 2;
    const selectedMisfitDeg = Math.min(m1, m2);
    const planeAmbiguous = Math.abs(m1 - m2) < 10 || (m1 > 35 && m2 > 35);
    return {
      recordId: it.record.id,
      eventId: it.record.eventId,
      dataSource: it.record.dataSource,
      provenanceKind: it.mechanism.provenanceKind,
      quality: it.mechanism.quality,
      weight: useWeights ? it.weight : 1,
      misfitPlane1Deg: Number(m1.toFixed(1)),
      misfitPlane2Deg: Number(m2.toFixed(1)),
      preferredPlane,
      selectedMisfitDeg: Number(selectedMisfitDeg.toFixed(1)),
      planeAmbiguous,
    };
  });

  const misfitVals = mechanismFits.map((m) => m.selectedMisfitDeg);
  const sortedMisfits = [...misfitVals].sort((a, b) => a - b);
  const meanMisfitDeg = Number(
    (misfitVals.reduce((a, b) => a + b, 0) / misfitVals.length).toFixed(1)
  );
  const medianMisfitDeg = Number(percentileSorted(sortedMisfits, 0.5).toFixed(1));
  const rmsMisfitDeg = Number(
    Math.sqrt(misfitVals.reduce((a, b) => a + b * b, 0) / misfitVals.length).toFixed(1)
  );
  const maxMisfitDeg = Number(Math.max(...misfitVals).toFixed(1));
  const wellFittedPct = Math.round(
    (misfitVals.filter((v) => v <= 30).length / misfitVals.length) * 100
  );
  const ambiguousPlaneFraction = Number(
    (mechanismFits.filter((m) => m.planeAmbiguous).length / mechanismFits.length).toFixed(2)
  );

  // Michael (1987) Bootstrap Resampling WITH Random Nodal-Plane Flipping (p=0.5)
  const bootCount = Math.max(50, Math.min(500, Math.round(config.bootstrapIterations)));
  const bootAngles1: number[] = [];
  const bootAngles2: number[] = [];
  const bootAngles3: number[] = [];
  const bootR: number[] = [];
  const bootPhi: number[] = [];
  const bootAPhi: number[] = [];
  const bootShMaxDiffs: number[] = [];
  const bootSamples1: BootstrapAxisSample[] = [];
  const bootSamples2: BootstrapAxisSample[] = [];
  const bootSamples3: BootstrapAxisSample[] = [];

  const mainShMax = computeLundTownendShMax(tensor);

  for (let b = 0; b < bootCount; b++) {
    const resampleItems: PreparedStressMechanism[] = [];
    for (let i = 0; i < included.length; i++) {
      const idx = Math.floor(rng() * included.length);
      resampleItems.push(included[idx]);
    }

    // Initial random nodal-plane draw (p=0.5)
    const initSamples = resampleItems.map((it) => {
      const flipToTwo = rng() >= 0.5;
      return {
        n: flipToTwo ? it.n2 : it.n1,
        s: flipToTwo ? it.s2 : it.s1,
        weight: useWeights ? it.weight : 1,
      };
    });

    let sol = solveMichaelLinearSystem(initSamples);
    if (!sol) continue;

    // In iterative-unbiased mode, refine from the random nodal-plane start (up to 6 iters)
    // so genuine nodal-plane ambiguity is preserved while eliminating 50%-wrong-plane distortion.
    if (config.mode === 'iterative-unbiased') {
      let currTensor = sol.tensor;
      let prevKey = '';
      for (let itIdx = 0; itIdx < 6; itIdx++) {
        const choices: string[] = [];
        const refinedSamples = resampleItems.map((it) => {
          const m1 = computeSlipMisfitDeg(currTensor, it.n1, it.s1);
          const m2 = computeSlipMisfitDeg(currTensor, it.n2, it.s2);
          // When planes are nearly indistinguishable (< 8 deg diff), retain random choice
          const pickTwo =
            Math.abs(m1 - m2) < 8 ? rng() >= 0.5 : m2 < m1;
          choices.push(pickTwo ? '2' : '1');
          return {
            n: pickTwo ? it.n2 : it.n1,
            s: pickTwo ? it.s2 : it.s1,
            weight: useWeights ? it.weight : 1,
          };
        });
        const key = choices.join('');
        const nextSol = solveMichaelLinearSystem(refinedSamples);
        if (!nextSol) break;
        sol = nextSol;
        currTensor = nextSol.tensor;
        if (key === prevKey) break;
        prevKey = key;
      }
    }

    const normB = normalizeTensorByMaxShear(sol.tensor);
    if (!normB) continue;

    const ang1 =
      Math.acos(Math.min(1, Math.abs(dotVec(axes[0].vec, normB.axes[0].vec)))) * RAD2DEG;
    const ang2 =
      Math.acos(Math.min(1, Math.abs(dotVec(axes[1].vec, normB.axes[1].vec)))) * RAD2DEG;
    const ang3 =
      Math.acos(Math.min(1, Math.abs(dotVec(axes[2].vec, normB.axes[2].vec)))) * RAD2DEG;

    bootAngles1.push(ang1);
    bootAngles2.push(ang2);
    bootAngles3.push(ang3);
    bootR.push(normB.stressRatioR);
    bootPhi.push(normB.bishopPhi);
    bootAPhi.push(
      computeSimpsonAPhiRaw(
        normB.axes[0].plunge,
        normB.axes[1].plunge,
        normB.axes[2].plunge,
        normB.bishopPhi
      )
    );

    bootSamples1.push({ trend: normB.axes[0].trend, plunge: normB.axes[0].plunge });
    bootSamples2.push({ trend: normB.axes[1].trend, plunge: normB.axes[1].plunge });
    bootSamples3.push({ trend: normB.axes[2].trend, plunge: normB.axes[2].plunge });

    if (mainShMax.defined && mainShMax.shMaxDeg !== null) {
      const bSh = computeLundTownendShMax(normB.tensor);
      if (bSh.defined && bSh.shMaxDeg !== null) {
        let diff = Math.abs(bSh.shMaxDeg - mainShMax.shMaxDeg) % 180;
        if (diff > 90) diff = 180 - diff;
        bootShMaxDiffs.push(diff);
      }
    }
  }

  bootAngles1.sort((a, b) => a - b);
  bootAngles2.sort((a, b) => a - b);
  bootAngles3.sort((a, b) => a - b);
  bootR.sort((a, b) => a - b);
  bootPhi.sort((a, b) => a - b);
  bootAPhi.sort((a, b) => a - b);
  bootShMaxDiffs.sort((a, b) => a - b);

  const u95_1 = Number(percentileSorted(bootAngles1, 0.95).toFixed(1));
  const u95_2 = Number(percentileSorted(bootAngles2, 0.95).toFixed(1));
  const u95_3 = Number(percentileSorted(bootAngles3, 0.95).toFixed(1));

  const sigma1Res: PrincipalStressAxisResult = {
    label: 'σ1',
    name: 'Maximum Compression (σ1)',
    trend: axes[0].trend,
    plunge: axes[0].plunge,
    vec: axes[0].vec,
    eigenvalueNormalized: Number(eigenvalues[0].toFixed(3)),
    uncertainty95Deg: u95_1,
    medianBootAngleDeg: Number(percentileSorted(bootAngles1, 0.5).toFixed(1)),
  };
  const sigma2Res: PrincipalStressAxisResult = {
    label: 'σ2',
    name: 'Intermediate Stress (σ2)',
    trend: axes[1].trend,
    plunge: axes[1].plunge,
    vec: axes[1].vec,
    eigenvalueNormalized: Number(eigenvalues[1].toFixed(3)),
    uncertainty95Deg: u95_2,
    medianBootAngleDeg: Number(percentileSorted(bootAngles2, 0.5).toFixed(1)),
  };
  const sigma3Res: PrincipalStressAxisResult = {
    label: 'σ3',
    name: 'Minimum Compression (σ3)',
    trend: axes[2].trend,
    plunge: axes[2].plunge,
    vec: axes[2].vec,
    eigenvalueNormalized: Number(eigenvalues[2].toFixed(3)),
    uncertainty95Deg: u95_3,
    medianBootAngleDeg: Number(percentileSorted(bootAngles3, 0.5).toFixed(1)),
  };

  const rCI: [number, number] =
    bootR.length > 0
      ? [
          Number(percentileSorted(bootR, 0.025).toFixed(2)),
          Number(percentileSorted(bootR, 0.975).toFixed(2)),
        ]
      : [Number(stressRatioR.toFixed(2)), Number(stressRatioR.toFixed(2))];

  const phiCI: [number, number] =
    bootPhi.length > 0
      ? [
          Number(percentileSorted(bootPhi, 0.025).toFixed(2)),
          Number(percentileSorted(bootPhi, 0.975).toFixed(2)),
        ]
      : [Number(bishopPhi.toFixed(2)), Number(bishopPhi.toFixed(2))];

  const aPhiCI: [number, number] =
    bootAPhi.length > 0
      ? [
          Number(percentileSorted(bootAPhi, 0.025).toFixed(2)),
          Number(percentileSorted(bootAPhi, 0.975).toFixed(2)),
        ]
      : [0, 3];

  const regime = classifyStressRegime(axes[0], axes[1], axes[2], bishopPhi, aPhiCI);
  const shMaxUncertainty95Deg =
    bootShMaxDiffs.length > 0
      ? Number(percentileSorted(bootShMaxDiffs, 0.95).toFixed(1))
      : null;

  // Ambiguity & status classification
  const ambiguityReasons: string[] = [];
  if (u95_1 > 35 || u95_3 > 35) {
    ambiguityReasons.push(
      `High bootstrap 95% orientation uncertainty (σ1 ±${u95_1}°, σ3 ±${u95_3}°).`
    );
  }
  if (meanMisfitDeg > 35) {
    ambiguityReasons.push(
      `High mean slip misfit (${meanMisfitDeg}° > 35°) indicates stress heterogeneity or noisy focal mechanisms.`
    );
  }
  if (stressRatioR < 0.08 || stressRatioR > 0.92) {
    ambiguityReasons.push(
      `Near-axial stress ellipsoid (R=${stressRatioR.toFixed(2)}): two principal axes approach degeneracy (${stressRatioR < 0.08 ? 'σ1 ≈ σ2' : 'σ2 ≈ σ3'}).`
    );
  }
  if (ambiguousPlaneFraction >= 0.65 && (u95_1 > 28 || u95_3 > 28)) {
    ambiguityReasons.push(
      `${Math.round(ambiguousPlaneFraction * 100)}% of mechanisms show < 10° misfit separation between nodal planes.`
    );
  }
  if (bestCondNumber > 15) {
    ambiguityReasons.push(
      `Elevated normal-matrix condition number (κ=${bestCondNumber.toFixed(1)}) indicates weak directional diversity.`
    );
  }

  let status: StressResultStatus = 'Experimental';
  if (ambiguityReasons.length > 0) {
    status = 'Ambiguous';
  } else if (config.isReferenceBenchmarkRun) {
    status = 'Validated';
  } else {
    status = 'Experimental';
  }

  const runtimeWarnings = [...summary.warnings];
  if (summary.independentCount < RECOMMENDED_MECHANISMS) {
    runtimeWarnings.push(
      `Sample size (${summary.independentCount}) is below recommended ≥ ${RECOMMENDED_MECHANISMS} diverse mechanisms; interpret uncertainties cautiously.`
    );
  }

  return {
    status,
    insufficientReasons: [],
    ambiguityReasons,
    warnings: runtimeWarnings,
    methodologyLabel:
      config.mode === 'iterative-unbiased'
        ? 'Michael (1984/1987) Linear Deviatoric Inversion (Unbiased Iterative Plane Selection + Random-Plane Bootstrap)'
        : 'Michael (1987) Random-Plane Linear Stress Inversion & Bootstrap',
    conventionNote: 'Aki & Richards (2002) NED · Compression-positive (σ1 ≥ σ2 ≥ σ3)',
    inputFingerprint: fingerprint,
    computedAtUtc,
    config,
    datasetSummary: summary,
    tensor,
    sigma1: sigma1Res,
    sigma2: sigma2Res,
    sigma3: sigma3Res,
    stressRatioR: Number(stressRatioR.toFixed(3)),
    stressRatioRCI95: rCI,
    bishopPhi: Number(bishopPhi.toFixed(3)),
    bishopPhiCI95: phiCI,
    shMaxAzimuthDeg: mainShMax.shMaxDeg,
    shMaxUncertainty95Deg,
    shMaxDefined: mainShMax.defined,
    shMaxNote: mainShMax.note,
    regime,
    meanMisfitDeg,
    medianMisfitDeg,
    rmsMisfitDeg,
    maxMisfitDeg,
    wellFittedPct,
    ambiguousPlaneFraction,
    conditionNumber: Number(bestCondNumber.toFixed(2)),
    rankRatio: Number(bestRankRatio.toExponential(2)),
    mechanismFits,
    bootstrapSamples: {
      sigma1: bootSamples1,
      sigma2: bootSamples2,
      sigma3: bootSamples3,
    },
    limitations: baseLimitations,
    referenceValidationNote: config.isReferenceBenchmarkRun
      ? 'Synthetic reference benchmark validation run.'
      : 'Field catalog inversion is Experimental until corroborated by independent geological, borehole, or geodetic stress indicators.',
  };
}

/**
 * Exports a complete, provenance-preserving Regional Stress Analysis JSON report.
 */
export function exportRegionalStressJson(
  result: RegionalStressInversionResult,
  activeEvent: EQPEvent,
  isStale: boolean
): string {
  const payload = {
    schema: 'eqp-modern.regional-stress-analysis.v1',
    exportedAtUtc: new Date().toISOString(),
    isStale,
    status: result.status,
    methodology: result.methodologyLabel,
    convention: result.conventionNote,
    referenceEvent: isEventUnlocated(activeEvent)
      ? null
      : {
          filename: activeEvent.filename,
          originDateGmt: activeEvent.originDateGmt,
          originTimeGmt: activeEvent.originTimeGmt,
          lat: activeEvent.lat,
          lon: activeEvent.lon,
          depthKm: activeEvent.depthKm,
        },
    configuration: result.config,
    datasetSummary: result.datasetSummary,
    principalAxes:
      result.sigma1 && result.sigma2 && result.sigma3
        ? {
            sigma1: {
              trendDeg: result.sigma1.trend,
              plungeDeg: result.sigma1.plunge,
              uncertainty95Deg: result.sigma1.uncertainty95Deg,
            },
            sigma2: {
              trendDeg: result.sigma2.trend,
              plungeDeg: result.sigma2.plunge,
              uncertainty95Deg: result.sigma2.uncertainty95Deg,
            },
            sigma3: {
              trendDeg: result.sigma3.trend,
              plungeDeg: result.sigma3.plunge,
              uncertainty95Deg: result.sigma3.uncertainty95Deg,
            },
            stressRatioR: result.stressRatioR,
            stressRatioRCI95: result.stressRatioRCI95,
            bishopPhi: result.bishopPhi,
            bishopPhiCI95: result.bishopPhiCI95,
            shMaxAzimuthDeg: result.shMaxAzimuthDeg,
            shMaxUncertainty95Deg: result.shMaxUncertainty95Deg,
          }
        : null,
    stressRegime: result.regime,
    diagnostics: {
      meanMisfitDeg: result.meanMisfitDeg,
      medianMisfitDeg: result.medianMisfitDeg,
      rmsMisfitDeg: result.rmsMisfitDeg,
      maxMisfitDeg: result.maxMisfitDeg,
      wellFittedPct: result.wellFittedPct,
      ambiguousPlaneFraction: result.ambiguousPlaneFraction,
      conditionNumber: result.conditionNumber,
    },
    mechanismFits: result.mechanismFits,
    insufficientReasons: result.insufficientReasons,
    ambiguityReasons: result.ambiguityReasons,
    warnings: result.warnings,
    limitations: result.limitations,
    referenceValidationNote: result.referenceValidationNote,
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Exports a clean plain-text scientific summary of the Regional Stress Analysis.
 */
export function formatRegionalStressSummaryText(
  result: RegionalStressInversionResult,
  activeEvent: EQPEvent,
  isStale: boolean
): string {
  const lines: string[] = [
    'EQP MODERN — RESEARCH REGIONAL STRESS ANALYSIS REPORT',
    '====================================================',
    `Status: ${result.status}${isStale ? ' [STALE — INPUTS MODIFIED]' : ''}`,
    `Computed UTC: ${result.computedAtUtc}`,
    `Methodology: ${result.methodologyLabel}`,
    `Convention: ${result.conventionNote}`,
    `Reference Event: ${isEventUnlocated(activeEvent) ? 'Unlocated' : `${activeEvent.filename} (${activeEvent.lat.toFixed(4)}°N, ${activeEvent.lon.toFixed(4)}°E)`}`,
    `Input Summary: ${result.datasetSummary.independentCount} independent mechanisms (${result.datasetSummary.duplicateCollapsedCount} duplicates collapsed, ${result.datasetSummary.excludedCount} excluded)`,
    '',
  ];

  if (result.status === 'Insufficient Data' || !result.sigma1 || !result.sigma2 || !result.sigma3) {
    lines.push('SOLUTION WITHHELD (INSUFFICIENT DATA / NUMERICAL DEGENERACY):');
    result.insufficientReasons.forEach((r) => lines.push(`  - ${r}`));
  } else {
    lines.push('PRINCIPAL STRESS AXES (LOWER HEMISPHERE):');
    lines.push(
      `  σ1 (Max Compression):  Trend ${result.sigma1.trend}° / Plunge ${result.sigma1.plunge}° (±${result.sigma1.uncertainty95Deg}° 95% bootstrap)`
    );
    lines.push(
      `  σ2 (Intermediate):     Trend ${result.sigma2.trend}° / Plunge ${result.sigma2.plunge}° (±${result.sigma2.uncertainty95Deg}° 95% bootstrap)`
    );
    lines.push(
      `  σ3 (Min Compression):  Trend ${result.sigma3.trend}° / Plunge ${result.sigma3.plunge}° (±${result.sigma3.uncertainty95Deg}° 95% bootstrap)`
    );
    lines.push(
      `  Stress Shape Ratio R = (σ1−σ2)/(σ1−σ3): ${result.stressRatioR?.toFixed(3)} [95% CI: ${result.stressRatioRCI95?.[0]}–${result.stressRatioRCI95?.[1]}]`
    );
    lines.push(
      `  Bishop φ = (σ2−σ3)/(σ1−σ3) = 1−R:     ${result.bishopPhi?.toFixed(3)} [95% CI: ${result.bishopPhiCI95?.[0]}–${result.bishopPhiCI95?.[1]}]`
    );
    lines.push(
      `  SHmax (Lund & Townend 2007): ${result.shMaxDefined && result.shMaxAzimuthDeg !== null ? `${result.shMaxAzimuthDeg}° ± ${result.shMaxUncertainty95Deg ?? '—'}°` : 'Undefined / Horizontally Isotropic'}`
    );
    if (result.regime) {
      lines.push('');
      lines.push(`STRESS REGIME: ${result.regime.regimeClass} (${result.regime.zobackCode})`);
      lines.push(
        `  Simpson Aφ = ${result.regime.simpsonAPhi} [95% CI: ${result.regime.simpsonAPhiCI95[0]}–${result.regime.simpsonAPhiCI95[1]}]`
      );
      lines.push(`  Rule: ${result.regime.ruleExplanation}`);
    }
    lines.push('');
    lines.push('QUALITY & MISFIT DIAGNOSTICS:');
    lines.push(
      `  Mean Slip Misfit: ${result.meanMisfitDeg}° | Median: ${result.medianMisfitDeg}° | RMS: ${result.rmsMisfitDeg}° | Max: ${result.maxMisfitDeg}°`
    );
    lines.push(
      `  Well-fitted (≤30°): ${result.wellFittedPct}% | Ambiguous-plane fraction: ${Math.round((result.ambiguousPlaneFraction ?? 0) * 100)}% | Condition κ: ${result.conditionNumber}`
    );
  }

  if (result.warnings.length > 0) {
    lines.push('');
    lines.push('WARNINGS:');
    result.warnings.forEach((w) => lines.push(`  - ${w}`));
  }

  lines.push('');
  lines.push('LIMITATIONS:');
  result.limitations.forEach((l) => lines.push(`  - ${l}`));
  lines.push(`  - ${result.referenceValidationNote}`);

  return lines.join('\n');
}
