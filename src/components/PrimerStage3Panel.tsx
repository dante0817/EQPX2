import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Clock,
  Database,
  FileSpreadsheet,
  FolderSync,
  Globe,
  Layers,
  Map as MapIcon,
  RefreshCw,
  SlidersHorizontal,
  Table2,
  Upload,
} from 'lucide-react';
import { isEventUnlocated, type EQPEvent } from '../data/eqpData';
import type { SavedSequenceInvestigation } from '../utils/earthquakeSequence';
import {
  updatePrimerSequenceHistoricalAnalysis,
  type PrimerDocument,
} from '../utils/earthquakePrimer';
import {
  CATALOG_SERVICE_ADAPTERS,
  computeCatalogCoverageSummary,
  fetchSharedResearchCatalog,
  importCatalogToSharedEndpoint,
  queryUsgsFdsnCatalogAdapter,
  validateAndMergeLocalCatalog,
  type PrimerCatalogStateSnapshot,
} from '../utils/primerCatalogAdapters';
import type { PrimerMapTheme, PrimerNearestCityPin } from '../utils/primerMapFigure';
import {
  buildPrimerStage3Package,
  computeStage3InputFingerprint,
  DEFAULT_PRIMER_SEQUENCE_CONFIG,
  type PrimerSequenceAnalysisConfig,
  type PrimerStage3FigureSvg,
  type PrimerStage3Package,
} from '../utils/primerSequenceIntegration';

interface PrimerStage3PanelProps {
  event: EQPEvent;
  primer: PrimerDocument;
  primaryLocationLabel: string;
  isPlotResultStale: boolean;
  nearestCitiesPins: PrimerNearestCityPin[];
  mapTheme: PrimerMapTheme;
  onUpdatePrimer: (next: PrimerDocument, notice?: string) => void;
  onStage3FingerprintChange?: (fp: string | undefined) => void;
  onNotice?: (msg: string) => void;
  readOnly?: boolean;
}

type Stage3Tab = 'stats' | 'map' | 'timeline' | 'magnitude' | 'historical';

function svgToDataUri(svg: string): string {
  if (!svg) return '';
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const PrimerStage3Panel: React.FC<PrimerStage3PanelProps> = ({
  event,
  primer,
  primaryLocationLabel,
  isPlotResultStale,
  nearestCitiesPins,
  mapTheme,
  onUpdatePrimer,
  onStage3FingerprintChange,
  onNotice,
  readOnly = false,
}) => {
  const [catalogState, setCatalogState] = useState<PrimerCatalogStateSnapshot>(() => ({
    records: [],
    catalogVersion: 0,
    updatedAtUtc: new Date().toISOString(),
    sourceKind: 'shared-research-catalog',
    sourceLabel: 'Shared EQP Research Historical Catalog',
    coverage: computeCatalogCoverageSummary([]),
    lastImportAudit: null,
  }));
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [usgsLoading, setUsgsLoading] = useState(false);

  const [savedInvestigations, setSavedInvestigations] = useState<SavedSequenceInvestigation[]>([]);
  const [selectedInvestigationId, setSelectedInvestigationId] = useState<string>('');

  const [config, setConfig] = useState<PrimerSequenceAnalysisConfig>(
    () =>
      primer.extensions?.sequenceHistoricalAnalysis?.config ?? {
        ...DEFAULT_PRIMER_SEQUENCE_CONFIG,
        mapTheme,
      }
  );

  const [activeTab, setActiveTab] = useState<Stage3Tab>('stats');
  const [showFilters, setShowFilters] = useState(false);
  const [showCatalogDrawer, setShowCatalogDrawer] = useState(false);

  // Local / Shared catalog import drawer controls
  const [importFormat, setImportFormat] = useState<'csv' | 'geojson'>('csv');
  const [importSourceLabel, setImportSourceLabel] = useState('Local PHIVOLCS / Station Catalog');
  const [importVersionLabel, setImportVersionLabel] = useState('local-v1');
  const [importText, setImportText] = useState('');
  const [persistImportToShared, setPersistImportToShared] = useState(true);
  const [importBusy, setImportBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Sync config when switching primer draft IDs or restoring from a historical revision
  useEffect(() => {
    const existingCfg = primer.extensions?.sequenceHistoricalAnalysis?.config;
    if (existingCfg) {
      setConfig(existingCfg);
    } else {
      setConfig((prev) => ({ ...prev, mapTheme }));
    }
  }, [primer.id, primer.extensions?.reviewVersioning?.restoredFromRevisionId]);

  // Keep mapTheme synced when user changes Stage 2 theme unless already diverged
  useEffect(() => {
    setConfig((prev) => (prev.mapTheme === mapTheme ? prev : { ...prev, mapTheme }));
  }, [mapTheme]);

  // Load shared catalog and saved investigations on mount
  const loadSharedCatalogAndInvestigations = async (silent = false) => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const [catSnap, invResp] = await Promise.all([
        fetchSharedResearchCatalog(),
        fetch('/api/research/sequence-investigations').catch(() => null),
      ]);
      setCatalogState(catSnap);
      if (invResp && invResp.ok) {
        const invJson = await invResp.json().catch(() => null);
        if (invJson && Array.isArray(invJson.investigations)) {
          setSavedInvestigations(invJson.investigations as SavedSequenceInvestigation[]);
        }
      }
      if (!silent) {
        onNotice?.(
          `Synced ${catSnap.records.length} catalog record(s) (v${catSnap.catalogVersion}) for Primer Stage 3`
        );
      }
    } catch (err) {
      setCatalogError(
        err instanceof Error ? err.message : 'Failed to load shared earthquake catalog.'
      );
    } finally {
      setCatalogLoading(false);
    }
  };

  useEffect(() => {
    void loadSharedCatalogAndInvestigations(true);
  }, []);

  const currentStage3Fingerprint = useMemo(
    () =>
      computeStage3InputFingerprint({
        event,
        primaryLocationLabel,
        isPlotResultStale,
        catalogVersion: catalogState.catalogVersion,
        catalogCount: catalogState.records.length,
        config,
      }),
    [
      event,
      primaryLocationLabel,
      isPlotResultStale,
      catalogState.catalogVersion,
      catalogState.records.length,
      config,
    ]
  );

  useEffect(() => {
    onStage3FingerprintChange?.(currentStage3Fingerprint);
  }, [currentStage3Fingerprint, onStage3FingerprintChange]);

  const stage3Pkg: PrimerStage3Package | null =
    primer.extensions?.sequenceHistoricalAnalysis ?? null;

  const isStage3Stale = Boolean(
    stage3Pkg && stage3Pkg.provenance.inputFingerprint !== currentStage3Fingerprint
  );

  const aftershocksSection = primer.sections.find((s) => s.id === 'aftershocks') ?? null;

  const mainshockCandidates = useMemo(() => {
    return [...catalogState.records]
      .sort((a, b) => (b.magnitude ?? -1) - (a.magnitude ?? -1))
      .slice(0, 40);
  }, [catalogState.records]);

  const runStage3Analysis = (
    overrideConfig?: PrimerSequenceAnalysisConfig,
    overrideCatalog?: PrimerCatalogStateSnapshot,
    syncTextOptions?: { syncAftershocksSection?: boolean; forceOverwriteEdited?: boolean }
  ) => {
    if (readOnly) return;
    const activeCfg = overrideConfig ?? config;
    const activeCat = overrideCatalog ?? catalogState;
    const nextPkg = buildPrimerStage3Package({
      event,
      catalog: activeCat.records,
      catalogVersion: activeCat.catalogVersion,
      sourceLabel: activeCat.sourceLabel,
      config: {
        ...activeCfg,
        dataCutoffUtc: new Date().toISOString(),
      },
      primaryLocationLabel,
      isPlotResultStale,
      nearestCitiesPins,
    });

    const updatedPrimer = updatePrimerSequenceHistoricalAnalysis(primer, nextPkg, {
      syncAftershocksSection: syncTextOptions?.syncAftershocksSection ?? true,
      forceOverwriteEdited: syncTextOptions?.forceOverwriteEdited ?? false,
    });

    const actionMsg = syncTextOptions?.forceOverwriteEdited
      ? `Synced Stage 3 statistics and updated Section 3 (Aftershocks) text for ${event.id}`
      : `Generated Stage 3 Sequence & Historical analysis (${nextPkg.statistics.eligiblePostEventCount} post-event, ${nextPkg.historical.totalMatchingCount} historical)`;

    onUpdatePrimer(updatedPrimer, actionMsg);
  };

  const handleApplySavedInvestigation = (invId: string) => {
    if (readOnly) return;
    setSelectedInvestigationId(invId);
    if (!invId) {
      const resetCfg: PrimerSequenceAnalysisConfig = {
        ...config,
        nominatedMainshockRecordId: null,
        acceptedAftershockIds: [],
      };
      setConfig(resetCfg);
      runStage3Analysis(resetCfg);
      return;
    }

    const inv = savedInvestigations.find((item) => item.id === invId);
    if (!inv) return;
    const nextCfg: PrimerSequenceAnalysisConfig = {
      ...config,
      filters: { ...inv.filters },
      nominatedMainshockRecordId: inv.candidateMainshockId ?? null,
      acceptedAftershockIds: [...inv.includedEventIds],
    };
    setConfig(nextCfg);
    runStage3Analysis(nextCfg);
    onNotice?.(
      `Applied reviewed sequence "${inv.name}" (${inv.includedEventIds.length} accepted IDs)`
    );
  };

  const handleQueryUsgsFdsn = async () => {
    if (readOnly || isEventUnlocated(event) || usgsLoading) return;
    setUsgsLoading(true);
    setCatalogError(null);
    try {
      const refMs = Date.parse(`${event.originDateGmt}T${event.originTimeGmt}Z`);
      const anchorMs = Number.isFinite(refMs) ? refMs : Date.now();
      const lookbackMs = Math.max(1, config.historicalLookbackYears) * 365.25 * 86_400_000;
      const startIso = new Date(anchorMs - lookbackMs).toISOString();
      const endIso = new Date().toISOString();
      const radiusKm = Math.min(500, Math.max(config.filters.radiusKm, config.historicalRadiusKm));

      const snap = await queryUsgsFdsnCatalogAdapter({
        lat: event.lat,
        lon: event.lon,
        maxradiuskm: radiusKm,
        minmagnitude: Math.min(config.historicalMinMag, 2.5),
        starttime: startIso,
        endtime: endIso,
        limit: 1000,
      });
      setCatalogState(snap);
      runStage3Analysis(config, snap);
    } catch (err) {
      setCatalogError(
        err instanceof Error ? err.message : 'USGS FDSN event query failed.'
      );
    } finally {
      setUsgsLoading(false);
    }
  };

  const handleCatalogFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const isJson =
      file.name.toLowerCase().endsWith('.json') ||
      file.name.toLowerCase().endsWith('.geojson') ||
      text.trim().startsWith('{');
    setImportFormat(isJson ? 'geojson' : 'csv');
    setImportText(text);
    setShowCatalogDrawer(true);
    e.target.value = '';
  };

  const handleExecuteImport = async () => {
    if (!importText.trim() || importBusy) return;
    setImportBusy(true);
    setCatalogError(null);
    try {
      const snap = persistImportToShared
        ? await importCatalogToSharedEndpoint({
            content: importText,
            format: importFormat,
            defaultSource: importSourceLabel.trim() || 'Local Catalog Import',
            catalogVersion: importVersionLabel.trim() || 'local-v1',
            sourceReference: 'Primer Stage 3 Validated Import',
          })
        : validateAndMergeLocalCatalog({
            content: importText,
            format: importFormat,
            existingRecords: catalogState.records,
            existingCatalogVersion: catalogState.catalogVersion,
            defaultSource: importSourceLabel.trim() || 'Local Catalog Import',
            catalogVersionLabel: importVersionLabel.trim() || 'local-v1',
          });

      setCatalogState(snap);
      setImportText('');
      runStage3Analysis(config, snap);
    } catch (err) {
      setCatalogError(
        err instanceof Error ? err.message : 'Catalog validation/import failed.'
      );
    } finally {
      setImportBusy(false);
    }
  };

  const handleUpdateStage3Caption = (
    target: 'aftershockMap' | 'activityChart' | 'magnitudeChart' | 'historical',
    nextCaption: string
  ) => {
    if (readOnly || !stage3Pkg) return;
    const nextPkg: PrimerStage3Package =
      target === 'historical'
        ? {
            ...stage3Pkg,
            historical: {
              ...stage3Pkg.historical,
              caption: nextCaption,
            },
          }
        : {
            ...stage3Pkg,
            figures: {
              ...stage3Pkg.figures,
              [target]: {
                ...stage3Pkg.figures[target],
                caption: nextCaption,
              },
            },
          };

    onUpdatePrimer({
      ...primer,
      updatedAt: new Date().toISOString(),
      extensions: {
        ...(primer.extensions ?? {}),
        sequenceHistoricalAnalysis: nextPkg,
      },
    });
  };

  const renderFigurePreview = (
    key: 'aftershockMap' | 'activityChart' | 'magnitudeChart',
    fig: PrimerStage3FigureSvg,
    label: string
  ) => {
    if (fig.status === 'unavailable' || !fig.svgMarkup) {
      return (
        <div className="border border-rose-200 bg-rose-50 rounded-xs p-5 text-center space-y-1.5">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-900">
            <AlertTriangle className="w-4 h-4 text-rose-700" />
            <span>{label} Unavailable</span>
          </div>
          <p className="text-xs text-rose-800 max-w-xl mx-auto">
            {fig.unavailableReason || 'Insufficient catalog records for figure generation.'}
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-2.5">
        <div className="border border-slate-200 rounded-xs bg-white p-2 flex justify-center">
          <img
            src={svgToDataUri(fig.svgMarkup)}
            alt={fig.caption}
            className="w-full max-w-[760px] h-auto block"
          />
        </div>
        <div>
          <label
            htmlFor={`stage3-caption-${key}`}
            className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-600 mb-1"
          >
            Editable {label} Caption (Included in HTML &amp; PDF Export)
          </label>
          <input
            id={`stage3-caption-${key}`}
            type="text"
            value={fig.caption}
            disabled={readOnly}
            onChange={(e) => handleUpdateStage3Caption(key, e.target.value)}
            className="w-full px-3 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94] disabled:bg-slate-50 disabled:text-slate-600"
          />
        </div>
      </div>
    );
  };

  return (
    <section className="border border-slate-200 rounded-xs bg-white overflow-hidden">
      {/* Header Bar */}
      <div className="bg-slate-50 border-b border-slate-200 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <Database className="w-4 h-4 text-[#005a94] shrink-0" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            Aftershock Sequence &amp; Historical Seismicity (Stage 3)
          </h3>
          {stage3Pkg ? (
            <span
              className={`text-[10.5px] font-mono px-2 py-0.5 border rounded-xs whitespace-nowrap ${
                stage3Pkg.statistics.membershipBasis === 'unavailable'
                  ? 'bg-rose-50 text-rose-800 border-rose-200'
                  : isStage3Stale
                    ? 'bg-amber-50 text-amber-900 border-amber-300'
                    : stage3Pkg.statistics.membershipBasis === 'reviewed-sequence-membership'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-sky-50 text-sky-900 border-sky-200'
              }`}
            >
              {stage3Pkg.statistics.membershipBasis === 'unavailable'
                ? 'Catalog / Location Unavailable'
                : isStage3Stale
                  ? 'Analysis Stale'
                  : stage3Pkg.statistics.membershipBasis === 'reviewed-sequence-membership'
                    ? 'Reviewed Sequence'
                    : 'Candidate Window'}
            </span>
          ) : (
            <span className="text-[10.5px] font-mono px-2 py-0.5 border border-slate-300 bg-white text-slate-600 rounded-xs whitespace-nowrap">
              Not Attached Yet
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {!readOnly && (
            <>
              <button
                type="button"
                onClick={() => setShowCatalogDrawer((v) => !v)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xs border border-slate-300 bg-white text-[11px] font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap"
              >
                <Upload className="w-3 h-3" />
                <span>Catalog &amp; Adapters ({catalogState.records.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setShowFilters((v) => !v)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xs border border-slate-300 bg-white text-[11px] font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap"
              >
                <SlidersHorizontal className="w-3 h-3" />
                <span>Windows &amp; Filters</span>
              </button>

              <button
                type="button"
                onClick={() => runStage3Analysis()}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xs bg-[#005a94] text-white text-[11px] font-semibold hover:bg-[#004877] transition-colors whitespace-nowrap"
              >
                <RefreshCw className="w-3 h-3" />
                <span>{stage3Pkg ? 'Refresh Analysis & Figures' : 'Analyze Catalog & Figures'}</span>
              </button>
            </>
          )}
          {readOnly && (
            <span className="text-[10.5px] font-mono text-slate-500">
              Snapshot Read-Only View
            </span>
          )}
        </div>
      </div>

      {/* Stale Snapshot Banner */}
      {!readOnly && isStage3Stale && stage3Pkg && (
        <div className="bg-amber-50 border-b border-amber-300 px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-950">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              Active event, filters, or catalog version changed since this Stage 3 analysis was generated{' '}
              <span className="font-mono text-[11px]">
                (Snapshot {stage3Pkg.provenance.inputFingerprint.slice(0, 8)} ≠ Active{' '}
                {currentStage3Fingerprint.slice(0, 8)})
              </span>
              .
            </span>
          </div>
          <button
            type="button"
            onClick={() => runStage3Analysis()}
            className="px-2.5 py-1 rounded-xs border border-amber-400 bg-white text-amber-950 text-[11px] font-semibold hover:bg-amber-100 whitespace-nowrap"
          >
            Refresh Analysis Now
          </button>
        </div>
      )}

      {/* Catalog Error Banner */}
      {catalogError && (
        <div className="bg-rose-50 border-b border-rose-200 px-3.5 py-2 text-xs text-rose-900 flex items-center justify-between gap-2">
          <span>{catalogError}</span>
          <button
            type="button"
            onClick={() => setCatalogError(null)}
            className="text-[11px] font-semibold underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Compact Source Status Strip */}
      <div className="px-3.5 py-2 bg-slate-50/60 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>
            <strong className="text-slate-800">Catalog:</strong> {catalogState.sourceLabel} (
            <span className="font-mono tabular-nums">
              v{catalogState.catalogVersion}, {catalogState.records.length} events
            </span>
            )
          </span>
          {catalogState.coverage.earliestUtc && catalogState.coverage.latestUtc && (
            <span className="font-mono tabular-nums text-[10.5px]">
              Span: {catalogState.coverage.earliestUtc.slice(0, 10)} →{' '}
              {catalogState.coverage.latestUtc.slice(0, 10)}
            </span>
          )}
          <span className="font-mono tabular-nums text-[10.5px]">
            Missing depth: {catalogState.coverage.missingDepthCount} · Missing mag:{' '}
            {catalogState.coverage.missingMagnitudeCount}
          </span>
        </div>

        {!readOnly && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void loadSharedCatalogAndInvestigations(false)}
              disabled={catalogLoading}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xs border border-slate-300 bg-white text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60 whitespace-nowrap"
            >
              <FolderSync className="w-3 h-3" />
              <span>{catalogLoading ? 'Syncing...' : 'Sync Shared Catalog'}</span>
            </button>

            <button
              type="button"
              onClick={() => void handleQueryUsgsFdsn()}
              disabled={usgsLoading || isEventUnlocated(event)}
              title={
                isEventUnlocated(event)
                  ? 'Locate active event before querying FDSN radius'
                  : 'Query USGS FDSN Event API into shared catalog'
              }
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xs border border-slate-300 bg-white text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 whitespace-nowrap"
            >
              <Globe className="w-3 h-3" />
              <span>{usgsLoading ? 'Querying FDSN...' : 'Query USGS FDSN'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Collapsible Catalog Adapters & Validated Import Drawer */}
      {!readOnly && showCatalogDrawer && (
        <div className="border-b border-slate-200 bg-slate-50 p-3.5 space-y-3 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {CATALOG_SERVICE_ADAPTERS.map((adp) => (
              <div
                key={adp.id}
                className="border border-slate-200 bg-white rounded-xs p-2.5 space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900 text-[11.5px]">
                    {adp.name}
                  </span>
                  <span
                    className={`font-mono text-[10px] px-1.5 py-0.5 border rounded-xs whitespace-nowrap ${
                      adp.status === 'connected'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : adp.status === 'online-on-demand'
                          ? 'bg-sky-50 text-sky-800 border-sky-200'
                          : 'bg-slate-100 text-slate-600 border-slate-300'
                    }`}
                  >
                    {adp.status === 'connected'
                      ? 'Connected'
                      : adp.status === 'online-on-demand'
                        ? 'On-Demand'
                        : 'Unconfigured'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 leading-snug">{adp.description}</p>
                <p className="text-[10.5px] text-slate-500 italic leading-snug">
                  {adp.limitations[0]}
                </p>
              </div>
            ))}
          </div>

          <div className="border border-slate-200 bg-white rounded-xs p-3 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                <FileSpreadsheet className="w-3.5 h-3.5 text-[#005a94]" />
                <span>Validated Local CSV / GeoJSON Catalog Import</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt,.json,.geojson"
                  onChange={(e) => void handleCatalogFileUpload(e)}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2.5 py-1 rounded-xs border border-slate-300 bg-slate-50 text-[11px] font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap"
                >
                  Choose CSV / GeoJSON File
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div>
                <label className="block text-[10.5px] font-semibold text-slate-600 mb-1">
                  Format
                </label>
                <select
                  value={importFormat}
                  onChange={(e) => setImportFormat(e.target.value as 'csv' | 'geojson')}
                  className="w-full px-2 py-1 text-xs border border-slate-300 rounded-xs bg-white"
                >
                  <option value="csv">CSV Catalog</option>
                  <option value="geojson">GeoJSON FeatureCollection</option>
                </select>
              </div>
              <div>
                <label className="block text-[10.5px] font-semibold text-slate-600 mb-1">
                  Source Attribution
                </label>
                <input
                  type="text"
                  value={importSourceLabel}
                  onChange={(e) => setImportSourceLabel(e.target.value)}
                  className="w-full px-2 py-1 text-xs border border-slate-300 rounded-xs bg-white"
                />
              </div>
              <div>
                <label className="block text-[10.5px] font-semibold text-slate-600 mb-1">
                  Catalog Revision / Version
                </label>
                <input
                  type="text"
                  value={importVersionLabel}
                  onChange={(e) => setImportVersionLabel(e.target.value)}
                  className="w-full px-2 py-1 text-xs font-mono border border-slate-300 rounded-xs bg-white"
                />
              </div>
            </div>

            <textarea
              rows={4}
              placeholder="Paste CSV rows (event_id,time,latitude,longitude,depth,magnitude,mag_type,source,place) or GeoJSON FeatureCollection..."
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              className="w-full px-2.5 py-1.5 text-[11px] font-mono border border-slate-300 rounded-xs bg-white focus:outline-none focus:border-[#005a94]"
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-1.5 text-[11px] text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={persistImportToShared}
                  onChange={(e) => setPersistImportToShared(e.target.checked)}
                  className="accent-[#005a94]"
                />
                <span>Save validated records to shared EQP Research Historical Catalog</span>
              </label>
              <button
                type="button"
                disabled={!importText.trim() || importBusy}
                onClick={() => void handleExecuteImport()}
                className="px-3 py-1 rounded-xs bg-[#005a94] text-white text-[11px] font-semibold hover:bg-[#004877] disabled:opacity-50 whitespace-nowrap"
              >
                {importBusy ? 'Validating & Importing...' : 'Validate & Import Catalog'}
              </button>
            </div>

            {catalogState.lastImportAudit && (
              <div className="border-t border-slate-200 pt-2 text-[11px] font-mono text-slate-700 space-y-0.5">
                <div>
                  Last Audit ({catalogState.lastImportAudit.retrievedAtUtc}): Parsed{' '}
                  {catalogState.lastImportAudit.parsedCount} · Added{' '}
                  {catalogState.lastImportAudit.addedCount} · Exact duplicates skipped{' '}
                  {catalogState.lastImportAudit.exactDuplicates.length} · Uncertain duplicates{' '}
                  {catalogState.lastImportAudit.uncertainDuplicates.length} · Rejected rows{' '}
                  {catalogState.lastImportAudit.rejections.length}
                </div>
                {catalogState.lastImportAudit.warnings.length > 0 && (
                  <div className="text-amber-800">
                    Warnings: {catalogState.lastImportAudit.warnings.slice(0, 3).join(' · ')}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Anchor / Reviewed Sequence & Configurable Filter Drawer */}
      <div className="p-3.5 border-b border-slate-200 bg-white space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div>
            <label
              htmlFor="stage3-investigation-select"
              className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-600 mb-1"
            >
              Adopt Reviewed Sequence Investigation (Optional)
            </label>
            <select
              id="stage3-investigation-select"
              value={selectedInvestigationId}
              disabled={readOnly}
              onChange={(e) => handleApplySavedInvestigation(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94] disabled:bg-slate-50 disabled:text-slate-600"
            >
              <option value="">
                None — Spatiotemporal Candidate Window Around Active EQP Event
              </option>
              {savedInvestigations.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.name} ({inv.referenceEventId} · {inv.includedEventIds.length} reviewed IDs)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="stage3-mainshock-select"
              className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-600 mb-1"
            >
              Reference / Anchor Mainshock (Never Auto-Assumed)
            </label>
            <select
              id="stage3-mainshock-select"
              value={config.nominatedMainshockRecordId ?? ''}
              disabled={readOnly}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  nominatedMainshockRecordId: e.target.value || null,
                }))
              }
              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94] disabled:bg-slate-50 disabled:text-slate-600"
            >
              <option value="">
                Active EQP Reference Event Only ({event.id}) — Do Not Assume Mainshock
              </option>
              {mainshockCandidates.map((rec) => (
                <option key={rec.id} value={rec.id}>
                  {rec.eventId} · {rec.magnitudeType} {rec.magnitude?.toFixed(1) ?? 'N/A'} ·{' '}
                  {rec.originTimeUtc.slice(0, 19)}Z
                </option>
              ))}
            </select>
          </div>
        </div>

        {!readOnly && showFilters && (
          <div className="border border-slate-200 bg-slate-50 rounded-xs p-2.5 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5 text-xs">
            <div>
              <label className="block text-[10.5px] font-semibold text-slate-600 mb-1">
                Sequence Radius (km)
              </label>
              <input
                type="number"
                min={5}
                max={1000}
                value={config.filters.radiusKm}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    filters: {
                      ...prev.filters,
                      radiusKm: Math.max(5, Number(e.target.value) || 100),
                    },
                  }))
                }
                className="w-full px-2 py-1 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-xs"
              />
            </div>

            <div>
              <label className="block text-[10.5px] font-semibold text-slate-600 mb-1">
                Pre-Event (days)
              </label>
              <input
                type="number"
                min={0}
                max={365}
                value={config.filters.preDays}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    filters: {
                      ...prev.filters,
                      preDays: Math.max(0, Number(e.target.value) || 0),
                    },
                  }))
                }
                className="w-full px-2 py-1 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-xs"
              />
            </div>

            <div>
              <label className="block text-[10.5px] font-semibold text-slate-600 mb-1">
                Post-Event (days)
              </label>
              <input
                type="number"
                min={1}
                max={365}
                value={config.filters.postDays}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    filters: {
                      ...prev.filters,
                      postDays: Math.max(1, Number(e.target.value) || 30),
                    },
                  }))
                }
                className="w-full px-2 py-1 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-xs"
              />
            </div>

            <div>
              <label className="block text-[10.5px] font-semibold text-slate-600 mb-1">
                Hist Radius (km)
              </label>
              <input
                type="number"
                min={10}
                max={1000}
                value={config.historicalRadiusKm}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    historicalRadiusKm: Math.max(10, Number(e.target.value) || 150),
                  }))
                }
                className="w-full px-2 py-1 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-xs"
              />
            </div>

            <div>
              <label className="block text-[10.5px] font-semibold text-slate-600 mb-1">
                Hist Lookback (yr)
              </label>
              <input
                type="number"
                min={1}
                max={500}
                value={config.historicalLookbackYears}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    historicalLookbackYears: Math.max(1, Number(e.target.value) || 50),
                  }))
                }
                className="w-full px-2 py-1 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-xs"
              />
            </div>

            <div>
              <label className="block text-[10.5px] font-semibold text-slate-600 mb-1">
                Hist Min Mag
              </label>
              <input
                type="number"
                min={0}
                max={9.5}
                step={0.1}
                value={config.historicalMinMag}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    historicalMinMag: Math.max(0, Number(e.target.value) || 0),
                  }))
                }
                className="w-full px-2 py-1 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-xs"
              />
            </div>

            <div className="col-span-2 sm:col-span-4 lg:col-span-6 flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200">
              <label className="flex items-center gap-1.5 text-[11px] text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.filters.excludeDuplicates}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      filters: { ...prev.filters, excludeDuplicates: e.target.checked },
                    }))
                  }
                  className="accent-[#005a94]"
                />
                <span>Exclude exact cross-source catalog duplicates</span>
              </label>
              <button
                type="button"
                onClick={() => runStage3Analysis()}
                className="px-2.5 py-1 rounded-xs bg-[#005a94] text-white text-[11px] font-semibold hover:bg-[#004877] whitespace-nowrap"
              >
                Apply Filters &amp; Recompute
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Results View OR Initial Empty Prompt */}
      {!stage3Pkg ? (
        <div className="p-5 text-center space-y-2 bg-slate-50/40">
          <p className="text-xs text-slate-600 max-w-2xl mx-auto">
            Run Stage 3 analysis to generate verified sequence statistics, spatiotemporal distribution map (Figure 2), activity timeline (Figure 3), magnitude histogram (Figure 4), and historical background table (Table 1) from loaded catalog records.
          </p>
          <button
            type="button"
            onClick={() => runStage3Analysis()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xs bg-[#005a94] text-white text-xs font-semibold hover:bg-[#004877] whitespace-nowrap"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Generate Aftershock &amp; Historical Package</span>
          </button>
        </div>
      ) : (
        <div className="p-3.5 space-y-3">
          {/* Non-Destructive Sync Status Bar for Section 3 ("Aftershocks") */}
          {aftershocksSection && (
            <div className="flex flex-wrap items-center justify-between gap-2 border border-slate-200 bg-slate-50 rounded-xs px-3 py-2 text-[11px]">
              <div className="text-slate-700">
                <strong className="text-slate-900">Section 3 Narrative Sync:</strong>{' '}
                {aftershocksSection.isEdited
                  ? 'Section 3 contains manual edits — automatic sync is held to protect your prose.'
                  : 'Section 3 automatically reflects the current Stage 3 statistics.'}
              </div>
              <button
                type="button"
                onClick={() =>
                  runStage3Analysis(config, catalogState, {
                    syncAftershocksSection: true,
                    forceOverwriteEdited: true,
                  })
                }
                className="px-2.5 py-1 rounded-xs border border-[#005a94] bg-white text-[#005a94] font-semibold hover:bg-sky-50 whitespace-nowrap"
              >
                {aftershocksSection.isEdited
                  ? 'Sync Statistics to Section 3 Text'
                  : 'Refresh Section 3 Prose'}
              </button>
            </div>
          )}

          {/* Tab Strip */}
          <div
            className="flex flex-wrap items-center gap-1 border-b border-slate-200 pb-2"
            role="tablist"
            aria-label="Stage 3 analysis views"
          >
            {(
              [
                { id: 'stats', label: 'Statistics Summary', icon: Layers },
                { id: 'map', label: 'Fig 2: Sequence Map', icon: MapIcon },
                { id: 'timeline', label: 'Fig 3: Activity vs Time', icon: Clock },
                { id: 'magnitude', label: 'Fig 4: Mag Distribution', icon: BarChart3 },
                {
                  id: 'historical',
                  label: `Table 1: Historical (${stage3Pkg.historical.totalMatchingCount})`,
                  icon: Table2,
                },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xs border text-[11px] font-semibold whitespace-nowrap ${
                    isActive
                      ? 'bg-[#005a94] text-white border-[#005a94]'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {activeTab === 'stats' && (
            <div className="space-y-3">
              {/* Primary Telemetry Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="border border-slate-200 bg-slate-50 rounded-xs p-2.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    {stage3Pkg.statistics.scientificallyAcceptedAftershockCount !== null
                      ? 'Reviewed Aftershocks'
                      : 'Post-Event Candidates'}
                  </div>
                  <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                    {stage3Pkg.statistics.scientificallyAcceptedAftershockCount !== null
                      ? stage3Pkg.statistics.scientificallyAcceptedAftershockCount
                      : stage3Pkg.statistics.eligiblePostEventCount}
                  </div>
                  <div className="text-[10.5px] font-mono tabular-nums text-slate-600">
                    Eligible window: {stage3Pkg.statistics.eligiblePostEventCount}
                  </div>
                </div>

                <div className="border border-slate-200 bg-slate-50 rounded-xs p-2.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    +24h / +72h / +7d / +30d
                  </div>
                  <div className="text-sm font-bold font-mono tabular-nums text-slate-900 mt-1">
                    {stage3Pkg.statistics.countsByInterval.within24h} /{' '}
                    {stage3Pkg.statistics.countsByInterval.within72h} /{' '}
                    {stage3Pkg.statistics.countsByInterval.within7d} /{' '}
                    {stage3Pkg.statistics.countsByInterval.within30d}
                  </div>
                  <div className="text-[10.5px] font-mono tabular-nums text-slate-600">
                    Pre-event: {stage3Pkg.statistics.preEventCount} · Bg:{' '}
                    {stage3Pkg.statistics.backgroundCount}
                  </div>
                </div>

                <div className="border border-slate-200 bg-slate-50 rounded-xs p-2.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Largest Post-Event EQ
                  </div>
                  <div className="text-sm font-bold font-mono tabular-nums text-slate-900 mt-1">
                    {stage3Pkg.statistics.maxAftershock
                      ? `${stage3Pkg.statistics.maxAftershock.magnitudeType} ${stage3Pkg.statistics.maxAftershock.magnitude.toFixed(
                          1
                        )}`
                      : 'N/A'}
                  </div>
                  <div className="text-[10.5px] font-mono tabular-nums text-slate-600 truncate">
                    {stage3Pkg.statistics.maxAftershock
                      ? `${stage3Pkg.statistics.maxAftershock.eventId} (${stage3Pkg.statistics.maxAftershock.distanceKm.toFixed(
                          1
                        )} km)`
                      : 'No magnitude records'}
                  </div>
                </div>

                <div className="border border-slate-200 bg-slate-50 rounded-xs p-2.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Historical Regional (M≥{stage3Pkg.historical.minMag.toFixed(1)})
                  </div>
                  <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                    {stage3Pkg.historical.totalMatchingCount}
                  </div>
                  <div className="text-[10.5px] font-mono tabular-nums text-slate-600">
                    Within {stage3Pkg.historical.radiusKm} km ({stage3Pkg.historical.lookbackYears} yr)
                  </div>
                </div>
              </div>

              {/* Scale-separated magnitude & cutoff table */}
              <div className="border border-slate-200 rounded-xs p-2.5 text-[11px] text-slate-700 space-y-1.5 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-2 font-mono tabular-nums">
                  <span>
                    <strong>Cutoff (PST):</strong> {stage3Pkg.statistics.dataCutoffPst}
                  </span>
                  <span>
                    <strong>Cutoff (UTC):</strong> {stage3Pkg.statistics.dataCutoffUtc}
                  </span>
                  <span>
                    <strong>Elapsed:</strong> {stage3Pkg.statistics.elapsedLabel}
                  </span>
                </div>
                <div className="font-mono tabular-nums">
                  <strong>Magnitudes by Scale:</strong>{' '}
                  {stage3Pkg.statistics.magnitudesByScale.length > 0
                    ? stage3Pkg.statistics.magnitudesByScale
                        .map(
                          (m) =>
                            `${m.magType}: n=${m.count} (${m.min.toFixed(1)}–${m.max.toFixed(1)})`
                        )
                        .join(' | ')
                    : 'Unavailable'}
                </div>
                <div className="font-mono tabular-nums">
                  <strong>Data Quality &amp; Dedup:</strong> Exact duplicates excluded:{' '}
                  {stage3Pkg.statistics.exactDuplicateExcludedCount} · Uncertain duplicates
                  flagged: {stage3Pkg.statistics.uncertainDuplicateFlaggedCount} · Missing depth:{' '}
                  {stage3Pkg.statistics.incompleteMissingDepthCount} · Uncertain location:{' '}
                  {stage3Pkg.statistics.uncertainLocationCount}
                </div>
              </div>

              {/* Caveats & Limitations */}
              <div className="border border-slate-200 bg-slate-50 rounded-xs p-2.5 text-[11px] text-slate-600 space-y-1">
                <div className="font-bold text-slate-800 uppercase tracking-wider text-[10px]">
                  Provenance &amp; Methodological Limitations
                </div>
                <ul className="list-disc pl-4 space-y-0.5">
                  {stage3Pkg.provenance.limitations.map((lim) => (
                    <li key={lim}>{lim}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'map' &&
            renderFigurePreview(
              'aftershockMap',
              stage3Pkg.figures.aftershockMap,
              'Figure 2 (Sequence & Historical Distribution Map)'
            )}

          {activeTab === 'timeline' &&
            renderFigurePreview(
              'activityChart',
              stage3Pkg.figures.activityChart,
              'Figure 3 (Earthquake Activity vs. Time Chart)'
            )}

          {activeTab === 'magnitude' &&
            renderFigurePreview(
              'magnitudeChart',
              stage3Pkg.figures.magnitudeChart,
              'Figure 4 (Catalog Magnitude Distribution)'
            )}

          {activeTab === 'historical' && (
            <div className="space-y-2.5">
              {stage3Pkg.historical.status === 'unavailable' ? (
                <div className="border border-rose-200 bg-rose-50 rounded-xs p-4 text-xs text-rose-800">
                  <strong>Historical Regional Seismicity Unavailable:</strong>{' '}
                  {stage3Pkg.historical.unavailableReason}
                </div>
              ) : stage3Pkg.historical.rows.length === 0 ? (
                <div className="border border-slate-200 bg-slate-50 rounded-xs p-4 text-xs text-slate-600">
                  0 catalog records matched M ≥ {stage3Pkg.historical.minMag.toFixed(1)} within{' '}
                  {stage3Pkg.historical.radiusKm} km over the preceding{' '}
                  {stage3Pkg.historical.lookbackYears} year(s).
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-xs">
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-700">
                      <tr>
                        <th className="px-2.5 py-1.5 font-semibold">Event ID</th>
                        <th className="px-2.5 py-1.5 font-semibold">Origin (UTC / PST)</th>
                        <th className="px-2.5 py-1.5 font-semibold">Coordinates</th>
                        <th className="px-2.5 py-1.5 font-semibold">Depth</th>
                        <th className="px-2.5 py-1.5 font-semibold">Magnitude</th>
                        <th className="px-2.5 py-1.5 font-semibold">Distance</th>
                        <th className="px-2.5 py-1.5 font-semibold">Source / Ver</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {stage3Pkg.historical.rows.map((r) => (
                        <tr key={r.recordId} className="hover:bg-slate-50">
                          <td className="px-2.5 py-1.5 font-mono text-slate-900">
                            {r.eventId}
                          </td>
                          <td className="px-2.5 py-1.5 font-mono tabular-nums text-slate-800">
                            <div>{r.originTimeUtc}</div>
                            <div className="text-[10px] text-slate-500">{r.originTimePst}</div>
                          </td>
                          <td className="px-2.5 py-1.5 font-mono tabular-nums text-slate-800">
                            {r.lat.toFixed(2)}°N, {r.lon.toFixed(2)}°E
                          </td>
                          <td className="px-2.5 py-1.5 font-mono tabular-nums text-slate-800">
                            {r.depthKm !== null ? `${r.depthKm.toFixed(1)} km` : 'N/A'}
                          </td>
                          <td className="px-2.5 py-1.5 font-mono tabular-nums font-semibold text-slate-900">
                            {r.magnitude !== null
                              ? `${r.magnitudeType} ${r.magnitude.toFixed(1)}`
                              : 'N/A'}
                          </td>
                          <td className="px-2.5 py-1.5 font-mono tabular-nums text-slate-800">
                            {r.distanceKm.toFixed(1)} km
                          </td>
                          <td className="px-2.5 py-1.5 text-slate-700">
                            {r.dataSource} ({r.catalogVersion})
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div>
                <label
                  htmlFor="stage3-caption-historical"
                  className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-600 mb-1"
                >
                  Editable Table 1 Caption
                </label>
                <input
                  id="stage3-caption-historical"
                  type="text"
                  value={stage3Pkg.historical.caption}
                  disabled={readOnly}
                  onChange={(e) => handleUpdateStage3Caption('historical', e.target.value)}
                  className="w-full px-3 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94] disabled:bg-slate-50 disabled:text-slate-600"
                />
              </div>

              <div className="border border-slate-200 bg-slate-50 rounded-xs px-3 py-2 text-[11px] text-slate-600 italic">
                {stage3Pkg.historical.associationDisclaimer}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
