import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Eye, EyeOff, Palette, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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
import {
  loadActiveFaultsDataset,
  loadTrenchSystemsDataset,
  type ActiveFaultsDataset,
  type TrenchSystemsDataset,
} from '../utils/geologyLayers';
import {
  computeSegmentSurfaceProjection,
  CoulombCalculationResult,
  CoulombGridCell,
  CoulombStressUnit,
  FaultSegment,
  formatStressValue,
  PointCoulombEvaluation,
  ReceiverFaultModel,
  unprojectLocalEnuMetersToLatLon,
} from '../utils/coulombStress';
import {
  exportSvgElementAsPng,
  exportSvgElementAsSvg,
} from './HistoricalBeachballIcon';
import { MapScaleBar } from './MapScaleBar';

const DEG2RAD = Math.PI / 180;

export type CoulombPresetId =
  | 'classic-bwr'
  | 'vermilion-teal'
  | 'amber-violet'
  | 'magenta-cyan'
  | 'custom';

export interface CoulombColorScheme {
  presetId: CoulombPresetId;
  positiveColor: string;
  negativeColor: string;
  neutralColor: string;
}

export const COULOMB_COLOR_PRESETS: Array<{
  id: Exclude<CoulombPresetId, 'custom'>;
  label: string;
  positiveColor: string;
  negativeColor: string;
  neutralColor: string;
}> = [
  {
    id: 'classic-bwr',
    label: 'Classic Red / Blue',
    positiveColor: '#b91c1c',
    negativeColor: '#1d4ed8',
    neutralColor: '#f8fafc',
  },
  {
    id: 'vermilion-teal',
    label: 'Vermilion / Teal (Safe)',
    positiveColor: '#c2410c',
    negativeColor: '#0f766e',
    neutralColor: '#f8fafc',
  },
  {
    id: 'amber-violet',
    label: 'Amber / Violet',
    positiveColor: '#b45309',
    negativeColor: '#6d28d9',
    neutralColor: '#fafaf9',
  },
  {
    id: 'magenta-cyan',
    label: 'Magenta / Cyan',
    positiveColor: '#be185d',
    negativeColor: '#0369a1',
    neutralColor: '#f8fafc',
  },
];

export const DEFAULT_COULOMB_COLOR_SCHEME: CoulombColorScheme = {
  presetId: 'classic-bwr',
  positiveColor: '#b91c1c',
  negativeColor: '#1d4ed8',
  neutralColor: '#f8fafc',
};

function parseHexToRgb(hex: string, fallback: [number, number, number]): [number, number, number] {
  const clean = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return fallback;
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

export interface CoulombStressRange {
  minKPa: number;
  maxKPa: number;
}

export interface DynamicLegendTick {
  valueKPa: number;
  frac: number; // 0..1 along gradient bar
  pct: number;  // 0..100%
  label: string;
  role: 'negative' | 'zero' | 'positive';
  align: 'start' | 'middle' | 'end';
  isEndpointOrZero: boolean;
}

/**
 * Diverging scientific color ramp for Delta-CFS over an arbitrary [minKPa, maxKPa] domain:
 *   Negative (Stress Shadow): Neutral -> negativeColor at minKPa
 *   Zero: neutralColor
 *   Positive (Stress Loaded): Neutral -> positiveColor at maxKPa
 */
export function cfsColorInRange(
  deltaCfsKPa: number,
  minKPa: number,
  maxKPa: number,
  colorScheme: CoulombColorScheme = DEFAULT_COULOMB_COLOR_SCHEME
): string {
  const safeMin = Math.min(minKPa, -1);
  const safeMax = Math.max(maxKPa, 1);
  const neu = parseHexToRgb(colorScheme.neutralColor, [248, 250, 252]);
  if (deltaCfsKPa >= 0) {
    const t = Math.max(0, Math.min(1, deltaCfsKPa / safeMax));
    const target = parseHexToRgb(colorScheme.positiveColor, [185, 28, 28]);
    return `rgb(${Math.round(neu[0] + t * (target[0] - neu[0]))},${Math.round(
      neu[1] + t * (target[1] - neu[1])
    )},${Math.round(neu[2] + t * (target[2] - neu[2]))})`;
  }
  const t = Math.max(0, Math.min(1, Math.abs(deltaCfsKPa) / Math.abs(safeMin)));
  const target = parseHexToRgb(colorScheme.negativeColor, [29, 78, 216]);
  return `rgb(${Math.round(neu[0] + t * (target[0] - neu[0]))},${Math.round(
    neu[1] + t * (target[1] - neu[1])
  )},${Math.round(neu[2] + t * (target[2] - neu[2]))})`;
}

export function cfsColor(
  deltaCfsKPa: number,
  clampMaxKPa: number,
  colorScheme: CoulombColorScheme = DEFAULT_COULOMB_COLOR_SCHEME
): string {
  const cap = Math.max(1, clampMaxKPa);
  return cfsColorInRange(deltaCfsKPa, -cap, cap, colorScheme);
}

export function computeDynamicLegendTicks(
  minKPa: number,
  maxKPa: number,
  unit: CoulombStressUnit
): DynamicLegendTick[] {
  const safeMin = Math.min(minKPa, -1);
  const safeMax = Math.max(maxKPa, 1);
  const span = Math.max(1e-6, safeMax - safeMin);
  const zeroFrac = Math.max(0, Math.min(1, (0 - safeMin) / span));

  const ticks: DynamicLegendTick[] = [
    {
      valueKPa: safeMin,
      frac: 0,
      pct: 0,
      label: formatLegendNumericLabel(safeMin, unit, true),
      role: 'negative',
      align: 'start',
      isEndpointOrZero: true,
    },
    {
      valueKPa: 0,
      frac: zeroFrac,
      pct: zeroFrac * 100,
      label: '0',
      role: 'zero',
      align: 'middle',
      isEndpointOrZero: true,
    },
    {
      valueKPa: safeMax,
      frac: 1,
      pct: 100,
      label: formatLegendNumericLabel(safeMax, unit, true),
      role: 'positive',
      align: 'end',
      isEndpointOrZero: true,
    },
  ];

  // Add midpoint labels on each lobe only when sufficient horizontal room prevents collisions
  const negMidKPa = safeMin * 0.5;
  const negMidFrac = (negMidKPa - safeMin) / span;
  if (negMidFrac >= 0.16 && zeroFrac - negMidFrac >= 0.14) {
    ticks.push({
      valueKPa: negMidKPa,
      frac: negMidFrac,
      pct: negMidFrac * 100,
      label: formatLegendNumericLabel(negMidKPa, unit, false),
      role: 'negative',
      align: 'middle',
      isEndpointOrZero: false,
    });
  }

  const posMidKPa = safeMax * 0.5;
  const posMidFrac = (posMidKPa - safeMin) / span;
  if (posMidFrac - zeroFrac >= 0.14 && 1 - posMidFrac >= 0.16) {
    ticks.push({
      valueKPa: posMidKPa,
      frac: posMidFrac,
      pct: posMidFrac * 100,
      label: formatLegendNumericLabel(posMidKPa, unit, false),
      role: 'positive',
      align: 'middle',
      isEndpointOrZero: false,
    });
  }

  return ticks.sort((a, b) => a.frac - b.frac);
}

interface CoulombStressMapProps {
  event: EQPEvent;
  segments: FaultSegment[];
  receiverModel: ReceiverFaultModel;
  result: CoulombCalculationResult | null;
  isStale: boolean;
  unit: CoulombStressUnit;
  clampKPa: number;
  stressRange?: CoulombStressRange;
  onChangeStressRange?: (range: CoulombStressRange) => void;
  showLegend?: boolean;
  onToggleLegend?: () => void;
  legendPos?: { x: number; y: number };
  onChangeLegendPos?: (pos: { x: number; y: number }) => void;
  colorScheme?: CoulombColorScheme;
  onChangeColorScheme?: (scheme: CoulombColorScheme) => void;
  legendBgOpacity?: number;
  onChangeLegendBgOpacity?: (opacity: number) => void;
  onChangeClampKPa: (val: number) => void;
  onChangeTargetDepthKm?: (depthKm: number) => void;
  onNotice?: (msg: string) => void;
}

const DEFAULT_LEGEND_POS = { x: 14, y: 14 };
const DEFAULT_LEGEND_OPACITY = 1;
const LEGEND_BOX_W = 268;
const LEGEND_BOX_H = 92;

function formatLegendNumericLabel(
  kPa: number,
  unit: CoulombStressUnit,
  includeUnit = true
): string {
  if (!Number.isFinite(kPa) || Math.abs(kPa) < 1e-9) {
    return includeUnit ? `0 ${unit}` : '0';
  }
  const val = unit === 'MPa' ? kPa / 1000 : kPa;
  const rounded = Number(val.toFixed(unit === 'MPa' ? 3 : 1));
  const sign = rounded > 0 ? '+' : '';
  return includeUnit ? `${sign}${rounded} ${unit}` : `${sign}${rounded}`;
}

export const CoulombStressMapView: React.FC<CoulombStressMapProps> = ({
  event,
  segments,
  receiverModel,
  result,
  isStale,
  unit,
  clampKPa,
  stressRange: stressRangeProp,
  onChangeStressRange,
  showLegend: showLegendProp,
  onToggleLegend,
  legendPos: legendPosProp,
  onChangeLegendPos,
  colorScheme: colorSchemeProp,
  onChangeColorScheme,
  legendBgOpacity: legendBgOpacityProp,
  onChangeLegendBgOpacity,
  onChangeClampKPa,
  onChangeTargetDepthKm,
  onNotice,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const legendDragCleanupRef = useRef<(() => void) | null>(null);
  const [internalShowLegend, setInternalShowLegend] = useState(true);
  const showLegend = showLegendProp ?? internalShowLegend;
  const handleToggleLegend = onToggleLegend ?? (() => setInternalShowLegend((v) => !v));
  const [internalLegendPos, setInternalLegendPos] = useState<{ x: number; y: number }>(
    DEFAULT_LEGEND_POS
  );
  const legendPos = legendPosProp ?? internalLegendPos;
  const updateLegendPos = onChangeLegendPos ?? setInternalLegendPos;
  const [internalColorScheme, setInternalColorScheme] = useState<CoulombColorScheme>(
    DEFAULT_COULOMB_COLOR_SCHEME
  );
  const colorScheme = colorSchemeProp ?? internalColorScheme;
  const updateColorScheme = onChangeColorScheme ?? setInternalColorScheme;
  const [internalLegendOpacity, setInternalLegendOpacity] = useState<number>(DEFAULT_LEGEND_OPACITY);
  const legendBgOpacity = legendBgOpacityProp ?? internalLegendOpacity;
  const updateLegendBgOpacity = onChangeLegendBgOpacity ?? setInternalLegendOpacity;
  const [internalStressRange, setInternalStressRange] = useState<CoulombStressRange>({
    minKPa: -clampKPa,
    maxKPa: clampKPa,
  });
  const stressRange = stressRangeProp ?? internalStressRange;
  const updateStressRange = onChangeStressRange ?? setInternalStressRange;
  const effectiveMinKPa = Math.min(stressRange.minKPa, -1);
  const effectiveMaxKPa = Math.max(stressRange.maxKPa, 1);
  const rangeSpanKPa = Math.max(1e-6, effectiveMaxKPa - effectiveMinKPa);
  const zeroFrac = Math.max(0, Math.min(1, (0 - effectiveMinKPa) / rangeSpanKPa));
  const zeroPct = Number((zeroFrac * 100).toFixed(2));
  const isSymmetricRange = Math.abs(effectiveMinKPa + effectiveMaxKPa) < 0.5;
  const dynamicLegendTicks = useMemo(
    () => computeDynamicLegendTicks(effectiveMinKPa, effectiveMaxKPa, unit),
    [effectiveMinKPa, effectiveMaxKPa, unit]
  );
  const [showCustomizePanel, setShowCustomizePanel] = useState(true);
  const [isDraggingLegend, setIsDraggingLegend] = useState(false);
  const [zoomSpanDeg, setZoomSpanDeg] = useState<number>(1.8);
  const [panOffset, setPanOffset] = useState<{ dLat: number; dLon: number }>({ dLat: 0, dLon: 0 });
  const [showStressGrid, setShowStressGrid] = useState(true);
  const [showSourceFault, setShowSourceFault] = useState(true);
  const [showReceivers, setShowReceivers] = useState(true);
  const [showGisFaults, setShowGisFaults] = useState(true);
  const [hoveredCell, setHoveredCell] = useState<CoulombGridCell | null>(null);
  const [selectedCell, setSelectedCell] = useState<CoulombGridCell | null>(null);
  const [selectedReceiver, setSelectedReceiver] = useState<PointCoulombEvaluation | null>(null);

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

  const unlocated = isEventUnlocated(event);

  const refCenter = useMemo(() => {
    if (result && result.status !== 'Invalid Configuration') {
      return { lat: result.originLat, lon: result.originLon };
    }
    if (segments.length > 0) {
      return {
        lat: segments.reduce((s, seg) => s + seg.centerLat, 0) / segments.length,
        lon: segments.reduce((s, seg) => s + seg.centerLon, 0) / segments.length,
      };
    }
    if (!unlocated) return { lat: event.lat, lon: event.lon };
    return { lat: DEFAULT_PH_CENTER.lat, lon: DEFAULT_PH_CENTER.lon };
  }, [result, segments, unlocated, event.lat, event.lon]);

  // Reset zoom roughly to grid extent when new result arrives
  useEffect(() => {
    if (result && result.gridHalfExtentKm > 0) {
      const targetSpan = Math.max(0.45, Math.min(10, (result.gridHalfExtentKm * 2.5) / 111.19));
      setZoomSpanDeg(Number(targetSpan.toFixed(2)));
      setPanOffset({ dLat: 0, dLon: 0 });
    }
  }, [result?.gridHalfExtentKm]);

  const MAP_W = 860;
  const MAP_H = 540;

  const clampLegendCoords = (x: number, y: number) => ({
    x: Math.max(4, Math.min(MAP_W - LEGEND_BOX_W - 4, Math.round(x))),
    y: Math.max(4, Math.min(MAP_H - LEGEND_BOX_H - 4, Math.round(y))),
  });

  useEffect(() => {
    return () => {
      legendDragCleanupRef.current?.();
      legendDragCleanupRef.current = null;
    };
  }, []);

  const isLegendMoved =
    legendPos.x !== DEFAULT_LEGEND_POS.x || legendPos.y !== DEFAULT_LEGEND_POS.y;
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

  const kmPerLatDeg = 111.19;
  const pxPerKm = MAP_H / Math.max(0.01, (mapBounds.maxLat - mapBounds.minLat) * kmPerLatDeg);

  const hasComputedGrid =
    Boolean(result) &&
    result!.status !== 'Invalid Configuration' &&
    result!.status !== 'Not Run' &&
    result!.gridCells.length > 0;

  const activeCell = selectedCell ?? hoveredCell;

  // Cross-section profile line endpoints if enabled
  const profileLine = useMemo(() => {
    const gc = receiverModel.gridConfig;
    if (!gc.crossSectionEnabled) return null;
    const azRad = gc.profileAzimuthDeg * DEG2RAD;
    const uxE = Math.sin(azRad);
    const uxN = Math.cos(azRad);
    const p1 = unprojectLocalEnuMetersToLatLon(
      -gc.profileHalfLengthKm * 1000 * uxE,
      -gc.profileHalfLengthKm * 1000 * uxN,
      refCenter.lat,
      refCenter.lon
    );
    const p2 = unprojectLocalEnuMetersToLatLon(
      gc.profileHalfLengthKm * 1000 * uxE,
      gc.profileHalfLengthKm * 1000 * uxN,
      refCenter.lat,
      refCenter.lon
    );
    return { p1, p2 };
  }, [receiverModel.gridConfig, refCenter.lat, refCenter.lon]);

  // Cross-section profile SVG grid dimensions
  const crossCols = 21;
  const crossRows =
    result && result.crossSectionCells.length > 0
      ? Math.round(result.crossSectionCells.length / crossCols)
      : 0;

  return (
    <div className="space-y-3">
      {/* Map Controls Strip */}
      <div className="bg-[#f3f1fb] border border-indigo-700/60 rounded-lg p-3 flex flex-wrap items-center justify-between gap-2 text-xs shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={showStressGrid}
              onChange={(e) => setShowStressGrid(e.target.checked)}
            />
            <span>ΔCFS Grid</span>
          </label>
          <label className="inline-flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={showSourceFault}
              onChange={(e) => setShowSourceFault(e.target.checked)}
            />
            <span>Source Segments ({segments.length})</span>
          </label>
          <label className="inline-flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={showReceivers}
              onChange={(e) => setShowReceivers(e.target.checked)}
            />
            <span>Receivers</span>
          </label>
          <label className="inline-flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={showGisFaults}
              onChange={(e) => setShowGisFaults(e.target.checked)}
            />
            <span>PHIVOLCS Faults & Trenches</span>
          </label>
          <button
            type="button"
            aria-pressed={showLegend}
            onClick={handleToggleLegend}
            className={`inline-flex items-center gap-1 px-2 py-0.5 border rounded-xs text-[11px] font-medium transition-colors ${
              showLegend
                ? 'bg-slate-800 text-white border-slate-800 hover:bg-slate-900'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
            }`}
          >
            {showLegend ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            {showLegend ? 'Hide Legend' : 'Show Legend'}
          </button>
          {showLegend && isLegendMoved && (
            <button
              type="button"
              onClick={() => updateLegendPos(DEFAULT_LEGEND_POS)}
              className="px-2 py-0.5 border border-slate-300 bg-white text-slate-700 rounded-xs text-[11px] font-medium hover:bg-slate-100"
              title="Reset legend position to top-left corner"
            >
              Reset Legend Pos
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-700">
            <span>Color Scale (±):</span>
            <select
              value={isSymmetricRange ? clampKPa : 'custom'}
              onChange={(e) => {
                const val = Number(e.target.value);
                if (Number.isFinite(val)) {
                  onChangeClampKPa(val);
                  updateStressRange({ minKPa: -val, maxKPa: val });
                }
              }}
              className="border border-slate-300 rounded-xs bg-white px-1.5 py-0.5 text-[11px] font-mono"
            >
              {!isSymmetricRange && (
                <option value="custom">
                  Custom ({formatLegendNumericLabel(effectiveMinKPa, unit, false)}..
                  {formatLegendNumericLabel(effectiveMaxKPa, unit, true)})
                </option>
              )}
              <option value={50}>{unit === 'MPa' ? '±0.05 MPa' : '±50 kPa'}</option>
              <option value={100}>{unit === 'MPa' ? '±0.10 MPa' : '±100 kPa'}</option>
              <option value={250}>{unit === 'MPa' ? '±0.25 MPa' : '±250 kPa'}</option>
              <option value={500}>{unit === 'MPa' ? '±0.50 MPa' : '±500 kPa'}</option>
              <option value={1000}>{unit === 'MPa' ? '±1.00 MPa' : '±1000 kPa'}</option>
              <option value={2500}>{unit === 'MPa' ? '±2.50 MPa' : '±2500 kPa'}</option>
            </select>
          </label>

          {onChangeTargetDepthKm && (
            <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-700">
              <span>Eval Depth:</span>
              <input
                type="range"
                min={0}
                max={30}
                step={1}
                value={receiverModel.gridConfig.targetDepthKm}
                onChange={(e) => onChangeTargetDepthKm(Number(e.target.value))}
                className="w-20"
              />
              <span className="font-mono tabular-nums w-10 text-right">
                {receiverModel.gridConfig.targetDepthKm} km
              </span>
            </label>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_285px] gap-3">
        {/* SVG Map Canvas */}
        <div className="bg-[#edf4fc] border border-sky-700/60 rounded-lg overflow-hidden shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
          <div className="px-3 py-1.5 bg-[#dce9f8] border-b border-sky-700/40 flex items-center justify-between text-[11px]">
            <span className="font-semibold text-slate-800">
              Static Coulomb Stress Change (ΔCFS) —{' '}
              {hasComputedGrid
                ? `Depth ${result!.targetDepthKm} km · Grid ${result!.gridStepKm} km`
                : 'No Calculated Field (Run Solver)'}
              {isStale ? ' [STALE INPUTS]' : ''}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setZoomSpanDeg((z) => Math.max(0.25, Number((z * 0.72).toFixed(2))))}
                className="p-1 border border-slate-300 bg-white rounded-xs hover:bg-slate-100"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoomSpanDeg((z) => Math.min(16, Number((z * 1.38).toFixed(2))))}
                className="p-1 border border-slate-300 bg-white rounded-xs hover:bg-slate-100"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  const targetSpan =
                    result && result.gridHalfExtentKm > 0
                      ? Math.max(0.45, Math.min(10, (result.gridHalfExtentKm * 2.5) / 111.19))
                      : 1.8;
                  setZoomSpanDeg(Number(targetSpan.toFixed(2)));
                  setPanOffset({ dLat: 0, dLon: 0 });
                }}
                className="px-1.5 py-0.5 border border-slate-300 bg-white rounded-xs hover:bg-slate-100 font-medium"
              >
                Center
              </button>
              <button
                type="button"
                onClick={() => {
                  if (exportSvgElementAsSvg(svgRef.current, `coulomb_stress_${event.id}.svg`)) {
                    onNotice?.(`Exported coulomb_stress_${event.id}.svg`);
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
                    svgRef.current,
                    `coulomb_stress_${event.id}.png`,
                    2
                  ).then((ok) => ok && onNotice?.(`Exported coulomb_stress_${event.id}.png`))
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
                (downEv.target as Element)?.closest('[data-interactive="true"]')
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

              {/* Calculated Static Coulomb Stress Grid (Strictly from Okada Solver Output) */}
              {showStressGrid &&
                hasComputedGrid &&
                (() => {
                  const res = result!;
                  const stepLatDeg = res.gridStepKm / kmPerLatDeg;
                  const cosLat = Math.max(0.35, Math.cos(res.originLat * DEG2RAD));
                  const stepLonDeg = res.gridStepKm / (kmPerLatDeg * cosLat);
                  const cellW =
                    (stepLonDeg / Math.max(1e-6, mapBounds.maxLon - mapBounds.minLon)) * MAP_W;
                  const cellH =
                    (stepLatDeg / Math.max(1e-6, mapBounds.maxLat - mapBounds.minLat)) * MAP_H;

                  return (
                    <g opacity={0.78}>
                      {res.gridCells.map((cell) => {
                        const cPt = projectCoord(cell.lat, cell.lon);
                        if (
                          cPt.x + cellW < 0 ||
                          cPt.x - cellW > MAP_W ||
                          cPt.y + cellH < 0 ||
                          cPt.y - cellH > MAP_H
                        ) {
                          return null;
                        }
                        const isSel =
                          selectedCell?.ix === cell.ix && selectedCell?.iy === cell.iy;
                        return (
                          <rect
                            key={`cell-${cell.ix}-${cell.iy}`}
                            data-interactive="true"
                            x={cPt.x - cellW * 0.5}
                            y={cPt.y - cellH * 0.5}
                            width={Math.max(1.5, cellW + 0.4)}
                            height={Math.max(1.5, cellH + 0.4)}
                            fill={cfsColorInRange(
                              cell.deltaCfsKPa,
                              effectiveMinKPa,
                              effectiveMaxKPa,
                              colorScheme
                            )}
                            stroke={isSel ? '#0f172a' : cell.nearFaultSingular ? '#f59e0b' : 'none'}
                            strokeWidth={isSel ? 1.5 : cell.nearFaultSingular ? 0.6 : 0}
                            onMouseEnter={() => setHoveredCell(cell)}
                            onMouseLeave={() => setHoveredCell(null)}
                            onClick={() => {
                              setSelectedCell(cell);
                              setSelectedReceiver(null);
                            }}
                          />
                        );
                      })}
                    </g>
                  );
                })()}

              {/* Tectonic Plates & PHIVOLCS Active Faults / Trenches */}
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
                      strokeWidth={1.0}
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
                      strokeWidth={0.9}
                      strokeOpacity={0.5}
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
                        stroke="#92400e"
                        strokeOpacity={0.6}
                        strokeWidth={1.0}
                      />
                    );
                  });
                })}

              {showGisFaults &&
                trenches?.features.slice(0, 200).flatMap((f, idx) => {
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
                        key={`tr-${idx}-${lIdx}`}
                        points={ptStr}
                        fill="none"
                        stroke="#0369a1"
                        strokeOpacity={0.45}
                        strokeWidth={1.2}
                        strokeDasharray="4 3"
                      />
                    );
                  });
                })}

              {/* Cross-section profile line */}
              {profileLine && (() => {
                const a = projectCoord(profileLine.p1.lat, profileLine.p1.lon);
                const b = projectCoord(profileLine.p2.lat, profileLine.p2.lon);
                return (
                  <g>
                    <line
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke="#0f172a"
                      strokeWidth={1.6}
                      strokeDasharray="5 3"
                    />
                    <text x={a.x + 4} y={a.y - 4} fontSize={10} fontWeight={700} fill="#0f172a">
                      A
                    </text>
                    <text x={b.x + 4} y={b.y - 4} fontSize={10} fontWeight={700} fill="#0f172a">
                      A&apos;
                    </text>
                  </g>
                );
              })()}

              {/* 3D Source Rupture Segment Footprints & Top Trace */}
              {showSourceFault &&
                segments.map((seg, idx) => {
                  const proj = computeSegmentSurfaceProjection(seg);
                  const ts = projectCoord(proj.topStart.lat, proj.topStart.lon);
                  const te = projectCoord(proj.topEnd.lat, proj.topEnd.lon);
                  const bs = projectCoord(proj.bottomStart.lat, proj.bottomStart.lon);
                  const be = projectCoord(proj.bottomEnd.lat, proj.bottomEnd.lon);
                  const dts = projectCoord(proj.dipTickStart.lat, proj.dipTickStart.lon);
                  const dte = projectCoord(proj.dipTickEnd.lat, proj.dipTickEnd.lon);
                  return (
                    <g key={`seg-map-${seg.id}-${idx}`}>
                      <polygon
                        points={`${ts.x},${ts.y} ${te.x},${te.y} ${be.x},${be.y} ${bs.x},${bs.y}`}
                        fill="#1e293b"
                        fillOpacity={0.16}
                        stroke="#475569"
                        strokeWidth={1}
                        strokeDasharray="3 2"
                      />
                      <line
                        x1={ts.x}
                        y1={ts.y}
                        x2={te.x}
                        y2={te.y}
                        stroke="#0f172a"
                        strokeWidth={3.2}
                      />
                      <line
                        x1={dts.x}
                        y1={dts.y}
                        x2={dte.x}
                        y2={dte.y}
                        stroke="#0f172a"
                        strokeWidth={2}
                      />
                      <text
                        x={0.5 * (ts.x + te.x) + 6}
                        y={0.5 * (ts.y + te.y) - 6}
                        fontSize={10}
                        fontWeight={700}
                        fill="#0f172a"
                      >
                        {seg.name || `Seg ${idx + 1}`}
                      </text>
                    </g>
                  );
                })}

              {/* Pointwise Receivers */}
              {showReceivers &&
                result?.pointEvaluations.map((pt) => {
                  const p = projectCoord(pt.lat, pt.lon);
                  const sRad = pt.strikeDeg * DEG2RAD;
                  const dx = Math.sin(sRad) * 9;
                  const dy = -Math.cos(sRad) * 9;
                  const col =
                    pt.deltaCfsKPa > 1
                      ? colorScheme.positiveColor
                      : pt.deltaCfsKPa < -1
                        ? colorScheme.negativeColor
                        : '#475569';
                  return (
                    <g
                      key={`rcv-${pt.id}`}
                      data-interactive="true"
                      className="cursor-pointer"
                      onClick={() => {
                        setSelectedReceiver(pt);
                        setSelectedCell(null);
                      }}
                    >
                      <title>{`${pt.name}: ΔCFS=${formatStressValue(pt.deltaCfsKPa, unit)}`}</title>
                      <line
                        x1={p.x - dx}
                        y1={p.y - dy}
                        x2={p.x + dx}
                        y2={p.y + dy}
                        stroke="#0f172a"
                        strokeWidth={2}
                      />
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={5}
                        fill={col}
                        stroke="#ffffff"
                        strokeWidth={1.3}
                      />
                      <text x={p.x + 8} y={p.y + 3} fontSize={9.5} fontWeight={600} fill="#0f172a">
                        {pt.name}
                      </text>
                    </g>
                  );
                })}

              {/* Reference Earthquake Epicenter */}
              {!unlocated && (() => {
                const ep = projectCoord(event.lat, event.lon);
                return (
                  <g>
                    <circle
                      cx={ep.x}
                      cy={ep.y}
                      r={6.5}
                      fill="#facc15"
                      stroke="#7f1d1d"
                      strokeWidth={1.5}
                    />
                    <text x={ep.x + 9} y={ep.y + 3} fontSize={10} fontWeight={700} fill="#7f1d1d">
                      EQ {event.id}
                    </text>
                  </g>
                );
              })()}

              {/* Color-Coded Diverging Legend inside SVG for PNG/SVG export (draggable anywhere on map) */}
              {showLegend && (
                <g
                  data-interactive="true"
                  data-legend-draggable="true"
                  role="group"
                  tabIndex={0}
                  aria-label="Draggable Coulomb stress legend. Drag to reposition on map, arrow keys to nudge, Home to reset."
                  transform={`translate(${legendPos.x}, ${legendPos.y})`}
                  style={{ touchAction: 'none' }}
                  className={isDraggingLegend ? 'cursor-grabbing outline-none' : 'cursor-grab outline-none'}
                  onMouseDown={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    updateLegendPos(DEFAULT_LEGEND_POS);
                  }}
                  onKeyDown={(e) => {
                    const step = e.shiftKey ? 36 : 12;
                    if (e.key === 'ArrowLeft') {
                      e.preventDefault();
                      updateLegendPos(clampLegendCoords(legendPos.x - step, legendPos.y));
                    } else if (e.key === 'ArrowRight') {
                      e.preventDefault();
                      updateLegendPos(clampLegendCoords(legendPos.x + step, legendPos.y));
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      updateLegendPos(clampLegendCoords(legendPos.x, legendPos.y - step));
                    } else if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      updateLegendPos(clampLegendCoords(legendPos.x, legendPos.y + step));
                    } else if (e.key === 'Home') {
                      e.preventDefault();
                      updateLegendPos(DEFAULT_LEGEND_POS);
                    }
                  }}
                  onPointerDown={(downEv) => {
                    if (downEv.pointerType === 'mouse' && downEv.button !== 0) return;
                    downEv.stopPropagation();
                    downEv.preventDefault();
                    legendDragCleanupRef.current?.();
                    const svgRect = svgRef.current?.getBoundingClientRect();
                    const scaleX = svgRect && svgRect.width > 0 ? MAP_W / svgRect.width : 1;
                    const scaleY = svgRect && svgRect.height > 0 ? MAP_H / svgRect.height : 1;
                    const startClientX = downEv.clientX;
                    const startClientY = downEv.clientY;
                    const startPos = { ...legendPos };
                    setIsDraggingLegend(true);

                    const onMove = (moveEv: PointerEvent) => {
                      const next = clampLegendCoords(
                        startPos.x + (moveEv.clientX - startClientX) * scaleX,
                        startPos.y + (moveEv.clientY - startClientY) * scaleY
                      );
                      updateLegendPos(next);
                    };

                    const cleanup = () => {
                      window.removeEventListener('pointermove', onMove);
                      window.removeEventListener('pointerup', cleanup);
                      window.removeEventListener('pointercancel', cleanup);
                      legendDragCleanupRef.current = null;
                      setIsDraggingLegend(false);
                    };

                    legendDragCleanupRef.current = cleanup;
                    window.addEventListener('pointermove', onMove);
                    window.addEventListener('pointerup', cleanup);
                    window.addEventListener('pointercancel', cleanup);
                  }}
                >
                  <title>Drag to reposition legend on the map (double-click to reset)</title>
                  <rect
                    x={0}
                    y={0}
                    width={LEGEND_BOX_W}
                    height={LEGEND_BOX_H}
                    rx={2}
                    fill="#ffffff"
                    fillOpacity={legendBgOpacity}
                    stroke={isDraggingLegend ? '#2563eb' : '#94a3b8'}
                    strokeWidth={isDraggingLegend ? 1.5 : 0.9}
                  />
                  {/* Subtle 6-dot drag grip handle in upper-right corner */}
                  <g fill={isDraggingLegend ? '#2563eb' : '#94a3b8'}>
                    <circle cx={251} cy={9.5} r={1.1} />
                    <circle cx={255} cy={9.5} r={1.1} />
                    <circle cx={259} cy={9.5} r={1.1} />
                    <circle cx={251} cy={13.5} r={1.1} />
                    <circle cx={255} cy={13.5} r={1.1} />
                    <circle cx={259} cy={13.5} r={1.1} />
                  </g>
                  <defs>
                    <linearGradient id="coulomb-svg-legend-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor={colorScheme.negativeColor} />
                      <stop offset={`${zeroPct}%`} stopColor={colorScheme.neutralColor} />
                      <stop offset="100%" stopColor={colorScheme.positiveColor} />
                    </linearGradient>
                  </defs>
                  <text x={10} y={16} fontSize={10} fontWeight={700} fill="#0f172a">
                    Coulomb Stress Change ΔCFS ({unit})
                  </text>
                  <rect
                    x={10}
                    y={23}
                    width={247.5}
                    height={12}
                    fill="url(#coulomb-svg-legend-gradient)"
                    stroke="#64748b"
                    strokeWidth={0.7}
                  />
                  {/* Dynamic tick marks and labels automatically aligned with the stress range */}
                  {dynamicLegendTicks.map((tick) => {
                    const tx = 10 + tick.frac * 247.5;
                    const textColor =
                      tick.role === 'negative'
                        ? colorScheme.negativeColor
                        : tick.role === 'positive'
                          ? colorScheme.positiveColor
                          : '#334155';
                    return (
                      <g key={`svg-tick-${tick.valueKPa.toFixed(2)}`}>
                        <line
                          x1={tx}
                          y1={tick.role === 'zero' ? 21 : 35}
                          x2={tx}
                          y2={38}
                          stroke="#334155"
                          strokeWidth={tick.role === 'zero' ? 1.1 : 0.8}
                        />
                        <text
                          x={tx}
                          y={49}
                          fontSize={tick.isEndpointOrZero ? 8.6 : 8.1}
                          fill={textColor}
                          opacity={tick.isEndpointOrZero ? 1 : 0.9}
                          fontWeight={tick.isEndpointOrZero ? 700 : 500}
                          textAnchor={tick.align}
                        >
                          {tick.label}
                        </text>
                      </g>
                    );
                  })}
                  {/* Active hovered/selected cell/receiver indicator aligned to the gradient */}
                  {(() => {
                    const inspectedKPa = selectedReceiver?.deltaCfsKPa ?? activeCell?.deltaCfsKPa;
                    if (inspectedKPa === undefined || !Number.isFinite(inspectedKPa)) return null;
                    const markerFrac = Math.max(
                      0,
                      Math.min(1, (inspectedKPa - effectiveMinKPa) / rangeSpanKPa)
                    );
                    const mx = 10 + markerFrac * 247.5;
                    return (
                      <g>
                        <line x1={mx} y1={21} x2={mx} y2={37} stroke="#0f172a" strokeWidth={1.5} />
                        <polygon points={`${mx - 3},20 ${mx + 3},20 ${mx},24`} fill="#0f172a" />
                      </g>
                    );
                  })()}
                  <text x={10} y={64} fontSize={8.8} fill={colorScheme.negativeColor} fontWeight={700}>
                    ← Failure-Inhibiting (−)
                  </text>
                  <text x={257.5} y={64} fontSize={8.8} fill={colorScheme.positiveColor} fontWeight={700} textAnchor="end">
                    Failure-Promoting (+) →
                  </text>
                  <line x1={10} y1={71} x2={257.5} y2={71} stroke="#e2e8f0" strokeWidth={0.8} />
                  <text x={10} y={83} fontSize={8.1} fill="#64748b">
                    Static ΔCFS = Δτ + μ&apos;Δσn · Range {formatLegendNumericLabel(effectiveMinKPa, unit, true)} to{' '}
                    {formatLegendNumericLabel(effectiveMaxKPa, unit, true)}
                  </text>
                </g>
              )}
            </svg>

            <div className="absolute bottom-2 right-2 pointer-events-none">
              <MapScaleBar metersPerPixel={1000 / Math.max(0.01, pxPerKm)} />
            </div>
          </div>
        </div>

        {/* Right Side Inspector */}
        <div className="space-y-3">
          <div className="bg-[#f1f4f9] border border-slate-600/70 rounded-lg p-3.5 text-xs space-y-2 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
            <div className="font-bold uppercase tracking-wide text-slate-800 border-b border-slate-600/35 pb-1">
              Cell / Receiver Inspector
            </div>
            {!hasComputedGrid ? (
              <div className="text-slate-600 py-2 px-2 bg-[#dfe6f0] border border-slate-700/60 rounded">
                No stress grid computed yet. Define source &amp; receiver models, then click Run Calculation.
              </div>
            ) : selectedReceiver ? (
              <div className="space-y-1.5 text-[11px] font-mono tabular-nums bg-[#dfe6f0] border border-slate-700/60 rounded p-2.5">
                <div className="font-sans font-bold text-slate-900">{selectedReceiver.name}</div>
                <div>
                  Pos: {selectedReceiver.lat.toFixed(4)}°N, {selectedReceiver.lon.toFixed(4)}°E @{' '}
                  {selectedReceiver.depthKm} km
                </div>
                <div>
                  Plane: {selectedReceiver.strikeDeg.toFixed(0)}°/{selectedReceiver.dipDeg.toFixed(0)}°/
                  {selectedReceiver.rakeDeg.toFixed(0)}° (μ&apos;={selectedReceiver.muEffective.toFixed(2)})
                </div>
                <div className="border-t border-slate-600/30 pt-1">
                  Δτ (Shear): {formatStressValue(selectedReceiver.deltaShearKPa, unit)}
                </div>
                <div>Δσn (Normal): {formatStressValue(selectedReceiver.deltaNormalKPa, unit)}</div>
                <div className="font-bold text-slate-900">
                  ΔCFS: {formatStressValue(selectedReceiver.deltaCfsKPa, unit)}
                </div>
                <div className="font-sans text-slate-700">{selectedReceiver.stressRegimeClass}</div>
                {selectedReceiver.nearFaultSingular && (
                  <div className="font-sans text-amber-900 bg-[#f3e6cc] border border-amber-800/60 px-2 py-1 rounded">
                    Near-fault singularity (&lt; 50 m from source edge).
                  </div>
                )}
              </div>
            ) : activeCell ? (
              <div className="space-y-1.5 text-[11px] font-mono tabular-nums bg-[#dfe6f0] border border-slate-700/60 rounded p-2.5">
                <div className="font-sans font-semibold text-slate-800">
                  Grid Cell [{activeCell.ix}, {activeCell.iy}]
                </div>
                <div>
                  Lat/Lon: {activeCell.lat.toFixed(4)}°N, {activeCell.lon.toFixed(4)}°E
                </div>
                <div>
                  Local (E, N): {activeCell.eastKm.toFixed(1)} km, {activeCell.northKm.toFixed(1)} km
                </div>
                <div>Eval Depth: {result!.targetDepthKm.toFixed(1)} km</div>
                <div className="border-t border-slate-600/30 pt-1">
                  Δτ (Shear): {formatStressValue(activeCell.deltaShearKPa, unit)}
                </div>
                <div>Δσn (Normal): {formatStressValue(activeCell.deltaNormalKPa, unit)}</div>
                <div className="font-bold text-slate-900">
                  ΔCFS: {formatStressValue(activeCell.deltaCfsKPa, unit)}
                </div>
                {activeCell.nearFaultSingular && (
                  <div className="font-sans text-amber-900 bg-[#f3e6cc] border border-amber-800/60 px-2 py-1 rounded">
                    Near-fault edge (&lt; 50 m); singular gradient possible.
                  </div>
                )}
              </div>
            ) : (
              <div className="text-slate-600 py-2 px-2 bg-[#dfe6f0] border border-slate-700/60 rounded">
                Hover or click any grid cell or receiver marker on the map to inspect Δτ, Δσn, and ΔCFS values.
              </div>
            )}
          </div>

          {/* Dedicated Color-Coded Stress Change Legend + Customization Panel */}
          {showLegend && (
            <div
              className="border border-slate-600/70 rounded-lg p-3.5 text-[11px] space-y-2 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]"
              style={{ backgroundColor: `rgba(245, 247, 250, ${legendBgOpacity})` }}
            >
              <div className="flex items-center justify-between border-b border-slate-600/35 pb-1 gap-2">
                <span className="font-bold uppercase tracking-wide text-slate-800">
                  Color-Coded ΔCFS Legend
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[10px] text-slate-500">
                    {isSymmetricRange
                      ? `±${unit === 'MPa' ? (effectiveMaxKPa / 1000).toFixed(2) : effectiveMaxKPa} ${unit}`
                      : `${formatLegendNumericLabel(effectiveMinKPa, unit, false)}..${formatLegendNumericLabel(
                          effectiveMaxKPa,
                          unit,
                          true
                        )}`}
                  </span>
                  <button
                    type="button"
                    aria-expanded={showCustomizePanel}
                    onClick={() => setShowCustomizePanel((v) => !v)}
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 border rounded-xs text-[10px] font-medium transition-colors ${
                      showCustomizePanel
                        ? 'bg-slate-800 text-white border-slate-800'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                    title="Customize positive/negative stress colors and legend opacity"
                  >
                    <Palette className="w-3 h-3" />
                    Customize
                  </button>
                </div>
              </div>

              {/* Continuous Diverging Bar with Dynamic Position-Aligned Numeric Labels */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] text-slate-600">
                  <span>Stress Gradient Scale</span>
                  <span className="font-mono font-semibold text-slate-800">
                    {formatLegendNumericLabel(effectiveMinKPa, unit, true)} to{' '}
                    {formatLegendNumericLabel(effectiveMaxKPa, unit, true)}
                  </span>
                </div>
                <div className="relative">
                  <div
                    className="h-3.5 w-full border border-slate-400 rounded-xs relative"
                    style={{
                      background: `linear-gradient(to right, ${colorScheme.negativeColor} 0%, ${colorScheme.neutralColor} ${zeroPct}%, ${colorScheme.positiveColor} 100%)`,
                    }}
                  >
                    {/* Dynamic Neutral (0) Divider Aligned to Gradient */}
                    <span
                      className="absolute top-0 bottom-0 w-px bg-slate-700/70"
                      style={{ left: `${zeroPct}%` }}
                    />
                    {/* Dynamic Inspected Cell / Receiver Pointer */}
                    {(() => {
                      const inspectedKPa = selectedReceiver?.deltaCfsKPa ?? activeCell?.deltaCfsKPa;
                      if (inspectedKPa === undefined || !Number.isFinite(inspectedKPa)) return null;
                      const markerPct = Math.max(
                        0,
                        Math.min(100, ((inspectedKPa - effectiveMinKPa) / rangeSpanKPa) * 100)
                      );
                      return (
                        <span
                          title={`Selected/Hovered ΔCFS: ${formatStressValue(inspectedKPa, unit)}`}
                          className="absolute -top-0.5 -bottom-0.5 w-1 bg-slate-900 border border-white rounded-xs -translate-x-1/2"
                          style={{ left: `${markerPct.toFixed(2)}%` }}
                        />
                      );
                    })()}
                  </div>
                  {/* Dynamic tick marks + labels positioned proportionally along the bar */}
                  <div className="relative h-5 w-full mt-0.5 font-mono text-[9.5px] tabular-nums select-none">
                    {dynamicLegendTicks.map((tick) => {
                      const textColor =
                        tick.role === 'negative'
                          ? colorScheme.negativeColor
                          : tick.role === 'positive'
                            ? colorScheme.positiveColor
                            : '#334155';
                      const translateX =
                        tick.align === 'start'
                          ? '0%'
                          : tick.align === 'end'
                            ? '-100%'
                            : '-50%';
                      return (
                        <div
                          key={`side-tick-${tick.valueKPa.toFixed(2)}`}
                          className="absolute top-0 flex flex-col items-center leading-none"
                          style={{
                            left: `${tick.pct.toFixed(2)}%`,
                            transform: `translateX(${translateX})`,
                          }}
                        >
                          <span
                            className="w-px h-1 bg-slate-500 mb-0.5"
                            style={{
                              alignSelf:
                                tick.align === 'start'
                                  ? 'flex-start'
                                  : tick.align === 'end'
                                    ? 'flex-end'
                                    : 'center',
                            }}
                          />
                          <span
                            className={tick.isEndpointOrZero ? 'font-semibold whitespace-nowrap' : 'opacity-85 whitespace-nowrap'}
                            style={{ color: textColor }}
                          >
                            {tick.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Legend Customization Sub-Panel: Color Schemes, Range Bounds & Background Opacity */}
              {showCustomizePanel && (
                <div className="bg-slate-50/90 border border-slate-200 rounded-xs p-2 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-700">
                      Color Scheme &amp; Appearance
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        updateColorScheme(DEFAULT_COULOMB_COLOR_SCHEME);
                        updateLegendBgOpacity(1);
                        onNotice?.('Reset legend color scheme to default and background opacity to 100%.');
                      }}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 border border-slate-300 bg-white text-slate-700 rounded-xs text-[10px] font-medium hover:bg-slate-100"
                      title="Restore default stress color scheme and 100% background opacity"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                      Reset Legend
                    </button>
                  </div>

                  {/* Quick Scientific Palette Presets */}
                  <div className="grid grid-cols-2 gap-1">
                    {COULOMB_COLOR_PRESETS.map((preset) => {
                      const active = colorScheme.presetId === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() =>
                            updateColorScheme({
                              presetId: preset.id,
                              positiveColor: preset.positiveColor,
                              negativeColor: preset.negativeColor,
                              neutralColor: preset.neutralColor,
                            })
                          }
                          className={`flex items-center gap-1.5 px-1.5 py-1 border rounded-xs text-[10px] text-left transition-colors ${
                            active
                              ? 'border-slate-800 bg-white font-semibold text-slate-900'
                              : 'border-slate-300 bg-white/80 text-slate-700 hover:bg-white'
                          }`}
                        >
                          <span className="inline-flex shrink-0 border border-slate-400 rounded-xs overflow-hidden">
                            <span
                              className="w-2.5 h-2.5 inline-block"
                              style={{ backgroundColor: preset.negativeColor }}
                            />
                            <span
                              className="w-2.5 h-2.5 inline-block"
                              style={{ backgroundColor: preset.positiveColor }}
                            />
                          </span>
                          <span className="truncate">{preset.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Custom Positive / Negative Color Pickers */}
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex items-center justify-between gap-1.5 bg-white border border-slate-300 rounded-xs px-1.5 py-1 cursor-pointer">
                      <span className="text-[10px] font-medium text-slate-700">Positive (+)</span>
                      <span className="inline-flex items-center gap-1">
                        <span className="font-mono text-[9.5px] text-slate-500 uppercase">
                          {colorScheme.positiveColor}
                        </span>
                        <input
                          type="color"
                          aria-label="Positive Coulomb stress color"
                          value={colorScheme.positiveColor}
                          onChange={(e) =>
                            updateColorScheme({
                              ...colorScheme,
                              presetId: 'custom',
                              positiveColor: e.target.value,
                            })
                          }
                          className="w-5 h-4 p-0 border border-slate-300 rounded-xs cursor-pointer bg-transparent"
                        />
                      </span>
                    </label>

                    <label className="flex items-center justify-between gap-1.5 bg-white border border-slate-300 rounded-xs px-1.5 py-1 cursor-pointer">
                      <span className="text-[10px] font-medium text-slate-700">Negative (−)</span>
                      <span className="inline-flex items-center gap-1">
                        <span className="font-mono text-[9.5px] text-slate-500 uppercase">
                          {colorScheme.negativeColor}
                        </span>
                        <input
                          type="color"
                          aria-label="Negative Coulomb stress color"
                          value={colorScheme.negativeColor}
                          onChange={(e) =>
                            updateColorScheme({
                              ...colorScheme,
                              presetId: 'custom',
                              negativeColor: e.target.value,
                            })
                          }
                          className="w-5 h-4 p-0 border border-slate-300 rounded-xs cursor-pointer bg-transparent"
                        />
                      </span>
                    </label>
                  </div>

                  {/* Dynamic Stress Range Bounds (adjusts gradient alignment & tick positions) */}
                  <div className="space-y-1.5 pt-1 border-t border-slate-200">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[10px] font-medium text-slate-700">
                        Gradient Range Bounds
                      </span>
                      <div className="inline-flex items-center gap-1">
                        {hasComputedGrid && (
                          <button
                            type="button"
                            onClick={() => {
                              const minObs = Math.min(-10, Math.floor(result!.maxNegativeCfsKPa));
                              const maxObs = Math.max(10, Math.ceil(result!.maxPositiveCfsKPa));
                              updateStressRange({
                                minKPa: Math.max(-2500, minObs),
                                maxKPa: Math.min(2500, maxObs),
                              });
                            }}
                            className="px-1.5 py-0.5 border border-slate-300 bg-white text-slate-700 rounded-xs text-[9.5px] font-medium hover:bg-slate-100"
                            title="Fit gradient min/max bounds to calculated grid results"
                          >
                            Fit Data
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => updateStressRange({ minKPa: -clampKPa, maxKPa: clampKPa })}
                          className="px-1.5 py-0.5 border border-slate-300 bg-white text-slate-700 rounded-xs text-[9.5px] font-medium hover:bg-slate-100"
                          title="Reset range bounds to symmetric ± scale"
                        >
                          Symmetric ±
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block space-y-0.5">
                        <div className="flex items-center justify-between text-[9.5px] text-slate-600">
                          <span>Min (−)</span>
                          <span className="font-mono font-semibold" style={{ color: colorScheme.negativeColor }}>
                            {formatLegendNumericLabel(effectiveMinKPa, unit, true)}
                          </span>
                        </div>
                        <input
                          type="range"
                          aria-label="Legend minimum stress range"
                          min={-2500}
                          max={-10}
                          step={10}
                          value={Math.max(-2500, Math.min(-10, effectiveMinKPa))}
                          onChange={(e) =>
                            updateStressRange({
                              minKPa: Number(e.target.value),
                              maxKPa: effectiveMaxKPa,
                            })
                          }
                          className="w-full h-1.5 accent-slate-800 cursor-pointer"
                        />
                      </label>
                      <label className="block space-y-0.5">
                        <div className="flex items-center justify-between text-[9.5px] text-slate-600">
                          <span>Max (+)</span>
                          <span className="font-mono font-semibold" style={{ color: colorScheme.positiveColor }}>
                            {formatLegendNumericLabel(effectiveMaxKPa, unit, true)}
                          </span>
                        </div>
                        <input
                          type="range"
                          aria-label="Legend maximum stress range"
                          min={10}
                          max={2500}
                          step={10}
                          value={Math.min(2500, Math.max(10, effectiveMaxKPa))}
                          onChange={(e) =>
                            updateStressRange({
                              minKPa: effectiveMinKPa,
                              maxKPa: Number(e.target.value),
                            })
                          }
                          className="w-full h-1.5 accent-slate-800 cursor-pointer"
                        />
                      </label>
                    </div>
                  </div>

                  {/* Legend Background Opacity Slider */}
                  <label className="block space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-slate-700">
                      <span className="font-medium">Legend Background Opacity</span>
                      <span className="font-mono tabular-nums font-semibold">
                        {Math.round(legendBgOpacity * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      aria-label="Legend background opacity"
                      min={0.15}
                      max={1}
                      step={0.05}
                      value={legendBgOpacity}
                      onChange={(e) => updateLegendBgOpacity(Number(e.target.value))}
                      className="w-full h-1.5 accent-slate-800 cursor-pointer"
                    />
                  </label>
                </div>
              )}

              {/* Regime Classification Swatches */}
              <div className="space-y-1.5 pt-1 border-t border-slate-200">
                <div className="flex items-start gap-2">
                  <span
                    className="w-3.5 h-3.5 mt-0.5 shrink-0 border border-slate-700/40 rounded-xs"
                    style={{
                      backgroundColor: cfsColorInRange(
                        0.8 * effectiveMaxKPa,
                        effectiveMinKPa,
                        effectiveMaxKPa,
                        colorScheme
                      ),
                    }}
                  />
                  <div>
                    <div className="font-semibold" style={{ color: colorScheme.positiveColor }}>
                      Positive ΔCFS — Failure-Promoting
                    </div>
                    <div className="text-[10px] text-slate-600">
                      Stress-loaded lobe (+Δτ or +Δσn unclamping &gt; {formatStressValue(1, unit)}). Brings target plane closer to Coulomb failure.
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <span
                    className="w-3.5 h-3.5 mt-0.5 shrink-0 border border-slate-400 rounded-xs"
                    style={{
                      backgroundColor: cfsColorInRange(
                        0,
                        effectiveMinKPa,
                        effectiveMaxKPa,
                        colorScheme
                      ),
                    }}
                  />
                  <div>
                    <div className="font-semibold text-slate-800">
                      Neutral ΔCFS (≈ 0)
                    </div>
                    <div className="text-[10px] text-slate-600">
                      Negligible static stress change ({unit === 'MPa' ? '−0.001 to +0.001 MPa' : '−1 to +1 kPa'}).
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <span
                    className="w-3.5 h-3.5 mt-0.5 shrink-0 border border-slate-700/40 rounded-xs"
                    style={{
                      backgroundColor: cfsColorInRange(
                        0.8 * effectiveMinKPa,
                        effectiveMinKPa,
                        effectiveMaxKPa,
                        colorScheme
                      ),
                    }}
                  />
                  <div>
                    <div className="font-semibold" style={{ color: colorScheme.negativeColor }}>
                      Negative ΔCFS — Failure-Inhibiting
                    </div>
                    <div className="text-[10px] text-slate-600">
                      Stress shadow / clamping lobe (&lt; {formatStressValue(-1, unit)}). Static stress change opposes receiver slip.
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-0.5">
                  <span className="w-3.5 h-3.5 shrink-0 border-2 border-amber-500 bg-slate-100 rounded-xs" />
                  <span className="text-[10px] text-slate-700">
                    Amber outline: near-fault edge cell (&lt; 50 m)
                  </span>
                </div>
              </div>

              {/* Map Overlay Symbology */}
              <div className="pt-1.5 border-t border-slate-200 space-y-1 text-[10px] text-slate-700">
                <div className="font-bold uppercase tracking-wide text-slate-800">
                  Fault &amp; Map Symbology
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-4 h-0.5 bg-slate-900 inline-block shrink-0" />
                  <span>Source fault top edge + down-dip tick</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-4 h-2.5 border border-dashed border-slate-600 bg-slate-800/15 inline-block shrink-0" />
                  <span>Down-dip horizontal rupture projection</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-0.5 shrink-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full border border-white inline-block"
                      style={{ backgroundColor: colorScheme.positiveColor }}
                    />
                    <span
                      className="w-2.5 h-2.5 rounded-full border border-white inline-block"
                      style={{ backgroundColor: colorScheme.negativeColor }}
                    />
                  </span>
                  <span>Receiver point (+ΔCFS / −ΔCFS)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 border border-red-900 inline-block shrink-0" />
                  <span>Reference EQP epicenter</span>
                </div>
                <div className="pt-0.5 text-slate-600">
                  <strong>ΔCFS = Δτ + μ&apos;·Δσn</strong> (+Δσn = unclamping)
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Optional Cross-Section Vertical Depth Profile */}
      {result && result.crossSectionCells.length > 0 && crossRows > 0 && (
        <div className="bg-[#edf4fc] border border-sky-700/60 rounded-lg p-3.5 space-y-2 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
          <div className="flex items-center justify-between text-xs border-b border-sky-700/35 pb-1.5">
            <span className="font-bold text-slate-800">
              Vertical Cross-Section A–A&apos; (Azimuth {receiverModel.gridConfig.profileAzimuthDeg}°,{' '}
              0 to {receiverModel.gridConfig.profileMaxDepthKm} km depth)
            </span>
            <span className="text-[11px] text-slate-600 font-mono">
              Uniform receiver {receiverModel.uniformOrientation.strikeDeg}°/
              {receiverModel.uniformOrientation.dipDeg}°/{receiverModel.uniformOrientation.rakeDeg}°
            </span>
          </div>
          <svg viewBox="0 0 760 220" className="w-full h-auto block border border-slate-200 bg-slate-50">
            {(() => {
              const padL = 52;
              const padR = 16;
              const padT = 14;
              const padB = 30;
              const plotW = 760 - padL - padR;
              const plotH = 220 - padT - padB;
              const cw = plotW / crossCols;
              const ch = plotH / crossRows;
              return (
                <>
                  {result.crossSectionCells.map((c) => (
                    <rect
                      key={`cs-${c.ia}-${c.iz}`}
                      x={padL + c.ia * cw}
                      y={padT + c.iz * ch}
                      width={cw + 0.5}
                      height={ch + 0.5}
                      fill={cfsColorInRange(
                        c.deltaCfsKPa,
                        effectiveMinKPa,
                        effectiveMaxKPa,
                        colorScheme
                      )}
                    >
                      <title>{`Along=${c.alongKm.toFixed(1)} km, Depth=${c.depthKm.toFixed(1)} km, ΔCFS=${formatStressValue(c.deltaCfsKPa, unit)}`}</title>
                    </rect>
                  ))}
                  <rect
                    x={padL}
                    y={padT}
                    width={plotW}
                    height={plotH}
                    fill="none"
                    stroke="#475569"
                    strokeWidth={1}
                  />
                  <text x={padL} y={208} fontSize={10} fill="#334155">
                    A (−{receiverModel.gridConfig.profileHalfLengthKm} km)
                  </text>
                  <text x={padL + plotW * 0.5} y={208} fontSize={10} fill="#334155" textAnchor="middle">
                    0 km
                  </text>
                  <text x={padL + plotW} y={208} fontSize={10} fill="#334155" textAnchor="end">
                    A&apos; (+{receiverModel.gridConfig.profileHalfLengthKm} km)
                  </text>
                  <text x={padL - 6} y={padT + 9} fontSize={9.5} fill="#334155" textAnchor="end">
                    0 km
                  </text>
                  <text x={padL - 6} y={padT + plotH} fontSize={9.5} fill="#334155" textAnchor="end">
                    {receiverModel.gridConfig.profileMaxDepthKm} km
                  </text>
                </>
              );
            })()}
          </svg>
        </div>
      )}
    </div>
  );
};

interface SensitivityChartsProps {
  result: CoulombCalculationResult;
  unit: CoulombStressUnit;
}

export const CoulombSensitivityCharts: React.FC<SensitivityChartsProps> = ({ result, unit }) => {
  const factor = unit === 'MPa' ? 1 / 1000 : 1;

  const depthData = useMemo(
    () =>
      result.depthSensitivity.map((d) => ({
        depthKm: d.value,
        cfs: Number((d.deltaCfsKPa * factor).toFixed(3)),
        shear: Number((d.deltaShearKPa * factor).toFixed(3)),
        normal: Number((d.deltaNormalKPa * factor).toFixed(3)),
      })),
    [result.depthSensitivity, factor]
  );

  const frictionData = useMemo(
    () =>
      result.frictionSensitivity.map((d) => ({
        mu: d.paramLabel,
        cfs: Number((d.deltaCfsKPa * factor).toFixed(3)),
        shear: Number((d.deltaShearKPa * factor).toFixed(3)),
        normal: Number((d.deltaNormalKPa * factor).toFixed(3)),
      })),
    [result.frictionSensitivity, factor]
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <div className="bg-[#f3f1fb] border border-indigo-700/60 rounded-lg p-3.5 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
        <div className="text-xs font-bold text-slate-800 mb-2 border-b border-indigo-700/35 pb-1">
          Depth Sensitivity at Primary Receiver ({unit})
        </div>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={depthData} margin={{ top: 6, right: 16, left: 4, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="depthKm"
                tick={{ fontSize: 10 }}
                label={{ value: 'Depth (km)', position: 'insideBottom', offset: -4, fontSize: 10 }}
              />
              <YAxis tick={{ fontSize: 10 }} width={52} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <ReferenceLine y={0} stroke="#64748b" strokeDasharray="3 3" />
              <Line type="monotone" dataKey="cfs" name={`ΔCFS (${unit})`} stroke="#b91c1c" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="shear" name={`Δτ (${unit})`} stroke="#0f172a" strokeWidth={1.5} dot={false} />
              <Line type="monotone" dataKey="normal" name={`Δσn (${unit})`} stroke="#0284c7" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-[#edf4fc] border border-sky-700/60 rounded-lg p-3.5 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
        <div className="text-xs font-bold text-slate-800 mb-2 border-b border-sky-700/35 pb-1">
          Effective Friction μ&apos; Sensitivity at Primary Receiver ({unit})
        </div>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={frictionData} margin={{ top: 6, right: 16, left: 4, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="mu"
                tick={{ fontSize: 10 }}
                label={{ value: "Effective Friction μ'", position: 'insideBottom', offset: -4, fontSize: 10 }}
              />
              <YAxis tick={{ fontSize: 10 }} width={52} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <ReferenceLine y={0} stroke="#64748b" strokeDasharray="3 3" />
              <Line type="monotone" dataKey="cfs" name={`ΔCFS (${unit})`} stroke="#b91c1c" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="shear" name={`Δτ (${unit})`} stroke="#0f172a" strokeWidth={1.3} dot={false} />
              <Line type="monotone" dataKey="normal" name={`Δσn (${unit})`} stroke="#0284c7" strokeWidth={1.3} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
