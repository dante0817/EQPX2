import { type EQPEvent, isEventUnlocated } from '../data/eqpData.ts';
import {
  classifyMechanism,
  computePrincipalAxes,
  type MechanismClass,
  type NodalPlane,
  normalizeAngle360,
  normalizeRake,
  planeToVectors,
  vectorsToStrikeDipRake,
} from './focalMechanism.ts';

export type MechanismQualityGrade = 'A' | 'B' | 'C' | 'D' | 'Unknown';
export type MechanismProvenanceKind = 'Imported' | 'Validated' | 'Experimental';
export type EventQualityGrade =
  | 'A'
  | 'B'
  | 'C'
  | 'D'
  | 'Reviewed'
  | 'Preliminary'
  | 'Uncertain';

export type DepthStatus = 'known' | 'missing' | 'fixed';

export interface AxisOrientation {
  trend: number;
  plunge: number;
}

export interface HistoricalFocalMechanism {
  plane1: NodalPlane;
  plane2: NodalPlane;
  pAxis: AxisOrientation;
  tAxis: AxisOrientation;
  bAxis: AxisOrientation;
  mechanismClass: MechanismClass;
  source: string;
  method: string;
  provenanceKind: MechanismProvenanceKind;
  quality: MechanismQualityGrade;
  notes?: string;
}

export interface HistoricalEarthquakeRecord {
  id: string;
  eventId: string;
  originTimeUtc: string;
  originTimeMs: number;
  lat: number;
  lon: number;
  depthKm: number | null;
  depthStatus: DepthStatus;
  magnitude: number | null;
  magnitudeType: string;
  dataSource: string;
  catalogVersion: string;
  quality: EventQualityGrade;
  locationUncertain: boolean;
  horizontalErrKm: number | null;
  depthErrKm: number | null;
  place: string;
  sourceReference: string;
  retrievedAtUtc: string;
  focalMechanism: HistoricalFocalMechanism | null;
}

export interface CatalogImportRejection {
  rowNumber: number;
  reason: string;
  rawPreview: string;
}

export interface DuplicateMatchReport {
  incomingTempId: string;
  incomingEventId: string;
  incomingSource: string;
  existingRecordId: string;
  existingEventId: string;
  existingSource: string;
  matchType: 'exact-source-id' | 'uncertain-spatiotemporal';
  distanceKm: number;
  timeDiffSec: number;
  magDiff: number | null;
  note: string;
}

export interface ParsedCatalogBatch {
  records: HistoricalEarthquakeRecord[];
  rejections: CatalogImportRejection[];
  warnings: string[];
}

export type RadiusPreset = '25' | '50' | '100' | '200' | 'custom';
export type TimeDirectionFilter = 'both' | 'before' | 'after';
export type TimeWindowPreset = 'all' | '7d' | '30d' | '365d' | '10y' | 'custom';
export type MechanismAvailabilityFilter =
  | 'all'
  | 'has-mechanism'
  | 'validated-only'
  | 'imported-or-validated'
  | 'experimental-only';

export interface HistoricalFilterConfig {
  radiusMode: RadiusPreset;
  customRadiusKm: number;
  timeDirection: TimeDirectionFilter;
  timeWindowPreset: TimeWindowPreset;
  customDaysBefore: number;
  customDaysAfter: number;
  minMag: string;
  maxMag: string;
  minDepthKm: string;
  maxDepthKm: string;
  includeMissingDepth: boolean;
  magTypes: string[];
  dataSources: string[];
  mechanismFilter: MechanismAvailabilityFilter;
  mechanismQualities: MechanismQualityGrade[];
}

export const DEFAULT_HISTORICAL_FILTERS: HistoricalFilterConfig = {
  radiusMode: '100',
  customRadiusKm: 150,
  timeDirection: 'both',
  timeWindowPreset: 'all',
  customDaysBefore: 3650,
  customDaysAfter: 3650,
  minMag: '',
  maxMag: '',
  minDepthKm: '',
  maxDepthKm: '',
  includeMissingDepth: true,
  magTypes: [],
  dataSources: [],
  mechanismFilter: 'all',
  mechanismQualities: [],
};

export type SequenceCandidateClass =
  | 'Foreshock Candidate'
  | 'Aftershock Candidate'
  | 'Origin Window Candidate'
  | 'Background / Unconfirmed';

export interface FilteredHistoricalEvent {
  record: HistoricalEarthquakeRecord;
  distanceKm: number;
  azimuthDeg: number;
  dtHoursRelativeToActive: number | null;
  sequenceCandidate: SequenceCandidateClass;
}

export interface MagnitudeScaleBreakdown {
  magnitudeType: string;
  count: number;
  min: number;
  max: number;
  mean: number;
}

export interface HistoricalSummaryStats {
  totalMatching: number;
  knownDepthCount: number;
  missingDepthCount: number;
  uncertainLocationCount: number;
  depthMinKm: number | null;
  depthMaxKm: number | null;
  depthMeanKm: number | null;
  mechanismCount: number;
  validatedMechanismCount: number;
  importedMechanismCount: number;
  experimentalMechanismCount: number;
  magnitudeBreakdown: MagnitudeScaleBreakdown[];
  sourceCounts: Array<{ source: string; count: number }>;
  earliestUtc: string | null;
  latestUtc: string | null;
}

export interface CrossSectionProjectedEvent {
  item: FilteredHistoricalEvent;
  alongKm: number;
  acrossKm: number;
  depthKm: number;
}

export interface HistoricalCatalogPayload {
  events: HistoricalEarthquakeRecord[];
  catalogVersion: number;
  updatedAt: string;
}

const EARTH_MEAN_RADIUS_KM = 6371.0088;
const WGS84_A_KM = 6378.137;
const WGS84_F = 1 / 298.257223563;
const WGS84_B_KM = WGS84_A_KM * (1 - WGS84_F);
const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/**
 * WGS84 ellipsoidal geodesic distance (Vincenty inverse formula) with spherical Haversine fallback
 * for nearly antipodal geometry or numerical edge cases.
 */
export function geodesicDistanceKm(
  lat1Deg: number,
  lon1Deg: number,
  lat2Deg: number,
  lon2Deg: number
): number {
  if (
    !Number.isFinite(lat1Deg) ||
    !Number.isFinite(lon1Deg) ||
    !Number.isFinite(lat2Deg) ||
    !Number.isFinite(lon2Deg)
  ) {
    return NaN;
  }
  if (Math.abs(lat1Deg - lat2Deg) < 1e-11 && Math.abs(lon1Deg - lon2Deg) < 1e-11) {
    return 0;
  }

  const phi1 = lat1Deg * DEG2RAD;
  const phi2 = lat2Deg * DEG2RAD;
  const L = (lon2Deg - lon1Deg) * DEG2RAD;

  const U1 = Math.atan((1 - WGS84_F) * Math.tan(phi1));
  const U2 = Math.atan((1 - WGS84_F) * Math.tan(phi2));
  const sinU1 = Math.sin(U1);
  const cosU1 = Math.cos(U1);
  const sinU2 = Math.sin(U2);
  const cosU2 = Math.cos(U2);

  let lambda = L;
  let lambdaPrev = 0;
  let sinSigma = 0;
  let cosSigma = 0;
  let sigma = 0;
  let sinAlpha = 0;
  let cosSqAlpha = 0;
  let cos2SigmaM = 0;
  let converged = false;

  for (let iter = 0; iter < 100; iter++) {
    const sinLambda = Math.sin(lambda);
    const cosLambda = Math.cos(lambda);
    sinSigma = Math.sqrt(
      (cosU2 * sinLambda) ** 2 + (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda) ** 2
    );
    if (sinSigma === 0) return 0;

    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
    sigma = Math.atan2(sinSigma, cosSigma);
    sinAlpha = (cosU1 * cosU2 * sinLambda) / sinSigma;
    cosSqAlpha = 1 - sinAlpha * sinAlpha;
    cos2SigmaM = cosSqAlpha !== 0 ? cosSigma - (2 * sinU1 * sinU2) / cosSqAlpha : 0;

    const C = (WGS84_F / 16) * cosSqAlpha * (4 + WGS84_F * (4 - 3 * cosSqAlpha));
    lambdaPrev = lambda;
    lambda =
      L +
      (1 - C) *
        WGS84_F *
        sinAlpha *
        (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));

    if (Math.abs(lambda - lambdaPrev) < 1e-12) {
      converged = true;
      break;
    }
  }

  if (!converged) {
    const dLat = (lat2Deg - lat1Deg) * DEG2RAD;
    const dLon = (lon2Deg - lon1Deg) * DEG2RAD;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
    return EARTH_MEAN_RADIUS_KM * c;
  }

  const uSq =
    (cosSqAlpha * (WGS84_A_KM * WGS84_A_KM - WGS84_B_KM * WGS84_B_KM)) /
    (WGS84_B_KM * WGS84_B_KM);
  const A = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const B = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  const deltaSigma =
    B *
    sinSigma *
    (cos2SigmaM +
      (B / 4) *
        (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
          (B / 6) *
            cos2SigmaM *
            (-3 + 4 * sinSigma * sinSigma) *
            (-3 + 4 * cos2SigmaM * cos2SigmaM)));

  return WGS84_B_KM * A * (sigma - deltaSigma);
}

/**
 * Forward spherical azimuth (degrees clockwise from North, 0..360).
 */
export function geodesicAzimuthDeg(
  lat1Deg: number,
  lon1Deg: number,
  lat2Deg: number,
  lon2Deg: number
): number {
  if (Math.abs(lat1Deg - lat2Deg) < 1e-11 && Math.abs(lon1Deg - lon2Deg) < 1e-11) {
    return 0;
  }
  const phi1 = lat1Deg * DEG2RAD;
  const phi2 = lat2Deg * DEG2RAD;
  const dLon = (lon2Deg - lon1Deg) * DEG2RAD;
  const y = Math.sin(dLon) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
  return normalizeAngle360(Math.atan2(y, x) * RAD2DEG);
}

/**
 * Parses UTC timestamp strings (ISO 8601, epoch ms, or space-delimited "YYYY-MM-DD HH:MM:SS(.sss)").
 * Rejects unparseable or out-of-range dates cleanly.
 */
export function parseUtcTimestamp(raw: unknown): { isoUtc: string; ms: number } | null {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null;
    const ms = raw > 1e12 || raw < -1e12 ? raw : raw * 1000;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    return { isoUtc: d.toISOString(), ms: d.getTime() };
  }
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const num = Number(trimmed);
    if (!Number.isFinite(num)) return null;
    const ms = Math.abs(num) > 1e11 ? num : num * 1000;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    return { isoUtc: d.toISOString(), ms: d.getTime() };
  }

  // Normalize "YYYY-MM-DD HH:MM:SS" or "YYYY/MM/DD HH:MM:SS" strictly as UTC
  let normalized = trimmed;
  const slashMatch = normalized.match(
    /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?)?(?:\s*(?:UTC|GMT|Z))?$/i
  );
  if (slashMatch) {
    const [, y, m, day, hh = '00', mm = '00', ss = '00'] = slashMatch;
    const isoCandidate = `${y}-${m.padStart(2, '0')}-${day.padStart(2, '0')}T${hh.padStart(2, '0')}:${mm}:${ss.includes('.') ? ss.padStart(5, '0') : ss.padStart(2, '0')}Z`;
    const parsed = Date.parse(isoCandidate);
    if (!Number.isNaN(parsed)) {
      return { isoUtc: new Date(parsed).toISOString(), ms: parsed };
    }
  }

  // Handle already zoned ISO-8601 strings
  if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized) && /\d{2}:\d{2}/.test(normalized)) {
    normalized = `${normalized} UTC`;
  }
  const ms = Date.parse(normalized);
  if (Number.isNaN(ms)) return null;
  return { isoUtc: new Date(ms).toISOString(), ms };
}

/**
 * Resolves the accepted EQPEvent GMT/UTC origin timestamp without altering the event.
 */
export function parseActiveEventUtcMs(event: EQPEvent): number | null {
  if (isEventUnlocated(event)) return null;
  const dateStr = (event.originDateGmt || '').trim();
  const timeStr = (event.originTimeGmt || '').trim();
  if (!dateStr) return null;

  const combined = timeStr ? `${dateStr} ${timeStr}` : dateStr;
  const parsed = parseUtcTimestamp(combined);
  if (parsed) return parsed.ms;

  const direct = Date.parse(`${dateStr} ${timeStr} UTC`);
  return Number.isNaN(direct) ? null : direct;
}

export function normalizeEventQuality(raw: unknown): EventQualityGrade {
  const val = String(raw ?? '').trim().toUpperCase();
  if (val === 'A' || val === 'B' || val === 'C' || val === 'D') return val;
  if (val === 'REVIEWED' || val === 'FINAL' || val === 'DEFINITIVE') return 'Reviewed';
  if (val === 'AUTOMATIC' || val === 'PRELIMINARY' || val === 'PROVISIONAL') return 'Preliminary';
  if (val === 'UNCERTAIN' || val === 'POOR' || val === 'LOW') return 'Uncertain';
  return 'Reviewed';
}

export function normalizeMechanismQuality(raw: unknown): MechanismQualityGrade {
  const val = String(raw ?? '').trim().toUpperCase();
  if (val === 'A' || val === 'B' || val === 'C' || val === 'D') return val;
  if (val.startsWith('A')) return 'A';
  if (val.startsWith('B')) return 'B';
  if (val.startsWith('C')) return 'C';
  if (val.startsWith('D')) return 'D';
  return 'Unknown';
}

export function normalizeMechanismProvenance(raw: unknown): MechanismProvenanceKind {
  const val = String(raw ?? '').trim().toLowerCase();
  if (val.includes('valid')) return 'Validated';
  if (val.includes('exper')) return 'Experimental';
  return 'Imported';
}

/**
 * Validates primary strike/dip/rake and derives orthogonal conjugate Plane 2 + P/T/B axes
 * and fault class using Aki & Richards NED geometry. Returns null if angles are invalid or absent.
 */
export function buildHistoricalFocalMechanism(params: {
  strike1: unknown;
  dip1: unknown;
  rake1: unknown;
  source?: string;
  method?: string;
  provenanceKind?: MechanismProvenanceKind;
  quality?: MechanismQualityGrade;
  notes?: string;
}): HistoricalFocalMechanism | null {
  const s1 = Number(params.strike1);
  const d1 = Number(params.dip1);
  const r1 = Number(params.rake1);
  if (!Number.isFinite(s1) || !Number.isFinite(d1) || !Number.isFinite(r1)) {
    return null;
  }
  if (d1 < 0 || d1 > 90) return null;

  const plane1: NodalPlane = {
    strike: Math.round(normalizeAngle360(s1)) % 360,
    dip: Math.round(d1),
    rake: Math.round(normalizeRake(r1)),
  };

  const { n, s } = planeToVectors(plane1.strike, plane1.dip, plane1.rake);
  const plane2 = vectorsToStrikeDipRake(s, n);
  const { pAxis, tAxis, bAxis } = computePrincipalAxes(n, s);
  const mechanismClass = classifyMechanism(plane1, plane2, pAxis, tAxis);

  return {
    plane1,
    plane2,
    pAxis: { trend: pAxis.trend, plunge: pAxis.plunge },
    tAxis: { trend: tAxis.trend, plunge: tAxis.plunge },
    bAxis: { trend: bAxis.trend, plunge: bAxis.plunge },
    mechanismClass,
    source: (params.source || 'Catalog Import').trim() || 'Catalog Import',
    method: (params.method || 'Reported Double-Couple').trim() || 'Reported Double-Couple',
    provenanceKind: params.provenanceKind ?? 'Imported',
    quality: params.quality ?? 'Unknown',
    notes: params.notes?.trim() || undefined,
  };
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const clean = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field.trim());
      field = '';
    } else if (ch === '\r') {
      if (clean[i + 1] === '\n') i++;
      row.push(field.trim());
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
      field = '';
    } else if (ch === '\n') {
      row.push(field.trim());
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    if (row.some((c) => c.length > 0)) rows.push(row);
  }
  return rows;
}

function normalizeHeaderKey(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function pickCol(record: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const val = record[key];
    if (val !== undefined && val !== '') return val;
  }
  return '';
}

function parseOptionalNumber(raw: string): number | null {
  if (!raw || /^(null|nan|na|n\/a|-+|unknown)$/i.test(raw.trim())) {
    return null;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function normalizeMagType(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s) return 'Unknown';
  const low = s.toLowerCase();
  if (low === 'mw' || low === 'mww' || low === 'mwc' || low === 'mwb' || low === 'mwr') {
    return low === 'mw' ? 'Mw' : s;
  }
  if (low === 'ml' || low === 'mlv') return 'Ml';
  if (low === 'mb') return 'mb';
  if (low === 'ms' || low === 'ms_20') return 'Ms';
  if (low === 'md') return 'Md';
  return s;
}

/**
 * Parses CSV earthquake catalog text (supporting PHIVOLCS-style, USGS CSV, ISC, and custom research headers).
 * Rejects invalid coordinates/timestamps rather than fabricating defaults, and preserves missing depth as null.
 */
export function parseHistoricalCsv(
  csvText: string,
  options?: {
    defaultSource?: string;
    catalogVersion?: string;
    sourceReference?: string;
    retrievedAtUtc?: string;
  }
): ParsedCatalogBatch {
  const rows = parseCsvRows(csvText);
  const retrievedAtUtc = options?.retrievedAtUtc || new Date().toISOString();
  const defaultSource = options?.defaultSource || 'CSV Import';
  const defaultVersion = options?.catalogVersion || 'v1.0';
  const sourceRef = options?.sourceReference || 'Uploaded CSV Catalog';

  if (rows.length < 2) {
    return {
      records: [],
      rejections: [
        { rowNumber: 1, reason: 'CSV must include a header row and at least one data row.', rawPreview: '' },
      ],
      warnings: [],
    };
  }

  const headers = rows[0].map(normalizeHeaderKey);
  const records: HistoricalEarthquakeRecord[] = [];
  const rejections: CatalogImportRejection[] = [];
  const warnings: string[] = [];

  for (let rIdx = 1; rIdx < rows.length; rIdx++) {
    const cells = rows[rIdx];
    const rowNum = rIdx + 1;
    const obj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = cells[c] ?? '';
    }

    const rawTime =
      pickCol(obj, [
        'origin_time_utc',
        'origin_time',
        'time_utc',
        'utc_time',
        'time',
        'datetime',
        'timestamp',
        'origin',
      ]) ||
      [
        pickCol(obj, ['date', 'origin_date', 'date_utc']),
        pickCol(obj, ['time_only', 'hms', 'utc_hms']),
      ]
        .filter(Boolean)
        .join(' ');

    const parsedTime = parseUtcTimestamp(rawTime);
    if (!parsedTime) {
      rejections.push({
        rowNumber: rowNum,
        reason: `Invalid or missing UTC origin time ("${rawTime || 'empty'}")`,
        rawPreview: cells.slice(0, 5).join(', '),
      });
      continue;
    }

    const latRaw = pickCol(obj, ['lat', 'latitude', 'epicenter_lat']);
    const lonRaw = pickCol(obj, ['lon', 'long', 'lng', 'longitude', 'epicenter_lon']);
    const lat = Number(latRaw);
    const lon = Number(lonRaw);
    if (
      !latRaw ||
      !lonRaw ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      lat < -90 ||
      lat > 90 ||
      lon < -180 ||
      lon > 180
    ) {
      rejections.push({
        rowNumber: rowNum,
        reason: `Invalid latitude/longitude (${latRaw}, ${lonRaw})`,
        rawPreview: cells.slice(0, 5).join(', '),
      });
      continue;
    }

    const depthRaw = pickCol(obj, ['depth_km', 'depth', 'dep', 'focal_depth']);
    const depthParsed = parseOptionalNumber(depthRaw);
    let depthKm: number | null = depthParsed;
    let depthStatus: DepthStatus = depthKm === null ? 'missing' : 'known';
    if (depthKm !== null && (depthKm < -10 || depthKm > 800)) {
      warnings.push(
        `Row ${rowNum}: out-of-range depth "${depthRaw}" km cleared to missing (null).`
      );
      depthKm = null;
      depthStatus = 'missing';
    } else if (
      depthKm !== null &&
      /fix/i.test(pickCol(obj, ['depth_status', 'depth_type', 'depth_flag']))
    ) {
      depthStatus = 'fixed';
    }

    const magRaw = pickCol(obj, ['magnitude', 'mag', 'm']);
    const magnitude = parseOptionalNumber(magRaw);
    const magType = normalizeMagType(pickCol(obj, ['mag_type', 'magtype', 'magnitude_type', 'scale']));
    const dataSource = pickCol(obj, ['data_source', 'source', 'agency', 'net']) || defaultSource;
    const eventId =
      pickCol(obj, ['event_id', 'eventid', 'id', 'evid', 'public_id']) ||
      `CSV-${parsedTime.isoUtc.slice(0, 19).replace(/[:T-]/g, '')}-${rowNum}`;
    const catalogVersion = pickCol(obj, ['catalog_version', 'version']) || defaultVersion;
    const rawQual = pickCol(obj, ['quality', 'event_quality', 'status']);
    const quality = normalizeEventQuality(rawQual);
    const horizErr = parseOptionalNumber(pickCol(obj, ['horizontal_error', 'horizontal_err_km', 'erh']));
    const depthErr = parseOptionalNumber(pickCol(obj, ['depth_error', 'depth_err_km', 'erz']));
    const locationUncertain =
      quality === 'Uncertain' ||
      quality === 'Preliminary' ||
      (horizErr !== null && horizErr > 25);

    const strike1 = pickCol(obj, ['strike', 'strike1', 'np1_strike', 'str1']);
    const dip1 = pickCol(obj, ['dip', 'dip1', 'np1_dip']);
    const rake1 = pickCol(obj, ['rake', 'rake1', 'np1_rake', 'slip1']);
    let focalMechanism: HistoricalFocalMechanism | null = null;
    if (strike1 !== '' || dip1 !== '' || rake1 !== '') {
      focalMechanism = buildHistoricalFocalMechanism({
        strike1,
        dip1,
        rake1,
        source: pickCol(obj, ['mech_source', 'focal_source', 'fm_source']) || dataSource,
        method: pickCol(obj, ['mech_method', 'focal_method', 'method']) || 'Catalog Strike/Dip/Rake',
        provenanceKind: normalizeMechanismProvenance(
          pickCol(obj, ['mech_provenance', 'provenance', 'fm_status']) ||
            (rawQual.toLowerCase().includes('valid') ? 'Validated' : 'Imported')
        ),
        quality: normalizeMechanismQuality(pickCol(obj, ['mech_quality', 'focal_quality', 'fm_quality'])),
        notes: pickCol(obj, ['mech_notes']),
      });
      if (!focalMechanism) {
        warnings.push(
          `Row ${rowNum} (${eventId}): incomplete or invalid focal mechanism strike/dip/rake ignored.`
        );
      }
    }

    records.push({
      id: `hevt_${eventId.replace(/[^a-zA-Z0-9_-]/g, '_')}_${records.length + 1}`,
      eventId,
      originTimeUtc: parsedTime.isoUtc,
      originTimeMs: parsedTime.ms,
      lat: Number(lat.toFixed(5)),
      lon: Number(lon.toFixed(5)),
      depthKm: depthKm === null ? null : Number(depthKm.toFixed(2)),
      depthStatus,
      magnitude: magnitude === null ? null : Number(magnitude.toFixed(2)),
      magnitudeType: magType,
      dataSource,
      catalogVersion,
      quality,
      locationUncertain,
      horizontalErrKm: horizErr,
      depthErrKm: depthErr,
      place: pickCol(obj, ['place', 'region', 'location', 'remarks']),
      sourceReference: pickCol(obj, ['source_reference', 'reference', 'url']) || sourceRef,
      retrievedAtUtc,
      focalMechanism,
    });
  }

  return { records, rejections, warnings };
}

/**
 * Extracts optional moment-tensor / focal-mechanism fields from either custom GeoJSON properties
 * or USGS FDSN GeoJSON detail/product structures when available.
 */
function extractMechanismFromGeoJsonProps(
  props: Record<string, unknown>,
  defaultSource: string
): HistoricalFocalMechanism | null {
  const fmRaw = props.focalMechanism as Record<string, unknown> | undefined;
  if (fmRaw && typeof fmRaw === 'object') {
    const p1 = fmRaw.plane1 as Record<string, unknown> | undefined;
    const strike1 = p1?.strike ?? fmRaw.strike ?? fmRaw.strike1;
    const dip1 = p1?.dip ?? fmRaw.dip ?? fmRaw.dip1;
    const rake1 = p1?.rake ?? fmRaw.rake ?? fmRaw.rake1;
    return buildHistoricalFocalMechanism({
      strike1,
      dip1,
      rake1,
      source: String(fmRaw.source || defaultSource),
      method: String(fmRaw.method || 'GeoJSON Focal Mechanism'),
      provenanceKind: normalizeMechanismProvenance(fmRaw.provenanceKind ?? fmRaw.provenance ?? 'Imported'),
      quality: normalizeMechanismQuality(fmRaw.quality),
      notes: typeof fmRaw.notes === 'string' ? fmRaw.notes : undefined,
    });
  }

  const flatStrike = props.strike ?? props.strike1 ?? props.np1_strike;
  const flatDip = props.dip ?? props.dip1 ?? props.np1_dip;
  const flatRake = props.rake ?? props.rake1 ?? props.np1_rake;
  if (flatStrike !== undefined && flatDip !== undefined && flatRake !== undefined) {
    return buildHistoricalFocalMechanism({
      strike1: flatStrike,
      dip1: flatDip,
      rake1: flatRake,
      source: String(props.mechSource || props.mech_source || defaultSource),
      method: String(props.mechMethod || props.mech_method || 'GeoJSON Focal Mechanism'),
      provenanceKind: normalizeMechanismProvenance(
        props.mechProvenance ?? props.mech_provenance ?? 'Imported'
      ),
      quality: normalizeMechanismQuality(props.mechQuality ?? props.mech_quality),
    });
  }

  // USGS FDSN product properties if fetched with detailed moment-tensor / focal-mechanism products
  const products = props.products as Record<string, Array<Record<string, unknown>>> | undefined;
  if (products && typeof products === 'object') {
    const productList = [
      ...(Array.isArray(products['moment-tensor']) ? products['moment-tensor'] : []),
      ...(Array.isArray(products['focal-mechanism']) ? products['focal-mechanism'] : []),
    ];
    for (const prod of productList) {
      const pProps = prod?.properties as Record<string, unknown> | undefined;
      if (!pProps) continue;
      const built = buildHistoricalFocalMechanism({
        strike1: pProps['nodal-plane-1-strike'],
        dip1: pProps['nodal-plane-1-dip'],
        rake1: pProps['nodal-plane-1-rake'],
        source: String(prod.source || defaultSource),
        method: String(prod.type || 'USGS Moment Tensor / Focal Mechanism'),
        provenanceKind: 'Imported',
        quality: normalizeMechanismQuality(pProps['evaluation-status'] === 'reviewed' ? 'B' : 'C'),
      });
      if (built) return built;
    }
  }

  return null;
}

/**
 * Parses a GeoJSON FeatureCollection (standard or USGS FDSN Event API GeoJSON response)
 * into validated HistoricalEarthquakeRecord[] records.
 */
export function parseHistoricalGeoJson(
  geoJsonInput: string | Record<string, unknown>,
  options?: {
    defaultSource?: string;
    catalogVersion?: string;
    sourceReference?: string;
    retrievedAtUtc?: string;
  }
): ParsedCatalogBatch {
  const retrievedAtUtc = options?.retrievedAtUtc || new Date().toISOString();
  const defaultSource = options?.defaultSource || 'GeoJSON Import';
  const defaultVersion = options?.catalogVersion || 'v1.0';
  const defaultRef = options?.sourceReference || 'GeoJSON FeatureCollection';

  let parsedObj: Record<string, unknown>;
  try {
    parsedObj =
      typeof geoJsonInput === 'string' ? (JSON.parse(geoJsonInput) as Record<string, unknown>) : geoJsonInput;
  } catch (err) {
    return {
      records: [],
      rejections: [
        {
          rowNumber: 1,
          reason: `Invalid JSON: ${err instanceof Error ? err.message : 'parse error'}`,
          rawPreview: typeof geoJsonInput === 'string' ? geoJsonInput.slice(0, 80) : '',
        },
      ],
      warnings: [],
    };
  }

  const features = Array.isArray(parsedObj?.features)
    ? (parsedObj.features as Array<Record<string, unknown>>)
    : [];

  if (features.length === 0) {
    return { records: [], rejections: [], warnings: ['GeoJSON contains 0 earthquake features.'] };
  }

  const metadata = (parsedObj.metadata as Record<string, unknown> | undefined) ?? {};
  const collectionTitle =
    typeof metadata.title === 'string' ? metadata.title : defaultSource;
  const collectionUrl =
    typeof metadata.url === 'string' ? metadata.url : defaultRef;

  const records: HistoricalEarthquakeRecord[] = [];
  const rejections: CatalogImportRejection[] = [];
  const warnings: string[] = [];

  features.forEach((feat, idx) => {
    const rowNumber = idx + 1;
    const geom = feat?.geometry as Record<string, unknown> | undefined;
    const coords = Array.isArray(geom?.coordinates) ? (geom.coordinates as unknown[]) : [];
    const props = (feat?.properties as Record<string, unknown> | undefined) ?? {};

    if (geom?.type !== 'Point' || coords.length < 2) {
      rejections.push({
        rowNumber,
        reason: 'Feature geometry must be Point with [lon, lat(, depthKm)].',
        rawPreview: String(feat?.id ?? ''),
      });
      return;
    }

    const lon = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      rejections.push({
        rowNumber,
        reason: `Invalid Point coordinates [${coords[0]}, ${coords[1]}]`,
        rawPreview: String(feat?.id ?? ''),
      });
      return;
    }

    const rawDepth = coords.length >= 3 && coords[2] !== null && coords[2] !== undefined
      ? Number(coords[2])
      : props.depthKm !== undefined && props.depthKm !== null
      ? Number(props.depthKm)
      : null;

    let depthKm: number | null =
      rawDepth !== null && Number.isFinite(rawDepth) ? Number(rawDepth.toFixed(2)) : null;
    let depthStatus: DepthStatus = depthKm === null ? 'missing' : 'known';
    if (depthKm !== null && (depthKm < -10 || depthKm > 800)) {
      warnings.push(`Feature ${rowNumber}: depth ${depthKm} km out of bounds, treated as missing.`);
      depthKm = null;
      depthStatus = 'missing';
    }

    const rawTime =
      props.originTimeUtc ?? props.time ?? props.originTime ?? props.utcTime ?? props.updated;
    const parsedTime = parseUtcTimestamp(rawTime);
    if (!parsedTime) {
      rejections.push({
        rowNumber,
        reason: `Invalid or missing origin time ("${String(rawTime ?? '')}")`,
        rawPreview: String(feat?.id ?? props.title ?? ''),
      });
      return;
    }

    const rawMag = props.mag ?? props.magnitude;
    const magnitude =
      rawMag !== null && rawMag !== undefined && Number.isFinite(Number(rawMag))
        ? Number(Number(rawMag).toFixed(2))
        : null;
    const magType = normalizeMagType(props.magType ?? props.magnitudeType);
    const dataSource =
      String(props.dataSource || props.source || (props.net ? `USGS (${String(props.net).toUpperCase()})` : collectionTitle)).trim() ||
      defaultSource;

    const eventId = String(feat.id || props.eventId || props.code || `GJ-${rowNumber}`).trim();
    const quality = normalizeEventQuality(props.quality ?? props.status);
    const locationUncertain =
      Boolean(props.locationUncertain) ||
      quality === 'Preliminary' ||
      quality === 'Uncertain';

    const focalMechanism = extractMechanismFromGeoJsonProps(props, dataSource);

    records.push({
      id: `hevt_${eventId.replace(/[^a-zA-Z0-9_-]/g, '_')}_${records.length + 1}`,
      eventId,
      originTimeUtc: parsedTime.isoUtc,
      originTimeMs: parsedTime.ms,
      lat: Number(lat.toFixed(5)),
      lon: Number(lon.toFixed(5)),
      depthKm,
      depthStatus,
      magnitude,
      magnitudeType: magType,
      dataSource,
      catalogVersion: String(props.catalogVersion || defaultVersion),
      quality,
      locationUncertain,
      horizontalErrKm:
        props.horizontalError !== undefined && Number.isFinite(Number(props.horizontalError))
          ? Number(props.horizontalError)
          : null,
      depthErrKm:
        props.depthError !== undefined && Number.isFinite(Number(props.depthError))
          ? Number(props.depthError)
          : null,
      place: String(props.place || props.title || '').trim(),
      sourceReference: String(props.url || props.sourceReference || collectionUrl),
      retrievedAtUtc,
      focalMechanism,
    });
  });

  return { records, rejections, warnings };
}

/**
 * Checks incoming records against an existing catalog.
 * Exact same (dataSource + eventId) are flagged as exact duplicates;
 * Spatiotemporally close records across sources (<= 15 km, <= 120s, |dM| <= 0.6)
 * are explicitly flagged as uncertain cross-catalog duplicates rather than silently merged.
 */
export function detectCatalogDuplicates(
  incoming: HistoricalEarthquakeRecord[],
  existing: HistoricalEarthquakeRecord[]
): {
  uniqueRecords: HistoricalEarthquakeRecord[];
  exactDuplicates: DuplicateMatchReport[];
  uncertainDuplicates: DuplicateMatchReport[];
} {
  const uniqueRecords: HistoricalEarthquakeRecord[] = [];
  const exactDuplicates: DuplicateMatchReport[] = [];
  const uncertainDuplicates: DuplicateMatchReport[] = [];

  const pool = [...existing];

  for (const inc of incoming) {
    const incKeySource = inc.dataSource.trim().toLowerCase();
    const incKeyId = inc.eventId.trim().toLowerCase();

    const exactMatch = pool.find(
      (ex) =>
        ex.dataSource.trim().toLowerCase() === incKeySource &&
        ex.eventId.trim().toLowerCase() === incKeyId
    );
    if (exactMatch) {
      exactDuplicates.push({
        incomingTempId: inc.id,
        incomingEventId: inc.eventId,
        incomingSource: inc.dataSource,
        existingRecordId: exactMatch.id,
        existingEventId: exactMatch.eventId,
        existingSource: exactMatch.dataSource,
        matchType: 'exact-source-id',
        distanceKm: Number(geodesicDistanceKm(inc.lat, inc.lon, exactMatch.lat, exactMatch.lon).toFixed(2)),
        timeDiffSec: Number((Math.abs(inc.originTimeMs - exactMatch.originTimeMs) / 1000).toFixed(2)),
        magDiff:
          inc.magnitude !== null && exactMatch.magnitude !== null
            ? Number(Math.abs(inc.magnitude - exactMatch.magnitude).toFixed(2))
            : null,
        note: `Exact duplicate of ${exactMatch.dataSource} ID ${exactMatch.eventId} skipped.`,
      });
      continue;
    }

    let uncertainFound: DuplicateMatchReport | null = null;
    for (const ex of pool) {
      const dtSec = Math.abs(inc.originTimeMs - ex.originTimeMs) / 1000;
      if (dtSec > 120) continue;
      const distKm = geodesicDistanceKm(inc.lat, inc.lon, ex.lat, ex.lon);
      if (!Number.isFinite(distKm) || distKm > 15) continue;
      const magDiff =
        inc.magnitude !== null && ex.magnitude !== null
          ? Math.abs(inc.magnitude - ex.magnitude)
          : null;
      if (magDiff !== null && magDiff > 0.6) continue;

      uncertainFound = {
        incomingTempId: inc.id,
        incomingEventId: inc.eventId,
        incomingSource: inc.dataSource,
        existingRecordId: ex.id,
        existingEventId: ex.eventId,
        existingSource: ex.dataSource,
        matchType: 'uncertain-spatiotemporal',
        distanceKm: Number(distKm.toFixed(2)),
        timeDiffSec: Number(dtSec.toFixed(2)),
        magDiff: magDiff !== null ? Number(magDiff.toFixed(2)) : null,
        note: `Potential duplicate (${distKm.toFixed(1)} km, ${dtSec.toFixed(1)} s apart) preserved with distinct IDs.`,
      };
      break;
    }

    if (uncertainFound) {
      uncertainDuplicates.push(uncertainFound);
    }

    uniqueRecords.push(inc);
    pool.push(inc);
  }

  return { uniqueRecords, exactDuplicates, uncertainDuplicates };
}

export function resolveRadiusKm(filters: HistoricalFilterConfig): number {
  if (filters.radiusMode === 'custom') {
    return Number.isFinite(filters.customRadiusKm) && filters.customRadiusKm > 0
      ? filters.customRadiusKm
      : 100;
  }
  return Number(filters.radiusMode);
}

/**
 * Heuristic spatiotemporal sequence classification relative to the active event.
 * Explicitly treated as candidate labeling only, never a confirmed fault/rupture association.
 */
export function classifySequenceCandidate(
  dtHours: number | null,
  distanceKm: number,
  radiusKm: number
): SequenceCandidateClass {
  if (dtHours === null) return 'Background / Unconfirmed';
  if (Math.abs(dtHours) <= 0.05 && distanceKm <= 15) {
    return 'Origin Window Candidate';
  }
  const zoneKm = Math.min(Math.max(radiusKm, 25), 150);
  if (distanceKm <= zoneKm) {
    if (dtHours < -0.05 && dtHours >= -24 * 30) return 'Foreshock Candidate';
    if (dtHours > 0.05 && dtHours <= 24 * 90) return 'Aftershock Candidate';
  }
  return 'Background / Unconfirmed';
}

export function filterHistoricalEvents(
  catalog: HistoricalEarthquakeRecord[],
  activeEvent: EQPEvent,
  filters: HistoricalFilterConfig
): FilteredHistoricalEvent[] {
  if (isEventUnlocated(activeEvent)) return [];
  const radiusKm = resolveRadiusKm(filters);
  const activeTimeMs = parseActiveEventUtcMs(activeEvent);

  const minMagNum = filters.minMag.trim() === '' ? null : Number(filters.minMag);
  const maxMagNum = filters.maxMag.trim() === '' ? null : Number(filters.maxMag);
  const minDepthNum = filters.minDepthKm.trim() === '' ? null : Number(filters.minDepthKm);
  const maxDepthNum = filters.maxDepthKm.trim() === '' ? null : Number(filters.maxDepthKm);

  const windowDays =
    filters.timeWindowPreset === '7d'
      ? 7
      : filters.timeWindowPreset === '30d'
      ? 30
      : filters.timeWindowPreset === '365d'
      ? 365
      : filters.timeWindowPreset === '10y'
      ? 3650
      : null;

  const daysBefore =
    filters.timeWindowPreset === 'custom'
      ? Math.max(0, filters.customDaysBefore)
      : windowDays;
  const daysAfter =
    filters.timeWindowPreset === 'custom'
      ? Math.max(0, filters.customDaysAfter)
      : windowDays;

  const results: FilteredHistoricalEvent[] = [];

  for (const record of catalog) {
    const distanceKm = geodesicDistanceKm(
      activeEvent.lat,
      activeEvent.lon,
      record.lat,
      record.lon
    );
    if (!Number.isFinite(distanceKm) || distanceKm > radiusKm) continue;

    const dtHours =
      activeTimeMs !== null ? (record.originTimeMs - activeTimeMs) / 3_600_000 : null;

    if (dtHours !== null) {
      if (filters.timeDirection === 'before' && dtHours > 0) continue;
      if (filters.timeDirection === 'after' && dtHours < 0) continue;
      if (daysBefore !== null && dtHours < -daysBefore * 24) continue;
      if (daysAfter !== null && dtHours > daysAfter * 24) continue;
    }

    if (minMagNum !== null && Number.isFinite(minMagNum)) {
      if (record.magnitude === null || record.magnitude < minMagNum) continue;
    }
    if (maxMagNum !== null && Number.isFinite(maxMagNum)) {
      if (record.magnitude === null || record.magnitude > maxMagNum) continue;
    }

    if (record.depthKm === null) {
      if (!filters.includeMissingDepth) continue;
    } else {
      if (minDepthNum !== null && Number.isFinite(minDepthNum) && record.depthKm < minDepthNum) {
        continue;
      }
      if (maxDepthNum !== null && Number.isFinite(maxDepthNum) && record.depthKm > maxDepthNum) {
        continue;
      }
    }

    if (filters.magTypes.length > 0 && !filters.magTypes.includes(record.magnitudeType)) {
      continue;
    }
    if (filters.dataSources.length > 0 && !filters.dataSources.includes(record.dataSource)) {
      continue;
    }

    const fm = record.focalMechanism;
    if (filters.mechanismFilter === 'has-mechanism' && !fm) continue;
    if (filters.mechanismFilter === 'validated-only' && fm?.provenanceKind !== 'Validated') {
      continue;
    }
    if (
      filters.mechanismFilter === 'imported-or-validated' &&
      (!fm || fm.provenanceKind === 'Experimental')
    ) {
      continue;
    }
    if (
      filters.mechanismFilter === 'experimental-only' &&
      fm?.provenanceKind !== 'Experimental'
    ) {
      continue;
    }

    if (filters.mechanismQualities.length > 0) {
      if (!fm || !filters.mechanismQualities.includes(fm.quality)) continue;
    }

    const azimuthDeg = geodesicAzimuthDeg(
      activeEvent.lat,
      activeEvent.lon,
      record.lat,
      record.lon
    );

    results.push({
      record,
      distanceKm: Number(distanceKm.toFixed(2)),
      azimuthDeg: Number(azimuthDeg.toFixed(1)),
      dtHoursRelativeToActive: dtHours !== null ? Number(dtHours.toFixed(3)) : null,
      sequenceCandidate: classifySequenceCandidate(dtHours, distanceKm, radiusKm),
    });
  }

  results.sort((a, b) => b.record.originTimeMs - a.record.originTimeMs);
  return results;
}

/**
 * Computes summary statistics strictly grouped by magnitude scale (never mixing Ml, Mw, mb, Ms).
 */
export function computeHistoricalSummaryStats(
  filtered: FilteredHistoricalEvent[]
): HistoricalSummaryStats {
  const depthValues: number[] = [];
  let missingDepthCount = 0;
  let uncertainLocationCount = 0;
  let mechanismCount = 0;
  let validatedMechanismCount = 0;
  let importedMechanismCount = 0;
  let experimentalMechanismCount = 0;

  const magMap = new Map<string, number[]>();
  const srcMap = new Map<string, number>();

  let earliestMs = Infinity;
  let latestMs = -Infinity;

  for (const item of filtered) {
    const rec = item.record;
    if (rec.originTimeMs < earliestMs) earliestMs = rec.originTimeMs;
    if (rec.originTimeMs > latestMs) latestMs = rec.originTimeMs;

    if (rec.depthKm === null) {
      missingDepthCount++;
    } else {
      depthValues.push(rec.depthKm);
    }

    if (rec.locationUncertain) uncertainLocationCount++;

    if (rec.focalMechanism) {
      mechanismCount++;
      if (rec.focalMechanism.provenanceKind === 'Validated') validatedMechanismCount++;
      else if (rec.focalMechanism.provenanceKind === 'Experimental') experimentalMechanismCount++;
      else importedMechanismCount++;
    }

    if (rec.magnitude !== null) {
      const key = rec.magnitudeType || 'Unknown';
      const arr = magMap.get(key) ?? [];
      arr.push(rec.magnitude);
      magMap.set(key, arr);
    }

    srcMap.set(rec.dataSource, (srcMap.get(rec.dataSource) ?? 0) + 1);
  }

  const magnitudeBreakdown: MagnitudeScaleBreakdown[] = Array.from(magMap.entries())
    .map(([magnitudeType, vals]) => {
      const sum = vals.reduce((acc, v) => acc + v, 0);
      return {
        magnitudeType,
        count: vals.length,
        min: Math.min(...vals),
        max: Math.max(...vals),
        mean: Number((sum / vals.length).toFixed(2)),
      };
    })
    .sort((a, b) => b.count - a.count);

  const sourceCounts = Array.from(srcMap.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);

  const depthMinKm = depthValues.length > 0 ? Math.min(...depthValues) : null;
  const depthMaxKm = depthValues.length > 0 ? Math.max(...depthValues) : null;
  const depthMeanKm =
    depthValues.length > 0
      ? Number(
          (depthValues.reduce((acc, v) => acc + v, 0) / depthValues.length).toFixed(1)
        )
      : null;

  return {
    totalMatching: filtered.length,
    knownDepthCount: depthValues.length,
    missingDepthCount,
    uncertainLocationCount,
    depthMinKm,
    depthMaxKm,
    depthMeanKm,
    mechanismCount,
    validatedMechanismCount,
    importedMechanismCount,
    experimentalMechanismCount,
    magnitudeBreakdown,
    sourceCounts,
    earliestUtc: Number.isFinite(earliestMs) ? new Date(earliestMs).toISOString() : null,
    latestUtc: Number.isFinite(latestMs) ? new Date(latestMs).toISOString() : null,
  };
}

/**
 * Projects filtered events with known depths onto a vertical cross-section plane passing through
 * (centerLat, centerLon) oriented along `strikeAzimuthDeg` (A -> A'), retaining events within ±halfSwathKm.
 */
export function projectEventsToCrossSection(
  filtered: FilteredHistoricalEvent[],
  centerLat: number,
  centerLon: number,
  strikeAzimuthDeg: number,
  halfSwathKm: number
): CrossSectionProjectedEvent[] {
  const strikeRad = normalizeAngle360(strikeAzimuthDeg) * DEG2RAD;
  const projected: CrossSectionProjectedEvent[] = [];

  for (const item of filtered) {
    if (item.record.depthKm === null) continue;
    const distKm = geodesicDistanceKm(centerLat, centerLon, item.record.lat, item.record.lon);
    if (!Number.isFinite(distKm)) continue;
    const azRad = geodesicAzimuthDeg(centerLat, centerLon, item.record.lat, item.record.lon) * DEG2RAD;
    const deltaAngle = azRad - strikeRad;
    const alongKm = distKm * Math.cos(deltaAngle);
    const acrossKm = distKm * Math.sin(deltaAngle);
    if (Math.abs(acrossKm) <= halfSwathKm) {
      projected.push({
        item,
        alongKm: Number(alongKm.toFixed(2)),
        acrossKm: Number(acrossKm.toFixed(2)),
        depthKm: item.record.depthKm,
      });
    }
  }

  return projected;
}

export function buildHistoricalFingerprint(
  event: EQPEvent,
  catalogVersion: number,
  catalogCount: number
): string {
  return [
    event.id,
    event.originDateGmt,
    event.originTimeGmt,
    event.lat.toFixed(4),
    event.lon.toFixed(4),
    event.depthKm.toFixed(2),
    event.iterations,
    catalogVersion,
    catalogCount,
  ].join('|');
}

function csvEscape(val: unknown): string {
  const str = String(val ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Exports filtered historical events with full provenance, quality, and nodal plane metadata as CSV.
 */
export function exportHistoricalCsv(
  filtered: FilteredHistoricalEvent[],
  metadata: {
    activeEvent: EQPEvent;
    filters: HistoricalFilterConfig;
    catalogVersion: number;
  }
): string {
  const lines: string[] = [
    `# EQP Modern Historical Seismicity Export (Read-Only Research Dataset)`,
    `# Active Reference Event: ${metadata.activeEvent.filename} | UTC ${metadata.activeEvent.originDateGmt} ${metadata.activeEvent.originTimeGmt} | (${metadata.activeEvent.lat.toFixed(4)}, ${metadata.activeEvent.lon.toFixed(4)}) depth ${metadata.activeEvent.depthKm.toFixed(1)} km`,
    `# Catalog Version: ${metadata.catalogVersion} | Search Radius: ${resolveRadiusKm(metadata.filters)} km | MagTypes: ${metadata.filters.magTypes.join(';') || 'All'} | Sources: ${metadata.filters.dataSources.join(';') || 'All'}`,
  ];

  const header = [
    'event_id',
    'origin_time_utc',
    'latitude',
    'longitude',
    'depth_km',
    'depth_status',
    'magnitude',
    'mag_type',
    'distance_km',
    'azimuth_deg',
    'dt_hours_relative',
    'sequence_candidate',
    'data_source',
    'catalog_version',
    'quality',
    'location_uncertain',
    'place',
    'source_reference',
    'retrieved_at_utc',
    'mech_provenance',
    'mech_quality',
    'mech_source',
    'mech_method',
    'mech_class',
    'np1_strike',
    'np1_dip',
    'np1_rake',
    'np2_strike',
    'np2_dip',
    'np2_rake',
    'p_trend',
    'p_plunge',
    't_trend',
    't_plunge',
  ];
  lines.push(header.join(','));

  for (const item of filtered) {
    const r = item.record;
    const fm = r.focalMechanism;
    lines.push(
      [
        r.eventId,
        r.originTimeUtc,
        r.lat,
        r.lon,
        r.depthKm === null ? '' : r.depthKm,
        r.depthStatus,
        r.magnitude === null ? '' : r.magnitude,
        r.magnitudeType,
        item.distanceKm,
        item.azimuthDeg,
        item.dtHoursRelativeToActive === null ? '' : item.dtHoursRelativeToActive,
        item.sequenceCandidate,
        r.dataSource,
        r.catalogVersion,
        r.quality,
        r.locationUncertain ? 'true' : 'false',
        r.place,
        r.sourceReference,
        r.retrievedAtUtc,
        fm ? fm.provenanceKind : '',
        fm ? fm.quality : '',
        fm ? fm.source : '',
        fm ? fm.method : '',
        fm ? fm.mechanismClass : '',
        fm ? fm.plane1.strike : '',
        fm ? fm.plane1.dip : '',
        fm ? fm.plane1.rake : '',
        fm ? fm.plane2.strike : '',
        fm ? fm.plane2.dip : '',
        fm ? fm.plane2.rake : '',
        fm ? fm.pAxis.trend : '',
        fm ? fm.pAxis.plunge : '',
        fm ? fm.tAxis.trend : '',
        fm ? fm.tAxis.plunge : '',
      ]
        .map(csvEscape)
        .join(',')
    );
  }

  return lines.join('\n');
}

/**
 * Exports filtered historical events as a RFC 7946 GeoJSON FeatureCollection preserving catalog provenance.
 */
export function exportHistoricalGeoJson(
  filtered: FilteredHistoricalEvent[],
  metadata: {
    activeEvent: EQPEvent;
    filters: HistoricalFilterConfig;
    catalogVersion: number;
  }
): string {
  const payload = {
    type: 'FeatureCollection',
    metadata: {
      exportedAtUtc: new Date().toISOString(),
      catalogVersion: metadata.catalogVersion,
      count: filtered.length,
      referenceEvent: {
        filename: metadata.activeEvent.filename,
        originDateGmt: metadata.activeEvent.originDateGmt,
        originTimeGmt: metadata.activeEvent.originTimeGmt,
        lat: metadata.activeEvent.lat,
        lon: metadata.activeEvent.lon,
        depthKm: metadata.activeEvent.depthKm,
      },
      filterSettings: {
        radiusKm: resolveRadiusKm(metadata.filters),
        timeDirection: metadata.filters.timeDirection,
        timeWindowPreset: metadata.filters.timeWindowPreset,
        minMag: metadata.filters.minMag || null,
        maxMag: metadata.filters.maxMag || null,
        minDepthKm: metadata.filters.minDepthKm || null,
        maxDepthKm: metadata.filters.maxDepthKm || null,
        includeMissingDepth: metadata.filters.includeMissingDepth,
        magTypes: metadata.filters.magTypes,
        dataSources: metadata.filters.dataSources,
        mechanismFilter: metadata.filters.mechanismFilter,
      },
      note: 'Read-only research export. Magnitude scales and unverified sequence candidate labels preserved without alteration.',
    },
    features: filtered.map((item) => {
      const r = item.record;
      return {
        type: 'Feature',
        id: r.eventId,
        geometry: {
          type: 'Point',
          coordinates: r.depthKm !== null ? [r.lon, r.lat, r.depthKm] : [r.lon, r.lat],
        },
        properties: {
          eventId: r.eventId,
          originTimeUtc: r.originTimeUtc,
          depthKm: r.depthKm,
          depthStatus: r.depthStatus,
          mag: r.magnitude,
          magType: r.magnitudeType,
          distanceKm: item.distanceKm,
          azimuthDeg: item.azimuthDeg,
          dtHoursRelativeToActive: item.dtHoursRelativeToActive,
          sequenceCandidate: item.sequenceCandidate,
          dataSource: r.dataSource,
          catalogVersion: r.catalogVersion,
          quality: r.quality,
          locationUncertain: r.locationUncertain,
          place: r.place,
          sourceReference: r.sourceReference,
          retrievedAtUtc: r.retrievedAtUtc,
          focalMechanism: r.focalMechanism,
        },
      };
    }),
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Exports analyst-selected historical focal mechanisms in a clean JSON format prepared for future
 * regional stress-tensor analysis (does NOT perform stress inversion).
 */
export function exportStressReadyMechanismDataset(
  selectedEvents: FilteredHistoricalEvent[],
  metadata: {
    activeEvent: EQPEvent;
    catalogVersion: number;
  }
): string {
  const withMechs = selectedEvents.filter((item) => item.record.focalMechanism !== null);
  const payload = {
    schema: 'eqp-modern.focal-mechanism-dataset.v1',
    exportedAtUtc: new Date().toISOString(),
    catalogVersion: metadata.catalogVersion,
    disclaimer:
      'Prepared dataset for future regional stress research only. Nodal plane ambiguity preserved; actual fault plane is not inferred without external geological constraints.',
    referenceEvent: {
      filename: metadata.activeEvent.filename,
      originDateGmt: metadata.activeEvent.originDateGmt,
      originTimeGmt: metadata.activeEvent.originTimeGmt,
      lat: metadata.activeEvent.lat,
      lon: metadata.activeEvent.lon,
      depthKm: metadata.activeEvent.depthKm,
    },
    mechanismCount: withMechs.length,
    mechanisms: withMechs.map((item) => {
      const r = item.record;
      const fm = r.focalMechanism!;
      return {
        eventId: r.eventId,
        originTimeUtc: r.originTimeUtc,
        lat: r.lat,
        lon: r.lon,
        depthKm: r.depthKm,
        magnitude: r.magnitude,
        magType: r.magnitudeType,
        distanceKmFromReference: item.distanceKm,
        dataSource: r.dataSource,
        catalogVersion: r.catalogVersion,
        sourceReference: r.sourceReference,
        retrievedAtUtc: r.retrievedAtUtc,
        provenanceKind: fm.provenanceKind,
        quality: fm.quality,
        mechanismSource: fm.source,
        method: fm.method,
        mechanismClass: fm.mechanismClass,
        plane1: fm.plane1,
        plane2: fm.plane2,
        pAxis: fm.pAxis,
        tAxis: fm.tAxis,
        bAxis: fm.bAxis,
      };
    }),
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Documented symbol radius mapping for historical seismicity maps (px).
 */
export function magnitudeToSymbolRadiusPx(magnitude: number | null): number {
  if (magnitude === null || !Number.isFinite(magnitude)) return 3.2;
  const clamped = Math.max(1.5, Math.min(8.5, magnitude));
  return Number((2.2 + Math.pow(1.42, clamped - 1.5) * 1.15).toFixed(2));
}

export function depthToColorHex(depthKm: number | null): string {
  if (depthKm === null || !Number.isFinite(depthKm)) return '#64748b'; // Missing depth slate
  if (depthKm <= 15) return '#dc2626'; // Very shallow crustal 0-15 km
  if (depthKm <= 35) return '#ea580c'; // Lower crust 15-35 km
  if (depthKm <= 70) return '#d97706'; // Shallow slab / lithospheric 35-70 km
  if (depthKm <= 150) return '#0d9488'; // Intermediate slab 70-150 km
  if (depthKm <= 300) return '#2563eb'; // Deep intermediate 150-300 km
  return '#6d28d9'; // Deep subduction >300 km
}
