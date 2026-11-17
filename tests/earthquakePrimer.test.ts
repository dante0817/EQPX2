import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_EVENTS, type EQPEvent } from '../src/data/eqpData';
import {
  buildPrimerHtmlDocument,
  buildPrimerPdfDocument,
  clearAutoDraftSuppressionForEventId,
  DEFAULT_PRIMER_ELIGIBILITY_RULES,
  evaluatePrimerEligibility,
  extractVerifiedPrimerParameters,
  generateInitialEarthquakePrimer,
  loadSavedPrimerDrafts,
  maybeAutoCreatePrimerDraft,
  savePrimerDraftToStorage,
  suppressAutoDraftForEvent,
  updatePrimerEpicenterFigure,
  updatePrimerPresentationConfig,
  updatePrimerSequenceHistoricalAnalysis,
  updatePrimerStage4Narratives,
} from '../src/utils/earthquakePrimer';
import {
  computePrimerEventFingerprint,
  DEFAULT_PRIMER_MAP_LAYERS,
  generatePrimerEpicenterFigure,
} from '../src/utils/primerMapFigure';
import {
  assignPrimerFigureNumbers,
  buildPrimerExportFilename,
  buildPrimerReferenceList,
  computePrimerReadinessSummary,
} from '../src/utils/primerPresentation';
import { validateAndMergeLocalCatalog } from '../src/utils/primerCatalogAdapters';
import { buildPrimerStage3Package } from '../src/utils/primerSequenceIntegration';
import {
  buildPrimerStage4Narratives,
  computeStage4InputFingerprint,
  createDefaultStage4ExternalData,
  STAGE4_TEMPLATE_VERSION,
} from '../src/utils/primerScientificNarratives';

test('extractVerifiedPrimerParameters extracts verified fields only and excludes draft/conflicting intensities', () => {
  const base = structuredClone(INITIAL_EVENTS[0]);
  base.intensities = [
    {
      id: 'v1',
      peis: 'IV',
      locality: 'San Julian, Eastern Samar',
      reviewStatus: 'verified',
    },
    {
      id: 'd1',
      peis: 'V',
      locality: 'Sulatan, Eastern Samar',
      reviewStatus: 'draft',
    },
  ];

  const extracted = extractVerifiedPrimerParameters(base);
  assert.equal(extracted.eventId, base.id);
  assert.equal(extracted.isLocated, true);
  assert.equal(extracted.magnitudeScale, null);
  assert.equal(extracted.magnitudeValue, null); // ms === 0.0 on INITIAL_EVENTS[0]
  assert.equal(extracted.verifiedFeltCount, 1);
  assert.equal(extracted.unverifiedIntensityCount, 1);
  assert.equal(extracted.maxVerifiedPeis, 'IV');
  assert.match(extracted.verifiedIntensityText, /San Julian/);
  assert.doesNotMatch(extracted.verifiedIntensityText, /Sulatan/);
});

test('generateInitialEarthquakePrimer produces 7 structured draft sections without mutating input event', () => {
  const sourceEvent: EQPEvent = structuredClone(INITIAL_EVENTS[2]); // Ms 5.1 Surigao del Norte
  const snapshotBefore = JSON.stringify(sourceEvent);

  const primer = generateInitialEarthquakePrimer(sourceEvent, {
    trigger: 'manual',
    rules: DEFAULT_PRIMER_ELIGIBILITY_RULES,
  });

  // Never mutates input event and never auto-publishes
  assert.equal(JSON.stringify(sourceEvent), snapshotBefore);
  assert.equal(primer.status, 'draft');
  assert.equal(primer.sections.length, 7);
  assert.deepEqual(
    primer.sections.map((s) => s.id),
    [
      'overview',
      'location',
      'aftershocks',
      'intensity',
      'tectonic_setting',
      'hazards',
      'recommendations',
    ]
  );

  const aftershocksSection = primer.sections.find((s) => s.id === 'aftershocks');
  assert.ok(aftershocksSection);
  assert.equal(aftershocksSection.reviewStatus, 'requires-info');
  assert.match(aftershocksSection.content, /REQUIRES INFORMATION/);

  const html = buildPrimerHtmlDocument(primer);
  assert.match(html, /DRAFT EARTHQUAKE PRIMER/);
  assert.match(html, /Earthquake Overview/);
  assert.match(html, /Aftershocks/);
  assert.match(html, /Recommendations/);
});

test('evaluatePrimerEligibility enforces configurable thresholds while manual generation succeeds at any magnitude', () => {
  const smallEvent = structuredClone(INITIAL_EVENTS[1]); // Ms 4.2 Cavite

  const defaultEval = evaluatePrimerEligibility(smallEvent, DEFAULT_PRIMER_ELIGIBILITY_RULES);
  assert.equal(defaultEval.eligible, false);

  const customRuleEval = evaluatePrimerEligibility(smallEvent, {
    enabled: true,
    minMagnitude: 4.0,
    requireLocated: true,
    minPeisTrigger: 'V',
  });
  assert.equal(customRuleEval.eligible, true);

  // Manual generation still creates a valid draft even when below auto-draft threshold
  const manualDraft = generateInitialEarthquakePrimer(smallEvent, {
    trigger: 'manual',
    rules: DEFAULT_PRIMER_ELIGIBILITY_RULES,
  });
  assert.equal(manualDraft.status, 'draft');
  assert.equal(manualDraft.eligibilitySnapshot.eligible, false);
  assert.equal(manualDraft.sections.length, 7);
});

test('Stage 2: generatePrimerEpicenterFigure creates SVG map with provenance, scale bar, and non-causal disclaimer without mutating event', () => {
  const sourceEvent: EQPEvent = structuredClone(INITIAL_EVENTS[2]);
  const snapshotBefore = JSON.stringify(sourceEvent);

  const fig = generatePrimerEpicenterFigure(sourceEvent, {
    primaryLocationLabel: '015 km N 75° E of Burgos (Surigao del Norte)',
    nearestCitiesPins: [
      { name: 'Surigao City', lat: 9.78, lon: 125.49, distanceKm: 38, bearing: 'S 42° W' },
    ],
  });

  assert.equal(JSON.stringify(sourceEvent), snapshotBefore);
  assert.equal(fig.status, 'ready');
  assert.ok(fig.scaleBarKm && fig.scaleBarKm > 0);
  assert.match(fig.svgMarkup, /<svg /);
  assert.match(fig.svgMarkup, /EPICENTER &amp; GEOGRAPHIC CONTEXT MAP/);
  assert.match(fig.svgMarkup, /Surigao City/);
  assert.match(
    fig.provenance.nonCausalDisclaimer,
    /proximity to mapped faults or trenches does not confirm earthquake causation/i
  );
  assert.equal(
    fig.provenance.sourceEventFingerprint,
    computePrimerEventFingerprint(sourceEvent, {
      primaryLocationLabel: '015 km N 75° E of Burgos (Surigao del Norte)',
    })
  );
});

test('Stage 2: missing or unlocated coordinates return unavailable figure instead of fabricated location', () => {
  const unlocated: EQPEvent = {
    ...structuredClone(INITIAL_EVENTS[0]),
    iterations: 0,
    lat: 0,
    lon: 0,
  };
  const fig = generatePrimerEpicenterFigure(unlocated);
  assert.equal(fig.status, 'unavailable');
  assert.equal(fig.reviewStatus, 'requires-info');
  assert.equal(fig.provenance.sourceSolutionStatus, 'unlocated');
  assert.equal(fig.svgMarkup, '');
  assert.match(fig.unavailableReason ?? '', /unlocated or invalid/i);

  const primer = generateInitialEarthquakePrimer(unlocated, { trigger: 'manual' });
  const html = buildPrimerHtmlDocument(primer);
  assert.match(html, /Epicenter &amp; Geographic Context Map Unavailable/);
});

test('Stage 2: stale PLOT status & GIS EPSG:4253 trench layer gating flag provenance properly and preserve edited sections', () => {
  const event = structuredClone(INITIAL_EVENTS[2]);
  const primer = generateInitialEarthquakePrimer(event, { trigger: 'manual' });

  const editedOverview = 'Duty seismologist verified custom overview paragraph.';
  primer.sections[0] = {
    ...primer.sections[0],
    content: editedOverview,
    isEdited: true,
  };

  const refreshed = updatePrimerEpicenterFigure(primer, event, {
    isPlotResultStale: true,
    layers: { trenchSystemsGis: true },
  });

  assert.equal(refreshed.sections[0].content, editedOverview);
  assert.equal(refreshed.sections[0].isEdited, true);

  const fig = refreshed.extensions?.epicenterFigure;
  assert.ok(fig);
  assert.equal(fig.provenance.sourceSolutionStatus, 'stale');
  assert.equal(fig.reviewStatus, 'requires-scientific-review');
  assert.match(fig.svgMarkup, /STALE SOURCE SOLUTION/);
  assert.ok(
    fig.provenance.unavailableLayers.some((l) => /EPSG:4253/i.test(l.reason))
  );

  const html = buildPrimerHtmlDocument(refreshed);
  assert.match(html, /<figure /);
  assert.match(html, /STALE FIGURE WARNING/);
  assert.match(html, /Duty seismologist verified custom overview paragraph\./);

  const { doc, filename } = buildPrimerPdfDocument(refreshed);
  assert.match(filename, /_DRAFT\.pdf$/);
  const pdfBytes = doc.output('arraybuffer');
  assert.ok(pdfBytes.byteLength > 2000);
});

test('Stage 3: validated CSV/GeoJSON catalog merge preserves IDs/scales and deduplicates across sources', () => {
  const csvSample = [
    'eventId,time,latitude,longitude,depth,magnitude,magType,source,place',
    'CAT-REF-MATCH,2026-10-08T10:15:30Z,9.86,126.18,12,5.1,Ms,PHIVOLCS-CSV,Surigao del Norte',
    'CAT-AFT-01,2026-10-08T12:00:00Z,9.90,126.22,10,3.8,Ml,PHIVOLCS-CSV,Near Burgos',
    'CAT-BAD-ROW,not-a-date,9.90,126.22,10,3.8,Ml,PHIVOLCS-CSV,Bad row',
  ].join('\n');

  const firstImport = validateAndMergeLocalCatalog({
    content: csvSample,
    format: 'csv',
    existingRecords: [],
    existingCatalogVersion: 0,
    defaultSource: 'PHIVOLCS-CSV',
    catalogVersionLabel: 'v1',
  });

  assert.equal(firstImport.lastImportAudit?.parsedCount, 2);
  assert.equal(firstImport.lastImportAudit?.rejections.length, 1);
  assert.equal(firstImport.records.length, 2);

  // Uncertain duplicate via GeoJSON near CAT-AFT-01 with slight time/loc offset
  const geoJsonSample = JSON.stringify({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        id: 'USGS-AFT-01',
        properties: {
          time: Date.parse('2026-10-08T12:00:18Z'),
          mag: 3.9,
          magType: 'Mw',
          place: 'Surigao Offshore',
        },
        geometry: {
          type: 'Point',
          coordinates: [126.25, 9.93, 14],
        },
      },
    ],
  });

  const secondImport = validateAndMergeLocalCatalog({
    content: geoJsonSample,
    format: 'geojson',
    existingRecords: firstImport.records,
    existingCatalogVersion: firstImport.catalogVersion,
    defaultSource: 'USGS-GeoJSON',
    catalogVersionLabel: 'v2',
  });

  assert.equal(secondImport.lastImportAudit?.parsedCount, 1);
  assert.equal(secondImport.records.length, 3);
  assert.ok(secondImport.coverage.magnitudeTypes.some((m) => m.magType === 'Ml'));
  assert.ok(secondImport.coverage.magnitudeTypes.some((m) => m.magType === 'Mw'));
});

test('Stage 3: buildPrimerStage3Package excludes reference event, separates scales, and tracks candidate vs reviewed membership', () => {
  const refEvent = structuredClone(INITIAL_EVENTS[2]); // 2026-10-08T10:15:30Z, 9.86N, 126.18E, Ms 5.1
  const snapshotBefore = JSON.stringify(refEvent);
  const refMs = Date.parse(`${refEvent.originDateGmt}T${refEvent.originTimeGmt}Z`);

  const catalogCsv = [
    'eventId,time,latitude,longitude,depth,magnitude,magType,source,place',
    // Exact same event ID / reference time (must be excluded from post-event count)
    `${refEvent.id},${new Date(refMs).toISOString()},${refEvent.lat},${refEvent.lon},${refEvent.depthKm},5.1,Ms,PHIVOLCS,Ref Match`,
    // Pre-event (2 days before)
    `PRE-01,${new Date(refMs - 2 * 86_400_000).toISOString()},9.84,126.15,15,3.4,Ml,PHIVOLCS,Pre-event`,
    // Historical (12 years before, M 6.2)
    `HIST-2014,${new Date(refMs - 12 * 365.25 * 86_400_000).toISOString()},9.95,126.30,18,6.2,Mw,PHIVOLCS-HIST,Historical Mindanao`,
    // Post-event +2h Ml 3.7
    `AFT-01,${new Date(refMs + 2 * 3_600_000).toISOString()},9.91,126.20,11,3.7,Ml,PHIVOLCS,Post +2h`,
    // Post-event +30h Mw 4.4 (mixed scale relative to Ml)
    `AFT-02,${new Date(refMs + 30 * 3_600_000).toISOString()},9.93,126.25,,4.4,Mw,USGS,Post +30h Missing Depth`,
    // Far-field outside 100 km radius (>300 km away)
    `FAR-01,${new Date(refMs + 5 * 3_600_000).toISOString()},13.50,124.00,20,4.8,Mw,USGS,Far Event`,
  ].join('\n');

  const catSnap = validateAndMergeLocalCatalog({
    content: catalogCsv,
    format: 'csv',
    existingRecords: [],
    existingCatalogVersion: 1,
    defaultSource: 'Test Catalog',
  });

  // Unreviewed candidate window
  const candidatePkg = buildPrimerStage3Package({
    event: refEvent,
    catalog: catSnap.records,
    catalogVersion: catSnap.catalogVersion,
    sourceLabel: catSnap.sourceLabel,
    config: {
      dataCutoffUtc: new Date(refMs + 10 * 86_400_000).toISOString(),
    },
  });

  assert.equal(JSON.stringify(refEvent), snapshotBefore);
  assert.equal(candidatePkg.statistics.membershipBasis, 'candidate-spatiotemporal-window');
  assert.equal(candidatePkg.statistics.scientificallyAcceptedAftershockCount, null);
  assert.equal(candidatePkg.statistics.eligiblePostEventCount, 2);
  assert.equal(candidatePkg.statistics.preEventCount, 1);
  assert.equal(candidatePkg.statistics.countsByInterval.within24h, 1);
  assert.equal(candidatePkg.statistics.countsByInterval.within72h, 2);
  assert.equal(candidatePkg.statistics.hasMixedMagnitudeScales, true);
  assert.equal(candidatePkg.statistics.incompleteMissingDepthCount, 1);
  assert.equal(candidatePkg.statistics.maxAftershock?.eventId, 'AFT-02');
  assert.equal(candidatePkg.historical.totalMatchingCount, 1);
  assert.equal(candidatePkg.historical.rows[0]?.eventId, 'HIST-2014');
  assert.equal(candidatePkg.figures.aftershockMap.status, 'ready');
  assert.equal(candidatePkg.figures.activityChart.status, 'ready');
  assert.equal(candidatePkg.figures.magnitudeChart.status, 'ready');
  assert.match(candidatePkg.figures.aftershockMap.svgMarkup, /CANDIDATE SPATIOTEMPORAL WINDOW/);
  assert.match(candidatePkg.statistics.dataCutoffPst, /PST \(UTC\+8\)/);

  // Reviewed sequence membership with explicit accepted ID
  const aft01Record = catSnap.records.find((r) => r.eventId === 'AFT-01');
  assert.ok(aft01Record);
  const reviewedPkg = buildPrimerStage3Package({
    event: refEvent,
    catalog: catSnap.records,
    catalogVersion: catSnap.catalogVersion,
    sourceLabel: catSnap.sourceLabel,
    config: {
      acceptedAftershockIds: [aft01Record.id],
      dataCutoffUtc: new Date(refMs + 10 * 86_400_000).toISOString(),
    },
  });

  assert.equal(reviewedPkg.statistics.membershipBasis, 'reviewed-sequence-membership');
  assert.equal(reviewedPkg.statistics.scientificallyAcceptedAftershockCount, 1);
  assert.match(reviewedPkg.figures.aftershockMap.svgMarkup, /REVIEWED SEQUENCE MEMBERSHIP/);
});

test('Stage 3: non-destructive Section 3 sync and full HTML/PDF export provenance', () => {
  const refEvent = structuredClone(INITIAL_EVENTS[2]);
  const refMs = Date.parse(`${refEvent.originDateGmt}T${refEvent.originTimeGmt}Z`);
  const catSnap = validateAndMergeLocalCatalog({
    content: [
      'eventId,time,latitude,longitude,depth,magnitude,magType,source,place',
      `HIST-1990,${new Date(refMs - 20 * 365.25 * 86_400_000).toISOString()},9.90,126.20,15,6.0,Mw,PHIVOLCS,Historical`,
      `AFT-10,${new Date(refMs + 4 * 3_600_000).toISOString()},9.88,126.21,12,4.1,Ms,PHIVOLCS,Aftershock 10`,
    ].join('\n'),
    format: 'csv',
    existingRecords: [],
    existingCatalogVersion: 2,
  });

  const pkg = buildPrimerStage3Package({
    event: refEvent,
    catalog: catSnap.records,
    catalogVersion: catSnap.catalogVersion,
    sourceLabel: catSnap.sourceLabel,
    config: { dataCutoffUtc: new Date(refMs + 48 * 3_600_000).toISOString() },
  });

  let primer = generateInitialEarthquakePrimer(refEvent, { trigger: 'manual' });

  // Unedited Section 3 gets synced cleanly
  primer = updatePrimerSequenceHistoricalAnalysis(primer, pkg);
  const sec3Auto = primer.sections.find((s) => s.id === 'aftershocks')!;
  assert.match(sec3Auto.content, /Post-Event Spatiotemporal Candidates/);
  assert.match(sec3Auto.content, /AFT-10/);

  // Manually edited Section 3 must NOT be silently overwritten when sync runs again
  const customNote = 'Manual duty seismologist assessment preserved.';
  primer = {
    ...primer,
    sections: primer.sections.map((s) =>
      s.id === 'aftershocks' ? { ...s, content: customNote, isEdited: true } : s
    ),
  };
  const afterPreservingUpdate = updatePrimerSequenceHistoricalAnalysis(primer, pkg);
  const sec3Preserved = afterPreservingUpdate.sections.find((s) => s.id === 'aftershocks')!;
  assert.equal(sec3Preserved.content, customNote);
  assert.equal(sec3Preserved.isEdited, true);

  // HTML and PDF exports include Stage 3 statistics, SVG figures, historical table & PST cutoff
  const html = buildPrimerHtmlDocument(afterPreservingUpdate);
  assert.match(html, /Automated Sequence Statistics &amp; Historical Seismicity Appendix/);
  assert.match(html, /HIST-1990/);
  assert.match(html, /PST \(UTC\+8\)/);
  assert.match(html, /EARTHQUAKE ACTIVITY VS\. TIME/);

  const { doc } = buildPrimerPdfDocument(afterPreservingUpdate);
  assert.ok(doc.output('arraybuffer').byteLength > 3000);
});

test('Stage 4: verified PEIS, Stage 2 geo, Stage 3 sequence reuse, and tsunami non-inference safeguards', () => {
  const refEvent: EQPEvent = structuredClone(INITIAL_EVENTS[2]); // Surigao del Norte Ms 5.1, offshore-capable coastal region
  refEvent.tsunamiStatus = 'None';
  refEvent.intensities = [
    {
      id: 'felt-v',
      peis: 'V',
      locality: 'Burgos, Surigao del Norte',
      reviewStatus: 'verified',
      category: 'felt',
    },
    {
      id: 'inst-iv',
      peis: 'IV',
      locality: 'Surigao City Strong Motion Station',
      reviewStatus: 'verified',
      category: 'instrumental',
    },
    {
      id: 'draft-vi',
      peis: 'VI',
      locality: 'Draft Unconfirmed Municipality',
      reviewStatus: 'draft',
      category: 'felt',
    },
    {
      id: 'conf-vii',
      peis: 'VII',
      locality: 'Conflicting Unresolved Municipality',
      reviewStatus: 'conflicting',
      category: 'felt',
    },
  ];
  const snapshotBefore = JSON.stringify(refEvent);

  const fig = generatePrimerEpicenterFigure(refEvent, {
    primaryLocationLabel: '015 km N 75° E of Burgos (Surigao del Norte)',
    faultGeneratorLabel: 'Philippine Fault — Surigao Segment',
  });

  const refMs = Date.parse(`${refEvent.originDateGmt}T${refEvent.originTimeGmt}Z`);
  const catSnap = validateAndMergeLocalCatalog({
    content: [
      'eventId,time,latitude,longitude,depth,magnitude,magType,source,place',
      `HIST-1990,${new Date(refMs - 20 * 365.25 * 86_400_000).toISOString()},9.90,126.20,15,6.0,Mw,PHIVOLCS,Historical`,
      `AFT-10,${new Date(refMs + 4 * 3_600_000).toISOString()},9.88,126.21,12,4.1,Ms,PHIVOLCS,Aftershock 10`,
    ].join('\n'),
    format: 'csv',
    existingRecords: [],
    existingCatalogVersion: 1,
  });
  const s3Pkg = buildPrimerStage3Package({
    event: refEvent,
    catalog: catSnap.records,
    catalogVersion: catSnap.catalogVersion,
    sourceLabel: catSnap.sourceLabel,
    config: { dataCutoffUtc: new Date(refMs + 48 * 3_600_000).toISOString() },
  });

  // Default external data with tsunamiStatus === 'None' must NEVER infer 'official-no-tsunami'
  const defaultExternal = createDefaultStage4ExternalData(refEvent);
  assert.equal(defaultExternal.tsunami.state, 'unavailable');

  const pkgDefault = buildPrimerStage4Narratives({
    event: refEvent,
    externalData: defaultExternal,
    epicenterFigure: fig,
    stage3Package: s3Pkg,
    primaryLocationLabel: '015 km N 75° E of Burgos (Surigao del Norte)',
    faultGeneratorLabel: 'Philippine Fault — Surigao Segment',
  });

  // Input event must never be mutated
  assert.equal(JSON.stringify(refEvent), snapshotBefore);
  assert.equal(pkgDefault.templateVersion, STAGE4_TEMPLATE_VERSION);

  // Intensity block must summarize verified PEIS V + descriptor, separate instrumental, and exclude draft/conflicting localities
  const intText = pkgDefault.sectionNarratives.intensity.renderedText;
  assert.match(intText, /Burgos, Surigao del Norte/);
  assert.match(intText, /Surigao City Strong Motion Station/);
  assert.match(intText, /Strong/i); // PEIS V descriptor
  assert.doesNotMatch(intText, /Draft Unconfirmed Municipality/);
  assert.doesNotMatch(intText, /Conflicting Unresolved Municipality/);

  // Tectonic setting must remain preliminary-review when only proximity is present
  assert.equal(pkgDefault.sectionNarratives.tectonic_setting.contentState, 'preliminary-review');
  assert.match(
    pkgDefault.sectionNarratives.tectonic_setting.renderedText,
    /does not establish/i
  );

  // Hazards block must flag tsunami state as unavailable (never 'no tsunami')
  const tsunamiSub = pkgDefault.sectionNarratives.hazards.subsections.find(
    (s) => s.id === 'hazards-tsunami'
  );
  assert.ok(tsunamiSub);
  assert.equal(tsunamiSub.contentState, 'unavailable-or-unresolved');
  assert.doesNotMatch(tsunamiSub.body, /no destructive tsunami generated/i);
});

test('Stage 4: official tsunami warning + expert tectonic verification, non-destructive edit preservation, stale checks & exports', () => {
  const refEvent: EQPEvent = structuredClone(INITIAL_EVENTS[2]);
  const external = createDefaultStage4ExternalData(refEvent);
  external.tsunami = {
    state: 'official-warning-or-advisory',
    officialAdvisoryId: 'PHIVOLCS Tsunami Advisory No. 2',
    issuingAgency: 'PHIVOLCS-DOST',
    advisoryStatusAsOfTime: '2026-10-08 06:45 PM PST',
    issuedAt: '2026-10-08 06:20 PM PST',
    cancelledAt: '',
    affectedCoastalAreas: 'Surigao del Norte and Dinagat Islands facing Philippine Sea',
    sourceDocumentRef: 'DOST-PHIVOLCS-TA-2026-02',
    seaLevelObservations: [
      {
        id: 'sl-1',
        stationName: 'Surigao Tide Station',
        maxWaveHeightM: '0.16',
        observedAtUtc: '2026-10-08T10:40:00Z',
        observationType: 'tide-gauge',
        sourceRef: 'NAMRIA Tide Gauge',
        reviewStatus: 'ready-for-review',
      },
    ],
    notes: '',
  };
  external.tectonic = {
    expertInterpretation:
      'Consistent with left-lateral strike-slip faulting along the northern Surigao Segment of the Philippine Fault based on CMT solution and relocated aftershocks.',
    evidenceReferences: 'PHIVOLCS CMT 2026-10-08; Relocated Sequence Profile',
    reviewerName: 'SOEPD Duty Seismologist',
    reviewStatus: 'ready-for-review',
  };
  external.hazardObservations = [
    {
      id: 'haz-obs-1',
      hazardType: 'landslides',
      location: 'Burgos coastal road cut, Surigao del Norte',
      observedAtUtc: '2026-10-08T11:30:00Z',
      description: 'Minor rockfall debris cleared along steep road cut.',
      source: 'PHIVOLCS QRT / MDRRMO',
      reviewStatus: 'ready-for-review',
    },
  ];
  external.monitoringResponse = {
    ...external.monitoringResponse,
    monitoringActivities: '24/7 SOEPD seismic & sea-level monitoring active.',
    qrtDeployments: 'QRT deployed to Surigao del Norte.',
    sourceRef: 'SOEPD SitRep #2',
    reviewStatus: 'ready-for-review',
  };
  external.eventSpecificPreparednessAdvisories =
    'Coastal residents in Surigao del Norte advised to await official cancellation before returning to shoreline.';
  external.eventSpecificAdvisoriesSource = 'PHIVOLCS Bulletin No. 2';
  external.eventSpecificAdvisoriesVerified = true;

  const pkg4 = buildPrimerStage4Narratives({
    event: refEvent,
    externalData: external,
    primaryLocationLabel: '015 km N 75° E of Burgos (Surigao del Norte)',
    faultGeneratorLabel: 'Philippine Fault — Surigao Segment',
  });

  // Verified expert tectonic & tsunami subsections transition properly to verified-fact
  const tsunamiSub = pkg4.sectionNarratives.hazards.subsections.find(
    (s) => s.id === 'hazards-tsunami'
  );
  assert.equal(tsunamiSub?.contentState, 'verified-fact');
  assert.match(tsunamiSub?.body ?? '', /Surigao Tide Station/);
  assert.match(tsunamiSub?.body ?? '', /PHIVOLCS Tsunami Advisory No\. 2/);
  assert.equal(pkg4.sectionNarratives.tectonic_setting.contentState, 'verified-fact');

  // Provenance ledger must record verified claims
  assert.ok(pkg4.provenanceLedger.some((p) => p.claimKey === 'hazards.tsunamiOfficial'));
  assert.ok(pkg4.provenanceLedger.some((p) => p.claimKey === 'tectonic.expertInterpretation'));

  // Non-destructive section sync preserves manual edits while replacing unedited sections
  let primer = generateInitialEarthquakePrimer(refEvent, { trigger: 'manual' });
  const customOverview = 'Hand-edited duty seismologist overview text preserved cleanly.';
  primer = {
    ...primer,
    sections: primer.sections.map((s) =>
      s.id === 'overview' ? { ...s, content: customOverview, isEdited: true } : s
    ),
  };
  primer = updatePrimerStage4Narratives(primer, pkg4);

  const secOverview = primer.sections.find((s) => s.id === 'overview')!;
  const secHazards = primer.sections.find((s) => s.id === 'hazards')!;
  assert.equal(secOverview.content, customOverview);
  assert.equal(secOverview.isEdited, true);
  assert.match(secOverview.autoGeneratedBaseline, /015 km N 75° E of Burgos/);
  assert.match(secHazards.content, /PHIVOLCS Tsunami Advisory No\. 2/);
  assert.match(secHazards.content, /Burgos coastal road cut/);

  // Stale detection when external data changes vs package snapshot
  const modifiedExternal = structuredClone(external);
  modifiedExternal.tsunami.cancelledAt = '2026-10-08 09:00 PM PST';
  const liveChangedFp = computeStage4InputFingerprint({
    event: refEvent,
    primaryLocationLabel: '015 km N 75° E of Burgos (Surigao del Norte)',
    faultGeneratorLabel: 'Philippine Fault — Surigao Segment',
    externalData: modifiedExternal,
  });
  assert.notEqual(liveChangedFp, pkg4.inputFingerprint);

  // HTML and PDF exports embed Stage 4 provenance ledger, stale warning, and draft safety banner
  const html = buildPrimerHtmlDocument(primer, {
    currentStage4Fingerprint: liveChangedFp,
  });
  assert.match(html, /DRAFT EARTHQUAKE PRIMER/);
  assert.match(html, /Stage 4 Scientific Provenance &amp; Verification Ledger/);
  assert.match(html, /STALE STAGE 4 NARRATIVE WARNING/);
  assert.match(html, /DOST-PHIVOLCS-TA-2026-02/);

  const { doc } = buildPrimerPdfDocument(primer, {
    currentStage4Fingerprint: liveChangedFp,
  });
  assert.ok(doc.output('arraybuffer').byteLength > 3000);
});

const SAMPLE_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('Stage 5: Public Primer Draft vs Scientific Review Copy preserve data, separate timestamps, and gate internal provenance', () => {
  const refEvent: EQPEvent = structuredClone(INITIAL_EVENTS[2]); // Ms 5.1 Surigao del Norte
  const snapshotBefore = JSON.stringify(refEvent);
  const refMs = Date.parse(`${refEvent.originDateGmt}T${refEvent.originTimeGmt}Z`);

  const catSnap = validateAndMergeLocalCatalog({
    content: [
      'eventId,time,latitude,longitude,depth,magnitude,magType,source,place',
      `HIST-1995,${new Date(refMs - 15 * 365.25 * 86_400_000).toISOString()},9.90,126.20,15,6.0,Mw,PHIVOLCS,Historical`,
      `AFT-01,${new Date(refMs + 2 * 3_600_000).toISOString()},9.88,126.21,12,4.1,Ms,PHIVOLCS,Aftershock 1`,
    ].join('\n'),
    format: 'csv',
    existingRecords: [],
    existingCatalogVersion: 1,
  });

  const s3Pkg = buildPrimerStage3Package({
    event: refEvent,
    catalog: catSnap.records,
    catalogVersion: catSnap.catalogVersion,
    sourceLabel: catSnap.sourceLabel,
    config: { dataCutoffUtc: new Date(refMs + 48 * 3_600_000).toISOString() },
  });

  const external = createDefaultStage4ExternalData(refEvent);
  const fig = generatePrimerEpicenterFigure(refEvent, {
    primaryLocationLabel: '015 km N 75° E of Burgos (Surigao del Norte)',
    faultGeneratorLabel: 'Philippine Fault — Surigao Segment',
  });
  const s4Pkg = buildPrimerStage4Narratives({
    event: refEvent,
    externalData: external,
    epicenterFigure: fig,
    stage3Package: s3Pkg,
    primaryLocationLabel: '015 km N 75° E of Burgos (Surigao del Norte)',
    faultGeneratorLabel: 'Philippine Fault — Surigao Segment',
  });

  let primer = generateInitialEarthquakePrimer(refEvent, {
    trigger: 'manual',
    primaryLocationLabel: '015 km N 75° E of Burgos (Surigao del Norte)',
    faultGeneratorLabel: 'Philippine Fault — Surigao Segment',
  });
  primer = updatePrimerSequenceHistoricalAnalysis(primer, s3Pkg);
  primer = updatePrimerStage4Narratives(primer, s4Pkg);

  const publicHtml = buildPrimerHtmlDocument(primer, { mode: 'public-draft' });
  const reviewHtml = buildPrimerHtmlDocument(primer, { mode: 'scientific-review' });

  // Input event must remain unmutated
  assert.equal(JSON.stringify(refEvent), snapshotBefore);

  // Public Draft: Q&A headings, Draft notice, exact magnitude scale Ms 5.1, separated timestamps, no internal provenance ledger
  assert.match(publicHtml, /DRAFT EARTHQUAKE PRIMER/);
  assert.match(publicHtml, /What happened during the earthquake\?/);
  assert.match(publicHtml, /Ms 5\.1/);
  assert.match(publicHtml, /Primer Updated Timestamp/);
  assert.match(publicHtml, /Catalog Data Cutoff/);
  assert.match(publicHtml, /References and Data Sources/);
  assert.doesNotMatch(publicHtml, /Stage 4 Scientific Provenance &amp; Verification Ledger/);
  assert.doesNotMatch(publicHtml, new RegExp(s4Pkg.inputFingerprint));

  // Scientific Review: full provenance ledger + hex fingerprints + content-state indicators
  assert.match(reviewHtml, /SCIENTIFIC REVIEW COPY/);
  assert.match(reviewHtml, /Stage 4 Scientific Provenance &amp; Verification Ledger/);
  assert.match(reviewHtml, new RegExp(s4Pkg.inputFingerprint));

  // Deduplicated references list must not contain duplicates
  const refs = buildPrimerReferenceList(primer);
  assert.ok(refs.length >= 3);
  const titles = refs.map((r) => `${r.organizationOrAuthor}|${r.title}`);
  assert.equal(new Set(titles).size, titles.length);
});

test('Stage 5: dynamic sequential Figure 1..N numbering skips unavailable figures cleanly & configurable ordering works', () => {
  const refEvent: EQPEvent = structuredClone(INITIAL_EVENTS[2]);
  const refMs = Date.parse(`${refEvent.originDateGmt}T${refEvent.originTimeGmt}Z`);
  const catSnap = validateAndMergeLocalCatalog({
    content: [
      'eventId,time,latitude,longitude,depth,magnitude,magType,source,place',
      `HIST-1999,${new Date(refMs - 10 * 365.25 * 86_400_000).toISOString()},9.90,126.20,15,6.0,Mw,PHIVOLCS,Historical`,
      `AFT-01,${new Date(refMs + 2 * 3_600_000).toISOString()},9.88,126.21,12,4.1,Ms,PHIVOLCS,Aftershock 1`,
    ].join('\n'),
    format: 'csv',
    existingRecords: [],
    existingCatalogVersion: 1,
  });
  const s3Pkg = buildPrimerStage3Package({
    event: refEvent,
    catalog: catSnap.records,
    catalogVersion: catSnap.catalogVersion,
    sourceLabel: catSnap.sourceLabel,
    config: { dataCutoffUtc: new Date(refMs + 48 * 3_600_000).toISOString() },
  });

  // Case A: Epicenter figure unavailable -> Stage 3 figures must dynamically start at Figure 1..3
  let primerMissingMap = generateInitialEarthquakePrimer(refEvent, {
    trigger: 'manual',
    includeFigure: true,
  });
  primerMissingMap = {
    ...primerMissingMap,
    extensions: {
      ...primerMissingMap.extensions,
      epicenterFigure: {
        ...primerMissingMap.extensions!.epicenterFigure!,
        status: 'unavailable',
        svgMarkup: '',
        unavailableReason: 'Simulated missing basemap snapshot',
      },
    },
  };
  primerMissingMap = updatePrimerSequenceHistoricalAnalysis(primerMissingMap, s3Pkg);
  const figsMissingMap = assignPrimerFigureNumbers(primerMissingMap);
  assert.equal(figsMissingMap.epicenter?.figureNumber, null);
  assert.equal(figsMissingMap.aftershockMap?.figureNumber, 1);
  assert.equal(figsMissingMap.activityChart?.figureNumber, 2);
  assert.equal(figsMissingMap.magnitudeChart?.figureNumber, 3);

  // Case B: All 4 figures ready -> Figure 1..4
  let primerAllReady = generateInitialEarthquakePrimer(refEvent, { trigger: 'manual' });
  primerAllReady = updatePrimerSequenceHistoricalAnalysis(primerAllReady, s3Pkg);
  const figsAllReady = assignPrimerFigureNumbers(primerAllReady);
  assert.equal(figsAllReady.epicenter?.figureNumber, 1);
  assert.equal(figsAllReady.aftershockMap?.figureNumber, 2);
  assert.equal(figsAllReady.activityChart?.figureNumber, 3);
  assert.equal(figsAllReady.magnitudeChart?.figureNumber, 4);

  // Case C: Custom section ordering & technical headings + preserved manual edit
  primerAllReady = {
    ...primerAllReady,
    sections: primerAllReady.sections.map((s) =>
      s.id === 'overview' ? { ...s, content: 'Manual duty edit kept.', isEdited: true } : s
    ),
  };
  primerAllReady = updatePrimerPresentationConfig(primerAllReady, {
    headingStyle: 'technical-numbered',
    sectionOrder: [
      'overview_location',
      'tectonic_setting',
      'epicenter_figure',
      'aftershocks',
      'intensity',
      'tsunami',
      'secondary_hazards',
      'volcano_considerations',
      'historical_seismicity',
      'preparedness',
      'monitoring_response',
      'references',
    ],
  });
  const htmlReordered = buildPrimerHtmlDocument(primerAllReady, { mode: 'public-draft' });
  const idxTec = htmlReordered.indexOf('Tectonic Setting &amp; Candidate Earthquake Generators');
  const idxAfter = htmlReordered.indexOf('Aftershock Activity &amp; Quantitative Sequence Figures');
  assert.ok(idxTec > 0 && idxAfter > idxTec, 'Custom sectionOrder must govern exported section sequence');
  assert.match(htmlReordered, /Manual duty edit kept\./);
});

test('Stage 5: multi-page historical table renders ALL rows cleanly, escapes HTML XSS, handles WinAnsi symbols, sanitizes filenames, and embeds PDF PNG XObjects', () => {
  const refEvent: EQPEvent = structuredClone(INITIAL_EVENTS[2]);
  const refMs = Date.parse(`${refEvent.originDateGmt}T${refEvent.originTimeGmt}Z`);

  // Build 18 historical rows to verify multi-page PDF pagination without silent omission
  const histCsvRows = Array.from({ length: 18 }, (_, i) => {
    const dt = new Date(refMs - (i + 2) * 365.25 * 86_400_000).toISOString();
    return `HIST-ROW-${String(i + 1).padStart(2, '0')},${dt},9.${80 + (i % 15)},126.${10 + (i % 20)},${10 + i},6.${(i % 5) + 1},Mw,PHIVOLCS-HIST,Station ${i + 1}`;
  });
  const catSnap = validateAndMergeLocalCatalog({
    content: [
      'eventId,time,latitude,longitude,depth,magnitude,magType,source,place',
      ...histCsvRows,
      `AFT-01,${new Date(refMs + 2 * 3_600_000).toISOString()},9.88,126.21,12,4.1,Ms,PHIVOLCS,Aftershock 1`,
    ].join('\n'),
    format: 'csv',
    existingRecords: [],
    existingCatalogVersion: 3,
  });

  const s3Pkg = buildPrimerStage3Package({
    event: refEvent,
    catalog: catSnap.records,
    catalogVersion: catSnap.catalogVersion,
    sourceLabel: catSnap.sourceLabel,
    config: {
      historicalMaxRows: 25,
      dataCutoffUtc: new Date(refMs + 48 * 3_600_000).toISOString(),
    },
  });

  let primer = generateInitialEarthquakePrimer(refEvent, { trigger: 'manual' });
  primer = updatePrimerSequenceHistoricalAnalysis(primer, s3Pkg);
  // Inject long title + XSS script payload + special scientific symbols
  primer = {
    ...primer,
    title:
      'PRIMER ON THE EXTENDED OFFSHORE SURIGAO DEL NORTE EARTHQUAKE SEQUENCE ≥ 5.0 ± 0.2 — <script>alert(1)</script> & VERY LONG REGIONAL SUBDUCTION EVENT HEADING THAT WRAPS ACROSS MULTIPLE LINES CLEANLY',
    sections: primer.sections.map((s) =>
      s.id === 'overview'
        ? {
            ...s,
            content: 'Special chars: ≥ 5.0, ≤ 30 km, ≠ Mw, → evacuation, <img src=x onerror=alert(1)>',
            isEdited: true,
          }
        : s
    ),
  };

  // HTML escaping check & complete row rendering check
  const html = buildPrimerHtmlDocument(primer, { mode: 'public-draft' });
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.doesNotMatch(html, /<img src=x onerror=alert\(1\)>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /HIST-ROW-01/);
  assert.match(html, /HIST-ROW-18/);

  // Export filename sanitization check (never APPROVED/FINAL)
  const pubPdfName = buildPrimerExportFilename(primer, 'public-draft', 'pdf');
  const revHtmlName = buildPrimerExportFilename(primer, 'scientific-review', 'html');
  assert.match(pubPdfName, /^PHIVOLCS_EQ_PRIMER_.*_PUBLIC_DRAFT\.pdf$/);
  assert.match(revHtmlName, /^PHIVOLCS_EQ_PRIMER_.*_SCIENTIFIC_REVIEW_DRAFT\.html$/);
  assert.doesNotMatch(pubPdfName, /FINAL|APPROVED/);

  // Readiness summary check
  const readiness = computePrimerReadinessSummary(primer, { isPlotResultStale: true });
  assert.equal(readiness.readyFigureCount, 4);
  assert.ok(readiness.staleIndicators.length >= 1);
  assert.match(readiness.disclaimer, /NOT a formal scientific approval/i);

  // Genuine PNG embedding verification in PDF binary stream (must contain 4 /Subtype /Image XObjects)
  const { doc: embeddedDoc } = buildPrimerPdfDocument(primer, {
    mode: 'public-draft',
    event: refEvent,
    mapPngDataUrl: SAMPLE_PNG_DATA_URL,
    stage3Pngs: {
      aftershockMap: SAMPLE_PNG_DATA_URL,
      activityChart: SAMPLE_PNG_DATA_URL,
      magnitudeChart: SAMPLE_PNG_DATA_URL,
    },
  });
  const embeddedBytes = new Uint8Array(embeddedDoc.output('arraybuffer'));
  const embeddedAscii = new TextDecoder('latin1').decode(embeddedBytes);
  const imageMatches = embeddedAscii.match(/\/Subtype\s*\/Image/g) ?? [];
  assert.ok(
    imageMatches.length >= 4,
    `Expected at least 4 embedded PNG /Subtype /Image XObjects in PDF, got ${imageMatches.length}`
  );
  // All 18 historical rows present across multi-page PDF without truncation
  assert.match(embeddedAscii, /HIST-ROW-01/);
  assert.match(embeddedAscii, /HIST-ROW-18/);
  assert.match(embeddedAscii, /Page 1 of /);

  // Explicit warning emitted if PNG raster is unavailable (never blank silent box)
  const { doc: warnDoc } = buildPrimerPdfDocument(primer, {
    mode: 'scientific-review',
    missingPngWarnings: ['Sequence Map failed PNG rasterization'],
  });
  const warnAscii = new TextDecoder('latin1').decode(new Uint8Array(warnDoc.output('arraybuffer')));
  assert.match(warnAscii, /PDF Figure Rasterization Warnings: Sequence Map failed PNG rasterization/);
});

test('Acceptance regression: evaluatePrimerEligibility blocks stale solutions and maybeAutoCreatePrimerDraft enforces settled, non-duplicate, edit-preserving lifecycle', () => {
  const majorEvent: EQPEvent = {
    ...structuredClone(INITIAL_EVENTS[2]),
    id: '2013_BOHOL_REG_TEST',
    ms: 7.2,
    preferredScale: 'Ms',
    lat: 9.86,
    lon: 124.07,
    depthKm: 12.0,
    iterations: 6,
  };

  // 1. Stale PLOT solution must fail eligibility even when M >= 5.0
  const staleEval = evaluatePrimerEligibility(majorEvent, DEFAULT_PRIMER_ELIGIBILITY_RULES, {
    isSolutionStale: true,
  });
  assert.equal(staleEval.eligible, false);
  assert.ok(staleEval.unmetCriteria.some((c) => /stale/i.test(c)));

  // Install isolated mock window storage for Node test
  const prevWindow = (globalThis as { window?: unknown }).window;
  const localMap = new Map<string, string>();
  const sessionMap = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (k: string) => localMap.get(k) ?? null,
      setItem: (k: string, v: string) => {
        localMap.set(k, String(v));
      },
      removeItem: (k: string) => {
        localMap.delete(k);
      },
    },
    sessionStorage: {
      getItem: (k: string) => sessionMap.get(k) ?? null,
      setItem: (k: string, v: string) => {
        sessionMap.set(k, String(v));
      },
      removeItem: (k: string) => {
        sessionMap.delete(k);
      },
    },
  };

  try {
    // 2. Solver running / pending candidate / stale solution must never auto-draft
    assert.equal(
      maybeAutoCreatePrimerDraft(majorEvent, { isLocating: true }).reason,
      'solver-in-progress'
    );
    assert.equal(
      maybeAutoCreatePrimerDraft(majorEvent, { hasPendingCandidate: true }).reason,
      'solver-in-progress'
    );
    assert.equal(
      maybeAutoCreatePrimerDraft(majorEvent, { isSolutionStale: true }).reason,
      'ineligible'
    );

    // 3. Settled valid event creates exactly 1 unpublished auto-draft
    const settledRes = maybeAutoCreatePrimerDraft(majorEvent, {
      primaryLocationLabel: '006 km S 23° W of Sagbayan (Bohol)',
    });
    assert.equal(settledRes.created, true);
    assert.equal(settledRes.reason, 'created');
    assert.equal(settledRes.draft?.generationTrigger, 'auto-rule-draft');
    assert.equal(settledRes.draft?.status, 'draft');

    // 4. Duplicate call & parameter change never overwrite existing/edited draft
    assert.equal(maybeAutoCreatePrimerDraft(majorEvent).reason, 'existing-draft-preserved');
    const edited = structuredClone(settledRes.draft!);
    edited.sections[0].content = 'Operator custom verified narrative.';
    edited.sections[0].isEdited = true;
    savePrimerDraftToStorage(edited);

    const afterParamChange = maybeAutoCreatePrimerDraft({ ...majorEvent, depthKm: 15.0 });
    assert.equal(afterParamChange.reason, 'existing-draft-preserved');
    assert.equal(
      loadSavedPrimerDrafts()[0]?.sections[0]?.content,
      'Operator custom verified narrative.'
    );

    // 5. Delete suppression blocks re-auto-creation on unchanged state, resets when state changes or cleared
    localMap.clear();
    suppressAutoDraftForEvent(majorEvent, {
      primaryLocationLabel: '006 km S 23° W of Sagbayan (Bohol)',
    });
    assert.equal(
      maybeAutoCreatePrimerDraft(majorEvent, {
        primaryLocationLabel: '006 km S 23° W of Sagbayan (Bohol)',
      }).reason,
      'suppressed-after-delete'
    );
    assert.equal(
      maybeAutoCreatePrimerDraft(
        { ...majorEvent, ms: 7.3 },
        { primaryLocationLabel: '006 km S 23° W of Sagbayan (Bohol)' }
      ).reason,
      'created'
    );
    clearAutoDraftSuppressionForEventId(majorEvent.id);
  } finally {
    if (prevWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = prevWindow;
    }
  }
});

test('Acceptance regression: generatePrimerEpicenterFigure skips malformed GIS fault features lacking bbox without throwing', () => {
  const event = structuredClone(INITIAL_EVENTS[2]);
  const partialDataset = {
    sourceUrl: 'data/geology/active_faults.geojson',
    featureCount: 1,
    activeFaultCount: 1,
    potentiallyActiveCount: 0,
    features: [
      {
        id: 'fault-no-bbox',
        properties: {
          fault_category: 'Active Fault',
          fault_name: 'Test Fault',
          segment_name: null,
          trace_type: 'Certain',
          yr_updated: null,
        },
        isUncertainTrace: false,
        geometry: {
          type: 'LineString',
          coordinates: [
            [126.1, 9.8],
            [126.2, 9.9],
          ],
        },
        // Intentionally omit bbox to verify defensive guard
      },
    ],
    activeGeoFeatures: [],
    potentiallyActiveGeoFeatures: [],
    warnings: [],
  } as unknown as NonNullable<Parameters<typeof generatePrimerEpicenterFigure>[1]>['gisActiveFaultsData'];

  const fig = generatePrimerEpicenterFigure(event, {
    gisActiveFaultsData: partialDataset,
    layers: {
      ...DEFAULT_PRIMER_MAP_LAYERS,
      gisCandidateFaults: true,
      trenchSystemsGis: false,
    },
  });

  assert.equal(fig.status, 'ready');
  assert.match(fig.svgMarkup, /<svg /);
});
