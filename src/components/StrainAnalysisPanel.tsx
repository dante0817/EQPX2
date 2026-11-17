import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Database,
  Download,
  FileSpreadsheet,
  Layers,
  Map as MapIcon,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Trash2,
  Upload,
} from 'lucide-react';
import { EQPEvent, isEventUnlocated } from '../data/eqpData';
import { MechanismQualityGrade } from '../utils/historicalSeismicity';
import {
  buildStrainInputFingerprint,
  computeHorizontalStrainInversion,
  DEFAULT_STRAIN_COMPUTATION_CONFIG,
  DEFAULT_STRAIN_FILTERS,
  exportStrainResultCsv,
  exportStrainResultJson,
  GeodeticDataMode,
  GeodeticObservationRecord,
  HorizontalStrainResult,
  inspectGeoTiffBufferHeader,
  MIN_STRAIN_STATIONS,
  prepareGeodeticObservations,
  StrainAnalysisQuantity,
  StrainComputationConfig,
  StrainFilterConfig,
  StrainRadiusPreset,
  StrainResultStatus,
  StrainTimeFilter,
} from '../utils/geodeticStrain';
import { triggerTextDownload } from './HistoricalBeachballIcon';
import {
  StrainDeformationMapView,
  StrainDisplacementCharts,
  StrainPrincipalAxesGlyph,
  StrainResidualChart,
} from './StrainSubPanels';

export type StrainSectionId = 'data' | 'displacement' | 'strain' | 'map' | 'quality';

interface StrainAnalysisPanelProps {
  event: EQPEvent;
  onNotice?: (msg: string) => void;
}

const QUALITY_GRADES: MechanismQualityGrade[] = ['A', 'B', 'C', 'D', 'Unknown'];

function getStatusClasses(status: StrainResultStatus): string {
  if (status === 'Validated') return 'bg-emerald-50 border-emerald-300 text-emerald-900';
  if (status === 'Experimental') return 'bg-amber-50 border-amber-300 text-amber-900';
  if (status === 'Ambiguous') return 'bg-orange-50 border-orange-300 text-orange-950';
  return 'bg-slate-100 border-slate-300 text-slate-800';
}

export const StrainAnalysisPanel: React.FC<StrainAnalysisPanelProps> = ({ event, onNotice }) => {
  const [section, setSection] = useState<StrainSectionId>('data');

  // Geodetic repository state
  const [observations, setObservations] = useState<GeodeticObservationRecord[]>([]);
  const [datasetVersion, setDatasetVersion] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [importFeedback, setImportFeedback] = useState<string | null>(null);

  // Import modal/paste state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteContent, setPasteContent] = useState('');
  const [pasteFormat, setPasteFormat] = useState<'csv' | 'geojson'>('csv');
  const [importSource, setImportSource] = useState('');
  const [importCrs, setImportCrs] = useState('WGS84 / ITRF2014');
  const [importUnit, setImportUnit] = useState('');
  const [importMode, setImportMode] = useState<'auto' | GeodeticDataMode>('auto');

  // Filters, exclusions, computation config
  const [filters, setFilters] = useState<StrainFilterConfig>(DEFAULT_STRAIN_FILTERS);
  const [manualExcludedIds, setManualExcludedIds] = useState<Set<string>>(() => new Set());
  const [compConfig, setCompConfig] = useState<StrainComputationConfig>(
    DEFAULT_STRAIN_COMPUTATION_CONFIG
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Computation state & staleness tracking
  const [lastResult, setLastResult] = useState<HorizontalStrainResult | null>(null);
  const [lastContextKey, setLastContextKey] = useState<string>('');

  const unlocated = isEventUnlocated(event);

  const loadObservations = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const resp = await fetch('/api/research/geodetic-observations');
      const data = (await resp.json()) as {
        ok?: boolean;
        observations?: GeodeticObservationRecord[];
        datasetVersion?: number;
        error?: string;
      };
      if (!resp.ok || data.ok === false) {
        throw new Error(data.error || `HTTP ${resp.status}`);
      }
      setObservations(Array.isArray(data.observations) ? data.observations : []);
      setDatasetVersion(data.datasetVersion ?? 1);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Unable to load geodetic observations dataset.'
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadObservations();
  }, [loadObservations]);

  const availableSources = useMemo(() => {
    const s = new Set<string>();
    observations.forEach((o) => s.add(o.dataSource));
    return Array.from(s).sort();
  }, [observations]);

  const preparation = useMemo(
    () =>
      prepareGeodeticObservations(
        observations,
        event,
        filters,
        manualExcludedIds,
        compConfig.usePrePostDiffWhenAvailable
      ),
    [observations, event, filters, manualExcludedIds, compConfig.usePrePostDiffWhenAvailable]
  );

  const currentFingerprint = useMemo(
    () => buildStrainInputFingerprint(preparation.includedItems, compConfig, filters, event),
    [preparation.includedItems, compConfig, filters, event]
  );

  const currentContextKey = `v${datasetVersion}::${currentFingerprint}`;
  const isStale = lastResult !== null && lastContextKey !== currentContextKey;

  const handleComputeStrain = useCallback(() => {
    const res = computeHorizontalStrainInversion(preparation, event, compConfig);
    setLastResult(res);
    setLastContextKey(currentContextKey);
    onNotice?.(
      res.status === 'Insufficient Data'
        ? `Strain inversion withheld: ${res.statusReasons[0] ?? 'Insufficient Data'}`
        : `2D Strain calculation completed (${res.status}): ε₁=${res.e1.toFixed(2)}, ε₂=${res.e2.toFixed(2)} ${res.analysisQuantity === 'velocity-strain-rate' ? 'nε/yr' : 'με'}`
    );
  }, [preparation, event, compConfig, currentContextKey, onNotice]);

  useEffect(() => {
    if (!isLoading && lastResult === null) {
      const res = computeHorizontalStrainInversion(preparation, event, compConfig);
      setLastResult(res);
      setLastContextKey(currentContextKey);
    }
  }, [isLoading, lastResult, preparation, event, compConfig, currentContextKey]);

  const submitImportPayload = async (
    format: 'csv' | 'geojson',
    content: string,
    defaultSourceName: string
  ) => {
    setLoadError(null);
    setImportFeedback(null);
    const resp = await fetch('/api/research/geodetic-observations/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        format,
        content,
        defaultSource: importSource.trim() || defaultSourceName,
        datasetId: defaultSourceName,
        defaultCrs: importCrs.trim() || 'WGS84 / ITRF2014',
        defaultUnit: importUnit.trim() || undefined,
        defaultMode: importMode,
      }),
    });
    const data = (await resp.json()) as {
      ok?: boolean;
      observations?: GeodeticObservationRecord[];
      datasetVersion?: number;
      parsedCount?: number;
      addedCount?: number;
      duplicateCount?: number;
      rejections?: Array<{ rowNumber: number; reason: string }>;
      warnings?: string[];
      error?: string;
    };
    if (!resp.ok || data.ok === false) {
      throw new Error(data.error || `HTTP ${resp.status}`);
    }
    setObservations(Array.isArray(data.observations) ? data.observations : []);
    setDatasetVersion(data.datasetVersion ?? datasetVersion + 1);
    const rejCount = data.rejections?.length ?? 0;
    const msg = `Imported ${data.addedCount ?? 0} new records (${data.duplicateCount ?? 0} skipped duplicates, ${rejCount} rejected).`;
    setImportFeedback(msg);
    onNotice?.(msg);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      if (/\.(tif|tiff)$/i.test(file.name)) {
        const buf = await file.arrayBuffer();
        const check = inspectGeoTiffBufferHeader(buf);
        setLoadError(check.message);
        return;
      }
      const text = await file.text();
      const fmt: 'csv' | 'geojson' = /\.(geo)?json$/i.test(file.name) ? 'geojson' : 'csv';
      await submitImportPayload(fmt, text, file.name.replace(/\.[^.]+$/, ''));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to import geodetic file.');
    } finally {
      e.target.value = '';
    }
  };

  const handleDeleteRecord = async (id: string) => {
    try {
      const resp = await fetch(`/api/research/geodetic-observations/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const data = await resp.json();
      if (!resp.ok || data.ok === false) throw new Error(data.error || `HTTP ${resp.status}`);
      setObservations(Array.isArray(data.observations) ? data.observations : []);
      setDatasetVersion(data.datasetVersion ?? datasetVersion + 1);
      if (selectedId === id) setSelectedId(null);
      onNotice?.('Removed geodetic record.');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to delete record.');
    }
  };

  const handleClearDataset = async () => {
    try {
      const resp = await fetch('/api/research/geodetic-observations', { method: 'DELETE' });
      const data = await resp.json();
      if (!resp.ok || data.ok === false) throw new Error(data.error || `HTTP ${resp.status}`);
      setObservations([]);
      setDatasetVersion(data.datasetVersion ?? datasetVersion + 1);
      setSelectedId(null);
      setManualExcludedIds(new Set());
      onNotice?.('Cleared all imported geodetic observations.');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to clear geodetic dataset.');
    }
  };

  const toggleExclude = (id: string) => {
    setManualExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleQuality = (q: MechanismQualityGrade) => {
    setFilters((f) => ({
      ...f,
      qualityGrades: f.qualityGrades.includes(q)
        ? f.qualityGrades.filter((x) => x !== q)
        : [...f.qualityGrades, q],
    }));
  };

  const toggleSource = (src: string) => {
    setFilters((f) => ({
      ...f,
      dataSources: f.dataSources.includes(src)
        ? f.dataSources.filter((x) => x !== src)
        : [...f.dataSources, src],
    }));
  };

  const activeResult = lastResult;
  const hasSolvedStrain =
    activeResult !== null && activeResult.status !== 'Insufficient Data';

  const unitShort =
    compConfig.analysisQuantity === 'velocity-strain-rate' ? 'nε/yr' : 'με';

  const sectionTabs: Array<{ id: StrainSectionId; label: string; icon: React.ReactNode }> = [
    { id: 'data', label: 'Geodetic Data', icon: <Database className="w-3.5 h-3.5" /> },
    { id: 'displacement', label: 'Crustal Displacement', icon: <Activity className="w-3.5 h-3.5" /> },
    { id: 'strain', label: 'Strain & Strain Rate', icon: <BarChart3 className="w-3.5 h-3.5" /> },
    { id: 'map', label: 'Deformation Map', icon: <MapIcon className="w-3.5 h-3.5" /> },
    { id: 'quality', label: 'Quality Assessment', icon: <ShieldAlert className="w-3.5 h-3.5" /> },
  ];

  // Displacement summary stats
  const dispMetrics = useMemo(() => {
    let maxH = 0;
    let maxHStation = '—';
    let maxAbsV = 0;
    let maxVStation = '—';
    let prePostCount = 0;
    preparation.includedGnss.forEach((it) => {
      const h =
        compConfig.analysisQuantity === 'velocity-strain-rate'
          ? it.velHorizMagMmYr
          : it.dispHorizMagMm;
      const v =
        compConfig.analysisQuantity === 'velocity-strain-rate'
          ? it.velUpMmYr
          : it.dispUpMm;
      if (h !== null && h >= maxH) {
        maxH = h;
        maxHStation = it.record.stationId;
      }
      if (v !== null && Math.abs(v) >= maxAbsV) {
        maxAbsV = Math.abs(v);
        maxVStation = it.record.stationId;
      }
      if (it.record.preEastMm !== null && it.record.postEastMm !== null) {
        prePostCount++;
      }
    });
    return { maxH, maxHStation, maxAbsV, maxVStation, prePostCount };
  }, [preparation.includedGnss, compConfig.analysisQuantity]);

  return (
    <div className="space-y-3">
      {/* Module Top Header & Status Bar */}
      <div className="bg-[#f5f7fa] border border-slate-600/70 rounded-lg p-3.5 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)] flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-blue-700 [text-shadow:0_0_8px_rgba(249,115,22,0.7),0_0_18px_rgba(251,146,60,0.45)]">
              Research — Strain & Crustal Deformation Analysis
            </h2>
            {activeResult && (
              <span
                className={`px-2 py-0.5 text-[11px] font-bold border rounded-xs ${getStatusClasses(
                  activeResult.status
                )}`}
              >
                {activeResult.status}
              </span>
            )}
            {isStale && (
              <span className="px-2 py-0.5 text-[11px] font-semibold bg-amber-100 border border-amber-300 text-amber-900 rounded-xs inline-flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Stale — Recompute Needed
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-600">
            Weighted least squares 2D horizontal strain & strain-rate gradient from GNSS vectors + separate InSAR LOS inspection. Read-only relative to EQP solutions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt,.json,.geojson,.tif,.tiff"
            className="hidden"
            onChange={(e) => void handleFileUpload(e)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-2.5 py-1.5 border border-slate-300 bg-slate-50 hover:bg-slate-100 rounded-xs inline-flex items-center gap-1.5 font-medium"
          >
            <Upload className="w-3.5 h-3.5 text-blue-700" /> Import CSV / GeoJSON
          </button>
          <button
            type="button"
            onClick={() => setShowPasteModal(true)}
            className="px-2.5 py-1.5 border border-slate-300 bg-white hover:bg-slate-50 rounded-xs inline-flex items-center gap-1.5"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-slate-700" /> Paste Data
          </button>
          <button
            type="button"
            onClick={handleComputeStrain}
            className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-xs inline-flex items-center gap-1.5"
          >
            <Play className="w-3.5 h-3.5" /> Compute Strain
          </button>
        </div>
      </div>

      {/* Reference Earthquake & Quick Summary Strip */}
      <div className="bg-[#eff7f6] border border-teal-700/60 rounded-lg px-3.5 py-2.5 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)] flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <div className="flex flex-wrap items-center gap-3 text-slate-800">
          <span>
            <strong>Ref EQ:</strong> {event.id}{' '}
            {unlocated
              ? '(Unlocated)'
              : `(${event.lat.toFixed(3)}°N, ${event.lon.toFixed(3)}°E, ${event.depthKm.toFixed(1)} km)`}
          </span>
          <span>
            <strong>Origin:</strong> {`${event.originDateGmt} ${event.originTimeGmt}`.trim() || 'N/A'} UTC
          </span>
          <span>
            <strong>GNSS:</strong> {preparation.includedGnss.length} active /{' '}
            {observations.filter((o) => o.observationType === 'gnss').length} total
          </span>
          <span>
            <strong>InSAR LOS:</strong> {preparation.includedInsar.length} active
          </span>
          <span>
            <strong>CRS:</strong>{' '}
            {preparation.crsList.length > 0 ? preparation.crsList.join(', ') : 'None'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => void loadObservations()}
          className="px-2.5 py-1 border border-teal-800/60 bg-[#d7ebe8] rounded hover:bg-[#c8e4df] inline-flex items-center gap-1 text-slate-800 font-medium"
        >
          <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} /> Refresh DB
        </button>
      </div>

      {loadError && (
        <div className="bg-red-50 border border-red-400 text-red-900 rounded-lg px-3 py-2 text-xs flex items-center justify-between gap-2 shadow-xs">
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => setLoadError(null)}
            className="text-[11px] underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {importFeedback && (
        <div className="bg-[#eef7f2] border border-emerald-700/60 text-emerald-950 rounded-lg px-3 py-2 text-xs flex items-center justify-between gap-2 shadow-xs">
          <span>{importFeedback}</span>
          <button
            type="button"
            onClick={() => setImportFeedback(null)}
            className="text-[11px] underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Five Compact Internal Section Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-slate-500/60 px-1" role="tablist">
        {sectionTabs.map((t) => {
          const active = section === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSection(t.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-b-0 rounded-t transition-colors ${
                active
                  ? 'bg-[#f5f7fa] border-slate-600/80 text-slate-950 font-semibold -mb-px pb-2'
                  : 'bg-[#ccd6e5] border-slate-500/60 text-slate-700 hover:bg-[#e1e7f0]'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Empty State when no observations exist */}
      {!isLoading && observations.length === 0 && (
        <div className="bg-[#f3f1fb] border border-indigo-700/60 rounded-lg p-6 text-center space-y-3 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
          <div className="text-sm font-bold text-slate-800">
            No Geodetic Observations Loaded
          </div>
          <p className="text-xs text-slate-600 max-w-2xl mx-auto">
            Import real GNSS coordinates, displacements (mm/cm/m), velocities (mm/yr), multi-epoch time series, pre/post differences, or InSAR line-of-sight (LOS) measurements via CSV or GeoJSON to begin crustal deformation and 2D horizontal strain analysis. No fabricated observations are pre-populated.
          </p>
          <div className="flex flex-wrap justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-xs inline-flex items-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" /> Import CSV / GeoJSON File
            </button>
            <button
              type="button"
              onClick={() => setShowPasteModal(true)}
              className="px-3 py-1.5 border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium rounded-xs inline-flex items-center gap-1.5"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> Paste CSV / GeoJSON Text
            </button>
          </div>
          <div className="text-[11px] text-slate-700 font-mono bg-[#e5e1f7] border border-indigo-800/55 rounded p-2.5 max-w-3xl mx-auto text-left">
            CSV columns supported: station_id, lat, lon, observation_type (gnss|insar), east, north, up, sigma_e, sigma_n, sigma_u, pre_east, pre_north, post_east, post_north, ve, vn, vu, los_mm, sigma_los, incidence_deg, heading_deg, pass, date, start_date, end_date, units, crs, source, provenance, quality
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* SECTION A: GEODETIC DATA                                             */}
      {/* ==================================================================== */}
      {section === 'data' && observations.length > 0 && (
        <div className="space-y-3">
          {/* Filter Controls Card */}
          <div className="bg-[#fbf5ea] border border-amber-700/60 rounded-lg p-3.5 space-y-3 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-700/35 pb-2">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-800">
                Geodetic Subset Filters & Metadata Validation
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setFilters(DEFAULT_STRAIN_FILTERS);
                    setManualExcludedIds(new Set());
                  }}
                  className="px-2 py-1 text-[11px] border border-slate-300 bg-white hover:bg-slate-100 rounded-xs inline-flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" /> Reset Filters
                </button>
                <button
                  type="button"
                  onClick={() => void handleClearDataset()}
                  className="px-2 py-1 text-[11px] border border-red-300 text-red-700 bg-red-50 hover:bg-red-100 rounded-xs inline-flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" /> Clear Dataset
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Spatial Filter Mode
                </label>
                <select
                  value={filters.centerMode}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      centerMode: e.target.value as StrainFilterConfig['centerMode'],
                    }))
                  }
                  className="w-full border border-slate-300 rounded-xs px-2 py-1 text-xs bg-white"
                >
                  <option value="all-locations">All Stations / Geographic Bounds</option>
                  <option value="active-event" disabled={unlocated}>
                    Around Active Earthquake
                  </option>
                  <option value="custom-point">Around Custom Point</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Radius (km)
                </label>
                <div className="flex gap-1">
                  <select
                    disabled={filters.centerMode === 'all-locations'}
                    value={filters.radiusPreset}
                    onChange={(e) =>
                      setFilters((f) => ({
                        ...f,
                        radiusPreset: e.target.value as StrainRadiusPreset,
                      }))
                    }
                    className="w-full border border-slate-300 rounded-xs px-2 py-1 text-xs bg-white disabled:bg-slate-100"
                  >
                    <option value="25">25 km</option>
                    <option value="50">50 km</option>
                    <option value="100">100 km</option>
                    <option value="200">200 km</option>
                    <option value="500">500 km</option>
                    <option value="custom">Custom</option>
                  </select>
                  {filters.radiusPreset === 'custom' && filters.centerMode !== 'all-locations' && (
                    <input
                      type="number"
                      min={5}
                      max={2000}
                      value={filters.customRadiusKm}
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, customRadiusKm: Number(e.target.value) || 50 }))
                      }
                      className="w-20 border border-slate-300 rounded-xs px-2 py-1 text-xs"
                    />
                  )}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Temporal Filter vs Event
                </label>
                <select
                  value={filters.timeFilter}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      timeFilter: e.target.value as StrainTimeFilter,
                    }))
                  }
                  className="w-full border border-slate-300 rounded-xs px-2 py-1 text-xs bg-white"
                >
                  <option value="all">All Observation Epochs</option>
                  <option value="spans-event">Spans Event Origin Date</option>
                  <option value="post-event">Post-Event Only</option>
                  <option value="pre-event">Pre-Event Only</option>
                  <option value="custom">Custom UTC Date Window</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Provenance Filter
                </label>
                <select
                  value={filters.provenanceFilter}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      provenanceFilter: e.target.value as StrainFilterConfig['provenanceFilter'],
                    }))
                  }
                  className="w-full border border-slate-300 rounded-xs px-2 py-1 text-xs bg-white"
                >
                  <option value="all">All Provenances</option>
                  <option value="validated-only">Validated Only</option>
                  <option value="imported-or-validated">Imported + Validated</option>
                  <option value="exclude-experimental">Exclude Experimental</option>
                </select>
              </div>
            </div>

            {filters.timeFilter === 'custom' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
                <div>
                  <label className="block text-[11px] text-slate-600 mb-0.5">Start UTC</label>
                  <input
                    type="date"
                    value={filters.startDateUtc}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, startDateUtc: e.target.value }))
                    }
                    className="w-full border border-slate-300 rounded-xs px-2 py-1 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-600 mb-0.5">End UTC</label>
                  <input
                    type="date"
                    value={filters.endDateUtc}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, endDateUtc: e.target.value }))
                    }
                    className="w-full border border-slate-300 rounded-xs px-2 py-1 text-xs"
                  />
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 px-2.5 py-2 bg-[#f3e6cc] border border-amber-800/60 rounded text-[11px]">
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-1 cursor-pointer font-medium">
                  <input
                    type="checkbox"
                    checked={filters.includeGnss}
                    onChange={(e) => setFilters((f) => ({ ...f, includeGnss: e.target.checked }))}
                  />
                  Include GNSS Vectors
                </label>
                <label className="inline-flex items-center gap-1 cursor-pointer font-medium">
                  <input
                    type="checkbox"
                    checked={filters.includeInsar}
                    onChange={(e) => setFilters((f) => ({ ...f, includeInsar: e.target.checked }))}
                  />
                  Include InSAR LOS
                </label>
                <span className="text-amber-800/50">|</span>
                <span className="font-semibold text-slate-800">Quality:</span>
                {QUALITY_GRADES.map((q) => (
                  <label key={q} className="inline-flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.qualityGrades.includes(q)}
                      onChange={() => toggleQuality(q)}
                    />
                    {q}
                  </label>
                ))}
              </div>

              {availableSources.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-800">Sources:</span>
                  {availableSources.map((src) => (
                    <label key={src} className="inline-flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filters.dataSources.includes(src)}
                        onChange={() => toggleSource(src)}
                      />
                      {src}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Warnings */}
          {preparation.warnings.length > 0 && (
            <div className="bg-[#fbf5ea] border border-amber-700/70 text-amber-950 rounded-lg px-3.5 py-2.5 text-xs space-y-0.5 shadow-xs">
              {preparation.warnings.map((w, idx) => (
                <div key={idx} className="flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          {/* Observations Table */}
          <div className="bg-[#f1f4f9] border border-slate-600/70 rounded-lg overflow-hidden shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
            <div className="px-3.5 py-2 bg-[#e2e8f2] border-b border-slate-600/50 flex items-center justify-between text-xs">
              <span className="font-bold text-slate-800">
                Imported Geodetic Observations ({preparation.includedItems.length} active /{' '}
                {observations.length} total)
              </span>
              <span className="text-[11px] text-slate-600">
                GNSS vectors & InSAR LOS remain strictly separated
              </span>
            </div>
            <div className="overflow-x-auto max-h-[380px]">
              <table className="w-full text-[11px] border-collapse">
                <thead className="bg-[#dfe6f0] text-slate-800 sticky top-0">
                  <tr>
                    <th className="px-2 py-1.5 text-left border-b border-slate-200">Use</th>
                    <th className="px-2 py-1.5 text-left border-b border-slate-200">Station</th>
                    <th className="px-2 py-1.5 text-left border-b border-slate-200">Type / Mode</th>
                    <th className="px-2 py-1.5 text-right border-b border-slate-200">Lat / Lon</th>
                    <th className="px-2 py-1.5 text-right border-b border-slate-200">E / N / U (mm)</th>
                    <th className="px-2 py-1.5 text-right border-b border-slate-200">Vel (mm/yr)</th>
                    <th className="px-2 py-1.5 text-right border-b border-slate-200">LOS (mm)</th>
                    <th className="px-2 py-1.5 text-left border-b border-slate-200">CRS / Unit</th>
                    <th className="px-2 py-1.5 text-left border-b border-slate-200">Epoch / Provenance</th>
                    <th className="px-2 py-1.5 text-center border-b border-slate-200">Del</th>
                  </tr>
                </thead>
                <tbody>
                  {preparation.items.map((it) => {
                    const rec = it.record;
                    const rowSelected = rec.id === selectedId;
                    return (
                      <tr
                        key={rec.id}
                        onClick={() => setSelectedId(rec.id)}
                        className={`border-b border-slate-100 cursor-pointer ${
                          rowSelected
                            ? 'bg-blue-50'
                            : it.included
                            ? 'hover:bg-slate-50'
                            : 'bg-slate-50 text-slate-400'
                        }`}
                      >
                        <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            disabled={!it.eligibleForFilter}
                            checked={it.included}
                            onChange={() => toggleExclude(rec.id)}
                            title={it.exclusionReason ?? 'Toggle station inclusion'}
                          />
                        </td>
                        <td className="px-2 py-1.5 font-semibold text-slate-900">
                          {rec.stationId}
                          {it.distanceKm !== null && (
                            <div className="text-[10px] font-normal text-slate-500">
                              {it.distanceKm.toFixed(1)} km
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <span
                            className={`px-1.5 py-0.5 rounded-xs font-semibold text-[10px] ${
                              rec.observationType === 'gnss'
                                ? 'bg-blue-100 text-blue-900'
                                : 'bg-purple-100 text-purple-900'
                            }`}
                          >
                            {rec.observationType.toUpperCase()} · {rec.dataMode}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono">
                          {rec.lat.toFixed(4)}, {rec.lon.toFixed(4)}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono">
                          {it.dispEastMm !== null
                            ? `${it.dispEastMm.toFixed(1)} / ${it.dispNorthMm?.toFixed(1) ?? '—'} / ${it.dispUpMm?.toFixed(1) ?? '—'}`
                            : '—'}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono">
                          {it.velEastMmYr !== null
                            ? `${it.velEastMmYr.toFixed(1)} / ${it.velNorthMmYr?.toFixed(1) ?? '—'}`
                            : '—'}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono">
                          {rec.losDisplacementMm !== null
                            ? `${rec.losDisplacementMm.toFixed(1)} (${rec.passDirection})`
                            : '—'}
                        </td>
                        <td className="px-2 py-1.5">
                          <div>{rec.crs}</div>
                          <div className="text-[10px] text-slate-500">orig: {rec.originalUnit}</div>
                        </td>
                        <td className="px-2 py-1.5">
                          <div>{rec.provenanceKind} · {rec.quality}</div>
                          <div className="text-[10px] text-slate-500">
                            {rec.observationDateUtc ? rec.observationDateUtc.slice(0, 10) : rec.dataSource}
                          </div>
                        </td>
                        <td className="px-2 py-1.5 text-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => void handleDeleteRecord(rec.id)}
                            className="p-1 text-slate-400 hover:text-red-600"
                            title="Delete record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* SECTION B: CRUSTAL DISPLACEMENT                                      */}
      {/* ==================================================================== */}
      {section === 'displacement' && observations.length > 0 && (
        <div className="space-y-3">
          {/* Metrics Strip */}
          <div className="bg-[#eff7f6] border border-teal-700/60 rounded-lg p-3 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)] grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-[#d7ebe8] border border-teal-800/65 rounded p-2.5">
              <div className="text-[10px] uppercase text-teal-900 font-semibold">
                Max Horizontal {compConfig.analysisQuantity === 'velocity-strain-rate' ? 'Rate' : 'Displacement'}
              </div>
              <div className="text-base font-bold text-slate-900 font-mono">
                {dispMetrics.maxH.toFixed(2)}{' '}
                <span className="text-xs font-normal text-slate-700">
                  {compConfig.analysisQuantity === 'velocity-strain-rate' ? 'mm/yr' : 'mm'}
                </span>
              </div>
              <div className="text-[10px] text-slate-600">Station: {dispMetrics.maxHStation}</div>
            </div>
            <div className="bg-[#d7ebe8] border border-teal-800/65 rounded p-2.5">
              <div className="text-[10px] uppercase text-teal-900 font-semibold">
                Peak |Vertical|
              </div>
              <div className="text-base font-bold text-slate-900 font-mono">
                {dispMetrics.maxAbsV.toFixed(2)}{' '}
                <span className="text-xs font-normal text-slate-700">
                  {compConfig.analysisQuantity === 'velocity-strain-rate' ? 'mm/yr' : 'mm'}
                </span>
              </div>
              <div className="text-[10px] text-slate-600">Station: {dispMetrics.maxVStation}</div>
            </div>
            <div className="bg-[#d7ebe8] border border-teal-800/65 rounded p-2.5">
              <div className="text-[10px] uppercase text-teal-900 font-semibold">
                Active GNSS Stations
              </div>
              <div className="text-base font-bold text-slate-900 font-mono">
                {preparation.includedGnss.length}
              </div>
              <div className="text-[10px] text-slate-600">
                Pre/Post diff rows: {dispMetrics.prePostCount}
              </div>
            </div>
            <div className="bg-[#d7ebe8] border border-teal-800/65 rounded p-2.5">
              <div className="text-[10px] uppercase text-teal-900 font-semibold">
                InSAR LOS Samples
              </div>
              <div className="text-base font-bold text-slate-900 font-mono">
                {preparation.includedInsar.length}
              </div>
              <div className="text-[10px] text-slate-600">LOS only (not 3D vectors)</div>
            </div>
          </div>

          <div className="bg-[#edf4fc] border border-sky-700/60 text-sky-950 rounded-lg px-3.5 py-2.5 text-[11px] shadow-xs">
            <strong>Reference Epoch & Interpretation Guard:</strong> Displacements are referenced geographically and temporally to active earthquake <strong>{event.id}</strong> ({`${event.originDateGmt} ${event.originTimeGmt}`.trim() || 'unspec origin'} UTC). Observed vectors may include interseismic, postseismic, volcanic, hydrologic, or anthropogenic signals; inspect each station&apos;s epoch window before attributing motion exclusively to this earthquake.
          </div>

          <StrainDisplacementCharts
            gnssItems={preparation.includedGnss}
            analysisQuantity={compConfig.analysisQuantity}
            selectedStationId={selectedId}
            onSelectStation={setSelectedId}
          />

          {/* Detailed GNSS Component Table */}
          <div className="bg-[#f1f4f9] border border-slate-600/70 rounded-lg overflow-hidden shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
            <div className="px-3.5 py-2 bg-[#e2e8f2] border-b border-slate-600/50 text-xs font-bold text-slate-800">
              GNSS Station Components, Magnitude, Azimuth & Uncertainties
            </div>
            <div className="overflow-x-auto max-h-[300px]">
              <table className="w-full text-[11px] border-collapse">
                <thead className="bg-[#dfe6f0] text-slate-800 sticky top-0">
                  <tr>
                    <th className="px-2 py-1.5 text-left border-b border-slate-200">Station</th>
                    <th className="px-2 py-1.5 text-right border-b border-slate-200">Dist (km)</th>
                    <th className="px-2 py-1.5 text-right border-b border-slate-200">dE ± σ (mm)</th>
                    <th className="px-2 py-1.5 text-right border-b border-slate-200">dN ± σ (mm)</th>
                    <th className="px-2 py-1.5 text-right border-b border-slate-200">dU ± σ (mm)</th>
                    <th className="px-2 py-1.5 text-right border-b border-slate-200">|U_h| (mm)</th>
                    <th className="px-2 py-1.5 text-right border-b border-slate-200">Azimuth</th>
                    <th className="px-2 py-1.5 text-right border-b border-slate-200">Radial u_R</th>
                    <th className="px-2 py-1.5 text-left border-b border-slate-200">Epoch / Signal Source</th>
                  </tr>
                </thead>
                <tbody>
                  {preparation.includedGnss.map((it) => (
                    <tr
                      key={it.record.id}
                      onClick={() => setSelectedId(it.record.id)}
                      className={`border-b border-slate-100 cursor-pointer ${
                        it.record.id === selectedId ? 'bg-blue-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="px-2 py-1.5 font-semibold text-slate-900">{it.record.stationId}</td>
                      <td className="px-2 py-1.5 text-right font-mono">
                        {it.distanceKm !== null ? it.distanceKm.toFixed(1) : '—'}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono">
                        {it.dispEastMm !== null
                          ? `${it.dispEastMm.toFixed(2)}${it.dispSigmaEastMm !== null ? ` ± ${it.dispSigmaEastMm.toFixed(2)}` : ''}`
                          : '—'}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono">
                        {it.dispNorthMm !== null
                          ? `${it.dispNorthMm.toFixed(2)}${it.dispSigmaNorthMm !== null ? ` ± ${it.dispSigmaNorthMm.toFixed(2)}` : ''}`
                          : '—'}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono">
                        {it.dispUpMm !== null
                          ? `${it.dispUpMm.toFixed(2)}${it.dispSigmaUpMm !== null ? ` ± ${it.dispSigmaUpMm.toFixed(2)}` : ''}`
                          : '—'}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono font-semibold text-blue-900">
                        {it.dispHorizMagMm !== null ? it.dispHorizMagMm.toFixed(2) : '—'}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono">
                        {it.dispAzimuthDeg !== null ? `${it.dispAzimuthDeg.toFixed(1)}°` : '—'}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono">
                        {it.dispRadialMm !== null ? `${it.dispRadialMm.toFixed(2)}` : '—'}
                      </td>
                      <td className="px-2 py-1.5">
                        {it.epochRelation} · <span className="text-slate-500">{it.dispSourceLabel}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* SECTION C: STRAIN & STRAIN RATE                                      */}
      {/* ==================================================================== */}
      {section === 'strain' && observations.length > 0 && (
        <div className="space-y-3">
          {/* Parameters Bar */}
          <div className="bg-[#f3f1fb] border border-indigo-700/60 rounded-lg p-3.5 flex flex-wrap items-end justify-between gap-3 text-xs shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 flex-1">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Analysis Quantity
                </label>
                <select
                  value={compConfig.analysisQuantity}
                  onChange={(e) =>
                    setCompConfig((c) => ({
                      ...c,
                      analysisQuantity: e.target.value as StrainAnalysisQuantity,
                    }))
                  }
                  className="w-full border border-slate-300 rounded-xs px-2 py-1 text-xs bg-white"
                >
                  <option value="displacement-strain">Displacement Strain (μstrain)</option>
                  <option value="velocity-strain-rate">Velocity Strain Rate (nanostrain/yr)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Least Squares Weighting
                </label>
                <select
                  value={compConfig.weightingMode}
                  onChange={(e) =>
                    setCompConfig((c) => ({
                      ...c,
                      weightingMode: e.target.value as 'wls' | 'ols',
                    }))
                  }
                  className="w-full border border-slate-300 rounded-xs px-2 py-1 text-xs bg-white"
                >
                  <option value="wls">Weighted Least Squares (1/σ²)</option>
                  <option value="ols">Ordinary Least Squares (Uniform)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Default Unspecified σ ({compConfig.analysisQuantity === 'velocity-strain-rate' ? 'mm/yr' : 'mm'})
                </label>
                <input
                  type="number"
                  min={0.1}
                  step={0.5}
                  value={
                    compConfig.analysisQuantity === 'velocity-strain-rate'
                      ? compConfig.defaultSigmaMmYr
                      : compConfig.defaultSigmaMm
                  }
                  onChange={(e) => {
                    const v = Math.max(0.1, Number(e.target.value) || 1);
                    setCompConfig((c) =>
                      c.analysisQuantity === 'velocity-strain-rate'
                        ? { ...c, defaultSigmaMmYr: v }
                        : { ...c, defaultSigmaMm: v }
                    );
                  }}
                  className="w-full border border-slate-300 rounded-xs px-2 py-1 text-xs"
                />
              </div>
              <div className="flex items-center pb-1">
                <label className="inline-flex items-center gap-1.5 cursor-pointer text-[11px]">
                  <input
                    type="checkbox"
                    checked={compConfig.usePrePostDiffWhenAvailable}
                    onChange={(e) =>
                      setCompConfig((c) => ({
                        ...c,
                        usePrePostDiffWhenAvailable: e.target.checked,
                      }))
                    }
                  />
                  Prefer Post − Pre differential
                </label>
              </div>
            </div>

            <button
              type="button"
              onClick={handleComputeStrain}
              className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-xs inline-flex items-center gap-1.5 shrink-0"
            >
              <Play className="w-3.5 h-3.5" /> Recompute Tensor
            </button>
          </div>

          {!hasSolvedStrain || !activeResult ? (
            <div className="bg-[#fbf5ea] border border-amber-700/60 rounded-lg p-4 space-y-2 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <AlertTriangle className="w-4 h-4 text-amber-700" />
                2D Horizontal Strain Tensor Withheld ({activeResult?.status ?? 'Insufficient Data'})
              </div>
              <ul className="list-disc pl-5 text-xs text-slate-700 space-y-1">
                {(activeResult?.statusReasons ?? [`Requires >= ${MIN_STRAIN_STATIONS} non-collinear GNSS stations.`]).map(
                  (r, i) => (
                    <li key={i}>{r}</li>
                  )
                )}
              </ul>
              {activeResult?.insarSummary && (
                <div className="mt-2 bg-[#f3e6cc] border border-amber-800/60 rounded p-2.5 text-xs text-slate-900">
                  <strong>InSAR Line-of-Sight Summary ({activeResult.insarSummary.count} points):</strong> Min = {activeResult.insarSummary.minLosMm.toFixed(2)} mm, Max = {activeResult.insarSummary.maxLosMm.toFixed(2)} mm, Mean = {activeResult.insarSummary.meanLosMm.toFixed(2)} mm, RMS = {activeResult.insarSummary.rmsLosMm.toFixed(2)} mm. {activeResult.insarSummary.note}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Tensor Component Cards */}
              <div className="bg-[#eff7f6] border border-teal-700/60 rounded-lg p-3 space-y-2.5 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="bg-[#d7ebe8] border border-teal-800/65 rounded p-2.5">
                    <div className="text-[10px] uppercase text-teal-900 font-semibold">
                      Normal East (εxx)
                    </div>
                    <div className="text-base font-bold font-mono text-slate-900">
                      {activeResult.exx >= 0 ? '+' : ''}
                      {activeResult.exx.toFixed(3)} <span className="text-[11px] font-normal">{unitShort}</span>
                    </div>
                    <div className="text-[10px] text-slate-600 font-mono">
                      ± {activeResult.sigmaExx.toFixed(3)} {unitShort}
                    </div>
                  </div>
                  <div className="bg-[#d7ebe8] border border-teal-800/65 rounded p-2.5">
                    <div className="text-[10px] uppercase text-teal-900 font-semibold">
                      Normal North (εyy)
                    </div>
                    <div className="text-base font-bold font-mono text-slate-900">
                      {activeResult.eyy >= 0 ? '+' : ''}
                      {activeResult.eyy.toFixed(3)} <span className="text-[11px] font-normal">{unitShort}</span>
                    </div>
                    <div className="text-[10px] text-slate-600 font-mono">
                      ± {activeResult.sigmaEyy.toFixed(3)} {unitShort}
                    </div>
                  </div>
                  <div className="bg-[#d7ebe8] border border-teal-800/65 rounded p-2.5">
                    <div className="text-[10px] uppercase text-teal-900 font-semibold">
                      Tensor Shear (εxy)
                    </div>
                    <div className="text-base font-bold font-mono text-slate-900">
                      {activeResult.exy >= 0 ? '+' : ''}
                      {activeResult.exy.toFixed(3)} <span className="text-[11px] font-normal">{unitShort}</span>
                    </div>
                    <div className="text-[10px] text-slate-600 font-mono">
                      ± {activeResult.sigmaExy.toFixed(3)} {unitShort}
                    </div>
                  </div>
                  <div className="bg-[#d7ebe8] border border-teal-800/65 rounded p-2.5">
                    <div className="text-[10px] uppercase text-teal-900 font-semibold">
                      Rigid Rotation (ω)
                    </div>
                    <div className="text-base font-bold font-mono text-slate-900">
                      {activeResult.rotation >= 0 ? '+' : ''}
                      {activeResult.rotation.toFixed(3)}
                    </div>
                    <div className="text-[10px] text-slate-600 font-mono">
                      ± {activeResult.sigmaRotation.toFixed(3)} {activeResult.rotationUnit}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="bg-[#dce9f8] border border-sky-800/65 rounded p-2.5">
                    <div className="text-[10px] uppercase text-sky-900 font-semibold">
                      Max Extension (ε₁)
                    </div>
                    <div className="text-base font-bold font-mono text-sky-950">
                      {activeResult.e1 >= 0 ? '+' : ''}
                      {activeResult.e1.toFixed(3)} {unitShort}
                    </div>
                    <div className="text-[10px] text-sky-900 font-mono">
                      Az N{activeResult.e1AzimuthDeg.toFixed(1)}°E ± {activeResult.axisAzimuthUncertaintyDeg.toFixed(1)}°
                    </div>
                  </div>
                  <div className="bg-rose-100/90 border border-rose-800/60 rounded p-2.5">
                    <div className="text-[10px] uppercase text-rose-900 font-semibold">
                      Min / Shortening (ε₂)
                    </div>
                    <div className="text-base font-bold font-mono text-rose-950">
                      {activeResult.e2 >= 0 ? '+' : ''}
                      {activeResult.e2.toFixed(3)} {unitShort}
                    </div>
                    <div className="text-[10px] text-rose-900 font-mono">
                      Az N{activeResult.e2AzimuthDeg.toFixed(1)}°E ± {activeResult.axisAzimuthUncertaintyDeg.toFixed(1)}°
                    </div>
                  </div>
                  <div className="bg-[#d7ebe8] border border-teal-800/65 rounded p-2.5">
                    <div className="text-[10px] uppercase text-teal-900 font-semibold">
                      Max Eng Shear (γ_max)
                    </div>
                    <div className="text-base font-bold font-mono text-slate-900">
                      {activeResult.maxShearEngineering.toFixed(3)} {unitShort}
                    </div>
                    <div className="text-[10px] text-slate-600 font-mono">
                      ± {activeResult.sigmaMaxShear.toFixed(3)} {unitShort}
                    </div>
                  </div>
                  <div className="bg-[#d7ebe8] border border-teal-800/65 rounded p-2.5">
                    <div className="text-[10px] uppercase text-teal-900 font-semibold">
                      Dilatation (Δ = εxx+εyy)
                    </div>
                    <div className="text-base font-bold font-mono text-slate-900">
                      {activeResult.dilatation >= 0 ? '+' : ''}
                      {activeResult.dilatation.toFixed(3)} {unitShort}
                    </div>
                    <div className="text-[10px] text-slate-600 font-mono">
                      ± {activeResult.sigmaDilatation.toFixed(3)} {unitShort}
                    </div>
                  </div>
                </div>
              </div>

              <StrainPrincipalAxesGlyph result={activeResult} onNotice={onNotice} />

              <div className="bg-[#eef7f2] border border-emerald-700/60 rounded-lg p-3.5 text-xs space-y-1.5 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
                <div className="font-bold uppercase tracking-wide text-emerald-950">
                  Deterministic Interpretation ({activeResult.strainStyleLabel})
                </div>
                <p className="text-slate-800">{activeResult.deterministicInterpretation}</p>
                {activeResult.insarSummary && (
                  <p className="text-[11px] text-indigo-950 bg-[#e5e1f7] border border-indigo-800/55 rounded px-2.5 py-1.5">
                    <strong>InSAR LOS Companion Data ({activeResult.insarSummary.count} pts):</strong>{' '}
                    Range [{activeResult.insarSummary.minLosMm.toFixed(2)}, {activeResult.insarSummary.maxLosMm.toFixed(2)}] mm (RMS {activeResult.insarSummary.rmsLosMm.toFixed(2)} mm). {activeResult.insarSummary.note}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* SECTION D: DEFORMATION MAP                                           */}
      {/* ==================================================================== */}
      {section === 'map' && observations.length > 0 && (
        <StrainDeformationMapView
          activeEvent={event}
          gnssItems={preparation.includedGnss}
          insarItems={preparation.includedInsar}
          result={activeResult}
          analysisQuantity={compConfig.analysisQuantity}
          centerLat={preparation.centerLat}
          centerLon={preparation.centerLon}
          effectiveRadiusKm={preparation.effectiveRadiusKm}
          selectedId={selectedId}
          onSelectObservation={setSelectedId}
          onNotice={onNotice}
        />
      )}

      {/* ==================================================================== */}
      {/* SECTION E: QUALITY ASSESSMENT & EXPORTS                              */}
      {/* ==================================================================== */}
      {section === 'quality' && observations.length > 0 && activeResult && (
        <div className="space-y-3">
          <div className="bg-[#eef7f2] border border-emerald-700/60 rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-2 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
            <div className="flex items-center gap-2">
              {activeResult.status === 'Validated' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-700" />
              ) : (
                <ShieldAlert className="w-4 h-4 text-amber-700" />
              )}
              <span className="text-xs font-bold uppercase tracking-wide text-slate-800">
                Verification Status:
              </span>
              <span
                className={`px-2 py-0.5 text-[11px] font-bold border rounded-xs ${getStatusClasses(
                  activeResult.status
                )}`}
              >
                {activeResult.status}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const csv = exportStrainResultCsv(activeResult, preparation);
                  triggerTextDownload(`strain_analysis_${event.id}.csv`, csv, 'text/csv;charset=utf-8');
                  onNotice?.('Exported strain_analysis CSV');
                }}
                className="px-2.5 py-1 text-xs border border-emerald-800/55 bg-[#d8ede2] hover:bg-[#c8e4d5] rounded inline-flex items-center gap-1.5 font-medium"
              >
                <Download className="w-3.5 h-3.5" /> Export CSV
              </button>
              <button
                type="button"
                onClick={() => {
                  const json = exportStrainResultJson(activeResult, preparation, event);
                  triggerTextDownload(`strain_analysis_${event.id}.json`, json, 'application/json');
                  onNotice?.('Exported strain_analysis JSON');
                }}
                className="px-2.5 py-1 text-xs border border-emerald-800/55 bg-[#d8ede2] hover:bg-[#c8e4d5] rounded inline-flex items-center gap-1.5 font-medium"
              >
                <Download className="w-3.5 h-3.5" /> Export JSON
              </button>
            </div>
          </div>

          <div className="bg-[#eff7f6] border border-teal-700/60 rounded-lg p-3 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)] grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            <div className="bg-[#d7ebe8] border border-teal-800/65 rounded p-2.5">
              <div className="text-[10px] uppercase text-teal-900 font-semibold">Usable GNSS</div>
              <div className="text-sm font-bold font-mono text-slate-900">
                {activeResult.usableStationCount} / {observations.filter((o) => o.observationType === 'gnss').length}
              </div>
            </div>
            <div className="bg-[#d7ebe8] border border-teal-800/65 rounded p-2.5">
              <div className="text-[10px] uppercase text-teal-900 font-semibold">Aperture / Span</div>
              <div className="text-sm font-bold font-mono text-slate-900">
                {activeResult.spatialApertureKm.toFixed(1)} km
              </div>
            </div>
            <div className="bg-[#d7ebe8] border border-teal-800/65 rounded p-2.5">
              <div className="text-[10px] uppercase text-teal-900 font-semibold">Aspect Ratio</div>
              <div className="text-sm font-bold font-mono text-slate-900">
                {activeResult.networkAspectRatio.toFixed(3)}
              </div>
            </div>
            <div className="bg-[#d7ebe8] border border-teal-800/65 rounded p-2.5">
              <div className="text-[10px] uppercase text-teal-900 font-semibold">Condition κ</div>
              <div className="text-sm font-bold font-mono text-slate-900">
                {Number.isFinite(activeResult.conditionNumber)
                  ? activeResult.conditionNumber.toFixed(1)
                  : '∞'}
              </div>
            </div>
            <div className="bg-[#d7ebe8] border border-teal-800/65 rounded p-2.5">
              <div className="text-[10px] uppercase text-teal-900 font-semibold">DOF / Reduced χ²</div>
              <div className="text-sm font-bold font-mono text-slate-900">
                {activeResult.degreesOfFreedom} /{' '}
                {activeResult.chi2Reduced !== null ? activeResult.chi2Reduced.toFixed(2) : 'N/A'}
              </div>
            </div>
            <div className="bg-[#d7ebe8] border border-teal-800/65 rounded p-2.5">
              <div className="text-[10px] uppercase text-teal-900 font-semibold">RMS Residual</div>
              <div className="text-sm font-bold font-mono text-slate-900">
                {activeResult.rmsResidualVector.toFixed(2)} {activeResult.vectorUnit}
              </div>
            </div>
          </div>

          <div className="bg-[#fbf5ea] border border-amber-700/60 rounded-lg p-3.5 text-xs space-y-2.5 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
            <div className="font-bold uppercase tracking-wide text-slate-800 border-b border-amber-700/35 pb-1">
              Data Consistency, Observation Span & Scientific Limitations
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
              <div className="space-y-1 bg-[#f3e6cc] border border-amber-800/60 rounded p-2.5">
                <div>
                  <strong>Observation Span:</strong>{' '}
                  {preparation.earliestUtc && preparation.latestUtc
                    ? `${preparation.earliestUtc} to ${preparation.latestUtc}`
                    : 'Not specified'}
                </div>
                <div>
                  <strong>CRS Consistency:</strong>{' '}
                  {preparation.hasMixedCrs
                    ? `WARNING — Mixed CRS (${preparation.crsList.join(', ')})`
                    : preparation.crsList[0] ?? 'None'}
                </div>
                <div>
                  <strong>InSAR LOS Points:</strong> {activeResult.availableInsarCount}
                </div>
              </div>
              <div className="space-y-1 bg-[#f3e6cc] border border-amber-800/60 rounded p-2.5">
                <strong>Diagnostic Flags:</strong>
                <ul className="list-disc pl-4 space-y-0.5 text-slate-800">
                  {activeResult.statusReasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                  {activeResult.warnings.map((w, i) => (
                    <li key={`w-${i}`} className="text-amber-900 font-medium">{w}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="bg-[#f3e6cc] border border-amber-800/60 rounded p-2.5">
              <strong className="text-[11px] text-slate-800">Scientific Assumptions & Limitations:</strong>
              <ul className="list-disc pl-4 text-[11px] text-slate-700 space-y-0.5 mt-1">
                {activeResult.limitations.map((lim, i) => (
                  <li key={i}>{lim}</li>
                ))}
              </ul>
            </div>
          </div>

          {hasSolvedStrain && activeResult.residuals.length > 0 && (
            <>
              <StrainResidualChart result={activeResult} />
              <div className="bg-[#f1f4f9] border border-slate-600/70 rounded-lg overflow-hidden shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
                <div className="px-3.5 py-2 bg-[#e2e8f2] border-b border-slate-600/50 text-xs font-bold text-slate-800">
                  Per-Station Observed vs Predicted Fit Diagnostics ({activeResult.vectorUnit})
                </div>
                <div className="overflow-x-auto max-h-[260px]">
                  <table className="w-full text-[11px] border-collapse">
                    <thead className="bg-[#dfe6f0] text-slate-800 sticky top-0">
                      <tr>
                        <th className="px-2 py-1.5 text-left border-b border-slate-200">Station</th>
                        <th className="px-2 py-1.5 text-right border-b border-slate-200">Obs E / N</th>
                        <th className="px-2 py-1.5 text-right border-b border-slate-200">Pred E / N</th>
                        <th className="px-2 py-1.5 text-right border-b border-slate-200">Res E / N</th>
                        <th className="px-2 py-1.5 text-right border-b border-slate-200">|Residual|</th>
                        <th className="px-2 py-1.5 text-right border-b border-slate-200">Norm |r|/σ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeResult.residuals.map((r) => (
                        <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-2 py-1 font-semibold">{r.stationId}</td>
                          <td className="px-2 py-1 text-right font-mono">
                            {r.observedE.toFixed(2)} / {r.observedN.toFixed(2)}
                          </td>
                          <td className="px-2 py-1 text-right font-mono">
                            {r.predictedE.toFixed(2)} / {r.predictedN.toFixed(2)}
                          </td>
                          <td className="px-2 py-1 text-right font-mono">
                            {r.residualE.toFixed(2)} / {r.residualN.toFixed(2)}
                          </td>
                          <td className="px-2 py-1 text-right font-mono font-semibold">
                            {r.residualMag.toFixed(2)}
                          </td>
                          <td className="px-2 py-1 text-right font-mono">
                            {r.normalizedResidual.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Paste / Metadata Import Modal */}
      {showPasteModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-400 rounded-sm shadow-xl max-w-2xl w-full p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div className="text-sm font-bold text-slate-900 inline-flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-blue-700" /> Import Geodetic CSV or GeoJSON
              </div>
              <button
                type="button"
                onClick={() => setShowPasteModal(false)}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                Close
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div>
                <label className="block text-[11px] font-semibold mb-0.5">Format</label>
                <select
                  value={pasteFormat}
                  onChange={(e) => setPasteFormat(e.target.value as 'csv' | 'geojson')}
                  className="w-full border border-slate-300 rounded-xs px-2 py-1 text-xs"
                >
                  <option value="csv">CSV</option>
                  <option value="geojson">GeoJSON</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold mb-0.5">Default Source</label>
                <input
                  type="text"
                  placeholder="e.g. PHIVOLCS GNSS"
                  value={importSource}
                  onChange={(e) => setImportSource(e.target.value)}
                  className="w-full border border-slate-300 rounded-xs px-2 py-1 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold mb-0.5">Default CRS</label>
                <input
                  type="text"
                  value={importCrs}
                  onChange={(e) => setImportCrs(e.target.value)}
                  className="w-full border border-slate-300 rounded-xs px-2 py-1 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold mb-0.5">Default Mode</label>
                <select
                  value={importMode}
                  onChange={(e) => setImportMode(e.target.value as 'auto' | GeodeticDataMode)}
                  className="w-full border border-slate-300 rounded-xs px-2 py-1 text-xs"
                >
                  <option value="auto">Auto-detect</option>
                  <option value="displacement">Displacement</option>
                  <option value="velocity">Velocity (rate)</option>
                  <option value="timeseries">Time-Series</option>
                </select>
              </div>
            </div>
            <textarea
              rows={9}
              placeholder={
                pasteFormat === 'csv'
                  ? 'station_id,lat,lon,east,north,up,sigma_e,sigma_n,units,crs,date,source\nPIMO,14.6357,121.0777,18.2,-6.4,2.1,1.5,1.5,mm,ITRF2014,2024-05-01,IGS'
                  : '{"type":"FeatureCollection","features":[...]}'
              }
              value={pasteContent}
              onChange={(e) => setPasteContent(e.target.value)}
              className="w-full border border-slate-300 rounded-xs p-2 font-mono text-[11px]"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPasteModal(false)}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-xs hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!pasteContent.trim()}
                onClick={() =>
                  void submitImportPayload(pasteFormat, pasteContent, 'Pasted Dataset').then(
                    () => {
                      setPasteContent('');
                      setShowPasteModal(false);
                    }
                  )
                }
                className="px-3 py-1.5 text-xs bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-xs disabled:opacity-50"
              >
                Import Geodetic Data
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
