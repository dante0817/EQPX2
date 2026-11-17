import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckSquare,
  Download,
  FileSpreadsheet,
  Globe,
  RefreshCw,
  RotateCcw,
  Square,
  Trash2,
  Upload,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  EQPEvent,
  FAULT_TRACES,
  ISLAND_POLYGONS,
  isEventUnlocated,
} from '../data/eqpData';
import {
  buildHistoricalFingerprint,
  computeHistoricalSummaryStats,
  DEFAULT_HISTORICAL_FILTERS,
  depthToColorHex,
  DuplicateMatchReport,
  exportHistoricalCsv,
  exportHistoricalGeoJson,
  exportStressReadyMechanismDataset,
  filterHistoricalEvents,
  FilteredHistoricalEvent,
  HistoricalCatalogPayload,
  HistoricalEarthquakeRecord,
  HistoricalFilterConfig,
  magnitudeToSymbolRadiusPx,
  MechanismQualityGrade,
  parseActiveEventUtcMs,
  RadiusPreset,
  resolveRadiusKm,
  TimeDirectionFilter,
  TimeWindowPreset,
} from '../utils/historicalSeismicity';
import {
  exportSvgElementAsPng,
  exportSvgElementAsSvg,
  HistoricalBeachballCardIcon,
  HistoricalBeachballGlyph,
  triggerTextDownload,
} from './HistoricalBeachballIcon';
import { HistoricalSeismicityCharts } from './HistoricalSeismicityCharts';

interface HistoricalSeismicityPanelProps {
  event: EQPEvent;
  onNotice?: (msg: string) => void;
}

interface ImportAuditSummary {
  parsedCount: number;
  addedCount: number;
  exactDuplicates: DuplicateMatchReport[];
  uncertainDuplicates: DuplicateMatchReport[];
  rejections: Array<{ rowNumber: number; reason: string; rawPreview: string }>;
  warnings: string[];
  sourceLabel: string;
}

const MECHANISM_QUALITIES: MechanismQualityGrade[] = ['A', 'B', 'C', 'D', 'Unknown'];

export const HistoricalSeismicityPanel: React.FC<HistoricalSeismicityPanelProps> = ({
  event,
  onNotice,
}) => {
  const unlocated = isEventUnlocated(event);

  // Catalog state persisted on backend
  const [catalog, setCatalog] = useState<HistoricalEarthquakeRecord[]>([]);
  const [catalogVersion, setCatalogVersion] = useState<number>(1);
  const [catalogUpdatedAt, setCatalogUpdatedAt] = useState<string>('');
  const [isLoadingCatalog, setIsLoadingCatalog] = useState<boolean>(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  // Stale tracking when activeEvent or catalog changes after analyst review
  const currentFingerprint = useMemo(
    () => buildHistoricalFingerprint(event, catalogVersion, catalog.length),
    [event, catalogVersion, catalog.length]
  );
  const [acknowledgedFingerprint, setAcknowledgedFingerprint] = useState<string>('');
  useEffect(() => {
    if (!acknowledgedFingerprint && !isLoadingCatalog) {
      setAcknowledgedFingerprint(currentFingerprint);
    }
  }, [acknowledgedFingerprint, currentFingerprint, isLoadingCatalog]);
  const isStale = Boolean(
    acknowledgedFingerprint && acknowledgedFingerprint !== currentFingerprint
  );

  // Filter state
  const [filters, setFilters] = useState<HistoricalFilterConfig>(DEFAULT_HISTORICAL_FILTERS);

  // Import & USGS query UI state
  const [importDrawerOpen, setImportDrawerOpen] = useState<boolean>(false);
  const [importTab, setImportTab] = useState<'file-paste' | 'usgs'>('file-paste');
  const [importFormat, setImportFormat] = useState<'csv' | 'geojson'>('csv');
  const [importText, setImportText] = useState<string>('');
  const [importSourceLabel, setImportSourceLabel] = useState<string>('PHIVOLCS Historical');
  const [importVersionLabel, setImportVersionLabel] = useState<string>('v1.0');
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [lastImportAudit, setLastImportAudit] = useState<ImportAuditSummary | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Explicit USGS FDSN query state (only runs on button click)
  const [usgsRadiusKm, setUsgsRadiusKm] = useState<number>(150);
  const [usgsMinMag, setUsgsMinMag] = useState<string>('4.0');
  const [usgsStartTime, setUsgsStartTime] = useState<string>('2000-01-01');
  const [usgsEndTime, setUsgsEndTime] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [usgsLimit, setUsgsLimit] = useState<number>(250);
  const [isFetchingUsgs, setIsFetchingUsgs] = useState<boolean>(false);

  // Map & Cross-Section interaction state
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [showBeachballsOnMap, setShowBeachballsOnMap] = useState<boolean>(true);
  const [showFaultsOnMap, setShowFaultsOnMap] = useState<boolean>(true);
  const [mapZoomSpanDeg, setMapZoomSpanDeg] = useState<number>(3.2);
  const [mapPanOffset, setMapPanOffset] = useState<{ dLat: number; dLon: number }>({
    dLat: 0,
    dLon: 0,
  });
  const [sectionAzimuthDeg, setSectionAzimuthDeg] = useState<number>(90);
  const [sectionHalfWidthKm, setSectionHalfWidthKm] = useState<number>(50);
  const mapSvgRef = useRef<SVGSVGElement | null>(null);

  // Selected mechanisms for future regional stress preparation
  const [selectedMechIds, setSelectedMechIds] = useState<Set<string>>(new Set());

  // Table sort state
  const [sortCol, setSortCol] = useState<'time' | 'mag' | 'depth' | 'dist'>('time');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  const loadCatalog = useCallback(async () => {
    setIsLoadingCatalog(true);
    setCatalogError(null);
    try {
      const resp = await fetch('/api/research/historical-catalog');
      const data = (await resp.json()) as HistoricalCatalogPayload & {
        ok?: boolean;
        error?: string;
      };
      if (!resp.ok || data.ok === false) {
        throw new Error(data.error || `HTTP ${resp.status}`);
      }
      setCatalog(Array.isArray(data.events) ? data.events : []);
      setCatalogVersion(data.catalogVersion ?? 1);
      setCatalogUpdatedAt(data.updatedAt ?? '');
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : 'Unable to load historical catalog.');
    } finally {
      setIsLoadingCatalog(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  // Pre-seed USGS radius when active event changes (still requires explicit click to query)
  useEffect(() => {
    if (!unlocated) {
      setMapPanOffset({ dLat: 0, dLon: 0 });
    }
  }, [event.id, unlocated]);

  // Distinct available magnitude types & sources across loaded catalog
  const availableMagTypes = useMemo(() => {
    const s = new Set<string>();
    catalog.forEach((e) => s.add(e.magnitudeType || 'Unknown'));
    return Array.from(s).sort();
  }, [catalog]);

  const availableSources = useMemo(() => {
    const s = new Set<string>();
    catalog.forEach((e) => s.add(e.dataSource));
    return Array.from(s).sort();
  }, [catalog]);

  // Filtered list relative to active event
  const filtered = useMemo(
    () => filterHistoricalEvents(catalog, event, filters),
    [catalog, event, filters]
  );

  const stats = useMemo(() => computeHistoricalSummaryStats(filtered), [filtered]);

  const filteredWithMechanisms = useMemo(
    () => filtered.filter((item) => item.record.focalMechanism !== null),
    [filtered]
  );

  // Sorted table rows
  const sortedRows = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortCol === 'time') cmp = a.record.originTimeMs - b.record.originTimeMs;
      else if (sortCol === 'dist') cmp = a.distanceKm - b.distanceKm;
      else if (sortCol === 'mag')
        cmp = (a.record.magnitude ?? -99) - (b.record.magnitude ?? -99);
      else if (sortCol === 'depth')
        cmp = (a.record.depthKm ?? 9999) - (b.record.depthKm ?? 9999);
      return sortAsc ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortCol, sortAsc]);

  const selectedItem = useMemo(
    () => filtered.find((f) => f.record.id === selectedRecordId) ?? null,
    [filtered, selectedRecordId]
  );

  // Import CSV / GeoJSON handler
  const handleRunImport = async (rawContent: string, fmt: 'csv' | 'geojson') => {
    if (!rawContent.trim()) {
      setCatalogError('Paste or upload CSV / GeoJSON content before importing.');
      return;
    }
    setIsImporting(true);
    setCatalogError(null);
    try {
      const resp = await fetch('/api/research/historical-catalog/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format: fmt,
          content: rawContent,
          defaultSource: importSourceLabel.trim() || (fmt === 'csv' ? 'CSV Import' : 'GeoJSON Import'),
          catalogVersion: importVersionLabel.trim() || 'v1.0',
          sourceReference: `Imported ${fmt.toUpperCase()} (${importSourceLabel.trim() || 'Analyst File'})`,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || data.ok === false) {
        throw new Error(data.error || `HTTP ${resp.status}`);
      }
      setCatalog(Array.isArray(data.events) ? data.events : []);
      setCatalogVersion(data.catalogVersion ?? catalogVersion);
      setCatalogUpdatedAt(data.updatedAt ?? '');
      setLastImportAudit({
        parsedCount: data.parsedCount ?? 0,
        addedCount: data.addedCount ?? 0,
        exactDuplicates: data.exactDuplicates ?? [],
        uncertainDuplicates: data.uncertainDuplicates ?? [],
        rejections: data.rejections ?? [],
        warnings: data.warnings ?? [],
        sourceLabel: importSourceLabel.trim() || fmt.toUpperCase(),
      });
      setAcknowledgedFingerprint(
        buildHistoricalFingerprint(
          event,
          data.catalogVersion ?? catalogVersion,
          Array.isArray(data.events) ? data.events.length : catalog.length
        )
      );
      onNotice?.(
        `Catalog updated: ${data.addedCount ?? 0} added, ${(data.exactDuplicates ?? []).length} exact duplicates skipped`
      );
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : 'Failed to import catalog.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const inferredFmt: 'csv' | 'geojson' = /\.(geo)?json$/i.test(file.name) ? 'geojson' : 'csv';
    setImportFormat(inferredFmt);
    setImportText(text);
    setImportSourceLabel((prev) => prev || file.name);
    await handleRunImport(text, inferredFmt);
    e.target.value = '';
  };

  const handleFetchUsgs = async () => {
    if (unlocated) {
      setCatalogError('Locate the active earthquake first before running a USGS spatial query.');
      return;
    }
    setIsFetchingUsgs(true);
    setCatalogError(null);
    try {
      const resp = await fetch('/api/research/historical-catalog/usgs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: event.lat,
          lon: event.lon,
          maxradiuskm: usgsRadiusKm,
          minmagnitude: usgsMinMag ? Number(usgsMinMag) : undefined,
          starttime: usgsStartTime || undefined,
          endtime: usgsEndTime || undefined,
          limit: usgsLimit,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || data.ok === false) {
        throw new Error(data.error || `USGS request returned HTTP ${resp.status}`);
      }
      setCatalog(Array.isArray(data.events) ? data.events : []);
      setCatalogVersion(data.catalogVersion ?? catalogVersion);
      setCatalogUpdatedAt(data.updatedAt ?? '');
      setLastImportAudit({
        parsedCount: data.parsedCount ?? 0,
        addedCount: data.addedCount ?? 0,
        exactDuplicates: data.exactDuplicates ?? [],
        uncertainDuplicates: data.uncertainDuplicates ?? [],
        rejections: data.rejections ?? [],
        warnings: data.warnings ?? [],
        sourceLabel: `USGS FDSN API (${usgsStartTime || 'start'} → ${usgsEndTime || 'now'})`,
      });
      setAcknowledgedFingerprint(
        buildHistoricalFingerprint(
          event,
          data.catalogVersion ?? catalogVersion,
          Array.isArray(data.events) ? data.events.length : catalog.length
        )
      );
      onNotice?.(
        `USGS FDSN retrieved ${data.parsedCount ?? 0} events (${data.addedCount ?? 0} new added)`
      );
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : 'USGS FDSN request failed.');
    } finally {
      setIsFetchingUsgs(false);
    }
  };

  const handleDeleteRecord = async (recordId: string) => {
    try {
      const resp = await fetch(`/api/research/historical-catalog/${encodeURIComponent(recordId)}`, {
        method: 'DELETE',
      });
      const data = await resp.json();
      if (!resp.ok || data.ok === false) throw new Error(data.error || 'Delete failed');
      setCatalog(Array.isArray(data.events) ? data.events : []);
      setCatalogVersion(data.catalogVersion ?? catalogVersion + 1);
      setCatalogUpdatedAt(data.updatedAt ?? '');
      if (selectedRecordId === recordId) setSelectedRecordId(null);
      setSelectedMechIds((prev) => {
        const next = new Set(prev);
        next.delete(recordId);
        return next;
      });
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : 'Failed to delete event.');
    }
  };

  const handleClearCatalog = async () => {
    try {
      const resp = await fetch('/api/research/historical-catalog', { method: 'DELETE' });
      const data = await resp.json();
      if (!resp.ok || data.ok === false) throw new Error(data.error || 'Clear failed');
      setCatalog([]);
      setCatalogVersion(data.catalogVersion ?? catalogVersion + 1);
      setCatalogUpdatedAt(data.updatedAt ?? '');
      setSelectedRecordId(null);
      setSelectedMechIds(new Set());
      setLastImportAudit(null);
      onNotice?.('Cleared historical seismicity catalog');
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : 'Failed to clear catalog.');
    }
  };

  // Interactive SVG Map Projection
  const mapBounds = useMemo(() => {
    const baseLat = unlocated ? 12.88 : event.lat;
    const baseLon = unlocated ? 121.77 : event.lon;
    const centerLat = baseLat + mapPanOffset.dLat;
    const centerLon = baseLon + mapPanOffset.dLon;
    const halfLat = mapZoomSpanDeg * 0.5;
    const cosLat = Math.max(0.35, Math.cos((centerLat * Math.PI) / 180));
    const halfLon = (halfLat * (680 / 480)) / cosLat;
    return {
      centerLat,
      centerLon,
      minLat: centerLat - halfLat,
      maxLat: centerLat + halfLat,
      minLon: centerLon - halfLon,
      maxLon: centerLon + halfLon,
      cosLat,
    };
  }, [unlocated, event.lat, event.lon, mapPanOffset, mapZoomSpanDeg]);

  const MAP_W = 680;
  const MAP_H = 480;

  const projectCoord = useCallback(
    (lat: number, lon: number) => {
      const x = ((lon - mapBounds.minLon) / (mapBounds.maxLon - mapBounds.minLon)) * MAP_W;
      const y = ((mapBounds.maxLat - lat) / (mapBounds.maxLat - mapBounds.minLat)) * MAP_H;
      return { x, y };
    },
    [mapBounds]
  );

  // Convert radiusKm circle & cross-section A-A' line into map SVG coordinates
  const radiusKm = resolveRadiusKm(filters);
  const radiusCirclePx = useMemo(() => {
    const degLat = radiusKm / 110.574;
    const degLon = radiusKm / (111.32 * mapBounds.cosLat);
    const rx = (degLon / (mapBounds.maxLon - mapBounds.minLon)) * MAP_W;
    const ry = (degLat / (mapBounds.maxLat - mapBounds.minLat)) * MAP_H;
    return { rx, ry };
  }, [radiusKm, mapBounds]);

  const crossSectionEndpoints = useMemo(() => {
    if (unlocated) return null;
    const azRad = (sectionAzimuthDeg * Math.PI) / 180;
    const dLat = (radiusKm * Math.cos(azRad)) / 110.574;
    const dLon = (radiusKm * Math.sin(azRad)) / (111.32 * mapBounds.cosLat);
    const pA = projectCoord(event.lat - dLat, event.lon - dLon);
    const pB = projectCoord(event.lat + dLat, event.lon + dLon);
    return { pA, pB };
  }, [unlocated, sectionAzimuthDeg, radiusKm, mapBounds.cosLat, event.lat, event.lon, projectCoord]);

  const activeTimeMs = useMemo(() => parseActiveEventUtcMs(event), [event]);
  const activeIsFutureRelativeToNow =
    activeTimeMs !== null && activeTimeMs > Date.now() + 86400_000;

  const toggleSelectionList = (list: string[], value: string): string[] =>
    list.includes(value) ? list.filter((x) => x !== value) : [...list, value];

  const handleSelectAllFilteredMechanisms = (mode: 'all' | 'validated-imported' | 'none') => {
    if (mode === 'none') {
      setSelectedMechIds(new Set());
      return;
    }
    const next = new Set<string>();
    for (const item of filteredWithMechanisms) {
      if (
        mode === 'all' ||
        item.record.focalMechanism?.provenanceKind !== 'Experimental'
      ) {
        next.add(item.record.id);
      }
    }
    setSelectedMechIds(next);
  };

  const selectedMechanismEvents = useMemo(
    () => filteredWithMechanisms.filter((item) => selectedMechIds.has(item.record.id)),
    [filteredWithMechanisms, selectedMechIds]
  );

  return (
    <div className="space-y-3 text-slate-900">
      {/* A. Current Earthquake & Stale Telemetry Header */}
      <section className="bg-[#f5f7fa] border border-slate-600/70 rounded-lg p-3.5 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-blue-700 [text-shadow:0_0_8px_rgba(249,115,22,0.7),0_0_18px_rgba(251,146,60,0.45)]">
                Historical Seismicity &amp; Mechanism Catalog
              </h2>
              <span className="text-[11px] font-mono text-slate-600">
                Read-Only Research · Catalog v{catalogVersion} · {catalog.length} stored events
              </span>
            </div>
            {unlocated ? (
              <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1.5 rounded-xs">
                Active EQP event is currently unlocated. Locate or open a saved earthquake in Data tab to anchor distance/time filters.
              </div>
            ) : (
              <div className="text-xs font-mono tabular-nums text-slate-700">
                Ref Event: <strong className="text-slate-900">{event.filename}</strong> ·{' '}
                UTC {event.originDateGmt} {event.originTimeGmt} ·{' '}
                {event.lat.toFixed(4)}°N, {event.lon.toFixed(4)}°E · Depth {event.depthKm.toFixed(1)} km ·{' '}
                {event.preferredScale}{' '}
                {(event.preferredScale === 'Ms'
                  ? event.ms
                  : event.preferredScale === 'Mb'
                  ? event.mb
                  : event.md
                ).toFixed(1)}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setImportDrawerOpen((v) => !v)}
              className="px-2.5 py-1.5 text-xs font-semibold bg-blue-700 hover:bg-blue-800 text-white rounded-xs inline-flex items-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" />
              Import Catalog / USGS Query
            </button>
            <button
              type="button"
              onClick={() => void loadCatalog()}
              className="px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xs inline-flex items-center gap-1"
              title="Reload catalog from server storage"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingCatalog ? 'animate-spin' : ''}`} />
              Reload
            </button>
            {catalog.length > 0 && (
              <button
                type="button"
                onClick={() => void handleClearCatalog()}
                className="px-2.5 py-1.5 text-xs font-medium bg-white border border-red-200 hover:bg-red-50 text-red-700 rounded-xs inline-flex items-center gap-1"
                title="Clear all stored historical catalog records"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear Catalog
              </button>
            )}
          </div>
        </div>

        {isStale && (
          <div className="mt-2.5 px-3 py-2 bg-amber-50 border border-amber-300 rounded-xs flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
              <span>
                <strong>Stale Evaluation:</strong> The accepted reference earthquake or historical catalog changed since this view was last acknowledged.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setAcknowledgedFingerprint(currentFingerprint)}
              className="px-2.5 py-1 bg-white border border-amber-400 rounded-xs font-semibold text-amber-900 hover:bg-amber-100"
            >
              Mark Synced
            </button>
          </div>
        )}

        {catalogError && (
          <div className="mt-2.5 px-3 py-2 bg-red-50 border border-red-300 rounded-xs text-xs text-red-800">
            {catalogError}
          </div>
        )}
      </section>

      {/* Import & USGS Retrieval Drawer */}
      {importDrawerOpen && (
        <section className="bg-[#f3f1fb] border border-indigo-700/60 rounded-lg p-3.5 space-y-3 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-700/35 pb-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setImportTab('file-paste')}
                className={`px-2.5 py-1 text-xs font-semibold border rounded-xs inline-flex items-center gap-1.5 ${
                  importTab === 'file-paste'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-[#e5e1f7] text-slate-800 border-indigo-800/55 hover:bg-white'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                CSV / GeoJSON Import (PHIVOLCS, ISC, Custom)
              </button>
              <button
                type="button"
                onClick={() => setImportTab('usgs')}
                className={`px-2.5 py-1 text-xs font-semibold border rounded-xs inline-flex items-center gap-1.5 ${
                  importTab === 'usgs'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-[#e5e1f7] text-slate-800 border-indigo-800/55 hover:bg-white'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                USGS FDSN Event API (Optional Online)
              </button>
            </div>
            <button
              type="button"
              onClick={() => setImportDrawerOpen(false)}
              className="text-xs text-slate-600 hover:text-slate-900 px-2 py-0.5 font-medium"
            >
              Close
            </button>
          </div>

          {importTab === 'file-paste' ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 text-xs">
              <div className="space-y-2 bg-[#e5e1f7] border border-indigo-800/55 rounded p-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="font-semibold text-slate-700 block">Format</span>
                    <select
                      value={importFormat}
                      onChange={(e) => setImportFormat(e.target.value as 'csv' | 'geojson')}
                      className="w-full border border-slate-300 rounded-xs px-2 py-1 bg-white"
                    >
                      <option value="csv">CSV Catalog</option>
                      <option value="geojson">GeoJSON FeatureCollection</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="font-semibold text-slate-700 block">Default Version</span>
                    <input
                      type="text"
                      value={importVersionLabel}
                      onChange={(e) => setImportVersionLabel(e.target.value)}
                      className="w-full border border-slate-300 rounded-xs px-2 py-1 font-mono"
                    />
                  </label>
                </div>
                <label className="space-y-1 block">
                  <span className="font-semibold text-slate-700 block">Default Data Source Label</span>
                  <input
                    type="text"
                    value={importSourceLabel}
                    onChange={(e) => setImportSourceLabel(e.target.value)}
                    placeholder="e.g. PHIVOLCS Bulletin / GCMT / ISC"
                    className="w-full border border-slate-300 rounded-xs px-2 py-1"
                  />
                </label>
                <div className="pt-1 flex flex-wrap items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.txt,.json,.geojson"
                    onChange={(e) => void handleFileUpload(e)}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xs font-semibold text-slate-800 inline-flex items-center gap-1"
                  >
                    <Upload className="w-3.5 h-3.5" /> Choose File
                  </button>
                  <button
                    type="button"
                    disabled={isImporting || !importText.trim()}
                    onClick={() => void handleRunImport(importText, importFormat)}
                    className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white rounded-xs font-semibold"
                  >
                    {isImporting ? 'Importing...' : 'Validate & Import'}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Supported CSV columns: <code className="font-mono">event_id, origin_time_utc, lat, lon, depth_km, mag, mag_type, source, quality, strike, dip, rake, mech_source, mech_quality, mech_provenance</code>. Preserves source IDs and flags uncertain cross-source matches without auto-merging.
                </p>
              </div>
              <div className="lg:col-span-2">
                <textarea
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  rows={6}
                  placeholder={
                    importFormat === 'csv'
                      ? 'event_id,origin_time_utc,lat,lon,depth_km,mag,mag_type,source,quality,strike,dip,rake\nPH-2019-001,2019-10-29T01:04:44Z,6.76,125.03,14.0,6.6,Mw,PHIVOLCS,Reviewed,312,78,-15'
                      : '{"type":"FeatureCollection","features":[...]}'
                  }
                  className="w-full h-full min-h-[135px] border border-slate-300 rounded-xs p-2 font-mono text-[11px]"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2.5 text-xs">
              {activeIsFutureRelativeToNow && (
                <div className="px-2.5 py-1.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-xs text-[11px]">
                  Note: Active EQP sample origin date ({event.originDateGmt}) is later than today&apos;s real UTC clock. Adjust USGS start/end dates below to query actual recorded earthquakes up to today.
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                <label className="space-y-1">
                  <span className="font-semibold text-slate-700 block">Radius (km)</span>
                  <input
                    type="number"
                    min={5}
                    max={2000}
                    value={usgsRadiusKm}
                    onChange={(e) => setUsgsRadiusKm(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-xs px-2 py-1 font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="font-semibold text-slate-700 block">Min Mag</span>
                  <input
                    type="number"
                    step="0.1"
                    value={usgsMinMag}
                    onChange={(e) => setUsgsMinMag(e.target.value)}
                    className="w-full border border-slate-300 rounded-xs px-2 py-1 font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="font-semibold text-slate-700 block">Start Date (UTC)</span>
                  <input
                    type="date"
                    value={usgsStartTime}
                    onChange={(e) => setUsgsStartTime(e.target.value)}
                    className="w-full border border-slate-300 rounded-xs px-2 py-1 font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="font-semibold text-slate-700 block">End Date (UTC)</span>
                  <input
                    type="date"
                    value={usgsEndTime}
                    onChange={(e) => setUsgsEndTime(e.target.value)}
                    className="w-full border border-slate-300 rounded-xs px-2 py-1 font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="font-semibold text-slate-700 block">Max Records</span>
                  <input
                    type="number"
                    min={10}
                    max={1000}
                    value={usgsLimit}
                    onChange={(e) => setUsgsLimit(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-xs px-2 py-1 font-mono"
                  />
                </label>
                <div className="flex items-end">
                  <button
                    type="button"
                    disabled={isFetchingUsgs || unlocated}
                    onClick={() => void handleFetchUsgs()}
                    className="w-full px-3 py-1.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white font-semibold rounded-xs"
                  >
                    {isFetchingUsgs ? 'Fetching...' : 'Query USGS API'}
                  </button>
                </div>
              </div>
              <div className="text-[11px] text-slate-500">
                Center: {unlocated ? 'Unavailable' : `${event.lat.toFixed(4)}°N, ${event.lon.toFixed(4)}°E`} · Explicit online request only (`earthquake.usgs.gov/fdsnws/event/1/query`). Origin URL &amp; UTC retrieval timestamp are stored per event.
              </div>
            </div>
          )}

          {lastImportAudit && (
            <div className="bg-[#e5e1f7] border border-indigo-800/55 rounded p-2.5 text-[11px] space-y-1 text-slate-800">
              <div className="font-semibold text-slate-900">
                Import Audit ({lastImportAudit.sourceLabel}): Parsed {lastImportAudit.parsedCount} · Added{' '}
                {lastImportAudit.addedCount} · Exact duplicates skipped{' '}
                {lastImportAudit.exactDuplicates.length} · Potential cross-source duplicates preserved{' '}
                {lastImportAudit.uncertainDuplicates.length} · Rejected{' '}
                {lastImportAudit.rejections.length}
              </div>
              {lastImportAudit.uncertainDuplicates.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 p-2 rounded-xs text-amber-900">
                  <strong>Potential cross-source duplicates flagged (preserved with distinct source IDs):</strong>{' '}
                  {lastImportAudit.uncertainDuplicates
                    .slice(0, 4)
                    .map(
                      (d) =>
                        `${d.incomingSource}:${d.incomingEventId} ≈ ${d.existingSource}:${d.existingEventId} (${d.distanceKm} km, ${d.timeDiffSec} s)`
                    )
                    .join(' | ')}
                </div>
              )}
              {lastImportAudit.rejections.length > 0 && (
                <div className="bg-red-50 border border-red-200 p-2 rounded-xs text-red-800">
                  <strong>Rejected rows:</strong>{' '}
                  {lastImportAudit.rejections
                    .slice(0, 3)
                    .map((r) => `Row ${r.rowNumber}: ${r.reason}`)
                    .join(' | ')}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* B. Search & Filtering Controls */}
      <section className="bg-[#fbf5ea] border border-amber-700/60 rounded-lg p-3.5 space-y-2.5 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-700/35 pb-1.5">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-800">
            Search &amp; Filtering (Relative to Selected Earthquake)
          </h3>
          <button
            type="button"
            onClick={() => setFilters(DEFAULT_HISTORICAL_FILTERS)}
            className="text-[11px] font-medium text-slate-700 hover:text-slate-950 inline-flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" /> Reset Filters
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2.5 text-xs">
          {/* Distance Radius */}
          <div className="space-y-1.5 bg-[#f3e6cc] border border-amber-800/60 rounded p-2.5">
            <div className="font-semibold text-slate-800">Geodesic Radius (km)</div>
            <div className="flex flex-wrap gap-1">
              {(['25', '50', '100', '200', 'custom'] as RadiusPreset[]).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setFilters((f) => ({ ...f, radiusMode: preset }))}
                  className={`px-2 py-1 text-[11px] font-mono border rounded-xs ${
                    filters.radiusMode === preset
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-amber-800/45 hover:bg-amber-50'
                  }`}
                >
                  {preset === 'custom' ? 'Custom' : `${preset} km`}
                </button>
              ))}
              {filters.radiusMode === 'custom' && (
                <input
                  type="number"
                  min={1}
                  max={2000}
                  value={filters.customRadiusKm}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, customRadiusKm: Number(e.target.value) || 50 }))
                  }
                  className="w-20 border border-amber-800/50 bg-white rounded-xs px-1.5 py-0.5 font-mono text-[11px]"
                />
              )}
            </div>
          </div>

          {/* Relative Time Range */}
          <div className="space-y-1.5 bg-[#f3e6cc] border border-amber-800/60 rounded p-2.5">
            <div className="font-semibold text-slate-800">Time Relative to Event Origin (UTC)</div>
            <div className="flex flex-wrap gap-1">
              <select
                value={filters.timeDirection}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, timeDirection: e.target.value as TimeDirectionFilter }))
                }
                className="border border-amber-800/50 rounded-xs px-1.5 py-1 text-[11px] bg-white"
              >
                <option value="both">Before &amp; After</option>
                <option value="before">Before Event Only</option>
                <option value="after">After Event Only</option>
              </select>
              <select
                value={filters.timeWindowPreset}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, timeWindowPreset: e.target.value as TimeWindowPreset }))
                }
                className="border border-amber-800/50 rounded-xs px-1.5 py-1 text-[11px] bg-white"
              >
                <option value="all">All Catalog Dates</option>
                <option value="7d">±7 Days</option>
                <option value="30d">±30 Days</option>
                <option value="365d">±1 Year</option>
                <option value="10y">±10 Years</option>
                <option value="custom">Custom Days</option>
              </select>
            </div>
            {filters.timeWindowPreset === 'custom' && (
              <div className="flex items-center gap-2 text-[11px] pt-0.5">
                <label className="flex items-center gap-1">
                  <span>−d:</span>
                  <input
                    type="number"
                    min={0}
                    value={filters.customDaysBefore}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, customDaysBefore: Number(e.target.value) || 0 }))
                    }
                    className="w-16 border border-amber-800/50 bg-white rounded-xs px-1 py-0.5 font-mono"
                  />
                </label>
                <label className="flex items-center gap-1">
                  <span>+d:</span>
                  <input
                    type="number"
                    min={0}
                    value={filters.customDaysAfter}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, customDaysAfter: Number(e.target.value) || 0 }))
                    }
                    className="w-16 border border-amber-800/50 bg-white rounded-xs px-1 py-0.5 font-mono"
                  />
                </label>
              </div>
            )}
          </div>

          {/* Magnitude & Depth Bounds */}
          <div className="space-y-1.5 bg-[#f3e6cc] border border-amber-800/60 rounded p-2.5">
            <div className="font-semibold text-slate-800">Magnitude &amp; Depth (km) Bounds</div>
            <div className="grid grid-cols-2 gap-1.5">
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="0.1"
                  placeholder="Min M"
                  value={filters.minMag}
                  onChange={(e) => setFilters((f) => ({ ...f, minMag: e.target.value }))}
                  className="w-full border border-amber-800/50 bg-white rounded-xs px-1.5 py-1 font-mono text-[11px]"
                />
                <input
                  type="number"
                  step="0.1"
                  placeholder="Max M"
                  value={filters.maxMag}
                  onChange={(e) => setFilters((f) => ({ ...f, maxMag: e.target.value }))}
                  className="w-full border border-amber-800/50 bg-white rounded-xs px-1.5 py-1 font-mono text-[11px]"
                />
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="1"
                  placeholder="Min Z"
                  value={filters.minDepthKm}
                  onChange={(e) => setFilters((f) => ({ ...f, minDepthKm: e.target.value }))}
                  className="w-full border border-amber-800/50 bg-white rounded-xs px-1.5 py-1 font-mono text-[11px]"
                />
                <input
                  type="number"
                  step="1"
                  placeholder="Max Z"
                  value={filters.maxDepthKm}
                  onChange={(e) => setFilters((f) => ({ ...f, maxDepthKm: e.target.value }))}
                  className="w-full border border-amber-800/50 bg-white rounded-xs px-1.5 py-1 font-mono text-[11px]"
                />
              </div>
            </div>
            <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.includeMissingDepth}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, includeMissingDepth: e.target.checked }))
                }
              />
              Include events with missing depth
            </label>
          </div>

          {/* Mechanism Availability & Quality */}
          <div className="space-y-1.5 bg-[#f3e6cc] border border-amber-800/60 rounded p-2.5">
            <div className="font-semibold text-slate-800">Focal Mechanism &amp; Quality</div>
            <select
              value={filters.mechanismFilter}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  mechanismFilter: e.target.value as HistoricalFilterConfig['mechanismFilter'],
                }))
              }
              className="w-full border border-amber-800/50 rounded-xs px-1.5 py-1 text-[11px] bg-white"
            >
              <option value="all">All Events (With or Without Mechanisms)</option>
              <option value="has-mechanism">Has Focal Mechanism Only</option>
              <option value="imported-or-validated">Imported or Validated Mechanisms</option>
              <option value="validated-only">Validated Mechanisms Only</option>
              <option value="experimental-only">Experimental Mechanisms Only</option>
            </select>
            <div className="flex flex-wrap items-center gap-1 pt-0.5">
              <span className="text-[11px] text-slate-700 mr-1">Quality:</span>
              {MECHANISM_QUALITIES.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() =>
                    setFilters((f) => ({
                      ...f,
                      mechanismQualities: toggleSelectionList(
                        f.mechanismQualities,
                        q
                      ) as MechanismQualityGrade[],
                    }))
                  }
                  className={`px-1.5 py-0.5 text-[10px] font-mono border rounded-xs ${
                    filters.mechanismQualities.includes(q)
                      ? 'bg-blue-700 text-white border-blue-700'
                      : 'bg-white text-slate-700 border-amber-800/45'
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>

        {(availableMagTypes.length > 0 || availableSources.length > 0) && (
          <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-amber-700/35 text-[11px]">
            {availableMagTypes.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                <span className="font-semibold text-slate-700">Mag Scale:</span>
                {availableMagTypes.map((mt) => (
                  <button
                    key={mt}
                    type="button"
                    onClick={() =>
                      setFilters((f) => ({
                        ...f,
                        magTypes: toggleSelectionList(f.magTypes, mt),
                      }))
                    }
                    className={`px-1.5 py-0.5 font-mono border rounded-xs ${
                      filters.magTypes.includes(mt)
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-[#f3e6cc] text-slate-800 border-amber-800/50 hover:bg-[#ebd9b5]'
                    }`}
                  >
                    {mt}
                  </button>
                ))}
              </div>
            )}
            {availableSources.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                <span className="font-semibold text-slate-700">Data Source:</span>
                {availableSources.map((src) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() =>
                      setFilters((f) => ({
                        ...f,
                        dataSources: toggleSelectionList(f.dataSources, src),
                      }))
                    }
                    className={`px-1.5 py-0.5 border rounded-xs ${
                      filters.dataSources.includes(src)
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-[#f3e6cc] text-slate-800 border-amber-800/50 hover:bg-[#ebd9b5]'
                    }`}
                  >
                    {src}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* F. Summary Statistics Strip (Scale-separated) */}
      <section className="bg-[#eff7f6] border border-teal-700/60 rounded-lg p-3 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-6 gap-2.5 text-xs">
          <div className="bg-[#d7ebe8] border border-teal-800/65 rounded p-2.5">
            <div className="text-[10px] font-semibold uppercase text-slate-700">Matching Events</div>
            <div className="text-lg font-bold font-mono tabular-nums text-slate-900">
              {stats.totalMatching}
            </div>
            <div className="text-[11px] font-mono text-slate-700">
              Radius {radiusKm} km · {stats.uncertainLocationCount} uncertain
            </div>
          </div>
          <div className="bg-[#d7ebe8] border border-teal-800/65 rounded p-2.5">
            <div className="text-[10px] font-semibold uppercase text-slate-700">Depth Range (km)</div>
            <div className="text-base font-bold font-mono tabular-nums text-slate-900">
              {stats.depthMinKm !== null && stats.depthMaxKm !== null
                ? `${stats.depthMinKm.toFixed(1)} – ${stats.depthMaxKm.toFixed(1)}`
                : 'Unavailable'}
            </div>
            <div className="text-[11px] font-mono text-slate-700">
              Known {stats.knownDepthCount} · Missing {stats.missingDepthCount}
            </div>
          </div>
          <div className="bg-[#d7ebe8] border border-teal-800/65 rounded p-2.5">
            <div className="text-[10px] font-semibold uppercase text-slate-700">Focal Mechanisms</div>
            <div className="text-lg font-bold font-mono tabular-nums text-slate-900">
              {stats.mechanismCount}
            </div>
            <div className="text-[11px] font-mono text-slate-700">
              Val {stats.validatedMechanismCount} · Imp {stats.importedMechanismCount} · Exp {stats.experimentalMechanismCount}
            </div>
          </div>
          <div className="bg-[#d7ebe8] border border-teal-800/65 rounded p-2.5 sm:col-span-3">
            <div className="text-[10px] font-semibold uppercase text-slate-700">
              Magnitude Breakdown by Scale (Not Combined Across Scales)
            </div>
            {stats.magnitudeBreakdown.length === 0 ? (
              <div className="text-xs text-slate-700 mt-1">No magnitude values in filtered set.</div>
            ) : (
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 font-mono tabular-nums text-[11px] text-slate-900">
                {stats.magnitudeBreakdown.map((b) => (
                  <span key={b.magnitudeType}>
                    <strong>{b.magnitudeType}</strong> (n={b.count}): {b.min.toFixed(1)}–{b.max.toFixed(1)} (mean {b.mean.toFixed(2)})
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* C. Interactive Epicenter Map + Selected Event Inspector */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-3">
        <div className="xl:col-span-8 bg-[#edf4fc] border border-sky-700/60 rounded-lg overflow-hidden flex flex-col shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
          <div className="px-3 py-2 border-b border-sky-800/45 bg-[#dce9f8] flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-bold text-slate-900">
              Interactive Historical Epicenter Map (Depth-Colored · Scaled by Magnitude)
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <label className="inline-flex items-center gap-1 cursor-pointer text-slate-800">
                <input
                  type="checkbox"
                  checked={showBeachballsOnMap}
                  onChange={(e) => setShowBeachballsOnMap(e.target.checked)}
                />
                Beachballs
              </label>
              <label className="inline-flex items-center gap-1 cursor-pointer text-slate-800">
                <input
                  type="checkbox"
                  checked={showFaultsOnMap}
                  onChange={(e) => setShowFaultsOnMap(e.target.checked)}
                />
                Faults/Trenches
              </label>
              <button
                type="button"
                onClick={() => setMapZoomSpanDeg((z) => Math.max(0.4, Number((z * 0.72).toFixed(2))))}
                className="p-1 border border-sky-800/50 bg-white/90 rounded-xs hover:bg-white"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setMapZoomSpanDeg((z) => Math.min(18, Number((z * 1.38).toFixed(2))))}
                className="p-1 border border-sky-800/50 bg-white/90 rounded-xs hover:bg-white"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setMapZoomSpanDeg(3.2);
                  setMapPanOffset({ dLat: 0, dLon: 0 });
                }}
                className="px-1.5 py-0.5 border border-sky-800/50 bg-white/90 rounded-xs hover:bg-white font-medium"
                title="Re-center on Active Event"
              >
                Center
              </button>
              <button
                type="button"
                onClick={() => {
                  const name = `historical_map_${event.filename.replace(/\.eqp$/i, '')}.svg`;
                  if (exportSvgElementAsSvg(mapSvgRef.current, name)) {
                    onNotice?.(`Exported ${name}`);
                  }
                }}
                className="px-1.5 py-0.5 border border-sky-800/50 bg-white/90 rounded-xs hover:bg-white inline-flex items-center gap-1"
              >
                <Download className="w-3 h-3" /> SVG
              </button>
              <button
                type="button"
                onClick={() =>
                  void exportSvgElementAsPng(
                    mapSvgRef.current,
                    `historical_map_${event.filename.replace(/\.eqp$/i, '')}.png`,
                    2
                  ).then((ok) => ok && onNotice?.('Exported map PNG'))
                }
                className="px-1.5 py-0.5 border border-sky-800/50 bg-white/90 rounded-xs hover:bg-white inline-flex items-center gap-1"
              >
                <Download className="w-3 h-3" /> PNG
              </button>
            </div>
          </div>

          <div
            ref={(el) => {
              if (!el) return;
              el.onwheel = (ev: WheelEvent) => {
                ev.preventDefault();
                setMapZoomSpanDeg((z) => {
                  const factor = ev.deltaY > 0 ? 1.18 : 0.85;
                  return Math.max(0.35, Math.min(20, Number((z * factor).toFixed(3))));
                });
              };
            }}
            className="relative bg-sky-50 overflow-hidden cursor-grab active:cursor-grabbing"
            onMouseDown={(downEv) => {
              if (downEv.button !== 0 || (downEv.target as Element)?.closest('circle, g.cursor-pointer')) return;
              const startX = downEv.clientX;
              const startY = downEv.clientY;
              const startOffset = { ...mapPanOffset };
              const rect = downEv.currentTarget.getBoundingClientRect();
              const onMove = (moveEv: MouseEvent) => {
                const dxFrac = (moveEv.clientX - startX) / Math.max(100, rect.width);
                const dyFrac = (moveEv.clientY - startY) / Math.max(100, rect.height);
                const lonSpan = mapBounds.maxLon - mapBounds.minLon;
                const latSpan = mapBounds.maxLat - mapBounds.minLat;
                setMapPanOffset({
                  dLon: startOffset.dLon - dxFrac * lonSpan,
                  dLat: startOffset.dLat + dyFrac * latSpan,
                });
              };
              const onUp = () => {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
              };
              window.addEventListener('mousemove', onMove);
              window.addEventListener('mouseup', onUp);
            }}
          >
            <svg
              ref={mapSvgRef}
              viewBox={`0 0 ${MAP_W} ${MAP_H}`}
              className="w-full h-auto block select-none"
            >
              <rect x={0} y={0} width={MAP_W} height={MAP_H} fill="#e0f2fe" />

              {/* Philippine Island Polygons */}
              {ISLAND_POLYGONS.map((poly, idx) => {
                const pts = poly.points
                  .map(([lon, lat]) => {
                    const p = projectCoord(lat, lon);
                    return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
                  })
                  .join(' ');
                return (
                  <polygon
                    key={`isl-${idx}`}
                    points={pts}
                    fill="#f8fafc"
                    stroke="#94a3b8"
                    strokeWidth={0.8}
                  />
                );
              })}

              {/* Context Faults & Trenches */}
              {showFaultsOnMap &&
                FAULT_TRACES.map((fl, idx) => {
                  const pts = fl.points
                    .map(([lon, lat]) => {
                      const p = projectCoord(lat, lon);
                      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
                    })
                    .join(' ');
                  return (
                    <polyline
                      key={`flt-${idx}`}
                      points={pts}
                      fill="none"
                      stroke={fl.kind === 'boundary' ? '#64748b' : '#b45309'}
                      strokeWidth={fl.kind === 'boundary' ? 1.2 : 1.0}
                      strokeDasharray={fl.kind === 'boundary' ? '5,4' : undefined}
                      strokeOpacity={0.65}
                    >
                      <title>{fl.name}</title>
                    </polyline>
                  );
                })}

              {/* Lat/Lon Grid */}
              {(() => {
                const step = mapZoomSpanDeg <= 1.2 ? 0.25 : mapZoomSpanDeg <= 4 ? 1 : 2;
                const lines: React.ReactNode[] = [];
                const latStart = Math.floor(mapBounds.minLat / step) * step;
                for (let lat = latStart; lat <= mapBounds.maxLat; lat += step) {
                  const y = projectCoord(lat, mapBounds.centerLon).y;
                  lines.push(
                    <g key={`glat-${lat.toFixed(2)}`}>
                      <line x1={0} y1={y} x2={MAP_W} y2={y} stroke="#94a3b8" strokeOpacity={0.25} />
                      <text x={6} y={y - 3} fontSize={9} fill="#475569" fontFamily="monospace">
                        {lat.toFixed(2)}°N
                      </text>
                    </g>
                  );
                }
                const lonStart = Math.floor(mapBounds.minLon / step) * step;
                for (let lon = lonStart; lon <= mapBounds.maxLon; lon += step) {
                  const x = projectCoord(mapBounds.centerLat, lon).x;
                  lines.push(
                    <g key={`glon-${lon.toFixed(2)}`}>
                      <line x1={x} y1={0} x2={x} y2={MAP_H} stroke="#94a3b8" strokeOpacity={0.25} />
                      <text x={x + 3} y={MAP_H - 6} fontSize={9} fill="#475569" fontFamily="monospace">
                        {lon.toFixed(2)}°E
                      </text>
                    </g>
                  );
                }
                return lines;
              })()}

              {/* Search Radius Circle + Cross Section A-A' line */}
              {!unlocated && (() => {
                const centerPx = projectCoord(event.lat, event.lon);
                return (
                  <g>
                    <ellipse
                      cx={centerPx.x}
                      cy={centerPx.y}
                      rx={radiusCirclePx.rx}
                      ry={radiusCirclePx.ry}
                      fill="#1d4ed8"
                      fillOpacity={0.04}
                      stroke="#1d4ed8"
                      strokeWidth={1.3}
                      strokeDasharray="6,4"
                    />
                    {crossSectionEndpoints && (
                      <g>
                        <line
                          x1={crossSectionEndpoints.pA.x}
                          y1={crossSectionEndpoints.pA.y}
                          x2={crossSectionEndpoints.pB.x}
                          y2={crossSectionEndpoints.pB.y}
                          stroke="#0f172a"
                          strokeWidth={1.2}
                          strokeDasharray="3,3"
                        />
                        <text
                          x={crossSectionEndpoints.pA.x}
                          y={crossSectionEndpoints.pA.y - 4}
                          fontSize={10}
                          fontWeight={700}
                          fill="#0f172a"
                        >
                          A
                        </text>
                        <text
                          x={crossSectionEndpoints.pB.x}
                          y={crossSectionEndpoints.pB.y - 4}
                          fontSize={10}
                          fontWeight={700}
                          fill="#0f172a"
                        >
                          A&apos;
                        </text>
                      </g>
                    )}
                  </g>
                );
              })()}

              {/* Historical Events (Circles + Optional Beachballs) */}
              {filtered.map((item) => {
                const pt = projectCoord(item.record.lat, item.record.lon);
                if (pt.x < -30 || pt.x > MAP_W + 30 || pt.y < -30 || pt.y > MAP_H + 30) {
                  return null;
                }
                const isSel = selectedRecordId === item.record.id;
                const r = magnitudeToSymbolRadiusPx(item.record.magnitude);
                const fm = item.record.focalMechanism;

                if (showBeachballsOnMap && fm) {
                  const bbRadius = Math.max(7, Math.min(14, r * 1.45));
                  return (
                    <HistoricalBeachballGlyph
                      key={`map-${item.record.id}`}
                      plane1={fm.plane1}
                      cx={pt.x}
                      cy={pt.y}
                      radius={isSel ? bbRadius + 2 : bbRadius}
                      provenanceKind={fm.provenanceKind}
                      isSelected={isSel}
                      onClick={() => setSelectedRecordId(item.record.id)}
                      title={`${item.record.eventId} · ${item.record.originTimeUtc} · ${item.record.magnitudeType} ${item.record.magnitude ?? 'N/A'} · Z=${item.record.depthKm ?? 'Missing'} km · ${fm.mechanismClass} (${fm.provenanceKind})`}
                    />
                  );
                }

                return (
                  <circle
                    key={`map-${item.record.id}`}
                    cx={pt.x}
                    cy={pt.y}
                    r={isSel ? r + 2.5 : r}
                    fill={depthToColorHex(item.record.depthKm)}
                    fillOpacity={0.85}
                    stroke={isSel ? '#0f172a' : '#ffffff'}
                    strokeWidth={isSel ? 2.2 : 0.8}
                    className="cursor-pointer"
                    onClick={() => setSelectedRecordId(item.record.id)}
                  >
                    <title>{`${item.record.eventId} · ${item.record.originTimeUtc} · ${item.record.magnitudeType} ${item.record.magnitude ?? 'N/A'} · Depth ${item.record.depthKm ?? 'Missing'} km · ${item.distanceKm} km`}</title>
                  </circle>
                );
              })}

              {/* Active Earthquake Epicenter Star Marker (Always Top Layer) */}
              {!unlocated && (() => {
                const p = projectCoord(event.lat, event.lon);
                const starPts = Array.from({ length: 10 }, (_, idx) => {
                  const angle = (idx * Math.PI) / 5 - Math.PI / 2;
                  const rad = idx % 2 === 0 ? 11 : 4.8;
                  return `${(p.x + rad * Math.cos(angle)).toFixed(1)},${(p.y + rad * Math.sin(angle)).toFixed(1)}`;
                }).join(' ');
                return (
                  <g>
                    <polygon points={starPts} fill="#dc2626" stroke="#ffffff" strokeWidth={1.3}>
                      <title>{`Selected Active Event: ${event.filename} (${event.lat.toFixed(4)}°N, ${event.lon.toFixed(4)}°E)`}</title>
                    </polygon>
                  </g>
                );
              })()}
            </svg>
          </div>

          {/* Documented Scale & Depth Color Legend */}
          <div className="px-3 py-2 border-t border-sky-800/45 bg-[#dce9f8] flex flex-wrap items-center justify-between gap-2 text-[10.5px] font-mono text-slate-700">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-semibold text-slate-900">Depth (km):</span>
              {[
                { label: '≤15', color: '#dc2626' },
                { label: '15–35', color: '#ea580c' },
                { label: '35–70', color: '#d97706' },
                { label: '70–150', color: '#0d9488' },
                { label: '150–300', color: '#2563eb' },
                { label: '>300', color: '#6d28d9' },
                { label: 'Missing', color: '#64748b' },
              ].map((d) => (
                <span key={d.label} className="inline-flex items-center gap-1">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full border border-white"
                    style={{ backgroundColor: d.color }}
                  />
                  {d.label}
                </span>
              ))}
            </div>
            <div>
              Size formula: r = 2.2 + 1.42^(M − 1.5) × 1.15 px
            </div>
          </div>
        </div>

        {/* Selected Event Inspector Sidebar */}
        <div className="xl:col-span-4 bg-[#edf7f2] border border-emerald-700/60 rounded-lg p-3.5 flex flex-col justify-between space-y-3 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-800 border-b border-emerald-700/35 pb-1.5">
              Inspected Historical Event
            </h3>
            {!selectedItem ? (
              <div className="py-8 text-center text-xs text-slate-600">
                Click any historical earthquake symbol, chart point, or table row to inspect its catalog parameters, provenance, and focal mechanism.
              </div>
            ) : (
              <div className="mt-2.5 space-y-2.5 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold font-mono text-slate-900">
                      {selectedItem.record.eventId}
                    </div>
                    <div className="text-[11px] text-slate-700">
                      {selectedItem.record.place || 'Region unspecified'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDeleteRecord(selectedItem.record.id)}
                    className="p-1 text-red-700 bg-white/80 hover:bg-red-50 border border-red-400 rounded-xs"
                    title="Remove this record from local research catalog"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 font-mono tabular-nums text-[11px] bg-[#d9eee3] border border-emerald-800/65 p-2.5 rounded">
                  <div>
                    <span className="text-slate-700 block text-[10px] font-medium">Origin Time (UTC)</span>
                    <span className="font-semibold text-slate-900">
                      {selectedItem.record.originTimeUtc.replace('T', ' ').slice(0, 19)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-700 block text-[10px] font-medium">Δt vs Selected Event</span>
                    <span className="font-semibold text-slate-900">
                      {selectedItem.dtHoursRelativeToActive !== null
                        ? `${selectedItem.dtHoursRelativeToActive > 0 ? '+' : ''}${selectedItem.dtHoursRelativeToActive.toFixed(1)} h`
                        : 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-700 block text-[10px] font-medium">Epicenter</span>
                    <span className="font-semibold text-slate-900">
                      {selectedItem.record.lat.toFixed(4)}°, {selectedItem.record.lon.toFixed(4)}°
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-700 block text-[10px] font-medium">Distance / Azimuth</span>
                    <span className="font-semibold text-slate-900">
                      {selectedItem.distanceKm.toFixed(1)} km · {selectedItem.azimuthDeg.toFixed(0)}°
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-700 block text-[10px] font-medium">Depth</span>
                    <span className="font-semibold text-slate-900">
                      {selectedItem.record.depthKm !== null
                        ? `${selectedItem.record.depthKm.toFixed(1)} km (${selectedItem.record.depthStatus})`
                        : 'Missing'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-700 block text-[10px] font-medium">Magnitude</span>
                    <span className="font-semibold text-slate-900">
                      {selectedItem.record.magnitude !== null
                        ? `${selectedItem.record.magnitudeType} ${selectedItem.record.magnitude.toFixed(2)}`
                        : 'Unavailable'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-700 block text-[10px] font-medium">Source / Version</span>
                    <span className="font-semibold text-slate-900">
                      {selectedItem.record.dataSource} ({selectedItem.record.catalogVersion})
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-700 block text-[10px] font-medium">Event Quality</span>
                    <span className="font-semibold text-slate-900">
                      {selectedItem.record.quality}
                      {selectedItem.record.locationUncertain ? ' (Uncertain)' : ''}
                    </span>
                  </div>
                </div>

                <div className="text-[11px] text-slate-700 space-y-1">
                  <div>
                    <strong>Sequence Tag:</strong> {selectedItem.sequenceCandidate}{' '}
                    <span className="text-slate-600">(spatiotemporal heuristic only)</span>
                  </div>
                  <div className="truncate" title={selectedItem.record.sourceReference}>
                    <strong>Reference:</strong> {selectedItem.record.sourceReference}
                  </div>
                  <div className="font-mono text-[10px] text-slate-600">
                    Retrieved: {selectedItem.record.retrievedAtUtc}
                  </div>
                </div>

                {selectedItem.record.focalMechanism ? (
                  <div className="bg-[#d3ebe0] border border-emerald-800/65 rounded p-2.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">Focal Mechanism</span>
                      <span className="text-[10px] font-mono font-semibold text-slate-800">
                        {selectedItem.record.focalMechanism.provenanceKind} · Grade{' '}
                        {selectedItem.record.focalMechanism.quality}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <HistoricalBeachballCardIcon
                        plane1={selectedItem.record.focalMechanism.plane1}
                        provenanceKind={selectedItem.record.focalMechanism.provenanceKind}
                        size={64}
                      />
                      <div className="text-[11px] font-mono tabular-nums space-y-0.5 text-slate-800">
                        <div className="font-sans font-semibold text-slate-900">
                          {selectedItem.record.focalMechanism.mechanismClass}
                        </div>
                        <div>
                          NP1: {selectedItem.record.focalMechanism.plane1.strike}/
                          {selectedItem.record.focalMechanism.plane1.dip}/
                          {selectedItem.record.focalMechanism.plane1.rake}
                        </div>
                        <div>
                          NP2: {selectedItem.record.focalMechanism.plane2.strike}/
                          {selectedItem.record.focalMechanism.plane2.dip}/
                          {selectedItem.record.focalMechanism.plane2.rake}
                        </div>
                        <div>
                          P: {selectedItem.record.focalMechanism.pAxis.trend}°/
                          {selectedItem.record.focalMechanism.pAxis.plunge}° · T:{' '}
                          {selectedItem.record.focalMechanism.tAxis.trend}°/
                          {selectedItem.record.focalMechanism.tAxis.plunge}°
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-[#d3ebe0] border border-emerald-800/55 rounded p-2 text-[11px] text-slate-700">
                    No focal mechanism reported for this historical event. Mechanisms are never fabricated.
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-emerald-700/35 pt-2 text-[10.5px] text-slate-700 leading-snug">
            Causative fault planes cannot be uniquely determined from focal mechanisms or epicenter proximity alone without external geological constraints.
          </div>
        </div>
      </section>

      {/* D. Charts & Interactive Depth Cross-Section */}
      <HistoricalSeismicityCharts
        activeEvent={event}
        filtered={filtered}
        stats={stats}
        selectedRecordId={selectedRecordId}
        onSelectRecord={setSelectedRecordId}
        sectionAzimuthDeg={sectionAzimuthDeg}
        onChangeSectionAzimuth={setSectionAzimuthDeg}
        sectionHalfWidthKm={sectionHalfWidthKm}
        onChangeSectionHalfWidthKm={setSectionHalfWidthKm}
        onNotice={onNotice}
      />

      {/* E. Historical Focal Mechanism Catalog & Multi-Select Collection */}
      <section className="bg-[#f4f1fa] border border-violet-700/60 rounded-lg p-3.5 space-y-2.5 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-violet-700/35 pb-2">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-900">
              Historical Focal Mechanism Catalog ({filteredWithMechanisms.length})
            </h3>
            <p className="text-[11px] text-slate-700">
              Prepared collection for future regional stress analysis. Clearly distinguishes{' '}
              <strong className="text-blue-700">Validated</strong>,{' '}
              <strong className="text-slate-900">Imported</strong>, and{' '}
              <strong className="text-amber-700">Experimental</strong> solutions. Stress inversion is not computed here.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <button
              type="button"
              onClick={() => handleSelectAllFilteredMechanisms('validated-imported')}
              className="px-2 py-1 border border-violet-800/50 bg-[#e6dff6] hover:bg-[#dad0f2] rounded-xs font-medium text-slate-800"
            >
              Select Imported + Validated
            </button>
            <button
              type="button"
              onClick={() => handleSelectAllFilteredMechanisms('all')}
              className="px-2 py-1 border border-violet-800/50 bg-[#e6dff6] hover:bg-[#dad0f2] rounded-xs font-medium text-slate-800"
            >
              Select All ({filteredWithMechanisms.length})
            </button>
            <button
              type="button"
              onClick={() => handleSelectAllFilteredMechanisms('none')}
              className="px-2 py-1 border border-violet-800/50 bg-[#e6dff6] hover:bg-[#dad0f2] rounded-xs font-medium text-slate-800"
            >
              Clear ({selectedMechanismEvents.length})
            </button>
            <button
              type="button"
              disabled={selectedMechanismEvents.length === 0}
              onClick={() => {
                const json = exportStressReadyMechanismDataset(selectedMechanismEvents, {
                  activeEvent: event,
                  catalogVersion,
                });
                triggerTextDownload(
                  `selected_mechanisms_${event.filename.replace(/\.eqp$/i, '')}.json`,
                  json,
                  'application/json'
                );
                onNotice?.(
                  `Exported ${selectedMechanismEvents.length} focal mechanisms for regional stress preparation`
                );
              }}
              className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white rounded-xs font-semibold inline-flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" />
              Export Selected Mechanisms ({selectedMechanismEvents.length})
            </button>
          </div>
        </div>

        {filteredWithMechanisms.length === 0 ? (
          <div className="py-5 text-center text-xs text-slate-600 bg-[#e6dff6] border border-violet-800/50 rounded">
            No events in the filtered set contain focal mechanism parameters (`strike / dip / rake`).
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {filteredWithMechanisms.map((item) => {
              const fm = item.record.focalMechanism!;
              const checked = selectedMechIds.has(item.record.id);
              return (
                <div
                  key={`fm-${item.record.id}`}
                  className={`border rounded p-2.5 flex items-start gap-2.5 transition-colors ${
                    checked
                      ? 'border-blue-800 bg-[#d5e5fb]'
                      : 'border-violet-800/60 bg-[#e6dff6]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedMechIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(item.record.id)) next.delete(item.record.id);
                        else next.add(item.record.id);
                        return next;
                      })
                    }
                    className="mt-1 text-slate-700 hover:text-blue-700 shrink-0"
                    title="Include mechanism in regional stress preparation dataset"
                  >
                    {checked ? (
                      <CheckSquare className="w-4 h-4 text-blue-700" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-600" />
                    )}
                  </button>

                  <div
                    onClick={() => setSelectedRecordId(item.record.id)}
                    className="cursor-pointer shrink-0"
                  >
                    <HistoricalBeachballCardIcon
                      plane1={fm.plane1}
                      provenanceKind={fm.provenanceKind}
                      size={56}
                      isSelected={selectedRecordId === item.record.id}
                    />
                  </div>

                  <div className="min-w-0 flex-1 text-[11px] space-y-0.5">
                    <div className="flex items-center justify-between gap-1">
                      <button
                        type="button"
                        onClick={() => setSelectedRecordId(item.record.id)}
                        className="font-mono font-bold text-slate-900 hover:text-blue-700 truncate"
                      >
                        {item.record.eventId}
                      </button>
                      <span
                        className={`font-mono text-[10px] font-semibold ${
                          fm.provenanceKind === 'Validated'
                            ? 'text-blue-700'
                            : fm.provenanceKind === 'Experimental'
                            ? 'text-amber-800'
                            : 'text-slate-700'
                        }`}
                      >
                        {fm.provenanceKind} · Q:{fm.quality}
                      </span>
                    </div>
                    <div className="font-semibold text-slate-900 truncate">
                      {fm.mechanismClass}
                    </div>
                    <div className="font-mono tabular-nums text-slate-700">
                      {item.record.originTimeUtc.slice(0, 10)} ·{' '}
                      {item.record.magnitude !== null
                        ? `${item.record.magnitudeType} ${item.record.magnitude.toFixed(1)}`
                        : 'M?'} · Z={item.record.depthKm ?? '?'} km · {item.distanceKm} km
                    </div>
                    <div className="font-mono tabular-nums text-slate-800">
                      NP1 {fm.plane1.strike}/{fm.plane1.dip}/{fm.plane1.rake} · NP2{' '}
                      {fm.plane2.strike}/{fm.plane2.dip}/{fm.plane2.rake}
                    </div>
                    <div className="font-mono tabular-nums text-slate-700">
                      P {fm.pAxis.trend}/{fm.pAxis.plunge} · T {fm.tAxis.trend}/{fm.tAxis.plunge} ·{' '}
                      {fm.source}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* F. Filtered Historical Event Table & Provenance Exports */}
      <section className="bg-[#eef6f8] border border-cyan-700/60 rounded-lg overflow-hidden shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
        <div className="px-3 py-2 border-b border-cyan-800/45 bg-[#dfeef2] flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-bold text-slate-900">
            Filtered Historical Catalog Table ({sortedRows.length} events)
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <button
              type="button"
              disabled={sortedRows.length === 0}
              onClick={() => {
                const csv = exportHistoricalCsv(sortedRows, {
                  activeEvent: event,
                  filters,
                  catalogVersion,
                });
                triggerTextDownload(
                  `historical_seismicity_${event.filename.replace(/\.eqp$/i, '')}.csv`,
                  csv,
                  'text/csv;charset=utf-8'
                );
                onNotice?.(`Exported ${sortedRows.length} historical events to CSV`);
              }}
              className="px-2.5 py-1 bg-white hover:bg-slate-100 disabled:opacity-40 border border-slate-300 rounded-xs font-semibold text-slate-800 inline-flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
            <button
              type="button"
              disabled={sortedRows.length === 0}
              onClick={() => {
                const gj = exportHistoricalGeoJson(sortedRows, {
                  activeEvent: event,
                  filters,
                  catalogVersion,
                });
                triggerTextDownload(
                  `historical_seismicity_${event.filename.replace(/\.eqp$/i, '')}.geojson`,
                  gj,
                  'application/geo+json;charset=utf-8'
                );
                onNotice?.(`Exported ${sortedRows.length} historical events to GeoJSON`);
              }}
              className="px-2.5 py-1 bg-white hover:bg-slate-100 disabled:opacity-40 border border-slate-300 rounded-xs font-semibold text-slate-800 inline-flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" /> Export GeoJSON
            </button>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[380px]">
          <table className="w-full text-left border-collapse text-[11px]">
            <thead className="bg-[#d2e7ed] text-slate-800 sticky top-0 z-10 border-b border-cyan-800/55">
              <tr>
                <th className="px-2.5 py-1.5 font-semibold">
                  <button
                    type="button"
                    onClick={() => {
                      setSortAsc(sortCol === 'time' ? !sortAsc : false);
                      setSortCol('time');
                    }}
                    className="hover:underline"
                  >
                    Origin Time (UTC) {sortCol === 'time' ? (sortAsc ? '↑' : '↓') : ''}
                  </button>
                </th>
                <th className="px-2 py-1.5 font-semibold">Event ID</th>
                <th className="px-2 py-1.5 font-semibold">Location / Region</th>
                <th className="px-2 py-1.5 font-semibold text-right">
                  <button
                    type="button"
                    onClick={() => {
                      setSortAsc(sortCol === 'dist' ? !sortAsc : true);
                      setSortCol('dist');
                    }}
                    className="hover:underline"
                  >
                    Dist (km) {sortCol === 'dist' ? (sortAsc ? '↑' : '↓') : ''}
                  </button>
                </th>
                <th className="px-2 py-1.5 font-semibold text-right">
                  <button
                    type="button"
                    onClick={() => {
                      setSortAsc(sortCol === 'depth' ? !sortAsc : true);
                      setSortCol('depth');
                    }}
                    className="hover:underline"
                  >
                    Depth {sortCol === 'depth' ? (sortAsc ? '↑' : '↓') : ''}
                  </button>
                </th>
                <th className="px-2 py-1.5 font-semibold text-right">
                  <button
                    type="button"
                    onClick={() => {
                      setSortAsc(sortCol === 'mag' ? !sortAsc : false);
                      setSortCol('mag');
                    }}
                    className="hover:underline"
                  >
                    Magnitude {sortCol === 'mag' ? (sortAsc ? '↑' : '↓') : ''}
                  </button>
                </th>
                <th className="px-2 py-1.5 font-semibold">Sequence Tag</th>
                <th className="px-2 py-1.5 font-semibold">Source / Quality</th>
                <th className="px-2 py-1.5 font-semibold">Mechanism</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cyan-700/25">
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-slate-600">
                    No matching records in catalog.
                  </td>
                </tr>
              ) : (
                sortedRows.map((item) => {
                  const r = item.record;
                  const isSel = selectedRecordId === r.id;
                  return (
                    <tr
                      key={r.id}
                      onClick={() => setSelectedRecordId(r.id)}
                      className={`cursor-pointer transition-colors ${
                        isSel ? 'bg-sky-200/70' : 'hover:bg-white/70'
                      }`}
                    >
                      <td className="px-2.5 py-1.5 font-mono tabular-nums whitespace-nowrap text-slate-900">
                        {r.originTimeUtc.replace('T', ' ').slice(0, 19)}
                      </td>
                      <td className="px-2 py-1.5 font-mono font-semibold text-slate-900 whitespace-nowrap">
                        {r.eventId}
                      </td>
                      <td className="px-2 py-1.5 text-slate-800 max-w-[210px] truncate">
                        {r.place || `${r.lat.toFixed(3)}°, ${r.lon.toFixed(3)}°`}
                      </td>
                      <td className="px-2 py-1.5 font-mono tabular-nums text-right text-slate-800 whitespace-nowrap">
                        {item.distanceKm.toFixed(1)}
                      </td>
                      <td className="px-2 py-1.5 font-mono tabular-nums text-right text-slate-800 whitespace-nowrap">
                        {r.depthKm !== null ? `${r.depthKm.toFixed(1)} km` : 'Missing'}
                      </td>
                      <td className="px-2 py-1.5 font-mono tabular-nums text-right font-semibold text-slate-900 whitespace-nowrap">
                        {r.magnitude !== null ? `${r.magnitudeType} ${r.magnitude.toFixed(1)}` : '—'}
                      </td>
                      <td className="px-2 py-1.5 text-slate-700 whitespace-nowrap">
                        {item.sequenceCandidate}
                      </td>
                      <td className="px-2 py-1.5 text-slate-800 whitespace-nowrap">
                        {r.dataSource} · {r.quality}
                        {r.locationUncertain ? ' (Uncertain)' : ''}
                      </td>
                      <td className="px-2 py-1.5 text-slate-800 whitespace-nowrap">
                        {r.focalMechanism
                          ? `${r.focalMechanism.provenanceKind} · ${r.focalMechanism.mechanismClass}`
                          : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {catalogUpdatedAt && (
          <div className="px-3 py-1.5 border-t border-cyan-800/40 bg-[#dfeef2] text-[10px] font-mono text-slate-700 flex justify-between">
            <span>Catalog Updated UTC: {catalogUpdatedAt}</span>
            <span>Read-only relative to accepted EQP solutions &amp; PLOTTER1.EXE</span>
          </div>
        )}
      </section>
    </div>
  );
};
