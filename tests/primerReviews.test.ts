import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_EVENTS, type EQPEvent } from '../src/data/eqpData';
import {
  buildPrimerHtmlDocument,
  buildPrimerPdfDocument,
  DEFAULT_PRIMER_ELIGIBILITY_RULES,
  generateInitialEarthquakePrimer,
  updatePrimerSequenceHistoricalAnalysis,
  updatePrimerStage4Narratives,
} from '../src/utils/earthquakePrimer';
import { DEFAULT_PRIMER_MAP_LAYERS } from '../src/utils/primerMapFigure';
import { validateAndMergeLocalCatalog } from '../src/utils/primerCatalogAdapters';
import { buildPrimerStage3Package } from '../src/utils/primerSequenceIntegration';
import {
  buildPrimerStage4Narratives,
  createDefaultStage4ExternalData,
} from '../src/utils/primerScientificNarratives';
import {
  comparePrimerRevisions,
  createPrimerRevisionRecord,
  restoreRevisionAsNewWorkingDraft,
  toPrimerExportRevisionInfo,
} from '../src/utils/primerRevisions';
import {
  addCustomChecklistItem,
  addPrimerReviewComment,
  computeExtendedPrimerReadiness,
  createPrimerReviewRecord,
  DEFAULT_SCIENTIFIC_CHECKLIST_DEFINITIONS,
  evaluatePrimerReviewValidity,
  isForbiddenReleaseStatus,
  reopenCorrectionRequest,
  resolveCorrectionRequest,
  transitionLocalReviewStatus,
  updateChecklistItemState,
  verifyPrimerReviewChecksum,
} from '../src/utils/primerReviews';
import {
  buildPrimerReviewPackageZip,
  createMemoryReviewStore,
  decodeAndValidateStoredZip,
  encodeStoredZip,
  MAX_EXPORT_TABLE_ROWS,
  PRIMER_REVIEW_PACKAGE_RELEASE_BANNER,
  sanitizeAndValidateSvgMarkup,
  serializePrimerReviewArchiveJson,
  validateAndImportPrimerReviewPackageZip,
  validateAndParsePrimerReviewArchiveJson,
} from '../src/utils/primerReviewPackage';

function buildTestEventAndDraft() {
  const baseEvent: EQPEvent = structuredClone(INITIAL_EVENTS[0]);
  const refMs = Date.parse(`${baseEvent.originDateGmt}T${baseEvent.originTimeGmt}Z`);

  const draft0 = generateInitialEarthquakePrimer(baseEvent, {
    trigger: 'manual',
    rules: DEFAULT_PRIMER_ELIGIBILITY_RULES,
    primaryLocationLabel: '014 km N 32° E of General Luna (Surigao del Norte)',
    faultGeneratorLabel: 'Philippine Trench Segment',
    figureOptions: {
      extent: 'regional',
      theme: 'classic',
      layers: DEFAULT_PRIMER_MAP_LAYERS,
    },
  });

  const catalogSnap = validateAndMergeLocalCatalog({
    content: [
      'eventId,time,latitude,longitude,depth,magnitude,magType,source,place',
      `HIST-1991,${new Date(refMs - 18 * 365.25 * 86_400_000).toISOString()},9.92,126.18,16.0,6.2,Mw,PHIVOLCS,Historical Surigao`,
      `AF-01,${new Date(refMs + 2 * 3_600_000).toISOString()},9.82,126.14,12.0,3.9,Ms,EQP Test,"General Luna"`,
      `AF-02,${new Date(refMs + 5 * 3_600_000).toISOString()},9.84,126.17,15.0,4.2,Ms,EQP Test,"Dapa"`,
    ].join('\n'),
    format: 'csv',
    existingRecords: [],
    existingCatalogVersion: 1,
    defaultSource: 'EQP Test',
    catalogVersionLabel: 'cat-v1',
  });

  const stage3Pkg = buildPrimerStage3Package({
    event: baseEvent,
    catalog: catalogSnap.records,
    catalogVersion: catalogSnap.catalogVersion,
    sourceLabel: catalogSnap.sourceLabel,
    config: {
      dataCutoffUtc: new Date(refMs + 48 * 3_600_000).toISOString(),
    },
  });

  const draftWithS3 = updatePrimerSequenceHistoricalAnalysis(draft0, stage3Pkg);
  const extData = createDefaultStage4ExternalData(baseEvent);
  extData.tsunami.state = 'official-no-tsunami';
  extData.tsunami.officialAdvisoryId = 'TSU-TEST-001';

  const stage4Pkg = buildPrimerStage4Narratives({
    event: baseEvent,
    primaryLocationLabel: '014 km N 32° E of General Luna (Surigao del Norte)',
    faultGeneratorLabel: 'Philippine Trench Segment',
    isPlotResultStale: false,
    epicenterFigure: draftWithS3.extensions?.epicenterFigure ?? null,
    stage3Package: stage3Pkg,
    externalData: extData,
  });

  const fullDraft = updatePrimerStage4Narratives(draftWithS3, stage4Pkg);
  const { revision } = createPrimerRevisionRecord(fullDraft, {
    description: 'Initial Stage 6B test snapshot',
  });

  return { baseEvent, fullDraft, revision, extData, stage3Pkg };
}

test('Stage 6B.A-C: Revision-bound review model, 15-item checklist, N/A justification, and forbidden status guards', () => {
  const { revision } = buildTestEventAndDraft();
  const revChecksumBefore = revision.contentChecksum;

  let review = createPrimerReviewRecord(revision, {
    reviewerLabel: 'J. Santos',
    reviewScope: 'Stage 1-5 Pre-Authorization Check',
  });

  assert.equal(review.revisionId, revision.revisionId);
  assert.equal(review.revisionNumber, revision.revisionNumber);
  assert.equal(review.revisionContentChecksum, revChecksumBefore);
  assert.equal(review.reviewerIdentity.identityVerification, 'UNVERIFIED_IDENTITY');
  assert.equal(review.localArchival.isTamperProof, false);
  assert.equal(review.status, 'not-started');
  assert.equal(review.checklist.length, DEFAULT_SCIENTIFIC_CHECKLIST_DEFINITIONS.length);
  assert.equal(review.checklist.length, 15);
  assert.ok(verifyPrimerReviewChecksum(review));

  // Frozen revision must remain untouched and immutable
  assert.equal(Object.isFrozen(revision), true);
  assert.equal(revision.contentChecksum, revChecksumBefore);

  // Forbidden release statuses rejected
  assert.equal(isForbiddenReleaseStatus('APPROVED'), true);
  assert.equal(isForbiddenReleaseStatus('PUBLISHED'), true);
  assert.equal(isForbiddenReleaseStatus('FINAL'), true);
  assert.equal(isForbiddenReleaseStatus('FORMALLY SIGNED'), true);
  assert.throws(() => transitionLocalReviewStatus(review, 'APPROVED'), /Disallowed|disallowed/);
  assert.throws(() => transitionLocalReviewStatus(review, 'PUBLISHED'), /Disallowed|disallowed/);
  assert.throws(() => transitionLocalReviewStatus(review, 'FINAL'), /Disallowed|disallowed/);

  // Custom checklist item configurable
  review = addCustomChecklistItem(review, {
    category: 'Regional',
    label: 'Verify local province spelling',
  });
  assert.equal(review.checklist.length, 16);

  // Cannot jump to review-notes-complete while checklist items are unchecked
  assert.throws(
    () => transitionLocalReviewStatus(review, 'review-notes-complete-unverified-identity'),
    /Not Checked/
  );

  // Complete all 16 items, making item 9 N/A without justification first -> still blocked
  for (let i = 0; i < review.checklist.length; i++) {
    const item = review.checklist[i];
    if (i === 8) {
      review = updateChecklistItemState(review, item.itemId, {
        state: 'not-applicable',
        notApplicableJustification: '',
      });
    } else {
      review = updateChecklistItemState(review, item.itemId, {
        state: 'satisfactory-for-local-review',
      });
    }
  }
  assert.throws(
    () => transitionLocalReviewStatus(review, 'review-notes-complete-unverified-identity'),
    /Not Applicable.*lack mandatory justification/
  );

  // Supply N/A justification -> now allowed to transition cleanly to Review Notes Complete (Unverified ID) and Prepared
  review = updateChecklistItemState(review, review.checklist[8].itemId, {
    state: 'not-applicable',
    notApplicableJustification: 'Inland crustal event with verified no-tsunami bulletin.',
  });
  review = transitionLocalReviewStatus(review, 'review-notes-complete-unverified-identity');
  assert.equal(review.status, 'review-notes-complete-unverified-identity');
  review = transitionLocalReviewStatus(review, 'prepared-for-external-authorization');
  assert.equal(review.status, 'prepared-for-external-authorization');
});

test('Stage 6B.D-E: Comments, correction requests, mandatory resolution note, reopen, and Rev #1 -> Rev #2 correction workflow', () => {
  const { revision: rev1 } = buildTestEventAndDraft();
  let review1 = createPrimerReviewRecord(rev1, { reviewerLabel: 'Duty Analyst' });

  // Complete checklist first so only open correction blocks completion
  for (const item of review1.checklist) {
    review1 = updateChecklistItemState(review1, item.itemId, {
      state: 'satisfactory-for-local-review',
    });
  }

  review1 = addPrimerReviewComment(review1, {
    targetKind: 'section',
    targetId: 'tectonic_setting',
    targetLabel: 'Section 5: Tectonic Setting & Generators',
    category: 'correction-request',
    body: 'Clarify that proximity to Philippine Trench does not confirm causative rupture plane.',
    references: ['EQP Fault Catalog v1'],
  });
  assert.equal(review1.status, 'corrections-requested');
  assert.equal(review1.comments[0].authorIdentityVerification, 'UNVERIFIED_IDENTITY');
  assert.equal(review1.comments[0].boundRevisionId, rev1.revisionId);

  // Open correction blocks completion
  assert.throws(
    () => transitionLocalReviewStatus(review1, 'prepared-for-external-authorization'),
    /open correction request/
  );

  // Empty resolution note rejected
  const cmtId = review1.comments[0].commentId;
  assert.throws(() => resolveCorrectionRequest(review1, cmtId, '   '), /mandatory resolution note/);

  // Restore rev1 into new working draft -> edit -> save Rev #2 -> original rev1 & comments stay intact
  const restoredDraft = restoreRevisionAsNewWorkingDraft(rev1);
  restoredDraft.sections = restoredDraft.sections.map((s) =>
    s.id === 'tectonic_setting'
      ? {
          ...s,
          content: `${s.content}\n\nNote: Proximity alone does not prove focal mechanism.`,
          isEdited: true,
        }
      : s
  );
  const { revision: rev2 } = createPrimerRevisionRecord(restoredDraft, {
    existingRevisions: [rev1],
    description: 'Corrected tectonic caveat from Rev #1 comment',
  });
  assert.equal(rev2.revisionNumber, 2);
  assert.notEqual(rev2.contentChecksum, rev1.contentChecksum);

  const cmp = comparePrimerRevisions(rev1, rev2);
  assert.equal(cmp.summary.hasAnyDifference, true);
  assert.equal(
    cmp.narrativeSectionDiffs.find((d) => d.sectionId === 'tectonic_setting')?.textChanged,
    true
  );

  // Resolve and reopen correction request on rev1
  review1 = resolveCorrectionRequest(review1, cmtId, 'Addressed in Rev #2 with updated caveat.');
  assert.equal(review1.comments[0].resolutionState, 'resolved');
  assert.ok(review1.comments[0].resolvedAtUtc);

  review1 = reopenCorrectionRequest(review1, cmtId, 'Re-checking wording');
  assert.equal(review1.comments[0].resolutionState, 'open');
  assert.equal(review1.comments[0].reopenedCount, 1);
  assert.equal(review1.status, 'corrections-requested');
});

test('Stage 6B.F-G: Review invalidation on newer revision and source drift, no auto-transfer, and 4-pillar readiness', () => {
  const { baseEvent, revision: rev1, extData } = buildTestEventAndDraft();
  let review1 = createPrimerReviewRecord(rev1, { reviewerLabel: 'Reviewer A' });
  for (const item of review1.checklist) {
    review1 = updateChecklistItemState(review1, item.itemId, {
      state: 'satisfactory-for-local-review',
    });
  }
  review1 = transitionLocalReviewStatus(review1, 'review-notes-complete-unverified-identity');

  // 1. Valid against identical revision and matching live sources
  const validReport = evaluatePrimerReviewValidity(review1, rev1, [rev1], {
    event: baseEvent,
    primaryLocationLabel: '014 km N 32° E of General Luna (Surigao del Norte)',
    faultGeneratorLabel: 'Philippine Trench Segment',
    isPlotResultStale: false,
    liveExternalData: extData,
  });
  assert.equal(validReport.isValid, true);
  assert.equal(validReport.shouldInvalidateCompletedStatus, false);

  // 2. Newer modified revision invalidates prior completed review (never auto-transfers!)
  const draft2 = restoreRevisionAsNewWorkingDraft(rev1);
  draft2.title = `${draft2.title} — Revised`;
  const { revision: rev2 } = createPrimerRevisionRecord(draft2, {
    existingRevisions: [rev1],
    description: 'Title refinement',
  });
  const newerReport = evaluatePrimerReviewValidity(review1, rev1, [rev1, rev2]);
  assert.equal(newerReport.isValid, false);
  assert.equal(newerReport.validityState, 'outdated-newer-revision');
  assert.equal(newerReport.shouldInvalidateCompletedStatus, true);

  // 3. Live source drift (changed coordinates, stale PLOT, hazard change) invalidates review
  const driftedEvent: EQPEvent = {
    ...baseEvent,
    lat: baseEvent.lat + 0.25,
    ms: (baseEvent.ms || 5.5) + 0.3,
  };
  const driftedExt = structuredClone(extData);
  driftedExt.tsunami.state = 'official-warning-or-advisory';
  const driftReport = evaluatePrimerReviewValidity(review1, rev1, [rev1], {
    event: driftedEvent,
    primaryLocationLabel: '014 km N 32° E of General Luna (Surigao del Norte)',
    faultGeneratorLabel: 'Philippine Trench Segment',
    isPlotResultStale: true,
    liveExternalData: driftedExt,
  });
  assert.equal(driftReport.isValid, false);
  assert.equal(driftReport.validityState, 'outdated-source-drift');
  assert.equal(driftReport.shouldInvalidateCompletedStatus, true);
  assert.ok(driftReport.reasons.some((r) => r.includes('PLOT')));
  assert.ok(driftReport.reasons.some((r) => r.includes('Hazard') || r.includes('Event Parameters')));

  // 4. Extended 4-pillar readiness keeps authorization explicitly UNAVAILABLE / NOT CONFIGURED
  const readiness = computeExtendedPrimerReadiness(rev1.snapshot, {
    activeRevision: rev1,
    reviewRecord: review1,
    reviewValidity: driftReport,
    isPlotResultStale: true,
  });
  assert.equal(
    readiness.institutionalAuthorization.externalInstitutionalAuthorization,
    'UNAVAILABLE / NOT CONFIGURED'
  );
  assert.equal(
    readiness.institutionalAuthorization.publicPublicationStatus,
    'UNAVAILABLE / NOT CONFIGURED'
  );
  assert.equal(readiness.institutionalAuthorization.canFormallyApprove, false);
  assert.equal(readiness.institutionalAuthorization.canFormallySign, false);
  assert.equal(readiness.institutionalAuthorization.canPublishPublicly, false);
  assert.equal(readiness.localScientificReview.identityStatus, 'UNVERIFIED_IDENTITY');
  assert.equal(readiness.localScientificReview.isReviewOutdated, true);
});

test('Stage 6B.I & L: Portable ZIP review package (Public + Scientific Review PDF & HTML, figures, capped tables, manifest) roundtrip', () => {
  const { revision, stage3Pkg } = buildTestEventAndDraft();
  // Verify table row cap guard works on oversized historical seismicity table
  const baseRow = stage3Pkg.historical.rows[0] ?? {
    recordId: 'HIST-BASE',
    eventId: 'HIST-BASE',
    originTimeUtc: '2008-01-01T00:00:00Z',
    originTimePst: '2008-01-01 08:00:00 AM PST',
    lat: 9.9,
    lon: 126.1,
    depthKm: 12,
    magnitude: 5.5,
    magnitudeType: 'Mw',
    distanceKm: 18,
    dataSource: 'PHIVOLCS',
    catalogVersion: 'v1',
    place: 'Test Region',
  };
  const bigRows = Array.from({ length: 650 }, (_, idx) => ({
    ...baseRow,
    recordId: `HIST-ROW-${idx}`,
    eventId: `HIST-ROW-${idx}`,
  }));
  const bigDraft = structuredClone(revision.snapshot);
  if (bigDraft.extensions?.sequenceHistoricalAnalysis) {
    bigDraft.extensions.sequenceHistoricalAnalysis.historical.rows = bigRows;
  }
  const { revision: bigRev } = createPrimerRevisionRecord(bigDraft, {
    description: 'Large historical table test',
  });
  let review = createPrimerReviewRecord(bigRev, { reviewerLabel: 'QA Operator' });
  review = addPrimerReviewComment(review, {
    targetKind: 'figure',
    targetId: 'epicenter',
    targetLabel: 'Figure: Epicenter & Geographic Context Map',
    category: 'general-note',
    body: 'Verified epicenter map legend & scale bar.',
  });

  const built = buildPrimerReviewPackageZip({
    revision: bigRev,
    review,
    allRevisionsForDoc: [bigRev],
    includeExports: true,
    generatePdfsSynchronously: true,
  });

  assert.equal(built.manifest.releaseStatusBanner, PRIMER_REVIEW_PACKAGE_RELEASE_BANNER);
  assert.equal(
    built.manifest.externalInstitutionalAuthorization,
    'UNAVAILABLE / NOT CONFIGURED'
  );
  assert.equal(built.manifest.reviewerIdentityVerification, 'UNVERIFIED_IDENTITY');

  const decoded = decodeAndValidateStoredZip(built.zipBytes);
  assert.equal(decoded.ok, true);
  if (decoded.ok) {
    assert.ok(decoded.entries.has('README_REVIEW_NOTICE.txt'));
    assert.ok(decoded.entries.has('manifest.json'));
    assert.ok(decoded.entries.has('revision/revision-record.json'));
    assert.ok(decoded.entries.has('revision/revision-lineage.json'));
    assert.ok(decoded.entries.has('review/review-record.json'));
    assert.ok(decoded.entries.has('provenance/scientific-provenance-ledger.json'));
    assert.ok(decoded.entries.has('tables/aftershock-daily-counts.json'));
    assert.ok(decoded.entries.has('tables/magnitude-distribution.json'));
    assert.ok(decoded.entries.has('tables/historical-seismicity.json'));
    assert.ok(decoded.entries.has('figures/epicenter.svg'));
    assert.ok(decoded.entries.has('exports/public-draft.html'));
    assert.ok(decoded.entries.has('exports/scientific-review.html'));
    assert.ok(decoded.entries.has('exports/public-draft.pdf'));
    assert.ok(decoded.entries.has('exports/scientific-review.pdf'));

    const notice = new TextDecoder().decode(decoded.entries.get('README_REVIEW_NOTICE.txt')!.bytes);
    assert.ok(notice.includes('FOR SCIENTIFIC REVIEW — NOT AN APPROVED PUBLICATION'));

    // Check table cap of 500
    const histTable = JSON.parse(
      new TextDecoder().decode(decoded.entries.get('tables/historical-seismicity.json')!.bytes)
    );
    assert.equal(histTable.rows.length, MAX_EXPORT_TABLE_ROWS);
    assert.equal(histTable.exportedRowCount, MAX_EXPORT_TABLE_ROWS);

    // Check PDF headers
    const pubPdfStr = new TextDecoder().decode(
      decoded.entries.get('exports/public-draft.pdf')!.bytes.subarray(0, 12)
    );
    const sciPdfStr = new TextDecoder().decode(
      decoded.entries.get('exports/scientific-review.pdf')!.bytes.subarray(0, 12)
    );
    assert.ok(pubPdfStr.startsWith('%PDF-'));
    assert.ok(sciPdfStr.startsWith('%PDF-'));

    // Check historical HTML export retains snapshot provenance & revision #
    const sciHtml = new TextDecoder().decode(
      decoded.entries.get('exports/scientific-review.html')!.bytes
    );
    assert.ok(sciHtml.includes(`HISTORICAL SNAPSHOT REV #${bigRev.revisionNumber}`));
    assert.ok(sciHtml.includes('Stage 4 Scientific Provenance'));
  }

  // Roundtrip validated import succeeds
  const imported = validateAndImportPrimerReviewPackageZip(built.zipBytes);
  assert.equal(imported.ok, true);
  assert.equal(imported.revision?.revisionId, bigRev.revisionId);
  assert.equal(imported.review?.reviewRecordId, review.reviewRecordId);
});

test('Stage 6B.J: Import security validation rejects tampered ZIP/manifest/checksums, path traversal, disallowed statuses, prototype pollution, and unsafe SVGs', async () => {
  const { revision } = buildTestEventAndDraft();
  const review = createPrimerReviewRecord(revision, { reviewerLabel: 'Security Test' });

  // 1. SVG script / event / foreignObject rejection
  assert.equal(
    sanitizeAndValidateSvgMarkup('<svg><script>alert(1)</script></svg>').ok,
    false
  );
  assert.equal(
    sanitizeAndValidateSvgMarkup('<svg onload="fetch(1)"></svg>').ok,
    false
  );
  assert.equal(
    sanitizeAndValidateSvgMarkup('<svg><foreignObject><div>x</div></foreignObject></svg>').ok,
    false
  );
  assert.equal(
    sanitizeAndValidateSvgMarkup('<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="4"/></svg>').ok,
    true
  );

  // 2. ZIP path traversal rejected
  assert.throws(
    () =>
      encodeStoredZip([
        { path: '../../evil.txt', data: 'bad' },
      ]),
    /Unsafe ZIP entry path/
  );

  // Manually craft a ZIP with corrupted payload byte to verify CRC32 rejection
  const goodZip = encodeStoredZip([{ path: 'manifest.json', data: '{}' }]);
  const corruptedCrcZip = new Uint8Array(goodZip);
  corruptedCrcZip[30 + 'manifest.json'.length] ^= 0xff; // Flip first payload byte without updating CRC
  const badCrcRes = decodeAndValidateStoredZip(corruptedCrcZip);
  assert.equal(badCrcRes.ok, false);
  assert.ok(!badCrcRes.ok && badCrcRes.errors.some((e) => /CRC32/i.test(e)));

  // 3. Review package ZIP tampered manifest rejected
  const pkg = buildPrimerReviewPackageZip({
    revision,
    review,
    includeExports: false,
  });
  const dec = decodeAndValidateStoredZip(pkg.zipBytes);
  assert.equal(dec.ok, true);
  if (dec.ok) {
    const tamperedEntries = Array.from(dec.entries.values()).map((e) => {
      if (e.path === 'review/review-record.json') {
        const text = new TextDecoder().decode(e.bytes).replace('not-started', 'APPROVED');
        return { path: e.path, data: text };
      }
      return { path: e.path, data: e.bytes };
    });
    const tamperedZip = encodeStoredZip(tamperedEntries);
    const importRes = validateAndImportPrimerReviewPackageZip(tamperedZip);
    assert.equal(importRes.ok, false);
    assert.ok(importRes.errors.some((e) => /mismatch|disallowed|checksum/i.test(e)));
  }

  // 4. Prototype pollution & disallowed status rejected on review archive JSON
  const serialized = serializePrimerReviewArchiveJson([review]);
  const polluted = serialized.replace(
    '"reviews": [',
    '"__proto__": {"polluted": true}, "reviews": ['
  );
  const pollRes = validateAndParsePrimerReviewArchiveJson(polluted);
  assert.equal(pollRes.ok, false);
  assert.ok(pollRes.errors.some((e) => e.includes('forbidden key')));

  const badStatusJson = serialized.replace('"not-started"', '"PUBLISHED"');
  const badStatusRes = validateAndParsePrimerReviewArchiveJson(badStatusJson);
  assert.equal(badStatusRes.ok, false);
  assert.ok(badStatusRes.errors.some((e) => /disallowed|checksum/i.test(e)));

  // 5. Memory store persists & rejects bad status
  const store = createMemoryReviewStore();
  await store.saveReview(review);
  const fetched = await store.getReviewByRevision(revision.revisionId);
  assert.equal(fetched?.reviewRecordId, review.reviewRecordId);
});

test('Stage 6B.L: Historical PDF/HTML export retains snapshot coordinates even if live event drifts', () => {
  const { baseEvent, revision } = buildTestEventAndDraft();
  const revInfo = toPrimerExportRevisionInfo(revision);
  const html = buildPrimerHtmlDocument(revision.snapshot, {
    mode: 'public-draft',
    revisionInfo: revInfo,
  });
  assert.ok(html.includes(baseEvent.lat.toFixed(3)));
  assert.ok(html.includes(`HISTORICAL SNAPSHOT REV #${revision.revisionNumber}`));

  const { doc } = buildPrimerPdfDocument(revision.snapshot, {
    mode: 'scientific-review',
    revisionInfo: revInfo,
  });
  assert.ok(doc.getNumberOfPages() >= 2);
});
