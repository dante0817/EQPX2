import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Compass,
  Database,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Layers,
  Map as MapIcon,
  Play,
  Plus,
  RotateCcw,
  Save,
  ShieldAlert,
  Trash2,
  Upload,
} from 'lucide-react';
import { DEFAULT_PH_CENTER, EQPEvent, isEventUnlocated } from '../data/eqpData';
import { invertFocalMechanism, NodalPlane } from '../utils/focalMechanism';
import { loadActiveFaultsDataset, type ValidatedFaultFeature } from '../utils/geologyLayers';
import { projectLatLonToLocalEnuMeters } from '../utils/geodeticStrain';
import { geodesicDistanceKm } from '../utils/historicalSeismicity';
import {
  buildHypotheticalBenchmarkConfig,
  buildSourceSegmentFromNodalPlane,
  computeCoulombInputFingerprint,
  COULOMB_SIGN_CONVENTION,
  COULOMB_SOLVER_IDENTITY,
  COULOMB_SOLVER_VERSION,
  CoulombCalculationResult,
  CoulombStressUnit,
  createEmptySourceModel,
  DEFAULT_ELASTIC_PARAMETERS,
  DEFAULT_RECEIVER_MODEL,
  ElasticParameters,
  ExplicitReceiverPlane,
  exportCoulombGridCsv,
  exportCoulombPointsCsv,
  exportCoulombReproducibleJson,
  FaultSegment,
  formatStressValue,
  parseSourceFaultCsv,
  parseSourceFaultGeoJson,
  ReceiverFaultModel,
  runCoulombCalculation,
  SavedCoulombConfig,
  SourceFaultModel,
  validateReceiverModel,
  validateSourceFaultModel,
} from '../utils/coulombStress';
import { triggerTextDownload } from './HistoricalBeachballIcon';
import {
  CoulombColorScheme,
  CoulombSensitivityCharts,
  CoulombStressMapView,
  CoulombStressRange,
  DEFAULT_COULOMB_COLOR_SCHEME,
} from './CoulombSubPanels';

export type CoulombSectionId = 'source' | 'receiver' | 'calculate' | 'map' | 'quality';

interface CoulombStressPanelProps {
  event: EQPEvent;
  onNotice?: (msg: string) => void;
}

const RAD2DEG = 180 / Math.PI;

export const CoulombStressPanel: React.FC<CoulombStressPanelProps> = ({ event, onNotice }) => {
  const [section, setSection] = useState<CoulombSectionId>('source');

  const unlocated = isEventUnlocated(event);
  const originLat = !unlocated && Number.isFinite(event.lat) ? event.lat : DEFAULT_PH_CENTER.lat;
  const originLon = !unlocated && Number.isFinite(event.lon) ? event.lon : DEFAULT_PH_CENTER.lon;

  // Source, Receiver, Elastic state (starts clean & empty — never auto-loads hypothetical models onto real events)
  const [sourceModel, setSourceModel] = useState<SourceFaultModel>(() =>
    createEmptySourceModel(event)
  );
  const [receiverModel, setReceiverModel] = useState<ReceiverFaultModel>(() => ({
    ...DEFAULT_RECEIVER_MODEL,
    uniformOrientation: { ...DEFAULT_RECEIVER_MODEL.uniformOrientation },
    explicitReceivers: [],
    gridConfig: { ...DEFAULT_RECEIVER_MODEL.gridConfig },
  }));
  const [elasticParams, setElasticParams] = useState<ElasticParameters>(() => ({
    ...DEFAULT_ELASTIC_PARAMETERS,
  }));

  // Calculation state
  const [result, setResult] = useState<CoulombCalculationResult | null>(null);
  const [isComputing, setIsComputing] = useState(false);
  const [unit, setUnit] = useState<CoulombStressUnit>('kPa');
  const [clampKPa, setClampKPa] = useState<number>(250);
  const [stressRange, setStressRange] = useState<CoulombStressRange>({
    minKPa: -250,
    maxKPa: 250,
  });
  const [showLegend, setShowLegend] = useState<boolean>(true);
  const [showLegendTooltip, setShowLegendTooltip] = useState<boolean>(false);
  const [legendPos, setLegendPos] = useState<{ x: number; y: number }>({ x: 14, y: 14 });
  const [colorScheme, setColorScheme] = useState<CoulombColorScheme>(DEFAULT_COULOMB_COLOR_SCHEME);
  const [legendBgOpacity, setLegendBgOpacity] = useState<number>(1);

  // Import state (CSV / GeoJSON)
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFormat, setImportFormat] = useState<'csv' | 'geojson'>('csv');
  const [importText, setImportText] = useState('');
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);

  // Optional PHIVOLCS mapped faults geographic reference (2D traces only)
  const [nearbyFaultRefs, setNearbyFaultRefs] = useState<
    Array<{
      name: string;
      mechanism: string;
      distKm: number;
      midLat: number;
      midLon: number;
      approxStrikeDeg: number;
    }>
  >([]);

  // Backend saved configurations (stored separately from official EQP events)
  const [savedConfigs, setSavedConfigs] = useState<SavedCoulombConfig[]>([]);
  const [configNameInput, setConfigNameInput] = useState('');
  const [isLoadingConfigs, setIsLoadingConfigs] = useState(false);
  const [configStatusMsg, setConfigStatusMsg] = useState<string | null>(null);

  // Sync event ID metadata when active EQP event switches
  useEffect(() => {
    setSourceModel((prev) => ({
      ...prev,
      referenceEventId: event.id,
      name:
        prev.provenanceKind === 'Reference Benchmark (Hypothetical)'
          ? prev.name
          : `Source Model (${event.id})`,
    }));
  }, [event.id]);

  // Read-only focal mechanism check (never auto-selects a nodal plane)
  const focalAnalysis = useMemo(() => {
    try {
      return invertFocalMechanism(event);
    } catch {
      return null;
    }
  }, [event]);

  // Live configuration validation
  const sourceValidation = useMemo(
    () => validateSourceFaultModel(sourceModel, elasticParams),
    [sourceModel, elasticParams]
  );
  const receiverValidation = useMemo(
    () => validateReceiverModel(receiverModel),
    [receiverModel]
  );

  // Input fingerprint for stale-result detection
  const currentFingerprint = useMemo(
    () =>
      computeCoulombInputFingerprint(
        sourceModel,
        receiverModel,
        elasticParams,
        originLat,
        originLon
      ),
    [sourceModel, receiverModel, elasticParams, originLat, originLon]
  );

  const isStale = Boolean(
    result &&
      result.status !== 'Not Run' &&
      result.inputFingerprint !== currentFingerprint
  );

  // Load saved Coulomb configs from backend
  const fetchSavedConfigs = useCallback(async () => {
    setIsLoadingConfigs(true);
    try {
      const resp = await fetch('/api/research/coulomb-configs');
      const data = (await resp.json()) as {
        ok?: boolean;
        configs?: SavedCoulombConfig[];
        error?: string;
      };
      if (resp.ok && data.ok !== false && Array.isArray(data.configs)) {
        setSavedConfigs(data.configs);
      }
    } catch {
      // Ignore silent load errors on first paint
    } finally {
      setIsLoadingConfigs(false);
    }
  }, []);

  useEffect(() => {
    void fetchSavedConfigs();
  }, [fetchSavedConfigs]);

  // Load nearest PHIVOLCS mapped fault traces for geographic receiver reference
  useEffect(() => {
    let cancelled = false;
    void loadActiveFaultsDataset()
      .then((dataset) => {
        if (cancelled) return;
        const items: Array<{
          name: string;
          mechanism: string;
          distKm: number;
          midLat: number;
          midLon: number;
          approxStrikeDeg: number;
        }> = [];
        dataset.features.forEach((f: ValidatedFaultFeature) => {
          const line =
            f.geometry.type === 'LineString'
              ? f.geometry.coordinates
              : f.geometry.coordinates[0] ?? [];
          if (line.length < 2) return;
          const midPt = line[Math.floor(line.length / 2)];
          const p0 = line[0];
          const p1 = line[line.length - 1];
          const distKm = geodesicDistanceKm(originLat, originLon, midPt[1], midPt[0]);
          if (!Number.isFinite(distKm) || distKm > 250) return;
          const enu = projectLatLonToLocalEnuMeters(p1[1], p1[0], p0[1], p0[0]);
          let strike = Math.atan2(enu.eastM, enu.northM) * RAD2DEG;
          strike = ((strike % 360) + 360) % 360;
          const faultName =
            f.properties.fault_name ||
            f.properties.segment_name ||
            `Trace #${f.properties.source_row ?? '?'}`;
          items.push({
            name: String(faultName),
            mechanism: String(f.properties.mechanism || 'Unspecified'),
            distKm,
            midLat: midPt[1],
            midLon: midPt[0],
            approxStrikeDeg: Math.round(strike),
          });
        });
        items.sort((a, b) => a.distKm - b.distKm);
        setNearbyFaultRefs(items.slice(0, 12));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [originLat, originLon]);

  // Handlers
  const handleAddBlankSegment = () => {
    const newSeg: FaultSegment = {
      id: `seg-${Date.now()}-${Math.round(Math.random() * 1000)}`,
      name: `Segment ${sourceModel.segments.length + 1}`,
      centerLat: Number(originLat.toFixed(5)),
      centerLon: Number(originLon.toFixed(5)),
      originMode: 'center',
      topDepthKm: 2.0,
      strikeDeg: 0,
      dipDeg: 90,
      rakeDeg: 180,
      lengthKm: 15,
      widthKm: 10,
      slipM: 1.0,
      tensileSlipM: 0,
    };
    setSourceModel((prev) => ({
      ...prev,
      provenanceKind:
        prev.provenanceKind === 'Reference Benchmark (Hypothetical)'
          ? 'Manual Model'
          : prev.provenanceKind,
      segments: [...prev.segments, newSeg],
    }));
  };

  const handleUpdateSegment = (id: string, patch: Partial<FaultSegment>) => {
    setSourceModel((prev) => ({
      ...prev,
      segments: prev.segments.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
  };

  const handleDeleteSegment = (id: string) => {
    setSourceModel((prev) => ({
      ...prev,
      segments: prev.segments.filter((s) => s.id !== id),
    }));
  };

  const handleImportNodalPlane = (plane: NodalPlane, planeLabel: string) => {
    const seg = buildSourceSegmentFromNodalPlane(
      plane,
      event,
      `From ${planeLabel} (${plane.strike}/${plane.dip}/${plane.rake})`
    );
    setSourceModel((prev) => ({
      ...prev,
      provenanceKind: 'Manual Model',
      assumptionsNote:
        'Orientation & origin initialized from analyst-selected focal mechanism nodal plane; rupture length, width, and slip must be manually verified (not inverted from waveforms).',
      segments: [...prev.segments, seg],
    }));
    onNotice?.(
      `Added editable segment from ${planeLabel}. Supply rupture length, width, and slip.`
    );
  };

  const handleLoadHypotheticalBenchmark = () => {
    const bench = buildHypotheticalBenchmarkConfig(event);
    setSourceModel(bench.sourceModel);
    setReceiverModel(bench.receiverModel);
    setElasticParams(bench.elasticParams);
    setResult(null);
    onNotice?.('Loaded HYPOTHETICAL benchmark scenario (for testing only, not real event data).');
  };

  const handleApplyImport = () => {
    setImportErrors([]);
    setImportWarnings([]);
    const parsed =
      importFormat === 'geojson'
        ? parseSourceFaultGeoJson(importText)
        : parseSourceFaultCsv(importText);
    if (parsed.errors.length > 0 && parsed.segments.length === 0) {
      setImportErrors(parsed.errors);
      setImportWarnings(parsed.warnings);
      return;
    }
    setSourceModel((prev) => ({
      ...prev,
      provenanceKind: 'Imported',
      segments: [...prev.segments, ...parsed.segments],
    }));
    setImportWarnings(parsed.warnings);
    setImportErrors(parsed.errors);
    if (parsed.errors.length === 0) {
      setShowImportModal(false);
      setImportText('');
      onNotice?.(`Imported ${parsed.segments.length} source fault segment(s).`);
    }
  };

  const handleAddReceiver = (preset?: {
    name?: string;
    lat?: number;
    lon?: number;
    strikeDeg?: number;
  }) => {
    const rec: ExplicitReceiverPlane = {
      id: `rcv-${Date.now()}-${Math.round(Math.random() * 1000)}`,
      name: preset?.name || `Receiver ${receiverModel.explicitReceivers.length + 1}`,
      lat: Number((preset?.lat ?? originLat + 0.1).toFixed(5)),
      lon: Number((preset?.lon ?? originLon + 0.1).toFixed(5)),
      depthKm: receiverModel.gridConfig.targetDepthKm,
      strikeDeg: preset?.strikeDeg ?? receiverModel.uniformOrientation.strikeDeg,
      dipDeg: receiverModel.uniformOrientation.dipDeg,
      rakeDeg: receiverModel.uniformOrientation.rakeDeg,
      muEffective: receiverModel.uniformOrientation.muEffective,
    };
    setReceiverModel((prev) => ({
      ...prev,
      mode: 'explicit-planes',
      explicitReceivers: [...prev.explicitReceivers, rec],
    }));
  };

  const handleUpdateReceiver = (id: string, patch: Partial<ExplicitReceiverPlane>) => {
    setReceiverModel((prev) => ({
      ...prev,
      explicitReceivers: prev.explicitReceivers.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  };

  const handleRunCalculation = useCallback(() => {
    setIsComputing(true);
    setTimeout(() => {
      try {
        const calc = runCoulombCalculation({
          sourceModel,
          receiverModel,
          elasticParams,
          originLat,
          originLon,
        });
        setResult(calc);
        if (calc.status === 'Invalid Configuration') {
          onNotice?.('Coulomb calculation blocked due to invalid configuration.');
        } else {
          onNotice?.(
            `Computed Okada (1992) ΔCFS over ${calc.gridCells.length} grid cells (${calc.pointEvaluations.length} pointwise receivers).`
          );
        }
      } finally {
        setIsComputing(false);
      }
    }, 10);
  }, [sourceModel, receiverModel, elasticParams, originLat, originLon, onNotice]);

  const handleSaveConfig = async () => {
    const trimmed = configNameInput.trim() || `${event.id} Static CFS Scenario`;
    setConfigStatusMsg(null);
    try {
      const resp = await fetch('/api/research/coulomb-configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmed,
          referenceEventId: event.id,
          sourceModel,
          receiverModel,
          elasticParams,
        }),
      });
      const data = (await resp.json()) as {
        ok?: boolean;
        configs?: SavedCoulombConfig[];
        error?: string;
      };
      if (!resp.ok || data.ok === false) {
        throw new Error(data.error || `HTTP ${resp.status}`);
      }
      if (Array.isArray(data.configs)) setSavedConfigs(data.configs);
      setConfigNameInput('');
      setConfigStatusMsg(`Saved "${trimmed}" to research configuration archive.`);
      onNotice?.(`Saved Coulomb configuration "${trimmed}".`);
    } catch (err) {
      setConfigStatusMsg(
        err instanceof Error ? err.message : 'Failed to save configuration.'
      );
    }
  };

  const handleLoadConfig = (cfg: SavedCoulombConfig) => {
    setSourceModel(cfg.sourceModel);
    setReceiverModel(cfg.receiverModel);
    setElasticParams(cfg.elasticParams);
    setResult(null);
    onNotice?.(`Loaded saved configuration "${cfg.name}". Click Run Calculation to compute ΔCFS.`);
  };

  const handleDeleteConfig = async (id: string) => {
    try {
      const resp = await fetch(`/api/research/coulomb-configs/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const data = (await resp.json()) as {
        ok?: boolean;
        configs?: SavedCoulombConfig[];
      };
      if (resp.ok && data.ok !== false && Array.isArray(data.configs)) {
        setSavedConfigs(data.configs);
      }
    } catch {
      // Ignore silent delete failures
    }
  };

  const sectionButtons: Array<{ id: CoulombSectionId; label: string; icon: React.ReactNode }> = [
    { id: 'source', label: '1. Source Fault Model', icon: <Layers className="w-3.5 h-3.5" /> },
    { id: 'receiver', label: '2. Receiver Fault Configuration', icon: <Compass className="w-3.5 h-3.5" /> },
    { id: 'calculate', label: '3. Coulomb Stress Calculation', icon: <BarChart3 className="w-3.5 h-3.5" /> },
    { id: 'map', label: '4. Stress Change Map', icon: <MapIcon className="w-3.5 h-3.5" /> },
    { id: 'quality', label: '5. Quality Assessment & Export', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  ];

  const isConfigValid = sourceValidation.valid && receiverValidation.valid;

  return (
    <div className="space-y-3 text-xs text-slate-900">
      {/* Top Research Summary Strip */}
      <div className="bg-[#f5f7fa] border border-slate-600/70 rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-2 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-blue-700 [text-shadow:0_0_8px_rgba(249,115,22,0.7),0_0_18px_rgba(251,146,60,0.45)] tracking-tight">
              Coulomb Stress Change Analysis (Okada 1992 Elastic Half-Space)
            </h2>
            <span className="px-2 py-0.5 border border-amber-700/60 bg-[#f3e6cc] text-amber-950 text-[10px] font-semibold uppercase tracking-wide rounded-xs">
              {result ? result.status : 'Not Run'} · Experimental
            </span>
          </div>
          <div className="text-[11px] text-slate-600 mt-0.5 font-mono tabular-nums">
            Ref Event: <strong className="text-slate-900">{event.id}</strong>{' '}
            {unlocated
              ? '(Unlocated — using default PH origin 14.5°N, 121.0°E)'
              : `(${event.lat.toFixed(3)}°N, ${event.lon.toFixed(3)}°E · Depth ${event.depthKm.toFixed(1)} km · ${event.preferredScale} ${(event.preferredScale === 'Ms' ? event.ms : event.preferredScale === 'Mb' ? event.mb : event.md).toFixed(1)})`}{' '}
            · Segments: {sourceModel.segments.length} · Grid: {receiverModel.gridConfig.halfExtentKm} km @ {receiverModel.gridConfig.stepKm} km
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex border border-slate-600/70 rounded-xs overflow-hidden">
            {(['kPa', 'MPa'] as const).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUnit(u)}
                className={`px-2 py-1 text-[11px] font-mono font-semibold ${
                  unit === u
                    ? 'bg-slate-800 text-white'
                    : 'bg-[#e4e9f1] text-slate-800 hover:bg-slate-200'
                }`}
              >
                {u}
              </button>
            ))}
          </div>
          <div className="inline-flex items-center gap-2 border border-slate-600/70 rounded-xs bg-[#e4e9f1] px-1.5 py-0.5">
            <div
              className="relative inline-block"
              onMouseEnter={() => setShowLegendTooltip(true)}
              onMouseLeave={() => setShowLegendTooltip(false)}
            >
              <button
                type="button"
                aria-pressed={showLegend}
                aria-label={
                  showLegend
                    ? 'Hide Stress Change Map legend'
                    : 'Show Stress Change Map legend'
                }
                aria-describedby={showLegendTooltip ? 'coulomb-legend-toggle-tooltip' : undefined}
                onFocus={() => setShowLegendTooltip(true)}
                onBlur={() => setShowLegendTooltip(false)}
                onClick={() => setShowLegend((v) => !v)}
                className={`coulomb-stress-legend-toggle inline-flex items-center gap-1.5 px-2.5 py-1 border rounded-xs text-[11px] font-medium transition-colors ${
                  showLegend
                    ? 'bg-slate-800 text-white border-slate-800 hover:bg-slate-900'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                {showLegend ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                {showLegend ? 'Legend: Shown' : 'Legend: Hidden'}
              </button>

              {showLegendTooltip && (
                <div
                  id="coulomb-legend-toggle-tooltip"
                  role="tooltip"
                  className="pointer-events-none absolute left-0 sm:left-auto sm:right-0 top-full mt-1.5 z-50 w-72 max-w-[calc(100vw-2rem)] bg-white border border-slate-300 rounded-xs shadow-md p-2.5 text-[11px] text-slate-700 space-y-1.5"
                >
                  <div className="font-bold text-slate-900 uppercase tracking-wide text-[10px] border-b border-slate-200 pb-1">
                    Stress Legend Color Meaning (ΔCFS)
                  </div>
                  <div className="flex items-start gap-2">
                    <span
                      className="w-3 h-3 mt-0.5 shrink-0 border border-slate-700/40 rounded-xs"
                      style={{ backgroundColor: colorScheme.positiveColor }}
                    />
                    <div>
                      <span className="font-semibold" style={{ color: colorScheme.positiveColor }}>
                        Positive (+ΔCFS):
                      </span>{' '}
                      Failure-promoting stress-loaded lobe (+Δτ or +Δσn unclamping) bringing target faults closer to failure.
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span
                      className="w-3 h-3 mt-0.5 shrink-0 border border-slate-700/40 rounded-xs"
                      style={{ backgroundColor: colorScheme.negativeColor }}
                    />
                    <div>
                      <span className="font-semibold" style={{ color: colorScheme.negativeColor }}>
                        Negative (−ΔCFS):
                      </span>{' '}
                      Failure-inhibiting stress-shadow / clamping lobe opposing slip on the receiver plane.
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span
                      className="w-3 h-3 mt-0.5 shrink-0 border border-slate-400 rounded-xs"
                      style={{ backgroundColor: colorScheme.neutralColor }}
                    />
                    <div>
                      <span className="font-semibold text-slate-800">Neutral (≈ 0):</span>{' '}
                      Negligible static Coulomb stress change.
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-500 border-t border-slate-200 pt-1">
                    Click to show/hide · Drag the legend box on the Section D map to reposition.
                  </div>
                </div>
              )}
            </div>

            <label
              className="inline-flex items-center gap-1.5 px-1 text-[10px] text-slate-700"
              title="Adjust Section D legend background opacity"
            >
              <span className="font-medium whitespace-nowrap">BG Opacity</span>
              <input
                type="range"
                aria-label="Legend background opacity"
                min={0.15}
                max={1}
                step={0.05}
                value={legendBgOpacity}
                onChange={(e) => setLegendBgOpacity(Number(e.target.value))}
                className="w-16 h-1.5 accent-slate-800 cursor-pointer"
              />
              <span className="font-mono tabular-nums w-8 text-right font-semibold text-slate-800">
                {Math.round(legendBgOpacity * 100)}%
              </span>
            </label>
          </div>
          <button
            type="button"
            disabled={!isConfigValid || isComputing}
            onClick={handleRunCalculation}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 text-white font-semibold rounded-xs hover:bg-blue-800 disabled:bg-slate-300 disabled:text-slate-600 transition-colors"
          >
            <Play className="w-3.5 h-3.5" />
            {isComputing ? 'Computing...' : 'Run Calculation'}
          </button>
        </div>
      </div>

      {/* Stale Input Warning Banner */}
      {isStale && (
        <div className="bg-[#fbf5ea] border border-amber-700/70 rounded-lg px-3.5 py-2 flex items-center justify-between gap-2 text-amber-950 shadow-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-700" />
            <span>
              <strong>Inputs changed since last calculation.</strong> Displayed ΔCFS results, map, and sensitivity curves reflect an earlier model state. Re-run calculation to synchronize.
            </span>
          </div>
          <button
            type="button"
            disabled={!isConfigValid || isComputing}
            onClick={handleRunCalculation}
            className="px-2.5 py-1 bg-amber-700 text-white font-semibold rounded-xs hover:bg-amber-800 shrink-0"
          >
            Re-run Now
          </button>
        </div>
      )}

      {/* Five Compact Internal Sections Navigation */}
      <div className="flex flex-wrap gap-1 border-b border-slate-500/60 pb-1.5" role="tablist">
        {sectionButtons.map((b) => (
          <button
            key={b.id}
            type="button"
            role="tab"
            aria-selected={section === b.id}
            onClick={() => setSection(b.id)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 border rounded text-[11px] font-medium transition-colors ${
              section === b.id
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-[#ccd6e5] text-slate-800 border-slate-500/60 hover:bg-[#e1e7f0]'
            }`}
          >
            {b.icon}
            {b.label}
          </button>
        ))}
      </div>

      {/* ================================================================== */}
      {/* SECTION 1: SOURCE FAULT MODEL                                      */}
      {/* ================================================================== */}
      {section === 'source' && (
        <div className="space-y-3">
          {/* Controls & Focal Reference Bar */}
          <div className="bg-[#f3f1fb] border border-indigo-700/60 rounded-lg p-3.5 space-y-3 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-700/35 pb-2">
              <div className="font-bold text-slate-900 uppercase tracking-wide text-[11px]">
                Finite Rectangular Source Fault Segments (Okada 1992)
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleAddBlankSegment}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-800 text-white rounded-xs hover:bg-slate-900"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Segment
                </button>
                <button
                  type="button"
                  onClick={() => setShowImportModal(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 border border-slate-300 bg-white rounded-xs hover:bg-slate-100"
                >
                  <Upload className="w-3.5 h-3.5" /> Import CSV / GeoJSON
                </button>
                <button
                  type="button"
                  onClick={handleLoadHypotheticalBenchmark}
                  className="inline-flex items-center gap-1 px-2.5 py-1 border border-amber-400 bg-amber-50 text-amber-950 rounded-xs hover:bg-amber-100"
                  title="Explicitly labeled synthetic benchmark fault for testing only"
                >
                  <Database className="w-3.5 h-3.5" /> Load Hypothetical Benchmark (Test Only)
                </button>
                {sourceModel.segments.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSourceModel(createEmptySourceModel(event));
                      setResult(null);
                    }}
                    className="inline-flex items-center gap-1 px-2 py-1 border border-slate-300 bg-white text-slate-700 rounded-xs hover:bg-slate-100"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Clear
                  </button>
                )}
              </div>
            </div>

            {/* Optional Starting Orientation Reference from Active Event Focal Mechanism (No Auto-Selection) */}
            <div className="bg-[#e5e1f7] border border-indigo-800/55 rounded p-2.5 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-semibold text-slate-900 text-[11px]">
                  Optional Focal Mechanism Orientation Reference (No Auto-Selection)
                </div>
                {focalAnalysis && focalAnalysis.status === 'computed' && focalAnalysis.plane1 && focalAnalysis.plane2 ? (
                  <div className="text-[11px] text-slate-700 font-mono mt-0.5">
                    Plane 1: {focalAnalysis.plane1.strike}°/{focalAnalysis.plane1.dip}°/{focalAnalysis.plane1.rake}° ·{' '}
                    Plane 2: {focalAnalysis.plane2.strike}°/{focalAnalysis.plane2.dip}°/{focalAnalysis.plane2.rake}°
                    <span className="font-sans text-slate-600 ml-2">
                      (Copies orientation only; rupture dimensions &amp; slip are never inferred from magnitude.)
                    </span>
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-600 mt-0.5">
                    No computed focal mechanism nodal planes available for {event.id}. Enter strike/dip/rake manually or import segments.
                  </div>
                )}
              </div>
              {focalAnalysis && focalAnalysis.status === 'computed' && focalAnalysis.plane1 && focalAnalysis.plane2 && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleImportNodalPlane(focalAnalysis.plane1!, 'Nodal Plane 1')}
                    className="px-2 py-1 border border-indigo-800/55 bg-white rounded-xs hover:bg-slate-100 text-[11px] font-medium"
                  >
                    Use Plane 1
                  </button>
                  <button
                    type="button"
                    onClick={() => handleImportNodalPlane(focalAnalysis.plane2!, 'Nodal Plane 2')}
                    className="px-2 py-1 border border-indigo-800/55 bg-white rounded-xs hover:bg-slate-100 text-[11px] font-medium"
                  >
                    Use Plane 2
                  </button>
                </div>
              )}
            </div>

            {/* Source Segments Table */}
            {sourceModel.segments.length === 0 ? (
              <div className="border border-dashed border-indigo-800/60 bg-[#e5e1f7] rounded p-5 text-center text-slate-700">
                No source fault segments defined. Click <strong>Add Segment</strong>, import CSV/GeoJSON, use a focal mechanism nodal plane, or load the hypothetical test benchmark.
              </div>
            ) : (
              <div className="overflow-x-auto bg-[#f1f4f9] border border-slate-600/70 rounded">
                <table className="w-full text-left border-collapse text-[11px] font-mono tabular-nums">
                  <thead className="bg-[#dfe6f0] text-slate-800 font-sans">
                    <tr>
                      <th className="p-1.5 border-b border-slate-200">Segment Name</th>
                      <th className="p-1.5 border-b border-slate-200">Lat (°N)</th>
                      <th className="p-1.5 border-b border-slate-200">Lon (°E)</th>
                      <th className="p-1.5 border-b border-slate-200">Ref Mode</th>
                      <th className="p-1.5 border-b border-slate-200">Top z (km)</th>
                      <th className="p-1.5 border-b border-slate-200">Strike (°)</th>
                      <th className="p-1.5 border-b border-slate-200">Dip (°)</th>
                      <th className="p-1.5 border-b border-slate-200">Rake (°)</th>
                      <th className="p-1.5 border-b border-slate-200">Len (km)</th>
                      <th className="p-1.5 border-b border-slate-200">Wid (km)</th>
                      <th className="p-1.5 border-b border-slate-200">Slip (m)</th>
                      <th className="p-1.5 border-b border-slate-200">Open (m)</th>
                      <th className="p-1.5 border-b border-slate-200 text-center">Del</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sourceModel.segments.map((seg) => (
                      <tr key={seg.id} className="border-b border-slate-200 hover:bg-slate-50">
                        <td className="p-1">
                          <input
                            type="text"
                            value={seg.name}
                            onChange={(e) => handleUpdateSegment(seg.id, { name: e.target.value })}
                            className="w-36 border border-slate-300 rounded-xs px-1.5 py-0.5 font-sans"
                          />
                        </td>
                        <td className="p-1">
                          <input
                            type="number"
                            step="0.001"
                            value={seg.centerLat}
                            onChange={(e) => handleUpdateSegment(seg.id, { centerLat: Number(e.target.value) })}
                            className="w-20 border border-slate-300 rounded-xs px-1 py-0.5"
                          />
                        </td>
                        <td className="p-1">
                          <input
                            type="number"
                            step="0.001"
                            value={seg.centerLon}
                            onChange={(e) => handleUpdateSegment(seg.id, { centerLon: Number(e.target.value) })}
                            className="w-20 border border-slate-300 rounded-xs px-1 py-0.5"
                          />
                        </td>
                        <td className="p-1">
                          <select
                            value={seg.originMode}
                            onChange={(e) =>
                              handleUpdateSegment(seg.id, {
                                originMode: e.target.value === 'top-center' ? 'top-center' : 'center',
                              })
                            }
                            className="border border-slate-300 rounded-xs px-1 py-0.5 font-sans bg-white"
                          >
                            <option value="center">Center</option>
                            <option value="top-center">Top-Center</option>
                          </select>
                        </td>
                        <td className="p-1">
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            value={seg.topDepthKm}
                            onChange={(e) => handleUpdateSegment(seg.id, { topDepthKm: Number(e.target.value) })}
                            className="w-16 border border-slate-300 rounded-xs px-1 py-0.5"
                          />
                        </td>
                        <td className="p-1">
                          <input
                            type="number"
                            step="1"
                            value={seg.strikeDeg}
                            onChange={(e) => handleUpdateSegment(seg.id, { strikeDeg: Number(e.target.value) })}
                            className="w-16 border border-slate-300 rounded-xs px-1 py-0.5"
                          />
                        </td>
                        <td className="p-1">
                          <input
                            type="number"
                            step="1"
                            min="0"
                            max="90"
                            value={seg.dipDeg}
                            onChange={(e) => handleUpdateSegment(seg.id, { dipDeg: Number(e.target.value) })}
                            className="w-14 border border-slate-300 rounded-xs px-1 py-0.5"
                          />
                        </td>
                        <td className="p-1">
                          <input
                            type="number"
                            step="1"
                            min="-180"
                            max="180"
                            value={seg.rakeDeg}
                            onChange={(e) => handleUpdateSegment(seg.id, { rakeDeg: Number(e.target.value) })}
                            className="w-16 border border-slate-300 rounded-xs px-1 py-0.5"
                          />
                        </td>
                        <td className="p-1">
                          <input
                            type="number"
                            step="1"
                            min="0.1"
                            value={seg.lengthKm}
                            onChange={(e) => handleUpdateSegment(seg.id, { lengthKm: Number(e.target.value) })}
                            className="w-16 border border-slate-300 rounded-xs px-1 py-0.5"
                          />
                        </td>
                        <td className="p-1">
                          <input
                            type="number"
                            step="0.5"
                            min="0.1"
                            value={seg.widthKm}
                            onChange={(e) => handleUpdateSegment(seg.id, { widthKm: Number(e.target.value) })}
                            className="w-16 border border-slate-300 rounded-xs px-1 py-0.5"
                          />
                        </td>
                        <td className="p-1">
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            value={seg.slipM}
                            onChange={(e) => handleUpdateSegment(seg.id, { slipM: Number(e.target.value) })}
                            className="w-16 border border-slate-300 rounded-xs px-1 py-0.5"
                          />
                        </td>
                        <td className="p-1">
                          <input
                            type="number"
                            step="0.05"
                            value={seg.tensileSlipM ?? 0}
                            onChange={(e) =>
                              handleUpdateSegment(seg.id, { tensileSlipM: Number(e.target.value) })
                            }
                            className="w-14 border border-slate-300 rounded-xs px-1 py-0.5"
                          />
                        </td>
                        <td className="p-1 text-center">
                          <button
                            type="button"
                            onClick={() => handleDeleteSegment(seg.id)}
                            className="p-1 text-slate-500 hover:text-red-700"
                            title="Delete segment"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Elastic Parameters & Provenance */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
              <div className="border border-indigo-800/55 rounded p-2.5 space-y-2 bg-[#e5e1f7]">
                <div className="font-bold text-[11px] text-slate-900 uppercase">
                  Half-Space Elastic Parameters
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-0.5">
                    <span className="text-[11px] text-slate-700">Shear Modulus μ (GPa)</span>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      max="200"
                      value={elasticParams.shearModulusGPa}
                      onChange={(e) =>
                        setElasticParams((p) => ({ ...p, shearModulusGPa: Number(e.target.value) }))
                      }
                      className="w-full border border-slate-400 rounded-xs px-2 py-1 bg-white font-mono"
                    />
                  </label>
                  <label className="space-y-0.5">
                    <span className="text-[11px] text-slate-700">Poisson Ratio ν</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="0.49"
                      value={elasticParams.poissonRatio}
                      onChange={(e) =>
                        setElasticParams((p) => ({ ...p, poissonRatio: Number(e.target.value) }))
                      }
                      className="w-full border border-slate-400 rounded-xs px-2 py-1 bg-white font-mono"
                    />
                  </label>
                </div>
              </div>

              <div className="md:col-span-2 border border-indigo-800/55 rounded p-2.5 space-y-1.5 bg-[#e5e1f7]">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[11px] text-slate-900 uppercase">
                    Model Provenance &amp; Documented Assumptions
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 border border-indigo-800/50 bg-white rounded-xs">
                    {sourceModel.provenanceKind}
                  </span>
                </div>
                <input
                  type="text"
                  value={sourceModel.assumptionsNote}
                  onChange={(e) =>
                    setSourceModel((prev) => ({ ...prev, assumptionsNote: e.target.value }))
                  }
                  className="w-full border border-slate-400 rounded-xs px-2 py-1 bg-white text-[11px]"
                />
              </div>
            </div>

            {/* Source Validation Messages */}
            {(sourceValidation.errors.length > 0 || sourceValidation.warnings.length > 0) && (
              <div className="space-y-1">
                {sourceValidation.errors.map((err, i) => (
                  <div
                    key={`se-${i}`}
                    className="bg-red-50 border border-red-300 text-red-900 px-2.5 py-1.5 rounded-xs flex items-center gap-2 text-[11px]"
                  >
                    <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                    <span>{err}</span>
                  </div>
                ))}
                {sourceValidation.warnings.map((w, i) => (
                  <div
                    key={`sw-${i}`}
                    className="bg-amber-50 border border-amber-300 text-amber-950 px-2.5 py-1.5 rounded-xs flex items-center gap-2 text-[11px]"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* SECTION 2: RECEIVER FAULT CONFIGURATION                            */}
      {/* ================================================================== */}
      {section === 'receiver' && (
        <div className="space-y-3">
          <div className="bg-[#eff7f6] border border-teal-700/60 rounded-lg p-3.5 space-y-3 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-teal-700/35 pb-2">
              <div className="font-bold text-slate-900 uppercase tracking-wide text-[11px]">
                Receiver Orientation &amp; Calculation Grid Configuration
              </div>
              <div className="inline-flex border border-teal-800/55 rounded-xs overflow-hidden text-[11px]">
                <button
                  type="button"
                  onClick={() =>
                    setReceiverModel((p) => ({ ...p, mode: 'uniform-orientation' }))
                  }
                  className={`px-2.5 py-1 font-medium ${
                    receiverModel.mode === 'uniform-orientation'
                      ? 'bg-slate-800 text-white'
                      : 'bg-[#d7ebe8] text-slate-800 hover:bg-[#c8e4df]'
                  }`}
                >
                  Uniform Receiver Orientation
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setReceiverModel((p) => ({ ...p, mode: 'explicit-planes' }))
                  }
                  className={`px-2.5 py-1 font-medium ${
                    receiverModel.mode === 'explicit-planes'
                      ? 'bg-slate-800 text-white'
                      : 'bg-[#d7ebe8] text-slate-800 hover:bg-[#c8e4df]'
                  }`}
                >
                  Explicit 3D Receiver Planes
                </button>
              </div>
            </div>

            {/* Uniform Receiver + Grid Config */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="border border-teal-800/65 rounded p-2.5 bg-[#d7ebe8] space-y-2">
                <div className="font-bold text-[11px] text-teal-950">
                  Uniform Receiver Plane (Used for Spatial Grid &amp; Cross-Section)
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono">
                  <label className="space-y-0.5">
                    <span className="font-sans text-[11px] text-slate-600">Strike (°)</span>
                    <input
                      type="number"
                      step="1"
                      value={receiverModel.uniformOrientation.strikeDeg}
                      onChange={(e) =>
                        setReceiverModel((p) => ({
                          ...p,
                          uniformOrientation: {
                            ...p.uniformOrientation,
                            strikeDeg: Number(e.target.value),
                          },
                        }))
                      }
                      className="w-full border border-slate-300 rounded-xs px-1.5 py-1 bg-white"
                    />
                  </label>
                  <label className="space-y-0.5">
                    <span className="font-sans text-[11px] text-slate-600">Dip (°)</span>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      max="90"
                      value={receiverModel.uniformOrientation.dipDeg}
                      onChange={(e) =>
                        setReceiverModel((p) => ({
                          ...p,
                          uniformOrientation: {
                            ...p.uniformOrientation,
                            dipDeg: Number(e.target.value),
                          },
                        }))
                      }
                      className="w-full border border-slate-300 rounded-xs px-1.5 py-1 bg-white"
                    />
                  </label>
                  <label className="space-y-0.5">
                    <span className="font-sans text-[11px] text-slate-600">Rake (°)</span>
                    <input
                      type="number"
                      step="1"
                      min="-180"
                      max="180"
                      value={receiverModel.uniformOrientation.rakeDeg}
                      onChange={(e) =>
                        setReceiverModel((p) => ({
                          ...p,
                          uniformOrientation: {
                            ...p.uniformOrientation,
                            rakeDeg: Number(e.target.value),
                          },
                        }))
                      }
                      className="w-full border border-slate-300 rounded-xs px-1.5 py-1 bg-white"
                    />
                  </label>
                  <label className="space-y-0.5">
                    <span className="font-sans text-[11px] text-slate-600">Friction μ&apos;</span>
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      max="1.2"
                      value={receiverModel.uniformOrientation.muEffective}
                      onChange={(e) =>
                        setReceiverModel((p) => ({
                          ...p,
                          uniformOrientation: {
                            ...p.uniformOrientation,
                            muEffective: Number(e.target.value),
                          },
                        }))
                      }
                      className="w-full border border-slate-300 rounded-xs px-1.5 py-1 bg-white"
                    />
                  </label>
                </div>
              </div>

              <div className="border border-teal-800/65 rounded p-2.5 bg-[#d7ebe8] space-y-2">
                <div className="font-bold text-[11px] text-teal-950">
                  Spatial Evaluation Grid &amp; Target Depth
                </div>
                <div className="grid grid-cols-3 gap-2 font-mono">
                  <label className="space-y-0.5">
                    <span className="font-sans text-[11px] text-slate-600">Half-Extent (km)</span>
                    <input
                      type="number"
                      step="5"
                      min="5"
                      max="300"
                      value={receiverModel.gridConfig.halfExtentKm}
                      onChange={(e) =>
                        setReceiverModel((p) => ({
                          ...p,
                          gridConfig: { ...p.gridConfig, halfExtentKm: Number(e.target.value) },
                        }))
                      }
                      className="w-full border border-slate-300 rounded-xs px-1.5 py-1 bg-white"
                    />
                  </label>
                  <label className="space-y-0.5">
                    <span className="font-sans text-[11px] text-slate-600">Grid Step (km)</span>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="50"
                      value={receiverModel.gridConfig.stepKm}
                      onChange={(e) =>
                        setReceiverModel((p) => ({
                          ...p,
                          gridConfig: { ...p.gridConfig, stepKm: Number(e.target.value) },
                        }))
                      }
                      className="w-full border border-slate-300 rounded-xs px-1.5 py-1 bg-white"
                    />
                  </label>
                  <label className="space-y-0.5">
                    <span className="font-sans text-[11px] text-slate-600">Target Depth (km)</span>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      max="200"
                      value={receiverModel.gridConfig.targetDepthKm}
                      onChange={(e) =>
                        setReceiverModel((p) => ({
                          ...p,
                          gridConfig: { ...p.gridConfig, targetDepthKm: Number(e.target.value) },
                        }))
                      }
                      className="w-full border border-slate-300 rounded-xs px-1.5 py-1 bg-white"
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* Optional Vertical Cross-Section Profile */}
            <div className="border border-teal-800/65 rounded p-2.5 bg-[#d7ebe8] space-y-2">
              <label className="inline-flex items-center gap-2 font-semibold text-[11px] text-teal-950 cursor-pointer">
                <input
                  type="checkbox"
                  checked={receiverModel.gridConfig.crossSectionEnabled}
                  onChange={(e) =>
                    setReceiverModel((p) => ({
                      ...p,
                      gridConfig: { ...p.gridConfig, crossSectionEnabled: e.target.checked },
                    }))
                  }
                />
                <span>Enable Vertical Cross-Section Profile (A–A&apos;)</span>
              </label>
              {receiverModel.gridConfig.crossSectionEnabled && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono">
                  <label className="space-y-0.5">
                    <span className="font-sans text-[11px] text-slate-600">Azimuth (°)</span>
                    <input
                      type="number"
                      step="5"
                      value={receiverModel.gridConfig.profileAzimuthDeg}
                      onChange={(e) =>
                        setReceiverModel((p) => ({
                          ...p,
                          gridConfig: {
                            ...p.gridConfig,
                            profileAzimuthDeg: Number(e.target.value),
                          },
                        }))
                      }
                      className="w-full border border-slate-300 rounded-xs px-1.5 py-1 bg-white"
                    />
                  </label>
                  <label className="space-y-0.5">
                    <span className="font-sans text-[11px] text-slate-600">Half-Length (km)</span>
                    <input
                      type="number"
                      step="5"
                      value={receiverModel.gridConfig.profileHalfLengthKm}
                      onChange={(e) =>
                        setReceiverModel((p) => ({
                          ...p,
                          gridConfig: {
                            ...p.gridConfig,
                            profileHalfLengthKm: Number(e.target.value),
                          },
                        }))
                      }
                      className="w-full border border-slate-300 rounded-xs px-1.5 py-1 bg-white"
                    />
                  </label>
                  <label className="space-y-0.5">
                    <span className="font-sans text-[11px] text-slate-600">Max Depth (km)</span>
                    <input
                      type="number"
                      step="1"
                      value={receiverModel.gridConfig.profileMaxDepthKm}
                      onChange={(e) =>
                        setReceiverModel((p) => ({
                          ...p,
                          gridConfig: {
                            ...p.gridConfig,
                            profileMaxDepthKm: Number(e.target.value),
                          },
                        }))
                      }
                      className="w-full border border-slate-300 rounded-xs px-1.5 py-1 bg-white"
                    />
                  </label>
                  <label className="space-y-0.5">
                    <span className="font-sans text-[11px] text-slate-600">Depth Step (km)</span>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      value={receiverModel.gridConfig.profileDepthStepKm}
                      onChange={(e) =>
                        setReceiverModel((p) => ({
                          ...p,
                          gridConfig: {
                            ...p.gridConfig,
                            profileDepthStepKm: Number(e.target.value),
                          },
                        }))
                      }
                      className="w-full border border-slate-300 rounded-xs px-1.5 py-1 bg-white"
                    />
                  </label>
                </div>
              )}
            </div>

            {/* Explicit 3D Receiver Planes Table */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[11px] text-slate-800 uppercase">
                  Explicit 3D Receiver Planes ({receiverModel.explicitReceivers.length})
                </span>
                <button
                  type="button"
                  onClick={() => handleAddReceiver()}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-800 text-white rounded-xs hover:bg-slate-900"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Receiver Plane
                </button>
              </div>
              {receiverModel.explicitReceivers.length === 0 ? (
                <div className="border border-dashed border-teal-800/60 bg-[#d7ebe8] rounded p-3 text-slate-700 text-[11px]">
                  No explicit receiver planes defined. In Uniform Orientation mode, representative off-fault evaluation points will be computed automatically alongside the full spatial grid.
                </div>
              ) : (
                <div className="overflow-x-auto bg-[#f1f4f9] border border-slate-600/70 rounded">
                  <table className="w-full text-left border-collapse text-[11px] font-mono tabular-nums">
                    <thead className="bg-[#dfe6f0] text-slate-800 font-sans">
                      <tr>
                        <th className="p-1.5 border-b border-slate-200">Receiver Name</th>
                        <th className="p-1.5 border-b border-slate-200">Lat (°N)</th>
                        <th className="p-1.5 border-b border-slate-200">Lon (°E)</th>
                        <th className="p-1.5 border-b border-slate-200">Depth (km)</th>
                        <th className="p-1.5 border-b border-slate-200">Strike (°)</th>
                        <th className="p-1.5 border-b border-slate-200">Dip (°)</th>
                        <th className="p-1.5 border-b border-slate-200">Rake (°)</th>
                        <th className="p-1.5 border-b border-slate-200">μ&apos;</th>
                        <th className="p-1.5 border-b border-slate-200 text-center">Del</th>
                      </tr>
                    </thead>
                    <tbody>
                      {receiverModel.explicitReceivers.map((rcv) => (
                        <tr key={rcv.id} className="border-b border-slate-200">
                          <td className="p-1">
                            <input
                              type="text"
                              value={rcv.name}
                              onChange={(e) =>
                                handleUpdateReceiver(rcv.id, { name: e.target.value })
                              }
                              className="w-36 border border-slate-300 rounded-xs px-1.5 py-0.5 font-sans"
                            />
                          </td>
                          <td className="p-1">
                            <input
                              type="number"
                              step="0.001"
                              value={rcv.lat}
                              onChange={(e) =>
                                handleUpdateReceiver(rcv.id, { lat: Number(e.target.value) })
                              }
                              className="w-20 border border-slate-300 rounded-xs px-1 py-0.5"
                            />
                          </td>
                          <td className="p-1">
                            <input
                              type="number"
                              step="0.001"
                              value={rcv.lon}
                              onChange={(e) =>
                                handleUpdateReceiver(rcv.id, { lon: Number(e.target.value) })
                              }
                              className="w-20 border border-slate-300 rounded-xs px-1 py-0.5"
                            />
                          </td>
                          <td className="p-1">
                            <input
                              type="number"
                              step="0.5"
                              min="0"
                              value={rcv.depthKm}
                              onChange={(e) =>
                                handleUpdateReceiver(rcv.id, { depthKm: Number(e.target.value) })
                              }
                              className="w-16 border border-slate-300 rounded-xs px-1 py-0.5"
                            />
                          </td>
                          <td className="p-1">
                            <input
                              type="number"
                              step="1"
                              value={rcv.strikeDeg}
                              onChange={(e) =>
                                handleUpdateReceiver(rcv.id, { strikeDeg: Number(e.target.value) })
                              }
                              className="w-16 border border-slate-300 rounded-xs px-1 py-0.5"
                            />
                          </td>
                          <td className="p-1">
                            <input
                              type="number"
                              step="1"
                              min="0"
                              max="90"
                              value={rcv.dipDeg}
                              onChange={(e) =>
                                handleUpdateReceiver(rcv.id, { dipDeg: Number(e.target.value) })
                              }
                              className="w-14 border border-slate-300 rounded-xs px-1 py-0.5"
                            />
                          </td>
                          <td className="p-1">
                            <input
                              type="number"
                              step="1"
                              min="-180"
                              max="180"
                              value={rcv.rakeDeg}
                              onChange={(e) =>
                                handleUpdateReceiver(rcv.id, { rakeDeg: Number(e.target.value) })
                              }
                              className="w-16 border border-slate-300 rounded-xs px-1 py-0.5"
                            />
                          </td>
                          <td className="p-1">
                            <input
                              type="number"
                              step="0.05"
                              min="0"
                              max="1.2"
                              value={rcv.muEffective}
                              onChange={(e) =>
                                handleUpdateReceiver(rcv.id, { muEffective: Number(e.target.value) })
                              }
                              className="w-14 border border-slate-300 rounded-xs px-1 py-0.5"
                            />
                          </td>
                          <td className="p-1 text-center">
                            <button
                              type="button"
                              onClick={() =>
                                setReceiverModel((p) => ({
                                  ...p,
                                  explicitReceivers: p.explicitReceivers.filter(
                                    (x) => x.id !== rcv.id
                                  ),
                                }))
                              }
                              className="p-1 text-slate-500 hover:text-red-700"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Optional PHIVOLCS Mapped Active Fault Geographic Reference */}
            <div className="border border-amber-800/60 rounded p-2.5 bg-[#f3e6cc] space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-bold text-[11px] text-slate-900">
                  PHIVOLCS Mapped Active Fault Traces (Geographic Reference Only — within 250 km)
                </div>
                <span className="text-[10px] text-amber-900 font-medium">
                  Warning: 2D surface traces do NOT specify 3D dip, rake, or seismogenic depth.
                </span>
              </div>
              {nearbyFaultRefs.length === 0 ? (
                <div className="text-[11px] text-slate-600">
                  No mapped PHIVOLCS fault traces found within 250 km of reference origin.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                  {nearbyFaultRefs.slice(0, 6).map((rf, idx) => (
                    <div
                      key={`rf-${idx}`}
                      className="bg-[#fbf5ea] border border-amber-800/55 rounded p-2 flex items-center justify-between gap-2 text-[11px]"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-800 truncate">{rf.name}</div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {rf.distKm.toFixed(1)} km · Az~{rf.approxStrikeDeg}° · {rf.mechanism}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          handleAddReceiver({
                            name: `${rf.name.slice(0, 18)} Pt`,
                            lat: rf.midLat,
                            lon: rf.midLon,
                            strikeDeg: rf.approxStrikeDeg,
                          })
                        }
                        className="px-2 py-0.5 border border-slate-300 bg-slate-50 hover:bg-slate-100 rounded-xs shrink-0 text-[10px] font-medium"
                      >
                        Seed Loc/Strike
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Receiver Validation Messages */}
            {(receiverValidation.errors.length > 0 || receiverValidation.warnings.length > 0) && (
              <div className="space-y-1">
                {receiverValidation.errors.map((err, i) => (
                  <div
                    key={`re-${i}`}
                    className="bg-red-50 border border-red-300 text-red-900 px-2.5 py-1.5 rounded-xs flex items-center gap-2 text-[11px]"
                  >
                    <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                    <span>{err}</span>
                  </div>
                ))}
                {receiverValidation.warnings.map((w, i) => (
                  <div
                    key={`rw-${i}`}
                    className="bg-amber-50 border border-amber-300 text-amber-950 px-2.5 py-1.5 rounded-xs flex items-center gap-2 text-[11px]"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* SECTION 3: COULOMB STRESS CALCULATION & RESULTS                    */}
      {/* ================================================================== */}
      {section === 'calculate' && (
        <div className="space-y-3">
          {/* Disclaimer Banner */}
          <div className="bg-[#fbf5ea] border border-amber-700/60 rounded-lg px-3.5 py-2 text-[11px] text-slate-800 shadow-xs">
            <strong>Physical Scope Limitation:</strong> Static ΔCFS = Δτ + μ&apos;Δσn quantifies elastic stress transfer resolved onto specified receiver fault planes. Positive ΔCFS indicates static stress loading relative to the assumed receiver geometry/rake; it is <strong>not</strong> an earthquake probability, aftershock rate, or deterministic forecast.
          </div>

          {!result || result.status === 'Invalid Configuration' ? (
            <div className="bg-[#f3f1fb] border border-indigo-700/60 rounded-lg p-5 space-y-2 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
              <div className="font-bold text-slate-900 text-xs">
                {result?.status === 'Invalid Configuration'
                  ? 'Calculation Blocked: Invalid Configuration'
                  : 'Calculation Not Yet Executed'}
              </div>
              {result?.errors.map((e, i) => (
                <div key={`ce-${i}`} className="text-red-800 text-[11px]">
                  • {e}
                </div>
              ))}
              {!result && (
                <div className="text-slate-600 text-[11px]">
                  Verify your source fault segment(s) and receiver configuration, then click{' '}
                  <strong>Run Calculation</strong>.
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Key Output Readouts */}
              <div className="bg-[#eff7f6] border border-teal-700/60 rounded-lg p-3 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)] grid grid-cols-2 sm:grid-cols-5 gap-2">
                <div className="bg-[#d7ebe8] border border-teal-800/65 rounded p-2.5">
                  <div className="text-[10px] text-teal-900 font-semibold uppercase">Seismic Moment M₀</div>
                  <div className="text-sm font-bold font-mono tabular-nums text-slate-900">
                    {result.sourceMomentNm.toExponential(2)} N·m
                  </div>
                  <div className="text-[10px] text-slate-600 font-mono">
                    Equiv Mw {result.equivalentMw?.toFixed(2) ?? '—'}
                  </div>
                </div>
                <div className="bg-[#d7ebe8] border border-teal-800/65 rounded p-2.5">
                  <div className="text-[10px] text-teal-900 font-semibold uppercase">Peak +ΔCFS (Grid)</div>
                  <div className="text-sm font-bold font-mono tabular-nums text-red-700">
                    {formatStressValue(result.maxPositiveCfsKPa, unit)}
                  </div>
                  <div className="text-[10px] text-slate-600">Stress Loaded Lobe</div>
                </div>
                <div className="bg-[#d7ebe8] border border-teal-800/65 rounded p-2.5">
                  <div className="text-[10px] text-teal-900 font-semibold uppercase">Peak −ΔCFS (Grid)</div>
                  <div className="text-sm font-bold font-mono tabular-nums text-blue-700">
                    {formatStressValue(result.maxNegativeCfsKPa, unit)}
                  </div>
                  <div className="text-[10px] text-slate-600">Stress Shadow Lobe</div>
                </div>
                <div className="bg-[#d7ebe8] border border-teal-800/65 rounded p-2.5">
                  <div className="text-[10px] text-teal-900 font-semibold uppercase">Grid &amp; Depth</div>
                  <div className="text-sm font-bold font-mono tabular-nums text-slate-900">
                    {result.gridCols}×{result.gridRows} ({result.gridCells.length})
                  </div>
                  <div className="text-[10px] text-slate-600 font-mono">
                    @ {result.targetDepthKm} km depth
                  </div>
                </div>
                <div className="bg-[#d7ebe8] border border-teal-800/65 rounded p-2.5">
                  <div className="text-[10px] text-teal-900 font-semibold uppercase">Near-Fault Singular</div>
                  <div className="text-sm font-bold font-mono tabular-nums text-slate-900">
                    {result.nearFaultFlaggedCount} cell(s)
                  </div>
                  <div className="text-[10px] text-slate-600">Within 50 m of edge</div>
                </div>
              </div>

              {/* Pointwise Receiver Table */}
              <div className="bg-[#f1f4f9] border border-slate-600/70 rounded-lg p-3 space-y-2 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 text-xs">
                    Pointwise Resolved Stress Components &amp; Regime Classification
                  </span>
                  <span className="text-[10px] font-mono text-slate-600">
                    Computed {result.computedAtUtc}
                  </span>
                </div>
                <div className="overflow-x-auto border border-slate-600/50 rounded">
                  <table className="w-full text-left border-collapse text-[11px] font-mono tabular-nums">
                    <thead className="bg-[#dfe6f0] text-slate-800 font-sans">
                      <tr>
                        <th className="p-1.5 border-b border-slate-200">Point</th>
                        <th className="p-1.5 border-b border-slate-200">Pos (Lat, Lon)</th>
                        <th className="p-1.5 border-b border-slate-200">Depth</th>
                        <th className="p-1.5 border-b border-slate-200">Plane (S/D/R · μ&apos;)</th>
                        <th className="p-1.5 border-b border-slate-200">Δτ (Shear)</th>
                        <th className="p-1.5 border-b border-slate-200">Δσn (+Unclamp)</th>
                        <th className="p-1.5 border-b border-slate-200">ΔCFS</th>
                        <th className="p-1.5 border-b border-slate-200">Regime Class</th>
                        <th className="p-1.5 border-b border-slate-200">Disp E/N/U (mm)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.pointEvaluations.map((pt) => (
                        <tr key={pt.id} className="border-b border-slate-200">
                          <td className="p-1.5 font-sans font-semibold text-slate-900">
                            {pt.name}
                          </td>
                          <td className="p-1.5">
                            {pt.lat.toFixed(3)}, {pt.lon.toFixed(3)}
                          </td>
                          <td className="p-1.5">{pt.depthKm.toFixed(1)} km</td>
                          <td className="p-1.5">
                            {pt.strikeDeg.toFixed(0)}/{pt.dipDeg.toFixed(0)}/{pt.rakeDeg.toFixed(0)} ·{' '}
                            {pt.muEffective.toFixed(2)}
                          </td>
                          <td className="p-1.5">{formatStressValue(pt.deltaShearKPa, unit)}</td>
                          <td className="p-1.5">{formatStressValue(pt.deltaNormalKPa, unit)}</td>
                          <td
                            className={`p-1.5 font-bold ${
                              pt.deltaCfsKPa > 1
                                ? 'text-red-700'
                                : pt.deltaCfsKPa < -1
                                  ? 'text-blue-700'
                                  : 'text-slate-700'
                            }`}
                          >
                            {formatStressValue(pt.deltaCfsKPa, unit)}
                          </td>
                          <td className="p-1.5 font-sans">{pt.stressRegimeClass}</td>
                          <td className="p-1.5">
                            {pt.displacementMm.e.toFixed(1)} / {pt.displacementMm.n.toFixed(1)} /{' '}
                            {pt.displacementMm.u.toFixed(1)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Depth & Friction Sensitivity Charts */}
              <CoulombSensitivityCharts result={result} unit={unit} />
            </>
          )}
        </div>
      )}

      {/* ================================================================== */}
      {/* SECTION 4: STRESS CHANGE MAP                                       */}
      {/* ================================================================== */}
      {section === 'map' && (
        <CoulombStressMapView
          event={event}
          segments={sourceModel.segments}
          receiverModel={receiverModel}
          result={result}
          isStale={isStale}
          unit={unit}
          clampKPa={clampKPa}
          stressRange={stressRange}
          onChangeStressRange={setStressRange}
          showLegend={showLegend}
          onToggleLegend={() => setShowLegend((v) => !v)}
          legendPos={legendPos}
          onChangeLegendPos={setLegendPos}
          colorScheme={colorScheme}
          onChangeColorScheme={setColorScheme}
          legendBgOpacity={legendBgOpacity}
          onChangeLegendBgOpacity={setLegendBgOpacity}
          onChangeClampKPa={(val) => {
            setClampKPa(val);
            setStressRange({ minKPa: -val, maxKPa: val });
          }}
          onChangeTargetDepthKm={(depthKm) =>
            setReceiverModel((p) => ({
              ...p,
              gridConfig: { ...p.gridConfig, targetDepthKm: depthKm },
            }))
          }
          onNotice={onNotice}
        />
      )}

      {/* ================================================================== */}
      {/* SECTION 5: QUALITY ASSESSMENT & EXPORT                             */}
      {/* ================================================================== */}
      {section === 'quality' && (
        <div className="space-y-3">
          {/* Scientific Quality Audit */}
          <div className="bg-[#fbf5ea] border border-amber-700/60 rounded-lg p-3.5 space-y-2.5 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-700/35 pb-1.5">
              <span className="font-bold text-slate-900 uppercase tracking-wide text-[11px]">
                Scientific Quality Audit &amp; Documented Formulation
              </span>
              <span className="font-mono text-[10px] px-2 py-0.5 border border-amber-800/60 bg-[#f3e6cc] text-amber-950 rounded-xs font-semibold">
                Status: {result?.status ?? 'Not Run'} (No empirical rupture validation asserted)
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
              <div className="space-y-1.5 bg-[#f3e6cc] border border-amber-800/60 rounded p-2.5">
                <div>
                  <strong>Solver Identity:</strong> {COULOMB_SOLVER_IDENTITY} ({COULOMB_SOLVER_VERSION})
                </div>
                <div>
                  <strong>Sign Convention:</strong> {COULOMB_SIGN_CONVENTION}
                </div>
                <div>
                  <strong>Elastic Medium:</strong> Homogeneous, isotropic half-space (μ ={' '}
                  {elasticParams.shearModulusGPa} GPa, ν = {elasticParams.poissonRatio})
                </div>
                <div>
                  <strong>Source Model Provenance:</strong> {sourceModel.provenanceKind} (
                  {sourceModel.segments.length} segment(s))
                </div>
              </div>
              <div className="space-y-1.5 bg-[#f3e6cc] border border-amber-800/60 rounded p-2.5">
                <div>
                  <strong>Source Validation:</strong>{' '}
                  {sourceValidation.valid
                    ? 'Valid 3D dislocation geometry'
                    : `${sourceValidation.errors.length} error(s)`}
                </div>
                <div>
                  <strong>Receiver Validation:</strong>{' '}
                  {receiverValidation.valid
                    ? `Valid (${receiverModel.mode})`
                    : `${receiverValidation.errors.length} error(s)`}
                </div>
                <div>
                  <strong>Grid Resolution:</strong> ±{receiverModel.gridConfig.halfExtentKm} km at{' '}
                  {receiverModel.gridConfig.stepKm} km step @ {receiverModel.gridConfig.targetDepthKm} km depth
                </div>
                <div>
                  <strong>Near-Fault Singularity Count:</strong>{' '}
                  {result ? `${result.nearFaultFlaggedCount} grid cell(s) within 50 m` : 'Pending calculation'}
                </div>
              </div>
            </div>

            <div className="bg-[#f3e6cc] border border-amber-800/60 rounded p-2.5 text-[11px] text-slate-800 space-y-1">
              <div className="font-bold text-slate-900">Explicit Limitations</div>
              <ul className="list-disc pl-5 space-y-0.5">
                <li>Uniform slip on planar rectangular segments neglects heterogeneous asperities and crustal layering/topography.</li>
                <li>Elastic half-space assumes static instantaneous response without viscoelastic or poroelastic relaxation.</li>
                <li>Receiver stress resolution depends strongly on assumed strike, dip, rake, and effective friction μ&apos;.</li>
                <li>Static ΔCFS is a mechanical stress perturbation metric — not an earthquake occurrence probability or prediction.</li>
              </ul>
            </div>
          </div>

          {/* Export Suite */}
          <div className="bg-[#eef7f2] border border-emerald-700/60 rounded-lg p-3.5 space-y-2 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
            <div className="font-bold text-slate-900 uppercase tracking-wide text-[11px] border-b border-emerald-700/35 pb-1">
              Reproducible Scientific Exports
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  const json = exportCoulombReproducibleJson({
                    event,
                    sourceModel,
                    receiverModel,
                    elasticParams,
                    result,
                    isStale,
                  });
                  triggerTextDownload(`coulomb_analysis_${event.id}.json`, json, 'application/json');
                  onNotice?.(`Exported coulomb_analysis_${event.id}.json`);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-emerald-800/55 bg-[#d8ede2] rounded hover:bg-[#c8e4d5] font-medium"
              >
                <Download className="w-3.5 h-3.5" /> Export Reproducible JSON
              </button>
              <button
                type="button"
                disabled={!result || result.gridCells.length === 0}
                onClick={() => {
                  if (!result) return;
                  triggerTextDownload(
                    `coulomb_grid_${event.id}.csv`,
                    exportCoulombGridCsv(result),
                    'text/csv'
                  );
                  onNotice?.(`Exported coulomb_grid_${event.id}.csv`);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-emerald-800/55 bg-[#d8ede2] rounded hover:bg-[#c8e4d5] disabled:opacity-50 font-medium"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" /> Export Grid CSV
              </button>
              <button
                type="button"
                disabled={!result || result.pointEvaluations.length === 0}
                onClick={() => {
                  if (!result) return;
                  triggerTextDownload(
                    `coulomb_receivers_${event.id}.csv`,
                    exportCoulombPointsCsv(result),
                    'text/csv'
                  );
                  onNotice?.(`Exported coulomb_receivers_${event.id}.csv`);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-emerald-800/55 bg-[#d8ede2] rounded hover:bg-[#c8e4d5] disabled:opacity-50 font-medium"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" /> Export Receiver Points CSV
              </button>
            </div>
          </div>

          {/* Backend Named Configuration Archive (Separate from Official EQP Events) */}
          <div className="bg-[#f1f4f9] border border-slate-600/70 rounded-lg p-3.5 space-y-2.5 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-600/35 pb-1">
              <span className="font-bold text-slate-900 uppercase tracking-wide text-[11px]">
                Saved Coulomb Stress Configurations (Research Archive)
              </span>
              <span className="text-[10px] text-slate-600">
                Stored separately from official EQP catalog/bulletin events
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder={`Scenario name (e.g. ${event.id} Nodal Plane 1)`}
                value={configNameInput}
                onChange={(e) => setConfigNameInput(e.target.value)}
                className="flex-1 min-w-[220px] border border-slate-400 rounded-xs px-2.5 py-1.5 bg-white"
              />
              <button
                type="button"
                onClick={() => void handleSaveConfig()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 text-white rounded-xs hover:bg-slate-900 font-medium"
              >
                <Save className="w-3.5 h-3.5" /> Save Configuration
              </button>
            </div>
            {configStatusMsg && (
              <div className="text-[11px] text-slate-800 bg-[#dfe6f0] border border-slate-700/60 px-2.5 py-1 rounded">
                {configStatusMsg}
              </div>
            )}

            {isLoadingConfigs ? (
              <div className="text-slate-600 text-[11px]">Loading saved configurations...</div>
            ) : savedConfigs.length === 0 ? (
              <div className="text-slate-600 text-[11px] bg-[#dfe6f0] border border-slate-700/60 rounded p-2.5">
                No saved Coulomb stress configurations yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-600/35 bg-[#dfe6f0] border border-slate-700/60 rounded">
                {savedConfigs.map((cfg) => (
                  <div
                    key={cfg.id}
                    className="p-2 flex flex-wrap items-center justify-between gap-2 text-[11px]"
                  >
                    <div>
                      <div className="font-semibold text-slate-900">{cfg.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        Ref: {cfg.referenceEventId || '—'} · {cfg.sourceModel.segments.length} seg(s) · Saved{' '}
                        {cfg.savedAtUtc.slice(0, 19).replace('T', ' ')}Z
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleLoadConfig(cfg)}
                        className="px-2.5 py-1 border border-slate-300 bg-white rounded-xs hover:bg-slate-100 font-medium"
                      >
                        Load
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteConfig(cfg.id)}
                        className="p-1 border border-slate-300 bg-white rounded-xs hover:bg-red-50 text-slate-600 hover:text-red-700"
                        title="Delete saved configuration"
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
      )}

      {/* ================================================================== */}
      {/* CSV / GeoJSON Source Segment Import Modal                          */}
      {/* ================================================================== */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-400 rounded-xs max-w-2xl w-full p-4 space-y-3 shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <span className="font-bold text-slate-900">
                Import Source Fault Segments (CSV or GeoJSON)
              </span>
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="px-2 py-0.5 border border-slate-300 rounded-xs hover:bg-slate-100"
              >
                Close
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex border border-slate-300 rounded-xs overflow-hidden text-[11px]">
                <button
                  type="button"
                  onClick={() => setImportFormat('csv')}
                  className={`px-2.5 py-1 font-medium ${
                    importFormat === 'csv' ? 'bg-slate-800 text-white' : 'bg-white text-slate-700'
                  }`}
                >
                  CSV
                </button>
                <button
                  type="button"
                  onClick={() => setImportFormat('geojson')}
                  className={`px-2.5 py-1 font-medium ${
                    importFormat === 'geojson'
                      ? 'bg-slate-800 text-white'
                      : 'bg-white text-slate-700'
                  }`}
                >
                  GeoJSON
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,.json,.geojson"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  void file.text().then((txt) => setImportText(txt));
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-2.5 py-1 border border-slate-300 bg-white rounded-xs hover:bg-slate-100 text-[11px] font-medium"
              >
                Choose File...
              </button>
            </div>

            <div className="text-[11px] text-slate-600 font-mono bg-slate-50 border border-slate-200 p-2 rounded-xs">
              {importFormat === 'csv'
                ? 'CSV columns: name,lat,lon,top_depth_km,strike,dip,rake,length_km,width_km,slip_m'
                : 'GeoJSON FeatureCollection with Point/LineString geometry & properties: dip_deg, rake_deg, width_km, slip_m, strike_deg, length_km, top_depth_km'}
            </div>

            <textarea
              rows={7}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={
                importFormat === 'csv'
                  ? 'name,lat,lon,top_depth_km,strike,dip,rake,length_km,width_km,slip_m\nSeg-A,14.50,121.00,2,0,90,180,25,12,1.2'
                  : '{"type":"FeatureCollection","features":[...]}'
              }
              className="w-full border border-slate-300 rounded-xs p-2 font-mono text-[11px]"
            />

            {importErrors.map((err, i) => (
              <div
                key={`ie-${i}`}
                className="text-red-800 bg-red-50 border border-red-300 px-2 py-1 rounded-xs text-[11px]"
              >
                {err}
              </div>
            ))}
            {importWarnings.map((w, i) => (
              <div
                key={`iw-${i}`}
                className="text-amber-900 bg-amber-50 border border-amber-300 px-2 py-1 rounded-xs text-[11px]"
              >
                {w}
              </div>
            ))}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="px-3 py-1.5 border border-slate-300 rounded-xs hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!importText.trim()}
                onClick={handleApplyImport}
                className="px-3 py-1.5 bg-blue-700 text-white rounded-xs hover:bg-blue-800 disabled:bg-slate-300 font-semibold"
              >
                Parse &amp; Append Segments
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
