import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_EVENTS } from '../src/data/eqpData';
import {
  buildBaseBulletinSegments,
  buildBulletinSaveTarget,
} from '../src/utils/eqpStorage';
import { buildBulletinHtmlDocument } from '../src/utils/bulletinHtml';

test('buildBulletinSaveTarget formats Y:\\EARTHQUAKE\\BULLETIN_EQ\\Bul_2012\\02\\01 and 2012_0201_043048_B1F.html', () => {
  const sampleFeltEvent = INITIAL_EVENTS[0];
  assert.equal(sampleFeltEvent.originDateGmt, '2012-02-01');
  assert.equal(sampleFeltEvent.originTimeGmt, '04:30:48.95');

  const target = buildBulletinSaveTarget(sampleFeltEvent, 'Y:');
  assert.equal(target.folderPath, 'Y:\\EARTHQUAKE\\BULLETIN_EQ\\Bul_2012\\02\\01');
  assert.equal(target.filename, '2012_0201_043048_B1F.html');
  assert.equal(
    target.fullPath,
    'Y:\\EARTHQUAKE\\BULLETIN_EQ\\Bul_2012\\02\\01\\2012_0201_043048_B1F.html'
  );
  assert.deepEqual(target.folderSegments, [
    'EARTHQUAKE',
    'BULLETIN_EQ',
    'Bul_2012',
    '02',
    '01',
  ]);
});

test('buildBulletinSaveTarget omits F suffix when no intensities and updates bulletin number', () => {
  const base = INITIAL_EVENTS[0];
  const nonFelt = {
    ...base,
    bulletinNo: 3,
    intensities: [],
  };

  const target = buildBulletinSaveTarget(nonFelt, 'Y:\\EARTHQUAKE\\SOLUTION_EQ');
  assert.equal(target.folderPath, 'Y:\\EARTHQUAKE\\BULLETIN_EQ\\Bul_2012\\02\\01');
  assert.equal(target.filename, '2012_0201_043048_B3.html');
  assert.deepEqual(buildBaseBulletinSegments(['EQP']), ['EQP', 'EARTHQUAKE', 'BULLETIN_EQ']);
});

test('buildBulletinHtmlDocument renders self-contained PHIVOLCS bulletin HTML with notes and print styles', () => {
  const ev = {
    ...INITIAL_EVENTS[0],
    bulletinNote1: 'Aftershocks may continue over the next 24 hours.',
    bulletinNote2: 'Issued for coastal monitoring.',
  };

  const html = buildBulletinHtmlDocument({
    event: ev,
    primaryLocationLabel: '034 km N 66° E of Tagbilaran City (Bohol)',
    faultGeneratorLabel: 'Central Negros Fault',
    printSource: true,
    mapSvgMarkup: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="10" /></svg>',
  });

  assert.match(html, /<!doctype html>/i);
  assert.match(html, /@page\s*\{\s*size:\s*A4 portrait/i);
  assert.match(html, /EARTHQUAKE INFORMATION NO\. : 1/);
  assert.match(html, /Fault Generator<\/td><td>:<\/td><td class="val">Central Negros Fault/);
  assert.match(html, /Aftershocks may continue over the next 24 hours\./);
  assert.match(html, /Issued for coastal monitoring\./);
  assert.match(html, /<svg viewBox="0 0 100 100">/);
});
