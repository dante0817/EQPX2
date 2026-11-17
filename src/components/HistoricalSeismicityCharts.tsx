import React, { useMemo, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { EQPEvent, isEventUnlocated } from '../data/eqpData';
import {
  depthToColorHex,
  FilteredHistoricalEvent,
  HistoricalSummaryStats,
  parseActiveEventUtcMs,
  projectEventsToCrossSection,
} from '../utils/historicalSeismicity';
import {
  exportSvgElementAsPng,
  exportSvgElementAsSvg,
} from './HistoricalBeachballIcon';

interface HistoricalSeismicityChartsProps {
  activeEvent: EQPEvent;
  filtered: FilteredHistoricalEvent[];
  stats: HistoricalSummaryStats;
  selectedRecordId: string | null;
  onSelectRecord: (recordId: string) => void;
  sectionAzimuthDeg: number;
  onChangeSectionAzimuth: (az: number) => void;
  sectionHalfWidthKm: number;
  onChangeSectionHalfWidthKm: (km: number) => void;
  onNotice?: (msg: string) => void;
}

const SCALE_COLORS: Record<string, string> = {
  Mw: '#1d4ed8',
  Mww: '#1e40af',
  Mwc: '#0284c7',
  Ml: '#0f766e',
  mb: '#b45309',
  Ms: '#9333ea',
  Md: '#475569',
  Unknown: '#64748b',
};

function getScaleColor(magType: string): string {
  return SCALE_COLORS[magType] ?? '#334155';
}

export const HistoricalSeismicityCharts: React.FC<HistoricalSeismicityChartsProps> = ({
  activeEvent,
  filtered,
  stats,
  selectedRecordId,
  onSelectRecord,
  sectionAzimuthDeg,
  onChangeSectionAzimuth,
  sectionHalfWidthKm,
  onChangeSectionHalfWidthKm,
  onNotice,
}) => {
  const [chartTab, setChartTab] = useState<'overview' | 'cross-section'>('overview');
  const overviewSvgRef = useRef<SVGSVGElement | null>(null);
  const crossSvgRef = useRef<SVGSVGElement | null>(null);

  const unlocated = isEventUnlocated(activeEvent);
  const activeTimeMs = useMemo(() => parseActiveEventUtcMs(activeEvent), [activeEvent]);
  const activePreferredMag =
    activeEvent.preferredScale === 'Ms'
      ? activeEvent.ms
      : activeEvent.preferredScale === 'Mb'
      ? activeEvent.mb
      : activeEvent.md;

  // 1. Timeline & Mag-Depth data prep
  const timelineDomain = useMemo(() => {
    const times = filtered.map((f) => f.record.originTimeMs);
    if (activeTimeMs !== null) times.push(activeTimeMs);
    if (times.length === 0) {
      return { minMs: Date.now() - 86400_000 * 365, maxMs: Date.now(), minMag: 1, maxMag: 8 };
    }
    let minMs = Math.min(...times);
    let maxMs = Math.max(...times);
    if (maxMs - minMs < 3600_000) {
      minMs -= 1800_000;
      maxMs += 1800_000;
    }
    const mags = filtered
      .map((f) => f.record.magnitude)
      .filter((m): m is number => m !== null && Number.isFinite(m));
    if (activePreferredMag > 0) mags.push(activePreferredMag);
    const minMag = mags.length > 0 ? Math.max(0, Math.floor(Math.min(...mags) - 0.5)) : 1;
    const maxMag = mags.length > 0 ? Math.min(9.5, Math.ceil(Math.max(...mags) + 0.5)) : 8;
    return { minMs, maxMs, minMag, maxMag };
  }, [filtered, activeTimeMs, activePreferredMag]);

  // 2. Depth Histogram Bins (known depths only)
  const depthBins = useMemo(() => {
    const defs = [
      { label: '0–15', min: -10, max: 15, color: '#dc2626' },
      { label: '15–35', min: 15, max: 35, color: '#ea580c' },
      { label: '35–70', min: 35, max: 70, color: '#d97706' },
      { label: '70–150', min: 70, max: 150, color: '#0d9488' },
      { label: '150–300', min: 150, max: 300, color: '#2563eb' },
      { label: '>300', min: 300, max: 9999, color: '#6d28d9' },
    ];
    const counts = defs.map((d) => ({ ...d, count: 0 }));
    for (const item of filtered) {
      const z = item.record.depthKm;
      if (z === null) continue;
      const bin = counts.find((b) => z >= b.min && z < b.max) ?? counts[counts.length - 1];
      bin.count++;
    }
    const maxCount = Math.max(1, ...counts.map((c) => c.count));
    return { bins: counts, maxCount };
  }, [filtered]);

  // 3. Magnitude Distribution separated strictly by magType
  const magBinsByScale = useMemo(() => {
    const magBands = [
      { label: '<3.0', min: -5, max: 3.0 },
      { label: '3–3.9', min: 3.0, max: 4.0 },
      { label: '4–4.9', min: 4.0, max: 5.0 },
      { label: '5–5.9', min: 5.0, max: 6.0 },
      { label: '6–6.9', min: 6.0, max: 7.0 },
      { label: '≥7.0', min: 7.0, max: 12.0 },
    ];
    const scales = stats.magnitudeBreakdown.map((b) => b.magnitudeType);
    const rows = magBands.map((band) => {
      const countsByScale: Record<string, number> = {};
      for (const sc of scales) countsByScale[sc] = 0;
      let total = 0;
      for (const item of filtered) {
        const m = item.record.magnitude;
        if (m === null) continue;
        if (m >= band.min && m < band.max) {
          const sc = item.record.magnitudeType || 'Unknown';
          countsByScale[sc] = (countsByScale[sc] ?? 0) + 1;
          total++;
        }
      }
      return { ...band, countsByScale, total };
    });
    const maxTotal = Math.max(1, ...rows.map((r) => r.total));
    return { scales, rows, maxTotal };
  }, [filtered, stats.magnitudeBreakdown]);

  // 4. Depth Cross-Section Projection (only when activeEvent is located)
  const crossSection = useMemo(() => {
    if (unlocated) return { points: [], maxAlong: 100, maxDepth: 150 };
    const pts = projectEventsToCrossSection(
      filtered,
      activeEvent.lat,
      activeEvent.lon,
      sectionAzimuthDeg,
      sectionHalfWidthKm
    );
    const maxAlong = Math.max(
      50,
      ...pts.map((p) => Math.ceil(Math.abs(p.alongKm) / 25) * 25)
    );
    const maxDepth = Math.max(
      70,
      Math.ceil(activeEvent.depthKm / 25) * 25 + 25,
      ...pts.map((p) => Math.ceil(p.depthKm / 25) * 25 + 15)
    );
    return { points: pts, maxAlong, maxDepth };
  }, [unlocated, filtered, activeEvent.lat, activeEvent.lon, activeEvent.depthKm, sectionAzimuthDeg, sectionHalfWidthKm]);

  const handleExportSvg = (which: 'overview' | 'cross-section') => {
    const ref = which === 'overview' ? overviewSvgRef.current : crossSvgRef.current;
    const name =
      which === 'overview'
        ? `historical_charts_${activeEvent.filename.replace(/\.eqp$/i, '')}.svg`
        : `depth_cross_section_${activeEvent.filename.replace(/\.eqp$/i, '')}.svg`;
    if (exportSvgElementAsSvg(ref, name)) {
      onNotice?.(`Exported ${name}`);
    }
  };

  const handleExportPng = async (which: 'overview' | 'cross-section') => {
    const ref = which === 'overview' ? overviewSvgRef.current : crossSvgRef.current;
    const name =
      which === 'overview'
        ? `historical_charts_${activeEvent.filename.replace(/\.eqp$/i, '')}.png`
        : `depth_cross_section_${activeEvent.filename.replace(/\.eqp$/i, '')}.png`;
    const ok = await exportSvgElementAsPng(ref, name, 2);
    if (ok) onNotice?.(`Exported ${name}`);
  };

  if (filtered.length === 0) {
    return (
      <div className="bg-[#f3f1fb] border border-indigo-700/60 rounded-lg p-6 text-center space-y-1.5 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
        <div className="text-xs font-semibold text-slate-900">
          No historical catalog records match the current radius/time/attribute filters
        </div>
        <p className="text-[11px] text-slate-700 max-w-xl mx-auto">
          Import a CSV/GeoJSON earthquake catalog or run an explicit USGS FDSN retrieval above, or broaden the search radius and time window. Missing data are never substituted with synthetic records.
        </p>
      </div>
    );
  }

  // Overview 2x2 SVG Grid layout constants (960 x 540 viewBox)
  const TL = { x: 54, y: 38, w: 400, h: 175 };
  const MD = { x: 525, y: 38, w: 395, h: 175 };
  const DH = { x: 54, y: 295, w: 400, h: 185 };
  const SC = { x: 525, y: 295, w: 395, h: 185 };

  const scatterMaxDepth = Math.max(
    70,
    stats.depthMaxKm !== null ? Math.ceil(stats.depthMaxKm / 25) * 25 : 100,
    unlocated ? 0 : Math.ceil(activeEvent.depthKm / 25) * 25
  );

  return (
    <div className="bg-[#f3f1fb] border border-indigo-700/60 rounded-lg overflow-hidden shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
      <div className="px-3 py-2 border-b border-indigo-800/45 flex flex-wrap items-center justify-between gap-2 bg-[#e5e1f7]">
        <div className="flex items-center gap-1.5" role="tablist" aria-label="Historical Seismicity Charts">
          <button
            type="button"
            onClick={() => setChartTab('overview')}
            className={`px-2.5 py-1 text-xs font-semibold border rounded-xs transition-colors ${
              chartTab === 'overview'
                ? 'bg-white border-indigo-800/65 text-slate-900 shadow-xs'
                : 'bg-[#d7d1f2] border-indigo-800/45 text-slate-700 hover:bg-white'
            }`}
          >
            Statistical Charts (Timeline · Mag · Depth · M vs Z)
          </button>
          <button
            type="button"
            onClick={() => setChartTab('cross-section')}
            className={`px-2.5 py-1 text-xs font-semibold border rounded-xs transition-colors ${
              chartTab === 'cross-section'
                ? 'bg-white border-indigo-800/65 text-slate-900 shadow-xs'
                : 'bg-[#d7d1f2] border-indigo-800/45 text-slate-700 hover:bg-white'
            }`}
          >
            Depth Cross-Section (A–A&apos;)
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => handleExportSvg(chartTab)}
            className="px-2 py-1 text-[11px] font-medium bg-white border border-indigo-800/50 rounded-xs text-slate-700 hover:bg-indigo-50 inline-flex items-center gap-1"
          >
            <Download className="w-3 h-3" /> SVG
          </button>
          <button
            type="button"
            onClick={() => void handleExportPng(chartTab)}
            className="px-2 py-1 text-[11px] font-medium bg-white border border-indigo-800/50 rounded-xs text-slate-700 hover:bg-indigo-50 inline-flex items-center gap-1"
          >
            <Download className="w-3 h-3" /> PNG
          </button>
        </div>
      </div>

      {chartTab === 'overview' ? (
        <div className="p-3 overflow-x-auto">
          <div className="border border-indigo-800/50 rounded bg-white p-1">
          <svg
            ref={overviewSvgRef}
            viewBox="0 0 960 520"
            className="w-full min-w-[760px] h-auto select-none"
          >
            <rect x={0} y={0} width={960} height={520} fill="#ffffff" />

            {/* Panel 1: Earthquake Timeline */}
            <text x={TL.x} y={22} fontSize={12} fontWeight={700} fill="#0f172a">
              A. Earthquake Timeline (UTC) vs Magnitude
            </text>
            <rect x={TL.x} y={TL.y} width={TL.w} height={TL.h} fill="#f8fafc" stroke="#cbd5e1" />
            {[0, 0.25, 0.5, 0.75, 1].map((t) => {
              const y = TL.y + TL.h - t * TL.h;
              const val = timelineDomain.minMag + t * (timelineDomain.maxMag - timelineDomain.minMag);
              return (
                <g key={`tl-y-${t}`}>
                  <line x1={TL.x} y1={y} x2={TL.x + TL.w} y2={y} stroke="#e2e8f0" strokeDasharray="2,2" />
                  <text x={TL.x - 6} y={y + 3} fontSize={9.5} textAnchor="end" fill="#475569" fontFamily="monospace">
                    {val.toFixed(1)}
                  </text>
                </g>
              );
            })}
            <text x={TL.x} y={TL.y + TL.h + 15} fontSize={9} fill="#475569" fontFamily="monospace">
              {new Date(timelineDomain.minMs).toISOString().slice(0, 10)}
            </text>
            <text x={TL.x + TL.w} y={TL.y + TL.h + 15} fontSize={9} textAnchor="end" fill="#475569" fontFamily="monospace">
              {new Date(timelineDomain.maxMs).toISOString().slice(0, 10)}
            </text>
            {activeTimeMs !== null && (() => {
              const ratio = (activeTimeMs - timelineDomain.minMs) / (timelineDomain.maxMs - timelineDomain.minMs);
              if (ratio < 0 || ratio > 1) return null;
              const ax = TL.x + ratio * TL.w;
              const ay =
                activePreferredMag > 0
                  ? TL.y +
                    TL.h -
                    ((activePreferredMag - timelineDomain.minMag) /
                      Math.max(0.5, timelineDomain.maxMag - timelineDomain.minMag)) *
                      TL.h
                  : TL.y + 20;
              return (
                <g>
                  <line x1={ax} y1={TL.y} x2={ax} y2={TL.y + TL.h} stroke="#dc2626" strokeWidth={1.2} strokeDasharray="4,3" />
                  <circle cx={ax} cy={Math.max(TL.y + 4, Math.min(TL.y + TL.h - 4, ay))} r={5} fill="#dc2626" stroke="#ffffff" strokeWidth={1.2} />
                  <text x={Math.min(TL.x + TL.w - 48, ax + 4)} y={TL.y + 12} fontSize={9} fontWeight={700} fill="#dc2626">
                    Selected Eq
                  </text>
                </g>
              );
            })()}
            {filtered.map((item) => {
              if (item.record.magnitude === null) return null;
              const x =
                TL.x +
                ((item.record.originTimeMs - timelineDomain.minMs) /
                  (timelineDomain.maxMs - timelineDomain.minMs)) *
                  TL.w;
              const y =
                TL.y +
                TL.h -
                ((item.record.magnitude - timelineDomain.minMag) /
                  Math.max(0.5, timelineDomain.maxMag - timelineDomain.minMag)) *
                  TL.h;
              const isSel = selectedRecordId === item.record.id;
              return (
                <circle
                  key={`tl-${item.record.id}`}
                  cx={x}
                  cy={Math.max(TL.y + 2, Math.min(TL.y + TL.h - 2, y))}
                  r={isSel ? 5.5 : 3.2}
                  fill={getScaleColor(item.record.magnitudeType)}
                  fillOpacity={0.82}
                  stroke={isSel ? '#0f172a' : '#ffffff'}
                  strokeWidth={isSel ? 1.8 : 0.6}
                  className="cursor-pointer"
                  onClick={() => onSelectRecord(item.record.id)}
                >
                  <title>{`${item.record.eventId} · ${item.record.originTimeUtc} · ${item.record.magnitudeType} ${item.record.magnitude}`}</title>
                </circle>
              );
            })}

            {/* Panel 2: Magnitude Distribution (Stacked by Magnitude Type to preserve scales) */}
            <text x={MD.x} y={22} fontSize={12} fontWeight={700} fill="#0f172a">
              B. Magnitude Distribution (Preserving Scale Labels)
            </text>
            <rect x={MD.x} y={MD.y} width={MD.w} height={MD.h} fill="#f8fafc" stroke="#cbd5e1" />
            {magBinsByScale.rows.map((band, idx) => {
              const slotW = MD.w / magBinsByScale.rows.length;
              const bx = MD.x + idx * slotW + slotW * 0.16;
              const bw = slotW * 0.68;
              let yCursor = MD.y + MD.h;
              return (
                <g key={`mag-${band.label}`}>
                  {magBinsByScale.scales.map((sc) => {
                    const cnt = band.countsByScale[sc] ?? 0;
                    if (cnt <= 0) return null;
                    const bh = (cnt / magBinsByScale.maxTotal) * (MD.h - 24);
                    yCursor -= bh;
                    return (
                      <rect
                        key={`mag-${band.label}-${sc}`}
                        x={bx}
                        y={yCursor}
                        width={bw}
                        height={bh}
                        fill={getScaleColor(sc)}
                      >
                        <title>{`${band.label} (${sc}): ${cnt}`}</title>
                      </rect>
                    );
                  })}
                  {band.total > 0 && (
                    <text
                      x={bx + bw / 2}
                      y={yCursor - 4}
                      fontSize={9.5}
                      textAnchor="middle"
                      fill="#0f172a"
                      fontFamily="monospace"
                    >
                      {band.total}
                    </text>
                  )}
                  <text x={bx + bw / 2} y={MD.y + MD.h + 14} fontSize={9.5} textAnchor="middle" fill="#334155" fontFamily="monospace">
                    {band.label}
                  </text>
                </g>
              );
            })}
            {/* Scale legend inside Panel B */}
            <g transform={`translate(${MD.x}, ${MD.y + MD.h + 26})`}>
              {magBinsByScale.scales.slice(0, 6).map((sc, idx) => (
                <g key={`sc-leg-${sc}`} transform={`translate(${idx * 64}, 0)`}>
                  <rect x={0} y={0} width={9} height={9} fill={getScaleColor(sc)} />
                  <text x={13} y={8} fontSize={9.5} fill="#334155" fontFamily="monospace">
                    {sc}
                  </text>
                </g>
              ))}
            </g>

            {/* Panel 3: Depth Distribution */}
            <text x={DH.x} y={279} fontSize={12} fontWeight={700} fill="#0f172a">
              C. Depth Distribution (km) · Known={stats.knownDepthCount}, Missing={stats.missingDepthCount}
            </text>
            <rect x={DH.x} y={DH.y} width={DH.w} height={DH.h} fill="#f8fafc" stroke="#cbd5e1" />
            {depthBins.bins.map((bin, idx) => {
              const slotW = DH.w / depthBins.bins.length;
              const bx = DH.x + idx * slotW + slotW * 0.16;
              const bw = slotW * 0.68;
              const bh = (bin.count / depthBins.maxCount) * (DH.h - 24);
              const by = DH.y + DH.h - bh;
              return (
                <g key={`dep-${bin.label}`}>
                  <rect x={bx} y={by} width={bw} height={bh} fill={bin.color} fillOpacity={0.85} />
                  {bin.count > 0 && (
                    <text x={bx + bw / 2} y={by - 4} fontSize={9.5} textAnchor="middle" fill="#0f172a" fontFamily="monospace">
                      {bin.count}
                    </text>
                  )}
                  <text x={bx + bw / 2} y={DH.y + DH.h + 14} fontSize={9.5} textAnchor="middle" fill="#334155" fontFamily="monospace">
                    {bin.label}
                  </text>
                </g>
              );
            })}

            {/* Panel 4: Magnitude vs Depth Scatter */}
            <text x={SC.x} y={279} fontSize={12} fontWeight={700} fill="#0f172a">
              D. Magnitude vs. Depth (km, downwards)
            </text>
            <rect x={SC.x} y={SC.y} width={SC.w} height={SC.h} fill="#f8fafc" stroke="#cbd5e1" />
            {[0, 0.25, 0.5, 0.75, 1].map((t) => {
              const y = SC.y + t * SC.h;
              const z = t * scatterMaxDepth;
              return (
                <g key={`sc-z-${t}`}>
                  <line x1={SC.x} y1={y} x2={SC.x + SC.w} y2={y} stroke="#e2e8f0" strokeDasharray="2,2" />
                  <text x={SC.x - 6} y={y + 3} fontSize={9.5} textAnchor="end" fill="#475569" fontFamily="monospace">
                    {Math.round(z)}
                  </text>
                </g>
              );
            })}
            {[0, 0.25, 0.5, 0.75, 1].map((t) => {
              const x = SC.x + t * SC.w;
              const m = timelineDomain.minMag + t * (timelineDomain.maxMag - timelineDomain.minMag);
              return (
                <text key={`sc-m-${t}`} x={x} y={SC.y + SC.h + 14} fontSize={9.5} textAnchor="middle" fill="#475569" fontFamily="monospace">
                  {m.toFixed(1)}
                </text>
              );
            })}
            {!unlocated && activePreferredMag > 0 && (() => {
              const sx =
                SC.x +
                ((activePreferredMag - timelineDomain.minMag) /
                  Math.max(0.5, timelineDomain.maxMag - timelineDomain.minMag)) *
                  SC.w;
              const sy = SC.y + (activeEvent.depthKm / scatterMaxDepth) * SC.h;
              return (
                <circle
                  cx={Math.max(SC.x + 4, Math.min(SC.x + SC.w - 4, sx))}
                  cy={Math.max(SC.y + 4, Math.min(SC.y + SC.h - 4, sy))}
                  r={5.5}
                  fill="#dc2626"
                  stroke="#ffffff"
                  strokeWidth={1.5}
                >
                  <title>{`Selected Event: M${activePreferredMag.toFixed(1)}, Depth ${activeEvent.depthKm.toFixed(1)} km`}</title>
                </circle>
              );
            })()}
            {filtered.map((item) => {
              if (item.record.magnitude === null || item.record.depthKm === null) return null;
              const sx =
                SC.x +
                ((item.record.magnitude - timelineDomain.minMag) /
                  Math.max(0.5, timelineDomain.maxMag - timelineDomain.minMag)) *
                  SC.w;
              const sy = SC.y + (item.record.depthKm / scatterMaxDepth) * SC.h;
              const isSel = selectedRecordId === item.record.id;
              return (
                <circle
                  key={`mz-${item.record.id}`}
                  cx={Math.max(SC.x + 3, Math.min(SC.x + SC.w - 3, sx))}
                  cy={Math.max(SC.y + 3, Math.min(SC.y + SC.h - 3, sy))}
                  r={isSel ? 5.5 : 3.2}
                  fill={depthToColorHex(item.record.depthKm)}
                  fillOpacity={0.85}
                  stroke={isSel ? '#0f172a' : '#ffffff'}
                  strokeWidth={isSel ? 1.8 : 0.6}
                  className="cursor-pointer"
                  onClick={() => onSelectRecord(item.record.id)}
                >
                  <title>{`${item.record.eventId} · ${item.record.magnitudeType} ${item.record.magnitude} · Z=${item.record.depthKm} km`}</title>
                </circle>
              );
            })}
          </svg>
          </div>
        </div>
      ) : (
        <div className="p-3 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs border border-indigo-800/60 bg-[#e5e1f7] px-3 py-2 rounded">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 font-medium text-slate-700">
                <span>Transect Azimuth (A→A&apos;):</span>
                <input
                  type="range"
                  min={0}
                  max={179}
                  value={sectionAzimuthDeg % 180}
                  onChange={(e) => onChangeSectionAzimuth(Number(e.target.value))}
                  className="w-32"
                />
                <span className="font-mono tabular-nums font-semibold text-slate-900 w-10">
                  {sectionAzimuthDeg}°
                </span>
              </label>
              <label className="flex items-center gap-2 font-medium text-slate-700">
                <span>Swath Half-Width:</span>
                <select
                  value={sectionHalfWidthKm}
                  onChange={(e) => onChangeSectionHalfWidthKm(Number(e.target.value))}
                  className="border border-slate-300 bg-white rounded-xs px-1.5 py-0.5 text-xs font-mono"
                >
                  <option value={15}>±15 km</option>
                  <option value={25}>±25 km</option>
                  <option value={50}>±50 km</option>
                  <option value={100}>±100 km</option>
                  <option value={200}>±200 km</option>
                </select>
              </label>
            </div>
            <div className="text-[11px] font-mono tabular-nums text-slate-700">
              Projected with known depth: {crossSection.points.length} / {filtered.length} events
            </div>
          </div>

          {unlocated ? (
            <div className="p-6 text-center text-xs text-slate-700 bg-[#e5e1f7] border border-indigo-800/55 rounded">
              Active event is unlocated — locate the reference earthquake first to center the A–A&apos; depth cross-section.
            </div>
          ) : (
            <div className="overflow-x-auto border border-indigo-800/50 rounded bg-white p-1">
              <svg
                ref={crossSvgRef}
                viewBox="0 0 920 320"
                className="w-full min-w-[720px] h-auto select-none"
              >
                <rect x={0} y={0} width={920} height={320} fill="#ffffff" />
                <text x={58} y={20} fontSize={12} fontWeight={700} fill="#0f172a">
                  Depth Cross-Section A ({sectionAzimuthDeg + 180 >= 360 ? sectionAzimuthDeg - 180 : sectionAzimuthDeg + 180}°) → A&apos; ({sectionAzimuthDeg}°) · Swath ±{sectionHalfWidthKm} km
                </text>
                <rect x={58} y={32} width={820} height={240} fill="#f8fafc" stroke="#cbd5e1" />

                {/* Zero distance dashed line */}
                <line x1={468} y1={32} x2={468} y2={272} stroke="#94a3b8" strokeDasharray="3,3" />
                {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                  const y = 32 + t * 240;
                  const z = t * crossSection.maxDepth;
                  return (
                    <g key={`cs-y-${t}`}>
                      <line x1={58} y1={y} x2={878} y2={y} stroke="#e2e8f0" strokeDasharray="2,2" />
                      <text x={52} y={y + 3} fontSize={9.5} textAnchor="end" fill="#475569" fontFamily="monospace">
                        {Math.round(z)} km
                      </text>
                    </g>
                  );
                })}
                {[-1, -0.5, 0, 0.5, 1].map((f) => {
                  const x = 468 + f * 410;
                  const km = Math.round(f * crossSection.maxAlong);
                  return (
                    <text key={`cs-x-${f}`} x={x} y={288} fontSize={9.5} textAnchor="middle" fill="#475569" fontFamily="monospace">
                      {km > 0 ? `+${km}` : `${km}`} km
                    </text>
                  );
                })}
                <text x={58} y={306} fontSize={10} fontWeight={700} fill="#334155">A</text>
                <text x={878} y={306} fontSize={10} fontWeight={700} textAnchor="end" fill="#334155">A&apos;</text>

                {/* Active Event hypocenter */}
                <g>
                  <circle
                    cx={468}
                    cy={Math.max(36, Math.min(268, 32 + (activeEvent.depthKm / crossSection.maxDepth) * 240))}
                    r={6.5}
                    fill="#dc2626"
                    stroke="#ffffff"
                    strokeWidth={1.6}
                  >
                    <title>{`Selected Event: 0 km along, Z=${activeEvent.depthKm.toFixed(1)} km`}</title>
                  </circle>
                  <text
                    x={478}
                    y={Math.max(44, Math.min(268, 32 + (activeEvent.depthKm / crossSection.maxDepth) * 240)) + 3}
                    fontSize={9.5}
                    fontWeight={700}
                    fill="#dc2626"
                  >
                    Active Event ({activeEvent.depthKm.toFixed(1)} km)
                  </text>
                </g>

                {crossSection.points.map((pt) => {
                  const x = 468 + (pt.alongKm / crossSection.maxAlong) * 410;
                  const y = 32 + (pt.depthKm / crossSection.maxDepth) * 240;
                  const r =
                    pt.item.record.magnitude !== null
                      ? Math.max(2.5, Math.min(9, pt.item.record.magnitude * 0.95))
                      : 3;
                  const isSel = selectedRecordId === pt.item.record.id;
                  return (
                    <circle
                      key={`cs-pt-${pt.item.record.id}`}
                      cx={Math.max(61, Math.min(875, x))}
                      cy={Math.max(35, Math.min(269, y))}
                      r={isSel ? r + 2 : r}
                      fill={depthToColorHex(pt.depthKm)}
                      fillOpacity={0.82}
                      stroke={isSel ? '#0f172a' : '#ffffff'}
                      strokeWidth={isSel ? 1.8 : 0.7}
                      className="cursor-pointer"
                      onClick={() => onSelectRecord(pt.item.record.id)}
                    >
                      <title>{`${pt.item.record.eventId} · Along ${pt.alongKm} km · Offset ${pt.acrossKm} km · Depth ${pt.depthKm} km`}</title>
                    </circle>
                  );
                })}
              </svg>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
