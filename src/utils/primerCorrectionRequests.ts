import {
  computeCanonicalChecksum,
  type PrimerRevisionRecord,
  verifyPrimerRevisionChecksum,
} from './primerRevisions';
import {
  getPrimerTargetLabel,
  type SectionCommentTargetKind,
} from './primerSectionComments';
import { formatUtcAsPst } from './primerSequenceIntegration';

export const PRIMER_CORRECTION_SCHEMA_VERSION = '1.0' as const;
export const PRIMER_CORRECTION_DB_NAME = 'eqp_primer_corrections_v1';
export const PRIMER_CORRECTION_STORE_NAME = 'correction_requests';
export const PRIMER_CORRECTION_FALLBACK_STORAGE_KEY = 'eqp_primer_corrections_fallback_v1';

export type CorrectionRequestStatus =
  | 'open'
  | 'draft-in-progress'
  | 'resolved'
  | 'reopened';

export interface PrimerCorrectionRequest {
  schemaVersion: '1.0';
  requestId: string;
  eventId: string;
  primerDocumentId: string;
  // Immutable link back to the original frozen revision snapshot
  sourceRevisionId: string;
  sourceRevisionNumber: number;
  sourceRevisionChecksum: string;
  sourceRevisionCreatedAtUtc: string;
  sourceRevisionCreatedAtPst: string;
  // Flagged section or figure target
  targetKind: SectionCommentTargetKind;
  targetId: string;
  targetLabel: string;
  originalContentExcerpt: string;
  // Operator / reviewer correction details
  summary: string;
  reason: string;
  requestedByLabel: string;
  identityVerification: 'UNVERIFIED_IDENTITY';
  createdAtUtc: string;
  createdAtPst: string;
  updatedAtUtc: string;
  updatedAtPst: string;
  status: CorrectionRequestStatus;
  // Downstream non-destructive correction lineage
  restoredDraftPrimerId: string | null;
  linkedReviewCommentId: string | null;
  resolvedInRevisionId: string | null;
  resolvedInRevisionNumber: number | null;
  resolutionNote: string | null;
  resolvedAtUtc: string | null;
  resolvedAtPst: string | null;
  resolvedByLabel: string | null;
  reopenedCount: number;
  reopenNote: string | null;
  recordChecksum: string;
}

export function computeCorrectionRequestChecksum(
  draft: Omit<PrimerCorrectionRequest, 'recordChecksum'>
): string {
  const { recordChecksum: _ignored, ...cleanDraft } = draft as PrimerCorrectionRequest;
  return computeCanonicalChecksum(cleanDraft);
}

export function verifyCorrectionRequestChecksum(req: PrimerCorrectionRequest): boolean {
  if (!req || typeof req.recordChecksum !== 'string') return false;
  const { recordChecksum, ...rest } = req;
  return computeCorrectionRequestChecksum(rest) === recordChecksum;
}

function finalizeCorrectionChecksum(
  draft: Omit<PrimerCorrectionRequest, 'recordChecksum'> | PrimerCorrectionRequest
): PrimerCorrectionRequest {
  const { recordChecksum: _ignored, ...cleanDraft } = draft as PrimerCorrectionRequest;
  return {
    ...cleanDraft,
    recordChecksum: computeCorrectionRequestChecksum(cleanDraft),
  };
}

export function extractSnapshotTargetExcerpt(
  revision: PrimerRevisionRecord,
  targetKind: SectionCommentTargetKind,
  targetId: string
): string {
  const snap = revision.snapshot;
  if (targetKind === 'section') {
    const sec = snap.sections.find((s) => s.id === targetId);
    if (sec) {
      const compact = sec.content.replace(/\s+/g, ' ').trim();
      return compact.length > 260 ? `${compact.slice(0, 257)}...` : compact || '(Empty section)';
    }
  }
  if (targetKind === 'figure') {
    if (targetId === 'epicenter') {
      const fig = snap.extensions?.epicenterFigure;
      if (fig) {
        return `${fig.caption} [Status: ${fig.status} · Extent: ${fig.extent}]`;
      }
      return 'Epicenter figure not yet generated in this snapshot.';
    }
    const s3 = snap.extensions?.sequenceHistoricalAnalysis;
    if (s3 && (targetId === 'aftershockMap' || targetId === 'activityChart' || targetId === 'magnitudeChart')) {
      const fig = s3.figures[targetId];
      if (fig) {
        return `${fig.caption} [Status: ${fig.status}]`;
      }
    }
  }
  return `${snap.title} (Rev #${revision.revisionNumber} · Event ${snap.eventId})`;
}

export interface CreateCorrectionRequestInput {
  targetKind: SectionCommentTargetKind;
  targetId: string;
  targetLabel?: string;
  summary: string;
  reason?: string;
  requestedByLabel?: string;
  linkedReviewCommentId?: string | null;
  nowUtc?: string;
}

export function createCorrectionRequestRecord(
  sourceRevision: PrimerRevisionRecord,
  input: CreateCorrectionRequestInput
): PrimerCorrectionRequest {
  if (!verifyPrimerRevisionChecksum(sourceRevision)) {
    throw new Error(
      `Cannot anchor correction request to Revision #${sourceRevision.revisionNumber} (${sourceRevision.revisionId}): snapshot checksum verification failed.`
    );
  }
  const summary = input.summary.trim();
  if (!summary) {
    throw new Error('Correction request summary cannot be empty.');
  }
  const targetId = input.targetId.trim();
  if (!targetId) {
    throw new Error('Target section or figure ID is required.');
  }

  const nowUtc = input.nowUtc ?? new Date().toISOString();
  const nowPst = formatUtcAsPst(nowUtc);
  const safeRev = sourceRevision.revisionId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24);
  const rand = Math.random().toString(36).slice(2, 7);

  return finalizeCorrectionChecksum({
    schemaVersion: PRIMER_CORRECTION_SCHEMA_VERSION,
    requestId: `corr_${safeRev}_${Date.now()}_${rand}`,
    eventId: sourceRevision.eventId,
    primerDocumentId: sourceRevision.primerDocumentId,
    sourceRevisionId: sourceRevision.revisionId,
    sourceRevisionNumber: sourceRevision.revisionNumber,
    sourceRevisionChecksum: sourceRevision.contentChecksum,
    sourceRevisionCreatedAtUtc: sourceRevision.createdAtUtc,
    sourceRevisionCreatedAtPst: sourceRevision.createdAtPst,
    targetKind: input.targetKind,
    targetId,
    targetLabel:
      input.targetLabel?.trim() || getPrimerTargetLabel(input.targetKind, targetId),
    originalContentExcerpt: extractSnapshotTargetExcerpt(
      sourceRevision,
      input.targetKind,
      targetId
    ),
    summary,
    reason: input.reason?.trim() || summary,
    requestedByLabel:
      input.requestedByLabel?.trim() || 'Local Operator (Unverified)',
    identityVerification: 'UNVERIFIED_IDENTITY',
    createdAtUtc: nowUtc,
    createdAtPst: nowPst,
    updatedAtUtc: nowUtc,
    updatedAtPst: nowPst,
    status: 'open',
    restoredDraftPrimerId: null,
    linkedReviewCommentId: input.linkedReviewCommentId ?? null,
    resolvedInRevisionId: null,
    resolvedInRevisionNumber: null,
    resolutionNote: null,
    resolvedAtUtc: null,
    resolvedAtPst: null,
    resolvedByLabel: null,
    reopenedCount: 0,
    reopenNote: null,
  });
}

export function attachLinkedReviewCommentId(
  request: PrimerCorrectionRequest,
  linkedReviewCommentId: string
): PrimerCorrectionRequest {
  return finalizeCorrectionChecksum({
    ...request,
    linkedReviewCommentId,
  });
}

export function markCorrectionDraftStarted(
  request: PrimerCorrectionRequest,
  restoredDraftPrimerId: string,
  nowUtcInput?: string
): PrimerCorrectionRequest {
  const draftId = restoredDraftPrimerId.trim();
  if (!draftId) {
    throw new Error('A restored draft primer ID is required to start draft correction.');
  }
  const nowUtc = nowUtcInput ?? new Date().toISOString();
  const nowPst = formatUtcAsPst(nowUtc);
  return finalizeCorrectionChecksum({
    ...request,
    status: 'draft-in-progress',
    restoredDraftPrimerId: draftId,
    updatedAtUtc: nowUtc,
    updatedAtPst: nowPst,
  });
}

export function resolveCorrectionRequestItem(
  request: PrimerCorrectionRequest,
  resolution: {
    resolutionNote: string;
    resolvedInRevision?: PrimerRevisionRecord | null;
    resolvedByLabel?: string;
    nowUtc?: string;
  }
): PrimerCorrectionRequest {
  const note = resolution.resolutionNote.trim();
  if (!note) {
    throw new Error(
      'A mandatory resolution note is required before closing a correction request.'
    );
  }
  const targetRev = resolution.resolvedInRevision ?? null;
  if (targetRev) {
    if (!verifyPrimerRevisionChecksum(targetRev)) {
      throw new Error(
        `Resolved Revision #${targetRev.revisionNumber} failed snapshot checksum verification.`
      );
    }
    if (targetRev.revisionId === request.sourceRevisionId) {
      throw new Error(
        `Correction request must resolve in a new revision snapshot rather than original Revision #${request.sourceRevisionNumber} (${request.sourceRevisionId}). Save a new revision first.`
      );
    }
  }

  const nowUtc = resolution.nowUtc ?? new Date().toISOString();
  const nowPst = formatUtcAsPst(nowUtc);
  const resolvedBy =
    resolution.resolvedByLabel?.trim() || 'Local Operator (Unverified)';

  return finalizeCorrectionChecksum({
    ...request,
    status: 'resolved',
    resolvedInRevisionId: targetRev ? targetRev.revisionId : request.resolvedInRevisionId,
    resolvedInRevisionNumber: targetRev
      ? targetRev.revisionNumber
      : request.resolvedInRevisionNumber,
    resolutionNote: note,
    resolvedAtUtc: nowUtc,
    resolvedAtPst: nowPst,
    resolvedByLabel: resolvedBy,
    updatedAtUtc: nowUtc,
    updatedAtPst: nowPst,
  });
}

export function reopenCorrectionRequestItem(
  request: PrimerCorrectionRequest,
  reopenNote?: string,
  nowUtcInput?: string
): PrimerCorrectionRequest {
  const nowUtc = nowUtcInput ?? new Date().toISOString();
  const nowPst = formatUtcAsPst(nowUtc);
  return finalizeCorrectionChecksum({
    ...request,
    status: 'reopened',
    reopenedCount: request.reopenedCount + 1,
    reopenNote: reopenNote?.trim() || 'Reopened for additional snapshot verification',
    updatedAtUtc: nowUtc,
    updatedAtPst: nowPst,
  });
}

export type SourceSnapshotIntegrityStatus =
  | 'verified'
  | 'missing-snapshot'
  | 'checksum-mismatch';

export function verifyOriginalSnapshotIntegrity(
  request: PrimerCorrectionRequest,
  revisions: PrimerRevisionRecord[]
): {
  status: SourceSnapshotIntegrityStatus;
  sourceRevision: PrimerRevisionRecord | null;
  detail: string;
} {
  const match =
    revisions.find((r) => r.revisionId === request.sourceRevisionId) ?? null;
  if (!match) {
    return {
      status: 'missing-snapshot',
      sourceRevision: null,
      detail: `Original snapshot Rev #${request.sourceRevisionNumber} (${request.sourceRevisionId}) is not present in the local archive.`,
    };
  }
  if (
    !verifyPrimerRevisionChecksum(match) ||
    match.contentChecksum !== request.sourceRevisionChecksum
  ) {
    return {
      status: 'checksum-mismatch',
      sourceRevision: match,
      detail: `Original snapshot Rev #${match.revisionNumber} checksum mismatch detected (${match.contentChecksum} ≠ ${request.sourceRevisionChecksum}).`,
    };
  }
  return {
    status: 'verified',
    sourceRevision: match,
    detail: `Original snapshot Rev #${match.revisionNumber} intact and unmodified (${match.contentChecksum.slice(0, 10)}).`,
  };
}

// =============================================================================
// PERSISTENCE STORE (IndexedDB with localStorage/memory fallback)
// =============================================================================

export interface PrimerCorrectionRequestStore {
  listRequests(): Promise<PrimerCorrectionRequest[]>;
  saveRequest(request: PrimerCorrectionRequest): Promise<void>;
  deleteRequest(requestId: string): Promise<void>;
}

export function createMemoryCorrectionRequestStore(
  initial: PrimerCorrectionRequest[] = []
): PrimerCorrectionRequestStore {
  const map = new Map<string, PrimerCorrectionRequest>();
  for (const r of initial) {
    map.set(r.requestId, r);
  }
  return {
    async listRequests() {
      return Array.from(map.values()).sort((a, b) =>
        b.createdAtUtc.localeCompare(a.createdAtUtc)
      );
    },
    async saveRequest(request) {
      map.set(request.requestId, request);
    },
    async deleteRequest(requestId) {
      map.delete(requestId);
    },
  };
}

function readFallbackStorage(): PrimerCorrectionRequest[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(PRIMER_CORRECTION_FALLBACK_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PrimerCorrectionRequest[]) : [];
  } catch {
    return [];
  }
}

function writeFallbackStorage(items: PrimerCorrectionRequest[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(
      PRIMER_CORRECTION_FALLBACK_STORAGE_KEY,
      JSON.stringify(items)
    );
  } catch {
    // Ignore storage quota failure
  }
}

function openCorrectionDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(PRIMER_CORRECTION_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PRIMER_CORRECTION_STORE_NAME)) {
        const store = db.createObjectStore(PRIMER_CORRECTION_STORE_NAME, {
          keyPath: 'requestId',
        });
        store.createIndex('eventId', 'eventId', { unique: false });
        store.createIndex('sourceRevisionId', 'sourceRevisionId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed opening IndexedDB'));
  });
}

let cachedCorrectionStore: PrimerCorrectionRequestStore | null = null;

export function getPrimerCorrectionRequestStore(): PrimerCorrectionRequestStore {
  if (cachedCorrectionStore) return cachedCorrectionStore;
  if (typeof indexedDB === 'undefined') {
    cachedCorrectionStore = {
      async listRequests() {
        return readFallbackStorage().sort((a, b) =>
          b.createdAtUtc.localeCompare(a.createdAtUtc)
        );
      },
      async saveRequest(request) {
        const all = readFallbackStorage().filter(
          (r) => r.requestId !== request.requestId
        );
        writeFallbackStorage([request, ...all]);
      },
      async deleteRequest(requestId) {
        writeFallbackStorage(
          readFallbackStorage().filter((r) => r.requestId !== requestId)
        );
      },
    };
    return cachedCorrectionStore;
  }

  cachedCorrectionStore = {
    async listRequests() {
      try {
        const db = await openCorrectionDb();
        return await new Promise<PrimerCorrectionRequest[]>((resolve, reject) => {
          const tx = db.transaction(PRIMER_CORRECTION_STORE_NAME, 'readonly');
          const store = tx.objectStore(PRIMER_CORRECTION_STORE_NAME);
          const req = store.getAll();
          req.onsuccess = () => {
            const list = (req.result as PrimerCorrectionRequest[]) ?? [];
            resolve(list.sort((a, b) => b.createdAtUtc.localeCompare(a.createdAtUtc)));
          };
          req.onerror = () => reject(req.error);
        });
      } catch {
        return readFallbackStorage().sort((a, b) =>
          b.createdAtUtc.localeCompare(a.createdAtUtc)
        );
      }
    },
    async saveRequest(request) {
      try {
        const db = await openCorrectionDb();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(PRIMER_CORRECTION_STORE_NAME, 'readwrite');
          const store = tx.objectStore(PRIMER_CORRECTION_STORE_NAME);
          const req = store.put(request);
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        });
      } catch {
        const all = readFallbackStorage().filter(
          (r) => r.requestId !== request.requestId
        );
        writeFallbackStorage([request, ...all]);
      }
    },
    async deleteRequest(requestId) {
      try {
        const db = await openCorrectionDb();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(PRIMER_CORRECTION_STORE_NAME, 'readwrite');
          const store = tx.objectStore(PRIMER_CORRECTION_STORE_NAME);
          const req = store.delete(requestId);
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        });
      } catch {
        writeFallbackStorage(
          readFallbackStorage().filter((r) => r.requestId !== requestId)
        );
      }
    },
  };
  return cachedCorrectionStore;
}
