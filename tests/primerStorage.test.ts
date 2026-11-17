import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_EVENTS } from '../src/data/eqpData';
import {
  buildBasePrimerSegments,
  buildEqpSaveTarget,
  buildPrimerSaveTarget,
} from '../src/utils/eqpStorage';

test('buildPrimerSaveTarget uses exact EQP filename format (YYYY_MMDD_HHMM_MxxDddd_BnF.primer.json)', () => {
  const sampleFeltEvent = INITIAL_EVENTS[0];
  assert.equal(sampleFeltEvent.originDateGmt, '2012-02-01');
  assert.equal(sampleFeltEvent.originTimeGmt, '04:30:48.95');

  const eqpTarget = buildEqpSaveTarget(sampleFeltEvent, 'Y:');
  assert.equal(eqpTarget.filename, '2012_0201_0430_M00D014_B1F.eqp');

  const target = buildPrimerSaveTarget(sampleFeltEvent, 'Y:');
  assert.equal(target.folderPath, 'Y:\\EARTHQUAKE\\PRIMER_EQ\\Pri_2012\\02\\01');
  assert.equal(target.filename, '2012_0201_0430_M00D014_B1F.primer.json');
  assert.equal(
    target.fullPath,
    'Y:\\EARTHQUAKE\\PRIMER_EQ\\Pri_2012\\02\\01\\2012_0201_0430_M00D014_B1F.primer.json'
  );
  assert.deepEqual(target.folderSegments, [
    'EARTHQUAKE',
    'PRIMER_EQ',
    'Pri_2012',
    '02',
    '01',
  ]);
});

test('buildPrimerSaveTarget omits F suffix when no intensities and updates magnitude, depth, and bulletinNo', () => {
  const base = INITIAL_EVENTS[0];
  const nonFelt = {
    ...base,
    preferredScale: 'Ms' as const,
    ms: 5.4,
    depthKm: 28.9,
    bulletinNo: 4,
    intensities: [],
  };

  const fromSolution = buildPrimerSaveTarget(nonFelt, 'Y:\\EARTHQUAKE\\SOLUTION_EQ');
  assert.equal(fromSolution.folderPath, 'Y:\\EARTHQUAKE\\PRIMER_EQ\\Pri_2012\\02\\01');
  assert.equal(fromSolution.filename, '2012_0201_0430_M54D028_B4.primer.json');

  const fromBulletin = buildPrimerSaveTarget(nonFelt, 'Y:\\EARTHQUAKE\\BULLETIN_EQ');
  assert.equal(fromBulletin.folderPath, 'Y:\\EARTHQUAKE\\PRIMER_EQ\\Pri_2012\\02\\01');
  assert.deepEqual(buildBasePrimerSegments(['EQP']), ['EQP', 'EARTHQUAKE', 'PRIMER_EQ']);
});
