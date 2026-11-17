import { type EQPEvent, isEventUnlocated } from '../data/eqpData.ts';
import {
  type NodalPlane,
  normalizeAngle360,
  normalizeRake,
  planeToVectors,
} from './focalMechanism.ts';
import { projectLatLonToLocalEnuMeters } from './geodeticStrain.ts';
import { computeOkada1992Dislocation } from './okada1992.ts';

export type CoulombStressUnit = 'kPa' | 'MPa';
export type CoulombResultStatus = 'Not Run' | 'Invalid Configuration' | 'Experimental' | 'Validated';
export type SourceOriginMode = 'center' | 'top-center';
export type ReceiverMode = 'uniform-orientation' | 'explicit-planes';

export interface FaultSegment {
  id: string;
  name: string;
  centerLat: number;
  centerLon: number;
  originMode: SourceOriginMode;
  topDepthKm: number;
  strikeDeg: number;
  dipDeg: number;
  rakeDeg: number;
  lengthKm: number;
  widthKm: number;
  slipM: number;
  tensileSlipM?: number;
}

export interface ElasticParameters {
  shearModulusGPa: number;
  poissonRatio: number;
}

export interface SourceFaultModel {
  id: string;
  name: string;
  referenceEventId: string;
  provenanceKind: 'Manual Model' | 'Imported' | 'Reference Benchmark (Hypothetical)';
  assumptionsNote: string;
  segments: FaultSegment[];
}

export interface ExplicitReceiverPlane {
  id: string;
  name: string;
  lat: number;
  lon: number;
  depthKm: number;
  strikeDeg: number;
  dipDeg: number;
  rakeDeg: number;
  muEffective: number;
}

export interface CoulombGridConfig {
  halfExtentKm: number;
  stepKm: number;
  targetDepthKm: number;
  crossSectionEnabled: boolean;
  profileAzimuthDeg: number;
  profileHalfLengthKm: number;
  profileMaxDepthKm: number;
  profileDepthStepKm: number;
}

export interface ReceiverFaultModel {
  mode: ReceiverMode;
  uniformOrientation: {
    strikeDeg: number;
    dipDeg: number;
    rakeDeg: number;
    muEffective: number;
  };
  explicitReceivers: ExplicitReceiverPlane[];
  gridConfig: CoulombGridConfig;
}

export interface SavedCoulombConfig {
  id: string;
  name: string;
  savedAtUtc: string;
  referenceEventId: string;
  sourceModel: SourceFaultModel;
  receiverModel: ReceiverFaultModel;
  elasticParams: ElasticParameters;
}

export interface StressTensorEnuPa {
  sEE: number;
  sNN: number;
  sUU: number;
  sEN: number;
  sEU: number;
  sNU: number;
}

export interface PointCoulombEvaluation {
  id: string;
  name: string;
  lat: number;
  lon: number;
  depthKm: number;
  strikeDeg: number;
  dipDeg: number;
  rakeDeg: number;
  muEffective: number;
  deltaShearKPa: number;
  deltaNormalKPa: number;
  deltaCfsKPa: number;
  stressRegimeClass: 'Positive (Stress Loaded)' | 'Neutral (~0)' | 'Negative (Stress Shadow)';
  nearFaultSingular: boolean;
  displacementMm: { e: number; n: number; u: number };
}

export interface CoulombGridCell {
  ix: number;
  iy: number;
  lat: number;
  lon: number;
  eastKm: number;
  northKm: number;
  deltaShearKPa: number;
  deltaNormalKPa: number;
  deltaCfsKPa: number;
  nearFaultSingular: boolean;
}

export interface CoulombCrossSectionCell {
  ia: number;
  iz: number;
  alongKm: number;
  depthKm: number;
  lat: number;
  lon: number;
  deltaShearKPa: number;
  deltaNormalKPa: number;
  deltaCfsKPa: number;
  nearFaultSingular: boolean;
}

export interface CoulombSensitivityPoint {
  paramLabel: string;
  value: number;
  deltaCfsKPa: number;
  deltaShearKPa: number;
  deltaNormalKPa: number;
}

export interface CoulombCalculationResult {
  status: CoulombResultStatus;
  solverIdentity: string;
  solverVersion: string;
  signConvention: string;
  computedAtUtc: string;
  warnings: string[];
  errors: string[];
  sourceMomentNm: number;
  equivalentMw: number | null;
  originLat: number;
  originLon: number;
  targetDepthKm: number;
  gridStepKm: number;
  gridHalfExtentKm: number;
  gridCols: number;
  gridRows: number;
  gridCells: CoulombGridCell[];
  maxPositiveCfsKPa: number;
  maxNegativeCfsKPa: number;
  nearFaultFlaggedCount: number;
  pointEvaluations: PointCoulombEvaluation[];
  crossSectionCells: CoulombCrossSectionCell[];
  depthSensitivity: CoulombSensitivityPoint[];
  frictionSensitivity: CoulombSensitivityPoint[];
  inputFingerprint: string;
  isReferenceBenchmarkRun?: boolean;
}

export const DEFAULT_ELASTIC_PARAMETERS: ElasticParameters = {
  shearModulusGPa: 32.0,
  poissonRatio: 0.25,
};

export const DEFAULT_RECEIVER_MODEL: ReceiverFaultModel = {
  mode: 'uniform-orientation',
  uniformOrientation: {
    strikeDeg: 0,
    dipDeg: 90,
    rakeDeg: 180,
    muEffective: 0.4,
  },
  explicitReceivers: [],
  gridConfig: {
    halfExtentKm: 60,
    stepKm: 4,
    targetDepthKm: 10,
    crossSectionEnabled: false,
    profileAzimuthDeg: 90,
    profileHalfLengthKm: 50,
    profileMaxDepthKm: 25,
    profileDepthStepKm: 2.5,
  },
};

export const COULOMB_SOLVER_IDENTITY = 'Okada (1992) DC3D Half-Space Dislocation Solver';
export const COULOMB_SOLVER_VERSION = '1.0.0-okada1992-mindlin-hybrid';
export const COULOMB_SIGN_CONVENTION =
  'Delta-CFS = Delta-tau + mu\' * Delta-sigma_n (Aki & Richards strike/dip/rake; positive Delta-sigma_n = unclamping / tensile; positive Delta-tau = shear stress promoting receiver rake)';

export function createEmptySourceModel(event: EQPEvent): SourceFaultModel {
  return {
    id: `src-${event.id}`,
    name: `Source Model (${event.id})`,
    referenceEventId: event.id,
    provenanceKind: 'Manual Model',
    assumptionsNote:
      'Homogeneous, isotropic elastic half-space; uniform slip over planar rectangular dislocation segments (Okada, 1992).',
    segments: [],
  };
}

/**
 * Explicitly labeled hypothetical benchmark scenario for testing and illustration only.
 * Never auto-loaded for real events.
 */
export function buildHypotheticalBenchmarkConfig(event: EQPEvent): {
  sourceModel: SourceFaultModel;
  receiverModel: ReceiverFaultModel;
  elasticParams: ElasticParameters;
} {
  const unlocated = isEventUnlocated(event);
  const baseLat = !unlocated ? event.lat : 14.5;
  const baseLon = !unlocated ? event.lon : 121.0;
  return {
    sourceModel: {
      id: `hypothetical-${event.id}`,
      name: 'HYPOTHETICAL Benchmark Right-Lateral Strike-Slip (Test Only)',
      referenceEventId: event.id,
      provenanceKind: 'Reference Benchmark (Hypothetical)',
      assumptionsNote:
        'HYPOTHETICAL TEST MODEL ONLY (not derived from EQP picks/waveform inversion): 30 km x 12 km vertical right-lateral fault, 1.5 m uniform slip, top depth 2 km.',
      segments: [
        {
          id: 'hyp-seg-1',
          name: 'Hypothetical N-S Strike-Slip Segment',
          centerLat: baseLat,
          centerLon: baseLon,
          originMode: 'center',
          topDepthKm: 2.0,
          strikeDeg: 0,
          dipDeg: 90,
          rakeDeg: 180,
          lengthKm: 30,
          widthKm: 12,
          slipM: 1.5,
        },
      ],
    },
    receiverModel: {
      ...DEFAULT_RECEIVER_MODEL,
      uniformOrientation: {
        strikeDeg: 0,
        dipDeg: 90,
        rakeDeg: 180,
        muEffective: 0.4,
      },
      explicitReceivers: [
        {
          id: 'hyp-rcv-1',
          name: 'Off-Fault Right Step Test Pt',
          lat: baseLat + 0.16,
          lon: baseLon + 0.08,
          depthKm: 10,
          strikeDeg: 0,
          dipDeg: 90,
          rakeDeg: 180,
          muEffective: 0.4,
        },
      ],
    },
    elasticParams: { ...DEFAULT_ELASTIC_PARAMETERS },
  };
}

/**
 * Builds an editable starting segment from a user-selected focal mechanism nodal plane.
 * Only transfers geometry/orientation and reference location — never auto-picks the
 * true rupture plane and never fabricates fault dimensions or slip from magnitude.
 */
export function buildSourceSegmentFromNodalPlane(
  plane: NodalPlane,
  event: EQPEvent,
  label = 'Focal Plane Reference'
): FaultSegment {
  const unlocated = isEventUnlocated(event);
  const centerLat = !unlocated && Number.isFinite(event.lat) ? event.lat : 14.5;
  const centerLon = !unlocated && Number.isFinite(event.lon) ? event.lon : 121.0;
  const eventDepthKm = !unlocated && Number.isFinite(event.depthKm) ? Math.max(0, event.depthKm) : 10;
  const widthKm = 8;
  const halfVerticalKm = 0.5 * widthKm * Math.sin((Math.max(0, Math.min(90, plane.dip)) * Math.PI) / 180);
  const topDepthKm = Math.max(0, Number((eventDepthKm - halfVerticalKm).toFixed(2)));
  return {
    id: `seg-fm-${Date.now()}-${Math.round(Math.random() * 1000)}`,
    name: label,
    centerLat: Number(centerLat.toFixed(5)),
    centerLon: Number(centerLon.toFixed(5)),
    originMode: 'center',
    topDepthKm,
    strikeDeg: normalizeAngle360(plane.strike),
    dipDeg: Math.max(0, Math.min(90, plane.dip)),
    rakeDeg: normalizeRake(plane.rake),
    lengthKm: 10,
    widthKm,
    slipM: 0.5,
  };
}

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const EARTH_RADIUS_M = 6371000;

export function unprojectLocalEnuMetersToLatLon(
  eastM: number,
  northM: number,
  originLat: number,
  originLon: number
): { lat: number; lon: number } {
  const cosLat = Math.max(0.1, Math.cos(originLat * DEG2RAD));
  const dLat = (northM / EARTH_RADIUS_M) * RAD2DEG;
  const dLon = (eastM / (EARTH_RADIUS_M * cosLat)) * RAD2DEG;
  return {
    lat: originLat + dLat,
    lon: originLon + dLon,
  };
}

export interface ValidationReport {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateSourceFaultModel(
  sourceModel: SourceFaultModel,
  elasticParams: ElasticParameters
): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!Number.isFinite(elasticParams.shearModulusGPa) || elasticParams.shearModulusGPa <= 0 || elasticParams.shearModulusGPa > 200) {
    errors.push('Shear modulus mu must be between 0 and 200 GPa.');
  }
  if (!Number.isFinite(elasticParams.poissonRatio) || elasticParams.poissonRatio < 0 || elasticParams.poissonRatio >= 0.5) {
    errors.push('Poisson ratio nu must satisfy 0 <= nu < 0.5.');
  }

  if (!sourceModel.segments || sourceModel.segments.length === 0) {
    errors.push('At least one finite rectangular source fault segment is required.');
    return { valid: false, errors, warnings };
  }

  sourceModel.segments.forEach((seg, idx) => {
    const tag = seg.name?.trim() || `Segment #${idx + 1}`;
    if (!Number.isFinite(seg.centerLat) || seg.centerLat < -90 || seg.centerLat > 90) {
      errors.push(`${tag}: invalid latitude (${seg.centerLat}).`);
    }
    if (!Number.isFinite(seg.centerLon) || seg.centerLon < -180 || seg.centerLon > 180) {
      errors.push(`${tag}: invalid longitude (${seg.centerLon}).`);
    }
    if (!Number.isFinite(seg.topDepthKm) || seg.topDepthKm < 0 || seg.topDepthKm > 700) {
      errors.push(`${tag}: top depth must be between 0 and 700 km.`);
    }
    if (!Number.isFinite(seg.strikeDeg)) {
      errors.push(`${tag}: strike must be finite.`);
    }
    if (!Number.isFinite(seg.dipDeg) || seg.dipDeg < 0 || seg.dipDeg > 90) {
      errors.push(`${tag}: dip must be between 0 and 90 deg.`);
    }
    if (!Number.isFinite(seg.rakeDeg)) {
      errors.push(`${tag}: rake must be finite.`);
    }
    if (!Number.isFinite(seg.lengthKm) || seg.lengthKm <= 0 || seg.lengthKm > 2000) {
      errors.push(`${tag}: length must be > 0 and <= 2000 km.`);
    }
    if (!Number.isFinite(seg.widthKm) || seg.widthKm <= 0 || seg.widthKm > 500) {
      errors.push(`${tag}: width must be > 0 and <= 500 km.`);
    }
    if (!Number.isFinite(seg.slipM) || seg.slipM < 0) {
      errors.push(`${tag}: slip magnitude must be >= 0 m.`);
    }
    const tensile = seg.tensileSlipM ?? 0;
    if (!Number.isFinite(tensile)) {
      errors.push(`${tag}: tensile slip must be finite.`);
    }
    if (seg.slipM === 0 && Math.abs(tensile) === 0) {
      warnings.push(`${tag}: zero slip and zero tensile opening contributes no stress change.`);
    }
    if (seg.topDepthKm === 0) {
      warnings.push(`${tag}: surface-breaking top depth = 0 km; near-surface cells close to fault trace may trigger singularity proximity warnings.`);
    }
    if (seg.dipDeg === 0) {
      warnings.push(`${tag}: horizontal fault (dip = 0 deg) uses Okada dip->0 branch.`);
    }
  });

  if (sourceModel.provenanceKind === 'Reference Benchmark (Hypothetical)') {
    warnings.push('Source model is a HYPOTHETICAL test benchmark, not a validated inversion of the active earthquake.');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function validateReceiverModel(receiverModel: ReceiverFaultModel): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  const uo = receiverModel.uniformOrientation;
  if (!Number.isFinite(uo.strikeDeg)) {
    errors.push('Uniform receiver strike must be finite.');
  }
  if (!Number.isFinite(uo.dipDeg) || uo.dipDeg < 0 || uo.dipDeg > 90) {
    errors.push('Uniform receiver dip must be between 0 and 90 deg.');
  }
  if (!Number.isFinite(uo.rakeDeg)) {
    errors.push('Uniform receiver rake must be finite.');
  }
  if (!Number.isFinite(uo.muEffective) || uo.muEffective < 0 || uo.muEffective > 1.2) {
    errors.push("Uniform effective friction mu' must satisfy 0 <= mu' <= 1.2.");
  }

  const gc = receiverModel.gridConfig;
  if (!Number.isFinite(gc.halfExtentKm) || gc.halfExtentKm <= 0 || gc.halfExtentKm > 500) {
    errors.push('Grid half-extent must be between 0 and 500 km.');
  }
  if (!Number.isFinite(gc.stepKm) || gc.stepKm <= 0) {
    errors.push('Grid step must be > 0 km.');
  } else {
    const dim = Math.floor((2 * gc.halfExtentKm) / gc.stepKm) + 1;
    if (dim > 81) {
      errors.push(`Grid resolution (${dim}x${dim} = ${dim * dim} cells) exceeds 81x81 limit; increase stepKm or reduce halfExtentKm.`);
    }
  }
  if (!Number.isFinite(gc.targetDepthKm) || gc.targetDepthKm < 0 || gc.targetDepthKm > 700) {
    errors.push('Target evaluation depth must be between 0 and 700 km.');
  }
  if (gc.crossSectionEnabled) {
    if (!Number.isFinite(gc.profileHalfLengthKm) || gc.profileHalfLengthKm <= 0 || gc.profileHalfLengthKm > 500) {
      errors.push('Profile half-length must be between 0 and 500 km.');
    }
    if (!Number.isFinite(gc.profileMaxDepthKm) || gc.profileMaxDepthKm <= 0 || gc.profileMaxDepthKm > 200) {
      errors.push('Profile max depth must be between 0 and 200 km.');
    }
    if (!Number.isFinite(gc.profileDepthStepKm) || gc.profileDepthStepKm <= 0) {
      errors.push('Profile depth step must be > 0 km.');
    }
  }

  if (receiverModel.mode === 'explicit-planes' && receiverModel.explicitReceivers.length === 0) {
    errors.push('Explicit receiver planes mode requires at least one defined receiver fault plane.');
  }

  receiverModel.explicitReceivers.forEach((rcv, idx) => {
    const tag = rcv.name?.trim() || `Receiver #${idx + 1}`;
    if (!Number.isFinite(rcv.lat) || rcv.lat < -90 || rcv.lat > 90) {
      errors.push(`${tag}: invalid latitude (${rcv.lat}).`);
    }
    if (!Number.isFinite(rcv.lon) || rcv.lon < -180 || rcv.lon > 180) {
      errors.push(`${tag}: invalid longitude (${rcv.lon}).`);
    }
    if (!Number.isFinite(rcv.depthKm) || rcv.depthKm < 0 || rcv.depthKm > 700) {
      errors.push(`${tag}: receiver depth must be between 0 and 700 km.`);
    }
    if (!Number.isFinite(rcv.dipDeg) || rcv.dipDeg < 0 || rcv.dipDeg > 90) {
      errors.push(`${tag}: receiver dip must be between 0 and 90 deg.`);
    }
    if (!Number.isFinite(rcv.muEffective) || rcv.muEffective < 0 || rcv.muEffective > 1.2) {
      errors.push(`${tag}: effective friction mu' must satisfy 0 <= mu' <= 1.2.`);
    }
  });

  if (receiverModel.mode === 'explicit-planes') {
    warnings.push(
      'Background stress map grid still uses the configured uniform receiver orientation/mu\' while explicit 3D receivers are evaluated pointwise at their specified depths and orientations.'
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Evaluates a single Okada rectangular fault segment at an ENU observation point
 * relative to (originLat, originLon).
 */
function evaluateSegmentAtEnuPoint(
  segment: FaultSegment,
  obsEastM: number,
  obsNorthM: number,
  obsDepthM: number,
  originLat: number,
  originLon: number,
  elasticParams: ElasticParameters
): {
  dispEnuM: [number, number, number];
  stressEnuPa: StressTensorEnuPa;
  nearFaultSingular: boolean;
} {
  const segOriginEnu = projectLatLonToLocalEnuMeters(
    segment.centerLat,
    segment.centerLon,
    originLat,
    originLon
  );

  const strikeRad = normalizeAngle360(segment.strikeDeg) * DEG2RAD;
  const dipDeg = Math.max(0, Math.min(90, segment.dipDeg));
  const dipRad = dipDeg * DEG2RAD;
  const rakeRad = normalizeRake(segment.rakeDeg) * DEG2RAD;

  // Orthonormal right-handed Okada local basis expressed in geographic ENU [E, N, U]
  // +x = along strike, +y = up-dip horizontal (azimuth strike - 90), +z = Up
  const ex = [Math.sin(strikeRad), Math.cos(strikeRad), 0];
  const ey = [-Math.cos(strikeRad), Math.sin(strikeRad), 0];
  const ez = [0, 0, 1];

  const dxE = obsEastM - segOriginEnu.eastM;
  const dxN = obsNorthM - segOriginEnu.northM;

  const xOk = dxE * ex[0] + dxN * ex[1];
  const yOk = dxE * ey[0] + dxN * ey[1];
  const zOk = -Math.max(0, obsDepthM);

  const lengthM = segment.lengthKm * 1000;
  const widthM = segment.widthKm * 1000;
  const topDepthM = Math.max(0, segment.topDepthKm * 1000);

  let depthOriginM = topDepthM;
  let aw1 = -widthM;
  let aw2 = 0;
  if (segment.originMode === 'center') {
    depthOriginM = topDepthM + 0.5 * widthM * Math.sin(dipRad);
    aw1 = -0.5 * widthM;
    aw2 = 0.5 * widthM;
  }
  const al1 = -0.5 * lengthM;
  const al2 = 0.5 * lengthM;

  const disl1 = segment.slipM * Math.cos(rakeRad);
  const disl2 = segment.slipM * Math.sin(rakeRad);
  const disl3 = segment.tensileSlipM ?? 0;

  const nu = elasticParams.poissonRatio;
  const mu = elasticParams.shearModulusGPa * 1e9;
  const lam = (2 * mu * nu) / Math.max(1e-6, 1 - 2 * nu);
  const alpha = 1 / (2 * (1 - nu));

  const out = computeOkada1992Dislocation(
    alpha,
    xOk,
    yOk,
    zOk,
    depthOriginM,
    dipDeg,
    al1,
    al2,
    aw1,
    aw2,
    disl1,
    disl2,
    disl3
  );

  // Rotate displacement from Okada local (x, y, z) to ENU
  const dispEnuM: [number, number, number] = [
    out.ux * ex[0] + out.uy * ey[0] + out.uz * ez[0],
    out.ux * ex[1] + out.uy * ey[1] + out.uz * ez[1],
    out.ux * ex[2] + out.uy * ey[2] + out.uz * ez[2],
  ];

  // Infinitesimal strain & isotropic Hooke's law (tension-positive / unclamping-positive)
  const exx = out.uxx;
  const eyy = out.uyy;
  const ezz = out.uzz;
  const exy = 0.5 * (out.uxy + out.uyx);
  const exz = 0.5 * (out.uxz + out.uzx);
  const eyz = 0.5 * (out.uyz + out.uzy);
  const vol = exx + eyy + ezz;

  const sLocal = [
    [lam * vol + 2 * mu * exx, 2 * mu * exy, 2 * mu * exz],
    [2 * mu * exy, lam * vol + 2 * mu * eyy, 2 * mu * eyz],
    [2 * mu * exz, 2 * mu * eyz, lam * vol + 2 * mu * ezz],
  ];

  // Rotate tensor: sigma_ENU = Q * sLocal * Q^T, Q = [ex | ey | ez]
  const Q = [
    [ex[0], ey[0], ez[0]],
    [ex[1], ey[1], ez[1]],
    [ex[2], ey[2], ez[2]],
  ];

  const tmp = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      tmp[i][j] = sLocal[i][0] * Q[j][0] + sLocal[i][1] * Q[j][1] + sLocal[i][2] * Q[j][2];
    }
  }
  const sEnu = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      sEnu[i][j] = Q[i][0] * tmp[0][j] + Q[i][1] * tmp[1][j] + Q[i][2] * tmp[2][j];
    }
  }

  return {
    dispEnuM,
    stressEnuPa: {
      sEE: sEnu[0][0],
      sNN: sEnu[1][1],
      sUU: sEnu[2][2],
      sEN: sEnu[0][1],
      sEU: sEnu[0][2],
      sNU: sEnu[1][2],
    },
    nearFaultSingular: out.nearFaultSingular,
  };
}

/**
 * Evaluates total superposed displacement and stress tensor in ENU across all segments.
 */
export function evaluateCompositeStressEnuAtPoint(
  segments: FaultSegment[],
  obsLat: number,
  obsLon: number,
  obsDepthKm: number,
  originLat: number,
  originLon: number,
  elasticParams: ElasticParameters
): {
  dispEnuM: [number, number, number];
  stressEnuPa: StressTensorEnuPa;
  nearFaultSingular: boolean;
} {
  const obsEnu = projectLatLonToLocalEnuMeters(obsLat, obsLon, originLat, originLon);
  return evaluateCompositeStressEnuAtLocalMeters(
    segments,
    obsEnu.eastM,
    obsEnu.northM,
    obsDepthKm * 1000,
    originLat,
    originLon,
    elasticParams
  );
}

function evaluateCompositeStressEnuAtLocalMeters(
  segments: FaultSegment[],
  obsEastM: number,
  obsNorthM: number,
  obsDepthM: number,
  originLat: number,
  originLon: number,
  elasticParams: ElasticParameters
): {
  dispEnuM: [number, number, number];
  stressEnuPa: StressTensorEnuPa;
  nearFaultSingular: boolean;
} {
  let dE = 0;
  let dN = 0;
  let dU = 0;
  let sEE = 0;
  let sNN = 0;
  let sUU = 0;
  let sEN = 0;
  let sEU = 0;
  let sNU = 0;
  let nearFaultSingular = false;

  for (const seg of segments) {
    const res = evaluateSegmentAtEnuPoint(
      seg,
      obsEastM,
      obsNorthM,
      obsDepthM,
      originLat,
      originLon,
      elasticParams
    );
    dE += res.dispEnuM[0];
    dN += res.dispEnuM[1];
    dU += res.dispEnuM[2];
    sEE += res.stressEnuPa.sEE;
    sNN += res.stressEnuPa.sNN;
    sUU += res.stressEnuPa.sUU;
    sEN += res.stressEnuPa.sEN;
    sEU += res.stressEnuPa.sEU;
    sNU += res.stressEnuPa.sNU;
    if (res.nearFaultSingular) nearFaultSingular = true;
  }

  return {
    dispEnuM: [dE, dN, dU],
    stressEnuPa: { sEE, sNN, sUU, sEN, sEU, sNU },
    nearFaultSingular,
  };
}

/**
 * Resolves an ENU stress tensor onto a receiver plane (strike, dip, rake, muEffective).
 * Sign convention:
 *   - Delta-sigma_n > 0 means unclamping / tensile normal stress change.
 *   - Delta-tau > 0 means shear stress change in the receiver's rake slip direction.
 *   - Delta-CFS = Delta-tau + muEffective * Delta-sigma_n.
 */
export function resolveCoulombStressOnReceiver(
  stressEnuPa: StressTensorEnuPa,
  strikeDeg: number,
  dipDeg: number,
  rakeDeg: number,
  muEffective: number
): {
  deltaShearKPa: number;
  deltaNormalKPa: number;
  deltaCfsKPa: number;
} {
  const { n, s } = planeToVectors(strikeDeg, dipDeg, rakeDeg);
  // Convert NED (n, e, d) -> ENU (e, n, -d)
  const nE = n.e;
  const nN = n.n;
  const nU = -n.d;
  const sE = s.e;
  const sN = s.n;
  const sU = -s.d;

  const tE = stressEnuPa.sEE * nE + stressEnuPa.sEN * nN + stressEnuPa.sEU * nU;
  const tN = stressEnuPa.sEN * nE + stressEnuPa.sNN * nN + stressEnuPa.sNU * nU;
  const tU = stressEnuPa.sEU * nE + stressEnuPa.sNU * nN + stressEnuPa.sUU * nU;

  const sigmaNPa = nE * tE + nN * tN + nU * tU;
  const tauPa = sE * tE + sN * tN + sU * tU;
  const cfsPa = tauPa + muEffective * sigmaNPa;

  return {
    deltaShearKPa: tauPa / 1000,
    deltaNormalKPa: sigmaNPa / 1000,
    deltaCfsKPa: cfsPa / 1000,
  };
}

export function classifyCoulombRegime(
  deltaCfsKPa: number
): 'Positive (Stress Loaded)' | 'Neutral (~0)' | 'Negative (Stress Shadow)' {
  if (deltaCfsKPa > 1.0) return 'Positive (Stress Loaded)';
  if (deltaCfsKPa < -1.0) return 'Negative (Stress Shadow)';
  return 'Neutral (~0)';
}

export function computeSegmentSurfaceProjection(segment: FaultSegment): {
  topStart: { lat: number; lon: number };
  topEnd: { lat: number; lon: number };
  bottomStart: { lat: number; lon: number };
  bottomEnd: { lat: number; lon: number };
  dipTickStart: { lat: number; lon: number };
  dipTickEnd: { lat: number; lon: number };
} {
  const strikeRad = normalizeAngle360(segment.strikeDeg) * DEG2RAD;
  const dipRad = Math.max(0, Math.min(90, segment.dipDeg)) * DEG2RAD;
  const halfLM = segment.lengthKm * 500;
  const horizWidthM = segment.widthKm * 1000 * Math.cos(dipRad);

  // Along strike unit (E, N)
  const sE = Math.sin(strikeRad);
  const sN = Math.cos(strikeRad);
  // Down-dip horizontal unit (strike + 90 deg)
  const dE = Math.cos(strikeRad);
  const dN = -Math.sin(strikeRad);

  // Offset from reference point to top-center & bottom-center in horizontal plane
  const topOffsetM = segment.originMode === 'center' ? -0.5 * horizWidthM : 0;
  const botOffsetM = segment.originMode === 'center' ? 0.5 * horizWidthM : horizWidthM;

  const toLatLon = (eM: number, nM: number) =>
    unprojectLocalEnuMetersToLatLon(eM, nM, segment.centerLat, segment.centerLon);

  const topStart = toLatLon(-halfLM * sE + topOffsetM * dE, -halfLM * sN + topOffsetM * dN);
  const topEnd = toLatLon(halfLM * sE + topOffsetM * dE, halfLM * sN + topOffsetM * dN);
  const bottomStart = toLatLon(-halfLM * sE + botOffsetM * dE, -halfLM * sN + botOffsetM * dN);
  const bottomEnd = toLatLon(halfLM * sE + botOffsetM * dE, halfLM * sN + botOffsetM * dN);

  const dipTickStart = toLatLon(topOffsetM * dE, topOffsetM * dN);
  const tickLenM = Math.max(1500, Math.min(8000, segment.lengthKm * 180));
  const dipTickEnd = toLatLon(
    topOffsetM * dE + tickLenM * dE,
    topOffsetM * dN + tickLenM * dN
  );

  return {
    topStart,
    topEnd,
    bottomStart,
    bottomEnd,
    dipTickStart,
    dipTickEnd,
  };
}

export function computeCoulombInputFingerprint(
  sourceModel: SourceFaultModel,
  receiverModel: ReceiverFaultModel,
  elasticParams: ElasticParameters,
  originLat: number,
  originLon: number
): string {
  const canonical = {
    originLat: Number(originLat.toFixed(5)),
    originLon: Number(originLon.toFixed(5)),
    elasticParams,
    segments: sourceModel.segments.map((s) => ({
      centerLat: s.centerLat,
      centerLon: s.centerLon,
      originMode: s.originMode,
      topDepthKm: s.topDepthKm,
      strikeDeg: s.strikeDeg,
      dipDeg: s.dipDeg,
      rakeDeg: s.rakeDeg,
      lengthKm: s.lengthKm,
      widthKm: s.widthKm,
      slipM: s.slipM,
      tensileSlipM: s.tensileSlipM ?? 0,
    })),
    receiverModel,
  };
  const str = JSON.stringify(canonical);
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `cfs-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function runCoulombCalculation(params: {
  sourceModel: SourceFaultModel;
  receiverModel: ReceiverFaultModel;
  elasticParams: ElasticParameters;
  originLat: number;
  originLon: number;
}): CoulombCalculationResult {
  const { sourceModel, receiverModel, elasticParams, originLat, originLon } = params;
  const inputFingerprint = computeCoulombInputFingerprint(
    sourceModel,
    receiverModel,
    elasticParams,
    originLat,
    originLon
  );
  const computedAtUtc = new Date().toISOString();

  const srcVal = validateSourceFaultModel(sourceModel, elasticParams);
  const rcvVal = validateReceiverModel(receiverModel);
  const errors = [...srcVal.errors, ...rcvVal.errors];
  const warnings = [...srcVal.warnings, ...rcvVal.warnings];

  if (!Number.isFinite(originLat) || !Number.isFinite(originLon)) {
    errors.push('Geographic evaluation origin latitude/longitude must be finite.');
  }

  const muPa = elasticParams.shearModulusGPa * 1e9;
  let sourceMomentNm = 0;
  for (const seg of sourceModel.segments) {
    const areaM2 = Math.max(0, seg.lengthKm) * 1000 * Math.max(0, seg.widthKm) * 1000;
    const totalSlipM = Math.hypot(seg.slipM, seg.tensileSlipM ?? 0);
    sourceMomentNm += muPa * areaM2 * totalSlipM;
  }
  const equivalentMw =
    sourceMomentNm > 0 ? Number(((2 / 3) * (Math.log10(sourceMomentNm) - 9.1)).toFixed(2)) : null;

  if (errors.length > 0) {
    return {
      status: 'Invalid Configuration',
      solverIdentity: COULOMB_SOLVER_IDENTITY,
      solverVersion: COULOMB_SOLVER_VERSION,
      signConvention: COULOMB_SIGN_CONVENTION,
      computedAtUtc,
      warnings,
      errors,
      sourceMomentNm,
      equivalentMw,
      originLat: Number.isFinite(originLat) ? originLat : 14.5,
      originLon: Number.isFinite(originLon) ? originLon : 121.0,
      targetDepthKm: receiverModel.gridConfig.targetDepthKm,
      gridStepKm: receiverModel.gridConfig.stepKm,
      gridHalfExtentKm: receiverModel.gridConfig.halfExtentKm,
      gridCols: 0,
      gridRows: 0,
      gridCells: [],
      maxPositiveCfsKPa: 0,
      maxNegativeCfsKPa: 0,
      nearFaultFlaggedCount: 0,
      pointEvaluations: [],
      crossSectionCells: [],
      depthSensitivity: [],
      frictionSensitivity: [],
      inputFingerprint,
      isReferenceBenchmarkRun: sourceModel.provenanceKind === 'Reference Benchmark (Hypothetical)',
    };
  }

  const gc = receiverModel.gridConfig;
  const uo = receiverModel.uniformOrientation;
  const targetDepthM = gc.targetDepthKm * 1000;
  const nStepsHalf = Math.floor(gc.halfExtentKm / gc.stepKm);
  const gridCols = 2 * nStepsHalf + 1;
  const gridRows = 2 * nStepsHalf + 1;

  const gridCells: CoulombGridCell[] = [];
  let maxPositiveCfsKPa = 0;
  let maxNegativeCfsKPa = 0;
  let nearFaultFlaggedCount = 0;

  for (let iy = 0; iy < gridRows; iy++) {
    const northKm = (nStepsHalf - iy) * gc.stepKm;
    const northM = northKm * 1000;
    for (let ix = 0; ix < gridCols; ix++) {
      const eastKm = (ix - nStepsHalf) * gc.stepKm;
      const eastM = eastKm * 1000;
      const { lat, lon } = unprojectLocalEnuMetersToLatLon(eastM, northM, originLat, originLon);

      const field = evaluateCompositeStressEnuAtLocalMeters(
        sourceModel.segments,
        eastM,
        northM,
        targetDepthM,
        originLat,
        originLon,
        elasticParams
      );
      const resolved = resolveCoulombStressOnReceiver(
        field.stressEnuPa,
        uo.strikeDeg,
        uo.dipDeg,
        uo.rakeDeg,
        uo.muEffective
      );

      if (resolved.deltaCfsKPa > maxPositiveCfsKPa) maxPositiveCfsKPa = resolved.deltaCfsKPa;
      if (resolved.deltaCfsKPa < maxNegativeCfsKPa) maxNegativeCfsKPa = resolved.deltaCfsKPa;
      if (field.nearFaultSingular) nearFaultFlaggedCount++;

      gridCells.push({
        ix,
        iy,
        lat,
        lon,
        eastKm,
        northKm,
        deltaShearKPa: resolved.deltaShearKPa,
        deltaNormalKPa: resolved.deltaNormalKPa,
        deltaCfsKPa: resolved.deltaCfsKPa,
        nearFaultSingular: field.nearFaultSingular,
      });
    }
  }

  // Pointwise evaluations: explicit receivers if any, plus representative off-fault reference if uniform-only
  const pointEvaluations: PointCoulombEvaluation[] = [];
  const evalPointList: Array<{
    id: string;
    name: string;
    lat: number;
    lon: number;
    depthKm: number;
    strikeDeg: number;
    dipDeg: number;
    rakeDeg: number;
    muEffective: number;
  }> =
    receiverModel.explicitReceivers.length > 0
      ? receiverModel.explicitReceivers
      : [
          {
            id: 'uniform-ref-east',
            name: `Ref +${Math.round(gc.halfExtentKm * 0.25)}km E`,
            ...unprojectLocalEnuMetersToLatLon(gc.halfExtentKm * 250, 0, originLat, originLon),
            depthKm: gc.targetDepthKm,
            ...uo,
          },
          {
            id: 'uniform-ref-north',
            name: `Ref +${Math.round(gc.halfExtentKm * 0.25)}km N`,
            ...unprojectLocalEnuMetersToLatLon(0, gc.halfExtentKm * 250, originLat, originLon),
            depthKm: gc.targetDepthKm,
            ...uo,
          },
          {
            id: 'uniform-ref-ne',
            name: `Ref +${Math.round(gc.halfExtentKm * 0.25)}km NE`,
            ...unprojectLocalEnuMetersToLatLon(
              gc.halfExtentKm * 177,
              gc.halfExtentKm * 177,
              originLat,
              originLon
            ),
            depthKm: gc.targetDepthKm,
            ...uo,
          },
          {
            id: 'uniform-ref-sw',
            name: `Ref -${Math.round(gc.halfExtentKm * 0.25)}km SW`,
            ...unprojectLocalEnuMetersToLatLon(
              -gc.halfExtentKm * 177,
              -gc.halfExtentKm * 177,
              originLat,
              originLon
            ),
            depthKm: gc.targetDepthKm,
            ...uo,
          },
        ];

  for (const pt of evalPointList) {
    const field = evaluateCompositeStressEnuAtPoint(
      sourceModel.segments,
      pt.lat,
      pt.lon,
      pt.depthKm,
      originLat,
      originLon,
      elasticParams
    );
    const resolved = resolveCoulombStressOnReceiver(
      field.stressEnuPa,
      pt.strikeDeg,
      pt.dipDeg,
      pt.rakeDeg,
      pt.muEffective
    );
    pointEvaluations.push({
      id: pt.id,
      name: pt.name,
      lat: pt.lat,
      lon: pt.lon,
      depthKm: pt.depthKm,
      strikeDeg: pt.strikeDeg,
      dipDeg: pt.dipDeg,
      rakeDeg: pt.rakeDeg,
      muEffective: pt.muEffective,
      deltaShearKPa: resolved.deltaShearKPa,
      deltaNormalKPa: resolved.deltaNormalKPa,
      deltaCfsKPa: resolved.deltaCfsKPa,
      stressRegimeClass: classifyCoulombRegime(resolved.deltaCfsKPa),
      nearFaultSingular: field.nearFaultSingular,
      displacementMm: {
        e: field.dispEnuM[0] * 1000,
        n: field.dispEnuM[1] * 1000,
        u: field.dispEnuM[2] * 1000,
      },
    });
  }

  // Optional vertical cross-section profile
  const crossSectionCells: CoulombCrossSectionCell[] = [];
  if (gc.crossSectionEnabled) {
    const azRad = normalizeAngle360(gc.profileAzimuthDeg) * DEG2RAD;
    const uxE = Math.sin(azRad);
    const uxN = Math.cos(azRad);
    const alongSteps = 21;
    const depthSteps = Math.max(
      2,
      Math.min(25, Math.floor(gc.profileMaxDepthKm / Math.max(0.5, gc.profileDepthStepKm)) + 1)
    );
    const stepAlongKm = (2 * gc.profileHalfLengthKm) / (alongSteps - 1);
    for (let iz = 0; iz < depthSteps; iz++) {
      const depthKm = Math.min(gc.profileMaxDepthKm, iz * gc.profileDepthStepKm);
      for (let ia = 0; ia < alongSteps; ia++) {
        const alongKm = -gc.profileHalfLengthKm + ia * stepAlongKm;
        const eastM = alongKm * 1000 * uxE;
        const northM = alongKm * 1000 * uxN;
        const { lat, lon } = unprojectLocalEnuMetersToLatLon(eastM, northM, originLat, originLon);
        const field = evaluateCompositeStressEnuAtLocalMeters(
          sourceModel.segments,
          eastM,
          northM,
          depthKm * 1000,
          originLat,
          originLon,
          elasticParams
        );
        const resolved = resolveCoulombStressOnReceiver(
          field.stressEnuPa,
          uo.strikeDeg,
          uo.dipDeg,
          uo.rakeDeg,
          uo.muEffective
        );
        crossSectionCells.push({
          ia,
          iz,
          alongKm,
          depthKm,
          lat,
          lon,
          deltaShearKPa: resolved.deltaShearKPa,
          deltaNormalKPa: resolved.deltaNormalKPa,
          deltaCfsKPa: resolved.deltaCfsKPa,
          nearFaultSingular: field.nearFaultSingular,
        });
      }
    }
  }

  // Sensitivity curves evaluated at primary receiver point (or grid peak positive cell)
  const sensAnchor = (() => {
    if (receiverModel.explicitReceivers.length > 0) {
      const r = receiverModel.explicitReceivers[0];
      return {
        lat: r.lat,
        lon: r.lon,
        strikeDeg: r.strikeDeg,
        dipDeg: r.dipDeg,
        rakeDeg: r.rakeDeg,
        depthKm: r.depthKm,
      };
    }
    let best = gridCells[0];
    for (const c of gridCells) {
      if (!c.nearFaultSingular && Math.abs(c.deltaCfsKPa) > Math.abs(best?.deltaCfsKPa ?? 0)) {
        best = c;
      }
    }
    return {
      lat: best?.lat ?? originLat,
      lon: best?.lon ?? originLon,
      strikeDeg: uo.strikeDeg,
      dipDeg: uo.dipDeg,
      rakeDeg: uo.rakeDeg,
      depthKm: gc.targetDepthKm,
    };
  })();

  const depthValues = [1, 3, 5, 8, 10, 15, 20, 25];
  const depthSensitivity: CoulombSensitivityPoint[] = depthValues.map((dKm) => {
    const f = evaluateCompositeStressEnuAtPoint(
      sourceModel.segments,
      sensAnchor.lat,
      sensAnchor.lon,
      dKm,
      originLat,
      originLon,
      elasticParams
    );
    const r = resolveCoulombStressOnReceiver(
      f.stressEnuPa,
      sensAnchor.strikeDeg,
      sensAnchor.dipDeg,
      sensAnchor.rakeDeg,
      uo.muEffective
    );
    return {
      paramLabel: `${dKm} km`,
      value: dKm,
      deltaCfsKPa: r.deltaCfsKPa,
      deltaShearKPa: r.deltaShearKPa,
      deltaNormalKPa: r.deltaNormalKPa,
    };
  });

  const baseField = evaluateCompositeStressEnuAtPoint(
    sourceModel.segments,
    sensAnchor.lat,
    sensAnchor.lon,
    sensAnchor.depthKm,
    originLat,
    originLon,
    elasticParams
  );
  const muValues = [0.0, 0.2, 0.4, 0.6, 0.75, 0.85];
  const frictionSensitivity: CoulombSensitivityPoint[] = muValues.map((muVal) => {
    const r = resolveCoulombStressOnReceiver(
      baseField.stressEnuPa,
      sensAnchor.strikeDeg,
      sensAnchor.dipDeg,
      sensAnchor.rakeDeg,
      muVal
    );
    return {
      paramLabel: muVal.toFixed(2),
      value: muVal,
      deltaCfsKPa: r.deltaCfsKPa,
      deltaShearKPa: r.deltaShearKPa,
      deltaNormalKPa: r.deltaNormalKPa,
    };
  });

  if (nearFaultFlaggedCount > 0) {
    warnings.push(
      `${nearFaultFlaggedCount} grid cell(s) fall within 50 m of a source dislocation boundary (near-fault singularity zone); interpret values near dislocation edges cautiously.`
    );
  }

  return {
    status: 'Experimental',
    solverIdentity: COULOMB_SOLVER_IDENTITY,
    solverVersion: COULOMB_SOLVER_VERSION,
    signConvention: COULOMB_SIGN_CONVENTION,
    computedAtUtc,
    warnings,
    errors: [],
    sourceMomentNm,
    equivalentMw,
    originLat,
    originLon,
    targetDepthKm: gc.targetDepthKm,
    gridStepKm: gc.stepKm,
    gridHalfExtentKm: gc.halfExtentKm,
    gridCols,
    gridRows,
    gridCells,
    maxPositiveCfsKPa,
    maxNegativeCfsKPa,
    nearFaultFlaggedCount,
    pointEvaluations,
    crossSectionCells,
    depthSensitivity,
    frictionSensitivity,
    inputFingerprint,
    isReferenceBenchmarkRun: sourceModel.provenanceKind === 'Reference Benchmark (Hypothetical)',
  };
}

export function formatStressValue(kPa: number, unit: CoulombStressUnit): string {
  if (!Number.isFinite(kPa)) return '—';
  const val = unit === 'MPa' ? kPa / 1000 : kPa;
  const abs = Math.abs(val);
  const digits = unit === 'MPa' ? 3 : abs >= 100 ? 1 : 2;
  return `${val >= 0 ? '+' : ''}${val.toFixed(digits)} ${unit}`;
}

export function parseSourceFaultCsv(
  content: string
): { segments: FaultSegment[]; warnings: string[]; errors: string[] } {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));
  if (lines.length < 2) {
    return {
      segments: [],
      warnings: [],
      errors: ['CSV must include a header row and at least one segment row.'],
    };
  }

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const colIdx = (aliases: string[]) => headers.findIndex((h) => aliases.includes(h));

  const iName = colIdx(['name', 'segment', 'id', 'label']);
  const iLat = colIdx(['lat', 'latitude', 'center_lat', 'centerlat']);
  const iLon = colIdx(['lon', 'lng', 'longitude', 'center_lon', 'centerlon']);
  const iDepth = colIdx(['top_depth_km', 'topdepthkm', 'depth_km', 'depth', 'z_top_km']);
  const iStrike = colIdx(['strike', 'strike_deg', 'strikedeg']);
  const iDip = colIdx(['dip', 'dip_deg', 'dipdeg']);
  const iRake = colIdx(['rake', 'rake_deg', 'rakedeg']);
  const iLength = colIdx(['length_km', 'lengthkm', 'length', 'l_km']);
  const iWidth = colIdx(['width_km', 'widthkm', 'width', 'w_km']);
  const iSlip = colIdx(['slip_m', 'slipm', 'slip', 'u_m']);
  const iTensile = colIdx(['tensile_m', 'tensileslipm', 'opening_m']);
  const iOrigin = colIdx(['origin_mode', 'originmode']);

  if (iLat < 0 || iLon < 0 || iStrike < 0 || iDip < 0 || iRake < 0 || iLength < 0 || iWidth < 0 || iSlip < 0) {
    return {
      segments: [],
      warnings: [],
      errors: [
        'CSV missing required columns. Required: lat, lon, strike, dip, rake, length_km, width_km, slip_m (optional: name, top_depth_km, tensile_m, origin_mode).',
      ],
    };
  }

  const segments: FaultSegment[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  for (let r = 1; r < lines.length; r++) {
    const parts = lines[r].split(',').map((p) => p.trim());
    const num = (idx: number, fallback = NaN) =>
      idx >= 0 && idx < parts.length && parts[idx] !== '' ? Number(parts[idx]) : fallback;

    const lat = num(iLat);
    const lon = num(iLon);
    const strike = num(iStrike);
    const dip = num(iDip);
    const rake = num(iRake);
    const lengthKm = num(iLength);
    const widthKm = num(iWidth);
    const slipM = num(iSlip);
    const topDepthKm = iDepth >= 0 ? num(iDepth, 0) : 0;
    const tensileSlipM = iTensile >= 0 ? num(iTensile, 0) : 0;
    const originRaw = iOrigin >= 0 ? parts[iOrigin]?.toLowerCase() : '';
    const originMode: SourceOriginMode = originRaw === 'top-center' ? 'top-center' : 'center';

    if ([lat, lon, strike, dip, rake, lengthKm, widthKm, slipM, topDepthKm].some((v) => !Number.isFinite(v))) {
      errors.push(`Row ${r + 1}: contains non-numeric or missing required values.`);
      continue;
    }

    segments.push({
      id: `csv-seg-${r}-${Date.now()}`,
      name: iName >= 0 && parts[iName] ? parts[iName] : `CSV Segment ${r}`,
      centerLat: lat,
      centerLon: lon,
      originMode,
      topDepthKm: Math.max(0, topDepthKm),
      strikeDeg: normalizeAngle360(strike),
      dipDeg: Math.max(0, Math.min(90, dip)),
      rakeDeg: normalizeRake(rake),
      lengthKm,
      widthKm,
      slipM,
      tensileSlipM: Number.isFinite(tensileSlipM) ? tensileSlipM : 0,
    });
  }

  if (segments.length === 0 && errors.length === 0) {
    errors.push('No valid fault segments parsed from CSV.');
  }

  return { segments, warnings, errors };
}

export function parseSourceFaultGeoJson(
  content: string
): { segments: FaultSegment[]; warnings: string[]; errors: string[] } {
  try {
    const parsed = JSON.parse(content) as {
      type?: string;
      features?: Array<{
        geometry?: { type?: string; coordinates?: unknown };
        properties?: Record<string, unknown>;
      }>;
    };
    const features = Array.isArray(parsed.features) ? parsed.features : [];
    if (features.length === 0) {
      return { segments: [], warnings: [], errors: ['GeoJSON contains no features.'] };
    }

    const segments: FaultSegment[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];

    features.forEach((feat, idx) => {
      const props = feat.properties ?? {};
      const g = feat.geometry;
      let lat = Number(props.centerLat ?? props.center_lat ?? props.lat);
      let lon = Number(props.centerLon ?? props.center_lon ?? props.lon);
      let inferredStrike: number | null = null;
      let inferredLengthKm: number | null = null;

      if (g?.type === 'Point' && Array.isArray(g.coordinates) && g.coordinates.length >= 2) {
        if (!Number.isFinite(lon)) lon = Number(g.coordinates[0]);
        if (!Number.isFinite(lat)) lat = Number(g.coordinates[1]);
      } else if (g?.type === 'LineString' && Array.isArray(g.coordinates) && g.coordinates.length >= 2) {
        const coords = g.coordinates as number[][];
        const first = coords[0];
        const last = coords[coords.length - 1];
        if (first.length >= 2 && last.length >= 2) {
          if (!Number.isFinite(lon)) lon = 0.5 * (Number(first[0]) + Number(last[0]));
          if (!Number.isFinite(lat)) lat = 0.5 * (Number(first[1]) + Number(last[1]));
          const enu = projectLatLonToLocalEnuMeters(last[1], last[0], first[1], first[0]);
          const distM = Math.hypot(enu.eastM, enu.northM);
          if (distM > 10) {
            inferredStrike = normalizeAngle360(Math.atan2(enu.eastM, enu.northM) * RAD2DEG);
            inferredLengthKm = Number((distM / 1000).toFixed(2));
          }
        }
      }

      const strike = Number(props.strikeDeg ?? props.strike_deg ?? props.strike ?? inferredStrike ?? NaN);
      const dip = Number(props.dipDeg ?? props.dip_deg ?? props.dip ?? NaN);
      const rake = Number(props.rakeDeg ?? props.rake_deg ?? props.rake ?? NaN);
      const lengthKm = Number(props.lengthKm ?? props.length_km ?? props.length ?? inferredLengthKm ?? NaN);
      const widthKm = Number(props.widthKm ?? props.width_km ?? props.width ?? NaN);
      const slipM = Number(props.slipM ?? props.slip_m ?? props.slip ?? NaN);
      const topDepthKm = Number(props.topDepthKm ?? props.top_depth_km ?? props.depth_km ?? 0);

      if ([lat, lon, strike, dip, rake, lengthKm, widthKm, slipM].some((v) => !Number.isFinite(v))) {
        errors.push(
          `Feature #${idx + 1}: missing required 3D source properties (dip, rake, width_km, slip_m, and strike/length_km).`
        );
        return;
      }

      segments.push({
        id: `geo-seg-${idx + 1}-${Date.now()}`,
        name: String(props.name ?? props.fault_name ?? `GeoJSON Segment ${idx + 1}`),
        centerLat: lat,
        centerLon: lon,
        originMode: props.originMode === 'top-center' ? 'top-center' : 'center',
        topDepthKm: Math.max(0, Number.isFinite(topDepthKm) ? topDepthKm : 0),
        strikeDeg: normalizeAngle360(strike),
        dipDeg: Math.max(0, Math.min(90, dip)),
        rakeDeg: normalizeRake(rake),
        lengthKm,
        widthKm,
        slipM,
      });
    });

    return { segments, warnings, errors };
  } catch (err) {
    return {
      segments: [],
      warnings: [],
      errors: [err instanceof Error ? err.message : 'Invalid GeoJSON payload.'],
    };
  }
}

export function exportCoulombGridCsv(result: CoulombCalculationResult): string {
  const header = [
    'ix',
    'iy',
    'lat_deg',
    'lon_deg',
    'east_km',
    'north_km',
    'depth_km',
    'delta_shear_kPa',
    'delta_normal_unclamping_kPa',
    'delta_cfs_kPa',
    'near_fault_singular',
  ].join(',');
  const rows = result.gridCells.map((c) =>
    [
      c.ix,
      c.iy,
      c.lat.toFixed(5),
      c.lon.toFixed(5),
      c.eastKm.toFixed(2),
      c.northKm.toFixed(2),
      result.targetDepthKm.toFixed(2),
      c.deltaShearKPa.toFixed(3),
      c.deltaNormalKPa.toFixed(3),
      c.deltaCfsKPa.toFixed(3),
      c.nearFaultSingular ? 'TRUE' : 'FALSE',
    ].join(',')
  );
  return [
    `# Solver: ${result.solverIdentity} (${result.solverVersion})`,
    `# Status: ${result.status} | Convention: ${result.signConvention}`,
    `# Computed UTC: ${result.computedAtUtc}`,
    header,
    ...rows,
  ].join('\n');
}

export function exportCoulombPointsCsv(result: CoulombCalculationResult): string {
  const header = [
    'id',
    'name',
    'lat_deg',
    'lon_deg',
    'depth_km',
    'strike_deg',
    'dip_deg',
    'rake_deg',
    'mu_effective',
    'delta_shear_kPa',
    'delta_normal_unclamping_kPa',
    'delta_cfs_kPa',
    'regime_class',
    'near_fault_singular',
    'disp_e_mm',
    'disp_n_mm',
    'disp_u_mm',
  ].join(',');
  const rows = result.pointEvaluations.map((p) =>
    [
      `"${p.id.replace(/"/g, '""')}"`,
      `"${p.name.replace(/"/g, '""')}"`,
      p.lat.toFixed(5),
      p.lon.toFixed(5),
      p.depthKm.toFixed(2),
      p.strikeDeg.toFixed(1),
      p.dipDeg.toFixed(1),
      p.rakeDeg.toFixed(1),
      p.muEffective.toFixed(3),
      p.deltaShearKPa.toFixed(3),
      p.deltaNormalKPa.toFixed(3),
      p.deltaCfsKPa.toFixed(3),
      `"${p.stressRegimeClass}"`,
      p.nearFaultSingular ? 'TRUE' : 'FALSE',
      p.displacementMm.e.toFixed(2),
      p.displacementMm.n.toFixed(2),
      p.displacementMm.u.toFixed(2),
    ].join(',')
  );
  return [
    `# Solver: ${result.solverIdentity} (${result.solverVersion})`,
    `# Status: ${result.status} | Convention: ${result.signConvention}`,
    `# Computed UTC: ${result.computedAtUtc}`,
    header,
    ...rows,
  ].join('\n');
}

export function exportCoulombReproducibleJson(params: {
  event: EQPEvent;
  sourceModel: SourceFaultModel;
  receiverModel: ReceiverFaultModel;
  elasticParams: ElasticParameters;
  result: CoulombCalculationResult | null;
  isStale: boolean;
}): string {
  return JSON.stringify(
    {
      schema: 'eqp-modern.coulomb-stress-analysis.v1',
      exportedAtUtc: new Date().toISOString(),
      disclaimer:
        'Static elastic Coulomb failure stress change (Delta-CFS) evaluates static stress transfer on specified receiver planes; it is NOT an earthquake probability, forecast, or deterministic prediction.',
      isStale: params.isStale,
      referenceEvent: {
        id: params.event.id,
        bulletinNo: params.event.bulletinNo,
        originTime: `${params.event.originDateGmt}T${params.event.originTimeGmt}Z`,
        lat: params.event.lat,
        lon: params.event.lon,
        depthKm: params.event.depthKm,
        magnitudeScale: params.event.preferredScale,
        magnitude:
          params.event.preferredScale === 'Ms'
            ? params.event.ms
            : params.event.preferredScale === 'Mb'
              ? params.event.mb
              : params.event.md,
      },
      elasticParameters: params.elasticParams,
      sourceModel: params.sourceModel,
      receiverModel: params.receiverModel,
      calculationResult: params.result,
    },
    null,
    2
  );
}
