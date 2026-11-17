import test from 'node:test';
import assert from 'node:assert/strict';
import { EQPEvent, INITIAL_EVENTS, StationMeta, StationPick } from '../src/data/eqpData';
import { applyOutlierFilteredMagnitudeToEvent } from '../src/utils/legacyMagnitudeMath';
import {
  aggregateStationMagnitudes,
  approveUncalibratedMagnitudeMetadata,
  DEFAULT_MAGNITUDE_SETTINGS,
  evaluateDurationMagnitudeMd,
  evaluateEqpLegacyMs,
  evaluateEventMagnitudes,
  evaluateUnsupportedAlgorithm,
  MAGNITUDE_ALGORITHMS,
  MagnitudeAlgorithmId,
  MagnitudeSettings,
  resolveBulletinMagnitude,
  sanitizeMagnitudeSettings,
} from '../src/utils/magnitudeEngine';

function cloneSampleEvent(): EQPEvent {
  return structuredClone(INITIAL_EVENTS[0]) as EQPEvent;
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
    durationSource: overrides.durationSource,
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

test('EQP Legacy Ms preserves exact legacy numerical output and scientific provenance', () => {
  const ev = cloneSampleEvent();
  const legacyBaseline = applyOutlierFilteredMagnitudeToEvent(ev, 1.5);
  const evalResult = evaluateEqpLegacyMs(ev, 1.5);

  assert.equal(evalResult.status, 'valid');
  assert.equal(evalResult.scale, 'Ms');
  assert.equal(evalResult.scientificLabel, 'Ms — EQP Legacy (Duration-Derived)');
  assert.equal(evalResult.calibrationStatus, 'legacy_compatibility');
  assert.equal(evalResult.networkMagnitude, legacyBaseline.ms);
  assert.equal(evalResult.networkMagnitude, 4.2);
  assert.equal(evalResult.contributingStations, 8);
  assert.equal(evalResult.excludedStations, 2); // BES outlier + LQP pExcluded
  assert.equal(evalResult.isAuthoritativeForBulletin, true);
  assert.ok(evalResult.provenanceSummary.includes('1.38·Ml − 1.44'));
  assert.equal(
    evalResult.stationDetails.find((s) => s.sta === 'BES')?.status,
    'Excluded'
  );
});

test('EQP Legacy Ms returns null (never 0) when all durations are missing', () => {
  const ev = cloneSampleEvent();
  ev.picks = ev.picks.map((p) => ({ ...p, duration: null }));

  const evalResult = evaluateEqpLegacyMs(ev, 1.5);
  assert.equal(evalResult.status, 'missing_measurement');
  assert.equal(evalResult.networkMagnitude, null);
  assert.equal(evalResult.contributingStations, 0);
});

test('Md blocks computation by default when Philippine calibration is pending', () => {
  const ev = cloneSampleEvent();
  const evalResult = evaluateDurationMagnitudeMd(ev, DEFAULT_MAGNITUDE_SETTINGS);

  assert.equal(evalResult.status, 'missing_calibration');
  assert.equal(evalResult.calibrationStatus, 'pending_calibration');
  assert.equal(evalResult.networkMagnitude, null);
  assert.equal(evalResult.isAuthoritativeForBulletin, false);
  assert.ok(evalResult.statusReason?.includes('pending official calibration'));
});

test('Md rejects experimental opt-in when any coefficient is missing or null', () => {
  const ev = cloneSampleEvent();
  const incompleteSettings = makeExperimentalMdSettings({
    coefficients: { a: -1.0, b: 2.0, c: null, d: 0.003, e: 0.001 },
  });

  const evalResult = evaluateDurationMagnitudeMd(ev, incompleteSettings);
  assert.equal(evalResult.status, 'missing_calibration');
  assert.equal(evalResult.networkMagnitude, null);
  assert.ok(evalResult.statusReason?.includes('incomplete'));
});

test('Md computes exact formula Md = a + b*log10(T) + c*T + d*Delta(km) + e*h(km) + Cs', () => {
  const ev: EQPEvent = {
    ...cloneSampleEvent(),
    lat: 14.0,
    lon: 121.0,
    depthKm: 10,
    iterations: 5,
    picks: [
      makePick({
        id: 'p1',
        sta: 'TAGP',
        duration: 100,
        durationSource: 'manual_coda',
        delta: 1.0, // 111.32 km
      }),
    ],
  };

  const settings = makeExperimentalMdSettings({
    stationCorrections: { TAGP: 0.25 },
  });
  // Expected:
  // a = -1.0
  // b * log10(100) = 2.0 * 2 = 4.0
  // c * T = 0.002 * 100 = 0.2
  // d * deltaKm = 0.003 * 111.32 = 0.33396
  // e * h = 0.001 * 10 = 0.01
  // Cs = 0.25
  // Sum = -1.0 + 4.0 + 0.2 + 0.33396 + 0.01 + 0.25 = 3.79396 -> station 3.79 -> network 3.8
  const evalResult = evaluateDurationMagnitudeMd(ev, settings);
  assert.equal(evalResult.status, 'valid');
  assert.equal(evalResult.scale, 'Md');
  assert.equal(evalResult.calibrationStatus, 'experimental_uncalibrated');
  assert.equal(evalResult.isAuthoritativeForBulletin, false);
  assert.equal(evalResult.contributingStations, 1);
  assert.equal(evalResult.stationDetails[0].distanceKm, 111.32);
  assert.equal(evalResult.stationDetails[0].stationCorrection, 0.25);
  assert.equal(evalResult.stationDetails[0].magnitude, 3.79);
  assert.equal(evalResult.networkMagnitude, 3.8);
});

test('Md enforces S-P proxy rejection, distance bounds, depth bounds, and Haversine fallback', () => {
  const stations: StationMeta[] = [
    {
      code: 'MANP',
      name: 'Manila',
      province: 'Metro Manila',
      lat: 14.0,
      lon: 121.9,
      elevationM: 10,
      delaySec: 0,
      sensor: 'BB',
    },
  ];

  const ev: EQPEvent = {
    ...cloneSampleEvent(),
    lat: 14.0,
    lon: 121.0,
    depthKm: 15,
    iterations: 4,
    picks: [
      makePick({
        id: 'p-sminusp',
        sta: 'SMP1',
        duration: 80,
        durationSource: 's_minus_p',
        delta: 0.5,
      }),
      makePick({
        id: 'p-far',
        sta: 'FAR1',
        duration: 120,
        durationSource: 'atlas_coda',
        delta: 12.0, // > 1000 km
      }),
      makePick({
        id: 'p-excluded',
        sta: 'EXC1',
        pExcluded: true,
        duration: 90,
        delta: 1.0,
      }),
      makePick({
        id: 'p-haversine',
        sta: 'MANP',
        duration: 100,
        durationSource: 'manual_coda',
        lat: 0,
        lon: 0,
        delta: 0, // triggers StationMeta Haversine fallback (~97 km)
      }),
    ],
  };

  const settings = makeExperimentalMdSettings({ maxDistanceKm: 1000 });
  const res = evaluateDurationMagnitudeMd(ev, settings, stations);

  assert.equal(res.status, 'valid');
  assert.equal(res.contributingStations, 1);
  assert.equal(res.excludedStations, 1);
  assert.equal(res.invalidStations, 2);

  const smp = res.stationDetails.find((s) => s.sta === 'SMP1');
  assert.equal(smp?.status, 'Invalid');
  assert.ok(smp?.reason?.includes('verified coda'));

  const far = res.stationDetails.find((s) => s.sta === 'FAR1');
  assert.equal(far?.status, 'Invalid');
  assert.ok(far?.reason?.includes('outside calibrated range'));

  const hav = res.stationDetails.find((s) => s.sta === 'MANP');
  assert.equal(hav?.status, 'Included');
  assert.ok((hav?.distanceKm ?? 0) > 90 && (hav?.distanceKm ?? 0) < 105);

  // Depth out of range invalidates entire Md evaluation
  const deepEv: EQPEvent = { ...ev, depthKm: 750 };
  const deepRes = evaluateDurationMagnitudeMd(deepEv, settings, stations);
  assert.equal(deepRes.status, 'invalid_measurement');
  assert.equal(deepRes.networkMagnitude, null);
});

test('Network aggregation computes median, arithmetic_mean, and trimmed_mean accurately', () => {
  assert.equal(aggregateStationMagnitudes([], 'median'), null);

  const values = [2.1, 4.0, 4.1, 4.2, 4.3, 4.5, 4.5, 4.6, 4.7, 9.5]; // 10 values
  const med = aggregateStationMagnitudes(values, 'median');
  assert.equal(med?.rawValue, 4.4);
  assert.equal(med?.value, 4.4);

  const mean = aggregateStationMagnitudes(values, 'arithmetic_mean');
  assert.equal(mean?.rawValue, 4.65);
  assert.equal(mean?.value, 4.7);

  // Trimmed mean trims 10% from each tail -> drops 2.1 and 9.5 (8 remaining)
  const trimmed = aggregateStationMagnitudes(values, 'trimmed_mean');
  assert.equal(trimmed?.trimmedCount, 2);
  assert.equal(trimmed?.rawValue, 4.363);
  assert.equal(trimmed?.value, 4.4);

  // For <= 2 stations trimmed mean retains all values
  const smallTrim = aggregateStationMagnitudes([4.1, 4.5], 'trimmed_mean');
  assert.equal(smallTrim?.trimmedCount, 0);
  assert.equal(smallTrim?.rawValue, 4.3);
});

test('Unsupported future magnitude algorithms return unsupported_algorithm with null value', () => {
  const futureIds: MagnitudeAlgorithmId[] = MAGNITUDE_ALGORITHMS.filter(
    (a) => !a.implemented
  ).map((a) => a.id);

  assert.deepEqual(futureIds, [
    'ml-local',
    'mb-body',
    'ms-20',
    'ms-bb',
    'mb-broadband',
    'mwp',
  ]);

  for (const id of futureIds) {
    const res = evaluateUnsupportedAlgorithm(id);
    assert.equal(res.status, 'unsupported_algorithm');
    assert.equal(res.networkMagnitude, null);
    assert.equal(res.isAuthoritativeForBulletin, false);
    assert.ok(res.statusReason?.includes('not yet implemented'));
  }
});

test('Settings sanitization prevents unimplemented algorithms as default and keeps enabled set valid', () => {
  const sanitized = sanitizeMagnitudeSettings({
    defaultMethod: 'ml-local',
    enabledMethods: ['ml-local', 'ms-20', 'md-duration'],
    networkAggregation: 'trimmed_mean',
    suggestAlternativeIfUnavailable: true,
    legacyVarianceK: 2.0,
  });

  assert.equal(sanitized.defaultMethod, 'eqp-legacy-ms');
  assert.deepEqual(
    sanitized.enabledMethods.sort(),
    ['eqp-legacy-ms', 'md-duration'].sort()
  );
  assert.equal(sanitized.networkAggregation, 'trimmed_mean');
  assert.equal(sanitized.suggestAlternativeIfUnavailable, true);
  assert.equal(sanitized.legacyVarianceK, 2.0);
});

test('Unavailable magnitude alternative suggestion operates without silently overriding selection', () => {
  const ev = cloneSampleEvent();
  const baseSettings = sanitizeMagnitudeSettings({
    ...DEFAULT_MAGNITUDE_SETTINGS,
    defaultMethod: 'md-duration',
    enabledMethods: ['eqp-legacy-ms', 'md-duration'],
    suggestAlternativeIfUnavailable: false,
  });

  const withoutSuggestion = evaluateEventMagnitudes({
    event: ev,
    settings: baseSettings,
  });
  assert.equal(withoutSuggestion.preferredMethodId, 'md-duration');
  assert.equal(withoutSuggestion.selectedMagnitude, null);
  assert.equal(withoutSuggestion.selectedStatus, 'missing_calibration');
  assert.equal(withoutSuggestion.suggestedAlternative, null);

  const withSuggestion = evaluateEventMagnitudes({
    event: ev,
    settings: { ...baseSettings, suggestAlternativeIfUnavailable: true },
  });
  assert.equal(withSuggestion.preferredMethodId, 'md-duration');
  assert.equal(withSuggestion.selectedMagnitude, null);
  assert.equal(withSuggestion.suggestedAlternative?.algorithmId, 'eqp-legacy-ms');
  assert.equal(withSuggestion.suggestedAlternative?.scale, 'Ms');
  assert.equal(withSuggestion.suggestedAlternative?.magnitude, 4.2);
});

test('Per-event magnitude method override survives PLOT re-evaluation and resets cleanly to global default', () => {
  const ev = cloneSampleEvent();
  const settings = makeExperimentalMdSettings();
  const globalLegacySettings: MagnitudeSettings = {
    ...settings,
    defaultMethod: 'eqp-legacy-ms',
    enabledMethods: ['eqp-legacy-ms', 'md-duration'],
  };

  // Analyst picks Md on this event while global default is EQP Legacy Ms
  const overriddenMeta = evaluateEventMagnitudes({
    event: ev,
    settings: globalLegacySettings,
    preferredMethodOverride: 'md-duration',
  });
  assert.equal(overriddenMeta.preferredMethodId, 'md-duration');
  assert.equal(overriddenMeta.isPerEventOverride, true);
  assert.equal(overriddenMeta.selectedScale, 'Md');

  // Subsequent PLOT re-evaluation without explicit override argument preserves the per-event override
  const reEvaluated = evaluateEventMagnitudes({
    event: { ...ev, magnitudeMetadata: overriddenMeta },
    settings: globalLegacySettings,
  });
  assert.equal(reEvaluated.preferredMethodId, 'md-duration');
  assert.equal(reEvaluated.isPerEventOverride, true);

  // Explicit reset (null) returns to global default
  const resetMeta = evaluateEventMagnitudes({
    event: { ...ev, magnitudeMetadata: reEvaluated },
    settings: globalLegacySettings,
    preferredMethodOverride: null,
  });
  assert.equal(resetMeta.preferredMethodId, 'eqp-legacy-ms');
  assert.equal(resetMeta.isPerEventOverride, false);
});

test('Bulletin resolution gates uncalibrated experimental Md behind explicit analyst confirmation', () => {
  const ev = applyOutlierFilteredMagnitudeToEvent(cloneSampleEvent(), 1.5).event;

  // 1. Legacy event without metadata resolves cleanly to Ms 4.2
  const legacyRes = resolveBulletinMagnitude(ev);
  assert.equal(legacyRes.displayText, 'Ms 4.2');
  assert.equal(legacyRes.isAuthoritative, true);
  assert.equal(legacyRes.requiresAnalystConfirmation, false);

  // 2. Unlocated legacy event with 0 magnitude resolves cleanly to Pending
  const unlocatedEv: EQPEvent = {
    ...ev,
    lat: 0,
    lon: 0,
    iterations: 0,
    ms: 0,
    mb: 0,
    md: 0,
  };
  assert.equal(resolveBulletinMagnitude(unlocatedEv).displayText, 'Pending');

  // 3. Experimental Md requires analyst confirmation before bulletin publication
  const mdEv: EQPEvent = {
    ...ev,
    picks: ev.picks.map((p) =>
      p.duration !== null && p.duration > 0
        ? { ...p, durationSource: 'manual_coda' as const }
        : p
    ),
  };
  const expSettings = makeExperimentalMdSettings();
  const expMeta = evaluateEventMagnitudes({ event: mdEv, settings: expSettings });
  const gatedRes = resolveBulletinMagnitude({
    ...mdEv,
    magnitudeMetadata: expMeta,
  });
  assert.equal(gatedRes.requiresAnalystConfirmation, true);
  assert.equal(gatedRes.isAuthoritative, false);
  assert.equal(gatedRes.displayText, 'Pending (Md uncalibrated)');

  // 4. With explicit calculation-bound analyst approval, experimental Md displays with Md scale & experimental tag
  const approvedMeta = approveUncalibratedMagnitudeMetadata(expMeta, true);
  const approvedRes = resolveBulletinMagnitude({
    ...mdEv,
    magnitudeMetadata: approvedMeta,
  });
  assert.equal(approvedRes.requiresAnalystConfirmation, false);
  assert.equal(approvedRes.isAuthoritative, false);
  assert.equal(approvedRes.canPublish, true);
  assert.ok(approvedRes.displayText.startsWith('Md '));
  assert.ok(approvedRes.displayText.includes('Experimental / Uncalibrated'));
  assert.equal(approvedRes.scaleLabel, 'Md');

  // 5. Officially calibrated Md publishes directly without extra confirmation gate
  const calibratedSettings = makeExperimentalMdSettings({
    calibrationStatus: 'calibrated',
  });
  const calMeta = evaluateEventMagnitudes({
    event: mdEv,
    settings: calibratedSettings,
  });
  const calRes = resolveBulletinMagnitude({
    ...mdEv,
    magnitudeMetadata: calMeta,
  });
  assert.equal(calRes.requiresAnalystConfirmation, false);
  assert.equal(calRes.isAuthoritative, true);
  assert.ok(calRes.displayText.startsWith('Md '));
});
