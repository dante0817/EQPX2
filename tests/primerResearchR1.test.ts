import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { jsPDF } from 'jspdf';
import { INITIAL_EVENTS, type EQPEvent } from '../src/data/eqpData';
import {
  extractVerifiedPrimerParameters,
  generateInitialEarthquakePrimer,
} from '../src/utils/earthquakePrimer';
import {
  buildEventSearchContext,
  buildResearchDiscoveryQuery,
  buildTextPreview,
  buildUsgsSummaryPlainText,
  computeSha256Hex,
  DEFAULT_RESEARCH_MATCH_TOLERANCES,
  evaluateResearchEventMatch,
  extractSafePlainTextFromHtml,
  parseUsgsComcatDetailGeoJson,
  type PrimerResearchSourceRecord,
} from '../src/utils/primerResearchAssistant';
import {
  createMemoryResearchSourceStore,
  validateImportedSourcesBundleJson,
} from '../src/utils/primerResearchStore';
import {
  isPrivateOrReservedIp,
  MAX_RESEARCH_FETCH_BYTES,
  MAX_RESEARCH_IMPORT_BYTES,
  MAX_RESEARCH_REDIRECTS,
  validateSafePublicHttpsUrl,
} from '../src/utils/researchUrlSecurity';
import {
  extractDocumentTextFromBuffer,
  fetchSafePublicDocument,
  fetchUsgsEventDetailServer,
  inspectGeminiSearchCapability,
  searchOfficialSourcesWithGemini,
} from '../server/primerResearchHelpers';

function makeBoholLikeEqpEvent(): EQPEvent {
  const ev = structuredClone(INITIAL_EVENTS[0]);
  ev.id = 'EQP-20131015-BOHOL';
  ev.filename = '20131015_0012_Bohol.eqp';
  ev.originDateGmt = '2013-10-15';
  ev.originTimeGmt = '00:12:32';
  ev.lat = 9.88;
  ev.lon = 124.11;
  ev.depthKm = 12.0;
  ev.ms = 7.2; // Different scale (Ms 7.2) than USGS Mww 7.1!
  ev.mb = 0;
  ev.md = 0;
  return ev;
}

function makeCandidateRecord(
  overrides: Partial<
    Omit<
      PrimerResearchSourceRecord,
      'versionNumber' | 'supersedesSourceId' | 'supersededBySourceId' | 'duplicateGroupKey'
    >
  > = {}
): Omit<
  PrimerResearchSourceRecord,
  'versionNumber' | 'supersedesSourceId' | 'supersededBySourceId' | 'duplicateGroupKey'
> {
  const active = makeBoholLikeEqpEvent();
  const match = evaluateResearchEventMatch(
    {
      externalEventIds: ['EQP-20131015-BOHOL'],
      originTimeUtc: '2013-10-15T00:12:32.000Z',
      lat: 9.88,
      lon: 124.11,
      depthKm: 12.0,
      magnitude: 7.2,
      magnitudeType: 'Ms',
    },
    active
  );

  return {
    schemaVersion: '1.0',
    sourceId: `src_${crypto.randomUUID().slice(0, 8)}`,
    linkedEqpEventId: active.id,
    documentTitle: 'PHIVOLCS Earthquake Information No. 1 - Bohol',
    organization: 'DOST-PHIVOLCS',
    sourceLocation: 'https://phivolcs.dost.gov.ph/index.php/earthquake/earthquake-information3',
    sourceUrl: 'https://phivolcs.dost.gov.ph/index.php/earthquake/earthquake-information3',
    localImportId: null,
    sourceCategory: 'official-update',
    publishedAtUtc: '2013-10-15T00:25:00.000Z',
    retrievedAtUtc: new Date().toISOString(),
    contentType: 'text/plain',
    sizeBytes: 128,
    contentSha256: crypto.createHash('sha256').update('sample-v1').digest('hex'),
    textAvailability: 'available',
    textUnavailableReason: null,
    extractedText: 'Sample earthquake bulletin content v1.',
    extractedTextPreview: buildTextPreview('Sample earthquake bulletin content v1.'),
    pageCount: null,
    eventMatchState: match.state,
    eventMatchDetails: match,
    externalEventIds: ['EQP-20131015-BOHOL'],
    retrievalStatus: 'retrieved',
    originProvenance: {
      channel: 'safe-url-fetch',
      adapterId: 'r1-safe-fetch',
      queryOrRequestSummary: 'test',
      modelUsed: null,
      groundingUsed: false,
      retrievedViaServer: true,
      accessConditionNote: null,
    },
    usgsDetail: null,
    relevance: 'unreviewed',
    archived: false,
    notes: '',
    ...overrides,
  };
}

// =============================================================================
// 1. USGS EVENT-DETAIL RETRIEVAL & MISSING-PRODUCT HANDLING
// =============================================================================

test('1a. parseUsgsComcatDetailGeoJson handles partial products & attaches mandatory scientific disclaimers', () => {
  const sampleGeoJson = {
    type: 'Feature',
    id: 'usb000kdb4',
    properties: {
      mag: 7.1,
      magType: 'mww',
      place: '4 km SE of Sagbayan, Philippines',
      time: 1381795952050,
      updated: 1650000000000,
      tsunami: 0,
      url: 'https://earthquake.usgs.gov/earthquakes/eventpage/usb000kdb4',
      title: 'M 7.1 - 4 km SE of Sagbayan, Philippines',
      products: {
        origin: [
          {
            id: 'urn:usgs-product:us:origin:usb000kdb4:1',
            source: 'us',
            updateTime: 1381796500000,
            properties: {
              latitude: '9.8796',
              longitude: '124.1167',
              depth: '15.5',
              'evaluation-status': 'reviewed',
              'azimuthal-gap': '18',
            },
          },
        ],
        shakemap: [
          {
            id: 'urn:usgs-product:us:shakemap:usb000kdb4:1',
            source: 'us',
            updateTime: 1381800000000,
            properties: {
              maxmmi: '8.4',
              maxpga: '42.1',
              maxpgv: '39.5',
              version: '7',
            },
          },
        ],
        // focal-mechanism & ground-failure intentionally omitted!
      },
    },
    geometry: {
      type: 'Point',
      coordinates: [124.1167, 9.8796, 15.5],
    },
  };

  const parsed = parseUsgsComcatDetailGeoJson(
    sampleGeoJson,
    'https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=usb000kdb4&format=geojson',
    '2026-11-16T06:00:00.000Z'
  );

  assert.equal(parsed.usgsEventId, 'usb000kdb4');
  assert.equal(parsed.magnitude, 7.1);
  assert.equal(parsed.magnitudeType, 'mww');
  assert.equal(parsed.tsunamiFlagRaw, 0);

  const originProd = parsed.products.find((p) => p.productCategory === 'origin');
  const shakeProd = parsed.products.find((p) => p.productCategory === 'shakemap');
  const fmProd = parsed.products.find((p) => p.productCategory === 'focal-mechanism');
  const gfProd = parsed.products.find((p) => p.productCategory === 'ground-failure');

  assert.equal(originProd?.available, true);
  assert.equal(shakeProd?.available, true);
  assert.equal(shakeProd?.metadata.maxMmi, 8.4);
  assert.equal(fmProd?.available, false);
  assert.equal(gfProd?.available, false);

  const summary = buildUsgsSummaryPlainText(parsed);
  assert.match(summary, /NOT equivalent to verified PHIVOLCS PEIS/i);
  assert.match(summary, /NOT an official PHIVOLCS tsunami advisory/i);
  assert.match(summary, /UNAVAILABLE/);
});

test('1b. Bounded live online USGS ComCat event-detail query (usb000kdb4)', async () => {
  const res = await fetchUsgsEventDetailServer('usb000kdb4');
  assert.equal(res.ok, true, `Expected live USGS query to succeed, got: ${res.error}`);
  assert.ok(res.detail);
  assert.equal(res.detail.usgsEventId, 'usb000kdb4');
  assert.equal(res.detail.magnitudeType?.toLowerCase(), 'mww');
  assert.ok(res.rawSha256 && res.rawSha256.length === 64);

  const origin = res.detail.products.find((p) => p.productCategory === 'origin');
  const mt = res.detail.products.find((p) => p.productCategory === 'moment-tensor');
  const pager = res.detail.products.find((p) => p.productCategory === 'losspager');
  assert.equal(origin?.available, true);
  assert.equal(mt?.available, true);
  assert.equal(pager?.available, true);

  // Also check invalid ID rejection before network call
  const badId = await fetchUsgsEventDetailServer('../etc/passwd');
  assert.equal(badId.ok, false);
});

// =============================================================================
// 2. VALID LOCAL DOCUMENT IMPORT (.pdf, .html, .txt & scanned-PDF handling)
// =============================================================================

test('2a. extractDocumentTextFromBuffer extracts text from real generated PDF, sanitized HTML, and TXT', async () => {
  // Real text-bearing PDF built with jsPDF
  const doc = new jsPDF();
  doc.text('PHIVOLCS Earthquake Information No. 2', 10, 20);
  doc.text('Date and Time: 15 October 2013 - 08:12 AM PST', 10, 30);
  doc.text('Magnitude: Ms 7.2, Depth: 012 km, Bohol Province.', 10, 40);
  const pdfArrayBuf = doc.output('arraybuffer');
  const pdfBuf = Buffer.from(pdfArrayBuf);

  const pdfRes = await extractDocumentTextFromBuffer({
    buffer: pdfBuf,
    filename: 'phivolcs_bohol_bulletin_2.pdf',
    declaredMimeType: 'application/pdf',
  });
  assert.equal(pdfRes.ok, true);
  assert.equal(pdfRes.textAvailability, 'available');
  assert.equal(pdfRes.pageCount, 1);
  assert.match(pdfRes.extractedText, /PHIVOLCS Earthquake Information No\. 2/);
  assert.match(pdfRes.extractedText, /Ms 7\.2/);

  // HTML with script, style, iframe — must be stripped cleanly
  const maliciousHtml = `<!doctype html><html><head><title>PHIVOLCS Advisory</title><style>body{color:red}</style><script>alert("xss")</script></head><body><h1>Official Update</h1><p>No tsunami threat to the Philippines.</p><iframe src="https://evil.example"></iframe></body></html>`;
  const htmlRes = await extractDocumentTextFromBuffer({
    buffer: Buffer.from(maliciousHtml, 'utf8'),
    filename: 'advisory.html',
    declaredMimeType: 'text/html',
  });
  assert.equal(htmlRes.ok, true);
  assert.equal(htmlRes.title, 'PHIVOLCS Advisory');
  assert.equal(htmlRes.textAvailability, 'available');
  assert.match(htmlRes.extractedText, /No tsunami threat to the Philippines/);
  assert.doesNotMatch(htmlRes.extractedText, /alert\(/);
  assert.doesNotMatch(htmlRes.extractedText, /<script/i);
  assert.doesNotMatch(htmlRes.extractedText, /evil\.example/);

  // Direct extractSafePlainTextFromHtml check
  const directHtml = extractSafePlainTextFromHtml(maliciousHtml);
  assert.equal(directHtml.title, 'PHIVOLCS Advisory');
  assert.doesNotMatch(directHtml.plainText, /color:red/);

  // TXT file
  const txtRes = await extractDocumentTextFromBuffer({
    buffer: Buffer.from('Field inspection team observed ground fissures in Loon, Bohol.', 'utf8'),
    filename: 'loon_field_notes.txt',
    declaredMimeType: 'text/plain',
  });
  assert.equal(txtRes.ok, true);
  assert.equal(txtRes.textAvailability, 'available');
  assert.match(txtRes.extractedText, /Loon, Bohol/);
});

test('2b. Empty / scanned image-only PDF reports scanned-no-text without fabricating text', async () => {
  const blankPdf = new jsPDF();
  // Deliberately draw a vector rectangle with zero text tokens (simulates image/scanned PDF)
  blankPdf.rect(10, 10, 80, 40);
  const blankBuf = Buffer.from(blankPdf.output('arraybuffer'));

  const res = await extractDocumentTextFromBuffer({
    buffer: blankBuf,
    filename: 'scanned_bulletin.pdf',
    declaredMimeType: 'application/pdf',
  });
  assert.equal(res.ok, true);
  assert.equal(res.textAvailability, 'scanned-no-text');
  assert.equal(res.extractedText, '');
  assert.match(res.textUnavailableReason ?? '', /scanned\/image-only PDF/i);
});

// =============================================================================
// 3. UNSUPPORTED & MALFORMED FILE REJECTION
// =============================================================================

test('3. Rejects unsupported extensions, empty files, oversized files, fake PDFs, and NUL-byte binaries', async () => {
  const emptyRes = await extractDocumentTextFromBuffer({
    buffer: Buffer.alloc(0),
    filename: 'empty.txt',
    declaredMimeType: 'text/plain',
  });
  assert.equal(emptyRes.ok, false);
  assert.match(emptyRes.error ?? '', /empty/i);

  const exeRes = await extractDocumentTextFromBuffer({
    buffer: Buffer.from('MZ\x90\x00not allowed'),
    filename: 'payload.exe',
    declaredMimeType: 'application/x-msdownload',
  });
  assert.equal(exeRes.ok, false);
  assert.match(exeRes.error ?? '', /Unsupported file format/i);

  const docxRes = await extractDocumentTextFromBuffer({
    buffer: Buffer.from('PK\x03\x04'),
    filename: 'report.docx',
    declaredMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  assert.equal(docxRes.ok, false);

  const oversizedBuf = Buffer.alloc(MAX_RESEARCH_IMPORT_BYTES + 16, 0x41);
  const bigRes = await extractDocumentTextFromBuffer({
    buffer: oversizedBuf,
    filename: 'huge.txt',
    declaredMimeType: 'text/plain',
  });
  assert.equal(bigRes.ok, false);
  assert.match(bigRes.error ?? '', /maximum allowed size/i);

  const fakePdfRes = await extractDocumentTextFromBuffer({
    buffer: Buffer.from('NOT_A_REAL_PDF_HEADER', 'utf8'),
    filename: 'corrupt.pdf',
    declaredMimeType: 'application/pdf',
  });
  assert.equal(fakePdfRes.ok, false);
  assert.match(fakePdfRes.error ?? '', /invalid PDF header signature/i);

  const nulTextRes = await extractDocumentTextFromBuffer({
    buffer: Buffer.from([0x48, 0x65, 0x00, 0x6c, 0x6f]),
    filename: 'binary_masquerade.txt',
    declaredMimeType: 'text/plain',
  });
  assert.equal(nulTextRes.ok, false);
  assert.match(nulTextRes.error ?? '', /binary content detected/i);
});

// =============================================================================
// 4. SOURCE RECORD PERSISTENCE (ISOLATED FROM LOCALSTORAGE)
// =============================================================================

test('4. Source store persists schema fields, relevance, archiving, and clean JSON export outside localStorage', async () => {
  const store = createMemoryResearchSourceStore();
  const diag = await store.getDiagnostics();
  assert.equal(diag.isolatedFromPrimerLocalStorage, true);

  const rec = makeCandidateRecord({
    sourceId: 'src_bohol_1',
    documentTitle: 'PHIVOLCS Bohol Primer Reference',
  });
  const inserted = await store.importOrAddSource(rec);
  assert.equal(inserted.outcome, 'created-new');
  assert.equal(inserted.record.versionNumber, 1);

  const relUpdated = await store.updateRelevance('src_bohol_1', 'relevant');
  assert.equal(relUpdated?.relevance, 'relevant');

  const archUpdated = await store.updateArchived('src_bohol_1', true);
  assert.equal(archUpdated?.archived, true);
  assert.equal(archUpdated?.retrievalStatus, 'archived');

  const activeOnly = await store.listSources({
    linkedEqpEventId: rec.linkedEqpEventId,
    includeArchived: false,
  });
  assert.equal(activeOnly.length, 0);

  const allInclArchived = await store.listSources({
    linkedEqpEventId: rec.linkedEqpEventId,
    includeArchived: true,
  });
  assert.equal(allInclArchived.length, 1);

  const bundleJson = await store.exportEventSourcesJson(rec.linkedEqpEventId);
  const parsed = validateImportedSourcesBundleJson(bundleJson);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.sources.length, 1);
    assert.equal(parsed.sources[0].sourceId, 'src_bohol_1');
  }
});

// =============================================================================
// 5. CONTENT DEDUPLICATION & NON-OVERWRITING VERSION PRESERVATION
// =============================================================================

test('5. Identical SHA-256 deduplicates cleanly; updated content preserves v1 and adds v2', async () => {
  const store = createMemoryResearchSourceStore();
  const shaV1 = await computeSha256Hex(new TextEncoder().encode('Bulletin v1 text'));
  const shaV2 = await computeSha256Hex(new TextEncoder().encode('Bulletin v2 corrected text'));

  const baseInput = makeCandidateRecord({
    sourceId: 'src_v1',
    contentSha256: shaV1,
    extractedText: 'Bulletin v1 text',
  });

  const first = await store.importOrAddSource(baseInput);
  assert.equal(first.outcome, 'created-new');
  assert.equal(first.record.versionNumber, 1);

  // Re-import exact same SHA-256 -> deduplicate cleanly
  const dup = await store.importOrAddSource({
    ...baseInput,
    sourceId: 'src_v1_dup',
  });
  assert.equal(dup.outcome, 'duplicate-exact');
  assert.equal(dup.record.sourceId, 'src_v1');

  // Import updated content for same URL/title -> must preserve v1 intact and create v2
  const updated = await store.importOrAddSource({
    ...baseInput,
    sourceId: 'src_v2',
    contentSha256: shaV2,
    extractedText: 'Bulletin v2 corrected text',
    extractedTextPreview: buildTextPreview('Bulletin v2 corrected text'),
  });
  assert.equal(updated.outcome, 'new-version');
  assert.equal(updated.record.versionNumber, 2);
  assert.equal(updated.record.supersedesSourceId, 'src_v1');

  const storedV1 = await store.getSource('src_v1');
  const storedV2 = await store.getSource('src_v2');
  assert.ok(storedV1 && storedV2);
  assert.equal(storedV1.extractedText, 'Bulletin v1 text');
  assert.equal(storedV1.supersededBySourceId, 'src_v2');
  assert.equal(storedV2.extractedText, 'Bulletin v2 corrected text');
  assert.equal(storedV2.versionNumber, 2);
});

// =============================================================================
// 6. EVENT MATCHING, SCALE NON-EQUIVALENCE, AND AMBIGUOUS/UNLOCATED CASES
// =============================================================================

test('6. evaluateResearchEventMatch enforces tolerances, scale separation, and unlocated guards', () => {
  const active = makeBoholLikeEqpEvent(); // Ms 7.2, 2013-10-15T00:12:32Z, (9.88, 124.11)

  // Confirmed ID match
  const confirmed = evaluateResearchEventMatch(
    {
      externalEventIds: ['usb000kdb4'],
      originTimeUtc: '2013-10-15T00:12:32.050Z',
      lat: 9.8796,
      lon: 124.1167,
      depthKm: 15.5,
      magnitude: 7.1,
      magnitudeType: 'mww',
    },
    active,
    DEFAULT_RESEARCH_MATCH_TOLERANCES,
    { knownMatchingExternalIds: ['usb000kdb4'] }
  );
  assert.equal(confirmed.state, 'confirmed-id-match');
  assert.equal(confirmed.magnitudeScalesComparable, false);
  assert.ok(confirmed.caveats.some((c) => /NOT treated as numerically equivalent/i.test(c)));

  // Probable spatiotemporal match (unverified!) with Ms vs Mww caveat
  const probable = evaluateResearchEventMatch(
    {
      externalEventIds: ['usb000kdb4'],
      originTimeUtc: '2013-10-15T00:12:32.050Z',
      lat: 9.88,
      lon: 124.12,
      depthKm: 15.0,
      magnitude: 7.1,
      magnitudeType: 'Mww',
    },
    active
  );
  assert.equal(probable.state, 'probable-match');
  assert.equal(probable.magnitudeScalesComparable, false);
  assert.ok(probable.caveats.some((c) => /NOT a scientifically verified/i.test(c)));

  // Ambiguous match (partial/borderline 750s delta, 90 km offset)
  const ambiguous = evaluateResearchEventMatch(
    {
      originTimeUtc: '2013-10-15T00:25:00.000Z',
      lat: 10.6,
      lon: 124.4,
      depthKm: 20,
      magnitude: 5.5,
      magnitudeType: 'Ms',
    },
    active
  );
  assert.equal(ambiguous.state, 'ambiguous-match');

  // Nonmatching event (days apart / far away)
  const nonmatching = evaluateResearchEventMatch(
    {
      originTimeUtc: '2024-01-01T12:00:00.000Z',
      lat: 14.6,
      lon: 121.0,
      depthKm: 10,
      magnitude: 6.0,
      magnitudeType: 'Mww',
    },
    active
  );
  assert.equal(nonmatching.state, 'nonmatching-event');

  // Insufficient evidence: located event with empty candidate metadata
  const insufficientLocated = evaluateResearchEventMatch({}, active);
  assert.equal(insufficientLocated.state, 'insufficient-evidence');
  assert.match(insufficientLocated.explanation, /lacks comparable/i);

  // Insufficient evidence: genuinely unlocated EQP event (iterations === 0, lat === 0, lon === 0)
  const unlocated = makeBoholLikeEqpEvent();
  unlocated.iterations = 0;
  unlocated.lat = 0;
  unlocated.lon = 0;
  const insufficientUnlocated = evaluateResearchEventMatch({}, unlocated);
  assert.equal(insufficientUnlocated.state, 'insufficient-evidence');
  assert.match(insufficientUnlocated.explanation, /unlocated/i);

  // Unlocated EQP event with only timestamp match cannot jump to probable-match without location
  const partialUnlocated = evaluateResearchEventMatch(
    { originTimeUtc: '2013-10-15T00:12:32.000Z', lat: 9.88, lon: 124.11 },
    unlocated
  );
  assert.equal(partialUnlocated.state, 'ambiguous-match');
  assert.equal(partialUnlocated.epicentralDistanceKm, null);
});

// =============================================================================
// 7. SAFE URL VALIDATION, SSRF DNS BLOCKING, REDIRECTS & 401/403 PRESERVATION
// =============================================================================

test('7a. validateSafePublicHttpsUrl & isPrivateOrReservedIp block SSRF vectors cleanly', () => {
  assert.equal(validateSafePublicHttpsUrl('http://phivolcs.dost.gov.ph/test').ok, false);
  assert.equal(validateSafePublicHttpsUrl('https://localhost/test').ok, false);
  assert.equal(validateSafePublicHttpsUrl('https://169.254.169.254/latest/meta-data/').ok, false);
  assert.equal(validateSafePublicHttpsUrl('https://127.0.0.1/admin').ok, false);
  assert.equal(validateSafePublicHttpsUrl('https://user:pass@phivolcs.dost.gov.ph/').ok, false);
  assert.equal(validateSafePublicHttpsUrl('https://phivolcs.dost.gov.ph:8443/').ok, false);
  assert.equal(validateSafePublicHttpsUrl('https://untrusted-blog.example.com/eq').ok, false);

  const okPhiv = validateSafePublicHttpsUrl('https://phivolcs.dost.gov.ph/earthquake-info');
  assert.equal(okPhiv.ok, true);
  assert.equal(okPhiv.allowlistMatch?.organization, 'DOST-PHIVOLCS');

  assert.equal(isPrivateOrReservedIp('127.0.0.1'), true);
  assert.equal(isPrivateOrReservedIp('10.20.30.40'), true);
  assert.equal(isPrivateOrReservedIp('172.16.5.4'), true);
  assert.equal(isPrivateOrReservedIp('192.168.1.1'), true);
  assert.equal(isPrivateOrReservedIp('169.254.169.254'), true);
  assert.equal(isPrivateOrReservedIp('::1'), true);
  assert.equal(isPrivateOrReservedIp('::ffff:127.0.0.1'), true);
  assert.equal(isPrivateOrReservedIp('fe80::1'), true);
  assert.equal(isPrivateOrReservedIp('fc00::1'), true);
  assert.equal(isPrivateOrReservedIp('137.227.224.50'), false); // public IP
});

test('7b. fetchSafePublicDocument blocks DNS private-IP redirects, oversized payloads, disallowed MIME & preserves 403', async () => {
  // Redirect to private-IP host via DNS lookup trap
  const dnsTrap = await fetchSafePublicDocument('https://phivolcs.dost.gov.ph/initial', {
    lookupFn: async (host) =>
      host === 'internal.usgs.gov'
        ? [{ address: '127.0.0.1', family: 4 }]
        : [{ address: '202.90.128.10', family: 4 }],
    fetchFn: async () =>
      new Response(null, {
        status: 302,
        headers: { location: 'https://internal.usgs.gov/secret' },
      }),
  });
  assert.equal(dnsTrap.ok, false);
  assert.equal(dnsTrap.retrievalStatus, 'retrieval-unavailable');
  assert.match(dnsTrap.error ?? '', /Blocked private\/reserved network address/i);

  // Exceeding MAX_RESEARCH_REDIRECTS
  let hops = 0;
  const tooManyRedirects = await fetchSafePublicDocument('https://phivolcs.dost.gov.ph/loop0', {
    lookupFn: async () => [{ address: '202.90.128.10', family: 4 }],
    fetchFn: async () => {
      hops += 1;
      return new Response(null, {
        status: 302,
        headers: { location: `https://phivolcs.dost.gov.ph/loop${hops}` },
      });
    },
  });
  assert.equal(tooManyRedirects.ok, false);
  assert.match(tooManyRedirects.error ?? '', new RegExp(`${MAX_RESEARCH_REDIRECTS} hops`));

  // Disallowed Content-Type
  const badMime = await fetchSafePublicDocument('https://earthquake.usgs.gov/file.bin', {
    lookupFn: async () => [{ address: '137.227.224.50', family: 4 }],
    fetchFn: async () =>
      new Response('binary', {
        status: 200,
        headers: { 'content-type': 'application/octet-stream' },
      }),
  });
  assert.equal(badMime.ok, false);
  assert.match(badMime.error ?? '', /Unsupported or disallowed Content-Type/i);

  // Oversized response via Content-Length
  const oversized = await fetchSafePublicDocument('https://earthquake.usgs.gov/big.txt', {
    lookupFn: async () => [{ address: '137.227.224.50', family: 4 }],
    fetchFn: async () =>
      new Response('ok', {
        status: 200,
        headers: {
          'content-type': 'text/plain',
          'content-length': String(MAX_RESEARCH_FETCH_BYTES + 100),
        },
      }),
  });
  assert.equal(oversized.ok, false);
  assert.match(oversized.error ?? '', /exceeds maximum limit/i);

  // 403 preserves reference with authRequiredOrBlocked = true
  const blocked403 = await fetchSafePublicDocument('https://phivolcs.dost.gov.ph/blocked', {
    lookupFn: async () => [{ address: '202.90.128.10', family: 4 }],
    fetchFn: async () => new Response('Forbidden', { status: 403 }),
  });
  assert.equal(blocked403.ok, false);
  assert.equal(blocked403.retrievalStatus, 'retrieval-unavailable');
  assert.equal(blocked403.httpStatus, 403);
  assert.equal(blocked403.authRequiredOrBlocked, true);
});

// =============================================================================
// 8. NO-KEY & OFFLINE BEHAVIOR
// =============================================================================

test('8. Missing GEMINI_API_KEY yields explicit unavailable states without crashing offline Primer workflow', async () => {
  const prevKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const cap = await inspectGeminiSearchCapability({ runLiveProbe: true });
    assert.equal(cap.configured, false);
    assert.equal(cap.modelUsed, 'gemini-4-hydrogen');
    assert.equal(cap.searchGroundingWorked, false);
    assert.equal(cap.mayIncurCharges, false);
    assert.match(cap.authOrQuotaRestriction ?? '', /GEMINI_API_KEY is not configured/i);

    const active = makeBoholLikeEqpEvent();
    const ctx = buildEventSearchContext(active, 'Sagbayan, Bohol');
    const searchRes = await searchOfficialSourcesWithGemini({
      eventContext: ctx,
      category: 'tsunami-advisory',
    });
    assert.equal(searchRes.ok, false);
    assert.equal(searchRes.unavailable, true);
    assert.equal(searchRes.code, 'NO_API_KEY');
    assert.equal(searchRes.candidates.length, 0);
    assert.match(searchRes.queryUsed, /tsunami/i);
  } finally {
    if (prevKey !== undefined) {
      process.env.GEMINI_API_KEY = prevKey;
    }
  }
});

// =============================================================================
// 9. ZERO AUTOMATIC SCIENTIFIC-FIELD OR PRIMER SECTION MUTATION
// =============================================================================

test('9. Research query, event matching, USGS detail parsing & store imports never mutate EQPEvent or PrimerDocument', async () => {
  const activeEvent = makeBoholLikeEqpEvent();
  const originalEventSnapshot = structuredClone(activeEvent);

  const primer = generateInitialEarthquakePrimer(activeEvent, { trigger: 'manual' });
  // Simulate manually edited section and verify it stays untouched
  primer.sections = primer.sections.map((s) =>
    s.id === 'overview'
      ? { ...s, content: 'OPERATOR VERIFIED OVERVIEW TEXT', isEdited: true }
      : s
  );
  const originalPrimerSnapshot = structuredClone(primer);

  const ctx = buildEventSearchContext(activeEvent, 'Sagbayan, Bohol');
  const query = buildResearchDiscoveryQuery(ctx, 'official-update');
  assert.match(query, /Ms 7\.2/);
  assert.match(query, /2013-10-15/);

  const match = evaluateResearchEventMatch(
    {
      originTimeUtc: '2013-10-15T00:12:32Z',
      lat: 9.88,
      lon: 124.11,
      depthKm: 15,
      magnitude: 7.1,
      magnitudeType: 'Mww',
    },
    activeEvent
  );
  assert.equal(match.state, 'probable-match');

  const store = createMemoryResearchSourceStore();
  await store.importOrAddSource(makeCandidateRecord());

  assert.deepEqual(activeEvent, originalEventSnapshot);
  assert.deepEqual(primer, originalPrimerSnapshot);
  assert.equal(extractVerifiedPrimerParameters(activeEvent).magnitudeValue, 7.2);
});
