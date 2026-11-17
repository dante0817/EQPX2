import {
  isEventUnlocated,
  type EQPEvent,
  type StationMeta,
  type StationPick,
} from '../data/eqpData.ts';
import {
  isValidSeedChannelCode,
  validateAmplitudeMeasurement,
  type AmplitudeMeasurement,
} from './amplitudeMeasurements.ts';
import {
  aggregateStationMagnitudes,
  type NetworkAggregationMethod,
} from './magnitudeAggregation.ts';
import {
  convertDisplacementToMm,
  formatMlvAttenuationTableText,
  haversineDistanceKm,
  interpolateLocalMagnitudeLogA0,
  isVerticalSeedChannel,
  parseMlvAttenuationTableText,
  resolveStationCorrectionHierarchical,
  validateLocalMagnitudeAttenuationProfile,
  type MlvAmplitudeConvention,
  type MlvAttenuationNode,
  type MlvDistanceMetric,
  type MlvProfileValidationResult,
  type MlvStationSelectionPolicy,
} from './mlvMagnitude.ts';
import type {
  AlgorithmMagnitudeEvaluation,
  CalibrationStatus,
  StationMagnitudeEvaluation,
} from './magnitudeEngine.ts';

export type MlAttenuationNode = MlvAttenuationNode;
export type MlDistanceMetric = MlvDistanceMetric;
export type MlAmplitudeConvention = MlvAmplitudeConvention;
export type MlStationSelectionPolicy = MlvStationSelectionPolicy;
export type MlHorizontalCombinationMethod = 'mean' | 'max';
export type MlRequiredHorizontalComponents = 2 | 1;
export type MlProfileValidationResult = MlvProfileValidationResult;

export interface MlCalibrationConfig {
  profileId: string;
  algorithmVersion: string;
  calibrationStatus:
    | 'pending_calibration'
    | 'experimental_uncalibrated'
    | 'calibrated';
  scientificReference: string;
  regionalApplicability: string;
  allowExperimentalEvaluation: boolean;
  distanceMetric: MlDistanceMetric;
  expectedConvention: MlAmplitudeConvention;
  horizontalCombination: MlHorizontalCombinationMethod;
  requiredHorizontalComponents: MlRequiredHorizontalComponents;
  attenuationTable: MlAttenuationNode[];
  minDistanceKm: number | null;
  maxDistanceKm: number | null;
  minDepthKm: number;
  maxDepthKm: number;
  minContributingStations: number;
  stationSelectionPolicy: MlStationSelectionPolicy;
  /**
   * Optional additive station correction Cs in magnitude units:
   * ML_station = log10(A_H_mm) - log10(A0(Delta)) + Cs.
   * Keyed by NET.STA.LOC, NET.STA, or STA (checked in that order).
   */
  stationCorrections: Record<string, number>;
}

export const ML_ALGORITHM_DISPLAY = {
  algorithmId: 'ml-local' as const,
  shortName: 'ML',
  scale: 'ML',
  displayName: 'ML — Local Magnitude (Horizontal)',
  scientificLabel: 'ML — Local Magnitude',
  version: 'ML-1.0.0',
};

export const DEFAULT_ML_CONFIG: MlCalibrationConfig = {
  profileId: 'ph-ml-pending-v1',
  algorithmVersion: 'ML-1.0.0',
  calibrationStatus: 'pending_calibration',
  scientificReference: 'SeisComP Standard ML (pending Philippine calibration)',
  regionalApplicability:
    'Philippine Seismic Network (Official ML Attenuation Pending Calibration)',
  allowExperimentalEvaluation: false,
  distanceMetric: 'epicentral_km',
  expectedConvention: 'zero_to_peak',
  horizontalCombination: 'mean',
  requiredHorizontalComponents: 2,
  attenuationTable: [],
  minDistanceKm: null,
  maxDistanceKm: null,
  minDepthKm: 0,
  maxDepthKm: 700,
  minContributingStations: 1,
  stationSelectionPolicy: 'deterministic_priority',
  stationCorrections: {},
};

/**
 * Explicit non-Philippine reference / experimental example attenuation table from
 * SeisComP Global ML documentation: (0:-1.3, 60:-2.8, 100:-3.0, 400:-4.5, 1000:-5.85).
 * NEVER active by default and NEVER labeled as an official Philippine calibration.
 */
export const SEISCOMP_REFERENCE_ML_PROFILE: MlCalibrationConfig = {
  profileId: 'seiscomp-ml-reference-example-experimental',
  algorithmVersion: 'ML-1.0.0',
  calibrationStatus: 'experimental_uncalibrated',
  scientificReference:
    'SeisComP Global ML Documentation Reference Example (Non-Philippine)',
  regionalApplicability:
    'SeisComP Documentation Reference Example (Non-Philippine / Experimental Testing Only)',
  allowExperimentalEvaluation: true,
  distanceMetric: 'epicentral_km',
  expectedConvention: 'zero_to_peak',
  horizontalCombination: 'mean',
  requiredHorizontalComponents: 2,
  attenuationTable: [
    { distanceKm: 0, logA0: -1.3 },
    { distanceKm: 60, logA0: -2.8 },
    { distanceKm: 100, logA0: -3.0 },
    { distanceKm: 400, logA0: -4.5 },
    { distanceKm: 1000, logA0: -5.85 },
  ],
  minDistanceKm: 0,
  maxDistanceKm: 1000,
  minDepthKm: 0,
  maxDepthKm: 700,
  minContributingStations: 1,
  stationSelectionPolicy: 'deterministic_priority',
  stationCorrections: {},
};

export interface HorizontalChannelOrientationCheck {
  isHorizontal: boolean;
  orientationVerified: boolean;
  channelCode: string;
  bandInstrumentPrefix: string;
  componentKind: 'N' | 'E' | '1' | '2' | 'OTHER' | 'VERTICAL' | 'INVALID';
  azimuthDeg: number | null;
  dipDeg: number | null;
  reason: string | null;
}

export interface MlMeasurementEligibilityResult {
  eligible: boolean;
  excluded: boolean;
  convertedAmplitudeMm: number | null;
  orientation: HorizontalChannelOrientationCheck;
  reason: string | null;
}

export interface MlStationSelectionResult {
  selectedMeasurements: AmplitudeMeasurement[];
  selectedChannels: string[];
  componentAmplitudesMm: number[];
  combinedAmplitudeMm: number | null;
  combinationMethodUsed: MlHorizontalCombinationMethod | 'single_component_experimental';
  candidatePairCount: number;
  totalStationMeasurements: number;
  status: 'Included' | 'Excluded' | 'Invalid';
  reason: string | null;
}

function parseNullableFiniteNumber(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const num = typeof val === 'number' ? val : Number(val);
  return Number.isFinite(num) ? num : null;
}

export function sanitizeMlCalibrationConfig(raw: unknown): MlCalibrationConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return structuredClone(DEFAULT_ML_CONFIG);
  }
  const obj = raw as Partial<MlCalibrationConfig>;

  const calibrationStatus: MlCalibrationConfig['calibrationStatus'] =
    obj.calibrationStatus === 'calibrated' ||
    obj.calibrationStatus === 'experimental_uncalibrated' ||
    obj.calibrationStatus === 'pending_calibration'
      ? obj.calibrationStatus
      : DEFAULT_ML_CONFIG.calibrationStatus;

  const distanceMetric: MlDistanceMetric =
    obj.distanceMetric === 'hypocentral_km' ? 'hypocentral_km' : 'epicentral_km';

  const expectedConvention: MlAmplitudeConvention =
    obj.expectedConvention === 'peak_to_peak' ? 'peak_to_peak' : 'zero_to_peak';

  const horizontalCombination: MlHorizontalCombinationMethod =
    obj.horizontalCombination === 'max' ? 'max' : 'mean';

  const requiredHorizontalComponents: MlRequiredHorizontalComponents =
    obj.requiredHorizontalComponents === 1 ? 1 : 2;

  const stationSelectionPolicy: MlStationSelectionPolicy =
    obj.stationSelectionPolicy === 'reject_ambiguous'
      ? 'reject_ambiguous'
      : 'deterministic_priority';

  const attenuationTable: MlAttenuationNode[] = [];
  if (Array.isArray(obj.attenuationTable)) {
    for (const node of obj.attenuationTable) {
      if (!node || typeof node !== 'object') continue;
      const dist = parseNullableFiniteNumber(
        (node as Partial<MlAttenuationNode>).distanceKm
      );
      const logA0 = parseNullableFiniteNumber(
        (node as Partial<MlAttenuationNode>).logA0
      );
      if (dist !== null && logA0 !== null) {
        attenuationTable.push({ distanceKm: dist, logA0 });
      }
    }
  }

  const minDistanceKm = parseNullableFiniteNumber(obj.minDistanceKm);
  const maxDistanceKm = parseNullableFiniteNumber(obj.maxDistanceKm);

  const minDepthKm = Math.max(
    0,
    parseNullableFiniteNumber(obj.minDepthKm) ?? DEFAULT_ML_CONFIG.minDepthKm
  );
  const maxDepthKm = Math.max(
    minDepthKm + 1,
    parseNullableFiniteNumber(obj.maxDepthKm) ?? DEFAULT_ML_CONFIG.maxDepthKm
  );

  const rawMinStations = parseNullableFiniteNumber(obj.minContributingStations);
  const minContributingStations =
    rawMinStations !== null && rawMinStations >= 1
      ? Math.trunc(rawMinStations)
      : DEFAULT_ML_CONFIG.minContributingStations;

  const stationCorrections: Record<string, number> = {};
  if (obj.stationCorrections && typeof obj.stationCorrections === 'object') {
    for (const [k, v] of Object.entries(obj.stationCorrections)) {
      const code = k.trim().toUpperCase();
      const num = parseNullableFiniteNumber(v);
      if (code && num !== null) {
        stationCorrections[code] = num;
      }
    }
  }

  return {
    profileId:
      typeof obj.profileId === 'string' && obj.profileId.trim()
        ? obj.profileId.trim()
        : DEFAULT_ML_CONFIG.profileId,
    algorithmVersion:
      typeof obj.algorithmVersion === 'string' && obj.algorithmVersion.trim()
        ? obj.algorithmVersion.trim()
        : DEFAULT_ML_CONFIG.algorithmVersion,
    calibrationStatus,
    scientificReference:
      typeof obj.scientificReference === 'string' &&
      obj.scientificReference.trim()
        ? obj.scientificReference.trim()
        : DEFAULT_ML_CONFIG.scientificReference,
    regionalApplicability:
      typeof obj.regionalApplicability === 'string' &&
      obj.regionalApplicability.trim()
        ? obj.regionalApplicability.trim()
        : DEFAULT_ML_CONFIG.regionalApplicability,
    allowExperimentalEvaluation: Boolean(obj.allowExperimentalEvaluation),
    distanceMetric,
    expectedConvention,
    horizontalCombination,
    requiredHorizontalComponents,
    attenuationTable,
    minDistanceKm,
    maxDistanceKm,
    minDepthKm,
    maxDepthKm,
    minContributingStations,
    stationSelectionPolicy,
    stationCorrections,
  };
}

export function validateMlCalibrationProfile(
  config: MlCalibrationConfig
): MlProfileValidationResult {
  return validateLocalMagnitudeAttenuationProfile(config, 'ML');
}

export function interpolateMlLogA0(
  distanceKm: number,
  config: MlCalibrationConfig
): { ok: true; logA0: number } | { ok: false; reason: string } {
  return interpolateLocalMagnitudeLogA0(distanceKm, config, 'ML');
}

export const formatMlAttenuationTableText = formatMlvAttenuationTableText;
export const parseMlAttenuationTableText = parseMlvAttenuationTableText;

export function inspectHorizontalChannelOrientation(
  m: Pick<
    AmplitudeMeasurement,
    | 'channelCode'
    | 'horizontalOrientationVerified'
    | 'channelAzimuthDeg'
    | 'channelDipDeg'
  >
): HorizontalChannelOrientationCheck {
  const cleanChannel = m.channelCode.trim().toUpperCase();
  const dipDeg =
    m.channelDipDeg !== null &&
    m.channelDipDeg !== undefined &&
    Number.isFinite(m.channelDipDeg)
      ? m.channelDipDeg
      : null;
  const azimuthDeg =
    m.channelAzimuthDeg !== null &&
    m.channelAzimuthDeg !== undefined &&
    Number.isFinite(m.channelAzimuthDeg)
      ? m.channelAzimuthDeg
      : null;

  if (!cleanChannel) {
    return {
      isHorizontal: false,
      orientationVerified: false,
      channelCode: '',
      bandInstrumentPrefix: '',
      componentKind: 'INVALID',
      azimuthDeg,
      dipDeg,
      reason:
        'Missing SEED channel code (horizontal ..N/..E or orientation-verified ..1/..2 channel required for ML)',
    };
  }

  if (!isValidSeedChannelCode(cleanChannel)) {
    return {
      isHorizontal: false,
      orientationVerified: false,
      channelCode: cleanChannel,
      bandInstrumentPrefix: '',
      componentKind: 'INVALID',
      azimuthDeg,
      dipDeg,
      reason: `Invalid SEED channel code "${cleanChannel}"`,
    };
  }

  if (isVerticalSeedChannel(cleanChannel)) {
    return {
      isHorizontal: false,
      orientationVerified: false,
      channelCode: cleanChannel,
      bandInstrumentPrefix: cleanChannel.slice(0, -1),
      componentKind: 'VERTICAL',
      azimuthDeg,
      dipDeg,
      reason: `Channel "${cleanChannel}" is vertical (Z component rejected for horizontal ML)`,
    };
  }

  if (dipDeg !== null && Math.abs(dipDeg) > 5) {
    return {
      isHorizontal: false,
      orientationVerified: false,
      channelCode: cleanChannel,
      bandInstrumentPrefix: cleanChannel.slice(0, -1),
      componentKind: 'INVALID',
      azimuthDeg,
      dipDeg,
      reason: `Channel "${cleanChannel}" has non-horizontal dip (${dipDeg}°; |dip| must be ≤ 5°)`,
    };
  }

  const suffix = cleanChannel.slice(-1);
  const prefix = cleanChannel.slice(0, -1);

  if (suffix === 'N' || suffix === 'E') {
    return {
      isHorizontal: true,
      orientationVerified: true,
      channelCode: cleanChannel,
      bandInstrumentPrefix: prefix,
      componentKind: suffix,
      azimuthDeg,
      dipDeg,
      reason: null,
    };
  }

  if (suffix === '1' || suffix === '2') {
    const hasExplicitMetadata =
      Boolean(m.horizontalOrientationVerified) ||
      (azimuthDeg !== null && dipDeg !== null && Math.abs(dipDeg) <= 5);
    if (!hasExplicitMetadata) {
      return {
        isHorizontal: false,
        orientationVerified: false,
        channelCode: cleanChannel,
        bandInstrumentPrefix: prefix,
        componentKind: suffix,
        azimuthDeg,
        dipDeg,
        reason: `Channel "${cleanChannel}" ends in numeric component "${suffix}" without verified horizontal orientation metadata`,
      };
    }
    return {
      isHorizontal: true,
      orientationVerified: true,
      channelCode: cleanChannel,
      bandInstrumentPrefix: prefix,
      componentKind: suffix,
      azimuthDeg,
      dipDeg,
      reason: null,
    };
  }

  // Conservative rejection for non-standard suffixes unless explicitly verified with azimuth & near-zero dip
  if (
    Boolean(m.horizontalOrientationVerified) &&
    azimuthDeg !== null &&
    (dipDeg === null || Math.abs(dipDeg) <= 5)
  ) {
    return {
      isHorizontal: true,
      orientationVerified: true,
      channelCode: cleanChannel,
      bandInstrumentPrefix: prefix,
      componentKind: 'OTHER',
      azimuthDeg,
      dipDeg,
      reason: null,
    };
  }

  return {
    isHorizontal: false,
    orientationVerified: false,
    channelCode: cleanChannel,
    bandInstrumentPrefix: prefix,
    componentKind: 'OTHER',
    azimuthDeg,
    dipDeg,
    reason: `Channel "${cleanChannel}" component "${suffix}" has unresolved horizontal orientation for ML`,
  };
}

function shortestAngularDifferenceDeg(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

export function checkHorizontalPairOrthogonality(
  a: HorizontalChannelOrientationCheck,
  b: HorizontalChannelOrientationCheck
): { orthogonal: boolean; reason: string | null } {
  if (!a.isHorizontal || !b.isHorizontal) {
    return { orthogonal: false, reason: 'Both components must be horizontal.' };
  }

  const isNE =
    (a.componentKind === 'N' && b.componentKind === 'E') ||
    (a.componentKind === 'E' && b.componentKind === 'N');
  const is12 =
    (a.componentKind === '1' && b.componentKind === '2') ||
    (a.componentKind === '2' && b.componentKind === '1');

  if (!isNE && !is12) {
    if (
      a.componentKind === 'OTHER' &&
      b.componentKind === 'OTHER' &&
      a.azimuthDeg !== null &&
      b.azimuthDeg !== null
    ) {
      const ang = shortestAngularDifferenceDeg(a.azimuthDeg, b.azimuthDeg);
      if (Math.abs(ang - 90) <= 5) {
        return { orthogonal: true, reason: null };
      }
      return {
        orthogonal: false,
        reason: `Channels ${a.channelCode}/${b.channelCode} azimuths (${a.azimuthDeg}° vs ${b.azimuthDeg}°) are not orthogonal (expected ~90° ± 5°).`,
      };
    }
    return {
      orthogonal: false,
      reason: `Channels ${a.channelCode} and ${b.channelCode} do not form an orthogonal N/E or 1/2 component pair.`,
    };
  }

  if (a.azimuthDeg !== null && b.azimuthDeg !== null) {
    const ang = shortestAngularDifferenceDeg(a.azimuthDeg, b.azimuthDeg);
    if (Math.abs(ang - 90) > 5) {
      return {
        orthogonal: false,
        reason: `Channels ${a.channelCode}/${b.channelCode} azimuths (${a.azimuthDeg}° vs ${b.azimuthDeg}°) are not orthogonal (separation ${ang.toFixed(1)}°, expected 90° ± 5°).`,
      };
    }
  } else if (is12 && (a.azimuthDeg !== null) !== (b.azimuthDeg !== null)) {
    return {
      orthogonal: false,
      reason: `Numeric channels ${a.channelCode}/${b.channelCode} have incomplete azimuth metadata (one has azimuth and the other does not).`,
    };
  }

  return { orthogonal: true, reason: null };
}

export function checkMlMeasurementEligibility(
  m: AmplitudeMeasurement,
  config: MlCalibrationConfig,
  validationContext?: {
    eventId?: string;
    picksById?: ReadonlyMap<string, StationPick>;
  }
): MlMeasurementEligibilityResult {
  const orientation = inspectHorizontalChannelOrientation(m);

  if (m.excluded) {
    return {
      eligible: false,
      excluded: true,
      convertedAmplitudeMm: null,
      orientation,
      reason: m.exclusionReason?.trim()
        ? `Excluded by analyst (${m.exclusionReason.trim()})`
        : 'Excluded by analyst',
    };
  }

  const structural = validateAmplitudeMeasurement(m, validationContext);
  if (!structural.structuralValid) {
    return {
      eligible: false,
      excluded: false,
      convertedAmplitudeMm: null,
      orientation,
      reason: structural.structuralErrors[0] ?? 'Structural validation error',
    };
  }

  if (m.clipped) {
    return {
      eligible: false,
      excluded: false,
      convertedAmplitudeMm: null,
      orientation,
      reason: 'Waveform clipped — excluded from ML',
    };
  }

  if (m.measurementCategory !== 'wood_anderson_local') {
    return {
      eligible: false,
      excluded: false,
      convertedAmplitudeMm: null,
      orientation,
      reason: `Category "${m.measurementCategory}" is not Wood–Anderson simulated local amplitude`,
    };
  }

  if (m.physicalQuantity !== 'displacement') {
    return {
      eligible: false,
      excluded: false,
      convertedAmplitudeMm: null,
      orientation,
      reason: `Physical quantity "${m.physicalQuantity}" is not displacement`,
    };
  }

  if (m.instrumentResponseStatus !== 'wood_anderson_simulated') {
    return {
      eligible: false,
      excluded: false,
      convertedAmplitudeMm: null,
      orientation,
      reason: `Instrument response "${m.instrumentResponseStatus}" is not Wood–Anderson simulated`,
    };
  }

  if (m.correctedStatus !== 'corrected') {
    return {
      eligible: false,
      excluded: false,
      convertedAmplitudeMm: null,
      orientation,
      reason: `Corrected status "${m.correctedStatus}" is not verified corrected`,
    };
  }

  if (!orientation.isHorizontal || !orientation.orientationVerified) {
    return {
      eligible: false,
      excluded: false,
      convertedAmplitudeMm: null,
      orientation,
      reason:
        orientation.reason ??
        'Channel does not have verified horizontal orientation for ML',
    };
  }

  if (m.convention === 'unknown') {
    return {
      eligible: false,
      excluded: false,
      convertedAmplitudeMm: null,
      orientation,
      reason: 'Amplitude convention (zero-to-peak vs peak-to-peak) is unknown',
    };
  }

  if (m.convention !== config.expectedConvention) {
    return {
      eligible: false,
      excluded: false,
      convertedAmplitudeMm: null,
      orientation,
      reason: `Amplitude convention "${m.convention}" does not match ML profile expectation "${config.expectedConvention}"`,
    };
  }

  const amplitudeMm = convertDisplacementToMm(m.amplitude, m.unit);
  if (amplitudeMm === null || !Number.isFinite(amplitudeMm) || amplitudeMm <= 0) {
    return {
      eligible: false,
      excluded: false,
      convertedAmplitudeMm: null,
      orientation,
      reason: `Unit "${m.unit}" cannot be converted cleanly to mm displacement`,
    };
  }

  return {
    eligible: true,
    excluded: false,
    convertedAmplitudeMm: amplitudeMm,
    orientation,
    reason: null,
  };
}

export function combineHorizontalAmplitudesMm(
  amp1Mm: number,
  amp2Mm: number,
  method: MlHorizontalCombinationMethod
): number {
  if (method === 'max') {
    return Math.max(amp1Mm, amp2Mm);
  }
  return (amp1Mm + amp2Mm) / 2;
}

interface EligibleSingleMlRecord {
  measurement: AmplitudeMeasurement;
  convertedMm: number;
  orientation: HorizontalChannelOrientationCheck;
}

interface CandidateMlPair {
  a: EligibleSingleMlRecord;
  b: EligibleSingleMlRecord;
}

function getChannelBandPriorityScore(prefix: string): number {
  const clean = prefix.trim().toUpperCase();
  if (clean === 'HH') return 0;
  if (clean === 'BH') return 1;
  if (clean === 'CH') return 2;
  if (clean === 'EH') return 3;
  if (clean === 'SH') return 4;
  if (clean.startsWith('H')) return 5;
  if (clean.startsWith('B')) return 6;
  if (clean.startsWith('C')) return 7;
  if (clean.startsWith('E')) return 8;
  if (clean.startsWith('S')) return 9;
  return 20;
}

function getPhasePriorityScore(phaseType: AmplitudeMeasurement['phaseType']): number {
  if (phaseType === 'S' || phaseType === 'Lg') return 0;
  if (phaseType === 'Waveform') return 1;
  return 2;
}

function compareSinglesDeterministically(
  a: EligibleSingleMlRecord,
  b: EligibleSingleMlRecord
): number {
  const bandDiff =
    getChannelBandPriorityScore(a.orientation.bandInstrumentPrefix) -
    getChannelBandPriorityScore(b.orientation.bandInstrumentPrefix);
  if (bandDiff !== 0) return bandDiff;

  const neScore = (k: HorizontalChannelOrientationCheck['componentKind']) =>
    k === 'N' ? 0 : k === 'E' ? 1 : k === '1' ? 2 : k === '2' ? 3 : 4;
  const kindDiff =
    neScore(a.orientation.componentKind) - neScore(b.orientation.componentKind);
  if (kindDiff !== 0) return kindDiff;

  const phaseDiff =
    getPhasePriorityScore(a.measurement.phaseType) -
    getPhasePriorityScore(b.measurement.phaseType);
  if (phaseDiff !== 0) return phaseDiff;

  const chanDiff = a.orientation.channelCode.localeCompare(
    b.orientation.channelCode
  );
  if (chanDiff !== 0) return chanDiff;

  const locDiff = a.measurement.locationCode
    .trim()
    .localeCompare(b.measurement.locationCode.trim());
  if (locDiff !== 0) return locDiff;

  return a.measurement.id.localeCompare(b.measurement.id);
}

function comparePairsDeterministically(
  p1: CandidateMlPair,
  p2: CandidateMlPair
): number {
  const bandDiff =
    getChannelBandPriorityScore(p1.a.orientation.bandInstrumentPrefix) -
    getChannelBandPriorityScore(p2.a.orientation.bandInstrumentPrefix);
  if (bandDiff !== 0) return bandDiff;

  const pairKindScore = (p: CandidateMlPair) =>
    p.a.orientation.componentKind === 'N' || p.a.orientation.componentKind === 'E'
      ? 0
      : 1;
  const kindDiff = pairKindScore(p1) - pairKindScore(p2);
  if (kindDiff !== 0) return kindDiff;

  const phaseDiff =
    getPhasePriorityScore(p1.a.measurement.phaseType) -
    getPhasePriorityScore(p2.a.measurement.phaseType);
  if (phaseDiff !== 0) return phaseDiff;

  const locDiff = p1.a.measurement.locationCode
    .trim()
    .localeCompare(p2.a.measurement.locationCode.trim());
  if (locDiff !== 0) return locDiff;

  const profDiff = (p1.a.measurement.processingProfileId ?? '')
    .trim()
    .localeCompare((p2.a.measurement.processingProfileId ?? '').trim());
  if (profDiff !== 0) return profDiff;

  const chDiff = `${p1.a.orientation.channelCode}/${p1.b.orientation.channelCode}`.localeCompare(
    `${p2.a.orientation.channelCode}/${p2.b.orientation.channelCode}`
  );
  if (chDiff !== 0) return chDiff;

  return `${p1.a.measurement.id}+${p1.b.measurement.id}`.localeCompare(
    `${p2.a.measurement.id}+${p2.b.measurement.id}`
  );
}

function orderPairComponents(
  a: EligibleSingleMlRecord,
  b: EligibleSingleMlRecord
): CandidateMlPair {
  const orderRank = (rec: EligibleSingleMlRecord) => {
    const k = rec.orientation.componentKind;
    if (k === 'N') return 0;
    if (k === 'E') return 1;
    if (k === '1') return 2;
    if (k === '2') return 3;
    return 4;
  };
  const ra = orderRank(a);
  const rb = orderRank(b);
  if (ra < rb) return { a, b };
  if (rb < ra) return { a: b, b: a };
  return a.measurement.id.localeCompare(b.measurement.id) <= 0
    ? { a, b }
    : { a: b, b: a };
}

function buildPairCompatibilityKey(rec: EligibleSingleMlRecord): string {
  const m = rec.measurement;
  return [
    m.networkCode.trim().toUpperCase(),
    m.stationCode.trim().toUpperCase(),
    m.locationCode.trim().toUpperCase(),
    (m.processingProfileId ?? '').trim(),
    m.instrumentResponseStatus,
    m.correctedStatus,
    m.convention,
    rec.orientation.bandInstrumentPrefix,
    m.phaseType,
  ].join('|');
}

function describePairingFailure(
  eligibleSingles: ReadonlyArray<EligibleSingleMlRecord>,
  orthogonalityErrors: ReadonlyArray<string>,
  invalidReasons: ReadonlyArray<string>
): string {
  if (orthogonalityErrors.length > 0) {
    return orthogonalityErrors[0];
  }

  if (eligibleSingles.length === 1) {
    const chan = eligibleSingles[0].orientation.channelCode;
    const baseMsg = `Missing orthogonal horizontal component (only ${chan} eligible; paired horizontal N/E or orientation-verified 1/2 components required)`;
    return invalidReasons.length > 0
      ? `${baseMsg} [${invalidReasons[0]}]`
      : baseMsg;
  }

  const nets = new Set(
    eligibleSingles.map((s) => s.measurement.networkCode.trim().toUpperCase())
  );
  const locs = new Set(
    eligibleSingles.map((s) => s.measurement.locationCode.trim().toUpperCase())
  );
  const profs = new Set(
    eligibleSingles.map((s) => (s.measurement.processingProfileId ?? '').trim())
  );
  const prefixes = new Set(
    eligibleSingles.map((s) => s.orientation.bandInstrumentPrefix)
  );
  const phases = new Set(eligibleSingles.map((s) => s.measurement.phaseType));

  if (nets.size > 1) {
    return `Cannot pair horizontal components across differing network codes (${Array.from(nets)
      .map((v) => v || 'unset')
      .join(' vs ')})`;
  }
  if (locs.size > 1) {
    return `Cannot pair horizontal components across differing location codes (${Array.from(locs)
      .map((v) => v || 'unset')
      .join(' vs ')})`;
  }
  if (profs.size > 1) {
    return `Cannot pair horizontal components across differing processing profiles (${Array.from(profs)
      .map((v) => v || 'unset')
      .join(' vs ')})`;
  }
  if (prefixes.size > 1) {
    return `Cannot pair horizontal components across differing sensor/band codes (${Array.from(prefixes).join(' vs ')})`;
  }
  if (phases.size > 1) {
    return `Cannot pair horizontal components across differing phase types (${Array.from(phases).join(' vs ')})`;
  }

  const chans = eligibleSingles.map((s) => s.orientation.channelCode).join(', ');
  return `No orthogonal horizontal component pair formed from (${chans}); missing complementary N/E or 1/2 channel`;
}

/**
 * Selects and combines compatible horizontal Wood–Anderson measurements for one station.
 * Guarantees AT MOST ONE station contribution to network ML (no double-counting).
 */
export function selectAndCombineStationMlMeasurements(
  stationMeasurements: ReadonlyArray<AmplitudeMeasurement>,
  config: MlCalibrationConfig,
  validationContext?: {
    eventId?: string;
    picksById?: ReadonlyMap<string, StationPick>;
  }
): MlStationSelectionResult {
  if (stationMeasurements.length === 0) {
    return {
      selectedMeasurements: [],
      selectedChannels: [],
      componentAmplitudesMm: [],
      combinedAmplitudeMm: null,
      combinationMethodUsed: config.horizontalCombination,
      candidatePairCount: 0,
      totalStationMeasurements: 0,
      status: 'Excluded',
      reason: 'No structured amplitude measurements for station',
    };
  }

  const eligibleSingles: EligibleSingleMlRecord[] = [];
  const excludedReasons: string[] = [];
  const invalidReasons: string[] = [];

  for (const m of stationMeasurements) {
    const check = checkMlMeasurementEligibility(m, config, validationContext);
    if (check.eligible && check.convertedAmplitudeMm !== null) {
      eligibleSingles.push({
        measurement: m,
        convertedMm: check.convertedAmplitudeMm,
        orientation: check.orientation,
      });
    } else if (check.excluded) {
      if (check.reason) excludedReasons.push(check.reason);
    } else if (check.reason) {
      invalidReasons.push(
        m.channelCode.trim()
          ? `${m.channelCode.trim().toUpperCase()}: ${check.reason}`
          : check.reason
      );
    }
  }

  if (eligibleSingles.length === 0) {
    if (invalidReasons.length === 0 && excludedReasons.length > 0) {
      return {
        selectedMeasurements: [],
        selectedChannels: [],
        componentAmplitudesMm: [],
        combinedAmplitudeMm: null,
        combinationMethodUsed: config.horizontalCombination,
        candidatePairCount: 0,
        totalStationMeasurements: stationMeasurements.length,
        status: 'Excluded',
        reason: excludedReasons[0],
      };
    }
    return {
      selectedMeasurements: [],
      selectedChannels: [],
      componentAmplitudesMm: [],
      combinedAmplitudeMm: null,
      combinationMethodUsed: config.horizontalCombination,
      candidatePairCount: 0,
      totalStationMeasurements: stationMeasurements.length,
      status: 'Invalid',
      reason:
        invalidReasons[0] ??
        'No ML-eligible horizontal Wood–Anderson measurement',
    };
  }

  // Group eligible horizontal singles by strict compatibility key
  const groups = new Map<string, EligibleSingleMlRecord[]>();
  for (const rec of eligibleSingles) {
    const key = buildPairCompatibilityKey(rec);
    const list = groups.get(key) ?? [];
    list.push(rec);
    groups.set(key, list);
  }

  const validPairs: CandidateMlPair[] = [];
  const orthogonalityErrors: string[] = [];
  let hasWithinGroupAmbiguity = false;

  for (const group of groups.values()) {
    if (group.length < 2) continue;

    // Detect duplicate component within exact same compatibility group (e.g. two BHNs + one BHE)
    const byComp = new Map<string, EligibleSingleMlRecord[]>();
    for (const rec of group) {
      const list = byComp.get(rec.orientation.componentKind) ?? [];
      list.push(rec);
      byComp.set(rec.orientation.componentKind, list);
    }
    for (const list of byComp.values()) {
      if (list.length > 1) {
        hasWithinGroupAmbiguity = true;
      }
    }

    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const ortho = checkHorizontalPairOrthogonality(
          group[i].orientation,
          group[j].orientation
        );
        if (ortho.orthogonal) {
          validPairs.push(orderPairComponents(group[i], group[j]));
        } else if (ortho.reason && group[i].orientation.componentKind !== group[j].orientation.componentKind) {
          orthogonalityErrors.push(ortho.reason);
        }
      }
    }
  }

  if (validPairs.length > 0) {
    if (
      config.stationSelectionPolicy === 'reject_ambiguous' &&
      (validPairs.length > 1 || hasWithinGroupAmbiguity)
    ) {
      const pairLabels = validPairs
        .map((p) => `${p.a.orientation.channelCode}+${p.b.orientation.channelCode}`)
        .join(', ');
      return {
        selectedMeasurements: [],
        selectedChannels: [],
        componentAmplitudesMm: [],
        combinedAmplitudeMm: null,
        combinationMethodUsed: config.horizontalCombination,
        candidatePairCount: validPairs.length,
        totalStationMeasurements: stationMeasurements.length,
        status: 'Invalid',
        reason: `Ambiguous horizontal ML candidates (${pairLabels}); exclude redundant records or use deterministic priority policy`,
      };
    }

    const sortedPairs = [...validPairs].sort(comparePairsDeterministically);
    const chosen = sortedPairs[0];
    const ampA = chosen.a.convertedMm;
    const ampB = chosen.b.convertedMm;
    const combinedMm = combineHorizontalAmplitudesMm(
      ampA,
      ampB,
      config.horizontalCombination
    );
    const chA = chosen.a.orientation.channelCode;
    const chB = chosen.b.orientation.channelCode;

    return {
      selectedMeasurements: [chosen.a.measurement, chosen.b.measurement],
      selectedChannels: [chA, chB],
      componentAmplitudesMm: [ampA, ampB],
      combinedAmplitudeMm: combinedMm,
      combinationMethodUsed: config.horizontalCombination,
      candidatePairCount: validPairs.length,
      totalStationMeasurements: stationMeasurements.length,
      status: 'Included',
      reason:
        validPairs.length > 1
          ? `Selected ${chA}+${chB} via ${config.horizontalCombination} (1 of ${validPairs.length} eligible horizontal pairs)`
          : null,
    };
  }

  // No valid orthogonal horizontal pair could be formed
  if (config.requiredHorizontalComponents === 1) {
    if (
      config.stationSelectionPolicy === 'reject_ambiguous' &&
      eligibleSingles.length > 1
    ) {
      const chans = eligibleSingles
        .map((s) => s.orientation.channelCode)
        .join(', ');
      return {
        selectedMeasurements: [],
        selectedChannels: [],
        componentAmplitudesMm: [],
        combinedAmplitudeMm: null,
        combinationMethodUsed: 'single_component_experimental',
        candidatePairCount: 0,
        totalStationMeasurements: stationMeasurements.length,
        status: 'Invalid',
        reason: `Multiple single horizontal measurements (${chans}) in reject_ambiguous mode`,
      };
    }

    const sortedSingles = [...eligibleSingles].sort(
      compareSinglesDeterministically
    );
    const single = sortedSingles[0];
    return {
      selectedMeasurements: [single.measurement],
      selectedChannels: [single.orientation.channelCode],
      componentAmplitudesMm: [single.convertedMm],
      combinedAmplitudeMm: single.convertedMm,
      combinationMethodUsed: 'single_component_experimental',
      candidatePairCount: 0,
      totalStationMeasurements: stationMeasurements.length,
      status: 'Included',
      reason: `Single horizontal component ${single.orientation.channelCode} used (explicit 1-component experimental ML policy)`,
    };
  }

  return {
    selectedMeasurements: [],
    selectedChannels: [],
    componentAmplitudesMm: [],
    combinedAmplitudeMm: null,
    combinationMethodUsed: config.horizontalCombination,
    candidatePairCount: 0,
    totalStationMeasurements: stationMeasurements.length,
    status: 'Invalid',
    reason: describePairingFailure(
      eligibleSingles,
      orthogonalityErrors,
      invalidReasons
    ),
  };
}

/**
 * SeisComP standard ML formula:
 * ML = log10(A_H_mm) - log10(A0(Delta)) + Cs
 */
export function computeStationMlFormula(params: {
  combinedAmplitudeMm: number;
  logA0: number;
  stationCorrection?: number;
}): number {
  const cs = params.stationCorrection ?? 0;
  return Math.log10(params.combinedAmplitudeMm) - params.logA0 + cs;
}

export function evaluateMlMagnitude(
  event: EQPEvent,
  settings: {
    mlConfig: MlCalibrationConfig;
    networkAggregation: NetworkAggregationMethod;
  },
  stations: ReadonlyArray<StationMeta> = []
): AlgorithmMagnitudeEvaluation {
  const desc = ML_ALGORITHM_DISPLAY;
  const mlCfg = settings.mlConfig;

  const calibrationStatus: CalibrationStatus =
    mlCfg.calibrationStatus === 'calibrated'
      ? 'calibrated'
      : mlCfg.allowExperimentalEvaluation
        ? 'experimental_uncalibrated'
        : 'pending_calibration';

  const profileValidation = validateMlCalibrationProfile(mlCfg);
  const compLabel = mlCfg.horizontalCombination === 'max' ? 'max(A1,A2)' : '(A1+A2)/2';
  const policyLabel =
    mlCfg.requiredHorizontalComponents === 1
      ? '1-comp experimental'
      : '2-comp paired';
  const provenanceBase = `ML = log10(${compLabel}) − log10(A0(${mlCfg.distanceMetric === 'hypocentral_km' ? 'R_hypo' : 'Δ'})) + Cs (${mlCfg.profileId} · ${policyLabel})`;

  if (
    mlCfg.calibrationStatus === 'pending_calibration' &&
    !mlCfg.allowExperimentalEvaluation
  ) {
    return {
      algorithmId: desc.algorithmId,
      displayName: desc.displayName,
      scientificLabel: desc.scientificLabel,
      scale: desc.scale,
      status: 'missing_calibration',
      statusReason:
        'ML attenuation calibration is pending official regional parameters. Configure a verified curve or enable experimental evaluation in Advanced Magnitude Settings.',
      networkMagnitude: null,
      rawNetworkMagnitude: null,
      contributingStations: 0,
      excludedStations: 0,
      invalidStations: 0,
      aggregationUsed: settings.networkAggregation,
      calibrationProfileId: mlCfg.profileId,
      calibrationStatus: 'pending_calibration',
      algorithmVersion: mlCfg.algorithmVersion,
      provenanceSummary: `${provenanceBase} · Calibration pending`,
      isAuthoritativeForBulletin: false,
      stationDetails: [],
    };
  }

  if (!profileValidation.valid) {
    return {
      algorithmId: desc.algorithmId,
      displayName: desc.displayName,
      scientificLabel: desc.scientificLabel,
      scale: desc.scale,
      status: 'missing_calibration',
      statusReason:
        profileValidation.errors[0] ||
        'ML attenuation table is incomplete or invalid.',
      networkMagnitude: null,
      rawNetworkMagnitude: null,
      contributingStations: 0,
      excludedStations: 0,
      invalidStations: 0,
      aggregationUsed: settings.networkAggregation,
      calibrationProfileId: mlCfg.profileId,
      calibrationStatus,
      algorithmVersion: mlCfg.algorithmVersion,
      provenanceSummary: `${provenanceBase} · Invalid attenuation table`,
      isAuthoritativeForBulletin: false,
      stationDetails: [],
    };
  }

  if (isEventUnlocated(event)) {
    return {
      algorithmId: desc.algorithmId,
      displayName: desc.displayName,
      scientificLabel: desc.scientificLabel,
      scale: desc.scale,
      status: 'missing_measurement',
      statusReason:
        'Hypocenter is not located yet — epicentral distance Δ (km) is required for ML attenuation.',
      networkMagnitude: null,
      rawNetworkMagnitude: null,
      contributingStations: 0,
      excludedStations: 0,
      invalidStations: 0,
      aggregationUsed: settings.networkAggregation,
      calibrationProfileId: mlCfg.profileId,
      calibrationStatus,
      algorithmVersion: mlCfg.algorithmVersion,
      provenanceSummary: provenanceBase,
      isAuthoritativeForBulletin: false,
      stationDetails: [],
    };
  }

  const depthKm = event.depthKm;
  if (
    !Number.isFinite(depthKm) ||
    depthKm < mlCfg.minDepthKm ||
    depthKm > mlCfg.maxDepthKm
  ) {
    return {
      algorithmId: desc.algorithmId,
      displayName: desc.displayName,
      scientificLabel: desc.scientificLabel,
      scale: desc.scale,
      status: 'invalid_measurement',
      statusReason: `Focal depth ${Number.isFinite(depthKm) ? depthKm.toFixed(1) : 'NaN'} km is outside supported ML range (${mlCfg.minDepthKm}–${mlCfg.maxDepthKm} km).`,
      networkMagnitude: null,
      rawNetworkMagnitude: null,
      contributingStations: 0,
      excludedStations: 0,
      invalidStations: 0,
      aggregationUsed: settings.networkAggregation,
      calibrationProfileId: mlCfg.profileId,
      calibrationStatus,
      algorithmVersion: mlCfg.algorithmVersion,
      provenanceSummary: provenanceBase,
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

  const picksById = new Map<string, StationPick>(
    event.picks.map((p) => [p.id, p])
  );
  const measurementsByPickId = new Map<string, AmplitudeMeasurement[]>();
  for (const m of event.amplitudeMeasurements ?? []) {
    if (!m.stationRefId) continue;
    const list = measurementsByPickId.get(m.stationRefId) ?? [];
    list.push(m);
    measurementsByPickId.set(m.stationRefId, list);
  }

  const validStationMagnitudes: number[] = [];
  const stationDetails: StationMagnitudeEvaluation[] = event.picks.map((pick) => {
    const staCode = pick.sta.trim().toUpperCase();
    const stMeta = stationLookup.get(staCode);
    const stationRecords = measurementsByPickId.get(pick.id) ?? [];

    const stLat =
      Number.isFinite(pick.lat) && pick.lat !== 0 ? pick.lat : stMeta?.lat ?? 0;
    const stLon =
      Number.isFinite(pick.lon) && pick.lon !== 0 ? pick.lon : stMeta?.lon ?? 0;

    let epicentralKm: number | null = null;
    let distanceDeg: number | null = null;
    if (stLat !== 0 && stLon !== 0) {
      epicentralKm = haversineDistanceKm(event.lat, event.lon, stLat, stLon);
      distanceDeg = Number((epicentralKm / 111.32).toFixed(3));
    } else if (Number.isFinite(pick.delta) && pick.delta > 0) {
      distanceDeg = pick.delta;
      epicentralKm = pick.delta * 111.32;
    }

    const lookupDistanceKm =
      epicentralKm !== null && Number.isFinite(epicentralKm)
        ? mlCfg.distanceMetric === 'hypocentral_km'
          ? Number(
              Math.sqrt(epicentralKm * epicentralKm + depthKm * depthKm).toFixed(
                2
              )
            )
          : Number(epicentralKm.toFixed(2))
        : null;

    const netGuess =
      stationRecords[0]?.networkCode?.trim().toUpperCase() ||
      pick.atlasMetadata?.network?.trim().toUpperCase() ||
      '';
    const locGuess = stationRecords[0]?.locationCode?.trim().toUpperCase() || '';
    const defaultCs = resolveStationCorrectionHierarchical(
      mlCfg.stationCorrections,
      {
        networkCode: netGuess,
        stationCode: staCode,
        locationCode: locGuess,
      }
    ).value;

    if (pick.pExcluded) {
      return {
        pickId: pick.id,
        sta: pick.sta,
        algorithmId: desc.algorithmId,
        scale: desc.scale,
        measurementType: stationRecords.length > 0 ? 'amplitude' : 'none',
        measurementValue:
          stationRecords.length > 0 ? stationRecords[0].amplitude : null,
        measurementUnit:
          stationRecords.length > 0 ? stationRecords[0].unit : '',
        measurementSource:
          stationRecords.length > 0
            ? `${stationRecords[0].channelCode || 'UNSET'} (${stationRecords[0].source})`
            : 'Missing',
        distanceKm: lookupDistanceKm,
        distanceDeg,
        depthKm,
        stationCorrection: defaultCs,
        magnitude: null,
        status: 'Excluded',
        reason: 'Station pick excluded from event solution',
        distanceMetricUsed: mlCfg.distanceMetric,
        combinationMethod: mlCfg.horizontalCombination,
        requiredHorizontalComponents: mlCfg.requiredHorizontalComponents,
      };
    }

    const selection = selectAndCombineStationMlMeasurements(
      stationRecords,
      mlCfg,
      {
        eventId: event.id,
        picksById,
      }
    );

    if (selection.status === 'Excluded') {
      return {
        pickId: pick.id,
        sta: pick.sta,
        algorithmId: desc.algorithmId,
        scale: desc.scale,
        measurementType: stationRecords.length > 0 ? 'amplitude' : 'none',
        measurementValue: null,
        measurementUnit: '',
        measurementSource:
          stationRecords.length > 0 ? 'Excluded record(s)' : 'None',
        distanceKm: lookupDistanceKm,
        distanceDeg,
        depthKm,
        stationCorrection: defaultCs,
        magnitude: null,
        status: 'Excluded',
        reason: selection.reason,
        mlCandidateCount: selection.candidatePairCount,
        distanceMetricUsed: mlCfg.distanceMetric,
        combinationMethod: selection.combinationMethodUsed,
        requiredHorizontalComponents: mlCfg.requiredHorizontalComponents,
      };
    }

    if (
      selection.status === 'Invalid' ||
      selection.selectedMeasurements.length === 0 ||
      selection.combinedAmplitudeMm === null
    ) {
      const sampleRec = stationRecords[0];
      return {
        pickId: pick.id,
        sta: pick.sta,
        algorithmId: desc.algorithmId,
        scale: desc.scale,
        measurementType: sampleRec ? 'amplitude' : 'none',
        measurementValue: sampleRec ? sampleRec.amplitude : null,
        measurementUnit: sampleRec ? sampleRec.unit : '',
        measurementSource: sampleRec
          ? `${sampleRec.channelCode || '—'} · ${sampleRec.instrumentResponseStatus}`
          : 'Missing',
        distanceKm: lookupDistanceKm,
        distanceDeg,
        depthKm,
        stationCorrection: defaultCs,
        magnitude: null,
        status: 'Invalid',
        reason: selection.reason ?? 'No eligible ML horizontal measurement',
        mlCandidateCount: selection.candidatePairCount,
        distanceMetricUsed: mlCfg.distanceMetric,
        combinationMethod: selection.combinationMethodUsed,
        requiredHorizontalComponents: mlCfg.requiredHorizontalComponents,
      };
    }

    const chosenFirst = selection.selectedMeasurements[0];
    const combinedMm = selection.combinedAmplitudeMm;
    const selectedIds = selection.selectedMeasurements.map((m) => m.id);
    const selectedChannels = selection.selectedChannels;
    const roundedCompAmps = selection.componentAmplitudesMm.map((v) =>
      Number(v.toFixed(6))
    );
    const roundedCombinedMm = Number(combinedMm.toFixed(6));

    const netCode =
      chosenFirst.networkCode.trim().toUpperCase() ||
      pick.atlasMetadata?.network?.trim().toUpperCase() ||
      '';
    const locCode = chosenFirst.locationCode.trim().toUpperCase();
    const csResolved = resolveStationCorrectionHierarchical(
      mlCfg.stationCorrections,
      {
        networkCode: netCode,
        stationCode: staCode,
        locationCode: locCode,
      }
    );
    const cs = csResolved.value;
    const channelsSummary = selectedChannels.join('+');
    const sourceText = `${channelsSummary} (${selection.combinationMethodUsed === 'single_component_experimental' ? '1-comp' : mlCfg.horizontalCombination})`;

    if (
      lookupDistanceKm === null ||
      !Number.isFinite(lookupDistanceKm) ||
      lookupDistanceKm < 0
    ) {
      return {
        pickId: pick.id,
        sta: pick.sta,
        algorithmId: desc.algorithmId,
        scale: desc.scale,
        measurementType: 'amplitude',
        measurementValue: roundedCombinedMm,
        measurementUnit: 'mm',
        measurementSource: sourceText,
        selectedMeasurementId: selectedIds.join('+'),
        selectedMeasurementIds: selectedIds,
        selectedChannel: channelsSummary,
        selectedChannels,
        componentAmplitudesMm: roundedCompAmps,
        combinedAmplitudeMm: roundedCombinedMm,
        convertedAmplitudeMm: roundedCombinedMm,
        combinationMethod: selection.combinationMethodUsed,
        requiredHorizontalComponents: mlCfg.requiredHorizontalComponents,
        attenuationLogA0: null,
        mlCandidateCount: selection.candidatePairCount,
        distanceMetricUsed: mlCfg.distanceMetric,
        distanceKm: null,
        distanceDeg: null,
        depthKm,
        stationCorrection: cs,
        magnitude: null,
        status: 'Invalid',
        reason: 'Missing or invalid station coordinates / distance Δ (km)',
      };
    }

    const logA0Lookup = interpolateMlLogA0(lookupDistanceKm, mlCfg);
    if (!logA0Lookup.ok) {
      return {
        pickId: pick.id,
        sta: pick.sta,
        algorithmId: desc.algorithmId,
        scale: desc.scale,
        measurementType: 'amplitude',
        measurementValue: roundedCombinedMm,
        measurementUnit: 'mm',
        measurementSource: sourceText,
        selectedMeasurementId: selectedIds.join('+'),
        selectedMeasurementIds: selectedIds,
        selectedChannel: channelsSummary,
        selectedChannels,
        componentAmplitudesMm: roundedCompAmps,
        combinedAmplitudeMm: roundedCombinedMm,
        convertedAmplitudeMm: roundedCombinedMm,
        combinationMethod: selection.combinationMethodUsed,
        requiredHorizontalComponents: mlCfg.requiredHorizontalComponents,
        attenuationLogA0: null,
        mlCandidateCount: selection.candidatePairCount,
        distanceMetricUsed: mlCfg.distanceMetric,
        distanceKm: lookupDistanceKm,
        distanceDeg,
        depthKm,
        stationCorrection: cs,
        magnitude: null,
        status: 'Invalid',
        reason: logA0Lookup.reason,
      };
    }

    const mlRaw = computeStationMlFormula({
      combinedAmplitudeMm: combinedMm,
      logA0: logA0Lookup.logA0,
      stationCorrection: cs,
    });

    if (!Number.isFinite(mlRaw)) {
      return {
        pickId: pick.id,
        sta: pick.sta,
        algorithmId: desc.algorithmId,
        scale: desc.scale,
        measurementType: 'amplitude',
        measurementValue: roundedCombinedMm,
        measurementUnit: 'mm',
        measurementSource: sourceText,
        selectedMeasurementId: selectedIds.join('+'),
        selectedMeasurementIds: selectedIds,
        selectedChannel: channelsSummary,
        selectedChannels,
        componentAmplitudesMm: roundedCompAmps,
        combinedAmplitudeMm: roundedCombinedMm,
        convertedAmplitudeMm: roundedCombinedMm,
        combinationMethod: selection.combinationMethodUsed,
        requiredHorizontalComponents: mlCfg.requiredHorizontalComponents,
        attenuationLogA0: Number(logA0Lookup.logA0.toFixed(4)),
        mlCandidateCount: selection.candidatePairCount,
        distanceMetricUsed: mlCfg.distanceMetric,
        distanceKm: lookupDistanceKm,
        distanceDeg,
        depthKm,
        stationCorrection: cs,
        magnitude: null,
        status: 'Invalid',
        reason: 'Station ML calculation produced non-finite value',
      };
    }

    const stationMl = Number(mlRaw.toFixed(2));
    validStationMagnitudes.push(stationMl);

    return {
      pickId: pick.id,
      sta: pick.sta,
      algorithmId: desc.algorithmId,
      scale: desc.scale,
      measurementType: 'amplitude',
      measurementValue: roundedCombinedMm,
      measurementUnit: 'mm',
      measurementSource: sourceText,
      selectedMeasurementId: selectedIds.join('+'),
      selectedMeasurementIds: selectedIds,
      selectedChannel: channelsSummary,
      selectedChannels,
      componentAmplitudesMm: roundedCompAmps,
      combinedAmplitudeMm: roundedCombinedMm,
      convertedAmplitudeMm: roundedCombinedMm,
      combinationMethod: selection.combinationMethodUsed,
      requiredHorizontalComponents: mlCfg.requiredHorizontalComponents,
      attenuationLogA0: Number(logA0Lookup.logA0.toFixed(4)),
      mlCandidateCount: selection.candidatePairCount,
      distanceMetricUsed: mlCfg.distanceMetric,
      distanceKm: lookupDistanceKm,
      distanceDeg,
      depthKm,
      stationCorrection: cs,
      magnitude: stationMl,
      status: 'Included',
      reason: selection.reason,
    };
  });

  const excludedStations = stationDetails.filter(
    (s) => s.status === 'Excluded'
  ).length;
  const invalidStations = stationDetails.filter(
    (s) => s.status === 'Invalid'
  ).length;

  const aggregated = aggregateStationMagnitudes(
    validStationMagnitudes,
    settings.networkAggregation
  );

  if (!aggregated) {
    return {
      algorithmId: desc.algorithmId,
      displayName: desc.displayName,
      scientificLabel: desc.scientificLabel,
      scale: desc.scale,
      status: invalidStations > 0 ? 'invalid_measurement' : 'missing_measurement',
      statusReason:
        invalidStations > 0
          ? 'No valid station ML values remained after horizontal pairing, amplitude, and distance validation.'
          : 'No stations with eligible horizontal Wood–Anderson amplitude measurements.',
      networkMagnitude: null,
      rawNetworkMagnitude: null,
      contributingStations: 0,
      totalEligibleStations: 0,
      excludedStations,
      invalidStations,
      aggregationUsed: settings.networkAggregation,
      trimmedCount: 0,
      fallbackApplied: false,
      calibrationProfileId: mlCfg.profileId,
      calibrationStatus,
      algorithmVersion: mlCfg.algorithmVersion,
      provenanceSummary: provenanceBase,
      isAuthoritativeForBulletin: false,
      stationDetails,
    };
  }

  if (aggregated.totalEligible < mlCfg.minContributingStations) {
    return {
      algorithmId: desc.algorithmId,
      displayName: desc.displayName,
      scientificLabel: desc.scientificLabel,
      scale: desc.scale,
      status: 'missing_measurement',
      statusReason: `Only ${aggregated.totalEligible} valid station ML observation(s); profile requires at least ${mlCfg.minContributingStations} contributing station(s).`,
      networkMagnitude: null,
      rawNetworkMagnitude: null,
      contributingStations: 0,
      totalEligibleStations: aggregated.totalEligible,
      excludedStations,
      invalidStations,
      aggregationUsed: settings.networkAggregation,
      trimmedCount: 0,
      fallbackApplied: false,
      calibrationProfileId: mlCfg.profileId,
      calibrationStatus,
      algorithmVersion: mlCfg.algorithmVersion,
      provenanceSummary: provenanceBase,
      isAuthoritativeForBulletin: false,
      stationDetails,
    };
  }

  const notes: string[] = [];
  if (mlCfg.requiredHorizontalComponents === 1) {
    notes.push('1-component horizontal experimental fallback permitted');
  }
  if (aggregated.fallbackApplied) {
    notes.push(
      `Trimmed mean fell back to arithmetic mean (N = ${aggregated.totalEligible} < 10; 0 trimmed)`
    );
  } else if (aggregated.trimmedCount > 0) {
    notes.push(
      `10% trimmed mean (${aggregated.trimmedCount} of ${aggregated.totalEligible} trimmed; ${aggregated.contributingCount} kept)`
    );
  }
  if (aggregated.totalEligible === 1) {
    notes.push(
      'Single-station ML estimate (N = 1) — azimuthal and noise robustness limited'
    );
  }

  return {
    algorithmId: desc.algorithmId,
    displayName: desc.displayName,
    scientificLabel: desc.scientificLabel,
    scale: desc.scale,
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
    aggregationNote: notes.length > 0 ? notes.join(' · ') : null,
    calibrationProfileId: mlCfg.profileId,
    calibrationStatus,
    algorithmVersion: mlCfg.algorithmVersion,
    provenanceSummary: provenanceBase,
    isAuthoritativeForBulletin: calibrationStatus === 'calibrated',
    stationDetails,
  };
}
