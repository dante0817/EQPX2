import React, { useMemo, useState } from 'react';
import { AlertTriangle, Check, Layers, ShieldAlert, X } from 'lucide-react';
import {
  EQPEvent,
  isEventUnlocated,
  SolverEngine,
  StationMeta,
} from '../data/eqpData';
import {
  CandidateLocationSolution,
  predictFixedHypocenterComparison,
  runMultiModelRelocationComparison,
} from '../utils/locationController';
import type {
  CorrectionProfileId,
  TravelTimeModelId,
} from '../utils/travelTime/types';

export interface MapComparisonMarker {
  modelId: TravelTimeModelId;
  label: string;
  lat: number;
  lon: number;
  depthKm: number;
  rmsSec: number;
  color: string;
}

interface ModelComparisonModalProps {
  open: boolean;
  onClose: () => void;
  event: EQPEvent;
  stations: StationMeta[];
  solverEngine: SolverEngine;
  correctionProfile: CorrectionProfileId;
  activeModelId: TravelTimeModelId;
  onAdoptCandidate: (candidate: CandidateLocationSolution) => void;
  onPublishMapMarkers: (markers: MapComparisonMarker[]) => void;
}

const MODEL_COLORS: Record<TravelTimeModelId, string> = {
  'jb-jbtab': '#0284c7',
  iasp91: '#16a34a',
  ak135: '#9333ea',
};

export const ModelComparisonModal: React.FC<ModelComparisonModalProps> = ({
  open,
  onClose,
  event,
  stations,
  solverEngine,
  correctionProfile,
  activeModelId,
  onAdoptCandidate,
  onPublishMapMarkers,
}) => {
  const [comparisonTab, setComparisonTab] = useState<'fixed' | 'reloc'>('reloc');
  const [observationPolicy, setObservationPolicy] = useState<
    'common-intersection' | 'model-native'
  >('common-intersection');
  const [selectedResidualModelId, setSelectedResidualModelId] =
    useState<TravelTimeModelId>(activeModelId);

  const modelIds: TravelTimeModelId[] = ['jb-jbtab', 'iasp91', 'ak135'];
  const isUnlocated = isEventUnlocated(event);

  const fixedReport = useMemo(() => {
    if (!open || isUnlocated) return null;
    return predictFixedHypocenterComparison({
      event,
      stations,
      modelIds,
      correctionProfile,
    });
  }, [open, isUnlocated, event, stations, correctionProfile]);

  const relocReport = useMemo(() => {
    if (!open) return null;
    return runMultiModelRelocationComparison({
      event,
      stations,
      solverEngine,
      modelIds,
      correctionProfile,
      observationPolicy,
    });
  }, [open, event, stations, solverEngine, correctionProfile, observationPolicy]);

  if (!open) return null;

  const selectedFixedRow =
    fixedReport?.rows.find((r) => r.modelId === selectedResidualModelId) ??
    fixedReport?.rows.find((r) => r.available) ??
    null;

  const selectedRelocRow =
    relocReport?.rows.find((r) => r.modelId === selectedResidualModelId) ??
    relocReport?.rows.find((r) => r.available && r.candidate?.result.converged) ??
    null;

  const handlePlotOnMap = () => {
    if (!relocReport) return;
    const markers: MapComparisonMarker[] = relocReport.rows
      .filter((r) => r.available && r.candidate?.result.converged)
      .map((r) => ({
        modelId: r.modelId,
        label: `${r.modelId} (${r.candidate!.result.depthKm.toFixed(1)} km)`,
        lat: r.candidate!.result.lat,
        lon: r.candidate!.result.lon,
        depthKm: r.candidate!.result.depthKm,
        rmsSec: r.candidate!.result.rmsSec,
        color: MODEL_COLORS[r.modelId],
      }));
    onPublishMapMarkers(markers);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="model-comparison-title"
    >
      <div className="bg-white border border-slate-400 rounded-sm shadow-xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden text-xs text-slate-900">
        <div className="px-4 py-2.5 bg-[#005a94] text-white flex items-center justify-between gap-3">
          <div>
            <h2 id="model-comparison-title" className="text-sm font-bold">
              Multi-Model Travel-Time Comparison — {event.filename || event.id}
            </h2>
            <p className="text-[11px] text-sky-100">
              Mode A: Fixed-hypocenter forward prediction · Mode B: Independent relocation ·
              Correction profile: {correctionProfile}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-xs hover:bg-white/15 text-white"
            aria-label="Close model comparison"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="px-4 py-2 bg-slate-100 border-b border-slate-300 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setComparisonTab('reloc')}
              className={`px-3 py-1 rounded-xs font-semibold border ${
                comparisonTab === 'reloc'
                  ? 'bg-[#164e99] text-white border-[#0b2a55]'
                  : 'bg-white text-slate-800 border-slate-400 hover:bg-slate-50'
              }`}
            >
              Mode B · Independent Relocation
            </button>
            <button
              type="button"
              onClick={() => setComparisonTab('fixed')}
              disabled={isUnlocated}
              className={`px-3 py-1 rounded-xs font-semibold border disabled:opacity-50 ${
                comparisonTab === 'fixed'
                  ? 'bg-[#164e99] text-white border-[#0b2a55]'
                  : 'bg-white text-slate-800 border-slate-400 hover:bg-slate-50'
              }`}
            >
              Mode A · Fixed Hypocenter
            </button>
          </div>

          {comparisonTab === 'reloc' && (
            <div className="flex items-center gap-2 text-[11px]">
              <span className="font-semibold text-slate-700">Observation Subset:</span>
              <select
                value={observationPolicy}
                onChange={(e) =>
                  setObservationPolicy(
                    e.target.value as 'common-intersection' | 'model-native'
                  )
                }
                className="px-2 py-1 border border-slate-400 rounded-xs bg-white text-slate-900"
              >
                <option value="common-intersection">
                  Common-Pick Intersection (Strictly Fair)
                </option>
                <option value="model-native">Model-Native Valid Picks</option>
              </select>
            </div>
          )}
        </div>

        <div className="p-4 overflow-y-auto space-y-4">
          {/* Explicit Notice for Blocked Models */}
          <div className="bg-amber-50 border border-amber-300 rounded-xs px-3 py-2 flex items-start gap-2 text-[11px] text-amber-950">
            <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">iasp91 & ak135 Status:</span> Blocked/Unavailable in
              this environment because TauP/ObsPy runtime and authoritative verified
              iasp91/ak135 travel-time tables are not installed. Unverified models are never
              substituted with J-B. Lowest RMS does <span className="font-semibold">not</span>{' '}
              auto-adopt any solution.
            </div>
          </div>

          {comparisonTab === 'fixed' && (
            <div className="space-y-3">
              {isUnlocated ? (
                <div className="p-3 bg-slate-50 border border-slate-300 rounded-xs text-slate-700">
                  Mode A requires an already-located hypocenter to hold fixed. Run Mode B or
                  locate the event first.
                </div>
              ) : fixedReport ? (
                <>
                  <div className="text-[11px] font-mono bg-slate-50 border border-slate-300 px-3 py-1.5 rounded-xs">
                    Fixed Hypocenter: {fixedReport.hypocenter.lat.toFixed(3)}°N,{' '}
                    {fixedReport.hypocenter.lon.toFixed(3)}°E · Depth{' '}
                    {fixedReport.hypocenter.depthKm.toFixed(1)} km · Origin{' '}
                    {fixedReport.hypocenter.originTimeGmt} UTC · Common Picks:{' '}
                    {fixedReport.commonObservationCount}
                  </div>
                  <div className="overflow-x-auto border border-slate-300 rounded-xs">
                    <table className="w-full text-left font-mono text-[11px] border-collapse">
                      <thead className="bg-slate-100 border-b border-slate-300 text-slate-700">
                        <tr>
                          <th className="p-2">Model</th>
                          <th className="p-2">Status</th>
                          <th className="p-2 text-right">Valid / Common</th>
                          <th className="p-2 text-right">Unweighted RMS</th>
                          <th className="p-2 text-right">Mean |Res|</th>
                          <th className="p-2 text-right">Max |Res|</th>
                          <th className="p-2">Inspect</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {fixedReport.rows.map((row) => (
                          <tr
                            key={`fixed-${row.modelId}`}
                            className={row.available ? 'bg-white' : 'bg-slate-50 text-slate-500'}
                          >
                            <td className="p-2 font-semibold text-slate-900">
                              {row.modelName}
                            </td>
                            <td className="p-2 font-sans">
                              {row.available ? (
                                <span className="text-emerald-800 font-semibold">
                                  {row.validationStatus}
                                </span>
                              ) : (
                                <span className="text-amber-800 font-semibold">
                                  Unavailable
                                </span>
                              )}
                            </td>
                            <td className="p-2 text-right">
                              {row.available
                                ? `${row.validObservationCount} / ${row.totalCommonCount}`
                                : '—'}
                            </td>
                            <td className="p-2 text-right">
                              {row.rmsSec !== null ? `${row.rmsSec.toFixed(3)} s` : '—'}
                            </td>
                            <td className="p-2 text-right">
                              {row.meanAbsResSec !== null
                                ? `${row.meanAbsResSec.toFixed(3)} s`
                                : '—'}
                            </td>
                            <td className="p-2 text-right">
                              {row.maxAbsResSec !== null
                                ? `${row.maxAbsResSec.toFixed(3)} s`
                                : '—'}
                            </td>
                            <td className="p-2">
                              {row.available ? (
                                <button
                                  type="button"
                                  onClick={() => setSelectedResidualModelId(row.modelId)}
                                  className="px-2 py-0.5 border border-slate-400 rounded-xs bg-white hover:bg-slate-50 text-slate-800 font-sans font-semibold"
                                >
                                  Residuals
                                </button>
                              ) : (
                                <span className="font-sans text-[10px]">Blocked</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
            </div>
          )}

          {comparisonTab === 'reloc' && relocReport && (
            <div className="space-y-3">
              <div className="overflow-x-auto border border-slate-300 rounded-xs">
                <table className="w-full text-left font-mono text-[11px] border-collapse">
                  <thead className="bg-slate-100 border-b border-slate-300 text-slate-700">
                    <tr>
                      <th className="p-2">Model</th>
                      <th className="p-2">Status</th>
                      <th className="p-2 text-right">Lat (°N)</th>
                      <th className="p-2 text-right">Lon (°E)</th>
                      <th className="p-2 text-right">Depth (km)</th>
                      <th className="p-2 text-right">RMS / WRMS</th>
                      <th className="p-2 text-right">Cond / Gap</th>
                      <th className="p-2 text-right">Δ km / ΔZ</th>
                      <th className="p-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {relocReport.rows.map((row) => {
                      const cand = row.candidate;
                      const res = cand?.result;
                      const converged = Boolean(row.available && res?.converged);
                      return (
                        <tr
                          key={`reloc-${row.modelId}`}
                          className={row.available ? 'bg-white' : 'bg-slate-50 text-slate-500'}
                        >
                          <td className="p-2 font-semibold text-slate-900">
                            <span className="inline-flex items-center gap-1.5">
                              <span
                                className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
                                style={{ backgroundColor: MODEL_COLORS[row.modelId] }}
                              />
                              {row.modelName}
                            </span>
                            <div className="text-[10px] font-normal text-slate-500 pl-4">
                              {row.available
                                ? `Picks: ${res?.activePhaseCount ?? 0} (common ${row.commonPickCount})`
                                : row.modelId}
                            </div>
                          </td>
                          <td className="p-2 font-sans">
                            {!row.available ? (
                              <span className="text-amber-800 font-semibold">Unavailable</span>
                            ) : converged ? (
                              <span className="text-emerald-800 font-semibold">
                                Converged ({res?.depthFixed ? 'Fixed Z' : 'Free Z'})
                              </span>
                            ) : (
                              <span className="text-red-700 font-semibold inline-flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                Failed
                              </span>
                            )}
                          </td>
                          <td className="p-2 text-right">
                            {converged && res ? res.lat.toFixed(3) : '—'}
                          </td>
                          <td className="p-2 text-right">
                            {converged && res ? res.lon.toFixed(3) : '—'}
                          </td>
                          <td className="p-2 text-right">
                            {converged && res ? res.depthKm.toFixed(1) : '—'}
                          </td>
                          <td className="p-2 text-right">
                            {converged && res
                              ? `${res.rmsSec.toFixed(2)} / ${res.weightedRmsSec.toFixed(2)} s`
                              : '—'}
                          </td>
                          <td className="p-2 text-right">
                            {converged && res
                              ? `${res.conditionNumber !== null ? res.conditionNumber.toFixed(0) : '—'} / ${res.azimuthalGapDeg !== null ? `${res.azimuthalGapDeg}°` : '—'}`
                              : '—'}
                          </td>
                          <td className="p-2 text-right">
                            {converged && row.deltaEpicenterKmVsAnchor !== null
                              ? `${row.deltaEpicenterKmVsAnchor.toFixed(1)} km / ${
                                  (row.deltaDepthKmVsAnchor ?? 0) >= 0 ? '+' : ''
                                }${(row.deltaDepthKmVsAnchor ?? 0).toFixed(1)} km`
                              : '—'}
                          </td>
                          <td className="p-2">
                            {converged && cand ? (
                              <div className="flex items-center gap-1 font-sans">
                                <button
                                  type="button"
                                  onClick={() => setSelectedResidualModelId(row.modelId)}
                                  className="px-1.5 py-0.5 border border-slate-400 rounded-xs bg-white hover:bg-slate-50 font-semibold"
                                >
                                  Inspect
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    onAdoptCandidate(cand);
                                    onClose();
                                  }}
                                  className="px-2 py-0.5 rounded-xs bg-emerald-700 hover:bg-emerald-800 text-white font-semibold inline-flex items-center gap-0.5"
                                >
                                  <Check className="w-3 h-3" />
                                  Adopt
                                </button>
                              </div>
                            ) : (
                              <span className="font-sans text-[10px] text-slate-500">
                                {row.reason ? 'See notes' : 'Blocked'}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Station Residuals Inspector */}
          {comparisonTab === 'fixed' && selectedFixedRow?.available && (
            <div className="border border-slate-300 rounded-xs overflow-hidden">
              <div className="px-3 py-1.5 bg-slate-100 border-b border-slate-300 font-bold">
                Mode A Residuals — {selectedFixedRow.modelName}
              </div>
              <div className="max-h-52 overflow-y-auto">
                <table className="w-full text-left font-mono text-[11px] border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="p-1.5">STA</th>
                      <th className="p-1.5">PH</th>
                      <th className="p-1.5 text-right">DELTA°</th>
                      <th className="p-1.5 text-right">OBS (s)</th>
                      <th className="p-1.5 text-right">PRED (s)</th>
                      <th className="p-1.5 text-right">DLY (s)</th>
                      <th className="p-1.5 text-right">RES (s)</th>
                      <th className="p-1.5">BRANCH / STATUS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedFixedRow.stationResiduals.map((sr, i) => (
                      <tr key={`sr-${sr.sta}-${sr.phase}-${i}`}>
                        <td className="p-1.5 font-semibold">{sr.sta}</td>
                        <td className="p-1.5">{sr.phase}</td>
                        <td className="p-1.5 text-right">{sr.deltaDeg.toFixed(2)}</td>
                        <td className="p-1.5 text-right">{sr.obsSec.toFixed(2)}</td>
                        <td className="p-1.5 text-right">
                          {sr.predSec !== null ? sr.predSec.toFixed(2) : '—'}
                        </td>
                        <td className="p-1.5 text-right">{sr.delaySec.toFixed(2)}</td>
                        <td className="p-1.5 text-right font-semibold">
                          {sr.residualSec !== null ? sr.residualSec.toFixed(2) : '—'}
                        </td>
                        <td className="p-1.5 text-slate-600">
                          {sr.branchLabel ?? sr.status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {comparisonTab === 'reloc' &&
            selectedRelocRow?.available &&
            selectedRelocRow.candidate?.result.converged && (
              <div className="border border-slate-300 rounded-xs overflow-hidden">
                <div className="px-3 py-1.5 bg-slate-100 border-b border-slate-300 font-bold">
                  Mode B Relocated Station Residuals — {selectedRelocRow.modelName}
                </div>
                <div className="max-h-52 overflow-y-auto">
                  <table className="w-full text-left font-mono text-[11px] border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                      <tr>
                        <th className="p-1.5">STA</th>
                        <th className="p-1.5 text-right">TOA</th>
                        <th className="p-1.5 text-right">AZIM</th>
                        <th className="p-1.5 text-right">DELTA°</th>
                        <th className="p-1.5 text-right">OBSp</th>
                        <th className="p-1.5 text-right">CALCp</th>
                        <th className="p-1.5 text-right">RESp</th>
                        <th className="p-1.5 text-right">OBSs</th>
                        <th className="p-1.5 text-right">CALCs</th>
                        <th className="p-1.5 text-right">RESs</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedRelocRow.candidate.result.picks.map((p) => (
                        <tr key={`rel-pick-${p.id}`}>
                          <td className="p-1.5 font-semibold">{p.sta}</td>
                          <td className="p-1.5 text-right">{p.toa.toFixed(1)}</td>
                          <td className="p-1.5 text-right">{p.azim.toFixed(1)}</td>
                          <td className="p-1.5 text-right">{p.delta.toFixed(2)}</td>
                          <td className="p-1.5 text-right">{p.obsP.toFixed(2)}</td>
                          <td className="p-1.5 text-right">{p.calcP.toFixed(2)}</td>
                          <td className="p-1.5 text-right font-semibold">
                            {p.pExcluded ? `*${p.resP.toFixed(2)}` : p.resP.toFixed(2)}
                          </td>
                          <td className="p-1.5 text-right">
                            {p.sTime.trim() ? p.obsS.toFixed(2) : '—'}
                          </td>
                          <td className="p-1.5 text-right">
                            {p.sTime.trim() ? p.calcS.toFixed(2) : '—'}
                          </td>
                          <td className="p-1.5 text-right font-semibold">
                            {p.sTime.trim()
                              ? p.sExcluded
                                ? `*${p.resS.toFixed(2)}`
                                : p.resS.toFixed(2)
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
        </div>

        <div className="px-4 py-2.5 bg-slate-100 border-t border-slate-300 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handlePlotOnMap}
            className="px-3 py-1.5 rounded-xs bg-white hover:bg-slate-50 border border-slate-400 text-slate-800 font-semibold inline-flex items-center gap-1.5"
          >
            <Layers className="w-3.5 h-3.5 text-sky-700" />
            Plot Comparison Markers on Map
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xs bg-[#164e99] hover:bg-[#113d7a] text-white font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
