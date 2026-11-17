import {
  resolveSourceImportVersioning,
  type PrimerResearchSourceRecord,
  type ResearchEventMatchDetails,
  type ResearchRelevanceDecision,
  type ResearchSourceStatus,
  type SourceImportResolution,
} from './primerResearchAssistant';
import { safeJsonParseChecked } from './primerReviewPackage';

export const RESEARCH_SOURCE_DB_NAME = 'eqp_primer_research_sources_v1';
export const RESEARCH_SOURCE_DB_VERSION = 1;
export const RESEARCH_SOURCE_STORE_NAME = 'sources';

export interface ResearchSourceStoreDiagnostics {
  backend: 'indexeddb' | 'memory-fallback';
  dbName: string;
  totalCount: number;
  isolatedFromPrimerLocalStorage: true;
}

export interface PrimerResearchSourceStore {
  listSources(filter?: {
    linkedEqpEventId?: string;
    includeArchived?: boolean;
  }): Promise<PrimerResearchSourceRecord[]>;
  getSource(sourceId: string): Promise<PrimerResearchSourceRecord | null>;
  importOrAddSource(
    candidate: Omit<
      PrimerResearchSourceRecord,
      'versionNumber' | 'supersedesSourceId' | 'supersededBySourceId' | 'duplicateGroupKey'
    >
  ): Promise<SourceImportResolution>;
  updateRelevance(
    sourceId: string,
    relevance: ResearchRelevanceDecision
  ): Promise<PrimerResearchSourceRecord | null>;
  updateArchived(
    sourceId: string,
    archived: boolean
  ): Promise<PrimerResearchSourceRecord | null>;
  updateEventMatch(
    sourceId: string,
    match: ResearchEventMatchDetails,
    nextStatus?: ResearchSourceStatus
  ): Promise<PrimerResearchSourceRecord | null>;
  removeSource(sourceId: string): Promise<boolean>;
  exportEventSourcesJson(linkedEqpEventId: string): Promise<string>;
  getDiagnostics(): Promise<ResearchSourceStoreDiagnostics>;
}

function sortSourcesNewestFirst(
  list: PrimerResearchSourceRecord[]
): PrimerResearchSourceRecord[] {
  return [...list].sort((a, b) => {
    const tCmp = b.retrievedAtUtc.localeCompare(a.retrievedAtUtc);
    if (tCmp !== 0) return tCmp;
    return b.versionNumber - a.versionNumber;
  });
}

export function createMemoryResearchSourceStore(
  initial: PrimerResearchSourceRecord[] = []
): PrimerResearchSourceStore {
  const map = new Map<string, PrimerResearchSourceRecord>();
  for (const r of initial) {
    map.set(r.sourceId, structuredClone(r));
  }

  return {
    async listSources(filter) {
      let arr = Array.from(map.values());
      if (filter?.linkedEqpEventId) {
        arr = arr.filter((r) => r.linkedEqpEventId === filter.linkedEqpEventId);
      }
      if (filter?.includeArchived === false) {
        arr = arr.filter((r) => !r.archived);
      }
      return sortSourcesNewestFirst(arr).map((r) => structuredClone(r));
    },

    async getSource(sourceId) {
      const hit = map.get(sourceId);
      return hit ? structuredClone(hit) : null;
    },

    async importOrAddSource(candidate) {
      const existingForEvent = Array.from(map.values()).filter(
        (r) => r.linkedEqpEventId === candidate.linkedEqpEventId
      );
      const resolution = resolveSourceImportVersioning(candidate, existingForEvent);
      if (resolution.outcome === 'duplicate-exact') {
        return {
          ...resolution,
          record: structuredClone(resolution.record),
        };
      }
      if (resolution.supersededRecordUpdate) {
        map.set(
          resolution.supersededRecordUpdate.sourceId,
          structuredClone(resolution.supersededRecordUpdate)
        );
      }
      map.set(resolution.record.sourceId, structuredClone(resolution.record));
      return {
        ...resolution,
        record: structuredClone(resolution.record),
        supersededRecordUpdate: resolution.supersededRecordUpdate
          ? structuredClone(resolution.supersededRecordUpdate)
          : undefined,
      };
    },

    async updateRelevance(sourceId, relevance) {
      const existing = map.get(sourceId);
      if (!existing) return null;
      const updated: PrimerResearchSourceRecord = {
        ...existing,
        relevance,
      };
      map.set(sourceId, updated);
      return structuredClone(updated);
    },

    async updateArchived(sourceId, archived) {
      const existing = map.get(sourceId);
      if (!existing) return null;
      const updated: PrimerResearchSourceRecord = {
        ...existing,
        archived,
        retrievalStatus: archived
          ? 'archived'
          : existing.sourceLocation.startsWith('local://')
            ? 'imported'
            : existing.sourceUrl
              ? 'retrieved'
              : existing.retrievalStatus,
      };
      map.set(sourceId, updated);
      return structuredClone(updated);
    },

    async updateEventMatch(sourceId, match, nextStatus) {
      const existing = map.get(sourceId);
      if (!existing) return null;
      const updated: PrimerResearchSourceRecord = {
        ...existing,
        eventMatchState: match.state,
        eventMatchDetails: match,
        retrievalStatus: nextStatus ?? existing.retrievalStatus,
      };
      map.set(sourceId, updated);
      return structuredClone(updated);
    },

    async removeSource(sourceId) {
      return map.delete(sourceId);
    },

    async exportEventSourcesJson(linkedEqpEventId) {
      const rows = await this.listSources({ linkedEqpEventId, includeArchived: true });
      return JSON.stringify(
        {
          schemaVersion: '1.0',
          exportedAtUtc: new Date().toISOString(),
          linkedEqpEventId,
          sources: rows,
        },
        null,
        2
      );
    },

    async getDiagnostics() {
      return {
        backend: 'memory-fallback',
        dbName: RESEARCH_SOURCE_DB_NAME,
        totalCount: map.size,
        isolatedFromPrimerLocalStorage: true,
      };
    },
  };
}

function openResearchSourceDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || typeof window.indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = window.indexedDB.open(RESEARCH_SOURCE_DB_NAME, RESEARCH_SOURCE_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(RESEARCH_SOURCE_STORE_NAME)) {
        const store = db.createObjectStore(RESEARCH_SOURCE_STORE_NAME, {
          keyPath: 'sourceId',
        });
        store.createIndex('byLinkedEqpEventId', 'linkedEqpEventId', { unique: false });
        store.createIndex('byContentSha256', 'contentSha256', { unique: false });
        store.createIndex('byDuplicateGroupKey', 'duplicateGroupKey', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(req.error ?? new Error('Failed to open Research Source IndexedDB'));
  });
}

export function createIndexedDbResearchSourceStore(): PrimerResearchSourceStore {
  const memoryFallback = createMemoryResearchSourceStore();
  let useFallback =
    typeof window === 'undefined' || typeof window.indexedDB === 'undefined';

  async function withStore<T>(
    mode: IDBTransactionMode,
    op: (store: IDBObjectStore) => Promise<T>,
    fallbackFn: () => Promise<T>
  ): Promise<T> {
    if (useFallback) return fallbackFn();
    try {
      const db = await openResearchSourceDb();
      try {
        const tx = db.transaction(RESEARCH_SOURCE_STORE_NAME, mode);
        const store = tx.objectStore(RESEARCH_SOURCE_STORE_NAME);
        return await op(store);
      } finally {
        db.close();
      }
    } catch {
      useFallback = true;
      return fallbackFn();
    }
  }

  const getAllRaw = (): Promise<PrimerResearchSourceRecord[]> =>
    withStore(
      'readonly',
      (store) =>
        new Promise<PrimerResearchSourceRecord[]>((resolve, reject) => {
          const req = store.getAll();
          req.onsuccess = () => resolve((req.result as PrimerResearchSourceRecord[]) ?? []);
          req.onerror = () => reject(req.error);
        }),
      () => memoryFallback.listSources({ includeArchived: true })
    );

  const putRecord = (rec: PrimerResearchSourceRecord): Promise<void> =>
    withStore(
      'readwrite',
      (store) =>
        new Promise<void>((resolve, reject) => {
          const req = store.put(rec);
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        }),
      async () => {
        await memoryFallback.importOrAddSource(rec);
      }
    );

  return {
    async listSources(filter) {
      let rows = await getAllRaw();
      if (filter?.linkedEqpEventId) {
        rows = rows.filter((r) => r.linkedEqpEventId === filter.linkedEqpEventId);
      }
      if (filter?.includeArchived === false) {
        rows = rows.filter((r) => !r.archived);
      }
      return sortSourcesNewestFirst(rows);
    },

    async getSource(sourceId) {
      return withStore(
        'readonly',
        (store) =>
          new Promise<PrimerResearchSourceRecord | null>((resolve, reject) => {
            const req = store.get(sourceId);
            req.onsuccess = () => resolve((req.result as PrimerResearchSourceRecord) ?? null);
            req.onerror = () => reject(req.error);
          }),
        () => memoryFallback.getSource(sourceId)
      );
    },

    async importOrAddSource(candidate) {
      const existingForEvent = await this.listSources({
        linkedEqpEventId: candidate.linkedEqpEventId,
        includeArchived: true,
      });
      const resolution = resolveSourceImportVersioning(candidate, existingForEvent);
      if (resolution.outcome === 'duplicate-exact') {
        return resolution;
      }
      if (useFallback) {
        return memoryFallback.importOrAddSource(candidate);
      }
      if (resolution.supersededRecordUpdate) {
        await putRecord(resolution.supersededRecordUpdate);
      }
      await putRecord(resolution.record);
      return resolution;
    },

    async updateRelevance(sourceId, relevance) {
      if (useFallback) return memoryFallback.updateRelevance(sourceId, relevance);
      const existing = await this.getSource(sourceId);
      if (!existing) return null;
      const updated: PrimerResearchSourceRecord = { ...existing, relevance };
      await putRecord(updated);
      return updated;
    },

    async updateArchived(sourceId, archived) {
      if (useFallback) return memoryFallback.updateArchived(sourceId, archived);
      const existing = await this.getSource(sourceId);
      if (!existing) return null;
      const updated: PrimerResearchSourceRecord = {
        ...existing,
        archived,
        retrievalStatus: archived
          ? 'archived'
          : existing.sourceLocation.startsWith('local://')
            ? 'imported'
            : existing.sourceUrl
              ? 'retrieved'
              : existing.retrievalStatus,
      };
      await putRecord(updated);
      return updated;
    },

    async updateEventMatch(sourceId, match, nextStatus) {
      if (useFallback) return memoryFallback.updateEventMatch(sourceId, match, nextStatus);
      const existing = await this.getSource(sourceId);
      if (!existing) return null;
      const updated: PrimerResearchSourceRecord = {
        ...existing,
        eventMatchState: match.state,
        eventMatchDetails: match,
        retrievalStatus: nextStatus ?? existing.retrievalStatus,
      };
      await putRecord(updated);
      return updated;
    },

    async removeSource(sourceId) {
      return withStore(
        'readwrite',
        (store) =>
          new Promise<boolean>((resolve, reject) => {
            const req = store.delete(sourceId);
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(req.error);
          }),
        () => memoryFallback.removeSource(sourceId)
      );
    },

    async exportEventSourcesJson(linkedEqpEventId) {
      const rows = await this.listSources({ linkedEqpEventId, includeArchived: true });
      return JSON.stringify(
        {
          schemaVersion: '1.0',
          exportedAtUtc: new Date().toISOString(),
          linkedEqpEventId,
          sources: rows,
        },
        null,
        2
      );
    },

    async getDiagnostics() {
      const rows = await getAllRaw();
      return {
        backend: useFallback ? 'memory-fallback' : 'indexeddb',
        dbName: RESEARCH_SOURCE_DB_NAME,
        totalCount: rows.length,
        isolatedFromPrimerLocalStorage: true,
      };
    },
  };
}

export function validateImportedSourcesBundleJson(
  rawJson: string
): { ok: true; sources: PrimerResearchSourceRecord[] } | { ok: false; error: string } {
  const parsed = safeJsonParseChecked(rawJson);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const val = parsed.value as { sources?: unknown };
  if (!val || !Array.isArray(val.sources)) {
    return { ok: false, error: 'Source bundle JSON missing "sources" array.' };
  }
  return { ok: true, sources: val.sources as PrimerResearchSourceRecord[] };
}

let singletonResearchStore: PrimerResearchSourceStore | null = null;
export function getPrimerResearchSourceStore(): PrimerResearchSourceStore {
  if (!singletonResearchStore) {
    singletonResearchStore = createIndexedDbResearchSourceStore();
  }
  return singletonResearchStore;
}
