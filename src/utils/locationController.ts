import {
  type EQPEvent,
  type EventLocationMetadata,
  isEventUnlocated,
  type SolverEngine,
  type StationMeta,
  type StationPick,
} from '../data/eqpData';
import {
  HypocenterSolveResult,
  parseMmSsRelativeToOrigin,
  solveHypocenterWithProvider,
} from './hypocenterSolver';
import { computeDistanceAndBearing } from './nearestPlaces';
import { computeAzimuthalGap } from './spatialQa';
import {
  getTravelTimeModelMetadata,
  resolveTravelTimeProvider,
} from './travelTime/registry';
import type {
  CorrectionProfileId,
  ModelValidationStatus,
  TravelTimeModelId,
  TravelTimePhase,
  TravelTimeProvider,
} from './travelTime/types';

const KM_PER_DEG = 111.195;

export type CandidateSolutionStatus = 'calculated' | 'adopted' | 'discarded' | 'failed';

export interface CandidateLocationSolution {
  id: string;
  eventId: string;
  eventRevision: number;
  inputChecksum: string;
  stationCatalogId: string;
  solverEngine: SolverEngine;
  status: CandidateSolutionStatus;
  validationStatus: ModelValidationStatus;
  calculatedAt: string;
  adoptedAt?: string;
  stale: boolean;
  result: HypocenterSolveResult;
}

export interface CalculateCandidateInput {
  event: EQPEvent;
  stations: StationMeta[];
  solverEngine: SolverEngine;
  modelId: TravelTimeModelId;
  correctionProfile?: CorrectionProfileId;
  eventRevision?: number;
  stationCatalogId?: string;
  stationMetadataOverrides?: Record<
    string,
    Pick<StationMeta, 'lat' | 'lon' | 'delaySec' | 'elevationM'>
  >;
}

/**
 * Pure deterministic dual-hash digest (works identically in browser & Node without native crypto).
 * Captures picks, exclusion flags, quality, origin anchor, trial depth, and referenced station coords/delays.
 */
export function computeObservationSnapshotChecksum(
  event: EQPEvent,
  stations: StationMeta[],
  stationMetadataOverrides?: Record<
    string,
    Pick<StationMeta, 'lat' | 'lon' | 'delaySec' | 'elevationM'>
  >
): string {
  const staMap = new Map<string, Pick<StationMeta, 'lat' | 'lon' | 'delaySec' | 'elevationM'>>();
  for (const s of stations) {
    const code = s.code.trim().toUpperCase();
    if (code) staMap.set(code, s);
  }
  if (stationMetadataOverrides) {
    for (const [k, v] of Object.entries(stationMetadataOverrides)) {
      const code = k.trim().toUpperCase();
      if (code) staMap.set(code, v);
    }
  }

  const pickPayload = event.picks.map((p) => {
    const code = p.sta.trim().toUpperCase();
    const meta = staMap.get(code);
    return {
      sta: code,
      pTime: p.pTime.trim(),
      pExcluded: Boolean(p.pExcluded),
      sTime: p.sTime.trim(),
      sExcluded: Boolean(p.sExcluded),
      quality: p.quality,
      mLat: meta ? Number(meta.lat.toFixed(5)) : null,
      mLon: meta ? Number(meta.lon.toFixed(5)) : null,
      mDelay: meta ? Number(meta.delaySec.toFixed(3)) : null,
    };
  });

  const payload = JSON.stringify({
    date: event.originDateGmt,
    time: event.originTimeGmt,
    trialDepthKm: Number.isFinite(event.trialDepthKm) ? event.trialDepthKm : null,
    picks: pickPayload,
  });

  // Two independent 32-bit FNV-1a lanes combined into 16 hex chars
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ payload.length;
  for (let i = 0; i < payload.length; i++) {
    const ch = payload.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= ch + ((i & 0xff) << 1);
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

export function calculateCandidateLocation(
  input: CalculateCandidateInput
): CandidateLocationSolution {
  const {
    event,
    stations,
    solverEngine,
    modelId,
    correctionProfile,
    eventRevision = 0,
    stationCatalogId = 'philsta-active',
    stationMetadataOverrides,
  } = input;

  const calculatedAt = new Date().toISOString();
  const inputChecksum = computeObservationSnapshotChecksum(
    event,
    stations,
    stationMetadataOverrides
  );
  const providerLookup = resolveTravelTimeProvider(modelId);

  if (!providerLookup.ok) {
    const unavailableProvider: TravelTimeProvider = {
      metadata: getTravelTimeModelMetadata(modelId),
      predict: (phase, deltaDeg, depthKm) => ({
        valid: false,
        status: 'model_unavailable',
        modelId,
        modelVersion: 'unavailable',
        phase,
        requestedPhase: phase,
        branchLabel: null,
        timeSec: null,
        dTdDeltaDeg: null,
        dTdDepthKm: null,
        toaDeg: null,
        derivativeDepthValid: false,
        failureReason: providerLookup.reason,
      }),
      predictBatch: (reqs) =>
        reqs.map((r) => unavailableProvider.predict(r.phase, r.deltaDeg, r.depthKm)),
    };

    const failedResult = solveHypocenterWithProvider({
      event,
      stations,
      solverEngine,
      travelTimeProvider: unavailableProvider,
      correctionProfile: correctionProfile ?? unavailableProvider.metadata.defaultCorrectionProfile,
      stationMetadataOverrides,
    });

    return {
      id: `cand_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      eventId: event.id,
      eventRevision,
      inputChecksum,
      stationCatalogId,
      solverEngine,
      status: 'failed',
      validationStatus: unavailableProvider.metadata.validationStatus,
      calculatedAt,
      stale: false,
      result: failedResult,
    };
  }

  const provider = providerLookup.provider;
  const effectiveCorrection = correctionProfile ?? provider.metadata.defaultCorrectionProfile;
  const result = solveHypocenterWithProvider({
    event,
    stations,
    solverEngine,
    travelTimeProvider: provider,
    correctionProfile: effectiveCorrection,
    stationMetadataOverrides,
  });

  return {
    id: `cand_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    eventId: event.id,
    eventRevision,
    inputChecksum,
    stationCatalogId,
    solverEngine,
    status: result.converged ? 'calculated' : 'failed',
    validationStatus: provider.metadata.validationStatus,
    calculatedAt,
    stale: false,
    result,
  };
}

export function isCandidateSolutionStale(
  candidate: CandidateLocationSolution | null,
  currentEvent: EQPEvent,
  stations: StationMeta[],
  currentRevision?: number,
  stationMetadataOverrides?: Record<
    string,
    Pick<StationMeta, 'lat' | 'lon' | 'delaySec' | 'elevationM'>
  >
): boolean {
  if (!candidate) return false;
  if (candidate.eventId !== currentEvent.id) return true;
  if (candidate.status === 'adopted' || candidate.status === 'discarded') return false;
  if (currentRevision !== undefined && candidate.eventRevision !== currentRevision) {
    return true;
  }
  const currentChecksum = computeObservationSnapshotChecksum(
    currentEvent,
    stations,
    stationMetadataOverrides
  );
  return currentChecksum !== candidate.inputChecksum;
}

export function applyCandidateSolutionToEvent(
  event: EQPEvent,
  candidate: CandidateLocationSolution,
  adoptedAtIso: string = new Date().toISOString()
): EQPEvent {
  if (!candidate.result.converged || candidate.status === 'failed') {
    throw new Error('Cannot adopt a failed or unconverged candidate location solution.');
  }
  const r = candidate.result;
  const locationMetadata: EventLocationMetadata = {
    modelId: r.modelId,
    modelName: r.modelName,
    modelVersion: r.modelVersion,
    modelChecksum: r.modelChecksum,
    correctionProfile: r.correctionProfile,
    solver: candidate.solverEngine,
    solverVersion: r.solverVersion,
    validationStatus: candidate.validationStatus,
    weightedRmsSec: r.weightedRmsSec,
    rmsSec: r.rmsSec,
    depthFixed: r.depthFixed,
    depthFixReason: r.depthFixReason,
    conditionNumber: r.conditionNumber,
    azimuthalGapDeg: r.azimuthalGapDeg,
    errDepthKm: r.errDepthKm,
    uncertaintyReliable: r.uncertaintyReliable,
    inputChecksum: candidate.inputChecksum,
    stationCatalogId: candidate.stationCatalogId,
    adoptedAt: adoptedAtIso,
  };

  const timeTag = r.originTimeGmt.slice(0, 8);
  const newHistoryEntry = {
    relocation: `Reloc #${event.magnitudeHistory.length + 1}`,
    timestamp: `${timeTag} UTC`,
    solver: candidate.solverEngine,
    rmsSec: r.rmsSec,
    weightedRmsSec: r.weightedRmsSec,
    activePhases: r.activePhaseCount,
    ms: event.ms,
    mb: event.mb,
    md: event.md,
    modelId: r.modelId,
    modelVersion: r.modelVersion,
    correctionProfile: r.correctionProfile,
  };

  return {
    ...event,
    originDateGmt: r.originDateGmt,
    originTimeGmt: r.originTimeGmt,
    originDateLst: r.originDateLst,
    originTimeLst: r.originTimeLst,
    lat: r.lat,
    lon: r.lon,
    depthKm: r.depthKm,
    errLatDeg: r.errLatDeg,
    errLonDeg: r.errLonDeg,
    errKm: r.errKm,
    errSec: r.errSec,
    rmsSec: r.rmsSec,
    iterations: r.iterations,
    picks: r.picks.map((p) => ({ ...p })),
    locationMetadata,
    magnitudeHistory: [...event.magnitudeHistory, newHistoryEntry],
  };
}

// ---------- Mode A: Fixed-Hypocenter Forward Prediction Comparison ----------

export interface FixedHypocenterStationResidual {
  sta: string;
  phase: TravelTimePhase;
  deltaDeg: number;
  obsSec: number;
  predSec: number | null;
  delaySec: number;
  residualSec: number | null;
  branchLabel: string | null;
  status: string;
}

export interface FixedHypocenterModelComparisonRow {
  modelId: TravelTimeModelId;
  modelName: string;
  modelVersion: string;
  validationStatus: ModelValidationStatus;
  available: boolean;
  reason?: string;
  correctionProfile: CorrectionProfileId;
  validObservationCount: number;
  totalCommonCount: number;
  rmsSec: number | null;
  meanAbsResSec: number | null;
  maxAbsResSec: number | null;
  stationResiduals: FixedHypocenterStationResidual[];
}

export interface FixedHypocenterComparisonReport {
  mode: 'fixed-hypocenter';
  hypocenter: {
    lat: number;
    lon: number;
    depthKm: number;
    originTimeGmt: string;
  };
  commonObservationCount: number;
  skippedObservations: string[];
  rows: FixedHypocenterModelComparisonRow[];
}

export function predictFixedHypocenterComparison(params: {
  event: EQPEvent;
  stations: StationMeta[];
  modelIds: TravelTimeModelId[];
  correctionProfile?: CorrectionProfileId;
  stationMetadataOverrides?: Record<
    string,
    Pick<StationMeta, 'lat' | 'lon' | 'delaySec' | 'elevationM'>
  >;
}): FixedHypocenterComparisonReport {
  const { event, stations, modelIds, correctionProfile, stationMetadataOverrides } = params;
  const staMap = new Map<string, Pick<StationMeta, 'lat' | 'lon' | 'delaySec' | 'elevationM'>>();
  for (const s of stations) {
    const code = s.code.trim().toUpperCase();
    if (code) staMap.set(code, s);
  }
  if (stationMetadataOverrides) {
    for (const [k, v] of Object.entries(stationMetadataOverrides)) {
      const code = k.trim().toUpperCase();
      if (code) staMap.set(code, v);
    }
  }

  const skippedObservations: string[] = [];
  const activeObs: Array<{
    sta: string;
    phase: TravelTimePhase;
    deltaDeg: number;
    obsSec: number;
    baseDelaySec: number;
  }> = [];

  for (const p of event.picks) {
    const code = p.sta.trim().toUpperCase();
    const meta = staMap.get(code);
    if (!meta || !Number.isFinite(meta.lat) || !Number.isFinite(meta.lon)) {
      skippedObservations.push(`${code || 'BLANK'}: unknown station metadata`);
      continue;
    }
    const { distKm } = computeDistanceAndBearing(event.lat, event.lon, meta.lat, meta.lon);
    const deltaDeg = distKm / KM_PER_DEG;

    if (p.pTime.trim() && !p.pExcluded) {
      const obsP =
        p.obsP > 0
          ? p.obsP
          : parseMmSsRelativeToOrigin(p.pTime, event.originTimeGmt || '00:00:00.00');
      if (obsP !== null && Number.isFinite(obsP)) {
        activeObs.push({
          sta: code,
          phase: 'P',
          deltaDeg,
          obsSec: obsP,
          baseDelaySec: Number.isFinite(meta.delaySec) ? meta.delaySec : 0,
        });
      }
    }
    if (p.sTime.trim() && !p.sExcluded) {
      const obsS =
        p.obsS > 0
          ? p.obsS
          : parseMmSsRelativeToOrigin(p.sTime, event.originTimeGmt || '00:00:00.00');
      if (obsS !== null && Number.isFinite(obsS)) {
        activeObs.push({
          sta: code,
          phase: 'S',
          deltaDeg,
          obsSec: obsS,
          baseDelaySec: Number.isFinite(meta.delaySec) ? meta.delaySec : 0,
        });
      }
    }
  }

  const rows: FixedHypocenterModelComparisonRow[] = modelIds.map((modelId) => {
    const lookup = resolveTravelTimeProvider(modelId);
    const meta = getTravelTimeModelMetadata(modelId);
    if (!lookup.ok) {
      return {
        modelId,
        modelName: meta.name,
        modelVersion: meta.version,
        validationStatus: meta.validationStatus,
        available: false,
        reason: lookup.reason,
        correctionProfile: correctionProfile ?? meta.defaultCorrectionProfile,
        validObservationCount: 0,
        totalCommonCount: activeObs.length,
        rmsSec: null,
        meanAbsResSec: null,
        maxAbsResSec: null,
        stationResiduals: [],
      };
    }

    const provider = lookup.provider;
    const effCorr = correctionProfile ?? provider.metadata.defaultCorrectionProfile;
    const stationResiduals: FixedHypocenterStationResidual[] = [];
    const residuals: number[] = [];

    for (const obs of activeObs) {
      const pred = provider.predict(obs.phase, obs.deltaDeg, event.depthKm);
      const delay =
        effCorr === 'none'
          ? 0
          : obs.phase === 'S'
            ? obs.baseDelaySec * 1.73
            : obs.baseDelaySec;

      if (!pred.valid || pred.timeSec === null) {
        stationResiduals.push({
          sta: obs.sta,
          phase: obs.phase,
          deltaDeg: Number(obs.deltaDeg.toFixed(2)),
          obsSec: Number(obs.obsSec.toFixed(2)),
          predSec: null,
          delaySec: Number(delay.toFixed(2)),
          residualSec: null,
          branchLabel: null,
          status: pred.failureReason ?? pred.status,
        });
        continue;
      }

      const predTotal = pred.timeSec + delay;
      const res = obs.obsSec - predTotal;
      residuals.push(res);
      stationResiduals.push({
        sta: obs.sta,
        phase: obs.phase,
        deltaDeg: Number(obs.deltaDeg.toFixed(2)),
        obsSec: Number(obs.obsSec.toFixed(2)),
        predSec: Number(predTotal.toFixed(2)),
        delaySec: Number(delay.toFixed(2)),
        residualSec: Number(res.toFixed(2)),
        branchLabel: pred.branchLabel,
        status: 'ok',
      });
    }

    const validCount = residuals.length;
    const rmsSec =
      validCount > 0
        ? Number(Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / validCount).toFixed(3))
        : null;
    const meanAbsResSec =
      validCount > 0
        ? Number((residuals.reduce((s, r) => s + Math.abs(r), 0) / validCount).toFixed(3))
        : null;
    const maxAbsResSec =
      validCount > 0
        ? Number(Math.max(...residuals.map((r) => Math.abs(r))).toFixed(3))
        : null;

    return {
      modelId,
      modelName: provider.metadata.name,
      modelVersion: provider.metadata.version,
      validationStatus: provider.metadata.validationStatus,
      available: true,
      correctionProfile: effCorr,
      validObservationCount: validCount,
      totalCommonCount: activeObs.length,
      rmsSec,
      meanAbsResSec,
      maxAbsResSec,
      stationResiduals,
    };
  });

  return {
    mode: 'fixed-hypocenter',
    hypocenter: {
      lat: event.lat,
      lon: event.lon,
      depthKm: event.depthKm,
      originTimeGmt: event.originTimeGmt,
    },
    commonObservationCount: activeObs.length,
    skippedObservations,
    rows,
  };
}

// ---------- Mode B: Independent Multi-Model Relocation Comparison ----------

export interface RelocatedModelComparisonRow {
  modelId: TravelTimeModelId;
  modelName: string;
  modelVersion: string;
  validationStatus: ModelValidationStatus;
  available: boolean;
  reason?: string;
  candidate: CandidateLocationSolution | null;
  commonPickCount: number;
  modelNativePickCount: number;
  usedCommonSubsetOnly: boolean;
  deltaEpicenterKmVsAnchor: number | null;
  deltaDepthKmVsAnchor: number | null;
}

export interface MultiModelRelocationComparisonReport {
  mode: 'independent-relocation';
  anchorModelId: TravelTimeModelId;
  observationPolicy: 'common-intersection' | 'model-native';
  rows: RelocatedModelComparisonRow[];
}

export function runMultiModelRelocationComparison(params: {
  event: EQPEvent;
  stations: StationMeta[];
  solverEngine: SolverEngine;
  modelIds: TravelTimeModelId[];
  correctionProfile?: CorrectionProfileId;
  observationPolicy?: 'common-intersection' | 'model-native';
  stationMetadataOverrides?: Record<
    string,
    Pick<StationMeta, 'lat' | 'lon' | 'delaySec' | 'elevationM'>
  >;
}): MultiModelRelocationComparisonReport {
  const {
    event,
    stations,
    solverEngine,
    modelIds,
    correctionProfile,
    observationPolicy = 'common-intersection',
    stationMetadataOverrides,
  } = params;

  const anchorModelId = modelIds[0] ?? 'jb-jbtab';
  const rawCandidates = modelIds.map((modelId) =>
    calculateCandidateLocation({
      event,
      stations,
      solverEngine,
      modelId,
      correctionProfile,
      stationMetadataOverrides,
    })
  );

  // Determine converged anchor for Δ(lat, lon, depth) delta reporting
  const anchorCandidate =
    rawCandidates.find((c) => c.result.modelId === anchorModelId && c.result.converged) ??
    rawCandidates.find((c) => c.result.converged) ??
    null;

  const convergedCandidates = rawCandidates.filter((c) => c.result.converged);
  // Common active phase keys across all converged models
  let commonPhaseKeys: Set<string> | null = null;
  for (const cand of convergedCandidates) {
    const keys = new Set<string>();
    for (const p of cand.result.picks) {
      if (p.pTime.trim() && !p.pExcluded && p.calcP > 0) keys.add(`${p.sta}:P`);
      if (p.sTime.trim() && !p.sExcluded && p.calcS > 0) keys.add(`${p.sta}:S`);
    }
    if (commonPhaseKeys === null) {
      commonPhaseKeys = keys;
    } else {
      const prevKeys: Set<string> = commonPhaseKeys;
      commonPhaseKeys = new Set<string>(Array.from(prevKeys).filter((k) => keys.has(k)));
    }
  }
  const commonCount = commonPhaseKeys?.size ?? 0;

  const rows: RelocatedModelComparisonRow[] = rawCandidates.map((cand) => {
    const r = cand.result;
    const meta = getTravelTimeModelMetadata(r.modelId);

    if (!meta.available) {
      return {
        modelId: r.modelId,
        modelName: meta.name,
        modelVersion: meta.version,
        validationStatus: meta.validationStatus,
        available: false,
        reason: meta.unavailableReason ?? r.reason,
        candidate: cand,
        commonPickCount: commonCount,
        modelNativePickCount: 0,
        usedCommonSubsetOnly: observationPolicy === 'common-intersection',
        deltaEpicenterKmVsAnchor: null,
        deltaDepthKmVsAnchor: null,
      };
    }

    let finalCandidate = cand;
    // If comparing multiple available models strictly in common-intersection mode and subset differs, re-solve strictly on common intersection
    if (
      observationPolicy === 'common-intersection' &&
      convergedCandidates.length > 1 &&
      commonPhaseKeys &&
      r.converged &&
      r.activePhaseCount !== commonPhaseKeys.size
    ) {
      const maskedEvent: EQPEvent = {
        ...event,
        picks: event.picks.map((p) => {
          const sta = p.sta.trim().toUpperCase();
          return {
            ...p,
            pExcluded: p.pExcluded || !commonPhaseKeys!.has(`${sta}:P`),
            sExcluded: p.sExcluded || !commonPhaseKeys!.has(`${sta}:S`),
          };
        }),
      };
      finalCandidate = calculateCandidateLocation({
        event: maskedEvent,
        stations,
        solverEngine,
        modelId: r.modelId,
        correctionProfile,
        stationMetadataOverrides,
      });
    }

    let deltaEpicenterKmVsAnchor: number | null = null;
    let deltaDepthKmVsAnchor: number | null = null;
    if (
      anchorCandidate &&
      anchorCandidate.result.converged &&
      finalCandidate.result.converged
    ) {
      const { distKm } = computeDistanceAndBearing(
        anchorCandidate.result.lat,
        anchorCandidate.result.lon,
        finalCandidate.result.lat,
        finalCandidate.result.lon
      );
      deltaEpicenterKmVsAnchor = Number(distKm.toFixed(2));
      deltaDepthKmVsAnchor = Number(
        (finalCandidate.result.depthKm - anchorCandidate.result.depthKm).toFixed(1)
      );
    }

    return {
      modelId: finalCandidate.result.modelId,
      modelName: finalCandidate.result.modelName,
      modelVersion: finalCandidate.result.modelVersion,
      validationStatus: finalCandidate.validationStatus,
      available: true,
      reason: finalCandidate.result.converged ? undefined : finalCandidate.result.reason,
      candidate: finalCandidate,
      commonPickCount: commonCount,
      modelNativePickCount: r.activePhaseCount,
      usedCommonSubsetOnly: observationPolicy === 'common-intersection',
      deltaEpicenterKmVsAnchor,
      deltaDepthKmVsAnchor,
    };
  });

  return {
    mode: 'independent-relocation',
    anchorModelId,
    observationPolicy,
    rows,
  };
}

export type LocationQualityGrade = 'A' | 'B' | 'C' | 'D';

export interface LocationQualityIndex {
  score: number; // 0..100
  grade: LocationQualityGrade;
  label: 'Excellent' | 'Good' | 'Fair' | 'Poor';
  rmsSec: number;
  stationCount: number;
  azimuthalGapDeg: number | null;
  components: {
    rmsScore: number; // 0..40
    stationScore: number; // 0..30
    gapScore: number; // 0..30
  };
}

function interpolateClamped(
  value: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): number {
  if (x1 === x0) return y0;
  const t = Math.max(0, Math.min(1, (value - x0) / (x1 - x0)));
  return y0 + t * (y1 - y0);
}

/**
 * Computes a deterministic Location Quality Index (LQI, 0-100, Grade A-D)
 * from RMS travel-time residual (40 pts), active station count (30 pts),
 * and network azimuthal gap (30 pts).
 */
export function computeLocationQualityIndex(params: {
  rmsSec: number;
  stationCount: number;
  azimuthalGapDeg: number | null;
}): LocationQualityIndex {
  const rmsSec = Number.isFinite(params.rmsSec) && params.rmsSec >= 0 ? params.rmsSec : 99;
  const stationCount =
    Number.isFinite(params.stationCount) && params.stationCount >= 0
      ? Math.floor(params.stationCount)
      : 0;
  const azimuthalGapDeg =
    params.azimuthalGapDeg !== null && Number.isFinite(params.azimuthalGapDeg)
      ? Math.max(0, Math.min(360, params.azimuthalGapDeg))
      : null;

  // 1. RMS residual score (0..40)
  let rmsScore = 0;
  if (rmsSec <= 0.25) {
    rmsScore = 40;
  } else if (rmsSec <= 0.5) {
    rmsScore = interpolateClamped(rmsSec, 0.25, 40, 0.5, 33);
  } else if (rmsSec <= 1.0) {
    rmsScore = interpolateClamped(rmsSec, 0.5, 33, 1.0, 24);
  } else if (rmsSec <= 2.5) {
    rmsScore = interpolateClamped(rmsSec, 1.0, 24, 2.5, 10);
  } else if (rmsSec <= 5.0) {
    rmsScore = interpolateClamped(rmsSec, 2.5, 10, 5.0, 0);
  }

  // 2. Station count score (0..30)
  let stationScore = 0;
  if (stationCount >= 15) {
    stationScore = 30;
  } else if (stationCount >= 10) {
    stationScore = interpolateClamped(stationCount, 10, 25, 15, 30);
  } else if (stationCount >= 6) {
    stationScore = interpolateClamped(stationCount, 6, 18, 10, 25);
  } else if (stationCount >= 3) {
    stationScore = interpolateClamped(stationCount, 3, 10, 6, 18);
  }

  // 3. Azimuthal gap score (0..30)
  let gapScore = 0;
  if (azimuthalGapDeg !== null) {
    if (azimuthalGapDeg <= 90) {
      gapScore = 30;
    } else if (azimuthalGapDeg <= 135) {
      gapScore = interpolateClamped(azimuthalGapDeg, 90, 30, 135, 24);
    } else if (azimuthalGapDeg <= 180) {
      gapScore = interpolateClamped(azimuthalGapDeg, 135, 24, 180, 16);
    } else if (azimuthalGapDeg <= 240) {
      gapScore = interpolateClamped(azimuthalGapDeg, 180, 16, 240, 8);
    } else {
      gapScore = interpolateClamped(azimuthalGapDeg, 240, 8, 360, 0);
    }
  }

  let rawScore = Math.round(rmsScore + stationScore + gapScore);

  // Seismological integrity caps: insufficient stations or extreme gap/RMS cap maximum grade
  if (stationCount < 3) {
    rawScore = Math.min(rawScore, 25);
  } else if (rmsSec > 3.0 || (azimuthalGapDeg !== null && azimuthalGapDeg > 270)) {
    rawScore = Math.min(rawScore, 55);
  }

  const score = Math.max(0, Math.min(100, rawScore));
  let grade: LocationQualityGrade = 'D';
  let label: LocationQualityIndex['label'] = 'Poor';
  if (score >= 80) {
    grade = 'A';
    label = 'Excellent';
  } else if (score >= 60) {
    grade = 'B';
    label = 'Good';
  } else if (score >= 40) {
    grade = 'C';
    label = 'Fair';
  }

  return {
    score,
    grade,
    label,
    rmsSec: Number(rmsSec.toFixed(2)),
    stationCount,
    azimuthalGapDeg: azimuthalGapDeg !== null ? Math.round(azimuthalGapDeg) : null,
    components: {
      rmsScore: Number(rmsScore.toFixed(1)),
      stationScore: Number(stationScore.toFixed(1)),
      gapScore: Number(gapScore.toFixed(1)),
    },
  };
}

export function computeEventLocationQuality(event: EQPEvent): LocationQualityIndex | null {
  if (isEventUnlocated(event)) return null;
  const validActivePicks = event.picks.filter((p) => {
    const hasPhase =
      (!p.pExcluded && p.pTime.trim() !== '') || (!p.sExcluded && p.sTime.trim() !== '');
    const hasCoords =
      Number.isFinite(p.lat) && Number.isFinite(p.lon) && (p.lat !== 0 || p.lon !== 0);
    return hasPhase && hasCoords;
  });
  const uniqueStationCodes = new Set(
    validActivePicks
      .map((p) => p.sta.trim().toUpperCase())
      .filter((code) => code.length > 0)
  );
  const stationCount =
    uniqueStationCodes.size > 0 ? uniqueStationCodes.size : validActivePicks.length;
  const gapStats = computeAzimuthalGap(
    validActivePicks.map((p) => ({ ...p, pExcluded: false })),
    event.lat,
    event.lon
  );
  const azimuthalGapDeg =
    event.locationMetadata?.azimuthalGapDeg ??
    (validActivePicks.length > 0 ? gapStats.gapDeg : null);

  return computeLocationQualityIndex({
    rmsSec: event.rmsSec,
    stationCount,
    azimuthalGapDeg,
  });
}

export function formatLocationQualityTooltip(lqi: LocationQualityIndex | null): string {
  if (!lqi) {
    return 'Location Quality Index (LQI): 0–100 score combining RMS residual (0–40 pts), active stations (0–30 pts), and azimuthal gap (0–30 pts).';
  }
  const gapDisplay = lqi.azimuthalGapDeg !== null ? `${lqi.azimuthalGapDeg}°` : 'N/A';
  return `Location Quality Index (LQI): ${lqi.score}/100 (Grade ${lqi.grade} · ${lqi.label}) — RMS ${lqi.rmsSec.toFixed(2)}s (${lqi.components.rmsScore}/40 pts) + ${lqi.stationCount} active stations (${lqi.components.stationScore}/30 pts) + ${gapDisplay} azimuthal gap (${lqi.components.gapScore}/30 pts).`;
}

