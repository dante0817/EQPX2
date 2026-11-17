import {
  type EQPEvent,
  isEventUnlocated,
  PICK_QUALITY_WEIGHTS,
  type Polarity,
  type StationPick,
} from '../data/eqpData.ts';

export interface Vec3 {
  n: number;
  e: number;
  d: number;
}

export interface NodalPlane {
  strike: number;
  dip: number;
  rake: number;
}

export interface PrincipalAxis {
  trend: number;
  plunge: number;
  vec: Vec3;
}

export type MechanismClass =
  | 'Normal'
  | 'Reverse / Thrust'
  | 'Strike-Slip (Left-Lateral)'
  | 'Strike-Slip (Right-Lateral)'
  | 'Strike-Slip'
  | 'Oblique Normal'
  | 'Oblique Reverse';

export type FocalInversionStatus = 'computed' | 'insufficient-data';
export type CoverageGrade = 'Good' | 'Moderate' | 'Poor';
export type AmbiguityGrade = 'Low' | 'Moderate' | 'High';

export type PickValidationStatus =
  | 'usable'
  | 'excluded-accepted'
  | 'excluded-research'
  | 'missing-polarity'
  | 'invalid-geometry';

export interface ValidatedPolarityPick {
  pick: StationPick;
  status: PickValidationStatus;
  statusReason: string;
  polaritySign: 1 | -1 | null;
  weight: number;
  ray: Vec3 | null;
  plungeDeg: number | null;
  lowerAzimDeg: number | null;
  projX: number | null;
  projY: number | null;
  isUpgoing: boolean;
  toaProvenance: string;
}

export interface EvaluatedPolarityPick extends ValidatedPolarityPick {
  polaritySign: 1 | -1;
  ray: Vec3;
  plungeDeg: number;
  lowerAzimDeg: number;
  projX: number;
  projY: number;
  radiationAmplitude: number;
  predictedSign: 1 | -1;
  isMatched: boolean;
  isNearNodal: boolean;
}

export interface CandidateSolutionSummary {
  plane1: NodalPlane;
  plane2: NodalPlane;
  pAxis: PrincipalAxis;
  tAxis: PrincipalAxis;
  bAxis: PrincipalAxis;
  mechanismClass: MechanismClass;
  matchedCount: number;
  totalCount: number;
  weightedMisfit: number;
  agreementPct: number;
  kaganFromPrimaryDeg: number;
}

export interface FocalMechanismQuality {
  usableCount: number;
  totalPicksCount: number;
  compressionCount: number;
  dilatationCount: number;
  matchedCount: number;
  discrepantCount: number;
  nearNodalCount: number;
  agreementPct: number;
  weightedAgreementPct: number;
  weightedMisfitPct: number;
  maxAzimuthalGapDeg: number;
  occupiedQuadrants: number;
  maxRaySpreadDeg: number;
  coverageGrade: CoverageGrade;
  acceptableSolutionCount: number;
  meanKaganSpreadDeg: number;
  maxKaganSpreadDeg: number;
  ambiguityGrade: AmbiguityGrade;
}

export interface FocalMechanismAnalysis {
  status: FocalInversionStatus;
  insufficientReasons: string[];
  isExperimental: true;
  methodologyLabel: string;
  conventionNote: string;
  toaProvenanceSummary: string;
  inputFingerprint: string;
  plane1: NodalPlane | null;
  plane2: NodalPlane | null;
  pAxis: PrincipalAxis | null;
  tAxis: PrincipalAxis | null;
  bAxis: PrincipalAxis | null;
  nVec: Vec3 | null;
  sVec: Vec3 | null;
  mechanismClass: MechanismClass | null;
  interpretation: string;
  limitations: string[];
  quality: FocalMechanismQuality;
  allPicks: ValidatedPolarityPick[];
  evaluatedPicks: EvaluatedPolarityPick[];
  alternativeSolutions: CandidateSolutionSummary[];
}

export interface ManualMechanismEvaluation {
  plane1: NodalPlane;
  plane2: NodalPlane;
  pAxis: PrincipalAxis;
  tAxis: PrincipalAxis;
  bAxis: PrincipalAxis;
  nVec: Vec3;
  sVec: Vec3;
  mechanismClass: MechanismClass;
  evaluatedPicks: EvaluatedPolarityPick[];
  matchedCount: number;
  totalCount: number;
  nearNodalCount: number;
  agreementPct: number;
  weightedAgreementPct: number;
  weightedMisfitPct: number;
}

export const MIN_USABLE_POLARITIES = 6;
export const NEAR_NODAL_AMPLITUDE_THRESHOLD = 0.12;

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

export function normalizeAngle360(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  const m = deg % 360;
  return m < 0 ? m + 360 : m;
}

export function normalizeRake(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  let r = (((deg + 180) % 360) + 360) % 360 - 180;
  if (r === -180) r = 180;
  return r;
}

export function dotVec(a: Vec3, b: Vec3): number {
  return a.n * b.n + a.e * b.e + a.d * b.d;
}

export function crossVec(a: Vec3, b: Vec3): Vec3 {
  return {
    n: a.e * b.d - a.d * b.e,
    e: a.d * b.n - a.n * b.d,
    d: a.n * b.e - a.e * b.n,
  };
}

export function normalizeVec(v: Vec3): Vec3 {
  const len = Math.hypot(v.n, v.e, v.d);
  if (!Number.isFinite(len) || len < 1e-12) {
    return { n: 0, e: 0, d: 1 };
  }
  return { n: v.n / len, e: v.e / len, d: v.d / len };
}

/**
 * Converts strike/dip/rake in Aki & Richards (2002) NED convention
 * (strike clockwise from North, dip 0..90 down to right of strike,
 * rake -180..180 slip of hanging wall relative to footwall)
 * into unit fault normal (n) and slip vector (s).
 */
export function planeToVectors(
  strikeDeg: number,
  dipDeg: number,
  rakeDeg: number
): { n: Vec3; s: Vec3 } {
  const sRad = normalizeAngle360(strikeDeg) * DEG2RAD;
  const dRad = Math.max(0, Math.min(90, dipDeg)) * DEG2RAD;
  const lRad = normalizeRake(rakeDeg) * DEG2RAD;

  const n: Vec3 = {
    n: -Math.sin(dRad) * Math.sin(sRad),
    e: Math.sin(dRad) * Math.cos(sRad),
    d: -Math.cos(dRad),
  };

  const s: Vec3 = {
    n: Math.cos(lRad) * Math.cos(sRad) + Math.cos(dRad) * Math.sin(lRad) * Math.sin(sRad),
    e: Math.cos(lRad) * Math.sin(sRad) - Math.cos(dRad) * Math.sin(lRad) * Math.cos(sRad),
    d: -Math.sin(dRad) * Math.sin(lRad),
  };

  return { n: normalizeVec(n), s: normalizeVec(s) };
}

/**
 * Recovers Aki & Richards (2002) strike, dip, rake from normal (n) and slip (s) vectors.
 * Handles horizontal (dip=0) and vertical (dip=90) edge cases cleanly.
 */
export function vectorsToStrikeDipRake(nIn: Vec3, sIn: Vec3): NodalPlane {
  let n = normalizeVec(nIn);
  let s = normalizeVec(sIn);
  if (n.d > 0) {
    n = { n: -n.n, e: -n.e, d: -n.d };
    s = { n: -s.n, e: -s.e, d: -s.d };
  }

  const dipRaw = Math.acos(Math.max(-1, Math.min(1, -n.d))) * RAD2DEG;
  if (dipRaw < 0.05) {
    // Horizontal plane: define strike along slip direction so rake=0
    const horizLen = Math.hypot(s.n, s.e);
    const strikeHoriz =
      horizLen > 1e-6 ? normalizeAngle360(Math.atan2(s.e, s.n) * RAD2DEG) : 0;
    return {
      strike: Math.round(strikeHoriz) % 360,
      dip: 0,
      rake: 0,
    };
  }

  const strikeRaw = normalizeAngle360(Math.atan2(-n.n, n.e) * RAD2DEG);
  const strikeRad = strikeRaw * DEG2RAD;
  const dipRad = dipRaw * DEG2RAD;

  const strikeVec: Vec3 = {
    n: Math.cos(strikeRad),
    e: Math.sin(strikeRad),
    d: 0,
  };
  const dipVec: Vec3 = {
    n: -Math.cos(dipRad) * Math.sin(strikeRad),
    e: Math.cos(dipRad) * Math.cos(strikeRad),
    d: Math.sin(dipRad),
  };

  const cosL = dotVec(s, strikeVec);
  const sinL = -dotVec(s, dipVec);
  const rakeRaw = normalizeRake(Math.atan2(sinL, cosL) * RAD2DEG);

  return {
    strike: Math.round(strikeRaw) % 360,
    dip: Math.round(Math.max(0, Math.min(90, dipRaw))),
    rake: Math.round(rakeRaw),
  };
}

export function vecToTrendPlunge(vIn: Vec3): PrincipalAxis {
  let v = normalizeVec(vIn);
  if (v.d < 0) {
    v = { n: -v.n, e: -v.e, d: -v.d };
  }
  const plunge = Math.asin(Math.max(-1, Math.min(1, v.d))) * RAD2DEG;
  const horiz = Math.hypot(v.n, v.e);
  const trend = horiz > 1e-7 ? normalizeAngle360(Math.atan2(v.e, v.n) * RAD2DEG) : 0;
  return {
    trend: Math.round(trend) % 360,
    plunge: Math.round(plunge),
    vec: v,
  };
}

export function computePrincipalAxes(
  n: Vec3,
  s: Vec3
): { pAxis: PrincipalAxis; tAxis: PrincipalAxis; bAxis: PrincipalAxis } {
  const pVec = normalizeVec({ n: n.n - s.n, e: n.e - s.e, d: n.d - s.d });
  const tVec = normalizeVec({ n: n.n + s.n, e: n.e + s.e, d: n.d + s.d });
  const bVec = normalizeVec(crossVec(n, s));
  return {
    pAxis: vecToTrendPlunge(pVec),
    tAxis: vecToTrendPlunge(tVec),
    bAxis: vecToTrendPlunge(bVec),
  };
}

/**
 * Exact Kagan (1991) minimum 3D rotation angle (0..120 deg) between two double-couple orientations.
 * Identical nodal plane pairs (including swapped auxiliary plane) yield 0 deg.
 */
export function computeKaganAngleDeg(planeA: NodalPlane, planeB: NodalPlane): number {
  const a = planeToVectors(planeA.strike, planeA.dip, planeA.rake);
  const b = planeToVectors(planeB.strike, planeB.dip, planeB.rake);

  const t1 = normalizeVec({ n: a.n.n + a.s.n, e: a.n.e + a.s.e, d: a.n.d + a.s.d });
  const p1 = normalizeVec({ n: a.n.n - a.s.n, e: a.n.e - a.s.e, d: a.n.d - a.s.d });
  const b1 = normalizeVec(crossVec(t1, p1));

  const t2 = normalizeVec({ n: b.n.n + b.s.n, e: b.n.e + b.s.e, d: b.n.d + b.s.d });
  const p2 = normalizeVec({ n: b.n.n - b.s.n, e: b.n.e - b.s.e, d: b.n.d - b.s.d });
  const b2 = normalizeVec(crossVec(t2, p2));

  const dt = dotVec(t1, t2);
  const dp = dotVec(p1, p2);
  const db = dotVec(b1, b2);

  const traces = [
    dt + dp + db,
    -dt - dp + db,
    -dt + dp - db,
    dt - dp - db,
  ];
  const maxTrace = Math.max(...traces);
  const cosTheta = Math.max(-1, Math.min(1, (maxTrace - 1) / 2));
  return Number((Math.acos(cosTheta) * RAD2DEG).toFixed(1));
}

/**
 * Equal-area (Schmidt) lower-hemisphere projection.
 * x is East [-1, 1], y is North [-1, 1].
 */
export function schmidtProjectLower(ray: Vec3): { x: number; y: number } {
  const lower = ray.d < 0 ? { n: -ray.n, e: -ray.e, d: -ray.d } : ray;
  const d = Math.max(0, Math.min(1, lower.d));
  const horiz = Math.hypot(lower.n, lower.e);
  if (horiz < 1e-8) return { x: 0, y: 0 };
  const r = Math.sqrt(Math.max(0, 1 - d));
  return {
    x: r * (lower.e / horiz),
    y: r * (lower.n / horiz),
  };
}

/**
 * Generates ordered [projX, projY] points along the lower-hemisphere great-circle nodal plane trace.
 */
export function buildNodalPlaneProjectionPoints(
  strikeDeg: number,
  dipDeg: number,
  steps = 72
): Array<{ x: number; y: number }> {
  const { n } = planeToVectors(strikeDeg, dipDeg, 0);
  const sRad = normalizeAngle360(strikeDeg) * DEG2RAD;
  const u: Vec3 = { n: Math.cos(sRad), e: Math.sin(sRad), d: 0 };
  // u × n has d = +sin(dip) >= 0, guaranteeing continuous lower-hemisphere trace from strike to anti-strike
  const vDown = normalizeVec(crossVec(u, n));

  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * Math.PI;
    const raw: Vec3 = {
      n: u.n * Math.cos(theta) + vDown.n * Math.sin(theta),
      e: u.e * Math.cos(theta) + vDown.e * Math.sin(theta),
      d: Math.max(0, u.d * Math.cos(theta) + vDown.d * Math.sin(theta)),
    };
    pts.push(schmidtProjectLower(raw));
  }
  return pts;
}

export function buildNodalPlaneSvgPath(
  strikeDeg: number,
  dipDeg: number,
  cx: number,
  cy: number,
  radius: number,
  steps = 72
): string {
  const pts = buildNodalPlaneProjectionPoints(strikeDeg, dipDeg, steps);
  return pts
    .map((p, idx) => {
      const px = cx + p.x * radius;
      const py = cy - p.y * radius;
      return `${idx === 0 ? 'M' : 'L'} ${px.toFixed(2)} ${py.toFixed(2)}`;
    })
    .join(' ');
}

export function parsePolaritySign(polarity: Polarity | string): 1 | -1 | null {
  const norm = String(polarity ?? '').trim().toLowerCase();
  if (norm === 'c' || norm === '+') return 1;
  if (norm === 'd' || norm === '-') return -1;
  return null;
}

/**
 * Converts EQP ray geometry (toa in 0..180 where 0=down, 180=up; azim 0..360 clockwise from N)
 * into a lower-hemisphere unit ray vector.
 */
export function rayFromToaAndAzimuth(toaDeg: number, azimDeg: number): {
  ray: Vec3;
  plungeDeg: number;
  lowerAzimDeg: number;
  isUpgoing: boolean;
} {
  const isUpgoing = toaDeg > 90;
  const ih = isUpgoing ? 180 - toaDeg : toaDeg;
  const az = isUpgoing ? normalizeAngle360(azimDeg + 180) : normalizeAngle360(azimDeg);
  const ihRad = ih * DEG2RAD;
  const azRad = az * DEG2RAD;
  const ray = normalizeVec({
    n: Math.sin(ihRad) * Math.cos(azRad),
    e: Math.sin(ihRad) * Math.sin(azRad),
    d: Math.cos(ihRad),
  });
  return {
    ray,
    plungeDeg: Number((90 - ih).toFixed(1)),
    lowerAzimDeg: Number(az.toFixed(1)),
    isUpgoing,
  };
}

export function classifyMechanism(
  plane1: NodalPlane,
  plane2: NodalPlane,
  pAxis: PrincipalAxis,
  tAxis: PrincipalAxis
): MechanismClass {
  // Pure/dominant regimes from P/T plunges (Zoback 1992) and average rake compatibility
  if (tAxis.plunge >= 52 && pAxis.plunge <= 35) {
    return 'Reverse / Thrust';
  }
  if (pAxis.plunge >= 52 && tAxis.plunge <= 35) {
    return 'Normal';
  }

  const r1 = normalizeRake(plane1.rake);
  const r2 = normalizeRake(plane2.rake);
  const isStrikeSlipRake = (r: number) => Math.abs(r) <= 30 || Math.abs(r) >= 150;

  if (pAxis.plunge < 40 && tAxis.plunge < 40 && (isStrikeSlipRake(r1) || isStrikeSlipRake(r2))) {
    if (Math.abs(r1) <= 30) return 'Strike-Slip (Left-Lateral)';
    if (Math.abs(r1) >= 150) return 'Strike-Slip (Right-Lateral)';
    return 'Strike-Slip';
  }

  // Oblique or moderately plunging regimes
  const avgRakeSign = (r1 >= 0 ? 1 : -1) + (r2 >= 0 ? 1 : -1);
  if (avgRakeSign > 0 || tAxis.plunge > pAxis.plunge + 8) {
    if (Math.abs(r1) >= 60 && Math.abs(r1) <= 120) return 'Reverse / Thrust';
    return 'Oblique Reverse';
  }
  if (avgRakeSign < 0 || pAxis.plunge > tAxis.plunge + 8) {
    if (Math.abs(r1) >= 60 && Math.abs(r1) <= 120) return 'Normal';
    return 'Oblique Normal';
  }
  return r1 >= 0 ? 'Oblique Reverse' : 'Oblique Normal';
}

export function buildFocalInputFingerprint(
  event: EQPEvent,
  researchExcludedIds: ReadonlySet<string> = new Set()
): string {
  const metaPart = event.locationMetadata
    ? `${event.locationMetadata.modelId}:${event.locationMetadata.solver}:${event.locationMetadata.adoptedAt ?? ''}`
    : 'legacy';
  const picksPart = event.picks
    .map(
      (p) =>
        `${p.id}|${p.sta}|${p.polarity}|${p.quality}|${p.pExcluded ? 1 : 0}|${researchExcludedIds.has(p.id) ? 1 : 0}|${p.toa}|${p.azim}|${p.delta}`
    )
    .join(';');
  return `${event.id}::${event.originDateGmt} ${event.originTimeGmt}::${event.lat.toFixed(4)},${event.lon.toFixed(4)},${event.depthKm.toFixed(2)}::${event.iterations}::${metaPart}::${picksPart}`;
}

export function getToaProvenanceLabel(event: EQPEvent): string {
  const meta = event.locationMetadata;
  if (!meta) {
    return 'Stored / sample pick TOA & azimuth (unverified vs. PLOTTER1.EXE; no active relocation metadata)';
  }
  return `1D ${meta.modelName} (${meta.modelVersion}) table dT/dΔ & dT/dZ derivatives via ${meta.solver} (not PLOTTER1.EXE or 3D local crust)`;
}

export function validateFocalMechanismPicks(
  event: EQPEvent,
  researchExcludedIds: ReadonlySet<string> = new Set()
): ValidatedPolarityPick[] {
  const baseProv = getToaProvenanceLabel(event);

  return event.picks.map((pick) => {
    const polaritySign = parsePolaritySign(pick.polarity);
    const weight = PICK_QUALITY_WEIGHTS[pick.quality]?.weight ?? 0.5;

    if (pick.pExcluded) {
      return {
        pick,
        status: 'excluded-accepted',
        statusReason: 'Excluded (*) in accepted EQP pick table',
        polaritySign,
        weight,
        ray: null,
        plungeDeg: null,
        lowerAzimDeg: null,
        projX: null,
        projY: null,
        isUpgoing: false,
        toaProvenance: baseProv,
      };
    }

    if (researchExcludedIds.has(pick.id)) {
      return {
        pick,
        status: 'excluded-research',
        statusReason: 'Excluded in Research focal table (read-only override)',
        polaritySign,
        weight,
        ray: null,
        plungeDeg: null,
        lowerAzimDeg: null,
        projX: null,
        projY: null,
        isUpgoing: false,
        toaProvenance: baseProv,
      };
    }

    if (polaritySign === null) {
      return {
        pick,
        status: 'missing-polarity',
        statusReason: 'No P-wave first-motion polarity assigned (c, d, +, -)',
        polaritySign: null,
        weight,
        ray: null,
        plungeDeg: null,
        lowerAzimDeg: null,
        projX: null,
        projY: null,
        isUpgoing: false,
        toaProvenance: baseProv,
      };
    }

    const validToa =
      Number.isFinite(pick.toa) && pick.toa > 0 && pick.toa < 180;
    const validAzim =
      Number.isFinite(pick.azim) && pick.azim >= 0 && pick.azim <= 360;
    const uncomputedZero =
      pick.toa === 0 && pick.azim === 0 && pick.delta === 0;

    if (!validToa || !validAzim || uncomputedZero) {
      return {
        pick,
        status: 'invalid-geometry',
        statusReason: !validToa || uncomputedZero
          ? `Invalid or uncomputed takeoff angle (TOA=${String(pick.toa)}°; expected 0° < TOA < 180°)`
          : `Invalid station azimuth (Azim=${String(pick.azim)}°)`,
        polaritySign,
        weight,
        ray: null,
        plungeDeg: null,
        lowerAzimDeg: null,
        projX: null,
        projY: null,
        isUpgoing: false,
        toaProvenance: 'Missing / invalid ray geometry',
      };
    }

    const { ray, plungeDeg, lowerAzimDeg, isUpgoing } = rayFromToaAndAzimuth(
      pick.toa,
      pick.azim
    );
    const { x, y } = schmidtProjectLower(ray);

    return {
      pick,
      status: 'usable',
      statusReason: isUpgoing
        ? 'Valid upgoing ray projected to lower antipode'
        : 'Valid downgoing ray on lower hemisphere',
      polaritySign,
      weight,
      ray,
      plungeDeg,
      lowerAzimDeg,
      projX: x,
      projY: y,
      isUpgoing,
      toaProvenance: baseProv,
    };
  });
}

function evaluateCandidateOnPicks(
  strike: number,
  dip: number,
  rake: number,
  usablePicks: ValidatedPolarityPick[]
): {
  plane1: NodalPlane;
  plane2: NodalPlane;
  pAxis: PrincipalAxis;
  tAxis: PrincipalAxis;
  bAxis: PrincipalAxis;
  nVec: Vec3;
  sVec: Vec3;
  mechanismClass: MechanismClass;
  evaluatedPicks: EvaluatedPolarityPick[];
  matchedCount: number;
  nearNodalCount: number;
  weightedMisfit: number;
  weightedAgreement: number;
  totalWeight: number;
  marginScore: number;
} {
  const { n, s } = planeToVectors(strike, dip, rake);
  const plane1: NodalPlane = {
    strike: Math.round(normalizeAngle360(strike)) % 360,
    dip: Math.round(Math.max(0, Math.min(90, dip))),
    rake: Math.round(normalizeRake(rake)),
  };
  const plane2 = vectorsToStrikeDipRake(s, n);
  const { pAxis, tAxis, bAxis } = computePrincipalAxes(n, s);
  const mechanismClass = classifyMechanism(plane1, plane2, pAxis, tAxis);

  let matchedCount = 0;
  let nearNodalCount = 0;
  let totalWeight = 0;
  let misfitWeight = 0;
  let matchedWeight = 0;
  let marginScore = 0;

  const evaluatedPicks: EvaluatedPolarityPick[] = usablePicks.map((item) => {
    const ray = item.ray!;
    const polaritySign = item.polaritySign!;
    const amp = 2 * dotVec(ray, n) * dotVec(ray, s);
    const predictedSign: 1 | -1 = amp >= 0 ? 1 : -1;
    const isMatched = predictedSign === polaritySign;
    const isNearNodal = Math.abs(amp) < NEAR_NODAL_AMPLITUDE_THRESHOLD;

    totalWeight += item.weight;
    if (isNearNodal) nearNodalCount += 1;

    if (isMatched) {
      matchedCount += 1;
      matchedWeight += item.weight;
      marginScore += item.weight * Math.min(0.4, Math.abs(amp));
    } else {
      // Near-nodal discrepant picks carry reduced misfit penalty (analogous to smooth nodal weighting)
      const nodalFactor = isNearNodal ? 0.35 : 1.0;
      misfitWeight += item.weight * nodalFactor;
    }

    return {
      ...item,
      polaritySign,
      ray,
      plungeDeg: item.plungeDeg!,
      lowerAzimDeg: item.lowerAzimDeg!,
      projX: item.projX!,
      projY: item.projY!,
      radiationAmplitude: Number(amp.toFixed(3)),
      predictedSign,
      isMatched,
      isNearNodal,
    };
  });

  const weightedMisfit = totalWeight > 0 ? misfitWeight / totalWeight : 1;
  const weightedAgreement = totalWeight > 0 ? matchedWeight / totalWeight : 0;

  return {
    plane1,
    plane2,
    pAxis,
    tAxis,
    bAxis,
    nVec: n,
    sVec: s,
    mechanismClass,
    evaluatedPicks,
    matchedCount,
    nearNodalCount,
    weightedMisfit,
    weightedAgreement,
    totalWeight,
    marginScore,
  };
}

function computeFocalSphereCoverage(usablePicks: ValidatedPolarityPick[]): {
  maxAzimuthalGapDeg: number;
  occupiedQuadrants: number;
  maxRaySpreadDeg: number;
  coverageGrade: CoverageGrade;
} {
  if (usablePicks.length === 0) {
    return {
      maxAzimuthalGapDeg: 360,
      occupiedQuadrants: 0,
      maxRaySpreadDeg: 0,
      coverageGrade: 'Poor',
    };
  }

  const azims = usablePicks
    .map((p) => p.lowerAzimDeg ?? 0)
    .sort((a, b) => a - b);
  let maxGap = 360;
  if (azims.length === 1) {
    maxGap = 360;
  } else {
    maxGap = 0;
    for (let i = 0; i < azims.length - 1; i++) {
      maxGap = Math.max(maxGap, azims[i + 1] - azims[i]);
    }
    maxGap = Math.max(maxGap, 360 - azims[azims.length - 1] + azims[0]);
  }

  const quadSet = new Set<number>();
  for (const a of azims) {
    quadSet.add(Math.floor(normalizeAngle360(a) / 90) % 4);
  }

  let maxSpread = 0;
  for (let i = 0; i < usablePicks.length; i++) {
    for (let j = i + 1; j < usablePicks.length; j++) {
      const ra = usablePicks[i].ray!;
      const rb = usablePicks[j].ray!;
      const ang =
        Math.acos(Math.max(-1, Math.min(1, Math.abs(dotVec(ra, rb))))) * RAD2DEG;
      if (ang > maxSpread) maxSpread = ang;
    }
  }

  let coverageGrade: CoverageGrade = 'Poor';
  if (usablePicks.length >= 8 && maxGap <= 150 && quadSet.size >= 3) {
    coverageGrade = 'Good';
  } else if (usablePicks.length >= 6 && maxGap <= 220 && quadSet.size >= 2) {
    coverageGrade = 'Moderate';
  }

  return {
    maxAzimuthalGapDeg: Math.round(maxGap),
    occupiedQuadrants: quadSet.size,
    maxRaySpreadDeg: Number(maxSpread.toFixed(1)),
    coverageGrade,
  };
}

/**
 * Evaluates a user-specified strike/dip/rake plane against current valid picks
 * for manual focal mechanism exploration (strictly separate from fitted results).
 */
export function evaluateManualMechanism(
  event: EQPEvent,
  strike: number,
  dip: number,
  rake: number,
  researchExcludedIds: ReadonlySet<string> = new Set()
): ManualMechanismEvaluation {
  const allPicks = validateFocalMechanismPicks(event, researchExcludedIds);
  const usable = allPicks.filter((p) => p.status === 'usable');
  const res = evaluateCandidateOnPicks(strike, dip, rake, usable);
  const totalCount = usable.length;
  return {
    plane1: res.plane1,
    plane2: res.plane2,
    pAxis: res.pAxis,
    tAxis: res.tAxis,
    bAxis: res.bAxis,
    nVec: res.nVec,
    sVec: res.sVec,
    mechanismClass: res.mechanismClass,
    evaluatedPicks: res.evaluatedPicks,
    matchedCount: res.matchedCount,
    totalCount,
    nearNodalCount: res.nearNodalCount,
    agreementPct: totalCount > 0 ? Math.round((res.matchedCount / totalCount) * 100) : 0,
    weightedAgreementPct: Math.round(res.weightedAgreement * 100),
    weightedMisfitPct: Math.round(res.weightedMisfit * 100),
  };
}

/**
 * Performs unbiased double-couple P-wave first-motion inversion.
 * Does NOT use fault/trench names or generate fake mechanisms when data are insufficient.
 */
export function invertFocalMechanism(
  event: EQPEvent,
  researchExcludedIds: ReadonlySet<string> = new Set()
): FocalMechanismAnalysis {
  const allPicks = validateFocalMechanismPicks(event, researchExcludedIds);
  const usable = allPicks.filter((p) => p.status === 'usable');
  const compressionCount = usable.filter((p) => p.polaritySign === 1).length;
  const dilatationCount = usable.filter((p) => p.polaritySign === -1).length;
  const coverage = computeFocalSphereCoverage(usable);
  const fingerprint = buildFocalInputFingerprint(event, researchExcludedIds);
  const toaProvenanceSummary = getToaProvenanceLabel(event);

  const insufficientReasons: string[] = [];
  if (isEventUnlocated(event)) {
    insufficientReasons.push('Event hypocenter is unlocated (no constrained origin/coordinates).');
  }
  if (usable.length < MIN_USABLE_POLARITIES) {
    insufficientReasons.push(
      `Only ${usable.length} usable first-motion polarity observation${usable.length === 1 ? '' : 's'} available (minimum ${MIN_USABLE_POLARITIES} required to constrain 3 double-couple degrees of freedom).`
    );
  }
  if (usable.length > 0 && (compressionCount === 0 || dilatationCount === 0)) {
    insufficientReasons.push(
      `All ${usable.length} usable picks share a single polarity (${compressionCount > 0 ? 'Compression only' : 'Dilatation only'}); nodal planes cannot be constrained without both compressional and dilatational quadrants.`
    );
  }
  if (usable.length >= MIN_USABLE_POLARITIES && coverage.maxRaySpreadDeg < 25) {
    insufficientReasons.push(
      `Usable focal-sphere rays span only ${coverage.maxRaySpreadDeg}° (< 25°), leaving nodal orientation degenerate.`
    );
  }

  const baseLimitations = [
    'Nodal-plane ambiguity: A double-couple beachball alone cannot distinguish the true fault plane from the orthogonal auxiliary plane without independent geological, aftershock-alignment, or finite-fault data.',
    `Takeoff angle provenance: ${toaProvenanceSummary}.`,
    'Methodology status: Experimental deterministic grid-search polarity inversion (uses HASH-style misfit and near-nodal concepts as scientific reference only; not a verified HASH Monte-Carlo perturbation engine).',
  ];

  if (insufficientReasons.length > 0) {
    return {
      status: 'insufficient-data',
      insufficientReasons,
      isExperimental: true,
      methodologyLabel: 'Experimental Double-Couple Grid Search (HASH-referenced)',
      conventionNote: 'Aki & Richards (2002) NED strike/dip/rake · Lower-hemisphere equal-area projection',
      toaProvenanceSummary,
      inputFingerprint: fingerprint,
      plane1: null,
      plane2: null,
      pAxis: null,
      tAxis: null,
      bAxis: null,
      nVec: null,
      sVec: null,
      mechanismClass: null,
      interpretation:
        'Insufficient Data: Double-couple inversion withheld rather than fabricating an unconstrained mechanism. Assign additional well-distributed P-wave polarities (c/+/d/-) or inspect hypothetical planes manually.',
      limitations: baseLimitations,
      quality: {
        usableCount: usable.length,
        totalPicksCount: event.picks.length,
        compressionCount,
        dilatationCount,
        matchedCount: 0,
        discrepantCount: 0,
        nearNodalCount: 0,
        agreementPct: 0,
        weightedAgreementPct: 0,
        weightedMisfitPct: 0,
        maxAzimuthalGapDeg: coverage.maxAzimuthalGapDeg,
        occupiedQuadrants: coverage.occupiedQuadrants,
        maxRaySpreadDeg: coverage.maxRaySpreadDeg,
        coverageGrade: coverage.coverageGrade,
        acceptableSolutionCount: 0,
        meanKaganSpreadDeg: 0,
        maxKaganSpreadDeg: 0,
        ambiguityGrade: 'High',
      },
      allPicks,
      evaluatedPicks: [],
      alternativeSolutions: [],
    };
  }

  // Fast compact ray/sign/weight arrays for grid search
  const rayItems = usable.map((u) => ({
    ray: u.ray!,
    sign: u.polaritySign!,
    weight: u.weight,
  }));
  const totalWeight = rayItems.reduce((acc, it) => acc + it.weight, 0) || 1;

  const scoreFast = (
    strike: number,
    dip: number,
    rake: number
  ): { misfit: number; margin: number } => {
    const { n, s } = planeToVectors(strike, dip, rake);
    let misfitW = 0;
    let margin = 0;
    for (let i = 0; i < rayItems.length; i++) {
      const it = rayItems[i];
      const amp =
        2 *
        (it.ray.n * n.n + it.ray.e * n.e + it.ray.d * n.d) *
        (it.ray.n * s.n + it.ray.e * s.e + it.ray.d * s.d);
      const pred = amp >= 0 ? 1 : -1;
      if (pred === it.sign) {
        margin += it.weight * Math.min(0.4, Math.abs(amp));
      } else {
        const factor = Math.abs(amp) < NEAR_NODAL_AMPLITUDE_THRESHOLD ? 0.35 : 1.0;
        misfitW += it.weight * factor;
      }
    }
    return {
      misfit: misfitW / totalWeight,
      margin: margin / totalWeight,
    };
  };

  // Stage 1: Global coarse grid search (no fault-name bias; dip 10..90, strike 0..350, rake -165..180)
  interface GridCandidate {
    strike: number;
    dip: number;
    rake: number;
    misfit: number;
    margin: number;
  }

  const coarseCandidates: GridCandidate[] = [];
  for (let strike = 0; strike < 360; strike += 12) {
    for (let dip = 10; dip <= 90; dip += 10) {
      for (let rake = -165; rake <= 180; rake += 15) {
        const { misfit, margin } = scoreFast(strike, dip, rake);
        coarseCandidates.push({ strike, dip, rake, misfit, margin });
      }
    }
  }

  coarseCandidates.sort(
    (a, b) => a.misfit - b.misfit || b.margin - a.margin
  );

  // Stage 2: Fine 3-deg refinement around top 18 diverse coarse seeds
  const refinedPool: GridCandidate[] = [];
  const topSeeds = coarseCandidates.slice(0, 18);
  for (const seed of topSeeds) {
    let bestLocal = seed;
    for (let ds = -9; ds <= 9; ds += 3) {
      for (let dd = -6; dd <= 6; dd += 3) {
        for (let dr = -9; dr <= 9; dr += 3) {
          const st = normalizeAngle360(seed.strike + ds);
          const dp = Math.max(5, Math.min(90, seed.dip + dd));
          const rk = normalizeRake(seed.rake + dr);
          const { misfit, margin } = scoreFast(st, dp, rk);
          if (
            misfit < bestLocal.misfit - 1e-6 ||
            (Math.abs(misfit - bestLocal.misfit) <= 1e-6 && margin > bestLocal.margin)
          ) {
            bestLocal = { strike: st, dip: dp, rake: rk, misfit, margin };
          }
        }
      }
    }
    refinedPool.push(bestLocal);
  }

  // Also keep near-optimal coarse candidates within misfit tolerance for ambiguity measurement
  const minMisfit = Math.min(...refinedPool.map((c) => c.misfit));
  const misfitTol = Math.min(0.22, minMisfit + Math.max(0.05, 0.5 / usable.length));

  const poolAll = [...refinedPool, ...coarseCandidates.filter((c) => c.misfit <= misfitTol)];
  poolAll.sort((a, b) => a.misfit - b.misfit || b.margin - a.margin);

  const primarySeed = poolAll[0];
  const primaryEval = evaluateCandidateOnPicks(
    primarySeed.strike,
    primarySeed.dip,
    primarySeed.rake,
    usable
  );

  // Deduplicate acceptable solutions by Kagan angle >= 8 deg (handles nodal-plane equivalence)
  const acceptableEvaluated: CandidateSolutionSummary[] = [];
  for (const cand of poolAll) {
    if (cand.misfit > misfitTol) break;
    const pCand: NodalPlane = {
      strike: Math.round(normalizeAngle360(cand.strike)) % 360,
      dip: Math.round(cand.dip),
      rake: Math.round(normalizeRake(cand.rake)),
    };
    const isDup = acceptableEvaluated.some(
      (ex) => computeKaganAngleDeg(ex.plane1, pCand) < 8
    );
    if (isDup) continue;

    const ev = evaluateCandidateOnPicks(cand.strike, cand.dip, cand.rake, usable);
    const kagan = computeKaganAngleDeg(primaryEval.plane1, ev.plane1);
    acceptableEvaluated.push({
      plane1: ev.plane1,
      plane2: ev.plane2,
      pAxis: ev.pAxis,
      tAxis: ev.tAxis,
      bAxis: ev.bAxis,
      mechanismClass: ev.mechanismClass,
      matchedCount: ev.matchedCount,
      totalCount: usable.length,
      weightedMisfit: ev.weightedMisfit,
      agreementPct: Math.round((ev.matchedCount / usable.length) * 100),
      kaganFromPrimaryDeg: kagan,
    });
    if (acceptableEvaluated.length >= 16) break;
  }

  const alternativeSolutions = acceptableEvaluated.slice(1, 5);
  const kaganValues = acceptableEvaluated.slice(1).map((s) => s.kaganFromPrimaryDeg);
  const meanKaganSpreadDeg =
    kaganValues.length > 0
      ? Number((kaganValues.reduce((a, b) => a + b, 0) / kaganValues.length).toFixed(1))
      : 0;
  const maxKaganSpreadDeg =
    kaganValues.length > 0 ? Math.max(...kaganValues) : 0;

  let ambiguityGrade: AmbiguityGrade = 'Low';
  if (meanKaganSpreadDeg > 30 || maxKaganSpreadDeg > 48 || acceptableEvaluated.length >= 10) {
    ambiguityGrade = 'High';
  } else if (meanKaganSpreadDeg > 15 || maxKaganSpreadDeg > 25 || acceptableEvaluated.length >= 4) {
    ambiguityGrade = 'Moderate';
  }

  const matchedCount = primaryEval.matchedCount;
  const discrepantCount = usable.length - matchedCount;
  const agreementPct = Math.round((matchedCount / usable.length) * 100);
  const weightedAgreementPct = Math.round(primaryEval.weightedAgreement * 100);
  const weightedMisfitPct = Math.round(primaryEval.weightedMisfit * 100);

  const regimeNote =
    `${primaryEval.mechanismClass} mechanism: Nodal Plane 1 (${primaryEval.plane1.strike}°/${primaryEval.plane1.dip}°/${primaryEval.plane1.rake}°) and Auxiliary Plane 2 (${primaryEval.plane2.strike}°/${primaryEval.plane2.dip}°/${primaryEval.plane2.rake}°). ` +
    `P-axis plunges ${primaryEval.pAxis.plunge}° toward ${primaryEval.pAxis.trend}°, T-axis plunges ${primaryEval.tAxis.plunge}° toward ${primaryEval.tAxis.trend}°.`;

  const ambiguityNote =
    acceptableEvaluated.length > 1
      ? ` ${acceptableEvaluated.length} distinct double-couple orientations satisfy polarities within misfit tolerance (mean Kagan spread ${meanKaganSpreadDeg}°; ${ambiguityGrade} ambiguity).`
      : ' Candidate family is tightly clustered around this orientation.';

  return {
    status: 'computed',
    insufficientReasons: [],
    isExperimental: true,
    methodologyLabel: 'Experimental Double-Couple Grid Search (HASH-referenced)',
    conventionNote: 'Aki & Richards (2002) NED strike/dip/rake · Lower-hemisphere equal-area projection',
    toaProvenanceSummary,
    inputFingerprint: fingerprint,
    plane1: primaryEval.plane1,
    plane2: primaryEval.plane2,
    pAxis: primaryEval.pAxis,
    tAxis: primaryEval.tAxis,
    bAxis: primaryEval.bAxis,
    nVec: primaryEval.nVec,
    sVec: primaryEval.sVec,
    mechanismClass: primaryEval.mechanismClass,
    interpretation: regimeNote + ambiguityNote,
    limitations: baseLimitations,
    quality: {
      usableCount: usable.length,
      totalPicksCount: event.picks.length,
      compressionCount,
      dilatationCount,
      matchedCount,
      discrepantCount,
      nearNodalCount: primaryEval.nearNodalCount,
      agreementPct,
      weightedAgreementPct,
      weightedMisfitPct,
      maxAzimuthalGapDeg: coverage.maxAzimuthalGapDeg,
      occupiedQuadrants: coverage.occupiedQuadrants,
      maxRaySpreadDeg: coverage.maxRaySpreadDeg,
      coverageGrade: coverage.coverageGrade,
      acceptableSolutionCount: acceptableEvaluated.length,
      meanKaganSpreadDeg,
      maxKaganSpreadDeg,
      ambiguityGrade,
    },
    allPicks,
    evaluatedPicks: primaryEval.evaluatedPicks,
    alternativeSolutions,
  };
}
