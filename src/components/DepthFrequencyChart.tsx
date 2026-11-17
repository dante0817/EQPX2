import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CRUSTAL_MODEL_1D, EQPEvent, isEventUnlocated } from '../data/eqpData';

interface DepthFrequencyChartProps {
  event: EQPEvent;
  selectedStation: string | null;
  onSelectStation: (sta: string | null) => void;
}

interface DepthEstimate {
  id: string;
  label: string;
  sta: string | null;
  depthKm: number;
  residualSec: number;
  isFlagged: boolean;
  source: 'station' | 'jackknife';
}

interface DepthBin {
  binLabel: string;
  startKm: number;
  endKm: number;
  midpointKm: number;
  count: number;
  pct: number;
  layerLabel: string;
  containsSolved: boolean;
  containsTrial: boolean;
  hasFlagged: boolean;
  isModalPeak: boolean;
  items: DepthEstimate[];
}

function getCrustalLayerInfo(depthKm: number): { layerLabel: string; vpKmS: number } {
  let matched = CRUSTAL_MODEL_1D[0];
  for (const layer of CRUSTAL_MODEL_1D) {
    if (depthKm >= layer.topDepthKm) {
      matched = layer;
    }
  }
  return {
    layerLabel: `L${matched.layer} (Vp ${matched.vpKmS.toFixed(2)} km/s)`,
    vpKmS: matched.vpKmS,
  };
}

export const DepthFrequencyChart: React.FC<DepthFrequencyChartProps> = ({
  event,
  selectedStation,
  onSelectStation,
}) => {
  const [binWidthKm, setBinWidthKm] = useState<2 | 5>(2);
  const [includeJackknife, setIncludeJackknife] = useState(true);

  const estimates = useMemo<DepthEstimate[]>(() => {
    const activePicks = event.picks.filter((p) => p.pTime.trim() !== '' && !p.pExcluded);
    if (activePicks.length === 0) return [];

    const { vpKmS } = getCrustalLayerInfo(event.depthKm);
    const items: DepthEstimate[] = [];

    // 1. Station-level ray-constrained depth estimates from TOA, delta, and P/S residuals
    activePicks.forEach((pick) => {
      const toaRad = (pick.toa * Math.PI) / 180;
      const verticalSens = Math.max(0.35, Math.abs(Math.cos(toaRad)));
      const effectiveRes =
        pick.sTime && !pick.sExcluded && pick.resS !== 0
          ? (pick.resP * 0.7 + pick.resS * 0.3)
          : pick.resP;
      const deltaBias = (pick.delta - 2.0) * 0.25;
      // Negative residual (faster arrival than model) shifts focal depth deeper/shallower along ray
      const perturbed = event.depthKm - effectiveRes * vpKmS * 0.58 * verticalSens + deltaBias;
      const clampedDepth = Number(Math.max(1.0, Math.min(80.0, perturbed)).toFixed(1));
      const maxRes = Math.max(
        Math.abs(pick.resP),
        pick.sTime && !pick.sExcluded ? Math.abs(pick.resS) : 0
      );

      items.push({
        id: `sta-${pick.id}`,
        label: `${pick.sta} ray inversion`,
        sta: pick.sta,
        depthKm: clampedDepth,
        residualSec: effectiveRes,
        isFlagged: maxRes > 0.5,
        source: 'station',
      });
    });

    // 2. Leave-one-station-out jackknife hypocentral depth cluster estimates
    if (includeJackknife && items.length >= 3) {
      const totalSum = items.reduce((acc, item) => acc + item.depthKm, 0);
      items.forEach((omitted) => {
        const subsetMean = (totalSum - omitted.depthKm) / (items.length - 1);
        const jackknifeDepth = Number(
          Math.max(1.0, Math.min(80.0, subsetMean * 0.65 + event.depthKm * 0.35)).toFixed(1)
        );
        items.push({
          id: `jk-${omitted.id}`,
          label: `Jackknife (−${omitted.sta ?? '?'})`,
          sta: omitted.sta,
          depthKm: jackknifeDepth,
          residualSec: omitted.residualSec,
          isFlagged: false,
          source: 'jackknife',
        });
      });
    }

    return items;
  }, [event.depthKm, event.picks, includeJackknife]);

  const { bins, stats, solvedBinLabel, trialBinLabel } = useMemo(() => {
    if (estimates.length === 0) {
      return {
        bins: [] as DepthBin[],
        stats: { median: event.depthKm, q1: event.depthKm, q3: event.depthKm, stdKm: 0 },
        solvedBinLabel: '',
        trialBinLabel: '',
      };
    }

    const sorted = [...estimates.map((e) => e.depthKm)].sort((a, b) => a - b);
    const n = sorted.length;
    const median =
      n % 2 === 1 ? sorted[Math.floor(n / 2)] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
    const q1 = sorted[Math.floor(n * 0.25)];
    const q3 = sorted[Math.floor(n * 0.75)];
    const mean = sorted.reduce((s, v) => s + v, 0) / n;
    const stdKm = Math.sqrt(sorted.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / n);

    const rawMin = Math.min(...sorted, event.depthKm);
    const rawMax = Math.max(...sorted, event.depthKm);
    const minEdge = Math.max(0, Math.floor(rawMin / binWidthKm) * binWidthKm - binWidthKm);
    const maxEdge = Math.ceil((rawMax + 0.01) / binWidthKm) * binWidthKm + binWidthKm;

    const tempBins: Array<Omit<DepthBin, 'isModalPeak'>> = [];
    for (let start = minEdge; start < maxEdge; start += binWidthKm) {
      const end = start + binWidthKm;
      const matched = estimates.filter((e) => e.depthKm >= start && e.depthKm < end);
      const midpointKm = Number(((start + end) / 2).toFixed(1));
      const { layerLabel } = getCrustalLayerInfo(midpointKm);
      const containsSolved = event.depthKm >= start && event.depthKm < end;
      const containsTrial = event.trialDepthKm >= start && event.trialDepthKm < end;

      tempBins.push({
        binLabel: `${start}–${end} km`,
        startKm: start,
        endKm: end,
        midpointKm,
        count: matched.length,
        pct: Math.round((matched.length / estimates.length) * 100),
        layerLabel,
        containsSolved,
        containsTrial,
        hasFlagged: matched.some((m) => m.isFlagged),
        items: matched,
      });
    }

    const maxCount = Math.max(...tempBins.map((b) => b.count), 0);
    const builtBins: DepthBin[] = tempBins.map((b) => ({
      ...b,
      isModalPeak: maxCount > 0 && b.count === maxCount,
    }));

    const solvedBin = builtBins.find((b) => b.containsSolved)?.binLabel ?? '';
    const trialBin = builtBins.find((b) => b.containsTrial)?.binLabel ?? '';

    return {
      bins: builtBins,
      stats: {
        median: Number(median.toFixed(1)),
        q1: Number(q1.toFixed(1)),
        q3: Number(q3.toFixed(1)),
        stdKm: Number(stdKm.toFixed(2)),
      },
      solvedBinLabel: solvedBin,
      trialBinLabel: trialBin,
    };
  }, [estimates, binWidthKm, event.depthKm, event.trialDepthKm]);

  const selectedStationBin = useMemo(() => {
    if (!selectedStation) return null;
    const found = bins.find((b) => b.items.some((item) => item.sta === selectedStation));
    return found?.binLabel ?? null;
  }, [bins, selectedStation]);

  return (
    <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Hypocentral Depth-Frequency Distribution
          </h2>
          <p className="text-xs text-slate-500 font-mono tabular-nums">
            {isEventUnlocated(event) && estimates.length === 0
              ? 'Pending location · Enter station picks and run Locate'
              : `Solved: ${event.depthKm.toFixed(1)} km · Cluster Median: ${stats.median.toFixed(1)} km · IQR: ${stats.q1.toFixed(1)}–${stats.q3.toFixed(1)} km · σ = ${stats.stdKm.toFixed(2)} km (${estimates.length} samples)`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIncludeJackknife((v) => !v)}
            className={`px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap ${
              includeJackknife
                ? 'bg-blue-50 text-blue-800 border-blue-200'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {includeJackknife ? 'Station + Jackknife' : 'Station Rays Only'}
          </button>

          <div
            className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-md"
            role="group"
            aria-label="Depth Bin Width"
          >
            {([2, 5] as const).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setBinWidthKm(w)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                  binWidthKm === w
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {w} km bins
              </button>
            ))}
          </div>
        </div>
      </div>

      {estimates.length === 0 ? (
        <div className="p-8 text-center text-xs text-slate-500">
          No active P-phase station picks available to estimate hypocentral depth clustering.
        </div>
      ) : (
        <div className="p-4">
          <div className="w-full h-64 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={bins}
                margin={{ top: 18, right: 24, bottom: 18, left: 4 }}
                onClick={(state) => {
                  const label = state?.activeLabel;
                  if (typeof label !== 'string') return;
                  const clickedBin = bins.find((b) => b.binLabel === label);
                  const firstSta = clickedBin?.items.find((i) => i.source === 'station')?.sta;
                  if (firstSta) {
                    onSelectStation(selectedStation === firstSta ? null : firstSta);
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="binLabel"
                  tick={{ fontSize: 11, fill: '#334155', fontFamily: 'JetBrains Mono, monospace' }}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={false}
                  label={{
                    value: 'Hypocentral Depth Interval (km)',
                    position: 'insideBottom',
                    offset: -10,
                    fill: '#475569',
                    fontSize: 11,
                  }}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: '#475569', fontFamily: 'JetBrains Mono, monospace' }}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={false}
                  width={36}
                  label={{
                    value: 'Frequency',
                    angle: -90,
                    position: 'insideLeft',
                    fill: '#475569',
                    fontSize: 11,
                    style: { textAnchor: 'middle' },
                  }}
                />
                <Tooltip
                  cursor={{ fill: '#f1f5f9' }}
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const bin = payload[0]?.payload as DepthBin | undefined;
                    if (!bin) return null;
                    const stationCodes = Array.from(
                      new Set(
                        bin.items
                          .filter((i) => i.source === 'station' && i.sta)
                          .map((i) => i.sta as string)
                      )
                    );
                    const jkCount = bin.items.filter((i) => i.source === 'jackknife').length;
                    return (
                      <div className="bg-slate-900 text-white px-3 py-2 rounded-md text-xs shadow-md space-y-1 font-mono tabular-nums max-w-xs">
                        <div className="flex items-center justify-between gap-4 font-sans">
                          <span className="font-semibold">Depth {bin.binLabel}</span>
                          <span className="text-blue-300 font-mono">
                            {bin.count} ({bin.pct}%)
                          </span>
                        </div>
                        <div className="text-slate-300">{bin.layerLabel}</div>
                        {stationCodes.length > 0 && (
                          <div>Stations: {stationCodes.join(', ')}</div>
                        )}
                        {jkCount > 0 && (
                          <div className="text-slate-300">
                            Jackknife subsets: {jkCount}
                          </div>
                        )}
                        {bin.containsSolved && (
                          <div className="text-emerald-300 font-sans">
                            Contains solved hypocenter ({event.depthKm.toFixed(1)} km)
                          </div>
                        )}
                        {bin.hasFlagged && (
                          <div className="text-amber-300 font-sans">
                            Includes high-residual (&gt; 0.50s) ray estimate
                          </div>
                        )}
                      </div>
                    );
                  }}
                />
                {solvedBinLabel && (
                  <ReferenceLine
                    x={solvedBinLabel}
                    stroke="#0f172a"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    label={{
                      value: `Solved ${event.depthKm.toFixed(1)} km`,
                      position: 'top',
                      fill: '#0f172a',
                      fontSize: 10,
                      fontFamily: 'JetBrains Mono, monospace',
                    }}
                  />
                )}
                {trialBinLabel && trialBinLabel !== solvedBinLabel && (
                  <ReferenceLine
                    x={trialBinLabel}
                    stroke="#64748b"
                    strokeDasharray="3 3"
                    label={{
                      value: `Trial ${event.trialDepthKm.toFixed(0)} km`,
                      position: 'top',
                      fill: '#64748b',
                      fontSize: 10,
                      fontFamily: 'JetBrains Mono, monospace',
                    }}
                  />
                )}
                <Bar
                  dataKey="count"
                  isAnimationActive={false}
                  shape={(barProps: {
                    x?: number;
                    y?: number;
                    width?: number;
                    height?: number;
                    payload?: DepthBin;
                  }) => {
                    const { x = 0, y = 0, width = 0, height = 0, payload } = barProps;
                    if (height <= 0 || !payload) return <g />;
                    const isSelectedBin = selectedStationBin === payload.binLabel;
                    const fill = payload.containsSolved
                      ? '#1d4ed8'
                      : payload.isModalPeak
                        ? '#2563eb'
                        : payload.hasFlagged
                          ? '#d97706'
                          : '#60a5fa';
                    return (
                      <rect
                        x={x}
                        y={y}
                        width={width}
                        height={height}
                        rx={3}
                        ry={3}
                        fill={fill}
                        stroke={isSelectedBin ? '#0f172a' : 'none'}
                        strokeWidth={isSelectedBin ? 2 : 0}
                        className="cursor-pointer"
                      />
                    );
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
            <div className="flex flex-wrap items-center gap-4">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-xs bg-blue-700" />
                Solved Depth Bin ({event.depthKm.toFixed(1)} km)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-xs bg-blue-400" />
                Cluster Spread
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-xs bg-amber-600" />
                High-Residual Tail
              </span>
            </div>
            <span className="font-mono tabular-nums text-slate-500">
              Trial: {event.trialDepthKm.toFixed(1)} km · {getCrustalLayerInfo(event.depthKm).layerLabel}
            </span>
          </div>
        </div>
      )}
    </section>
  );
};
