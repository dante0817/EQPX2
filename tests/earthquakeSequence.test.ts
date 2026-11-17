import assert from 'node:assert/strict';
import { INITIAL_EVENTS } from '../src/data/eqpData';
import type { HistoricalEarthquakeRecord } from '../src/utils/historicalSeismicity';
import {
  assembleEarthquakeSequence,
  buildSequenceQualityReport,
  computeConditionalOmoriDecay,
  computeMagnitudeFrequencyAnalysis,
  computeTimelineRateSummary,
  DEFAULT_SEQUENCE_FILTERS,
  exportMagnitudeFrequencyCsv,
  exportSequenceInvestigationJson,
  exportTimelineRatesCsv,
  parseSequenceInvestigationJson,
} from '../src/utils/earthquakeSequence';

function makeRecord(overrides: Partial<HistoricalEarthquakeRecord> & { id: string; eventId: string; originTimeMs: number }): HistoricalEarthquakeRecord {
  return {
    lat: 14.0,
    lon: 121.0,
    depthKm: 12,
    depthStatus: 'known',
    magnitude: 3.5,
    magnitudeType: 'Mw',
    dataSource: 'PHIVOLCS',
    catalogVersion: '1',
    quality: 'A',
    locationUncertain: false,
    horizontalErrKm: 1.5,
    depthErrKm: 2.5,
    place: 'Test Region',
    sourceReference: 'Test',
    retrievedAtUtc: new Date(overrides.originTimeMs).toISOString(),
    originTimeUtc: new Date(overrides.originTimeMs).toISOString(),
    focalMechanism: null,
    ...overrides,
  };
}

const refEvent = {
  ...INITIAL_EVENTS[0],
  lat: 14.0,
  lon: 121.0,
  depthKm: 12,
  originDateGmt: '2025-01-10',
  originTimeGmt: '00:00:00.0',
};
const refMs = Date.parse('2025-01-10T00:00:00Z');

// 1. Assembly: deduplication, reference match, conservative non-aftershock labeling
const catalogForAssembly: HistoricalEarthquakeRecord[] = [
  makeRecord({ id: 'r_ref', eventId: 'EQ_REF', originTimeMs: refMs, lat: 14.0, lon: 121.0, magnitude: 6.2 }),
  // Cross-source uncertain duplicate within 10s & 5km
  makeRecord({
    id: 'r_dup',
    eventId: 'USGS_DUP',
    dataSource: 'USGS',
    originTimeMs: refMs + 6000,
    lat: 14.02,
    lon: 121.01,
    magnitude: 6.1,
  }),
  // Background nearby event 2 days after ref, but NO cluster assist & NO candidate mainshock nominated
  makeRecord({
    id: 'r_bg',
    eventId: 'EQ_BG',
    originTimeMs: refMs + 48 * 3600_000,
    lat: 14.25,
    lon: 121.2,
    magnitude: 3.8,
  }),
];

const assembledConservative = assembleEarthquakeSequence({
  catalog: catalogForAssembly,
  activeEvent: refEvent,
  filters: { ...DEFAULT_SEQUENCE_FILTERS, enableClusterAssist: false },
  candidateMainshockId: null,
  manualIncludedIds: new Set(),
  manualExcludedIds: new Set(),
  manualRoles: {},
});

assert.equal(assembledConservative.duplicateCount, 1, 'Expected 1 cross-source duplicate detected');
assert.equal(assembledConservative.selectedCount, 2, 'Duplicate should be excluded by default');
const bgRow = assembledConservative.selectedEvents.find((e) => e.record.id === 'r_bg');
assert.ok(bgRow, 'Background event should be selected');
assert.equal(bgRow.role, 'Unclassified', 'Nearby events must NOT be auto-labeled as aftershocks');
const refRow = assembledConservative.selectedEvents.find((e) => e.record.id === 'r_ref');
assert.equal(refRow?.role, 'Reference Event', 'Matched reference event keeps Reference Event role');

// 2. ST-DBSCAN clustering
const clusterCatalog: HistoricalEarthquakeRecord[] = Array.from({ length: 6 }, (_, i) =>
  makeRecord({
    id: `c_${i}`,
    eventId: `CL_${i}`,
    originTimeMs: refMs + (i + 1) * 3600_000,
    lat: 14.05 + i * 0.01,
    lon: 121.05 + i * 0.01,
    magnitude: 3.2 + (i % 3) * 0.3,
  })
);

const assembledCluster = assembleEarthquakeSequence({
  catalog: clusterCatalog,
  activeEvent: refEvent,
  filters: {
    ...DEFAULT_SEQUENCE_FILTERS,
    enableClusterAssist: true,
    clusterEpsKm: 15,
    clusterTimeHours: 24,
    clusterMinPts: 4,
  },
  candidateMainshockId: null,
  manualIncludedIds: new Set(),
  manualExcludedIds: new Set(),
  manualRoles: {},
});
assert.equal(assembledCluster.clusterCount, 1, 'Expected 1 ST-DBSCAN cluster');
assert.equal(assembledCluster.characterization, 'Swarm / Cluster Candidate');

// 3. Omori-Utsu swarm refusal (no Candidate Mainshock)
const omoriSwarm = computeConditionalOmoriDecay({
  selectedEvents: assembledCluster.selectedEvents,
  characterization: assembledCluster.characterization,
  referenceTimeMs: assembledCluster.referenceTimeMs,
  candidateMainshockTimeMs: null,
  fitStartDays: 0.01,
  fitEndDays: 30,
  mcThreshold: 3.0,
  magTypeFilter: 'Mw',
});
assert.equal(omoriSwarm.suitableForOmori, false, 'Swarm without mainshock must refuse Omori fit');
assert.equal(omoriSwarm.status, 'Ambiguous');

// 4. Magnitude-Frequency: Insufficient Data guardrail + Aki MLE b-value recovery on exponential sample
const tinyMfd = computeMagnitudeFrequencyAnalysis({
  selectedEvents: assembledCluster.selectedEvents,
  selectedMagType: 'Mw',
  mcMethod: 'manual',
  manualMc: 3.0,
});
assert.equal(tinyMfd.status, 'Insufficient Data');
assert.equal(tinyMfd.bValue, null);

// Deterministic Gutenberg-Richter sample (N=120 above Mc=3.0, target b ~ 1.0) + 10 Ml events ignored
const bTrue = 1.0;
const grEvents: HistoricalEarthquakeRecord[] = [];
for (let i = 0; i < 120; i++) {
  const u = (i + 0.5) / 120;
  const m = 3.0 - Math.log10(u) / bTrue;
  grEvents.push(
    makeRecord({
      id: `gr_${i}`,
      eventId: `GR_${i}`,
      originTimeMs: refMs + (i + 1) * 1800_000,
      magnitude: Number(Math.min(7.2, m).toFixed(1)),
      magnitudeType: 'Mw',
    })
  );
}
for (let j = 0; j < 10; j++) {
  grEvents.push(
    makeRecord({
      id: `ml_${j}`,
      eventId: `ML_${j}`,
      originTimeMs: refMs + (j + 1) * 3600_000,
      magnitude: 2.5,
      magnitudeType: 'Ml',
    })
  );
}
const grAssembled = assembleEarthquakeSequence({
  catalog: grEvents,
  activeEvent: refEvent,
  filters: DEFAULT_SEQUENCE_FILTERS,
  candidateMainshockId: 'gr_0',
  manualIncludedIds: new Set(),
  manualExcludedIds: new Set(),
  manualRoles: {},
});
const grMfd = computeMagnitudeFrequencyAnalysis({
  selectedEvents: grAssembled.selectedEvents,
  selectedMagType: 'Mw',
  mcMethod: 'manual',
  manualMc: 3.0,
});
assert.ok(grMfd.bValue !== null && Math.abs(grMfd.bValue - 1.0) < 0.2, `Expected b ~ 1.0, got ${grMfd.bValue}`);
assert.equal(grMfd.selectedMagType, 'Mw', 'Must isolate to Mw only without mixing Ml');

const maxcMfd = computeMagnitudeFrequencyAnalysis({
  selectedEvents: grAssembled.selectedEvents,
  selectedMagType: 'Mw',
  mcMethod: 'maxc',
  manualMc: 3.0,
  binWidth: 0.2,
});
assert.ok(maxcMfd.mcValue !== null && maxcMfd.mcValue >= 3.0 && maxcMfd.mcValue <= 7.2);
const mfdCsv = exportMagnitudeFrequencyCsv(grMfd, 'GRTest');
assert.ok(mfdCsv.includes('b:') && mfdCsv.includes('Mc:') && mfdCsv.includes('residualLog10'));
assert.ok(mfdCsv.includes('3.00,0.10,'));

// 5. Omori-Utsu MLE fit on synthetic decaying sequence + gap detection in timeline
const decayingCatalog: HistoricalEarthquakeRecord[] = [
  makeRecord({ id: 'ms_0', eventId: 'MS_0', originTimeMs: refMs, magnitude: 6.5 }),
];
// Generate 60 events decaying roughly with 1/(t + 0.05) across [0.02, 20] days
for (let k = 1; k <= 60; k++) {
  const tDays = 0.02 * Math.pow(1000, k / 60);
  decayingCatalog.push(
    makeRecord({
      id: `af_${k}`,
      eventId: `AF_${k}`,
      originTimeMs: refMs + Math.round(tDays * 86_400_000),
      magnitude: 3.5 + (k % 5) * 0.2,
    })
  );
}
const decayAssembled = assembleEarthquakeSequence({
  catalog: decayingCatalog,
  activeEvent: refEvent,
  filters: DEFAULT_SEQUENCE_FILTERS,
  candidateMainshockId: 'ms_0',
  manualIncludedIds: new Set(),
  manualExcludedIds: new Set(),
  manualRoles: {},
});
const omoriFit = computeConditionalOmoriDecay({
  selectedEvents: decayAssembled.selectedEvents,
  characterization: decayAssembled.characterization,
  referenceTimeMs: decayAssembled.referenceTimeMs,
  candidateMainshockTimeMs: decayAssembled.candidateMainshockTimeMs,
  fitStartDays: 0.02,
  fitEndDays: 25,
  mcThreshold: 3.0,
  magTypeFilter: 'Mw',
});
assert.equal(omoriFit.suitableForOmori, true);
assert.ok(omoriFit.pValue !== null && omoriFit.pValue > 0.6 && omoriFit.pValue < 1.5, `Unexpected p=${omoriFit.pValue}`);

const timelineCheck = computeTimelineRateSummary({
  selectedEvents: decayAssembled.selectedEvents,
  referenceTimeMs: decayAssembled.referenceTimeMs,
  filters: { ...DEFAULT_SEQUENCE_FILTERS, gapThresholdHours: 24 },
});
assert.ok(timelineCheck.gaps.length >= 1, 'Expected at least one gap alert at tail of decaying sequence');
assert.ok(timelineCheck.bins.length >= 2, 'Expected multiple UTC timeline bins');
const rateCsv = exportTimelineRatesCsv(timelineCheck, 'DecayTest');
assert.ok(rateCsv.includes('ratePerDay') && rateCsv.includes('isPartialInterval'));

// 6. Persistence round-trip (metadata + membership decisions)
const qualityCheck = buildSequenceQualityReport({
  assembly: decayAssembled,
  timeline: timelineCheck,
  mfd: grMfd,
  omori: omoriFit,
});
const exportedPkg = exportSequenceInvestigationJson({
  investigationName: 'M6.5 Sequence Audit',
  notes: 'Confirmed candidate mainshock + manual exclusion audit',
  activeEvent: refEvent,
  filters: DEFAULT_SEQUENCE_FILTERS,
  assembly: decayAssembled,
  timeline: timelineCheck,
  mfd: grMfd,
  omori: omoriFit,
  quality: qualityCheck,
  catalogVersion: 3,
  inputFingerprint: 'fp-test-v1',
  includedEventIds: ['af_1'],
  excludedEventIds: ['af_2'],
  manualRoles: { af_1: 'Candidate Aftershock' },
});
const parsedInv = parseSequenceInvestigationJson(exportedPkg);
assert.equal(parsedInv.name, 'M6.5 Sequence Audit');
assert.equal(parsedInv.notes, 'Confirmed candidate mainshock + manual exclusion audit');
assert.equal(parsedInv.candidateMainshockId, 'ms_0');
assert.deepEqual(parsedInv.includedEventIds, ['af_1']);
assert.deepEqual(parsedInv.excludedEventIds, ['af_2']);
assert.equal(parsedInv.manualRoles.af_1, 'Candidate Aftershock');

console.log(
  `Earthquake sequence checks passed: b=${grMfd.bValue}, Omori p=${omoriFit.pValue}, c=${omoriFit.cValueDays}d, KS=${omoriFit.ksStatistic}`
);
