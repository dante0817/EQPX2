import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_EVENTS } from '../src/data/eqpData';
import {
  analyzePhaseResiduals,
  buildPhaseResidualCsv,
  buildPhaseResidualSummaryText,
  classifyResidualStatus,
  computeLinearRegression,
} from '../src/utils/phaseResiduals';

test('analyzePhaseResiduals extracts active and excluded P/S residuals against epicentral distance', () => {
  const sampleEvent = INITIAL_EVENTS[0];
  const analysis = analyzePhaseResiduals(sampleEvent, {
    showP: true,
    showS: true,
    includeExcluded: true,
    outlierThresholdSec: 0.5,
  });

  assert.equal(analysis.eventId, sampleEvent.id);
  assert.equal(analysis.unlocated, false);
  assert.equal(analysis.pStats.count, 9);
  assert.equal(analysis.pStats.excludedCount, 1);
  assert.equal(analysis.sStats.count, 2);
  assert.equal(analysis.sStats.excludedCount, 1);
  assert.ok(analysis.pStats.rmsSec !== null && analysis.pStats.rmsSec > 0);
  assert.ok(analysis.pStats.weightedRmsSec !== null && analysis.pStats.weightedRmsSec > 0);
  assert.ok(analysis.pStats.regression !== null);
  assert.equal(analysis.sStats.regression, null);
  assert.ok(analysis.maxDistKm > analysis.minDistKm);
  assert.ok(analysis.maxDistDeg > analysis.minDistDeg);

  // Station MSL has both active P and active S picks
  const mslPair = analysis.stationPairs.find((p) => p.sta === 'MSL');
  assert.ok(mslPair);
  assert.equal(mslPair.hasP, true);
  assert.equal(mslPair.hasS, true);
  assert.ok(mslPair.sMinusPResSec !== null);
  assert.ok(Math.abs(mslPair.sMinusPResSec - (0.60 - 0.70)) < 1e-9);
});

test('analyzePhaseResiduals respects phase, excluded, and quality filters', () => {
  const sampleEvent = INITIAL_EVENTS[0];
  const sOnly = analyzePhaseResiduals(sampleEvent, {
    showP: false,
    showS: true,
    includeExcluded: false,
    qualities: ['B'],
  });

  assert.equal(sOnly.pStats.count, 0);
  assert.equal(sOnly.sStats.count, 2);
  assert.equal(sOnly.sStats.excludedCount, 0);
  assert.equal(sOnly.visiblePoints.length, 2);
  assert.ok(sOnly.visiblePoints.every((pt) => pt.phase === 'S' && !pt.excluded && pt.quality === 'B'));
});

test('classifyResidualStatus distinguishes Excluded, Nominal, Warning, and Critical', () => {
  assert.equal(classifyResidualStatus(2.4, true, 0.5), 'Excluded');
  assert.equal(classifyResidualStatus(-0.25, false, 0.5), 'Nominal');
  assert.equal(classifyResidualStatus(0.65, false, 0.5), 'Warning');
  assert.equal(classifyResidualStatus(-1.25, false, 0.5), 'Critical');
});

test('computeLinearRegression recovers exact slope and intercept on collinear residual-distance data', () => {
  const fit = computeLinearRegression([
    { distKm: 100, residualSec: 0.2 },
    { distKm: 200, residualSec: 0.4 },
    { distKm: 300, residualSec: 0.6 },
    { distKm: 400, residualSec: 0.8 },
  ]);

  assert.ok(fit);
  assert.ok(Math.abs(fit.slopePer100Km - 0.2) < 1e-9);
  assert.ok(Math.abs(fit.interceptSec - 0) < 1e-9);
  assert.ok(Math.abs(fit.rSquared - 1) < 1e-9);
});

test('buildPhaseResidualCsv and buildPhaseResidualSummaryText produce valid output', () => {
  const sampleEvent = INITIAL_EVENTS[1];
  const analysis = analyzePhaseResiduals(sampleEvent);
  const csv = buildPhaseResidualCsv(sampleEvent, analysis);
  const lines = csv.split('\n');

  assert.ok(lines[0].startsWith('EventID,Station,Phase,EpicentralDistance_km,'));
  assert.equal(lines.length, 1 + analysis.visiblePoints.length);

  const summary = buildPhaseResidualSummaryText(sampleEvent, analysis);
  assert.match(summary, /P & S Phase Residuals vs\. Epicentral Distance/);
  assert.match(summary, /P-Phase/);
  assert.match(summary, /S-Phase/);
});
