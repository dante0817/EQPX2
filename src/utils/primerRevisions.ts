import type { EQPEvent } from '../data/eqpData.ts';
import {
  extractVerifiedPrimerParameters,
  resolvePrimerDocumentId,
  type PrimerDocument,
  type PrimerSectionId,
  type PrimerSectionReviewStatus,
} from './earthquakePrimer.ts';
import {
  computePrimerEventFingerprint,
  type PrimerMapExtent,
  type PrimerMapLayerConfig,
  type PrimerMapTheme,
} from './primerMapFigure.ts';
import {
  buildPrimerReferenceList,
  computePrimerReadinessSummary,
  DEFAULT_PRIMER_PRESENTATION_CONFIG,
  normalizePresentationConfig,
  type PrimerExportRevisionInfo,
  type PrimerPresentationConfig,
} from './primerPresentation.ts';
import {
  createDefaultStage4ExternalData,
  type PrimerContentState,
  type PrimerStage4ExternalData,
} from './primerScientificNarratives.ts';
import { formatUtcAsPst } from './primerSequenceIntegration.ts';
import { freezeSectionCommentsForSnapshot } from './primerSectionComments.ts';

export const PRIMER_REVISION_SCHEMA_VERSION = '1.0' as const;

export type PrimerSourceFreshnessStatus =
  | 'synchronized'
  | 'stale-at-snapshot'
  | 'incomplete-sources';

export interface PrimerRevisionCompleteness {
  populatedSections: number;
  totalSections: number;
  readyForReviewCount: number;
  requiresInfoCount: number;
  requiresScientificReviewCount: number;
  unavailableOrMissingFields: string[];
  readyFigureCount: number;
  totalFigureSlots: number;
  hasStage2Figure: boolean;
  hasStage3Package: boolean;
  hasStage4Package: boolean;
  stage4StateSummary: Record<PrimerContentState, number> | null;
  snapshotSourceFreshness: {
    isPlotResultStaleAtSnapshot: boolean;
    staleIndicatorsAtSnapshot: string[];
    status: PrimerSourceFreshnessStatus;
  };
}

export interface PrimerRevisionRecord {
  schemaVersion: '1.0';
  primerDocumentId: string;
  eventId: string;
  revisionId: string;
  revisionNumber: number;
  parentRevisionId: string | null;
  createdAtUtc: string;
  createdAtPst: string;
  description: string;
  snapshot: PrimerDocument;
  sourceEventFingerprint: string;
  stage2FigureFingerprint: string | null;
  stage3SequenceFingerprint: string | null;
  stage4NarrativeFingerprint: string | null;
  presentationConfig: PrimerPresentationConfig;
  completenessIndicators: PrimerRevisionCompleteness;
  contentChecksum: string;
}

export interface CreatePrimerRevisionOptions {
  description?: string;
  existingRevisions?: PrimerRevisionRecord[];
  explicitRevisionId?: string;
  createdAtUtc?: string;
  currentEventFingerprint?: string;
  currentStage3Fingerprint?: string;
  currentStage4Fingerprint?: string;
  isPlotResultStale?: boolean;
}

export interface CreatePrimerRevisionResult {
  revision: PrimerRevisionRecord;
  updatedWorkingDraft: PrimerDocument;
}

/**
 * Strips transient raster PNG buffers (`pngDataUrl`) while preserving all vector SVGs,
 * user-authored prose, and structured Stage 1-5 scientific metadata.
 */
export function sanitizePrimerDocumentForArchive(primer: PrimerDocument): PrimerDocument {
  const cloned = structuredClone(primer);
  cloned.status = 'draft';
  if (cloned.extensions?.epicenterFigure) {
    cloned.extensions = {
      ...cloned.extensions,
      epicenterFigure: {
        ...cloned.extensions.epicenterFigure,
        pngDataUrl: undefined,
      },
    };
  }
  return cloned;
}

/**
 * Deeply freezes an in-memory revision snapshot so UI code cannot mutate a historical revision.
 */
export function deepFreezeRevision<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Object.isFrozen(obj)) return obj;
  Object.freeze(obj);
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    const val = (obj as Record<string, unknown>)[key];
    if (val !== null && typeof val === 'object') {
      deepFreezeRevision(val);
    }
  }
  return obj;
}

function stableSortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stableSortKeys(item));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    const keys = Object.keys(value as Record<string, unknown>).sort();
    for (const k of keys) {
      const v = (value as Record<string, unknown>)[k];
      if (v !== undefined) {
        out[k] = stableSortKeys(v);
      }
    }
    return out;
  }
  return value;
}

/**
 * Deterministic 64-bit dual-FNV-1a checksum encoded as 16 lowercase hex chars.
 * Operates synchronously in both browser and Node.js without platform WebCrypto variance.
 */
export function computeCanonicalChecksum(payload: unknown): string {
  const canonical = JSON.stringify(stableSortKeys(payload));
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < canonical.length; i++) {
    const c = canonical.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= c + (i & 0xff);
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

export function computePrimerRevisionChecksum(
  record: Omit<PrimerRevisionRecord, 'contentChecksum'>
): string {
  return computeCanonicalChecksum({
    schemaVersion: record.schemaVersion,
    primerDocumentId: record.primerDocumentId,
    eventId: record.eventId,
    revisionId: record.revisionId,
    revisionNumber: record.revisionNumber,
    parentRevisionId: record.parentRevisionId,
    createdAtUtc: record.createdAtUtc,
    createdAtPst: record.createdAtPst,
    description: record.description,
    snapshot: sanitizePrimerDocumentForArchive(record.snapshot),
    sourceEventFingerprint: record.sourceEventFingerprint,
    stage2FigureFingerprint: record.stage2FigureFingerprint,
    stage3SequenceFingerprint: record.stage3SequenceFingerprint,
    stage4NarrativeFingerprint: record.stage4NarrativeFingerprint,
    presentationConfig: record.presentationConfig,
    completenessIndicators: record.completenessIndicators,
  });
}

export function verifyPrimerRevisionChecksum(record: PrimerRevisionRecord): boolean {
  if (!record || typeof record.contentChecksum !== 'string') return false;
  const { contentChecksum, ...rest } = record;
  return computePrimerRevisionChecksum(rest) === contentChecksum;
}

export function computeFallbackSourceEventFingerprint(primer: PrimerDocument): string {
  const figFp = primer.extensions?.epicenterFigure?.provenance.sourceEventFingerprint;
  if (figFp && figFp.trim()) return figFp;
  const s4EventFp = primer.extensions?.scientificNarrativePackage?.eventFingerprint;
  if (s4EventFp && s4EventFp.trim()) return s4EventFp;
  const p = primer.extracted;
  return computeCanonicalChecksum({
    eventId: p.eventId,
    bulletinNo: p.bulletinNo,
    originDateUtc: p.originDateUtc,
    originTimeUtc: p.originTimeUtc,
    lat: p.lat,
    lon: p.lon,
    depthKm: p.depthKm,
    magnitudeScale: p.magnitudeScale,
    magnitudeValue: p.magnitudeValue,
    primaryLocationLabel: p.primaryLocationLabel,
    nearestFaultLabel: p.nearestFaultLabel,
    tsunamiStatus: p.tsunamiStatus,
    isSolutionStale: p.isSolutionStale,
  });
}

export function computeRevisionCompleteness(
  primer: PrimerDocument,
  options: {
    currentEventFingerprint?: string;
    currentStage3Fingerprint?: string;
    currentStage4Fingerprint?: string;
    isPlotResultStale?: boolean;
  } = {}
): PrimerRevisionCompleteness {
  const readiness = computePrimerReadinessSummary(primer, {
    currentEventFingerprint: options.currentEventFingerprint,
    currentStage3Fingerprint: options.currentStage3Fingerprint,
    currentStage4Fingerprint: options.currentStage4Fingerprint,
    isPlotResultStale: options.isPlotResultStale ?? primer.extracted.isSolutionStale,
  });

  const fig1 = primer.extensions?.epicenterFigure;
  const stage3 = primer.extensions?.sequenceHistoricalAnalysis;
  const stage4 = primer.extensions?.scientificNarrativePackage;

  const isPlotStaleAtSnap = Boolean(
    options.isPlotResultStale ??
      primer.extracted.isSolutionStale ??
      (fig1?.provenance.sourceSolutionStatus === 'stale')
  );

  const freshnessStatus: PrimerSourceFreshnessStatus =
    readiness.staleIndicators.length > 0 || isPlotStaleAtSnap
      ? 'stale-at-snapshot'
      : readiness.requiresInfoCount > 0 || !primer.extracted.isLocated
        ? 'incomplete-sources'
        : 'synchronized';

  return {
    populatedSections: readiness.populatedCount,
    totalSections: readiness.totalSections,
    readyForReviewCount: readiness.readyForReviewCount,
    requiresInfoCount: readiness.requiresInfoCount,
    requiresScientificReviewCount: readiness.requiresScientificReviewCount,
    unavailableOrMissingFields: [...primer.extracted.unavailableOrUnverifiedFields],
    readyFigureCount: readiness.readyFigureCount,
    totalFigureSlots: readiness.totalFigureSlots,
    hasStage2Figure: Boolean(fig1 && fig1.status === 'ready'),
    hasStage3Package: Boolean(stage3),
    hasStage4Package: Boolean(stage4),
    stage4StateSummary: stage4 ? { ...stage4.stateSummary } : null,
    snapshotSourceFreshness: {
      isPlotResultStaleAtSnapshot: isPlotStaleAtSnap,
      staleIndicatorsAtSnapshot: [...readiness.staleIndicators],
      status: freshnessStatus,
    },
  };
}

function generateUniqueRevisionId(
  primerDocumentId: string,
  revisionNumber: number,
  existingIds: Set<string>,
  nowMs: number
): string {
  const safeDoc = primerDocumentId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 28) || 'primer';
  for (let attempt = 0; attempt < 25; attempt++) {
    const rand = Math.random().toString(36).slice(2, 7);
    const candidate = `rev_${safeDoc}_r${revisionNumber}_${nowMs}_${rand}`;
    if (!existingIds.has(candidate)) {
      return candidate;
    }
  }
  return `rev_${safeDoc}_r${revisionNumber}_${nowMs}_${Date.now()}`;
}

export function createPrimerRevisionRecord(
  primer: PrimerDocument,
  options: CreatePrimerRevisionOptions = {}
): CreatePrimerRevisionResult {
  const existing = options.existingRevisions ?? [];
  const primerDocumentId = resolvePrimerDocumentId(primer);
  const existingIds = new Set(existing.map((r) => r.revisionId));

  if (options.explicitRevisionId) {
    const trimmedExplicit = options.explicitRevisionId.trim();
    if (!trimmedExplicit) {
      throw new Error('Explicit revisionId cannot be empty.');
    }
    if (existingIds.has(trimmedExplicit)) {
      throw new Error(`Duplicate revision identifier rejected: ${trimmedExplicit}`);
    }
  }

  const sameDocRevisions = existing.filter((r) => r.primerDocumentId === primerDocumentId);
  const maxRevNumber = sameDocRevisions.reduce(
    (max, r) => Math.max(max, Number.isFinite(r.revisionNumber) ? r.revisionNumber : 0),
    0
  );
  const nextRevisionNumber = Math.max(1, maxRevNumber + 1);

  const nowIso = options.createdAtUtc ?? new Date().toISOString();
  const nowMs = Date.parse(nowIso);
  const revisionId = options.explicitRevisionId
    ? options.explicitRevisionId.trim()
    : generateUniqueRevisionId(
        primerDocumentId,
        nextRevisionNumber,
        existingIds,
        Number.isFinite(nowMs) ? nowMs : Date.now()
      );

  const candidateParentId = primer.extensions?.reviewVersioning?.activeRevisionId ?? null;
  const latestSameDocRev = [...sameDocRevisions].sort(
    (a, b) => b.revisionNumber - a.revisionNumber
  )[0];
  const parentRevisionId =
    candidateParentId && existingIds.has(candidateParentId)
      ? candidateParentId
      : latestSameDocRev?.revisionId ?? null;

  const presentationConfig = normalizePresentationConfig(
    primer.extensions?.presentationConfig ?? DEFAULT_PRIMER_PRESENTATION_CONFIG
  );

  const frozenComments = freezeSectionCommentsForSnapshot(
    primer.extensions?.sectionComments,
    revisionId,
    nextRevisionNumber
  );

  // Clean deep clone of current draft state for frozen historical archive
  const snapshot = sanitizePrimerDocumentForArchive(primer);
  snapshot.extensions = {
    ...(snapshot.extensions ?? {}),
    ...(frozenComments ? { sectionComments: frozenComments } : {}),
    presentationConfig,
    reviewVersioning: {
      ...(snapshot.extensions?.reviewVersioning ?? {}),
      revisionNumber: nextRevisionNumber,
      primerDocumentId,
      activeRevisionId: revisionId,
      parentRevisionId,
      lastSavedRevisionAtUtc: nowIso,
    },
  };

  const sourceEventFingerprint =
    options.currentEventFingerprint ?? computeFallbackSourceEventFingerprint(primer);
  const stage2FigureFingerprint =
    primer.extensions?.epicenterFigure?.provenance.sourceEventFingerprint ?? null;
  const stage3SequenceFingerprint =
    primer.extensions?.sequenceHistoricalAnalysis?.provenance.inputFingerprint ?? null;
  const stage4NarrativeFingerprint =
    primer.extensions?.scientificNarrativePackage?.inputFingerprint ?? null;

  const completenessIndicators = computeRevisionCompleteness(snapshot, {
    currentEventFingerprint: options.currentEventFingerprint ?? sourceEventFingerprint,
    currentStage3Fingerprint: options.currentStage3Fingerprint,
    currentStage4Fingerprint: options.currentStage4Fingerprint,
    isPlotResultStale: options.isPlotResultStale,
  });

  const description =
    options.description?.trim() ||
    `Saved revision #${nextRevisionNumber} for Event ${primer.eventId} (B${primer.bulletinNo})`;

  const baseRecord: Omit<PrimerRevisionRecord, 'contentChecksum'> = {
    schemaVersion: PRIMER_REVISION_SCHEMA_VERSION,
    primerDocumentId,
    eventId: primer.eventId,
    revisionId,
    revisionNumber: nextRevisionNumber,
    parentRevisionId,
    createdAtUtc: nowIso,
    createdAtPst: formatUtcAsPst(nowIso),
    description,
    snapshot,
    sourceEventFingerprint,
    stage2FigureFingerprint,
    stage3SequenceFingerprint,
    stage4NarrativeFingerprint,
    presentationConfig,
    completenessIndicators,
  };

  const contentChecksum = computePrimerRevisionChecksum(baseRecord);
  const frozenRevision = deepFreezeRevision({
    ...baseRecord,
    contentChecksum,
  });

  // Produce updated working draft preserving user-authored text & linking lineage
  const updatedWorkingDraft = sanitizePrimerDocumentForArchive(primer);
  updatedWorkingDraft.updatedAt = nowIso;
  updatedWorkingDraft.extensions = {
    ...(updatedWorkingDraft.extensions ?? {}),
    ...(frozenComments ? { sectionComments: structuredClone(frozenComments) } : {}),
    presentationConfig,
    reviewVersioning: {
      ...(updatedWorkingDraft.extensions?.reviewVersioning ?? {}),
      revisionNumber: nextRevisionNumber,
      primerDocumentId,
      activeRevisionId: revisionId,
      parentRevisionId,
      lastSavedRevisionAtUtc: nowIso,
    },
  };

  return {
    revision: frozenRevision,
    updatedWorkingDraft,
  };
}

export function toPrimerExportRevisionInfo(
  revision: PrimerRevisionRecord
): PrimerExportRevisionInfo {
  return {
    revisionId: revision.revisionId,
    revisionNumber: revision.revisionNumber,
    createdAtUtc: revision.createdAtUtc,
    createdAtPst: revision.createdAtPst,
    description: revision.description,
    parentRevisionId: revision.parentRevisionId,
    restoredFromRevisionNumber:
      revision.snapshot.extensions?.reviewVersioning?.restoredFromRevisionNumber ?? null,
  };
}

/**
 * Restores a frozen historical revision into a brand-new editable working draft
 * without altering the original historical revision.
 */
export function restoreRevisionAsNewWorkingDraft(
  revision: PrimerRevisionRecord,
  options: { nowUtc?: string } = {}
): PrimerDocument {
  const nowIso = options.nowUtc ?? new Date().toISOString();
  const safeEvent = revision.eventId.replace(/[^a-zA-Z0-9_-]/g, '');
  const rand = Math.random().toString(36).slice(2, 6);
  const newDraftId = `primer_${safeEvent}_from_rev${revision.revisionNumber}_${Date.now()}_${rand}`;

  const restored = sanitizePrimerDocumentForArchive(revision.snapshot);
  restored.id = newDraftId;
  restored.status = 'draft';
  restored.updatedAt = nowIso;
  restored.savedAt = null;
  restored.extensions = {
    ...(restored.extensions ?? {}),
    presentationConfig: normalizePresentationConfig(revision.presentationConfig),
    reviewVersioning: {
      ...(restored.extensions?.reviewVersioning ?? {}),
      revisionNumber: revision.revisionNumber,
      primerDocumentId: revision.primerDocumentId,
      activeRevisionId: revision.revisionId,
      parentRevisionId: revision.revisionId,
      restoredFromRevisionId: revision.revisionId,
      restoredFromRevisionNumber: revision.revisionNumber,
      restoredFromCreatedAtUtc: revision.createdAtUtc,
    },
  };

  return restored;
}

// =============================================================================
// E. REVISION COMPARISON ENGINE (Non-interpretive, structured factual diff)
// =============================================================================

export interface PrimerCompareTarget {
  label: string;
  kind: 'revision' | 'working-draft';
  revisionId?: string;
  revisionNumber?: number;
  createdAtUtc?: string;
  document: PrimerDocument;
  sourceEventFingerprint?: string;
}

export interface PrimerFieldChange {
  field: string;
  label: string;
  before: string;
  after: string;
}

export interface PrimerSectionDiffItem {
  sectionId: PrimerSectionId;
  title: string;
  changed: boolean;
  textChanged: boolean;
  statusChanged: boolean;
  isEditedBefore: boolean;
  isEditedAfter: boolean;
  reviewStatusBefore: PrimerSectionReviewStatus;
  reviewStatusAfter: PrimerSectionReviewStatus;
  contentStateBefore: PrimerContentState | null;
  contentStateAfter: PrimerContentState | null;
  addedLines: string[];
  removedLines: string[];
  beforeText: string;
  afterText: string;
  subsectionChanges: Array<{
    subsectionId: string;
    title: string;
    stateBefore: string;
    stateAfter: string;
    bodyChanged: boolean;
  }>;
}

export interface PrimerObservationDiffResult {
  intensityChanges: PrimerFieldChange[];
  seaLevelObservationsAdded: string[];
  seaLevelObservationsRemoved: string[];
  seaLevelObservationsModified: string[];
  hazardObservationsAdded: string[];
  hazardObservationsRemoved: string[];
  hazardObservationsModified: string[];
  tsunamiAndAdvisoryChanges: PrimerFieldChange[];
  hasAnyChange: boolean;
}

export interface PrimerAftershockDiffResult {
  wasPresentBefore: boolean;
  wasPresentAfter: boolean;
  metricChanges: PrimerFieldChange[];
  hasAnyChange: boolean;
}

export interface PrimerFigureDiffItem {
  figureKey: 'epicenterFigure' | 'aftershockMap' | 'activityChart' | 'magnitudeChart';
  label: string;
  changed: boolean;
  details: PrimerFieldChange[];
  svgChanged: boolean;
}

export interface PrimerCitationDiffResult {
  addedCitations: string[];
  removedCitations: string[];
  sourceMetadataChanges: PrimerFieldChange[];
  hasAnyChange: boolean;
}

export interface PrimerPresentationDiffResult {
  headingStyleChanged: boolean;
  headingStyleBefore: string;
  headingStyleAfter: string;
  orderChanged: boolean;
  orderBefore: string[];
  orderAfter: string[];
  hiddenSlotsAdded: string[];
  hiddenSlotsRemoved: string[];
  hasAnyChange: boolean;
}

export interface PrimerRevisionComparisonReport {
  leftLabel: string;
  rightLabel: string;
  comparedAtUtc: string;
  disclaimer: string;
  eventParameterChanges: PrimerFieldChange[];
  narrativeSectionDiffs: PrimerSectionDiffItem[];
  observationDiff: PrimerObservationDiffResult;
  aftershockDiff: PrimerAftershockDiffResult;
  figureDiffs: PrimerFigureDiffItem[];
  citationDiff: PrimerCitationDiffResult;
  presentationDiff: PrimerPresentationDiffResult;
  summary: {
    hasAnyDifference: boolean;
    changedCategoriesCount: number;
    eventParameterChangeCount: number;
    changedNarrativeSectionsCount: number;
    observationChangeCount: number;
    aftershockMetricChangeCount: number;
    changedFiguresCount: number;
    citationOrVersionChangeCount: number;
    presentationChanged: boolean;
  };
}

function fmtVal(v: unknown): string {
  if (v === null || v === undefined || v === '') return 'Unavailable / Empty';
  if (typeof v === 'boolean') return v ? 'YES' : 'NO';
  if (typeof v === 'number') return String(v);
  return String(v);
}

function pushIfDiff(
  list: PrimerFieldChange[],
  field: string,
  label: string,
  before: unknown,
  after: unknown
): void {
  const b = fmtVal(before);
  const a = fmtVal(after);
  if (b !== a) {
    list.push({ field, label, before: b, after: a });
  }
}

function diffTextLines(beforeText: string, afterText: string): {
  addedLines: string[];
  removedLines: string[];
} {
  const beforeLines = beforeText
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);
  const afterLines = afterText
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);

  const beforeCounts = new Map<string, number>();
  for (const line of beforeLines) {
    beforeCounts.set(line, (beforeCounts.get(line) ?? 0) + 1);
  }
  const afterCounts = new Map<string, number>();
  for (const line of afterLines) {
    afterCounts.set(line, (afterCounts.get(line) ?? 0) + 1);
  }

  const removedLines: string[] = [];
  const tempAfter = new Map(afterCounts);
  for (const line of beforeLines) {
    const rem = tempAfter.get(line) ?? 0;
    if (rem > 0) {
      tempAfter.set(line, rem - 1);
    } else {
      removedLines.push(line);
    }
  }

  const addedLines: string[] = [];
  const tempBefore = new Map(beforeCounts);
  for (const line of afterLines) {
    const rem = tempBefore.get(line) ?? 0;
    if (rem > 0) {
      tempBefore.set(line, rem - 1);
    } else {
      addedLines.push(line);
    }
  }

  return { addedLines, removedLines };
}

export function revisionToCompareTarget(
  revision: PrimerRevisionRecord
): PrimerCompareTarget {
  return {
    label: `Rev #${revision.revisionNumber} (${revision.createdAtPst})`,
    kind: 'revision',
    revisionId: revision.revisionId,
    revisionNumber: revision.revisionNumber,
    createdAtUtc: revision.createdAtUtc,
    document: revision.snapshot,
    sourceEventFingerprint: revision.sourceEventFingerprint,
  };
}

export function workingDraftToCompareTarget(
  primer: PrimerDocument,
  sourceEventFingerprint?: string
): PrimerCompareTarget {
  const baseRev = primer.extensions?.reviewVersioning?.restoredFromRevisionNumber;
  const suffix = baseRev ? ` [Restored from Rev #${baseRev}]` : '';
  return {
    label: `Current Working Draft (Event ${primer.eventId} · B${primer.bulletinNo})${suffix}`,
    kind: 'working-draft',
    document: primer,
    sourceEventFingerprint,
  };
}

export function comparePrimerRevisions(
  leftInput: PrimerCompareTarget | PrimerRevisionRecord,
  rightInput: PrimerCompareTarget | PrimerRevisionRecord
): PrimerRevisionComparisonReport {
  const left =
    'snapshot' in leftInput ? revisionToCompareTarget(leftInput) : leftInput;
  const right =
    'snapshot' in rightInput ? revisionToCompareTarget(rightInput) : rightInput;

  const d1 = left.document;
  const d2 = right.document;
  const p1 = d1.extracted;
  const p2 = d2.extracted;

  // 1. Event parameter changes
  const eventParameterChanges: PrimerFieldChange[] = [];
  pushIfDiff(eventParameterChanges, 'eventId', 'Event ID', p1.eventId, p2.eventId);
  pushIfDiff(eventParameterChanges, 'bulletinNo', 'Bulletin Number', p1.bulletinNo, p2.bulletinNo);
  pushIfDiff(
    eventParameterChanges,
    'originUtc',
    'Origin Time (UTC)',
    `${p1.originDateUtc} ${p1.originTimeUtc}`,
    `${p2.originDateUtc} ${p2.originTimeUtc}`
  );
  pushIfDiff(
    eventParameterChanges,
    'coordinates',
    'Epicenter Coordinates',
    p1.isLocated && p1.lat !== null && p1.lon !== null
      ? `${p1.lat.toFixed(3)}°N, ${p1.lon.toFixed(3)}°E`
      : 'Pending Location',
    p2.isLocated && p2.lat !== null && p2.lon !== null
      ? `${p2.lat.toFixed(3)}°N, ${p2.lon.toFixed(3)}°E`
      : 'Pending Location'
  );
  pushIfDiff(
    eventParameterChanges,
    'depthKm',
    'Focal Depth (km)',
    p1.depthKm !== null ? `${p1.depthKm.toFixed(1)} km${p1.depthFixed ? ' (fixed)' : ''}` : null,
    p2.depthKm !== null ? `${p2.depthKm.toFixed(1)} km${p2.depthFixed ? ' (fixed)' : ''}` : null
  );
  pushIfDiff(
    eventParameterChanges,
    'magnitude',
    'Magnitude & Scale',
    p1.magnitudeValue !== null && p1.magnitudeScale
      ? `${p1.magnitudeScale} ${p1.magnitudeValue.toFixed(1)}`
      : null,
    p2.magnitudeValue !== null && p2.magnitudeScale
      ? `${p2.magnitudeScale} ${p2.magnitudeValue.toFixed(1)}`
      : null
  );
  pushIfDiff(
    eventParameterChanges,
    'errKm',
    'Horizontal Error (km)',
    p1.errKm !== null ? `${p1.errKm.toFixed(1)} km` : null,
    p2.errKm !== null ? `${p2.errKm.toFixed(1)} km` : null
  );
  pushIfDiff(
    eventParameterChanges,
    'rmsSec',
    'RMS Residual (sec)',
    p1.rmsSec !== null ? `${p1.rmsSec.toFixed(2)} s` : null,
    p2.rmsSec !== null ? `${p2.rmsSec.toFixed(2)} s` : null
  );
  pushIfDiff(
    eventParameterChanges,
    'activeStationCount',
    'Stations Used (Active / Total)',
    `${p1.activeStationCount} / ${p1.stationCount}`,
    `${p2.activeStationCount} / ${p2.stationCount}`
  );
  pushIfDiff(
    eventParameterChanges,
    'primaryLocationLabel',
    'Primary Location Label',
    p1.primaryLocationLabel,
    p2.primaryLocationLabel
  );
  pushIfDiff(
    eventParameterChanges,
    'nearestFaultLabel',
    'Nearest Mapped Structure Label',
    p1.nearestFaultLabel,
    p2.nearestFaultLabel
  );
  pushIfDiff(
    eventParameterChanges,
    'tsunamiStatus',
    'EQP Tsunami Flag',
    p1.tsunamiStatus,
    p2.tsunamiStatus
  );
  pushIfDiff(
    eventParameterChanges,
    'expectingAftershocks',
    'Expecting Aftershocks Flag',
    p1.expectingAftershocks,
    p2.expectingAftershocks
  );
  pushIfDiff(
    eventParameterChanges,
    'expectingDamage',
    'Expecting Damage Flag',
    p1.expectingDamage,
    p2.expectingDamage
  );
  pushIfDiff(
    eventParameterChanges,
    'isSolutionStale',
    'PLOT Solution Stale Flag',
    p1.isSolutionStale,
    p2.isSolutionStale
  );
  pushIfDiff(eventParameterChanges, 'title', 'Primer Document Title', d1.title, d2.title);
  pushIfDiff(eventParameterChanges, 'subtitle', 'Primer Subtitle', d1.subtitle, d2.subtitle);

  // 2. Narrative section diffs
  const s1Map = new Map(d1.sections.map((s) => [s.id, s]));
  const s2Map = new Map(d2.sections.map((s) => [s.id, s]));
  const orderedIds: PrimerSectionId[] = [
    'overview',
    'location',
    'aftershocks',
    'intensity',
    'tectonic_setting',
    'hazards',
    'recommendations',
  ];

  const narrativeSectionDiffs: PrimerSectionDiffItem[] = orderedIds.map((id) => {
    const s1 = s1Map.get(id);
    const s2 = s2Map.get(id);
    const beforeText = s1?.content ?? '';
    const afterText = s2?.content ?? '';
    const textChanged = beforeText !== afterText;
    const reviewStatusBefore = s1?.reviewStatus ?? 'requires-info';
    const reviewStatusAfter = s2?.reviewStatus ?? 'requires-info';
    const contentStateBefore = s1?.contentState ?? null;
    const contentStateAfter = s2?.contentState ?? null;
    const statusChanged =
      reviewStatusBefore !== reviewStatusAfter || contentStateBefore !== contentStateAfter;
    const { addedLines, removedLines } = textChanged
      ? diffTextLines(beforeText, afterText)
      : { addedLines: [], removedLines: [] };

    const sub1 = new Map((s1?.subsections ?? []).map((u) => [u.id, u]));
    const sub2 = new Map((s2?.subsections ?? []).map((u) => [u.id, u]));
    const allSubIds = Array.from(new Set([...sub1.keys(), ...sub2.keys()]));
    const subsectionChanges: PrimerSectionDiffItem['subsectionChanges'] = [];
    for (const sid of allSubIds) {
      const u1 = sub1.get(sid);
      const u2 = sub2.get(sid);
      const st1 = u1?.contentState ?? 'none';
      const st2 = u2?.contentState ?? 'none';
      const bChanged = (u1?.body ?? '') !== (u2?.body ?? '');
      if (st1 !== st2 || bChanged) {
        subsectionChanges.push({
          subsectionId: sid,
          title: u2?.title ?? u1?.title ?? sid,
          stateBefore: st1,
          stateAfter: st2,
          bodyChanged: bChanged,
        });
      }
    }

    return {
      sectionId: id,
      title: s2?.title ?? s1?.title ?? id,
      changed: textChanged || statusChanged || subsectionChanges.length > 0,
      textChanged,
      statusChanged,
      isEditedBefore: Boolean(s1?.isEdited),
      isEditedAfter: Boolean(s2?.isEdited),
      reviewStatusBefore,
      reviewStatusAfter,
      contentStateBefore,
      contentStateAfter,
      addedLines,
      removedLines,
      beforeText,
      afterText,
      subsectionChanges,
    };
  });

  // 3. Scientific Observations Diff (Intensities, Sea-Level, Hazards, Tsunami/Tectonic/Monitoring)
  const intensityChanges: PrimerFieldChange[] = [];
  pushIfDiff(
    intensityChanges,
    'verifiedFeltCount',
    'Verified Felt PEIS Count',
    p1.verifiedFeltCount,
    p2.verifiedFeltCount
  );
  pushIfDiff(
    intensityChanges,
    'verifiedInstrumentalCount',
    'Verified Instrumental PEIS Count',
    p1.verifiedInstrumentalCount,
    p2.verifiedInstrumentalCount
  );
  pushIfDiff(
    intensityChanges,
    'unverifiedIntensityCount',
    'Unverified / Draft PEIS Count',
    p1.unverifiedIntensityCount,
    p2.unverifiedIntensityCount
  );
  pushIfDiff(
    intensityChanges,
    'maxVerifiedPeis',
    'Highest Verified PEIS',
    p1.maxVerifiedPeis,
    p2.maxVerifiedPeis
  );
  pushIfDiff(
    intensityChanges,
    'verifiedIntensityText',
    'Verified PEIS Localities Summary',
    p1.verifiedIntensityText,
    p2.verifiedIntensityText
  );

  const ext1 = d1.extensions?.scientificNarrativePackage?.externalData;
  const ext2 = d2.extensions?.scientificNarrativePackage?.externalData;

  const sl1 = new Map(
    (ext1?.tsunami.seaLevelObservations ?? []).map((o) => [o.id, o])
  );
  const sl2 = new Map(
    (ext2?.tsunami.seaLevelObservations ?? []).map((o) => [o.id, o])
  );
  const seaLevelObservationsAdded: string[] = [];
  const seaLevelObservationsRemoved: string[] = [];
  const seaLevelObservationsModified: string[] = [];

  for (const [id, o2] of sl2) {
    const label = `${o2.stationName || id} (${o2.maxWaveHeightM || '?'} m @ ${o2.observedAtUtc || 'N/A'})`;
    const o1 = sl1.get(id);
    if (!o1) seaLevelObservationsAdded.push(label);
    else if (JSON.stringify(o1) !== JSON.stringify(o2)) {
      seaLevelObservationsModified.push(label);
    }
  }
  for (const [id, o1] of sl1) {
    if (!sl2.has(id)) {
      seaLevelObservationsRemoved.push(
        `${o1.stationName || id} (${o1.maxWaveHeightM || '?'} m @ ${o1.observedAtUtc || 'N/A'})`
      );
    }
  }

  const hz1 = new Map((ext1?.hazardObservations ?? []).map((o) => [o.id, o]));
  const hz2 = new Map((ext2?.hazardObservations ?? []).map((o) => [o.id, o]));
  const hazardObservationsAdded: string[] = [];
  const hazardObservationsRemoved: string[] = [];
  const hazardObservationsModified: string[] = [];

  for (const [id, o2] of hz2) {
    const label = `[${o2.hazardType}] ${o2.location || id}: ${o2.description.slice(0, 80)}`;
    const o1 = hz1.get(id);
    if (!o1) hazardObservationsAdded.push(label);
    else if (JSON.stringify(o1) !== JSON.stringify(o2)) {
      hazardObservationsModified.push(label);
    }
  }
  for (const [id, o1] of hz1) {
    if (!hz2.has(id)) {
      hazardObservationsRemoved.push(
        `[${o1.hazardType}] ${o1.location || id}: ${o1.description.slice(0, 80)}`
      );
    }
  }

  const tsunamiAndAdvisoryChanges: PrimerFieldChange[] = [];
  pushIfDiff(
    tsunamiAndAdvisoryChanges,
    'tsunamiState',
    'Verified Tsunami Advisory State',
    ext1?.tsunami.state ?? 'not-configured',
    ext2?.tsunami.state ?? 'not-configured'
  );
  pushIfDiff(
    tsunamiAndAdvisoryChanges,
    'tsunamiAdvisoryId',
    'Official Tsunami Advisory ID',
    ext1?.tsunami.officialAdvisoryId,
    ext2?.tsunami.officialAdvisoryId
  );
  pushIfDiff(
    tsunamiAndAdvisoryChanges,
    'tectonicInterpretation',
    'Expert Tectonic Interpretation',
    ext1?.tectonic.expertInterpretation,
    ext2?.tectonic.expertInterpretation
  );
  pushIfDiff(
    tsunamiAndAdvisoryChanges,
    'tectonicReviewStatus',
    'Tectonic Review Status',
    ext1?.tectonic.reviewStatus,
    ext2?.tectonic.reviewStatus
  );
  pushIfDiff(
    tsunamiAndAdvisoryChanges,
    'volcanoStatement',
    'Volcano Monitoring Statement',
    ext1?.volcano.expertStatement,
    ext2?.volcano.expertStatement
  );
  pushIfDiff(
    tsunamiAndAdvisoryChanges,
    'eventAdvisories',
    'Event-Specific Public Advisories',
    ext1?.eventSpecificPreparednessAdvisories,
    ext2?.eventSpecificPreparednessAdvisories
  );
  pushIfDiff(
    tsunamiAndAdvisoryChanges,
    'monitoringQrt',
    'PHIVOLCS QRT & Monitoring Response',
    ext1
      ? `${ext1.monitoringResponse.monitoringActivities}|${ext1.monitoringResponse.qrtDeployments}|${ext1.monitoringResponse.fieldInvestigations}`
      : null,
    ext2
      ? `${ext2.monitoringResponse.monitoringActivities}|${ext2.monitoringResponse.qrtDeployments}|${ext2.monitoringResponse.fieldInvestigations}`
      : null
  );

  const observationDiff: PrimerObservationDiffResult = {
    intensityChanges,
    seaLevelObservationsAdded,
    seaLevelObservationsRemoved,
    seaLevelObservationsModified,
    hazardObservationsAdded,
    hazardObservationsRemoved,
    hazardObservationsModified,
    tsunamiAndAdvisoryChanges,
    hasAnyChange:
      intensityChanges.length > 0 ||
      seaLevelObservationsAdded.length > 0 ||
      seaLevelObservationsRemoved.length > 0 ||
      seaLevelObservationsModified.length > 0 ||
      hazardObservationsAdded.length > 0 ||
      hazardObservationsRemoved.length > 0 ||
      hazardObservationsModified.length > 0 ||
      tsunamiAndAdvisoryChanges.length > 0,
  };

  // 4. Aftershock Statistics & Historical Seismicity Diff
  const s3_1 = d1.extensions?.sequenceHistoricalAnalysis;
  const s3_2 = d2.extensions?.sequenceHistoricalAnalysis;
  const metricChanges: PrimerFieldChange[] = [];
  if (s3_1 || s3_2) {
    pushIfDiff(
      metricChanges,
      'membershipBasis',
      'Sequence Membership Basis',
      s3_1?.statistics.membershipBasis,
      s3_2?.statistics.membershipBasis
    );
    pushIfDiff(
      metricChanges,
      'eligiblePostEventCount',
      'Eligible Post-Event Count',
      s3_1?.statistics.eligiblePostEventCount,
      s3_2?.statistics.eligiblePostEventCount
    );
    pushIfDiff(
      metricChanges,
      'scientificallyAcceptedAftershockCount',
      'Scientifically Accepted Aftershocks',
      s3_1?.statistics.scientificallyAcceptedAftershockCount,
      s3_2?.statistics.scientificallyAcceptedAftershockCount
    );
    pushIfDiff(
      metricChanges,
      'intervals',
      'Interval Counts (+24h / +72h / +7d / +30d)',
      s3_1
        ? `${s3_1.statistics.countsByInterval.within24h} / ${s3_1.statistics.countsByInterval.within72h} / ${s3_1.statistics.countsByInterval.within7d} / ${s3_1.statistics.countsByInterval.within30d}`
        : null,
      s3_2
        ? `${s3_2.statistics.countsByInterval.within24h} / ${s3_2.statistics.countsByInterval.within72h} / ${s3_2.statistics.countsByInterval.within7d} / ${s3_2.statistics.countsByInterval.within30d}`
        : null
    );
    pushIfDiff(
      metricChanges,
      'maxAftershock',
      'Largest Post-Event Earthquake',
      s3_1?.statistics.maxAftershock
        ? `${s3_1.statistics.maxAftershock.eventId} (${s3_1.statistics.maxAftershock.magnitudeType} ${s3_1.statistics.maxAftershock.magnitude.toFixed(1)})`
        : null,
      s3_2?.statistics.maxAftershock
        ? `${s3_2.statistics.maxAftershock.eventId} (${s3_2.statistics.maxAftershock.magnitudeType} ${s3_2.statistics.maxAftershock.magnitude.toFixed(1)})`
        : null
    );
    pushIfDiff(
      metricChanges,
      'historicalCount',
      'Historical Regional Matching Count',
      s3_1?.historical.totalMatchingCount,
      s3_2?.historical.totalMatchingCount
    );
    pushIfDiff(
      metricChanges,
      'dataCutoffUtc',
      'Sequence Catalog Cutoff (UTC)',
      s3_1?.statistics.dataCutoffUtc,
      s3_2?.statistics.dataCutoffUtc
    );
  }
  const aftershockDiff: PrimerAftershockDiffResult = {
    wasPresentBefore: Boolean(s3_1),
    wasPresentAfter: Boolean(s3_2),
    metricChanges,
    hasAnyChange: Boolean(s3_1) !== Boolean(s3_2) || metricChanges.length > 0,
  };

  // 5. Maps & Figures Diff
  const f1 = d1.extensions?.epicenterFigure;
  const f2 = d2.extensions?.epicenterFigure;
  const epiDetails: PrimerFieldChange[] = [];
  pushIfDiff(epiDetails, 'status', 'Figure Status', f1?.status, f2?.status);
  pushIfDiff(epiDetails, 'extent', 'Map Extent', f1?.extent, f2?.extent);
  pushIfDiff(epiDetails, 'theme', 'Map Theme', f1?.theme, f2?.theme);
  pushIfDiff(
    epiDetails,
    'layers',
    'Enabled Layers',
    f1 ? JSON.stringify(f1.layers) : null,
    f2 ? JSON.stringify(f2.layers) : null
  );
  pushIfDiff(epiDetails, 'caption', 'Figure Caption', f1?.caption, f2?.caption);
  pushIfDiff(
    epiDetails,
    'sourceEventFingerprint',
    'Map Event Fingerprint',
    f1?.provenance.sourceEventFingerprint,
    f2?.provenance.sourceEventFingerprint
  );
  const epiSvgChanged = (f1?.svgMarkup ?? '') !== (f2?.svgMarkup ?? '');

  const figureDiffs: PrimerFigureDiffItem[] = [
    {
      figureKey: 'epicenterFigure',
      label: 'Epicenter & Geographic Context Map',
      changed: epiDetails.length > 0 || epiSvgChanged,
      details: epiDetails,
      svgChanged: epiSvgChanged,
    },
  ];

  const s3FigSpecs: Array<{
    key: 'aftershockMap' | 'activityChart' | 'magnitudeChart';
    label: string;
  }> = [
    { key: 'aftershockMap', label: 'Sequence & Historical Distribution Map' },
    { key: 'activityChart', label: 'Earthquake Activity vs. Time Chart' },
    { key: 'magnitudeChart', label: 'Catalog Magnitude Distribution Chart' },
  ];

  for (const spec of s3FigSpecs) {
    const sf1 = s3_1?.figures[spec.key];
    const sf2 = s3_2?.figures[spec.key];
    const details: PrimerFieldChange[] = [];
    pushIfDiff(details, 'status', 'Figure Status', sf1?.status, sf2?.status);
    pushIfDiff(details, 'caption', 'Figure Caption', sf1?.caption, sf2?.caption);
    const svgChanged = (sf1?.svgMarkup ?? '') !== (sf2?.svgMarkup ?? '');
    figureDiffs.push({
      figureKey: spec.key,
      label: spec.label,
      changed: details.length > 0 || svgChanged,
      details,
      svgChanged,
    });
  }

  // 6. Citations & Source Versions Diff
  const refs1 = buildPrimerReferenceList(d1).map(
    (r) =>
      `${r.organizationOrAuthor} — ${r.title}${r.dateOrVersion ? ` (${r.dateOrVersion})` : ''}`
  );
  const refs2 = buildPrimerReferenceList(d2).map(
    (r) =>
      `${r.organizationOrAuthor} — ${r.title}${r.dateOrVersion ? ` (${r.dateOrVersion})` : ''}`
  );
  const refs1Set = new Set(refs1);
  const refs2Set = new Set(refs2);
  const addedCitations = refs2.filter((r) => !refs1Set.has(r));
  const removedCitations = refs1.filter((r) => !refs2Set.has(r));

  const sourceMetadataChanges: PrimerFieldChange[] = [];
  pushIfDiff(
    sourceMetadataChanges,
    'sourceEventFingerprint',
    'Source Event Fingerprint',
    left.sourceEventFingerprint ?? computeFallbackSourceEventFingerprint(d1),
    right.sourceEventFingerprint ?? computeFallbackSourceEventFingerprint(d2)
  );
  pushIfDiff(
    sourceMetadataChanges,
    'catalogVersion',
    'Stage 3 Catalog Version & Source',
    s3_1 ? `${s3_1.provenance.sourceLabel} (v${s3_1.provenance.catalogVersion}, n=${s3_1.provenance.catalogCount})` : null,
    s3_2 ? `${s3_2.provenance.sourceLabel} (v${s3_2.provenance.catalogVersion}, n=${s3_2.provenance.catalogCount})` : null
  );
  pushIfDiff(
    sourceMetadataChanges,
    'stage3Fingerprint',
    'Stage 3 Package Fingerprint',
    s3_1?.provenance.inputFingerprint,
    s3_2?.provenance.inputFingerprint
  );
  pushIfDiff(
    sourceMetadataChanges,
    'stage4TemplateVersion',
    'Stage 4 Narrative Template Version',
    d1.extensions?.scientificNarrativePackage?.templateVersion,
    d2.extensions?.scientificNarrativePackage?.templateVersion
  );
  pushIfDiff(
    sourceMetadataChanges,
    'stage4Fingerprint',
    'Stage 4 Package Fingerprint',
    d1.extensions?.scientificNarrativePackage?.inputFingerprint,
    d2.extensions?.scientificNarrativePackage?.inputFingerprint
  );

  const citationDiff: PrimerCitationDiffResult = {
    addedCitations,
    removedCitations,
    sourceMetadataChanges,
    hasAnyChange:
      addedCitations.length > 0 ||
      removedCitations.length > 0 ||
      sourceMetadataChanges.length > 0,
  };

  // 7. Presentation Config Diff
  const cfg1 = normalizePresentationConfig(
    d1.extensions?.presentationConfig ?? DEFAULT_PRIMER_PRESENTATION_CONFIG
  );
  const cfg2 = normalizePresentationConfig(
    d2.extensions?.presentationConfig ?? DEFAULT_PRIMER_PRESENTATION_CONFIG
  );
  const orderChanged =
    JSON.stringify(cfg1.sectionOrder) !== JSON.stringify(cfg2.sectionOrder);
  const hidden1 = new Set(cfg1.hiddenSlotIds);
  const hidden2 = new Set(cfg2.hiddenSlotIds);
  const hiddenSlotsAdded = cfg2.hiddenSlotIds.filter((s) => !hidden1.has(s));
  const hiddenSlotsRemoved = cfg1.hiddenSlotIds.filter((s) => !hidden2.has(s));
  const headingStyleChanged = cfg1.headingStyle !== cfg2.headingStyle;

  const presentationDiff: PrimerPresentationDiffResult = {
    headingStyleChanged,
    headingStyleBefore: cfg1.headingStyle,
    headingStyleAfter: cfg2.headingStyle,
    orderChanged,
    orderBefore: [...cfg1.sectionOrder],
    orderAfter: [...cfg2.sectionOrder],
    hiddenSlotsAdded,
    hiddenSlotsRemoved,
    hasAnyChange:
      headingStyleChanged ||
      orderChanged ||
      hiddenSlotsAdded.length > 0 ||
      hiddenSlotsRemoved.length > 0,
  };

  const changedNarrativeSectionsCount = narrativeSectionDiffs.filter(
    (s) => s.changed
  ).length;
  const observationChangeCount =
    intensityChanges.length +
    seaLevelObservationsAdded.length +
    seaLevelObservationsRemoved.length +
    seaLevelObservationsModified.length +
    hazardObservationsAdded.length +
    hazardObservationsRemoved.length +
    hazardObservationsModified.length +
    tsunamiAndAdvisoryChanges.length;
  const changedFiguresCount = figureDiffs.filter((f) => f.changed).length;
  const citationOrVersionChangeCount =
    addedCitations.length + removedCitations.length + sourceMetadataChanges.length;

  const changedCategoriesCount = [
    eventParameterChanges.length > 0,
    changedNarrativeSectionsCount > 0,
    observationDiff.hasAnyChange,
    aftershockDiff.hasAnyChange,
    changedFiguresCount > 0,
    citationDiff.hasAnyChange,
    presentationDiff.hasAnyChange,
  ].filter(Boolean).length;

  return {
    leftLabel: left.label,
    rightLabel: right.label,
    comparedAtUtc: new Date().toISOString(),
    disclaimer:
      'Structured factual comparison only — highlights parameter, text, observation, catalog, figure, citation, and layout differences without generating scientific interpretations.',
    eventParameterChanges,
    narrativeSectionDiffs,
    observationDiff,
    aftershockDiff,
    figureDiffs,
    citationDiff,
    presentationDiff,
    summary: {
      hasAnyDifference: changedCategoriesCount > 0,
      changedCategoriesCount,
      eventParameterChangeCount: eventParameterChanges.length,
      changedNarrativeSectionsCount,
      observationChangeCount,
      aftershockMetricChangeCount: metricChanges.length,
      changedFiguresCount,
      citationOrVersionChangeCount,
      presentationChanged: presentationDiff.hasAnyChange,
    },
  };
}

// =============================================================================
// F. SOURCE CHANGE DETECTION (Read-Only against frozen revisions)
// =============================================================================

export type PrimerSourceChangeCategory =
  | 'event-parameters-changed'
  | 'plot-solution-stale'
  | 'intensity-data-changed'
  | 'aftershock-catalog-changed'
  | 'hazard-or-advisory-changed'
  | 'scientific-interpretation-changed'
  | 'figure-snapshot-stale';

export interface PrimerSourceChangeItem {
  category: PrimerSourceChangeCategory;
  label: string;
  detail: string;
  affectedSections: PrimerSectionId[];
}

export interface PrimerSourceChangeReport {
  targetKind: 'working-draft' | 'historical-revision';
  hasSourceChanges: boolean;
  changes: PrimerSourceChangeItem[];
  affectedSections: PrimerSectionId[];
  summary: string;
  preservedHistoricalProvenanceNote: string | null;
}

/**
 * Evaluates live source changes relative to either a current working draft OR
 * a frozen historical revision without ever modifying the historical snapshot or provenance.
 */
export function detectPrimerSourceChanges(
  target: PrimerDocument | PrimerRevisionRecord,
  liveContext: {
    event: EQPEvent;
    primaryLocationLabel?: string;
    faultGeneratorLabel?: string | null;
    isPlotResultStale?: boolean;
    currentEventFingerprint?: string;
    currentStage3Fingerprint?: string;
    currentStage4Fingerprint?: string;
    liveExternalData?: PrimerStage4ExternalData;
  }
): PrimerSourceChangeReport {
  const isRevision = 'snapshot' in target;
  const doc = isRevision ? target.snapshot : target;
  const liveEventFp =
    liveContext.currentEventFingerprint ??
    computePrimerEventFingerprint(liveContext.event, {
      primaryLocationLabel: liveContext.primaryLocationLabel,
      isPlotResultStale: liveContext.isPlotResultStale,
    });
  const liveExtracted = extractVerifiedPrimerParameters(liveContext.event, {
    primaryLocationLabel: liveContext.primaryLocationLabel,
    faultGeneratorLabel: liveContext.faultGeneratorLabel,
    isSolutionStale: liveContext.isPlotResultStale,
  });

  const docExtracted = doc.extracted;
  const changes: PrimerSourceChangeItem[] = [];

  // 1. PLOT solution staleness
  if (liveContext.isPlotResultStale) {
    changes.push({
      category: 'plot-solution-stale',
      label: 'PLOT Hypocenter Solution Stale',
      detail:
        'Active station phase picks were modified after the last PLOT relocation. Re-locate and review dependent sections.',
      affectedSections: ['overview', 'location', 'tectonic_setting'],
    });
  }

  // 2. Event location / magnitude / origin / depth changes
  const eventChangedFields: string[] = [];
  if (docExtracted.eventId !== liveExtracted.eventId) {
    eventChangedFields.push(`Event ID (${docExtracted.eventId} -> ${liveExtracted.eventId})`);
  }
  if (
    docExtracted.lat !== liveExtracted.lat ||
    docExtracted.lon !== liveExtracted.lon
  ) {
    eventChangedFields.push('epicenter coordinates');
  }
  if (docExtracted.depthKm !== liveExtracted.depthKm) {
    eventChangedFields.push('focal depth');
  }
  if (
    docExtracted.magnitudeValue !== liveExtracted.magnitudeValue ||
    docExtracted.magnitudeScale !== liveExtracted.magnitudeScale
  ) {
    eventChangedFields.push('magnitude / scale');
  }
  if (
    docExtracted.originDateUtc !== liveExtracted.originDateUtc ||
    docExtracted.originTimeUtc !== liveExtracted.originTimeUtc
  ) {
    eventChangedFields.push('origin time');
  }
  if (docExtracted.bulletinNo !== liveExtracted.bulletinNo) {
    eventChangedFields.push(`bulletin number (B${docExtracted.bulletinNo} -> B${liveExtracted.bulletinNo})`);
  }

  const storedEventFp = isRevision
    ? target.sourceEventFingerprint
    : computeFallbackSourceEventFingerprint(doc);

  if (
    eventChangedFields.length > 0 ||
    (docExtracted.eventId === liveExtracted.eventId && storedEventFp !== liveEventFp)
  ) {
    changes.push({
      category: 'event-parameters-changed',
      label: 'Active Event Parameters Changed',
      detail:
        eventChangedFields.length > 0
          ? `Changed fields vs. snapshot: ${eventChangedFields.join(', ')}.`
          : `Source event fingerprint (${storedEventFp.slice(0, 8)}) differs from current event (${liveEventFp.slice(0, 8)}).`,
      affectedSections: ['overview', 'location', 'aftershocks', 'tectonic_setting'],
    });
  }

  // 3. Stage 2 figure fingerprint drift
  const fig1 = doc.extensions?.epicenterFigure;
  if (
    fig1 &&
    docExtracted.eventId === liveExtracted.eventId &&
    fig1.provenance.sourceEventFingerprint !== liveEventFp
  ) {
    changes.push({
      category: 'figure-snapshot-stale',
      label: 'Epicenter Map Figure Snapshot Outdated',
      detail: `Figure 1 fingerprint (${fig1.provenance.sourceEventFingerprint.slice(
        0,
        8
      )}) differs from active event (${liveEventFp.slice(0, 8)}).`,
      affectedSections: ['location', 'overview'],
    });
  }

  // 4. Intensity data changes
  if (
    docExtracted.verifiedFeltCount !== liveExtracted.verifiedFeltCount ||
    docExtracted.verifiedInstrumentalCount !== liveExtracted.verifiedInstrumentalCount ||
    docExtracted.unverifiedIntensityCount !== liveExtracted.unverifiedIntensityCount ||
    docExtracted.maxVerifiedPeis !== liveExtracted.maxVerifiedPeis ||
    docExtracted.verifiedIntensityText !== liveExtracted.verifiedIntensityText
  ) {
    changes.push({
      category: 'intensity-data-changed',
      label: 'PEIS Intensity Records Changed',
      detail: `Verified felt/instr (${docExtracted.verifiedFeltCount}/${docExtracted.verifiedInstrumentalCount}) vs. active (${liveExtracted.verifiedFeltCount}/${liveExtracted.verifiedInstrumentalCount}); max PEIS ${docExtracted.maxVerifiedPeis ?? 'N/A'} -> ${liveExtracted.maxVerifiedPeis ?? 'N/A'}.`,
      affectedSections: ['intensity', 'overview'],
    });
  }

  // 5. Aftershock catalog / Stage 3 analysis changes
  const stage3 = doc.extensions?.sequenceHistoricalAnalysis;
  const stage3Fp = isRevision
    ? target.stage3SequenceFingerprint
    : stage3?.provenance.inputFingerprint ?? null;
  if (
    stage3Fp &&
    liveContext.currentStage3Fingerprint &&
    stage3Fp !== liveContext.currentStage3Fingerprint
  ) {
    changes.push({
      category: 'aftershock-catalog-changed',
      label: 'Aftershock Catalog / Sequence Inputs Changed',
      detail: `Stage 3 sequence fingerprint (${stage3Fp.slice(0, 8)}) differs from live catalog & filter state (${liveContext.currentStage3Fingerprint.slice(0, 8)}).`,
      affectedSections: ['aftershocks', 'tectonic_setting'],
    });
  }

  // 6. Hazard observations, tsunami advisories, & scientific interpretations (Stage 4)
  const stage4 = doc.extensions?.scientificNarrativePackage;
  const stage4Fp = isRevision
    ? target.stage4NarrativeFingerprint
    : stage4?.inputFingerprint ?? null;
  const snapExt = stage4?.externalData;
  const liveExt = liveContext.liveExternalData;
  const effectiveSnapExt =
    snapExt ??
    (liveExt ? createDefaultStage4ExternalData(liveContext.event) : undefined);

  let detectedSpecificStage4Changes = false;
  if (effectiveSnapExt && liveExt) {
    const hazChanged =
      effectiveSnapExt.tsunami.state !== liveExt.tsunami.state ||
      effectiveSnapExt.tsunami.officialAdvisoryId !== liveExt.tsunami.officialAdvisoryId ||
      JSON.stringify(effectiveSnapExt.tsunami.seaLevelObservations) !==
        JSON.stringify(liveExt.tsunami.seaLevelObservations) ||
      JSON.stringify(effectiveSnapExt.hazardObservations) !==
        JSON.stringify(liveExt.hazardObservations) ||
      effectiveSnapExt.eventSpecificPreparednessAdvisories !==
        liveExt.eventSpecificPreparednessAdvisories ||
      effectiveSnapExt.eventSpecificAdvisoriesVerified !==
        liveExt.eventSpecificAdvisoriesVerified;

    if (hazChanged) {
      detectedSpecificStage4Changes = true;
      changes.push({
        category: 'hazard-or-advisory-changed',
        label: 'Hazard Observations or Official Advisories Changed',
        detail:
          'Tsunami status, sea-level readings, field hazard observations, or event-specific public advisories differ from compiled snapshot.',
        affectedSections: ['hazards', 'recommendations'],
      });
    }

    const interpChanged =
      effectiveSnapExt.tectonic.expertInterpretation !==
        liveExt.tectonic.expertInterpretation ||
      effectiveSnapExt.tectonic.reviewStatus !== liveExt.tectonic.reviewStatus ||
      effectiveSnapExt.volcano.expertStatement !== liveExt.volcano.expertStatement ||
      effectiveSnapExt.volcano.reviewStatus !== liveExt.volcano.reviewStatus ||
      JSON.stringify(effectiveSnapExt.monitoringResponse) !==
        JSON.stringify(liveExt.monitoringResponse) ||
      JSON.stringify(effectiveSnapExt.r3TransferredSources ?? []) !==
        JSON.stringify(liveExt.r3TransferredSources ?? []);

    if (interpChanged) {
      detectedSpecificStage4Changes = true;
      changes.push({
        category: 'scientific-interpretation-changed',
        label: 'Scientific Interpretations or Transferred Evidence Revised',
        detail:
          'Specialist tectonic/generator, volcano monitoring, PHIVOLCS response, or transferred R3 evidence records changed relative to snapshot.',
        affectedSections: ['tectonic_setting', 'hazards', 'recommendations'],
      });
    }
  }

  if (
    !detectedSpecificStage4Changes &&
    stage4Fp &&
    liveContext.currentStage4Fingerprint &&
    stage4Fp !== liveContext.currentStage4Fingerprint
  ) {
    changes.push({
      category: 'scientific-interpretation-changed',
      label: 'Stage 4 Scientific Narrative Inputs Changed',
      detail: `Stage 4 input fingerprint (${stage4Fp.slice(0, 8)}) differs from current inputs (${liveContext.currentStage4Fingerprint.slice(0, 8)}). Existing specialist reviews may be outdated.`,
      affectedSections: [
        'overview',
        'location',
        'intensity',
        'tectonic_setting',
        'hazards',
        'recommendations',
      ],
    });
  }

  const affectedSet = new Set<PrimerSectionId>();
  for (const item of changes) {
    for (const secId of item.affectedSections) {
      affectedSet.add(secId);
    }
  }
  const affectedSections = Array.from(affectedSet);

  const hasSourceChanges = changes.length > 0;
  const summary = hasSourceChanges
    ? `${changes.length} source change(s) detected affecting section(s): ${affectedSections.join(', ')}`
    : 'No source drift detected relative to current active event, catalog, and specialist inputs.';

  return {
    targetKind: isRevision ? 'historical-revision' : 'working-draft',
    hasSourceChanges,
    changes,
    affectedSections,
    summary,
    preservedHistoricalProvenanceNote: isRevision
      ? `Frozen Revision #${target.revisionNumber} preserves its original provenance (${target.sourceEventFingerprint.slice(
          0,
          8
        )}) and never silently inherits live event or catalog changes.`
      : null,
  };
}

export type PrimerMapStyleInspect = {
  extent: PrimerMapExtent;
  theme: PrimerMapTheme;
  layers: PrimerMapLayerConfig;
};
