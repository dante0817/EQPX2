import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { INITIAL_EVENTS, type EQPEvent } from '../src/data/eqpData';
import {
  buildPrimerHtmlDocument,
  generateInitialEarthquakePrimer,
  type PrimerDocument,
} from '../src/utils/earthquakePrimer';
import { buildPrimerReferenceList } from '../src/utils/primerPresentation';
import {
  buildTextPreview,
  evaluateResearchEventMatch,
  parseUsgsComcatDetailGeoJson,
  type PrimerResearchSourceRecord,
} from '../src/utils/primerResearchAssistant';
import {
  createManualCandidateFinding,
  extractDeterministicFindingsFromSource,
} from '../src/utils/primerResearchExtraction';
import {
  applyReviewedScientificFindingToPrimer,
  buildFindingTransferPreview,
  documentEventMatchResolution,
  evaluateFindingTransferEligibility,
  NO_SUPPORTED_DIRECT_TRANSFER_LABEL,
  R3_TRANSFER_APPROVAL_DISCLAIMER,
  syncStage4NarrativeToEditedSection,
} from '../src/utils/primerResearchTransfer';
import {
  createMemoryResearchTransferStore,
  validateAndImportTransferHistoryJson,
} from '../src/utils/primerResearchTransferStore';
import {
  createPrimerReviewRecord,
  evaluatePrimerReviewValidity,
} from '../src/utils/primerReviews';
import {
  createPrimerRevisionRecord,
  detectPrimerSourceChanges,
} from '../src/utils/primerRevisions';
import {
  buildPrimerReviewPackageZip,
  decodeAndValidateStoredZip,
  validateAndImportPrimerReviewPackageZip,
} from '../src/utils/primerReviewPackage';

function makeBoholEvent(): EQPEvent {
  const ev = structuredClone(INITIAL_EVENTS[0]);
  ev.id = 'EQP-20131015-BOHOL';
  ev.filename = '20131015_0012_Bohol.eqp';
  ev.originDateGmt = '2013-10-15';
  ev.originTimeGmt = '00:12:32';
  ev.lat = 9.88;
  ev.lon = 124.11;
  ev.depthKm = 12.0;
  ev.ms = 7.2;
  ev.mb = 0;
  ev.md = 0;
  return ev;
}

function makeDraftPrimer(event: EQPEvent): PrimerDocument {
  return generateInitialEarthquakePrimer(event, {
    trigger: 'manual',
    primaryLocationLabel: 'Sagbayan, Bohol',
    faultGeneratorLabel: 'East Bohol Fault (nearby mapped structure)',
    isSolutionStale: false,
  });
}

function makeSourceRecord(
  event: EQPEvent,
  overrides: Partial<PrimerResearchSourceRecord> = {}
): PrimerResearchSourceRecord {
  const text =
    overrides.extractedText ??
    'PHIVOLCS Earthquake Information No. 2\nField investigation confirms landslides and rockfalls along steep limestone slopes in Loon and Carmen, Bohol.\nTsunami Advisory No. 1: NO destructive tsunami threat exists based on available data.';
  const match =
    overrides.eventMatchDetails ??
    evaluateResearchEventMatch(
      {
        externalEventIds: [event.id],
        originTimeUtc: '2013-10-15T00:12:32.000Z',
        lat: 9.88,
        lon: 124.11,
        depthKm: 12.0,
        magnitude: 7.2,
        magnitudeType: 'Ms',
      },
      event
    );

  return {
    schemaVersion: '1.0',
    sourceId: overrides.sourceId ?? `src_${crypto.randomUUID().slice(0, 8)}`,
    linkedEqpEventId: event.id,
    documentTitle: 'DOST-PHIVOLCS Field Report — Bohol M7.2',
    organization: 'DOST-PHIVOLCS',
    sourceLocation: 'https://phivolcs.dost.gov.ph/earthquake/bohol-field-report',
    sourceUrl: 'https://phivolcs.dost.gov.ph/earthquake/bohol-field-report',
    localImportId: null,
    sourceCategory: 'field-investigation',
    publishedAtUtc: '2013-10-15T06:00:00.000Z',
    retrievedAtUtc: '2026-11-16T06:00:00.000Z',
    contentType: 'text/plain',
    sizeBytes: Buffer.byteLength(text, 'utf8'),
    contentSha256: crypto.createHash('sha256').update(text).digest('hex'),
    textAvailability: 'available',
    textUnavailableReason: null,
    extractedText: text,
    extractedTextPreview: buildTextPreview(text),
    pageCount: null,
    eventMatchState: match.state,
    eventMatchDetails: match,
    externalEventIds: [event.id],
    retrievalStatus: 'retrieved',
    originProvenance: {
      channel: 'safe-url-fetch',
      adapterId: 'server-ssrf-guarded-fetch',
      queryOrRequestSummary: 'Bohol test',
      modelUsed: null,
      groundingUsed: false,
      retrievedViaServer: true,
      accessConditionNote: null,
    },
    usgsDetail: null,
    relevance: 'unreviewed',
    archived: false,
    notes: '',
    versionNumber: 1,
    supersedesSourceId: null,
    supersededBySourceId: null,
    duplicateGroupKey: 'bohol_field_rep',
    ...overrides,
  };
}

// =============================================================================
// 1. ELIGIBLE SOURCE-SUPPORTED TRANSFER + STAGE 4 & STAGE 5 PROVENANCE
// =============================================================================

test('1. Eligible source-supported finding transfers non-destructively into Stage 4 with Stage 5 provenance & audit log', async () => {
  const event = makeBoholEvent();
  const primer = makeDraftPrimer(event);
  const src = makeSourceRecord(event);
  const finding = createManualCandidateFinding({
    source: src,
    category: 'landslides-rockfalls',
    epistemicBasis: 'reported',
    findingTitle: 'Earthquake-induced landslides in Loon and Carmen, Bohol',
    extractedStatement:
      'Field investigation confirms landslides and rockfalls along steep limestone slopes in Loon and Carmen, Bohol.',
    evidencePassage:
      'Field investigation confirms landslides and rockfalls along steep limestone slopes in Loon and Carmen, Bohol.',
  });

  const elig = evaluateFindingTransferEligibility(finding, {
    activeEvent: event,
    primer,
    source: src,
    allSources: [src],
    allFindings: [finding],
  });
  assert.equal(elig.eligible, true);
  assert.equal(elig.statusBucket, 'eligible');
  assert.equal(elig.canClassifyAsVerifiedFact, true);

  // Refuses silent transfer if operatorConfirmedTransfer is false
  const blockedNoConfirm = applyReviewedScientificFindingToPrimer({
    activeEvent: event,
    primer,
    finding,
    source: src,
    operatorConfirmedTransfer: false,
  });
  assert.equal(blockedNoConfirm.ok, false);
  assert.equal(blockedNoConfirm.code, 'blocked-confirmation-required');

  const applied = applyReviewedScientificFindingToPrimer({
    activeEvent: event,
    primer,
    finding,
    source: src,
    operatorConfirmedTransfer: true,
    appliedAsState: 'verified-fact',
    operatorConfirmedVerifiedFact: true,
    operatorLabel: 'A. Reyes (Staff)',
  });

  assert.equal(applied.ok, true);
  assert.equal(applied.code, 'applied');
  assert.ok(applied.transferLink);
  assert.ok(applied.auditRecord);

  const pkg4 = applied.updatedPrimer.extensions?.scientificNarrativePackage;
  assert.ok(pkg4);
  const landslideObs = pkg4.externalData.hazardObservations.find(
    (h) => h.hazardType === 'landslides'
  );
  assert.ok(landslideObs);
  assert.equal(landslideObs.reviewStatus, 'ready-for-review');
  assert.match(landslideObs.description, /Loon and Carmen, Bohol/i);

  // Stage 5 provenance integration & Reference List picks up R3 source
  assert.ok(
    pkg4.provenanceLedger.some((p) =>
      p.claimKey.includes(`r3.hazards.${applied.transferLink!.transferId}`)
    )
  );
  const refs = buildPrimerReferenceList(applied.updatedPrimer);
  assert.ok(
    refs.some(
      (r) =>
        r.organizationOrAuthor.includes('DOST-PHIVOLCS') &&
        r.documentIdOrUrl?.includes(src.sourceUrl ?? '')
    )
  );

  // Append-only audit store check
  const store = createMemoryResearchTransferStore();
  await store.appendAuditRecord(applied.auditRecord!);
  const logs = await store.listRecords({ linkedEqpEventId: event.id });
  assert.equal(logs.length, 1);
  assert.equal(logs[0].action, 'transfer-applied');
});

// =============================================================================
// 2. UNSUPPORTED DESTINATION REJECTION (NO SUPPORTED DIRECT TRANSFER)
// =============================================================================

test('2. Findings without an existing compatible Stage 4 destination report NO SUPPORTED DIRECT TRANSFER and remain blocked', () => {
  const event = makeBoholEvent();
  const primer = makeDraftPrimer(event);
  const src = makeSourceRecord(event, {
    extractedText:
      'Reported intensity PEIS Intensity VII in Tagbilaran City. Recorded 42 aftershocks as of 08:00 PST (cutoff 08:00 PST). USGS tsunami=0 modeled ShakeMap MMI VIII.',
  });

  const peisFinding = createManualCandidateFinding({
    source: src,
    category: 'reported-intensities',
    epistemicBasis: 'reported',
    findingTitle: 'External PEIS VII report',
    extractedStatement: 'Reported intensity PEIS Intensity VII in Tagbilaran City.',
    evidencePassage: 'Reported intensity PEIS Intensity VII in Tagbilaran City.',
  });
  const aftershockFinding = createManualCandidateFinding({
    source: src,
    category: 'aftershock-cutoffs',
    epistemicBasis: 'reported',
    findingTitle: 'Aftershock count cutoff',
    extractedStatement: 'Recorded 42 aftershocks as of 08:00 PST (cutoff 08:00 PST).',
    evidencePassage: 'Recorded 42 aftershocks as of 08:00 PST (cutoff 08:00 PST).',
  });
  const modeledShakeMapFinding = createManualCandidateFinding({
    source: src,
    category: 'structural-infrastructure',
    epistemicBasis: 'modeled',
    findingTitle: 'USGS ShakeMap MMI VIII estimate',
    extractedStatement: 'USGS tsunami=0 modeled ShakeMap MMI VIII.',
    evidencePassage: 'USGS tsunami=0 modeled ShakeMap MMI VIII.',
  });

  for (const f of [peisFinding, aftershockFinding, modeledShakeMapFinding]) {
    const elig = evaluateFindingTransferEligibility(f, {
      activeEvent: event,
      primer,
      source: src,
    });
    assert.equal(elig.eligible, false);
    assert.equal(elig.statusBucket, 'no-supported-destination');
    assert.equal(elig.mapping.supported, false);
    assert.equal(elig.mapping.destinationLabel, NO_SUPPORTED_DIRECT_TRANSFER_LABEL);
  }

  // Also test deterministic USGS tsunamiFlagRaw
  const usgsDetail = parseUsgsComcatDetailGeoJson(
    {
      type: 'Feature',
      id: 'usb000kdb4',
      properties: {
        mag: 7.1,
        magType: 'mww',
        place: 'Sagbayan, Bohol',
        time: Date.parse('2013-10-15T00:12:32.000Z'),
        updated: Date.parse('2013-10-15T04:00:00.000Z'),
        tsunami: 1,
        url: 'https://earthquake.usgs.gov/earthquakes/eventpage/usb000kdb4',
        title: 'M 7.1 - Sagbayan, Bohol',
        products: {
          losspager: [
            {
              id: 'pager-1',
              source: 'us',
              updateTime: Date.parse('2013-10-15T01:00:00.000Z'),
              properties: { alertlevel: 'yellow' },
            },
          ],
        },
      },
      geometry: { type: 'Point', coordinates: [124.1167, 9.8796, 15.5] },
    },
    'https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=usb000kdb4&format=geojson'
  );
  const usgsSrc = makeSourceRecord(event, {
    organization: 'USGS',
    extractedText: 'USGS GeoJSON summary tsunami=1 pager alertlevel yellow',
    usgsDetail,
    externalEventIds: ['usb000kdb4', event.id],
  });
  const usgsFindings = extractDeterministicFindingsFromSource(usgsSrc);
  const tsunamiRawFinding = usgsFindings.find((f) =>
    f.findingId.endsWith('usgs_tsunami_flag')
  );
  assert.ok(tsunamiRawFinding);
  const tsunamiRawElig = evaluateFindingTransferEligibility(tsunamiRawFinding, {
    activeEvent: event,
    primer,
    source: usgsSrc,
  });
  assert.equal(tsunamiRawElig.eligible, false);
  assert.equal(tsunamiRawElig.mapping.supported, false);
});

// =============================================================================
// 3. NONMATCHING / AMBIGUOUS BLOCKING & SUPPORTED EVENT-MATCH RESOLUTION
// =============================================================================

test('3. Nonmatching-event is permanently blocked; ambiguous-match requires documented rationale & evidence; probable-match never promotes', () => {
  const event = makeBoholEvent();
  const primer = makeDraftPrimer(event);

  const nonMatchDetails = evaluateResearchEventMatch(
    {
      originTimeUtc: '2019-04-22T09:11:11.000Z',
      lat: 14.9,
      lon: 120.4,
      depthKm: 10,
      magnitude: 6.1,
      magnitudeType: 'Ms',
    },
    event
  );
  assert.equal(nonMatchDetails.state, 'nonmatching-event');
  const nonMatchSrc = makeSourceRecord(event, {
    sourceId: 'src_nonmatch',
    eventMatchState: 'nonmatching-event',
    eventMatchDetails: nonMatchDetails,
  });
  assert.throws(() =>
    documentEventMatchResolution(nonMatchSrc, event, {
      rationale: 'Attempt override',
      supportingEvidence: 'Attempt quote',
    })
  );

  // Ambiguous match
  const ambigDetails = evaluateResearchEventMatch(
    {
      originTimeUtc: '2013-10-15T00:30:00.000Z',
      lat: 10.35,
      lon: 124.25,
      depthKm: 12,
      magnitude: 6.4,
      magnitudeType: 'mb',
    },
    event
  );
  assert.equal(ambigDetails.state, 'ambiguous-match');
  const ambigSrc = makeSourceRecord(event, {
    sourceId: 'src_ambig',
    eventMatchState: 'ambiguous-match',
    eventMatchDetails: ambigDetails,
  });
  const ambigFinding = createManualCandidateFinding({
    source: ambigSrc,
    category: 'liquefaction-deformation',
    epistemicBasis: 'reported',
    findingTitle: 'Lateral spreading near Abatan River',
    extractedStatement:
      'Field investigation confirms landslides and rockfalls along steep limestone slopes in Loon and Carmen, Bohol.',
    evidencePassage:
      'Field investigation confirms landslides and rockfalls along steep limestone slopes in Loon and Carmen, Bohol.',
  });

  const beforeResolve = evaluateFindingTransferEligibility(ambigFinding, {
    activeEvent: event,
    primer,
    source: ambigSrc,
  });
  assert.equal(beforeResolve.eligible, false);
  assert.ok(
    beforeResolve.blockers.some((b) => b.code === 'event-match-unresolved')
  );

  // Missing rationale/evidence throws
  assert.throws(() =>
    documentEventMatchResolution(ambigSrc, event, {
      rationale: '',
      supportingEvidence: 'quote',
    })
  );

  const resolvedSrc = documentEventMatchResolution(ambigSrc, event, {
    rationale:
      'Bulletin timestamp and Bohol province header confirm this is the 2013-10-15 mainshock.',
    supportingEvidence: 'PHIVOLCS Earthquake Information No. 2',
    operatorLabel: 'J. Santos',
  });
  // Original automated match state is preserved!
  assert.equal(resolvedSrc.eventMatchState, 'ambiguous-match');
  const afterResolve = evaluateFindingTransferEligibility(ambigFinding, {
    activeEvent: event,
    primer,
    source: resolvedSrc,
  });
  assert.equal(afterResolve.eligible, true);
  // Cannot be promoted to verified-fact when original match wasn't confirmed-id-match
  assert.equal(afterResolve.canClassifyAsVerifiedFact, false);

  // Probable-match cannot silently promote
  const probableDetails = evaluateResearchEventMatch(
    {
      originTimeUtc: '2013-10-15T00:12:35.000Z',
      lat: 9.89,
      lon: 124.12,
      depthKm: 12.0,
      magnitude: 7.2,
      magnitudeType: 'Ms',
    },
    event
  );
  assert.equal(probableDetails.state, 'probable-match');
  const probableSrc = makeSourceRecord(event, {
    sourceId: 'src_probable',
    eventMatchState: 'probable-match',
    eventMatchDetails: probableDetails,
  });
  assert.throws(() =>
    documentEventMatchResolution(probableSrc, event, {
      rationale: 'Promote to confirmed',
      supportingEvidence: 'quote',
    })
  );
});

// =============================================================================
// 4. UNRESOLVED EVIDENCE & SCANNED-NO-TEXT HANDLING
// =============================================================================

test('4. Unresolved-evidence findings are blocked from transfer and verified-fact promotion', () => {
  const event = makeBoholEvent();
  const primer = makeDraftPrimer(event);
  const src = makeSourceRecord(event);

  const unverifiedQuoteFinding = createManualCandidateFinding({
    source: src,
    category: 'structural-infrastructure',
    epistemicBasis: 'reported',
    findingTitle: 'Church facade collapse',
    extractedStatement: 'Baclayon Church bell tower suffered partial collapse.',
    evidencePassage: 'This quote does not exist anywhere in source extractedText.',
  });
  assert.equal(
    unverifiedQuoteFinding.evidenceValidationStatus,
    'evidence-unresolved'
  );

  const elig = evaluateFindingTransferEligibility(unverifiedQuoteFinding, {
    activeEvent: event,
    primer,
    source: src,
  });
  assert.equal(elig.eligible, false);
  assert.equal(elig.canClassifyAsVerifiedFact, false);
  assert.ok(elig.blockers.some((b) => b.code === 'evidence-unresolved'));
});

// =============================================================================
// 5 & 6. OVERWRITE PROTECTION + EXPLICIT REPLACEMENT + HISTORICAL PRESERVATION
// =============================================================================

test('5 & 6. Existing Stage 4 verified content cannot be overwritten without explicit confirmation & reason; historical tsunami advisories preserved in notes', () => {
  const event = makeBoholEvent();
  const primer = makeDraftPrimer(event);
  const text1 =
    'Tsunami Advisory No. 1 issued at 00:20 PST: Minor sea-level disturbance watch for Bohol and Cebu coastal areas.';
  const text2 =
    'Final Tsunami Advisory No. 2 cancelled at 02:15 PST: NO destructive tsunami threat exists based on sea-level gauges.';
  const src1 = makeSourceRecord(event, {
    sourceId: 'src_tsu_1',
    duplicateGroupKey: 'tsu_1',
    extractedText: text1,
    contentSha256: crypto.createHash('sha256').update(text1).digest('hex'),
  });
  const src2 = makeSourceRecord(event, {
    sourceId: 'src_tsu_2',
    duplicateGroupKey: 'tsu_2',
    extractedText: text2,
    contentSha256: crypto.createHash('sha256').update(text2).digest('hex'),
  });

  const f1 = createManualCandidateFinding({
    source: src1,
    category: 'tsunami-sea-level',
    epistemicBasis: 'reported',
    findingTitle: 'Initial Tsunami Watch',
    extractedStatement: text1,
    evidencePassage: text1,
  });
  const f2 = createManualCandidateFinding({
    source: src2,
    category: 'tsunami-sea-level',
    epistemicBasis: 'reported',
    findingTitle: 'Final Tsunami Cancellation',
    extractedStatement: text2,
    evidencePassage: text2,
  });

  const firstApply = applyReviewedScientificFindingToPrimer({
    activeEvent: event,
    primer,
    finding: f1,
    source: src1,
    operatorConfirmedTransfer: true,
    appliedAsState: 'verified-fact',
    operatorConfirmedVerifiedFact: true,
  });
  assert.equal(firstApply.ok, true);
  assert.equal(
    firstApply.updatedPrimer.extensions?.scientificNarrativePackage?.externalData
      .tsunami.state,
    'official-warning-or-advisory'
  );

  // Attempt replace WITHOUT confirmation -> blocked!
  const blockedReplace = applyReviewedScientificFindingToPrimer({
    activeEvent: event,
    primer: firstApply.updatedPrimer,
    finding: f2,
    source: src2,
    operatorConfirmedTransfer: true,
    resolutionMode: 'replace-with-confirmation',
    operatorConfirmedOverwrite: false,
    overwriteReason: '',
  });
  assert.equal(blockedReplace.ok, false);
  assert.equal(blockedReplace.code, 'blocked-overwrite-confirmation');

  // Preview highlights existing content and requires confirmation
  const preview = buildFindingTransferPreview(
    f2,
    {
      activeEvent: event,
      primer: firstApply.updatedPrimer,
      source: src2,
    },
    'replace-with-confirmation'
  );
  assert.equal(preview.hasExistingDestinationContent, true);
  assert.equal(preview.isExistingDestinationVerified, true);
  assert.equal(preview.requiresOverwriteConfirmation, true);

  // Confirmed replace with reason -> succeeds AND preserves historical advisory ID in notes
  const replaced = applyReviewedScientificFindingToPrimer({
    activeEvent: event,
    primer: firstApply.updatedPrimer,
    finding: f2,
    source: src2,
    operatorConfirmedTransfer: true,
    resolutionMode: 'replace-with-confirmation',
    operatorConfirmedOverwrite: true,
    overwriteReason: 'Official cancellation supersedes initial watch bulletin.',
    appliedAsState: 'verified-fact',
    operatorConfirmedVerifiedFact: true,
  });
  assert.equal(replaced.ok, true);
  const nextTsunami =
    replaced.updatedPrimer.extensions?.scientificNarrativePackage?.externalData
      .tsunami;
  assert.equal(nextTsunami?.state, 'official-no-tsunami');
  assert.match(nextTsunami?.notes ?? '', /Historical Prior Advisory Preserved/i);
  assert.match(nextTsunami?.notes ?? '', /Advisory 1|Tsunami/i);
});

// =============================================================================
// 7. DUPLICATE TRANSFER PREVENTION
// =============================================================================

test('7. Duplicate transfer of same findingId + sourceId + sourceVersionNumber is blocked', () => {
  const event = makeBoholEvent();
  const primer = makeDraftPrimer(event);
  const src = makeSourceRecord(event);
  const finding = createManualCandidateFinding({
    source: src,
    category: 'volcano-monitoring',
    epistemicBasis: 'reported',
    findingTitle: 'Mayon and Bulusan background quiet',
    extractedStatement:
      'Field investigation confirms landslides and rockfalls along steep limestone slopes in Loon and Carmen, Bohol.',
    evidencePassage:
      'Field investigation confirms landslides and rockfalls along steep limestone slopes in Loon and Carmen, Bohol.',
  });

  const first = applyReviewedScientificFindingToPrimer({
    activeEvent: event,
    primer,
    finding,
    source: src,
    operatorConfirmedTransfer: true,
  });
  assert.equal(first.ok, true);

  const dupElig = evaluateFindingTransferEligibility(finding, {
    activeEvent: event,
    primer: first.updatedPrimer,
    source: src,
  });
  assert.equal(dupElig.eligible, false);
  assert.equal(dupElig.duplicateAlreadyApplied, true);
  assert.equal(dupElig.statusBucket, 'already-applied');

  const dupApply = applyReviewedScientificFindingToPrimer({
    activeEvent: event,
    primer: first.updatedPrimer,
    finding,
    source: src,
    operatorConfirmedTransfer: true,
  });
  assert.equal(dupApply.ok, false);
  assert.equal(dupApply.code, 'blocked-duplicate');
});

// =============================================================================
// 8. ORIGINAL UNITS & MAGNITUDE SCALE PRESERVATION
// =============================================================================

test('8. Original units, magnitude scale, and epistemic qualifiers are preserved in provenance and summaries', () => {
  const event = makeBoholEvent();
  const primer = makeDraftPrimer(event);
  const text =
    'East Bohol Fault coastal uplift measured 1.2 m along Maribojoc shoreline; USGS W-phase moment magnitude Mww 7.1 differs from PHIVOLCS Ms 7.2 scale.';
  const src = makeSourceRecord(event, {
    extractedText: text,
    contentSha256: crypto.createHash('sha256').update(text).digest('hex'),
  });
  const finding = createManualCandidateFinding({
    source: src,
    category: 'tectonic-generators',
    epistemicBasis: 'measured',
    findingTitle: 'Coastal uplift near Maribojoc',
    extractedStatement: text,
    evidencePassage: text,
    originalValue: '1.2',
    originalUnits: 'm',
  });

  const preview = buildFindingTransferPreview(finding, {
    activeEvent: event,
    primer,
    source: src,
  });
  assert.match(preview.proposedFieldSummary, /1\.2 m/);
  assert.match(preview.proposedFieldSummary, /\[measured\]/);

  const applied = applyReviewedScientificFindingToPrimer({
    activeEvent: event,
    primer,
    finding,
    source: src,
    operatorConfirmedTransfer: true,
  });
  assert.equal(applied.ok, true);
  assert.equal(applied.transferLink?.originalValue, '1.2');
  assert.equal(applied.transferLink?.originalUnits, 'm');
  assert.doesNotMatch(
    applied.updatedPrimer.extensions?.scientificNarrativePackage?.externalData
      .tectonic.expertInterpretation ?? '',
    /Mww\s*=\s*Ms/i
  );
});

// =============================================================================
// 9 & 10. EDITED NARRATIVE PRESERVATION, EXPLICIT SYNC & STAGE 4 REFRESH
// =============================================================================

test('9 & 10. Edited PrimerSection (isEdited=true) prose is never silently overwritten; explicit Sync to Section updates prose with audit log', () => {
  const event = makeBoholEvent();
  const basePrimer = makeDraftPrimer(event);
  const customEditedText = 'MANUAL OPERATOR PROSE — DO NOT OVERWRITE SILENTLY.';
  const primer: PrimerDocument = {
    ...basePrimer,
    sections: basePrimer.sections.map((s) =>
      s.id === 'hazards'
        ? { ...s, content: customEditedText, isEdited: true }
        : s
    ),
  };
  const beforeFp = primer.extensions?.scientificNarrativePackage?.inputFingerprint;

  const src = makeSourceRecord(event);
  const finding = createManualCandidateFinding({
    source: src,
    category: 'landslides-rockfalls',
    epistemicBasis: 'reported',
    findingTitle: 'Carmen limestone rockfalls',
    extractedStatement:
      'Field investigation confirms landslides and rockfalls along steep limestone slopes in Loon and Carmen, Bohol.',
    evidencePassage:
      'Field investigation confirms landslides and rockfalls along steep limestone slopes in Loon and Carmen, Bohol.',
  });

  const applied = applyReviewedScientificFindingToPrimer({
    activeEvent: event,
    primer,
    finding,
    source: src,
    operatorConfirmedTransfer: true,
  });
  assert.equal(applied.ok, true);

  // Stage 4 fingerprint refreshed & edited section preserved!
  const afterFp =
    applied.updatedPrimer.extensions?.scientificNarrativePackage?.inputFingerprint;
  assert.notEqual(beforeFp, afterFp);
  const hazardsSec = applied.updatedPrimer.sections.find(
    (s) => s.id === 'hazards'
  );
  assert.equal(hazardsSec?.content, customEditedText);
  assert.equal(hazardsSec?.isEdited, true);
  assert.ok(applied.editedSectionsPreserved.includes('hazards'));
  assert.ok(applied.sectionsNeedingSync.includes('hazards'));
  assert.match(hazardsSec?.autoGeneratedBaseline ?? '', /Loon and Carmen, Bohol/);

  // Explicit Sync requires operatorConfirmed=true
  const unconfirmedSync = syncStage4NarrativeToEditedSection({
    primer: applied.updatedPrimer,
    sectionId: 'hazards',
    operatorConfirmed: false,
  });
  assert.equal(unconfirmedSync.ok, false);

  const synced = syncStage4NarrativeToEditedSection({
    primer: applied.updatedPrimer,
    sectionId: 'hazards',
    operatorConfirmed: true,
    operatorLabel: 'Editor Lead',
  });
  assert.equal(synced.ok, true);
  assert.equal(synced.auditRecord?.action, 'section-synced');
  const syncedHazards = synced.updatedPrimer.sections.find(
    (s) => s.id === 'hazards'
  );
  assert.match(syncedHazards?.content ?? '', /Loon and Carmen, Bohol/);
  assert.equal(syncedHazards?.isEdited, false);
});

// =============================================================================
// 11 & 12. STAGE 6A REVISION DRIFT + STAGE 6B REVIEW INVALIDATION + FROZEN SNAPSHOT PROTECTION
// =============================================================================

test('11 & 12. R3 transfers trigger Stage 6A source-drift detection and Stage 6B review invalidation while frozen revisions remain immutable', () => {
  const event = makeBoholEvent();
  const primer = makeDraftPrimer(event);
  const revResult = createPrimerRevisionRecord(primer, {
    description: 'Initial baseline for review',
  });
  const rev = revResult.revision;
  const review = {
    ...createPrimerReviewRecord(rev, {
      reviewerLabel: 'Dr. Reviewer',
      reviewScope: 'Scientific check',
    }),
    status: 'review-notes-complete-unverified-identity' as const,
  };

  // 12. Frozen snapshot refuses transfer & sync
  const src = makeSourceRecord(event);
  const finding = createManualCandidateFinding({
    source: src,
    category: 'phivolcs-monitoring-qrt',
    epistemicBasis: 'reported',
    findingTitle: 'QRT deployment to Bohol',
    extractedStatement:
      'Field investigation confirms landslides and rockfalls along steep limestone slopes in Loon and Carmen, Bohol.',
    evidencePassage:
      'Field investigation confirms landslides and rockfalls along steep limestone slopes in Loon and Carmen, Bohol.',
  });

  const frozenResult = applyReviewedScientificFindingToPrimer({
    activeEvent: event,
    primer: rev.snapshot,
    finding,
    source: src,
    operatorConfirmedTransfer: true,
  });
  assert.equal(frozenResult.ok, false);
  assert.equal(frozenResult.code, 'blocked-frozen-snapshot');

  const frozenElig = evaluateFindingTransferEligibility(finding, {
    activeEvent: event,
    primer: rev.snapshot,
    source: src,
    isFrozenRevision: true,
  });
  assert.equal(frozenElig.eligible, false);
  assert.ok(
    frozenElig.blockers.some((b) => b.code === 'frozen-revision-immutable')
  );

  // 11. Transfer on working draft flags Stage 6A drift & Stage 6B invalidation
  const applied = applyReviewedScientificFindingToPrimer({
    activeEvent: event,
    primer,
    finding,
    source: src,
    operatorConfirmedTransfer: true,
  });
  assert.equal(applied.ok, true);

  const livePkg4 = applied.updatedPrimer.extensions?.scientificNarrativePackage;
  const sourceDiff = detectPrimerSourceChanges(rev, {
    event,
    primaryLocationLabel: 'Sagbayan, Bohol',
    faultGeneratorLabel: 'East Bohol Fault (nearby mapped structure)',
    currentStage4Fingerprint: livePkg4?.inputFingerprint,
    liveExternalData: livePkg4?.externalData,
  });
  assert.equal(sourceDiff.hasSourceChanges, true);
  assert.ok(sourceDiff.changes.length > 0);

  const validity = evaluatePrimerReviewValidity(review, rev, [rev], {
    event,
    primaryLocationLabel: 'Sagbayan, Bohol',
    faultGeneratorLabel: 'East Bohol Fault (nearby mapped structure)',
    currentStage4Fingerprint: livePkg4?.inputFingerprint,
    liveExternalData: livePkg4?.externalData,
  });
  assert.equal(validity.validityState, 'outdated-source-drift');
  assert.equal(validity.shouldInvalidateCompletedStatus, true);
});

// =============================================================================
// 13. OFFLINE / GEMINI-ABSENT EXECUTION
// =============================================================================

test('13. Complete R3 evaluation, preview, transfer, and audit flow succeeds 100% offline with GEMINI_API_KEY absent', async () => {
  const prevKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const event = makeBoholEvent();
    const primer = makeDraftPrimer(event);
    const src = makeSourceRecord(event, {
      sourceCategory: 'monitoring-response',
      extractedText:
        'PHIVOLCS Quick Response Team deployed portable accelerometers across Tagbilaran and Loon. Inter-agency coordination with NDRRMC active.',
      contentSha256: crypto
        .createHash('sha256')
        .update(
          'PHIVOLCS Quick Response Team deployed portable accelerometers across Tagbilaran and Loon. Inter-agency coordination with NDRRMC active.'
        )
        .digest('hex'),
    });
    const finding = createManualCandidateFinding({
      source: src,
      category: 'agency-coordination',
      epistemicBasis: 'reported',
      findingTitle: 'NDRRMC Coordination Active',
      extractedStatement: 'Inter-agency coordination with NDRRMC active.',
      evidencePassage: 'Inter-agency coordination with NDRRMC active.',
    });

    const applied = applyReviewedScientificFindingToPrimer({
      activeEvent: event,
      primer,
      finding,
      source: src,
      operatorConfirmedTransfer: true,
    });
    assert.equal(applied.ok, true);
    assert.match(
      applied.updatedPrimer.extensions?.scientificNarrativePackage?.externalData
        .monitoringResponse?.lguAgencyCoordination ?? '',
      /NDRRMC/
    );
  } finally {
    if (prevKey !== undefined) {
      process.env.GEMINI_API_KEY = prevKey;
    }
  }
});

// =============================================================================
// 14. NO CORE EQP/R1/R2 MUTATION + XSS SANITIZATION + PROTOTYPE POLLUTION DEFENSE
// =============================================================================

test('14. R3 transfer never mutates EQPEvent, R1 source, or R2 finding, and audit import blocks XSS & prototype pollution', () => {
  const event = makeBoholEvent();
  const eventSnapshot = JSON.stringify(event);
  const primer = makeDraftPrimer(event);
  const cleanAdvisory =
    'Avoid compromised concrete buildings until inspected by local engineers.';
  const src = makeSourceRecord(event, {
    extractedText: cleanAdvisory,
    contentSha256: crypto
      .createHash('sha256')
      .update(cleanAdvisory)
      .digest('hex'),
  });
  const srcSnapshot = JSON.stringify(src);
  const finding = createManualCandidateFinding({
    source: src,
    category: 'public-safety-preparedness',
    epistemicBasis: 'reported',
    findingTitle: 'Structural Inspection Advisory',
    extractedStatement: `${cleanAdvisory} <script>alert("xss")</script>`,
    evidencePassage: cleanAdvisory,
  });
  const findingSnapshot = JSON.stringify(finding);

  const applied = applyReviewedScientificFindingToPrimer({
    activeEvent: event,
    primer,
    finding,
    source: src,
    operatorConfirmedTransfer: true,
    operatorLabel: 'Ed <script>alert(1)</script>',
  });
  assert.equal(applied.ok, true);
  assert.equal(JSON.stringify(event), eventSnapshot);
  assert.equal(JSON.stringify(src), srcSnapshot);
  assert.equal(JSON.stringify(finding), findingSnapshot);
  assert.doesNotMatch(
    applied.updatedPrimer.extensions?.scientificNarrativePackage?.externalData
      .eventSpecificPreparednessAdvisories ?? '',
    /<script/i
  );
  assert.doesNotMatch(applied.transferLink?.operatorLabel ?? '', /<script/i);

  // Import sanitization & prototype pollution guard
  const evilResult = validateAndImportTransferHistoryJson(
    '{"__proto__":{"polluted":true},"records":[]}'
  );
  assert.equal(evilResult.ok, false);

  const xssAudit = {
    ...applied.auditRecord!,
    notes: 'Suspicious <script>alert("xss")</script> note',
  };
  const goodResult = validateAndImportTransferHistoryJson(
    JSON.stringify({
      schemaVersion: '1.0',
      records: [xssAudit],
    })
  );
  assert.equal(goodResult.ok, true);
  if (goodResult.ok) {
    assert.equal(goodResult.records.length, 1);
    assert.equal(goodResult.records[0].isTamperProof, false);
    assert.doesNotMatch(goodResult.records[0].notes, /<script/i);
  }
});

// =============================================================================
// 15. NO INSTITUTIONAL APPROVAL OR PUBLIC PUBLICATION
// =============================================================================

test('15. Accepted local draft transfers NEVER mark PRIMER approved, verified-institutional, or ready for public release', () => {
  const event = makeBoholEvent();
  const primer = makeDraftPrimer(event);
  const src = makeSourceRecord(event);
  const finding = createManualCandidateFinding({
    source: src,
    category: 'public-safety-preparedness',
    epistemicBasis: 'reported',
    findingTitle: 'Coastal slope caution',
    extractedStatement:
      'Field investigation confirms landslides and rockfalls along steep limestone slopes in Loon and Carmen, Bohol.',
    evidencePassage:
      'Field investigation confirms landslides and rockfalls along steep limestone slopes in Loon and Carmen, Bohol.',
  });

  const applied = applyReviewedScientificFindingToPrimer({
    activeEvent: event,
    primer,
    finding,
    source: src,
    operatorConfirmedTransfer: true,
    appliedAsState: 'verified-fact',
    operatorConfirmedVerifiedFact: true,
  });
  assert.equal(applied.ok, true);
  assert.equal(applied.updatedPrimer.status, 'draft');
  assert.equal(applied.auditRecord?.identityStatus, 'UNVERIFIED_OPERATOR');
  assert.equal(applied.auditRecord?.isTamperProof, false);
  assert.match(R3_TRANSFER_APPROVAL_DISCLAIMER, /NOT formal institutional/i);
});

// =============================================================================
// 16 & 17. R4 REGRESSION TESTS: MULTI-VERSION TSUNAMI REPLACEMENT & ZIP R3 PROVENANCE
// =============================================================================

test('16. Multi-version tsunami advisory replacement (v1 -> v2 -> v3) chains replacedPriorTransferId to most recent transfer and archives prior states cleanly', () => {
  const event = makeBoholEvent();
  let primer = makeDraftPrimer(event);

  const mkTsunamiSource = (idx: number, text: string) =>
    makeSourceRecord(event, {
      sourceId: `src_tsu_chain_${idx}`,
      documentTitle: `PHIVOLCS Tsunami Information No. ${idx}`,
      sourceUrl: `https://www.phivolcs.dost.gov.ph/tsunami/${idx}`,
      extractedText: text,
      contentSha256: crypto.createHash('sha256').update(text).digest('hex'),
    });

  const s1 = mkTsunamiSource(
    1,
    'Tsunami Advisory No. 1 issued at 00:18 UTC: Sea-level disturbance watch for Bohol.'
  );
  const s2 = mkTsunamiSource(
    2,
    'Tsunami Advisory No. 2 issued at 01:05 UTC: Expanded coastal watch to Bohol and Cebu.'
  );
  const s3 = mkTsunamiSource(
    3,
    'Tsunami Advisory No. 3 Cancellation issued at 02:30 UTC: NO destructive tsunami threat exists; advisory cancelled.'
  );

  const f1 = createManualCandidateFinding({
    source: s1,
    category: 'tsunami-sea-level',
    epistemicBasis: 'reported',
    findingTitle: 'Tsunami Advisory No. 1',
    extractedStatement: 'Tsunami Advisory No. 1 issued: Sea-level disturbance watch for Bohol.',
    evidencePassage:
      'Tsunami Advisory No. 1 issued at 00:18 UTC: Sea-level disturbance watch for Bohol.',
    observationTimeRaw: '00:18',
    observationTimeZone: 'UTC',
  });
  const f2 = createManualCandidateFinding({
    source: s2,
    category: 'tsunami-sea-level',
    epistemicBasis: 'reported',
    findingTitle: 'Tsunami Advisory No. 2',
    extractedStatement: 'Tsunami Advisory No. 2 expanded coastal watch to Bohol and Cebu.',
    evidencePassage:
      'Tsunami Advisory No. 2 issued at 01:05 UTC: Expanded coastal watch to Bohol and Cebu.',
    observationTimeRaw: '01:05',
    observationTimeZone: 'UTC',
  });
  const f3 = createManualCandidateFinding({
    source: s3,
    category: 'tsunami-sea-level',
    epistemicBasis: 'reported',
    findingTitle: 'Tsunami Advisory No. 3 Cancellation',
    extractedStatement:
      'Tsunami Advisory No. 3 Cancellation: NO destructive tsunami threat exists; advisory cancelled.',
    evidencePassage:
      'Tsunami Advisory No. 3 Cancellation issued at 02:30 UTC: NO destructive tsunami threat exists; advisory cancelled.',
    observationTimeRaw: '02:30',
    observationTimeZone: 'UTC',
  });

  const r1 = applyReviewedScientificFindingToPrimer({
    activeEvent: event,
    primer,
    finding: f1,
    source: s1,
    operatorConfirmedTransfer: true,
    appliedAsState: 'verified-fact',
    operatorConfirmedVerifiedFact: true,
  });
  assert.equal(r1.ok, true);
  primer = r1.updatedPrimer;

  const r2 = applyReviewedScientificFindingToPrimer({
    activeEvent: event,
    primer,
    finding: f2,
    source: s2,
    operatorConfirmedTransfer: true,
    appliedAsState: 'verified-fact',
    operatorConfirmedVerifiedFact: true,
    resolutionMode: 'replace-with-confirmation',
    operatorConfirmedOverwrite: true,
    overwriteReason: 'Superseded by Advisory No. 2.',
  });
  assert.equal(r2.ok, true);
  assert.equal(r2.transferLink?.replacedPriorTransferId, r1.transferLink?.transferId);
  primer = r2.updatedPrimer;

  const r3 = applyReviewedScientificFindingToPrimer({
    activeEvent: event,
    primer,
    finding: f3,
    source: s3,
    operatorConfirmedTransfer: true,
    appliedAsState: 'verified-fact',
    operatorConfirmedVerifiedFact: true,
    resolutionMode: 'replace-with-confirmation',
    operatorConfirmedOverwrite: true,
    overwriteReason: 'Cancelled by Advisory No. 3.',
  });
  assert.equal(r3.ok, true);
  assert.equal(
    r3.transferLink?.replacedPriorTransferId,
    r2.transferLink?.transferId,
    'v3 must chain replacedPriorTransferId to v2 (most recent), not v1'
  );
  const tsu = r3.updatedPrimer.extensions?.scientificNarrativePackage?.externalData.tsunami;
  assert.equal(tsu?.state, 'official-no-tsunami');
  assert.equal(tsu?.officialAdvisoryId, 'Advisory 3');
  assert.match(tsu?.notes ?? '', /ID=Advisory 1/);
  assert.match(tsu?.notes ?? '', /ID=Advisory 2/);
});

test('17. Stage 6B ZIP export includes R3 transferred provenance records and discloses external R1 source library boundary while remaining importable', () => {
  const event = makeBoholEvent();
  const primer = makeDraftPrimer(event);
  const src = makeSourceRecord(event);
  const finding = createManualCandidateFinding({
    source: src,
    category: 'landslides-rockfalls',
    epistemicBasis: 'reported',
    findingTitle: 'Earthquake-induced landslides in Loon and Carmen',
    extractedStatement:
      'Field investigation confirms landslides and rockfalls along steep limestone slopes in Loon and Carmen, Bohol.',
    evidencePassage:
      'Field investigation confirms landslides and rockfalls along steep limestone slopes in Loon and Carmen, Bohol.',
  });

  const applied = applyReviewedScientificFindingToPrimer({
    activeEvent: event,
    primer,
    finding,
    source: src,
    operatorConfirmedTransfer: true,
  });
  assert.equal(applied.ok, true);

  const rev = createPrimerRevisionRecord(applied.updatedPrimer, {
    description: 'Rev with R3 landslide provenance',
  }).revision;
  const review = createPrimerReviewRecord(rev, {
    reviewerLabel: 'Dr. Reviewer',
    reviewScope: 'Provenance check',
  });
  const pubHtml = buildPrimerHtmlDocument(rev.snapshot, { mode: 'public-draft' });
  const sciHtml = buildPrimerHtmlDocument(rev.snapshot, { mode: 'scientific-review' });
  assert.equal(pubHtml.includes('Stage 4 Scientific Provenance &amp; Verification Ledger'), false);
  assert.equal(sciHtml.includes('Stage 4 Scientific Provenance &amp; Verification Ledger'), true);

  const built = buildPrimerReviewPackageZip({
    revision: rev,
    review,
    includeExports: true,
    generatePdfsSynchronously: true,
  });

  const imported = validateAndImportPrimerReviewPackageZip(built.zipBytes);
  assert.equal(imported.ok, true);

  const decoded = decodeAndValidateStoredZip(built.zipBytes);
  assert.equal(decoded.ok, true);
  if (decoded.ok) {
    const ledgerRaw = new TextDecoder('utf-8').decode(
      decoded.entries.get('provenance/scientific-provenance-ledger.json')!.bytes
    );
    const ledger = JSON.parse(ledgerRaw) as { r3TransferredSources?: Array<{ evidencePassageQuote: string }> };
    assert.ok(Array.isArray(ledger.r3TransferredSources) && ledger.r3TransferredSources.length === 1);
    assert.match(ledger.r3TransferredSources[0].evidencePassageQuote, /Loon and Carmen, Bohol/);

    const readmeRaw = new TextDecoder('utf-8').decode(
      decoded.entries.get('README_REVIEW_NOTICE.txt')!.bytes
    );
    assert.match(readmeRaw, /eqp_primer_research_sources_v1/);
    assert.match(readmeRaw, /outside this ZIP/i);
  }
});

