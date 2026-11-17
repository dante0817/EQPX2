import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import {
  DEFAULT_MD_CONFIG,
  DEFAULT_MLV_CONFIG,
  DEFAULT_ML_CONFIG,
  MAGNITUDE_ALGORITHMS,
  SEISCOMP_REFERENCE_MLV_PROFILE,
  SEISCOMP_REFERENCE_ML_PROFILE,
  type MagnitudeAlgorithmId,
  type MagnitudeSettings,
  type MdCoefficients,
  type MlHorizontalCombinationMethod,
  type MlRequiredHorizontalComponents,
  type NetworkAggregationMethod,
  formatCalibrationStatusLabel,
} from '../utils/magnitudeEngine';
import {
  formatMlvAttenuationTableText,
  parseMlvAttenuationTableText,
  validateMlvCalibrationProfile,
  type MlvAmplitudeConvention,
  type MlvDistanceMetric,
  type MlvStationSelectionPolicy,
} from '../utils/mlvMagnitude';
import {
  formatMlAttenuationTableText,
  parseMlAttenuationTableText,
  validateMlCalibrationProfile,
  type MlAmplitudeConvention,
  type MlDistanceMetric,
  type MlStationSelectionPolicy,
} from '../utils/mlMagnitude';

interface MagnitudeConfigurationSectionProps {
  settings: MagnitudeSettings;
  onChangeSettings: (next: MagnitudeSettings) => void;
  onResetDefaults: () => void;
  onReturnToDataTab: () => void;
}

const DEFAULT_DROPDOWN_IDS: ReadonlyArray<MagnitudeAlgorithmId> = [
  'eqp-legacy-ms',
  'md-duration',
  'ml-local',
  'mlv-vertical',
  'mb-body',
  'ms-20',
];

const ENABLED_CHECKBOX_IDS: ReadonlyArray<MagnitudeAlgorithmId> = [
  'eqp-legacy-ms',
  'md-duration',
  'ml-local',
  'mlv-vertical',
  'mb-body',
  'ms-20',
  'ms-bb',
  'mb-broadband',
  'mwp',
];

export const MagnitudeConfigurationSection: React.FC<
  MagnitudeConfigurationSectionProps
> = ({ settings, onChangeSettings, onResetDefaults, onReturnToDataTab }) => {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [newStationCode, setNewStationCode] = useState('');
  const [newStationCorrection, setNewStationCorrection] = useState('0.00');
  const formattedPropMlvTable = formatMlvAttenuationTableText(
    settings.mlvConfig.attenuationTable
  );
  const [mlvTableDraft, setMlvTableDraft] = useState(formattedPropMlvTable);
  const [mlvTableError, setMlvTableError] = useState<string | null>(null);
  const lastCommittedMlvTableRef = useRef(formattedPropMlvTable);
  const [newMlvStationKey, setNewMlvStationKey] = useState('');
  const [newMlvStationCorrection, setNewMlvStationCorrection] = useState('0.00');

  const formattedPropMlTable = formatMlAttenuationTableText(
    settings.mlConfig.attenuationTable
  );
  const [mlTableDraft, setMlTableDraft] = useState(formattedPropMlTable);
  const [mlTableError, setMlTableError] = useState<string | null>(null);
  const lastCommittedMlTableRef = useRef(formattedPropMlTable);
  const [newMlStationKey, setNewMlStationKey] = useState('');
  const [newMlStationCorrection, setNewMlStationCorrection] = useState('0.00');

  useEffect(() => {
    if (formattedPropMlvTable !== lastCommittedMlvTableRef.current) {
      lastCommittedMlvTableRef.current = formattedPropMlvTable;
      setMlvTableDraft(formattedPropMlvTable);
      setMlvTableError(null);
    }
  }, [formattedPropMlvTable]);

  useEffect(() => {
    if (formattedPropMlTable !== lastCommittedMlTableRef.current) {
      lastCommittedMlTableRef.current = formattedPropMlTable;
      setMlTableDraft(formattedPropMlTable);
      setMlTableError(null);
    }
  }, [formattedPropMlTable]);

  const algorithmById = new Map(MAGNITUDE_ALGORITHMS.map((a) => [a.id, a]));
  const activeDefaultDesc = algorithmById.get(settings.defaultMethod);

  const handleDefaultMethodChange = (nextId: MagnitudeAlgorithmId) => {
    const desc = algorithmById.get(nextId);
    if (!desc || !desc.implemented) return;
    const enabledSet = new Set(settings.enabledMethods);
    enabledSet.add(nextId);
    onChangeSettings({
      ...settings,
      defaultMethod: nextId,
      enabledMethods: Array.from(enabledSet),
    });
  };

  const handleToggleAlgorithm = (id: MagnitudeAlgorithmId) => {
    const desc = algorithmById.get(id);
    if (!desc || !desc.implemented) return;
    const isEnabled = settings.enabledMethods.includes(id);
    if (isEnabled && id === settings.defaultMethod) {
      return;
    }
    const nextEnabled = isEnabled
      ? settings.enabledMethods.filter((m) => m !== id)
      : [...settings.enabledMethods, id];
    onChangeSettings({
      ...settings,
      enabledMethods: nextEnabled.length > 0 ? nextEnabled : [settings.defaultMethod],
    });
  };

  const handleCoeffChange = (key: keyof MdCoefficients, raw: string) => {
    const trimmed = raw.trim();
    const parsed = trimmed === '' ? null : Number(trimmed);
    const value = parsed !== null && Number.isFinite(parsed) ? parsed : null;
    onChangeSettings({
      ...settings,
      mdConfig: {
        ...settings.mdConfig,
        coefficients: {
          ...settings.mdConfig.coefficients,
          [key]: value,
        },
      },
    });
  };

  const handleAddStationCorrection = () => {
    const code = newStationCode.trim().toUpperCase();
    const val = Number(newStationCorrection);
    if (!code || !/^[A-Z0-9_-]{2,6}$/.test(code) || !Number.isFinite(val)) return;
    onChangeSettings({
      ...settings,
      mdConfig: {
        ...settings.mdConfig,
        stationCorrections: {
          ...settings.mdConfig.stationCorrections,
          [code]: Number(val.toFixed(3)),
        },
      },
    });
    setNewStationCode('');
    setNewStationCorrection('0.00');
  };

  const handleRemoveStationCorrection = (code: string) => {
    const next = { ...settings.mdConfig.stationCorrections };
    delete next[code];
    onChangeSettings({
      ...settings,
      mdConfig: {
        ...settings.mdConfig,
        stationCorrections: next,
      },
    });
  };

  const stationCorrectionEntries = Object.entries(
    settings.mdConfig.stationCorrections
  ).sort(([a], [b]) => a.localeCompare(b));

  const mlvProfileValidation = validateMlvCalibrationProfile(settings.mlvConfig);
  const mlProfileValidation = validateMlCalibrationProfile(settings.mlConfig);

  const mdStatusBadge =
    settings.mdConfig.calibrationStatus === 'calibrated'
      ? {
          text: 'Calibrated',
          cls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        }
      : settings.mdConfig.allowExperimentalEvaluation
        ? {
            text: 'Experimental / Uncalibrated',
            cls: 'bg-amber-50 text-amber-900 border-amber-300',
          }
        : {
            text: 'Pending Philippine Calibration',
            cls: 'bg-slate-100 text-slate-700 border-slate-300',
          };

  const mlvStatusBadge =
    settings.mlvConfig.calibrationStatus === 'calibrated'
      ? {
          text: 'Calibrated',
          cls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        }
      : settings.mlvConfig.allowExperimentalEvaluation
        ? {
            text: 'Experimental / Uncalibrated',
            cls: 'bg-amber-50 text-amber-900 border-amber-300',
          }
        : {
            text: 'Pending Calibration',
            cls: 'bg-slate-100 text-slate-700 border-slate-300',
          };

  const mlStatusBadge =
    settings.mlConfig.calibrationStatus === 'calibrated'
      ? {
          text: 'Calibrated',
          cls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        }
      : settings.mlConfig.allowExperimentalEvaluation
        ? {
            text: 'Experimental / Uncalibrated',
            cls: 'bg-amber-50 text-amber-900 border-amber-300',
          }
        : {
            text: 'Pending Calibration',
            cls: 'bg-slate-100 text-slate-700 border-slate-300',
          };

  const mlvStationCorrectionEntries = Object.entries(
    settings.mlvConfig.stationCorrections
  ).sort(([a], [b]) => a.localeCompare(b));

  const mlStationCorrectionEntries = Object.entries(
    settings.mlConfig.stationCorrections
  ).sort(([a], [b]) => a.localeCompare(b));

  const handleApplyMlvTableText = (raw: string) => {
    setMlvTableDraft(raw);
    const parsed = parseMlvAttenuationTableText(raw);
    if (!parsed.ok) {
      setMlvTableError(parsed.error);
      return;
    }
    const candidateConfig = {
      ...settings.mlvConfig,
      attenuationTable: parsed.nodes,
      minDistanceKm:
        parsed.nodes.length >= 2 ? parsed.nodes[0].distanceKm : null,
      maxDistanceKm:
        parsed.nodes.length >= 2
          ? parsed.nodes[parsed.nodes.length - 1].distanceKm
          : null,
    };
    const check = parsed.nodes.length === 0 ? { valid: true, errors: [] } : validateMlvCalibrationProfile(candidateConfig);
    if (!check.valid) {
      setMlvTableError(check.errors[0] ?? 'Invalid attenuation curve.');
      return;
    }
    setMlvTableError(null);
    lastCommittedMlvTableRef.current = formatMlvAttenuationTableText(
      candidateConfig.attenuationTable
    );
    onChangeSettings({
      ...settings,
      mlvConfig: candidateConfig,
    });
  };

  const handleLoadSeiscompMlvReference = () => {
    const ref = structuredClone(SEISCOMP_REFERENCE_MLV_PROFILE);
    const formatted = formatMlvAttenuationTableText(ref.attenuationTable);
    lastCommittedMlvTableRef.current = formatted;
    setMlvTableDraft(formatted);
    setMlvTableError(null);
    onChangeSettings({
      ...settings,
      mlvConfig: {
        ...ref,
        stationCorrections: { ...settings.mlvConfig.stationCorrections },
      },
    });
  };

  const handleClearMlvProfile = () => {
    const def = structuredClone(DEFAULT_MLV_CONFIG);
    lastCommittedMlvTableRef.current = '';
    setMlvTableDraft('');
    setMlvTableError(null);
    onChangeSettings({
      ...settings,
      mlvConfig: def,
    });
  };

  const handleAddMlvStationCorrection = () => {
    const key = newMlvStationKey.trim().toUpperCase();
    const val = Number(newMlvStationCorrection);
    if (!key || !/^[A-Z0-9_.-]{2,20}$/.test(key) || !Number.isFinite(val)) return;
    onChangeSettings({
      ...settings,
      mlvConfig: {
        ...settings.mlvConfig,
        stationCorrections: {
          ...settings.mlvConfig.stationCorrections,
          [key]: Number(val.toFixed(3)),
        },
      },
    });
    setNewMlvStationKey('');
    setNewMlvStationCorrection('0.00');
  };

  const handleRemoveMlvStationCorrection = (key: string) => {
    const next = { ...settings.mlvConfig.stationCorrections };
    delete next[key];
    onChangeSettings({
      ...settings,
      mlvConfig: {
        ...settings.mlvConfig,
        stationCorrections: next,
      },
    });
  };

  const handleApplyMlTableText = (raw: string) => {
    setMlTableDraft(raw);
    const parsed = parseMlAttenuationTableText(raw);
    if (!parsed.ok) {
      setMlTableError(parsed.error);
      return;
    }
    const candidateConfig = {
      ...settings.mlConfig,
      attenuationTable: parsed.nodes,
      minDistanceKm:
        parsed.nodes.length >= 2 ? parsed.nodes[0].distanceKm : null,
      maxDistanceKm:
        parsed.nodes.length >= 2
          ? parsed.nodes[parsed.nodes.length - 1].distanceKm
          : null,
    };
    const check =
      parsed.nodes.length === 0
        ? { valid: true, errors: [] }
        : validateMlCalibrationProfile(candidateConfig);
    if (!check.valid) {
      setMlTableError(check.errors[0] ?? 'Invalid attenuation curve.');
      return;
    }
    setMlTableError(null);
    lastCommittedMlTableRef.current = formatMlAttenuationTableText(
      candidateConfig.attenuationTable
    );
    onChangeSettings({
      ...settings,
      mlConfig: candidateConfig,
    });
  };

  const handleLoadSeiscompMlReference = () => {
    const ref = structuredClone(SEISCOMP_REFERENCE_ML_PROFILE);
    const formatted = formatMlAttenuationTableText(ref.attenuationTable);
    lastCommittedMlTableRef.current = formatted;
    setMlTableDraft(formatted);
    setMlTableError(null);
    onChangeSettings({
      ...settings,
      mlConfig: {
        ...ref,
        stationCorrections: { ...settings.mlConfig.stationCorrections },
      },
    });
  };

  const handleClearMlProfile = () => {
    const def = structuredClone(DEFAULT_ML_CONFIG);
    lastCommittedMlTableRef.current = '';
    setMlTableDraft('');
    setMlTableError(null);
    onChangeSettings({
      ...settings,
      mlConfig: def,
    });
  };

  const handleAddMlStationCorrection = () => {
    const key = newMlStationKey.trim().toUpperCase();
    const val = Number(newMlStationCorrection);
    if (!key || !/^[A-Z0-9_.-]{2,20}$/.test(key) || !Number.isFinite(val)) return;
    onChangeSettings({
      ...settings,
      mlConfig: {
        ...settings.mlConfig,
        stationCorrections: {
          ...settings.mlConfig.stationCorrections,
          [key]: Number(val.toFixed(3)),
        },
      },
    });
    setNewMlStationKey('');
    setNewMlStationCorrection('0.00');
  };

  const handleRemoveMlStationCorrection = (key: string) => {
    const next = { ...settings.mlConfig.stationCorrections };
    delete next[key];
    onChangeSettings({
      ...settings,
      mlConfig: {
        ...settings.mlConfig,
        stationCorrections: next,
      },
    });
  };

  return (
    <div className="space-y-4">
      <section className="card bg-[#fdf2f4] border border-rose-700/60 rounded-lg overflow-hidden shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
        <div className="px-4 py-3 bg-[#fae0e5]/85 border-b border-rose-800/50 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-rose-700 shrink-0" />
            <div>
              <h2 className="text-base font-bold text-blue-700 [text-shadow:0_0_8px_rgba(249,115,22,0.7),0_0_18px_rgba(251,146,60,0.45)]">
                Magnitude Configuration
              </h2>
              <p className="text-xs text-slate-600">
                Configure default magnitude method, enabled scales, network aggregation, and fallback behavior. Preferences persist locally across sessions.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onResetDefaults}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-rose-800/55 bg-white text-xs font-medium text-slate-800 hover:bg-rose-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Defaults
            </button>
            <button
              type="button"
              onClick={onReturnToDataTab}
              className="px-3 py-1.5 rounded-md border border-rose-800/55 bg-white text-xs font-medium text-slate-800 hover:bg-rose-50"
            >
              Return to Data Tab
            </button>
          </div>
        </div>

        <div className="p-4 grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* A. Default Magnitude Method & C. Network Aggregation & D. Unavailable Behavior */}
          <div className="lg:col-span-6 space-y-4">
            <div className="sub-card bg-[#fae0e5]/80 border border-rose-800/55 rounded-lg p-3.5 space-y-2">
              <label
                htmlFor="magnitude-default-method-select"
                className="block text-xs font-semibold text-slate-900"
              >
                A. Default Magnitude Method
              </label>
              <select
                id="magnitude-default-method-select"
                value={settings.defaultMethod}
                onChange={(e) =>
                  handleDefaultMethodChange(e.target.value as MagnitudeAlgorithmId)
                }
                className="w-full px-3 py-2 text-xs font-medium bg-white border border-rose-800/55 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {DEFAULT_DROPDOWN_IDS.map((id) => {
                  const desc = algorithmById.get(id)!;
                  return (
                    <option key={id} value={id} disabled={!desc.implemented}>
                      {desc.implemented
                        ? desc.displayName
                        : `${desc.displayName} (Not Yet Implemented)`}
                    </option>
                  );
                })}
              </select>
              {activeDefaultDesc && (
                <div className="rounded-md bg-[#f5cfd7] border border-rose-800/55 p-2.5 text-[11px] text-slate-800 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">
                      {activeDefaultDesc.scientificLabel}
                    </span>
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white border border-rose-800/45 text-slate-700 tabular-nums">
                      {activeDefaultDesc.id === 'md-duration'
                        ? settings.mdConfig.algorithmVersion
                        : activeDefaultDesc.id === 'mlv-vertical'
                          ? settings.mlvConfig.algorithmVersion
                          : activeDefaultDesc.id === 'ml-local'
                            ? settings.mlConfig.algorithmVersion
                            : activeDefaultDesc.version}
                    </span>
                  </div>
                  <p className="text-slate-700 leading-relaxed">
                    {activeDefaultDesc.description}
                  </p>
                </div>
              )}
            </div>

            {/* C. Network Magnitude Aggregation */}
            <div className="sub-card bg-[#fae0e5]/80 border border-rose-800/55 rounded-lg p-3.5 space-y-2">
              <div className="text-xs font-semibold text-slate-900">
                C. Network Magnitude Aggregation (New Algorithms)
              </div>
              <p className="text-[11px] text-slate-600">
                Applied only to valid contributing station magnitudes in new algorithms (e.g., Md, MLv, ML). EQP Legacy Ms retains its existing K·σ outlier-filtered mean behavior.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {(
                  [
                    {
                      id: 'median',
                      label: 'Median',
                      tag: 'Recommended',
                      detail: 'Robust against single-station outliers',
                    },
                    {
                      id: 'arithmetic_mean',
                      label: 'Arithmetic Mean',
                      tag: null,
                      detail: 'Equal-weight average of valid stations',
                    },
                    {
                      id: 'trimmed_mean',
                      label: 'Trimmed Mean',
                      tag: '10% Symmetric',
                      detail: 'Drops 10% tails (N ≥ 10; arithmetic mean if N < 10)',
                    },
                  ] as ReadonlyArray<{
                    id: NetworkAggregationMethod;
                    label: string;
                    tag: string | null;
                    detail: string;
                  }>
                ).map((opt) => {
                  const selected = settings.networkAggregation === opt.id;
                  return (
                    <label
                      key={opt.id}
                      className={`p-2.5 rounded-md border cursor-pointer transition-colors ${
                        selected
                          ? 'border-blue-700 bg-[#dbeafe]'
                          : 'border-rose-800/55 bg-[#f5cfd7] hover:bg-[#efc2cc]'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="networkMagnitudeAggregation"
                          checked={selected}
                          onChange={() =>
                            onChangeSettings({
                              ...settings,
                              networkAggregation: opt.id,
                            })
                          }
                          className="accent-blue-600"
                        />
                        <span className="text-xs font-semibold text-slate-900">
                          {opt.label}
                        </span>
                      </div>
                      {opt.tag && (
                        <div className="mt-1 pl-5">
                          <span className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-900 border border-blue-400">
                            {opt.tag}
                          </span>
                        </div>
                      )}
                      <p className="mt-1 pl-5 text-[10.5px] text-slate-700 leading-snug">
                        {opt.detail}
                      </p>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* D. Unavailable Magnitude Behavior */}
            <div className="sub-card bg-[#fae0e5]/80 border border-rose-800/55 rounded-lg p-3.5 space-y-2">
              <div className="text-xs font-semibold text-slate-900">
                D. Unavailable Magnitude Behavior
              </div>
              <label className="flex items-start gap-2.5 p-3 rounded-md border border-rose-800/55 bg-[#f5cfd7] cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.suggestAlternativeIfUnavailable}
                  onChange={(e) =>
                    onChangeSettings({
                      ...settings,
                      suggestAlternativeIfUnavailable: e.target.checked,
                    })
                  }
                  className="mt-0.5 w-4 h-4 accent-blue-600 rounded cursor-pointer shrink-0"
                />
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-slate-900">
                    Suggest alternative magnitude if default is unavailable.
                  </div>
                  <p className="text-[11px] text-slate-700">
                    When enabled, if the preferred method cannot produce a valid magnitude, EQP suggests an available alternative for analyst review without silently overriding the bulletin magnitude.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* B. Enabled Magnitude Algorithms */}
          <div className="lg:col-span-6 sub-card bg-[#fae0e5]/80 border border-rose-800/55 rounded-lg p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-xs font-semibold text-slate-900">
                  B. Enabled Magnitude Algorithms
                </div>
                <p className="text-[11px] text-slate-600">
                  Selected operational algorithms are evaluated during PLOT and Recalculate Magnitude for events using Global Settings (events with a per-event custom selection keep their own list). Future algorithms remain disabled.
                </p>
              </div>
            </div>

            <div className="border border-rose-800/55 rounded-md divide-y divide-rose-800/20 overflow-hidden bg-white">
              {ENABLED_CHECKBOX_IDS.map((id, idx) => {
                const desc = algorithmById.get(id)!;
                const isEnabled =
                  desc.implemented && settings.enabledMethods.includes(id);
                const isDefault = settings.defaultMethod === id;
                return (
                  <label
                    key={id}
                    className={`flex items-start justify-between gap-3 px-3 py-2.5 text-xs ${
                      desc.implemented
                        ? `cursor-pointer ${
                            idx % 2 === 0
                              ? 'bg-[#ffffff] hover:bg-[#dbeafe]'
                              : 'bg-[#fdf0f3] hover:bg-[#dbeafe]'
                          }`
                        : 'opacity-70 bg-[#f6e8ec] cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={isEnabled}
                        disabled={!desc.implemented || isDefault}
                        onChange={() => handleToggleAlgorithm(id)}
                        className="mt-0.5 w-4 h-4 accent-blue-600 rounded cursor-pointer disabled:cursor-not-allowed shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold text-slate-900">
                            {desc.shortName}
                          </span>
                          <span className="text-slate-500 font-normal">
                            — {desc.scientificLabel}
                          </span>
                          {isDefault && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200">
                              Default
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {desc.inputRequirements}
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0">
                      {desc.implemented ? (
                        id === 'md-duration' ? (
                          <span
                            className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded border ${mdStatusBadge.cls}`}
                          >
                            {mdStatusBadge.text}
                          </span>
                        ) : id === 'mlv-vertical' ? (
                          <span
                            className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded border ${mlvStatusBadge.cls}`}
                          >
                            {mlvStatusBadge.text}
                          </span>
                        ) : id === 'ml-local' ? (
                          <span
                            className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded border ${mlStatusBadge.cls}`}
                          >
                            {mlStatusBadge.text}
                          </span>
                        ) : (
                          <span className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-emerald-50 text-emerald-800 border-emerald-200">
                            Operational
                          </span>
                        )
                      ) : (
                        <span className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-slate-100 text-slate-600 border-slate-200">
                          Not Yet Implemented
                        </span>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Expandable Advanced Magnitude Settings */}
      <section className="card bg-[#f1f4f9] border border-slate-600/70 rounded-lg overflow-hidden shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          aria-expanded={advancedOpen}
          className="w-full px-4 py-3 bg-[#dfe6f0]/85 flex items-center justify-between gap-3 text-left hover:bg-[#d3dde9] transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-blue-700" />
            <div>
              <h3 className="text-base font-bold text-blue-700 [text-shadow:0_0_8px_rgba(249,115,22,0.7),0_0_18px_rgba(251,146,60,0.45)]">
                Advanced Magnitude Settings &amp; Calibration Profiles (Md, MLv &amp; ML)
              </h3>
              <p className="text-xs text-slate-600">
                Configure Md regression coefficients, independent MLv and horizontal ML attenuation curves log10(A0(Δ)), horizontal combination policies, station corrections (Cs), distance/depth bounds, and EQP Legacy K·σ outlier threshold
              </p>
            </div>
          </div>
          <div className="sub-card flex items-center gap-2 shrink-0 px-2.5 py-1 rounded bg-[#cfd9e8] border border-slate-700/55 text-[11px] font-semibold text-slate-800">
            <span>Md: {mdStatusBadge.text}</span>
            <span aria-hidden="true">·</span>
            <span>MLv: {mlvStatusBadge.text}</span>
            <span aria-hidden="true">·</span>
            <span>ML: {mlStatusBadge.text}</span>
            {advancedOpen ? (
              <ChevronDown className="w-4 h-4 text-slate-700" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-700" />
            )}
          </div>
        </button>

        {advancedOpen && (
          <div className="p-4 border-t border-slate-700/55 space-y-5 bg-[#e6ecf5]">
            {/* Calibration Provenance Banner */}
            <div className="sub-card rounded-md border border-amber-800/60 bg-[#f5e3be] px-3 py-2.5 flex items-start gap-2.5 text-xs text-amber-950">
              <AlertTriangle className="w-4 h-4 text-amber-800 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-semibold">
                  Philippine Md Calibration Notice
                </div>
                <p className="text-[11px] leading-relaxed">
                  EQP does not fabricate official Philippine Md regression coefficients. Keep calibration status as{' '}
                  <strong>{formatCalibrationStatusLabel(settings.mdConfig.calibrationStatus)}</strong>{' '}
                  until an institutional calibration study provides validated coefficients. Experimental values must be explicitly enabled below and confirmed before bulletin release.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Profile Metadata & Limits */}
              <div className="lg:col-span-6 sub-card bg-[#dce6f4] border border-slate-700/60 rounded-md p-3.5 space-y-3">
                <div className="text-xs font-semibold text-slate-900">
                  Md Calibration Profile Metadata &amp; Applicability
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label
                      htmlFor="md-profile-id"
                      className="block text-[11px] font-medium text-slate-700 mb-1"
                    >
                      Calibration Profile ID
                    </label>
                    <input
                      id="md-profile-id"
                      type="text"
                      value={settings.mdConfig.profileId}
                      onChange={(e) =>
                        onChangeSettings({
                          ...settings,
                          mdConfig: {
                            ...settings.mdConfig,
                            profileId: e.target.value,
                          },
                        })
                      }
                      className="w-full px-2.5 py-1.5 font-mono text-xs bg-white border border-slate-600/60 rounded-md"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="md-algorithm-version"
                      className="block text-[11px] font-medium text-slate-700 mb-1"
                    >
                      Algorithm Version
                    </label>
                    <input
                      id="md-algorithm-version"
                      type="text"
                      value={settings.mdConfig.algorithmVersion}
                      onChange={(e) =>
                        onChangeSettings({
                          ...settings,
                          mdConfig: {
                            ...settings.mdConfig,
                            algorithmVersion: e.target.value,
                          },
                        })
                      }
                      className="w-full px-2.5 py-1.5 font-mono text-xs bg-white border border-slate-600/60 rounded-md"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label
                      htmlFor="md-calibration-status"
                      className="block text-[11px] font-medium text-slate-700 mb-1"
                    >
                      Calibration Status
                    </label>
                    <select
                      id="md-calibration-status"
                      value={settings.mdConfig.calibrationStatus}
                      onChange={(e) =>
                        onChangeSettings({
                          ...settings,
                          mdConfig: {
                            ...settings.mdConfig,
                            calibrationStatus: e.target.value as
                              | 'pending_calibration'
                              | 'experimental_uncalibrated'
                              | 'calibrated',
                          },
                        })
                      }
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-600/60 rounded-md bg-white"
                    >
                      <option value="pending_calibration">
                        Pending Calibration (Blocked by default)
                      </option>
                      <option value="experimental_uncalibrated">
                        Experimental / Uncalibrated
                      </option>
                      <option value="calibrated">
                        Calibrated (Verified Institutional Profile)
                      </option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="md-regional-app"
                      className="block text-[11px] font-medium text-slate-700 mb-1"
                    >
                      Regional Applicability
                    </label>
                    <input
                      id="md-regional-app"
                      type="text"
                      value={settings.mdConfig.regionalApplicability}
                      onChange={(e) =>
                        onChangeSettings({
                          ...settings,
                          mdConfig: {
                            ...settings.mdConfig,
                            regionalApplicability: e.target.value,
                          },
                        })
                      }
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-600/60 rounded-md"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                  <div>
                    <label
                      htmlFor="md-min-dist"
                      className="block text-[11px] font-medium text-slate-700 mb-1"
                    >
                      Min Δ (km)
                    </label>
                    <input
                      id="md-min-dist"
                      type="number"
                      min={0}
                      value={settings.mdConfig.minDistanceKm}
                      onChange={(e) =>
                        onChangeSettings({
                          ...settings,
                          mdConfig: {
                            ...settings.mdConfig,
                            minDistanceKm: Math.max(0, Number(e.target.value) || 0),
                          },
                        })
                      }
                      className="w-full px-2 py-1 font-mono text-xs bg-white border border-slate-600/60 rounded-md"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="md-max-dist"
                      className="block text-[11px] font-medium text-slate-700 mb-1"
                    >
                      Max Δ (km)
                    </label>
                    <input
                      id="md-max-dist"
                      type="number"
                      min={1}
                      value={settings.mdConfig.maxDistanceKm}
                      onChange={(e) =>
                        onChangeSettings({
                          ...settings,
                          mdConfig: {
                            ...settings.mdConfig,
                            maxDistanceKm: Math.max(1, Number(e.target.value) || 1000),
                          },
                        })
                      }
                      className="w-full px-2 py-1 font-mono text-xs bg-white border border-slate-600/60 rounded-md"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="md-min-depth"
                      className="block text-[11px] font-medium text-slate-700 mb-1"
                    >
                      Min h (km)
                    </label>
                    <input
                      id="md-min-depth"
                      type="number"
                      min={0}
                      value={settings.mdConfig.minDepthKm}
                      onChange={(e) =>
                        onChangeSettings({
                          ...settings,
                          mdConfig: {
                            ...settings.mdConfig,
                            minDepthKm: Math.max(0, Number(e.target.value) || 0),
                          },
                        })
                      }
                      className="w-full px-2 py-1 font-mono text-xs bg-white border border-slate-600/60 rounded-md"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="md-max-depth"
                      className="block text-[11px] font-medium text-slate-700 mb-1"
                    >
                      Max h (km)
                    </label>
                    <input
                      id="md-max-depth"
                      type="number"
                      min={1}
                      value={settings.mdConfig.maxDepthKm}
                      onChange={(e) =>
                        onChangeSettings({
                          ...settings,
                          mdConfig: {
                            ...settings.mdConfig,
                            maxDepthKm: Math.max(1, Number(e.target.value) || 700),
                          },
                        })
                      }
                      className="w-full px-2 py-1 font-mono text-xs bg-white border border-slate-600/60 rounded-md"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 space-y-2 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.mdConfig.allowExperimentalEvaluation}
                      onChange={(e) =>
                        onChangeSettings({
                          ...settings,
                          mdConfig: {
                            ...settings.mdConfig,
                            allowExperimentalEvaluation: e.target.checked,
                          },
                        })
                      }
                      className="w-4 h-4 accent-amber-600 rounded"
                    />
                    <span className="font-medium text-slate-800">
                      Allow experimental Md evaluation with analyst-entered coefficients
                    </span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.mdConfig.requireVerifiedDuration}
                      onChange={(e) =>
                        onChangeSettings({
                          ...settings,
                          mdConfig: {
                            ...settings.mdConfig,
                            requireVerifiedDuration: e.target.checked,
                          },
                        })
                      }
                      className="w-4 h-4 accent-blue-600 rounded"
                    />
                    <span className="font-medium text-slate-800">
                      Require verified coda duration (reject S−P proxy or unverified durations)
                    </span>
                  </label>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <label
                      htmlFor="legacy-variance-k"
                      className="font-medium text-slate-800"
                    >
                      EQP Legacy Ms Outlier Rejection (K·σ)
                    </label>
                    <p className="text-[11px] text-slate-500">
                      Controls standard deviation threshold used by EQP Legacy duration magnitude filter
                    </p>
                  </div>
                  <input
                    id="legacy-variance-k"
                    type="number"
                    step="0.1"
                    min="0.5"
                    max="5"
                    value={settings.legacyVarianceK}
                    onChange={(e) => {
                      const nextK = Number(e.target.value);
                      if (Number.isFinite(nextK) && nextK > 0) {
                        onChangeSettings({
                          ...settings,
                          legacyVarianceK: nextK,
                        });
                      }
                    }}
                    className="w-20 px-2 py-1 font-mono text-xs text-right bg-white border border-slate-600/60 rounded-md"
                  />
                </div>
              </div>

              {/* Editable Md Coefficients & Station Corrections */}
              <div className="lg:col-span-6 sub-card bg-[#dce6f4] border border-slate-700/60 rounded-md p-3.5 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold text-slate-900">
                      Md Equation Coefficients: Md = a + b·log10(T) + c·T + d·Δ + e·h + Cs
                    </div>
                    <p className="text-[11px] text-slate-500">
                      T in seconds, Δ (epicentral distance) in km, h (focal depth) in km, Cs station correction.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onChangeSettings({
                        ...settings,
                        mdConfig: { ...DEFAULT_MD_CONFIG },
                      })
                    }
                    className="text-[11px] font-medium text-slate-600 hover:text-slate-900 underline shrink-0"
                  >
                    Clear Profile
                  </button>
                </div>

                <div className="grid grid-cols-5 gap-2 text-xs">
                  {(
                    [
                      { key: 'a', label: 'a (offset)' },
                      { key: 'b', label: 'b·log10(T)' },
                      { key: 'c', label: 'c·T' },
                      { key: 'd', label: 'd·Δ (km)' },
                      { key: 'e', label: 'e·h (km)' },
                    ] as const
                  ).map((item) => (
                    <div key={item.key}>
                      <label
                        htmlFor={`md-coeff-${item.key}`}
                        className="block text-[10.5px] font-medium text-slate-700 mb-1"
                      >
                        {item.label}
                      </label>
                      <input
                        id={`md-coeff-${item.key}`}
                        type="number"
                        step="0.0001"
                        placeholder="—"
                        value={settings.mdConfig.coefficients[item.key] ?? ''}
                        onChange={(e) => handleCoeffChange(item.key, e.target.value)}
                        className="w-full px-2 py-1 font-mono text-xs bg-white border border-slate-600/60 rounded-md"
                      />
                    </div>
                  ))}
                </div>

                <div className="pt-3 border-t border-slate-200 space-y-2">
                  <div className="text-xs font-semibold text-slate-900">
                    Station Corrections (Cs)
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="STA (e.g. TGY)"
                      value={newStationCode}
                      onChange={(e) =>
                        setNewStationCode(e.target.value.toUpperCase().slice(0, 6))
                      }
                      aria-label="Station code for Cs correction"
                      className="w-28 px-2 py-1 text-xs font-mono uppercase bg-white border border-slate-600/60 rounded-md"
                    />
                    <input
                      type="number"
                      step="0.01"
                      value={newStationCorrection}
                      onChange={(e) => setNewStationCorrection(e.target.value)}
                      aria-label="Station correction Cs value"
                      className="w-24 px-2 py-1 text-xs font-mono bg-white border border-slate-600/60 rounded-md"
                    />
                    <button
                      type="button"
                      onClick={handleAddStationCorrection}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-600/60 bg-white hover:bg-slate-100 text-xs font-medium text-slate-800"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Cs
                    </button>
                  </div>

                  {stationCorrectionEntries.length === 0 ? (
                    <div className="text-[11px] text-slate-500 italic">
                      No per-station Cs corrections configured (defaults to 0.00).
                    </div>
                  ) : (
                    <div className="max-h-32 overflow-y-auto border border-slate-700/55 rounded-md divide-y divide-slate-300 text-xs bg-white">
                      {stationCorrectionEntries.map(([code, csVal], idx) => (
                        <div
                          key={code}
                          className={`px-2.5 py-1 flex items-center justify-between font-mono ${
                            idx % 2 === 0
                              ? 'bg-[#ffffff] hover:bg-[#dbeafe]'
                              : 'bg-[#e8eff9] hover:bg-[#dbeafe]'
                          }`}
                        >
                          <span className="font-semibold text-slate-900">{code}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-slate-700">
                              {csVal >= 0 ? `+${csVal.toFixed(3)}` : csVal.toFixed(3)}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveStationCorrection(code)}
                              aria-label={`Remove station correction ${code}`}
                              className="text-slate-500 hover:text-rose-600"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* MLv Calibration & Attenuation Curve Section */}
            <div className="pt-4 border-t border-slate-700/45 space-y-4">
              <div className="sub-card rounded-md border border-amber-800/60 bg-[#f5e3be] px-3 py-2.5 flex items-start gap-2.5 text-xs text-amber-950">
                <AlertTriangle className="w-4 h-4 text-amber-800 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-semibold">
                    MLv Calibration &amp; Attenuation Notice — MLv = log10(A_mm) − log10(A0(Δ)) + Cs
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    Official Philippine MLv attenuation curves are pending institutional calibration. Keep status as{' '}
                    <strong>{formatCalibrationStatusLabel(settings.mlvConfig.calibrationStatus)}</strong>{' '}
                    unless using a verified regional profile. You may load the SeisComP reference example strictly for experimental testing (blocked from authoritative release until confirmed by analyst).
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* MLv Profile Metadata, Bounds & Policy */}
                <div className="lg:col-span-6 sub-card bg-[#dce6f4] border border-slate-700/60 rounded-md p-3.5 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-slate-900">
                      MLv Calibration Profile Metadata &amp; Rules
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleLoadSeiscompMlvReference}
                        className="px-2 py-1 rounded border border-amber-300 bg-amber-50 hover:bg-amber-100 text-[11px] font-medium text-amber-950 whitespace-nowrap"
                      >
                        Load SeisComP Reference Example (Experimental)
                      </button>
                      <button
                        type="button"
                        onClick={handleClearMlvProfile}
                        className="text-[11px] font-medium text-slate-600 hover:text-slate-900 underline whitespace-nowrap"
                      >
                        Clear MLv
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label
                        htmlFor="mlv-profile-id"
                        className="block text-[11px] font-medium text-slate-700 mb-1"
                      >
                        MLv Profile ID
                      </label>
                      <input
                        id="mlv-profile-id"
                        type="text"
                        value={settings.mlvConfig.profileId}
                        onChange={(e) =>
                          onChangeSettings({
                            ...settings,
                            mlvConfig: {
                              ...settings.mlvConfig,
                              profileId: e.target.value,
                            },
                          })
                        }
                        className="w-full px-2.5 py-1.5 font-mono text-xs bg-white border border-slate-600/60 rounded-md"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="mlv-calibration-status"
                        className="block text-[11px] font-medium text-slate-700 mb-1"
                      >
                        MLv Calibration Status
                      </label>
                      <select
                        id="mlv-calibration-status"
                        value={settings.mlvConfig.calibrationStatus}
                        onChange={(e) =>
                          onChangeSettings({
                            ...settings,
                            mlvConfig: {
                              ...settings.mlvConfig,
                              calibrationStatus: e.target.value as
                                | 'pending_calibration'
                                | 'experimental_uncalibrated'
                                | 'calibrated',
                            },
                          })
                        }
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-600/60 rounded-md bg-white"
                      >
                        <option value="pending_calibration">
                          Pending Calibration (Blocked by default)
                        </option>
                        <option value="experimental_uncalibrated">
                          Experimental / Uncalibrated
                        </option>
                        <option value="calibrated">
                          Calibrated (Verified Institutional Profile)
                        </option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label
                        htmlFor="mlv-regional-app"
                        className="block text-[11px] font-medium text-slate-700 mb-1"
                      >
                        Regional Applicability
                      </label>
                      <input
                        id="mlv-regional-app"
                        type="text"
                        value={settings.mlvConfig.regionalApplicability}
                        onChange={(e) =>
                          onChangeSettings({
                            ...settings,
                            mlvConfig: {
                              ...settings.mlvConfig,
                              regionalApplicability: e.target.value,
                            },
                          })
                        }
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-600/60 rounded-md"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="mlv-convention-select"
                        className="block text-[11px] font-medium text-slate-700 mb-1"
                      >
                        Expected Amplitude Convention
                      </label>
                      <select
                        id="mlv-convention-select"
                        value={settings.mlvConfig.expectedConvention}
                        onChange={(e) =>
                          onChangeSettings({
                            ...settings,
                            mlvConfig: {
                              ...settings.mlvConfig,
                              expectedConvention: e.target
                                .value as MlvAmplitudeConvention,
                            },
                          })
                        }
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-600/60 rounded-md bg-white"
                      >
                        <option value="zero_to_peak">
                          Zero-to-Peak (Standard)
                        </option>
                        <option value="peak_to_peak">Peak-to-Peak</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                    <div>
                      <label
                        htmlFor="mlv-min-dist"
                        className="block text-[11px] font-medium text-slate-700 mb-1"
                      >
                        Min Δ (km)
                      </label>
                      <input
                        id="mlv-min-dist"
                        type="number"
                        min={0}
                        placeholder="auto"
                        value={settings.mlvConfig.minDistanceKm ?? ''}
                        onChange={(e) => {
                          const raw = e.target.value.trim();
                          onChangeSettings({
                            ...settings,
                            mlvConfig: {
                              ...settings.mlvConfig,
                              minDistanceKm:
                                raw === '' ? null : Math.max(0, Number(raw) || 0),
                            },
                          });
                        }}
                        className="w-full px-2 py-1 font-mono tabular-nums text-xs bg-white border border-slate-600/60 rounded-md"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="mlv-max-dist"
                        className="block text-[11px] font-medium text-slate-700 mb-1"
                      >
                        Max Δ (km)
                      </label>
                      <input
                        id="mlv-max-dist"
                        type="number"
                        min={1}
                        placeholder="auto"
                        value={settings.mlvConfig.maxDistanceKm ?? ''}
                        onChange={(e) => {
                          const raw = e.target.value.trim();
                          onChangeSettings({
                            ...settings,
                            mlvConfig: {
                              ...settings.mlvConfig,
                              maxDistanceKm:
                                raw === '' ? null : Math.max(1, Number(raw) || 1000),
                            },
                          });
                        }}
                        className="w-full px-2 py-1 font-mono tabular-nums text-xs bg-white border border-slate-600/60 rounded-md"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="mlv-min-stations"
                        className="block text-[11px] font-medium text-slate-700 mb-1"
                      >
                        Min Stations
                      </label>
                      <input
                        id="mlv-min-stations"
                        type="number"
                        min={1}
                        value={settings.mlvConfig.minContributingStations}
                        onChange={(e) =>
                          onChangeSettings({
                            ...settings,
                            mlvConfig: {
                              ...settings.mlvConfig,
                              minContributingStations: Math.max(
                                1,
                                Math.trunc(Number(e.target.value) || 1)
                              ),
                            },
                          })
                        }
                        className="w-full px-2 py-1 font-mono tabular-nums text-xs bg-white border border-slate-600/60 rounded-md"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="mlv-dist-metric"
                        className="block text-[11px] font-medium text-slate-700 mb-1"
                      >
                        Distance Metric
                      </label>
                      <select
                        id="mlv-dist-metric"
                        value={settings.mlvConfig.distanceMetric}
                        onChange={(e) =>
                          onChangeSettings({
                            ...settings,
                            mlvConfig: {
                              ...settings.mlvConfig,
                              distanceMetric: e.target.value as MlvDistanceMetric,
                            },
                          })
                        }
                        className="w-full px-2 py-1 text-xs border border-slate-600/60 rounded-md bg-white"
                      >
                        <option value="epicentral_km">Epicentral Δ</option>
                        <option value="hypocentral_km">Hypocentral R</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
                    <div>
                      <label
                        htmlFor="mlv-selection-policy"
                        className="block text-[11px] font-medium text-slate-700 mb-1"
                      >
                        Multi-Measurement Station Policy
                      </label>
                      <select
                        id="mlv-selection-policy"
                        value={settings.mlvConfig.stationSelectionPolicy}
                        onChange={(e) =>
                          onChangeSettings({
                            ...settings,
                            mlvConfig: {
                              ...settings.mlvConfig,
                              stationSelectionPolicy: e.target
                                .value as MlvStationSelectionPolicy,
                            },
                          })
                        }
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-600/60 rounded-md bg-white"
                      >
                        <option value="deterministic_priority">
                          Deterministic Channel Priority (HHZ &gt; BHZ &gt; SHZ)
                        </option>
                        <option value="reject_ambiguous">
                          Reject Station if Multiple Active Records
                        </option>
                      </select>
                    </div>
                    <div className="flex items-end pb-1">
                      <label className="flex items-center gap-2 cursor-pointer text-xs">
                        <input
                          type="checkbox"
                          checked={settings.mlvConfig.allowExperimentalEvaluation}
                          onChange={(e) =>
                            onChangeSettings({
                              ...settings,
                              mlvConfig: {
                                ...settings.mlvConfig,
                                allowExperimentalEvaluation: e.target.checked,
                              },
                            })
                          }
                          className="w-4 h-4 accent-amber-600 rounded"
                        />
                        <span className="font-medium text-slate-800">
                          Allow experimental MLv evaluation
                        </span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* MLv Attenuation Curve & Station Corrections */}
                <div className="lg:col-span-6 sub-card bg-[#dce6f4] border border-slate-700/60 rounded-md p-3.5 space-y-3">
                  <div>
                    <label
                      htmlFor="mlv-attenuation-table"
                      className="block text-xs font-semibold text-slate-900 mb-1"
                    >
                      Attenuation Curve Nodes (Δ km : log10(A0), comma-separated)
                    </label>
                    <textarea
                      id="mlv-attenuation-table"
                      rows={2}
                      value={mlvTableDraft}
                      placeholder="Example: 0:-1.3, 60:-2.8, 100:-3.0, 400:-4.5, 1000:-5.85"
                      onChange={(e) => handleApplyMlvTableText(e.target.value)}
                      className="w-full px-2.5 py-1.5 font-mono tabular-nums text-xs bg-white border border-slate-600/60 rounded-md"
                    />
                    {mlvTableError ? (
                      <p className="text-[11px] text-rose-700 mt-1">{mlvTableError}</p>
                    ) : !mlvProfileValidation.valid &&
                      settings.mlvConfig.attenuationTable.length > 0 ? (
                      <p className="text-[11px] text-rose-700 mt-1">
                        {mlvProfileValidation.errors[0]}
                      </p>
                    ) : (
                      <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
                        {settings.mlvConfig.attenuationTable.length >= 2
                          ? `Valid linear curve across ${mlvProfileValidation.effectiveMinDistanceKm}–${mlvProfileValidation.effectiveMaxDistanceKm} km (${settings.mlvConfig.attenuationTable.length} nodes; no extrapolation outside bounds).`
                          : 'No attenuation curve configured yet — MLv stays blocked until at least 2 ordered calibration points are entered.'}
                      </p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-200 space-y-2">
                    <div className="text-xs font-semibold text-slate-900">
                      MLv Station Corrections (+Cs in magnitude units · NET.STA.LOC / NET.STA / STA)
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="e.g. PV.TGY or TGY"
                        value={newMlvStationKey}
                        onChange={(e) =>
                          setNewMlvStationKey(e.target.value.toUpperCase().slice(0, 20))
                        }
                        aria-label="Station or NET.STA.LOC key for MLv Cs correction"
                        className="w-40 px-2 py-1 text-xs font-mono uppercase bg-white border border-slate-600/60 rounded-md"
                      />
                      <input
                        type="number"
                        step="0.01"
                        value={newMlvStationCorrection}
                        onChange={(e) => setNewMlvStationCorrection(e.target.value)}
                        aria-label="MLv station correction Cs value"
                        className="w-24 px-2 py-1 text-xs font-mono tabular-nums bg-white border border-slate-600/60 rounded-md"
                      />
                      <button
                        type="button"
                        onClick={handleAddMlvStationCorrection}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-600/60 bg-white hover:bg-slate-100 text-xs font-medium text-slate-800"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Cs
                      </button>
                    </div>

                    {mlvStationCorrectionEntries.length === 0 ? (
                      <div className="text-[11px] text-slate-500 italic">
                        No MLv station corrections configured (defaults to +0.000).
                      </div>
                    ) : (
                      <div className="max-h-28 overflow-y-auto border border-slate-700/55 rounded-md divide-y divide-slate-300 text-xs bg-white">
                        {mlvStationCorrectionEntries.map(([key, csVal], idx) => (
                          <div
                            key={key}
                            className={`px-2.5 py-1 flex items-center justify-between font-mono tabular-nums ${
                              idx % 2 === 0
                                ? 'bg-[#ffffff] hover:bg-[#dbeafe]'
                                : 'bg-[#e8eff9] hover:bg-[#dbeafe]'
                            }`}
                          >
                            <span className="font-semibold text-slate-900">{key}</span>
                            <div className="flex items-center gap-3">
                              <span className="text-slate-700">
                                {csVal >= 0 ? `+${csVal.toFixed(3)}` : csVal.toFixed(3)}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRemoveMlvStationCorrection(key)}
                                aria-label={`Remove MLv station correction ${key}`}
                                className="text-slate-500 hover:text-rose-600"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Horizontal ML Calibration, Component Combination & Attenuation Curve Section */}
            <div className="pt-4 border-t border-slate-700/45 space-y-4">
              <div className="sub-card rounded-md border border-amber-800/60 bg-[#f5e3be] px-3 py-2.5 flex items-start gap-2.5 text-xs text-amber-950">
                <AlertTriangle className="w-4 h-4 text-amber-800 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-semibold">
                    Horizontal ML Calibration &amp; Combination Notice — ML = log10(A_H) − log10(A0(Δ)) + Cs
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    Horizontal ML calibration is independent from vertical MLv. Official Philippine ML attenuation curves are pending institutional calibration — keep status as{' '}
                    <strong>{formatCalibrationStatusLabel(settings.mlConfig.calibrationStatus)}</strong>{' '}
                    unless using a verified regional profile. You may load the SeisComP ML reference example strictly for experimental testing (blocked from authoritative release until confirmed by analyst).
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* ML Profile Metadata, Component Policy & Bounds */}
                <div className="lg:col-span-6 sub-card bg-[#dce6f4] border border-slate-700/60 rounded-md p-3.5 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-slate-900">
                      ML Calibration Profile, Horizontal Policy &amp; Rules
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleLoadSeiscompMlReference}
                        className="px-2 py-1 rounded border border-amber-300 bg-amber-50 hover:bg-amber-100 text-[11px] font-medium text-amber-950 whitespace-nowrap"
                      >
                        Load SeisComP Reference Example (Experimental)
                      </button>
                      <button
                        type="button"
                        onClick={handleClearMlProfile}
                        className="text-[11px] font-medium text-slate-600 hover:text-slate-900 underline whitespace-nowrap"
                      >
                        Clear ML
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label
                        htmlFor="ml-profile-id"
                        className="block text-[11px] font-medium text-slate-700 mb-1"
                      >
                        ML Profile ID
                      </label>
                      <input
                        id="ml-profile-id"
                        type="text"
                        value={settings.mlConfig.profileId}
                        onChange={(e) =>
                          onChangeSettings({
                            ...settings,
                            mlConfig: {
                              ...settings.mlConfig,
                              profileId: e.target.value,
                            },
                          })
                        }
                        className="w-full px-2.5 py-1.5 font-mono text-xs bg-white border border-slate-600/60 rounded-md"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="ml-calibration-status"
                        className="block text-[11px] font-medium text-slate-700 mb-1"
                      >
                        ML Calibration Status
                      </label>
                      <select
                        id="ml-calibration-status"
                        value={settings.mlConfig.calibrationStatus}
                        onChange={(e) =>
                          onChangeSettings({
                            ...settings,
                            mlConfig: {
                              ...settings.mlConfig,
                              calibrationStatus: e.target.value as
                                | 'pending_calibration'
                                | 'experimental_uncalibrated'
                                | 'calibrated',
                            },
                          })
                        }
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-600/60 rounded-md bg-white"
                      >
                        <option value="pending_calibration">
                          Pending Calibration (Blocked by default)
                        </option>
                        <option value="experimental_uncalibrated">
                          Experimental / Uncalibrated
                        </option>
                        <option value="calibrated">
                          Calibrated (Verified Institutional Profile)
                        </option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label
                        htmlFor="ml-regional-app"
                        className="block text-[11px] font-medium text-slate-700 mb-1"
                      >
                        Regional Applicability
                      </label>
                      <input
                        id="ml-regional-app"
                        type="text"
                        value={settings.mlConfig.regionalApplicability}
                        onChange={(e) =>
                          onChangeSettings({
                            ...settings,
                            mlConfig: {
                              ...settings.mlConfig,
                              regionalApplicability: e.target.value,
                            },
                          })
                        }
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-600/60 rounded-md"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="ml-convention-select"
                        className="block text-[11px] font-medium text-slate-700 mb-1"
                      >
                        Expected Amplitude Convention
                      </label>
                      <select
                        id="ml-convention-select"
                        value={settings.mlConfig.expectedConvention}
                        onChange={(e) =>
                          onChangeSettings({
                            ...settings,
                            mlConfig: {
                              ...settings.mlConfig,
                              expectedConvention: e.target
                                .value as MlAmplitudeConvention,
                            },
                          })
                        }
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-600/60 rounded-md bg-white"
                      >
                        <option value="zero_to_peak">
                          Zero-to-Peak (Standard)
                        </option>
                        <option value="peak_to_peak">Peak-to-Peak</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label
                        htmlFor="ml-horizontal-combination"
                        className="block text-[11px] font-medium text-slate-700 mb-1"
                      >
                        Horizontal Amplitude Combination (A_H)
                      </label>
                      <select
                        id="ml-horizontal-combination"
                        value={settings.mlConfig.horizontalCombination}
                        onChange={(e) =>
                          onChangeSettings({
                            ...settings,
                            mlConfig: {
                              ...settings.mlConfig,
                              horizontalCombination: e.target
                                .value as MlHorizontalCombinationMethod,
                            },
                          })
                        }
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-600/60 rounded-md bg-white"
                      >
                        <option value="mean">
                          Mean Horizontal Amplitude: (A1 + A2) / 2
                        </option>
                        <option value="max">
                          Maximum Horizontal Amplitude: max(A1, A2)
                        </option>
                      </select>
                    </div>
                    <div>
                      <label
                        htmlFor="ml-required-components"
                        className="block text-[11px] font-medium text-slate-700 mb-1"
                      >
                        Required Horizontal Components
                      </label>
                      <select
                        id="ml-required-components"
                        value={String(settings.mlConfig.requiredHorizontalComponents)}
                        onChange={(e) =>
                          onChangeSettings({
                            ...settings,
                            mlConfig: {
                              ...settings.mlConfig,
                              requiredHorizontalComponents:
                                e.target.value === '1'
                                  ? (1 as MlRequiredHorizontalComponents)
                                  : (2 as MlRequiredHorizontalComponents),
                            },
                          })
                        }
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-600/60 rounded-md bg-white"
                      >
                        <option value="2">
                          2 Paired Components (N/E or verified 1/2 — Default)
                        </option>
                        <option value="1">
                          1 Component Permitted (Experimental Fallback Only)
                        </option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                    <div>
                      <label
                        htmlFor="ml-min-dist"
                        className="block text-[11px] font-medium text-slate-700 mb-1"
                      >
                        Min Δ (km)
                      </label>
                      <input
                        id="ml-min-dist"
                        type="number"
                        min={0}
                        placeholder="auto"
                        value={settings.mlConfig.minDistanceKm ?? ''}
                        onChange={(e) => {
                          const raw = e.target.value.trim();
                          onChangeSettings({
                            ...settings,
                            mlConfig: {
                              ...settings.mlConfig,
                              minDistanceKm:
                                raw === '' ? null : Math.max(0, Number(raw) || 0),
                            },
                          });
                        }}
                        className="w-full px-2 py-1 font-mono tabular-nums text-xs bg-white border border-slate-600/60 rounded-md"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="ml-max-dist"
                        className="block text-[11px] font-medium text-slate-700 mb-1"
                      >
                        Max Δ (km)
                      </label>
                      <input
                        id="ml-max-dist"
                        type="number"
                        min={1}
                        placeholder="auto"
                        value={settings.mlConfig.maxDistanceKm ?? ''}
                        onChange={(e) => {
                          const raw = e.target.value.trim();
                          onChangeSettings({
                            ...settings,
                            mlConfig: {
                              ...settings.mlConfig,
                              maxDistanceKm:
                                raw === '' ? null : Math.max(1, Number(raw) || 1000),
                            },
                          });
                        }}
                        className="w-full px-2 py-1 font-mono tabular-nums text-xs bg-white border border-slate-600/60 rounded-md"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="ml-min-stations"
                        className="block text-[11px] font-medium text-slate-700 mb-1"
                      >
                        Min Stations
                      </label>
                      <input
                        id="ml-min-stations"
                        type="number"
                        min={1}
                        value={settings.mlConfig.minContributingStations}
                        onChange={(e) =>
                          onChangeSettings({
                            ...settings,
                            mlConfig: {
                              ...settings.mlConfig,
                              minContributingStations: Math.max(
                                1,
                                Math.trunc(Number(e.target.value) || 1)
                              ),
                            },
                          })
                        }
                        className="w-full px-2 py-1 font-mono tabular-nums text-xs bg-white border border-slate-600/60 rounded-md"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="ml-dist-metric"
                        className="block text-[11px] font-medium text-slate-700 mb-1"
                      >
                        Distance Metric
                      </label>
                      <select
                        id="ml-dist-metric"
                        value={settings.mlConfig.distanceMetric}
                        onChange={(e) =>
                          onChangeSettings({
                            ...settings,
                            mlConfig: {
                              ...settings.mlConfig,
                              distanceMetric: e.target.value as MlDistanceMetric,
                            },
                          })
                        }
                        className="w-full px-2 py-1 text-xs border border-slate-600/60 rounded-md bg-white"
                      >
                        <option value="epicentral_km">Epicentral Δ</option>
                        <option value="hypocentral_km">Hypocentral R</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
                    <div>
                      <label
                        htmlFor="ml-selection-policy"
                        className="block text-[11px] font-medium text-slate-700 mb-1"
                      >
                        Multi-Pair Station Policy
                      </label>
                      <select
                        id="ml-selection-policy"
                        value={settings.mlConfig.stationSelectionPolicy}
                        onChange={(e) =>
                          onChangeSettings({
                            ...settings,
                            mlConfig: {
                              ...settings.mlConfig,
                              stationSelectionPolicy: e.target
                                .value as MlStationSelectionPolicy,
                            },
                          })
                        }
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-600/60 rounded-md bg-white"
                      >
                        <option value="deterministic_priority">
                          Deterministic Pair Priority (HH &gt; BH &gt; SH)
                        </option>
                        <option value="reject_ambiguous">
                          Reject Station if Multiple Candidate Pairs
                        </option>
                      </select>
                    </div>
                    <div className="flex items-end pb-1">
                      <label className="flex items-center gap-2 cursor-pointer text-xs">
                        <input
                          type="checkbox"
                          checked={settings.mlConfig.allowExperimentalEvaluation}
                          onChange={(e) =>
                            onChangeSettings({
                              ...settings,
                              mlConfig: {
                                ...settings.mlConfig,
                                allowExperimentalEvaluation: e.target.checked,
                              },
                            })
                          }
                          className="w-4 h-4 accent-amber-600 rounded"
                        />
                        <span className="font-medium text-slate-800">
                          Allow experimental ML evaluation
                        </span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* ML Attenuation Curve & Station Corrections */}
                <div className="lg:col-span-6 sub-card bg-[#dce6f4] border border-slate-700/60 rounded-md p-3.5 space-y-3">
                  <div>
                    <label
                      htmlFor="ml-attenuation-table"
                      className="block text-xs font-semibold text-slate-900 mb-1"
                    >
                      ML Attenuation Curve Nodes (Δ km : log10(A0), comma-separated)
                    </label>
                    <textarea
                      id="ml-attenuation-table"
                      rows={2}
                      value={mlTableDraft}
                      placeholder="Example: 0:-1.3, 60:-2.8, 100:-3.0, 400:-4.5, 1000:-5.85"
                      onChange={(e) => handleApplyMlTableText(e.target.value)}
                      className="w-full px-2.5 py-1.5 font-mono tabular-nums text-xs bg-white border border-slate-600/60 rounded-md"
                    />
                    {mlTableError ? (
                      <p className="text-[11px] text-rose-700 mt-1">{mlTableError}</p>
                    ) : !mlProfileValidation.valid &&
                      settings.mlConfig.attenuationTable.length > 0 ? (
                      <p className="text-[11px] text-rose-700 mt-1">
                        {mlProfileValidation.errors[0]}
                      </p>
                    ) : (
                      <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
                        {settings.mlConfig.attenuationTable.length >= 2
                          ? `Valid linear curve across ${mlProfileValidation.effectiveMinDistanceKm}–${mlProfileValidation.effectiveMaxDistanceKm} km (${settings.mlConfig.attenuationTable.length} nodes; no extrapolation outside bounds).`
                          : 'No ML attenuation curve configured yet — ML stays blocked until at least 2 ordered calibration points are entered.'}
                      </p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-200 space-y-2">
                    <div className="text-xs font-semibold text-slate-900">
                      ML Station Corrections (+Cs in magnitude units · NET.STA.LOC / NET.STA / STA)
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="e.g. PV.TGY.00 or TGY"
                        value={newMlStationKey}
                        onChange={(e) =>
                          setNewMlStationKey(e.target.value.toUpperCase().slice(0, 20))
                        }
                        aria-label="Station or NET.STA.LOC key for ML Cs correction"
                        className="w-40 px-2 py-1 text-xs font-mono uppercase bg-white border border-slate-600/60 rounded-md"
                      />
                      <input
                        type="number"
                        step="0.01"
                        value={newMlStationCorrection}
                        onChange={(e) => setNewMlStationCorrection(e.target.value)}
                        aria-label="ML station correction Cs value"
                        className="w-24 px-2 py-1 text-xs font-mono tabular-nums bg-white border border-slate-600/60 rounded-md"
                      />
                      <button
                        type="button"
                        onClick={handleAddMlStationCorrection}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-600/60 bg-white hover:bg-slate-100 text-xs font-medium text-slate-800"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Cs
                      </button>
                    </div>

                    {mlStationCorrectionEntries.length === 0 ? (
                      <div className="text-[11px] text-slate-500 italic">
                        No ML station corrections configured (defaults to +0.000).
                      </div>
                    ) : (
                      <div className="max-h-28 overflow-y-auto border border-slate-700/55 rounded-md divide-y divide-slate-300 text-xs bg-white">
                        {mlStationCorrectionEntries.map(([key, csVal], idx) => (
                          <div
                            key={key}
                            className={`px-2.5 py-1 flex items-center justify-between font-mono tabular-nums ${
                              idx % 2 === 0
                                ? 'bg-[#ffffff] hover:bg-[#dbeafe]'
                                : 'bg-[#e8eff9] hover:bg-[#dbeafe]'
                            }`}
                          >
                            <span className="font-semibold text-slate-900">{key}</span>
                            <div className="flex items-center gap-3">
                              <span className="text-slate-700">
                                {csVal >= 0 ? `+${csVal.toFixed(3)}` : csVal.toFixed(3)}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRemoveMlStationCorrection(key)}
                                aria-label={`Remove ML station correction ${key}`}
                                className="text-slate-500 hover:text-rose-600"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
