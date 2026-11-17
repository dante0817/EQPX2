import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  FileImage,
  FileText,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
import { EQPEvent, isEventUnlocated } from '../data/eqpData';
import {
  buildFocalInputFingerprint,
  buildNodalPlaneSvgPath,
  dotVec,
  EvaluatedPolarityPick,
  evaluateManualMechanism,
  FocalMechanismAnalysis,
  invertFocalMechanism,
  NodalPlane,
  schmidtProjectLower,
  ValidatedPolarityPick,
  validateFocalMechanismPicks,
  Vec3,
} from '../utils/focalMechanism';
import {
  buildBeachballSvgDocument,
  formatFocalMechanismSummaryText,
  renderBeachballPngBlob,
} from '../utils/focalMechanismExport';

interface FocalMechanismResearchPanelProps {
  event: EQPEvent;
  selectedStation: string | null;
  onSelectStation: (sta: string | null) => void;
  onNotice?: (message: string) => void;
}

interface ComputedSnapshot {
  eventId: string;
  fingerprint: string;
  analysis: FocalMechanismAnalysis;
  computedAtIso: string;
}

export const FocalMechanismResearchPanel: React.FC<FocalMechanismResearchPanelProps> = ({
  event,
  selectedStation,
  onSelectStation,
  onNotice,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [researchExcludedIds, setResearchExcludedIds] = useState<Set<string>>(() => new Set());
  const [includeAcceptedExcluded, setIncludeAcceptedExcluded] = useState(false);
  const [swapNodalOrder, setSwapNodalOrder] = useState(false);
  const [showAlternativePlanes, setShowAlternativePlanes] = useState(true);
  const [hoveredSta, setHoveredSta] = useState<string | null>(null);

  // Manual exploration state (strictly separated from computed inversion)
  const [manualEnabled, setManualEnabled] = useState(false);
  const [manualPlane, setManualPlane] = useState<NodalPlane>({
    strike: 0,
    dip: 45,
    rake: 90,
  });
  const [copiedSummary, setCopiedSummary] = useState(false);

  // Read-only research projection of event (only modifies research view when user opts to test (*) picks)
  const researchEvent = useMemo<EQPEvent>(() => {
    if (!includeAcceptedExcluded) return event;
    return {
      ...event,
      picks: event.picks.map((p) => (p.pExcluded ? { ...p, pExcluded: false } : p)),
    };
  }, [event, includeAcceptedExcluded]);

  // Reset research-only exclusions on event switch
  const prevEventIdRef = useRef<string>(event.id);
  useEffect(() => {
    if (prevEventIdRef.current !== event.id) {
      prevEventIdRef.current = event.id;
      setResearchExcludedIds(new Set());
      setIncludeAcceptedExcluded(false);
      setSwapNodalOrder(false);
    }
  }, [event.id]);

  const currentFingerprint = useMemo(
    () => buildFocalInputFingerprint(researchEvent, researchExcludedIds),
    [researchEvent, researchExcludedIds]
  );

  // Snapshot state enables explicit stale detection whenever selected event or polarities change
  const [snapshot, setSnapshot] = useState<ComputedSnapshot>(() => {
    const initialAnalysis = invertFocalMechanism(researchEvent, researchExcludedIds);
    return {
      eventId: researchEvent.id,
      fingerprint: buildFocalInputFingerprint(researchEvent, researchExcludedIds),
      analysis: initialAnalysis,
      computedAtIso: new Date().toISOString(),
    };
  });

  const isStale = snapshot.fingerprint !== currentFingerprint;
  const activeAnalysis = snapshot.analysis;

  const handleRecompute = () => {
    const nextAnalysis = invertFocalMechanism(researchEvent, researchExcludedIds);
    setSnapshot({
      eventId: researchEvent.id,
      fingerprint: currentFingerprint,
      analysis: nextAnalysis,
      computedAtIso: new Date().toISOString(),
    });
    setSwapNodalOrder(false);
    if (!manualEnabled && nextAnalysis.plane1) {
      setManualPlane(nextAnalysis.plane1);
    }
    onNotice?.(
      nextAnalysis.status === 'computed'
        ? 'Recomputed experimental focal mechanism from current research picks.'
        : 'Recomputed focal check: Insufficient Data for constrained mechanism.'
    );
  };

  // Sync manual sliders from primary computed plane if user hasn't opened manual exploration yet
  useEffect(() => {
    if (!manualEnabled && activeAnalysis.plane1) {
      setManualPlane(activeAnalysis.plane1);
    }
  }, [activeAnalysis.plane1, manualEnabled]);

  const manualEvaluation = useMemo(() => {
    if (!manualEnabled) return null;
    return evaluateManualMechanism(
      researchEvent,
      manualPlane.strike,
      manualPlane.dip,
      manualPlane.rake,
      researchExcludedIds
    );
  }, [manualEnabled, researchEvent, manualPlane, researchExcludedIds]);

  const isInsufficient = !manualEnabled && activeAnalysis.status === 'insufficient-data';

  const displayPlane1 = useMemo(() => {
    if (manualEvaluation) return manualEvaluation.plane1;
    if (activeAnalysis.status !== 'computed') return null;
    return swapNodalOrder ? activeAnalysis.plane2 : activeAnalysis.plane1;
  }, [manualEvaluation, activeAnalysis, swapNodalOrder]);

  const displayPlane2 = useMemo(() => {
    if (manualEvaluation) return manualEvaluation.plane2;
    if (activeAnalysis.status !== 'computed') return null;
    return swapNodalOrder ? activeAnalysis.plane1 : activeAnalysis.plane2;
  }, [manualEvaluation, activeAnalysis, swapNodalOrder]);

  const displayP = manualEvaluation ? manualEvaluation.pAxis : activeAnalysis.pAxis;
  const displayT = manualEvaluation ? manualEvaluation.tAxis : activeAnalysis.tAxis;
  const displayB = manualEvaluation ? manualEvaluation.bAxis : activeAnalysis.bAxis;
  const displayN = manualEvaluation ? manualEvaluation.nVec : activeAnalysis.nVec;
  const displayS = manualEvaluation ? manualEvaluation.sVec : activeAnalysis.sVec;
  const displayClass = manualEvaluation
    ? manualEvaluation.mechanismClass
    : activeAnalysis.mechanismClass;

  const plottedStations = useMemo<
    Array<EvaluatedPolarityPick | ValidatedPolarityPick>
  >(() => {
    if (manualEvaluation) return manualEvaluation.evaluatedPicks;
    if (activeAnalysis.status === 'computed') return activeAnalysis.evaluatedPicks;
    return activeAnalysis.allPicks.filter(
      (p) => p.status === 'usable' && p.projX !== null && p.projY !== null
    );
  }, [manualEvaluation, activeAnalysis]);

  const liveAllPicks = useMemo(
    () => validateFocalMechanismPicks(researchEvent, researchExcludedIds),
    [researchEvent, researchExcludedIds]
  );

  // Live validation table reflecting current research toggles even when computed snapshot is stale
  const liveTablePicks = useMemo(() => {
    const evalSource = manualEvaluation
      ? manualEvaluation.evaluatedPicks
      : activeAnalysis.evaluatedPicks;
    const evalMap = new Map(evalSource.map((p) => [p.pick.id, p]));
    return liveAllPicks.map((row) => ({
      row,
      evalItem: row.status === 'usable' ? (evalMap.get(row.pick.id) ?? null) : null,
    }));
  }, [liveAllPicks, activeAnalysis.evaluatedPicks, manualEvaluation]);

  // High-DPI Beachball Quadrant Shading Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const size = 300;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    if (isInsufficient || !displayN || !displayS) {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w * 0.44, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    const img = ctx.createImageData(w, h);
    const data = img.data;
    const cx = w / 2;
    const cy = h / 2;
    const rMax = w * 0.44;

    for (let py = 0; py < h; py++) {
      const ny = (cy - py) / rMax;
      for (let px = 0; px < w; px++) {
        const nx = (px - cx) / rMax;
        const r2 = nx * nx + ny * ny;
        const idx = (py * w + px) * 4;
        if (r2 > 1.0) {
          data[idx + 3] = 0;
          continue;
        }
        const root = Math.sqrt(Math.max(0, 2 - r2));
        const ray: Vec3 = {
          n: ny * root,
          e: nx * root,
          d: 1 - r2,
        };
        const amp = 2 * dotVec(ray, displayN) * dotVec(ray, displayS);
        if (amp >= 0) {
          data[idx] = 30;
          data[idx + 1] = 64;
          data[idx + 2] = 175;
          data[idx + 3] = 220;
        } else {
          data[idx] = 248;
          data[idx + 1] = 250;
          data[idx + 2] = 252;
          data[idx + 3] = 255;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [isInsufficient, displayN, displayS]);

  const svgSize = 300;
  const svgCenter = svgSize / 2;
  const sphereRadius = svgSize * 0.44; // 132
  const ring45Radius = sphereRadius * Math.sqrt(1 - Math.SQRT1_2);

  const plane1Path = useMemo(() => {
    if (!displayPlane1 || isInsufficient) return '';
    return buildNodalPlaneSvgPath(
      displayPlane1.strike,
      displayPlane1.dip,
      svgCenter,
      svgCenter,
      sphereRadius
    );
  }, [displayPlane1, isInsufficient, svgCenter, sphereRadius]);

  const plane2Path = useMemo(() => {
    if (!displayPlane2 || isInsufficient) return '';
    return buildNodalPlaneSvgPath(
      displayPlane2.strike,
      displayPlane2.dip,
      svgCenter,
      svgCenter,
      sphereRadius
    );
  }, [displayPlane2, isInsufficient, svgCenter, sphereRadius]);

  const alternativeArcPaths = useMemo(() => {
    if (
      manualEnabled ||
      !showAlternativePlanes ||
      activeAnalysis.status !== 'computed'
    ) {
      return [];
    }
    return activeAnalysis.alternativeSolutions.flatMap((alt, idx) => [
      {
        key: `alt-${idx}-1`,
        d: buildNodalPlaneSvgPath(
          alt.plane1.strike,
          alt.plane1.dip,
          svgCenter,
          svgCenter,
          sphereRadius
        ),
      },
      {
        key: `alt-${idx}-2`,
        d: buildNodalPlaneSvgPath(
          alt.plane2.strike,
          alt.plane2.dip,
          svgCenter,
          svgCenter,
          sphereRadius
        ),
      },
    ]);
  }, [
    manualEnabled,
    showAlternativePlanes,
    activeAnalysis,
    svgCenter,
    sphereRadius,
  ]);

  const pProj = displayP ? schmidtProjectLower(displayP.vec) : null;
  const tProj = displayT ? schmidtProjectLower(displayT.vec) : null;
  const bProj = displayB ? schmidtProjectLower(displayB.vec) : null;

  const hoveredItem = plottedStations.find((p) => p.pick.sta === hoveredSta) ?? null;

  const magVal =
    event.preferredScale === 'Ms'
      ? event.ms
      : event.preferredScale === 'Mb'
        ? event.mb
        : event.md;

  const exportPayload = useMemo(
    () => ({
      event,
      analysis: activeAnalysis,
      manualExploration: manualEvaluation
        ? { enabled: true, evaluation: manualEvaluation }
        : null,
      isStale,
    }),
    [event, activeAnalysis, manualEvaluation, isStale]
  );

  const handleExportSvg = () => {
    const svg = buildBeachballSvgDocument(exportPayload);
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${event.id}_focal_mechanism.svg`;
    a.click();
    URL.revokeObjectURL(url);
    onNotice?.(`Exported SVG diagram: ${event.id}_focal_mechanism.svg`);
  };

  const handleExportPng = async () => {
    try {
      const blob = await renderBeachballPngBlob(exportPayload);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${event.id}_focal_mechanism.png`;
      a.click();
      URL.revokeObjectURL(url);
      onNotice?.(`Exported PNG diagram: ${event.id}_focal_mechanism.png`);
    } catch (err) {
      onNotice?.(err instanceof Error ? err.message : 'Unable to export PNG.');
    }
  };

  const handleDownloadSummary = () => {
    const txt = formatFocalMechanismSummaryText(exportPayload);
    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${event.id}_focal_mechanism_summary.txt`;
    a.click();
    URL.revokeObjectURL(url);
    onNotice?.(`Downloaded summary: ${event.id}_focal_mechanism_summary.txt`);
  };

  const handleCopySummary = async () => {
    try {
      const txt = formatFocalMechanismSummaryText(exportPayload);
      await navigator.clipboard.writeText(txt);
      setCopiedSummary(true);
      window.setTimeout(() => setCopiedSummary(false), 1800);
      onNotice?.('Copied focal mechanism summary to clipboard.');
    } catch {
      onNotice?.('Clipboard write unavailable — use Download Summary instead.');
    }
  };

  const toggleResearchExclude = (pickId: string) => {
    setResearchExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(pickId)) next.delete(pickId);
      else next.add(pickId);
      return next;
    });
  };

  const unlocated = isEventUnlocated(event);

  return (
    <div className="space-y-4">
      {/* Header & Read-Only Event Telemetry Summary */}
      <section className="bg-[#f5f7fa] border border-slate-600/70 rounded-lg p-4 space-y-3 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs text-slate-500">
              Research Module · Read-Only Relative to Accepted EQP Solution ·{' '}
              <span className="font-semibold text-amber-800">Experimental</span>
            </div>
            <h1 className="text-lg font-semibold text-blue-700 mt-0.5 [text-shadow:0_0_8px_rgba(249,115,22,0.7),0_0_18px_rgba(251,146,60,0.45)]">
              Focal Mechanism &amp; First-Motion Polarity Analysis
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleRecompute}
              className={`h-8 inline-flex items-center gap-1.5 px-3 rounded-md text-xs font-medium transition-colors ${
                isStale
                  ? 'bg-amber-600 text-white hover:bg-amber-700'
                  : 'bg-slate-900 text-white hover:bg-slate-800'
              }`}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {isStale ? 'Recompute Mechanism' : 'Recompute'}
            </button>

            <button
              type="button"
              onClick={() => void handleExportPng()}
              className="h-8 inline-flex items-center gap-1.5 px-2.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-800"
            >
              <FileImage className="w-3.5 h-3.5 text-blue-600" />
              PNG
            </button>
            <button
              type="button"
              onClick={handleExportSvg}
              className="h-8 inline-flex items-center gap-1.5 px-2.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-800"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" />
              SVG
            </button>
            <button
              type="button"
              onClick={() => void handleCopySummary()}
              className="h-8 inline-flex items-center gap-1.5 px-2.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-800"
            >
              {copiedSummary ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-slate-600" />
              )}
              {copiedSummary ? 'Copied' : 'Copy'}
            </button>
            <button
              type="button"
              onClick={handleDownloadSummary}
              className="h-8 inline-flex items-center gap-1.5 px-2.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-800"
            >
              <FileText className="w-3.5 h-3.5 text-slate-600" />
              Summary
            </button>
          </div>
        </div>

        {/* Event Metadata Strip */}
        <div className="pt-2.5 border-t border-slate-400/60 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
          <div>
            <div className="text-[11px] text-slate-500">Event / File</div>
            <div className="font-mono font-semibold text-slate-900 truncate" title={event.filename}>
              {event.id}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500">Origin (UTC)</div>
            <div className="font-mono tabular-nums font-medium text-slate-900">
              {event.originDateGmt} {event.originTimeGmt}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500">Epicenter</div>
            <div className="font-mono tabular-nums font-medium text-slate-900">
              {unlocated ? 'Unlocated' : `${event.lat.toFixed(3)}°N, ${event.lon.toFixed(3)}°E`}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500">Depth</div>
            <div className="font-mono tabular-nums font-medium text-slate-900">
              {unlocated ? '—' : `${event.depthKm.toFixed(1)} km`}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500">Magnitude</div>
            <div className="font-mono tabular-nums font-medium text-slate-900">
              {event.preferredScale} {magVal.toFixed(1)}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500">Solution Source</div>
            <div className="font-medium text-slate-800 truncate" title={activeAnalysis.toaProvenanceSummary}>
              {event.locationMetadata
                ? `${event.locationMetadata.modelName} (${event.locationMetadata.solver})`
                : 'Stored / Sample EQP'}
            </div>
          </div>
        </div>

        {isStale && (
          <div
            role="status"
            className="p-2.5 rounded-md border border-amber-300 bg-amber-50 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-950"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
              <span>
                <strong>Stale Results:</strong> Selected event, hypocenter parameters, or
                research polarity filters changed since the last focal computation.
              </span>
            </div>
            <button
              type="button"
              onClick={handleRecompute}
              className="px-2.5 py-1 rounded bg-amber-700 text-white hover:bg-amber-800 font-medium text-[11px]"
            >
              Recompute Now
            </button>
          </div>
        )}
      </section>

      {/* Main Split Workspace: Stereonet Beachball + Nodal Planes / Quality / Manual Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left: Interactive Lower-Hemisphere Beachball Stereonet */}
        <section className="lg:col-span-5 bg-[#edf4fc] border border-sky-700/60 rounded-lg p-4 space-y-3 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Lower-Hemisphere Stereonet
              </h2>
              <p className="text-[11px] text-slate-600">
                Equal-area Schmidt projection · Click any station to inspect
              </p>
            </div>
            {!manualEnabled && activeAnalysis.status === 'computed' && (
              <div className="flex items-center gap-2 text-[11px]">
                {activeAnalysis.alternativeSolutions.length > 0 && (
                  <label className="inline-flex items-center gap-1 text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showAlternativePlanes}
                      onChange={(e) => setShowAlternativePlanes(e.target.checked)}
                      className="h-3.5 w-3.5 accent-blue-600"
                    />
                    <span>Alt. Planes</span>
                  </label>
                )}
                <button
                  type="button"
                  onClick={() => setSwapNodalOrder((v) => !v)}
                  className="px-2 py-1 rounded border border-sky-700/50 bg-[#dce9f8] hover:bg-[#cfe0f5] text-slate-800 font-medium"
                  title="Swap Nodal Plane 1 and Auxiliary Plane 2 labels (physically equivalent)"
                >
                  Swap Planes
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-col items-center">
            <div className="relative w-[300px] h-[300px]">
              <canvas
                ref={canvasRef}
                className="w-[300px] h-[300px] block"
                aria-label="Research focal mechanism beachball diagram"
              />
              <svg
                viewBox={`0 0 ${svgSize} ${svgSize}`}
                className="absolute inset-0 w-full h-full overflow-visible"
              >
                <circle
                  cx={svgCenter}
                  cy={svgCenter}
                  r={sphereRadius}
                  fill="none"
                  stroke="#0f172a"
                  strokeWidth={1.8}
                />
                <circle
                  cx={svgCenter}
                  cy={svgCenter}
                  r={ring45Radius}
                  fill="none"
                  stroke="#94a3b8"
                  strokeOpacity={0.45}
                  strokeWidth={0.9}
                  strokeDasharray="3 3"
                />
                <text
                  x={svgCenter}
                  y={svgCenter - sphereRadius - 7}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={700}
                  fill="#0f172a"
                  className="font-mono"
                >
                  N
                </text>
                <text
                  x={svgCenter + sphereRadius + 8}
                  y={svgCenter + 4}
                  textAnchor="start"
                  fontSize={10}
                  fill="#64748b"
                  className="font-mono"
                >
                  E
                </text>
                <text
                  x={svgCenter}
                  y={svgCenter + sphereRadius + 13}
                  textAnchor="middle"
                  fontSize={10}
                  fill="#64748b"
                  className="font-mono"
                >
                  S
                </text>
                <text
                  x={svgCenter - sphereRadius - 8}
                  y={svgCenter + 4}
                  textAnchor="end"
                  fontSize={10}
                  fill="#64748b"
                  className="font-mono"
                >
                  W
                </text>

                {!isInsufficient && (
                  <>
                    {alternativeArcPaths.map((arc) => (
                      <path
                        key={arc.key}
                        d={arc.d}
                        fill="none"
                        stroke="#3b82f6"
                        strokeOpacity={0.28}
                        strokeWidth={1}
                      />
                    ))}
                    {plane1Path && (
                      <path d={plane1Path} fill="none" stroke="#0f172a" strokeWidth={2} />
                    )}
                    {plane2Path && (
                      <path
                        d={plane2Path}
                        fill="none"
                        stroke="#0f172a"
                        strokeWidth={1.5}
                        strokeDasharray="5 3"
                      />
                    )}
                    <g pointerEvents="none">
                      {pProj && (
                        <>
                          <circle
                            cx={svgCenter + pProj.x * sphereRadius}
                            cy={svgCenter - pProj.y * sphereRadius}
                            r={9}
                            fill="#ffffff"
                            fillOpacity={0.94}
                            stroke="#0f172a"
                            strokeWidth={1.2}
                          />
                          <text
                            x={svgCenter + pProj.x * sphereRadius}
                            y={svgCenter - pProj.y * sphereRadius + 3.5}
                            textAnchor="middle"
                            fontSize={10}
                            fontWeight={800}
                            fill="#0f172a"
                            className="font-mono"
                          >
                            P
                          </text>
                        </>
                      )}
                      {tProj && (
                        <>
                          <circle
                            cx={svgCenter + tProj.x * sphereRadius}
                            cy={svgCenter - tProj.y * sphereRadius}
                            r={9}
                            fill="#0f172a"
                            fillOpacity={0.92}
                            stroke="#ffffff"
                            strokeWidth={1.2}
                          />
                          <text
                            x={svgCenter + tProj.x * sphereRadius}
                            y={svgCenter - tProj.y * sphereRadius + 3.5}
                            textAnchor="middle"
                            fontSize={10}
                            fontWeight={800}
                            fill="#ffffff"
                            className="font-mono"
                          >
                            T
                          </text>
                        </>
                      )}
                      {bProj && (
                        <>
                          <circle
                            cx={svgCenter + bProj.x * sphereRadius}
                            cy={svgCenter - bProj.y * sphereRadius}
                            r={7.5}
                            fill="#e2e8f0"
                            stroke="#475569"
                            strokeWidth={1}
                          />
                          <text
                            x={svgCenter + bProj.x * sphereRadius}
                            y={svgCenter - bProj.y * sphereRadius + 3}
                            textAnchor="middle"
                            fontSize={9}
                            fontWeight={700}
                            fill="#0f172a"
                            className="font-mono"
                          >
                            B
                          </text>
                        </>
                      )}
                    </g>
                  </>
                )}

                {plottedStations.map((item) => {
                  const px = svgCenter + (item.projX ?? 0) * sphereRadius;
                  const py = svgCenter - (item.projY ?? 0) * sphereRadius;
                  const isSelected = selectedStation === item.pick.sta;
                  const isHovered = hoveredSta === item.pick.sta;
                  const isCompression = item.polaritySign === 1;
                  const evalPick =
                    'radiationAmplitude' in item
                      ? (item as EvaluatedPolarityPick)
                      : null;
                  const isMatched = evalPick ? evalPick.isMatched : true;
                  const isNearNodal = evalPick ? evalPick.isNearNodal : false;

                  return (
                    <g
                      key={`res-fm-${item.pick.id}`}
                      onMouseEnter={() => setHoveredSta(item.pick.sta)}
                      onMouseLeave={() =>
                        setHoveredSta((curr) => (curr === item.pick.sta ? null : curr))
                      }
                      onClick={() => onSelectStation(isSelected ? null : item.pick.sta)}
                      className="cursor-pointer"
                    >
                      {isNearNodal && (
                        <circle
                          cx={px}
                          cy={py}
                          r={7.5}
                          fill="none"
                          stroke="#0284c7"
                          strokeWidth={1.2}
                          strokeDasharray="2 2"
                        />
                      )}
                      {(isSelected || isHovered) && (
                        <circle
                          cx={px}
                          cy={py}
                          r={9.5}
                          fill="none"
                          stroke="#f59e0b"
                          strokeWidth={2}
                        />
                      )}
                      <circle
                        cx={px}
                        cy={py}
                        r={4.8}
                        fill={isCompression ? '#f59e0b' : '#ffffff'}
                        stroke={isMatched ? '#0f172a' : '#be123c'}
                        strokeWidth={isMatched ? 1.4 : 2.2}
                      />
                      <text
                        x={px + 7}
                        y={py - 4}
                        fontSize={9.5}
                        fontWeight={isSelected || isHovered ? 700 : 600}
                        fill={isMatched ? '#0f172a' : '#9f1239'}
                        className="font-mono select-none"
                      >
                        {item.pick.sta}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[11px] text-slate-600 pt-1">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500 border border-slate-900" />
              Compression (c / +)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-white border border-slate-900" />
              Dilatation (d / -)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full border-2 border-rose-700 bg-white" />
              Discrepant
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full border border-dashed border-sky-600 bg-white" />
              Near-Nodal
            </span>
          </div>

          {hoveredItem && (
            <div className="text-[11px] font-mono tabular-nums text-slate-800 bg-[#dce9f8] border border-sky-700/55 rounded p-2 text-center">
              {hoveredItem.pick.sta} · Pol {hoveredItem.pick.polarity} ({hoveredItem.pick.quality}) ·
              Azim {hoveredItem.pick.azim.toFixed(1)}° · TOA {hoveredItem.pick.toa.toFixed(1)}°
              {'radiationAmplitude' in hoveredItem
                ? ` · Amp ${(hoveredItem as EvaluatedPolarityPick).radiationAmplitude.toFixed(2)}`
                : ''}
            </div>
          )}
        </section>

        {/* Right: Computed Solution / Insufficient Data, Quality Metrics & Manual Explorer */}
        <div className="lg:col-span-7 space-y-4">
          {/* Computed Results Section */}
          <section className="bg-[#edf7f2] border border-emerald-700/60 rounded-lg p-4 space-y-3 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
            <div className="flex flex-wrap items-start justify-between gap-2 pb-2.5 border-b border-emerald-700/35">
              <div>
                <div className="text-[11px] text-slate-500">
                  {activeAnalysis.methodologyLabel} ·{' '}
                  <span className="font-semibold text-amber-800">Experimental</span>
                </div>
                <div className="text-base font-semibold text-slate-900 mt-0.5">
                  {activeAnalysis.status === 'insufficient-data'
                    ? 'Insufficient Data — Solution Withheld'
                    : activeAnalysis.mechanismClass}
                </div>
              </div>
              {activeAnalysis.status === 'computed' && (
                <div className="text-right font-mono tabular-nums text-xs">
                  <div className="text-[11px] font-sans text-slate-500">Quality &amp; Fit</div>
                  <div className="font-semibold text-slate-900">
                    {activeAnalysis.quality.matchedCount}/{activeAnalysis.quality.usableCount}{' '}
                    ({activeAnalysis.quality.agreementPct}%)
                  </div>
                </div>
              )}
            </div>

            {activeAnalysis.status === 'insufficient-data' ? (
              <div className="p-3 rounded-md bg-[#d8ede3] border border-emerald-800/55 space-y-2 text-xs text-slate-800">
                <div className="font-semibold text-slate-900">
                  Cannot compute a scientifically defensible double-couple solution:
                </div>
                <ul className="list-disc pl-4 space-y-1">
                  {activeAnalysis.insufficientReasons.map((reason, idx) => (
                    <li key={idx}>{reason}</li>
                  ))}
                </ul>
                <div className="text-[11px] text-slate-700 pt-1">
                  Usable picks: {activeAnalysis.quality.usableCount} (Compression:{' '}
                  {activeAnalysis.quality.compressionCount}, Dilatation:{' '}
                  {activeAnalysis.quality.dilatationCount}). Use the Manual Plane Explorer below to
                  test hypothetical nodal planes against observed rays.
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs font-mono tabular-nums">
                  <div className="bg-[#d9eee3] border border-emerald-800/55 rounded p-2.5">
                    <div className="font-sans text-[11px] font-medium text-slate-700">
                      {swapNodalOrder ? 'Nodal Plane B' : 'Nodal Plane 1'}
                    </div>
                    <div className="font-semibold text-slate-900 mt-0.5">
                      {(swapNodalOrder ? activeAnalysis.plane2 : activeAnalysis.plane1)!.strike}° /{' '}
                      {(swapNodalOrder ? activeAnalysis.plane2 : activeAnalysis.plane1)!.dip}° /{' '}
                      {(swapNodalOrder ? activeAnalysis.plane2 : activeAnalysis.plane1)!.rake}°
                    </div>
                    <div className="font-sans text-[10px] text-slate-600">Strike / Dip / Rake</div>
                  </div>
                  <div className="bg-[#d9eee3] border border-emerald-800/55 rounded p-2.5">
                    <div className="font-sans text-[11px] font-medium text-slate-700">
                      {swapNodalOrder ? 'Nodal Plane A' : 'Auxiliary Plane 2'}
                    </div>
                    <div className="font-semibold text-slate-900 mt-0.5">
                      {(swapNodalOrder ? activeAnalysis.plane1 : activeAnalysis.plane2)!.strike}° /{' '}
                      {(swapNodalOrder ? activeAnalysis.plane1 : activeAnalysis.plane2)!.dip}° /{' '}
                      {(swapNodalOrder ? activeAnalysis.plane1 : activeAnalysis.plane2)!.rake}°
                    </div>
                    <div className="font-sans text-[10px] text-slate-600">Strike / Dip / Rake</div>
                  </div>
                  <div className="bg-[#d9eee3] border border-emerald-800/55 rounded p-2.5">
                    <div className="font-sans text-[11px] font-medium text-slate-700">P-Axis</div>
                    <div className="font-semibold text-slate-900 mt-0.5">
                      {activeAnalysis.pAxis!.trend}° / {activeAnalysis.pAxis!.plunge}°
                    </div>
                    <div className="font-sans text-[10px] text-slate-600">Trend / Plunge</div>
                  </div>
                  <div className="bg-[#d9eee3] border border-emerald-800/55 rounded p-2.5">
                    <div className="font-sans text-[11px] font-medium text-slate-700">T-Axis</div>
                    <div className="font-semibold text-slate-900 mt-0.5">
                      {activeAnalysis.tAxis!.trend}° / {activeAnalysis.tAxis!.plunge}°
                    </div>
                    <div className="font-sans text-[10px] text-slate-600">Trend / Plunge</div>
                  </div>
                  <div className="bg-[#d9eee3] border border-emerald-800/55 rounded p-2.5">
                    <div className="font-sans text-[11px] font-medium text-slate-700">B-Axis (Null)</div>
                    <div className="font-semibold text-slate-900 mt-0.5">
                      {activeAnalysis.bAxis!.trend}° / {activeAnalysis.bAxis!.plunge}°
                    </div>
                    <div className="font-sans text-[10px] text-slate-600">Trend / Plunge</div>
                  </div>
                </div>

                {/* Quality & Ambiguity Diagnostics Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs font-mono tabular-nums pt-1">
                  <div className="bg-[#d3ebe0] border border-emerald-800/55 rounded p-2">
                    <div className="font-sans text-[10.5px] font-medium text-slate-700">Usable Picks</div>
                    <div className="font-semibold text-slate-900">
                      {activeAnalysis.quality.usableCount} / {activeAnalysis.quality.totalPicksCount}
                    </div>
                    <div className="font-sans text-[10px] text-slate-600">
                      C:{activeAnalysis.quality.compressionCount} · D:{activeAnalysis.quality.dilatationCount}
                    </div>
                  </div>
                  <div className="bg-[#d3ebe0] border border-emerald-800/55 rounded p-2">
                    <div className="font-sans text-[10.5px] font-medium text-slate-700">Weighted Agreement</div>
                    <div className="font-semibold text-slate-900">
                      {activeAnalysis.quality.weightedAgreementPct}%
                    </div>
                    <div className="font-sans text-[10px] text-slate-600">
                      Near-nodal: {activeAnalysis.quality.nearNodalCount}
                    </div>
                  </div>
                  <div className="bg-[#d3ebe0] border border-emerald-800/55 rounded p-2">
                    <div className="font-sans text-[10.5px] font-medium text-slate-700">Weighted Misfit</div>
                    <div className="font-semibold text-slate-900">
                      {activeAnalysis.quality.weightedMisfitPct}%
                    </div>
                    <div className="font-sans text-[10px] text-slate-600">
                      Discrepant: {activeAnalysis.quality.discrepantCount}
                    </div>
                  </div>
                  <div className="bg-[#d3ebe0] border border-emerald-800/55 rounded p-2">
                    <div className="font-sans text-[10.5px] font-medium text-slate-700">Sphere Coverage</div>
                    <div className="font-semibold text-slate-900">
                      {activeAnalysis.quality.coverageGrade}
                    </div>
                    <div className="font-sans text-[10px] text-slate-600">
                      Gap {activeAnalysis.quality.maxAzimuthalGapDeg}° · {activeAnalysis.quality.occupiedQuadrants}/4 quad
                    </div>
                  </div>
                  <div className="bg-[#d3ebe0] border border-emerald-800/55 rounded p-2">
                    <div className="font-sans text-[10.5px] font-medium text-slate-700">Ambiguity</div>
                    <div className="font-semibold text-slate-900">
                      {activeAnalysis.quality.ambiguityGrade}
                    </div>
                    <div className="font-sans text-[10px] text-slate-600">
                      {activeAnalysis.quality.acceptableSolutionCount} sol · ΔK {activeAnalysis.quality.meanKaganSpreadDeg}°
                    </div>
                  </div>
                </div>

                {/* Alternative Acceptable Solutions */}
                {activeAnalysis.alternativeSolutions.length > 0 && (
                  <div className="pt-1 text-xs space-y-1">
                    <div className="text-[11px] font-medium text-slate-700">
                      Alternative Acceptable Orientations (within misfit tolerance):
                    </div>
                    <div className="flex flex-wrap gap-1.5 font-mono tabular-nums text-[11px]">
                      {activeAnalysis.alternativeSolutions.map((alt, i) => (
                        <button
                          key={`alt-btn-${i}`}
                          type="button"
                          onClick={() => {
                            setManualEnabled(true);
                            setManualPlane(alt.plane1);
                          }}
                          title="Inspect this alternative orientation in Manual Plane Explorer"
                          className="px-2 py-1 rounded border border-emerald-800/55 bg-[#d9eee3] hover:bg-[#cae6d8] hover:border-emerald-900/70 text-slate-800"
                        >
                          {alt.plane1.strike}°/{alt.plane1.dip}°/{alt.plane1.rake}° ({alt.agreementPct}% · K {alt.kaganFromPrimaryDeg}°)
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          {/* Clearly Separated Manual Plane Exploration Controls */}
          <section className="bg-[#fbf5ea] border border-amber-700/60 rounded-lg p-4 space-y-3 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Manual Plane Explorer (Hypothetical — Not Fitted)
                </h2>
                <p className="text-xs text-slate-600">
                  Explore strike, dip, and rake manually without modifying computed results or
                  accepted EQP data.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {manualEnabled && activeAnalysis.plane1 && (
                  <button
                    type="button"
                    onClick={() => setManualPlane(activeAnalysis.plane1!)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-amber-700/55 bg-[#f3e6cc] hover:bg-[#ebd9b5] text-xs font-medium text-slate-800"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset to Computed
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setManualEnabled((v) => !v)}
                  aria-pressed={manualEnabled}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                    manualEnabled
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-800 border-amber-700/60 hover:bg-[#f3e6cc]'
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  {manualEnabled ? 'Viewing Manual Plane' : 'Enable Manual Overlay'}
                </button>
              </div>
            </div>

            {manualEnabled && manualEvaluation && (
              <div className="space-y-3 pt-2 border-t border-amber-700/35">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <label className="block space-y-1">
                    <div className="flex justify-between font-mono tabular-nums text-slate-700">
                      <span className="font-sans font-medium">Strike (0°–359°)</span>
                      <span>{manualPlane.strike}°</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={359}
                      value={manualPlane.strike}
                      onChange={(e) =>
                        setManualPlane((p) => ({ ...p, strike: Number(e.target.value) }))
                      }
                      className="w-full accent-blue-600"
                    />
                  </label>
                  <label className="block space-y-1">
                    <div className="flex justify-between font-mono tabular-nums text-slate-700">
                      <span className="font-sans font-medium">Dip (0°–90°)</span>
                      <span>{manualPlane.dip}°</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={90}
                      value={manualPlane.dip}
                      onChange={(e) =>
                        setManualPlane((p) => ({ ...p, dip: Number(e.target.value) }))
                      }
                      className="w-full accent-blue-600"
                    />
                  </label>
                  <label className="block space-y-1">
                    <div className="flex justify-between font-mono tabular-nums text-slate-700">
                      <span className="font-sans font-medium">Rake (-180°–180°)</span>
                      <span>{manualPlane.rake}°</span>
                    </div>
                    <input
                      type="range"
                      min={-180}
                      max={180}
                      value={manualPlane.rake}
                      onChange={(e) =>
                        setManualPlane((p) => ({ ...p, rake: Number(e.target.value) }))
                      }
                      className="w-full accent-blue-600"
                    />
                  </label>
                </div>

                <div className="p-2.5 rounded bg-[#f3e6cc] border border-amber-800/55 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono tabular-nums">
                  <div>
                    <div className="font-sans text-[10.5px] font-medium text-slate-700">Hypothetical Class</div>
                    <div className="font-sans font-semibold text-slate-900">
                      {manualEvaluation.mechanismClass}
                    </div>
                  </div>
                  <div>
                    <div className="font-sans text-[10.5px] font-medium text-slate-700">Auxiliary Plane 2</div>
                    <div className="font-semibold text-slate-900">
                      {manualEvaluation.plane2.strike}°/{manualEvaluation.plane2.dip}°/
                      {manualEvaluation.plane2.rake}°
                    </div>
                  </div>
                  <div>
                    <div className="font-sans text-[10.5px] font-medium text-slate-700">P / T Axes</div>
                    <div className="font-semibold text-slate-900">
                      {manualEvaluation.pAxis.trend}°/{manualEvaluation.pAxis.plunge}° ·{' '}
                      {manualEvaluation.tAxis.trend}°/{manualEvaluation.tAxis.plunge}°
                    </div>
                  </div>
                  <div>
                    <div className="font-sans text-[10.5px] font-medium text-slate-700">Manual Polarity Fit</div>
                    <div className="font-semibold text-slate-900">
                      {manualEvaluation.matchedCount}/{manualEvaluation.totalCount} (
                      {manualEvaluation.agreementPct}%)
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Interpretation & Scientific Limitations */}
          <section className="bg-[#f3f1fb] border border-indigo-700/60 rounded-lg p-4 space-y-2 text-xs shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
            <h2 className="text-sm font-semibold text-slate-900">
              Interpretation &amp; Scientific Limitations
            </h2>
            <p className="text-slate-700 leading-relaxed">{activeAnalysis.interpretation}</p>
            <ul className="list-disc pl-4 space-y-1 text-slate-600 pt-1">
              {activeAnalysis.limitations.map((lim, idx) => (
                <li key={idx}>{lim}</li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      {/* Research-Only Station Polarity Table */}
      <section className="bg-[#eef6f8] border border-cyan-700/60 rounded-lg overflow-hidden shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
        <div className="px-4 py-3 border-b border-cyan-700/40 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Station First-Motion Polarity Table (Research-Only Inclusion / Exclusion)
            </h2>
            <p className="text-xs text-slate-600">
              Changes below affect only this Research focal mechanism session and never alter
              accepted EQP picks.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className="inline-flex items-center gap-1.5 text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={includeAcceptedExcluded}
                onChange={(e) => setIncludeAcceptedExcluded(e.target.checked)}
                className="h-3.5 w-3.5 accent-blue-600"
              />
              <span>Include EQP-Excluded (*) Picks</span>
            </label>
            {researchExcludedIds.size > 0 && (
              <button
                type="button"
                onClick={() => setResearchExcludedIds(new Set())}
                className="px-2.5 py-1 rounded border border-cyan-700/55 bg-[#dcecf1] hover:bg-[#cde3ea] text-slate-800 font-medium"
              >
                Reset Research Exclusions ({researchExcludedIds.size})
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#dfeef2] border-b border-cyan-700/45 text-[11px] font-semibold text-slate-700">
                <th className="py-2 px-3">Research Use</th>
                <th className="py-2 px-3">Station</th>
                <th className="py-2 px-3">Pol</th>
                <th className="py-2 px-3">Qual / Wt</th>
                <th className="py-2 px-3 text-right">Azim (°)</th>
                <th className="py-2 px-3 text-right">TOA (°)</th>
                <th className="py-2 px-3 text-right">Δ (°)</th>
                <th className="py-2 px-3 text-right">Rad. Amp</th>
                <th className="py-2 px-3">Validation / Fit Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cyan-200/55">
              {liveTablePicks.map(({ row, evalItem }) => {
                const isSel = selectedStation === row.pick.sta;
                const isResearchExcl = researchExcludedIds.has(row.pick.id);
                const canToggle =
                  !row.pick.pExcluded &&
                  row.polaritySign !== null &&
                  row.status !== 'invalid-geometry';

                return (
                  <tr
                    key={row.pick.id}
                    onClick={() => onSelectStation(isSel ? null : row.pick.sta)}
                    className={`cursor-pointer transition-colors ${
                      isSel ? 'bg-sky-100/80' : 'hover:bg-white/75'
                    }`}
                  >
                    <td
                      className="py-2 px-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={row.status === 'usable'}
                        disabled={!canToggle}
                        onChange={() => toggleResearchExclude(row.pick.id)}
                        aria-label={`Include ${row.pick.sta} in research focal inversion`}
                        className="h-3.5 w-3.5 accent-blue-600 disabled:opacity-40"
                      />
                    </td>
                    <td className="py-2 px-3 font-mono font-semibold text-slate-900">
                      {row.pick.sta}
                      {row.pick.pExcluded && (
                        <span className="ml-1 text-[10px] text-amber-700">(*)</span>
                      )}
                    </td>
                    <td className="py-2 px-3 font-mono">
                      {row.polaritySign === 1 ? (
                        <span className="text-amber-800 font-semibold">
                          {row.pick.polarity} (+)
                        </span>
                      ) : row.polaritySign === -1 ? (
                        <span className="text-slate-700 font-semibold">
                          {row.pick.polarity} (-)
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2 px-3 font-mono tabular-nums text-slate-600">
                      {row.pick.quality} ({row.weight.toFixed(2)})
                    </td>
                    <td className="py-2 px-3 font-mono tabular-nums text-right text-slate-800">
                      {Number.isFinite(row.pick.azim) ? row.pick.azim.toFixed(1) : '—'}
                    </td>
                    <td className="py-2 px-3 font-mono tabular-nums text-right text-slate-800">
                      {Number.isFinite(row.pick.toa) ? row.pick.toa.toFixed(1) : '—'}
                      {row.status === 'usable' && (
                        <span className="ml-1 text-[10px] text-slate-400">
                          {row.isUpgoing ? '↑' : '↓'}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 font-mono tabular-nums text-right text-slate-600">
                      {Number.isFinite(row.pick.delta) ? row.pick.delta.toFixed(2) : '—'}
                    </td>
                    <td className="py-2 px-3 font-mono tabular-nums text-right text-slate-700">
                      {evalItem ? evalItem.radiationAmplitude.toFixed(2) : '—'}
                    </td>
                    <td className="py-2 px-3">
                      {evalItem ? (
                        <span
                          className={`font-medium ${
                            evalItem.isMatched
                              ? evalItem.isNearNodal
                                ? 'text-sky-700'
                                : 'text-emerald-700'
                              : evalItem.isNearNodal
                                ? 'text-amber-700'
                                : 'text-rose-700'
                          }`}
                        >
                          {evalItem.isMatched
                            ? evalItem.isNearNodal
                              ? 'Consistent (Near-Nodal)'
                              : 'Consistent'
                            : evalItem.isNearNodal
                              ? 'Discrepant (Near-Nodal)'
                              : 'Discrepant'}
                        </span>
                      ) : (
                        <span className="text-slate-500">{row.statusReason}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
