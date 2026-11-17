import type { EQPEvent } from '../data/eqpData';
import type { PrimerResearchSourceRecord } from './primerResearchAssistant';
import {
  revalidateFindingAgainstSource,
  type CandidateScientificFinding,
  type FindingExtractionMethod,
  type FindingRelevanceStatus,
} from './primerResearchExtraction';

export const RESEARCH_FINDINGS_DB_NAME = 'eqp_primer_research_findings_v1';
export const RESEARCH_FINDINGS_DB_VERSION = 1;
export const RESEARCH_FINDINGS_STORE_NAME = 'findings';

export interface ResearchFindingsStoreDiagnostics {
  backend: 'indexeddb' | 'memory-fallback';
  dbName: string;
  totalCount: number;
  isolatedFromPrimerLocalStorage: true;
  preservesR1SourceStore: true;
}

export interface SaveExtractionRunResult {
  runId: string;
  runVersion: number;
  savedCount: number;
  supersededPreviousCount: number;
  findings: CandidateScientificFinding[];
}

export interface RevalidateSourceFindingsResult {
  revalidatedCount: number;
  unresolvedAfterUpdateCount: number;
  updatedFindings: CandidateScientificFinding[];
}

export interface PrimerResearchFindingsStore {
  listFindings(filter?: {
    linkedEqpEventId?: string;
    sourceId?: string;
    includeSuperseded?: boolean;
    includeIrrelevant?: boolean;
    includeNonMatching?: boolean;
  }): Promise<CandidateScientificFinding[]>;
  getFinding(findingId: string): Promise<CandidateScientificFinding | null>;
  saveExtractionRun(params: {
    linkedEqpEventId: string;
    sourceId: string;
    extractionMethod: FindingExtractionMethod;
    findings: CandidateScientificFinding[];
  }): Promise<SaveExtractionRunResult>;
  saveSingleFinding(finding: CandidateScientificFinding): Promise<CandidateScientificFinding>;
  updateRelevanceStatus(
    findingId: string,
    relevanceStatus: FindingRelevanceStatus
  ): Promise<CandidateScientificFinding | null>;
  revalidateAgainstSourceVersion(
    updatedSource: PrimerResearchSourceRecord,
    previousSourceId?: string,
    activeEvent?: EQPEvent
  ): Promise<RevalidateSourceFindingsResult>;
  exportEventFindingsJson(linkedEqpEventId: string): Promise<string>;
  getDiagnostics(): Promise<ResearchFindingsStoreDiagnostics>;
}

function sortFindingsNewestFirst(
  list: CandidateScientificFinding[]
): CandidateScientificFinding[] {
  return [...list].sort((a, b) => {
    const tCmp = b.extractedAtUtc.localeCompare(a.extractedAtUtc);
    if (tCmp !== 0) return tCmp;
    if (b.extractionRunVersion !== a.extractionRunVersion) {
      return b.extractionRunVersion - a.extractionRunVersion;
    }
    return a.findingId.localeCompare(b.findingId);
  });
}

function applyListFilter(
  rows: CandidateScientificFinding[],
  filter?: {
    linkedEqpEventId?: string;
    sourceId?: string;
    includeSuperseded?: boolean;
    includeIrrelevant?: boolean;
    includeNonMatching?: boolean;
  }
): CandidateScientificFinding[] {
  let out = rows;
  if (filter?.linkedEqpEventId) {
    out = out.filter((r) => r.linkedEqpEventId === filter.linkedEqpEventId);
  }
  if (filter?.sourceId) {
    out = out.filter((r) => r.sourceId === filter.sourceId);
  }
  if (filter?.includeSuperseded === false) {
    out = out.filter((r) => !r.supersededByRunId);
  }
  if (filter?.includeIrrelevant === false) {
    out = out.filter((r) => r.relevanceStatus === 'active');
  }
  if (filter?.includeNonMatching === false) {
    out = out.filter((r) => !r.excludedByNonMatchingEvent);
  }
  return sortFindingsNewestFirst(out);
}

export function createMemoryResearchFindingsStore(
  initial: CandidateScientificFinding[] = []
): PrimerResearchFindingsStore {
  const map = new Map<string, CandidateScientificFinding>();
  for (const f of initial) {
    map.set(f.findingId, structuredClone(f));
  }

  return {
    async listFindings(filter) {
      return applyListFilter(Array.from(map.values()), filter).map((r) => structuredClone(r));
    },

    async getFinding(findingId) {
      const hit = map.get(findingId);
      return hit ? structuredClone(hit) : null;
    },

    async saveExtractionRun({ linkedEqpEventId, sourceId, extractionMethod, findings }) {
      const existingForPair = Array.from(map.values()).filter(
        (r) =>
          r.linkedEqpEventId === linkedEqpEventId &&
          r.sourceId === sourceId &&
          r.extractionMethod === extractionMethod
      );
      const maxVer = existingForPair.reduce(
        (acc, r) => Math.max(acc, r.extractionRunVersion || 1),
        0
      );
      const nextVersion = maxVer + 1;
      const runId =
        findings[0]?.extractionRunId ||
        `run_${extractionMethod}_${Date.now()}_v${nextVersion}`;

      // Mark previous active findings from this (sourceId, extractionMethod) as superseded,
      // preserving them cleanly in storage without overwriting or deleting them.
      let supersededPreviousCount = 0;
      for (const prev of existingForPair) {
        if (!prev.supersededByRunId) {
          map.set(prev.findingId, {
            ...prev,
            supersededByRunId: runId,
          });
          supersededPreviousCount += 1;
        }
      }

      const materialized: CandidateScientificFinding[] = [];
      for (const f of findings) {
        const stamped: CandidateScientificFinding = {
          ...structuredClone(f),
          extractionRunId: runId,
          extractionRunVersion: nextVersion,
          supersededByRunId: null,
        };
        map.set(stamped.findingId, stamped);
        materialized.push(structuredClone(stamped));
      }

      return {
        runId,
        runVersion: nextVersion,
        savedCount: materialized.length,
        supersededPreviousCount,
        findings: materialized,
      };
    },

    async saveSingleFinding(finding) {
      const cloned: CandidateScientificFinding = {
        ...structuredClone(finding),
        supersededByRunId: null,
      };
      map.set(cloned.findingId, cloned);
      return structuredClone(cloned);
    },

    async updateRelevanceStatus(findingId, relevanceStatus) {
      const existing = map.get(findingId);
      if (!existing) return null;
      const updated: CandidateScientificFinding = {
        ...existing,
        relevanceStatus,
      };
      map.set(findingId, updated);
      return structuredClone(updated);
    },

    async revalidateAgainstSourceVersion(updatedSource, previousSourceId, activeEvent) {
      const targetSourceIds = new Set<string>([updatedSource.sourceId]);
      if (previousSourceId) targetSourceIds.add(previousSourceId);
      if (updatedSource.supersedesSourceId) targetSourceIds.add(updatedSource.supersedesSourceId);

      const candidates = Array.from(map.values()).filter(
        (f) =>
          f.linkedEqpEventId === updatedSource.linkedEqpEventId &&
          targetSourceIds.has(f.sourceId) &&
          !f.supersededByRunId
      );

      const updatedFindings: CandidateScientificFinding[] = [];
      let unresolvedAfterUpdateCount = 0;

      for (const orig of candidates) {
        const reval = revalidateFindingAgainstSource(orig, updatedSource, activeEvent);
        // Preserve original finding intact as superseded snapshot if sourceId changed (v1 -> v2),
        // and store newly revalidated finding linked to the newer sourceId cleanly!
        if (orig.sourceId !== updatedSource.sourceId) {
          const revRunId = `reval_${updatedSource.sourceId}`;
          map.set(orig.findingId, {
            ...orig,
            supersededByRunId: revRunId,
          });
          const clonedNew: CandidateScientificFinding = {
            ...reval,
            findingId: `${orig.findingId}_v${updatedSource.versionNumber}`,
            sourceId: updatedSource.sourceId,
            extractionRunId: revRunId,
            extractionRunVersion: orig.extractionRunVersion + 1,
            supersededByRunId: null,
          };
          map.set(clonedNew.findingId, clonedNew);
          updatedFindings.push(structuredClone(clonedNew));
        } else {
          map.set(reval.findingId, reval);
          updatedFindings.push(structuredClone(reval));
        }
        if (reval.evidenceValidationStatus === 'evidence-unresolved') {
          unresolvedAfterUpdateCount += 1;
        }
      }

      return {
        revalidatedCount: updatedFindings.length,
        unresolvedAfterUpdateCount,
        updatedFindings,
      };
    },

    async exportEventFindingsJson(linkedEqpEventId) {
      const rows = await this.listFindings({
        linkedEqpEventId,
        includeSuperseded: true,
        includeIrrelevant: true,
        includeNonMatching: true,
      });
      return JSON.stringify(
        {
          schemaVersion: '2.0',
          exportedAtUtc: new Date().toISOString(),
          linkedEqpEventId,
          findings: rows,
        },
        null,
        2
      );
    },

    async getDiagnostics() {
      return {
        backend: 'memory-fallback',
        dbName: RESEARCH_FINDINGS_DB_NAME,
        totalCount: map.size,
        isolatedFromPrimerLocalStorage: true,
        preservesR1SourceStore: true,
      };
    },
  };
}

function openResearchFindingsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || typeof window.indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = window.indexedDB.open(RESEARCH_FINDINGS_DB_NAME, RESEARCH_FINDINGS_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(RESEARCH_FINDINGS_STORE_NAME)) {
        const store = db.createObjectStore(RESEARCH_FINDINGS_STORE_NAME, {
          keyPath: 'findingId',
        });
        store.createIndex('byLinkedEqpEventId', 'linkedEqpEventId', { unique: false });
        store.createIndex('bySourceId', 'sourceId', { unique: false });
        store.createIndex('byCategory', 'category', { unique: false });
        store.createIndex('byConflictGroupId', 'conflictGroupId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(req.error ?? new Error('Failed to open Research Findings IndexedDB'));
  });
}

export function createIndexedDbResearchFindingsStore(): PrimerResearchFindingsStore {
  const memoryFallback = createMemoryResearchFindingsStore();
  let useFallback =
    typeof window === 'undefined' || typeof window.indexedDB === 'undefined';

  async function withStore<T>(
    mode: IDBTransactionMode,
    op: (store: IDBObjectStore) => Promise<T>,
    fallbackFn: () => Promise<T>
  ): Promise<T> {
    if (useFallback) return fallbackFn();
    try {
      const db = await openResearchFindingsDb();
      try {
        const tx = db.transaction(RESEARCH_FINDINGS_STORE_NAME, mode);
        const store = tx.objectStore(RESEARCH_FINDINGS_STORE_NAME);
        return await op(store);
      } finally {
        db.close();
      }
    } catch {
      useFallback = true;
      return fallbackFn();
    }
  }

  const getAllRaw = (): Promise<CandidateScientificFinding[]> =>
    withStore(
      'readonly',
      (store) =>
        new Promise<CandidateScientificFinding[]>((resolve, reject) => {
          const req = store.getAll();
          req.onsuccess = () => resolve((req.result as CandidateScientificFinding[]) ?? []);
          req.onerror = () => reject(req.error);
        }),
      () =>
        memoryFallback.listFindings({
          includeSuperseded: true,
          includeIrrelevant: true,
          includeNonMatching: true,
        })
    );

  const putRecord = (rec: CandidateScientificFinding): Promise<void> =>
    withStore(
      'readwrite',
      (store) =>
        new Promise<void>((resolve, reject) => {
          const req = store.put(rec);
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        }),
      async () => {
        // Fallback handled directly when useFallback is true
      }
    );

  return {
    async listFindings(filter) {
      const rows = await getAllRaw();
      return applyListFilter(rows, filter);
    },

    async getFinding(findingId) {
      return withStore(
        'readonly',
        (store) =>
          new Promise<CandidateScientificFinding | null>((resolve, reject) => {
            const req = store.get(findingId);
            req.onsuccess = () => resolve((req.result as CandidateScientificFinding) ?? null);
            req.onerror = () => reject(req.error);
          }),
        () => memoryFallback.getFinding(findingId)
      );
    },

    async saveExtractionRun({ linkedEqpEventId, sourceId, extractionMethod, findings }) {
      if (useFallback) {
        return memoryFallback.saveExtractionRun({
          linkedEqpEventId,
          sourceId,
          extractionMethod,
          findings,
        });
      }
      const existingAll = await getAllRaw();
      const existingForPair = existingAll.filter(
        (r) =>
          r.linkedEqpEventId === linkedEqpEventId &&
          r.sourceId === sourceId &&
          r.extractionMethod === extractionMethod
      );
      const maxVer = existingForPair.reduce(
        (acc, r) => Math.max(acc, r.extractionRunVersion || 1),
        0
      );
      const nextVersion = maxVer + 1;
      const runId =
        findings[0]?.extractionRunId ||
        `run_${extractionMethod}_${Date.now()}_v${nextVersion}`;

      let supersededPreviousCount = 0;
      for (const prev of existingForPair) {
        if (!prev.supersededByRunId) {
          await putRecord({ ...prev, supersededByRunId: runId });
          supersededPreviousCount += 1;
        }
      }

      const materialized: CandidateScientificFinding[] = [];
      for (const f of findings) {
        const stamped: CandidateScientificFinding = {
          ...f,
          extractionRunId: runId,
          extractionRunVersion: nextVersion,
          supersededByRunId: null,
        };
        await putRecord(stamped);
        materialized.push(stamped);
      }

      return {
        runId,
        runVersion: nextVersion,
        savedCount: materialized.length,
        supersededPreviousCount,
        findings: materialized,
      };
    },

    async saveSingleFinding(finding) {
      if (useFallback) return memoryFallback.saveSingleFinding(finding);
      const stamped: CandidateScientificFinding = {
        ...structuredClone(finding),
        supersededByRunId: null,
      };
      await putRecord(stamped);
      return stamped;
    },

    async updateRelevanceStatus(findingId, relevanceStatus) {
      if (useFallback) return memoryFallback.updateRelevanceStatus(findingId, relevanceStatus);
      const existing = await this.getFinding(findingId);
      if (!existing) return null;
      const updated: CandidateScientificFinding = { ...existing, relevanceStatus };
      await putRecord(updated);
      return updated;
    },

    async revalidateAgainstSourceVersion(updatedSource, previousSourceId, activeEvent) {
      if (useFallback) {
        return memoryFallback.revalidateAgainstSourceVersion(
          updatedSource,
          previousSourceId,
          activeEvent
        );
      }
      const existingAll = await getAllRaw();
      const targetSourceIds = new Set<string>([updatedSource.sourceId]);
      if (previousSourceId) targetSourceIds.add(previousSourceId);
      if (updatedSource.supersedesSourceId) targetSourceIds.add(updatedSource.supersedesSourceId);

      const candidates = existingAll.filter(
        (f) =>
          f.linkedEqpEventId === updatedSource.linkedEqpEventId &&
          targetSourceIds.has(f.sourceId) &&
          !f.supersededByRunId
      );

      const updatedFindings: CandidateScientificFinding[] = [];
      let unresolvedAfterUpdateCount = 0;

      for (const orig of candidates) {
        const reval = revalidateFindingAgainstSource(orig, updatedSource, activeEvent);
        if (orig.sourceId !== updatedSource.sourceId) {
          const revRunId = `reval_${updatedSource.sourceId}`;
          await putRecord({ ...orig, supersededByRunId: revRunId });
          const clonedNew: CandidateScientificFinding = {
            ...reval,
            findingId: `${orig.findingId}_v${updatedSource.versionNumber}`,
            sourceId: updatedSource.sourceId,
            extractionRunId: revRunId,
            extractionRunVersion: orig.extractionRunVersion + 1,
            supersededByRunId: null,
          };
          await putRecord(clonedNew);
          updatedFindings.push(clonedNew);
        } else {
          await putRecord(reval);
          updatedFindings.push(reval);
        }
        if (reval.evidenceValidationStatus === 'evidence-unresolved') {
          unresolvedAfterUpdateCount += 1;
        }
      }

      return {
        revalidatedCount: updatedFindings.length,
        unresolvedAfterUpdateCount,
        updatedFindings,
      };
    },

    async exportEventFindingsJson(linkedEqpEventId) {
      const rows = await this.listFindings({
        linkedEqpEventId,
        includeSuperseded: true,
        includeIrrelevant: true,
        includeNonMatching: true,
      });
      return JSON.stringify(
        {
          schemaVersion: '2.0',
          exportedAtUtc: new Date().toISOString(),
          linkedEqpEventId,
          findings: rows,
        },
        null,
        2
      );
    },

    async getDiagnostics() {
      const rows = await getAllRaw();
      return {
        backend: useFallback ? 'memory-fallback' : 'indexeddb',
        dbName: RESEARCH_FINDINGS_DB_NAME,
        totalCount: rows.length,
        isolatedFromPrimerLocalStorage: true,
        preservesR1SourceStore: true,
      };
    },
  };
}

let singletonFindingsStore: PrimerResearchFindingsStore | null = null;
export function getPrimerResearchFindingsStore(): PrimerResearchFindingsStore {
  if (!singletonFindingsStore) {
    singletonFindingsStore = createIndexedDbResearchFindingsStore();
  }
  return singletonFindingsStore;
}
