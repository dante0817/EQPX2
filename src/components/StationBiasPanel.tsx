import React, { useMemo, useState } from 'react';
import { AlertTriangle, Clock } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { EQPEvent, PHILSTA_DATABASE, StationMeta } from '../data/eqpData';

interface StationBiasPanelProps {
  events: EQPEvent[];
  stations?: StationMeta[];
  searchQuery?: string;
  selectedCode?: string | null;
  onSelectStation?: (code: string | null) => void;
  onApplyStationDelay?: (code: string, delaySec: number) => void;
}

interface StationBiasRow {
  sta: string;
  name: string;
  province: string;
  pCount: number;
  sCount: number;
  avgResP: number | null;
  avgResS: number | null;
  maxAbsBias: number;
  configuredDelaySec: number | null;
  suggestedDelaySec: number | null;
  status: 'Timing Alert' | 'Moderate Bias' | 'Nominal';
  diagnosis: string;
}

type SortMode = 'bias' | 'code' | 'samples';

export const StationBiasPanel: React.FC<StationBiasPanelProps> = ({
  events,
  stations = PHILSTA_DATABASE,
  searchQuery = '',
  selectedCode = null,
  onSelectStation,
  onApplyStationDelay,
}) => {
  const [includeExcluded, setIncludeExcluded] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('bias');

  const stationMetaMap = useMemo(() => {
    const map: Record<string, StationMeta> = {};
    for (const st of stations) {
      map[st.code] = st;
    }
    return map;
  }, [stations]);

  const biasRows = useMemo<StationBiasRow[]>(() => {
    const acc: Record<
      string,
      {
        pValues: number[];
        sValues: number[];
      }
    > = {};

    events.forEach((ev) => {
      ev.picks.forEach((pick) => {
        if (!acc[pick.sta]) {
          acc[pick.sta] = { pValues: [], sValues: [] };
        }
        if (pick.pTime.trim() !== '' && (includeExcluded || !pick.pExcluded)) {
          acc[pick.sta].pValues.push(pick.resP);
        }
        if (pick.sTime.trim() !== '' && (includeExcluded || !pick.sExcluded)) {
          acc[pick.sta].sValues.push(pick.resS);
        }
      });
    });

    const query = searchQuery.trim().toLowerCase();

    const rows: StationBiasRow[] = Object.entries(acc)
      .map(([sta, bucket]) => {
        const meta = stationMetaMap[sta];
        const pCount = bucket.pValues.length;
        const sCount = bucket.sValues.length;

        const avgResP =
          pCount > 0
            ? Number(
                (bucket.pValues.reduce((s, v) => s + v, 0) / pCount).toFixed(3)
              )
            : null;
        const avgResS =
          sCount > 0
            ? Number(
                (bucket.sValues.reduce((s, v) => s + v, 0) / sCount).toFixed(3)
              )
            : null;

        const maxAbsBias = Math.max(
          avgResP !== null ? Math.abs(avgResP) : 0,
          avgResS !== null ? Math.abs(avgResS) : 0
        );

        let status: StationBiasRow['status'] = 'Nominal';
        if (maxAbsBias >= 0.5) {
          status = 'Timing Alert';
        } else if (maxAbsBias >= 0.25) {
          status = 'Moderate Bias';
        }

        let diagnosis = 'Within ±0.25s tolerance';
        const dominant =
          avgResP !== null &&
          (avgResS === null || Math.abs(avgResP) >= Math.abs(avgResS))
            ? avgResP
            : avgResS;
        if (dominant !== null && Math.abs(dominant) >= 0.25) {
          diagnosis =
            dominant > 0
              ? 'Systematic late arrival (+)'
              : 'Systematic early arrival (-)';
        }

        const configuredDelaySec = meta ? meta.delaySec : null;
        const suggestedDelaySec =
          configuredDelaySec !== null && avgResP !== null
            ? Number((configuredDelaySec + avgResP).toFixed(2))
            : null;

        return {
          sta,
          name: meta?.name ?? `${sta} Seismic Station`,
          province: meta?.province ?? 'Catalog Network',
          pCount,
          sCount,
          avgResP,
          avgResS,
          maxAbsBias,
          configuredDelaySec,
          suggestedDelaySec,
          status,
          diagnosis,
        };
      })
      .filter((row) => {
        if (row.pCount === 0 && row.sCount === 0) return false;
        if (!query) return true;
        return (
          row.sta.toLowerCase().includes(query) ||
          row.name.toLowerCase().includes(query) ||
          row.province.toLowerCase().includes(query)
        );
      });

    rows.sort((a, b) => {
      if (sortMode === 'code') return a.sta.localeCompare(b.sta);
      if (sortMode === 'samples') {
        return b.pCount + b.sCount - (a.pCount + a.sCount);
      }
      return b.maxAbsBias - a.maxAbsBias;
    });

    return rows;
  }, [events, includeExcluded, searchQuery, sortMode, stationMetaMap]);

  const summary = useMemo(() => {
    const flagged = biasRows.filter((r) => r.status !== 'Nominal');
    const alerts = biasRows.filter((r) => r.status === 'Timing Alert');
    const peakRow = biasRows.reduce<StationBiasRow | null>(
      (best, cur) => (!best || cur.maxAbsBias > best.maxAbsBias ? cur : best),
      null
    );
    const totalSamples = biasRows.reduce((s, r) => s + r.pCount + r.sCount, 0);

    return {
      stationCount: biasRows.length,
      flaggedCount: flagged.length,
      alertCount: alerts.length,
      peakRow,
      totalSamples,
    };
  }, [biasRows]);

  const chartData = useMemo(
    () =>
      biasRows.map((r) => ({
        ...r,
        plotResP: r.avgResP ?? 0,
        plotResS: r.avgResS ?? 0,
      })),
    [biasRows]
  );

  const formatSigned = (val: number | null, digits = 2) => {
    if (val === null) return '—';
    return `${val >= 0 ? '+' : ''}${val.toFixed(digits)}s`;
  };

  return (
    <section className="bg-[#fbf5ea] border border-amber-700/60 rounded-lg overflow-hidden shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
      <div className="px-4 py-3 bg-[#f5e9d3] border-b border-amber-800/55 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Clock className="w-4 h-4 text-amber-800 shrink-0" />
          <div>
            <h2 className="text-base font-bold text-blue-700 [text-shadow:0_0_8px_rgba(249,115,22,0.7),0_0_18px_rgba(251,146,60,0.45)]">
              Station Bias Analysis (Catalog Mean P &amp; S Residuals)
            </h2>
            <p className="text-xs text-slate-600">
              Aggregates phase residuals across {events.length} catalog events to detect systematic clock or delay errors
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="inline-flex items-center gap-1.5 px-2 py-1 text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={includeExcluded}
              onChange={(e) => setIncludeExcluded(e.target.checked)}
              className="accent-indigo-600"
            />
            Include Excluded (*) Picks
          </label>

          <div className="inline-flex items-center p-0.5 bg-[#ead5ad] border border-amber-800/45 rounded-md">
            {(
              [
                { id: 'bias', label: 'Sort: |Bias|' },
                { id: 'code', label: 'Sort: Code' },
                { id: 'samples', label: 'Sort: N' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSortMode(opt.id)}
                className={`px-2 py-1 rounded font-medium transition-colors ${
                  sortMode === opt.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-700 hover:text-slate-950'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-4 py-3 bg-[#f6ebd7] border-b border-amber-800/50 text-xs">
        <div className="bg-[#f3e6cc] border border-amber-800/65 rounded-md px-3 py-2 shadow-2xs">
          <div className="text-[11px] font-medium text-slate-700">Catalog Stations Analyzed</div>
          <div className="text-base font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
            {summary.stationCount}{' '}
            <span className="text-xs font-normal text-slate-600">
              ({summary.totalSamples} phases)
            </span>
          </div>
        </div>
        <div className="bg-[#f3e6cc] border border-amber-800/65 rounded-md px-3 py-2 shadow-2xs">
          <div className="text-[11px] font-medium text-slate-700">Peak Station Mean Bias</div>
          <div className="text-base font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
            {summary.peakRow
              ? `${summary.peakRow.sta} (${summary.peakRow.maxAbsBias.toFixed(2)}s)`
              : '—'}
          </div>
        </div>
        <div className="bg-[#f3e6cc] border border-amber-800/65 rounded-md px-3 py-2 shadow-2xs">
          <div className="text-[11px] font-medium text-slate-700">Moderate Bias (&ge;0.25s)</div>
          <div className="text-base font-semibold font-mono tabular-nums text-amber-800 mt-0.5">
            {summary.flaggedCount} stations
          </div>
        </div>
        <div className="bg-[#f3e6cc] border border-amber-800/65 rounded-md px-3 py-2 shadow-2xs">
          <div className="text-[11px] font-medium text-slate-700">Timing Alerts (&ge;0.50s)</div>
          <div
            className={`text-base font-semibold font-mono tabular-nums mt-0.5 flex items-center gap-1.5 ${
              summary.alertCount > 0 ? 'text-rose-700' : 'text-emerald-700'
            }`}
          >
            {summary.alertCount > 0 && <AlertTriangle className="w-4 h-4" />}
            {summary.alertCount} stations
          </div>
        </div>
      </div>

      {biasRows.length === 0 ? (
        <div className="p-6 text-center text-xs text-slate-500">
          No station residual samples match the current filter criteria.
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 divide-y xl:divide-y-0 xl:divide-x divide-amber-800/45">
          {/* Diverging Mean Residual Bar Chart */}
          <div className="xl:col-span-5 p-4 bg-[#fdf9f2]/70">
            <div className="text-xs font-semibold text-slate-800 mb-2">
              Mean P &amp; S Residual Offset (s)
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 10, right: 12, left: -4, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="sta"
                    tick={{ fontSize: 10, fill: '#334155', fontFamily: 'monospace' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#475569', fontFamily: 'monospace' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}s`}
                  />
                  <ReferenceLine y={0} stroke="#64748b" strokeWidth={1.2} />
                  <ReferenceLine y={0.35} stroke="#f59e0b" strokeDasharray="4 4" />
                  <ReferenceLine y={-0.35} stroke="#f59e0b" strokeDasharray="4 4" />
                  <Tooltip
                    cursor={{ fill: 'rgba(241, 245, 249, 0.7)' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const row = payload[0].payload as StationBiasRow;
                      return (
                        <div className="bg-white border border-slate-300 rounded-md shadow-md p-2.5 text-xs space-y-1 min-w-[195px]">
                          <div className="font-semibold text-slate-900 border-b border-slate-100 pb-1">
                            <span className="font-mono">{row.sta}</span> · {row.name}
                          </div>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono tabular-nums">
                            <span className="font-sans text-slate-500">Avg RESp ({row.pCount}):</span>
                            <span className="text-right font-semibold text-blue-700">
                              {formatSigned(row.avgResP)}
                            </span>
                            <span className="font-sans text-slate-500">Avg RESs ({row.sCount}):</span>
                            <span className="text-right font-semibold text-teal-700">
                              {formatSigned(row.avgResS)}
                            </span>
                            <span className="font-sans text-slate-500">PHILSTA Delay:</span>
                            <span className="text-right text-slate-800">
                              {formatSigned(row.configuredDelaySec)}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-600 pt-0.5">
                            {row.diagnosis}
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar
                    dataKey="plotResP"
                    name="Avg RESp (s)"
                    fill="#2563eb"
                    radius={[2, 2, 0, 0]}
                    maxBarSize={18}
                    className="cursor-pointer"
                    onClick={(entry) => {
                      const sta = (entry as unknown as StationBiasRow)?.sta;
                      if (sta && onSelectStation) {
                        onSelectStation(selectedCode === sta ? null : sta);
                      }
                    }}
                  />
                  <Bar
                    dataKey="plotResS"
                    name="Avg RESs (s)"
                    fill="#0d9488"
                    radius={[2, 2, 0, 0]}
                    maxBarSize={18}
                    className="cursor-pointer"
                    onClick={(entry) => {
                      const sta = (entry as unknown as StationBiasRow)?.sta;
                      if (sta && onSelectStation) {
                        onSelectStation(selectedCode === sta ? null : sta);
                      }
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Station Bias Breakdown Table */}
          <div className="xl:col-span-7 overflow-x-auto">
            <table className="w-full text-right border-collapse text-xs">
              <thead>
                <tr className="border-b border-amber-800/55 bg-[#f0dec0] text-slate-800">
                  <th className="py-2 px-3 text-left font-semibold">STA</th>
                  <th className="py-2 px-2.5 text-center font-semibold">N (P/S)</th>
                  <th className="py-2 px-2.5 font-semibold">Avg RESp</th>
                  <th className="py-2 px-2.5 font-semibold">Avg RESs</th>
                  <th className="py-2 px-2.5 font-semibold">Delay</th>
                  <th className="py-2 px-2.5 font-semibold">Suggested</th>
                  <th className="py-2 px-3 text-left font-semibold">Timing Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-800/20 font-mono tabular-nums">
                {biasRows.map((row, rowIdx) => {
                  const isSelected = selectedCode === row.sta;
                  return (
                    <tr
                      key={row.sta}
                      onClick={() =>
                        onSelectStation?.(isSelected ? null : row.sta)
                      }
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-sky-200/80'
                          : rowIdx % 2 === 0
                            ? 'bg-[#fffdf8] hover:bg-[#f2e2c2]'
                            : 'bg-[#f7edd9] hover:bg-[#f2e2c2]'
                      }`}
                    >
                      <td className="py-2 px-3 text-left">
                        <div className="font-semibold text-slate-900">{row.sta}</div>
                        <div className="font-sans text-[11px] text-slate-500 truncate max-w-[140px]">
                          {row.name}
                        </div>
                      </td>
                      <td className="py-2 px-2.5 text-center text-slate-600">
                        {row.pCount} / {row.sCount}
                      </td>
                      <td
                        className={`py-2 px-2.5 font-semibold ${
                          row.avgResP !== null && Math.abs(row.avgResP) >= 0.5
                            ? 'text-rose-700 bg-rose-50/60'
                            : row.avgResP !== null && Math.abs(row.avgResP) >= 0.25
                              ? 'text-amber-700 bg-amber-50/60'
                              : 'text-slate-800'
                        }`}
                      >
                        {formatSigned(row.avgResP)}
                      </td>
                      <td
                        className={`py-2 px-2.5 font-semibold ${
                          row.avgResS !== null && Math.abs(row.avgResS) >= 0.5
                            ? 'text-rose-700 bg-rose-50/60'
                            : row.avgResS !== null && Math.abs(row.avgResS) >= 0.25
                              ? 'text-amber-700 bg-amber-50/60'
                              : 'text-slate-800'
                        }`}
                      >
                        {formatSigned(row.avgResS)}
                      </td>
                      <td className="py-2 px-2.5 text-slate-600">
                        {formatSigned(row.configuredDelaySec)}
                      </td>
                      <td className="py-2 px-2.5 font-medium text-indigo-700">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <span>{formatSigned(row.suggestedDelaySec)}</span>
                          {onApplyStationDelay &&
                            row.suggestedDelaySec !== null &&
                            row.configuredDelaySec !== null &&
                            Math.abs(row.suggestedDelaySec - row.configuredDelaySec) >= 0.05 && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onApplyStationDelay(row.sta, row.suggestedDelaySec as number);
                                }}
                                className="px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 font-sans text-[10px] font-semibold transition-colors"
                                title={`Save ${formatSigned(row.suggestedDelaySec)} delay to ${row.sta}`}
                              >
                                Apply
                              </button>
                            )}
                        </div>
                      </td>
                      <td className="py-2 px-3 text-left font-sans">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-medium ${
                            row.status === 'Timing Alert'
                              ? 'bg-rose-50 text-rose-800 border border-rose-200'
                              : row.status === 'Moderate Bias'
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          }`}
                        >
                          {row.status}
                        </span>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {row.diagnosis}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};
