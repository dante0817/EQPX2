import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Copy,
  Plus,
  Trash2,
  Waves,
  X,
} from 'lucide-react';
import type { EQPEvent, StationPick } from '../data/eqpData';
import {
  ALLOWED_UNITS_BY_QUANTITY,
  AMPLITUDE_CATEGORY_LABELS,
  AMPLITUDE_CONVENTION_LABELS,
  AMPLITUDE_UNIT_LABELS,
  CORRECTED_STATUS_LABELS,
  PHYSICAL_QUANTITY_LABELS,
  RESPONSE_STATUS_LABELS,
  cloneAmplitudeMeasurement,
  createDefaultAmplitudeMeasurement,
  getDefaultUnitForQuantity,
  isQuantityCompatibleWithUnit,
  validateEventAmplitudeMeasurements,
  type AmplitudeAssociationIssue,
  type AmplitudeConvention,
  type AmplitudeCorrectedStatus,
  type AmplitudeMeasurement,
  type AmplitudeMeasurementCategory,
  type AmplitudePhaseType,
  type AmplitudePhysicalQuantity,
  type AmplitudeSource,
  type AmplitudeUnit,
  type AmplitudeValidationResult,
  type InstrumentResponseStatus,
} from '../utils/amplitudeMeasurements';

interface AmplitudeMeasurementModalProps {
  open: boolean;
  event: EQPEvent;
  pick: StationPick | null;
  onSave: (pickId: string, nextStationMeasurements: AmplitudeMeasurement[]) => void;
  onCancel: () => void;
}

const CATEGORY_OPTIONS: AmplitudeMeasurementCategory[] = [
  'raw_waveform',
  'wood_anderson_local',
  'short_period_p',
  'surface_wave',
  'other',
];

const QUANTITY_OPTIONS: AmplitudePhysicalQuantity[] = [
  'counts',
  'displacement',
  'velocity',
];

const ALL_UNIT_OPTIONS: AmplitudeUnit[] = ['counts', 'm', 'mm', 'um', 'nm', 'm/s'];

const CONVENTION_OPTIONS: AmplitudeConvention[] = [
  'zero_to_peak',
  'peak_to_peak',
  'unknown',
];

const PHASE_OPTIONS: AmplitudePhaseType[] = [
  'P',
  'S',
  'Lg',
  'Surface',
  'Coda',
  'Waveform',
  'Unknown',
];

const SOURCE_OPTIONS: Array<{ value: AmplitudeSource; label: string }> = [
  { value: 'manual_entry', label: 'Manual Entry' },
  { value: 'waveform_pick', label: 'Waveform Pick' },
  { value: 'atlas_hydra', label: 'ATLAS / HYDRA' },
  { value: 'imported_external', label: 'Imported External' },
  { value: 'unknown', label: 'Unknown' },
];

const RESPONSE_STATUS_OPTIONS: InstrumentResponseStatus[] = [
  'raw_uncorrected',
  'wood_anderson_simulated',
  'response_corrected_displacement',
  'response_corrected_velocity',
  'unknown',
];

const CORRECTED_STATUS_OPTIONS: AmplitudeCorrectedStatus[] = [
  'raw',
  'corrected',
  'unknown',
];

const FUTURE_MAG_LABELS: Record<
  'ml-local' | 'mlv-vertical' | 'mb-body' | 'ms-20',
  string
> = {
  'ml-local': 'ML (Local)',
  'mlv-vertical': 'MLv (Vertical)',
  'mb-body': 'mb (Body-Wave)',
  'ms-20': 'Ms_20 (Surface-Wave)',
};

function shortCategoryBadge(cat: AmplitudeMeasurementCategory): string {
  switch (cat) {
    case 'raw_waveform':
      return 'RAW';
    case 'wood_anderson_local':
      return 'W-A';
    case 'short_period_p':
      return 'SP-P';
    case 'surface_wave':
      return 'SW-20';
    case 'other':
      return 'OTHER';
  }
}

function areMeasurementListsEqual(
  a: ReadonlyArray<AmplitudeMeasurement>,
  b: ReadonlyArray<AmplitudeMeasurement>
): boolean {
  if (a.length !== b.length) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

export const AmplitudeMeasurementModal: React.FC<AmplitudeMeasurementModalProps> = ({
  open,
  event,
  pick,
  onSave,
  onCancel,
}) => {
  const [drafts, setDrafts] = useState<AmplitudeMeasurement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [amplitudeInputs, setAmplitudeInputs] = useState<Record<string, string>>({});
  const [periodInputs, setPeriodInputs] = useState<Record<string, string>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);

  const savedStationMeasurements = useMemo(() => {
    if (!pick) return [] as AmplitudeMeasurement[];
    return (event.amplitudeMeasurements ?? [])
      .filter((m) => m.stationRefId === pick.id)
      .map(cloneAmplitudeMeasurement);
  }, [event.amplitudeMeasurements, pick]);

  const stationIssues: AmplitudeAssociationIssue[] = useMemo(() => {
    if (!pick) return [];
    const staUpper = pick.sta.trim().toUpperCase();
    return (event.amplitudeAssociationIssues ?? []).filter(
      (iss) =>
        iss.stationRefId === pick.id ||
        iss.stationCode.trim().toUpperCase() === staUpper
    );
  }, [event.amplitudeAssociationIssues, pick]);

  useEffect(() => {
    if (!open || !pick) return;
    const cloned = savedStationMeasurements.map(cloneAmplitudeMeasurement);
    const ampStrMap: Record<string, string> = {};
    const perStrMap: Record<string, string> = {};
    for (const item of cloned) {
      ampStrMap[item.id] =
        Number.isFinite(item.amplitude) && item.amplitude !== 0
          ? String(item.amplitude)
          : '';
      perStrMap[item.id] =
        item.periodSec !== null &&
        item.periodSec !== undefined &&
        Number.isFinite(item.periodSec)
          ? String(item.periodSec)
          : '';
    }
    setDrafts(cloned);
    setAmplitudeInputs(ampStrMap);
    setPeriodInputs(perStrMap);
    setSelectedId(cloned[0]?.id ?? null);
    setShowAdvanced(false);
  }, [open, pick?.id]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel]);

  const previewValidation = useMemo(() => {
    if (!pick) {
      return validateEventAmplitudeMeasurements({
        id: event.id,
        picks: event.picks,
        amplitudeMeasurements: [],
      });
    }
    const otherStations = (event.amplitudeMeasurements ?? []).filter(
      (m) => m.stationRefId !== pick.id
    );
    return validateEventAmplitudeMeasurements({
      id: event.id,
      picks: event.picks,
      amplitudeMeasurements: [...otherStations, ...drafts],
    });
  }, [drafts, event.amplitudeMeasurements, event.id, event.picks, pick]);

  if (!open || !pick) return null;

  const selectedMeasurement =
    drafts.find((d) => d.id === selectedId) ?? drafts[0] ?? null;
  const selectedValidation: AmplitudeValidationResult | null = selectedMeasurement
    ? previewValidation.resultsById.get(selectedMeasurement.id) ?? null
    : null;
  const stationSummary = previewValidation.stationSummariesByPickId.get(pick.id);

  const hasStructuralErrors = drafts.some(
    (d) => !(previewValidation.resultsById.get(d.id)?.structuralValid ?? true)
  );
  const hasUnsavedChanges = !areMeasurementListsEqual(
    drafts,
    savedStationMeasurements
  );

  const updateMeasurement = (
    id: string,
    updater: (prev: AmplitudeMeasurement) => AmplitudeMeasurement
  ) => {
    setDrafts((prev) =>
      prev.map((m) =>
        m.id === id
          ? {
              ...updater(m),
              updatedAt: new Date().toISOString(),
            }
          : m
      )
    );
  };

  const handleAddMeasurement = (category: AmplitudeMeasurementCategory = 'raw_waveform') => {
    const created = createDefaultAmplitudeMeasurement({
      eventId: event.id,
      stationRefId: pick.id,
      stationCode: pick.sta,
      networkCode: pick.atlasMetadata?.network ?? '',
      category,
    });
    setDrafts((prev) => [...prev, created]);
    setAmplitudeInputs((prev) => ({ ...prev, [created.id]: '' }));
    setPeriodInputs((prev) => ({ ...prev, [created.id]: '' }));
    setSelectedId(created.id);
  };

  const handleDuplicateSelected = () => {
    if (!selectedMeasurement) return;
    const nowIso = new Date().toISOString();
    const copy = createDefaultAmplitudeMeasurement({
      eventId: event.id,
      stationRefId: pick.id,
      stationCode: pick.sta,
      category: selectedMeasurement.measurementCategory,
    });
    const cloned: AmplitudeMeasurement = {
      ...cloneAmplitudeMeasurement(selectedMeasurement),
      id: copy.id,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    setDrafts((prev) => [...prev, cloned]);
    setAmplitudeInputs((prev) => ({
      ...prev,
      [cloned.id]: amplitudeInputs[selectedMeasurement.id] ?? '',
    }));
    setPeriodInputs((prev) => ({
      ...prev,
      [cloned.id]: periodInputs[selectedMeasurement.id] ?? '',
    }));
    setSelectedId(cloned.id);
  };

  const handleRemoveMeasurement = (id: string) => {
    setDrafts((prev) => {
      const next = prev.filter((m) => m.id !== id);
      if (selectedId === id) {
        setSelectedId(next[0]?.id ?? null);
      }
      return next;
    });
    setAmplitudeInputs((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setPeriodInputs((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleAmplitudeTextChange = (id: string, raw: string) => {
    if (raw !== '' && !/^-?\d*\.?\d*(?:[eE][+-]?\d*)?$/.test(raw)) return;
    setAmplitudeInputs((prev) => ({ ...prev, [id]: raw }));
    const trimmed = raw.trim();
    const parsed = trimmed === '' ? 0 : Number(trimmed);
    updateMeasurement(id, (m) => ({
      ...m,
      amplitude:
        trimmed === ''
          ? 0
          : Number.isFinite(parsed)
            ? parsed
            : Number.NaN,
    }));
  };

  const handlePeriodTextChange = (id: string, raw: string) => {
    if (raw !== '' && !/^-?\d*\.?\d*$/.test(raw)) return;
    setPeriodInputs((prev) => ({ ...prev, [id]: raw }));
    const trimmed = raw.trim();
    const parsed = trimmed === '' ? null : Number(trimmed);
    updateMeasurement(id, (m) => ({
      ...m,
      periodSec:
        trimmed === ''
          ? null
          : parsed !== null && Number.isFinite(parsed)
            ? parsed
            : Number.NaN,
    }));
  };

  const statusBadgeClass =
    stationSummary?.status === 'quality_warning'
      ? 'bg-rose-100 text-rose-800 border-rose-300'
      : stationSummary?.status === 'incomplete'
        ? 'bg-amber-100 text-amber-900 border-amber-300'
        : stationSummary?.status === 'available'
          ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
          : 'bg-slate-200 text-slate-700 border-slate-300';

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-3"
      onClick={onCancel}
      onPaste={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-label={`Amplitude Measurements for ${pick.sta || 'Station'}`}
    >
      <div
        className="w-full max-w-[920px] max-h-[90vh] bg-[#e6eaf0] text-slate-900 border border-slate-600 shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-[#0b4a8f] to-[#1d6bc2] text-white px-3 py-2 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Waves className="w-4 h-4 text-sky-200 shrink-0" />
            <span className="font-semibold text-[13px] truncate">
              Amplitude Measurements — {pick.sta || '(Unnamed Station)'}
            </span>
            <span className="text-[11px] font-mono text-sky-200 hidden sm:inline truncate">
              [{pick.id}]
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`px-2 py-0.5 text-[10px] font-semibold border rounded-xs ${statusBadgeClass}`}
            >
              {stationSummary?.label ?? 'No Measurements'}
            </span>
            <button
              type="button"
              onClick={onCancel}
              aria-label="Close amplitude measurement editor"
              className="p-0.5 rounded-xs hover:bg-white/15 text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Station Context & Legacy Amp Note */}
        <div className="bg-[#f0f2f5] border-b border-slate-300 px-3 py-2 text-[11px] flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-slate-800">
            <span>
              <strong>STA:</strong> {pick.sta || '—'}
            </span>
            <span>
              <strong>Net:</strong> {pick.atlasMetadata?.network || '—'}
            </span>
            <span>
              <strong>P:</strong> {pick.pTime || '—'}
            </span>
            <span>
              <strong>S:</strong> {pick.sTime || '—'}
            </span>
            <span>
              <strong>Dur:</strong>{' '}
              {pick.duration !== null && pick.duration !== undefined
                ? `${pick.duration} s`
                : '—'}
            </span>
            <span
              title="Original legacy Amp (µm) scalar field. Preserved independently as a legacy observation without assuming channel, response correction, or magnitude scale."
              className="text-slate-700"
            >
              <strong>Legacy Amp (µm):</strong>{' '}
              {pick.amplitude !== null && pick.amplitude !== undefined
                ? `${pick.amplitude} µm (legacy scalar only)`
                : '—'}
            </span>
          </div>
          {hasUnsavedChanges && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded-xs">
              Unsaved Draft Edits
            </span>
          )}
        </div>

        {stationIssues.length > 0 && (
          <div className="bg-amber-50 border-b border-amber-300 px-3 py-1.5 text-[11px] text-amber-950 space-y-0.5 shrink-0">
            {stationIssues.map((iss) => (
              <div key={iss.id} className="flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                <span>{iss.message}</span>
              </div>
            ))}
          </div>
        )}

        {/* Main 2-Pane Body */}
        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[260px_1fr] overflow-hidden">
          {/* Left: Measurement List */}
          <div className="border-b md:border-b-0 md:border-r border-slate-300 bg-[#f6f8fa] flex flex-col min-h-0">
            <div className="px-2.5 py-2 border-b border-slate-300 flex items-center justify-between gap-2 shrink-0">
              <span className="text-[11px] font-semibold text-slate-800">
                Station Records ({drafts.length})
              </span>
              <button
                type="button"
                onClick={() => handleAddMeasurement('raw_waveform')}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold bg-[#0b4a8f] text-white hover:bg-[#135aa8] rounded-xs"
              >
                <Plus className="w-3 h-3" />
                Add
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-200">
              {drafts.length === 0 ? (
                <div className="p-3 text-[11px] text-slate-600 leading-relaxed">
                  No structured amplitude measurements for <strong>{pick.sta || 'this row'}</strong> yet.
                  Click <strong>Add</strong> to record one or more channel/phase measurements (e.g., BHZ, BHN, BHE).
                </div>
              ) : (
                drafts.map((m, idx) => {
                  const val = previewValidation.resultsById.get(m.id);
                  const isActive = selectedMeasurement?.id === m.id;
                  const dotClass = !val?.structuralValid
                    ? 'bg-rose-600'
                    : val?.hasQualityWarning
                      ? 'bg-rose-500'
                      : !val?.processingComplete
                        ? 'bg-amber-500'
                        : 'bg-emerald-600';
                  return (
                    <div
                      key={m.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedId(m.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedId(m.id);
                        }
                      }}
                      className={`px-2.5 py-2 cursor-pointer transition-colors ${
                        isActive
                          ? 'bg-blue-100 border-l-2 border-l-[#0b4a8f]'
                          : 'hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`}
                            title={val?.statusLabel}
                          />
                          <span className="font-mono font-semibold text-[11px] text-slate-900 truncate">
                            {m.channelCode.trim() || `#${idx + 1} (No Chan)`}
                          </span>
                          <span className="text-[10px] font-mono text-slate-600 border border-slate-300 bg-white px-1 rounded-xs">
                            {shortCategoryBadge(m.measurementCategory)}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveMeasurement(m.id);
                          }}
                          title="Delete measurement"
                          aria-label={`Delete measurement ${m.channelCode || idx + 1}`}
                          className="p-0.5 text-slate-400 hover:text-rose-600"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[10px] font-mono text-slate-700">
                        <span>
                          {Number.isFinite(m.amplitude) && m.amplitude > 0
                            ? `${m.amplitude} ${AMPLITUDE_UNIT_LABELS[m.unit]}`
                            : 'No value'}
                        </span>
                        <span className="text-slate-500">
                          {m.phaseType}
                          {m.excluded ? ' · EXCL' : ''}
                          {m.clipped ? ' · CLIP' : ''}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right: Selected Measurement Editor */}
          <div className="bg-white overflow-y-auto p-3 space-y-3 min-h-0">
            {!selectedMeasurement ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-600 space-y-2">
                <Waves className="w-7 h-7 text-slate-400" />
                <p className="text-xs font-medium text-slate-800">
                  Select or add a structured amplitude measurement for {pick.sta || 'this station'}.
                </p>
                <p className="text-[11px] max-w-md text-slate-500">
                  Multiple channels or amplitude types (raw counts, Wood–Anderson simulated, short-period P, surface wave) are kept separate and saved in the .eqp.meta.json sidecar.
                </p>
                <button
                  type="button"
                  onClick={() => handleAddMeasurement('raw_waveform')}
                  className="mt-1 inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-[#0b4a8f] text-white hover:bg-[#135aa8] rounded-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add First Measurement
                </button>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200">
                  <div className="text-xs font-semibold text-slate-900">
                    Measurement Details ·{' '}
                    <span className="font-mono text-[#0b4a8f]">
                      {selectedMeasurement.channelCode.trim() || 'Channel Unset'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleDuplicateSelected}
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] border border-slate-300 bg-slate-50 hover:bg-slate-100 rounded-xs text-slate-700"
                    >
                      <Copy className="w-3 h-3" />
                      Duplicate
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveMeasurement(selectedMeasurement.id)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] border border-rose-300 bg-rose-50 hover:bg-rose-100 rounded-xs text-rose-700"
                    >
                      <Trash2 className="w-3 h-3" />
                      Remove
                    </button>
                  </div>
                </div>

                {/* Basic Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-[11px]">
                  <label className="space-y-1 sm:col-span-2 lg:col-span-2">
                    <span className="block font-semibold text-slate-700">
                      Measurement Category
                    </span>
                    <select
                      value={selectedMeasurement.measurementCategory}
                      onChange={(e) => {
                        const nextCat = e.target.value as AmplitudeMeasurementCategory;
                        updateMeasurement(selectedMeasurement.id, (prev) => {
                          const base = {
                            ...prev,
                            phaseType:
                              nextCat === 'short_period_p'
                                ? ('P' as const)
                                : nextCat === 'surface_wave'
                                  ? ('Surface' as const)
                                  : nextCat === 'wood_anderson_local' && prev.phaseType === 'Waveform'
                                    ? ('S' as const)
                                    : prev.phaseType,
                          };
                          if (nextCat === 'other') {
                            return {
                              ...base,
                              measurementCategory: 'other',
                              customCategoryLabel:
                                prev.measurementCategory === 'other'
                                  ? prev.customCategoryLabel ?? ''
                                  : '',
                            };
                          }
                          const { customCategoryLabel: _ignored, ...rest } =
                            base as AmplitudeMeasurement & {
                              customCategoryLabel?: string;
                            };
                          return {
                            ...rest,
                            measurementCategory: nextCat,
                          };
                        });
                      }}
                      className="w-full border border-slate-300 bg-white px-2 py-1 rounded-xs text-slate-900 focus:outline-none focus:border-blue-600"
                    >
                      {CATEGORY_OPTIONS.map((cat) => (
                        <option key={cat} value={cat}>
                          {AMPLITUDE_CATEGORY_LABELS[cat]}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="block font-semibold text-slate-700">
                      Channel Code (SEED)
                    </span>
                    <input
                      type="text"
                      value={selectedMeasurement.channelCode}
                      placeholder="e.g. BHZ, HHN, SHZ"
                      maxLength={4}
                      onChange={(e) => {
                        const val = e.target.value
                          .toUpperCase()
                          .replace(/[^A-Z0-9]/g, '')
                          .slice(0, 4);
                        updateMeasurement(selectedMeasurement.id, (m) => ({
                          ...m,
                          channelCode: val,
                        }));
                      }}
                      className="w-full border border-slate-300 bg-white px-2 py-1 rounded-xs font-mono uppercase text-slate-900 focus:outline-none focus:border-blue-600"
                    />
                  </label>

                  {selectedMeasurement.measurementCategory === 'other' && (
                    <label className="space-y-1 sm:col-span-2 lg:col-span-3">
                      <span className="block font-semibold text-slate-700">
                        Custom Category Label
                      </span>
                      <input
                        type="text"
                        value={selectedMeasurement.customCategoryLabel ?? ''}
                        placeholder="Describe custom amplitude measurement type"
                        onChange={(e) =>
                          updateMeasurement(selectedMeasurement.id, (m) =>
                            m.measurementCategory === 'other'
                              ? { ...m, customCategoryLabel: e.target.value }
                              : m
                          )
                        }
                        className="w-full border border-slate-300 bg-white px-2 py-1 rounded-xs text-slate-900 focus:outline-none focus:border-blue-600"
                      />
                    </label>
                  )}

                  <label className="space-y-1">
                    <span className="block font-semibold text-slate-700">
                      Amplitude Value
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={amplitudeInputs[selectedMeasurement.id] ?? ''}
                      placeholder="e.g. 0.0045 or 12450"
                      onChange={(e) =>
                        handleAmplitudeTextChange(
                          selectedMeasurement.id,
                          e.target.value
                        )
                      }
                      className="w-full border border-slate-300 bg-white px-2 py-1 rounded-xs font-mono text-right text-slate-900 focus:outline-none focus:border-blue-600"
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="block font-semibold text-slate-700">
                      Physical Quantity
                    </span>
                    <select
                      value={selectedMeasurement.physicalQuantity}
                      onChange={(e) => {
                        const nextQty = e.target.value as AmplitudePhysicalQuantity;
                        updateMeasurement(selectedMeasurement.id, (m) => ({
                          ...m,
                          physicalQuantity: nextQty,
                          unit: isQuantityCompatibleWithUnit(nextQty, m.unit)
                            ? m.unit
                            : getDefaultUnitForQuantity(nextQty),
                        }));
                      }}
                      className="w-full border border-slate-300 bg-white px-2 py-1 rounded-xs text-slate-900 focus:outline-none focus:border-blue-600"
                    >
                      {QUANTITY_OPTIONS.map((qty) => (
                        <option key={qty} value={qty}>
                          {PHYSICAL_QUANTITY_LABELS[qty]}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="block font-semibold text-slate-700">
                      Unit
                    </span>
                    <select
                      value={selectedMeasurement.unit}
                      onChange={(e) => {
                        const nextUnit = e.target.value as AmplitudeUnit;
                        updateMeasurement(selectedMeasurement.id, (m) => ({
                          ...m,
                          unit: nextUnit,
                        }));
                      }}
                      className="w-full border border-slate-300 bg-white px-2 py-1 rounded-xs font-mono text-slate-900 focus:outline-none focus:border-blue-600"
                    >
                      {ALL_UNIT_OPTIONS.map((unitOpt) => {
                        const compatible = ALLOWED_UNITS_BY_QUANTITY[
                          selectedMeasurement.physicalQuantity
                        ].includes(unitOpt);
                        return (
                          <option key={unitOpt} value={unitOpt}>
                            {AMPLITUDE_UNIT_LABELS[unitOpt]}
                            {!compatible ? ' (incompatible)' : ''}
                          </option>
                        );
                      })}
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="block font-semibold text-slate-700">
                      Amplitude Convention
                    </span>
                    <select
                      value={selectedMeasurement.convention}
                      onChange={(e) =>
                        updateMeasurement(selectedMeasurement.id, (m) => ({
                          ...m,
                          convention: e.target.value as AmplitudeConvention,
                        }))
                      }
                      className="w-full border border-slate-300 bg-white px-2 py-1 rounded-xs text-slate-900 focus:outline-none focus:border-blue-600"
                    >
                      {CONVENTION_OPTIONS.map((conv) => (
                        <option key={conv} value={conv}>
                          {AMPLITUDE_CONVENTION_LABELS[conv]}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="block font-semibold text-slate-700">
                      Phase Type
                    </span>
                    <select
                      value={selectedMeasurement.phaseType}
                      onChange={(e) =>
                        updateMeasurement(selectedMeasurement.id, (m) => ({
                          ...m,
                          phaseType: e.target.value as AmplitudePhaseType,
                        }))
                      }
                      className="w-full border border-slate-300 bg-white px-2 py-1 rounded-xs text-slate-900 focus:outline-none focus:border-blue-600"
                    >
                      {PHASE_OPTIONS.map((ph) => (
                        <option key={ph} value={ph}>
                          {ph}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="block font-semibold text-slate-700">
                      Period T (s)
                      {(selectedMeasurement.measurementCategory === 'short_period_p' ||
                        selectedMeasurement.measurementCategory === 'surface_wave') && (
                        <span className="ml-1 text-amber-700 font-normal">
                          (req.)
                        </span>
                      )}
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={periodInputs[selectedMeasurement.id] ?? ''}
                      placeholder={
                        selectedMeasurement.measurementCategory === 'surface_wave'
                          ? 'e.g. 20.0'
                          : 'optional'
                      }
                      onChange={(e) =>
                        handlePeriodTextChange(
                          selectedMeasurement.id,
                          e.target.value
                        )
                      }
                      className="w-full border border-slate-300 bg-white px-2 py-1 rounded-xs font-mono text-right text-slate-900 focus:outline-none focus:border-blue-600"
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="block font-semibold text-slate-700">
                      Source
                    </span>
                    <select
                      value={selectedMeasurement.source}
                      onChange={(e) =>
                        updateMeasurement(selectedMeasurement.id, (m) => ({
                          ...m,
                          source: e.target.value as AmplitudeSource,
                        }))
                      }
                      className="w-full border border-slate-300 bg-white px-2 py-1 rounded-xs text-slate-900 focus:outline-none focus:border-blue-600"
                    >
                      {SOURCE_OPTIONS.map((src) => (
                        <option key={src.value} value={src.value}>
                          {src.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="block font-semibold text-slate-700">
                      Instrument Response Status
                    </span>
                    <select
                      value={selectedMeasurement.instrumentResponseStatus}
                      onChange={(e) =>
                        updateMeasurement(selectedMeasurement.id, (m) => ({
                          ...m,
                          instrumentResponseStatus:
                            e.target.value as InstrumentResponseStatus,
                        }))
                      }
                      className="w-full border border-slate-300 bg-white px-2 py-1 rounded-xs text-slate-900 focus:outline-none focus:border-blue-600"
                    >
                      {RESPONSE_STATUS_OPTIONS.map((st) => (
                        <option key={st} value={st}>
                          {RESPONSE_STATUS_LABELS[st]}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="block font-semibold text-slate-700">
                      Corrected Status
                    </span>
                    <select
                      value={selectedMeasurement.correctedStatus}
                      onChange={(e) =>
                        updateMeasurement(selectedMeasurement.id, (m) => ({
                          ...m,
                          correctedStatus:
                            e.target.value as AmplitudeCorrectedStatus,
                        }))
                      }
                      className="w-full border border-slate-300 bg-white px-2 py-1 rounded-xs text-slate-900 focus:outline-none focus:border-blue-600"
                    >
                      {CORRECTED_STATUS_OPTIONS.map((st) => (
                        <option key={st} value={st}>
                          {CORRECTED_STATUS_LABELS[st]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {/* Collapsible Advanced Processing & Quality Fields */}
                <div className="border border-slate-300 bg-slate-50 rounded-xs">
                  <button
                    type="button"
                    onClick={() => setShowAdvanced((v) => !v)}
                    className="w-full px-2.5 py-1.5 flex items-center justify-between text-[11px] font-semibold text-slate-800 hover:bg-slate-100"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {showAdvanced ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                      Advanced Processing, Provenance & Quality Fields
                    </span>
                    <span className="text-[10px] font-normal text-slate-500">
                      {selectedMeasurement.clipped ? 'Clipped · ' : ''}
                      {selectedMeasurement.excluded ? 'Excluded · ' : ''}
                      {showAdvanced ? 'Hide' : 'Show'}
                    </span>
                  </button>

                  {showAdvanced && (
                    <div className="p-2.5 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-[11px] bg-white">
                      <label className="space-y-1">
                        <span className="block font-semibold text-slate-700">
                          Network Code
                        </span>
                        <input
                          type="text"
                          value={selectedMeasurement.networkCode}
                          placeholder="e.g. PH"
                          onChange={(e) =>
                            updateMeasurement(selectedMeasurement.id, (m) => ({
                              ...m,
                              networkCode: e.target.value.trim().toUpperCase(),
                            }))
                          }
                          className="w-full border border-slate-300 px-2 py-1 rounded-xs font-mono uppercase"
                        />
                      </label>

                      <label className="space-y-1">
                        <span className="block font-semibold text-slate-700">
                          Location Code
                        </span>
                        <input
                          type="text"
                          value={selectedMeasurement.locationCode}
                          placeholder="e.g. 00"
                          onChange={(e) =>
                            updateMeasurement(selectedMeasurement.id, (m) => ({
                              ...m,
                              locationCode: e.target.value.trim().toUpperCase(),
                            }))
                          }
                          className="w-full border border-slate-300 px-2 py-1 rounded-xs font-mono uppercase"
                        />
                      </label>

                      <label className="space-y-1">
                        <span className="block font-semibold text-slate-700">
                          Processing Profile ID
                        </span>
                        <input
                          type="text"
                          value={selectedMeasurement.processingProfileId ?? ''}
                          placeholder="optional profile ID"
                          onChange={(e) =>
                            updateMeasurement(selectedMeasurement.id, (m) => ({
                              ...m,
                              processingProfileId: e.target.value,
                            }))
                          }
                          className="w-full border border-slate-300 px-2 py-1 rounded-xs font-mono"
                        />
                      </label>

                      <label className="space-y-1">
                        <span className="block font-semibold text-slate-700">
                          Channel Azimuth (°)
                        </span>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="360"
                          value={selectedMeasurement.channelAzimuthDeg ?? ''}
                          placeholder="optional (0–360; req. for ..1/..2)"
                          onChange={(e) => {
                            const raw = e.target.value.trim();
                            updateMeasurement(selectedMeasurement.id, (m) => ({
                              ...m,
                              channelAzimuthDeg:
                                raw === '' ? null : Number(raw),
                            }));
                          }}
                          className="w-full border border-slate-300 px-2 py-1 rounded-xs font-mono tabular-nums"
                        />
                      </label>

                      <label className="space-y-1">
                        <span className="block font-semibold text-slate-700">
                          Channel Dip (°)
                        </span>
                        <input
                          type="number"
                          step="0.1"
                          min="-90"
                          max="90"
                          value={selectedMeasurement.channelDipDeg ?? ''}
                          placeholder="0° = horizontal"
                          onChange={(e) => {
                            const raw = e.target.value.trim();
                            updateMeasurement(selectedMeasurement.id, (m) => ({
                              ...m,
                              channelDipDeg:
                                raw === '' ? null : Number(raw),
                            }));
                          }}
                          className="w-full border border-slate-300 px-2 py-1 rounded-xs font-mono tabular-nums"
                        />
                      </label>

                      <label className="flex items-end pb-1 gap-1.5 cursor-pointer text-slate-800">
                        <input
                          type="checkbox"
                          checked={Boolean(
                            selectedMeasurement.horizontalOrientationVerified
                          )}
                          onChange={(e) =>
                            updateMeasurement(selectedMeasurement.id, (m) => ({
                              ...m,
                              horizontalOrientationVerified: e.target.checked,
                            }))
                          }
                          className="accent-blue-600"
                        />
                        <span>Horizontal orientation verified (for ..1/..2)</span>
                      </label>

                      <label className="space-y-1">
                        <span className="block font-semibold text-slate-700">
                          Window Start (ISO UTC)
                        </span>
                        <input
                          type="text"
                          value={selectedMeasurement.windowStartIso ?? ''}
                          placeholder="YYYY-MM-DDTHH:MM:SSZ"
                          onChange={(e) =>
                            updateMeasurement(selectedMeasurement.id, (m) => ({
                              ...m,
                              windowStartIso: e.target.value || null,
                            }))
                          }
                          className="w-full border border-slate-300 px-2 py-1 rounded-xs font-mono"
                        />
                      </label>

                      <label className="space-y-1">
                        <span className="block font-semibold text-slate-700">
                          Window End (ISO UTC)
                        </span>
                        <input
                          type="text"
                          value={selectedMeasurement.windowEndIso ?? ''}
                          placeholder="YYYY-MM-DDTHH:MM:SSZ"
                          onChange={(e) =>
                            updateMeasurement(selectedMeasurement.id, (m) => ({
                              ...m,
                              windowEndIso: e.target.value || null,
                            }))
                          }
                          className="w-full border border-slate-300 px-2 py-1 rounded-xs font-mono"
                        />
                      </label>

                      <label className="space-y-1">
                        <span className="block font-semibold text-slate-700">
                          Processing Method
                        </span>
                        <input
                          type="text"
                          value={selectedMeasurement.processingMethod ?? ''}
                          placeholder="e.g. bandpass 0.5-10Hz"
                          onChange={(e) =>
                            updateMeasurement(selectedMeasurement.id, (m) => ({
                              ...m,
                              processingMethod: e.target.value,
                            }))
                          }
                          className="w-full border border-slate-300 px-2 py-1 rounded-xs"
                        />
                      </label>

                      <label className="space-y-1">
                        <span className="block font-semibold text-slate-700">
                          Waveform Reference
                        </span>
                        <input
                          type="text"
                          value={selectedMeasurement.waveformRef ?? ''}
                          placeholder="miniSEED / trace URI"
                          onChange={(e) =>
                            updateMeasurement(selectedMeasurement.id, (m) => ({
                              ...m,
                              waveformRef: e.target.value,
                            }))
                          }
                          className="w-full border border-slate-300 px-2 py-1 rounded-xs font-mono"
                        />
                      </label>

                      <label className="space-y-1">
                        <span className="block font-semibold text-slate-700">
                          Instrument Metadata Ref
                        </span>
                        <input
                          type="text"
                          value={selectedMeasurement.instrumentMetadataRef ?? ''}
                          placeholder="StationXML / PZ ref"
                          onChange={(e) =>
                            updateMeasurement(selectedMeasurement.id, (m) => ({
                              ...m,
                              instrumentMetadataRef: e.target.value,
                            }))
                          }
                          className="w-full border border-slate-300 px-2 py-1 rounded-xs font-mono"
                        />
                      </label>

                      <label className="space-y-1">
                        <span className="block font-semibold text-slate-700">
                          Provenance Note
                        </span>
                        <input
                          type="text"
                          value={selectedMeasurement.provenanceNote ?? ''}
                          placeholder="Analyst / instrument note"
                          onChange={(e) =>
                            updateMeasurement(selectedMeasurement.id, (m) => ({
                              ...m,
                              provenanceNote: e.target.value,
                            }))
                          }
                          className="w-full border border-slate-300 px-2 py-1 rounded-xs"
                        />
                      </label>

                      <div className="sm:col-span-2 lg:col-span-3 flex flex-wrap items-center gap-4 pt-1">
                        <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-800">
                          <input
                            type="checkbox"
                            checked={selectedMeasurement.clipped}
                            onChange={(e) =>
                              updateMeasurement(selectedMeasurement.id, (m) => ({
                                ...m,
                                clipped: e.target.checked,
                              }))
                            }
                            className="accent-rose-600"
                          />
                          <span>Waveform Clipped (quality warning)</span>
                        </label>
                        <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-800">
                          <input
                            type="checkbox"
                            checked={Boolean(selectedMeasurement.excluded)}
                            onChange={(e) =>
                              updateMeasurement(selectedMeasurement.id, (m) => ({
                                ...m,
                                excluded: e.target.checked,
                              }))
                            }
                            className="accent-amber-600"
                          />
                          <span>Exclude from future evaluation</span>
                        </label>
                      </div>

                      {selectedMeasurement.excluded && (
                        <label className="space-y-1 sm:col-span-2 lg:col-span-3">
                          <span className="block font-semibold text-slate-700">
                            Exclusion Reason
                          </span>
                          <input
                            type="text"
                            value={selectedMeasurement.exclusionReason ?? ''}
                            placeholder="Reason for analyst exclusion"
                            onChange={(e) =>
                              updateMeasurement(selectedMeasurement.id, (m) => ({
                                ...m,
                                exclusionReason: e.target.value,
                              }))
                            }
                            className="w-full border border-slate-300 px-2 py-1 rounded-xs"
                          />
                        </label>
                      )}

                      <label className="space-y-1 sm:col-span-2 lg:col-span-3">
                        <span className="block font-semibold text-slate-700">
                          Quality Notes
                        </span>
                        <input
                          type="text"
                          value={selectedMeasurement.qualityNotes ?? ''}
                          placeholder="Signal-to-noise, noise burst, or calibration observations"
                          onChange={(e) =>
                            updateMeasurement(selectedMeasurement.id, (m) => ({
                              ...m,
                              qualityNotes: e.target.value,
                            }))
                          }
                          className="w-full border border-slate-300 px-2 py-1 rounded-xs"
                        />
                      </label>
                    </div>
                  )}
                </div>

                {/* Inline Validation & Future Eligibility Placeholders */}
                {selectedValidation && (
                  <div className="border border-slate-300 bg-[#f8fafc] rounded-xs p-2.5 space-y-2 text-[11px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-800">
                        Validation &amp; Magnitude Readiness
                      </span>
                      <span
                        className={`px-1.5 py-0.5 text-[10px] font-semibold border rounded-xs ${
                          !selectedValidation.structuralValid
                            ? 'bg-rose-100 text-rose-800 border-rose-300'
                            : selectedValidation.statusLabel === 'Quality Warning'
                              ? 'bg-rose-50 text-rose-800 border-rose-300'
                              : selectedValidation.statusLabel === 'Incomplete'
                                ? 'bg-amber-50 text-amber-900 border-amber-300'
                                : 'bg-emerald-50 text-emerald-900 border-emerald-300'
                        }`}
                      >
                        {!selectedValidation.structuralValid
                          ? 'Structural Error'
                          : selectedValidation.statusLabel}
                      </span>
                    </div>

                    {selectedValidation.structuralErrors.length > 0 && (
                      <div className="bg-rose-50 border border-rose-300 text-rose-900 px-2 py-1.5 rounded-xs space-y-0.5">
                        <div className="font-semibold">
                          Structural Errors (must fix before saving):
                        </div>
                        {selectedValidation.structuralErrors.map((err, i) => (
                          <div key={i}>• {err}</div>
                        ))}
                      </div>
                    )}

                    {selectedValidation.qualityWarnings.length > 0 && (
                      <div className="bg-rose-50/60 border border-rose-200 text-rose-900 px-2 py-1.5 rounded-xs space-y-0.5">
                        <div className="font-semibold">Quality Warnings:</div>
                        {selectedValidation.qualityWarnings.map((w, i) => (
                          <div key={i}>• {w}</div>
                        ))}
                      </div>
                    )}

                    {selectedValidation.completenessWarnings.length > 0 && (
                      <div className="bg-amber-50 border border-amber-200 text-amber-900 px-2 py-1.5 rounded-xs space-y-0.5">
                        <div className="font-semibold">
                          Incomplete Processing Metadata (saved as Incomplete):
                        </div>
                        {selectedValidation.completenessWarnings.map((w, i) => (
                          <div key={i}>• {w}</div>
                        ))}
                      </div>
                    )}

                    <div className="border-t border-slate-200 pt-1.5">
                      <div className="text-[10px] font-semibold text-slate-600 mb-1">
                        Magnitude Algorithm Readiness (MLv &amp; ML active; mb / Ms_20 disabled pending future batch)
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                        {selectedValidation.scientificEligibility.map((el) => {
                          const isEligible =
                            el.status === 'eligible_mlv' ||
                            el.status === 'eligible_ml';
                          return (
                            <div
                              key={el.algorithmId}
                              className={`px-2 py-1 border rounded-xs text-[10px] ${
                                isEligible
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                                  : 'bg-slate-100 border-slate-200 text-slate-700'
                              }`}
                            >
                              <span className="font-semibold">
                                {FUTURE_MAG_LABELS[el.algorithmId]}:
                              </span>{' '}
                              <span
                                className={
                                  isEligible
                                    ? 'text-emerald-800'
                                    : 'text-slate-600'
                                }
                              >
                                {el.note}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-[#f0f2f5] border-t border-slate-300 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px] shrink-0">
          <div className="text-slate-600">
            {hasStructuralErrors ? (
              <span className="text-rose-700 font-semibold">
                Fix structural validation error(s) before saving.
              </span>
            ) : (
              <span>
                Structured measurements attach to station pick{' '}
                <code className="font-mono text-slate-800">{pick.id}</code> and persist in{' '}
                <code className="font-mono text-slate-800">.eqp.meta.json</code>.
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1 border border-slate-400 bg-white hover:bg-slate-100 text-slate-800 font-medium rounded-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={hasStructuralErrors || !hasUnsavedChanges}
              onClick={() => onSave(pick.id, drafts)}
              className="px-3.5 py-1 bg-[#0b4a8f] hover:bg-[#135aa8] disabled:opacity-50 text-white font-semibold rounded-xs"
            >
              Save Measurements
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
