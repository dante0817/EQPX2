import React from 'react';
import { AlertCircle, CheckCircle2, ShieldAlert, X } from 'lucide-react';
import { getAllModelCatalogMetadata } from '../utils/travelTime/registry';
import type {
  CorrectionProfileId,
  TravelTimeModelId,
} from '../utils/travelTime/types';

interface ModelSettingsModalProps {
  open: boolean;
  onClose: () => void;
  selectedModelId: TravelTimeModelId;
  onSelectModelId: (modelId: TravelTimeModelId) => void;
  correctionProfile: CorrectionProfileId;
  onChangeCorrectionProfile: (profile: CorrectionProfileId) => void;
}

export const ModelSettingsModal: React.FC<ModelSettingsModalProps> = ({
  open,
  onClose,
  selectedModelId,
  onSelectModelId,
  correctionProfile,
  onChangeCorrectionProfile,
}) => {
  if (!open) return null;

  const catalog = getAllModelCatalogMetadata();
  const activeMeta = catalog.find((m) => m.id === selectedModelId) ?? catalog[0];

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="model-settings-title"
    >
      <div className="bg-white border border-slate-400 rounded-sm shadow-xl max-w-3xl w-full max-h-[88vh] flex flex-col overflow-hidden text-xs text-slate-900">
        <div className="px-4 py-2.5 bg-[#005a94] text-white flex items-center justify-between">
          <div>
            <h2 id="model-settings-title" className="text-sm font-bold">
              Travel-Time Model & Solver Configuration
            </h2>
            <p className="text-[11px] text-sky-100">
              Provenance, domain bounds, correction profile, and validation status
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-xs hover:bg-white/15 text-white"
            aria-label="Close model settings"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-4">
          {/* Model Registry List */}
          <div>
            <div className="font-bold text-slate-800 mb-1.5">
              Registered Earth Velocity Models
            </div>
            <div className="space-y-2">
              {catalog.map((m) => {
                const isSelected = m.id === selectedModelId;
                return (
                  <div
                    key={m.id}
                    className={`border rounded-xs p-2.5 transition-colors ${
                      !m.available
                        ? 'bg-slate-50 border-slate-300 opacity-85'
                        : isSelected
                          ? 'bg-sky-50 border-sky-600'
                          : 'bg-white border-slate-300 hover:border-slate-400'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="inline-flex items-center gap-2 font-bold cursor-pointer">
                        <input
                          type="radio"
                          name="modelSettingsRadio"
                          checked={isSelected}
                          disabled={!m.available}
                          onChange={() => m.available && onSelectModelId(m.id)}
                          className="accent-blue-700"
                        />
                        <span>{m.name}</span>
                        <span className="font-mono text-[10px] font-normal px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded-xs">
                          {m.id} · {m.version}
                        </span>
                      </label>

                      {m.available ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-xs">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {m.validationStatus}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-900 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-xs">
                          <ShieldAlert className="w-3.5 h-3.5" />
                          Unavailable / Blocked
                        </span>
                      )}
                    </div>

                    <div className="mt-1.5 pl-5 space-y-1 text-[11px] text-slate-700">
                      <div>
                        <span className="font-semibold">Source:</span> {m.source}
                      </div>
                      {m.checksum && (
                        <div className="font-mono text-[10px] text-slate-600 break-all">
                          SHA-256: {m.checksum}
                        </div>
                      )}
                      <div>
                        <span className="font-semibold">Phase policy:</span>{' '}
                        {m.phaseSelectionPolicy}
                      </div>
                      {m.available && (
                        <div className="flex flex-wrap gap-3 font-mono text-[10px] text-slate-700 pt-0.5">
                          {m.phaseBounds.P && (
                            <span>
                              P bounds: z [{m.phaseBounds.P.minDepthKm}–
                              {m.phaseBounds.P.maxDepthKm} km], Δ [
                              {m.phaseBounds.P.minDeltaDeg}–{m.phaseBounds.P.maxDeltaDeg}°]
                            </span>
                          )}
                          {m.phaseBounds.S && (
                            <span>
                              S bounds: z [{m.phaseBounds.S.minDepthKm}–
                              {m.phaseBounds.S.maxDepthKm} km], Δ [
                              {m.phaseBounds.S.minDeltaDeg}–{m.phaseBounds.S.maxDeltaDeg}°]
                            </span>
                          )}
                        </div>
                      )}
                      {!m.available && m.unavailableReason && (
                        <div className="mt-1 flex items-start gap-1.5 text-amber-900 bg-amber-50 border border-amber-200 px-2 py-1 rounded-xs">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span>{m.unavailableReason}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Implemented Correction Profile Selector (no fake unimplemented checkboxes) */}
          <div className="border border-slate-300 rounded-xs p-3 bg-slate-50 space-y-2">
            <div className="font-bold text-slate-800">
              Station Delay Correction Profile ({activeMeta.shortLabel})
            </div>
            <div className="space-y-1.5">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="correctionProfileRadio"
                  checked={correctionProfile === 'legacy-eqp-s173'}
                  onChange={() => onChangeCorrectionProfile('legacy-eqp-s173')}
                  className="mt-0.5 accent-blue-700"
                />
                <span>
                  <span className="font-semibold">
                    legacy-eqp-s173 (Default EQP Behavior)
                  </span>{' '}
                  — Applies PHILSTA station delay (`delaySec`) to P and `delaySec × 1.73` to S.
                </span>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="correctionProfileRadio"
                  checked={correctionProfile === 'none'}
                  onChange={() => onChangeCorrectionProfile('none')}
                  className="mt-0.5 accent-blue-700"
                />
                <span>
                  <span className="font-semibold">none (Zero Station Delay)</span> — Uses pure
                  1D table travel time with zero station delay term (`delay = 0.00 s`).
                </span>
              </label>
            </div>
            <p className="text-[11px] text-slate-600 pt-1 border-t border-slate-200">
              Note: Elevation corrections and ellipticity corrections are not implemented in
              the 1D solver and are therefore not exposed as toggles.
            </p>
          </div>

          {/* Explicit Solver Engine Clarification */}
          <div className="border border-slate-300 rounded-xs p-3 bg-white text-[11px] text-slate-700 space-y-1">
            <div className="font-bold text-slate-900">Solver Engine Notes</div>
            <p>
              <span className="font-semibold">EQP mode:</span> Equal-weight 4D/3D damped
              Gauss–Newton (Geiger) inversion with automatic conditioning-based depth fixing.
            </p>
            <p>
              <span className="font-semibold">HypoInverse mode:</span> Applies
              pick-quality weighting (A=1.0, B=0.75, C=0.50, D=0.25) and higher LM damping
              inside the internal EQP solver. It is{' '}
              <span className="font-semibold">not</span> official HYPOINVERSE2000 software.
            </p>
          </div>
        </div>

        <div className="px-4 py-2.5 bg-slate-100 border-t border-slate-300 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xs bg-[#164e99] hover:bg-[#113d7a] text-white font-semibold"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
