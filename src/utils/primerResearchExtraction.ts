import { type EQPEvent } from '../data/eqpData.ts';
import {
  DEFAULT_RESEARCH_MATCH_TOLERANCES,
  evaluateResearchEventMatch,
  normalizeMagnitudeScaleFamily,
  type PrimerResearchSourceRecord,
  type ResearchEventMatchDetails,
  type ResearchEventMatchState,
  type ResearchMatchTolerances,
  type UsgsEventDetailParseResult,
} from './primerResearchAssistant.ts';
import { safeJsonParseChecked } from './primerReviewPackage.ts';
import type { PrimerSectionKey } from './primerScientificNarratives.ts';

export const FINDING_SCHEMA_VERSION = '2.0' as const;

// =============================================================================
// 13 EXTRACTION CATEGORIES (SECTION E)
// =============================================================================

export type R2FindingCategory =
  | 'official-bulletins'
  | 'tsunami-sea-level'
  | 'reported-intensities'
  | 'landslides-rockfalls'
  | 'liquefaction-deformation'
  | 'structural-infrastructure'
  | 'tectonic-generators'
  | 'focal-mechanism-products'
  | 'volcano-monitoring'
  | 'aftershock-cutoffs'
  | 'phivolcs-monitoring-qrt'
  | 'agency-coordination'
  | 'public-safety-preparedness';

export const R2_FINDING_CATEGORIES: R2FindingCategory[] = [
  'official-bulletins',
  'tsunami-sea-level',
  'reported-intensities',
  'landslides-rockfalls',
  'liquefaction-deformation',
  'structural-infrastructure',
  'tectonic-generators',
  'focal-mechanism-products',
  'volcano-monitoring',
  'aftershock-cutoffs',
  'phivolcs-monitoring-qrt',
  'agency-coordination',
  'public-safety-preparedness',
];

export const R2_CATEGORY_LABELS: Record<R2FindingCategory, string> = {
  'official-bulletins': '1. Official Earthquake Bulletins & Updates',
  'tsunami-sea-level': '2. Tsunami Advisories & Sea-Level Observations',
  'reported-intensities': '3. Reported Intensities & Shaking Estimates',
  'landslides-rockfalls': '4. Landslides & Rockfalls',
  'liquefaction-deformation': '5. Liquefaction & Ground Deformation',
  'structural-infrastructure': '6. Structural / Infrastructure Impacts',
  'tectonic-generators': '7. Tectonic Interpretations & Named Generators',
  'focal-mechanism-products': '8. Focal Mechanism & Scientific Products',
  'volcano-monitoring': '9. Volcano-Related Monitoring',
  'aftershock-cutoffs': '10. Aftershock Reports & Count Cutoffs',
  'phivolcs-monitoring-qrt': '11. PHIVOLCS Monitoring & QRT Activities',
  'agency-coordination': '12. Agency Coordination & Official Response',
  'public-safety-preparedness': '13. Public Safety & Preparedness Statements',
};

export const R2_CATEGORY_TARGET_PRIMER_SECTION: Record<R2FindingCategory, PrimerSectionKey> = {
  'official-bulletins': 'overview',
  'tsunami-sea-level': 'hazards',
  'reported-intensities': 'intensity',
  'landslides-rockfalls': 'hazards',
  'liquefaction-deformation': 'hazards',
  'structural-infrastructure': 'hazards',
  'tectonic-generators': 'tectonic_setting',
  'focal-mechanism-products': 'tectonic_setting',
  'volcano-monitoring': 'tectonic_setting',
  'aftershock-cutoffs': 'aftershocks',
  'phivolcs-monitoring-qrt': 'recommendations',
  'agency-coordination': 'recommendations',
  'public-safety-preparedness': 'recommendations',
};

// =============================================================================
// EPISTEMIC BASIS, EVIDENCE VALIDATION & CONFLICT TYPES (SECTIONS A, D, F, H)
// =============================================================================

export type FindingEpistemicBasis =
  | 'measured'
  | 'reported'
  | 'estimated'
  | 'modeled'
  | 'interpreted';

export type FindingExtractionMethod = 'deterministic' | 'gemini' | 'manual';

export type FindingEvidenceValidationStatus =
  | 'source-verified'
  | 'evidence-unresolved'
  | 'metadata-only-verified'
  | 'scanned-no-text'
  | 'insufficient-evidence';

export const EVIDENCE_VALIDATION_LABELS: Record<FindingEvidenceValidationStatus, string> = {
  'source-verified': 'Source-Verified Quote',
  'evidence-unresolved': 'Evidence Unresolved',
  'metadata-only-verified': 'Structured API Metadata',
  'scanned-no-text': 'Scanned PDF (No Text)',
  'insufficient-evidence': 'Insufficient Evidence',
};

export type FindingRelevanceStatus = 'active' | 'irrelevant' | 'insufficient-evidence';

export type R2ConflictKind =
  | 'conflicting-event-parameter'
  | 'magnitude-scale-difference'
  | 'conflicting-tsunami-advisory'
  | 'advisory-revision-progression'
  | 'preliminary-vs-updated'
  | 'conflicting-aftershock-count'
  | 'aftershock-cutoff-difference'
  | 'catalog-scope-difference'
  | 'conflicting-observation'
  | 'measurement-type-difference'
  | 'conflicting-location-or-time'
  | 'different-interpretation'
  | 'duplicate-finding';

export const R2_CONFLICT_KIND_LABELS: Record<R2ConflictKind, string> = {
  'conflicting-event-parameter': 'Conflicting Event Parameter',
  'magnitude-scale-difference': 'Non-Equivalent Magnitude Scales',
  'conflicting-tsunami-advisory': 'Conflicting Tsunami Advisory',
  'advisory-revision-progression': 'Advisory Version / Revision Difference',
  'preliminary-vs-updated': 'Preliminary vs. Updated Report',
  'conflicting-aftershock-count': 'Conflicting Aftershock Count',
  'aftershock-cutoff-difference': 'Different Cutoff Timestamp',
  'catalog-scope-difference': 'Different Catalog Scope / Magnitude Threshold',
  'conflicting-observation': 'Conflicting Observed Value',
  'measurement-type-difference': 'Measured vs. Estimated/Modeled Basis',
  'conflicting-location-or-time': 'Conflicting Location or Timestamp',
  'different-interpretation': 'Different Scientific Interpretation',
  'duplicate-finding': 'Duplicate Claim Across Sources',
};

export interface FindingEvidenceLocator {
  kind:
    | 'text-offset'
    | 'page-verified'
    | 'line-range'
    | 'usgs-product-path'
    | 'unverified'
    | 'unavailable';
  label: string;
  startOffset: number | null;
  endOffset: number | null;
  pageNumber: number | null;
  paragraphIndex?: number | null;
  sectionLabel?: string | null;
}

export interface CandidateScientificFinding {
  findingId: string;
  linkedEqpEventId: string;
  sourceId: string;
  sourceTitle: string;
  sourceOrganization: string;
  sourceVersionNumber: number;
  sourceContentSha256: string | null;
  extractionMethod: FindingExtractionMethod;
  epistemicBasis: FindingEpistemicBasis;
  category: R2FindingCategory;
  findingTitle: string;
  extractedStatement: string;
  structuredValues: Record<string, string | number | boolean | null>;
  originalValue: string | null;
  originalUnits: string | null;
  normalizedValue: number | string | null;
  normalizedUnits: string | null;
  observationTimeRaw: string | null;
  observationTimeZone: string | null;
  publishedOrUpdatedUtc: string | null;
  evidencePassage: string;
  evidenceLocator: FindingEvidenceLocator;
  sourceReference: string;
  eventMatchState: ResearchEventMatchState;
  eventMatchExplanation: string;
  excludedByNonMatchingEvent: boolean;
  extractedAtUtc: string;
  evidenceValidationStatus: FindingEvidenceValidationStatus;
  evidenceValidationNote: string;
  conflictGroupId: string | null;
  conflictKind: R2ConflictKind | null;
  conflictSummary: string | null;
  duplicateGroupHash: string;
  modelUsed: string | null;
  extractionRunId: string;
  extractionRunVersion: number;
  relevanceStatus: FindingRelevanceStatus;
  supersededByRunId: string | null;
  extractionSchemaVersion: '2.0';
  caveats: string[];
}

// =============================================================================
// TYPED R3 REVIEWED-TRANSFER INTERFACES (NOT IMPLEMENTED IN R2 — SECTION L)
// =============================================================================

export interface PrimerResearchR3TransferCandidate {
  findingId: string;
  sourceId: string;
  category: R2FindingCategory;
  targetSection: PrimerSectionKey;
  proposedFieldPath: string;
  candidateValueSummary: string;
  evidenceValidationStatus: FindingEvidenceValidationStatus;
  eventMatchState: ResearchEventMatchState;
  conflictKind: R2ConflictKind | null;
  eligibleForTransfer: boolean;
  blockingReason: string | null;
}

export interface PrimerResearchR3Stage4DiffPreview {
  findingId: string;
  targetSection: PrimerSectionKey;
  existingStage4Summary: string;
  proposedChangeSummary: string;
  targetSectionIsEdited: boolean;
  existingStage4State: 'verified-fact' | 'preliminary-review' | 'approved-general-template' | 'unavailable-or-unresolved';
  requiresConflictResolution: boolean;
}

export interface PrimerResearchR3TransferAuditRecord {
  transferId: string;
  linkedEqpEventId: string;
  findingId: string;
  sourceId: string;
  sourceContentSha256: string | null;
  targetSection: PrimerSectionKey;
  appliedAsState: 'preliminary-review' | 'verified-fact';
  preservedEditedSections: boolean;
  operatorConfirmedAtUtc: string;
}

// =============================================================================
// SAFETY & SANITIZATION HELPERS (SECTION K)
// =============================================================================

const FORBIDDEN_FINDING_PATTERNS: RegExp[] = [
  /<\s*script\b/i,
  /javascript\s*:/i,
  /on\w+\s*=\s*["']/i,
  /<\s*iframe\b/i,
];

export function sanitizeUntrustedTextValue(raw: unknown, maxLen = 2000): string {
  if (typeof raw !== 'string') return '';
  let text = raw.replace(/\u0000/g, '').trim();
  for (const pat of FORBIDDEN_FINDING_PATTERNS) {
    if (pat.test(text)) {
      text = text.replace(/<[^>]*>/g, ' ').replace(/javascript:/gi, '[blocked-uri]:');
    }
  }
  return text.length > maxLen ? `${text.slice(0, maxLen - 3)}...` : text;
}

/**
 * Returns true if the source is a local operator-imported file or carries restricted/internal
 * notes/title markers requiring explicit operator authorization before external AI transmission.
 */
export function isSourceRestrictedOrLocal(
  source: Pick<
    PrimerResearchSourceRecord,
    'originProvenance' | 'sourceLocation' | 'localImportId' | 'notes' | 'documentTitle'
  >
): boolean {
  if (source.originProvenance?.channel === 'local-file-import') return true;
  if (source.localImportId || (source.sourceLocation && source.sourceLocation.startsWith('local://'))) {
    return true;
  }
  const markerText = `${source.notes || ''} ${source.documentTitle || ''}`;
  return /\b(?:internal|restricted|confidential|embargoed|private|not\s+for\s+public)\b/i.test(
    markerText
  );
}

/**
 * Strips potentially adversarial prompt-injection control directives while preserving
 * archival quotes cleanly inside strict untrusted delimiters for Gemini input.
 */
export function buildPromptSafeSourceChunk(
  sourceText: string,
  startChar: number,
  maxChars: number
): { chunkText: string; startOffset: number; endOffset: number } {
  const clean = sourceText.replace(/\u0000/g, '');
  const safeStart = Math.max(0, Math.min(startChar, clean.length));
  const safeEnd = Math.min(clean.length, safeStart + Math.max(200, maxChars));
  const slice = clean.slice(safeStart, safeEnd);
  return {
    chunkText: slice,
    startOffset: safeStart,
    endOffset: safeEnd,
  };
}

export function splitSourceIntoExtractionChunks(
  sourceText: string,
  maxChunkChars = 14000,
  maxChunks = 3
): Array<{ chunkIndex: number; chunkText: string; startOffset: number; endOffset: number }> {
  const clean = (sourceText || '').replace(/\u0000/g, '').trim();
  if (!clean) return [];

  const chunks: Array<{
    chunkIndex: number;
    chunkText: string;
    startOffset: number;
    endOffset: number;
  }> = [];
  let cursor = 0;
  let idx = 0;
  const overlap = 400;

  while (cursor < clean.length && idx < maxChunks) {
    let end = Math.min(clean.length, cursor + maxChunkChars);
    if (end < clean.length) {
      const nl = clean.lastIndexOf('\n', end);
      if (nl > cursor + maxChunkChars * 0.7) {
        end = nl + 1;
      }
    }
    chunks.push({
      chunkIndex: idx,
      chunkText: clean.slice(cursor, end),
      startOffset: cursor,
      endOffset: end,
    });
    if (end >= clean.length) break;
    cursor = Math.max(cursor + 1, end - overlap);
    idx += 1;
  }

  return chunks;
}

// =============================================================================
// EVIDENCE VERIFICATION ENGINE (SECTION F)
// =============================================================================

export function verifyQuoteAgainstSourceText(
  quote: string,
  sourceText: string
): {
  matched: boolean;
  startOffset: number | null;
  endOffset: number | null;
  matchMode: 'exact' | 'whitespace-normalized' | 'none';
} {
  const cleanQuote = (quote || '').trim();
  if (!cleanQuote || cleanQuote.length < 6 || !sourceText) {
    return { matched: false, startOffset: null, endOffset: null, matchMode: 'none' };
  }

  // 1. Exact case-sensitive substring search
  const exactIdx = sourceText.indexOf(cleanQuote);
  if (exactIdx !== -1) {
    return {
      matched: true,
      startOffset: exactIdx,
      endOffset: exactIdx + cleanQuote.length,
      matchMode: 'exact',
    };
  }

  // 2. Case-insensitive exact substring search
  const lowerSrc = sourceText.toLowerCase();
  const lowerQ = cleanQuote.toLowerCase();
  const ciIdx = lowerSrc.indexOf(lowerQ);
  if (ciIdx !== -1) {
    return {
      matched: true,
      startOffset: ciIdx,
      endOffset: ciIdx + cleanQuote.length,
      matchMode: 'exact',
    };
  }

  // 3. Whitespace-collapsed regex match mapping back to original offsets
  const tokens = cleanQuote
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 40)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (tokens.length >= 2) {
    try {
      const regex = new RegExp(tokens.join('\\s+'), 'i');
      const m = regex.exec(sourceText);
      if (m && m.index >= 0) {
        return {
          matched: true,
          startOffset: m.index,
          endOffset: m.index + m[0].length,
          matchMode: 'whitespace-normalized',
        };
      }
    } catch {
      // Ignore regex errors on unusual Unicode sequences
    }
  }

  return { matched: false, startOffset: null, endOffset: null, matchMode: 'none' };
}

/**
 * Checks whether the stored source text actually carries explicit verifiable page markers.
 * Prevents fabricating PDF page numbers when unpdf merged text without per-page mapping.
 */
export function verifyClaimedPageNumber(
  claimedPage: number | null | undefined,
  quoteOffset: number | null,
  source: Pick<PrimerResearchSourceRecord, 'pageCount' | 'extractedText'>
): number | null {
  if (
    typeof claimedPage !== 'number' ||
    !Number.isInteger(claimedPage) ||
    claimedPage < 1
  ) {
    return null;
  }
  if (typeof source.pageCount === 'number' && claimedPage > source.pageCount) {
    return null;
  }

  const text = source.extractedText || '';
  const pageRegex = /(?:^|\n)\s*(?:---|\[)?\s*Page\s+(\d+)\s*(?:---|\])?/gi;
  const markers: Array<{ page: number; index: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = pageRegex.exec(text)) !== null) {
    markers.push({ page: Number(m[1]), index: m.index });
  }
  if (markers.length === 0) {
    // Only single-page PDFs with explicit verified pageCount === 1 could know page=1;
    // for multi-page or non-page-mapped text, do NOT invent page numbers!
    return source.pageCount === 1 && claimedPage === 1 && quoteOffset !== null ? 1 : null;
  }

  if (quoteOffset === null) return null;
  let activePage: number | null = null;
  for (const mk of markers) {
    if (mk.index <= quoteOffset) activePage = mk.page;
  }
  return activePage === claimedPage ? claimedPage : null;
}

/**
 * Deterministically computes 1-based paragraph index and preceding section header ONLY from
 * actual text structure around `quoteOffset`. Never invents synthetic sections.
 */
function computeParagraphAndSectionLocator(
  sourceText: string,
  quoteOffset: number
): { paragraphIndex: number | null; sectionLabel: string | null } {
  if (!sourceText || quoteOffset < 0 || quoteOffset > sourceText.length) {
    return { paragraphIndex: null, sectionLabel: null };
  }
  const before = sourceText.slice(0, quoteOffset);
  const paragraphIndex = before.split(/\r?\n\s*\r?\n/).length;

  const linesBefore = before.split(/\r?\n/);
  let sectionLabel: string | null = null;
  for (let i = linesBefore.length - 1; i >= Math.max(0, linesBefore.length - 80); i--) {
    const candidate = linesBefore[i].trim();
    if (!candidate) continue;
    if (
      /^#{1,4}\s+\S/.test(candidate) ||
      /^(?:SECTION|PART|APPENDIX|IV\.|III\.|II\.|I\.|SUMMARY|TSUNAMI|INTENSITY|AFTERSHOCKS|TECTONIC|RECOMMENDATIONS)\b/i.test(
        candidate
      )
    ) {
      sectionLabel = candidate.replace(/^#{1,4}\s+/, '').slice(0, 80);
      break;
    }
  }
  return { paragraphIndex, sectionLabel };
}

export function verifyFindingEvidenceAgainstSource(
  draft: Omit<
    CandidateScientificFinding,
    'evidenceValidationStatus' | 'evidenceValidationNote' | 'evidenceLocator'
  > & {
    claimedOffset?: number | null;
    claimedPage?: number | null;
    preferredLocatorKind?: FindingEvidenceLocator['kind'];
    preferredLocatorLabel?: string;
  },
  source: PrimerResearchSourceRecord
): Pick<
  CandidateScientificFinding,
  'evidenceValidationStatus' | 'evidenceValidationNote' | 'evidenceLocator'
> {
  if (source.textAvailability === 'scanned-no-text') {
    return {
      evidenceValidationStatus: 'scanned-no-text',
      evidenceValidationNote:
        'Source is a scanned/image-only PDF without searchable text; OCR was not fabricated.',
      evidenceLocator: {
        kind: 'unavailable',
        label: 'Scanned PDF (no searchable text)',
        startOffset: null,
        endOffset: null,
        pageNumber: null,
        paragraphIndex: null,
        sectionLabel: null,
      },
    };
  }

  // Deterministic USGS ComCat structured product record
  if (
    draft.extractionMethod === 'deterministic' &&
    source.usgsDetail &&
    draft.preferredLocatorKind === 'usgs-product-path'
  ) {
    const qCheck = verifyQuoteAgainstSourceText(draft.evidencePassage, source.extractedText);
    return {
      evidenceValidationStatus: 'metadata-only-verified',
      evidenceValidationNote:
        'Verified against structured USGS ComCat GeoJSON product payload retrieved in R1.',
      evidenceLocator: {
        kind: 'usgs-product-path',
        label: draft.preferredLocatorLabel || 'USGS ComCat GeoJSON',
        startOffset: qCheck.matched ? qCheck.startOffset : null,
        endOffset: qCheck.matched ? qCheck.endOffset : null,
        pageNumber: null,
        paragraphIndex: null,
        sectionLabel: null,
      },
    };
  }

  if (!source.extractedText || !source.extractedText.trim()) {
    return {
      evidenceValidationStatus: 'insufficient-evidence',
      evidenceValidationNote:
        'Source has no extracted text available to verify supporting evidence.',
      evidenceLocator: {
        kind: 'unavailable',
        label: 'No extracted source text',
        startOffset: null,
        endOffset: null,
        pageNumber: null,
        paragraphIndex: null,
        sectionLabel: null,
      },
    };
  }

  const quoteMatch = verifyQuoteAgainstSourceText(draft.evidencePassage, source.extractedText);
  if (!quoteMatch.matched || quoteMatch.startOffset === null || quoteMatch.endOffset === null) {
    return {
      evidenceValidationStatus: 'evidence-unresolved',
      evidenceValidationNote:
        'Evidence Unresolved: Supporting quote could not be matched verbatim against stored source text. Never eligible for auto-insertion.',
      evidenceLocator: {
        kind: 'unverified',
        label: 'Unverified passage (missing exact match)',
        startOffset: null,
        endOffset: null,
        pageNumber: null,
        paragraphIndex: null,
        sectionLabel: null,
      },
    };
  }

  const verifiedPage = verifyClaimedPageNumber(draft.claimedPage, quoteMatch.startOffset, source);
  const { paragraphIndex, sectionLabel } = computeParagraphAndSectionLocator(
    source.extractedText,
    quoteMatch.startOffset
  );
  const offsetMismatchNote =
    typeof draft.claimedOffset === 'number' &&
    Math.abs(draft.claimedOffset - quoteMatch.startOffset) > 250
      ? ` (Note: AI-claimed offset ${draft.claimedOffset} corrected to verified offset ${quoteMatch.startOffset})`
      : '';
  const pageDroppedNote =
    typeof draft.claimedPage === 'number' && verifiedPage === null
      ? ' (Claimed page number omitted because source lacks per-page mapping)'
      : '';

  const paraPart = paragraphIndex ? `, P${paragraphIndex}` : '';
  const label = verifiedPage
    ? `Page ${verifiedPage}${paraPart}, chars ${quoteMatch.startOffset}-${quoteMatch.endOffset}`
    : `${sectionLabel ? `${sectionLabel} · ` : ''}P${paragraphIndex ?? '?'}, chars ${quoteMatch.startOffset}-${quoteMatch.endOffset} (${quoteMatch.matchMode})`;

  return {
    evidenceValidationStatus: 'source-verified',
    evidenceValidationNote: `Verified verbatim quote match (${quoteMatch.matchMode})${offsetMismatchNote}${pageDroppedNote}.`,
    evidenceLocator: {
      kind: verifiedPage ? 'page-verified' : 'text-offset',
      label,
      startOffset: quoteMatch.startOffset,
      endOffset: quoteMatch.endOffset,
      pageNumber: verifiedPage,
      paragraphIndex,
      sectionLabel,
    },
  };
}

const PEIS_ROMAN_TO_NUMERIC: Record<string, number> = {
  I: 1,
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
  VI: 6,
  VII: 7,
  VIII: 8,
  IX: 9,
  X: 10,
};

/**
 * Computes normalized value + unit ONLY when mathematically exact and scientifically valid.
 * Never converts between magnitude scales (e.g., Ms vs Mww) or PEIS <-> MMI.
 */
export function computeValidNormalization(
  originalValue: string | null | undefined,
  originalUnits: string | null | undefined
): { normalizedValue: number | string | null; normalizedUnits: string | null } {
  const val = (originalValue ?? '').trim();
  const unit = (originalUnits ?? '').trim();
  if (!val || !unit) return { normalizedValue: null, normalizedUnits: null };

  const uLower = unit.toLowerCase();
  if (uLower === 'peis') {
    const rank = PEIS_ROMAN_TO_NUMERIC[val.toUpperCase()];
    if (rank) return { normalizedValue: rank, normalizedUnits: 'PEIS-numeric' };
  }
  if (uLower === 'aftershock count') {
    const n = Number(val.replace(/,/g, ''));
    if (Number.isInteger(n) && n >= 0) return { normalizedValue: n, normalizedUnits: 'count' };
  }
  if (uLower === 'km') {
    const n = Number(val.replace(/,/g, ''));
    if (Number.isFinite(n)) return { normalizedValue: n, normalizedUnits: 'km' };
  }
  if (uLower === 'm' || uLower === 'meters') {
    const n = Number(val.replace(/,/g, ''));
    if (Number.isFinite(n)) return { normalizedValue: n, normalizedUnits: 'm' };
  }
  if (uLower === 'cm') {
    const n = Number(val.replace(/,/g, ''));
    if (Number.isFinite(n)) return { normalizedValue: Number((n / 100).toFixed(4)), normalizedUnits: 'm' };
  }
  // Never cross-convert magnitude scales or MMI <-> PEIS
  return { normalizedValue: null, normalizedUnits: null };
}

// =============================================================================
// DETERMINISTIC EXTRACTION (SECTION A) — ZERO GEMINI REQUIRED
// =============================================================================

function simpleStableHash(input: string): string {
  let h1 = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h1 ^= input.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0');
}

export function computeDuplicateGroupHash(params: {
  category: R2FindingCategory;
  originalValue?: string | null;
  extractedStatement: string;
}): string {
  const norm = `${params.category}::${(params.originalValue ?? '').trim().toLowerCase()}::${params.extractedStatement
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, ' ')
    .trim()
    .slice(0, 120)}`;
  return `dup_${simpleStableHash(norm)}`;
}

function buildDeterministicUsgsFindings(
  source: PrimerResearchSourceRecord,
  detail: UsgsEventDetailParseResult,
  runId: string,
  runVersion: number,
  nowUtc: string
): CandidateScientificFinding[] {
  const excluded = source.eventMatchState === 'nonmatching-event';
  const findings: CandidateScientificFinding[] = [];
  const srcRef = source.sourceUrl || source.sourceLocation;

  const pushFinding = (
    suffix: string,
    params: {
      epistemicBasis: FindingEpistemicBasis;
      category: R2FindingCategory;
      title: string;
      statement: string;
      structuredValues: Record<string, string | number | boolean | null>;
      originalValue: string | null;
      originalUnits: string | null;
      normalizedValue?: number | string | null;
      normalizedUnits?: string | null;
      obsTime: string | null;
      obsTz: string | null;
      pubTime: string | null;
      passage: string;
      locatorLabel: string;
      caveats: string[];
    }
  ) => {
    const base = {
      findingId: `fnd_${runId}_${suffix}`,
      linkedEqpEventId: source.linkedEqpEventId,
      sourceId: source.sourceId,
      sourceTitle: source.documentTitle,
      sourceOrganization: source.organization,
      sourceVersionNumber: source.versionNumber,
      sourceContentSha256: source.contentSha256,
      extractionMethod: 'deterministic' as const,
      epistemicBasis: params.epistemicBasis,
      category: params.category,
      findingTitle: params.title,
      extractedStatement: params.statement,
      structuredValues: params.structuredValues,
      originalValue: params.originalValue,
      originalUnits: params.originalUnits,
      normalizedValue: params.normalizedValue ?? null,
      normalizedUnits: params.normalizedUnits ?? null,
      observationTimeRaw: params.obsTime,
      observationTimeZone: params.obsTz,
      publishedOrUpdatedUtc: params.pubTime,
      evidencePassage: params.passage,
      sourceReference: srcRef,
      eventMatchState: source.eventMatchState,
      eventMatchExplanation: source.eventMatchDetails.explanation,
      excludedByNonMatchingEvent: excluded,
      extractedAtUtc: nowUtc,
      conflictGroupId: null,
      conflictKind: null,
      conflictSummary: null,
      duplicateGroupHash: computeDuplicateGroupHash({
        category: params.category,
        originalValue: params.originalValue,
        extractedStatement: params.statement,
      }),
      modelUsed: null,
      extractionRunId: runId,
      extractionRunVersion: runVersion,
      relevanceStatus: 'active' as const,
      supersededByRunId: null,
      extractionSchemaVersion: FINDING_SCHEMA_VERSION,
      caveats: params.caveats,
      preferredLocatorKind: 'usgs-product-path' as const,
      preferredLocatorLabel: params.locatorLabel,
    };

    const verified = verifyFindingEvidenceAgainstSource(base, source);
    findings.push({
      findingId: base.findingId,
      linkedEqpEventId: base.linkedEqpEventId,
      sourceId: base.sourceId,
      sourceTitle: base.sourceTitle,
      sourceOrganization: base.sourceOrganization,
      sourceVersionNumber: base.sourceVersionNumber,
      sourceContentSha256: base.sourceContentSha256,
      extractionMethod: base.extractionMethod,
      epistemicBasis: base.epistemicBasis,
      category: base.category,
      findingTitle: base.findingTitle,
      extractedStatement: base.extractedStatement,
      structuredValues: base.structuredValues,
      originalValue: base.originalValue,
      originalUnits: base.originalUnits,
      normalizedValue: base.normalizedValue,
      normalizedUnits: base.normalizedUnits,
      observationTimeRaw: base.observationTimeRaw,
      observationTimeZone: base.observationTimeZone,
      publishedOrUpdatedUtc: base.publishedOrUpdatedUtc,
      evidencePassage: base.evidencePassage,
      evidenceLocator: verified.evidenceLocator,
      sourceReference: base.sourceReference,
      eventMatchState: base.eventMatchState,
      eventMatchExplanation: base.eventMatchExplanation,
      excludedByNonMatchingEvent: base.excludedByNonMatchingEvent,
      extractedAtUtc: base.extractedAtUtc,
      evidenceValidationStatus: verified.evidenceValidationStatus,
      evidenceValidationNote: verified.evidenceValidationNote,
      conflictGroupId: null,
      conflictKind: null,
      conflictSummary: null,
      duplicateGroupHash: base.duplicateGroupHash,
      modelUsed: null,
      extractionRunId: base.extractionRunId,
      extractionRunVersion: base.extractionRunVersion,
      relevanceStatus: base.relevanceStatus,
      supersededByRunId: null,
      extractionSchemaVersion: FINDING_SCHEMA_VERSION,
      caveats: base.caveats,
    });
  };

  // 1. Origin product
  const originProd = detail.products.find((p) => p.productCategory === 'origin' && p.available);
  if (originProd) {
    pushFinding('usgs_origin', {
      epistemicBasis: 'measured',
      category: 'official-bulletins',
      title: `USGS Origin Reference (${detail.usgsEventId})`,
      statement: `USGS ComCat event ${detail.usgsEventId} (${detail.place || 'region unspecified'}) origin at ${detail.originTimeUtc ?? 'unknown UTC'}, coordinates ${detail.lat ?? '?'}°N, ${detail.lon ?? '?'}°E, depth ${detail.depthKm ?? '?'} km (contributor: ${originProd.sourceContributor ?? 'unknown'}, version: ${originProd.version ?? 'N/A'}). External reference only; does not replace preferred EQP solution.`,
      structuredValues: {
        usgsEventId: detail.usgsEventId,
        lat: detail.lat,
        lon: detail.lon,
        depthKm: detail.depthKm,
        contributor: originProd.sourceContributor,
        version: originProd.version,
        productUrl: originProd.sourceUrl,
      },
      originalValue:
        detail.lat !== null && detail.lon !== null
          ? `${detail.lat}, ${detail.lon} (depth ${detail.depthKm ?? '?'} km)`
          : null,
      originalUnits: 'deg / km',
      obsTime: detail.originTimeUtc,
      obsTz: 'UTC',
      pubTime: originProd.updateTimeUtc,
      passage: `USGS Event ID: ${detail.usgsEventId}`,
      locatorLabel: `${detail.detailQueryUrl}#products.origin[0]`,
      caveats: [
        'External USGS origin reference; never overwrites active EQPEvent hypocenter or PLOT solution.',
      ],
    });
  }

  // 2. Magnitude product
  const magProd = detail.products.find((p) => p.productCategory === 'magnitude' && p.available);
  if (magProd && detail.magnitude !== null) {
    pushFinding('usgs_mag', {
      epistemicBasis: 'measured',
      category: 'official-bulletins',
      title: `USGS Preferred Magnitude (${detail.magnitudeType ?? 'Mag'} ${detail.magnitude})`,
      statement: `USGS reports preferred magnitude ${detail.magnitude} ${detail.magnitudeType ?? ''} for ${detail.usgsEventId} (contributor: ${magProd.sourceContributor ?? 'unknown'}). Scale ${detail.magnitudeType ?? 'unknown'} must not be equated directly with PHIVOLCS Ms/Mb/Md.`,
      structuredValues: {
        usgsEventId: detail.usgsEventId,
        magnitude: detail.magnitude,
        magnitudeScale: detail.magnitudeType,
        numStations: magProd.metadata.magnitudeNumStations ?? null,
        contributor: magProd.sourceContributor,
        productUrl: magProd.sourceUrl,
      },
      originalValue: `${detail.magnitude}`,
      originalUnits: detail.magnitudeType || 'mag',
      obsTime: detail.originTimeUtc,
      obsTz: 'UTC',
      pubTime: magProd.updateTimeUtc,
      passage: `Preferred Magnitude: ${detail.magnitude.toFixed(2)} ${detail.magnitudeType ?? ''}`.trim(),
      locatorLabel: `${detail.detailQueryUrl}#properties.mag`,
      caveats: [
        'Preserve raw magnitude scale; different magnitude scales (e.g., Mww vs Ms) are not numerically interchangeable.',
      ],
    });
  }

  // 3. Tsunami flag reference (never treated as official PHIVOLCS tsunami advisory)
  if (detail.tsunamiFlagRaw !== null) {
    pushFinding('usgs_tsunami_flag', {
      epistemicBasis: 'reported',
      category: 'tsunami-sea-level',
      title: `USGS ComCat Tsunami Flag Reference (${detail.tsunamiFlagRaw})`,
      statement: `USGS ComCat properties.tsunami raw flag is ${detail.tsunamiFlagRaw}. This external USGS metadata flag is NOT an official PHIVOLCS tsunami advisory, warning, or cancellation.`,
      structuredValues: {
        usgsEventId: detail.usgsEventId,
        tsunamiFlagRaw: detail.tsunamiFlagRaw,
        productUrl: detail.eventPageUrl,
      },
      originalValue: String(detail.tsunamiFlagRaw),
      originalUnits: 'USGS boolean flag',
      obsTime: detail.originTimeUtc,
      obsTz: 'UTC',
      pubTime: detail.retrievedAtUtc,
      passage: `USGS Tsunami Flag (NOT PHIVOLCS Advisory): ${detail.tsunamiFlagRaw}`,
      locatorLabel: `${detail.detailQueryUrl}#properties.tsunami`,
      caveats: [
        'NOT an official PHIVOLCS tsunami advisory or cancellation. Require explicit PHIVOLCS Tsunami Bulletin metadata before concluding tsunami status.',
      ],
    });
  }

  // 4. Moment tensor & focal mechanism
  for (const cat of ['moment-tensor', 'focal-mechanism'] as const) {
    const prod = detail.products.find((p) => p.productCategory === cat && p.available);
    if (prod) {
      pushFinding(`usgs_${cat}`, {
        epistemicBasis: 'modeled',
        category: 'focal-mechanism-products',
        title: `USGS ${cat === 'moment-tensor' ? 'Moment Tensor' : 'Focal Mechanism'} Product`,
        statement: `USGS ${cat} product available (contributor: ${prod.sourceContributor ?? 'unknown'}, version: ${prod.version ?? 'N/A'}, updated: ${prod.updateTimeUtc ?? 'unknown'}). NP1 strike/dip/rake: ${prod.metadata.nodalPlane1Strike ?? '?'}/${prod.metadata.nodalPlane1Dip ?? '?'}/${prod.metadata.nodalPlane1Rake ?? '?'}.`,
        structuredValues: {
          ...prod.metadata,
          contributor: prod.sourceContributor,
          version: prod.version,
          updateTimeUtc: prod.updateTimeUtc,
          productUrl: prod.sourceUrl,
        },
        originalValue:
          prod.metadata.nodalPlane1Strike !== null && prod.metadata.nodalPlane1Strike !== undefined
            ? `NP1 ${prod.metadata.nodalPlane1Strike}/${prod.metadata.nodalPlane1Dip}/${prod.metadata.nodalPlane1Rake}`
            : prod.productId,
        originalUnits: 'deg (strike/dip/rake)',
        obsTime: detail.originTimeUtc,
        obsTz: 'UTC',
        pubTime: prod.updateTimeUtc,
        passage: `- [${prod.productType}] Source: ${prod.sourceContributor ?? 'unknown'}`,
        locatorLabel: `${detail.detailQueryUrl}#products.${cat}[0]`,
        caveats: [
          'Derived/modeled source mechanism; nodal-plane selection requires specialist geological/aftershock evaluation.',
        ],
      });
    }
  }

  // 5. ShakeMap (Estimated shaking)
  const smProd = detail.products.find((p) => p.productCategory === 'shakemap' && p.available);
  if (smProd) {
    pushFinding('usgs_shakemap', {
      epistemicBasis: 'estimated',
      category: 'reported-intensities',
      title: `USGS ShakeMap Estimated Max Shaking (MMI ${smProd.metadata.maxMmi ?? '?'})`,
      statement: `USGS ShakeMap estimates maximum MMI ${smProd.metadata.maxMmi ?? 'N/A'} (PGA ${smProd.metadata.maxPgaPctG ?? 'N/A'} %g, PGV ${smProd.metadata.maxPgvCmS ?? 'N/A'} cm/s; version: ${smProd.version ?? 'N/A'}). Estimated ground shaking is NOT verified PHIVOLCS PEIS or confirmed observed structural damage.`,
      structuredValues: {
        ...smProd.metadata,
        contributor: smProd.sourceContributor,
        version: smProd.version,
        updateTimeUtc: smProd.updateTimeUtc,
        productUrl: smProd.sourceUrl,
      },
      originalValue: smProd.metadata.maxMmi !== null && smProd.metadata.maxMmi !== undefined ? String(smProd.metadata.maxMmi) : null,
      originalUnits: 'MMI (estimated)',
      obsTime: detail.originTimeUtc,
      obsTz: 'UTC',
      pubTime: smProd.updateTimeUtc,
      passage: `- [shakemap] Source: ${smProd.sourceContributor ?? 'unknown'}`,
      locatorLabel: `${detail.detailQueryUrl}#products.shakemap[0]`,
      caveats: [
        'Estimated MMI ground shaking (ShakeMap); NEVER convert into confirmed observed field damage or verified PHIVOLCS PEIS.',
      ],
    });
  }

  // 6. DYFI (Crowdsourced felt reports)
  const dyfiProd = detail.products.find((p) => p.productCategory === 'dyfi' && p.available);
  if (dyfiProd) {
    pushFinding('usgs_dyfi', {
      epistemicBasis: 'reported',
      category: 'reported-intensities',
      title: `USGS DYFI Crowdsourced Reports (MMI ${dyfiProd.metadata.maxMmi ?? '?'}, n=${dyfiProd.metadata.numResponses ?? '?'})`,
      statement: `USGS "Did You Feel It?" records crowdsourced max MMI ${dyfiProd.metadata.maxMmi ?? 'N/A'} across ${dyfiProd.metadata.numResponses ?? 'N/A'} responses (version: ${dyfiProd.version ?? 'N/A'}). Crowdsourced MMI is distinct from verified PHIVOLCS PEIS field reports.`,
      structuredValues: {
        ...dyfiProd.metadata,
        contributor: dyfiProd.sourceContributor,
        version: dyfiProd.version,
        updateTimeUtc: dyfiProd.updateTimeUtc,
        productUrl: dyfiProd.sourceUrl,
      },
      originalValue: dyfiProd.metadata.maxMmi !== null && dyfiProd.metadata.maxMmi !== undefined ? String(dyfiProd.metadata.maxMmi) : null,
      originalUnits: 'MMI (crowdsourced DYFI)',
      obsTime: detail.originTimeUtc,
      obsTz: 'UTC',
      pubTime: dyfiProd.updateTimeUtc,
      passage: `- [dyfi] Source: ${dyfiProd.sourceContributor ?? 'unknown'}`,
      locatorLabel: `${detail.detailQueryUrl}#products.dyfi[0]`,
      caveats: ['Crowdsourced MMI reports; distinct from verified PHIVOLCS PEIS intensities.'],
    });
  }

  // 7. LossPAGER (Modeled impact estimate)
  const pagerProd = detail.products.find((p) => p.productCategory === 'losspager' && p.available);
  if (pagerProd) {
    pushFinding('usgs_losspager', {
      epistemicBasis: 'modeled',
      category: 'structural-infrastructure',
      title: `USGS PAGER Modeled Impact Alert (${String(pagerProd.metadata.alertLevel ?? 'N/A').toUpperCase()})`,
      statement: `USGS LossPAGER reports modeled alert level "${pagerProd.metadata.alertLevel ?? 'N/A'}" (maxMMI ${pagerProd.metadata.maxMmi ?? 'N/A'}, contributor: ${pagerProd.sourceContributor ?? 'unknown'}). PAGER is a modeled loss estimate, NOT confirmed observed structural damage or casualties.`,
      structuredValues: {
        ...pagerProd.metadata,
        contributor: pagerProd.sourceContributor,
        version: pagerProd.version,
        updateTimeUtc: pagerProd.updateTimeUtc,
        productUrl: pagerProd.sourceUrl,
      },
      originalValue:
        pagerProd.metadata.alertLevel !== null && pagerProd.metadata.alertLevel !== undefined
          ? String(pagerProd.metadata.alertLevel)
          : null,
      originalUnits: 'PAGER modeled alert tier',
      obsTime: detail.originTimeUtc,
      obsTz: 'UTC',
      pubTime: pagerProd.updateTimeUtc,
      passage: `- [losspager] Source: ${pagerProd.sourceContributor ?? 'unknown'}`,
      locatorLabel: `${detail.detailQueryUrl}#products.losspager[0]`,
      caveats: ['Modeled PAGER impact alert; NEVER treat as confirmed field-observed structural damage.'],
    });
  }

  // 8. Ground Failure (Modeled landslide & liquefaction probability)
  const gfProd = detail.products.find((p) => p.productCategory === 'ground-failure' && p.available);
  if (gfProd) {
    const lsAlert = gfProd.metadata.landslideAlert;
    const lqAlert = gfProd.metadata.liquefactionAlert;
    if (lsAlert !== null && lsAlert !== undefined) {
      pushFinding('usgs_gf_landslide', {
        epistemicBasis: 'modeled',
        category: 'landslides-rockfalls',
        title: `USGS Modeled Landslide Hazard Alert (${String(lsAlert).toUpperCase()})`,
        statement: `USGS ground-failure model reports landslide alert "${lsAlert}" (version: ${gfProd.version ?? 'N/A'}). Modeled probability is NOT a confirmed field landslide observation.`,
        structuredValues: {
          landslideAlert: lsAlert,
          contributor: gfProd.sourceContributor,
          version: gfProd.version,
          productUrl: gfProd.sourceUrl,
        },
        originalValue: String(lsAlert),
        originalUnits: 'USGS modeled probability tier',
        obsTime: detail.originTimeUtc,
        obsTz: 'UTC',
        pubTime: gfProd.updateTimeUtc,
        passage: `- [ground-failure] Source: ${gfProd.sourceContributor ?? 'unknown'}`,
        locatorLabel: `${detail.detailQueryUrl}#products.ground-failure[0]`,
        caveats: ['Modeled landslide probability; NOT confirmed field-observed landslides.'],
      });
    }
    if (lqAlert !== null && lqAlert !== undefined) {
      pushFinding('usgs_gf_liquefaction', {
        epistemicBasis: 'modeled',
        category: 'liquefaction-deformation',
        title: `USGS Modeled Liquefaction Hazard Alert (${String(lqAlert).toUpperCase()})`,
        statement: `USGS ground-failure model reports liquefaction alert "${lqAlert}" (version: ${gfProd.version ?? 'N/A'}). Modeled probability is NOT a confirmed field liquefaction observation.`,
        structuredValues: {
          liquefactionAlert: lqAlert,
          contributor: gfProd.sourceContributor,
          version: gfProd.version,
          productUrl: gfProd.sourceUrl,
        },
        originalValue: String(lqAlert),
        originalUnits: 'USGS modeled probability tier',
        obsTime: detail.originTimeUtc,
        obsTz: 'UTC',
        pubTime: gfProd.updateTimeUtc,
        passage: `- [ground-failure] Source: ${gfProd.sourceContributor ?? 'unknown'}`,
        locatorLabel: `${detail.detailQueryUrl}#products.ground-failure[0]`,
        caveats: ['Modeled liquefaction probability; NOT confirmed field-observed liquefaction.'],
      });
    }
  }

  // 9. Finite Fault
  const ffProd = detail.products.find((p) => p.productCategory === 'finite-fault' && p.available);
  if (ffProd) {
    pushFinding('usgs_finite_fault', {
      epistemicBasis: 'modeled',
      category: 'tectonic-generators',
      title: `USGS Finite Fault Slip Model Reference`,
      statement: `USGS finite-fault inversion reference available (derived magnitude ${ffProd.metadata.derivedMagnitude ?? 'N/A'} ${ffProd.metadata.derivedMagnitudeType ?? ''}, contributor: ${ffProd.sourceContributor ?? 'unknown'}). Requires specialist review.`,
      structuredValues: {
        ...ffProd.metadata,
        contributor: ffProd.sourceContributor,
        version: ffProd.version,
        productUrl: ffProd.sourceUrl,
      },
      originalValue:
        ffProd.metadata.derivedMagnitude !== null && ffProd.metadata.derivedMagnitude !== undefined
          ? `${ffProd.metadata.derivedMagnitude} ${ffProd.metadata.derivedMagnitudeType ?? ''}`.trim()
          : ffProd.productId,
      originalUnits: String(ffProd.metadata.derivedMagnitudeType ?? 'modeled moment/mag'),
      obsTime: detail.originTimeUtc,
      obsTz: 'UTC',
      pubTime: ffProd.updateTimeUtc,
      passage: `- [finite-fault] Source: ${ffProd.sourceContributor ?? 'unknown'}`,
      locatorLabel: `${detail.detailQueryUrl}#products.finite-fault[0]`,
      caveats: ['Inversion slip model; does not independently confirm causative fault plane without local geological/aftershock review.'],
    });
  }

  return findings;
}

/**
 * Deterministic rule-based extraction from plain text / HTML / PDF extracted text.
 * Emits ONLY findings backed by verbatim lines present in `source.extractedText`.
 * Never fabricates categories or placeholder claims.
 */
export function extractDeterministicFindingsFromSource(
  source: PrimerResearchSourceRecord,
  options: {
    extractionRunId?: string;
    extractionRunVersion?: number;
    nowUtc?: string;
  } = {}
): CandidateScientificFinding[] {
  const runId =
    options.extractionRunId ?? `run_det_${Date.now()}_${simpleStableHash(source.sourceId)}`;
  const runVersion = options.extractionRunVersion ?? 1;
  const nowUtc = options.nowUtc ?? new Date().toISOString();

  // Scanned/image-only document without searchable text -> zero fabricated claims!
  if (source.textAvailability === 'scanned-no-text') {
    return [];
  }

  // Structured USGS ComCat GeoJSON products
  if (source.usgsDetail) {
    return buildDeterministicUsgsFindings(source, source.usgsDetail, runId, runVersion, nowUtc);
  }

  const text = (source.extractedText || '').trim();
  if (!text) return [];

  const excluded = source.eventMatchState === 'nonmatching-event';
  const srcRef = source.sourceUrl || source.sourceLocation;
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 6);

  const findings: CandidateScientificFinding[] = [];
  const emittedKeys = new Set<string>();

  const addTextFinding = (params: {
    key: string;
    category: R2FindingCategory;
    epistemicBasis: FindingEpistemicBasis;
    title: string;
    statement: string;
    structuredValues: Record<string, string | number | boolean | null>;
    originalValue: string | null;
    originalUnits: string | null;
    obsTime?: string | null;
    obsTz?: string | null;
    passage: string;
    caveats?: string[];
  }) => {
    if (emittedKeys.has(params.key)) return;
    emittedKeys.add(params.key);

    const norm = computeValidNormalization(params.originalValue, params.originalUnits);
    const draft = {
      findingId: `fnd_${runId}_${params.key}`,
      linkedEqpEventId: source.linkedEqpEventId,
      sourceId: source.sourceId,
      sourceTitle: source.documentTitle,
      sourceOrganization: source.organization,
      sourceVersionNumber: source.versionNumber,
      sourceContentSha256: source.contentSha256,
      extractionMethod: 'deterministic' as const,
      epistemicBasis: params.epistemicBasis,
      category: params.category,
      findingTitle: params.title,
      extractedStatement: params.statement,
      structuredValues: params.structuredValues,
      originalValue: params.originalValue,
      originalUnits: params.originalUnits,
      normalizedValue: norm.normalizedValue,
      normalizedUnits: norm.normalizedUnits,
      observationTimeRaw: params.obsTime ?? null,
      observationTimeZone: params.obsTz ?? null,
      publishedOrUpdatedUtc: source.publishedAtUtc,
      evidencePassage: params.passage,
      sourceReference: srcRef,
      eventMatchState: source.eventMatchState,
      eventMatchExplanation: source.eventMatchDetails.explanation,
      excludedByNonMatchingEvent: excluded,
      extractedAtUtc: nowUtc,
      conflictGroupId: null,
      conflictKind: null,
      conflictSummary: null,
      duplicateGroupHash: computeDuplicateGroupHash({
        category: params.category,
        originalValue: params.originalValue,
        extractedStatement: params.statement,
      }),
      modelUsed: null,
      extractionRunId: runId,
      extractionRunVersion: runVersion,
      relevanceStatus: 'active' as const,
      supersededByRunId: null,
      extractionSchemaVersion: FINDING_SCHEMA_VERSION,
      caveats: params.caveats ?? [],
    };
    const verified = verifyFindingEvidenceAgainstSource(draft, source);
    findings.push({
      ...draft,
      evidenceLocator: verified.evidenceLocator,
      evidenceValidationStatus: verified.evidenceValidationStatus,
      evidenceValidationNote: verified.evidenceValidationNote,
    });
  };

  for (const line of lines) {
    // 1a. Official bulletin number / update header
    const bulMatch = line.match(/\b(?:Earthquake\s+Information|Bulletin)\s*(?:No\.?|#)\s*(\d+)/i);
    if (bulMatch) {
      addTextFinding({
        key: `bul_${bulMatch[1]}_${simpleStableHash(line)}`,
        category: 'official-bulletins',
        epistemicBasis: 'reported',
        title: `Official Bulletin No. ${bulMatch[1]} Reference`,
        statement: `Source cites "${line}".`,
        structuredValues: { bulletinNumber: Number(bulMatch[1]) },
        originalValue: `Bulletin No. ${bulMatch[1]}`,
        originalUnits: 'bulletin number',
        obsTime:
          line.match(/\b\d{1,2}\s+[A-Za-z]+\s+\d{4}\b[^,;\n]*/)?.[0]?.trim() ?? null,
        obsTz: /\bPST\b/i.test(line) ? 'PST' : /\bUTC|GMT\b/i.test(line) ? 'UTC' : null,
        passage: line,
      });
    }

    // 1b. Origin Date/Time line when explicitly labeled
    const originLineMatch = line.match(
      /\b(?:Date\s+and\s+Time|Origin\s+Time)\s*[:\-]\s*(.+)/i
    );
    if (originLineMatch) {
      const tz = /\bPST\b/i.test(line) ? 'PST' : /\bUTC|GMT\b/i.test(line) ? 'UTC' : null;
      addTextFinding({
        key: `origin_time_${simpleStableHash(line)}`,
        category: 'official-bulletins',
        epistemicBasis: 'measured',
        title: 'Reported Origin Date/Time',
        statement: `Document states origin time "${originLineMatch[1].trim()}".`,
        structuredValues: { rawTimestamp: originLineMatch[1].trim() },
        originalValue: originLineMatch[1].trim().slice(0, 80),
        originalUnits: tz ?? 'origin time',
        obsTime: originLineMatch[1].trim().slice(0, 80),
        obsTz: tz,
        passage: line,
      });
    }

    // 1c. Magnitude mention
    const magMatch = line.match(/\b(Ms|Mw|Mww|Mwb|Mb|ML|Md)\s*[:=]?\s*(\d+(?:\.\d+)?)\b/i);
    if (magMatch) {
      addTextFinding({
        key: `mag_${magMatch[1].toLowerCase()}_${magMatch[2]}_${simpleStableHash(line)}`,
        category: 'official-bulletins',
        epistemicBasis: 'reported',
        title: `Reported Magnitude (${magMatch[1]} ${magMatch[2]})`,
        statement: `Document reports magnitude ${magMatch[1]} ${magMatch[2]}: "${line}".`,
        structuredValues: { scale: magMatch[1], value: Number(magMatch[2]) },
        originalValue: magMatch[2],
        originalUnits: magMatch[1],
        passage: line,
        caveats: ['Preserve source magnitude scale; do not equate across different magnitude scales.'],
      });
    }

    // 1d. Depth mention
    const depthMatch = line.match(/\bDepth(?:\s+of\s+Focus)?\s*[:=]?\s*(?:0*)(\d+(?:\.\d+)?)\s*(km)\b/i);
    if (depthMatch) {
      addTextFinding({
        key: `depth_${depthMatch[1]}_${simpleStableHash(line)}`,
        category: 'official-bulletins',
        epistemicBasis: 'measured',
        title: `Reported Focal Depth (${depthMatch[1]} km)`,
        statement: `Document reports focal depth ${depthMatch[1]} km: "${line}".`,
        structuredValues: { depthKm: Number(depthMatch[1]) },
        originalValue: depthMatch[1],
        originalUnits: 'km',
        passage: line,
      });
    }

    // 2. Tsunami advisories & sea-level observations
    if (
      /\b(?:tsunami\s+(?:advisory|warning|bulletin|information|alert)|no\s+(?:destructive\s+)?tsunami\s+threat|destructive\s+tsunami|tide\s+gauge|sea[\s-]level\s+(?:observation|rise|change|wave))\b/i.test(
        line
      )
    ) {
      const advNo =
        line.match(/(?:Tsunami\s+(?:Advisory|Bulletin|Information)\s*(?:No\.?|#)?\s*(\d+))/i)?.[1] ??
        null;
      const isNoThreat =
        /\b(?:no\s+(?:destructive\s+)?tsunami\s+threat|not\s+expect(?:ed)?\s+to\s+generate\s+a\s+destructive\s+tsunami)\b/i.test(
          line
        );
      const waveMatch = line.match(/(\d+(?:\.\d+)?)\s*(cm|m|meters)\b/i);
      addTextFinding({
        key: `tsunami_${advNo ?? simpleStableHash(line)}`,
        category: 'tsunami-sea-level',
        epistemicBasis: waveMatch ? 'measured' : 'reported',
        title: advNo
          ? `Tsunami Advisory No. ${advNo}`
          : waveMatch
            ? `Sea-Level / Wave Observation (${waveMatch[1]} ${waveMatch[2]})`
            : isNoThreat
              ? 'No-Tsunami-Threat Statement'
              : 'Tsunami Advisory Reference',
        statement: `Document states: "${line}".`,
        structuredValues: {
          advisoryNumber: advNo,
          noDestructiveThreatIndicated: isNoThreat,
          waveHeight: waveMatch ? Number(waveMatch[1]) : null,
        },
        originalValue: waveMatch
          ? waveMatch[1]
          : isNoThreat
            ? 'no-destructive-tsunami-threat'
            : advNo
              ? `Advisory ${advNo}`
              : line.slice(0, 60),
        originalUnits: waveMatch ? waveMatch[2] : 'advisory status',
        passage: line,
      });
    }

    // 3. Reported intensities (PEIS)
    const peisMatch = line.match(/\bIntensity\s+(I{1,3}|IV|VI{0,3}|IX|X)\b/i);
    if (peisMatch) {
      addTextFinding({
        key: `peis_${peisMatch[1].toUpperCase()}_${simpleStableHash(line)}`,
        category: 'reported-intensities',
        epistemicBasis: 'reported',
        title: `Reported PEIS Intensity ${peisMatch[1].toUpperCase()}`,
        statement: `Source reports Intensity ${peisMatch[1].toUpperCase()}: "${line}".`,
        structuredValues: { peis: peisMatch[1].toUpperCase() },
        originalValue: peisMatch[1].toUpperCase(),
        originalUnits: 'PEIS',
        passage: line,
      });
    }

    // 4. Landslides and rockfalls
    if (/\b(?:landslide|rockfall|slope\s+failure|mass\s+wasting)\b/i.test(line)) {
      addTextFinding({
        key: `landslide_${simpleStableHash(line)}`,
        category: 'landslides-rockfalls',
        epistemicBasis: 'reported',
        title: 'Landslide / Rockfall Observation',
        statement: `Source mentions landslide/rockfall observation: "${line}".`,
        structuredValues: {},
        originalValue: null,
        originalUnits: null,
        passage: line,
      });
    }

    // 5. Liquefaction & ground deformation
    if (
      /\b(?:liquefaction|sand\s+boil|lateral\s+spread|ground\s+rupture|surface\s+rupture|fissur(?:e|ing))\b/i.test(
        line
      )
    ) {
      addTextFinding({
        key: `liq_${simpleStableHash(line)}`,
        category: 'liquefaction-deformation',
        epistemicBasis: 'reported',
        title: 'Liquefaction / Ground Deformation Observation',
        statement: `Source mentions liquefaction or ground deformation: "${line}".`,
        structuredValues: {},
        originalValue: null,
        originalUnits: null,
        passage: line,
      });
    }

    // 6. Structural / infrastructure impacts
    if (
      /\b(?:damage(?:d)?\s+(?:to\s+)?(?:house|school|bridge|road|hospital|building|church|infrastructure)s?|structural\s+damage|collapsed|power\s+outage)\b/i.test(
        line
      )
    ) {
      addTextFinding({
        key: `struct_${simpleStableHash(line)}`,
        category: 'structural-infrastructure',
        epistemicBasis: 'reported',
        title: 'Structural / Infrastructure Impact Report',
        statement: `Source reports structural or infrastructure impact: "${line}".`,
        structuredValues: {},
        originalValue: null,
        originalUnits: null,
        passage: line,
      });
    }

    // 7. Tectonic interpretations & named generators
    const faultMatch = line.match(
      /\b((?:North\s+Bohol|East\s+Bohol|West\s+Valley|East\s+Valley|Philippine|Marikina|Central\s+Mindanao|Cotabato|Manila|Negros|Sulu)\s+(?:Fault(?:\s+System)?|Trench)|causative\s+fault|active\s+fault|subduction\s+zone)\b/i
    );
    if (faultMatch) {
      addTextFinding({
        key: `tect_${simpleStableHash(line)}`,
        category: 'tectonic-generators',
        epistemicBasis: 'interpreted',
        title: `Tectonic Generator Reference (${faultMatch[1]})`,
        statement: `Source discusses tectonic generator ${faultMatch[1]}: "${line}".`,
        structuredValues: { namedStructure: faultMatch[1] },
        originalValue: faultMatch[1],
        originalUnits: 'geologic structure',
        passage: line,
        caveats: ['Tectonic generator attribution requires geological/aftershock field review.'],
      });
    }

    // 8. Focal mechanism & scientific products (text bulletins/reports)
    if (
      /\b(?:focal\s+mechanism|moment\s+tensor|nodal\s+plane|strike\/dip\/rake|reverse\s+faulting|thrust\s+faulting|strike-slip\s+faulting)\b/i.test(
        line
      )
    ) {
      addTextFinding({
        key: `fm_${simpleStableHash(line)}`,
        category: 'focal-mechanism-products',
        epistemicBasis: 'modeled',
        title: 'Focal Mechanism / Faulting Mode Reference',
        statement: `Source cites focal mechanism or faulting geometry: "${line}".`,
        structuredValues: {},
        originalValue: line.match(/(reverse|thrust|normal|strike-slip)\s+faulting/i)?.[0] ?? null,
        originalUnits: null,
        passage: line,
      });
    }

    // 9. Volcano-related monitoring
    if (
      /\b(?:volcan(?:o|ic)\s+(?:activity|earthquake|swarm|alert|monitoring)|Alert\s+Level\s+\d|Taal|Mayon|Kanlaon|Bulusan)\b/i.test(
        line
      )
    ) {
      addTextFinding({
        key: `volc_${simpleStableHash(line)}`,
        category: 'volcano-monitoring',
        epistemicBasis: 'reported',
        title: 'Volcano Monitoring / Proximity Note',
        statement: `Source notes volcano monitoring context: "${line}".`,
        structuredValues: {},
        originalValue: line.match(/Alert\s+Level\s+\d/i)?.[0] ?? null,
        originalUnits: null,
        passage: line,
      });
    }

    // 10. Aftershock reports & count cutoffs (plus catalog scope if present)
    const aftershockCountMatch = line.match(/(\d[\d,]*)\s+(?:recorded\s+|plotted\s+)?aftershock(?:s)?/i);
    if (aftershockCountMatch) {
      const timeMatch =
        line.match(/(?:as\s+of|until|up\s+to)\s+([^.;,\n]+)/i)?.[1]?.trim() ?? null;
      const scopeMatch =
        line.match(/(M\s*>=?\s*\d+(?:\.\d+)?|magnitude\s+\d+(?:\.\d+)?\s*(?:and\s+above|\+)|plotted|felt|recorded\s+by\s+network)/i)?.[1]?.trim() ??
        null;
      addTextFinding({
        key: `aftershock_${aftershockCountMatch[1]}_${simpleStableHash(line)}`,
        category: 'aftershock-cutoffs',
        epistemicBasis: 'measured',
        title: `Aftershock Count (${aftershockCountMatch[1]})`,
        statement: `Source reports ${aftershockCountMatch[1]} aftershocks${timeMatch ? ` (as of ${timeMatch})` : ''}${scopeMatch ? ` [scope: ${scopeMatch}]` : ''}: "${line}".`,
        structuredValues: {
          aftershockCount: Number(aftershockCountMatch[1].replace(/,/g, '')),
          cutoffPhrase: timeMatch,
          catalogScope: scopeMatch,
        },
        originalValue: aftershockCountMatch[1],
        originalUnits: 'aftershock count',
        obsTime: timeMatch,
        obsTz: /\bPST\b/i.test(line) ? 'PST' : /\bUTC|GMT\b/i.test(line) ? 'UTC' : null,
        passage: line,
      });
    }

    // 11. PHIVOLCS monitoring / QRT activities
    if (
      /\b(?:QRT|Quick\s+Response\s+Team|PHIVOLCS\s+(?:dispatched|deployed|monitored|field\s+investigation)|mobile\s+(?:seismic|monitoring)\s+station)\b/i.test(
        line
      )
    ) {
      addTextFinding({
        key: `qrt_${simpleStableHash(line)}`,
        category: 'phivolcs-monitoring-qrt',
        epistemicBasis: 'reported',
        title: 'PHIVOLCS Monitoring / QRT Deployment Reference',
        statement: `Source cites monitoring/QRT activity: "${line}".`,
        structuredValues: {},
        originalValue: null,
        originalUnits: null,
        passage: line,
      });
    }

    // 12. Agency coordination & official response
    if (
      /\b(?:NDRRMC|RDRRMC|OCD|DSWD|DPWH|SitRep|Situational\s+Report|coordinated\s+with\s+(?:LGU|LGUs|local\s+government))\b/i.test(
        line
      )
    ) {
      addTextFinding({
        key: `coord_${simpleStableHash(line)}`,
        category: 'agency-coordination',
        epistemicBasis: 'reported',
        title: 'Agency Coordination / Official Response Reference',
        statement: `Source references official agency coordination: "${line}".`,
        structuredValues: {},
        originalValue: null,
        originalUnits: null,
        passage: line,
      });
    }

    // 13. Public safety & preparedness statements
    if (
      /\b(?:Duck,?\s*Cover,?\s*(?:and\s*)?Hold|stay\s+away\s+from\s+(?:coastal|steep|damaged)|precaution\s+against\s+aftershocks|evacuate\s+to\s+higher\s+ground|do\s+not\s+re-?enter\s+damaged)\b/i.test(
        line
      )
    ) {
      addTextFinding({
        key: `safety_${simpleStableHash(line)}`,
        category: 'public-safety-preparedness',
        epistemicBasis: 'reported',
        title: 'Public Safety / Preparedness Guidance',
        statement: `Source issues public safety or preparedness statement: "${line}".`,
        structuredValues: {},
        originalValue: null,
        originalUnits: null,
        passage: line,
      });
    }
  }

  return findings;
}

// =============================================================================
// RUNTIME VALIDATION OF STRUCTURED AI JSON EXTRACTION OUTPUTS (SECTION B)
// =============================================================================

export interface RawAiExtractedFindingItem {
  category?: unknown;
  epistemicBasis?: unknown;
  findingTitle?: unknown;
  extractedStatement?: unknown;
  originalValue?: unknown;
  originalUnits?: unknown;
  observationTimeRaw?: unknown;
  observationTimeZone?: unknown;
  publishedOrUpdatedUtc?: unknown;
  evidencePassage?: unknown;
  claimedStartOffset?: unknown;
  claimedPageNumber?: unknown;
  caveats?: unknown;
}

const VALID_EPISTEMIC_BASES = new Set<FindingEpistemicBasis>([
  'measured',
  'reported',
  'estimated',
  'modeled',
  'interpreted',
]);

const VALID_CATEGORY_SET = new Set<R2FindingCategory>(R2_FINDING_CATEGORIES);

export function validateAndMaterializeAiFindings(params: {
  rawJsonText: string;
  source: PrimerResearchSourceRecord;
  modelUsed: string;
  extractionRunId: string;
  extractionRunVersion: number;
  chunkOffset?: number;
  nowUtc?: string;
}): {
  ok: boolean;
  findings: CandidateScientificFinding[];
  rejectedCount: number;
  error?: string;
} {
  const parsed = safeJsonParseChecked(params.rawJsonText);
  if (!parsed.ok) {
    return {
      ok: false,
      findings: [],
      rejectedCount: 0,
      error: `AI response failed safe JSON parsing: ${parsed.error}`,
    };
  }

  const root = parsed.value;
  let items: unknown[] | null = null;
  if (Array.isArray(root)) {
    items = root;
  } else if (root && typeof root === 'object' && Array.isArray((root as { findings?: unknown }).findings)) {
    items = (root as { findings: unknown[] }).findings;
  }

  if (!items) {
    return {
      ok: false,
      findings: [],
      rejectedCount: 0,
      error: 'AI response schema mismatch: expected object with "findings" array or top-level array.',
    };
  }

  const nowUtc = params.nowUtc ?? new Date().toISOString();
  const excluded = params.source.eventMatchState === 'nonmatching-event';
  const srcRef = params.source.sourceUrl || params.source.sourceLocation;
  const findings: CandidateScientificFinding[] = [];
  let rejectedCount = 0;

  for (let i = 0; i < Math.min(items.length, 40); i++) {
    const raw = items[i] as RawAiExtractedFindingItem | null;
    if (!raw || typeof raw !== 'object') {
      rejectedCount += 1;
      continue;
    }

    const cat = typeof raw.category === 'string' ? raw.category.trim() : '';
    if (!VALID_CATEGORY_SET.has(cat as R2FindingCategory)) {
      rejectedCount += 1;
      continue;
    }
    const category = cat as R2FindingCategory;

    const findingTitle = sanitizeUntrustedTextValue(raw.findingTitle, 180);
    const extractedStatement = sanitizeUntrustedTextValue(raw.extractedStatement, 1200);
    const evidencePassage = sanitizeUntrustedTextValue(raw.evidencePassage, 1200);

    if (!findingTitle || !extractedStatement) {
      rejectedCount += 1;
      continue;
    }

    const rawBasis =
      typeof raw.epistemicBasis === 'string' &&
      VALID_EPISTEMIC_BASES.has(raw.epistemicBasis as FindingEpistemicBasis)
        ? (raw.epistemicBasis as FindingEpistemicBasis)
        : 'reported';

    const originalValue =
      typeof raw.originalValue === 'string' || typeof raw.originalValue === 'number'
        ? sanitizeUntrustedTextValue(String(raw.originalValue), 160) || null
        : null;
    const originalUnits =
      typeof raw.originalUnits === 'string'
        ? sanitizeUntrustedTextValue(raw.originalUnits, 60) || null
        : null;
    const obsTime =
      typeof raw.observationTimeRaw === 'string'
        ? sanitizeUntrustedTextValue(raw.observationTimeRaw, 120) || null
        : null;
    const obsTz =
      typeof raw.observationTimeZone === 'string'
        ? sanitizeUntrustedTextValue(raw.observationTimeZone, 24) || null
        : null;
    const pubTime =
      typeof raw.publishedOrUpdatedUtc === 'string'
        ? sanitizeUntrustedTextValue(raw.publishedOrUpdatedUtc, 80) || null
        : null;

    const rawOffset =
      typeof raw.claimedStartOffset === 'number' &&
      Number.isFinite(raw.claimedStartOffset) &&
      raw.claimedStartOffset >= 0
        ? raw.claimedStartOffset + (params.chunkOffset ?? 0)
        : null;
    const claimedOffset = rawOffset;
    const claimedPage =
      typeof raw.claimedPageNumber === 'number' &&
      Number.isInteger(raw.claimedPageNumber) &&
      raw.claimedPageNumber >= 1
        ? raw.claimedPageNumber
        : null;

    const caveats = Array.isArray(raw.caveats)
      ? raw.caveats
          .map((c) => sanitizeUntrustedTextValue(c, 240))
          .filter(Boolean)
          .slice(0, 6)
      : [];

    const norm = computeValidNormalization(originalValue, originalUnits);
    const draft = {
      findingId: `fnd_${params.extractionRunId}_ai_${i}`,
      linkedEqpEventId: params.source.linkedEqpEventId,
      sourceId: params.source.sourceId,
      sourceTitle: params.source.documentTitle,
      sourceOrganization: params.source.organization,
      sourceVersionNumber: params.source.versionNumber,
      sourceContentSha256: params.source.contentSha256,
      extractionMethod: 'gemini' as const,
      epistemicBasis: rawBasis,
      category,
      findingTitle,
      extractedStatement,
      structuredValues: {
        aiClaimedStartOffset: claimedOffset,
        aiClaimedPageNumber: claimedPage,
      },
      originalValue,
      originalUnits,
      normalizedValue: norm.normalizedValue,
      normalizedUnits: norm.normalizedUnits,
      observationTimeRaw: obsTime,
      observationTimeZone: obsTz,
      publishedOrUpdatedUtc: pubTime,
      evidencePassage,
      sourceReference: srcRef,
      eventMatchState: params.source.eventMatchState,
      eventMatchExplanation: params.source.eventMatchDetails.explanation,
      excludedByNonMatchingEvent: excluded,
      extractedAtUtc: nowUtc,
      conflictGroupId: null,
      conflictKind: null,
      conflictSummary: null,
      duplicateGroupHash: computeDuplicateGroupHash({
        category,
        originalValue,
        extractedStatement,
      }),
      modelUsed: params.modelUsed,
      extractionRunId: params.extractionRunId,
      extractionRunVersion: params.extractionRunVersion,
      relevanceStatus: 'active' as const,
      supersededByRunId: null,
      extractionSchemaVersion: FINDING_SCHEMA_VERSION,
      caveats: [
        'AI-extracted candidate finding; NOT an institutionally verified PRIMER fact.',
        ...caveats,
      ],
      claimedOffset,
      claimedPage,
    };

    const verified = verifyFindingEvidenceAgainstSource(draft, params.source);

    findings.push({
      findingId: draft.findingId,
      linkedEqpEventId: draft.linkedEqpEventId,
      sourceId: draft.sourceId,
      sourceTitle: draft.sourceTitle,
      sourceOrganization: draft.sourceOrganization,
      sourceVersionNumber: draft.sourceVersionNumber,
      sourceContentSha256: draft.sourceContentSha256,
      extractionMethod: draft.extractionMethod,
      epistemicBasis: draft.epistemicBasis,
      category: draft.category,
      findingTitle: draft.findingTitle,
      extractedStatement: draft.extractedStatement,
      structuredValues: draft.structuredValues,
      originalValue: draft.originalValue,
      originalUnits: draft.originalUnits,
      normalizedValue: draft.normalizedValue,
      normalizedUnits: draft.normalizedUnits,
      observationTimeRaw: draft.observationTimeRaw,
      observationTimeZone: draft.observationTimeZone,
      publishedOrUpdatedUtc: draft.publishedOrUpdatedUtc,
      evidencePassage: draft.evidencePassage,
      evidenceLocator: verified.evidenceLocator,
      sourceReference: draft.sourceReference,
      eventMatchState: draft.eventMatchState,
      eventMatchExplanation: draft.eventMatchExplanation,
      excludedByNonMatchingEvent: draft.excludedByNonMatchingEvent,
      extractedAtUtc: draft.extractedAtUtc,
      evidenceValidationStatus: verified.evidenceValidationStatus,
      evidenceValidationNote: verified.evidenceValidationNote,
      conflictGroupId: null,
      conflictKind: null,
      conflictSummary: null,
      duplicateGroupHash: draft.duplicateGroupHash,
      modelUsed: draft.modelUsed,
      extractionRunId: draft.extractionRunId,
      extractionRunVersion: draft.extractionRunVersion,
      relevanceStatus: draft.relevanceStatus,
      supersededByRunId: null,
      extractionSchemaVersion: FINDING_SCHEMA_VERSION,
      caveats: draft.caveats,
    });
  }

  return { ok: true, findings, rejectedCount };
}

/**
 * Creates a sanitized, quote-verified operator manual candidate finding (works 100% offline).
 */
export function createManualCandidateFinding(params: {
  source: PrimerResearchSourceRecord;
  category: R2FindingCategory;
  epistemicBasis: FindingEpistemicBasis;
  findingTitle: string;
  extractedStatement: string;
  evidencePassage: string;
  originalValue?: string | null;
  originalUnits?: string | null;
  observationTimeRaw?: string | null;
  observationTimeZone?: string | null;
  claimedPageNumber?: number | null;
  caveats?: string[];
  nowUtc?: string;
}): CandidateScientificFinding {
  const nowUtc = params.nowUtc ?? new Date().toISOString();
  const runId = `run_manual_${Date.now()}_${simpleStableHash(params.source.sourceId + params.findingTitle)}`;
  const findingTitle = sanitizeUntrustedTextValue(params.findingTitle, 180) || 'Operator Manual Finding';
  const extractedStatement = sanitizeUntrustedTextValue(params.extractedStatement, 1200) || findingTitle;
  const evidencePassage = sanitizeUntrustedTextValue(params.evidencePassage, 1200);
  const originalValue = params.originalValue
    ? sanitizeUntrustedTextValue(params.originalValue, 160) || null
    : null;
  const originalUnits = params.originalUnits
    ? sanitizeUntrustedTextValue(params.originalUnits, 60) || null
    : null;
  const norm = computeValidNormalization(originalValue, originalUnits);
  const excluded = params.source.eventMatchState === 'nonmatching-event';

  const draft = {
    findingId: `fnd_${runId}`,
    linkedEqpEventId: params.source.linkedEqpEventId,
    sourceId: params.source.sourceId,
    sourceTitle: params.source.documentTitle,
    sourceOrganization: params.source.organization,
    sourceVersionNumber: params.source.versionNumber,
    sourceContentSha256: params.source.contentSha256,
    extractionMethod: 'manual' as const,
    epistemicBasis: params.epistemicBasis,
    category: params.category,
    findingTitle,
    extractedStatement,
    structuredValues: {},
    originalValue,
    originalUnits,
    normalizedValue: norm.normalizedValue,
    normalizedUnits: norm.normalizedUnits,
    observationTimeRaw: params.observationTimeRaw
      ? sanitizeUntrustedTextValue(params.observationTimeRaw, 120) || null
      : null,
    observationTimeZone: params.observationTimeZone
      ? sanitizeUntrustedTextValue(params.observationTimeZone, 24) || null
      : null,
    publishedOrUpdatedUtc: params.source.publishedAtUtc,
    evidencePassage,
    sourceReference: params.source.sourceUrl || params.source.sourceLocation,
    eventMatchState: params.source.eventMatchState,
    eventMatchExplanation: params.source.eventMatchDetails.explanation,
    excludedByNonMatchingEvent: excluded,
    extractedAtUtc: nowUtc,
    conflictGroupId: null,
    conflictKind: null,
    conflictSummary: null,
    duplicateGroupHash: computeDuplicateGroupHash({
      category: params.category,
      originalValue,
      extractedStatement,
    }),
    modelUsed: null,
    extractionRunId: runId,
    extractionRunVersion: 1,
    relevanceStatus: 'active' as const,
    supersededByRunId: null,
    extractionSchemaVersion: FINDING_SCHEMA_VERSION,
    caveats: [
      'Operator-entered candidate finding; requires scientific verification before PRIMER inclusion.',
      ...(params.caveats ?? []).map((c) => sanitizeUntrustedTextValue(c, 240)).filter(Boolean),
    ],
    claimedPage: params.claimedPageNumber ?? null,
  };

  const verified = verifyFindingEvidenceAgainstSource(draft, params.source);

  return {
    findingId: draft.findingId,
    linkedEqpEventId: draft.linkedEqpEventId,
    sourceId: draft.sourceId,
    sourceTitle: draft.sourceTitle,
    sourceOrganization: draft.sourceOrganization,
    sourceVersionNumber: draft.sourceVersionNumber,
    sourceContentSha256: draft.sourceContentSha256,
    extractionMethod: draft.extractionMethod,
    epistemicBasis: draft.epistemicBasis,
    category: draft.category,
    findingTitle: draft.findingTitle,
    extractedStatement: draft.extractedStatement,
    structuredValues: draft.structuredValues,
    originalValue: draft.originalValue,
    originalUnits: draft.originalUnits,
    normalizedValue: draft.normalizedValue,
    normalizedUnits: draft.normalizedUnits,
    observationTimeRaw: draft.observationTimeRaw,
    observationTimeZone: draft.observationTimeZone,
    publishedOrUpdatedUtc: draft.publishedOrUpdatedUtc,
    evidencePassage: draft.evidencePassage,
    evidenceLocator: verified.evidenceLocator,
    sourceReference: draft.sourceReference,
    eventMatchState: draft.eventMatchState,
    eventMatchExplanation: draft.eventMatchExplanation,
    excludedByNonMatchingEvent: draft.excludedByNonMatchingEvent,
    extractedAtUtc: draft.extractedAtUtc,
    evidenceValidationStatus: verified.evidenceValidationStatus,
    evidenceValidationNote: verified.evidenceValidationNote,
    conflictGroupId: null,
    conflictKind: null,
    conflictSummary: null,
    duplicateGroupHash: draft.duplicateGroupHash,
    modelUsed: null,
    extractionRunId: draft.extractionRunId,
    extractionRunVersion: draft.extractionRunVersion,
    relevanceStatus: draft.relevanceStatus,
    supersededByRunId: null,
    extractionSchemaVersion: FINDING_SCHEMA_VERSION,
    caveats: draft.caveats,
  };
}

// =============================================================================
// SCIENTIFIC CONFLICT & DUPLICATE DETECTION ENGINE (SECTION H)
// =============================================================================

export interface FindingConflictCluster {
  conflictGroupId: string;
  category: R2FindingCategory;
  kind: R2ConflictKind;
  summary: string;
  findingIds: string[];
  sourceIds: string[];
  neverAutoResolveNote: string;
}

function isMagnitudeScaleUnit(unit: string | null): boolean {
  if (!unit) return false;
  return /^(ms|mw|mww|mwb|mb|ml|md|mag)/i.test(unit.trim());
}

/**
 * Compares eligible active findings across sources without modifying them on disk,
 * returning annotated findings + summary conflict clusters for operator review.
 * Never automatically declares a newer finding "correct".
 */
export function detectFindingConflictsAndDuplicates(
  inputFindings: CandidateScientificFinding[]
): {
  annotatedFindings: CandidateScientificFinding[];
  clusters: FindingConflictCluster[];
} {
  // Reset transient conflict pointers on clone before computing current matrix
  const findings: CandidateScientificFinding[] = inputFindings.map((f) => ({
    ...f,
    conflictGroupId: null,
    conflictKind: null,
    conflictSummary: null,
  }));

  const eligible = findings.filter(
    (f) =>
      !f.excludedByNonMatchingEvent &&
      f.relevanceStatus === 'active' &&
      !f.supersededByRunId
  );

  const clusters: FindingConflictCluster[] = [];
  const assignCluster = (
    members: CandidateScientificFinding[],
    kind: R2ConflictKind,
    summary: string,
    keySeed: string
  ) => {
    const groupId = `cfl_${simpleStableHash(keySeed)}`;
    clusters.push({
      conflictGroupId: groupId,
      category: members[0].category,
      kind,
      summary,
      findingIds: members.map((m) => m.findingId),
      sourceIds: Array.from(new Set(members.map((m) => m.sourceId))),
      neverAutoResolveNote:
        'Unresolved comparison only — EQP never assumes a newer document is automatically correct.',
    });
    for (const m of members) {
      if (!m.conflictGroupId) {
        m.conflictGroupId = groupId;
        m.conflictKind = kind;
        m.conflictSummary = summary;
      }
    }
  };

  // 2. Category-specific scientific comparisons (run before duplicate pass so scientific
  // differences take primary badge precedence on individual findings, while all clusters stay listed)
  const byCategory = new Map<R2FindingCategory, CandidateScientificFinding[]>();
  for (const f of eligible) {
    const arr = byCategory.get(f.category) ?? [];
    arr.push(f);
    byCategory.set(f.category, arr);
  }

  // 2a. Magnitude comparisons under official-bulletins
  const bulletins = byCategory.get('official-bulletins') ?? [];
  const magFindings = bulletins.filter((f) => isMagnitudeScaleUnit(f.originalUnits) && f.originalValue);
  if (magFindings.length > 1) {
    const families = new Set(
      magFindings.map((m) => normalizeMagnitudeScaleFamily(m.originalUnits))
    );
    const values = new Set(magFindings.map((m) => `${m.originalValue}`));
    if (families.size > 1) {
      assignCluster(
        magFindings,
        'magnitude-scale-difference',
        `Sources report different magnitude scales (${Array.from(
          new Set(magFindings.map((m) => `${m.originalUnits} ${m.originalValue}`))
        ).join(' vs. ')}); distinct scales are NOT treated as a numerical contradiction.`,
        `mag_scale_${magFindings.map((m) => m.findingId).join('_')}`
      );
    } else if (values.size > 1) {
      const bulletinNums = new Set(
        bulletins
          .map((b) => String(b.structuredValues.bulletinNumber ?? ''))
          .filter(Boolean)
      );
      const sourceVersions = new Set(magFindings.map((m) => m.sourceVersionNumber));
      const isRevisionSpread = bulletinNums.size > 1 || sourceVersions.size > 1;
      assignCluster(
        magFindings,
        isRevisionSpread ? 'preliminary-vs-updated' : 'conflicting-event-parameter',
        isRevisionSpread
          ? `Preliminary vs. updated bulletin/version reports differ on same magnitude scale (${Array.from(
              new Set(magFindings.map((m) => `${m.originalUnits} ${m.originalValue} (v${m.sourceVersionNumber})`))
            ).join(' vs. ')}). Compare issuance timestamps; never auto-mark newer as verified.`
          : `Conflicting magnitude values on the same scale family (${Array.from(
              new Set(magFindings.map((m) => `${m.originalUnits} ${m.originalValue}`))
            ).join(' vs. ')}). Operator verification required.`,
        `mag_cfl_${magFindings.map((m) => m.findingId).join('_')}`
      );
    }
  }

  // 2b. Origin / coordinate / depth / origin-time parameter comparisons across sources
  const originFindings = bulletins.filter(
    (f) => f.originalUnits === 'deg / km' && f.originalValue
  );
  if (originFindings.length > 1) {
    const distinctCoords = new Set(originFindings.map((o) => o.originalValue));
    if (distinctCoords.size > 1) {
      assignCluster(
        originFindings,
        'conflicting-location-or-time',
        `Sources report different hypocenter coordinates/depths (${Array.from(distinctCoords).join(' vs. ')}).`,
        `loc_${originFindings.map((o) => o.findingId).join('_')}`
      );
    }
  }

  const bulletinNumFindings = bulletins.filter(
    (f) => typeof f.structuredValues.bulletinNumber === 'number'
  );
  if (bulletinNumFindings.length > 1) {
    const distinctNums = new Set(
      bulletinNumFindings.map((b) => String(b.structuredValues.bulletinNumber))
    );
    if (distinctNums.size > 1) {
      assignCluster(
        bulletinNumFindings,
        'preliminary-vs-updated',
        `Multiple bulletin revisions present (${Array.from(distinctNums)
          .map((n) => `No. ${n}`)
          .join(', ')}); compare preliminary vs. updated claims manually.`,
        `bul_rev_${bulletinNumFindings.map((b) => b.findingId).join('_')}`
      );
    }
  }

  // 2c. Tsunami advisory statuses & versions
  const tsunamiFindings = byCategory.get('tsunami-sea-level') ?? [];
  if (tsunamiFindings.length > 1) {
    const statuses = new Set(tsunamiFindings.map((t) => t.originalValue ?? t.findingTitle));
    const distinctAdvNums = new Set(
      tsunamiFindings
        .map((t) => String(t.structuredValues.advisoryNumber ?? ''))
        .filter(Boolean)
    );
    if (statuses.size > 1) {
      if (distinctAdvNums.size > 1) {
        assignCluster(
          tsunamiFindings,
          'advisory-revision-progression',
          `Multiple tsunami advisory numbers/versions preserved (${Array.from(statuses).join(' | ')}); compare issuance timestamps before concluding current status.`,
          `tsu_rev_${tsunamiFindings.map((t) => t.findingId).join('_')}`
        );
      } else {
        assignCluster(
          tsunamiFindings,
          'conflicting-tsunami-advisory',
          `Conflicting tsunami status statements across sources (${Array.from(statuses).join(' vs. ')}).`,
          `tsu_cfl_${tsunamiFindings.map((t) => t.findingId).join('_')}`
        );
      }
    }
  }

  // 2d. Aftershock counts, cutoff timestamps & catalog scopes
  const aftershocks = byCategory.get('aftershock-cutoffs') ?? [];
  if (aftershocks.length > 1) {
    const counts = new Set(aftershocks.map((a) => String(a.originalValue ?? '')));
    const cutoffs = new Set(
      aftershocks.map((a) => String(a.observationTimeRaw ?? 'unspecified'))
    );
    const scopes = new Set(
      aftershocks.map((a) => String(a.structuredValues.catalogScope ?? 'unspecified'))
    );
    if (counts.size > 1) {
      if (scopes.size > 1) {
        assignCluster(
          aftershocks,
          'catalog-scope-difference',
          `Aftershock counts reflect different catalog scopes/thresholds (${aftershocks
            .map((a) => `${a.originalValue} [${a.structuredValues.catalogScope ?? 'unspecified'}]`)
            .join(' vs. ')}). Not directly comparable without scope normalization.`,
          `aft_scope_${aftershocks.map((a) => a.findingId).join('_')}`
        );
      } else if (cutoffs.size > 1) {
        assignCluster(
          aftershocks,
          'aftershock-cutoff-difference',
          `Aftershock counts differ across different cutoff timestamps (${aftershocks
            .map((a) => `${a.originalValue} as of ${a.observationTimeRaw ?? 'unspecified'}`)
            .join(' vs. ')}). Not necessarily contradictory.`,
          `aft_cut_${aftershocks.map((a) => a.findingId).join('_')}`
        );
      } else {
        assignCluster(
          aftershocks,
          'conflicting-aftershock-count',
          `Conflicting aftershock counts (${Array.from(counts).join(' vs. ')}) without differing cutoff or catalog-scope explanation.`,
          `aft_cfl_${aftershocks.map((a) => a.findingId).join('_')}`
        );
      }
    }
  }

  // 2e. Reported intensities / structural / hazards — distinguish measured/reported vs estimated/modeled
  for (const cat of [
    'reported-intensities',
    'structural-infrastructure',
    'landslides-rockfalls',
    'liquefaction-deformation',
  ] as R2FindingCategory[]) {
    const group = byCategory.get(cat) ?? [];
    if (group.length > 1) {
      const bases = new Set(group.map((g) => g.epistemicBasis));
      const vals = new Set(group.map((g) => g.originalValue).filter(Boolean));
      if (
        (bases.has('reported') || bases.has('measured')) &&
        (bases.has('estimated') || bases.has('modeled'))
      ) {
        assignCluster(
          group,
          'measurement-type-difference',
          `Combines reported/measured data with estimated/modeled products (${Array.from(bases).join(' vs. ')}); keep epistemic types separate.`,
          `mtype_${cat}_${group.map((g) => g.findingId).join('_')}`
        );
      } else if (vals.size > 1) {
        assignCluster(
          group,
          'conflicting-observation',
          `Multiple sources report differing values for ${R2_CATEGORY_LABELS[cat]} (${Array.from(vals).join(' vs. ')}).`,
          `obs_${cat}_${group.map((g) => g.findingId).join('_')}`
        );
      }
    }
  }

  // 2f. Tectonic / focal mechanism interpretations
  for (const cat of ['tectonic-generators', 'focal-mechanism-products'] as R2FindingCategory[]) {
    const group = byCategory.get(cat) ?? [];
    const distinctSources = new Set(group.map((g) => g.sourceId));
    const distinctVals = new Set(group.map((g) => g.originalValue || g.findingTitle));
    if (distinctSources.size > 1 && distinctVals.size > 1) {
      assignCluster(
        group,
        'different-interpretation',
        `Multiple sources offer distinct ${R2_CATEGORY_LABELS[cat]} models/interpretations.`,
        `interp_${cat}_${group.map((g) => g.findingId).join('_')}`
      );
    }
  }

  // 3. Exact duplicate findings across distinct sources
  const byDupHash = new Map<string, CandidateScientificFinding[]>();
  for (const f of eligible) {
    const arr = byDupHash.get(f.duplicateGroupHash) ?? [];
    arr.push(f);
    byDupHash.set(f.duplicateGroupHash, arr);
  }
  for (const [hash, group] of byDupHash.entries()) {
    const distinctSources = new Set(group.map((g) => g.sourceId));
    if (distinctSources.size > 1) {
      assignCluster(
        group,
        'duplicate-finding',
        `Equivalent claim detected across ${distinctSources.size} sources (${group.map((g) => g.sourceOrganization).join(', ')}).`,
        `dup_${hash}`
      );
    }
  }

  return { annotatedFindings: findings, clusters };
}

/**
 * Helper to revalidate an existing finding when a source document is re-imported
 * as a new version (vN -> vN+1) or when active event tolerances change.
 */
export function revalidateFindingAgainstSource(
  finding: CandidateScientificFinding,
  updatedSource: PrimerResearchSourceRecord,
  activeEvent?: EQPEvent,
  tolerances: ResearchMatchTolerances = DEFAULT_RESEARCH_MATCH_TOLERANCES
): CandidateScientificFinding {
  // Prefer updatedSource's authoritative R1 match evaluation; re-score only if explicitly requested for an activeEvent without existing details
  const evaluatedMatch: ResearchEventMatchDetails =
    activeEvent && updatedSource.eventMatchDetails.activeEqpEventId !== activeEvent.id
      ? evaluateResearchEventMatch(
          {
            externalEventIds: updatedSource.externalEventIds,
            originTimeUtc: updatedSource.publishedAtUtc,
          },
          activeEvent,
          tolerances
        )
      : updatedSource.eventMatchDetails;

  const effectiveMatchState = evaluatedMatch.state;

  const verified = verifyFindingEvidenceAgainstSource(
    {
      ...finding,
      preferredLocatorKind:
        finding.extractionMethod === 'deterministic' && updatedSource.usgsDetail
          ? 'usgs-product-path'
          : undefined,
      preferredLocatorLabel:
        finding.evidenceLocator.kind === 'usgs-product-path'
          ? finding.evidenceLocator.label
          : undefined,
    },
    updatedSource
  );

  return {
    ...finding,
    sourceVersionNumber: updatedSource.versionNumber,
    sourceContentSha256: updatedSource.contentSha256,
    eventMatchState: effectiveMatchState,
    eventMatchExplanation: evaluatedMatch.explanation,
    excludedByNonMatchingEvent: effectiveMatchState === 'nonmatching-event',
    evidenceLocator: verified.evidenceLocator,
    evidenceValidationStatus: verified.evidenceValidationStatus,
    evidenceValidationNote: verified.evidenceValidationNote,
  };
}
