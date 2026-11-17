import {
  EQPEvent,
  PICK_QUALITY_WEIGHTS,
  SolverEngine,
  StationMeta,
  StationPick,
  isEventUnlocated,
} from '../data/eqpData';
import { computePickDurationMagnitudes } from '../components/MagnitudeDurationPopup';
import { getDefaultJbTables, JbTravelTimeTables } from './jbtab';
import { computeDistanceAndBearing } from './nearestPlaces';
import { computeAzimuthalGap } from './spatialQa';
import { createJbTravelTimeProvider } from './travelTime/jbProvider';
import type {
  CorrectionProfileId,
  TravelTimeModelId,
  TravelTimePhase,
  TravelTimePrediction,
  TravelTimeProvider,
} from './travelTime/types';

const KM_PER_DEG = 111.195;
export const SOLVER_IMPLEMENTATION_VERSION = '2.0.0-modern';

export interface RejectedObservation {
  sta: string;
  phase: 'P' | 'S' | 'STATION';
  code:
    | 'unknown_station'
    | 'invalid_station_coords'
    | 'invalid_pick_time'
    | 'out_of_model_domain'
    | 'duplicate_observation';
  reason: string;
}

export interface HypocenterSolveWithProviderInput {
  event: EQPEvent;
  stations: StationMeta[];
  solverEngine: SolverEngine;
  travelTimeProvider: TravelTimeProvider;
  correctionProfile?: CorrectionProfileId;
  /** Optional explicit validated station overrides (by uppercase station code). */
  stationMetadataOverrides?: Record<string, Pick<StationMeta, 'lat' | 'lon' | 'delaySec' | 'elevationM'>>;
}

export interface HypocenterSolveInput {
  event: EQPEvent;
  stations: StationMeta[];
  solverEngine: SolverEngine;
  tables?: JbTravelTimeTables;
  correctionProfile?: CorrectionProfileId;
  stationMetadataOverrides?: Record<string, Pick<StationMeta, 'lat' | 'lon' | 'delaySec' | 'elevationM'>>;
}

export interface HypocenterSolveResult {
  converged: boolean;
  reason?: string;
  modelId: TravelTimeModelId;
  modelName: string;
  modelVersion: string;
  modelChecksum: string | null;
  correctionProfile: CorrectionProfileId;
  solverVersion: string;
  originDateGmt: string;
  originTimeGmt: string;
  originDateLst: string;
  originTimeLst: string;
  lat: number;
  lon: number;
  depthKm: number;
  errLatDeg: number;
  errLonDeg: number;
  errKm: number;
  errSec: number;
  errDepthKm: number | null;
  /** Unweighted root-mean-square residual across active observations (seconds). */
  rmsSec: number;
  /** Weighted root-mean-square residual across active observations (seconds). */
  weightedRmsSec: number;
  iterations: number;
  totalWeight: number;
  activePhaseCount: number;
  usedPCount: number;
  usedSCount: number;
  usedStationCount: number;
  azimuthalGapDeg: number | null;
  conditionNumber: number | null;
  depthFixed: boolean;
  depthFixReason?: string;
  uncertaintyReliable: boolean;
  rejectedObservations: RejectedObservation[];
  warnings: string[];
  picks: StationPick[];
  pickBranches: Record<string, { pBranch: string | null; sBranch: string | null }>;
  plotDatText: string;
  plotOutText: string;
}

interface PhaseObservation {
  pickIdx: number;
  sta: string;
  phase: TravelTimePhase;
  lat: number;
  lon: number;
  delaySec: number;
  obsRelSec: number;
  weight: number;
}

function isValidLatLon(lat: number, lon: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return false;
  if (lat === 0 && lon === 0) return false;
  return true;
}

function parseMmSsSecOfHour(mmss: string): number | null {
  const trimmed = mmss.trim();
  if (!trimmed) return null;

  const dotIdx = trimmed.indexOf('.');
  const intPart = dotIdx === -1 ? trimmed : trimmed.slice(0, dotIdx);
  const decPart = dotIdx === -1 ? '' : trimmed.slice(dotIdx + 1);
  if (intPart.length !== 4 || !/^\d{4}$/.test(intPart)) return null;
  if (decPart && !/^\d+$/.test(decPart)) return null;

  const mm = Number(intPart.slice(0, 2));
  const ss = Number(`${intPart.slice(2)}${decPart ? `.${decPart}` : ''}`);
  if (!Number.isFinite(mm) || !Number.isFinite(ss) || mm < 0 || mm >= 60 || ss < 0 || ss >= 60) {
    return null;
  }
  return mm * 60 + ss;
}

/**
 * Computes a circularly-consistent reference second-of-hour for a set of MMSS.ss picks,
 * shifted by multiples of 3600s so it lies within [-1800s, +1800s] of anchorOriginTimeGmt.
 */
function computeClusterAnchorSec(
  mmssValues: string[],
  anchorOriginTimeGmt: string
): number | null {
  const rawSecs = mmssValues
    .map((v) => parseMmSsSecOfHour(v))
    .filter((v): v is number => v !== null);
  if (rawSecs.length === 0) return null;

  let sumSin = 0;
  let sumCos = 0;
  for (const s of rawSecs) {
    const angle = (s / 3600) * 2 * Math.PI;
    sumSin += Math.sin(angle);
    sumCos += Math.cos(angle);
  }
  let clusterSec = (Math.atan2(sumSin, sumCos) / (2 * Math.PI)) * 3600;
  if (clusterSec < 0) clusterSec += 3600;

  const originParts = anchorOriginTimeGmt.trim().split(':');
  const originMin = Number(originParts[1] ?? 0);
  const originSec = Number(originParts[2] ?? 0);
  const baseSec =
    Number.isFinite(originMin) && Number.isFinite(originSec)
      ? originMin * 60 + originSec
      : 0;

  while (clusterSec - baseSec < -1800) clusterSec += 3600;
  while (clusterSec - baseSec >= 1800) clusterSec -= 3600;
  return clusterSec;
}

/**
 * Parses an EQP MMSS.ss pick timestamp relative to an anchor HH:MM:SS.ss origin time,
 * using an optional circular cluster reference to handle hour rollovers cleanly.
 */
export function parseMmSsRelativeToOrigin(
  mmss: string,
  anchorOriginTimeGmt: string,
  clusterAnchorSec?: number | null
): number | null {
  const pickSecOfHour = parseMmSsSecOfHour(mmss);
  if (pickSecOfHour === null) return null;

  const originParts = anchorOriginTimeGmt.trim().split(':');
  const originMin = Number(originParts[1] ?? 0);
  const originSec = Number(originParts[2] ?? 0);
  if (!Number.isFinite(originMin) || !Number.isFinite(originSec)) return null;
  const baseSec = originMin * 60 + originSec;

  if (clusterAnchorSec !== undefined && clusterAnchorSec !== null) {
    let unwrapped = pickSecOfHour;
    while (unwrapped - clusterAnchorSec < -1800) unwrapped += 3600;
    while (unwrapped - clusterAnchorSec >= 1800) unwrapped -= 3600;
    return Number((unwrapped - baseSec).toFixed(3));
  }

  let diffSec = pickSecOfHour - baseSec;
  if (diffSec < -1800) diffSec += 3600;
  else if (diffSec > 1800) diffSec -= 3600;
  return Number(diffSec.toFixed(3));
}

function addSecondsToUtcDateTime(
  dateStr: string,
  timeStr: string,
  deltaSec: number
): {
  originDateGmt: string;
  originTimeGmt: string;
  originDateLst: string;
  originTimeLst: string;
} {
  const [yyyy, mo, dd] = dateStr.split('-').map((n) => Number(n));
  const [hh, mi, secRaw] = timeStr.split(':').map((n) => Number(n));
  const wholeSec = Math.floor(secRaw || 0);
  const ms = Math.round(((secRaw || 0) - wholeSec) * 1000);

  const utcMs =
    Date.UTC(
      Number.isFinite(yyyy) ? yyyy : 2026,
      (Number.isFinite(mo) ? mo : 1) - 1,
      Number.isFinite(dd) ? dd : 1,
      Number.isFinite(hh) ? hh : 0,
      Number.isFinite(mi) ? mi : 0,
      wholeSec,
      ms
    ) + Math.round(deltaSec * 1000);

  const dUtc = new Date(utcMs);
  const fmtDate = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
      d.getUTCDate()
    ).padStart(2, '0')}`;
  const fmtTime = (d: Date) => {
    const s = (d.getUTCSeconds() + d.getUTCMilliseconds() / 1000).toFixed(2);
    const [sInt, sDec = '00'] = s.split('.');
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(
      d.getUTCMinutes()
    ).padStart(2, '0')}:${sInt.padStart(2, '0')}.${sDec.padEnd(2, '0')}`;
  };

  const dLst = new Date(utcMs + 8 * 3600 * 1000);
  return {
    originDateGmt: fmtDate(dUtc),
    originTimeGmt: fmtTime(dUtc),
    originDateLst: fmtDate(dLst),
    originTimeLst: fmtTime(dLst),
  };
}

/** Solves A * x = b for n <= 4 via Gauss-Jordan elimination with partial pivoting. */
function solveLinearSystem(aMat: number[][], bVec: number[]): number[] | null {
  const n = bVec.length;
  const m = aMat.map((row, r) => [...row, bVec[r]]);

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let bestAbs = Math.abs(m[col][col]);
    for (let r = col + 1; r < n; r++) {
      const cand = Math.abs(m[r][col]);
      if (cand > bestAbs) {
        bestAbs = cand;
        pivotRow = r;
      }
    }
    if (bestAbs < 1e-12) return null;
    if (pivotRow !== col) {
      const tmp = m[col];
      m[col] = m[pivotRow];
      m[pivotRow] = tmp;
    }
    const pivot = m[col][col];
    for (let c = col; c <= n; c++) m[col][c] /= pivot;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = m[r][col];
      if (factor === 0) continue;
      for (let c = col; c <= n; c++) {
        m[r][c] -= factor * m[col][c];
      }
    }
  }
  return m.map((row) => row[n]);
}

function invertMatrix(aMat: number[][]): number[][] | null {
  const n = aMat.length;
  const aug = aMat.map((row, r) => [
    ...row,
    ...Array.from({ length: n }, (_, c) => (r === c ? 1 : 0)),
  ]);

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let bestAbs = Math.abs(aug[col][col]);
    for (let r = col + 1; r < n; r++) {
      const cand = Math.abs(aug[r][col]);
      if (cand > bestAbs) {
        bestAbs = cand;
        pivotRow = r;
      }
    }
    if (bestAbs < 1e-12) return null;
    if (pivotRow !== col) {
      const tmp = aug[col];
      aug[col] = aug[pivotRow];
      aug[pivotRow] = tmp;
    }
    const pivot = aug[col][col];
    for (let c = 0; c < 2 * n; c++) aug[col][c] /= pivot;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = aug[r][col];
      if (factor === 0) continue;
      for (let c = 0; c < 2 * n; c++) {
        aug[r][c] -= factor * aug[col][c];
      }
    }
  }
  return aug.map((row) => row.slice(n));
}

/**
 * Computes eigenvalues of a small symmetric matrix (dim <= 4) via cyclic Jacobi rotations
 * on the column-equilibrated normal matrix D^-1 (J^T W J) D^-1 to assess true numerical rank
 * and condition number sqrt(lambda_max / lambda_min).
 */
function analyzeNormalMatrixConditioning(
  observations: PhaseObservation[],
  jacRows: number[][],
  dim: number
): { conditionNumber: number; rankDeficient: boolean; minColNorm: number } {
  const colNorms = Array.from({ length: dim }, (_, col) => {
    let sumSq = 0;
    for (let i = 0; i < observations.length; i++) {
      const w = observations[i].weight;
      const val = jacRows[i][col];
      sumSq += w * val * val;
    }
    return Math.sqrt(sumSq);
  });

  const minColNorm = Math.min(...colNorms);
  if (minColNorm < 1e-6 || !Number.isFinite(minColNorm)) {
    return { conditionNumber: Infinity, rankDeficient: true, minColNorm };
  }

  // Normalized Gram matrix G_ab = (J^T W J)_ab / (||col_a|| * ||col_b||)
  const g: number[][] = Array.from({ length: dim }, () => Array(dim).fill(0));
  for (let i = 0; i < observations.length; i++) {
    const w = observations[i].weight;
    const row = jacRows[i];
    for (let a = 0; a < dim; a++) {
      for (let b = 0; b < dim; b++) {
        g[a][b] += (w * row[a] * row[b]) / (colNorms[a] * colNorms[b]);
      }
    }
  }

  // Symmetric Jacobi eigenvalue sweeps
  for (let sweep = 0; sweep < 30; sweep++) {
    let maxOff = 0;
    let p = 0;
    let q = 1;
    for (let i = 0; i < dim; i++) {
      for (let j = i + 1; j < dim; j++) {
        const absVal = Math.abs(g[i][j]);
        if (absVal > maxOff) {
          maxOff = absVal;
          p = i;
          q = j;
        }
      }
    }
    if (maxOff < 1e-12) break;

    const app = g[p][p];
    const aqq = g[q][q];
    const apq = g[p][q];
    const tau = (aqq - app) / (2 * apq);
    const t =
      tau >= 0
        ? 1 / (tau + Math.sqrt(1 + tau * tau))
        : -1 / (-tau + Math.sqrt(1 + tau * tau));
    const c = 1 / Math.sqrt(1 + t * t);
    const s = t * c;

    g[p][p] = app - t * apq;
    g[q][q] = aqq + t * apq;
    g[p][q] = 0;
    g[q][p] = 0;

    for (let k = 0; k < dim; k++) {
      if (k === p || k === q) continue;
      const gkp = g[k][p];
      const gkq = g[k][q];
      g[k][p] = c * gkp - s * gkq;
      g[p][k] = g[k][p];
      g[k][q] = s * gkp + c * gkq;
      g[q][k] = g[k][q];
    }
  }

  const eigs = Array.from({ length: dim }, (_, i) => g[i][i]);
  const maxEig = Math.max(...eigs);
  const minEig = Math.min(...eigs);
  if (minEig <= 1e-10 || maxEig <= 0) {
    return { conditionNumber: Infinity, rankDeficient: true, minColNorm };
  }
  const cond = Math.sqrt(maxEig / minEig);
  return {
    conditionNumber: Number.isFinite(cond) ? cond : Infinity,
    rankDeficient: !Number.isFinite(cond) || cond > 1e4,
    minColNorm,
  };
}

function getEffectiveDelaySec(
  baseDelaySec: number,
  phase: TravelTimePhase,
  correctionProfile: CorrectionProfileId
): number {
  if (correctionProfile === 'none') return 0;
  return phase === 'S' ? baseDelaySec * 1.73 : baseDelaySec;
}

export function formatPlotDatText(
  event: EQPEvent,
  stations: StationMeta[],
  solverEngine: SolverEngine,
  modelLabel = 'J-B (JBTAB.PS)'
): string {
  const trialZ =
    Number.isFinite(event.trialDepthKm) && event.trialDepthKm >= 0
      ? event.trialDepthKm
      : 30.0;
  const lines: string[] = [
    `# PLOT.DAT — ${solverEngine} / ${modelLabel} Hypocenter Input (${event.filename || 'UNSAVED'})`,
    `TRIAL  ${event.originDateGmt} ${event.originTimeGmt}  LAT ${event.lat.toFixed(3)}  LON ${event.lon.toFixed(3)}  Z0 ${trialZ.toFixed(1)}`,
    'STA   P_ARR     PX  S_ARR     SX  Q   SLAT      SLON      ELEV   DLY',
  ];
  for (const p of event.picks) {
    const meta = stations.find((s) => s.code.toUpperCase() === p.sta.toUpperCase());
    const lat = meta?.lat ?? p.lat;
    const lon = meta?.lon ?? p.lon;
    const elev = meta?.elevationM ?? 0;
    const dly = meta?.delaySec ?? 0;
    lines.push(
      `${p.sta.padEnd(5)} ${(p.pTime || '---').padEnd(9)} ${p.pExcluded ? '*' : ' '}   ${(p.sTime || '---').padEnd(9)} ${p.sExcluded ? '*' : ' '}   ${p.quality || 'B'}  ${lat.toFixed(3).padStart(7)}  ${lon.toFixed(3).padStart(8)}  ${String(Math.round(elev)).padStart(5)}  ${(dly >= 0 ? `+${dly.toFixed(2)}` : dly.toFixed(2)).padStart(5)}`
    );
  }
  return lines.join('\n');
}

export function formatPlotOutText(
  res: Omit<HypocenterSolveResult, 'plotOutText' | 'plotDatText'>
): string {
  const [, , secPart = '00.00'] = res.originTimeGmt.split(':');
  const [hhStr = '00', mmStr = '00'] = res.originTimeGmt.split(':');
  const lines: string[] = [
    `# MODEL: ${res.modelName} (${res.modelVersion}) · CORR: ${res.correctionProfile} · DEPTH: ${res.depthFixed ? 'FIXED' : 'FREE'}`,
    ' IT   LAT      LON      DEPTH   HR MIN   SEC     RMS   WRMS',
    ` ${String(res.iterations).padStart(2)}  ${res.lat.toFixed(3).padStart(6)}  ${res.lon.toFixed(3).padStart(8)}  ${res.depthKm.toFixed(2).padStart(6)}  ${String(Number(hhStr)).padStart(2)}  ${String(Number(mmStr)).padStart(2)}  ${secPart.padStart(6)}  ${res.rmsSec.toFixed(2).padStart(5)}  ${res.weightedRmsSec.toFixed(2).padStart(5)}`,
    ' ERR  DEG      DEG      KM                       SEC',
    `     ${res.errLatDeg.toFixed(3).padStart(6)}  ${res.errLonDeg.toFixed(3).padStart(8)}  ${res.errKm.toFixed(2).padStart(6)}                   ${res.errSec.toFixed(2).padStart(5)}`,
    '',
    'STA    TOA   AZIM  DELTA   RESp   RESs    OBSp    OBSs   CALCp   CALCs',
  ];
  for (const p of res.picks) {
    lines.push(
      [
        p.sta.padEnd(5),
        p.toa.toFixed(1).padStart(5),
        p.azim.toFixed(1).padStart(6),
        p.delta.toFixed(2).padStart(6),
        `${p.pExcluded ? '*' : ' '}${p.resP.toFixed(2).padStart(5)}`,
        `${p.sExcluded ? '*' : ' '}${(p.sTime.trim() ? p.resS.toFixed(2) : '0.00').padStart(5)}`,
        p.obsP.toFixed(2).padStart(7),
        (p.sTime.trim() ? p.obsS.toFixed(2) : '0.00').padStart(7),
        p.calcP.toFixed(2).padStart(7),
        (p.sTime.trim() ? p.calcS.toFixed(2) : '0.00').padStart(7),
      ].join(' ')
    );
  }
  return lines.join('\n');
}

function buildFailedResult(params: {
  event: EQPEvent;
  stations: StationMeta[];
  solverEngine: SolverEngine;
  travelTimeProvider: TravelTimeProvider;
  correctionProfile: CorrectionProfileId;
  reason: string;
  resolvedPicks: StationPick[];
  rejectedObservations: RejectedObservation[];
  warnings: string[];
  activePhaseCount: number;
  usedPCount: number;
  usedSCount: number;
  usedStationCount: number;
  azimuthalGapDeg: number | null;
  conditionNumber: number | null;
  depthFixed: boolean;
  depthFixReason?: string;
}): HypocenterSolveResult {
  const {
    event,
    stations,
    solverEngine,
    travelTimeProvider,
    correctionProfile,
    reason,
    resolvedPicks,
    rejectedObservations,
    warnings,
    activePhaseCount,
    usedPCount,
    usedSCount,
    usedStationCount,
    azimuthalGapDeg,
    conditionNumber,
    depthFixed,
    depthFixReason,
  } = params;

  const core: Omit<HypocenterSolveResult, 'plotOutText' | 'plotDatText'> = {
    converged: false,
    reason,
    modelId: travelTimeProvider.metadata.id,
    modelName: travelTimeProvider.metadata.name,
    modelVersion: travelTimeProvider.metadata.version,
    modelChecksum: travelTimeProvider.metadata.checksum,
    correctionProfile,
    solverVersion: SOLVER_IMPLEMENTATION_VERSION,
    originDateGmt: event.originDateGmt,
    originTimeGmt: event.originTimeGmt,
    originDateLst: event.originDateLst,
    originTimeLst: event.originTimeLst,
    lat: event.lat,
    lon: event.lon,
    depthKm: event.depthKm,
    errLatDeg: event.errLatDeg,
    errLonDeg: event.errLonDeg,
    errKm: event.errKm,
    errSec: event.errSec ?? 0,
    errDepthKm: null,
    rmsSec: event.rmsSec,
    weightedRmsSec: event.rmsSec,
    iterations: event.iterations,
    totalWeight: 0,
    activePhaseCount,
    usedPCount,
    usedSCount,
    usedStationCount,
    azimuthalGapDeg,
    conditionNumber,
    depthFixed,
    depthFixReason,
    uncertaintyReliable: false,
    rejectedObservations,
    warnings,
    picks: resolvedPicks,
    pickBranches: {},
  };

  return {
    ...core,
    plotDatText: formatPlotDatText(
      event,
      stations,
      solverEngine,
      travelTimeProvider.metadata.shortLabel
    ),
    plotOutText: formatPlotOutText(core),
  };
}

/**
 * Runs a 4D/3D damped Gauss-Newton (Geiger) hypocenter inversion over (t0, lat, lon, [depth])
 * via a decoupled TravelTimeProvider and explicitly validated station metadata.
 */
export function solveHypocenterWithProvider({
  event,
  stations,
  solverEngine,
  travelTimeProvider,
  correctionProfile = travelTimeProvider.metadata.defaultCorrectionProfile,
  stationMetadataOverrides,
}: HypocenterSolveWithProviderInput): HypocenterSolveResult {
  const isHypoInverse = solverEngine === 'HypoInverse';
  const baseOriginTime = event.originTimeGmt || '00:00:00.00';

  const stationsByCode = new Map<string, Pick<StationMeta, 'lat' | 'lon' | 'delaySec' | 'elevationM'>>();
  for (const st of stations) {
    const code = st.code.trim().toUpperCase();
    if (code) {
      stationsByCode.set(code, st);
    }
  }
  if (stationMetadataOverrides) {
    for (const [code, override] of Object.entries(stationMetadataOverrides)) {
      const upper = code.trim().toUpperCase();
      if (upper) stationsByCode.set(upper, override);
    }
  }

  const rejectedObservations: RejectedObservation[] = [];
  const warnings: string[] = [];

  if (!travelTimeProvider.metadata.available) {
    return buildFailedResult({
      event,
      stations,
      solverEngine,
      travelTimeProvider,
      correctionProfile,
      reason:
        travelTimeProvider.metadata.unavailableReason ??
        `Travel-time model '${travelTimeProvider.metadata.name}' is unavailable.`,
      resolvedPicks: event.picks.map((p) => ({ ...p })),
      rejectedObservations,
      warnings,
      activePhaseCount: 0,
      usedPCount: 0,
      usedSCount: 0,
      usedStationCount: 0,
      azimuthalGapDeg: null,
      conditionNumber: null,
      depthFixed: true,
    });
  }

  if (isHypoInverse) {
    warnings.push(
      'Solver note: HypoInverse mode applies quality-based phase weighting and increased LM damping inside the internal EQP solver (not official HYPOINVERSE2000).'
    );
  }

  // Validate stations against metadata catalog without arbitrary fallback coordinates
  const validStationPickIndices = new Set<number>();
  const resolvedPicks: StationPick[] = event.picks.map((p, idx) => {
    const upperCode = p.sta.trim().toUpperCase();
    const meta = upperCode ? stationsByCode.get(upperCode) : undefined;
    if (!meta) {
      rejectedObservations.push({
        sta: upperCode || `ROW#${idx + 1}`,
        phase: 'STATION',
        code: 'unknown_station',
        reason: `Station '${upperCode || '(blank)'}' is not present in validated station metadata.`,
      });
      return { ...p };
    }
    if (!isValidLatLon(meta.lat, meta.lon)) {
      rejectedObservations.push({
        sta: upperCode,
        phase: 'STATION',
        code: 'invalid_station_coords',
        reason: `Station '${upperCode}' has invalid metadata coordinates (${meta.lat}, ${meta.lon}).`,
      });
      return { ...p };
    }
    validStationPickIndices.add(idx);
    return {
      ...p,
      sta: upperCode,
      lat: meta.lat,
      lon: meta.lon,
    };
  });

  const clusterAnchorSec = computeClusterAnchorSec(
    resolvedPicks
      .filter((_, idx) => validStationPickIndices.has(idx))
      .flatMap((p) => [p.pTime, p.sTime]),
    baseOriginTime
  );

  // Build active phase observations relative to anchor event.originTimeGmt
  const observations: PhaseObservation[] = [];
  const seenStationPhases = new Set<string>();

  resolvedPicks.forEach((p, idx) => {
    if (!validStationPickIndices.has(idx)) return;
    const meta = stationsByCode.get(p.sta);
    if (!meta) return;
    const baseDelaySec = Number.isFinite(meta.delaySec) ? meta.delaySec : 0;
    const qWeight = isHypoInverse
      ? PICK_QUALITY_WEIGHTS[p.quality ?? 'B'].weight
      : 1.0;

    if (p.pTime.trim() && !p.pExcluded) {
      const fromMmSs = parseMmSsRelativeToOrigin(p.pTime, baseOriginTime, clusterAnchorSec);
      let obsRel: number | null = fromMmSs;
      if (
        p.obsP > 0 &&
        (fromMmSs === null || Math.abs(fromMmSs - p.obsP) > 25)
      ) {
        obsRel = p.obsP;
      }
      if (obsRel === null || !Number.isFinite(obsRel)) {
        rejectedObservations.push({
          sta: p.sta,
          phase: 'P',
          code: 'invalid_pick_time',
          reason: `Invalid P pick timestamp '${p.pTime}' for station ${p.sta}.`,
        });
      } else {
        const spKey = `${p.sta}:P`;
        if (seenStationPhases.has(spKey)) {
          rejectedObservations.push({
            sta: p.sta,
            phase: 'P',
            code: 'duplicate_observation',
            reason: `Duplicate active P observation ignored for station ${p.sta}.`,
          });
        } else {
          seenStationPhases.add(spKey);
          observations.push({
            pickIdx: idx,
            sta: p.sta,
            phase: 'P',
            lat: meta.lat,
            lon: meta.lon,
            delaySec: getEffectiveDelaySec(baseDelaySec, 'P', correctionProfile),
            obsRelSec: obsRel,
            weight: qWeight,
          });
        }
      }
    }

    if (p.sTime.trim() && !p.sExcluded) {
      const fromMmSs = parseMmSsRelativeToOrigin(p.sTime, baseOriginTime, clusterAnchorSec);
      let obsRel: number | null = fromMmSs;
      if (
        p.obsS > 0 &&
        (fromMmSs === null || Math.abs(fromMmSs - p.obsS) > 25)
      ) {
        obsRel = p.obsS;
      }
      if (obsRel === null || !Number.isFinite(obsRel)) {
        rejectedObservations.push({
          sta: p.sta,
          phase: 'S',
          code: 'invalid_pick_time',
          reason: `Invalid S pick timestamp '${p.sTime}' for station ${p.sta}.`,
        });
      } else {
        const spKey = `${p.sta}:S`;
        if (seenStationPhases.has(spKey)) {
          rejectedObservations.push({
            sta: p.sta,
            phase: 'S',
            code: 'duplicate_observation',
            reason: `Duplicate active S observation ignored for station ${p.sta}.`,
          });
        } else {
          seenStationPhases.add(spKey);
          observations.push({
            pickIdx: idx,
            sta: p.sta,
            phase: 'S',
            lat: meta.lat,
            lon: meta.lon,
            delaySec: getEffectiveDelaySec(baseDelaySec, 'S', correctionProfile),
            obsRelSec: obsRel,
            weight: isHypoInverse ? qWeight * 0.75 : 0.75,
          });
        }
      }
    }
  });

  if (rejectedObservations.length > 0) {
    for (const rej of rejectedObservations.slice(0, 4)) {
      warnings.push(rej.reason);
    }
    if (rejectedObservations.length > 4) {
      warnings.push(`+${rejectedObservations.length - 4} additional invalid/unknown observations rejected.`);
    }
  }

  const distinctStationCoords = new Map<string, { lat: number; lon: number }>();
  for (const o of observations) {
    distinctStationCoords.set(o.sta, { lat: o.lat, lon: o.lon });
  }
  const usedStationCount = distinctStationCoords.size;
  const usedPCount = observations.filter((o) => o.phase === 'P').length;
  const usedSCount = observations.filter((o) => o.phase === 'S').length;

  if (observations.length < 3 || usedStationCount < 3) {
    const reason =
      usedStationCount < 3
        ? `Insufficient station geometry: need at least 3 distinct valid stations to solve epicenter (found ${usedStationCount} valid station${usedStationCount === 1 ? '' : 's'}, ${observations.length} active phase${observations.length === 1 ? '' : 's'}).`
        : 'Solver requires at least 3 valid active phase picks to invert hypocenter.';
    return buildFailedResult({
      event,
      stations,
      solverEngine,
      travelTimeProvider,
      correctionProfile,
      reason,
      resolvedPicks,
      rejectedObservations,
      warnings,
      activePhaseCount: observations.length,
      usedPCount,
      usedSCount,
      usedStationCount,
      azimuthalGapDeg: null,
      conditionNumber: null,
      depthFixed: true,
    });
  }

  // Check 2D spatial rank of distinct station network (collinear array -> mirror reflection ambiguity)
  const coordsList = Array.from(distinctStationCoords.values());
  const meanLat = coordsList.reduce((s, c) => s + c.lat, 0) / coordsList.length;
  const meanLon = coordsList.reduce((s, c) => s + c.lon, 0) / coordsList.length;
  const cosMean = Math.max(0.2, Math.cos((meanLat * Math.PI) / 180));
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const c of coordsList) {
    const x = (c.lon - meanLon) * KM_PER_DEG * cosMean;
    const y = (c.lat - meanLat) * KM_PER_DEG;
    sxx += x * x;
    syy += y * y;
    sxy += x * y;
  }
  const trace = sxx + syy;
  const disc = Math.sqrt(Math.max(0, (sxx - syy) * (sxx - syy) + 4 * sxy * sxy));
  const lambdaMax = 0.5 * (trace + disc);
  const lambdaMin = 0.5 * Math.max(0, trace - disc);
  const rmsPerpKm = Math.sqrt(lambdaMin / coordsList.length);
  const rmsMajorKm = Math.sqrt(lambdaMax / coordsList.length);
  if (rmsMajorKm < 0.5 || rmsPerpKm < 0.25) {
    return buildFailedResult({
      event,
      stations,
      solverEngine,
      travelTimeProvider,
      correctionProfile,
      reason: `Collinear or degenerate station network geometry (perpendicular spread ${rmsPerpKm.toFixed(2)} km): epicenter has mirror-reflection ambiguity across the station line.`,
      resolvedPicks,
      rejectedObservations,
      warnings,
      activePhaseCount: observations.length,
      usedPCount,
      usedSCount,
      usedStationCount,
      azimuthalGapDeg: null,
      conditionNumber: null,
      depthFixed: true,
    });
  }

  // Initial hypocenter guess preserving valid zero depth (0.0 km)
  const unlocated =
    isEventUnlocated(event) ||
    (Math.abs(event.lat) < 0.01 && Math.abs(event.lon) < 0.01);
  let lat: number;
  let lon: number;
  let depthKm: number;

  const validTrialDepth =
    Number.isFinite(event.trialDepthKm) && event.trialDepthKm >= 0
      ? event.trialDepthKm
      : 30.0;

  if (unlocated) {
    const pObs = observations.filter((o) => o.phase === 'P');
    const seedObs = pObs.length > 0 ? pObs : observations;
    const minObs = Math.min(...seedObs.map((o) => o.obsRelSec));
    let wLat = 0;
    let wLon = 0;
    let wSum = 0;
    for (const o of seedObs) {
      const w = o.weight / (1 + Math.max(0, o.obsRelSec - minObs) * 0.2);
      wLat += o.lat * w;
      wLon += o.lon * w;
      wSum += w;
    }
    lat = wLat / Math.max(1e-6, wSum);
    lon = wLon / Math.max(1e-6, wSum);
    depthKm = validTrialDepth;
  } else {
    lat = event.lat;
    lon = event.lon;
    depthKm =
      Number.isFinite(event.depthKm) && event.depthKm >= 0
        ? event.depthKm
        : validTrialDepth;
  }

  const pBounds = travelTimeProvider.metadata.phaseBounds.P;
  const sBounds = travelTimeProvider.metadata.phaseBounds.S;
  const maxDepthLimit = Math.min(
    pBounds?.maxDepthKm ?? 793,
    usedSCount > 0 ? sBounds?.maxDepthKm ?? 793 : pBounds?.maxDepthKm ?? 793
  );
  const minDepthLimit = Math.max(
    pBounds?.minDepthKm ?? 0,
    usedSCount > 0 ? sBounds?.minDepthKm ?? 0 : pBounds?.minDepthKm ?? 0
  );

  // Reject out-of-depth-range trial/initial depths cleanly (never silently clamp)
  if (depthKm < minDepthLimit || depthKm > maxDepthLimit) {
    return buildFailedResult({
      event,
      stations,
      solverEngine,
      travelTimeProvider,
      correctionProfile,
      reason: `Initial/trial depth ${depthKm} km is outside ${travelTimeProvider.metadata.name} depth bounds [${minDepthLimit}, ${maxDepthLimit}] km.`,
      resolvedPicks,
      rejectedObservations,
      warnings,
      activePhaseCount: observations.length,
      usedPCount,
      usedSCount,
      usedStationCount,
      azimuthalGapDeg: null,
      conditionNumber: null,
      depthFixed: true,
    });
  }

  const computeInitialT0 = (
    cLat: number,
    cLon: number,
    cDepth: number
  ): { ok: true; t0: number } | { ok: false; reason: string } => {
    let sumWT = 0;
    let sumW = 0;
    for (const obs of observations) {
      const { distKm } = computeDistanceAndBearing(cLat, cLon, obs.lat, obs.lon);
      const deltaDeg = distKm / KM_PER_DEG;
      const pred = travelTimeProvider.predict(obs.phase, deltaDeg, cDepth);
      if (!pred.valid || pred.timeSec === null) {
        return {
          ok: false,
          reason:
            pred.failureReason ??
            `Travel-time prediction unavailable for ${obs.sta} (${obs.phase}) at delta=${deltaDeg.toFixed(2)}°, depth=${cDepth.toFixed(1)} km.`,
        };
      }
      const t0Cand = obs.obsRelSec - (pred.timeSec + obs.delaySec);
      sumWT += obs.weight * t0Cand;
      sumW += obs.weight;
    }
    return { ok: true, t0: sumWT / Math.max(1e-9, sumW) };
  };

  const t0Init = computeInitialT0(lat, lon, depthKm);
  if (!t0Init.ok) {
    return buildFailedResult({
      event,
      stations,
      solverEngine,
      travelTimeProvider,
      correctionProfile,
      reason: t0Init.reason,
      resolvedPicks,
      rejectedObservations,
      warnings,
      activePhaseCount: observations.length,
      usedPCount,
      usedSCount,
      usedStationCount,
      azimuthalGapDeg: null,
      conditionNumber: null,
      depthFixed: true,
    });
  }
  let t0OffsetSec = t0Init.t0;

  interface ObjectiveState {
    ok: true;
    residuals: number[];
    jacRows: number[][];
    weightedSqSum: number;
    unweightedSqSum: number;
    weightSum: number;
    wrms: number;
    rms: number;
    cosLat: number;
  }

  const evaluateObjective = (
    cT0: number,
    cLat: number,
    cLon: number,
    cDepth: number
  ): ObjectiveState | { ok: false; reason: string } => {
    const residuals: number[] = [];
    const jacRows: number[][] = [];
    let weightedSqSum = 0;
    let unweightedSqSum = 0;
    let weightSum = 0;

    const cosLat = Math.max(0.2, Math.cos((cLat * Math.PI) / 180));

    for (const obs of observations) {
      const { distKm, azimDeg } = computeDistanceAndBearing(cLat, cLon, obs.lat, obs.lon);
      const deltaDeg = distKm / KM_PER_DEG;
      const pred: TravelTimePrediction = travelTimeProvider.predict(
        obs.phase,
        deltaDeg,
        cDepth
      );
      if (
        !pred.valid ||
        pred.timeSec === null ||
        pred.dTdDeltaDeg === null ||
        pred.dTdDepthKm === null
      ) {
        return {
          ok: false,
          reason:
            pred.failureReason ??
            `Travel-time domain error for ${obs.sta} (${obs.phase}) at delta=${deltaDeg.toFixed(2)}°, depth=${cDepth.toFixed(1)} km.`,
        };
      }

      const predRelSec = cT0 + pred.timeSec + obs.delaySec;
      const res = obs.obsRelSec - predRelSec;

      residuals.push(res);
      weightedSqSum += obs.weight * res * res;
      unweightedSqSum += res * res;
      weightSum += obs.weight;

      const azRad = (azimDeg * Math.PI) / 180;
      const dTdKm = pred.dTdDeltaDeg / KM_PER_DEG;
      const dTdNorthKm = -dTdKm * Math.cos(azRad);
      const dTdEastKm = -dTdKm * Math.sin(azRad);
      const dTdDepthKm = pred.dTdDepthKm;
      jacRows.push([1.0, dTdNorthKm, dTdEastKm, dTdDepthKm]);
    }

    const wrms = Math.sqrt(weightedSqSum / Math.max(1e-9, weightSum));
    const rms = Math.sqrt(unweightedSqSum / Math.max(1, observations.length));
    return {
      ok: true,
      residuals,
      jacRows,
      weightedSqSum,
      unweightedSqSum,
      weightSum,
      wrms,
      rms,
      cosLat,
    };
  };

  let stateEval = evaluateObjective(t0OffsetSec, lat, lon, depthKm);
  if (!stateEval.ok) {
    return buildFailedResult({
      event,
      stations,
      solverEngine,
      travelTimeProvider,
      correctionProfile,
      reason: stateEval.reason,
      resolvedPicks,
      rejectedObservations,
      warnings,
      activePhaseCount: observations.length,
      usedPCount,
      usedSCount,
      usedStationCount,
      azimuthalGapDeg: null,
      conditionNumber: null,
      depthFixed: true,
    });
  }
  let state: ObjectiveState = stateEval;

  // Geometric rank & conditioning evaluation before choosing 4D free-depth vs 3D fixed-depth
  const cond3Init = analyzeNormalMatrixConditioning(observations, state.jacRows, 3);
  if (cond3Init.rankDeficient) {
    return buildFailedResult({
      event,
      stations,
      solverEngine,
      travelTimeProvider,
      correctionProfile,
      reason: `Underdetermined or collinear station geometry (3x3 normal condition ${
        Number.isFinite(cond3Init.conditionNumber)
          ? cond3Init.conditionNumber.toExponential(1)
          : 'singular'
      }); cannot uniquely invert epicenter.`,
      resolvedPicks,
      rejectedObservations,
      warnings,
      activePhaseCount: observations.length,
      usedPCount,
      usedSCount,
      usedStationCount,
      azimuthalGapDeg: null,
      conditionNumber: Number.isFinite(cond3Init.conditionNumber)
        ? Number(cond3Init.conditionNumber.toFixed(1))
        : null,
      depthFixed: true,
    });
  }

  let depthFixed = false;
  let depthFixReason: string | undefined;

  if (observations.length < 4 || usedStationCount < 3) {
    depthFixed = true;
    depthFixReason = `Fixed at ${depthKm.toFixed(1)} km (< 4 active phases or < 3 distinct stations).`;
  } else {
    const cond4Init = analyzeNormalMatrixConditioning(observations, state.jacRows, 4);
    if (cond4Init.rankDeficient || cond4Init.conditionNumber > 2000) {
      depthFixed = true;
      depthFixReason = `Depth fixed at ${depthKm.toFixed(1)} km because 4D depth Jacobian is poorly conditioned (cond=${
        Number.isFinite(cond4Init.conditionNumber)
          ? cond4Init.conditionNumber.toFixed(0)
          : '∞'
      }).`;
      warnings.push(depthFixReason);
    }
  }

  const dim = depthFixed ? 3 : 4;
  let lambda = isHypoInverse ? 0.08 : 0.04;
  let iterations = 0;
  let acceptedSteps = 0;
  let lastStepNorm = Infinity;
  const MAX_ITERS = 25;

  for (let iter = 1; iter <= MAX_ITERS; iter++) {
    const jtwj = Array.from({ length: dim }, () => Array(dim).fill(0));
    const jtwr = Array(dim).fill(0);

    for (let i = 0; i < observations.length; i++) {
      const w = observations[i].weight;
      const row = state.jacRows[i];
      const r = state.residuals[i];
      for (let a = 0; a < dim; a++) {
        jtwr[a] += w * row[a] * r;
        for (let b = 0; b < dim; b++) {
          jtwj[a][b] += w * row[a] * row[b];
        }
      }
    }

    const damped = jtwj.map((row, r) =>
      row.map((val, c) => {
        if (r !== c) return val;
        const diagFloor = r === 3 ? 0.04 : 0.005;
        return val + lambda * Math.max(diagFloor, val) + (r === 3 ? 0.005 : 1e-6);
      })
    );

    const step = solveLinearSystem(damped, jtwr);
    if (!step) {
      lambda = Math.min(1e4, lambda * 4);
      if (lambda >= 1e4) break;
      continue;
    }

    const maxHorizStepKm = 180;
    const horizStepKm = Math.hypot(step[1], step[2]);
    const horizScale = horizStepKm > maxHorizStepKm ? maxHorizStepKm / horizStepKm : 1.0;

    const dT0 = Math.max(-60, Math.min(60, step[0]));
    const dNorthKm = step[1] * horizScale;
    const dEastKm = step[2] * horizScale;
    const dDepthKm = depthFixed ? 0 : Math.max(-45, Math.min(45, step[3]));

    const candT0 = t0OffsetSec + dT0;
    const candLat = Math.max(-89.5, Math.min(89.5, lat + dNorthKm / KM_PER_DEG));
    const candLon = lon + dEastKm / (KM_PER_DEG * state.cosLat);
    const wrappedLon = ((candLon + 540) % 360) - 180;
    const candDepth = depthFixed
      ? depthKm
      : Math.max(minDepthLimit, Math.min(maxDepthLimit, depthKm + dDepthKm));

    const candEval = evaluateObjective(candT0, candLat, wrappedLon, candDepth);
    if (!candEval.ok) {
      // Trial step exited valid travel-time domain — reject step and damp further
      lambda = Math.min(1e4, lambda * 4.0);
      if (lambda >= 1e4) break;
      continue;
    }

    const stepNorm = Math.hypot(dT0, dNorthKm, dEastKm, dDepthKm);
    const rmsDrop = state.wrms - candEval.wrms;

    if (candEval.wrms <= state.wrms + 1e-6) {
      iterations = iter;
      acceptedSteps += 1;
      lastStepNorm = stepNorm;
      t0OffsetSec = candT0;
      lat = candLat;
      lon = wrappedLon;
      depthKm = candDepth;
      state = candEval;
      lambda = Math.max(1e-4, lambda * 0.45);
      if (stepNorm < 0.01 && Math.abs(rmsDrop) < 0.0005) {
        break;
      }
    } else {
      lambda = Math.min(1e4, lambda * 4.0);
      if (lambda >= 1e4) {
        break;
      }
    }
  }

  // Final conditioning & convergence check
  const finalCond = analyzeNormalMatrixConditioning(observations, state.jacRows, dim);
  const conditionNumber = Number.isFinite(finalCond.conditionNumber)
    ? Number(finalCond.conditionNumber.toFixed(1))
    : null;

  if (acceptedSteps === 0 && state.wrms > 0.1) {
    return buildFailedResult({
      event,
      stations,
      solverEngine,
      travelTimeProvider,
      correctionProfile,
      reason: `Solver failed to find a descent step from trial hypocenter (WRMS=${state.wrms.toFixed(2)}s).`,
      resolvedPicks,
      rejectedObservations,
      warnings,
      activePhaseCount: observations.length,
      usedPCount,
      usedSCount,
      usedStationCount,
      azimuthalGapDeg: null,
      conditionNumber,
      depthFixed,
      depthFixReason,
    });
  }

  if (finalCond.rankDeficient) {
    return buildFailedResult({
      event,
      stations,
      solverEngine,
      travelTimeProvider,
      correctionProfile,
      reason: `Solution geometry became singular or poorly conditioned at convergence (cond=${
        conditionNumber ?? '∞'
      }).`,
      resolvedPicks,
      rejectedObservations,
      warnings,
      activePhaseCount: observations.length,
      usedPCount,
      usedSCount,
      usedStationCount,
      azimuthalGapDeg: null,
      conditionNumber,
      depthFixed,
      depthFixReason,
    });
  }

  if (iterations === MAX_ITERS && lastStepNorm > 2.0) {
    warnings.push(
      `Did not settle within ${MAX_ITERS} iterations (final step ${lastStepNorm.toFixed(2)}); inspect geometry and picks.`
    );
  }

  iterations = Math.max(1, iterations);
  const solvedLat = Number(lat.toFixed(3));
  const solvedLon = Number(lon.toFixed(3));
  const solvedDepth = Number(depthKm.toFixed(1));
  const solvedWeightedRms = Number(state.wrms.toFixed(2));
  const solvedRms = Number(state.rms.toFixed(2));

  // Un-inflated formal covariance C = sigma^2 * (J^T W J)^-1 when well-conditioned
  const jtwjRaw = Array.from({ length: dim }, () => Array(dim).fill(0));
  for (let i = 0; i < observations.length; i++) {
    const w = observations[i].weight;
    const row = state.jacRows[i];
    for (let a = 0; a < dim; a++) {
      for (let b = 0; b < dim; b++) {
        jtwjRaw[a][b] += w * row[a] * row[b];
      }
    }
  }

  const invRaw = invertMatrix(jtwjRaw);
  const dof = observations.length - dim;
  const varianceScale = dof > 0 ? Math.max(0.04, state.weightedSqSum / dof) : Math.max(0.25, state.weightedSqSum);
  const cosFinal = Math.max(0.2, Math.cos((solvedLat * Math.PI) / 180));

  let errSec = Number((solvedWeightedRms * 0.95).toFixed(2));
  let errLatKm = Math.max(0.8, solvedWeightedRms * 3.5);
  let errLonKm = Math.max(0.8, solvedWeightedRms * 3.5);
  let errDepthKm: number | null = null;
  let uncertaintyReliable = false;

  if (invRaw && invRaw.every((r) => r.every((v) => Number.isFinite(v)))) {
    const varT0 = invRaw[0][0] * varianceScale;
    const varN = invRaw[1][1] * varianceScale;
    const varE = invRaw[2][2] * varianceScale;
    const varZ = !depthFixed && invRaw[3] ? invRaw[3][3] * varianceScale : null;
    if (varT0 >= 0 && varN >= 0 && varE >= 0 && (varZ === null || varZ >= 0)) {
      uncertaintyReliable = dof > 0 && (conditionNumber === null || conditionNumber <= 500);
      errSec = Number(Math.max(0.05, Math.min(60, Math.sqrt(varT0))).toFixed(2));
      errLatKm = Math.max(0.3, Math.min(250, Math.sqrt(varN)));
      errLonKm = Math.max(0.3, Math.min(250, Math.sqrt(varE)));
      if (varZ !== null) {
        errDepthKm = Number(Math.max(0.5, Math.min(250, Math.sqrt(varZ))).toFixed(1));
      }
    }
  }

  if (dof <= 0) {
    warnings.push(
      `Zero degrees of freedom (${observations.length} observations, ${dim} unknowns): formal error ellipse is uncalibrated.`
    );
  }

  const errLatDeg = Number((errLatKm / KM_PER_DEG).toFixed(3));
  const errLonDeg = Number((errLonKm / (KM_PER_DEG * cosFinal)).toFixed(3));
  const errKm = Number(Math.hypot(errLatKm, errLonKm).toFixed(2));

  // Azimuthal gap diagnostic across used stations
  const gapStats = computeAzimuthalGap(
    Array.from(distinctStationCoords.entries()).map(([sta, coords], idx) => ({
      id: `gap-${idx}-${sta}`,
      sta,
      lat: coords.lat,
      lon: coords.lon,
      pExcluded: false,
      sExcluded: false,
      pTime: '0000.00',
      sTime: '',
      duration: null,
      polarity: '',
      quality: 'B',
      toa: 0,
      azim: 0,
      delta: 0,
      resP: 0,
      resS: 0,
      obsP: 0,
      obsS: 0,
      calcP: 0,
      calcS: 0,
      ms: null,
      mb: null,
      md: null,
    })),
    solvedLat,
    solvedLon
  );
  const azimuthalGapDeg = gapStats?.gapDeg ?? null;
  if (azimuthalGapDeg !== null && azimuthalGapDeg > 240) {
    warnings.push(
      `Wide azimuthal gap (${azimuthalGapDeg}° > 240°): epicenter lies outside or on edge of station network.`
    );
  }

  const solvedOrigin = addSecondsToUtcDateTime(
    event.originDateGmt,
    baseOriginTime,
    t0OffsetSec
  );

  // Compute final station geometry, residuals, branches, and duration magnitudes
  const pickBranches: Record<string, { pBranch: string | null; sBranch: string | null }> = {};
  const finalPicks: StationPick[] = resolvedPicks.map((p, idx) => {
    if (!validStationPickIndices.has(idx)) {
      return {
        ...p,
        toa: 0,
        azim: 0,
        delta: 0,
        obsP: 0,
        obsS: 0,
        calcP: 0,
        calcS: 0,
        resP: 0,
        resS: 0,
      };
    }

    const meta = stationsByCode.get(p.sta);
    const baseDelaySec = meta && Number.isFinite(meta.delaySec) ? meta.delaySec : 0;
    const { distKm, azimDeg } = computeDistanceAndBearing(
      solvedLat,
      solvedLon,
      p.lat,
      p.lon
    );
    const rawDeltaDeg = distKm / KM_PER_DEG;
    const deltaDeg = Number(rawDeltaDeg.toFixed(2));
    const predP = travelTimeProvider.predict('P', rawDeltaDeg, solvedDepth);
    const predS = p.sTime.trim()
      ? travelTimeProvider.predict('S', rawDeltaDeg, solvedDepth)
      : null;

    const pDelay = getEffectiveDelaySec(baseDelaySec, 'P', correctionProfile);
    const sDelay = getEffectiveDelaySec(baseDelaySec, 'S', correctionProfile);

    const calcP =
      predP.valid && predP.timeSec !== null
        ? Number((predP.timeSec + pDelay).toFixed(2))
        : 0;
    const toa =
      predP.valid && predP.toaDeg !== null ? Number(predP.toaDeg.toFixed(1)) : 0;
    const calcS =
      predS && predS.valid && predS.timeSec !== null
        ? Number((predS.timeSec + sDelay).toFixed(2))
        : 0;

    pickBranches[p.sta] = {
      pBranch: predP.valid ? predP.branchLabel : null,
      sBranch: predS?.valid ? predS.branchLabel : null,
    };

    let obsP = 0;
    if (p.pTime.trim()) {
      const fromMmSs = parseMmSsRelativeToOrigin(p.pTime, baseOriginTime, clusterAnchorSec);
      if (fromMmSs !== null && (p.obsP <= 0 || Math.abs(fromMmSs - p.obsP) <= 25)) {
        obsP = Number((fromMmSs - t0OffsetSec).toFixed(2));
      } else if (p.obsP > 0) {
        obsP = Number((p.obsP - t0OffsetSec).toFixed(2));
      }
    }

    let obsS = 0;
    const hasS = p.sTime.trim().length > 0;
    if (hasS) {
      const fromMmSs = parseMmSsRelativeToOrigin(p.sTime, baseOriginTime, clusterAnchorSec);
      if (fromMmSs !== null && (p.obsS <= 0 || Math.abs(fromMmSs - p.obsS) <= 25)) {
        obsS = Number((fromMmSs - t0OffsetSec).toFixed(2));
      } else if (p.obsS > 0) {
        obsS = Number((p.obsS - t0OffsetSec).toFixed(2));
      }
    }

    const resP =
      p.pTime.trim() && predP.valid && obsP !== 0 ? Number((obsP - calcP).toFixed(2)) : 0;
    const resS =
      hasS && predS?.valid && obsS !== 0 ? Number((obsS - calcS).toFixed(2)) : 0;

    const candidatePick: StationPick = {
      ...p,
      delta: deltaDeg,
    };
    const durMags = computePickDurationMagnitudes(candidatePick, solvedDepth);

    return {
      ...p,
      delta: deltaDeg,
      azim: Number(azimDeg.toFixed(1)),
      toa,
      obsP,
      obsS,
      calcP,
      calcS,
      resP,
      resS,
      ms: durMags ? Number(durMags.ms.toFixed(1)) : null,
      mb: durMags ? Number(durMags.mb.toFixed(1)) : null,
      md: durMags ? Number(durMags.ml.toFixed(1)) : null,
    };
  });

  const coreResult: Omit<HypocenterSolveResult, 'plotOutText' | 'plotDatText'> = {
    converged: true,
    modelId: travelTimeProvider.metadata.id,
    modelName: travelTimeProvider.metadata.name,
    modelVersion: travelTimeProvider.metadata.version,
    modelChecksum: travelTimeProvider.metadata.checksum,
    correctionProfile,
    solverVersion: SOLVER_IMPLEMENTATION_VERSION,
    originDateGmt: solvedOrigin.originDateGmt,
    originTimeGmt: solvedOrigin.originTimeGmt,
    originDateLst: solvedOrigin.originDateLst,
    originTimeLst: solvedOrigin.originTimeLst,
    lat: solvedLat,
    lon: solvedLon,
    depthKm: solvedDepth,
    errLatDeg,
    errLonDeg,
    errKm,
    errSec,
    errDepthKm,
    rmsSec: solvedRms,
    weightedRmsSec: solvedWeightedRms,
    iterations,
    totalWeight: Number(state.weightSum.toFixed(2)),
    activePhaseCount: observations.length,
    usedPCount,
    usedSCount,
    usedStationCount,
    azimuthalGapDeg,
    conditionNumber,
    depthFixed,
    depthFixReason,
    uncertaintyReliable,
    rejectedObservations,
    warnings,
    picks: finalPicks,
    pickBranches,
  };

  return {
    ...coreResult,
    plotDatText: formatPlotDatText(
      { ...event, ...coreResult },
      stations,
      solverEngine,
      travelTimeProvider.metadata.shortLabel
    ),
    plotOutText: formatPlotOutText(coreResult),
  };
}

/**
 * Backward-compatible J-B hypocenter solver entry point using the JBTAB.PS TravelTimeProvider.
 */
export function solveHypocenterWithJbtab({
  event,
  stations,
  solverEngine,
  tables,
  correctionProfile,
  stationMetadataOverrides,
}: HypocenterSolveInput): HypocenterSolveResult {
  const provider = createJbTravelTimeProvider(tables ?? getDefaultJbTables());
  return solveHypocenterWithProvider({
    event,
    stations,
    solverEngine,
    travelTimeProvider: provider,
    correctionProfile,
    stationMetadataOverrides,
  });
}
