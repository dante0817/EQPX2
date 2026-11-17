import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { INITIAL_EVENTS, type IntensityEntry } from '../src/data/eqpData';
import {
  parseCityCsvText,
  parsePopulationCentersText,
  type NearestPlacesCatalog,
} from '../src/utils/nearestPlaces';
import {
  buildPhilippineLocalityIndex,
  getMunicipalitiesForProvince,
  resolvePhilippineLocality,
} from '../src/utils/intensityLocalityCatalog';
import {
  analyzeIntensityEntries,
  formatGroupedBulletinIntensityBlock,
  getEventFeltStatusSummary,
  hasEventFeltDesignation,
  mergeConflictingObservations,
  parseRawIntensityReports,
  selectWinningConflictObservation,
  validateCandidateIntensityInput,
} from '../src/utils/intensityFormat';
import {
  buildBulletinSaveTarget,
  formatEqpFileContent,
  parseEqpFileContent,
} from '../src/utils/eqpStorage';

function loadLocalPlacesCatalog(): NearestPlacesCatalog {
  const popPath = path.resolve(
    process.cwd(),
    'public/assets/aistudio/Population_Centers_2007_e2850078.txt'
  );
  const cityPath = path.resolve(
    process.cwd(),
    'public/assets/aistudio/CITY_f9a7e5f3.csv'
  );
  const popText = fs.readFileSync(popPath, 'utf8');
  const cityText = fs.readFileSync(cityPath, 'latin1');
  return {
    cities: parseCityCsvText(cityText),
    towns: parsePopulationCentersText(popText),
    generators: [],
  };
}

test('buildPhilippineLocalityIndex loads 82 provinces/NCR offline and resolves province aliases cleanly', () => {
  const catalog = loadLocalPlacesCatalog();
  const index = buildPhilippineLocalityIndex(catalog);

  assert.ok(index.provinces.length >= 80, `Expected >=80 provinces, got ${index.provinces.length}`);
  assert.ok(index.provinces.includes('Catanduanes'));
  assert.ok(index.provinces.includes('Metro Manila'));
  assert.ok(index.provinces.includes('Davao de Oro'));

  const catanduanesMunis = getMunicipalitiesForProvince(index, 'Catanduanes');
  assert.ok(catanduanesMunis.some((m) => m.municipality === 'Virac'));
  assert.ok(catanduanesMunis.some((m) => m.municipality === 'Bato'));
  assert.ok(catanduanesMunis.some((m) => m.municipality === 'San Miguel'));

  // Alias resolution: Compostela Valley -> Davao de Oro
  const compValRes = resolvePhilippineLocality(index, 'Nabunturan, Compostela Valley');
  assert.equal(compValRes.matched, true);
  assert.equal(compValRes.province, 'Davao de Oro');
  assert.equal(compValRes.municipality, 'Nabunturan');

  // Unqualified ambiguous town should remain unresolved rather than guessing
  const ambiguous = resolvePhilippineLocality(index, 'San Miguel');
  assert.equal(ambiguous.matched, false);
  assert.equal(ambiguous.status, 'unresolved');
  assert.match(ambiguous.reason ?? '', /Ambiguous locality/);
});

test('parseRawIntensityReports expands multi-locality clauses, preserves specific barangays, and flags duplicates/conflicts', () => {
  const catalog = loadLocalPlacesCatalog();
  const index = buildPhilippineLocalityIndex(catalog);

  const existing: IntensityEntry[] = [
    {
      id: 'ex-1',
      peis: 'V',
      locality: 'Virac, Catanduanes',
      province: 'Catanduanes',
      municipality: 'Virac',
      reviewStatus: 'verified',
      reportSource: 'Official Report',
    },
    {
      id: 'ex-2',
      peis: 'III',
      locality: 'Baras, Catanduanes',
      province: 'Catanduanes',
      municipality: 'Baras',
      reviewStatus: 'verified',
      reportSource: 'MDRRMO',
    },
  ];

  const rawText = [
    'Intensity V - Virac, Catanduanes',
    'Intensity IV - Bato and San Miguel, Catanduanes',
    'Intensity IV - Baras, Catanduanes',
    'Intensity IV - Brgy. Concepcion, Gigmoto, Catanduanes',
    'Intensity II - Atlantis, Unknown Province',
  ].join('\n');

  const parsed = parseRawIntensityReports(rawText, index, existing);

  assert.equal(parsed.summary.parsed, 6);
  assert.equal(parsed.summary.duplicates, 1); // Virac V
  assert.equal(parsed.summary.matched, 3); // Bato, San Miguel, Concepcion/Gigmoto
  assert.equal(parsed.summary.conflicts, 1); // Baras IV vs existing Baras III
  assert.equal(parsed.summary.unresolved, 1); // Atlantis

  const concepcionRow = parsed.rows.find((r) => r.specificLocation === 'Brgy. Concepcion');
  assert.ok(concepcionRow);
  assert.equal(concepcionRow.municipality, 'Gigmoto');
  assert.equal(concepcionRow.province, 'Catanduanes');
  assert.equal(concepcionRow.validationStatus, 'matched');

  const barasRow = parsed.rows.find((r) => r.municipality === 'Baras');
  assert.ok(barasRow);
  assert.equal(barasRow.validationStatus, 'conflict');
  assert.deepEqual(barasRow.conflictWithPeis, ['III']);
});

test('formatGroupedBulletinIntensityBlock sorts highest-to-lowest, groups cleanly, deduplicates within PEIS, and excludes drafts/conflicts', () => {
  const entries: IntensityEntry[] = [
    {
      id: '1',
      peis: 'IV',
      locality: 'Bato, Catanduanes',
      province: 'Catanduanes',
      municipality: 'Bato',
      reviewStatus: 'verified',
    },
    {
      id: '2',
      peis: 'V',
      locality: 'Virac, Catanduanes',
      province: 'Catanduanes',
      municipality: 'Virac',
      reviewStatus: 'verified',
    },
    {
      id: '3',
      peis: 'IV',
      locality: 'San Miguel, Catanduanes',
      province: 'Catanduanes',
      municipality: 'San Miguel',
      reviewStatus: 'verified',
    },
    {
      id: '4',
      peis: 'IV',
      locality: 'Bato, Catanduanes',
      province: 'Catanduanes',
      municipality: 'Bato',
      reviewStatus: 'verified',
    },
    {
      id: '5',
      peis: 'VI',
      locality: 'Baras, Catanduanes',
      province: 'Catanduanes',
      municipality: 'Baras',
      reviewStatus: 'draft', // must be excluded
    },
    {
      id: '6',
      peis: 'III',
      locality: 'Pandan, Catanduanes',
      province: 'Catanduanes',
      municipality: 'Pandan',
      reviewStatus: 'verified',
      reportSource: 'Official Report',
    },
    {
      id: '7',
      peis: 'IV',
      locality: 'Pandan, Catanduanes',
      province: 'Catanduanes',
      municipality: 'Pandan',
      reviewStatus: 'verified',
      reportSource: 'Field Observation', // conflicting PEIS on Pandan -> both 6 & 7 excluded
    },
    {
      id: '8',
      peis: 'II',
      locality: 'Legazpi City, Albay',
      category: 'instrumental',
      reviewStatus: 'verified',
    },
  ];

  const analysis = analyzeIntensityEntries(entries);
  assert.equal(analysis.counts.conflictGroups, 1);
  assert.ok(analysis.conflictByEntryId.has('6'));
  assert.ok(analysis.conflictByEntryId.has('7'));

  const bulletin = formatGroupedBulletinIntensityBlock(entries);
  assert.equal(bulletin.eligibleFeltCount, 4);
  assert.equal(bulletin.excludedFeltCount, 3); // draft #5 + conflicting #6 & #7
  assert.equal(
    bulletin.text,
    [
      'Intensity V - Virac, Catanduanes',
      'Intensity IV - Bato, Catanduanes;',
      '               San Miguel, Catanduanes',
      '',
      'Instrumental Intensity:',
      'Intensity II - Legazpi City, Albay',
    ].join('\n')
  );
});

test('hasEventFeltDesignation and .eqp round-trip preserve legacy compatibility and feltStatusOverride', () => {
  const baseEvent = INITIAL_EVENTS[0];
  assert.equal(hasEventFeltDesignation(baseEvent), true);

  // Authoritative feltStatusOverride survives empty text/entries
  const emptyWithAuthoritativeFelt = {
    ...baseEvent,
    intensities: [],
    feltStatusOverride: true,
  };
  assert.equal(hasEventFeltDesignation(emptyWithAuthoritativeFelt), true);
  assert.equal(getEventFeltStatusSummary(emptyWithAuthoritativeFelt).code, 'felt');
  const saveTarget = buildBulletinSaveTarget(emptyWithAuthoritativeFelt, 'Y:');
  assert.match(saveTarget.filename, /_B1F\.html$/);

  // Draft-only event does not prematurely receive F flag until verified or overridden
  const draftOnlyEvent = {
    ...baseEvent,
    feltStatusOverride: undefined,
    intensities: [
      {
        id: 'd1',
        peis: 'III' as const,
        locality: 'Virac, Catanduanes',
        reviewStatus: 'draft' as const,
      },
    ],
  };
  assert.equal(hasEventFeltDesignation(draftOnlyEvent), false);
  assert.equal(getEventFeltStatusSummary(draftOnlyEvent).code, 'pending');

  // Legacy .eqp round-trip parses intensities as verified by default
  const eqpText = formatEqpFileContent({
    event: baseEvent,
    filePath: baseEvent.filePath,
  });
  const reparsed = parseEqpFileContent({
    content: eqpText,
    filename: baseEvent.filename,
    displayPath: baseEvent.filePath,
  });
  assert.equal(reparsed.intensities.length, baseEvent.intensities.length);
  assert.equal(hasEventFeltDesignation(reparsed), true);
});

test('validateCandidateIntensityInput checks current geographic reference dataset and detects duplicate/conflicting reports', () => {
  const baseCatalog = loadLocalPlacesCatalog();
  const customCatalog: NearestPlacesCatalog = {
    ...baseCatalog,
    towns: [
      ...baseCatalog.towns,
      {
        name: 'New Seismic Station Town',
        province: 'Catanduanes',
        lat: 13.7,
        lon: 124.3,
      },
    ],
  };
  const index = buildPhilippineLocalityIndex(customCatalog);

  const existing: IntensityEntry[] = [
    {
      id: 'rep-1',
      peis: 'IV',
      locality: 'Virac, Catanduanes',
      province: 'Catanduanes',
      municipality: 'Virac',
      reviewStatus: 'verified',
      reportSource: 'LGU / MDRRMO',
    },
    {
      id: 'rep-2',
      peis: 'IV',
      locality: 'Virac, Catanduanes',
      province: 'Catanduanes',
      municipality: 'Virac',
      reviewStatus: 'draft',
      reportSource: 'Field Observation',
    },
    {
      id: 'rep-3',
      peis: 'III',
      locality: 'Bato, Catanduanes',
      province: 'Catanduanes',
      municipality: 'Bato',
      reviewStatus: 'verified',
    },
  ];

  // 1. Verified against updated current catalog & clean new locality
  const customMatch = validateCandidateIntensityInput({
    peis: 'III',
    category: 'felt',
    province: 'Catanduanes',
    localityText: 'New Seismic Station Town',
    catalogLoaded: true,
    localityIndex: index,
    existingEntries: existing,
  });
  assert.equal(customMatch.geographicStatus, 'matched');
  assert.equal(customMatch.duplicateKind, 'none');
  assert.equal(customMatch.canSubmit, true);

  // 2. Unrecognized locality triggers geographic reference alert
  const notFound = validateCandidateIntensityInput({
    peis: 'II',
    category: 'felt',
    province: 'Catanduanes',
    localityText: 'Nonexistent Barangay',
    catalogLoaded: true,
    localityIndex: index,
    existingEntries: existing,
  });
  assert.equal(notFound.geographicStatus, 'not-found');
  assert.match(notFound.geographicMessage, /not found in the current geographic reference dataset/);
  assert.equal(notFound.canSubmit, true);

  // 3. Ambiguous bare locality returns disambiguation province candidates
  const ambiguous = validateCandidateIntensityInput({
    peis: 'IV',
    category: 'felt',
    province: '',
    localityText: 'San Miguel',
    catalogLoaded: true,
    localityIndex: index,
    existingEntries: existing,
  });
  assert.equal(ambiguous.geographicStatus, 'ambiguous');
  assert.ok(ambiguous.candidates.length >= 2);
  assert.ok(ambiguous.candidates.some((c) => c.province === 'Catanduanes'));

  // 4. Exact duplicate report blocks submission & alerts user
  const exactDup = validateCandidateIntensityInput({
    peis: 'IV',
    category: 'felt',
    province: 'Catanduanes',
    localityText: 'Virac',
    catalogLoaded: true,
    localityIndex: index,
    existingEntries: existing,
  });
  assert.equal(exactDup.geographicStatus, 'matched');
  assert.equal(exactDup.duplicateKind, 'exact-duplicate');
  assert.equal(exactDup.hasExactDuplicate, true);
  assert.equal(exactDup.canSubmit, false);
  assert.match(exactDup.duplicateMessage, /Duplicate intensity report detected/);

  // 5. Same locality + different PEIS flags conflict warning
  const conflictLoc = validateCandidateIntensityInput({
    peis: 'V',
    category: 'felt',
    province: 'Catanduanes',
    localityText: 'Bato',
    catalogLoaded: true,
    localityIndex: index,
    existingEntries: existing,
  });
  assert.equal(conflictLoc.duplicateKind, 'same-locality-conflict');
  assert.equal(conflictLoc.hasConflictingPeis, true);
  assert.equal(conflictLoc.canSubmit, true);
  assert.match(conflictLoc.duplicateMessage, /Intensity III/);

  // 6. Same locality + same PEIS with distinct specificLocation still alerts operator
  const subLoc = validateCandidateIntensityInput({
    peis: 'IV',
    category: 'felt',
    province: 'Catanduanes',
    localityText: 'Virac',
    specificLocation: 'Brgy. Palnab',
    catalogLoaded: true,
    localityIndex: index,
    existingEntries: existing,
  });
  assert.equal(subLoc.duplicateKind, 'same-locality-same-peis');
  assert.equal(subLoc.hasExactDuplicate, false);
  assert.equal(subLoc.hasSameLocalityDuplicate, true);

  // 7. Edit mode excludes self entry ID while still detecting duplicate against other rows
  const editSelfClean = validateCandidateIntensityInput({
    peis: 'III',
    category: 'felt',
    province: 'Catanduanes',
    localityText: 'Bato',
    catalogLoaded: true,
    localityIndex: index,
    existingEntries: existing,
    excludeEntryId: 'rep-3',
  });
  assert.equal(editSelfClean.duplicateKind, 'none');
  assert.equal(editSelfClean.canSubmit, true);

  const editCollidesWithSibling = validateCandidateIntensityInput({
    peis: 'IV',
    category: 'felt',
    province: 'Catanduanes',
    localityText: 'Virac',
    catalogLoaded: true,
    localityIndex: index,
    existingEntries: existing,
    excludeEntryId: 'rep-2',
  });
  assert.equal(editCollidesWithSibling.hasExactDuplicate, true);
  assert.equal(editCollidesWithSibling.canSubmit, false);

  // 8. analyzeIntensityEntries exposes duplicateGroups for existing duplicate rows
  const tableAnalysis = analyzeIntensityEntries(existing);
  assert.equal(tableAnalysis.counts.duplicateEntries, 1);
  assert.equal(tableAnalysis.duplicateGroups.length, 1);
  assert.equal(tableAnalysis.duplicateGroups[0].count, 2);
});

test('selectWinningConflictObservation and mergeConflictingObservations resolve conflicts cleanly and restore bulletin eligibility', () => {
  const conflictingEntries: IntensityEntry[] = [
    {
      id: 'c-1',
      peis: 'V',
      locality: 'Virac, Catanduanes',
      province: 'Catanduanes',
      municipality: 'Virac',
      specificLocation: 'Brgy. Conception',
      reportSource: 'Official Report',
      reviewStatus: 'conflicting',
      remarks: 'Conflicting intensity recorded (existing: IV)',
    },
    {
      id: 'c-2',
      peis: 'IV',
      locality: 'Virac, Catanduanes',
      province: 'Catanduanes',
      municipality: 'Virac',
      specificLocation: 'Brgy. Francia',
      reportSource: 'Field Observation',
      reviewStatus: 'verified',
    },
    {
      id: 'unrelated',
      peis: 'III',
      locality: 'Bato, Catanduanes',
      province: 'Catanduanes',
      municipality: 'Bato',
      reviewStatus: 'verified',
    },
  ];

  // Before resolution: Virac is conflicted and excluded from bulletin text
  const beforeAnalysis = analyzeIntensityEntries(conflictingEntries);
  assert.equal(beforeAnalysis.counts.conflictGroups, 1);
  const beforeBulletin = formatGroupedBulletinIntensityBlock(conflictingEntries);
  assert.doesNotMatch(beforeBulletin.text, /Virac/);

  // 1. Selecting a winning observation drops siblings, strips auto conflict remark, and restores bulletin output
  const winnerResolved = selectWinningConflictObservation(
    conflictingEntries,
    ['c-1', 'c-2'],
    'c-1',
    { reviewStatus: 'verified' }
  );
  assert.equal(winnerResolved.length, 2);
  const winner = winnerResolved.find((e) => e.id === 'c-1');
  assert.ok(winner);
  assert.equal(winner.peis, 'V');
  assert.equal(winner.reviewStatus, 'verified');
  assert.equal(winner.remarks, undefined);
  assert.ok(winner.updatedAt);

  const afterWinnerAnalysis = analyzeIntensityEntries(winnerResolved);
  assert.equal(afterWinnerAnalysis.counts.conflictGroups, 0);
  const afterWinnerBulletin = formatGroupedBulletinIntensityBlock(winnerResolved);
  assert.match(afterWinnerBulletin.text, /Intensity V - Brgy\. Conception, Virac, Catanduanes|Intensity V - Virac, Catanduanes/);

  // 2. Merging conflicting observations combines specific locations, sources, chosen PEIS, and records previousPeis
  const mergedResolved = mergeConflictingObservations(
    conflictingEntries,
    ['c-1', 'c-2'],
    {
      baseEntryId: 'c-2',
      peis: 'V',
      specificLocation: 'Brgy. Conception; Brgy. Francia',
      reportSource: 'Official Report; Field Observation',
      remarks: 'Merged field and LGU reports',
      reviewStatus: 'verified',
    }
  );
  assert.equal(mergedResolved.length, 2);
  const merged = mergedResolved.find((e) => e.id === 'c-2');
  assert.ok(merged);
  assert.equal(merged.peis, 'V');
  assert.equal(merged.previousPeis, 'IV');
  assert.equal(merged.specificLocation, 'Brgy. Conception; Brgy. Francia');
  assert.equal(merged.reportSource, 'Official Report; Field Observation');
  assert.equal(merged.locality, 'Brgy. Conception; Brgy. Francia, Virac, Catanduanes');
  assert.equal(merged.reviewStatus, 'verified');
  assert.equal(merged.remarks, 'Merged field and LGU reports');

  const afterMergeAnalysis = analyzeIntensityEntries(mergedResolved);
  assert.equal(afterMergeAnalysis.counts.conflictGroups, 0);
  const afterMergeBulletin = formatGroupedBulletinIntensityBlock(mergedResolved);
  assert.match(afterMergeBulletin.text, /Intensity V - Brgy\. Conception; Brgy\. Francia, Virac, Catanduanes/);
});


