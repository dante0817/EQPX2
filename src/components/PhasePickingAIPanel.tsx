import React, { useMemo, useState } from 'react';
import { Brain, Check, Play, SlidersHorizontal, Sparkles } from 'lucide-react';
import { EQPEvent, PHILSTA_DATABASE, StationMeta, StationPick } from '../data/eqpData';

export interface SuggestedPickPatch {
  pickId: string;
  pTime?: string;
  obsP?: number;
  sTime?: string;
  obsS?: number;
  calcS?: number;
}

interface PhasePickingAIPanelProps {
  events: EQPEvent[];
  activeEvent: EQPEvent;
  stations?: StationMeta[];
  selectedStation: string | null;
  onSelectStation: (sta: string | null) => void;
  onApplySuggestions: (patches: SuggestedPickPatch[], summaryMsg: string) => void;
}

type MlAlgorithm = 'ridge' | 'wadati' | 'huber';
type TrainingScope = 'catalog' | 'active';
type AiPickerModelId = 'phasenet' | 'eqtransformer' | 'gpd' | 'picknet';

interface AiPickerModelSpec {
  id: AiPickerModelId;
  name: string;
  architecture: string;
  pBiasSec: number;
  sBiasSec: number;
  confBonus: number;
}

const AI_PICKER_MODELS: AiPickerModelSpec[] = [
  {
    id: 'phasenet',
    name: 'PhaseNet',
    architecture: 'U-Net 1D · 3C Waveform',
    pBiasSec: 0.0,
    sBiasSec: -0.03,
    confBonus: 1,
  },
  {
    id: 'eqtransformer',
    name: 'EQTransformer',
    architecture: 'Attention + BiLSTM',
    pBiasSec: -0.04,
    sBiasSec: -0.06,
    confBonus: 2,
  },
  {
    id: 'gpd',
    name: 'GPD (Caltech)',
    architecture: 'ConvNet Sliding Window',
    pBiasSec: 0.07,
    sBiasSec: 0.11,
    confBonus: -2,
  },
  {
    id: 'picknet',
    name: 'PickNet Regional',
    architecture: 'Island-Arc Fine-Tune',
    pBiasSec: -0.02,
    sBiasSec: 0.02,
    confBonus: 2,
  },
];

interface TrainedPhaseModel {
  algorithm: MlAlgorithm;
  scope: TrainingScope;
  trainedAt: string;
  sampleCountP: number;
  sampleCountS: number;
  weightsP: [number, number, number]; // [intercept, deltaSlope, depthSlope]
  weightsS: [number, number, number];
  vpVsRatio: number;
  maeP: number;
  maeS: number;
  r2P: number;
}

interface StationSuggestion {
  pick: StationPick;
  predObsP: number;
  predObsS: number;
  predPTime: string;
  predSTime: string;
  deltaP: number | null;
  deltaS: number | null;
  confidence: number;
  meetsThreshold: boolean;
  hasMissingS: boolean;
  hasResidualDrift: boolean;
}

function solveLinear3x3(A: number[][], b: number[]): [number, number, number] {
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < 3; col++) {
    let pivot = col;
    for (let r = col + 1; r < 3; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) {
        pivot = r;
      }
    }
    if (pivot !== col) {
      const tmp = M[col];
      M[col] = M[pivot];
      M[pivot] = tmp;
    }
    const diag = M[col][col];
    if (Math.abs(diag) < 1e-8) return [0, 15.0, 0];
    for (let j = col; j < 4; j++) M[col][j] /= diag;
    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const factor = M[r][col];
      for (let j = col; j < 4; j++) {
        M[r][j] -= factor * M[col][j];
      }
    }
  }
  return [M[0][3], M[1][3], M[2][3]];
}

function fitWeightedLinear(
  rows: Array<{ delta: number; depth: number; target: number; weight: number }>,
  ridgeLambda = 0.05
): [number, number, number] {
  if (rows.length === 0) return [2.0, 15.2, 0.05];
  if (rows.length < 3) {
    const avgSlope =
      rows.reduce((acc, r) => acc + r.target / Math.max(0.2, r.delta), 0) / rows.length;
    return [1.5, Number(avgSlope.toFixed(3)), 0.0];
  }

  const XTX = [
    [ridgeLambda, 0, 0],
    [0, ridgeLambda, 0],
    [0, 0, ridgeLambda],
  ];
  const XTy = [0, 0, 0];

  for (const r of rows) {
    const x = [1, r.delta, r.depth];
    for (let i = 0; i < 3; i++) {
      XTy[i] += r.weight * x[i] * r.target;
      for (let j = 0; j < 3; j++) {
        XTX[i][j] += r.weight * x[i] * x[j];
      }
    }
  }

  return solveLinear3x3(XTX, XTy);
}

function formatArrivalForEvent(event: EQPEvent, travelSec: number): string {
  const timeParts = event.originTimeGmt.split(':');
  const hh = Number(timeParts[0] || 0);
  const mm = Number(timeParts[1] || 0);
  const ss = Number(timeParts[2] || 0);

  const samplePick = event.picks.find((p) => p.pTime.trim().length >= 6)?.pTime ?? '';
  const hhStr = String(hh).padStart(2, '0');
  const usesHhMm = samplePick.startsWith(hhStr);

  const totalSeconds = mm * 60 + ss + Math.max(0, travelSec);
  const outMin = Math.floor(totalSeconds / 60) % 60;
  const outSec = totalSeconds % 60;

  if (usesHhMm) {
    const outHour = (hh + Math.floor(totalSeconds / 3600)) % 24;
    const dec = (outSec / 60).toFixed(2).slice(1); // '.ss' fractional style when short
    const secTwo = String(Math.floor(outSec)).padStart(2, '0');
    return samplePick.includes('.') && Number(samplePick.split('.')[1] ?? 0) < 60
      ? `${String(outHour).padStart(2, '0')}${String(outMin).padStart(2, '0')}.${secTwo}`
      : `${String(outHour).padStart(2, '0')}${String(outMin).padStart(2, '0')}${dec}`;
  }

  const mmStr = String(outMin).padStart(2, '0');
  const ssStr = outSec.toFixed(2).padStart(5, '0');
  return `${mmStr}${ssStr}`;
}

export const PhasePickingAIPanel: React.FC<PhasePickingAIPanelProps> = ({
  events,
  activeEvent,
  stations = PHILSTA_DATABASE,
  selectedStation,
  onSelectStation,
  onApplySuggestions,
}) => {
  const [algorithm, setAlgorithm] = useState<MlAlgorithm>('huber');
  const [scope, setScope] = useState<TrainingScope>('catalog');
  const [filterOutliers, setFilterOutliers] = useState(true);
  const [configOpen, setConfigOpen] = useState(true);
  const [enabledModels, setEnabledModels] = useState<AiPickerModelId[]>([
    'phasenet',
    'eqtransformer',
  ]);
  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(75);
  const [isTraining, setIsTraining] = useState(false);
  const [trainedModel, setTrainedModel] = useState<TrainedPhaseModel | null>(null);

  const stationDelayMap = useMemo(() => {
    const map: Record<string, number> = {};
    stations.forEach((s) => {
      map[s.code] = s.delaySec;
    });
    return map;
  }, [stations]);

  const trainingDataset = useMemo(() => {
    const sourceEvents = scope === 'catalog' ? events : [activeEvent];
    const pRows: Array<{ delta: number; depth: number; target: number; residual: number }> = [];
    const sRows: Array<{ delta: number; depth: number; target: number; residual: number }> = [];
    const wadatiRatios: number[] = [];

    sourceEvents.forEach((ev) => {
      ev.picks.forEach((pick) => {
        const delay = stationDelayMap[pick.sta] ?? 0;
        if (pick.pTime.trim() !== '' && !pick.pExcluded && pick.obsP > 0) {
          if (!filterOutliers || Math.abs(pick.resP) <= 0.75) {
            pRows.push({
              delta: pick.delta,
              depth: ev.depthKm,
              target: pick.obsP - delay,
              residual: pick.resP,
            });
          }
        }
        if (pick.sTime.trim() !== '' && !pick.sExcluded && pick.obsS > 0) {
          if (!filterOutliers || Math.abs(pick.resS) <= 0.85) {
            sRows.push({
              delta: pick.delta,
              depth: ev.depthKm,
              target: pick.obsS - delay * 1.75,
              residual: pick.resS,
            });
            if (pick.obsP > 0 && !pick.pExcluded) {
              wadatiRatios.push(pick.obsS / pick.obsP);
            }
          }
        }
      });
    });

    return { pRows, sRows, wadatiRatios };
  }, [events, activeEvent, scope, filterOutliers, stationDelayMap]);

  const trainModel = () => {
    setIsTraining(true);
    window.setTimeout(() => {
      const { pRows, sRows, wadatiRatios } = trainingDataset;

      const weightFn = (res: number): number => {
        if (algorithm !== 'huber') return 1;
        const absRes = Math.abs(res);
        return absRes <= 0.45 ? 1 : 0.45 / Math.max(0.45, absRes);
      };

      const weightedP = pRows.map((r) => ({
        delta: r.delta,
        depth: r.depth,
        target: r.target,
        weight: weightFn(r.residual),
      }));
      const weightsP = fitWeightedLinear(weightedP, algorithm === 'ridge' ? 0.12 : 0.04);

      const avgVpVs =
        wadatiRatios.length > 0
          ? Number(
              (wadatiRatios.reduce((s, v) => s + v, 0) / wadatiRatios.length).toFixed(3)
            )
          : 1.75;

      let weightsS: [number, number, number];
      if (algorithm === 'wadati' || sRows.length < 3) {
        weightsS = [
          Number((weightsP[0] * avgVpVs).toFixed(3)),
          Number((weightsP[1] * avgVpVs).toFixed(3)),
          Number((weightsP[2] * avgVpVs).toFixed(3)),
        ];
      } else {
        const weightedS = sRows.map((r) => ({
          delta: r.delta,
          depth: r.depth,
          target: r.target,
          weight: weightFn(r.residual),
        }));
        weightsS = fitWeightedLinear(weightedS, algorithm === 'ridge' ? 0.12 : 0.04);
      }

      // Evaluate MAE and R^2 on training samples
      const predP = (d: number, z: number) => weightsP[0] + weightsP[1] * d + weightsP[2] * z;
      const predS = (d: number, z: number) => weightsS[0] + weightsS[1] * d + weightsS[2] * z;

      const meanP =
        pRows.length > 0 ? pRows.reduce((s, r) => s + r.target, 0) / pRows.length : 0;
      const ssTotP = pRows.reduce((s, r) => s + Math.pow(r.target - meanP, 2), 0);
      const ssResP = pRows.reduce(
        (s, r) => s + Math.pow(r.target - predP(r.delta, r.depth), 2),
        0
      );
      const maeP =
        pRows.length > 0
          ? pRows.reduce((s, r) => s + Math.abs(r.target - predP(r.delta, r.depth)), 0) /
            pRows.length
          : 0;
      const maeS =
        sRows.length > 0
          ? sRows.reduce((s, r) => s + Math.abs(r.target - predS(r.delta, r.depth)), 0) /
            sRows.length
          : maeP * avgVpVs;
      const r2P = ssTotP > 0 ? Math.max(0, 1 - ssResP / ssTotP) : 0.99;

      const now = new Date();
      const trainedAt = `${String(now.getUTCHours()).padStart(2, '0')}:${String(
        now.getUTCMinutes()
      ).padStart(2, '0')}:${String(now.getUTCSeconds()).padStart(2, '0')} UTC`;

      const nextModel: TrainedPhaseModel = {
        algorithm,
        scope,
        trainedAt,
        sampleCountP: pRows.length,
        sampleCountS: sRows.length,
        weightsP,
        weightsS,
        vpVsRatio: avgVpVs,
        maeP: Number(maeP.toFixed(2)),
        maeS: Number(maeS.toFixed(2)),
        r2P: Number(r2P.toFixed(4)),
      };
      setTrainedModel(nextModel);
      setIsTraining(false);
    }, 220);
  };

  const computeSuggestions = (
    model: TrainedPhaseModel,
    activeModelIds: AiPickerModelId[],
    minConfidence: number
  ): StationSuggestion[] => {
    const { weightsP, weightsS, vpVsRatio } = model;
    const selectedSpecs = AI_PICKER_MODELS.filter((m) => activeModelIds.includes(m.id));
    const specs = selectedSpecs.length > 0 ? selectedSpecs : [AI_PICKER_MODELS[0]];
    const avgPBias = specs.reduce((s, m) => s + m.pBiasSec, 0) / specs.length;
    const avgSBias = specs.reduce((s, m) => s + m.sBiasSec, 0) / specs.length;
    const avgConfBonus = specs.reduce((s, m) => s + m.confBonus, 0) / specs.length;
    const ensembleAgreementBonus = specs.length >= 2 ? Math.min(3, specs.length) : 0;

    return activeEvent.picks.map((pick) => {
      const delay = stationDelayMap[pick.sta] ?? 0;
      const rawP =
        weightsP[0] +
        weightsP[1] * pick.delta +
        weightsP[2] * activeEvent.depthKm +
        delay +
        avgPBias;
      const rawS =
        weightsS[0] +
        weightsS[1] * pick.delta +
        weightsS[2] * activeEvent.depthKm +
        delay * vpVsRatio +
        avgSBias;

      const predObsP = Number(Math.max(0.5, rawP).toFixed(2));
      const predObsS = Number(Math.max(predObsP + 1.2, rawS).toFixed(2));

      const predPTime = formatArrivalForEvent(activeEvent, predObsP);
      const predSTime = formatArrivalForEvent(activeEvent, predObsS);

      const deltaP =
        pick.pTime.trim() !== '' && pick.obsP > 0
          ? Number((pick.obsP - predObsP).toFixed(2))
          : null;
      const deltaS =
        pick.sTime.trim() !== '' && pick.obsS > 0
          ? Number((pick.obsS - predObsS).toFixed(2))
          : null;

      const errSignal = deltaP !== null ? Math.min(1.5, Math.abs(deltaP)) : 0.15;
      const confidence = Math.max(
        52,
        Math.min(
          99,
          Math.round(95 - errSignal * 18 - model.maeP * 6 + avgConfBonus + ensembleAgreementBonus)
        )
      );

      return {
        pick,
        predObsP,
        predObsS,
        predPTime,
        predSTime,
        deltaP,
        deltaS,
        confidence,
        meetsThreshold: confidence >= minConfidence,
        hasMissingS: pick.sTime.trim() === '',
        hasResidualDrift:
          (deltaP !== null && Math.abs(deltaP) > 0.5) ||
          (deltaS !== null && Math.abs(deltaS) > 0.5),
      };
    });
  };

  const handleToggleModel = (id: AiPickerModelId) => {
    const exists = enabledModels.includes(id);
    if (exists && enabledModels.length === 1) return; // keep at least one model active
    const nextModels = exists
      ? enabledModels.filter((m) => m !== id)
      : [...enabledModels, id];
    setEnabledModels(nextModels);
  };

  const handleThresholdChange = (val: number) => {
    setConfidenceThreshold(val);
  };

  const suggestions = useMemo<StationSuggestion[]>(() => {
    if (!trainedModel) return [];
    return computeSuggestions(trainedModel, enabledModels, confidenceThreshold);
  }, [trainedModel, activeEvent, stationDelayMap, enabledModels, confidenceThreshold]);

  const missingSCount = useMemo(
    () => suggestions.filter((s) => s.hasMissingS && s.meetsThreshold).length,
    [suggestions]
  );

  const qualifiedCount = useMemo(
    () => suggestions.filter((s) => s.meetsThreshold).length,
    [suggestions]
  );

  const handleApplySingle = (item: StationSuggestion, target: 'P' | 'S' | 'BOTH') => {
    const patch: SuggestedPickPatch = { pickId: item.pick.id };
    if (target === 'P' || target === 'BOTH') {
      patch.pTime = item.predPTime;
      patch.obsP = item.predObsP;
    }
    if (target === 'S' || target === 'BOTH') {
      patch.sTime = item.predSTime;
      patch.obsS = item.predObsS;
      if (item.pick.calcS === 0) {
        patch.calcS = Number(
          (item.pick.calcP * (trainedModel?.vpVsRatio ?? 1.75)).toFixed(2)
        );
      }
    }
    onApplySuggestions(
      [patch],
      `Applied AI-suggested ${target === 'BOTH' ? 'P & S' : target} arrival for station ${item.pick.sta}`
    );
  };

  const handleApplyMissingS = () => {
    const patches: SuggestedPickPatch[] = suggestions
      .filter((s) => s.hasMissingS && s.meetsThreshold)
      .map((s) => ({
        pickId: s.pick.id,
        sTime: s.predSTime,
        obsS: s.predObsS,
        calcS:
          s.pick.calcS === 0
            ? Number((s.pick.calcP * (trainedModel?.vpVsRatio ?? 1.75)).toFixed(2))
            : s.pick.calcS,
      }));
    if (patches.length === 0) return;
    onApplySuggestions(
      patches,
      `Populated ${patches.length} missing S-phase arrival suggestions (conf ≥${confidenceThreshold}%)`
    );
  };

  return (
    <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Brain className="w-4 h-4 text-blue-600 shrink-0" />
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Phase Picking AI · Travel-Time Predictor
            </h2>
            <p className="text-xs text-slate-500 font-mono tabular-nums">
              {trainingDataset.pRows.length} P samples · {trainingDataset.sRows.length} S samples from{' '}
              {scope === 'catalog' ? `${events.length} catalog events` : activeEvent.filename}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            aria-label="ML Algorithm"
            value={algorithm}
            onChange={(e) => setAlgorithm(e.target.value as MlAlgorithm)}
            className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-md font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="huber">Huber-Weighted Regressor</option>
            <option value="ridge">Ridge Linear (Δ + Depth)</option>
            <option value="wadati">Wadati Coupled P/S</option>
          </select>

          <select
            aria-label="Training Dataset Scope"
            value={scope}
            onChange={(e) => setScope(e.target.value as TrainingScope)}
            className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-md font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="catalog">All Catalog History ({events.length} events)</option>
            <option value="active">Active Event Only</option>
          </select>

          <label className="inline-flex items-center gap-1.5 px-2 py-1 text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={filterOutliers}
              onChange={(e) => setFilterOutliers(e.target.checked)}
              className="accent-blue-600"
            />
            Exclude Outliers
          </label>

          <button
            type="button"
            onClick={() => setConfigOpen((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border font-medium transition-colors whitespace-nowrap ${
              configOpen
                ? 'border-blue-300 bg-blue-50 text-blue-800'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Config ({enabledModels.length} · ≥{confidenceThreshold}%)
          </button>

          <button
            type="button"
            onClick={trainModel}
            disabled={isTraining || trainingDataset.pRows.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-900 text-white font-medium hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <Play className="w-3.5 h-3.5" />
            {isTraining ? 'Training...' : trainedModel ? 'Retrain Model' : 'Train Model'}
          </button>
        </div>
      </div>

      {/* AI Model & Confidence Configuration Panel */}
      {configOpen && (
        <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-200 grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          <div className="lg:col-span-7 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-800">
                Active AI Picker Models (Ensemble)
              </span>
              <span className="text-[11px] text-slate-500 font-mono tabular-nums">
                {enabledModels.length}/{AI_PICKER_MODELS.length} active
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {AI_PICKER_MODELS.map((spec) => {
                const active = enabledModels.includes(spec.id);
                const isOnlyOne = active && enabledModels.length === 1;
                return (
                  <button
                    key={spec.id}
                    type="button"
                    onClick={() => handleToggleModel(spec.id)}
                    disabled={isOnlyOne}
                    className={`flex items-start justify-between gap-2 p-2 rounded-md border text-left transition-colors ${
                      active
                        ? 'bg-white border-blue-300 shadow-2xs'
                        : 'bg-slate-100/70 border-slate-200 text-slate-500 hover:bg-white'
                    } ${isOnlyOne ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                    title={
                      isOnlyOne
                        ? 'At least one picker model must remain enabled'
                        : `Toggle ${spec.name}`
                    }
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            active ? 'bg-blue-600' : 'bg-slate-300'
                          }`}
                        />
                        <span className="truncate">{spec.name}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 truncate mt-0.5">
                        {spec.architecture}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        active
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'bg-slate-200/80 text-slate-600'
                      }`}
                    >
                      {active ? 'Enabled' : 'Off'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-5 space-y-3 bg-white border border-slate-200 rounded-md p-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="ai-conf-threshold" className="font-semibold text-slate-800">
                  Confidence Threshold
                </label>
                <span className="font-mono tabular-nums font-semibold text-blue-700">
                  ≥ {confidenceThreshold}%
                </span>
              </div>
              <input
                id="ai-conf-threshold"
                type="range"
                min={50}
                max={95}
                step={5}
                value={confidenceThreshold}
                onChange={(e) => handleThresholdChange(Number(e.target.value))}
                className="w-full accent-blue-600 cursor-pointer"
              />
              <div className="flex items-center justify-between gap-1.5 pt-0.5">
                {[
                  { label: 'Sensitive (65%)', val: 65 },
                  { label: 'Balanced (75%)', val: 75 },
                  { label: 'Strict (85%)', val: 85 },
                ].map((preset) => (
                  <button
                    key={preset.val}
                    type="button"
                    onClick={() => handleThresholdChange(preset.val)}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                      confidenceThreshold === preset.val
                        ? 'bg-blue-50 text-blue-700 border-blue-300'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {!trainedModel ? (
        <div className="p-6 text-center space-y-2">
          <Sparkles className="w-6 h-6 text-slate-300 mx-auto" />
          <p className="text-xs font-medium text-slate-700">
            Train the in-browser travel-time regression model on historical P/S arrivals
          </p>
          <p className="text-xs text-slate-500 max-w-lg mx-auto">
            Learns regional moveout slowness (s/°), hypocentral depth scaling, station delays, and Wadati Vp/Vs coupling to suggest missing S arrivals and flag anomalous P picks.
          </p>
        </div>
      ) : (
        <>
          {/* Trained Model Metrics Strip */}
          <div className="px-4 py-2.5 bg-slate-50/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-4 font-mono tabular-nums text-slate-700">
              <span className="inline-flex items-center gap-1.5 text-emerald-700 font-sans font-medium">
                <Check className="w-3.5 h-3.5" />
                Trained {trainedModel.trainedAt}
              </span>
              <span>R² (P) = {trainedModel.r2P.toFixed(4)}</span>
              <span>P MAE = {trainedModel.maeP.toFixed(2)}s</span>
              <span>S MAE = {trainedModel.maeS.toFixed(2)}s</span>
              <span>Slope = {trainedModel.weightsP[1].toFixed(2)} s/°</span>
              <span>Vp/Vs = {trainedModel.vpVsRatio.toFixed(2)}</span>
              <span className="text-slate-500 font-sans">
                {qualifiedCount}/{suggestions.length} ≥{confidenceThreshold}% conf
              </span>
            </div>

            {missingSCount > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleApplyMissingS}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors whitespace-nowrap"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Apply {missingSCount} Missing S Picks
                </button>
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th className="py-2 px-3 text-left font-medium">STA</th>
                  <th className="py-2 px-2.5 font-medium">Delta</th>
                  <th className="py-2 px-2.5 font-medium">Current P</th>
                  <th className="py-2 px-2.5 font-medium">AI Pred P (OBS)</th>
                  <th className="py-2 px-2.5 font-medium">ΔP</th>
                  <th className="py-2 px-2.5 font-medium">Current S</th>
                  <th className="py-2 px-2.5 font-medium">AI Pred S (OBS)</th>
                  <th className="py-2 px-2.5 font-medium">Conf</th>
                  <th className="py-2 px-3 text-left font-medium">Apply</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                {suggestions.map((item) => {
                  const isSelected = selectedStation === item.pick.sta;
                  return (
                    <tr
                      key={`ai-${item.pick.id}`}
                      onClick={() =>
                        onSelectStation(isSelected ? null : item.pick.sta)
                      }
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-2 px-3 text-left font-semibold text-slate-900">
                        {item.pick.sta}
                      </td>
                      <td className="py-2 px-2.5 text-slate-600">
                        {item.pick.delta.toFixed(2)}°
                      </td>
                      <td className="py-2 px-2.5 text-slate-700">
                        {item.pick.pTime || '—'}
                      </td>
                      <td className="py-2 px-2.5 font-semibold text-blue-700">
                        {item.predPTime}{' '}
                        <span className="text-slate-400 font-normal">
                          ({item.predObsP.toFixed(2)}s)
                        </span>
                      </td>
                      <td
                        className={`py-2 px-2.5 font-semibold ${
                          item.deltaP !== null && Math.abs(item.deltaP) > 0.5
                            ? 'text-amber-700'
                            : 'text-slate-600'
                        }`}
                      >
                        {item.deltaP === null
                          ? '—'
                          : item.deltaP >= 0
                            ? `+${item.deltaP.toFixed(2)}s`
                            : `${item.deltaP.toFixed(2)}s`}
                      </td>
                      <td className="py-2 px-2.5 text-slate-700">
                        {item.pick.sTime || (
                          <span className="text-amber-700 font-sans">Missing</span>
                        )}
                      </td>
                      <td className="py-2 px-2.5 font-semibold text-teal-700">
                        {item.predSTime}{' '}
                        <span className="text-slate-400 font-normal">
                          ({item.predObsS.toFixed(2)}s)
                        </span>
                      </td>
                      <td className="py-2 px-2.5">
                        <span
                          className={
                            item.meetsThreshold
                              ? 'text-emerald-700 font-semibold'
                              : 'text-amber-700'
                          }
                          title={
                            item.meetsThreshold
                              ? `Meets ≥${confidenceThreshold}% threshold`
                              : `Below ≥${confidenceThreshold}% threshold`
                          }
                        >
                          {item.confidence}%{!item.meetsThreshold ? ' (low)' : ''}
                        </span>
                      </td>
                      <td
                        className="py-2 px-3 text-left font-sans"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleApplySingle(item, 'P')}
                            className="px-2 py-0.5 rounded border border-slate-200 bg-white hover:bg-slate-100 text-[11px] font-medium text-slate-700"
                          >
                            Use P
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApplySingle(item, 'S')}
                            className={`px-2 py-0.5 rounded border text-[11px] font-medium ${
                              item.hasMissingS
                                ? 'border-teal-300 bg-teal-50 text-teal-800 hover:bg-teal-100'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            Use S
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
};
