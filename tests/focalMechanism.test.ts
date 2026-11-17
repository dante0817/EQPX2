import test from 'node:test';
import assert from 'node:assert/strict';
import { EQPEvent, INITIAL_EVENTS, Polarity, StationPick } from '../src/data/eqpData';
import {
  buildFocalInputFingerprint,
  buildNodalPlaneProjectionPoints,
  computeKaganAngleDeg,
  computePrincipalAxes,
  dotVec,
  evaluateManualMechanism,
  invertFocalMechanism,
  planeToVectors,
  rayFromToaAndAzimuth,
  schmidtProjectLower,
  validateFocalMechanismPicks,
  vectorsToStrikeDipRake,
} from '../src/utils/focalMechanism';
import {
  buildBeachballSvgDocument,
  buildCompressionalQuadrantSvgPath,
  formatFocalMechanismSummaryText,
} from '../src/utils/focalMechanismExport';

function cloneEvent(base: EQPEvent, overrides?: Partial<EQPEvent>): EQPEvent {
  return {
    ...base,
    picks: base.picks.map((p) => ({ ...p })),
    generators: base.generators.map((g) => ({ ...g })),
    ...(overrides ?? {}),
  };
}

function makePick(
  overrides: Partial<StationPick> & Pick<StationPick, 'id' | 'sta'>
): StationPick {
  return {
    pTime: '12:00:00.00',
    pExcluded: false,
    sTime: '',
    sExcluded: false,
    duration: null,
    amplitude: 1.0,
    polarity: 'c',
    quality: 'A',
    lat: 14.5,
    lon: 121.0,
    toa: 45,
    azim: 0,
    delta: 50,
    resP: 0,
    resS: 0,
    obsP: 10,
    obsS: 0,
    calcP: 10,
    calcS: 0,
    ms: null,
    mb: null,
    md: null,
    ...overrides,
  };
}

function makeSyntheticPicksFromMechanism(
  strike: number,
  dip: number,
  rake: number,
  rays: Array<{ sta: string; azim: number; toa: number; quality?: 'A' | 'B' | 'C' | 'D' }>
): StationPick[] {
  const { n, s } = planeToVectors(strike, dip, rake);
  return rays.map((r, idx) => {
    const { ray } = rayFromToaAndAzimuth(r.toa, r.azim);
    const amp = 2 * dotVec(ray, n) * dotVec(ray, s);
    const polarity: Polarity = amp >= 0 ? 'c' : 'd';
    return makePick({
      id: `syn-${idx}-${r.sta}`,
      sta: r.sta,
      delta: Math.max(5, Math.round(r.toa * 2)),
      azim: r.azim,
      toa: r.toa,
      polarity,
      quality: r.quality ?? 'A',
    });
  });
}

const WELL_DISTRIBUTED_RAYS: Array<{ sta: string; azim: number; toa: number }> = [
  ...Array.from({ length: 24 }, (_, i) => ({
    sta: `ST${String(i + 1).padStart(2, '0')}`,
    azim: i * 15 + 3,
    toa: i % 3 === 0 ? 28 : i % 3 === 1 ? 52 : 76,
  })),
  // Include upgoing rays (toa > 90) to verify lower-hemisphere antipode projection
  { sta: 'ST25', azim: 30, toa: 128 },
  { sta: 'ST26', azim: 120, toa: 132 },
  { sta: 'ST27', azim: 210, toa: 124 },
  { sta: 'ST28', azim: 300, toa: 136 },
];

test('Insufficient data gates: unlocated, sparse events (< 6 picks), single polarity, and clustered rays', () => {
  // Unlocated event
  const unlocated = cloneEvent(INITIAL_EVENTS[0], { lat: 0, lon: 0, iterations: 0 });
  const resUnloc = invertFocalMechanism(unlocated);
  assert.equal(resUnloc.status, 'insufficient-data');
  assert.equal(resUnloc.plane1, null);
  assert.equal(resUnloc.plane2, null);
  assert.ok(resUnloc.insufficientReasons.some((r) => /unlocated/i.test(r)));

  // Real sample events with < 6 polarities must NOT fabricate a default mechanism
  const sparse1 = invertFocalMechanism(INITIAL_EVENTS[1]);
  assert.equal(sparse1.status, 'insufficient-data');
  assert.equal(sparse1.plane1, null);

  const sparse2 = invertFocalMechanism(INITIAL_EVENTS[2]);
  assert.equal(sparse2.status, 'insufficient-data');
  assert.equal(sparse2.plane1, null);

  // Single polarity only across 8 stations
  const singlePol = cloneEvent(INITIAL_EVENTS[0], {
    picks: WELL_DISTRIBUTED_RAYS.slice(0, 8).map((r, i) =>
      makePick({
        id: `sp-${i}`,
        sta: r.sta,
        delta: 40,
        azim: r.azim,
        toa: r.toa,
        polarity: 'c',
      })
    ),
  });
  const resSingle = invertFocalMechanism(singlePol);
  assert.equal(resSingle.status, 'insufficient-data');
  assert.ok(resSingle.insufficientReasons.some((r) => /single polarity/i.test(r)));

  // Clustered rays (< 25 deg angular spread) with mixed polarity
  const clustered = cloneEvent(INITIAL_EVENTS[0], {
    picks: Array.from({ length: 7 }, (_, i) =>
      makePick({
        id: `cl-${i}`,
        sta: `CL${i}`,
        delta: 40,
        azim: 40 + i,
        toa: 45 + (i % 3),
        polarity: i % 2 === 0 ? 'c' : 'd',
      })
    ),
  });
  const resClustered = invertFocalMechanism(clustered);
  assert.equal(resClustered.status, 'insufficient-data');
  assert.ok(resClustered.insufficientReasons.some((r) => /span only/i.test(r)));
});

test('Polarity, TOA/azimuth geometry validation, exclusions, and provenance tracking', () => {
  const testEvent = cloneEvent(INITIAL_EVENTS[0], {
    picks: [
      makePick({
        id: 'p-valid',
        sta: 'VAL1',
        delta: 50,
        azim: 120,
        toa: 45,
        polarity: '+',
        quality: 'A',
      }),
      makePick({
        id: 'p-zero-geom',
        sta: 'ZER0',
        delta: 0,
        azim: 0,
        toa: 0,
        polarity: 'c',
        quality: 'A',
      }),
      makePick({
        id: 'p-bad-toa',
        sta: 'BADT',
        delta: 10,
        azim: 90,
        toa: 180,
        polarity: 'd',
        quality: 'B',
      }),
      makePick({
        id: 'p-missing-pol',
        sta: 'NOPOL',
        delta: 40,
        azim: 90,
        toa: 50,
        polarity: '',
        quality: 'B',
      }),
      makePick({
        id: 'p-accepted-excl',
        sta: 'EXCL',
        pExcluded: true,
        delta: 40,
        azim: 180,
        toa: 60,
        polarity: 'd',
        quality: 'A',
      }),
    ],
  });

  const validated = validateFocalMechanismPicks(testEvent, new Set(['p-valid']));
  assert.equal(validated.find((p) => p.pick.id === 'p-valid')?.status, 'excluded-research');
  assert.equal(validated.find((p) => p.pick.id === 'p-zero-geom')?.status, 'invalid-geometry');
  assert.equal(validated.find((p) => p.pick.id === 'p-bad-toa')?.status, 'invalid-geometry');
  assert.equal(validated.find((p) => p.pick.id === 'p-missing-pol')?.status, 'missing-polarity');
  assert.equal(validated.find((p) => p.pick.id === 'p-accepted-excl')?.status, 'excluded-accepted');

  // Without research exclusion, VAL1 is usable and projects to 45-deg equal-area circle radius sqrt(1 - cos(45))
  const validatedActive = validateFocalMechanismPicks(testEvent);
  const val1 = validatedActive.find((p) => p.pick.id === 'p-valid')!;
  assert.equal(val1.status, 'usable');
  const r45 = Math.hypot(val1.projX!, val1.projY!);
  assert.ok(Math.abs(r45 - Math.sqrt(1 - Math.SQRT1_2)) < 1e-4);
  assert.match(val1.toaProvenance, /unverified vs\. PLOTTER1\.EXE/i);
});

test('No fault/trench-name bias in focal mechanism inversion', () => {
  const picks = makeSyntheticPicksFromMechanism(35, 55, -80, WELL_DISTRIBUTED_RAYS);
  const eventWestValley = cloneEvent(INITIAL_EVENTS[0], {
    picks,
    generators: [
      { id: 'g1', label: 'West Valley Fault', distanceKm: 4, bearing: 'E', name: 'West Valley Fault' },
    ],
  });
  const eventTrench = cloneEvent(INITIAL_EVENTS[0], {
    picks,
    generators: [
      { id: 'g2', label: 'Philippine Trench', distanceKm: 12, bearing: 'E', name: 'Philippine Trench' },
    ],
  });
  const eventEmptyGen = cloneEvent(INITIAL_EVENTS[0], {
    picks,
    generators: [],
  });

  const a = invertFocalMechanism(eventWestValley);
  const b = invertFocalMechanism(eventTrench);
  const c = invertFocalMechanism(eventEmptyGen);

  assert.equal(a.status, 'computed');
  assert.deepEqual(a.plane1, b.plane1);
  assert.deepEqual(a.plane2, b.plane2);
  assert.deepEqual(a.plane1, c.plane1);
  assert.deepEqual(a.plane2, c.plane2);
});

test('Canonical Aki & Richards NED axes, nodal-plane equivalence, and continuous stereonet curves', () => {
  // Pure left-lateral N-S strike-slip: strike=0, dip=90, rake=0
  const ss = planeToVectors(0, 90, 0);
  const ssAxes = computePrincipalAxes(ss.n, ss.s);
  assert.equal(ssAxes.bAxis.plunge, 90);
  assert.equal(ssAxes.pAxis.plunge, 0);
  assert.equal(ssAxes.tAxis.plunge, 0);

  // Auxiliary plane for (0, 90, 0) is (90, 90, 180)
  const ssAux = vectorsToStrikeDipRake(ss.s, ss.n);
  assert.equal(ssAux.dip, 90);
  assert.ok(ssAux.strike === 90 || ssAux.strike === 270);
  assert.equal(computeKaganAngleDeg({ strike: 0, dip: 90, rake: 0 }, ssAux), 0);

  // Horizontal fault edge case dip=0 should not yield NaN
  const horiz = vectorsToStrikeDipRake(
    planeToVectors(120, 0, 0).n,
    planeToVectors(120, 0, 0).s
  );
  assert.equal(horiz.dip, 0);
  assert.ok(Number.isFinite(horiz.strike) && Number.isFinite(horiz.rake));

  // Arbitrary oblique double couple: Kagan angle between plane1 and auxiliary plane2 must be 0
  const arb = { strike: 217, dip: 58, rake: -38 };
  const arbVecs = planeToVectors(arb.strike, arb.dip, arb.rake);
  const arbAux = vectorsToStrikeDipRake(arbVecs.s, arbVecs.n);
  assert.ok(computeKaganAngleDeg(arb, arbAux) <= 1.2);

  // Schmidt projection 45-deg check
  const p45 = schmidtProjectLower(rayFromToaAndAzimuth(45, 0).ray);
  assert.ok(Math.abs(p45.y - Math.sqrt(1 - Math.SQRT1_2)) < 1e-6);

  // Nodal plane curve continuity check (no diameter jumps across circle)
  const pts = buildNodalPlaneProjectionPoints(142, 48, 72);
  assert.equal(pts.length, 73);
  for (let i = 1; i < pts.length; i++) {
    const stepDist = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    assert.ok(stepDist < 0.08, `Unexpected jump ${stepDist} at step ${i}`);
    assert.ok(Math.hypot(pts[i].x, pts[i].y) <= 1.0001);
  }
});

test('Independent focal mechanism benchmarks across Normal, Reverse, Strike-Slip, and Oblique regimes', () => {
  const cases: Array<{
    name: string;
    truth: { strike: number; dip: number; rake: number };
    expectedClassPrefix: string;
    maxKaganDeg: number;
  }> = [
    {
      name: 'Pure Normal (Aki-Richards NED reference)',
      truth: { strike: 30, dip: 50, rake: -90 },
      expectedClassPrefix: 'Normal',
      maxKaganDeg: 20,
    },
    {
      name: 'Pure Reverse / Thrust (Aki-Richards NED reference)',
      truth: { strike: 160, dip: 40, rake: 90 },
      expectedClassPrefix: 'Reverse / Thrust',
      maxKaganDeg: 20,
    },
    {
      name: 'Strike-Slip Left-Lateral',
      truth: { strike: 15, dip: 85, rake: 5 },
      expectedClassPrefix: 'Strike-Slip',
      maxKaganDeg: 20,
    },
    {
      name: 'Strike-Slip Right-Lateral',
      truth: { strike: 105, dip: 85, rake: 175 },
      expectedClassPrefix: 'Strike-Slip',
      maxKaganDeg: 20,
    },
    {
      name: 'Oblique Normal',
      truth: { strike: 210, dip: 68, rake: -40 },
      expectedClassPrefix: 'Oblique Normal',
      maxKaganDeg: 20,
    },
    {
      name: 'Oblique Reverse',
      truth: { strike: 320, dip: 65, rake: 42 },
      expectedClassPrefix: 'Oblique Reverse',
      maxKaganDeg: 20,
    },
  ];

  for (const c of cases) {
    const picks = makeSyntheticPicksFromMechanism(
      c.truth.strike,
      c.truth.dip,
      c.truth.rake,
      WELL_DISTRIBUTED_RAYS
    );
    const ev = cloneEvent(INITIAL_EVENTS[0], { picks });
    const res = invertFocalMechanism(ev);

    assert.equal(res.status, 'computed', `${c.name} should compute`);
    assert.ok(res.plane1 && res.plane2 && res.pAxis && res.tAxis && res.bAxis);
    assert.equal(res.quality.agreementPct, 100, `${c.name} should match 100% of exact picks`);
    assert.ok(
      res.mechanismClass!.startsWith(c.expectedClassPrefix),
      `${c.name}: expected ${c.expectedClassPrefix}, got ${res.mechanismClass}`
    );

    const kagan = computeKaganAngleDeg(res.plane1!, c.truth);
    assert.ok(
      kagan <= c.maxKaganDeg,
      `${c.name}: Kagan error ${kagan}° exceeds ${c.maxKaganDeg}° (recovered ${JSON.stringify(res.plane1)})`
    );
    const minEnsembleKagan = Math.min(
      kagan,
      ...res.alternativeSolutions.map((alt) => computeKaganAngleDeg(alt.plane1, c.truth))
    );
    assert.ok(
      minEnsembleKagan <= 12,
      `${c.name}: Closest ensemble Kagan ${minEnsembleKagan}° exceeds 12°`
    );

    // P/T/B orthogonality check
    assert.ok(Math.abs(dotVec(res.pAxis!.vec, res.tAxis!.vec)) < 1e-4);
    assert.ok(Math.abs(dotVec(res.pAxis!.vec, res.bAxis!.vec)) < 1e-4);
    assert.ok(Math.abs(dotVec(res.tAxis!.vec, res.bAxis!.vec)) < 1e-4);
  }
});

test('Sample event INITIAL_EVENTS[0] computes Experimental result with provenance & coverage', () => {
  const res = invertFocalMechanism(INITIAL_EVENTS[0]);
  assert.equal(res.isExperimental, true);
  assert.equal(res.status, 'computed');
  assert.ok(res.quality.usableCount >= 6);
  assert.ok(res.plane1 && res.plane2);
  assert.ok(res.limitations.some((l) => /auxiliary plane/i.test(l)));
  assert.ok(res.limitations.some((l) => /HASH/i.test(l)));
});

test('Conflicting polarities, near-nodal reduced weighting, poor coverage, and high ambiguity', () => {
  // Base vertical N-S strike-slip: nodal planes at azim 0/180 and 90/270
  const nearNodalAndFarPicks = makeSyntheticPicksFromMechanism(0, 90, 0, [
    { sta: 'N1', azim: 45, toa: 45 },
    { sta: 'N2', azim: 135, toa: 45 },
    { sta: 'N3', azim: 225, toa: 45 },
    { sta: 'N4', azim: 315, toa: 45 },
    { sta: 'N5', azim: 35, toa: 70 },
    { sta: 'N6', azim: 145, toa: 70 },
    { sta: 'N7', azim: 215, toa: 70 },
    { sta: 'N8', azim: 325, toa: 70 },
    { sta: 'NOD', azim: 2, toa: 60 }, // right next to N-S nodal plane (|amp| < 0.12)
  ]);

  // Flip near-nodal polarity vs far-from-nodal polarity using manual evaluator on truth (0,90,0)
  const flippedNear = cloneEvent(INITIAL_EVENTS[0], {
    picks: nearNodalAndFarPicks.map((p) =>
      p.sta === 'NOD' ? { ...p, polarity: p.polarity === 'c' ? 'd' : 'c' } : p
    ),
  });
  const flippedFar = cloneEvent(INITIAL_EVENTS[0], {
    picks: nearNodalAndFarPicks.map((p) =>
      p.sta === 'N1' ? { ...p, polarity: p.polarity === 'c' ? 'd' : 'c' } : p
    ),
  });

  const evalNear = evaluateManualMechanism(flippedNear, 0, 90, 0);
  const evalFar = evaluateManualMechanism(flippedFar, 0, 90, 0);
  assert.equal(evalNear.matchedCount, 8);
  assert.equal(evalFar.matchedCount, 8);
  assert.ok(
    evalNear.weightedMisfitPct < evalFar.weightedMisfitPct,
    `Near-nodal conflict (${evalNear.weightedMisfitPct}%) should weigh less than far conflict (${evalFar.weightedMisfitPct}%)`
  );

  // Also run full inversion with an inseparable conflicting polarity on the exact same ray
  const inseparablePicks: StationPick[] = [
    ...nearNodalAndFarPicks,
    {
      ...nearNodalAndFarPicks[0],
      id: 'syn-conflict-ne',
      sta: 'BAD1',
      polarity: nearNodalAndFarPicks[0].polarity === 'c' ? 'd' : 'c',
    },
  ];
  const invConflicted = invertFocalMechanism(cloneEvent(INITIAL_EVENTS[0], { picks: inseparablePicks }));
  assert.equal(invConflicted.status, 'computed');
  assert.ok(invConflicted.quality.discrepantCount >= 1);

  // Poor azimuthal coverage (all picks concentrated in narrow sector) -> poor coverage + multi-solution ambiguity
  const poorCovPicks = makeSyntheticPicksFromMechanism(0, 90, 0, [
    { sta: 'P1', azim: 15, toa: 35 },
    { sta: 'P2', azim: 25, toa: 55 },
    { sta: 'P3', azim: 35, toa: 75 },
    { sta: 'P4', azim: 345, toa: 40 },
    { sta: 'P5', azim: 352, toa: 65 },
    { sta: 'P6', azim: 50, toa: 50 },
  ]);
  const resPoor = invertFocalMechanism(cloneEvent(INITIAL_EVENTS[0], { picks: poorCovPicks }));
  assert.equal(resPoor.status, 'computed');
  assert.equal(resPoor.quality.coverageGrade, 'Poor');
  assert.ok(resPoor.quality.maxAzimuthalGapDeg > 250);
  assert.ok(resPoor.alternativeSolutions.length >= 1);
  assert.notEqual(resPoor.quality.ambiguityGrade, 'Low');
});

test('Manual exploration, read-only event preservation, and stale fingerprint detection', () => {
  const original = cloneEvent(INITIAL_EVENTS[0]);
  const snapshotBefore = JSON.stringify(original);

  const researchExcluded = new Set<string>([original.picks[0].id]);
  const fp0 = buildFocalInputFingerprint(original);
  const fpExcl = buildFocalInputFingerprint(original, researchExcluded);
  assert.notEqual(fp0, fpExcl);

  const manual = evaluateManualMechanism(original, 120, 60, -45, researchExcluded);
  assert.equal(manual.plane1.strike, 120);
  assert.equal(manual.plane1.dip, 60);
  assert.equal(manual.plane1.rake, -45);

  // Accepted EQPEvent must remain completely untouched
  assert.equal(JSON.stringify(original), snapshotBefore);

  // Stale detection on event switch, depth change, and polarity change
  const switched = cloneEvent(INITIAL_EVENTS[1]);
  assert.notEqual(fp0, buildFocalInputFingerprint(switched));

  const depthEdited = cloneEvent(original, { depthKm: original.depthKm + 5 });
  assert.notEqual(fp0, buildFocalInputFingerprint(depthEdited));

  const polEdited = cloneEvent(original);
  polEdited.picks[0].polarity = polEdited.picks[0].polarity === 'c' ? 'd' : 'c';
  assert.notEqual(fp0, buildFocalInputFingerprint(polEdited));
});

test('SVG beachball export & plain-text summary formatting preserve metadata, stale flags, and limitations', () => {
  const ev = cloneEvent(INITIAL_EVENTS[0]);
  const analysis = invertFocalMechanism(ev);
  const manualEval = evaluateManualMechanism(ev, 45, 70, 20);

  const svg = buildBeachballSvgDocument({
    event: ev,
    analysis,
    manualExploration: null,
    isStale: true,
  });
  assert.ok(svg.startsWith('<?xml version="1.0"'));
  assert.ok(svg.includes('<svg '));
  assert.ok(svg.includes(ev.id));
  assert.ok(svg.includes('STALE'));
  assert.ok(svg.includes('fill-rule="evenodd"'));
  assert.ok(svg.includes('>P</text>'));
  assert.ok(svg.includes('>T</text>'));
  assert.ok(svg.includes('>B</text>'));

  const contourPath = buildCompressionalQuadrantSvgPath(
    analysis.nVec!,
    analysis.sVec!,
    210,
    240,
    148
  );
  assert.ok(contourPath.startsWith('M'));

  const summary = formatFocalMechanismSummaryText({
    event: ev,
    analysis,
    manualExploration: { enabled: true, evaluation: manualEval },
    isStale: true,
  });
  assert.match(summary, /EXPERIMENTAL \(Computed\)/);
  assert.match(summary, /STALE/);
  assert.match(summary, /MANUAL HYPOTHETICAL PLANE EXPLORATION/);
  assert.match(summary, /LIMITATIONS:/);
  assert.match(summary, /STATION POLARITY TABLE:/);

  // Insufficient-data SVG must render INSUFFICIENT DATA and withhold nodal paths
  const insuffAnalysis = invertFocalMechanism(INITIAL_EVENTS[1]);
  const insuffSvg = buildBeachballSvgDocument({
    event: INITIAL_EVENTS[1],
    analysis: insuffAnalysis,
    isStale: false,
  });
  assert.ok(insuffSvg.includes('INSUFFICIENT DATA'));
  assert.ok(!insuffSvg.includes('fill-rule="evenodd"'));
});
