import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { AlertTriangle, Download, ZoomIn, ZoomOut } from 'lucide-react';
import { EQPEvent, FAULT_TRACES, ISLAND_POLYGONS, isEventUnlocated } from '../data/eqpData';
import type { ActiveFaultsDataset, TrenchSystemsDataset } from '../utils/geologyLayers';
import { depthToColorHex, magnitudeToSymbolRadiusPx } from '../utils/historicalSeismicity';
import {
  exportMagnitudeFrequencyCsv,
  exportTimelineRatesCsv,
  MagnitudeFrequencyResult,
  projectSequenceToCrossSection,
  SequenceAssemblyResult,
  SequenceCandidateEvent,
  SequenceFilterConfig,
  SequenceMcMethod,
  SequenceRateBinMode,
  TimelineRateSummary,
} from '../utils/earthquakeSequence';
import {
  exportSvgElementAsPng,
  exportSvgElementAsSvg,
  HistoricalBeachballGlyph,
  triggerTextDownload,
} from './HistoricalBeachballIcon';

const ROLE_COLORS: Record<string, string> = {
  'Reference Event': '#dc2626',
  'Candidate Mainshock': '#7c3aed',
  'Candidate Foreshock': '#d97706',
  'Candidate Aftershock': '#2563eb',
  'Candidate Swarm/Cluster': '#0d9488',
  Unclassified: '#64748b',
};

function formatShortUtc(ms: number): string {
  const iso = new Date(ms).toISOString();
  return `${iso.slice(5, 10)} ${iso.slice(11, 16)}`;
}

// ============================================================================
// SECTION B — TIMELINE & SEISMICITY RATE PANEL
// ============================================================================

interface SequenceTimelinePanelProps {
  investigationName: string;
  assembly: SequenceAssemblyResult;
  timeline: TimelineRateSummary;
  filters: SequenceFilterConfig;
  selectedRecordId: string | null;
  onSelectRecord: (recordId: string) => void;
  onChangeFilters: (updater: (prev: SequenceFilterConfig) => SequenceFilterConfig) => void;
  onNotice?: (msg: string) => void;
}

export const SequenceTimelinePanel: React.FC<SequenceTimelinePanelProps> = ({
  investigationName,
  assembly,
  timeline,
  filters,
  selectedRecordId,
  onSelectRecord,
  onChangeFilters,
  onNotice,
}) => {
  const [rateViewMode, setRateViewMode] = useState<'count' | 'rate' | 'cumulative'>('rate');
  const [timeAxisMode, setTimeAxisMode] = useState<'utc' | 'relative-days'>('utc');

  const refMs = assembly.referenceTimeMs;
  const msTimeMs = assembly.candidateMainshockTimeMs;
  const anchorTimeMs = msTimeMs ?? refMs;

  const allTimelinePoints = useMemo(() => {
    return assembly.selectedEvents
      .map((ev) => {
        const dtAnchorDays =
          anchorTimeMs !== null
            ? Number(((ev.record.originTimeMs - anchorTimeMs) / 86_400_000).toFixed(3))
            : null;
        return {
          id: ev.record.id,
          eventId: ev.record.eventId,
          originTimeMs: ev.record.originTimeMs,
          originTimeUtc: ev.record.originTimeUtc,
          dtAnchorDays,
          dtHoursFromReference: ev.dtHoursFromReference,
          mag: ev.record.magnitude,
          magLabel:
            ev.record.magnitude !== null
              ? `${ev.record.magnitudeType} ${ev.record.magnitude.toFixed(1)}`
              : 'No Mag',
          distanceKm: ev.distanceKm,
          depthKm: ev.record.depthKm,
          role: ev.role,
          window: ev.window,
          color: ROLE_COLORS[ev.role] ?? '#475569',
        };
      })
      .sort((a, b) => a.originTimeMs - b.originTimeMs);
  }, [assembly.selectedEvents, anchorTimeMs]);

  const magScatterPoints = useMemo(
    () =>
      allTimelinePoints
        .filter((pt): pt is typeof pt & { mag: number } => pt.mag !== null && Number.isFinite(pt.mag))
        .filter((pt) => timeAxisMode === 'utc' || pt.dtAnchorDays !== null),
    [allTimelinePoints, timeAxisMode]
  );

  const distScatterPoints = useMemo(
    () =>
      allTimelinePoints.filter(
        (pt) => timeAxisMode === 'utc' || pt.dtAnchorDays !== null
      ),
    [allTimelinePoints, timeAxisMode]
  );

  const missingMagCount = allTimelinePoints.length - magScatterPoints.length;

  const selectedTimelinePoint = useMemo(
    () => allTimelinePoints.find((p) => p.id === selectedRecordId) ?? null,
    [allTimelinePoints, selectedRecordId]
  );

  const binChartData = useMemo(() => {
    return timeline.bins.map((b) => ({
      ...b,
      shortLabel: b.labelUtc.slice(5),
    }));
  }, [timeline.bins]);

  const refBinLabel = useMemo(() => {
    if (refMs === null || binChartData.length === 0) return null;
    const found = binChartData.find((b) => refMs >= b.startMs && refMs < b.endMs);
    return found ? found.shortLabel : null;
  }, [refMs, binChartData]);

  const msBinLabel = useMemo(() => {
    if (msTimeMs === null || binChartData.length === 0) return null;
    const found = binChartData.find((b) => msTimeMs >= b.startMs && msTimeMs < b.endMs);
    return found ? found.shortLabel : null;
  }, [msTimeMs, binChartData]);

  const refRelativeDays =
    refMs !== null && anchorTimeMs !== null
      ? Number(((refMs - anchorTimeMs) / 86_400_000).toFixed(3))
      : null;
  const msRelativeDays =
    msTimeMs !== null && anchorTimeMs !== null
      ? Number(((msTimeMs - anchorTimeMs) / 86_400_000).toFixed(3))
      : null;

  return (
    <div className="space-y-3">
      {/* Controls & Pre/Post Comparison Strip */}
      <div className="bg-[#eff7f6] border border-teal-700/60 rounded-lg p-3.5 space-y-2.5 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-teal-700/35 pb-2">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-800">
              Timeline, Seismicity Rate &amp; Distance Migration
            </h3>
            <p className="text-[11px] text-slate-600 mt-0.5 font-mono">
              {timeline.trendDescription}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <div className="inline-flex border border-slate-300 rounded-xs overflow-hidden">
              <button
                type="button"
                onClick={() => setTimeAxisMode('utc')}
                className={`px-2 py-0.5 font-medium ${
                  timeAxisMode === 'utc'
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                UTC Time
              </button>
              <button
                type="button"
                disabled={anchorTimeMs === null}
                onClick={() => setTimeAxisMode('relative-days')}
                className={`px-2 py-0.5 font-medium border-l border-slate-300 disabled:opacity-50 ${
                  timeAxisMode === 'relative-days'
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-700 hover:bg-slate-50'
                }`}
                title="Plot elapsed days relative to Candidate Mainshock (or Reference EQP origin)"
              >
                Δt (Days)
              </button>
            </div>
            <label className="inline-flex items-center gap-1 text-slate-700">
              <span className="font-semibold">Bin:</span>
              <select
                value={filters.binMode}
                onChange={(e) =>
                  onChangeFilters((f) => ({
                    ...f,
                    binMode: e.target.value as SequenceRateBinMode,
                  }))
                }
                className="border border-slate-300 rounded-xs px-1.5 py-0.5 bg-white font-mono"
              >
                <option value="hour">1 Hour</option>
                <option value="day">1 Day (24h)</option>
                <option value="week">1 Week (7d)</option>
                <option value="custom">Custom Hours</option>
              </select>
            </label>
            {filters.binMode === 'custom' && (
              <input
                type="number"
                min={1}
                max={720}
                value={filters.customBinHours}
                onChange={(e) =>
                  onChangeFilters((f) => ({
                    ...f,
                    customBinHours: Math.max(1, Number(e.target.value) || 12),
                  }))
                }
                className="w-16 border border-slate-300 rounded-xs px-1.5 py-0.5 font-mono"
                title="Custom bin width in hours"
              />
            )}
            <label className="inline-flex items-center gap-1 text-slate-700">
              <span className="font-semibold">Gap Alert (h):</span>
              <input
                type="number"
                min={6}
                max={2400}
                value={filters.gapThresholdHours}
                onChange={(e) =>
                  onChangeFilters((f) => ({
                    ...f,
                    gapThresholdHours: Math.max(6, Number(e.target.value) || 72),
                  }))
                }
                className="w-16 border border-slate-300 rounded-xs px-1.5 py-0.5 font-mono"
              />
            </label>
            {timeline.bins.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const csv = exportTimelineRatesCsv(timeline, investigationName);
                  const fname = `${investigationName.trim() || 'sequence'}_timeline_rates.csv`;
                  triggerTextDownload(fname, csv, 'text/csv;charset=utf-8');
                  onNotice?.(`Exported ${fname}`);
                }}
                className="px-2 py-0.5 border border-slate-300 bg-white hover:bg-slate-50 rounded-xs inline-flex items-center gap-1 font-medium"
                title="Export binned counts, cumulative totals, observed hours, and rates (/day)"
              >
                <Download className="w-3 h-3" /> Rate CSV
              </button>
            )}
          </div>
        </div>

        {/* Pre vs Post Reference Comparison Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="bg-[#d7ebe8] border border-teal-800/65 rounded p-2.5">
            <div className="text-[10px] font-semibold uppercase text-teal-900">
              Pre-Reference Count
            </div>
            <div className="text-base font-bold font-mono tabular-nums text-slate-900">
              {timeline.preRefCount}
            </div>
            <div className="text-[11px] font-mono text-slate-700 tabular-nums">
              Rate {timeline.preRefRatePerDay !== null ? `${timeline.preRefRatePerDay}/d` : '—'} · Max{' '}
              {timeline.preRefMaxMag !== null ? `M${timeline.preRefMaxMag.toFixed(1)}` : '—'}
            </div>
          </div>
          <div className="bg-[#d7ebe8] border border-teal-800/65 rounded p-2.5">
            <div className="text-[10px] font-semibold uppercase text-teal-900">
              Post-Reference Count
            </div>
            <div className="text-base font-bold font-mono tabular-nums text-slate-900">
              {timeline.postRefCount}
            </div>
            <div className="text-[11px] font-mono text-slate-700 tabular-nums">
              Rate {timeline.postRefRatePerDay !== null ? `${timeline.postRefRatePerDay}/d` : '—'} · Max{' '}
              {timeline.postRefMaxMag !== null ? `M${timeline.postRefMaxMag.toFixed(1)}` : '—'}
            </div>
          </div>
          <div className="bg-[#d7ebe8] border border-teal-800/65 rounded p-2.5">
            <div className="text-[10px] font-semibold uppercase text-teal-900">
              Effective Interval
            </div>
            <div className="text-base font-bold font-mono tabular-nums text-slate-900">
              {timeline.binHours} h
            </div>
            <div className="text-[11px] font-mono text-slate-700 tabular-nums">
              {timeline.bins.length} bins · {timeline.bins.filter((b) => b.isPartialInterval).length} partial
            </div>
          </div>
          <div className="bg-[#d7ebe8] border border-teal-800/65 rounded p-2.5">
            <div className="text-[10px] font-semibold uppercase text-teal-900">
              Catalog Gap Alerts
            </div>
            <div
              className={`text-base font-bold font-mono tabular-nums ${
                timeline.gaps.length > 0 ? 'text-amber-800' : 'text-slate-900'
              }`}
            >
              {timeline.gaps.length}
            </div>
            <div className="text-[11px] font-mono text-slate-700 tabular-nums">
              Threshold ≥ {filters.gapThresholdHours}h
            </div>
          </div>
        </div>

        {/* Role Legend & Linked Selected Event Readout */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 text-[10px] font-mono">
          <div className="flex flex-wrap items-center gap-3 text-slate-600">
            {Object.entries(ROLE_COLORS).map(([roleLabel, colorHex]) => (
              <span key={roleLabel} className="inline-flex items-center gap-1">
                <span
                  className="w-2.5 h-2.5 rounded-full inline-block"
                  style={{ backgroundColor: colorHex }}
                />
                {roleLabel}
              </span>
            ))}
          </div>
          {selectedTimelinePoint && (
            <div className="text-slate-800 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-xs">
              Selected: <strong>{selectedTimelinePoint.eventId}</strong> ·{' '}
              {selectedTimelinePoint.originTimeUtc.slice(0, 19)} UTC · {selectedTimelinePoint.magLabel} ·{' '}
              Z={selectedTimelinePoint.depthKm !== null ? `${selectedTimelinePoint.depthKm} km` : '—'} ·{' '}
              d={selectedTimelinePoint.distanceKm} km · {selectedTimelinePoint.role}
            </div>
          )}
        </div>
      </div>

      {allTimelinePoints.length === 0 ? (
        <div className="bg-[#f3f1fb] border border-indigo-700/60 rounded-lg p-6 text-center text-xs text-slate-600 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
          No selected sequence events in current filters. Adjust radius/time filters in Section A or import catalog records in Historical Seismicity.
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {/* Chart 1: Magnitude vs Origin Time Scatter (Click selects event) */}
          <div className="bg-[#edf4fc] border border-sky-700/60 rounded-lg p-3.5 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold text-slate-800">
                Magnitude vs {timeAxisMode === 'utc' ? 'Origin Time (UTC)' : 'Relative Days (Δt)'} — Click Marker to Inspect
              </div>
              <span className="text-[10px] font-mono text-slate-500">
                n={magScatterPoints.length}
                {missingMagCount > 0 ? ` (${missingMagCount} w/o mag omitted)` : ''}
              </span>
            </div>
            {magScatterPoints.length === 0 ? (
              <div className="h-60 flex items-center justify-center bg-slate-50 border border-slate-200 rounded-xs text-xs text-slate-500">
                No numeric magnitude values available for selected events.
              </div>
            ) : (
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      type="number"
                      dataKey={timeAxisMode === 'utc' ? 'originTimeMs' : 'dtAnchorDays'}
                      domain={['auto', 'auto']}
                      tickFormatter={(v) =>
                        timeAxisMode === 'utc'
                          ? formatShortUtc(Number(v))
                          : `${Number(v).toFixed(1)}d`
                      }
                      tick={{ fontSize: 10, fill: '#475569' }}
                      name={timeAxisMode === 'utc' ? 'UTC' : 'Δt (d)'}
                    />
                    <YAxis
                      type="number"
                      dataKey="mag"
                      domain={['auto', 'auto']}
                      tick={{ fontSize: 10, fill: '#475569' }}
                      width={36}
                      name="Mag"
                    />
                    <ZAxis range={[36, 120]} />
                    {timeAxisMode === 'utc' && refMs !== null && (
                      <ReferenceLine
                        x={refMs}
                        stroke="#dc2626"
                        strokeDasharray="4 3"
                        label={{ value: 'Ref', fontSize: 10, fill: '#dc2626', position: 'top' }}
                      />
                    )}
                    {timeAxisMode === 'utc' && msTimeMs !== null && msTimeMs !== refMs && (
                      <ReferenceLine
                        x={msTimeMs}
                        stroke="#7c3aed"
                        strokeDasharray="4 3"
                        label={{ value: 'MS', fontSize: 10, fill: '#7c3aed', position: 'top' }}
                      />
                    )}
                    {timeAxisMode === 'relative-days' && refRelativeDays !== null && (
                      <ReferenceLine
                        x={refRelativeDays}
                        stroke="#dc2626"
                        strokeDasharray="4 3"
                        label={{ value: 'Ref', fontSize: 10, fill: '#dc2626', position: 'top' }}
                      />
                    )}
                    {timeAxisMode === 'relative-days' &&
                      msRelativeDays !== null &&
                      msRelativeDays !== refRelativeDays && (
                        <ReferenceLine
                          x={msRelativeDays}
                          stroke="#7c3aed"
                          strokeDasharray="4 3"
                          label={{ value: 'MS', fontSize: 10, fill: '#7c3aed', position: 'top' }}
                        />
                      )}
                    <Tooltip
                      cursor={{ strokeDasharray: '3 3' }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const pt = payload[0].payload as (typeof magScatterPoints)[number];
                        return (
                          <div className="bg-white border border-slate-300 px-2.5 py-1.5 text-[11px] font-mono shadow-sm">
                            <div className="font-bold text-slate-900">{pt.eventId}</div>
                            <div>
                              {pt.originTimeUtc.slice(0, 19)} UTC
                              {pt.dtAnchorDays !== null ? ` (Δt=${pt.dtAnchorDays}d)` : ''}
                            </div>
                            <div>
                              {pt.magLabel} · Z={pt.depthKm !== null ? `${pt.depthKm} km` : 'Missing'} · d={pt.distanceKm} km
                            </div>
                            <div className="text-slate-600">{pt.role} · {pt.window}</div>
                          </div>
                        );
                      }}
                    />
                    <Scatter
                      data={magScatterPoints}
                      onClick={(node) => {
                        const recId = (node as { id?: string })?.id;
                        if (recId) onSelectRecord(recId);
                      }}
                      className="cursor-pointer"
                    >
                      {magScatterPoints.map((pt) => (
                        <Cell
                          key={`mag-t-${pt.id}`}
                          fill={pt.color}
                          stroke={pt.id === selectedRecordId ? '#0f172a' : '#ffffff'}
                          strokeWidth={pt.id === selectedRecordId ? 2.2 : 0.7}
                        />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Chart 2: Seismicity Rate / Counts / Cumulative Curve */}
          <div className="bg-[#f3f1fb] border border-indigo-700/60 rounded-lg p-3.5 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="text-xs font-bold text-slate-800">
                Binned Seismicity Rate &amp; Cumulative Count
              </div>
              <div className="flex items-center gap-1 text-[10px]">
                {(
                  [
                    ['rate', 'Rate (/day)'],
                    ['count', 'Bin Counts'],
                    ['cumulative', 'Cumulative'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setRateViewMode(key)}
                    className={`px-1.5 py-0.5 border rounded-xs font-medium ${
                      rateViewMode === key
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                {rateViewMode === 'cumulative' ? (
                  <ComposedChart data={binChartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="shortLabel" tick={{ fontSize: 9, fill: '#475569' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#475569' }} width={40} />
                    {refBinLabel && (
                      <ReferenceLine x={refBinLabel} stroke="#dc2626" strokeDasharray="4 3" />
                    )}
                    {msBinLabel && msBinLabel !== refBinLabel && (
                      <ReferenceLine x={msBinLabel} stroke="#7c3aed" strokeDasharray="4 3" />
                    )}
                    <Tooltip
                      contentStyle={{ fontSize: '11px', fontFamily: 'monospace' }}
                      formatter={(val: unknown) => [`${val}`, 'Cumulative Events']}
                    />
                    <Line
                      type="monotone"
                      dataKey="cumulativeCount"
                      stroke="#1d4ed8"
                      strokeWidth={2}
                      dot={false}
                      name="Cumulative Count"
                    />
                  </ComposedChart>
                ) : (
                  <BarChart data={binChartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="shortLabel" tick={{ fontSize: 9, fill: '#475569' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#475569' }} width={40} />
                    {refBinLabel && (
                      <ReferenceLine x={refBinLabel} stroke="#dc2626" strokeDasharray="4 3" />
                    )}
                    {msBinLabel && msBinLabel !== refBinLabel && (
                      <ReferenceLine x={msBinLabel} stroke="#7c3aed" strokeDasharray="4 3" />
                    )}
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const row = payload[0].payload as (typeof binChartData)[number];
                        return (
                          <div className="bg-white border border-slate-300 px-2.5 py-1.5 text-[11px] font-mono shadow-sm">
                            <div className="font-bold">{row.labelUtc} UTC</div>
                            <div>Count: {row.count} events · Cumulative: {row.cumulativeCount}</div>
                            <div>
                              Observed Rate: {row.ratePerDay}/day (over {row.observedHours}h
                              {row.isPartialInterval ? ' — partial interval' : ''})
                            </div>
                            {row.maxMag !== null && <div>Max Mag in bin: {row.maxMag.toFixed(1)}</div>}
                          </div>
                        );
                      }}
                    />
                    <Bar
                      dataKey={rateViewMode === 'rate' ? 'ratePerDay' : 'count'}
                      name={rateViewMode === 'rate' ? 'Rate (/day)' : 'Event Count'}
                    >
                      {binChartData.map((entry) => (
                        <Cell
                          key={`bin-${entry.binIndex}`}
                          fill={entry.isPartialInterval ? '#94a3b8' : '#2563eb'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
            <div className="text-[10px] text-slate-500 font-mono mt-1">
              Gray bars indicate partial boundary intervals normalized by observed hours within the configured window.
            </div>
          </div>

          {/* Chart 3: Epicentral Distance vs Time */}
          <div className="bg-[#edf4fc] border border-sky-700/60 rounded-lg p-3.5 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
            <div className="text-xs font-bold text-slate-800 mb-2">
              Epicentral Distance from Active Event vs {timeAxisMode === 'utc' ? 'Time (UTC)' : 'Relative Days (Δt)'} (km)
            </div>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    type="number"
                    dataKey={timeAxisMode === 'utc' ? 'originTimeMs' : 'dtAnchorDays'}
                    domain={['auto', 'auto']}
                    tickFormatter={(v) =>
                      timeAxisMode === 'utc'
                        ? formatShortUtc(Number(v))
                        : `${Number(v).toFixed(1)}d`
                    }
                    tick={{ fontSize: 10, fill: '#475569' }}
                  />
                  <YAxis
                    type="number"
                    dataKey="distanceKm"
                    tick={{ fontSize: 10, fill: '#475569' }}
                    width={40}
                    unit=" km"
                  />
                  <ZAxis range={[32, 90]} />
                  {timeAxisMode === 'utc' && refMs !== null && (
                    <ReferenceLine x={refMs} stroke="#dc2626" strokeDasharray="4 3" />
                  )}
                  {timeAxisMode === 'relative-days' && refRelativeDays !== null && (
                    <ReferenceLine x={refRelativeDays} stroke="#dc2626" strokeDasharray="4 3" />
                  )}
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const pt = payload[0].payload as (typeof distScatterPoints)[number];
                      return (
                        <div className="bg-white border border-slate-300 px-2.5 py-1.5 text-[11px] font-mono shadow-sm">
                          <div className="font-bold">{pt.eventId}</div>
                          <div>{pt.originTimeUtc.slice(0, 19)} UTC</div>
                          <div>Dist: {pt.distanceKm} km · {pt.magLabel} · {pt.role}</div>
                        </div>
                      );
                    }}
                  />
                  <Scatter
                    data={distScatterPoints}
                    onClick={(node) => {
                      const recId = (node as { id?: string })?.id;
                      if (recId) onSelectRecord(recId);
                    }}
                    className="cursor-pointer"
                  >
                    {distScatterPoints.map((pt) => (
                      <Cell
                        key={`dist-t-${pt.id}`}
                        fill={pt.color}
                        stroke={pt.id === selectedRecordId ? '#0f172a' : '#ffffff'}
                        strokeWidth={pt.id === selectedRecordId ? 2.2 : 0.7}
                      />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Gap Alert Table (Never treated as zero seismicity) */}
          <div className="bg-[#fbf5ea] border border-amber-700/60 rounded-lg p-3.5 flex flex-col shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
            <div className="text-xs font-bold text-slate-800 mb-1.5">
              Missing Observation / Catalog Gap Diagnostics
            </div>
            <p className="text-[11px] text-slate-700 mb-2">
              Inter-event gaps exceeding {filters.gapThresholdHours} hours are highlighted as possible catalog outages or detection limits — never interpreted as confirmed zero seismicity.
            </p>
            {timeline.gaps.length === 0 ? (
              <div className="flex-1 flex items-center justify-center bg-[#f3e6cc] border border-amber-800/60 rounded p-4 text-xs text-slate-700">
                No inter-event gaps ≥ {filters.gapThresholdHours}h detected across selected window.
              </div>
            ) : (
              <div className="max-h-48 overflow-y-auto border border-amber-800/55 bg-white/80 rounded">
                <table className="w-full text-left border-collapse text-[11px] font-mono tabular-nums">
                  <thead className="bg-[#f3e6cc] text-slate-800 sticky top-0">
                    <tr>
                      <th className="px-2 py-1 border-b border-slate-200">Gap Start (UTC)</th>
                      <th className="px-2 py-1 border-b border-slate-200">Gap End (UTC)</th>
                      <th className="px-2 py-1 border-b border-slate-200 text-right">Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {timeline.gaps.map((g, idx) => (
                      <tr key={`gap-${idx}`} className="border-b border-slate-100 hover:bg-amber-50">
                        <td className="px-2 py-1">{g.startUtc.slice(0, 16).replace('T', ' ')}</td>
                        <td className="px-2 py-1">{g.endUtc.slice(0, 16).replace('T', ' ')}</td>
                        <td className="px-2 py-1 text-right font-semibold text-amber-800">
                          {g.durationHours.toFixed(1)} h
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// SECTION C — SPATIAL & DEPTH ANALYSIS PANEL
// ============================================================================

interface SequenceSpatialPanelProps {
  activeEvent: EQPEvent;
  assembly: SequenceAssemblyResult;
  filters: SequenceFilterConfig;
  selectedRecordId: string | null;
  onSelectRecord: (recordId: string) => void;
  activeFaultsDataset: ActiveFaultsDataset | null;
  trenchSystemsDataset: TrenchSystemsDataset | null;
  onNotice?: (msg: string) => void;
}

export const SequenceSpatialPanel: React.FC<SequenceSpatialPanelProps> = ({
  activeEvent,
  assembly,
  filters,
  selectedRecordId,
  onSelectRecord,
  activeFaultsDataset,
  trenchSystemsDataset,
  onNotice,
}) => {
  const unlocated = isEventUnlocated(activeEvent);
  const mapSvgRef = useRef<SVGSVGElement | null>(null);
  const crossSvgRef = useRef<SVGSVGElement | null>(null);

  const [mapZoomSpanDeg, setMapZoomSpanDeg] = useState<number>(2.4);
  const [mapPanOffset, setMapPanOffset] = useState<{ dLat: number; dLon: number }>({
    dLat: 0,
    dLon: 0,
  });
  const [showFaults, setShowFaults] = useState<boolean>(true);
  const [showVerifiedGisLayers, setShowVerifiedGisLayers] = useState<boolean>(false);
  const [showBeachballs, setShowBeachballs] = useState<boolean>(true);
  const [highlightClusterId, setHighlightClusterId] = useState<number | 'all'>('all');
  const [sectionAzimuthDeg, setSectionAzimuthDeg] = useState<number>(90);
  const [sectionHalfWidthKm, setSectionHalfWidthKm] = useState<number>(40);

  const MAP_W = 680;
  const MAP_H = 440;

  const mapBounds = useMemo(() => {
    const baseLat = unlocated ? 12.88 : activeEvent.lat;
    const baseLon = unlocated ? 121.77 : activeEvent.lon;
    const centerLat = baseLat + mapPanOffset.dLat;
    const centerLon = baseLon + mapPanOffset.dLon;
    const halfLat = mapZoomSpanDeg * 0.5;
    const cosLat = Math.max(0.35, Math.cos((centerLat * Math.PI) / 180));
    const halfLon = (halfLat * (MAP_W / MAP_H)) / cosLat;
    return {
      centerLat,
      centerLon,
      minLat: centerLat - halfLat,
      maxLat: centerLat + halfLat,
      minLon: centerLon - halfLon,
      maxLon: centerLon + halfLon,
      cosLat,
    };
  }, [unlocated, activeEvent.lat, activeEvent.lon, mapPanOffset, mapZoomSpanDeg]);

  const projectCoord = useCallback(
    (lat: number, lon: number) => {
      const x = ((lon - mapBounds.minLon) / (mapBounds.maxLon - mapBounds.minLon)) * MAP_W;
      const y = ((mapBounds.maxLat - lat) / (mapBounds.maxLat - mapBounds.minLat)) * MAP_H;
      return { x, y };
    },
    [mapBounds]
  );

  const radiusCirclePx = useMemo(() => {
    const degLat = filters.radiusKm / 110.574;
    const degLon = filters.radiusKm / (111.32 * mapBounds.cosLat);
    return {
      rx: (degLon / (mapBounds.maxLon - mapBounds.minLon)) * MAP_W,
      ry: (degLat / (mapBounds.maxLat - mapBounds.minLat)) * MAP_H,
    };
  }, [filters.radiusKm, mapBounds]);

  const crossSectionEndpoints = useMemo(() => {
    if (unlocated) return null;
    const azRad = (sectionAzimuthDeg * Math.PI) / 180;
    const dLat = (filters.radiusKm * Math.cos(azRad)) / 110.574;
    const dLon = (filters.radiusKm * Math.sin(azRad)) / (111.32 * mapBounds.cosLat);
    const pA = projectCoord(activeEvent.lat - dLat, activeEvent.lon - dLon);
    const pB = projectCoord(activeEvent.lat + dLat, activeEvent.lon + dLon);
    return { pA, pB };
  }, [unlocated, sectionAzimuthDeg, filters.radiusKm, mapBounds.cosLat, activeEvent.lat, activeEvent.lon, projectCoord]);

  const clusterIds = useMemo(() => {
    const ids = new Set<number>();
    assembly.selectedEvents.forEach((e) => {
      if (e.clusterId !== null) ids.add(e.clusterId);
    });
    return Array.from(ids).sort((a, b) => a - b);
  }, [assembly.selectedEvents]);

  const crossSection = useMemo(() => {
    if (unlocated) return { points: [], maxAlong: 100, maxDepth: 120 };
    const pts = projectSequenceToCrossSection(
      assembly.selectedEvents,
      activeEvent.lat,
      activeEvent.lon,
      sectionAzimuthDeg,
      sectionHalfWidthKm
    );
    const maxAlong = Math.max(
      filters.radiusKm,
      ...pts.map((p) => Math.ceil(Math.abs(p.alongKm) / 25) * 25)
    );
    const maxDepth = Math.max(
      70,
      Math.ceil(activeEvent.depthKm / 25) * 25 + 25,
      ...pts.map((p) => Math.ceil(p.depthKm / 25) * 25 + 15)
    );
    return { points: pts, maxAlong, maxDepth };
  }, [unlocated, assembly.selectedEvents, activeEvent.lat, activeEvent.lon, activeEvent.depthKm, sectionAzimuthDeg, sectionHalfWidthKm, filters.radiusKm]);

  const depthTimePoints = useMemo(() => {
    return assembly.selectedEvents
      .filter((e) => e.record.depthKm !== null)
      .map((e) => ({
        id: e.record.id,
        eventId: e.record.eventId,
        originTimeMs: e.record.originTimeMs,
        originTimeUtc: e.record.originTimeUtc,
        depthKm: e.record.depthKm!,
        distanceKm: e.distanceKm,
        mag: e.record.magnitude,
        role: e.role,
        color: ROLE_COLORS[e.role] ?? '#475569',
      }));
  }, [assembly.selectedEvents]);

  const selectedCandidate: SequenceCandidateEvent | null = useMemo(
    () =>
      assembly.events.find((e) => e.record.id === selectedRecordId) ??
      assembly.selectedEvents[0] ??
      null,
    [assembly.events, assembly.selectedEvents, selectedRecordId]
  );

  // Helper to convert GeoJsonLineGeometry paths clipped around map bounds
  const renderLineCoords = useCallback(
    (coords: Array<[number, number]>, keyPrefix: string, stroke: string, dash?: string) => {
      if (coords.length < 2) return null;
      const pts = coords
        .map(([lon, lat]) => {
          const p = projectCoord(lat, lon);
          return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
        })
        .join(' ');
      return (
        <polyline
          key={keyPrefix}
          points={pts}
          fill="none"
          stroke={stroke}
          strokeWidth={1.1}
          strokeDasharray={dash}
          strokeOpacity={0.75}
        />
      );
    },
    [projectCoord]
  );

  return (
    <div className="space-y-3">
      {/* Row 1: Spatial Epicenter Map (8 cols) + Selected Event & Uncertainty Inspector (4 cols) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
        <div className="xl:col-span-8 bg-[#edf4fc] border border-sky-700/60 rounded-lg overflow-hidden flex flex-col shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
          <div className="px-3 py-2 border-b border-sky-700/40 bg-[#dce9f8] flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-bold text-slate-800">
              Sequence Spatial Map (Scaled by Magnitude · Colored by Depth)
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              {clusterIds.length > 0 && (
                <select
                  value={highlightClusterId}
                  onChange={(e) =>
                    setHighlightClusterId(e.target.value === 'all' ? 'all' : Number(e.target.value))
                  }
                  className="border border-slate-300 rounded-xs px-1.5 py-0.5 bg-white font-mono"
                >
                  <option value="all">All Clusters ({clusterIds.length})</option>
                  {clusterIds.map((cid) => (
                    <option key={cid} value={cid}>
                      Cluster #{cid}
                    </option>
                  ))}
                </select>
              )}
              <label className="inline-flex items-center gap-1 cursor-pointer text-slate-700">
                <input
                  type="checkbox"
                  checked={showBeachballs}
                  onChange={(e) => setShowBeachballs(e.target.checked)}
                />
                Beachballs
              </label>
              <label className="inline-flex items-center gap-1 cursor-pointer text-slate-700">
                <input
                  type="checkbox"
                  checked={showFaults}
                  onChange={(e) => setShowFaults(e.target.checked)}
                />
                Base Faults
              </label>
              {(activeFaultsDataset || trenchSystemsDataset) && (
                <label className="inline-flex items-center gap-1 cursor-pointer text-slate-700">
                  <input
                    type="checkbox"
                    checked={showVerifiedGisLayers}
                    onChange={(e) => setShowVerifiedGisLayers(e.target.checked)}
                  />
                  GIS Layers
                </label>
              )}
              <button
                type="button"
                onClick={() => setMapZoomSpanDeg((z) => Math.max(0.35, Number((z * 0.72).toFixed(2))))}
                className="p-1 border border-slate-300 bg-white rounded-xs hover:bg-slate-100"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setMapZoomSpanDeg((z) => Math.min(18, Number((z * 1.38).toFixed(2))))}
                className="p-1 border border-slate-300 bg-white rounded-xs hover:bg-slate-100"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setMapZoomSpanDeg(2.4);
                  setMapPanOffset({ dLat: 0, dLon: 0 });
                }}
                className="px-1.5 py-0.5 border border-slate-300 bg-white rounded-xs hover:bg-slate-100 font-medium"
              >
                Center
              </button>
              <button
                type="button"
                onClick={() => {
                  const name = `sequence_map_${activeEvent.filename.replace(/\.eqp$/i, '')}.svg`;
                  if (exportSvgElementAsSvg(mapSvgRef.current, name)) {
                    onNotice?.(`Exported ${name}`);
                  }
                }}
                className="px-1.5 py-0.5 border border-slate-300 bg-white rounded-xs hover:bg-slate-100 inline-flex items-center gap-1"
              >
                <Download className="w-3 h-3" /> SVG
              </button>
              <button
                type="button"
                onClick={() =>
                  void exportSvgElementAsPng(
                    mapSvgRef.current,
                    `sequence_map_${activeEvent.filename.replace(/\.eqp$/i, '')}.png`,
                    2
                  ).then((ok) => ok && onNotice?.('Exported sequence map PNG'))
                }
                className="px-1.5 py-0.5 border border-slate-300 bg-white rounded-xs hover:bg-slate-100 inline-flex items-center gap-1"
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
                  return Math.max(0.3, Math.min(20, Number((z * factor).toFixed(3))));
                });
              };
            }}
            className="relative bg-sky-50 overflow-hidden cursor-grab active:cursor-grabbing"
            onMouseDown={(downEv) => {
              if (
                downEv.button !== 0 ||
                (downEv.target as Element)?.closest('circle, g.cursor-pointer')
              ) {
                return;
              }
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
              {ISLAND_POLYGONS.map((poly, idx) => {
                const pts = poly.points
                  .map(([lon, lat]) => {
                    const p = projectCoord(lat, lon);
                    return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
                  })
                  .join(' ');
                return (
                  <polygon
                    key={`seq-isl-${idx}`}
                    points={pts}
                    fill="#f8fafc"
                    stroke="#94a3b8"
                    strokeWidth={0.8}
                  />
                );
              })}

              {showFaults &&
                FAULT_TRACES.map((fl, idx) => {
                  const pts = fl.points
                    .map(([lon, lat]) => {
                      const p = projectCoord(lat, lon);
                      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
                    })
                    .join(' ');
                  return (
                    <polyline
                      key={`seq-flt-${idx}`}
                      points={pts}
                      fill="none"
                      stroke={fl.kind === 'boundary' ? '#64748b' : '#b45309'}
                      strokeWidth={fl.kind === 'boundary' ? 1.1 : 0.9}
                      strokeDasharray={fl.kind === 'boundary' ? '5,4' : undefined}
                      strokeOpacity={0.65}
                    >
                      <title>{fl.name}</title>
                    </polyline>
                  );
                })}

              {showVerifiedGisLayers &&
                activeFaultsDataset?.features.map((f, idx) => {
                  const [fMinLon, fMinLat, fMaxLon, fMaxLat] = f.bbox;
                  if (
                    fMaxLon < mapBounds.minLon ||
                    fMinLon > mapBounds.maxLon ||
                    fMaxLat < mapBounds.minLat ||
                    fMinLat > mapBounds.maxLat
                  ) {
                    return null;
                  }
                  const stroke = f.isUncertainTrace ? '#d97706' : '#b91c1c';
                  const dash = f.isUncertainTrace ? '4,3' : undefined;
                  if (f.geometry.type === 'LineString') {
                    return renderLineCoords(f.geometry.coordinates, `gf-${idx}`, stroke, dash);
                  }
                  return f.geometry.coordinates.map((seg, sIdx) =>
                    renderLineCoords(seg, `gf-${idx}-${sIdx}`, stroke, dash)
                  );
                })}

              {showVerifiedGisLayers &&
                trenchSystemsDataset?.features.map((t, idx) => {
                  const [tMinLon, tMinLat, tMaxLon, tMaxLat] = t.bbox;
                  if (
                    tMaxLon < mapBounds.minLon ||
                    tMinLon > mapBounds.maxLon ||
                    tMaxLat < mapBounds.minLat ||
                    tMinLat > mapBounds.maxLat
                  ) {
                    return null;
                  }
                  if (t.geometry.type === 'LineString') {
                    return renderLineCoords(t.geometry.coordinates, `gt-${idx}`, '#4338ca', '6,3');
                  }
                  return t.geometry.coordinates.map((seg, sIdx) =>
                    renderLineCoords(seg, `gt-${idx}-${sIdx}`, '#4338ca', '6,3')
                  );
                })}

              {!unlocated && (() => {
                const centerPx = projectCoord(activeEvent.lat, activeEvent.lon);
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
                      strokeWidth={1.2}
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
                          strokeWidth={1.3}
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

              {/* Sequence Events */}
              {assembly.selectedEvents.map((ev) => {
                const pt = projectCoord(ev.record.lat, ev.record.lon);
                if (pt.x < -30 || pt.x > MAP_W + 30 || pt.y < -30 || pt.y > MAP_H + 30) {
                  return null;
                }
                const isSel = selectedRecordId === ev.record.id;
                const isMainshock = assembly.candidateMainshockId === ev.record.id;
                const matchesCluster =
                  highlightClusterId === 'all' || ev.clusterId === highlightClusterId;
                const opacity = matchesCluster ? 0.9 : 0.2;
                const r = magnitudeToSymbolRadiusPx(ev.record.magnitude);

                return (
                  <g key={`seq-pt-${ev.record.id}`} opacity={opacity}>
                    {ev.clusterId !== null && (
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={r + 4}
                        fill="none"
                        stroke="#0d9488"
                        strokeWidth={1.2}
                        strokeDasharray="2,2"
                      />
                    )}
                    {isMainshock && (
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={r + 6}
                        fill="none"
                        stroke="#7c3aed"
                        strokeWidth={2}
                      />
                    )}
                    {showBeachballs && ev.record.focalMechanism ? (
                      <HistoricalBeachballGlyph
                        plane1={ev.record.focalMechanism.plane1}
                        cx={pt.x}
                        cy={pt.y}
                        radius={Math.max(7, Math.min(13, r * 1.4))}
                        provenanceKind={ev.record.focalMechanism.provenanceKind}
                        isSelected={isSel}
                        onClick={() => onSelectRecord(ev.record.id)}
                        title={`${ev.record.eventId} · ${ev.role} · ${ev.record.magnitudeType} ${ev.record.magnitude ?? 'N/A'}`}
                      />
                    ) : (
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={isSel ? r + 2.5 : r}
                        fill={depthToColorHex(ev.record.depthKm)}
                        stroke={isSel ? '#0f172a' : '#ffffff'}
                        strokeWidth={isSel ? 2.2 : 0.8}
                        className="cursor-pointer"
                        onClick={() => onSelectRecord(ev.record.id)}
                      >
                        <title>{`${ev.record.eventId} · ${ev.role} · ${ev.record.originTimeUtc} · ${ev.record.magnitudeType} ${ev.record.magnitude ?? 'N/A'} · Z=${ev.record.depthKm ?? 'Missing'} km`}</title>
                      </circle>
                    )}
                  </g>
                );
              })}

              {/* Reference Earthquake Star */}
              {!unlocated && (() => {
                const p = projectCoord(activeEvent.lat, activeEvent.lon);
                const starPts = Array.from({ length: 10 }, (_, idx) => {
                  const angle = (idx * Math.PI) / 5 - Math.PI / 2;
                  const rad = idx % 2 === 0 ? 10.5 : 4.6;
                  return `${(p.x + rad * Math.cos(angle)).toFixed(1)},${(
                    p.y +
                    rad * Math.sin(angle)
                  ).toFixed(1)}`;
                }).join(' ');
                return (
                  <polygon points={starPts} fill="#dc2626" stroke="#ffffff" strokeWidth={1.2}>
                    <title>{`Active EQP Reference Event: ${activeEvent.filename}`}</title>
                  </polygon>
                );
              })()}
            </svg>
          </div>

          <div className="px-3 py-1.5 border-t border-sky-700/40 bg-[#dce9f8] flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-slate-700">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 inline-block rounded-full bg-[#dc2626]" /> 0–15 km
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 inline-block rounded-full bg-[#ea580c]" /> 15–35 km
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 inline-block rounded-full bg-[#d97706]" /> 35–70 km
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 inline-block rounded-full bg-[#0d9488]" /> 70–150 km
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 inline-block rounded-full bg-[#2563eb]" /> &gt;150 km
              </span>
            </div>
            <div>Red star = Reference Event · Violet ring = Candidate Mainshock</div>
          </div>
        </div>

        {/* Selected Event Inspector & Location Uncertainty */}
        <div className="xl:col-span-4 bg-[#f1f4f9] border border-slate-600/70 rounded-lg p-3.5 flex flex-col justify-between space-y-3 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
          {selectedCandidate ? (
            <div className="space-y-2 text-xs">
              <div className="bg-[#dfe6f0] border border-slate-700/60 rounded p-2.5">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-600">
                  Selected Sequence Event
                </div>
                <div className="text-sm font-bold font-mono text-slate-900 mt-0.5">
                  {selectedCandidate.record.eventId}
                </div>
                <div className="text-[11px] font-mono text-slate-700">
                  {selectedCandidate.role} · {selectedCandidate.window}
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-y-1.5 gap-x-2 text-[11px] font-mono tabular-nums">
                <dt className="text-slate-500">Origin UTC</dt>
                <dd className="text-slate-900">
                  {selectedCandidate.record.originTimeUtc.slice(0, 19)}
                </dd>
                <dt className="text-slate-500">Coordinates</dt>
                <dd className="text-slate-900">
                  {selectedCandidate.record.lat.toFixed(4)}°N, {selectedCandidate.record.lon.toFixed(4)}°E
                </dd>
                <dt className="text-slate-500">Depth</dt>
                <dd className="text-slate-900">
                  {selectedCandidate.record.depthKm !== null
                    ? `${selectedCandidate.record.depthKm.toFixed(1)} km (${selectedCandidate.record.depthStatus})`
                    : 'Missing'}
                </dd>
                <dt className="text-slate-500">Magnitude</dt>
                <dd className="text-slate-900">
                  {selectedCandidate.record.magnitude !== null
                    ? `${selectedCandidate.record.magnitudeType} ${selectedCandidate.record.magnitude.toFixed(2)}`
                    : 'Unavailable'}
                </dd>
                <dt className="text-slate-500">Distance / Az</dt>
                <dd className="text-slate-900">
                  {selectedCandidate.distanceKm} km · {selectedCandidate.azimuthDeg}°
                </dd>
                <dt className="text-slate-500">Δt vs Reference</dt>
                <dd className="text-slate-900">
                  {selectedCandidate.dtHoursFromReference !== null
                    ? `${selectedCandidate.dtHoursFromReference > 0 ? '+' : ''}${selectedCandidate.dtHoursFromReference.toFixed(2)} h`
                    : '—'}
                </dd>
                <dt className="text-slate-500">Source</dt>
                <dd className="text-slate-900">{selectedCandidate.record.dataSource}</dd>
                <dt className="text-slate-500">Location Err</dt>
                <dd
                  className={
                    selectedCandidate.record.locationUncertain
                      ? 'text-amber-800 font-semibold'
                      : 'text-slate-900'
                  }
                >
                  H: {selectedCandidate.record.horizontalErrKm ?? '—'} km · Z:{' '}
                  {selectedCandidate.record.depthErrKm ?? '—'} km
                </dd>
              </dl>

              {selectedCandidate.record.locationUncertain && (
                <div className="bg-amber-50 border border-amber-200 rounded-xs p-2 text-[11px] text-amber-900 flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-700" />
                  <span>
                    Catalog flags this hypocenter location or depth as uncertain. Cross-section projection and clustering distances may shift with formal relocation.
                  </span>
                </div>
              )}
              {selectedCandidate.record.place && (
                <div className="text-[11px] text-slate-600 border-t border-slate-100 pt-1.5">
                  Region: {selectedCandidate.record.place}
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-slate-500">
              Select an earthquake marker on the map or table to inspect hypocenter parameters and uncertainty.
            </div>
          )}

          <div className="border-t border-slate-200 pt-2 text-[10px] text-slate-500 leading-relaxed">
            <strong>Conservative Spatial Note:</strong> Spatial clusters and apparent epicentral expansion/migration are observational summaries only and do not confirm rupture directivity or fluid migration.
          </div>
        </div>
      </div>

      {/* Row 2: Configurable Depth Cross-Section A–A' + Depth-vs-Time */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {/* Depth Cross-Section A-A' */}
        <div className="bg-[#edf4fc] border border-sky-700/60 rounded-lg p-3.5 space-y-2 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-bold text-slate-800">
              Depth Cross-Section A–A&apos; (Width ±{sectionHalfWidthKm} km)
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
              <label className="inline-flex items-center gap-1">
                <span>Az°:</span>
                <input
                  type="number"
                  min={0}
                  max={359}
                  value={sectionAzimuthDeg}
                  onChange={(e) => setSectionAzimuthDeg(Number(e.target.value) || 0)}
                  className="w-14 border border-slate-300 rounded-xs px-1 py-0.5"
                />
              </label>
              <label className="inline-flex items-center gap-1">
                <span>Half-Swath km:</span>
                <input
                  type="number"
                  min={5}
                  max={250}
                  value={sectionHalfWidthKm}
                  onChange={(e) => setSectionHalfWidthKm(Math.max(5, Number(e.target.value) || 25))}
                  className="w-14 border border-slate-300 rounded-xs px-1 py-0.5"
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  const name = `sequence_cross_section_${activeEvent.filename.replace(/\.eqp$/i, '')}.svg`;
                  if (exportSvgElementAsSvg(crossSvgRef.current, name)) {
                    onNotice?.(`Exported ${name}`);
                  }
                }}
                className="px-1.5 py-0.5 border border-slate-300 bg-white rounded-xs hover:bg-slate-50 inline-flex items-center gap-1"
              >
                <Download className="w-3 h-3" /> SVG
              </button>
            </div>
          </div>

          {unlocated ? (
            <div className="h-56 flex items-center justify-center bg-slate-50 border border-slate-200 rounded-xs text-xs text-slate-500">
              Active event must be located to orient cross-section A–A&apos;.
            </div>
          ) : (
            <svg
              ref={crossSvgRef}
              viewBox="0 0 600 260"
              className="w-full h-auto border border-slate-200 bg-white"
            >
              {(() => {
                const padL = 46;
                const padR = 20;
                const padT = 22;
                const padB = 34;
                const W = 600 - padL - padR;
                const H = 260 - padT - padB;
                const toX = (along: number) =>
                  padL + ((along + crossSection.maxAlong) / (2 * crossSection.maxAlong)) * W;
                const toY = (depth: number) => padT + (depth / crossSection.maxDepth) * H;
                const refStarX = toX(0);
                const refStarY = toY(activeEvent.depthKm);

                return (
                  <g>
                    <line x1={padL} y1={padT} x2={padL + W} y2={padT} stroke="#94a3b8" strokeWidth={1} />
                    <line x1={padL} y1={padT + H} x2={padL + W} y2={padT + H} stroke="#cbd5e1" strokeWidth={1} />
                    <line x1={refStarX} y1={padT} x2={refStarX} y2={padT + H} stroke="#e2e8f0" strokeDasharray="3,3" />
                    {[0, 0.25, 0.5, 0.75, 1].map((f) => {
                      const z = Math.round(crossSection.maxDepth * f);
                      const y = toY(z);
                      return (
                        <g key={`zgrid-${f}`}>
                          <line x1={padL} y1={y} x2={padL + W} y2={y} stroke="#f1f5f9" />
                          <text x={padL - 5} y={y + 3} fontSize={9} textAnchor="end" fill="#64748b" fontFamily="monospace">
                            {z}
                          </text>
                        </g>
                      );
                    })}
                    <text x={14} y={padT + H / 2} fontSize={9} fill="#475569" transform={`rotate(-90 14 ${padT + H / 2})`} textAnchor="middle">
                      Depth (km)
                    </text>
                    <text x={padL} y={padT - 6} fontSize={10} fontWeight={700} fill="#0f172a">
                      A (-{crossSection.maxAlong} km)
                    </text>
                    <text x={padL + W} y={padT - 6} fontSize={10} fontWeight={700} fill="#0f172a" textAnchor="end">
                      A&apos; (+{crossSection.maxAlong} km)
                    </text>

                    {crossSection.points.map((pt) => {
                      const cx = toX(pt.alongKm);
                      const cy = toY(pt.depthKm);
                      const r = magnitudeToSymbolRadiusPx(pt.item.record.magnitude);
                      const isSel = selectedRecordId === pt.item.record.id;
                      return (
                        <circle
                          key={`xs-${pt.item.record.id}`}
                          cx={cx}
                          cy={cy}
                          r={isSel ? r + 2 : r}
                          fill={depthToColorHex(pt.depthKm)}
                          fillOpacity={0.85}
                          stroke={isSel ? '#0f172a' : '#ffffff'}
                          strokeWidth={isSel ? 2 : 0.7}
                          className="cursor-pointer"
                          onClick={() => onSelectRecord(pt.item.record.id)}
                        >
                          <title>{`${pt.item.record.eventId} · Along ${pt.alongKm.toFixed(1)} km · Depth ${pt.depthKm.toFixed(1)} km`}</title>
                        </circle>
                      );
                    })}

                    <circle
                      cx={refStarX}
                      cy={refStarY}
                      r={5.5}
                      fill="#dc2626"
                      stroke="#ffffff"
                      strokeWidth={1.2}
                    >
                      <title>{`Reference Event Depth ${activeEvent.depthKm.toFixed(1)} km`}</title>
                    </circle>
                    <text x={padL + W / 2} y={252} fontSize={9} fill="#64748b" textAnchor="middle" fontFamily="monospace">
                      Projected Distance Along Azimuth {sectionAzimuthDeg}° (n={crossSection.points.length} w/ depth)
                    </text>
                  </g>
                );
              })()}
            </svg>
          )}
        </div>

        {/* Depth vs Origin Time */}
        <div className="bg-[#f3f1fb] border border-indigo-700/60 rounded-lg p-3.5 flex flex-col shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-bold text-slate-800">
              Hypocenter Depth vs Origin Time (km, Inverted Depth Axis)
            </div>
            <span className="text-[10px] font-mono text-slate-500">
              {depthTimePoints.length} w/ depth
            </span>
          </div>
          {depthTimePoints.length === 0 ? (
            <div className="flex-1 flex items-center justify-center bg-slate-50 border border-slate-200 rounded-xs p-4 text-xs text-slate-500">
              No selected sequence events have reported focal depths.
            </div>
          ) : (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    type="number"
                    dataKey="originTimeMs"
                    domain={['auto', 'auto']}
                    tickFormatter={(v) => formatShortUtc(Number(v))}
                    tick={{ fontSize: 10, fill: '#475569' }}
                  />
                  <YAxis
                    type="number"
                    dataKey="depthKm"
                    reversed
                    tick={{ fontSize: 10, fill: '#475569' }}
                    width={42}
                    unit=" km"
                  />
                  <ZAxis range={[32, 95]} />
                  {assembly.referenceTimeMs !== null && (
                    <ReferenceLine
                      x={assembly.referenceTimeMs}
                      stroke="#dc2626"
                      strokeDasharray="4 3"
                    />
                  )}
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const pt = payload[0].payload as (typeof depthTimePoints)[number];
                      return (
                        <div className="bg-white border border-slate-300 px-2.5 py-1.5 text-[11px] font-mono shadow-sm">
                          <div className="font-bold">{pt.eventId}</div>
                          <div>{pt.originTimeUtc.slice(0, 19)} UTC</div>
                          <div>Depth: {pt.depthKm.toFixed(1)} km · Dist: {pt.distanceKm} km</div>
                        </div>
                      );
                    }}
                  />
                  <Scatter
                    data={depthTimePoints}
                    onClick={(node) => {
                      const recId = (node as { id?: string })?.id;
                      if (recId) onSelectRecord(recId);
                    }}
                    className="cursor-pointer"
                  >
                    {depthTimePoints.map((pt) => (
                      <Cell
                        key={`zt-${pt.id}`}
                        fill={pt.color}
                        stroke={pt.id === selectedRecordId ? '#0f172a' : '#ffffff'}
                        strokeWidth={pt.id === selectedRecordId ? 2 : 0.7}
                      />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// SECTION D — MAGNITUDE–FREQUENCY ANALYSIS PANEL (MFD & b-VALUE)
// ============================================================================

interface SequenceMagnitudePanelProps {
  investigationName: string;
  mfd: MagnitudeFrequencyResult;
  selectedMagType: string;
  onChangeMagType: (mt: string) => void;
  mcMethod: SequenceMcMethod;
  onChangeMcMethod: (m: SequenceMcMethod) => void;
  manualMc: number;
  onChangeManualMc: (v: number) => void;
  binWidth: number;
  onChangeBinWidth: (w: number) => void;
  onNotice?: (msg: string) => void;
}

export const SequenceMagnitudePanel: React.FC<SequenceMagnitudePanelProps> = ({
  investigationName,
  mfd,
  selectedMagType,
  onChangeMagType,
  mcMethod,
  onChangeMcMethod,
  manualMc,
  onChangeManualMc,
  binWidth,
  onChangeBinWidth,
  onNotice,
}) => {
  const [showIncrementalLog, setShowIncrementalLog] = useState(true);
  const grChartRef = useRef<HTMLDivElement | null>(null);

  const chartData = useMemo(
    () =>
      mfd.bins.map((b) => {
        const residual =
          b.log10Cum !== null && b.fittedLog10Cum !== null
            ? Number((b.log10Cum - b.fittedLog10Cum).toFixed(3))
            : null;
        return {
          ...b,
          magLabel: b.magCenter.toFixed(1),
          log10Inc: b.count > 0 ? Number(Math.log10(b.count).toFixed(3)) : null,
          residualLog10: residual,
        };
      }),
    [mfd.bins]
  );

  const minBinMag = chartData.length > 0 ? chartData[0].magCenter : 0;
  const maxBinMag = chartData.length > 0 ? chartData[chartData.length - 1].magCenter : 8;
  const observedMmax = useMemo(() => {
    const nonEmpty = mfd.bins.filter((b) => b.count > 0);
    return nonEmpty.length > 0 ? nonEmpty[nonEmpty.length - 1].magCenter : null;
  }, [mfd.bins]);

  const mcHistLabel = useMemo(() => {
    if (mfd.mcValue === null || chartData.length === 0) return null;
    let closest = chartData[0];
    let bestDiff = Math.abs(chartData[0].magCenter - mfd.mcValue);
    for (const row of chartData) {
      const d = Math.abs(row.magCenter - mfd.mcValue);
      if (d < bestDiff) {
        bestDiff = d;
        closest = row;
      }
    }
    return closest.magLabel;
  }, [chartData, mfd.mcValue]);

  const handleSelectMcBin = useCallback(
    (magVal: number) => {
      const snapped = Number(magVal.toFixed(1));
      onChangeMcMethod('manual');
      onChangeManualMc(snapped);
      onNotice?.(`Set manual completeness threshold Mc = ${snapped.toFixed(1)}.`);
    },
    [onChangeMcMethod, onChangeManualMc, onNotice]
  );

  const handleExportMfdCsv = () => {
    const csv = exportMagnitudeFrequencyCsv(mfd, investigationName);
    const fname = `eqp_mfd_${investigationName.replace(/\W+/g, '_').toLowerCase()}.csv`;
    triggerTextDownload(fname, csv, 'text/csv;charset=utf-8');
    onNotice?.('Exported magnitude–frequency & Gutenberg–Richter CSV.');
  };

  const handleExportGrFigure = (format: 'svg' | 'png') => {
    const svg = grChartRef.current?.querySelector('svg');
    if (!svg) return;
    const base = `eqp_gutenberg_richter_${investigationName.replace(/\W+/g, '_').toLowerCase()}`;
    if (format === 'svg') {
      exportSvgElementAsSvg(svg, `${base}.svg`);
    } else {
      exportSvgElementAsPng(svg, `${base}.png`);
    }
    onNotice?.(`Exported Gutenberg–Richter figure (${format.toUpperCase()}).`);
  };

  const activeSliderMc = mfd.mcValue ?? manualMc;

  return (
    <div className="space-y-3">
      {/* Parameter Controls & Magnitude Scale Isolation */}
      <div className="bg-[#f3f1fb] border border-indigo-700/60 rounded-lg p-3.5 space-y-2.5 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-700/35 pb-2">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-800">
              Magnitude–Frequency Distribution &amp; Gutenberg–Richter Analysis (Experimental)
            </h3>
            <p className="text-[11px] text-slate-600 mt-0.5">{mfd.methodNote}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={handleExportMfdCsv}
              disabled={mfd.bins.length === 0}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 rounded-xs"
            >
              <Download className="w-3 h-3" /> MFD CSV
            </button>
            <button
              type="button"
              onClick={() => handleExportGrFigure('svg')}
              disabled={chartData.length === 0}
              className="px-2 py-0.5 text-[11px] font-semibold border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 rounded-xs"
            >
              GR SVG
            </button>
            <button
              type="button"
              onClick={() => handleExportGrFigure('png')}
              disabled={chartData.length === 0}
              className="px-2 py-0.5 text-[11px] font-semibold border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 rounded-xs"
            >
              GR PNG
            </button>
            <span
              className={`px-2 py-0.5 text-[11px] font-bold font-mono border rounded-xs ${
                mfd.status === 'Insufficient Data'
                  ? 'bg-red-50 text-red-800 border-red-300'
                  : mfd.status === 'Ambiguous'
                  ? 'bg-amber-50 text-amber-900 border-amber-300'
                  : 'bg-blue-50 text-blue-900 border-blue-300'
              }`}
            >
              {mfd.status}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
          <label className="space-y-1">
            <span className="font-semibold text-slate-700 block">
              Magnitude Scale (Strictly Single-Scale)
            </span>
            <select
              value={mfd.selectedMagType ?? selectedMagType}
              onChange={(e) => onChangeMagType(e.target.value)}
              className="w-full border border-slate-300 rounded-xs px-2 py-1 bg-white font-mono"
            >
              {mfd.availableMagTypes.length === 0 ? (
                <option value="">No magnitudes available</option>
              ) : (
                mfd.availableMagTypes.map((mt) => (
                  <option key={mt.magType} value={mt.magType}>
                    {mt.magType} (n={mt.count})
                  </option>
                ))
              )}
            </select>
          </label>

          <label className="space-y-1">
            <span className="font-semibold text-slate-700 block">
              Completeness Threshold (Mc) Method
            </span>
            <select
              value={mcMethod}
              onChange={(e) => onChangeMcMethod(e.target.value as SequenceMcMethod)}
              className="w-full border border-slate-300 rounded-xs px-2 py-1 bg-white font-mono"
            >
              <option value="maxc">MAXC (Max Curvature + 0.1)</option>
              <option value="gft90">GFT-90 (Goodness-of-Fit 90%)</option>
              <option value="manual">Manual Threshold</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="font-semibold text-slate-700 block">
              {mcMethod === 'manual' ? 'Manual Mc Value' : 'Fallback / Reference Mc'}
            </span>
            <input
              type="number"
              step="0.1"
              min={0}
              max={8}
              value={manualMc}
              onChange={(e) => onChangeManualMc(Number(e.target.value) || 0)}
              className="w-full border border-slate-300 rounded-xs px-2 py-1 font-mono"
            />
          </label>

          <label className="space-y-1">
            <span className="font-semibold text-slate-700 block">Magnitude Bin Width (ΔM)</span>
            <select
              value={binWidth}
              onChange={(e) => onChangeBinWidth(Number(e.target.value))}
              className="w-full border border-slate-300 rounded-xs px-2 py-1 bg-white font-mono"
            >
              <option value={0.1}>0.1 mag units</option>
              <option value={0.2}>0.2 mag units</option>
            </select>
          </label>
        </div>

        {/* Interactive Mc Scrub Slider & Fitted Equation Readout */}
        {chartData.length > 0 && (
          <div className="bg-[#e5e1f7] border border-indigo-800/55 rounded px-3 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3 flex-1 min-w-[260px]">
              <span className="font-semibold text-slate-700 whitespace-nowrap">
                Interactive Mc Cutoff:
              </span>
              <input
                type="range"
                min={minBinMag}
                max={maxBinMag}
                step={0.1}
                value={Math.min(maxBinMag, Math.max(minBinMag, activeSliderMc))}
                onChange={(e) => handleSelectMcBin(Number(e.target.value))}
                className="flex-1 accent-blue-700 cursor-pointer"
                aria-label="Interactive Magnitude Completeness Cutoff Mc"
              />
              <span className="font-mono font-bold tabular-nums text-slate-900 min-w-[3.2rem] text-right">
                {activeSliderMc.toFixed(1)}
              </span>
            </div>
            <div className="font-mono text-[11px] text-slate-700 tabular-nums">
              {mfd.aValue !== null && mfd.bValue !== null ? (
                <span>
                  Fit: <strong>log10 N(M ≥ m) = {mfd.aValue.toFixed(3)} − {mfd.bValue.toFixed(3)}·m</strong>
                  {observedMmax !== null ? ` · Mmax ${observedMmax.toFixed(1)}` : ''}
                </span>
              ) : (
                <span>
                  Descriptive MFD only · Click any bar/point or scrub Mc to inspect
                  {observedMmax !== null ? ` · Mmax ${observedMmax.toFixed(1)}` : ''}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Metrics Row */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-0.5">
          <div className="bg-[#d7ebe8] border border-teal-800/65 rounded p-2">
            <div className="text-[10px] font-semibold uppercase text-teal-900">
              Completeness Mc
            </div>
            <div className="text-base font-bold font-mono tabular-nums text-slate-900">
              {mfd.mcValue !== null ? mfd.mcValue.toFixed(1) : '—'}
            </div>
            <div className="text-[10px] font-mono text-slate-600">
              {mfd.mcMethod.toUpperCase()}
              {mfd.gftResidualPct !== null ? ` · Res ${mfd.gftResidualPct}%` : ''}
            </div>
          </div>
          <div className="bg-[#d7ebe8] border border-teal-800/65 rounded p-2">
            <div className="text-[10px] font-semibold uppercase text-teal-900">
              b-Value (Aki MLE)
            </div>
            <div className="text-base font-bold font-mono tabular-nums text-slate-900">
              {mfd.bValue !== null ? mfd.bValue.toFixed(3) : 'Withheld'}
            </div>
            <div className="text-[10px] font-mono text-slate-600">
              ±{mfd.bStdErr !== null ? mfd.bStdErr.toFixed(3) : '—'} (1σ)
            </div>
          </div>
          <div className="bg-[#d7ebe8] border border-teal-800/65 rounded p-2">
            <div className="text-[10px] font-semibold uppercase text-teal-900">95% CI Half-Width</div>
            <div className="text-base font-bold font-mono tabular-nums text-slate-900">
              {mfd.bCi95HalfWidth !== null ? `±${mfd.bCi95HalfWidth.toFixed(3)}` : '—'}
            </div>
            <div className="text-[10px] font-mono text-slate-600">Shi &amp; Bolt (1982)</div>
          </div>
          <div className="bg-[#d7ebe8] border border-teal-800/65 rounded p-2">
            <div className="text-[10px] font-semibold uppercase text-teal-900">a-Value</div>
            <div className="text-base font-bold font-mono tabular-nums text-slate-900">
              {mfd.aValue !== null ? mfd.aValue.toFixed(3) : '—'}
            </div>
            <div className="text-[10px] font-mono text-slate-600">
              log10 N(≥Mc) + b·Mc
            </div>
          </div>
          <div className="bg-[#d7ebe8] border border-teal-800/65 rounded p-2">
            <div className="text-[10px] font-semibold uppercase text-teal-900">Sample ≥ Mc</div>
            <div className="text-base font-bold font-mono tabular-nums text-slate-900">
              {mfd.sampleAboveMc} / {mfd.totalWithMag}
            </div>
            <div className="text-[10px] font-mono text-slate-600">
              Scale: {mfd.selectedMagType ?? 'None'}
            </div>
          </div>
        </div>

        {mfd.warnings.length > 0 && (
          <div className="bg-[#f3e6cc] border border-amber-800/60 rounded p-2 text-[11px] text-amber-950 space-y-0.5">
            {mfd.warnings.map((w, idx) => (
              <div key={`mfd-w-${idx}`} className="flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Charts: Histogram + Cumulative Gutenberg-Richter */}
      {chartData.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          <div className="bg-[#edf4fc] border border-sky-700/60 rounded-lg p-3.5 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="text-xs font-bold text-slate-800">
                Incremental Magnitude Histogram ({mfd.selectedMagType}, ΔM={mfd.binWidth})
              </div>
              <div className="text-[10px] font-mono text-slate-500">
                Blue: M ≥ Mc · Slate: &lt; Mc · Click bar to set Mc
              </div>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 12, right: 16, bottom: 12, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="magLabel" tick={{ fontSize: 10, fill: '#475569' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#475569' }} width={36} allowDecimals={false} />
                  {mcHistLabel && (
                    <ReferenceLine
                      x={mcHistLabel}
                      stroke="#dc2626"
                      strokeDasharray="4 3"
                      label={{
                        value: `Mc ${mfd.mcValue?.toFixed(1) ?? ''}`,
                        fontSize: 10,
                        fill: '#dc2626',
                        position: 'top',
                      }}
                    />
                  )}
                  <Tooltip
                    contentStyle={{ fontSize: '11px', fontFamily: 'monospace' }}
                    formatter={(val: unknown) => [String(val), 'Events in Bin']}
                    labelFormatter={(label) => `Mag Bin ${label} (±${(mfd.binWidth / 2).toFixed(2)})`}
                  />
                  <Bar
                    dataKey="count"
                    name="Events in Bin"
                    cursor="pointer"
                    onClick={(entry) => {
                      const mc = (entry as unknown as { payload?: { magCenter?: number } })?.payload
                        ?.magCenter;
                      if (typeof mc === 'number') {
                        handleSelectMcBin(mc);
                      }
                    }}
                  >
                    {chartData.map((entry) => {
                      const aboveMc = mfd.mcValue === null || entry.magCenter >= mfd.mcValue - 1e-6;
                      return (
                        <Cell
                          key={`hist-cell-${entry.magLabel}`}
                          fill={aboveMc ? '#1e40af' : '#94a3b8'}
                        />
                      );
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-[#f3f1fb] border border-indigo-700/60 rounded-lg p-3.5 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]" ref={grChartRef}>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="text-xs font-bold text-slate-800">
                Cumulative Gutenberg–Richter Fit: log10 N(M ≥ m) = a − bm
              </div>
              <label className="inline-flex items-center gap-1.5 text-[11px] font-mono text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showIncrementalLog}
                  onChange={(e) => setShowIncrementalLog(e.target.checked)}
                />
                Show log10 n(bin)
              </label>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={chartData}
                  margin={{ top: 12, right: 16, bottom: 12, left: 0 }}
                  onClick={(state) => {
                    const activeLabel = state?.activeLabel;
                    if (activeLabel !== undefined && activeLabel !== null) {
                      const num = Number(activeLabel);
                      if (Number.isFinite(num)) {
                        handleSelectMcBin(num);
                      }
                    }
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    type="number"
                    dataKey="magCenter"
                    domain={['dataMin', 'dataMax']}
                    tickCount={8}
                    tick={{ fontSize: 10, fill: '#475569' }}
                    tickFormatter={(v) => Number(v).toFixed(1)}
                  />
                  <YAxis tick={{ fontSize: 10, fill: '#475569' }} width={42} />
                  {mfd.mcValue !== null && (
                    <ReferenceLine
                      x={mfd.mcValue}
                      stroke="#dc2626"
                      strokeDasharray="4 3"
                      label={{
                        value: `Mc=${mfd.mcValue.toFixed(1)}`,
                        fontSize: 10,
                        fill: '#dc2626',
                        position: 'top',
                      }}
                    />
                  )}
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || payload.length === 0) return null;
                      const pt = payload[0]?.payload as (typeof chartData)[number] | undefined;
                      if (!pt) return null;
                      return (
                        <div className="bg-white border border-slate-300 rounded-xs px-2.5 py-1.5 shadow-sm text-[11px] font-mono text-slate-800 space-y-0.5">
                          <div className="font-bold text-slate-900">
                            {mfd.selectedMagType ?? 'Mag'} {pt.magCenter.toFixed(1)}
                          </div>
                          <div>Inc Count: {pt.count} · Cum N(≥M): {pt.cumulativeCount}</div>
                          <div>
                            Obs log10 N: {pt.log10Cum !== null ? pt.log10Cum.toFixed(3) : '—'}
                          </div>
                          <div>
                            Fit log10 N:{' '}
                            {pt.fittedLog10Cum !== null ? pt.fittedLog10Cum.toFixed(3) : '—'}
                          </div>
                          {pt.residualLog10 !== null && (
                            <div>
                              Residual (Obs − Fit): {pt.residualLog10 >= 0 ? '+' : ''}
                              {pt.residualLog10.toFixed(3)}
                            </div>
                          )}
                          <div className="text-[10px] text-blue-700 pt-0.5">
                            Click point to set Mc = {pt.magCenter.toFixed(1)}
                          </div>
                        </div>
                      );
                    }}
                  />
                  {showIncrementalLog && (
                    <Scatter
                      dataKey="log10Inc"
                      name="Incremental log10 n(bin)"
                      fill="#0d9488"
                      cursor="pointer"
                      onClick={(entry) => {
                        const obj = entry as unknown as {
                          payload?: { magCenter?: number };
                          magCenter?: number;
                        };
                        const mc = obj?.payload?.magCenter ?? obj?.magCenter;
                        if (typeof mc === 'number') {
                          handleSelectMcBin(mc);
                        }
                      }}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="log10Cum"
                    stroke="#0f172a"
                    strokeWidth={2}
                    dot={{ r: 3.5, fill: '#0f172a', cursor: 'pointer' }}
                    activeDot={{ r: 5, fill: '#1e40af', cursor: 'pointer' }}
                    name="Observed log10 N(≥M)"
                  />
                  <Line
                    type="monotone"
                    dataKey="fittedLog10Cum"
                    stroke="#dc2626"
                    strokeWidth={2}
                    strokeDasharray="5 3"
                    dot={false}
                    name="Aki MLE Fit (M ≥ Mc)"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Magnitude Bin & Residual Table */}
      {chartData.length > 0 && (
        <div className="bg-[#f1f4f9] border border-slate-600/70 rounded-lg p-3.5 space-y-2 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-bold text-slate-800">
              Magnitude Bin Table &amp; Gutenberg–Richter Fit Residuals (Click row to set Mc)
            </div>
            <div className="text-[10px] font-mono text-slate-600">
              {chartData.length} bins · Scale {mfd.selectedMagType ?? 'N/A'} · ΔM={mfd.binWidth}
            </div>
          </div>
          <div className="max-h-56 overflow-auto border border-slate-600/50 rounded">
            <table className="w-full text-left border-collapse text-[11px] font-mono tabular-nums">
              <thead className="bg-[#dfe6f0] text-slate-800 sticky top-0">
                <tr>
                  <th className="px-2 py-1 border-b border-slate-200">Mag Center</th>
                  <th className="px-2 py-1 border-b border-slate-200 text-right">Inc Count</th>
                  <th className="px-2 py-1 border-b border-slate-200 text-right">Cum N(≥M)</th>
                  <th className="px-2 py-1 border-b border-slate-200 text-right">Obs log10 N</th>
                  <th className="px-2 py-1 border-b border-slate-200 text-right">Fit log10 N</th>
                  <th className="px-2 py-1 border-b border-slate-200 text-right">Residual</th>
                </tr>
              </thead>
              <tbody>
                {chartData.map((row) => {
                  const isMcBin =
                    mfd.mcValue !== null && Math.abs(row.magCenter - mfd.mcValue) <= binWidth * 0.5 + 1e-6;
                  const aboveMc = mfd.mcValue !== null && row.magCenter >= mfd.mcValue - 1e-6;
                  return (
                    <tr
                      key={`bin-row-${row.magLabel}`}
                      onClick={() => handleSelectMcBin(row.magCenter)}
                      className={`border-b border-slate-100 cursor-pointer ${
                        isMcBin
                          ? 'bg-red-50 font-semibold text-red-950'
                          : aboveMc
                          ? 'hover:bg-blue-50 text-slate-800'
                          : 'bg-slate-50/70 text-slate-500 hover:bg-slate-100'
                      }`}
                    >
                      <td className="px-2 py-1">
                        {row.magCenter.toFixed(1)}
                        {isMcBin && <span className="ml-1.5 text-[10px] text-red-700">[Mc]</span>}
                      </td>
                      <td className="px-2 py-1 text-right">{row.count}</td>
                      <td className="px-2 py-1 text-right">{row.cumulativeCount}</td>
                      <td className="px-2 py-1 text-right">
                        {row.log10Cum !== null ? row.log10Cum.toFixed(3) : '—'}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {row.fittedLog10Cum !== null ? row.fittedLog10Cum.toFixed(3) : '—'}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {row.residualLog10 !== null
                          ? `${row.residualLog10 >= 0 ? '+' : ''}${row.residualLog10.toFixed(3)}`
                          : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
