import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EQPEvent,
  INITIAL_EVENTS,
  PHILSTA_DATABASE,
  StationPick,
} from '../src/data/eqpData';
import {
  AmplitudeMeasurement,
  buildStationPickAnchors,
  createDefaultAmplitudeMeasurement,
  reconcileLoadedAmplitudeSidecar,
  sanitizeAmplitudeSidecar,
  summarizeStationMeasurements,
  validateAmplitudeMeasurement,
  validateEventAmplitudeMeasurements,
} from '../src/utils/amplitudeMeasurements';
import {
  applyEventUndoSnapshot,
  arePickAndOriginSnapshotsEqual,
  extractEventPickAndOriginSnapshot,
  pushEventUndoEntry,
} from '../src/utils/eventUndoHistory';
import { buildEqpSnapshot, diffEqpVersions } from '../src/utils/eqpHistory';
import { formatEqpFileContent, parseEqpFileContent } from '../src/utils/eqpStorage';
import {
  applyCandidateSolutionToEvent,
  calculateCandidateLocation,
  computeObservationSnapshotChecksum,
} from '../src/utils/locationController';
import {
  computeAlgorithmInputFingerprint,
  computeHistoricalBaselineFingerprint,
  DEFAULT_MAGNITUDE_SETTINGS,
  evaluateEventMagnitudes,
  inspectMagnitudeFreshness,
  MAGNITUDE_ALGORITHMS,
} from '../src/utils/magnitudeEngine';
import {
  appendAtlasParseToEqpEvent,
  parseAtlasHydraClipboard,
} from '../src/utils/atlasHydraParser';

function cloneSampleEvent(): EQPEvent {
  return structuredClone(INITIAL_EVENTS[0]) as EQPEvent;
}

function makeStructuredMeasurement(
  overrides: Partial<AmplitudeMeasurement> = {}
): AmplitudeMeasurement {
  const base = createDefaultAmplitudeMeasurement({
    eventId: overrides.eventId ?? 'ev-1',
    stationRefId: overrides.stationRefId ?? 'pk-1',
    stationCode: overrides.stationCode ?? 'BAGP',
    category: overrides.measurementCategory ?? 'wood_anderson_local',
  });
  return {
    ...base,
    channelCode: 'BHN',
    amplitude: 12.3456,
    physicalQuantity: 'displacement',
    unit: 'mm',
    convention: 'zero_to_peak',
    phaseType: 'S',
    instrumentResponseStatus: 'wood_anderson_simulated',
    correctedStatus: 'corrected',
    ...overrides,
  } as AmplitudeMeasurement;
}

// ============================================================================
// Group A: Multi-measurement model, numeric precision, & legacy compatibility
// ============================================================================

test('Group A: supports multiple distinct channels and categories per station with exact decimal precision', () => {
  const ev = cloneSampleEvent();
  const targetPick = ev.picks[0];

  const bhn = makeStructuredMeasurement({
    id: 'amp-1',
    eventId: ev.id,
    stationRefId: targetPick.id,
    stationCode: targetPick.sta,
    measurementCategory: 'wood_anderson_local',
    channelCode: 'BHN',
    amplitude: 0.0045,
    physicalQuantity: 'displacement',
    unit: 'mm',
  });
  const bhe = makeStructuredMeasurement({
    id: 'amp-2',
    eventId: ev.id,
    stationRefId: targetPick.id,
    stationCode: targetPick.sta,
    measurementCategory: 'wood_anderson_local',
    channelCode: 'BHE',
    amplitude: 0.006789,
    physicalQuantity: 'displacement',
    unit: 'mm',
  });
  const rawZ = createDefaultAmplitudeMeasurement({
    eventId: ev.id,
    stationRefId: targetPick.id,
    stationCode: targetPick.sta,
    category: 'raw_waveform',
  });
  rawZ.id = 'amp-3';
  rawZ.channelCode = 'BHZ';
  rawZ.amplitude = 18423.25;

  const updated: EQPEvent = {
    ...ev,
    picks: ev.picks.map((p, idx) =>
      idx === 0 ? { ...p, amplitude: 0.0045 } : p
    ),
    amplitudeMeasurements: [bhn, bhe, rawZ],
  };

  assert.equal(updated.amplitudeMeasurements?.length, 3);
  assert.equal(updated.amplitudeMeasurements?.[0].amplitude, 0.0045);
  assert.equal(updated.amplitudeMeasurements?.[1].amplitude, 0.006789);
  assert.equal(updated.picks[0].amplitude, 0.0045);

  const validation = validateEventAmplitudeMeasurements(updated);
  const summary = validation.stationSummariesByPickId.get(targetPick.id);
  assert.ok(summary);
  assert.equal(summary.count, 3);
  assert.deepEqual(summary.channels, ['BHN', 'BHE', 'BHZ']);
  // rawZ has raw counts -> Incomplete processing metadata, kept separate from BHN/BHE
  assert.equal(summary.label, 'Incomplete');
});

test('Group A: legacy StationPick.amplitude alone does not fabricate structured measurements', () => {
  const ev = cloneSampleEvent();
  ev.picks[0] = { ...ev.picks[0], amplitude: 150 };
  const validation = validateEventAmplitudeMeasurements(ev);
  const summary = validation.stationSummariesByPickId.get(ev.picks[0].id);
  assert.equal(summary?.count, 0);
  assert.equal(summary?.label, 'No Measurements');
});

// ============================================================================
// Group B: Validation & Scientific Eligibility Placeholders
// ============================================================================

test('Group B: rejects invalid amplitude, mismatched quantity/unit, contradictory raw metadata, and bad time windows', () => {
  const ev = cloneSampleEvent();
  const pick = ev.picks[0];
  const picksById = new Map<string, StationPick>(ev.picks.map((p) => [p.id, p]));

  const badZero = makeStructuredMeasurement({
    eventId: ev.id,
    stationRefId: pick.id,
    stationCode: pick.sta,
    amplitude: 0,
  });
  const resZero = validateAmplitudeMeasurement(badZero, { eventId: ev.id, picksById });
  assert.equal(resZero.structuralValid, false);
  assert.ok(resZero.structuralErrors.some((e) => /strictly greater than 0/i.test(e)));

  const badUnit = makeStructuredMeasurement({
    eventId: ev.id,
    stationRefId: pick.id,
    stationCode: pick.sta,
    physicalQuantity: 'counts',
    unit: 'um',
  });
  const resUnit = validateAmplitudeMeasurement(badUnit, { eventId: ev.id, picksById });
  assert.equal(resUnit.structuralValid, false);
  assert.ok(resUnit.structuralErrors.some((e) => /incompatible with unit/i.test(e)));

  const rawClaimsCalibrated = makeStructuredMeasurement({
    eventId: ev.id,
    stationRefId: pick.id,
    stationCode: pick.sta,
    instrumentResponseStatus: 'raw_uncorrected',
    physicalQuantity: 'displacement',
    unit: 'um',
    correctedStatus: 'corrected',
  });
  const resContradiction = validateAmplitudeMeasurement(rawClaimsCalibrated, {
    eventId: ev.id,
    picksById,
  });
  assert.equal(resContradiction.structuralValid, false);
  assert.ok(
    resContradiction.structuralErrors.some((e) =>
      /cannot claim calibrated ground displacement/i.test(e)
    )
  );

  const badWindow = makeStructuredMeasurement({
    eventId: ev.id,
    stationRefId: pick.id,
    stationCode: pick.sta,
    windowStartIso: '2026-11-16T05:10:00Z',
    windowEndIso: '2026-11-16T05:09:00Z',
  });
  const resWindow = validateAmplitudeMeasurement(badWindow, {
    eventId: ev.id,
    picksById,
  });
  assert.equal(resWindow.structuralValid, false);
  assert.ok(
    resWindow.structuralErrors.some((e) => /cannot precede window start/i.test(e))
  );

  const badChannel = makeStructuredMeasurement({
    eventId: ev.id,
    stationRefId: pick.id,
    stationCode: pick.sta,
    channelCode: 'BAD_CHAN',
  });
  const resChan = validateAmplitudeMeasurement(badChannel, {
    eventId: ev.id,
    picksById,
  });
  assert.equal(resChan.structuralValid, false);
  assert.ok(resChan.structuralErrors.some((e) => /invalid channel code/i.test(e)));
});

test('Group B: requires period for short_period_p and surface_wave completeness, flags clipped quality warning, and keeps future algorithms disabled', () => {
  const ev = cloneSampleEvent();
  const pick = ev.picks[0];
  const picksById = new Map<string, StationPick>(ev.picks.map((p) => [p.id, p]));

  const msNoPeriod = makeStructuredMeasurement({
    id: 'amp-ms-no-t',
    eventId: ev.id,
    stationRefId: pick.id,
    stationCode: pick.sta,
    measurementCategory: 'surface_wave',
    channelCode: 'BHZ',
    phaseType: 'Surface',
    periodSec: null,
    instrumentResponseStatus: 'response_corrected_displacement',
    correctedStatus: 'corrected',
    unit: 'um',
  });
  const resMs = validateAmplitudeMeasurement(msNoPeriod, { eventId: ev.id, picksById });
  assert.equal(resMs.structuralValid, true);
  assert.equal(resMs.processingComplete, false);
  assert.equal(resMs.statusLabel, 'Incomplete');
  assert.ok(resMs.completenessWarnings.some((w) => /Ms_20/i.test(w)));

  const clippedOk = makeStructuredMeasurement({
    id: 'amp-clipped',
    eventId: ev.id,
    stationRefId: pick.id,
    stationCode: pick.sta,
    clipped: true,
  });
  const resClipped = validateAmplitudeMeasurement(clippedOk, {
    eventId: ev.id,
    picksById,
  });
  assert.equal(resClipped.structuralValid, true);
  assert.equal(resClipped.hasQualityWarning, true);
  assert.equal(resClipped.statusLabel, 'Quality Warning');
  assert.ok(
    resClipped.scientificEligibility
      .filter((e) => e.algorithmId !== 'mlv-vertical')
      .every((e) => e.status !== 'not_evaluated_mag_a' && /disabled/i.test(e.note))
  );
  assert.equal(
    resClipped.scientificEligibility.find((e) => e.algorithmId === 'mlv-vertical')?.status,
    'ineligible_mlv'
  );

  // Duplicate IDs across event detected
  const dupEvent: EQPEvent = {
    ...ev,
    amplitudeMeasurements: [
      { ...msNoPeriod, id: 'dup-id' },
      { ...clippedOk, id: 'dup-id' },
    ],
  };
  const evValidation = validateEventAmplitudeMeasurements(dupEvent);
  assert.ok(evValidation.duplicateIds.has('dup-id'));
  assert.equal(evValidation.resultsById.get('dup-id')?.structuralValid, false);
});

// ============================================================================
// Group C: Station Association, Duplicate-Station Guard, Solver & Undo/Redo
// ============================================================================

test('Group C: preserves association across row reordering, rename, solver runs, and undo/redo', async () => {
  const ev = cloneSampleEvent();
  const secondPick = ev.picks[1];
  const m = makeStructuredMeasurement({
    id: 'amp-keep-order',
    eventId: ev.id,
    stationRefId: secondPick.id,
    stationCode: secondPick.sta,
    channelCode: 'HHN',
    amplitude: 4.125,
  });
  const withAmp: EQPEvent = {
    ...ev,
    picks: [ev.picks[1], ev.picks[0], ...ev.picks.slice(2)],
    amplitudeMeasurements: [m],
  };

  // Rename station code cleanly
  const renamed: EQPEvent = {
    ...withAmp,
    picks: withAmp.picks.map((p) =>
      p.id === secondPick.id ? { ...p, sta: 'REN1' } : p
    ),
    amplitudeMeasurements: withAmp.amplitudeMeasurements?.map((item) =>
      item.stationRefId === secondPick.id
        ? { ...item, stationCode: 'REN1' }
        : item
    ),
  };
  const summaryAfterRename = summarizeStationMeasurements(
    renamed.picks[0],
    renamed.amplitudeMeasurements?.filter((x) => x.stationRefId === renamed.picks[0].id) ?? []
  );
  assert.equal(summaryAfterRename.count, 1);
  assert.equal(summaryAfterRename.stationCode, 'REN1');

  // Undo/Redo preserves amplitudeMeasurements accurately
  const beforeSnap = extractEventPickAndOriginSnapshot(ev);
  const afterSnap = extractEventPickAndOriginSnapshot(withAmp);
  assert.equal(arePickAndOriginSnapshotsEqual(beforeSnap, afterSnap), false);
  const stack = pushEventUndoEntry([], ev, withAmp, {
    label: 'Update amplitude measurements',
  });
  assert.equal(stack.length, 1);
  const restored = applyEventUndoSnapshot(withAmp, stack[0].before);
  assert.equal(restored.amplitudeMeasurements?.length ?? 0, 0);

  // Hypocenter solver + candidate application preserves structured amplitudeMeasurements
  const candidate = calculateCandidateLocation({
    event: withAmp,
    stations: PHILSTA_DATABASE,
    solverEngine: 'EQP',
    modelId: 'jb-jbtab',
  });
  assert.equal(candidate.result.converged, true);
  const applied = applyCandidateSolutionToEvent(withAmp, candidate);
  assert.equal(applied.amplitudeMeasurements?.length, 1);
  assert.equal(applied.amplitudeMeasurements?.[0].id, 'amp-keep-order');
  assert.equal(applied.amplitudeMeasurements?.[0].stationRefId, secondPick.id);
});

test('Group C: never silently misassociates duplicate station rows when stationRefId is missing without unambiguous anchor', () => {
  const ev = cloneSampleEvent();
  const basePick = ev.picks[0];
  const dupPickA: StationPick = {
    ...basePick,
    id: 'pick-dup-a',
    sta: 'BAGP',
    pTime: '3100.00',
  };
  const dupPickB: StationPick = {
    ...basePick,
    id: 'pick-dup-b',
    sta: 'BAGP',
    pTime: '3105.00',
  };
  const eventWithDups: EQPEvent = {
    ...ev,
    picks: [dupPickA, dupPickB],
  };

  // Without anchors and missing stationRefId -> must flag ambiguous_station_match instead of attaching
  const orphanSidecar = {
    schemaVersion: 1,
    measurements: [
      makeStructuredMeasurement({
        id: 'amp-ambig',
        eventId: ev.id,
        stationRefId: 'legacy-unknown-id',
        stationCode: 'BAGP',
        amplitude: 9.5,
      }),
    ],
  };
  const reconciled = reconcileLoadedAmplitudeSidecar(eventWithDups, orphanSidecar);
  assert.equal(reconciled.amplitudeMeasurements?.length, 0);
  assert.equal(reconciled.amplitudeAssociationIssues?.length, 1);
  assert.equal(
    reconciled.amplitudeAssociationIssues?.[0].reason,
    'ambiguous_station_match'
  );

  // With unambiguous stationPickAnchors (even if picks were assigned fresh IDs by parser) -> reattaches cleanly
  const freshParsedEvent: EQPEvent = {
    ...eventWithDups,
    picks: [
      { ...dupPickA, id: 'fresh-1' },
      { ...dupPickB, id: 'fresh-2' },
    ],
  };
  const withAnchorsSidecar = {
    schemaVersion: 1,
    stationPickAnchors: buildStationPickAnchors([dupPickA, dupPickB]),
    measurements: [
      makeStructuredMeasurement({
        id: 'amp-anchored-b',
        eventId: ev.id,
        stationRefId: dupPickB.id,
        stationCode: 'BAGP',
        amplitude: 9.5,
      }),
    ],
  };
  const reconciledAnchored = reconcileLoadedAmplitudeSidecar(
    freshParsedEvent,
    withAnchorsSidecar
  );
  assert.equal(reconciledAnchored.amplitudeMeasurements?.length, 1);
  assert.equal(reconciledAnchored.amplitudeMeasurements?.[0].stationRefId, 'pick-dup-b');
  assert.equal(reconciledAnchored.picks[1].id, 'pick-dup-b');
  assert.equal(reconciledAnchored.amplitudeAssociationIssues, undefined);
});

// ============================================================================
// Group D: Sidecar Sanitization, Legacy .EQP Compatibility & History
// ============================================================================

test('Group D: sidecar roundtrip preserves fixed-width .eqp and handles malformed records gracefully', () => {
  const ev = cloneSampleEvent();
  const targetPick = ev.picks[0];
  const m = makeStructuredMeasurement({
    id: 'amp-roundtrip',
    eventId: ev.id,
    stationRefId: targetPick.id,
    stationCode: targetPick.sta,
    channelCode: 'BHZ',
    amplitude: 0.000125,
    physicalQuantity: 'displacement',
    unit: 'mm',
  });
  const savedEvent: EQPEvent = {
    ...ev,
    amplitudeMeasurements: [m],
  };

  // Legacy .eqp formatting untouched & clean parse roundtrip
  const eqpText = formatEqpFileContent({
    event: savedEvent,
    filePath: `Y:\\EARTHQUAKE\\SOLUTION_EQ\\${savedEvent.filename}`,
  });
  assert.ok(!eqpText.includes('amp-roundtrip'));
  assert.ok(!eqpText.includes('wood_anderson_local'));

  const parsedLegacy = parseEqpFileContent({
    content: eqpText,
    filename: savedEvent.filename,
    displayPath: savedEvent.filePath,
    stations: PHILSTA_DATABASE,
  });

  const sidecarPayload = {
    schemaVersion: 1,
    measurements: savedEvent.amplitudeMeasurements ?? [],
    stationPickAnchors: buildStationPickAnchors(savedEvent.picks),
  };
  const roundtripped = reconcileLoadedAmplitudeSidecar(parsedLegacy, sidecarPayload);
  assert.equal(roundtripped.amplitudeMeasurements?.length, 1);
  assert.equal(roundtripped.amplitudeMeasurements?.[0].amplitude, 0.000125);
  assert.equal(roundtripped.amplitudeMeasurements?.[0].channelCode, 'BHZ');
  assert.equal(roundtripped.amplitudeMeasurements?.[0].stationRefId, targetPick.id);

  // Malformed record inside sidecar is skipped safely without losing valid records
  const noisySidecar = {
    schemaVersion: 1,
    stationPickAnchors: buildStationPickAnchors(savedEvent.picks),
    measurements: [
      m,
      { id: 'bad-rec', stationCode: 'BAGP', amplitude: 'not-a-number' },
    ],
  };
  const sanitized = sanitizeAmplitudeSidecar(noisySidecar, savedEvent.id);
  assert.equal(sanitized.measurements.length, 1);
  assert.equal(sanitized.issues.length, 1);
  assert.equal(sanitized.issues[0].reason, 'malformed_sidecar_record');

  // History diff detects structured amplitude change cleanly
  const snapBefore = buildEqpSnapshot(ev);
  const snapAfter = buildEqpSnapshot(savedEvent);
  const diff = diffEqpVersions(snapBefore, snapAfter, { trigger: 'save' });
  assert.equal(snapBefore.amplitudeMeasurementCount, 0);
  assert.equal(snapAfter.amplitudeMeasurementCount, 1);
  assert.ok(
    diff.changes.some(
      (c) =>
        /structured amplitude/i.test(c.label) ||
        /structured amplitude/i.test(c.detail)
    )
  );
});

// ============================================================================
// Group E: MAG-0 Isolation, PLOT Checksum, Future Fingerprint Prep, & ATLAS
// ============================================================================

test('Group E: amplitude edits never invalidate PLOT location or legacy MAG-0 magnitudes while updating future amplitude fingerprints', () => {
  const baseEvent = cloneSampleEvent();
  const baselineMeta = evaluateEventMagnitudes({
    event: baseEvent,
    settings: DEFAULT_MAGNITUDE_SETTINGS,
    stations: PHILSTA_DATABASE,
  });
  const savedEvent: EQPEvent = {
    ...baseEvent,
    magnitudeMetadata: baselineMeta,
    historicalMagnitudeBaseline: computeHistoricalBaselineFingerprint(
      baseEvent,
      PHILSTA_DATABASE
    ),
  };

  const targetPick = savedEvent.picks[0];
  const mLocal = makeStructuredMeasurement({
    id: 'amp-ml-1',
    eventId: savedEvent.id,
    stationRefId: targetPick.id,
    stationCode: targetPick.sta,
    measurementCategory: 'wood_anderson_local',
    channelCode: 'BHN',
    amplitude: 5.5,
  });
  const mBodyP = makeStructuredMeasurement({
    id: 'amp-mb-1',
    eventId: savedEvent.id,
    stationRefId: targetPick.id,
    stationCode: targetPick.sta,
    measurementCategory: 'short_period_p',
    channelCode: 'BHZ',
    phaseType: 'P',
    periodSec: 0.9,
    amplitude: 0.42,
    physicalQuantity: 'displacement',
    unit: 'um',
    instrumentResponseStatus: 'response_corrected_displacement',
  });

  const ampEditedEvent: EQPEvent = {
    ...savedEvent,
    picks: savedEvent.picks.map((p, idx) =>
      idx === 0 ? { ...p, amplitude: 123.456 } : p
    ),
    amplitudeMeasurements: [mLocal, mBodyP],
  };

  // PLOT location checksum untouched
  assert.equal(
    computeObservationSnapshotChecksum(savedEvent, PHILSTA_DATABASE),
    computeObservationSnapshotChecksum(ampEditedEvent, PHILSTA_DATABASE)
  );

  // MAG-0 legacy baseline and freshness untouched (remains current, NOT stale)
  assert.equal(
    computeHistoricalBaselineFingerprint(savedEvent, PHILSTA_DATABASE),
    computeHistoricalBaselineFingerprint(ampEditedEvent, PHILSTA_DATABASE)
  );
  const freshnessAfter = inspectMagnitudeFreshness(
    ampEditedEvent,
    ampEditedEvent.magnitudeMetadata,
    DEFAULT_MAGNITUDE_SETTINGS,
    PHILSTA_DATABASE
  );
  assert.equal(freshnessAfter.isStale, false);

  // Legacy duration magnitude algorithms remain current
  assert.equal(
    computeAlgorithmInputFingerprint('eqp-legacy-ms', savedEvent, DEFAULT_MAGNITUDE_SETTINGS, PHILSTA_DATABASE),
    computeAlgorithmInputFingerprint('eqp-legacy-ms', ampEditedEvent, DEFAULT_MAGNITUDE_SETTINGS, PHILSTA_DATABASE)
  );
  assert.equal(
    computeAlgorithmInputFingerprint('md-duration', savedEvent, DEFAULT_MAGNITUDE_SETTINGS, PHILSTA_DATABASE),
    computeAlgorithmInputFingerprint('md-duration', ampEditedEvent, DEFAULT_MAGNITUDE_SETTINGS, PHILSTA_DATABASE)
  );

  // Future amplitude algorithms reflect relevant measurement inputs while staying disabled
  assert.notEqual(
    computeAlgorithmInputFingerprint('ml-local', savedEvent, DEFAULT_MAGNITUDE_SETTINGS, PHILSTA_DATABASE),
    computeAlgorithmInputFingerprint('ml-local', ampEditedEvent, DEFAULT_MAGNITUDE_SETTINGS, PHILSTA_DATABASE)
  );
  assert.notEqual(
    computeAlgorithmInputFingerprint('mb-body', savedEvent, DEFAULT_MAGNITUDE_SETTINGS, PHILSTA_DATABASE),
    computeAlgorithmInputFingerprint('mb-body', ampEditedEvent, DEFAULT_MAGNITUDE_SETTINGS, PHILSTA_DATABASE)
  );
  // ms-20 unaffected because only wood_anderson_local & short_period_p were added
  assert.equal(
    computeAlgorithmInputFingerprint('ms-20', savedEvent, DEFAULT_MAGNITUDE_SETTINGS, PHILSTA_DATABASE),
    computeAlgorithmInputFingerprint('ms-20', ampEditedEvent, DEFAULT_MAGNITUDE_SETTINGS, PHILSTA_DATABASE)
  );

  const stillDisabledAlgos = MAGNITUDE_ALGORITHMS.filter((a) =>
    ['ml-local', 'mb-body', 'ms-20'].includes(a.id)
  );
  assert.equal(stillDisabledAlgos.length, 3);
  assert.ok(stillDisabledAlgos.every((a) => a.implemented === false));

  const mlvAlgo = MAGNITUDE_ALGORITHMS.find((a) => a.id === 'mlv-vertical');
  assert.equal(mlvAlgo?.implemented, true);

  const postEval = evaluateEventMagnitudes({
    event: ampEditedEvent,
    settings: {
      ...DEFAULT_MAGNITUDE_SETTINGS,
      enabledMethods: [
        'eqp-legacy-ms',
        'ml-local',
        'mlv-vertical',
        'mb-body',
        'ms-20',
      ],
    },
    stations: PHILSTA_DATABASE,
  });
  assert.ok(
    stillDisabledAlgos.every(
      (a) =>
        postEval.resultsByAlgorithm[a.id]?.status === 'unsupported_algorithm' &&
        postEval.resultsByAlgorithm[a.id]?.networkMagnitude === null
    )
  );
  // Default MAG-B MLv calibration is pending_calibration -> returns missing_calibration with null magnitude
  assert.equal(
    postEval.resultsByAlgorithm['mlv-vertical']?.status,
    'missing_calibration'
  );
  assert.equal(
    postEval.resultsByAlgorithm['mlv-vertical']?.networkMagnitude,
    null
  );
});

test('Group E: ATLAS/HYDRA append preserves existing amplitudeMeasurements and empty-workspace populate clears stale records', () => {
  const atlasText = [
    '201105271731107416 4188122E4010  137    14                                                                                                       0',
    '$1',
    'BAGP PV  EHZ  P 0201105271731 4054               6                                0     139',
    '$',
    '                                                              0',
    '$                                                             0',
  ].join('\n');
  const parsed = parseAtlasHydraClipboard(atlasText, PHILSTA_DATABASE);
  assert.equal(parsed.valid, true);

  const base = cloneSampleEvent();
  const existingAmp = makeStructuredMeasurement({
    id: 'amp-before-append',
    eventId: base.id,
    stationRefId: base.picks[0].id,
    stationCode: base.picks[0].sta,
  });
  const withPicksAndAmp: EQPEvent = {
    ...base,
    amplitudeMeasurements: [existingAmp],
  };

  const appended = appendAtlasParseToEqpEvent(withPicksAndAmp, parsed);
  assert.equal(appended.mode, 'appended-existing');
  assert.equal(appended.event.amplitudeMeasurements?.length, 1);
  assert.equal(appended.event.amplitudeMeasurements?.[0].id, 'amp-before-append');

  const emptyWithStaleAmp: EQPEvent = {
    ...base,
    picks: [],
    amplitudeMeasurements: [existingAmp],
  };
  const populated = appendAtlasParseToEqpEvent(emptyWithStaleAmp, parsed);
  assert.equal(populated.mode, 'populated-empty');
  assert.equal(populated.event.amplitudeMeasurements?.length ?? 0, 0);
});
