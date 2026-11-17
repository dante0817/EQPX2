import test from 'node:test';
import assert from 'node:assert/strict';
import { EQPEvent, INITIAL_EVENTS, StationMeta, StationPick } from '../src/data/eqpData';
import {
  applyOutlierFilteredMagnitudeToEvent,
  buildDurationRowsWithOutlierFilter,
  computeDurationOutlierSummary,
} from '../src/utils/legacyMagnitudeMath';
import {
  aggregateStationMagnitudes,
  approveUncalibratedMagnitudeMetadata,
  buildHistoricalSavedMagnitudeMetadata,
  computeHistoricalBaselineFingerprint,
  DEFAULT_MAGNITUDE_SETTINGS,
  describeDurationSource,
  evaluateDurationMagnitudeMd,
  evaluateEventMagnitudes,
  formatLegacyScaleLong,
  formatLegacyScaleShort,
  hasValidUncalibratedApproval,
  inspectMagnitudeFreshness,
  MagnitudeSettings,
  resolveBulletinMagnitude,
  sanitizeMagnitudeSettings,
} from '../src/utils/magnitudeEngine';
import { buildBulletinHtmlDocument } from '../src/utils/bulletinHtml';
import { downloadBulletinPdf } from '../src/utils/bulletinPdf';
import { buildEqpSaveTarget } from '../src/utils/eqpStorage';
import { DEFAULT_DATA_PRINT_CONFIG, formatDataPrintText } from '../src/utils/dataPrint';

function cloneSampleEvent(): EQPEvent {
  return structuredClone(INITIAL_EVENTS[0]) as EQPEvent;
}

function makeVerifiedCodaEvent(): EQPEvent {
  const ev = applyOutlierFilteredMagnitudeToEvent(cloneSampleEvent(), 1.5).event;
  return {
    ...ev,
    picks: ev.picks.map((p) =>
      p.duration !== null && p.duration > 0
        ? { ...p, durationSource: 'manual_coda' as const }
        : p
    ),
  };
}

function makePick(overrides: Partial<StationPick> = {}): StationPick {
  return {
    id: overrides.id ?? 'pk-1',
    sta: overrides.sta ?? 'BAGP',
    pTime: overrides.pTime ?? '3100.00',
    pExcluded: overrides.pExcluded ?? false,
    sTime: overrides.sTime ?? '',
    sExcluded: overrides.sExcluded ?? false,
    duration: overrides.duration !== undefined ? overrides.duration : 100,
    durationSource:
      'durationSource' in overrides ? overrides.durationSource : 'manual_coda',
    amplitude: overrides.amplitude ?? null,
    polarity: overrides.polarity ?? '',
    quality: overrides.quality ?? 'A',
    lat: overrides.lat ?? 16.41,
    lon: overrides.lon ?? 120.59,
    toa: overrides.toa ?? 45,
    azim: overrides.azim ?? 180,
    delta: overrides.delta ?? 1.0,
    resP: overrides.resP ?? 0,
    resS: overrides.resS ?? 0,
    obsP: overrides.obsP ?? 20,
    obsS: overrides.obsS ?? 0,
    calcP: overrides.calcP ?? 20,
    calcS: overrides.calcS ?? 0,
    ms: overrides.ms ?? 0,
    mb: overrides.mb ?? 0,
    md: overrides.md ?? 0,
    magExcluded: overrides.magExcluded,
    atlasMetadata: overrides.atlasMetadata,
  };
}

function makeExperimentalMdSettings(
  overrides: Partial<MagnitudeSettings['mdConfig']> = {},
  aggregation: MagnitudeSettings['networkAggregation'] = 'median'
): MagnitudeSettings {
  return sanitizeMagnitudeSettings({
    ...DEFAULT_MAGNITUDE_SETTINGS,
    defaultMethod: 'md-duration',
    enabledMethods: ['eqp-legacy-ms', 'md-duration'],
    networkAggregation: aggregation,
    mdConfig: {
      ...DEFAULT_MAGNITUDE_SETTINGS.mdConfig,
      calibrationStatus: 'experimental_uncalibrated',
      allowExperimentalEvaluation: true,
      coefficients: {
        a: -1.0,
        b: 2.0,
        c: 0.002,
        d: 0.003,
        e: 0.001,
      },
      ...overrides,
    },
  });
}

// GROUP A — Magnitude Result Freshness & Historical Preservation
test('MAG-0 Group A: Freshness marks stale on observation/location/setting changes and stays current on UI-only edits', () => {
  const baseEv = makeVerifiedCodaEvent();
  const mdSettings = makeExperimentalMdSettings();
  const stations: StationMeta[] = [];

  const meta = evaluateEventMagnitudes({
    event: baseEv,
    settings: mdSettings,
    stations,
  });
  const currentEvent: EQPEvent = { ...baseEv, magnitudeMetadata: meta };

  const initialFresh = inspectMagnitudeFreshness(currentEvent, meta, mdSettings, stations);
  assert.equal(initialFresh.status, 'current');
  assert.equal(initialFresh.isStale, false);
  assert.equal(initialFresh.badgeLabel, 'Current');

  // Non-computational / UI-only edits must NOT invalidate magnitude calculation
  const uiEditedEvent: EQPEvent = {
    ...currentEvent,
    issuedBy: 'ANALYST-2',
    bulletinNote1: 'Advisory note',
    remarks: 'Felt in nearby town',
    expectingAftershocks: true,
    magnitudeMetadata: {
      ...meta,
      evaluatedAt: '2099-01-01T00:00:00.000Z',
    },
  };
  const uiFresh = inspectMagnitudeFreshness(
    uiEditedEvent,
    uiEditedEvent.magnitudeMetadata,
    mdSettings,
    stations
  );
  assert.equal(uiFresh.status, 'current');
  assert.equal(uiFresh.isStale, false);

  // 1. Duration edit invalidates magnitude
  const durEdited: EQPEvent = {
    ...currentEvent,
    picks: currentEvent.picks.map((p, idx) =>
      idx === 1 ? { ...p, duration: (p.duration ?? 100) + 45 } : p
    ),
  };
  const durFresh = inspectMagnitudeFreshness(durEdited, meta, mdSettings, stations);
  assert.equal(durFresh.isStale, true);
  assert.equal(durFresh.status, 'recalculation_required');
  assert.equal(durFresh.badgeLabel, 'Recalculation Required');

  // 2. P pick inclusion/exclusion edit invalidates magnitude
  const exclEdited: EQPEvent = {
    ...currentEvent,
    picks: currentEvent.picks.map((p, idx) =>
      idx === 1 ? { ...p, pExcluded: true } : p
    ),
  };
  assert.equal(
    inspectMagnitudeFreshness(exclEdited, meta, mdSettings, stations).isStale,
    true
  );

  // 3. Pick addition / removal invalidates magnitude
  const removedPickEv: EQPEvent = {
    ...currentEvent,
    picks: currentEvent.picks.slice(0, -1),
  };
  assert.equal(
    inspectMagnitudeFreshness(removedPickEv, meta, mdSettings, stations).isStale,
    true
  );

  // 4. Hypocenter lat/lon/depth changes invalidate Md
  const movedLatEv: EQPEvent = { ...currentEvent, lat: currentEvent.lat + 0.15 };
  assert.equal(
    inspectMagnitudeFreshness(movedLatEv, meta, mdSettings, stations).isStale,
    true
  );
  const movedDepthEv: EQPEvent = { ...currentEvent, depthKm: currentEvent.depthKm + 15 };
  assert.equal(
    inspectMagnitudeFreshness(movedDepthEv, meta, mdSettings, stations).isStale,
    true
  );

  // 5. Calibration coefficient, station correction, and aggregation changes invalidate Md
  const changedCoeffSettings = makeExperimentalMdSettings({
    coefficients: { a: -1.2, b: 2.0, c: 0.002, d: 0.003, e: 0.001 },
  });
  assert.equal(
    inspectMagnitudeFreshness(currentEvent, meta, changedCoeffSettings, stations).isStale,
    true
  );

  const changedCorrectionSettings = makeExperimentalMdSettings({
    stationCorrections: { OCL: 0.35 },
  });
  assert.equal(
    inspectMagnitudeFreshness(currentEvent, meta, changedCorrectionSettings, stations).isStale,
    true
  );

  const changedAggSettings = makeExperimentalMdSettings({}, 'arithmetic_mean');
  assert.equal(
    inspectMagnitudeFreshness(currentEvent, meta, changedAggSettings, stations).isStale,
    true
  );

  // 6. Legacy variance K change invalidates EQP Legacy Ms
  const legacySettings = sanitizeMagnitudeSettings({
    ...DEFAULT_MAGNITUDE_SETTINGS,
    defaultMethod: 'eqp-legacy-ms',
    legacyVarianceK: 1.5,
  });
  const legacyMeta = evaluateEventMagnitudes({
    event: baseEv,
    settings: legacySettings,
    stations,
  });
  assert.equal(
    inspectMagnitudeFreshness(
      { ...baseEv, magnitudeMetadata: legacyMeta },
      legacyMeta,
      legacySettings,
      stations
    ).isStale,
    false
  );
  const changedKSettings = sanitizeMagnitudeSettings({
    ...legacySettings,
    legacyVarianceK: 2.2,
  });
  assert.equal(
    inspectMagnitudeFreshness(
      { ...baseEv, magnitudeMetadata: legacyMeta },
      legacyMeta,
      changedKSettings,
      stations
    ).isStale,
    true
  );

  // 7. Recalculation restores current status without altering hypocenter coordinates
  const recalcMeta = evaluateEventMagnitudes({
    event: movedDepthEv,
    settings: mdSettings,
    stations,
  });
  const recalcFresh = inspectMagnitudeFreshness(
    { ...movedDepthEv, magnitudeMetadata: recalcMeta },
    recalcMeta,
    mdSettings,
    stations
  );
  assert.equal(recalcFresh.status, 'current');
  assert.equal(recalcFresh.isStale, false);
});

test('MAG-0 Group A: Historical saved file preserves saved magnitude without auto-recomputation until modified', () => {
  const historicalEv: EQPEvent = {
    ...cloneSampleEvent(),
    ms: 4.9,
    mb: 4.7,
    md: 4.5,
    preferredScale: 'Ms',
  };
  const baseline = computeHistoricalBaselineFingerprint(historicalEv);
  const histMeta = buildHistoricalSavedMagnitudeMetadata({ event: historicalEv });
  const loadedHistorical: EQPEvent = {
    ...historicalEv,
    historicalMagnitudeBaseline: baseline,
    magnitudeMetadata: histMeta,
  };

  assert.equal(histMeta.originState, 'historical_saved');
  assert.equal(histMeta.selectedMagnitude, 4.9);

  const freshLoaded = inspectMagnitudeFreshness(
    loadedHistorical,
    loadedHistorical.magnitudeMetadata,
    DEFAULT_MAGNITUDE_SETTINGS
  );
  assert.equal(freshLoaded.status, 'historical_saved');
  assert.equal(freshLoaded.badgeLabel, 'Historical Saved Result');
  assert.equal(freshLoaded.isStale, false);

  const histRes = resolveBulletinMagnitude(loadedHistorical, freshLoaded);
  assert.equal(histRes.displayText, 'Ms 4.9');
  assert.equal(histRes.canPublish, true);

  // Modifying pick duration after opening flags Historical Modified / Recalculation Required
  const modifiedHist: EQPEvent = {
    ...loadedHistorical,
    picks: loadedHistorical.picks.map((p, idx) =>
      idx === 1 ? { ...p, duration: 300 } : p
    ),
  };
  const modFresh = inspectMagnitudeFreshness(
    modifiedHist,
    modifiedHist.magnitudeMetadata,
    DEFAULT_MAGNITUDE_SETTINGS
  );
  assert.equal(modFresh.status, 'historical_modified');
  assert.equal(modFresh.badgeLabel, 'Recalculation Required');
  assert.equal(modFresh.isStale, true);

  const staleHistRes = resolveBulletinMagnitude(modifiedHist, modFresh);
  assert.equal(staleHistRes.canPublish, false);
  assert.equal(staleHistRes.displayText, 'Pending (Recalculation required)');
});

// GROUP B — Analyst Approval Invalidation
test('MAG-0 Group B: Uncalibrated approval binds to calculation identity and invalidates on change or bare legacy flag', () => {
  const ev = makeVerifiedCodaEvent();
  const settings = makeExperimentalMdSettings();

  const meta1 = evaluateEventMagnitudes({ event: ev, settings });
  assert.equal(meta1.selectedStatus, 'valid');
  assert.ok(meta1.currentCalculationId);
  assert.equal(hasValidUncalibratedApproval(meta1), false);

  // Bare legacy boolean without matching approvedCalculationId must NOT be accepted
  const bareUntiedMeta = {
    ...meta1,
    analystApprovedUncalibrated: true,
    approvedCalculationId: undefined,
  };
  assert.equal(hasValidUncalibratedApproval(bareUntiedMeta), false);
  const bareRes = resolveBulletinMagnitude({ ...ev, magnitudeMetadata: bareUntiedMeta });
  assert.equal(bareRes.requiresAnalystConfirmation, true);
  assert.equal(bareRes.canPublish, false);

  // Valid calculation-bound approval authorizes bulletin resolution
  const approvedMeta1 = approveUncalibratedMagnitudeMetadata(meta1, true);
  assert.equal(hasValidUncalibratedApproval(approvedMeta1), true);
  assert.equal(approvedMeta1.approvedCalculationId, meta1.currentCalculationId);

  const approvedRes1 = resolveBulletinMagnitude({
    ...ev,
    magnitudeMetadata: approvedMeta1,
  });
  assert.equal(approvedRes1.canPublish, true);
  assert.equal(approvedRes1.requiresAnalystConfirmation, false);
  assert.match(approvedRes1.displayText, /^Md \d+\.\d \(Experimental \/ Uncalibrated\)$/);

  // Changing observation makes calculation stale and blocks bulletin even with old approval
  const editedEv: EQPEvent = {
    ...ev,
    picks: ev.picks.map((p, idx) =>
      idx === 1 ? { ...p, duration: (p.duration ?? 100) + 25 } : p
    ),
    magnitudeMetadata: approvedMeta1,
  };
  const editedFresh = inspectMagnitudeFreshness(editedEv, approvedMeta1, settings);
  assert.equal(editedFresh.isStale, true);
  const editedRes = resolveBulletinMagnitude(editedEv, editedFresh);
  assert.equal(editedRes.canPublish, false);
  assert.equal(editedRes.displayText, 'Pending (Recalculation required)');

  // Recalculating produces a new calculation identity; prior approvedCalculationId is invalid!
  const meta2 = evaluateEventMagnitudes({ event: editedEv, settings });
  assert.notEqual(meta2.currentCalculationId, meta1.currentCalculationId);
  const carriedOldApproval = {
    ...meta2,
    analystApprovedUncalibrated: true,
    approvedCalculationId: approvedMeta1.approvedCalculationId,
  };
  assert.equal(hasValidUncalibratedApproval(carriedOldApproval), false);
  const carriedRes = resolveBulletinMagnitude({
    ...editedEv,
    magnitudeMetadata: carriedOldApproval,
  });
  assert.equal(carriedRes.requiresAnalystConfirmation, true);
  assert.equal(carriedRes.canPublish, false);
});

// GROUP C — Legacy Labeling & Mathematical Compatibility
test('MAG-0 Group C: Legacy labels map Md->ML cleanly while preserving numeric EQP Legacy Ms and internal Ml math key', () => {
  assert.equal(formatLegacyScaleShort('Ms'), 'Ms');
  assert.equal(formatLegacyScaleShort('Mb'), 'Mb');
  assert.equal(formatLegacyScaleShort('Md'), 'ML');
  assert.equal(formatLegacyScaleLong('Md'), 'ML — EQP Legacy');

  const ev = cloneSampleEvent();
  const legacy = applyOutlierFilteredMagnitudeToEvent(ev, 1.5);
  assert.equal(legacy.ms, 4.2);

  // Outlier helper compatibility contract for tests/magnitudeOutlier.test.ts preserved
  const { rows } = buildDurationRowsWithOutlierFilter(ev, 'Md', 1.5);
  const outlierSummary = computeDurationOutlierSummary(rows, 'Md', 1.5);
  assert.equal(outlierSummary.scaleLabel, 'Ml');

  // When legacy preferredScale === 'Md', bulletin resolves to ML (never mislabeled Md)
  const legacyMlEv: EQPEvent = {
    ...legacy.event,
    preferredScale: 'Md',
  };
  const mlRes = resolveBulletinMagnitude(legacyMlEv);
  assert.equal(mlRes.scaleLabel, 'ML');
  assert.equal(mlRes.displayText, `ML ${legacy.md.toFixed(1)}`);
  assert.equal(mlRes.isAuthoritative, true);
});

// GROUP D — Network Aggregation & Duration Provenance
test('MAG-0 Group D: Trimmed mean falls back cleanly below N=10 and trims tails accurately for N>=10', () => {
  // Small sample N = 3 -> fallback to arithmetic mean, trimmedCount = 0
  const small3 = aggregateStationMagnitudes([4.0, 4.3, 4.6], 'trimmed_mean');
  assert.ok(small3);
  assert.equal(small3.trimmedCount, 0);
  assert.equal(small3.contributingCount, 3);
  assert.equal(small3.totalEligible, 3);
  assert.equal(small3.aggregationUsed, 'arithmetic_mean');
  assert.equal(small3.fallbackApplied, true);
  assert.equal(small3.value, 4.3);

  // N = 3 inside evaluateDurationMagnitudeMd emits explicit fallback aggregationNote
  const smallEv: EQPEvent = {
    ...makeVerifiedCodaEvent(),
    picks: [
      makePick({ id: 's1', sta: 'ST1', duration: 90, delta: 0.8 }),
      makePick({ id: 's2', sta: 'ST2', duration: 110, delta: 1.0 }),
      makePick({ id: 's3', sta: 'ST3', duration: 130, delta: 1.2 }),
    ],
  };
  const trimmedEval = evaluateDurationMagnitudeMd(
    smallEv,
    makeExperimentalMdSettings({}, 'trimmed_mean')
  );
  assert.equal(trimmedEval.status, 'valid');
  assert.equal(trimmedEval.trimmedCount, 0);
  assert.equal(trimmedEval.fallbackApplied, true);
  assert.equal(trimmedEval.aggregationUsed, 'arithmetic_mean');
  assert.ok(trimmedEval.aggregationNote?.includes('fell back to arithmetic mean'));

  // N = 9 -> k = floor(0.9) = 0 -> fallback to arithmetic mean
  const small9 = aggregateStationMagnitudes(
    [3.8, 4.0, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.2],
    'trimmed_mean'
  );
  assert.ok(small9);
  assert.equal(small9.trimmedCount, 0);
  assert.equal(small9.contributingCount, 9);
  assert.equal(small9.fallbackApplied, true);
  assert.equal(small9.aggregationUsed, 'arithmetic_mean');

  // N = 10 -> k = 1 -> trims 1 low + 1 high (2 trimmed, 8 contributing)
  const ten = aggregateStationMagnitudes(
    [2.0, 4.0, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 9.0],
    'trimmed_mean'
  );
  assert.ok(ten);
  assert.equal(ten.trimmedCount, 2);
  assert.equal(ten.contributingCount, 8);
  assert.equal(ten.totalEligible, 10);
  assert.equal(ten.fallbackApplied, false);
  assert.equal(ten.aggregationUsed, 'trimmed_mean');
});

test('MAG-0 Group D: Duration provenance separates presence from verified coda definition', () => {
  assert.equal(
    describeDurationSource(makePick({ duration: 100, durationSource: 'manual_coda' }))
      .verifiedCoda,
    true
  );
  assert.equal(
    describeDurationSource(makePick({ duration: 100, durationSource: 'atlas_coda' }))
      .verifiedCoda,
    true
  );
  assert.equal(
    describeDurationSource(makePick({ duration: 100, durationSource: 'legacy_eqp' }))
      .verifiedCoda,
    false
  );
  assert.equal(
    describeDurationSource(makePick({ duration: 100, durationSource: 's_minus_p' }))
      .verifiedCoda,
    false
  );
  assert.equal(
    describeDurationSource(makePick({ duration: 100, durationSource: 'unknown' }))
      .verifiedCoda,
    false
  );

  // Missing durationSource even when atlasMetadata is present must NOT auto-verify as coda
  const unconfirmedAtlasPick = makePick({
    duration: 100,
    durationSource: undefined,
    atlasMetadata: {
      rawLine: 'TEST',
      durationSeconds: 100,
    } as unknown as StationPick['atlasMetadata'],
  });
  const unconfirmedDesc = describeDurationSource(unconfirmedAtlasPick);
  assert.equal(unconfirmedDesc.isPresent, true);
  assert.equal(unconfirmedDesc.verifiedCoda, false);
});

// GROUP E — Bulletin Consistency, Output Guards & Filenames
test('MAG-0 Group E: Bulletin HTML/PDF/DataPrint/Save-Target share unified boundary guards', () => {
  const baseEv = makeVerifiedCodaEvent();
  const settings = makeExperimentalMdSettings();
  const meta = evaluateEventMagnitudes({ event: baseEv, settings });
  const unapprovedEvent: EQPEvent = { ...baseEv, magnitudeMetadata: meta };

  // 1. Unapproved experimental Md cannot enter bulletin HTML stamp or PDF
  const unapprovedHtml = buildBulletinHtmlDocument({
    event: unapprovedEvent,
    primaryLocationLabel: '102 km N 56° E of City Of Tacloban',
    faultGeneratorLabel: null,
    printSource: false,
  });
  assert.ok(unapprovedHtml.includes('Pending (Md uncalibrated)'));
  assert.ok(unapprovedHtml.includes('M00'));

  assert.throws(
    () =>
      downloadBulletinPdf({
        event: unapprovedEvent,
        primaryLocationLabel: '102 km N 56° E of City Of Tacloban',
        faultGeneratorLabel: null,
        includeFaultGenerator: false,
        includeMapAsset: false,
        includeChartsAsset: false,
        highlightResP: true,
        highlightResS: true,
        varianceK: 1.5,
      }),
    /requires explicit analyst confirmation/
  );

  const unapprovedSave = buildEqpSaveTarget(unapprovedEvent, 'Y:');
  assert.equal(unapprovedSave.magCode, '00');
  assert.ok(unapprovedSave.filename.includes('_M00D'));

  // 2. Approved experimental Md carries explicit status in HTML & Data Print and reflects numeric Mxx in save target
  const approvedEvent: EQPEvent = {
    ...baseEv,
    magnitudeMetadata: approveUncalibratedMagnitudeMetadata(meta, true),
  };
  const approvedFresh = inspectMagnitudeFreshness(
    approvedEvent,
    approvedEvent.magnitudeMetadata,
    settings
  );
  const approvedHtml = buildBulletinHtmlDocument({
    event: approvedEvent,
    primaryLocationLabel: '102 km N 56° E of City Of Tacloban',
    faultGeneratorLabel: null,
    printSource: false,
    freshness: approvedFresh,
  });
  assert.ok(approvedHtml.includes('(Experimental / Uncalibrated)'));
  assert.ok(approvedHtml.includes('Analyst Confirmed'));

  const approvedDataText = formatDataPrintText({
    event: approvedEvent,
    primaryLocationLabel: '102 km N 56° E of City Of Tacloban',
    faultGeneratorLabel: null,
    config: DEFAULT_DATA_PRINT_CONFIG,
    freshness: approvedFresh,
  });
  assert.ok(approvedDataText.includes('(Experimental / Uncalibrated)'));

  const approvedSave = buildEqpSaveTarget(approvedEvent, 'Y:', { freshness: approvedFresh });
  const expectedMagCode = String(
    Math.round((approvedEvent.magnitudeMetadata?.selectedMagnitude ?? 0) * 10)
  ).padStart(2, '0');
  assert.equal(approvedSave.magCode, expectedMagCode);

  // 3. Stale magnitude blocks PDF/HTML stamp & resets save filename Mxx to M00
  const staleEvent: EQPEvent = {
    ...approvedEvent,
    picks: approvedEvent.picks.map((p, idx) =>
      idx === 1 ? { ...p, duration: 400 } : p
    ),
  };
  const staleFresh = inspectMagnitudeFreshness(
    staleEvent,
    staleEvent.magnitudeMetadata,
    settings
  );
  assert.equal(staleFresh.isStale, true);

  const staleHtml = buildBulletinHtmlDocument({
    event: staleEvent,
    primaryLocationLabel: '102 km N 56° E of City Of Tacloban',
    faultGeneratorLabel: null,
    printSource: false,
    freshness: staleFresh,
  });
  assert.ok(staleHtml.includes('Pending (Recalculation required)'));
  assert.ok(staleHtml.includes('M00'));

  assert.throws(
    () =>
      downloadBulletinPdf({
        event: staleEvent,
        primaryLocationLabel: '102 km N 56° E of City Of Tacloban',
        faultGeneratorLabel: null,
        includeFaultGenerator: false,
        includeMapAsset: false,
        includeChartsAsset: false,
        highlightResP: true,
        highlightResS: true,
        varianceK: 1.5,
        freshness: staleFresh,
      }),
    /changed since last evaluation|Recalculate/i
  );

  const staleSave = buildEqpSaveTarget(staleEvent, 'Y:', { freshness: staleFresh });
  assert.equal(staleSave.magCode, '00');
});
