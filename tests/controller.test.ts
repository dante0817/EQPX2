import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { EQPEvent, INITIAL_EVENTS, PHILSTA_DATABASE, StationMeta } from '../src/data/eqpData';
import { formatEqpFileContent, parseEqpFileContent } from '../src/utils/eqpStorage';
import {
  applyCandidateSolutionToEvent,
  calculateCandidateLocation,
  computeEventLocationQuality,
  computeLocationQualityIndex,
  computeObservationSnapshotChecksum,
  formatLocationQualityTooltip,
  isCandidateSolutionStale,
  predictFixedHypocenterComparison,
  runMultiModelRelocationComparison,
} from '../src/utils/locationController';
import { parsePhilstaText } from '../src/utils/philstaParser';

function loadFullStations(): StationMeta[] {
  const philstaPath = path.resolve(process.cwd(), 'public/assets/aistudio/PHILSTA-main_6028d80d.txt');
  const raw = fs.readFileSync(philstaPath, 'utf8');
  return [...parsePhilstaText(raw).stations, ...PHILSTA_DATABASE];
}

test('Calculate candidate does not mutate event; Adopt updates event and appends metadata cleanly', () => {
  const stations = loadFullStations();
  const original = structuredClone(INITIAL_EVENTS[0]) as EQPEvent;
  const beforeJson = JSON.stringify(original);

  const cand = calculateCandidateLocation({
    event: original,
    stations,
    solverEngine: 'EQP',
    modelId: 'jb-jbtab',
    eventRevision: 3,
  });

  // Event must remain untouched after Locate
  assert.equal(JSON.stringify(original), beforeJson);
  assert.equal(cand.status, 'calculated');
  assert.equal(cand.result.converged, true);
  assert.equal(cand.eventRevision, 3);
  assert.equal(cand.stale, false);

  const adopted = applyCandidateSolutionToEvent(original, cand, '2026-11-14T12:00:00.000Z');
  // Original still immutable
  assert.equal(JSON.stringify(original), beforeJson);
  // Adopted has locationMetadata and updated history
  assert.equal(adopted.locationMetadata?.modelId, 'jb-jbtab');
  assert.equal(adopted.locationMetadata?.correctionProfile, 'legacy-eqp-s173');
  assert.equal(adopted.locationMetadata?.adoptedAt, '2026-11-14T12:00:00.000Z');
  assert.equal(adopted.magnitudeHistory.length, original.magnitudeHistory.length + 1);
  assert.equal(adopted.magnitudeHistory.at(-1)?.modelId, 'jb-jbtab');
});

test('Failed candidate (unavailable model or insufficient stations) cannot be adopted', () => {
  const stations = loadFullStations();
  const original = structuredClone(INITIAL_EVENTS[0]) as EQPEvent;

  const failedModelCand = calculateCandidateLocation({
    event: original,
    stations,
    solverEngine: 'EQP',
    modelId: 'iasp91',
  });
  assert.equal(failedModelCand.status, 'failed');
  assert.equal(failedModelCand.result.converged, false);
  assert.throws(() => applyCandidateSolutionToEvent(original, failedModelCand));
});

test('Stale detection triggers on pick edits, trial depth changes, and event/revision switches', () => {
  const stations = loadFullStations();
  const event = structuredClone(INITIAL_EVENTS[0]) as EQPEvent;
  const cand = calculateCandidateLocation({
    event,
    stations,
    solverEngine: 'EQP',
    modelId: 'jb-jbtab',
    eventRevision: 1,
  });

  assert.equal(isCandidateSolutionStale(cand, event, stations, 1), false);

  // Pick exclusion change -> stale
  const editedPick = structuredClone(event) as EQPEvent;
  editedPick.picks[0].pExcluded = true;
  assert.equal(isCandidateSolutionStale(cand, editedPick, stations, 1), true);

  // Revision mismatch -> stale
  assert.equal(isCandidateSolutionStale(cand, event, stations, 2), true);

  // Event ID mismatch -> stale
  const otherEvent = structuredClone(INITIAL_EVENTS[2]) as EQPEvent;
  assert.equal(isCandidateSolutionStale(cand, otherEvent, stations, 1), true);

  // Checksum determinism
  assert.equal(
    computeObservationSnapshotChecksum(event, stations),
    computeObservationSnapshotChecksum(event, stations)
  );
});

test('Mode A fixed-hypocenter and Mode B relocation comparison handle verified + unavailable models cleanly', () => {
  const stations = loadFullStations();
  const event = INITIAL_EVENTS[0];

  const fixedReport = predictFixedHypocenterComparison({
    event,
    stations,
    modelIds: ['jb-jbtab', 'iasp91', 'ak135'],
  });
  assert.equal(fixedReport.rows.length, 3);
  const jbFixed = fixedReport.rows.find((r) => r.modelId === 'jb-jbtab');
  const iaspFixed = fixedReport.rows.find((r) => r.modelId === 'iasp91');
  assert.equal(jbFixed?.available, true);
  assert.ok((jbFixed?.validObservationCount ?? 0) > 0);
  assert.equal(iaspFixed?.available, false);
  assert.equal(iaspFixed?.rmsSec, null);

  const relocReport = runMultiModelRelocationComparison({
    event,
    stations,
    solverEngine: 'EQP',
    modelIds: ['jb-jbtab', 'iasp91', 'ak135'],
    observationPolicy: 'common-intersection',
  });
  assert.equal(relocReport.rows.length, 3);
  const jbReloc = relocReport.rows.find((r) => r.modelId === 'jb-jbtab');
  const akReloc = relocReport.rows.find((r) => r.modelId === 'ak135');
  assert.equal(jbReloc?.available, true);
  assert.equal(jbReloc?.candidate?.result.converged, true);
  assert.equal(jbReloc?.deltaEpicenterKmVsAnchor, 0);
  assert.equal(akReloc?.available, false);
  assert.equal(akReloc?.deltaEpicenterKmVsAnchor, null);
});

test('Legacy .eqp text serialization/parsing remains backwards compatible when locationMetadata is attached', () => {
  const stations = loadFullStations();
  const event = structuredClone(INITIAL_EVENTS[0]) as EQPEvent;
  const cand = calculateCandidateLocation({
    event,
    stations,
    solverEngine: 'EQP',
    modelId: 'jb-jbtab',
  });
  const adopted = applyCandidateSolutionToEvent(event, cand);

  const text = formatEqpFileContent({
    event: adopted,
    filePath: adopted.filePath,
  });
  assert.doesNotMatch(text, /\[LocationMetadata\]/i);

  // Verify [Data]usedStation/TotalStations-usedP/totalP-usedS/totalS format (e.g. [Data]9/10-9/10-2/3)
  const syntheticTenPicks = Array.from({ length: 10 }, (_, idx) => ({
    ...adopted.picks[0],
    id: `sta-${idx}`,
    sta: `S${String(idx).padStart(2, '0')}`,
    pTime: '3057.36',
    pExcluded: idx === 0, // 9/10 P used
    sTime: idx < 3 ? '3112.00' : '',
    sExcluded: idx === 0, // 2/3 S used (station 0 has both P and S excluded -> 9/10 stations used)
  }));
  const formattedWithCounts = formatEqpFileContent({
    event: { ...adopted, picks: syntheticTenPicks },
    filePath: adopted.filePath,
  });
  assert.match(formattedWithCounts, /^\[Data\]9\/10-9\/10-2\/3$/m);

  const reparsed = parseEqpFileContent({
    content: text,
    filename: adopted.filename,
    displayPath: adopted.filePath,
    stations,
  });
  assert.equal(reparsed.lat, adopted.lat);
  assert.equal(reparsed.lon, adopted.lon);
  assert.equal(reparsed.depthKm, adopted.depthKm);
});

test('computeLocationQualityIndex scores RMS, station count, and azimuthal gap consistently', () => {
  const gradeA = computeLocationQualityIndex({
    rmsSec: 0.2,
    stationCount: 14,
    azimuthalGapDeg: 75,
  });
  assert.equal(gradeA.grade, 'A');
  assert.equal(gradeA.label, 'Excellent');
  assert.ok(gradeA.score >= 85);

  const gradeB = computeLocationQualityIndex({
    rmsSec: 0.85,
    stationCount: 7,
    azimuthalGapDeg: 130,
  });
  assert.equal(gradeB.grade, 'B');
  assert.equal(gradeB.label, 'Good');

  const poorGeometry = computeLocationQualityIndex({
    rmsSec: 0.1,
    stationCount: 8,
    azimuthalGapDeg: 300,
  });
  assert.ok(poorGeometry.score <= 55);
  assert.notEqual(poorGeometry.grade, 'A');

  const insufficientStations = computeLocationQualityIndex({
    rmsSec: 0.0,
    stationCount: 2,
    azimuthalGapDeg: 90,
  });
  assert.equal(insufficientStations.grade, 'D');
  assert.ok(insufficientStations.score <= 25);

  const missingGap = computeLocationQualityIndex({
    rmsSec: 0.4,
    stationCount: 6,
    azimuthalGapDeg: null,
  });
  assert.equal(missingGap.azimuthalGapDeg, null);
  assert.equal(missingGap.components.gapScore, 0);

  const eventLqi = computeEventLocationQuality(INITIAL_EVENTS[0]);
  assert.ok(eventLqi !== null);
  const tooltip = formatLocationQualityTooltip(eventLqi);
  assert.match(tooltip, /pts\).*active stations.*azimuthal gap/);
  assert.equal(
    computeEventLocationQuality({ ...INITIAL_EVENTS[0], iterations: 0, lat: 0, lon: 0 }),
    null
  );

  // Unmapped (0, 0) picks and duplicate station codes must not inflate stationCount
  const baseCount = eventLqi.stationCount;
  const dupAndZeroEvent: EQPEvent = {
    ...INITIAL_EVENTS[0],
    picks: [
      ...INITIAL_EVENTS[0].picks,
      { ...INITIAL_EVENTS[0].picks[0], id: 'dup-sta' },
      { ...INITIAL_EVENTS[0].picks[0], id: 'zero-sta', sta: 'UNK', lat: 0, lon: 0 },
    ],
  };
  assert.equal(computeEventLocationQuality(dupAndZeroEvent)?.stationCount, baseCount);
  assert.match(formatLocationQualityTooltip(null), /RMS residual.*active stations.*azimuthal gap/);
});
