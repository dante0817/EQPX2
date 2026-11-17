import type { PrimerDocument, PrimerSectionId } from './earthquakePrimer.ts';
import { formatUtcAsPst } from './primerSequenceIntegration.ts';

export type SectionCommentTargetKind =
  | 'section'
  | 'figure'
  | 'table'
  | 'source-record'
  | 'document';

export type SectionCommentCategory =
  | 'general-note'
  | 'missing-evidence'
  | 'correction-request';

export interface PrimerSectionComment {
  commentId: string;
  boundRevisionId: string;
  boundRevisionNumber: number | null;
  targetKind: SectionCommentTargetKind;
  targetId: string;
  targetLabel: string;
  category: SectionCommentCategory;
  body: string;
  authorLabel: string;
  authorIdentityVerification: 'UNVERIFIED_IDENTITY';
  createdAtUtc: string;
  createdAtPst: string;
  updatedAtUtc: string;
  updatedAtPst: string;
  isSnapshotImmutable: boolean;
  frozenInRevisionId: string | null;
  frozenInRevisionNumber: number | null;
  correctionRequestId?: string | null;
}

export interface PrimerSectionTargetOption {
  targetKind: SectionCommentTargetKind;
  targetId: string;
  targetLabel: string;
}

export const PRIMER_SECTION_AND_FIGURE_TARGETS: PrimerSectionTargetOption[] = [
  { targetKind: 'section', targetId: 'overview', targetLabel: 'Section 1: Overview & Event Parameters' },
  { targetKind: 'section', targetId: 'location', targetLabel: 'Section 2: Location & Geographic Context' },
  { targetKind: 'section', targetId: 'aftershocks', targetLabel: 'Section 3: Aftershocks & Sequence Analysis' },
  { targetKind: 'section', targetId: 'intensity', targetLabel: 'Section 4: PEIS Earthquake Intensities' },
  { targetKind: 'section', targetId: 'tectonic_setting', targetLabel: 'Section 5: Tectonic Setting & Generators' },
  { targetKind: 'section', targetId: 'hazards', targetLabel: 'Section 6: Tsunami & Secondary Hazards' },
  { targetKind: 'section', targetId: 'recommendations', targetLabel: 'Section 7: Preparedness & PHIVOLCS Response' },
  { targetKind: 'figure', targetId: 'epicenter', targetLabel: 'Figure 1: Epicenter & Geographic Context Map' },
  { targetKind: 'figure', targetId: 'aftershockMap', targetLabel: 'Figure 2: Sequence & Historical Seismicity Map' },
  { targetKind: 'figure', targetId: 'activityChart', targetLabel: 'Figure 3: Earthquake Activity vs. Time' },
  { targetKind: 'figure', targetId: 'magnitudeChart', targetLabel: 'Figure 4: Catalog Magnitude Distribution' },
];

export function getPrimerTargetLabel(
  targetKind: SectionCommentTargetKind,
  targetId: string
): string {
  const match = PRIMER_SECTION_AND_FIGURE_TARGETS.find(
    (t) => t.targetKind === targetKind && t.targetId === targetId
  );
  if (match) return match.targetLabel;
  if (targetKind === 'section') return `Section: ${targetId}`;
  if (targetKind === 'figure') return `Figure: ${targetId}`;
  return targetId || 'Primer Document';
}

export function getSectionComments(primer: PrimerDocument | null | undefined): PrimerSectionComment[] {
  const list = primer?.extensions?.sectionComments;
  return Array.isArray(list) ? list : [];
}

export function getSectionCommentsForTarget(
  primer: PrimerDocument | null | undefined,
  targetKind: SectionCommentTargetKind,
  targetId: string
): PrimerSectionComment[] {
  return getSectionComments(primer).filter(
    (c) => c.targetKind === targetKind && c.targetId === targetId
  );
}

export function resolveWorkingDraftRevisionBinding(primer: PrimerDocument): {
  boundRevisionId: string;
  boundRevisionNumber: number | null;
} {
  const activeRevId = primer.extensions?.reviewVersioning?.activeRevisionId;
  const revNum = primer.extensions?.reviewVersioning?.revisionNumber;
  if (activeRevId && activeRevId.trim()) {
    return {
      boundRevisionId: activeRevId.trim(),
      boundRevisionNumber: typeof revNum === 'number' && Number.isFinite(revNum) ? revNum : null,
    };
  }
  const baseDocId =
    primer.extensions?.reviewVersioning?.primerDocumentId?.trim() || primer.id;
  return {
    boundRevisionId: `draft:${baseDocId}`,
    boundRevisionNumber: null,
  };
}

export interface AddSectionCommentInput {
  targetKind: SectionCommentTargetKind;
  targetId: string;
  targetLabel?: string;
  category?: SectionCommentCategory;
  body: string;
  authorLabel?: string;
  boundRevisionId?: string;
  boundRevisionNumber?: number | null;
  correctionRequestId?: string | null;
  nowUtc?: string;
}

export function addSectionCommentToDraft(
  primer: PrimerDocument,
  input: AddSectionCommentInput
): PrimerDocument {
  if (Object.isFrozen(primer) || Object.isFrozen(primer.extensions)) {
    throw new Error(
      'Cannot add section comments directly to a frozen historical revision snapshot.'
    );
  }
  const body = input.body.trim();
  if (!body) {
    throw new Error('Section comment note cannot be empty.');
  }
  const nowUtc = input.nowUtc ?? new Date().toISOString();
  const nowPst = formatUtcAsPst(nowUtc);
  const binding = resolveWorkingDraftRevisionBinding(primer);
  const boundRevisionId = input.boundRevisionId?.trim() || binding.boundRevisionId;
  const boundRevisionNumber =
    input.boundRevisionNumber !== undefined
      ? input.boundRevisionNumber
      : binding.boundRevisionNumber;

  const targetId = input.targetId.trim();
  if (!targetId) {
    throw new Error('Target section or figure ID is required.');
  }

  const comment: PrimerSectionComment = {
    commentId: `scmt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    boundRevisionId,
    boundRevisionNumber,
    targetKind: input.targetKind,
    targetId,
    targetLabel:
      input.targetLabel?.trim() || getPrimerTargetLabel(input.targetKind, targetId),
    category: input.category ?? 'general-note',
    body,
    authorLabel: input.authorLabel?.trim() || 'Local Operator (Unverified)',
    authorIdentityVerification: 'UNVERIFIED_IDENTITY',
    createdAtUtc: nowUtc,
    createdAtPst: nowPst,
    updatedAtUtc: nowUtc,
    updatedAtPst: nowPst,
    isSnapshotImmutable: false,
    frozenInRevisionId: null,
    frozenInRevisionNumber: null,
    correctionRequestId: input.correctionRequestId ?? null,
  };

  const existing = getSectionComments(primer);
  return {
    ...primer,
    updatedAt: nowUtc,
    extensions: {
      ...(primer.extensions ?? {}),
      sectionComments: [comment, ...existing],
    },
  };
}

export function editSectionCommentInDraft(
  primer: PrimerDocument,
  commentId: string,
  nextBodyRaw: string,
  options: { category?: SectionCommentCategory; nowUtc?: string } = {}
): PrimerDocument {
  if (Object.isFrozen(primer) || Object.isFrozen(primer.extensions)) {
    throw new Error(
      'Cannot edit comments inside a frozen historical revision snapshot.'
    );
  }
  const nextBody = nextBodyRaw.trim();
  if (!nextBody) {
    throw new Error('Section comment note cannot be empty.');
  }
  const existing = getSectionComments(primer);
  const target = existing.find((c) => c.commentId === commentId);
  if (!target) {
    throw new Error(`Section comment "${commentId}" not found.`);
  }
  if (target.isSnapshotImmutable || target.frozenInRevisionId) {
    throw new Error(
      `Comment "${commentId}" is immutable as part of frozen Revision #${target.frozenInRevisionNumber ?? '?'} (${target.frozenInRevisionId ?? target.boundRevisionId}).`
    );
  }

  const nowUtc = options.nowUtc ?? new Date().toISOString();
  const nowPst = formatUtcAsPst(nowUtc);

  const nextComments = existing.map((c) =>
    c.commentId === commentId
      ? {
          ...c,
          body: nextBody,
          category: options.category ?? c.category,
          updatedAtUtc: nowUtc,
          updatedAtPst: nowPst,
        }
      : c
  );

  return {
    ...primer,
    updatedAt: nowUtc,
    extensions: {
      ...(primer.extensions ?? {}),
      sectionComments: nextComments,
    },
  };
}

export function deleteSectionCommentFromDraft(
  primer: PrimerDocument,
  commentId: string,
  options: { nowUtc?: string } = {}
): PrimerDocument {
  if (Object.isFrozen(primer) || Object.isFrozen(primer.extensions)) {
    throw new Error(
      'Cannot delete comments inside a frozen historical revision snapshot.'
    );
  }
  const existing = getSectionComments(primer);
  const target = existing.find((c) => c.commentId === commentId);
  if (!target) {
    throw new Error(`Section comment "${commentId}" not found.`);
  }
  if (target.isSnapshotImmutable || target.frozenInRevisionId) {
    throw new Error(
      `Comment "${commentId}" is immutable as part of frozen Revision #${target.frozenInRevisionNumber ?? '?'} (${target.frozenInRevisionId ?? target.boundRevisionId}) and cannot be deleted.`
    );
  }

  const nowUtc = options.nowUtc ?? new Date().toISOString();
  const nextComments = existing.filter((c) => c.commentId !== commentId);

  return {
    ...primer,
    updatedAt: nowUtc,
    extensions: {
      ...(primer.extensions ?? {}),
      sectionComments: nextComments,
    },
  };
}

/**
 * Stamps and locks all draft comments at revision snapshot capture time so they become
 * permanently bound to `revisionId` and immutable within the revision history snapshot.
 * Comments already frozen by an earlier revision retain their original revision binding.
 */
export function freezeSectionCommentsForSnapshot(
  comments: PrimerSectionComment[] | undefined,
  revisionId: string,
  revisionNumber: number
): PrimerSectionComment[] | undefined {
  if (!comments || comments.length === 0) return undefined;
  return comments.map((c) => {
    const alreadyFrozen = Boolean(c.isSnapshotImmutable && c.frozenInRevisionId);
    const frozenId = alreadyFrozen ? c.frozenInRevisionId! : revisionId;
    const frozenNum =
      alreadyFrozen && c.frozenInRevisionNumber !== null
        ? c.frozenInRevisionNumber
        : revisionNumber;
    const boundId =
      alreadyFrozen || (!c.boundRevisionId.startsWith('draft:') && c.frozenInRevisionId)
        ? c.boundRevisionId
        : frozenId;
    const boundNum =
      alreadyFrozen && c.boundRevisionNumber !== null
        ? c.boundRevisionNumber
        : frozenNum;
    return {
      ...c,
      boundRevisionId: boundId,
      boundRevisionNumber: boundNum,
      isSnapshotImmutable: true,
      frozenInRevisionId: frozenId,
      frozenInRevisionNumber: frozenNum,
    };
  });
}

export function isSectionTargetId(id: string): id is PrimerSectionId {
  return (
    id === 'overview' ||
    id === 'location' ||
    id === 'aftershocks' ||
    id === 'intensity' ||
    id === 'tectonic_setting' ||
    id === 'hazards' ||
    id === 'recommendations'
  );
}
