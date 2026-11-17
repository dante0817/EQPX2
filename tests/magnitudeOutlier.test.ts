import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyOutlierFilteredMagnitudeToEvent,
  buildDurationRowsWithOutlierFilter,
  computeDurationOutlierSummary,
  computeOutlierFilteredScaleMean,
  StationDurationMagRow,
} from '../src/components/MagnitudeDurationPopup';
import { EQPEvent, INITIAL_EVENTS, StationPick } from '../src/data/eqpData';

function makeRow(
  pickId: string,
  sta: string,
  ml: number,
  mb = Number((0.865 * ml + 1.6).toFixed(2)),
  ms = Number((1.38 * ml - 1.44).toFixed(2))
): Pick<StationDurationMagRow, 'pickId' | 'ml' | 'mb' | 'ms'> {
  return { pickId, ml, mb, ms };
}

test('computeDurationOutlierSummary handles empty rows safely', () => {
  const summary = computeDurationOutlierSummary([], 'Md', 1.5);
  assert.equal(summary.scaleLabel, 'Ml');
  assert.equal(summary.eligibleCount, 0);
  assert.equal(summary.keptCount, 0);
  assert.equal(summary.outlierCount, 0);
  assert.equal(summary.meanAll, 0);
  assert.equal(summary.stdDev, 0);
  assert.equal(summary.filteredMean, 0);
  assert.equal(summary.lowerBound, 0);
  assert.equal(summary.upperBound, 0);
  assert.equal(summary.varianceK, 1.5);
  assert.equal(summary.outlierPickIds.size, 0);
  assert.equal(summary.zScoreByPickId.size, 0);
});

test('computeDurationOutlierSummary respects low-variance guard (stdDev <= 0.05)', () => {
  const rows = [
    makeRow('p1', 'BAGP', 4.11),
    makeRow('p2', 'PMSP', 4.14),
    makeRow('p3', 'TAGP', 4.12),
    makeRow('p4', 'DAVP', 4.13),
  ];

  const summary = computeDurationOutlierSummary(rows, 'Md', 0.8);
  assert.equal(summary.scaleLabel, 'Ml');
  assert.equal(summary.stdDev, 0);
  assert.equal(summary.outlierCount, 0);
  assert.equal(summary.keptCount, 4);
  assert.equal(summary.outlierPickIds.size, 0);
});

test('computeDurationOutlierSummary detects clear outlier at K=1.5 and computes stats', () => {
  const rows = [
    makeRow('p1', 'BAGP', 4.0),
    makeRow('p2', 'PMSP', 4.1),
    makeRow('p3', 'TAGP', 4.0),
    makeRow('p4', 'DAVP', 4.1),
    makeRow('p5', 'CEBP', 4.0),
    makeRow('p6', 'BATP', 6.2),
  ];

  const summary = computeDurationOutlierSummary(rows, 'Md', 1.5);
  assert.equal(summary.scaleLabel, 'Ml');
  assert.equal(summary.eligibleCount, 6);
  assert.equal(summary.outlierCount, 1);
  assert.equal(summary.keptCount, 5);
  assert.equal(summary.outlierPickIds.has('p6'), true);
  assert.equal(summary.outlierPickIds.has('p1'), false);
  assert.equal(summary.meanAll, 4.4);
  assert.equal(summary.stdDev, 0.81);
  assert.equal(summary.filteredMean, 4.0);
  assert.ok(summary.lowerBound < summary.meanAll);
  assert.ok(summary.upperBound > summary.meanAll);
  assert.ok((summary.zScoreByPickId.get('p6') ?? 0) > 2.0);
  assert.ok((summary.zScoreByPickId.get('p1') ?? 0) < 1.0);
});

test('computeDurationOutlierSummary supports Ms/Mb scales and K threshold sensitivity', () => {
  const rows = [
    { pickId: 'p1', ml: 4.0, mb: 5.0, ms: 4.0 },
    { pickId: 'p2', ml: 4.0, mb: 5.1, ms: 4.1 },
    { pickId: 'p3', ml: 4.0, mb: 5.0, ms: 4.0 },
    { pickId: 'p4', ml: 4.0, mb: 5.1, ms: 4.1 },
    { pickId: 'p5', ml: 4.0, mb: 6.3, ms: 5.8 },
  ];

  const msStrict = computeDurationOutlierSummary(rows, 'Ms', 0.8);
  assert.equal(msStrict.scaleLabel, 'Ms');
  assert.equal(msStrict.outlierCount, 1);
  assert.equal(msStrict.outlierPickIds.has('p5'), true);

  const msLenient = computeDurationOutlierSummary(rows, 'Ms', 2.5);
  assert.equal(msLenient.outlierCount, 0);

  const mbSummary = computeDurationOutlierSummary(rows, 'Mb', 1.5);
  assert.equal(mbSummary.scaleLabel, 'Mb');
  assert.equal(mbSummary.outlierCount, 1);
  assert.equal(mbSummary.outlierPickIds.has('p5'), true);
});

test('buildDurationRowsWithOutlierFilter rejects statistical outliers by default and respects manual override', () => {
  const baseEvent = structuredClone(INITIAL_EVENTS[0]) as EQPEvent;
  const result = buildDurationRowsWithOutlierFilter(baseEvent, 'Ms', 1.5);

  assert.equal(result.autoRejectActive, true);
  const besRow = result.rows.find((r) => r.sta === 'BES');
  assert.ok(besRow, 'BES should exist in eligible rows');
  assert.equal(besRow.included, false, 'BES outlier should be unchecked by default');
  assert.equal(
    result.rows.filter((r) => r.included).length,
    8,
    '8 non-outlier stations should remain checked by default'
  );

  // Explicit manual override (magExcluded: false on BES) disables auto-reject override on reopen
  const overriddenEvent: EQPEvent = {
    ...baseEvent,
    picks: baseEvent.picks.map((p) =>
      p.sta === 'BES' ? { ...p, magExcluded: false } : p
    ),
  };
  const overridden = buildDurationRowsWithOutlierFilter(overriddenEvent, 'Ms', 1.5);
  assert.equal(overridden.autoRejectActive, false);
  assert.equal(overridden.rows.find((r) => r.sta === 'BES')?.included, true);
});

test('computeOutlierFilteredScaleMean rejects outliers when computing network Ms/Mb/Md', () => {
  const makePick = (id: string, sta: string, ms: number, magExcluded?: boolean): StationPick => ({
    id,
    sta,
    pTime: '3100.00',
    pExcluded: false,
    sTime: '',
    sExcluded: false,
    duration: 180,
    amplitude: 50,
    polarity: 'c',
    quality: 'A',
    lat: 11.0,
    lon: 125.0,
    toa: 45,
    azim: 180,
    delta: 1.5,
    resP: 0,
    resS: 0,
    obsP: 20,
    obsS: 0,
    calcP: 20,
    calcS: 0,
    ms,
    mb: ms,
    md: ms,
    magExcluded,
  });

  const picks: StationPick[] = [
    makePick('p1', 'BES', 1.6), // outlier
    makePick('p2', 'OCL', 4.2),
    makePick('p3', 'CNP', 4.3),
    makePick('p4', 'MSL', 4.2),
    makePick('p5', 'BUT', 4.1),
  ];

  // Without outlier rejection raw mean would be (1.6+4.2+4.3+4.2+4.1)/5 = 3.68 -> 3.7
  // With default outlier rejection at K=1.5, BES is dropped -> (4.2+4.3+4.2+4.1)/4 = 4.2
  const filtered = computeOutlierFilteredScaleMean(picks, 'ms', 1.5, 0);
  assert.equal(filtered, 4.2);

  // Respects explicit magExcluded: true as well
  const withManualExclude = [
    makePick('p1', 'BES', 4.2, true),
    makePick('p2', 'OCL', 4.5),
    makePick('p3', 'CNP', 4.5),
  ];
  assert.equal(computeOutlierFilteredScaleMean(withManualExclude, 'ms', 1.5, 0), 4.5);
});

test('applyOutlierFilteredMagnitudeToEvent updates Ms/Mb/Md, pick magExcluded flags, and magnitudeHistory', () => {
  const baseEvent = structuredClone(INITIAL_EVENTS[0]) as EQPEvent;
  const result = applyOutlierFilteredMagnitudeToEvent(baseEvent, 1.5);

  assert.equal(result.outlierCount, 1);
  assert.equal(result.ms, 4.2);
  assert.equal(result.mb, 5.2);
  assert.equal(result.md, 4.1);
  assert.equal(result.event.ms, 4.2);
  assert.equal(result.event.mb, 5.2);
  assert.equal(result.event.md, 4.1);
  assert.equal(result.event.picks.find((p) => p.sta === 'BES')?.magExcluded, true);
  assert.equal(result.event.picks.find((p) => p.sta === 'OCL')?.magExcluded, false);
  assert.equal(result.event.picks.find((p) => p.sta === 'LQP')?.magExcluded, undefined);
  assert.equal(result.event.magnitudeHistory.at(-1)?.ms, 4.2);

  // Lowering K to 0.8 rejects a second outlier automatically
  const strict = applyOutlierFilteredMagnitudeToEvent(baseEvent, 0.8);
  assert.equal(strict.outlierCount, 2);
  assert.equal(strict.ms, 4.1);

  // No eligible duration picks clears event magnitudes to 0 cleanly
  const noDurEvent: EQPEvent = {
    ...baseEvent,
    picks: baseEvent.picks.map((p) => ({ ...p, duration: null })),
  };
  const emptyResult = applyOutlierFilteredMagnitudeToEvent(noDurEvent, 1.5);
  assert.equal(emptyResult.ms, 0);
  assert.equal(emptyResult.mb, 0);
  assert.equal(emptyResult.md, 0);
  assert.equal(emptyResult.outlierCount, 0);
});
