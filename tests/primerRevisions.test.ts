import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_EVENTS, type EQPEvent } from '../src/data/eqpData';
import {
  buildPrimerHtmlDocument,
  buildPrimerPdfDocument,
  DEFAULT_PRIMER_ELIGIBILITY_RULES,
  generateInitialEarthquakePrimer,
  updatePrimerEpicenterFigure,
  updatePrimerPresentationConfig,
  updatePrimerSequenceHistoricalAnalysis,
  updatePrimerStage4Narratives,
} from '../src/utils/earthquakePrimer';
import {
  DEFAULT_PRIMER_MAP_LAYERS,
  generatePrimerEpicenterFigure,
} from '../src/utils/primerMapFigure';
import { buildPrimerExportFilename } from '../src/utils/primerPresentation';
import { validateAndMergeLocalCatalog } from '../src/utils/primerCatalogAdapters';
import { buildPrimerStage3Package } from '../src/utils/primerSequenceIntegration';
import {
  buildPrimerStage4Narratives,
  computeStage4InputFingerprint,
  createDefaultStage4ExternalData,
} from '../src/utils/primerScientificNarratives';
import {
  comparePrimerRevisions,
  createPrimerRevisionRecord,
  detectPrimerSourceChanges,
  restoreRevisionAsNewWorkingDraft,
  revisionToCompareTarget,
  toPrimerExportRevisionInfo,
  verifyPrimerRevisionChecksum,
  workingDraftToCompareTarget,
} from '../src/utils/primerRevisions';
import {
  buildPrimerRevisionArchiveBundle,
  createMemoryRevisionStore,
  inspectLocalStorageCapacity,
  LOCAL_ARCHIVE_INTEGRITY_DISCLAIMER,
  serializePrimerRevisionArchive,
  validateAndParsePrimerRevisionArchive,
} from '../src/utils/primerRevisionArchive';

function buildRichDraftPrimer(sourceEvent: EQPEvent) {
  const refMs = Date.parse(`${sourceEvent.originDateGmt}T${sourceEvent.originTimeGmt}Z`);
  const draft0 = generateInitialEarthquakePrimer(sourceEvent, {
    trigger: 'manual',
    rules: DEFAULT_PRIMER_ELIGIBILITY_RULES,
    primaryLocationLabel: '012 km N 45° E of General Luna (Surigao del Norte)',
    faultGeneratorLabel: 'Philippine Fault Zone — Surigao Segment',
    figureOptions: {
      extent: 'regional',
      theme: 'classic',
      layers: DEFAULT_PRIMER_MAP_LAYERS,
    },
  });

  const catalogSnap = validateAndMergeLocalCatalog({
    content: [
      'eventId,time,latitude,longitude,depth,magnitude,magType,source,place',
      `HIST-1990,${new Date(refMs - 20 * 365.25 * 86_400_000).toISOString()},9.90,126.20,15.0,6.0,Mw,PHIVOLCS,Historical Surigao`,
      `EQ-TEST-AF1,${new Date(refMs + 2 * 3_600_000).toISOString()},9.81,126.15,12.0,3.8,Ms,EQP Local Test,"General Luna, Surigao del Norte"`,
      `EQ-TEST-AF2,${new Date(refMs + 4 * 3_600_000).toISOString()},9.83,126.18,14.0,4.1,Ms,EQP Local Test,"Dapa, Surigao del Norte"`,
    ].join('\n'),
    format: 'csv',
    existingRecords: [],
    existingCatalogVersion: 1,
    defaultSource: 'EQP Local Test',
    catalogVersionLabel: 'cat-v1.0',
  });

  const stage3Pkg = buildPrimerStage3Package({
    event: sourceEvent,
    catalog: catalogSnap.records,
    catalogVersion: catalogSnap.catalogVersion,
    sourceLabel: catalogSnap.sourceLabel,
    config: {
      dataCutoffUtc: new Date(refMs + 48 * 3_600_000).toISOString(),
    },
  });

  const draftWithS3 = updatePrimerSequenceHistoricalAnalysis(draft0, stage3Pkg);
  const extData = createDefaultStage4ExternalData(sourceEvent);
  extData.tsunami = {
    ...extData.tsunami,
    state: 'official-no-tsunami',
    officialAdvisoryId: 'PHIVOLCS Tsunami Info No. 1',
    issuedAt: '12 Nov 2026 - 12:15 PM (PST)',
    sourceDocumentRef: 'PHIVOLCS-TSU-2026-01',
  };
  extData.hazardObservations = [
    {
      id: 'haz-1',
      hazardType: 'ground_shaking',
      location: 'General Luna, Surigao del Norte',
      observedAtUtc: '2026-11-12T05:30:00Z',
      description: 'Minor hairline plaster cracks reported on municipal hall exterior.',
      source: 'Field QRT Quick Report (QRT-SDN-001)',
      reviewStatus: 'ready-for-review',
    },
  ];
  extData.tectonic = {
    ...extData.tectonic,
    expertInterpretation: 'Shallow crustal strike-slip faulting along the Surigao segment.',
    evidenceReferences: 'PHIVOLCS CMT Preliminary Solution',
    reviewStatus: 'requires-scientific-review',
  };

  const stage4Pkg = buildPrimerStage4Narratives({
    event: sourceEvent,
    primaryLocationLabel: '012 km N 45° E of General Luna (Surigao del Norte)',
    faultGeneratorLabel: 'Philippine Fault Zone — Surigao Segment',
    isPlotResultStale: false,
    epicenterFigure: draftWithS3.extensions?.epicenterFigure ?? null,
    stage3Package: stage3Pkg,
    externalData: extData,
  });

  return updatePrimerStage4Narratives(draftWithS3, stage4Pkg);
}

test('Stage 6A #1: Save New Revision captures full snapshot, fingerprints, completeness, UTC/PST timestamps without mutating active event', () => {
  const sourceEvent: EQPEvent = structuredClone(INITIAL_EVENTS[2]);
  const eventSnapshotBefore = JSON.stringify(sourceEvent);

  const draft = buildRichDraftPrimer(sourceEvent);
  const editedDraft = {
    ...draft,
    sections: draft.sections.map((s) =>
      s.id === 'overview'
        ? {
            ...s,
            content: `${s.content}\nOperator note: verified bulletin narrative check.`,
            isEdited: true,
          }
        : s
    ),
  };

  const { revision, updatedWorkingDraft } = createPrimerRevisionRecord(editedDraft, {
    description: 'Initial baseline primer snapshot after Stage 4 compilation',
    existingRevisions: [],
    createdAtUtc: '2026-11-12T06:00:00.000Z',
    isPlotResultStale: false,
  });

  // Active EQPEvent must remain completely untouched
  assert.equal(JSON.stringify(sourceEvent), eventSnapshotBefore);

  assert.equal(revision.revisionNumber, 1);
  assert.equal(revision.parentRevisionId, null);
  assert.equal(revision.eventId, sourceEvent.id);
  assert.equal(revision.createdAtUtc, '2026-11-12T06:00:00.000Z');
  assert.match(revision.createdAtPst, /PST/);
  assert.ok(revision.primerDocumentId.length > 0);
  assert.ok(revision.revisionId.includes('_r1_'));
  assert.ok(revision.sourceEventFingerprint.length >= 8);
  assert.ok(revision.stage2FigureFingerprint);
  assert.ok(revision.stage3SequenceFingerprint);
  assert.ok(revision.stage4NarrativeFingerprint);
  assert.equal(revision.completenessIndicators.hasStage2Figure, true);
  assert.equal(revision.completenessIndicators.hasStage3Package, true);
  assert.equal(revision.completenessIndicators.hasStage4Package, true);
  assert.equal(
    revision.completenessIndicators.snapshotSourceFreshness.isPlotResultStaleAtSnapshot,
    false
  );
  assert.equal(
    revision.completenessIndicators.snapshotSourceFreshness.staleIndicatorsAtSnapshot.length,
    0
  );
  assert.equal(verifyPrimerRevisionChecksum(revision), true);

  // User-authored text preserved in snapshot
  const snapOverview = revision.snapshot.sections.find((s) => s.id === 'overview');
  assert.match(snapOverview?.content ?? '', /Operator note: verified bulletin narrative check/);

  // Working draft updated with lineage without auto-publishing
  assert.equal(updatedWorkingDraft.status, 'draft');
  assert.equal(
    updatedWorkingDraft.extensions?.reviewVersioning?.activeRevisionId,
    revision.revisionId
  );
  assert.equal(updatedWorkingDraft.extensions?.reviewVersioning?.revisionNumber, 1);
});

test('Stage 6A #2: Duplicate revision identifier protection rejects collisions', async () => {
  const sourceEvent: EQPEvent = structuredClone(INITIAL_EVENTS[2]);
  const draft = buildRichDraftPrimer(sourceEvent);

  const { revision: rev1 } = createPrimerRevisionRecord(draft, {
    description: 'Rev 1',
    existingRevisions: [],
    explicitRevisionId: 'rev_fixed_collision_test',
  });

  assert.throws(
    () =>
      createPrimerRevisionRecord(draft, {
        description: 'Duplicate attempt',
        existingRevisions: [rev1],
        explicitRevisionId: 'rev_fixed_collision_test',
      }),
    /Duplicate revision identifier rejected|Duplicate revisionId/i
  );

  const store = createMemoryRevisionStore();
  await store.saveRevision(rev1);
  await assert.rejects(() => store.saveRevision(rev1), /already exists/i);
});

test('Stage 6A #3: Historical revisions are frozen and remain immutable across working edits and regenerations', () => {
  const sourceEvent: EQPEvent = structuredClone(INITIAL_EVENTS[2]);
  const draft = buildRichDraftPrimer(sourceEvent);

  const { revision: rev1, updatedWorkingDraft } = createPrimerRevisionRecord(draft, {
    description: 'Frozen Rev 1',
    existingRevisions: [],
  });

  assert.equal(Object.isFrozen(rev1), true);
  assert.equal(Object.isFrozen(rev1.snapshot), true);
  assert.equal(Object.isFrozen(rev1.snapshot.sections[0]), true);

  assert.throws(() => {
    (rev1.snapshot as { title: string }).title = 'Tampered Title';
  }, TypeError);

  // Regenerating Stage 2 figure & editing sections on working draft never touches rev1
  const modifiedEvent: EQPEvent = {
    ...sourceEvent,
    lat: 10.55,
    lon: 126.95,
    ms: 6.4,
  };
  const updatedFigureDraft = updatePrimerEpicenterFigure(updatedWorkingDraft, modifiedEvent, {
    extent: 'focused',
    theme: 'print-bw',
    layers: DEFAULT_PRIMER_MAP_LAYERS,
    primaryLocationLabel: 'New Surigao Offshore Location',
  });

  assert.equal(rev1.snapshot.extracted.magnitudeValue, sourceEvent.ms);
  assert.equal(rev1.snapshot.extensions?.epicenterFigure?.extent, 'regional');
  assert.notEqual(
    updatedFigureDraft.extensions?.epicenterFigure?.provenance.sourceEventFingerprint,
    rev1.sourceEventFingerprint
  );
  assert.equal(verifyPrimerRevisionChecksum(rev1), true);
});

test('Stage 6A #4: Restoring a historical revision creates a new editable working draft while preserving the frozen revision', () => {
  const sourceEvent: EQPEvent = structuredClone(INITIAL_EVENTS[2]);
  const draft1 = buildRichDraftPrimer(sourceEvent);
  const { revision: rev1, updatedWorkingDraft: draftAfterRev1 } = createPrimerRevisionRecord(
    draft1,
    {
      description: 'Original baseline Rev 1',
      existingRevisions: [],
      createdAtUtc: '2026-11-12T06:00:00.000Z',
    }
  );

  // Advance working draft to Rev 2 with altered text
  const editedForRev2 = {
    ...draftAfterRev1,
    title: 'Revised Working Title v2',
    sections: draftAfterRev1.sections.map((s) =>
      s.id === 'recommendations'
        ? { ...s, content: 'Updated Rev 2 recommendations text.', isEdited: true }
        : s
    ),
  };
  const { revision: rev2 } = createPrimerRevisionRecord(editedForRev2, {
    description: 'Rev 2 with edited recommendations',
    existingRevisions: [rev1],
    createdAtUtc: '2026-11-12T07:00:00.000Z',
  });
  assert.equal(rev2.revisionNumber, 2);
  assert.equal(rev2.parentRevisionId, rev1.revisionId);

  // Restore Rev 1 into a new editable working draft
  const restoredDraft = restoreRevisionAsNewWorkingDraft(rev1);
  assert.notEqual(restoredDraft.id, rev1.snapshot.id);
  assert.equal(restoredDraft.status, 'draft');
  assert.equal(restoredDraft.title, rev1.snapshot.title);
  assert.equal(
    restoredDraft.extensions?.reviewVersioning?.restoredFromRevisionId,
    rev1.revisionId
  );
  assert.equal(restoredDraft.extensions?.reviewVersioning?.restoredFromRevisionNumber, 1);

  // Editing the restored working draft works freely and leaves Rev 1 and Rev 2 untouched
  restoredDraft.sections[0].content = 'Operator post-restore edit on Rev 1 branch';
  restoredDraft.sections[0].isEdited = true;
  assert.notEqual(rev1.snapshot.sections[0].content, restoredDraft.sections[0].content);
  assert.equal(verifyPrimerRevisionChecksum(rev1), true);
  assert.equal(verifyPrimerRevisionChecksum(rev2), true);
});

test('Stage 6A #5: Revision comparison detects parameter, narrative, observation, aftershock, figure, citation, and presentation changes without inventing interpretation', () => {
  const event1: EQPEvent = structuredClone(INITIAL_EVENTS[2]);
  const draft1 = buildRichDraftPrimer(event1);
  const { revision: rev1 } = createPrimerRevisionRecord(draft1, {
    description: 'Rev 1 baseline',
    existingRevisions: [],
  });

  // Build modified working draft for Rev 2
  const event2: EQPEvent = structuredClone(INITIAL_EVENTS[2]);
  event2.ms = 5.6;
  event2.depthKm = 18.0;
  event2.bulletinNo = event2.bulletinNo + 1;
  event2.intensities = [
    ...event2.intensities,
    {
      id: 'peis-new-1',
      peis: 'V',
      locality: 'Burgos, Surigao del Norte',
      reviewStatus: 'verified',
    },
  ];

  let draft2 = buildRichDraftPrimer(event2);
  draft2 = updatePrimerPresentationConfig(draft2, {
    headingStyle: 'technical-numbered',
  });
  draft2 = updatePrimerEpicenterFigure(draft2, event2, {
    extent: 'focused',
    theme: 'print-bw',
    layers: DEFAULT_PRIMER_MAP_LAYERS,
  });

  const ext2 = createDefaultStage4ExternalData(event2);
  ext2.tsunami = {
    ...ext2.tsunami,
    state: 'official-warning-or-advisory',
    officialAdvisoryId: 'PHIVOLCS Tsunami Advisory No. 99',
    sourceDocumentRef: 'PHIVOLCS-TSU-2026-99',
    seaLevelObservations: [
      {
        id: 'sl-1',
        stationName: 'Surigao Tide Gauge',
        maxWaveHeightM: '0.18',
        observedAtUtc: '2026-11-12T06:20:00Z',
        observationType: 'tide-gauge',
        sourceRef: 'NAMRIA TG-SUR-01',
        reviewStatus: 'ready-for-review',
      },
    ],
  };
  ext2.hazardObservations = [
    {
      id: 'haz-2',
      hazardType: 'landslides',
      location: 'Sison, Surigao del Norte',
      observedAtUtc: '2026-11-12T06:45:00Z',
      description: 'Localized rockfall along national highway slope.',
      source: 'DPWH Road Advisory (DPWH-R13-09)',
      reviewStatus: 'ready-for-review',
    },
  ];

  const stage4_2 = buildPrimerStage4Narratives({
    event: event2,
    primaryLocationLabel: '012 km N 45° E of General Luna (Surigao del Norte)',
    faultGeneratorLabel: 'Philippine Fault Zone — Surigao Segment',
    isPlotResultStale: false,
    epicenterFigure: draft2.extensions?.epicenterFigure ?? null,
    stage3Package: draft2.extensions?.sequenceHistoricalAnalysis ?? null,
    externalData: ext2,
  });
  draft2 = updatePrimerStage4Narratives(draft2, stage4_2);
  draft2 = {
    ...draft2,
    sections: draft2.sections.map((s) =>
      s.id === 'overview'
        ? { ...s, content: `${s.content}\nModified overview bulletin note.`, isEdited: true }
        : s
    ),
  };

  const report = comparePrimerRevisions(
    revisionToCompareTarget(rev1),
    workingDraftToCompareTarget(draft2)
  );

  assert.equal(report.summary.hasAnyDifference, true);
  assert.ok(report.eventParameterChanges.length >= 2);
  assert.ok(report.narrativeSectionDiffs.some((d) => d.sectionId === 'overview' && d.textChanged));
  assert.ok(report.observationDiff.intensityChanges.length > 0);
  assert.equal(report.observationDiff.seaLevelObservationsAdded.length, 1);
  assert.equal(report.observationDiff.hazardObservationsAdded.length, 1);
  assert.equal(report.observationDiff.hazardObservationsRemoved.length, 1);
  assert.ok(report.observationDiff.tsunamiAndAdvisoryChanges.length > 0);
  assert.ok(report.figureDiffs.some((f) => f.changed));
  assert.equal(report.presentationDiff.headingStyleChanged, true);
  assert.match(report.disclaimer, /Structured factual comparison only/i);
});

test('Stage 6A #6: Source change detection flags live event/PLOT/intensity/catalog/hazard/interpretation drift without mutating frozen provenance', () => {
  const baseEvent: EQPEvent = structuredClone(INITIAL_EVENTS[2]);
  const draft = buildRichDraftPrimer(baseEvent);
  const { revision: frozenRev } = createPrimerRevisionRecord(draft, {
    description: 'Snapshot before relocation & advisory changes',
    existingRevisions: [],
    isPlotResultStale: false,
  });

  const liveEvent: EQPEvent = {
    ...baseEvent,
    lat: 10.12,
    ms: 5.8,
    intensities: [
      ...baseEvent.intensities,
      {
        id: 'new-verified',
        peis: 'VI',
        locality: 'Surigao City',
        reviewStatus: 'verified',
      },
    ],
  };

  const modifiedExternal = createDefaultStage4ExternalData(liveEvent);
  modifiedExternal.hazardObservations = [
    {
      id: 'haz-new',
      hazardType: 'liquefaction',
      location: 'Surigao Port',
      observedAtUtc: '2026-11-12T08:00:00Z',
      description: 'Sand boils noted near reclaimed port apron.',
      source: 'PHIVOLCS QRT (QRT-02)',
      reviewStatus: 'ready-for-review',
    },
  ];
  modifiedExternal.tectonic = {
    ...modifiedExternal.tectonic,
    expertInterpretation: 'Revised interpretation pointing to offshore oblique reverse fault.',
    reviewStatus: 'ready-for-review',
  };

  const modifiedStage4Fp = computeStage4InputFingerprint({
    event: liveEvent,
    primaryLocationLabel: '012 km N 45° E of General Luna (Surigao del Norte)',
    faultGeneratorLabel: 'Philippine Fault Zone — Surigao Segment',
    isPlotResultStale: true,
    stage3Package: frozenRev.snapshot.extensions?.sequenceHistoricalAnalysis ?? null,
    externalData: modifiedExternal,
  });

  const drift = detectPrimerSourceChanges(frozenRev, {
    event: liveEvent,
    primaryLocationLabel: '012 km N 45° E of General Luna (Surigao del Norte)',
    faultGeneratorLabel: 'Philippine Fault Zone — Surigao Segment',
    isPlotResultStale: true,
    currentStage3Fingerprint: 'modified-stage3-fp',
    currentStage4Fingerprint: modifiedStage4Fp,
    liveExternalData: modifiedExternal,
  });

  assert.equal(drift.targetKind, 'historical-revision');
  assert.equal(drift.hasSourceChanges, true);
  assert.ok(drift.changes.some((c) => c.category === 'plot-solution-stale'));
  assert.ok(drift.changes.some((c) => c.category === 'event-parameters-changed'));
  assert.ok(drift.changes.some((c) => c.category === 'intensity-data-changed'));
  assert.ok(drift.changes.some((c) => c.category === 'aftershock-catalog-changed'));
  assert.ok(drift.changes.some((c) => c.category === 'hazard-or-advisory-changed'));
  assert.ok(drift.changes.some((c) => c.category === 'scientific-interpretation-changed'));
  assert.ok(drift.affectedSections.includes('overview'));
  assert.ok(drift.affectedSections.includes('hazards'));
  assert.ok(drift.preservedHistoricalProvenanceNote);

  // Frozen revision retains its original provenance untouched
  assert.equal(frozenRev.snapshot.extracted.magnitudeValue, baseEvent.ms);
  assert.equal(
    frozenRev.completenessIndicators.snapshotSourceFreshness.isPlotResultStaleAtSnapshot,
    false
  );
});

test('Stage 6A #7: Archive strips ephemeral PNG raster buffers while keeping vector SVGs & reports localStorage capacity safely', async () => {
  const sourceEvent: EQPEvent = structuredClone(INITIAL_EVENTS[2]);
  const draft = buildRichDraftPrimer(sourceEvent);

  // Attach an ephemeral PNG buffer to Stage 2 figure before saving revision
  const figWithPng = generatePrimerEpicenterFigure(sourceEvent, {
    extent: 'regional',
    theme: 'classic',
    layers: DEFAULT_PRIMER_MAP_LAYERS,
  });
  figWithPng.pngDataUrl = 'data:image/png;base64,FAKEEPHEMERALRASTERBUFFER';
  const draftWithPng = {
    ...draft,
    extensions: {
      ...draft.extensions,
      epicenterFigure: figWithPng,
    },
  };

  const { revision } = createPrimerRevisionRecord(draftWithPng, {
    description: 'PNG stripping check',
    existingRevisions: [],
  });

  // Ephemeral PNG stripped, SVG preserved
  assert.equal(revision.snapshot.extensions?.epicenterFigure?.pngDataUrl, undefined);
  assert.ok(revision.snapshot.extensions?.epicenterFigure?.svgMarkup?.includes('<svg'));

  const capReport = inspectLocalStorageCapacity();
  assert.equal(typeof capReport.usedBytes, 'number');
  assert.equal(typeof capReport.estimatedLimitBytes, 'number');

  const store = createMemoryRevisionStore();
  await store.saveRevision(revision);
  const diag = await store.getDiagnostics();
  assert.equal(diag.totalRevisions, 1);
  assert.equal(diag.integrityDisclaimer, LOCAL_ARCHIVE_INTEGRITY_DISCLAIMER);
});

test('Stage 6A #8 & #9: Portable JSON archive export & validated import handles valid round-trip, deduplication, and rejects corrupted/malicious payloads', async () => {
  const sourceEvent: EQPEvent = structuredClone(INITIAL_EVENTS[2]);
  const draft = buildRichDraftPrimer(sourceEvent);
  const { revision: rev1 } = createPrimerRevisionRecord(draft, {
    description: 'Portable archive test rev 1',
    existingRevisions: [],
  });

  const bundleJson = serializePrimerRevisionArchive([rev1]);
  const parsedOk = validateAndParsePrimerRevisionArchive(bundleJson);
  assert.equal(parsedOk.ok, true);
  assert.equal(parsedOk.revisions.length, 1);
  assert.equal(parsedOk.revisions[0].revisionId, rev1.revisionId);

  // Re-import into store with rev1 already present skips duplicate cleanly
  const store = createMemoryRevisionStore([rev1]);
  const dupImport = await store.importArchiveJson(bundleJson);
  assert.equal(dupImport.ok, true);
  assert.equal(dupImport.importedCount, 0);
  assert.deepEqual(dupImport.skippedDuplicateIds, [rev1.revisionId]);

  // 1) Malformed JSON rejected
  assert.equal(validateAndParsePrimerRevisionArchive('{bad-json').ok, false);

  // 2) Wrong bundleType rejected
  const wrongBundle = buildPrimerRevisionArchiveBundle([rev1]);
  (wrongBundle as unknown as Record<string, unknown>).bundleType = 'unrelated-payload';
  assert.equal(validateAndParsePrimerRevisionArchive(JSON.stringify(wrongBundle)).ok, false);

  // 3) Prototype-pollution key rejected
  const protoPayload = bundleJson.replace(
    '"bundleType"',
    '"__proto__":{"polluted":true},"bundleType"'
  );
  const protoRes = validateAndParsePrimerRevisionArchive(protoPayload);
  assert.equal(protoRes.ok, false);
  assert.match(protoRes.errors[0], /prototype|constructor/i);

  // 4) Auto-approved / non-draft status rejected
  const tamperedStatus = JSON.parse(bundleJson);
  tamperedStatus.revisions[0].snapshot.status = 'FINAL';
  const statusRes = validateAndParsePrimerRevisionArchive(JSON.stringify(tamperedStatus));
  assert.equal(statusRes.ok, false);
  assert.match(statusRes.errors[0], /draft/i);

  // 5) Checksum tampering rejected
  const tamperedText = JSON.parse(bundleJson);
  tamperedText.revisions[0].snapshot.title = 'Silently Modified After Snapshot';
  const checksumRes = validateAndParsePrimerRevisionArchive(JSON.stringify(tamperedText));
  assert.equal(checksumRes.ok, false);
  assert.match(checksumRes.errors[0], /checksum/i);
});

test('Stage 6A #10: Historical revision HTML & PDF export renders distinct revision metadata, uses snapshot coordinates, and never emits FINAL/APPROVED/PUBLISHED', () => {
  const sourceEvent: EQPEvent = structuredClone(INITIAL_EVENTS[2]);
  const draft = buildRichDraftPrimer(sourceEvent);

  const { revision: rev1 } = createPrimerRevisionRecord(draft, {
    description: 'Snapshot prior to bulletin update',
    existingRevisions: [],
    createdAtUtc: '2026-11-12T06:00:00.000Z',
  });
  const revInfo = toPrimerExportRevisionInfo(rev1);

  for (const mode of ['public-draft', 'scientific-review'] as const) {
    const filename = buildPrimerExportFilename(rev1.snapshot, mode, 'pdf', revInfo);
    assert.match(filename, /_REV1_/);
    assert.doesNotMatch(filename, /FINAL|APPROVED|PUBLISHED/);

    const html = buildPrimerHtmlDocument(rev1.snapshot, {
      mode,
      revisionInfo: revInfo,
    });

    assert.match(html, /Rev #1/);
    assert.match(html, /Document Revision/);
    assert.match(html, /Revision Created Timestamp/);
    assert.match(html, /Primer Updated Timestamp/);
    assert.match(html, /HISTORICAL SNAPSHOT REV #1/);
    assert.match(html, /DRAFT/i);
    assert.doesNotMatch(html, /\bAPPROVED\b|\bPUBLISHED\b|\bFINAL RELEASE\b/);

    // PDF export must succeed cleanly in Node using snapshot-safe fallback event
    // even if no live EQPEvent is passed (or live coordinates changed)
    const pdfRes = buildPrimerPdfDocument(rev1.snapshot, {
      mode,
      revisionInfo: revInfo,
    });
    assert.ok(pdfRes.doc.getNumberOfPages() >= 2);
    assert.match(pdfRes.filename, /_REV1_/);
    assert.doesNotMatch(pdfRes.filename, /FINAL|APPROVED|PUBLISHED/);
  }
});
