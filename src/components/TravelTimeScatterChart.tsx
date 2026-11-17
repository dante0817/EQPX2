import React, { useMemo, useState } from 'react';
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { StationPick } from '../data/eqpData';

interface TravelTimeScatterChartProps {
  picks: StationPick[];
  highlightResP: boolean;
  highlightResS: boolean;
  selectedStation: string | null;
  onSelectStation: (sta: string | null) => void;
}

interface TravelTimePoint {
  sta: string;
  phase: 'OBSp' | 'OBSs';
  delta: number;
  obsTime: number;
  calcTime: number;
  residual: number;
  isFlagged: boolean;
  isSelected: boolean;
}

interface CalcCurvePoint {
  delta: number;
  obsTime: number;
}

export const TravelTimeScatterChart: React.FC<TravelTimeScatterChartProps> = ({
  picks,
  highlightResP,
  highlightResS,
  selectedStation,
  onSelectStation,
}) => {
  const [showP, setShowP] = useState(true);
  const [showS, setShowS] = useState(true);
  const [showCalcCurve, setShowCalcCurve] = useState(true);

  const { pPoints, sPoints, calcPCurve, calcSCurve, flaggedCount } = useMemo(() => {
    const pArr: TravelTimePoint[] = [];
    const sArr: TravelTimePoint[] = [];
    const pCalc: CalcCurvePoint[] = [];
    const sCalc: CalcCurvePoint[] = [];
    let flagged = 0;

    picks.forEach((pick) => {
      if (pick.pTime.trim() !== '' && !pick.pExcluded && pick.obsP > 0) {
        const isFlagged = highlightResP && Math.abs(pick.resP) > 0.5;
        if (isFlagged) flagged += 1;
        pArr.push({
          sta: pick.sta,
          phase: 'OBSp',
          delta: pick.delta,
          obsTime: pick.obsP,
          calcTime: pick.calcP,
          residual: pick.resP,
          isFlagged,
          isSelected: selectedStation === pick.sta,
        });
        pCalc.push({ delta: pick.delta, obsTime: pick.calcP });
      }

      if (pick.sTime.trim() !== '' && !pick.sExcluded && pick.obsS > 0) {
        const isFlagged = highlightResS && Math.abs(pick.resS) > 0.5;
        if (isFlagged) flagged += 1;
        sArr.push({
          sta: pick.sta,
          phase: 'OBSs',
          delta: pick.delta,
          obsTime: pick.obsS,
          calcTime: pick.calcS,
          residual: pick.resS,
          isFlagged,
          isSelected: selectedStation === pick.sta,
        });
        sCalc.push({ delta: pick.delta, obsTime: pick.calcS });
      }
    });

    pCalc.sort((a, b) => a.delta - b.delta);
    sCalc.sort((a, b) => a.delta - b.delta);

    return {
      pPoints: pArr,
      sPoints: sArr,
      calcPCurve: pCalc,
      calcSCurve: sCalc,
      flaggedCount: flagged,
    };
  }, [picks, highlightResP, highlightResS, selectedStation]);

  const totalActivePoints = pPoints.length + sPoints.length;

  return (
    <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Phase Travel-Time vs. Epicentral Distance (OBSp / OBSs vs. Delta)
          </h2>
          <p className="text-xs text-slate-500 font-mono tabular-nums">
            {pPoints.length} active P · {sPoints.length} active S · {flaggedCount} outlier{flaggedCount === 1 ? '' : 's'} (&gt; 0.50s residual)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowP((v) => !v)}
            className={`px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap ${
              showP
                ? 'bg-blue-50 text-blue-800 border-blue-200'
                : 'bg-white text-slate-500 border-slate-200 hover:text-slate-700'
            }`}
          >
            OBSp ({pPoints.length})
          </button>
          <button
            type="button"
            onClick={() => setShowS((v) => !v)}
            className={`px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap ${
              showS
                ? 'bg-teal-50 text-teal-800 border-teal-200'
                : 'bg-white text-slate-500 border-slate-200 hover:text-slate-700'
            }`}
          >
            OBSs ({sPoints.length})
          </button>
          <button
            type="button"
            onClick={() => setShowCalcCurve((v) => !v)}
            className={`px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap ${
              showCalcCurve
                ? 'bg-slate-100 text-slate-900 border-slate-300'
                : 'bg-white text-slate-500 border-slate-200 hover:text-slate-700'
            }`}
          >
            Calc Trend
          </button>
        </div>
      </div>

      {totalActivePoints === 0 ? (
        <div className="p-8 text-center text-xs text-slate-500">
          No active phase arrival picks available to plot. Include at least one station pick above.
        </div>
      ) : (
        <div className="p-4">
          <div className="w-full h-72 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 16, right: 24, bottom: 20, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  type="number"
                  dataKey="delta"
                  name="Epicentral Distance"
                  domain={[0, 'dataMax + 0.3']}
                  tickFormatter={(v: number) => `${v.toFixed(1)}°`}
                  tick={{ fontSize: 11, fill: '#475569', fontFamily: 'JetBrains Mono, monospace' }}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={false}
                  label={{
                    value: 'Epicentral Distance Delta (deg)',
                    position: 'insideBottom',
                    offset: -10,
                    fill: '#475569',
                    fontSize: 11,
                  }}
                />
                <YAxis
                  type="number"
                  dataKey="obsTime"
                  name="Observed Arrival"
                  domain={[0, 'dataMax + 8']}
                  tickFormatter={(v: number) => `${v.toFixed(0)}s`}
                  tick={{ fontSize: 11, fill: '#475569', fontFamily: 'JetBrains Mono, monospace' }}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={false}
                  width={46}
                  label={{
                    value: 'Travel Time (s)',
                    angle: -90,
                    position: 'insideLeft',
                    fill: '#475569',
                    fontSize: 11,
                    style: { textAnchor: 'middle' },
                  }}
                />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3', stroke: '#94a3b8' }}
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const pt = payload[0]?.payload as TravelTimePoint | undefined;
                    if (!pt || !pt.sta) return null;
                    const resStr = pt.residual >= 0 ? `+${pt.residual.toFixed(2)}s` : `${pt.residual.toFixed(2)}s`;
                    return (
                      <div className="bg-slate-900 text-white px-3 py-2 rounded-md text-xs shadow-md space-y-1 font-mono tabular-nums">
                        <div className="flex items-center justify-between gap-4 font-sans">
                          <span className="font-semibold">
                            {pt.sta} · {pt.phase}
                          </span>
                          <span
                            className={
                              pt.isFlagged
                                ? Math.abs(pt.residual) >= 1.0
                                  ? 'text-rose-300 font-medium'
                                  : 'text-amber-300 font-medium'
                                : 'text-emerald-300 font-medium'
                            }
                          >
                            {pt.isFlagged ? 'Outlier' : 'Nominal'}
                          </span>
                        </div>
                        <div>
                          Delta: {pt.delta.toFixed(2)}° · Obs: {pt.obsTime.toFixed(2)}s
                        </div>
                        <div className="text-slate-300">
                          Calc: {pt.calcTime.toFixed(2)}s · Residual: {resStr}
                        </div>
                      </div>
                    );
                  }}
                />

                {showCalcCurve && showP && calcPCurve.length >= 2 && (
                  <Scatter
                    name="CALCp Trend"
                    data={calcPCurve}
                    fill="none"
                    line={{ stroke: '#93c5fd', strokeWidth: 1.5, strokeDasharray: '4 4' }}
                    isAnimationActive={false}
                    shape={() => <g />}
                  />
                )}

                {showCalcCurve && showS && calcSCurve.length >= 2 && (
                  <Scatter
                    name="CALCs Trend"
                    data={calcSCurve}
                    fill="none"
                    line={{ stroke: '#5eead4', strokeWidth: 1.5, strokeDasharray: '4 4' }}
                    isAnimationActive={false}
                    shape={() => <g />}
                  />
                )}

                {showP && (
                  <Scatter
                    name="OBSp"
                    data={pPoints}
                    isAnimationActive={false}
                    shape={(props: unknown) => {
                      const { cx, cy, payload } = props as {
                        cx?: number;
                        cy?: number;
                        payload?: TravelTimePoint;
                      };
                      if (cx === undefined || cy === undefined || !payload) return <g />;
                      const color = payload.isFlagged
                        ? Math.abs(payload.residual) >= 1.0
                          ? '#dc2626'
                          : '#d97706'
                        : '#2563eb';
                      return (
                        <g
                          className="cursor-pointer"
                          onClick={() =>
                            onSelectStation(payload.isSelected ? null : payload.sta)
                          }
                        >
                          {payload.isFlagged && (
                            <circle
                              cx={cx}
                              cy={cy}
                              r={10}
                              fill={color}
                              fillOpacity={0.16}
                              stroke={color}
                              strokeWidth={1}
                              strokeDasharray="2 2"
                            />
                          )}
                          <circle
                            cx={cx}
                            cy={cy}
                            r={payload.isSelected ? 6.5 : 5}
                            fill={color}
                            stroke={payload.isSelected ? '#0f172a' : '#ffffff'}
                            strokeWidth={payload.isSelected ? 2 : 1.5}
                          />
                          <text
                            x={cx + 8}
                            y={cy + 3}
                            fontSize={10}
                            fontWeight={payload.isFlagged || payload.isSelected ? 700 : 500}
                            fill={payload.isFlagged ? color : '#334155'}
                            className="font-mono select-none"
                          >
                            {payload.sta}
                          </text>
                        </g>
                      );
                    }}
                  />
                )}

                {showS && (
                  <Scatter
                    name="OBSs"
                    data={sPoints}
                    isAnimationActive={false}
                    shape={(props: unknown) => {
                      const { cx, cy, payload } = props as {
                        cx?: number;
                        cy?: number;
                        payload?: TravelTimePoint;
                      };
                      if (cx === undefined || cy === undefined || !payload) return <g />;
                      const color = payload.isFlagged
                        ? Math.abs(payload.residual) >= 1.0
                          ? '#dc2626'
                          : '#d97706'
                        : '#0d9488';
                      const r = payload.isSelected ? 6 : 5;
                      return (
                        <g
                          className="cursor-pointer"
                          onClick={() =>
                            onSelectStation(payload.isSelected ? null : payload.sta)
                          }
                        >
                          {payload.isFlagged && (
                            <circle
                              cx={cx}
                              cy={cy}
                              r={10}
                              fill={color}
                              fillOpacity={0.16}
                              stroke={color}
                              strokeWidth={1}
                              strokeDasharray="2 2"
                            />
                          )}
                          <polygon
                            points={`${cx},${cy - r} ${cx + r},${cy + r} ${cx - r},${cy + r}`}
                            fill={color}
                            stroke={payload.isSelected ? '#0f172a' : '#ffffff'}
                            strokeWidth={payload.isSelected ? 2 : 1.2}
                          />
                          <text
                            x={cx + 8}
                            y={cy + 3}
                            fontSize={10}
                            fontWeight={payload.isFlagged || payload.isSelected ? 700 : 500}
                            fill={payload.isFlagged ? color : '#334155'}
                            className="font-mono select-none"
                          >
                            {payload.sta} (S)
                          </text>
                        </g>
                      );
                    }}
                  />
                )}
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
            <div className="flex flex-wrap items-center gap-4">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-600" />
                OBSp (Nominal)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 bg-teal-600" />
                OBSs (Nominal)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-600" />
                Warning (|res| &gt; 0.50s)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-rose-600" />
                Critical (|res| ≥ 1.00s)
              </span>
            </div>
            <span className="text-slate-500">
              Click any point to highlight station across tables
            </span>
          </div>
        </div>
      )}
    </section>
  );
};
