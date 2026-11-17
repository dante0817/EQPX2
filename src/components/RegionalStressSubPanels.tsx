import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, ZoomIn, ZoomOut } from 'lucide-react';
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
import {
  DEFAULT_PH_CENTER,
  EQPEvent,
  FAULT_TRACES,
  ISLAND_POLYGONS,
  isEventUnlocated,
  TECTONIC_PLATES,
} from '../data/eqpData';
import { schmidtProjectLower, Vec3 } from '../utils/focalMechanism';
import {
  loadActiveFaultsDataset,
  loadTrenchSystemsDataset,
  type ActiveFaultsDataset,
  type TrenchSystemsDataset,
} from '../utils/geologyLayers';
import {
  PreparedStressMechanism,
  RegionalStressInversionResult,
} from '../utils/regionalStress';
import {
  exportSvgElementAsPng,
  exportSvgElementAsSvg,
  HistoricalBeachballGlyph,
} from './HistoricalBeachballIcon';
import { MapScaleBar } from './MapScaleBar';

const DEG2RAD = Math.PI / 180;

function trendPlungeToVec(trendDeg: number, plungeDeg: number): Vec3 {
  const tr = trendDeg * DEG2RAD;
  const pl = plungeDeg * DEG2RAD;
  const cosPl = Math.cos(pl);
  return {
    n: cosPl * Math.cos(tr),
    e: cosPl * Math.sin(tr),
    d: Math.sin(pl),
  };
}

interface StressAxesStereonetProps {
  result: RegionalStressInversionResult;
  includedMechanisms: PreparedStressMechanism[];
  onNotice?: (msg: string) => void;
}

export const StressAxesStereonet: React.FC<StressAxesStereonetProps> = ({
  result,
  includedMechanisms,
  onNotice,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [showBootstrapCloud, setShowBootstrapCloud] = useState(true);
  const [showMechanismPT, setShowMechanismPT] = useState(true);

  const size = 320;
  const cx = size / 2;
  const cy = size / 2;
  const rSphere = 128;
  const r45 = rSphere * Math.sqrt(1 - Math.SQRT1_2);

  const projectTP = (trend: number, plunge: number) => {
    const pt = schmidtProjectLower(trendPlungeToVec(trend, plunge));
    return {
      x: cx + pt.x * rSphere,
      y: cy - pt.y * rSphere,
    };
  };

  const s1Pt = result.sigma1 ? projectTP(result.sigma1.trend, result.sigma1.plunge) : null;
  const s2Pt = result.sigma2 ? projectTP(result.sigma2.trend, result.sigma2.plunge) : null;
  const s3Pt = result.sigma3 ? projectTP(result.sigma3.trend, result.sigma3.plunge) : null;

  return (
    <div className="bg-[#edf4fc] border border-sky-700/60 rounded-lg p-3.5 space-y-2.5 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sky-700/35 pb-2">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-800">
            Lower-Hemisphere Equal-Area Stereonet (Schmidt)
          </h3>
          <p className="text-[11px] text-slate-500">
            Principal stress axes σ₁, σ₂, σ₃ with bootstrap uncertainty scatter
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <label className="inline-flex items-center gap-1 cursor-pointer text-slate-700">
            <input
              type="checkbox"
              checked={showBootstrapCloud}
              onChange={(e) => setShowBootstrapCloud(e.target.checked)}
              className="accent-blue-600"
            />
            Bootstrap Cloud
          </label>
          <label className="inline-flex items-center gap-1 cursor-pointer text-slate-700">
            <input
              type="checkbox"
              checked={showMechanismPT}
              onChange={(e) => setShowMechanismPT(e.target.checked)}
              className="accent-blue-600"
            />
            Input P/T Axes
          </label>
          <button
            type="button"
            onClick={() => {
              if (exportSvgElementAsSvg(svgRef.current, 'regional_stress_stereonet.svg')) {
                onNotice?.('Exported regional_stress_stereonet.svg');
              }
            }}
            className="px-2 py-0.5 border border-slate-300 bg-white hover:bg-slate-50 rounded-xs inline-flex items-center gap-1"
          >
            <Download className="w-3 h-3" /> SVG
          </button>
          <button
            type="button"
            onClick={() =>
              void exportSvgElementAsPng(svgRef.current, 'regional_stress_stereonet.png', 2).then(
                (ok) => ok && onNotice?.('Exported regional_stress_stereonet.png')
              )
            }
            className="px-2 py-0.5 border border-slate-300 bg-white hover:bg-slate-50 rounded-xs inline-flex items-center gap-1"
          >
            <Download className="w-3 h-3" /> PNG
          </button>
        </div>
      </div>

      <div className="flex justify-center">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${size} ${size}`}
          className="w-full max-w-[320px] h-auto select-none"
          role="img"
          aria-label="Principal stress axes lower-hemisphere stereonet"
        >
          <rect x={0} y={0} width={size} height={size} fill="#ffffff" />
          <circle
            cx={cx}
            cy={cy}
            r={rSphere}
            fill="#f8fafc"
            stroke="#0f172a"
            strokeWidth={1.6}
          />
          <circle
            cx={cx}
            cy={cy}
            r={r45}
            fill="none"
            stroke="#94a3b8"
            strokeWidth={0.8}
            strokeDasharray="3 3"
          />
          <line
            x1={cx - rSphere}
            y1={cy}
            x2={cx + rSphere}
            y2={cy}
            stroke="#cbd5e1"
            strokeWidth={0.7}
          />
          <line
            x1={cx}
            y1={cy - rSphere}
            x2={cx}
            y2={cy + rSphere}
            stroke="#cbd5e1"
            strokeWidth={0.7}
          />

          {/* Cardinal Labels */}
          <text
            x={cx}
            y={cy - rSphere - 7}
            textAnchor="middle"
            fontSize={11}
            fontWeight={700}
            fill="#0f172a"
            fontFamily="monospace"
          >
            N (0°)
          </text>
          <text
            x={cx + rSphere + 6}
            y={cy + 3.5}
            textAnchor="start"
            fontSize={10}
            fill="#475569"
            fontFamily="monospace"
          >
            E
          </text>
          <text
            x={cx}
            y={cy + rSphere + 13}
            textAnchor="middle"
            fontSize={10}
            fill="#475569"
            fontFamily="monospace"
          >
            S
          </text>
          <text
            x={cx - rSphere - 6}
            y={cy + 3.5}
            textAnchor="end"
            fontSize={10}
            fill="#475569"
            fontFamily="monospace"
          >
            W
          </text>

          {/* Optional Input Focal Mechanism P/T Axes */}
          {showMechanismPT &&
            includedMechanisms.map((m) => {
              const p = projectTP(m.mechanism.pAxis.trend, m.mechanism.pAxis.plunge);
              const t = projectTP(m.mechanism.tAxis.trend, m.mechanism.tAxis.plunge);
              return (
                <g key={`pt-${m.record.id}`} opacity={0.45}>
                  <circle cx={p.x} cy={p.y} r={2.3} fill="#fca5a5" stroke="#b91c1c" strokeWidth={0.7}>
                    <title>{`${m.record.eventId} P-axis: ${m.mechanism.pAxis.trend}°/${m.mechanism.pAxis.plunge}°`}</title>
                  </circle>
                  <circle cx={t.x} cy={t.y} r={2.3} fill="#93c5fd" stroke="#1d4ed8" strokeWidth={0.7}>
                    <title>{`${m.record.eventId} T-axis: ${m.mechanism.tAxis.trend}°/${m.mechanism.tAxis.plunge}°`}</title>
                  </circle>
                </g>
              );
            })}

          {/* Bootstrap Scatter Clouds */}
          {showBootstrapCloud && (
            <g>
              {result.bootstrapSamples.sigma1.map((s, idx) => {
                const pt = projectTP(s.trend, s.plunge);
                return (
                  <circle
                    key={`b1-${idx}`}
                    cx={pt.x}
                    cy={pt.y}
                    r={1.7}
                    fill="#dc2626"
                    fillOpacity={0.28}
                  />
                );
              })}
              {result.bootstrapSamples.sigma2.map((s, idx) => {
                const pt = projectTP(s.trend, s.plunge);
                return (
                  <circle
                    key={`b2-${idx}`}
                    cx={pt.x}
                    cy={pt.y}
                    r={1.6}
                    fill="#d97706"
                    fillOpacity={0.25}
                  />
                );
              })}
              {result.bootstrapSamples.sigma3.map((s, idx) => {
                const pt = projectTP(s.trend, s.plunge);
                return (
                  <circle
                    key={`b3-${idx}`}
                    cx={pt.x}
                    cy={pt.y}
                    r={1.7}
                    fill="#2563eb"
                    fillOpacity={0.28}
                  />
                );
              })}
            </g>
          )}

          {/* Inverted Principal Axes */}
          {s2Pt && result.sigma2 && (
            <g>
              <rect
                x={s2Pt.x - 6}
                y={s2Pt.y - 6}
                width={12}
                height={12}
                fill="#f59e0b"
                stroke="#0f172a"
                strokeWidth={1.4}
              />
              <text
                x={s2Pt.x + 9}
                y={s2Pt.y - 5}
                fontSize={10.5}
                fontWeight={700}
                fill="#92400e"
                fontFamily="monospace"
              >
                σ₂
              </text>
              <title>{`σ2: ${result.sigma2.trend}° / ${result.sigma2.plunge}° (±${result.sigma2.uncertainty95Deg}°)`}</title>
            </g>
          )}
          {s3Pt && result.sigma3 && (
            <g>
              <polygon
                points={`${s3Pt.x},${s3Pt.y + 7.5} ${s3Pt.x - 6.8},${s3Pt.y - 5} ${s3Pt.x + 6.8},${s3Pt.y - 5}`}
                fill="#2563eb"
                stroke="#0f172a"
                strokeWidth={1.4}
              />
              <text
                x={s3Pt.x + 9}
                y={s3Pt.y - 5}
                fontSize={10.5}
                fontWeight={700}
                fill="#1e3a8a"
                fontFamily="monospace"
              >
                σ₃
              </text>
              <title>{`σ3: ${result.sigma3.trend}° / ${result.sigma3.plunge}° (±${result.sigma3.uncertainty95Deg}°)`}</title>
            </g>
          )}
          {s1Pt && result.sigma1 && (
            <g>
              <polygon
                points={`${s1Pt.x},${s1Pt.y - 8} ${s1Pt.x - 7},${s1Pt.y + 5.5} ${s1Pt.x + 7},${s1Pt.y + 5.5}`}
                fill="#dc2626"
                stroke="#0f172a"
                strokeWidth={1.4}
              />
              <text
                x={s1Pt.x + 9}
                y={s1Pt.y - 5}
                fontSize={11}
                fontWeight={800}
                fill="#991b1b"
                fontFamily="monospace"
              >
                σ₁
              </text>
              <title>{`σ1: ${result.sigma1.trend}° / ${result.sigma1.plunge}° (±${result.sigma1.uncertainty95Deg}°)`}</title>
            </g>
          )}
        </svg>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-slate-600 pt-1">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 bg-red-600 border border-slate-900" />
          σ₁ (Max Compression)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 bg-amber-500 border border-slate-900" />
          σ₂ (Intermediate)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 bg-blue-600 border border-slate-900" />
          σ₃ (Min Compression)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-red-300 border border-red-700" />
          Mech P-axis
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-blue-300 border border-blue-700" />
          Mech T-axis
        </span>
      </div>
    </div>
  );
};

interface StressRegimeTernaryPlotProps {
  result: RegionalStressInversionResult;
}

export const StressRegimeTernaryPlot: React.FC<StressRegimeTernaryPlotProps> = ({ result }) => {
  if (!result.sigma1 || !result.sigma2 || !result.sigma3 || !result.regime) {
    return null;
  }

  // Frohlich (1992) ternary coordinates: f_N = sin^2(plunge_1), f_SS = sin^2(plunge_2), f_R = sin^2(plunge_3)
  // Because sigma1, sigma2, sigma3 are orthogonal unit axes, f_N + f_SS + f_R === 1 identically.
  const toTernaryPoint = (p1Deg: number, p2Deg: number, p3Deg: number) => {
    const fN = Math.sin(p1Deg * DEG2RAD) ** 2;
    const fSS = Math.sin(p2Deg * DEG2RAD) ** 2;
    const fR = Math.sin(p3Deg * DEG2RAD) ** 2;
    const sum = fN + fSS + fR || 1;
    const wN = fN / sum;
    const wSS = fSS / sum;
    const wR = fR / sum;
    // Vertices: Top = Strike-Slip (wSS=1), Bottom-Left = Normal (wN=1), Bottom-Right = Reverse (wR=1)
    const vSS = { x: 160, y: 28 };
    const vN = { x: 42, y: 232 };
    const vR = { x: 278, y: 232 };
    return {
      x: wSS * vSS.x + wN * vN.x + wR * vR.x,
      y: wSS * vSS.y + wN * vN.y + wR * vR.y,
      wN,
      wSS,
      wR,
    };
  };

  const mainPt = toTernaryPoint(
    result.sigma1.plunge,
    result.sigma2.plunge,
    result.sigma3.plunge
  );

  // Simpson A_phi gauge geometry [0..3]
  const aPhi = result.regime.simpsonAPhi;
  const [aLo, aHi] = result.regime.simpsonAPhiCI95;
  const pct = (v: number) => Math.max(0, Math.min(100, (v / 3) * 100));

  return (
    <div className="space-y-3">
      {/* Frohlich (1992) Plunge Ternary Diagram */}
      <div className="bg-[#f3f1fb] border border-indigo-700/60 rounded-lg p-3.5 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
        <div className="text-xs font-bold uppercase tracking-wide text-slate-800 border-b border-indigo-700/35 pb-1.5 mb-2">
          Principal-Axis Plunge Ternary Diagram (Frohlich-Style)
        </div>
        <div className="flex flex-col items-center">
          <svg viewBox="0 0 320 264" className="w-full max-w-[320px] h-auto select-none">
            <polygon
              points="160,28 42,232 278,232"
              fill="#f8fafc"
              stroke="#0f172a"
              strokeWidth={1.5}
            />
            {/* Sub-regime dividing lines (plunge=45 deg contours: sin^2(45)=0.5) */}
            <line x1={101} y1={130} x2={219} y2={130} stroke="#cbd5e1" strokeDasharray="3 3" />
            <line x1={160} y1={232} x2={101} y2={130} stroke="#cbd5e1" strokeDasharray="3 3" />
            <line x1={160} y1={232} x2={219} y2={130} stroke="#cbd5e1" strokeDasharray="3 3" />

            <text x={160} y={18} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="#0f172a">
              Strike-Slip (σ₂ Vertical)
            </text>
            <text x={32} y={248} textAnchor="start" fontSize={10.5} fontWeight={700} fill="#1d4ed8">
              Normal (σ₁ Vertical)
            </text>
            <text x={288} y={248} textAnchor="end" fontSize={10.5} fontWeight={700} fill="#b91c1c">
              Reverse (σ₃ Vertical)
            </text>

            <text x={160} y={102} textAnchor="middle" fontSize={9} fill="#64748b" fontFamily="monospace">
              SS
            </text>
            <text x={94} y={204} textAnchor="middle" fontSize={9} fill="#64748b" fontFamily="monospace">
              NF
            </text>
            <text x={226} y={204} textAnchor="middle" fontSize={9} fill="#64748b" fontFamily="monospace">
              TF
            </text>
            <text x={160} y={170} textAnchor="middle" fontSize={8.5} fill="#64748b" fontFamily="monospace">
              Oblique / Trans.
            </text>

            <circle
              cx={mainPt.x}
              cy={mainPt.y}
              r={6.5}
              fill="#0f172a"
              stroke="#ffffff"
              strokeWidth={1.8}
            />
          </svg>
          <div className="text-[11px] font-mono tabular-nums text-slate-600 text-center">
            sin²(plunge): σ₁={(mainPt.wN * 100).toFixed(0)}% · σ₂={(mainPt.wSS * 100).toFixed(0)}% · σ₃={(mainPt.wR * 100).toFixed(0)}%
          </div>
        </div>
      </div>

      {/* Simpson (1997) A_phi Continuum */}
      <div className="bg-[#fbf5ea] border border-amber-700/60 rounded-lg p-3.5 space-y-2 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold uppercase tracking-wide text-slate-800">
            Simpson (1997) Faulting Regime Continuum (Aφ = {aPhi.toFixed(2)})
          </span>
          <span className="font-mono tabular-nums text-[11px] text-slate-600">
            95% CI: [{aLo.toFixed(2)}, {aHi.toFixed(2)}]
          </span>
        </div>
        <div className="relative h-6 rounded-xs border border-slate-300 overflow-hidden bg-gradient-to-r from-blue-100 via-amber-100 to-red-100">
          {/* 95% CI band */}
          <div
            className="absolute top-0 bottom-0 bg-slate-900/15 border-x border-slate-700/40"
            style={{ left: `${pct(aLo)}%`, width: `${Math.max(1, pct(aHi) - pct(aLo))}%` }}
          />
          {/* Regime dividers */}
          <div className="absolute top-0 bottom-0 left-1/3 w-px bg-slate-400" />
          <div className="absolute top-0 bottom-0 left-2/3 w-px bg-slate-400" />
          {/* Best-fit marker */}
          <div
            className="absolute top-0 bottom-0 w-1 bg-slate-900"
            style={{ left: `calc(${pct(aPhi)}% - 2px)` }}
          />
        </div>
        <div className="grid grid-cols-3 text-[10.5px] font-mono text-slate-600">
          <div>0.0–1.0 Normal (NF/NS)</div>
          <div className="text-center">1.0–2.0 Strike-Slip (SS)</div>
          <div className="text-right">2.0–3.0 Reverse (TS/TF)</div>
        </div>
      </div>
    </div>
  );
};

interface StressOrientationMapViewProps {
  activeEvent: EQPEvent;
  preparationIncluded: PreparedStressMechanism[];
  preparationExcluded: PreparedStressMechanism[];
  result: RegionalStressInversionResult | null;
  onNotice?: (msg: string) => void;
}

export const StressOrientationMapView: React.FC<StressOrientationMapViewProps> = ({
  activeEvent,
  preparationIncluded,
  preparationExcluded,
  result,
  onNotice,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const unlocated = isEventUnlocated(activeEvent);
  const [showBeachballs, setShowBeachballs] = useState(true);
  const [showExcluded, setShowExcluded] = useState(true);
  const [showGisFaults, setShowGisFaults] = useState(true);
  const [zoomSpanDeg, setZoomSpanDeg] = useState<number>(3.8);
  const [panOffset, setPanOffset] = useState<{ dLat: number; dLon: number }>({ dLat: 0, dLon: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Lazy-load real GIS Active Faults & Trench Systems from public/data/geology/
  const [activeFaults, setActiveFaults] = useState<ActiveFaultsDataset | null>(null);
  const [trenches, setTrenches] = useState<TrenchSystemsDataset | null>(null);

  useEffect(() => {
    let alive = true;
    void loadActiveFaultsDataset()
      .then((d) => alive && setActiveFaults(d))
      .catch(() => {});
    void loadTrenchSystemsDataset()
      .then((d) => alive && setTrenches(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const summary = result?.datasetSummary;
  const anchorLat =
    summary?.centroidLat ??
    summary?.centerLat ??
    (unlocated ? DEFAULT_PH_CENTER.lat : activeEvent.lat);
  const anchorLon =
    summary?.centroidLon ??
    summary?.centerLon ??
    (unlocated ? DEFAULT_PH_CENTER.lon : activeEvent.lon);

  const MAP_W = 760;
  const MAP_H = 500;

  const mapBounds = useMemo(() => {
    const centerLat = anchorLat + panOffset.dLat;
    const centerLon = anchorLon + panOffset.dLon;
    const halfLat = zoomSpanDeg * 0.5;
    const cosLat = Math.max(0.35, Math.cos(centerLat * DEG2RAD));
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
  }, [anchorLat, anchorLon, panOffset, zoomSpanDeg]);

  const projectCoord = useCallback(
    (lat: number, lon: number) => ({
      x: ((lon - mapBounds.minLon) / (mapBounds.maxLon - mapBounds.minLon)) * MAP_W,
      y: ((mapBounds.maxLat - lat) / (mapBounds.maxLat - mapBounds.minLat)) * MAP_H,
    }),
    [mapBounds]
  );

  const metersPerPixel = useMemo(() => {
    const latSpanMeters = (mapBounds.maxLat - mapBounds.minLat) * 110_574;
    return latSpanMeters / MAP_H;
  }, [mapBounds]);

  const radiusKm = summary?.effectiveRadiusKm ?? null;
  const radiusCenter =
    summary?.centerLat != null && summary?.centerLon != null
      ? { lat: summary.centerLat, lon: summary.centerLon }
      : null;

  const selectedMech = useMemo(
    () =>
      [...preparationIncluded, ...preparationExcluded].find((m) => m.record.id === selectedId) ??
      null,
    [preparationIncluded, preparationExcluded, selectedId]
  );

  // Convex/bounding box of included events to display spatial coverage
  const boundingBoxPx = useMemo(() => {
    if (preparationIncluded.length < 2) return null;
    let minLa = 90;
    let maxLa = -90;
    let minLo = 180;
    let maxLo = -180;
    for (const m of preparationIncluded) {
      if (m.record.lat < minLa) minLa = m.record.lat;
      if (m.record.lat > maxLa) maxLa = m.record.lat;
      if (m.record.lon < minLo) minLo = m.record.lon;
      if (m.record.lon > maxLo) maxLo = m.record.lon;
    }
    const nw = projectCoord(maxLa, minLo);
    const se = projectCoord(minLa, maxLo);
    return {
      x: nw.x,
      y: nw.y,
      w: Math.max(8, se.x - nw.x),
      h: Math.max(8, se.y - nw.y),
    };
  }, [preparationIncluded, projectCoord]);

  return (
    <div className="space-y-3">
      <div className="bg-blue-50 border border-blue-200 rounded-sm px-3 py-2 text-xs text-blue-950">
        <strong>Single Homogeneous Regional Stress Representation:</strong> The stress orientation
        glyph plotted at the mechanism centroid represents <strong>one uniform stress tensor</strong>{' '}
        estimated across the selected earthquake volume — never a spatially varying stress field.
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
        <div className="xl:col-span-9 bg-[#edf4fc] border border-sky-700/60 rounded-lg overflow-hidden flex flex-col shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
          <div className="px-3 py-2 border-b border-sky-700/40 bg-[#dce9f8] flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-bold text-slate-800">
              Regional Stress Orientation &amp; Mechanism Coverage Map
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
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
                  checked={showExcluded}
                  onChange={(e) => setShowExcluded(e.target.checked)}
                />
                Excluded/Dup
              </label>
              <label className="inline-flex items-center gap-1 cursor-pointer text-slate-700">
                <input
                  type="checkbox"
                  checked={showGisFaults}
                  onChange={(e) => setShowGisFaults(e.target.checked)}
                />
                Faults/Trenches
              </label>
              <button
                type="button"
                onClick={() => setZoomSpanDeg((z) => Math.max(0.5, Number((z * 0.72).toFixed(2))))}
                className="p-1 border border-slate-300 bg-white rounded-xs hover:bg-slate-100"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoomSpanDeg((z) => Math.min(18, Number((z * 1.38).toFixed(2))))}
                className="p-1 border border-slate-300 bg-white rounded-xs hover:bg-slate-100"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setZoomSpanDeg(3.8);
                  setPanOffset({ dLat: 0, dLon: 0 });
                }}
                className="px-1.5 py-0.5 border border-slate-300 bg-white rounded-xs hover:bg-slate-100 font-medium"
              >
                Center
              </button>
              <button
                type="button"
                onClick={() => {
                  if (exportSvgElementAsSvg(svgRef.current, 'regional_stress_map.svg')) {
                    onNotice?.('Exported regional_stress_map.svg');
                  }
                }}
                className="px-1.5 py-0.5 border border-slate-300 bg-white rounded-xs hover:bg-slate-100 inline-flex items-center gap-1"
              >
                <Download className="w-3 h-3" /> SVG
              </button>
              <button
                type="button"
                onClick={() =>
                  void exportSvgElementAsPng(svgRef.current, 'regional_stress_map.png', 2).then(
                    (ok) => ok && onNotice?.('Exported regional_stress_map.png')
                  )
                }
                className="px-1.5 py-0.5 border border-slate-300 bg-white rounded-xs hover:bg-slate-100 inline-flex items-center gap-1"
              >
                <Download className="w-3 h-3" /> PNG
              </button>
            </div>
          </div>

          <div
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
              const startOffset = { ...panOffset };
              const rect = downEv.currentTarget.getBoundingClientRect();
              const onMove = (moveEv: MouseEvent) => {
                const dxFrac = (moveEv.clientX - startX) / Math.max(100, rect.width);
                const dyFrac = (moveEv.clientY - startY) / Math.max(100, rect.height);
                setPanOffset({
                  dLon: startOffset.dLon - dxFrac * (mapBounds.maxLon - mapBounds.minLon),
                  dLat: startOffset.dLat + dyFrac * (mapBounds.maxLat - mapBounds.minLat),
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
              ref={svgRef}
              viewBox={`0 0 ${MAP_W} ${MAP_H}`}
              className="w-full h-auto block select-none"
            >
              <rect x={0} y={0} width={MAP_W} height={MAP_H} fill="#e0f2fe" />

              {/* Philippine Island Polygons */}
              {ISLAND_POLYGONS.map((poly, idx) => {
                const pts = poly.points
                  .map(([lon, lat]) => {
                    const p = projectCoord(lat, lon);
                    return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
                  })
                  .join(' ');
                return (
                  <polygon
                    key={`isl-${idx}`}
                    points={pts}
                    fill="#f8fafc"
                    stroke="#94a3b8"
                    strokeWidth={0.8}
                  />
                );
              })}

              {/* Tectonic Plates */}
              {showGisFaults &&
                TECTONIC_PLATES.map((pl, idx) => {
                  const pts = pl.points
                    .map(([lon, lat]) => {
                      const p = projectCoord(lat, lon);
                      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
                    })
                    .join(' ');
                  return (
                    <polyline
                      key={`plt-${idx}`}
                      points={pts}
                      fill="none"
                      stroke="#6366f1"
                      strokeOpacity={0.35}
                      strokeWidth={1.1}
                      strokeDasharray="6 4"
                    />
                  );
                })}

              {/* Context Fault Traces + Real GIS Active Faults & Trenches */}
              {showGisFaults &&
                FAULT_TRACES.map((fl, idx) => {
                  const pts = fl.points
                    .map(([lon, lat]) => {
                      const p = projectCoord(lat, lon);
                      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
                    })
                    .join(' ');
                  return (
                    <polyline
                      key={`flt-${idx}`}
                      points={pts}
                      fill="none"
                      stroke="#b45309"
                      strokeWidth={1}
                      strokeOpacity={0.55}
                    >
                      <title>{fl.name}</title>
                    </polyline>
                  );
                })}

              {showGisFaults &&
                activeFaults?.features.slice(0, 1200).flatMap((f, idx) => {
                  const lines =
                    f.geometry.type === 'LineString'
                      ? [f.geometry.coordinates]
                      : f.geometry.coordinates;
                  return lines.map((line, lIdx) => {
                    const ptStr = line
                      .map(([lon, lat]) => {
                        const p = projectCoord(lat, lon);
                        return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
                      })
                      .join(' ');
                    return (
                      <polyline
                        key={`gisf-${idx}-${lIdx}`}
                        points={ptStr}
                        fill="none"
                        stroke="#e11d48"
                        strokeWidth={0.9}
                        strokeOpacity={f.isUncertainTrace ? 0.35 : 0.55}
                        strokeDasharray={f.isUncertainTrace ? '3 2' : undefined}
                      />
                    );
                  });
                })}

              {showGisFaults &&
                trenches?.features.flatMap((t, idx) => {
                  const lines =
                    t.geometry.type === 'LineString'
                      ? [t.geometry.coordinates]
                      : t.geometry.coordinates;
                  return lines.map((line, lIdx) => {
                    const ptStr = line
                      .map(([lon, lat]) => {
                        const p = projectCoord(lat, lon);
                        return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
                      })
                      .join(' ');
                    return (
                      <polyline
                        key={`gist-${idx}-${lIdx}`}
                        points={ptStr}
                        fill="none"
                        stroke="#4338ca"
                        strokeWidth={1.4}
                        strokeOpacity={0.6}
                        strokeDasharray="5 3"
                      />
                    );
                  });
                })}

              {/* Lat/Lon Grid */}
              {(() => {
                const step = zoomSpanDeg <= 1.5 ? 0.5 : zoomSpanDeg <= 4.5 ? 1 : 2;
                const nodes: React.ReactNode[] = [];
                for (
                  let lat = Math.floor(mapBounds.minLat / step) * step;
                  lat <= mapBounds.maxLat;
                  lat += step
                ) {
                  const y = projectCoord(lat, mapBounds.centerLon).y;
                  nodes.push(
                    <g key={`glat-${lat.toFixed(2)}`}>
                      <line x1={0} y1={y} x2={MAP_W} y2={y} stroke="#94a3b8" strokeOpacity={0.25} />
                      <text x={6} y={y - 3} fontSize={9} fill="#475569" fontFamily="monospace">
                        {lat.toFixed(1)}°N
                      </text>
                    </g>
                  );
                }
                for (
                  let lon = Math.floor(mapBounds.minLon / step) * step;
                  lon <= mapBounds.maxLon;
                  lon += step
                ) {
                  const x = projectCoord(mapBounds.centerLat, lon).x;
                  nodes.push(
                    <g key={`glon-${lon.toFixed(2)}`}>
                      <line x1={x} y1={0} x2={x} y2={MAP_H} stroke="#94a3b8" strokeOpacity={0.25} />
                      <text x={x + 3} y={MAP_H - 6} fontSize={9} fill="#475569" fontFamily="monospace">
                        {lon.toFixed(1)}°E
                      </text>
                    </g>
                  );
                }
                return nodes;
              })()}

              {/* Selection Radius Circle */}
              {radiusCenter && radiusKm !== null && (() => {
                const cPx = projectCoord(radiusCenter.lat, radiusCenter.lon);
                const dLat = radiusKm / 110.574;
                const dLon = radiusKm / (111.32 * mapBounds.cosLat);
                const rx = (dLon / (mapBounds.maxLon - mapBounds.minLon)) * MAP_W;
                const ry = (dLat / (mapBounds.maxLat - mapBounds.minLat)) * MAP_H;
                return (
                  <ellipse
                    cx={cPx.x}
                    cy={cPx.y}
                    rx={rx}
                    ry={ry}
                    fill="#1d4ed8"
                    fillOpacity={0.04}
                    stroke="#1d4ed8"
                    strokeWidth={1.3}
                    strokeDasharray="6 4"
                  />
                );
              })()}

              {/* Spatial Aperture Box of Included Mechanisms */}
              {boundingBoxPx && (
                <rect
                  x={boundingBoxPx.x}
                  y={boundingBoxPx.y}
                  width={boundingBoxPx.w}
                  height={boundingBoxPx.h}
                  fill="none"
                  stroke="#0f766e"
                  strokeWidth={1.1}
                  strokeDasharray="3 3"
                />
              )}

              {/* Excluded / Duplicate Mechanisms (Muted) */}
              {showExcluded &&
                preparationExcluded.map((item) => {
                  const pt = projectCoord(item.record.lat, item.record.lon);
                  const isSel = selectedId === item.record.id;
                  return (
                    <circle
                      key={`ex-${item.record.id}`}
                      cx={pt.x}
                      cy={pt.y}
                      r={isSel ? 5.5 : 4}
                      fill="#cbd5e1"
                      stroke="#64748b"
                      strokeWidth={1}
                      className="cursor-pointer"
                      onClick={() => setSelectedId(item.record.id)}
                    >
                      <title>{`Excluded: ${item.record.eventId} (${item.exclusionReason})`}</title>
                    </circle>
                  );
                })}

              {/* Included Focal Mechanisms */}
              {preparationIncluded.map((item) => {
                const pt = projectCoord(item.record.lat, item.record.lon);
                const isSel = selectedId === item.record.id;
                if (showBeachballs) {
                  return (
                    <HistoricalBeachballGlyph
                      key={`inc-${item.record.id}`}
                      plane1={item.plane1}
                      cx={pt.x}
                      cy={pt.y}
                      radius={isSel ? 13 : 10}
                      provenanceKind={item.mechanism.provenanceKind}
                      isSelected={isSel}
                      onClick={() => setSelectedId(item.record.id)}
                      title={`${item.record.eventId} (${item.record.dataSource}, Q:${item.mechanism.quality}) · ${item.mechanism.mechanismClass}`}
                    />
                  );
                }
                return (
                  <circle
                    key={`inc-${item.record.id}`}
                    cx={pt.x}
                    cy={pt.y}
                    r={isSel ? 6.5 : 5}
                    fill="#1d4ed8"
                    stroke="#ffffff"
                    strokeWidth={1.2}
                    className="cursor-pointer"
                    onClick={() => setSelectedId(item.record.id)}
                  >
                    <title>{`${item.record.eventId} · ${item.mechanism.mechanismClass}`}</title>
                  </circle>
                );
              })}

              {/* Active EQP Event Reference Star */}
              {!unlocated && (() => {
                const p = projectCoord(activeEvent.lat, activeEvent.lon);
                const starPts = Array.from({ length: 10 }, (_, idx) => {
                  const angle = (idx * Math.PI) / 5 - Math.PI / 2;
                  const rad = idx % 2 === 0 ? 9 : 4;
                  return `${(p.x + rad * Math.cos(angle)).toFixed(1)},${(p.y + rad * Math.sin(angle)).toFixed(1)}`;
                }).join(' ');
                return (
                  <polygon points={starPts} fill="#f59e0b" stroke="#0f172a" strokeWidth={1.1}>
                    <title>{`Active EQP Reference Event: ${activeEvent.filename}`}</title>
                  </polygon>
                );
              })()}

              {/* Single Centroid Regional Stress Orientation Glyph */}
              {result &&
                result.status !== 'Insufficient Data' &&
                summary?.centroidLat != null &&
                summary?.centroidLon != null &&
                (() => {
                  const c = projectCoord(summary.centroidLat, summary.centroidLon);
                  const shAz = result.shMaxAzimuthDeg;
                  const s1 = result.sigma1;
                  const s3 = result.sigma3;
                  return (
                    <g pointerEvents="none">
                      <circle
                        cx={c.x}
                        cy={c.y}
                        r={34}
                        fill="#ffffff"
                        fillOpacity={0.78}
                        stroke="#0f172a"
                        strokeWidth={1.4}
                      />
                      {/* SHmax inward compression arrows (if horizontally defined) */}
                      {result.shMaxDefined && shAz !== null ? (
                        (() => {
                          const rad = shAz * DEG2RAD;
                          const dx = Math.sin(rad);
                          const dy = -Math.cos(rad);
                          const len = 30;
                          const perpX = -dy;
                          const perpY = dx;
                          return (
                            <g>
                              <line
                                x1={c.x - dx * len}
                                y1={c.y - dy * len}
                                x2={c.x + dx * len}
                                y2={c.y + dy * len}
                                stroke="#dc2626"
                                strokeWidth={3}
                              />
                              {/* Inward arrowheads */}
                              <polygon
                                points={`${c.x + dx * 12},${c.y + dy * 12} ${c.x + dx * 21 + perpX * 4},${c.y + dy * 21 + perpY * 4} ${c.x + dx * 21 - perpX * 4},${c.y + dy * 21 - perpY * 4}`}
                                fill="#dc2626"
                              />
                              <polygon
                                points={`${c.x - dx * 12},${c.y - dy * 12} ${c.x - dx * 21 + perpX * 4},${c.y - dy * 21 + perpY * 4} ${c.x - dx * 21 - perpX * 4},${c.y - dy * 21 - perpY * 4}`}
                                fill="#dc2626"
                              />
                              {/* Orthogonal SHmin dashed axis */}
                              <line
                                x1={c.x - perpX * 18}
                                y1={c.y - perpY * 18}
                                x2={c.x + perpX * 18}
                                y2={c.y + perpY * 18}
                                stroke="#2563eb"
                                strokeWidth={1.6}
                                strokeDasharray="3 2"
                              />
                            </g>
                          );
                        })()
                      ) : (
                        <circle
                          cx={c.x}
                          cy={c.y}
                          r={14}
                          fill="none"
                          stroke="#475569"
                          strokeWidth={1.8}
                          strokeDasharray="3 2"
                        />
                      )}
                      <text
                        x={c.x}
                        y={c.y + 47}
                        textAnchor="middle"
                        fontSize={10}
                        fontWeight={700}
                        fill="#0f172a"
                        fontFamily="monospace"
                      >
                        {result.shMaxDefined && shAz !== null
                          ? `SHmax ${shAz.toFixed(0)}° · ${result.regime?.zobackCode ?? ''}`
                          : `${result.regime?.regimeClass ?? 'Isotropic Horiz.'}`}
                      </text>
                      {s1 && s3 && (
                        <text
                          x={c.x}
                          y={c.y + 58}
                          textAnchor="middle"
                          fontSize={9}
                          fill="#334155"
                          fontFamily="monospace"
                        >
                          σ₁ {s1.trend}°/{s1.plunge}° · σ₃ {s3.trend}°/{s3.plunge}°
                        </text>
                      )}
                    </g>
                  );
                })()}
            </svg>

            <div className="absolute bottom-2.5 left-2.5">
              <MapScaleBar metersPerPixel={metersPerPixel} compact />
            </div>
          </div>

          <div className="px-3 py-2 border-t border-sky-700/35 bg-[#dce9f8] flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-700">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-3 h-1 bg-red-600" />
              Centroid SHmax (Lund &amp; Townend 2007)
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-3 h-0.5 border-t-2 border-dashed border-blue-600" />
              Selection Radius
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-3 h-2.5 border border-dashed border-teal-700" />
              Mechanism Spatial Extent
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-300 border border-slate-500" />
              Excluded / Duplicate
            </span>
          </div>
        </div>

        {/* Map Context Sidebar */}
        <div className="xl:col-span-3 bg-[#f1f4f9] border border-slate-600/70 rounded-lg p-3.5 space-y-3 text-xs shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-800 border-b border-slate-600/40 pb-1.5">
            Spatial Context &amp; Inspector
          </h3>
          <div className="space-y-1.5 font-mono tabular-nums text-[11px] bg-[#dfe6f0] border border-slate-700/60 p-2.5 rounded">
            <div>
              <span className="text-slate-500">Included Mechanisms:</span>{' '}
              <strong>{preparationIncluded.length}</strong>
            </div>
            <div>
              <span className="text-slate-500">Centroid:</span>{' '}
              {summary?.centroidLat != null && summary?.centroidLon != null
                ? `${summary.centroidLat.toFixed(3)}°N, ${summary.centroidLon.toFixed(3)}°E`
                : '—'}
            </div>
            <div>
              <span className="text-slate-500">Spatial Aperture:</span>{' '}
              {summary ? `${summary.spatialSpanKm} km` : '—'}
            </div>
            <div>
              <span className="text-slate-500">Depth Range:</span>{' '}
              {summary?.depthMinKm != null && summary?.depthMaxKm != null
                ? `${summary.depthMinKm.toFixed(1)}–${summary.depthMaxKm.toFixed(1)} km`
                : 'Unavailable'}
            </div>
          </div>

          {selectedMech ? (
            <div className="space-y-1.5 border-t border-slate-200 pt-2 text-[11px]">
              <div className="font-mono font-bold text-slate-900">
                {selectedMech.record.eventId}
              </div>
              <div className="text-slate-600">{selectedMech.record.place || 'Unspecified location'}</div>
              <div className="font-mono text-slate-700">
                {selectedMech.record.originTimeUtc.slice(0, 19)} UTC
              </div>
              <div className="font-mono text-slate-700">
                NP1: {selectedMech.plane1.strike}/{selectedMech.plane1.dip}/{selectedMech.plane1.rake}
              </div>
              <div className="font-mono text-slate-700">
                NP2: {selectedMech.plane2.strike}/{selectedMech.plane2.dip}/{selectedMech.plane2.rake}
              </div>
              <div className="text-slate-600">
                {selectedMech.mechanism.provenanceKind} · Grade {selectedMech.mechanism.quality} ·{' '}
                {selectedMech.record.dataSource}
              </div>
              {selectedMech.exclusionReason && (
                <div className="p-1.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-xs">
                  {selectedMech.exclusionReason}
                </div>
              )}
            </div>
          ) : (
            <div className="text-[11px] text-slate-500 py-4 text-center">
              Click any beachball or marker on the map to inspect its focal mechanism and provenance.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface StressMisfitBarChartProps {
  result: RegionalStressInversionResult;
}

export const StressMisfitBarChart: React.FC<StressMisfitBarChartProps> = ({ result }) => {
  if (result.mechanismFits.length === 0) return null;

  const data = result.mechanismFits.map((f) => ({
    name: f.eventId.length > 10 ? `${f.eventId.slice(0, 9)}…` : f.eventId,
    fullId: f.eventId,
    misfit: f.selectedMisfitDeg,
    ambiguous: f.planeAmbiguous,
  }));

  return (
    <div className="bg-[#f3f1fb] border border-indigo-700/60 rounded-lg p-3.5 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
      <div className="flex items-center justify-between border-b border-indigo-700/35 pb-1.5 mb-2">
        <div className="text-xs font-bold uppercase tracking-wide text-slate-800">
          Per-Mechanism Slip Misfit Angle (β = ∠(τ_pred, s_obs))
        </div>
        <div className="text-[11px] text-slate-500 font-mono">
          Reference threshold: 30°
        </div>
      </div>
      <div className="h-[210px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 10, fill: '#475569' }}
              angle={-25}
              textAnchor="end"
              height={42}
            />
            <YAxis
              domain={[0, 90]}
              tick={{ fontSize: 10, fill: '#475569' }}
              unit="°"
            />
            <Tooltip
              formatter={(value) => [
                typeof value === 'number' ? `${value.toFixed(1)}°` : String(value ?? ''),
                'Slip Misfit β',
              ]}
              labelFormatter={(_l, payload) =>
                payload?.[0]?.payload?.fullId ? `Event ${payload[0].payload.fullId}` : ''
              }
            />
            <ReferenceLine y={30} stroke="#b45309" strokeDasharray="4 4" />
            <Bar dataKey="misfit" radius={[2, 2, 0, 0]}>
              {data.map((entry, idx) => (
                <Cell
                  key={`cell-${idx}`}
                  fill={entry.misfit > 35 ? '#dc2626' : entry.misfit > 20 ? '#d97706' : '#1d4ed8'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
