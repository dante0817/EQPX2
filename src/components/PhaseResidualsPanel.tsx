import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileImage,
  RotateCcw,
} from 'lucide-react';
import { EQPEvent, PickQuality } from '../data/eqpData';
import {
  analyzePhaseResiduals,
  buildPhaseResidualCsv,
  buildPhaseResidualSummaryText,
  DistanceUnit,
  LinearRegressionFit,
  PhaseResidualAnalysis,
  PhaseResidualPoint,
  ResidualStatus,
} from '../utils/phaseResiduals';
import { triggerTextDownload } from './HistoricalBeachballIcon';

interface PhaseResidualsPanelProps {
  event: EQPEvent;
  selectedStation: string | null;
  onSelectStation?: (sta: string | null) => void;
  onNotice?: (message: string) => void;
}

type SortKey = 'sta' | 'dist' | 'azim' | 'resP' | 'resS' | 'sMinusP' | 'quality' | 'status';

const ALL_QUALITIES: PickQuality[] = ['A', 'B', 'C', 'D'];

const CHART_WIDTH = 880;
const CHART_HEIGHT = 430;
const PAD = { top: 28, right: 32, bottom: 52, left: 66 };
const PLOT_W = CHART_WIDTH - PAD.left - PAD.right;
const PLOT_H = CHART_HEIGHT - PAD.top - PAD.bottom;

function niceAxisStep(span: number, targetTicks = 6): number {
  if (!Number.isFinite(span) || span <= 0) return 1;
  const rawStep = span / targetTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  if (norm <= 1.2) return 1 * mag;
  if (norm <= 2.2) return 2 * mag;
  if (norm <= 5.5) return 5 * mag;
  return 10 * mag;
}

function buildTicks(min: number, max: number, targetTicks = 6): number[] {
  const span = max - min;
  const step = niceAxisStep(span, targetTicks);
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 1e-6; v += step) {
    const clean = Math.abs(v) < step * 1e-6 ? 0 : Number(v.toFixed(6));
    ticks.push(clean);
  }
  return ticks;
}

function getMarkerColor(point: PhaseResidualPoint): string {
  if (point.excluded) return '#64748b';
  if (point.status === 'Critical') return '#dc2626';
  if (point.status === 'Warning') return '#d97706';
  return point.phase === 'P' ? '#2563eb' : '#0d9488';
}

function getStatusBadgeTextClass(status: ResidualStatus): string {
  switch (status) {
    case 'Critical':
      return 'text-rose-700 font-semibold';
    case 'Warning':
      return 'text-amber-700 font-semibold';
    case 'Excluded':
      return 'text-slate-500';
    default:
      return 'text-emerald-700 font-medium';
  }
}

function fmtSigned(val: number | null, digits = 2, unit = ''): string {
  if (val === null || !Number.isFinite(val)) return '—';
  const sign = val >= 0 ? '+' : '';
  return `${sign}${val.toFixed(digits)}${unit ? ` ${unit}` : ''}`;
}

function fmtUnsigned(val: number | null, digits = 2, unit = ''): string {
  if (val === null || !Number.isFinite(val)) return '—';
  return `${val.toFixed(digits)}${unit ? ` ${unit}` : ''}`;
}

function computeAxisBounds(
  analysis: PhaseResidualAnalysis,
  unit: DistanceUnit,
  symmetricY: boolean,
  outlierThresholdSec: number,
  showThreshold: boolean
): { xMin: number; xMax: number; yMin: number; yMax: number } {
  const maxD = unit === 'km' ? analysis.maxDistKm : analysis.maxDistDeg;
  const minD = unit === 'km' ? analysis.minDistKm : analysis.minDistDeg;
  const xMin = 0;
  const xSpan = Math.max(unit === 'km' ? 25 : 0.25, maxD - minD);
  const xMax = Math.max(unit === 'km' ? 50 : 0.5, maxD + xSpan * 0.08);

  const yValues = analysis.visiblePoints.map((p) => p.residualSec);
  if (showThreshold) {
    yValues.push(outlierThresholdSec, -outlierThresholdSec);
  }
  if (analysis.pStats.rmsSec !== null) {
    yValues.push(analysis.pStats.rmsSec, -analysis.pStats.rmsSec);
  }
  if (analysis.sStats.rmsSec !== null) {
    yValues.push(analysis.sStats.rmsSec, -analysis.sStats.rmsSec);
  }
  yValues.push(0);

  const rawMin = Math.min(...yValues);
  const rawMax = Math.max(...yValues);

  if (symmetricY) {
    const absMax = Math.max(0.5, Math.abs(rawMin), Math.abs(rawMax));
    const padded = Math.ceil((absMax * 1.15) * 4) / 4;
    return { xMin, xMax, yMin: -padded, yMax: padded };
  }

  const ySpan = Math.max(0.5, rawMax - rawMin);
  const padY = ySpan * 0.14;
  return {
    xMin,
    xMax,
    yMin: Math.min(-0.25, rawMin - padY),
    yMax: Math.max(0.25, rawMax + padY),
  };
}

function renderTrendLineCoords(
  reg: LinearRegressionFit | null,
  unit: DistanceUnit,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  toSvgX: (x: number) => number,
  toSvgY: (y: number) => number
): { x1: number; y1: number; x2: number; y2: number } | null {
  if (!reg) return null;
  const slope = unit === 'km' ? reg.slopePerKm : reg.slopePerDeg;
  const yStart = slope * xMin + reg.interceptSec;
  const yEnd = slope * xMax + reg.interceptSec;

  const clampY = (y: number) => Math.max(yMin, Math.min(yMax, y));
  return {
    x1: toSvgX(xMin),
    y1: toSvgY(clampY(yStart)),
    x2: toSvgX(xMax),
    y2: toSvgY(clampY(yEnd)),
  };
}

export const PhaseResidualsPanel: React.FC<PhaseResidualsPanelProps> = ({
  event,
  selectedStation,
  onSelectStation,
  onNotice,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);

  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>('km');
  const [showP, setShowP] = useState(true);
  const [showS, setShowS] = useState(true);
  const [includeExcluded, setIncludeExcluded] = useState(true);
  const [showRmsEnvelope, setShowRmsEnvelope] = useState(true);
  const [showLinearTrend, setShowLinearTrend] = useState(true);
  const [showOutlierGuides, setShowOutlierGuides] = useState(true);
  const [connectStationPairs, setConnectStationPairs] = useState(true);
  const [showStationLabels, setShowStationLabels] = useState(true);
  const [symmetricY, setSymmetricY] = useState(true);
  const [outlierThresholdSec, setOutlierThresholdSec] = useState(0.5);
  const [activeQualities, setActiveQualities] = useState<PickQuality[]>(ALL_QUALITIES);

  const [hoveredPoint, setHoveredPoint] = useState<PhaseResidualPoint | null>(null);
  const [probeCoords, setProbeCoords] = useState<{
    dist: number;
    res: number;
    svgX: number;
    svgY: number;
  } | null>(null);

  const [sortKey, setSortKey] = useState<SortKey>('dist');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [copiedSummary, setCopiedSummary] = useState(false);

  const analysis = useMemo(
    () =>
      analyzePhaseResiduals(event, {
        showP,
        showS,
        includeExcluded,
        qualities: activeQualities,
        outlierThresholdSec,
      }),
    [event, showP, showS, includeExcluded, activeQualities, outlierThresholdSec]
  );

  const filteredPhaseCounts = useMemo(() => {
    let p = 0;
    let s = 0;
    for (const pt of analysis.allPoints) {
      if (!includeExcluded && pt.excluded) continue;
      if (!activeQualities.includes(pt.quality)) continue;
      if (pt.phase === 'P') p += 1;
      else s += 1;
    }
    return { p, s };
  }, [analysis.allPoints, includeExcluded, activeQualities]);

  const toggleShowP = () => {
    setShowP((prev) => {
      const next = !prev;
      if (!next) {
        setHoveredPoint((curr) => (curr?.phase === 'P' ? null : curr));
      }
      return next;
    });
  };

  const toggleShowS = () => {
    setShowS((prev) => {
      const next = !prev;
      if (!next) {
        setHoveredPoint((curr) => (curr?.phase === 'S' ? null : curr));
      }
      return next;
    });
  };

  const { xMin, xMax, yMin, yMax } = useMemo(
    () =>
      computeAxisBounds(
        analysis,
        distanceUnit,
        symmetricY,
        outlierThresholdSec,
        showOutlierGuides
      ),
    [analysis, distanceUnit, symmetricY, outlierThresholdSec, showOutlierGuides]
  );

  const toSvgX = (distVal: number): number =>
    PAD.left + ((distVal - xMin) / Math.max(1e-9, xMax - xMin)) * PLOT_W;

  const toSvgY = (resVal: number): number =>
    PAD.top + PLOT_H - ((resVal - yMin) / Math.max(1e-9, yMax - yMin)) * PLOT_H;

  const xTicks = useMemo(() => buildTicks(xMin, xMax, 7), [xMin, xMax]);
  const yTicks = useMemo(() => buildTicks(yMin, yMax, 6), [yMin, yMax]);

  const pTrendLine = useMemo(
    () =>
      showP && showLinearTrend
        ? renderTrendLineCoords(
            analysis.pStats.regression,
            distanceUnit,
            xMin,
            xMax,
            yMin,
            yMax,
            toSvgX,
            toSvgY
          )
        : null,
    [showP, showLinearTrend, analysis.pStats.regression, distanceUnit, xMin, xMax, yMin, yMax]
  );

  const sTrendLine = useMemo(
    () =>
      showS && showLinearTrend
        ? renderTrendLineCoords(
            analysis.sStats.regression,
            distanceUnit,
            xMin,
            xMax,
            yMin,
            yMax,
            toSvgX,
            toSvgY
          )
        : null,
    [showS, showLinearTrend, analysis.sStats.regression, distanceUnit, xMin, xMax, yMin, yMax]
  );

  const sortedPairs = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const statusOrder: Record<ResidualStatus, number> = {
      Critical: 3,
      Warning: 2,
      Nominal: 1,
      Excluded: 0,
    };
    const qualityOrder: Record<PickQuality, number> = { A: 4, B: 3, C: 2, D: 1 };

    return analysis.stationPairs.slice().sort((a, b) => {
      switch (sortKey) {
        case 'sta':
          return dir * a.sta.localeCompare(b.sta);
        case 'dist':
          return dir * (a.distKm - b.distKm);
        case 'azim':
          return dir * (a.azim - b.azim);
        case 'resP': {
          const va = a.resP ?? (sortDir === 'asc' ? Infinity : -Infinity);
          const vb = b.resP ?? (sortDir === 'asc' ? Infinity : -Infinity);
          return dir * (va - vb);
        }
        case 'resS': {
          const va = a.resS ?? (sortDir === 'asc' ? Infinity : -Infinity);
          const vb = b.resS ?? (sortDir === 'asc' ? Infinity : -Infinity);
          return dir * (va - vb);
        }
        case 'sMinusP': {
          const va = a.sMinusPResSec ?? (sortDir === 'asc' ? Infinity : -Infinity);
          const vb = b.sMinusPResSec ?? (sortDir === 'asc' ? Infinity : -Infinity);
          return dir * (va - vb);
        }
        case 'quality':
          return dir * (qualityOrder[a.quality] - qualityOrder[b.quality]);
        case 'status':
          return dir * (statusOrder[a.worstStatus] - statusOrder[b.worstStatus]);
      }
    });
  }, [analysis.stationPairs, sortKey, sortDir]);

  const toggleQuality = (q: PickQuality) => {
    setActiveQualities((prev) => {
      if (prev.includes(q)) {
        return prev.length > 1 ? prev.filter((item) => item !== q) : prev;
      }
      return [...prev, q];
    });
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const handleResetView = () => {
    setDistanceUnit('km');
    setShowP(true);
    setShowS(true);
    setIncludeExcluded(true);
    setShowRmsEnvelope(true);
    setShowLinearTrend(true);
    setShowOutlierGuides(true);
    setConnectStationPairs(true);
    setShowStationLabels(true);
    setSymmetricY(true);
    setOutlierThresholdSec(0.5);
    setActiveQualities(ALL_QUALITIES);
    onNotice?.('Reset phase residual chart filters and overlays to defaults.');
  };

  const handleDownloadCsv = () => {
    const csv = buildPhaseResidualCsv(event, analysis);
    const filename = `${event.id}_phase_residuals.csv`;
    triggerTextDownload(filename, csv, 'text/csv;charset=utf-8');
    onNotice?.(`Exported ${filename}`);
  };

  const handleCopySummary = async () => {
    const text = buildPhaseResidualSummaryText(event, analysis);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSummary(true);
      window.setTimeout(() => setCopiedSummary(false), 1800);
      onNotice?.('Copied phase residual summary to clipboard.');
    } catch {
      onNotice?.('Clipboard access unavailable in this browser context.');
    }
  };

  const handleExportPng = () => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const scale = 2;
    const headerH = 54;
    const footerH = 34;
    const totalW = CHART_WIDTH;
    const totalH = CHART_HEIGHT + headerH + footerH;

    const canvas = document.createElement('canvas');
    canvas.width = totalW * scale;
    canvas.height = totalH * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(scale, scale);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, totalW, totalH);

    // Header band
    ctx.fillStyle = '#0f172a';
    ctx.font = '600 14px system-ui, -apple-system, sans-serif';
    ctx.fillText(
      `P & S Phase Residuals vs. Epicentral Distance — Event ${event.id}`,
      20,
      24
    );
    ctx.fillStyle = '#475569';
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(
      `Origin: ${event.originDateGmt} ${event.originTimeGmt} UTC  |  Lat ${event.lat.toFixed(3)}°  Lon ${event.lon.toFixed(3)}°  Depth ${event.depthKm.toFixed(1)} km  |  P RMS ${fmtUnsigned(analysis.pStats.rmsSec, 2, 's')}  S RMS ${fmtUnsigned(analysis.sStats.rmsSec, 2, 's')}`,
      20,
      42
    );

    const serializer = new XMLSerializer();
    const cloned = svgEl.cloneNode(true) as SVGSVGElement;
    cloned.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const svgString = serializer.serializeToString(cloned);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, headerH, CHART_WIDTH, CHART_HEIGHT);
      URL.revokeObjectURL(url);

      // Footer legend summary
      ctx.fillStyle = '#475569';
      ctx.font = '10.5px system-ui, -apple-system, sans-serif';
      ctx.fillText(
        `Markers: Circle = P-phase (${analysis.pStats.count} active), Diamond = S-phase (${analysis.sStats.count} active), Hollow = Excluded (*). Threshold: ±${outlierThresholdSec.toFixed(2)} s.`,
        20,
        headerH + CHART_HEIGHT + 20
      );

      canvas.toBlob((blob) => {
        if (!blob) return;
        const dlUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = dlUrl;
        a.download = `${event.id}_phase_residuals.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(dlUrl);
        onNotice?.(`Exported ${event.id}_phase_residuals.png`);
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      onNotice?.('Unable to export PNG snapshot in this browser context.');
    };
    img.src = url;
  };

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const svgX = ((e.clientX - rect.left) / rect.width) * CHART_WIDTH;
    const svgY = ((e.clientY - rect.top) / rect.height) * CHART_HEIGHT;

    if (
      svgX < PAD.left ||
      svgX > CHART_WIDTH - PAD.right ||
      svgY < PAD.top ||
      svgY > CHART_HEIGHT - PAD.bottom
    ) {
      setProbeCoords(null);
      return;
    }

    const dist = xMin + ((svgX - PAD.left) / PLOT_W) * (xMax - xMin);
    const res = yMax - ((svgY - PAD.top) / PLOT_H) * (yMax - yMin);
    setProbeCoords({ dist, res, svgX, svgY });
  };

  const activeOutlierCount =
    analysis.pStats.warningCount +
    analysis.pStats.criticalCount +
    analysis.sStats.warningCount +
    analysis.sStats.criticalCount;

  const activeExcludedCount =
    analysis.pStats.excludedCount + analysis.sStats.excludedCount;

  const modelLabel =
    event.locationMetadata?.modelName || 'Jeffreys-Bullen (1940)';

  return (
    <div className="space-y-4">
      {/* Header Strip */}
      <section className="bg-[#f5f7fa] border border-slate-600/70 rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
        <div className="min-w-0 space-y-0.5">
          <h2 className="text-base font-bold text-blue-700 [text-shadow:0_0_8px_rgba(249,115,22,0.7),0_0_18px_rgba(251,146,60,0.45)]">
            P &amp; S Phase Residuals vs. Epicentral Distance
          </h2>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-600 font-mono tabular-nums">
            <span>Event {event.id}</span>
            <span aria-hidden="true">·</span>
            <span>
              {event.originDateGmt} {event.originTimeGmt} UTC
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {analysis.unlocated
                ? 'Hypocenter Unlocated'
                : `${event.lat.toFixed(3)}°N, ${event.lon.toFixed(3)}°E · Depth ${event.depthKm.toFixed(1)} km`}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-sans text-slate-500">{modelLabel}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleExportPng}
            disabled={analysis.visiblePoints.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileImage className="w-3.5 h-3.5 text-blue-600" />
            Export PNG
          </button>
          <button
            type="button"
            onClick={handleDownloadCsv}
            disabled={analysis.visiblePoints.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-teal-600" />
            Download CSV
          </button>
          <button
            type="button"
            onClick={handleCopySummary}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {copiedSummary ? (
              <Check className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-slate-600" />
            )}
            {copiedSummary ? 'Copied' : 'Copy Summary'}
          </button>
          <button
            type="button"
            onClick={handleResetView}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            Reset
          </button>
        </div>
      </section>

      {/* Unlocated Notice */}
      {analysis.unlocated && (
        <div className="bg-[#fbf5ea] border border-amber-700/60 rounded-lg px-4 py-2.5 text-xs text-amber-950 shadow-xs">
          Hypocenter coordinates are currently unlocated for this event. Run PLOT or Locate in the Data tab to compute epicentral distances and residuals.
        </div>
      )}

      {/* 4-Column Telemetry KPI Strip */}
      <section
        aria-label="Residual Telemetry Summary"
        className="bg-[#eff7f6] border border-teal-700/60 rounded-lg p-3 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)] grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3"
      >
        <div className="bg-[#d7ebe8] border border-teal-800/65 rounded px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-teal-900">
            Active Phase Picks
          </div>
          <div className="mt-1 flex items-baseline gap-1.5 font-mono tabular-nums">
            <span className="text-2xl font-semibold text-slate-900">
              {analysis.pStats.count + analysis.sStats.count}
            </span>
            <span className="text-xs uppercase text-slate-600">
              ({analysis.pStats.count} P · {analysis.sStats.count} S)
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-600 font-mono tabular-nums">
            {activeExcludedCount} excluded (*) · {analysis.stationPairs.length} stations
          </div>
        </div>

        <div className="bg-[#d7ebe8] border border-teal-800/65 rounded px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-teal-900">
            P-Phase Residual RMS
          </div>
          <div className="mt-1 flex items-baseline font-mono tabular-nums">
            <span className="text-2xl font-semibold text-blue-700">
              {analysis.pStats.rmsSec !== null ? analysis.pStats.rmsSec.toFixed(3) : '—'}
            </span>
            <span className="text-xs uppercase font-mono text-slate-500 ml-1.5">sec</span>
          </div>
          <div className="mt-1 text-xs text-slate-700 font-mono tabular-nums">
            Mean {fmtSigned(analysis.pStats.meanSec, 3, 's')} ·{' '}
            {analysis.pStats.regression
              ? `Slope ${fmtSigned(analysis.pStats.regression.slopePer100Km, 2)} s/100km`
              : 'Trend N/A'}
          </div>
        </div>

        <div className="bg-[#d7ebe8] border border-teal-800/65 rounded px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-teal-900">
            S-Phase Residual RMS
          </div>
          <div className="mt-1 flex items-baseline font-mono tabular-nums">
            <span className="text-2xl font-semibold text-teal-700">
              {analysis.sStats.rmsSec !== null ? analysis.sStats.rmsSec.toFixed(3) : '—'}
            </span>
            <span className="text-xs uppercase font-mono text-slate-500 ml-1.5">sec</span>
          </div>
          <div className="mt-1 text-xs text-slate-700 font-mono tabular-nums">
            Mean {fmtSigned(analysis.sStats.meanSec, 3, 's')} ·{' '}
            {analysis.sStats.regression
              ? `Slope ${fmtSigned(analysis.sStats.regression.slopePer100Km, 2)} s/100km`
              : 'Trend N/A'}
          </div>
        </div>

        <div className="bg-[#d7ebe8] border border-teal-800/65 rounded px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-teal-900">
            Epicentral Span &amp; Outliers
          </div>
          <div className="mt-1 flex items-baseline font-mono tabular-nums">
            <span className="text-2xl font-semibold text-slate-900">
              {analysis.visiblePoints.length > 0
                ? distanceUnit === 'km'
                  ? `${analysis.minDistKm.toFixed(0)}–${analysis.maxDistKm.toFixed(0)}`
                  : `${analysis.minDistDeg.toFixed(2)}–${analysis.maxDistDeg.toFixed(2)}`
                : '—'}
            </span>
            <span className="text-xs uppercase font-mono text-slate-500 ml-1.5">
              {distanceUnit === 'km' ? 'km' : 'deg'}
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-700 font-mono tabular-nums">
            {activeOutlierCount} outlier{activeOutlierCount === 1 ? '' : 's'} (|res| ≥{' '}
            {outlierThresholdSec.toFixed(2)} s)
          </div>
        </div>
      </section>

      {/* Asymmetric Split Console: Left Controls + Main Scatter Viewport */}
      <div className="grid grid-cols-1 lg:grid-cols-[296px_minmax(0,1fr)] gap-4 items-start">
        {/* Left Control Column */}
        <aside className="bg-[#f3f1fb] border border-indigo-700/60 rounded-lg p-3.5 space-y-2.5 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
          <div className="bg-[#e5e1f7] border border-indigo-800/55 rounded p-2.5 space-y-2">
            <div className="text-xs font-semibold text-slate-800">
              Epicentral Distance Axis
            </div>
            <div className="grid grid-cols-2 gap-1 p-1 bg-[#d7d1f2] border border-indigo-800/45 rounded-md">
              <button
                type="button"
                onClick={() => setDistanceUnit('km')}
                className={`px-2.5 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  distanceUnit === 'km'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-700 hover:text-slate-950'
                }`}
              >
                Kilometers (km)
              </button>
              <button
                type="button"
                onClick={() => setDistanceUnit('deg')}
                className={`px-2.5 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  distanceUnit === 'deg'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-700 hover:text-slate-950'
                }`}
              >
                Degrees (°)
              </button>
            </div>
          </div>

          <div className="bg-[#e5e1f7] border border-indigo-800/55 rounded p-2.5 space-y-2">
            <div className="text-xs font-semibold text-slate-800">Phase Series</div>
            <div className="space-y-1.5 text-xs text-slate-700">
              <label className="flex items-center justify-between gap-2 cursor-pointer">
                <span className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={showP}
                    onChange={toggleShowP}
                    className="w-3.5 h-3.5 accent-blue-600 rounded cursor-pointer"
                  />
                  <span>P-phase residuals (RESp)</span>
                </span>
                <span className="font-mono tabular-nums text-slate-500">
                  {analysis.pStats.count}
                </span>
              </label>

              <label className="flex items-center justify-between gap-2 cursor-pointer">
                <span className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={showS}
                    onChange={toggleShowS}
                    className="w-3.5 h-3.5 accent-teal-600 rounded cursor-pointer"
                  />
                  <span>S-phase residuals (RESs)</span>
                </span>
                <span className="font-mono tabular-nums text-slate-500">
                  {analysis.sStats.count}
                </span>
              </label>

              <label className="flex items-center justify-between gap-2 cursor-pointer">
                <span className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={includeExcluded}
                    onChange={(e) => setIncludeExcluded(e.target.checked)}
                    className="w-3.5 h-3.5 accent-slate-700 rounded cursor-pointer"
                  />
                  <span>Include excluded (*) picks</span>
                </span>
                <span className="font-mono tabular-nums text-slate-500">
                  {activeExcludedCount}
                </span>
              </label>
            </div>
          </div>

          <div className="bg-[#e5e1f7] border border-indigo-800/55 rounded p-2.5 space-y-2">
            <div className="text-xs font-semibold text-slate-800">Chart Overlays</div>
            <div className="space-y-1.5 text-xs text-slate-700">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showRmsEnvelope}
                  onChange={(e) => setShowRmsEnvelope(e.target.checked)}
                  className="w-3.5 h-3.5 accent-blue-600 rounded cursor-pointer"
                />
                <span>Show ±RMS residual bands</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showLinearTrend}
                  onChange={(e) => setShowLinearTrend(e.target.checked)}
                  className="w-3.5 h-3.5 accent-blue-600 rounded cursor-pointer"
                />
                <span>Show linear distance trend</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showOutlierGuides}
                  onChange={(e) => setShowOutlierGuides(e.target.checked)}
                  className="w-3.5 h-3.5 accent-amber-600 rounded cursor-pointer"
                />
                <span>Show ±threshold lines</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={connectStationPairs}
                  onChange={(e) => setConnectStationPairs(e.target.checked)}
                  className="w-3.5 h-3.5 accent-slate-700 rounded cursor-pointer"
                />
                <span>Link same-station P–S pairs</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showStationLabels}
                  onChange={(e) => setShowStationLabels(e.target.checked)}
                  className="w-3.5 h-3.5 accent-slate-700 rounded cursor-pointer"
                />
                <span>Show station labels</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={symmetricY}
                  onChange={(e) => setSymmetricY(e.target.checked)}
                  className="w-3.5 h-3.5 accent-slate-700 rounded cursor-pointer"
                />
                <span>Symmetric ±residual axis</span>
              </label>
            </div>
          </div>

          <div className="bg-[#f3e6cc] border border-amber-800/60 rounded p-2.5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="outlier-threshold-range" className="font-semibold text-slate-800">
                Outlier Threshold
              </label>
              <span className="font-mono tabular-nums text-slate-900">
                ±{outlierThresholdSec.toFixed(2)} s
              </span>
            </div>
            <input
              id="outlier-threshold-range"
              type="range"
              min={0.25}
              max={2.0}
              step={0.05}
              value={outlierThresholdSec}
              onChange={(e) => setOutlierThresholdSec(Number(e.target.value))}
              className="w-full accent-blue-600 cursor-pointer"
            />
            <div className="flex justify-between text-[11px] font-mono text-slate-600">
              <span>±0.25 s</span>
              <span>±1.00 s</span>
              <span>±2.00 s</span>
            </div>
          </div>

          <div className="bg-[#e5e1f7] border border-indigo-800/55 rounded p-2.5 space-y-2">
            <div className="text-xs font-semibold text-slate-800">Pick Quality Weights</div>
            <div className="grid grid-cols-4 gap-1.5">
              {ALL_QUALITIES.map((q) => {
                const active = activeQualities.includes(q);
                return (
                  <button
                    key={q}
                    type="button"
                    onClick={() => toggleQuality(q)}
                    aria-pressed={active}
                    className={`py-1 text-xs font-mono font-semibold rounded border transition-colors cursor-pointer ${
                      active
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-indigo-800/40 hover:bg-slate-50'
                    }`}
                  >
                    {q}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-[#f3e6cc] border border-amber-800/60 rounded p-2.5 space-y-1.5">
            <div className="text-xs font-semibold text-slate-800">
              Distance-Trend Diagnostic
            </div>
            <p className="text-xs text-slate-700 leading-relaxed">
              {analysis.diagnosticNote}
            </p>
          </div>
        </aside>

        {/* Main Interactive Chart Stage */}
        <section className="bg-[#edf4fc] border border-sky-700/60 rounded-lg overflow-hidden min-w-0 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
          <div className="px-4 py-2.5 bg-[#dce9f8] border-b border-sky-700/40 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="min-w-0 space-y-0.5">
              <div className="font-medium text-slate-800">
                Travel-Time Residual (Observed − Calculated, s) vs. Epicentral Distance (
                {distanceUnit === 'km' ? 'km' : 'deg'})
              </div>
              <div className="font-mono tabular-nums text-[11px] text-slate-500">
                {hoveredPoint ? (
                  <span className="text-slate-900 font-medium">
                    {hoveredPoint.sta} ({hoveredPoint.phase}) ·{' '}
                    {distanceUnit === 'km'
                      ? `${hoveredPoint.distKm.toFixed(1)} km`
                      : `${hoveredPoint.distDeg.toFixed(2)}°`}{' '}
                    · Res {fmtSigned(hoveredPoint.residualSec, 3, 's')} · {hoveredPoint.status}
                  </span>
                ) : probeCoords ? (
                  <span>
                    Probe:{' '}
                    {distanceUnit === 'km'
                      ? `${probeCoords.dist.toFixed(1)} km`
                      : `${probeCoords.dist.toFixed(2)}°`}{' '}
                    · {fmtSigned(probeCoords.res, 2, 's')}
                  </span>
                ) : (
                  <span>Hover chart for crosshair · Click marker to select station</span>
                )}
              </div>
            </div>

            <div
              className="flex flex-wrap items-center gap-1.5 shrink-0"
              role="group"
              aria-label="Toggle P-wave and S-wave scatter series"
            >
              <button
                type="button"
                onClick={toggleShowP}
                aria-pressed={showP}
                title={
                  showP
                    ? 'Hide P-wave residual scatter series on chart'
                    : 'Show P-wave residual scatter series on chart'
                }
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap cursor-pointer ${
                  showP
                    ? 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100/70'
                    : 'bg-white text-slate-500 border-slate-200 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`inline-block w-2 h-2 rounded-full ${
                    showP ? 'bg-blue-600' : 'bg-slate-300'
                  }`}
                />
                {showP ? (
                  <Eye className="w-3.5 h-3.5 text-blue-600" />
                ) : (
                  <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                )}
                <span>P-Wave ({filteredPhaseCounts.p})</span>
              </button>

              <button
                type="button"
                onClick={toggleShowS}
                aria-pressed={showS}
                title={
                  showS
                    ? 'Hide S-wave residual scatter series on chart'
                    : 'Show S-wave residual scatter series on chart'
                }
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap cursor-pointer ${
                  showS
                    ? 'bg-teal-50 text-teal-800 border-teal-200 hover:bg-teal-100/70'
                    : 'bg-white text-slate-500 border-slate-200 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`inline-block w-2 h-2 rotate-45 ${
                    showS ? 'bg-teal-600' : 'bg-slate-300'
                  }`}
                />
                {showS ? (
                  <Eye className="w-3.5 h-3.5 text-teal-600" />
                ) : (
                  <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                )}
                <span>S-Wave ({filteredPhaseCounts.s})</span>
              </button>
            </div>
          </div>

          {analysis.visiblePoints.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-500 space-y-2">
              <p>
                {!showP && !showS && filteredPhaseCounts.p + filteredPhaseCounts.s > 0
                  ? 'Both P-wave and S-wave scatter series are hidden. Toggle P-Wave or S-Wave above to display residuals on the chart.'
                  : 'No P or S phase arrivals match the active filters. Enable a phase series or quality grade to plot residuals.'}
              </p>
            </div>
          ) : (
            <div className="p-3 sm:p-4">
              <div className="relative w-full">
                <svg
                  ref={svgRef}
                  viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                  className="w-full h-auto max-h-[460px] select-none cursor-crosshair block"
                  role="img"
                  aria-label="Scatter plot of P and S phase residuals against epicentral distance"
                  onMouseMove={handleSvgMouseMove}
                  onMouseLeave={() => {
                    setProbeCoords(null);
                    setHoveredPoint(null);
                  }}
                >
                  {/* Plot Background */}
                  <rect
                    x={PAD.left}
                    y={PAD.top}
                    width={PLOT_W}
                    height={PLOT_H}
                    fill="#f8fafc"
                    stroke="#cbd5e1"
                    strokeWidth={1}
                  />

                  {/* Vertical Grid Lines */}
                  {xTicks.map((tick) => {
                    const x = toSvgX(tick);
                    return (
                      <g key={`xtick-${tick}`}>
                        <line
                          x1={x}
                          y1={PAD.top}
                          x2={x}
                          y2={PAD.top + PLOT_H}
                          stroke="#e2e8f0"
                          strokeWidth={1}
                        />
                        <text
                          x={x}
                          y={PAD.top + PLOT_H + 16}
                          textAnchor="middle"
                          fontSize={10.5}
                          fill="#475569"
                          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                        >
                          {distanceUnit === 'km' ? tick.toFixed(0) : tick.toFixed(2)}
                        </text>
                      </g>
                    );
                  })}

                  {/* Horizontal Grid Lines */}
                  {yTicks.map((tick) => {
                    const y = toSvgY(tick);
                    const isZero = Math.abs(tick) < 1e-6;
                    return (
                      <g key={`ytick-${tick}`}>
                        <line
                          x1={PAD.left}
                          y1={y}
                          x2={PAD.left + PLOT_W}
                          y2={y}
                          stroke={isZero ? '#334155' : '#e2e8f0'}
                          strokeWidth={isZero ? 1.4 : 1}
                        />
                        <text
                          x={PAD.left - 8}
                          y={y + 3.5}
                          textAnchor="end"
                          fontSize={10.5}
                          fill={isZero ? '#0f172a' : '#475569'}
                          fontWeight={isZero ? 600 : 400}
                          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                        >
                          {tick > 0 ? `+${tick.toFixed(2)}` : tick.toFixed(2)}
                        </text>
                      </g>
                    );
                  })}

                  {/* ±RMS Envelopes */}
                  {showRmsEnvelope && showP && analysis.pStats.rmsSec !== null && (
                    <rect
                      x={PAD.left}
                      y={toSvgY(Math.min(yMax, analysis.pStats.rmsSec))}
                      width={PLOT_W}
                      height={Math.max(
                        0,
                        toSvgY(Math.max(yMin, -analysis.pStats.rmsSec)) -
                          toSvgY(Math.min(yMax, analysis.pStats.rmsSec))
                      )}
                      fill="#2563eb"
                      fillOpacity={0.07}
                    />
                  )}
                  {showRmsEnvelope && showS && analysis.sStats.rmsSec !== null && (
                    <rect
                      x={PAD.left}
                      y={toSvgY(Math.min(yMax, analysis.sStats.rmsSec))}
                      width={PLOT_W}
                      height={Math.max(
                        0,
                        toSvgY(Math.max(yMin, -analysis.sStats.rmsSec)) -
                          toSvgY(Math.min(yMax, analysis.sStats.rmsSec))
                      )}
                      fill="#0d9488"
                      fillOpacity={0.06}
                    />
                  )}

                  {/* ±Outlier Threshold Lines */}
                  {showOutlierGuides && (
                    <>
                      {[outlierThresholdSec, -outlierThresholdSec].map((val) => {
                        if (val < yMin || val > yMax) return null;
                        const y = toSvgY(val);
                        return (
                          <g key={`thresh-${val}`}>
                            <line
                              x1={PAD.left}
                              y1={y}
                              x2={PAD.left + PLOT_W}
                              y2={y}
                              stroke="#d97706"
                              strokeWidth={1.1}
                              strokeDasharray="5 4"
                            />
                            <text
                              x={PAD.left + PLOT_W - 6}
                              y={val > 0 ? y - 4 : y + 11}
                              textAnchor="end"
                              fontSize={9.5}
                              fill="#b45309"
                              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                            >
                              {val > 0 ? `+${val.toFixed(2)}s` : `${val.toFixed(2)}s`}
                            </text>
                          </g>
                        );
                      })}
                    </>
                  )}

                  {/* Linear Regression Trend Lines */}
                  {pTrendLine && (
                    <line
                      x1={pTrendLine.x1}
                      y1={pTrendLine.y1}
                      x2={pTrendLine.x2}
                      y2={pTrendLine.y2}
                      stroke="#1d4ed8"
                      strokeWidth={1.75}
                      strokeDasharray="7 4"
                    />
                  )}
                  {sTrendLine && (
                    <line
                      x1={sTrendLine.x1}
                      y1={sTrendLine.y1}
                      x2={sTrendLine.x2}
                      y2={sTrendLine.y2}
                      stroke="#0f766e"
                      strokeWidth={1.75}
                      strokeDasharray="3 3"
                    />
                  )}

                  {/* Same-Station P–S Connector Lines */}
                  {connectStationPairs &&
                    showP &&
                    showS &&
                    analysis.stationPairs.map((pair) => {
                      if (!pair.hasP || !pair.hasS || pair.resP === null || pair.resS === null) {
                        return null;
                      }
                      const d = distanceUnit === 'km' ? pair.distKm : pair.distDeg;
                      const x = toSvgX(d);
                      const yP = toSvgY(pair.resP);
                      const yS = toSvgY(pair.resS);
                      const isSel = selectedStation === pair.sta;
                      return (
                        <line
                          key={`pair-${pair.pickId}`}
                          x1={x}
                          y1={yP}
                          x2={x}
                          y2={yS}
                          stroke={isSel ? '#0f172a' : '#94a3b8'}
                          strokeWidth={isSel ? 1.6 : 1}
                          strokeDasharray="2 2"
                        />
                      );
                    })}

                  {/* Interactive Crosshair Probe */}
                  {probeCoords && (
                    <g pointerEvents="none">
                      <line
                        x1={probeCoords.svgX}
                        y1={PAD.top}
                        x2={probeCoords.svgX}
                        y2={PAD.top + PLOT_H}
                        stroke="#64748b"
                        strokeWidth={0.9}
                        strokeDasharray="3 3"
                      />
                      <line
                        x1={PAD.left}
                        y1={probeCoords.svgY}
                        x2={PAD.left + PLOT_W}
                        y2={probeCoords.svgY}
                        stroke="#64748b"
                        strokeWidth={0.9}
                        strokeDasharray="3 3"
                      />
                    </g>
                  )}

                  {/* Data Points (P Circles & S Diamonds) */}
                  {analysis.visiblePoints.map((pt) => {
                    const distVal = distanceUnit === 'km' ? pt.distKm : pt.distDeg;
                    const cx = toSvgX(distVal);
                    const cy = toSvgY(pt.residualSec);
                    const color = getMarkerColor(pt);
                    const isSelected = selectedStation === pt.sta;
                    const isHovered = hoveredPoint?.key === pt.key;
                    const labelDy = pt.phase === 'S' ? 13 : -8;

                    return (
                      <g
                        key={pt.key}
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredPoint(pt)}
                        onMouseLeave={() =>
                          setHoveredPoint((prev) => (prev?.key === pt.key ? null : prev))
                        }
                        onClick={() =>
                          onSelectStation?.(selectedStation === pt.sta ? null : pt.sta)
                        }
                      >
                        {(isSelected || isHovered) && (
                          <circle
                            cx={cx}
                            cy={cy}
                            r={11}
                            fill={color}
                            fillOpacity={0.14}
                            stroke={isSelected ? '#0f172a' : color}
                            strokeWidth={1.25}
                          />
                        )}

                        {pt.phase === 'P' ? (
                          <circle
                            cx={cx}
                            cy={cy}
                            r={isSelected ? 6.5 : 5.2}
                            fill={pt.excluded ? '#ffffff' : color}
                            stroke={pt.excluded ? '#64748b' : isSelected ? '#0f172a' : '#ffffff'}
                            strokeWidth={pt.excluded ? 1.8 : isSelected ? 2 : 1.4}
                            strokeDasharray={pt.excluded ? '2 1.5' : undefined}
                          />
                        ) : (
                          <polygon
                            points={`${cx},${cy - (isSelected ? 7.5 : 6.2)} ${
                              cx + (isSelected ? 7.5 : 6.2)
                            },${cy} ${cx},${cy + (isSelected ? 7.5 : 6.2)} ${
                              cx - (isSelected ? 7.5 : 6.2)
                            },${cy}`}
                            fill={pt.excluded ? '#ffffff' : color}
                            stroke={pt.excluded ? '#64748b' : isSelected ? '#0f172a' : '#ffffff'}
                            strokeWidth={pt.excluded ? 1.8 : isSelected ? 2 : 1.4}
                            strokeDasharray={pt.excluded ? '2 1.5' : undefined}
                          />
                        )}

                        {showStationLabels && (
                          <text
                            x={cx + 7}
                            y={cy + labelDy}
                            fontSize={10}
                            fontWeight={isSelected || pt.status !== 'Nominal' ? 700 : 500}
                            fill={pt.excluded ? '#64748b' : isSelected ? '#0f172a' : '#334155'}
                            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                          >
                            {pt.sta}
                            {pt.phase === 'S' ? '·S' : ''}
                            {pt.excluded ? '*' : ''}
                          </text>
                        )}
                      </g>
                    );
                  })}

                  {/* Axis Titles */}
                  <text
                    x={PAD.left + PLOT_W / 2}
                    y={CHART_HEIGHT - 12}
                    textAnchor="middle"
                    fontSize={11.5}
                    fontWeight={600}
                    fill="#334155"
                  >
                    Epicentral Distance ({distanceUnit === 'km' ? 'km' : 'degrees Δ'})
                  </text>
                  <text
                    x={18}
                    y={PAD.top + PLOT_H / 2}
                    textAnchor="middle"
                    transform={`rotate(-90 18 ${PAD.top + PLOT_H / 2})`}
                    fontSize={11.5}
                    fontWeight={600}
                    fill="#334155"
                  >
                    Phase Residual Obs − Calc (s)
                  </text>
                </svg>
              </div>

              {/* Legend & Quick Readout Footer */}
              <div className="mt-3 pt-3 border-t border-sky-700/35 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-700">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                  <button
                    type="button"
                    onClick={toggleShowP}
                    aria-pressed={showP}
                    title={showP ? 'Hide P-wave residual scatter series' : 'Show P-wave residual scatter series'}
                    className={`inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                      showP ? 'text-slate-700 hover:text-slate-950' : 'text-slate-400 line-through'
                    }`}
                  >
                    <span
                      className={`inline-block w-2.5 h-2.5 rounded-full ${
                        showP ? 'bg-blue-600' : 'bg-slate-300'
                      }`}
                    />
                    P-Phase (Circle)
                  </button>
                  <button
                    type="button"
                    onClick={toggleShowS}
                    aria-pressed={showS}
                    title={showS ? 'Hide S-wave residual scatter series' : 'Show S-wave residual scatter series'}
                    className={`inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                      showS ? 'text-slate-700 hover:text-slate-950' : 'text-slate-400 line-through'
                    }`}
                  >
                    <span
                      className={`inline-block w-2.5 h-2.5 rotate-45 ${
                        showS ? 'bg-teal-600' : 'bg-slate-300'
                      }`}
                    />
                    S-Phase (Diamond)
                  </button>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-600" />
                    Warning (≥ {outlierThresholdSec.toFixed(2)} s)
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-rose-600" />
                    Critical (≥ {analysis.criticalThresholdSec.toFixed(2)} s)
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block w-2.5 h-2.5 rounded-full border-2 border-dashed border-slate-500 bg-white" />
                    Excluded (*)
                  </span>
                </div>
                <div className="text-slate-600 font-mono tabular-nums">
                  P Weighted RMS: {fmtUnsigned(analysis.pStats.weightedRmsSec, 3, 's')} · S Weighted RMS:{' '}
                  {fmtUnsigned(analysis.sStats.weightedRmsSec, 3, 's')}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Bottom Station Residuals Breakdown Table */}
      <section className="bg-[#f1f4f9] border border-slate-600/70 rounded-lg overflow-hidden shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
        <div className="px-4 py-2.5 bg-[#e2e8f2] border-b border-slate-600/50 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-slate-900">
            Station Residual Breakdown by Epicentral Distance
          </h3>
          <span className="text-xs text-slate-600 font-mono tabular-nums">
            {sortedPairs.length} station{sortedPairs.length === 1 ? '' : 's'} shown
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-[#dfe6f0] border-b border-slate-600/50 text-slate-700 font-semibold">
                {(
                  [
                    { key: 'sta', label: 'Station', align: 'left' },
                    { key: 'dist', label: 'Dist (km)', align: 'right' },
                    { key: 'dist', label: 'Delta (°)', align: 'right', id: 'delta' },
                    { key: 'azim', label: 'Azim (°)', align: 'right' },
                    { key: 'resP', label: 'P Res (s)', align: 'right' },
                    { key: 'resS', label: 'S Res (s)', align: 'right' },
                    { key: 'sMinusP', label: 'S − P (s)', align: 'right' },
                    { key: 'quality', label: 'Qual', align: 'center' },
                    { key: 'status', label: 'Status', align: 'left' },
                  ] as const
                ).map((col, idx) => {
                  const isSorted = sortKey === col.key && !('id' in col);
                  return (
                    <th
                      key={`${col.key}-${idx}`}
                      className={`px-3 py-2 whitespace-nowrap ${
                        col.align === 'right'
                          ? 'text-right'
                          : col.align === 'center'
                            ? 'text-center'
                            : 'text-left'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleSort(col.key)}
                        className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                      >
                        <span>{col.label}</span>
                        {isSorted &&
                          (sortDir === 'asc' ? (
                            <ArrowUp className="w-3 h-3" />
                          ) : (
                            <ArrowDown className="w-3 h-3" />
                          ))}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
              {sortedPairs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center font-sans text-slate-500">
                    No station picks available for the active filter criteria.
                  </td>
                </tr>
              ) : (
                sortedPairs.map((row) => {
                  const isSelected = selectedStation === row.sta;
                  return (
                    <tr
                      key={row.pickId}
                      onClick={() => onSelectStation?.(isSelected ? null : row.sta)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-blue-50/75' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="px-3 py-2 font-semibold text-slate-900 text-left">
                        {row.sta}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-700">
                        {row.distKm.toFixed(1)}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-600">
                        {row.distDeg.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-600">
                        {row.azim.toFixed(1)}
                      </td>
                      <td className="px-3 py-2 text-right text-blue-700">
                        {row.hasP && row.resP !== null
                          ? `${row.pExcluded ? '*' : ''}${fmtSigned(row.resP, 2)}`
                          : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-teal-700">
                        {row.hasS && row.resS !== null
                          ? `${row.sExcluded ? '*' : ''}${fmtSigned(row.resS, 2)}`
                          : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-700">
                        {row.sMinusPResSec !== null ? fmtSigned(row.sMinusPResSec, 2) : '—'}
                      </td>
                      <td className="px-3 py-2 text-center text-slate-700">{row.quality}</td>
                      <td
                        className={`px-3 py-2 font-sans text-left ${getStatusBadgeTextClass(
                          row.worstStatus
                        )}`}
                      >
                        {row.worstStatus}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
