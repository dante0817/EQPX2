import React, { useMemo, useState } from 'react';
import { Activity, AlertTriangle, RefreshCw, WifiOff } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PHILSTA_DATABASE, StationMeta } from '../data/eqpData';

interface StationHealthWidgetProps {
  stations?: StationMeta[];
  selectedCode?: string | null;
  onSelectStation?: (code: string | null) => void;
}

type HealthMetricMode = 'downtime' | 'noise';
type ChartGranularity = 'stations' | 'hourly';

interface HourlyTelemetry {
  hourLabel: string;
  downtimeMin: number;
  gapEvents: number;
  noiseDb: number;
  completenessPct: number;
}

interface StationHealthSummary {
  code: string;
  name: string;
  province: string;
  sensor: string;
  elevationM: number;
  downtimeMin: number;
  gapEvents: number;
  uptimePct: number;
  avgNoiseDb: number;
  peakNoiseDb: number;
  status: 'Healthy' | 'Elevated Noise' | 'Data Gap';
  hourly: HourlyTelemetry[];
}

function hashCode(str: string, seed: number): number {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function buildStationHealth(station: StationMeta, refreshSeed: number): StationHealthSummary {
  const isBroadband = station.sensor.toLowerCase().includes('broadband');
  const baseNoiseDb = isBroadband
    ? -139 + Math.max(0, 120 - Math.min(120, station.elevationM)) * 0.08
    : -124 + Math.max(0, 100 - Math.min(100, station.elevationM)) * 0.09;

  const nowHour = new Date().getHours();
  const hourly: HourlyTelemetry[] = [];

  for (let offset = 23; offset >= 0; offset--) {
    const hr = (nowHour - offset + 24) % 24;
    const hourLabel = `${String(hr).padStart(2, '0')}:00`;
    const rGap = hashCode(`${station.code}-gap-${hr}`, refreshSeed);
    const rNoise = hashCode(`${station.code}-noise-${hr}`, refreshSeed);

    // Daytime cultural microseismic bump (08:00 - 19:00 local)
    const isDaytime = hr >= 8 && hr <= 19;
    const daytimeBump = isDaytime ? 4.2 : -1.8;
    const delayPenalty = Math.abs(station.delaySec) * 28;
    const rawNoise = baseNoiseDb + daytimeBump + delayPenalty + (rNoise - 0.5) * 6.5;
    const noiseDb = Number(Math.max(-152, Math.min(-98, rawNoise)).toFixed(1));

    // Realistic telemetry gap distribution over 24h
    const stationVulnerability =
      station.code === 'SCZ' || station.code === 'RCP'
        ? 0.24
        : station.code === 'OCL' || station.code === 'BUT'
          ? 0.16
          : 0.09;

    let downtimeMin = 0;
    let gapEvents = 0;
    if (rGap < stationVulnerability) {
      const severity = hashCode(`${station.code}-sev-${hr}`, refreshSeed + 17);
      downtimeMin = Number((1.5 + severity * (stationVulnerability > 0.2 ? 14 : 7.5)).toFixed(1));
      gapEvents = downtimeMin >= 6 ? 2 : 1;
    }

    const completenessPct = Number(Math.max(0, ((60 - downtimeMin) / 60) * 100).toFixed(1));

    hourly.push({
      hourLabel,
      downtimeMin,
      gapEvents,
      noiseDb,
      completenessPct,
    });
  }

  const downtimeMin = Number(hourly.reduce((sum, h) => sum + h.downtimeMin, 0).toFixed(1));
  const gapEvents = hourly.reduce((sum, h) => sum + h.gapEvents, 0);
  const uptimePct = Number(Math.max(0, ((1440 - downtimeMin) / 1440) * 100).toFixed(2));
  const avgNoiseDb = Number(
    (hourly.reduce((sum, h) => sum + h.noiseDb, 0) / hourly.length).toFixed(1)
  );
  const peakNoiseDb = Number(Math.max(...hourly.map((h) => h.noiseDb)).toFixed(1));

  let status: StationHealthSummary['status'] = 'Healthy';
  if (downtimeMin >= 20) {
    status = 'Data Gap';
  } else if (avgNoiseDb > -118 || downtimeMin >= 10) {
    status = 'Elevated Noise';
  }

  return {
    code: station.code,
    name: station.name,
    province: station.province,
    sensor: station.sensor,
    elevationM: station.elevationM,
    downtimeMin,
    gapEvents,
    uptimePct,
    avgNoiseDb,
    peakNoiseDb,
    status,
    hourly,
  };
}

export const StationHealthWidget: React.FC<StationHealthWidgetProps> = ({
  stations = PHILSTA_DATABASE,
  selectedCode = null,
  onSelectStation,
}) => {
  const [metricMode, setMetricMode] = useState<HealthMetricMode>('downtime');
  const [granularity, setGranularity] = useState<ChartGranularity>('stations');
  const [refreshSeed, setRefreshSeed] = useState<number>(1);
  const [internalSelected, setInternalSelected] = useState<string>(
    stations[0]?.code ?? 'BES'
  );

  const activeStationCode = selectedCode ?? internalSelected;

  const handleStationPick = (code: string) => {
    setInternalSelected(code);
    if (onSelectStation) {
      onSelectStation(selectedCode === code ? null : code);
    }
  };

  const healthList = useMemo(
    () => stations.map((st) => buildStationHealth(st, refreshSeed)),
    [stations, refreshSeed]
  );

  const activeStationHealth = useMemo(
    () => healthList.find((s) => s.code === activeStationCode) ?? healthList[0] ?? null,
    [healthList, activeStationCode]
  );

  const networkStats = useMemo(() => {
    if (healthList.length === 0) {
      return {
        avgUptimePct: 100,
        totalDowntimeMin: 0,
        meanNoiseDb: -135,
        degradedCount: 0,
      };
    }
    const avgUptimePct =
      healthList.reduce((acc, s) => acc + s.uptimePct, 0) / healthList.length;
    const totalDowntimeMin = healthList.reduce((acc, s) => acc + s.downtimeMin, 0);
    const meanNoiseDb =
      healthList.reduce((acc, s) => acc + s.avgNoiseDb, 0) / healthList.length;
    const degradedCount = healthList.filter((s) => s.status !== 'Healthy').length;

    return {
      avgUptimePct: Number(avgUptimePct.toFixed(2)),
      totalDowntimeMin: Number(totalDowntimeMin.toFixed(1)),
      meanNoiseDb: Number(meanNoiseDb.toFixed(1)),
      degradedCount,
    };
  }, [healthList]);

  // For Noise dB visualization on a 0-based bar scale, plot "Noise Above Quiet Floor (-155 dB)"
  // while displaying exact negative dB values in axes/tooltips.
  // When showing 20+ stations, surface the top 20 highest-downtime or highest-noise stations
  // (plus the currently selected station) so x-axis labels stay crisp and legible.
  const stationChartData = useMemo(() => {
    const mapped = healthList.map((s) => ({
      ...s,
      noisePlotVal: Number((s.avgNoiseDb + 155).toFixed(1)),
    }));
    if (mapped.length <= 20) return mapped;
    const sorted = [...mapped].sort((a, b) =>
      metricMode === 'downtime'
        ? b.downtimeMin - a.downtimeMin || b.avgNoiseDb - a.avgNoiseDb
        : b.avgNoiseDb - a.avgNoiseDb || b.downtimeMin - a.downtimeMin
    );
    const top = sorted.slice(0, 20);
    if (activeStationCode && !top.some((s) => s.code === activeStationCode)) {
      const selected = mapped.find((s) => s.code === activeStationCode);
      if (selected) {
        top[top.length - 1] = selected;
      }
    }
    return top;
  }, [healthList, metricMode, activeStationCode]);

  const hourlyChartData = useMemo(() => {
    if (!activeStationHealth) return [];
    return activeStationHealth.hourly.map((h) => ({
      ...h,
      noisePlotVal: Number((h.noiseDb + 155).toFixed(1)),
    }));
  }, [activeStationHealth]);

  const getStationBarColor = (item: StationHealthSummary, isSelected: boolean) => {
    if (metricMode === 'downtime') {
      if (item.downtimeMin >= 20) return isSelected ? '#be123c' : '#e11d48';
      if (item.downtimeMin >= 10) return isSelected ? '#b45309' : '#d97706';
      return isSelected ? '#1d4ed8' : '#3b82f6';
    }
    if (item.avgNoiseDb > -118) return isSelected ? '#b45309' : '#d97706';
    if (item.avgNoiseDb > -128) return isSelected ? '#0284c7' : '#38bdf8';
    return isSelected ? '#047857' : '#10b981';
  };

  const getHourlyBarColor = (item: HourlyTelemetry) => {
    if (metricMode === 'downtime') {
      if (item.downtimeMin >= 8) return '#e11d48';
      if (item.downtimeMin >= 3) return '#d97706';
      return item.downtimeMin > 0 ? '#3b82f6' : '#cbd5e1';
    }
    if (item.noiseDb > -118) return '#d97706';
    if (item.noiseDb > -128) return '#38bdf8';
    return '#10b981';
  };

  return (
    <section className="bg-[#eff7f6] border border-teal-700/60 rounded-lg overflow-hidden shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
      <div className="px-4 py-3 bg-[#dff0ed] border-b border-teal-800/55 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-blue-700 [text-shadow:0_0_8px_rgba(249,115,22,0.7),0_0_18px_rgba(251,146,60,0.45)]">
            Station Health (Last 24 Hours)
          </h2>
          <p className="text-xs text-slate-600">
            SEEDLink telemetry gap duration, packet loss events, and ambient RMS noise levels
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Metric Mode Switcher */}
          <div className="inline-flex items-center p-0.5 bg-[#c7e2de] border border-teal-800/45 rounded-md text-xs">
            <button
              type="button"
              onClick={() => setMetricMode('downtime')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                metricMode === 'downtime'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-700 hover:text-slate-950'
              }`}
            >
              Downtime &amp; Gaps
            </button>
            <button
              type="button"
              onClick={() => setMetricMode('noise')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                metricMode === 'noise'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-700 hover:text-slate-950'
              }`}
            >
              Noise Level (dB)
            </button>
          </div>

          {/* Granularity Switcher */}
          <div className="inline-flex items-center p-0.5 bg-[#c7e2de] border border-teal-800/45 rounded-md text-xs">
            <button
              type="button"
              onClick={() => setGranularity('stations')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                granularity === 'stations'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              By Station
            </button>
            <button
              type="button"
              onClick={() => setGranularity('hourly')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                granularity === 'hourly'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              24h Hourly
            </button>
          </div>

          {granularity === 'hourly' && activeStationHealth && (
            <select
              aria-label="Select station for 24h hourly profile"
              value={activeStationHealth.code}
              onChange={(e) => handleStationPick(e.target.value)}
              className="px-2.5 py-1 text-xs font-mono border border-slate-300 rounded-md bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {healthList.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.code} · {s.name}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={() => setRefreshSeed((s) => s + 1)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
            title="Sample latest 24h telemetry window"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-4 py-3 bg-[#e3f2ef] border-b border-teal-800/50 text-xs">
        <div className="bg-[#d7ebe8] border border-teal-800/65 rounded-md px-3 py-2 shadow-2xs">
          <div className="text-[11px] font-medium text-slate-700">Network Uptime (24h)</div>
          <div className="text-base font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
            {networkStats.avgUptimePct.toFixed(2)}%
          </div>
        </div>
        <div className="bg-[#d7ebe8] border border-teal-800/65 rounded-md px-3 py-2 shadow-2xs">
          <div className="text-[11px] font-medium text-slate-700">Cumulative Gap Time</div>
          <div className="text-base font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
            {networkStats.totalDowntimeMin.toFixed(1)} min
          </div>
        </div>
        <div className="bg-[#d7ebe8] border border-teal-800/65 rounded-md px-3 py-2 shadow-2xs">
          <div className="text-[11px] font-medium text-slate-700">Mean Ambient Noise</div>
          <div className="text-base font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
            {networkStats.meanNoiseDb.toFixed(1)} dB
          </div>
        </div>
        <div className="bg-[#d7ebe8] border border-teal-800/65 rounded-md px-3 py-2 shadow-2xs">
          <div className="text-[11px] font-medium text-slate-700">Alerts (&ge;10m gap / noisy)</div>
          <div
            className={`text-base font-semibold font-mono tabular-nums mt-0.5 flex items-center gap-1.5 ${
              networkStats.degradedCount > 0 ? 'text-amber-800' : 'text-emerald-800'
            }`}
          >
            {networkStats.degradedCount > 0 && <AlertTriangle className="w-4 h-4" />}
            {networkStats.degradedCount} / {healthList.length} stations
          </div>
        </div>
      </div>

      {/* Bar Chart Canvas */}
      <div className="p-4 bg-[#f5fbfa]/80">
        {healthList.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-xs text-slate-500 gap-1.5">
            <WifiOff className="w-5 h-5 text-slate-400" />
            <span>No stations match the current filter.</span>
          </div>
        ) : (
          <div className="h-68 w-full">
            <ResponsiveContainer width="100%" height="100%">
              {granularity === 'stations' ? (
                <BarChart
                  data={stationChartData}
                  margin={{ top: 12, right: 16, left: 4, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="code"
                    tick={{ fontSize: 11, fill: '#334155', fontFamily: 'monospace' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#475569', fontFamily: 'monospace' }}
                    axisLine={false}
                    tickLine={false}
                    width={46}
                    tickFormatter={(val: number) =>
                      metricMode === 'downtime' ? `${val}m` : `${val - 155}`
                    }
                    label={{
                      value: metricMode === 'downtime' ? 'Downtime (min)' : 'RMS Noise (dB)',
                      angle: -90,
                      position: 'insideLeft',
                      offset: 4,
                      style: { fontSize: 11, fill: '#64748b' },
                    }}
                  />
                  {metricMode === 'downtime' ? (
                    <ReferenceLine
                      y={20}
                      stroke="#e11d48"
                      strokeDasharray="4 4"
                      label={{
                        value: '20m SLA limit',
                        position: 'insideTopRight',
                        fill: '#be123c',
                        fontSize: 10,
                      }}
                    />
                  ) : (
                    <ReferenceLine
                      y={37}
                      stroke="#d97706"
                      strokeDasharray="4 4"
                      label={{
                        value: '-118 dB high noise',
                        position: 'insideTopRight',
                        fill: '#b45309',
                        fontSize: 10,
                      }}
                    />
                  )}
                  <Tooltip
                    cursor={{ fill: 'rgba(241, 245, 249, 0.7)' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const item = payload[0].payload as StationHealthSummary;
                      return (
                        <div className="bg-white border border-slate-300 rounded-md shadow-md p-2.5 text-xs space-y-1 min-w-[200px]">
                          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1">
                            <span className="font-semibold text-slate-900">
                              <span className="font-mono">{item.code}</span> · {item.name}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {item.province} · {item.sensor}
                          </div>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono tabular-nums pt-0.5">
                            <span className="font-sans text-slate-500">24h Downtime:</span>
                            <span className="text-right font-semibold text-slate-900">
                              {item.downtimeMin.toFixed(1)} min ({item.gapEvents} gaps)
                            </span>
                            <span className="font-sans text-slate-500">Uptime:</span>
                            <span className="text-right text-slate-900">
                              {item.uptimePct.toFixed(2)}%
                            </span>
                            <span className="font-sans text-slate-500">Avg Noise:</span>
                            <span className="text-right text-slate-900">
                              {item.avgNoiseDb.toFixed(1)} dB
                            </span>
                            <span className="font-sans text-slate-500">Peak Noise:</span>
                            <span className="text-right text-slate-900">
                              {item.peakNoiseDb.toFixed(1)} dB
                            </span>
                          </div>
                          <div className="text-[10px] text-blue-600 pt-0.5">
                            Click bar to inspect {item.code} hourly timeline
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Bar
                    dataKey={metricMode === 'downtime' ? 'downtimeMin' : 'noisePlotVal'}
                    radius={[3, 3, 0, 0]}
                    maxBarSize={34}
                    className="cursor-pointer"
                    onClick={(entry) => {
                      const code = (entry as unknown as StationHealthSummary)?.code;
                      if (code) {
                        handleStationPick(code);
                        setGranularity('hourly');
                      }
                    }}
                  >
                    {stationChartData.map((entry) => (
                      <Cell
                        key={entry.code}
                        fill={getStationBarColor(entry, entry.code === activeStationCode)}
                        stroke={entry.code === activeStationCode ? '#0f172a' : 'none'}
                        strokeWidth={entry.code === activeStationCode ? 1.5 : 0}
                      />
                    ))}
                  </Bar>
                </BarChart>
              ) : (
                <BarChart
                  data={hourlyChartData}
                  margin={{ top: 12, right: 16, left: 4, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="hourLabel"
                    tick={{ fontSize: 10, fill: '#475569', fontFamily: 'monospace' }}
                    interval={2}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#475569', fontFamily: 'monospace' }}
                    axisLine={false}
                    tickLine={false}
                    width={46}
                    tickFormatter={(val: number) =>
                      metricMode === 'downtime' ? `${val}m` : `${val - 155}`
                    }
                    label={{
                      value: metricMode === 'downtime' ? 'Gap (min/hr)' : 'Noise (dB)',
                      angle: -90,
                      position: 'insideLeft',
                      offset: 4,
                      style: { fontSize: 11, fill: '#64748b' },
                    }}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(241, 245, 249, 0.7)' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length || !activeStationHealth) return null;
                      const h = payload[0].payload as HourlyTelemetry;
                      return (
                        <div className="bg-white border border-slate-300 rounded-md shadow-md p-2.5 text-xs space-y-1 min-w-[185px]">
                          <div className="font-semibold text-slate-900 border-b border-slate-100 pb-1">
                            <span className="font-mono">{activeStationHealth.code}</span> · {h.hourLabel}
                          </div>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono tabular-nums">
                            <span className="font-sans text-slate-500">Gap Duration:</span>
                            <span className="text-right font-semibold text-slate-900">
                              {h.downtimeMin.toFixed(1)} min
                            </span>
                            <span className="font-sans text-slate-500">Completeness:</span>
                            <span className="text-right text-slate-900">
                              {h.completenessPct.toFixed(1)}%
                            </span>
                            <span className="font-sans text-slate-500">RMS Noise:</span>
                            <span className="text-right text-slate-900">
                              {h.noiseDb.toFixed(1)} dB
                            </span>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Bar
                    dataKey={metricMode === 'downtime' ? 'downtimeMin' : 'noisePlotVal'}
                    radius={[2, 2, 0, 0]}
                    maxBarSize={22}
                  >
                    {hourlyChartData.map((entry) => (
                      <Cell key={entry.hourLabel} fill={getHourlyBarColor(entry)} />
                    ))}
                  </Bar>
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        )}

        {/* Footer Legend & Active Station Detail */}
        <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex flex-wrap items-center gap-4">
            {metricMode === 'downtime' ? (
              <>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-xs bg-blue-500" />
                  Normal (&lt;10m)
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-xs bg-amber-600" />
                  Minor Gaps (10–20m)
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-xs bg-rose-600" />
                  SLA Alert (&ge;20m)
                </span>
              </>
            ) : (
              <>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-xs bg-emerald-500" />
                  Quiet (&le;-128 dB)
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-xs bg-sky-400" />
                  Moderate (-128 to -118 dB)
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-xs bg-amber-600" />
                  Elevated (&gt;-118 dB)
                </span>
              </>
            )}
          </div>

          {activeStationHealth && (
            <div className="inline-flex items-center gap-2 font-mono text-[11px] text-slate-600">
              <Activity className="w-3.5 h-3.5 text-slate-400" />
              <span>
                {healthList.length > 20 && granularity === 'stations'
                  ? `Top 20 of ${healthList.length} stations · `
                  : ''}
                {activeStationHealth.code}: {activeStationHealth.uptimePct.toFixed(2)}% uptime ·{' '}
                {activeStationHealth.avgNoiseDb.toFixed(1)} dB avg
              </span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
