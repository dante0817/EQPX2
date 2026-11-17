import {
  EQPEvent,
  isEventUnlocated,
  PICK_QUALITY_WEIGHTS,
  PickQuality,
  Polarity,
} from '../data/eqpData';
import { computeDistanceAndBearing } from './nearestPlaces';

export const KM_PER_DEG = 111.195;

export type DistanceUnit = 'km' | 'deg';
export type PhaseType = 'P' | 'S';
export type ResidualStatus = 'Nominal' | 'Warning' | 'Critical' | 'Excluded';

export interface PhaseResidualPoint {
  key: string;
  pickId: string;
  sta: string;
  phase: PhaseType;
  distKm: number;
  distDeg: number;
  residualSec: number;
  absResidualSec: number;
  obsSec: number;
  calcSec: number;
  arrivalTimeStr: string;
  excluded: boolean;
  quality: PickQuality;
  weight: number;
  azim: number;
  toa: number;
  polarity: Polarity;
  status: ResidualStatus;
}

export interface StationResidualPair {
  pickId: string;
  sta: string;
  distKm: number;
  distDeg: number;
  azim: number;
  toa: number;
  quality: PickQuality;
  hasP: boolean;
  hasS: boolean;
  pExcluded: boolean;
  sExcluded: boolean;
  resP: number | null;
  resS: number | null;
  sMinusPResSec: number | null;
  obsP: number | null;
  obsS: number | null;
  calcP: number | null;
  calcS: number | null;
  worstStatus: ResidualStatus;
}

export interface LinearRegressionFit {
  count: number;
  slopePerKm: number;
  slopePer100Km: number;
  slopePerDeg: number;
  interceptSec: number;
  rSquared: number;
}

export interface PhaseSummaryMetrics {
  count: number;
  excludedCount: number;
  meanSec: number | null;
  rmsSec: number | null;
  weightedRmsSec: number | null;
  medianSec: number | null;
  madSec: number | null;
  minSec: number | null;
  maxSec: number | null;
  maxAbsSec: number | null;
  warningCount: number;
  criticalCount: number;
  regression: LinearRegressionFit | null;
}

export interface PhaseResidualFilterOptions {
  showP?: boolean;
  showS?: boolean;
  includeExcluded?: boolean;
  qualities?: PickQuality[];
  outlierThresholdSec?: number;
}

export interface PhaseResidualAnalysis {
  eventId: string;
  unlocated: boolean;
  outlierThresholdSec: number;
  criticalThresholdSec: number;
  allPoints: PhaseResidualPoint[];
  visiblePoints: PhaseResidualPoint[];
  stationPairs: StationResidualPair[];
  pStats: PhaseSummaryMetrics;
  sStats: PhaseSummaryMetrics;
  combinedStats: PhaseSummaryMetrics;
  minDistKm: number;
  maxDistKm: number;
  minDistDeg: number;
  maxDistDeg: number;
  diagnosticNote: string;
}

function isValidCoord(lat: number, lon: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return false;
  if (lat === 0 && lon === 0) return false;
  return true;
}

export function classifyResidualStatus(
  residualSec: number,
  excluded: boolean,
  outlierThresholdSec: number
): ResidualStatus {
  if (excluded) return 'Excluded';
  const absVal = Math.abs(residualSec);
  const criticalThreshold = Math.max(1.0, outlierThresholdSec * 2);
  if (absVal >= criticalThreshold) return 'Critical';
  if (absVal >= outlierThresholdSec) return 'Warning';
  return 'Nominal';
}

function statusSeverityRank(status: ResidualStatus): number {
  switch (status) {
    case 'Critical':
      return 3;
    case 'Warning':
      return 2;
    case 'Nominal':
      return 1;
    case 'Excluded':
      return 0;
  }
}

function computeMedian(sortedAsc: number[]): number | null {
  const n = sortedAsc.length;
  if (n === 0) return null;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sortedAsc[mid] : (sortedAsc[mid - 1] + sortedAsc[mid]) / 2;
}

export function computeLinearRegression(
  points: ReadonlyArray<{ distKm: number; residualSec: number }>
): LinearRegressionFit | null {
  if (points.length < 3) return null;
  const n = points.length;
  let sumX = 0;
  let sumY = 0;
  for (const pt of points) {
    sumX += pt.distKm;
    sumY += pt.residualSec;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const pt of points) {
    const dx = pt.distKm - meanX;
    const dy = pt.residualSec - meanY;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  if (sxx <= 1e-9) return null;

  const slopePerKm = sxy / sxx;
  const interceptSec = meanY - slopePerKm * meanX;
  const rSquared = syy > 1e-12 ? Math.min(1, Math.max(0, (sxy * sxy) / (sxx * syy))) : 0;

  return {
    count: n,
    slopePerKm,
    slopePer100Km: slopePerKm * 100,
    slopePerDeg: slopePerKm * KM_PER_DEG,
    interceptSec,
    rSquared,
  };
}

export function computePhaseSummaryMetrics(
  points: ReadonlyArray<PhaseResidualPoint>
): PhaseSummaryMetrics {
  const active = points.filter((p) => !p.excluded);
  const excludedCount = points.length - active.length;

  if (active.length === 0) {
    return {
      count: 0,
      excludedCount,
      meanSec: null,
      rmsSec: null,
      weightedRmsSec: null,
      medianSec: null,
      madSec: null,
      minSec: null,
      maxSec: null,
      maxAbsSec: null,
      warningCount: 0,
      criticalCount: 0,
      regression: null,
    };
  }

  let sum = 0;
  let sumSq = 0;
  let wSum = 0;
  let wSumSq = 0;
  let minSec = Infinity;
  let maxSec = -Infinity;
  let maxAbsSec = 0;
  let warningCount = 0;
  let criticalCount = 0;

  for (const pt of active) {
    const r = pt.residualSec;
    sum += r;
    sumSq += r * r;
    wSum += pt.weight;
    wSumSq += pt.weight * r * r;
    if (r < minSec) minSec = r;
    if (r > maxSec) maxSec = r;
    if (Math.abs(r) > maxAbsSec) maxAbsSec = Math.abs(r);
    if (pt.status === 'Warning') warningCount += 1;
    if (pt.status === 'Critical') criticalCount += 1;
  }

  const n = active.length;
  const meanSec = sum / n;
  const rmsSec = Math.sqrt(sumSq / n);
  const weightedRmsSec = wSum > 0 ? Math.sqrt(wSumSq / wSum) : rmsSec;

  const sorted = active.map((p) => p.residualSec).sort((a, b) => a - b);
  const medianSec = computeMedian(sorted);
  const absDevs =
    medianSec !== null
      ? active.map((p) => Math.abs(p.residualSec - medianSec)).sort((a, b) => a - b)
      : [];
  const madSec = computeMedian(absDevs);
  const regression = computeLinearRegression(active);

  return {
    count: n,
    excludedCount,
    meanSec,
    rmsSec,
    weightedRmsSec,
    medianSec,
    madSec,
    minSec,
    maxSec,
    maxAbsSec,
    warningCount,
    criticalCount,
    regression,
  };
}

function buildDiagnosticNote(
  unlocated: boolean,
  pStats: PhaseSummaryMetrics,
  sStats: PhaseSummaryMetrics
): string {
  if (unlocated) {
    return 'Event hypocenter is currently unlocated; run PLOT or Locate to resolve epicentral distances and phase travel-time residuals.';
  }
  if (pStats.count === 0 && sStats.count === 0) {
    return 'No active phase arrivals match the current filter selection.';
  }

  const parts: string[] = [];
  if (pStats.count >= 3 && pStats.regression) {
    const slope = pStats.regression.slopePer100Km;
    const mean = pStats.meanSec ?? 0;
    if (Math.abs(slope) >= 0.25) {
      parts.push(
        `P residuals show a ${slope > 0 ? 'positive' : 'negative'} distance gradient (${slope >= 0 ? '+' : ''}${slope.toFixed(2)} s/100 km, R²=${pStats.regression.rSquared.toFixed(2)}), suggesting the reference velocity model may be slightly ${slope > 0 ? 'fast' : 'slow'} at regional range.`
      );
    } else {
      parts.push(
        `P residuals remain stable across distance (${slope >= 0 ? '+' : ''}${slope.toFixed(2)} s/100 km, mean ${mean >= 0 ? '+' : ''}${mean.toFixed(2)} s).`
      );
    }
  } else if (pStats.count > 0) {
    parts.push(
      `${pStats.count} active P pick${pStats.count === 1 ? '' : 's'} (RMS ${(pStats.rmsSec ?? 0).toFixed(2)} s); at least 3 picks are needed for a distance-gradient fit.`
    );
  }

  if (sStats.count >= 3 && sStats.regression) {
    const slope = sStats.regression.slopePer100Km;
    const mean = sStats.meanSec ?? 0;
    parts.push(
      `S residuals trend at ${slope >= 0 ? '+' : ''}${slope.toFixed(2)} s/100 km (mean ${mean >= 0 ? '+' : ''}${mean.toFixed(2)} s, RMS ${(sStats.rmsSec ?? 0).toFixed(2)} s).`
    );
  } else if (sStats.count > 0) {
    parts.push(
      `${sStats.count} active S pick${sStats.count === 1 ? '' : 's'} (mean ${(sStats.meanSec ?? 0) >= 0 ? '+' : ''}${(sStats.meanSec ?? 0).toFixed(2)} s, RMS ${(sStats.rmsSec ?? 0).toFixed(2)} s).`
    );
  }

  return parts.join(' ');
}

export function analyzePhaseResiduals(
  event: EQPEvent,
  options: PhaseResidualFilterOptions = {}
): PhaseResidualAnalysis {
  const showP = options.showP ?? true;
  const showS = options.showS ?? true;
  const includeExcluded = options.includeExcluded ?? true;
  const allowedQualities = options.qualities
    ? new Set<PickQuality>(options.qualities)
    : new Set<PickQuality>(['A', 'B', 'C', 'D']);
  const outlierThresholdSec = Math.max(0.1, options.outlierThresholdSec ?? 0.5);
  const criticalThresholdSec = Math.max(1.0, outlierThresholdSec * 2);
  const unlocated = isEventUnlocated(event);

  const allPoints: PhaseResidualPoint[] = [];
  const stationPairs: StationResidualPair[] = [];

  for (const pick of event.picks) {
    const quality: PickQuality = pick.quality || 'B';
    const weight = PICK_QUALITY_WEIGHTS[quality]?.weight ?? 0.75;
    const hasCoords = !unlocated && isValidCoord(pick.lat, pick.lon);

    let distKm = 0;
    let distDeg = 0;
    if (hasCoords) {
      distKm = computeDistanceAndBearing(event.lat, event.lon, pick.lat, pick.lon).distKm;
      distDeg =
        Number.isFinite(pick.delta) && pick.delta > 0 ? pick.delta : distKm / KM_PER_DEG;
    } else if (Number.isFinite(pick.delta) && pick.delta > 0) {
      distDeg = pick.delta;
      distKm = pick.delta * KM_PER_DEG;
    }

    const hasP = pick.pTime.trim() !== '' && Number.isFinite(pick.resP);
    const hasS = pick.sTime.trim() !== '' && Number.isFinite(pick.resS);

    let pPoint: PhaseResidualPoint | null = null;
    let sPoint: PhaseResidualPoint | null = null;

    if (hasP) {
      const status = classifyResidualStatus(pick.resP, pick.pExcluded, outlierThresholdSec);
      pPoint = {
        key: `${pick.id}-P`,
        pickId: pick.id,
        sta: pick.sta,
        phase: 'P',
        distKm,
        distDeg,
        residualSec: pick.resP,
        absResidualSec: Math.abs(pick.resP),
        obsSec: pick.obsP,
        calcSec: pick.calcP,
        arrivalTimeStr: pick.pTime,
        excluded: pick.pExcluded,
        quality,
        weight,
        azim: pick.azim,
        toa: pick.toa,
        polarity: pick.polarity,
        status,
      };
      allPoints.push(pPoint);
    }

    if (hasS) {
      const status = classifyResidualStatus(pick.resS, pick.sExcluded, outlierThresholdSec);
      sPoint = {
        key: `${pick.id}-S`,
        pickId: pick.id,
        sta: pick.sta,
        phase: 'S',
        distKm,
        distDeg,
        residualSec: pick.resS,
        absResidualSec: Math.abs(pick.resS),
        obsSec: pick.obsS,
        calcSec: pick.calcS,
        arrivalTimeStr: pick.sTime,
        excluded: pick.sExcluded,
        quality,
        weight,
        azim: pick.azim,
        toa: pick.toa,
        polarity: pick.polarity,
        status,
      };
      allPoints.push(sPoint);
    }

    if (hasP || hasS) {
      const qualityMatch = allowedQualities.has(quality);
      const visibleP = Boolean(pPoint && showP && qualityMatch && (includeExcluded || !pPoint.excluded));
      const visibleS = Boolean(sPoint && showS && qualityMatch && (includeExcluded || !sPoint.excluded));

      if (visibleP || visibleS) {
        const statuses: ResidualStatus[] = [];
        if (visibleP && pPoint) statuses.push(pPoint.status);
        if (visibleS && sPoint) statuses.push(sPoint.status);
        statuses.sort((a, b) => statusSeverityRank(b) - statusSeverityRank(a));

        stationPairs.push({
          pickId: pick.id,
          sta: pick.sta,
          distKm,
          distDeg,
          azim: pick.azim,
          toa: pick.toa,
          quality,
          hasP: visibleP,
          hasS: visibleS,
          pExcluded: pick.pExcluded,
          sExcluded: pick.sExcluded,
          resP: visibleP && pPoint ? pPoint.residualSec : null,
          resS: visibleS && sPoint ? sPoint.residualSec : null,
          sMinusPResSec:
            visibleP && visibleS && pPoint && sPoint
              ? sPoint.residualSec - pPoint.residualSec
              : null,
          obsP: visibleP ? pick.obsP : null,
          obsS: visibleS ? pick.obsS : null,
          calcP: visibleP ? pick.calcP : null,
          calcS: visibleS ? pick.calcS : null,
          worstStatus: statuses[0] ?? 'Nominal',
        });
      }
    }
  }

  const visiblePoints = allPoints.filter((pt) => {
    if (pt.phase === 'P' && !showP) return false;
    if (pt.phase === 'S' && !showS) return false;
    if (!includeExcluded && pt.excluded) return false;
    if (!allowedQualities.has(pt.quality)) return false;
    return true;
  });

  const pPoints = visiblePoints.filter((pt) => pt.phase === 'P');
  const sPoints = visiblePoints.filter((pt) => pt.phase === 'S');

  const pStats = computePhaseSummaryMetrics(pPoints);
  const sStats = computePhaseSummaryMetrics(sPoints);
  const combinedStats = computePhaseSummaryMetrics(visiblePoints);

  const distsKm = visiblePoints.map((p) => p.distKm);
  const distsDeg = visiblePoints.map((p) => p.distDeg);

  return {
    eventId: event.id,
    unlocated,
    outlierThresholdSec,
    criticalThresholdSec,
    allPoints,
    visiblePoints,
    stationPairs,
    pStats,
    sStats,
    combinedStats,
    minDistKm: distsKm.length ? Math.min(...distsKm) : 0,
    maxDistKm: distsKm.length ? Math.max(...distsKm) : 0,
    minDistDeg: distsDeg.length ? Math.min(...distsDeg) : 0,
    maxDistDeg: distsDeg.length ? Math.max(...distsDeg) : 0,
    diagnosticNote: buildDiagnosticNote(unlocated, pStats, sStats),
  };
}

export function buildPhaseResidualCsv(
  event: EQPEvent,
  analysis: PhaseResidualAnalysis
): string {
  const header = [
    'EventID',
    'Station',
    'Phase',
    'EpicentralDistance_km',
    'EpicentralDistance_deg',
    'Azimuth_deg',
    'TOA_deg',
    'Quality',
    'Weight',
    'Excluded',
    'ArrivalPick',
    'Observed_s',
    'Calculated_s',
    'Residual_s',
    'Status',
  ].join(',');

  const rows = analysis.visiblePoints
    .slice()
    .sort((a, b) => a.distKm - b.distKm || a.sta.localeCompare(b.sta) || a.phase.localeCompare(b.phase))
    .map((pt) =>
      [
        event.id,
        pt.sta,
        pt.phase,
        pt.distKm.toFixed(2),
        pt.distDeg.toFixed(3),
        pt.azim.toFixed(1),
        pt.toa.toFixed(1),
        pt.quality,
        pt.weight.toFixed(2),
        pt.excluded ? 'YES' : 'NO',
        pt.arrivalTimeStr,
        pt.obsSec.toFixed(2),
        pt.calcSec.toFixed(2),
        pt.residualSec.toFixed(3),
        pt.status,
      ].join(',')
    );

  return [header, ...rows].join('\n');
}

export function buildPhaseResidualSummaryText(
  event: EQPEvent,
  analysis: PhaseResidualAnalysis
): string {
  const fmtOpt = (val: number | null, digits = 3, signed = false): string => {
    if (val === null || !Number.isFinite(val)) return 'N/A';
    const prefix = signed && val >= 0 ? '+' : '';
    return `${prefix}${val.toFixed(digits)} s`;
  };

  const lines = [
    `P & S Phase Residuals vs. Epicentral Distance — Event ${event.id}`,
    `Origin (UTC): ${event.originDateGmt} ${event.originTimeGmt} | Lat ${event.lat.toFixed(3)}°, Lon ${event.lon.toFixed(3)}°, Depth ${event.depthKm.toFixed(1)} km`,
    `Distance Span: ${analysis.minDistKm.toFixed(1)}–${analysis.maxDistKm.toFixed(1)} km (${analysis.minDistDeg.toFixed(2)}°–${analysis.maxDistDeg.toFixed(2)}°)`,
    `P-Phase (${analysis.pStats.count} active, ${analysis.pStats.excludedCount} excluded): RMS=${fmtOpt(analysis.pStats.rmsSec)}, Weighted RMS=${fmtOpt(analysis.pStats.weightedRmsSec)}, Mean=${fmtOpt(analysis.pStats.meanSec, 3, true)}, Slope=${analysis.pStats.regression ? `${analysis.pStats.regression.slopePer100Km >= 0 ? '+' : ''}${analysis.pStats.regression.slopePer100Km.toFixed(3)} s/100 km` : 'N/A'}`,
    `S-Phase (${analysis.sStats.count} active, ${analysis.sStats.excludedCount} excluded): RMS=${fmtOpt(analysis.sStats.rmsSec)}, Weighted RMS=${fmtOpt(analysis.sStats.weightedRmsSec)}, Mean=${fmtOpt(analysis.sStats.meanSec, 3, true)}, Slope=${analysis.sStats.regression ? `${analysis.sStats.regression.slopePer100Km >= 0 ? '+' : ''}${analysis.sStats.regression.slopePer100Km.toFixed(3)} s/100 km` : 'N/A'}`,
    `Diagnostic: ${analysis.diagnosticNote}`,
  ];
  return lines.join('\n');
}
