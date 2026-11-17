import { type EQPEvent, isEventUnlocated } from '../data/eqpData.ts';
import {
  extractVerifiedPrimerParameters,
  type PrimerExtractedParameters,
  type PrimerSectionId,
} from './earthquakePrimer.ts';
import { geodesicDistanceKm } from './historicalSeismicity.ts';
import { matchAllowlistedDomain } from './researchUrlSecurity.ts';

export const RESEARCH_SOURCE_SCHEMA_VERSION = '1.0' as const;

/**
 * Six explicit collection & preservation states required for R1.
 */
export type ResearchSourceStatus =
  | 'discovered'
  | 'retrieved'
  | 'imported'
  | 'retrieval-unavailable'
  | 'event-match-uncertain'
  | 'archived';

export const RESEARCH_SOURCE_STATUS_LABELS: Record<ResearchSourceStatus, string> = {
  discovered: 'Source discovered',
  retrieved: 'Source retrieved',
  imported: 'Source imported',
  'retrieval-unavailable': 'Retrieval unavailable',
  'event-match-uncertain': 'Event match uncertain',
  archived: 'Source archived',
};

export type ResearchSourceCategory =
  | 'official-update'
  | 'tsunami-advisory'
  | 'field-investigation'
  | 'secondary-hazards'
  | 'scientific-study'
  | 'monitoring-response'
  | 'usgs-event-product'
  | 'general-reference';

export const RESEARCH_CATEGORY_LABELS: Record<ResearchSourceCategory, string> = {
  'official-update': 'Official Earthquake Update',
  'tsunami-advisory': 'Tsunami Advisory / Sea Level',
  'field-investigation': 'Field Investigation Report',
  'secondary-hazards': 'Secondary Hazard Observations',
  'scientific-study': 'Scientific Source Study',
  'monitoring-response': 'Agency Monitoring & Response',
  'usgs-event-product': 'USGS ComCat Event Products',
  'general-reference': 'General Reference Document',
};

export type ResearchEventMatchState =
  | 'confirmed-id-match'
  | 'probable-match'
  | 'ambiguous-match'
  | 'nonmatching-event'
  | 'insufficient-evidence';

export const EVENT_MATCH_STATE_LABELS: Record<ResearchEventMatchState, string> = {
  'confirmed-id-match': 'Confirmed identifier match',
  'probable-match': 'Probable event match (unverified)',
  'ambiguous-match': 'Ambiguous match',
  'nonmatching-event': 'Nonmatching event',
  'insufficient-evidence': 'Insufficient evidence',
};

export type ResearchRelevanceDecision = 'unreviewed' | 'relevant' | 'irrelevant';

export type ResearchTextAvailability =
  | 'available'
  | 'scanned-no-text'
  | 'metadata-only'
  | 'unavailable';

export interface ResearchMatchTolerances {
  probableOriginTimeSec: number;
  probableDistanceKm: number;
  probableDepthKm: number;
  probableMagDelta: number;
  ambiguousOriginTimeSec: number;
  ambiguousDistanceKm: number;
}

export const DEFAULT_RESEARCH_MATCH_TOLERANCES: ResearchMatchTolerances = {
  probableOriginTimeSec: 180,
  probableDistanceKm: 60,
  probableDepthKm: 50,
  probableMagDelta: 0.6,
  ambiguousOriginTimeSec: 1800,
  ambiguousDistanceKm: 180,
};

export interface ResearchCandidateEventMetadata {
  externalEventIds?: string[];
  originTimeUtc?: string | null;
  lat?: number | null;
  lon?: number | null;
  depthKm?: number | null;
  magnitude?: number | null;
  magnitudeType?: string | null;
  placeDescription?: string | null;
  sourceName?: string | null;
}

export interface ResearchEventMatchOperatorResolution {
  resolvedForDraftTransfer: true;
  priorAutoState: ResearchEventMatchState;
  resolvedByLabel: string;
  resolvedAtUtc: string;
  rationale: string;
  supportingEvidence: string;
}

export interface ResearchEventMatchDetails {
  state: ResearchEventMatchState;
  activeEqpEventId: string;
  activeEventFingerprint?: string;
  tolerancesUsed: ResearchMatchTolerances;
  originTimeDeltaSec: number | null;
  epicentralDistanceKm: number | null;
  depthDeltaKm: number | null;
  magnitudeDelta: number | null;
  activeMagScale: string | null;
  candidateMagScale: string | null;
  magnitudeScalesComparable: boolean;
  matchedIdentifiers: string[];
  explanation: string;
  caveats: string[];
  operatorResolution?: ResearchEventMatchOperatorResolution;
}

export type UsgsProductCategory =
  | 'origin'
  | 'magnitude'
  | 'moment-tensor'
  | 'focal-mechanism'
  | 'shakemap'
  | 'dyfi'
  | 'losspager'
  | 'ground-failure'
  | 'finite-fault';

export interface UsgsEventProductSummary {
  productCategory: UsgsProductCategory;
  productType: string;
  available: boolean;
  productId: string | null;
  sourceContributor: string | null;
  updateTimeUtc: string | null;
  version: string | null;
  sourceUrl: string | null;
  metadata: Record<string, string | number | boolean | null>;
  caveat: string | null;
}

export interface UsgsEventDetailCandidate {
  usgsEventId: string;
  title: string;
  place: string;
  originTimeUtc: string | null;
  lat: number | null;
  lon: number | null;
  depthKm: number | null;
  magnitude: number | null;
  magnitudeType: string | null;
  eventPageUrl: string | null;
  detailApiUrl: string | null;
  tsunamiFlagRaw: number | null;
  match: ResearchEventMatchDetails;
}

export interface UsgsEventDetailParseResult {
  usgsEventId: string;
  title: string;
  place: string;
  originTimeUtc: string | null;
  lat: number | null;
  lon: number | null;
  depthKm: number | null;
  magnitude: number | null;
  magnitudeType: string | null;
  tsunamiFlagRaw: number | null;
  eventPageUrl: string | null;
  detailQueryUrl: string;
  retrievedAtUtc: string;
  products: UsgsEventProductSummary[];
  disclaimers: string[];
}

export interface ResearchSourceOriginProvenance {
  channel:
    | 'gemini-google-search'
    | 'usgs-comcat-detail'
    | 'safe-url-fetch'
    | 'local-file-import';
  adapterId: string;
  queryOrRequestSummary: string;
  modelUsed: string | null;
  groundingUsed: boolean;
  retrievedViaServer: boolean;
  accessConditionNote: string | null;
}

export interface PrimerResearchSourceRecord {
  schemaVersion: '1.0';
  sourceId: string;
  linkedEqpEventId: string;
  documentTitle: string;
  organization: string;
  sourceLocation: string; // HTTPS URL or local://filename identifier
  sourceUrl: string | null;
  localImportId: string | null;
  sourceCategory: ResearchSourceCategory;
  publishedAtUtc: string | null;
  retrievedAtUtc: string;
  contentType: string;
  sizeBytes: number | null;
  contentSha256: string | null;
  textAvailability: ResearchTextAvailability;
  textUnavailableReason: string | null;
  extractedText: string;
  extractedTextPreview: string;
  pageCount: number | null;
  eventMatchState: ResearchEventMatchState;
  eventMatchDetails: ResearchEventMatchDetails;
  externalEventIds: string[];
  retrievalStatus: ResearchSourceStatus;
  originProvenance: ResearchSourceOriginProvenance;
  usgsDetail?: UsgsEventDetailParseResult | null;
  relevance: ResearchRelevanceDecision;
  archived: boolean;
  versionNumber: number;
  supersedesSourceId: string | null;
  supersededBySourceId: string | null;
  duplicateGroupKey: string;
  notes: string;
}

export interface ResearchDiscoveryCandidate {
  candidateId: string;
  title: string;
  url: string;
  domain: string;
  organization: string;
  authorityTier: 'philippine-agency' | 'usgs-noaa' | 'international-scientific' | 'external-web';
  isAllowlistedDomain: boolean;
  category: ResearchSourceCategory;
  snippet: string;
  publishedHint: string | null;
  discoveredAtUtc: string;
  queryUsed: string;
  modelUsed: string;
}

export interface GeminiSearchCapabilityReport {
  configured: boolean;
  modelUsed: string;
  sdkSupportsGoogleSearchTool: boolean;
  liveVerified: boolean;
  searchGroundingWorked: boolean;
  usableMetadataReturned: boolean;
  groundingChunksCount: number;
  webSearchQueriesCount: number;
  authOrQuotaRestriction: string | null;
  mayIncurCharges: boolean;
  billingDisclosure: string;
  checkedAtUtc: string;
}

export interface EventSearchContext {
  eventId: string;
  filename: string;
  bulletinNo: number;
  originDateUtc: string;
  originTimeUtc: string;
  originDatePst: string;
  originTimePst: string;
  isLocated: boolean;
  lat: number | null;
  lon: number | null;
  depthKm: number | null;
  magnitudeScale: string | null;
  magnitudeValue: number | null;
  primaryLocationLabel: string | null;
  knownIdentifiers: string[];
}

// =============================================================================
// FUTURE R2 / R3 & STAGE 6A/6B TYPED EXTENSION INTERFACES (NOT IMPLEMENTED IN R1)
// =============================================================================

export interface PrimerResearchR2ClaimExtractionRequest {
  sourceId: string;
  linkedEqpEventId: string;
  targetCategories: ResearchSourceCategory[];
  operatorConfirmedSendToAi: boolean;
  requestedAtUtc: string;
}

export interface PrimerResearchR2ExtractedClaim {
  claimId: string;
  sourceId: string;
  targetSectionId: PrimerSectionId;
  statement: string;
  verbatimQuote: string;
  locator: string;
  confidenceState: 'preliminary-review';
  extractedAtUtc: string;
}

export interface PrimerResearchR2EvidenceConflict {
  claimId: string;
  targetSectionId: PrimerSectionId;
  conflictKind: 'matches-draft' | 'differs-from-stage4' | 'blocked-by-manual-edit';
  explanation: string;
}

export interface PrimerResearchR3TransferRecord {
  transferId: string;
  sourceId: string;
  claimId: string;
  targetSectionId: PrimerSectionId;
  operatorConfirmedAtUtc: string;
  preservedManualEdits: boolean;
  appliedAsState: 'preliminary-review' | 'verified-fact';
}

export interface PrimerResearchExtensionSummary {
  schemaVersion: '1.0';
  r1CollectionNote: string;
  preservedSources: Array<{
    sourceId: string;
    documentTitle: string;
    organization: string;
    sourceCategory: ResearchSourceCategory;
    retrievalStatus: ResearchSourceStatus;
    eventMatchState: ResearchEventMatchState;
    relevance: ResearchRelevanceDecision;
    contentSha256: string | null;
    retrievedAtUtc: string;
  }>;
  pendingR2Claims?: PrimerResearchR2ExtractedClaim[];
  r3Transfers?: PrimerResearchR3TransferRecord[];
}

// =============================================================================
// READ-ONLY EVENT CONTEXT & QUERY BUILDER
// =============================================================================

export function buildEventSearchContext(
  event: EQPEvent,
  primaryLocationLabel?: string | null
): EventSearchContext {
  const verified: PrimerExtractedParameters = extractVerifiedPrimerParameters(event, {
    primaryLocationLabel,
  });
  const knownIdentifiers = Array.from(
    new Set(
      [
        verified.eventId,
        verified.filename.replace(/\.eqp$/i, ''),
        `Bulletin No. ${verified.bulletinNo}`,
      ]
        .map((s) => s.trim())
        .filter(Boolean)
    )
  );

  return {
    eventId: verified.eventId,
    filename: verified.filename,
    bulletinNo: verified.bulletinNo,
    originDateUtc: verified.originDateUtc,
    originTimeUtc: verified.originTimeUtc,
    originDatePst: verified.originDatePst,
    originTimePst: verified.originTimePst,
    isLocated: verified.isLocated,
    lat: verified.lat,
    lon: verified.lon,
    depthKm: verified.depthKm,
    magnitudeScale: verified.magnitudeScale,
    magnitudeValue: verified.magnitudeValue,
    primaryLocationLabel: verified.primaryLocationLabel,
    knownIdentifiers,
  };
}

export function buildResearchDiscoveryQuery(
  ctx: EventSearchContext,
  category: ResearchSourceCategory
): string {
  const datePart =
    ctx.originDateUtc && ctx.originDateUtc !== 'Unavailable' ? ctx.originDateUtc : '';
  const magPart =
    ctx.magnitudeValue !== null && ctx.magnitudeScale
      ? `${ctx.magnitudeScale} ${ctx.magnitudeValue.toFixed(1)}`
      : '';
  const locPart = ctx.primaryLocationLabel || (ctx.isLocated && ctx.lat !== null && ctx.lon !== null
    ? `${ctx.lat.toFixed(2)}N ${ctx.lon.toFixed(2)}E Philippines`
    : 'Philippines earthquake');

  const baseTerms = [datePart, magPart, locPart].filter(Boolean).join(' ');

  switch (category) {
    case 'official-update':
      return `${baseTerms} PHIVOLCS earthquake information bulletin official update`;
    case 'tsunami-advisory':
      return `${baseTerms} PHIVOLCS tsunami advisory warning bulletin sea level`;
    case 'field-investigation':
      return `${baseTerms} PHIVOLCS NDRRMC quick response team field investigation damage report`;
    case 'secondary-hazards':
      return `${baseTerms} earthquake landslide liquefaction ground rupture surface faulting`;
    case 'scientific-study':
      return `${baseTerms} USGS fault rupture source study focal mechanism moment tensor`;
    case 'monitoring-response':
      return `${baseTerms} NDRRMC OCD DSWD PHIVOLCS situational report monitoring response`;
    case 'usgs-event-product':
      return `${baseTerms} site:earthquake.usgs.gov ShakeMap DYFI PAGER`;
    default:
      return `${baseTerms} PHIVOLCS USGS NDRRMC official earthquake report`;
  }
}

export function inferOrganizationFromUrl(rawUrl: string): {
  domain: string;
  organization: string;
  authorityTier: 'philippine-agency' | 'usgs-noaa' | 'international-scientific' | 'external-web';
  isAllowlistedDomain: boolean;
} {
  try {
    const parsed = new URL(rawUrl);
    const domain = parsed.hostname.trim().toLowerCase();
    const matched = matchAllowlistedDomain(domain);
    if (matched) {
      return {
        domain,
        organization: matched.organization,
        authorityTier: matched.authorityTier,
        isAllowlistedDomain: true,
      };
    }
    return {
      domain,
      organization: domain || 'External Web Source',
      authorityTier: 'external-web',
      isAllowlistedDomain: false,
    };
  } catch {
    return {
      domain: '',
      organization: 'External Web Source',
      authorityTier: 'external-web',
      isAllowlistedDomain: false,
    };
  }
}

// =============================================================================
// DETERMINISTIC EVENT MATCHING ENGINE (SAFEGUARDED)
// =============================================================================

export function normalizeMagnitudeScaleFamily(rawScale: string | null | undefined): string {
  const s = String(rawScale ?? '').trim().toLowerCase();
  if (!s) return 'unknown';
  if (s === 'ms' || s === 'ms_20') return 'Ms';
  if (s === 'mb' || s === 'mb_lg') return 'Mb';
  if (s === 'md' || s === 'ml' || s === 'mlv') return 'Md/ML';
  if (s === 'mw' || s === 'mww' || s === 'mwb' || s === 'mwc' || s === 'mwr') return 'Mw';
  return s.toUpperCase();
}

function parseIsoUtcMs(iso: string | null | undefined): number | null {
  if (!iso || typeof iso !== 'string') return null;
  const t = Date.parse(iso.trim());
  return Number.isFinite(t) ? t : null;
}

function resolveActiveEventUtcMs(event: EQPEvent): number | null {
  const dateStr = event.originDateGmt?.trim();
  const timeStr = event.originTimeGmt?.trim();
  if (!dateStr || !timeStr) return null;
  const iso = `${dateStr}T${timeStr.endsWith('Z') ? timeStr : `${timeStr}Z`}`;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Deterministic, explainable event-matching evaluation.
 * Never treats different magnitude scales as equivalent numerical values.
 * Never promotes probable matches to scientifically verified records.
 */
export function evaluateResearchEventMatch(
  candidate: ResearchCandidateEventMetadata,
  activeEvent: EQPEvent,
  tolerances: ResearchMatchTolerances = DEFAULT_RESEARCH_MATCH_TOLERANCES,
  options: {
    activeEventFingerprint?: string;
    knownMatchingExternalIds?: string[];
  } = {}
): ResearchEventMatchDetails {
  const verified = extractVerifiedPrimerParameters(activeEvent);
  const unlocated = isEventUnlocated(activeEvent);
  const activeUtcMs = resolveActiveEventUtcMs(activeEvent);
  const candidateUtcMs = parseIsoUtcMs(candidate.originTimeUtc);

  const originTimeDeltaSec =
    activeUtcMs !== null && candidateUtcMs !== null
      ? Math.round((Math.abs(candidateUtcMs - activeUtcMs) / 1000) * 10) / 10
      : null;

  const hasCandCoords =
    typeof candidate.lat === 'number' &&
    Number.isFinite(candidate.lat) &&
    typeof candidate.lon === 'number' &&
    Number.isFinite(candidate.lon);

  const epicentralDistanceKm =
    !unlocated && hasCandCoords
      ? Math.round(
          geodesicDistanceKm(activeEvent.lat, activeEvent.lon, candidate.lat!, candidate.lon!) * 10
        ) / 10
      : null;

  const hasCandDepth =
    typeof candidate.depthKm === 'number' && Number.isFinite(candidate.depthKm);
  const depthDeltaKm =
    !unlocated && Number.isFinite(activeEvent.depthKm) && hasCandDepth
      ? Math.round(Math.abs(candidate.depthKm! - activeEvent.depthKm) * 10) / 10
      : null;

  const activeMag = verified.magnitudeValue;
  const activeScale = verified.magnitudeScale;
  const candMag =
    typeof candidate.magnitude === 'number' && Number.isFinite(candidate.magnitude)
      ? candidate.magnitude
      : null;
  const candidateScale = candidate.magnitudeType?.trim() || null;

  const activeScaleFamily = normalizeMagnitudeScaleFamily(activeScale);
  const candScaleFamily = normalizeMagnitudeScaleFamily(candidateScale);
  const magnitudeScalesComparable =
    activeScaleFamily !== 'unknown' &&
    candScaleFamily !== 'unknown' &&
    activeScaleFamily === candScaleFamily;

  const magnitudeDelta =
    activeMag !== null && candMag !== null
      ? Math.round(Math.abs(candMag - activeMag) * 100) / 100
      : null;

  const caveats: string[] = [];
  if (activeScale && candidateScale && !magnitudeScalesComparable) {
    caveats.push(
      `Magnitude scale difference (${candidateScale} vs EQP ${activeScale}); scales are reported separately and NOT treated as numerically equivalent.`
    );
  }

  // Identifier matching
  const knownIds = new Set<string>(
    [
      activeEvent.id,
      activeEvent.filename.replace(/\.eqp$/i, ''),
      ...(options.knownMatchingExternalIds ?? []),
    ]
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
  const candidateIds = (candidate.externalEventIds ?? [])
    .map((s) => s.trim())
    .filter(Boolean);
  const matchedIdentifiers = candidateIds.filter((id) => knownIds.has(id.toLowerCase()));

  // Check hard contradiction even if ID matches (safety guard)
  const clearlyTimeMismatch =
    originTimeDeltaSec !== null && originTimeDeltaSec > tolerances.ambiguousOriginTimeSec;
  const clearlyDistanceMismatch =
    epicentralDistanceKm !== null && epicentralDistanceKm > tolerances.ambiguousDistanceKm;

  if (matchedIdentifiers.length > 0 && !clearlyTimeMismatch && !clearlyDistanceMismatch) {
    return {
      state: 'confirmed-id-match',
      activeEqpEventId: activeEvent.id,
      activeEventFingerprint: options.activeEventFingerprint,
      tolerancesUsed: tolerances,
      originTimeDeltaSec,
      epicentralDistanceKm,
      depthDeltaKm,
      magnitudeDelta,
      activeMagScale: activeScale,
      candidateMagScale: candidateScale,
      magnitudeScalesComparable,
      matchedIdentifiers,
      explanation: `Confirmed matching event identifier (${matchedIdentifiers.join(', ')}) without spatiotemporal contradiction.`,
      caveats,
    };
  }

  if (clearlyTimeMismatch || clearlyDistanceMismatch) {
    const reasons: string[] = [];
    if (clearlyTimeMismatch) {
      reasons.push(`origin time differs by ${originTimeDeltaSec}s (> ${tolerances.ambiguousOriginTimeSec}s)`);
    }
    if (clearlyDistanceMismatch) {
      reasons.push(`epicenter offset is ${epicentralDistanceKm} km (> ${tolerances.ambiguousDistanceKm} km)`);
    }
    return {
      state: 'nonmatching-event',
      activeEqpEventId: activeEvent.id,
      activeEventFingerprint: options.activeEventFingerprint,
      tolerancesUsed: tolerances,
      originTimeDeltaSec,
      epicentralDistanceKm,
      depthDeltaKm,
      magnitudeDelta,
      activeMagScale: activeScale,
      candidateMagScale: candidateScale,
      magnitudeScalesComparable,
      matchedIdentifiers,
      explanation: `External metadata conflicts with active EQP event (${reasons.join('; ')}).`,
      caveats,
    };
  }

  // Insufficient evidence if we don't have both origin time AND spatial coordinates (or at least one strong anchor)
  if (originTimeDeltaSec === null && epicentralDistanceKm === null) {
    return {
      state: 'insufficient-evidence',
      activeEqpEventId: activeEvent.id,
      activeEventFingerprint: options.activeEventFingerprint,
      tolerancesUsed: tolerances,
      originTimeDeltaSec,
      epicentralDistanceKm,
      depthDeltaKm,
      magnitudeDelta,
      activeMagScale: activeScale,
      candidateMagScale: candidateScale,
      magnitudeScalesComparable,
      matchedIdentifiers,
      explanation: unlocated
        ? 'Active EQP event is unlocated and candidate lacks matching event identifiers.'
        : 'Source lacks comparable origin timestamp and epicenter coordinates for quantitative matching.',
      caveats,
    };
  }

  const timeWithinProbable =
    originTimeDeltaSec !== null && originTimeDeltaSec <= tolerances.probableOriginTimeSec;
  const distWithinProbable =
    epicentralDistanceKm !== null && epicentralDistanceKm <= tolerances.probableDistanceKm;
  const magCompatible =
    magnitudeDelta === null ||
    !magnitudeScalesComparable ||
    magnitudeDelta <= tolerances.probableMagDelta;
  const depthCompatible =
    depthDeltaKm === null || depthDeltaKm <= tolerances.probableDepthKm;

  if (timeWithinProbable && distWithinProbable && magCompatible && depthCompatible) {
    caveats.push(
      'Probable spatiotemporal match only — NOT a scientifically verified event identity match until confirmed by analyst.'
    );
    return {
      state: 'probable-match',
      activeEqpEventId: activeEvent.id,
      activeEventFingerprint: options.activeEventFingerprint,
      tolerancesUsed: tolerances,
      originTimeDeltaSec,
      epicentralDistanceKm,
      depthDeltaKm,
      magnitudeDelta,
      activeMagScale: activeScale,
      candidateMagScale: candidateScale,
      magnitudeScalesComparable,
      matchedIdentifiers,
      explanation: `Origin within ${originTimeDeltaSec}s and ${epicentralDistanceKm} km of active EQP hypocenter.`,
      caveats,
    };
  }

  caveats.push('Requires manual verification before associating findings with the active earthquake.');
  return {
    state: 'ambiguous-match',
    activeEqpEventId: activeEvent.id,
    activeEventFingerprint: options.activeEventFingerprint,
    tolerancesUsed: tolerances,
    originTimeDeltaSec,
    epicentralDistanceKm,
    depthDeltaKm,
    magnitudeDelta,
    activeMagScale: activeScale,
    candidateMagScale: candidateScale,
    magnitudeScalesComparable,
    matchedIdentifiers,
    explanation: `Partial or borderline match (${originTimeDeltaSec !== null ? `dt=${originTimeDeltaSec}s` : 'time N/A'}, ${epicentralDistanceKm !== null ? `dist=${epicentralDistanceKm} km` : 'coords N/A'}).`,
    caveats,
  };
}

// =============================================================================
// USGS COMCAT EVENT DETAIL ADAPTER
// =============================================================================

function toIsoOrNull(ms: unknown): string | null {
  if (typeof ms === 'number' && Number.isFinite(ms)) {
    return new Date(ms).toISOString();
  }
  if (typeof ms === 'string' && ms.trim()) {
    const parsed = Date.parse(ms.trim());
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : ms.trim();
  }
  return null;
}

function pickPropStr(props: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = props[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return null;
}

function pickPropNum(props: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = props[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim()) {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function roundSig(n: number | null, decimals = 2): number | null {
  if (n === null || !Number.isFinite(n)) return null;
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

/**
 * Parses a USGS ComCat single-event GeoJSON response (`fdsnws/event/1/query?eventid=...&format=geojson`).
 * Never assumes every product exists and attaches mandatory scientific disclaimers.
 */
export function parseUsgsComcatDetailGeoJson(
  geojson: unknown,
  detailQueryUrl: string,
  retrievedAtUtc: string = new Date().toISOString()
): UsgsEventDetailParseResult {
  if (!geojson || typeof geojson !== 'object') {
    throw new Error('Invalid USGS ComCat event detail GeoJSON payload.');
  }
  const root = geojson as {
    type?: unknown;
    id?: unknown;
    properties?: Record<string, unknown>;
    geometry?: { coordinates?: unknown };
  };
  const props = root.properties && typeof root.properties === 'object' ? root.properties : {};
  const coords = Array.isArray(root.geometry?.coordinates) ? root.geometry.coordinates : [];

  const lon = typeof coords[0] === 'number' && Number.isFinite(coords[0]) ? coords[0] : null;
  const lat = typeof coords[1] === 'number' && Number.isFinite(coords[1]) ? coords[1] : null;
  const depthKm = typeof coords[2] === 'number' && Number.isFinite(coords[2]) ? coords[2] : null;

  const usgsEventId =
    (typeof root.id === 'string' && root.id.trim()) ||
    (typeof props.code === 'string' && props.code.trim()) ||
    'unknown-usgs-event';
  const title = typeof props.title === 'string' ? props.title.trim() : `USGS Event ${usgsEventId}`;
  const place = typeof props.place === 'string' ? props.place.trim() : '';
  const originTimeUtc = toIsoOrNull(props.time);
  const magnitude = typeof props.mag === 'number' && Number.isFinite(props.mag) ? props.mag : null;
  const magnitudeType = typeof props.magType === 'string' ? props.magType.trim() : null;
  const tsunamiFlagRaw =
    typeof props.tsunami === 'number' && Number.isFinite(props.tsunami) ? props.tsunami : null;
  const eventPageUrl = typeof props.url === 'string' && props.url.trim() ? props.url.trim() : null;

  const productsRaw =
    props.products && typeof props.products === 'object'
      ? (props.products as Record<string, Array<Record<string, unknown>>>)
      : {};

  const getFirstProduct = (key: string): Record<string, unknown> | null => {
    const arr = productsRaw[key];
    return Array.isArray(arr) && arr.length > 0 && arr[0] && typeof arr[0] === 'object'
      ? arr[0]
      : null;
  };

  const products: UsgsEventProductSummary[] = [];

  // 1. Origin
  const originProd = getFirstProduct('origin');
  const originProps = (originProd?.properties as Record<string, unknown>) ?? {};
  products.push({
    productCategory: 'origin',
    productType: 'origin',
    available: Boolean(originProd),
    productId: typeof originProd?.id === 'string' ? originProd.id : null,
    sourceContributor: typeof originProd?.source === 'string' ? originProd.source : null,
    updateTimeUtc: toIsoOrNull(originProd?.updateTime),
    version: pickPropStr(originProps, ['version']),
    sourceUrl: eventPageUrl,
    metadata: originProd
      ? {
          latitude: pickPropNum(originProps, ['latitude']) ?? lat,
          longitude: pickPropNum(originProps, ['longitude']) ?? lon,
          depthKm: pickPropNum(originProps, ['depth']) ?? depthKm,
          evaluationStatus: pickPropStr(originProps, ['evaluation-status']),
          azimuthalGapDeg: pickPropNum(originProps, ['azimuthal-gap']),
          originSource: pickPropStr(originProps, ['origin-source', 'eventsource']),
        }
      : {},
    caveat: 'External USGS hypocenter reference; does NOT replace active EQP solution.',
  });

  // 2. Magnitude (derived from event properties + origin/moment-tensor)
  products.push({
    productCategory: 'magnitude',
    productType: 'preferred-magnitude',
    available: magnitude !== null,
    productId: typeof originProd?.id === 'string' ? `${originProd.id}#mag` : null,
    sourceContributor:
      pickPropStr(originProps, ['magnitude-source', 'eventsource']) ??
      (typeof originProd?.source === 'string' ? originProd.source : null),
    updateTimeUtc: toIsoOrNull(props.updated ?? originProd?.updateTime),
    version: null,
    sourceUrl: eventPageUrl,
    metadata:
      magnitude !== null
        ? {
            magnitude: roundSig(magnitude, 2),
            magnitudeType,
            magnitudeNumStations: pickPropNum(originProps, ['magnitude-num-stations-used']),
          }
        : {},
    caveat: magnitudeType
      ? `Scale ${magnitudeType} must not be equated directly with PHIVOLCS Ms/Mb/Md.`
      : null,
  });

  // 3. Moment Tensor
  const mtProd = getFirstProduct('moment-tensor');
  const mtProps = (mtProd?.properties as Record<string, unknown>) ?? {};
  products.push({
    productCategory: 'moment-tensor',
    productType: 'moment-tensor',
    available: Boolean(mtProd),
    productId: typeof mtProd?.id === 'string' ? mtProd.id : null,
    sourceContributor:
      pickPropStr(mtProps, ['beachball-source']) ??
      (typeof mtProd?.source === 'string' ? mtProd.source : null),
    updateTimeUtc: toIsoOrNull(mtProd?.updateTime),
    version: pickPropStr(mtProps, ['version']),
    sourceUrl: eventPageUrl ? `${eventPageUrl}/moment-tensor` : null,
    metadata: mtProd
      ? {
          derivedMagnitude: roundSig(pickPropNum(mtProps, ['derived-magnitude']), 2),
          derivedMagnitudeType: pickPropStr(mtProps, ['derived-magnitude-type']),
          derivedDepthKm: roundSig(pickPropNum(mtProps, ['derived-depth']), 1),
          nodalPlane1Strike: pickPropNum(mtProps, ['nodal-plane-1-strike']),
          nodalPlane1Dip: pickPropNum(mtProps, ['nodal-plane-1-dip']),
          nodalPlane1Rake: pickPropNum(mtProps, ['nodal-plane-1-rake']),
          nodalPlane2Strike: pickPropNum(mtProps, ['nodal-plane-2-strike']),
          nodalPlane2Dip: pickPropNum(mtProps, ['nodal-plane-2-dip']),
          nodalPlane2Rake: pickPropNum(mtProps, ['nodal-plane-2-rake']),
          percentDoubleCouple: roundSig(pickPropNum(mtProps, ['percent-double-couple']), 2),
        }
      : {},
    caveat: mtProd ? null : 'Moment tensor product not published for this USGS event.',
  });

  // 4. Focal Mechanism
  const fmProd = getFirstProduct('focal-mechanism');
  const fmProps = (fmProd?.properties as Record<string, unknown>) ?? {};
  products.push({
    productCategory: 'focal-mechanism',
    productType: 'focal-mechanism',
    available: Boolean(fmProd),
    productId: typeof fmProd?.id === 'string' ? fmProd.id : null,
    sourceContributor:
      pickPropStr(fmProps, ['beachball-source']) ??
      (typeof fmProd?.source === 'string' ? fmProd.source : null),
    updateTimeUtc: toIsoOrNull(fmProd?.updateTime),
    version: pickPropStr(fmProps, ['version']),
    sourceUrl: eventPageUrl ? `${eventPageUrl}/moment-tensor` : null,
    metadata: fmProd
      ? {
          nodalPlane1Strike: pickPropNum(fmProps, ['nodal-plane-1-strike']),
          nodalPlane1Dip: pickPropNum(fmProps, ['nodal-plane-1-dip']),
          nodalPlane1Rake: pickPropNum(fmProps, ['nodal-plane-1-rake']),
          nodalPlane2Strike: pickPropNum(fmProps, ['nodal-plane-2-strike']),
          nodalPlane2Dip: pickPropNum(fmProps, ['nodal-plane-2-dip']),
          nodalPlane2Rake: pickPropNum(fmProps, ['nodal-plane-2-rake']),
          evaluationStatus: pickPropStr(fmProps, ['evaluation-status']),
        }
      : {},
    caveat: fmProd ? null : 'First-motion focal-mechanism product not published for this USGS event.',
  });

  // 5. ShakeMap
  const smProd = getFirstProduct('shakemap');
  const smProps = (smProd?.properties as Record<string, unknown>) ?? {};
  products.push({
    productCategory: 'shakemap',
    productType: 'shakemap',
    available: Boolean(smProd),
    productId: typeof smProd?.id === 'string' ? smProd.id : null,
    sourceContributor: typeof smProd?.source === 'string' ? smProd.source : null,
    updateTimeUtc: toIsoOrNull(smProd?.updateTime),
    version: pickPropStr(smProps, ['version']),
    sourceUrl: eventPageUrl ? `${eventPageUrl}/shakemap/intensity` : null,
    metadata: smProd
      ? {
          maxMmi: roundSig(pickPropNum(smProps, ['maxmmi']), 2),
          maxPgaPctG: roundSig(pickPropNum(smProps, ['maxpga']), 2),
          maxPgvCmS: roundSig(pickPropNum(smProps, ['maxpgv']), 2),
          mapStatus: pickPropStr(smProps, ['map-status']),
          gmice: pickPropStr(smProps, ['gmice']),
        }
      : {},
    caveat: smProd
      ? 'Estimated MMI ground shaking (USGS ShakeMap); NOT equivalent to verified PHIVOLCS PEIS or confirmed observed damage.'
      : 'ShakeMap product not published for this USGS event.',
  });

  // 6. DYFI
  const dyfiProd = getFirstProduct('dyfi');
  const dyfiProps = (dyfiProd?.properties as Record<string, unknown>) ?? {};
  products.push({
    productCategory: 'dyfi',
    productType: 'dyfi',
    available: Boolean(dyfiProd),
    productId: typeof dyfiProd?.id === 'string' ? dyfiProd.id : null,
    sourceContributor: typeof dyfiProd?.source === 'string' ? dyfiProd.source : null,
    updateTimeUtc: toIsoOrNull(dyfiProd?.updateTime),
    version: pickPropStr(dyfiProps, ['version']),
    sourceUrl: eventPageUrl ? `${eventPageUrl}/dyfi/intensity` : null,
    metadata: dyfiProd
      ? {
          maxMmi: roundSig(pickPropNum(dyfiProps, ['maxmmi']), 2),
          numResponses: pickPropNum(dyfiProps, ['num-responses', 'numResp']),
        }
      : {},
    caveat: dyfiProd
      ? 'Crowdsourced USGS DYFI reports (MMI); distinct from verified PHIVOLCS PEIS observations.'
      : 'DYFI product not published for this USGS event.',
  });

  // 7. LossPAGER
  const pagerProd = getFirstProduct('losspager');
  const pagerProps = (pagerProd?.properties as Record<string, unknown>) ?? {};
  products.push({
    productCategory: 'losspager',
    productType: 'losspager',
    available: Boolean(pagerProd),
    productId: typeof pagerProd?.id === 'string' ? pagerProd.id : null,
    sourceContributor: typeof pagerProd?.source === 'string' ? pagerProd.source : null,
    updateTimeUtc: toIsoOrNull(pagerProd?.updateTime),
    version: pickPropStr(pagerProps, ['version', 'original-signature-version']),
    sourceUrl: eventPageUrl ? `${eventPageUrl}/pager` : null,
    metadata: pagerProd
      ? {
          alertLevel: pickPropStr(pagerProps, ['alertlevel']),
          maxMmi: roundSig(pickPropNum(pagerProps, ['maxmmi']), 2),
        }
      : {},
    caveat: pagerProd
      ? 'Modeled PAGER impact alert estimate; NOT confirmed observed casualties or damage.'
      : 'PAGER product not published for this USGS event.',
  });

  // 8. Ground Failure
  const gfProd = getFirstProduct('ground-failure');
  const gfProps = (gfProd?.properties as Record<string, unknown>) ?? {};
  products.push({
    productCategory: 'ground-failure',
    productType: 'ground-failure',
    available: Boolean(gfProd),
    productId: typeof gfProd?.id === 'string' ? gfProd.id : null,
    sourceContributor: typeof gfProd?.source === 'string' ? gfProd.source : null,
    updateTimeUtc: toIsoOrNull(gfProd?.updateTime),
    version: pickPropStr(gfProps, ['version']),
    sourceUrl: eventPageUrl ? `${eventPageUrl}/ground-failure/summary` : null,
    metadata: gfProd
      ? {
          landslideAlert: pickPropStr(gfProps, ['landslide-alert']),
          liquefactionAlert: pickPropStr(gfProps, ['liquefaction-alert']),
        }
      : {},
    caveat: gfProd
      ? 'Modeled landslide/liquefaction probability; NOT confirmed field-observed ground failure.'
      : 'Ground-failure product not published for this USGS event.',
  });

  // 9. Optional Finite Fault
  const ffProd = getFirstProduct('finite-fault');
  if (ffProd) {
    const ffProps = (ffProd.properties as Record<string, unknown>) ?? {};
    products.push({
      productCategory: 'finite-fault',
      productType: 'finite-fault',
      available: true,
      productId: typeof ffProd.id === 'string' ? ffProd.id : null,
      sourceContributor: typeof ffProd.source === 'string' ? ffProd.source : null,
      updateTimeUtc: toIsoOrNull(ffProd.updateTime),
      version: pickPropStr(ffProps, ['version']),
      sourceUrl: eventPageUrl ? `${eventPageUrl}/finite-fault` : null,
      metadata: {
        derivedMagnitude: roundSig(pickPropNum(ffProps, ['derived-magnitude']), 2),
        derivedMagnitudeType: pickPropStr(ffProps, ['derived-magnitude-type']),
        scalarMoment: pickPropStr(ffProps, ['scalar-moment']),
      },
      caveat: 'Inversion model reference; requires specialist scientific review.',
    });
  }

  const disclaimers: string[] = [
    'USGS ComCat products are external scientific reference records; they do NOT alter the active EQP earthquake solution.',
    `USGS tsunami flag (${tsunamiFlagRaw ?? 'absent'}) is NOT an official PHIVOLCS tsunami advisory or cancellation.`,
    'Estimated ground shaking (ShakeMap) or modeled impact/ground-failure products (PAGER / Landslide / Liquefaction) must NOT be treated as confirmed observed field damage.',
  ];

  return {
    usgsEventId,
    title,
    place,
    originTimeUtc,
    lat,
    lon,
    depthKm,
    magnitude,
    magnitudeType,
    tsunamiFlagRaw,
    eventPageUrl,
    detailQueryUrl,
    retrievedAtUtc,
    products,
    disclaimers,
  };
}

// =============================================================================
// SAFE HTML / TEXT SANITIZATION & HASHING
// =============================================================================

export function extractSafePlainTextFromHtml(rawHtml: string): {
  title: string | null;
  plainText: string;
} {
  if (typeof rawHtml !== 'string' || !rawHtml.trim()) {
    return { title: null, plainText: '' };
  }
  const titleMatch = rawHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch
    ? titleMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() || null
    : null;

  let cleaned = rawHtml
    // Strip dangerous/non-text active blocks completely
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, ' ')
    .replace(/<object\b[\s\S]*?<\/object>/gi, ' ')
    .replace(/<embed\b[\s\S]*?(?:<\/embed>|\/?>)/gi, ' ')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  // Preserve paragraph/row structure cleanly
  cleaned = cleaned
    .replace(/<\s*(?:br|hr)\s*\/?>/gi, '\n')
    .replace(/<\/\s*(?:p|div|li|tr|h[1-6]|section|article|blockquote)\s*>/gi, '\n')
    .replace(/<\s*(?:td|th)\b[^>]*>/gi, ' | ')
    .replace(/<[^>]+>/g, ' ');

  // Decode basic safe entities
  cleaned = cleaned
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_m, dec) => {
      const code = Number(dec);
      return Number.isInteger(code) && code >= 32 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : ' ';
    });

  const plainText = cleaned
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');

  return { title, plainText };
}

export function buildTextPreview(text: string, maxChars = 360): string {
  const normalized = (text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.length > maxChars
    ? `${normalized.slice(0, maxChars - 3)}...`
    : normalized;
}

export async function computeSha256Hex(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('WebCrypto SHA-256 unavailable in this runtime.');
  }
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await subtle.digest('SHA-256', copy);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// =============================================================================
// DEDUPLICATION & NON-OVERWRITING VERSION DIFFERENTIATION
// =============================================================================

export function computeDuplicateGroupKey(params: {
  linkedEqpEventId: string;
  sourceUrl?: string | null;
  documentTitle: string;
  organization: string;
  usgsEventId?: string | null;
}): string {
  const ev = params.linkedEqpEventId.trim().toLowerCase();
  if (params.usgsEventId && params.usgsEventId.trim()) {
    return `${ev}::usgs::${params.usgsEventId.trim().toLowerCase()}`;
  }
  if (params.sourceUrl && params.sourceUrl.trim()) {
    return `${ev}::url::${params.sourceUrl.trim().toLowerCase()}`;
  }
  const normTitle = params.documentTitle.trim().toLowerCase().replace(/\s+/g, ' ');
  const normOrg = params.organization.trim().toLowerCase().replace(/\s+/g, ' ');
  return `${ev}::doc::${normOrg}::${normTitle}`;
}

export interface SourceImportResolution {
  outcome: 'created-new' | 'duplicate-exact' | 'new-version';
  record: PrimerResearchSourceRecord;
  supersededRecordUpdate?: PrimerResearchSourceRecord;
  message: string;
}

/**
 * Resolves exact content deduplication vs newer-version preservation.
 * Never silently overwrites older imported documents.
 */
export function resolveSourceImportVersioning(
  incoming: Omit<
    PrimerResearchSourceRecord,
    'versionNumber' | 'supersedesSourceId' | 'supersededBySourceId' | 'duplicateGroupKey'
  >,
  existingForEvent: PrimerResearchSourceRecord[]
): SourceImportResolution {
  const groupKey = computeDuplicateGroupKey({
    linkedEqpEventId: incoming.linkedEqpEventId,
    sourceUrl: incoming.sourceUrl,
    documentTitle: incoming.documentTitle,
    organization: incoming.organization,
    usgsEventId: incoming.usgsDetail?.usgsEventId ?? null,
  });

  // 1. Exact SHA-256 content match for the same EQP event -> do not duplicate
  if (incoming.contentSha256) {
    const exactHit = existingForEvent.find(
      (r) =>
        r.linkedEqpEventId === incoming.linkedEqpEventId &&
        r.contentSha256 &&
        r.contentSha256 === incoming.contentSha256
    );
    if (exactHit) {
      return {
        outcome: 'duplicate-exact',
        record: exactHit,
        message: `Exact duplicate detected (SHA-256 ${incoming.contentSha256.slice(0, 12)}) matching existing "${exactHit.documentTitle}" (v${exactHit.versionNumber}). Older document preserved unchanged.`,
      };
    }
  }

  // 2. Same source identity/group with different content -> preserve previous as vN and append vN+1
  const sameGroup = existingForEvent
    .filter(
      (r) =>
        r.linkedEqpEventId === incoming.linkedEqpEventId &&
        r.duplicateGroupKey === groupKey
    )
    .sort((a, b) => b.versionNumber - a.versionNumber);

  if (sameGroup.length > 0) {
    const latestPrev = sameGroup[0];
    const nextVersion = latestPrev.versionNumber + 1;
    const nextRecord: PrimerResearchSourceRecord = {
      ...incoming,
      duplicateGroupKey: groupKey,
      versionNumber: nextVersion,
      supersedesSourceId: latestPrev.sourceId,
      supersededBySourceId: null,
    };
    const updatedPrev: PrimerResearchSourceRecord = {
      ...latestPrev,
      supersededBySourceId: incoming.sourceId,
    };
    return {
      outcome: 'new-version',
      record: nextRecord,
      supersededRecordUpdate: updatedPrev,
      message: `Saved as version v${nextVersion} superseding v${latestPrev.versionNumber} (${latestPrev.sourceId}); prior document preserved intact.`,
    };
  }

  // 3. Brand new source document
  const freshRecord: PrimerResearchSourceRecord = {
    ...incoming,
    duplicateGroupKey: groupKey,
    versionNumber: 1,
    supersedesSourceId: null,
    supersededBySourceId: null,
  };
  return {
    outcome: 'created-new',
    record: freshRecord,
    message: `Added new source "${freshRecord.documentTitle}" (v1).`,
  };
}

export function buildUsgsSummaryPlainText(detail: UsgsEventDetailParseResult): string {
  const lines: string[] = [
    `USGS Event ID: ${detail.usgsEventId}`,
    `Title: ${detail.title}`,
    `Place: ${detail.place || 'Unavailable'}`,
    `Origin Time (UTC): ${detail.originTimeUtc ?? 'Unavailable'}`,
    `Coordinates: ${detail.lat !== null && detail.lon !== null ? `${detail.lat.toFixed(4)}, ${detail.lon.toFixed(4)}` : 'Unavailable'}, Depth: ${detail.depthKm !== null ? `${detail.depthKm.toFixed(2)} km` : 'Unavailable'}`,
    `Preferred Magnitude: ${detail.magnitude !== null ? `${detail.magnitude.toFixed(2)} ${detail.magnitudeType ?? ''}` : 'Unavailable'}`,
    `USGS Tsunami Flag (NOT PHIVOLCS Advisory): ${detail.tsunamiFlagRaw ?? 'N/A'}`,
    `Event Page URL: ${detail.eventPageUrl ?? 'Unavailable'}`,
    `Retrieved (UTC): ${detail.retrievedAtUtc}`,
    '',
    'Available & Checked USGS Products:',
  ];

  for (const prod of detail.products) {
    if (!prod.available) {
      lines.push(`- [${prod.productType}] UNAVAILABLE (${prod.caveat ?? 'Not published'})`);
    } else {
      const metaParts = Object.entries(prod.metadata)
        .filter(([, v]) => v !== null && v !== undefined && String(v) !== '')
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');
      lines.push(
        `- [${prod.productType}] Source: ${prod.sourceContributor ?? 'unknown'} | Updated: ${prod.updateTimeUtc ?? 'unknown'}${prod.version ? ` | Ver: ${prod.version}` : ''}${metaParts ? ` | ${metaParts}` : ''}`
      );
      if (prod.caveat) {
        lines.push(`    Note: ${prod.caveat}`);
      }
    }
  }

  lines.push('', 'Scientific Safeguard Disclaimers:');
  for (const d of detail.disclaimers) {
    lines.push(`- ${d}`);
  }
  return lines.join('\n');
}
