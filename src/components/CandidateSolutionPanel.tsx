import React from 'react';
import {
  AlertTriangle,
  Check,
  Info,
  RefreshCw,
  Trash2,
  XCircle,
} from 'lucide-react';
import type { EQPEvent } from '../data/eqpData';
import { computeDistanceAndBearing } from '../utils/nearestPlaces';
import {
  type CandidateLocationSolution,
  computeLocationQualityIndex,
  formatLocationQualityTooltip,
} from '../utils/locationController';
import { isEventUnlocated } from '../data/eqpData';

interface CandidateSolutionPanelProps {
  candidate: CandidateLocationSolution;
  adoptedEvent: EQPEvent;
  stale: boolean;
  onAdopt: () => void;
  onDiscard: () => void;
  onRecalculate?: () => void;
}

export const CandidateSolutionPanel: React.FC<CandidateSolutionPanelProps> = ({
  candidate,
  adoptedEvent,
  stale,
  onAdopt,
  onDiscard,
  onRecalculate,
}) => {
  const { result } = candidate;
  const isFailed = !result.converged || candidate.status === 'failed';
  const hasWarnings = result.warnings.length > 0 || result.rejectedObservations.length > 0;
  const isAdoptedLocated = !isEventUnlocated(adoptedEvent);
  const candidateLqi = !isFailed
    ? computeLocationQualityIndex({
        rmsSec: result.rmsSec,
        stationCount: result.usedStationCount,
        azimuthalGapDeg: result.azimuthalGapDeg,
      })
    : null;

  const deltaEpicenterKm =
    !isFailed && isAdoptedLocated
      ? computeDistanceAndBearing(
          adoptedEvent.lat,
          adoptedEvent.lon,
          result.lat,
          result.lon
        ).distKm
      : null;

  const deltaDepthKm =
    !isFailed && isAdoptedLocated ? result.depthKm - adoptedEvent.depthKm : null;

  const containerStyle = isFailed
    ? 'bg-red-50 border-red-500 text-red-950'
    : stale || hasWarnings || result.depthFixed
      ? 'bg-amber-50 border-amber-500 text-slate-900'
      : 'bg-sky-50 border-sky-600 text-slate-900';

  const headerBg = isFailed
    ? 'bg-red-100 border-red-300 text-red-900'
    : stale || hasWarnings || result.depthFixed
      ? 'bg-amber-100 border-amber-300 text-amber-950'
      : 'bg-sky-100 border-sky-300 text-sky-950';

  return (
    <section
      aria-label="Candidate Location Solution Review"
      className={`border-2 rounded-sm shadow-sm font-sans text-xs ${containerStyle}`}
    >
      <div
        className={`px-3 py-2 border-b flex flex-wrap items-center justify-between gap-2 ${headerBg}`}
      >
        <div className="flex items-center gap-2">
          {isFailed ? (
            <XCircle className="w-4 h-4 text-red-700 shrink-0" />
          ) : stale || hasWarnings ? (
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
          ) : (
            <Info className="w-4 h-4 text-sky-700 shrink-0" />
          )}
          <span className="font-bold">
            {isFailed
              ? 'Candidate Location Failed — Adopted Event Unchanged'
              : stale
                ? 'Candidate Solution Stale (Inputs Modified Since Locate)'
                : 'Candidate Location Ready for Review (Not Yet Adopted)'}
          </span>
          <span className="px-1.5 py-0.5 rounded-xs bg-white/80 border border-slate-300 font-mono text-[10px] text-slate-800">
            {result.modelName} · {result.modelVersion}
          </span>
          <span className="px-1.5 py-0.5 rounded-xs bg-white/80 border border-slate-300 font-mono text-[10px] text-slate-800">
            {candidate.solverEngine} ({result.correctionProfile})
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {stale && onRecalculate && (
            <button
              type="button"
              onClick={onRecalculate}
              className="px-2.5 py-1 rounded-xs bg-amber-700 hover:bg-amber-800 text-white font-semibold inline-flex items-center gap-1 text-[11px]"
            >
              <RefreshCw className="w-3 h-3" />
              Re-Locate
            </button>
          )}
          {!isFailed && (
            <button
              type="button"
              onClick={onAdopt}
              disabled={stale}
              title={
                stale
                  ? 'Re-run Locate first because picks or trial depth changed.'
                  : 'Promote candidate hypocenter and residuals to the official event record'
              }
              className="px-2.5 py-1 rounded-xs bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-400 disabled:cursor-not-allowed text-white font-semibold inline-flex items-center gap-1 text-[11px]"
            >
              <Check className="w-3.5 h-3.5" />
              Adopt Solution
            </button>
          )}
          <button
            type="button"
            onClick={onDiscard}
            className="px-2.5 py-1 rounded-xs bg-white hover:bg-slate-100 border border-slate-400 text-slate-800 font-semibold inline-flex items-center gap-1 text-[11px]"
          >
            <Trash2 className="w-3.5 h-3.5 text-slate-600" />
            {isFailed ? 'Dismiss' : 'Discard'}
          </button>
        </div>
      </div>

      <div className="p-3 space-y-2.5">
        {isFailed ? (
          <div className="space-y-1.5">
            <p className="font-semibold text-red-900">
              {result.reason || 'Hypocenter inversion did not converge.'}
            </p>
            <p className="text-[11px] text-red-800">
              Active valid stations: {result.usedStationCount} · Active phases:{' '}
              {result.activePhaseCount} ({result.usedPCount}P / {result.usedSCount}S). The
              adopted event coordinates and residuals were not modified.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-2.5">
            <div className="bg-white/90 border border-slate-300 rounded-xs p-2 font-mono text-[11px] space-y-0.5">
              <div className="font-sans font-semibold text-[10px] uppercase tracking-wide text-slate-500">
                Candidate Hypocenter
              </div>
              <div className="text-slate-900 font-bold">
                {result.lat.toFixed(3)}°N, {result.lon.toFixed(3)}°E
              </div>
              <div>
                Depth: <span className="font-semibold">{result.depthKm.toFixed(1)} km</span>{' '}
                <span className="text-[10px] text-slate-600">
                  ({result.depthFixed ? 'Fixed' : 'Free'})
                </span>
              </div>
              <div>Origin: {result.originTimeGmt} UTC</div>
            </div>

            <div className="bg-white/90 border border-slate-300 rounded-xs p-2 font-mono text-[11px] space-y-0.5">
              <div className="font-sans font-semibold text-[10px] uppercase tracking-wide text-slate-500">
                Residuals & Errors
              </div>
              <div>
                Unweighted RMS:{' '}
                <span className="font-semibold">{result.rmsSec.toFixed(2)} s</span>
              </div>
              <div>
                Weighted WRMS:{' '}
                <span className="font-semibold">{result.weightedRmsSec.toFixed(2)} s</span>
              </div>
              <div>
                Horiz Err: ±{result.errKm.toFixed(2)} km · Depth Err:{' '}
                {result.errDepthKm !== null ? `±${result.errDepthKm.toFixed(1)} km` : '—'}
                {!result.uncertaintyReliable && (
                  <span className="ml-1 text-amber-700 font-sans text-[10px]">
                    (uncalibrated)
                  </span>
                )}
              </div>
            </div>

            <div className="bg-white/90 border border-slate-300 rounded-xs p-2 font-mono text-[11px] space-y-0.5">
              <div className="font-sans font-semibold text-[10px] uppercase tracking-wide text-slate-500">
                Geometry & Conditioning
              </div>
              <div>
                Stations: {result.usedStationCount} · Phases: {result.activePhaseCount} (
                {result.usedPCount}P / {result.usedSCount}S)
              </div>
              <div>
                Azimuthal Gap:{' '}
                {result.azimuthalGapDeg !== null ? `${result.azimuthalGapDeg}°` : '—'}
              </div>
              <div>
                Cond(JᵀWJ):{' '}
                {result.conditionNumber !== null
                  ? result.conditionNumber.toFixed(1)
                  : '—'}{' '}
                · Iter: {result.iterations}
              </div>
              {candidateLqi && (
                <div
                  title={formatLocationQualityTooltip(candidateLqi)}
                  className="pt-0.5 font-semibold text-slate-900 cursor-help"
                >
                  LQI:{' '}
                  <span
                    className={
                      candidateLqi.grade === 'A'
                        ? 'text-emerald-700'
                        : candidateLqi.grade === 'B'
                          ? 'text-sky-700'
                          : candidateLqi.grade === 'C'
                            ? 'text-amber-700'
                            : 'text-rose-700'
                    }
                  >
                    {candidateLqi.score}/100 ({candidateLqi.grade} · {candidateLqi.label})
                  </span>
                </div>
              )}
            </div>

            <div className="bg-white/90 border border-slate-300 rounded-xs p-2 font-mono text-[11px] space-y-0.5">
              <div className="font-sans font-semibold text-[10px] uppercase tracking-wide text-slate-500">
                Shift vs Adopted Event
              </div>
              {isAdoptedLocated && deltaEpicenterKm !== null && deltaDepthKm !== null ? (
                <>
                  <div>
                    Epicenter Δ:{' '}
                    <span className="font-semibold">{deltaEpicenterKm.toFixed(2)} km</span>
                  </div>
                  <div>
                    Depth Δ:{' '}
                    <span className="font-semibold">
                      {deltaDepthKm >= 0 ? '+' : ''}
                      {deltaDepthKm.toFixed(1)} km
                    </span>
                  </div>
                  <div>
                    RMS Δ: {(result.rmsSec - adoptedEvent.rmsSec).toFixed(2)} s
                  </div>
                </>
              ) : (
                <div className="text-slate-600 font-sans">
                  Current event has no adopted hypocenter yet.
                </div>
              )}
            </div>
          </div>
        )}

        {(result.warnings.length > 0 || result.rejectedObservations.length > 0) && (
          <div className="bg-white/80 border border-amber-300 rounded-xs px-2.5 py-1.5 text-[11px] space-y-0.5">
            <div className="font-semibold text-amber-900">
              Diagnostics & Rejected Observations
            </div>
            {result.warnings.map((w, idx) => (
              <div key={`warn-${idx}`} className="text-slate-800">
                • {w}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
