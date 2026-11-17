import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EQPEvent,
  INITIAL_EVENTS,
  PHILSTA_DATABASE,
  StationPick,
} from '../src/data/eqpData';
import { applyOutlierFilteredMagnitudeToEvent } from '../src/utils/legacyMagnitudeMath';
import { parseAtlasHydraClipboard } from '../src/utils/atlasHydraParser';
import { AmplitudeMeasurement } from '../src/utils/amplitudeMeasurements';
import {
  SEISCOMP_REFERENCE_MLV_PROFILE,
  approveUncalibratedMagnitudeMetadata,
  canSelectMethodAsPreferred,
  computeCalculationIdentity,
  DEFAULT_MAGNITUDE_SETTINGS,
  evaluateEventMagnitudes,
  hasValidUncalibratedApproval,
  inspectMagnitudeFreshness,
  MAGNITUDE_ALGORITHMS,
  MagnitudeSettings,
  resolveBulletinMagnitude,
  resolveEventMethodSelection,
  sanitizeMagnitudeSettings,
  selectPreferredMethodOnEventMetadata,
  updateEventMethodSelection,
} from '../src/utils/magnitudeEngine';
import { buildBulletinHtmlDocument } from '../src/utils/bulletinHtml';
import { downloadBulletinPdf } from '../src/utils/bulletinPdf';
import { buildEqpSaveTarget } from '../src/utils/eqpStorage';
import {
  DEFAULT_DATA_PRINT_CONFIG,
  formatDataPrintText,
} from '../src/utils/dataPrint';

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

function makeWaZMeasurement(params: {
  id: string;
  eventId: string;
  stationRefId: string;
  stationCode: string;
  channelCode?: string;
  amplitude: number;
}): AmplitudeMeasurement {
  return {
    id: params.id,
    eventId: params.eventId,
    stationRefId: params.stationRefId,
    stationCode: params.stationCode,
    networkCode: 'PV',
    locationCode: '00',
    channelCode: params.channelCode ?? 'BHZ',
    measurementCategory: 'wood_anderson_local',
    physicalQuantity: 'displacement',
    amplitude: params.amplitude,
    unit: 'mm',
    convention: 'zero_to_peak',
    phaseType: 'S',
    periodSec: null,
    windowStartIso: null,
    windowEndIso: null,
    instrumentResponseStatus: 'wood_anderson_simulated',
    correctedStatus: 'corrected',
    clipped: false,
    excluded: false,
    source: 'waveform_pick',
    quality: 'A',
    notes: 'MAG-C test WA-Z',
    createdAt: '2026-11-16T00:00:00.000Z',
    updatedAt: '2026-11-16T00:00:00.000Z',
  } as AmplitudeMeasurement;
}

function attachMlvAmplitudes(ev: EQPEvent): EQPEvent {
  return {
    ...ev,
    amplitudeMeasurements: [
      makeWaZMeasurement({
        id: 'magc-amp-1',
        eventId: ev.id,
        stationRefId: ev.picks[0].id,
        stationCode: ev.picks[0].sta,
        channelCode: 'BHZ',
        amplitude: 8,
      }),
      makeWaZMeasurement({
        id: 'magc-amp-2',
        eventId: ev.id,
        stationRefId: ev.picks[1].id,
        stationCode: ev.picks[1].sta,
        channelCode: 'HHZ',
        amplitude: 14,
      }),
    ],
  };
}

function makeMultiMethodSettings(overrides: Partial<MagnitudeSettings> = {}): MagnitudeSettings {
  return sanitizeMagnitudeSettings({
    ...DEFAULT_MAGNITUDE_SETTINGS,
    defaultMethod: 'eqp-legacy-ms',
    enabledMethods: ['eqp-legacy-ms', 'md-duration', 'mlv-vertical'],
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
    },
    mlvConfig: {
      ...SEISCOMP_REFERENCE_MLV_PROFILE,
      calibrationStatus: 'experimental_uncalibrated',
      allowExperimentalEvaluation: true,
    },
    ...overrides,
  });
}

// GROUP A — Method Selection
test('MAG-C Group A: Global inheritance, per-event custom selection, zero-method state, and unimplemented disabling', () => {
  const ev = attachMlvAmplitudes(makeVerifiedCodaEvent());
  const globalSettings = makeMultiMethodSettings({
    defaultMethod: 'eqp-legacy-ms',
    enabledMethods: ['eqp-legacy-ms', 'mlv-vertical'],
  });

  // 1. Default event inherits global settings
  const initialSel = resolveEventMethodSelection(ev, globalSettings);
  assert.equal(initialSel.mode, 'inherit_global');
  assert.deepEqual(initialSel.selectedMethods, ['eqp-legacy-ms', 'mlv-vertical']);
  assert.equal(initialSel.preferredMethodId, 'eqp-legacy-ms');

  // 2. Customize event to evaluate all three implemented methods
  const customMeta = evaluateEventMagnitudes({
    event: ev,
    settings: globalSettings,
    stations: PHILSTA_DATABASE,
    methodSelectionModeOverride: 'custom',
    selectedMethodsOverride: ['eqp-legacy-ms', 'md-duration', 'mlv-vertical'],
  });
  assert.equal(customMeta.methodSelectionMode, 'custom');
  assert.deepEqual(customMeta.selectedMethods, [
    'eqp-legacy-ms',
    'md-duration',
    'mlv-vertical',
  ]);
  assert.equal(customMeta.resultsByAlgorithm['eqp-legacy-ms']?.status, 'valid');
  assert.equal(customMeta.resultsByAlgorithm['md-duration']?.status, 'valid');
  assert.equal(customMeta.resultsByAlgorithm['mlv-vertical']?.status, 'valid');

  // 3. Explicit zero-selected-methods state clears publishability & retains prior results as deselected
  const zeroMeta = updateEventMethodSelection({
    metadata: customMeta,
    settings: globalSettings,
    mode: 'custom',
    selectedMethods: [],
  });
  assert.equal(zeroMeta.methodSelectionMode, 'custom');
  assert.deepEqual(zeroMeta.selectedMethods, []);
  assert.equal(zeroMeta.selectedMagnitude, null);
  assert.equal(zeroMeta.selectedStatus, 'missing_measurement');
  assert.equal(zeroMeta.resultsByAlgorithm['eqp-legacy-ms']?.selectedForCalculation, false);
  assert.equal(zeroMeta.resultsByAlgorithm['md-duration']?.selectedForCalculation, false);
  assert.equal(zeroMeta.resultsByAlgorithm['mlv-vertical']?.selectedForCalculation, false);

  const zeroEv: EQPEvent = { ...ev, magnitudeMetadata: zeroMeta };
  const zeroFresh = inspectMagnitudeFreshness(zeroEv, zeroMeta, globalSettings, PHILSTA_DATABASE);
  const zeroBul = resolveBulletinMagnitude(zeroEv, zeroFresh);
  assert.equal(zeroBul.canPublish, false);
  assert.equal(zeroBul.value, null);
  assert.equal(zeroBul.displayText, 'Pending');

  // Re-evaluating in zero-method state keeps 0 algorithms evaluated and returns null selectedMagnitude
  const zeroEval = evaluateEventMagnitudes({
    event: zeroEv,
    settings: globalSettings,
    stations: PHILSTA_DATABASE,
    methodSelectionModeOverride: 'custom',
    selectedMethodsOverride: [],
  });
  assert.equal(zeroEval.selectedMagnitude, null);
  assert.equal(zeroEval.resultsByAlgorithm['eqp-legacy-ms']?.selectedForCalculation, false);

  // 4. Reverting back to global settings restores global enabled list & default method cleanly
  const revertedMeta = evaluateEventMagnitudes({
    event: zeroEv,
    settings: globalSettings,
    stations: PHILSTA_DATABASE,
    preferredMethodOverride: null,
    methodSelectionModeOverride: 'inherit_global',
    preferredSelectionLockedOverride: false,
  });
  assert.equal(revertedMeta.methodSelectionMode, 'inherit_global');
  assert.equal(revertedMeta.preferredMethodId, 'eqp-legacy-ms');
  assert.equal(revertedMeta.selectedStatus, 'valid');
  assert.equal(revertedMeta.resultsByAlgorithm['md-duration']?.selectedForCalculation, false);

  // 5. Unimplemented algorithms stay disabled
  for (const futureId of ['ml-local', 'mb-body', 'ms-20'] as const) {
    assert.equal(
      MAGNITUDE_ALGORITHMS.find((a) => a.id === futureId)?.implemented,
      false
    );
    const futureSel = canSelectMethodAsPreferred(
      futureId,
      customMeta,
      undefined,
      globalSettings
    );
    assert.equal(futureSel.eligible, false);
  }
});

// GROUP B — Independent Multi-Method Calculations & Failure Isolation
test('MAG-C Group B: Evaluates duration-only, MLv-only, combined multi-method, and isolates failures cleanly', () => {
  const settings = makeMultiMethodSettings({
    enabledMethods: ['eqp-legacy-ms', 'md-duration', 'mlv-vertical'],
  });

  // 1. Duration-only event: Legacy Ms & Md succeed while MLv reports missing_measurement without breaking others
  const durationOnlyEv = makeVerifiedCodaEvent();
  const durOnlyMeta = evaluateEventMagnitudes({
    event: durationOnlyEv,
    settings,
    stations: PHILSTA_DATABASE,
  });
  assert.equal(durOnlyMeta.resultsByAlgorithm['eqp-legacy-ms']?.status, 'valid');
  assert.equal(durOnlyMeta.resultsByAlgorithm['md-duration']?.status, 'valid');
  assert.equal(durOnlyMeta.resultsByAlgorithm['mlv-vertical']?.status, 'missing_measurement');
  assert.equal(durOnlyMeta.resultsByAlgorithm['mlv-vertical']?.networkMagnitude, null);
  assert.equal(durOnlyMeta.selectedMagnitude, 4.2);

  // 2. MLv-only event (durations stripped, WA-Z present): MLv succeeds while duration methods report missing_measurement
  const mlvOnlyBase = attachMlvAmplitudes(makeVerifiedCodaEvent());
  const mlvOnlyEv: EQPEvent = {
    ...mlvOnlyBase,
    ms: 0,
    mb: 0,
    md: 0,
    picks: mlvOnlyBase.picks.map((p: StationPick) => ({ ...p, duration: null })),
  };
  const mlvOnlyMeta = evaluateEventMagnitudes({
    event: mlvOnlyEv,
    settings,
    stations: PHILSTA_DATABASE,
  });
  assert.equal(mlvOnlyMeta.resultsByAlgorithm['mlv-vertical']?.status, 'valid');
  assert.ok(mlvOnlyMeta.resultsByAlgorithm['mlv-vertical']?.networkMagnitude !== null);
  assert.equal(mlvOnlyMeta.resultsByAlgorithm['eqp-legacy-ms']?.status, 'missing_measurement');
  assert.equal(mlvOnlyMeta.resultsByAlgorithm['md-duration']?.status, 'invalid_measurement');
  assert.equal(mlvOnlyMeta.resultsByAlgorithm['md-duration']?.networkMagnitude, null);

  // 3. Failure isolation: uncalibrated Md returns missing_calibration while Legacy Ms & MLv succeed
  const uncalMdSettings = makeMultiMethodSettings({
    mdConfig: {
      ...DEFAULT_MAGNITUDE_SETTINGS.mdConfig,
      calibrationStatus: 'pending_calibration',
      allowExperimentalEvaluation: false,
    },
  });
  const bothEv = attachMlvAmplitudes(makeVerifiedCodaEvent());
  const isolatedMeta = evaluateEventMagnitudes({
    event: bothEv,
    settings: uncalMdSettings,
    stations: PHILSTA_DATABASE,
  });
  assert.equal(isolatedMeta.resultsByAlgorithm['eqp-legacy-ms']?.status, 'valid');
  assert.equal(isolatedMeta.resultsByAlgorithm['mlv-vertical']?.status, 'valid');
  assert.equal(isolatedMeta.resultsByAlgorithm['md-duration']?.status, 'missing_calibration');
  assert.equal(isolatedMeta.resultsByAlgorithm['md-duration']?.networkMagnitude, null);
});

// GROUP C — Preferred Magnitude Workflow & Publication Gating
test('MAG-C Group C: Preferred switching, experimental confirmation gating, and unavailable/unchecked blocking', () => {
  const ev = attachMlvAmplitudes(makeVerifiedCodaEvent());
  const settings = makeMultiMethodSettings({
    suggestAlternativeIfUnavailable: true,
    enabledMethods: ['eqp-legacy-ms', 'md-duration', 'mlv-vertical'],
  });

  const meta = evaluateEventMagnitudes({
    event: ev,
    settings,
    stations: PHILSTA_DATABASE,
  });
  const fresh = inspectMagnitudeFreshness({ ...ev, magnitudeMetadata: meta }, meta, settings, PHILSTA_DATABASE);

  // 1. Default preferred is eqp-legacy-ms
  assert.equal(meta.preferredMethodId, 'eqp-legacy-ms');

  // 2. Switching to valid evaluated mlv-vertical locks preferred & gates bulletin until confirmed
  const switchToMlv = selectPreferredMethodOnEventMetadata({
    methodId: 'mlv-vertical',
    metadata: meta,
    freshness: fresh,
    settings,
  });
  assert.equal(switchToMlv.ok, true);
  assert.equal(switchToMlv.metadata.preferredMethodId, 'mlv-vertical');
  assert.equal(switchToMlv.metadata.preferredSelectionLocked, true);
  assert.equal(switchToMlv.metadata.selectedScale, 'MLv');

  const unconfirmedBul = resolveBulletinMagnitude({ ...ev, magnitudeMetadata: switchToMlv.metadata });
  assert.equal(unconfirmedBul.canPublish, false);
  assert.equal(unconfirmedBul.requiresAnalystConfirmation, true);

  const confirmedMeta = approveUncalibratedMagnitudeMetadata(switchToMlv.metadata, true);
  assert.equal(hasValidUncalibratedApproval(confirmedMeta), true);
  const confirmedBul = resolveBulletinMagnitude({ ...ev, magnitudeMetadata: confirmedMeta });
  assert.equal(confirmedBul.canPublish, true);
  assert.match(confirmedBul.displayText, /^MLv /);

  // 3. Unchecking the currently preferred method (mlv-vertical) immediately clears publishability without switching preferredMethodId silently
  const uncheckedPreferredMeta = updateEventMethodSelection({
    metadata: confirmedMeta,
    settings,
    mode: 'custom',
    selectedMethods: ['eqp-legacy-ms'],
  });
  assert.equal(uncheckedPreferredMeta.preferredMethodId, 'mlv-vertical');
  assert.equal(uncheckedPreferredMeta.selectedMagnitude, null);
  assert.equal(hasValidUncalibratedApproval(uncheckedPreferredMeta), false);
  const blockedBul = resolveBulletinMagnitude({
    ...ev,
    magnitudeMetadata: uncheckedPreferredMeta,
  });
  assert.equal(blockedBul.canPublish, false);
  assert.equal(blockedBul.displayText, 'Pending');

  // 4. Cannot select an unchecked, stale, or unavailable method as preferred
  const trySelectDeselected = selectPreferredMethodOnEventMetadata({
    methodId: 'md-duration',
    metadata: uncheckedPreferredMeta,
    freshness: inspectMagnitudeFreshness(
      { ...ev, magnitudeMetadata: uncheckedPreferredMeta },
      uncheckedPreferredMeta,
      settings,
      PHILSTA_DATABASE
    ),
    settings,
  });
  assert.equal(trySelectDeselected.ok, false);
  assert.match(trySelectDeselected.reason ?? '', /not selected/i);

  // 5. Missing calibration cannot be selected as preferred either
  const uncalSettings = makeMultiMethodSettings({
    mdConfig: {
      ...DEFAULT_MAGNITUDE_SETTINGS.mdConfig,
      calibrationStatus: 'pending_calibration',
      allowExperimentalEvaluation: false,
    },
  });
  const uncalMeta = evaluateEventMagnitudes({
    event: ev,
    settings: uncalSettings,
    stations: PHILSTA_DATABASE,
  });
  const trySelectUncalMd = selectPreferredMethodOnEventMetadata({
    methodId: 'md-duration',
    metadata: uncalMeta,
    freshness: inspectMagnitudeFreshness({ ...ev, magnitudeMetadata: uncalMeta }, uncalMeta, uncalSettings, PHILSTA_DATABASE),
    settings: uncalSettings,
  });
  assert.equal(trySelectUncalMd.ok, false);
  assert.match(trySelectUncalMd.reason ?? '', /calibration/i);
});

// GROUP D — Method-Specific Freshness & Identity Invariance
test('MAG-C Group D: Method-specific staleness, pending secondary evaluations, custom global isolation, and calc ID invariance', () => {
  const ev = attachMlvAmplitudes(makeVerifiedCodaEvent());
  const legacyOnlySettings = makeMultiMethodSettings({
    defaultMethod: 'eqp-legacy-ms',
    enabledMethods: ['eqp-legacy-ms'],
  });

  const baseMeta = evaluateEventMagnitudes({
    event: ev,
    settings: legacyOnlySettings,
    stations: PHILSTA_DATABASE,
  });

  // 1. Enabling MLv globally marks MLv as pending evaluation without falsifying fresh Legacy Ms
  const expandedGlobal = makeMultiMethodSettings({
    defaultMethod: 'eqp-legacy-ms',
    enabledMethods: ['eqp-legacy-ms', 'mlv-vertical'],
  });
  const expandedFresh = inspectMagnitudeFreshness(
    { ...ev, magnitudeMetadata: baseMeta },
    baseMeta,
    expandedGlobal,
    PHILSTA_DATABASE
  );
  assert.equal(expandedFresh.isStale, false);
  assert.deepEqual(expandedFresh.pendingEvaluationAlgorithmIds, ['mlv-vertical']);

  // 2. Full evaluation of both, then editing duration leaves MLv fresh and only stales duration methods
  const fullSettings = makeMultiMethodSettings({
    enabledMethods: ['eqp-legacy-ms', 'md-duration', 'mlv-vertical'],
  });
  const allMeta = evaluateEventMagnitudes({
    event: ev,
    settings: fullSettings,
    stations: PHILSTA_DATABASE,
  });
  const durEditedEv: EQPEvent = {
    ...ev,
    picks: ev.picks.map((p, idx) =>
      idx === 0 ? { ...p, duration: (p.duration ?? 20) + 18 } : p
    ),
    magnitudeMetadata: allMeta,
  };
  const durFresh = inspectMagnitudeFreshness(durEditedEv, allMeta, fullSettings, PHILSTA_DATABASE);
  assert.ok(durFresh.staleAlgorithmIds.includes('eqp-legacy-ms'));
  assert.ok(durFresh.staleAlgorithmIds.includes('md-duration'));
  assert.ok(!durFresh.staleAlgorithmIds.includes('mlv-vertical'));

  // 3. Editing WA-Z amplitude only stales MLv, leaving Legacy Ms and Md fresh
  const ampEditedEv: EQPEvent = {
    ...ev,
    amplitudeMeasurements: ev.amplitudeMeasurements?.map((m, idx) =>
      idx === 0 ? { ...m, amplitude: 33 } : m
    ),
    magnitudeMetadata: allMeta,
  };
  const ampFresh = inspectMagnitudeFreshness(ampEditedEv, allMeta, fullSettings, PHILSTA_DATABASE);
  assert.ok(ampFresh.staleAlgorithmIds.includes('mlv-vertical'));
  assert.ok(!ampFresh.staleAlgorithmIds.includes('eqp-legacy-ms'));
  assert.ok(!ampFresh.staleAlgorithmIds.includes('md-duration'));

  // 4. UI-only edits keep everything current
  const uiOnlyEv: EQPEvent = {
    ...ev,
    remarks: 'Bulletin display note only',
    issuedBy: 'OPER-2',
    magnitudeMetadata: allMeta,
  };
  const uiFresh = inspectMagnitudeFreshness(uiOnlyEv, allMeta, fullSettings, PHILSTA_DATABASE);
  assert.equal(uiFresh.isStale, false);
  assert.equal(uiFresh.staleAlgorithmIds.length, 0);

  // 5. Custom event selection & locked preferred survive global default changes without becoming stale
  const customMeta = evaluateEventMagnitudes({
    event: ev,
    settings: fullSettings,
    stations: PHILSTA_DATABASE,
    methodSelectionModeOverride: 'custom',
    selectedMethodsOverride: ['mlv-vertical'],
    preferredMethodOverride: 'mlv-vertical',
    preferredSelectionLockedOverride: true,
  });
  const changedGlobalDefault = makeMultiMethodSettings({
    defaultMethod: 'md-duration',
    enabledMethods: ['md-duration'],
  });
  const customFreshAfterGlobal = inspectMagnitudeFreshness(
    { ...ev, magnitudeMetadata: customMeta },
    customMeta,
    changedGlobalDefault,
    PHILSTA_DATABASE
  );
  assert.equal(customFreshAfterGlobal.isStale, false);
  assert.equal(customFreshAfterGlobal.preferredIsStale, false);

  // 6. Preferred calculation identity stays invariant regardless of secondary methods enabled
  const soloMlvMeta = evaluateEventMagnitudes({
    event: ev,
    settings: fullSettings,
    stations: PHILSTA_DATABASE,
    methodSelectionModeOverride: 'custom',
    selectedMethodsOverride: ['mlv-vertical'],
    preferredMethodOverride: 'mlv-vertical',
    preferredSelectionLockedOverride: true,
  });
  const multiMlvMeta = evaluateEventMagnitudes({
    event: ev,
    settings: fullSettings,
    stations: PHILSTA_DATABASE,
    methodSelectionModeOverride: 'custom',
    selectedMethodsOverride: ['eqp-legacy-ms', 'md-duration', 'mlv-vertical'],
    preferredMethodOverride: 'mlv-vertical',
    preferredSelectionLockedOverride: true,
  });
  assert.equal(soloMlvMeta.currentCalculationId, multiMlvMeta.currentCalculationId);
  assert.equal(
    computeCalculationIdentity({
      algorithmId: 'mlv-vertical',
      evaluation: soloMlvMeta.resultsByAlgorithm['mlv-vertical']!,
      inputFingerprint: soloMlvMeta.algorithmFingerprints!['mlv-vertical']!,
    }),
    multiMlvMeta.currentCalculationId
  );
});

// GROUP E — Persistence, Backward Compatibility, and Unified Bulletin Outputs
test('MAG-C Group E: Metadata JSON persistence roundtrip, legacy backward compatibility, and output boundary parity', () => {
  const ev = attachMlvAmplitudes(makeVerifiedCodaEvent());
  const settings = makeMultiMethodSettings();
  const customMeta = evaluateEventMagnitudes({
    event: ev,
    settings,
    stations: PHILSTA_DATABASE,
    methodSelectionModeOverride: 'custom',
    selectedMethodsOverride: ['eqp-legacy-ms', 'mlv-vertical'],
    preferredMethodOverride: 'mlv-vertical',
    preferredSelectionLockedOverride: true,
  });
  const approvedMeta = approveUncalibratedMagnitudeMetadata(customMeta, true);

  // Roundtrip through .meta.json serialization
  const serialized = JSON.stringify({ magnitudeMetadata: { ...approvedMeta, originState: 'historical_saved' } });
  const parsedSidecar = JSON.parse(serialized) as { magnitudeMetadata: EQPEvent['magnitudeMetadata'] };
  const reopenedEv: EQPEvent = {
    ...ev,
    magnitudeMetadata: parsedSidecar.magnitudeMetadata,
  };
  const reopenedSelection = resolveEventMethodSelection(reopenedEv, settings);
  assert.equal(reopenedSelection.mode, 'custom');
  assert.deepEqual(reopenedSelection.selectedMethods, ['eqp-legacy-ms', 'mlv-vertical']);
  assert.equal(reopenedSelection.preferredMethodId, 'mlv-vertical');
  assert.equal(hasValidUncalibratedApproval(reopenedEv.magnitudeMetadata), true);

  const reopenedFresh = inspectMagnitudeFreshness(
    reopenedEv,
    reopenedEv.magnitudeMetadata,
    settings,
    PHILSTA_DATABASE
  );
  assert.equal(reopenedFresh.isHistoricalSaved, true);
  assert.equal(reopenedFresh.isStale, false);

  // Unified bulletin & save outputs agree on approved MLv
  const html = buildBulletinHtmlDocument({
    event: reopenedEv,
    primaryLocationLabel: '102 km N 56° E of City Of Tacloban',
    faultGeneratorLabel: null,
    printSource: false,
    freshness: reopenedFresh,
  });
  assert.ok(html.includes('MLv '));
  assert.ok(html.includes('Experimental / Uncalibrated'));

  const dataPrint = formatDataPrintText({
    event: reopenedEv,
    primaryLocationLabel: '102 km N 56° E of City Of Tacloban',
    faultGeneratorLabel: null,
    config: DEFAULT_DATA_PRINT_CONFIG,
    freshness: reopenedFresh,
  });
  assert.ok(dataPrint.includes('MLv '));

  const saveTarget = buildEqpSaveTarget(reopenedEv, 'Y:', { freshness: reopenedFresh });
  assert.equal(saveTarget.filenameMagnitudeSource, 'preferred-method');

  // If analyst deselects preferred method (or selects 0 methods), ALL bulletin/PDF/save outputs gate cleanly
  const deselectedMeta = updateEventMethodSelection({
    metadata: approvedMeta,
    settings,
    mode: 'custom',
    selectedMethods: [],
  });
  const deselectedEv: EQPEvent = { ...ev, magnitudeMetadata: deselectedMeta };
  const deselectedFresh = inspectMagnitudeFreshness(
    deselectedEv,
    deselectedMeta,
    settings,
    PHILSTA_DATABASE
  );
  const deselectedBul = resolveBulletinMagnitude(deselectedEv, deselectedFresh);
  assert.equal(deselectedBul.canPublish, false);
  assert.equal(deselectedBul.value, null);
  assert.equal(deselectedBul.displayText, 'Pending');

  const deselectedHtml = buildBulletinHtmlDocument({
    event: deselectedEv,
    primaryLocationLabel: '102 km N 56° E of City Of Tacloban',
    faultGeneratorLabel: null,
    printSource: false,
    freshness: deselectedFresh,
  });
  assert.ok(deselectedHtml.includes('Pending'));
  assert.ok(deselectedHtml.includes('M00'));

  const deselectedDataPrint = formatDataPrintText({
    event: deselectedEv,
    primaryLocationLabel: '102 km N 56° E of City Of Tacloban',
    faultGeneratorLabel: null,
    config: DEFAULT_DATA_PRINT_CONFIG,
    freshness: deselectedFresh,
  });
  assert.ok(deselectedDataPrint.includes('Pending'));

  // Unconfirmed experimental MLv blocks PDF bulletin export
  assert.throws(
    () =>
      downloadBulletinPdf({
        event: { ...ev, magnitudeMetadata: customMeta },
        primaryLocationLabel: '102 km N 56° E of City Of Tacloban',
        faultGeneratorLabel: null,
        includeFaultGenerator: false,
        includeMapAsset: false,
        includeChartsAsset: false,
        highlightResP: true,
        highlightResS: true,
        varianceK: 1.5,
      }),
    /requires explicit analyst confirmation/i
  );
  assert.equal(buildEqpSaveTarget(deselectedEv, 'Y:', { freshness: deselectedFresh }).magCode, '00');

  // Backward compatibility: older metadata without methodSelectionMode defaults to inherit_global
  const legacySavedMeta = {
    ...customMeta,
    methodSelectionMode: undefined,
    selectedMethods: undefined,
    preferredSelectionLocked: undefined,
    isPerEventOverride: false,
    preferredMethodId: 'eqp-legacy-ms' as const,
  };
  const legacySel = resolveEventMethodSelection(legacySavedMeta, DEFAULT_MAGNITUDE_SETTINGS);
  assert.equal(legacySel.mode, 'inherit_global');
  assert.deepEqual(legacySel.selectedMethods, ['eqp-legacy-ms']);
});

// GROUP F — Legacy Formula & Parser Invariance
test('MAG-C Group F: Preserves EQP Legacy Ms numerical values and ATLAS/HYDRA parsing', () => {
  const ev = attachMlvAmplitudes(cloneSampleEvent());
  const settings = makeMultiMethodSettings();
  const evalMeta = evaluateEventMagnitudes({
    event: ev,
    settings,
    stations: PHILSTA_DATABASE,
  });
  assert.equal(evalMeta.resultsByAlgorithm['eqp-legacy-ms']?.networkMagnitude, 4.2);

  const atlasLine = [
    '201105271731107416 4188122E4010  137    14                                                                                                       0',
    '$1',
    'BAGP PV  EHZ  P 0201105271731 4054               6                                0     139',
    '$',
    '                                                              0',
    '$                                                             0',
  ].join('\n');
  const atlasParsed = parseAtlasHydraClipboard(atlasLine, PHILSTA_DATABASE);
  assert.equal(atlasParsed.valid, true);
  assert.equal(atlasParsed.groups.length, 1);
});
