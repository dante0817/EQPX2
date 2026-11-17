import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_EVENTS, type EQPEvent } from '../src/data/eqpData.ts';
import {
  dotVec,
  normalizeVec,
  planeToVectors,
  vectorsToStrikeDipRake,
  type Vec3,
} from '../src/utils/focalMechanism.ts';
import {
  buildHistoricalFocalMechanism,
  type HistoricalEarthquakeRecord,
} from '../src/utils/historicalSeismicity.ts';
import {
  buildStressInputFingerprint,
  classifyStressRegime,
  computeLundTownendShMax,
  computePredictedShearTraction,
  DEFAULT_STRESS_FILTERS,
  DEFAULT_STRESS_INVERSION_CONFIG,
  exportRegionalStressJson,
  formatRegionalStressSummaryText,
  jacobiEigenSymmetric,
  prepareStressMechanisms,
  runRegionalStressInversion,
  type StressTensorComponents,
} from '../src/utils/regionalStress.ts';

function makeRefEvent(overrides?: Partial<EQPEvent>): EQPEvent {
  const base = structuredClone(INITIAL_EVENTS[0]);
  return {
    ...base,
    id: 'ref-stress-test',
    filename: '20191029_0104.EQP',
    originDateGmt: '2019-10-29',
    originTimeGmt: '01:04:44',
    lat: 6.76,
    lon: 125.03,
    depthKm: 14.0,
    iterations: 6,
    ...overrides,
  };
}

/**
 * Generates an exact synthetic deviatoric stress tensor from principal axes
 * (trend1/plunge1 for sigma1, trend3/plunge3 for sigma3 orthogonal) and shape ratio R.
 */
function buildSyntheticTensorFromAxes(
  e1: Vec3,
  e3: Vec3,
  R: number
): { tensor: StressTensorComponents; e1: Vec3; e2: Vec3; e3: Vec3 } {
  const u1 = normalizeVec(e1);
  // Orthogonalize e3 against u1
  const dot13 = dotVec(u1, e3);
  const u3 = normalizeVec({
    n: e3.n - dot13 * u1.n,
    e: e3.e - dot13 * u1.e,
    d: e3.d - dot13 * u1.d,
  });
  const u2 = normalizeVec({
    n: u3.e * u1.d - u3.d * u1.e,
    e: u3.d * u1.n - u3.n * u1.d,
    d: u3.n * u1.e - u3.e * u1.n,
  });

  // Set sigma1 - sigma3 = 1, trace = 0 => s1 + s2 + s3 = 0, (s1-s2)/(s1-s3)=R
  // => s2 = s1 - R, s3 = s1 - 1 => 3*s1 - R - 1 = 0 => s1 = (1 + R)/3
  const s1 = (1 + R) / 3;
  const s2 = s1 - R;
  const s3 = s1 - 1;

  const comp = (a: number, b: number) =>
    s1 * (a === 0 ? u1.n : a === 1 ? u1.e : u1.d) * (b === 0 ? u1.n : b === 1 ? u1.e : u1.d) +
    s2 * (a === 0 ? u2.n : a === 1 ? u2.e : u2.d) * (b === 0 ? u2.n : b === 1 ? u2.e : u2.d) +
    s3 * (a === 0 ? u3.n : a === 1 ? u3.e : u3.d) * (b === 0 ? u3.n : b === 1 ? u3.e : u3.d);

  return {
    tensor: {
      sigmaNN: comp(0, 0),
      sigmaNE: comp(0, 1),
      sigmaND: comp(0, 2),
      sigmaEE: comp(1, 1),
      sigmaED: comp(1, 2),
      sigmaDD: comp(2, 2),
    },
    e1: u1,
    e2: u2,
    e3: u3,
  };
}

/**
 * Generates diverse synthetic earthquake focal mechanisms whose fault planes slip
 * exactly parallel to the resolved shear traction of `trueTensor`.
 * Intentionally swaps half of them to Plane 2 to test nodal-plane ambiguity!
 */
function makeSyntheticMechanismsFromTensor(
  trueTensor: StressTensorComponents,
  planes: Array<{ strike: number; dip: number }>,
  swapHalfToAux = true
): HistoricalEarthquakeRecord[] {
  const records: HistoricalEarthquakeRecord[] = [];
  planes.forEach((pl, idx) => {
    const { n } = planeToVectors(pl.strike, pl.dip, 0);
    const tau = computePredictedShearTraction(trueTensor, n);
    assert.ok(tau.magnitude > 0.05, `Plane ${idx} has near-zero shear traction`);
    const npTrue = vectorsToStrikeDipRake(n, tau.vec);
    const { n: nT, s: sT } = planeToVectors(npTrue.strike, npTrue.dip, npTrue.rake);
    const npAux = vectorsToStrikeDipRake(sT, nT);

    const reported = swapHalfToAux && idx % 2 === 1 ? npAux : npTrue;
    const fm = buildHistoricalFocalMechanism({
      strike1: reported.strike,
      dip1: reported.dip,
      rake1: reported.rake,
      source: 'SYNTH',
      method: 'Wallace-Bott Synthetic',
      provenanceKind: 'Validated',
      quality: 'A',
    });
    assert.ok(fm);

    records.push({
      id: `syn-${idx}`,
      eventId: `SYN-${String(idx + 1).padStart(2, '0')}`,
      originTimeUtc: `2021-01-${String((idx % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
      originTimeMs: Date.UTC(2021, 0, (idx % 28) + 1),
      lat: 6.76 + ((idx % 4) - 1.5) * 0.12,
      lon: 125.03 + (Math.floor(idx / 4) - 1.5) * 0.12,
      depthKm: 12 + (idx % 5) * 2,
      depthStatus: 'known',
      magnitude: 5.2 + (idx % 3) * 0.3,
      magnitudeType: 'Mw',
      dataSource: 'SYNTH',
      catalogVersion: 'v1',
      quality: 'Reviewed',
      locationUncertain: false,
      horizontalErrKm: 1.5,
      depthErrKm: 2.0,
      place: 'Synthetic Test Region',
      sourceReference: 'Synthetic Benchmark',
      retrievedAtUtc: '2021-02-01T00:00:00.000Z',
      focalMechanism: fm,
    });
  });
  return records;
}

const DIVERSE_FAULT_PLANES: Array<{ strike: number; dip: number }> = [
  { strike: 15, dip: 55 },
  { strike: 52, dip: 72 },
  { strike: 88, dip: 42 },
  { strike: 125, dip: 64 },
  { strike: 162, dip: 80 },
  { strike: 198, dip: 48 },
  { strike: 235, dip: 70 },
  { strike: 274, dip: 38 },
  { strike: 310, dip: 62 },
  { strike: 342, dip: 76 },
  { strike: 35, dip: 32 },
  { strike: 145, dip: 50 },
];

function axisAngleDeg(a: Vec3, b: Vec3): number {
  const c = Math.min(1, Math.abs(dotVec(normalizeVec(a), normalizeVec(b))));
  return (Math.acos(c) * 180) / Math.PI;
}

test('Jacobi symmetric eigensolver recovers exact eigenvalues and orthonormal eigenvectors', () => {
  const mat = [
    [4, 1, -2],
    [1, 3, 0],
    [-2, 0, 2],
  ];
  const eig = jacobiEigenSymmetric(mat);
  assert.ok(eig.values[0] >= eig.values[1] && eig.values[1] >= eig.values[2]);
  // Trace preservation: 4 + 3 + 2 = 9
  const trace = eig.values[0] + eig.values[1] + eig.values[2];
  assert.ok(Math.abs(trace - 9) < 1e-10);
  // Orthonormality check
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const d =
        eig.vectors[i][0] * eig.vectors[j][0] +
        eig.vectors[i][1] * eig.vectors[j][1] +
        eig.vectors[i][2] * eig.vectors[j][2];
      assert.ok(Math.abs(d - (i === j ? 1 : 0)) < 1e-10);
    }
  }
});

test('Independent synthetic stress tensor recovery across Strike-Slip, Reverse, Normal, and Oblique regimes with swapped nodal planes', () => {
  const refEvent = makeRefEvent();
  const cases: Array<{
    name: string;
    e1: Vec3;
    e3: Vec3;
    R: number;
    expectedRegime: string;
  }> = [
    {
      name: 'Strike-Slip (NW-SE σ1, NE-SW σ3, R=0.55)',
      e1: { n: 1, e: -1, d: 0.05 }, // ~315 deg subhorizontal
      e3: { n: 1, e: 1, d: 0.05 },  // ~45 deg subhorizontal
      R: 0.55,
      expectedRegime: 'Strike-Slip',
    },
    {
      name: 'Reverse / Thrust (E-W σ1, Vertical σ3, R=0.40)',
      e1: { n: 0.1, e: 1, d: 0.05 },
      e3: { n: 0, e: 0, d: 1 },
      R: 0.40,
      expectedRegime: 'Reverse / Thrust',
    },
    {
      name: 'Normal (Vertical σ1, N-S σ3, R=0.50)',
      e1: { n: 0, e: 0, d: 1 },
      e3: { n: 1, e: 0.15, d: 0.05 },
      R: 0.50,
      expectedRegime: 'Normal',
    },
    {
      name: 'Oblique Strike-Slip / Reverse (R=0.65)',
      e1: { n: 0.85, e: 0.5, d: 0.15 },
      e3: { n: -0.35, e: 0.35, d: 0.87 },
      R: 0.65,
      expectedRegime: 'Reverse',
    },
  ];

  for (const tc of cases) {
    const { tensor, e1, e3 } = buildSyntheticTensorFromAxes(tc.e1, tc.e3, tc.R);
    const records = makeSyntheticMechanismsFromTensor(tensor, DIVERSE_FAULT_PLANES, true);
    const prep = prepareStressMechanisms(records, refEvent, {
      ...DEFAULT_STRESS_FILTERS,
      centerMode: 'all-locations',
    });
    assert.equal(prep.includedItems.length, DIVERSE_FAULT_PLANES.length);

    const res = runRegionalStressInversion(prep, {
      ...DEFAULT_STRESS_INVERSION_CONFIG,
      bootstrapIterations: 100,
      isReferenceBenchmarkRun: true,
    });

    assert.equal(res.status, 'Validated', `${tc.name} should validate, got ${res.status}`);
    assert.ok(res.sigma1 && res.sigma2 && res.sigma3 && res.regime);

    const err1 = axisAngleDeg(res.sigma1.vec, e1);
    const err3 = axisAngleDeg(res.sigma3.vec, e3);
    assert.ok(err1 <= 6, `${tc.name}: σ1 error ${err1.toFixed(1)}° > 6°`);
    assert.ok(err3 <= 6, `${tc.name}: σ3 error ${err3.toFixed(1)}° > 6°`);
    assert.ok(
      Math.abs((res.stressRatioR ?? 0) - tc.R) <= 0.08,
      `${tc.name}: R=${res.stressRatioR} vs truth=${tc.R}`
    );
    assert.ok(
      (res.meanMisfitDeg ?? 99) < 4,
      `${tc.name}: mean misfit ${res.meanMisfitDeg}° unexpectedly high`
    );
    assert.ok(
      res.regime.regimeClass.includes(tc.expectedRegime),
      `${tc.name}: got regime ${res.regime.regimeClass}`
    );

    // Verify swapping ALL plane1/plane2 inputs produces virtually identical result (nodal-plane symmetry)
    const swappedRecords = records.map((r) => ({
      ...r,
      focalMechanism: {
        ...r.focalMechanism!,
        plane1: r.focalMechanism!.plane2,
        plane2: r.focalMechanism!.plane1,
      },
    }));
    const prepSwapped = prepareStressMechanisms(swappedRecords, refEvent, {
      ...DEFAULT_STRESS_FILTERS,
      centerMode: 'all-locations',
    });
    const resSwapped = runRegionalStressInversion(prepSwapped, {
      ...DEFAULT_STRESS_INVERSION_CONFIG,
      bootstrapIterations: 100,
      isReferenceBenchmarkRun: true,
    });
    assert.ok(resSwapped.sigma1 && resSwapped.sigma3);
    assert.ok(axisAngleDeg(res.sigma1.vec, resSwapped.sigma1.vec) <= 2.5);
    assert.ok(axisAngleDeg(res.sigma3.vec, resSwapped.sigma3.vec) <= 2.5);
  }
});

test('Insufficient data gates: single mechanism, < 5 mechanisms, duplicate collapse, and identical orientations', () => {
  const refEvent = makeRefEvent();
  const { tensor } = buildSyntheticTensorFromAxes(
    { n: 1, e: -1, d: 0 },
    { n: 1, e: 1, d: 0 },
    0.5
  );
  const full = makeSyntheticMechanismsFromTensor(tensor, DIVERSE_FAULT_PLANES, false);

  // 1. Single mechanism must be rejected
  const prep1 = prepareStressMechanisms(full.slice(0, 1), refEvent, {
    ...DEFAULT_STRESS_FILTERS,
    centerMode: 'all-locations',
  });
  const res1 = runRegionalStressInversion(prep1);
  assert.equal(res1.status, 'Insufficient Data');
  assert.equal(res1.sigma1, null);

  // 2. 4 mechanisms (< 5) must be rejected
  const prep4 = prepareStressMechanisms(full.slice(0, 4), refEvent, {
    ...DEFAULT_STRESS_FILTERS,
    centerMode: 'all-locations',
  });
  const res4 = runRegionalStressInversion(prep4);
  assert.equal(res4.status, 'Insufficient Data');

  // 3. Cross-source duplicates (5 records representing only 2 independent earthquakes) must collapse to 2 and reject
  const dupSet: HistoricalEarthquakeRecord[] = [
    full[0],
    { ...full[0], id: 'dup-usgs-0', eventId: 'us0', dataSource: 'USGS', lat: full[0].lat + 0.01 },
    { ...full[0], id: 'dup-gcmt-0', eventId: 'gcmt0', dataSource: 'GCMT', originTimeMs: full[0].originTimeMs + 10000 },
    full[1],
    { ...full[1], id: 'dup-usgs-1', eventId: 'us1', dataSource: 'USGS', lon: full[1].lon + 0.01 },
  ];
  const prepDup = prepareStressMechanisms(dupSet, refEvent, {
    ...DEFAULT_STRESS_FILTERS,
    centerMode: 'all-locations',
    autoDeduplicateCrossSource: true,
  });
  assert.equal(prepDup.summary.duplicateCollapsedCount, 3);
  assert.equal(prepDup.summary.independentCount, 2);
  const resDup = runRegionalStressInversion(prepDup);
  assert.equal(resDup.status, 'Insufficient Data');

  // 4. 8 distinct earthquakes at different places/times, but IDENTICAL focal mechanism orientation -> rejected for lack of diversity
  const identicalMechs = Array.from({ length: 8 }, (_, idx) => ({
    ...full[0],
    id: `id-${idx}`,
    eventId: `ID-${idx}`,
    lat: 6.5 + idx * 0.25,
    lon: 124.8 + idx * 0.2,
    originTimeMs: Date.UTC(2020, idx, 1),
  }));
  const prepIdentical = prepareStressMechanisms(identicalMechs, refEvent, {
    ...DEFAULT_STRESS_FILTERS,
    centerMode: 'all-locations',
  });
  const resIdentical = runRegionalStressInversion(prepIdentical);
  assert.equal(resIdentical.status, 'Insufficient Data');
  assert.ok(resIdentical.insufficientReasons.some((r) => /nearly identical|Kagan/i.test(r)));
});

test('Inconsistent/heterogeneous dataset triggers high misfit & Ambiguous status, not Validated', () => {
  const refEvent = makeRefEvent();
  // Mix 5 Pure Normal mechanisms with 5 Pure Reverse mechanisms in same E-W orientation (contradictory stress!)
  const tNormal = buildSyntheticTensorFromAxes({ n: 0, e: 0, d: 1 }, { n: 0, e: 1, d: 0 }, 0.5).tensor;
  const tReverse = buildSyntheticTensorFromAxes({ n: 0, e: 1, d: 0 }, { n: 0, e: 0, d: 1 }, 0.5).tensor;

  const partA = makeSyntheticMechanismsFromTensor(tNormal, DIVERSE_FAULT_PLANES.slice(0, 6), false);
  const partB = makeSyntheticMechanismsFromTensor(tReverse, DIVERSE_FAULT_PLANES.slice(6, 12), false).map(
    (r, i) => ({
      ...r,
      id: `rev-${i}`,
      eventId: `REV-${i}`,
      originTimeMs: r.originTimeMs + 86400_000 * 40,
    })
  );

  const prepMixed = prepareStressMechanisms([...partA, ...partB], refEvent, {
    ...DEFAULT_STRESS_FILTERS,
    centerMode: 'all-locations',
  });
  const resMixed = runRegionalStressInversion(prepMixed, {
    ...DEFAULT_STRESS_INVERSION_CONFIG,
    bootstrapIterations: 100,
  });

  assert.equal(resMixed.status, 'Ambiguous');
  assert.ok((resMixed.meanMisfitDeg ?? 0) > 35, `Expected high misfit, got ${resMixed.meanMisfitDeg}`);
  assert.ok(resMixed.ambiguityReasons.length > 0);
});

test('Lund & Townend SHmax, Zoback/Simpson regime rules, stale fingerprint, and JSON/Text exports', () => {
  const refEvent = makeRefEvent();
  const { tensor } = buildSyntheticTensorFromAxes(
    { n: 1, e: 1, d: 0 }, // NE-SW sigma1 (45 deg)
    { n: 1, e: -1, d: 0 },
    0.5
  );
  const sh = computeLundTownendShMax(tensor);
  assert.equal(sh.defined, true);
  assert.ok(sh.shMaxDeg !== null && Math.abs(sh.shMaxDeg - 45) < 1.0);

  // Horizontally isotropic radial extension (vertical sigma1, equal horizontal sigma2=sigma3) -> undefined SHmax
  const iso = computeLundTownendShMax({
    sigmaNN: -0.5,
    sigmaNE: 0,
    sigmaND: 0,
    sigmaEE: -0.5,
    sigmaED: 0,
    sigmaDD: 1.0,
  });
  assert.equal(iso.defined, false);
  assert.equal(iso.shMaxDeg, null);

  // Regime classification check
  const regNF = classifyStressRegime(
    { trend: 0, plunge: 80, vec: { n: 0.17, e: 0, d: 0.98 } },
    { trend: 0, plunge: 5, vec: { n: 0.99, e: 0, d: 0.08 } },
    { trend: 90, plunge: 5, vec: { n: 0, e: 0.99, d: 0.08 } },
    0.5,
    [0.3, 0.7]
  );
  assert.equal(regNF.zobackCode, 'NF');
  assert.equal(regNF.simpsonAPhi, 0.5);

  const records = makeSyntheticMechanismsFromTensor(tensor, DIVERSE_FAULT_PLANES, true);
  const prep = prepareStressMechanisms(records, refEvent, {
    ...DEFAULT_STRESS_FILTERS,
    centerMode: 'all-locations',
  });
  const res = runRegionalStressInversion(prep, {
    ...DEFAULT_STRESS_INVERSION_CONFIG,
    bootstrapIterations: 80,
  });
  // Field run (not benchmark flag) must remain Experimental, never Validated
  assert.equal(res.status, 'Experimental');

  const fpA = buildStressInputFingerprint(prep.includedItems, DEFAULT_STRESS_INVERSION_CONFIG);
  const fpB = buildStressInputFingerprint(prep.includedItems.slice(0, -1), DEFAULT_STRESS_INVERSION_CONFIG);
  assert.notEqual(fpA, fpB);

  const json = JSON.parse(exportRegionalStressJson(res, refEvent, true));
  assert.equal(json.schema, 'eqp-modern.regional-stress-analysis.v1');
  assert.equal(json.isStale, true);
  assert.equal(json.status, 'Experimental');
  assert.ok(json.principalAxes.sigma1);

  const txt = formatRegionalStressSummaryText(res, refEvent, true);
  assert.match(txt, /\[STALE — INPUTS MODIFIED\]/);
  assert.match(txt, /Michael \(1984\/1987\)/);
  assert.match(txt, /LIMITATIONS:/);
});

test('Event switching changes spatial selection, michael-random-bootstrap runs cleanly, and coplanar fault planes are rejected as singular', () => {
  const mindanaoRef = makeRefEvent({ lat: 6.76, lon: 125.03 });
  const luzonRef = makeRefEvent({ id: 'luzon-ref', lat: 14.6, lon: 121.0 });

  const { tensor, e1, e3 } = buildSyntheticTensorFromAxes(
    { n: 1, e: -1, d: 0 },
    { n: 1, e: 1, d: 0 },
    0.5
  );
  const records = makeSyntheticMechanismsFromTensor(tensor, DIVERSE_FAULT_PLANES, true);

  // Event switching under 200 km radius filter
  const prepMindanao = prepareStressMechanisms(records, mindanaoRef, {
    ...DEFAULT_STRESS_FILTERS,
    centerMode: 'active-event',
    radiusPreset: '200',
  });
  const prepLuzon = prepareStressMechanisms(records, luzonRef, {
    ...DEFAULT_STRESS_FILTERS,
    centerMode: 'active-event',
    radiusPreset: '200',
  });
  assert.equal(prepMindanao.includedItems.length, DIVERSE_FAULT_PLANES.length);
  assert.equal(prepLuzon.includedItems.length, 0);

  // Michael (1987) pure random-plane bootstrap mode
  const resRand = runRegionalStressInversion(prepMindanao, {
    mode: 'michael-random-bootstrap',
    bootstrapIterations: 100,
    useQualityWeights: true,
  });
  assert.ok(resRand.status !== 'Insufficient Data');
  assert.ok(resRand.sigma1 && resRand.sigma3);
  assert.ok(axisAngleDeg(resRand.sigma1.vec, e1) <= 15);
  assert.ok(axisAngleDeg(resRand.sigma3.vec, e3) <= 15);

  // Coplanar vertical N-S fault planes with slightly varying rakes -> rank-deficient 5x5 matrix -> Insufficient Data
  const coplanar: HistoricalEarthquakeRecord[] = [0, 10, 25, -15, 35, -30].map((rk, i) => ({
    ...records[0],
    id: `cop-${i}`,
    eventId: `COP-${i}`,
    originTimeMs: Date.UTC(2022, 0, i + 1),
    lat: 6.7 + i * 0.05,
    lon: 125.0 + i * 0.05,
    focalMechanism: buildHistoricalFocalMechanism({
      strike1: 0,
      dip1: 90,
      rake1: rk,
      provenanceKind: 'Validated',
      quality: 'A',
    })!,
  }));
  const prepCop = prepareStressMechanisms(coplanar, mindanaoRef, {
    ...DEFAULT_STRESS_FILTERS,
    centerMode: 'all-locations',
  });
  const resCop = runRegionalStressInversion(prepCop);
  assert.equal(resCop.status, 'Insufficient Data');
});

