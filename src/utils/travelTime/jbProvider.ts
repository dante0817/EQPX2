import { JBTAB_PS_RAW } from '../../data/jbtabRaw';
import {
  getDefaultJbTables,
  JbTravelTimeTables,
  tryLookupJbTravelTime,
} from '../jbtab';
import type {
  TravelTimeModelMetadata,
  TravelTimePhase,
  TravelTimePrediction,
  TravelTimePredictionRequest,
  TravelTimeProvider,
} from './types';

/** Verified SHA-256 checksum of /public/assets/aistudio/JBTAB_b5700af2.txt and JBTAB_PS_RAW. */
export const JBTAB_PS_SHA256 =
  'b5700af2dc29e5bf5421a99bb850417263040e2009015871ee027c09b9efac95';

export function createJbTravelTimeProvider(
  tables: JbTravelTimeTables = getDefaultJbTables()
): TravelTimeProvider {
  const pRows = tables.P.rows;
  const sRows = tables.S.rows;
  const pMaxDelta =
    tables.P.deltaStartDeg + (tables.P.numDistances - 1) * tables.P.deltaStepDeg;
  const sMaxDelta =
    tables.S.deltaStartDeg + (tables.S.numDistances - 1) * tables.S.deltaStepDeg;

  const isDefaultDataset = tables === getDefaultJbTables();

  const metadata: TravelTimeModelMetadata = {
    id: 'jb-jbtab',
    name: 'Jeffreys–Bullen (JBTAB.PS)',
    shortLabel: 'J-B (JBTAB.PS)',
    version: 'JBTAB.PS-11.20a',
    source: 'Embedded legacy JBTAB.PS (public/assets/aistudio/JBTAB_b5700af2.txt)',
    checksum: isDefaultDataset ? JBTAB_PS_SHA256 : null,
    supportedPhases: ['P', 'S'],
    phaseBounds: {
      P: {
        minDepthKm: pRows[0]?.depthKm ?? 0,
        maxDepthKm: pRows[pRows.length - 1]?.depthKm ?? 793,
        minDeltaDeg: tables.P.deltaStartDeg,
        maxDeltaDeg: pMaxDelta,
      },
      S: {
        minDepthKm: sRows[0]?.depthKm ?? 0,
        maxDepthKm: sRows[sRows.length - 1]?.depthKm ?? 793.6,
        minDeltaDeg: tables.S.deltaStartDeg,
        maxDeltaDeg: sMaxDelta,
      },
    },
    phaseSelectionPolicy:
      'Direct tabulated P and S first-arrival curves over separate depth/distance grids (P: 15x103, S: 14x108 with 25 trailing shadow-zone sentinels rejected).',
    defaultCorrectionProfile: 'legacy-eqp-s173',
    supportedCorrectionProfiles: ['legacy-eqp-s173', 'none'],
    validationStatus: 'operational-legacy',
    available: true,
    notes: [
      `Raw JBTAB.PS length: ${JBTAB_PS_RAW.length} chars; values preserved unmodified.`,
      'P and S use independent non-uniform depth grids; no extrapolation or shadow-zone interpolation is performed.',
      'P(45 deg, 603 km) = 446.60 s and S(0 deg, 0 km) = 10.70 s preserved from original dataset.',
    ],
  };

  const predict = (
    phase: TravelTimePhase,
    deltaDeg: number,
    depthKm: number
  ): TravelTimePrediction => {
    const res = tryLookupJbTravelTime(phase, deltaDeg, depthKm, tables);
    if (!res.ok) {
      return {
        valid: false,
        status: res.status,
        modelId: metadata.id,
        modelVersion: metadata.version,
        phase: res.phase,
        requestedPhase: phase,
        branchLabel: null,
        timeSec: null,
        dTdDeltaDeg: null,
        dTdDepthKm: null,
        toaDeg: null,
        derivativeDepthValid: false,
        failureReason: res.reason,
      };
    }

    return {
      valid: true,
      status: 'ok',
      modelId: metadata.id,
      modelVersion: metadata.version,
      phase: res.phase,
      requestedPhase: phase,
      branchLabel: res.branchLabel,
      timeSec: res.timeSec,
      dTdDeltaDeg: res.dTdDeltaDeg,
      dTdDepthKm: res.dTdDepthKm,
      toaDeg: res.toaDeg,
      derivativeDepthValid: res.derivativeDepthValid,
    };
  };

  const predictBatch = (
    requests: TravelTimePredictionRequest[]
  ): TravelTimePrediction[] =>
    requests.map((req) => predict(req.phase, req.deltaDeg, req.depthKm));

  return {
    metadata,
    predict,
    predictBatch,
  };
}
