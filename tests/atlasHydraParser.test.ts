import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { INITIAL_EVENTS, PHILSTA_DATABASE } from '../src/data/eqpData';
import { parsePhilstaText } from '../src/utils/philstaParser';
import { calculateCandidateLocation } from '../src/utils/locationController';
import {
  appendAtlasParseToEqpEvent,
  applyAtlasParseToEqpEvent,
  buildStationMetadataOverridesForPicks,
  convertAtlasResultToStationPicks,
  detectAtlasHydraFormat,
  parseAtlasHydraClipboard,
} from '../src/utils/atlasHydraParser';

const STAGE_5_SAMPLE = `201105271731107416 4188122E4010  137    14                                                                                                       0
$1
APYP PV  EHZ  P 0201105271731 4054               6                                0     139
$
BALP PV  EHZ  P 0201105271731 3452               6
$
BALP PV  EHE    6201105271731             5386 S 0
$
CAUP PV  EHZ  P 0201105271731 2472               6                                0     197
$
CAUP PV  EHN    6201105271731             3953 S 0
$
POLP PV  EHN  P 0201105271731 4568               6                                0     146
$
POLP PV  EHE    6201105271732             1064 S 0
$
SCZP PV  EHZ  P 0201105271731 5588               6
$
SCZP PV  EHN    6201105271732             3744 S 0
$
SGCP PV  EHZ  P 0201105271731 3996               6
$
SGCP PV  EHN    6201105271731             5885 S 0
$
                                                              0
$                                                             0`;

// Load full PHILSTA-main database so APYP, BALP, CAUP, POLP, SCZP, SGCP resolve to APY, BAL, CAU, POL, SCZ, SGC
const philstaPath = path.resolve(process.cwd(), 'public/assets/aistudio/PHILSTA-main_6028d80d.txt');
const philstaText = fs.readFileSync(philstaPath, 'utf8');
const philstaParsed = parsePhilstaText(philstaText).stations;

// 1. Format detection (Unix LF + Windows CRLF, plus ordinary non-HYDRA text rejection)
assert.equal(detectAtlasHydraFormat(STAGE_5_SAMPLE), true, 'Stage 5 Unix LF sample should detect as ATLAS/HYDRA');
assert.equal(
  detectAtlasHydraFormat(STAGE_5_SAMPLE.replace(/\n/g, '\r\n')),
  true,
  'Windows CRLF sample should detect identically without corrupting fixed columns'
);
assert.equal(detectAtlasHydraFormat('BES 3057.36'), false, 'Ordinary EQP pick text must not trigger HYDRA');
assert.equal(detectAtlasHydraFormat('2011052717311074\nNO_DOLLAR_ONE\nAPYP'), false, 'Missing $1 must reject');

// 2. Parse Stage 5 sample and verify exact origin, station picks, P, S, duration, and rollovers
const parsed = parseAtlasHydraClipboard(STAGE_5_SAMPLE, philstaParsed);
assert.equal(parsed.valid, true);
assert.equal(parsed.header?.originDateGmt, '2011-05-27');
assert.equal(parsed.header?.originTimeGmt, '17:31:10.74');
assert.equal(parsed.summary.totalStations, 6);
assert.equal(parsed.summary.pObservations, 6);
assert.equal(parsed.summary.sObservations, 5);
assert.equal(parsed.summary.validDurations, 3);
assert.equal(parsed.summary.rejectedLineCount, 0);

const bySta = new Map(parsed.groups.map((g) => [g.stationCode, g]));
assert.deepEqual(
  Array.from(bySta.keys()),
  ['APYP', 'BALP', 'CAUP', 'POLP', 'SCZP', 'SGCP'],
  'All 6 4-char station identifiers preserved'
);

// APYP: P 17:31:40.54, S blank, Dur 139
assert.equal(bySta.get('APYP')?.primaryP?.utcTimeDisplay, '17:31:40.54');
assert.equal(bySta.get('APYP')?.primaryS, null);
assert.equal(bySta.get('APYP')?.duration, 139);
assert.equal(bySta.get('APYP')?.resolvedDbStation?.code, 'APY');

// BALP: P 17:31:34.52, S 17:31:53.86, Dur missing (MUST NOT calculate from S - P!)
assert.equal(bySta.get('BALP')?.primaryP?.utcTimeDisplay, '17:31:34.52');
assert.equal(bySta.get('BALP')?.primaryS?.utcTimeDisplay, '17:31:53.86');
assert.equal(bySta.get('BALP')?.duration, null);
assert.equal(bySta.get('BALP')?.resolvedDbStation?.code, 'BAL');

// CAUP: P 17:31:24.72, S 17:31:39.53, Dur 197
assert.equal(bySta.get('CAUP')?.primaryP?.utcTimeDisplay, '17:31:24.72');
assert.equal(bySta.get('CAUP')?.primaryS?.utcTimeDisplay, '17:31:39.53');
assert.equal(bySta.get('CAUP')?.duration, 197);
assert.equal(bySta.get('CAUP')?.resolvedDbStation?.code, 'CAU');

// POLP: P 17:31:45.68, S 17:32:10.64 (minute rollover!), Dur 146
assert.equal(bySta.get('POLP')?.primaryP?.utcTimeDisplay, '17:31:45.68');
assert.equal(bySta.get('POLP')?.primaryS?.utcTimeDisplay, '17:32:10.64');
assert.equal(bySta.get('POLP')?.primaryS?.mmSs, '3210.64');
assert.equal(bySta.get('POLP')?.primaryS?.relSecFromOrigin, 59.9);
assert.equal(bySta.get('POLP')?.duration, 146);
assert.equal(bySta.get('POLP')?.resolvedDbStation?.code, 'POL');

// SCZP: P 17:31:55.88, S 17:32:37.44 (minute rollover!), Dur missing
assert.equal(bySta.get('SCZP')?.primaryP?.utcTimeDisplay, '17:31:55.88');
assert.equal(bySta.get('SCZP')?.primaryS?.utcTimeDisplay, '17:32:37.44');
assert.equal(bySta.get('SCZP')?.primaryS?.mmSs, '3237.44');
assert.equal(bySta.get('SCZP')?.primaryS?.relSecFromOrigin, 86.7);
assert.equal(bySta.get('SCZP')?.duration, null);
assert.equal(bySta.get('SCZP')?.resolvedDbStation?.code, 'SCZ');

// SGCP: P 17:31:39.96, S 17:31:58.85, Dur missing
assert.equal(bySta.get('SGCP')?.primaryP?.utcTimeDisplay, '17:31:39.96');
assert.equal(bySta.get('SGCP')?.primaryS?.utcTimeDisplay, '17:31:58.85');
assert.equal(bySta.get('SGCP')?.duration, null);
assert.equal(bySta.get('SGCP')?.resolvedDbStation?.code, 'SGC');

// 3. Empty-panel population + compatibility with location solver (manual trigger only)
const picks = convertAtlasResultToStationPicks(parsed);
assert.equal(picks.length, 6);
assert.equal(picks[0].sta, 'APYP');
assert.equal(picks[0].pTime, '3140.54');
assert.equal(picks[0].sTime, '');
assert.equal(picks[0].duration, 139);
assert.equal(picks[3].sta, 'POLP');
assert.equal(picks[3].sTime, '3210.64');

const emptyEvent = { ...INITIAL_EVENTS[0], picks: [] };
const populatedEvent = applyAtlasParseToEqpEvent(emptyEvent, parsed);
assert.equal(populatedEvent.lat, 0, 'Must not fabricate epicenter coordinates from header');
assert.equal(populatedEvent.lon, 0, 'Must not fabricate epicenter coordinates from header');
assert.equal(populatedEvent.originDateGmt, '2011-05-27');
assert.equal(populatedEvent.originTimeGmt, '17:31:10.74');
assert.equal(populatedEvent.picks.length, 6);

const overrides = buildStationMetadataOverridesForPicks(populatedEvent.picks, philstaParsed);
assert.ok(overrides.APYP && overrides.POLP && overrides.SGCP, 'Verified 4-char -> 3-char PHILSTA overrides constructed');
const located = calculateCandidateLocation({
  event: populatedEvent,
  stations: philstaParsed,
  solverEngine: 'EQP',
  modelId: 'jb-jbtab',
  stationMetadataOverrides: overrides,
});
assert.equal(located.result.converged, true, 'Solver should converge cleanly with verified ATLAS observations');
assert.equal(located.result.usedStationCount, 6);
assert.equal(located.result.usedPCount, 6);
assert.equal(located.result.usedSCount, 5);

// 4. Append-only requirement: existing 2 rows preserved + 6 appended = 8 total, no sorting, no origin overwrite
const existingTgy = {
  ...INITIAL_EVENTS[0].picks[0],
  id: 'manual-tgy-1',
  sta: 'TGY',
  pTime: '3120.10',
  sTime: '3135.20',
  duration: 120,
  obsP: 20.1,
  obsS: 35.2,
};
const existingLub = {
  ...INITIAL_EVENTS[0].picks[0],
  id: 'manual-lub-2',
  sta: 'LUB',
  pTime: '3122.50',
  sTime: '3140.80',
  duration: 150,
  obsP: 22.5,
  obsS: 40.8,
};
const eventWithTwoExisting = {
  ...INITIAL_EVENTS[0],
  originDateGmt: '2011-05-27',
  originTimeGmt: '17:31:00.00',
  originDateLst: '2011-05-28',
  originTimeLst: '01:31:00.00',
  lat: 14.123,
  lon: 120.456,
  depthKm: 12.5,
  picks: [existingTgy, existingLub],
};

const appendOutcome = appendAtlasParseToEqpEvent(eventWithTwoExisting, parsed);
assert.equal(appendOutcome.mode, 'appended-existing');
assert.equal(appendOutcome.existingCountBefore, 2);
assert.equal(appendOutcome.appendedCount, 6);
assert.equal(appendOutcome.totalCountAfter, 8);
assert.equal(appendOutcome.event.picks.length, 8);
assert.strictEqual(appendOutcome.event.picks[0], existingTgy, 'Original row 0 must remain untouched');
assert.strictEqual(appendOutcome.event.picks[1], existingLub, 'Original row 1 must remain untouched');
assert.deepEqual(
  appendOutcome.event.picks.map((p) => p.sta),
  ['TGY', 'LUB', 'APYP', 'BALP', 'CAUP', 'POLP', 'SCZP', 'SGCP'],
  'Existing rows stay first in original order, followed by newly parsed stations without sorting'
);
assert.equal(appendOutcome.event.originDateGmt, '2011-05-27', 'Existing originDateGmt preserved');
assert.equal(appendOutcome.event.originTimeGmt, '17:31:00.00', 'Existing originTimeGmt preserved');
assert.equal(appendOutcome.event.lat, 14.123, 'Existing event lat preserved');
assert.equal(appendOutcome.originTimeMismatch, true, 'Event-time mismatch reported accurately');

// Duplicate station in pasted block must NOT merge or overwrite existing station
const duplicateAppendOutcome = appendAtlasParseToEqpEvent(appendOutcome.event, parsed);
assert.equal(duplicateAppendOutcome.mode, 'appended-existing');
assert.equal(duplicateAppendOutcome.existingCountBefore, 8);
assert.equal(duplicateAppendOutcome.appendedCount, 6);
assert.equal(duplicateAppendOutcome.totalCountAfter, 14);
assert.notEqual(
  duplicateAppendOutcome.event.picks[2].id,
  duplicateAppendOutcome.event.picks[8].id,
  'Duplicate station APYP appended as a distinct row with unique ID'
);

// Failed parse must preserve all existing observations unchanged
const failedParse = parseAtlasHydraClipboard('2011052717311074\n$1\nBADP PV  EHZ  P 0201105271731 6500', PHILSTA_DATABASE);
assert.equal(failedParse.valid, false);
const failedOutcome = appendAtlasParseToEqpEvent(eventWithTwoExisting, failedParse);
assert.equal(failedOutcome.mode, 'noop-failed');
assert.strictEqual(failedOutcome.event, eventWithTwoExisting, 'Failed parse returns existing event unchanged');
assert.equal(failedOutcome.event.picks.length, 2);

// 5. Hour, midnight, and year rollover + malformed, S-only, duplicate, and 3-char prefix conflict handling
const edgeSample = `2011123123595025
$1
SCZP PV  EHZ  P 0201112312359 5510
$
SCZP PV  EHZ  P 0201201010000 0510
$
SCZB PV  EHN    6201201010000             1520 S 0
$
BADP PV  EHZ  P 0201201010000 6500
$
DATE PV  EHZ  P 0201102300000 1000
$`;

const edgeParsed = parseAtlasHydraClipboard(edgeSample, PHILSTA_DATABASE);
assert.equal(edgeParsed.valid, true);
assert.equal(edgeParsed.header?.originDateGmt, '2011-12-31');
assert.equal(edgeParsed.header?.originTimeGmt, '23:59:50.25');
assert.equal(edgeParsed.groups.length, 2, 'Distinct 4-char stations sharing prefix SCZ must NOT merge');

const sczpEdge = edgeParsed.groups.find((g) => g.stationCode === 'SCZP');
const sczbEdge = edgeParsed.groups.find((g) => g.stationCode === 'SCZB');
assert.equal(sczpEdge?.pCandidates.length, 2, 'Duplicate P candidates preserved internally');
assert.equal(sczpEdge?.ambiguousPhases, true, 'Duplicate P + 3-char prefix conflict flagged ambiguous');
assert.equal(sczpEdge?.threeCharAliasConflict, true);
assert.equal(sczpEdge?.resolvedDbStation, null, 'Prefix conflict prevents silent 3-char alias merge');

assert.equal(sczbEdge?.sOnlyMissingP, true, 'S-only record preserves S and flags missing P');
assert.equal(sczbEdge?.primaryS?.utcDateDisplay, '2012-01-01');
assert.equal(sczbEdge?.primaryS?.utcTimeDisplay, '00:00:15.20');
assert.equal(sczbEdge?.primaryS?.relSecFromOrigin, 24.95);
assert.equal(edgeParsed.rejectedLines.length, 2, 'Invalid seconds (65.00) and invalid calendar date (Feb 30) rejected safely');

console.log(
  `ATLAS/HYDRA tests passed: ${parsed.summary.totalStations} sta, ${parsed.summary.pObservations} P, ${parsed.summary.sObservations} S, ${parsed.summary.validDurations} Dur, Append 2+6=${appendOutcome.totalCountAfter}, Locate RMS=${located.result.rmsSec}s`
);
