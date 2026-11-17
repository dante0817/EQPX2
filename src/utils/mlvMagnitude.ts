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
  type AmplitudeUnit,
} from './amplitudeMeasurements.ts';
import {
  aggregateStationMagnitudes,
  type NetworkAggregationMethod,
} from './magnitudeAggregation.ts';
import type {
  AlgorithmMagnitudeEvaluation,
  CalibrationStatus,
  StationMagnitudeEvaluation,
} from './magnitudeEngine.ts';

export interface MlvAttenuationNode {
  distanceKm: number;
  logA0: number;
}

export type MlvDistanceMetric = 'epicentral_km' | 'hypocentral_km';
export type MlvAmplitudeConvention = 'zero_to_peak' | 'peak_to_peak';
export type MlvStationSelectionPolicy = 'deterministic_priority' | 'reject_ambiguous';

export interface MlvCalibrationConfig {
  profileId: string;
  algorithmVersion: string;
  calibrationStatus: 'pending_calibration' | 'experimental_uncalibrated' | 'calibrated';
  regionalApplicability: string;
  allowExperimentalEvaluation: boolean;
  distanceMetric: MlvDistanceMetric;
  expectedConvention: MlvAmplitudeConvention;
  attenuationTable: MlvAttenuationNode[];
  minDistanceKm: number | null;
  maxDistanceKm: number | null;
  minDepthKm: number;
  maxDepthKm: number;
  minContributingStations: number;
  stationSelectionPolicy: MlvStationSelectionPolicy;
  /**
   * Optional additive station correction Cs in magnitude units:
   * MLv_station = log10(A_mm) - log10(A0(Delta)) + Cs.
   * Keyed by NET.STA.LOC, NET.STA, or STA (checked in that order).
   */
  stationCorrections: Record<string, number>;
}

export const MLV_ALGORITHM_DISPLAY = {
  algorithmId: 'mlv-vertical' as const,
  shortName: 'MLv',
  scale: 'MLv',
  displayName: 'MLv — Vertical Local Magnitude',
  scientificLabel: 'MLv — Vertical Local Magnitude',
  version: 'MLv-1.0.0',
};

export const DEFAULT_MLV_CONFIG: MlvCalibrationConfig = {
  profileId: 'ph-mlv-pending-v1',
  algorithmVersion: 'MLv-1.0.0',
  calibrationStatus: 'pending_calibration',
  regionalApplicability:
    'Philippine Seismic Network (Official MLv Attenuation Pending Calibration)',
  allowExperimentalEvaluation: false,
  distanceMetric: 'epicentral_km',
  expectedConvention: 'zero_to_peak',
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
 * SeisComP MLv documentation: (0:-1.3, 60:-2.8, 100:-3.0, 400:-4.5, 1000:-5.85).
 * NEVER active by default and NEVER labeled as an official Philippine calibration.
 */
export const SEISCOMP_REFERENCE_MLV_PROFILE: MlvCalibrationConfig = {
  profileId: 'seiscomp-mlv-reference-example-experimental',
  algorithmVersion: 'MLv-1.0.0',
  calibrationStatus: 'experimental_uncalibrated',
  regionalApplicability:
    'SeisComP Documentation Reference Example (Non-Philippine / Experimental Testing Only)',
  allowExperimentalEvaluation: true,
  distanceMetric: 'epicentral_km',
  expectedConvention: 'zero_to_peak',
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

export interface MlvProfileValidationResult {
  valid: boolean;
  errors: string[];
  effectiveMinDistanceKm: number | null;
  effectiveMaxDistanceKm: number | null;
  nodes: MlvAttenuationNode[];
}

export interface MlvMeasurementEligibilityResult {
  eligible: boolean;
  excluded: boolean;
  convertedAmplitudeMm: number | null;
  reason: string | null;
}

export interface MlvStationSelectionResult {
  selected: AmplitudeMeasurement | null;
  convertedAmplitudeMm: number | null;
  candidateCount: number;
  totalStationMeasurements: number;
  status: 'Included' | 'Excluded' | 'Invalid';
  reason: string | null;
}

function parseNullableFiniteNumber(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const num = typeof val === 'number' ? val : Number(val);
  return Number.isFinite(num) ? num : null;
}

export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * rad) *
      Math.cos(lat2 * rad) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

export function sanitizeMlvCalibrationConfig(raw: unknown): MlvCalibrationConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return structuredClone(DEFAULT_MLV_CONFIG);
  }
  const obj = raw as Partial<MlvCalibrationConfig>;

  const calibrationStatus: MlvCalibrationConfig['calibrationStatus'] =
    obj.calibrationStatus === 'calibrated' ||
    obj.calibrationStatus === 'experimental_uncalibrated' ||
    obj.calibrationStatus === 'pending_calibration'
      ? obj.calibrationStatus
      : DEFAULT_MLV_CONFIG.calibrationStatus;

  const distanceMetric: MlvDistanceMetric =
    obj.distanceMetric === 'hypocentral_km' ? 'hypocentral_km' : 'epicentral_km';

  const expectedConvention: MlvAmplitudeConvention =
    obj.expectedConvention === 'peak_to_peak' ? 'peak_to_peak' : 'zero_to_peak';

  const stationSelectionPolicy: MlvStationSelectionPolicy =
    obj.stationSelectionPolicy === 'reject_ambiguous'
      ? 'reject_ambiguous'
      : 'deterministic_priority';

  const attenuationTable: MlvAttenuationNode[] = [];
  if (Array.isArray(obj.attenuationTable)) {
    for (const node of obj.attenuationTable) {
      if (!node || typeof node !== 'object') continue;
      const dist = parseNullableFiniteNumber(
        (node as Partial<MlvAttenuationNode>).distanceKm
      );
      const logA0 = parseNullableFiniteNumber(
        (node as Partial<MlvAttenuationNode>).logA0
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
    parseNullableFiniteNumber(obj.minDepthKm) ?? DEFAULT_MLV_CONFIG.minDepthKm
  );
  const maxDepthKm = Math.max(
    minDepthKm + 1,
    parseNullableFiniteNumber(obj.maxDepthKm) ?? DEFAULT_MLV_CONFIG.maxDepthKm
  );

  const rawMinStations = parseNullableFiniteNumber(obj.minContributingStations);
  const minContributingStations =
    rawMinStations !== null && rawMinStations >= 1
      ? Math.trunc(rawMinStations)
      : DEFAULT_MLV_CONFIG.minContributingStations;

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
        : DEFAULT_MLV_CONFIG.profileId,
    algorithmVersion:
      typeof obj.algorithmVersion === 'string' && obj.algorithmVersion.trim()
        ? obj.algorithmVersion.trim()
        : DEFAULT_MLV_CONFIG.algorithmVersion,
    calibrationStatus,
    regionalApplicability:
      typeof obj.regionalApplicability === 'string' &&
      obj.regionalApplicability.trim()
        ? obj.regionalApplicability.trim()
        : DEFAULT_MLV_CONFIG.regionalApplicability,
    allowExperimentalEvaluation: Boolean(obj.allowExperimentalEvaluation),
    distanceMetric,
    expectedConvention,
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

/**
 * Validates a local-magnitude calibration attenuation curve without silently sorting or
 * repairing duplicate, inverted, or non-finite nodes so malformed calibrations fail loudly.
 */
export function validateLocalMagnitudeAttenuationProfile(
  config: Pick<
    MlvCalibrationConfig,
    'attenuationTable' | 'minDistanceKm' | 'maxDistanceKm'
  >,
  scaleLabel = 'MLv'
): MlvProfileValidationResult {
  const errors: string[] = [];
  const nodes = config.attenuationTable ?? [];

  if (!Array.isArray(nodes) || nodes.length < 2) {
    errors.push(
      `${scaleLabel} attenuation curve requires at least two ordered (Δ km, log10 A0) calibration points.`
    );
    return {
      valid: false,
      errors,
      effectiveMinDistanceKm: null,
      effectiveMaxDistanceKm: null,
      nodes: [],
    };
  }

  for (let i = 0; i < nodes.length; i++) {
    const cur = nodes[i];
    if (!Number.isFinite(cur.distanceKm) || cur.distanceKm < 0) {
      errors.push(
        `Attenuation node #${i + 1} has invalid distance (${String(cur.distanceKm)} km).`
      );
    }
    if (!Number.isFinite(cur.logA0)) {
      errors.push(
        `Attenuation node #${i + 1} has non-finite log10(A0) value (${String(cur.logA0)}).`
      );
    }
    if (i > 0) {
      const prev = nodes[i - 1];
      if (
        Number.isFinite(prev.distanceKm) &&
        Number.isFinite(cur.distanceKm) &&
        cur.distanceKm <= prev.distanceKm
      ) {
        errors.push(
          `Attenuation table distances must strictly increase (${prev.distanceKm} km followed by ${cur.distanceKm} km).`
        );
      }
    }
  }

  if (
    config.minDistanceKm !== null &&
    (!Number.isFinite(config.minDistanceKm) || config.minDistanceKm < 0)
  ) {
    errors.push(
      `${scaleLabel} minimum distance bound must be a finite non-negative number.`
    );
  }
  if (
    config.maxDistanceKm !== null &&
    (!Number.isFinite(config.maxDistanceKm) || config.maxDistanceKm <= 0)
  ) {
    errors.push(
      `${scaleLabel} maximum distance bound must be a finite positive number.`
    );
  }
  if (
    config.minDistanceKm !== null &&
    config.maxDistanceKm !== null &&
    Number.isFinite(config.minDistanceKm) &&
    Number.isFinite(config.maxDistanceKm) &&
    config.maxDistanceKm <= config.minDistanceKm
  ) {
    errors.push(
      `${scaleLabel} maximum distance bound must exceed minimum distance bound.`
    );
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      effectiveMinDistanceKm: null,
      effectiveMaxDistanceKm: null,
      nodes,
    };
  }

  const tableMin = nodes[0].distanceKm;
  const tableMax = nodes[nodes.length - 1].distanceKm;
  const effectiveMin =
    config.minDistanceKm !== null
      ? Math.max(tableMin, config.minDistanceKm)
      : tableMin;
  const effectiveMax =
    config.maxDistanceKm !== null
      ? Math.min(tableMax, config.maxDistanceKm)
      : tableMax;

  if (effectiveMin >= effectiveMax) {
    errors.push(
      `Configured distance bounds (${config.minDistanceKm ?? tableMin}–${config.maxDistanceKm ?? tableMax} km) do not overlap the attenuation curve (${tableMin}–${tableMax} km).`
    );
    return {
      valid: false,
      errors,
      effectiveMinDistanceKm: null,
      effectiveMaxDistanceKm: null,
      nodes,
    };
  }

  return {
    valid: true,
    errors: [],
    effectiveMinDistanceKm: effectiveMin,
    effectiveMaxDistanceKm: effectiveMax,
    nodes,
  };
}

/**
 * Validates an MLv calibration attenuation curve without silently sorting or repairing
 * duplicate, inverted, or non-finite nodes so malformed calibrations fail loudly.
 */
export function validateMlvCalibrationProfile(
  config: MlvCalibrationConfig
): MlvProfileValidationResult {
  return validateLocalMagnitudeAttenuationProfile(config, 'MLv');
}

/**
 * Piecewise-linear interpolation of log10(A0(Delta)) over an explicit attenuation table.
 * Strictly refuses extrapolation outside calibrated bounds.
 */
export function interpolateLocalMagnitudeLogA0(
  distanceKm: number,
  config: Pick<
    MlvCalibrationConfig,
    'attenuationTable' | 'minDistanceKm' | 'maxDistanceKm'
  >,
  scaleLabel = 'MLv'
): { ok: true; logA0: number } | { ok: false; reason: string } {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    return {
      ok: false,
      reason: `Invalid station distance (${String(distanceKm)} km) for ${scaleLabel} attenuation lookup.`,
    };
  }

  const profileCheck = validateLocalMagnitudeAttenuationProfile(
    config,
    scaleLabel
  );
  if (
    !profileCheck.valid ||
    profileCheck.effectiveMinDistanceKm === null ||
    profileCheck.effectiveMaxDistanceKm === null
  ) {
    return {
      ok: false,
      reason: profileCheck.errors[0] || `Invalid ${scaleLabel} attenuation curve.`,
    };
  }

  if (
    distanceKm < profileCheck.effectiveMinDistanceKm ||
    distanceKm > profileCheck.effectiveMaxDistanceKm
  ) {
    return {
      ok: false,
      reason: `Distance ${distanceKm.toFixed(1)} km outside calibrated ${scaleLabel} range (${profileCheck.effectiveMinDistanceKm}–${profileCheck.effectiveMaxDistanceKm} km — extrapolation blocked).`,
    };
  }

  const nodes = profileCheck.nodes;
  for (let i = 0; i < nodes.length; i++) {
    if (distanceKm === nodes[i].distanceKm) {
      return { ok: true, logA0: nodes[i].logA0 };
    }
    if (i < nodes.length - 1 && distanceKm < nodes[i + 1].distanceKm) {
      const d0 = nodes[i].distanceKm;
      const d1 = nodes[i + 1].distanceKm;
      const y0 = nodes[i].logA0;
      const y1 = nodes[i + 1].logA0;
      const t = (distanceKm - d0) / (d1 - d0);
      const interpolated = y0 + t * (y1 - y0);
      return Number.isFinite(interpolated)
        ? { ok: true, logA0: interpolated }
        : {
            ok: false,
            reason: `${scaleLabel} attenuation interpolation produced non-finite value.`,
          };
    }
  }

  return {
    ok: false,
    reason: `Distance ${distanceKm.toFixed(1)} km could not be bracketed in ${scaleLabel} attenuation table.`,
  };
}

/**
 * Piecewise-linear interpolation of log10(A0(Delta)) over an explicit attenuation table.
 * Strictly refuses extrapolation outside calibrated bounds.
 */
export function interpolateMlvLogA0(
  distanceKm: number,
  config: MlvCalibrationConfig
): { ok: true; logA0: number } | { ok: false; reason: string } {
  return interpolateLocalMagnitudeLogA0(distanceKm, config, 'MLv');
}

export function isVerticalSeedChannel(channelCode: string): boolean {
  const clean = channelCode.trim().toUpperCase();
  if (!clean || !isValidSeedChannelCode(clean)) return false;
  return clean.endsWith('Z');
}

export function convertDisplacementToMm(
  amplitude: number,
  unit: AmplitudeUnit
): number | null {
  if (!Number.isFinite(amplitude) || amplitude <= 0) return null;
  switch (unit) {
    case 'mm':
      return amplitude;
    case 'm':
      return amplitude * 1000;
    case 'um':
      return amplitude / 1000;
    case 'nm':
      return amplitude / 1_000_000;
    default:
      return null;
  }
}

export function resolveMlvStationCorrection(
  stationCorrections: Record<string, number>,
  identifiers: {
    networkCode?: string;
    stationCode: string;
    locationCode?: string;
  }
): { value: number; matchedKey: string | null } {
  const net = (identifiers.networkCode ?? '').trim().toUpperCase();
  const sta = identifiers.stationCode.trim().toUpperCase();
  const loc = (identifiers.locationCode ?? '').trim().toUpperCase();

  const candidateKeys: string[] = [];
  if (net && sta && loc) {
    candidateKeys.push(`${net}.${sta}.${loc}`);
  }
  if (net && sta) {
    candidateKeys.push(`${net}.${sta}`);
  }
  if (sta) {
    candidateKeys.push(sta);
  }

  for (const key of candidateKeys) {
    const val = stationCorrections[key];
    if (typeof val === 'number' && Number.isFinite(val)) {
      return { value: val, matchedKey: key };
    }
  }
  return { value: 0, matchedKey: null };
}

export const resolveStationCorrectionHierarchical = resolveMlvStationCorrection;

export function checkMlvMeasurementEligibility(
  m: AmplitudeMeasurement,
  config: MlvCalibrationConfig,
  validationContext?: {
    eventId?: string;
    picksById?: ReadonlyMap<string, StationPick>;
  }
): MlvMeasurementEligibilityResult {
  if (m.excluded) {
    return {
      eligible: false,
      excluded: true,
      convertedAmplitudeMm: null,
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
      reason: structural.structuralErrors[0] ?? 'Structural validation error',
    };
  }

  if (m.clipped) {
    return {
      eligible: false,
      excluded: false,
      convertedAmplitudeMm: null,
      reason: 'Waveform clipped — excluded from MLv',
    };
  }

  if (m.measurementCategory !== 'wood_anderson_local') {
    return {
      eligible: false,
      excluded: false,
      convertedAmplitudeMm: null,
      reason: `Category "${m.measurementCategory}" is not Wood–Anderson simulated local amplitude`,
    };
  }

  if (m.physicalQuantity !== 'displacement') {
    return {
      eligible: false,
      excluded: false,
      convertedAmplitudeMm: null,
      reason: `Physical quantity "${m.physicalQuantity}" is not displacement`,
    };
  }

  if (m.instrumentResponseStatus !== 'wood_anderson_simulated') {
    return {
      eligible: false,
      excluded: false,
      convertedAmplitudeMm: null,
      reason: `Instrument response "${m.instrumentResponseStatus}" is not Wood–Anderson simulated`,
    };
  }

  if (m.correctedStatus !== 'corrected') {
    return {
      eligible: false,
      excluded: false,
      convertedAmplitudeMm: null,
      reason: `Corrected status "${m.correctedStatus}" is not verified corrected`,
    };
  }

  const cleanChannel = m.channelCode.trim().toUpperCase();
  if (!cleanChannel) {
    return {
      eligible: false,
      excluded: false,
      convertedAmplitudeMm: null,
      reason: 'Missing SEED channel code (vertical Z channel required)',
    };
  }
  if (!isVerticalSeedChannel(cleanChannel)) {
    return {
      eligible: false,
      excluded: false,
      convertedAmplitudeMm: null,
      reason: `Channel "${cleanChannel}" is not vertical (Z component required for MLv)`,
    };
  }

  if (m.convention === 'unknown') {
    return {
      eligible: false,
      excluded: false,
      convertedAmplitudeMm: null,
      reason: 'Amplitude convention (zero-to-peak vs peak-to-peak) is unknown',
    };
  }
  if (m.convention !== config.expectedConvention) {
    return {
      eligible: false,
      excluded: false,
      convertedAmplitudeMm: null,
      reason: `Amplitude convention "${m.convention}" does not match MLv profile expectation "${config.expectedConvention}"`,
    };
  }

  const amplitudeMm = convertDisplacementToMm(m.amplitude, m.unit);
  if (amplitudeMm === null || !Number.isFinite(amplitudeMm) || amplitudeMm <= 0) {
    return {
      eligible: false,
      excluded: false,
      convertedAmplitudeMm: null,
      reason: `Unit "${m.unit}" cannot be converted cleanly to mm displacement`,
    };
  }

  return {
    eligible: true,
    excluded: false,
    convertedAmplitudeMm: amplitudeMm,
    reason: null,
  };
}

function getChannelPriorityScore(m: AmplitudeMeasurement): number {
  const chan = m.channelCode.trim().toUpperCase();
  if (chan === 'HHZ') return 0;
  if (chan === 'BHZ') return 1;
  if (chan === 'CHZ') return 2;
  if (chan === 'EHZ') return 3;
  if (chan === 'SHZ') return 4;
  if (chan.startsWith('H')) return 5;
  if (chan.startsWith('B')) return 6;
  if (chan.startsWith('C')) return 7;
  if (chan.startsWith('E')) return 8;
  if (chan.startsWith('S')) return 9;
  return 20;
}

function compareMlvCandidatesDeterministically(
  a: AmplitudeMeasurement,
  b: AmplitudeMeasurement
): number {
  const chanDiff = getChannelPriorityScore(a) - getChannelPriorityScore(b);
  if (chanDiff !== 0) return chanDiff;

  const phaseRank = (ph: AmplitudeMeasurement['phaseType']) =>
    ph === 'S' || ph === 'Lg' ? 0 : ph === 'Waveform' ? 1 : 2;
  const phaseDiff = phaseRank(a.phaseType) - phaseRank(b.phaseType);
  if (phaseDiff !== 0) return phaseDiff;

  const chanStrDiff = a.channelCode.trim().localeCompare(b.channelCode.trim());
  if (chanStrDiff !== 0) return chanStrDiff;

  const locDiff = a.locationCode.trim().localeCompare(b.locationCode.trim());
  if (locDiff !== 0) return locDiff;

  return a.id.localeCompare(b.id);
}

/**
 * Guarantees a station contributes AT MOST ONE amplitude measurement to MLv.
 */
export function selectStationMlvMeasurement(
  stationMeasurements: ReadonlyArray<AmplitudeMeasurement>,
  config: MlvCalibrationConfig,
  validationContext?: {
    eventId?: string;
    picksById?: ReadonlyMap<string, StationPick>;
  }
): MlvStationSelectionResult {
  if (stationMeasurements.length === 0) {
    return {
      selected: null,
      convertedAmplitudeMm: null,
      candidateCount: 0,
      totalStationMeasurements: 0,
      status: 'Excluded',
      reason: 'No structured amplitude measurements for station',
    };
  }

  const eligible: Array<{
    measurement: AmplitudeMeasurement;
    convertedMm: number;
  }> = [];
  const excludedReasons: string[] = [];
  const invalidReasons: string[] = [];

  for (const m of stationMeasurements) {
    const check = checkMlvMeasurementEligibility(m, config, validationContext);
    if (check.eligible && check.convertedAmplitudeMm !== null) {
      eligible.push({
        measurement: m,
        convertedMm: check.convertedAmplitudeMm,
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

  if (eligible.length === 0) {
    if (invalidReasons.length === 0 && excludedReasons.length > 0) {
      return {
        selected: null,
        convertedAmplitudeMm: null,
        candidateCount: 0,
        totalStationMeasurements: stationMeasurements.length,
        status: 'Excluded',
        reason: excludedReasons[0],
      };
    }
    return {
      selected: null,
      convertedAmplitudeMm: null,
      candidateCount: 0,
      totalStationMeasurements: stationMeasurements.length,
      status: 'Invalid',
      reason:
        invalidReasons[0] ?? 'No MLv-eligible vertical Wood–Anderson measurement',
    };
  }

  if (eligible.length > 1 && config.stationSelectionPolicy === 'reject_ambiguous') {
    const chanList = eligible
      .map((e) => e.measurement.channelCode.trim().toUpperCase() || e.measurement.id)
      .join(', ');
    return {
      selected: null,
      convertedAmplitudeMm: null,
      candidateCount: eligible.length,
      totalStationMeasurements: stationMeasurements.length,
      status: 'Invalid',
      reason: `Multiple eligible vertical Wood–Anderson measurements (${chanList}); exclude redundant records or use deterministic channel priority`,
    };
  }

  const sorted = [...eligible].sort((a, b) =>
    compareMlvCandidatesDeterministically(a.measurement, b.measurement)
  );
  const chosen = sorted[0];

  return {
    selected: chosen.measurement,
    convertedAmplitudeMm: chosen.convertedMm,
    candidateCount: eligible.length,
    totalStationMeasurements: stationMeasurements.length,
    status: 'Included',
    reason:
      eligible.length > 1
        ? `Selected ${chosen.measurement.channelCode.trim().toUpperCase()} (1 of ${eligible.length} eligible vertical W-A records)`
        : null,
  };
}

/**
 * SeisComP MLv formula:
 * MLv = log10(A_mm) - log10(A0(Delta)) + Cs
 */
export function computeStationMlvFormula(params: {
  amplitudeMm: number;
  logA0: number;
  stationCorrection?: number;
}): number {
  const cs = params.stationCorrection ?? 0;
  return Math.log10(params.amplitudeMm) - params.logA0 + cs;
}

export function formatMlvAttenuationTableText(
  table: ReadonlyArray<MlvAttenuationNode>
): string {
  return table.map((n) => `${n.distanceKm}:${n.logA0}`).join(', ');
}

export function parseMlvAttenuationTableText(
  raw: string
): { ok: true; nodes: MlvAttenuationNode[] } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: true, nodes: [] };
  }
  const tokens = trimmed
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const nodes: MlvAttenuationNode[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const parts = tokens[i].split(':').map((p) => p.trim());
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return {
        ok: false,
        error: `Invalid entry "${tokens[i]}" — expected "distanceKm:logA0" (e.g. 0:-1.3, 60:-2.8).`,
      };
    }
    const distanceKm = Number(parts[0]);
    const logA0 = Number(parts[1]);
    if (!Number.isFinite(distanceKm) || distanceKm < 0 || !Number.isFinite(logA0)) {
      return {
        ok: false,
        error: `Non-numeric or negative distance in "${tokens[i]}".`,
      };
    }
    nodes.push({ distanceKm, logA0 });
  }
  return { ok: true, nodes };
}

export function evaluateMlvMagnitude(
  event: EQPEvent,
  settings: {
    mlvConfig: MlvCalibrationConfig;
    networkAggregation: NetworkAggregationMethod;
  },
  stations: ReadonlyArray<StationMeta> = []
): AlgorithmMagnitudeEvaluation {
  const desc = MLV_ALGORITHM_DISPLAY;
  const mlvCfg = settings.mlvConfig;

  const calibrationStatus: CalibrationStatus =
    mlvCfg.calibrationStatus === 'calibrated'
      ? 'calibrated'
      : mlvCfg.allowExperimentalEvaluation
        ? 'experimental_uncalibrated'
        : 'pending_calibration';

  const profileValidation = validateMlvCalibrationProfile(mlvCfg);
  const provenanceBase = `MLv = log10(A_mm) − log10(A0(${mlvCfg.distanceMetric === 'hypocentral_km' ? 'R_hypo' : 'Δ'})) + Cs (${mlvCfg.profileId})`;

  if (
    mlvCfg.calibrationStatus === 'pending_calibration' &&
    !mlvCfg.allowExperimentalEvaluation
  ) {
    return {
      algorithmId: desc.algorithmId,
      displayName: desc.displayName,
      scientificLabel: desc.scientificLabel,
      scale: desc.scale,
      status: 'missing_calibration',
      statusReason:
        'MLv attenuation calibration is pending official regional parameters. Configure a verified curve or enable experimental evaluation in Advanced Magnitude Settings.',
      networkMagnitude: null,
      rawNetworkMagnitude: null,
      contributingStations: 0,
      excludedStations: 0,
      invalidStations: 0,
      aggregationUsed: settings.networkAggregation,
      calibrationProfileId: mlvCfg.profileId,
      calibrationStatus: 'pending_calibration',
      algorithmVersion: mlvCfg.algorithmVersion,
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
        'MLv attenuation table is incomplete or invalid.',
      networkMagnitude: null,
      rawNetworkMagnitude: null,
      contributingStations: 0,
      excludedStations: 0,
      invalidStations: 0,
      aggregationUsed: settings.networkAggregation,
      calibrationProfileId: mlvCfg.profileId,
      calibrationStatus,
      algorithmVersion: mlvCfg.algorithmVersion,
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
        'Hypocenter is not located yet — epicentral distance Δ (km) is required for MLv attenuation.',
      networkMagnitude: null,
      rawNetworkMagnitude: null,
      contributingStations: 0,
      excludedStations: 0,
      invalidStations: 0,
      aggregationUsed: settings.networkAggregation,
      calibrationProfileId: mlvCfg.profileId,
      calibrationStatus,
      algorithmVersion: mlvCfg.algorithmVersion,
      provenanceSummary: provenanceBase,
      isAuthoritativeForBulletin: false,
      stationDetails: [],
    };
  }

  const depthKm = event.depthKm;
  if (
    !Number.isFinite(depthKm) ||
    depthKm < mlvCfg.minDepthKm ||
    depthKm > mlvCfg.maxDepthKm
  ) {
    return {
      algorithmId: desc.algorithmId,
      displayName: desc.displayName,
      scientificLabel: desc.scientificLabel,
      scale: desc.scale,
      status: 'invalid_measurement',
      statusReason: `Focal depth ${Number.isFinite(depthKm) ? depthKm.toFixed(1) : 'NaN'} km is outside supported MLv range (${mlvCfg.minDepthKm}–${mlvCfg.maxDepthKm} km).`,
      networkMagnitude: null,
      rawNetworkMagnitude: null,
      contributingStations: 0,
      excludedStations: 0,
      invalidStations: 0,
      aggregationUsed: settings.networkAggregation,
      calibrationProfileId: mlvCfg.profileId,
      calibrationStatus,
      algorithmVersion: mlvCfg.algorithmVersion,
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

  const picksById = new Map<string, StationPick>(event.picks.map((p) => [p.id, p]));
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

    // Resolve epicentral distance from live hypocenter + station coordinates when available,
    // falling back to pick.delta (deg * 111.32) if coordinates are absent.
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
        ? mlvCfg.distanceMetric === 'hypocentral_km'
          ? Number(
              Math.sqrt(
                epicentralKm * epicentralKm + depthKm * depthKm
              ).toFixed(2)
            )
          : Number(epicentralKm.toFixed(2))
        : null;

    const netGuess =
      stationRecords[0]?.networkCode?.trim().toUpperCase() ||
      pick.atlasMetadata?.network?.trim().toUpperCase() ||
      '';
    const locGuess = stationRecords[0]?.locationCode?.trim().toUpperCase() || '';
    const defaultCs = resolveMlvStationCorrection(mlvCfg.stationCorrections, {
      networkCode: netGuess,
      stationCode: staCode,
      locationCode: locGuess,
    }).value;

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
        distanceMetricUsed: mlvCfg.distanceMetric,
      };
    }

    const selection = selectStationMlvMeasurement(stationRecords, mlvCfg, {
      eventId: event.id,
      picksById,
    });

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
        mlvCandidateCount: selection.candidateCount,
        distanceMetricUsed: mlvCfg.distanceMetric,
      };
    }

    if (
      selection.status === 'Invalid' ||
      !selection.selected ||
      selection.convertedAmplitudeMm === null
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
        reason: selection.reason ?? 'No eligible MLv amplitude measurement',
        mlvCandidateCount: selection.candidateCount,
        distanceMetricUsed: mlvCfg.distanceMetric,
      };
    }

    const chosen = selection.selected;
    const ampMm = selection.convertedAmplitudeMm;
    const netCode =
      chosen.networkCode.trim().toUpperCase() ||
      pick.atlasMetadata?.network?.trim().toUpperCase() ||
      '';
    const locCode = chosen.locationCode.trim().toUpperCase();
    const csResolved = resolveMlvStationCorrection(mlvCfg.stationCorrections, {
      networkCode: netCode,
      stationCode: staCode,
      locationCode: locCode,
    });
    const cs = csResolved.value;
    const channelLabel = chosen.channelCode.trim().toUpperCase();
    const sourceText = `${channelLabel} (${chosen.source})`;

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
        measurementValue: chosen.amplitude,
        measurementUnit: chosen.unit,
        measurementSource: sourceText,
        selectedMeasurementId: chosen.id,
        selectedChannel: channelLabel,
        convertedAmplitudeMm: Number(ampMm.toFixed(6)),
        attenuationLogA0: null,
        mlvCandidateCount: selection.candidateCount,
        distanceMetricUsed: mlvCfg.distanceMetric,
        distanceKm: null,
        distanceDeg: null,
        depthKm,
        stationCorrection: cs,
        magnitude: null,
        status: 'Invalid',
        reason: 'Missing or invalid station coordinates / distance Δ (km)',
      };
    }

    const logA0Lookup = interpolateMlvLogA0(lookupDistanceKm, mlvCfg);
    if (!logA0Lookup.ok) {
      return {
        pickId: pick.id,
        sta: pick.sta,
        algorithmId: desc.algorithmId,
        scale: desc.scale,
        measurementType: 'amplitude',
        measurementValue: chosen.amplitude,
        measurementUnit: chosen.unit,
        measurementSource: sourceText,
        selectedMeasurementId: chosen.id,
        selectedChannel: channelLabel,
        convertedAmplitudeMm: Number(ampMm.toFixed(6)),
        attenuationLogA0: null,
        mlvCandidateCount: selection.candidateCount,
        distanceMetricUsed: mlvCfg.distanceMetric,
        distanceKm: lookupDistanceKm,
        distanceDeg,
        depthKm,
        stationCorrection: cs,
        magnitude: null,
        status: 'Invalid',
        reason: logA0Lookup.reason,
      };
    }

    const mlvRaw = computeStationMlvFormula({
      amplitudeMm: ampMm,
      logA0: logA0Lookup.logA0,
      stationCorrection: cs,
    });

    if (!Number.isFinite(mlvRaw)) {
      return {
        pickId: pick.id,
        sta: pick.sta,
        algorithmId: desc.algorithmId,
        scale: desc.scale,
        measurementType: 'amplitude',
        measurementValue: chosen.amplitude,
        measurementUnit: chosen.unit,
        measurementSource: sourceText,
        selectedMeasurementId: chosen.id,
        selectedChannel: channelLabel,
        convertedAmplitudeMm: Number(ampMm.toFixed(6)),
        attenuationLogA0: Number(logA0Lookup.logA0.toFixed(4)),
        mlvCandidateCount: selection.candidateCount,
        distanceMetricUsed: mlvCfg.distanceMetric,
        distanceKm: lookupDistanceKm,
        distanceDeg,
        depthKm,
        stationCorrection: cs,
        magnitude: null,
        status: 'Invalid',
        reason: 'Station MLv calculation produced non-finite value',
      };
    }

    const stationMlv = Number(mlvRaw.toFixed(2));
    validStationMagnitudes.push(stationMlv);

    return {
      pickId: pick.id,
      sta: pick.sta,
      algorithmId: desc.algorithmId,
      scale: desc.scale,
      measurementType: 'amplitude',
      measurementValue: chosen.amplitude,
      measurementUnit: chosen.unit,
      measurementSource: sourceText,
      selectedMeasurementId: chosen.id,
      selectedChannel: channelLabel,
      convertedAmplitudeMm: Number(ampMm.toFixed(6)),
      attenuationLogA0: Number(logA0Lookup.logA0.toFixed(4)),
      mlvCandidateCount: selection.candidateCount,
      distanceMetricUsed: mlvCfg.distanceMetric,
      distanceKm: lookupDistanceKm,
      distanceDeg,
      depthKm,
      stationCorrection: cs,
      magnitude: stationMlv,
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
          ? 'No valid station MLv values remained after amplitude, channel, and distance validation.'
          : 'No stations with eligible vertical Wood–Anderson amplitude measurements.',
      networkMagnitude: null,
      rawNetworkMagnitude: null,
      contributingStations: 0,
      totalEligibleStations: 0,
      excludedStations,
      invalidStations,
      aggregationUsed: settings.networkAggregation,
      trimmedCount: 0,
      fallbackApplied: false,
      calibrationProfileId: mlvCfg.profileId,
      calibrationStatus,
      algorithmVersion: mlvCfg.algorithmVersion,
      provenanceSummary: provenanceBase,
      isAuthoritativeForBulletin: false,
      stationDetails,
    };
  }

  if (aggregated.totalEligible < mlvCfg.minContributingStations) {
    return {
      algorithmId: desc.algorithmId,
      displayName: desc.displayName,
      scientificLabel: desc.scientificLabel,
      scale: desc.scale,
      status: 'missing_measurement',
      statusReason: `Only ${aggregated.totalEligible} valid station MLv observation(s); profile requires at least ${mlvCfg.minContributingStations} contributing station(s).`,
      networkMagnitude: null,
      rawNetworkMagnitude: null,
      contributingStations: 0,
      totalEligibleStations: aggregated.totalEligible,
      excludedStations,
      invalidStations,
      aggregationUsed: settings.networkAggregation,
      trimmedCount: 0,
      fallbackApplied: false,
      calibrationProfileId: mlvCfg.profileId,
      calibrationStatus,
      algorithmVersion: mlvCfg.algorithmVersion,
      provenanceSummary: provenanceBase,
      isAuthoritativeForBulletin: false,
      stationDetails,
    };
  }

  const notes: string[] = [];
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
      'Single-station MLv estimate (N = 1) — azimuthal and noise robustness limited'
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
    calibrationProfileId: mlvCfg.profileId,
    calibrationStatus,
    algorithmVersion: mlvCfg.algorithmVersion,
    provenanceSummary: provenanceBase,
    isAuthoritativeForBulletin: calibrationStatus === 'calibrated',
    stationDetails,
  };
}
