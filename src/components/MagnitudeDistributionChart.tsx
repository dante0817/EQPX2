import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ComposedChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { MagnitudeHistoryEntry, MagnitudeScale, StationPick } from '../data/eqpData';
import {
  computePickDurationMagnitudes,
  isDurationMagnitudeEligible,
} from './MagnitudeDurationPopup';

interface MagnitudeDistributionChartProps {
  picks: StationPick[];
  scale: MagnitudeScale;
  depthKm?: number;
  meanAll: number;
  stdDev: number;
  filteredMean: number;
  varianceK: number;
  outliers: Set<string>;
  history: MagnitudeHistoryEntry[];
}

interface StationMagPoint {
  sta: string;
  magnitude: number;
  delta: number;
  deviation: number;
  zScore: number;
  isOutlier: boolean;
}

interface HistogramBin {
  binLabel: string;
  midpoint: number;
  count: number;
  stations: string[];
  hasOutlier: boolean;
  allOutliers: boolean;
}

type ChartMode = 'corridor' | 'histogram';

export const MagnitudeDistributionChart: React.FC<MagnitudeDistributionChartProps> = ({
  picks,
  scale,
  depthKm,
  meanAll,
  stdDev,
  filteredMean,
  varianceK,
  outliers,
  history,
}) => {
  const [chartMode, setChartMode] = useState<ChartMode>('corridor');
  const [showAllScales, setShowAllScales] = useState(false);
  const scaleKey = scale.toLowerCase() as 'ms' | 'mb' | 'md';

  const stationPoints = useMemo<StationMagPoint[]>(() => {
    return picks
      .filter(isDurationMagnitudeEligible)
      .map((p) => {
        const computed =
          depthKm !== undefined ? computePickDurationMagnitudes(p, depthKm) : null;
        const val = computed
          ? Number(
              (scale === 'Ms' ? computed.ms : scale === 'Mb' ? computed.mb : computed.ml).toFixed(1)
            )
          : p[scaleKey];
        if (val === null) return null;
        const deviation = Number((val - meanAll).toFixed(2));
        const zScore = stdDev > 0 ? Number((Math.abs(val - meanAll) / stdDev).toFixed(2)) : 0;
        return {
          sta: p.sta,
          magnitude: val,
          delta: p.delta,
          deviation,
          zScore,
          isOutlier: outliers.has(p.sta),
        };
      })
      .filter((item): item is StationMagPoint => item !== null)
      .sort((a, b) => a.magnitude - b.magnitude);
  }, [picks, scale, scaleKey, depthKm, meanAll, stdDev, outliers]);

  const lowerBound = useMemo(
    () => Number((meanAll - varianceK * stdDev).toFixed(2)),
    [meanAll, varianceK, stdDev]
  );
  const upperBound = useMemo(
    () => Number((meanAll + varianceK * stdDev).toFixed(2)),
    [meanAll, varianceK, stdDev]
  );

  const yDomain = useMemo<[number, number]>(() => {
    if (stationPoints.length === 0) return [3.0, 6.0];
    const vals = stationPoints.map((p) => p.magnitude);
    const minVal = Math.min(...vals, lowerBound);
    const maxVal = Math.max(...vals, upperBound);
    return [
      Number((Math.floor((minVal - 0.25) * 10) / 10).toFixed(1)),
      Number((Math.ceil((maxVal + 0.25) * 10) / 10).toFixed(1)),
    ];
  }, [stationPoints, lowerBound, upperBound]);

  const histogramBins = useMemo<HistogramBin[]>(() => {
    if (stationPoints.length === 0) return [];
    const binWidth = 0.2;
    const minVal = Math.floor(Math.min(...stationPoints.map((p) => p.magnitude)) * 5) / 5;
    const maxVal = Math.ceil(Math.max(...stationPoints.map((p) => p.magnitude)) * 5) / 5;

    const bins: HistogramBin[] = [];
    for (let edge = minVal; edge <= maxVal + 0.001; edge = Number((edge + binWidth).toFixed(2))) {
      const nextEdge = Number((edge + binWidth).toFixed(2));
      const matched = stationPoints.filter(
        (p) => p.magnitude >= edge - 0.001 && p.magnitude < nextEdge - 0.001
      );
      if (matched.length > 0 || (edge >= minVal && edge < maxVal)) {
        bins.push({
          binLabel: `${edge.toFixed(1)}–${nextEdge.toFixed(1)}`,
          midpoint: Number(((edge + nextEdge) / 2).toFixed(2)),
          count: matched.length,
          stations: matched.map((m) => m.sta),
          hasOutlier: matched.some((m) => m.isOutlier),
          allOutliers: matched.length > 0 && matched.every((m) => m.isOutlier),
        });
      }
    }
    return bins;
  }, [stationPoints]);

  const trendDomain = useMemo<[number, number]>(() => {
    if (history.length === 0) return [3.0, 6.0];
    const values: number[] = [];
    history.forEach((entry) => {
      if (showAllScales) {
        values.push(entry.ms, entry.mb, entry.md);
      } else {
        values.push(entry[scaleKey]);
      }
    });
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    return [
      Number((Math.floor((minVal - 0.2) * 10) / 10).toFixed(1)),
      Number((Math.ceil((maxVal + 0.2) * 10) / 10).toFixed(1)),
    ];
  }, [history, showAllScales, scaleKey]);

  const trendSummary = useMemo(() => {
    if (history.length === 0) return null;
    const first = history[0][scaleKey];
    const latest = history[history.length - 1][scaleKey];
    const delta = Number((latest - first).toFixed(1));
    return { first, latest, delta };
  }, [history, scaleKey]);

  if (stationPoints.length === 0 && history.length === 0) {
    return (
      <section className="bg-gradient-to-br from-sky-50/90 via-slate-100/95 to-indigo-50/90 border border-slate-300/90 rounded-xl p-3.5 sm:p-4 shadow-sm">
        <div className="rounded-lg border border-sky-300/90 bg-sky-50/95 p-6 text-center shadow-[0_4px_20px_-3px_rgba(14,165,233,0.26)] ring-1 ring-sky-200/70">
          <h3 className="text-sm font-semibold text-sky-950">
            Pick Magnitude Distribution ({scale})
          </h3>
          <p className="text-xs text-sky-900/75 mt-1">
            No station {scale} readings are available for this event.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-gradient-to-br from-sky-50/90 via-slate-100/95 to-indigo-50/90 border border-slate-300/90 rounded-xl overflow-hidden shadow-sm p-3.5 sm:p-4 space-y-3.5">
      {/* SUB-CARD A — PICK MAGNITUDE DISTRIBUTION (SKY/BLUE HUE + GLOW) */}
      <div className="rounded-lg border border-sky-300/90 bg-white overflow-hidden shadow-[0_4px_20px_-3px_rgba(14,165,233,0.26)] hover:shadow-[0_6px_24px_-2px_rgba(14,165,233,0.34)] ring-1 ring-sky-200/70 transition-shadow">
        <div className="px-4 py-3 bg-sky-50/95 border-b border-sky-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-sky-950">
              Pick Magnitude Distribution ({scale})
            </h3>
            <p className="text-xs text-sky-900/80 font-mono tabular-nums">
              Accepted corridor: {lowerBound.toFixed(2)} to {upperBound.toFixed(2)} ({varianceK.toFixed(2)}σ) · σ = {stdDev.toFixed(2)} · {outliers.size} rejected
            </p>
          </div>

          <div className="flex items-center gap-1 p-0.5 bg-sky-100/80 border border-sky-200 rounded-md" role="group" aria-label="Distribution Chart View">
          <button
            type="button"
            onClick={() => setChartMode('corridor')}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              chartMode === 'corridor'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Station Corridor
          </button>
          <button
            type="button"
            onClick={() => setChartMode('histogram')}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              chartMode === 'histogram'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Frequency Bins
          </button>
        </div>
      </div>

      <div className="p-4">
        <div className="w-full h-64 min-w-0">
          {chartMode === 'corridor' ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={stationPoints}
                margin={{ top: 14, right: 24, left: 4, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="sta"
                  tick={{ fontSize: 11, fill: '#334155', fontFamily: 'JetBrains Mono, monospace' }}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={false}
                />
                <YAxis
                  domain={yDomain}
                  tickCount={6}
                  tickFormatter={(v: number) => v.toFixed(1)}
                  tick={{ fontSize: 11, fill: '#475569', fontFamily: 'JetBrains Mono, monospace' }}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={false}
                  width={42}
                />
                <Tooltip
                  cursor={{ stroke: '#cbd5e1', strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const pt = payload[0]?.payload as StationMagPoint | undefined;
                    if (!pt) return null;
                    return (
                      <div className="bg-slate-900 text-white px-3 py-2 rounded-md text-xs shadow-md space-y-1 font-mono tabular-nums">
                        <div className="flex items-center justify-between gap-4 font-sans">
                          <span className="font-semibold">{pt.sta}</span>
                          <span className={pt.isOutlier ? 'text-amber-300 font-medium' : 'text-emerald-300 font-medium'}>
                            {pt.isOutlier ? 'Outlier Rejected' : 'Included'}
                          </span>
                        </div>
                        <div>
                          {scale}: {pt.magnitude.toFixed(1)} · ΔMean: {pt.deviation >= 0 ? `+${pt.deviation.toFixed(2)}` : pt.deviation.toFixed(2)}
                        </div>
                        <div className="text-slate-300">
                          |z| = {pt.zScore.toFixed(2)}σ (Limit {varianceK.toFixed(2)}σ) · Δ {pt.delta.toFixed(2)}°
                        </div>
                      </div>
                    );
                  }}
                />
                <ReferenceArea
                  y1={lowerBound}
                  y2={upperBound}
                  fill="#eff6ff"
                  fillOpacity={0.85}
                  stroke="#bfdbfe"
                  strokeOpacity={0.9}
                />
                <ReferenceLine
                  y={upperBound}
                  stroke="#d97706"
                  strokeDasharray="4 4"
                  label={{
                    value: `+Kσ (${upperBound.toFixed(2)})`,
                    position: 'insideTopRight',
                    fill: '#b45309',
                    fontSize: 10,
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                />
                <ReferenceLine
                  y={lowerBound}
                  stroke="#d97706"
                  strokeDasharray="4 4"
                  label={{
                    value: `-Kσ (${lowerBound.toFixed(2)})`,
                    position: 'insideBottomRight',
                    fill: '#b45309',
                    fontSize: 10,
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                />
                <ReferenceLine
                  y={meanAll}
                  stroke="#64748b"
                  strokeDasharray="3 3"
                  label={{
                    value: `Raw Mean ${meanAll.toFixed(2)}`,
                    position: 'insideTopLeft',
                    fill: '#475569',
                    fontSize: 10,
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                />
                <ReferenceLine
                  y={filteredMean}
                  stroke="#2563eb"
                  strokeWidth={1.5}
                />
                <Line
                  type="monotone"
                  dataKey="magnitude"
                  stroke="transparent"
                  isAnimationActive={false}
                  dot={(dotProps: { cx?: number; cy?: number; payload?: StationMagPoint; index?: number }) => {
                    const { cx, cy, payload, index } = dotProps;
                    if (cx === undefined || cy === undefined || !payload) {
                      return <g key={`empty-${index ?? 0}`} />;
                    }
                    const fill = payload.isOutlier ? '#d97706' : '#2563eb';
                    const ring = payload.isOutlier ? '#fef3c7' : '#dbeafe';
                    return (
                      <g key={`pt-${payload.sta}`}>
                        <circle cx={cx} cy={cy} r={8} fill={ring} fillOpacity={0.85} />
                        <circle cx={cx} cy={cy} r={5} fill={fill} stroke="#ffffff" strokeWidth={1.5} />
                      </g>
                    );
                  }}
                  activeDot={{ r: 7, strokeWidth: 2, stroke: '#0f172a' }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={histogramBins}
                margin={{ top: 14, right: 20, left: 4, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="binLabel"
                  tick={{ fontSize: 11, fill: '#334155', fontFamily: 'JetBrains Mono, monospace' }}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: '#475569', fontFamily: 'JetBrains Mono, monospace' }}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={false}
                  width={32}
                />
                <Tooltip
                  cursor={{ fill: '#f1f5f9' }}
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const bin = payload[0]?.payload as HistogramBin | undefined;
                    if (!bin) return null;
                    return (
                      <div className="bg-slate-900 text-white px-3 py-2 rounded-md text-xs shadow-md space-y-1 font-mono tabular-nums">
                        <div className="font-semibold">
                          {scale} Bin {bin.binLabel}
                        </div>
                        <div>
                          Stations ({bin.count}): {bin.stations.length > 0 ? bin.stations.join(', ') : 'None'}
                        </div>
                        {bin.hasOutlier && (
                          <div className="text-amber-300 font-sans">
                            Contains outlier pick outside ±{varianceK.toFixed(2)}σ
                          </div>
                        )}
                      </div>
                    );
                  }}
                />
                <Bar
                  dataKey="count"
                  isAnimationActive={false}
                  shape={(barProps: {
                    x?: number;
                    y?: number;
                    width?: number;
                    height?: number;
                    payload?: HistogramBin;
                  }) => {
                    const { x = 0, y = 0, width = 0, height = 0, payload } = barProps;
                    if (height <= 0) return <g />;
                    const fill = payload?.allOutliers
                      ? '#d97706'
                      : payload?.hasOutlier
                        ? '#f59e0b'
                        : '#2563eb';
                    return (
                      <rect
                        x={x}
                        y={y}
                        width={width}
                        height={height}
                        rx={3}
                        ry={3}
                        fill={fill}
                      />
                    );
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-600" />
              Included Station Pick
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-600" />
              Outlier (&gt; {varianceK.toFixed(2)}σ from Raw Mean)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-4 h-2.5 bg-blue-50 border border-blue-200" />
              Acceptance Band (Mean ± Kσ)
            </span>
          </div>
          <span className="font-mono tabular-nums text-slate-500">
            Filtered {scale}: {filteredMean.toFixed(1)} · Sorted by station {scale}
          </span>
        </div>
        </div>
      </div>

      {/* SUB-CARD B — HISTORICAL MAGNITUDE TREND ACROSS ITERATIVE RELOCATIONS (TEAL HUE + GLOW) */}
      <div className="rounded-lg border border-teal-300/90 bg-white overflow-hidden shadow-[0_4px_20px_-3px_rgba(20,184,166,0.26)] hover:shadow-[0_6px_24px_-2px_rgba(20,184,166,0.34)] ring-1 ring-teal-200/70 transition-shadow">
        <div className="px-4 py-3 bg-teal-50/95 border-b border-teal-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-teal-950">
              Historical Magnitude Trend Across Relocations
            </h4>
            <p className="text-xs text-teal-900/80 font-mono tabular-nums">
              {trendSummary
                ? `Latest ${scale}: ${trendSummary.latest.toFixed(1)} · Δ from Reloc #1: ${trendSummary.delta >= 0 ? `+${trendSummary.delta.toFixed(1)}` : trendSummary.delta.toFixed(1)} · ${history.length} ${history.length === 1 ? 'relocation' : 'relocations'}`
                : 'No relocation snapshots recorded yet — run Locate Hypocenter to append.'}
            </p>
          </div>

          <div className="flex items-center gap-1 p-0.5 bg-teal-100/80 border border-teal-200 rounded-md" role="group" aria-label="Trend Scale Mode">
            <button
              type="button"
              onClick={() => setShowAllScales(false)}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                !showAllScales
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Active Scale ({scale})
            </button>
            <button
              type="button"
              onClick={() => setShowAllScales(true)}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                showAllScales
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Scales (Ms / Mb / Md)
            </button>
          </div>
        </div>

        <div className="p-4">
          {history.length === 0 ? (
            <div className="h-44 flex items-center justify-center border border-dashed border-slate-200 rounded-md bg-white text-xs text-slate-500">
              No iterative relocation history yet. Click Locate Hypocenter in Locate &amp; Residuals to record Reloc #1.
            </div>
          ) : (
            <>
              <div className="w-full h-52 min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={history}
                    margin={{ top: 14, right: 24, left: 4, bottom: 6 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      dataKey="relocation"
                      tick={{ fontSize: 11, fill: '#334155', fontFamily: 'JetBrains Mono, monospace' }}
                      axisLine={{ stroke: '#cbd5e1' }}
                      tickLine={false}
                    />
                    <YAxis
                      domain={trendDomain}
                      tickCount={5}
                      tickFormatter={(v: number) => v.toFixed(1)}
                      tick={{ fontSize: 11, fill: '#475569', fontFamily: 'JetBrains Mono, monospace' }}
                      axisLine={{ stroke: '#cbd5e1' }}
                      tickLine={false}
                      width={42}
                    />
                    <Tooltip
                      cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3' }}
                      content={({ active, payload }) => {
                        if (!active || !payload || payload.length === 0) return null;
                        const entry = payload[0]?.payload as MagnitudeHistoryEntry | undefined;
                        if (!entry) return null;
                        return (
                          <div className="bg-slate-900 text-white px-3 py-2 rounded-md text-xs shadow-md space-y-1 font-mono tabular-nums">
                            <div className="flex items-center justify-between gap-4 font-sans">
                              <span className="font-semibold">{entry.relocation}</span>
                              <span className="text-slate-300 font-mono">{entry.timestamp}</span>
                            </div>
                            <div className="text-blue-300">
                              Ms {entry.ms.toFixed(1)} · Mb {entry.mb.toFixed(1)} · Md {entry.md.toFixed(1)}
                            </div>
                            <div className="text-slate-300">
                              {entry.solver} · RMS {entry.rmsSec.toFixed(2)}s · {entry.activePhases} phases
                            </div>
                          </div>
                        );
                      }}
                    />
                    {(showAllScales || scale === 'Ms') && (
                      <Line
                        type="monotone"
                        dataKey="ms"
                        name="Ms"
                        stroke="#2563eb"
                        strokeWidth={scale === 'Ms' ? 2.5 : 1.75}
                        strokeDasharray={scale === 'Ms' ? undefined : '4 3'}
                        isAnimationActive={false}
                        dot={{ r: scale === 'Ms' ? 4.5 : 3.5, fill: '#2563eb', stroke: '#ffffff', strokeWidth: 1.5 }}
                        activeDot={{ r: 6, stroke: '#0f172a', strokeWidth: 2 }}
                      />
                    )}
                    {(showAllScales || scale === 'Mb') && (
                      <Line
                        type="monotone"
                        dataKey="mb"
                        name="Mb"
                        stroke="#0d9488"
                        strokeWidth={scale === 'Mb' ? 2.5 : 1.75}
                        strokeDasharray={scale === 'Mb' ? undefined : '4 3'}
                        isAnimationActive={false}
                        dot={{ r: scale === 'Mb' ? 4.5 : 3.5, fill: '#0d9488', stroke: '#ffffff', strokeWidth: 1.5 }}
                        activeDot={{ r: 6, stroke: '#0f172a', strokeWidth: 2 }}
                      />
                    )}
                    {(showAllScales || scale === 'Md') && (
                      <Line
                        type="monotone"
                        dataKey="md"
                        name="Md"
                        stroke="#64748b"
                        strokeWidth={scale === 'Md' ? 2.5 : 1.75}
                        strokeDasharray={scale === 'Md' ? undefined : '4 3'}
                        isAnimationActive={false}
                        dot={{ r: scale === 'Md' ? 4.5 : 3.5, fill: '#64748b', stroke: '#ffffff', strokeWidth: 1.5 }}
                        activeDot={{ r: 6, stroke: '#0f172a', strokeWidth: 2 }}
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-200/70 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
                <div className="flex flex-wrap items-center gap-4">
                  {(showAllScales || scale === 'Ms') && (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block w-3.5 h-0.5 bg-blue-600" />
                      Ms {scale === 'Ms' ? '(Active)' : ''}
                    </span>
                  )}
                  {(showAllScales || scale === 'Mb') && (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block w-3.5 h-0.5 bg-teal-600" />
                      Mb {scale === 'Mb' ? '(Active)' : ''}
                    </span>
                  )}
                  {(showAllScales || scale === 'Md') && (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block w-3.5 h-0.5 bg-slate-500" />
                      Md {scale === 'Md' ? '(Active)' : ''}
                    </span>
                  )}
                </div>
                <span className="text-slate-500">
                  Run Locate Hypocenter after toggling station exclusions to log a new relocation point
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
};
