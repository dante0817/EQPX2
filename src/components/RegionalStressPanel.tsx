import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CheckSquare,
  Compass,
  Download,
  FileText,
  Globe,
  Layers,
  MapPin,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Square,
  Upload,
} from 'lucide-react';
import { EQPEvent, isEventUnlocated } from '../data/eqpData';
import {
  HistoricalEarthquakeRecord,
  MechanismQualityGrade,
} from '../utils/historicalSeismicity';
import {
  buildStressInputFingerprint,
  DEFAULT_STRESS_FILTERS,
  DEFAULT_STRESS_INVERSION_CONFIG,
  exportRegionalStressJson,
  formatRegionalStressSummaryText,
  MIN_INDEPENDENT_MECHANISMS,
  prepareStressMechanisms,
  RegionalStressInversionResult,
  runRegionalStressInversion,
  StressFilterConfig,
  StressInversionConfig,
  StressInversionMode,
  StressRadiusPreset,
  StressResultStatus,
  StressTimeWindowPreset,
} from '../utils/regionalStress';
import {
  HistoricalBeachballCardIcon,
  triggerTextDownload,
} from './HistoricalBeachballIcon';
import {
  StressAxesStereonet,
  StressMisfitBarChart,
  StressOrientationMapView,
  StressRegimeTernaryPlot,
} from './RegionalStressSubPanels';

export type RegionalStressSectionId =
  | 'inversion'
  | 'axes'
  | 'regime'
  | 'map'
  | 'quality';

interface RegionalStressPanelProps {
  event: EQPEvent;
  onNotice?: (msg: string) => void;
  onOpenHistoricalSeismicity?: () => void;
}

const QUALITY_GRADES: MechanismQualityGrade[] = ['A', 'B', 'C', 'D', 'Unknown'];

function getStatusBadgeClasses(status: StressResultStatus): string {
  if (status === 'Validated') {
    return 'bg-emerald-50 border-emerald-300 text-emerald-900';
  }
  if (status === 'Experimental') {
    return 'bg-amber-50 border-amber-300 text-amber-900';
  }
  if (status === 'Ambiguous') {
    return 'bg-orange-50 border-orange-300 text-orange-950';
  }
  return 'bg-slate-100 border-slate-300 text-slate-800';
}

export const RegionalStressPanel: React.FC<RegionalStressPanelProps> = ({
  event,
  onNotice,
  onOpenHistoricalSeismicity,
}) => {
  const [section, setSection] = useState<RegionalStressSectionId>('inversion');

  // Read-only historical seismicity catalog loaded from backend
  const [catalog, setCatalog] = useState<HistoricalEarthquakeRecord[]>([]);
  const [catalogVersion, setCatalogVersion] = useState<number>(1);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState<boolean>(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  // Filters, manual exclusions, & inversion configuration
  const [filters, setFilters] = useState<StressFilterConfig>(DEFAULT_STRESS_FILTERS);
  const [manualExcludedIds, setManualExcludedIds] = useState<Set<string>>(() => new Set());
  const [inversionConfig, setInversionConfig] = useState<StressInversionConfig>(
    DEFAULT_STRESS_INVERSION_CONFIG
  );

  // Computed inversion snapshot
  const [lastResult, setLastResult] = useState<RegionalStressInversionResult | null>(null);
  const [lastContextKey, setLastContextKey] = useState<string>('');

  const unlocated = isEventUnlocated(event);

  const loadCatalog = useCallback(async () => {
    setIsLoadingCatalog(true);
    setCatalogError(null);
    try {
      const resp = await fetch('/api/research/historical-catalog');
      const data = (await resp.json()) as {
        ok?: boolean;
        events?: HistoricalEarthquakeRecord[];
        catalogVersion?: number;
        error?: string;
      };
      if (!resp.ok || data.ok === false) {
        throw new Error(data.error || `HTTP ${resp.status}`);
      }
      setCatalog(Array.isArray(data.events) ? data.events : []);
      setCatalogVersion(data.catalogVersion ?? 1);
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : 'Unable to load focal mechanism catalog.');
    } finally {
      setIsLoadingCatalog(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  // Available data sources across mechanism records
  const availableSources = useMemo(() => {
    const s = new Set<string>();
    catalog.forEach((r) => {
      if (r.focalMechanism) s.add(r.dataSource);
    });
    return Array.from(s).sort();
  }, [catalog]);

  // Prepared mechanism dataset (SA1)
  const preparation = useMemo(
    () => prepareStressMechanisms(catalog, event, filters, manualExcludedIds),
    [catalog, event, filters, manualExcludedIds]
  );

  const currentFingerprint = useMemo(
    () => buildStressInputFingerprint(preparation.includedItems, inversionConfig),
    [preparation.includedItems, inversionConfig]
  );

  const currentContextKey = `${event.id}::v${catalogVersion}::${currentFingerprint}`;
  const isStale = lastResult !== null && lastContextKey !== currentContextKey;

  const handleRunInversion = useCallback(() => {
    const res = runRegionalStressInversion(preparation, inversionConfig);
    setLastResult(res);
    setLastContextKey(currentContextKey);
    onNotice?.(
      res.status === 'Insufficient Data'
        ? `Regional stress inversion withheld: Insufficient Data (${res.datasetSummary.independentCount} independent mechanisms).`
        : `Regional stress inversion completed (${res.status}): ${res.regime?.regimeClass ?? 'Computed'}`
    );
  }, [preparation, inversionConfig, currentContextKey, onNotice]);

  // Automatically evaluate initial gate when catalog loads cleanly and no inversion has run yet
  useEffect(() => {
    if (!isLoadingCatalog && lastResult === null) {
      const res = runRegionalStressInversion(preparation, inversionConfig);
      setLastResult(res);
      setLastContextKey(currentContextKey);
    }
  }, [isLoadingCatalog, lastResult, preparation, inversionConfig, currentContextKey]);

  const handleQuickCatalogImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const fmt: 'csv' | 'geojson' = /\.(geo)?json$/i.test(file.name) ? 'geojson' : 'csv';
      const resp = await fetch('/api/research/historical-catalog/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format: fmt,
          content: text,
          defaultSource: file.name.replace(/\.[^.]+$/, ''),
          catalogVersion: 'v1.0',
          sourceReference: `Imported via Regional Stress (${file.name})`,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || data.ok === false) {
        throw new Error(data.error || `HTTP ${resp.status}`);
      }
      setCatalog(Array.isArray(data.events) ? data.events : []);
      setCatalogVersion(data.catalogVersion ?? catalogVersion + 1);
      onNotice?.(`Imported ${data.addedCount ?? 0} catalog records from ${file.name}.`);
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : 'Failed to import catalog file.');
    } finally {
      e.target.value = '';
    }
  };

  const toggleManualExclude = (id: string) => {
    setManualExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleQualityFilter = (q: MechanismQualityGrade) => {
    setFilters((f) => ({
      ...f,
      qualityGrades: f.qualityGrades.includes(q)
        ? f.qualityGrades.filter((x) => x !== q)
        : [...f.qualityGrades, q],
    }));
  };

  const toggleSourceFilter = (src: string) => {
    setFilters((f) => ({
      ...f,
      dataSources: f.dataSources.includes(src)
        ? f.dataSources.filter((x) => x !== src)
        : [...f.dataSources, src],
    }));
  };

  const activeResult = lastResult;
  const hasSolvedAxes =
    activeResult !== null &&
    activeResult.status !== 'Insufficient Data' &&
    activeResult.sigma1 !== null &&
    activeResult.sigma2 !== null &&
    activeResult.sigma3 !== null;

  const sectionTabs: Array<{
    id: RegionalStressSectionId;
    label: string;
    icon: React.ReactNode;
  }> = [
    {
      id: 'inversion',
      label: 'Stress Tensor Inversion',
      icon: <Activity className="w-3.5 h-3.5" />,
    },
    {
      id: 'axes',
      label: 'Principal Stress Axes',
      icon: <Compass className="w-3.5 h-3.5" />,
    },
    {
      id: 'regime',
      label: 'Stress Regime',
      icon: <Layers className="w-3.5 h-3.5" />,
    },
    {
      id: 'map',
      label: 'Stress Orientation Map',
      icon: <MapPin className="w-3.5 h-3.5" />,
    },
    {
      id: 'quality',
      label: 'Quality Assessment',
      icon: <ShieldAlert className="w-3.5 h-3.5" />,
    },
  ];

  return (
    <div className="space-y-3 text-slate-900">
      {/* Module Header, Status & Action Bar */}
      <section className="bg-[#f5f7fa] border border-slate-600/70 rounded-lg p-3.5 space-y-2.5 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-blue-700 [text-shadow:0_0_8px_rgba(249,115,22,0.7),0_0_18px_rgba(251,146,60,0.45)]">
                Regional Stress Analysis (Michael 1984/1987 Deviatoric Inversion)
              </h2>
              {activeResult && (
                <span
                  className={`px-2 py-0.5 text-[11px] font-semibold border rounded-xs ${getStatusBadgeClasses(
                    activeResult.status
                  )}`}
                >
                  {activeResult.status}
                </span>
              )}
              {isStale && (
                <span className="px-2 py-0.5 text-[11px] font-semibold border rounded-xs bg-amber-100 border-amber-400 text-amber-950">
                  Stale
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-600 mt-0.5">
              Read-only relative to accepted EQP solutions &amp; PLOTTER1.EXE · Catalog v
              {catalogVersion} ({preparation.summary.recordsWithMechanism} mechanism records loaded) ·{' '}
              {unlocated
                ? 'Active EQP event unlocated'
                : `Ref: ${event.filename} (${event.lat.toFixed(3)}°N, ${event.lon.toFixed(3)}°E)`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={handleRunInversion}
              className={`px-3 py-1.5 text-xs font-semibold rounded-xs inline-flex items-center gap-1.5 text-white ${
                isStale
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-blue-700 hover:bg-blue-800'
              }`}
            >
              <Play className="w-3.5 h-3.5" />
              {isStale ? 'Recompute Stress Inversion' : 'Run Stress Inversion'}
            </button>
            <button
              type="button"
              onClick={() => void loadCatalog()}
              className="px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xs inline-flex items-center gap-1"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingCatalog ? 'animate-spin' : ''}`} />
              Reload Catalog
            </button>
            {activeResult && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const json = exportRegionalStressJson(activeResult, event, isStale);
                    triggerTextDownload(
                      `regional_stress_${event.filename.replace(/\.eqp$/i, '')}.json`,
                      json,
                      'application/json'
                    );
                    onNotice?.('Exported Regional Stress JSON report');
                  }}
                  className="px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 rounded-xs inline-flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  JSON Report
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const txt = formatRegionalStressSummaryText(activeResult, event, isStale);
                    triggerTextDownload(
                      `regional_stress_${event.filename.replace(/\.eqp$/i, '')}.txt`,
                      txt,
                      'text/plain;charset=utf-8'
                    );
                    onNotice?.('Exported Regional Stress text summary');
                  }}
                  className="px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 rounded-xs inline-flex items-center gap-1"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Summary TXT
                </button>
              </>
            )}
          </div>
        </div>

        {/* Stale Alert Banner */}
        {isStale && (
          <div className="px-3 py-2 bg-amber-50 border border-amber-300 rounded-xs flex flex-wrap items-center justify-between gap-2 text-xs text-amber-950">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
              <span>
                <strong>Stale Stress Result:</strong> Active event, mechanism catalog, filters,
                exclusions, or inversion settings changed since the last computation.
              </span>
            </div>
            <button
              type="button"
              onClick={handleRunInversion}
              className="px-2.5 py-1 bg-amber-700 hover:bg-amber-800 text-white rounded-xs font-semibold text-[11px]"
            >
              Recompute Now
            </button>
          </div>
        )}

        {catalogError && (
          <div className="px-3 py-2 bg-red-50 border border-red-300 rounded-xs text-xs text-red-800">
            {catalogError}
          </div>
        )}

        {/* Internal 5-Section Compact Navigation */}
        <div
          role="tablist"
          aria-label="Regional Stress Analysis Sections"
          className="flex flex-wrap gap-1 pt-2 border-t border-slate-500/40"
        >
          {sectionTabs.map((tab) => {
            const active = section === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSection(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xs border transition-colors ${
                  active
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-[#e4e9f1] text-slate-800 border-slate-600/60 hover:bg-white'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* SECTION A: STRESS TENSOR INVERSION */}
      {section === 'inversion' && (
        <div className="space-y-3">
          {/* Empty catalog guidance if no mechanisms exist */}
          {!isLoadingCatalog && preparation.summary.recordsWithMechanism === 0 && (
            <section className="bg-[#f3f1fb] border border-indigo-700/60 rounded-lg p-4 space-y-2.5 text-xs shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
              <div className="font-bold text-slate-900 text-sm">
                No Focal Mechanisms Available in Historical Seismicity Catalog
              </div>
              <p className="text-slate-700 leading-relaxed">
                Regional stress inversion requires at least{' '}
                <strong>{MIN_INDEPENDENT_MECHANISMS} independent, quality-controlled focal mechanisms</strong>{' '}
                (with strike, dip, and rake). Synthetic sample mechanisms are never substituted as
                real observations. Import a CSV/GeoJSON focal mechanism catalog in Historical
                Seismicity or upload a mechanism file directly here.
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {onOpenHistoricalSeismicity && (
                  <button
                    type="button"
                    onClick={onOpenHistoricalSeismicity}
                    className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    Open Historical Seismicity Catalog
                  </button>
                )}
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".csv,.txt,.json,.geojson"
                  onChange={(e) => void handleQuickCatalogImport(e)}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => importInputRef.current?.click()}
                  className="px-3 py-1.5 bg-white border border-indigo-800/50 hover:bg-indigo-50 text-slate-800 rounded-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Import CSV / GeoJSON Catalog
                </button>
              </div>
            </section>
          )}

          {/* Dataset Selection Counts Strip */}
          <section className="bg-[#eff7f6] border border-teal-700/60 rounded-lg p-3 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <div className="bg-[#d7ebe8] border border-teal-800/65 rounded p-2.5">
                <div className="text-[10px] font-semibold uppercase text-slate-700">
                  Selected Mechanisms
                </div>
                <div className="text-lg font-bold font-mono tabular-nums text-slate-900">
                  {preparation.summary.selectedCount}
                </div>
                <div className="text-[11px] text-slate-700">Included in inversion</div>
              </div>
              <div className="bg-[#d7ebe8] border border-teal-800/65 rounded p-2.5">
                <div className="text-[10px] font-semibold uppercase text-slate-700">
                  Eligible (Filtered)
                </div>
                <div className="text-lg font-bold font-mono tabular-nums text-slate-900">
                  {preparation.summary.eligibleCount}
                </div>
                <div className="text-[11px] text-slate-700">
                  Of {preparation.summary.recordsWithMechanism} total in catalog
                </div>
              </div>
              <div className="bg-[#d7ebe8] border border-teal-800/65 rounded p-2.5">
                <div className="text-[10px] font-semibold uppercase text-slate-700">
                  Independent Events
                </div>
                <div
                  className={`text-lg font-bold font-mono tabular-nums ${
                    preparation.summary.independentCount < MIN_INDEPENDENT_MECHANISMS
                      ? 'text-red-700'
                      : 'text-emerald-700'
                  }`}
                >
                  {preparation.summary.independentCount}
                </div>
                <div className="text-[11px] text-slate-700">
                  Min {MIN_INDEPENDENT_MECHANISMS} required (rec. ≥8)
                </div>
              </div>
              <div className="bg-[#d7ebe8] border border-teal-800/65 rounded p-2.5">
                <div className="text-[10px] font-semibold uppercase text-slate-700">
                  Excluded / Collapsed
                </div>
                <div className="text-lg font-bold font-mono tabular-nums text-slate-900">
                  {preparation.summary.excludedCount}
                </div>
                <div className="text-[11px] text-slate-700">
                  {preparation.summary.duplicateCollapsedCount} cross-source duplicates
                </div>
              </div>
              <div className="bg-[#d7ebe8] border border-teal-800/65 rounded p-2.5">
                <div className="text-[10px] font-semibold uppercase text-slate-700">
                  Orientation Diversity
                </div>
                <div className="text-lg font-bold font-mono tabular-nums text-slate-900">
                  {preparation.summary.maxKaganDiversityDeg}°
                </div>
                <div className="text-[11px] text-slate-700">
                  Mean Kagan {preparation.summary.meanKaganDiversityDeg}°
                </div>
              </div>
            </div>
          </section>

          {/* Filters & Inversion Configuration */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
            <section className="lg:col-span-8 bg-[#fbf5ea] border border-amber-700/60 rounded-lg p-3.5 space-y-2.5 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
              <div className="flex items-center justify-between border-b border-amber-700/35 pb-1.5">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-800">
                  Spatial, Temporal, Depth, Magnitude, Source &amp; Quality Filters
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setFilters(DEFAULT_STRESS_FILTERS);
                    setManualExcludedIds(new Set());
                  }}
                  className="text-[11px] font-medium text-slate-700 hover:text-slate-950 inline-flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" /> Reset Filters
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                <div className="space-y-1.5 bg-[#f3e6cc] border border-amber-800/60 rounded p-2.5">
                  <div className="font-semibold text-slate-800">Spatial Center &amp; Radius</div>
                  <select
                    value={filters.centerMode}
                    onChange={(e) =>
                      setFilters((f) => ({
                        ...f,
                        centerMode: e.target.value as StressFilterConfig['centerMode'],
                      }))
                    }
                    className="w-full border border-slate-300 rounded-xs px-2 py-1 bg-white text-[11px]"
                  >
                    <option value="active-event">Around Active EQP Event</option>
                    <option value="custom-point">Custom Lat / Lon Center</option>
                    <option value="all-locations">All Catalog Locations (No Radius)</option>
                  </select>
                  {filters.centerMode === 'custom-point' && (
                    <div className="grid grid-cols-2 gap-1">
                      <input
                        type="number"
                        step="0.01"
                        value={filters.customLat}
                        onChange={(e) =>
                          setFilters((f) => ({ ...f, customLat: Number(e.target.value) }))
                        }
                        placeholder="Lat"
                        className="border border-slate-300 rounded-xs px-1.5 py-0.5 font-mono text-[11px]"
                      />
                      <input
                        type="number"
                        step="0.01"
                        value={filters.customLon}
                        onChange={(e) =>
                          setFilters((f) => ({ ...f, customLon: Number(e.target.value) }))
                        }
                        placeholder="Lon"
                        className="border border-slate-300 rounded-xs px-1.5 py-0.5 font-mono text-[11px]"
                      />
                    </div>
                  )}
                  {filters.centerMode !== 'all-locations' && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {(['50', '100', '200', '500', 'custom'] as StressRadiusPreset[]).map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setFilters((f) => ({ ...f, radiusPreset: r }))}
                          className={`px-1.5 py-0.5 text-[10.5px] font-mono border rounded-xs ${
                            filters.radiusPreset === r
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-white text-slate-700 border-slate-300'
                          }`}
                        >
                          {r === 'custom' ? 'Custom' : `${r}km`}
                        </button>
                      ))}
                      {filters.radiusPreset === 'custom' && (
                        <input
                          type="number"
                          min={5}
                          max={3000}
                          value={filters.customRadiusKm}
                          onChange={(e) =>
                            setFilters((f) => ({
                              ...f,
                              customRadiusKm: Number(e.target.value) || 200,
                            }))
                          }
                          className="w-16 border border-slate-300 rounded-xs px-1 py-0.5 font-mono text-[11px]"
                        />
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-1.5 bg-[#f3e6cc] border border-amber-800/60 rounded p-2.5">
                  <div className="font-semibold text-slate-800">Time, Depth (km) &amp; Mag</div>
                  <select
                    value={filters.timeWindowPreset}
                    onChange={(e) =>
                      setFilters((f) => ({
                        ...f,
                        timeWindowPreset: e.target.value as StressTimeWindowPreset,
                      }))
                    }
                    className="w-full border border-slate-300 rounded-xs px-2 py-1 bg-white text-[11px]"
                  >
                    <option value="all">All Dates</option>
                    <option value="30d">±30 Days of Event</option>
                    <option value="365d">±1 Year of Event</option>
                    <option value="10y">±10 Years of Event</option>
                    <option value="custom-dates">Custom UTC Date Range</option>
                  </select>
                  {filters.timeWindowPreset === 'custom-dates' && (
                    <div className="grid grid-cols-2 gap-1">
                      <input
                        type="date"
                        value={filters.startDateUtc}
                        onChange={(e) =>
                          setFilters((f) => ({ ...f, startDateUtc: e.target.value }))
                        }
                        className="border border-slate-300 rounded-xs px-1 py-0.5 font-mono text-[10.5px]"
                      />
                      <input
                        type="date"
                        value={filters.endDateUtc}
                        onChange={(e) =>
                          setFilters((f) => ({ ...f, endDateUtc: e.target.value }))
                        }
                        className="border border-slate-300 rounded-xs px-1 py-0.5 font-mono text-[10.5px]"
                      />
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-1">
                    <input
                      type="number"
                      placeholder="Min Z"
                      value={filters.minDepthKm}
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, minDepthKm: e.target.value }))
                      }
                      className="border border-slate-300 rounded-xs px-1.5 py-0.5 font-mono text-[11px]"
                    />
                    <input
                      type="number"
                      placeholder="Max Z"
                      value={filters.maxDepthKm}
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, maxDepthKm: e.target.value }))
                      }
                      className="border border-slate-300 rounded-xs px-1.5 py-0.5 font-mono text-[11px]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <input
                      type="number"
                      step="0.1"
                      placeholder="Min Mag"
                      value={filters.minMag}
                      onChange={(e) => setFilters((f) => ({ ...f, minMag: e.target.value }))}
                      className="border border-slate-300 rounded-xs px-1.5 py-0.5 font-mono text-[11px]"
                    />
                    <input
                      type="number"
                      step="0.1"
                      placeholder="Max Mag"
                      value={filters.maxMag}
                      onChange={(e) => setFilters((f) => ({ ...f, maxMag: e.target.value }))}
                      className="border border-slate-300 rounded-xs px-1.5 py-0.5 font-mono text-[11px]"
                    />
                  </div>
                </div>

                <div className="space-y-1.5 bg-[#f3e6cc] border border-amber-800/60 rounded p-2.5">
                  <div className="font-semibold text-slate-800">Provenance &amp; Quality</div>
                  <select
                    value={filters.provenanceFilter}
                    onChange={(e) =>
                      setFilters((f) => ({
                        ...f,
                        provenanceFilter: e.target.value as StressFilterConfig['provenanceFilter'],
                      }))
                    }
                    className="w-full border border-slate-300 rounded-xs px-2 py-1 bg-white text-[11px]"
                  >
                    <option value="all">All Mechanism Provenances</option>
                    <option value="imported-or-validated">Imported + Validated Only</option>
                    <option value="validated-only">Validated Only</option>
                    <option value="exclude-experimental">Exclude Experimental</option>
                  </select>
                  <div className="flex flex-wrap items-center gap-1 pt-0.5">
                    {QUALITY_GRADES.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => toggleQualityFilter(q)}
                        className={`px-1.5 py-0.5 text-[10.5px] font-mono border rounded-xs ${
                          filters.qualityGrades.includes(q)
                            ? 'bg-blue-700 text-white border-blue-700'
                            : 'bg-white text-slate-700 border-slate-300'
                        }`}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                  <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-700 cursor-pointer pt-0.5">
                    <input
                      type="checkbox"
                      checked={filters.autoDeduplicateCrossSource}
                      onChange={(e) =>
                        setFilters((f) => ({
                          ...f,
                          autoDeduplicateCrossSource: e.target.checked,
                        }))
                      }
                    />
                    Auto-collapse cross-source duplicates (≤15 km, ≤120 s)
                  </label>
                </div>
              </div>

              {availableSources.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100 text-[11px]">
                  <span className="font-semibold text-slate-600">Sources:</span>
                  {availableSources.map((src) => (
                    <button
                      key={src}
                      type="button"
                      onClick={() => toggleSourceFilter(src)}
                      className={`px-2 py-0.5 border rounded-xs font-mono ${
                        filters.dataSources.includes(src)
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      {src}
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* Inversion Engine Parameters */}
            <section className="lg:col-span-4 bg-[#f3f1fb] border border-indigo-700/60 rounded-lg p-3.5 space-y-2.5 text-xs shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
              <div className="font-bold uppercase tracking-wide text-slate-800 border-b border-indigo-700/35 pb-1.5">
                Inversion Parameters
              </div>

              <div className="space-y-2.5 bg-[#e5e1f7] border border-indigo-800/55 rounded p-2.5">
                <label className="block space-y-1">
                  <span className="font-semibold text-slate-800 block">
                    Nodal-Plane Ambiguity Method
                  </span>
                  <select
                    value={inversionConfig.mode}
                    onChange={(e) =>
                      setInversionConfig((c) => ({
                        ...c,
                        mode: e.target.value as StressInversionMode,
                      }))
                    }
                    className="w-full border border-indigo-800/45 rounded-xs px-2 py-1 bg-white text-[11px]"
                  >
                    <option value="iterative-unbiased">
                      Michael (1984/1987) Iterative Unbiased + Bootstrap
                    </option>
                    <option value="michael-random-bootstrap">
                      Michael (1987) Pure Random-Plane Ensemble
                    </option>
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="font-semibold text-slate-800 block">
                    Bootstrap Resamples ({inversionConfig.bootstrapIterations})
                  </span>
                  <select
                    value={inversionConfig.bootstrapIterations}
                    onChange={(e) =>
                      setInversionConfig((c) => ({
                        ...c,
                        bootstrapIterations: Number(e.target.value),
                      }))
                    }
                    className="w-full border border-indigo-800/45 rounded-xs px-2 py-1 bg-white text-[11px] font-mono"
                  >
                    <option value={100}>100 resamples (fast)</option>
                    <option value={200}>200 resamples (standard)</option>
                    <option value={400}>400 resamples (high precision)</option>
                  </select>
                </label>

                <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={inversionConfig.useQualityWeights}
                    onChange={(e) =>
                      setInversionConfig((c) => ({
                        ...c,
                        useQualityWeights: e.target.checked,
                      }))
                    }
                  />
                  Weight mechanisms by quality grade (A:1.0, B:0.75, C:0.5, D:0.25)
                </label>
              </div>

              {/* Current Inversion Status Card */}
              {activeResult && (
                <div className="pt-1 space-y-1.5">
                  {activeResult.status === 'Insufficient Data' ? (
                    <div className="p-2.5 bg-[#e5e1f7] border border-indigo-800/55 rounded text-[11px] text-slate-800 space-y-1">
                      <div className="font-bold text-slate-900">
                        Inversion Withheld — Insufficient Data
                      </div>
                      <ul className="list-disc pl-4 space-y-0.5">
                        {activeResult.insufficientReasons.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div className="p-2.5 bg-[#d8ede2] border border-emerald-800/60 rounded text-[11px] text-slate-800 space-y-0.5">
                      <div className="font-bold text-slate-900 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                        {activeResult.regime?.regimeClass} ({activeResult.status})
                      </div>
                      <div className="font-mono tabular-nums">
                        σ₁ {activeResult.sigma1?.trend}°/{activeResult.sigma1?.plunge}° · σ₃{' '}
                        {activeResult.sigma3?.trend}°/{activeResult.sigma3?.plunge}° · R=
                        {activeResult.stressRatioR?.toFixed(2)}
                      </div>
                      <div className="font-mono tabular-nums text-slate-700">
                        Mean misfit {activeResult.meanMisfitDeg}° · Well-fitted{' '}
                        {activeResult.wellFittedPct}%
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>

          {/* Warnings */}
          {preparation.summary.warnings.length > 0 && (
            <section className="bg-amber-50 border border-amber-200 rounded-sm p-2.5 text-xs text-amber-950 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                Tectonic &amp; Dataset Safeguards
              </div>
              <ul className="list-disc pl-5 text-[11px] space-y-0.5">
                {preparation.summary.warnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </section>
          )}

          {/* Mechanism Selection Table */}
          <section className="bg-[#f1f4f9] border border-slate-600/70 rounded-lg overflow-hidden shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
            <div className="px-3 py-2 border-b border-slate-600/50 bg-[#e2e8f2] flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-bold text-slate-800">
                Focal Mechanism Selection Pool ({preparation.items.length} matching filters)
              </div>
              <div className="flex items-center gap-1.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setManualExcludedIds(new Set())}
                  className="px-2 py-0.5 border border-slate-300 bg-white hover:bg-slate-100 rounded-xs"
                >
                  Include All Eligible
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setManualExcludedIds(new Set(preparation.items.map((i) => i.record.id)))
                  }
                  className="px-2 py-0.5 border border-slate-300 bg-white hover:bg-slate-100 rounded-xs"
                >
                  Exclude All
                </button>
              </div>
            </div>
            <div className="overflow-x-auto max-h-[340px]">
              <table className="w-full text-left border-collapse text-[11px]">
                <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10 border-b border-slate-200">
                  <tr>
                    <th className="px-2.5 py-1.5 font-semibold w-8">Use</th>
                    <th className="px-2 py-1.5 font-semibold">Glyph</th>
                    <th className="px-2 py-1.5 font-semibold">Event ID</th>
                    <th className="px-2 py-1.5 font-semibold">Origin (UTC)</th>
                    <th className="px-2 py-1.5 font-semibold text-right">Z (km)</th>
                    <th className="px-2 py-1.5 font-semibold text-right">Mag</th>
                    <th className="px-2 py-1.5 font-semibold">NP1 (S/D/R)</th>
                    <th className="px-2 py-1.5 font-semibold">NP2 (S/D/R)</th>
                    <th className="px-2 py-1.5 font-semibold">Source / Prov / Q</th>
                    <th className="px-2 py-1.5 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preparation.items.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-3 py-6 text-center text-slate-500">
                        No focal mechanisms match the current filter criteria.
                      </td>
                    </tr>
                  ) : (
                    preparation.items.map((item) => {
                      const r = item.record;
                      const fm = item.mechanism;
                      const isCollapsedDup =
                        item.duplicateOfId !== null && filters.autoDeduplicateCrossSource;
                      return (
                        <tr
                          key={r.id}
                          className={item.included ? 'bg-white' : 'bg-slate-50 text-slate-500'}
                        >
                          <td className="px-2.5 py-1">
                            <button
                              type="button"
                              disabled={!item.eligible || isCollapsedDup}
                              onClick={() => toggleManualExclude(r.id)}
                              className="disabled:opacity-40"
                              title={item.exclusionReason ?? 'Toggle inclusion in stress inversion'}
                            >
                              {item.included ? (
                                <CheckSquare className="w-4 h-4 text-blue-700" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-400" />
                              )}
                            </button>
                          </td>
                          <td className="px-2 py-1">
                            <HistoricalBeachballCardIcon
                              plane1={item.plane1}
                              provenanceKind={fm.provenanceKind}
                              size={28}
                            />
                          </td>
                          <td className="px-2 py-1 font-mono font-semibold text-slate-900 whitespace-nowrap">
                            {r.eventId}
                          </td>
                          <td className="px-2 py-1 font-mono tabular-nums whitespace-nowrap">
                            {r.originTimeUtc.slice(0, 16).replace('T', ' ')}
                          </td>
                          <td className="px-2 py-1 font-mono tabular-nums text-right">
                            {r.depthKm !== null ? r.depthKm.toFixed(1) : '—'}
                          </td>
                          <td className="px-2 py-1 font-mono tabular-nums text-right">
                            {r.magnitude !== null ? `${r.magnitudeType} ${r.magnitude.toFixed(1)}` : '—'}
                          </td>
                          <td className="px-2 py-1 font-mono tabular-nums whitespace-nowrap">
                            {item.plane1.strike}/{item.plane1.dip}/{item.plane1.rake}
                          </td>
                          <td className="px-2 py-1 font-mono tabular-nums whitespace-nowrap">
                            {item.plane2.strike}/{item.plane2.dip}/{item.plane2.rake}
                          </td>
                          <td className="px-2 py-1 whitespace-nowrap">
                            {r.dataSource} · {fm.provenanceKind} · Q:{fm.quality}
                          </td>
                          <td className="px-2 py-1 text-[10.5px]">
                            {item.included ? (
                              <span className="text-emerald-700 font-semibold">Included</span>
                            ) : (
                              <span className="text-amber-800">{item.exclusionReason}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* SECTION B: PRINCIPAL STRESS AXES */}
      {section === 'axes' && (
        <div className="space-y-3">
          {!hasSolvedAxes || !activeResult ? (
            <section className="bg-[#f1f4f9] border border-slate-600/70 rounded-lg p-6 text-center text-xs text-slate-700 space-y-2 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
              <div className="font-bold text-slate-900 text-sm">
                Principal Stress Axes Unavailable ({activeResult?.status ?? 'Not Computed'})
              </div>
              <p>
                {activeResult?.insufficientReasons[0] ??
                  'Select at least 5 independent, orientation-diverse focal mechanisms and run the stress inversion.'}
              </p>
            </section>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
              <div className="lg:col-span-5">
                <StressAxesStereonet
                  result={activeResult}
                  includedMechanisms={preparation.includedItems}
                  onNotice={onNotice}
                />
              </div>

              <div className="lg:col-span-7 space-y-3">
                {/* Principal Axes Cards */}
                <section className="bg-[#eff7f6] border border-teal-700/60 rounded-lg p-3.5 space-y-2.5 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
                  <div className="flex items-center justify-between border-b border-teal-700/35 pb-1.5">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-slate-800">
                      Principal Stress Orientations (Lower Hemisphere · Compression-Positive)
                    </h3>
                    <span className="text-[10.5px] font-mono text-slate-700">
                      {inversionConfig.bootstrapIterations} bootstrap resamples
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-mono tabular-nums">
                    {[activeResult.sigma1!, activeResult.sigma2!, activeResult.sigma3!].map(
                      (ax) => (
                        <div
                          key={ax.label}
                          className="border border-teal-800/65 bg-[#d7ebe8] rounded p-2.5 space-y-1"
                        >
                          <div className="font-sans text-[11px] font-semibold text-slate-700">
                            {ax.name}
                          </div>
                          <div className="text-base font-bold text-slate-900">
                            {ax.trend}° / {ax.plunge}°
                          </div>
                          <div className="font-sans text-[10.5px] text-slate-700">
                            Trend / Plunge · 95% cone: <strong>±{ax.uncertainty95Deg}°</strong>
                          </div>
                        </div>
                      )
                    )}
                  </div>

                  {/* Relative Stress Shape Parameters */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-xs font-mono tabular-nums">
                    <div className="bg-[#d7ebe8] border border-teal-800/65 rounded p-2.5">
                      <div className="font-sans text-[11px] text-slate-700">
                        Stress Ratio R = (σ₁−σ₂)/(σ₁−σ₃)
                      </div>
                      <div className="text-base font-bold text-slate-900 mt-0.5">
                        {activeResult.stressRatioR?.toFixed(3)}
                      </div>
                      <div className="text-[10.5px] text-slate-700">
                        95% CI: [{activeResult.stressRatioRCI95?.[0]}, {activeResult.stressRatioRCI95?.[1]}]
                      </div>
                    </div>
                    <div className="bg-[#d7ebe8] border border-teal-800/65 rounded p-2.5">
                      <div className="font-sans text-[11px] text-slate-700">
                        Bishop φ = (σ₂−σ₃)/(σ₁−σ₃) = 1−R
                      </div>
                      <div className="text-base font-bold text-slate-900 mt-0.5">
                        {activeResult.bishopPhi?.toFixed(3)}
                      </div>
                      <div className="text-[10.5px] text-slate-700">
                        95% CI: [{activeResult.bishopPhiCI95?.[0]}, {activeResult.bishopPhiCI95?.[1]}]
                      </div>
                    </div>
                    <div className="bg-[#d7ebe8] border border-teal-800/65 rounded p-2.5">
                      <div className="font-sans text-[11px] text-slate-700">
                        SHmax Azimuth (Lund &amp; Townend 2007)
                      </div>
                      <div className="text-base font-bold text-slate-900 mt-0.5">
                        {activeResult.shMaxDefined && activeResult.shMaxAzimuthDeg !== null
                          ? `${activeResult.shMaxAzimuthDeg}°`
                          : 'Undefined'}
                      </div>
                      <div className="text-[10.5px] text-slate-700">
                        {activeResult.shMaxDefined
                          ? `95% spread: ±${activeResult.shMaxUncertainty95Deg ?? '—'}°`
                          : 'Horizontally isotropic'}
                      </div>
                    </div>
                  </div>

                  {/* Relative Shape Ratio Visual Scale */}
                  <div className="pt-1 space-y-1">
                    <div className="flex justify-between text-[10.5px] font-mono text-slate-600">
                      <span>R = 0 (σ₁ ≈ σ₂, Constrictional/Uniaxial Extension)</span>
                      <span>R = 0.5 (Triaxial)</span>
                      <span>R = 1 (σ₂ ≈ σ₃, Axial Compression)</span>
                    </div>
                    <div className="relative h-3 bg-slate-100 border border-slate-300 rounded-xs overflow-hidden">
                      {activeResult.stressRatioRCI95 && (
                        <div
                          className="absolute top-0 bottom-0 bg-blue-200"
                          style={{
                            left: `${activeResult.stressRatioRCI95[0] * 100}%`,
                            width: `${Math.max(
                              2,
                              (activeResult.stressRatioRCI95[1] - activeResult.stressRatioRCI95[0]) *
                                100
                            )}%`,
                          }}
                        />
                      )}
                      {activeResult.stressRatioR !== null && (
                        <div
                          className="absolute top-0 bottom-0 w-1 bg-blue-700"
                          style={{ left: `calc(${activeResult.stressRatioR * 100}% - 2px)` }}
                        />
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Note: Focal mechanisms constrain only relative deviatoric stress ratios and
                      axis orientations — never absolute stress magnitudes (MPa) or pore fluid
                      pressure.
                    </div>
                  </div>
                </section>

                {/* Ambiguity Alerts if present */}
                {activeResult.ambiguityReasons.length > 0 && (
                  <section className="bg-orange-50 border border-orange-300 rounded-sm p-3 text-xs text-orange-950 space-y-1">
                    <div className="font-bold">Orientation Ambiguity / Instability Notes</div>
                    <ul className="list-disc pl-4 text-[11px] space-y-0.5">
                      {activeResult.ambiguityReasons.map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* SECTION C: STRESS REGIME */}
      {section === 'regime' && (
        <div className="space-y-3">
          {!hasSolvedAxes || !activeResult?.regime ? (
            <section className="bg-[#f1f4f9] border border-slate-600/70 rounded-lg p-6 text-center text-xs text-slate-700 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
              Stress Regime classification is unavailable until a constrained regional stress tensor
              is computed (minimum {MIN_INDEPENDENT_MECHANISMS} independent mechanisms required).
            </section>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
              <div className="lg:col-span-6">
                <StressRegimeTernaryPlot result={activeResult} />
              </div>

              <div className="lg:col-span-6 space-y-3">
                <section className="bg-[#eef7f2] border border-emerald-700/60 rounded-lg p-3.5 space-y-2.5 text-xs shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
                  <div className="border-b border-emerald-700/35 pb-2">
                    <div className="text-[11px] uppercase tracking-wide text-slate-600 font-semibold">
                      Deterministic Stress Regime Classification
                    </div>
                    <div className="text-lg font-bold text-slate-900 mt-0.5">
                      {activeResult.regime.regimeClass}{' '}
                      <span className="font-mono text-sm text-blue-700">
                        [{activeResult.regime.zobackCode}]
                      </span>
                    </div>
                  </div>

                  <div className="p-2.5 bg-[#d8ede2] border border-emerald-800/55 rounded text-[11px] text-slate-800 leading-relaxed">
                    <strong>Applied Rule:</strong> {activeResult.regime.ruleExplanation}
                  </div>

                  <div className="space-y-1 text-[11px] bg-[#d8ede2] border border-emerald-800/55 rounded p-2.5">
                    <div className="font-semibold text-slate-800">
                      Zoback (1992) World Stress Map Plunge Criteria:
                    </div>
                    <table className="w-full text-left border-collapse font-mono text-[10.5px]">
                      <thead>
                        <tr className="border-b border-emerald-800/40 text-slate-600">
                          <th className="py-1">Regime</th>
                          <th className="py-1">σ₁ Plunge</th>
                          <th className="py-1">σ₂ Plunge</th>
                          <th className="py-1">σ₃ Plunge</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-emerald-800/20">
                        <tr className={activeResult.regime.zobackCode === 'NF' ? 'bg-blue-100/80 font-bold' : ''}>
                          <td className="py-1 font-sans">Normal (NF)</td>
                          <td>≥ 52°</td>
                          <td>—</td>
                          <td>≤ 35°</td>
                        </tr>
                        <tr className={activeResult.regime.zobackCode === 'NS' ? 'bg-blue-100/80 font-bold' : ''}>
                          <td className="py-1 font-sans">Normal / SS (NS)</td>
                          <td>40°–51°</td>
                          <td>—</td>
                          <td>≤ 20°</td>
                        </tr>
                        <tr className={activeResult.regime.zobackCode === 'SS' ? 'bg-blue-100/80 font-bold' : ''}>
                          <td className="py-1 font-sans">Strike-Slip (SS)</td>
                          <td>≤ 40°</td>
                          <td>≥ 45°</td>
                          <td>≤ 40°</td>
                        </tr>
                        <tr className={activeResult.regime.zobackCode === 'TS' ? 'bg-blue-100/80 font-bold' : ''}>
                          <td className="py-1 font-sans">Reverse / SS (TS)</td>
                          <td>≤ 20°</td>
                          <td>—</td>
                          <td>40°–51°</td>
                        </tr>
                        <tr className={activeResult.regime.zobackCode === 'TF' ? 'bg-blue-100/80 font-bold' : ''}>
                          <td className="py-1 font-sans">Reverse / Thrust (TF)</td>
                          <td>≤ 35°</td>
                          <td>—</td>
                          <td>≥ 52°</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="p-2.5 bg-[#dce9f8] border border-sky-800/55 rounded text-[11px] text-blue-950 leading-relaxed">
                    <strong>Principal Stress Axes (σ₁/σ₃) vs. Earthquake P/T Axes:</strong>{' '}
                    {activeResult.regime.pVsSigmaNote}
                  </div>
                </section>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SECTION D: STRESS ORIENTATION MAP */}
      {section === 'map' && (
        <StressOrientationMapView
          activeEvent={event}
          preparationIncluded={preparation.includedItems}
          preparationExcluded={preparation.excludedItems}
          result={activeResult}
          onNotice={onNotice}
        />
      )}

      {/* SECTION E: QUALITY ASSESSMENT */}
      {section === 'quality' && (
        <div className="space-y-3">
          {!activeResult ? (
            <section className="bg-[#f1f4f9] border border-slate-600/70 rounded-lg p-6 text-center text-xs text-slate-700 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
              Run the regional stress inversion to view quality and uncertainty diagnostics.
            </section>
          ) : (
            <>
              {/* Top Diagnostic Cards */}
              <section className="bg-[#eff7f6] border border-teal-700/60 rounded-lg p-3 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <div className="bg-[#d7ebe8] border border-teal-800/65 rounded p-2.5">
                    <div className="text-[10px] font-semibold uppercase text-slate-700">
                      Mean / RMS Misfit
                    </div>
                    <div className="text-lg font-bold font-mono tabular-nums text-slate-900">
                      {activeResult.meanMisfitDeg !== null
                        ? `${activeResult.meanMisfitDeg}° / ${activeResult.rmsMisfitDeg}°`
                        : '—'}
                    </div>
                    <div className="text-[11px] text-slate-700">
                      Max: {activeResult.maxMisfitDeg ?? '—'}° · ≤30°:{' '}
                      {activeResult.wellFittedPct ?? 0}%
                    </div>
                  </div>
                  <div className="bg-[#d7ebe8] border border-teal-800/65 rounded p-2.5">
                    <div className="text-[10px] font-semibold uppercase text-slate-700">
                      Axis Uncertainty (95%)
                    </div>
                    <div className="text-lg font-bold font-mono tabular-nums text-slate-900">
                      {activeResult.sigma1
                        ? `±${activeResult.sigma1.uncertainty95Deg}° / ±${activeResult.sigma3?.uncertainty95Deg}°`
                        : '—'}
                    </div>
                    <div className="text-[11px] text-slate-700">
                      σ₁ / σ₃ bootstrap cones
                    </div>
                  </div>
                  <div className="bg-[#d7ebe8] border border-teal-800/65 rounded p-2.5">
                    <div className="text-[10px] font-semibold uppercase text-slate-700">
                      Nodal-Plane Ambiguity
                    </div>
                    <div className="text-lg font-bold font-mono tabular-nums text-slate-900">
                      {activeResult.ambiguousPlaneFraction !== null
                        ? `${Math.round(activeResult.ambiguousPlaneFraction * 100)}%`
                        : '—'}
                    </div>
                    <div className="text-[11px] text-slate-700">
                      Events with |β₁−β₂| &lt; 10°
                    </div>
                  </div>
                  <div className="bg-[#d7ebe8] border border-teal-800/65 rounded p-2.5">
                    <div className="text-[10px] font-semibold uppercase text-slate-700">
                      Condition Number κ
                    </div>
                    <div className="text-lg font-bold font-mono tabular-nums text-slate-900">
                      {activeResult.conditionNumber ?? '—'}
                    </div>
                    <div className="text-[11px] text-slate-700">
                      Kagan diversity: {activeResult.datasetSummary.maxKaganDiversityDeg}°
                    </div>
                  </div>
                  <div className="bg-[#d7ebe8] border border-teal-800/65 rounded p-2.5">
                    <div className="text-[10px] font-semibold uppercase text-slate-700">
                      Provenance Mix
                    </div>
                    <div className="text-sm font-bold font-mono tabular-nums text-slate-900 mt-1">
                      V:{activeResult.datasetSummary.provenanceCounts.Validated} · I:
                      {activeResult.datasetSummary.provenanceCounts.Imported} · E:
                      {activeResult.datasetSummary.provenanceCounts.Experimental}
                    </div>
                    <div className="text-[11px] text-slate-700">
                      Indep: {activeResult.datasetSummary.independentCount}
                    </div>
                  </div>
                </div>
              </section>

              {/* Misfit Chart */}
              {hasSolvedAxes && <StressMisfitBarChart result={activeResult} />}

              {/* Per-Mechanism Misfit & Ambiguity Audit Table */}
              {activeResult.mechanismFits.length > 0 && (
                <section className="bg-[#f1f4f9] border border-slate-600/70 rounded-lg overflow-hidden shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
                  <div className="px-3 py-2 border-b border-slate-600/50 bg-[#e2e8f2] text-xs font-bold text-slate-800">
                    Per-Mechanism Residuals &amp; Nodal-Plane Ambiguity Audit
                  </div>
                  <div className="overflow-x-auto max-h-[280px]">
                    <table className="w-full text-left border-collapse text-[11px]">
                      <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10 border-b border-slate-200">
                        <tr>
                          <th className="px-2.5 py-1.5 font-semibold">Event ID</th>
                          <th className="px-2 py-1.5 font-semibold">Source / Prov</th>
                          <th className="px-2 py-1.5 font-semibold text-right">Weight</th>
                          <th className="px-2 py-1.5 font-semibold text-right">β (Plane 1)</th>
                          <th className="px-2 py-1.5 font-semibold text-right">β (Plane 2)</th>
                          <th className="px-2 py-1.5 font-semibold text-center">Preferred</th>
                          <th className="px-2 py-1.5 font-semibold text-right">Selected β</th>
                          <th className="px-2 py-1.5 font-semibold">Plane Ambiguity</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                        {activeResult.mechanismFits.map((f) => (
                          <tr key={f.recordId}>
                            <td className="px-2.5 py-1 font-semibold text-slate-900">
                              {f.eventId}
                            </td>
                            <td className="px-2 py-1 font-sans text-slate-700">
                              {f.dataSource} · {f.provenanceKind} (Q:{f.quality})
                            </td>
                            <td className="px-2 py-1 text-right">{f.weight.toFixed(2)}</td>
                            <td className="px-2 py-1 text-right">{f.misfitPlane1Deg.toFixed(1)}°</td>
                            <td className="px-2 py-1 text-right">{f.misfitPlane2Deg.toFixed(1)}°</td>
                            <td className="px-2 py-1 text-center font-semibold">
                              NP{f.preferredPlane}
                            </td>
                            <td
                              className={`px-2 py-1 text-right font-semibold ${
                                f.selectedMisfitDeg > 35
                                  ? 'text-red-700'
                                  : f.selectedMisfitDeg > 20
                                    ? 'text-amber-700'
                                    : 'text-emerald-700'
                              }`}
                            >
                              {f.selectedMisfitDeg.toFixed(1)}°
                            </td>
                            <td className="px-2 py-1 font-sans">
                              {f.planeAmbiguous ? (
                                <span className="text-amber-800 font-semibold">
                                  Ambiguous (|Δβ| &lt; 10° or high)
                                </span>
                              ) : (
                                <span className="text-slate-600">Distinguished</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* Provenance, Exclusions, & Scientific Limitations */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <section className="bg-[#fbf5ea] border border-amber-700/60 rounded-lg p-3.5 space-y-2 text-xs shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
                  <div className="font-bold uppercase tracking-wide text-slate-800 border-b border-amber-700/35 pb-1.5">
                    Experimental vs. Validated Status &amp; Scientific Limitations
                  </div>
                  <div className="p-2.5 rounded bg-[#f3e6cc] border border-amber-800/60 text-[11px] text-slate-800">
                    <strong>Current Field Result Classification:</strong>{' '}
                    <span className="font-semibold">{activeResult.status}</span> —{' '}
                    {activeResult.referenceValidationNote}
                  </div>
                  <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-700">
                    {activeResult.limitations.map((lim, i) => (
                      <li key={i}>{lim}</li>
                    ))}
                  </ul>
                </section>

                <section className="bg-[#f3f1fb] border border-indigo-700/60 rounded-lg p-3.5 space-y-2 text-xs shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
                  <div className="font-bold uppercase tracking-wide text-slate-800 border-b border-indigo-700/35 pb-1.5">
                    Exclusions &amp; Input Provenance Audit (
                    {preparation.excludedItems.length} excluded)
                  </div>
                  {preparation.excludedItems.length === 0 ? (
                    <div className="text-[11px] text-slate-700 bg-[#e5e1f7] border border-indigo-800/55 rounded p-2.5">
                      No matching focal mechanisms were excluded or collapsed as duplicates.
                    </div>
                  ) : (
                    <div className="max-h-[180px] overflow-y-auto divide-y divide-indigo-800/25 bg-[#e5e1f7] border border-indigo-800/55 rounded px-2.5 text-[11px]">
                      {preparation.excludedItems.map((ex) => (
                        <div key={ex.record.id} className="py-1.5 flex justify-between gap-2">
                          <span className="font-mono font-semibold text-slate-900">
                            {ex.record.eventId} ({ex.record.dataSource})
                          </span>
                          <span className="text-slate-700 text-right">{ex.exclusionReason}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
