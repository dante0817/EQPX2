import assert from 'node:assert/strict';
import type { EQPEvent } from '../src/data/eqpData';
import { computeOkada1992Dislocation } from '../src/utils/okada1992';
import {
  buildHypotheticalBenchmarkConfig,
  buildSourceSegmentFromNodalPlane,
  computeCoulombInputFingerprint,
  createEmptySourceModel,
  DEFAULT_ELASTIC_PARAMETERS,
  DEFAULT_RECEIVER_MODEL,
  evaluateCompositeStressEnuAtPoint,
  parseSourceFaultCsv,
  parseSourceFaultGeoJson,
  resolveCoulombStressOnReceiver,
  runCoulombCalculation,
} from '../src/utils/coulombStress';

function runTests() {
  const sampleEvent = {
    id: 'EQP-TEST-001',
    filename: 'EQP-TEST-001.eqp',
    filePath: 'Y:\\EQP-TEST-001.eqp',
    version: '11.20a',
    bulletinNo: 1,
    originDateGmt: '2026-01-15',
    originTimeGmt: '04:12:00',
    originDateLst: '2026-01-15',
    originTimeLst: '12:12:00',
    lat: 14.5,
    lon: 121.0,
    depthKm: 10.0,
    trialDepthKm: 10.0,
    iterations: 1,
    errLatDeg: 0.01,
    errLonDeg: 0.01,
    errKm: 1.0,
    rmsSec: 0.1,
    preferredScale: 'Ms',
    ms: 6.5,
    mb: 6.3,
    md: 6.2,
    centralOfficeBearing: '',
    cities: [],
    selectedCityId: '',
    towns: [],
    selectedTownId: '',
    primaryHeadline: 'city',
    generators: [],
    selectedGeneratorId: '',
    picks: [],
    intensities: [],
    expectingDamage: false,
    expectingAftershocks: false,
    tsunamiStatus: 'None',
    issuedDate: '2026-01-15',
    issuedTime: '12:20',
    issuedBy: 'TEST',
    webPublished: false,
    remarks: '',
    magnitudeHistory: [],
  } as EQPEvent;

  // 1. Burgers displacement discontinuity [u] = 1.0 across fault center
  for (const dip of [90, 40, 0]) {
    const rad = (dip * Math.PI) / 180;
    const sd = Math.sin(rad);
    const cd = Math.abs(Math.cos(rad)) < 1e-12 ? 0 : Math.cos(rad);
    const eps = 1e-2;
    const z0 = -8000;
    for (const [d1, d2, d3] of [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ] as const) {
      const p = computeOkada1992Dislocation(2 / 3, 0, -eps * sd, z0 + eps * cd, 8000, dip, -5000, 5000, -4000, 4000, d1, d2, d3);
      const m = computeOkada1992Dislocation(2 / 3, 0, eps * sd, z0 - eps * cd, 8000, dip, -5000, 5000, -4000, 4000, d1, d2, d3);
      const du = [p.ux - m.ux, p.uy - m.uy, p.uz - m.uz];
      const exp = [d1, d2 * cd - d3 * sd, d2 * sd + d3 * cd];
      const err = Math.hypot(du[0] - exp[0], du[1] - exp[1], du[2] - exp[2]);
      assert.ok(err < 1e-4, `Burgers jump error ${err} too large for dip=${dip}`);
    }
  }

  // 2. Free-surface zero traction at z = 0
  const mu = 3.2e10;
  const nu = 0.25;
  const lam = (2 * mu * nu) / (1 - 2 * nu);
  for (const dip of [90, 40, 0]) {
    for (const [d1, d2, d3] of [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ] as const) {
      const o = computeOkada1992Dislocation(2 / 3, 14000, -9000, 0, 8000, dip, -10000, 10000, -5000, 5000, d1, d2, d3);
      const tr = o.uxx + o.uyy + o.uzz;
      const sxx = lam * tr + 2 * mu * o.uxx;
      const syy = lam * tr + 2 * mu * o.uyy;
      const szz = lam * tr + 2 * mu * o.uzz;
      const sxy = mu * (o.uxy + o.uyx);
      const sxz = mu * (o.uxz + o.uzx);
      const syz = mu * (o.uyz + o.uzy);
      const maxS = Math.max(Math.abs(sxx), Math.abs(syy), Math.abs(sxy));
      const trac = Math.max(Math.abs(sxz), Math.abs(syz), Math.abs(szz));
      assert.ok(trac / Math.max(1, maxS) < 1e-4, `Free-surface traction nonzero for dip=${dip}`);
    }
  }

  // 3. King, Stein & Lin (1994) right-lateral strike-slip stress signs & unclamping lobes
  const bench = buildHypotheticalBenchmarkConfig(sampleEvent);
  const seg = bench.sourceModel.segments;
  const cosLat = Math.cos((14.5 * Math.PI) / 180);
  const tipNorth = resolveCoulombStressOnReceiver(
    evaluateCompositeStressEnuAtPoint(seg, 14.5 + 20 / 111.19, 121.0, 8, 14.5, 121.0, bench.elasticParams).stressEnuPa,
    0,
    90,
    180,
    0.4
  );
  assert.ok(tipNorth.deltaShearKPa > 100, 'Expected positive shear ahead of N fault tip');
  assert.ok(tipNorth.deltaCfsKPa > 100, 'Expected positive ΔCFS ahead of N fault tip');

  const sideShadow = resolveCoulombStressOnReceiver(
    evaluateCompositeStressEnuAtPoint(seg, 14.5, 121.0 + 10 / (111.19 * cosLat), 8, 14.5, 121.0, bench.elasticParams).stressEnuPa,
    0,
    90,
    180,
    0.4
  );
  assert.ok(sideShadow.deltaShearKPa < -100, 'Expected off-fault negative shear stress shadow');
  assert.ok(sideShadow.deltaCfsKPa < -100, 'Expected off-fault negative ΔCFS stress shadow');

  const releasingQuadrant = resolveCoulombStressOnReceiver(
    evaluateCompositeStressEnuAtPoint(seg, 14.5 + 16 / 111.19, 121.0 + 8 / (111.19 * cosLat), 8, 14.5, 121.0, bench.elasticParams).stressEnuPa,
    0,
    90,
    180,
    0.4
  );
  const clampingQuadrant = resolveCoulombStressOnReceiver(
    evaluateCompositeStressEnuAtPoint(seg, 14.5 + 16 / 111.19, 121.0 - 8 / (111.19 * cosLat), 8, 14.5, 121.0, bench.elasticParams).stressEnuPa,
    0,
    90,
    180,
    0.4
  );
  assert.ok(releasingQuadrant.deltaNormalKPa > 100, 'Expected unclamping (+Δσn) in right-step releasing quadrant');
  assert.ok(clampingQuadrant.deltaNormalKPa < -100, 'Expected clamping (-Δσn) in compressional quadrant');
  assert.ok(
    Math.abs(releasingQuadrant.deltaCfsKPa - (releasingQuadrant.deltaShearKPa + 0.4 * releasingQuadrant.deltaNormalKPa)) < 1e-9,
    'Exact ΔCFS = Δτ + μ′Δσn identity violated'
  );

  // 4. Multi-segment linear elastic superposition invariance
  const splitHalf1 = { ...seg[0], id: 'h1', slipM: 0.75 };
  const splitHalf2 = { ...seg[0], id: 'h2', slipM: 0.75 };
  const singleField = evaluateCompositeStressEnuAtPoint(seg, 14.65, 121.08, 10, 14.5, 121.0, bench.elasticParams);
  const splitField = evaluateCompositeStressEnuAtPoint([splitHalf1, splitHalf2], 14.65, 121.08, 10, 14.5, 121.0, bench.elasticParams);
  assert.ok(Math.abs(singleField.stressEnuPa.sEN - splitField.stressEnuPa.sEN) < 1e-4, 'Superposition failed');

  // 5. Invalid configuration blocking (must never fabricate stress cells)
  const emptySrc = createEmptySourceModel(sampleEvent);
  const invalidRun = runCoulombCalculation({
    sourceModel: emptySrc,
    receiverModel: DEFAULT_RECEIVER_MODEL,
    elasticParams: DEFAULT_ELASTIC_PARAMETERS,
    originLat: 14.5,
    originLon: 121.0,
  });
  assert.equal(invalidRun.status, 'Invalid Configuration');
  assert.equal(invalidRun.gridCells.length, 0);
  assert.ok(invalidRun.errors.length > 0);

  // 6. Full benchmark calculation run, Experimental status, and fingerprint stale detection
  const validRun = runCoulombCalculation({
    sourceModel: bench.sourceModel,
    receiverModel: bench.receiverModel,
    elasticParams: bench.elasticParams,
    originLat: 14.5,
    originLon: 121.0,
  });
  assert.equal(validRun.status, 'Experimental');
  assert.ok(validRun.gridCells.length > 0);
  assert.ok(validRun.depthSensitivity.length > 0);
  assert.ok(validRun.frictionSensitivity.length > 0);

  const modifiedElastic = { ...bench.elasticParams, shearModulusGPa: 40 };
  const newFp = computeCoulombInputFingerprint(
    bench.sourceModel,
    bench.receiverModel,
    modifiedElastic,
    14.5,
    121.0
  );
  assert.notEqual(newFp, validRun.inputFingerprint, 'Input fingerprint must change when elastic params change');

  // 7. Focal plane helper & CSV/GeoJSON import
  const fromFm = buildSourceSegmentFromNodalPlane({ strike: 35, dip: 60, rake: -90 }, sampleEvent);
  assert.equal(fromFm.strikeDeg, 35);
  assert.equal(fromFm.dipDeg, 60);
  assert.equal(fromFm.rakeDeg, -90);

  const csvParsed = parseSourceFaultCsv('name,lat,lon,top_depth_km,strike,dip,rake,length_km,width_km,slip_m\nS1,14.5,121.0,2,0,90,180,20,10,1.0');
  assert.equal(csvParsed.errors.length, 0);
  assert.equal(csvParsed.segments.length, 1);

  const geoParsed = parseSourceFaultGeoJson(
    JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [121.0, 14.5] },
          properties: { name: 'G1', strike: 15, dip: 70, rake: 10, length_km: 18, width_km: 9, slip_m: 0.8 },
        },
      ],
    })
  );
  assert.equal(geoParsed.errors.length, 0);
  assert.equal(geoParsed.segments.length, 1);

  console.log('ALL COULOMB STRESS TESTS PASSED');
}

runTests();
