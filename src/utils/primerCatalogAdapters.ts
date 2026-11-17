import {
  type CatalogImportRejection,
  detectCatalogDuplicates,
  type DuplicateMatchReport,
  type HistoricalCatalogPayload,
  type HistoricalEarthquakeRecord,
  parseHistoricalCsv,
  parseHistoricalGeoJson,
} from './historicalSeismicity.ts';

export type PrimerCatalogSourceKind =
  | 'shared-research-catalog'
  | 'local-file-import'
  | 'fdsn-usgs'
  | 'phivolcs-service-unconfigured';

export interface PrimerCatalogCoverageSummary {
  totalRecords: number;
  earliestUtc: string | null;
  latestUtc: string | null;
  sources: Array<{ source: string; count: number }>;
  magnitudeTypes: Array<{ magType: string; count: number }>;
  missingDepthCount: number;
  missingMagnitudeCount: number;
  uncertainLocationCount: number;
  limitations: string[];
}

export interface PrimerCatalogStateSnapshot {
  records: HistoricalEarthquakeRecord[];
  catalogVersion: number;
  updatedAtUtc: string;
  sourceKind: PrimerCatalogSourceKind;
  sourceLabel: string;
  coverage: PrimerCatalogCoverageSummary;
  lastImportAudit: {
    parsedCount: number;
    addedCount: number;
    exactDuplicates: DuplicateMatchReport[];
    uncertainDuplicates: DuplicateMatchReport[];
    rejections: CatalogImportRejection[];
    warnings: string[];
    retrievedAtUtc: string;
  } | null;
}

export interface PrimerCatalogServiceDescriptor {
  id: string;
  name: string;
  status: 'connected' | 'online-on-demand' | 'unconfigured';
  description: string;
  limitations: string[];
}

export const CATALOG_SERVICE_ADAPTERS: PrimerCatalogServiceDescriptor[] = [
  {
    id: 'shared-research-catalog',
    name: 'Shared EQP Research Historical Catalog',
    status: 'connected',
    description:
      'Reads verified CSV/GeoJSON/FDSN records already imported into /api/research/historical-catalog.',
    limitations: [
      'Contains only records explicitly imported by analysts or retrieved via approved FDSN requests.',
    ],
  },
  {
    id: 'fdsn-event-service',
    name: 'FDSN Event Service (USGS FDSNWS Adapter)',
    status: 'online-on-demand',
    description:
      'Queries https://earthquake.usgs.gov/fdsnws/event/1/query through server proxy only on explicit analyst action.',
    limitations: [
      'Global FDSN completeness threshold (Mc) in Philippine arcs is typically higher than local networks for shallow M < 4.0 aftershocks.',
    ],
  },
  {
    id: 'phivolcs-official-service',
    name: 'PHIVOLCS Catalog Service Interface (Reserved)',
    status: 'unconfigured',
    description:
      'Modular adapter interface reserved for future authenticated institutional PHIVOLCS earthquake catalog feeds.',
    limitations: [
      'No public unauthenticated PHIVOLCS catalog API is assumed or connected. Use validated local CSV/GeoJSON import for official PHIVOLCS bulletins or catalog extracts.',
    ],
  },
];

export function computeCatalogCoverageSummary(
  records: HistoricalEarthquakeRecord[]
): PrimerCatalogCoverageSummary {
  if (records.length === 0) {
    return {
      totalRecords: 0,
      earliestUtc: null,
      latestUtc: null,
      sources: [],
      magnitudeTypes: [],
      missingDepthCount: 0,
      missingMagnitudeCount: 0,
      uncertainLocationCount: 0,
      limitations: [
        'No earthquake catalog records are currently loaded. Sequence and historical statistics remain unavailable until real catalog data is imported or loaded.',
      ],
    };
  }

  let minMs = Infinity;
  let maxMs = -Infinity;
  let missingDepthCount = 0;
  let missingMagnitudeCount = 0;
  let uncertainLocationCount = 0;
  const srcCounts = new Map<string, number>();
  const magCounts = new Map<string, number>();

  for (const r of records) {
    if (r.originTimeMs < minMs) minMs = r.originTimeMs;
    if (r.originTimeMs > maxMs) maxMs = r.originTimeMs;
    if (r.depthKm === null) missingDepthCount++;
    if (r.magnitude === null || !Number.isFinite(r.magnitude)) missingMagnitudeCount++;
    if (r.locationUncertain) uncertainLocationCount++;
    srcCounts.set(r.dataSource, (srcCounts.get(r.dataSource) ?? 0) + 1);
    const mt = r.magnitudeType || 'Unknown';
    magCounts.set(mt, (magCounts.get(mt) ?? 0) + 1);
  }

  const sources = Array.from(srcCounts.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);

  const magnitudeTypes = Array.from(magCounts.entries())
    .map(([magType, count]) => ({ magType, count }))
    .sort((a, b) => b.count - a.count);

  const limitations: string[] = [];
  if (magnitudeTypes.length > 1) {
    limitations.push(
      `Multiple magnitude scales present (${magnitudeTypes
        .map((m) => `${m.magType}: ${m.count}`)
        .join(', ')}); different scales are reported separately and not homogenized without verified empirical conversions.`
    );
  }
  if (missingDepthCount > 0) {
    limitations.push(
      `${missingDepthCount} record(s) have missing focal depth (preserved as null; excluded only from depth statistics).`
    );
  }
  if (missingMagnitudeCount > 0) {
    limitations.push(
      `${missingMagnitudeCount} record(s) lack numeric magnitude values.`
    );
  }
  if (uncertainLocationCount > 0) {
    limitations.push(
      `${uncertainLocationCount} record(s) carry preliminary or uncertain hypocenter quality flags.`
    );
  }
  limitations.push(
    'Catalog completeness is bounded by network station geometry, reporting thresholds, and imported institutional coverage.'
  );

  return {
    totalRecords: records.length,
    earliestUtc: Number.isFinite(minMs) ? new Date(minMs).toISOString() : null,
    latestUtc: Number.isFinite(maxMs) ? new Date(maxMs).toISOString() : null,
    sources,
    magnitudeTypes,
    missingDepthCount,
    missingMagnitudeCount,
    uncertainLocationCount,
    limitations,
  };
}

/**
 * Fetches the existing shared catalog from the EQP backend Research module.
 */
export async function fetchSharedResearchCatalog(): Promise<PrimerCatalogStateSnapshot> {
  const resp = await fetch('/api/research/historical-catalog');
  const data = (await resp.json()) as HistoricalCatalogPayload & {
    ok?: boolean;
    error?: string;
  };
  if (!resp.ok || data.ok === false) {
    throw new Error(data.error || `HTTP ${resp.status} loading shared research catalog.`);
  }
  const records = Array.isArray(data.events) ? data.events : [];
  return {
    records,
    catalogVersion: data.catalogVersion ?? 1,
    updatedAtUtc: data.updatedAt || new Date().toISOString(),
    sourceKind: 'shared-research-catalog',
    sourceLabel: 'Shared EQP Research Historical Catalog',
    coverage: computeCatalogCoverageSummary(records),
    lastImportAudit: null,
  };
}

/**
 * Validates and parses local CSV or GeoJSON earthquake catalog text cleanly without silently fabricating missing fields.
 * Supports either local in-memory session attachment or persistence to /api/research/historical-catalog/import.
 */
export function validateAndMergeLocalCatalog(params: {
  content: string;
  format: 'csv' | 'geojson';
  existingRecords: HistoricalEarthquakeRecord[];
  existingCatalogVersion: number;
  defaultSource?: string;
  catalogVersionLabel?: string;
  sourceReference?: string;
}): PrimerCatalogStateSnapshot {
  const retrievedAtUtc = new Date().toISOString();
  const parsed =
    params.format === 'geojson'
      ? parseHistoricalGeoJson(params.content, {
          defaultSource: params.defaultSource || 'Local GeoJSON Catalog',
          catalogVersion: params.catalogVersionLabel || 'local-v1',
          sourceReference: params.sourceReference || 'Validated Local GeoJSON Import',
          retrievedAtUtc,
        })
      : parseHistoricalCsv(params.content, {
          defaultSource: params.defaultSource || 'Local CSV Catalog',
          catalogVersion: params.catalogVersionLabel || 'local-v1',
          sourceReference: params.sourceReference || 'Validated Local CSV Import',
          retrievedAtUtc,
        });

  const dup = detectCatalogDuplicates(parsed.records, params.existingRecords);
  const merged = [...dup.uniqueRecords, ...params.existingRecords].sort(
    (a, b) => b.originTimeMs - a.originTimeMs
  );
  const nextVersion =
    dup.uniqueRecords.length > 0
      ? params.existingCatalogVersion + 1
      : params.existingCatalogVersion;

  return {
    records: merged,
    catalogVersion: nextVersion,
    updatedAtUtc: retrievedAtUtc,
    sourceKind: 'local-file-import',
    sourceLabel:
      params.defaultSource?.trim() ||
      (params.format === 'geojson' ? 'Validated Local GeoJSON' : 'Validated Local CSV'),
    coverage: computeCatalogCoverageSummary(merged),
    lastImportAudit: {
      parsedCount: parsed.records.length,
      addedCount: dup.uniqueRecords.length,
      exactDuplicates: dup.exactDuplicates,
      uncertainDuplicates: dup.uncertainDuplicates,
      rejections: parsed.rejections,
      warnings: parsed.warnings,
      retrievedAtUtc,
    },
  };
}

export async function importCatalogToSharedEndpoint(params: {
  content: string;
  format: 'csv' | 'geojson';
  defaultSource: string;
  catalogVersion: string;
  sourceReference?: string;
}): Promise<PrimerCatalogStateSnapshot> {
  const resp = await fetch('/api/research/historical-catalog/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      format: params.format,
      content: params.content,
      defaultSource: params.defaultSource,
      catalogVersion: params.catalogVersion,
      sourceReference: params.sourceReference,
    }),
  });
  const data = await resp.json();
  if (!resp.ok || data.ok === false) {
    throw new Error(data.error || `HTTP ${resp.status} importing catalog.`);
  }
  const records: HistoricalEarthquakeRecord[] = Array.isArray(data.events) ? data.events : [];
  const retrievedAtUtc = data.updatedAt || new Date().toISOString();
  return {
    records,
    catalogVersion: data.catalogVersion ?? 1,
    updatedAtUtc: retrievedAtUtc,
    sourceKind: 'local-file-import',
    sourceLabel: params.defaultSource,
    coverage: computeCatalogCoverageSummary(records),
    lastImportAudit: {
      parsedCount: data.parsedCount ?? 0,
      addedCount: data.addedCount ?? 0,
      exactDuplicates: data.exactDuplicates ?? [],
      uncertainDuplicates: data.uncertainDuplicates ?? [],
      rejections: data.rejections ?? [],
      warnings: data.warnings ?? [],
      retrievedAtUtc,
    },
  };
}

export async function queryUsgsFdsnCatalogAdapter(params: {
  lat: number;
  lon: number;
  maxradiuskm: number;
  minmagnitude?: number;
  starttime?: string;
  endtime?: string;
  limit?: number;
}): Promise<PrimerCatalogStateSnapshot> {
  const resp = await fetch('/api/research/historical-catalog/usgs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await resp.json();
  if (!resp.ok || data.ok === false) {
    throw new Error(data.error || `HTTP ${resp.status} querying USGS FDSN API.`);
  }
  const records: HistoricalEarthquakeRecord[] = Array.isArray(data.events) ? data.events : [];
  const retrievedAtUtc = data.retrievedAtUtc || data.updatedAt || new Date().toISOString();
  return {
    records,
    catalogVersion: data.catalogVersion ?? 1,
    updatedAtUtc: retrievedAtUtc,
    sourceKind: 'fdsn-usgs',
    sourceLabel: `USGS FDSN Event API (${params.maxradiuskm} km radius)`,
    coverage: computeCatalogCoverageSummary(records),
    lastImportAudit: {
      parsedCount: data.parsedCount ?? 0,
      addedCount: data.addedCount ?? 0,
      exactDuplicates: data.exactDuplicates ?? [],
      uncertainDuplicates: data.uncertainDuplicates ?? [],
      rejections: data.rejections ?? [],
      warnings: data.warnings ?? [],
      retrievedAtUtc,
    },
  };
}
