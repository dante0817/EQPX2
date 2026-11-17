import assert from 'node:assert/strict';
import test from 'node:test';
import { INITIAL_EVENTS, type EQPEvent } from '../src/data/eqpData.ts';
import {
  buildManualAssistedChannelUrl,
  buildMessageFingerprint,
  buildViberProtocolForwardUrl,
  COMMUNICATION_CHANNEL_ORDER,
  computeDispatchQueueFilterCounts,
  computeTodayDispatchStats,
  containsSensitiveTokenPattern,
  createDefaultDispatchQueueFilterState,
  DEFAULT_COMMS_SETTINGS,
  DISPATCH_QUEUE_FILTER_SESSION_KEY,
  DISPATCH_STATUS_ORDER,
  DISPATCH_STATUS_VISUALS,
  escapeFormulaSafeCsvCell,
  exportDispatchHistoryCsv,
  exportTodayChannelReportCsv,
  filterDispatchQueueRecords,
  filterTodayDispatchHistoryRecords,
  findDuplicateDispatches,
  formatOriginUtcAndPht,
  generateDeterministicMessage,
  getManilaDateKey,
  isRecordStaleAgainstSource,
  isSourceMarkedStale,
  loadDispatchQueueFilterSessionState,
  MOBILE_RECOMMENDED_CHARS,
  type CommunicationDraftSnapshot,
  type DispatchRecord,
  type RecipientDirectory,
  resolveCanonicalBulletinSource,
  resolveUniqueSelectedDestinations,
  sanitizeDispatchQueueFilterState,
  saveDispatchQueueFilterSessionState,
  stripSensitiveCredentialsFromSettings,
  toggleFilterItem,
  validateMobileMessageLength,
  validatePrepareMessageForDispatch,
  validatePublicChannelHandle,
  validateSafeExternalUrl,
  validateSettingsUrlsAndHandle,
  validateXPostLength,
  validateXTwitterHandle,
} from '../src/utils/socialMediaComms.ts';
import type { MagnitudeFreshnessInspection } from '../src/utils/magnitudeEngine.ts';
import { EMPTY_RECIPIENT_DIRECTORY } from '../src/utils/socialMediaRepository.ts';
import { validateSelectedChannelsMessageLength } from '../src/components/SocialMediaPanel.tsx';
import {
  checkAllSocialApiStatuses,
  mockPostFacebookPageFeed,
  mockPostTwitterTweet,
  mockPostViberMessage,
} from '../src/services/socialMediaApi.ts';

function cloneBaseEvent(overrides: Partial<EQPEvent> = {}): EQPEvent {
  const base = structuredClone(INITIAL_EVENTS[0]);
  return {
    ...base,
    ...overrides,
  };
}

const CURRENT_FRESHNESS: MagnitudeFreshnessInspection = {
  status: 'current',
  badgeLabel: 'Current',
  isStale: false,
  isHistoricalSaved: false,
  preferredIsStale: false,
  staleAlgorithmIds: [],
  pendingEvaluationAlgorithmIds: [],
  reasons: [],
};

test('formatOriginUtcAndPht converts UTC explicitly to Asia/Manila without double-shifting local strings', () => {
  const converted = formatOriginUtcAndPht('2026-03-14', '00:15:30');
  assert.match(converted.utc, /^2026-03-14 00:15:30 UTC$/);
  assert.match(converted.pht, /8:15:30\s*AM PHT \(Asia\/Manila\)/i);

  const fallback = formatOriginUtcAndPht('', '', '2026-03-14', '08:15:30');
  assert.match(fallback.pht, /2026-03-14 08:15:30 PHT \(Asia\/Manila · local source\)/);
});

test('resolveCanonicalBulletinSource exposes missing, unverified local, stale, and released states accurately', () => {
  const evDraft = cloneBaseEvent({ webPublished: false });
  const missingSource = resolveCanonicalBulletinSource({
    event: evDraft,
    primaryLocationLabel: '015 km NE of Burgos, Ilocos Norte',
    isBulletinEdited: false,
    hasSavedBulletinOnDisk: false,
  });
  assert.equal(missingSource.sourceStatus, 'MISSING_BULLETIN');
  assert.equal(missingSource.isReleasedSource, false);
  assert.ok(missingSource.warnings.includes('MISSING_BULLETIN'));
  assert.ok(missingSource.warnings.includes('UNVERIFIED_SOURCE'));

  const editedSource = resolveCanonicalBulletinSource({
    event: evDraft,
    primaryLocationLabel: '015 km NE of Burgos, Ilocos Norte',
    isBulletinEdited: true,
    hasSavedBulletinOnDisk: true,
    savedBulletinFilename: 'EV_B1.html',
  });
  assert.equal(editedSource.sourceStatus, 'STALE_SOURCE');
  assert.equal(editedSource.isReleasedSource, false);
  assert.ok(editedSource.warnings.includes('STALE_SOURCE'));

  const localSaved = resolveCanonicalBulletinSource({
    event: cloneBaseEvent({ webPublished: false, ms: 4.8, preferredScale: 'Ms' }),
    primaryLocationLabel: '015 km NE of Burgos, Ilocos Norte',
    isBulletinEdited: false,
    hasSavedBulletinOnDisk: true,
    savedBulletinFilename: 'EV_B1.html',
    freshness: CURRENT_FRESHNESS,
  });
  assert.equal(localSaved.sourceStatus, 'LOCAL_BULLETIN_UNVERIFIED');
  assert.equal(localSaved.isReleasedSource, false);

  const webPublished = resolveCanonicalBulletinSource({
    event: cloneBaseEvent({ webPublished: true, ms: 4.8, preferredScale: 'Ms' }),
    primaryLocationLabel: '015 km NE of Burgos, Ilocos Norte',
    isBulletinEdited: false,
    hasSavedBulletinOnDisk: true,
    savedBulletinFilename: 'EV_B1.html',
    freshness: CURRENT_FRESHNESS,
  });
  assert.equal(webPublished.sourceStatus, 'RELEASED_WEB_PUBLISHED');
  assert.equal(webPublished.isReleasedSource, true);
});

test('generateDeterministicMessage produces all 6 templates, excludes unverified intensities, and adds draft warning when unreleased', () => {
  const ev = cloneBaseEvent({
    webPublished: false,
    ms: 5.1,
    preferredScale: 'Ms',
    intensities: [
      { id: 'i1', locality: 'Burgos, Ilocos Norte', peis: 'IV', reviewStatus: 'verified', category: 'felt' },
      { id: 'i2', locality: 'Laoag City', peis: 'III', reviewStatus: 'draft', category: 'felt' },
      { id: 'i3', locality: 'Batac City', peis: 'V', reviewStatus: 'conflicting', category: 'felt' },
    ],
  });

  const source = resolveCanonicalBulletinSource({
    event: ev,
    primaryLocationLabel: '012 km NW of Burgos, Ilocos Norte',
    isBulletinEdited: false,
    hasSavedBulletinOnDisk: false,
    freshness: CURRENT_FRESHNESS,
  });

  assert.equal(source.verifiedFeltCount, 1);
  assert.equal(source.unverifiedIntensityExcludedCount, 2);

  for (const templateId of [
    'standard_office',
    'concise_viber',
    'concise_messenger',
    'public_summary',
    'x_short',
    'updated_bulletin',
  ] as const) {
    const msg = generateDeterministicMessage(source, templateId);
    assert.ok(msg.subject.length > 0);
    assert.ok(msg.body.length > 0);
    assert.doesNotMatch(msg.body, /Laoag City/);
    assert.doesNotMatch(msg.body, /Batac City/);
    assert.doesNotMatch(msg.body, /aftershock|tsunami warning|casualties/i);
    if (templateId === 'x_short') {
      assert.match(msg.body, /^\[DRAFT\]/);
    } else if (templateId === 'concise_viber' || templateId === 'concise_messenger') {
      assert.match(msg.body, /\[DRAFT \/ UNVERIFIED\]/);
      assert.match(msg.body, /Burgos, Ilocos Norte/);
    } else {
      assert.match(msg.body, /DRAFT \/ UNVERIFIED LOCAL RECORD/);
      assert.match(msg.body, /Burgos, Ilocos Norte/);
    }
  }
});

test('resolveUniqueSelectedDestinations deduplicates overlapping groups and skips inactive entries', () => {
  const directory: RecipientDirectory = {
    offices: [],
    destinations: [
      {
        destinationId: 'D1',
        channel: 'viber',
        displayName: 'NDRRMC Viber Desk',
        destinationIdentifier: '',
        active: true,
        notes: '',
      },
      {
        destinationId: 'D2',
        channel: 'email',
        displayName: 'Region 1 Email',
        destinationIdentifier: 'ops1@example.org',
        active: true,
        notes: '',
      },
      {
        destinationId: 'D3',
        channel: 'email',
        displayName: 'Inactive Desk',
        destinationIdentifier: 'old@example.org',
        active: false,
        notes: '',
      },
    ],
    groups: [
      { groupId: 'G1', groupName: 'Group 1', destinationIds: ['D1', 'D2'], active: true },
      { groupId: 'G2', groupName: 'Group 2', destinationIds: ['D2', 'D3'], active: true },
    ],
  };

  const res = resolveUniqueSelectedDestinations({
    directory,
    selectedDestinationIds: ['D1'],
    selectedGroupIds: ['G1', 'G2'],
  });

  assert.deepEqual(
    res.destinations.map((d) => d.destinationId),
    ['D1', 'D2']
  );
  assert.ok(res.dedupedCount >= 2);
});

test('findDuplicateDispatches catches active matches across queue and history while ignoring CANCELLED', () => {
  const dest = {
    destinationId: 'D1',
    channel: 'email' as const,
    displayName: 'Desk A',
    destinationIdentifier: 'a@example.org',
    active: true,
    notes: '',
  };
  const existing: DispatchRecord[] = [
    {
      dispatchId: 'DSP-1',
      eventId: 'E1',
      eventKey: '20260314_001530',
      sourceBulletinId: 'B1',
      sourceBulletinRevision: 'B1-PUB',
      sourceFingerprint: 'SRC-1',
      communicationRevisionId: 'COMM-r1',
      messageFingerprint: 'MSG-1',
      destinationId: 'D1',
      destinationName: 'Desk A',
      destinationIdentifier: 'a@example.org',
      channel: 'email',
      classification: 'private_office',
      subjectSnapshot: 'Sub',
      messageSnapshot: 'Body',
      createdAt: '2026-03-14T00:00:00Z',
      lastActionAt: '2026-03-14T00:00:00Z',
      status: 'OPERATOR_CONFIRMED_SENT',
      operatorLabel: 'Duty Officer',
      confirmationMethod: 'OPERATOR_MANUAL_CONFIRMATION',
      confirmationAuthenticityLabel: 'OPERATOR-CONFIRMED (LOCAL RECORD)',
    },
    {
      dispatchId: 'DSP-2',
      eventId: 'E1',
      eventKey: '20260314_001530',
      sourceBulletinId: 'B1',
      sourceBulletinRevision: 'B1-PUB',
      sourceFingerprint: 'SRC-1',
      communicationRevisionId: 'COMM-r2',
      messageFingerprint: 'MSG-2',
      destinationId: 'D1',
      destinationName: 'Desk A',
      destinationIdentifier: 'a@example.org',
      channel: 'email',
      classification: 'private_office',
      subjectSnapshot: 'Sub',
      messageSnapshot: 'Body',
      createdAt: '2026-03-14T00:00:00Z',
      lastActionAt: '2026-03-14T00:00:00Z',
      status: 'CANCELLED',
      operatorLabel: 'Duty Officer',
      confirmationMethod: 'UNCONFIRMED',
      confirmationAuthenticityLabel: 'NOT SENT',
    },
  ];

  const dupR1 = findDuplicateDispatches({
    destinations: [dest],
    eventKey: '20260314_001530',
    sourceBulletinRevision: 'B1-PUB',
    communicationRevisionId: 'COMM-r1',
    existingRecords: existing,
  });
  assert.equal(dupR1.length, 1);

  const dupR2 = findDuplicateDispatches({
    destinations: [dest],
    eventKey: '20260314_001530',
    sourceBulletinRevision: 'B1-PUB',
    communicationRevisionId: 'COMM-r2',
    existingRecords: existing,
  });
  assert.equal(dupR2.length, 0);
});

test('URL validation, manual channel URLs, staleness, X post length, and formula-safe CSV work properly', () => {
  assert.equal(validateSafeExternalUrl('javascript:alert(1)', ['https:']).valid, false);
  assert.equal(validateSafeExternalUrl('data:text/html,hi', ['https:']).valid, false);
  assert.equal(validateSafeExternalUrl('https://facebook.com/page', ['https:']).valid, true);

  const fbUnsupported = buildManualAssistedChannelUrl({
    channel: 'facebook',
    destinationIdentifier: '',
    subject: 'S',
    body: 'B',
    settings: DEFAULT_COMMS_SETTINGS,
  });
  assert.equal(fbUnsupported.isSupported, false);

  const mailHandoff = buildManualAssistedChannelUrl({
    channel: 'email',
    destinationIdentifier: 'desk@example.org',
    subject: 'EQ Bulletin',
    body: 'Line 1',
    settings: DEFAULT_COMMS_SETTINGS,
  });
  assert.equal(mailHandoff.isSupported, true);
  assert.match(mailHandoff.url!, /^mailto:desk%40example\.org\?subject=EQ%20Bulletin/);

  assert.equal(isRecordStaleAgainstSource('SRC-AAA', 'SRC-BBB'), true);
  assert.equal(isRecordStaleAgainstSource('SRC-AAA', 'SRC-AAA'), false);

  assert.equal(validateXPostLength('A'.repeat(281), 280).valid, false);
  assert.equal(validateXPostLength('A'.repeat(280), 280).valid, true);

  // Formula injection protection
  assert.equal(escapeFormulaSafeCsvCell('=CMD()'), "'=CMD()");
  assert.equal(escapeFormulaSafeCsvCell(' +1+2'), "' +1+2");
  assert.equal(escapeFormulaSafeCsvCell('@SUM(A1:A2)'), "'@SUM(A1:A2)");
  assert.equal(escapeFormulaSafeCsvCell('-10'), "'-10");

  const csv = exportDispatchHistoryCsv([
    {
      dispatchId: 'D1',
      eventId: 'E1',
      eventKey: '2026_1',
      sourceBulletinId: 'B1',
      sourceBulletinRevision: 'B1-PUB',
      sourceFingerprint: 'SRC-1',
      communicationRevisionId: 'COMM-r1',
      messageFingerprint: buildMessageFingerprint('standard_office', 'private_office', 'S', '=Evil'),
      destinationId: 'DEST1',
      destinationName: 'Desk',
      destinationIdentifier: 'desk@example.org',
      channel: 'email',
      classification: 'private_office',
      subjectSnapshot: 'S',
      messageSnapshot: '=EVIL_FORMULA()',
      createdAt: '2026-03-14T00:00:00Z',
      lastActionAt: '2026-03-14T00:00:00Z',
      status: 'OPERATOR_CONFIRMED_SENT',
      operatorLabel: 'Duty Officer',
      confirmationMethod: 'OPERATOR_MANUAL_CONFIRMATION',
      confirmationAuthenticityLabel: 'OPERATOR-CONFIRMED (LOCAL RECORD)',
      notes: '+malicious',
    },
  ]);
  assert.match(csv, /Bulletin ID/);
  assert.match(csv, /Sent Confirmed At/);
  assert.match(csv, /'\=EVIL_FORMULA\(\)/);
  assert.match(csv, /'\+malicious/);

  // Zero hardcoded contacts in EMPTY_RECIPIENT_DIRECTORY
  assert.equal(EMPTY_RECIPIENT_DIRECTORY.offices.length, 0);
  assert.equal(EMPTY_RECIPIENT_DIRECTORY.destinations.length, 0);
  assert.equal(EMPTY_RECIPIENT_DIRECTORY.groups.length, 0);
});

test('all 6 Prepare Message templates generate repeatable distinct formats for released bulletins', () => {
  const releasedEv = cloneBaseEvent({
    webPublished: true,
    bulletinNo: 2,
    ms: 5.4,
    preferredScale: 'Ms',
  });
  const source = resolveCanonicalBulletinSource({
    event: releasedEv,
    primaryLocationLabel: '018 km SE of Burgos, Ilocos Norte',
    isBulletinEdited: false,
    hasSavedBulletinOnDisk: true,
    savedBulletinFilename: 'EV_B2.html',
    officialBulletinUrl: 'https://earthquake.phivolcs.dost.gov.ph/',
    freshness: CURRENT_FRESHNESS,
  });

  assert.equal(source.isReleasedSource, true);

  const std1 = generateDeterministicMessage(source, 'standard_office');
  const std2 = generateDeterministicMessage(source, 'standard_office');
  assert.deepEqual(std1, std2);
  assert.doesNotMatch(std1.body, /DRAFT/);
  assert.match(std1.body, /EARTHQUAKE INFORMATION NO\. 2/);
  assert.match(std1.body, /Origin Date\/Time \(UTC\):/);

  const viber = generateDeterministicMessage(source, 'concise_viber');
  assert.match(viber.body, /EARTHQUAKE INFO NO\. 2 \(B2-PUB\)/);
  assert.match(viber.body, /Mag:/);

  const messenger = generateDeterministicMessage(source, 'concise_messenger');
  assert.match(messenger.body, /EQ INFO #2 \(B2-PUB\)/);
  assert.match(messenger.body, /Depth:/);

  const pubSummary = generateDeterministicMessage(source, 'public_summary');
  assert.match(pubSummary.body, /^Earthquake Information No\. 2/);
  assert.match(pubSummary.body, /Depth of Focus:/);

  const xShort = generateDeterministicMessage(source, 'x_short');
  assert.doesNotMatch(xShort.body, /^\[DRAFT\]/);
  assert.match(xShort.body, /^EQ Info No\. 2:/);
  assert.ok(xShort.body.includes('https://earthquake.phivolcs.dost.gov.ph/'));

  const updated = generateDeterministicMessage(source, 'updated_bulletin');
  assert.match(updated.subject, /^UPDATED Earthquake Bulletin No\. 2/);
  assert.match(updated.body, /UPDATED EARTHQUAKE BULLETIN NOTICE/);
});

test('mobile-first templates (Viber & Messenger) respect recommended character budgets and summarize overflow verified intensities', () => {
  const crowdedEv = cloneBaseEvent({
    webPublished: true,
    bulletinNo: 3,
    ms: 6.1,
    preferredScale: 'Ms',
    intensities: [
      { id: 'i1', locality: 'Burgos, Ilocos Norte', peis: 'VI', reviewStatus: 'verified', category: 'felt' },
      { id: 'i2', locality: 'Laoag City, Ilocos Norte', peis: 'V', reviewStatus: 'verified', category: 'felt' },
      { id: 'i3', locality: 'Batac City, Ilocos Norte', peis: 'V', reviewStatus: 'verified', category: 'felt' },
      { id: 'i4', locality: 'Paoay, Ilocos Norte', peis: 'IV', reviewStatus: 'verified', category: 'felt' },
      { id: 'i5', locality: 'Vigan City, Ilocos Sur', peis: 'IV', reviewStatus: 'verified', category: 'felt' },
      { id: 'i6', locality: 'Bangued, Abra', peis: 'III', reviewStatus: 'verified', category: 'felt' },
      { id: 'i7', locality: 'Tuguegarao City, Cagayan', peis: 'II', reviewStatus: 'verified', category: 'felt' },
    ],
  });

  const source = resolveCanonicalBulletinSource({
    event: crowdedEv,
    primaryLocationLabel: '018 km SE of Burgos, Ilocos Norte',
    isBulletinEdited: false,
    hasSavedBulletinOnDisk: true,
    savedBulletinFilename: 'EV_B3.html',
    officialBulletinUrl: 'https://earthquake.phivolcs.dost.gov.ph/',
    freshness: CURRENT_FRESHNESS,
  });

  const viber = generateDeterministicMessage(source, 'concise_viber');
  const viberCheck = validateMobileMessageLength('viber', viber.body);
  assert.equal(viberCheck.maxRecommended, MOBILE_RECOMMENDED_CHARS.viber);
  assert.equal(viberCheck.fits, true, `Expected Viber length <= ${MOBILE_RECOMMENDED_CHARS.viber}, got ${viber.body.length}`);
  assert.ok(viber.body.includes('https://earthquake.phivolcs.dost.gov.ph/'));
  assert.match(viber.body, /\(\+\d+ more verified\)/);

  const messenger = generateDeterministicMessage(source, 'concise_messenger');
  const messengerCheck = validateMobileMessageLength('messenger', messenger.body);
  assert.equal(messengerCheck.maxRecommended, MOBILE_RECOMMENDED_CHARS.messenger);
  assert.equal(messengerCheck.fits, true, `Expected Messenger length <= ${MOBILE_RECOMMENDED_CHARS.messenger}, got ${messenger.body.length}`);
  assert.ok(messenger.body.includes('https://earthquake.phivolcs.dost.gov.ph/'));

  const overflowCheck = validateMobileMessageLength('messenger', 'M'.repeat(400));
  assert.equal(overflowCheck.fits, false);
  assert.equal(overflowCheck.overflow, 40);
});

test('computeTodayDispatchStats deduplicates queue and history and aggregates Asia/Manila daily totals', () => {
  const now = new Date('2026-11-17T09:15:00+08:00');
  assert.equal(getManilaDateKey(now), '2026-11-17');
  // 2026-11-16 15:59 UTC is 23:59 PHT on 2026-11-16 (yesterday in Manila)
  assert.equal(getManilaDateKey('2026-11-16T15:59:00Z'), '2026-11-16');

  const mkRecord = (
    dispatchId: string,
    status: DispatchRecord['status'],
    lastActionAt: string
  ): DispatchRecord => ({
    dispatchId,
    eventId: 'E1',
    eventKey: '20261117_010000',
    sourceBulletinId: 'B1',
    sourceBulletinRevision: 'B1-PUB',
    sourceFingerprint: 'SRC-1',
    communicationRevisionId: 'COMM-r1',
    messageFingerprint: 'MSG-1',
    destinationId: `DEST-${dispatchId}`,
    destinationName: `Desk ${dispatchId}`,
    destinationIdentifier: 'ops@example.org',
    channel: 'viber',
    classification: 'private_office',
    subjectSnapshot: 'Sub',
    messageSnapshot: 'Body',
    createdAt: lastActionAt,
    lastActionAt,
    status,
    operatorLabel: 'Duty Officer',
    confirmationMethod:
      status === 'OPERATOR_CONFIRMED_SENT'
        ? 'OPERATOR_MANUAL_CONFIRMATION'
        : 'UNCONFIRMED',
    confirmationAuthenticityLabel:
      status === 'OPERATOR_CONFIRMED_SENT'
        ? 'OPERATOR-CONFIRMED (LOCAL RECORD)'
        : 'NOT SENT',
  });

  const sharedConfirmed = mkRecord('D-CONF', 'OPERATOR_CONFIRMED_SENT', '2026-11-17T01:00:00Z'); // 09:00 PHT Nov 17
  const queue: DispatchRecord[] = [
    sharedConfirmed,
    mkRecord('D-OPEN', 'OPENED_EXTERNALLY', '2026-11-17T00:30:00Z'), // 08:30 PHT Nov 17
    mkRecord('D-FAIL', 'FAILED', '2026-11-17T00:45:00Z'), // 08:45 PHT Nov 17
    mkRecord('D-PREP', 'PREPARED', '2026-11-17T00:50:00Z'), // staged, awaiting handoff
    mkRecord('D-CANC', 'CANCELLED', '2026-11-17T00:55:00Z'),
    mkRecord('D-YEST', 'OPERATOR_CONFIRMED_SENT', '2026-11-16T15:59:00Z'), // 23:59 PHT Nov 16
  ];
  const history: DispatchRecord[] = [
    sharedConfirmed, // duplicated in queue & history -> must count once!
    mkRecord('D-FAIL', 'FAILED', '2026-11-17T00:45:00Z'), // also in history -> must count once!
  ];

  const stats = computeTodayDispatchStats(queue, history, now);
  assert.equal(stats.dateKeyPht, '2026-11-17');
  assert.equal(stats.confirmedSentToday, 1);
  assert.equal(stats.failedToday, 1);
  assert.equal(stats.attemptedToday, 3); // confirmed + failed + opened_externally
  assert.equal(stats.pendingPreparedToday, 1);
  assert.equal(stats.cancelledToday, 1);
});

test('validatePrepareMessageForDispatch blocks dispatching when bulletin source is STALE or revisions mismatch', () => {
  const staleEv = cloneBaseEvent({
    webPublished: true,
    bulletinNo: 2,
    ms: 5.2,
    preferredScale: 'Ms',
  });
  const staleSource = resolveCanonicalBulletinSource({
    event: staleEv,
    primaryLocationLabel: '015 km NE of Burgos, Ilocos Norte',
    isBulletinEdited: true, // marks bulletin source as STALE_SOURCE
    hasSavedBulletinOnDisk: true,
    savedBulletinFilename: 'EV_B2.html',
    freshness: CURRENT_FRESHNESS,
  });

  assert.equal(staleSource.sourceStatus, 'STALE_SOURCE');
  assert.equal(isSourceMarkedStale(staleSource), true);

  const generatedStale = generateDeterministicMessage(staleSource, 'standard_office');
  const matchingFingerprintDraft: CommunicationDraftSnapshot = {
    draftId: 'DRAFT-1',
    eventId: staleSource.eventId,
    eventKey: staleSource.eventKey,
    templateId: 'standard_office',
    classification: 'private_office',
    subject: generatedStale.subject,
    body: generatedStale.body,
    communicationRevisionId: 'COMM-r1',
    messageFingerprint: buildMessageFingerprint(
      'standard_office',
      'private_office',
      generatedStale.subject,
      generatedStale.body
    ),
    sourceBulletinId: staleSource.bulletinId,
    sourceBulletinRevision: staleSource.bulletinRevision,
    sourceFingerprint: staleSource.sourceFingerprint,
    editedFromTemplate: false,
    localAuthorization: null,
    createdAt: '2026-11-17T01:00:00Z',
    updatedAt: '2026-11-17T01:00:00Z',
  };

  const dest = {
    destinationId: 'DEST-1',
    channel: 'viber' as const,
    displayName: 'RDRRMC Viber Desk',
    destinationIdentifier: '',
    active: true,
    notes: '',
  };

  // Even for private_office with matching draft fingerprint, STALE bulletin source must block dispatch!
  const staleValidation = validatePrepareMessageForDispatch({
    source: staleSource,
    draft: matchingFingerprintDraft,
    selectedDestinations: [dest],
    xMaxChars: 280,
  });
  assert.equal(staleValidation.canDispatch, false);
  assert.equal(staleValidation.isSourceStale, true);
  assert.ok(staleValidation.blockingCodes.includes('SOURCE_MARKED_STALE'));

  // Fresh saved local source allows private_office when draft & revision match
  const freshSource = resolveCanonicalBulletinSource({
    event: cloneBaseEvent({ webPublished: false, bulletinNo: 2, ms: 5.2, preferredScale: 'Ms' }),
    primaryLocationLabel: '015 km NE of Burgos, Ilocos Norte',
    isBulletinEdited: false,
    hasSavedBulletinOnDisk: true,
    savedBulletinFilename: 'EV_B2.html',
    freshness: CURRENT_FRESHNESS,
  });
  assert.equal(isSourceMarkedStale(freshSource), false);

  const freshDraft: CommunicationDraftSnapshot = {
    ...matchingFingerprintDraft,
    sourceBulletinId: freshSource.bulletinId,
    sourceBulletinRevision: freshSource.bulletinRevision,
    sourceFingerprint: freshSource.sourceFingerprint,
  };
  const freshAllowed = validatePrepareMessageForDispatch({
    source: freshSource,
    draft: freshDraft,
    selectedDestinations: [dest],
    xMaxChars: 280,
  });
  assert.equal(freshAllowed.canDispatch, true);
  assert.equal(freshAllowed.blockingCodes.length, 0);

  // Stale draft fingerprint against fresh source must also be blocked
  const staleDraftCheck = validatePrepareMessageForDispatch({
    source: freshSource,
    draft: matchingFingerprintDraft,
    selectedDestinations: [dest],
    xMaxChars: 280,
  });
  assert.equal(staleDraftCheck.canDispatch, false);
  assert.equal(staleDraftCheck.isDraftStale, true);
  assert.ok(staleDraftCheck.blockingCodes.includes('DRAFT_STALE_AGAINST_SOURCE'));

  // Revision mismatch must be caught even if fingerprint wasn't updated properly
  const revMismatchCheck = validatePrepareMessageForDispatch({
    source: freshSource,
    draft: {
      ...freshDraft,
      sourceBulletinRevision: 'B1-SAVED',
    },
    selectedDestinations: [dest],
    xMaxChars: 280,
  });
  assert.equal(revMismatchCheck.canDispatch, false);
  assert.equal(revMismatchCheck.hasRevisionMismatch, true);
  assert.ok(revMismatchCheck.blockingCodes.includes('REVISION_MISMATCH'));
});

test('exportTodayChannelReportCsv exports today Asia/Manila dispatch history with UTF-8 BOM, CRLF, and formula injection escaping', () => {
  const now = new Date('2026-11-17T10:30:00+08:00');
  const todaySent: DispatchRecord = {
    dispatchId: 'DSP-TODAY-1',
    eventId: 'E1',
    eventKey: '20261117_020000',
    sourceBulletinId: 'EV_20261117_B1.html',
    sourceBulletinRevision: 'B1-PUB',
    sourceFingerprint: 'SRC-1',
    communicationRevisionId: 'COMM-r1',
    messageFingerprint: 'MSG-1',
    destinationId: 'DEST-1',
    destinationName: '=HYPERLINK("http://evil.example","Desk")',
    destinationIdentifier: 'ops@example.org',
    channel: 'viber',
    classification: 'private_office',
    subjectSnapshot: '@SUM(1+1) Earthquake Info',
    messageSnapshot: '+CMD|"/C calc"!A0\nSecond line',
    createdAt: '2026-11-17T01:00:00Z',
    sentConfirmedAt: '2026-11-17T02:15:00Z', // 10:15 PHT on 2026-11-17
    lastActionAt: '2026-11-17T02:15:00Z',
    status: 'OPERATOR_CONFIRMED_SENT',
    operatorLabel: ' -Operator',
    confirmationMethod: 'OPERATOR_MANUAL_CONFIRMATION',
    confirmationAuthenticityLabel: 'OPERATOR-CONFIRMED (LOCAL RECORD)',
    externalReference: '=1+1',
    notes: ' @test',
  };

  const yesterdayRecord: DispatchRecord = {
    ...todaySent,
    dispatchId: 'DSP-YEST-1',
    destinationName: 'Yesterday Desk',
    createdAt: '2026-11-16T15:30:00Z',
    sentConfirmedAt: '2026-11-16T15:59:59Z', // 23:59:59 PHT on 2026-11-16
    lastActionAt: '2026-11-16T15:59:59Z',
  };

  const filtered = filterTodayDispatchHistoryRecords([todaySent, yesterdayRecord], now);
  assert.equal(filtered.dateKeyPht, '2026-11-17');
  assert.equal(filtered.records.length, 1);
  assert.equal(filtered.records[0].dispatchId, 'DSP-TODAY-1');

  const report = exportTodayChannelReportCsv([todaySent, yesterdayRecord], now);
  assert.equal(report.filename, 'eqp_channel_export_2026-11-17.csv');
  assert.equal(report.rowCount, 1);
  assert.equal(report.csv.startsWith('\uFEFF'), true);
  assert.ok(report.csv.includes('\r\n'));
  assert.doesNotMatch(report.csv, /Yesterday Desk/);
  // Formula characters must be escaped with leading single quote
  assert.match(report.csv, /'\=HYPERLINK/);
  assert.match(report.csv, /'\@SUM\(1\+1\)/);
  assert.match(report.csv, /'\+CMD\|/);
  assert.match(report.csv, /' -Operator/);
  assert.match(report.csv, /'\=1\+1/);
  assert.match(report.csv, /' \@test/);
});

test('validateSelectedChannelsMessageLength detects Length Exceeded across selected channels', () => {
  const xDest = {
    destinationId: 'D-X',
    channel: 'x_twitter' as const,
    displayName: 'Official X Feed',
    destinationIdentifier: 'https://x.com/intent/tweet',
    active: true,
    notes: '',
  };
  const viberDest = {
    destinationId: 'D-VB',
    channel: 'viber' as const,
    displayName: 'Viber Ops Desk',
    destinationIdentifier: '',
    active: true,
    notes: '',
  };

  const okCheck = validateSelectedChannelsMessageLength('EQ Info #1 M5.0', [xDest, viberDest], 280);
  assert.equal(okCheck.valid, true);
  assert.equal(okCheck.errorTitle, null);
  assert.equal(okCheck.violations.length, 0);

  const breachCheck = validateSelectedChannelsMessageLength('X'.repeat(295), [xDest, viberDest], 280);
  assert.equal(breachCheck.valid, false);
  assert.equal(breachCheck.errorTitle, 'Length Exceeded');
  assert.equal(breachCheck.violations.length, 1);
  assert.equal(breachCheck.violations[0].channel, 'x_twitter');
  assert.equal(breachCheck.violations[0].overflow, 15);
  assert.match(breachCheck.errorMessage || '', /Length Exceeded/);
});

test('socialMediaApi mock service layer reports COM-1 stub statuses and validates mock payloads', async () => {
  const statuses = await checkAllSocialApiStatuses({
    viber: 'https://invite.viber.com/test',
    facebook: '',
    x_twitter: 'https://x.com/intent/tweet',
  });
  assert.equal(statuses.length, 3);
  for (const s of statuses) {
    assert.equal(s.credentialsConfigured, false);
    assert.equal(s.autoPublishEnabled, false);
  }
  assert.equal(statuses.find((s) => s.provider === 'viber')?.status, 'MOCK_SANDBOX_READY');
  assert.equal(statuses.find((s) => s.provider === 'facebook')?.status, 'MANUAL_ASSISTED_ONLY');

  const viberOk = await mockPostViberMessage({
    eventId: 'EV-1',
    bulletinId: 'EV_B1',
    message: 'EQ Info M4.5 test',
  });
  assert.equal(viberOk.ok, true);
  assert.equal(viberOk.mocked, true);
  assert.equal(viberOk.httpStatus, 202);

  const fbOk = await mockPostFacebookPageFeed({
    eventId: 'EV-1',
    bulletinId: 'EV_B1',
    message: 'EQ Info M4.5 Facebook test',
  });
  assert.equal(fbOk.ok, true);
  assert.equal(fbOk.httpStatus, 202);

  const twFail = await mockPostTwitterTweet(
    {
      eventId: 'EV-1',
      bulletinId: 'EV_B1',
      message: 'T'.repeat(281),
    },
    280
  );
  assert.equal(twFail.ok, false);
  assert.equal(twFail.httpStatus, 422);
  assert.match(twFail.message, /Length Exceeded/);
});

test('buildViberProtocolForwardUrl builds properly encoded viber://forward URLs and serves as Viber fallback', () => {
  const sampleMessage = 'EARTHQUAKE INFO NO. 1\nMag: 5.2 Ms\nLoc: 015 km NE of Burgos, Ilocos Norte';
  const url = buildViberProtocolForwardUrl(sampleMessage);
  assert.ok(url.startsWith('viber://forward?text='));
  const encodedPayload = url.slice('viber://forward?text='.length);
  assert.equal(decodeURIComponent(encodedPayload), sampleMessage);

  const manualViber = buildManualAssistedChannelUrl({
    channel: 'viber',
    destinationIdentifier: '',
    subject: 'EQ Info',
    body: sampleMessage,
    settings: DEFAULT_COMMS_SETTINGS,
  });
  assert.equal(manualViber.isSupported, true);
  assert.equal(manualViber.url, url);
});

test('filterDispatchQueueRecords and computeDispatchQueueFilterCounts filter by status, channel, and event scope', () => {
  const mkItem = (
    id: string,
    status: DispatchRecord['status'],
    channel: DispatchRecord['channel'],
    eventKey = '20261117_010000'
  ): DispatchRecord => ({
    dispatchId: id,
    eventId: eventKey,
    eventKey,
    sourceBulletinId: 'B1',
    sourceBulletinRevision: 'B1-PUB',
    sourceFingerprint: 'SRC-1',
    communicationRevisionId: 'COMM-r1',
    messageFingerprint: 'MSG-1',
    destinationId: `D-${id}`,
    destinationName: `Dest ${id}`,
    destinationIdentifier: '',
    channel,
    classification: 'private_office',
    subjectSnapshot: 'Sub',
    messageSnapshot: 'Body',
    createdAt: '2026-11-17T01:00:00Z',
    lastActionAt: '2026-11-17T01:00:00Z',
    status,
    operatorLabel: 'Duty Officer',
    confirmationMethod:
      status === 'OPERATOR_CONFIRMED_SENT'
        ? 'OPERATOR_MANUAL_CONFIRMATION'
        : 'UNCONFIRMED',
    confirmationAuthenticityLabel:
      status === 'OPERATOR_CONFIRMED_SENT'
        ? 'OPERATOR-CONFIRMED (LOCAL RECORD)'
        : 'NOT SENT',
  });

  const records: DispatchRecord[] = [
    mkItem('1', 'PREPARED', 'viber'),
    mkItem('2', 'OPERATOR_CONFIRMED_SENT', 'viber'),
    mkItem('3', 'FAILED', 'facebook'),
    mkItem('4', 'OPERATOR_CONFIRMED_SENT', 'x_twitter'),
    mkItem('5', 'PREPARED', 'email', '20261116_230000'),
  ];

  const countsAll = computeDispatchQueueFilterCounts(records);
  assert.equal(countsAll.totalInScope, 5);
  assert.equal(countsAll.byStatus.PREPARED, 2);
  assert.equal(countsAll.byStatus.OPERATOR_CONFIRMED_SENT, 2);
  assert.equal(countsAll.byStatus.FAILED, 1);
  assert.equal(countsAll.byChannel.viber, 2);
  assert.equal(countsAll.byChannel.facebook, 1);
  assert.equal(countsAll.byChannel.x_twitter, 1);
  assert.equal(countsAll.byChannel.email, 1);

  const preparedViber = filterDispatchQueueRecords(records, {
    statusFilter: 'PREPARED',
    channelFilter: 'viber',
  });
  assert.deepEqual(
    preparedViber.map((r) => r.dispatchId),
    ['1']
  );

  const confirmedOnly = filterDispatchQueueRecords(records, {
    statusFilter: 'OPERATOR_CONFIRMED_SENT',
    channelFilter: 'ALL',
  });
  assert.deepEqual(
    confirmedOnly.map((r) => r.dispatchId),
    ['2', '4']
  );

  const failedFacebook = filterDispatchQueueRecords(records, {
    statusFilter: 'FAILED',
    channelFilter: 'facebook',
  });
  assert.deepEqual(
    failedFacebook.map((r) => r.dispatchId),
    ['3']
  );

  const scopedToEvent = filterDispatchQueueRecords(records, {
    statusFilter: 'PREPARED',
    channelFilter: 'ALL',
    activeEventKey: '20261117_010000',
  });
  assert.deepEqual(
    scopedToEvent.map((r) => r.dispatchId),
    ['1']
  );

  // Multi-select status and channel filtering
  const preparedOrFailedViberOrFb = filterDispatchQueueRecords(records, {
    selectedStatuses: ['PREPARED', 'FAILED'],
    selectedChannels: ['viber', 'facebook'],
  });
  assert.deepEqual(
    preparedOrFailedViberOrFb.map((r) => r.dispatchId),
    ['1', '3']
  );

  const sentMultiChannel = filterDispatchQueueRecords(records, {
    selectedStatuses: ['OPERATOR_CONFIRMED_SENT'],
    selectedChannels: ['viber', 'x_twitter'],
  });
  assert.deepEqual(
    sentMultiChannel.map((r) => r.dispatchId),
    ['2', '4']
  );

  const noneSelectedStatuses = filterDispatchQueueRecords(records, {
    selectedStatuses: [],
    selectedChannels: ['viber', 'facebook', 'x_twitter', 'email'],
  });
  assert.deepEqual(noneSelectedStatuses, []);

  const noneSelectedChannels = filterDispatchQueueRecords(records, {
    selectedStatuses: ['PREPARED', 'FAILED', 'OPERATOR_CONFIRMED_SENT'],
    selectedChannels: [],
  });
  assert.deepEqual(noneSelectedChannels, []);
});

test('toggleFilterItem and DispatchQueueFilterSessionState persist and sanitize session filters', () => {
  const toggledOff = toggleFilterItem(
    ['PREPARED', 'FAILED', 'CANCELLED'],
    'FAILED',
    DISPATCH_STATUS_ORDER
  );
  assert.deepEqual(toggledOff, ['PREPARED', 'CANCELLED']);

  const toggledOnSorted = toggleFilterItem(
    ['CANCELLED', 'PREPARED'],
    'OPENED_EXTERNALLY',
    DISPATCH_STATUS_ORDER
  );
  assert.deepEqual(toggledOnSorted, ['PREPARED', 'OPENED_EXTERNALLY', 'CANCELLED']);

  // Mock sessionStorage
  const storeMap = new Map<string, string>();
  const mockSessionStorage = {
    getItem: (k: string) => storeMap.get(k) ?? null,
    setItem: (k: string, v: string) => {
      storeMap.set(k, v);
    },
  };

  // Defaults when storage is empty
  const initial = loadDispatchQueueFilterSessionState(mockSessionStorage);
  assert.deepEqual(initial, createDefaultDispatchQueueFilterState());

  // Save custom multi-select state and reload it
  saveDispatchQueueFilterSessionState(
    {
      selectedStatuses: ['PREPARED', 'FAILED'],
      selectedChannels: ['viber', 'email'],
      activeEventOnly: true,
    },
    mockSessionStorage
  );
  const reloaded = loadDispatchQueueFilterSessionState(mockSessionStorage);
  assert.deepEqual(reloaded, {
    selectedStatuses: ['PREPARED', 'FAILED'],
    selectedChannels: ['viber', 'email'],
    activeEventOnly: true,
  });

  // Explicitly empty arrays remain empty when saved
  saveDispatchQueueFilterSessionState(
    {
      selectedStatuses: [],
      selectedChannels: ['x_twitter'],
      activeEventOnly: false,
    },
    mockSessionStorage
  );
  const reloadedEmptyStatuses = loadDispatchQueueFilterSessionState(mockSessionStorage);
  assert.deepEqual(reloadedEmptyStatuses.selectedStatuses, []);
  assert.deepEqual(reloadedEmptyStatuses.selectedChannels, ['x_twitter']);

  // Sanitize invalid entries and malformed JSON safely
  const sanitized = sanitizeDispatchQueueFilterState({
    selectedStatuses: ['PREPARED', 'BOGUS_STATUS', 'FAILED'],
    selectedChannels: ['viber', 'not_a_channel'],
    activeEventOnly: 'yes',
  });
  assert.deepEqual(sanitized, {
    selectedStatuses: ['PREPARED', 'FAILED'],
    selectedChannels: ['viber'],
    activeEventOnly: true,
  });

  mockSessionStorage.setItem(DISPATCH_QUEUE_FILTER_SESSION_KEY, '{not-valid-json');
  assert.deepEqual(
    loadDispatchQueueFilterSessionState(mockSessionStorage),
    createDefaultDispatchQueueFilterState()
  );
  assert.deepEqual(
    COMMUNICATION_CHANNEL_ORDER,
    ['viber', 'facebook', 'messenger', 'x_twitter', 'email', 'other']
  );
});

test('validateSettingsUrlsAndHandle validates destination URLs & X/Twitter handle while blocking sensitive access tokens', () => {
  const validHandle = validateXTwitterHandle('phivolcs_eqp');
  assert.equal(validHandle.valid, true);
  assert.equal(validHandle.normalizedHandle, '@phivolcs_eqp');

  assert.equal(containsSensitiveTokenPattern('https://example.org/?access_token=abc123'), true);
  assert.equal(containsSensitiveTokenPattern('Bearer eyJhbGciOiJIUzI1NiJ9.xyz'), true);

  const validSettings = validateSettingsUrlsAndHandle({
    ...DEFAULT_COMMS_SETTINGS,
    xHandle: 'phivolcs_eqp',
    officialBulletinUrl: 'https://earthquake.phivolcs.dost.gov.ph/',
    authorizedChannelUrls: {
      viber: 'https://invite.viber.com/testgroup',
      facebook: 'https://www.facebook.com/PHIVOLCS',
      messenger: 'https://www.messenger.com/t/123456',
      x_twitter: 'https://x.com/intent/tweet',
      other: 'https://ops.example.org/portal',
    },
  });
  assert.equal(validSettings.valid, true);
  assert.equal(validSettings.normalizedSettings.xHandle, '@phivolcs_eqp');

  // X intent URL should include via attribute when xHandle is configured
  const xIntent = buildManualAssistedChannelUrl({
    channel: 'x_twitter',
    destinationIdentifier: '',
    subject: 'EQ',
    body: 'EQ Info M5.0',
    settings: validSettings.normalizedSettings,
  });
  assert.equal(xIntent.isSupported, true);
  assert.ok(xIntent.url?.includes('via=phivolcs_eqp'));

  // Reject sensitive token embedded in URL or handle
  const rejectedTokens = validateSettingsUrlsAndHandle({
    ...DEFAULT_COMMS_SETTINGS,
    xHandle: 'Bearer secret_token_value',
    authorizedChannelUrls: {
      ...DEFAULT_COMMS_SETTINGS.authorizedChannelUrls,
      facebook: 'https://facebook.com/page?access_token=SUPERSECRET',
      viber: 'javascript:alert(1)',
    },
  });
  assert.equal(rejectedTokens.valid, false);
  assert.ok(rejectedTokens.fieldErrors.xHandle);
  assert.ok(rejectedTokens.fieldErrors.facebook);
  assert.ok(rejectedTokens.fieldErrors.viber);
});

test('DISPATCH_STATUS_VISUALS defines consistent color coding and legend descriptions for all 5 dispatch statuses', () => {
  assert.deepEqual([...DISPATCH_STATUS_ORDER], [
    'PREPARED',
    'OPENED_EXTERNALLY',
    'OPERATOR_CONFIRMED_SENT',
    'FAILED',
    'CANCELLED',
  ]);
  for (const status of DISPATCH_STATUS_ORDER) {
    const meta = DISPATCH_STATUS_VISUALS[status];
    assert.equal(meta.status, status);
    assert.ok(meta.pillClass.length > 0);
    assert.ok(meta.dotClass.length > 0);
    assert.ok(meta.legendCardClass.length > 0);
    assert.ok(meta.description.length > 20);
  }
  assert.match(DISPATCH_STATUS_VISUALS.OPERATOR_CONFIRMED_SENT.pillClass, /emerald/);
  assert.match(DISPATCH_STATUS_VISUALS.PREPARED.pillClass, /amber/);
  assert.match(DISPATCH_STATUS_VISUALS.OPENED_EXTERNALLY.pillClass, /sky/);
  assert.match(DISPATCH_STATUS_VISUALS.FAILED.pillClass, /rose/);
  assert.match(DISPATCH_STATUS_VISUALS.CANCELLED.pillClass, /slate/);
});

test('official channel handles validate cleanly and stripSensitiveCredentialsFromSettings removes credentials prior to persistence', () => {
  assert.equal(validatePublicChannelHandle('facebook', 'eqp.dost').normalizedHandle, '@eqp.dost');
  assert.equal(validatePublicChannelHandle('viber', '@eqp_viber_ops').normalizedHandle, '@eqp_viber_ops');
  assert.equal(
    validatePublicChannelHandle('messenger', 'https://evil.example/?token=abc').valid,
    false
  );

  const valid = validateSettingsUrlsAndHandle({
    ...DEFAULT_COMMS_SETTINGS,
    xHandle: 'eqp_x',
    officialChannelHandles: {
      viber: 'eqp_viber',
      facebook: 'eqp.facebook',
      messenger: 'eqp.messenger',
      x_twitter: 'eqp_x',
    },
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.normalizedSettings.officialChannelHandles.facebook, '@eqp.facebook');
  assert.equal(valid.normalizedSettings.officialChannelHandles.viber, '@eqp_viber');
  assert.equal(valid.normalizedSettings.officialChannelHandles.messenger, '@eqp.messenger');
  assert.equal(valid.normalizedSettings.officialChannelHandles.x_twitter, '@eqp_x');

  const stripped = stripSensitiveCredentialsFromSettings({
    ...DEFAULT_COMMS_SETTINGS,
    xHandle: 'Bearer eyJhbGciOiJIUzI1NiJ9.payload',
    officialChannelHandles: {
      viber: 'xoxb-123456-abcdef',
      facebook: '@safe_page',
      messenger: 'sk-secretapikey1234567890',
      x_twitter: 'Bearer eyJhbGciOiJIUzI1NiJ9.payload',
    },
    officialBulletinUrl: 'https://earthquake.example.gov.ph/?api_key=SECRET',
    authorizedChannelUrls: {
      viber: 'https://invite.viber.com/public',
      facebook: 'https://facebook.com/page?access_token=SECRET',
      messenger: '',
      x_twitter: 'https://x.com/intent/tweet',
      other: '',
    },
  });
  assert.equal(stripped.xHandle, '');
  assert.equal(stripped.officialChannelHandles.x_twitter, '');
  assert.equal(stripped.officialChannelHandles.viber, '');
  assert.equal(stripped.officialChannelHandles.messenger, '');
  assert.equal(stripped.officialChannelHandles.facebook, '@safe_page');
  assert.equal(stripped.officialBulletinUrl, '');
  assert.equal(stripped.authorizedChannelUrls.facebook, '');
  assert.equal(stripped.authorizedChannelUrls.viber, 'https://invite.viber.com/public');
});


