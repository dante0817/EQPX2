import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, ZoomIn, ZoomOut } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import {
  DEFAULT_PH_CENTER,
  EQPEvent,
  FAULT_TRACES,
  ISLAND_POLYGONS,
  isEventUnlocated,
  TECTONIC_PLATES,
} from '../data/eqpData';
import {
  loadActiveFaultsDataset,
  loadTrenchSystemsDataset,
  type ActiveFaultsDataset,
  type TrenchSystemsDataset,
} from '../utils/geologyLayers';
import {
  HorizontalStrainResult,
  PreparedGeodeticObservation,
  StrainAnalysisQuantity,
} from '../utils/geodeticStrain';
import {
  exportSvgElementAsPng,
  exportSvgElementAsSvg,
} from './HistoricalBeachballIcon';
import { MapScaleBar } from './MapScaleBar';

const DEG2RAD = Math.PI / 180;

/* -------------------------------------------------------------------------- */
/* 1. Principal Strain Cross & Mohr's Circle of Strain (SVG + PNG Export)     */
/* -------------------------------------------------------------------------- */

interface StrainPrincipalGlyphProps {
  result: HorizontalStrainResult;
  onNotice?: (msg: string) => void;
}

export const StrainPrincipalAxesGlyph: React.FC<StrainPrincipalGlyphProps> = ({
  result,
  onNotice,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const unitShort = result.analysisQuantity === 'velocity-strain-rate' ? 'nε/yr' : 'με';
  const hasValid = result.status !== 'Insufficient Data';

  const W = 560;
  const H = 260;

  // Left: Principal strain cross (cx1=135, cy1=130)
  const cx1 = 135;
  const cy1 = 130;
  const maxArm = 72;
  const maxAbsPrin = Math.max(Math.abs(result.e1), Math.abs(result.e2), 1e-6);
  const len1 = Math.max(18, (Math.abs(result.e1) / maxAbsPrin) * maxArm);
  const len2 = Math.max(18, (Math.abs(result.e2) / maxAbsPrin) * maxArm);

  const az1Rad = result.e1AzimuthDeg * DEG2RAD;
  const az2Rad = result.e2AzimuthDeg * DEG2RAD;
  const u1x = Math.sin(az1Rad);
  const u1y = -Math.cos(az1Rad);
  const u2x = Math.sin(az2Rad);
  const u2y = -Math.cos(az2Rad);

  // Right: Mohr Circle (cx2=415, cy2=130)
  const cx2 = 415;
  const cy2 = 130;
  const mohrMaxR = 72;
  const meanE = 0.5 * (result.exx + result.eyy);
  const mohrScaleMax = Math.max(Math.abs(result.e1), Math.abs(result.e2), result.maxShearEngineering * 0.5, 1e-6) * 1.25;
  const toMohrX = (val: number) => cx2 + (val / mohrScaleMax) * mohrMaxR;
  const toMohrY = (val: number) => cy2 - (val / mohrScaleMax) * mohrMaxR;
  const mohrR = (0.5 * result.maxShearEngineering / mohrScaleMax) * mohrMaxR;
  const mohrCx = toMohrX(meanE);

  const renderAxisArrows = (
    ux: number,
    uy: number,
    len: number,
    val: number,
    color: string,
    label: string
  ) => {
    const isExt = val >= 0;
    const drawHalf = (sign: 1 | -1) => {
      const dx = sign * ux;
      const dy = sign * uy;
      const xEnd = cx1 + dx * len;
      const yEnd = cy1 + dy * len;
      // Perpendicular
      const px = -dy;
      const py = dx;
      const tipX = isExt ? xEnd : cx1 + dx * Math.max(8, len * 0.22);
      const tipY = isExt ? yEnd : cy1 + dy * Math.max(8, len * 0.22);
      const backDir = isExt ? -1 : 1;
      const headLen = 9;
      const headW = 5;
      const hx1 = tipX + backDir * dx * headLen + px * headW;
      const hy1 = tipY + backDir * dy * headLen + py * headW;
      const hx2 = tipX + backDir * dx * headLen - px * headW;
      const hy2 = tipY + backDir * dy * headLen - py * headW;
      return (
        <g key={`${label}-${sign}`}>
          <line x1={cx1} y1={cy1} x2={xEnd} y2={yEnd} stroke={color} strokeWidth={2.8} />
          <polygon points={`${tipX},${tipY} ${hx1},${hy1} ${hx2},${hy2}`} fill={color} />
        </g>
      );
    };
    return (
      <g>
        {drawHalf(1)}
        {drawHalf(-1)}
        <text
          x={cx1 + ux * (len + 16)}
          y={cy1 + uy * (len + 16)}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={10.5}
          fontWeight={700}
          fill={color}
        >
          {label}
        </text>
      </g>
    );
  };

  return (
    <div className="bg-[#edf4fc] border border-sky-700/60 rounded-lg p-3.5 space-y-2.5 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sky-700/35 pb-2">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-800">
            Principal Strain Orientation & Mohr&apos;s Circle
          </h3>
          <p className="text-[11px] text-slate-600">
            Outward arrows = extension (+); inward arrows = shortening (−).
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={!hasValid}
            onClick={() => {
              if (exportSvgElementAsSvg(svgRef.current, 'strain_principal_axes.svg')) {
                onNotice?.('Exported strain_principal_axes.svg');
              }
            }}
            className="px-2 py-1 text-[11px] border border-sky-800/55 bg-[#dce9f8] rounded hover:bg-[#cde0f5] disabled:opacity-40 inline-flex items-center gap-1 font-medium"
          >
            <Download className="w-3 h-3" /> SVG
          </button>
          <button
            type="button"
            disabled={!hasValid}
            onClick={() =>
              void exportSvgElementAsPng(svgRef.current, 'strain_principal_axes.png', 2).then(
                (ok) => ok && onNotice?.('Exported strain_principal_axes.png')
              )
            }
            className="px-2 py-1 text-[11px] border border-sky-800/55 bg-[#dce9f8] rounded hover:bg-[#cde0f5] disabled:opacity-40 inline-flex items-center gap-1 font-medium"
          >
            <Download className="w-3 h-3" /> PNG
          </button>
        </div>
      </div>

      {!hasValid ? (
        <div className="p-6 text-center text-xs text-slate-600 border border-dashed border-sky-800/60 rounded bg-[#dce9f8]">
          Principal strain diagram unavailable ({result.status}).
        </div>
      ) : (
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-white border border-sky-800/45 rounded select-none">
          {/* Left Panel: Principal Axes Compass */}
          <text x={cx1} y={18} textAnchor="middle" fontSize={11} fontWeight={700} fill="#1e293b">
            Principal Axes (Map View)
          </text>
          <circle
            cx={cx1}
            cy={cy1}
            r={92}
            fill="#f8fafc"
            stroke="#cbd5e1"
            strokeWidth={1.2}
          />
          <line x1={cx1 - 92} y1={cy1} x2={cx1 + 92} y2={cy1} stroke="#e2e8f0" strokeDasharray="3 3" />
          <line x1={cx1} y1={cy1 - 92} x2={cx1} y2={cy1 + 92} stroke="#e2e8f0" strokeDasharray="3 3" />
          <text x={cx1} y={cy1 - 99} textAnchor="middle" fontSize={10} fontWeight={700} fill="#475569">
            N
          </text>
          <text x={cx1 + 100} y={cy1 + 3} textAnchor="start" fontSize={10} fontWeight={700} fill="#475569">
            E
          </text>

          {renderAxisArrows(
            u1x,
            u1y,
            len1,
            result.e1,
            result.e1 >= 0 ? '#0284c7' : '#dc2626',
            `ε1 (${result.e1 >= 0 ? '+' : ''}${result.e1.toFixed(1)})`
          )}
          {renderAxisArrows(
            u2x,
            u2y,
            len2,
            result.e2,
            result.e2 >= 0 ? '#0284c7' : '#dc2626',
            `ε2 (${result.e2 >= 0 ? '+' : ''}${result.e2.toFixed(1)})`
          )}
          <circle cx={cx1} cy={cy1} r={3} fill="#0f172a" />

          {/* Divider */}
          <line x1={275} y1={24} x2={275} y2={242} stroke="#e2e8f0" />

          {/* Right Panel: Mohr's Circle */}
          <text x={cx2} y={18} textAnchor="middle" fontSize={11} fontWeight={700} fill="#1e293b">
            2D Mohr&apos;s Circle ({unitShort})
          </text>
          <rect x={305} y={32} width={220} height={196} fill="#f8fafc" stroke="#e2e8f0" rx={2} />
          <line x1={312} y1={cy2} x2={520} y2={cy2} stroke="#94a3b8" strokeWidth={1} />
          <line x1={cx2} y1={40} x2={cx2} y2={220} stroke="#94a3b8" strokeWidth={1} />
          <text x={516} y={cy2 - 5} textAnchor="end" fontSize={9.5} fill="#475569">
            ε_n (+ext)
          </text>
          <text x={cx2 + 5} y={48} fontSize={9.5} fill="#475569">
            ε_xy
          </text>

          <circle
            cx={mohrCx}
            cy={cy2}
            r={Math.max(2, mohrR)}
            fill="#0284c7"
            fillOpacity={0.08}
            stroke="#0f172a"
            strokeWidth={1.6}
          />
          <line
            x1={toMohrX(result.exx)}
            y1={toMohrY(result.exy)}
            x2={toMohrX(result.eyy)}
            y2={toMohrY(-result.exy)}
            stroke="#475569"
            strokeDasharray="3 2"
          />
          <circle cx={toMohrX(result.exx)} cy={toMohrY(result.exy)} r={4} fill="#7c3aed" />
          <circle cx={toMohrX(result.eyy)} cy={toMohrY(-result.exy)} r={4} fill="#7c3aed" />
          <circle cx={toMohrX(result.e1)} cy={cy2} r={4.5} fill="#0284c7" />
          <circle cx={toMohrX(result.e2)} cy={cy2} r={4.5} fill="#dc2626" />
          <text x={415} y={244} textAnchor="middle" fontSize={9.5} fill="#475569">
            Blue = ε1 ({result.e1.toFixed(1)}) · Red = ε2 ({result.e2.toFixed(1)}) · Purple = (εxx, εxy)
          </text>
        </svg>
      )}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 2. Crustal Displacement Charts (Vectors, Epicenter Profile, Time-Series)   */
/* -------------------------------------------------------------------------- */

interface StrainDisplacementChartsProps {
  gnssItems: PreparedGeodeticObservation[];
  analysisQuantity: StrainAnalysisQuantity;
  selectedStationId: string | null;
  onSelectStation: (id: string) => void;
}

export const StrainDisplacementCharts: React.FC<StrainDisplacementChartsProps> = ({
  gnssItems,
  analysisQuantity,
  selectedStationId,
  onSelectStation,
}) => {
  const isRate = analysisQuantity === 'velocity-strain-rate';
  const unit = isRate ? 'mm/yr' : 'mm';

  const barData = useMemo(
    () =>
      gnssItems
        .map((it) => {
          const horiz = isRate ? it.velHorizMagMmYr : it.dispHorizMagMm;
          const up = isRate ? it.velUpMmYr : it.dispUpMm;
          const sigH = isRate ? it.velHorizSigmaMmYr : it.dispHorizSigmaMm;
          return {
            id: it.record.id,
            station: it.record.stationId,
            horiz: horiz !== null ? Number(horiz.toFixed(2)) : null,
            up: up !== null ? Number(up.toFixed(2)) : 0,
            sigma: sigH !== null ? Number(sigH.toFixed(2)) : null,
          };
        })
        .filter((d) => d.horiz !== null)
        .slice(0, 24),
    [gnssItems, isRate]
  );

  const profileData = useMemo(
    () =>
      gnssItems
        .filter((it) => it.distanceKm !== null && it.dispHorizMagMm !== null)
        .map((it) => ({
          station: it.record.stationId,
          distanceKm: Number((it.distanceKm as number).toFixed(1)),
          horizMm: Number((it.dispHorizMagMm as number).toFixed(2)),
          radialMm: it.dispRadialMm !== null ? Number(it.dispRadialMm.toFixed(2)) : null,
          transverseMm:
            it.dispTransverseMm !== null ? Number(it.dispTransverseMm.toFixed(2)) : null,
          upMm: it.dispUpMm !== null ? Number(it.dispUpMm.toFixed(2)) : null,
        }))
        .sort((a, b) => a.distanceKm - b.distanceKm),
    [gnssItems]
  );

  const activeStation = useMemo(() => {
    const withTs = gnssItems.filter((it) => it.record.timeSeries.length >= 2);
    const chosen = gnssItems.find((it) => it.record.id === selectedStationId);
    if (chosen && chosen.record.timeSeries.length >= 2) return chosen;
    return withTs[0] ?? null;
  }, [gnssItems, selectedStationId]);

  const tsData = useMemo(() => {
    if (!activeStation) return [];
    return activeStation.record.timeSeries.map((p) => ({
      date: p.dateUtc.slice(0, 10),
      eastMm: Number(p.eastMm.toFixed(2)),
      northMm: Number(p.northMm.toFixed(2)),
      upMm: p.upMm !== null ? Number(p.upMm.toFixed(2)) : null,
    }));
  }, [activeStation]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {/* Horizontal vs Vertical Station Magnitude */}
        <div className="bg-[#edf4fc] border border-sky-700/60 rounded-lg p-3.5 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
          <div className="flex items-center justify-between border-b border-sky-700/35 pb-1.5 mb-2">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-800">
              Station {isRate ? 'Velocity' : 'Displacement'} Magnitude ({unit})
            </div>
            <div className="text-[11px] text-slate-600">Top {barData.length} stations</div>
          </div>
          {barData.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-xs text-slate-600 bg-[#dce9f8] border border-sky-800/55 rounded">
              No GNSS {isRate ? 'velocity' : 'displacement'} vectors in current subset.
            </div>
          ) : (
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 8, right: 12, left: -10, bottom: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="station" tick={{ fontSize: 10, fill: '#475569' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#475569' }} unit={` ${unit}`} />
                  <Tooltip
                    formatter={(val, name) => [
                      `${Number(val ?? 0).toFixed(2)} ${unit}`,
                      name === 'horiz' ? 'Horizontal |u|' : 'Vertical U',
                    ]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceLine y={0} stroke="#94a3b8" />
                  <Bar
                    dataKey="horiz"
                    name={`Horiz (${unit})`}
                    fill="#1d4ed8"
                    radius={[2, 2, 0, 0]}
                    onClick={(d) => {
                      const rowId = (d as { payload?: { id?: string } })?.payload?.id;
                      if (rowId) onSelectStation(rowId);
                    }}
                  />
                  <Bar dataKey="up" name={`Vertical (${unit})`} fill="#0d9488" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Distance from Epicenter vs Displacement Profile */}
        <div className="bg-[#f3f1fb] border border-indigo-700/60 rounded-lg p-3.5 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
          <div className="flex items-center justify-between border-b border-indigo-700/35 pb-1.5 mb-2">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-800">
              Epicentral Distance Displacement Profile (mm)
            </div>
            <div className="text-[11px] text-slate-600">Radial (+away) & Horizontal</div>
          </div>
          {profileData.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-xs text-slate-600 bg-[#e5e1f7] border border-indigo-800/55 rounded">
              Requires a located reference earthquake and GNSS displacement observations.
            </div>
          ) : (
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 8, right: 12, left: -10, bottom: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    type="number"
                    dataKey="distanceKm"
                    name="Distance"
                    unit=" km"
                    tick={{ fontSize: 10, fill: '#475569' }}
                  />
                  <YAxis
                    type="number"
                    name="Displacement"
                    unit=" mm"
                    tick={{ fontSize: 10, fill: '#475569' }}
                  />
                  <ZAxis range={[45, 45]} />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    formatter={(val, name) => [`${Number(val ?? 0).toFixed(2)}`, String(name)]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceLine y={0} stroke="#94a3b8" />
                  <Scatter
                    name="Horiz |u| (mm)"
                    data={profileData.map((d) => ({ x: d.distanceKm, y: d.horizMm, distanceKm: d.distanceKm }))}
                    fill="#1d4ed8"
                    dataKey="y"
                  />
                  <Scatter
                    name="Radial u_R (mm)"
                    data={profileData
                      .filter((d) => d.radialMm !== null)
                      .map((d) => ({ distanceKm: d.distanceKm, y: d.radialMm as number }))}
                    fill="#d97706"
                    dataKey="y"
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Multi-epoch GNSS Time Series */}
      <div className="bg-[#eff7f6] border border-teal-700/60 rounded-lg p-3.5 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
        <div className="flex items-center justify-between border-b border-teal-700/35 pb-1.5 mb-2">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-800">
            GNSS Station Time-Series (E / N / U mm)
            {activeStation ? ` — ${activeStation.record.stationId}` : ''}
          </div>
          <div className="text-[11px] text-slate-600">
            {activeStation ? `${tsData.length} epochs` : 'Select a multi-epoch station row'}
          </div>
        </div>
        {!activeStation || tsData.length < 2 ? (
          <div className="py-6 text-center text-xs text-slate-600 bg-[#d7ebe8] border border-teal-800/65 rounded">
            No multi-epoch GNSS time-series rows present in active filter subset. Import CSV rows with repeating station_id and date/epoch to visualize time-series evolution.
          </div>
        ) : (
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={tsData} margin={{ top: 8, right: 12, left: -10, bottom: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#475569' }} />
                <YAxis tick={{ fontSize: 10, fill: '#475569' }} unit=" mm" />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine y={0} stroke="#94a3b8" />
                <Line type="monotone" dataKey="eastMm" name="East (mm)" stroke="#1d4ed8" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="northMm" name="North (mm)" stroke="#059669" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="upMm" name="Up (mm)" stroke="#d97706" strokeWidth={1.6} dot={{ r: 2.5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 3. Interactive Deformation Map (GNSS Vectors + InSAR LOS + Strain Cross)   */
/* -------------------------------------------------------------------------- */

interface StrainDeformationMapProps {
  activeEvent: EQPEvent;
  gnssItems: PreparedGeodeticObservation[];
  insarItems: PreparedGeodeticObservation[];
  result: HorizontalStrainResult | null;
  analysisQuantity: StrainAnalysisQuantity;
  centerLat: number | null;
  centerLon: number | null;
  effectiveRadiusKm: number | null;
  selectedId: string | null;
  onSelectObservation: (id: string) => void;
  onNotice?: (msg: string) => void;
}

function insarColor(losMm: number, absMax: number): string {
  const norm = Math.max(-1, Math.min(1, losMm / Math.max(1, absMax)));
  if (norm >= 0) {
    // Positive LOS toward satellite: blue/teal gradient
    const r = Math.round(240 - norm * 210);
    const g = Math.round(245 - norm * 110);
    const b = 250;
    return `rgb(${r},${g},${b})`;
  }
  const t = Math.abs(norm);
  // Negative LOS away: rose/red gradient
  const r = 245;
  const g = Math.round(235 - t * 185);
  const b = Math.round(235 - t * 185);
  return `rgb(${r},${g},${b})`;
}

export const StrainDeformationMapView: React.FC<StrainDeformationMapProps> = ({
  activeEvent,
  gnssItems,
  insarItems,
  result,
  analysisQuantity,
  centerLat,
  centerLon,
  effectiveRadiusKm,
  selectedId,
  onSelectObservation,
  onNotice,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [zoomSpanDeg, setZoomSpanDeg] = useState<number>(3.6);
  const [panOffset, setPanOffset] = useState<{ dLat: number; dLon: number }>({ dLat: 0, dLon: 0 });
  const [showVectors, setShowVectors] = useState(true);
  const [showUncertainties, setShowUncertainties] = useState(true);
  const [showInsar, setShowInsar] = useState(true);
  const [showStrainGlyph, setShowStrainGlyph] = useState(true);
  const [showGisFaults, setShowGisFaults] = useState(true);
  const [vectorScalePx, setVectorScalePx] = useState(55);

  const [activeFaults, setActiveFaults] = useState<ActiveFaultsDataset | null>(null);
  const [trenches, setTrenches] = useState<TrenchSystemsDataset | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([loadActiveFaultsDataset(), loadTrenchSystemsDataset()])
      .then(([af, tr]) => {
        if (!cancelled) {
          setActiveFaults(af);
          setTrenches(tr);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const isRate = analysisQuantity === 'velocity-strain-rate';
  const unlocated = isEventUnlocated(activeEvent);
  const allShown = useMemo(() => [...gnssItems, ...insarItems], [gnssItems, insarItems]);

  const refCenter = useMemo(() => {
    if (centerLat !== null && centerLon !== null) {
      return { lat: centerLat, lon: centerLon };
    }
    if (allShown.length > 0) {
      return {
        lat: allShown.reduce((s, it) => s + it.record.lat, 0) / allShown.length,
        lon: allShown.reduce((s, it) => s + it.record.lon, 0) / allShown.length,
      };
    }
    if (!unlocated) return { lat: activeEvent.lat, lon: activeEvent.lon };
    return { lat: DEFAULT_PH_CENTER.lat, lon: DEFAULT_PH_CENTER.lon };
  }, [centerLat, centerLon, allShown, unlocated, activeEvent.lat, activeEvent.lon]);

  const MAP_W = 860;
  const MAP_H = 540;
  const mapBounds = useMemo(() => {
    const cLat = refCenter.lat + panOffset.dLat;
    const cLon = refCenter.lon + panOffset.dLon;
    const halfLat = zoomSpanDeg * 0.5;
    const cosLat = Math.max(0.35, Math.cos(cLat * DEG2RAD));
    const halfLon = (halfLat * (MAP_W / MAP_H)) / cosLat;
    return {
      minLat: cLat - halfLat,
      maxLat: cLat + halfLat,
      minLon: cLon - halfLon,
      maxLon: cLon + halfLon,
      centerLat: cLat,
      centerLon: cLon,
    };
  }, [refCenter.lat, refCenter.lon, panOffset.dLat, panOffset.dLon, zoomSpanDeg]);

  const projectCoord = (lat: number, lon: number) => ({
    x: ((lon - mapBounds.minLon) / Math.max(1e-6, mapBounds.maxLon - mapBounds.minLon)) * MAP_W,
    y: ((mapBounds.maxLat - lat) / Math.max(1e-6, mapBounds.maxLat - mapBounds.minLat)) * MAP_H,
  });

  // Vector normalization
  const maxVecMag = useMemo(() => {
    let m = 0;
    gnssItems.forEach((it) => {
      const val = isRate ? it.velHorizMagMmYr : it.dispHorizMagMm;
      if (val !== null && val > m) m = val;
    });
    return Math.max(1, m);
  }, [gnssItems, isRate]);

  const maxAbsInsar = useMemo(() => {
    let m = 1;
    insarItems.forEach((it) => {
      if (it.record.losDisplacementMm !== null) {
        m = Math.max(m, Math.abs(it.record.losDisplacementMm));
      }
    });
    return m;
  }, [insarItems]);

  const kmPerLatDeg = 111.19;
  const pxPerKm = MAP_H / Math.max(0.01, (mapBounds.maxLat - mapBounds.minLat) * kmPerLatDeg);
  const radiusCirclePt =
    centerLat !== null && centerLon !== null && effectiveRadiusKm !== null
      ? {
          ...projectCoord(centerLat, centerLon),
          rPx: effectiveRadiusKm * pxPerKm,
        }
      : null;

  const selectedObs = allShown.find((x) => x.record.id === selectedId) ?? null;

  return (
    <div className="space-y-3">
      {/* Map Header Controls */}
      <div className="bg-[#f3f1fb] border border-indigo-700/60 rounded-lg p-3 flex flex-wrap items-center justify-between gap-2 text-xs shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={showVectors}
              onChange={(e) => setShowVectors(e.target.checked)}
            />
            <span>GNSS Vectors ({gnssItems.length})</span>
          </label>
          <label className="inline-flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={showUncertainties}
              onChange={(e) => setShowUncertainties(e.target.checked)}
            />
            <span>1σ Error Circles</span>
          </label>
          <label className="inline-flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={showInsar}
              onChange={(e) => setShowInsar(e.target.checked)}
            />
            <span>InSAR LOS ({insarItems.length})</span>
          </label>
          <label className="inline-flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={showStrainGlyph}
              onChange={(e) => setShowStrainGlyph(e.target.checked)}
            />
            <span>Principal Strain Cross</span>
          </label>
          <label className="inline-flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={showGisFaults}
              onChange={(e) => setShowGisFaults(e.target.checked)}
            />
            <span>Active Faults & Trenches</span>
          </label>
        </div>
        <div className="flex items-center gap-2 bg-[#e5e1f7] border border-indigo-800/55 rounded px-2 py-1">
          <span className="text-[11px] text-slate-700 font-medium">Vector scale:</span>
          <input
            type="range"
            min={25}
            max={120}
            value={vectorScalePx}
            onChange={(e) => setVectorScalePx(Number(e.target.value))}
            className="w-20"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-3">
        {/* Map SVG Canvas */}
        <div className="bg-[#edf4fc] border border-sky-700/60 rounded-lg overflow-hidden shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
          <div className="px-3 py-1.5 bg-[#dce9f8] border-b border-sky-700/40 flex items-center justify-between text-[11px]">
            <span className="font-semibold text-slate-700">
              Philippine Crustal Deformation Map (WGS84 / Uniform Centroid Strain Overlay)
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setZoomSpanDeg((z) => Math.max(0.35, Number((z * 0.72).toFixed(2))))}
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
                  setZoomSpanDeg(3.6);
                  setPanOffset({ dLat: 0, dLon: 0 });
                }}
                className="px-1.5 py-0.5 border border-slate-300 bg-white rounded-xs hover:bg-slate-100 font-medium"
              >
                Center
              </button>
              <button
                type="button"
                onClick={() => {
                  if (exportSvgElementAsSvg(svgRef.current, 'strain_deformation_map.svg')) {
                    onNotice?.('Exported strain_deformation_map.svg');
                  }
                }}
                className="px-1.5 py-0.5 border border-slate-300 bg-white rounded-xs hover:bg-slate-100 inline-flex items-center gap-1"
              >
                <Download className="w-3 h-3" /> SVG
              </button>
              <button
                type="button"
                onClick={() =>
                  void exportSvgElementAsPng(svgRef.current, 'strain_deformation_map.png', 2).then(
                    (ok) => ok && onNotice?.('Exported strain_deformation_map.png')
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
            <svg ref={svgRef} viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="w-full h-auto block select-none">
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
                    key={`isl-${idx}`}
                    points={pts}
                    fill="#f8fafc"
                    stroke="#94a3b8"
                    strokeWidth={0.8}
                  />
                );
              })}

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
                    />
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
                        key={`af-${idx}-${lIdx}`}
                        points={ptStr}
                        fill="none"
                        stroke="#e11d48"
                        strokeWidth={0.85}
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
                        key={`tr-${idx}-${lIdx}`}
                        points={ptStr}
                        fill="none"
                        stroke="#4338ca"
                        strokeWidth={1.3}
                        strokeOpacity={0.6}
                        strokeDasharray="5 3"
                      />
                    );
                  });
                })}

              {/* Selection Filter Radius Circle */}
              {radiusCirclePt && (
                <circle
                  cx={radiusCirclePt.x}
                  cy={radiusCirclePt.y}
                  r={radiusCirclePt.rPx}
                  fill="#2563eb"
                  fillOpacity={0.04}
                  stroke="#2563eb"
                  strokeWidth={1.2}
                  strokeDasharray="6 4"
                />
              )}

              {/* InSAR LOS Point Layer */}
              {showInsar &&
                insarItems.map((it) => {
                  const p = projectCoord(it.record.lat, it.record.lon);
                  const los = it.record.losDisplacementMm ?? 0;
                  const fill = insarColor(los, maxAbsInsar);
                  const isSel = it.record.id === selectedId;
                  return (
                    <g
                      key={it.record.id}
                      className="cursor-pointer"
                      onClick={() => onSelectObservation(it.record.id)}
                    >
                      <title>{`${it.record.stationId} (InSAR LOS: ${los.toFixed(1)} mm)`}</title>
                      <rect
                        x={p.x - 4.5}
                        y={p.y - 4.5}
                        width={9}
                        height={9}
                        fill={fill}
                        stroke={isSel ? '#dc2626' : '#334155'}
                        strokeWidth={isSel ? 2 : 0.8}
                      />
                    </g>
                  );
                })}

              {/* GNSS Stations + Vectors */}
              {gnssItems.map((it) => {
                const p = projectCoord(it.record.lat, it.record.lon);
                const ve = isRate ? it.velEastMmYr : it.dispEastMm;
                const vn = isRate ? it.velNorthMmYr : it.dispNorthMm;
                const sigE = isRate ? it.velSigmaEastMmYr : it.dispSigmaEastMm;
                const sigN = isRate ? it.velSigmaNorthMmYr : it.dispSigmaNorthMm;
                const isSel = it.record.id === selectedId;

                const pxPerUnit = vectorScalePx / maxVecMag;
                const dx = ve !== null ? ve * pxPerUnit : 0;
                const dy = vn !== null ? -vn * pxPerUnit : 0;
                const tipX = p.x + dx;
                const tipY = p.y + dy;
                const vLen = Math.hypot(dx, dy);

                let arrowHead = null;
                if (showVectors && ve !== null && vn !== null && vLen > 3) {
                  const ux = dx / vLen;
                  const uy = dy / vLen;
                  const px = -uy;
                  const py = ux;
                  const hLen = Math.min(8, vLen * 0.45);
                  const hW = 3.8;
                  const p1 = `${tipX - ux * hLen + px * hW},${tipY - uy * hLen + py * hW}`;
                  const p2 = `${tipX - ux * hLen - px * hW},${tipY - uy * hLen - py * hW}`;
                  arrowHead = <polygon points={`${tipX},${tipY} ${p1} ${p2}`} fill="#0f172a" />;
                }

                return (
                  <g
                    key={it.record.id}
                    className="cursor-pointer"
                    onClick={() => onSelectObservation(it.record.id)}
                  >
                    <title>{`${it.record.stationId}: E=${ve?.toFixed(1) ?? 'N/A'}, N=${vn?.toFixed(1) ?? 'N/A'} ${isRate ? 'mm/yr' : 'mm'}`}</title>
                    {showVectors && ve !== null && vn !== null && (
                      <>
                        <line
                          x1={p.x}
                          y1={p.y}
                          x2={tipX}
                          y2={tipY}
                          stroke={isSel ? '#dc2626' : '#0f172a'}
                          strokeWidth={isSel ? 2.2 : 1.7}
                        />
                        {arrowHead}
                        {showUncertainties && (sigE !== null || sigN !== null) && (
                          <ellipse
                            cx={tipX}
                            cy={tipY}
                            rx={Math.max(2, (sigE ?? 1) * pxPerUnit)}
                            ry={Math.max(2, (sigN ?? 1) * pxPerUnit)}
                            fill="none"
                            stroke="#64748b"
                            strokeWidth={0.8}
                            strokeDasharray="2 2"
                          />
                        )}
                      </>
                    )}
                    <polygon
                      points={`${p.x},${p.y - 4.5} ${p.x + 4},${p.y + 3.5} ${p.x - 4},${p.y + 3.5}`}
                      fill={isSel ? '#dc2626' : '#2563eb'}
                      stroke="#ffffff"
                      strokeWidth={0.9}
                    />
                    <text x={p.x + 6} y={p.y - 4} fontSize={9.5} fontWeight={600} fill="#1e293b">
                      {it.record.stationId}
                    </text>
                  </g>
                );
              })}

              {/* Principal Strain Cross over Network Centroid (NOT interpolated spatial field) */}
              {showStrainGlyph && result && result.status !== 'Insufficient Data' && (() => {
                const cPt = projectCoord(result.originLat, result.originLon);
                const maxAmp = Math.max(Math.abs(result.e1), Math.abs(result.e2), 1e-6);
                const l1 = Math.max(22, (Math.abs(result.e1) / maxAmp) * 52);
                const l2 = Math.max(22, (Math.abs(result.e2) / maxAmp) * 52);
                const drawArm = (azDeg: number, len: number, val: number) => {
                  const rad = azDeg * DEG2RAD;
                  const ux = Math.sin(rad);
                  const uy = -Math.cos(rad);
                  const col = val >= 0 ? '#0284c7' : '#dc2626';
                  const isExt = val >= 0;
                  return ([-1, 1] as const).map((s) => {
                    const x2 = cPt.x + s * ux * len;
                    const y2 = cPt.y + s * uy * len;
                    const tipX = isExt ? x2 : cPt.x + s * ux * 12;
                    const tipY = isExt ? y2 : cPt.y + s * uy * 12;
                    const px = -s * uy;
                    const py = s * ux;
                    const b = isExt ? -1 : 1;
                    const p1 = `${tipX + b * s * ux * 8 + px * 4},${tipY + b * s * uy * 8 + py * 4}`;
                    const p2 = `${tipX + b * s * ux * 8 - px * 4},${tipY + b * s * uy * 8 - py * 4}`;
                    return (
                      <g key={`${azDeg}-${s}`}>
                        <line x1={cPt.x} y1={cPt.y} x2={x2} y2={y2} stroke={col} strokeWidth={3} />
                        <polygon points={`${tipX},${tipY} ${p1} ${p2}`} fill={col} />
                      </g>
                    );
                  });
                };
                return (
                  <g>
                    <circle
                      cx={cPt.x}
                      cy={cPt.y}
                      r={56}
                      fill="#ffffff"
                      fillOpacity={0.22}
                      stroke="#475569"
                      strokeDasharray="3 3"
                    />
                    {drawArm(result.e1AzimuthDeg, l1, result.e1)}
                    {drawArm(result.e2AzimuthDeg, l2, result.e2)}
                  </g>
                );
              })()}

              {/* Reference Earthquake Epicenter */}
              {!unlocated && (() => {
                const ep = projectCoord(activeEvent.lat, activeEvent.lon);
                return (
                  <g>
                    <title>{`Selected EQ: ${activeEvent.id}`}</title>
                    <circle
                      cx={ep.x}
                      cy={ep.y}
                      r={7}
                      fill="#facc15"
                      stroke="#991b1b"
                      strokeWidth={1.6}
                    />
                    <text x={ep.x + 10} y={ep.y + 3} fontSize={10} fontWeight={700} fill="#991b1b">
                      EQ {activeEvent.id}
                    </text>
                  </g>
                );
              })()}

              {/* Reference Scale Vector Legend */}
              <g transform="translate(14, 14)">
                <rect x={0} y={0} width={185} height={58} rx={3} fill="#ffffff" fillOpacity={0.92} stroke="#cbd5e1" />
                <line x1={12} y1={20} x2={12 + vectorScalePx} y2={20} stroke="#0f172a" strokeWidth={2} />
                <text x={18 + vectorScalePx} y={24} fontSize={10} fontWeight={600} fill="#0f172a">
                  {maxVecMag.toFixed(1)} {isRate ? 'mm/yr' : 'mm'}
                </text>
                <text x={12} y={44} fontSize={9.5} fill="#475569">
                  Blue=ε1 (+ext) · Red=ε2 (−short)
                </text>
              </g>
            </svg>

            <div className="absolute bottom-2 right-2 pointer-events-none">
              <MapScaleBar metersPerPixel={1000 / Math.max(0.01, pxPerKm)} />
            </div>
          </div>
        </div>

        {/* Side Legend & Selected Station Inspector */}
        <div className="space-y-3">
          <div className="bg-[#f1f4f9] border border-slate-600/70 rounded-lg p-3.5 text-xs space-y-2 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
            <div className="font-bold uppercase tracking-wide text-slate-800 border-b border-slate-600/35 pb-1">
              Selected Station / Point
            </div>
            {!selectedObs ? (
              <div className="text-slate-600 py-3 px-2 bg-[#dfe6f0] border border-slate-700/60 rounded">
                Click any GNSS station triangle or InSAR LOS square on the map or table to inspect its coordinates, components, and metadata.
              </div>
            ) : (
              <div className="space-y-1.5 text-[11px] bg-[#dfe6f0] border border-slate-700/60 rounded p-2.5">
                <div className="font-bold text-slate-900">
                  {selectedObs.record.stationId}{' '}
                  <span className="font-normal text-slate-600">
                    ({selectedObs.record.observationType.toUpperCase()})
                  </span>
                </div>
                <div>
                  Location: {selectedObs.record.lat.toFixed(4)}°N, {selectedObs.record.lon.toFixed(4)}°E
                </div>
                <div>
                  Distance from EQ:{' '}
                  {selectedObs.distanceKm !== null ? `${selectedObs.distanceKm.toFixed(1)} km` : 'N/A'}
                </div>
                {selectedObs.record.observationType === 'gnss' ? (
                  <>
                    <div>
                      Disp (E/N/U mm):{' '}
                      {selectedObs.dispEastMm?.toFixed(2) ?? '—'} /{' '}
                      {selectedObs.dispNorthMm?.toFixed(2) ?? '—'} /{' '}
                      {selectedObs.dispUpMm?.toFixed(2) ?? '—'}
                    </div>
                    <div>
                      Vel (E/N mm/yr):{' '}
                      {selectedObs.velEastMmYr?.toFixed(2) ?? '—'} /{' '}
                      {selectedObs.velNorthMmYr?.toFixed(2) ?? '—'}
                    </div>
                  </>
                ) : (
                  <div>
                    InSAR LOS: {selectedObs.record.losDisplacementMm?.toFixed(2) ?? '—'} mm (
                    {selectedObs.record.passDirection})
                  </div>
                )}
                <div>CRS: {selectedObs.record.crs}</div>
                <div>Source: {selectedObs.record.dataSource}</div>
                <div>
                  Provenance: {selectedObs.record.provenanceKind} · Grade {selectedObs.record.quality}
                </div>
                <div>Epoch Relation: {selectedObs.epochRelation}</div>
              </div>
            )}
          </div>

          {insarItems.length > 0 && (
            <div className="bg-[#f3f1fb] border border-indigo-700/60 rounded-lg p-3.5 text-xs space-y-1.5 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
              <div className="font-bold uppercase tracking-wide text-slate-800 border-b border-indigo-700/35 pb-1">
                InSAR LOS Color Scale (mm)
              </div>
              <div className="h-3 w-full rounded-xs border border-indigo-800/60 bg-gradient-to-r from-[#f52c2c] via-[#f0f5fa] to-[#1e86fa]" />
              <div className="flex justify-between text-[10px] font-mono text-slate-700">
                <span>−{maxAbsInsar.toFixed(1)} mm</span>
                <span>0</span>
                <span>+{maxAbsInsar.toFixed(1)} mm</span>
              </div>
              <p className="text-[11px] text-slate-600">
                Native Line-of-Sight measurements; never decomposed without verified multi-geometry constraints.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 4. Station Residual Diagnostic Bar Chart                                   */
/* -------------------------------------------------------------------------- */

export const StrainResidualChart: React.FC<{ result: HorizontalStrainResult }> = ({ result }) => {
  const data = result.residuals.map((r) => ({
    station: r.stationId,
    residual: Number(r.residualMag.toFixed(2)),
    normRes: Number(r.normalizedResidual.toFixed(2)),
  }));

  return (
    <div className="bg-[#f3f1fb] border border-indigo-700/60 rounded-lg p-3.5 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
      <div className="flex items-center justify-between border-b border-indigo-700/35 pb-1.5 mb-2">
        <div className="text-xs font-bold uppercase tracking-wide text-slate-800">
          Per-Station WLS Residual Magnitude (|r| = |u_obs − u_pred|)
        </div>
        <div className="text-[11px] text-slate-600 font-mono">
          RMS = {result.rmsResidualVector.toFixed(2)} {result.vectorUnit}
        </div>
      </div>
      <div className="h-[210px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="station" tick={{ fontSize: 10, fill: '#475569' }} />
            <YAxis tick={{ fontSize: 10, fill: '#475569' }} unit={` ${result.vectorUnit}`} />
            <Tooltip
              formatter={(v) => [
                `${Number(v ?? 0).toFixed(2)} ${result.vectorUnit}`,
                '|Residual|',
              ]}
            />
            <Bar dataKey="residual" radius={[2, 2, 0, 0]}>
              {data.map((row, idx) => (
                <Cell
                  key={`res-${idx}`}
                  fill={row.normRes > 3 ? '#dc2626' : row.normRes > 2 ? '#d97706' : '#1d4ed8'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
