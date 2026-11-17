import type { EQPEvent } from '../data/eqpData.ts';
import {
  type PrimerDocument,
  type PrimerSectionId,
} from './earthquakePrimer.ts';
import {
  computePrimerReadinessSummary,
  type PrimerReadinessSummary,
} from './primerPresentation.ts';
import {
  computeCanonicalChecksum,
  detectPrimerSourceChanges,
  type PrimerRevisionRecord,
  type PrimerSourceChangeReport,
  verifyPrimerRevisionChecksum,
} from './primerRevisions.ts';
import type { PrimerStage4ExternalData } from './primerScientificNarratives.ts';
import { formatUtcAsPst } from './primerSequenceIntegration.ts';

export const PRIMER_REVIEW_SCHEMA_VERSION = '1.0' as const;

export const LOCAL_REVIEW_AUTHORITY_DISCLAIMER =
  'LOCAL SCIENTIFIC REVIEW ONLY — No authenticated institutional identity, formal authorization service, or public publication capability is configured in this browser environment.';

export const LOCAL_REVIEW_INTEGRITY_DISCLAIMER =
  'Stored in local browser IndexedDB with checksums for corruption detection. NOT a tamper-proof audit log, digital signature, or institutional approval.';

/**
 * Strictly bounded local workflow states (Requirement B).
 * Institutional statuses such as APPROVED, FORMALLY SIGNED, PUBLISHED, or FINAL
 * are intentionally impossible to represent or achieve.
 */
export type PrimerLocalReviewStatus =
  | 'not-started'
  | 'in-review'
  | 'corrections-requested'
  | 'review-notes-complete-unverified-identity'
  | 'prepared-for-external-authorization';

export const PRIMER_LOCAL_REVIEW_STATUS_META: Record<
  PrimerLocalReviewStatus,
  {
    value: PrimerLocalReviewStatus;
    label: string;
    shortLabel: string;
    description: string;
  }
> = {
  'not-started': {
    value: 'not-started',
    label: 'Not Started',
    shortLabel: 'Not Started',
    description: 'Local review record initialized for this frozen revision; no checklist checks recorded yet.',
  },
  'in-review': {
    value: 'in-review',
    label: 'In Review',
    shortLabel: 'In Review',
    description: 'Local technical checks, figure inspections, and provenance review are underway.',
  },
  'corrections-requested': {
    value: 'corrections-requested',
    label: 'Corrections Requested',
    shortLabel: 'Corrections Requested',
    description: 'One or more checklist items or section comments require revision in a new working draft.',
  },
  'review-notes-complete-unverified-identity': {
    value: 'review-notes-complete-unverified-identity',
    label: 'Review Notes Complete — Identity Unverified',
    shortLabel: 'Review Notes Complete (Unverified ID)',
    description:
      'All local checklist items resolved and open correction requests addressed. Reviewer identity is unverified; NOT official approval.',
  },
  'prepared-for-external-authorization': {
    value: 'prepared-for-external-authorization',
    label: 'Prepared for External Authorization',
    shortLabel: 'Prepared for External Auth',
    description:
      'Local review notes complete and exportable review package prepared for external PHIVOLCS institutional review. Not approved or published.',
  },
};

export const FORBIDDEN_RELEASE_STATUS_TOKENS = [
  'APPROVED',
  'FORMALLY SIGNED',
  'FORMALLY_SIGNED',
  'PUBLISHED',
  'FINAL',
  'OFFICIAL RELEASE',
  'SIGNED_OFF',
] as const;

export function isForbiddenReleaseStatus(rawStatus: string): boolean {
  const upper = rawStatus.trim().toUpperCase().replace(/\s+/g, ' ');
  return FORBIDDEN_RELEASE_STATUS_TOKENS.some(
    (tok) => upper === tok || upper.includes(tok)
  );
}

export function isAllowedLocalReviewStatus(
  status: string
): status is PrimerLocalReviewStatus {
  return Object.prototype.hasOwnProperty.call(PRIMER_LOCAL_REVIEW_STATUS_META, status);
}

export function assertNoReviewStatusViolation(status: string): asserts status is PrimerLocalReviewStatus {
  if (isForbiddenReleaseStatus(status) || !isAllowedLocalReviewStatus(status)) {
    throw new Error(
      `Disallowed review status "${status}". Only local scientific review statuses are permitted; institutional approval/publication statuses cannot be assigned locally.`
    );
  }
}

export type PrimerChecklistItemState =
  | 'not-checked'
  | 'satisfactory-for-local-review'
  | 'correction-required'
  | 'not-applicable';

export const PRIMER_CHECKLIST_STATE_LABELS: Record<
  PrimerChecklistItemState,
  string
> = {
  'not-checked': 'Not Checked',
  'satisfactory-for-local-review': 'Satisfactory for Local Review',
  'correction-required': 'Correction Required',
  'not-applicable': 'Not Applicable',
};

export interface PrimerChecklistDefinition {
  id: string;
  order: number;
  category: string;
  label: string;
  guidance: string;
  isCustom?: boolean;
}

export const DEFAULT_SCIENTIFIC_CHECKLIST_DEFINITIONS: PrimerChecklistDefinition[] = [
  {
    id: 'chk_01_event_identity',
    order: 1,
    category: 'Parameters',
    label: 'Earthquake event identity and origin parameters',
    guidance: 'Verify Event ID, Bulletin No., UTC and PST origin times, coordinates, depth, and depth-fix flag.',
  },
  {
    id: 'chk_02_magnitude_scale',
    order: 2,
    category: 'Parameters',
    label: 'Magnitude value and exact magnitude scale',
    guidance: 'Confirm exact scale (Ms/mb/Md/Mw) matches active solution and never silently substitutes scales.',
  },
  {
    id: 'chk_03_plot_freshness',
    order: 3,
    category: 'Solution',
    label: 'PLOT solution validity and source freshness',
    guidance: 'Verify PLOT solution is not stale relative to station phase picks and error/RMS metrics match.',
  },
  {
    id: 'chk_04_epicenter_map',
    order: 4,
    category: 'Figures',
    label: 'Epicenter/geographic map accuracy and provenance',
    guidance: 'Inspect Epicenter Map extent, scale bar, nearest locality bearing, and non-stale fingerprint.',
  },
  {
    id: 'chk_05_gis_layers',
    order: 5,
    category: 'GIS',
    label: 'Approved versus schematic or candidate GIS layers',
    guidance: 'Ensure unverified/EPSG:4253 layers remain withheld and candidate fault layers carry clear caveats.',
  },
  {
    id: 'chk_06_aftershock_catalog',
    order: 6,
    category: 'Sequence',
    label: 'Aftershock counts, mainshock choice, catalog source and cutoff',
    guidance: 'Verify sequence membership basis, mainshock assignment, interval counts, and explicit data cutoff.',
  },
  {
    id: 'chk_07_historical_seismicity',
    order: 7,
    category: 'Sequence',
    label: 'Historical seismicity and magnitude-scale consistency',
    guidance: 'Confirm historical catalog radius, minimum magnitude, exact scales, and non-associative disclaimers.',
  },
  {
    id: 'chk_08_peis_intensity',
    order: 8,
    category: 'Intensities',
    label: 'PEIS intensity source and verification',
    guidance: 'Verify only verified felt and instrumental PEIS entries appear; draft/unverified counts are excluded.',
  },
  {
    id: 'chk_09_tsunami_provenance',
    order: 9,
    category: 'Hazards',
    label: 'Tsunami advisory and observation provenance',
    guidance: 'Confirm official advisory ID, coastal sea-level readings, or explicit unavailable/pending state.',
  },
  {
    id: 'chk_10_tectonic_interpretation',
    order: 10,
    category: 'Tectonics',
    label: 'Tectonic interpretation and non-causal proximity statements',
    guidance: 'Confirm nearest mapped structures are never overstated as proven causative faults without specialist review.',
  },
  {
    id: 'chk_11_secondary_hazards',
    order: 11,
    category: 'Hazards',
    label: 'Secondary hazard claims and source evidence',
    guidance: 'Verify liquefaction, landslide, surface rupture, and volcano statements reflect verified observations or general guidance only.',
  },
  {
    id: 'chk_12_public_safety_templates',
    order: 12,
    category: 'Preparedness',
    label: 'Public safety guidance and institutional template authorization',
    guidance: 'Check general educational safety guidance wording and distinguish event-specific verified advisories.',
  },
  {
    id: 'chk_13_phivolcs_response',
    order: 13,
    category: 'Response',
    label: 'PHIVOLCS response information and citations',
    guidance: 'Verify monitoring actions, QRT deployments, field investigations, or honest pending status.',
  },
  {
    id: 'chk_14_references_qualifications',
    order: 14,
    category: 'Provenance',
    label: 'Completeness of references and scientific qualifications',
    guidance: 'Confirm all references originate from genuine document records with non-fabricated citations and explicit caveats.',
  },
  {
    id: 'chk_15_pdf_html_quality',
    order: 15,
    category: 'Export',
    label: 'PDF/HTML figure quality and document readability',
    guidance: 'Inspect Public Draft and Scientific Review Copy layout, figure captions, multi-page tables, and headers/footers.',
  },
];

export interface PrimerChecklistEntry {
  itemId: string;
  order: number;
  category: string;
  label: string;
  guidance: string;
  isCustom: boolean;
  state: PrimerChecklistItemState;
  notApplicableJustification: string;
  notes: string;
  updatedAtUtc: string | null;
  updatedAtPst: string | null;
  updatedByUnverifiedLabel: string | null;
}

export type PrimerCommentTargetKind =
  | 'section'
  | 'figure'
  | 'table'
  | 'source-record'
  | 'document';

export type PrimerCommentCategory =
  | 'general-note'
  | 'missing-evidence'
  | 'correction-request';

export interface PrimerReviewComment {
  commentId: string;
  boundRevisionId: string;
  boundRevisionNumber: number;
  targetKind: PrimerCommentTargetKind;
  targetId: string;
  targetLabel: string;
  category: PrimerCommentCategory;
  body: string;
  missingEvidenceFlag: boolean;
  isCorrectionRequest: boolean;
  references: string[];
  authorLabel: string;
  authorIdentityVerification: 'UNVERIFIED_IDENTITY';
  createdAtUtc: string;
  createdAtPst: string;
  updatedAtUtc: string;
  updatedAtPst: string;
  resolutionState: 'none' | 'open' | 'resolved';
  resolutionNote: string | null;
  resolvedAtUtc: string | null;
  resolvedAtPst: string | null;
  resolvedByLabel: string | null;
  reopenedCount: number;
  reopenedAtUtc: string | null;
  reopenNote: string | null;
}

export interface PrimerReviewRecord {
  schemaVersion: '1.0';
  reviewRecordId: string;
  primerDocumentId: string;
  eventId: string;
  revisionId: string;
  revisionNumber: number;
  revisionContentChecksum: string;
  createdAtUtc: string;
  createdAtPst: string;
  updatedAtUtc: string;
  updatedAtPst: string;
  reviewScope: string;
  reviewerIdentity: {
    enteredLabel: string;
    identityVerification: 'UNVERIFIED_IDENTITY';
    disclaimer: string;
  };
  status: PrimerLocalReviewStatus;
  checklist: PrimerChecklistEntry[];
  comments: PrimerReviewComment[];
  localArchival: {
    storageKind: 'indexeddb-local' | 'memory-fallback' | 'imported-archive';
    isTamperProof: false;
    integrityNote: string;
    recordChecksum: string;
  };
}

export function computePrimerReviewChecksum(
  record: Omit<PrimerReviewRecord, 'localArchival'> & {
    localArchival: Omit<PrimerReviewRecord['localArchival'], 'recordChecksum'>;
  }
): string {
  return computeCanonicalChecksum({
    schemaVersion: record.schemaVersion,
    reviewRecordId: record.reviewRecordId,
    primerDocumentId: record.primerDocumentId,
    eventId: record.eventId,
    revisionId: record.revisionId,
    revisionNumber: record.revisionNumber,
    revisionContentChecksum: record.revisionContentChecksum,
    createdAtUtc: record.createdAtUtc,
    createdAtPst: record.createdAtPst,
    updatedAtUtc: record.updatedAtUtc,
    updatedAtPst: record.updatedAtPst,
    reviewScope: record.reviewScope,
    reviewerIdentity: record.reviewerIdentity,
    status: record.status,
    checklist: record.checklist,
    comments: record.comments,
    localArchivalMeta: {
      isTamperProof: record.localArchival.isTamperProof,
      integrityNote: record.localArchival.integrityNote,
    },
  });
}

export function verifyPrimerReviewChecksum(record: PrimerReviewRecord): boolean {
  if (!record || !record.localArchival || typeof record.localArchival.recordChecksum !== 'string') {
    return false;
  }
  const expected = computePrimerReviewChecksum({
    ...record,
    localArchival: {
      storageKind: record.localArchival.storageKind,
      isTamperProof: record.localArchival.isTamperProof,
      integrityNote: record.localArchival.integrityNote,
    },
  });
  return expected === record.localArchival.recordChecksum;
}

export function finalizeReviewRecordChecksum(
  draft: Omit<PrimerReviewRecord, 'localArchival'> & {
    localArchival?: Partial<Omit<PrimerReviewRecord['localArchival'], 'recordChecksum'>>;
  },
  storageKindOverride?: PrimerReviewRecord['localArchival']['storageKind']
): PrimerReviewRecord {
  const storageKind =
    storageKindOverride ?? draft.localArchival?.storageKind ?? 'indexeddb-local';
  const baseArchival = {
    storageKind,
    isTamperProof: false as const,
    integrityNote: LOCAL_REVIEW_INTEGRITY_DISCLAIMER,
  };
  const recordChecksum = computePrimerReviewChecksum({
    ...draft,
    localArchival: baseArchival,
  });
  return {
    ...draft,
    localArchival: {
      ...baseArchival,
      recordChecksum,
    },
  };
}

export interface CreatePrimerReviewOptions {
  reviewerLabel?: string;
  reviewScope?: string;
  createdAtUtc?: string;
  extraChecklistItems?: Array<{ category: string; label: string; guidance?: string }>;
}

/**
 * Creates a fresh local scientific review record bound strictly to a frozen PrimerRevisionRecord.
 * Never mutates the passed PrimerRevisionRecord.
 */
export function createPrimerReviewRecord(
  revision: PrimerRevisionRecord,
  options: CreatePrimerReviewOptions = {}
): PrimerReviewRecord {
  const nowUtc = options.createdAtUtc ?? new Date().toISOString();
  const nowPst = formatUtcAsPst(nowUtc);
  const enteredLabel = options.reviewerLabel?.trim() || 'Local Operator (Unverified)';
  const safeRev = revision.revisionId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
  const rand = Math.random().toString(36).slice(2, 7);
  const reviewRecordId = `revw_${safeRev}_${Date.now()}_${rand}`;

  const checklist: PrimerChecklistEntry[] = [
    ...DEFAULT_SCIENTIFIC_CHECKLIST_DEFINITIONS.map((def) => ({
      itemId: def.id,
      order: def.order,
      category: def.category,
      label: def.label,
      guidance: def.guidance,
      isCustom: false,
      state: 'not-checked' as PrimerChecklistItemState,
      notApplicableJustification: '',
      notes: '',
      updatedAtUtc: null,
      updatedAtPst: null,
      updatedByUnverifiedLabel: null,
    })),
    ...(options.extraChecklistItems ?? []).map((ext, idx) => ({
      itemId: `chk_custom_${idx + 16}_${Math.random().toString(36).slice(2, 6)}`,
      order: 16 + idx,
      category: ext.category.trim() || 'Custom',
      label: ext.label.trim() || `Custom Review Check #${idx + 1}`,
      guidance: ext.guidance?.trim() || 'Operator-configured local scientific check.',
      isCustom: true,
      state: 'not-checked' as PrimerChecklistItemState,
      notApplicableJustification: '',
      notes: '',
      updatedAtUtc: null,
      updatedAtPst: null,
      updatedByUnverifiedLabel: null,
    })),
  ];

  return finalizeReviewRecordChecksum({
    schemaVersion: PRIMER_REVIEW_SCHEMA_VERSION,
    reviewRecordId,
    primerDocumentId: revision.primerDocumentId,
    eventId: revision.eventId,
    revisionId: revision.revisionId,
    revisionNumber: revision.revisionNumber,
    revisionContentChecksum: revision.contentChecksum,
    createdAtUtc: nowUtc,
    createdAtPst: nowPst,
    updatedAtUtc: nowUtc,
    updatedAtPst: nowPst,
    reviewScope:
      options.reviewScope?.trim() ||
      `Full local scientific & technical check for Revision #${revision.revisionNumber}`,
    reviewerIdentity: {
      enteredLabel,
      identityVerification: 'UNVERIFIED_IDENTITY',
      disclaimer: LOCAL_REVIEW_AUTHORITY_DISCLAIMER,
    },
    status: 'not-started',
    checklist,
    comments: [],
  });
}

export function updateReviewMetadata(
  review: PrimerReviewRecord,
  patch: {
    reviewerLabel?: string;
    reviewScope?: string;
    nowUtc?: string;
  }
): PrimerReviewRecord {
  const nowUtc = patch.nowUtc ?? new Date().toISOString();
  const nowPst = formatUtcAsPst(nowUtc);
  return finalizeReviewRecordChecksum({
    ...review,
    updatedAtUtc: nowUtc,
    updatedAtPst: nowPst,
    reviewScope:
      patch.reviewScope !== undefined ? patch.reviewScope.trim() : review.reviewScope,
    reviewerIdentity: {
      enteredLabel:
        patch.reviewerLabel !== undefined
          ? patch.reviewerLabel.trim() || 'Local Operator (Unverified)'
          : review.reviewerIdentity.enteredLabel,
      identityVerification: 'UNVERIFIED_IDENTITY',
      disclaimer: LOCAL_REVIEW_AUTHORITY_DISCLAIMER,
    },
  });
}

export function updateChecklistItemState(
  review: PrimerReviewRecord,
  itemId: string,
  update: {
    state: PrimerChecklistItemState;
    notApplicableJustification?: string;
    notes?: string;
    reviewerLabel?: string;
    nowUtc?: string;
  }
): PrimerReviewRecord {
  const nowUtc = update.nowUtc ?? new Date().toISOString();
  const nowPst = formatUtcAsPst(nowUtc);
  const actorLabel =
    update.reviewerLabel?.trim() ||
    review.reviewerIdentity.enteredLabel ||
    'Local Operator (Unverified)';

  const nextChecklist = review.checklist.map((item) => {
    if (item.itemId !== itemId) return item;
    return {
      ...item,
      state: update.state,
      notApplicableJustification:
        update.notApplicableJustification !== undefined
          ? update.notApplicableJustification
          : item.notApplicableJustification,
      notes: update.notes !== undefined ? update.notes : item.notes,
      updatedAtUtc: nowUtc,
      updatedAtPst: nowPst,
      updatedByUnverifiedLabel: actorLabel,
    };
  });

  // Automatically reconcile high-level local status if new blockers are introduced
  let nextStatus = review.status;
  const hasCorrectionItem = nextChecklist.some((c) => c.state === 'correction-required');
  const hasUnresolvedCheck = nextChecklist.some((c) => c.state === 'not-checked');
  const hasMissingNaJustification = nextChecklist.some(
    (c) => c.state === 'not-applicable' && !c.notApplicableJustification.trim()
  );

  if (hasCorrectionItem) {
    nextStatus = 'corrections-requested';
  } else if (
    (nextStatus === 'review-notes-complete-unverified-identity' ||
      nextStatus === 'prepared-for-external-authorization') &&
    (hasUnresolvedCheck || hasMissingNaJustification)
  ) {
    nextStatus = 'in-review';
  } else if (nextStatus === 'not-started' && update.state !== 'not-checked') {
    nextStatus = 'in-review';
  }

  return finalizeReviewRecordChecksum({
    ...review,
    status: nextStatus,
    updatedAtUtc: nowUtc,
    updatedAtPst: nowPst,
    checklist: nextChecklist,
  });
}

export function addCustomChecklistItem(
  review: PrimerReviewRecord,
  item: { category: string; label: string; guidance?: string; nowUtc?: string }
): PrimerReviewRecord {
  const label = item.label.trim();
  if (!label) {
    throw new Error('Checklist item label cannot be empty.');
  }
  const nowUtc = item.nowUtc ?? new Date().toISOString();
  const nowPst = formatUtcAsPst(nowUtc);
  const nextOrder =
    review.checklist.reduce((max, c) => Math.max(max, c.order), 0) + 1;
  const newEntry: PrimerChecklistEntry = {
    itemId: `chk_custom_${nextOrder}_${Math.random().toString(36).slice(2, 6)}`,
    order: nextOrder,
    category: item.category.trim() || 'Custom',
    label,
    guidance: item.guidance?.trim() || 'Operator-configured local scientific check.',
    isCustom: true,
    state: 'not-checked',
    notApplicableJustification: '',
    notes: '',
    updatedAtUtc: nowUtc,
    updatedAtPst: nowPst,
    updatedByUnverifiedLabel: review.reviewerIdentity.enteredLabel,
  };
  return finalizeReviewRecordChecksum({
    ...review,
    updatedAtUtc: nowUtc,
    updatedAtPst: nowPst,
    checklist: [...review.checklist, newEntry],
  });
}

export interface AddPrimerReviewCommentInput {
  targetKind: PrimerCommentTargetKind;
  targetId: string;
  targetLabel: string;
  category: PrimerCommentCategory;
  body: string;
  missingEvidenceFlag?: boolean;
  isCorrectionRequest?: boolean;
  references?: string[];
  authorLabel?: string;
  nowUtc?: string;
}

export function addPrimerReviewComment(
  review: PrimerReviewRecord,
  input: AddPrimerReviewCommentInput
): PrimerReviewRecord {
  const body = input.body.trim();
  if (!body) {
    throw new Error('Review comment body cannot be empty.');
  }
  const nowUtc = input.nowUtc ?? new Date().toISOString();
  const nowPst = formatUtcAsPst(nowUtc);
  const isCorrectionRequest =
    input.isCorrectionRequest ?? input.category === 'correction-request';
  const missingEvidenceFlag =
    input.missingEvidenceFlag ?? input.category === 'missing-evidence';
  const authorLabel =
    input.authorLabel?.trim() ||
    review.reviewerIdentity.enteredLabel ||
    'Local Operator (Unverified)';

  const comment: PrimerReviewComment = {
    commentId: `cmt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    boundRevisionId: review.revisionId,
    boundRevisionNumber: review.revisionNumber,
    targetKind: input.targetKind,
    targetId: input.targetId.trim() || 'document',
    targetLabel: input.targetLabel.trim() || 'Entire Revision Snapshot',
    category: isCorrectionRequest
      ? 'correction-request'
      : missingEvidenceFlag
        ? 'missing-evidence'
        : 'general-note',
    body,
    missingEvidenceFlag,
    isCorrectionRequest,
    references: (input.references ?? []).map((r) => r.trim()).filter(Boolean),
    authorLabel,
    authorIdentityVerification: 'UNVERIFIED_IDENTITY',
    createdAtUtc: nowUtc,
    createdAtPst: nowPst,
    updatedAtUtc: nowUtc,
    updatedAtPst: nowPst,
    resolutionState: isCorrectionRequest ? 'open' : 'none',
    resolutionNote: null,
    resolvedAtUtc: null,
    resolvedAtPst: null,
    resolvedByLabel: null,
    reopenedCount: 0,
    reopenedAtUtc: null,
    reopenNote: null,
  };

  let nextStatus = review.status;
  if (isCorrectionRequest) {
    nextStatus = 'corrections-requested';
  } else if (nextStatus === 'not-started') {
    nextStatus = 'in-review';
  }

  return finalizeReviewRecordChecksum({
    ...review,
    status: nextStatus,
    updatedAtUtc: nowUtc,
    updatedAtPst: nowPst,
    comments: [comment, ...review.comments],
  });
}

export function editPrimerReviewComment(
  review: PrimerReviewRecord,
  commentId: string,
  patch: {
    body: string;
    references?: string[];
  },
  options: {
    nowUtc?: string;
    isSnapshotLocked?: boolean;
  } = {}
): PrimerReviewRecord {
  if (options.isSnapshotLocked) {
    throw new Error(
      `Comments bound to Revision #${review.revisionNumber} (${review.revisionId}) are locked as an immutable historical review snapshot.`
    );
  }
  const target = review.comments.find((c) => c.commentId === commentId);
  if (!target) {
    throw new Error(`Comment ${commentId} not found.`);
  }
  if (target.isCorrectionRequest && target.resolutionState === 'resolved') {
    throw new Error(
      `Resolved correction request (${commentId}) cannot be edited silently; reopen it first to append review findings.`
    );
  }
  const nextBody = patch.body.trim();
  if (!nextBody) {
    throw new Error('Review comment body cannot be empty.');
  }

  const nowUtc = options.nowUtc ?? new Date().toISOString();
  const nowPst = formatUtcAsPst(nowUtc);
  const nextComments = review.comments.map((c) =>
    c.commentId === commentId
      ? {
          ...c,
          body: nextBody,
          references:
            patch.references !== undefined
              ? patch.references.map((r) => r.trim()).filter(Boolean)
              : c.references,
          updatedAtUtc: nowUtc,
          updatedAtPst: nowPst,
        }
      : c
  );

  return finalizeReviewRecordChecksum({
    ...review,
    updatedAtUtc: nowUtc,
    updatedAtPst: nowPst,
    comments: nextComments,
  });
}

export function deletePrimerReviewComment(
  review: PrimerReviewRecord,
  commentId: string,
  options: {
    nowUtc?: string;
    isSnapshotLocked?: boolean;
  } = {}
): PrimerReviewRecord {
  if (options.isSnapshotLocked) {
    throw new Error(
      `Comments bound to Revision #${review.revisionNumber} (${review.revisionId}) are locked as an immutable historical review snapshot.`
    );
  }
  const target = review.comments.find((c) => c.commentId === commentId);
  if (!target) {
    throw new Error(`Comment ${commentId} not found.`);
  }
  if (target.isCorrectionRequest && target.resolutionState === 'resolved') {
    throw new Error(
      `Resolved correction request (${commentId}) is part of the audit trail and cannot be deleted.`
    );
  }

  const nowUtc = options.nowUtc ?? new Date().toISOString();
  const nowPst = formatUtcAsPst(nowUtc);
  const nextComments = review.comments.filter((c) => c.commentId !== commentId);

  const stillHasOpenCorrections = nextComments.some(
    (c) => c.isCorrectionRequest && c.resolutionState === 'open'
  );
  const stillHasChecklistCorrection = review.checklist.some(
    (i) => i.state === 'correction-required'
  );
  const nextStatus =
    review.status === 'corrections-requested' &&
    !stillHasOpenCorrections &&
    !stillHasChecklistCorrection
      ? 'in-review'
      : review.status;

  return finalizeReviewRecordChecksum({
    ...review,
    status: nextStatus,
    updatedAtUtc: nowUtc,
    updatedAtPst: nowPst,
    comments: nextComments,
  });
}

export function resolveCorrectionRequest(
  review: PrimerReviewRecord,
  commentId: string,
  resolutionNote: string,
  options: { resolvedByLabel?: string; nowUtc?: string } = {}
): PrimerReviewRecord {
  const note = resolutionNote.trim();
  if (!note) {
    throw new Error('A mandatory resolution note is required to resolve a correction request.');
  }
  const target = review.comments.find((c) => c.commentId === commentId);
  if (!target) {
    throw new Error(`Comment ${commentId} not found.`);
  }
  const nowUtc = options.nowUtc ?? new Date().toISOString();
  const nowPst = formatUtcAsPst(nowUtc);
  const resolvedByLabel =
    options.resolvedByLabel?.trim() ||
    review.reviewerIdentity.enteredLabel ||
    'Local Operator (Unverified)';

  const nextComments = review.comments.map((c) =>
    c.commentId === commentId
      ? {
          ...c,
          resolutionState: 'resolved' as const,
          resolutionNote: note,
          resolvedAtUtc: nowUtc,
          resolvedAtPst: nowPst,
          resolvedByLabel,
          updatedAtUtc: nowUtc,
          updatedAtPst: nowPst,
        }
      : c
  );

  const stillHasOpenCorrections = nextComments.some(
    (c) => c.isCorrectionRequest && c.resolutionState === 'open'
  );
  const stillHasChecklistCorrection = review.checklist.some(
    (i) => i.state === 'correction-required'
  );
  const nextStatus =
    review.status === 'corrections-requested' &&
    !stillHasOpenCorrections &&
    !stillHasChecklistCorrection
      ? 'in-review'
      : review.status;

  return finalizeReviewRecordChecksum({
    ...review,
    status: nextStatus,
    updatedAtUtc: nowUtc,
    updatedAtPst: nowPst,
    comments: nextComments,
  });
}

export function reopenCorrectionRequest(
  review: PrimerReviewRecord,
  commentId: string,
  reopenNote?: string,
  nowUtcInput?: string
): PrimerReviewRecord {
  const target = review.comments.find((c) => c.commentId === commentId);
  if (!target) {
    throw new Error(`Comment ${commentId} not found.`);
  }
  const nowUtc = nowUtcInput ?? new Date().toISOString();
  const nowPst = formatUtcAsPst(nowUtc);

  const nextComments = review.comments.map((c) =>
    c.commentId === commentId
      ? {
          ...c,
          isCorrectionRequest: true,
          category: 'correction-request' as const,
          resolutionState: 'open' as const,
          reopenedCount: c.reopenedCount + 1,
          reopenedAtUtc: nowUtc,
          reopenNote: reopenNote?.trim() || null,
          updatedAtUtc: nowUtc,
          updatedAtPst: nowPst,
        }
      : c
  );

  return finalizeReviewRecordChecksum({
    ...review,
    status: 'corrections-requested',
    updatedAtUtc: nowUtc,
    updatedAtPst: nowPst,
    comments: nextComments,
  });
}

export interface ReviewStatusTransitionValidation {
  allowed: boolean;
  reasons: string[];
}

export function validateLocalReviewStatusTransition(
  review: PrimerReviewRecord,
  nextStatusRaw: string
): ReviewStatusTransitionValidation {
  if (isForbiddenReleaseStatus(nextStatusRaw) || !isAllowedLocalReviewStatus(nextStatusRaw)) {
    return {
      allowed: false,
      reasons: [
        `Status "${nextStatusRaw}" is disallowed. Only bounded local review states are permitted; institutional approval/publication statuses cannot be set locally.`,
      ],
    };
  }

  const reasons: string[] = [];
  const openCorrections = review.comments.filter(
    (c) => c.isCorrectionRequest && c.resolutionState === 'open'
  );
  const correctionChecklistItems = review.checklist.filter(
    (i) => i.state === 'correction-required'
  );
  const uncheckedItems = review.checklist.filter((i) => i.state === 'not-checked');
  const invalidNaItems = review.checklist.filter(
    (i) => i.state === 'not-applicable' && !i.notApplicableJustification.trim()
  );

  if (
    nextStatusRaw === 'review-notes-complete-unverified-identity' ||
    nextStatusRaw === 'prepared-for-external-authorization'
  ) {
    if (openCorrections.length > 0) {
      reasons.push(
        `${openCorrections.length} open correction request(s) must be resolved with a note before completion.`
      );
    }
    if (correctionChecklistItems.length > 0) {
      reasons.push(
        `${correctionChecklistItems.length} checklist item(s) remain marked Correction Required.`
      );
    }
    if (uncheckedItems.length > 0) {
      reasons.push(
        `${uncheckedItems.length} scientific checklist item(s) remain Not Checked.`
      );
    }
    if (invalidNaItems.length > 0) {
      reasons.push(
        `${invalidNaItems.length} Not Applicable checklist item(s) lack mandatory justification.`
      );
    }
  }

  return {
    allowed: reasons.length === 0,
    reasons,
  };
}

export function transitionLocalReviewStatus(
  review: PrimerReviewRecord,
  nextStatusRaw: PrimerLocalReviewStatus | string,
  nowUtcInput?: string
): PrimerReviewRecord {
  const check = validateLocalReviewStatusTransition(review, nextStatusRaw);
  if (!check.allowed) {
    throw new Error(check.reasons.join(' '));
  }
  const nowUtc = nowUtcInput ?? new Date().toISOString();
  const nowPst = formatUtcAsPst(nowUtc);
  return finalizeReviewRecordChecksum({
    ...review,
    status: nextStatusRaw as PrimerLocalReviewStatus,
    updatedAtUtc: nowUtc,
    updatedAtPst: nowPst,
  });
}

// =============================================================================
// F. REVIEW INVALIDATION & SOURCE DRIFT EVALUATION
// =============================================================================

export type PrimerReviewValidityState =
  | 'valid-for-snapshot'
  | 'outdated-newer-revision'
  | 'outdated-source-drift'
  | 'outdated-revision-and-sources'
  | 'invalid-revision-binding';

export interface PrimerReviewValidityReport {
  isValid: boolean;
  validityState: PrimerReviewValidityState;
  reasons: string[];
  newerRevisions: Array<{
    revisionId: string;
    revisionNumber: number;
    createdAtPst: string;
    contentChanged: boolean;
  }>;
  sourceChangeReport: PrimerSourceChangeReport | null;
  shouldInvalidateCompletedStatus: boolean;
}

export interface LivePrimerReviewSourceContext {
  event: EQPEvent;
  primaryLocationLabel?: string;
  faultGeneratorLabel?: string | null;
  isPlotResultStale?: boolean;
  currentEventFingerprint?: string;
  currentStage3Fingerprint?: string;
  currentStage4Fingerprint?: string;
  liveExternalData?: PrimerStage4ExternalData;
}

export function evaluatePrimerReviewValidity(
  review: PrimerReviewRecord,
  boundRevision: PrimerRevisionRecord | undefined,
  allRevisionsForDoc: PrimerRevisionRecord[],
  liveSourceContext?: LivePrimerReviewSourceContext
): PrimerReviewValidityReport {
  const reasons: string[] = [];

  if (!boundRevision) {
    return {
      isValid: false,
      validityState: 'invalid-revision-binding',
      reasons: [
        `Bound frozen Revision #${review.revisionNumber} (${review.revisionId}) is missing from the local archive.`,
      ],
      newerRevisions: [],
      sourceChangeReport: null,
      shouldInvalidateCompletedStatus: true,
    };
  }

  if (!verifyPrimerRevisionChecksum(boundRevision)) {
    return {
      isValid: false,
      validityState: 'invalid-revision-binding',
      reasons: [
        `Bound Revision #${boundRevision.revisionNumber} failed snapshot checksum verification.`,
      ],
      newerRevisions: [],
      sourceChangeReport: null,
      shouldInvalidateCompletedStatus: true,
    };
  }

  if (boundRevision.contentChecksum !== review.revisionContentChecksum) {
    return {
      isValid: false,
      validityState: 'invalid-revision-binding',
      reasons: [
        `Revision content checksum mismatch (${review.revisionContentChecksum} ≠ ${boundRevision.contentChecksum}). Review must be re-run against the exact revision.`,
      ],
      newerRevisions: [],
      sourceChangeReport: null,
      shouldInvalidateCompletedStatus: true,
    };
  }

  if (
    boundRevision.primerDocumentId !== review.primerDocumentId ||
    boundRevision.revisionId !== review.revisionId
  ) {
    return {
      isValid: false,
      validityState: 'invalid-revision-binding',
      reasons: ['Review record revisionId/documentId binding mismatch.'],
      newerRevisions: [],
      sourceChangeReport: null,
      shouldInvalidateCompletedStatus: true,
    };
  }

  // Check if newer revisions exist for the same primer document (never carry completion automatically!)
  const newer = allRevisionsForDoc
    .filter(
      (r) =>
        r.primerDocumentId === review.primerDocumentId &&
        r.revisionNumber > review.revisionNumber
    )
    .sort((a, b) => a.revisionNumber - b.revisionNumber)
    .map((r) => ({
      revisionId: r.revisionId,
      revisionNumber: r.revisionNumber,
      createdAtPst: r.createdAtPst,
      contentChanged: r.contentChecksum !== review.revisionContentChecksum,
    }));

  if (newer.length > 0) {
    const latest = newer[newer.length - 1];
    reasons.push(
      `Newer snapshot Revision #${latest.revisionNumber} exists for this primer (${latest.contentChanged ? 'document content/sources modified' : 'later archive save'}). Local review from Rev #${review.revisionNumber} never transfers automatically.`
    );
  }

  let sourceChangeReport: PrimerSourceChangeReport | null = null;
  if (liveSourceContext) {
    sourceChangeReport = detectPrimerSourceChanges(boundRevision, liveSourceContext);
    if (sourceChangeReport.hasSourceChanges) {
      for (const chg of sourceChangeReport.changes) {
        reasons.push(`${chg.label}: ${chg.detail}`);
      }
    }
  }

  const hasNewer = newer.length > 0;
  const hasSourceDrift = Boolean(sourceChangeReport?.hasSourceChanges);

  let validityState: PrimerReviewValidityState = 'valid-for-snapshot';
  if (hasNewer && hasSourceDrift) {
    validityState = 'outdated-revision-and-sources';
  } else if (hasNewer) {
    validityState = 'outdated-newer-revision';
  } else if (hasSourceDrift) {
    validityState = 'outdated-source-drift';
  }

  const isCompletedOrPrepared =
    review.status === 'review-notes-complete-unverified-identity' ||
    review.status === 'prepared-for-external-authorization';

  return {
    isValid: validityState === 'valid-for-snapshot',
    validityState,
    reasons,
    newerRevisions: newer,
    sourceChangeReport,
    shouldInvalidateCompletedStatus: isCompletedOrPrepared && (hasNewer || hasSourceDrift),
  };
}

// =============================================================================
// G. EXTENDED DOCUMENT READINESS SUMMARY (Cleanly separated 4 pillars)
// =============================================================================

export interface ExtendedPrimerReadinessSummary {
  baseReadiness: PrimerReadinessSummary;
  contentCompleteness: {
    populatedSections: number;
    totalSections: number;
    readyForReviewSections: number;
    requiresInfoSections: number;
    requiresScientificReviewSections: number;
    unavailableOrUnverifiedFields: string[];
  };
  localScientificReview: {
    boundRevisionNumber: number | null;
    boundRevisionId: string | null;
    status: PrimerLocalReviewStatus | 'no-revision-selected';
    statusLabel: string;
    identityStatus: 'UNVERIFIED_IDENTITY';
    enteredReviewerLabel: string | null;
    validityState: PrimerReviewValidityState | 'none';
    isReviewOutdated: boolean;
    outdatedReasons: string[];
    checklistTotal: number;
    checklistChecked: number;
    checklistSatisfactory: number;
    checklistCorrectionRequired: number;
    checklistNotApplicable: number;
    checklistNotChecked: number;
    openCorrectionRequests: number;
    resolvedCorrectionRequests: number;
    missingEvidenceComments: number;
  };
  exportTechnicalReadiness: {
    readyFigureCount: number;
    totalFigureSlots: number;
    availableFigures: PrimerReadinessSummary['availableFigures'];
    staleIndicators: string[];
    exportWarnings: string[];
  };
  institutionalAuthorization: {
    externalInstitutionalAuthorization: 'UNAVAILABLE / NOT CONFIGURED';
    publicPublicationStatus: 'UNAVAILABLE / NOT CONFIGURED';
    canFormallyApprove: false;
    canFormallySign: false;
    canPublishPublicly: false;
    explanation: string;
  };
}

export function computeExtendedPrimerReadiness(
  primer: PrimerDocument,
  options: {
    currentEventFingerprint?: string;
    currentStage3Fingerprint?: string;
    currentStage4Fingerprint?: string;
    isPlotResultStale?: boolean;
    activeRevision?: PrimerRevisionRecord | null;
    reviewRecord?: PrimerReviewRecord | null;
    reviewValidity?: PrimerReviewValidityReport | null;
  } = {}
): ExtendedPrimerReadinessSummary {
  const baseReadiness = computePrimerReadinessSummary(primer, {
    currentEventFingerprint: options.currentEventFingerprint,
    currentStage3Fingerprint: options.currentStage3Fingerprint,
    currentStage4Fingerprint: options.currentStage4Fingerprint,
    isPlotResultStale: options.isPlotResultStale,
  });

  const rev = options.activeRevision ?? null;
  const review = options.reviewRecord ?? null;
  const validity = options.reviewValidity ?? null;

  const checklist = review?.checklist ?? [];
  const checklistSatisfactory = checklist.filter(
    (c) => c.state === 'satisfactory-for-local-review'
  ).length;
  const checklistCorrectionRequired = checklist.filter(
    (c) => c.state === 'correction-required'
  ).length;
  const checklistNotApplicable = checklist.filter(
    (c) => c.state === 'not-applicable'
  ).length;
  const checklistNotChecked = checklist.filter(
    (c) => c.state === 'not-checked'
  ).length;
  const checklistChecked = checklist.length - checklistNotChecked;

  const comments = review?.comments ?? [];
  const openCorrectionRequests = comments.filter(
    (c) => c.isCorrectionRequest && c.resolutionState === 'open'
  ).length;
  const resolvedCorrectionRequests = comments.filter(
    (c) => c.isCorrectionRequest && c.resolutionState === 'resolved'
  ).length;
  const missingEvidenceComments = comments.filter(
    (c) => c.missingEvidenceFlag && c.resolutionState !== 'resolved'
  ).length;

  return {
    baseReadiness,
    contentCompleteness: {
      populatedSections: baseReadiness.populatedCount,
      totalSections: baseReadiness.totalSections,
      readyForReviewSections: baseReadiness.readyForReviewCount,
      requiresInfoSections: baseReadiness.requiresInfoCount,
      requiresScientificReviewSections: baseReadiness.requiresScientificReviewCount,
      unavailableOrUnverifiedFields: [...primer.extracted.unavailableOrUnverifiedFields],
    },
    localScientificReview: {
      boundRevisionNumber: rev?.revisionNumber ?? review?.revisionNumber ?? null,
      boundRevisionId: rev?.revisionId ?? review?.revisionId ?? null,
      status: review ? review.status : 'no-revision-selected',
      statusLabel: review
        ? PRIMER_LOCAL_REVIEW_STATUS_META[review.status].label
        : 'No Frozen Revision Review Started',
      identityStatus: 'UNVERIFIED_IDENTITY',
      enteredReviewerLabel: review?.reviewerIdentity.enteredLabel ?? null,
      validityState: validity ? validity.validityState : 'none',
      isReviewOutdated: validity ? !validity.isValid : false,
      outdatedReasons: validity ? [...validity.reasons] : [],
      checklistTotal: checklist.length,
      checklistChecked,
      checklistSatisfactory,
      checklistCorrectionRequired,
      checklistNotApplicable,
      checklistNotChecked,
      openCorrectionRequests,
      resolvedCorrectionRequests,
      missingEvidenceComments,
    },
    exportTechnicalReadiness: {
      readyFigureCount: baseReadiness.readyFigureCount,
      totalFigureSlots: baseReadiness.totalFigureSlots,
      availableFigures: baseReadiness.availableFigures,
      staleIndicators: [...baseReadiness.staleIndicators],
      exportWarnings: [...baseReadiness.exportIssues],
    },
    institutionalAuthorization: {
      externalInstitutionalAuthorization: 'UNAVAILABLE / NOT CONFIGURED',
      publicPublicationStatus: 'UNAVAILABLE / NOT CONFIGURED',
      canFormallyApprove: false,
      canFormallySign: false,
      canPublishPublicly: false,
      explanation:
        'EQP Modern has no authenticated user accounts, verified institutional roles, or external release/signing service configured. Local review notes and ZIP review packages prepare drafts for external PHIVOLCS review only.',
    },
  };
}

// =============================================================================
// K. FUTURE INSTITUTIONAL AUTHORIZATION EXTENSION INTERFACES (UNWIRED)
// =============================================================================

export interface AuthenticatedReviewerIdentity {
  subjectId: string;
  displayName: string;
  institutionalRole: 'duty-seismologist' | 'senior-reviewer' | 'division-chief' | 'director';
  issuer: string;
  verifiedAtUtc: string;
  verificationMethod: 'oidc' | 'mtls' | 'hardware-token';
}

export interface ExternalInstitutionalAuthorizationResult {
  configured: boolean;
  decision: 'unavailable' | 'pending-external-review' | 'authorized' | 'rejected';
  reviewerIdentity: AuthenticatedReviewerIdentity | null;
  auditRecordUri: string | null;
  message: string;
}

export interface ExternalAuthorizationProvider {
  readonly providerName: string;
  readonly isConfigured: boolean;
  submitForAuthorization(input: {
    revisionId: string;
    revisionContentChecksum: string;
    localReviewRecordId: string;
  }): Promise<ExternalInstitutionalAuthorizationResult>;
}

export interface InstitutionalReleaseAuditSink {
  readonly sinkName: string;
  readonly isConfigured: boolean;
  appendImmutableAuditEvent(event: {
    eventType: 'review-submitted' | 'authorization-recorded' | 'release-blocked';
    revisionId: string;
    revisionContentChecksum: string;
    actor: AuthenticatedReviewerIdentity | null;
    timestampUtc: string;
  }): Promise<{ accepted: boolean; reason: string }>;
}

export const PRIMER_REVIEW_TARGET_OPTIONS: Array<{
  targetKind: PrimerCommentTargetKind;
  targetId: string;
  targetLabel: string;
}> = [
  { targetKind: 'document', targetId: 'document_overall', targetLabel: 'Overall Document & Header' },
  { targetKind: 'section', targetId: 'overview', targetLabel: 'Section 1: Overview & Event Parameters' },
  { targetKind: 'section', targetId: 'location', targetLabel: 'Section 2: Location & Geographic Context' },
  { targetKind: 'section', targetId: 'aftershocks', targetLabel: 'Section 3: Aftershocks & Sequence Analysis' },
  { targetKind: 'section', targetId: 'intensity', targetLabel: 'Section 4: PEIS Earthquake Intensities' },
  { targetKind: 'section', targetId: 'tectonic_setting', targetLabel: 'Section 5: Tectonic Setting & Generators' },
  { targetKind: 'section', targetId: 'hazards', targetLabel: 'Section 6: Tsunami & Secondary Hazards' },
  { targetKind: 'section', targetId: 'recommendations', targetLabel: 'Section 7: Preparedness & PHIVOLCS Response' },
  { targetKind: 'figure', targetId: 'epicenter', targetLabel: 'Figure: Epicenter & Geographic Context Map' },
  { targetKind: 'figure', targetId: 'aftershockMap', targetLabel: 'Figure: Sequence & Historical Seismicity Map' },
  { targetKind: 'figure', targetId: 'activityChart', targetLabel: 'Figure: Earthquake Activity vs. Time' },
  { targetKind: 'figure', targetId: 'magnitudeChart', targetLabel: 'Figure: Catalog Magnitude Distribution' },
  { targetKind: 'table', targetId: 'historical_table', targetLabel: 'Table: Historical Regional Seismicity' },
  { targetKind: 'table', targetId: 'aftershock_table', targetLabel: 'Table: Largest Sequence Earthquakes' },
  { targetKind: 'source-record', targetId: 'provenance_ledger', targetLabel: 'Source Provenance & Cutoff Metadata' },
];

export type PrimerSectionRef = PrimerSectionId;
