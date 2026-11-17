import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { INITIAL_EVENTS, PHILSTA_DATABASE, StationMeta, EQPEvent } from '../src/data/eqpData';
import { parseEqpFileContent } from '../src/utils/eqpStorage';
import {
  parseMmSsRelativeToOrigin,
  solveHypocenterWithJbtab,
  solveHypocenterWithProvider,
} from '../src/utils/hypocenterSolver';
import {
  getAllModelCatalogMetadata,
  getRegisteredModelIds,
  resolveTravelTimeProvider,
} from '../src/utils/travelTime/registry';
import { parsePhilstaText } from '../src/utils/philstaParser';

function loadFullStations(): StationMeta[] {
  const philstaPath = path.resolve(process.cwd(), 'public/assets/aistudio/PHILSTA-main_6028d80d.txt');
  const raw = fs.readFileSync(philstaPath, 'utf8');
  return [...parsePhilstaText(raw).stations, ...PHILSTA_DATABASE];
}

test('Registry enables only J-B and explicitly blocks unverified iasp91 and ak135 without fallback', () => {
  assert.deepEqual(getRegisteredModelIds(), ['jb-jbtab']);

  const allMeta = getAllModelCatalogMetadata();
  const jb = allMeta.find((m) => m.id === 'jb-jbtab');
  const iasp = allMeta.find((m) => m.id === 'iasp91');
  const ak = allMeta.find((m) => m.id === 'ak135');

  assert.equal(jb?.available, true);
  assert.equal(iasp?.available, false);
  assert.equal(iasp?.validationStatus, 'unavailable');
  assert.equal(ak?.available, false);
  assert.equal(ak?.validationStatus, 'unavailable');

  const iaspLookup = resolveTravelTimeProvider('iasp91');
  assert.equal(iaspLookup.ok, false);
  const akLookup = resolveTravelTimeProvider('ak135');
  assert.equal(akLookup.ok, false);
});

test('Representative baseline events converge cleanly with J-B and preserve valid diagnostics', () => {
  const stations = loadFullStations();

  // Event 1: Eastern Samar 2012
  const res1 = solveHypocenterWithJbtab({
    event: INITIAL_EVENTS[0],
    stations,
    solverEngine: 'EQP',
  });
  assert.equal(res1.converged, true);
  assert.equal(res1.modelId, 'jb-jbtab');
  assert.ok(Math.abs(res1.lat - 11.754) < 0.08);
  assert.ok(Math.abs(res1.lon - 125.785) < 0.08);
  assert.ok(res1.weightedRmsSec >= 0);
  assert.ok(res1.rmsSec >= 0);
  assert.equal(res1.usedStationCount, 9);

  // Event 3: Surigao del Norte 2026 (3 stations, 5 active phases -> well conditioned)
  const res3 = solveHypocenterWithJbtab({
    event: INITIAL_EVENTS[2],
    stations,
    solverEngine: 'EQP',
  });
  assert.equal(res3.converged, true);
  assert.equal(res3.usedStationCount, 3);
  assert.equal(res3.activePhaseCount, 5);

  // Event 2 with explicit override for synthetic demo station QZN vs without override
  const res2WithoutOverride = solveHypocenterWithJbtab({
    event: INITIAL_EVENTS[1],
    stations,
    solverEngine: 'EQP',
  });
  // QZN is rejected as unknown, leaving TGY (P,S), SCZ (P,S), LUB (S) = 3 stations, 5 phases
  assert.ok(res2WithoutOverride.rejectedObservations.some((r) => r.sta === 'QZN' && r.code === 'unknown_station'));

  const res2WithOverride = solveHypocenterWithJbtab({
    event: INITIAL_EVENTS[1],
    stations,
    solverEngine: 'HypoInverse',
    stationMetadataOverrides: {
      QZN: { lat: 14.65, lon: 121.05, delaySec: 0, elevationM: 15 },
    },
  });
  assert.equal(res2WithOverride.converged, true);
  assert.equal(res2WithOverride.usedStationCount, 4);
  assert.ok(res2WithOverride.warnings.some((w) => w.includes('not official HYPOINVERSE2000')));
});

test('Unknown stations are never assigned DEFAULT_PH_CENTER coordinates', () => {
  const baseEvent = structuredClone(INITIAL_EVENTS[0]) as EQPEvent;
  baseEvent.picks = baseEvent.picks.slice(0, 3).map((p, idx) => ({
    ...p,
    sta: idx === 2 ? 'NO_SUCH_STA' : p.sta,
  }));

  const res = solveHypocenterWithJbtab({
    event: baseEvent,
    stations: PHILSTA_DATABASE,
    solverEngine: 'EQP',
  });

  assert.equal(res.converged, false);
  assert.ok(res.rejectedObservations.some((r) => r.sta === 'NO_SUCH_STA' && r.code === 'unknown_station'));
  assert.match(res.reason ?? '', /at least 3 distinct valid stations/i);
});

test('Collinear station geometry is rejected cleanly rather than returning singular solutions', () => {
  const stations: StationMeta[] = [
    { code: 'COL1', name: 'Col1', province: 'Test', lat: 14.0, lon: 121.0, elevationM: 10, delaySec: 0, sensor: 'BB' },
    { code: 'COL2', name: 'Col2', province: 'Test', lat: 14.5, lon: 121.0, elevationM: 10, delaySec: 0, sensor: 'BB' },
    { code: 'COL3', name: 'Col3', province: 'Test', lat: 15.0, lon: 121.0, elevationM: 10, delaySec: 0, sensor: 'BB' },
  ];
  const event: EQPEvent = {
    ...structuredClone(INITIAL_EVENTS[2]),
    id: 'test-collinear',
    lat: 14.5,
    lon: 121.5,
    depthKm: 10,
    trialDepthKm: 10,
    picks: [
      { ...INITIAL_EVENTS[2].picks[0], sta: 'COL1', pTime: '4418.00', sTime: '', pExcluded: false, sExcluded: false, obsP: 0, obsS: 0 },
      { ...INITIAL_EVENTS[2].picks[0], sta: 'COL2', pTime: '4417.00', sTime: '', pExcluded: false, sExcluded: false, obsP: 0, obsS: 0 },
      { ...INITIAL_EVENTS[2].picks[0], sta: 'COL3', pTime: '4418.00', sTime: '', pExcluded: false, sExcluded: false, obsP: 0, obsS: 0 },
    ],
  };

  // All 3 stations lie on lon = 121.0 and have symmetric arrivals wrt 14.5N (pure 1D line)
  const res = solveHypocenterWithJbtab({
    event,
    stations,
    solverEngine: 'EQP',
  });
  assert.equal(res.converged, false);
  assert.match(res.reason ?? '', /underdetermined|collinear|singular/i);
});

test('Zero depth (0.0 km) is preserved without fallback to 15 km or 30 km', () => {
  const stations = loadFullStations();
  const event = structuredClone(INITIAL_EVENTS[2]) as EQPEvent;
  event.depthKm = 0.0;
  event.trialDepthKm = 0.0;

  // Fewer than 4 phases -> depth is fixed at initial/trial depth 0.0 km (must stay 0.0)
  event.picks = event.picks.map((p) => ({ ...p, sTime: '' }));
  const res = solveHypocenterWithJbtab({
    event,
    stations,
    solverEngine: 'EQP',
  });
  assert.equal(res.converged, true);
  assert.equal(res.depthFixed, true);
  assert.equal(res.depthKm, 0);

  // Also test parseEqpFileContent preserves 0.00 depth when IT > 0
  const eqpZeroDepth = `[Version]11.20a
[Date]
20261110   21:44:10.18   (GMT)

[Data]33
sta   pri      sec      dur  polP
SGP  2144.16
BUT  2144.28
MSL  2144.36

[Result]
  5    9.780  126.150   0.00 21 44 10.18   0.20
IT    LAT     LON      DEPTH HR MIN SEC    RMS 
  5    9.780  126.150   0.00 21 44 10.18   0.20`;

  const parsed = parseEqpFileContent({
    content: eqpZeroDepth,
    filename: 'test_zero_depth.eqp',
    displayPath: 'Y:\\test_zero_depth.eqp',
    stations,
  });
  assert.equal(parsed.depthKm, 0);
  assert.equal(parsed.trialDepthKm, 0);
});

test('MMSS.ss timestamp parser rejects malformed timestamps and unwraps hour rollovers cleanly', () => {
  assert.equal(parseMmSsRelativeToOrigin('invalid', '21:59:50.00'), null);
  assert.equal(parseMmSsRelativeToOrigin('6500.00', '21:59:50.00'), null);
  assert.equal(parseMmSsRelativeToOrigin('0005.00', '21:59:50.00'), 15);
  assert.equal(parseMmSsRelativeToOrigin('5945.00', '22:00:05.00'), -20);
});

test('solveHypocenterWithProvider rejects unavailable providers cleanly', () => {
  const unavailableProvider = {
    metadata: {
      id: 'iasp91' as const,
      name: 'iasp91 (Unavailable)',
      shortLabel: 'iasp91',
      version: 'unavailable',
      source: 'none',
      checksum: null,
      supportedPhases: ['P' as const, 'S' as const],
      phaseBounds: {},
      phaseSelectionPolicy: 'none',
      defaultCorrectionProfile: 'none' as const,
      supportedCorrectionProfiles: ['none' as const],
      validationStatus: 'unavailable' as const,
      available: false,
      unavailableReason: 'Blocked test unavailable model',
    },
    predict() {
      throw new Error('Should not be called when unavailable');
    },
    predictBatch() {
      return [];
    },
  };

  const res = solveHypocenterWithProvider({
    event: INITIAL_EVENTS[0],
    stations: PHILSTA_DATABASE,
    solverEngine: 'EQP',
    travelTimeProvider: unavailableProvider,
  });
  assert.equal(res.converged, false);
  assert.match(res.reason ?? '', /Blocked test unavailable model/);
});
