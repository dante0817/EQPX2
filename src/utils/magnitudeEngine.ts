import {
  isEventUnlocated,
  type EQPEvent,
  type MagnitudeScale,
  type StationMeta,
  type StationPick,
} from '../data/eqpData.ts';
import {
  buildDurationRowsWithOutlierFilter,
  computeDurationOutlierSummary,
  isDurationMagnitudeEligible,
} from './legacyMagnitudeMath.ts';
import {
  selectAmplitudeInputsForAlgorithmFingerprint,
  type FutureAmplitudeAlgorithmId,
} from './amplitudeMeasurements.ts';
import {
  aggregateStationMagnitudes,
  type AggregatedMagnitudeResult,
  type NetworkAggregationMethod,
} from './magnitudeAggregation.ts';
import {
  DEFAULT_MLV_CONFIG,
  SEISCOMP_REFERENCE_MLV_PROFILE,
  evaluateMlvMagnitude,
  sanitizeMlvCalibrationConfig,
  type MlvCalibrationConfig,
} from './mlvMagnitude.ts';
import {
  DEFAULT_ML_CONFIG,
  SEISCOMP_REFERENCE_ML_PROFILE,
  evaluateMlMagnitude,
  sanitizeMlCalibrationConfig,
  type MlCalibrationConfig,
  type MlHorizontalCombinationMethod,
  type MlRequiredHorizontalComponents,
} from './mlMagnitude.ts';

export type { AggregatedMagnitudeResult, NetworkAggregationMethod };
export {
  aggregateStationMagnitudes,
  DEFAULT_MLV_CONFIG,
  SEISCOMP_REFERENCE_MLV_PROFILE,
  DEFAULT_ML_CONFIG,
  SEISCOMP_REFERENCE_ML_PROFILE,
};
export type {
  MlvCalibrationConfig,
  MlCalibrationConfig,
  MlHorizontalCombinationMethod,
  MlRequiredHorizontalComponents,
};

export type MagnitudeAlgorithmId =
  | 'eqp-legacy-ms'
  | 'md-duration'
  | 'ml-local'
  | 'mlv-vertical'
  | 'mb-body'
  | 'ms-20'
  | 'ms-bb'
  | 'mb-broadband'
  | 'mwp';

export type CalibrationStatus =
  | 'legacy_compatibility'
  | 'pending_calibration'
  | 'experimental_uncalibrated'
  | 'calibrated';

export type MagnitudeEvaluationStatus =
  | 'valid'
  | 'missing_measurement'
  | 'invalid_measurement'
  | 'missing_calibration'
  | 'unsupported_algorithm'
  | 'calculation_failure';

export type DurationDefinitionKind =
  | 'coda_duration'
  | 's_minus_p_proxy'
  | 'legacy_duration_unconfirmed'
  | 'unconfirmed';

export type EventMethodSelectionMode = 'inherit_global' | 'custom';

export type MagnitudeFreshnessStatus =
  | 'current'
  | 'recalculation_required'
  | 'historical_saved'
  | 'historical_modified';

export interface MagnitudeFreshnessInspection {
  status: MagnitudeFreshnessStatus;
  badgeLabel: 'Current' | 'Recalculation Required' | 'Historical Saved Result';
  isStale: boolean;
  isHistoricalSaved: boolean;
  preferredIsStale: boolean;
  staleAlgorithmIds: MagnitudeAlgorithmId[];
  pendingEvaluationAlgorithmIds: MagnitudeAlgorithmId[];
  reasons: string[];
}

export interface MdCoefficients {
  a: number | null;
  b: number | null;
  c: number | null;
  d: number | null;
  e: number | null;
}

export interface MdCalibrationConfig {
  profileId: string;
  algorithmVersion: string;
  calibrationStatus: 'pending_calibration' | 'experimental_uncalibrated' | 'calibrated';
  regionalApplicability: string;
  allowExperimentalEvaluation: boolean;
  coefficients: MdCoefficients;
  stationCorrections: Record<string, number>;
  minDistanceKm: number;
  maxDistanceKm: number;
  minDepthKm: number;
  maxDepthKm: number;
  requireVerifiedDuration: boolean;
}

export interface MagnitudeSettings {
  defaultMethod: MagnitudeAlgorithmId;
  enabledMethods: MagnitudeAlgorithmId[];
  networkAggregation: NetworkAggregationMethod;
  suggestAlternativeIfUnavailable: boolean;
  legacyVarianceK: number;
  mdConfig: MdCalibrationConfig;
  mlvConfig: MlvCalibrationConfig;
  mlConfig: MlCalibrationConfig;
}

export interface MagnitudeAlgorithmDescriptor {
  id: MagnitudeAlgorithmId;
  shortName: string;
  scale: string;
  displayName: string;
  scientificLabel: string;
  description: string;
  implemented: boolean;
  selectableAsDefault: boolean;
  inputRequirements: string;
  version: string;
  unavailableLabel?: string;
}

export interface StationMagnitudeEvaluation {
  pickId: string;
  sta: string;
  algorithmId: MagnitudeAlgorithmId;
  scale: string;
  measurementType: 'coda_duration' | 'amplitude' | 'none';
  measurementValue: number | null;
  measurementUnit: 's' | 'µm' | 'm' | 'mm' | 'um' | 'nm' | 'm/s' | 'counts' | '';
  measurementSource: string;
  durationPresent?: boolean;
  durationDefinition?: DurationDefinitionKind;
  durationVerifiedCoda?: boolean;
  selectedMeasurementId?: string;
  selectedMeasurementIds?: string[];
  selectedChannel?: string;
  selectedChannels?: string[];
  convertedAmplitudeMm?: number | null;
  componentAmplitudesMm?: number[];
  combinedAmplitudeMm?: number | null;
  combinationMethod?: MlHorizontalCombinationMethod | 'single_component_experimental';
  requiredHorizontalComponents?: 2 | 1;
  attenuationLogA0?: number | null;
  mlvCandidateCount?: number;
  mlCandidateCount?: number;
  distanceMetricUsed?: 'epicentral_km' | 'hypocentral_km';
  distanceKm: number | null;
  distanceDeg: number | null;
  depthKm: number;
  stationCorrection: number;
  magnitude: number | null;
  status: 'Included' | 'Excluded' | 'Invalid';
  reason: string | null;
}

export interface AlgorithmMagnitudeEvaluation {
  algorithmId: MagnitudeAlgorithmId;
  displayName: string;
  scientificLabel: string;
  scale: string;
  status: MagnitudeEvaluationStatus;
  statusReason: string | null;
  networkMagnitude: number | null;
  rawNetworkMagnitude: number | null;
  contributingStations: number;
  totalEligibleStations?: number;
  excludedStations: number;
  invalidStations: number;
  aggregationUsed: string;
  trimmedCount?: number;
  fallbackApplied?: boolean;
  aggregationNote?: string | null;
  calibrationProfileId: string;
  calibrationStatus: CalibrationStatus;
  algorithmVersion: string;
  provenanceSummary: string;
  isAuthoritativeForBulletin: boolean;
  inputFingerprint?: string;
  selectedForCalculation?: boolean;
  notSelectedReason?: string | null;
  stationDetails: StationMagnitudeEvaluation[];
}

export interface AlternativeMagnitudeSuggestion {
  algorithmId: MagnitudeAlgorithmId;
  displayName: string;
  scale: string;
  magnitude: number;
  calibrationStatus: CalibrationStatus;
  reason: string;
}

export interface EventMagnitudeMetadata {
  preferredMethodId: MagnitudeAlgorithmId;
  isPerEventOverride: boolean;
  methodSelectionMode?: EventMethodSelectionMode;
  selectedMethods?: MagnitudeAlgorithmId[];
  preferredSelectionLocked?: boolean;
  analystApprovedUncalibrated?: boolean;
  approvedCalculationId?: string;
  currentCalculationId?: string;
  originState?: 'computed_current' | 'historical_saved';
  globalDefaultAtEvaluation?: MagnitudeAlgorithmId;
  inputFingerprint?: string;
  algorithmFingerprints?: Partial<Record<MagnitudeAlgorithmId, string>>;
  selectedScale: string;
  selectedMagnitude: number | null;
  selectedStatus: MagnitudeEvaluationStatus;
  selectedStatusReason: string | null;
  contributingStations: number;
  aggregationMethod: string;
  calibrationProfileId: string;
  calibrationStatus: CalibrationStatus;
  algorithmVersion: string;
  provenanceSummary: string;
  suggestedAlternative: AlternativeMagnitudeSuggestion | null;
  resultsByAlgorithm: Partial<Record<MagnitudeAlgorithmId, AlgorithmMagnitudeEvaluation>>;
  evaluatedAt: string;
}

export const IMPLEMENTED_MAGNITUDE_IDS: ReadonlyArray<MagnitudeAlgorithmId> = [
  'eqp-legacy-ms',
  'md-duration',
  'mlv-vertical',
  'ml-local',
];

export const MAGNITUDE_SETTINGS_STORAGE_KEY = 'eqp_magnitude_settings_v1';

export const MAGNITUDE_ALGORITHMS: ReadonlyArray<MagnitudeAlgorithmDescriptor> = [
  {
    id: 'eqp-legacy-ms',
    shortName: 'EQP Legacy Ms',
    scale: 'Ms',
    displayName: 'EQP Legacy Ms — Original EQP magnitude calculation',
    scientificLabel: 'Ms — EQP Legacy (Duration-Derived)',
    description:
      'Preserves the original EQP compatibility calculation: Ml = 3.24·log10(round(T)) + 0.0005·HD(deg) − 3.49, Mb = 0.865·Ml + 1.6, Ms = 1.38·Ml − 1.44 with K·σ outlier filtering.',
    implemented: true,
    selectableAsDefault: true,
    inputRequirements: 'Active P pick and coda duration T > 0 s',
    version: 'EQP-Legacy-11.20a',
  },
  {
    id: 'md-duration',
    shortName: 'Md',
    scale: 'Md',
    displayName: 'Md — Duration Magnitude',
    scientificLabel: 'Md — Duration Magnitude',
    description:
      'Independent signal-coda duration magnitude: Md = a + b·log10(T) + c·T + d·Δ(km) + e·h(km) + Cs. Requires a verified or explicitly enabled calibration profile.',
    implemented: true,
    selectableAsDefault: true,
    inputRequirements: 'Verified coda duration T > 0 s, hypocenter Δ (km) & depth h (km), and Md calibration coefficients',
    version: 'Md-1.0.0',
  },
  {
    id: 'ml-local',
    shortName: 'ML',
    scale: 'ML',
    displayName: 'ML — Local Magnitude (Horizontal)',
    scientificLabel: 'ML — Local Magnitude',
    description:
      'SeisComP-style horizontal local magnitude: ML = log10(A_H) − log10(A0(Δ)) + Cs using Wood–Anderson simulated horizontal displacement (mean or max combination) and an independent distance attenuation curve.',
    implemented: true,
    selectableAsDefault: true,
    inputRequirements:
      'Compatible horizontal Wood–Anderson displacement pair (..N/..E or orientation-verified ..1/..2), epicentral distance Δ (km), and calibrated ML log10(A0) attenuation table',
    version: 'ML-1.0.0',
  },
  {
    id: 'mlv-vertical',
    shortName: 'MLv',
    scale: 'MLv',
    displayName: 'MLv — Vertical Local Magnitude',
    scientificLabel: 'MLv — Vertical Local Magnitude',
    description:
      'SeisComP-style vertical local magnitude: MLv = log10(A_mm) − log10(A0(Δ)) + Cs using Wood–Anderson simulated vertical displacement and a calibrated distance attenuation curve.',
    implemented: true,
    selectableAsDefault: true,
    inputRequirements:
      'Wood–Anderson simulated vertical displacement (..Z), epicentral distance Δ (km), and calibrated log10(A0) attenuation table',
    version: 'MLv-1.0.0',
  },
  {
    id: 'mb-body',
    shortName: 'mb',
    scale: 'mb',
    displayName: 'mb — Body-Wave Magnitude',
    scientificLabel: 'mb — Body-Wave Magnitude',
    description: 'Teleseismic short-period P-wave A/T body-wave magnitude.',
    implemented: false,
    selectableAsDefault: true,
    inputRequirements: 'Body-wave displacement amplitude A and dominant period T',
    version: 'Not Yet Implemented',
    unavailableLabel: 'Not Yet Implemented',
  },
  {
    id: 'ms-20',
    shortName: 'Ms_20',
    scale: 'Ms_20',
    displayName: 'Ms_20 — Surface-Wave Magnitude',
    scientificLabel: 'Ms_20 — 20 s Surface-Wave Magnitude',
    description: '20-second surface-wave magnitude following IASPEI standard.',
    implemented: false,
    selectableAsDefault: true,
    inputRequirements: 'Surface-wave amplitude at ~20 s period',
    version: 'Not Yet Implemented',
    unavailableLabel: 'Not Yet Implemented',
  },
  {
    id: 'ms-bb',
    shortName: 'Ms(BB)',
    scale: 'Ms(BB)',
    displayName: 'Ms(BB) — Broadband Surface-Wave Magnitude',
    scientificLabel: 'Ms(BB) — Broadband Surface-Wave Magnitude',
    description: 'Broadband surface-wave velocity magnitude.',
    implemented: false,
    selectableAsDefault: false,
    inputRequirements: 'Broadband surface-wave velocity amplitude',
    version: 'Not Yet Implemented',
    unavailableLabel: 'Not Yet Implemented',
  },
  {
    id: 'mb-broadband',
    shortName: 'mB',
    scale: 'mB',
    displayName: 'mB — Broadband Body-Wave Magnitude',
    scientificLabel: 'mB — Broadband Body-Wave Magnitude',
    description: 'Broadband body-wave velocity magnitude (IASPEI mB_BB).',
    implemented: false,
    selectableAsDefault: false,
    inputRequirements: 'Broadband P-wave maximum velocity',
    version: 'Not Yet Implemented',
    unavailableLabel: 'Not Yet Implemented',
  },
  {
    id: 'mwp',
    shortName: 'Mwp',
    scale: 'Mwp',
    displayName: 'Mwp — P-Wave Moment Magnitude',
    scientificLabel: 'Mwp — P-Wave Moment Magnitude',
    description: 'Integrated P-wave displacement moment magnitude estimate.',
    implemented: false,
    selectableAsDefault: false,
    inputRequirements: 'Broadband integrated P-wave displacement waveform',
    version: 'Not Yet Implemented',
    unavailableLabel: 'Not Yet Implemented',
  },
];

export const MAGNITUDE_ALGORITHM_BY_ID: Record<
  MagnitudeAlgorithmId,
  MagnitudeAlgorithmDescriptor
> = MAGNITUDE_ALGORITHMS.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<MagnitudeAlgorithmId, MagnitudeAlgorithmDescriptor>
);

export const DEFAULT_MD_CONFIG: MdCalibrationConfig = {
  profileId: 'ph-md-pending-v1',
  algorithmVersion: 'Md-1.0.0',
  calibrationStatus: 'pending_calibration',
  regionalApplicability: 'Philippine Seismic Network (Official Calibration Pending)',
  allowExperimentalEvaluation: false,
  coefficients: {
    a: null,
    b: null,
    c: null,
    d: null,
    e: null,
  },
  stationCorrections: {},
  minDistanceKm: 0,
  maxDistanceKm: 1000,
  minDepthKm: 0,
  maxDepthKm: 700,
  requireVerifiedDuration: true,
};

export const DEFAULT_MAGNITUDE_SETTINGS: MagnitudeSettings = {
  defaultMethod: 'eqp-legacy-ms',
  enabledMethods: ['eqp-legacy-ms'],
  networkAggregation: 'median',
  suggestAlternativeIfUnavailable: false,
  legacyVarianceK: 1.5,
  mdConfig: DEFAULT_MD_CONFIG,
  mlvConfig: DEFAULT_MLV_CONFIG,
  mlConfig: DEFAULT_ML_CONFIG,
};

function parseNullableFiniteNumber(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const num = typeof val === 'number' ? val : Number(val);
  return Number.isFinite(num) ? num : null;
}

export function sanitizeMagnitudeSettings(raw: unknown): MagnitudeSettings {
  if (!raw || typeof raw !== 'object') {
    return structuredClone(DEFAULT_MAGNITUDE_SETTINGS);
  }
  const obj = raw as Partial<MagnitudeSettings>;
  const candidateDefault = obj.defaultMethod;
  const validDefaultDescriptor =
    candidateDefault && candidateDefault in MAGNITUDE_ALGORITHM_BY_ID
      ? MAGNITUDE_ALGORITHM_BY_ID[candidateDefault]
      : null;

  const defaultMethod: MagnitudeAlgorithmId =
    validDefaultDescriptor && validDefaultDescriptor.implemented
      ? validDefaultDescriptor.id
      : 'eqp-legacy-ms';

  const enabledSet = new Set<MagnitudeAlgorithmId>();
  if (Array.isArray(obj.enabledMethods)) {
    for (const id of obj.enabledMethods) {
      const desc = MAGNITUDE_ALGORITHM_BY_ID[id as MagnitudeAlgorithmId];
      if (desc && desc.implemented) {
        enabledSet.add(desc.id);
      }
    }
  }
  if (!enabledSet.has(defaultMethod)) {
    enabledSet.add(defaultMethod);
  }
  if (enabledSet.size === 0) {
    enabledSet.add('eqp-legacy-ms');
  }

  const networkAggregation: NetworkAggregationMethod =
    obj.networkAggregation === 'median' ||
    obj.networkAggregation === 'arithmetic_mean' ||
    obj.networkAggregation === 'trimmed_mean'
      ? obj.networkAggregation
      : 'median';

  const rawK = Number(obj.legacyVarianceK);
  const legacyVarianceK = Number.isFinite(rawK) && rawK > 0 && rawK <= 10 ? rawK : 1.5;

  const rawMd = (obj.mdConfig ?? {}) as Partial<MdCalibrationConfig>;
  const rawCoeffs = (rawMd.coefficients ?? {}) as Partial<MdCoefficients>;
  const coefficients: MdCoefficients = {
    a: parseNullableFiniteNumber(rawCoeffs.a),
    b: parseNullableFiniteNumber(rawCoeffs.b),
    c: parseNullableFiniteNumber(rawCoeffs.c),
    d: parseNullableFiniteNumber(rawCoeffs.d),
    e: parseNullableFiniteNumber(rawCoeffs.e),
  };

  const stationCorrections: Record<string, number> = {};
  if (rawMd.stationCorrections && typeof rawMd.stationCorrections === 'object') {
    for (const [k, v] of Object.entries(rawMd.stationCorrections)) {
      const code = k.trim().toUpperCase();
      const num = parseNullableFiniteNumber(v);
      if (code && num !== null) {
        stationCorrections[code] = num;
      }
    }
  }

  const rawStatus = rawMd.calibrationStatus;
  const calibrationStatus: MdCalibrationConfig['calibrationStatus'] =
    rawStatus === 'calibrated' ||
    rawStatus === 'experimental_uncalibrated' ||
    rawStatus === 'pending_calibration'
      ? rawStatus
      : 'pending_calibration';

  const minDistanceKm = Math.max(
    0,
    parseNullableFiniteNumber(rawMd.minDistanceKm) ?? DEFAULT_MD_CONFIG.minDistanceKm
  );
  const maxDistanceKm = Math.max(
    minDistanceKm + 1,
    parseNullableFiniteNumber(rawMd.maxDistanceKm) ?? DEFAULT_MD_CONFIG.maxDistanceKm
  );
  const minDepthKm = Math.max(
    0,
    parseNullableFiniteNumber(rawMd.minDepthKm) ?? DEFAULT_MD_CONFIG.minDepthKm
  );
  const maxDepthKm = Math.max(
    minDepthKm + 1,
    parseNullableFiniteNumber(rawMd.maxDepthKm) ?? DEFAULT_MD_CONFIG.maxDepthKm
  );

  return {
    defaultMethod,
    enabledMethods: Array.from(enabledSet),
    networkAggregation,
    suggestAlternativeIfUnavailable: Boolean(obj.suggestAlternativeIfUnavailable),
    legacyVarianceK,
    mdConfig: {
      profileId:
        typeof rawMd.profileId === 'string' && rawMd.profileId.trim()
          ? rawMd.profileId.trim()
          : DEFAULT_MD_CONFIG.profileId,
      algorithmVersion:
        typeof rawMd.algorithmVersion === 'string' && rawMd.algorithmVersion.trim()
          ? rawMd.algorithmVersion.trim()
          : DEFAULT_MD_CONFIG.algorithmVersion,
      calibrationStatus,
      regionalApplicability:
        typeof rawMd.regionalApplicability === 'string' && rawMd.regionalApplicability.trim()
          ? rawMd.regionalApplicability.trim()
          : DEFAULT_MD_CONFIG.regionalApplicability,
      allowExperimentalEvaluation: Boolean(rawMd.allowExperimentalEvaluation),
      coefficients,
      stationCorrections,
      minDistanceKm,
      maxDistanceKm,
      minDepthKm,
      maxDepthKm,
      requireVerifiedDuration:
        rawMd.requireVerifiedDuration === undefined
          ? true
          : Boolean(rawMd.requireVerifiedDuration),
    },
    mlvConfig: sanitizeMlvCalibrationConfig(obj.mlvConfig),
    mlConfig: sanitizeMlCalibrationConfig(obj.mlConfig),
  };
}

export function loadMagnitudeSettings(): MagnitudeSettings {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return structuredClone(DEFAULT_MAGNITUDE_SETTINGS);
    }
    const raw = window.localStorage.getItem(MAGNITUDE_SETTINGS_STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_MAGNITUDE_SETTINGS);
    return sanitizeMagnitudeSettings(JSON.parse(raw));
  } catch {
    return structuredClone(DEFAULT_MAGNITUDE_SETTINGS);
  }
}

export function saveMagnitudeSettings(settings: MagnitudeSettings): MagnitudeSettings {
  const clean = sanitizeMagnitudeSettings(settings);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(MAGNITUDE_SETTINGS_STORAGE_KEY, JSON.stringify(clean));
    }
  } catch {
    // Ignore storage quota/access errors
  }
  return clean;
}

export function resetMagnitudeSettings(): MagnitudeSettings {
  const clean = structuredClone(DEFAULT_MAGNITUDE_SETTINGS);
  saveMagnitudeSettings(clean);
  return clean;
}

export function formatLegacyScaleShort(
  scale: MagnitudeScale | string
): 'Ms' | 'Mb' | 'ML' {
  if (scale === 'Mb') return 'Mb';
  if (scale === 'Md' || scale === 'Ml' || scale === 'ML') return 'ML';
  return 'Ms';
}

export function formatLegacyScaleLong(scale: MagnitudeScale | string): string {
  const short = formatLegacyScaleShort(scale);
  if (short === 'Mb') return 'Mb — EQP Legacy';
  if (short === 'ML') return 'ML — EQP Legacy';
  return 'Ms — EQP Legacy';
}

export function formatAggregationLabel(method: NetworkAggregationMethod | string): string {
  if (method === 'median') return 'Median';
  if (method === 'arithmetic_mean') return 'Arithmetic Mean';
  if (method === 'trimmed_mean') return 'Trimmed Mean';
  if (method === 'eqp-legacy-k-sigma-mean') return 'EQP Legacy K·σ Outlier-Filtered Mean';
  return method;
}

export function formatCalibrationStatusLabel(status: CalibrationStatus): string {
  switch (status) {
    case 'legacy_compatibility':
      return 'EQP Legacy Compatibility';
    case 'calibrated':
      return 'Calibrated';
    case 'experimental_uncalibrated':
      return 'Experimental / Uncalibrated';
    case 'pending_calibration':
      return 'Pending Calibration';
  }
}

// aggregateStationMagnitudes re-exported from ./magnitudeAggregation above

function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

export interface DurationSourceDescription {
  isPresent: boolean;
  definition: DurationDefinitionKind;
  verifiedCoda: boolean;
  label: string;
}

export function describeDurationSource(pick: StationPick): DurationSourceDescription {
  const isPresent =
    pick.duration !== null &&
    pick.duration !== undefined &&
    Number.isFinite(pick.duration) &&
    pick.duration > 0;

  if (pick.durationSource === 's_minus_p') {
    return {
      isPresent,
      definition: 's_minus_p_proxy',
      verifiedCoda: false,
      label: 'S−P proxy (not coda — rejected)',
    };
  }
  if (pick.durationSource === 'manual_coda') {
    return {
      isPresent,
      definition: 'coda_duration',
      verifiedCoda: true,
      label: 'Verified manual coda duration (s)',
    };
  }
  if (pick.durationSource === 'atlas_coda') {
    return {
      isPresent,
      definition: 'coda_duration',
      verifiedCoda: true,
      label: 'ATLAS/HYDRA coda field (cols 89–91)',
    };
  }
  if (pick.durationSource === 'legacy_eqp') {
    return {
      isPresent,
      definition: 'legacy_duration_unconfirmed',
      verifiedCoda: false,
      label: 'Legacy EQP duration field (unconfirmed coda definition)',
    };
  }
  return {
    isPresent,
    definition: 'unconfirmed',
    verifiedCoda: false,
    label: pick.atlasMetadata
      ? 'Unconfirmed ATLAS duration metadata'
      : 'Unconfirmed station duration field',
  };
}

export function evaluateEqpLegacyMs(
  event: EQPEvent,
  varianceK = 1.5
): AlgorithmMagnitudeEvaluation {
  const desc = MAGNITUDE_ALGORITHM_BY_ID['eqp-legacy-ms'];
  const safeK = Number.isFinite(varianceK) && varianceK > 0 ? varianceK : 1.5;

  const { rows } = buildDurationRowsWithOutlierFilter(event, 'Ms', safeK, {
    autoRejectOutliers: true,
    respectManualOverrides: true,
  });
  const summary = computeDurationOutlierSummary(rows, 'Ms', safeK);
  const rowByPickId = new Map(rows.map((r) => [r.pickId, r]));

  const stationDetails: StationMagnitudeEvaluation[] = event.picks.map((pick) => {
    const row = rowByPickId.get(pick.id);
    const hasDuration =
      pick.duration !== null &&
      pick.duration !== undefined &&
      Number.isFinite(pick.duration) &&
      pick.duration > 0;
    const distanceDeg = Number.isFinite(pick.delta) ? pick.delta : null;
    const distanceKm =
      distanceDeg !== null && distanceDeg > 0
        ? Number((distanceDeg * 111.32).toFixed(2))
        : null;
    const durDesc = describeDurationSource(pick);
    const sourceLabel = durDesc.label;

    if (pick.pExcluded || pick.pTime.trim() === '') {
      return {
        pickId: pick.id,
        sta: pick.sta,
        algorithmId: 'eqp-legacy-ms',
        scale: 'Ms',
        measurementType: hasDuration ? 'coda_duration' : 'none',
        measurementValue: hasDuration ? Number(pick.duration) : null,
        measurementUnit: hasDuration ? 's' : '',
        measurementSource: hasDuration ? sourceLabel : 'Missing',
        durationPresent: durDesc.isPresent,
        durationDefinition: durDesc.definition,
        durationVerifiedCoda: durDesc.verifiedCoda,
        distanceKm,
        distanceDeg,
        depthKm: event.depthKm,
        stationCorrection: 0,
        magnitude: null,
        status: 'Excluded',
        reason: pick.pTime.trim() === '' ? 'Missing P pick' : 'P pick excluded',
      };
    }

    if (!isDurationMagnitudeEligible(pick) || !row) {
      return {
        pickId: pick.id,
        sta: pick.sta,
        algorithmId: 'eqp-legacy-ms',
        scale: 'Ms',
        measurementType: 'none',
        measurementValue: null,
        measurementUnit: '',
        measurementSource: 'Missing',
        durationPresent: durDesc.isPresent,
        durationDefinition: durDesc.definition,
        durationVerifiedCoda: durDesc.verifiedCoda,
        distanceKm,
        distanceDeg,
        depthKm: event.depthKm,
        stationCorrection: 0,
        magnitude: null,
        status: 'Invalid',
        reason: 'Missing or non-positive coda duration (T ≤ 0)',
      };
    }

    const isOutlier = summary.outlierPickIds.has(pick.id);
    const z = summary.zScoreByPickId.get(pick.id);
    const reason = !row.included
      ? pick.magExcluded === true
        ? isOutlier
          ? `Rejected outlier (${z?.toFixed(2) ?? '?'}σ > ${safeK.toFixed(2)}σ)`
          : 'Manually excluded from magnitude'
        : isOutlier
          ? `Rejected outlier (${z?.toFixed(2) ?? '?'}σ > ${safeK.toFixed(2)}σ)`
          : 'Excluded from network mean'
      : null;

    return {
      pickId: pick.id,
      sta: pick.sta,
      algorithmId: 'eqp-legacy-ms',
      scale: 'Ms',
      measurementType: 'coda_duration',
      measurementValue: row.td,
      measurementUnit: 's',
      measurementSource: sourceLabel,
      durationPresent: durDesc.isPresent,
      durationDefinition: durDesc.definition,
      durationVerifiedCoda: durDesc.verifiedCoda,
      distanceKm,
      distanceDeg,
      depthKm: event.depthKm,
      stationCorrection: 0,
      magnitude: Number(row.ms.toFixed(1)),
      status: row.included ? 'Included' : 'Excluded',
      reason,
    };
  });

  const includedRows = rows.filter((r) => r.included);
  const contributingStations = includedRows.length;
  const excludedStations = stationDetails.filter((s) => s.status === 'Excluded').length;
  const invalidStations = stationDetails.filter((s) => s.status === 'Invalid').length;

  if (rows.length === 0 || contributingStations === 0) {
    return {
      algorithmId: 'eqp-legacy-ms',
      displayName: desc.displayName,
      scientificLabel: desc.scientificLabel,
      scale: 'Ms',
      status: 'missing_measurement',
      statusReason:
        rows.length === 0
          ? 'No eligible stations with active P picks and positive coda duration (T > 0 s).'
          : 'All duration-eligible stations were excluded from network Ms calculation.',
      networkMagnitude: null,
      rawNetworkMagnitude: null,
      contributingStations: 0,
      totalEligibleStations: rows.length,
      excludedStations,
      invalidStations,
      aggregationUsed: 'eqp-legacy-k-sigma-mean',
      trimmedCount: 0,
      fallbackApplied: false,
      calibrationProfileId: 'eqp-legacy-11.20a',
      calibrationStatus: 'legacy_compatibility',
      algorithmVersion: desc.version,
      provenanceSummary: `Ms = 1.38·Ml − 1.44 where Ml = 3.24·log10(round(T)) + 0.0005·HD(deg) − 3.49 (K=${safeK.toFixed(2)}σ)`,
      isAuthoritativeForBulletin: true,
      stationDetails,
    };
  }

  const includedRoundedValues = includedRows.map((r) => Number(r.ms.toFixed(1)));
  const rawMean =
    includedRoundedValues.reduce((acc, v) => acc + v, 0) / includedRoundedValues.length;
  const networkMagnitude = Number(rawMean.toFixed(1));

  return {
    algorithmId: 'eqp-legacy-ms',
    displayName: desc.displayName,
    scientificLabel: desc.scientificLabel,
    scale: 'Ms',
    status: 'valid',
    statusReason: null,
    networkMagnitude,
    rawNetworkMagnitude: Number(rawMean.toFixed(3)),
    contributingStations,
    totalEligibleStations: rows.length,
    excludedStations,
    invalidStations,
    aggregationUsed: 'eqp-legacy-k-sigma-mean',
    trimmedCount: 0,
    fallbackApplied: false,
    calibrationProfileId: 'eqp-legacy-11.20a',
    calibrationStatus: 'legacy_compatibility',
    algorithmVersion: desc.version,
    provenanceSummary: `Ms = 1.38·Ml − 1.44 where Ml = 3.24·log10(round(T)) + 0.0005·HD(deg) − 3.49 (K=${safeK.toFixed(2)}σ)`,
    isAuthoritativeForBulletin: true,
    stationDetails,
  };
}

export function evaluateDurationMagnitudeMd(
  event: EQPEvent,
  settings: MagnitudeSettings,
  stations: ReadonlyArray<StationMeta> = []
): AlgorithmMagnitudeEvaluation {
  const desc = MAGNITUDE_ALGORITHM_BY_ID['md-duration'];
  const mdCfg = settings.mdConfig;
  const calibrationStatus: CalibrationStatus =
    mdCfg.calibrationStatus === 'calibrated'
      ? 'calibrated'
      : mdCfg.allowExperimentalEvaluation
        ? 'experimental_uncalibrated'
        : 'pending_calibration';

  const coeffs = mdCfg.coefficients;
  const hasCompleteCoefficients =
    coeffs.a !== null &&
    Number.isFinite(coeffs.a) &&
    coeffs.b !== null &&
    Number.isFinite(coeffs.b) &&
    coeffs.c !== null &&
    Number.isFinite(coeffs.c) &&
    coeffs.d !== null &&
    Number.isFinite(coeffs.d) &&
    coeffs.e !== null &&
    Number.isFinite(coeffs.e);

  const provenanceCoeffText = hasCompleteCoefficients
    ? `Md = ${coeffs.a} + ${coeffs.b}·log10(T) + ${coeffs.c}·T + ${coeffs.d}·Δ(km) + ${coeffs.e}·h(km) + Cs`
    : 'Md = a + b·log10(T) + c·T + d·Δ(km) + e·h(km) + Cs (Calibration pending)';

  if (
    mdCfg.calibrationStatus === 'pending_calibration' &&
    !mdCfg.allowExperimentalEvaluation
  ) {
    return {
      algorithmId: 'md-duration',
      displayName: desc.displayName,
      scientificLabel: desc.scientificLabel,
      scale: 'Md',
      status: 'missing_calibration',
      statusReason:
        'Philippine Md calibration coefficients (a, b, c, d, e) are pending official calibration. Enable experimental coefficients in Advanced Magnitude Settings to evaluate.',
      networkMagnitude: null,
      rawNetworkMagnitude: null,
      contributingStations: 0,
      excludedStations: 0,
      invalidStations: 0,
      aggregationUsed: settings.networkAggregation,
      calibrationProfileId: mdCfg.profileId,
      calibrationStatus: 'pending_calibration',
      algorithmVersion: mdCfg.algorithmVersion,
      provenanceSummary: provenanceCoeffText,
      isAuthoritativeForBulletin: false,
      stationDetails: [],
    };
  }

  if (!hasCompleteCoefficients) {
    return {
      algorithmId: 'md-duration',
      displayName: desc.displayName,
      scientificLabel: desc.scientificLabel,
      scale: 'Md',
      status: 'missing_calibration',
      statusReason:
        'Md calibration coefficients (a, b, c, d, e) are incomplete or non-numeric.',
      networkMagnitude: null,
      rawNetworkMagnitude: null,
      contributingStations: 0,
      excludedStations: 0,
      invalidStations: 0,
      aggregationUsed: settings.networkAggregation,
      calibrationProfileId: mdCfg.profileId,
      calibrationStatus,
      algorithmVersion: mdCfg.algorithmVersion,
      provenanceSummary: provenanceCoeffText,
      isAuthoritativeForBulletin: false,
      stationDetails: [],
    };
  }

  const unlocated = isEventUnlocated(event);
  if (unlocated) {
    return {
      algorithmId: 'md-duration',
      displayName: desc.displayName,
      scientificLabel: desc.scientificLabel,
      scale: 'Md',
      status: 'missing_measurement',
      statusReason:
        'Hypocenter is not located yet — epicentral distance Δ (km) and depth h (km) are required for Md.',
      networkMagnitude: null,
      rawNetworkMagnitude: null,
      contributingStations: 0,
      excludedStations: 0,
      invalidStations: 0,
      aggregationUsed: settings.networkAggregation,
      calibrationProfileId: mdCfg.profileId,
      calibrationStatus,
      algorithmVersion: mdCfg.algorithmVersion,
      provenanceSummary: provenanceCoeffText,
      isAuthoritativeForBulletin: false,
      stationDetails: [],
    };
  }

  const depthKm = event.depthKm;
  if (
    !Number.isFinite(depthKm) ||
    depthKm < mdCfg.minDepthKm ||
    depthKm > mdCfg.maxDepthKm
  ) {
    return {
      algorithmId: 'md-duration',
      displayName: desc.displayName,
      scientificLabel: desc.scientificLabel,
      scale: 'Md',
      status: 'invalid_measurement',
      statusReason: `Focal depth ${Number.isFinite(depthKm) ? depthKm.toFixed(1) : 'NaN'} km is outside supported Md range (${mdCfg.minDepthKm}–${mdCfg.maxDepthKm} km).`,
      networkMagnitude: null,
      rawNetworkMagnitude: null,
      contributingStations: 0,
      excludedStations: 0,
      invalidStations: 0,
      aggregationUsed: settings.networkAggregation,
      calibrationProfileId: mdCfg.profileId,
      calibrationStatus,
      algorithmVersion: mdCfg.algorithmVersion,
      provenanceSummary: provenanceCoeffText,
      isAuthoritativeForBulletin: false,
      stationDetails: [],
    };
  }

  const stationLookup = new Map<string, StationMeta>();
  for (const st of stations) {
    const code = st.code.trim().toUpperCase();
    if (code && !stationLookup.has(code)) {
      stationLookup.set(code, st);
    }
  }

  const validStationMagnitudes: number[] = [];
  const stationDetails: StationMagnitudeEvaluation[] = event.picks.map((pick) => {
    const staCode = pick.sta.trim().toUpperCase();
    const cs = mdCfg.stationCorrections[staCode] ?? 0;
    const durDesc = describeDurationSource(pick);
    const sourceLabel = durDesc.label;
    const verifiedCoda = durDesc.verifiedCoda;

    const hasFiniteDuration =
      pick.duration !== null &&
      pick.duration !== undefined &&
      Number.isFinite(pick.duration);

    let distanceKm: number | null = null;
    let distanceDeg: number | null = null;
    if (Number.isFinite(pick.delta) && pick.delta > 0) {
      distanceDeg = pick.delta;
      distanceKm = Number((pick.delta * 111.32).toFixed(2));
    } else {
      const stMeta = stationLookup.get(staCode);
      const stLat =
        Number.isFinite(pick.lat) && pick.lat !== 0
          ? pick.lat
          : stMeta?.lat ?? 0;
      const stLon =
        Number.isFinite(pick.lon) && pick.lon !== 0
          ? pick.lon
          : stMeta?.lon ?? 0;
      if (stLat !== 0 && stLon !== 0) {
        distanceKm = Number(
          haversineDistanceKm(event.lat, event.lon, stLat, stLon).toFixed(2)
        );
        distanceDeg = Number((distanceKm / 111.32).toFixed(3));
      }
    }

    if (pick.pTime.trim() === '' || pick.pExcluded) {
      return {
        pickId: pick.id,
        sta: pick.sta,
        algorithmId: 'md-duration',
        scale: 'Md',
        measurementType: hasFiniteDuration ? 'coda_duration' : 'none',
        measurementValue: hasFiniteDuration ? Number(pick.duration) : null,
        measurementUnit: hasFiniteDuration ? 's' : '',
        measurementSource: hasFiniteDuration ? sourceLabel : 'Missing',
        durationPresent: durDesc.isPresent,
        durationDefinition: durDesc.definition,
        durationVerifiedCoda: durDesc.verifiedCoda,
        distanceKm,
        distanceDeg,
        depthKm,
        stationCorrection: cs,
        magnitude: null,
        status: 'Excluded',
        reason: pick.pTime.trim() === '' ? 'Missing P pick' : 'P pick excluded',
      };
    }

    if (!hasFiniteDuration || (pick.duration as number) <= 0) {
      return {
        pickId: pick.id,
        sta: pick.sta,
        algorithmId: 'md-duration',
        scale: 'Md',
        measurementType: 'none',
        measurementValue: hasFiniteDuration ? Number(pick.duration) : null,
        measurementUnit: hasFiniteDuration ? 's' : '',
        measurementSource: hasFiniteDuration ? sourceLabel : 'Missing',
        durationPresent: durDesc.isPresent,
        durationDefinition: durDesc.definition,
        durationVerifiedCoda: durDesc.verifiedCoda,
        distanceKm,
        distanceDeg,
        depthKm,
        stationCorrection: cs,
        magnitude: null,
        status: 'Invalid',
        reason: !hasFiniteDuration
          ? 'Missing coda duration'
          : 'Invalid coda duration (T ≤ 0 s)',
      };
    }

    if (mdCfg.requireVerifiedDuration && !verifiedCoda) {
      return {
        pickId: pick.id,
        sta: pick.sta,
        algorithmId: 'md-duration',
        scale: 'Md',
        measurementType: 'coda_duration',
        measurementValue: Number(pick.duration),
        measurementUnit: 's',
        measurementSource: sourceLabel,
        durationPresent: durDesc.isPresent,
        durationDefinition: durDesc.definition,
        durationVerifiedCoda: durDesc.verifiedCoda,
        distanceKm,
        distanceDeg,
        depthKm,
        stationCorrection: cs,
        magnitude: null,
        status: 'Invalid',
        reason:
          durDesc.definition === 's_minus_p_proxy'
            ? 'Duration source is S−P proxy (not verified coda duration)'
            : 'Duration definition is not verified coda duration',
      };
    }

    if (distanceKm === null || !Number.isFinite(distanceKm) || distanceKm < 0) {
      return {
        pickId: pick.id,
        sta: pick.sta,
        algorithmId: 'md-duration',
        scale: 'Md',
        measurementType: 'coda_duration',
        measurementValue: Number(pick.duration),
        measurementUnit: 's',
        measurementSource: sourceLabel,
        durationPresent: durDesc.isPresent,
        durationDefinition: durDesc.definition,
        durationVerifiedCoda: durDesc.verifiedCoda,
        distanceKm: null,
        distanceDeg: null,
        depthKm,
        stationCorrection: cs,
        magnitude: null,
        status: 'Invalid',
        reason: 'Invalid or unavailable station epicentral distance Δ (km)',
      };
    }

    if (distanceKm < mdCfg.minDistanceKm || distanceKm > mdCfg.maxDistanceKm) {
      return {
        pickId: pick.id,
        sta: pick.sta,
        algorithmId: 'md-duration',
        scale: 'Md',
        measurementType: 'coda_duration',
        measurementValue: Number(pick.duration),
        measurementUnit: 's',
        measurementSource: sourceLabel,
        durationPresent: durDesc.isPresent,
        durationDefinition: durDesc.definition,
        durationVerifiedCoda: durDesc.verifiedCoda,
        distanceKm,
        distanceDeg,
        depthKm,
        stationCorrection: cs,
        magnitude: null,
        status: 'Invalid',
        reason: `Distance ${distanceKm.toFixed(1)} km outside calibrated range (${mdCfg.minDistanceKm}–${mdCfg.maxDistanceKm} km)`,
      };
    }

    const tSec = Number(pick.duration);
    const mdRaw =
      (coeffs.a as number) +
      (coeffs.b as number) * Math.log10(tSec) +
      (coeffs.c as number) * tSec +
      (coeffs.d as number) * distanceKm +
      (coeffs.e as number) * depthKm +
      cs;

    if (!Number.isFinite(mdRaw)) {
      return {
        pickId: pick.id,
        sta: pick.sta,
        algorithmId: 'md-duration',
        scale: 'Md',
        measurementType: 'coda_duration',
        measurementValue: tSec,
        measurementUnit: 's',
        measurementSource: sourceLabel,
        durationPresent: durDesc.isPresent,
        durationDefinition: durDesc.definition,
        durationVerifiedCoda: durDesc.verifiedCoda,
        distanceKm,
        distanceDeg,
        depthKm,
        stationCorrection: cs,
        magnitude: null,
        status: 'Invalid',
        reason: 'Station Md calculation produced non-finite value',
      };
    }

    const stationMd = Number(mdRaw.toFixed(2));
    validStationMagnitudes.push(stationMd);

    return {
      pickId: pick.id,
      sta: pick.sta,
      algorithmId: 'md-duration',
      scale: 'Md',
      measurementType: 'coda_duration',
      measurementValue: tSec,
      measurementUnit: 's',
      measurementSource: sourceLabel,
      durationPresent: durDesc.isPresent,
      durationDefinition: durDesc.definition,
      durationVerifiedCoda: durDesc.verifiedCoda,
      distanceKm,
      distanceDeg,
      depthKm,
      stationCorrection: cs,
      magnitude: stationMd,
      status: 'Included',
      reason: null,
    };
  });

  const excludedStations = stationDetails.filter((s) => s.status === 'Excluded').length;
  const invalidStations = stationDetails.filter((s) => s.status === 'Invalid').length;

  const aggregated = aggregateStationMagnitudes(
    validStationMagnitudes,
    settings.networkAggregation
  );

  if (!aggregated) {
    return {
      algorithmId: 'md-duration',
      displayName: desc.displayName,
      scientificLabel: desc.scientificLabel,
      scale: 'Md',
      status: invalidStations > 0 ? 'invalid_measurement' : 'missing_measurement',
      statusReason:
        invalidStations > 0
          ? 'No valid station Md values remained after duration, distance, and range validation.'
          : 'No stations with verified positive coda duration (T > 0 s).',
      networkMagnitude: null,
      rawNetworkMagnitude: null,
      contributingStations: 0,
      totalEligibleStations: 0,
      excludedStations,
      invalidStations,
      aggregationUsed: settings.networkAggregation,
      trimmedCount: 0,
      fallbackApplied: false,
      calibrationProfileId: mdCfg.profileId,
      calibrationStatus,
      algorithmVersion: mdCfg.algorithmVersion,
      provenanceSummary: provenanceCoeffText,
      isAuthoritativeForBulletin: false,
      stationDetails,
    };
  }

  const aggregationNote = aggregated.fallbackApplied
    ? `Trimmed mean fell back to arithmetic mean (N = ${aggregated.totalEligible} < 10; 0 trimmed)`
    : aggregated.trimmedCount > 0
      ? `10% trimmed mean (${aggregated.trimmedCount} of ${aggregated.totalEligible} trimmed; ${aggregated.contributingCount} kept)`
      : null;

  return {
    algorithmId: 'md-duration',
    displayName: desc.displayName,
    scientificLabel: desc.scientificLabel,
    scale: 'Md',
    status: 'valid',
    statusReason: null,
    networkMagnitude: aggregated.value,
    rawNetworkMagnitude: aggregated.rawValue,
    contributingStations: aggregated.contributingCount,
    totalEligibleStations: aggregated.totalEligible,
    excludedStations,
    invalidStations,
    aggregationUsed: aggregated.aggregationUsed,
    trimmedCount: aggregated.trimmedCount,
    fallbackApplied: aggregated.fallbackApplied,
    aggregationNote,
    calibrationProfileId: mdCfg.profileId,
    calibrationStatus,
    algorithmVersion: mdCfg.algorithmVersion,
    provenanceSummary: provenanceCoeffText,
    isAuthoritativeForBulletin: calibrationStatus === 'calibrated',
    stationDetails,
  };
}

export function evaluateUnsupportedAlgorithm(
  algorithmId: MagnitudeAlgorithmId
): AlgorithmMagnitudeEvaluation {
  const desc = MAGNITUDE_ALGORITHM_BY_ID[algorithmId];
  return {
    algorithmId,
    displayName: desc.displayName,
    scientificLabel: desc.scientificLabel,
    scale: desc.scale,
    status: 'unsupported_algorithm',
    statusReason: `${desc.shortName} is not yet implemented (${desc.inputRequirements}).`,
    networkMagnitude: null,
    rawNetworkMagnitude: null,
    contributingStations: 0,
    excludedStations: 0,
    invalidStations: 0,
    aggregationUsed: 'none',
    calibrationProfileId: 'unimplemented',
    calibrationStatus: 'pending_calibration',
    algorithmVersion: desc.version,
    provenanceSummary: 'Algorithm not yet implemented — no magnitude computed',
    isAuthoritativeForBulletin: false,
    stationDetails: [],
  };
}

export function evaluateMagnitudeAlgorithm(
  algorithmId: MagnitudeAlgorithmId,
  event: EQPEvent,
  settings: MagnitudeSettings,
  stations: ReadonlyArray<StationMeta> = []
): AlgorithmMagnitudeEvaluation {
  if (algorithmId === 'eqp-legacy-ms') {
    return evaluateEqpLegacyMs(event, settings.legacyVarianceK);
  }
  if (algorithmId === 'md-duration') {
    return evaluateDurationMagnitudeMd(event, settings, stations);
  }
  if (algorithmId === 'mlv-vertical') {
    return evaluateMlvMagnitude(event, settings, stations);
  }
  if (algorithmId === 'ml-local') {
    return evaluateMlMagnitude(event, settings, stations);
  }
  return evaluateUnsupportedAlgorithm(algorithmId);
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableSerialize(v)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableSerialize(obj[k])}`)
    .join(',')}}`;
}

function deterministicHashHex(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c + ((i + 1) & 0xff);
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

export function computeAlgorithmInputFingerprint(
  algorithmId: MagnitudeAlgorithmId,
  event: EQPEvent,
  settings: MagnitudeSettings,
  stations: ReadonlyArray<StationMeta> = []
): string {
  const stationLookup = new Map<string, StationMeta>();
  for (const st of stations) {
    const code = st.code.trim().toUpperCase();
    if (code && !stationLookup.has(code)) {
      stationLookup.set(code, st);
    }
  }

  if (algorithmId === 'eqp-legacy-ms') {
    const payload = {
      algorithmId,
      preferredScale: event.preferredScale,
      depthKm: Number.isFinite(event.depthKm) ? Number(event.depthKm.toFixed(4)) : null,
      legacyVarianceK: Number(settings.legacyVarianceK.toFixed(4)),
      picks: event.picks.map((p) => ({
        id: p.id,
        sta: p.sta.trim().toUpperCase(),
        pTime: p.pTime.trim(),
        pExcluded: Boolean(p.pExcluded),
        delta: Number.isFinite(p.delta) ? Number(p.delta.toFixed(4)) : null,
        duration:
          p.duration !== null && p.duration !== undefined && Number.isFinite(p.duration)
            ? Number(p.duration)
            : null,
        magExcluded: p.magExcluded ?? null,
      })),
    };
    return deterministicHashHex(stableSerialize(payload));
  }

  if (algorithmId === 'md-duration') {
    const mdCfg = settings.mdConfig;
    const eventStationCorrections = Array.from(
      new Set(event.picks.map((p) => p.sta.trim().toUpperCase()).filter(Boolean))
    )
      .sort()
      .map((code) => [code, mdCfg.stationCorrections[code] ?? 0]);

    const payload = {
      algorithmId,
      lat: Number.isFinite(event.lat) ? Number(event.lat.toFixed(5)) : null,
      lon: Number.isFinite(event.lon) ? Number(event.lon.toFixed(5)) : null,
      depthKm: Number.isFinite(event.depthKm) ? Number(event.depthKm.toFixed(4)) : null,
      iterations: Math.trunc(event.iterations || 0),
      networkAggregation: settings.networkAggregation,
      mdConfig: {
        profileId: mdCfg.profileId,
        algorithmVersion: mdCfg.algorithmVersion,
        calibrationStatus: mdCfg.calibrationStatus,
        regionalApplicability: mdCfg.regionalApplicability,
        allowExperimentalEvaluation: mdCfg.allowExperimentalEvaluation,
        coefficients: mdCfg.coefficients,
        minDistanceKm: mdCfg.minDistanceKm,
        maxDistanceKm: mdCfg.maxDistanceKm,
        minDepthKm: mdCfg.minDepthKm,
        maxDepthKm: mdCfg.maxDepthKm,
        requireVerifiedDuration: mdCfg.requireVerifiedDuration,
      },
      stationCorrections: eventStationCorrections,
      picks: event.picks.map((p) => {
        const staCode = p.sta.trim().toUpperCase();
        const stMeta = stationLookup.get(staCode);
        return {
          id: p.id,
          sta: staCode,
          pTime: p.pTime.trim(),
          pExcluded: Boolean(p.pExcluded),
          duration:
            p.duration !== null && p.duration !== undefined && Number.isFinite(p.duration)
              ? Number(p.duration)
              : null,
          durationSource: p.durationSource ?? null,
          hasAtlasMetadata: Boolean(p.atlasMetadata),
          delta: Number.isFinite(p.delta) ? Number(p.delta.toFixed(4)) : null,
          pickLat: Number.isFinite(p.lat) ? Number(p.lat.toFixed(5)) : null,
          pickLon: Number.isFinite(p.lon) ? Number(p.lon.toFixed(5)) : null,
          stationLat: stMeta && Number.isFinite(stMeta.lat) ? Number(stMeta.lat.toFixed(5)) : null,
          stationLon: stMeta && Number.isFinite(stMeta.lon) ? Number(stMeta.lon.toFixed(5)) : null,
        };
      }),
    };
    return deterministicHashHex(stableSerialize(payload));
  }

  if (algorithmId === 'mlv-vertical') {
    const mlvCfg = settings.mlvConfig;
    const amplitudeInputs = selectAmplitudeInputsForAlgorithmFingerprint(
      'mlv-vertical',
      event
    );
    const correctionKeys = new Set<string>();
    for (const p of event.picks) {
      const sta = p.sta.trim().toUpperCase();
      if (sta) correctionKeys.add(sta);
      const net = p.atlasMetadata?.network?.trim().toUpperCase() ?? '';
      if (net && sta) correctionKeys.add(`${net}.${sta}`);
    }
    for (const m of event.amplitudeMeasurements ?? []) {
      const sta = m.stationCode.trim().toUpperCase();
      const net = m.networkCode.trim().toUpperCase();
      const loc = m.locationCode.trim().toUpperCase();
      if (sta) correctionKeys.add(sta);
      if (net && sta) correctionKeys.add(`${net}.${sta}`);
      if (net && sta && loc) correctionKeys.add(`${net}.${sta}.${loc}`);
    }
    const relevantCorrections = Array.from(correctionKeys)
      .sort()
      .map((key) => [key, mlvCfg.stationCorrections[key] ?? null]);

    const payload = {
      algorithmId,
      lat: Number.isFinite(event.lat) ? Number(event.lat.toFixed(5)) : null,
      lon: Number.isFinite(event.lon) ? Number(event.lon.toFixed(5)) : null,
      depthKm: Number.isFinite(event.depthKm) ? Number(event.depthKm.toFixed(4)) : null,
      iterations: Math.trunc(event.iterations || 0),
      networkAggregation: settings.networkAggregation,
      mlvConfig: {
        profileId: mlvCfg.profileId,
        algorithmVersion: mlvCfg.algorithmVersion,
        calibrationStatus: mlvCfg.calibrationStatus,
        regionalApplicability: mlvCfg.regionalApplicability,
        allowExperimentalEvaluation: mlvCfg.allowExperimentalEvaluation,
        distanceMetric: mlvCfg.distanceMetric,
        expectedConvention: mlvCfg.expectedConvention,
        attenuationTable: mlvCfg.attenuationTable,
        minDistanceKm: mlvCfg.minDistanceKm,
        maxDistanceKm: mlvCfg.maxDistanceKm,
        minDepthKm: mlvCfg.minDepthKm,
        maxDepthKm: mlvCfg.maxDepthKm,
        minContributingStations: mlvCfg.minContributingStations,
        stationSelectionPolicy: mlvCfg.stationSelectionPolicy,
      },
      stationCorrections: relevantCorrections,
      picks: event.picks.map((p) => {
        const staCode = p.sta.trim().toUpperCase();
        const stMeta = stationLookup.get(staCode);
        return {
          id: p.id,
          sta: staCode,
          pExcluded: Boolean(p.pExcluded),
          delta: Number.isFinite(p.delta) ? Number(p.delta.toFixed(4)) : null,
          pickLat: Number.isFinite(p.lat) ? Number(p.lat.toFixed(5)) : null,
          pickLon: Number.isFinite(p.lon) ? Number(p.lon.toFixed(5)) : null,
          stationLat:
            stMeta && Number.isFinite(stMeta.lat) ? Number(stMeta.lat.toFixed(5)) : null,
          stationLon:
            stMeta && Number.isFinite(stMeta.lon) ? Number(stMeta.lon.toFixed(5)) : null,
        };
      }),
      amplitudeInputs,
    };
    return deterministicHashHex(stableSerialize(payload));
  }

  if (algorithmId === 'ml-local') {
    const mlCfg = settings.mlConfig;
    const amplitudeInputs = selectAmplitudeInputsForAlgorithmFingerprint(
      'ml-local',
      event
    );
    const correctionKeys = new Set<string>();
    for (const p of event.picks) {
      const sta = p.sta.trim().toUpperCase();
      if (sta) correctionKeys.add(sta);
      const net = p.atlasMetadata?.network?.trim().toUpperCase() ?? '';
      if (net && sta) correctionKeys.add(`${net}.${sta}`);
    }
    for (const m of event.amplitudeMeasurements ?? []) {
      const sta = m.stationCode.trim().toUpperCase();
      const net = m.networkCode.trim().toUpperCase();
      const loc = m.locationCode.trim().toUpperCase();
      if (sta) correctionKeys.add(sta);
      if (net && sta) correctionKeys.add(`${net}.${sta}`);
      if (net && sta && loc) correctionKeys.add(`${net}.${sta}.${loc}`);
    }
    const relevantCorrections = Array.from(correctionKeys)
      .sort()
      .map((key) => [key, mlCfg.stationCorrections[key] ?? null]);

    const payload = {
      algorithmId,
      lat: Number.isFinite(event.lat) ? Number(event.lat.toFixed(5)) : null,
      lon: Number.isFinite(event.lon) ? Number(event.lon.toFixed(5)) : null,
      depthKm: Number.isFinite(event.depthKm) ? Number(event.depthKm.toFixed(4)) : null,
      iterations: Math.trunc(event.iterations || 0),
      networkAggregation: settings.networkAggregation,
      mlConfig: {
        profileId: mlCfg.profileId,
        algorithmVersion: mlCfg.algorithmVersion,
        calibrationStatus: mlCfg.calibrationStatus,
        scientificReference: mlCfg.scientificReference,
        regionalApplicability: mlCfg.regionalApplicability,
        allowExperimentalEvaluation: mlCfg.allowExperimentalEvaluation,
        distanceMetric: mlCfg.distanceMetric,
        expectedConvention: mlCfg.expectedConvention,
        horizontalCombination: mlCfg.horizontalCombination,
        requiredHorizontalComponents: mlCfg.requiredHorizontalComponents,
        attenuationTable: mlCfg.attenuationTable,
        minDistanceKm: mlCfg.minDistanceKm,
        maxDistanceKm: mlCfg.maxDistanceKm,
        minDepthKm: mlCfg.minDepthKm,
        maxDepthKm: mlCfg.maxDepthKm,
        minContributingStations: mlCfg.minContributingStations,
        stationSelectionPolicy: mlCfg.stationSelectionPolicy,
      },
      stationCorrections: relevantCorrections,
      picks: event.picks.map((p) => {
        const staCode = p.sta.trim().toUpperCase();
        const stMeta = stationLookup.get(staCode);
        return {
          id: p.id,
          sta: staCode,
          pExcluded: Boolean(p.pExcluded),
          delta: Number.isFinite(p.delta) ? Number(p.delta.toFixed(4)) : null,
          pickLat: Number.isFinite(p.lat) ? Number(p.lat.toFixed(5)) : null,
          pickLon: Number.isFinite(p.lon) ? Number(p.lon.toFixed(5)) : null,
          stationLat:
            stMeta && Number.isFinite(stMeta.lat) ? Number(stMeta.lat.toFixed(5)) : null,
          stationLon:
            stMeta && Number.isFinite(stMeta.lon) ? Number(stMeta.lon.toFixed(5)) : null,
        };
      }),
      amplitudeInputs,
    };
    return deterministicHashHex(stableSerialize(payload));
  }

  if (algorithmId === 'mb-body' || algorithmId === 'ms-20') {
    const amplitudeInputs = selectAmplitudeInputsForAlgorithmFingerprint(
      algorithmId as FutureAmplitudeAlgorithmId,
      event
    );
    const payload = {
      algorithmId,
      lat: Number.isFinite(event.lat) ? Number(event.lat.toFixed(5)) : null,
      lon: Number.isFinite(event.lon) ? Number(event.lon.toFixed(5)) : null,
      depthKm: Number.isFinite(event.depthKm) ? Number(event.depthKm.toFixed(4)) : null,
      amplitudeInputs,
    };
    return deterministicHashHex(stableSerialize(payload));
  }

  return deterministicHashHex(stableSerialize({ algorithmId }));
}

export function computeHistoricalBaselineFingerprint(
  event: EQPEvent,
  stations: ReadonlyArray<StationMeta> = []
): string {
  const stationLookup = new Map<string, StationMeta>();
  for (const st of stations) {
    const code = st.code.trim().toUpperCase();
    if (code && !stationLookup.has(code)) {
      stationLookup.set(code, st);
    }
  }
  const payload = {
    lat: Number.isFinite(event.lat) ? Number(event.lat.toFixed(5)) : null,
    lon: Number.isFinite(event.lon) ? Number(event.lon.toFixed(5)) : null,
    depthKm: Number.isFinite(event.depthKm) ? Number(event.depthKm.toFixed(4)) : null,
    iterations: Math.trunc(event.iterations || 0),
    preferredScale: event.preferredScale,
    picks: event.picks.map((p) => {
      const staCode = p.sta.trim().toUpperCase();
      const stMeta = stationLookup.get(staCode);
      return {
        id: p.id,
        sta: staCode,
        pTime: p.pTime.trim(),
        pExcluded: Boolean(p.pExcluded),
        duration:
          p.duration !== null && p.duration !== undefined && Number.isFinite(p.duration)
            ? Number(p.duration)
            : null,
        durationSource: p.durationSource ?? null,
        delta: Number.isFinite(p.delta) ? Number(p.delta.toFixed(4)) : null,
        magExcluded: p.magExcluded ?? null,
        stationLat: stMeta && Number.isFinite(stMeta.lat) ? Number(stMeta.lat.toFixed(5)) : null,
        stationLon: stMeta && Number.isFinite(stMeta.lon) ? Number(stMeta.lon.toFixed(5)) : null,
      };
    }),
  };
  return deterministicHashHex(stableSerialize(payload));
}

export function computeCalculationIdentity(params: {
  algorithmId: MagnitudeAlgorithmId;
  evaluation: Pick<
    AlgorithmMagnitudeEvaluation,
    | 'scale'
    | 'status'
    | 'networkMagnitude'
    | 'rawNetworkMagnitude'
    | 'calibrationStatus'
    | 'calibrationProfileId'
    | 'algorithmVersion'
    | 'aggregationUsed'
    | 'contributingStations'
  >;
  inputFingerprint: string;
}): string {
  const { algorithmId, evaluation, inputFingerprint } = params;
  return deterministicHashHex(
    stableSerialize({
      algorithmId,
      scale: evaluation.scale,
      status: evaluation.status,
      networkMagnitude: evaluation.networkMagnitude,
      rawNetworkMagnitude: evaluation.rawNetworkMagnitude,
      calibrationStatus: evaluation.calibrationStatus,
      calibrationProfileId: evaluation.calibrationProfileId,
      algorithmVersion: evaluation.algorithmVersion,
      aggregationUsed: evaluation.aggregationUsed,
      contributingStations: evaluation.contributingStations,
      inputFingerprint,
    })
  );
}

export function approveUncalibratedMagnitudeMetadata(
  metadata: EventMagnitudeMetadata,
  approved: boolean
): EventMagnitudeMetadata {
  if (!approved) {
    return {
      ...metadata,
      analystApprovedUncalibrated: false,
      approvedCalculationId: undefined,
    };
  }
  const calcId = metadata.currentCalculationId;
  if (!calcId) {
    return {
      ...metadata,
      analystApprovedUncalibrated: false,
      approvedCalculationId: undefined,
    };
  }
  return {
    ...metadata,
    analystApprovedUncalibrated: true,
    approvedCalculationId: calcId,
  };
}

export function hasValidUncalibratedApproval(
  metadata: EventMagnitudeMetadata | undefined | null
): boolean {
  if (!metadata || !metadata.analystApprovedUncalibrated) return false;
  if (!metadata.approvedCalculationId || !metadata.currentCalculationId) {
    return false;
  }
  return metadata.approvedCalculationId === metadata.currentCalculationId;
}

export function buildHistoricalSavedMagnitudeMetadata(params: {
  event: EQPEvent;
  evaluatedAt?: string;
}): EventMagnitudeMetadata {
  const { event, evaluatedAt = new Date().toISOString() } = params;
  const legacyValue =
    event.preferredScale === 'Ms'
      ? event.ms
      : event.preferredScale === 'Mb'
        ? event.mb
        : event.md;
  const hasValue = Number.isFinite(legacyValue) && legacyValue > 0;
  const shortScale = formatLegacyScaleShort(event.preferredScale);

  return {
    preferredMethodId: 'eqp-legacy-ms',
    isPerEventOverride: false,
    analystApprovedUncalibrated: false,
    originState: 'historical_saved',
    selectedScale: shortScale,
    selectedMagnitude: hasValue ? Number(legacyValue.toFixed(1)) : null,
    selectedStatus: hasValue ? 'valid' : 'missing_measurement',
    selectedStatusReason: hasValue
      ? null
      : 'Historical saved file recorded no computed magnitude value.',
    contributingStations: event.picks.filter(
      (p) => !p.pExcluded && p.pTime.trim() !== '' && (p.duration ?? 0) > 0
    ).length,
    aggregationMethod: 'eqp-legacy-k-sigma-mean',
    calibrationProfileId: 'eqp-legacy-historical',
    calibrationStatus: 'legacy_compatibility',
    algorithmVersion: 'EQP-Legacy-Historical',
    provenanceSummary: `Historical saved ${formatLegacyScaleLong(event.preferredScale)} result loaded from archive`,
    suggestedAlternative: null,
    resultsByAlgorithm: {},
    evaluatedAt,
  };
}

export interface ResolvedEventMethodSelection {
  mode: EventMethodSelectionMode;
  selectedMethods: MagnitudeAlgorithmId[];
  preferredMethodId: MagnitudeAlgorithmId;
  preferredSelectionLocked: boolean;
  isPerEventOverride: boolean;
  hasAnySelectedMethod: boolean;
}

function normalizeImplementedMethods(
  ids: ReadonlyArray<MagnitudeAlgorithmId> | undefined | null
): MagnitudeAlgorithmId[] {
  if (!Array.isArray(ids)) return [];
  const typedIds = ids as ReadonlyArray<MagnitudeAlgorithmId>;
  const seen = new Set<MagnitudeAlgorithmId>();
  const out: MagnitudeAlgorithmId[] = [];
  for (const id of typedIds) {
    const desc = MAGNITUDE_ALGORITHM_BY_ID[id];
    if (desc && desc.implemented && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

export function resolveEventMethodSelection(
  eventOrMetadata: Pick<EQPEvent, 'magnitudeMetadata'> | EventMagnitudeMetadata | undefined | null,
  settings: MagnitudeSettings
): ResolvedEventMethodSelection {
  const meta: EventMagnitudeMetadata | undefined | null =
    eventOrMetadata && 'magnitudeMetadata' in eventOrMetadata
      ? eventOrMetadata.magnitudeMetadata
      : (eventOrMetadata as EventMagnitudeMetadata | undefined | null);

  const mode: EventMethodSelectionMode =
    meta?.methodSelectionMode === 'custom' ? 'custom' : 'inherit_global';

  const globalSelected = normalizeImplementedMethods(
    settings.enabledMethods.includes(settings.defaultMethod)
      ? settings.enabledMethods
      : [settings.defaultMethod, ...settings.enabledMethods]
  );

  const selectedMethods =
    mode === 'custom'
      ? normalizeImplementedMethods(meta?.selectedMethods ?? [])
      : globalSelected;

  const preferredSelectionLocked = Boolean(
    meta?.preferredSelectionLocked || meta?.isPerEventOverride
  );

  const candidatePreferred = meta?.preferredMethodId;
  const validLockedPreferred =
    preferredSelectionLocked &&
    candidatePreferred &&
    MAGNITUDE_ALGORITHM_BY_ID[candidatePreferred]?.implemented
      ? candidatePreferred
      : null;

  const preferredMethodId = validLockedPreferred ?? settings.defaultMethod;
  const isPerEventOverride =
    mode === 'custom' ||
    preferredSelectionLocked ||
    preferredMethodId !== settings.defaultMethod;

  return {
    mode,
    selectedMethods,
    preferredMethodId,
    preferredSelectionLocked,
    isPerEventOverride,
    hasAnySelectedMethod: selectedMethods.length > 0,
  };
}

export function isPreferredMethodSelected(
  metadata: EventMagnitudeMetadata | undefined | null,
  settings?: MagnitudeSettings
): boolean {
  if (!metadata) return true;
  if (metadata.methodSelectionMode === 'custom') {
    const selected = normalizeImplementedMethods(metadata.selectedMethods ?? []);
    return selected.includes(metadata.preferredMethodId);
  }
  if (settings) {
    const selected = normalizeImplementedMethods(
      settings.enabledMethods.includes(settings.defaultMethod)
        ? settings.enabledMethods
        : [settings.defaultMethod, ...settings.enabledMethods]
    );
    return selected.includes(metadata.preferredMethodId);
  }
  const res = metadata.resultsByAlgorithm?.[metadata.preferredMethodId];
  if (res && res.selectedForCalculation === false) {
    return false;
  }
  return true;
}

export interface PreferredMethodEligibility {
  eligible: boolean;
  reason: string | null;
}

export function canSelectMethodAsPreferred(
  methodId: MagnitudeAlgorithmId,
  metadata: EventMagnitudeMetadata | undefined | null,
  freshness?: MagnitudeFreshnessInspection | null,
  settings?: MagnitudeSettings
): PreferredMethodEligibility {
  const desc = MAGNITUDE_ALGORITHM_BY_ID[methodId];
  if (!desc || !desc.implemented) {
    return {
      eligible: false,
      reason: `${desc?.shortName ?? methodId} is not yet implemented.`,
    };
  }

  if (!metadata) {
    return {
      eligible: false,
      reason: `Recalculate Magnitude to evaluate ${desc.shortName} before selecting it as preferred.`,
    };
  }

  const mode: EventMethodSelectionMode =
    metadata.methodSelectionMode === 'custom' ? 'custom' : 'inherit_global';

  if (mode === 'custom') {
    const customSelected = normalizeImplementedMethods(metadata.selectedMethods ?? []);
    if (!customSelected.includes(methodId)) {
      return {
        eligible: false,
        reason: `${desc.shortName} is not selected for calculation on this event.`,
      };
    }
  } else if (settings) {
    const globalSelected = normalizeImplementedMethods(
      settings.enabledMethods.includes(settings.defaultMethod)
        ? settings.enabledMethods
        : [settings.defaultMethod, ...settings.enabledMethods]
    );
    if (!globalSelected.includes(methodId)) {
      return {
        eligible: false,
        reason: `${desc.shortName} is not enabled in Global Settings.`,
      };
    }
  }

  const res = metadata.resultsByAlgorithm?.[methodId];
  if (
    !res ||
    res.selectedForCalculation === false ||
    freshness?.pendingEvaluationAlgorithmIds?.includes(methodId)
  ) {
    return {
      eligible: false,
      reason: `Click Recalculate Magnitude to evaluate ${desc.shortName} before selecting it as preferred.`,
    };
  }

  if (freshness?.staleAlgorithmIds?.includes(methodId)) {
    return {
      eligible: false,
      reason: `${desc.shortName} result is stale. Recalculate Magnitude before selecting it as preferred.`,
    };
  }

  if (res.status !== 'valid' || res.networkMagnitude === null) {
    return {
      eligible: false,
      reason:
        res.statusReason ??
        `${desc.shortName} is unavailable (${res.status}).`,
    };
  }

  return { eligible: true, reason: null };
}

export function updateEventMethodSelection(params: {
  metadata: EventMagnitudeMetadata;
  settings: MagnitudeSettings;
  mode: EventMethodSelectionMode;
  selectedMethods: MagnitudeAlgorithmId[];
}): EventMagnitudeMetadata {
  const { metadata, settings, mode } = params;
  const cleanSelected =
    mode === 'custom'
      ? normalizeImplementedMethods(params.selectedMethods)
      : normalizeImplementedMethods(
          settings.enabledMethods.includes(settings.defaultMethod)
            ? settings.enabledMethods
            : [settings.defaultMethod, ...settings.enabledMethods]
        );

  const selectedSet = new Set<MagnitudeAlgorithmId>(cleanSelected);
  const nextResults: Partial<Record<MagnitudeAlgorithmId, AlgorithmMagnitudeEvaluation>> = {};
  for (const [idKey, evalItem] of Object.entries(metadata.resultsByAlgorithm ?? {})) {
    const algId = idKey as MagnitudeAlgorithmId;
    if (!evalItem) continue;
    const isNowSelected = selectedSet.has(algId);
    nextResults[algId] = {
      ...evalItem,
      selectedForCalculation: isNowSelected,
      notSelectedReason: isNowSelected
        ? null
        : 'Deselected for calculation on this event (prior result retained for reference).',
    };
  }

  const preferredStillSelected = selectedSet.has(metadata.preferredMethodId);
  const preferredEval = nextResults[metadata.preferredMethodId];
  const preferredDesc = MAGNITUDE_ALGORITHM_BY_ID[metadata.preferredMethodId];

  const clearPublishability = !preferredStillSelected || cleanSelected.length === 0;
  const clearedReason =
    cleanSelected.length === 0
      ? 'No magnitude calculation methods are selected for this event. Select at least one method and click Recalculate Magnitude.'
      : `${preferredDesc?.shortName ?? metadata.preferredMethodId} is deselected on this event. Re-enable and recalculate, or select another calculated method as preferred.`;

  const isPerEventOverride =
    mode === 'custom' ||
    Boolean(metadata.preferredSelectionLocked) ||
    metadata.preferredMethodId !== settings.defaultMethod;

  if (clearPublishability) {
    return {
      ...metadata,
      methodSelectionMode: mode,
      selectedMethods: mode === 'custom' ? cleanSelected : undefined,
      isPerEventOverride,
      analystApprovedUncalibrated: false,
      approvedCalculationId: undefined,
      currentCalculationId: undefined,
      selectedMagnitude: null,
      selectedStatus: 'missing_measurement',
      selectedStatusReason: clearedReason,
      contributingStations: 0,
      suggestedAlternative: null,
      resultsByAlgorithm: nextResults,
    };
  }

  const restorePreferred =
    preferredEval && preferredEval.status === 'valid' && preferredEval.networkMagnitude !== null;

  const restoredCalcId =
    preferredEval && metadata.algorithmFingerprints?.[metadata.preferredMethodId]
      ? computeCalculationIdentity({
          algorithmId: metadata.preferredMethodId,
          evaluation: preferredEval,
          inputFingerprint: metadata.algorithmFingerprints[metadata.preferredMethodId]!,
        })
      : metadata.currentCalculationId;

  return {
    ...metadata,
    methodSelectionMode: mode,
    selectedMethods: mode === 'custom' ? cleanSelected : undefined,
    isPerEventOverride,
    currentCalculationId: restoredCalcId,
    selectedScale: preferredEval?.scale ?? preferredDesc?.scale ?? metadata.selectedScale,
    selectedMagnitude: restorePreferred ? preferredEval!.networkMagnitude : null,
    selectedStatus: preferredEval?.status ?? 'missing_measurement',
    selectedStatusReason:
      preferredEval?.statusReason ??
      (preferredEval
        ? null
        : `Click Recalculate Magnitude to evaluate ${preferredDesc?.shortName ?? metadata.preferredMethodId}.`),
    contributingStations: preferredEval?.contributingStations ?? 0,
    resultsByAlgorithm: nextResults,
  };
}

export function selectPreferredMethodOnEventMetadata(params: {
  methodId: MagnitudeAlgorithmId;
  metadata: EventMagnitudeMetadata;
  freshness?: MagnitudeFreshnessInspection | null;
  settings: MagnitudeSettings;
}): {
  ok: boolean;
  reason: string | null;
  metadata: EventMagnitudeMetadata;
} {
  const { methodId, metadata, freshness, settings } = params;
  const eligibility = canSelectMethodAsPreferred(
    methodId,
    metadata,
    freshness,
    settings
  );
  if (!eligibility.eligible) {
    return {
      ok: false,
      reason: eligibility.reason,
      metadata,
    };
  }

  const chosenEval = metadata.resultsByAlgorithm[methodId]!;
  const fp =
    metadata.algorithmFingerprints?.[methodId] ?? chosenEval.inputFingerprint ?? '';
  const nextCalculationId = fp
    ? computeCalculationIdentity({
        algorithmId: methodId,
        evaluation: chosenEval,
        inputFingerprint: fp,
      })
    : undefined;

  const approvalStillMatches = Boolean(
    metadata.analystApprovedUncalibrated &&
      metadata.approvedCalculationId &&
      nextCalculationId &&
      metadata.approvedCalculationId === nextCalculationId
  );

  return {
    ok: true,
    reason: null,
    metadata: {
      ...metadata,
      preferredMethodId: methodId,
      preferredSelectionLocked: true,
      isPerEventOverride:
        metadata.methodSelectionMode === 'custom' ||
        methodId !== settings.defaultMethod ||
        true,
      analystApprovedUncalibrated: approvalStillMatches,
      approvedCalculationId: approvalStillMatches
        ? metadata.approvedCalculationId
        : undefined,
      currentCalculationId: nextCalculationId,
      inputFingerprint: fp || metadata.inputFingerprint,
      selectedScale: chosenEval.scale,
      selectedMagnitude: chosenEval.networkMagnitude,
      selectedStatus: chosenEval.status,
      selectedStatusReason: chosenEval.statusReason,
      contributingStations: chosenEval.contributingStations,
      aggregationMethod: chosenEval.aggregationUsed,
      calibrationProfileId: chosenEval.calibrationProfileId,
      calibrationStatus: chosenEval.calibrationStatus,
      algorithmVersion: chosenEval.algorithmVersion,
      provenanceSummary: chosenEval.provenanceSummary,
      suggestedAlternative: null,
    },
  };
}

export function inspectMagnitudeFreshness(
  event: EQPEvent,
  metadata: EventMagnitudeMetadata | undefined | null,
  settings: MagnitudeSettings,
  stations: ReadonlyArray<StationMeta> = []
): MagnitudeFreshnessInspection {
  if (!metadata) {
    if (event.historicalMagnitudeBaseline) {
      const currentBase = computeHistoricalBaselineFingerprint(event, stations);
      if (currentBase !== event.historicalMagnitudeBaseline) {
        return {
          status: 'historical_modified',
          badgeLabel: 'Recalculation Required',
          isStale: true,
          isHistoricalSaved: true,
          preferredIsStale: true,
          staleAlgorithmIds: ['eqp-legacy-ms'],
          pendingEvaluationAlgorithmIds: [],
          reasons: [
            'Station observations or event parameters changed after loading this historical EQP file.',
          ],
        };
      }
      return {
        status: 'historical_saved',
        badgeLabel: 'Historical Saved Result',
        isStale: false,
        isHistoricalSaved: true,
        preferredIsStale: false,
        staleAlgorithmIds: [],
        pendingEvaluationAlgorithmIds: [],
        reasons: [],
      };
    }

    return {
      status: 'current',
      badgeLabel: 'Current',
      isStale: false,
      isHistoricalSaved: false,
      preferredIsStale: false,
      staleAlgorithmIds: [],
      pendingEvaluationAlgorithmIds: [],
      reasons: [],
    };
  }

  const reasons: string[] = [];
  const staleSet = new Set<MagnitudeAlgorithmId>();
  const pendingSet = new Set<MagnitudeAlgorithmId>();
  const selection = resolveEventMethodSelection(metadata, settings);
  const selectedSet = new Set<MagnitudeAlgorithmId>(selection.selectedMethods);

  if (
    metadata.originState === 'historical_saved' &&
    (!metadata.algorithmFingerprints || !metadata.algorithmFingerprints[metadata.preferredMethodId])
  ) {
    if (event.historicalMagnitudeBaseline) {
      const currentBase = computeHistoricalBaselineFingerprint(event, stations);
      if (currentBase !== event.historicalMagnitudeBaseline) {
        staleSet.add(metadata.preferredMethodId);
        reasons.push(
          'Station observations or event location parameters changed after opening this historical file.'
        );
      }
    }
    if (
      selection.mode === 'inherit_global' &&
      !selection.preferredSelectionLocked &&
      settings.defaultMethod !== metadata.preferredMethodId
    ) {
      staleSet.add(metadata.preferredMethodId);
      reasons.push(
        `Global default magnitude method changed to ${MAGNITUDE_ALGORITHM_BY_ID[settings.defaultMethod]?.scientificLabel ?? settings.defaultMethod}.`
      );
    }
    for (const algId of selection.selectedMethods) {
      if (algId === metadata.preferredMethodId) continue;
      if (!metadata.resultsByAlgorithm?.[algId]) {
        pendingSet.add(algId);
      }
    }
    const isModified = staleSet.size > 0;
    return {
      status: isModified ? 'historical_modified' : 'historical_saved',
      badgeLabel: isModified ? 'Recalculation Required' : 'Historical Saved Result',
      isStale: isModified,
      isHistoricalSaved: true,
      preferredIsStale: isModified,
      staleAlgorithmIds: Array.from(staleSet),
      pendingEvaluationAlgorithmIds: Array.from(pendingSet),
      reasons,
    };
  }

  const fingerprints = metadata.algorithmFingerprints ?? {};
  const checkedIds = new Set<MagnitudeAlgorithmId>();
  if (selectedSet.has(metadata.preferredMethodId)) {
    checkedIds.add(metadata.preferredMethodId);
  }
  for (const algId of selection.selectedMethods) {
    checkedIds.add(algId);
  }
  for (const fpId of Object.keys(fingerprints) as MagnitudeAlgorithmId[]) {
    const res = metadata.resultsByAlgorithm?.[fpId];
    if (
      res?.selectedForCalculation !== false &&
      (selection.mode === 'inherit_global' || selectedSet.has(fpId))
    ) {
      checkedIds.add(fpId);
    }
  }

  for (const algId of checkedIds) {
    const savedRes = metadata.resultsByAlgorithm?.[algId];
    const savedFp =
      fingerprints[algId] ??
      (algId === metadata.preferredMethodId ? metadata.inputFingerprint : undefined);

    if (!savedFp || !savedRes || savedRes.selectedForCalculation === false) {
      if (selectedSet.has(algId)) {
        pendingSet.add(algId);
        if (algId === metadata.preferredMethodId) {
          staleSet.add(algId);
          reasons.push(
            `${MAGNITUDE_ALGORITHM_BY_ID[algId]?.shortName ?? algId} has not been calculated for the current selection.`
          );
        }
      }
      continue;
    }

    const liveFp = computeAlgorithmInputFingerprint(algId, event, settings, stations);
    if (liveFp !== savedFp) {
      staleSet.add(algId);
      reasons.push(
        algId === 'eqp-legacy-ms'
          ? 'EQP Legacy magnitude inputs (durations, picks, exclusions, or K·σ threshold) changed since last evaluation.'
          : `${MAGNITUDE_ALGORITHM_BY_ID[algId]?.shortName ?? algId} inputs, location, or calibration settings changed since last evaluation.`
      );
    }
  }

  if (
    selection.mode === 'inherit_global' &&
    !selection.preferredSelectionLocked &&
    metadata.globalDefaultAtEvaluation &&
    metadata.globalDefaultAtEvaluation !== settings.defaultMethod
  ) {
    staleSet.add(metadata.preferredMethodId);
    reasons.push(
      `Global default magnitude method changed from ${MAGNITUDE_ALGORITHM_BY_ID[metadata.globalDefaultAtEvaluation]?.shortName ?? metadata.globalDefaultAtEvaluation} to ${MAGNITUDE_ALGORITHM_BY_ID[settings.defaultMethod]?.shortName ?? settings.defaultMethod}.`
    );
  }

  const preferredIsStale =
    selectedSet.has(metadata.preferredMethodId) &&
    (staleSet.has(metadata.preferredMethodId) || pendingSet.has(metadata.preferredMethodId));
  const isHistorical = metadata.originState === 'historical_saved';

  if (preferredIsStale) {
    return {
      status: isHistorical ? 'historical_modified' : 'recalculation_required',
      badgeLabel: 'Recalculation Required',
      isStale: true,
      isHistoricalSaved: isHistorical,
      preferredIsStale: true,
      staleAlgorithmIds: Array.from(staleSet),
      pendingEvaluationAlgorithmIds: Array.from(pendingSet),
      reasons,
    };
  }

  return {
    status: isHistorical ? 'historical_saved' : 'current',
    badgeLabel: isHistorical ? 'Historical Saved Result' : 'Current',
    isStale: false,
    isHistoricalSaved: isHistorical,
    preferredIsStale: false,
    staleAlgorithmIds: Array.from(staleSet),
    pendingEvaluationAlgorithmIds: Array.from(pendingSet),
    reasons,
  };
}

export function evaluateEventMagnitudes(params: {
  event: EQPEvent;
  settings: MagnitudeSettings;
  stations?: ReadonlyArray<StationMeta>;
  preferredMethodOverride?: MagnitudeAlgorithmId | null;
  methodSelectionModeOverride?: EventMethodSelectionMode;
  selectedMethodsOverride?: MagnitudeAlgorithmId[];
  preferredSelectionLockedOverride?: boolean;
  analystApprovedUncalibrated?: boolean;
  evaluatedAt?: string;
}): EventMagnitudeMetadata {
  const {
    event,
    settings,
    stations = [],
    preferredMethodOverride,
    methodSelectionModeOverride,
    selectedMethodsOverride,
    preferredSelectionLockedOverride,
    analystApprovedUncalibrated,
    evaluatedAt = new Date().toISOString(),
  } = params;

  const previousMeta = event.magnitudeMetadata;
  const methodSelectionMode: EventMethodSelectionMode =
    methodSelectionModeOverride ??
    (previousMeta?.methodSelectionMode === 'custom' ? 'custom' : 'inherit_global');

  const preferredSelectionLocked =
    preferredSelectionLockedOverride !== undefined
      ? preferredSelectionLockedOverride
      : preferredMethodOverride === null
        ? false
        : preferredMethodOverride !== undefined
          ? preferredMethodOverride !== settings.defaultMethod
          : Boolean(previousMeta?.preferredSelectionLocked || previousMeta?.isPerEventOverride);

  const preferredMethodId: MagnitudeAlgorithmId =
    preferredMethodOverride === null
      ? settings.defaultMethod
      : preferredMethodOverride ??
        (preferredSelectionLocked && previousMeta?.preferredMethodId
          ? previousMeta.preferredMethodId
          : settings.defaultMethod);

  const selectedMethods: MagnitudeAlgorithmId[] =
    selectedMethodsOverride !== undefined
      ? normalizeImplementedMethods(selectedMethodsOverride)
      : methodSelectionMode === 'custom'
        ? normalizeImplementedMethods(previousMeta?.selectedMethods ?? [])
        : normalizeImplementedMethods(
            settings.enabledMethods.includes(settings.defaultMethod)
              ? settings.enabledMethods
              : [settings.defaultMethod, ...settings.enabledMethods]
          );

  const isPerEventOverride =
    methodSelectionMode === 'custom' ||
    preferredSelectionLocked ||
    preferredMethodId !== settings.defaultMethod;

  const toEvaluate = new Set<MagnitudeAlgorithmId>();
  if (methodSelectionMode === 'custom' || selectedMethodsOverride !== undefined) {
    for (const id of selectedMethods) {
      toEvaluate.add(id);
    }
  } else {
    for (const id of settings.enabledMethods) {
      toEvaluate.add(id);
    }
    toEvaluate.add(settings.defaultMethod);
    toEvaluate.add(preferredMethodId);
  }

  const resultsByAlgorithm: Partial<
    Record<MagnitudeAlgorithmId, AlgorithmMagnitudeEvaluation>
  > = {};
  const algorithmFingerprints: Partial<Record<MagnitudeAlgorithmId, string>> = {};

  for (const id of toEvaluate) {
    const fp = computeAlgorithmInputFingerprint(id, event, settings, stations);
    algorithmFingerprints[id] = fp;
    try {
      const evaluated = evaluateMagnitudeAlgorithm(id, event, settings, stations);
      resultsByAlgorithm[id] = {
        ...evaluated,
        inputFingerprint: fp,
        selectedForCalculation: true,
        notSelectedReason: null,
      };
    } catch (err) {
      const desc = MAGNITUDE_ALGORITHM_BY_ID[id];
      resultsByAlgorithm[id] = {
        algorithmId: id,
        displayName: desc.displayName,
        scientificLabel: desc.scientificLabel,
        scale: desc.scale,
        status: 'calculation_failure',
        statusReason:
          err instanceof Error
            ? err.message
            : 'Unexpected calculation error during magnitude evaluation.',
        networkMagnitude: null,
        rawNetworkMagnitude: null,
        contributingStations: 0,
        totalEligibleStations: 0,
        excludedStations: 0,
        invalidStations: 0,
        aggregationUsed: settings.networkAggregation,
        trimmedCount: 0,
        fallbackApplied: false,
        calibrationProfileId: 'error',
        calibrationStatus: 'pending_calibration',
        algorithmVersion: desc.version,
        provenanceSummary: 'Calculation failure',
        isAuthoritativeForBulletin: false,
        inputFingerprint: fp,
        selectedForCalculation: true,
        notSelectedReason: null,
        stationDetails: [],
      };
    }
  }

  // Carry forward prior historical/calculated results for deselected methods without treating them as newly calculated current results
  if (previousMeta?.resultsByAlgorithm) {
    for (const [prevKey, prevEval] of Object.entries(previousMeta.resultsByAlgorithm)) {
      const prevId = prevKey as MagnitudeAlgorithmId;
      if (!prevEval || toEvaluate.has(prevId)) continue;
      resultsByAlgorithm[prevId] = {
        ...prevEval,
        selectedForCalculation: false,
        notSelectedReason:
          'Deselected for calculation on this event (prior result retained for reference).',
      };
      const prevFp = previousMeta.algorithmFingerprints?.[prevId] ?? prevEval.inputFingerprint;
      if (prevFp) {
        algorithmFingerprints[prevId] = prevFp;
      }
    }
  }

  const isPreferredSelected =
    selectedMethods.length > 0 && toEvaluate.has(preferredMethodId);

  let suggestedAlternative: AlternativeMagnitudeSuggestion | null = null;

  if (!isPreferredSelected) {
    const preferredDesc = MAGNITUDE_ALGORITHM_BY_ID[preferredMethodId];
    const reasonText =
      selectedMethods.length === 0
        ? 'No magnitude calculation methods are selected for this event. Select at least one method and recalculate.'
        : `${preferredDesc?.shortName ?? preferredMethodId} is not selected for calculation on this event. Enable it or choose a calculated method as preferred.`;

    if (settings.suggestAlternativeIfUnavailable && selectedMethods.length > 0) {
      for (const candidateId of selectedMethods) {
        if (candidateId === preferredMethodId) continue;
        const res = resultsByAlgorithm[candidateId];
        if (res && res.selectedForCalculation !== false && res.status === 'valid' && res.networkMagnitude !== null) {
          suggestedAlternative = {
            algorithmId: candidateId,
            displayName: res.scientificLabel,
            scale: res.scale,
            magnitude: res.networkMagnitude,
            calibrationStatus: res.calibrationStatus,
            reason: `${preferredDesc.shortName} is not selected; ${res.scientificLabel} is available (${res.contributingStations} station${res.contributingStations === 1 ? '' : 's'}).`,
          };
          break;
        }
      }
    }

    return {
      preferredMethodId,
      isPerEventOverride,
      methodSelectionMode,
      ...(methodSelectionMode === 'custom' ? { selectedMethods } : {}),
      preferredSelectionLocked,
      analystApprovedUncalibrated: false,
      approvedCalculationId: undefined,
      currentCalculationId: undefined,
      originState: 'computed_current',
      globalDefaultAtEvaluation: settings.defaultMethod,
      inputFingerprint: undefined,
      algorithmFingerprints,
      selectedScale: preferredDesc?.scale ?? 'Ms',
      selectedMagnitude: null,
      selectedStatus: 'missing_measurement',
      selectedStatusReason: reasonText,
      contributingStations: 0,
      aggregationMethod: settings.networkAggregation,
      calibrationProfileId: 'none-selected',
      calibrationStatus: 'pending_calibration',
      algorithmVersion: preferredDesc?.version ?? 'none',
      provenanceSummary: reasonText,
      suggestedAlternative,
      resultsByAlgorithm,
      evaluatedAt,
    };
  }

  const preferredFingerprint =
    algorithmFingerprints[preferredMethodId] ??
    computeAlgorithmInputFingerprint(preferredMethodId, event, settings, stations);
  const preferredResult =
    resultsByAlgorithm[preferredMethodId] ?? {
      ...evaluateMagnitudeAlgorithm(preferredMethodId, event, settings, stations),
      inputFingerprint: preferredFingerprint,
      selectedForCalculation: true,
      notSelectedReason: null,
    };

  const currentCalculationId = computeCalculationIdentity({
    algorithmId: preferredMethodId,
    evaluation: preferredResult,
    inputFingerprint: preferredFingerprint,
  });

  if (
    settings.suggestAlternativeIfUnavailable &&
    preferredResult.status !== 'valid'
  ) {
    const candidatePriority: MagnitudeAlgorithmId[] = [
      'eqp-legacy-ms',
      'mlv-vertical',
      'ml-local',
      'md-duration',
      ...selectedMethods,
    ];
    const seen = new Set<MagnitudeAlgorithmId>([preferredMethodId]);
    for (const candidateId of candidatePriority) {
      if (seen.has(candidateId)) continue;
      seen.add(candidateId);
      const res = resultsByAlgorithm[candidateId];
      if (
        res &&
        res.selectedForCalculation !== false &&
        res.status === 'valid' &&
        res.networkMagnitude !== null
      ) {
        suggestedAlternative = {
          algorithmId: candidateId,
          displayName: res.scientificLabel,
          scale: res.scale,
          magnitude: res.networkMagnitude,
          calibrationStatus: res.calibrationStatus,
          reason: `${MAGNITUDE_ALGORITHM_BY_ID[preferredMethodId].shortName} unavailable (${preferredResult.statusReason ?? preferredResult.status}); ${res.scientificLabel} is available (${res.contributingStations} station${res.contributingStations === 1 ? '' : 's'}).`,
        };
        break;
      }
    }
  }

  const previousApprovalStillValid = Boolean(
    previousMeta?.analystApprovedUncalibrated &&
      previousMeta.approvedCalculationId &&
      previousMeta.approvedCalculationId === currentCalculationId
  );

  const nextApproved =
    analystApprovedUncalibrated !== undefined
      ? Boolean(analystApprovedUncalibrated)
      : previousApprovalStillValid;

  const approvedCalculationId = nextApproved ? currentCalculationId : undefined;

  return {
    preferredMethodId,
    isPerEventOverride,
    methodSelectionMode,
    ...(methodSelectionMode === 'custom' ? { selectedMethods } : {}),
    preferredSelectionLocked,
    analystApprovedUncalibrated: nextApproved,
    approvedCalculationId,
    currentCalculationId,
    originState: 'computed_current',
    globalDefaultAtEvaluation: settings.defaultMethod,
    inputFingerprint: preferredFingerprint,
    algorithmFingerprints,
    selectedScale: preferredResult.scale,
    selectedMagnitude: preferredResult.networkMagnitude,
    selectedStatus: preferredResult.status,
    selectedStatusReason: preferredResult.statusReason,
    contributingStations: preferredResult.contributingStations,
    aggregationMethod: preferredResult.aggregationUsed,
    calibrationProfileId: preferredResult.calibrationProfileId,
    calibrationStatus: preferredResult.calibrationStatus,
    algorithmVersion: preferredResult.algorithmVersion,
    provenanceSummary: preferredResult.provenanceSummary,
    suggestedAlternative,
    resultsByAlgorithm,
    evaluatedAt,
  };
}

export interface BulletinMagnitudeResolution {
  displayText: string;
  scaleLabel: string;
  provenanceLabel: string;
  value: number | null;
  isAuthoritative: boolean;
  requiresAnalystConfirmation: boolean;
  isStale: boolean;
  isHistoricalSaved: boolean;
  canPublish: boolean;
  warning: string | null;
}

export function resolveBulletinMagnitude(
  event: EQPEvent,
  freshness?: MagnitudeFreshnessInspection
): BulletinMagnitudeResolution {
  const unlocated = isEventUnlocated(event);
  const meta = event.magnitudeMetadata;
  const isStale = Boolean(freshness?.isStale);
  const isHistoricalSaved = Boolean(
    freshness?.isHistoricalSaved || meta?.originState === 'historical_saved'
  );

  if (isStale) {
    const scaleLabel =
      !meta || meta.preferredMethodId === 'eqp-legacy-ms'
        ? formatLegacyScaleShort(event.preferredScale)
        : meta.selectedScale || 'Md';
    const provenanceLabel =
      !meta || meta.preferredMethodId === 'eqp-legacy-ms'
        ? formatLegacyScaleLong(event.preferredScale)
        : MAGNITUDE_ALGORITHM_BY_ID[meta.preferredMethodId]?.scientificLabel ?? scaleLabel;

    return {
      displayText: 'Pending (Recalculation required)',
      scaleLabel,
      provenanceLabel,
      value: null,
      isAuthoritative: false,
      requiresAnalystConfirmation: false,
      isStale: true,
      isHistoricalSaved,
      canPublish: false,
      warning:
        freshness?.reasons[0] ??
        'Magnitude inputs or configuration changed since last calculation. Recalculate before publishing.',
    };
  }

  if (meta && !isPreferredMethodSelected(meta)) {
    const scaleLabel =
      meta.preferredMethodId === 'eqp-legacy-ms'
        ? formatLegacyScaleShort(event.preferredScale)
        : meta.selectedScale ||
          MAGNITUDE_ALGORITHM_BY_ID[meta.preferredMethodId]?.scale ||
          'Ms';
    const provenanceLabel =
      meta.preferredMethodId === 'eqp-legacy-ms'
        ? formatLegacyScaleLong(event.preferredScale)
        : MAGNITUDE_ALGORITHM_BY_ID[meta.preferredMethodId]?.scientificLabel ?? scaleLabel;
    return {
      displayText: 'Pending',
      scaleLabel,
      provenanceLabel,
      value: null,
      isAuthoritative: false,
      requiresAnalystConfirmation: false,
      isStale: false,
      isHistoricalSaved,
      canPublish: false,
      warning:
        meta.selectedStatusReason ??
        'Preferred magnitude method is not selected for calculation on this event.',
    };
  }

  if (!meta || meta.preferredMethodId === 'eqp-legacy-ms') {
    const legacyValue =
      event.preferredScale === 'Ms'
        ? event.ms
        : event.preferredScale === 'Mb'
          ? event.mb
          : event.md;
    const scaleLabel = formatLegacyScaleShort(event.preferredScale);
    const provenanceLabel = formatLegacyScaleLong(event.preferredScale);
    const isPending =
      (unlocated && legacyValue === 0) ||
      (meta?.preferredMethodId === 'eqp-legacy-ms' &&
        meta.selectedStatus !== 'valid' &&
        (legacyValue === 0 || meta.originState === 'computed_current'));

    if (isPending) {
      return {
        displayText: 'Pending',
        scaleLabel,
        provenanceLabel,
        value: null,
        isAuthoritative: false,
        requiresAnalystConfirmation: false,
        isStale: false,
        isHistoricalSaved,
        canPublish: false,
        warning: meta?.selectedStatusReason ?? null,
      };
    }

    return {
      displayText: `${scaleLabel} ${legacyValue.toFixed(1)}`,
      scaleLabel,
      provenanceLabel,
      value: legacyValue,
      isAuthoritative: true,
      requiresAnalystConfirmation: false,
      isStale: false,
      isHistoricalSaved,
      canPublish: true,
      warning: isHistoricalSaved
        ? 'Historical saved legacy magnitude loaded from file.'
        : null,
    };
  }

  const scaleLabel = meta.selectedScale || 'Md';
  const provenanceLabel =
    MAGNITUDE_ALGORITHM_BY_ID[meta.preferredMethodId]?.scientificLabel ?? scaleLabel;

  if (meta.selectedStatus !== 'valid' || meta.selectedMagnitude === null) {
    return {
      displayText: 'Pending',
      scaleLabel,
      provenanceLabel,
      value: null,
      isAuthoritative: false,
      requiresAnalystConfirmation: false,
      isStale: false,
      isHistoricalSaved,
      canPublish: false,
      warning:
        meta.selectedStatusReason ??
        `${scaleLabel} magnitude is unavailable (${meta.selectedStatus}).`,
    };
  }

  const isUncalibrated =
    meta.calibrationStatus === 'experimental_uncalibrated' ||
    meta.calibrationStatus === 'pending_calibration';

  if (isUncalibrated) {
    const validApproval = hasValidUncalibratedApproval(meta);
    if (!validApproval) {
      const legacyUntiedApproval = Boolean(meta.analystApprovedUncalibrated);
      return {
        displayText: `Pending (${scaleLabel} uncalibrated)`,
        scaleLabel,
        provenanceLabel,
        value: null,
        isAuthoritative: false,
        requiresAnalystConfirmation: true,
        isStale: false,
        isHistoricalSaved,
        canPublish: false,
        warning: legacyUntiedApproval
          ? `Prior uncalibrated ${scaleLabel} approval is missing a matching calculation identity; re-confirm ${meta.selectedMagnitude.toFixed(1)} before bulletin release.`
          : `Experimental / uncalibrated ${scaleLabel} (${meta.selectedMagnitude.toFixed(1)}) requires explicit analyst confirmation before bulletin publication.`,
      };
    }

    return {
      displayText: `${scaleLabel} ${meta.selectedMagnitude.toFixed(1)} (Experimental / Uncalibrated)`,
      scaleLabel,
      provenanceLabel: `${provenanceLabel} (Experimental / Uncalibrated)`,
      value: meta.selectedMagnitude,
      isAuthoritative: false,
      requiresAnalystConfirmation: false,
      isStale: false,
      isHistoricalSaved,
      canPublish: true,
      warning: `Experimental / uncalibrated ${scaleLabel} confirmed by analyst for current calculation.`,
    };
  }

  return {
    displayText: `${scaleLabel} ${meta.selectedMagnitude.toFixed(1)}`,
    scaleLabel,
    provenanceLabel,
    value: meta.selectedMagnitude,
    isAuthoritative: meta.calibrationStatus === 'calibrated',
    requiresAnalystConfirmation: false,
    isStale: false,
    isHistoricalSaved,
    canPublish: true,
    warning: null,
  };
}
