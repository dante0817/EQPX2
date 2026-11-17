import React, { useMemo, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Database,
  DownloadCloud,
  Flame,
  Layers,
  X,
} from 'lucide-react';
import { isEventUnlocated, type EQPEvent } from '../data/eqpData';
import {
  computeViewportGeoBounds,
  type GeoViewportBounds,
} from './SeismicityTrendOverlay';
import {
  geodesicDistanceKm,
  type HistoricalEarthquakeRecord,
} from '../utils/historicalSeismicity';
import {
  analyzeHistoricalFrequency,
  type DetectedSeismicityBurst,
  type FrequencyBinResolution,
  type FrequencySpatialScope,
  type HistoricalFrequencyBin,
} from '../utils/historicalFrequency';
import type { BasemapProviderId, MapViewportState } from '../utils/maps/basemapConfig';

interface HistoricalFrequencyChartProps {
  historicalEvents: HistoricalEarthquakeRecord[];
  activeEvent: EQPEvent;
  viewport: MapViewportState;
  basemapId: BasemapProviderId;
  isLoading: boolean;
  error: string | null;
  isFetchingUsgs: boolean;
  onFetchUsgs: () => void;
  onReloadCatalog: () => void;
  onOpenHistoricalResearch: () => void;
  onOpenSequenceResearch?: () => void;
  themeVariant?: 'default' | 'tsunami';
}

const SCOPE_OPTIONS: { id: FrequencySpatialScope; label: string }[] = [
  { id: 'all', label: 'Full Catalog' },
  { id: 'viewport', label: 'Map Viewport' },
  { id: 'near-epicenter', label: 'Near Epicenter' },
];

const RESOLUTION_OPTIONS: { id: FrequencyBinResolution; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'hour', label: 'Hourly' },
  { id: 'day', label: 'Daily' },
  { id: 'week', label: 'Weekly' },
  { id: 'month', label: 'Monthly' },
  { id: 'year', label: 'Yearly' },
];

const MIN_MAG_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'All M' },
  { value: 3.0, label: 'M ≥ 3.0' },
  { value: 4.0, label: 'M ≥ 4.0' },
  { value: 5.0, label: 'M ≥ 5.0' },
];

function CustomFrequencyTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: HistoricalFrequencyBin }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const bin = payload[0]?.payload;
  if (!bin) return null;

  return (
    <div className="bg-white border border-slate-300 shadow-md rounded-md px-3 py-2 text-[11px] text-slate-800 max-w-[260px]">
      <div className="font-mono font-semibold text-slate-900 border-b border-slate-100 pb-1 mb-1">
        {bin.rangeLabel}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono tabular-nums">
        <span className="text-slate-500 font-sans">Events</span>
        <span className="text-right font-semibold text-slate-900">
          {bin.count} ({bin.ratePerDay.toFixed(1)}/day)
        </span>
        <span className="text-slate-500 font-sans">Cumulative</span>
        <span className="text-right text-slate-800">{bin.cumulativeCount}</span>
        <span className="text-slate-500 font-sans">Max Mag</span>
        <span className="text-right text-slate-800">
          {bin.maxMag !== null ? `M${bin.maxMag.toFixed(1)}` : '—'}
        </span>
        <span className="text-slate-500 font-sans">Mean Depth</span>
        <span className="text-right text-slate-800">
          {bin.meanDepthKm !== null ? `${bin.meanDepthKm.toFixed(1)} km` : '—'}
        </span>
      </div>
      {bin.isBurst && (
        <div className="mt-1.5 pt-1 border-t border-amber-200 text-amber-800 font-medium flex items-center gap-1">
          <Flame className="w-3 h-3 shrink-0" />
          <span>Elevated activity (+{bin.zScore.toFixed(1)}σ)</span>
        </div>
      )}
      {bin.maxMagEventPlace && (
        <div className="mt-1 text-[10px] text-slate-500 truncate">
          Peak: {bin.maxMagEventPlace}
        </div>
      )}
    </div>
  );
}

export const HistoricalFrequencyChart: React.FC<HistoricalFrequencyChartProps> = ({
  historicalEvents,
  activeEvent,
  viewport,
  basemapId,
  isLoading,
  error,
  isFetchingUsgs,
  onFetchUsgs,
  onReloadCatalog,
  onOpenHistoricalResearch,
  onOpenSequenceResearch,
  themeVariant = 'default',
}) => {
  const isTsunami = themeVariant === 'tsunami';
  const [collapsed, setCollapsed] = useState(false);
  const [spatialScope, setSpatialScope] = useState<FrequencySpatialScope>('all');
  const [epicenterRadiusKm, setEpicenterRadiusKm] = useState<number>(100);
  const [resolution, setResolution] = useState<FrequencyBinResolution>('auto');
  const [minMagnitude, setMinMagnitude] = useState<number | null>(null);
  const [showCumulative, setShowCumulative] = useState(true);
  const [selectedBinKey, setSelectedBinKey] = useState<string | null>(null);
  const [selectedBurstId, setSelectedBurstId] = useState<string | null>(null);

  const unlocated = isEventUnlocated(activeEvent);

  const viewportBounds: GeoViewportBounds | null = useMemo(
    () =>
      spatialScope === 'viewport' ? computeViewportGeoBounds(viewport, basemapId) : null,
    [spatialScope, viewport, basemapId]
  );

  const effectiveScope: FrequencySpatialScope =
    spatialScope === 'near-epicenter' && unlocated ? 'all' : spatialScope;

  const analysis = useMemo(
    () =>
      analyzeHistoricalFrequency({
        historicalEvents,
        activeEvent,
        viewportBounds,
        spatialScope: effectiveScope,
        epicenterRadiusKm,
        resolution,
        minMagnitude,
      }),
    [
      historicalEvents,
      activeEvent,
      viewportBounds,
      effectiveScope,
      epicenterRadiusKm,
      resolution,
      minMagnitude,
    ]
  );

  const selectedBurst: DetectedSeismicityBurst | null = useMemo(() => {
    if (!selectedBurstId) return null;
    return analysis.bursts.find((b) => b.id === selectedBurstId) ?? null;
  }, [analysis.bursts, selectedBurstId]);

  const selectedBin: HistoricalFrequencyBin | null = useMemo(() => {
    if (!selectedBinKey) return null;
    return analysis.bins.find((b) => b.key === selectedBinKey) ?? null;
  }, [analysis.bins, selectedBinKey]);

  const highlightedBinKeys = useMemo(() => {
    if (selectedBurst) return new Set(selectedBurst.binKeys);
    if (selectedBin) return new Set([selectedBin.key]);
    return new Set<string>();
  }, [selectedBurst, selectedBin]);

  const drilldownEvents = useMemo(() => {
    if (selectedBurst) {
      const keySet = new Set(selectedBurst.binKeys);
      return analysis.bins
        .filter((b) => keySet.has(b.key))
        .flatMap((b) => b.events)
        .slice()
        .sort((a, b) => b.originTimeMs - a.originTimeMs);
    }
    if (selectedBin) {
      return selectedBin.events.slice().sort((a, b) => b.originTimeMs - a.originTimeMs);
    }
    return [];
  }, [analysis.bins, selectedBurst, selectedBin]);

  const drilldownTitle = selectedBurst
    ? `${selectedBurst.classification}: ${selectedBurst.startLabel} – ${selectedBurst.endLabel}`
    : selectedBin
      ? `Interval Drilldown: ${selectedBin.rangeLabel}`
      : '';

  const resetFilters = () => {
    setSpatialScope('all');
    setResolution('auto');
    setMinMagnitude(null);
    setSelectedBinKey(null);
    setSelectedBurstId(null);
  };

  return (
    <section
      data-testid="historical-frequency-panel"
      aria-label="Historical Seismicity Frequency Over Time"
      className={`card rounded-lg overflow-hidden border ${
        isTsunami
          ? 'bg-[#f1f4f9] border-slate-600/70 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]'
          : 'bg-white border-slate-200'
      }`}
    >
      {/* Header Bar */}
      <div
        className={`px-4 py-2.5 border-b flex flex-wrap items-center justify-between gap-3 ${
          isTsunami
            ? 'bg-[#dfe6f0] border-slate-700/60'
            : 'bg-slate-50 border-slate-200'
        }`}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
            <h2
              className={`flex items-center gap-1.5 ${
                isTsunami
                  ? 'text-base font-bold text-blue-700 [text-shadow:0_0_8px_rgba(249,115,22,0.7),0_0_18px_rgba(251,146,60,0.45)]'
                  : 'text-sm font-semibold text-slate-900'
              }`}
            >
              <Activity className="w-4 h-4 text-sky-700 shrink-0" />
              <span>Historical Seismicity Frequency Over Time</span>
            </h2>
            <span className="text-xs font-mono tabular-nums text-slate-600">
              {analysis.filteredEvents.length}
              {analysis.filteredEvents.length !== analysis.totalCatalogCount
                ? ` / ${analysis.totalCatalogCount}`
                : ''}{' '}
              events · {analysis.resolvedResolution} bins
              {analysis.dateSpanDays > 0 ? ` · ${analysis.dateSpanDays} d span` : ''}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Temporal occurrence rate and cumulative count from{' '}
            <span className="font-mono text-slate-700">historicalTrendEvents</span> to screen
            for candidate aftershock sequences and seismic swarms
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onFetchUsgs}
            disabled={isFetchingUsgs}
            className="h-7 px-2.5 rounded border border-sky-300 bg-sky-50 text-sky-900 hover:bg-sky-100 text-[11px] font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50"
            title="Fetch regional USGS catalog events within 300 km (M ≥ 3.5)"
          >
            <DownloadCloud className="w-3.5 h-3.5" />
            <span>{isFetchingUsgs ? 'Fetching USGS…' : 'Fetch USGS (300 km)'}</span>
          </button>

          {onOpenSequenceResearch && (
            <button
              type="button"
              onClick={onOpenSequenceResearch}
              className="h-7 px-2.5 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 text-[11px] font-medium inline-flex items-center gap-1 whitespace-nowrap shrink-0"
              title="Open detailed Foreshock / Aftershock / Swarm modeling in Research"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Sequence Research</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenHistoricalResearch}
            className="h-7 px-2.5 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 text-[11px] font-medium inline-flex items-center gap-1 whitespace-nowrap shrink-0"
            title="Import CSV/GeoJSON or manage Historical Seismicity Catalog"
          >
            <Database className="w-3.5 h-3.5" />
            <span>Manage Catalog</span>
          </button>

          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand frequency chart' : 'Collapse frequency chart'}
            className="h-7 w-7 rounded border border-slate-300 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 inline-flex items-center justify-center shrink-0"
          >
            {collapsed ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronUp className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div>
          {/* Interactive Controls Bar */}
          <div
            className={`px-4 py-2 border-b flex flex-wrap items-center justify-between gap-2.5 text-[11px] ${
              isTsunami
                ? 'bg-[#e8edf5] border-slate-700/50'
                : 'bg-white border-slate-200'
            }`}
          >
            <div className="flex flex-wrap items-center gap-3">
              {/* Spatial Scope */}
              <div
                className={`flex items-center gap-1 p-0.5 rounded-md ${
                  isTsunami ? 'sub-card bg-[#d5deec] border border-slate-700/55' : 'bg-slate-100'
                }`}
              >
                {SCOPE_OPTIONS.map((opt) => {
                  const disabled = opt.id === 'near-epicenter' && unlocated;
                  const active = spatialScope === opt.id && !disabled;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        setSpatialScope(opt.id);
                        setSelectedBinKey(null);
                        setSelectedBurstId(null);
                      }}
                      title={
                        disabled
                          ? 'Locate active earthquake first to filter by epicenter radius'
                          : opt.label
                      }
                      className={`px-2 py-1 rounded text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                        active
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              {effectiveScope === 'near-epicenter' && (
                <label className="inline-flex items-center gap-1.5 text-slate-600">
                  <span>Radius:</span>
                  <select
                    value={epicenterRadiusKm}
                    onChange={(e) => {
                      setEpicenterRadiusKm(Number(e.target.value));
                      setSelectedBinKey(null);
                      setSelectedBurstId(null);
                    }}
                    className="h-6 px-1.5 rounded border border-slate-300 bg-white font-mono tabular-nums text-[11px] text-slate-800"
                  >
                    <option value={50}>50 km</option>
                    <option value={100}>100 km</option>
                    <option value={200}>200 km</option>
                    <option value={300}>300 km</option>
                  </select>
                </label>
              )}

              {/* Time Bin Resolution */}
              <div
                className={`flex items-center gap-1 p-0.5 rounded-md ${
                  isTsunami ? 'sub-card bg-[#d5deec] border border-slate-700/55' : 'bg-slate-100'
                }`}
              >
                {RESOLUTION_OPTIONS.map((opt) => {
                  const active = resolution === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setResolution(opt.id);
                        setSelectedBinKey(null);
                        setSelectedBurstId(null);
                      }}
                      className={`px-2 py-1 rounded text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors ${
                        active
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              {/* Minimum Magnitude Filter */}
              <div
                className={`flex items-center gap-1 p-0.5 rounded-md ${
                  isTsunami ? 'sub-card bg-[#d5deec] border border-slate-700/55' : 'bg-slate-100'
                }`}
              >
                {MIN_MAG_OPTIONS.map((opt) => {
                  const active = minMagnitude === opt.value;
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => {
                        setMinMagnitude(opt.value);
                        setSelectedBinKey(null);
                        setSelectedBurstId(null);
                      }}
                      className={`px-2 py-1 rounded text-[11px] font-medium font-mono tabular-nums whitespace-nowrap shrink-0 transition-colors ${
                        active
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none text-slate-700 font-medium">
                <input
                  type="checkbox"
                  checked={showCumulative}
                  onChange={(e) => setShowCumulative(e.target.checked)}
                  className="rounded border-slate-300 text-slate-900 focus:ring-sky-500"
                />
                <span>Cumulative Curve</span>
              </label>
            </div>
          </div>

          {/* Summary Telemetry Strip (Tabular Monospace, Zero Pills) */}
          {analysis.bins.length > 0 && (
            <div
              className={`px-4 py-2 border-b grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs ${
                isTsunami
                  ? 'sub-card bg-[#e2e8f2] border-slate-700/55'
                  : 'border-slate-200 bg-slate-50/70'
              }`}
            >
              <div>
                <div className="text-[10px] tracking-wide text-slate-500">
                  Mean Rate / {analysis.resolvedResolution}
                </div>
                <div className="font-mono tabular-nums font-semibold text-slate-900">
                  {analysis.baselineMeanPerBin.toFixed(1)}{' '}
                  <span className="text-[11px] font-normal text-slate-500">
                    events (σ {analysis.baselineStdDevPerBin.toFixed(1)})
                  </span>
                </div>
              </div>
              <div>
                <div className="text-[10px] tracking-wide text-slate-500">
                  Peak Interval Count
                </div>
                <div className="font-mono tabular-nums font-semibold text-slate-900">
                  {analysis.peakBin ? analysis.peakBin.count : 0}{' '}
                  <span className="text-[11px] font-normal text-slate-500">
                    {analysis.peakBin ? `(${analysis.peakBin.label})` : ''}
                  </span>
                </div>
              </div>
              <div>
                <div className="text-[10px] tracking-wide text-slate-500">
                  Largest Historical Event
                </div>
                <div className="font-mono tabular-nums font-semibold text-slate-900">
                  {analysis.overallMaxMag !== null
                    ? `M ${analysis.overallMaxMag.toFixed(1)}`
                    : '—'}
                </div>
              </div>
              <div>
                <div className="text-[10px] tracking-wide text-slate-500">
                  Sequence / Swarm Signals
                </div>
                <div className="font-mono tabular-nums font-semibold text-slate-900">
                  {analysis.bursts.length > 0 ? (
                    <span className="text-amber-700">
                      {analysis.bursts.length} elevated{' '}
                      {analysis.bursts.length === 1 ? 'window' : 'windows'}
                    </span>
                  ) : (
                    <span className="text-slate-600 font-normal">
                      Baseline (≥{analysis.burstThresholdCount} threshold)
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Chart Body */}
          <div className="p-4">
            {isLoading && historicalEvents.length === 0 ? (
              <div className="h-[220px] flex items-center justify-center text-xs text-slate-500">
                Loading historical seismicity catalog…
              </div>
            ) : error && historicalEvents.length === 0 ? (
              <div className="h-[220px] flex flex-col items-center justify-center gap-2 text-center px-4">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
                <div className="text-xs font-medium text-rose-700">{error}</div>
                <button
                  type="button"
                  onClick={onReloadCatalog}
                  className="px-3 py-1.5 rounded border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Retry Loading Catalog
                </button>
              </div>
            ) : historicalEvents.length === 0 ? (
              <div className="h-[220px] flex flex-col items-center justify-center gap-2.5 text-center px-4 bg-slate-50 border border-slate-200 rounded-md">
                <Activity className="w-5 h-5 text-slate-400" />
                <div className="space-y-1 max-w-lg">
                  <div className="text-xs font-semibold text-slate-800">
                    No historical earthquakes loaded in the regional catalog yet
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Fetch real regional earthquakes from USGS FDSN around the active epicenter
                    or import a CSV/GeoJSON catalog to plot frequency over time and detect
                    potential aftershock sequences or seismic swarms.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={onFetchUsgs}
                    disabled={isFetchingUsgs}
                    className="px-3 py-1.5 rounded bg-sky-600 text-white hover:bg-sky-700 text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <DownloadCloud className="w-3.5 h-3.5" />
                    <span>
                      {isFetchingUsgs
                        ? 'Fetching USGS Regional Catalog…'
                        : 'Fetch USGS Regional Catalog (300 km)'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={onOpenHistoricalResearch}
                    className="px-3 py-1.5 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-xs font-medium"
                  >
                    Import CSV / GeoJSON Catalog
                  </button>
                </div>
              </div>
            ) : analysis.bins.length === 0 ? (
              <div className="h-[220px] flex flex-col items-center justify-center gap-2 text-center px-4 bg-slate-50 border border-slate-200 rounded-md">
                <div className="text-xs font-semibold text-slate-800">
                  No historical events match the current scope or magnitude filter
                </div>
                <p className="text-[11px] text-slate-500">
                  {analysis.totalCatalogCount} events exist in the loaded catalog. Broaden the
                  spatial scope or lower the minimum magnitude threshold.
                </p>
                <button
                  type="button"
                  onClick={resetFilters}
                  className="px-3 py-1.5 rounded border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Reset Filters
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                  <div className="flex flex-wrap items-center gap-4">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block w-2.5 h-2.5 bg-sky-600 rounded-[2px]" />
                      <span>Baseline Count</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block w-2.5 h-2.5 bg-amber-600 rounded-[2px]" />
                      <span>
                        Elevated Burst (≥{analysis.burstThresholdCount} /{' '}
                        {analysis.resolvedResolution})
                      </span>
                    </span>
                    {showCumulative && (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="inline-block w-4 border-t-2 border-slate-900" />
                        <span>Cumulative Count</span>
                      </span>
                    )}
                    {analysis.activeEventBinKey && (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="inline-block w-4 border-t-2 border-dashed border-rose-600" />
                        <span>Active EQ Origin</span>
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">
                    Click any bar to inspect interval earthquakes
                    {analysis.sparseEmptyGapsOmitted
                      ? ' · Long quiet gaps condensed'
                      : ''}
                  </span>
                </div>

                <div className="h-[240px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={analysis.bins}
                      margin={{ top: 10, right: showCumulative ? 16 : 8, bottom: 8, left: -12 }}
                    >
                      <CartesianGrid
                        stroke="#e2e8f0"
                        strokeDasharray="2 2"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10, fill: '#475569', fontFamily: 'ui-monospace, monospace' }}
                        tickLine={false}
                        axisLine={{ stroke: '#cbd5e1' }}
                        minTickGap={22}
                      />
                      <YAxis
                        yAxisId="count"
                        allowDecimals={false}
                        tick={{ fontSize: 10, fill: '#475569', fontFamily: 'ui-monospace, monospace' }}
                        tickLine={false}
                        axisLine={{ stroke: '#cbd5e1' }}
                        width={42}
                      />
                      {showCumulative && (
                        <YAxis
                          yAxisId="cum"
                          orientation="right"
                          allowDecimals={false}
                          tick={{ fontSize: 10, fill: '#64748b', fontFamily: 'ui-monospace, monospace' }}
                          tickLine={false}
                          axisLine={{ stroke: '#cbd5e1' }}
                          width={44}
                        />
                      )}
                      <Tooltip content={<CustomFrequencyTooltip />} />
                      <ReferenceLine
                        yAxisId="count"
                        y={analysis.burstThresholdCount}
                        stroke="#d97706"
                        strokeDasharray="3 3"
                        strokeOpacity={0.65}
                      />
                      {analysis.activeEventBinKey && (() => {
                        const activeBin = analysis.bins.find(
                          (b) => b.key === analysis.activeEventBinKey
                        );
                        if (!activeBin) return null;
                        return (
                          <ReferenceLine
                            yAxisId="count"
                            x={activeBin.label}
                            stroke="#dc2626"
                            strokeDasharray="4 3"
                            strokeWidth={1.5}
                            label={{
                              value: 'Active EQ',
                              position: 'top',
                              fill: '#dc2626',
                              fontSize: 10,
                              fontWeight: 600,
                            }}
                          />
                        );
                      })()}
                      <Bar
                        yAxisId="count"
                        dataKey="count"
                        maxBarSize={36}
                        radius={[2, 2, 0, 0]}
                        className="cursor-pointer"
                        onClick={(barData) => {
                          const clickedKey = (barData as unknown as { key?: string })?.key;
                          if (!clickedKey) return;
                          setSelectedBurstId(null);
                          setSelectedBinKey((curr) =>
                            curr === clickedKey ? null : clickedKey
                          );
                        }}
                      >
                        {analysis.bins.map((bin) => {
                          const isSelected = highlightedBinKeys.has(bin.key);
                          const fill = bin.isBurst
                            ? isSelected
                              ? '#b45309'
                              : '#d97706'
                            : bin.count > 0
                              ? isSelected
                                ? '#0369a1'
                                : '#0284c7'
                              : '#e2e8f0';
                          return (
                            <Cell
                              key={bin.key}
                              fill={fill}
                              fillOpacity={bin.count > 0 ? 0.88 : 0.45}
                              stroke={isSelected ? '#0f172a' : 'none'}
                              strokeWidth={isSelected ? 1.5 : 0}
                            />
                          );
                        })}
                      </Bar>
                      {showCumulative && (
                        <Line
                          yAxisId="cum"
                          type="monotone"
                          dataKey="cumulativeCount"
                          stroke="#0f172a"
                          strokeWidth={1.75}
                          dot={analysis.bins.length <= 28 ? { r: 2, fill: '#0f172a' } : false}
                          activeDot={{ r: 3.5, fill: '#0f172a' }}
                          isAnimationActive={false}
                        />
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                {/* Detected Candidate Sequences & Swarms */}
                {analysis.bursts.length > 0 && (
                  <div className="pt-3 border-t border-slate-200 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-xs font-semibold text-slate-800">
                        Detected Elevated Activity Windows (Aftershock / Swarm Screening)
                      </h3>
                      <span className="text-[11px] text-slate-500">
                        Click a candidate window to inspect its earthquakes
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {analysis.bursts.slice(0, 6).map((burst) => {
                        const isSel = selectedBurstId === burst.id;
                        const isAftershock =
                          burst.classification === 'Aftershock Sequence Candidate';
                        const isSwarm = burst.classification === 'Seismic Swarm Candidate';
                        return (
                          <button
                            key={burst.id}
                            type="button"
                            onClick={() => {
                              setSelectedBinKey(null);
                              setSelectedBurstId((curr) =>
                                curr === burst.id ? null : burst.id
                              );
                            }}
                            className={`text-left px-3 py-2 rounded border transition-colors ${
                              isSel
                                ? isTsunami
                                  ? 'border-slate-900 bg-[#d5deec]'
                                  : 'border-slate-900 bg-slate-50'
                                : isTsunami
                                  ? 'sub-card border-slate-700/60 bg-[#dfe6f0] hover:bg-[#d5deec]'
                                  : 'border-slate-200 bg-white hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span
                                className={`font-semibold inline-flex items-center gap-1.5 ${
                                  isAftershock
                                    ? 'text-rose-700'
                                    : isSwarm
                                      ? 'text-amber-700'
                                      : 'text-sky-800'
                                }`}
                              >
                                <Flame className="w-3.5 h-3.5 shrink-0" />
                                <span>{burst.classification}</span>
                              </span>
                              <span className="font-mono tabular-nums font-semibold text-slate-900 shrink-0">
                                {burst.totalEvents} events
                              </span>
                            </div>
                            <div className="mt-1 text-[11px] text-slate-600 font-mono tabular-nums">
                              {burst.startLabel}
                              {burst.endLabel !== burst.startLabel
                                ? ` → ${burst.endLabel}`
                                : ''}
                            </div>
                            <div className="mt-0.5 text-[11px] text-slate-700">
                              {burst.summary}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Selected Bin or Cluster Event Drilldown Table */}
                {(selectedBin || selectedBurst) && (
                  <div className="pt-3 border-t border-slate-200 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-semibold text-slate-900 font-mono tabular-nums">
                        {drilldownTitle} · {drilldownEvents.length}{' '}
                        {drilldownEvents.length === 1 ? 'event' : 'events'}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedBinKey(null);
                          setSelectedBurstId(null);
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-900"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Clear Selection</span>
                      </button>
                    </div>
                    {drilldownEvents.length === 0 ? (
                      <div className="text-xs text-slate-500 py-2">
                        No historical events recorded in this interval.
                      </div>
                    ) : (
                      <div
                        className={`rounded overflow-hidden max-h-48 overflow-y-auto border ${
                          isTsunami ? 'border-slate-700/60' : 'border-slate-200'
                        }`}
                      >
                        <table className="w-full text-left border-collapse text-[11px]">
                          <thead
                            className={`sticky top-0 border-b ${
                              isTsunami
                                ? 'bg-[#dfe6f0] border-slate-700/60 text-slate-800'
                                : 'bg-slate-50 border-slate-200 text-slate-600'
                            }`}
                          >
                            <tr>
                              <th className="px-2.5 py-1.5 font-medium">Origin UTC</th>
                              <th className="px-2.5 py-1.5 font-medium">Mag</th>
                              <th className="px-2.5 py-1.5 font-medium">Depth</th>
                              <th className="px-2.5 py-1.5 font-medium">Location</th>
                              {!unlocated && (
                                <th className="px-2.5 py-1.5 font-medium text-right">
                                  Δ Active EQ
                                </th>
                              )}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200/70">
                            {drilldownEvents.slice(0, 60).map((ev, rowIdx) => {
                              const distKm = !unlocated
                                ? geodesicDistanceKm(
                                    activeEvent.lat,
                                    activeEvent.lon,
                                    ev.lat,
                                    ev.lon
                                  )
                                : null;
                              return (
                                <tr
                                  key={ev.id}
                                  className={`transition-colors ${
                                    rowIdx % 2 === 0
                                      ? 'bg-[#ffffff] hover:bg-[#dbeafe]'
                                      : 'bg-[#e8eff9] hover:bg-[#dbeafe]'
                                  }`}
                                >
                                  <td className="px-2.5 py-1 font-mono tabular-nums text-slate-800 whitespace-nowrap">
                                    {ev.originTimeUtc.slice(0, 19).replace('T', ' ')}
                                  </td>
                                  <td className="px-2.5 py-1 font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                                    {ev.magnitude !== null
                                      ? `${ev.magnitudeType || 'M'} ${ev.magnitude.toFixed(1)}`
                                      : '—'}
                                  </td>
                                  <td className="px-2.5 py-1 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                                    {ev.depthKm !== null ? `${ev.depthKm.toFixed(1)} km` : '—'}
                                  </td>
                                  <td className="px-2.5 py-1 text-slate-700 truncate max-w-[260px]">
                                    {ev.place || `${ev.lat.toFixed(2)}°, ${ev.lon.toFixed(2)}°`}
                                  </td>
                                  {!unlocated && (
                                    <td className="px-2.5 py-1 font-mono tabular-nums text-slate-600 text-right whitespace-nowrap">
                                      {distKm !== null ? `${distKm.toFixed(1)} km` : '—'}
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
