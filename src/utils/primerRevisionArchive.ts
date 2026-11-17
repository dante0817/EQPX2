import {
  DEFAULT_PRIMER_PRESENTATION_CONFIG,
  normalizePresentationConfig,
} from './primerPresentation.ts';
import {
  computeCanonicalChecksum,
  deepFreezeRevision,
  PRIMER_REVISION_SCHEMA_VERSION,
  sanitizePrimerDocumentForArchive,
  verifyPrimerRevisionChecksum,
  type PrimerRevisionRecord,
} from './primerRevisions.ts';
import { formatUtcAsPst } from './primerSequenceIntegration.ts';

export const PRIMER_ARCHIVE_DB_NAME = 'eqp_primer_revisions_archive_v1';
export const PRIMER_ARCHIVE_DB_VERSION = 1;
export const PRIMER_ARCHIVE_STORE_NAME = 'revisions';
export const PRIMER_ARCHIVE_BUNDLE_TYPE = 'eqp-primer-revision-archive' as const;
export const PRIMER_ARCHIVE_BUNDLE_SCHEMA_VERSION = '1.0' as const;

export const LOCAL_ARCHIVE_INTEGRITY_DISCLAIMER =
  'Local browser archive (IndexedDB & portable JSON). Supports offline revision preservation and checksum integrity checks against accidental corruption, but is NOT a tamper-proof institutional audit log or formal publication authorization.';

export interface LocalStorageCapacityReport {
  available: boolean;
  itemCount: number;
  usedBytes: number;
  usedKb: number;
  estimatedLimitBytes: number;
  percentUsed: number;
  primerDraftsBytes: number;
  nearCapacity: boolean;
}

export function inspectLocalStorageCapacity(): LocalStorageCapacityReport {
  const estimatedLimitBytes = 5 * 1024 * 1024; // Typical browser 5 MiB quota
  if (typeof window === 'undefined' || !window.localStorage) {
    return {
      available: false,
      itemCount: 0,
      usedBytes: 0,
      usedKb: 0,
      estimatedLimitBytes,
      percentUsed: 0,
      primerDraftsBytes: 0,
      nearCapacity: false,
    };
  }
  try {
    let usedBytes = 0;
    let primerDraftsBytes = 0;
    const len = window.localStorage.length;
    for (let i = 0; i < len; i++) {
      const k = window.localStorage.key(i) ?? '';
      const v = window.localStorage.getItem(k) ?? '';
      const bytes = (k.length + v.length) * 2;
      usedBytes += bytes;
      if (k === 'eqp_primer_drafts_v1') {
        primerDraftsBytes = bytes;
      }
    }
    const percentUsed = Math.min(100, Math.round((usedBytes / estimatedLimitBytes) * 1000) / 10);
    return {
      available: true,
      itemCount: len,
      usedBytes,
      usedKb: Math.round((usedBytes / 1024) * 10) / 10,
      estimatedLimitBytes,
      percentUsed,
      primerDraftsBytes,
      nearCapacity: percentUsed >= 70,
    };
  } catch {
    return {
      available: false,
      itemCount: 0,
      usedBytes: 0,
      usedKb: 0,
      estimatedLimitBytes,
      percentUsed: 0,
      primerDraftsBytes: 0,
      nearCapacity: false,
    };
  }
}

export interface PrimerRevisionArchiveBundle {
  schemaVersion: '1.0';
  bundleType: 'eqp-primer-revision-archive';
  exportedAtUtc: string;
  exportedAtPst: string;
  sourceApplication: string;
  integrityNote: string;
  revisionCount: number;
  eventIds: string[];
  primerDocumentIds: string[];
  archiveChecksum: string;
  revisions: PrimerRevisionRecord[];
}

export function buildPrimerRevisionArchiveBundle(
  revisions: PrimerRevisionRecord[],
  options: { exportedAtUtc?: string } = {}
): PrimerRevisionArchiveBundle {
  const exportedAtUtc = options.exportedAtUtc ?? new Date().toISOString();
  const sanitizedRevisions = revisions
    .map((rev) => ({
      ...rev,
      snapshot: sanitizePrimerDocumentForArchive(rev.snapshot),
    }))
    .sort((a, b) => {
      if (a.primerDocumentId !== b.primerDocumentId) {
        return a.primerDocumentId.localeCompare(b.primerDocumentId);
      }
      return a.revisionNumber - b.revisionNumber;
    });

  const eventIds = Array.from(new Set(sanitizedRevisions.map((r) => r.eventId)));
  const primerDocumentIds = Array.from(
    new Set(sanitizedRevisions.map((r) => r.primerDocumentId))
  );

  const archiveChecksum = computeCanonicalChecksum({
    schemaVersion: PRIMER_ARCHIVE_BUNDLE_SCHEMA_VERSION,
    bundleType: PRIMER_ARCHIVE_BUNDLE_TYPE,
    revisions: sanitizedRevisions.map((r) => ({
      revisionId: r.revisionId,
      revisionNumber: r.revisionNumber,
      primerDocumentId: r.primerDocumentId,
      eventId: r.eventId,
      contentChecksum: r.contentChecksum,
    })),
  });

  return {
    schemaVersion: PRIMER_ARCHIVE_BUNDLE_SCHEMA_VERSION,
    bundleType: PRIMER_ARCHIVE_BUNDLE_TYPE,
    exportedAtUtc,
    exportedAtPst: formatUtcAsPst(exportedAtUtc),
    sourceApplication: 'EQP Modern Earthquake Primer Workstation',
    integrityNote: LOCAL_ARCHIVE_INTEGRITY_DISCLAIMER,
    revisionCount: sanitizedRevisions.length,
    eventIds,
    primerDocumentIds,
    archiveChecksum,
    revisions: sanitizedRevisions,
  };
}

export function serializePrimerRevisionArchive(
  revisions: PrimerRevisionRecord[],
  options: { exportedAtUtc?: string } = {}
): string {
  const bundle = buildPrimerRevisionArchiveBundle(revisions, options);
  return JSON.stringify(bundle, null, 2);
}

export interface PrimerArchiveParseResult {
  ok: boolean;
  bundle: PrimerRevisionArchiveBundle | null;
  revisions: PrimerRevisionRecord[];
  errors: string[];
  warnings: string[];
}

const FORBIDDEN_JSON_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function containsForbiddenKeys(val: unknown, depth = 0): boolean {
  if (depth > 40) return true;
  if (Array.isArray(val)) {
    return val.some((item) => containsForbiddenKeys(item, depth + 1));
  }
  if (val !== null && typeof val === 'object') {
    for (const key of Object.keys(val as Record<string, unknown>)) {
      if (FORBIDDEN_JSON_KEYS.has(key)) return true;
      if (containsForbiddenKeys((val as Record<string, unknown>)[key], depth + 1)) {
        return true;
      }
    }
  }
  return false;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isRecordObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function validateAndParsePrimerRevisionArchive(
  rawJsonText: string
): PrimerArchiveParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (typeof rawJsonText !== 'string' || !rawJsonText.trim()) {
    return {
      ok: false,
      bundle: null,
      revisions: [],
      errors: ['Archive input is empty. Supply a valid JSON revision archive file.'],
      warnings,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJsonText);
  } catch (err) {
    return {
      ok: false,
      bundle: null,
      revisions: [],
      errors: [
        `Malformed JSON archive: ${err instanceof Error ? err.message : 'parse error'}`,
      ],
      warnings,
    };
  }

  if (containsForbiddenKeys(parsed)) {
    return {
      ok: false,
      bundle: null,
      revisions: [],
      errors: ['Rejected archive containing disallowed prototype/constructor keys or excessive nesting.'],
      warnings,
    };
  }

  if (!isRecordObject(parsed)) {
    return {
      ok: false,
      bundle: null,
      revisions: [],
      errors: ['Invalid archive root: expected a JSON object.'],
      warnings,
    };
  }

  if (parsed.bundleType !== PRIMER_ARCHIVE_BUNDLE_TYPE) {
    errors.push(
      `Incompatible archive bundleType: expected "${PRIMER_ARCHIVE_BUNDLE_TYPE}", received "${String(
        parsed.bundleType ?? 'missing'
      )}".`
    );
  }

  if (parsed.schemaVersion !== PRIMER_ARCHIVE_BUNDLE_SCHEMA_VERSION) {
    errors.push(
      `Unsupported archive schemaVersion: expected "${PRIMER_ARCHIVE_BUNDLE_SCHEMA_VERSION}", received "${String(
        parsed.schemaVersion ?? 'missing'
      )}".`
    );
  }

  if (!Array.isArray(parsed.revisions)) {
    errors.push('Archive "revisions" field must be an array.');
  }

  if (errors.length > 0) {
    return { ok: false, bundle: null, revisions: [], errors, warnings };
  }

  const rawRevisions = parsed.revisions as unknown[];
  const seenIds = new Set<string>();
  const validatedRevisions: PrimerRevisionRecord[] = [];

  for (let i = 0; i < rawRevisions.length; i++) {
    const item = rawRevisions[i];
    const prefix = `Revision[${i}]`;
    if (!isRecordObject(item)) {
      errors.push(`${prefix}: expected object.`);
      continue;
    }
    if (item.schemaVersion !== PRIMER_REVISION_SCHEMA_VERSION) {
      errors.push(`${prefix}: unsupported schemaVersion "${String(item.schemaVersion)}".`);
      continue;
    }
    if (
      !isNonEmptyString(item.revisionId) ||
      !isNonEmptyString(item.primerDocumentId) ||
      !isNonEmptyString(item.eventId) ||
      !isNonEmptyString(item.createdAtUtc) ||
      !isNonEmptyString(item.contentChecksum)
    ) {
      errors.push(`${prefix}: missing required revision identifiers, timestamps, or checksum.`);
      continue;
    }
    if (
      typeof item.revisionNumber !== 'number' ||
      !Number.isInteger(item.revisionNumber) ||
      item.revisionNumber < 1
    ) {
      errors.push(`${prefix}: revisionNumber must be a positive integer.`);
      continue;
    }
    if (seenIds.has(item.revisionId)) {
      errors.push(`${prefix}: duplicate revisionId "${item.revisionId}" inside archive.`);
      continue;
    }
    seenIds.add(item.revisionId);

    if (!isRecordObject(item.snapshot)) {
      errors.push(`${prefix}: missing PrimerDocument snapshot object.`);
      continue;
    }
    const snap = item.snapshot;
    if (
      snap.schemaVersion !== '1.0' ||
      !isNonEmptyString(snap.id) ||
      !isNonEmptyString(snap.eventId) ||
      !Array.isArray(snap.sections) ||
      snap.sections.length === 0 ||
      !isRecordObject(snap.extracted)
    ) {
      errors.push(`${prefix}: malformed PrimerDocument snapshot structure.`);
      continue;
    }

    if (snap.status !== 'draft') {
      errors.push(
        `${prefix}: rejected snapshot status "${String(
          snap.status
        )}" (unapproved draft status required).`
      );
      continue;
    }

    const candidateRecord = item as unknown as PrimerRevisionRecord;
    const sanitizedSnap = sanitizePrimerDocumentForArchive(candidateRecord.snapshot);
    const normalizedRecord: PrimerRevisionRecord = {
      ...candidateRecord,
      createdAtPst: isNonEmptyString(candidateRecord.createdAtPst)
        ? candidateRecord.createdAtPst
        : formatUtcAsPst(candidateRecord.createdAtUtc),
      description:
        typeof candidateRecord.description === 'string'
          ? candidateRecord.description
          : `Revision #${candidateRecord.revisionNumber}`,
      presentationConfig: normalizePresentationConfig(
        candidateRecord.presentationConfig ?? DEFAULT_PRIMER_PRESENTATION_CONFIG
      ),
      snapshot: sanitizedSnap,
    };

    if (!verifyPrimerRevisionChecksum(normalizedRecord)) {
      errors.push(
        `${prefix} (${normalizedRecord.revisionId}): checksum verification failed; archive may be corrupted or modified.`
      );
      continue;
    }

    validatedRevisions.push(deepFreezeRevision(normalizedRecord));
  }

  if (errors.length > 0) {
    return { ok: false, bundle: null, revisions: [], errors, warnings };
  }

  if (isNonEmptyString(parsed.archiveChecksum)) {
    const expectedArchiveChecksum = computeCanonicalChecksum({
      schemaVersion: PRIMER_ARCHIVE_BUNDLE_SCHEMA_VERSION,
      bundleType: PRIMER_ARCHIVE_BUNDLE_TYPE,
      revisions: validatedRevisions.map((r) => ({
        revisionId: r.revisionId,
        revisionNumber: r.revisionNumber,
        primerDocumentId: r.primerDocumentId,
        eventId: r.eventId,
        contentChecksum: r.contentChecksum,
      })),
    });
    if (parsed.archiveChecksum !== expectedArchiveChecksum) {
      return {
        ok: false,
        bundle: null,
        revisions: [],
        errors: [
          'Archive bundle checksum mismatch: archive manifest does not match contained revisions.',
        ],
        warnings,
      };
    }
  } else {
    warnings.push('Archive lacked top-level archiveChecksum; individual revision checksums passed.');
  }

  const normalizedBundle: PrimerRevisionArchiveBundle = {
    schemaVersion: PRIMER_ARCHIVE_BUNDLE_SCHEMA_VERSION,
    bundleType: PRIMER_ARCHIVE_BUNDLE_TYPE,
    exportedAtUtc: isNonEmptyString(parsed.exportedAtUtc)
      ? parsed.exportedAtUtc
      : new Date().toISOString(),
    exportedAtPst: isNonEmptyString(parsed.exportedAtPst)
      ? parsed.exportedAtPst
      : formatUtcAsPst(new Date().toISOString()),
    sourceApplication: isNonEmptyString(parsed.sourceApplication)
      ? parsed.sourceApplication
      : 'EQP Modern',
    integrityNote: LOCAL_ARCHIVE_INTEGRITY_DISCLAIMER,
    revisionCount: validatedRevisions.length,
    eventIds: Array.from(new Set(validatedRevisions.map((r) => r.eventId))),
    primerDocumentIds: Array.from(
      new Set(validatedRevisions.map((r) => r.primerDocumentId))
    ),
    archiveChecksum: isNonEmptyString(parsed.archiveChecksum)
      ? parsed.archiveChecksum
      : '',
    revisions: validatedRevisions,
  };

  return {
    ok: true,
    bundle: normalizedBundle,
    revisions: validatedRevisions,
    errors,
    warnings,
  };
}

// =============================================================================
// STORAGE ADAPTER: IndexedDB Primary + Safe In-Memory Fallback (Headless / Node)
// =============================================================================

export interface PrimerRevisionArchiveDiagnostics {
  backend: 'indexeddb' | 'memory-fallback';
  totalRevisions: number;
  approximateArchiveBytes: number;
  localStorageReport: LocalStorageCapacityReport;
  integrityDisclaimer: string;
}

export interface PrimerRevisionArchiveStore {
  readonly backend: 'indexeddb' | 'memory-fallback';
  listRevisions(filter?: {
    primerDocumentId?: string;
    eventId?: string;
  }): Promise<PrimerRevisionRecord[]>;
  getRevision(revisionId: string): Promise<PrimerRevisionRecord | null>;
  saveRevision(revision: PrimerRevisionRecord): Promise<PrimerRevisionRecord>;
  importArchiveJson(rawJsonText: string): Promise<{
    ok: boolean;
    importedCount: number;
    skippedDuplicateIds: string[];
    errors: string[];
    warnings: string[];
    allRevisions: PrimerRevisionRecord[];
  }>;
  getDiagnostics(): Promise<PrimerRevisionArchiveDiagnostics>;
}

function sortRevisionsChronologicalDesc(
  list: PrimerRevisionRecord[]
): PrimerRevisionRecord[] {
  return [...list].sort((a, b) => {
    const tDiff = Date.parse(b.createdAtUtc) - Date.parse(a.createdAtUtc);
    if (Number.isFinite(tDiff) && tDiff !== 0) return tDiff;
    return b.revisionNumber - a.revisionNumber;
  });
}

function prepareFrozenRecordForRead(rec: PrimerRevisionRecord): PrimerRevisionRecord {
  const sanitized = {
    ...rec,
    snapshot: sanitizePrimerDocumentForArchive(rec.snapshot),
  };
  return deepFreezeRevision(sanitized);
}

export function createMemoryRevisionStore(
  initialRevisions: PrimerRevisionRecord[] = []
): PrimerRevisionArchiveStore {
  const storeMap = new Map<string, PrimerRevisionRecord>();
  for (const r of initialRevisions) {
    storeMap.set(r.revisionId, prepareFrozenRecordForRead(r));
  }

  return {
    backend: 'memory-fallback',

    async listRevisions(filter) {
      const items = Array.from(storeMap.values()).filter((r) => {
        if (filter?.primerDocumentId && r.primerDocumentId !== filter.primerDocumentId) {
          return false;
        }
        if (filter?.eventId && r.eventId !== filter.eventId) {
          return false;
        }
        return true;
      });
      return sortRevisionsChronologicalDesc(items);
    },

    async getRevision(revisionId) {
      return storeMap.get(revisionId) ?? null;
    },

    async saveRevision(revision) {
      if (storeMap.has(revision.revisionId)) {
        throw new Error(
          `Revision ID "${revision.revisionId}" already exists. Historical revisions are immutable.`
        );
      }
      if (!verifyPrimerRevisionChecksum(revision)) {
        throw new Error(`Checksum invalid for revision "${revision.revisionId}".`);
      }
      const frozen = prepareFrozenRecordForRead(revision);
      storeMap.set(frozen.revisionId, frozen);
      return frozen;
    },

    async importArchiveJson(rawJsonText) {
      const parsed = validateAndParsePrimerRevisionArchive(rawJsonText);
      if (!parsed.ok) {
        return {
          ok: false,
          importedCount: 0,
          skippedDuplicateIds: [],
          errors: parsed.errors,
          warnings: parsed.warnings,
          allRevisions: sortRevisionsChronologicalDesc(Array.from(storeMap.values())),
        };
      }

      let importedCount = 0;
      const skippedDuplicateIds: string[] = [];
      for (const rev of parsed.revisions) {
        if (storeMap.has(rev.revisionId)) {
          skippedDuplicateIds.push(rev.revisionId);
          continue;
        }
        storeMap.set(rev.revisionId, prepareFrozenRecordForRead(rev));
        importedCount += 1;
      }

      return {
        ok: true,
        importedCount,
        skippedDuplicateIds,
        errors: [],
        warnings: parsed.warnings,
        allRevisions: sortRevisionsChronologicalDesc(Array.from(storeMap.values())),
      };
    },

    async getDiagnostics() {
      const all = Array.from(storeMap.values());
      const approximateArchiveBytes = new Blob([JSON.stringify(all)]).size;
      return {
        backend: 'memory-fallback',
        totalRevisions: all.length,
        approximateArchiveBytes,
        localStorageReport: inspectLocalStorageCapacity(),
        integrityDisclaimer: LOCAL_ARCHIVE_INTEGRITY_DISCLAIMER,
      };
    },
  };
}

function openPrimerArchiveIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable in this environment.'));
      return;
    }
    const req = indexedDB.open(PRIMER_ARCHIVE_DB_NAME, PRIMER_ARCHIVE_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PRIMER_ARCHIVE_STORE_NAME)) {
        const os = db.createObjectStore(PRIMER_ARCHIVE_STORE_NAME, {
          keyPath: 'revisionId',
        });
        os.createIndex('byPrimerDocumentId', 'primerDocumentId', { unique: false });
        os.createIndex('byEventId', 'eventId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(req.error ?? new Error('Failed to open Primer revision archive IndexedDB.'));
  });
}

export function createIndexedDbRevisionStore(): PrimerRevisionArchiveStore {
  const memoryFallback = createMemoryRevisionStore();
  let dbUnavailable = typeof indexedDB === 'undefined';

  async function withDb<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => Promise<T>
  ): Promise<T> {
    const db = await openPrimerArchiveIndexedDb();
    try {
      const tx = db.transaction(PRIMER_ARCHIVE_STORE_NAME, mode);
      const store = tx.objectStore(PRIMER_ARCHIVE_STORE_NAME);
      const result = await run(store);
      await new Promise<void>((res, rej) => {
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error ?? new Error('IndexedDB transaction failed.'));
        tx.onabort = () => rej(tx.error ?? new Error('IndexedDB transaction aborted.'));
      });
      return result;
    } finally {
      db.close();
    }
  }

  function idbReqToPromise<T>(req: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed.'));
    });
  }

  return {
    get backend() {
      return dbUnavailable ? 'memory-fallback' : 'indexeddb';
    },

    async listRevisions(filter) {
      if (dbUnavailable) return memoryFallback.listRevisions(filter);
      try {
        const all = await withDb('readonly', async (store) => {
          const rows = (await idbReqToPromise(store.getAll())) as PrimerRevisionRecord[];
          return rows.map(prepareFrozenRecordForRead);
        });
        const filtered = all.filter((r) => {
          if (filter?.primerDocumentId && r.primerDocumentId !== filter.primerDocumentId) {
            return false;
          }
          if (filter?.eventId && r.eventId !== filter.eventId) {
            return false;
          }
          return true;
        });
        return sortRevisionsChronologicalDesc(filtered);
      } catch {
        dbUnavailable = true;
        return memoryFallback.listRevisions(filter);
      }
    },

    async getRevision(revisionId) {
      if (dbUnavailable) return memoryFallback.getRevision(revisionId);
      try {
        return await withDb('readonly', async (store) => {
          const rec = (await idbReqToPromise(store.get(revisionId))) as
            | PrimerRevisionRecord
            | undefined;
          return rec ? prepareFrozenRecordForRead(rec) : null;
        });
      } catch {
        dbUnavailable = true;
        return memoryFallback.getRevision(revisionId);
      }
    },

    async saveRevision(revision) {
      if (!verifyPrimerRevisionChecksum(revision)) {
        throw new Error(`Checksum invalid for revision "${revision.revisionId}".`);
      }
      const cleanRecord: PrimerRevisionRecord = {
        ...revision,
        snapshot: sanitizePrimerDocumentForArchive(revision.snapshot),
      };
      if (dbUnavailable) return memoryFallback.saveRevision(cleanRecord);

      try {
        const saved = await withDb('readwrite', async (store) => {
          const existing = await idbReqToPromise(store.get(cleanRecord.revisionId));
          if (existing) {
            throw new Error(
              `Revision ID "${cleanRecord.revisionId}" already exists. Historical revisions are immutable.`
            );
          }
          await idbReqToPromise(store.add(cleanRecord));
          return prepareFrozenRecordForRead(cleanRecord);
        });
        return saved;
      } catch (err) {
        if (err instanceof Error && err.message.includes('already exists')) {
          throw err;
        }
        dbUnavailable = true;
        return memoryFallback.saveRevision(cleanRecord);
      }
    },

    async importArchiveJson(rawJsonText) {
      const parsed = validateAndParsePrimerRevisionArchive(rawJsonText);
      if (!parsed.ok) {
        const currentAll = await this.listRevisions();
        return {
          ok: false,
          importedCount: 0,
          skippedDuplicateIds: [],
          errors: parsed.errors,
          warnings: parsed.warnings,
          allRevisions: currentAll,
        };
      }

      if (dbUnavailable) {
        return memoryFallback.importArchiveJson(rawJsonText);
      }

      try {
        const skippedDuplicateIds: string[] = [];
        let importedCount = 0;

        await withDb('readwrite', async (store) => {
          for (const rev of parsed.revisions) {
            const existing = await idbReqToPromise(store.get(rev.revisionId));
            if (existing) {
              skippedDuplicateIds.push(rev.revisionId);
              continue;
            }
            const cleanRecord: PrimerRevisionRecord = {
              ...rev,
              snapshot: sanitizePrimerDocumentForArchive(rev.snapshot),
            };
            await idbReqToPromise(store.add(cleanRecord));
            importedCount += 1;
          }
        });

        const allRevisions = await this.listRevisions();
        return {
          ok: true,
          importedCount,
          skippedDuplicateIds,
          errors: [],
          warnings: parsed.warnings,
          allRevisions,
        };
      } catch {
        dbUnavailable = true;
        return memoryFallback.importArchiveJson(rawJsonText);
      }
    },

    async getDiagnostics() {
      const all = await this.listRevisions();
      let approximateArchiveBytes = 0;
      try {
        approximateArchiveBytes = new TextEncoder().encode(JSON.stringify(all)).byteLength;
      } catch {
        approximateArchiveBytes = JSON.stringify(all).length;
      }
      return {
        backend: this.backend,
        totalRevisions: all.length,
        approximateArchiveBytes,
        localStorageReport: inspectLocalStorageCapacity(),
        integrityDisclaimer: LOCAL_ARCHIVE_INTEGRITY_DISCLAIMER,
      };
    },
  };
}

let sharedStoreSingleton: PrimerRevisionArchiveStore | null = null;

export function getPrimerRevisionArchiveStore(): PrimerRevisionArchiveStore {
  if (!sharedStoreSingleton) {
    sharedStoreSingleton =
      typeof indexedDB !== 'undefined'
        ? createIndexedDbRevisionStore()
        : createMemoryRevisionStore();
  }
  return sharedStoreSingleton;
}
