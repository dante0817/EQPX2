import type { PrimerSectionKey } from './primerScientificNarratives';
import {
  sanitizeUntrustedTextValue,
  type R2FindingCategory,
} from './primerResearchExtraction';
import { safeJsonParseChecked } from './primerReviewPackage';

export const RESEARCH_TRANSFER_DB_NAME = 'eqp_primer_research_transfers_v1';
export const RESEARCH_TRANSFER_DB_VERSION = 1;
export const RESEARCH_TRANSFER_STORE_NAME = 'transfer_audit';

export const R3_LOCAL_AUDIT_DISCLAIMER =
  'Stored in local browser IndexedDB as an append-only local operator log (NOT a tamper-proof server ledger, formal institutional signature, or publication approval).';

export type R3AuditActionKind =
  | 'transfer-applied'
  | 'transfer-rejected'
  | 'event-match-resolved'
  | 'section-synced';

export type R3CollisionResolutionMode =
  | 'add-separate'
  | 'keep-existing'
  | 'replace-with-confirmation';

export interface R3TransferAuditLogEntry {
  schemaVersion: '1.0';
  auditId: string;
  action: R3AuditActionKind;
  linkedEqpEventId: string;
  primerDocumentId: string | null;
  findingId: string | null;
  sourceId: string;
  sourceTitle: string;
  sourceVersionNumber: number;
  sourceContentSha256: string | null;
  findingCategory: R2FindingCategory | null;
  targetSectionId: PrimerSectionKey | null;
  destinationFieldPath: string | null;
  appliedAsState: 'preliminary-review' | 'verified-fact' | null;
  resolutionMode: R3CollisionResolutionMode | 'reject' | null;
  replacementReason: string | null;
  priorValueSummary: string | null;
  newValueSummary: string | null;
  evidenceLocatorLabel: string | null;
  evidencePassageQuote: string | null;
  preservedEditedSections: boolean;
  operatorLabel: string;
  identityStatus: 'UNVERIFIED_OPERATOR';
  recordedAtUtc: string;
  notes: string;
  isTamperProof: false;
  storageNote: string;
}

export interface ResearchTransferStoreDiagnostics {
  backend: 'indexeddb' | 'memory-fallback';
  dbName: string;
  totalCount: number;
  isolatedFromPrimerLocalStorage: true;
  isolatedFromR1AndR2Stores: true;
  isTamperProof: false;
}

export interface PrimerResearchTransferStore {
  listRecords(filter?: {
    linkedEqpEventId?: string;
    action?: R3AuditActionKind;
  }): Promise<R3TransferAuditLogEntry[]>;
  appendAuditRecord(entry: R3TransferAuditLogEntry): Promise<R3TransferAuditLogEntry>;
  exportEventHistoryJson(linkedEqpEventId: string): Promise<string>;
  getDiagnostics(): Promise<ResearchTransferStoreDiagnostics>;
}

function sortRecordsNewestFirst(
  list: R3TransferAuditLogEntry[]
): R3TransferAuditLogEntry[] {
  return [...list].sort((a, b) => b.recordedAtUtc.localeCompare(a.recordedAtUtc));
}

export function createMemoryResearchTransferStore(
  initial: R3TransferAuditLogEntry[] = []
): PrimerResearchTransferStore {
  const records = new Map<string, R3TransferAuditLogEntry>();
  for (const r of initial) {
    records.set(r.auditId, structuredClone(r));
  }

  return {
    async listRecords(filter) {
      let arr = Array.from(records.values());
      if (filter?.linkedEqpEventId) {
        arr = arr.filter((r) => r.linkedEqpEventId === filter.linkedEqpEventId);
      }
      if (filter?.action) {
        arr = arr.filter((r) => r.action === filter.action);
      }
      return sortRecordsNewestFirst(arr).map((r) => structuredClone(r));
    },

    async appendAuditRecord(entry) {
      if (records.has(entry.auditId)) {
        throw new Error(
          `Append-only violation: audit record "${entry.auditId}" already exists.`
        );
      }
      const copy: R3TransferAuditLogEntry = {
        ...structuredClone(entry),
        isTamperProof: false,
        identityStatus: 'UNVERIFIED_OPERATOR',
        storageNote: R3_LOCAL_AUDIT_DISCLAIMER,
      };
      records.set(copy.auditId, copy);
      return structuredClone(copy);
    },

    async exportEventHistoryJson(linkedEqpEventId) {
      const rows = await this.listRecords({ linkedEqpEventId });
      return JSON.stringify(
        {
          schemaVersion: '1.0',
          exportedAtUtc: new Date().toISOString(),
          linkedEqpEventId,
          isTamperProof: false,
          disclaimer: R3_LOCAL_AUDIT_DISCLAIMER,
          records: rows,
        },
        null,
        2
      );
    },

    async getDiagnostics() {
      return {
        backend: 'memory-fallback',
        dbName: RESEARCH_TRANSFER_DB_NAME,
        totalCount: records.size,
        isolatedFromPrimerLocalStorage: true,
        isolatedFromR1AndR2Stores: true,
        isTamperProof: false,
      };
    },
  };
}

function openTransferDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || typeof window.indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = window.indexedDB.open(
      RESEARCH_TRANSFER_DB_NAME,
      RESEARCH_TRANSFER_DB_VERSION
    );
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(RESEARCH_TRANSFER_STORE_NAME)) {
        const store = db.createObjectStore(RESEARCH_TRANSFER_STORE_NAME, {
          keyPath: 'auditId',
        });
        store.createIndex('byLinkedEqpEventId', 'linkedEqpEventId', { unique: false });
        store.createIndex('byFindingId', 'findingId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(req.error ?? new Error('Failed to open R3 Transfer History IndexedDB'));
  });
}

export function createIndexedDbResearchTransferStore(): PrimerResearchTransferStore {
  const memoryFallback = createMemoryResearchTransferStore();
  let useFallback =
    typeof window === 'undefined' || typeof window.indexedDB === 'undefined';

  async function withStore<T>(
    mode: IDBTransactionMode,
    op: (store: IDBObjectStore) => Promise<T>,
    fallbackFn: () => Promise<T>
  ): Promise<T> {
    if (useFallback) return fallbackFn();
    try {
      const db = await openTransferDb();
      try {
        const tx = db.transaction(RESEARCH_TRANSFER_STORE_NAME, mode);
        const store = tx.objectStore(RESEARCH_TRANSFER_STORE_NAME);
        return await op(store);
      } finally {
        db.close();
      }
    } catch {
      useFallback = true;
      return fallbackFn();
    }
  }

  const getAllRaw = (): Promise<R3TransferAuditLogEntry[]> =>
    withStore(
      'readonly',
      (store) =>
        new Promise<R3TransferAuditLogEntry[]>((resolve, reject) => {
          const req = store.getAll();
          req.onsuccess = () => resolve((req.result as R3TransferAuditLogEntry[]) ?? []);
          req.onerror = () => reject(req.error);
        }),
      () => memoryFallback.listRecords()
    );

  return {
    async listRecords(filter) {
      let rows = await getAllRaw();
      if (filter?.linkedEqpEventId) {
        rows = rows.filter((r) => r.linkedEqpEventId === filter.linkedEqpEventId);
      }
      if (filter?.action) {
        rows = rows.filter((r) => r.action === filter.action);
      }
      return sortRecordsNewestFirst(rows);
    },

    async appendAuditRecord(entry) {
      if (useFallback) return memoryFallback.appendAuditRecord(entry);
      const copy: R3TransferAuditLogEntry = {
        ...structuredClone(entry),
        isTamperProof: false,
        identityStatus: 'UNVERIFIED_OPERATOR',
        storageNote: R3_LOCAL_AUDIT_DISCLAIMER,
      };
      return withStore(
        'readwrite',
        (store) =>
          new Promise<R3TransferAuditLogEntry>((resolve, reject) => {
            const req = store.add(copy);
            req.onsuccess = () => resolve(structuredClone(copy));
            req.onerror = () => reject(req.error);
          }),
        () => memoryFallback.appendAuditRecord(copy)
      );
    },

    async exportEventHistoryJson(linkedEqpEventId) {
      const rows = await this.listRecords({ linkedEqpEventId });
      return JSON.stringify(
        {
          schemaVersion: '1.0',
          exportedAtUtc: new Date().toISOString(),
          linkedEqpEventId,
          isTamperProof: false,
          disclaimer: R3_LOCAL_AUDIT_DISCLAIMER,
          records: rows,
        },
        null,
        2
      );
    },

    async getDiagnostics() {
      const rows = await getAllRaw();
      return {
        backend: useFallback ? 'memory-fallback' : 'indexeddb',
        dbName: RESEARCH_TRANSFER_DB_NAME,
        totalCount: rows.length,
        isolatedFromPrimerLocalStorage: true,
        isolatedFromR1AndR2Stores: true,
        isTamperProof: false,
      };
    },
  };
}

const VALID_ACTIONS = new Set<R3AuditActionKind>([
  'transfer-applied',
  'transfer-rejected',
  'event-match-resolved',
  'section-synced',
]);

export function validateAndImportTransferHistoryJson(
  rawJson: string
):
  | { ok: true; records: R3TransferAuditLogEntry[] }
  | { ok: false; error: string } {
  const parsed = safeJsonParseChecked(rawJson);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const val = parsed.value as { records?: unknown };
  if (!val || !Array.isArray(val.records)) {
    return {
      ok: false,
      error: 'Transfer history JSON must contain a "records" array.',
    };
  }

  const sanitized: R3TransferAuditLogEntry[] = [];
  for (let i = 0; i < val.records.length; i++) {
    const raw = val.records[i] as Record<string, unknown>;
    if (!raw || typeof raw !== 'object') {
      return { ok: false, error: `Invalid audit record at index ${i}.` };
    }
    if (
      typeof raw.auditId !== 'string' ||
      !raw.auditId.trim() ||
      typeof raw.action !== 'string' ||
      !VALID_ACTIONS.has(raw.action as R3AuditActionKind) ||
      typeof raw.linkedEqpEventId !== 'string' ||
      !raw.linkedEqpEventId.trim() ||
      typeof raw.sourceId !== 'string' ||
      typeof raw.recordedAtUtc !== 'string'
    ) {
      return {
        ok: false,
        error: `Audit record at index ${i} failed required schema validation.`,
      };
    }

    sanitized.push({
      schemaVersion: '1.0',
      auditId: sanitizeUntrustedTextValue(raw.auditId, 160),
      action: raw.action as R3AuditActionKind,
      linkedEqpEventId: sanitizeUntrustedTextValue(raw.linkedEqpEventId, 160),
      primerDocumentId:
        typeof raw.primerDocumentId === 'string'
          ? sanitizeUntrustedTextValue(raw.primerDocumentId, 160)
          : null,
      findingId:
        typeof raw.findingId === 'string'
          ? sanitizeUntrustedTextValue(raw.findingId, 160)
          : null,
      sourceId: sanitizeUntrustedTextValue(raw.sourceId, 160),
      sourceTitle: sanitizeUntrustedTextValue(raw.sourceTitle ?? '', 260),
      sourceVersionNumber:
        typeof raw.sourceVersionNumber === 'number' &&
        Number.isFinite(raw.sourceVersionNumber)
          ? raw.sourceVersionNumber
          : 1,
      sourceContentSha256:
        typeof raw.sourceContentSha256 === 'string'
          ? sanitizeUntrustedTextValue(raw.sourceContentSha256, 128)
          : null,
      findingCategory:
        typeof raw.findingCategory === 'string'
          ? (sanitizeUntrustedTextValue(raw.findingCategory, 80) as R2FindingCategory)
          : null,
      targetSectionId:
        typeof raw.targetSectionId === 'string'
          ? (sanitizeUntrustedTextValue(raw.targetSectionId, 60) as PrimerSectionKey)
          : null,
      destinationFieldPath:
        typeof raw.destinationFieldPath === 'string'
          ? sanitizeUntrustedTextValue(raw.destinationFieldPath, 160)
          : null,
      appliedAsState:
        raw.appliedAsState === 'verified-fact'
          ? 'verified-fact'
          : raw.appliedAsState === 'preliminary-review'
            ? 'preliminary-review'
            : null,
      resolutionMode:
        raw.resolutionMode === 'add-separate' ||
        raw.resolutionMode === 'keep-existing' ||
        raw.resolutionMode === 'replace-with-confirmation' ||
        raw.resolutionMode === 'reject'
          ? raw.resolutionMode
          : null,
      replacementReason:
        typeof raw.replacementReason === 'string'
          ? sanitizeUntrustedTextValue(raw.replacementReason, 500)
          : null,
      priorValueSummary:
        typeof raw.priorValueSummary === 'string'
          ? sanitizeUntrustedTextValue(raw.priorValueSummary, 800)
          : null,
      newValueSummary:
        typeof raw.newValueSummary === 'string'
          ? sanitizeUntrustedTextValue(raw.newValueSummary, 800)
          : null,
      evidenceLocatorLabel:
        typeof raw.evidenceLocatorLabel === 'string'
          ? sanitizeUntrustedTextValue(raw.evidenceLocatorLabel, 240)
          : null,
      evidencePassageQuote:
        typeof raw.evidencePassageQuote === 'string'
          ? sanitizeUntrustedTextValue(raw.evidencePassageQuote, 800)
          : null,
      preservedEditedSections: Boolean(raw.preservedEditedSections),
      operatorLabel:
        sanitizeUntrustedTextValue(raw.operatorLabel ?? '', 120) ||
        'Local Operator (Unverified)',
      identityStatus: 'UNVERIFIED_OPERATOR',
      recordedAtUtc: sanitizeUntrustedTextValue(raw.recordedAtUtc, 80),
      notes: sanitizeUntrustedTextValue(raw.notes ?? '', 600),
      isTamperProof: false,
      storageNote: R3_LOCAL_AUDIT_DISCLAIMER,
    });
  }

  return { ok: true, records: sanitized };
}

let singletonTransferStore: PrimerResearchTransferStore | null = null;
export function getPrimerResearchTransferStore(): PrimerResearchTransferStore {
  if (!singletonTransferStore) {
    singletonTransferStore = createIndexedDbResearchTransferStore();
  }
  return singletonTransferStore;
}
