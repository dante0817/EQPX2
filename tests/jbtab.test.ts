import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { JBTAB_PS_RAW } from '../src/data/jbtabRaw';
import {
  getDefaultJbTables,
  JbLookupError,
  lookupJbTravelTime,
  tryLookupJbTravelTime,
} from '../src/utils/jbtab';
import { JBTAB_PS_SHA256 } from '../src/utils/travelTime/jbProvider';

test('JBTAB_PS_RAW matches the authoritative checksum and file on disk', () => {
  const diskPath = path.resolve(process.cwd(), 'public/assets/aistudio/JBTAB_b5700af2.txt');
  const diskText = fs.readFileSync(diskPath, 'utf8');
  const rawHash = crypto.createHash('sha256').update(JBTAB_PS_RAW, 'utf8').digest('hex');
  const diskHash = crypto.createHash('sha256').update(diskText, 'utf8').digest('hex');

  assert.equal(rawHash, JBTAB_PS_SHA256);
  assert.equal(diskHash, JBTAB_PS_SHA256);
});

test('JBTAB P and S tables preserve independent depth/distance grids and key exact nodes', () => {
  const tables = getDefaultJbTables();
  assert.equal(tables.P.numDepths, 15);
  assert.equal(tables.P.numDistances, 103);
  assert.equal(tables.S.numDepths, 14);
  assert.equal(tables.S.numDistances, 108);

  // P(0 deg, 0 km) = 0.00 s
  const p0 = tryLookupJbTravelTime('P', 0, 0, tables);
  assert.equal(p0.ok, true);
  if (p0.ok) {
    assert.equal(p0.timeSec, 0);
    assert.equal(p0.depthKm, 0);
  }

  // P(45 deg, 603 km) = 446.60 s
  const pDeep = tryLookupJbTravelTime('P', 45, 603, tables);
  assert.equal(pDeep.ok, true);
  if (pDeep.ok) {
    assert.ok(Math.abs(pDeep.timeSec - 446.6) < 1e-6);
  }

  // S(0 deg, 0 km) = 10.70 s
  const s0 = tryLookupJbTravelTime('S', 0, 0, tables);
  assert.equal(s0.ok, true);
  if (s0.ok) {
    assert.equal(s0.timeSec, 10.7);
  }

  // S(103 deg, 793.6 km) = 1400.00 s (last valid S cell on bottom row; cols 104..107 are 0.00 sentinels)
  const sMax = tryLookupJbTravelTime('S', 103, 793.6, tables);
  assert.equal(sMax.ok, true);
  if (sMax.ok) {
    assert.ok(Math.abs(sMax.timeSec - 1400.0) < 1e-6);
  }
});

test('Bilinear interpolation inside interior cells computes valid time and derivatives', () => {
  const tables = getDefaultJbTables();
  const res = tryLookupJbTravelTime('P', 1.5, 24.0, tables);
  assert.equal(res.ok, true);
  if (res.ok) {
    // Depth 24.0 km sits midway between depth=15 km (row 1) and depth=33 km (row 2); delta=1.5 sits between 1 and 2 deg.
    const r0 = tables.P.rows[1];
    const r1 = tables.P.rows[2];
    assert.equal(r0.depthKm, 15);
    assert.equal(r1.depthKm, 33);
    const fz = (24.0 - 15) / (33 - 15);
    const tTop = 0.5 * (r0.timesSec[1] + r0.timesSec[2]);
    const tBot = 0.5 * (r1.timesSec[1] + r1.timesSec[2]);
    const expectedT = tTop + fz * (tBot - tTop);
    assert.ok(Math.abs(res.timeSec - expectedT) < 1e-6);
    assert.ok(res.dTdDeltaDeg > 0);
    assert.equal(res.derivativeDepthValid, true);
  }
});

test('Out-of-range inputs and NaN/Infinity fail explicitly without silent clamping or returning 0', () => {
  const negDepth = tryLookupJbTravelTime('P', 1.0, -5);
  assert.equal(negDepth.ok, false);
  if (!negDepth.ok) assert.equal(negDepth.status, 'out_of_depth_range');

  const overDepth = tryLookupJbTravelTime('P', 1.0, 900);
  assert.equal(overDepth.ok, false);
  if (!overDepth.ok) assert.equal(overDepth.status, 'out_of_depth_range');

  const negDist = tryLookupJbTravelTime('P', -0.5, 10);
  assert.equal(negDist.ok, false);
  if (!negDist.ok) assert.equal(negDist.status, 'out_of_distance_range');

  const overDistP = tryLookupJbTravelTime('P', 103.5, 10);
  assert.equal(overDistP.ok, false);
  if (!overDistP.ok) assert.equal(overDistP.status, 'out_of_distance_range');

  const nanInput = tryLookupJbTravelTime('P', Number.NaN, 10);
  assert.equal(nanInput.ok, false);
  if (!nanInput.ok) assert.equal(nanInput.status, 'invalid_input');

  assert.throws(
    () => lookupJbTravelTime('S', 110, 10),
    (err: unknown) => err instanceof JbLookupError && err.status === 'out_of_distance_range'
  );
});

test('Shadow-zone 0.00 sentinels in S table and brackets touching unavailable nodes are rejected', () => {
  const tables = getDefaultJbTables();
  // In JBTAB.PS, S at depth=793.6 km (row 13) ends at delta=103 deg (maxValidCol=103); cols 104..107 are 0.00 sentinels.
  const sRowBottom = tables.S.rows[tables.S.rows.length - 1];
  const shadowDelta = tables.S.deltaStartDeg + (sRowBottom.maxValidCol + 1) * tables.S.deltaStepDeg;
  const exactShadow = tryLookupJbTravelTime('S', shadowDelta, sRowBottom.depthKm, tables);
  assert.equal(exactShadow.ok, false);
  if (!exactShadow.ok) assert.equal(exactShadow.status, 'unavailable_cell');

  // Interpolation crossing between last valid S cell (col 103) and adjacent unavailable shadow-zone cell (col 104)
  const straddlingDelta =
    tables.S.deltaStartDeg + (sRowBottom.maxValidCol + 0.5) * tables.S.deltaStepDeg;
  const straddle = tryLookupJbTravelTime('S', straddlingDelta, sRowBottom.depthKm - 5, tables);
  assert.equal(straddle.ok, false);
  if (!straddle.ok) assert.equal(straddle.status, 'unavailable_cell');
});
