import type { EQPEvent, StationPick } from '../data/eqpData.ts';

export type AmplitudeMeasurementCategory =
  | 'raw_waveform'
  | 'wood_anderson_local'
  | 'short_period_p'
  | 'surface_wave'
  | 'other';

export type AmplitudePhysicalQuantity = 'counts' | 'displacement' | 'velocity';

export type AmplitudeUnit = 'counts' | 'm' | 'mm' | 'um' | 'nm' | 'm/s';

export type AmplitudeConvention = 'zero_to_peak' | 'peak_to_peak' | 'unknown';

export type AmplitudePhaseType =
  | 'P'
  | 'S'
  | 'Lg'
  | 'Surface'
  | 'Coda'
  | 'Waveform'
  | 'Unknown';

export type AmplitudeSource =
  | 'manual_entry'
  | 'waveform_pick'
  | 'atlas_hydra'
  | 'imported_external'
  | 'unknown';

export type InstrumentResponseStatus =
  | 'raw_uncorrected'
  | 'wood_anderson_simulated'
  | 'response_corrected_displacement'
  | 'response_corrected_velocity'
  | 'unknown';

export type AmplitudeCorrectedStatus = 'raw' | 'corrected' | 'unknown';

export interface BaseAmplitudeMeasurement {
  id: string;
  eventId: string;
  stationRefId: string;
  networkCode: string;
  stationCode: string;
  locationCode: string;
  channelCode: string;
  amplitude: number;
  physicalQuantity: AmplitudePhysicalQuantity;
  unit: AmplitudeUnit;
  convention: AmplitudeConvention;
  phaseType: AmplitudePhaseType;
  periodSec: number | null;
  windowStartIso?: string | null;
  windowEndIso?: string | null;
  source: AmplitudeSource;
  instrumentResponseStatus: InstrumentResponseStatus;
  processingMethod?: string;
  processingProfileId?: string;
  correctedStatus: AmplitudeCorrectedStatus;
  provenanceNote?: string;
  waveformRef?: string;
  instrumentMetadataRef?: string;
  horizontalOrientationVerified?: boolean;
  channelAzimuthDeg?: number | null;
  channelDipDeg?: number | null;
  clipped: boolean;
  qualityNotes?: string;
  excluded?: boolean;
  exclusionReason?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface RawWaveformAmplitudeMeasurement extends BaseAmplitudeMeasurement {
  measurementCategory: 'raw_waveform';
}

export interface WoodAndersonLocalAmplitudeMeasurement extends BaseAmplitudeMeasurement {
  measurementCategory: 'wood_anderson_local';
}

export interface ShortPeriodPAmplitudeMeasurement extends BaseAmplitudeMeasurement {
  measurementCategory: 'short_period_p';
}

export interface SurfaceWaveAmplitudeMeasurement extends BaseAmplitudeMeasurement {
  measurementCategory: 'surface_wave';
}

export interface OtherAmplitudeMeasurement extends BaseAmplitudeMeasurement {
  measurementCategory: 'other';
  customCategoryLabel?: string;
}

export type AmplitudeMeasurement =
  | RawWaveformAmplitudeMeasurement
  | WoodAndersonLocalAmplitudeMeasurement
  | ShortPeriodPAmplitudeMeasurement
  | SurfaceWaveAmplitudeMeasurement
  | OtherAmplitudeMeasurement;

export type FutureAmplitudeAlgorithmId =
  | 'ml-local'
  | 'mlv-vertical'
  | 'mb-body'
  | 'ms-20';

export interface ScientificEligibilityPlaceholder {
  algorithmId: FutureAmplitudeAlgorithmId;
  status:
    | 'eligible_ml'
    | 'ineligible_ml'
    | 'eligible_mlv'
    | 'ineligible_mlv'
    | 'not_evaluated_mag_a'
    | 'missing_prerequisites'
    | 'disabled_pending_mag_b';
  note: string;
}

export interface AmplitudeValidationResult {
  measurementId: string;
  structuralValid: boolean;
  processingComplete: boolean;
  hasQualityWarning: boolean;
  structuralErrors: string[];
  completenessWarnings: string[];
  qualityWarnings: string[];
  statusLabel: 'Measurements Available' | 'Incomplete' | 'Quality Warning';
  scientificEligibility: ScientificEligibilityPlaceholder[];
}

export type StationAmplitudeSummaryStatus =
  | 'none'
  | 'available'
  | 'incomplete'
  | 'quality_warning';

export interface StationAmplitudeSummary {
  stationRefId: string;
  stationCode: string;
  count: number;
  activeCount: number;
  status: StationAmplitudeSummaryStatus;
  label:
    | 'No Measurements'
    | 'Measurements Available'
    | 'Incomplete'
    | 'Quality Warning';
  channels: string[];
  categories: AmplitudeMeasurementCategory[];
  structuralErrorCount: number;
  incompleteCount: number;
  qualityWarningCount: number;
}

export interface StationPickAssociationAnchor {
  pickId: string;
  sta: string;
  pTime: string;
  sTime: string;
  rowIndex: number;
}

export type AmplitudeAssociationIssueReason =
  | 'ambiguous_station_match'
  | 'unassociated_station_ref'
  | 'station_code_mismatch'
  | 'malformed_sidecar_record';

export interface AmplitudeAssociationIssue {
  id: string;
  measurementId?: string;
  stationRefId?: string;
  stationCode: string;
  reason: AmplitudeAssociationIssueReason;
  message: string;
  recoverableRaw?: unknown;
}

export interface AmplitudeSidecarPayload {
  schemaVersion: number;
  measurements: AmplitudeMeasurement[];
  stationPickAnchors?: StationPickAssociationAnchor[];
  associationIssues?: AmplitudeAssociationIssue[];
}

export const AMPLITUDE_CATEGORY_LABELS: Record<AmplitudeMeasurementCategory, string> = {
  raw_waveform: 'Raw Waveform Counts',
  wood_anderson_local: 'Wood-Anderson Simulated (ML / MLv prep)',
  short_period_p: 'Short-Period P Wave (mb prep)',
  surface_wave: 'Surface Wave ~20s (Ms_20 prep)',
  other: 'Other / Custom Amplitude',
};

export const PHYSICAL_QUANTITY_LABELS: Record<AmplitudePhysicalQuantity, string> = {
  counts: 'Counts (Digital)',
  displacement: 'Ground Displacement',
  velocity: 'Ground Velocity',
};

export const AMPLITUDE_UNIT_LABELS: Record<AmplitudeUnit, string> = {
  counts: 'counts',
  m: 'm',
  mm: 'mm',
  um: 'µm',
  nm: 'nm',
  'm/s': 'm/s',
};

export const AMPLITUDE_CONVENTION_LABELS: Record<AmplitudeConvention, string> = {
  zero_to_peak: 'Zero-to-Peak',
  peak_to_peak: 'Peak-to-Peak',
  unknown: 'Unknown / Unspecified',
};

export const RESPONSE_STATUS_LABELS: Record<InstrumentResponseStatus, string> = {
  raw_uncorrected: 'Raw / Uncorrected',
  wood_anderson_simulated: 'Wood-Anderson Simulated',
  response_corrected_displacement: 'Response-Corrected Displacement',
  response_corrected_velocity: 'Response-Corrected Velocity',
  unknown: 'Unknown / Unverified',
};

export const CORRECTED_STATUS_LABELS: Record<AmplitudeCorrectedStatus, string> = {
  raw: 'Raw (Uncorrected)',
  corrected: 'Corrected',
  unknown: 'Unknown',
};

export const ALLOWED_UNITS_BY_QUANTITY: Record<
  AmplitudePhysicalQuantity,
  ReadonlyArray<AmplitudeUnit>
> = {
  counts: ['counts'],
  displacement: ['m', 'mm', 'um', 'nm'],
  velocity: ['m/s'],
};

const VALID_CATEGORIES = new Set<AmplitudeMeasurementCategory>([
  'raw_waveform',
  'wood_anderson_local',
  'short_period_p',
  'surface_wave',
  'other',
]);

const VALID_QUANTITIES = new Set<AmplitudePhysicalQuantity>([
  'counts',
  'displacement',
  'velocity',
]);

const VALID_UNITS = new Set<AmplitudeUnit>([
  'counts',
  'm',
  'mm',
  'um',
  'nm',
  'm/s',
]);

const VALID_CONVENTIONS = new Set<AmplitudeConvention>([
  'zero_to_peak',
  'peak_to_peak',
  'unknown',
]);

const VALID_PHASES = new Set<AmplitudePhaseType>([
  'P',
  'S',
  'Lg',
  'Surface',
  'Coda',
  'Waveform',
  'Unknown',
]);

const VALID_SOURCES = new Set<AmplitudeSource>([
  'manual_entry',
  'waveform_pick',
  'atlas_hydra',
  'imported_external',
  'unknown',
]);

const VALID_RESPONSE_STATUSES = new Set<InstrumentResponseStatus>([
  'raw_uncorrected',
  'wood_anderson_simulated',
  'response_corrected_displacement',
  'response_corrected_velocity',
  'unknown',
]);

const VALID_CORRECTED_STATUSES = new Set<AmplitudeCorrectedStatus>([
  'raw',
  'corrected',
  'unknown',
]);

export function createAmplitudeMeasurementId(): string {
  return `amp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createDefaultAmplitudeMeasurement(params: {
  eventId: string;
  stationRefId: string;
  stationCode: string;
  networkCode?: string;
  category?: AmplitudeMeasurementCategory;
}): AmplitudeMeasurement {
  const category = params.category ?? 'raw_waveform';
  const nowIso = new Date().toISOString();
  const base: BaseAmplitudeMeasurement = {
    id: createAmplitudeMeasurementId(),
    eventId: params.eventId,
    stationRefId: params.stationRefId,
    networkCode: (params.networkCode ?? '').trim().toUpperCase(),
    stationCode: params.stationCode.trim().toUpperCase(),
    locationCode: '',
    channelCode: '',
    amplitude: 0,
    physicalQuantity: 'counts',
    unit: 'counts',
    convention: 'unknown',
    phaseType:
      category === 'short_period_p'
        ? 'P'
        : category === 'surface_wave'
          ? 'Surface'
          : category === 'wood_anderson_local'
            ? 'S'
            : 'Waveform',
    periodSec: null,
    windowStartIso: null,
    windowEndIso: null,
    source: 'manual_entry',
    instrumentResponseStatus: 'raw_uncorrected',
    processingMethod: '',
    processingProfileId: '',
    correctedStatus: 'raw',
    provenanceNote: '',
    waveformRef: '',
    instrumentMetadataRef: '',
    clipped: false,
    qualityNotes: '',
    excluded: false,
    exclusionReason: '',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  if (category === 'other') {
    return { ...base, measurementCategory: 'other', customCategoryLabel: '' };
  }
  return { ...base, measurementCategory: category };
}

export function isQuantityCompatibleWithUnit(
  quantity: AmplitudePhysicalQuantity,
  unit: AmplitudeUnit
): boolean {
  return ALLOWED_UNITS_BY_QUANTITY[quantity].includes(unit);
}

export function getDefaultUnitForQuantity(
  quantity: AmplitudePhysicalQuantity
): AmplitudeUnit {
  if (quantity === 'counts') return 'counts';
  if (quantity === 'velocity') return 'm/s';
  return 'um';
}

export function isValidSeedChannelCode(channelCode: string): boolean {
  const trimmed = channelCode.trim().toUpperCase();
  return /^[A-Z0-9]{2,4}$/.test(trimmed);
}

export function cloneAmplitudeMeasurement(
  m: AmplitudeMeasurement
): AmplitudeMeasurement {
  return { ...m };
}

export function validateAmplitudeMeasurement(
  m: AmplitudeMeasurement,
  context?: {
    eventId?: string;
    picksById?: ReadonlyMap<string, StationPick>;
    duplicateMeasurementIds?: ReadonlySet<string>;
  }
): AmplitudeValidationResult {
  const structuralErrors: string[] = [];
  const completenessWarnings: string[] = [];
  const qualityWarnings: string[] = [];

  if (!m.id || !m.id.trim()) {
    structuralErrors.push('Measurement ID is required.');
  } else if (context?.duplicateMeasurementIds?.has(m.id)) {
    structuralErrors.push(`Duplicate measurement ID "${m.id}" within event.`);
  }

  if (!m.eventId || !m.eventId.trim()) {
    structuralErrors.push('Event ID association is required.');
  } else if (context?.eventId && m.eventId !== context.eventId) {
    structuralErrors.push(
      `Measurement eventId "${m.eventId}" does not match active event "${context.eventId}".`
    );
  }

  if (!m.stationRefId || !m.stationRefId.trim()) {
    structuralErrors.push('Station pick reference ID (stationRefId) is required.');
  }

  const cleanSta = m.stationCode.trim().toUpperCase();
  if (!cleanSta) {
    structuralErrors.push('Station code is required.');
  } else if (!/^[A-Z0-9_-]{2,6}$/.test(cleanSta)) {
    structuralErrors.push(
      `Station code "${m.stationCode}" has invalid characters or length.`
    );
  }

  if (context?.picksById) {
    const matchedPick = context.picksById.get(m.stationRefId);
    if (!matchedPick) {
      structuralErrors.push(
        `Station reference "${m.stationRefId}" is not associated with any row in this event.`
      );
    } else if (
      cleanSta &&
      matchedPick.sta.trim().toUpperCase() &&
      matchedPick.sta.trim().toUpperCase() !== cleanSta
    ) {
      qualityWarnings.push(
        `Measurement station code "${cleanSta}" differs from pick row code "${matchedPick.sta.trim().toUpperCase()}".`
      );
    }
  }

  if (!Number.isFinite(m.amplitude) || m.amplitude <= 0) {
    structuralErrors.push(
      'Amplitude must be a finite number strictly greater than 0.'
    );
  }

  if (!VALID_CATEGORIES.has(m.measurementCategory)) {
    structuralErrors.push(
      `Unsupported measurement category "${String(m.measurementCategory)}".`
    );
  }

  if (!VALID_QUANTITIES.has(m.physicalQuantity)) {
    structuralErrors.push(
      `Unsupported physical quantity "${String(m.physicalQuantity)}".`
    );
  }

  if (!VALID_UNITS.has(m.unit)) {
    structuralErrors.push(`Unsupported amplitude unit "${String(m.unit)}".`);
  }

  if (
    VALID_QUANTITIES.has(m.physicalQuantity) &&
    VALID_UNITS.has(m.unit) &&
    !isQuantityCompatibleWithUnit(m.physicalQuantity, m.unit)
  ) {
    structuralErrors.push(
      `Physical quantity "${m.physicalQuantity}" is incompatible with unit "${m.unit}".`
    );
  }

  // Raw digital counts cannot be masqueraded as calibrated displacement/velocity or marked corrected
  if (
    m.instrumentResponseStatus === 'raw_uncorrected' &&
    m.physicalQuantity !== 'counts'
  ) {
    structuralErrors.push(
      'Raw/uncorrected instrument status cannot claim calibrated ground displacement or velocity.'
    );
  }

  if (
    m.instrumentResponseStatus === 'raw_uncorrected' &&
    m.correctedStatus === 'corrected'
  ) {
    structuralErrors.push(
      'Contradictory metadata: raw/uncorrected response status cannot have correctedStatus = "corrected".'
    );
  }

  if (
    m.correctedStatus === 'raw' &&
    m.physicalQuantity !== 'counts' &&
    m.instrumentResponseStatus !== 'unknown'
  ) {
    structuralErrors.push(
      'Raw correctedStatus cannot be paired with calibrated displacement or velocity response metadata.'
    );
  }

  if (m.periodSec !== null && m.periodSec !== undefined) {
    if (!Number.isFinite(m.periodSec) || m.periodSec <= 0) {
      structuralErrors.push('Period T (s) must be a finite positive number.');
    }
  }

  if (m.channelAzimuthDeg !== null && m.channelAzimuthDeg !== undefined) {
    if (
      !Number.isFinite(m.channelAzimuthDeg) ||
      m.channelAzimuthDeg < 0 ||
      m.channelAzimuthDeg > 360
    ) {
      structuralErrors.push(
        'Channel azimuth (°) must be a finite number between 0 and 360.'
      );
    }
  }

  if (m.channelDipDeg !== null && m.channelDipDeg !== undefined) {
    if (
      !Number.isFinite(m.channelDipDeg) ||
      m.channelDipDeg < -90 ||
      m.channelDipDeg > 90
    ) {
      structuralErrors.push(
        'Channel dip (°) must be a finite number between -90 and 90.'
      );
    }
  }

  const startRaw = m.windowStartIso?.trim() || '';
  const endRaw = m.windowEndIso?.trim() || '';
  let startMs: number | null = null;
  let endMs: number | null = null;
  if (startRaw) {
    startMs = Date.parse(startRaw);
    if (!Number.isFinite(startMs)) {
      structuralErrors.push('Measurement window start time is not a valid timestamp.');
    }
  }
  if (endRaw) {
    endMs = Date.parse(endRaw);
    if (!Number.isFinite(endMs)) {
      structuralErrors.push('Measurement window end time is not a valid timestamp.');
    }
  }
  if (
    startMs !== null &&
    endMs !== null &&
    Number.isFinite(startMs) &&
    Number.isFinite(endMs) &&
    endMs < startMs
  ) {
    structuralErrors.push(
      'Measurement window end time cannot precede window start time.'
    );
  }

  const cleanChannel = m.channelCode.trim().toUpperCase();
  if (!cleanChannel) {
    completenessWarnings.push('Channel code (e.g. BHZ, HHN, SHZ) is not specified.');
  } else if (!isValidSeedChannelCode(cleanChannel)) {
    structuralErrors.push(
      `Invalid channel code "${m.channelCode}" (expected 2–4 alphanumeric SEED characters, e.g. BHZ).`
    );
  }

  // Processing completeness checks
  if (m.convention === 'unknown') {
    completenessWarnings.push(
      'Amplitude convention (zero-to-peak vs peak-to-peak) is unspecified.'
    );
  }

  if (
    m.instrumentResponseStatus === 'unknown' ||
    m.instrumentResponseStatus === 'raw_uncorrected'
  ) {
    completenessWarnings.push(
      m.instrumentResponseStatus === 'raw_uncorrected'
        ? 'Instrument response has not been deconvolved/corrected (raw counts only).'
        : 'Instrument response status is unknown/unverified.'
    );
  }

  if (m.correctedStatus === 'unknown' || m.correctedStatus === 'raw') {
    completenessWarnings.push(
      m.correctedStatus === 'raw'
        ? 'Measurement is marked raw (uncorrected).'
        : 'Corrected status is unknown.'
    );
  }

  const requiresPeriod =
    m.measurementCategory === 'short_period_p' ||
    m.measurementCategory === 'surface_wave';
  if (requiresPeriod && (m.periodSec === null || m.periodSec === undefined)) {
    completenessWarnings.push(
      m.measurementCategory === 'short_period_p'
        ? 'Dominant period T (s) is required for short-period P (A/T) measurements.'
        : 'Surface-wave period T (s) near 20 s is required for Ms_20 measurements.'
    );
  }

  if (m.phaseType === 'Unknown') {
    completenessWarnings.push('Measured seismic phase is unspecified.');
  }

  // Quality warnings (clipped, excluded, or structural failure)
  if (m.clipped) {
    qualityWarnings.push('Waveform clipped flag is set — peak amplitude may be underestimated.');
  }
  if (m.excluded) {
    qualityWarnings.push(
      m.exclusionReason?.trim()
        ? `Excluded by analyst: ${m.exclusionReason.trim()}`
        : 'Measurement marked excluded.'
    );
  }

  const structuralValid = structuralErrors.length === 0;
  const processingComplete =
    structuralValid && completenessWarnings.length === 0;
  const hasQualityWarning = !structuralValid || qualityWarnings.length > 0;

  const statusLabel: AmplitudeValidationResult['statusLabel'] = hasQualityWarning
    ? 'Quality Warning'
    : processingComplete
      ? 'Measurements Available'
      : 'Incomplete';

  // Scientific eligibility: MLv active in MAG-B, ML active in MAG-D; mb / Ms_20 remain disabled until future batches
  const mlvVerticalValid =
    structuralValid &&
    !m.excluded &&
    !m.clipped &&
    m.measurementCategory === 'wood_anderson_local' &&
    m.physicalQuantity === 'displacement' &&
    m.instrumentResponseStatus === 'wood_anderson_simulated' &&
    m.correctedStatus === 'corrected' &&
    Boolean(cleanChannel && cleanChannel.endsWith('Z')) &&
    m.convention !== 'unknown' &&
    ['m', 'mm', 'um', 'nm'].includes(m.unit);

  const mlvReason = !structuralValid
    ? 'Resolve structural validation errors first.'
    : m.excluded
      ? 'Excluded by analyst from magnitude evaluation.'
      : m.clipped
        ? 'Waveform clipped — excluded from MLv.'
        : m.measurementCategory !== 'wood_anderson_local'
          ? 'Requires Wood–Anderson simulated local category.'
          : m.physicalQuantity !== 'displacement'
            ? 'Requires ground displacement quantity (m/mm/µm/nm).'
            : m.instrumentResponseStatus !== 'wood_anderson_simulated'
              ? 'Requires Wood–Anderson simulated instrument response.'
              : m.correctedStatus !== 'corrected'
                ? 'Requires verified corrected status.'
                : !cleanChannel || !cleanChannel.endsWith('Z')
                  ? 'Requires explicit vertical (..Z) SEED channel.'
                  : m.convention === 'unknown'
                    ? 'Requires known amplitude convention (zero-to-peak or peak-to-peak).'
                    : 'Eligible for MLv (subject to matching profile convention & calibrated Δ bounds).';

  const chanSuffix = cleanChannel ? cleanChannel.slice(-1) : '';
  const hasDipError =
    m.channelDipDeg !== null &&
    m.channelDipDeg !== undefined &&
    Number.isFinite(m.channelDipDeg) &&
    Math.abs(m.channelDipDeg) > 5;
  const isHorizontalForMl =
    Boolean(cleanChannel) &&
    !cleanChannel.endsWith('Z') &&
    !hasDipError &&
    (chanSuffix === 'N' ||
      chanSuffix === 'E' ||
      ((chanSuffix === '1' || chanSuffix === '2') &&
        (Boolean(m.horizontalOrientationVerified) ||
          (m.channelAzimuthDeg !== null &&
            m.channelAzimuthDeg !== undefined &&
            Number.isFinite(m.channelAzimuthDeg) &&
            m.channelDipDeg !== null &&
            m.channelDipDeg !== undefined &&
            Number.isFinite(m.channelDipDeg) &&
            Math.abs(m.channelDipDeg) <= 5))) ||
      (Boolean(m.horizontalOrientationVerified) &&
        m.channelAzimuthDeg !== null &&
        m.channelAzimuthDeg !== undefined &&
        Number.isFinite(m.channelAzimuthDeg)));

  const mlHorizontalValid =
    structuralValid &&
    !m.excluded &&
    !m.clipped &&
    m.measurementCategory === 'wood_anderson_local' &&
    m.physicalQuantity === 'displacement' &&
    m.instrumentResponseStatus === 'wood_anderson_simulated' &&
    m.correctedStatus === 'corrected' &&
    isHorizontalForMl &&
    m.convention !== 'unknown' &&
    ['m', 'mm', 'um', 'nm'].includes(m.unit);

  const mlReason = !structuralValid
    ? 'Resolve structural validation errors first.'
    : m.excluded
      ? 'Excluded by analyst from magnitude evaluation.'
      : m.clipped
        ? 'Waveform clipped — excluded from ML.'
        : m.measurementCategory !== 'wood_anderson_local'
          ? 'Requires Wood–Anderson simulated local category.'
          : m.physicalQuantity !== 'displacement'
            ? 'Requires ground displacement quantity (m/mm/µm/nm).'
            : m.instrumentResponseStatus !== 'wood_anderson_simulated'
              ? 'Requires Wood–Anderson simulated instrument response.'
              : m.correctedStatus !== 'corrected'
                ? 'Requires verified corrected status.'
                : !cleanChannel
                  ? 'Requires horizontal SEED channel (..N/..E or orientation-verified ..1/..2).'
                  : cleanChannel.endsWith('Z')
                    ? 'Vertical (..Z) channel rejected for horizontal ML (use MLv for vertical).'
                    : hasDipError
                      ? `Non-horizontal sensor dip (${m.channelDipDeg}°; |dip| must be ≤ 5°).`
                      : !isHorizontalForMl
                        ? chanSuffix === '1' || chanSuffix === '2'
                          ? `Numeric channel ${cleanChannel} requires verified horizontal orientation metadata (azimuth/dip or explicit verification).`
                          : `Channel ${cleanChannel} has unresolved horizontal orientation for ML.`
                        : m.convention === 'unknown'
                          ? 'Requires known amplitude convention (zero-to-peak or peak-to-peak).'
                          : 'Eligible horizontal component for ML (paired N/E or 1/2 required unless profile permits 1-component mode).';

  const scientificEligibility: ScientificEligibilityPlaceholder[] = (
    ['ml-local', 'mlv-vertical', 'mb-body', 'ms-20'] as const
  ).map((algorithmId) => {
    if (algorithmId === 'ml-local') {
      return {
        algorithmId,
        status: mlHorizontalValid ? 'eligible_ml' : 'ineligible_ml',
        note: mlReason,
      };
    }
    if (algorithmId === 'mlv-vertical') {
      return {
        algorithmId,
        status: mlvVerticalValid ? 'eligible_mlv' : 'ineligible_mlv',
        note: mlvReason,
      };
    }
    return {
      algorithmId,
      status:
        !structuralValid || !processingComplete
          ? 'missing_prerequisites'
          : 'disabled_pending_mag_b',
      note: !structuralValid
        ? 'Resolve structural validation errors first (algorithm disabled pending future batch).'
        : !processingComplete
          ? 'Complete channel/response/period metadata required before future evaluation (algorithm disabled pending future batch).'
          : 'Prepared for future magnitude batch; computation currently disabled.',
    };
  });

  return {
    measurementId: m.id,
    structuralValid,
    processingComplete,
    hasQualityWarning,
    structuralErrors,
    completenessWarnings,
    qualityWarnings,
    statusLabel,
    scientificEligibility,
  };
}

export function validateEventAmplitudeMeasurements(
  event: Pick<EQPEvent, 'id' | 'picks' | 'amplitudeMeasurements'>
): {
  resultsById: Map<string, AmplitudeValidationResult>;
  duplicateIds: Set<string>;
  stationSummariesByPickId: Map<string, StationAmplitudeSummary>;
} {
  const measurements = event.amplitudeMeasurements ?? [];
  const seenIds = new Set<string>();
  const duplicateIds = new Set<string>();
  for (const m of measurements) {
    if (m.id) {
      if (seenIds.has(m.id)) {
        duplicateIds.add(m.id);
      } else {
        seenIds.add(m.id);
      }
    }
  }

  const picksById = new Map<string, StationPick>(
    event.picks.map((p) => [p.id, p])
  );
  const resultsById = new Map<string, AmplitudeValidationResult>();
  for (const m of measurements) {
    resultsById.set(
      m.id,
      validateAmplitudeMeasurement(m, {
        eventId: event.id,
        picksById,
        duplicateMeasurementIds: duplicateIds,
      })
    );
  }

  const stationSummariesByPickId = new Map<string, StationAmplitudeSummary>();
  for (const pick of event.picks) {
    const stationItems = measurements.filter(
      (m) => m.stationRefId === pick.id
    );
    stationSummariesByPickId.set(
      pick.id,
      summarizeStationMeasurements(pick, stationItems, resultsById)
    );
  }

  return {
    resultsById,
    duplicateIds,
    stationSummariesByPickId,
  };
}

export function summarizeStationMeasurements(
  pick: Pick<StationPick, 'id' | 'sta'>,
  stationMeasurements: ReadonlyArray<AmplitudeMeasurement>,
  precomputedValidations?: ReadonlyMap<string, AmplitudeValidationResult>
): StationAmplitudeSummary {
  if (stationMeasurements.length === 0) {
    return {
      stationRefId: pick.id,
      stationCode: pick.sta.trim().toUpperCase(),
      count: 0,
      activeCount: 0,
      status: 'none',
      label: 'No Measurements',
      channels: [],
      categories: [],
      structuralErrorCount: 0,
      incompleteCount: 0,
      qualityWarningCount: 0,
    };
  }

  let structuralErrorCount = 0;
  let incompleteCount = 0;
  let qualityWarningCount = 0;
  let activeCount = 0;
  const channelSet = new Set<string>();
  const categorySet = new Set<AmplitudeMeasurementCategory>();

  for (const m of stationMeasurements) {
    if (!m.excluded) activeCount += 1;
    if (m.channelCode.trim()) channelSet.add(m.channelCode.trim().toUpperCase());
    categorySet.add(m.measurementCategory);
    const val =
      precomputedValidations?.get(m.id) ??
      validateAmplitudeMeasurement(m);
    if (!val.structuralValid) structuralErrorCount += 1;
    if (!val.processingComplete) incompleteCount += 1;
    if (val.hasQualityWarning) qualityWarningCount += 1;
  }

  let status: StationAmplitudeSummaryStatus = 'available';
  let label: StationAmplitudeSummary['label'] = 'Measurements Available';
  if (structuralErrorCount > 0 || qualityWarningCount > 0) {
    status = 'quality_warning';
    label = 'Quality Warning';
  } else if (incompleteCount > 0) {
    status = 'incomplete';
    label = 'Incomplete';
  }

  return {
    stationRefId: pick.id,
    stationCode: pick.sta.trim().toUpperCase(),
    count: stationMeasurements.length,
    activeCount,
    status,
    label,
    channels: Array.from(channelSet),
    categories: Array.from(categorySet),
    structuralErrorCount,
    incompleteCount,
    qualityWarningCount,
  };
}

export function buildStationPickAnchors(
  picks: ReadonlyArray<StationPick>
): StationPickAssociationAnchor[] {
  return picks.map((p, rowIndex) => ({
    pickId: p.id,
    sta: p.sta.trim().toUpperCase(),
    pTime: p.pTime.trim(),
    sTime: p.sTime.trim(),
    rowIndex,
  }));
}

function sanitizeSingleMeasurementRecord(
  raw: unknown,
  fallbackEventId: string
): { ok: true; value: AmplitudeMeasurement } | { ok: false; reason: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: 'Record is not an object.' };
  }
  const obj = raw as Record<string, unknown>;
  const rawCategory = obj.measurementCategory;
  const measurementCategory: AmplitudeMeasurementCategory =
    typeof rawCategory === 'string' &&
    VALID_CATEGORIES.has(rawCategory as AmplitudeMeasurementCategory)
      ? (rawCategory as AmplitudeMeasurementCategory)
      : 'other';
  if (
    typeof rawCategory === 'string' &&
    !VALID_CATEGORIES.has(rawCategory as AmplitudeMeasurementCategory)
  ) {
    return {
      ok: false,
      reason: `Unrecognized measurementCategory "${rawCategory}".`,
    };
  }

  const amplitude =
    typeof obj.amplitude === 'number'
      ? obj.amplitude
      : typeof obj.amplitude === 'string' && obj.amplitude.trim() !== ''
        ? Number(obj.amplitude)
        : NaN;
  if (!Number.isFinite(amplitude)) {
    return { ok: false, reason: 'Amplitude value is missing or non-numeric.' };
  }

  const physicalQuantity = obj.physicalQuantity as AmplitudePhysicalQuantity;
  if (!VALID_QUANTITIES.has(physicalQuantity)) {
    return {
      ok: false,
      reason: `Invalid physicalQuantity "${String(obj.physicalQuantity)}".`,
    };
  }

  const unit = obj.unit as AmplitudeUnit;
  if (!VALID_UNITS.has(unit)) {
    return { ok: false, reason: `Invalid unit "${String(obj.unit)}".` };
  }

  const id =
    typeof obj.id === 'string' && obj.id.trim()
      ? obj.id.trim()
      : createAmplitudeMeasurementId();
  const stationRefId =
    typeof obj.stationRefId === 'string' ? obj.stationRefId.trim() : '';
  const stationCode =
    typeof obj.stationCode === 'string'
      ? obj.stationCode.trim().toUpperCase()
      : '';
  if (!stationRefId && !stationCode) {
    return {
      ok: false,
      reason: 'Both stationRefId and stationCode are missing.',
    };
  }

  const convention: AmplitudeConvention = VALID_CONVENTIONS.has(
    obj.convention as AmplitudeConvention
  )
    ? (obj.convention as AmplitudeConvention)
    : 'unknown';
  const phaseType: AmplitudePhaseType = VALID_PHASES.has(
    obj.phaseType as AmplitudePhaseType
  )
    ? (obj.phaseType as AmplitudePhaseType)
    : 'Unknown';
  const source: AmplitudeSource = VALID_SOURCES.has(
    obj.source as AmplitudeSource
  )
    ? (obj.source as AmplitudeSource)
    : 'unknown';
  const instrumentResponseStatus: InstrumentResponseStatus =
    VALID_RESPONSE_STATUSES.has(
      obj.instrumentResponseStatus as InstrumentResponseStatus
    )
      ? (obj.instrumentResponseStatus as InstrumentResponseStatus)
      : 'unknown';
  const correctedStatus: AmplitudeCorrectedStatus =
    VALID_CORRECTED_STATUSES.has(
      obj.correctedStatus as AmplitudeCorrectedStatus
    )
      ? (obj.correctedStatus as AmplitudeCorrectedStatus)
      : 'unknown';

  let periodSec: number | null = null;
  if (obj.periodSec !== null && obj.periodSec !== undefined && obj.periodSec !== '') {
    const parsedPeriod = Number(obj.periodSec);
    if (!Number.isFinite(parsedPeriod)) {
      return { ok: false, reason: 'Invalid non-numeric periodSec.' };
    }
    periodSec = parsedPeriod;
  }

  let channelAzimuthDeg: number | null | undefined = undefined;
  if (
    obj.channelAzimuthDeg !== undefined &&
    obj.channelAzimuthDeg !== null &&
    obj.channelAzimuthDeg !== ''
  ) {
    const parsedAz = Number(obj.channelAzimuthDeg);
    if (!Number.isFinite(parsedAz)) {
      return { ok: false, reason: 'Invalid non-numeric channelAzimuthDeg.' };
    }
    channelAzimuthDeg = parsedAz;
  } else if (obj.channelAzimuthDeg === null) {
    channelAzimuthDeg = null;
  }

  let channelDipDeg: number | null | undefined = undefined;
  if (
    obj.channelDipDeg !== undefined &&
    obj.channelDipDeg !== null &&
    obj.channelDipDeg !== ''
  ) {
    const parsedDip = Number(obj.channelDipDeg);
    if (!Number.isFinite(parsedDip)) {
      return { ok: false, reason: 'Invalid non-numeric channelDipDeg.' };
    }
    channelDipDeg = parsedDip;
  } else if (obj.channelDipDeg === null) {
    channelDipDeg = null;
  }

  const base: BaseAmplitudeMeasurement = {
    id,
    eventId:
      typeof obj.eventId === 'string' && obj.eventId.trim()
        ? obj.eventId.trim()
        : fallbackEventId,
    stationRefId,
    networkCode:
      typeof obj.networkCode === 'string'
        ? obj.networkCode.trim().toUpperCase()
        : '',
    stationCode,
    locationCode:
      typeof obj.locationCode === 'string'
        ? obj.locationCode.trim().toUpperCase()
        : '',
    channelCode:
      typeof obj.channelCode === 'string'
        ? obj.channelCode.trim().toUpperCase()
        : '',
    amplitude,
    physicalQuantity,
    unit,
    convention,
    phaseType,
    periodSec,
    windowStartIso:
      typeof obj.windowStartIso === 'string' ? obj.windowStartIso : null,
    windowEndIso:
      typeof obj.windowEndIso === 'string' ? obj.windowEndIso : null,
    source,
    instrumentResponseStatus,
    processingMethod:
      typeof obj.processingMethod === 'string' ? obj.processingMethod : undefined,
    processingProfileId:
      typeof obj.processingProfileId === 'string'
        ? obj.processingProfileId
        : undefined,
    correctedStatus,
    provenanceNote:
      typeof obj.provenanceNote === 'string' ? obj.provenanceNote : undefined,
    waveformRef: typeof obj.waveformRef === 'string' ? obj.waveformRef : undefined,
    instrumentMetadataRef:
      typeof obj.instrumentMetadataRef === 'string'
        ? obj.instrumentMetadataRef
        : undefined,
    ...(typeof obj.horizontalOrientationVerified === 'boolean'
      ? { horizontalOrientationVerified: obj.horizontalOrientationVerified }
      : {}),
    ...(channelAzimuthDeg !== undefined ? { channelAzimuthDeg } : {}),
    ...(channelDipDeg !== undefined ? { channelDipDeg } : {}),
    clipped: Boolean(obj.clipped),
    qualityNotes:
      typeof obj.qualityNotes === 'string' ? obj.qualityNotes : undefined,
    excluded: Boolean(obj.excluded),
    exclusionReason:
      typeof obj.exclusionReason === 'string' ? obj.exclusionReason : undefined,
    createdAt: typeof obj.createdAt === 'string' ? obj.createdAt : undefined,
    updatedAt: typeof obj.updatedAt === 'string' ? obj.updatedAt : undefined,
  };

  if (measurementCategory === 'other') {
    return {
      ok: true,
      value: {
        ...base,
        measurementCategory: 'other',
        ...(typeof obj.customCategoryLabel === 'string'
          ? { customCategoryLabel: obj.customCategoryLabel }
          : {}),
      },
    };
  }

  return {
    ok: true,
    value: {
      ...base,
      measurementCategory,
    },
  };
}

export function sanitizeAmplitudeSidecar(
  raw: unknown,
  fallbackEventId = ''
): {
  measurements: AmplitudeMeasurement[];
  stationPickAnchors: StationPickAssociationAnchor[];
  issues: AmplitudeAssociationIssue[];
} {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      measurements: [],
      stationPickAnchors: [],
      issues: raw
        ? [
            {
              id: `amp-issue-sidecar-${Date.now()}`,
              stationCode: 'EVENT',
              reason: 'malformed_sidecar_record',
              message: 'Sidecar amplitudeMetadata is malformed and was ignored safely.',
              recoverableRaw: raw,
            },
          ]
        : [],
    };
  }

  const obj = raw as Record<string, unknown>;
  const issues: AmplitudeAssociationIssue[] = [];
  const measurements: AmplitudeMeasurement[] = [];

  if (obj.measurements !== undefined) {
    if (!Array.isArray(obj.measurements)) {
      issues.push({
        id: `amp-issue-list-${Date.now()}`,
        stationCode: 'EVENT',
        reason: 'malformed_sidecar_record',
        message: 'Sidecar amplitude measurements field is not an array and was ignored safely.',
        recoverableRaw: obj.measurements,
      });
    } else {
      obj.measurements.forEach((entry, idx) => {
        const res = sanitizeSingleMeasurementRecord(entry, fallbackEventId);
        if (res.ok) {
          measurements.push(res.value);
        } else {
          const staGuess =
            entry &&
            typeof entry === 'object' &&
            typeof (entry as Record<string, unknown>).stationCode === 'string'
              ? String((entry as Record<string, unknown>).stationCode).toUpperCase()
              : `ROW#${idx + 1}`;
          issues.push({
            id: `amp-issue-malformed-${idx}-${Date.now()}`,
            stationCode: staGuess,
            reason: 'malformed_sidecar_record',
            message: `Ignored malformed amplitude measurement #${idx + 1}: ${res.reason}`,
            recoverableRaw: entry,
          });
        }
      });
    }
  }

  const stationPickAnchors: StationPickAssociationAnchor[] = [];
  if (Array.isArray(obj.stationPickAnchors)) {
    obj.stationPickAnchors.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const a = item as Record<string, unknown>;
      if (typeof a.pickId !== 'string' || !a.pickId.trim()) return;
      stationPickAnchors.push({
        pickId: a.pickId.trim(),
        sta: typeof a.sta === 'string' ? a.sta.trim().toUpperCase() : '',
        pTime: typeof a.pTime === 'string' ? a.pTime.trim() : '',
        sTime: typeof a.sTime === 'string' ? a.sTime.trim() : '',
        rowIndex:
          typeof a.rowIndex === 'number' && Number.isFinite(a.rowIndex)
            ? Math.trunc(a.rowIndex)
            : -1,
      });
    });
  }

  if (Array.isArray(obj.associationIssues)) {
    obj.associationIssues.forEach((item, idx) => {
      if (!item || typeof item !== 'object') return;
      const iss = item as Record<string, unknown>;
      if (typeof iss.message !== 'string') return;
      issues.push({
        id:
          typeof iss.id === 'string' && iss.id.trim()
            ? iss.id.trim()
            : `amp-issue-prev-${idx}`,
        measurementId:
          typeof iss.measurementId === 'string' ? iss.measurementId : undefined,
        stationRefId:
          typeof iss.stationRefId === 'string' ? iss.stationRefId : undefined,
        stationCode:
          typeof iss.stationCode === 'string'
            ? iss.stationCode.toUpperCase()
            : 'UNKNOWN',
        reason:
          iss.reason === 'ambiguous_station_match' ||
          iss.reason === 'unassociated_station_ref' ||
          iss.reason === 'station_code_mismatch' ||
          iss.reason === 'malformed_sidecar_record'
            ? iss.reason
            : 'malformed_sidecar_record',
        message: iss.message,
      });
    });
  }

  return { measurements, stationPickAnchors, issues };
}

/**
 * Deterministically restores persistent stationRefIds onto newly parsed .eqp picks
 * using sidecar anchors, and reconciles amplitude measurements safely.
 * Never silently attaches an ambiguous station code match to the wrong row.
 */
export function reconcileLoadedAmplitudeSidecar(
  event: EQPEvent,
  rawSidecar: unknown
): EQPEvent {
  if (!rawSidecar) {
    return event;
  }

  const sanitized = sanitizeAmplitudeSidecar(rawSidecar, event.id);
  const picks = event.picks.map((p) => ({ ...p }));

  // Step 1: Restore persistent pick IDs using stationPickAnchors when unambiguous
  if (sanitized.stationPickAnchors.length > 0 && picks.length > 0) {
    const pickSig = (sta: string, pTime: string, sTime: string) =>
      `${sta.trim().toUpperCase()}|${pTime.trim()}|${sTime.trim()}`;

    const picksBySig = new Map<string, number[]>();
    picks.forEach((p, idx) => {
      const sig = pickSig(p.sta, p.pTime, p.sTime);
      const arr = picksBySig.get(sig) ?? [];
      arr.push(idx);
      picksBySig.set(sig, arr);
    });

    const anchorsBySig = new Map<string, StationPickAssociationAnchor[]>();
    for (const anchor of sanitized.stationPickAnchors) {
      const sig = pickSig(anchor.sta, anchor.pTime, anchor.sTime);
      const arr = anchorsBySig.get(sig) ?? [];
      arr.push(anchor);
      anchorsBySig.set(sig, arr);
    }

    const assignedPickIndices = new Set<number>();
    const assignedAnchorIds = new Set<string>();

    // First pass: unique exact signature match (sta + pTime + sTime)
    for (const [sig, anchorList] of anchorsBySig.entries()) {
      const pickList = picksBySig.get(sig) ?? [];
      if (anchorList.length === 1 && pickList.length === 1) {
        const pickIdx = pickList[0];
        const anchor = anchorList[0];
        if (!assignedPickIndices.has(pickIdx) && !assignedAnchorIds.has(anchor.pickId)) {
          picks[pickIdx].id = anchor.pickId;
          assignedPickIndices.add(pickIdx);
          assignedAnchorIds.add(anchor.pickId);
        }
      }
    }

    // Second pass: for duplicate signatures or modified times, allow exact rowIndex match only if station code matches
    for (const anchor of sanitized.stationPickAnchors) {
      if (assignedAnchorIds.has(anchor.pickId)) continue;
      if (anchor.rowIndex >= 0 && anchor.rowIndex < picks.length && !assignedPickIndices.has(anchor.rowIndex)) {
        const candidatePick = picks[anchor.rowIndex];
        if (candidatePick.sta.trim().toUpperCase() === anchor.sta.trim().toUpperCase()) {
          // Verify there aren't ambiguous unaligned picks with the same code whose order shifted
          const totalWithCode = picks.filter(
            (p) => p.sta.trim().toUpperCase() === anchor.sta.trim().toUpperCase()
          ).length;
          const anchorsWithCode = sanitized.stationPickAnchors.filter(
            (a) => a.sta.trim().toUpperCase() === anchor.sta.trim().toUpperCase()
          ).length;
          if (totalWithCode === 1 || totalWithCode === anchorsWithCode) {
            candidatePick.id = anchor.pickId;
            assignedPickIndices.add(anchor.rowIndex);
            assignedAnchorIds.add(anchor.pickId);
          }
        }
      }
    }
  }

  const pickById = new Map<string, StationPick>(picks.map((p) => [p.id, p]));
  const picksBySta = new Map<string, StationPick[]>();
  for (const p of picks) {
    const code = p.sta.trim().toUpperCase();
    if (!code) continue;
    const list = picksBySta.get(code) ?? [];
    list.push(p);
    picksBySta.set(code, list);
  }

  const issues: AmplitudeAssociationIssue[] = [...sanitized.issues];
  const reconciledMeasurements: AmplitudeMeasurement[] = [];

  for (const m of sanitized.measurements) {
    const normalized: AmplitudeMeasurement = {
      ...m,
      eventId: event.id,
      stationCode: m.stationCode.trim().toUpperCase(),
    };

    const directPick = normalized.stationRefId
      ? pickById.get(normalized.stationRefId)
      : undefined;

    if (directPick) {
      const pickSta = directPick.sta.trim().toUpperCase();
      if (normalized.stationCode && pickSta && normalized.stationCode !== pickSta) {
        issues.push({
          id: `amp-issue-mismatch-${normalized.id}`,
          measurementId: normalized.id,
          stationRefId: directPick.id,
          stationCode: normalized.stationCode,
          reason: 'station_code_mismatch',
          message: `Amplitude record "${normalized.id}" references station "${normalized.stationCode}", but matched pick "${directPick.id}" is "${pickSta}". Preserved without overwriting.`,
        });
      }
      reconciledMeasurements.push(normalized);
      continue;
    }

    // Attempt unambiguous station code fallback ONLY when stationCode appears exactly once
    const candidates = normalized.stationCode
      ? picksBySta.get(normalized.stationCode) ?? []
      : [];
    if (candidates.length === 1) {
      reconciledMeasurements.push({
        ...normalized,
        stationRefId: candidates[0].id,
      });
    } else if (candidates.length > 1) {
      issues.push({
        id: `amp-issue-ambig-${normalized.id}`,
        measurementId: normalized.id,
        stationRefId: normalized.stationRefId || undefined,
        stationCode: normalized.stationCode || 'UNKNOWN',
        reason: 'ambiguous_station_match',
        message: `Ambiguous association: ${candidates.length} station rows match code "${normalized.stationCode}" and persistent stationRefId "${normalized.stationRefId}" was not found. Record kept unattached to avoid attaching to the wrong row.`,
        recoverableRaw: normalized,
      });
    } else {
      issues.push({
        id: `amp-issue-missing-${normalized.id}`,
        measurementId: normalized.id,
        stationRefId: normalized.stationRefId || undefined,
        stationCode: normalized.stationCode || 'UNKNOWN',
        reason: 'unassociated_station_ref',
        message: `Unassociated amplitude record "${normalized.id}" (${normalized.stationCode || 'unknown station'}): no matching station pick row found in loaded .eqp file.`,
        recoverableRaw: normalized,
      });
    }
  }

  return {
    ...event,
    picks,
    amplitudeMeasurements: reconciledMeasurements,
    ...(issues.length > 0 ? { amplitudeAssociationIssues: issues } : {}),
  };
}

/**
 * Selects structured amplitude inputs relevant to a future amplitude magnitude algorithm.
 * Prepared for MAG-0 fingerprint stability without performing any magnitude calculation in MAG-A.
 */
export function selectAmplitudeInputsForAlgorithmFingerprint(
  algorithmId: FutureAmplitudeAlgorithmId,
  event: Pick<EQPEvent, 'amplitudeMeasurements'>
): Array<Record<string, unknown>> {
  const list = event.amplitudeMeasurements ?? [];
  const filtered = list.filter((m) => {
    if (algorithmId === 'ml-local') {
      return (
        m.measurementCategory === 'wood_anderson_local' ||
        m.measurementCategory === 'raw_waveform' ||
        m.measurementCategory === 'other'
      );
    }
    if (algorithmId === 'mlv-vertical') {
      return (
        m.measurementCategory === 'wood_anderson_local' ||
        m.measurementCategory === 'raw_waveform' ||
        m.channelCode.trim().toUpperCase().endsWith('Z')
      );
    }
    if (algorithmId === 'mb-body') {
      return (
        m.measurementCategory === 'short_period_p' ||
        m.phaseType === 'P'
      );
    }
    if (algorithmId === 'ms-20') {
      return (
        m.measurementCategory === 'surface_wave' ||
        m.phaseType === 'Surface'
      );
    }
    return false;
  });

  return filtered
    .map((m) => ({
      id: m.id,
      stationRefId: m.stationRefId,
      networkCode: m.networkCode.trim().toUpperCase(),
      stationCode: m.stationCode.trim().toUpperCase(),
      locationCode: m.locationCode.trim().toUpperCase(),
      channelCode: m.channelCode.trim().toUpperCase(),
      measurementCategory: m.measurementCategory,
      amplitude: m.amplitude,
      physicalQuantity: m.physicalQuantity,
      unit: m.unit,
      convention: m.convention,
      phaseType: m.phaseType,
      periodSec: m.periodSec,
      instrumentResponseStatus: m.instrumentResponseStatus,
      processingProfileId: (m.processingProfileId ?? '').trim(),
      correctedStatus: m.correctedStatus,
      horizontalOrientationVerified: Boolean(m.horizontalOrientationVerified),
      channelAzimuthDeg: m.channelAzimuthDeg ?? null,
      channelDipDeg: m.channelDipDeg ?? null,
      clipped: m.clipped,
      excluded: Boolean(m.excluded),
    }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}
