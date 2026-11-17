import React, { useEffect, useMemo, useState } from 'react';
import { Globe, X } from 'lucide-react';
import { EQPEvent, MagnitudeScale, StationPick } from '../data/eqpData';
import {
  applyOutlierFilteredMagnitudeToEvent,
  buildDurationRowsWithOutlierFilter,
  computeDurationMagnitudes,
  computeDurationOutlierSummary,
  computeOutlierFilteredScaleMean,
  computePickDurationMagnitudes,
  isDurationMagnitudeEligible,
  type DurationOutlierSummary,
  type StationDurationMagRow,
} from '../utils/legacyMagnitudeMath';

export {
  applyOutlierFilteredMagnitudeToEvent,
  buildDurationRowsWithOutlierFilter,
  computeDurationMagnitudes,
  computeDurationOutlierSummary,
  computeOutlierFilteredScaleMean,
  computePickDurationMagnitudes,
  isDurationMagnitudeEligible,
  type DurationOutlierSummary,
  type StationDurationMagRow,
};

interface MagnitudeDurationPopupProps {
  open: boolean;
  event: EQPEvent;
  varianceK?: number;
  onChangeVarianceK?: (nextK: number) => void;
  onApply: (result: {
    preferredScale: MagnitudeScale;
    ms: number;
    mb: number;
    md: number;
    updatedPicks: StationPick[];
  }) => void;
  onCancel: () => void;
}

export const MagnitudeDurationPopup: React.FC<MagnitudeDurationPopupProps> = ({
  open,
  event,
  varianceK,
  onChangeVarianceK,
  onApply,
  onCancel,
}) => {
  const [selectedScale, setSelectedScale] = useState<MagnitudeScale>(event.preferredScale);
  const [rows, setRows] = useState<StationDurationMagRow[]>([]);
  const [localK, setLocalK] = useState<number>(varianceK ?? 1.5);
  const [autoRejectOutliers, setAutoRejectOutliers] = useState<boolean>(true);

  const effectiveK = varianceK ?? localK;

  useEffect(() => {
    if (!open) return;
    setSelectedScale(event.preferredScale);
    const initial = buildDurationRowsWithOutlierFilter(
      event,
      event.preferredScale,
      varianceK ?? 1.5,
      { autoRejectOutliers: true, respectManualOverrides: true }
    );
    setRows(initial.rows);
    setAutoRejectOutliers(initial.autoRejectActive);
  }, [open, event]);

  useEffect(() => {
    if (varianceK !== undefined) {
      setLocalK(varianceK);
    }
  }, [varianceK]);

  const averages = useMemo(() => {
    const active = rows.filter((r) => r.included);
    if (active.length === 0) {
      return {
        ms: 0,
        mb: 0,
        ml: 0,
        count: 0,
      };
    }
    const mean = (vals: number[]) =>
      Number((vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1));
    return {
      ms: mean(active.map((r) => r.ms)),
      mb: mean(active.map((r) => r.mb)),
      ml: mean(active.map((r) => r.ml)),
      count: active.length,
    };
  }, [rows]);

  const outlierSummary = useMemo(
    () => computeDurationOutlierSummary(rows, selectedScale, effectiveK),
    [rows, selectedScale, effectiveK]
  );

  const hasUnexcludedOutliers = useMemo(
    () => rows.some((r) => r.included && outlierSummary.outlierPickIds.has(r.pickId)),
    [rows, outlierSummary.outlierPickIds]
  );

  const hasAnyExcluded = useMemo(() => rows.some((r) => !r.included), [rows]);

  if (!open) return null;

  const handleScaleChange = (nextScale: MagnitudeScale) => {
    setSelectedScale(nextScale);
    if (autoRejectOutliers) {
      const nextSummary = computeDurationOutlierSummary(rows, nextScale, effectiveK);
      setRows((prev) =>
        prev.map((row) => ({
          ...row,
          included: !nextSummary.outlierPickIds.has(row.pickId),
        }))
      );
    }
  };

  const handleKChange = (nextK: number) => {
    setLocalK(nextK);
    onChangeVarianceK?.(nextK);
    if (autoRejectOutliers) {
      const nextSummary = computeDurationOutlierSummary(rows, selectedScale, nextK);
      setRows((prev) =>
        prev.map((row) => ({
          ...row,
          included: !nextSummary.outlierPickIds.has(row.pickId),
        }))
      );
    }
  };

  const handleToggleAutoReject = (enabled: boolean) => {
    setAutoRejectOutliers(enabled);
    if (enabled) {
      setRows((prev) =>
        prev.map((row) => ({
          ...row,
          included: !outlierSummary.outlierPickIds.has(row.pickId),
        }))
      );
    }
  };

  const handleToggleRow = (pickId: string) => {
    const targetRow = rows.find((r) => r.pickId === pickId);
    const willIncludeOutlier =
      targetRow && !targetRow.included && outlierSummary.outlierPickIds.has(pickId);
    if (willIncludeOutlier) {
      setAutoRejectOutliers(false);
    }
    setRows((prev) =>
      prev.map((row) =>
        row.pickId === pickId ? { ...row, included: !row.included } : row
      )
    );
  };

  const handleExcludeOutliers = () => {
    setAutoRejectOutliers(true);
    setRows((prev) =>
      prev.map((row) => ({
        ...row,
        included: !outlierSummary.outlierPickIds.has(row.pickId),
      }))
    );
  };

  const handleIncludeAll = () => {
    setAutoRejectOutliers(false);
    setRows((prev) => prev.map((row) => ({ ...row, included: true })));
  };

  const handleRecompute = () => {
    if (autoRejectOutliers) {
      const rebuilt = buildDurationRowsWithOutlierFilter(
        event,
        selectedScale,
        effectiveK,
        { autoRejectOutliers: true, respectManualOverrides: false }
      );
      setRows(rebuilt.rows);
      return;
    }

    setRows((prev) => {
      const checkedMap = new Map(prev.map((r) => [r.pickId, r.included]));
      const candidates = event.picks.filter(isDurationMagnitudeEligible);
      return candidates.map((pick, idx) => {
        const td = Math.round(pick.duration ?? 0);
        const computed = computeDurationMagnitudes(td, pick.delta, event.depthKm);
        return {
          pickId: pick.id,
          index: idx,
          sta: pick.sta,
          td,
          hd: computed.hd,
          ml: computed.ml,
          mb: computed.mb,
          ms: computed.ms,
          included: checkedMap.get(pick.id) ?? (pick.magExcluded !== true),
        };
      });
    });
  };

  const handleConfirmOk = () => {
    const rowMap = new Map(rows.map((r) => [r.pickId, r]));
    const updatedPicks = event.picks.map((pick) => {
      const row = rowMap.get(pick.id);
      if (!row) {
        return {
          ...pick,
          md: null,
          mb: null,
          ms: null,
          magExcluded: undefined,
        };
      }
      return {
        ...pick,
        md: Number(row.ml.toFixed(1)),
        mb: Number(row.mb.toFixed(1)),
        ms: Number(row.ms.toFixed(1)),
        magExcluded: !row.included,
      };
    });
    onApply({
      preferredScale: selectedScale,
      ms: averages.ms,
      mb: averages.mb,
      md: averages.ml,
      updatedPicks,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/45 flex items-center justify-center p-3"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mag-duration-popup-title"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-[620px] bg-[#f0f0f0] border border-slate-600 shadow-2xl text-slate-900 select-none overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Classic EQP Desktop Title Bar */}
        <div className="bg-white border-b border-slate-300 px-2.5 py-1.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-4 h-4 rounded-xs bg-red-600 text-white flex items-center justify-center shrink-0">
              <Globe className="w-3 h-3" />
            </span>
            <h2
              id="mag-duration-popup-title"
              className="text-[11px] font-semibold tracking-tight text-slate-900 truncate"
            >
              COMPUTED MAGNITUDE USING TIME DURATION :
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close Computed Magnitude Dialog"
            className="p-0.5 text-slate-600 hover:text-slate-950 hover:bg-slate-200 rounded-xs transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Top Action Buttons: OK / Recompute / Cancel */}
        <div className="px-3 py-2 border-b border-slate-300 bg-[#f0f0f0] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleConfirmOk}
              className="min-w-[82px] px-4 py-1 bg-[#e1e1e1] hover:bg-[#e5f1fb] border-2 border-[#0078d7] text-xs font-medium text-slate-900 shadow-2xs transition-colors"
            >
              OK
            </button>
            <button
              type="button"
              onClick={handleRecompute}
              className="min-w-[82px] px-3 py-1 bg-[#e1e1e1] hover:bg-[#e5f1fb] border border-slate-400 text-xs font-medium text-slate-900 shadow-2xs transition-colors"
            >
              Recompute
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="min-w-[82px] px-4 py-1 bg-[#e1e1e1] hover:bg-[#e5f1fb] border border-slate-400 text-xs font-medium text-slate-900 shadow-2xs transition-colors"
            >
              Cancel
            </button>
          </div>
          <span className="font-mono text-[11px] tabular-nums text-slate-600">
            {averages.count}/{rows.length} stations checked
          </span>
        </div>

        {/* Body */}
        <div className="p-2.5 space-y-2.5 bg-[#f0f0f0]">
          {/* Summary Row: Average Radio Box + Outlier Filtering Info */}
          <div className="grid grid-cols-1 sm:grid-cols-[175px_1fr] gap-2.5 items-stretch">
            <fieldset className="border border-slate-300 px-3 pt-1 pb-2">
              <legend className="px-1 font-mono text-xs text-slate-900">Average :</legend>
              <div className="flex flex-col gap-1 font-mono text-xs tabular-nums">
                <label className="inline-flex items-center gap-2 cursor-pointer w-fit">
                  <input
                    type="radio"
                    name="durationMagScale"
                    checked={selectedScale === 'Ms'}
                    onChange={() => handleScaleChange('Ms')}
                    className="accent-blue-600"
                  />
                  <span>Ms {averages.ms.toFixed(1)}</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer w-fit">
                  <input
                    type="radio"
                    name="durationMagScale"
                    checked={selectedScale === 'Mb'}
                    onChange={() => handleScaleChange('Mb')}
                    className="accent-blue-600"
                  />
                  <span>Mb {averages.mb.toFixed(1)}</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer w-fit">
                  <input
                    type="radio"
                    name="durationMagScale"
                    checked={selectedScale === 'Md'}
                    onChange={() => handleScaleChange('Md')}
                    className="accent-blue-600"
                  />
                  <span>ML {averages.ml.toFixed(1)}</span>
                </label>
              </div>
            </fieldset>

            {/* Outlier Filtering (RemoveOutLiers) Info Panel */}
            <fieldset
              className="border border-slate-300 px-3 pt-1 pb-2 bg-white/55"
              aria-label="Outlier Filtering Info"
            >
              <legend className="px-1 font-mono text-xs text-slate-900">
                Outlier Filtering ({outlierSummary.scaleLabel}) :
              </legend>
              <div className="space-y-1.5 text-[11px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="inline-flex items-center gap-1.5 font-sans font-medium text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoRejectOutliers}
                      onChange={(e) => handleToggleAutoReject(e.target.checked)}
                      aria-label="Auto-reject outliers by default"
                      className="w-3.5 h-3.5 accent-blue-600 cursor-pointer"
                    />
                    <span>Auto-reject outliers</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="popup-variance-k"
                      className="font-sans font-medium text-slate-700"
                    >
                      Threshold (K):{' '}
                      <span className="font-mono font-semibold tabular-nums text-slate-900">
                        {outlierSummary.varianceK.toFixed(2)}σ
                      </span>
                    </label>
                    <input
                      id="popup-variance-k"
                      type="range"
                      min={0.8}
                      max={2.5}
                      step={0.1}
                      value={outlierSummary.varianceK}
                      onChange={(e) => handleKChange(Number(e.target.value))}
                      aria-label="Outlier filtering sigma threshold K"
                      className="w-24 accent-blue-600 cursor-pointer"
                    />
                  </div>
                </div>

                {rows.length === 0 ? (
                  <div className="text-slate-500 font-sans">
                    No eligible stations to evaluate variance corridor.
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono tabular-nums text-[11px]">
                      <div className="text-slate-600">
                        Raw Mean:{' '}
                        <span className="text-slate-900 font-semibold">
                          {outlierSummary.meanAll.toFixed(2)}
                        </span>
                      </div>
                      <div className="text-slate-600">
                        Std Dev (σ):{' '}
                        <span className="text-slate-900 font-semibold">
                          {outlierSummary.stdDev.toFixed(2)}
                        </span>
                      </div>
                      <div className="text-slate-600">
                        Corridor:{' '}
                        <span className="text-slate-900">
                          {outlierSummary.lowerBound.toFixed(2)}–{outlierSummary.upperBound.toFixed(2)}
                        </span>
                      </div>
                      <div className="text-slate-600">
                        Filtered {outlierSummary.scaleLabel}:{' '}
                        <span className="text-slate-950 font-bold">
                          {outlierSummary.filteredMean.toFixed(1)}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200/80">
                      <span
                        className={`font-sans text-[11px] font-medium ${
                          outlierSummary.outlierCount > 0
                            ? 'text-amber-800'
                            : 'text-emerald-800'
                        }`}
                      >
                        {outlierSummary.outlierCount > 0
                          ? `${outlierSummary.outlierCount} outlier${
                              outlierSummary.outlierCount === 1 ? '' : 's'
                            } (> ${outlierSummary.varianceK.toFixed(2)}σ) · ${outlierSummary.keptCount}/${outlierSummary.eligibleCount} kept`
                          : `0 outliers (> ${outlierSummary.varianceK.toFixed(2)}σ) · ${outlierSummary.keptCount}/${outlierSummary.eligibleCount} kept`}
                      </span>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handleExcludeOutliers}
                          disabled={!hasUnexcludedOutliers}
                          className="px-2 py-0.5 bg-[#e1e1e1] hover:bg-[#e5f1fb] disabled:opacity-45 disabled:hover:bg-[#e1e1e1] border border-slate-400 text-[11px] font-medium text-slate-900 transition-colors"
                        >
                          Reject Outliers ({outlierSummary.outlierCount})
                        </button>
                        <button
                          type="button"
                          onClick={handleIncludeAll}
                          disabled={!hasAnyExcluded}
                          className="px-2 py-0.5 bg-[#e1e1e1] hover:bg-[#e5f1fb] disabled:opacity-45 disabled:hover:bg-[#e1e1e1] border border-slate-400 text-[11px] font-medium text-slate-900 transition-colors"
                        >
                          Include All
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </fieldset>
          </div>

          {/* Station Duration Magnitude Table */}
          <div className="bg-white border border-slate-400 px-2 py-1.5 font-mono text-xs tabular-nums max-h-[270px] overflow-y-auto">
            <div className="grid grid-cols-[20px_22px_44px_46px_54px_56px_56px_56px_1fr] text-blue-800 pb-0.5 select-none">
              <span />
              <span />
              <span>STA</span>
              <span className="text-right pr-2">TD</span>
              <span className="text-right pr-2">HD</span>
              <span className="text-right pr-2">ML</span>
              <span className="text-right pr-2">MB</span>
              <span className="text-right pr-2">MS</span>
              <span className="text-right pr-1">FILTER</span>
            </div>

            {rows.length === 0 ? (
              <div className="py-6 text-center font-sans text-xs text-slate-500">
                No stations with checked Primary (P) arrival and Time Duration (Dur) &gt; 0.
              </div>
            ) : (
              <div className="space-y-0.5">
                {rows.map((row) => {
                  const isOutlier = outlierSummary.outlierPickIds.has(row.pickId);
                  const zScore = outlierSummary.zScoreByPickId.get(row.pickId) ?? 0;
                  return (
                    <div
                      key={row.pickId}
                      onClick={() => handleToggleRow(row.pickId)}
                      className={`grid grid-cols-[20px_22px_44px_46px_54px_56px_56px_56px_1fr] items-center cursor-pointer py-0.5 rounded-2xs ${
                        isOutlier
                          ? row.included
                            ? 'bg-amber-50/90 text-amber-950 hover:bg-amber-100/80'
                            : 'bg-amber-50/50 text-slate-500 hover:bg-amber-50'
                          : row.included
                            ? 'text-slate-950 hover:bg-blue-50'
                            : 'text-slate-500 hover:bg-slate-100'
                      }`}
                    >
                      <span
                        className="flex items-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={row.included}
                          onChange={() => handleToggleRow(row.pickId)}
                          aria-label={`Include ${row.sta} in magnitude average`}
                          className="w-3.5 h-3.5 accent-blue-600 cursor-pointer"
                        />
                      </span>
                      <span>{row.index}</span>
                      <span>{row.sta}</span>
                      <span className="text-right pr-2">{row.td}</span>
                      <span className="text-right pr-2">{row.hd.toFixed(2)}</span>
                      <span className="text-right pr-2">{row.ml.toFixed(2)}</span>
                      <span className="text-right pr-2">{row.mb.toFixed(2)}</span>
                      <span className="text-right pr-2">{row.ms.toFixed(2)}</span>
                      <span className="text-right pr-1 text-[10.5px] font-sans">
                        {isOutlier ? (
                          <span className="font-semibold text-amber-800">
                            {row.included
                              ? `Outlier (${zScore.toFixed(2)}σ)`
                              : `Rejected (${zScore.toFixed(2)}σ)`}
                          </span>
                        ) : !row.included ? (
                          <span className="text-slate-500">
                            Excluded ({zScore.toFixed(2)}σ)
                          </span>
                        ) : (
                          <span className="text-emerald-700">
                            OK ({zScore.toFixed(2)}σ)
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
