import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Info,
  MinusCircle,
  RotateCcw,
  Settings,
  SlidersHorizontal,
} from 'lucide-react';
import type { EQPEvent } from '../data/eqpData';
import {
  IMPLEMENTED_MAGNITUDE_IDS,
  MAGNITUDE_ALGORITHMS,
  type AlgorithmMagnitudeEvaluation,
  type EventMagnitudeMetadata,
  type EventMethodSelectionMode,
  type MagnitudeAlgorithmId,
  type MagnitudeFreshnessInspection,
  type MagnitudeSettings,
  canSelectMethodAsPreferred,
  formatAggregationLabel,
  formatCalibrationStatusLabel,
  hasValidUncalibratedApproval,
  resolveEventMethodSelection,
} from '../utils/magnitudeEngine';

interface MagnitudeResultsPanelProps {
  event: EQPEvent;
  settings: MagnitudeSettings;
  metadata: EventMagnitudeMetadata;
  freshness: MagnitudeFreshnessInspection;
  onRecalculateMagnitude: () => void;
  onSelectEventPreferredMethod: (methodId: MagnitudeAlgorithmId) => void;
  onUpdateEventMethodSelection: (
    mode: EventMethodSelectionMode,
    selectedMethods: MagnitudeAlgorithmId[]
  ) => void;
  onResetEventToGlobalDefault: () => void;
  onToggleUncalibratedApproval?: (approved: boolean) => void;
  onOpenLegacyDurationPopup: () => void;
  onOpenMagnitudeSettings: () => void;
}

const SELECTABLE_RESULT_IDS: ReadonlyArray<MagnitudeAlgorithmId> = [
  'eqp-legacy-ms',
  'md-duration',
  'ml-local',
  'mlv-vertical',
  'mb-body',
  'ms-20',
];

export const MagnitudeResultsPanel: React.FC<MagnitudeResultsPanelProps> = ({
  event,
  settings,
  metadata,
  freshness,
  onRecalculateMagnitude,
  onSelectEventPreferredMethod,
  onUpdateEventMethodSelection,
  onResetEventToGlobalDefault,
  onToggleUncalibratedApproval,
  onOpenLegacyDurationPopup,
  onOpenMagnitudeSettings,
}) => {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsMethodId, setDetailsMethodId] = useState<MagnitudeAlgorithmId>(
    metadata.preferredMethodId
  );

  useEffect(() => {
    setDetailsMethodId(metadata.preferredMethodId);
  }, [event.id, metadata.preferredMethodId]);

  const algorithmById = new Map(MAGNITUDE_ALGORITHMS.map((a) => [a.id, a]));
  const selection = resolveEventMethodSelection(metadata, settings);
  const selectedMethodSet = new Set<MagnitudeAlgorithmId>(selection.selectedMethods);
  const isPreferredInSelection = selectedMethodSet.has(metadata.preferredMethodId);
  const hasAnySelectedMethod = selection.hasAnySelectedMethod;

  const activeResult: AlgorithmMagnitudeEvaluation | undefined =
    metadata.resultsByAlgorithm[metadata.preferredMethodId];
  const inspectedResult: AlgorithmMagnitudeEvaluation | undefined =
    metadata.resultsByAlgorithm[detailsMethodId];
  const inspectedDetails = inspectedResult?.stationDetails ?? [];
  const inspectedDesc = algorithmById.get(detailsMethodId);
  const inspectedIsLegacy = detailsMethodId === 'eqp-legacy-ms';
  const inspectedIsMlv = detailsMethodId === 'mlv-vertical';
  const inspectedIsMl = detailsMethodId === 'ml-local';

  const activeDesc = algorithmById.get(metadata.preferredMethodId);
  const isLegacyPreferred = metadata.preferredMethodId === 'eqp-legacy-ms';
  const hasValidMag =
    isPreferredInSelection &&
    hasAnySelectedMethod &&
    metadata.selectedStatus === 'valid' &&
    metadata.selectedMagnitude !== null;
  const isStale = freshness.isStale;
  const pendingSecondaryCount =
    freshness.pendingEvaluationAlgorithmIds.filter(
      (id) => id !== metadata.preferredMethodId
    ).length;
  const isUncalibratedMethod =
    metadata.calibrationStatus === 'experimental_uncalibrated' ||
    metadata.calibrationStatus === 'pending_calibration';
  const uncalibratedApproved = hasValidUncalibratedApproval(metadata);

  const calBadgeStyle = !hasAnySelectedMethod || !isPreferredInSelection
    ? 'bg-slate-700/70 border-slate-400/60 text-slate-200'
    : metadata.calibrationStatus === 'legacy_compatibility'
      ? 'bg-sky-500/20 border-sky-300/70 text-sky-100'
      : metadata.calibrationStatus === 'calibrated'
        ? 'bg-emerald-500/20 border-emerald-300/70 text-emerald-100'
        : metadata.calibrationStatus === 'experimental_uncalibrated'
          ? 'bg-amber-500/25 border-amber-300 text-amber-100'
          : 'bg-slate-700/60 border-slate-400/60 text-slate-200';

  const freshnessBadgeStyle = isStale
    ? 'bg-amber-500/30 border-amber-300 text-amber-100'
    : freshness.isHistoricalSaved
      ? 'bg-indigo-500/25 border-indigo-300/70 text-indigo-100'
      : 'bg-emerald-500/25 border-emerald-300/70 text-emerald-100';

  const handleToggleEventMethod = (id: MagnitudeAlgorithmId) => {
    const currentlySelected = selectedMethodSet.has(id);
    const nextMethods = currentlySelected
      ? selection.selectedMethods.filter((m) => m !== id)
      : IMPLEMENTED_MAGNITUDE_IDS.filter(
          (m) => m === id || selectedMethodSet.has(m)
        );
    onUpdateEventMethodSelection('custom', nextMethods);
  };

  const handleSwitchMode = (mode: EventMethodSelectionMode) => {
    if (mode === 'inherit_global') {
      const globalMethods = IMPLEMENTED_MAGNITUDE_IDS.filter((id) =>
        settings.enabledMethods.includes(id)
      );
      onUpdateEventMethodSelection(
        'inherit_global',
        globalMethods.length > 0 ? globalMethods : [settings.defaultMethod]
      );
      return;
    }
    onUpdateEventMethodSelection('custom', selection.selectedMethods);
  };

  const getComparisonRowState = (id: MagnitudeAlgorithmId) => {
    const desc = algorithmById.get(id)!;
    const res = metadata.resultsByAlgorithm?.[id];
    const isEnabled = selectedMethodSet.has(id);
    const isPreferred = id === metadata.preferredMethodId;
    const isAlgStale = freshness.staleAlgorithmIds.includes(id);
    const isPendingCalc =
      isEnabled &&
      (freshness.pendingEvaluationAlgorithmIds.includes(id) ||
        !res ||
        res.selectedForCalculation === false);
    const eligibility = canSelectMethodAsPreferred(id, metadata, freshness, settings);

    let statusLabel = 'Unavailable';
    let statusClass = 'bg-slate-800/70 text-slate-200 border-slate-400/50';
    let StatusIcon = MinusCircle;

    if (!isEnabled) {
      statusLabel = res?.networkMagnitude != null ? 'Deselected (Prior Kept)' : 'Not Selected';
      statusClass = 'bg-slate-800/70 text-slate-300 border-slate-500/50';
      StatusIcon = MinusCircle;
    } else if (isPendingCalc) {
      statusLabel = 'Pending Calculation';
      statusClass = 'bg-amber-500/25 text-amber-100 border-amber-300/70';
      StatusIcon = Clock;
    } else if (isAlgStale) {
      statusLabel = 'Recalculation Required';
      statusClass = 'bg-amber-500/30 text-amber-100 border-amber-300';
      StatusIcon = AlertTriangle;
    } else if (res?.status === 'valid' && res.networkMagnitude !== null) {
      const isExp =
        res.calibrationStatus === 'experimental_uncalibrated' ||
        res.calibrationStatus === 'pending_calibration';
      if (isExp) {
        statusLabel =
          isPreferred && uncalibratedApproved
            ? 'Experimental (Confirmed)'
            : 'Experimental (Unconfirmed)';
        statusClass = 'bg-amber-500/25 text-amber-100 border-amber-300/80';
        StatusIcon = AlertTriangle;
      } else {
        statusLabel = freshness.isHistoricalSaved ? 'Historical Saved' : 'Current';
        statusClass = 'bg-emerald-500/25 text-emerald-100 border-emerald-300/70';
        StatusIcon = CheckCircle2;
      }
    } else if (res?.status === 'missing_calibration') {
      statusLabel = 'Missing Calibration';
      statusClass = 'bg-amber-950/70 text-amber-200 border-amber-400/50';
      StatusIcon = AlertTriangle;
    } else if (res?.status === 'missing_measurement') {
      statusLabel = 'Missing Measurements';
      statusClass = 'bg-slate-800/80 text-slate-200 border-slate-400/60';
      StatusIcon = MinusCircle;
    } else if (res?.status === 'invalid_measurement') {
      statusLabel = 'Invalid Measurements';
      statusClass = 'bg-rose-900/70 text-rose-100 border-rose-400/60';
      StatusIcon = AlertTriangle;
    } else if (res?.status === 'calculation_failure') {
      statusLabel = 'Calculation Failure';
      statusClass = 'bg-rose-900/80 text-rose-100 border-rose-300/70';
      StatusIcon = AlertTriangle;
    }

    const tooltip = !isEnabled
      ? res?.notSelectedReason ?? `${desc.shortName} is unchecked for this event.`
      : isPendingCalc
        ? `Click Recalculate Magnitude to evaluate ${desc.shortName}.`
        : isAlgStale
          ? `Inputs or settings changed for ${desc.shortName}; click Recalculate Magnitude.`
          : res?.statusReason ?? res?.provenanceSummary ?? desc.description;

    return {
      desc,
      res,
      isEnabled,
      isPreferred,
      isAlgStale,
      isPendingCalc,
      eligibility,
      statusLabel,
      statusClass,
      StatusIcon,
      tooltip,
    };
  };

  return (
    <section
      aria-label="Magnitude Results"
      className="bg-[#005a94]/90 border border-white/25 rounded-xs text-white text-xs overflow-hidden"
    >
      {/* Compact Header & Primary Preferred Magnitude Readout */}
      <div className="px-3 py-2.5 flex flex-wrap items-center justify-between gap-3 border-b border-white/15">
        <div className="flex flex-wrap items-center gap-2.5 min-w-0">
          <div className="flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-sky-200 shrink-0" />
            <span className="font-semibold tracking-tight text-white">
              Magnitude Results
            </span>
          </div>

          <div
            className={`flex items-center gap-2 rounded-xs px-2.5 py-1 border ${
              isStale || !hasAnySelectedMethod || !isPreferredInSelection
                ? 'bg-amber-950/75 border-amber-300/80'
                : 'bg-[#003b73] border-sky-300/35'
            }`}
          >
            <span className="font-mono font-bold text-sm tabular-nums text-white">
              {!hasAnySelectedMethod
                ? 'No Method Selected'
                : !isPreferredInSelection
                  ? `${metadata.selectedScale} — Deselected`
                  : isStale
                    ? `${metadata.selectedScale} — Recalculation Required`
                    : hasValidMag
                      ? `${metadata.selectedScale} ${metadata.selectedMagnitude!.toFixed(1)}`
                      : `${metadata.selectedScale} — Unavailable`}
            </span>
            <span className="text-[11px] text-sky-200 border-l border-white/20 pl-2">
              {hasAnySelectedMethod
                ? activeDesc?.scientificLabel ?? metadata.preferredMethodId
                : 'Bulletin Pending'}
            </span>
          </div>

          <span
            className={`px-2 py-0.5 rounded-xs border text-[10px] font-semibold ${freshnessBadgeStyle}`}
            title={freshness.reasons[0] ?? freshness.badgeLabel}
          >
            {freshness.badgeLabel}
          </span>

          <span
            className={`px-2 py-0.5 rounded-xs border text-[10px] font-semibold ${calBadgeStyle}`}
          >
            {!hasAnySelectedMethod
              ? 'None Selected'
              : !isPreferredInSelection
                ? 'Method Deselected'
                : formatCalibrationStatusLabel(metadata.calibrationStatus)}
          </span>

          <span className="font-mono text-[11px] text-sky-100 tabular-nums">
            Stations: <strong>{hasValidMag ? metadata.contributingStations : 0}</strong>
            {activeResult && isPreferredInSelection && activeResult.excludedStations > 0
              ? ` · Excl ${activeResult.excludedStations}`
              : ''}
            {activeResult && isPreferredInSelection && activeResult.invalidStations > 0
              ? ` · Invalid ${activeResult.invalidStations}`
              : ''}
          </span>
        </div>

        {/* Single Preferred Magnitude Selector & Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onRecalculateMagnitude}
            title="Recalculate selected earthquake magnitude methods using current picks, amplitudes, and settings without re-running the hypocenter solver"
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xs border text-[10.5px] font-semibold whitespace-nowrap cursor-pointer transition-colors ${
              isStale || pendingSecondaryCount > 0
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-200 shadow-xs'
                : 'bg-white/15 hover:bg-white/25 text-white border-white/25'
            }`}
          >
            <RotateCcw className="w-3 h-3" />
            {isStale || pendingSecondaryCount > 0 ? 'Recalculate Magnitude' : 'Recalculate'}
          </button>

          <label
            htmlFor="event-preferred-magnitude-select"
            className="text-[11px] text-sky-100 font-medium whitespace-nowrap"
          >
            Preferred:
          </label>
          <select
            id="event-preferred-magnitude-select"
            value={metadata.preferredMethodId}
            onChange={(e) =>
              onSelectEventPreferredMethod(e.target.value as MagnitudeAlgorithmId)
            }
            className="bg-white text-slate-900 border border-slate-400 rounded-xs px-2 py-1 text-[11px] font-semibold focus:outline-none"
          >
            {SELECTABLE_RESULT_IDS.map((id) => {
              const desc = algorithmById.get(id)!;
              const eligibility = canSelectMethodAsPreferred(
                id,
                metadata,
                freshness,
                settings
              );
              const isCurrent = id === metadata.preferredMethodId;
              const res = metadata.resultsByAlgorithm?.[id];
              const suffix = !desc.implemented
                ? ' (Not Yet Implemented)'
                : res &&
                    res.selectedForCalculation !== false &&
                    res.status === 'valid' &&
                    res.networkMagnitude !== null &&
                    !freshness.staleAlgorithmIds.includes(id)
                  ? ` (${res.scale} ${res.networkMagnitude.toFixed(1)})`
                  : !selectedMethodSet.has(id)
                    ? ' (Not Selected)'
                    : freshness.pendingEvaluationAlgorithmIds.includes(id)
                      ? ' (Not Calculated)'
                      : ' (Unavailable)';
              return (
                <option
                  key={id}
                  value={id}
                  disabled={!desc.implemented || (!eligibility.eligible && !isCurrent)}
                  title={eligibility.reason ?? desc.scientificLabel}
                >
                  {desc.shortName}
                  {suffix}
                </option>
              );
            })}
          </select>

          {(metadata.isPerEventOverride || selection.mode === 'custom') && (
            <button
              type="button"
              onClick={onResetEventToGlobalDefault}
              title={`Reset event method selection & preferred scale to global default (${algorithmById.get(settings.defaultMethod)?.shortName ?? settings.defaultMethod})`}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-xs bg-white/15 hover:bg-white/25 text-sky-100 text-[10.5px] font-medium border border-white/20 whitespace-nowrap cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              Use Global Default
            </button>
          )}

          {isLegacyPreferred && (
            <button
              type="button"
              onClick={onOpenLegacyDurationPopup}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-xs bg-white/15 hover:bg-white/25 text-white text-[10.5px] font-medium border border-white/25 whitespace-nowrap cursor-pointer"
            >
              <SlidersHorizontal className="w-3 h-3" />
              Duration Filter...
            </button>
          )}

          <button
            type="button"
            onClick={onOpenMagnitudeSettings}
            title="Configure global default magnitude method, enabled algorithms, and calibration profiles in Settings"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-xs bg-white/10 hover:bg-white/20 text-sky-100 text-[10.5px] font-medium border border-white/20 whitespace-nowrap cursor-pointer"
          >
            <Settings className="w-3 h-3" />
            Settings
          </button>
        </div>
      </div>

      {/* Magnitude Methods Selection Bar (Global Inheritance vs Per-Event Custom Selection) */}
      <div className="px-3 py-2 bg-[#004575]/80 border-b border-white/15 flex flex-wrap items-center justify-between gap-2.5 text-[11px]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-sky-200 whitespace-nowrap">
            Magnitude Methods:
          </span>
          <div
            role="group"
            aria-label="Event Magnitude Method Selection Mode"
            className="inline-flex rounded-xs border border-white/25 overflow-hidden"
          >
            <button
              type="button"
              onClick={() => handleSwitchMode('inherit_global')}
              className={`px-2 py-0.5 text-[10.5px] font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                selection.mode === 'inherit_global'
                  ? 'bg-white text-slate-950'
                  : 'bg-[#00315a]/80 text-sky-100 hover:bg-white/10'
              }`}
            >
              Use Global Settings
            </button>
            <button
              type="button"
              onClick={() => handleSwitchMode('custom')}
              className={`px-2 py-0.5 text-[10.5px] font-semibold whitespace-nowrap cursor-pointer border-l border-white/25 transition-colors ${
                selection.mode === 'custom'
                  ? 'bg-amber-400 text-slate-950'
                  : 'bg-[#00315a]/80 text-sky-100 hover:bg-white/10'
              }`}
            >
              Customize for This Event
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {IMPLEMENTED_MAGNITUDE_IDS.map((id) => {
            const desc = algorithmById.get(id)!;
            const checked = selectedMethodSet.has(id);
            return (
              <label
                key={id}
                className="inline-flex items-center gap-1.5 cursor-pointer select-none font-medium text-white"
                title={
                  selection.mode === 'inherit_global'
                    ? `Currently inheriting Global Settings; checking or unchecking switches this event to Customize mode`
                    : desc.scientificLabel
                }
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => handleToggleEventMethod(id)}
                  className="accent-amber-400 cursor-pointer"
                />
                <span>{desc.shortName}</span>
              </label>
            );
          })}
          <span
            className="text-[10px] text-sky-200/75 border-l border-white/15 pl-2.5"
            title="mb, Ms_20, Ms(BB), mB, and Mwp are reserved for future batches and remain disabled"
          >
            mb, Ms_20: Not Yet Implemented
          </span>
        </div>
      </div>

      {/* Zero Selected Methods Banner */}
      {!hasAnySelectedMethod && (
        <div
          role="status"
          className="px-3 py-2 bg-amber-950/75 border-b border-amber-300/50 flex flex-wrap items-center justify-between gap-2 text-[11px] text-amber-100"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-300 shrink-0 mt-0.5" />
            <span>
              <strong>No magnitude methods selected for this event.</strong> Enable at
              least one implemented method above and click Recalculate Magnitude, or
              switch back to Use Global Settings. Bulletin magnitude remains Pending.
            </span>
          </div>
        </div>
      )}

      {/* Pending Newly Checked Secondary Method Prompt */}
      {hasAnySelectedMethod && !isStale && pendingSecondaryCount > 0 && (
        <div
          role="status"
          className="px-3 py-1.5 bg-sky-950/70 border-b border-sky-300/35 flex flex-wrap items-center justify-between gap-2 text-[11px] text-sky-100"
        >
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-amber-300 shrink-0" />
            <span>
              {pendingSecondaryCount} enabled method
              {pendingSecondaryCount === 1 ? ' has' : 's have'} not been evaluated yet
              for the current selection.
            </span>
          </div>
          <button
            type="button"
            onClick={onRecalculateMagnitude}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xs bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-[10.5px] whitespace-nowrap cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            Recalculate Now
          </button>
        </div>
      )}

      {/* Stale / Historical Modified Warning Banner */}
      {hasAnySelectedMethod && isStale && (
        <div
          role="status"
          className="px-3 py-2 bg-amber-950/70 border-b border-amber-300/50 flex flex-wrap items-center justify-between gap-2 text-[11px] text-amber-100"
        >
          <div className="flex items-start gap-2 min-w-0">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-300 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Recalculation Required:</span>{' '}
              {freshness.reasons[0] ??
                'Inputs or magnitude settings changed since last calculation.'}
              {hasValidMag && (
                <span className="ml-1.5 font-mono text-amber-200/90 tabular-nums">
                  (Prior computed: {metadata.selectedScale}{' '}
                  {metadata.selectedMagnitude!.toFixed(1)} — Stale)
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onRecalculateMagnitude}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xs bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-[10.5px] whitespace-nowrap cursor-pointer shrink-0"
          >
            <RotateCcw className="w-3 h-3" />
            Recalculate Magnitude Now
          </button>
        </div>
      )}

      {/* Provenance Summary Strip */}
      <div className="px-3 py-1.5 bg-[#004c7d]/70 flex flex-wrap items-center justify-between gap-2 text-[11px] border-b border-white/10">
        <div
          className="text-sky-100 font-mono truncate max-w-full"
          title={metadata.provenanceSummary}
        >
          <span className="text-sky-300 font-sans font-semibold mr-1.5">
            Provenance:
          </span>
          {metadata.provenanceSummary} · Aggregation:{' '}
          <span className="text-white font-semibold">
            {formatAggregationLabel(metadata.aggregationMethod)}
          </span>
          {activeResult?.aggregationNote && isPreferredInSelection && (
            <span className="ml-1.5 text-amber-200 font-sans">
              ({activeResult.aggregationNote})
            </span>
          )}
          {selection.mode === 'custom' && (
            <span className="ml-2 font-sans px-1.5 py-0.2 rounded-xs bg-amber-400/25 text-amber-100 border border-amber-300/50 text-[10px] font-semibold">
              Custom Selection
            </span>
          )}
          {metadata.isPerEventOverride && selection.mode === 'inherit_global' && (
            <span className="ml-2 font-sans px-1.5 py-0.2 rounded-xs bg-amber-400/25 text-amber-100 border border-amber-300/50 text-[10px] font-semibold">
              Event Override
            </span>
          )}
        </div>
      </div>

      {/* Unavailability / Status Warning */}
      {hasAnySelectedMethod &&
        !isStale &&
        !hasValidMag &&
        metadata.selectedStatusReason && (
          <div className="px-3 py-2 bg-amber-950/50 border-b border-amber-300/30 flex items-start gap-2 text-[11px] text-amber-100">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-300 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">
                {activeDesc?.shortName ?? metadata.selectedScale} unavailable:
              </span>{' '}
              {metadata.selectedStatusReason}
            </div>
          </div>
        )}

      {/* Calculation-bound approval banner for experimental / uncalibrated results */}
      {hasAnySelectedMethod && !isStale && hasValidMag && isUncalibratedMethod && (
        <div className="px-3 py-2 bg-amber-950/55 border-b border-amber-300/35 flex flex-wrap items-center justify-between gap-2 text-[11px] text-amber-100">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-300 shrink-0 mt-0.5" />
            <span>
              <strong>Experimental / Uncalibrated {metadata.selectedScale}:</strong>{' '}
              {uncalibratedApproved
                ? `Confirmed by analyst for this calculation (${metadata.selectedScale} ${metadata.selectedMagnitude!.toFixed(1)}).`
                : 'Non-authoritative until explicitly confirmed by analyst before bulletin publication.'}
            </span>
          </div>
          {onToggleUncalibratedApproval && (
            <label className="inline-flex items-center gap-1.5 font-semibold cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={uncalibratedApproved}
                onChange={(e) => onToggleUncalibratedApproval(e.target.checked)}
                className="accent-amber-400 cursor-pointer"
              />
              <span>Confirm for bulletin release</span>
            </label>
          )}
        </div>
      )}

      {/* Optional Alternative Suggestion (only if fresh & enabled & eligible) */}
      {!isStale &&
        metadata.suggestedAlternative &&
        canSelectMethodAsPreferred(
          metadata.suggestedAlternative.algorithmId,
          metadata,
          freshness,
          settings
        ).eligible && (
          <div className="px-3 py-2 bg-sky-950/75 border-b border-sky-300/35 flex flex-wrap items-center justify-between gap-2 text-[11px] text-sky-100">
            <div className="flex items-start gap-2">
              <Info className="w-3.5 h-3.5 text-sky-300 shrink-0 mt-0.5" />
              <span>
                <strong>Suggested Alternative:</strong>{' '}
                {metadata.suggestedAlternative.scale}{' '}
                {metadata.suggestedAlternative.magnitude.toFixed(1)} (
                {metadata.suggestedAlternative.displayName}) —{' '}
                {metadata.suggestedAlternative.reason}
              </span>
            </div>
            <button
              type="button"
              onClick={() =>
                onSelectEventPreferredMethod(
                  metadata.suggestedAlternative!.algorithmId
                )
              }
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[10.5px] whitespace-nowrap cursor-pointer shrink-0"
            >
              <CheckCircle2 className="w-3 h-3" />
              Select {metadata.suggestedAlternative.scale} as Preferred
            </button>
          </div>
        )}

      {/* Legacy Compatibility Summary Sub-Values */}
      {isLegacyPreferred && hasValidMag && !isStale && (
        <div className="px-3 py-1.5 bg-[#004776]/60 border-b border-white/10 flex flex-wrap items-center gap-4 text-[11px] font-mono text-sky-100 tabular-nums">
          <span>
            Legacy Scale Compatibility: <strong>Ms {event.ms.toFixed(1)}</strong> ·{' '}
            Mb {event.mb.toFixed(1)} · ML {event.md.toFixed(1)}
          </span>
          <span className="text-sky-200 font-sans">
            (Ms and Mb are empirical linear conversions from EQP duration-derived ML; not independent 20 s surface-wave amplitudes)
          </span>
        </div>
      )}

      {/* Multi-Method Magnitude Comparison Table */}
      <div className="border-b border-white/15 bg-[#003b73]/75 overflow-x-auto">
        <table className="w-full text-left border-collapse text-[11px] tabular-nums">
          <thead>
            <tr className="bg-[#002952] text-sky-200 border-b border-white/15 text-[10.5px]">
              <th className="py-1.5 px-3 font-semibold">Method</th>
              <th className="py-1.5 px-2.5 text-right font-semibold">Magnitude</th>
              <th className="py-1.5 px-2.5 text-right font-semibold">Stations</th>
              <th className="py-1.5 px-2.5 font-semibold">Calibration</th>
              <th className="py-1.5 px-2.5 font-semibold">Status</th>
              <th className="py-1.5 px-3 text-right font-semibold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {IMPLEMENTED_MAGNITUDE_IDS.map((id) => {
              const row = getComparisonRowState(id);
              const StatusIcon = row.StatusIcon;
              const calText = row.res
                ? formatCalibrationStatusLabel(row.res.calibrationStatus)
                : id === 'eqp-legacy-ms'
                  ? 'EQP Legacy Compatibility'
                  : id === 'md-duration'
                    ? formatCalibrationStatusLabel(
                        settings.mdConfig.calibrationStatus === 'calibrated'
                          ? 'calibrated'
                          : settings.mdConfig.allowExperimentalEvaluation
                            ? 'experimental_uncalibrated'
                            : 'pending_calibration'
                      )
                    : id === 'ml-local'
                      ? formatCalibrationStatusLabel(
                          settings.mlConfig.calibrationStatus === 'calibrated'
                            ? 'calibrated'
                            : settings.mlConfig.allowExperimentalEvaluation
                              ? 'experimental_uncalibrated'
                              : 'pending_calibration'
                        )
                      : formatCalibrationStatusLabel(
                          settings.mlvConfig.calibrationStatus === 'calibrated'
                            ? 'calibrated'
                            : settings.mlvConfig.allowExperimentalEvaluation
                              ? 'experimental_uncalibrated'
                              : 'pending_calibration'
                        );
              const totalStationPool =
                row.res && row.res.stationDetails.length > 0
                  ? row.res.stationDetails.length
                  : event.picks.length;

              return (
                <tr
                  key={id}
                  className={
                    row.isPreferred && row.isEnabled
                      ? 'bg-[#004f87]/90'
                      : 'hover:bg-white/5'
                  }
                >
                  <td className="py-1.5 px-3 font-medium text-white">
                    <div className="flex items-center gap-2">
                      <span>{row.desc.scientificLabel}</span>
                      {row.isPreferred && (
                        <span className="px-1.5 py-0.2 rounded-xs bg-white text-slate-950 text-[9.5px] font-bold uppercase tracking-wide whitespace-nowrap">
                          Preferred
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-1.5 px-2.5 text-right font-mono font-bold text-white whitespace-nowrap">
                    {!row.isEnabled ? (
                      <span className="text-sky-200/70 font-normal">
                        {row.res?.networkMagnitude != null
                          ? `— (prior ${row.res.scale} ${row.res.networkMagnitude.toFixed(1)})`
                          : '—'}
                      </span>
                    ) : row.isPendingCalc || row.isAlgStale ? (
                      <span className="text-amber-200 font-normal">—</span>
                    ) : row.res?.status === 'valid' &&
                      row.res.networkMagnitude !== null ? (
                      `${row.res.scale} ${row.res.networkMagnitude.toFixed(1)}`
                    ) : (
                      <span className="text-sky-200/70 font-normal">—</span>
                    )}
                  </td>
                  <td className="py-1.5 px-2.5 text-right font-mono text-sky-100 whitespace-nowrap">
                    {row.isEnabled && row.res && !row.isPendingCalc
                      ? `${row.res.contributingStations} / ${totalStationPool}`
                      : '—'}
                  </td>
                  <td className="py-1.5 px-2.5 text-sky-100 whitespace-nowrap">
                    {calText}
                  </td>
                  <td className="py-1.5 px-2.5" title={row.tooltip}>
                    <span
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-xs border text-[10px] font-semibold whitespace-nowrap ${row.statusClass}`}
                    >
                      <StatusIcon className="w-3 h-3 shrink-0" />
                      <span>{row.statusLabel}</span>
                    </span>
                  </td>
                  <td className="py-1.5 px-3 text-right whitespace-nowrap">
                    {row.isPreferred && row.eligibility.eligible ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xs bg-emerald-500/25 border border-emerald-300/60 text-emerald-100 text-[10.5px] font-semibold">
                        <CheckCircle2 className="w-3 h-3" />
                        Preferred
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={!row.eligibility.eligible}
                        onClick={() => onSelectEventPreferredMethod(id)}
                        title={
                          row.eligibility.reason ??
                          `Set ${row.desc.shortName} as the preferred magnitude for this event`
                        }
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-xs border text-[10.5px] font-semibold whitespace-nowrap transition-colors ${
                          row.eligibility.eligible
                            ? 'bg-white text-slate-950 border-white hover:bg-sky-100 cursor-pointer'
                            : 'bg-white/5 text-sky-200/50 border-white/15 cursor-not-allowed'
                        }`}
                      >
                        Select as Preferred
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            <tr className="bg-[#002952]/40 text-sky-200/80 text-[10.5px]">
              <td className="py-1 px-3" colSpan={4}>
                mb (Body-Wave), Ms_20 (20 s Surface-Wave)
              </td>
              <td className="py-1 px-2.5">
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-xs border border-slate-500/50 bg-slate-800/70 text-slate-300 text-[10px] font-semibold whitespace-nowrap">
                  <MinusCircle className="w-3 h-3 shrink-0" />
                  <span>Not Yet Implemented</span>
                </span>
              </td>
              <td className="py-1 px-3 text-right text-sky-200/60">Disabled</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Expandable Station Magnitude Details Table (With Per-Method Switcher) */}
      <div>
        <button
          type="button"
          onClick={() => setDetailsOpen((v) => !v)}
          aria-expanded={detailsOpen}
          className="w-full px-3 py-1.5 flex items-center justify-between text-[11px] font-semibold text-sky-100 hover:bg-white/10 transition-colors cursor-pointer"
        >
          <span className="inline-flex items-center gap-1.5">
            {detailsOpen ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
            Station Magnitude Details ({inspectedDesc?.shortName ?? detailsMethodId}:{' '}
            {inspectedDetails.length} stations ·{' '}
            {inspectedResult?.contributingStations ?? 0} included)
          </span>
          <span className="font-mono text-[10px] text-sky-200">
            Click to {detailsOpen ? 'collapse' : 'inspect'} per-station values &amp; eligibility
          </span>
        </button>

        {detailsOpen && (
          <div className="border-t border-white/15 bg-[#00315a]">
            {/* Per-Method Station Details Tabs */}
            <div className="px-3 py-1.5 bg-[#002647] border-b border-white/15 flex flex-wrap items-center gap-1.5">
              <span className="text-[10.5px] font-semibold text-sky-200 mr-1">
                Inspect Method:
              </span>
              {IMPLEMENTED_MAGNITUDE_IDS.map((id) => {
                const desc = algorithmById.get(id)!;
                const res = metadata.resultsByAlgorithm?.[id];
                const isSelectedTab = detailsMethodId === id;
                const isDeselected = !selectedMethodSet.has(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setDetailsMethodId(id)}
                    className={`px-2 py-0.5 rounded-xs border text-[10.5px] font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                      isSelectedTab
                        ? 'bg-white text-slate-950 border-white'
                        : 'bg-[#003b73] text-sky-100 border-white/20 hover:bg-white/15'
                    }`}
                  >
                    {desc.shortName}
                    {res && res.status === 'valid' && res.networkMagnitude !== null && !isDeselected
                      ? ` (${res.networkMagnitude.toFixed(1)})`
                      : isDeselected
                        ? ' (Off)'
                        : ''}
                  </button>
                );
              })}
            </div>

            <div className="overflow-x-auto">
              {!selectedMethodSet.has(detailsMethodId) && !inspectedResult ? (
                <div className="px-3 py-3 text-[11px] text-sky-200">
                  {inspectedDesc?.scientificLabel ?? detailsMethodId} is not selected for
                  this event.
                </div>
              ) : inspectedDetails.length === 0 ? (
                <div className="px-3 py-3 text-[11px] text-sky-200">
                  {inspectedResult?.statusReason ??
                    `No station magnitude records available for ${inspectedDesc?.scientificLabel ?? detailsMethodId}.`}
                </div>
              ) : (
                <table className="w-full text-left border-collapse font-mono text-[11px] tabular-nums">
                  <thead>
                    <tr className="bg-[#002647] text-sky-200 border-b border-white/15">
                      <th className="py-1.5 px-3 font-semibold">Station</th>
                      <th className="py-1.5 px-2 text-right font-semibold">
                        {inspectedIsMlv ? 'Amplitude' : 'Duration (s)'}
                      </th>
                      {inspectedIsMlv && (
                        <th className="py-1.5 px-2 text-right font-semibold">
                          WA (mm)
                        </th>
                      )}
                      <th className="py-1.5 px-2 font-sans font-semibold">
                        {inspectedIsMlv ? 'Channel / Source' : 'Source'}
                      </th>
                      <th className="py-1.5 px-2 text-right font-semibold">
                        Distance (km)
                      </th>
                      {inspectedIsMlv && (
                        <th className="py-1.5 px-2 text-right font-semibold">
                          logA0 / Cs
                        </th>
                      )}
                      <th className="py-1.5 px-2 text-right font-semibold">
                        Magnitude ({inspectedResult?.scale ?? inspectedDesc?.scale})
                      </th>
                      <th className="py-1.5 px-2 font-sans font-semibold">Status</th>
                      <th className="py-1.5 px-3 font-sans font-semibold">
                        Reason / Notes
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {inspectedDetails.map((row) => {
                      const statusBadge =
                        row.status === 'Included'
                          ? 'bg-emerald-500/25 text-emerald-100 border-emerald-400/50'
                          : row.status === 'Excluded'
                            ? 'bg-amber-500/25 text-amber-100 border-amber-400/50'
                            : 'bg-rose-500/25 text-rose-100 border-rose-400/50';
                      return (
                        <tr
                          key={`${row.algorithmId}-${row.pickId}`}
                          className="hover:bg-white/5"
                        >
                          <td className="py-1.5 px-3 font-bold text-white">
                            {row.sta}
                          </td>
                          <td className="py-1.5 px-2 text-right text-sky-100">
                            {row.measurementValue !== null
                              ? `${row.measurementValue}${row.measurementUnit ? ` ${row.measurementUnit}` : ''}`
                              : '—'}
                          </td>
                          {inspectedIsMlv && (
                            <td className="py-1.5 px-2 text-right text-sky-100">
                              {row.convertedAmplitudeMm !== null &&
                              row.convertedAmplitudeMm !== undefined
                                ? row.convertedAmplitudeMm.toFixed(4)
                                : '—'}
                            </td>
                          )}
                          <td className="py-1.5 px-2 font-sans text-sky-200">
                            {row.measurementSource}
                          </td>
                          <td className="py-1.5 px-2 text-right text-sky-100">
                            {row.distanceKm !== null
                              ? row.distanceKm.toFixed(1)
                              : '—'}
                          </td>
                          {inspectedIsMlv && (
                            <td className="py-1.5 px-2 text-right text-sky-100">
                              {row.attenuationLogA0 !== null &&
                              row.attenuationLogA0 !== undefined
                                ? `${row.attenuationLogA0.toFixed(3)} / ${row.stationCorrection >= 0 ? `+${row.stationCorrection.toFixed(2)}` : row.stationCorrection.toFixed(2)}`
                                : '—'}
                            </td>
                          )}
                          <td className="py-1.5 px-2 text-right font-semibold text-white">
                            {row.magnitude !== null
                              ? row.magnitude.toFixed(inspectedIsLegacy ? 1 : 2)
                              : '—'}
                          </td>
                          <td className="py-1.5 px-2 font-sans">
                            <span
                              className={`inline-block px-1.5 py-0.5 rounded-xs border text-[10px] font-semibold ${statusBadge}`}
                            >
                              {row.status}
                            </span>
                          </td>
                          <td className="py-1.5 px-3 font-sans text-sky-200/90">
                            {row.reason || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
