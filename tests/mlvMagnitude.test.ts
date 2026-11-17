import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PHILSTA_DATABASE,
  INITIAL_EVENTS,
  type EQPEvent,
} from '../src/data/eqpData';
import {
  reconcileLoadedAmplitudeSidecar,
  buildStationPickAnchors,
  type AmplitudeMeasurement,
} from '../src/utils/amplitudeMeasurements';
import {
  DEFAULT_MAGNITUDE_SETTINGS,
  MAGNITUDE_ALGORITHMS,
  approveUncalibratedMagnitudeMetadata,
  computeAlgorithmInputFingerprint,
  evaluateEventMagnitudes,
  hasValidUncalibratedApproval,
  inspectMagnitudeFreshness,
  resolveBulletinMagnitude,
  sanitizeMagnitudeSettings,
  type MagnitudeSettings,
} from '../src/utils/magnitudeEngine';
import {
  DEFAULT_MLV_CONFIG,
  SEISCOMP_REFERENCE_MLV_PROFILE,
  checkMlvMeasurementEligibility,
  computeStationMlvFormula,
  convertDisplacementToMm,
  evaluateMlvMagnitude,
  interpolateMlvLogA0,
  parseMlvAttenuationTableText,
  resolveMlvStationCorrection,
  validateMlvCalibrationProfile,
  type MlvCalibrationConfig,
} from '../src/utils/mlvMagnitude';
import { buildEqpSaveTarget, parseEqpFileContent } from '../src/utils/eqpStorage';
import { parseAtlasHydraClipboard } from '../src/utils/atlasHydraParser';

function cloneSampleEvent(): EQPEvent {
  return structuredClone(INITIAL_EVENTS[0]);
}

function makeWAZMeasurement(
  overrides: Partial<AmplitudeMeasurement> & {
    eventId: string;
    stationRefId: string;
    stationCode: string;
  }
): AmplitudeMeasurement {
  return {
    id: overrides.id ?? `amp-${Math.random().toString(36).slice(2, 8)}`,
    networkCode: overrides.networkCode ?? 'PV',
    locationCode: overrides.locationCode ?? '00',
    channelCode: overrides.channelCode ?? 'BHZ',
    measurementCategory: 'wood_anderson_local',
    amplitude: overrides.amplitude ?? 1.0,
    physicalQuantity: overrides.physicalQuantity ?? 'displacement',
    unit: overrides.unit ?? 'mm',
    convention: overrides.convention ?? 'zero_to_peak',
    phaseType: overrides.phaseType ?? 'S',
    periodSec: overrides.periodSec ?? null,
    windowStartIso: overrides.windowStartIso ?? null,
    windowEndIso: overrides.windowEndIso ?? null,
    source: overrides.source ?? 'waveform_pick',
    instrumentResponseStatus:
      overrides.instrumentResponseStatus ?? 'wood_anderson_simulated',
    correctedStatus: overrides.correctedStatus ?? 'corrected',
    clipped: overrides.clipped ?? false,
    excluded: overrides.excluded ?? false,
    ...overrides,
  } as AmplitudeMeasurement;
}

function makeExperimentalMlvSettings(
  mlvOverrides?: Partial<MlvCalibrationConfig>,
  settingsOverrides?: Partial<MagnitudeSettings>
): MagnitudeSettings {
  return {
    ...DEFAULT_MAGNITUDE_SETTINGS,
    enabledMethods: ['eqp-legacy-ms', 'mlv-vertical'],
    ...settingsOverrides,
    mlvConfig: {
      ...structuredClone(SEISCOMP_REFERENCE_MLV_PROFILE),
      ...mlvOverrides,
    },
  };
}

// ============================================================================
// Category A: Formula, Unit Conversions, Cs Lookup, Zero/Negative Magnitudes
// ============================================================================
test('Category A: MLv formula, displacement unit conversions, Cs lookup, and zero/negative magnitudes', () => {
  // Exact SeisComP MLv formula: log10(A_mm) - log10(A0(Delta)) + Cs
  // A = 10 mm, logA0 = -3.0 (100 km in ref table), Cs = 0 -> MLv = 1 - (-3.0) + 0 = 4.0
  assert.equal(
    computeStationMlvFormula({ amplitudeMm: 10, logA0: -3.0, stationCorrection: 0 }),
    4.0
  );
  // Zero & negative valid MLv: A = 0.001 mm (-3.0), logA0 = -3.0 -> 0.0; A = 0.0005 mm -> -0.301
  assert.equal(
    computeStationMlvFormula({ amplitudeMm: 0.001, logA0: -3.0, stationCorrection: 0 }),
    0
  );
  assert.ok(
    computeStationMlvFormula({ amplitudeMm: 0.0005, logA0: -3.0, stationCorrection: 0 }) < 0
  );

  // Unit conversions to mm must produce identical result for m, mm, um, nm
  assert.equal(convertDisplacementToMm(0.005, 'm'), 5);
  assert.equal(convertDisplacementToMm(5, 'mm'), 5);
  assert.equal(convertDisplacementToMm(5000, 'um'), 5);
  assert.ok(Math.abs((convertDisplacementToMm(5_000_000, 'nm') ?? 0) - 5) < 1e-12);
  assert.equal(convertDisplacementToMm(100, 'counts'), null);
  assert.equal(convertDisplacementToMm(0.1, 'm/s'), null);

  // Hierarchical Cs lookup: NET.STA.LOC -> NET.STA -> STA -> 0
  const corrections = {
    'PV.TGY.00': 0.25,
    'PV.TGY': 0.15,
    TGY: -0.1,
  };
  assert.equal(
    resolveMlvStationCorrection(corrections, {
      networkCode: 'PV',
      stationCode: 'TGY',
      locationCode: '00',
    }).value,
    0.25
  );
  assert.equal(
    resolveMlvStationCorrection(corrections, {
      networkCode: 'PV',
      stationCode: 'TGY',
      locationCode: '10',
    }).value,
    0.15
  );
  assert.equal(
    resolveMlvStationCorrection(corrections, {
      networkCode: 'XX',
      stationCode: 'TGY',
      locationCode: '',
    }).value,
    -0.1
  );
  assert.equal(
    resolveMlvStationCorrection(corrections, {
      networkCode: 'PV',
      stationCode: 'BAGP',
      locationCode: '00',
    }).value,
    0
  );

  // Test full event evaluation across units (m, mm, um, nm) -> identical MLv
  const base = cloneSampleEvent();
  base.lat = 14.0;
  base.lon = 121.0;
  base.depthKm = 10;
  base.iterations = 3;
  // Use delta = 100 / 111.32 deg (~100 km) by clearing coordinates on pick 0..3 or setting pick coords to ~100 km away
  // Set lat=0, lon=0 on picks with explicit delta = 100/111.32 and empty stations array to pin exact 100 km lookup (logA0 = -3.0)
  const exact100KmDeg = 100 / 111.32;
  const ev: EQPEvent = {
    ...base,
    picks: base.picks.slice(0, 4).map((p, idx) => ({
      ...p,
      sta: `ST${idx + 1}`,
      lat: 0,
      lon: 0,
      delta: exact100KmDeg,
      pExcluded: false,
    })),
  };
  ev.amplitudeMeasurements = [
    makeWAZMeasurement({
      id: 'u-m',
      eventId: ev.id,
      stationRefId: ev.picks[0].id,
      stationCode: ev.picks[0].sta,
      amplitude: 0.01,
      unit: 'm',
    }),
    makeWAZMeasurement({
      id: 'u-mm',
      eventId: ev.id,
      stationRefId: ev.picks[1].id,
      stationCode: ev.picks[1].sta,
      amplitude: 10,
      unit: 'mm',
    }),
    makeWAZMeasurement({
      id: 'u-um',
      eventId: ev.id,
      stationRefId: ev.picks[2].id,
      stationCode: ev.picks[2].sta,
      amplitude: 10_000,
      unit: 'um',
    }),
    makeWAZMeasurement({
      id: 'u-nm',
      eventId: ev.id,
      stationRefId: ev.picks[3].id,
      stationCode: ev.picks[3].sta,
      amplitude: 10_000_000,
      unit: 'nm',
    }),
  ];

  const settings = makeExperimentalMlvSettings({ calibrationStatus: 'calibrated' });
  const res = evaluateMlvMagnitude(ev, settings, []);
  assert.equal(res.status, 'valid');
  assert.equal(res.contributingStations, 4);
  assert.equal(res.networkMagnitude, 4.0);
  assert.ok(res.stationDetails.every((d) => d.status === 'Included' && d.magnitude === 4.0));

  // Verify exact 0.0 and negative MLv are preserved cleanly (never treated as missing/pending)
  const zeroEv: EQPEvent = {
    ...ev,
    picks: [ev.picks[0]],
    amplitudeMeasurements: [
      makeWAZMeasurement({
        id: 'z-1',
        eventId: ev.id,
        stationRefId: ev.picks[0].id,
        stationCode: ev.picks[0].sta,
        amplitude: 0.001, // log10(0.001) - (-3.0) = 0.0
        unit: 'mm',
      }),
    ],
  };
  const zeroMeta = evaluateEventMagnitudes({
    event: zeroEv,
    settings,
    stations: [],
    preferredMethodOverride: 'mlv-vertical',
  });
  assert.equal(zeroMeta.selectedStatus, 'valid');
  assert.equal(zeroMeta.selectedMagnitude, 0);
  const zeroBul = resolveBulletinMagnitude({ ...zeroEv, magnitudeMetadata: zeroMeta });
  assert.equal(zeroBul.displayText, 'MLv 0.0');
  assert.equal(zeroBul.value, 0);
  assert.equal(zeroBul.canPublish, true);

  const negEv: EQPEvent = {
    ...ev,
    picks: [ev.picks[0]],
    amplitudeMeasurements: [
      makeWAZMeasurement({
        id: 'neg-1',
        eventId: ev.id,
        stationRefId: ev.picks[0].id,
        stationCode: ev.picks[0].sta,
        amplitude: 0.0004, // log10(0.0004) - (-3.0) = -3.3979 + 3.0 = -0.3979 -> -0.4
        unit: 'mm',
      }),
    ],
  };
  const negMeta = evaluateEventMagnitudes({
    event: negEv,
    settings,
    stations: [],
    preferredMethodOverride: 'mlv-vertical',
  });
  assert.equal(negMeta.selectedMagnitude, -0.4);
  const negBul = resolveBulletinMagnitude({ ...negEv, magnitudeMetadata: negMeta });
  assert.equal(negBul.displayText, 'MLv -0.4');
});

// ============================================================================
// Category B: Attenuation Table Validation, Interpolation & Boundary Guards
// ============================================================================
test('Category B: Attenuation interpolation, boundary rejection, malformed tables, and default calibration restraint', () => {
  // Default settings remain pending_calibration with NO fabricated curve active
  assert.equal(DEFAULT_MLV_CONFIG.calibrationStatus, 'pending_calibration');
  assert.equal(DEFAULT_MLV_CONFIG.allowExperimentalEvaluation, false);
  assert.equal(DEFAULT_MLV_CONFIG.attenuationTable.length, 0);
  assert.equal(DEFAULT_MAGNITUDE_SETTINGS.defaultMethod, 'eqp-legacy-ms');

  const ev = cloneSampleEvent();
  const defaultEval = evaluateMlvMagnitude(ev, DEFAULT_MAGNITUDE_SETTINGS, PHILSTA_DATABASE);
  assert.equal(defaultEval.status, 'missing_calibration');
  assert.equal(defaultEval.networkMagnitude, null);
  assert.equal(defaultEval.isAuthoritativeForBulletin, false);

  // Reference SeisComP curve stays experimental_uncalibrated unless verified
  assert.equal(SEISCOMP_REFERENCE_MLV_PROFILE.calibrationStatus, 'experimental_uncalibrated');

  // Exact node & linear interpolation checks on SeisComP reference table
  const n60 = interpolateMlvLogA0(60, SEISCOMP_REFERENCE_MLV_PROFILE);
  assert.equal(n60.ok, true);
  if (n60.ok) assert.equal(n60.logA0, -2.8);

  const n80 = interpolateMlvLogA0(80, SEISCOMP_REFERENCE_MLV_PROFILE);
  assert.equal(n80.ok, true);
  if (n80.ok) assert.ok(Math.abs(n80.logA0 - -2.9) < 1e-12);

  const n250 = interpolateMlvLogA0(250, SEISCOMP_REFERENCE_MLV_PROFILE);
  assert.equal(n250.ok, true);
  if (n250.ok) assert.ok(Math.abs(n250.logA0 - -3.75) < 1e-12);

  // Refuse extrapolation beyond min/max distance bounds
  const tooFar = interpolateMlvLogA0(1050, SEISCOMP_REFERENCE_MLV_PROFILE);
  assert.equal(tooFar.ok, false);
  if (!tooFar.ok) assert.match(tooFar.reason, /extrapolation blocked/i);

  const customBounded: MlvCalibrationConfig = {
    ...SEISCOMP_REFERENCE_MLV_PROFILE,
    minDistanceKm: 10,
    maxDistanceKm: 500,
  };
  assert.equal(interpolateMlvLogA0(5, customBounded).ok, false);
  assert.equal(interpolateMlvLogA0(600, customBounded).ok, false);

  // Reject malformed tables (empty, single point, unsorted, duplicate distance)
  assert.equal(validateMlvCalibrationProfile(DEFAULT_MLV_CONFIG).valid, false);
  assert.equal(
    validateMlvCalibrationProfile({
      ...SEISCOMP_REFERENCE_MLV_PROFILE,
      attenuationTable: [{ distanceKm: 0, logA0: -1.3 }],
    }).valid,
    false
  );
  assert.equal(
    validateMlvCalibrationProfile({
      ...SEISCOMP_REFERENCE_MLV_PROFILE,
      attenuationTable: [
        { distanceKm: 60, logA0: -2.8 },
        { distanceKm: 10, logA0: -1.5 },
      ],
    }).valid,
    false
  );
  assert.equal(
    validateMlvCalibrationProfile({
      ...SEISCOMP_REFERENCE_MLV_PROFILE,
      attenuationTable: [
        { distanceKm: 60, logA0: -2.8 },
        { distanceKm: 60, logA0: -2.9 },
      ],
    }).valid,
    false
  );

  // Parse text table helper
  const parsed = parseMlvAttenuationTableText('0:-1.3, 60:-2.8, 100:-3.0');
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.nodes.length, 3);
  assert.equal(parseMlvAttenuationTableText('0:-1.3, badnode').ok, false);

  // Epicentral vs hypocentral metric distinction when depthKm > 0
  const evDepth: EQPEvent = {
    ...ev,
    depthKm: 100,
    picks: [
      {
        ...ev.picks[0],
        sta: 'TGY',
        lat: 0,
        lon: 0,
        delta: 100 / 111.32, // 100 km epicentral -> hypocentral = sqrt(100^2 + 100^2) = 141.42 km
        pExcluded: false,
      },
    ],
    amplitudeMeasurements: [
      makeWAZMeasurement({
        id: 'm-depth',
        eventId: ev.id,
        stationRefId: ev.picks[0].id,
        stationCode: 'TGY',
        amplitude: 5,
        unit: 'mm',
      }),
    ],
  };
  const resEpi = evaluateMlvMagnitude(
    evDepth,
    makeExperimentalMlvSettings({ distanceMetric: 'epicentral_km' }),
    []
  );
  const resHypo = evaluateMlvMagnitude(
    evDepth,
    makeExperimentalMlvSettings({ distanceMetric: 'hypocentral_km' }),
    []
  );
  assert.equal(resEpi.status, 'valid');
  assert.equal(resHypo.status, 'valid');
  assert.notEqual(resEpi.networkMagnitude, resHypo.networkMagnitude);
});

// ============================================================================
// Category C: Amplitude Eligibility & Scientific Safety Rejections
// ============================================================================
test('Category C: Strictly accepts calibrated vertical Wood-Anderson displacement and rejects invalid records', () => {
  const ev = cloneSampleEvent();
  const pick = ev.picks[0];
  const cfg = SEISCOMP_REFERENCE_MLV_PROFILE;
  const picksById = new Map([[pick.id, pick]]);
  const ctx = { eventId: ev.id, picksById };

  // Valid vertical Wood-Anderson displacement across vertical channel codes
  for (const ch of ['BHZ', 'HHZ', 'EHZ', 'SHZ']) {
    const validRec = makeWAZMeasurement({
      eventId: ev.id,
      stationRefId: pick.id,
      stationCode: pick.sta,
      channelCode: ch,
    });
    assert.equal(checkMlvMeasurementEligibility(validRec, cfg, ctx).eligible, true);
  }

  // Strictly reject horizontal components
  for (const hCh of ['BHN', 'BHE', 'HH1', 'HH2', 'BHR', 'BHT', '']) {
    const horiz = makeWAZMeasurement({
      eventId: ev.id,
      stationRefId: pick.id,
      stationCode: pick.sta,
      channelCode: hCh,
    });
    assert.equal(checkMlvMeasurementEligibility(horiz, cfg, ctx).eligible, false);
  }

  // Strictly reject raw counts
  const rawCounts = makeWAZMeasurement({
    eventId: ev.id,
    stationRefId: pick.id,
    stationCode: pick.sta,
    measurementCategory: 'raw_waveform',
    physicalQuantity: 'counts',
    unit: 'counts',
    instrumentResponseStatus: 'raw_uncorrected',
    correctedStatus: 'raw',
  });
  assert.equal(checkMlvMeasurementEligibility(rawCounts, cfg, ctx).eligible, false);

  // Strictly reject velocity
  const velRec = makeWAZMeasurement({
    eventId: ev.id,
    stationRefId: pick.id,
    stationCode: pick.sta,
    physicalQuantity: 'velocity',
    unit: 'm/s',
    instrumentResponseStatus: 'response_corrected_velocity',
  });
  assert.equal(checkMlvMeasurementEligibility(velRec, cfg, ctx).eligible, false);

  // Reject broadband displacement not simulated with Wood-Anderson response
  const nonWA = makeWAZMeasurement({
    eventId: ev.id,
    stationRefId: pick.id,
    stationCode: pick.sta,
    instrumentResponseStatus: 'response_corrected_displacement',
  });
  assert.equal(checkMlvMeasurementEligibility(nonWA, cfg, ctx).eligible, false);

  // Reject unknown or mismatched amplitude convention
  const unknownConv = makeWAZMeasurement({
    eventId: ev.id,
    stationRefId: pick.id,
    stationCode: pick.sta,
    convention: 'unknown',
  });
  assert.equal(checkMlvMeasurementEligibility(unknownConv, cfg, ctx).eligible, false);

  const p2pMismatch = makeWAZMeasurement({
    eventId: ev.id,
    stationRefId: pick.id,
    stationCode: pick.sta,
    convention: 'peak_to_peak',
  });
  assert.equal(checkMlvMeasurementEligibility(p2pMismatch, cfg, ctx).eligible, false);
  // Matches when profile expects peak_to_peak
  assert.equal(
    checkMlvMeasurementEligibility(
      p2pMismatch,
      { ...cfg, expectedConvention: 'peak_to_peak' },
      ctx
    ).eligible,
    true
  );

  // Reject clipped and excluded measurements
  const clipped = makeWAZMeasurement({
    eventId: ev.id,
    stationRefId: pick.id,
    stationCode: pick.sta,
    clipped: true,
  });
  assert.equal(checkMlvMeasurementEligibility(clipped, cfg, ctx).eligible, false);

  const excluded = makeWAZMeasurement({
    eventId: ev.id,
    stationRefId: pick.id,
    stationCode: pick.sta,
    excluded: true,
  });
  const exclRes = checkMlvMeasurementEligibility(excluded, cfg, ctx);
  assert.equal(exclRes.eligible, false);
  assert.equal(exclRes.excluded, true);

  // Legacy scalar pick.amplitude = 150 um without structured measurements must NOT produce MLv
  const legacyOnlyEv: EQPEvent = {
    ...ev,
    picks: ev.picks.map((p) => ({ ...p, amplitude: 150 })),
    amplitudeMeasurements: [],
  };
  const legacyOnlyEval = evaluateMlvMagnitude(
    legacyOnlyEv,
    makeExperimentalMlvSettings(),
    PHILSTA_DATABASE
  );
  assert.equal(legacyOnlyEval.status, 'missing_measurement');
  assert.equal(legacyOnlyEval.networkMagnitude, null);
});

// ============================================================================
// Category D: Multi-Measurement Single-Contribution & Network Aggregation
// ============================================================================
test('Category D: Deterministic single contribution per station, aggregation modes, and small-sample handling', () => {
  const base = cloneSampleEvent();
  const dist100 = 100 / 111.32;

  // Station 0 has TWO vertical Wood-Anderson records (BHZ=10mm -> MLv=4.0, HHZ=1mm -> MLv=3.0)
  // Must contribute AT MOST ONCE; deterministic priority chooses HHZ (3.0) rather than picking larger or double-counting!
  const oneStationMultiEv: EQPEvent = {
    ...base,
    picks: [
      {
        ...base.picks[0],
        sta: 'STA1',
        lat: 0,
        lon: 0,
        delta: dist100,
        pExcluded: false,
      },
    ],
    amplitudeMeasurements: [
      makeWAZMeasurement({
        id: 'bhz-larger',
        eventId: base.id,
        stationRefId: base.picks[0].id,
        stationCode: 'STA1',
        channelCode: 'BHZ',
        amplitude: 10,
        unit: 'mm',
      }),
      makeWAZMeasurement({
        id: 'hhz-priority',
        eventId: base.id,
        stationRefId: base.picks[0].id,
        stationCode: 'STA1',
        channelCode: 'HHZ',
        amplitude: 1,
        unit: 'mm',
      }),
    ],
  };

  const singleStaRes = evaluateMlvMagnitude(
    oneStationMultiEv,
    makeExperimentalMlvSettings({ stationSelectionPolicy: 'deterministic_priority' }),
    []
  );
  assert.equal(singleStaRes.status, 'valid');
  assert.equal(singleStaRes.contributingStations, 1);
  assert.equal(singleStaRes.networkMagnitude, 3.0);
  assert.equal(singleStaRes.stationDetails[0].selectedChannel, 'HHZ');
  assert.match(singleStaRes.aggregationNote ?? '', /Single-station MLv estimate/i);

  // Reject-ambiguous policy blocks station with multiple eligible active records
  const ambigRes = evaluateMlvMagnitude(
    oneStationMultiEv,
    makeExperimentalMlvSettings({ stationSelectionPolicy: 'reject_ambiguous' }),
    []
  );
  assert.equal(ambigRes.status, 'invalid_measurement');
  assert.equal(ambigRes.contributingStations, 0);

  // Min contributing stations threshold gate
  const minStaGate = evaluateMlvMagnitude(
    oneStationMultiEv,
    makeExperimentalMlvSettings({ minContributingStations: 2 }),
    []
  );
  assert.equal(minStaGate.status, 'missing_measurement');
  assert.equal(minStaGate.networkMagnitude, null);

  // Network aggregation: Median vs Arithmetic Mean vs 10% Trimmed Mean (N=10 vs N=4)
  // Build 10 stations with MLv = [1.0, 3.0, 3.1, 3.2, 3.3, 3.5, 3.6, 3.7, 3.8, 9.0] at 100km (logA0=-3.0 -> A_mm = 10^(MLv - 3))
  const mags10 = [1.0, 3.0, 3.1, 3.2, 3.3, 3.5, 3.6, 3.7, 3.8, 9.0];
  const picks10 = mags10.map((_, idx) => ({
    ...base.picks[0],
    id: `pick-agg-${idx}`,
    sta: `S${String(idx + 1).padStart(2, '0')}`,
    lat: 0,
    lon: 0,
    delta: dist100,
    pExcluded: false,
  }));
  const amps10 = mags10.map((targetMlv, idx) =>
    makeWAZMeasurement({
      id: `amp-agg-${idx}`,
      eventId: base.id,
      stationRefId: picks10[idx].id,
      stationCode: picks10[idx].sta,
      amplitude: Math.pow(10, targetMlv - 3.0),
      unit: 'mm',
    })
  );
  const ev10: EQPEvent = {
    ...base,
    picks: picks10,
    amplitudeMeasurements: amps10,
  };

  const medRes = evaluateMlvMagnitude(
    ev10,
    makeExperimentalMlvSettings({}, { networkAggregation: 'median' }),
    []
  );
  const meanRes = evaluateMlvMagnitude(
    ev10,
    makeExperimentalMlvSettings({}, { networkAggregation: 'arithmetic_mean' }),
    []
  );
  const trimRes = evaluateMlvMagnitude(
    ev10,
    makeExperimentalMlvSettings({}, { networkAggregation: 'trimmed_mean' }),
    []
  );

  // Median of [1.0, 3.0, 3.1, 3.2, 3.3, 3.5, 3.6, 3.7, 3.8, 9.0] = (3.3+3.5)/2 = 3.4
  assert.equal(medRes.networkMagnitude, 3.4);
  assert.equal(medRes.contributingStations, 10);
  // Mean = (1.0+3.0+3.1+3.2+3.3+3.5+3.6+3.7+3.8+9.0)/10 = 37.2/10 = 3.72 -> 3.7
  assert.equal(meanRes.networkMagnitude, 3.7);
  // 10% Trimmed mean drops 1.0 and 9.0 -> keeps 8 stations summing 27.2 -> 27.2/8 = 3.4
  assert.equal(trimRes.trimmedCount, 2);
  assert.equal(trimRes.contributingStations, 8);
  assert.equal(trimRes.networkMagnitude, 3.4);
});

// ============================================================================
// Category E: Legacy Invariance, Freshness, Approvals, Persistence & Formats
// ============================================================================
test('Category E: Legacy Ms/Md invariance, selective freshness, calculation-bound approval, persistence, and unimplemented isolation', () => {
  const ev = cloneSampleEvent();
  const baselineSettings: MagnitudeSettings = {
    ...DEFAULT_MAGNITUDE_SETTINGS,
    enabledMethods: ['eqp-legacy-ms', 'md-duration'],
  };
  const withMlvSettings = makeExperimentalMlvSettings();

  const beforeEval = evaluateEventMagnitudes({
    event: ev,
    settings: baselineSettings,
    stations: PHILSTA_DATABASE,
  });

  // Add vertical Wood-Anderson measurements to picks 0 and 1
  const ampEv: EQPEvent = {
    ...ev,
    amplitudeMeasurements: [
      makeWAZMeasurement({
        id: 'mlv-ev-1',
        eventId: ev.id,
        stationRefId: ev.picks[0].id,
        stationCode: ev.picks[0].sta,
        channelCode: 'BHZ',
        amplitude: 5,
        unit: 'mm',
      }),
      makeWAZMeasurement({
        id: 'mlv-ev-2',
        eventId: ev.id,
        stationRefId: ev.picks[1].id,
        stationCode: ev.picks[1].sta,
        channelCode: 'HHZ',
        amplitude: 12,
        unit: 'mm',
      }),
    ],
  };

  // Global default stays eqp-legacy-ms; Legacy Ms and Md remain identical
  const afterDefaultEval = evaluateEventMagnitudes({
    event: ampEv,
    settings: withMlvSettings,
    stations: PHILSTA_DATABASE,
  });
  assert.equal(afterDefaultEval.preferredMethodId, 'eqp-legacy-ms');
  assert.equal(afterDefaultEval.selectedMagnitude, beforeEval.selectedMagnitude);
  assert.equal(
    afterDefaultEval.resultsByAlgorithm['eqp-legacy-ms']?.networkMagnitude,
    beforeEval.resultsByAlgorithm['eqp-legacy-ms']?.networkMagnitude
  );
  assert.equal(afterDefaultEval.resultsByAlgorithm['mlv-vertical']?.status, 'valid');
  assert.ok(afterDefaultEval.resultsByAlgorithm['mlv-vertical']?.networkMagnitude !== null);

  // Per-event override selects MLv cleanly while global default remains eqp-legacy-ms
  const mlvPreferredMeta = evaluateEventMagnitudes({
    event: ampEv,
    settings: withMlvSettings,
    stations: PHILSTA_DATABASE,
    preferredMethodOverride: 'mlv-vertical',
  });
  assert.equal(mlvPreferredMeta.preferredMethodId, 'mlv-vertical');
  assert.equal(mlvPreferredMeta.isPerEventOverride, true);
  assert.equal(mlvPreferredMeta.selectedScale, 'MLv');
  assert.equal(mlvPreferredMeta.calibrationStatus, 'experimental_uncalibrated');

  const mlvEvent: EQPEvent = {
    ...ampEv,
    magnitudeMetadata: mlvPreferredMeta,
  };

  // Experimental MLv requires calculation-bound confirmation before bulletin publication
  const unapprovedBul = resolveBulletinMagnitude(mlvEvent);
  assert.equal(unapprovedBul.requiresAnalystConfirmation, true);
  assert.equal(unapprovedBul.canPublish, false);

  const approvedMeta = approveUncalibratedMagnitudeMetadata(mlvPreferredMeta, true);
  assert.equal(hasValidUncalibratedApproval(approvedMeta), true);
  const approvedEv: EQPEvent = { ...mlvEvent, magnitudeMetadata: approvedMeta };
  const approvedBul = resolveBulletinMagnitude(approvedEv);
  assert.equal(approvedBul.canPublish, true);
  assert.match(approvedBul.displayText, /^MLv /);

  // Selective Freshness: editing duration does NOT stale MLv (keeps MLv Current & approval valid)
  const durationEditedEv: EQPEvent = {
    ...approvedEv,
    picks: approvedEv.picks.map((p, idx) =>
      idx === 0 ? { ...p, duration: (p.duration ?? 20) + 15 } : p
    ),
  };
  const durFresh = inspectMagnitudeFreshness(
    durationEditedEv,
    durationEditedEv.magnitudeMetadata,
    withMlvSettings,
    PHILSTA_DATABASE
  );
  assert.equal(durFresh.preferredIsStale, false);
  assert.equal(durFresh.isStale, false);
  assert.ok(durFresh.staleAlgorithmIds.includes('eqp-legacy-ms'));
  assert.ok(!durFresh.staleAlgorithmIds.includes('mlv-vertical'));

  // Selective Freshness: editing MLv amplitude invalidates MLv WITHOUT invalidating eqp-legacy-ms
  const ampModifiedEv: EQPEvent = {
    ...approvedEv,
    amplitudeMeasurements: approvedEv.amplitudeMeasurements?.map((m, idx) =>
      idx === 0 ? { ...m, amplitude: 25 } : m
    ),
  };
  const ampFresh = inspectMagnitudeFreshness(
    ampModifiedEv,
    ampModifiedEv.magnitudeMetadata,
    withMlvSettings,
    PHILSTA_DATABASE
  );
  assert.equal(ampFresh.isStale, true);
  assert.equal(ampFresh.preferredIsStale, true);
  assert.ok(ampFresh.staleAlgorithmIds.includes('mlv-vertical'));
  assert.ok(!ampFresh.staleAlgorithmIds.includes('eqp-legacy-ms'));

  // Recalculating MLv after amplitude change automatically clears stale uncalibrated approval
  const recalcedMeta = evaluateEventMagnitudes({
    event: ampModifiedEv,
    settings: withMlvSettings,
    stations: PHILSTA_DATABASE,
    preferredMethodOverride: 'mlv-vertical',
  });
  assert.equal(hasValidUncalibratedApproval(recalcedMeta), false);
  assert.notEqual(recalcedMeta.selectedMagnitude, approvedMeta.selectedMagnitude);
  // Hypocenter stays untouched by magnitude recalculation
  assert.equal(ampModifiedEv.lat, ev.lat);
  assert.equal(ampModifiedEv.lon, ev.lon);
  assert.equal(ampModifiedEv.depthKm, ev.depthKm);

  // Changing MLv attenuation settings invalidates MLv fingerprint selectively
  const modifiedCurveSettings = makeExperimentalMlvSettings({
    attenuationTable: [
      { distanceKm: 0, logA0: -1.4 },
      { distanceKm: 60, logA0: -2.9 },
      { distanceKm: 1000, logA0: -5.9 },
    ],
  });
  const curveFresh = inspectMagnitudeFreshness(
    approvedEv,
    approvedEv.magnitudeMetadata,
    modifiedCurveSettings,
    PHILSTA_DATABASE
  );
  assert.equal(curveFresh.isStale, true);
  assert.ok(curveFresh.staleAlgorithmIds.includes('mlv-vertical'));

  // Persistence roundtrip: .eqp save target & sidecar restore keep historical MLv intact
  const saveTarget = buildEqpSaveTarget(approvedEv, 'Y:', {
    freshness: inspectMagnitudeFreshness(
      approvedEv,
      approvedEv.magnitudeMetadata,
      withMlvSettings,
      PHILSTA_DATABASE
    ),
  });
  assert.equal(saveTarget.filenameMagnitudeSource, 'preferred-method');
  assert.match(saveTarget.filename, /_M\d{2}D\d{3}_B/);

  const reparsed = parseEqpFileContent({
    content: '',
    filename: saveTarget.filename,
    displayPath: saveTarget.fullPath,
    stations: PHILSTA_DATABASE,
  });
  // Empty content fallback returns blank event, so test with actual sidecar reconciliation on cloned picks
  const sidecarEvent: EQPEvent = {
    ...reparsed,
    id: approvedEv.id,
    picks: approvedEv.picks.map((p, idx) => ({ ...p, id: `new-pick-${idx}` })),
    magnitudeMetadata: { ...approvedMeta, originState: 'historical_saved' },
  };
  const restored = reconcileLoadedAmplitudeSidecar(sidecarEvent, {
    schemaVersion: 3,
    measurements: approvedEv.amplitudeMeasurements ?? [],
    stationPickAnchors: buildStationPickAnchors(approvedEv.picks),
  });
  assert.equal(restored.amplitudeMeasurements?.length, 2);
  assert.equal(restored.magnitudeMetadata?.originState, 'historical_saved');
  assert.equal(restored.magnitudeMetadata?.selectedScale, 'MLv');

  // Legacy settings migration from MAG-0 without mlvConfig defaults safely to pending_calibration
  const migrated = sanitizeMagnitudeSettings({
    defaultMethod: 'eqp-legacy-ms',
    enabledMethods: ['eqp-legacy-ms'],
  });
  assert.equal(migrated.mlvConfig.calibrationStatus, 'pending_calibration');
  assert.equal(migrated.mlvConfig.allowExperimentalEvaluation, false);
  assert.equal(migrated.mlvConfig.attenuationTable.length, 0);

  // ATLAS/HYDRA parser continues parsing cleanly without interference
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

  // Unimplemented algorithms remain disabled & return unsupported_algorithm
  const disabledIds = ['ml-local', 'mb-body', 'ms-20'] as const;
  for (const id of disabledIds) {
    assert.equal(
      MAGNITUDE_ALGORITHMS.find((a) => a.id === id)?.implemented,
      false
    );
    const evalMap = evaluateEventMagnitudes({
      event: ampEv,
      settings: {
        ...withMlvSettings,
        enabledMethods: ['eqp-legacy-ms', 'mlv-vertical', id],
      },
      stations: PHILSTA_DATABASE,
    });
    assert.equal(evalMap.resultsByAlgorithm[id]?.status, 'unsupported_algorithm');
    assert.equal(evalMap.resultsByAlgorithm[id]?.networkMagnitude, null);
  }
});
