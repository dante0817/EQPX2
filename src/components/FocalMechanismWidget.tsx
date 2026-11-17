import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { EQPEvent } from '../data/eqpData';
import {
  buildNodalPlaneSvgPath,
  dotVec,
  evaluateManualMechanism,
  invertFocalMechanism,
  NodalPlane,
  schmidtProjectLower,
  Vec3,
} from '../utils/focalMechanism';

interface FocalMechanismWidgetProps {
  event: EQPEvent;
  selectedStation: string | null;
  onSelectStation: (sta: string | null) => void;
  onOpenResearch?: () => void;
}

export const FocalMechanismWidget: React.FC<FocalMechanismWidgetProps> = ({
  event,
  selectedStation,
  onSelectStation,
  onOpenResearch,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [includeExcluded, setIncludeExcluded] = useState(false);
  const [manualOverride, setManualOverride] = useState(false);
  const [manualPlane, setManualPlane] = useState<NodalPlane>({
    strike: 0,
    dip: 45,
    rake: 90,
  });
  const [hoveredSta, setHoveredSta] = useState<string | null>(null);

  const researchExclusions = useMemo(() => {
    if (includeExcluded) return new Set<string>();
    return new Set<string>();
  }, [includeExcluded]);

  // Build read-only view of event if includeExcluded is checked in this widget
  const viewEvent = useMemo<EQPEvent>(() => {
    if (!includeExcluded) return event;
    return {
      ...event,
      picks: event.picks.map((p) => (p.pExcluded ? { ...p, pExcluded: false } : p)),
    };
  }, [event, includeExcluded]);

  const analysis = useMemo(
    () => invertFocalMechanism(viewEvent, researchExclusions),
    [viewEvent, researchExclusions]
  );

  useEffect(() => {
    if (!manualOverride && analysis.plane1) {
      setManualPlane(analysis.plane1);
    }
  }, [analysis.plane1, manualOverride]);

  const manualEval = useMemo(() => {
    if (!manualOverride) return null;
    return evaluateManualMechanism(
      viewEvent,
      manualPlane.strike,
      manualPlane.dip,
      manualPlane.rake,
      researchExclusions
    );
  }, [manualOverride, viewEvent, manualPlane, researchExclusions]);

  const displayPlane1 = manualEval ? manualEval.plane1 : analysis.plane1;
  const displayPlane2 = manualEval ? manualEval.plane2 : analysis.plane2;
  const displayP = manualEval ? manualEval.pAxis : analysis.pAxis;
  const displayT = manualEval ? manualEval.tAxis : analysis.tAxis;
  const displayB = manualEval ? manualEval.bAxis : analysis.bAxis;
  const displayN = manualEval ? manualEval.nVec : analysis.nVec;
  const displayS = manualEval ? manualEval.sVec : analysis.sVec;
  const displayClass = manualEval ? manualEval.mechanismClass : analysis.mechanismClass;

  const isInsufficient = !manualOverride && analysis.status === 'insufficient-data';

  const plottedStations = useMemo(() => {
    if (manualEval) return manualEval.evaluatedPicks;
    if (analysis.status === 'computed') return analysis.evaluatedPicks;
    return analysis.allPicks.filter(
      (p) => p.status === 'usable' && p.projX !== null && p.projY !== null
    );
  }, [manualEval, analysis]);

  // Draw lower-hemisphere beachball quadrant shading onto high-DPI canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const size = 220;
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
          data[idx + 3] = 225;
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

  const svgSize = 220;
  const svgCenter = svgSize / 2;
  const sphereRadius = svgSize * 0.44;
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

  const pProj = displayP ? schmidtProjectLower(displayP.vec) : null;
  const tProj = displayT ? schmidtProjectLower(displayT.vec) : null;
  const bProj = displayB ? schmidtProjectLower(displayB.vec) : null;

  const hoveredItem = plottedStations.find((p) => p.pick.sta === hoveredSta) ?? null;

  return (
    <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Focal Mechanism &amp; First-Motion Polarity Stereonet
          </h2>
          <p className="text-xs text-slate-500">
            Experimental · Aki &amp; Richards NED · Lower-hemisphere equal-area projection
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          <label className="inline-flex items-center gap-1.5 text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={includeExcluded}
              onChange={(e) => setIncludeExcluded(e.target.checked)}
              className="h-3.5 w-3.5 accent-blue-600"
            />
            <span>Include Excluded (*)</span>
          </label>

          <button
            type="button"
            onClick={() => setManualOverride((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border font-medium transition-colors ${
              manualOverride
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            {manualOverride ? 'Manual Explorer' : 'Inspect Planes'}
          </button>

          {onOpenResearch && (
            <button
              type="button"
              onClick={onOpenResearch}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100 font-medium transition-colors"
            >
              <span>Research Workspace</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="p-4 grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
        <div className="lg:col-span-5 flex flex-col items-center justify-center space-y-2">
          <div className="relative w-[220px] h-[220px]">
            <canvas
              ref={canvasRef}
              className="w-[220px] h-[220px] block"
              aria-label="Focal mechanism beachball diagram"
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
                strokeWidth={1.6}
              />
              <circle
                cx={svgCenter}
                cy={svgCenter}
                r={ring45Radius}
                fill="none"
                stroke="#94a3b8"
                strokeOpacity={0.4}
                strokeWidth={0.8}
                strokeDasharray="3 3"
              />
              <text
                x={svgCenter}
                y={svgCenter - sphereRadius - 5}
                textAnchor="middle"
                fontSize={10}
                fontWeight={700}
                fill="#334155"
                className="font-mono"
              >
                N
              </text>
              <text
                x={svgCenter + sphereRadius + 7}
                y={svgCenter + 3}
                textAnchor="start"
                fontSize={9}
                fill="#64748b"
                className="font-mono"
              >
                E
              </text>
              <text
                x={svgCenter}
                y={svgCenter + sphereRadius + 11}
                textAnchor="middle"
                fontSize={9}
                fill="#64748b"
                className="font-mono"
              >
                S
              </text>
              <text
                x={svgCenter - sphereRadius - 7}
                y={svgCenter + 3}
                textAnchor="end"
                fontSize={9}
                fill="#64748b"
                className="font-mono"
              >
                W
              </text>

              {!isInsufficient && (
                <>
                  {plane1Path && (
                    <path d={plane1Path} fill="none" stroke="#0f172a" strokeWidth={1.6} />
                  )}
                  {plane2Path && (
                    <path
                      d={plane2Path}
                      fill="none"
                      stroke="#0f172a"
                      strokeWidth={1.3}
                      strokeDasharray="4 2"
                    />
                  )}
                  <g pointerEvents="none">
                    {pProj && (
                      <>
                        <circle
                          cx={svgCenter + pProj.x * sphereRadius}
                          cy={svgCenter - pProj.y * sphereRadius}
                          r={7.5}
                          fill="#ffffff"
                          fillOpacity={0.92}
                          stroke="#0f172a"
                          strokeWidth={1}
                        />
                        <text
                          x={svgCenter + pProj.x * sphereRadius}
                          y={svgCenter - pProj.y * sphereRadius + 3}
                          textAnchor="middle"
                          fontSize={9}
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
                          r={7.5}
                          fill="#0f172a"
                          fillOpacity={0.9}
                          stroke="#ffffff"
                          strokeWidth={1}
                        />
                        <text
                          x={svgCenter + tProj.x * sphereRadius}
                          y={svgCenter - tProj.y * sphereRadius + 3}
                          textAnchor="middle"
                          fontSize={9}
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
                          r={6.5}
                          fill="#e2e8f0"
                          stroke="#475569"
                          strokeWidth={1}
                        />
                        <text
                          x={svgCenter + bProj.x * sphereRadius}
                          y={svgCenter - bProj.y * sphereRadius + 2.8}
                          textAnchor="middle"
                          fontSize={8}
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
                const isMatched = 'isMatched' in item ? item.isMatched : true;

                return (
                  <g
                    key={`fm-${item.pick.id}`}
                    onMouseEnter={() => setHoveredSta(item.pick.sta)}
                    onMouseLeave={() =>
                      setHoveredSta((curr) => (curr === item.pick.sta ? null : curr))
                    }
                    onClick={() => onSelectStation(isSelected ? null : item.pick.sta)}
                    className="cursor-pointer"
                  >
                    {(isSelected || isHovered) && (
                      <circle
                        cx={px}
                        cy={py}
                        r={8}
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth={2}
                      />
                    )}
                    <circle
                      cx={px}
                      cy={py}
                      r={4.3}
                      fill={isCompression ? '#f59e0b' : '#ffffff'}
                      stroke={isMatched ? '#0f172a' : '#e11d48'}
                      strokeWidth={isMatched ? 1.4 : 2}
                    />
                    <text
                      x={px + 6}
                      y={py - 4}
                      fontSize={8.5}
                      fontWeight={isSelected || isHovered ? 700 : 600}
                      fill={isMatched ? '#0f172a' : '#be123c'}
                      className="font-mono select-none"
                    >
                      {item.pick.sta}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 text-[11px] text-slate-600">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500 border border-slate-900" />
              Compression (c / +)
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-white border border-slate-900" />
              Dilatation (d / -)
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-blue-800" />
              Compressional Quadrant
            </span>
          </div>

          {hoveredItem && (
            <div className="text-[11px] font-mono tabular-nums text-slate-700 bg-slate-50 border border-slate-200 rounded px-2.5 py-1">
              {hoveredItem.pick.sta} · Pol {hoveredItem.pick.polarity} · TOA{' '}
              {hoveredItem.pick.toa.toFixed(1)}° · Azim {hoveredItem.pick.azim.toFixed(1)}°
            </div>
          )}
        </div>

        <div className="lg:col-span-7 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2 pb-2.5 border-b border-slate-100">
            <div>
              <div className="text-[11px] text-slate-500">
                {manualOverride
                  ? 'Hypothetical Manual Plane (Not Fitted)'
                  : 'Double-Couple Classification (Experimental)'}
              </div>
              <div className="text-base font-semibold text-slate-900">
                {isInsufficient ? 'Insufficient Data' : displayClass}
              </div>
              <div className="text-xs text-slate-600 mt-0.5">
                {isInsufficient
                  ? analysis.insufficientReasons[0]
                  : manualOverride
                    ? 'Manual testing overlay; does not overwrite computed inversion or accepted EQP data.'
                    : analysis.interpretation}
              </div>
            </div>
            <div className="text-right font-mono tabular-nums shrink-0">
              <div className="text-[11px] font-sans text-slate-500">Polarity Agreement</div>
              <div
                className={`text-sm font-semibold ${
                  isInsufficient
                    ? 'text-amber-700'
                    : (manualEval ? manualEval.agreementPct : analysis.quality.agreementPct) >= 80
                      ? 'text-emerald-700'
                      : 'text-amber-700'
                }`}
              >
                {isInsufficient
                  ? `${analysis.quality.usableCount}/6 min`
                  : manualEval
                    ? `${manualEval.matchedCount}/${manualEval.totalCount} (${manualEval.agreementPct}%)`
                    : `${analysis.quality.matchedCount}/${analysis.quality.usableCount} (${analysis.quality.agreementPct}%)`}
              </div>
              {!isInsufficient && !manualOverride && (
                <div className="text-[10px] font-sans text-slate-500">
                  Coverage: {analysis.quality.coverageGrade} · Ambiguity:{' '}
                  {analysis.quality.ambiguityGrade}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono tabular-nums">
            <div className="bg-slate-50 border border-slate-200/80 rounded p-2.5">
              <div className="font-sans text-[11px] text-slate-500">Nodal Plane 1</div>
              <div className="font-semibold text-slate-900 mt-0.5">
                {isInsufficient || !displayPlane1
                  ? '— / — / —'
                  : `${displayPlane1.strike}° / ${displayPlane1.dip}° / ${displayPlane1.rake}°`}
              </div>
              <div className="font-sans text-[10px] text-slate-400">Strike / Dip / Rake</div>
            </div>
            <div className="bg-slate-50 border border-slate-200/80 rounded p-2.5">
              <div className="font-sans text-[11px] text-slate-500">Auxiliary Plane 2</div>
              <div className="font-semibold text-slate-900 mt-0.5">
                {isInsufficient || !displayPlane2
                  ? '— / — / —'
                  : `${displayPlane2.strike}° / ${displayPlane2.dip}° / ${displayPlane2.rake}°`}
              </div>
              <div className="font-sans text-[10px] text-slate-400">Strike / Dip / Rake</div>
            </div>
            <div className="bg-slate-50 border border-slate-200/80 rounded p-2.5">
              <div className="font-sans text-[11px] text-slate-500">P / T Axes</div>
              <div className="font-semibold text-slate-900 mt-0.5">
                {isInsufficient || !displayP || !displayT
                  ? '— / —'
                  : `${displayP.trend}°/${displayP.plunge}° · ${displayT.trend}°/${displayT.plunge}°`}
              </div>
              <div className="font-sans text-[10px] text-slate-400">Trend / Plunge</div>
            </div>
            <div className="bg-slate-50 border border-slate-200/80 rounded p-2.5">
              <div className="font-sans text-[11px] text-slate-500">B-Axis (Null)</div>
              <div className="font-semibold text-slate-900 mt-0.5">
                {isInsufficient || !displayB
                  ? '— / —'
                  : `${displayB.trend}° / ${displayB.plunge}°`}
              </div>
              <div className="font-sans text-[10px] text-slate-400">Trend / Plunge</div>
            </div>
          </div>

          {manualOverride && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800">
                  Manual Plane Explorer (Hypothetical)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (analysis.plane1) setManualPlane(analysis.plane1);
                    setManualOverride(false);
                  }}
                  className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium"
                >
                  <RotateCcw className="w-3 h-3" />
                  Exit Manual Explorer
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="block">
                  <div className="flex justify-between font-mono tabular-nums text-slate-700 mb-1">
                    <span className="font-sans">Strike</span>
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
                <label className="block">
                  <div className="flex justify-between font-mono tabular-nums text-slate-700 mb-1">
                    <span className="font-sans">Dip</span>
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
                <label className="block">
                  <div className="flex justify-between font-mono tabular-nums text-slate-700 mb-1">
                    <span className="font-sans">Rake</span>
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
            </div>
          )}

          <div className="pt-1">
            <div className="text-[11px] text-slate-500 mb-1.5">
              Station Polarity Summary ({analysis.quality.usableCount} usable /{' '}
              {analysis.quality.totalPicksCount} picks)
            </div>
            {plottedStations.length === 0 ? (
              <div className="text-xs text-slate-500 italic">
                No usable P-wave polarities with valid takeoff angle &amp; azimuth on active picks.
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {plottedStations.map((item) => {
                  const isSel = selectedStation === item.pick.sta;
                  const isMatched = 'isMatched' in item ? item.isMatched : true;
                  return (
                    <button
                      key={`chip-${item.pick.id}`}
                      type="button"
                      onClick={() => onSelectStation(isSel ? null : item.pick.sta)}
                      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border text-[11px] font-mono tabular-nums transition-colors ${
                        isSel
                          ? 'bg-slate-900 text-white border-slate-900'
                          : isMatched
                            ? 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50'
                            : 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100'
                      }`}
                    >
                      <span
                        className={`inline-block w-2 h-2 rounded-full border ${
                          item.polaritySign === 1
                            ? 'bg-amber-500 border-slate-900'
                            : 'bg-white border-slate-900'
                        }`}
                      />
                      <span className="font-semibold">{item.pick.sta}</span>
                      <span className="opacity-75">
                        {item.pick.polarity} ({item.pick.quality})
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
