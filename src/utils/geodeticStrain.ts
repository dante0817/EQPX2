import { type EQPEvent, isEventUnlocated } from '../data/eqpData.ts';
import { normalizeAngle360 } from './focalMechanism.ts';
import {
  geodesicAzimuthDeg,
  geodesicDistanceKm,
  type MechanismProvenanceKind,
  type MechanismQualityGrade,
  parseActiveEventUtcMs,
  parseUtcTimestamp,
} from './historicalSeismicity.ts';

export type GeodeticObservationType = 'gnss' | 'insar';
export type GeodeticDataMode = 'displacement' | 'velocity' | 'pre_post' | 'timeseries' | 'los';
export type StrainAnalysisQuantity = 'displacement-strain' | 'velocity-strain-rate';
export type StrainWeightingMode = 'wls' | 'ols';
export type StrainResultStatus = 'Insufficient Data' | 'Experimental' | 'Ambiguous' | 'Validated';
export type InSarPassDirection = 'Ascending' | 'Descending' | 'Unknown';

export type GeodeticLengthUnit = 'mm' | 'cm' | 'm';
export type GeodeticVelocityUnit = 'mm/yr' | 'cm/yr' | 'm/yr';
export type GeodeticUnit = GeodeticLengthUnit | GeodeticVelocityUnit;

export interface GnssTimeSeriesPoint {
  dateUtc: string;
  timeMs: number;
  epochYear: number;
  eastMm: number;
  northMm: number;
  upMm: number | null;
  sigmaEastMm: number | null;
  sigmaNorthMm: number | null;
  sigmaUpMm: number | null;
}

export interface GeodeticObservationRecord {
  id: string;
  stationId: string;
  stationName: string;
  observationType: GeodeticObservationType;
  dataMode: GeodeticDataMode;
  lat: number;
  lon: number;
  heightM: number | null;

  // GNSS canonical values: mm for displacement / pre_post / timeseries, mm/yr for velocity
  east: number | null;
  north: number | null;
  up: number | null;
  sigmaEast: number | null;
  sigmaNorth: number | null;
  sigmaUp: number | null;

  // Optional pre- and post-earthquake baseline components (canonical mm)
  preEastMm: number | null;
  preNorthMm: number | null;
  preUpMm: number | null;
  postEastMm: number | null;
  postNorthMm: number | null;
  postUpMm: number | null;

  // Optional velocity rate (mm/yr) when station provides both or derived from time-series
  velocityEastMmYr: number | null;
  velocityNorthMmYr: number | null;
  velocityUpMmYr: number | null;
  sigmaVelocityEastMmYr: number | null;
  sigmaVelocityNorthMmYr: number | null;
  sigmaVelocityUpMmYr: number | null;

  // Optional GNSS multi-epoch time series
  timeSeries: GnssTimeSeriesPoint[];

  // InSAR line-of-sight fields (canonical mm; positive/negative defined by satellite LOS convention)
  losDisplacementMm: number | null;
  sigmaLosMm: number | null;
  passDirection: InSarPassDirection;
  incidenceAngleDeg: number | null;
  headingDeg: number | null;
  losVectorE: number | null;
  losVectorN: number | null;
  losVectorU: number | null;
  trackName: string;
  sensorName: string;

  // Metadata & Provenance
  originalUnit: string;
  canonicalUnit: GeodeticUnit;
  crs: string;
  observationDateUtc: string;
  observationTimeMs: number | null;
  startDateUtc: string;
  endDateUtc: string;
  startTimeMs: number | null;
  endTimeMs: number | null;
  epochRelationNote: string;
  dataSource: string;
  datasetId: string;
  provenanceKind: MechanismProvenanceKind;
  quality: MechanismQualityGrade;
  importedAtUtc: string;
  notes: string;
}

export interface GeodeticPayload {
  observations: GeodeticObservationRecord[];
  datasetVersion: number;
  updatedAt: string;
}

export interface GeodeticImportRejection {
  rowNumber: number;
  reason: string;
  rawPreview: string;
}

export interface ParsedGeodeticBatch {
  records: GeodeticObservationRecord[];
  rejections: GeodeticImportRejection[];
  warnings: string[];
}

export type GeodeticCenterMode = 'active-event' | 'custom-point' | 'all-locations';
export type GeodeticRadiusPreset = '25' | '50' | '100' | '200' | '500' | 'custom';
export type StrainRadiusPreset = GeodeticRadiusPreset;
export type GeodeticTimeFilter = 'all' | 'spans-event' | 'post-event' | 'pre-event' | 'custom';
export type StrainTimeFilter = GeodeticTimeFilter;
export type GeodeticProvenanceFilter =
  | 'all'
  | 'validated-only'
  | 'imported-or-validated'
  | 'exclude-experimental';

export interface StrainFilterConfig {
  centerMode: GeodeticCenterMode;
  customLat: number;
  customLon: number;
  radiusPreset: GeodeticRadiusPreset;
  customRadiusKm: number;
  timeFilter: GeodeticTimeFilter;
  startDateUtc: string;
  endDateUtc: string;
  provenanceFilter: GeodeticProvenanceFilter;
  qualityGrades: MechanismQualityGrade[];
  dataSources: string[];
  includeGnss: boolean;
  includeInsar: boolean;
}

export interface StrainComputationConfig {
  analysisQuantity: StrainAnalysisQuantity;
  weightingMode: StrainWeightingMode;
  defaultSigmaMm: number;
  defaultSigmaMmYr: number;
  usePrePostDiffWhenAvailable: boolean;
  referenceFrameOrigin: 'station-centroid' | 'active-event';
  isReferenceBenchmarkRun?: boolean;
}

export const DEFAULT_STRAIN_FILTERS: StrainFilterConfig = {
  centerMode: 'all-locations',
  customLat: 14.6,
  customLon: 121.0,
  radiusPreset: '200',
  customRadiusKm: 200,
  timeFilter: 'all',
  startDateUtc: '',
  endDateUtc: '',
  provenanceFilter: 'all',
  qualityGrades: [],
  dataSources: [],
  includeGnss: true,
  includeInsar: true,
};

export const DEFAULT_STRAIN_COMPUTATION_CONFIG: StrainComputationConfig = {
  analysisQuantity: 'displacement-strain',
  weightingMode: 'wls',
  defaultSigmaMm: 3.0,
  defaultSigmaMmYr: 1.5,
  usePrePostDiffWhenAvailable: true,
  referenceFrameOrigin: 'station-centroid',
};

export const MIN_STRAIN_STATIONS = 3;
export const RECOMMENDED_STRAIN_STATIONS = 4;

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const WGS84_A_M = 6378137.0;
const WGS84_E2 = 0.00669437999014;

export interface PreparedGeodeticObservation {
  record: GeodeticObservationRecord;
  distanceKm: number | null;
  azimuthDeg: number | null;
  epochRelation: 'Spans Event' | 'Pre-Event' | 'Post-Event' | 'Co-Event Window' | 'Unknown / No Event';

  // Active displacement vector (mm) if available
  dispEastMm: number | null;
  dispNorthMm: number | null;
  dispUpMm: number | null;
  dispSigmaEastMm: number | null;
  dispSigmaNorthMm: number | null;
  dispSigmaUpMm: number | null;
  dispHorizMagMm: number | null;
  dispHorizSigmaMm: number | null;
  dispAzimuthDeg: number | null;
  dispRadialMm: number | null;
  dispTransverseMm: number | null;
  dispSourceLabel: string;

  // Active velocity vector (mm/yr) if available
  velEastMmYr: number | null;
  velNorthMmYr: number | null;
  velUpMmYr: number | null;
  velSigmaEastMmYr: number | null;
  velSigmaNorthMmYr: number | null;
  velSigmaUpMmYr: number | null;
  velHorizMagMmYr: number | null;
  velHorizSigmaMmYr: number | null;
  velAzimuthDeg: number | null;

  eligibleForFilter: boolean;
  included: boolean;
  usableForStrain: boolean;
  exclusionReason: string | null;
}

export interface GeodeticPreparationResult {
  items: PreparedGeodeticObservation[];
  includedItems: PreparedGeodeticObservation[];
  includedGnss: PreparedGeodeticObservation[];
  includedInsar: PreparedGeodeticObservation[];
  strainReadyGnss: PreparedGeodeticObservation[];
  excludedItems: PreparedGeodeticObservation[];
  centerLat: number | null;
  centerLon: number | null;
  effectiveRadiusKm: number | null;
  crsList: string[];
  hasMixedCrs: boolean;
  earliestUtc: string | null;
  latestUtc: string | null;
  spatialSpanKm: number;
  centroidLat: number | null;
  centroidLon: number | null;
  warnings: string[];
}

export interface StationStrainResidual {
  id: string;
  stationId: string;
  lat: number;
  lon: number;
  localEastKm: number;
  localNorthKm: number;
  observedE: number;
  observedN: number;
  predictedE: number;
  predictedN: number;
  residualE: number;
  residualN: number;
  residualMag: number;
  sigmaE: number;
  sigmaN: number;
  normalizedResidual: number;
}

export interface InSarLosSummary {
  count: number;
  minLosMm: number;
  maxLosMm: number;
  meanLosMm: number;
  rmsLosMm: number;
  passDirections: InSarPassDirection[];
  canDecomposeHorizontal: boolean;
  note: string;
}

export interface HorizontalStrainResult {
  status: StrainResultStatus;
  analysisQuantity: StrainAnalysisQuantity;
  tensorUnit: 'microstrain' | 'nanostrain/yr';
  rotationUnit: 'microrad' | 'nanorad/yr';
  vectorUnit: 'mm' | 'mm/yr';
  computedAtUtc: string;
  statusReasons: string[];
  warnings: string[];

  originLat: number;
  originLon: number;
  usableStationCount: number;
  availableGnssCount: number;
  availableInsarCount: number;
  degreesOfFreedom: number;
  spatialApertureKm: number;
  networkAspectRatio: number; // lambda_min / lambda_max of 2D station covariance
  conditionNumber: number;
  hasMixedCrs: boolean;
  crsList: string[];

  // Reference translation at origin (uE0, uN0) in mm or mm/yr
  translationEast: number;
  translationNorth: number;

  // Tensor components in microstrain (1e-6) or nanostrain/yr (1e-9/yr)
  // Extension positive convention
  exx: number;
  eyy: number;
  exy: number;
  sigmaExx: number;
  sigmaEyy: number;
  sigmaExy: number;

  // Rigid-body vertical axis rotation (CCW positive when N up, E right)
  rotation: number;
  sigmaRotation: number;

  // Principal strains (e1 >= e2; extension positive, shortening negative)
  e1: number;
  e2: number;
  sigmaE1: number;
  sigmaE2: number;
  e1AzimuthDeg: number; // clockwise from North [0, 180)
  e2AzimuthDeg: number; // orthogonal to e1 [0, 180)
  axisAzimuthUncertaintyDeg: number;

  // Invariants
  maxShearEngineering: number; // gamma_max = e1 - e2
  sigmaMaxShear: number;
  dilatation: number; // Delta = exx + eyy
  sigmaDilatation: number;

  // Fit diagnostics
  rmsResidualVector: number;
  wrmsNormalized: number;
  chi2Reduced: number | null;
  residuals: StationStrainResidual[];
  strainStyleLabel: string;
  deterministicInterpretation: string;
  limitations: string[];
  insarSummary: InSarLosSummary | null;
}

function normalizeText(val: unknown): string {
  return val === null || val === undefined ? '' : String(val).trim();
}

function parseFiniteNum(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (!s || /^na(n)?$/i.test(s) || s === 'null' || s === '--') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function normalizeGeodeticUnit(raw: string, fallbackMode: GeodeticDataMode): GeodeticUnit {
  const s = raw.trim().toLowerCase().replace(/\s+/g, '');
  if (s === 'mm/yr' || s === 'mm/y' || s === 'mmyr' || s === 'mm/a') return 'mm/yr';
  if (s === 'cm/yr' || s === 'cm/y' || s === 'cmyr') return 'cm/yr';
  if (s === 'm/yr' || s === 'm/y' || s === 'myr') return 'm/yr';
  if (s === 'cm') return 'cm';
  if (s === 'm' || s === 'meter' || s === 'meters') return 'm';
  if (s === 'mm' || s === 'millimeter' || s === 'millimeters') return 'mm';
  return fallbackMode === 'velocity' ? 'mm/yr' : 'mm';
}

export function scaleLengthToMm(value: number | null, unit: string): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const s = unit.trim().toLowerCase().replace(/\s+/g, '');
  if (s.startsWith('cm')) return value * 10;
  if (s === 'm' || s === 'm/yr' || s === 'm/y' || s === 'myr' || s.startsWith('meter')) {
    return value * 1000;
  }
  return value;
}

function normalizeProvenance(raw: string): MechanismProvenanceKind {
  const s = raw.trim().toLowerCase();
  if (s.includes('valid')) return 'Validated';
  if (s.includes('exper')) return 'Experimental';
  return 'Imported';
}

function normalizeQuality(raw: string): MechanismQualityGrade {
  const u = raw.trim().toUpperCase();
  if (u === 'A' || u === 'B' || u === 'C' || u === 'D') return u;
  return 'Unknown';
}

function normalizePass(raw: string): InSarPassDirection {
  const s = raw.trim().toLowerCase();
  if (s.startsWith('asc')) return 'Ascending';
  if (s.startsWith('desc')) return 'Descending';
  return 'Unknown';
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function buildColMap(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((h, i) => {
    const key = h.trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (!(key in map)) map[key] = i;
  });
  return map;
}

function getColVal(cols: string[], map: Record<string, number>, aliases: string[]): string {
  for (const a of aliases) {
    const idx = map[a];
    if (idx !== undefined && idx < cols.length) {
      return cols[idx] ?? '';
    }
  }
  return '';
}

function makeStableGeodeticId(prefix: string, seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${prefix}-${(h >>> 0).toString(36)}`;
}

function computeOrdinaryLinearSlopeMmYr(points: GnssTimeSeriesPoint[]): {
  eastRate: number;
  northRate: number;
  upRate: number | null;
} | null {
  if (points.length < 2) return null;
  const sorted = [...points].sort((a, b) => a.timeMs - b.timeMs);
  const t0 = sorted[0].epochYear;
  const spanYr = sorted[sorted.length - 1].epochYear - t0;
  if (spanYr < 0.05) return null;

  const slope = (vals: number[]): number => {
    const n = vals.length;
    let sumT = 0;
    let sumY = 0;
    for (let i = 0; i < n; i++) {
      const dt = sorted[i].epochYear - t0;
      sumT += dt;
      sumY += vals[i];
    }
    const meanT = sumT / n;
    const meanY = sumY / n;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      const dt = sorted[i].epochYear - t0 - meanT;
      num += dt * (vals[i] - meanY);
      den += dt * dt;
    }
    return den > 1e-12 ? num / den : 0;
  };

  const eastRate = slope(sorted.map((p) => p.eastMm));
  const northRate = slope(sorted.map((p) => p.northMm));
  const hasAllUp = sorted.every((p) => p.upMm !== null);
  const upRate = hasAllUp ? slope(sorted.map((p) => p.upMm ?? 0)) : null;

  return { eastRate, northRate, upRate };
}

function parseEpochTime(raw: string): { iso: string; ms: number | null; epochYear: number | null } {
  const s = raw.trim();
  if (!s) return { iso: '', ms: null, epochYear: null };
  // Handle decimal year like 2024.356
  if (/^\d{4}(\.\d+)?$/.test(s)) {
    const yr = Number(s);
    if (Number.isFinite(yr) && yr >= 1900 && yr <= 2100) {
      const wholeYr = Math.floor(yr);
      const frac = yr - wholeYr;
      const startMs = Date.UTC(wholeYr, 0, 1);
      const endMs = Date.UTC(wholeYr + 1, 0, 1);
      const ms = Math.round(startMs + frac * (endMs - startMs));
      return { iso: new Date(ms).toISOString(), ms, epochYear: yr };
    }
  }
  const ts = parseUtcTimestamp(s);
  if (ts) {
    const d = new Date(ts.ms);
    const yr = d.getUTCFullYear();
    const startMs = Date.UTC(yr, 0, 1);
    const endMs = Date.UTC(yr + 1, 0, 1);
    const epochYear = yr + (ts.ms - startMs) / Math.max(1, endMs - startMs);
    return { iso: ts.isoUtc, ms: ts.ms, epochYear };
  }
  return { iso: s, ms: null, epochYear: null };
}

export interface ParseGeodeticOptions {
  defaultSource?: string;
  datasetId?: string;
  defaultCrs?: string;
  defaultUnit?: string;
  defaultMode?: 'auto' | GeodeticDataMode;
  importedAtUtc?: string;
}

export function parseGeodeticCsv(
  content: string,
  options: ParseGeodeticOptions = {}
): ParsedGeodeticBatch {
  const lines = content
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));

  const rejections: GeodeticImportRejection[] = [];
  const warnings: string[] = [];

  if (lines.length < 2) {
    return {
      records: [],
      rejections: [{ rowNumber: 1, reason: 'CSV must include header row and at least one data row.', rawPreview: lines[0] ?? '' }],
      warnings,
    };
  }

  const headers = splitCsvLine(lines[0]);
  const map = buildColMap(headers);
  const importedAtUtc = options.importedAtUtc || new Date().toISOString();
  const defaultSource = options.defaultSource || 'CSV Geodetic Import';
  const datasetId = options.datasetId || 'csv-import';

  const rawRecords: GeodeticObservationRecord[] = [];
  const tsAccumulator = new Map<string, { base: GeodeticObservationRecord; points: GnssTimeSeriesPoint[] }>();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const cols = splitCsvLine(line);
    const rowNumber = i + 1;
    const rawPreview = line.slice(0, 120);

    const lat = parseFiniteNum(getColVal(cols, map, ['lat', 'latitude', 'y']));
    const lon = parseFiniteNum(getColVal(cols, map, ['lon', 'lng', 'longitude', 'x']));
    if (lat === null || lon === null || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      rejections.push({ rowNumber, reason: 'Missing or invalid WGS84 latitude/longitude.', rawPreview });
      continue;
    }

    const stationId =
      getColVal(cols, map, ['station_id', 'station', 'site', 'id', 'code', 'point_id']) ||
      `STN_${rowNumber}`;
    const stationName =
      getColVal(cols, map, ['station_name', 'name', 'site_name']) || stationId;
    const obsTypeRaw = getColVal(cols, map, ['observation_type', 'type', 'obs_type', 'sensor_type']).toLowerCase();

    const losRaw = parseFiniteNum(
      getColVal(cols, map, ['los', 'los_mm', 'los_disp', 'disp_los', 'insar_los', 'los_displacement', 'los_m', 'los_cm'])
    );
    const eRaw = parseFiniteNum(
      getColVal(cols, map, ['east', 'de', 'east_mm', 'disp_e', 'ue', 've', 'vel_e', 'velocity_e', 'e'])
    );
    const nRaw = parseFiniteNum(
      getColVal(cols, map, ['north', 'dn', 'north_mm', 'disp_n', 'un', 'vn', 'vel_n', 'velocity_n', 'n'])
    );
    const uRaw = parseFiniteNum(
      getColVal(cols, map, ['up', 'du', 'up_mm', 'disp_u', 'uu', 'vu', 'vel_u', 'velocity_u', 'vert', 'vertical', 'u'])
    );
    const veRaw = parseFiniteNum(getColVal(cols, map, ['ve', 'vel_e', 'velocity_e', 've_mm_yr']));
    const vnRaw = parseFiniteNum(getColVal(cols, map, ['vn', 'vel_n', 'velocity_n', 'vn_mm_yr']));
    const vuRaw = parseFiniteNum(getColVal(cols, map, ['vu', 'vel_u', 'velocity_u', 'vu_mm_yr']));

    const preERaw = parseFiniteNum(getColVal(cols, map, ['pre_east', 'pre_e', 'east_pre', 'pre_east_mm']));
    const preNRaw = parseFiniteNum(getColVal(cols, map, ['pre_north', 'pre_n', 'north_pre', 'pre_north_mm']));
    const preURaw = parseFiniteNum(getColVal(cols, map, ['pre_up', 'pre_u', 'up_pre', 'pre_up_mm']));
    const postERaw = parseFiniteNum(getColVal(cols, map, ['post_east', 'post_e', 'east_post', 'post_east_mm']));
    const postNRaw = parseFiniteNum(getColVal(cols, map, ['post_north', 'post_n', 'north_post', 'post_north_mm']));
    const postURaw = parseFiniteNum(getColVal(cols, map, ['post_up', 'post_u', 'up_post', 'post_up_mm']));

    const isInSAR =
      obsTypeRaw.includes('insar') ||
      obsTypeRaw === 'los' ||
      (losRaw !== null && eRaw === null && nRaw === null && veRaw === null && preERaw === null);

    const rawUnitStr =
      getColVal(cols, map, ['unit', 'units']) ||
      options.defaultUnit ||
      (veRaw !== null || vnRaw !== null ? 'mm/yr' : 'mm');
    const modeCol = getColVal(cols, map, ['data_mode', 'mode']).toLowerCase();
    const crs = getColVal(cols, map, ['crs', 'frame', 'reference_frame', 'datum']) || options.defaultCrs || 'WGS84 / ITRF2014';

    const obsDateRaw = getColVal(cols, map, ['date', 'epoch', 'observation_date', 'date_utc', 'time', 'epoch_year']);
    const startDateRaw = getColVal(cols, map, ['start_date', 't1', 'master_date', 'pre_date']);
    const endDateRaw = getColVal(cols, map, ['end_date', 't2', 'slave_date', 'post_date']);
    const obsParsed = parseEpochTime(obsDateRaw);
    const startParsed = parseEpochTime(startDateRaw);
    const endParsed = parseEpochTime(endDateRaw);

    const heightM = parseFiniteNum(getColVal(cols, map, ['height', 'elev', 'elevation_m', 'alt']));
    const dataSource = getColVal(cols, map, ['source', 'data_source', 'agency']) || defaultSource;
    const rowDatasetId = getColVal(cols, map, ['dataset_id', 'dataset']) || datasetId;
    const provenanceKind = normalizeProvenance(getColVal(cols, map, ['provenance', 'status']));
    const quality = normalizeQuality(getColVal(cols, map, ['quality', 'grade']));
    const notes = getColVal(cols, map, ['notes', 'comment', 'remarks']);

    if (isInSAR) {
      if (losRaw === null) {
        rejections.push({ rowNumber, reason: 'InSAR row missing valid LOS displacement value.', rawPreview });
        continue;
      }
      const losUnit = normalizeGeodeticUnit(rawUnitStr, 'los');
      const losMm = scaleLengthToMm(losRaw, losUnit);
      const sigmaLosRaw = parseFiniteNum(getColVal(cols, map, ['sigma_los', 'err_los', 'los_sigma', 'los_err']));
      const sigmaLosMm = scaleLengthToMm(sigmaLosRaw, losUnit);
      const incidence = parseFiniteNum(getColVal(cols, map, ['incidence', 'incidence_deg', 'inc_deg']));
      const heading = parseFiniteNum(getColVal(cols, map, ['heading', 'heading_deg', 'azimuth_deg']));
      const passDirection = normalizePass(getColVal(cols, map, ['pass', 'pass_direction', 'orbit']));
      const trackName = getColVal(cols, map, ['track', 'track_name', 'frame_id']);
      const sensorName = getColVal(cols, map, ['sensor', 'satellite', 'platform']);

      let losE = parseFiniteNum(getColVal(cols, map, ['los_e', 'unit_e']));
      let losN = parseFiniteNum(getColVal(cols, map, ['los_n', 'unit_n']));
      let losU = parseFiniteNum(getColVal(cols, map, ['los_u', 'unit_u']));
      if (losE === null && losN === null && losU === null && incidence !== null && heading !== null) {
        const inc = incidence * DEG2RAD;
        const hdg = heading * DEG2RAD;
        // Ground-to-satellite LOS convention (right-looking SAR azimuth)
        losE = -Math.sin(inc) * Math.cos(hdg);
        losN = Math.sin(inc) * Math.sin(hdg);
        losU = Math.cos(inc);
      }

      rawRecords.push({
        id: makeStableGeodeticId('insar', `${stationId}|${lat.toFixed(5)}|${lon.toFixed(5)}|${obsParsed.iso}|${trackName}`),
        stationId,
        stationName,
        observationType: 'insar',
        dataMode: 'los',
        lat,
        lon,
        heightM,
        east: null,
        north: null,
        up: null,
        sigmaEast: null,
        sigmaNorth: null,
        sigmaUp: null,
        preEastMm: null,
        preNorthMm: null,
        preUpMm: null,
        postEastMm: null,
        postNorthMm: null,
        postUpMm: null,
        velocityEastMmYr: null,
        velocityNorthMmYr: null,
        velocityUpMmYr: null,
        sigmaVelocityEastMmYr: null,
        sigmaVelocityNorthMmYr: null,
        sigmaVelocityUpMmYr: null,
        timeSeries: [],
        losDisplacementMm: losMm,
        sigmaLosMm,
        passDirection,
        incidenceAngleDeg: incidence,
        headingDeg: heading,
        losVectorE: losE,
        losVectorN: losN,
        losVectorU: losU,
        trackName,
        sensorName,
        originalUnit: rawUnitStr || 'mm',
        canonicalUnit: 'mm',
        crs,
        observationDateUtc: obsParsed.iso || endParsed.iso,
        observationTimeMs: obsParsed.ms ?? endParsed.ms,
        startDateUtc: startParsed.iso,
        endDateUtc: endParsed.iso,
        startTimeMs: startParsed.ms,
        endTimeMs: endParsed.ms,
        epochRelationNote: '',
        dataSource,
        datasetId: rowDatasetId,
        provenanceKind,
        quality,
        importedAtUtc,
        notes,
      });
      continue;
    }

    // GNSS validation
    const hasPrePost =
      preERaw !== null && preNRaw !== null && postERaw !== null && postNRaw !== null;
    const isVelUnit = /\/y(r)?$|\/a$/i.test(rawUnitStr.trim());
    const hasExplicitVel = veRaw !== null && vnRaw !== null;
    const defaultModeOpt = options.defaultMode && options.defaultMode !== 'auto' ? options.defaultMode : null;
    const isVelocityRow =
      modeCol.includes('vel') ||
      defaultModeOpt === 'velocity' ||
      hasExplicitVel ||
      (isVelUnit && !hasPrePost);
    const isTimeSeriesRow =
      modeCol.includes('time') ||
      defaultModeOpt === 'timeseries' ||
      (Boolean(obsParsed.epochYear !== null) && eRaw !== null && nRaw !== null && !hasPrePost && !isVelocityRow && !modeCol.includes('disp'));

    const dispUnit = normalizeGeodeticUnit(isVelUnit ? rawUnitStr.replace(/\/.*$/, '') : rawUnitStr, 'displacement');
    const velUnit = normalizeGeodeticUnit(isVelUnit ? rawUnitStr : `${dispUnit}/yr`, 'velocity');

    const sigERaw = parseFiniteNum(getColVal(cols, map, ['sigma_e', 'se', 'err_e', 'sigma_east', 'std_e']));
    const sigNRaw = parseFiniteNum(getColVal(cols, map, ['sigma_n', 'sn', 'err_n', 'sigma_north', 'std_n']));
    const sigURaw = parseFiniteNum(getColVal(cols, map, ['sigma_u', 'su', 'err_u', 'sigma_up', 'std_u']));
    const sveRaw = parseFiniteNum(getColVal(cols, map, ['sigma_ve', 'sve', 'err_ve']));
    const svnRaw = parseFiniteNum(getColVal(cols, map, ['sigma_vn', 'svn', 'err_vn']));
    const svuRaw = parseFiniteNum(getColVal(cols, map, ['sigma_vu', 'svu', 'err_vu']));

    const preEastMm = scaleLengthToMm(preERaw, dispUnit);
    const preNorthMm = scaleLengthToMm(preNRaw, dispUnit);
    const preUpMm = scaleLengthToMm(preURaw, dispUnit);
    const postEastMm = scaleLengthToMm(postERaw, dispUnit);
    const postNorthMm = scaleLengthToMm(postNRaw, dispUnit);
    const postUpMm = scaleLengthToMm(postURaw, dispUnit);

    const derivedPrePostE =
      postEastMm !== null && preEastMm !== null ? postEastMm - preEastMm : null;
    const derivedPrePostN =
      postNorthMm !== null && preNorthMm !== null ? postNorthMm - preNorthMm : null;
    const derivedPrePostU =
      postUpMm !== null && preUpMm !== null ? postUpMm - preUpMm : null;

    const eastDispMm =
      !isVelocityRow && eRaw !== null ? scaleLengthToMm(eRaw, dispUnit) : derivedPrePostE;
    const northDispMm =
      !isVelocityRow && nRaw !== null ? scaleLengthToMm(nRaw, dispUnit) : derivedPrePostN;
    const upDispMm =
      !isVelocityRow && uRaw !== null ? scaleLengthToMm(uRaw, dispUnit) : derivedPrePostU;

    const velE =
      hasExplicitVel
        ? scaleLengthToMm(veRaw, velUnit)
        : isVelocityRow && eRaw !== null
        ? scaleLengthToMm(eRaw, velUnit)
        : null;
    const velN =
      hasExplicitVel
        ? scaleLengthToMm(vnRaw, velUnit)
        : isVelocityRow && nRaw !== null
        ? scaleLengthToMm(nRaw, velUnit)
        : null;
    const velU =
      vuRaw !== null
        ? scaleLengthToMm(vuRaw, velUnit)
        : isVelocityRow && uRaw !== null
        ? scaleLengthToMm(uRaw, velUnit)
        : null;

    if (
      (eastDispMm === null || northDispMm === null) &&
      (velE === null || velN === null)
    ) {
      rejections.push({
        rowNumber,
        reason: 'GNSS row must contain valid East & North displacement or velocity components.',
        rawPreview,
      });
      continue;
    }

    const sigmaEastMm = !isVelocityRow ? scaleLengthToMm(sigERaw, dispUnit) : null;
    const sigmaNorthMm = !isVelocityRow ? scaleLengthToMm(sigNRaw, dispUnit) : null;
    const sigmaUpMm = !isVelocityRow ? scaleLengthToMm(sigURaw, dispUnit) : null;

    const sVelE =
      sveRaw !== null
        ? scaleLengthToMm(sveRaw, velUnit)
        : isVelocityRow
        ? scaleLengthToMm(sigERaw, velUnit)
        : null;
    const sVelN =
      svnRaw !== null
        ? scaleLengthToMm(svnRaw, velUnit)
        : isVelocityRow
        ? scaleLengthToMm(sigNRaw, velUnit)
        : null;
    const sVelU =
      svuRaw !== null
        ? scaleLengthToMm(svuRaw, velUnit)
        : isVelocityRow
        ? scaleLengthToMm(sigURaw, velUnit)
        : null;

    const dataMode: GeodeticDataMode = hasPrePost
      ? 'pre_post'
      : isVelocityRow && eastDispMm === null
      ? 'velocity'
      : isTimeSeriesRow
      ? 'timeseries'
      : 'displacement';

    const rec: GeodeticObservationRecord = {
      id: makeStableGeodeticId('gnss', `${stationId}|${lat.toFixed(5)}|${lon.toFixed(5)}|${dataSource}`),
      stationId,
      stationName,
      observationType: 'gnss',
      dataMode,
      lat,
      lon,
      heightM,
      east: eastDispMm,
      north: northDispMm,
      up: upDispMm,
      sigmaEast: sigmaEastMm,
      sigmaNorth: sigmaNorthMm,
      sigmaUp: sigmaUpMm,
      preEastMm,
      preNorthMm,
      preUpMm,
      postEastMm,
      postNorthMm,
      postUpMm,
      velocityEastMmYr: velE,
      velocityNorthMmYr: velN,
      velocityUpMmYr: velU,
      sigmaVelocityEastMmYr: sVelE,
      sigmaVelocityNorthMmYr: sVelN,
      sigmaVelocityUpMmYr: sVelU,
      timeSeries: [],
      losDisplacementMm: null,
      sigmaLosMm: null,
      passDirection: 'Unknown',
      incidenceAngleDeg: null,
      headingDeg: null,
      losVectorE: null,
      losVectorN: null,
      losVectorU: null,
      trackName: '',
      sensorName: '',
      originalUnit: rawUnitStr || (isVelocityRow ? 'mm/yr' : 'mm'),
      canonicalUnit: isVelocityRow && eastDispMm === null ? 'mm/yr' : 'mm',
      crs,
      observationDateUtc: obsParsed.iso,
      observationTimeMs: obsParsed.ms,
      startDateUtc: startParsed.iso,
      endDateUtc: endParsed.iso,
      startTimeMs: startParsed.ms,
      endTimeMs: endParsed.ms,
      epochRelationNote: '',
      dataSource,
      datasetId: rowDatasetId,
      provenanceKind,
      quality,
      importedAtUtc,
      notes,
    };

    if (
      obsParsed.ms !== null &&
      obsParsed.epochYear !== null &&
      eastDispMm !== null &&
      northDispMm !== null &&
      !hasPrePost &&
      !isVelocityRow
    ) {
      const tsKey = `${stationId}::${dataSource}`;
      const existing = tsAccumulator.get(tsKey);
      const pt: GnssTimeSeriesPoint = {
        dateUtc: obsParsed.iso,
        timeMs: obsParsed.ms,
        epochYear: obsParsed.epochYear,
        eastMm: eastDispMm,
        northMm: northDispMm,
        upMm: upDispMm,
        sigmaEastMm,
        sigmaNorthMm,
        sigmaUpMm,
      };
      if (existing) {
        existing.points.push(pt);
      } else {
        tsAccumulator.set(tsKey, { base: rec, points: [pt] });
      }
    } else {
      rawRecords.push(rec);
    }
  }

  // Collapse multi-epoch GNSS stations into time-series records while preserving single-epoch rows cleanly
  for (const [, entry] of tsAccumulator.entries()) {
    const pts = [...entry.points].sort((a, b) => a.timeMs - b.timeMs);
    if (pts.length >= 2) {
      const first = pts[0];
      const last = pts[pts.length - 1];
      const slope = computeOrdinaryLinearSlopeMmYr(pts);
      rawRecords.push({
        ...entry.base,
        dataMode: 'timeseries',
        east: last.eastMm - first.eastMm,
        north: last.northMm - first.northMm,
        up: last.upMm !== null && first.upMm !== null ? last.upMm - first.upMm : null,
        sigmaEast:
          last.sigmaEastMm !== null && first.sigmaEastMm !== null
            ? Math.hypot(last.sigmaEastMm, first.sigmaEastMm)
            : last.sigmaEastMm ?? first.sigmaEastMm,
        sigmaNorth:
          last.sigmaNorthMm !== null && first.sigmaNorthMm !== null
            ? Math.hypot(last.sigmaNorthMm, first.sigmaNorthMm)
            : last.sigmaNorthMm ?? first.sigmaNorthMm,
        sigmaUp:
          last.sigmaUpMm !== null && first.sigmaUpMm !== null
            ? Math.hypot(last.sigmaUpMm, first.sigmaUpMm)
            : last.sigmaUpMm ?? first.sigmaUpMm,
        preEastMm: first.eastMm,
        preNorthMm: first.northMm,
        preUpMm: first.upMm,
        postEastMm: last.eastMm,
        postNorthMm: last.northMm,
        postUpMm: last.upMm,
        velocityEastMmYr: entry.base.velocityEastMmYr ?? slope?.eastRate ?? null,
        velocityNorthMmYr: entry.base.velocityNorthMmYr ?? slope?.northRate ?? null,
        velocityUpMmYr: entry.base.velocityUpMmYr ?? slope?.upRate ?? null,
        startDateUtc: first.dateUtc,
        startTimeMs: first.timeMs,
        endDateUtc: last.dateUtc,
        endTimeMs: last.timeMs,
        observationDateUtc: last.dateUtc,
        observationTimeMs: last.timeMs,
        timeSeries: pts,
      });
    } else {
      rawRecords.push({
        ...entry.base,
        dataMode: 'displacement',
        timeSeries: pts,
      });
    }
  }

  if (rawRecords.length > 0 && rawRecords.every((r) => r.observationType === 'insar')) {
    warnings.push(
      'Imported dataset contains InSAR Line-of-Sight (LOS) observations only; 2D horizontal strain tensor calculation requires >= 3 non-collinear GNSS vector stations.'
    );
  }

  return {
    records: rawRecords,
    rejections,
    warnings,
  };
}

export function parseGeodeticGeoJson(
  content: string | Record<string, unknown>,
  options: ParseGeodeticOptions = {}
): ParsedGeodeticBatch {
  const rejections: GeodeticImportRejection[] = [];
  const warnings: string[] = [];
  const importedAtUtc = options.importedAtUtc || new Date().toISOString();

  let parsedObj: Record<string, unknown>;
  try {
    parsedObj = typeof content === 'string' ? (JSON.parse(content) as Record<string, unknown>) : content;
  } catch (err) {
    return {
      records: [],
      rejections: [
        {
          rowNumber: 1,
          reason: err instanceof Error ? `Invalid JSON: ${err.message}` : 'Invalid GeoJSON payload.',
          rawPreview: typeof content === 'string' ? content.slice(0, 100) : '',
        },
      ],
      warnings,
    };
  }

  const features = Array.isArray(parsedObj.features)
    ? (parsedObj.features as Array<Record<string, unknown>>)
    : [];
  if (features.length === 0) {
    return {
      records: [],
      rejections: [{ rowNumber: 1, reason: 'GeoJSON contains no features.', rawPreview: '' }],
      warnings,
    };
  }

  const records: GeodeticObservationRecord[] = [];
  features.forEach((feat, idx) => {
    const rowNumber = idx + 1;
    const geom = (feat.geometry ?? {}) as { type?: string; coordinates?: unknown };
    const props = (feat.properties ?? {}) as Record<string, unknown>;
    if (geom.type !== 'Point' || !Array.isArray(geom.coordinates) || geom.coordinates.length < 2) {
      rejections.push({
        rowNumber,
        reason: 'GeoJSON feature must have Point geometry [lon, lat].',
        rawPreview: JSON.stringify(feat).slice(0, 100),
      });
      return;
    }
    const lon = Number(geom.coordinates[0]);
    const lat = Number(geom.coordinates[1]);
    const heightM = geom.coordinates.length >= 3 ? parseFiniteNum(geom.coordinates[2]) : parseFiniteNum(props.height ?? props.elevation_m);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      rejections.push({ rowNumber, reason: 'Invalid GeoJSON Point coordinates.', rawPreview: '' });
      return;
    }

    const stationId = normalizeText(props.station_id ?? props.station ?? props.id ?? feat.id) || `GEO_${rowNumber}`;
    const stationName = normalizeText(props.station_name ?? props.name) || stationId;
    const obsTypeRaw = normalizeText(props.observation_type ?? props.type).toLowerCase();
    const losVal = parseFiniteNum(props.los ?? props.los_mm ?? props.los_displacement);
    const eVal = parseFiniteNum(props.east ?? props.de ?? props.east_mm ?? props.ve);
    const nVal = parseFiniteNum(props.north ?? props.dn ?? props.north_mm ?? props.vn);
    const uVal = parseFiniteNum(props.up ?? props.du ?? props.up_mm ?? props.vu);
    const veVal = parseFiniteNum(props.ve ?? props.velocity_e ?? props.vel_e);
    const vnVal = parseFiniteNum(props.vn ?? props.velocity_n ?? props.vel_n);
    const vuVal = parseFiniteNum(props.vu ?? props.velocity_u ?? props.vel_u);
    const unitRaw = normalizeText(props.units ?? props.unit) || options.defaultUnit || (veVal !== null ? 'mm/yr' : 'mm');
    const crs = normalizeText(props.crs ?? props.frame) || options.defaultCrs || 'WGS84 / ITRF2014';
    const dataSource = normalizeText(props.source ?? props.data_source) || options.defaultSource || 'GeoJSON Geodetic Import';
    const datasetId = normalizeText(props.dataset_id) || options.datasetId || 'geojson-import';
    const provenanceKind = normalizeProvenance(normalizeText(props.provenance ?? props.status));
    const quality = normalizeQuality(normalizeText(props.quality));
    const obsParsed = parseEpochTime(normalizeText(props.date ?? props.epoch ?? props.observation_date));
    const startParsed = parseEpochTime(normalizeText(props.start_date ?? props.t1));
    const endParsed = parseEpochTime(normalizeText(props.end_date ?? props.t2));

    const isInSAR = obsTypeRaw.includes('insar') || obsTypeRaw === 'los' || (losVal !== null && eVal === null && veVal === null);
    if (isInSAR) {
      if (losVal === null) {
        rejections.push({ rowNumber, reason: 'InSAR GeoJSON feature missing LOS value.', rawPreview: stationId });
        return;
      }
      const losUnit = normalizeGeodeticUnit(unitRaw, 'los');
      records.push({
        id: makeStableGeodeticId('insar', `${stationId}|${lat.toFixed(5)}|${lon.toFixed(5)}|${obsParsed.iso}`),
        stationId,
        stationName,
        observationType: 'insar',
        dataMode: 'los',
        lat,
        lon,
        heightM,
        east: null,
        north: null,
        up: null,
        sigmaEast: null,
        sigmaNorth: null,
        sigmaUp: null,
        preEastMm: null,
        preNorthMm: null,
        preUpMm: null,
        postEastMm: null,
        postNorthMm: null,
        postUpMm: null,
        velocityEastMmYr: null,
        velocityNorthMmYr: null,
        velocityUpMmYr: null,
        sigmaVelocityEastMmYr: null,
        sigmaVelocityNorthMmYr: null,
        sigmaVelocityUpMmYr: null,
        timeSeries: [],
        losDisplacementMm: scaleLengthToMm(losVal, losUnit),
        sigmaLosMm: scaleLengthToMm(parseFiniteNum(props.sigma_los), losUnit),
        passDirection: normalizePass(normalizeText(props.pass ?? props.pass_direction)),
        incidenceAngleDeg: parseFiniteNum(props.incidence ?? props.incidence_deg),
        headingDeg: parseFiniteNum(props.heading ?? props.heading_deg),
        losVectorE: parseFiniteNum(props.los_e),
        losVectorN: parseFiniteNum(props.los_n),
        losVectorU: parseFiniteNum(props.los_u),
        trackName: normalizeText(props.track ?? props.track_name),
        sensorName: normalizeText(props.sensor ?? props.satellite),
        originalUnit: unitRaw,
        canonicalUnit: 'mm',
        crs,
        observationDateUtc: obsParsed.iso || endParsed.iso,
        observationTimeMs: obsParsed.ms ?? endParsed.ms,
        startDateUtc: startParsed.iso,
        endDateUtc: endParsed.iso,
        startTimeMs: startParsed.ms,
        endTimeMs: endParsed.ms,
        epochRelationNote: '',
        dataSource,
        datasetId,
        provenanceKind,
        quality,
        importedAtUtc,
        notes: normalizeText(props.notes),
      });
      return;
    }

    const isVelUnit = /\/y(r)?$|\/a$/i.test(unitRaw);
    const isVel = veVal !== null || isVelUnit;
    const dispUnit = normalizeGeodeticUnit(unitRaw.replace(/\/.*$/, ''), 'displacement');
    const velUnit = normalizeGeodeticUnit(isVelUnit ? unitRaw : `${dispUnit}/yr`, 'velocity');

    const eastDispMm = !isVel ? scaleLengthToMm(eVal, dispUnit) : null;
    const northDispMm = !isVel ? scaleLengthToMm(nVal, dispUnit) : null;
    const upDispMm = !isVel ? scaleLengthToMm(uVal, dispUnit) : null;
    const vE = veVal !== null ? scaleLengthToMm(veVal, velUnit) : isVel ? scaleLengthToMm(eVal, velUnit) : null;
    const vN = vnVal !== null ? scaleLengthToMm(vnVal, velUnit) : isVel ? scaleLengthToMm(nVal, velUnit) : null;
    const vU = vuVal !== null ? scaleLengthToMm(vuVal, velUnit) : isVel ? scaleLengthToMm(uVal, velUnit) : null;

    if ((eastDispMm === null || northDispMm === null) && (vE === null || vN === null)) {
      rejections.push({ rowNumber, reason: 'GNSS GeoJSON feature missing East/North components.', rawPreview: stationId });
      return;
    }

    const rawSeries = Array.isArray(props.timeSeries)
      ? (props.timeSeries as Array<Record<string, unknown>>)
      : [];
    const timeSeries: GnssTimeSeriesPoint[] = rawSeries
      .map((pt) => {
        const ep = parseEpochTime(normalizeText(pt.dateUtc ?? pt.date ?? pt.epoch));
        const pe = parseFiniteNum(pt.eastMm ?? pt.east);
        const pn = parseFiniteNum(pt.northMm ?? pt.north);
        if (ep.ms === null || ep.epochYear === null || pe === null || pn === null) return null;
        return {
          dateUtc: ep.iso,
          timeMs: ep.ms,
          epochYear: ep.epochYear,
          eastMm: pe,
          northMm: pn,
          upMm: parseFiniteNum(pt.upMm ?? pt.up),
          sigmaEastMm: parseFiniteNum(pt.sigmaEastMm ?? pt.sigma_e),
          sigmaNorthMm: parseFiniteNum(pt.sigmaNorthMm ?? pt.sigma_n),
          sigmaUpMm: parseFiniteNum(pt.sigmaUpMm ?? pt.sigma_u),
        };
      })
      .filter((x): x is GnssTimeSeriesPoint => x !== null);

    records.push({
      id: makeStableGeodeticId('gnss', `${stationId}|${lat.toFixed(5)}|${lon.toFixed(5)}|${dataSource}`),
      stationId,
      stationName,
      observationType: 'gnss',
      dataMode: timeSeries.length >= 2 ? 'timeseries' : isVel && eastDispMm === null ? 'velocity' : 'displacement',
      lat,
      lon,
      heightM,
      east: eastDispMm,
      north: northDispMm,
      up: upDispMm,
      sigmaEast: !isVel ? scaleLengthToMm(parseFiniteNum(props.sigma_e ?? props.sigmaEast), dispUnit) : null,
      sigmaNorth: !isVel ? scaleLengthToMm(parseFiniteNum(props.sigma_n ?? props.sigmaNorth), dispUnit) : null,
      sigmaUp: !isVel ? scaleLengthToMm(parseFiniteNum(props.sigma_u ?? props.sigmaUp), dispUnit) : null,
      preEastMm: null,
      preNorthMm: null,
      preUpMm: null,
      postEastMm: null,
      postNorthMm: null,
      postUpMm: null,
      velocityEastMmYr: vE,
      velocityNorthMmYr: vN,
      velocityUpMmYr: vU,
      sigmaVelocityEastMmYr: isVel ? scaleLengthToMm(parseFiniteNum(props.sigma_ve ?? props.sigma_e), velUnit) : null,
      sigmaVelocityNorthMmYr: isVel ? scaleLengthToMm(parseFiniteNum(props.sigma_vn ?? props.sigma_n), velUnit) : null,
      sigmaVelocityUpMmYr: isVel ? scaleLengthToMm(parseFiniteNum(props.sigma_vu ?? props.sigma_u), velUnit) : null,
      timeSeries,
      losDisplacementMm: null,
      sigmaLosMm: null,
      passDirection: 'Unknown',
      incidenceAngleDeg: null,
      headingDeg: null,
      losVectorE: null,
      losVectorN: null,
      losVectorU: null,
      trackName: '',
      sensorName: '',
      originalUnit: unitRaw,
      canonicalUnit: isVel && eastDispMm === null ? 'mm/yr' : 'mm',
      crs,
      observationDateUtc: obsParsed.iso,
      observationTimeMs: obsParsed.ms,
      startDateUtc: startParsed.iso,
      endDateUtc: endParsed.iso,
      startTimeMs: startParsed.ms,
      endTimeMs: endParsed.ms,
      epochRelationNote: '',
      dataSource,
      datasetId,
      provenanceKind,
      quality,
      importedAtUtc,
      notes: normalizeText(props.notes),
    });
  });

  return { records, rejections, warnings };
}

export function inspectGeoTiffBufferHeader(buffer: ArrayBuffer): {
  validTiffHeader: boolean;
  endianness: 'little' | 'big' | 'unknown';
  message: string;
} {
  if (buffer.byteLength < 8) {
    return {
      validTiffHeader: false,
      endianness: 'unknown',
      message: 'File is too small to be a valid GeoTIFF.',
    };
  }
  const view = new DataView(buffer);
  const b0 = view.getUint8(0);
  const b1 = view.getUint8(1);
  const endianness = b0 === 0x49 && b1 === 0x49 ? 'little' : b0 === 0x4d && b1 === 0x4d ? 'big' : 'unknown';
  const magic = endianness === 'little' ? view.getUint16(2, true) : endianness === 'big' ? view.getUint16(2, false) : 0;
  const validTiffHeader = (magic === 42 || magic === 43) && endianness !== 'unknown';
  if (!validTiffHeader) {
    return {
      validTiffHeader: false,
      endianness,
      message: 'Not a recognized TIFF/GeoTIFF binary header.',
    };
  }
  return {
    validTiffHeader: true,
    endianness,
    message:
      'Valid GeoTIFF header detected, but raster GeoTIFF decoding requires an installed GeoTIFF decoder package. Export/sample InSAR LOS pixels as CSV or GeoJSON (lat, lon, los_mm, incidence_deg, heading_deg, pass) to import into Strain Analysis.',
  };
}

/**
 * Local ENU tangent-plane WGS84 projection in meters relative to (originLat, originLon).
 */
export function projectLatLonToLocalEnuMeters(
  latDeg: number,
  lonDeg: number,
  originLatDeg: number,
  originLonDeg: number
): { eastM: number; northM: number } {
  const phi0 = originLatDeg * DEG2RAD;
  const sinPhi0 = Math.sin(phi0);
  const denom = 1 - WGS84_E2 * sinPhi0 * sinPhi0;
  const nRadius = WGS84_A_M / Math.sqrt(denom);
  const mRadius = (WGS84_A_M * (1 - WGS84_E2)) / Math.pow(denom, 1.5);

  const dLat = (latDeg - originLatDeg) * DEG2RAD;
  let dLonDeg = lonDeg - originLonDeg;
  if (dLonDeg > 180) dLonDeg -= 360;
  if (dLonDeg < -180) dLonDeg += 360;
  const dLon = dLonDeg * DEG2RAD;

  return {
    eastM: nRadius * Math.cos(phi0) * dLon,
    northM: mRadius * dLat,
  };
}

function classifyEpochRelation(
  rec: GeodeticObservationRecord,
  eventTimeMs: number | null
): PreparedGeodeticObservation['epochRelation'] {
  if (eventTimeMs === null) return 'Unknown / No Event';
  const start = rec.startTimeMs ?? rec.observationTimeMs;
  const end = rec.endTimeMs ?? rec.observationTimeMs;
  if (start === null && end === null) return 'Unknown / No Event';
  if (start !== null && end !== null && start <= eventTimeMs && end >= eventTimeMs) {
    return 'Spans Event';
  }
  const ref = end ?? start ?? 0;
  const diffDays = (ref - eventTimeMs) / 86400000;
  if (Math.abs(diffDays) <= 3) return 'Co-Event Window';
  if (diffDays < 0) return 'Pre-Event';
  return 'Post-Event';
}

export function prepareGeodeticObservations(
  records: GeodeticObservationRecord[],
  activeEvent: EQPEvent,
  filters: StrainFilterConfig,
  manualExcludedIds: Set<string>,
  usePrePostDiffWhenAvailable = true
): GeodeticPreparationResult {
  const unlocated = isEventUnlocated(activeEvent);
  const eventTimeMs = parseActiveEventUtcMs(activeEvent);

  const centerLat =
    filters.centerMode === 'active-event' && !unlocated
      ? activeEvent.lat
      : filters.centerMode === 'custom-point'
      ? filters.customLat
      : null;
  const centerLon =
    filters.centerMode === 'active-event' && !unlocated
      ? activeEvent.lon
      : filters.centerMode === 'custom-point'
      ? filters.customLon
      : null;

  const effectiveRadiusKm =
    centerLat !== null && centerLon !== null
      ? filters.radiusPreset === 'custom'
        ? Math.max(1, filters.customRadiusKm)
        : Number(filters.radiusPreset)
      : null;

  const customStartMs = filters.startDateUtc ? Date.parse(filters.startDateUtc) : null;
  const customEndMs = filters.endDateUtc ? Date.parse(filters.endDateUtc) : null;

  const items: PreparedGeodeticObservation[] = records.map((rec) => {
    const distanceKm =
      centerLat !== null && centerLon !== null
        ? geodesicDistanceKm(centerLat, centerLon, rec.lat, rec.lon)
        : !unlocated
        ? geodesicDistanceKm(activeEvent.lat, activeEvent.lon, rec.lat, rec.lon)
        : null;
    const azimuthDeg =
      centerLat !== null && centerLon !== null
        ? geodesicAzimuthDeg(centerLat, centerLon, rec.lat, rec.lon)
        : !unlocated
        ? geodesicAzimuthDeg(activeEvent.lat, activeEvent.lon, rec.lat, rec.lon)
        : null;

    const epochRelation = classifyEpochRelation(rec, eventTimeMs);

    // Resolve displacement vector (prefer pre/post diff if requested and present)
    let dispE = rec.east;
    let dispN = rec.north;
    let dispU = rec.up;
    let dispSourceLabel = rec.dataMode === 'timeseries' ? 'Net TS Diff' : 'Observed';
    if (
      usePrePostDiffWhenAvailable &&
      rec.preEastMm !== null &&
      rec.preNorthMm !== null &&
      rec.postEastMm !== null &&
      rec.postNorthMm !== null
    ) {
      dispE = rec.postEastMm - rec.preEastMm;
      dispN = rec.postNorthMm - rec.preNorthMm;
      dispU = rec.postUpMm !== null && rec.preUpMm !== null ? rec.postUpMm - rec.preUpMm : rec.up;
      dispSourceLabel = 'Post − Pre Diff';
    }

    const hasDisp = dispE !== null && dispN !== null;
    const dispHorizMagMm = hasDisp ? Math.hypot(dispE as number, dispN as number) : null;
    const dispAzimuthDeg = hasDisp
      ? normalizeAngle360(Math.atan2(dispE as number, dispN as number) * RAD2DEG)
      : null;

    let dispHorizSigmaMm: number | null = null;
    if (hasDisp && (rec.sigmaEast !== null || rec.sigmaNorth !== null)) {
      const se = rec.sigmaEast ?? rec.sigmaNorth ?? 0;
      const sn = rec.sigmaNorth ?? rec.sigmaEast ?? 0;
      if ((dispHorizMagMm ?? 0) > 1e-6) {
        dispHorizSigmaMm =
          Math.sqrt(Math.pow((dispE as number) * se, 2) + Math.pow((dispN as number) * sn, 2)) /
          (dispHorizMagMm as number);
      } else {
        dispHorizSigmaMm = Math.max(se, sn);
      }
    }

    let dispRadialMm: number | null = null;
    let dispTransverseMm: number | null = null;
    if (hasDisp && azimuthDeg !== null) {
      const azRad = azimuthDeg * DEG2RAD;
      const rE = Math.sin(azRad);
      const rN = Math.cos(azRad);
      const tE = Math.cos(azRad);
      const tN = -Math.sin(azRad);
      dispRadialMm = (dispE as number) * rE + (dispN as number) * rN;
      dispTransverseMm = (dispE as number) * tE + (dispN as number) * tN;
    }

    const hasVel = rec.velocityEastMmYr !== null && rec.velocityNorthMmYr !== null;
    const velHorizMagMmYr = hasVel
      ? Math.hypot(rec.velocityEastMmYr as number, rec.velocityNorthMmYr as number)
      : null;
    const velAzimuthDeg = hasVel
      ? normalizeAngle360(
          Math.atan2(rec.velocityEastMmYr as number, rec.velocityNorthMmYr as number) * RAD2DEG
        )
      : null;
    let velHorizSigmaMmYr: number | null = null;
    if (hasVel && (rec.sigmaVelocityEastMmYr !== null || rec.sigmaVelocityNorthMmYr !== null)) {
      const se = rec.sigmaVelocityEastMmYr ?? rec.sigmaVelocityNorthMmYr ?? 0;
      const sn = rec.sigmaVelocityNorthMmYr ?? rec.sigmaVelocityEastMmYr ?? 0;
      if ((velHorizMagMmYr ?? 0) > 1e-6) {
        velHorizSigmaMmYr =
          Math.sqrt(
            Math.pow((rec.velocityEastMmYr as number) * se, 2) +
              Math.pow((rec.velocityNorthMmYr as number) * sn, 2)
          ) / (velHorizMagMmYr as number);
      } else {
        velHorizSigmaMmYr = Math.max(se, sn);
      }
    }

    // Filter eligibility
    let exclusionReason: string | null = null;
    if (rec.observationType === 'gnss' && !filters.includeGnss) {
      exclusionReason = 'GNSS layer filtered out';
    } else if (rec.observationType === 'insar' && !filters.includeInsar) {
      exclusionReason = 'InSAR layer filtered out';
    } else if (
      effectiveRadiusKm !== null &&
      distanceKm !== null &&
      distanceKm > effectiveRadiusKm
    ) {
      exclusionReason = `Outside ${effectiveRadiusKm} km radius (${distanceKm.toFixed(1)} km)`;
    } else if (filters.provenanceFilter === 'validated-only' && rec.provenanceKind !== 'Validated') {
      exclusionReason = 'Provenance filter (Validated only)';
    } else if (
      filters.provenanceFilter === 'imported-or-validated' &&
      rec.provenanceKind === 'Experimental'
    ) {
      exclusionReason = 'Provenance filter (Excludes Experimental)';
    } else if (
      filters.provenanceFilter === 'exclude-experimental' &&
      rec.provenanceKind === 'Experimental'
    ) {
      exclusionReason = 'Experimental excluded';
    } else if (
      filters.qualityGrades.length > 0 &&
      !filters.qualityGrades.includes(rec.quality)
    ) {
      exclusionReason = `Quality ${rec.quality} filtered out`;
    } else if (
      filters.dataSources.length > 0 &&
      !filters.dataSources.includes(rec.dataSource)
    ) {
      exclusionReason = `Source ${rec.dataSource} filtered out`;
    } else if (filters.timeFilter === 'spans-event' && epochRelation !== 'Spans Event') {
      exclusionReason = `Epoch does not span reference event (${epochRelation})`;
    } else if (filters.timeFilter === 'post-event' && epochRelation !== 'Post-Event') {
      exclusionReason = `Epoch not post-event (${epochRelation})`;
    } else if (filters.timeFilter === 'pre-event' && epochRelation !== 'Pre-Event') {
      exclusionReason = `Epoch not pre-event (${epochRelation})`;
    } else if (filters.timeFilter === 'custom') {
      const obsMs = rec.endTimeMs ?? rec.observationTimeMs ?? rec.startTimeMs;
      if (obsMs === null) {
        exclusionReason = 'Missing timestamp for custom date filter';
      } else {
        if (customStartMs !== null && Number.isFinite(customStartMs) && obsMs < customStartMs) {
          exclusionReason = 'Before start date filter';
        }
        if (customEndMs !== null && Number.isFinite(customEndMs) && obsMs > customEndMs) {
          exclusionReason = 'After end date filter';
        }
      }
    }

    const eligibleForFilter = exclusionReason === null;
    if (eligibleForFilter && manualExcludedIds.has(rec.id)) {
      exclusionReason = 'Manually excluded by analyst';
    }

    const included = eligibleForFilter && !manualExcludedIds.has(rec.id);
    const usableForStrain = included && rec.observationType === 'gnss' && (hasDisp || hasVel);

    return {
      record: rec,
      distanceKm,
      azimuthDeg,
      epochRelation,
      dispEastMm: dispE,
      dispNorthMm: dispN,
      dispUpMm: dispU,
      dispSigmaEastMm: rec.sigmaEast,
      dispSigmaNorthMm: rec.sigmaNorth,
      dispSigmaUpMm: rec.sigmaUp,
      dispHorizMagMm,
      dispHorizSigmaMm,
      dispAzimuthDeg,
      dispRadialMm,
      dispTransverseMm,
      dispSourceLabel,
      velEastMmYr: rec.velocityEastMmYr,
      velNorthMmYr: rec.velocityNorthMmYr,
      velUpMmYr: rec.velocityUpMmYr,
      velSigmaEastMmYr: rec.sigmaVelocityEastMmYr,
      velSigmaNorthMmYr: rec.sigmaVelocityNorthMmYr,
      velSigmaUpMmYr: rec.sigmaVelocityUpMmYr,
      velHorizMagMmYr,
      velHorizSigmaMmYr,
      velAzimuthDeg,
      eligibleForFilter,
      included,
      usableForStrain,
      exclusionReason,
    };
  });

  const includedItems = items.filter((x) => x.included);
  const includedGnss = includedItems.filter((x) => x.record.observationType === 'gnss');
  const includedInsar = includedItems.filter((x) => x.record.observationType === 'insar');
  const strainReadyGnss = includedGnss.filter((x) => x.usableForStrain);
  const excludedItems = items.filter((x) => !x.included);

  const crsSet = new Set<string>();
  const timeMsList: number[] = [];
  includedItems.forEach((it) => {
    if (it.record.crs) crsSet.add(it.record.crs.trim());
    if (it.record.startTimeMs !== null) timeMsList.push(it.record.startTimeMs);
    if (it.record.observationTimeMs !== null) timeMsList.push(it.record.observationTimeMs);
    if (it.record.endTimeMs !== null) timeMsList.push(it.record.endTimeMs);
  });

  const crsList = Array.from(crsSet);
  const hasMixedCrs = crsList.length > 1;
  const earliestUtc =
    timeMsList.length > 0 ? new Date(Math.min(...timeMsList)).toISOString().slice(0, 10) : null;
  const latestUtc =
    timeMsList.length > 0 ? new Date(Math.max(...timeMsList)).toISOString().slice(0, 10) : null;

  let centroidLat: number | null = null;
  let centroidLon: number | null = null;
  let spatialSpanKm = 0;

  if (includedItems.length > 0) {
    centroidLat =
      includedItems.reduce((s, it) => s + it.record.lat, 0) / includedItems.length;
    centroidLon =
      includedItems.reduce((s, it) => s + it.record.lon, 0) / includedItems.length;
    for (let i = 0; i < includedItems.length; i++) {
      for (let j = i + 1; j < includedItems.length; j++) {
        const d = geodesicDistanceKm(
          includedItems[i].record.lat,
          includedItems[i].record.lon,
          includedItems[j].record.lat,
          includedItems[j].record.lon
        );
        if (d > spatialSpanKm) spatialSpanKm = d;
      }
    }
  }

  const warnings: string[] = [];
  if (hasMixedCrs) {
    warnings.push(
      `Multiple coordinate reference frames detected (${crsList.join(', ')}). Mixing unaligned reference frames introduces spurious strain gradients.`
    );
  }
  if (includedItems.some((it) => it.record.provenanceKind === 'Experimental')) {
    warnings.push('Dataset contains Experimental observations.');
  }

  return {
    items,
    includedItems,
    includedGnss,
    includedInsar,
    strainReadyGnss,
    excludedItems,
    centerLat,
    centerLon,
    effectiveRadiusKm,
    crsList,
    hasMixedCrs,
    earliestUtc,
    latestUtc,
    spatialSpanKm,
    centroidLat,
    centroidLon,
    warnings,
  };
}

function invert3x3(m: number[][]): number[][] | null {
  const [a, b, c] = m[0];
  const [d, e, f] = m[1];
  const [g, h, i] = m[2];
  const det =
    a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (!Number.isFinite(det) || Math.abs(det) < 1e-24) return null;
  const invDet = 1 / det;
  return [
    [(e * i - f * h) * invDet, (c * h - b * i) * invDet, (b * f - c * e) * invDet],
    [(f * g - d * i) * invDet, (a * i - c * g) * invDet, (c * d - a * f) * invDet],
    [(d * h - e * g) * invDet, (b * g - a * h) * invDet, (a * e - b * d) * invDet],
  ];
}

function jacobi3x3Eigenvalues(aIn: number[][]): [number, number, number] {
  const a = aIn.map((r) => [...r]);
  for (let iter = 0; iter < 40; iter++) {
    let p = 0;
    let q = 1;
    let maxOff = Math.abs(a[0][1]);
    if (Math.abs(a[0][2]) > maxOff) {
      p = 0;
      q = 2;
      maxOff = Math.abs(a[0][2]);
    }
    if (Math.abs(a[1][2]) > maxOff) {
      p = 1;
      q = 2;
      maxOff = Math.abs(a[1][2]);
    }
    if (maxOff < 1e-16) break;
    const tau = (a[q][q] - a[p][p]) / (2 * a[p][q]);
    const t =
      tau >= 0 ? 1 / (tau + Math.sqrt(1 + tau * tau)) : -1 / (-tau + Math.sqrt(1 + tau * tau));
    const c = 1 / Math.sqrt(1 + t * t);
    const s = t * c;
    const app = a[p][p];
    const aqq = a[q][q];
    const apq = a[p][q];
    a[p][p] = app - t * apq;
    a[q][q] = aqq + t * apq;
    a[p][q] = 0;
    a[q][p] = 0;
    for (let r = 0; r < 3; r++) {
      if (r !== p && r !== q) {
        const arp = a[r][p];
        const arq = a[r][q];
        a[r][p] = c * arp - s * arq;
        a[p][r] = a[r][p];
        a[r][q] = s * arp + c * arq;
        a[q][r] = a[r][q];
      }
    }
  }
  const evs = [a[0][0], a[1][1], a[2][2]].sort((x, y) => x - y);
  return [evs[0], evs[1], evs[2]];
}

function solveWeightedLinear3(
  rows: Array<[number, number, number]>,
  obs: number[],
  weights: number[]
): {
  params: [number, number, number];
  cov: number[][];
  conditionNumber: number;
} | null {
  const ata = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const atb = [0, 0, 0];
  for (let k = 0; k < rows.length; k++) {
    const r = rows[k];
    const w = weights[k];
    const y = obs[k];
    for (let i = 0; i < 3; i++) {
      atb[i] += w * r[i] * y;
      for (let j = 0; j < 3; j++) {
        ata[i][j] += w * r[i] * r[j];
      }
    }
  }
  const evs = jacobi3x3Eigenvalues(ata);
  const absMax = Math.max(Math.abs(evs[0]), Math.abs(evs[2]));
  const absMin = Math.min(...evs.map((v) => Math.abs(v)));
  if (absMax < 1e-18 || absMin / absMax < 1e-10) {
    return null;
  }
  const cond = Math.sqrt(absMax / Math.max(1e-24, absMin));
  const inv = invert3x3(ata);
  if (!inv) return null;
  const params: [number, number, number] = [
    inv[0][0] * atb[0] + inv[0][1] * atb[1] + inv[0][2] * atb[2],
    inv[1][0] * atb[0] + inv[1][1] * atb[1] + inv[1][2] * atb[2],
    inv[2][0] * atb[0] + inv[2][1] * atb[1] + inv[2][2] * atb[2],
  ];
  return {
    params,
    cov: inv,
    conditionNumber: cond,
  };
}

function emptyStrainResult(
  config: StrainComputationConfig,
  prep: GeodeticPreparationResult,
  originLat: number,
  originLon: number,
  reasons: string[],
  warnings: string[],
  insarSummary: InSarLosSummary | null,
  usableCount = 0
): HorizontalStrainResult {
  const isRate = config.analysisQuantity === 'velocity-strain-rate';
  return {
    status: 'Insufficient Data',
    analysisQuantity: config.analysisQuantity,
    tensorUnit: isRate ? 'nanostrain/yr' : 'microstrain',
    rotationUnit: isRate ? 'nanorad/yr' : 'microrad',
    vectorUnit: isRate ? 'mm/yr' : 'mm',
    computedAtUtc: new Date().toISOString(),
    statusReasons: reasons,
    warnings,
    originLat,
    originLon,
    usableStationCount: usableCount,
    availableGnssCount: prep.includedGnss.length,
    availableInsarCount: prep.includedInsar.length,
    degreesOfFreedom: 0,
    spatialApertureKm: prep.spatialSpanKm,
    networkAspectRatio: 0,
    conditionNumber: Infinity,
    hasMixedCrs: prep.hasMixedCrs,
    crsList: prep.crsList,
    translationEast: 0,
    translationNorth: 0,
    exx: 0,
    eyy: 0,
    exy: 0,
    sigmaExx: 0,
    sigmaEyy: 0,
    sigmaExy: 0,
    rotation: 0,
    sigmaRotation: 0,
    e1: 0,
    e2: 0,
    sigmaE1: 0,
    sigmaE2: 0,
    e1AzimuthDeg: 0,
    e2AzimuthDeg: 90,
    axisAzimuthUncertaintyDeg: 90,
    maxShearEngineering: 0,
    sigmaMaxShear: 0,
    dilatation: 0,
    sigmaDilatation: 0,
    rmsResidualVector: 0,
    wrmsNormalized: 0,
    chi2Reduced: null,
    residuals: [],
    strainStyleLabel: 'Unavailable',
    deterministicInterpretation: reasons[0] || 'Insufficient geodetic data for 2D strain inversion.',
    limitations: [
      'Surface GNSS displacement/velocity vectors constrain 2D horizontal tensor components only; 3D vertical strain is never inferred from surface gradients alone.',
      'InSAR line-of-sight measurements remain LOS projections unless multi-geometry decomposition is supplied.',
    ],
    insarSummary,
  };
}

export function summarizeInSarObservations(insarItems: PreparedGeodeticObservation[]): InSarLosSummary | null {
  if (insarItems.length === 0) return null;
  const vals = insarItems
    .map((x) => x.record.losDisplacementMm)
    .filter((v): v is number => v !== null && Number.isFinite(v));
  if (vals.length === 0) return null;

  const passes = Array.from(new Set(insarItems.map((x) => x.record.passDirection)));
  const minLosMm = Math.min(...vals);
  const maxLosMm = Math.max(...vals);
  const meanLosMm = vals.reduce((s, v) => s + v, 0) / vals.length;
  const rmsLosMm = Math.sqrt(vals.reduce((s, v) => s + v * v, 0) / vals.length);

  return {
    count: vals.length,
    minLosMm,
    maxLosMm,
    meanLosMm,
    rmsLosMm,
    passDirections: passes,
    canDecomposeHorizontal: false,
    note:
      passes.length >= 2
        ? 'Both Ascending & Descending LOS tracks present; observations are kept in native LOS projection (mm) because co-located multi-look incidence/heading inversion is not active.'
        : 'Single LOS geometry cannot uniquely separate horizontal (E/N) from vertical (U) deformation; displayed strictly as LOS displacement (mm).',
  };
}

/**
 * Compute documented 2D horizontal infinitesimal strain / strain-rate tensor
 * via weighted least squares on local tangent-plane ENU coordinates.
 */
export function computeHorizontalStrainInversion(
  prep: GeodeticPreparationResult,
  activeEvent: EQPEvent,
  config: StrainComputationConfig
): HorizontalStrainResult {
  const isRate = config.analysisQuantity === 'velocity-strain-rate';
  const unlocated = isEventUnlocated(activeEvent);
  const insarSummary = summarizeInSarObservations(prep.includedInsar);

  const candidates = prep.includedGnss.filter((item) =>
    isRate
      ? item.velEastMmYr !== null && item.velNorthMmYr !== null
      : item.dispEastMm !== null && item.dispNorthMm !== null
  );

  const originLat =
    config.referenceFrameOrigin === 'active-event' && !unlocated
      ? activeEvent.lat
      : prep.centroidLat ?? (!unlocated ? activeEvent.lat : 14.6);
  const originLon =
    config.referenceFrameOrigin === 'active-event' && !unlocated
      ? activeEvent.lon
      : prep.centroidLon ?? (!unlocated ? activeEvent.lon : 121.0);

  const warnings: string[] = [...prep.warnings];

  if (candidates.length < MIN_STRAIN_STATIONS) {
    const reasons = [
      prep.includedInsar.length > 0 && prep.includedGnss.length === 0
        ? `Only InSAR LOS observations (${prep.includedInsar.length}) are active. 2D horizontal strain tensor inversion requires >= ${MIN_STRAIN_STATIONS} non-collinear GNSS vector stations.`
        : `Only ${candidates.length} GNSS stations have valid ${
            isRate ? 'velocity (mm/yr)' : 'displacement (mm)'
          } vectors; >= ${MIN_STRAIN_STATIONS} non-collinear stations are required.`,
    ];
    return emptyStrainResult(
      config,
      prep,
      originLat,
      originLon,
      reasons,
      warnings,
      insarSummary,
      candidates.length
    );
  }

  // Local ENU coordinates in km for station covariance & meters for gradient equations
  // Use station network centroid for numerical conditioning, then shift translation if needed
  const netCentroidLat = candidates.reduce((s, c) => s + c.record.lat, 0) / candidates.length;
  const netCentroidLon = candidates.reduce((s, c) => s + c.record.lon, 0) / candidates.length;

  const localPts = candidates.map((c) => {
    const enu = projectLatLonToLocalEnuMeters(c.record.lat, c.record.lon, netCentroidLat, netCentroidLon);
    return {
      item: c,
      xKm: enu.eastM / 1000,
      yKm: enu.northM / 1000,
    };
  });

  // Check station geometry aspect ratio (2x2 spatial covariance)
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  localPts.forEach((p) => {
    sxx += p.xKm * p.xKm;
    syy += p.yKm * p.yKm;
    sxy += p.xKm * p.yKm;
  });
  sxx /= localPts.length;
  syy /= localPts.length;
  sxy /= localPts.length;
  const tr = sxx + syy;
  const disc = Math.sqrt(Math.max(0, Math.pow(sxx - syy, 2) + 4 * sxy * sxy));
  const lamMax = 0.5 * (tr + disc);
  const lamMin = 0.5 * (tr - disc);
  const aspectRatio = lamMax > 1e-12 ? lamMin / lamMax : 0;

  let spanKm = 0;
  for (let i = 0; i < localPts.length; i++) {
    for (let j = i + 1; j < localPts.length; j++) {
      const d = Math.hypot(localPts[i].xKm - localPts[j].xKm, localPts[i].yKm - localPts[j].yKm);
      if (d > spanKm) spanKm = d;
    }
  }

  if (spanKm < 0.1 || aspectRatio < 0.005) {
    return emptyStrainResult(
      config,
      prep,
      netCentroidLat,
      netCentroidLon,
      [
        `Degenerate or collinear GNSS station geometry (spatial span ${spanKm.toFixed(
          2
        )} km, aspect ratio ${aspectRatio.toExponential(2)} < 0.005). Cannot constrain 2D gradient tensor.`,
      ],
      warnings,
      insarSummary,
      candidates.length
    );
  }

  // Scale:
  // displacement (mm) / coordinate (km) => 1e-3 m / 1e3 m = 1e-6 (direct microstrain!)
  // velocity (mm/yr) / coordinate (km) => 1e-6 /yr = 1000 nanostrain/yr -> multiply by 1000 for nanostrain/yr!
  const tensorScale = isRate ? 1000 : 1;

  const designRows: Array<[number, number, number]> = localPts.map((p) => [1, p.xKm, p.yKm]);
  const obsE: number[] = [];
  const obsN: number[] = [];
  const sigEList: number[] = [];
  const sigNList: number[] = [];
  const weightsE: number[] = [];
  const weightsN: number[] = [];

  let anyMissingSigma = false;
  localPts.forEach(({ item }) => {
    const ve = isRate ? (item.velEastMmYr as number) : (item.dispEastMm as number);
    const vn = isRate ? (item.velNorthMmYr as number) : (item.dispNorthMm as number);
    const defaultSig = isRate ? config.defaultSigmaMmYr : config.defaultSigmaMm;
    const rawSigE = isRate ? item.velSigmaEastMmYr : item.dispSigmaEastMm;
    const rawSigN = isRate ? item.velSigmaNorthMmYr : item.dispSigmaNorthMm;
    if (rawSigE === null || rawSigN === null) anyMissingSigma = true;

    const sE = Math.max(0.05, rawSigE ?? defaultSig);
    const sN = Math.max(0.05, rawSigN ?? defaultSig);
    obsE.push(ve);
    obsN.push(vn);
    sigEList.push(sE);
    sigNList.push(sN);
    weightsE.push(config.weightingMode === 'wls' ? 1 / (sE * sE) : 1);
    weightsN.push(config.weightingMode === 'wls' ? 1 / (sN * sN) : 1);
  });

  if (anyMissingSigma && config.weightingMode === 'wls') {
    warnings.push(
      `Some GNSS stations lacked explicit uncertainties; applied fallback uncertainty σ = ${
        isRate ? config.defaultSigmaMmYr : config.defaultSigmaMm
      } ${isRate ? 'mm/yr' : 'mm'}.`
    );
  }

  const solE = solveWeightedLinear3(designRows, obsE, weightsE);
  const solN = solveWeightedLinear3(designRows, obsN, weightsN);
  if (!solE || !solN) {
    return emptyStrainResult(
      config,
      prep,
      netCentroidLat,
      netCentroidLon,
      ['Weighted least squares design matrix (A^T W A) is singular or numerically ill-conditioned.'],
      warnings,
      insarSummary,
      candidates.length
    );
  }

  const cond = Math.max(solE.conditionNumber, solN.conditionNumber);
  if (!Number.isFinite(cond) || cond > 1000) {
    return emptyStrainResult(
      config,
      prep,
      netCentroidLat,
      netCentroidLon,
      [`Station design matrix condition number κ = ${cond.toFixed(1)} exceeds threshold (1000).`],
      warnings,
      insarSummary,
      candidates.length
    );
  }

  const [tE, duEdx, duEdy] = solE.params;
  const [tN, duNdx, duNdy] = solN.params;

  const exx = duEdx * tensorScale;
  const eyy = duNdy * tensorScale;
  const exy = 0.5 * (duEdy + duNdx) * tensorScale;
  const rotation = 0.5 * (duNdx - duEdy) * tensorScale; // microrad or nanorad/yr

  // Residuals & Reduced Chi-Squared
  const residuals: StationStrainResidual[] = [];
  let sumSqVec = 0;
  let sumNormSq = 0;
  localPts.forEach((p, idx) => {
    const predE = tE + duEdx * p.xKm + duEdy * p.yKm;
    const predN = tN + duNdx * p.xKm + duNdy * p.yKm;
    const rE = obsE[idx] - predE;
    const rN = obsN[idx] - predN;
    const rMag = Math.hypot(rE, rN);
    const sE = sigEList[idx];
    const sN = sigNList[idx];
    const normRes = Math.sqrt(0.5 * ((rE / sE) * (rE / sE) + (rN / sN) * (rN / sN)));
    sumSqVec += rE * rE + rN * rN;
    sumNormSq += (rE / sE) * (rE / sE) + (rN / sN) * (rN / sN);
    residuals.push({
      id: p.item.record.id,
      stationId: p.item.record.stationId,
      lat: p.item.record.lat,
      lon: p.item.record.lon,
      localEastKm: p.xKm,
      localNorthKm: p.yKm,
      observedE: obsE[idx],
      observedN: obsN[idx],
      predictedE: predE,
      predictedN: predN,
      residualE: rE,
      residualN: rN,
      residualMag: rMag,
      sigmaE: sE,
      sigmaN: sN,
      normalizedResidual: normRes,
    });
  });

  const dof = 2 * candidates.length - 6;
  const rmsResidualVector = Math.sqrt(sumSqVec / candidates.length);
  const wrmsNormalized = Math.sqrt(sumNormSq / (2 * candidates.length));
  const chi2Reduced = dof > 0 ? sumNormSq / dof : null;
  const varianceFactor = dof > 0 ? Math.max(1, sumNormSq / dof) : 1;

  // Covariance scaling for standard errors
  const varDuEdx = solE.cov[1][1] * varianceFactor * tensorScale * tensorScale;
  const varDuEdy = solE.cov[1][1] !== undefined ? solE.cov[2][2] * varianceFactor * tensorScale * tensorScale : 0;
  const varDuNdx = solN.cov[1][1] * varianceFactor * tensorScale * tensorScale;
  const varDuNdy = solN.cov[2][2] * varianceFactor * tensorScale * tensorScale;

  const sigmaExx = Math.sqrt(Math.max(0, varDuEdx));
  const sigmaEyy = Math.sqrt(Math.max(0, varDuNdy));
  const sigmaExy = Math.sqrt(Math.max(0, 0.25 * (varDuEdy + varDuNdx)));
  const sigmaRotation = sigmaExy;

  // Principal strains (extension positive)
  const meanE = 0.5 * (exx + eyy);
  const diffHalf = 0.5 * (exx - eyy);
  const radius = Math.sqrt(diffHalf * diffHalf + exy * exy);
  const e1 = meanE + radius;
  const e2 = meanE - radius;
  const maxShearEngineering = 2 * radius;
  const dilatation = exx + eyy;

  // Orientation in standard math (CCW from East): theta_math = 0.5 * atan2(exy, (exx - eyy)/2)
  // Azimuth CW from North = 90 - theta_math_deg (mod 180)
  const thetaMathRad = 0.5 * Math.atan2(exy, diffHalf);
  let e1AzimuthDeg = 90 - thetaMathRad * RAD2DEG;
  e1AzimuthDeg = ((e1AzimuthDeg % 180) + 180) % 180;
  const e2AzimuthDeg = (e1AzimuthDeg + 90) % 180;

  // Propagate principal strain uncertainties via linear partial derivatives
  const c2 = radius > 1e-12 ? diffHalf / radius : 0;
  const s2 = radius > 1e-12 ? exy / radius : 0;
  const varMean = 0.25 * (sigmaExx * sigmaExx + sigmaEyy * sigmaEyy);
  const varRadius =
    0.25 * c2 * c2 * (sigmaExx * sigmaExx + sigmaEyy * sigmaEyy) +
    s2 * s2 * sigmaExy * sigmaExy;
  const sigmaE1 = Math.sqrt(Math.max(0, varMean + varRadius));
  const sigmaE2 = Math.sqrt(Math.max(0, varMean + varRadius));
  const sigmaMaxShear = Math.sqrt(Math.max(0, 4 * varRadius));
  const sigmaDilatation = Math.sqrt(Math.max(0, sigmaExx * sigmaExx + sigmaEyy * sigmaEyy));

  const sigmaThetaRad =
    radius > 1e-9
      ? (0.5 / radius) * Math.sqrt(s2 * s2 * 0.25 * (sigmaExx * sigmaExx + sigmaEyy * sigmaEyy) + c2 * c2 * sigmaExy * sigmaExy)
      : Math.PI / 2;
  const axisAzimuthUncertaintyDeg = Math.min(90, sigmaThetaRad * RAD2DEG);

  // Strain style classification
  let strainStyleLabel = 'Pure Shear / Strike-Slip';
  if (e1 > 0 && e2 > 0 && Math.abs(dilatation) > maxShearEngineering * 0.7) {
    strainStyleLabel = 'Biaxial / Areal Extension';
  } else if (e1 < 0 && e2 < 0 && Math.abs(dilatation) > maxShearEngineering * 0.7) {
    strainStyleLabel = 'Biaxial / Areal Shortening';
  } else if (e1 > 0 && e2 < 0) {
    const ratio = Math.abs(e1) / Math.max(1e-9, Math.abs(e2));
    if (ratio > 2.2) strainStyleLabel = 'Uniaxial Extension-Dominated';
    else if (ratio < 0.45) strainStyleLabel = 'Uniaxial Shortening-Dominated';
    else strainStyleLabel = 'Strike-Slip / Wrench Shear (Extension + Shortening)';
  }

  // Deterministic status evaluation
  const statusReasons: string[] = [];
  let status: StrainResultStatus = config.isReferenceBenchmarkRun ? 'Validated' : 'Experimental';

  if (dof === 0) {
    status = 'Ambiguous';
    statusReasons.push(
      'Exactly 3 GNSS stations yield 0 degrees of freedom (exact affine fit with zero independent residual check).'
    );
  }
  if (aspectRatio < 0.04) {
    status = 'Ambiguous';
    statusReasons.push(
      `Elongated GNSS station array (aspect ratio ${aspectRatio.toFixed(3)} < 0.04); gradient perpendicular to network strike is weakly constrained.`
    );
  }
  if (cond > 200) {
    status = 'Ambiguous';
    statusReasons.push(`Elevated design matrix condition number κ = ${cond.toFixed(1)} (> 200).`);
  }
  if (chi2Reduced !== null && chi2Reduced > 9) {
    status = 'Ambiguous';
    statusReasons.push(
      `High reduced χ² = ${chi2Reduced.toFixed(2)} indicates spatially heterogeneous deformation, outliers, or non-uniform fault-near-field gradients.`
    );
  }
  if (prep.hasMixedCrs) {
    status = 'Ambiguous';
    statusReasons.push('Mixed geodetic Coordinate Reference Systems detected in active subset.');
  }
  if (!config.isReferenceBenchmarkRun && status !== 'Ambiguous') {
    statusReasons.push(
      'Solved via weighted linear 2D velocity/displacement gradient; labeled Experimental pending independent geodetic benchmark comparison.'
    );
  }

  const unitShort = isRate ? 'nε/yr' : 'με';
  const deterministicInterpretation = `${strainStyleLabel}. Maximum principal extension ε₁ = ${e1 >= 0 ? '+' : ''}${e1.toFixed(
    2
  )} ± ${sigmaE1.toFixed(2)} ${unitShort} along N${e1AzimuthDeg.toFixed(
    1
  )}°E; principal shortening/minimum ε₂ = ${e2 >= 0 ? '+' : ''}${e2.toFixed(
    2
  )} ± ${sigmaE2.toFixed(2)} ${unitShort} along N${e2AzimuthDeg.toFixed(
    1
  )}°E; engineering max shear γ_max = ${maxShearEngineering.toFixed(
    2
  )} ${unitShort}; horizontal dilatation Δ = ${dilatation >= 0 ? '+' : ''}${dilatation.toFixed(
    2
  )} ${unitShort}.`;

  const limitations = [
    'Assumes spatially uniform horizontal gradient across the selected GNSS subnetwork; sharp coseismic near-fault jumps violate linearity.',
    '2D horizontal tensor only (εxx, εyy, εxy); vertical strain εzz and out-of-plane shear cannot be resolved from surface GNSS alone.',
    isRate
      ? 'Velocity strain-rate mode reflects secular/interseismic or postseismic rates depending on observation time spans; confirm epoch continuity.'
      : 'Displacement strain mode mixes coseismic and non-tectonic motion if observation windows span long background intervals.',
    ...(insarSummary
      ? ['InSAR observations are retained strictly in Line-of-Sight (mm) and excluded from the 2D GNSS tensor inversion.']
      : []),
  ];

  return {
    status,
    analysisQuantity: config.analysisQuantity,
    tensorUnit: isRate ? 'nanostrain/yr' : 'microstrain',
    rotationUnit: isRate ? 'nanorad/yr' : 'microrad',
    vectorUnit: isRate ? 'mm/yr' : 'mm',
    computedAtUtc: new Date().toISOString(),
    statusReasons,
    warnings,
    originLat: netCentroidLat,
    originLon: netCentroidLon,
    usableStationCount: candidates.length,
    availableGnssCount: prep.includedGnss.length,
    availableInsarCount: prep.includedInsar.length,
    degreesOfFreedom: dof,
    spatialApertureKm: spanKm,
    networkAspectRatio: aspectRatio,
    conditionNumber: cond,
    hasMixedCrs: prep.hasMixedCrs,
    crsList: prep.crsList,
    translationEast: tE,
    translationNorth: tN,
    exx,
    eyy,
    exy,
    sigmaExx,
    sigmaEyy,
    sigmaExy,
    rotation,
    sigmaRotation,
    e1,
    e2,
    sigmaE1,
    sigmaE2,
    e1AzimuthDeg,
    e2AzimuthDeg,
    axisAzimuthUncertaintyDeg,
    maxShearEngineering,
    sigmaMaxShear,
    dilatation,
    sigmaDilatation,
    rmsResidualVector,
    wrmsNormalized,
    chi2Reduced,
    residuals,
    strainStyleLabel,
    deterministicInterpretation,
    limitations,
    insarSummary,
  };
}

export function buildStrainInputFingerprint(
  items: PreparedGeodeticObservation[],
  config: StrainComputationConfig,
  filters: StrainFilterConfig,
  activeEvent: EQPEvent
): string {
  const ids = items
    .map(
      (it) =>
        `${it.record.id}:${it.dispEastMm ?? 'n'}:${it.dispNorthMm ?? 'n'}:${it.velEastMmYr ?? 'n'}:${it.velNorthMmYr ?? 'n'}`
    )
    .sort()
    .join('|');
  return JSON.stringify({
    eventId: activeEvent.id,
    eventLat: activeEvent.lat,
    eventLon: activeEvent.lon,
    config,
    filters,
    ids,
  });
}

export function exportStrainResultJson(
  result: HorizontalStrainResult,
  prep: GeodeticPreparationResult,
  activeEvent: EQPEvent
): string {
  return JSON.stringify(
    {
      schema: 'eqp-modern.strain-analysis.v1',
      exportedAtUtc: new Date().toISOString(),
      referenceEvent: {
        id: activeEvent.id,
        lat: activeEvent.lat,
        lon: activeEvent.lon,
        depthKm: activeEvent.depthKm,
        originUtc: `${activeEvent.originDateGmt} ${activeEvent.originTimeGmt}`.trim(),
      },
      result,
      stationsUsed: prep.includedGnss.map((it) => ({
        stationId: it.record.stationId,
        lat: it.record.lat,
        lon: it.record.lon,
        crs: it.record.crs,
        provenance: it.record.provenanceKind,
        quality: it.record.quality,
        dataSource: it.record.dataSource,
        dispEastMm: it.dispEastMm,
        dispNorthMm: it.dispNorthMm,
        dispUpMm: it.dispUpMm,
        velEastMmYr: it.velEastMmYr,
        velNorthMmYr: it.velNorthMmYr,
        velUpMmYr: it.velUpMmYr,
      })),
    },
    null,
    2
  );
}

export function exportStrainResultCsv(
  result: HorizontalStrainResult,
  prep: GeodeticPreparationResult
): string {
  const lines: string[] = [];
  lines.push('# EQP Modern — Strain & Crustal Deformation Export');
  lines.push(`# Status,${result.status}`);
  lines.push(`# Mode,${result.analysisQuantity}`);
  lines.push(`# TensorUnit,${result.tensorUnit}`);
  lines.push(
    `# Summary,exx=${result.exx.toFixed(4)},eyy=${result.eyy.toFixed(4)},exy=${result.exy.toFixed(
      4
    )},e1=${result.e1.toFixed(4)},e2=${result.e2.toFixed(4)},e1Azimuth=${result.e1AzimuthDeg.toFixed(
      2
    )},gammaMax=${result.maxShearEngineering.toFixed(4)},dilatation=${result.dilatation.toFixed(4)}`
  );
  lines.push(
    'station_id,type,lat,lon,distance_km,disp_e_mm,disp_n_mm,disp_u_mm,disp_mag_mm,disp_az_deg,vel_e_mmyr,vel_n_mmyr,los_mm,pred_e,pred_n,residual_mag,crs,provenance,quality,source'
  );
  const resMap = new Map(result.residuals.map((r) => [r.id, r]));
  prep.includedItems.forEach((it) => {
    const r = resMap.get(it.record.id);
    lines.push(
      [
        it.record.stationId,
        it.record.observationType,
        it.record.lat.toFixed(5),
        it.record.lon.toFixed(5),
        it.distanceKm !== null ? it.distanceKm.toFixed(2) : '',
        it.dispEastMm !== null ? it.dispEastMm.toFixed(3) : '',
        it.dispNorthMm !== null ? it.dispNorthMm.toFixed(3) : '',
        it.dispUpMm !== null ? it.dispUpMm.toFixed(3) : '',
        it.dispHorizMagMm !== null ? it.dispHorizMagMm.toFixed(3) : '',
        it.dispAzimuthDeg !== null ? it.dispAzimuthDeg.toFixed(1) : '',
        it.velEastMmYr !== null ? it.velEastMmYr.toFixed(3) : '',
        it.velNorthMmYr !== null ? it.velNorthMmYr.toFixed(3) : '',
        it.record.losDisplacementMm !== null ? it.record.losDisplacementMm.toFixed(3) : '',
        r ? r.predictedE.toFixed(3) : '',
        r ? r.predictedN.toFixed(3) : '',
        r ? r.residualMag.toFixed(3) : '',
        it.record.crs,
        it.record.provenanceKind,
        it.record.quality,
        it.record.dataSource,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    );
  });
  return lines.join('\n');
}
